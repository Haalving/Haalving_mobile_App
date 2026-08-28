'use client';

import { useEffect, useState } from 'react';

import { Notice, Sheet, useToast } from '@/components/ui';
import { useReturnFollowup, type FollowupRow } from '@/features/home/followups/queries';

/**
 * Send a coach's draft back to them, with a note.
 *
 * NEW — the digest has no return sheet of its own, so this one is assembled out
 * of the two the demo already wrote, and copies both where they overlap:
 *
 *  - the SHAPE is the dismiss sheet's (console-digest.js:646-685) — an `.h1`, a
 *    `.sub` that says where the decision lands, and a `.row` footer pinned right
 *    with the quiet way out first and the committing button last.
 *  - the BEHAVIOUR is the approvals return sheet's (console-approvals.js:133-155)
 *    — a `.input` textarea carrying its own `aria-label`, and a confirm that
 *    stays disabled until the note has something in it. That sheet states the
 *    rule in its subtitle — "a return never travels empty-handed" — and then
 *    enforces it rather than asking (console-approvals.js:142).
 *
 * A RETURN IS NOT A REJECTION. The draft goes back to its author as RETURNED,
 * still theirs to edit and resubmit, and nothing reaches the client. Both halves
 * are in the `.sub` because a reviewer hovering over this button is asking
 * exactly those two questions.
 */

/**
 * Long enough for "the second paragraph reads as a diagnosis — soften it", short
 * enough that the note stays a steer and does not quietly become the rewrite.
 * The demo caps its free-text boxes the same way (client-tribe.js:744).
 */
const NOTE_MAX = 300;

export function ReturnSheet({
  row,
  open,
  onClose,
}: {
  /** The draft going back; null while the caller has nothing targeted. */
  row: FollowupRow | null;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const send = useReturnFollowup();

  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  /*
   * A reopened sheet starts empty.
   *
   * The note belongs to ONE decision about ONE draft. Carrying the last one over
   * lands the next reviewer on a pre-filled box, and a line they did not write
   * would travel back under their name — a failure with no symptom, which is
   * what makes it worth an effect. `row?.id` is in the deps for the same reason:
   * swapping the draft without closing the sheet is still a new decision.
   */
  useEffect(() => {
    if (!open) return;
    setNote('');
    setError(null);
  }, [open, row?.id]);

  /*
   * `createdBy` is the coach whose draft this is, and so the person it goes back
   * to. It is nullable on the wire — an AI draft has no author — and a toast is
   * the wrong place to discover that, so it degrades to the role rather than
   * printing a gap where a name should be.
   */
  const coach = row?.createdBy?.name ?? 'the coach';

  const written = note.trim();

  const confirm = () => {
    /* the button is disabled without a row and a note, so this only catches a
       keypress that raced the state — the same guard the demo's own return
       sheet keeps at console-approvals.js:147 */
    if (!row || !written) return;
    setError(null);

    send.mutate(
      { id: row.id, note: written },
      {
        onSuccess: () => {
          toast(`Returned to ${coach} with your note.`);
          onClose();
        },
        /* stay open and say what happened. Closing on a failed write would claim
           a handover that never happened, and the coach would be waiting on a
           draft nobody told them about. The note is still in the box. */
        onError: (err: Error) => setError(err.message),
      },
    );
  };

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="h1">Return this draft?</div>
      <p className="sub">
        The coach will see your note and can edit and resubmit. Nothing goes to the client.
      </p>

      {error ? <Notice kind="bad">{error}</Notice> : null}

      {/* `aria-label` on the control itself, not a visible label above it — the
          demo labels its sheet textareas this way (console-approvals.js:137) and
          the `.h1` already carries the question for a sighted reader. */}
      <textarea
        className="input"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={NOTE_MAX}
        rows={3}
        placeholder="Note (required)"
        aria-label="Note for the coach"
      />

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn sm ghost" onClick={onClose}>
          Keep pending
        </button>
        <button
          type="button"
          className="btn sm"
          disabled={!written || send.isPending}
          onClick={confirm}
        >
          Return with note
        </button>
      </div>
    </Sheet>
  );
}
