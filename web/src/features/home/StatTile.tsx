'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * The stat tile — `goTile` in console-digest.js:96, ported.
 *
 * Markup is identical: `.stat` with `.k` / `.v.num` / `.sub`. The value wears
 * `num` because every numeral in the app is set in the serif data face, and the
 * tone class (`ok` / `warn` / `bad`) colours the READING, never the tile — a
 * coloured card would make the whole tile a status, which is not what it is.
 */
export function StatTile({
  k,
  value,
  sub,
  href,
  tone,
}: {
  k: string;
  value: ReactNode;
  sub: ReactNode;
  href?: string;
  tone?: 'ok' | 'warn' | 'bad';
}) {
  const router = useRouter();
  const body = (
    <>
      <div className="k">{k}</div>
      <div className={`v num${tone ? ` ${tone}` : ''}`}>{value}</div>
      <div className="sub">{sub}</div>
    </>
  );

  if (!href) return <div className="stat">{body}</div>;

  return (
    <button type="button" className="stat dg-go" onClick={() => router.push(href)}>
      {body}
    </button>
  );
}
