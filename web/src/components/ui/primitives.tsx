import type { ReactNode } from 'react';

import { Icon, type IconName } from '@/components/icons/Icon';

/**
 * The small pieces of the UI kit, ported from `HV.ui.*` in core.js.
 *
 * Every one produces the SAME markup the demo's string builder produced, because
 * app.css styles these class names directly. A component that "tidied" the
 * structure — dropped a wrapper, reordered children, swapped a span for a div —
 * would keep the class and lose the pixels.
 */

/* ------------------------------------------------------------------- Ring */

/**
 * A ring is a dial without a legend — the same stroked-arc build, so the two
 * share one visual language (and the arc can animate, which a conic gradient
 * could not).
 */
export function Ring({
  pct,
  colorVar = 'brand',
  label,
  size,
}: {
  pct: number;
  colorVar?: string;
  label?: string;
  size?: 'sm' | 'lg';
}) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const C = 282.74; /* 2·π·45 */
  const txt = label != null ? String(label) : `${Math.round(p)}%`;
  const style = {
    '--arc': ((C * p) / 100).toFixed(2),
    '--rc': `var(--${colorVar})`,
  } as React.CSSProperties;

  return (
    <span className={`ring ${size ?? ''}`} style={style} role="img" aria-label={txt}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="rtrack" cx="50" cy="50" r="45" />
        <circle className="rfill" cx="50" cy="50" r="45" />
      </svg>
      <span className="rl">{txt}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ Stars */

/**
 * The rating star is ONE path, and CSS decides filled or empty — the one place
 * the hairline language yields, because a rating must read at a glance. It
 * replaced the ★ text glyph, which changed weight and width per platform and
 * took emoji presentation on some Android builds.
 */
export function Stars({ n, className }: { n: number; className?: string }) {
  return (
    <span className={`stars ${className ?? ''}`} role="img" aria-label={`${n} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= n ? '' : 'off'} aria-hidden="true">
          <Icon name="star" />
        </span>
      ))}
    </span>
  );
}

/* ----------------------------------------------------------------- Avatar */

/**
 * Initials on a hue derived from the name, so the same person is the same colour
 * everywhere without anyone storing one.
 *
 * 34% lightness, not 42%: white initials on a generated hue only clear 4.5:1 at
 * or below ~36%, and yellow-greens (hue ~60) are the worst case.
 */
export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = String(name || '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  let hue = 0;
  for (const ch of String(name)) hue = (hue * 31 + ch.charCodeAt(0)) % 360;

  return (
    <span
      className={`avatar ${className ?? ''}`}
      style={{ background: `hsl(${hue} 32% 34%)` }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

/* ------------------------------------------------------------ Pill / Chip */

export type PillKind = 'ok' | 'info' | 'warn' | 'bad' | 'neutral';

export function Pill({ children, kind = 'info' }: { children: ReactNode; kind?: PillKind }) {
  return <span className={`pill ${kind}`}>{children}</span>;
}

/** Border width is constant across states so selecting a chip never shifts layout. */
export function Chip({
  children,
  selected,
  warn,
  onClick,
  title,
}: {
  children: ReactNode;
  selected?: boolean;
  warn?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const cls = `chip${selected ? ' sel' : ''}${warn ? ' warn' : ''}`;
  if (!onClick) return <span className={cls}>{children}</span>;
  return (
    <button type="button" className={cls} onClick={onClick} title={title} aria-pressed={!!selected}>
      {children}
    </button>
  );
}

/* -------------------------------------------------------------- IconTile */

/** The refined replacement for an emoji tile. `cls` may add a pillar class. */
export function IconTile({ name, className }: { name: IconName | string; className?: string }) {
  return (
    <span className={`icon-tile ${className ?? ''}`} aria-hidden="true">
      <Icon name={name} />
    </span>
  );
}

/* ------------------------------------------------------------------- Gate */

/**
 * Status by exception: healthy is SILENT, and only a miss carries a flag. A tile
 * that announced "on track" for every well client would bury the one that is not.
 */
export function Gate({
  icon,
  name,
  meta,
  missLabel,
}: {
  icon: IconName | string;
  name: string;
  meta?: string;
  missLabel?: string;
}) {
  return (
    <div className={`gate${missLabel ? ' miss' : ''}`} data-flag={missLabel || undefined}>
      <div className="ic" aria-hidden="true">
        <Icon name={icon} />
      </div>
      <div className="nm">{name}</div>
      {meta ? <div className="mt">{meta}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ Trow */

/**
 * The list row: an avatar or tile, a growing middle holding a bold line and a
 * quiet one, and a trailing pill at the edge.
 *
 * THE TRAP: `.grow` is scoped to `.row` in app.css, NOT to `.trow`. Every
 * component that wants the middle of a `.trow` to expand ships its own rule —
 * omit it and the trailing pill sits mid-row instead of at the edge. This one
 * uses the demo's own `.strow` grammar via the class it is given.
 */
export function Trow({
  lead,
  title,
  sub,
  trailing,
  onClick,
  className,
}: {
  lead?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const inner = (
    <>
      {lead}
      <span className="grow" style={{ flex: 1, minWidth: 0 }}>
        <b>{title}</b>
        {sub ? <small>{sub}</small> : null}
      </span>
      {trailing}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={`trow click ${className ?? ''}`} onClick={onClick}>
        {inner}
      </button>
    );
  }
  return <div className={`trow ${className ?? ''}`}>{inner}</div>;
}

/* ----------------------------------------------------------------- Notice */

export function Notice({ children, kind }: { children: ReactNode; kind?: 'warn' | 'bad' }) {
  return <div className={`notice ${kind ?? ''}`}>{children}</div>;
}

/** The italic provenance line: where a number came from, or who signed it. */
export function Audit({ children }: { children: ReactNode }) {
  return <div className="audit">{children}</div>;
}

/* ------------------------------------------------------------------ Empty */

/**
 * An empty state that SPEAKS — a sentence a human would say, never just an icon.
 * The demo is strict about this and it is why its blank screens do not read as
 * broken ones.
 */
export function Empty({
  icon = 'leaf',
  sentence,
  sub,
}: {
  icon?: IconName | string;
  sentence: string;
  sub?: string;
}) {
  return (
    <div className="empty">
      <span className="big">
        <Icon name={icon} />
      </span>
      {sentence}
      {sub ? (
        <>
          <br />
          <span className="sub">{sub}</span>
        </>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- sections */

export function SecTitle({ children }: { children: ReactNode }) {
  return <div className="sec-title">{children}</div>;
}

/**
 * A number set in the data face. EVERY numeral in the app wears this — the serif
 * carries data, the sans carries prose, and that inversion is the design
 * system's signature.
 */
export function Num({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={`num ${className ?? ''}`}>{children}</span>;
}

/* ------------------------------------------------------------- DataTable */

/**
 * Tabular data is `.tablewrap > table.data` — the WRAPPER owns the horizontal
 * scroll, so a wide table never makes the page body scroll sideways.
 */
export function DataTable({
  head,
  children,
}: {
  head: ReactNode[];
  children: ReactNode;
}) {
  return (
    <div className="tablewrap">
      <table className="data">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------------- skeletons */

/** Holds the row's real height, so the page does not jump when data lands. */
export function SkeletonRows({ rows = 4, height = 64 }: { rows?: number; height?: number }) {
  return (
    <div className="list" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skel" style={{ height }} />
      ))}
    </div>
  );
}
