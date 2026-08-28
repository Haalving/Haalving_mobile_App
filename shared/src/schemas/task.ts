import { z } from 'zod';

import {
  DAY_END_MIN,
  DAY_START_MIN,
  KIND_KEYS,
  RECUR,
  RESP_KEYS,
  SNAP_MIN,
  isKnownGroupId,
} from '../schedule.js';
import { isoDate } from './common.js';

/**
 * The bodies of the Schedule.
 *
 * The time rules are asserted HERE as well as in the service, because they are
 * shape rules rather than judgements: 07:00-21:00 on a quarter-hour is what the
 * grid can draw, and a body outside it is malformed rather than merely refused.
 * The CONFLICT rules — busy, declared hours, leave — are the opposite and live
 * only in the service, because they depend on everyone else's day.
 */

/** A minute of the day the grid can actually place: 07:00-21:00, on the snap. */
export const startMinute = z
  .number()
  .int()
  .min(DAY_START_MIN, 'The day starts at 07:00')
  .max(DAY_END_MIN - SNAP_MIN, 'The day ends at 21:00')
  .refine((v) => v % SNAP_MIN === 0, `Times land on ${SNAP_MIN}-minute marks`);

export const durationMinutes = z
  .number()
  .int()
  .min(SNAP_MIN)
  .max(720, 'Longer than a working day')
  .refine((v) => v % SNAP_MIN === 0, `Lengths come in ${SNAP_MIN}-minute steps`);

export const taskKindEnum = z.enum(KIND_KEYS as [string, ...string[]]);
export const recurEnum = z.enum(RECUR as unknown as [string, ...string[]]);
export const respEnum = z.enum(RESP_KEYS as [string, ...string[]]);

/**
 * A group id the system knows — the eight role groups, or `g-pod-<clientId>`.
 *
 * Checked against the vocabulary rather than accepted as free text: an unknown
 * group resolves to nobody, and a task assigned to nobody is a task that silently
 * never appears on anyone's grid.
 */
export const groupId = z.string().min(1).refine(isKnownGroupId, 'Unknown group');

/** Where an edit lands: this one day, or the whole series. */
export const scopeEnum = z.enum(['occurrence', 'series']);

const taskCore = {
  title: z.string().trim().min(2).max(160),
  kind: taskKindEnum,
  clientId: z.string().min(1).nullable().optional(),
  date: isoDate,
  startMin: startMinute,
  durMin: durationMinutes,
  recurFreq: recurEnum.default('none'),
  recurUntil: isoDate.nullable().optional(),
  assigneeIds: z.array(z.string().min(1)).max(60).default([]),
  groupIds: z.array(groupId).max(20).default([]),
  link: z.string().trim().max(500).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  /** Overlap is opt-in, and still needs the OTHER side to agree. */
  allowOverlap: z.boolean().default(false),
};

export const createTaskSchema = z
  .object(taskCore)
  .refine((v) => v.assigneeIds.length > 0 || v.groupIds.length > 0, {
    message: 'A task needs somebody on it',
    path: ['assigneeIds'],
  })
  .refine((v) => v.recurFreq !== 'none' || !v.recurUntil, {
    message: 'Only a repeating task has an end date',
    path: ['recurUntil'],
  })
  .refine((v) => !v.recurUntil || v.recurUntil >= v.date, {
    message: 'The series would end before it began',
    path: ['recurUntil'],
  });
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

/**
 * An edit, and how far it reaches.
 *
 * `date` is required when the scope is one occurrence, because an exception is
 * written AGAINST a date — without it the server would have to guess which day
 * the reader was looking at, and guessing wrong rewrites the wrong morning.
 */
export const updateTaskSchema = z
  .object({
    ...taskCore,
    title: taskCore.title.optional(),
    kind: taskKindEnum.optional(),
    date: isoDate.optional(),
    startMin: startMinute.optional(),
    durMin: durationMinutes.optional(),
    recurFreq: recurEnum.optional(),
    assigneeIds: z.array(z.string().min(1)).max(60).optional(),
    groupIds: z.array(groupId).max(20).optional(),
    allowOverlap: z.boolean().optional(),
    scope: scopeEnum.default('series'),
    /** The occurrence being edited, when the scope is one day. */
    occurrenceDate: isoDate.optional(),
  })
  .refine((v) => v.scope !== 'occurrence' || !!v.occurrenceDate, {
    message: 'Which day is being changed?',
    path: ['occurrenceDate'],
  });
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

/**
 * A drag, in one body for both gestures.
 *
 * Same day = a time change. Different day = a move, which for one occurrence of a
 * recurring task detaches it into a standalone task rather than dragging the
 * whole series behind it.
 */
export const moveTaskSchema = z.object({
  fromDate: isoDate,
  toDate: isoDate,
  startMin: startMinute,
  durMin: durationMinutes,
  scope: scopeEnum.default('occurrence'),
});
export type MoveTaskInput = z.infer<typeof moveTaskSchema>;

export const deleteTaskQuery = z
  .object({
    scope: scopeEnum.default('series'),
    date: isoDate.optional(),
  })
  .refine((v) => v.scope !== 'occurrence' || !!v.date, {
    message: 'Which day is being removed?',
    path: ['date'],
  });
export type DeleteTaskQuery = z.infer<typeof deleteTaskQuery>;

export const taskDoneSchema = z.object({
  date: isoDate,
  done: z.boolean(),
});
export type TaskDoneInput = z.infer<typeof taskDoneSchema>;

export const respondSchema = z.object({ state: respEnum });
export type RespondInput = z.infer<typeof respondSchema>;

export const proposeSchema = z.object({
  date: isoDate,
  startMin: startMinute,
  durMin: durationMinutes,
  note: z.string().trim().max(500).optional(),
});
export type ProposeInput = z.infer<typeof proposeSchema>;

export const shiftSeriesSchema = z.object({
  /** Bounded so a slip of the finger cannot walk a series into next year. */
  deltaDays: z.number().int().min(-365).max(365).refine((v) => v !== 0, 'Nothing to shift'),
});
export type ShiftSeriesInput = z.infer<typeof shiftSeriesSchema>;

/**
 * The grid's own query.
 *
 * The range is capped at 14 days because recurrence expands at read time and an
 * unbounded range is an unbounded expansion — a daily task over a year is 365
 * occurrences nobody asked to draw.
 */
export const scheduleQuery = z
  .object({
    from: isoDate,
    to: isoDate,
    /** The people lens — an OR, not an AND. */
    people: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v])),
    client: z.string().min(1).optional(),
  })
  .refine((v) => v.to >= v.from, { message: 'The range runs backwards', path: ['to'] })
  .refine(
    (v) => {
      const day = (s: string) => Math.floor(Date.parse(`${s}T00:00:00Z`) / 86_400_000);
      return day(v.to) - day(v.from) <= 13;
    },
    { message: 'Fourteen days at a time', path: ['to'] },
  );
export type ScheduleQuery = z.infer<typeof scheduleQuery>;
