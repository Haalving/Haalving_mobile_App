'use client';

import { useState } from 'react';
import { DEPTS, WHO_COLOURS } from '@haalving/shared';

import { Icon } from '@/components/icons/Icon';
import { Num, Sheet } from '@/components/ui';
import { useSession } from '@/store/session.store';
import { firstName } from '@/features/schedule/days';
import type { SchedStaff } from '@/features/schedule/queries';

/**
 * The person lens — who is on the grid, and in what colour.
 *
 * Ported from `wholegHtml`, `lensGroups` and `openLensSheet`
 * (console-schedule.js:709-819).
 *
 * A PERSON'S COLOUR IS THEIR SEAT, not their position in the current selection,
 * so it holds still while people are added and dropped around them. The server
 * assigns it (`whoIndex` over the staff list) and sends it down as `who`; the
 * browser only reads it. Twelve tokens for twelve staff — a thirteenth wraps
 * rather than crashing, which is what `WHO_COLOURS` as a fallback means below.
 */

export function whoVar(who: number | undefined): string {
  return `var(--who-${who ?? WHO_COLOURS})`;
}

/**
 * The `background` is DATA — it is which person this is. The demo builds the
 * same inline style in `whoDot` (console-schedule.js:157), because a colour
 * chosen per row cannot live in a stylesheet.
 */
export function WhoDot({ who }: { who: number | undefined }) {
  return <span className="whodot" style={{ background: whoVar(who) }} aria-hidden="true" />;
}

/** The selection in one phrase — `lensLabel` (console-schedule.js:702-706). */
export function lensLabel(lens: string[], byId: Map<string, SchedStaff>): string {
  if (!lens.length) return 'Everyone';
  if (lens.length <= 2) return lens.map((id) => firstName(byId.get(id)?.name ?? '')).join(' · ');
  return `${lens.length} people`;
}

/* ---------------------------------------------------------------- benches */

interface Bench {
  name: string;
  ids: string[];
}

/**
 * The picker's benches, as a TRUE PARTITION: each person appears once, in the
 * first group that claims them, and whoever no group claims lands in the tail
 * bucket rather than falling off the list.
 *
 * ONE DEPARTURE. The demo's `HV.deptMembers` counts a head of department onto
 * their own bench by reading `u.dept`; the schedule payload carries `role` and a
 * colour and nothing else, so an HoD is claimed by "Everyone else" here. They are
 * still listed, still selectable and still their own colour — only the heading
 * above them differs.
 */
function benches(staff: SchedStaff[]): Bench[] {
  const seen = new Set<string>();
  const out: Bench[] = [];

  const take = (name: string, list: SchedStaff[]) => {
    const fresh = list.filter((u) => !seen.has(u.id));
    for (const u of fresh) seen.add(u.id);
    if (fresh.length) out.push({ name, ids: fresh.map((u) => u.id) });
  };

  const OPS = ['admin', 'opsmgr', 'opshead', 'core'];
  take('Operations & management', staff.filter((u) => OPS.includes(u.role)));
  take('Doctors', staff.filter((u) => u.role === 'doctor'));
  /* the four benches — this is where the old "department" lens went: a bench is
     no longer a mode, it is a one-tap selection */
  for (const [role, label] of Object.entries(DEPTS)) {
    take(label, staff.filter((u) => u.role === role));
  }
  take('Everyone else', staff);

  return out;
}

/* ----------------------------------------------------------------- legend */

/**
 * The legend IS the lens: every name on it can be dropped with one tap, so
 * reading who is on the grid and changing who is on the grid are one act. It
 * only appears once colour is doing work — at two people and up.
 */
export function LensLegend({
  lens,
  byId,
  onDrop,
  onClear,
}: {
  lens: string[];
  byId: Map<string, SchedStaff>;
  onDrop: (id: string) => void;
  onClear: () => void;
}) {
  if (lens.length < 2) return null;

  return (
    <div className="wholeg" role="group" aria-label="People on the grid">
      <span>On the grid:</span>
      {lens.map((id) => {
        const name = firstName(byId.get(id)?.name ?? '');
        return (
          <button
            key={id}
            type="button"
            className="whochip"
            aria-label={`Remove ${name} from the grid`}
            onClick={() => onDrop(id)}
          >
            <WhoDot who={byId.get(id)?.who} />
            {name}
            <Icon name="x" />
          </button>
        );
      })}
      <button type="button" className="btn sm quiet" onClick={onClear}>
        Show everyone
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ sheet */

/**
 * MOUNTED ONLY WHILE OPEN, and every sheet on this screen is. The demo builds a
 * sheet's markup at the moment it is asked for, so its draft starts from what is
 * true right then; a component kept mounted behind an `open` flag would hold the
 * draft it was first given and reopen showing a lens that has since changed.
 */
export function LensSheet({
  staff,
  lens,
  onClose,
  onCommit,
}: {
  staff: SchedStaff[];
  lens: string[];
  onClose: () => void;
  onCommit: (ids: string[]) => void;
}) {
  const me = useSession((s) => s.user);
  const [draft, setDraft] = useState<string[]>(lens);

  const groups = benches(staff);

  const toggle = (id: string) =>
    setDraft((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));

  /* a bench header toggles: all in when any is out, all out when all in */
  const toggleBench = (ids: string[]) =>
    setDraft((d) =>
      ids.every((id) => d.includes(id))
        ? d.filter((id) => !ids.includes(id))
        : [...d, ...ids.filter((id) => !d.includes(id))],
    );

  const commit = () =>
    /* normalised to staff order, so the legend reads the same however the chips
       were tapped and the colours never appear to shuffle */
    onCommit(staff.map((u) => u.id).filter((id) => draft.includes(id)));

  return (
    <Sheet open onClose={onClose} label="Whose schedule">
      <div className="h1">Whose schedule</div>
      <p className="sub" style={{ margin: 0 }}>
        Pick as many people as you like. Each keeps their own colour on the grid, and a task two of
        them share shows both colours on the one tile. Pick nobody to see the whole team.
      </p>

      {groups.map((g) => (
        <div key={g.name}>
          <button
            type="button"
            className="whogrp"
            aria-label={`Select or clear everyone in ${g.name}`}
            onClick={() => toggleBench(g.ids)}
          >
            {g.name} · all <Num>{g.ids.length}</Num>
          </button>
          <div className="whopeople">
            {g.ids.map((id) => {
              const u = staff.find((s) => s.id === id);
              const on = draft.includes(id);
              const name = id === me?.id ? `${firstName(u?.name ?? '')} (you)` : (u?.name ?? '');
              return (
                <button
                  key={id}
                  type="button"
                  className={`chip${on ? ' sel' : ''}`}
                  aria-pressed={on}
                  onClick={() => toggle(id)}
                >
                  <WhoDot who={u?.who} /> {name}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="notice">
        {!draft.length ? (
          'Nobody picked — the whole team’s week, coloured by kind of work.'
        ) : draft.length === 1 ? (
          'One person — their hours, with the time outside their declared week hatched.'
        ) : (
          <>
            <Num>{draft.length}</Num> people on one grid, each with their own colour.
          </>
        )}
      </div>

      <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button type="button" className="btn sm quiet" onClick={() => setDraft([])}>
          Everyone
        </button>
        <button type="button" className="btn sm ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn sm" onClick={commit}>
          Show on the grid
        </button>
      </div>
    </Sheet>
  );
}
