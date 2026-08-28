import { Router } from 'express';
import { z } from 'zod';
import { schemas } from '@haalving/shared';

import * as auditController from '../controllers/audit.controller.js';
import * as authController from '../controllers/auth.controller.js';
import * as clientController from '../controllers/client.controller.js';
import * as digestController from '../controllers/digest.controller.js';
import * as arrivalController from '../controllers/arrival.controller.js';
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

router.get('/roles', authenticate, staffOnly, asyncHandler(roleController.list));

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
  requirePerm('manageConfig'),
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
