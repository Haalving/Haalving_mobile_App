'use client';

import { dayName, fmtShortTime } from '@haalving/shared';

import { Num } from '@/components/ui';
import { WhoDot } from '@/features/schedule/Lens';
import { RepeatMark } from '@/features/schedule/marks';
import { dayOfMonth, firstName } from '@/features/schedule/days';
import type { Occurrence, SchedStaff } from '@/features/schedule/queries';

/**
 * The Daily-rhythm strip — ported from `dailiesHtml` (console-schedule.js:620-651).
 *
 * The standing duties are said ONCE, not painted seven times across the grid.
 * Closed it is one quiet line; open it lists them, using the native `details`
 * element the product already discloses with everywhere else.
 *
 * ONE ADDITION THE DEMO HAS NO ROOM FOR. A duty is the same beat every day, so
 * "is it done" is a question per DAY rather than per duty — the tick row carries
 * one mark per visible day, wearing the same day numeral as the column header
 * above it, so a reader can line the two up. The demo's store held `t.done[rd]`
 * and its row could only ever speak for the one day it was opened at.
 */

interface Duty {
  taskId: string;
  title: string;
  startMin: number;
  people: string[];
  /** The occurrence on each day this duty runs, keyed by date. */
  byDate: Map<string, Occurrence>;
}

/**
 * The duties, each once, in the order the server first mentioned them.
 *
 * Never re-sorted: the server expanded the range day by day and the reading it
 * produced is the one drawn. The demo sorts by start time because it holds the
 * whole store and can; here that would be the browser deciding an order the
 * server already decided.
 */
function group(dailies: Occurrence[]): Duty[] {
  const out: Duty[] = [];
  const at = new Map<string, Duty>();

  for (const o of dailies) {
    let duty = at.get(o.taskId);
    if (!duty) {
      duty = {
        taskId: o.taskId,
        title: o.title,
        startMin: o.startMin,
        people: o.people,
        byDate: new Map(),
      };
      at.set(o.taskId, duty);
      out.push(duty);
    }
    duty.byDate.set(o.date, o);
  }
  return out;
}

export function DailyRhythm({
  dailies,
  days,
  lens,
  staff,
  onOpen,
  onToggleDone,
}: {
  dailies: Occurrence[];
  days: string[];
  lens: string[];
  staff: SchedStaff[];
  onOpen: (occ: Occurrence) => void;
  onToggleDone: (occ: Occurrence) => void;
}) {
  const duties = group(dailies);
  if (!duties.length) return null;

  const byId = new Map(staff.map((u) => [u.id, u]));

  return (
    <details className="dailies">
      <summary>
        Daily rhythm — <Num>{duties.length}</Num> standing{' '}
        {duties.length === 1 ? 'duty' : 'duties'}{' '}
        <span className="sub">same beat every day · tap to open</span>
      </summary>

      <div className="dlist">
        {duties.map((d) => {
          const owners = d.people
            .slice(0, 2)
            .map((id) => firstName(byId.get(id)?.name ?? ''))
            .join(', ');
          /* the duties answer the lens in the same colour the grid does. The
             names are already spelled out beside them, so the dots are a second
             reading of the same fact and never the only one. */
          const dots = lens.length >= 2 ? d.people.filter((id) => lens.includes(id)).slice(0, 3) : [];
          /* the day the row opens at: today if it runs today, else the first
             visible day it runs on — `dailiesFor`'s own choice of `at` */
          const openAt = days.map((day) => d.byDate.get(day)).find((o) => !!o);

          return (
            <div className="drow" key={d.taskId}>
              <span className="num">{fmtShortTime(d.startMin)}</span>
              {/* a button rather than the demo's whole-row button: the day ticks
                  in the same row are buttons too, and a button inside a button
                  is not a thing a browser will render */}
              <button
                type="button"
                className="grow"
                disabled={!openAt}
                onClick={() => openAt && onOpen(openAt)}
              >
                {d.title}
              </button>
              <small>
                {dots.map((id) => (
                  <WhoDot key={id} who={byId.get(id)?.who} />
                ))}
                {owners}
              </small>
              <span className="tic">
                <RepeatMark />
              </span>

              {days.map((day) => {
                const occ = d.byDate.get(day);
                if (!occ) return null;
                return (
                  <button
                    key={day}
                    type="button"
                    className={`pill ${occ.done ? 'ok' : 'neutral'}`}
                    aria-pressed={occ.done}
                    aria-label={`${d.title} on ${dayName(day)} ${dayOfMonth(day)} — ${
                      occ.done ? 'done' : 'not done'
                    }`}
                    onClick={() => onToggleDone(occ)}
                  >
                    <Num>{dayOfMonth(day)}</Num>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </details>
  );
}
