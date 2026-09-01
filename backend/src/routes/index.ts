import { Router } from 'express';
import { z } from 'zod';
import { schemas } from '@haalving/shared';

import * as auditController from '../controllers/audit.controller.js';
import * as authController from '../controllers/auth.controller.js';
import * as clientController from '../controllers/client.controller.js';
import * as digestController from '../controllers/digest.controller.js';
import * as followupController from '../controllers/followup.controller.js';
import * as arrivalController from '../controllers/arrival.controller.js';
import * as peopleController from '../controllers/people.controller.js';
import * as queueController from '../controllers/queue.controller.js';
import * as leaveController from '../controllers/leave.controller.js';
import * as configController from '../controllers/config.controller.js';
import * as catalogController from '../controllers/catalog.controller.js';
import * as communityController from '../controllers/community.controller.js';
import * as scheduleController from '../controllers/schedule.controller.js';
import * as homeController from '../controllers/home.controller.js';
import * as roleController from '../controllers/role.controller.js';
import * as userController from '../controllers/user.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { staffOnly, clientOnly } from '../middleware/audience.js';
import { requireNav, requirePerm } from '../middleware/authorize.js';
import { loginLimiter, otpRequestLimiter, otpVerifyLimiter } from '../middleware/rateLimit.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * The API, mounted under /api/v1.
 *
 * THE REQUEST FLOW IS ALWAYS THE SAME, and it is written out on every route so
 * a missing step is visible in the diff rather than hidden in a helper:
 *
 *     validate -> authenticate -> audience -> authorize -> controller -> service
 *
 * `validate` comes first on purpose. A malformed body should be answered 400
 * before the database is touched, and a rate limiter that keys on `body.phone`
 * needs that field to have been normalised — otherwise "+91 98470 22110" and
 * "9847022110" are two buckets for one number.
 */
const router: Router = Router();

const idParam = z.object({ id: z.string().min(1) });

/* ------------------------------------------------------------------ auth */

const auth: Router = Router();

auth.post(
  '/staff/login',
  validateBody(schemas.staffLoginSchema),
  loginLimiter,
  asyncHandler(authController.staffLogin),
);

auth.post(
  '/client/otp/request',
  validateBody(schemas.otpRequestSchema),
  otpRequestLimiter,
  asyncHandler(authController.requestOtp),
);

auth.post(
  '/client/otp/verify',
  validateBody(schemas.otpVerifySchema),
  otpVerifyLimiter,
  asyncHandler(authController.verifyOtp),
);

auth.post('/refresh', validateBody(schemas.refreshSchema), asyncHandler(authController.refresh));
auth.post('/logout', validateBody(schemas.refreshSchema), asyncHandler(authController.logout));

router.use('/auth', auth);

/** The signed-in person and their role definition. Both shells call it on boot. */
router.get('/me', authenticate, asyncHandler(authController.me));

/* ----------------------------------------------------------------- roles */

/* the People & Access controller, not the Day 1 one: it adds the HEADCOUNT each
   role card shows, and two handlers for one path would mean the first wins and
   the other silently never runs */
router.get('/roles', authenticate, staffOnly, asyncHandler(peopleController.listRoles));

router.patch(
  '/roles/:key',
  validateParams(z.object({ key: z.string().min(1) })),
  validateBody(
    z.object({
      title: z.string().trim().min(1).max(120).optional(),
      nav: z.array(z.string()).optional(),
      perms: z.array(z.string()).optional(),
    }),
  ),
  authenticate,
  staffOnly,
  /* managePeople, NOT manageConfig: this route edits the ACCESS MATRIX, and Ops
     Head holds manageConfig — leaving it there would have let a read-only seat
     rename roles and move permissions. */
  requirePerm('managePeople'),
  asyncHandler(roleController.update),
);

/* ----------------------------------------------------------------- users */

/**
 * The staff directory sits behind the People & Access SIDEBAR ITEM, not behind
 * `managePeople` — because console access IS nav membership, and an HoD holds
 * `people` in their nav without holding the permission to create anyone. Reading
 * the bench and editing it are two different rights.
 */
router.get(
  '/users',
  validateQuery(schemas.listUsersQuery),
  authenticate,
  staffOnly,
  requireNav('people'),
  asyncHandler(userController.list),
);

router.get(
  '/users/:id',
  validateParams(idParam),
  authenticate,
  staffOnly,
  requireNav('people'),
  asyncHandler(userController.get),
);

router.post(
  '/users',
  validateBody(schemas.createUserSchema),
  authenticate,
  staffOnly,
  requirePerm('managePeople'),
  asyncHandler(userController.create),
);

router.patch(
  '/users/:id',
  validateParams(idParam),
  validateBody(schemas.updateUserSchema),
  authenticate,
  staffOnly,
  requirePerm('managePeople'),
  asyncHandler(userController.update),
);

router.patch(
  '/users/:id/role',
  validateParams(idParam),
  validateBody(schemas.changeRoleSchema),
  authenticate,
  staffOnly,
  requirePerm('managePeople'),
  asyncHandler(userController.changeRole),
);

router.patch(
  '/users/:id/availability',
  validateParams(idParam),
  validateBody(schemas.updateAvailabilitySchema),
  authenticate,
  staffOnly,
  requirePerm('managePeople'),
  asyncHandler(userController.updateAvailability),
);

/**
 * Capacity. `allocate` rather than `managePeople`: the people who place clients
 * on coaches are the ones who need to say what a coach can carry, and that is a
 * wider set than the ones who create accounts. Going PAST a declared ceiling
 * needs `overrideCapacity`, which the service checks — the two rights are
 * genuinely different decisions.
 */
router.patch(
  '/users/:id/capacity',
  validateParams(idParam),
  validateBody(schemas.updateCapacitySchema.extend({ reason: z.string().trim().min(3).max(500).optional() })),
  authenticate,
  staffOnly,
  requirePerm('allocate'),
  asyncHandler(userController.updateCapacity),
);

/* --------------------------------------------------------------- clients */

/**
 * No permission gate on the client list — the SCOPE is the gate. A coach and a
 * Super Admin both call this route; one gets six clients and the other gets
 * every one, and neither can widen their own answer.
 */
