'use client';

import { FLOW } from '@haalving/shared';

import { Avatar, Num, Pill } from '@/components/ui';
import type { ArrivalRow as Row } from '@/features/clients/onboarding/queries';

/**
 * One arrival on the rail — ported from `railRows` (console-pipeline.js:439-472).
 *
 * DELIBERATELY THE SAME ROW GRAMMAR AS A CLIENT ROW (`.trow.click.cwrow`,
 * avatar, name, second line, trailing mark) so switching tabs does not switch
 * languages. The trailing mark is where they are in the flow, not an unread
 * count, and the second line carries a hairline progress bar because "step 7 of
 * 12" is a number you feel faster than you read.
 */

export function ArrivalRow({ row, open, onOpen }: { row: Row; open: boolean; onOpen: () => void }) {
  /* progress across the WHOLE flow: whole steps passed, plus this step's own
     ticks as a fraction of it */
  const pct = Math.round(
    ((row.stepIndex + (row.taskCount ? row.ticked / row.taskCount : 0)) / FLOW.length) * 100,
  );

  /* The rail row carries counts, not ticks, so `readyToFinish` cannot be called
     on it. These are its three clauses spelled against the fields the row does
     carry — last step, that step whole, nothing open behind it — and the record
     itself still answers the question from the shared helper. */
  const ready = row.stepIndex === FLOW.length - 1 && row.ticked === row.taskCount && !row.openItem;

  return (
    <div
      className={`trow click cwrow${open ? ' on' : ''}`}
      role="button"
      tabIndex={0}
      aria-current={open ? true : undefined}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <Avatar name={row.name} />

      {/* no `flex: 1` here: `.grow` earns it from `.row .grow` (app.css:494) and
          a `.trow` is not a `.row`. The demo's own rail is the same, so the
          progress bar is as wide as the line above it rather than the card. */}
      <span className="grow">
        <b>{row.name}</b>
        <small>
          Step <Num>{row.stepIndex + 1}</Num> of <Num>{FLOW.length}</Num> · {row.stepLabel} ·{' '}
          <Num>{row.ticked}</Num>/<Num>{row.taskCount}</Num> done
        </small>
        {/* the demo's own inline width — the bar IS the number, and a percentage
            is the one thing a stylesheet cannot know (console-pipeline.js:456) */}
        <span className="ob-bar" aria-hidden="true">
          <i style={{ width: `${pct}%` }} />
        </span>
      </span>

      {/* a hole left by an edit has to be visible from the LIST, not only from
          inside the record — otherwise "step 9 of 12, 4/4 done" reads perfect
          while step 3 sits open, which is the plausible-and-invisible kind of
          wrong this whole screen exists to prevent */}
      {ready ? <Pill kind="ok">Ready</Pill> : row.openItem ? <Pill kind="bad">Open item</Pill> : null}
    </div>
  );
}
