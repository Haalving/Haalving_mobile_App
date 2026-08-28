'use client';

import { useParams, useRouter } from 'next/navigation';
import { PILLARS, PILLAR_KEYS, ageOf, cycleDays, levels as maxLevels, termOf } from '@haalving/shared';

import { Avatar, Dial, Empty, Notice, Num, Pill, SecTitle, SkeletonRows, Tabs } from '@/components/ui';
import { Icon } from '@/components/icons/Icon';
import { PodSeats } from '@/features/clients/PodSeats';
import { useClient } from '@/features/clients/queries';

/**
 * The client record — ported from console-client-record.js.
 *
 * FOUR PILLAR DIALS AND NO FIFTH. There is no headline level: the four pillar
 * levels are the whole reading and nothing may reduce them to one number (TJ,
 * 16 Aug 2026 — the lowest-pillar rule is retired). A summary dial here would be
 * that retired rule in disguise, so this page deliberately has none.
 *
 * Each dial shows a pillar's LEVEL as a fraction of the seven, with the level
 * itself as the numeral. `color` names the pillar's own custom property — the
 * one place its colour is allowed to appear.
 *
 * The demo's record has ten tabs. Day 1 ports the OVERVIEW; the rest render the
 * demo's own empty state, with the tab bar drawn from the start so the page's
 * shape is settled.
 */

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'plan', label: 'Plan' },
  { key: 'circle', label: 'Circle' },
  { key: 'meals', label: 'Meals' },
  { key: 'vitals', label: 'Vital Panel' },
  { key: 'medical', label: 'Medical' },
  { key: 'sessions', label: 'Sessions' },
  { key: 'logs', label: 'Logs' },
];

export default function ClientRecordPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const { data: c, isLoading, isError, error, refetch } = useClient(id);

  if (isLoading) {
    return (
      <>
        <div className="skel" style={{ height: 92 }} />
        <SkeletonRows rows={4} height={72} />
      </>
    );
  }

  if (isError) {
    return (
      <Notice kind="bad">
        {(error as Error).message}
        <div className="retry">
          <button type="button" className="btn sm" onClick={() => void refetch()}>
            Try again
          </button>
          <button
            type="button"
            className="btn sm quiet"
            style={{ marginLeft: 'var(--s2)' }}
            onClick={() => router.push('/clients')}
          >
            Back to Clients
          </button>
        </div>
      </Notice>
    );
  }

  if (!c) return null;

  const term = termOf({
    term: { days: c.termDays, startISO: c.termStart ? c.termStart.slice(0, 10) : null },
    joinedISO: c.onboardedAt ? c.onboardedAt.slice(0, 10) : null,
  });
  const age = ageOf({ dob: c.dob ? c.dob.slice(0, 10) : null });

  return (
    <>
      <div className="h1-row">
        <div style={{ display: 'flex', gap: 'var(--s4)', alignItems: 'center' }}>
          <Avatar name={c.name} className="lg" />
          <div>
            <div className="kicker">{c.code ?? 'CLIENT'}</div>
            <h1 className="h1">{c.name}</h1>
            <div className="sub">
              {c.designation ? `${c.designation} · ` : ''}
              {age != null ? (
                <>
                  <Num>{age}</Num>
                  {' · '}
                </>
              ) : null}
              {c.location ?? '—'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 'var(--s2)', alignItems: 'center' }}>
          <Pill kind={c.plan === 'POORNA' ? 'info' : 'neutral'}>
            {c.tier ?? (c.plan === 'POORNA' ? 'HAALVING Poorna' : 'HAALVING Svayam')}
          </Pill>
          <Pill kind={c.status === 'active' ? 'ok' : c.status === 'paused' ? 'warn' : 'bad'}>
            {c.status[0]!.toUpperCase() + c.status.slice(1)}
          </Pill>
        </div>
      </div>

      {c.observation ? (
        <Notice>
          Days 1–5 are the observation window. We learn how {c.name.split(' ')[0]} already eats,
          moves and rests before we change a single thing — nothing is graded until day 6.
        </Notice>
      ) : null}

      <Tabs items={TABS} active="overview" onSelect={() => undefined} />

      {/* ── the two clocks, always LABELLED and never shown as one number.
             The programme runs 7 levels x 14 days = 98 days; the term is 90.
             A client mid-level with two weeks of term left is an ordinary
             state, not an error. */}
      <div className="grid3">
        <div className="stat">
          <div className="k">CYCLE</div>
          <div className="v num">{c.observation ? c.cycleDay : c.cycle}</div>
          <div className="sub">
            {c.observation ? (
              'observation day, before level 1'
            ) : (
              <>
                day <Num>{c.cycleDay}</Num> of <Num>{cycleDays()}</Num>
              </>
            )}
          </div>
        </div>
        <div className="stat">
          <div className="k">TERM</div>
          <div className="v num">{term.left}</div>
          <div className="sub">
            days left of <Num>{term.days}</Num> — the engagement clock, not the programme
          </div>
        </div>
        <div className="stat">
          <div className="k">TRACK</div>
          <div className="v" style={{ fontSize: 22 }}>
            {c.track[0]!.toUpperCase() + c.track.slice(1)}
          </div>
          <div className="sub">indexes the level books and the review criteria</div>
        </div>
      </div>

      <SecTitle>The four pillars</SecTitle>
      <div className="card">
        <div
          style={{
            display: 'flex',
            gap: 'var(--s5)',
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          {PILLAR_KEYS.map((k) => {
            const level = c.levels[k] ?? 1;
            return (
              <Dial
                key={k}
                /* the level as a share of the seven — the arc is the journey,
                   the numeral is where they stand on it */
                pct={(level / maxLevels()) * 100}
                value={`L${level}`}
                suffix=""
                label={PILLARS[k].name}
                color={k}
              />
            );
          })}
        </div>
        <div className="audit" style={{ marginTop: 'var(--s4)', textAlign: 'center' }}>
          Levels move only at the Day-12 review, and each pillar moves on its own. There is no
          overall level — these four are the whole reading.
        </div>
      </div>

      <SecTitle>Care circle</SecTitle>
      <PodSeats client={c} />

      {c.goal || c.purpose ? (
        <>
          <SecTitle>What they came for</SecTitle>
          <div className="card">
            {c.goal ? (
              <p style={{ margin: 0 }}>
                <b>Goal</b> — {c.goal}
              </p>
            ) : null}
            {c.purpose ? (
              <p style={{ marginBottom: 0 }}>
                <b>Why</b> — {c.purpose}
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      {c.health.length ? (
        <>
          <SecTitle>Flagged by the doctor</SecTitle>
          <div className="card">
            {c.health.map((h) => (
              <div key={h} className="trow">
                <span className="grow" style={{ flex: 1, minWidth: 0 }}>
                  <b>{h}</b>
                </span>
                <Icon name="warn" style={{ width: 18, height: 18, color: 'var(--amber)' }} />
              </div>
            ))}
            <div className="audit">
              The pod sees this summary. The raw record stops at the Doctor&rsquo;s desk.
            </div>
          </div>
        </>
      ) : null}

      <SecTitle>The rest of the record</SecTitle>
      <div className="card">
        <Empty
          icon="doc"
          sentence="Plan, Circle, Meals, the Vital Panel and the Logs land on their own days."
          sub="The tabs above are the record's shape — each fills in as its board is built."
        />
      </div>
    </>
  );
}
