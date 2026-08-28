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
