'use client';

import type * as React from 'react';
import { PILLARS, PILLAR_KEYS, ageOf, termOf } from '@haalving/shared';

import { Audit, Avatar, Empty, Notice, Num, Pill, SecTitle } from '@/components/ui';
import { Icon } from '@/components/icons/Icon';
import { PodSeats } from '@/features/clients/PodSeats';
import type { ClientDetail } from '@/features/clients/queries';

/**
 * Overview — the cover sheet.
 *
 * Ported from console-client-record.js `profileHtml` / `termCard` and
 * console-clients.js `overviewHtml`, in the order the client asked for:
 * Profile, Goal, Team, Medical, then the programme's own cards.
 *
 * AN EMPTY FIELD PRINTS AN EM DASH, NEVER "null". A record that says "null" has
 * told the reader nothing and looks broken doing it — so every value goes
 * through `Row`, which decides that once.
 *
 * AGE IS DERIVED FROM `dob` AND NEVER TYPED. Two fields that must agree are one
 * field and a function; storing both is storing a future contradiction.
 */

function Row({
  label,
  value,
  extra,
}: {
  label: string;
  value: React.ReactNode;
  extra?: React.ReactNode;
}) {
  const empty = value === null || value === undefined || value === '';
  return (
    <div className="crrow">
      <small>{label}</small>
      <b>{empty ? <span className="pdim">—</span> : value}</b>
      {extra}
    </div>
  );
}

/** 12 Jun 2026 — a date a person reads, from an ISO one. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function niceDate(iso: string | null | undefined): React.ReactNode {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return (
    <>
      <Num>{d}</Num> {MONTHS[m - 1]} <Num>{y}</Num>
    </>
  );
}

/**
 * The demo's own three words (console-client-record.js:18).
 *
 * PRONOUNS ARE NOT GENDER and are not in this map: they live on `address`, which
 * the demo appends beside the word. Folding "he/him" into "Male" would print it
 * twice for anybody who has both, and would make the pronoun unremovable without
 * also changing the gender.
 */
const GENDER: Record<string, string> = { M: 'Male', F: 'Female', X: 'Other' };

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'neutral'> = {
  active: 'ok',
  paused: 'warn',
  inactive: 'neutral',
};

function ProfileCard({ c }: { c: ClientDetail }) {
  const gender = (c.gender && GENDER[c.gender]) || (c.sex && GENDER[c.sex]) || null;
  const age = ageOf({ dob: c.dob ?? null });

  return (
    <div className="card">
      <div className="crhead">
        <Avatar name={c.name} />
        <div className="grow">
          <h2 className="crname">{c.name}</h2>
          <small>
            {c.designation ?? 'Client'}
            {c.location ? ` · ${c.location}` : ''}
          </small>
        </div>
      </div>

      <div className="crgrid">
        <Row label="Client id" value={c.code} />
        <Row label="Name" value={c.name} />
        <Row label="Designation" value={c.designation} />
        <Row
          label="Gender"
          value={
            gender ? (
              <>
                {gender}
                {c.address ? <span className="sub"> · {c.address}</span> : null}
              </>
            ) : null
          }
        />
        <Row label="Date of birth" value={niceDate(c.dob)} />
        {/* derived, never typed */}
        <Row label="Age" value={age == null ? null : <Num>{age}</Num>} />
        <Row label="Joining date" value={niceDate(c.onboardedAt ?? c.createdAt)} />
        <Row label="Height" value={c.heightCm ? <><Num>{c.heightCm}</Num> cm</> : null} />
        <Row label="Weight" value={c.weightKg ? <><Num>{c.weightKg}</Num> kg</> : null} />
        <Row label="Location" value={c.location} />
        <Row label="Plan" value={c.tier ?? (c.plan === 'SVAYAM' ? 'HAALVING Svayam' : 'HAALVING Poorna')} />
        <Row
          label="Status"
          value={<Pill kind={STATUS_TONE[c.status] ?? 'neutral'}>{c.status}</Pill>}
          extra={c.statusWhy ? <div className="audit">{c.statusWhy}</div> : undefined}
        />
      </div>

      <div className="crgrid">
        <Row
          label="Email"
          value={c.email}
          extra={
            <span className="crvf">
              {c.email ? (
                <span className="crok">
                  <Icon name="check" />
                  Verified
                </span>
              ) : null}
            </span>
          }
        />
        <Row
          label="Mobile"
          value={c.phone}
          extra={
            <span className="crvf">
              {c.phone ? (
                <span className="crok">
                  <Icon name="check" />
                  Verified
                </span>
              ) : null}
            </span>
          }
        />
      </div>

      <Audit>
        Internal id {c.id} · joined{' '}
        {niceDate(c.onboardedAt ?? c.createdAt) ?? '—'}
      </Audit>
    </div>
  );
}

