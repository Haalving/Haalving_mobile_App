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

export interface StaffFilters {
  role?: string;
  dept?: string;
  status?: string;
  q?: string;
}

export function useStaff(filters: StaffFilters = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) qs.set(k, v);
  const suffix = qs.toString() ? `?${qs}` : '';

  return useQuery({
    queryKey: ['users', filters],
    queryFn: () => api.get<StaffUser[]>(`/users${suffix}`),
  });
}

export function useStaffMember(id: string) {
  return useQuery({
    queryKey: ['users', id],
    queryFn: () => api.get<StaffUser>(`/users/${id}`),
    enabled: !!id,
  });
}

type CreateUserInput = z.infer<typeof schemas.createUserSchema>;
type UpdateUserInput = z.infer<typeof schemas.updateUserSchema>;

export function useCreateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) => api.post<StaffUser>('/users', input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateUserInput }) =>
      api.patch<StaffUser>(`/users/${id}`, input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['users'] }),
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
      void qc.invalidateQueries({ queryKey: ['me'] });
      void qc.invalidateQueries({ queryKey: ['home', 'summary'] });
    },
  });
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
