import type { Prisma } from '@prisma/client';

import { prisma } from '../config/prisma.js';

/**
 * The audit trail.
 *
 * Two kinds of row land here and both matter:
 *
 *  - `denied` — every refusal. The demo's lock screen tells the user "This
 *    access attempt was logged"; in production that has to be a fact.
 *  - the acts that change who is answerable for whom — a pod seat assigned, a
 *    role changed, a capacity ceiling overridden. Those all carry a REASON,
 *    because "why is Vikram on this client" needs an answer with a name on it
 *    six months later, and the row is the only place that answer survives.
 *
 * Writes are best-effort at the call site and never inside the same transaction
 * as the change: a failed log must not roll back a legitimate act, and an act
 * that succeeded must not be reported as failed because its log did not.
 */

export interface AuditInput {
  actorId?: string | null;
  action: string;
  subjectType: string;
  subjectId?: string | null;
  reason?: string | null;
  meta?: Prisma.InputJsonValue;
  ip?: string | null;
}

export async function record(input: AuditInput) {
  return prisma.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      action: input.action,
      subjectType: input.subjectType,
      subjectId: input.subjectId ?? null,
      reason: input.reason ?? null,
      meta: input.meta ?? {},
      ip: input.ip ?? null,
    },
  });
}

export interface ListAuditQuery {
  actorId?: string;
  action?: string;
  subjectType?: string;
  subjectId?: string;
  take: number;
  skip: number;
}

export async function list(q: ListAuditQuery) {
  const where: Prisma.AuditLogWhereInput = {
    ...(q.actorId ? { actorId: q.actorId } : {}),
    ...(q.action ? { action: q.action } : {}),
    ...(q.subjectType ? { subjectType: q.subjectType } : {}),
    ...(q.subjectId ? { subjectId: q.subjectId } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { at: 'desc' },
      take: q.take,
      skip: q.skip,
      include: { actor: { select: { id: true, name: true, role: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { rows, total };
}
