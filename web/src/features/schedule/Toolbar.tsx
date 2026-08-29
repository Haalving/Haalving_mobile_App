'use client';

import { dayName } from '@haalving/shared';

import { Icon } from '@/components/icons/Icon';
import { Num } from '@/components/ui';
import type { ClientListItem } from '@/features/clients/queries';
import { WhoDot, lensLabel } from '@/features/schedule/Lens';
import { dayOfMonth, firstName, monthShort } from '@/features/schedule/days';
import type { SchedStaff } from '@/features/schedule/queries';

/**
 * The calendar's head and its bar — ported from `toolbarHtml`
 * (console-schedule.js:817-868).
 *
 * The bar's order is the demo's and is not rearranged: Today, the two arrows and
 * the range at the leading edge, then a `.grow` spacer, then the three controls
 * that change WHAT is drawn — the lens, the client filter and the view toggle —
 * at the trailing edge.
 */

export type ViewMode = 'day' | 'week';

/** The sentence under the title, which says what the lens is doing. */
function subLine(lens: string[], byId: Map<string, SchedStaff>, canWiden: boolean) {
  if (!lens.length) return <>The whole team’s week — drag a tile to reschedule.</>;
  if (lens.length === 1) {
    if (!canWiden) return <>Your week — the lens stays on you for your role.</>;
    return (
      <>{firstName(byId.get(lens[0] as string)?.name ?? '')}’s week — add more people to read them together.</>
    );
  }
  return (
    <>
      <Num>{lens.length}</Num> people’s hours on one grid, each in their own colour.
    </>
  );
}

export function Toolbar({
  days,
  mode,
  lens,
  staff,
  canWiden,
  clients,
  client,
  onToday,
  onStep,
  onOpenLens,
  onClient,
  onMode,
  onNew,
}: {
  days: string[];
  mode: ViewMode;
  lens: string[];
  staff: SchedStaff[];
  canWiden: boolean;
  clients: ClientListItem[];
  client: string;
  onToday: () => void;
  onStep: (delta: -1 | 1) => void;
  onOpenLens: () => void;
  onClient: (id: string) => void;
  onMode: (mode: ViewMode) => void;
  onNew: () => void;
}) {
  const byId = new Map(staff.map((u) => [u.id, u]));
  const a = days[0] as string;
  const b = days[days.length - 1] as string;

  const range =
    mode === 'day' ? (
      <>
        {dayName(a)} <Num>{dayOfMonth(a)}</Num> {monthShort(a)}
      </>
    ) : (
      <>
        <Num>{dayOfMonth(a)}</Num> {monthShort(a)} – <Num>{dayOfMonth(b)}</Num> {monthShort(b)}
      </>
    );

  return (
    <>
      <div className="h1-row">
        <div>
          <div className="kicker">TODAY’S HOURS</div>
          <h1 className="h1">Schedule</h1>
          <div className="sub">{subLine(lens, byId, canWiden)}</div>
        </div>
        <button type="button" className="btn" onClick={onNew}>
          <Icon name="plus" /> New task
        </button>
      </div>

      <div className="schbar wrap">
        <button type="button" className="btn sm ghost" onClick={onToday}>
          Today
        </button>
        <button type="button" className="pgbtn" aria-label="Earlier" onClick={() => onStep(-1)}>
          <Icon name="chevL" />
        </button>
        <button type="button" className="pgbtn" aria-label="Later" onClick={() => onStep(1)}>
          <Icon name="chevR" />
        </button>
        <span className="schrange">{range}</span>
        <span className="grow" />

        {/* the lens button wears its own answer — up to four dots, so the legend
            starts in the toolbar. Whoever cannot widen holds a dead button
            naming themselves rather than one that opens and then refuses. */}
        <button
          type="button"
          className="btn sm ghost"
          disabled={!canWiden}
          title={canWiden ? undefined : 'Widening the lens needs an allocator role'}
          aria-label={`Whose schedule — currently ${lensLabel(lens, byId)}`}
          onClick={onOpenLens}
        >
          {lens.length ? (
            lens.slice(0, 4).map((id) => <WhoDot key={id} who={byId.get(id)?.who} />)
          ) : (
            <Icon name="users" />
          )}
          {lensLabel(lens, byId)}
        </button>

        <select
          className="input sel"
          aria-label="Filter by client"
          value={client}
          onChange={(e) => onClient(e.target.value)}
        >
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <div className="vtog" role="group" aria-label="Calendar view">
          <button
            type="button"
            className={mode === 'day' ? 'on' : ''}
            aria-pressed={mode === 'day'}
            onClick={() => onMode('day')}
          >
            Day
          </button>
          <button
            type="button"
            className={mode === 'week' ? 'on' : ''}
            aria-pressed={mode === 'week'}
            onClick={() => onMode('week')}
          >
            Week
          </button>
        </div>
      </div>
    </>
  );
}
