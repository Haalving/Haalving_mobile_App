import { PILLAR_KEYS, levelup, type LevelupClient, type LevelupRefs } from '@haalving/shared';

import * as config from '../config.service.js';
import { digestClients } from './sources.js';
import type { DigestEntryInput, DigestRule } from './types.js';

/**
 * Review day, and what the engine makes of the four pillars.
 *
 * IT ASKS THE SAME ENGINE THE CLIENT'S OWN PLAN TAB ASKS. `levelup()` is pure
 * and lives in shared/ precisely so the phone, the console and this morning job
 * cannot each grow their own idea of what "upgrade-eligible" means. A coach
 * reading "eligible on all four" here and a client seeing three ticks and one
 * blank on their plan would be one product telling two stories.
 *
 * ELIGIBLE MEANS EVERY MEASURABLE GATE IS TICKED. `levelup` returns three
 * states, and the third — `null` — is a gate the app cannot measure and the care
 * team confirms at the review itself (the chart practised as written, the sleep
 * band). So `ticked === total` counts the measurable ones, and the unmeasurable
 * ones are exactly what the review is FOR. Calling a pillar ineligible because a
 * human has not yet been asked would be the engine pre-empting the meeting.
 *
 * WHICH DAY. The client's own `cycleDay` against the review day of the shape
 * THEY started on, never the current shape — a programme edited mid-cycle must
 * not move somebody's review out from under them (config.service.ts:40).
 */

export const levelReviewRule: DigestRule = {
  key: 'levelReview',
  about: 'announces a client whose level review falls today, with the engine’s reading',

  async run(_date: Date, only?: string[]): Promise<DigestEntryInput[]> {
    const clients = await digestClients(only);
    if (!clients.length) return [];

    const [cultureCriteria, bodyCriteria, program] = await Promise.all([
      config.getReference<LevelupRefs['cultureCriteria']>('cultureCriteria'),
      config.getReference<LevelupRefs['bodyCriteria']>('bodyCriteria'),
      config.getReference<{ wellness: LevelupRefs['wellness'] }>('program'),
    ]);

    const out: DigestEntryInput[] = [];

    for (const [i, c] of clients.entries()) {
      if (c.observation) continue;

      const shape = await config.getShapeFor(c);
      if (c.cycleDay !== shape.reviewDay) continue;

      const refs: LevelupRefs = {
        cultureCriteria,
        bodyCriteria,
        wellness: program.wellness,
        reviewWord: `Day-${shape.reviewDay}`,
      };
      const lc: LevelupClient = {
        observation: c.observation,
        levels: c.levels as Record<string, number>,
        track: c.track,
        sessions: c.sessions as LevelupClient['sessions'],
        culturePhotos: c.culturePhotos as LevelupClient['culturePhotos'],
        compliance: c.compliance,
        sleep: (c.trackers as { sleep?: string } | null)?.sleep ?? null,
      };

      const readings = PILLAR_KEYS.map((p) => levelup(p, lc, refs)).filter(
        (lu): lu is NonNullable<typeof lu> => lu !== null,
      );
      /* no ledger to read yet — the day is still worth announcing, the engine
         just has nothing to add to it */
      const eligible = readings.filter((lu) => lu.total > 0 && lu.ticked === lu.total).length;

      const verdict = !readings.length
        ? 'the engine has no reading yet'
        : eligible === readings.length && readings.length === PILLAR_KEYS.length
          ? 'the engine reads upgrade-eligible on all four pillars'
          : eligible
            ? `the engine reads upgrade-eligible on ${eligible} of ${readings.length} pillars`
            : `no pillar is clear yet — ${readings.reduce((n, lu) => n + lu.ticked, 0)} of ${readings.reduce((n, lu) => n + lu.total, 0)} gates ticked`;

      out.push({
        clientId: c.id,
        /* NOT A PROBLEM, so no pill. A review is a scheduled good thing, and
           flagging it would put it above a client who has gone silent. */
        flag: null,
        text: `Day ${c.cycleDay}. Level Review Pack ready; ${verdict}.`,
        evidence: ['level pack', 'cycle day'],
        position: i,
      });
    }

    return out;
  },
};