router.get(
  '/clients',
  validateQuery(schemas.listClientsQuery),
  authenticate,
  staffOnly,
  requireNav('clients'),
  asyncHandler(clientController.list),
);

router.get(
  '/clients/:id',
  validateParams(idParam),
  authenticate,
  staffOnly,
  requireNav('clients'),
  asyncHandler(clientController.get),
);

router.put(
  '/clients/:id/pod/:pillarKey',
  validateParams(idParam.merge(schemas.podSeatParam)),
  validateBody(schemas.assignPodSeatSchema),
  authenticate,
  staffOnly,
  requirePerm('assignPod'),
  asyncHandler(clientController.assignPodSeat),
);

/* -------------------------------------------------------------- arrivals */

/**
 * Onboarding — the twelve steps an arrival walks before becoming a client.
 *
 * ONBOARDING IS THE SUPER ADMIN'S DESK. Every route here — the board, the record,
 * every step verb and promote — needs `ownsOnboarding`, which `@haalving/shared`
 * grants to `admin` and to nobody else. This is a deliberate departure from the
 * demo, which put ten roles on the board; see the note beside the permission.
 *
 * THE GATE IS STILL IN THE SERVICE for anything naming an arrival. A refusal has
 * to write a DENIED event against THAT ARRIVAL as well as an AuditLog row, because
 * the console tells the person "This attempt was logged" and a reviewer reads that
 * history on the record itself. Route middleware refuses before the service can
 * reach the record, so a `requirePerm` on `/arrivals/:id/...` would trade the
 * richer of the two records for a redundant check. `canRun` is one test every verb
 * funnels through, so there is no route that can forget it.
 *
 * The two routes that name NO arrival are the exception, and they carry the
 * permission as well: there is no ArrivalEvent to lose, so the check is free, and
 * the board listing is the thing most likely to be probed directly.
 */

router.get(
  '/arrivals',
  authenticate,
  staffOnly,
  requireNav('clients'),
  requirePerm('ownsOnboarding'),
  asyncHandler(arrivalController.list),
);

router.post(
  '/arrivals',
  validateBody(schemas.createArrivalSchema),
  authenticate,
  staffOnly,
  requireNav('clients'),
  requirePerm('ownsOnboarding'),
  asyncHandler(arrivalController.create),
);

router.get(
  '/arrivals/:id',
  validateParams(idParam),
  authenticate,
  staffOnly,
  requireNav('clients'),
  asyncHandler(arrivalController.get),
);

router.patch(
  '/arrivals/:id',
  validateParams(idParam),
  validateBody(schemas.updateArrivalSchema),
  authenticate,
  staffOnly,
  requireNav('clients'),
  asyncHandler(arrivalController.update),
);

router.post(
  '/arrivals/:id/ticks',
  validateParams(idParam),
  validateBody(schemas.tickSchema),
  authenticate,
  staffOnly,
  requireNav('clients'),
  asyncHandler(arrivalController.tick),
);

router.post(
  '/arrivals/:id/close-step',
  validateParams(idParam),
  authenticate,
  staffOnly,
  requireNav('clients'),
  asyncHandler(arrivalController.closeStep),
);

router.post(
  '/arrivals/:id/step-back',
  validateParams(idParam),
  authenticate,
  staffOnly,
  requireNav('clients'),
  asyncHandler(arrivalController.stepBack),
);

router.post(
  '/arrivals/:id/allocate',
  validateParams(idParam),
  validateBody(schemas.allocateSchema),
  authenticate,
  staffOnly,
  requireNav('clients'),
  asyncHandler(arrivalController.allocate),
);

router.post(
  '/arrivals/:id/inbody',
  validateParams(idParam),
  validateBody(schemas.inbodySchema),
  authenticate,
  staffOnly,
  requireNav('clients'),
  asyncHandler(arrivalController.inbody),
);

router.post(
  '/arrivals/:id/welcome',
  validateParams(idParam),
  validateBody(schemas.welcomeSchema),
  authenticate,
  staffOnly,
  requireNav('clients'),
  asyncHandler(arrivalController.welcome),
);

/** The only route in the console that mints a client. */
router.post(
  '/arrivals/:id/promote',
  validateParams(idParam),
  authenticate,
  staffOnly,
  requireNav('clients'),
  asyncHandler(arrivalController.promote),
);

/* ------------------------------------------------------------- catalog */

/**
 * Five item libraries, and the templates built out of them.
 *
 * READING is the nav gate — every coach browses every library, because a fitness
 * coach reading a yoga asana is how a pod stays one team. AUTHORING is decided in
 * the SERVICE, per library: a pillar coach owns their own aisle and
 * `editAnyCatalog` opens all five. That is finer than a route can express, and
 * every refusal writes its own audit row.
 */

/* ─────────────────────────────────────────────────── a client's care circle */

/**
 * Both lanes of a client's room hang off the client, not off a /circle root.
 *
 * The scope that decides who may read a room IS the client scope, and a
 * top-level route would have to re-derive it from a message id — which means a
 * second copy of the rule that already lives in `clientService.get`.
 */
router.get(
  '/clients/:id/circle',
  validateParams(idParam),
  authenticate,
  staffOnly,
  requireNav('clients'),
  asyncHandler(clientController.circle),
);

router.post(
  '/clients/:id/circle',
  validateParams(idParam),
  validateBody(
    z.object({
      text: z.string().trim().min(1, 'Write something first.').max(4000),
      teamOnly: z.boolean().optional(),
    }),
  ),
  authenticate,
  staffOnly,
  requireNav('clients'),
  asyncHandler(clientController.postCircle),
);

router.get(
  '/catalog',
  authenticate,
  staffOnly,
  requireNav('catalog'),
  asyncHandler(catalogController.read),
);

router.post(
  '/catalog/items',
  validateBody(schemas.createCatalogItemSchema),
  authenticate,
  staffOnly,
  requireNav('catalog'),
  asyncHandler(catalogController.createItem),
);

