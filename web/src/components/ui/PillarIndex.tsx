import { INDEX_AXIS_ORDER, type PillarKey } from '@haalving/shared';

/**
 * THE HAALVING INDEX — the four-pillar balance radar.
 *
 * Ported from `HV.ui.index` (core.js:2731). Hand-drawn SVG, no chart library —
 * which is not stubbornness: the geometry below carries meaning a library's
 * defaults would quietly overwrite.
 *
 * THREE RULES, all load-bearing:
 *
 *  1. THE AXIS ORDER IS FIXED — Fitness top, Nutrition right, Yoga bottom, Mind
 *     Wellness left. Re-ordering a radar's axes silently changes its shape, so
 *     it never varies. It comes from `INDEX_AXIS_ORDER` rather than a local
 *     array so there is one copy.
 *  2. THE RINGS ARE NOT EVENLY SPACED. Every level out is harder to hold than
 *     the one inside it, so every band is drawn wider than the band inside it.
 *     EXP = 1.15 is deliberately gentle: it widens the outermost band by about
 *     half over the innermost, which reads clearly, while a steeper curve
 *     crushed the early levels — and most clients live at L2–L3, so the inner
 *     rings are exactly the ones that must stay legible.
 *  3. THERE IS NO `done` PROP. A closed ring could only mean *every* pillar
 *     cleared that level, which is the retired lowest-pillar rule in disguise.
 *     The four pillar levels are the whole reading and nothing may reduce them
 *     to one number.
 */

export type IndexValues = Record<PillarKey, number>;

export interface PillarIndexProps {
  vals: IndexValues;
  /** The same shape from an earlier point, drawn as a dashed outline. */
  ghost?: IndexValues;
  /** 'sm' drops the labels and the headline — the onboarding glimpse. */
  size?: 'sm';
  /** Concentric quadrilaterals in the calibration grid. */
  rings?: number;
  /** Replaces the percentage under each pillar name, e.g. { fitness: 'L3' }. */
  marks?: Partial<Record<PillarKey, string>>;
  /** Dropped under the radar. */
  headline?: React.ReactNode;
}

const EXP = 1.15;

const AXIS = {
  fitness: { name: ['Fitness'], at: 'middle' as const },
  culture: { name: ['Nutrition'], at: 'start' as const },
  yoga: { name: ['Yoga'], at: 'middle' as const },
  /* a two-word side label stacks its words so the gutter only pays for the
     longest one — widening the gutter would shrink the whole instrument, type
     included, under the 12px floor */
  wellness: { name: ['Mind', 'Wellness'], at: 'end' as const },
};

export function PillarIndex({ vals, ghost, size, rings = 4, marks, headline }: PillarIndexProps) {
  const lab = size !== 'sm';

  /* PX is measured, not guessed: the side gutters hold "Nutrition" and the
     stacked "Mind"/"Wellness" (~58 units at this type size). Never widen it for
     a longer name — the SVG renders at a capped CSS width, so every extra gutter
     unit shrinks the instrument. Stack instead. */
  const R = 90;
  const PX = lab ? 80 : 12;
  const PY = lab ? 42 : 12;
  const CX = R + PX;
  const CY = R + PY;
  const W = CX * 2;
  const H = CY * 2;

  /* THE SCALE — one function for both the grid and the shape, so a pillar that
     has cleared level 3 lands exactly on ring 3 and never between rings. */
  const rad = (x: number) => R * Math.pow(Math.max(0, Math.min(100, Number(x) || 0)) / 100, EXP);
  const n = (x: number) => Number(x.toFixed(2));
  const v = (k: PillarKey) => Math.max(0, Math.min(100, Number(vals[k]) || 0));

  const pt = (k: PillarKey, x: number): [number, number] => {
    const r = rad(x);
    if (k === 'fitness') return [CX, n(CY - r)];
    if (k === 'culture') return [n(CX + r), CY];
    if (k === 'yoga') return [CX, n(CY + r)];
    return [n(CX - r), CY];
  };

  const poly = (src: IndexValues) =>
    INDEX_AXIS_ORDER.map((k) => pt(k, src[k]).join(',')).join(' ');

  /* concentric diamonds form the calibration grid — one per level. The outermost
     is the aim, so it carries a heavier stroke. */
  const grid = [];
  for (let i = 1; i <= rings; i++) {
    const r = n(rad((i / rings) * 100));
    grid.push(
      <polygon
        key={i}
        className={`igrid${i === rings ? ' goal' : ''}`}
        points={`${CX},${n(CY - r)} ${n(CX + r)},${CY} ${CX},${n(CY + r)} ${n(CX - r)},${CY}`}
      />,
    );
  }

  const read = (k: PillarKey) => (marks?.[k] != null ? String(marks[k]) : `${Math.round(v(k))}%`);

  const aria =
    `HAALVING Index: Fitness ${read('fitness')}, Nutrition ${read('culture')}, ` +
    `Yoga ${read('yoga')}, Mind Wellness ${read('wellness')}`;

  return (
    <div className={`index ${size ?? ''}`} role="img" aria-label={aria}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ aspectRatio: `${W}/${H}` }} aria-hidden="true">
        {grid}
        <path className="iaxis" d={`M${CX} ${CY - R}V${CY + R}M${CX - R} ${CY}H${CX + R}`} />
        {ghost ? <polygon className="ighost" points={poly(ghost)} /> : null}
        <polygon className="ishape" points={poly(vals)} />

        {/* each vertex carries its pillar's colour — with its label in the same
            colour, this is the ONLY place pillar colour appears on this chart */}
        {INDEX_AXIS_ORDER.map((k) => {
          const [x, y] = pt(k, v(k));
          return <circle key={k} className="ivtx" r="4" fill={`var(--${k})`} cx={x} cy={y} />;
        })}

        {lab
          ? INDEX_AXIS_ORDER.map((k) => {
              const a = AXIS[k];
              /* sat just outside its own vertex — never over the grid, which
                 would put hairlines through the type */
              const x = k === 'fitness' || k === 'yoga' ? CX : k === 'culture' ? CX + R + 8 : CX - R - 8;
              const baseY = k === 'fitness' ? CY - R - 24 : k === 'yoga' ? CY + R + 18 : CY - 3;
              const multi = a.name.length > 1;
              const ny = multi ? baseY - 8 : baseY;
              const vy = multi ? baseY + 24 : baseY + 17;
              return (
                <g key={k}>
                  <text className="ilbl-n" x={x} y={ny} textAnchor={a.at} fill={`var(--${k})`}>
                    {a.name.map((ln, i) =>
                      i === 0 ? ln : (
                        <tspan key={ln} x={x} dy="14">
                          {ln}
                        </tspan>
                      ),
                    )}
                  </text>
                  <text className="ilbl-v" x={x} y={vy} textAnchor={a.at}>
                    {read(k)}
                  </text>
                </g>
              );
            })
          : null}
      </svg>
      {headline}
    </div>
  );
}
