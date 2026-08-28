'use client';

import { useState, type ReactNode } from 'react';

import { Icon } from '@/components/icons/Icon';
import { Avatar, Notice, Pill, useToast } from '@/components/ui';
import {
  useApproveFollowup,
  useDeleteFollowup,
  useEditFollowup,
  useResubmitFollowup,
  useSendFollowup,
  type FollowupRow,
} from '@/features/home/followups/queries';
import { useCan } from '@/lib/can';
import { useSession } from '@/store/session.store';

/**
 * One follow-up, in every state it can be in — ported from `draftHtml`
 * (console-digest.js:594-632) and widened to carry the coach-authored drafts the
 * demo never had.
 *
 * FIVE STATES, ONE COMPONENT, because they are one row: the same client, the
 * same sentence, at different points of the same journey.
 *
 *   AI draft         the demo's `.aidraft` — sparkle label, Edit / Approve & send / Dismiss…
 *   coach, pending   a plain `.card`, NOT an aidraft: a human wrote it, so the
 *                    "AI draft — review before use" label would be a lie
 *   coach, returned  the same card, carrying the approver's note back to its author
 *   editing          the demo's textarea body, worn over whichever chrome above
 *   sent             a quiet `.trow` at opacity .8 — no longer a draft at all
 *
 * Splitting these into five components would put the editing branch, which
 * every editable state shares, in three places and let them drift.
 *
 * THE SHEETS ARE NOT HERE. Dismiss and Return both need a modal that outlives
 * this row's own render, so the card calls `onDismiss` / `onReturn` and the tab
 * owns the sheet — one sheet serving a list, rather than one mounted per row.
 */

/**
 * The AI ground — `HV.ui.aidraft` (core.js:2658), same markup, same order.
 *
 * The label is not decoration: every machine-written sentence in the product
 * sits on this tinted panel and says so above itself, so a reader never has to
 * work out whether a human meant it. `.acts` is omitted entirely when there is
 * nothing to do, exactly as the builder does.
 */
function AiDraft({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="aidraft">
      <span className="lbl">
        <Icon name="sparkle" />
        AI draft — review before use
      </span>
      {children}
      {actions ? <div className="acts">{actions}</div> : null}
    </div>
  );
}

/* ═══════════════════════════════════════ the row ═══════════════════════════ */

export interface DraftCardProps {
  row: FollowupRow;
  /** Opens the tab's dismiss sheet. Required: a dead Dismiss… is worse than none. */
  onDismiss: (row: FollowupRow) => void;
  /** Opens the tab's return sheet, which owns the note and its toast. */
  onReturn: (row: FollowupRow) => void;
}

/**
 * The reading body — avatar, name, New mark, the message — shared by the AI card
 * and the coach card because it is the same information either way
 * (console-digest.js:621-625).
 *
 * `align-items:flex-start` is inline BECAUSE THE DEMO HAS IT INLINE: the avatar
 * must sit against the first line of a message that may run to three. Nothing
 * else is added — `.grow` already earns `flex:1; min-width:0` from `.row .grow`
 * here, and an inline `flex:1` on a `.grow` is the exact mistake that once threw
 * a digest row 410px sideways.
 */
function DraftBody({ row }: { row: FollowupRow }) {
  return (
    <div className="row" style={{ alignItems: 'flex-start' }}>
      <Avatar name={row.client.name} className="sm" />
      <span className="grow">
        <b>{row.client.name}</b>
        {row.fresh ? <Pill kind="info">New</Pill> : null}
        <br />
        {row.text}
      </span>
    </div>
  );
}

