'use client';

import { useState } from 'react';

import { Empty, Notice, Num, SecTitle, SkeletonRows } from '@/components/ui';
import { AssignSheet } from '@/features/home/attention/AssignSheet';
import { AttentionRow } from '@/features/home/attention/AttentionRow';
import { CloseSheet } from '@/features/home/attention/CloseSheet';
import { TicketRow } from '@/features/home/attention/TicketRow';
import {
  useAttention,
  useAttentionTickets,
  useMarkSeen,
  type AttentionTicket,
} from '@/features/home/attention/queries';
import { useCan } from '@/lib/can';

/**
 * The Attention tab — the first board of the morning digest, and the ticket
 * board above it.
 *
 * TWO LISTS, NOT ONE, because they answer different questions and neither is a
 * copy of the other (queries.ts:98-110). The tickets are what is STILL OPEN:
 * they persist until a named human closes them with a reason, and two can stand
 * on one client at once. The digest rows are WHAT THIS MORNING SAID: one per
 * client, rebuilt at 08:00, gone tomorrow whether or not anybody acted.
 *
 * The open work sits on top because it is the only half anybody is accountable
 * for. A reader who opens this tab to find what they owe should not have to
 * scroll past a reading that will be rewritten overnight regardless.
 *
 * NEITHER LIST SORTS WHAT IT WAS GIVEN. Both arrive loudest-first and already
 * scoped to the clients this caller carries; a second pass here could only
 * disagree with the counts printed beside them.
 */

export function AttentionTab() {
  /* only a seat that may name somebody else is ever given the Assign sheet —
     the same gate the row draws its controls behind (TicketRow.tsx:167-177) */
  const seeAll = useCan('seeAllClients');

  /*
   * NO CHIPS, NEWEST FIRST. The board is read like a feed: the latest thing
   * raised on the people you carry is the first thing seen, and everything
   * live is here without asking. `order=time` is the server's own sort, so
   * the pages stay consistent under the cursor.
   */
  const tickets = useAttentionTickets({ order: 'time' });
  const { data, isLoading, isError, error, refetch } = useAttention();

  /*
   * The sheets, held as the TICKET they are about rather than a boolean beside
   * an id — a sheet whose subject can go stale independently of its openness is
   * the shape that produces "Resolve this item?" over the wrong client's name.
   *
   * They live here rather than in the rows because each must outlive the row
   * that opened it: a ticket removed by the refetch its own sheet triggered
   * would take the sheet down with it mid-write.
   */
  const [closing, setClosing] = useState<{ t: AttentionTicket; mode: 'resolve' | 'dismiss' } | null>(
    null,
  );
  const [assigning, setAssigning] = useState<AttentionTicket | null>(null);

  /* THE ONE FILTER: whose hands it is in. "Not taken" is the work nobody has
     picked up yet — the default, because it is the half that is owed; "In hand"
     is what a colleague is already on. Nothing else narrows the board. */
  const [hand, setHand] = useState<'free' | 'taken'>('free');

  /*
   * Stamp after the rows have rendered, not before.
   *
   * This render still shows its New marks and the next visit does not — the
   * demo's `stampSeen` contract. Passing the ids only once they exist means an
   * error or a still-loading tab never clears a badge it did not show.
   *
   * It stamps the DIGEST rows only. The tab badge counts the morning reading,
   * and a ticket is not seen by being scrolled past — it is closed by a named
   * human with a reason, which is what takes it off the board.
   */
  useMarkSeen('attention', data?.map((r) => r.clientId));

  const pages = tickets.data?.pages ?? [];
  const rows = pages.flatMap((p) => p.rows).filter((t) => (hand === 'taken' ? !!t.assignedTo : !t.assignedTo));
  /* the whole live set, not the page — the header counts work, not rows shown */
  const total = pages[0]?.total ?? 0;

  return (
    <>
      {/* ── open work ────────────────────────────────────────────────── */}
      <div className="h1-row" style={{ alignItems: 'center', marginBottom: 'var(--s2)' }}>
        <SecTitle>
          Open items {total > 0 ? <Num>{total}</Num> : null}
        </SecTitle>
        <div className="catseg" role="tablist" aria-label="Whose hands">
          <button type="button" role="tab" aria-selected={hand === 'free'} className={hand === 'free' ? 'on' : ''} onClick={() => setHand('free')}>
            Not taken
          </button>
          <button type="button" role="tab" aria-selected={hand === 'taken'} className={hand === 'taken' ? 'on' : ''} onClick={() => setHand('taken')}>
            In hand
          </button>
        </div>
      </div>

      {tickets.isError ? (
        <Notice kind="bad">
          We could not read the open items. {(tickets.error as Error).message}
          <div className="retry">
            <button type="button" className="btn sm" onClick={() => void tickets.refetch()}>
              Try again
            </button>
          </div>
        </Notice>
      ) : null}

      {tickets.isLoading ? <SkeletonRows rows={3} height={120} /> : null}

      {!tickets.isLoading && !tickets.isError && rows.length === 0 ? (
        <div className="card">
          <Empty icon="leaf" sentence={hand === 'taken' ? 'Nothing is in anybody’s hands.' : 'Nothing open on your clients.'} />
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="list">
          {rows.map((t) => (
            <TicketRow
              key={t.id}
              t={t}
              onClose={(mode) => setClosing({ t, mode })}
              {...(seeAll ? { onAssign: () => setAssigning(t) } : {})}
            />
          ))}
        </div>
      ) : null}

      {/* the rest is a fact about the database, not a guess from a full page —
          the server hands back a cursor only when there genuinely is more */}
      {tickets.hasNextPage ? (
        <div className="retry">
          <button
            type="button"
            className="btn ghost"
            disabled={tickets.isFetchingNextPage}
            onClick={() => void tickets.fetchNextPage()}
          >
            {tickets.isFetchingNextPage ? 'Loading…' : `Show more (${total - rows.length} left)`}
          </button>
        </div>
      ) : null}

      {/* ── this morning's reading ───────────────────────────────────── */}
      <SecTitle>This morning&rsquo;s reading</SecTitle>

      {isError ? (
        <Notice kind="bad">
          We could not read the digest. {(error as Error).message}
          <div className="retry">
            <button type="button" className="btn sm" onClick={() => void refetch()}>
              Try again
            </button>
          </div>
        </Notice>
      ) : null}

      {isLoading ? <SkeletonRows rows={6} height={104} /> : null}

      {/* the demo's own empty state, word for word */}
      {!isLoading && !isError && (!data || data.length === 0) ? (
        <Empty icon="leaf" sentence="No clients allocated to you yet." />
      ) : null}

      {data && data.length > 0 ? (
        <div className="list">
          {data.map((row) => (
            <AttentionRow key={row.id} row={row} />
          ))}
        </div>
      ) : null}

      <CloseSheet
        ticket={closing?.t ?? null}
        mode={closing?.mode ?? 'resolve'}
        open={!!closing}
        onClose={() => setClosing(null)}
      />
      <AssignSheet ticket={assigning} open={!!assigning} onClose={() => setAssigning(null)} />
    </>
  );
}
