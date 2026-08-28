import type { DigestFlag } from '@prisma/client';

/**
 * What a rule produces. One line, about one client, for one day.
 *
 * `flag` may be null and usually is: an unflagged line still gets printed —
 * "observation day 3 of 5, on pace, no action needed" is worth a coach's two
 * seconds, and a digest that only spoke when something was wrong would train
 * people to read it as an alarm rather than a round.
 */
export interface DigestEntryInput {
  clientId: string;
  flag: DigestFlag | null;
  text: string;
  /** The parts, unjoined. The row prints them with ' · ' between. */
  evidence: string[];
  /** Order within the day, before the flag sort is applied. */
  position: number;
}

/**
 * Every rule has the same shape: given a day, return the lines it wants.
 *
 * A rule reads whatever it needs and returns `[]` when it has nothing to say —
 * silence is the normal case, and a rule that cannot answer yet returns `[]`
 * rather than throwing, so one unbuilt source never empties the whole digest.
 */
export interface DigestRule {
  key: string;
  /** One line on what this rule watches, printed by the job's log. */
  about: string;
  run(date: Date): Promise<DigestEntryInput[]>;
}
