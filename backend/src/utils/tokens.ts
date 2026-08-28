import { createHash, randomBytes, randomUUID } from 'node:crypto';

import jwt from 'jsonwebtoken';

import { env, isProd } from '../config/env.js';
import { parseDuration } from './dates.js';

/**
 * Tokens.
 *
 * The access token is a short-lived JWT the API verifies on every request. The
 * refresh token is an opaque random string — never a JWT — stored only as a
 * SHA-256 hash, so a database leak yields nothing that can be presented.
 *
 * `audience` on the access token is what stops a console credential being
 * replayed against a client-app route and the reverse. It is checked, not just
 * carried.
 */

export type Audience = 'staff' | 'client';

export interface AccessClaims {
  sub: string;
  role: string;
  aud: Audience;
  /** The client record this login owns, when the subject is a client. */
  cid?: string;
}

export interface AccessPayload extends AccessClaims {
  iat: number;
  exp: number;
}

export function signAccessToken(claims: AccessClaims): string {
  const { sub, ...rest } = claims;
  return jwt.sign(rest, env.JWT_ACCESS_SECRET, {
    subject: sub,
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'],
    issuer: 'haalving',
  });
}

export function verifyAccessToken(token: string): AccessPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: 'haalving' });
  if (typeof decoded === 'string') throw new Error('Malformed access token');
  return decoded as unknown as AccessPayload;
}

/**
 * A refresh token is 384 bits of randomness. Making it a JWT would put its own
 * expiry inside itself, which is exactly what we must not trust: revocation lives
 * in the database, and a self-describing token invites someone to skip the lookup.
 */
export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newTokenFamily(): string {
  return randomUUID();
}

export function refreshExpiryDate(now: Date = new Date()): Date {
  return new Date(now.getTime() + parseDuration(env.JWT_REFRESH_TTL));
}

/**
 * The console's refresh cookie.
 *
 * httpOnly so no script can read it, `sameSite: 'lax'` so it does not ride along
 * with a cross-site POST, and `path` narrowed to the auth routes so it is not
 * attached to every ordinary API call. Mobile gets its refresh token in the body
 * instead and keeps it in expo-secure-store — there is no cookie jar worth the
 * name on a device.
 */
export const REFRESH_COOKIE = 'hv_refresh';

export function refreshCookieOptions(now: Date = new Date()) {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    path: '/api/v1/auth',
    expires: refreshExpiryDate(now),
  };
}
