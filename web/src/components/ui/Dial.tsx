/**
 * THE SIGNATURE INSTRUMENT — a 270° calibrated arc with hairline ticks and a
 * serif numeral at centre. The product is named for it.
 *
 * Ported from `HV.ui.dial` (core.js:2672). The markup is IDENTICAL to the demo's
 * string, because `.dial` and its children are styled by app.css — a different
 * element order or a missing wrapper would change the pixels even with the same
 * classes. In particular `.face` is what positions the SVG under the numeral;
 * flattening it moves the reading.
 */

export interface DialProps {
  /** 0–100. Drives the arc. */
  pct: number;
  /** Short uppercase caption under the value. */
  label?: string;
  /** What to print at centre. Defaults to the rounded percentage. */
  value?: string | number;
  /** Defaults to '%'. Pass '' for a bare number. */
  suffix?: string;
  /**
   * A CSS custom-property NAME, not a colour: 'fitness', 'culture', 'brand'.
   * A pillar's colour may appear only in that pillar's own dial — passing a
   * pillar here anywhere else breaks the system's one colour law.
   */
  color?: string;
  size?: 'sm' | 'lg';
  ticks?: number;
}

/* 270° of r=44. The arc's own length, so --arc is a plain percentage of it. */
const ARC = 207.35;

export function Dial({ pct, label, value, suffix = '%', color, size, ticks = 28 }: DialProps) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));

  /* The calibration ticks, drawn from the SVG origin like the arc. Every seventh
     is major — that is what makes it read as a scale rather than a texture. */
  const marks = [];
  for (let i = 0; i <= ticks; i++) {
    const th = ((i / ticks) * 270 * Math.PI) / 180;
    const major = i % 7 === 0;
    const r1 = major ? 31 : 33.5;
    const r2 = 37;
    marks.push(
      <line
        key={i}
        x1={(50 + r1 * Math.cos(th)).toFixed(2)}
        y1={(50 + r1 * Math.sin(th)).toFixed(2)}
        x2={(50 + r2 * Math.cos(th)).toFixed(2)}
        y2={(50 + r2 * Math.sin(th)).toFixed(2)}
        {...(major ? { strokeWidth: 1.4 } : {})}
      />,
    );
  }

  const shown = value !== undefined ? value : Math.round(p);
  const aria = label ? `${label}: ${shown}${suffix}` : `${shown}${suffix}`;

  const style: React.CSSProperties & Record<string, string> = {
    '--arc': ((ARC * p) / 100).toFixed(2),
  } as never;
  if (color) style['--dc'] = `var(--${color})`;

  return (
    <span className={`dial ${size ?? ''}`} style={style} role="img" aria-label={aria}>
      <span className="face">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <g className="ticks">{marks}</g>
          <circle className="track" cx="50" cy="50" r="44" />
          <circle className="fill" cx="50" cy="50" r="44" />
        </svg>
        <span className="v">
          {shown}
          {suffix ? <sup>{suffix}</sup> : null}
        </span>
      </span>
      {label ? <span className="cap">{label}</span> : null}
    </span>
  );
}
