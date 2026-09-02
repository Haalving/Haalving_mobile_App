'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PillarKey, PodSeatKey } from '@haalving/shared';

import { api } from '@/lib/api';

/**
 * The client reads and writes.
 *
 * Every list is SERVER-SCOPED — the API answers with the clients this caller may
 * see and nothing else, so there is no client-side filtering to forget and no
 * way for a query parameter to widen the answer.
 */

export interface PodSeat {
  seat: PodSeatKey;
  staffId: string | null;
  staff: { id: string; name: string; role: string } | null;
  /** True when nobody holds the seat — which means the AI does. */
  ai: boolean;
}

export interface ClientListItem {
  id: string;
  name: string;
  code: string | null;
  plan: 'POORNA' | 'SVAYAM';
  cycle: number;
  cycleDay: number;
  levels: Partial<Record<PillarKey, number>>;
  humanPillars: string[];
  track: string;
  observation: boolean;
  status: 'active' | 'paused' | 'inactive';
  tier: string | null;
  location: string | null;
  userId: string | null;
  pod: PodSeat[];
}

export interface ClientDetail extends ClientListItem {
  designation: string | null;
  sex: 'M' | 'F';
  dob: string | null;
  heightCm: number | null;
  weightKg: number | null;
  health: string[];
  gender: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  goal: string | null;
  purpose: string | null;
  tzo: number;
  tzLabel: string;
  termDays: number;
  termStart: string | null;
  statusWhy: string | null;
  onboardedAt: string | null;
  createdAt: string;
  user: { id: string; phone: string | null; status: string } | null;
  pipelineCard: { id: string; stage: string; enteredAt: string; note: string | null } | null;

  /* ---- the record header's own readings ----
     Stored for the roster cards and now sent to the record too. */
  /** 'low' | 'medium' | 'high' — drives the watch chip. */
  risk: 'low' | 'medium' | 'high' | null;
  /** At WHAT. It travels with `risk` because a warning nobody can act on is worse than none. */
  riskWhy: string | null;
  /** The SECOND celebration date — dob alone drops every anniversary. */
  anniv: string | null;
  /** Percent of the plan kept. Null is meaningful: observation has nothing to comply with yet. */
  compliance: number | null;
  lastCycleIndex: Partial<Record<PillarKey, number>> | null;
  /** Per-pillar session ledger, keyed by STAFF ROLE (mind, not wellness). */
  sessions: Partial<Record<string, { done: number; target: number; cancelled?: number }>> | null;
}

/* ------------------------------------------------------------- the circle */

export interface CircleMessage {
  id: string;
  seq: number;
  kind: 'TEXT' | 'TEAMONLY' | 'PROMO' | 'WISH' | 'CARD' | 'DOC' | 'RATING' | 'MEAL';
  fromKind: 'STAFF' | 'CLIENT' | 'AI';
  /** NULL is not missing data — the client's own line, or the AI's. */
  from: { id: string; name: string } | null;
  text: string;
  at: string;
}

/**
 * One lane of a client's room.
 *
 * The lane is a QUERY, not a filter applied here: the team lane never reaches
 * the browser on a client-facing read, so a rendering mistake cannot leak an
 * internal note into a client-visible surface.
 */
export function useCircle(clientId: string, lane: 'client' | 'team') {
  return useQuery({
    queryKey: ['clients', clientId, 'circle', lane],
    queryFn: () =>
      api.get<CircleMessage[]>(`/clients/${clientId}/circle${lane === 'team' ? '?lane=team' : ''}`),
    enabled: !!clientId,
  });
}

export function usePostCircle(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { text: string; teamOnly?: boolean }) =>
      api.post(`/clients/${clientId}/circle`, a),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['clients', clientId, 'circle'] }),
  });
}

export interface ClientFilters {
  plan?: string;
  status?: string;
  q?: string;
}

export function useClients(filters: ClientFilters = {}) {
  const qs = new URLSearchParams();
  if (filters.plan) qs.set('plan', filters.plan);
  if (filters.status) qs.set('status', filters.status);
  if (filters.q) qs.set('q', filters.q);
  const suffix = qs.toString() ? `?${qs}` : '';

  return useQuery({
    queryKey: ['clients', filters],
    queryFn: () => api.get<ClientListItem[]>(`/clients${suffix}`),
  });
}

export function useClient(id: string) {
  return useQuery({
    queryKey: ['clients', id],
    queryFn: () => api.get<ClientDetail>(`/clients/${id}`),
    enabled: !!id,
  });
}

