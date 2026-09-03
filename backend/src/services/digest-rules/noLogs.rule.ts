import { daysSince, digestClients, lastSeenByClient, lastSeenWords } from './sources.js';
import type { DigestEntryInput, DigestRule } from './types.js';

/**
 * Three days of silence. The loudest line the digest can write.
 *
 * WHAT COUNTS AS A SIGN OF LIFE: a plate captured, or a message the client
 * themselves wrote in their Care Circle. Both carry a timestamp, so both can
 * answer "when did they last". The trackers cannot — see sources.ts — so a
 * client who taps water every morning and never photographs a meal will read as
 * silent here. That is the honest limit of what the database currently records,
 * and the alternative (calling the standing blob a log) would be a rule that
 * quietly stopped flagging anybody.
 *
 * A CLIENT WHO HAS NEVER LOGGED is measured from the day they joined, not from
 * the epoch. Somebody onboarded yesterday has not gone quiet; somebody onboarded
 * three weeks ago who has never logged anything is the clearest case there is.
 *
 * The observation window is exempt: those first five days are for watching, and
 * `observation.rule` speaks for them with the counts that actually matter there.
 */

/** Days of nothing before a client is called quiet. The demo's own threshold. */
export const SILENCE_DAYS = 3;

export const noLogsRule: DigestRule = {
  key: 'noLogs',
  about: 'flags a client who has logged nothing for three days',

  async run(date: Date, only?: string[]): Promise<DigestEntryInput[]> {
    const [clients, lastSeen] = await Promise.all([digestClients(only), lastSeenByClient(only)]);
    const out: DigestEntryInput[] = [];

    for (const [i, c] of clients.entries()) {
      if (c.observation) continue;

      const seen = lastSeen.get(c.id) ?? null;
      /* never logged: the clock starts the day they joined */
      const since = seen ?? c.onboardedAt ?? c.createdAt;
      const days = daysSince(since, date);
      if (days < SILENCE_DAYS) continue;

      out.push({
        clientId: c.id,
        flag: 'HIGH',
        text: seen
          ? `No logs for ${days} days. Last seen ${lastSeenWords(seen, date)}.`
          : `Nothing logged since joining ${days} days ago — no plate and no message yet.`,
        evidence: ['meal log', 'circle messages'],
        position: i,
      });
    }

    return out;
  },
};
