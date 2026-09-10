'use client';

import { useState, type ReactNode } from 'react';

import { Icon } from '@/components/icons/Icon';

/**
 * A FOLDED CHIP ROW — the pick, then a count of what is behind it.
 *
 * The fold the staff list introduced (people/StaffTab.tsx) and the Work list
 * and the Catalog's templates now share: one row per dimension, no heading
 * (the chips say what they are — "All pillars", "All levels"), and only the
 * chip you are standing on shown until asked. The filters are the exception
 * and the list is the point; every option laid out in bands pushed the rows
 * you came for below the fold.
 *
 * THE ONE YOU ARE STANDING ON IS ALWAYS SHOWN. Folding by position alone
 * would hide the active filter whenever it sat past the first chip — the list
 * would be narrowed by something invisible, the worst state a filter can be in.
 *
 * The handle sits at whichever end it is needed: closed, it follows the pick
 * and points on (`›`); open, it follows the last chip and points back (`‹`).
 */

/** How many chips stand before the row folds. */
const CHIP_FOLD = 1;

export interface FoldOpt {
  v: string;
  t: ReactNode;
}

export function FoldRow({
  label,
  opts,
  current,
  onPick,
  className,
}: {
  label: string;
  opts: FoldOpt[];
  current: string;
  onPick: (v: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const shown = open ? opts : opts.filter((o, i) => i < CHIP_FOLD || o.v === current);
  const hidden = opts.length - shown.length;
  return (
    <div className={`tfil pa2-fil${className ? ` ${className}` : ''}`} role="group" aria-label={label}>
      {shown.map((o) => {
        const on = o.v === current;
        return (
          <button
            type="button"
            key={o.v || 'all'}
            className={on ? 'on' : ''}
            aria-pressed={on}
            onClick={() => onPick(o.v)}
          >
            {o.t}
          </button>
        );
      })}
      {hidden > 0 && !open ? (
        <button
          type="button"
          className="pa2-more"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          aria-label={`Show ${hidden} more`}
          title={`Show ${hidden} more`}
        >
          <span className="num">{hidden}</span>
          <Icon name="chevR" />
        </button>
      ) : null}
      {open ? (
        <button
          type="button"
          className="pa2-more"
          onClick={() => setOpen(false)}
          aria-expanded
          aria-label="Show fewer"
          title="Show fewer"
        >
          <Icon name="chevL" />
        </button>
      ) : null}
    </div>
  );
}
