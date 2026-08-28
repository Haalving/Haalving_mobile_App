import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { ApiError } from '../utils/apiResponse.js';
import { requireUser } from './authenticate.js';
import { recordDenial } from './authorize.js';

/**
 * Staff routes and client routes are different surfaces, and a credential minted
 * for one must not open the other.
 *
 * Without this, a client's own token — obtained legitimately, with a phone they
 * control — would carry the `client` role into `GET /clients`, where scoping
 * would hand back exactly their own record and the request would LOOK correct.
 * The audience check refuses it at the door instead, so the console's surface is
 * never reachable from the client app at all.
 */
function requireAudience(want: 'staff' | 'client'): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (user.audience !== want) {
        await recordDenial(req, `audience:${want}`, { had: user.audience });
        throw ApiError.forbidden('Not available for your role.');
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export const staffOnly: RequestHandler = requireAudience('staff');
export const clientOnly: RequestHandler = requireAudience('client');
