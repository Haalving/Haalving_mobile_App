import cron from 'node-cron';

import { env } from '../config/env.js';
import { pruneRefreshTokens } from '../services/auth.service.js';
import { generateDeviations } from '../services/deviations.service.js';
import { buildFor } from '../services/digest.service.js';
import { DIGEST_RULES, escalationsRule, followupDrafterRule } from '../services/digest-rules/index.js';
import { raiseFor } from '../services/escalations.service.js';
import { draftFor } from '../services/followups.service.js';
import { logger } from '../utils/logger.js';

/**
 * Scheduled work.
 *
 * The demo's five sweeps — SLA, session reminders, standing rules, workflow
 * templates and the session-report chase — belong here, and they run on a
 * 45-second heartbeat in the browser today. The bargain on Day 1 was that a
 * sweep with nowhere to deliver is worse than no sweep, so none of them were
 * ported until the surface they write into existed.
 *
 * THE SLA ONE NOW HAS SOMEWHERE TO DELIVER, and it is the 08:00 escalations step
 * below rather than a sixth heartbeat: `Notice` carries a lifecycle and a dedupe
 * key, `Attention` carries a ticket that outlives the morning. The other four
 * still have nowhere, and still wait.
 *
 * NO SECOND SCHEDULER. Everything a sweep needs to do runs inside the two crons
 * already here. A heartbeat measured in seconds is what the demo needed because
 * a browser tab is the only clock it has; a server with a cron does not have
 * that problem, and every rule these sweeps enforce is a daily-scale rule.
 *
 * Two rules the remaining four will need when they land, both learned the hard
 * way in the demo:
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

      /*
       * The tickets, notices and log rows this morning has earned.
       *
       * ITS OWN PROMISE, NOT CHAINED BEHIND THE DIGEST, and the difference
       * matters on the morning the digest fails: a client who has gone quiet
       * still has to reach somebody, and a ticket that was not raised because a
       * line could not be written is a problem nobody hears about. It calls the
       * rules itself (see escalations.rule.ts), so it needs nothing `buildFor`
       * wrote — and it is safe to run beside it because the two write different
       * tables and both are idempotent.
       *
       * `now` is the same instant the other two steps are handed, so the whole
       * morning reads one clock.
       */
      void raiseFor(now)
        .then(({ attentions, notices, logs }) =>
          logger.info({ attentions, notices, logs }, 'escalations raised'),
        )
        .catch((err: Error) => logger.error({ err: err.message }, 'escalations failed'));

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
      /* named separately because they run separately — a reader of this line
         should not have to guess which list a key came from */
      followupRule: followupDrafterRule.key,
      escalationRule: escalationsRule.key,
    },
    'scheduled jobs registered',
  );
}
