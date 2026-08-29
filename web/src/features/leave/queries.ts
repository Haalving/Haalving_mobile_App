'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LeaveStatus } from '@haalving/shared';

import { api } from '@/lib/api';

/**
 * Time & Cover's data layer.
 *
 * Four reads, one per tab, because they are genuinely different questions asked
 * by different people — a coach never calls `/leave/team`, and an approver's
 * packet list has nothing to do with their own applications.
 *
 * EVERY MUTATION INVALIDATES MORE THAN ITSELF. Approving a leave writes pod
 * covers and session swaps, which changes who the Clients list scopes to and who
 * the Schedule shows on a session — so `clients` and `schedule` are invalidated
 * too. A page that only refreshed itself would leave the rest of the console
 * stating yesterday's seat holder.
 */

export interface LeaveEventRow {
  act: string;
  by: { id: string; name: string } | null;
  at: string;
}

export interface LeaveRow {
  id: string;
  staffId: string;
  staff: { id: string; name: string; role: string; dept: string | null; level: number | null };
  from: string;
  to: string;
  reason: string;
  status: LeaveStatus;
  declineReason: string | null;
  createdAt: string;
  reallocations: Array<{
    clientId: string;
    clientName: string;
    seatKey: string;
    toId: string;
    toName: string;
  }>;
  sessionCovers: Array<{ taskId: string; date: string; toId: string; toName: string }>;
  responses: Array<{ userId: string; name: string; state: string; at: string }>;
  events: LeaveEventRow[];
}

export interface SessionOcc {
  taskId: string;
  date: string;
  startMin: number;
  durMin: number;
  title: string;
  clientId: string | null;
}

export interface MinePayload {
  mine: LeaveRow[];
  toAccept: Array<LeaveRow & { sessions: Array<SessionOcc & { reason: string }> }>;
}

export interface TeamPayload {
  needsPlan: Array<LeaveRow & { ridingCount: number; sessionCount: number }>;
  waiting: Array<LeaveRow & { stillToAnswer: string[] }>;
  runningToday: Array<{
    id: string;
    coverName: string;
    ownerName: string | null;
    clientName: string;
    seatKey: string;
    until: string;
  }>;
  decided: LeaveRow[];
}

export interface BoardPayload {
  leave: LeaveRow;
  seatKey: string | null;
  riding: Array<{ clientId: string; clientName: string; seatKey: string }>;
  sessions: SessionOcc[];
  bench: Array<{
    id: string;
    name: string;
    level: number | null;
    sameLevel: boolean;
    isHod: boolean;
    loadWords: string;
    reasons: Record<string, string>;
  }>;
}

export interface AvailabilityPayload {
  avail: Record<string, unknown> | null;
  tz: string;
  tzLabel: string;
  tzo: number;
}

const MINE = ['leave', 'mine'] as const;
const TEAM = ['leave', 'team'] as const;
const APPROVALS = ['leave', 'approvals'] as const;
const AVAIL = ['availability', 'me'] as const;

export function useMyAvailability() {
  return useQuery({ queryKey: AVAIL, queryFn: () => api.get<AvailabilityPayload>('/availability/me') });
}

export function useMyLeave() {
  return useQuery({ queryKey: MINE, queryFn: () => api.get<MinePayload>('/leave/mine') });
}

export function useTeamLeave(enabled: boolean) {
  return useQuery({
    queryKey: TEAM,
    queryFn: () => api.get<TeamPayload>('/leave/team'),
    enabled,
  });
}

export function useApprovals(enabled: boolean) {
  return useQuery({
    queryKey: APPROVALS,
    queryFn: () => api.get<{ pending: LeaveRow[]; decided: LeaveRow[] }>('/leave/approvals'),
    enabled,
  });
}

export function useBoard(id: string | null) {
  return useQuery({
    queryKey: ['leave', 'board', id],
    queryFn: () => api.get<BoardPayload>(`/leave/${id}/board`),
    enabled: !!id,
  });
}

/**
 * One invalidation set for every write.
 *
 * A cover changes who holds a seat, and that is read by the Clients scope, the
 * Schedule's assignees and the Home summary — so all of them go stale together
 * rather than one at a time.
 */
function useLeaveMutation<TArgs, TResult>(fn: (a: TArgs) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['leave'] });
      void qc.invalidateQueries({ queryKey: ['availability'] });
      void qc.invalidateQueries({ queryKey: ['clients'] });
      void qc.invalidateQueries({ queryKey: ['schedule'] });
      void qc.invalidateQueries({ queryKey: ['home', 'summary'] });
    },
  });
}

export function useSaveAvailability() {
  return useLeaveMutation((week: Record<string, unknown>) =>
    api.put<AvailabilityPayload>('/availability/me', week),
  );
}

export function useApplyLeave() {
  return useLeaveMutation((input: { from: string; to: string; reason: string }) =>
    api.post<{ id: string; status: LeaveStatus }>('/leave', input),
  );
}

export function useWithdrawLeave() {
  return useLeaveMutation((id: string) => api.post(`/leave/${id}/withdraw`));
}

export function useRespondCover() {
  return useLeaveMutation((args: { id: string; accept: boolean }) =>
    api.post<{ status: LeaveStatus }>(`/leave/${args.id}/respond`, { accept: args.accept }),
  );
}

export function usePlanCover() {
  return useLeaveMutation(
    (args: {
      id: string;
      reallocations: Array<{ clientId: string; toId: string }>;
      sessions: Array<{ taskId: string; date: string; toId: string }>;
    }) =>
      api.post<{ status: LeaveStatus; named: string[] }>(`/leave/${args.id}/plan`, {
        reallocations: args.reallocations,
        sessions: args.sessions,
      }),
  );
}

export function useApproveLeave() {
  return useLeaveMutation((id: string) => api.post<{ coverIds: string[] }>(`/leave/${id}/approve`));
}

export function useDeclineLeave() {
  return useLeaveMutation((args: { id: string; reason: string }) =>
    api.post(`/leave/${args.id}/decline`, { reason: args.reason }),
  );
}
