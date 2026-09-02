/**
 * WHAT MOVES A PILLAR UP — ported verbatim from `HV.levelup` (demo core.js:3013).
 *
 * A cycle's target for one pillar: the criteria, each ticked live where the app
 * can measure it. Pure — every input is passed in, nothing is read from a store —
 * so the backend can call it with `config.getReference()` content and the client's
 * own facts, and a test can pin the whole thing.
 *
 * `met` is a THREE-STATE flag, not a boolean: `true` ticked, `false` not yet, and
 * `null` for a gate the app cannot measure and the care team confirms at review
 * (the chart practised as written, the sleep band). `ticked` counts only the
 * `true`s, exactly as the demo's card does.
 */

import { pillarName, type PillarKey } from './pillars.js';

export interface LevelupRow {
  label: string;
  small: string;
  /** true met · false not yet · null the team confirms this one at review */
  met: boolean | null;
}

export interface Levelup {
  level: number;
  track: string;
  trackLabel: string;
  rows: LevelupRow[];
  goals: string[];
  note: string;
  ticked: number;
  total: number;
}

/** The client facts the derivation reads — the serialised subset, nothing more. */
export interface LevelupClient {
  observation?: boolean;
  levels?: Record<string, number> | null;
  track?: string | null;
  sessions?: Record<string, { done: number; target: number; cancelled?: number }> | null;
  culturePhotos?: { uploaded: number; of: number; min: number } | null;
  compliance?: number | null;
  /** last night's sleep, as the demo's `c.trackers.sleep` — display only */
  sleep?: string | null;
}

export interface CultureCriteria {
  gates: Array<{ key: string; label: string; target: string }>;
  tracks: Record<
    string,
    { label: string; levels: Record<string, { goals?: string[]; name?: string }> }
  >;
}

export interface BodyCriteria {
  bar: string;
  sessionBars: Record<string, string>;
  tracks: Record<string, { label: string; levels: Record<string, string[]> }>;
}

/** `program.wellness`, keyed by level: what the nightly practice and caps are. */
export type WellnessProgram = Record<
  string,
  { sleep?: string; screen?: string; practice?: string }
>;

export interface LevelupRefs {
  cultureCriteria: CultureCriteria;
  bodyCriteria: BodyCriteria;
  wellness: WellnessProgram;
  /** "Day-12" — from the shape's review day; the note reads it. */
  reviewWord: string;
}

/**
 * The level-up block for one pillar, or null when there is nothing to show:
 * an observation client (no ratings, no levels yet) or one with no session ledger.
 */
export function levelup(pillar: PillarKey, client: LevelupClient, refs: LevelupRefs): Levelup | null {
  if (!client || client.observation || !client.sessions) return null;

  const lvl = (client.levels && client.levels[pillar]) || 1;
  const track = client.track || 'sedentary';
  const rows: LevelupRow[] = [];
  let goals: string[] = [];
  let note = '';
  let trackLabel = track;

  if (pillar === 'culture') {
    const crit = refs.cultureCriteria;
    const tr = crit && (crit.tracks[track] || crit.tracks.sedentary);
    const def = tr ? (tr.levels[String(lvl)] ?? {}) : {};
    goals = def.goals ?? [];
    trackLabel = tr ? tr.label : track;
    for (const g of crit ? crit.gates : []) {
      if (g.key === 'photos') {
        const ph = client.culturePhotos;
        rows.push(
          ph
            ? {
                label: g.label,
                small: `${ph.uploaded} of ${ph.of} photos · min ${ph.min}`,
                met: ph.uploaded >= ph.min,
              }
            : { label: g.label, small: g.target, met: null },
        );
      } else if (g.key === 'diet') {
        rows.push({
          label: g.label,
          small: `${client.compliance == null ? '—' : `${client.compliance}%`} · target ${g.target}`,
          met: client.compliance != null && client.compliance >= 80,
        });
      } else {
        rows.push({ label: g.label, small: `target ${g.target}`, met: null });
      }
    }
    note =
      'Tick all five gates by day 9 and Nutrition moves up at your review — your care team confirms it together.';
  } else if (pillar === 'fitness' || pillar === 'yoga') {
    const crit = refs.bodyCriteria;
    const tr = crit && (crit.tracks[track] || crit.tracks.sedentary);
    goals = tr ? (tr.levels[String(lvl)] ?? []) : [];
    trackLabel = tr ? tr.label : track;
    const sess = client.sessions[pillar] ?? { done: 0, target: 0 };
    /* SOP: min 4 of 5 fitness; every yoga session */
    const bar = pillar === 'fitness' ? 4 : sess.target;
    const cancelled = sess.cancelled ?? 0;
    rows.push({
      label: 'Sessions this cycle',
      small: `${sess.done} of ${sess.target} · bar is ${crit.sessionBars[pillar]}`,
      met: sess.done >= bar,
    });
    rows.push({
      label: 'Cancellations kept low',
      small: `${cancelled} cancelled so far`,
      met: cancelled <= 1,
    });
    rows.push({ label: 'Chart practised as written', small: 'your trainer confirms at review', met: null });
    rows.push({ label: 'Level goals achieved', small: `target ${crit.bar}`, met: null });
    note = `Reach 75% of the level goals and ${pillarName(pillar)} moves up at the ${refs.reviewWord} review.`;
  } else if (pillar === 'wellness') {
    const w = refs.wellness ? refs.wellness[String(lvl)] : null;
    const mind = client.sessions.mind ?? { done: 0, target: 0 };
    trackLabel = 'Daily practice';
    rows.push({
      label: 'Mind session attended',
      small: `${mind.done} of ${mind.target} this cycle`,
      met: mind.done >= mind.target,
    });
    if (w) {
      rows.push({ label: 'Sleep in the 7–8 h band', small: `last night ${client.sleep || '—'}`, met: null });
      rows.push({ label: 'Screen time within your cap', small: `level cap ${w.screen}`, met: null });
      rows.push({ label: 'Daily practice held', small: w.practice ?? '', met: null });
    }
    note = `Your team reads the rhythm, not one night — held steady, Mind Wellness moves at the ${refs.reviewWord} review.`;
  } else {
    return null;
  }

  return {
    level: lvl,
    track,
    trackLabel,
    rows,
    goals,
    note,
    ticked: rows.filter((r) => r.met === true).length,
    total: rows.length,
  };
}
