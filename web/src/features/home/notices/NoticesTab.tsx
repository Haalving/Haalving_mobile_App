'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Empty, Notice, Num, Sheet, SkeletonRows } from '@/components/ui';
import { NoticeCardRow } from '@/features/home/notices/NoticeCardRow';
import { useNoticeBoard, useUnreadNotices } from '@/features/home/notices/board';
import { NoticeDetail } from '@/features/notifications/cards';

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
 * first, and there are no chips: the board is the whole of what was said to
 * you, in the order it was said. A TAP OPENS THE NOTICE IN FULL — the same
 * card the bell shows — rather than leaving for the client's record.
 */

export function NoticesTab() {
  const router = useRouter();
  /* the notice open in the card, by id — the card reads the LIVE row, so an
     acknowledge taken on it shows on it */
  const [openId, setOpenId] = useState<string | null>(null);

  const q = useNoticeBoard({});
  /* its own endpoint so the badge costs one COUNT rather than a page read */
  const { data: badge } = useUnreadNotices();

  const rows = (q.data?.pages ?? []).flatMap((p) => p.rows);
  const unread = badge?.unread ?? 0;
  const opened = openId ? (rows.find((n) => n.id === openId) ?? null) : null;

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
            sentence="Nothing has been sent to you."
            sub="Escalations, reminders and leave decisions land here, marked read when you open them."
          />
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="list">
          {rows.map((n) => (
            <NoticeCardRow key={n.id} n={n} onOpen={() => setOpenId(n.id)} />
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

      {/* THE CARD — the notice in full, the same one the bell opens */}
      <Sheet open={!!opened} onClose={() => setOpenId(null)} label="Notice">
        {opened ? (
          <NoticeDetail
            n={opened}
            onOpenTicket={() => {
              setOpenId(null);
              router.push('/home/attention');
            }}
            onLeave={() => setOpenId(null)}
          />
        ) : null}
      </Sheet>
    </>
  );
}