router.patch(
  '/catalog/items/:id',
  validateParams(idParam),
  validateBody(schemas.updateCatalogItemSchema),
  authenticate,
  staffOnly,
  requireNav('catalog'),
  asyncHandler(catalogController.updateItem),
);

/** Archived, never deleted — a template or a client plan may already name it. */
router.post(
  '/catalog/items/:id/archive',
  validateParams(idParam),
  validateBody(schemas.archiveCatalogItemSchema),
  authenticate,
  staffOnly,
  requireNav('catalog'),
  asyncHandler(catalogController.archiveItem),
);

router.post(
  '/catalog/templates',
  validateBody(schemas.createTemplateSchema),
  authenticate,
  staffOnly,
  requireNav('catalog'),
  asyncHandler(catalogController.createTemplate),
);

router.patch(
  '/catalog/templates/:id',
  validateParams(idParam),
  validateBody(schemas.updateTemplateSchema),
  authenticate,
  staffOnly,
  requireNav('catalog'),
  asyncHandler(catalogController.updateTemplate),
);

router.delete(
  '/catalog/templates/:id',
  validateParams(idParam),
  authenticate,
  staffOnly,
  requireNav('catalog'),
  asyncHandler(catalogController.deleteTemplate),
);

router.post(
  '/catalog/templates/:id/publish',
  validateParams(idParam),
  validateBody(schemas.publishTemplateSchema),
  authenticate,
  staffOnly,
  requireNav('catalog'),
  asyncHandler(catalogController.publishTemplate),
);

/* -------------------------------------------------------- configuration */

/**
 * The page where Ops changes the numbers every other module reads.
 *
 * READING is gated by the nav item — Super User carries it and sees the page
 * read-only. WRITING needs `manageConfig`, checked in the SERVICE so every refusal
 * writes the audit row the toast promises ("This attempt was logged"). A
 * requirePerm here would refuse correctly and record nothing.
 */

router.get('/config', authenticate, staffOnly, requireNav('config'), asyncHandler(configController.read));

router.get('/config/plans', authenticate, staffOnly, requireNav('config'), asyncHandler(configController.plans));

router.put(
  '/config/program',
  validateBody(schemas.programShapeSchema),
  authenticate,
  staffOnly,
  requireNav('config'),
  asyncHandler(configController.setProgram),
);

router.patch(
  '/config/service',
  validateBody(schemas.serviceConfigSchema),
  authenticate,
  staffOnly,
  requireNav('config'),
  asyncHandler(configController.setService),
);

router.put(
  '/config/chains/:kind',
  validateParams(z.object({ kind: schemas.chainKindEnum })),
  validateBody(schemas.setChainSchema),
  authenticate,
  staffOnly,
  requireNav('config'),
  asyncHandler(configController.setChain),
);

router.post(
  '/config/notifications',
  validateBody(schemas.createNotifRuleSchema),
  authenticate,
  staffOnly,
  requireNav('config'),
  asyncHandler(configController.createNotifRule),
);

router.patch(
  '/config/notifications/:id',
  validateParams(idParam),
  validateBody(schemas.updateNotifRuleSchema),
  authenticate,
  staffOnly,
  requireNav('config'),
  asyncHandler(configController.updateNotifRule),
);

router.delete(
  '/config/notifications/:id',
  validateParams(idParam),
  authenticate,
  staffOnly,
  requireNav('config'),
  asyncHandler(configController.deleteNotifRule),
);

router.post(
  '/config/flows',
  validateBody(schemas.createFlowSchema),
  authenticate,
  staffOnly,
  requireNav('config'),
  asyncHandler(configController.createFlow),
);

router.patch(
  '/config/flows/:id',
  validateParams(idParam),
  validateBody(schemas.updateFlowSchema),
  authenticate,
  staffOnly,
  requireNav('config'),
  asyncHandler(configController.updateFlow),
);

router.delete(
  '/config/flows/:id',
  validateParams(idParam),
  authenticate,
  staffOnly,
  requireNav('config'),
  asyncHandler(configController.deleteFlow),
);

router.post(
  '/config/flows/:id/steps',
  validateParams(idParam),
  validateBody(schemas.flowStepSchema),
  authenticate,
  staffOnly,
  requireNav('config'),
  asyncHandler(configController.addStep),
);

router.patch(
  '/config/flows/:id/steps/:stepId',
  validateParams(z.object({ id: z.string().min(1), stepId: z.string().min(1) })),
  validateBody(schemas.flowStepSchema.partial()),
  authenticate,
  staffOnly,
  requireNav('config'),
  asyncHandler(configController.updateStep),
);

router.delete(
  '/config/flows/:id/steps/:stepId',
  validateParams(z.object({ id: z.string().min(1), stepId: z.string().min(1) })),
  authenticate,
  staffOnly,
  requireNav('config'),
  asyncHandler(configController.deleteStep),
);

router.post(
  '/config/categories',
  validateBody(schemas.createCategorySchema),
  authenticate,
  staffOnly,
  requireNav('config'),
  asyncHandler(configController.createCategory),
);

router.patch(
  '/config/categories/:key',
  validateParams(z.object({ key: z.string().min(1) })),
  validateBody(schemas.renameCategorySchema),
  authenticate,
  staffOnly,
  requireNav('config'),
  asyncHandler(configController.renameCategory),
);

router.delete(
  '/config/categories/:key',
  validateParams(z.object({ key: z.string().min(1) })),
  authenticate,
  staffOnly,
  requireNav('config'),
  asyncHandler(configController.deleteCategory),
);

router.post(
  '/config/tags',
  validateBody(schemas.createTagSchema),
  authenticate,
  staffOnly,
  requireNav('config'),
  asyncHandler(configController.createTag),
);

router.delete(
  '/config/tags/:id',
  validateParams(idParam),
  authenticate,
  staffOnly,
  requireNav('config'),
  asyncHandler(configController.deleteTag),
);

/* --------------------------------------------------------- time & cover */

/**
 * The team's clock.
 *
 * Availability and My leave are open to every staff seat — everybody has a week
 * and everybody can need a break. The Team and Approvals gates are decided in the
 * SERVICE, because both depend on the applicant's department as well as the
 * caller's role, and because every refusal has to write the audit row the lock
 * screen promises.
 */

