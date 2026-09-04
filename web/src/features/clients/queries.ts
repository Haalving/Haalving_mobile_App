'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PillarKey, PodSeatKey, schemas } from '@haalving/shared';
import type { z } from 'zod';

import { api } from '@/lib/api';
import type { OptionEntry } from '@/features/catalog/queries';

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

/* ------------------------------------------------- the deliberate exception */

/* the request body is the SERVER's own schema, inferred — a field renamed in
   `shared/src/schemas/arrival.ts` breaks the form that fills it rather than
   reaching the API as a 422 nobody expected */
export type AddClientDirectInput = z.infer<typeof schemas.addClientDirectSchema>;

/**
 * The record the direct add answers with — the client exactly as
 * `GET /clients/:id` shapes it, plus the arrival minted behind it so the act is
 * traceable back to a row on the rail.
 */
export interface AddedClient extends ClientDetail {
  arrivalId: string;
}

/**
 * Add a client DIRECTLY, without the twelve-step rail.
 *
 * THE SOP IS STILL THE RULE. This is its documented exception — somebody already
 * sold and already known — so it is the Super Admin's alone, it carries a reason
 * that goes to the audit log, and the server re-checks both. The console never
 * decides who may do this; it only decides who is shown the button.
 *
 * `['clients']` is the prefix of every client read, so one invalidation refreshes
 * the rail the new person now belongs on. Nothing on the Onboarding rail moves:
 * the arrival behind this client is born PROMOTED and was never mid-onboarding.
 */
