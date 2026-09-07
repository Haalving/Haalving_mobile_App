'use client';

import { useState } from 'react';
import { schemas } from '@haalving/shared';

import { Chip, Empty, Notice, Num, SkeletonRows } from '@/components/ui';
import { NoticeCardRow } from '@/features/home/notices/NoticeCardRow';
import {
  useNoticeBoard,
  useUnreadNotices,
  type NoticeFilters,
  type NoticeKind,
  type NoticeSeverity,
} from '@/features/home/notices/board';

/**
 * The Notices tab — everything the building said to THIS reader, by name.
 *
 * ADDRESSED, NOT SCOPED, and that difference is the whole board. Every other
 * list on Home is filtered to the clients you carry; this one is filtered to
 * YOU. A notice was written to one person by the flow that raised it, so there
 * is no view of anybody else's here and no filter that could ask for one — the
 * server takes the recipient from the token and ignores the question.
 *
 * NOT THE SAME AS THE ATTENTION BOARD, though a sweep usually writes both. A
 * ticket is the WORK — assigned, picked up, closed with a reason that outlives
 * it. A notice is the TELLING — read once, acknowledged when you want the sender
 * to know it landed, and never assigned to anybody because it is not a job.
 *
 * NOTHING HERE SORTS OR FILTERS WHAT IT WAS GIVEN. `/notices` answers newest
 * first, already narrowed by the chips this board sent as a query; a second pass
 * in the browser could only disagree with the badge that reads the same rows.
 */

/**
 * What each kind is called on its chip.
 *
 * SPELLED OUT RATHER THAN DERIVED FROM THE ENUM. Title-casing the constant
 * mechanically gets `SLA` wrong — it comes out "Sla", which reads as a typo
 * rather than as an acronym, and no amount of cleverness in the transform fixes
 * the general case. A short map is the honest way to name seven things.
 */
const KIND_LABEL: Record<NoticeKind, string> = {
  LEAVE: 'Leave',
  SLA: 'SLA',
  REMINDER: 'Reminder',
  CELEBRATION: 'Celebration',
  TASK: 'Task',
  CLIENT_RISK: 'Client risk',
  SLA_BREACH: 'SLA breach',
};

/**
 * The chips themselves, driven by the ENUM rather than by the map above.
 *
 * `NOTICE_KINDS` is appended to, never reordered, so iterating it means a kind
 * added on the server shows up here the day it ships. The map only supplies the
 * wording, and falls back to the constant so an unmapped kind is still
 * filterable rather than missing.
 */
const KIND_CHIPS: { label: string; value: NoticeKind | '' }[] = [
  { label: 'Everything', value: '' },
  ...schemas.NOTICE_KINDS.map((k) => ({ value: k as NoticeKind, label: KIND_LABEL[k] ?? k })),
];

const SEVERITY_CHIPS: { label: string; value: NoticeSeverity | '' }[] = [
  { label: 'Any', value: '' },
  { label: 'Critical', value: 'CRITICAL' },
  { label: 'High', value: 'HIGH' },
  { label: 'Watch', value: 'WATCH' },
  { label: 'Info', value: 'INFO' },
];

export function NoticesTab() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [kind, setKind] = useState<NoticeKind | ''>('');
  const [severity, setSeverity] = useState<NoticeSeverity | ''>('');

  const filters: NoticeFilters = {
    ...(unreadOnly ? { unreadOnly: true } : {}),
    ...(kind ? { kind } : {}),
    ...(severity ? { severity } : {}),
  };

  const q = useNoticeBoard(filters);
  /* its own endpoint so the badge costs one COUNT rather than a page read —
     and so it stays right on a filtered board, which pages cannot tell it */
  const { data: badge } = useUnreadNotices();

  const rows = (q.data?.pages ?? []).flatMap((p) => p.rows);
  const unread = badge?.unread ?? 0;
  const filtered = unreadOnly || !!kind || !!severity;

  /*
   * NO SEEN-STAMP ON THIS TAB, deliberately — the one place it would be wrong.
   *
   * Every other Home tab stamps its whole list after paint, because "you have
   * looked at this board" is all those badges claim. A notice's UNREAD → READ is
   * a statement about ONE notice by the person it was addressed to, and it is
   * what an acknowledgement chase is read against. Draining it by scrolling past
   * would make the column mean "was rendered once", which is worth nothing to
   * whoever sent it.
   *
   * So each row marks itself read when it is opened, and the badge above counts
   * what genuinely has not been.
   */

  return (
    <>
      <p className="sub">
        Escalations, reminders and leave decisions, addressed to you.{' '}
        {unread > 0 ? (
          <>
            <Num>{unread}</Num> still unread.
          </>
        ) : (
          'Nothing unread.'
        )}
      </p>

      <div className="row" style={{ gap: 'var(--s2)', flexWrap: 'wrap', marginBottom: 'var(--s3)' }}>
        <Chip selected={unreadOnly} onClick={() => setUnreadOnly((v) => !v)}>
          Unread only
        </Chip>
        <span aria-hidden="true" style={{ width: 'var(--s3)' }} />
        {KIND_CHIPS.map((c) => (
          <Chip key={c.label} selected={kind === c.value} onClick={() => setKind(c.value)}>
            {c.label}
          </Chip>
        ))}
        <span aria-hidden="true" style={{ width: 'var(--s3)' }} />
        {SEVERITY_CHIPS.map((c) => (
          <Chip
            key={c.label}
            selected={severity === c.value}
            onClick={() => setSeverity(c.value)}
          >
            {c.label}
          </Chip>
        ))}
      </div>

      {q.isError ? (
        <Notice kind="bad">
          We could not read your notices. {(q.error as Error).message}
          <div className="retry">
            <button type="button" className="btn sm" onClick={() => void q.refetch()}>
              Try again
            </button>
          </div>
        </Notice>
      ) : null}

      {q.isLoading ? <SkeletonRows rows={5} height={104} /> : null}

      {!q.isLoading && !q.isError && rows.length === 0 ? (
        <div className="card">
          <Empty
            icon="bell"
            sentence={filtered ? 'Nothing here under these filters.' : 'Nothing has been sent to you.'}
            sub={
              filtered
                ? 'Widen the chips above to see the rest.'
                : 'Escalations, reminders and leave decisions land here, marked seen when you read them.'
            }
          />
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="list">
          {rows.map((n) => (
            <NoticeCardRow key={n.id} n={n} />
          ))}
        </div>
      ) : null}

      {/* the rest is a fact about the database, not a guess from a full page —
          the server hands back a cursor only when there genuinely is more */}
      {q.hasNextPage ? (
        <div className="retry">
          <button
            type="button"
            className="btn ghost"
            disabled={q.isFetchingNextPage}
            onClick={() => void q.fetchNextPage()}
          >
            {q.isFetchingNextPage ? 'Loading…' : 'Show older'}
          </button>
        </div>
      ) : null}
    </>
  );
}
