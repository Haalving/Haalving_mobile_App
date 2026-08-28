import { ROLES, isGuardedNav, isGuardedPerm, navPath, type Role } from '@haalving/shared';

import { prisma } from '../config/prisma.js';
import { invalidateRoleCache } from '../middleware/authorize.js';
import { ApiError } from '../utils/apiResponse.js';
import * as audit from './audit.service.js';

/**
 * The RBAC matrix as editable data.
 *
 * The demo does exactly this: `HV.roleDef` reads the store first and falls back
 * to the code matrix, which is what lets a runtime-created role gain pages by
 * ticking a nav box in People & Access. The shared matrix stays the seed AND the
 * fallback.
 *
 * TWO THINGS ARE NOT EDITABLE, and both are refusals rather than filters:
 *
 *  - a role's KEY. The key is written into client records (`pod.dietitian`),
 *    into scoping and into the frontends. Renaming one at runtime would orphan
 *    every seat that named it.
 *  - a permission that does not exist. Accepting an unknown string would create a
 *    permission nothing ever checks — a tick box that grants nothing, which is
 *    the most misleading state an access screen can be in.
 */

const KNOWN_PERMS = new Set(
  Object.values(ROLES).flatMap((r) => ('perms' in r ? [...r.perms] : [])),
);
const KNOWN_NAV = new Set(
  Object.values(ROLES).flatMap((r) => ('nav' in r && r.nav ? [...r.nav] : [])),
);

export async function list() {
  return prisma.role.findMany({ orderBy: { key: 'asc' } });
}

export async function get(key: string) {
  const row = await prisma.role.findUnique({ where: { key } });
  if (!row) throw ApiError.notFound('No such role.');
  return row;
}

export interface UpdateRoleInput {
  title?: string;
  nav?: string[];
  perms?: string[];
}

export async function update(key: string, input: UpdateRoleInput, actorId: string, ip?: string) {
  const before = await prisma.role.findUnique({ where: { key } });
  if (!before) throw ApiError.notFound('No such role.');

  if (input.nav) {
    const unknown = input.nav.filter((n) => !KNOWN_NAV.has(n as never));
    if (unknown.length) {
      throw ApiError.badRequest(`No such sidebar item: ${unknown.join(', ')}.`, { nav: 'Unknown item' });
    }
  }
  if (input.perms) {
    const unknown = input.perms.filter((p) => !KNOWN_PERMS.has(p as never));
    if (unknown.length) {
      throw ApiError.badRequest(`No such permission: ${unknown.join(', ')}.`, { perms: 'Unknown permission' });
    }
  }

  /* the Doctor is the only role with rawRecords, and several screens are written
     around that being true — raw medical documents stop at her desk and the pod
     sees only the signed summary. Handing it to a second role is a clinical
     decision, not a console toggle. */
  if (input.perms?.includes('rawRecords') && key !== 'doctor') {
    throw ApiError.badRequest(
      'Raw medical records are the Doctor’s alone. That boundary is not a console setting.',
      { perms: 'rawRecords cannot be granted here' },
    );
  }

  const row = await prisma.role.update({
    where: { key },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.nav !== undefined ? { nav: input.nav } : {}),
      ...(input.perms !== undefined ? { perms: input.perms } : {}),
    },
  });

  await invalidateRoleCache(key);

  await audit.record({
    actorId,
    action: 'role.update',
    subjectType: 'role',
    subjectId: key,
    meta: {
      navFrom: before.nav,
      navTo: row.nav,
      permsFrom: before.perms,
      permsTo: row.perms,
    },
    ip: ip ?? null,
  });

  return row;
}

/** Seed or repair the table from the shared matrix. Idempotent. */
export async function syncFromCode(): Promise<number> {
  const keys = Object.keys(ROLES) as Role[];
  for (const key of keys) {
    const def = ROLES[key];
    await prisma.role.upsert({
      where: { key },
      create: {
        key,
        title: def.title,
        shell: def.shell,
        home: def.home,
        nav: 'nav' in def && def.nav ? [...def.nav] : [],
        perms: 'perms' in def && def.perms ? [...def.perms] : [],
      },
      update: {},
    });
  }
  return keys.length;
}

/* ═══════════════ the Roles & permissions tab ═══════════════ */

/*
 * Renaming is `update({ title })` above — it already audits and now invalidates.
 * A second `rename()` would be the same write under a different name, and the
 * only thing two of them can do is disagree.
 */

