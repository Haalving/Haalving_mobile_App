/**
 * THE WORDS A NUDGE IS BUILT FROM.
 *
 * One template per digest rule, because the rule is what the coach and the
 * client are actually talking about: a client who has gone quiet needs a door
 * held open, and a client whose review is this afternoon needs to be told it is
 * a good day. Sending either sentence to the other person is worse than sending
 * nothing.
 *
 * THESE ARE THE DEMO'S OWN SENTENCES, and that is not a shortcut. The drafter's
 * file says it plainly: "the three AI drafts the seed opens with are exactly
 * what a real run of this would have produced" — Meena's line is the noLogs
 * template, Rajesh's the falling-rating one, Suresh's the review one. Keeping
 * the words means the port produces the demo's output from real data instead of
 * from a fixture, which is the whole point of the exercise.
 *
 * A TEMPLATE IS A FUNCTION, not a string with holes, so the numbers it quotes
 * are the client's own and a template that has nothing true to say can decline
 * by returning null rather than printing "0 of 0".
 *
 * WHERE THE AI GOES. `draftText` is the seam: it picks a template and fills it
 * today, and a writer that calls a model can replace its body without touching
 * the drafter, the approve/send flow, or the review step in front of both. What
 * must NOT move is that seam's contract — one nudge per client per morning, in
 * a DRAFT row with no author, that a named human still has to approve.
 */

export interface DraftFacts {
  /** "Rajesh", the name the message is written to. */
  first: string;
  /** The digest line this nudge answers, verbatim. */
  line: string;
  /** The client's session ledger, when they have one — `{ fitness: {done,target} }`. */
  sessions: Record<string, { done: number; target: number }> | null;
  /** Meal photos in and expected, for a client still in observation. */
  photos: { uploaded: number; of: number } | null;
}

export interface FollowupTemplate {
  /** The digest rule whose lines this answers. */
  rule: string;
  /** What a coach would call it in a picker. */
  label: string;
  write(f: DraftFacts): string | null;
}

/** "4th" — the ordinal a sentence about sessions needs. */
function ordinal(n: number): string {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/** The pillar with the most sessions left to run — what "tonight" is likely to be. */
function nextSession(sessions: DraftFacts['sessions']): { done: number; target: number } | null {
  if (!sessions) return null;
  const rows = Object.values(sessions).filter((s) => s && s.target > s.done);
  if (!rows.length) return null;
  return rows.sort((a, b) => b.target - b.done - (a.target - a.done))[0] ?? null;
}

export const FOLLOWUP_TEMPLATES: FollowupTemplate[] = [
  {
    rule: 'noLogs',
    label: 'Gone quiet — hold the door open',
    write: (f) =>
      `We saved your progress exactly where you left it, ${f.first}. ` +
      'One small step restarts everything, even one photo.',
  },
  {
    rule: 'noMealDay',
    label: 'Missed a day of plates — ask for the next one, not the last',
    /* IT NAMES NO SPAN, deliberately. The line behind it may be one missed day or
       six, and a sentence that says "yesterday" would be a small lie half the
       time it was sent — so it asks for the NEXT plate, which is the one thing
       true of every run length and the only thing the client can act on. */
    write: (f) =>
      `Your next plate is all we need, ${f.first} — one photo and we are reading with you again. ` +
      'Nothing is lost.',
  },
  {
    rule: 'mealRatingDecline',
    label: 'Ratings slipping — name the streak, not the slip',
    write: (f) => {
      const s = nextSession(f.sessions);
      /* the demo's sentence needs a session to count; without a ledger it says
         the encouraging half and drops the number rather than inventing one */
      return s
        ? `Great consistency this week, ${f.first} — tonight’s session locks your ` +
          `${ordinal(s.done + 1)} of ${s.target}. Bands ready?`
        : `Great consistency this week, ${f.first} — one plate at a time is exactly how this works. ` +
          'Photograph tonight’s and we’ll read it together.';
    },
  },
  {
    rule: 'slaPending',
    label: 'Plate waiting — tell them it is being looked at',
    write: (f) =>
      `Your plate is in, ${f.first}, and your dietitian is looking at it now. ` +
      'Nothing more to do — the rating lands in your Circle.',
  },
  {
    rule: 'levelReview',
    label: 'Review day — steady them before it',
    write: (f) =>
      `Big day, ${f.first}: your review is this afternoon. ` +
      'Whatever the grid says, this cycle was your best yet.',
  },
  {
    rule: 'observation',
    label: 'Observation window — keep the plates coming',
    write: (f) =>
      f.photos
        ? `${f.photos.uploaded} of ${f.photos.of} photos in, ${f.first} — you are building the picture ` +
          'we plan your first level from. Keep them coming.'
        : null,
  },
];

const BY_RULE = new Map(FOLLOWUP_TEMPLATES.map((t) => [t.rule, t]));

/**
 * The words for one nudge, or null when this morning has nothing worth sending.
 *
 * NULL IS A REAL ANSWER and the drafter honours it: an unflagged line about a
 * client who is fine does not need a message, and a template that cannot fill
 * itself truthfully declines rather than sending a sentence with a hole in it.
 * A console with no drafts is a true statement about today.
 */
export function draftText(rule: string | null, facts: DraftFacts): string | null {
  if (!rule) return null;
  return BY_RULE.get(rule)?.write(facts) ?? null;
}
