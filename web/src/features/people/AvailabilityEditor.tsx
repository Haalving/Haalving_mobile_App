'use client';

import { useMemo, useState } from 'react';
import { WD, availWindows, fmtTime, type Weekday } from '@haalving/shared';

import { Icon } from '@/components/icons/Icon';
import type { Availability } from '@/features/people/queries';

/**
 * Declared working hours.
 *
 * A WEEKDAY HOLDS ONE RANGE OR SEVERAL, and the second shape is not an edge
 * case: a personal trainer with six one-on-ones works early mornings and
 * evenings with the middle of the day empty, and five and a half hours of
 * sessions fit in no single window. The editor therefore lets a day carry more
 * than one window, and the conflict engine requires ONE window to hold a whole
 * session — a session straddling the gap is two half-sessions with the coach's
 * lunch in the middle, not a booking.
 *
 * Reading is always through `availWindows`, never by indexing [0]/[1]: every
 * helper that took the shortcut returned *nothing* for a split shift, silently.
 */

const DAY_LABEL: Record<Weekday, string> = {
  sun: 'Sunday',
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
};

/* the week as people say it, not as Date#getDay() numbers it */
const WEEK: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

type Window = [string, string];

function toWindows(avail: Availability, day: Weekday): Window[] {
  const raw = avail[day];
  if (!raw || !Array.isArray(raw) || raw.length === 0) return [];
  return (Array.isArray(raw[0]) ? (raw as Window[]) : [raw as Window]).map((w) => [w[0], w[1]]);
}

/** One window collapses back to a bare pair — the shape most records carry. */
function fromWindows(windows: Window[]): Availability[string] {
  if (!windows.length) return null;
  if (windows.length === 1) return windows[0]!;
  return windows;
}

export function AvailabilityEditor({
  value,
  onChange,
  readOnly,
}: {
  value: Availability;
  onChange?: (next: Availability) => void;
  readOnly?: boolean;
}) {
  const [avail, setAvail] = useState<Availability>(value);

  const apply = (next: Availability) => {
    setAvail(next);
    onChange?.(next);
  };

  const setDay = (day: Weekday, windows: Window[]) => {
    apply({ ...avail, [day]: fromWindows(windows) });
  };

  /* the summary line reads through the same helper the engine uses, so what the
     screen says and what a booking is refused against cannot disagree */
  const summary = useMemo(() => {
    const user = { id: 'preview', name: 'preview', avail };
    return Object.fromEntries(
      WD.map((d) => [
        d,
        availWindows(user, d)
          .map(([a, b]) => `${fmtTime(a)}–${fmtTime(b)}`)
          .join(' and '),
      ]),
    ) as Record<Weekday, string>;
  }, [avail]);

  return (
    <div className="list">
      {WEEK.map((day) => {
        const windows = toWindows(avail, day);
        const off = windows.length === 0;

        return (
          <div key={day} className="trow" style={{ alignItems: 'flex-start' }}>
            <span className="grow" style={{ flex: 1, minWidth: 0 }}>
              <b>{DAY_LABEL[day]}</b>
              <small>{off ? 'Off' : summary[day]}</small>

              {!readOnly ? (
                <span style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)', marginTop: 'var(--s2)' }}>
                  {windows.map((w, i) => (
                    <span key={i} style={{ display: 'flex', gap: 'var(--s2)', alignItems: 'center' }}>
                      <input
                        className="input"
                        type="time"
                        value={w[0]}
                        aria-label={`${DAY_LABEL[day]} window ${i + 1} start`}
                        style={{ width: 130 }}
                        onChange={(e) => {
                          const next = windows.slice();
                          next[i] = [e.target.value, w[1]];
                          setDay(day, next);
                        }}
                      />
                      <span className="sub">to</span>
                      <input
                        className="input"
                        type="time"
                        value={w[1]}
                        aria-label={`${DAY_LABEL[day]} window ${i + 1} end`}
                        style={{ width: 130 }}
                        onChange={(e) => {
                          const next = windows.slice();
                          next[i] = [w[0], e.target.value];
                          setDay(day, next);
                        }}
                      />
                      <button
                        type="button"
                        className="btn sm quiet"
                        aria-label={`Remove ${DAY_LABEL[day]} window ${i + 1}`}
                        onClick={() => setDay(day, windows.filter((_, j) => j !== i))}
                      >
                        <Icon name="minus" style={{ width: 16, height: 16 }} />
                      </button>
                    </span>
                  ))}

                  <span>
                    <button
                      type="button"
                      className="btn sm ghost"
                      onClick={() =>
                        setDay(day, [...windows, windows.length ? ['17:00', '21:00'] : ['09:00', '17:00']])
                      }
                    >
                      <Icon name="plus" style={{ width: 14, height: 14 }} />
                      {windows.length ? ' Add a second window' : ' Add hours'}
                    </button>
                  </span>
                </span>
              ) : null}
            </span>
          </div>
        );
      })}

      <div className="audit">
        A session has to fit inside ONE window. A split shift is two windows, not one long day —
        nothing may be booked across the gap.
      </div>
    </div>
  );
}
