/**
 * The copilot's follow-up drafter — the rule that turns this morning's flagged
 * lines into a nudge somebody can send.
 *
 * NOT BUILT YET. It returns [] and will keep returning [] until the copilot can
 * write a sentence worth a client's attention. When it can, this is where it
 * happens: it runs immediately after the 08:00 digest build, reads the lines the
 * digest rules just wrote, and drafts ONE nudge for each flagged client — the
 * three AI drafts the seed opens with (data.js:1769) are exactly what a real run
 * of this would have produced. One per client, never one per line: a client with
 * three flags has one conversation, not three.
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
   * Returning an empty list rather than throwing follows the digest rules'
   * convention for the same reason: an unbuilt source must cost the morning
   * nothing. Here it costs even less — no drafts means no cards, and a console
   * with no follow-ups to send is a true statement about today.
   */
  async run(_date: Date): Promise<[]> {
    return [];
  },
};
