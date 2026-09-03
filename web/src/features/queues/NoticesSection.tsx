'use client';

import { useEffect } from 'react';

import { Audit, IconTile, Num, Pill, SecTitle } from '@/components/ui';
import { ago } from '@haalving/shared';
import {
  useMarkNoticesSeen,
  useNotices,
  type NoticeRow,
} from '@/features/home/notices/queries';

/**
 * NOTICES — the sweeps' outbox, ported from console-ops.js `noticesHtml`.
 *
 * SLA nudges and escalations, session reminders, leave decisions and
 * celebrations land here; each carries an icon by kind, the client it concerns
 * and how long ago it arrived. Unseen ones are marked New for THIS render and
 * stamped seen after paint — viewing the board is the acknowledgement, so the
 * count drains on the next visit rather than under the reader's eyes.
 */

const NOTICE_ICON: Record<NoticeRow['kind'], string> = {
  SLA: 'clock',
  REMINDER: 'bell',
  CELEBRATION: 'sparkle',
  LEAVE: 'cal',
  TASK: 'doc',
};

function Row({ n }: { n: NoticeRow }) {
  return (
    <div className={`trow${n.seen ? '' : ' dg-fresh'}`}>
      <IconTile name={NOTICE_ICON[n.kind] ?? 'star'} />
      <div className="grow">
        {n.text}
        <small>
          {n.client ? `${n.client.name} · ` : ''}
          {ago(n.createdAt)}
        </small>
      </div>
      {n.seen ? null : <Pill kind="info">New</Pill>}
    </div>
  );
}

export function NoticesSection() {
  const { data } = useNotices();
  const markSeen = useMarkNoticesSeen();

  const unseen = data?.reduce((n, r) => n + (r.seen ? 0 : 1), 0) ?? 0;
  const hasUnseen = unseen > 0;

  /* stamp seen once the rows are on screen, and only when something is unseen —
     a quiet board never writes. Keyed on the boolean so it fires once per set. */
  useEffect(() => {
    if (hasUnseen) markSeen.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnseen]);

  if (!data || !data.length) return null;

  const shown = data.slice(0, 8);
  return (
    /* the board's last section — the gap goes ABOVE it, off the task list */
    <section style={{ marginTop: 'var(--s4)' }}>
      <SecTitle>
        Notices{' '}
        {unseen ? (
          <Pill kind="info">
            <Num>{unseen}</Num> new
          </Pill>
        ) : null}
      </SecTitle>
      <div className="list">
        {shown.map((n) => (
          <Row key={n.id} n={n} />
        ))}
      </div>
      {data.length > 8 ? (
        <Audit>
          <Num>{data.length - 8}</Num> older notices kept in the store.
        </Audit>
      ) : null}
      <Audit>Escalations, reminders and leave decisions land here — marked seen once viewed.</Audit>
    </section>
  );
}
