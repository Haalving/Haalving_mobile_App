import { Router } from 'express';
import { z } from 'zod';

import * as clientApp from '../controllers/client-app.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { clientOnly } from '../middleware/audience.js';
import { validateParams, validateQuery } from '../middleware/validate.js';
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

/* ---------------------------------------------------------------- profile */

router.get('/client/profile', authenticate, clientOnly, asyncHandler(clientApp.profile));

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
