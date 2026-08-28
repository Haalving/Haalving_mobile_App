import { createHash, randomInt } from 'node:crypto';

import { env } from '../config/env.js';
import { logger } from './logger.js';

/**
 * One-time codes for the client app's phone login.
 *
 * Six digits, generated with `randomInt` (the CSPRNG) rather than `Math.random`,
 * which is seeded and predictable — a six-digit space is small enough that
 * predictability is the whole attack.
 *
 * Only the hash is stored. A code lives five minutes and survives five wrong
 * guesses; both numbers are here rather than scattered through the service.
 */

export const OTP_TTL_MIN = 5;
export const OTP_MAX_ATTEMPTS = 5;

export function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * SHA-256, not bcrypt. The input space is a million values, so a slow hash buys
 * nothing an attacker cannot brute-force offline anyway — what actually protects
 * the code is that it expires in five minutes and the attempt counter closes it
 * after five guesses.
 */
export function hashOtp(code: string, phone: string): string {
  return createHash('sha256').update(`${phone}:${code}`).digest('hex');
}

export function otpExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + OTP_TTL_MIN * 60_000);
}

/**
 * Delivery. In development the provider is `console` and the code is written to
 * the terminal — which is exactly why `env.ts` refuses to boot production with
 * that setting: it would put live one-time codes in the log.
 */
export async function sendOtp(phone: string, code: string): Promise<void> {
  if (env.SMS_PROVIDER === 'console') {
    logger.info(
      { phone },
      `\n\n  ──────────────────────────────────────────\n` +
        `   OTP for ${phone}:  ${code}\n` +
        `   (development only — SMS_PROVIDER=console)\n` +
        `  ──────────────────────────────────────────\n`,
    );
    return;
  }

  /* A real provider lands here on the day one is chosen. Throwing rather than
     silently succeeding matters: a login flow that reports "code sent" while
     sending nothing is the worst possible failure — the user waits for an SMS
     that will never arrive and has no way to tell. */
  throw new Error(`SMS provider "${env.SMS_PROVIDER}" is not wired up yet.`);
}
