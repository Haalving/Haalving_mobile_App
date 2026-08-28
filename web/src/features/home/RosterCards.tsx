'use client';

import { PILLARS, PILLAR_KEYS, PLANS, PLAN_KEYS, levels as maxLevels, plansOnSale, type PillarKey } from '@haalving/shared';

import { Avatar, Num, Pill } from '@/components/ui';

/**
 * The three roster cards on Home — ported from `planSplitHtml`,
 * `pillarLevelsHtml` and `celebsHtml` in console-digest.js (:255, :225, :366).
 *
 * The markup matches the demo's, because `.dg-split`, `.dg-lvlrow`, `.dg-seg`
 * and `.dg-celeb` are styled by the block copied out of `DG_STYLE`.
 */

/* ------------------------------------------------------- roster by plan */

/**
 * One stacked bar, one segment per plan, with the counts in the legend.
 *
 * The tones are the brand and its lighter step, NOT pillar colours. A plan is
 * not a pillar, and spending a pillar's colour on one would break the rule that
 * a pillar's colour appears only in that pillar's own marks.
 */
const PLAN_TONE: Record<string, string> = {
  poorna: 'var(--brand)',
  svayam: 'var(--brand-2)',
};

export function RosterByPlan({ counts }: { counts: { poorna: number; svayam: number } }) {
  const rows = PLAN_KEYS.map((k) => ({ k, n: counts[k] ?? 0 })).filter((x) => x.n > 0);
  const total = rows.reduce((a, x) => a + x.n, 0);
  if (!total) return null;

  const onSale = plansOnSale();
  /* the note fires while any plan is defined but unsold — today that is always,
     because Svayam is launch:false until the coach conversations have trained it */
  const partial = onSale.length < PLAN_KEYS.length;

  return (
    <div className="card">
      <span className="k">Roster by plan</span>

      <div
        className="dg-split"
        role="img"
        aria-label={rows.map((x) => `${PLANS[x.k].name}: ${x.n}`).join(', ')}
      >
        {rows.map((x) => (
          <i
            key={x.k}
            style={{ width: `${(x.n / total) * 100}%`, background: PLAN_TONE[x.k] ?? 'var(--ink-3)' }}
          />
        ))}
      </div>

      <div className="dg-legend">
        {rows.map((x) => (
          <span key={x.k}>
            <span className="dg-key" style={{ background: PLAN_TONE[x.k] ?? 'var(--ink-3)' }} />
            {PLANS[x.k].name.replace(/^HAALVING /, '')} <Num>{x.n}</Num>
          </span>
        ))}
      </div>

      {partial ? (
        <p className="audit" style={{ margin: 'var(--s2) 0 0' }}>
          Only {onSale.map((k) => PLANS[k].name).join(' and ')} is on sale this launch — Svayam
          opens once the coach conversations have trained it.
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------- levels across the roster */

/**
 * Four segmented tracks, one per pillar — and there is no fifth.
 *
 * `scored` EXCLUDES clients in their observation window. They sit at level 1
 * because nothing has been assessed yet, not because they were assessed at 1, and
 * averaging them in drags every pillar toward the floor exactly when the roster
 * takes on new people.
 *
 * The reading is printed to one decimal ("L2.7") while the track lights to the
 * ROUNDED level. That is the demo's own pairing: the segments say which level the
 * roster is at, the numeral says how firmly.
 */
export function LevelsAcrossRoster({
  scored,
  mean,
}: {
  scored: number;
  mean: Record<PillarKey, number>;
}) {
  if (!scored) return null;
  const total = maxLevels();

  return (
    <div className="card">
      <span className="k">Levels across the roster</span>
      <p className="sub" style={{ margin: 'var(--s1) 0 0' }}>
        Mean level per pillar over <Num>{scored}</Num> scored {scored === 1 ? 'client' : 'clients'}.
        Each pillar climbs on its own — there is no combined level.
      </p>

      <div className="dg-lvl">
        {PILLAR_KEYS.map((k) => {
          const p = PILLARS[k];
          const avg = mean[k] ?? 1;
          const lit = Math.round(avg);
          return (
            <div
              key={k}
              className={`dg-lvlrow ${p.cls}`}
              title={`${p.name} — mean level ${avg} of ${total} across ${scored} clients`}
            >
              <span className="dg-lvlname">
                <span className="pdot" />
                {p.name}
              </span>
              <span
                className="dg-track"
                role="img"
                aria-label={`${p.name} mean level ${avg} of ${total}`}
              >
                {Array.from({ length: total }, (_, i) => (
                  <span key={i} className={`dg-seg${i + 1 <= lit ? ' on' : ''}`} />
                ))}
              </span>
              <span className="num" style={{ fontSize: 'var(--t-sm)' }}>
                L{avg}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ celebrations */

const WK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface Celebration {
  clientId: string;
  name: string;
  kind: 'birthday' | 'anniversary';
  dateISO: string;
  inDays: number;
}

/**
 * Birthdays and anniversaries in the next week.
 *
 * SENDING is not wired yet, and the card says so rather than offering a button
 * that would do nothing. In the demo a wish is a message written into the
 * client's Care Circle under the sender's name — there is no circle in the port
 * yet, and a "Wishes sent" pill over a message that was never sent is worse than
 * an honest gap.
 */
export function Celebrations({ items }: { items: Celebration[] }) {
  if (!items.length) return null;

  const when = (cel: Celebration) => {
    if (cel.inDays === 0) return 'Today';
    if (cel.inDays === 1) return 'Tomorrow';
    const [y, m, d] = cel.dateISO.split('-').map(Number);
    const day = WK[new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).getDay()];
    return (
      <>
        {day} · in <Num>{cel.inDays}</Num> d
      </>
    );
  };

  return (
    <>
      <div className="sec-title">Celebrations this week</div>
      <div className="dg-celebs">
        {items.map((cel) => (
          <div key={`${cel.clientId}-${cel.kind}`} className="card dg-celeb">
            <div className="row" style={{ gap: 'var(--s2)', alignItems: 'center' }}>
              <Avatar name={cel.name} className="sm" />
              <span className="grow">
                <b>{cel.name}</b>
                <small className="dg-dim">
                  {cel.kind === 'birthday' ? 'Birthday' : 'Anniversary'} · {when(cel)}
                </small>
              </span>
            </div>
            <div className="dg-celeb-act">
              <Pill kind="neutral">Wishes need the Care Circle</Pill>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
