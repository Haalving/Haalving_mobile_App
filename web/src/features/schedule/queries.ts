'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Conflict, RecurFreq, RespState, TaskKind } from '@haalving/shared';

import { api } from '@/lib/api';

/**
 * The Schedule's data layer.
 *
 * ONE READ answers the whole page — grid, rhythm bar, lens legend and the
 * off-hours hatching all come out of `/schedule` for one range. They are facets
 * of a single question ("what is happening between these two dates, seen through
 * this lens"), and splitting them would let the bar and the grid disagree about
 * what a day holds while one of the two was refetching.
 *
 * NOTHING HERE COMPUTES A CONFLICT. The lanes, the acceptance summary, the
 * per-person off-hours segments and every refusal sentence are the server's
 * answer, read and drawn. The one thing the browser is allowed to do with a
 * conflict is PHRASE it — `blockWords` and `clashWords` live in
 * `@haalving/shared`, so the line under the time fields and the line a 409
 * carries are the same string built by the same function.
 *
 * EVERY MUTATION INVALIDATES MORE THAN ITSELF. A booking changes the Home
 * summary's counts; a move and an applied proposal can hand an occurrence to a
 * different task id, which changes who a client's record names on that session,
 * so `clients` goes stale with them.
 */

/* ------------------------------------------------------------------ shapes */

/** One drawn occurrence, exactly as `schedule.service.ts`'s `shape` builds it. */
export interface Occurrence {
  taskId: string;
  date: string;
  startMin: number;
  durMin: number;
  title: string;
  kind: TaskKind;
  /** Only a session carries one, and it is the only pillar colour on this grid. */
  pillar: string | null;
  clientId: string | null;
  link: string | null;
  notes: string | null;
  /** Assignees plus everybody the groups resolve to, live. */
  people: string[];
  groups: string[];
  assigneeIds: string[];
  done: boolean;
  resp: { total: number; accepted: number; confirmed: boolean; needed: boolean };
  /** My own answer, or null. Nobody else's is sent down. */
  mine: RespState | null;
  editable: boolean;
  recurring: boolean;
  /** This one day was changed away from the series. */
  edited: boolean;
  lane: number;
  lanes: number;
}

export interface SchedStaff {
  id: string;
  name: string;
  role: string;
  /** The person's colour slot, 1-12, assigned by seat so it holds still. */
  who: number;
}

export interface SchedulePayload {
  from: string;
  to: string;
  /** The lens the server ACTUALLY applied, which is not always the one asked for. */
  lens: string[];
  canWiden: boolean;
  days: string[];
  occurrences: Occurrence[];
  /** The standing duties, lifted out of the grid into the rhythm bar. */
  dailies: Occurrence[];
  staff: SchedStaff[];
  /** `personId -> date -> [fromMin, toMin][]` — the hours outside a declared week. */
  offSegments: Record<string, Record<string, Array<[number, number]>>>;
}

export interface SchedGroup {
  id: string;
  name: string;
  memberIds: string[];
  clientId?: string;
}

/** The create body — and the dry run's body, because they are the same shape. */
export interface TaskInput {
  title: string;
  kind: TaskKind;
  clientId: string | null;
  date: string;
  startMin: number;
  durMin: number;
  recurFreq: RecurFreq;
  assigneeIds: string[];
  groupIds: string[];
  link: string | null;
  notes: string | null;
  allowOverlap: boolean;
}

export type Scope = 'occurrence' | 'series';

export interface DryRunResult {
  ok: boolean;
  conflicts: Conflict[];
  people: string[];
}

/* ------------------------------------------------------------------- reads */

export interface Range {
  from: string;
  to: string;
}

/**
 * The grid's read.
 *
 * The lens is part of the KEY, not a filter applied afterwards: it changes what
 * the server is willing to answer with at all, and caching one lens's answer
 * under another's key would show a coach somebody else's week for the length of
 * a refetch.
 *
 * THE OLD WEEK STAYS UP WHILE THE NEXT ONE LOADS. Every arrow, every lens change
 * and every client filter is a new key, so without `keepPreviousData` each of
 * them would empty the screen — toolbar and all — and paging through a month
 * would be a strobe. The demo repaints from a store it already holds and never
 * had the problem to solve.
 */
export function useSchedule(range: Range, people: string[], client: string) {
  const qs = new URLSearchParams({ from: range.from, to: range.to });
  for (const id of people) qs.append('people', id);
  if (client) qs.set('client', client);

  return useQuery({
    queryKey: ['schedule', range.from, range.to, people, client],
    queryFn: () => api.get<SchedulePayload>(`/schedule?${qs}`),
    placeholderData: keepPreviousData,
  });
}

