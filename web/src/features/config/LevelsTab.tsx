'use client';

import { useState } from 'react';
import type { BodyCriteria, CultureCriteria, WellnessProgram } from '@haalving/shared';

import { Audit, Notice, Pill, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { useSetLevels, type LevelCriteriaSet, type LevelKey } from '@/features/config/queries';

/**
 * THE LEVEL-UP RULES — what it takes to move up a level, per rulebook.
 *
 * Three rulebooks, each its own card: Fuel (the five gates and the level goals
 * per track), Power & Flow (the session bars and the level goals per track,
 * shared by both body pillars as on the paper calendar) and Peace (sleep,
 * screen and practice per level). The phone's Level-up targets read exactly
 * these; a rulebook nobody has written shows nothing there, on purpose — the
 * app must not present the demo's rulebook as this programme's.
 *
 * Editing is inline, one rulebook at a time. "Fill from the Haalving rulebook"
 * loads the paper programme as captured in the reference file INTO THE FORM,
 * nothing more — it is saved only when the editor saves it.
 */

const TRACKS: Array<[string, string]> = [
  ['sedentary', 'Sedentary'],
  ['moderate', 'Moderately Active'],
  ['active', 'Active'],
];

/* the gate KEYS are load-bearing — `photos` reads the photo count and `diet`
   the compliance figure on the phone — so the keys are fixed and the words are
   the editor's */
const GATE_KEYS: Array<[string, string]> = [
  ['goals', 'the level goals'],
  ['diet', 'diet-plan compliance (read from meals on plan)'],
  ['group', 'group participation'],
  ['photos', 'food photos (read from the photo count)'],
  ['calpro', 'calorie & protein targets'],
];

const NAME: Record<LevelKey, string> = {
  culture: 'Fuel: Nutrition Biohack',
  body: 'Power: Fitness Biohack & Flow: Yoga Biohack',
  wellness: 'Peace: Mind Biohack',
};

type Goals = Record<string, string>; // track -> level -> "one goal per line" (flattened key `${track}:${level}`)

interface CultureDraft {
  gates: Array<{ key: string; label: string; target: string }>;
  goals: Goals;
}
interface BodyDraft {
  bar: string;
  fitnessBar: string;
  yogaBar: string;
  goals: Goals;
}
type WellnessDraft = Record<string, { sleep: string; screen: string; practice: string }>;

const gk = (track: string, level: number) => `${track}:${level}`;
const lines = (s: string) =>
  s
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);

/* ---------------------------------------------------------- draft <-> body */

function cultureDraft(c: CultureCriteria | null, levels: number): CultureDraft {
  const gates = GATE_KEYS.map(([key]) => {
    const g = c?.gates.find((x) => x.key === key);
    return { key, label: g?.label ?? '', target: g?.target ?? '' };
  });
  const goals: Goals = {};
  for (const [track] of TRACKS) {
    for (let l = 1; l <= levels; l += 1) {
      goals[gk(track, l)] = (c?.tracks[track]?.levels[String(l)]?.goals ?? []).join('\n');
    }
  }
  return { gates, goals };
}

function cultureBody(d: CultureDraft, levels: number): CultureCriteria {
  const tracks: CultureCriteria['tracks'] = {};
  for (const [track, label] of TRACKS) {
    const lv: Record<string, { goals: string[] }> = {};
    for (let l = 1; l <= levels; l += 1) lv[String(l)] = { goals: lines(d.goals[gk(track, l)] ?? '') };
    tracks[track] = { label, levels: lv };
  }
  return {
    gates: d.gates.filter((g) => g.label.trim() && g.target.trim()).map((g) => ({ key: g.key, label: g.label.trim(), target: g.target.trim() })),
    tracks,
  };
}

function bodyDraft(b: BodyCriteria | null, levels: number): BodyDraft {
  const goals: Goals = {};
  for (const [track] of TRACKS) {
    for (let l = 1; l <= levels; l += 1) goals[gk(track, l)] = (b?.tracks[track]?.levels[String(l)] ?? []).join('\n');
  }
  return { bar: b?.bar ?? '', fitnessBar: b?.sessionBars.fitness ?? '', yogaBar: b?.sessionBars.yoga ?? '', goals };
}

