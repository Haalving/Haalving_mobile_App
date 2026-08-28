'use client';

import { useMemo, useState } from 'react';

import { Empty, Notice, Num, SecTitle, SkeletonRows } from '@/components/ui';
import { useClients } from '@/features/clients/queries';
import { useMarkSeen } from '@/features/home/attention/queries';
import { DismissSheet } from '@/features/home/followups/DismissSheet';
import { DraftCard } from '@/features/home/followups/DraftCard';
import { NewFollowupSheet } from '@/features/home/followups/NewFollowupSheet';
import { ReturnSheet } from '@/features/home/followups/ReturnSheet';
import { SendAllSheet } from '@/features/home/followups/SendAllSheet';
import { useFollowups, type FollowupRow } from '@/features/home/followups/queries';
import { useCan } from '@/lib/can';
import { useSession } from '@/store/session.store';

/**
 * The Follow-ups tab — `followupsHtml` (console-digest.js:634-644), widened to
 * carry the coach-authored drafts the demo never had.
 *
 * THE TAB'S OWN SENTENCE IS ITS SPECIFICATION: the copilot drafts, a named human
 * sends. Everything below is arranged so that a reader can always answer "who
 * wrote this, and who is it waiting on" without opening anything — which is why
 * the two human queues are named with headings and the copilot's drafts are not.
 * The `.aidraft` ground already says who wrote those.
 *
 * THE SHEETS LIVE HERE, not in the cards. Dismiss, Return and the bulk review
 * each need a modal that outlives the row that opened it — a row removed by the
 * refetch its own sheet triggered would take the sheet down with it mid-write.
 * One of each, mounted once, driven by the row the tab is holding.
 */

/**
 * A stable empty list for the memo below.
 *
 * `data ?? []` would mint a new array on every render while the query is
 * settling and re-run the partition each time for nothing.
 */
const NO_ROWS: FollowupRow[] = [];

/**
 * Can this row still be sent?
 *
 * The two halves of the same act: the copilot's own draft, which a sender
 * releases, and a coach's draft waiting on that sender's signature. RETURNED is
 * not sendable — it is back with its author by someone's explicit decision, and
 * a bulk send would quietly overrule the person who returned it.
 */
function isSendable(row: FollowupRow): boolean {
  if (row.source === 'AI') return row.status === 'DRAFT';
  return row.status === 'PENDING_APPROVAL';
}

interface Board {
  /** Coach drafts under "Waiting for your approval". */
  pending: FollowupRow[];
  /** RETURNED rows — the server only ever routes these to their author. */
  returned: FollowupRow[];
  /** The copilot's drafts: ungrouped and unheaded, as the demo has them. */
  drafts: FollowupRow[];
  sent: FollowupRow[];
  /** Every non-SENT row this tab actually DREW, in the server's order. */
  drawn: FollowupRow[];
}

/**
 * Split the server's list into the boards it is read as.
 *
 * PARTITION, NEVER SORT. `/followups` arrives grouped (PENDING_APPROVAL,
 * RETURNED, DRAFT, SENT) and newest-first inside each group, so a single pass
 * that only ever appends keeps the server's order inside every bucket for free.
 * A second sort here could disagree with the count on the send-all button, which
 * reads the same list — the failure AttentionTab.tsx:10-13 names.
 *
 * The pass is TOTAL: every row lands in exactly one bucket, and anything the
 * contract grows later falls through to `drafts` rather than vanishing. There is
 * exactly one deliberate exception, and it is the `continue` below.
 */
function partition(rows: FollowupRow[], canApprove: boolean, myId: string | null): Board {
  const board: Board = { pending: [], returned: [], drafts: [], sent: [], drawn: [] };

  for (const row of rows) {
    if (row.status === 'SENT') {
      board.sent.push(row);
      continue;
    }

    let bucket: FollowupRow[];

    if (row.status === 'RETURNED') {
      bucket = board.returned;
    } else if (row.source === 'COACH' && row.status === 'PENDING_APPROVAL') {
      /*
       * THE ONE ROW THIS TAB DOES NOT DRAW: a peer's draft, seen by a coach who
       * cannot approve it.
       *
       * The heading says "Waiting for your approval", and for that reader it is
       * not — it is waiting on someone else, and the card would carry no
       * actions because `DraftCard` correctly gives a non-approver non-author
       * none. A row under a heading that misnames who it is waiting on is worse
       * than no row: it invites a coach to believe a client's message is theirs
       * to release.
       *
       * It is dropped from `drawn` as well as from the board, so the seen-stamp
       * below never clears a badge for a line this reader was not shown — the
       * rule attention/queries.ts:38-68 keeps. The badge keeps counting it until
       * the person who can act on it opens the tab.
       *
       * In practice this is empty: the server scopes the board to the clients
       * the caller carries and routes approvals to the people who hold
       * `sendDigest`. This is the guard for the day that changes.
       */
      if (!canApprove && row.createdBy?.id !== myId) continue;
      bucket = board.pending;
    } else {
      bucket = board.drafts;
    }

    bucket.push(row);
    board.drawn.push(row);
  }

  return board;
}

