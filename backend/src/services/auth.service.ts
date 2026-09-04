import { randomUUID } from 'node:crypto';

import { FLOW, FLOW_VERSION, isClientRole, isStaffRole, plansOnSale, roleDef, schemas } from '@haalving/shared';

import { devRoutesAllowed } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';
import { logger } from '../utils/logger.js';
import * as arrivalCircle from './client-app/arrival-circle.js';
import { OTP_MAX_ATTEMPTS, generateOtp, hashOtp, otpExpiry, sendOtp } from '../utils/otp.js';
import { verifyPasswordConstantTime } from '../utils/password.js';
import {
  type Audience,
  generateRefreshToken,
  hashRefreshToken,
  newTokenFamily,
  refreshExpiryDate,
  signAccessToken,
} from '../utils/tokens.js';

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

export interface SessionContext {
  userAgent?: string | undefined;
  ip?: string | undefined;
}

/* -------------------------------------------------------------- issuing */

async function issueSession(
  user: { id: string; role: string },
  audience: Audience,
  familyId: string,
  ctx: SessionContext,
): Promise<SessionTokens> {
  const clientProfile =
    audience === 'client'
      ? await prisma.client.findUnique({ where: { userId: user.id }, select: { id: true } })
      : null;

  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    aud: audience,
    ...(clientProfile ? { cid: clientProfile.id } : {}),
  });

  const refreshToken = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      familyId,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: refreshExpiryDate(),
      userAgent: ctx.userAgent ?? null,
      ip: ctx.ip ?? null,
    },
  });

  return { accessToken, refreshToken };
}

/* --------------------------------------------------------- staff login */

/**
 * Email and password, for the console.
 *
 * Every failure returns the SAME message and the same shape. Distinguishing "no
 * such account" from "wrong password" turns the login form into a directory of
 * who works here — and `verifyPasswordConstantTime` makes the two paths cost the
 * same, so the distinction cannot be read off the clock either.
 */
export async function staffLogin(
  email: string,
  password: string,
  ctx: SessionContext,
): Promise<{ tokens: SessionTokens; user: { id: string; role: string; name: string } }> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, name: true, passwordHash: true, status: true },
  });

  const okPassword = await verifyPasswordConstantTime(password, user?.passwordHash);

  if (!user || !okPassword || user.status !== 'active' || !isStaffRole(user.role)) {
    throw new ApiError(401, 'invalid_credentials', 'That email and password do not match.');
  }

  const tokens = await issueSession(user, 'staff', newTokenFamily(), ctx);
  return { tokens, user: { id: user.id, role: user.role, name: user.name } };
}

/* --------------------------------------------------------- client OTP */

/**
 * Request a one-time code.
 *
 * The response is IDENTICAL whether or not the number belongs to a client. A
 * different answer for an unknown number would let anyone check who is a member
 * of a health programme, one number at a time — the membership itself is the
 * sensitive fact, before any record is opened.
 */
/**
 * Retire any live code for this number and mint a fresh one. Returns the code, or
 * null when the number is not an eligible client — the caller decides whether to
 * deliver it or hand it back.
 */
