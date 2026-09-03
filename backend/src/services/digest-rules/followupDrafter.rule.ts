import { prisma } from '../../config/prisma.js';
import { startOfDay } from '../../utils/dates.js';
import { ruleOf } from './order.js';
import { draftText, type DraftFacts } from './followup-templates.js';
import { WINDOW_TARGET } from './observation.rule.js';
import { firstName } from './sources.js';

/**
 * The copilot's follow-up drafter — the rule that turns this morning's flagged
 * lines into a nudge somebody can send.
 *
 * It runs immediately after the 08:00 digest build, reads the lines the digest
 * rules just wrote, and drafts ONE nudge for each flagged client. One per
 * client, never one per line: a client with three flags has one conversation,
 * not three — and the digest keeps one line per client per morning anyway, so
 * "the flagged clients" and "the flagged lines" are the same list.
 *
 * THE WORDS COME FROM THE RULE THAT RAISED THE LINE, through
 * `followup-templates.ts`. A client who has gone quiet needs a door held open; a
 * client whose review is this afternoon needs to be told it is a good day.
 * Sending either sentence to the other person is worse than sending nothing, so
 * the template is chosen by rule and filled with that client's own numbers.
 *
 * ONLY FLAGGED LINES ARE ANSWERED. An unflagged line is the digest saying
 * somebody is fine, and messaging a client to tell them so is noise that trains
 * people to stop reading. `observation` is the one unflagged rule with a
 * template, and it only ever fires here when the window is behind pace and the
 * rule has therefore flagged it.
 *
 * IT IS NOT A `DigestRule`, and it is deliberately absent from `DIGEST_RULES`.
 *
 * A digest rule produces `DigestEntryInput` — a line about a client, written for
 * a coach's eyes, upserted on (date, clientId) so a rule may replace its own
 * line and never anyone else's. This produces a DRAFT MESSAGE TO A CLIENT: a row
 * with a lifecycle, an author, an approver and a sent state, which `buildFor`
 * has no idea how to write and must not learn. Bending it into the same
 * interface would mean the digest builder upserting follow-up drafts, which is
 * how a re-run of the morning job would come to overwrite a coach's edit.
 *
 * So it has its own one-rule interface, and its own step in the same 08:00 cron
 * after the digest build — see jobs/index.ts, and `draftFor` in
 * followups.service.ts, which is what actually writes the rows.
 */

/** What the drafter produces. One nudge, about one client, for one day. */
export interface FollowupDraftInput {
  clientId: string;
  /** The words as the copilot wrote them; `originalText` is set from this too. */
  text: string;
}

/**
 * The same shape as a `DigestRule` in everything but what it returns, because
 * the job logs both the same way and a reader should not have to hold two
 * vocabularies for two steps of one morning.
 */
export interface FollowupDrafterRule {
  key: string;
  /** One line on what this rule watches, printed by the job's log. */
  about: string;
  run(date: Date): Promise<FollowupDraftInput[]>;
}

export const followupDrafterRule: FollowupDrafterRule = {
  key: 'followupDrafter',
  about: 'drafts one follow-up per client the digest flagged this morning',

  /*
   * A morning with no flagged lines produces no drafts, and that is a true
   * statement about today rather than a failure — the same convention the digest
   * rules keep, for the same reason.
   */
  async run(date: Date): Promise<FollowupDraftInput[]> {
    const day = startOfDay(date.toISOString().slice(0, 10));

    const lines = await prisma.digestEntry.findMany({
      where: { date: day, flag: { not: null }, client: { status: 'active' } },
      select: {
        clientId: true,
        text: true,
        position: true,
        client: { select: { name: true, sessions: true, observation: true } },
      },
      orderBy: { position: 'asc' },
    });

    /*
     * THE PLATES ARE COUNTED, from the same table the observation rule counts.
     *
     * `Client.culturePhotos` was the obvious place to read them and it is the
     * wrong one twice over: its `uploaded` is a maintained number, and its `of`
     * is the NUTRITION GATE FOR A WHOLE LEVEL. Reading it here had the nudge
     * telling a client "7 of 33 photos in" underneath a digest line that said
     * one of ten — two numbers for one fact, in the same morning, one of them
     * going to the client.
     */
    const photoCounts = await prisma.meal.groupBy({
      by: ['clientId'],
      where: { clientId: { in: lines.map((l) => l.clientId) }, photo: { not: null } },
      _count: { _all: true },
    });
    const photos = new Map(photoCounts.map((c) => [c.clientId, c._count._all]));

    const out: FollowupDraftInput[] = [];

    for (const line of lines) {
      const text = draftText(ruleOf(line.position), {
        first: firstName(line.client.name),
        line: line.text,
        sessions: line.client.sessions as DraftFacts['sessions'],
        photos: line.client.observation
          ? { uploaded: photos.get(line.clientId) ?? 0, of: WINDOW_TARGET }
          : null,
      });
      /* a template that cannot fill itself truthfully declines, and a decline is
         not a draft — see `draftText` */
      if (text) out.push({ clientId: line.clientId, text });
    }

    return out;
  },
};
