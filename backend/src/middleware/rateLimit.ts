import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { redis } from '../config/redis.js';
import { ApiError } from '../utils/apiResponse.js';
import { logger } from '../utils/logger.js';

/**
 * A fixed-window limiter in Redis.
 *
 * IT FAILS OPEN. If Redis is unreachable the request proceeds, and that is a
 * deliberate trade for a health product: a limiter that fails closed locks every
 * client out of their own plan the moment a cache node blinks. Brute-force
 * protection is not the only thing standing between an attacker and an account —
 * the OTP attempt counter lives in Postgres, and password verification is bcrypt
 * at cost 12 — so this layer degrading is survivable in a way a total outage is
 * not.
 */

export interface RateLimitOptions {
  /** Window length in seconds. */
  windowSec: number;
  /** How many requests one key may make inside the window. */
  max: number;
  /** What counts as "the same caller". Defaults to the IP. */
  keyBy?: (req: Request) => string;
  /** A name, so two limiters on one route do not share a bucket. */
  bucket: string;
  message?: string;
}

export function rateLimit(opts: RateLimitOptions): RequestHandler {
  const { windowSec, max, bucket, keyBy, message } = opts;

  return async (req: Request, res: Response, next: NextFunction) => {
    const who = keyBy ? keyBy(req) : (req.ip ?? 'unknown');
    const window = Math.floor(Date.now() / (windowSec * 1000));
    const key = `rl:${bucket}:${who}:${window}`;

    try {
      /*
       * INCR and EXPIRE in ONE round trip.
       *
       * Written as two awaits, this cost two round trips on every single request
       * — ~440ms against a Redis hosted off this machine, paid by every caller
       * whether or not they were near the limit. A pipeline sends both commands
       * together and reads both replies at once, so the wire cost is one trip.
       *
       * EXPIRE is issued unconditionally with the NX flag ("only if no TTL is
       * set") rather than being made conditional on `hits === 1` in JavaScript.
       * That is what preserves the original rule — the TTL is set on the first
       * hit of a window and never touched again — while removing the round trip
       * that reading `hits` first would have required. Re-expiring on every
       * request would slide the window forward and the limit would never reset
       * under sustained load.
       */
      const replies = await redis
        .multi()
        .incr(key)
        .expire(key, windowSec, 'NX')
        .exec();

      /* exec() resolves to null when the transaction was discarded — treat that
         as "the limiter could not answer", which means allow, same as an outage */
      if (!replies) throw new Error('redis transaction discarded');

      const [incrErr, incrVal] = replies[0] ?? [new Error('no reply'), null];
      if (incrErr) throw incrErr;
      const hits = Number(incrVal);

      const remaining = Math.max(0, max - hits);
      res.setHeader('RateLimit-Limit', String(max));
      res.setHeader('RateLimit-Remaining', String(remaining));
      res.setHeader('RateLimit-Reset', String((window + 1) * windowSec - Math.floor(Date.now() / 1000)));

      if (hits > max) {
        throw ApiError.tooMany(message ?? 'Too many attempts. Try again shortly.');
      }
      next();
    } catch (err) {
      if (err instanceof ApiError) {
        next(err);
        return;
      }
      logger.warn({ err: (err as Error).message, bucket }, 'rate limiter unavailable — allowing request');
      next();
    }
  };
}

/** Normalise a phone from the body so one number cannot be spaced two ways. */
const phoneKey = (req: Request): string => {
  const raw = (req.body as { phone?: unknown } | undefined)?.phone;
  const phone = typeof raw === 'string' ? raw.replace(/[\s()-]/g, '') : '';
  return phone || (req.ip ?? 'unknown');
};

/** Staff login: ten tries in fifteen minutes, per IP. */
export const loginLimiter: RequestHandler = rateLimit({
  bucket: 'login',
  windowSec: 15 * 60,
  max: 10,
  message: 'Too many sign-in attempts. Try again in a few minutes.',
});

/**
 * OTP requests: five per hour PER NUMBER, not per IP.
 *
 * Keying on the IP would let one attacker drain SMS credit against a hundred
 * numbers from one address, and would lock out a whole office behind one NAT.
 * The number is what costs money and what gets harassed, so the number is the key.
 */
export const otpRequestLimiter: RequestHandler = rateLimit({
  bucket: 'otp:request',
  windowSec: 60 * 60,
  max: 5,
  keyBy: phoneKey,
  message: 'Too many codes requested for this number. Try again later.',
});

/** OTP verification: twenty guesses an hour per number, above the per-code counter. */
export const otpVerifyLimiter: RequestHandler = rateLimit({
  bucket: 'otp:verify',
  windowSec: 60 * 60,
  max: 20,
  keyBy: phoneKey,
  message: 'Too many attempts for this number. Try again later.',
});

/** A wide net over the whole API, so one client cannot flood it. */
export const globalLimiter: RequestHandler = rateLimit({
  bucket: 'api',
  windowSec: 60,
  max: 300,
});
