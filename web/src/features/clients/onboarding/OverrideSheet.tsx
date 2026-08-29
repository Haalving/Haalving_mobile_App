'use client';

import { useState } from 'react';
import { ROLES } from '@haalving/shared';

import { Notice, Num, Sheet, useToast } from '@/components/ui';
import type { BenchSeat } from '@/features/clients/onboarding/queries';

/**
 * The capacity override — ported from `overrideSheet` (console-pipeline.js:967-998).
 *
 * TWO THINGS THE PORT MOVES, both because the demo could take a shortcut a server
 * cannot:
 *
 *  1. The demo raises the ceiling on the spot and calls it done. Here the
 *     override RIDES WITH THE ALLOCATION it is for — it is sent as part of
 *     `/allocate`, and the server raises the ceiling only when it has actually
 *     let a seat through. An override recorded for an allocation that then
 *     failed would be a reason in the log with nothing beside it.
 *
 *  2. The demo refuses a non-Ops-Head here and toasts "This attempt was logged".
 *     Nothing on a browser can keep that promise, so the attempt is sent and the
 *     server answers with the same sentence — which is true when it says it.
 */

export function OverrideSheet({
  staff,
  pending,
  busy,
  onClose,
  onConfirm,
}: {
  staff: BenchSeat | null;
  /** How many seats are waiting to be sent. The override has nothing to ride on at zero. */
  pending: number;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const toast = useToast();

  if (!staff) return null;

  const title = ROLES[staff.role as keyof typeof ROLES]?.title ?? staff.role;

  const go = () => {
    /* the schema's floor is three characters; the sentence is the demo's, and it
       is the truth about where the words end up */
    if (reason.trim().length < 3) {
      toast('A reason is required. It goes to the audit log.');
      return;
    }
    onConfirm(reason.trim());
    setReason('');
  };

  return (
    <Sheet open onClose={onClose} label={`Capacity override for ${staff.name}`}>
      <div className="h1">Capacity override — {staff.name}</div>
      <p className="sub">
        {title} is at{' '}
        <Num>
          {staff.load}/{staff.cap}
        </Num>
        . Every override is logged with your name and a reason.
      </p>

      {pending ? null : (
        <Notice kind="warn">
          Choose the seat this person is taking first. The override is recorded with the allocation
          it lets through, never on its own.
        </Notice>
      )}

      <textarea
        className="input"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (required — goes to the audit log)"
        aria-label="Reason for the override"
      />

      <button
        type="button"
        className="btn block"
        style={{ marginTop: 'var(--s3)' }}
        disabled={!pending || busy}
        onClick={go}
      >
        Raise cap by <Num>5</Num> and seat them — reason logged
      </button>
    </Sheet>
  );
}
