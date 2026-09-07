'use client';

import { useState } from 'react';

import { Chip, Empty, Notice, Num, SecTitle, SkeletonRows } from '@/components/ui';
import { AssignSheet } from '@/features/home/attention/AssignSheet';
import { AttentionRow } from '@/features/home/attention/AttentionRow';
import { CloseSheet } from '@/features/home/attention/CloseSheet';
import { TicketRow } from '@/features/home/attention/TicketRow';
import {
  useAttention,
  useAttentionTickets,
  useMarkSeen,
  type AttentionTicket,
  type TicketFilters,
  type TicketSeverity,
} from '@/features/home/attention/queries';
import { useCan } from '@/lib/can';
import { useSession } from '@/store/session.store';

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

/**
 * The status chips, in the order a working day reads them — and the HEADING
 * each one puts over the list.
 *
 * THE TWO TRAVEL TOGETHER because they cannot be allowed to disagree. A fixed
 * "Open items" over a board filtered to Resolved is a header that contradicts
 * the rows underneath it, and the reader believes the header.
 */
const STATUS_CHIPS: { label: string; heading: string; value: TicketFilters['status'] }[] = [
  { label: 'Live', heading: 'Open items', value: '' },
  { label: 'Resolved', heading: 'Resolved', value: 'RESOLVED' },
  { label: 'Dismissed', heading: 'Dismissed', value: 'DISMISSED' },
  { label: 'All', heading: 'Every item', value: 'ALL' },
];

/** Loudest first, matching the pills on the rows below. */
const SEVERITY_CHIPS: { label: string; value: TicketSeverity | '' }[] = [
  { label: 'Any', value: '' },
  { label: 'Critical', value: 'CRITICAL' },
  { label: 'High', value: 'HIGH' },
  { label: 'Watch', value: 'WATCH' },
  { label: 'Info', value: 'INFO' },
];

export function AttentionTab() {
  const meId = useSession((s) => s.user?.id ?? null);
  /* only a seat that may name somebody else is ever given the Assign sheet —
     the same gate the row draws its controls behind (TicketRow.tsx:167-177) */
  const seeAll = useCan('seeAllClients');

  /*
   * The chips, held as the FILTER OBJECT the query is keyed on.
   *
   * Keeping them in one piece of state rather than three means the board makes
   * exactly one request per change, and the cache key is the filter itself — so
   * stepping back to a set of chips already read is instant and cannot show a
   * page fetched under different chips.
   */
  const [status, setStatus] = useState<TicketFilters['status']>('');
  const [severity, setSeverity] = useState<TicketSeverity | ''>('');
  const [mineOnly, setMineOnly] = useState(false);

  const filters: TicketFilters = {
    ...(status ? { status } : {}),
    ...(severity ? { severity } : {}),
    ...(mineOnly && meId ? { assignedToId: meId } : {}),
  };

  const tickets = useAttentionTickets(filters);
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
  const rows = pages.flatMap((p) => p.rows);
  /* the whole filtered set, not the page — the header counts work, not rows shown */
  const total = pages[0]?.total ?? 0;

  const filtered = !!status || !!severity || mineOnly;

  /* the heading follows the status chip, never the other way round */
  const heading = STATUS_CHIPS.find((c) => c.value === status)?.heading ?? 'Open items';
  const live = !status;

  return (
    <>
      {/* ── open work ────────────────────────────────────────────────── */}
      <SecTitle>
        {heading} {total > 0 ? <Num>{total}</Num> : null}
      </SecTitle>

      <p className="sub">
        {live
          ? 'Raised by the morning sweep or by a colleague, and standing until somebody closes one with a reason.'
          : 'Closed items keep the reason they were closed with — that is what a recurrence is read against.'}
      </p>

      <div className="row" style={{ gap: 'var(--s2)', flexWrap: 'wrap', marginBottom: 'var(--s3)' }}>
        {STATUS_CHIPS.map((c) => (
          <Chip key={c.label} selected={status === c.value} onClick={() => setStatus(c.value)}>
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
        {meId ? (
          <Chip
            selected={mineOnly}
            onClick={() => setMineOnly((v) => !v)}
            title="Only the items assigned to you"
          >
            Mine
          </Chip>
        ) : null}
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
          <Empty
            icon="leaf"
            sentence={filtered ? 'Nothing open under these filters.' : 'Nothing open on your clients.'}
            sub={
              filtered
                ? 'Widen the chips above to see the rest.'
                : 'New items are raised by the 08:00 sweep, or by a colleague.'
            }
          />
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
        <>
          <p className="sub">
            Attention-ordered — the loudest thing about each client, with the evidence behind it.
          </p>
          <div className="list">
            {data.map((row) => (
              <AttentionRow key={row.id} row={row} />
            ))}
          </div>
        </>
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