router.get('/availability/me', authenticate, staffOnly, asyncHandler(leaveController.getMyAvailability));

router.put(
  '/availability/me',
  validateBody(schemas.availability),
  authenticate,
  staffOnly,
  asyncHandler(leaveController.putAvailability),
);

router.put(
  '/availability/:staffId',
  validateParams(z.object({ staffId: z.string().min(1) })),
  validateBody(schemas.availability),
  authenticate,
  staffOnly,
  asyncHandler(leaveController.putAvailability),
);

router.get('/leave/mine', authenticate, staffOnly, requireNav('leave'), asyncHandler(leaveController.mine));

router.post(
  '/leave',
  validateBody(schemas.applyLeaveSchema),
  authenticate,
  staffOnly,
  requireNav('leave'),
  asyncHandler(leaveController.apply),
);

router.post(
  '/leave/:id/withdraw',
  validateParams(idParam),
  authenticate,
  staffOnly,
  requireNav('leave'),
  asyncHandler(leaveController.withdraw),
);

router.post(
  '/leave/:id/respond',
  validateParams(idParam),
  validateBody(schemas.respondCoverSchema),
  authenticate,
  staffOnly,
  requireNav('leave'),
  asyncHandler(leaveController.respond),
);

router.get('/leave/team', authenticate, staffOnly, requireNav('leave'), asyncHandler(leaveController.team));

router.get(
  '/leave/approvals',
  authenticate,
  staffOnly,
  requireNav('leave'),
  asyncHandler(leaveController.approvals),
);

router.get('/leave/config', authenticate, staffOnly, asyncHandler(leaveController.getConfig));

router.patch(
  '/leave/config',
  validateBody(schemas.leaveConfigSchema),
  authenticate,
  staffOnly,
  asyncHandler(leaveController.setConfig),
);

router.get(
  '/leave/:id/board',
  validateParams(idParam),
  authenticate,
  staffOnly,
  requireNav('leave'),
  asyncHandler(leaveController.board),
);

router.post(
  '/leave/:id/plan',
  validateParams(idParam),
  validateBody(schemas.planCoverSchema),
  authenticate,
  staffOnly,
  requireNav('leave'),
  asyncHandler(leaveController.plan),
);

router.post(
  '/leave/:id/approve',
  validateParams(idParam),
  authenticate,
  staffOnly,
  requireNav('leave'),
  asyncHandler(leaveController.approve),
);

router.post(
  '/leave/:id/decline',
  validateParams(idParam),
  validateBody(schemas.declineLeaveSchema),
  authenticate,
  staffOnly,
  requireNav('leave'),
  asyncHandler(leaveController.decline),
);

/* ------------------------------------------------------- people & access */

/**
 * The page's four tabs.
 *
 * READING is gated by the nav item, WRITING by `managePeople` — which is checked
 * in the SERVICE rather than with requirePerm, because every refusal has to write
 * the audit row the console promises ("This attempt was logged"). A requirePerm
 * would refuse correctly and record nothing.
 *
 * Ops Head and Super User carry the nav and therefore read the whole page; they
 * simply cannot change any of it.
 *
 * The staff list itself still lives at /users, where Day 1 put it. This is the
 * richer read the page needs — derived tags, allocation counts, and the redaction
 * that keeps a memo away from anybody without managePeople.
 */

router.get(
  '/people/staff',
  authenticate,
  staffOnly,
  requireNav('people'),
  asyncHandler(peopleController.listStaff),
);

router.get(
  '/people/staff/:id',
  validateParams(idParam),
  authenticate,
  staffOnly,
  requireNav('people'),
  asyncHandler(peopleController.getStaff),
);

router.get(
  '/people/headcount',
  authenticate,
  staffOnly,
  requireNav('people'),
  asyncHandler(peopleController.headcount),
);

router.post(
  '/people/staff/:id/deactivate',
  validateParams(idParam),
  authenticate,
  staffOnly,
  requireNav('people'),
  asyncHandler(peopleController.deactivate),
);

router.post(
  '/people/staff/:id/reactivate',
  validateParams(idParam),
  authenticate,
  staffOnly,
  requireNav('people'),
  asyncHandler(peopleController.reactivate),
);

/* ---- roles & permissions ---- */

/*
 * RENAMING a role goes through the Day 1 route above (`PATCH /roles/:key`), which
 * already takes `{ title }`. A second handler on the same path would never run —
 * Express matches the first — and would have quietly left role edits on the older
 * route's permission.
 */

router.post(
  '/roles/:key/nav',
  validateParams(z.object({ key: z.string().min(1) })),
  validateBody(schemas.toggleNavSchema),
  authenticate,
  staffOnly,
  requirePerm('managePeople'),
  asyncHandler(peopleController.toggleNav),
);

router.post(
  '/roles/:key/perm',
  validateParams(z.object({ key: z.string().min(1) })),
  validateBody(schemas.togglePermSchema),
  authenticate,
  staffOnly,
  requirePerm('managePeople'),
  asyncHandler(peopleController.togglePerm),
);

router.post(
  '/roles',
  validateBody(schemas.createRoleSchema),
  authenticate,
  staffOnly,
  requirePerm('managePeople'),
  asyncHandler(peopleController.createRole),
);

/* ---- capacity ---- */

router.get(
  '/people/capacity',
  authenticate,
  staffOnly,
  requireNav('people'),
  asyncHandler(peopleController.listCapacity),
);

router.patch(
  '/people/capacity/:staffId',
  validateParams(z.object({ staffId: z.string().min(1) })),
  validateBody(schemas.setCapSchema),
  authenticate,
  staffOnly,
  requireNav('people'),
  asyncHandler(peopleController.setCap),
);

/* ---- announcements ---- */

/** Everyone with the nav READS the feed; posting needs `broadcast`. */
router.get(
  '/people/feed',
  authenticate,
  staffOnly,
  requireNav('people'),
  asyncHandler(peopleController.listFeed),
);

router.post(
  '/people/feed',
  validateBody(schemas.createPostSchema),
  authenticate,
  staffOnly,
  requireNav('people'),
  asyncHandler(peopleController.post),
);

