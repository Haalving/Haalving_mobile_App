'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { schemas } from '@haalving/shared';
import type { z } from 'zod';

import { api } from '@/lib/api';

/** The staff record — People & Access edits it, Time & Cover reads its hours. */

export interface Availability {
  [day: string]: [string, string] | Array<[string, string]> | null | undefined;
}

export interface StaffUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  subtitle: string | null;
  dept: string | null;
  level: number | null;
  joinedAt: string | null;
  avail: Availability;
  tz: string;
  tzo: number;
  tzLabel: string;
  emergency: { name: string; phone: string } | null;
  tags: string[];
  cv: string | null;
  status: 'active' | 'inactive';
  createdAt: string;
  capacity?: { declared: number; load: number; note: string | null } | null;
}

/**
 * The ROSTER line — `GET /people/staff`, `StaffRow` in `people.service.ts`.
 *
 * TWO READS, because they answer two different questions and only one of them
 * redacts. `/users` is the RECORD: phone, declared week, capacity, and the
 * role/dept/status query params the pickers filter on. `/people/staff` is what
 * the board draws: the derived tags, the allocation count, the role and level
 * titles — and it withholds `memo`, `emergency` and `cvName` from anybody
 * without `managePeople`, which `/users` does not do.
 *
 * The manager-only three are OPTIONAL because the server DELETES the keys
 * rather than nulling them; their absence is the redaction, and the console
 * reads that absence rather than second-guessing it from the role.
 */
export interface StaffRosterRow {
  id: string;
  name: string;
  email: string | null;
  role: string;
  roleTitle: string;
  dept: string | null;
  deptLabel: string | null;
  level: number | null;
  levelLabel: string;
  subtitle: string | null;
  joinedAt: string | null;
  allocated: number;
  /** Derived first, then typed — `allTags` in @haalving/shared. */
  tags: string[];
  /** The half a human keyed on; the only half the edit sheet may write back. */
  typedTags: string[];
  inactive: boolean;
  memo?: string | null;
  emergency?: { name: string; phone: string } | null;
  cvName?: string | null;
  tzLabel?: string | null;
  tzo?: number;
  avail?: Availability;
}

/**
 * One client a staff member holds a seat on — `GET /people/staff/:id`.
 *
 * SCOPED BY THE SERVER, not here: an HoD is sent their own bench's clients and
 * nobody else's, and `clientsHidden` counts the rest. The `allocated` COUNT is
 * already on the board for everyone with the page, so the hidden number reveals
 * nothing new — the NAMES are what scope protects.
 */
export interface StaffClientRow {
  id: string;
  name: string;
  /** The PodSeat key — `dietitian`, `mind`, `admin`. */
  seat: string;
  /** What that seat reads as: a coach seat as its pillar, the rest as its title. */
  seatLabel: string;
  status: string;
}

/** The roster line plus the clients it carries — the employee record's read. */
export interface StaffDetail extends StaffRosterRow {
  clients: StaffClientRow[];
  /** `allocated` minus what the caller may see. Never negative. */
  clientsHidden: number;
}

/**
 * The record and its roster line, joined — one row for the Staff tab to draw.
 *
 * `tags` takes the ROSTER's meaning here (derived + typed), not the record's
 * (typed only), because that is the list the board and the detail card print.
 * `typedTags` keeps the half the sheet is allowed to send back.
 */
export interface StaffRecord extends StaffUser {
  roleTitle?: string;
  deptLabel?: string | null;
  levelLabel?: string;
  allocated?: number;
  typedTags?: string[];
  inactive?: boolean;
  memo?: string | null;
  cvName?: string | null;
  /** True when the roster line arrived unredacted — see `StaffRosterRow`. */
  fullRecord?: boolean;
}

/**
 * Join a record to its roster line.
 *
 * The manager-only three are taken from the ROSTER ALONE. `/users` still sends
 * `emergency` to everyone holding the People nav, so spreading the record over
 * the roster line would quietly undo the redaction the roster performed.
 */
