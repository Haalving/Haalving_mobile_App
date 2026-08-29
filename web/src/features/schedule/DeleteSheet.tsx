'use client';

import { dayName } from '@haalving/shared';

import { Sheet } from '@/components/ui';
import type { Occurrence } from '@/features/schedule/queries';

/**
 * Deleting a repeating task — ported from `openDelete` (console-schedule.js:1097-1126).
 *
 * ONLY A SERIES IS ASKED ABOUT. A one-off task has no second reading of "delete",
 * so the demo removes it without a dialog and this does too — the sheet only
 * opens for a task where the answer genuinely changes what happens, which is
 * `occ.recurring`. That decision is the caller's; by the time this renders the
 * question is already worth asking.
 */
export function DeleteSheet({
  occ,
  onClose,
  onChoose,
}: {
  occ: Occurrence;
  onClose: () => void;
  onChoose: (scope: 'occurrence' | 'series') => void;
}) {
  return (
    <Sheet open onClose={onClose} label="Delete a repeating task">
      <div className="h1">Delete a repeating task</div>
      <p className="sub" style={{ margin: 0 }}>
        &ldquo;{occ.title}&rdquo; repeats. What should go?
      </p>
      <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button type="button" className="btn sm ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn sm ghost" onClick={() => onChoose('occurrence')}>
          Only {dayName(occ.date)}
        </button>
        <button type="button" className="btn sm" onClick={() => onChoose('series')}>
          Whole series
        </button>
      </div>
    </Sheet>
  );
}