router.post(
  '/people/feed/seen',
  authenticate,
  staffOnly,
  requireNav('people'),
  asyncHandler(peopleController.markSeen),
);

/* -------------------------------------------------------------- schedule */

/**
 * The team's working calendar.
 *
 * The nav gate is `schedule`; everything finer is decided in the service, because
 * the interesting rules are not "may this role reach this URL" but "may this
 * person move THIS task" and "does this hour already belong to somebody". A
 * requirePerm here would answer the first question and none of the rest.
 *
 * The LENS is narrowed server-side too: a non-allocator asking for somebody
 * else's week is answered with their own. That is rule 5, and it is not a UI
 * preference — it is who may see whose hours.
 */

router.get(
  '/schedule',
  validateQuery(schemas.scheduleQuery),
  authenticate,
  staffOnly,
  requireNav('schedule'),
  asyncHandler(scheduleController.list),
);

router.get(
  '/schedule/groups',
  authenticate,
  staffOnly,
  requireNav('schedule'),
  asyncHandler(scheduleController.listGroups),
);

/** `?dryRun=1` answers "would this be refused" without writing anything. */
router.post(
  '/schedule/tasks',
  validateBody(schemas.createTaskSchema),
  authenticate,
  staffOnly,
  requireNav('schedule'),
  asyncHandler(scheduleController.create),
);

router.patch(
  '/schedule/tasks/:id',
  validateParams(idParam),
  validateBody(schemas.updateTaskSchema),
  authenticate,
  staffOnly,
  requireNav('schedule'),
  asyncHandler(scheduleController.edit),
);

/** Both drag gestures land here — in-day is a time change, cross-day a move. */
router.post(
  '/schedule/tasks/:id/move',
  validateParams(idParam),
  validateBody(schemas.moveTaskSchema),
  authenticate,
  staffOnly,
  requireNav('schedule'),
  asyncHandler(scheduleController.move),
);

router.delete(
  '/schedule/tasks/:id',
  validateParams(idParam),
  validateQuery(schemas.deleteTaskQuery),
  authenticate,
  staffOnly,
  requireNav('schedule'),
  asyncHandler(scheduleController.remove),
);

router.post(
  '/schedule/tasks/:id/done',
  validateParams(idParam),
  validateBody(schemas.taskDoneSchema),
  authenticate,
  staffOnly,
  requireNav('schedule'),
  asyncHandler(scheduleController.setDone),
);

router.post(
  '/schedule/tasks/:id/respond',
  validateParams(idParam),
  validateBody(schemas.respondSchema),
  authenticate,
  staffOnly,
  requireNav('schedule'),
  asyncHandler(scheduleController.respond),
);

router.post(
  '/schedule/tasks/:id/propose',
  validateParams(idParam),
  validateBody(schemas.proposeSchema),
  authenticate,
  staffOnly,
  requireNav('schedule'),
  asyncHandler(scheduleController.propose),
);

router.post(
  '/schedule/proposals/:id/apply',
  validateParams(idParam),
  authenticate,
  staffOnly,
  requireNav('schedule'),
  asyncHandler(scheduleController.applyProposal),
);

router.post(
  '/schedule/tasks/:id/shift',
  validateParams(idParam),
  validateBody(schemas.shiftSeriesSchema),
  authenticate,
  staffOnly,
  requireNav('schedule'),
  asyncHandler(scheduleController.shift),
);

/* ------------------------------------------------------------------ home */

router.get('/home/summary', authenticate, staffOnly, asyncHandler(homeController.summary));

/**
 * The Attention tab — today's digest, scoped.
 *
 * No permission gate beyond the Home nav item: the SCOPE is the gate, exactly as
 * on /clients. A coach and a Super Admin both call this; one gets six lines and
 * the other gets the lines about their own people, and neither can widen it.
 */
router.get(
  '/home/attention',
  authenticate,
  staffOnly,
  requireNav('home'),
  asyncHandler(digestController.attention),
);

/**
 * Stamp a tab as seen. The caller is the person being recorded — taken from the
 * token, never the body — so nobody can mark somebody else's tab read.
 */
router.post(
  '/home/seen',
  validateBody(schemas.markSeenSchema),
  authenticate,
  staffOnly,
  asyncHandler(digestController.markSeen),
);

/* ------------------------------------------------------------ follow-ups */

/**
 * The drafted nudges on Home.
 *
 * Every route is behind `requireNav('home')` — the tab lives on Home and a seat
 * that cannot see Home has no business reading what was drafted about its
 * clients. The scope, the approval rule and the refusal that a coach may not
 * SEND a coach-written follow-up all live in the service, where the refusal can
 * also be logged.
 *
 * NOTHING HERE POSTS AS THE AI. `circle.service.postMessage` is the only writer
 * of a CircleMessage, and every send through these routes records the human who
 * pressed the button.
 */

router.get(
  '/followups',
  authenticate,
  staffOnly,
  requireNav('home'),
  asyncHandler(followupController.list),
);

router.post(
  '/followups',
  validateBody(schemas.createFollowupSchema),
  authenticate,
  staffOnly,
  requireNav('home'),
  asyncHandler(followupController.create),
);

router.patch(
  '/followups/:id',
  validateParams(idParam),
  validateBody(schemas.editFollowupSchema),
  authenticate,
  staffOnly,
  requireNav('home'),
  asyncHandler(followupController.edit),
);

router.delete(
  '/followups/:id',
  validateParams(idParam),
  authenticate,
  staffOnly,
  requireNav('home'),
  asyncHandler(followupController.remove),
);

/* the send — the only door a draft becomes a message through */
router.post(
  '/followups/:id/send',
  validateParams(idParam),
  authenticate,
  staffOnly,
  requireNav('home'),
  asyncHandler(followupController.send),
);

router.post(
  '/followups/:id/approve',
  validateParams(idParam),
  validateBody(schemas.approveFollowupSchema),
  authenticate,
  staffOnly,
  requireNav('home'),
  asyncHandler(followupController.approve),
);

