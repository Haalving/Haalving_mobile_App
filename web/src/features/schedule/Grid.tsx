'use client';

import { useEffect, useRef, useState } from 'react';
import {
  H0,
  H1,
  PX_PER_HOUR,
  SNAP_MIN,
  clampMin,
  dayName,
  snapMin,
} from '@haalving/shared';

import { Tile } from '@/features/schedule/Tile';
import { dayOfMonth, nowMinutes } from '@/features/schedule/days';
import type { Occurrence, SchedulePayload } from '@/features/schedule/queries';

/**
 * The grid — ported from `colData`, `gridHtml` and `wireDrag`
 * (console-schedule.js:645-700, 1378-1499).
 *
 * A DAY'S COLUMN CARRIES AS MANY FLEX SHARES AS IT HAS LANES, so every tile on
 * the calendar keeps ONE standard width and a day with parallel work simply grows
 * wider. The header mirrors the shares, which is why both read the same `lanes`
 * number. The lanes themselves are the server's — `layoutLanes` ran there, and
 * re-packing them here would let the drawn grid and the checked grid disagree.
 *
 * THE DRAG NEVER DECIDES. It moves a ghost, and on release it asks. A refusal
 * comes back as a 409 carrying the server's own sentence, and because nothing was
 * moved optimistically the tile is already where it was — the snap-back is the
 * absence of a change, not an undo.
 */

type Drag =
  | {
      kind: 'move';
      occ: Occurrence;
      x0: number;
      y0: number;
      moved: boolean;
      toDate: string;
      toMin: number;
    }
  | { kind: 'resize'; occ: Occurrence; x0: number; y0: number; moved: boolean; toDur: number }
  | {
      kind: 'create';
      date: string;
      m0: number;
      x0: number;
      y0: number;
      moved: boolean;
      a: number;
      b: number;
    };

export interface GridProps {
  data: SchedulePayload;
  days: string[];
  view: 'day' | 'week';
  today: string;
  clientNames: Map<string, string>;
  onOpen: (occ: Occurrence) => void;
  /** Same day: the tile changed when it starts, how long it runs, or both. */
  onTimeChange: (occ: Occurrence, startMin: number, durMin: number) => void;
  /** A different day: the tile moved. */
  onMove: (occ: Occurrence, toDate: string, startMin: number) => void;
  /** Drawn on empty grid — the sheet opens already holding the slot. */
  onCreate: (prefill: { date: string; startMin: number; durMin: number }) => void;
  onGoDay: (date: string) => void;
}

