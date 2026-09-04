import { schemas } from '@haalving/shared';
import { Router } from 'express';
import { z } from 'zod';

import * as authApp from '../controllers/auth.controller.js';
import * as clientApp from '../controllers/client-app.controller.js';
import { FULLNESS, MEAL_SLOTS, MOOD_KEYS } from '../services/client-app/index.js';
import { NOTIF_KEYS } from '../services/client-app/settings-catalog.js';
import * as storage from '../services/storage.service.js';
import { authenticate } from '../middleware/authenticate.js';
import { clientOnly } from '../middleware/audience.js';
import { otpRequestLimiter } from '../middleware/rateLimit.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * THE CLIENT SURFACE — everything the phone may read, in one file.
 *
 * ONE PREFIX AND ONE AUDIENCE. Every route below is `/client/*` behind
 * `clientOnly`, which is the other half of the split `staffOnly` has been
 * enforcing on the console all along: a token minted for one surface must not
 * open the other. Its own note says why that matters — without it a client's
 * LEGITIMATE token would carry the `client` role into the console's routes, where
 * scoping would hand back exactly their own record and the request would look
 * correct.
 *
 * NO ROUTE TAKES A CLIENT ID. Not one path segment, not one query parameter. The
 * client is resolved from the token in the service; an id in a URL is a value the
 * caller picks, and the whole point of this surface is that its callers are not
 * staff. `/sessions/:id/join` names a SESSION, and the service still checks that
 * session belongs to the caller before it answers.
 *
 * The five serialisation rules live in `services/client-app/rules.ts` and are
 * applied there, once. Nothing in the mobile app filters anything: if a field must
 * not reach a client it is absent from the payload rather than hidden by the
 * phone, so a mistake shows up as a bug instead of being covered by a second guard
 * nobody maintains.
 */

const router: Router = Router();

/** An ISO day, when the app asks for one. Anything else is simply today. */
const dayQuery = z.object({
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'A day is YYYY-MM-DD.')
    .optional(),
});

const idParam = z.object({ id: z.string().min(1) });

/* ----------------------------------------------------------------- onboard */

/**
 * THE ONE PUBLIC ROUTE ON THIS SURFACE — the door before the door.
 *
 * A prospect has no token yet, so onboarding cannot sit behind `clientOnly`; it is
 * how the token is first minted. It is rate-limited instead (the same budget the
 * OTP request uses), because an open write that creates a User and an Arrival is
 * exactly what a limiter is for. Everything BELOW this line is gated; this is the
 * deliberate exception, and it creates nothing a signed-in route could not.
 */
router.post(
  '/client/onboard',
  otpRequestLimiter,
  validateBody(schemas.onboardSchema),
  asyncHandler(authApp.onboard),
);

/* --------------------------------------------------------------------- me */

/**
 * Who is asking, and the handful of facts every screen needs before it draws:
 * the plan, where they are in the cycle, whether they are still in observation,
 * their four levels, and who their coaches are TODAY.
 */
router.get('/client/me', authenticate, clientOnly, asyncHandler(clientApp.me));

/* ------------------------------------------------------------------ today */

router.get(
  '/client/today',
  validateQuery(dayQuery),
  authenticate,
  clientOnly,
  asyncHandler(clientApp.today),
);

/**
 * Open the door on a session.
 *
 * A POST rather than a GET because it is recorded: the audit row says this client
 * opened this room, which is the only evidence anyone has that they turned up.
 */
router.post(
  '/client/sessions/:id/join',
  validateParams(idParam),
  authenticate,
  clientOnly,
  asyncHandler(clientApp.joinSession),
);

/* ------------------------------------------------------------- uploads */

/**
 * A URL the PHONE can put one file to.
 *
 * The bytes go from the handset to R2 and never through this API, which is the
 * only way a 10 MB plate photo works against a service whose JSON ceiling is
 * 1 MB — and it means a client on a bad connection retries against Cloudflare
 * rather than against us.
 *
 * `CLIENT_FOLDERS` is the whole authorisation story: a client may write a meal
 * photo and their own report, and cannot address `cv` or `avatars`. The key is a
 * uuid this service chooses, so one client cannot overwrite another's plate or
 * guess at one.
 */