export function FollowupsTab() {
  const { data, isLoading, isError, error, refetch } = useFollowups();

  const canSend = useCan('sendDigest');
  const myId = useSession((s) => s.user?.id ?? null);

  /*
   * Read unfiltered, and only to answer "does this person carry anybody".
   *
   * `/clients` is already server-scoped, and calling it with no filters shares
   * the one cache entry the Clients page and `NewFollowupSheet` both use
   * (`['clients', {}]`) — so opening the sheet after this costs no second
   * request. A coach with an empty roster has nobody to write to, and a compose
   * button that opens onto "No clients allocated to you yet." is a button that
   * lies about what it can do.
   */
  const { data: clients } = useClients();
  const hasClients = (clients?.length ?? 0) > 0;

  const board = useMemo(
    () => partition(data ?? NO_ROWS, canSend, myId),
    [data, canSend, myId],
  );

  /*
   * What the bulk review will send — taken from the rows the tab DREW, not from
   * the raw response, so the sheet can never list a draft this reader was not
   * shown. Filtering `drawn` also keeps the server's order, which is the order
   * the sheet promises to render in.
   */
  const sendable = useMemo(() => board.drawn.filter(isSendable), [board]);

  /*
   * Stamp after the rows have rendered, not before.
   *
   * The timing is `stampSeen`'s and it is the whole point: THIS render still
   * shows its New marks and the next visit does not (attention/queries.ts:52-68).
   * Passing the ids only once they exist means an error or a still-loading tab
   * never clears a badge it did not show — and passing `drawn` rather than every
   * non-SENT id means a withheld row keeps its badge for the person who can act
   * on it.
   *
   * The hook is imported from the Attention board rather than copied: one
   * module-scope guard has to serve every tab, or two copies would each stamp
   * once and the "posted once" contract would be a lie per-tab.
   */
  useMarkSeen('followups', data ? board.drawn.map((r) => r.id) : undefined);

  /*
   * The sheets, held as the ROW they are about rather than a boolean beside an
   * id. A sheet whose subject can go stale independently of its openness is the
   * shape that produces "Dismiss this draft?" over the wrong client's name.
   */
  const [dismissing, setDismissing] = useState<FollowupRow | null>(null);
  const [returning, setReturning] = useState<FollowupRow | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [composing, setComposing] = useState(false);

  if (isError) {
    return (
      <Notice kind="bad">
        We could not read the digest. {(error as Error).message}
        <div className="retry">
          <button type="button" className="btn sm" onClick={() => void refetch()}>
            Try again
          </button>
        </div>
      </Notice>
    );
  }

  if (isLoading) return <SkeletonRows rows={4} height={140} />;

  const rows = data ?? NO_ROWS;

  /*
   * `.h1-row` with the promise on the left and the actions on the right, exactly
   * as the demo builds it (console-digest.js:637-643) — including the inline
   * `margin:0`, which is the demo's own and the only inline style here.
   *
   * The demo has ONE trailing button; this has two, so they sit in the trailing
   * group the rest of the product uses for exactly that
   * (`<span class="row" style="gap:var(--s2)">`, console-approvals.js:57). Two
   * loose children of a `justify-content:space-between` row would push the pair
   * apart and hang one of them in the middle of the line.
   */
  const actions =
    hasClients || (canSend && sendable.length > 0) ? (
      <span className="row" style={{ gap: 'var(--s2)' }}>
        {hasClients ? (
          <button type="button" className="btn ghost" onClick={() => setComposing(true)}>
            New follow-up
          </button>
        ) : null}
        {canSend && sendable.length > 0 ? (
          <button type="button" className="btn" onClick={() => setReviewing(true)}>
            Review &amp; send all (<Num>{sendable.length}</Num>)
          </button>
        ) : null}
      </span>
    ) : null;

  const openDismiss = (row: FollowupRow) => setDismissing(row);
  const openReturn = (row: FollowupRow) => setReturning(row);

  const card = (row: FollowupRow) => (
    <DraftCard key={row.id} row={row} onDismiss={openDismiss} onReturn={openReturn} />
  );

  return (
    <>
      <div className="h1-row">
        <p className="sub" style={{ margin: 0 }}>
          The copilot drafts; a named human sends. Every message lands in that client’s Care Circle
          under your name.
        </p>
        {actions}
      </div>

      {/*
        The demo's own empty state, word for word — but under the header rather
        than instead of it, which is a DELIBERATE divergence.

        `followupsHtml` returns the empty state alone (console-digest.js:636)
        because the demo's follow-ups are copilot-authored only: on a day with no
        drafts there is genuinely nothing a coach can do here. This board has a
        compose path, and an empty day is the likeliest day to want it — so the
        header, which is where New follow-up lives, stays.
      */}
      {rows.length === 0 ? (
        <Empty icon="leaf" sentence="No follow-ups drafted for your clients today." />
      ) : null}

      {board.pending.length > 0 ? (
        <>
          <SecTitle>Waiting for your approval</SecTitle>
          <div className="list">{board.pending.map(card)}</div>
        </>
      ) : null}

      {board.returned.length > 0 ? (
        <>
          <SecTitle>Returned to you</SecTitle>
          <div className="list">{board.returned.map(card)}</div>
        </>
      ) : null}

      {/*
        ONE list for the copilot's drafts and the sent receipts, in that order —
        the demo's own single `.list` (console-digest.js:643), where a sent row is
        just a draft further along and the `opacity:.8` does the separating.

        Splitting them would put the `--s5` gap `.cs-main` gives its children
        between a draft and its own receipt, and a gap that size with no heading
        over it reads as a missing section rather than a change of state.

        No heading over either: the `.aidraft` ground already says who wrote the
        drafts, and "Sent by {name}" already says who released the rest.
      */}
      {board.drafts.length > 0 || board.sent.length > 0 ? (
        <div className="list">
          {board.drafts.map(card)}
          {board.sent.map(card)}
        </div>
      ) : null}

      <DismissSheet
        row={dismissing}
        open={!!dismissing}
        onClose={() => setDismissing(null)}
      />
      <ReturnSheet row={returning} open={!!returning} onClose={() => setReturning(null)} />
      <SendAllSheet rows={sendable} open={reviewing} onClose={() => setReviewing(false)} />
      <NewFollowupSheet open={composing} onClose={() => setComposing(false)} />
    </>
  );
}
