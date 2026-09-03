'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

/**
 * Notices — the sweeps' outbox, the demo's `HV.noticesFor(me.id)`.
 *
 * SLA nudges and escalations, session reminders, leave decisions and
 * celebrations, each already addressed to a recipient by the flow that wrote it.
 * Surfaced on the work board (and the Home Notices tab reads the same feed).
 */
export interface NoticeRow {
  id: string;
  kind: 'LEAVE' | 'SLA' | 'REMINDER' | 'CELEBRATION' | 'TASK';
  text: string;
  client: { id: string; name: string } | null;
  /** ISO — the row prints "X ago" from it. */
  createdAt: string;
  seen: boolean;
}

export function useNotices() {
  return useQuery({
    queryKey: ['home', 'notices'],
    queryFn: () => api.get<NoticeRow[]>('/home/notices'),
  });
}

/**
 * Stamp every unseen notice seen — viewing the board is the acknowledgement.
 *
 * Deliberately does NOT refetch the notices: this render still shows its New
 * marks, and the next mount comes back drained. Only the Home badge is marked
 * stale (not refetched now) so the count it carries can catch up on the next
 * visit rather than blanking under the marks that justify it.
 */
export function useMarkNoticesSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ seen: number }>('/home/notices/seen'),
    onSuccess: (res) => {
      if (!res.seen) return;
      void qc.invalidateQueries({ queryKey: ['home', 'summary'], refetchType: 'none' });
    },
  });
}
