import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { can as codeCan, type NavKey, type Perm } from '@haalving/shared';

import { prisma } from '../config/prisma.js';
import { redis } from '../config/redis.js';
import { ApiError } from '../utils/apiResponse.js';
import { logger } from '../utils/logger.js';
import { requireUser } from './authenticate.js';

/**
 * The third gate.
 *
 * The demo enforces access twice — the router blocks the route, and sensitive
 * sub-sections re-check `HV.can()` inside the view. Both of those are still
 * there in the port, and both are still only advice: a browser is a client, and a
 * client can be edited. THIS is the enforcement. Every rule the UI states is
 * restated here, and the UI's copy is never the reason a request is allowed.
 *
 * Every refusal writes an audit row with action `denied` — the demo's lock screen
 * says "This access attempt was logged", and in production that has to be true
 * rather than reassuring.
 */

/**
 * The live matrix, read from the Role table so a Configuration edit takes effect
 * without a deploy — exactly as `HV.roleDef` reads the store before falling back
 * to the code matrix. The shared matrix is the seed AND the fallback: if the row
 * is missing, we do not fail open.
 */
/**
 * A 30-SECOND CACHE, and the reason for both halves of that number.
 *
 * This is the hottest read in the API — every authorised request asks it — and it
 * is a table that changes a few times a year. But it decides ACCESS, so a stale
 * answer is a permission somebody has already been told they no longer have.
 * Thirty seconds is short enough that a forgotten invalidation self-heals within
 * one page load, and every write path calls `invalidateRoleCache` so the normal
 * case is immediate.
 *
 * Redis failing must never deny a request: the cache is skipped and the row is
 * read, exactly as it was before the cache existed.
 */
const ROLE_TTL = 30;
const roleKey = (role: string) => `role:${role}`;

async function roleRow(role: string): Promise<{ perms: string[]; nav: string[] } | null> {
  try {
    const hit = await redis.get(roleKey(role));
    if (hit) return JSON.parse(hit) as { perms: string[]; nav: string[] };
  } catch {
    /* a cache that is down is not an authorisation answer */
  }

  const row = await prisma.role.findUnique({
    where: { key: role },
    select: { perms: true, nav: true },
  });
  if (!row) return null;

  try {
    await redis.set(roleKey(role), JSON.stringify(row), 'EX', ROLE_TTL);
  } catch {
    /* likewise */
  }
  return row;
}

/** Called by every write on the Roles tab, so an edit lands on the next request. */
export async function invalidateRoleCache(role: string): Promise<void> {
  try {
    await redis.del(roleKey(role));
  } catch {
    /* the TTL is the backstop */
  }
}

async function permsFor(role: string): Promise<Set<string>> {
  const row = await roleRow(role);
  /* a MISSING row does not fail open — an unknown role holds nothing */
  return new Set(row?.perms ?? []);
}

async function navFor(role: string): Promise<Set<string>> {
  const row = await roleRow(role);
  return new Set(row?.nav ?? []);
}

export async function recordDenial(
  req: Request,
  what: string,
  detail: Record<string, unknown> = {},
): Promise<void> {
  const actorId = req.user?.id ?? null;
  try {
    await prisma.auditLog.create({
      data: {
        actorId,
        action: 'denied',
        subjectType: 'access',
        subjectId: what,
        reason: `Blocked: ${what}`,
        meta: {
          method: req.method,
          path: req.originalUrl,
          role: req.user?.role ?? null,
          ...detail,
        },
        ip: req.ip ?? null,
      },
    });
  } catch (err) {
    /* the refusal itself must not depend on the audit write succeeding — a
       failed log turns a 403 into a 500 and hands the caller a different answer
       than the one the policy reached */
    logger.error({ err: (err as Error).message, what }, 'could not record denial');
  }
}

/** Does this role hold this permission? Live matrix first, code matrix as backstop. */
export async function can(role: string, perm: Perm): Promise<boolean> {
  const live = await permsFor(role);
  return live.size ? live.has(perm) : codeCan(role, perm);
}

/**
 * Require a permission. The message deliberately says only that the role lacks
 * it — naming the permission would map the matrix for anyone probing it.
 */
export function requirePerm(perm: Perm): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!(await can(user.role, perm))) {
        await recordDenial(req, `perm:${perm}`, { perm });
        throw ApiError.forbidden('Not available for your role.');
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Any one of these permissions is enough. */
export function requireAnyPerm(...perms: Perm[]): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const held = await permsFor(user.role);
      const allowed = held.size
        ? perms.some((p) => held.has(p))
        : perms.some((p) => codeCan(user.role, p));
      if (!allowed) {
        await recordDenial(req, `perm:${perms.join('|')}`, { perms });
        throw ApiError.forbidden('Not available for your role.');
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Require one of a fixed list of roles. Used where a permission would be coarse. */
export function requireRole(...roles: string[]): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!roles.includes(user.role)) {
        await recordDenial(req, `role:${roles.join('|')}`, { roles });
        throw ApiError.forbidden('Not available for your role.');
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Console access IS nav membership — the rule `HV.allowedView` keeps, so a role
 * that gains a sidebar item gains its pages with it and no second list has to be
 * maintained.
 */
export function requireNav(key: NavKey): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const nav = await navFor(user.role);
      if (!nav.has(key)) {
        await recordDenial(req, `nav:${key}`, { nav: key });
        throw ApiError.forbidden('Not available for your role.');
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
