import { humanPillar, type PlanCarrier } from '@haalving/shared';

/**
 * THE FIVE RULES THE CLIENT SURFACE ENFORCES, in one file.
 *
 * Every `/client/*` response goes through these. That is the point: a rule kept in
 * one place is a rule the next endpoint inherits, and a rule spread across five
 * serialisers is a rule four of them will eventually disagree about.
 *
 * THE APP NEVER FILTERS. If a field must not reach a client it is absent from the
 * payload, not hidden by the phone — a hidden field is one screenshot, one proxy
 * or one `console.log` away from being read. The mobile app has no code that drops
 * anything, deliberately, so that a mistake here is visible as a bug rather than
 * covered by a second guard nobody maintains.
 */

/** The plan facts these rules need. `Client.plan` is the enum; this is its shape. */
export interface ClientFacts {
  plan: string;
  humanPillars: string[];
  observation: boolean;
  cycle: number;
  cycleDay: number;
}

/** The enum is POORNA/SVAYAM; `humanPillar` speaks lower case. One conversion, here. */
export function carrier(c: ClientFacts): PlanCarrier {
  return { plan: c.plan.toLowerCase(), humanPillars: c.humanPillars } as PlanCarrier;
}

/**
 * RULE 1 — AI fields are stripped unless the AI actually leads that pillar.
 *
 * `aiStars`, `aiConf`, `aiDetected`, `aiNote`, and any draft an approval chain has
 * not published. A Poorna client has a human on all four pillars, so they see none
 * of it: the AI's guess at their plate is working material for the coach who
 * corrects it, and showing it would make the coach's rating look like a second
 * opinion on a machine rather than the reading it is.
 *
 * A Svayam client whose fitness pillar has no coach IS being led by the AI there,
 * and hiding it would leave them with no reading at all.
 */
export function maySeeAi(c: ClientFacts, pillarKey: string): boolean {
  return !humanPillar(carrier(c), pillarKey);
}

/** Drop the AI half of a shape unless rule 1 allows it. */
export function stripAi<T extends Record<string, unknown>>(
  row: T,
  c: ClientFacts,
  pillarKey: string,
): Record<string, unknown> {
  if (maySeeAi(c, pillarKey)) {
    /* the AI leads this pillar, so its reading IS the reading — `aiDraft` still
       goes, because a draft is unpublished whoever wrote it (rule 5) */
    const { aiDraft: _drop, ...kept } = row;
    return kept;
  }
  const { ai: _a, aiStars: _b, aiConf: _c, aiDetected: _d, aiNote: _e, aiDraft: _f, ...rest } = row;
  return rest;
}

/**
 * RULE 2 — a TEAMONLY message is never serialised to a client.
 *
 * The care circle is one thread with two audiences: what the team says to each
 * other about a client, and what they say to them. It is a message KIND, not a
 * flag — `MessageKind.TEAMONLY`, the same value the demo writes as
 * `kind: 'teamonly'` (data.js:1483, "renders ONLY in the console"). The console
 * draws those lines differently; here they do not exist.
 */
export const CLIENT_HIDDEN_KINDS = ['TEAMONLY'] as const;

export function visibleToClient(m: { kind: string }): boolean {
  return !(CLIENT_HIDDEN_KINDS as readonly string[]).includes(m.kind);
}

/**
 * The same rule as a WHERE clause, which is how it should nearly always be used.
 *
 * A filter applied after the read has already loaded the rows it is about to
 * throw away, and a bug in it leaks through any path that forgets to call it — a
 * count, an export, a join. A clause cannot be forgotten by the query it is part
 * of. `visibleToClient` above stays for the one case where a row is already in
 * hand.
 */
export const clientVisibleMessages = { kind: { notIn: [...CLIENT_HIDDEN_KINDS] } };

/**
 * RULE 3 — an observation client is capture-only.
 *
 * Days 1 to 5 are a baseline: the client photographs meals and nobody rates them,
 * there are no sessions on Today because none are booked yet, and Journey shows
 * the unbuilt variant. Serving them a rating or an empty session list would both
 * be wrong — the first is a judgement nobody made, the second reads as a coach who
 * forgot.
 */
export function isObservation(c: ClientFacts): boolean {
  return c.observation || c.cycle === 0 || (c.cycle === 1 && c.cycleDay <= 5);
}

/** A rating exists for the team even in observation; the client is not shown one. */
export function maySeeRating(c: ClientFacts): boolean {
  return !isObservation(c);
}

/**
 * RULE 5 — published content only.
 *
 * A plan, a chart or a catalog item that has not been signed off is working
 * material. The console shows a draft to the people writing it; a client asking
 * "what am I doing this week" must never be handed something nobody approved.
 */
export function publishedOnly<T extends { publishedAt?: Date | null; status?: string | null }>(
  rows: T[],
): T[] {
  return rows.filter((r) => (r.publishedAt ? true : r.status === 'PUBLISHED'));
}