export function Grid({
  data,
  days,
  view,
  today,
  clientNames,
  onOpen,
  onTimeChange,
  onMove,
  onCreate,
  onGoDay,
}: GridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  /*
   * The drag lives in BOTH a ref and state, and each half earns its place: the
   * pointer handlers read the ref, because a `pointermove` closure that read
   * state would act on whatever the last render happened to hold; the ghost is
   * drawn from state, because a ref does not re-render. `set` writes both, and
   * nothing else writes either.
   */
  const dragRef = useRef<Drag | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const set = (next: Drag | null) => {
    dragRef.current = next;
    setDrag(next);
  };

  /* a completed drag ends in a click; without this the release also opens the
     sheet for the tile that was just moved */
  const justDragged = useRef(false);

  /* first paint lands on the working morning, not on 7 am */
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 1.5 * PX_PER_HOUR;
  }, []);

  const byId = new Map(data.staff.map((u) => [u.id, u]));
  const nowMin = nowMinutes();

  /* the occurrences of each day, in the order the server sent them */
  const byDay = new Map<string, Occurrence[]>();
  for (const o of data.occurrences) {
    const list = byDay.get(o.date);
    if (list) list.push(o);
    else byDay.set(o.date, [o]);
  }
  const lanesOf = (date: string) =>
    (byDay.get(date) ?? []).reduce((n, o) => Math.max(n, o.lanes || 1), 1);

  /* EXACTLY one person in the lens hatches their off-hours. Two people's
     off-hours laid over one column would be a hatch that belongs to nobody, so
     the cue steps aside as the lens widens. */
  const offFor = (date: string): Array<[number, number]> =>
    data.lens.length === 1 ? (data.offSegments[data.lens[0] as string]?.[date] ?? []) : [];

  /* ------------------------------------------------------------ geometry */

  const colAt = (x: number): HTMLElement | null => {
    const cols = gridRef.current?.querySelectorAll<HTMLElement>('.schcol');
    if (!cols) return null;
    for (const col of cols) {
      const r = col.getBoundingClientRect();
      if (x >= r.left && x < r.right) return col;
    }
    return null;
  };

  const minAt = (col: HTMLElement, y: number) =>
    clampMin(snapMin(H0 * 60 + ((y - col.getBoundingClientRect().top) / PX_PER_HOUR) * 60));

  const occAt = (taskId: string, date: string) =>
    data.occurrences.find((o) => o.taskId === taskId && o.date === date);

  /* --------------------------------------------------------------- drag */

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    justDragged.current = false;
    const target = e.target as HTMLElement;
    const tileEl = target.closest<HTMLElement>('[data-tile]');

    if (tileEl) {
      const occ = occAt(tileEl.dataset.tile ?? '', tileEl.dataset.date ?? '');
      /* not editable: no drag is armed at all, and the tile's own click still
         opens the sheet — which is how a read-only role reads the grid */
      if (!occ || !occ.editable) return;
      const resizing = !!target.closest('[data-rz]');
      set(
        resizing
          ? { kind: 'resize', occ, x0: e.clientX, y0: e.clientY, moved: false, toDur: occ.durMin }
          : {
              kind: 'move',
              occ,
              x0: e.clientX,
              y0: e.clientY,
              moved: false,
              toDate: occ.date,
              toMin: occ.startMin,
            },
      );
      return;
    }

    const col = target.closest<HTMLElement>('.schcol');
    if (!col) return;
    const date = col.dataset.col;
    if (!date) return;
    const m0 = minAt(col, e.clientY);
    set({ kind: 'create', date, m0, a: m0, b: m0 + SNAP_MIN, x0: e.clientX, y0: e.clientY, moved: false });

    /* no capture and no preventDefault YET — capturing on pointerdown retargets
       the coming click away from the tile, so nothing would ever open. The
       pointer is captured only once a real drag has started. */
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragRef.current;
    if (!st) return;
    if (!st.moved && Math.abs(e.clientX - st.x0) < 5 && Math.abs(e.clientY - st.y0) < 5) return;
    if (!st.moved) e.currentTarget.setPointerCapture(e.pointerId);

    if (st.kind === 'move') {
      const col = colAt(e.clientX);
      const toDate = col?.dataset.col ?? st.occ.date;
      const toMin = clampMin(
        snapMin(st.occ.startMin + ((e.clientY - st.y0) / PX_PER_HOUR) * 60),
      );
      set({ ...st, moved: true, toDate, toMin });
      return;
    }

    if (st.kind === 'resize') {
      const end = Math.max(
        st.occ.startMin + SNAP_MIN,
        snapMin(st.occ.startMin + st.occ.durMin + ((e.clientY - st.y0) / PX_PER_HOUR) * 60),
      );
      set({ ...st, moved: true, toDur: Math.min(end, H1 * 60) - st.occ.startMin });
      return;
    }

    const col = gridRef.current?.querySelector<HTMLElement>(`.schcol[data-col="${st.date}"]`);
    if (!col) return;
    const m1 = minAt(col, e.clientY);
    set({ ...st, moved: true, a: Math.min(st.m0, m1), b: Math.max(st.m0, m1) + SNAP_MIN });
  };

  const finish = () => {
    const st = dragRef.current;
    if (!st) return;
    set(null);
    if (!st.moved) return; /* a plain click — the tile's own handler owns it */
    justDragged.current = true;

    if (st.kind === 'create') {
      onCreate({ date: st.date, startMin: st.a, durMin: Math.max(SNAP_MIN, st.b - st.a) });
      return;
    }
    if (st.kind === 'resize') {
      if (st.toDur !== st.occ.durMin) onTimeChange(st.occ, st.occ.startMin, st.toDur);
      return;
    }
    if (st.toDate === st.occ.date) {
      if (st.toMin !== st.occ.startMin) onTimeChange(st.occ, st.toMin, st.occ.durMin);
      return;
    }
    onMove(st.occ, st.toDate, st.toMin);
  };

  /* ------------------------------------------------------------- drawing */

  const hours = [];
  for (let h = H0; h < H1; h++) {
    hours.push(
      <span key={h} className="hlbl num" style={{ top: `${(h - H0) * PX_PER_HOUR}px` }}>
        {h % 12 || 12}
        {h < 12 ? ' am' : ' pm'}
      </span>,
    );
  }

  return (
    <div className="schwrap">
      <div className="schhead">
        <span className="gut" />
        {days.map((date) => (
          <button
            key={date}
            type="button"
            className={`dh${date === today ? ' today' : ''}`}
            style={{ flexGrow: lanesOf(date) }}
            onClick={() => onGoDay(date)}
          >
            <small>{dayName(date)}</small>
            <b className="num">{dayOfMonth(date)}</b>
          </button>
        ))}
      </div>

      <div className="schscroll" ref={scrollRef}>
        <div
          className="schgrid"
          ref={gridRef}
          style={{ height: `${(H1 - H0) * PX_PER_HOUR}px` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finish}
          onPointerCancel={() => set(null)}
        >
          <div className="gut">{hours}</div>

          {days.map((date) => {
            const occs = byDay.get(date) ?? [];
            const showNow = date === today && nowMin >= H0 * 60 && nowMin <= H1 * 60;

            return (
              <div
                key={date}
                className={`schcol${date === today ? ' today' : ''}`}
                data-col={date}
                style={{ flexGrow: lanesOf(date) }}
              >
                {offFor(date).map((seg) => (
                  <span
                    key={`${seg[0]}-${seg[1]}`}
                    className="sch3-off"
                    aria-hidden="true"
                    style={{
                      top: `${(((seg[0] - H0 * 60) / 60) * PX_PER_HOUR).toFixed(1)}px`,
                      height: `${(((seg[1] - seg[0]) / 60) * PX_PER_HOUR).toFixed(1)}px`,
                    }}
                  />
                ))}

                {showNow ? (
                  <span
                    className="nowline"
                    style={{ top: `${(((nowMin - H0 * 60) / 60) * PX_PER_HOUR).toFixed(1)}px` }}
                  />
                ) : null}

                {occs.map((o) => {
                  const dragged =
                    drag?.moved &&
                    drag.kind !== 'create' &&
                    drag.occ.taskId === o.taskId &&
                    drag.occ.date === o.date;
                  return (
                    <Tile
                      key={`${o.taskId}|${o.date}`}
                      occ={o}
                      view={view}
                      lens={data.lens}
                      byId={byId}
                      clientName={o.clientId ? (clientNames.get(o.clientId) ?? null) : null}
                      previewDur={dragged && drag.kind === 'resize' ? drag.toDur : undefined}
                      lifted={dragged && drag.kind === 'move'}
                      onOpen={() => {
                        if (justDragged.current) {
                          justDragged.current = false;
                          return;
                        }
                        onOpen(o);
                      }}
                    />
                  );
                })}

                {drag?.kind === 'move' && drag.moved && drag.toDate === date ? (
                  <Tile
                    occ={{ ...drag.occ, startMin: drag.toMin, date }}
                    view={view}
                    lens={data.lens}
                    byId={byId}
                    clientName={
                      drag.occ.clientId ? (clientNames.get(drag.occ.clientId) ?? null) : null
                    }
                    ghost
                  />
                ) : null}

                {drag?.kind === 'create' && drag.moved && drag.date === date ? (
                  <span
                    className="drawsel"
                    style={{
                      top: `${(((drag.a - H0 * 60) / 60) * PX_PER_HOUR).toFixed(1)}px`,
                      height: `${(((drag.b - drag.a) / 60) * PX_PER_HOUR).toFixed(1)}px`,
                    }}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
