'use client';

import { useEffect, useState } from 'react';

import { Icon } from '@/components/icons/Icon';
import { Pill, useToast } from '@/components/ui';
import { useMyAvailability, useSaveAvailability } from '@/features/leave/queries';

/**
 * My availability — the paint-your-week editor.
 *
 * Ported from `availHtml` / `wireAvail` (console-leave.js:269-377).
 *
 * A DAY HOLDS ONE RANGE OR SEVERAL. The split shift is not a curiosity: Vikram
 * carries six one-on-ones across early mornings and evenings, and five and a half
 * hours of sessions fit in no single window. So `Add a range` opens a second row
 * rather than the editor assuming one.
 *
 * Unticking a day CLEARS its ranges rather than hiding them — a day off with
 * remembered hours would save a week nobody had declared.
 */

const DAYS = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
] as const;

type Range = [string, string];
type Week = Record<string, Range[]>;

/** The stored shape is one range OR an array of them OR null; this reads all three. */
function toWeek(avail: Record<string, unknown> | null | undefined): Week {
  const out: Week = {};
  for (const d of DAYS) {
    const raw = avail?.[d.key];
    if (!raw || !Array.isArray(raw) || raw.length === 0) {
      out[d.key] = [];
    } else if (Array.isArray(raw[0])) {
      out[d.key] = raw as Range[];
    } else {
      out[d.key] = [raw as Range];
    }
  }
  return out;
}

/** Write the demo's own shape back: a day with nothing is `null`, not `[]`. */
function toPayload(week: Week): Record<string, Range[] | null> {
  const out: Record<string, Range[] | null> = {};
  for (const d of DAYS) out[d.key] = week[d.key]?.length ? week[d.key]! : null;
  return out;
}

export function AvailabilityTab() {
  const { data, isLoading } = useMyAvailability();
  const save = useSaveAvailability();
  const toast = useToast();
  const [week, setWeek] = useState<Week>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setWeek(toWeek(data.avail));
  }, [data]);

  /**
   * AUTOSAVE, with the pulse the demo shows.
   *
   * The server refuses overlapping windows and anything off a quarter hour, and
   * its sentence is shown as it comes — the editor does not pre-judge, because a
   * half-typed `09:` is not yet a mistake.
   */
  const commit = (next: Week) => {
    setWeek(next);
    save.mutate(toPayload(next) as Record<string, unknown>, {
      onSuccess: () => {
        setSaved(true);
        window.setTimeout(() => setSaved(false), 1200);
      },
      onError: (e) => toast((e as Error).message),
    });
  };

  const setRange = (day: string, i: number, which: 0 | 1, value: string) => {
    const ranges = [...(week[day] ?? [])];
    const r: Range = [...(ranges[i] ?? ['09:00', '17:00'])] as Range;
    r[which] = value;
    ranges[i] = r;
    commit({ ...week, [day]: ranges });
  };

  if (isLoading) return <p className="sub">Reading your week…</p>;

  return (
    <div className="card lv-card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="k">My working week</span>
        <span className="row" style={{ gap: 'var(--s2)' }}>
          {saved ? <Pill kind="ok">Saved</Pill> : null}
          <Pill>
            {data?.tzLabel ?? 'IST'} · UTC{(data?.tzo ?? 5.5) >= 0 ? '+' : ''}
            {String(data?.tzo ?? 5.5).replace('.5', ':30').replace(/\.0$/, '')}
          </Pill>
        </span>
      </div>

      <p className="sub" style={{ margin: 0 }}>
        The hours you are available to be booked. The Schedule hatches everything outside them, and a
        booking that lands outside is refused with your name on it — so a week left blank is a week
        nobody can book.
      </p>

      <div className="lv-week">
        {DAYS.map((d) => {
          const ranges = week[d.key] ?? [];
          const on = ranges.length > 0;
          return (
            <div className={`lv-dayrow${ranges.length > 1 ? ' lv-daysplit' : ''}`} key={d.key}>
              <label className="lv-dtog">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) =>
                    /* unticking CLEARS — a day off with remembered hours would save
                       a week nobody had declared */
                    commit({ ...week, [d.key]: e.target.checked ? [['09:00', '17:00']] : [] })
                  }
                />
                {d.label}
              </label>

              {on ? (
                <div className="lv-times">
                  {ranges.map((r, i) => (
                    <span className="lv-range" key={i}>
                      <input
                        className="input lv-time"
                        type="time"
                        step={900}
                        value={r[0]}
                        aria-label={`${d.label} window ${i + 1} from`}
                        onChange={(e) => setRange(d.key, i, 0, e.target.value)}
                      />
                      to
                      <input
                        className="input lv-time"
                        type="time"
                        step={900}
                        value={r[1]}
                        aria-label={`${d.label} window ${i + 1} to`}
                        onChange={(e) => setRange(d.key, i, 1, e.target.value)}
                      />
                      {ranges.length > 1 ? (
                        <button
                          type="button"
                          className="cfg-del"
                          aria-label={`Remove ${d.label} window ${i + 1}`}
                          onClick={() =>
                            commit({ ...week, [d.key]: ranges.filter((_x, j) => j !== i) })
                          }
                        >
                          <Icon name="x" />
                        </button>
                      ) : null}
                    </span>
                  ))}

                  <button
                    type="button"
                    className="btn sm ghost lv-addr"
                    onClick={() => commit({ ...week, [d.key]: [...ranges, ['17:00', '20:00']] })}
                  >
                    Add a range
                  </button>
                </div>
              ) : (
                <span className="sub lv-off">Off</span>
              )}
            </div>
          );
        })}
      </div>

      <p className="audit">
        Saved as you change it. Windows land on the quarter hour and two windows on one day cannot
        overlap — a split shift is two windows, not one long one with a hole.
      </p>
    </div>
  );
}
