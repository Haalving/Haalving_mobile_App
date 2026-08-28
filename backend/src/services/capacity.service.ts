import type { schemas } from '@haalving/shared';
import type { z } from 'zod';

import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';
import { can } from '../middleware/authorize.js';
import * as audit from './audit.service.js';

type UpdateCapacityInput = z.infer<typeof schemas.updateCapacitySchema>;

/**
 * Coach capacity.
 *
 * DECLARED, NEVER DERIVED — the demo says so in as many words, and it is right:
 * "how many clients a coach carries, deliberately narrative (Vikram reads 50/50
 * FULL while carrying six) — and must not be derived."
 *
 * Counting pod seats would turn a judgement into a database artefact. A coach
 * with six clients on the books can still be full, because what fills up is the
 * WEEK, not the client count — and the person who runs the bench is the one who
 * knows. So both numbers are typed in and nothing here counts anything.
 */

export async function get(staffId: string) {
  const row = await prisma.capacity.findUnique({
    where: { staffId },
    include: { staff: { select: { id: true, name: true, role: true, dept: true } } },
  });
  if (!row) throw ApiError.notFound('No capacity record for that person.');
  return row;
}

export async function listAll() {
  return prisma.capacity.findMany({
    include: { staff: { select: { id: true, name: true, role: true, dept: true, status: true } } },
    orderBy: { staff: { name: 'asc' } },
  });
}

/**
 * Set the ceiling and the load.
 *
 * Raising the LOAD past the declared ceiling is a decision somebody signs for, so
 * it needs `overrideCapacity` and a reason on the audit row. Raising the CEILING
 * itself is ordinary bench management and needs neither — that is the person
 * declaring what they can carry, which is exactly what the field is for.
 */
export async function update(
  staffId: string,
  input: UpdateCapacityInput,
  actor: { id: string; role: string },
  opts: { reason?: string; ip?: string } = {},
) {
  const staff = await prisma.user.findUnique({ where: { id: staffId }, select: { id: true, name: true } });
  if (!staff) throw ApiError.notFound('No such person.');

  const before = await prisma.capacity.findUnique({ where: { staffId } });
  const load = input.load ?? before?.load ?? 0;

  if (load > input.declared) {
    if (!(await can(actor.role, 'overrideCapacity'))) {
      throw ApiError.forbidden(
        `${staff.name} would be over their declared capacity. Only the Operations Head or a Super Admin can approve that.`,
      );
    }
    if (!opts.reason) {
      throw ApiError.badRequest('Going past a declared ceiling needs a reason on the record.', {
        reason: 'Required to go over capacity',
      });
    }
  }

  const row = await prisma.capacity.upsert({
    where: { staffId },
    create: { staffId, declared: input.declared, load, note: input.note ?? null },
    update: {
      declared: input.declared,
      load,
      ...(input.note !== undefined ? { note: input.note } : {}),
    },
  });

  await audit.record({
    actorId: actor.id,
    action: load > input.declared ? 'capacity.override' : 'capacity.update',
    subjectType: 'user',
    subjectId: staffId,
    reason: opts.reason ?? null,
    meta: {
      from: before ? { declared: before.declared, load: before.load } : null,
      to: { declared: row.declared, load: row.load },
    },
    ip: opts.ip ?? null,
  });

  return row;
}
