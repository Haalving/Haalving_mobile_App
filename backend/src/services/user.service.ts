import { Prisma } from '@prisma/client';
import type { schemas } from '@haalving/shared';
import { z } from 'zod';

import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';
import { startOfDay } from '../utils/dates.js';
import { hashPassword } from '../utils/password.js';
import * as audit from './audit.service.js';

type CreateUserInput = z.infer<typeof schemas.createUserSchema>;
type UpdateUserInput = z.infer<typeof schemas.updateUserSchema>;
type ListUsersQuery = z.infer<typeof schemas.listUsersQuery>;

/**
 * The staff record — People & Access edits it, Time & Cover reads its
 * availability, and the conflict engine refuses a booking outside it.
 */

/** Never select `passwordHash`. The one place the shape is decided. */
const publicUser = {
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
  emergency: true,
  tags: true,
  cv: true,
  status: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export async function list(q: ListUsersQuery) {
  const where: Prisma.UserWhereInput = {
    ...(q.role ? { role: q.role as never } : {}),
    ...(q.dept ? { dept: q.dept as never } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.q
      ? {
          OR: [
            { name: { contains: q.q, mode: 'insensitive' } },
            { email: { contains: q.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  return prisma.user.findMany({
    where,
    select: { ...publicUser, capacity: { select: { declared: true, load: true, note: true } } },
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
  });
}

export async function get(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      ...publicUser,
      capacity: { select: { declared: true, load: true, note: true } },
      podSeats: {
        select: { seat: true, client: { select: { id: true, name: true, plan: true } } },
      },
    },
  });
  if (!user) throw ApiError.notFound('No such person.');
  return user;
}

export async function create(input: CreateUserInput, actorId: string, ip?: string) {
  if (input.email) {
    const clash = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
    if (clash) throw ApiError.conflict('Someone already signs in with that email.');
  }
  if (input.phone) {
    const clash = await prisma.user.findUnique({ where: { phone: input.phone }, select: { id: true } });
    if (clash) throw ApiError.conflict('Someone already signs in with that number.');
  }

  const user = await prisma.user.create({
    data: {
      name: input.name,
      role: input.role as never,
      email: input.email ?? null,
      phone: input.phone ?? null,
      passwordHash: input.password ? await hashPassword(input.password) : null,
      subtitle: input.subtitle ?? null,
      dept: (input.dept ?? null) as never,
      level: input.level ?? null,
      joinedAt: input.joinedAt ? startOfDay(input.joinedAt) : new Date(),
      avail: (input.avail ?? {}) as Prisma.InputJsonValue,
      tz: input.tz,
      emergency: (input.emergency ?? undefined) as Prisma.InputJsonValue | undefined,
      tags: input.tags ?? [],
      memo: input.memo ?? null,
      /* the NAME only. `cv` holds the object-storage key and there is no store
         yet, so it stays null — a key pointing at nothing is worse than none. */
      cvName: input.cvName ?? null,
      status: input.status,
      /* every coach gets a capacity row at zero. Declared, never derived — the
         row exists so the number has a home the moment someone types one, and a
         missing row would otherwise read as "unlimited" on the allocation picker. */
      capacity: { create: { declared: 0, load: 0 } },
    },
    select: publicUser,
  });

  await audit.record({
    actorId,
    action: 'user.create',
    subjectType: 'user',
    subjectId: user.id,
    meta: { role: user.role, dept: user.dept },
    ip: ip ?? null,
  });

  return user;
}

export async function update(id: string, input: UpdateUserInput, actorId: string, ip?: string) {
  const before = await prisma.user.findUnique({ where: { id }, select: publicUser });
  if (!before) throw ApiError.notFound('No such person.');

  /* an HoD leads one bench, and their whole scope is "the clients of my
     department" — clearing it would silently empty their client list, which
     reads as a permissions bug rather than an unfinished record */
  if (before.role === 'hod' && input.dept === null) {
    throw ApiError.badRequest('A Head of Department leads one bench — say which.', {
      dept: 'Required for this role',
    });
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.subtitle !== undefined ? { subtitle: input.subtitle } : {}),
      ...(input.dept !== undefined ? { dept: input.dept as never } : {}),
      ...(input.level !== undefined ? { level: input.level } : {}),
      ...(input.joinedAt !== undefined ? { joinedAt: startOfDay(input.joinedAt) } : {}),
      ...(input.tz !== undefined ? { tz: input.tz } : {}),
      /* DbNull, not `undefined`: Prisma reads an undefined field as "leave it
         alone", so clearing a contact would have quietly kept the old one — and
         the number the console then shows in an emergency is the wrong one. */
      ...(input.emergency !== undefined
        ? {
            emergency: (input.emergency ?? Prisma.DbNull) as
              | Prisma.NullableJsonNullValueInput
              | Prisma.InputJsonValue,
          }
        : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.memo !== undefined ? { memo: input.memo } : {}),
      ...(input.cvKey !== undefined ? { cv: input.cvKey } : {}),
      ...(input.cvName !== undefined ? { cvName: input.cvName } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
    select: publicUser,
  });

  await audit.record({
    actorId,
    action: 'user.update',
    subjectType: 'user',
    subjectId: id,
    meta: { fields: Object.keys(input) },
    ip: ip ?? null,
  });

  return user;
}

/**
 * A role change travels alone and carries its reason.
 *
 * It rewrites what a person can see, so it must not ride along with a corrected
 * phone number — and the reason goes on the audit row, which is the only place
 * "why does this coach now see every client" survives to be asked later.
 */
export async function changeRole(
  id: string,
  input: z.infer<typeof schemas.changeRoleSchema>,
  actorId: string,
  ip?: string,
) {
  const before = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  if (!before) throw ApiError.notFound('No such person.');

  if (input.role === 'hod' && !input.dept) {
    throw ApiError.badRequest('A Head of Department leads one bench — say which.', {
      dept: 'Required for this role',
    });
  }

  const user = await prisma.user.update({
    where: { id },
    data: { role: input.role as never, dept: (input.dept ?? null) as never },
    select: publicUser,
  });

  await audit.record({
    actorId,
    action: 'user.role.change',
    subjectType: 'user',
    subjectId: id,
    reason: input.reason,
    meta: { from: before.role, to: input.role, dept: input.dept ?? null },
    ip: ip ?? null,
  });

  return user;
}

/**
 * Declared working hours.
 *
 * Accepts one window a day or several — the split shift is a real shape, not an
 * edge case, and both are stored as given so nothing needs migrating later.
 */
export async function updateAvailability(
  id: string,
  avail: z.infer<typeof schemas.availability>,
  actorId: string,
  ip?: string,
) {
  const exists = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw ApiError.notFound('No such person.');

  const user = await prisma.user.update({
    where: { id },
    data: { avail: avail as Prisma.InputJsonValue },
    select: publicUser,
  });

  await audit.record({
    actorId,
    action: 'user.availability.update',
    subjectType: 'user',
    subjectId: id,
    meta: { days: Object.keys(avail) },
    ip: ip ?? null,
  });

  return user;
}