export function DraftCard({ row, onDismiss, onReturn }: DraftCardProps) {
  const toast = useToast();
  const canSend = useCan('sendDigest');
  const myId = useSession((s) => s.user?.id ?? null);

  /*
   * Editing is LOCAL to the card — the demo's single `editingId` (it re-rendered
   * the whole tab from one module variable), kept per row instead. Two coaches'
   * drafts can be open at once and neither closes the other, and no parent
   * re-render is needed to type a character.
   *
   * `text` is seeded when editing OPENS, not from an effect watching the row.
   * That is what makes Cancel able to restore the original: the row remains the
   * only source of truth and the draft text is a copy that lives exactly as long
   * as the textarea does.
   */
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(row.text);

  const edit = useEditFollowup();
  const send = useSendFollowup();
  const approve = useApproveFollowup();
  const resubmit = useResubmitFollowup();
  const remove = useDeleteFollowup();

  const busy =
    edit.isPending || send.isPending || approve.isPending || resubmit.isPending || remove.isPending;

  const fail = (err: Error) => toast(err.message);

  const openEdit = () => {
    setText(row.text);
    setEditing(true);
  };

  const cancelEdit = () => {
    setText(row.text);
    setEditing(false);
  };

  const save = () => {
    const next = text.trim();
    /*
     * An empty save is not a save, so it does nothing and STAYS in edit mode.
     *
     * The demo dropped the empty value, left edit mode and still said "Draft
     * updated. Your edit is part of the record." (console-digest.js:955-961) —
     * the one place it tells the reader something untrue. Holding the textarea
     * open puts the cursor back where the problem is.
     */
    if (!next) return;
    edit.mutate(
      { id: row.id, text: next },
      {
        onSuccess: () => {
          setEditing(false);
          toast('Draft updated. Your edit is part of the record.');
        },
        onError: fail,
      },
    );
  };

  /* ─────────────────────────────────────────── 5 · SENT
     Not an aidraft at all: it has been reviewed by a person and gone, so it
     drops the AI ground and the actions and keeps only the receipt
     (console-digest.js:598-604). */
  if (row.status === 'SENT') {
    /*
     * WHOSE NAME IS ON IT.
     *
     * For a coach draft the pill names the COACH — `createdBy` — because the
     * client received a message in that coach's voice and under their name; the
     * approver is the second line, which is where accountability for the send
     * belongs. `sentBy` on such a row is the approver who pushed the button, so
     * using it here would credit the wrong human on the visible line.
     *
     * An AI draft has no author, so `sentBy` is the whole answer.
     */
    const author = row.source === 'COACH' ? row.createdBy : null;
    const sender = author ?? row.sentBy;

    return (
      <div className="trow" style={{ opacity: 0.8 }}>
        <Pill kind="ok">Sent by {sender ? sender.name : 'Haalving'}</Pill>
        <span className="grow">
          <small>
            <b>{row.client.name}</b> · {row.text}
          </small>
          {author && row.approvedBy ? <small>approved by {row.approvedBy.name}</small> : null}
        </span>
      </div>
    );
  }

  /* ─────────────────────────────────────────── 4 · EDITING
     The demo's editing body and its two actions, verbatim
     (console-digest.js:611-618). It replaces the body of whichever chrome the
     row already wears, so a coach draft keeps its kicker while being edited —
     losing it mid-edit would make the card change identity under the cursor. */
  const body = editing ? (
    <>
      <div className="sub" style={{ marginBottom: 'var(--s2)' }}>
        To <b>{row.client.name}</b> — edit, then save:
      </div>
      <textarea
        className="input"
        /* the demo's own label (console-digest.js:614) — the textarea has no
           visible <label>, and "To Ananya — edit, then save" above it is prose,
           not a labelled control */
        aria-label="Edit draft message"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    </>
  ) : (
    <DraftBody row={row} />
  );

  const editActions = (
    <>
      <button type="button" className="btn sm" onClick={save} disabled={busy}>
        Save
      </button>
      <button type="button" className="btn sm ghost" onClick={cancelEdit} disabled={busy}>
        Cancel
      </button>
    </>
  );

  const editButton = (
    <button type="button" className="btn sm ghost" onClick={openEdit} disabled={busy}>
      Edit
    </button>
  );

  /* ─────────────────────────────────────────── 1 · AI DRAFT */
  if (row.source === 'AI') {
    return (
      <AiDraft
        actions={
          editing ? (
            editActions
          ) : (
            <>
              {editButton}
              <button
                type="button"
                className="btn sm"
                disabled={busy}
                onClick={() =>
                  send.mutate(row.id, {
                    onSuccess: () =>
                      /* "recorded as your edit" is the promise the whole tab
                         rests on: the copilot drafted it, a named human sent it,
                         and the record says which human */
                      toast(`${row.client.name}: follow-up sent, recorded as your edit.`),
                    onError: fail,
                  })
                }
              >
                Approve &amp; send
              </button>
              <button
                type="button"
                className="btn sm quiet"
                onClick={() => onDismiss(row)}
                disabled={busy}
              >
                Dismiss…
              </button>
            </>
          )
        }
      >
        {body}
      </AiDraft>
    );
  }

  /* ─── from here down the draft was written by a human ─────────────────── */

  const author = row.createdBy;
  const mine = !!author && author.id === myId;
  /* the kicker names the coach by FIRST name — it is a byline on their own
     board, where everyone knows the Priya they work beside. The toast that
     follows a send uses the full name, because that sentence is a record. */
  const authorName = author ? author.name : 'a coach';
  const authorFirstName = author ? (author.name.split(' ')[0] ?? author.name) : 'a coach';

  const deleteButton = (
    <button
      type="button"
      className="btn sm quiet"
      disabled={busy}
      onClick={() =>
        /* no toast: the row leaving the list IS the confirmation, and every
           sentence this tab speaks was written and reviewed — inventing one for
           a delete would put an unreviewed string in front of a client-facing
           workflow. Flagged for the copy owner. */
        remove.mutate(row.id, { onError: fail })
      }
    >
      Delete
    </button>
  );

  /* ─────────────────────────────────────────── 3 · RETURNED
     Sent back by an approver, and the server only ever routes it to its author —
     which is why the actions below are not re-gated on `mine`: a second guard
     here would disagree with the server's scoping the moment `createdBy` were
     ever null, and hide the only actions that can unstick the row. */
  if (row.status === 'RETURNED') {
    return (
      <div className="card">
        <div className="kicker">Returned</div>
        {body}

        {/*
          `warn`, not `bad`. The Notice kinds are warn (amber) and bad (danger);
          danger is for something that went wrong, and a returned draft did not —
          a colleague read it and asked for a change. Amber is "this is waiting
          on you", which is exactly what it is.

          It sits AFTER the message and before the actions, because that is the
          reading order the coach needs: here is what you wrote, here is what was
          said about it, here is what you can do next.
        */}
        {row.returnNote ? <Notice kind="warn">{row.returnNote}</Notice> : null}

        {/*
          `.row`, not `.acts`. `.acts` is styled only as `.aidraft .acts`
          (demo-classes.css:509) — outside that ground it is an unstyled div and
          the buttons would sit flush against one another. `.row` is the demo's
          own horizontal group and carries the gap; the inline margin is a
          margin, not a flex or a width, and the demo sets exactly this kind
          inline on a `.row` at console-digest.js:584.
        */}
        <div className="row" style={{ marginTop: 'var(--s3)' }}>
          {editing ? (
            editActions
          ) : (
            <>
              {editButton}
              <button
                type="button"
                className="btn sm"
                disabled={busy}
                onClick={() =>
                  resubmit.mutate(row.id, {
                    onSuccess: () =>
                      /* no toast was specified for resubmit. It puts the draft
                         back exactly where creating one does — PENDING_APPROVAL —
                         so it says the sentence that state already has, rather
                         than a new one nobody has reviewed. */
                      toast('Sent for approval.'),
                    onError: fail,
                  })
                }
              >
                Resubmit
              </button>
              {deleteButton}
            </>
          )}
        </div>
      </div>
    );
  }

  /* ─────────────────────────────────────────── 2 · COACH DRAFT, PENDING APPROVAL
     A plain `.card`. NOT an AiDraft — a person wrote this sentence, and the
     "AI draft — review before use" label would be a lie about its authorship in
     the one product surface whose entire promise is that you can tell.

     The kicker text is written in sentence case ON PURPOSE: `.kicker` already
     carries `text-transform:uppercase` (demo-classes.css:334), so uppercasing in
     JS as well would only make the string in the source shout — and would ship a
     coach's name pre-mangled to anything that reads the DOM as text. */

  /*
   * WHO IS LOOKING decides the actions, and a person can be both approver and
   * author. THE APPROVER SET WINS.
   *
   * The row exists to be approved — approving is the only action that finishes
   * it. If the author set won, a senior coach who drafted for a peer's client
   * would be unable to send their own message, and the row would wait for a
   * second approver who may not exist on that pod.
   *
   * One carve-out: Return… is dropped when the approver IS the author. Returning
   * a draft to yourself writes an audit entry for a round trip that did not
   * happen, and its own toast — "Returned to {coach} with your note." — would
   * name the person reading it.
   *
   * Anyone else gets NO actions. Not disabled buttons: a colleague looking at a
   * draft they cannot touch should see a draft, not four things they are not
   * allowed to do.
   */
  const actions = editing ? (
    editActions
  ) : canSend ? (
    <>
      {editButton}
      <button
        type="button"
        className="btn sm"
        disabled={busy}
        onClick={() =>
          approve.mutate(row.id, {
            onSuccess: () =>
              /* "on behalf of" is the point: the client hears from their coach,
                 and the record knows who released it */
              toast(`${row.client.name}: follow-up sent on behalf of ${authorName}.`),
            onError: fail,
          })
        }
      >
        Approve &amp; send
      </button>
      {mine ? null : (
        <button
          type="button"
          className="btn sm quiet"
          onClick={() => onReturn(row)}
          disabled={busy}
        >
          Return…
        </button>
      )}
    </>
  ) : mine ? (
    <>
      {editButton}
      {deleteButton}
    </>
  ) : null;

  return (
    <div className="card">
      <div className="kicker">From {authorFirstName} · Waiting for approval</div>
      {body}
      {actions ? (
        <div className="row" style={{ marginTop: 'var(--s3)' }}>
          {actions}
        </div>
      ) : null}
    </div>
  );
}