export function useAddClientDirect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddClientDirectInput) => api.post<AddedClient>('/clients', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

/* ---------------------------------------------------------------- logs */

export type LogBucket = 'client' | 'team' | 'plan' | 'medical';
export interface LogEntry {
  at: string;
  bucket: LogBucket;
  kind: string;
  icon: string;
  title: string;
  sub: string;
}
export interface ClientLogs {
  entries: LogEntry[];
  counts: Record<'all' | LogBucket, number>;
}

/** The record's merged, time-sorted log — `GET /clients/:id/logs`. */
export function useClientLogs(id: string) {
  return useQuery({
    queryKey: ['clients', id, 'logs'],
    queryFn: () => api.get<ClientLogs>(`/clients/${id}/logs`),
    enabled: !!id,
  });
}

/* ---------------------------------------------- record panels: trackers */

export interface TrackerCard {
  key: string;
  label: string;
  value: string;
  sub: string;
}
export interface SessionRing {
  pillar: string;
  label: string;
  done: number;
  target: number;
}
export interface ClientTrackers {
  cards: TrackerCard[];
  compliance: number | null;
  sessions: SessionRing[];
}
export function useClientTrackers(id: string) {
  return useQuery({
    queryKey: ['clients', id, 'trackers'],
    queryFn: () => api.get<ClientTrackers>(`/clients/${id}/trackers`),
    enabled: !!id,
  });
}

/* ---------------------------------------------- record panels: meetings */

export interface MeetingRow {
  id: string;
  title: string;
  date: string | null;
  startMin: number | null;
  durMin: number | null;
  link: string | null;
  coaches: string[];
}
export function useClientMeetings(id: string) {
  return useQuery({
    queryKey: ['clients', id, 'meetings'],
    queryFn: () => api.get<MeetingRow[]>(`/clients/${id}/meetings`),
    enabled: !!id,
  });
}

/* --------------------------------------------- record panels: documents */

export interface DocumentRow {
  id: string;
  title: string;
  kind: string;
  uploadedOn: string;
  signed: boolean;
  by: string | null;
}
export function useClientDocuments(id: string) {
  return useQuery({
    queryKey: ['clients', id, 'documents'],
    queryFn: () => api.get<DocumentRow[]>(`/clients/${id}/documents`),
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

/**
 * The Plan tab's reads and writes — the per-pillar plan editor.
 *
 * THE MODEL IS A TICKET. Every edit a coach makes — calling a template, editing
 * a day, setting the client's own hour, dose or targets — is STAGED on a draft.
 * The console reads the ticket; the client app reads only the live fields;
 * "Approve — publish" copies the ticket onto the live plan wholesale and
 * "Discard draft" throws it away. Nothing reaches the client until Approve.
 *
 * `view` on each pillar is the SERVER'S answer to "which one does the console
 * show": the ticket when there is one, else live (the demo's draftView +
 * stagedVal). The tab never chooses between the two itself, so there is exactly
 * one place that choice is made and it is not on the screen.
 */

/** A template, as the header, the picker and the "Saved from this plan" list show it. */
export interface PlanTemplateRef {
  id: string;
  name: string;
  /** PlanTemplate.notes, or '' */
  desc: string;
  pillar: string;
  level: number;
  track: string;
  published: boolean;
}

export interface PlanPerson {
  id: string;
  name: string;
}

/** One slot of a day — the AND/OR grammar the catalog's template editor writes too. */
export interface PlanSlot {
  label?: string;
  time?: string;
  /** the A/B/C alternatives — each a list of items taken together */
  options: OptionEntry[][];
  dose?: Record<string, unknown>;
}

/** The client's own numbers over the plan's — session pillars only. */
export interface PlanDose {
  sets?: number;
  reps?: number;
  weight?: string;
  rpe?: number;
  mins?: number;
  count?: number;
  focus?: string;
}

/** The five numbers the Nutrient Panel reads — culture only. */
export interface PlanTargets {
  kcal?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fibre?: number;
}

/** `{ [day]: { slots } }` — a day the coach touched replaces the template's day whole. */
export type PlanOverrides = Record<string, { slots: PlanSlot[] }>;

/** The fields the client reads — live, or the ticket's shadow of them. */
export interface PlanView {
  templateId: string | null;
  template: PlanTemplateRef | null;
  overrides: PlanOverrides;
  time: string | null;
  dose: PlanDose | null;
  targets: PlanTargets | null;
}

/**
 * The staged draft. A key PRESENT here means "staged"; '' / null there means
 * "clear it on approve" — that is how a coach hands a client back to the
 * template's own times.
 */
export interface PlanTicket {
  templateId: string | null;
  template: PlanTemplateRef | null;
  overrides: PlanOverrides;
  time?: string | null;
  dose?: PlanDose | null;
  targets?: PlanTargets | null;
  by: PlanPerson | null;
  at: string;
}

export interface PlanLogEntry {
  act: string;
  by: PlanPerson | null;
  at: string;
}

/** A coach's booking on one cycle day of a session pillar. */
export interface PlanBooking {
  taskId: string;
  time: string;
  startMin: number;
  durMin: number;
  coach: PlanPerson | null;
  /** a link exists on the occurrence */
  joinable: boolean;
  /** the room itself, when the server sends it — the Join button opens this */
  link?: string | null;
}

export type PlanStagedKey = 'time' | 'dose' | 'targets';

export interface PlanPillar {
  pillar: string;
  /** spec.name — Nutrition, Fitness, Yoga, Mind Wellness, Motivation */
  name: string;
  /** spec.cls — the pillar's palette class */
  cls: string;
  /** per pillar — a Yoga Coach may set one of the five and not the other four */
  mayAssign: boolean;
  live: PlanView;
  ticket: PlanTicket | null;
  /** the ticket when there is one, else live — what the console draws */
  view: PlanView;
  hasDraft: boolean;
  /** never approved: the pillar has been called but the client has no plan */
  unpublished: boolean;
  /** live overrides non-empty */
  modified: boolean;
  /** count of view.overrides keys */
  edits: number;
  /** days that read differently on the ticket than on the plate */
  stagedDays: number[];
  stagedKeys: PlanStagedKey[];
  assignedBy: PlanPerson | null;
  assignedAt: string | null;
  /** oldest first */
  log: PlanLogEntry[];
  /** session pillars: keyed by cycle day */
  bookings: Record<string, PlanBooking>;
}

export interface PlanTemplateDay {
  slots: PlanSlot[];
  targets?: PlanTargets | null;
}

/** A referenced template WITH its days, so the tab draws the grid without more calls. */
export interface PlanTemplateFull extends PlanTemplateRef {
  days: Record<string, PlanTemplateDay>;
}

/** "Saved from this plan" — a template promoted out of this client's plan. */
export interface DerivedTemplate extends PlanTemplateRef {
  approval: {
    status: 'DRAFT' | 'SUBMITTED' | 'PUBLISHED';
    waitingOn: string | null;
    waitingOnTitle: string | null;
  } | null;
}

export interface PlanShape {
  cycleDays: number;
  restDays: number[];
  reviewDay: number;
  meetingDay: number;
}

export interface ClientPlan {
  clientId: string;
  clientName: string;
  firstName: string;
  cycle: number;
  /** cycleDay */
  day: number;
  track: string | null;
  levels: Record<string, number>;
  shape: PlanShape;
  /** which pillars this caller may set, answered by the server */
  mayAssign: string[];
  /** assignPlan || editTemplates */
  canSaveTemplate: boolean;
  /** TEMPLATE_PILLARS order */
  pillars: PlanPillar[];
  /** every template any pillar's live or ticket references, by id */
  templates: Record<string, PlanTemplateFull>;
  derived: DerivedTemplate[];
}

const planKey = (clientId: string) => ['clients', clientId, 'plan'] as const;

export function useClientPlan(clientId: string) {
  return useQuery({
    queryKey: planKey(clientId),
    queryFn: () => api.get<ClientPlan>(`/clients/${clientId}/plan`),
    enabled: !!clientId,
  });
}

/** A published template of one pillar, marked against the client's own shelf. */
export interface PlanPickerTemplate extends PlanTemplateRef {
  /** level === client level && track === client track */
  onShelf: boolean;
  onTrack: boolean;
  onLevel: boolean;
}

export interface PlanPicker {
  pillar: string;
  track: string | null;
  /** the level the client is on, so the picker can mark the obvious choice */
  level: number | null;
  /** PUBLISHED only — the demo lists nothing else; the client's shelf first */
  templates: PlanPickerTemplate[];
}

/**
 * The templates that could be called for one pillar.
 *
 * Fetched only while the Call sheet is open — five pillars' worth loaded up
 * front would be five requests for a screen where most visits change nothing.
 */
export function usePlanTemplates(clientId: string, pillar: string | null) {
  return useQuery({
    queryKey: [...planKey(clientId), pillar, 'templates'],
    queryFn: () => api.get<PlanPicker>(`/clients/${clientId}/plan/${pillar}/templates`),
    enabled: !!clientId && !!pillar,
  });
}

/**
 * Every plan write re-reads the plan. `also` names any OTHER read the write
 * moves — the record and the catalog, when a template is saved out of the plan.
 */
function usePlanWrite<TArgs extends { clientId: string }, TResult>(
  fn: (a: TArgs) => Promise<TResult>,
  also: (clientId: string) => ReadonlyArray<readonly unknown[]> = () => [],
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: (_d, _e, vars) => {
      void qc.invalidateQueries({ queryKey: planKey(vars.clientId) });
      for (const k of also(vars.clientId)) void qc.invalidateQueries({ queryKey: k });
    },
  });
}

/**
 * "Call a template" — writes the TICKET. The client's calendar stays exactly as
 * it was until the first Approve. Day overrides start empty on a new call; the
 * client's own hour and dose are staged only when they actually change
 * something (the server compares against live).
 */
export function useCallPlan() {
  return usePlanWrite(
    (a: {
      clientId: string;
      pillar: string;
      templateId: string;
      time?: string | null;
      dose?: PlanDose | null;
    }) =>
      api.put<PlanPillar>(`/clients/${a.clientId}/plan/${a.pillar}`, {
        templateId: a.templateId,
        ...(a.time === undefined ? {} : { time: a.time }),
        ...(a.dose === undefined ? {} : { dose: a.dose }),
      }),
  );
}

/** "Edit day" — a day the coach touched replaces the template's day whole, on the ticket. */
export function useSavePlanDay() {
  return usePlanWrite((a: { clientId: string; pillar: string; day: number; slots: PlanSlot[] }) =>
    api.put<PlanPillar>(`/clients/${a.clientId}/plan/${a.pillar}/days/${a.day}`, {
      slots: a.slots,
    }),
  );
}

/**
 * The client's own hour, dose or daily targets — staged on the ticket like any
 * other edit. '' / null stages a CLEAR, which is a real answer: it hands the
 * client back to the template's own times, the plan's own doses, the
 * derivation.
 */
export function useTunePlan() {
  return usePlanWrite(
    (a: {
      clientId: string;
      pillar: string;
      time?: string | null;
      dose?: PlanDose | null;
      targets?: PlanTargets | null;
    }) =>
      api.patch<PlanPillar>(`/clients/${a.clientId}/plan/${a.pillar}`, {
        ...(a.time === undefined ? {} : { time: a.time }),
        ...(a.dose === undefined ? {} : { dose: a.dose }),
        ...(a.targets === undefined ? {} : { targets: a.targets }),
      }),
  );
}

/** "Approve — publish": the ticket, copied wholesale onto the live plan. */
export function useApprovePlan() {
  return usePlanWrite((a: { clientId: string; pillar: string }) =>
    api.post<PlanPillar>(`/clients/${a.clientId}/plan/${a.pillar}/publish`),
  );
}

/** "Discard draft": the ticket goes; the live plan stays exactly as it is. */
export function useDiscardPlanDraft() {
  return usePlanWrite((a: { clientId: string; pillar: string }) =>
    api.del<PlanPillar>(`/clients/${a.clientId}/plan/${a.pillar}/draft`),
  );
}

export interface PlanFit {
  templateId: string;
  name: string;
  onShelf: boolean;
  /** the sentence the AI-draft box shows */
  text: string;
}

/**
 * "Ask AI to fit" — the AI proposes; the human still taps Call. Nothing is
 * written, so nothing is invalidated: a draft never assigns itself.
 */
export function useFitPlan() {
  return useMutation({
    mutationFn: (a: { clientId: string; pillar: string }) =>
      api.post<PlanFit>(`/clients/${a.clientId}/plan/${a.pillar}/fit`),
  });
}

/**
 * "Save as new template" — the live plan, overrides baked in, as a DRAFT
 * template that remembers this client. It lands in the Catalog and on the
 * record's "Saved from this plan" list, so both are re-read.
 */
export function useSavePlanAsTemplate() {
  return usePlanWrite(
    (a: { clientId: string; pillar: string; name: string }) =>
      api.post<PlanTemplateRef>(`/clients/${a.clientId}/plan/${a.pillar}/save-template`, {
        name: a.name,
      }),
    (clientId) => [['clients', clientId], ['catalog']],
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
