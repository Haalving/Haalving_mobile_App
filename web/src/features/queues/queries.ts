'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

/**
 * Work Queues — the six SLA-bound boards.
 *
 * ONE READ FOR THE HOST (`GET /queues`) so the tabs, their badges and the
 * "n waiting" pill are one answer from one scoping expression, and one read per
 * board for its own rows. The badge and the list it points at therefore cannot
 * disagree — which is exactly the drift the demo recorded fixing on its own work
 * board ("badge and list now read off the exact same scoping expression").
 *
 * WHICH BOARDS EXIST IS THE SERVER'S ANSWER, not a filter applied here. A role
 * that may not see Medical is not sent a Medical tab at all.
 */

/* --------------------------------------------------------------- the host */

export interface BoardMeta {
  key: string;
  label: string;
  /** NULL for a board that keeps no count — not 0, which would read as "clear". */
  count: number | null;
}

export interface QueuesMeta {
  boards: BoardMeta[];
  waiting: number;
}

/* --------------------------------------------------------------- the rows */

export interface Person {
  id: string;
  name: string;
  role?: string;
}

export interface WorklistRow {
  id: string;
  text: string;
  due: string;
  pill: string;
  status: 'OPEN' | 'DONE';
  pillar: string | null;
  type: string;
  clientId: string | null;
  doneAt: string | null;
  owner: Person;
  client: { id: string; name: string } | null;
  /**
   * How this row arrived, not which system it lives in — there is only one.
   * `manual` you added it, `assigned` somebody booked it onto you, `rule` a rule
   * raised it.
   */
  source: 'manual' | 'assigned' | 'rule';
  /** Set only on a booked row; null for work with a deadline and no hour. */
  date: string | null;
  startMin: number | null;
  durMin: number | null;
  /** A meeting's join link, when it has a room. Null for everything else. */
  link: string | null;
}

export interface ApprovalRow {
  id: string;
  type: string;
  typeLabel: string;
  title: string;
  pillar: string | null;
  due: string;
  aiDraft: string;
  status: 'DRAFT' | 'SUBMITTED' | 'PUBLISHED';
  stage: number;
  returnReason: string | null;
  /** The chain SNAPSHOTTED at creation. Steps carry a role KEY, never a title. */
  chain: Array<{ role: string }>;
  chainVersion: number;
  waitingOn: string | null;
  owner: Person;
  client: { id: string; name: string } | null;
  /**
   * A `template` sign-off belongs to the LIBRARY, not to a client — it carries
   * the template instead of a client, and every "who is this about" line reads
   * this first. The last signature publishes the template across the roster.
   */
  templateId: string | null;
  template: { id: string; name: string; pillar: string } | null;
  about: string;
  isProspect: boolean;
  createdAt: string;
  history: Array<{ act: string; note: string | null; at: string; by: Person | null }>;
}

export interface ApprovalsData {
  /**
   * Role key → current title. The chain stores keys because People & Access can
   * rename a seat, and a snapshot holding "Operations Head" would go on saying it
   * after the rename. The ORDER is history; the WORDS are current.
   */
  roleTitles: Record<string, string>;
  queue: ApprovalRow[];
  inFlight: ApprovalRow[];
  returned: ApprovalRow[];
  drafts: ApprovalRow[];
  all: ApprovalRow[];
  seesAll: boolean;
}

export interface Sla {
  elapsedMin: number;
  targetMin: number;
  /** NEGATIVE once past the target, which is the whole point. */
  leftMin: number;
  breached: boolean;
  nudged: boolean;
  escalated: boolean;
  escalateToRole: string;
}

export interface MealRow {
  id: string;
  client: { id: string; name: string; observation: boolean };
  slot: string;
  capturedAt: string;
  fullness: string;
  photo: string | null;
  dishes: string[];
  ai: { stars: number; conf: number; detected: string[]; note: string };
  final: {
    stars: number;
    by: Person | null;
    /** by === null means the AI rated it — the same reading a null pod seat carries. */
    byAi: boolean;
    note: string | null;
    voiceSec: number | null;
    at: string | null;
    rubric: Record<string, string> | null;
  } | null;
  protein: number;
  kcal: number;
  sla: Sla | null;
}

export interface MealsData {
  awaiting: MealRow[];
  rated: MealRow[];
  ladder: {
    replyTargetMin: number;
    notifyAfterMin: number;
    escalateAfterMin: number;
    escalateAtMin: number;
    escalateToRole: string;
  };
  breached: number;
  escalated: number;
}

export interface SummaryRow {
  id: string;
  title: string;
  kind: string;
  uploadedOn: string;
  status: 'PENDING' | 'READY';
  client: { id: string; name: string } | null;
  prospect: string | null;
  about: string;
  signedBy: Person | null;
  signedAt: string | null;
  summary: { conditions: string[]; flags: string[]; metrics: string[] };
  versions: number;
  history: Array<Record<string, unknown>>;
}

export interface MedicalData {
  pending: SummaryRow[];
  signed: SummaryRow[];
  /** Reading the document and signing the summary off it are two separate rights. */
  canSeeRaw: boolean;
  canSign: boolean;
}

export interface DeviationRow {
  id: string;
  kind: string;
  state: string;
  mode: string;
  at: string;
  client: { id: string; name: string };
}

export interface LiveStats {
  unratedOver60: number;
  unconfirmedCal24: number;
  approvals4h: number;
  /** NULL when nothing has been rated today — a full ring over an empty morning
      is the one reading that would make somebody stop looking. */
  onTimePct: number | null;
  ratedToday: number;
  replyTargetMin: number;
  allClear: boolean;
}

/* ------------------------------------------------------------------ reads */

const KEY = ['queues'] as const;

