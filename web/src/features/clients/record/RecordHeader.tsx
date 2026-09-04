'use client';

import type * as React from 'react';
import { termOf, upcomingCelebrations } from '@haalving/shared';

import { Avatar, Num, Pill, SessionRings } from '@/components/ui';
import { Icon } from '@/components/icons/Icon';
import type { ClientDetail } from '@/features/clients/queries';

/**
 * The record header — ported from console-clients.js `headHtml`.
 *
 * TWO CLOCKS, BOTH ALWAYS LABELLED. The programme runs in cycles and days; the
 * TERM is what the client has paid for. "Cycle 3 · Day 6" and "55 days left of
 * 90" are both true at once and would read as a contradiction if either stood
 * alone — so neither ever shows a bare figure, and the bar carries its own
 * length beside the number.
 *
 * THE CLIENT'S NAME IS THE PAGE'S h1. The open client IS the route, so their
 * name carries the heading — wearing the header's type rather than an h1's, so
 * nothing moves when a record opens.
 */

/**
 * When a celebration falls, in the words the strip uses — `celWhen`
 * (console-clients.js:191). "today" and "tomorrow" are named; anything else
 * inside the week is its weekday, because "in 3 d" makes somebody count.
 */
const DAY_NAME = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function celWhen(inDays: number, dateISO: string): React.ReactNode {
  if (inDays === 0) return 'today';
  if (inDays === 1) return 'tomorrow';
  if (inDays < 7) {
    const [y, m, d] = dateISO.split('-').map(Number);
    return DAY_NAME[new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).getDay()] ?? '';
  }
  return (
    <>
      in <Num>{inDays}</Num> d
    </>
  );
}

/** The demo's own tone thresholds: red once ended, amber inside a fortnight. */
function termTone(left: number, ended: boolean): 'ok' | 'warn' | 'bad' {
  if (ended) return 'bad';
  return left <= 14 ? 'warn' : 'ok';
}

function TermBar({ c }: { c: ClientDetail }) {
  const t = termOf({
    term: { days: c.termDays, startISO: c.termStart ? c.termStart.slice(0, 10) : undefined },
    joinedISO: c.onboardedAt ? c.onboardedAt.slice(0, 10) : undefined,
  });
  const tone = termTone(t.left, t.ended);

  return (
    <span
      className={`ctermb ${tone}`}
      title={`Engagement term — ends ${t.endISO}`}
    >
      <span className="ctbar">
        <i style={{ width: `${t.pct}%` }} />
      </span>
      <small>
        {t.ended ? (
          <>
            Term ended <Num>{Math.abs(t.left)}</Num> d ago
          </>
        ) : (
          <>
            <Num>{t.left}</Num> days left of <Num>{t.days}</Num>
          </>
        )}
      </small>
    </span>
  );
}

/** 'medium' reads as "Gentle watch" — the demo's word, not the stored key. */
const RISK_WORD: Record<string, string> = {
  low: 'Steady',
  medium: 'Gentle watch',
  high: 'Needs extra care',
};

export function RecordHeader({
  c,
  onBack,
  clientVisible,
}: {
  c: ClientDetail;
  onBack: () => void;
  clientVisible: boolean;
}) {
  /* the celebration strip — birthdays AND anniversaries, within a week */
  const cels = upcomingCelebrations(
    [{ clientId: c.id, dob: c.dob ?? null, anniv: c.anniv ?? null }],
    7,
  );

  return (
    <header className="cchead">
      <button type="button" className="btn sm ghost cwback" onClick={onBack} aria-label="Back to all clients">
        <Icon name="chevL" />
        {/* the word, not only the arrow — a lone chevron in a header is read as
            decoration as often as it is read as a way out */}
        <span className="cwback-label">All clients</span>
      </button>
      <Avatar name={c.name} />
      <span className="grow">
        <h1 className="ccname">{c.name}</h1>
        <small>
          {c.tier ?? (c.plan === 'SVAYAM' ? 'HAALVING Svayam' : 'HAALVING Poorna')} ·{' '}
          {c.observation ? (
            <>
              Observation · <Num>Day {c.cycleDay}</Num>
            </>
          ) : (
            <>
              Cycle <Num>{c.cycle}</Num> · <Num>Day {c.cycleDay}</Num>
            </>
          )}
        </small>
      </span>

      <TermBar c={c} />

      {/* an observation client has no session ledger to read yet — days 1–5 are
          for learning, and rings over nothing would invent a target */}
      {!c.observation && c.sessions ? (
        <span className="row" style={{ gap: 'var(--s2)', alignItems: 'center' }}>
          <SessionRings sessions={c.sessions} size="sm" />
        </span>
      ) : null}

      <Pill kind="neutral">{c.plan === 'SVAYAM' ? 'Svayam' : 'Poorna'}</Pill>

      {/* the watch chip and the sentence behind it travel together */}
      {c.risk && c.risk !== 'low' ? (
        <span title={c.riskWhy ?? undefined}>
          <Pill kind={c.risk === 'high' ? 'bad' : 'warn'}>{RISK_WORD[c.risk] ?? c.risk}</Pill>
        </span>
      ) : null}

      {cels.map((cel) => (
        <span className="c360-cel" key={`${cel.kind}-${cel.dateISO}`}>
          <Icon name="award" />
          {cel.kind === 'birthday' ? 'Birthday' : 'Anniversary'} ·{' '}
          {celWhen(cel.inDays, cel.dateISO)}
        </span>
      ))}

      {/* the Circle tab is the one surface the client also reads, and the header
          says so rather than leaving it to be remembered */}
      {clientVisible ? <Pill kind="ok">Client-visible</Pill> : null}
    </header>
  );
}
