'use client';

import {
  H0,
  KINDS,
  PILLARS,
  PILLAR_KEYS,
  PX_PER_HOUR,
  dayName,
  fmtShortTime,
  type PillarKey,
} from '@haalving/shared';

import { Icon } from '@/components/icons/Icon';
import { Num } from '@/components/ui';
import { whoVar } from '@/features/schedule/Lens';
import { LinkMark } from '@/features/schedule/marks';
import { firstName } from '@/features/schedule/days';
import type { Occurrence, SchedStaff } from '@/features/schedule/queries';

/**
 * One tile — ported from `tileHtml` (console-schedule.js:566-618).
 *
 * THE INLINE STYLES HERE ARE DATA. `top` is the start, `height` is the length,
 * `left` and `width` are the lane the server packed this occurrence into. A grid
 * is drawn, not laid out by the box model, and none of those four numbers can
 * live in a stylesheet. Nothing else on the tile is styled from here — the fill,
 * the border and the type all come from the classes.
 *
 * PILLAR COLOUR ONLY ON A SESSION. `k-session` reads `--pw` and `--pcd` from the
 * `p-*` class beside it, and a session is the only kind that carries a pillar.
 * PERSON COLOUR ONLY FROM TWO PEOPLE UP: with one person in the lens every tile
 * is theirs and the rail would be decoration; with everyone selected, twelve
 * colours is soup. The names are in the accessible label either way, because
 * colour is never allowed to be the only carrier.
 */

/** The demo's `railHtml`: hard colour stops, so two people never blend into a third. */
function whoRail(hits: string[], byId: Map<string, SchedStaff>) {
  const step = 100 / hits.length;
  const stops = hits
    .map((id, i) => `${whoVar(byId.get(id)?.who)} ${(i * step).toFixed(2)}% ${((i + 1) * step).toFixed(2)}%`)
    .join(',');
  return (
    <span
      className="whorail"
      aria-hidden="true"
      style={{ background: `linear-gradient(to bottom,${stops})` }}
    />
  );
}

export interface TileProps {
  occ: Occurrence;
  view: 'day' | 'week';
  lens: string[];
  byId: Map<string, SchedStaff>;
  clientName: string | null;
  /** A live resize preview; the drag owns it, the data does not. */
  previewDur?: number;
  /** The dragged tile, left in place and outlined while its ghost moves. */
  lifted?: boolean;
  /** The follow-the-pointer copy, which takes the whole lane and never listens. */
  ghost?: boolean;
  onOpen?: () => void;
}

export function Tile({
  occ,
  view,
  lens,
  byId,
  clientName,
  previewDur,
  lifted,
  ghost,
  onOpen,
}: TileProps) {
  const dur = previewDur ?? occ.durMin;
  const top = ((occ.startMin - H0 * 60) / 60) * PX_PER_HOUR;
  const h = Math.max(18, (dur / 60) * PX_PER_HOUR - 2);
  const w = 100 / (occ.lanes || 1);

  const lensHit = lens.length >= 2 ? occ.people.filter((id) => lens.includes(id)) : [];
  const sizeCls = h < 26 ? ' xs' : '';

  /* acceptance: a group task stays dashed until every participant is in, then it
     reads Confirmed. `needed` is the server's answer to "is there anybody to
     agree with" — a solo task is never unconfirmed. */
  const grp = occ.resp.needed;
  const rspCls = grp ? (occ.resp.confirmed ? ' sch3-conf' : ' sch3-open') : '';
  const rspPill = !grp ? null : occ.resp.confirmed ? (
    <span className="sch3-rsp">
      <Icon name="check" />
      {view === 'week' ? '' : 'Confirmed'}
    </span>
  ) : (
    <span className="sch3-rsp">
      <Num>
        {occ.resp.accepted}/{occ.resp.total}
      </Num>
      {view === 'week' ? '' : ' in'}
    </span>
  );

  const pillarCls =
    occ.kind === 'session' && occ.pillar && (PILLAR_KEYS as readonly string[]).includes(occ.pillar)
      ? ` ${PILLARS[occ.pillar as PillarKey].cls}`
      : '';
  const kindCls = KINDS[occ.kind].cls + pillarCls;

  /* the tile says little; its accessible name says everything the sheet holds */
  const label =
    (occ.done ? 'Done: ' : '') +
    `${KINDS[occ.kind].name} — ${occ.title}` +
    (clientName ? `, client ${firstName(clientName)}` : '') +
    `, ${fmtShortTime(occ.startMin)} to ${fmtShortTime(occ.startMin + dur)}, ${dayName(occ.date)}` +
    (lensHit.length
      ? `, ${lensHit.map((id) => firstName(byId.get(id)?.name ?? '')).join(' and ')}`
      : '') +
    (occ.people.length > 1 ? `, ${occ.people.length} people` : '') +
    (grp
      ? occ.resp.confirmed
        ? ', confirmed'
        : `, ${occ.resp.accepted} of ${occ.resp.total} accepted`
      : '') +
    (occ.recurring ? ', repeats' : '') +
    (occ.link ? ', has meeting link' : '');

  const cls =
    `tile ${kindCls}${sizeCls}${rspCls}` +
    (occ.done ? ' done' : '') +
    (lensHit.length ? ' haswho' : '') +
    (occ.editable ? ' candrag' : '') +
    (lifted ? ' lift' : '') +
    (ghost ? ' ghost' : '');

  return (
    <button
      type="button"
      className={cls}
      data-tile={occ.taskId}
      data-date={occ.date}
      style={{
        top: `${top.toFixed(1)}px`,
        height: `${h.toFixed(1)}px`,
        /* a ghost takes the whole lane: it is where the tile would land, and
           lane packing is the server's answer for where it currently is */
        left: ghost ? 0 : `${(occ.lane * w).toFixed(2)}%`,
        width: ghost ? 'calc(100% - 2px)' : `calc(${w.toFixed(2)}% - 2px)`,
      }}
      aria-label={label}
      aria-hidden={ghost ? true : undefined}
      tabIndex={ghost ? -1 : undefined}
      onClick={onOpen}
    >
      {lensHit.length ? whoRail(lensHit, byId) : null}

      {view === 'week' ? (
        <span className="tt">
          <Num>{fmtShortTime(occ.startMin)}</Num>
          {rspPill}
        </span>
      ) : (
        <>
          <span className="tt">
            <Num>{fmtShortTime(occ.startMin)}</Num>
            {occ.link ? (
              <span className="tic" aria-hidden="true">
                <LinkMark />
              </span>
            ) : null}
            {rspPill}
          </span>
          <span className="tn">{occ.title}</span>
        </>
      )}

      {/* the resize grip, only where there is room to grab one */}
      {occ.editable && occ.durMin >= 45 && !ghost ? (
        <span className="rz" data-rz="" aria-hidden="true" />
      ) : null}
    </button>
  );
}
