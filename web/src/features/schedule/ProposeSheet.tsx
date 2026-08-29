'use client';

import { useState } from 'react';
import { fmtShortTime } from '@haalving/shared';

import { Sheet } from '@/components/ui';
import { TIME_CHOICES, dayChoices, dayLabel } from '@/features/schedule/days';
import type { Occurrence } from '@/features/schedule/queries';

/**
 * The participant's counter-offer — ported from `openPropose`
 * (console-schedule.js:1064-1095).
 *
 * A day and a start, and nothing else: the LENGTH is the task's, because this is
 * a request to move the same appointment rather than to renegotiate it. Whoever
 * can apply it does so through the ordinary move path, so a proposal cannot land
 * anywhere a drag would have been refused.
 */
export function ProposeSheet({
  occ,
  today,
  onClose,
  onSend,
}: {
  occ: Occurrence;
  today: string;
  onClose: () => void;
  onSend: (date: string, startMin: number) => void;
}) {
  const [date, setDate] = useState(occ.date);
  const [startMin, setStartMin] = useState(occ.startMin);

  return (
    <Sheet open onClose={onClose} label="Propose a new time">
      <div className="h1">Propose a new time</div>
      <p className="sub" style={{ margin: 0 }}>
        &ldquo;{occ.title}&rdquo; — your proposal goes to the task’s owner, who can apply it.
      </p>

      <div className="grid2">
        <span>
          <label className="field-label" htmlFor="pp-day">
            Day
          </label>
          <select
            className="input"
            id="pp-day"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          >
            {dayChoices(today).map((d) => (
              <option key={d} value={d}>
                {dayLabel(d, today)}
              </option>
            ))}
          </select>
        </span>
        <span>
          <label className="field-label" htmlFor="pp-start">
            Starts
          </label>
          <select
            className="input"
            id="pp-start"
            value={startMin}
            onChange={(e) => setStartMin(Number(e.target.value))}
          >
            {TIME_CHOICES.map((m) => (
              <option key={m} value={m}>
                {fmtShortTime(m)}
              </option>
            ))}
          </select>
        </span>
      </div>

      <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button type="button" className="btn sm ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn sm" onClick={() => onSend(date, startMin)}>
          Send proposal
        </button>
      </div>
    </Sheet>
  );
}