function bodyBody(d: BodyDraft, levels: number): BodyCriteria {
  const tracks: BodyCriteria['tracks'] = {};
  for (const [track, label] of TRACKS) {
    const lv: Record<string, string[]> = {};
    for (let l = 1; l <= levels; l += 1) lv[String(l)] = lines(d.goals[gk(track, l)] ?? '');
    tracks[track] = { label, levels: lv };
  }
  return { bar: d.bar.trim(), sessionBars: { fitness: d.fitnessBar.trim(), yoga: d.yogaBar.trim() }, tracks };
}

function wellnessDraft(w: WellnessProgram | null, levels: number): WellnessDraft {
  const d: WellnessDraft = {};
  for (let l = 1; l <= levels; l += 1) {
    const row = w?.[String(l)];
    d[String(l)] = { sleep: row?.sleep ?? '', screen: row?.screen ?? '', practice: row?.practice ?? '' };
  }
  return d;
}

function wellnessBody(d: WellnessDraft): WellnessProgram {
  const out: WellnessProgram = {};
  for (const [l, row] of Object.entries(d)) {
    const sleep = row.sleep.trim();
    const screen = row.screen.trim();
    const practice = row.practice.trim();
    if (sleep || screen || practice) out[l] = { ...(sleep ? { sleep } : {}), ...(screen ? { screen } : {}), ...(practice ? { practice } : {}) };
  }
  return out;
}

/* ------------------------------------------------------------------- tab */