export function useQueuesMeta(enabled = true) {
  return useQuery({ queryKey: KEY, queryFn: () => api.get<QueuesMeta>('/queues'), enabled });
}

export function useWorklist(q: { status?: string; pillar?: string; type?: string; ownerId?: string }) {
  const search = new URLSearchParams(
    Object.entries(q).filter(([, v]) => !!v) as [string, string][],
  ).toString();
  return useQuery({
    queryKey: [...KEY, 'worklist', q],
    queryFn: () => api.get<WorklistRow[]>(`/queues/worklist${search ? `?${search}` : ''}`),
  });
}

export function useApprovals() {
  return useQuery({
    queryKey: [...KEY, 'approvals'],
    queryFn: () => api.get<ApprovalsData>('/queues/approvals'),
  });
}

export function useMeals() {
  return useQuery({ queryKey: [...KEY, 'meals'], queryFn: () => api.get<MealsData>('/queues/meals') });
}

export function useMedical() {
  return useQuery({
    queryKey: [...KEY, 'medical'],
    queryFn: () => api.get<MedicalData>('/queues/medical'),
  });
}

export function useDeviations() {
  return useQuery({
    queryKey: [...KEY, 'deviations'],
    queryFn: () => api.get<DeviationRow[]>('/queues/deviations'),
  });
}

export function useLive() {
  return useQuery({ queryKey: [...KEY, 'live'], queryFn: () => api.get<LiveStats>('/queues/live') });
}

/* ----------------------------------------------------------------- writes */

/**
 * Every write re-reads the host as well as its own board.
 *
 * Rating a plate changes the meals badge AND the "n waiting" pill AND the live
 * board's unrated count — they are three readings of one fact. Invalidating only
 * the board would leave two numbers on screen disagreeing about it.
 *
 * `also` names any OTHER page's read the write moves — the catalog, when a
 * signature publishes a template or a return unlocks one.
 */
function useQueueMutation<TArgs, TResult>(
  fn: (a: TArgs) => Promise<TResult>,
  also: ReadonlyArray<readonly unknown[]> = [],
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: ['home', 'summary'] });
      for (const k of also) void qc.invalidateQueries({ queryKey: k });
    },
  });
}

/**
 * "I have read these."
 *
 * Invalidates the HOST as well as the board, because the thing this changes is the
 * tab's badge and the waiting pill — not the rows, which are unmoved. That is the
 * whole point of the write.
 */
export function useMarkDeviationsSeen() {
  return useQueueMutation((ids: string[]) => api.post('/queues/deviations/seen', { ids }));
}

export interface NewWork {
  text: string;
  ownerId: string;
  clientId?: string | null;
  pillar?: string | null;
  type?: string;
  due?: string;
  pill?: string;
}

/**
 * Put a line of work on a desk.
 *
 * The server decides who may assign to whom — yourself always, anybody else
 * only with `seeAllClients`. The sheet defaults the owner to the caller, so the
 * common case needs no permission and no thought.
 */
export function useCreateWork() {
  return useQueueMutation((a: NewWork) => api.post('/queues/worklist', a));
}

/**
 * Tick a slotless task off.
 *
 * The closed row does NOT vanish. It is stamped DONE in place, so the board's
 * existing done-to-bottom sort sinks it and the strikethrough reads it as closed
 * — you can see what you just cleared instead of it disappearing from under you.
 * Only the counts are re-read (the tab badge and the sidebar); the rows are left
 * as updated so the closed one keeps its place until the next full load.
 */
export function useMarkWorkDone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<WorklistRow>(`/queues/worklist/${id}/done`),
    onSuccess: (updated, id) => {
      qc.setQueriesData<WorklistRow[] | undefined>({ queryKey: [...KEY, 'worklist'] }, (rows) =>
        rows?.map((r) => (r.id === id ? { ...r, ...updated, status: 'DONE' as const } : r)),
      );
      void qc.invalidateQueries({ queryKey: KEY, exact: true });
      void qc.invalidateQueries({ queryKey: ['home', 'summary'] });
    },
  });
}

export function useRateMeal() {
  return useQueueMutation((a: { id: string; stars: number; note?: string; voiceSec?: number }) =>
    api.post(`/queues/meals/${a.id}/rate`, {
      stars: a.stars,
      ...(a.note ? { note: a.note } : {}),
      ...(a.voiceSec ? { voiceSec: a.voiceSec } : {}),
    }),
  );
}

export function useSubmitApproval() {
  return useQueueMutation((a: { id: string; note?: string }) =>
    api.post(`/queues/approvals/${a.id}/submit`, a.note ? { note: a.note } : {}),
  );
}

/**
 * Answers with the row as it now stands, so the caller can tell "moved one seat
 * down" from "that was the last signature — it is published". The catalog is
 * re-read as well: the last signature on a `template` item is what makes that
 * template assignable, and the Catalog's pill must say so without a reload.
 */
export function useSignApproval() {
  return useQueueMutation(
    (a: { id: string; note?: string }) =>
      api.post<ApprovalRow>(`/queues/approvals/${a.id}/sign`, a.note ? { note: a.note } : {}),
    [['catalog']],
  );
}

/** The reason is required — a return never travels empty-handed. A returned template unlocks in the Catalog, so that read moves too. */
export function useReturnApproval() {
  return useQueueMutation(
    (a: { id: string; reason: string }) =>
      api.post<ApprovalRow>(`/queues/approvals/${a.id}/return`, { reason: a.reason }),
    [['catalog']],
  );
}

export function useSignSummary() {
  return useQueueMutation(
    (a: { id: string; conditions: string[]; flags: string[]; metrics: string[] }) =>
      api.post(`/queues/medical/${a.id}/sign`, {
        conditions: a.conditions,
        flags: a.flags,
        metrics: a.metrics,
      }),
  );
}