/* a return never travels empty-handed — the note is required by the schema */
router.post(
  '/followups/:id/return',
  validateParams(idParam),
  validateBody(schemas.returnFollowupSchema),
  authenticate,
  staffOnly,
  requireNav('home'),
  asyncHandler(followupController.returnDraft),
);

router.post(
  '/followups/:id/resubmit',
  validateParams(idParam),
  authenticate,
  staffOnly,
  requireNav('home'),
  asyncHandler(followupController.resubmit),
);

/* a dismissal states WHY, from a closed list — the drafter learns from it */
router.post(
  '/followups/:id/dismiss',
  validateParams(idParam),
  validateBody(schemas.dismissFollowupSchema),
  authenticate,
  staffOnly,
  requireNav('home'),
  asyncHandler(followupController.dismiss),
);

router.post(
  '/followups/send-all',
  validateBody(schemas.sendAllFollowupsSchema),
  authenticate,
  staffOnly,
  requireNav('home'),
  asyncHandler(followupController.sendAll),
);

/* --------------------------------------------------------- work queues */

/**
 * The six SLA-bound boards, behind one nav gate.
 *
 * `requireNav('queues')` is all a route asserts, and it is the same gate the
 * demo's host uses ("access to the route itself is the nav gate, not a roles
 * array here — individual boards still gate themselves", console-queues.js:5).
 * WHICH BOARD a caller may see, whose signature is next, whether a rating carries
 * the note it owes and whether a summary may be signed are all decided in the
 * SERVICE, for two reasons: they depend on the row as much as on the role, and
 * every refusal has to write the audit line the screens promise ("This access
 * attempt was logged"). A requirePerm here would refuse correctly and record
 * nothing.
 */

router.get(
  '/queues',
  authenticate,
  staffOnly,
  requireNav('queues'),
  asyncHandler(queueController.boards),
);

router.get(
  '/queues/worklist',
  validateQuery(schemas.worklistQuery),
  authenticate,
  staffOnly,
  requireNav('queues'),
  asyncHandler(queueController.worklist),
);

router.post(
  '/queues/worklist/:id/done',
  validateParams(idParam),
  authenticate,
  staffOnly,
  requireNav('queues'),
  asyncHandler(queueController.worklistDone),
);

router.get(
  '/queues/approvals',
  authenticate,
  staffOnly,
  requireNav('queues'),
  asyncHandler(queueController.approvals),
);

/**
 * Raising one — and the only place a chain is ever snapshotted.
 *
 * NOT IN THE BOARD'S GATE, deliberately: the coach who writes a chart proposes
 * the sign-off and does not hold `approve`, so gating creation on the approvals
 * board would mean only signers could raise anything. The service takes the
 * snapshot; see `queues.service.create`.
 */
router.post(
  '/queues/approvals',
  validateBody(schemas.createApprovalSchema),
  authenticate,
  staffOnly,
  requireNav('queues'),
  asyncHandler(queueController.createApproval),
);

router.post(
  '/queues/approvals/:id/submit',
  validateParams(idParam),
  validateBody(schemas.approvalNoteSchema),
  authenticate,
  staffOnly,
  requireNav('queues'),
  asyncHandler(queueController.submitApproval),
);

/** One signature moves it one step down its SNAPSHOT; the last one publishes. */
router.post(
  '/queues/approvals/:id/sign',
  validateParams(idParam),
  validateBody(schemas.approvalNoteSchema),
  authenticate,
  staffOnly,
  requireNav('queues'),
  asyncHandler(queueController.signApproval),
);

router.post(
  '/queues/approvals/:id/return',
  validateParams(idParam),
  validateBody(schemas.returnApprovalSchema),
  authenticate,
  staffOnly,
  requireNav('queues'),
  asyncHandler(queueController.returnApproval),
);

router.get(
  '/queues/meals',
  authenticate,
  staffOnly,
  requireNav('queues'),
  asyncHandler(queueController.meals),
);

/*
 * THE GATE IS IN THE SERVICE, deliberately, and a `requirePerm('rateMeals')`
 * here would be a downgrade rather than a second belt.
 *
 * `rateMeal` refuses with subjectType 'meal' and the plate's own id, so the
 * audit row says WHICH plate somebody tried to sign. `recordDenial` can only
 * write subjectType 'access' — the meal is gone from the trail. Its message is
 * vague on purpose too ('Not available for your role'), because naming a
 * permission maps the matrix for anyone probing it; the service can afford to
 * be specific because you already hold the board to reach it.
 *
 * Route middleware runs first, so adding one here does not add a check — it
 * replaces the better record with the worse one.
 */
router.post(
  '/queues/meals/:id/rate',
  validateParams(idParam),
  validateBody(schemas.rateMealSchema),
  authenticate,
  staffOnly,
  requireNav('queues'),
  asyncHandler(queueController.rateMeal),
);

router.get(
  '/queues/medical',
  authenticate,
  staffOnly,
  requireNav('queues'),
  asyncHandler(queueController.medical),
);

router.post(
  '/queues/medical/:id/sign',
  validateParams(idParam),
  validateBody(schemas.signSummarySchema),
  authenticate,
  staffOnly,
  requireNav('queues'),
  asyncHandler(queueController.signSummary),
);

router.get(
  '/queues/deviations',
  authenticate,
  staffOnly,
  requireNav('queues'),
  asyncHandler(queueController.deviations),
);

/**
 * "I have read these." The badge on the tab is "new since you looked", so the
 * looking has to be recorded by something — and a GET is the wrong something.
 */
router.post(
  '/queues/deviations/seen',
  validateBody(schemas.markDeviationsSeenSchema),
  authenticate,
  staffOnly,
  requireNav('queues'),
  asyncHandler(queueController.markDeviationsSeen),
);

/**
 * The live board. Its four readings are DERIVED rather than stored — see
 * `queues.service.live` — so it is a read like any other.
 */
router.get(
  '/queues/live',
  authenticate,
  staffOnly,
  requireNav('queues'),
  asyncHandler(queueController.live),
);

/* ----------------------------------------------------------- community */