async function mintOtp(phone: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { phone },
    select: { id: true, role: true, status: true },
  });

  if (!user || user.status !== 'active' || !isClientRole(user.role)) {
    logger.debug({ phone }, 'otp requested for an unknown or ineligible number');
    return null;
  }

  /* one live code per number: a new request retires the previous one, so two
     codes in flight can never both work and the newest SMS is always the right one */
  await prisma.otp.updateMany({
    where: { phone, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const code = generateOtp();
  await prisma.otp.create({
    data: { phone, codeHash: hashOtp(code, phone), expiresAt: otpExpiry() },
  });

  return code;
}

export async function requestOtp(phone: string): Promise<{ sent: true }> {
  const code = await mintOtp(phone);
  if (code) await sendOtp(phone, code);
  return { sent: true };
}

/**
 * DEV ONLY — mint a code and HAND IT BACK, so the pixel harness signs in through
 * the real flow without scraping the API log (which is racy, and dies under the
 * DB resets a parallel session does). The route is registered only where
 * `env.ts` judged the process a genuine development box (`devRoutesAllowed`:
 * NODE_ENV outside production AND nothing that looks deployed — not merely
 * `!isProd`, because NODE_ENV defaults to development and a deployment that
 * forgot to set it must not hand out codes). This refusal is the second lock on
 * the same judgement, so a loosened route guard still cannot leak a live code —
 * the same stance `env.ts` takes refusing to boot production with
 * SMS_PROVIDER=console. `code` is null for an ineligible number, the same
 * non-answer `requestOtp` gives, so this never reveals who is a member.
 */
export async function devIssueOtp(phone: string): Promise<{ code: string | null }> {
  if (!devRoutesAllowed) throw ApiError.notFound('Not found.');
  return { code: await mintOtp(phone) };
}

/**
 * Verify a code and open a session.
 *
 * The attempt counter is incremented BEFORE the comparison and lives in
 * Postgres, not Redis: it is the guarantee that survives a cache flush, and it is
 * what makes a six-digit secret safe at all.
 */
export async function verifyOtp(
  phone: string,
  code: string,
  ctx: SessionContext,
): Promise<{ tokens: SessionTokens; user: { id: string; role: string; name: string } }> {
  const now = new Date();

  const record = await prisma.otp.findFirst({
    where: { phone, consumedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: 'desc' },
  });

  const invalid = new ApiError(401, 'invalid_code', 'That code is not right, or it has expired.');
  if (!record) throw invalid;

  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    await prisma.otp.update({ where: { id: record.id }, data: { consumedAt: now } });
    throw ApiError.tooMany('Too many wrong codes. Ask for a new one.');
  }

  await prisma.otp.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });

  if (record.codeHash !== hashOtp(code, phone)) throw invalid;

  const user = await prisma.user.findUnique({
    where: { phone },
    select: { id: true, role: true, name: true, status: true },
  });
  if (!user || user.status !== 'active' || !isClientRole(user.role)) throw invalid;

  /* consumed the moment it works — a code that opened a session must not open a
     second one, however quickly it is replayed */
  await prisma.otp.update({ where: { id: record.id }, data: { consumedAt: now } });

  const tokens = await issueSession(user, 'client', newTokenFamily(), ctx);
  return { tokens, user: { id: user.id, role: user.role, name: user.name } };
}

/* ------------------------------------------------------------- onboard */

export interface OnboardInput {
  name: string;
  phone: string;
  plan?: string | undefined;
  goal?: string | undefined;
  /* the five chapters, each skippable — see `onboardSchema` for why every one of
     these is optional and what an absent answer means */
  goals?: string[] | undefined;
  conditions?: string[] | undefined;
  fitness?: schemas.FitnessLevel | undefined;
  heightCm?: number | undefined;
  weightKg?: number | undefined;
  body?: { fat?: number; muscle?: number; protein?: number } | undefined;
}

/**
 * PUBLIC SELF-ONBOARDING — how a prospect with no account creates one.
 *
 * Token-less by nature: the caller has nothing to authenticate with yet. It leaves
 * two rows and signs the person straight in:
 *
 * - a `client` User keyed on the phone, so the OTP door opens for them next time;
 * - a SELF `Arrival` — the lead the console's pipeline works, its source marking
 *   that nobody keyed it by hand.
 *
 * It does NOT promote them to a Client: that is the care team's decision at the end
 * of the pipeline, not something a sign-up form gets to make. So the returned
 * session opens the onboarding-in-progress state, not the full app.
 *
 * The plan is validated for shape at the edge and for "actually on sale" here —
 * Svayam is not, this launch, and a body naming it is refused where the rule cannot
 * be skipped, exactly as the console's arrival create refuses it.
 */
