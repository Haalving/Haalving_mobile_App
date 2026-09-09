import Svg, { Circle, Path, Polygon } from 'react-native-svg';

import { useTheme } from '@/theme/tokens';

/**
 * THE HAALVING INDEX — the product's own instrument, as the story deck's closing
 * card draws it (`HV.ui.index(idx, { size: 'sm' })`, core.js:2730).
 *
 * Four axes, one per pillar; concentric diamonds for the levels; the shape is
 * the four readings joined. The 'sm' glimpse carries no labels, so its viewBox
 * drops the label gutters (12 units of padding instead of 80/42) — kept, the
 * shape would shrink inside empty air. Rings are NOT evenly spaced: every level
 * out is wider than the one inside it (exponent 1.15), the same rule the grid
 * and the shape share so a cleared level lands exactly on its ring.
 */
const ORDER = ['fitness', 'culture', 'yoga', 'wellness'] as const;
type Pillar = (typeof ORDER)[number];

export function IndexGlyph({
  vals,
  width,
  rings = 4,
  done = 0,
}: {
  vals: Partial<Record<Pillar, number>>;
  /** rendered width; the height follows the viewBox */
  width: number;
  rings?: number;
  done?: number;
}) {
  const c = useTheme();
  const R = 90;
  const PX = 12;
  const PY = 12;
  const CX = R + PX;
  const CY = R + PY;
  const W = CX * 2;
  const H = CY * 2;
  const EXP = 1.15;
  const rad = (x: number) => R * Math.pow(Math.max(0, Math.min(100, Number(x) || 0)) / 100, EXP);
  const n = (x: number) => Number(x.toFixed(2));
  const v = (k: Pillar) => Math.max(0, Math.min(100, Number(vals[k]) || 0));
  const pt: Record<Pillar, (x: number) => [number, number]> = {
    fitness: (x) => [CX, n(CY - rad(x))],
    culture: (x) => [n(CX + rad(x)), CY],
    yoga: (x) => [CX, n(CY + rad(x))],
    wellness: (x) => [n(CX - rad(x)), CY],
  };
  const poly = (src: (k: Pillar) => number) => ORDER.map((k) => pt[k](src(k)).join(',')).join(' ');
  const pillarColor: Record<Pillar, string> = {
    fitness: c.fitness,
    culture: c.culture,
    yoga: c.yoga,
    wellness: c.wellness,
  };

  return (
    <Svg width={width} height={(width * H) / W} viewBox={`0 0 ${W} ${H}`}>
      {Array.from({ length: rings }, (_, i0) => {
        const i = i0 + 1;
        const r = n(rad((i / rings) * 100));
        const on = i <= done;
        const goal = i === rings;
        return (
          <Polygon
            key={i}
            points={`${CX},${n(CY - r)} ${n(CX + r)},${CY} ${CX},${n(CY + r)} ${n(CX - r)},${CY}`}
            fill="none"
            stroke={on ? c.brand2 : goal ? c.ink3 : c.line}
            strokeWidth={on ? 1.25 : goal ? 1.5 : 1}
          />
        );
      })}
      <Path d={`M${CX} ${CY - R}V${CY + R}M${CX - R} ${CY}H${CX + R}`} fill="none" stroke={c.lineSoft} strokeWidth={1} />
      {/* the shape: the brand at 14% inside its own stroke */}
      <Polygon points={poly(v)} fill={`${c.brand}24`} stroke={c.brand} strokeWidth={2} strokeLinejoin="round" />
      {ORDER.map((k) => {
        const [cx, cy] = pt[k](v(k));
        return <Circle key={k} cx={cx} cy={cy} r={4} fill={pillarColor[k]} />;
      })}
    </Svg>
  );
}
