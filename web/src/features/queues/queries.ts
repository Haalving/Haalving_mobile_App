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
   * How the row arrived, not which system it lives in — there is only one board.
   * `rule` a rule raised it, `manual` you booked it yourself, `assigned` somebody
   * booked it onto you.
   */
  source: 'rule' | 'manual' | 'assigned';
  /** Minutes past midnight for a booked row; null for work with no hour set aside. */
  startMin: number | null;
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
 */
function useQueueMutation<TArgs, TResult>(fn: (a: TArgs) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: ['home', 'summary'] });
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

export function useMarkWorkDone() {
  return useQueueMutation((id: string) => api.post(`/queues/worklist/${id}/done`));
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

export function useSignApproval() {
  return useQueueMutation((a: { id: string; note?: string }) =>
    api.post(`/queues/approvals/${a.id}/sign`, a.note ? { note: a.note } : {}),
  );
}

/** The reason is required — a return never travels empty-handed. */
export function useReturnApproval() {
  return useQueueMutation((a: { id: string; reason: string }) =>
    api.post(`/queues/approvals/${a.id}/return`, { reason: a.reason }),
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
