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
