'use client';

import { useQuery } from '@tanstack/react-query';
import type { PillarKey } from '@haalving/shared';

import { api } from '@/lib/api';
import type { Celebration } from '@/features/home/RosterCards';
import type { SeenTab } from '@/features/home/attention/queries';

export interface HomeSummary {
  clients: {
    total: number;
    active: number;
    paused: number;
    inactive: number;
    observation: number;
    poorna: number;
    svayam: number;
  };
  risk: { high: number; medium: number };
  levels: { scored: number; mean: Record<PillarKey, number> };
  celebrations: Celebration[];
  pipeline: { open: number; byStage: Record<string, number> };
  queues: { meals: number; approvals: number; medical: number; reports: number };
  notices: { unseen: number };
  /** When today's digest was written — the header's "Digest generated 08:00". */
  generatedAt: string | null;
  /** Unseen per tab. Only `attention` is real today. */
  fresh: Record<SeenTab, number>;
}

/**
 * One query, read by the page AND by the shell's Home badge.
 *
 * Shared so the two can never disagree: a sidebar count that outlived the tab it
 * describes is the classic "badge says 6, page says none".
 */
export function useHomeSummary() {
  return useQuery({
    queryKey: ['home', 'summary'],
    queryFn: () => api.get<HomeSummary>('/home/summary'),
  });
}

/** The sidebar's Home badge: everything unseen, across every tab. */
export function totalFresh(s: HomeSummary | undefined): number {
  if (!s) return 0;
  return Object.values(s.fresh).reduce((a, b) => a + b, 0);
}
