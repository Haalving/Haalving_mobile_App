'use client';

import { useState } from 'react';
import { validateProgram } from '@haalving/shared';

import { Icon } from '@/components/icons/Icon';
import { Notice, Num } from '@/components/ui';
import { useToast } from '@/components/ui';
import { useSetProgram, type ProgramShape } from '@/features/config/queries';

/**
 * The Program tab — seven stat tiles, each with a pencil.
 *
 * Ported from `programHtml` / `wireProgram` (console-config.js:101-199). The
 * tiles are the demo's, in its order, with its sub-lines.
 *
 * THE VALIDATION RUNS HERE AS WELL AS ON THE SERVER, from the SAME
 * `validateProgram` in `@haalving/shared` — so the sentence shown before saving
 * and the sentence returned by a refusal are the same string built by the same
 * function. Nothing is saved when it returns anything.
 */

const AUDIT_LINE =
  'Changes apply from each client’s next cycle — a mid-cycle change never retro-fails anyone.';

const READ_ONLY_LINE =
  'Read-only for your role. Editing the program shape needs Super Admin or Operations Head access.';

type TileKey =
  | 'levels'
  | 'cycleDays'
  | 'reviewDay'
  | 'restDays'
  | 'meetingDay'
  | 'sessions'
  | 'termDays';

interface TileDef {
  key: TileKey;
  label: string;
  display: (p: ProgramShape) => string;
  sub: string;
}

/** The demo's seven, in its order and with its words. */
const TILES: TileDef[] = [
  { key: 'levels', label: 'Levels', display: (p) => String(p.levels), sub: 'Each pillar climbs independently' },
  { key: 'cycleDays', label: 'Cycle length', display: (p) => `${p.cycleDays} days`, sub: 'Day 1 to Day 14' },
  { key: 'reviewDay', label: 'Level review', display: (p) => `Day ${p.reviewDay}`, sub: 'The only day levels move' },
  { key: 'restDays', label: 'Rest days', display: (p) => p.restDays.join(' & '), sub: 'Active rest — no sessions scheduled' },
  { key: 'meetingDay', label: 'Team meeting', display: (p) => `Day ${p.meetingDay}`, sub: 'Progress meeting closes the cycle' },
  {
    key: 'sessions',
    label: 'Sessions / cycle',
    display: (p) => `${p.sessions.fitness} + ${p.sessions.yoga} + ${p.sessions.mind}`,
    sub: 'Fitness + Yoga + Mind Wellness',
  },
  /* the SECOND clock — deliberately not tied to the programme's length. Seven
     levels of fourteen days is 98; a term is what the client paid for. */
  {
    key: 'termDays',
    label: 'Engagement term',
    display: (p) => `${p.termDays} days`,
    sub: 'What a client signs up for — not the programme',
  },
];

export function ProgramTab({ program, canEdit }: { program: ProgramShape; canEdit: boolean }) {
  const [editing, setEditing] = useState<TileKey | null>(null);
  const [draft, setDraft] = useState<ProgramShape>(program);
  const [error, setError] = useState('');
  const save = useSetProgram();
  const toast = useToast();

  const open = (key: TileKey) => {
    setDraft(program);
    setError('');
    setEditing(key);
  };

  const commit = () => {
    const sentence = validateProgram(draft);
    if (sentence) {
      /* nothing is saved — the demo's own contract, and the sentence says so */
      setError(sentence);
      return;
    }
    const { version: _v, ...shape } = draft;
    save.mutate(shape, {
      onSuccess: () => {
        setEditing(null);
        setError('');
        toast('Saved. It applies from each client’s next cycle.');
      },
      onError: (e) => setError((e as Error).message),
    });
  };

  const numInput = (value: number, onChange: (n: number) => void, label: string) => (
    <input
      className="input cfg-num num"
      type="number"
      value={Number.isNaN(value) ? '' : value}
      aria-label={label}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );

  return (
    <>
      {error ? (
        <div style={{ marginBottom: 'var(--s3)' }} role="alert">
          <Notice kind="bad">{error}</Notice>
        </div>
      ) : null}

      <div className="grid3">
        {TILES.map((t) => {
          const isEditing = editing === t.key;
          return (
            <div className="stat" key={t.key}>
              <div className="k">{t.label}</div>
              <div
                className="row"
                style={{
                  alignItems: 'baseline',
                  gap: 'var(--s2)',
                  flexWrap: 'nowrap',
                  marginTop: 'var(--s1)',
                }}
              >
                {isEditing ? (
                  <span className="row" style={{ gap: 'var(--s2)', flexWrap: 'wrap' }}>
                    {t.key === 'sessions' ? (
                      <>
                        {numInput(draft.sessions.fitness, (n) =>
                          setDraft({ ...draft, sessions: { ...draft.sessions, fitness: n } }), 'Fitness sessions')}
                        {numInput(draft.sessions.yoga, (n) =>
                          setDraft({ ...draft, sessions: { ...draft.sessions, yoga: n } }), 'Yoga sessions')}
                        {numInput(draft.sessions.mind, (n) =>
                          setDraft({ ...draft, sessions: { ...draft.sessions, mind: n } }), 'Mind Wellness sessions')}
                      </>
                    ) : t.key === 'restDays' ? (
                      /* a comma list, because rest days are a set and a set of
                         number inputs would fix how many there can be */
                      <input
                        className="input cfg-num num"
                        style={{ maxWidth: '9em' }}
                        value={draft.restDays.join(', ')}
                        aria-label="Rest days, comma separated"
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            restDays: e.target.value
                              .split(',')
                              .map((s) => Number(s.trim()))
                              .filter((n) => !Number.isNaN(n)),
                          })
                        }
                      />
                    ) : (
                      numInput(draft[t.key] as number, (n) => setDraft({ ...draft, [t.key]: n }), t.label)
                    )}
                  </span>
                ) : (
                  <div className="v num">{t.display(program)}</div>
                )}

                {canEdit && !isEditing ? (
                  <button
                    type="button"
                    className="btn sm ghost"
                    aria-label={`Edit ${t.label}`}
                    style={{ flex: 'none' }}
                    onClick={() => open(t.key)}
                  >
                    <Icon name="pencil" />
                  </button>
                ) : null}
              </div>

              {isEditing ? (
                <div className="row" style={{ gap: 'var(--s2)', marginTop: 'var(--s2)' }}>
                  <button type="button" className="btn sm" onClick={commit} disabled={save.isPending}>
                    Save
                  </button>
                  <button
                    type="button"
                    className="btn sm ghost"
                    onClick={() => {
                      setEditing(null);
                      setError('');
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="sub">{t.sub}</div>
              )}
            </div>
          );
        })}
      </div>

      <p className="audit" style={{ marginTop: 'var(--s3)' }}>
        {canEdit ? AUDIT_LINE : READ_ONLY_LINE}
      </p>

      <p className="sub" style={{ marginTop: 'var(--s2)' }}>
        Currently on shape version <Num>{program.version}</Num>.
      </p>
    </>
  );
}
