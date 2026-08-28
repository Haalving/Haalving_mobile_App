'use client';

import { useEffect, useState } from 'react';

import { Num, Sheet, useToast } from '@/components/ui';
import { useSendAllFollowups, type FollowupRow } from '@/features/home/followups/queries';

/**
 * Review before sending — `openSendAll` (console-digest.js:690-728).
 *
 * THE SHEET IS THE PROMISE. The tab's headline says the copilot drafts and a
 * named human sends, and the bulk path is where that is easiest to quietly
 * break: a button called "send all" that never shows what it sends is the same
 * product with the promise taken out. So every message is shown in full and any
 * one of them can be held back — the demo's own note above `openSendAll`, and
 * the reason this is a review rather than a confirm.
 *
 * `rows` are the sendable drafts, already chosen and ordered by the tab. They
 * are rendered IN THE ORDER GIVEN: the server groups and sorts them, and a
 * second sort here could disagree with the count on the button that opened the
 * sheet.
 */

/**
 * Nothing held back.
 *
 * One shared reference, so resetting an already-clean sheet hands React the
 * state it already has and it skips the re-render.
 */
const NONE_HELD: ReadonlySet<string> = new Set();

export function SendAllSheet({
  rows,
  open,
  onClose,
}: {
  /** The sendable drafts, in the order the tab lists them. */
  rows: FollowupRow[];
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const sendAll = useSendAllFollowups();

  /*
   * HELD BACK, not selected — the inverse of the obvious state, deliberately.
   *
   * Every box in the demo opens `checked` and the reviewer unticks the ones they
   * want to keep as drafts. Storing the UNTICKED ids keeps that true for rows
   * this render has never seen, so a draft that lands while the sheet is open
   * arrives ticked like the rest instead of being silently withheld.
   */
  const [held, setHeld] = useState<ReadonlySet<string>>(NONE_HELD);

  /*
   * A fresh review every time the sheet opens.
   *
   * Keyed on `open` in BOTH directions so the reset lands on the way OUT, before
   * the next open paints. Resetting only on the way in would show one frame of
   * the previous review's unticked boxes.
   */
  useEffect(() => {
    setHeld(NONE_HELD);
  }, [open]);

  const picked = rows.filter((row) => !held.has(row.id));

  const toggle = (id: string) => {
    setHeld((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const send = () => {
    const ids = picked.map((row) => row.id);
    /* the button is disabled at zero — this guards the keyboard and the
       double-click that arrives while the first send is still in flight */
    if (ids.length === 0 || sendAll.isPending) return;

    sendAll.mutate(
      { ids },
      {
        onSuccess: () => {
          /* the count the reviewer ticked, worded as the demo words it
             (console-digest.js:726) — one follow-up drops the plural */
          toast(`${ids.length} follow-up${ids.length === 1 ? '' : 's'} sent after your review.`);
          onClose();
        },
        onError: (err: Error) => toast(err.message),
      },
    );
  };

  return (
    /* nothing to review is nothing to open: the demo returns before it builds
       the sheet at all (console-digest.js:693) */
    <Sheet open={open && rows.length > 0} onClose={onClose} label="Review before sending">
      <div className="h1">Review before sending</div>
      <p className="sub">
        Each message goes to that client’s Care Circle under your name. Untick any you want to hold
        back as drafts.
      </p>

      <div className="list">
        {rows.map((row) => {
          /*
           * Whose name it goes out under.
           *
           * The one thing here the demo does not have, because the demo had no
           * coach drafts. A COACH draft sends under its author, and the reviewer
           * is putting their signature on that — so the name belongs on the row
           * where the decision is made, not one screen back. It stays inside the
           * same `<small>` the message uses; a second element would give the
           * batch a texture the single-draft card does not have.
           */
          const author = row.source === 'COACH' ? row.createdBy : null;

          return (
            <label
              key={row.id}
              className="trow"
              style={{ alignItems: 'flex-start', cursor: 'pointer' }}
            >
              <input type="checkbox" checked={!held.has(row.id)} onChange={() => toggle(row.id)} />
              {/* no inline flex on `.grow`: `flex:1` is scoped to `.row .grow`
                  (app.css:494) and a `.trow` is not one, so the column sizes to
                  its content exactly as the demo's does */}
              <span className="grow">
                <b>{row.client.name}</b>
                <small>
                  {row.text}
                  {author ? ` · from ${author.name}` : null}
                </small>
              </span>
            </label>
          );
        })}
      </div>

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn sm ghost" onClick={onClose}>
          Keep as drafts
        </button>
        {/* the count RECOUNTS as boxes are ticked and the button goes dead at
            zero — the demo's `recount` (console-digest.js:715-720), which is
            what stops "Send 3 reviewed" sending nothing */}
        <button
          type="button"
          className="btn sm"
          onClick={send}
          disabled={picked.length === 0 || sendAll.isPending}
        >
          Send <Num>{picked.length}</Num> reviewed
        </button>
      </div>
    </Sheet>
  );
}
