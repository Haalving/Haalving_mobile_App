import cron from 'node-cron';

import { env } from '../config/env.js';
import { pruneRefreshTokens } from '../services/auth.service.js';
import { generateDeviations } from '../services/deviations.service.js';
import { buildFor } from '../services/digest.service.js';
import { DIGEST_RULES, followupDrafterRule } from '../services/digest-rules/index.js';
import { draftFor } from '../services/followups.service.js';
import { logger } from '../utils/logger.js';

/**
 * Scheduled work.
 *
 * The demo's five sweeps — SLA, session reminders, standing rules, workflow
 * templates and the session-report chase — belong here, and they run on a
 * 45-second heartbeat in the browser today. They are NOT ported on Day 1: each
 * one writes into surfaces (notices, the work list, care-circle threads) that do
 * not exist yet, and a sweep with nowhere to deliver is worse than no sweep.
 *
 * Two rules they will need when they land, both learned the hard way in the demo:
 *
 *  - the once-guard is stamped LAST, after everything that could refuse. Burning
 *    a key and then failing to deliver loses that step forever.
 *  - quiet hours are 22:00-07:00 for CLIENT traffic. Staff obligations are exempt
 *    — gating those would silently drop every evening session's report chase.
 *
 * Everything is scheduled in Asia/Kolkata, because every rule they enforce is a
 * local-time rule.
 */

const TZ = env.TZ;

export function registerJobs(): void {
  /* refresh tokens: rotation leaves a revoked row per use, so the table grows
     with every page load. Nightly at 03:15, well outside the demo's own hours. */
  cron.schedule(
    '15 3 * * *',
    () => {
      void pruneRefreshTokens()
        .then((n) => {
          if (n) logger.info({ removed: n }, 'pruned expired refresh tokens');
        })
        .catch((err: Error) => logger.error({ err: err.message }, 'refresh token prune failed'));
    },
    { timezone: TZ },
  );

  /*
   * The morning digest, 08:00 Asia/Kolkata — the hour the demo's header names
   * ("Digest generated 08:00").
   *
   * Every rule returns [] today, so this writes nothing and is harmless; it is
   * registered now so the schedule, the timezone and the failure handling are
   * settled before the rules that matter arrive. `buildFor` UPSERTS and never
   * deletes, so the seeded lines survive the first real run.
   *
   * The timezone is not cosmetic: 08:00 UTC is 13:30 in Kolkata, which is the
   * afternoon, and a morning digest that lands after lunch is not a digest.
   */
  cron.schedule(
    '0 8 * * *',
    () => {
      const now = new Date();

      /*
       * The deviations board, reconciled to the morning's reality. Independent of
       * the digest — a client who went quiet is a deviation whether or not the
       * digest built — so it runs on its own promise with its own catch, and its
       * failure is reported as its own rather than folded into the digest's.
       */
      void generateDeviations(now.getTime())
        .then(({ written, cleared }) =>
          logger.info({ written, cleared }, 'deviations generated'),
        )
        .catch((err: Error) =>
          logger.error({ err: err.message }, 'deviation generation failed'),
        );

      void buildFor(now)
        .then(({ written, byRule }) => {
          logger.info({ written, byRule }, 'digest built');
          /*
           * The follow-up drafter, chained rather than registered.
           *
           * It is a second STEP of the same morning, not a sixth digest rule:
           * it writes FollowupDraft rows, which `buildFor` has no business
           * upserting (see followupDrafter.rule.ts). It runs after the build,
           * and only if the build succeeded, because what it drafts is a nudge
           * per FLAGGED client — there is nothing to draft from until those
           * lines exist. Both steps are handed the same `now`, so the second
           * cannot end up reading a different day than the first wrote.
           *
           * Its own catch, so a failure here is reported as its own and not as
           * a digest that in fact built fine.
           */
          return draftFor(now)
            .then(({ written: drafted, skipped }) => {
              logger.info({ drafted, skipped }, 'follow-ups drafted');
            })
            .catch((err: Error) =>
              logger.error({ err: err.message }, 'follow-up drafting failed'),
            );
        })
        .catch((err: Error) => logger.error({ err: err.message }, 'digest build failed'));
    },
    { timezone: TZ },
  );

  logger.info(
    {
      tz: TZ,
      digestRules: DIGEST_RULES.map((r) => r.key),
      /* named separately because it runs separately — a reader of this line
         should not have to guess which list a key came from */
      followupRule: followupDrafterRule.key,
    },
    'scheduled jobs registered',
  );
}