export function joinRoster(base: StaffUser, row: StaffRosterRow | undefined): StaffRecord {
  if (!row) return base;
  const full = 'emergency' in row;
  return {
    ...base,
    roleTitle: row.roleTitle,
    deptLabel: row.deptLabel,
    levelLabel: row.levelLabel,
    /* the ROSTER's joining date, which is a local ISO DAY. `/users` sends the
       column, so its value is a UTC timestamp — and `<input type="date">` given
       one shows the day before for anybody east of Greenwich. */
    joinedAt: row.joinedAt ?? base.joinedAt,
    allocated: row.allocated,
    subtitle: row.subtitle,
    tags: row.tags,
    typedTags: row.typedTags,
    inactive: row.inactive,
    tzLabel: row.tzLabel ?? base.tzLabel,
    tzo: row.tzo ?? base.tzo,
    emergency: full ? (row.emergency ?? null) : null,
    memo: row.memo ?? null,
    cvName: row.cvName ?? null,
    fullRecord: full,
  };
}

export interface StaffFilters {
  role?: string;
  dept?: string;
  status?: string;
  q?: string;
}

export function useStaff(filters: StaffFilters = {}, options: { enabled?: boolean } = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) qs.set(k, v);
  const suffix = qs.toString() ? `?${qs}` : '';

  return useQuery({
    queryKey: ['users', filters],
    queryFn: () => api.get<StaffUser[]>(`/users${suffix}`),
    /* callers that only need the record read behind a permission pass `enabled`
       rather than firing a request whose answer they will never draw */
    enabled: options.enabled ?? true,
  });
}

/**
 * The whole bench, unfiltered.
 *
 * NO QUERY PARAMS ON PURPOSE. The chip rows count the rows a chip would GIVE
 * you, so they need every row loaded — counting against a server-filtered list
 * prints 0 beside every role you are not already standing on, and a chip that
 * lands on an empty table reads as a bug rather than a filter.
 */
export function useStaffRoster() {
  return useQuery({
    queryKey: ['staff', 'roster'],
    queryFn: () => api.get<StaffRosterRow[]>('/people/staff'),
  });
}

/**
 * ONE employee record — the sheet a name opens.
 *
 * `/people/staff/:id`, not `/users/:id`: the record read knows nothing about the
 * derived tags, the allocation count, or the CLIENTS this person carries, and it
 * does not redact the memo. This is the read that does all four.
 *
 * The key sits under `['staff']` so every people mutation — which already
 * invalidates that prefix — repaints an open record.
 */
export function useStaffMember(id: string) {
  return useQuery({
    queryKey: ['staff', 'member', id],
    queryFn: () => api.get<StaffDetail>(`/people/staff/${id}`),
    enabled: !!id,
  });
}

type CreateUserInput = z.infer<typeof schemas.createUserSchema>;
type UpdateUserInput = z.infer<typeof schemas.updateUserSchema>;

export function useCreateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) => api.post<StaffUser>('/users', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] });
      /* the board draws from the roster read too, and a new seat changes its
         allocation counts and its derived tags as well as the record list */
      void qc.invalidateQueries({ queryKey: ['staff'] });
      void qc.invalidateQueries({ queryKey: ['people'] });
    },
  });
}

export function useUpdateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateUserInput }) =>
      api.patch<StaffUser>(`/users/${id}`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] });
      void qc.invalidateQueries({ queryKey: ['staff'] });
      void qc.invalidateQueries({ queryKey: ['people'] });
    },
  });
}

/**
 * Switching a seat off, and back on.
 *
 * ONE HOOK, TWO ROUTES, because it is one decision with a direction. The server
 * refuses while the person still holds pod seats (`HAS_SEATS`, with the clients
 * named) and refuses a Super Admin switching THEMSELVES off — both arrive as an
 * `ApiError` carrying a sentence, which the caller must show rather than swallow.
 */
export function useSetStaffActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, inactive }: { id: string; inactive: boolean }) =>
      api.post<{ id: string; inactive: boolean }>(
        `/people/staff/${id}/${inactive ? 'deactivate' : 'reactivate'}`,
        {},
      ),
    onSuccess: () => {
      /* the Inactive tag and its chip count both move, and so does the seat's
         place in every assignment picker — all three read a different query */
      void qc.invalidateQueries({ queryKey: ['staff'] });
      void qc.invalidateQueries({ queryKey: ['users'] });
      void qc.invalidateQueries({ queryKey: ['people'] });
    },
  });
}

