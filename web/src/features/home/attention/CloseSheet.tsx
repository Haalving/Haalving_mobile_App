'use client';

import { useEffect, useState } from 'react';

import { Notice, Sheet, useToast } from '@/components/ui';
import { useTicketAction, type AttentionTicket } from '@/features/home/attention/queries';

/**
 * CLOSING A TICKET — the sheet that collects the reason.
 *
 * A CLOSE IS OWED AN EXPLANATION, and this sheet exists so the console asks for
 * one BEFORE the request rather than surfacing the API's 400 afterwards. The
 * server demands it too (`attention.service.act`) — this is a courtesy to the
 * person typing, not the control.
 *
 * RESOLVE AND DISMISS ARE NOT THE SAME CLOSE. Dealt with, versus never a
 * problem, and the difference is exactly what the next recurrence is read
 * against — so the two wear different words all the way down, and the reason
 * field asks a different question in each.
 */

const COPY = {
  resolve: {
    heading: 'Resolve this item?',
    sub: 'Say how it was resolved — a close nobody had to explain is a close nobody can audit.',
    label: 'How it was resolved',
    placeholder: 'e.g. Called Meena — she logged both meals while we spoke.',
    confirm: 'Resolve & log',
    said: 'Resolved · reason logged',
  },
  dismiss: {
    heading: 'Dismiss this item?',
    sub: 'Say why this is not a problem — a recurrence is read against the difference between the two closes.',
    label: 'Why this is not a problem',
    placeholder: 'e.g. On approved leave all week — the gap is expected.',
    confirm: 'Dismiss & log',
    said: 'Dismissed · reason logged',
  },
} as const;

/** The API's floor, restated so the button can go live at the same moment. */
const MIN_REASON = 4;

export function CloseSheet({
  ticket,
  mode,
  open,
  onClose,
}: {
  /** The ticket being closed; null while the board has nothing targeted. */
  ticket: AttentionTicket | null;
  mode: 'resolve' | 'dismiss';
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const act = useTicketAction();

  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  /*
   * Reset on every open, and on a change of ticket.
   *
   * This component stays mounted between opens, so without this the second close
   * arrives with the previous ticket's reason already typed and the confirm
   * button already armed — a resolution nobody wrote for THIS ticket, filed in
   * the record and the audit trail under the closer's name. The same trap
   * `DismissSheet` names, and it costs the same three lines to avoid.
   */
  const ticketId = ticket?.id ?? null;
  useEffect(() => {
    setReason('');
    setError(null);
  }, [open, ticketId, mode]);

  if (!ticket) return null;

  const copy = COPY[mode];
  const trimmed = reason.trim();

  const confirm = () => {
    /* the button is disabled, but Enter can arrive from the textarea a frame
       before React has re-rendered the footer, and this is a logged act */
    if (trimmed.length < MIN_REASON) return;
    setError(null);
    act.mutate(
      { id: ticket.id, action: mode, resolutionReason: trimmed },
      {
        onSuccess: () => {
          toast(copy.said);
          onClose();
        },
        /* stay open and say what happened. Closing on a failed write would
           claim a resolution the record does not hold — and the ticket would
           still be on the board on the next refetch with no explanation. */
        onError: (e: Error) => setError(e.message),
      },
    );
  };

  return (
    <Sheet open={open} onClose={onClose} label={copy.heading}>
      <div className="h1">{copy.heading}</div>
      <p className="sub">{copy.sub}</p>

      {error ? <Notice kind="bad">{error}</Notice> : null}

      {/* what is being closed, restated — the board scrolled away behind the
          overlay and a reason typed against the wrong ticket is unrecoverable */}
      <Notice>
        <b>{ticket.title}</b>
        <div className="sub">
          {ticket.client.name} · {ticket.description}
        </div>
      </Notice>

      <label className="field-label" htmlFor="at-reason">
        {copy.label}
      </label>
      <textarea
        className="input"
        id="at-reason"
        rows={3}
        value={reason}
        placeholder={copy.placeholder}
        onChange={(e) => setReason(e.target.value)}
      />

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn sm ghost" onClick={onClose}>
          Keep it open
        </button>
        <button
          type="button"
          className="btn sm"
          disabled={trimmed.length < MIN_REASON || act.isPending}
          onClick={confirm}
        >
          {copy.confirm}
        </button>
      </div>
    </Sheet>
  );
}