/**
 * The commons — six sections behind one nav gate.
 *
 * `requireNav('community')` is all a route asserts, and READS ARE OPEN TO
 * ANYBODY WHO HAS IT. That is the product's own shape rather than a relaxation:
 * the Super User carries Community in their sidebar and does not carry
 * `manageTribe`, so their seat is exactly "read the commons, change nothing".
 *
 * WHICH WRITES THEY MAY MAKE is settled in the SERVICE, for the reason every
 * other module in this file settles it there: the refusal has to write the audit
 * row the console promises ("This attempt was logged"), and a `requirePerm` here
 * would refuse correctly and record nothing. It also keeps the three different
 * rights in one place where they can be read together —
 *
 *   `manageTribe`     writes the first five tabs,
 *   `manageTribe` + `manageConfig` deletes (the demo's admin-or-opshead pair,
 *                     said as permissions so it survives a People & Access edit),
 *   `announceClients` sends on the sixth,
 *
 * — and `announceClients` is emphatically NOT `manageTribe`. Two permissions,
 * two surfaces: one runs the community, the other reaches every client's own
 * Care Circle, and the Haalving Coach who does the first every day does not hold
 * the second.
 */

router.get(
  '/community',
  authenticate,
  staffOnly,
  requireNav('community'),
  asyncHandler(communityController.sections),
);

/*
 * PHASE 2 — THE PUBLISHED LIST, deliberately NOT behind `requireNav`.
 *
 * Six roles — Doctor, Dietician, the three pillar coaches and a Head of
 * Department — hold no `community` nav, so the tab above is closed to them. Right
 * for EDITING the community, wrong for knowing what it is doing: a coach whose
 * client asks about Saturday's walk should not have to find somebody with a
 * bigger sidebar.
 *
 * Any staff seat may read what has been approved. `staffOnly` still keeps a
 * client's token out — that is the next surface, and a different one on purpose.
 *
 * Registered before any `/community/gatherings/:id` GET could exist, so
 * "approved" is never read as an id.
 */
router.get(
  '/community/gatherings/approved',
  authenticate,
  staffOnly,
  asyncHandler(communityController.approvedGatherings),
);

router.get(
  '/community/gatherings',
  authenticate,
  staffOnly,
  requireNav('community'),
  asyncHandler(communityController.gatherings),
);

router.post(
  '/community/gatherings',
  validateBody(schemas.gatheringSchema),
  authenticate,
  staffOnly,
  requireNav('community'),
  asyncHandler(communityController.createGathering),
);

/*
 * THE GATE IS IN THE SERVICE, not on these two routes.
 *
 * A refusal has to write an AuditLog row naming THE GATHERING somebody tried to
 * publish — `requirePerm` can only record a generic `access` row with no subject,
 * and its message is deliberately vague. The same call the arrivals board and the
 * meal ratings make, for the same reason.
 */
router.post(
  '/community/gatherings/:id/approve',
  validateParams(idParam),
  authenticate,
  staffOnly,
  requireNav('community'),
  asyncHandler(communityController.approveGathering),
);

router.post(
  '/community/gatherings/:id/return',
  validateParams(idParam),
  validateBody(schemas.returnGatheringSchema),
  authenticate,
  staffOnly,
  requireNav('community'),
  asyncHandler(communityController.returnGathering),
);

/* the other three kinds, same gate, same service rule */
router.post(
  '/community/challenges/:id/approve',
  validateParams(idParam),
  authenticate,
  staffOnly,
  requireNav('community'),
  asyncHandler(communityController.approveChallenge),
);

router.post(
  '/community/challenges/:id/return',
  validateParams(idParam),
  validateBody(schemas.returnGatheringSchema),
  authenticate,
  staffOnly,
  requireNav('community'),
  asyncHandler(communityController.returnChallenge),
);
router.post(
  '/community/game-days/:id/approve',
  validateParams(idParam),
  authenticate,
  staffOnly,
  requireNav('community'),
  asyncHandler(communityController.approveGameDay),
);

router.post(
  '/community/game-days/:id/return',
  validateParams(idParam),
  validateBody(schemas.returnGatheringSchema),
  authenticate,
  staffOnly,
  requireNav('community'),
  asyncHandler(communityController.returnGameDay),
);
router.post(
  '/community/zones/:id/approve',
  validateParams(idParam),
  authenticate,
  staffOnly,
  requireNav('community'),
  asyncHandler(communityController.approveZone),
);

router.post(
  '/community/zones/:id/return',
  validateParams(idParam),
  validateBody(schemas.returnGatheringSchema),
  authenticate,
  staffOnly,
  requireNav('community'),
  asyncHandler(communityController.returnZone),
);

router.patch(
  '/community/gatherings/:id',
  validateParams(idParam),
  validateBody(schemas.gatheringSchema),
  authenticate,
  staffOnly,
  requireNav('community'),
  asyncHandler(communityController.updateGathering),
);

/** Refused at the FLOOR — the last gathering may not be deleted. See the service. */
router.delete(
  '/community/gatherings/:id',
  validateParams(idParam),
  authenticate,
  staffOnly,
  requireNav('community'),
  asyncHandler(communityController.removeGathering),
);

router.get(
  '/community/challenges',
  authenticate,
  staffOnly,
  requireNav('community'),
  asyncHandler(communityController.challenges),
);

router.post(
  '/community/challenges',
  validateBody(schemas.challengeSchema),
  authenticate,
  staffOnly,
  requireNav('community'),
  asyncHandler(communityController.createChallenge),
);

router.patch(
  '/community/challenges/:id',
  validateParams(idParam),
  validateBody(schemas.challengeSchema),
  authenticate,
  staffOnly,
  requireNav('community'),
  asyncHandler(communityController.updateChallenge),
);

router.delete(
  '/community/challenges/:id',
  validateParams(idParam),
  authenticate,
  staffOnly,
  requireNav('community'),
  asyncHandler(communityController.removeChallenge),
);

router.get(
  '/community/game-days',
  authenticate,
  staffOnly,
  requireNav('community'),
  asyncHandler(communityController.gameDays),
);

router.post(
  '/community/game-days',
  validateBody(schemas.gameDaySchema),
  authenticate,
  staffOnly,
  requireNav('community'),
  asyncHandler(communityController.createGameDay),
);

