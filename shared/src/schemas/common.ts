import { z } from 'zod';

import { NAV_KEYS, PERMS, STORABLE_ROLE_KEYS } from '../rbac.js';
import { DEPT_KEYS, PILLAR_KEYS, POD_SEATS } from '../pillars.js';
import { PLAN_KEYS } from '../plans.js';

/**
 * The vocabularies, as Zod enums. Built from the same constant arrays the RBAC
 * matrix and the pillar map export, so a role added in `rbac.ts` is accepted by
 * every request body without a second edit — and one removed is rejected.
 */

export const roleEnum = z.enum(STORABLE_ROLE_KEYS as [string, ...string[]]);
export const navKeyEnum = z.enum(NAV_KEYS as unknown as [string, ...string[]]);
export const permEnum = z.enum(PERMS as unknown as [string, ...string[]]);
export const pillarEnum = z.enum(PILLAR_KEYS as unknown as [string, ...string[]]);
export const podSeatEnum = z.enum(POD_SEATS as unknown as [string, ...string[]]);
export const deptEnum = z.enum(DEPT_KEYS as [string, ...string[]]);
export const planEnum = z.enum(PLAN_KEYS as unknown as [string, ...string[]]);

/** `'HH:MM'` on a 24-hour clock — the shape `<input type="time">` hands over. */
export const timeString = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected a 24-hour clock time, e.g. 09:00');

/** A local ISO date. Never a timestamp: the product's clocks are local-time. */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date as YYYY-MM-DD');

/**
 * Indian mobile numbers as the demo stores them, and as a client will type them.
 * Normalised to E.164 so one person cannot hold two accounts by spacing a number
 * differently.
 */
export const phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ''))
  .refine((v) => /^(\+91)?[6-9]\d{9}$/.test(v), 'Expected an Indian mobile number')
  .transform((v) => (v.startsWith('+91') ? v : `+91${v}`));

export const email = z.string().trim().toLowerCase().email();

/**
 * Passwords. Length before composition: a long passphrase beats a short one
 * wearing a symbol, and a rule nobody can satisfy pushes people to reuse.
 */
export const password = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(200, 'That is longer than any password needs to be');

export const cuid = z.string().min(1);

export const paginationQuery = z.object({
  take: z.coerce.number().int().min(1).max(200).default(50),
  skip: z.coerce.number().int().min(0).default(0),
});

/* --------------------------------------------------------- availability */

const availRange = z.tuple([timeString, timeString]).refine((r) => r[0] < r[1], {
  message: 'A window has to end after it starts',
});

/**
 * A weekday holds ONE range, SEVERAL, or nothing.
 *
 * The split shift is not a curiosity — Vikram carries six one-on-ones across
 * early mornings and evenings, and five and a half hours of sessions fit in no
 * single window. Both shapes are accepted so no stored record needs migrating.
 */
export const availDay = z.union([availRange, z.array(availRange), z.null()]);

export const availability = z.object({
  sun: availDay.optional(),
  mon: availDay.optional(),
  tue: availDay.optional(),
  wed: availDay.optional(),
  thu: availDay.optional(),
  fri: availDay.optional(),
  sat: availDay.optional(),
});

export type Availability = z.infer<typeof availability>;

/* -------------------------------------------------------------- levels */

/**
 * The four pillar levels — and there is NO headline level. The four are the
 * whole reading and nothing may reduce them to one number, so this object has
 * exactly four keys and no aggregate.
 */
export const pillarLevels = z.object({
  fitness: z.number().int().min(1).max(7),
  culture: z.number().int().min(1).max(7),
  yoga: z.number().int().min(1).max(7),
  wellness: z.number().int().min(1).max(7),
});

export type PillarLevels = z.infer<typeof pillarLevels>;

/**
 * The Home tabs that carry a "new since you last looked" count.
 *
 * `dash` is deliberately absent: a summary is never unread, and the demo's
 * `tabModel` declares `ids: null` for it for exactly that reason.
 */
export const seenTabEnum = z.enum([
  'attention',
  'replies',
  'followups',
  'tasks',
  'notices',
  'sessions',
]);