/** The term as its own card — the same second clock the header carries slim. */
function TermCard({ c }: { c: ClientDetail }) {
  const t = termOf({
    term: { days: c.termDays, startISO: c.termStart ? c.termStart.slice(0, 10) : undefined },
    joinedISO: c.onboardedAt ? c.onboardedAt.slice(0, 10) : undefined,
  });
  const tone = t.ended ? 'bad' : t.left <= 14 ? 'warn' : 'ok';

  return (
    <div className="card">
      <SecTitle>Engagement term</SecTitle>
      <div className={`crterm ${tone}`}>
        <b>
          {t.ended ? (
            <>
              Ended <Num>{Math.abs(t.left)}</Num> d ago
            </>
          ) : (
            <>
              <Num>{t.left}</Num> days left
            </>
          )}
        </b>
        <span className="ctbar">
          <i style={{ width: `${t.pct}%` }} />
        </span>
        <b>
          of <Num>{t.days}</Num>
        </b>
      </div>
      <Audit>
        Ends {t.endISO} — the term is what the client has paid for, and runs on its own clock
        beside the programme&rsquo;s cycles.
      </Audit>
    </div>
  );
}

function GoalCard({ c }: { c: ClientDetail }) {
  if (!c.goal && !c.purpose) return null;
  return (
    <div className="card">
      <SecTitle>Goal</SecTitle>
      {c.goal ? <p>{c.goal}</p> : null}
      {c.purpose ? (
        <>
          <div className="k" style={{ marginTop: 'var(--s3)' }}>
            Why it matters to them
          </div>
          <p className="sub">{c.purpose}</p>
        </>
      ) : null}
    </div>
  );
}

function LevelsCard({ c }: { c: ClientDetail }) {
  return (
    <div className="card">
      <SecTitle>Levels</SecTitle>
      {/* FOUR PILLAR LEVELS AND NO FIFTH. There is no headline level: the four
          are the whole reading, and a summary number here would be the retired
          lowest-pillar rule in disguise. */}
      <div className="grid2">
        {PILLAR_KEYS.map((k) => (
          <div className={`stat p-${k}`} key={k}>
            <div className="k">{PILLARS[k].name}</div>
            <div className="v num" style={{ color: 'var(--pcd)' }}>
              L{c.levels[k] ?? 1}
            </div>
          </div>
        ))}
      </div>
      {c.compliance != null ? (
        <Audit>
          <Num>{c.compliance}</Num>% of the plan kept last cycle
        </Audit>
      ) : (
        <Audit>Observation — nothing to comply with yet.</Audit>
      )}
    </div>
  );
}

function HealthCard({ c }: { c: ClientDetail }) {
  return (
    <div className="card">
      <SecTitle>Medical details</SecTitle>
      {c.health.length ? (
        <ul className="catsteps">
          {c.health.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      ) : (
        <Empty icon="heart" sentence="Nothing flagged at intake." />
      )}
      <Notice>
        The signed Health Summary is what the pod reads. Raw records are the doctor&rsquo;s alone
        and every open is logged — they are on the Documents tab, not here.
      </Notice>
    </div>
  );
}

export function OverviewTab({ c }: { c: ClientDetail }) {
  return (
    <div className="ccscroll">
      <ProfileCard c={c} />
      <TermCard c={c} />
      <GoalCard c={c} />

      <div className="card">
        <SecTitle>Care team</SecTitle>
        <PodSeats client={c} />
      </div>

      <LevelsCard c={c} />
      <HealthCard c={c} />
    </div>
  );
}
