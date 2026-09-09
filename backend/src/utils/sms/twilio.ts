import { env } from '../../config/env.js';
import { ApiError } from '../apiResponse.js';
import { logger } from '../logger.js';

/**
 * TWILIO VERIFY — the one-time code, minted AND delivered by Twilio.
 *
 * This is Verify, not Programmable SMS: we do not send our own six digits
 * through a phone number, we ask the Verify service to start a verification
 * and later to check the code the person typed. Twilio then owns generation,
 * delivery (with the India DLT-registered templates a Verify service carries),
 * expiry (10 minutes) and the wrong-guess ceiling (5 checks) — so in this mode
 * the local `otps` table is not consulted at all. The eligibility rule — only
 * an active client number ever gets a code — stays ours, in `auth.service`.
 *
 * REST over `fetch`, no SDK: two endpoints, Basic auth, form bodies. A
 * dependency for that would be a second copy of six lines.
 *
 * Errors are translated into the same sentences the console provider's path
 * produces, keyed on Twilio's error codes, so the app never has to know which
 * provider it is talking to:
 *   60200 / 21211  the number cannot take SMS       → 400
 *   60203          too many codes sent to it        → 429
 *   60202          too many wrong checks            → 429
 *   20404          no verification pending          → "not right, or expired"
 * Anything else is Twilio being unavailable, which is a 502 with a plain
 * sentence — never a stack, never a silent "sent".
 */
const VERIFY = 'https://verify.twilio.com/v2';

class TwilioError extends Error {
  constructor(
    message: string,
    readonly twilio: number,
    readonly status: number,
  ) {
    super(message);
  }
}

function authHeader(): string {
  return `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64')}`;
}

async function call(path: string, form: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(`${VERIFY}/Services/${env.TWILIO_VERIFY_SERVICE_SID}${path}`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new TwilioError(String(body.message ?? `Twilio answered ${res.status}`), Number(body.code ?? 0), res.status);
  }
  return body;
}

/** Ask Twilio to send a code to `to` (E.164). */
export async function startVerification(to: string): Promise<void> {
  try {
    await call('/Verifications', { To: to, Channel: 'sms' });
  } catch (e) {
    const code = e instanceof TwilioError ? e.twilio : 0;
    logger.warn({ code, phone: to, err: (e as Error).message }, 'twilio verify: could not start');
    if (code === 60200 || code === 21211) {
      throw ApiError.badRequest('That does not look like a mobile number that can receive SMS.');
    }
    if (code === 60203) throw ApiError.tooMany('Too many codes requested for this number. Try again in a few minutes.');
    throw new ApiError(502, 'sms_unavailable', 'We could not send the code right now. Please try again in a moment.');
  }
}

/** Check the code the person typed; true only when Twilio says `approved`. */
export async function checkVerification(to: string, code: string): Promise<boolean> {
  try {
    const r = await call('/VerificationCheck', { To: to, Code: code });
    return r.status === 'approved';
  } catch (e) {
    const c = e instanceof TwilioError ? e.twilio : 0;
    /* nothing pending for this number: the code expired, or none was asked for —
       the same "not right, or expired" the local path answers */
    if (c === 20404) return false;
    if (c === 60202) throw ApiError.tooMany('Too many wrong codes. Ask for a new one.');
    logger.warn({ code: c, phone: to, err: (e as Error).message }, 'twilio verify: could not check');
    throw new ApiError(502, 'sms_unavailable', 'We could not check the code right now. Please try again in a moment.');
  }
}
