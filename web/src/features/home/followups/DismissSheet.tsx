'use client';

import { useEffect, useState } from 'react';

import { Chip, Notice, Sheet, useToast } from '@/components/ui';
import {
  DISMISS_REASONS,
  useDismissFollowup,
  type DismissReason,
  type FollowupRow,
} from '@/features/home/followups/queries';

/**
 * The dismiss sheet — `openDismiss` (console-digest.js:646-685), ported.
 *
 * A DISMISSAL IS A RECORD, NOT A DELETE, and the sheet says so in its own
 * subtitle: "every dismissal is logged so the copilot learns". The demo keeps
 * that promise literally — it pushes onto `dismissLog` with the reason and the
 * caller's id BEFORE it drops the draft (console-digest.js:672-677), under a
 * comment that names the sentence it is honouring.
 *
 * That is the whole reason the reason is compulsory, and the whole reason
 * "Dismiss & log" stays disabled until a chip is chosen: a dismissal with no
 * reason teaches the copilot nothing and leaves the subtitle lying.
 *
 * Nothing here reaches the client — the draft was never sent.
 */
export function DismissSheet({
  row,
  open,
  onClose,
}: {
  /** The draft being dismissed; null while the caller has nothing targeted. */
  row: FollowupRow | null;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const dismiss = useDismissFollowup();

  const [chosen, setChosen] = useState<DismissReason | null>(null);
  const [error, setError] = useState<string | null>(null);

  /*
   * Reset on every open, and on a change of draft.
   *
   * The demo gets this for free: `openDismiss` rebuilds the whole sheet and
   * declares `chosen = null` inside the wiring callback (console-digest.js:660),
   * so a reason cannot outlive a close. This component stays mounted between
   * opens, so the reset has to be said out loud — without it the second
   * dismissal opens with the previous draft's reason already lit and the confirm
   * button already armed, one click away from logging a reason nobody chose for
   * THIS draft. A logged-but-unmeant reason is worse than no log at all: it is
   * training data the copilot will believe.
   *
   * `rowId` is in the deps for the same reason — a different draft is a
   * different decision, even if the sheet never closed in between.
   */
  const rowId = row?.id ?? null;
  useEffect(() => {
    setChosen(null);
    setError(null);
  }, [open, rowId]);

  if (!row) return null;

  const confirm = () => {
    /* the demo's own guard (console-digest.js:670). The button is disabled, but
       a keyboard Enter can still arrive from a chip a frame before React has
       re-rendered the footer, and this decision is logged. */
    if (!chosen) return;
    setError(null);
    dismiss.mutate(
      { id: row.id, reason: chosen },
      {
        onSuccess: () => {
          toast('Dismissed · reason logged');
          onClose();
        },
        /* stay open and say what happened. Closing on a failed write would
           claim a log entry that does not exist — and the draft would still be
           sitting in the list on the next refetch with no explanation. */
        onError: (err: Error) => setError(err.message),
      },
    );
  };

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="h1">Dismiss this draft?</div>
      <p className="sub">
        Choose a reason — every dismissal is logged so the copilot learns. Nothing goes to the
        client.
      </p>

      {error ? <Notice kind="bad">{error}</Notice> : null}

      {/* a bare div, exactly as the demo has it (console-digest.js:651): `.chip`
          carries its own top and right margin (app.css:710) so the five wrap on
          their own. A flex wrapper here would double the gaps. */}
      <div>
        {DISMISS_REASONS.map((reason) => (
          <Chip
            key={reason.code}
            selected={chosen === reason.code}
            onClick={() => setChosen(reason.code)}
          >
            {reason.label}
          </Chip>
        ))}
      </div>

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn sm ghost" onClick={onClose}>
          Keep draft
        </button>
        <button
          type="button"
          className="btn sm"
          disabled={!chosen || dismiss.isPending}
          onClick={confirm}
        >
          Dismiss & log
        </button>
      </div>
    </Sheet>
  );
}
