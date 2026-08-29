'use client';

import { Sheet } from '@/components/ui';

/**
 * "Only this occurrence, or the whole series?" — ported from `askScope`
 * (console-schedule.js:1560-1580).
 *
 * IT IS ASKED BEFORE THE WRITE, not after it. A drag that guessed and offered an
 * undo would already have moved eleven other Tuesdays by the time the reader
 * noticed. The drag preview is cleared before this opens, so dismissing it with
 * Escape leaves the grid exactly as it was.
 *
 * The demo names the rhythm here ("repeats on alternate days"). The occurrence
 * the grid draws carries only `recurring`, so this says the plainer true thing
 * rather than inventing a frequency the payload does not hold.
 */
export function ScopeSheet({
  title,
  onClose,
  onChoose,
}: {
  title: string;
  onClose: () => void;
  onChoose: (scope: 'occurrence' | 'series') => void;
}) {
  return (
    <Sheet open onClose={onClose} label="Change a repeating task">
      <div className="h1">Change a repeating task</div>
      <p className="sub" style={{ margin: 0 }}>
        &ldquo;{title}&rdquo; repeats. Apply this change to…
      </p>
      <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button type="button" className="btn sm ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn sm ghost" onClick={() => onChoose('occurrence')}>
          Only this occurrence
        </button>
        <button type="button" className="btn sm" onClick={() => onChoose('series')}>
          Whole series
        </button>
      </div>
    </Sheet>
  );
}