/** The role groups and the per-client pods, resolved live on the server. */
export function useGroups() {
  return useQuery({
    queryKey: ['schedule', 'groups'],
    queryFn: () => api.get<SchedGroup[]>('/schedule/groups'),
  });
}

/* --------------------------------------------------------------- the writes */

/**
 * One invalidation set for every write.
 *
 * `clients` only where the write can change WHO a client's session names — a
 * move and an applied proposal both run through the same detach-and-rewrite
 * path, and that path can leave the occurrence living on a new task id.
 */
function useScheduleMutation<TArgs, TResult>(
  fn: (a: TArgs) => Promise<TResult>,
  opts: { touchesClients?: boolean } = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['schedule'] });
      void qc.invalidateQueries({ queryKey: ['home', 'summary'] });
      if (opts.touchesClients) void qc.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

export function useCreateTask() {
  return useScheduleMutation((input: TaskInput) =>
    api.post<{ id: string; people: string[] }>('/schedule/tasks', input),
  );
}

/**
 * "Would this be refused?" — the create's own code path, stopped one step short
 * of writing.
 *
 * It invalidates NOTHING, because it changes nothing. It is a read that has to
 * travel as a POST because the question is the whole task body.
 *
 * ONLY A NEW TASK MAY ASK. The dry run has no way to say "ignore this task id",
 * so an edit asking it would be told it clashes with itself; an edit's refusal
 * arrives from the PATCH instead, which does exclude the task being changed.
 */
export function useDryRunTask() {
  return useMutation({
    mutationFn: (input: TaskInput) => api.post<DryRunResult>('/schedule/tasks?dryRun=1', input),
  });
}

export interface EditArgs extends Partial<TaskInput> {
  id: string;
  scope: Scope;
  /** Required when the scope is one day — an exception is written against a date. */
  occurrenceDate?: string;
}

export function useEditTask() {
  return useScheduleMutation(({ id, ...body }: EditArgs) =>
    api.patch<{ id: string }>(`/schedule/tasks/${id}`, body),
  );
}

export interface MoveArgs {
  id: string;
  fromDate: string;
  toDate: string;
  startMin: number;
  durMin: number;
  scope: Scope;
}

/** Both drag gestures: same day is a time change, a different day is a move. */
export function useMoveTask() {
  return useScheduleMutation(
    ({ id, ...body }: MoveArgs) =>
      api.post<{ id: string; detached: boolean }>(`/schedule/tasks/${id}/move`, body),
    { touchesClients: true },
  );
}

export function useDeleteTask() {
  return useScheduleMutation((args: { id: string; scope: Scope; date?: string }) => {
    const qs = new URLSearchParams({ scope: args.scope });
    if (args.date) qs.set('date', args.date);
    return api.del<{ ok: true }>(`/schedule/tasks/${args.id}?${qs}`);
  });
}

export function useSetTaskDone() {
  return useScheduleMutation((args: { id: string; date: string; done: boolean }) =>
    api.post<{ id: string; date: string; done: boolean }>(`/schedule/tasks/${args.id}/done`, {
      date: args.date,
      done: args.done,
    }),
  );
}

export function useRespond() {
  return useScheduleMutation((args: { id: string; state: RespState }) =>
    api.post<{ id: string; resp: Occurrence['resp'] }>(`/schedule/tasks/${args.id}/respond`, {
      state: args.state,
    }),
  );
}

export function usePropose() {
  return useScheduleMutation(
    (args: { id: string; date: string; startMin: number; durMin: number; note?: string }) =>
      api.post<{ id: string; recipients: string[] }>(`/schedule/tasks/${args.id}/propose`, {
        date: args.date,
        startMin: args.startMin,
        durMin: args.durMin,
        ...(args.note ? { note: args.note } : {}),
      }),
  );
}

/** Applying a proposal reschedules through the very path a drag takes. */
export function useApplyProposal() {
  return useScheduleMutation(
    (proposalId: string) =>
      api.post<{ taskId: string; proposerId: string | null }>(
        `/schedule/proposals/${proposalId}/apply`,
      ),
    { touchesClients: true },
  );
}

/** Sliding a whole series by a number of days — an allocator's verb. */
export function useShiftSeries() {
  return useScheduleMutation((args: { id: string; deltaDays: number }) =>
    api.post<{ id: string }>(`/schedule/tasks/${args.id}/shift`, { deltaDays: args.deltaDays }),
  );
}