/**
 * One sidebar chip, toggled.
 *
 * Two rules meet here. THE GUARD: admin can never lose `people`, or a Super Admin
 * could strand every seat with nobody left able to open this page and undo it —
 * refused with a 409 even though the console renders the chip disabled, because a
 * disabled chip is a hint.
 *
 * AND THE ORPHANED HOME: turning off the item a role LANDS on would sign somebody
 * in to a page their own sidebar no longer carries. So `home` is re-pointed at the
 * first item they still have.
 */
export async function toggleNav(
  key: string,
  navId: string,
  on: boolean,
  actorId: string,
  ip?: string,
) {
  const before = await prisma.role.findUnique({ where: { key } });
  if (!before) throw ApiError.notFound('No such role.');

  if (!on && isGuardedNav(key, navId)) {
    throw ApiError.conflict(
      'People & Access has to stay on the Super Admin, or nobody can undo it.',
      { guarded: true },
    );
  }

  const next = on
    ? [...new Set([...before.nav, navId])]
    : before.nav.filter((n) => n !== navId);

  if (!next.length) {
    throw ApiError.conflict('A role needs at least one page to land on.');
  }

  /* re-point home if the page it named has just gone */
  let home = before.home;
  const homeKey = home.replace(/^#\//, '').split('/')[0];
  if (!next.includes(homeKey as never)) {
    home = navPath(next[0] as never).replace(/^\//, '#/');
  }

  const row = await prisma.role.update({ where: { key }, data: { nav: next, home } });
  await invalidateRoleCache(key);

  await audit.record({
    actorId,
    action: 'role.nav_changed',
    subjectType: 'role',
    subjectId: key,
    meta: { navId, on, from: before.nav, to: next, homeFrom: before.home, homeTo: home },
    ip: ip ?? null,
  });
  return row;
}

/** One permission chip, toggled. Same guard, and the same rawRecords boundary. */
export async function togglePerm(
  key: string,
  perm: string,
  on: boolean,
  actorId: string,
  ip?: string,
) {
  const before = await prisma.role.findUnique({ where: { key } });
  if (!before) throw ApiError.notFound('No such role.');

  if (!on && isGuardedPerm(key, perm)) {
    throw ApiError.conflict(
      'Manage people & roles has to stay on the Super Admin, or nobody can undo it.',
      { guarded: true },
    );
  }
  if (on && perm === 'rawRecords' && key !== 'doctor') {
    throw ApiError.badRequest(
      'Raw medical records are the Doctor’s alone. That boundary is not a console setting.',
      { perms: 'rawRecords cannot be granted here' },
    );
  }

  const next = on ? [...new Set([...before.perms, perm])] : before.perms.filter((p) => p !== perm);
  const row = await prisma.role.update({ where: { key }, data: { perms: next } });
  await invalidateRoleCache(key);

  await audit.record({
    actorId,
    action: 'role.perm_changed',
    subjectType: 'role',
    subjectId: key,
    meta: { perm, on, from: before.perms, to: next },
    ip: ip ?? null,
  });
  return row;
}

/**
 * A new role, started from an existing one.
 *
 * Copying the base's nav, perms and home is not a convenience: a role built from
 * nothing shows its first holder an empty console, which reads as broken. Starting
 * from a seat that works leaves the differences to be taken AWAY, which is the
 * safer direction to be wrong in.
 */
export async function createRole(title: string, baseKey: string, actorId: string, ip?: string) {
  const base = await prisma.role.findUnique({ where: { key: baseKey } });
  if (!base) throw ApiError.notFound('No such role to start from.');

  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (!slug) throw ApiError.badRequest('That name has no letters in it.');

  /* `r-` prefixed so a created role can never collide with a code role key, and
     suffixed on collision rather than overwriting somebody else's seat */
  let key = `r-${slug}`;
  for (let n = 2; await prisma.role.findUnique({ where: { key } }); n++) key = `r-${slug}${n}`;

  const row = await prisma.role.create({
    data: {
      key,
      title,
      shell: base.shell,
      home: base.home,
      nav: base.nav,
      perms: base.perms,
    },
  });

  await audit.record({
    actorId,
    action: 'role.created',
    subjectType: 'role',
    subjectId: key,
    meta: { title, baseKey, nav: row.nav, perms: row.perms },
    ip: ip ?? null,
  });
  return row;
}

/** How many people hold each role — the headcount on each card. */
export async function headcounts(): Promise<Record<string, number>> {
  const rows = await prisma.user.groupBy({
    by: ['role'],
    where: { role: { not: 'client' } },
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((r) => [r.role as string, r._count._all]));
}
