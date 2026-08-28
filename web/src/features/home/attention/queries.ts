'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { PillarKey } from '@haalving/shared';

import { api } from '@/lib/api';
import type { SessionLedger } from '@/components/ui';

export type SeenTab = 'attention' | 'replies' | 'followups' | 'tasks' | 'notices' | 'sessions';

export interface AttentionRow {
  id: string;
  clientId: string;
  flag: 'HIGH' | 'MED' | null;
  text: string;
  /** The parts, unjoined. The row prints them with ' · ' between. */
  evidence: string[];
  position: number;
  /** Not yet seen by THIS user on this tab. */
  fresh: boolean;
  client: {
    id: string;
    name: string;
    plan: 'POORNA' | 'SVAYAM';
    levels: Partial<Record<PillarKey, number>>;
    sessions: SessionLedger | null;
  };
}

export function useAttention() {
  return useQuery({
    queryKey: ['home', 'attention'],
    queryFn: () => api.get<AttentionRow[]>('/home/attention'),
  });
}

/**
 * What has already been stamped this page load, keyed by tab.
 *
 * MODULE SCOPE, not a ref, and that is deliberate. React StrictMode mounts every
 * component twice in development and gives the second mount a FRESH `useRef`, so
 * a ref guard lets the effect post twice — harmless (the server answers
 * `changed: false`) but it is a double write on every visit and it makes the
 * "posted once" contract untestable.
 *
 * Module scope has exactly the right lifetime: it survives StrictMode's remount
 * and a client-side navigation, and resets on a real page load, which is when a
 * fresh stamp is genuinely wanted.
 */
const stamped = new Map<SeenTab, string>();

/**
 * Stamp a tab as seen, once, after its rows have rendered.
 *
 * THE TIMING IS THE WHOLE POINT, and it is `stampSeen`'s: the render that first
 * shows the rows must still show its New marks, and the NEXT visit must not. So
 * the post happens in an effect after paint, and the `attention` query is
 * deliberately NOT invalidated — refetching it here would come back with
 * `fresh: false` on every row and wipe the marks out from under the reader.
 *
 * Only `home/summary` is invalidated, because that is what the tab badge and the
 * sidebar count read.
 *
 * The guard keys on the id LIST, not a boolean, so a genuinely different set of
 * rows — a new digest line arriving, or a different user signing in — stamps
 * again.
 */
export function useMarkSeen(tab: SeenTab, ids: string[] | undefined) {
  const qc = useQueryClient();

  const mutate = useMutation({
    mutationFn: (payload: { tab: SeenTab; ids: string[] }) =>
      api.post<{ changed: boolean }>('/home/seen', payload),
    onSuccess: (res) => {
      /* nothing moved, so nothing needs re-reading — this is the second visit
         with the same rows, and the server said so */
      if (!res.changed) return;

      /*
       * `refetchType: 'none'` — mark the summary STALE, do not refetch it now.
       *
       * This is the render that just showed six New marks. Refetching here would
       * come straight back with `fresh.attention: 0` and blank the tab badge and
       * the sidebar count while the reader is still looking at the marks that
       * justify them — the numbers would contradict the page describing them.
       *
       * The demo has the same shape for the same reason: `stampSeen` runs AFTER
       * the markup is built, so this view keeps its counts and the NEXT one is
       * drained. Marking stale gets exactly that — the next mount refetches.
       */
      void qc.invalidateQueries({ queryKey: ['home', 'summary'], refetchType: 'none' });
    },
  });

  const key = ids ? ids.join('|') : null;

  useEffect(() => {
    if (!ids || key === null) return;
    if (stamped.get(tab) === key) return;
    stamped.set(tab, key);
    /* an empty tab still stamps: it clears a badge left behind by rows that
       have since gone away */
    mutate.mutate({ tab, ids });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tab]);
}
