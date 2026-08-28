import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { can as codeCan, type NavKey, type Perm } from '@haalving/shared';

import { prisma } from '../config/prisma.js';
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
async function permsFor(role: string): Promise<Set<string>> {
  const row = await prisma.role.findUnique({ where: { key: role }, select: { perms: true } });
  if (row) return new Set(row.perms);
  return new Set();
}

async function navFor(role: string): Promise<Set<string>> {
  const row = await prisma.role.findUnique({ where: { key: role }, select: { nav: true } });
  if (row) return new Set(row.nav);
  return new Set();
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
