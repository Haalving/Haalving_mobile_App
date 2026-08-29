'use client';

import { Audit, Dial, Empty, Num, SkeletonRows } from '@/components/ui';
import { useLive } from '@/features/queues/queries';

/**
 * The live board — the four readings Ops watches.
 *
 * Ported from console-ops.js `renderLiveTab`, with one difference stated out
 * loud rather than hidden: the demo's numbers are SEEDED (`opsStats` in
 * data.js), and a dashboard that cannot go red is a poster of a dashboard. Every
 * figure here is counted off the same rows the other boards read.
 *
 * THE FOURTH TILE IS AN INSTRUMENT, not a fourth number in a row of numbers —
 * the demo makes the same choice, swapping the tile for a dial whenever the
 * reading parses as a percentage. On-time delivery is the reading this board
 * exists for; the other three are counts of things to go and fix.
 */

function Tile({ k, v, tone }: { k: string; v: number; tone?: 'bad' | 'ok' }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className={`v num${tone ? ` ${tone}` : ''}`}>{v}</div>
    </div>
  );
}

export function LiveBoard() {
  const { data, isLoading } = useLive();

  if (isLoading) return <SkeletonRows rows={2} height={96} />;
  if (!data) return null;

  return (
    <>
      <div className="grid3">
        <Tile k="Unrated > 60 min" v={data.unratedOver60} tone={data.unratedOver60 > 0 ? 'bad' : undefined} />
        <Tile
          k="Unconfirmed cal > 24 h"
          v={data.unconfirmedCal24}
          tone={data.unconfirmedCal24 > 0 ? 'bad' : undefined}
        />
        <Tile k="Approvals > 4 h" v={data.approvals4h} tone={data.approvals4h === 0 ? 'ok' : 'bad'} />

        {/*
         * NULL IS NOT ZERO. With nothing rated today there is no on-time figure
         * to give, and a 0% ring would read as a catastrophe where the truth is
         * "no plates have come back yet". The demo never faces this because its
         * number is a constant.
         */}
        {data.onTimePct == null ? (
          <div className="stat">
            <div className="k">Replies on time</div>
            <div className="v num">—</div>
            <div className="sub">nothing rated yet today</div>
          </div>
        ) : (
          <div className="stat" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Dial pct={data.onTimePct} label="replies on time" size="sm" />
          </div>
        )}
      </div>

      <Audit>
        On time means answered inside the <Num>{data.replyTargetMin}</Num> min reply target ·{' '}
        <Num>{data.ratedToday}</Num> rated today
      </Audit>

      {data.allClear ? (
        <Empty icon="leaf" sentence="Zero open deviations — first time this month." />
      ) : null}
    </>
  );
}