router.post(
  '/client/uploads/sign',
  validateBody(
    z.object({
      folder: z.enum(storage.CLIENT_FOLDERS),
      contentType: z.string().min(1).max(120),
      bytes: z.number().int().positive(),
    }),
  ),
  authenticate,
  clientOnly,
  asyncHandler(clientApp.signUpload),
);

/* ---------------------------------------------------------------- records */

/**
 * A report the client uploads into their own Records Vault.
 *
 * It lands as a PENDING MedicalSummary — the same table the console's Medical
 * board reads — so a lab a client sends from the phone appears in the doctor's
 * queue rather than in a second place nobody watches. It is NOT signed: only a
 * clinician's signature makes one a record, and the client cannot supply that.
 */
router.post(
  '/client/documents',
  validateBody(
    z.object({
      title: z.string().trim().min(1).max(160),
      kind: z.enum(['Lab', 'InBody', 'Imaging', 'Other']),
      key: z.string().min(1).max(300),
      fileName: z.string().min(1).max(200),
      mime: z.string().min(1).max(120),
      bytes: z.number().int().positive(),
    }),
  ),
  authenticate,
  clientOnly,
  asyncHandler(clientApp.addDocument),
);

router.get('/client/documents', authenticate, clientOnly, asyncHandler(clientApp.documents));

/* -------------------------------------------------------------------- meals */

/**
 * What a client may author about their own plate, and nothing else.
 *
 * The enums are closed on purpose. `slot` is matched BY NAME against the teaching
 * in the meal plan, so a free-text slot would not fail — it would render fine and
 * quietly stop lining up with the plan it is measured against. `fullness` is the
 * client's own reading of the plate and the meals board groups by it.
 *
 * There is no `stars`, no `kcal`, no `capturedAt`. Absent from the schema means
 * absent from the request: a field the client cannot send is not a field anyone
 * has to remember to ignore.
 */
const captureSchema = z.object({
  slot: z.enum(MEAL_SLOTS),
  fullness: z.enum(FULLNESS),
  /* six is the plate, not a rule about food: past that it is a list nobody reads,
     and the dietitian is the one who has to */
  dishes: z.array(z.string().trim().min(1).max(80)).min(1).max(6),
  photo: z.string().max(2048).nullish(),
});

router.post(
  '/client/meals',
  validateBody(captureSchema),
  authenticate,
  clientOnly,
  asyncHandler(clientApp.captureMeal),
);

/**
 * One plate.
 *
 * THE ONLY ID THIS SURFACE TAKES IN A PATH, and the service checks it against the
 * session before answering. A meal that belongs to someone else is a 404 rather
 * than a 403: a 403 would confirm it exists.
 */
router.get(
  '/client/meals/:id',
  validateParams(idParam),
  authenticate,
  clientOnly,
  asyncHandler(clientApp.mealDetail),
);

/* ---------------------------------------------------------------- profile */

router.get('/client/profile', authenticate, clientOnly, asyncHandler(clientApp.profile));

/* -------------------------------------------------------------- coaches */

/**
 * The coach marketplace, per pillar. Reference content, plus a `mine` flag the
 * service derives from the caller's pod — no id, no scope beyond the token.
 */
router.get('/client/coaches', authenticate, clientOnly, asyncHandler(clientApp.coaches));

/* -------------------------------------------------------------- trackers */

/**
 * The tracker hub. The six signals are real, from the client's own trackers blob;
 * the nutrient panel is the next pass and ships empty until then.
 */
router.get('/client/trackers', authenticate, clientOnly, asyncHandler(clientApp.trackers));

/**
 * The Quick-add sheet's writes — a glass of water, last night's sleep, a step
 * count, or a weigh-in. A PARTIAL merge in the service into the same blob the
 * signals read, so the tap shows up on the tracker hub and the console's Trackers
 * tab at once. At least one field must be present — an empty body changes nothing.
 */
const trackerLogSchema = z
  .object({
    waterAdd: z.number().int().min(1).max(8).optional(),
    sleepMins: z.number().int().min(0).max(24 * 60).optional(),
    steps: z.number().int().min(0).max(100_000).optional(),
    weightKg: z.number().min(20).max(400).optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: 'Nothing to log.',
  });

