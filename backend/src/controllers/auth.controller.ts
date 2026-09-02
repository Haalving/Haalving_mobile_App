import type { Request, Response } from 'express';

import { requireUser } from '../middleware/authenticate.js';
import * as authService from '../services/auth.service.js';
import { ApiError, ok } from '../utils/apiResponse.js';
import { REFRESH_COOKIE, refreshCookieOptions } from '../utils/tokens.js';

/**
 * Controllers parse, call a service, and respond. No business logic lives here.
 *
 * The one thing they DO own is the transport difference between the two clients:
 * the console keeps its refresh token in an httpOnly cookie the browser manages,
 * and mobile keeps its own in secure storage and sends it in the body. One
 * service, two envelopes.
 */

function ctx(req: Request): authService.SessionContext {
  return {
    userAgent: req.get('user-agent') ?? undefined,
    ip: req.ip ?? undefined,
  };
}

/** True for the browser console; false for a native app with no cookie jar. */
function wantsCookie(req: Request): boolean {
  return req.get('x-client') !== 'mobile';
}

function respondWithSession(
  req: Request,
  res: Response,
  result: { tokens: authService.SessionTokens; user: { id: string; role: string; name: string } },
) {
  const body: Record<string, unknown> = {
    accessToken: result.tokens.accessToken,
    user: result.user,
  };

  if (wantsCookie(req)) {
    res.cookie(REFRESH_COOKIE, result.tokens.refreshToken, refreshCookieOptions());
  } else {
    /* mobile only. Never both: a token in the body AND a cookie doubles the
       places it can leak from for no gain. */
    body.refreshToken = result.tokens.refreshToken;
  }

  return ok(res, body);
}

export async function staffLogin(req: Request, res: Response) {
  const { email, password } = req.body as { email: string; password: string };
  const result = await authService.staffLogin(email, password, ctx(req));
  return respondWithSession(req, res, result);
}

export async function requestOtp(req: Request, res: Response) {
  const { phone } = req.body as { phone: string };
  await authService.requestOtp(phone);
  /* the same answer whether or not the number is a client — see the service */
  return ok(res, { sent: true });
}

export async function verifyOtp(req: Request, res: Response) {
  const { phone, code } = req.body as { phone: string; code: string };
  const result = await authService.verifyOtp(phone, code, ctx(req));
  return respondWithSession(req, res, result);
}

/**
 * DEV ONLY — hand back a freshly minted code so the pixel harness can sign in
 * without reading the API log. The route is registered only outside production.
 */
/**
 * Public self-onboarding. Token-less: it MINTS the first session, so it answers
 * with the same body shape as a sign-in — a cookie for the console, a body token
 * for the app — and the app is signed in the moment the deck's last card submits.
 */
export async function onboard(req: Request, res: Response) {
  const result = await authService.onboard(req.body as authService.OnboardInput, ctx(req));
  return respondWithSession(req, res, result);
}

export async function devOtp(req: Request, res: Response) {
  const { phone } = req.body as { phone: string };
  return ok(res, await authService.devIssueOtp(phone));
}

export async function refresh(req: Request, res: Response) {
  const fromCookie = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
  const fromBody = (req.body as { refreshToken?: string } | undefined)?.refreshToken;
  const presented = fromCookie ?? fromBody;

  if (!presented) throw new ApiError(401, 'invalid_refresh', 'Your session has ended. Please sign in again.');

  const result = await authService.rotateRefresh(presented, ctx(req));
  return respondWithSession(req, res, result);
}

export async function logout(req: Request, res: Response) {
  const fromCookie = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
  const fromBody = (req.body as { refreshToken?: string } | undefined)?.refreshToken;

  await authService.logout(fromCookie ?? fromBody);
  /* the same path and flags the cookie was SET with, or the browser keeps it:
     a clear that does not match on path is a no-op that looks like it worked.
     No 'expires' — Express 5 ignores it and clears immediately anyway. */
  const { expires: _drop, ...clearOpts } = refreshCookieOptions();
  res.clearCookie(REFRESH_COOKIE, clearOpts);

  return ok(res, { ok: true });
}

export async function me(req: Request, res: Response) {
  const user = requireUser(req);
  return ok(res, await authService.me(user.id));
}
