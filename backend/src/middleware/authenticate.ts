import type { NextFunction, Request, Response } from 'express';

import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';
import { verifyAccessToken } from '../utils/tokens.js';

/**
 * Who is calling.
 *
 * The token is verified, and THEN the user is re-read from the database. That
 * second step is the point: a token minted before someone was deactivated, or
 * before their role changed, is still cryptographically valid for up to fifteen
 * minutes. Trusting its claims alone would let a dismissed employee keep their
 * access until it expired, and a demoted one keep the permissions they lost.
 *
 * The role on the request therefore always comes from the ROW, never the claim.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Sign in to continue.');
    }

    const token = header.slice(7).trim();
    if (!token) throw ApiError.unauthorized('Sign in to continue.');

    let claims;
    try {
      claims = verifyAccessToken(token);
    } catch (err) {
      const expired = err instanceof Error && err.name === 'TokenExpiredError';
      /* a distinct code, because the client's response differs: an expired token
         is refreshed silently, an invalid one sends the person back to login */
      throw new ApiError(
        401,
        expired ? 'token_expired' : 'unauthorized',
        expired ? 'Your session has expired.' : 'Sign in to continue.',
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: claims.sub },
      select: { id: true, role: true, status: true, clientProfile: { select: { id: true } } },
    });

    if (!user) throw ApiError.unauthorized('Sign in to continue.');
    if (user.status !== 'active') {
      throw ApiError.forbidden('This account is no longer active.');
    }

    /* The audience is the credential's own scope and cannot be re-derived from
       the row: it is what stops a console token being replayed against a
       client-app route, and the reverse. It stays the claim. */
    req.user = {
      id: user.id,
      role: user.role,
      audience: claims.aud,
      ...(user.clientProfile ? { clientId: user.clientProfile.id } : {}),
    };

    next();
  } catch (err) {
    next(err);
  }
}

/** The caller, or a 401. Every controller reads the user through this. */
export function requireUser(req: Request): Express.AuthenticatedUser {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}
