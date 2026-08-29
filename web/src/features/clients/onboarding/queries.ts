'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PodSeatKey, schemas } from '@haalving/shared';
import type { z } from 'zod';

import { api } from '@/lib/api';

/**
 * Onboarding's data layer — the twelve steps of HAAL/QMS/OP/2026/01/00.
 *
 * TWO READS AND NOTHING ELSE. The rail asks one question ("who is mid-onboarding
 * and where are they") and the workspace asks the other ("everything about this
 * one"), because the rail is read far more often than a record is opened and
 * sending the ticks, the events and the whole bench down for every row would
 * make a list of eight people a list of eight histories.
 *
 * NOTHING HERE RECOMPUTES THE FLOW. `firstGap`, `stepComplete` and
 * `readyToFinish` arrive on the record, computed by the server from the same
 * `@haalving/shared` helpers the components import — so the button that says
 * "ready" and the endpoint that refuses can never disagree.
 */

export interface ArrivalRow {
  id: string;
  name: string;
  /** The Prisma enum — `POORNA`, not the lowercase key a write body carries. */
  plan: 'POORNA' | 'SVAYAM';
  step: string;
  stepIndex: number;
  stepLabel: string;
  stepPhase: string;
  ticked: number;
  taskCount: number;
  /** A closed step behind the current one is no longer whole. */
  openItem: boolean;
  arrivedAt: string;
}

export interface ArrivalEvent {
  id: string;
  kind: string;
  stepKey: string | null;
  taskIndex: number | null;
  by: { id: string; name: string } | null;
  meta: unknown;
  at: string;
}

/** One person on the bench, with the load they are already carrying. */
export interface BenchSeat {
  staffId: string;
  name: string;
  role: string;
  load: number;
  cap: number;
  /** A reading of the two numbers above, never a third that can disagree. */
  full: boolean;
}

export interface InbodyReading {
  weightKg: number;
  heightCm: number;
  bodyFatPct: number;
  skeletalMuscleKg: number;
  visceralFat: number;
  keyedById: string;
  keyedAt: string;
}

export interface Arrival extends ArrivalRow {
  phone: string | null;
  email: string | null;
  note: string | null;
  /** `{ "assessprep#3": true }` — keyed by step, so stepping back never mixes two. */
  ticks: Record<string, boolean>;
  podSeats: Partial<Record<PodSeatKey, string>>;
  inbody: InbodyReading | null;
  welcomedAt: string | null;
  welcomeText: string | null;
  status: 'ACTIVE' | 'PROMOTED' | 'WITHDRAWN';
  flowVersion: string;
  promotedClientId: string | null;
  firstGap: number;
  stepComplete: boolean;
  readyToFinish: boolean;
  /** The caller's own standing, so the console never has to guess at it. */
  canRun: boolean;
  events: ArrivalEvent[];
  capacity: BenchSeat[];
}

/** What every step-moving call answers with, so nothing is recomputed here. */
export interface FlowState {
  step: string;
  stepIndex: number;
  ticked: number;
  taskCount: number;
  firstGap: number;
  stepComplete: boolean;
  readyToFinish: boolean;
  openItem: boolean;
}

const ARRIVALS = ['arrivals'] as const;

export function useArrivals() {
  return useQuery({
    queryKey: [...ARRIVALS, 'list'],
    queryFn: () => api.get<ArrivalRow[]>('/arrivals'),
  });
}

export function useArrival(id: string | null) {
  return useQuery({
    queryKey: [...ARRIVALS, 'detail', id],
    queryFn: () => api.get<Arrival>(`/arrivals/${id}`),
    enabled: !!id,
  });
}

/**
 * One invalidation set for every write.
 *
 * `['arrivals']` is the PREFIX of both keys above, so a single invalidation
 * refreshes the rail and the open record together. They are never separable: a
 * tick moves the row's progress bar as surely as it moves the checkbox, and a
 * rail still reading "4/7 done" beside a record reading "5/7" is exactly the
 * kind of quiet disagreement this screen exists to prevent.
 */
function useArrivalMutation<TArgs, TResult>(fn: (a: TArgs) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ARRIVALS });
    },
  });
}

/* the request bodies are the SERVER's own schemas, inferred — a field renamed in
   `shared/src/schemas/arrival.ts` breaks the form that fills it rather than
   reaching the API as a 422 nobody expected */
export type CreateArrivalInput = z.infer<typeof schemas.createArrivalSchema>;
export type InbodyInput = z.infer<typeof schemas.inbodySchema>;
export type CapacityOverride = z.infer<typeof schemas.capacityOverrideSchema>;

export function useCreateArrival() {
  return useArrivalMutation((input: CreateArrivalInput) => api.post<ArrivalRow>('/arrivals', input));
}

export function useUpdateArrival() {
  return useArrivalMutation((args: { id: string; plan?: string; note?: string }) => {
    const { id, ...body } = args;
    return api.patch<ArrivalRow>(`/arrivals/${id}`, body);
  });
}

export function useSetTick() {
  return useArrivalMutation((args: { id: string; stepKey: string; taskIndex: number; on: boolean }) =>
    api.post<FlowState>(`/arrivals/${args.id}/ticks`, {
      stepKey: args.stepKey,
      taskIndex: args.taskIndex,
      on: args.on,
    }),
  );
}

export function useCloseStep() {
  return useArrivalMutation((id: string) => api.post<FlowState>(`/arrivals/${id}/close-step`));
}

export function useStepBack() {
  return useArrivalMutation((id: string) => api.post<FlowState>(`/arrivals/${id}/step-back`));
}

/**
 * Seat the team.
 *
 * The whole map goes in one call because the server checks every seat before it
 * writes any of them — a partial allocation would be worse than a refusal, since
 * it looks like it worked.
 */
export function useAllocate() {
  return useArrivalMutation(
    (args: {
      id: string;
      seats: Partial<Record<PodSeatKey, string>>;
      override?: CapacityOverride;
    }) =>
      api.post<FlowState & { podSeats: Partial<Record<PodSeatKey, string>> }>(
        `/arrivals/${args.id}/allocate`,
        { seats: args.seats, ...(args.override ? { override: args.override } : {}) },
      ),
  );
}

export function useKeyInBody() {
  return useArrivalMutation((args: { id: string } & InbodyInput) => {
    const { id, ...body } = args;
    return api.post<FlowState & { inbody: InbodyReading | null }>(`/arrivals/${id}/inbody`, body);
  });
}

export function useSendWelcome() {
  return useArrivalMutation((args: { id: string; text: string }) =>
    api.post<FlowState & { welcomedAt: string | null }>(`/arrivals/${args.id}/welcome`, {
      text: args.text,
    }),
  );
}

/**
 * The one irreversible step, and the only route in the console that mints a
 * client — so it invalidates far more than itself. A promotion adds a row to the
 * Clients rail, consumes capacity on four seats and changes the Home summary's
 * counts; a page that only refreshed Onboarding would leave all three stating
 * the minute before.
 */
export function usePromote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<{ clientId: string; name: string }>(`/arrivals/${id}/promote`),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ARRIVALS });
      void qc.invalidateQueries({ queryKey: ['clients'] });
      void qc.invalidateQueries({ queryKey: ['home', 'summary'] });
    },
  });
}
