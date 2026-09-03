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
 *
 * `only` NARROWS THE ROUND TO NAMED CLIENTS, and every rule must honour it. The
 * 08:00 job passes nothing and the rule reads the whole roster; a client logging
 * a meal at three in the afternoon passes just themselves, so their line is
 * rewritten against what they just did without the other two hundred being
 * recomputed to say exactly what they already said.
 */
export interface DigestRule {
  key: string;
  /** One line on what this rule watches, printed by the job's log. */
  about: string;
  /**
   * `date` is THE MOMENT THE ROUND RUNS, not the midnight its rows are filed
   * under — a rule measuring an SLA or a silence is doing arithmetic against
   * now. A rule that wants the day boundary derives it.
   */
  run(date: Date, only?: string[]): Promise<DigestEntryInput[]>;
}
