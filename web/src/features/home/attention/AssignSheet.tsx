'use client';

import { useEffect, useState } from 'react';

import { Audit, Notice, Sheet, useToast } from '@/components/ui';
import { useStaff } from '@/features/community/queries';
import { useSession } from '@/store/session.store';
import { useTicketAction, type AttentionTicket } from '@/features/home/attention/queries';

/**
 * HANDING A TICKET OVER.
 *
 * ONLY DRAWN FOR A SEAT THAT MAY NAME SOMEBODY ELSE. Putting work on another
 * person's list is gated on `seeAllClients` in `attention.service.assertAssignable`
 * — the same rule the work queue's Add-task sheet follows, and for the same
 * reason: you should not be able to fill a list you cannot read. A coach never
 * opens this sheet; their row carries Take it and Hand back instead, which are
 * the two acts that need nothing.
 *
 * HANDING IT BACK TO THE POD IS AN OPTION HERE, NOT A SEPARATE BUTTON. It is the
 * same act with nobody named — `assignedToId: null` — and the API distinguishes
 * that from leaving the field out, which is why the empty option sends null
 * rather than nothing.
 */
export function AssignSheet({
  ticket,
  open,
  onClose,
}: {
  ticket: AttentionTicket | null;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const act = useTicketAction();
  const meId = useSession((s) => s.user?.id ?? null);
  const meName = useSession((s) => s.user?.name ?? 'me');
  /* asked only while the sheet is up — the staff list is a whole-building read
     and the board behind this has no use for it */
  const { data: staff } = useStaff(open);

  const [pick, setPick] = useState('');
  const [error, setError] = useState<string | null>(null);

  /* a different ticket is a different decision, even if the sheet never closed */
  const ticketId = ticket?.id ?? null;
  useEffect(() => {
    setPick(ticket?.assignedToId ?? '');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ticketId]);

  if (!ticket) return null;

  const confirm = () => {
    setError(null);
    act.mutate(
      { id: ticket.id, action: 'assign', assignedToId: pick || null },
      {
        onSuccess: () => {
          toast(pick ? 'Handed over.' : 'Handed back to the pod.');
          onClose();
        },
        onError: (e: Error) => setError(e.message),
      },
    );
  };

  return (
    <Sheet open={open} onClose={onClose} label="Assign this item">
      <div className="h1">Who is taking this on?</div>
      <p className="sub">
        The person you name has to be able to open {ticket.client.name}&rsquo;s record — the API
        refuses a hand-over nobody can work.
      </p>

      {error ? <Notice kind="bad">{error}</Notice> : null}

      <Notice>
        <b>{ticket.title}</b>
        <div className="sub">
          {ticket.client.name} · {ticket.description}
        </div>
      </Notice>

      <label className="field-label" htmlFor="at-assignee">
        Whose list
      </label>
      <select
        className="input"
        id="at-assignee"
        value={pick}
        onChange={(e) => setPick(e.target.value)}
      >
        <option value="">Nobody — hand it back to the pod</option>
        {meId ? <option value={meId}>{meName} (you)</option> : null}
        {(staff ?? [])
          .filter((u) => u.id !== meId)
          .map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} · {u.roleTitle}
            </option>
          ))}
      </select>

      <Audit>
        A hand-over is written to the record and to the audit trail — the Logs tab says who gave it
        to whom.
      </Audit>

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn sm ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn sm" disabled={act.isPending} onClick={confirm}>
          {pick ? 'Assign' : 'Hand back'}
        </button>
      </div>
    </Sheet>
  );
}