export async function onboard(
  input: OnboardInput,
  ctx: SessionContext,
): Promise<{ tokens: SessionTokens; user: { id: string; role: string; name: string }; arrivalId: string }> {
  const plan = input.plan ?? 'poorna';
  if (!plansOnSale().includes(plan as never)) {
    throw ApiError.badRequest('That plan is not on sale yet.', { plan });
  }

  /* An existing number is not an error to shout about — it is someone who already
     has a door. Point them at it rather than making a second account they cannot
     use. */
  const existing = await prisma.user.findUnique({ where: { phone: input.phone }, select: { id: true } });
  if (existing) {
    throw new ApiError(409, 'already_registered', 'That number already has an account. Sign in instead.');
  }

  const { user, arrivalId } = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: { role: 'client', name: input.name, phone: input.phone, status: 'active' },
      select: { id: true, role: true, name: true },
    });
    const a = await tx.arrival.create({
      data: {
        name: input.name,
        phone: input.phone,
        source: 'SELF' as never,
        plan: (plan === 'svayam' ? 'SVAYAM' : 'POORNA') as never,
        /*
         * The note is what a coach READS on the rail, so it carries the goals in
         * the person's own words when they tapped chips rather than typing —
         * "Improve flexibility, Sleep better" is a briefing; an empty note beside
         * a full intake blob is a coach having to open a JSON column to find out
         * why somebody joined.
         */
        note: input.goal ?? (input.goals?.length ? input.goals.join(', ').slice(0, 280) : null),
        /*
         * EVERYTHING THEY ANSWERED, KEPT WHOLE. The typed columns a Client runs on
         * are derived from this at promotion (`birthClient`); this is the answer
         * itself, so a derivation can be re-read or corrected later without
         * having to ask the person a second time.
         */
        intake: {
          ...(input.goals?.length ? { goals: input.goals } : {}),
          ...(input.conditions?.length ? { conditions: input.conditions } : {}),
          ...(input.fitness ? { fitness: input.fitness } : {}),
          ...(input.heightCm != null ? { heightCm: input.heightCm } : {}),
          ...(input.weightKg != null ? { weightKg: input.weightKg } : {}),
          /* the track the programme will run them on, resolved ONCE here rather
             than re-derived by every reader of `fitness` */
          ...(input.fitness ? { track: schemas.trackForFitness(input.fitness) } : {}),
        },
        /*
         * THE TAPES GO WHERE THE SCAN GOES. `inbody` is the column promotion
         * already reads for height and weight (`birthClient`), so a self-declared
         * reading lands in the same place a keyed-in InBody report would — and
         * step 8's real scan overwrites it with the measured truth.
         */
        inbody:
          input.heightCm != null || input.weightKg != null || input.body
            ? {
                ...(input.heightCm != null ? { heightCm: input.heightCm } : {}),
                ...(input.weightKg != null ? { weightKg: input.weightKg } : {}),
                ...(input.body ?? {}),
                /* who said so — a number the client slid on a tape is not the same
                   evidence as one a machine printed, and the doctor reading it
                   should be able to tell them apart */
                source: 'self',
              }
            : undefined,
        step: FLOW[0]!.key,
        ticks: {},
        healed: {},
        podSeats: {},
        flowVersion: FLOW_VERSION,
        /* no staff keyed it — a self-arrival has a null creator by design */
        createdById: null,
      },
      select: { id: true },
    });
    return { user: u, arrivalId: a.id };
  });

  /*
   * THE FIRST MESSAGE, written by the same request that promised it.
   *
   * The sign-up deck's last screen says "your first message is waiting in My
   * Circle". A thread that then opened empty would break that promise in the
   * first minute, and an empty room reads as nobody being there — which is
   * exactly the wrong thing to tell somebody who has just joined and can see no
   * plan yet.
   *
   * Fire-and-forget: a greeting that fails to write must never fail the sign-up
   * that earned it. The worst case is a thread that opens empty, which is where
   * this started.
   */
  void arrivalCircle
    .openThread(arrivalId, input.name.trim().split(/\s+/)[0] ?? input.name)
    .catch((err: Error) => logger.error({ arrivalId, err: err.message }, 'arrival greeting failed'));

  const tokens = await issueSession(user, 'client', newTokenFamily(), ctx);
  return { tokens, user, arrivalId };
}

