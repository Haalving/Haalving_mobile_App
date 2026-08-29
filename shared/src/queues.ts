import type { ChainStep } from './chains.js';

/**
 * Work Queues — the pure rules the console, the API and the tests all read.
 *
 * Three things live here and nothing else: which boards exist and in what order,
 * how long a plate has left against the SLA ladder, and how far down a chain an
 * approval has walked. All three are asked in more than one place — the board
 * draws a pill, the service decides a refusal, a test moves the clock — and a
 * second copy of any of them is how a console and its server come to disagree
 * about whether something is late or whose signature is next.
 */

/* --------------------------------------------------------------- the boards */

/**
 * The six boards, IN THE HOST'S OWN ORDER (console-queues.js:10).
 *
 * The order is not cosmetic: the tab bar is drawn from it, and the first board a
 * caller may see is the one they land on. A role with no permitted board never
 * reaches the screen at all.
 */
export const QUEUE_BOARDS = [
  'work',
  'approvals',
  'meals',
  'medical',
  'deviations',
  'live',
] as const;

export type QueueBoard = (typeof QUEUE_BOARDS)[number];

/** The demo's own tab labels, verbatim. */
export const QUEUE_BOARD_LABELS: Record<QueueBoard, string> = {
  work: 'Work list',
  approvals: 'Approvals',
  meals: 'Meals',
  medical: 'Medical',
  deviations: 'Deviations',
  live: 'Live board',
};

/* ------------------------------------------------------------ the SLA ladder */

/** The four numbers Configuration's Service tab owns. */
export interface SlaNumbers {
  replyTargetMin: number;
  notifyAfterMin: number;
  escalateAfterMin: number;
  escalateToRole: string;
}

export interface SlaReading {
  /** Minutes since the plate was captured. */
  elapsedMin: number;
  /** The target this is read against — restated so a reader never has to fetch it. */
  targetMin: number;
  /** Minutes remaining. NEGATIVE once past the target, which is the whole point. */
  leftMin: number;
  /** Past the reply target. */
  breached: boolean;
  /** Past the nudge threshold — the seat that owes the reply is due a reminder. */
  nudged: boolean;
  /** Past nudge + escalation. */
  escalated: boolean;
  /**
   * Who an escalation goes to. Carried on every reading rather than only on an
   * escalated one, because the console prints the whole ladder above the queue
   * ("escalate at 25 · to Super Admin") whether or not anything has escalated.
   */
  escalateToRole: string;
}

/**
 * How long this plate has left — the port of `HV.slaLeft` (core.js:3749).
 *
 * NULL IS A REAL ANSWER and means no human reply is owed. The demo has three
 * such cases and they are kept exactly: the plate is already rated, or the client
 * is inside their observation window (days 1-5 are capture-only — there is
 * nothing for a coach to be late to), or nothing was ever captured.
 *
 * READ LIVE, never stored. The numbers come from `config.service.getSla()` on
 * every request, so an Ops edit to the reply target moves every pill on the board
 * on the next read rather than on the next capture. That is the deliberate
 * counterpart to the programme SHAPE, which is versioned and pinned — a reply
 * target nobody is waiting on is just a number in a table.
 */
export function slaReading(
  sla: SlaNumbers,
  meal: { capturedAtMs: number | null; rated: boolean; observation: boolean },
  nowMs: number,
): SlaReading | null {
  if (meal.rated || meal.observation || meal.capturedAtMs == null) return null;

  const elapsedMin = Math.floor((nowMs - meal.capturedAtMs) / 60_000);
  const leftMin = sla.replyTargetMin - elapsedMin;

  return {
    elapsedMin,
    targetMin: sla.replyTargetMin,
    leftMin,
    breached: leftMin < 0,
    nudged: elapsedMin >= sla.notifyAfterMin,
    /* the two are ADDED, not compared separately: the demo's ladder escalates
       `escalateAfterMin` after the nudge, not after capture (core.js:3775) */
    escalated: elapsedMin >= sla.notifyAfterMin + sla.escalateAfterMin,
    escalateToRole: sla.escalateToRole,
  };
}

/**
 * The queue's order: whatever is closest to breaching first, and within that the
 * plate that has been waiting longest.
 *
 * A plate with no reading (an observation capture) sorts to the end rather than
 * to the front — it is on the board to be seen, not to be hurried.
 */
export function compareBySla(
  a: { sla: SlaReading | null; capturedAtMs: number },
  b: { sla: SlaReading | null; capturedAtMs: number },
): number {
  const left = (x: { sla: SlaReading | null }) => x.sla?.leftMin ?? Number.MAX_SAFE_INTEGER;
  return left(a) - left(b) || a.capturedAtMs - b.capturedAtMs;
}

/* ------------------------------------------------------------- the coaching note */

/** The recorder's floor and cap, printed under the button: "10 s min · 30 s cap". */
export const MIN_VOICE_SEC = 10;
export const MAX_VOICE_SEC = 30;

/** "minimum 120 characters, so it lands the way a voice note would." */
export const MIN_TYPED_NOTE = 120;

/**
 * May this rating be published?
 *
 * The rule is the demo's `canSubmit` (console-meals.js:66): anything below five
 * stars needs a coaching note, and a note is either a recorded voice note or at
 * least 120 typed characters. A perfect plate needs no correction, so five stars
 * publishes on its own.
 *
 * The console renders the button disabled until this passes. That is a hint; the
 * service asks the same question before it writes, because a client being told
 * "three stars" with nothing said about why is the one outcome this screen exists
 * to prevent.
 */
export function ratingNoteSatisfied(
  stars: number,
  voiceSec: number | null | undefined,
  note: string | null | undefined,
): boolean {
  if (stars >= 5) return true;
  if ((voiceSec ?? 0) >= MIN_VOICE_SEC) return true;
  return (note ?? '').trim().length >= MIN_TYPED_NOTE;
}

/* ------------------------------------------------------------------ the chain */

/**
 * Whose signature an approval is waiting on, read off THE SNAPSHOT it carries
 * rather than the live chain.
 *
 * Null when it has walked off the end, which is the state that publishes it.
 */
export function stageRoleOf(chain: readonly ChainStep[], stage: number): string | null {
  return chain[stage]?.role ?? null;
}

/** Has the last signature been given? */
export function chainWalked(chain: readonly ChainStep[], stage: number): boolean {
  return stage >= chain.length;
}