export interface AssignSeatVars {
  clientId: string;
  seat: PodSeatKey;
  /** null hands the seat back to the AI — a real value, not a cleared field. */
  staffId: string | null;
  reason?: string;
}

export function useAssignPodSeat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, seat, staffId, reason }: AssignSeatVars) =>
      api.put<PodSeat>(`/clients/${clientId}/pod/${seat}`, { staffId, reason }),
    onSuccess: (_data, vars) => {
      /* the record AND the list: a seat change moves who sees this client, so a
         coach who just lost the seat should stop seeing them on their next read */
      void qc.invalidateQueries({ queryKey: ['clients', vars.clientId] });
      void qc.invalidateQueries({ queryKey: ['clients'] });
      void qc.invalidateQueries({ queryKey: ['home', 'summary'] });
    },
  });
}

/* ------------------------------------------------------------ client plan */

/** A template, as the picker and the assigned row both show it. */
export interface PlanTemplateRef {
  id: string;
  name: string;
  pillar: string;
  level: number;
  track: string;
  published: boolean;
  /** matches the client's own track — MARKED, never filtered */
  onTrack?: boolean;
  /** matches the client's current level in this pillar */
  onLevel?: boolean;
}

export interface PlanPillar {
  pillar: string;
  /**
   * THREE STATES, and the screen says each differently:
   *   UNOPENED — nobody has touched this pillar
   *   CALLED   — opened, but no template chosen ("the pillar has been called but
   *              the client has no plan")
   *   ASSIGNED — on a template, draft or live
   */
  state: 'UNOPENED' | 'CALLED' | 'ASSIGNED';
  template: PlanTemplateRef | null;
  draft: boolean | null;
  assignedBy: { id: string; name: string } | null;
  assignedAt: string | null;
  /** per pillar — a Yoga Coach may set one of the four and not the other three */
  mayAssign: boolean;
}

export interface ClientPlan {
  clientId: string;
  clientName: string;
  /** which pillars this caller may set, answered by the server */
  mayAssign: string[];
  pillars: PlanPillar[];
}

export function useClientPlan(clientId: string) {
  return useQuery({
    queryKey: ['clients', clientId, 'plan'],
    queryFn: () => api.get<ClientPlan>(`/clients/${clientId}/plan`),
    enabled: !!clientId,
  });
}

export interface PlanPicker {
  pillar: string;
  track: string | null;
  /** the level the client is on, so the picker can mark the obvious choice */
  level: number | null;
  templates: PlanTemplateRef[];
}

/**
 * The templates that could fill one seat.
 *
 * Fetched only while a picker is open — four pillars' worth of templates loaded
 * up front would be four requests for a screen where most visits change nothing.
 */
export function usePlanTemplates(clientId: string, pillar: string | null) {
  return useQuery({
    queryKey: ['clients', clientId, 'plan', pillar, 'templates'],
    queryFn: () => api.get<PlanPicker>(`/clients/${clientId}/plan/${pillar}/templates`),
    enabled: !!clientId && !!pillar,
  });
}

function usePlanMutation<TArgs>(fn: (a: TArgs & { clientId: string }) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['clients', vars.clientId, 'plan'] });
    },
  });
}

/** Assign, or clear with `templateId: null` — which leaves the pillar CALLED. */
export function useAssignPlan() {
  return usePlanMutation(
    (a: { clientId: string; pillar: string; templateId: string | null; draft?: boolean }) =>
      api.put(`/clients/${a.clientId}/plan/${a.pillar}`, {
        templateId: a.templateId,
        ...(a.draft === undefined ? {} : { draft: a.draft }),
      }),
  );
}

/** Out of draft — the moment it becomes what the client is actually on. */
export function usePublishPlan() {
  return usePlanMutation((a: { clientId: string; pillar: string }) =>
    api.post(`/clients/${a.clientId}/plan/${a.pillar}/publish`),
  );
}

/* --------------------------------------------------------------- emotions */

export interface MoodPoint {
  id: string;
  cycle: number;
  day: number;
  /** happy | sad | angry | drained */
  mood: string;
  note: string | null;
  /** when the check-in arrived, as an instant */
  at: string;
}

export interface ClientEmotions {
  clientId: string;
  clientName: string;
  /** oldest first — a line chart reads left to right through time */
  series: MoodPoint[];
  /** newest first, and only the ones carrying a line */
  notes: MoodPoint[];
}

export function useClientEmotions(clientId: string) {
  return useQuery({
    queryKey: ['clients', clientId, 'emotions'],
    queryFn: () => api.get<ClientEmotions>(`/clients/${clientId}/emotions`),
    enabled: !!clientId,
  });
}
