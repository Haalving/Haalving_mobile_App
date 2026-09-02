import { Router } from 'express';
import { z } from 'zod';

import * as clientApp from '../controllers/client-app.controller.js';
import { FULLNESS, MEAL_SLOTS, MOOD_KEYS } from '../services/client-app/index.js';
import { NOTIF_KEYS } from '../services/client-app/settings-catalog.js';
import { authenticate } from '../middleware/authenticate.js';
import { clientOnly } from '../middleware/audience.js';
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
const arrivalSchema = z.object({ mood: z.enum(MOOD_KEYS) });

router.post(
  '/client/arrival',
  validateBody(arrivalSchema),
  authenticate,
  clientOnly,
  asyncHandler(clientApp.setArrival),
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
