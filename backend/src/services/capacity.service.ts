import type { Prisma } from '@prisma/client';
import type { schemas } from '@haalving/shared';
import type { z } from 'zod';

import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';
import { can } from '../middleware/authorize.js';
import * as audit from './audit.service.js';

type UpdateCapacityInput = z.infer<typeof schemas.updateCapacitySchema>;

/**
 * How much room an override buys. Five, not unlimited: an override is meant to
 * let one allocation through on a judgement, and a ceiling raised without limit
 * is a ceiling nobody is declaring any more.
 */
const OVERRIDE_HEADROOM = 5;

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

/**
 * The gate an allocation passes through — shared with the pipeline board when it
 * lands, which is why it lives here and not inside arrivals.service.
 *
 * THE CEILING IS WHAT MOVES, NOT THE LOAD. An override is somebody signing for a
 * bench that is already full, so it raises `declared` by five and says why on the
 * audit row. The load itself moves at PROMOTION, when a real client is actually
 * seated — an arrival that never finishes must not leave a coach carrying a
 * number for somebody who does not exist.
 *
 * Refusal is a 409 rather than a 403: the caller is allowed to allocate, the
 * bench simply has no room, and those are different problems with different
 * remedies. The message names the person, because "capacity full" without a name
 * is unactionable on a five-seat pod.
 */
export async function checkAndReserve(
  staffId: string,
  actor: { id: string; role: string },
  override?: { staffId: string; reason: string },
  opts: { ip?: string; tx?: Prisma.TransactionClient } = {},
): Promise<{ overrode: boolean }> {
  const db = opts.tx ?? prisma;

  const staff = await db.user.findUnique({ where: { id: staffId }, select: { id: true, name: true } });
  if (!staff) throw ApiError.notFound('No such person.');

  const row = await db.capacity.findUnique({ where: { staffId } });
  /* a missing record reads as a ceiling of zero, never as unlimited — the seed
     gives every staff member a row for exactly this reason */
  const declared = row?.declared ?? 0;
  const load = row?.load ?? 0;

  if (load < declared) return { overrode: false };

  const forThisStaff = override && override.staffId === staffId ? override : null;

  if (!forThisStaff) {
    throw new ApiError(
      409,
      'CAPACITY_FULL',
      `${staff.name} is at ${load} of ${declared}. Full — Ops Head override required, reason logged.`,
      { staffId, staffName: staff.name, load, declared },
    );
  }

  if (!(await can(actor.role, 'overrideCapacity'))) {
    throw ApiError.forbidden('Ops Head only. This attempt was logged.');
  }
  /* the schema already floors the reason; this is the second guard, because the
     sheet's promise — "A reason is required. It goes to the audit log." — must
     hold even for a caller that never saw the sheet */
  if (!forThisStaff.reason?.trim()) {
    throw ApiError.badRequest('A reason is required. It goes to the audit log.', {
      reason: 'Required to go over capacity',
    });
  }

  const raised = declared + OVERRIDE_HEADROOM;
  await db.capacity.upsert({
    where: { staffId },
    create: { staffId, declared: raised, load },
    update: { declared: raised },
  });

  await audit.record({
    actorId: actor.id,
    action: 'capacity.override',
    subjectType: 'user',
    subjectId: staffId,
    reason: forThisStaff.reason,
    meta: { from: { declared, load }, to: { declared: raised, load } },
    ip: opts.ip ?? null,
  });

  return { overrode: true };
}
