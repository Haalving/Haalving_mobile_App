import { ROLES, type Role } from '@haalving/shared';

import { prisma } from '../config/prisma.js';
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
