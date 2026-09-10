'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { PillarKey, schemas } from '@haalving/shared';

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

/* ------------------------------------------------------------- the tickets */

/**
 * ATTENTION TICKETS — the board above the morning reading, and a different
 * object from the `AttentionRow` above it.
 *
 * A digest row is TODAY'S ONE-LINE READING of a client: one per client per day,
 * rebuilt at 08:00, and gone tomorrow whether or not anybody acted on it. A
 * ticket persists until somebody closes it, carries an assignee and a
 * resolution, and two of them can stand on one client at once. The tab shows
 * both because they answer different questions — what is still open, and what
 * this morning said — and neither is a copy of the other.
 *
 * NOTHING HERE SORTS OR FILTERS WHAT IT WAS GIVEN. `/attentions` answers loudest
 * first, already scoped to the clients this caller carries, and already narrowed
 * by the chips the board sent as a query. A second pass in the browser could
 * only disagree with the `total` printed beside it.
 */

/** The four, loudest last — the array the API validates against. */
export type TicketSeverity = schemas.AttentionSeverityKey;
export type TicketStatus = schemas.AttentionStatusKey;
export type TicketAction = schemas.AttentionActionKey;

/** A named human on a ticket: its assignee or whoever closed it. */
export interface TicketPerson {
  id: string;
  name: string;
  role: string;
}

export interface AttentionTicket {
  id: string;
  clientId: string;
  severity: TicketSeverity;
  status: TicketStatus;
  title: string;
  description: string;
  /** Which rule or human raised it — `noLogs`, `mealRatingDecline`, `manual`. */
  source: string;
  /** The parts, unjoined. The row prints them with ' · ' between, as a digest line does. */
  evidence: string[];
  dedupeKey: string;
  assignedToId: string | null;
  relatedLogId: string | null;
  dueAt: string | null;
  resolvedAt: string | null;
  resolutionReason: string | null;
  createdAt: string;
  updatedAt: string;
  client: { id: string; name: string };
  assignedTo: TicketPerson | null;
  resolvedBy: TicketPerson | null;
}

export interface AttentionTicketPage {
  rows: AttentionTicket[];
  /** The whole filtered set, not the page — the header counts work, not rows shown. */
  total: number;
  /** OPAQUE. Handed straight back as `?cursor=`; null on the last page. */
  nextCursor: string | null;
}

export interface TicketFilters {
  /** Omitted means the live three. `ALL` is how the board asks past that. */
  status?: TicketStatus | 'ALL' | '';
  severity?: TicketSeverity | '';
  clientId?: string;
  /** `me` is resolved from the token by the server — never a name spelled here. */
  assignedToId?: string;
  /** `time` — newest first (Home and the bell); omitted — loudest first. */
  order?: 'severity' | 'time';
}

/** The board's page size. One screenful, with the rest a button away. */
const TICKET_PAGE = 25;

/**
 * The ticket board, a page at a time.
 *
 * PAGED BY THE SERVER'S CURSOR RATHER THAN BY AN OFFSET, because this list moves
 * under the reader: the 08:00 sweep raises tickets at the top and a colleague
 * closes one in the middle. A cursor names a ROW, so the page after it stays the
 * page after it whatever arrives above.
 */
export function useAttentionTickets(f: TicketFilters) {
  const search = new URLSearchParams(
    Object.entries({ ...f, limit: String(TICKET_PAGE) }).filter(([, v]) => !!v) as [
      string,
      string,
    ][],
  );

  return useInfiniteQuery({
    queryKey: ['home', 'attention', 'tickets', f],
    queryFn: ({ pageParam }) => {
      const q = new URLSearchParams(search);
      if (pageParam) q.set('cursor', pageParam);
      return api.get<AttentionTicketPage>(`/attentions?${q.toString()}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}

/**
 * What a ticket write invalidates.
 *
 * EVERY page of EVERY filter, because a ticket that has just been resolved has
 * left the default board and joined the closed one, and both are cached. And
 * `home/summary`, which the sidebar badge reads — a count that outlives the work
 * it described is the classic "badge says 6, page says none".
 *
 * The digest read at `['home', 'attention']` is a prefix of the ticket key, so
 * one invalidation covers the morning reading too: the rules write both, and a
 * resolved ticket does not silence the line that raised it.
 */
function useInvalidateTickets(): () => void {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['home', 'attention'] });
    void qc.invalidateQueries({ queryKey: ['home', 'summary'] });
  };
}

export interface TicketActionVars {
  id: string;
  action: TicketAction;
  /** `null` is the real act of handing a ticket back to the pod — never omitted for it. */
  assignedToId?: string | null;
  /** Trimmed, 4–500 characters. The server 400s a close without one. */
  resolutionReason?: string;
}

/**
 * The five doors — acknowledge, start, resolve, dismiss, assign.
 *
 * AN ACTION, NOT A STATUS. The API takes no `status` field at all, and that is
 * what keeps "resolved with no reason" and "reopened by a PATCH" from being
 * expressible from here. Which of the five a reader is offered is decided in
 * `TicketRow`; whether they may take it is decided again by the server.
 */
export function useTicketAction() {
  const invalidate = useInvalidateTickets();
  return useMutation({
    mutationFn: ({ id, ...body }: TicketActionVars) =>
      api.patch<AttentionTicket>(`/attentions/${id}`, body),
    onSuccess: invalidate,
  });
}