/* ------------------------------------------------------------- refresh */

/**
 * Rotate a refresh token.
 *
 * THE REUSE RULE: presenting a token that has already been rotated means someone
 * holds a copy — the legitimate holder would have the successor. There is no way
 * to tell which of the two is the thief, so the entire FAMILY is revoked and both
 * are sent back to the login screen. Losing a session is a small price; letting a
 * stolen token quietly renew itself for thirty days is not.
 */
export async function rotateRefresh(
  presented: string,
  ctx: SessionContext,
): Promise<{ tokens: SessionTokens; user: { id: string; role: string; name: string } }> {
  const tokenHash = hashRefreshToken(presented);
  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      familyId: true,
      expiresAt: true,
      revokedAt: true,
      user: { select: { id: true, role: true, name: true, status: true } },
    },
  });

  const invalid = new ApiError(401, 'invalid_refresh', 'Your session has ended. Please sign in again.');
  if (!row) throw invalid;

  if (row.revokedAt) {
    logger.warn({ userId: row.userId, familyId: row.familyId }, 'refresh token reuse — revoking family');
    await prisma.refreshToken.updateMany({
      where: { familyId: row.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw invalid;
  }

  if (row.expiresAt <= new Date()) throw invalid;
  if (row.user.status !== 'active') throw ApiError.forbidden('This account is no longer active.');

  const audience: Audience = isClientRole(row.user.role) ? 'client' : 'staff';
  const next = await issueSession(row.user, audience, row.familyId, ctx);

  await prisma.refreshToken.update({
    where: { id: row.id },
    data: { revokedAt: new Date(), replacedBy: hashRefreshToken(next.refreshToken) },
  });

  return {
    tokens: next,
    user: { id: row.user.id, role: row.user.role, name: row.user.name },
  };
}

/** Sign out. Revokes the whole family, so every device on that session drops. */
export async function logout(presented: string | undefined): Promise<void> {
  if (!presented) return;
  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(presented) },
    select: { familyId: true },
  });
  if (!row) return;
  await prisma.refreshToken.updateMany({
    where: { familyId: row.familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/* ------------------------------------------------------------------ me */

/**
 * The signed-in person and their role definition.
 *
 * The role comes from the Role TABLE, not the code matrix, so a Configuration
 * edit reaches the sidebar without a deploy — and the shared matrix is the
 * fallback when a row is somehow missing, never an empty nav that would look
 * like a permissions failure.
 */
export async function me(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      subtitle: true,
      dept: true,
      level: true,
      joinedAt: true,
      avail: true,
      tz: true,
      tzo: true,
      tzLabel: true,
      status: true,
      clientProfile: { select: { id: true, plan: true, cycle: true, cycleDay: true } },
    },
  });
  if (!user) throw ApiError.unauthorized();

  const row = await prisma.role.findUnique({ where: { key: user.role } });
  const fallback = roleDef(user.role);

  return {
    user,
    role: row
      ? { key: row.key, title: row.title, shell: row.shell, home: row.home, nav: row.nav, perms: row.perms }
      : {
          key: user.role,
          title: fallback?.title ?? user.role,
          shell: fallback?.shell ?? 'console',
          home: fallback?.home ?? '#/home',
          nav: fallback?.nav ?? [],
          perms: fallback?.perms ?? [],
        },
  };
}

/** Housekeeping: drop refresh tokens that expired more than a week ago. */
export async function pruneRefreshTokens(): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 86_400_000);
  const { count } = await prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: cutoff } } });
  return count;
}

export const _internals = { randomUUID };