/**
 * A game day is edited WHOLE — label, date and every question in one body.
 * The service rewrites its questions BY POSITION so the answers already given to
 * them survive the edit; see `saveGameDayQuestions`.
 */
router.patch(
  '/community/game-days/:id',
  validateParams(idParam),
  validateBody(schemas.gameDaySchema),
  authenticate,
  staffOnly,
  requireNav('community'),
  asyncHandler(communityController.updateGameDay),
);

router.delete(
  '/community/game-days/:id',
  validateParams(idParam),
  authenticate,
  staffOnly,
  requireNav('community'),
  asyncHandler(communityController.removeGameDay),
);

router.get(
  '/community/posts',
  validateQuery(schemas.feedQuery),
  authenticate,
  staffOnly,
  requireNav('community'),
  asyncHandler(communityController.posts),
);

router.post(
  '/community/posts',
  validateBody(schemas.postSchema),
  authenticate,
  staffOnly,
  requireNav('community'),
  asyncHandler(communityController.createPost),
);

router.patch(
  '/community/posts/:id',
  validateParams(idParam),
  validateBody(schemas.postSchema),
  authenticate,
  staffOnly,
  requireNav('community'),
  asyncHandler(communityController.updatePost),
);

/**
 * Moderation gets its OWN route rather than riding along with the edit.
 *
 * Pinning and hiding are staff action on somebody else's words — a third
 * category beside content and member state — and keeping them apart is what lets
 * the edit route stay purely about what a post says.
 */
router.post(
  '/community/posts/:id/moderate',
  validateParams(idParam),
  validateBody(schemas.moderatePostSchema),
  authenticate,
  staffOnly,
  requireNav('community'),
  asyncHandler(communityController.moderatePost),
);

router.delete(
  '/community/posts/:id',
  validateParams(idParam),
  authenticate,
  staffOnly,
  requireNav('community'),
  asyncHandler(communityController.removePost),
);

/** The community circle — the pool a zone's membership is picked from. */
router.get(
  '/community/circle',
  authenticate,
  staffOnly,
  requireNav('community'),
  asyncHandler(communityController.circle),
);

router.get(
  '/community/zones',
  authenticate,
  staffOnly,
  requireNav('community'),
  asyncHandler(communityController.zones),
);

router.post(
  '/community/zones',
  validateBody(schemas.zoneSchema),
  authenticate,
  staffOnly,
  requireNav('community'),
  asyncHandler(communityController.createZone),
);

router.patch(
  '/community/zones/:id',
  validateParams(idParam),
  validateBody(schemas.zoneSchema),
  authenticate,
  staffOnly,
  requireNav('community'),
  asyncHandler(communityController.updateZone),
);

router.delete(
  '/community/zones/:id',
  validateParams(idParam),
  authenticate,
  staffOnly,
  requireNav('community'),
  asyncHandler(communityController.removeZone),
);

/**
 * THE OUTBOUND TAB. Reading what has been sent is open to the nav — the log is
 * the team's own record and a role that cannot send can still be answerable for
 * what went out — and the send itself needs `announceClients`, checked and
 * audited in the service.
 */
router.get(
  '/community/announcements',
  authenticate,
  staffOnly,
  requireNav('community'),
  asyncHandler(communityController.announcements),
);

/** What the composer draws itself from: pictures, live links, plans, coaches. */
router.get(
  '/community/announcements/composer',
  authenticate,
  staffOnly,
  requireNav('community'),
  asyncHandler(communityController.composer),
);

/**
 * The live recipient count. A POST for a READ, deliberately: the question is
 * asked ABOUT a draft audience, which is a body rather than a URL, and the same
 * function answers it that the send then uses — so the number the operator agreed
 * to cannot disagree with what actually goes out.
 */
router.post(
  '/community/announcements/reach',
  validateBody(schemas.reachSchema),
  authenticate,
  staffOnly,
  requireNav('community'),
  asyncHandler(communityController.reach),
);

router.post(
  '/community/announcements',
  validateBody(schemas.sendBroadcastSchema),
  authenticate,
  staffOnly,
  requireNav('community'),
  asyncHandler(communityController.send),
);

/* ----------------------------------------------------------------- audit */

router.get(
  '/audit',
  validateQuery(
    schemas.paginationQuery.extend({
      actorId: z.string().optional(),
      action: z.string().optional(),
      subjectType: z.string().optional(),
      subjectId: z.string().optional(),
    }),
  ),
  authenticate,
  staffOnly,
  requirePerm('manageConfig'),
  asyncHandler(auditController.list),
);

/**
 * The console's edge middleware reports a blocked NAVIGATION here — a page the
 * sidebar does not carry never reaches the API, so the server would otherwise
 * never learn the attempt happened.
 *
 * Any signed-in staff member may post to it, deliberately: the caller is the
 * person being recorded, and gating it behind a permission would mean the roles
 * most worth logging are the ones that cannot log themselves.
 */
router.post(
  '/audit/denied',
  validateBody(
    z.object({
      path: z.string().min(1).max(400),
      view: z.string().max(120).optional(),
    }),
  ),
  authenticate,
  staffOnly,
  asyncHandler(auditController.recordDenied),
);

/* ------------------------------------------------------- the client surface */

/*
 * THE FIRST ROUTE A CLIENT'S APP MAY ACTUALLY READ.
 *
 * Everything here answers to `clientOnly`, the other half of the audience split
 * `staffOnly` has been enforcing all along: a token minted for one surface must
 * not open the other. Without it a client's own legitimate token would carry the
 * `client` role into the console's routes, where scoping would hand back exactly
 * their own record and the request would LOOK correct.
 *
 * A CLIENT GETS THE APPROVED LIST AND NOTHING ELSE — not the staff read with the
 * pending ones filtered out, but a different endpoint. A pending gathering is
 * therefore not merely hidden from the client app; it is absent from the answer
 * the client app is given, and no query parameter widens it.
 */
router.get(
  '/client/community/gatherings',
  authenticate,
  clientOnly,
  asyncHandler(communityController.approvedGatherings),
);

export default router;