export function LevelsTab({ levels, program, canEdit }: { levels: LevelCriteriaSet; program: { levels: number }; canEdit: boolean }) {
  const [editing, setEditing] = useState<LevelKey | null>(null);
  const [track, setTrack] = useState<string>('sedentary');
  const [culture, setCulture] = useState<CultureDraft>(() => cultureDraft(levels.culture, program.levels));
  const [body, setBody] = useState<BodyDraft>(() => bodyDraft(levels.body, program.levels));
  const [wellness, setWellness] = useState<WellnessDraft>(() => wellnessDraft(levels.wellness, program.levels));
  const [error, setError] = useState('');
  const [loadingBook, setLoadingBook] = useState(false);
  const save = useSetLevels();
  const toast = useToast();
  const n = program.levels;

  /* a level row that has not been touched yet is filled in whole, so a partial
     edit never leaves a field undefined */
  const setWell = (l: string, part: Partial<WellnessDraft[string]>) =>
    setWellness((w) => ({ ...w, [l]: { sleep: '', screen: '', practice: '', ...w[l], ...part } }));

  const open = (key: LevelKey) => {
    setError('');
    if (key === 'culture') setCulture(cultureDraft(levels.culture, n));
    if (key === 'body') setBody(bodyDraft(levels.body, n));
    if (key === 'wellness') setWellness(wellnessDraft(levels.wellness, n));
    setEditing(key);
  };

  const commit = (key: LevelKey) => {
    setError('');
    const payload =
      key === 'culture'
        ? { key, body: cultureBody(culture, n) }
        : key === 'body'
          ? { key, body: bodyBody(body, n) }
          : { key, body: wellnessBody(wellness) };
    save.mutate(payload, {
      onSuccess: () => {
        setEditing(null);
        toast('Saved. The phone reads it on its next plan load.');
      },
      onError: (e) => setError((e as Error).message),
    });
  };

  /* the paper rulebook, into the form only */
  const fill = async (key: LevelKey) => {
    setLoadingBook(true);
    setError('');
    try {
      const book = await api.get<{ culture: CultureCriteria; body: BodyCriteria; wellness: WellnessProgram }>('/config/levels/rulebook');
      if (key === 'culture') setCulture(cultureDraft(book.culture, n));
      if (key === 'body') setBody(bodyDraft(book.body, n));
      if (key === 'wellness') setWellness(wellnessDraft(book.wellness, n));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingBook(false);
    }
  };

  const head = (key: LevelKey) => {
    const w = levels.written[key];
    return (
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--s3)' }}>
        <div>
          <div className="sec-title">{NAME[key]}</div>
          <div className="sub" style={{ marginTop: 'var(--s1)' }}>
            {w ? (
              <>
                Written by {w.by ?? 'someone no longer on staff'} ·{' '}
                {new Date(w.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </>
            ) : (
              <Pill kind="warn">Not written yet — the phone shows nothing for this pillar</Pill>
            )}
          </div>
        </div>
        {canEdit && editing !== key ? (
          <button type="button" className="btn sm ghost" onClick={() => open(key)}>
            {w ? 'Edit' : 'Write'}
          </button>
        ) : null}
      </div>
    );
  };

  const editorActs = (key: LevelKey) => (
    <div className="row" style={{ justifyContent: 'space-between', marginTop: 'var(--s3)', flexWrap: 'wrap', gap: 'var(--s2)' }}>
      <button type="button" className="btn sm quiet" disabled={loadingBook} onClick={() => void fill(key)}>
        {loadingBook ? 'Loading…' : 'Fill from the Haalving rulebook'}
      </button>
      <div className="row" style={{ gap: 'var(--s2)' }}>
        <button type="button" className="btn sm ghost" onClick={() => setEditing(null)}>
          Cancel
        </button>
        <button type="button" className="btn sm" disabled={save.isPending} onClick={() => commit(key)}>
          Save
        </button>
      </div>
    </div>
  );

  const trackChips = (
    <div className="row" style={{ gap: 'var(--s2)', margin: 'var(--s3) 0 var(--s2)', flexWrap: 'wrap' }}>
      {TRACKS.map(([k, label]) => (
        <button key={k} type="button" className={`chip${track === k ? ' on' : ''}`} onClick={() => setTrack(k)}>
          {label}
        </button>
      ))}
    </div>
  );

  const goalsEditor = (goals: Goals, onChange: (next: Goals) => void) => (
    <div className="lv-grid">
      {Array.from({ length: n }, (_, i) => i + 1).map((l) => (
        <div key={l} className="lv-row">
          <div className="num">L{l}</div>
          <textarea
            className="input lv-ta"
            aria-label={`${track} level ${l} goals`}
            placeholder="One goal per line"
            value={goals[gk(track, l)] ?? ''}
            onChange={(e) => onChange({ ...goals, [gk(track, l)]: e.target.value })}
          />
        </div>
      ))}
    </div>
  );

  const goalsRead = (get: (track: string, level: number) => string[]) => (
    <table className="c360-ledger">
      <thead>
        <tr>
          <th>Level</th>
          <th>Goals</th>
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: n }, (_, i) => i + 1).map((l) => {
          const g = get(track, l);
          return (
            <tr key={l}>
              <td className="num">L{l}</td>
              <td>{g.length ? g.join(' · ') : <span className="sub">—</span>}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <>
      {error ? (
        <div style={{ marginBottom: 'var(--s3)' }} role="alert">
          <Notice kind="bad">{error}</Notice>
        </div>
      ) : null}

      {/* ---------------------------------------------------------- Fuel */}
      <div className="card">
        {head('culture')}
        {editing === 'culture' ? (
          <>
            <div className="k" style={{ marginTop: 'var(--s3)' }}>
              The gates — all must be ticked for Fuel to move
            </div>
            <div className="lv-gates">
              {culture.gates.map((g, i) => {
                const hint = GATE_KEYS.find(([k]) => k === g.key)?.[1] ?? g.key;
                return (
                  <div key={g.key} className="lv-gate">
                    <div className="sub">{hint}</div>
                    <input
                      className="input"
                      aria-label={`${g.key} gate label`}
                      placeholder="Gate"
                      value={g.label}
                      onChange={(e) => setCulture({ ...culture, gates: culture.gates.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
                    />
                    <input
                      className="input"
                      aria-label={`${g.key} gate target`}
                      placeholder="Target"
                      value={g.target}
                      onChange={(e) => setCulture({ ...culture, gates: culture.gates.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)) })}
                    />
                  </div>
                );
              })}
            </div>
            <div className="k" style={{ marginTop: 'var(--s3)' }}>
              Level goals, per track
            </div>
            {trackChips}
            {goalsEditor(culture.goals, (goals) => setCulture({ ...culture, goals }))}
            {editorActs('culture')}
          </>
        ) : levels.culture ? (
          <>
            <div className="lv-gates" style={{ marginTop: 'var(--s3)' }}>
              {levels.culture.gates.map((g) => (
                <div key={g.key} className="lv-gate read">
                  <div className="sub">{g.key}</div>
                  <div>{g.label}</div>
                  <div className="num">{g.target}</div>
                </div>
              ))}
            </div>
            {trackChips}
            {goalsRead((t, l) => levels.culture?.tracks[t]?.levels[String(l)]?.goals ?? [])}
          </>
        ) : null}
      </div>

      {/* --------------------------------------------------- Power & Flow */}
      <div className="card">
        {head('body')}
        {editing === 'body' ? (
          <>
            <div className="lv-bars">
              <label className="field-label" htmlFor="lv-bar">
                Level goals bar
              </label>
              <input id="lv-bar" className="input" placeholder="e.g. ≥ 75% of level goals" value={body.bar} onChange={(e) => setBody({ ...body, bar: e.target.value })} />
              <label className="field-label" htmlFor="lv-fit">
                Power sessions bar
              </label>
              <input id="lv-fit" className="input" placeholder="e.g. min 4 of 5" value={body.fitnessBar} onChange={(e) => setBody({ ...body, fitnessBar: e.target.value })} />
              <label className="field-label" htmlFor="lv-yoga">
                Flow sessions bar
              </label>
              <input id="lv-yoga" className="input" placeholder="e.g. 3 of 3" value={body.yogaBar} onChange={(e) => setBody({ ...body, yogaBar: e.target.value })} />
            </div>
            <div className="k" style={{ marginTop: 'var(--s3)' }}>
              Level goals, per track
            </div>
            {trackChips}
            {goalsEditor(body.goals, (goals) => setBody({ ...body, goals }))}
            {editorActs('body')}
          </>
        ) : levels.body ? (
          <>
            <div className="row" style={{ gap: 'var(--s2)', marginTop: 'var(--s3)', flexWrap: 'wrap' }}>
              <Pill kind="neutral">Goals · {levels.body.bar}</Pill>
              <Pill kind="neutral">Power · {levels.body.sessionBars.fitness ?? '—'} sessions</Pill>
              <Pill kind="neutral">Flow · {levels.body.sessionBars.yoga ?? '—'} sessions</Pill>
            </div>
            {trackChips}
            {goalsRead((t, l) => levels.body?.tracks[t]?.levels[String(l)] ?? [])}
          </>
        ) : null}
      </div>

      {/* ---------------------------------------------------------- Peace */}
      <div className="card">
        {head('wellness')}
        {editing === 'wellness' ? (
          <>
            <div className="lv-well" style={{ marginTop: 'var(--s3)' }}>
              <div className="k">Level</div>
              <div className="k">Sleep</div>
              <div className="k">Screen cap</div>
              <div className="k">Daily practice</div>
              {Array.from({ length: n }, (_, i) => String(i + 1)).map((l) => (
                <div key={l} className="lv-well-row">
                  <div className="num">L{l}</div>
                  <input className="input" aria-label={`level ${l} sleep`} placeholder="7–8 h" value={wellness[l]?.sleep ?? ''} onChange={(e) => setWell(l, { sleep: e.target.value })} />
                  <input className="input" aria-label={`level ${l} screen cap`} placeholder="2 h" value={wellness[l]?.screen ?? ''} onChange={(e) => setWell(l, { screen: e.target.value })} />
                  <input className="input" aria-label={`level ${l} practice`} placeholder="What the level practises" value={wellness[l]?.practice ?? ''} onChange={(e) => setWell(l, { practice: e.target.value })} />
                </div>
              ))}
            </div>
            {editorActs('wellness')}
          </>
        ) : levels.wellness ? (
          <table className="c360-ledger">
            <thead>
              <tr>
                <th>Level</th>
                <th>Sleep</th>
                <th>Screen cap</th>
                <th>Daily practice</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: n }, (_, i) => String(i + 1)).map((l) => {
                const w = levels.wellness?.[l];
                return (
                  <tr key={l}>
                    <td className="num">L{l}</td>
                    <td>{w?.sleep ?? '—'}</td>
                    <td>{w?.screen ?? '—'}</td>
                    <td>{w?.practice ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </div>

      <Audit>
        {canEdit
          ? 'A saved rulebook is live at once — every client’s Level-up targets read it on their next plan load. Nothing is pre-filled in production; "Fill from the Haalving rulebook" only loads the paper programme into the form.'
          : 'Read-only for your role. Writing the level-up rules needs Super Admin or Operations Head access.'}
      </Audit>
    </>
  );
}
