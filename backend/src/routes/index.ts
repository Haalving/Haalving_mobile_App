import { Router } from 'express';
import { z } from 'zod';
import { schemas } from '@haalving/shared';

import * as auditController from '../controllers/audit.controller.js';
import * as authController from '../controllers/auth.controller.js';
import * as clientController from '../controllers/client.controller.js';
import * as digestController from '../controllers/digest.controller.js';
import * as arrivalController from '../controllers/arrival.controller.js';
import * as peopleController from '../controllers/people.controller.js';
import * as leaveController from '../controllers/leave.controller.js';
import * as configController from '../controllers/config.controller.js';
import * as catalogController from '../controllers/catalog.controller.js';
import * as scheduleController from '../controllers/schedule.controller.js';
import * as homeController from '../controllers/home.controller.js';
import * as roleController from '../controllers/role.controller.js';
import * as userController from '../controllers/user.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { staffOnly } from '../middleware/audience.js';
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
 * THE GATE IS IN THE SERVICE, not on the route. Every write here needs `allocate`
 * or `seeAllClients`, which is one test (`canRun`) rather than two permissions a
 * route could get half right — and, more importantly, a refusal has to write a
 * DENIED event against the arrival AND an AuditLog row, because the console tells
 * the person "This attempt was logged". A `requirePerm` on the route would refuse
 * correctly and record nothing.
 *
 * So the routes carry only what a route can honestly assert: the body is valid,
 * the caller is signed in, and they are staff on the Clients rail.
 */

router.get(
  '/arrivals',
  authenticate,
  staffOnly,
  requireNav('clients'),
  asyncHandler(arrivalController.list),
);

router.post(
  '/arrivals',
  validateBody(schemas.createArrivalSchema),
  authenticate,
  staffOnly,
  requireNav('clients'),
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

export default router;