export function useUpdateAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, avail }: { id: string; avail: Availability }) =>
      api.patch<StaffUser>(`/users/${id}/availability`, { avail }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

/**
 * Capacity is DECLARED, never derived. Both numbers are typed in, and going past
 * the ceiling needs `overrideCapacity` plus a reason — the API enforces both, so
 * the form only has to collect them.
 */
export function useUpdateCapacity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      declared,
      load,
      note,
      reason,
    }: {
      id: string;
      declared: number;
      load?: number;
      note?: string | null;
      reason?: string;
    }) => api.patch(`/users/${id}/capacity`, { declared, load, note, reason }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

/* ═══════════ the three tabs People & Access grew (step 3) ═══════════ */

export interface RoleRow {
  key: string;
  title: string;
  shell: string;
  home: string;
  nav: string[];
  perms: string[];
  headcount: number;
}

export interface CapacityRow {
  staffId: string;
  name: string;
  role: string;
  roleLabel: string;
  load: number;
  cap: number;
  full: boolean;
}

export interface FeedItem {
  id: string;
  tag: string;
  text: string;
  createdAt: string;
  ago: string;
  by: { id: string; name: string; roleTitle: string } | null;
  fresh: boolean;
}

export function useRoles() {
  return useQuery({ queryKey: ['roles'], queryFn: () => api.get<RoleRow[]>('/roles') });
}

export function useCapacityRows() {
  return useQuery({
    queryKey: ['people', 'capacity'],
    queryFn: () => api.get<CapacityRow[]>('/people/capacity'),
  });
}

export function useFeed() {
  return useQuery({
    queryKey: ['people', 'feed'],
    queryFn: () => api.get<{ items: FeedItem[]; unseen: number }>('/people/feed'),
  });
}

/**
 * The matrix and the bench are read by more than this page — the sidebar reads
 * `/me`'s nav, and the allocation picker reads capacity. So a write here
 * invalidates those too rather than only its own list.
 */
function usePeopleMutation<TArgs, TResult>(fn: (a: TArgs) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['roles'] });
      void qc.invalidateQueries({ queryKey: ['people'] });
      void qc.invalidateQueries({ queryKey: ['staff'] });
      /* `/users` carries the same seat's status and capacity, and the Staff tab
         draws one row out of both reads — refreshing half of it leaves a row
         that says Deactivate beside an Inactive pill */
      void qc.invalidateQueries({ queryKey: ['users'] });
      void qc.invalidateQueries({ queryKey: ['me'] });
      void qc.invalidateQueries({ queryKey: ['home', 'summary'] });
    },
  });
}

/**
 * Switch a seat off, or back on.
 *
 * The refusals live on the server and are worth reading rather than guessing at:
 * a Super Admin cannot deactivate themselves, and nobody still holding a pod
 * seat can be switched off until those clients are reallocated. Both come back
 * as a sentence the caller can print.
 */
export function useDeactivateStaff() {
  return usePeopleMutation((a: { id: string }) => api.post(`/people/staff/${a.id}/deactivate`));
}

export function useReactivateStaff() {
  return usePeopleMutation((a: { id: string }) => api.post(`/people/staff/${a.id}/reactivate`));
}

export function useToggleNav() {
  return usePeopleMutation((a: { key: string; navId: string; on: boolean }) =>
    api.post(`/roles/${a.key}/nav`, { navId: a.navId, on: a.on }),
  );
}

export function useTogglePerm() {
  return usePeopleMutation((a: { key: string; perm: string; on: boolean }) =>
    api.post(`/roles/${a.key}/perm`, { perm: a.perm, on: a.on }),
  );
}

export function useRenameRole() {
  return usePeopleMutation((a: { key: string; title: string }) =>
    api.patch(`/roles/${a.key}`, { title: a.title }),
  );
}

export function useCreateRole() {
  return usePeopleMutation((a: { title: string; baseKey: string }) => api.post('/roles', a));
}

export function useSetCap() {
  return usePeopleMutation((a: { staffId: string; cap: number }) =>
    api.patch(`/people/capacity/${a.staffId}`, { cap: a.cap }),
  );
}

export function usePostToFeed() {
  return usePeopleMutation((a: { text: string; tag: string }) => api.post('/people/feed', a));
}

export function useMarkFeedSeen() {
  return usePeopleMutation(() => api.post('/people/feed/seen'));
}
