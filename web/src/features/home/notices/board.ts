'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { schemas } from '@haalving/shared';

import { api } from '@/lib/api';

/**
 * THE HOME NOTICES BOARD — paged, filtered, and with a per-notice lifecycle.
 *
 * A SECOND MODULE BESIDE `queries.ts` RATHER THAN A REPLACEMENT OF IT, because
 * the two read the same rows for different boards and stamp different columns.
 * `queries.ts` answers the WORK BOARD's flat `/home/notices` feed and marks the
 * whole list `seenAt` after paint — "you have looked at this board". This one
 * answers `/notices`, one page at a time, and moves a SINGLE notice through
 * UNREAD → READ → ACKNOWLEDGED by the deliberate act of the person it was
 * addressed to. Collapsing them would make an acknowledgement chase read
 * "was rendered once", which is worth nothing to whoever sent it.
 *
 * A NOTICE IS ADDRESSED, and that is the whole shape of this module: every read
 * below is the caller's own post, taken from the token. There is deliberately no
 * `toId` in any query or body — a filter that could name somebody else's outbox
 * would be a scope hole wearing a query parameter, and the server refuses one
 * for the same reason (`notice.controller.ts`).
 *
 * NOTHING HERE RAISES A NOTICE. Sweeps do that from inside the server, through
 * `notice.service.raise`. A mutation that could post one would let anybody in
 * the building address anybody else under the sweep's name.
 *
 * A notice is NOT an attention ticket, though a sweep often writes both. The
 * ticket is the WORK — assigned, worked, closed with a reason. The notice is the
 * TELLING. `attentionId` is the seam between them.
 */

export type NoticeKind = schemas.NoticeKindKey;
export type NoticeStatus = schemas.NoticeStatusKey;
export type NoticeSeverity = schemas.AttentionSeverityKey;

/** The server's own card, name for name — `notice.service.ts`'s `NoticeCard`. */
export interface NoticeCard {
  id: string;
  kind: NoticeKind;
  severity: NoticeSeverity | null;
  title: string | null;
  text: string;
  client: { id: string; name: string } | null;
  createdAt: string;
  status: NoticeStatus;
  /** The WORK BOARD's stamp, kept beside `status` because they are not the same. */
  seen: boolean;
  acknowledgedAt: string | null;
  /** The ticket this announces, when a sweep raised one — the click-through. */
  attentionId: string | null;
}

export interface NoticePage {
  rows: NoticeCard[];
  pagination: { limit: number; nextCursor: string | null };
}

export interface NoticeFilters {
  unreadOnly?: boolean;
  kind?: NoticeKind | '';
  severity?: NoticeSeverity | '';
  clientId?: string;
}

/** One screenful, with the rest a button away. */
const PAGE = 25;

/**
 * The board's key, kept UNDER the work board's without colliding with it.
 *
 * `['home','notices']` is `queries.ts`'s exact key. TanStack matches by prefix
 * in one direction only, so invalidating `[...,'board']` leaves the work board's
 * feed alone — which is the point: its New marks are cleared by its own stamp,
 * on its own schedule, and a write here must not drain them early.
 */
const KEY = ['home', 'notices', 'board'] as const;
const COUNT_KEY = ['home', 'notices', 'unread-count'] as const;

/**
 * The caller's own outbox, newest first, a page at a time.
 *
 * PAGED BY THE SERVER'S CURSOR RATHER THAN BY AN OFFSET, because this list grows
 * at the TOP. A sweep raising three notices while somebody reads page two would
 * push three rows they have already read down into it, and `skip: 50` would show
 * those again while hiding three it never showed. A cursor names a ROW, so the
 * page after it stays the page after it whatever arrives above.
 */
export function useNoticeBoard(f: NoticeFilters) {
  const base = new URLSearchParams({ limit: String(PAGE) });
  if (f.unreadOnly) base.set('unreadOnly', 'true');
  if (f.kind) base.set('kind', f.kind);
  if (f.severity) base.set('severity', f.severity);
  if (f.clientId) base.set('clientId', f.clientId);

  return useInfiniteQuery({
    queryKey: [...KEY, f],
    queryFn: ({ pageParam }) => {
      const q = new URLSearchParams(base);
      if (pageParam) q.set('cursor', pageParam);
      return api.get<NoticePage>(`/notices?${q.toString()}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.pagination.nextCursor,
  });
}

/** What the header count reads. Its own endpoint, so it costs one COUNT. */
export function useUnreadNotices() {
  return useQuery({
    queryKey: COUNT_KEY,
    queryFn: () => api.get<{ unread: number }>('/notices/unread-count'),
    /* polled: a session reminder lands on the minute, and the bell should
       show it without the page being touched */
    refetchInterval: 60_000,
  });
}

/**
 * What a notice write invalidates.
 *
 * EVERY page of EVERY filter on this board, because a notice just marked read
 * has left the "Unread only" list and joined the rest, and both are cached. And
 * the count, which is a separate endpoint and would otherwise keep counting a
 * notice the reader is looking at — the classic "badge says 6, page says none".
 */
function useInvalidate(): () => void {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: KEY });
    void qc.invalidateQueries({ queryKey: COUNT_KEY });
    void qc.invalidateQueries({ queryKey: ['home', 'summary'] });
  };
}

/**
 * UNREAD → READ. Opening one on Home.
 *
 * The lesser of the two doors and the one that happens by itself: a reader who
 * opened a notice has read it. Not audited and not logged — see the service.
 */
export function useMarkNoticeRead() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.post<NoticeCard>(`/notices/${id}/read`, {}),
    onSuccess: invalidate,
  });
}

/**
 * "I have this." The FURTHER of the two states, and it does not fall back.
 *
 * A deliberate act with a timestamp on it, which is why it is a separate door
 * from Read rather than a flag on the same one: "this was on their screen" and
 * "they said they have it" are different facts, and the second is the one
 * anybody actually chases.
 */
export function useAcknowledgeNotice() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.post<NoticeCard>(`/notices/${id}/acknowledge`, {}),
    onSuccess: invalidate,
  });
}