router.post(
  '/client/trackers',
  validateBody(trackerLogSchema),
  authenticate,
  clientOnly,
  asyncHandler(clientApp.logTrackers),
);

/* -------------------------------------------------------------- settings */

/**
 * The client app's own settings. The GET composes static copy with the client's
 * stored on/off; the PATCH is a partial merge, carrying only what a toggle
 * changed. Consents are read-only — the demo gives them no withdraw path.
 */
const settingsPatch = z
  .object({
    notif: z.record(z.enum(NOTIF_KEYS), z.boolean()).optional(),
    announce: z.boolean().optional(),
  })
  .refine((b) => b.notif !== undefined || b.announce !== undefined, {
    message: 'Nothing to change.',
  });

router.get('/client/settings', authenticate, clientOnly, asyncHandler(clientApp.settings));
router.patch(
  '/client/settings',
  validateBody(settingsPatch),
  authenticate,
  clientOnly,
  asyncHandler(clientApp.updateSettings),
);

/* -------------------------------------------------------------- arrival */

/**
 * "How are you arriving?" — this morning's mood, keyed by cycle-day in the
 * service. The mood the app reads back rides on `GET /client/today`.
 */
const arrivalSchema = z.object({
  mood: z.enum(MOOD_KEYS),
  /* "A line about why — only if you want." Optional, and an empty string clears a
     line written earlier the same day rather than being ignored. */
  note: z.string().trim().max(280).nullish(),
});

router.post(
  '/client/arrival',
  validateBody(arrivalSchema),
  authenticate,
  clientOnly,
  asyncHandler(clientApp.setArrival),
);

/* ------------------------------------------------------------- push token */

/**
 * Register a device for notifications. Sending them is F3; this only records
 * where a device can be reached. Unique on the token in the service.
 */
const pushTokenSchema = z.object({
  token: z.string().trim().min(1).max(255),
  platform: z.enum(['ios', 'android']).optional(),
});

router.post(
  '/client/push-token',
  validateBody(pushTokenSchema),
  authenticate,
  clientOnly,
  asyncHandler(clientApp.registerPushToken),
);

/* ---------------------------------------------------------------- circle */

/**
 * The care-circle thread and its read receipt. TEAMONLY lines are dropped in the
 * service query (rule 2), so they are absent from the answer rather than hidden.
 * The read POST clears the unread dot; a GET could not, since a prefetch would
 * lose it.
 */
router.get('/client/circle', authenticate, clientOnly, asyncHandler(clientApp.circle));
/*
 * THE CLIENT'S OWN VOICE. Reading a thread you cannot answer in is not a
 * conversation, and for somebody still on the onboarding rail it is the only
 * thing they can do — so this is the route that lets them ask.
 */
router.post(
  '/client/circle',
  validateBody(z.object({ text: z.string().trim().min(1, 'Write something first.').max(4000) })),
  authenticate,
  clientOnly,
  asyncHandler(clientApp.postToCircle),
);

router.post('/client/circle/read', authenticate, clientOnly, asyncHandler(clientApp.markCircleRead));

/* ------------------------------------------------------------------- plan */

/**
 * The plan hub, one pillar's level-up detail, and the full cycle calendar. All
 * derived from the ported engines (calendarFor / levelup / dailyTargets) over the
 * client's own assignments and criteria — no id in any path, the client is the
 * token's.
 */
const pillarParam = z.object({ pillar: z.string().min(1) });

router.get('/client/plan', authenticate, clientOnly, asyncHandler(clientApp.plan));
router.get('/client/plan-full', authenticate, clientOnly, asyncHandler(clientApp.planFull));
router.get(
  '/client/plan/:pillar',
  validateParams(pillarParam),
  authenticate,
  clientOnly,
  asyncHandler(clientApp.planDetail),
);

/* -------------------------------------------------------------- community */

/**
 * The published gatherings.
 *
 * A DIFFERENT ENDPOINT FROM THE CONSOLE'S, not the console's list filtered. A
 * pending gathering is therefore not merely hidden from the app; it is absent from
 * the answer the app is given, and no query parameter widens it.
 */
router.get(
  '/client/community/gatherings',
  authenticate,
  clientOnly,
  asyncHandler(clientApp.gatherings),
);

export default router;
