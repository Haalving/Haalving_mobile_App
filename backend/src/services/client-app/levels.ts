import { PILLAR_KEYS } from '@haalving/shared';

import { prisma } from '../../config/prisma.js';

/**
 * A CLIENT'S LEVEL IS THE LEVEL OF THE TEMPLATE THEY ARE ACTUALLY ON.
 *
 * THE BUG THIS EXISTS TO KILL. `Client.levels` was a stored JSON written exactly
 * once — at promotion, all four pillars set to 1 — and never again. Nothing in
 * the product raised a level: the `level` approval chain publishes a Care Circle
 * message and touches no level, and there is no route or console control that
 * sets one. So the number drifted from the plan it was supposed to describe. On
 * the live database Rajesh read FITNESS L3 while being served an L1 fitness
 * template: the badge and the work disagreed, and the badge was the lie.
 *
 * THE TEMPLATE IS THE TRUTH because the template is what the client actually
 * does. `PlanTemplate` carries `level` and `track`; `ClientPlan.templateId` is
 * the one live template for a pillar. Deriving the level from it means the two
 * cannot drift, because there is only one fact.
 *
 * AND IT INHERITS THE GOVERNANCE FOR FREE. Attaching a template already walks an
 * approval chain, so "raise this client to L3" becomes "publish the L3 template",
 * signed by the same people who sign everything else. No new approval kind, no
 * new console screen, and no way to change a level without a signature.
 *
 * A PILLAR WITH NO LIVE TEMPLATE KEEPS ITS STORED LEVEL. Un-assigning a template
 * does not demote anybody — it means there is no plan right now, not that the
 * client went back to level 1, and dropping a badge from L3 to L1 on an admin
 * action would read as a punishment nobody applied.
 */

export type Levels = Record<string, number>;

/** The rows this derivation needs — a live template's level, per pillar. */
export interface PlanRowForLevels {
  pillar: string;
  template: { level: number } | null;
}

/**
 * Merge the stored levels with what the live templates say.
 *
 * `motivation` is a TEMPLATE_PILLAR but not a level pillar — it is a message
 * library, and nobody is "level 3 at motivation" — so it is never merged in.
 */
export function levelsFrom(stored: unknown, plans: PlanRowForLevels[]): Levels {
  const out: Levels = { ...((stored as Levels | null) ?? {}) };
  for (const p of plans) {
    if (!p.template) continue;
    if (!(PILLAR_KEYS as readonly string[]).includes(p.pillar)) continue;
    out[p.pillar] = p.template.level;
  }
  return out;
}
/**
 * Levels for one client, refreshing the cached column when it has drifted.
 *
 * The write-back keeps anything reading the raw column honest without making it
 * the source of truth. Skipped when nothing changed, so opening a record is not
 * a write.
 */
export async function levelsForClient(
  client: { id: string; levels: unknown },
): Promise<Levels> {
  const plans = await prisma.clientPlan.findMany({
    where: { clientId: client.id },
    select: { pillar: true, template: { select: { level: true } } },
  });
  const next = levelsFrom(client.levels, plans);

  const before = (client.levels as Levels | null) ?? {};
  const drifted = Object.keys(next).some((k) => before[k] !== next[k]);
  if (drifted) {
    await prisma.client.update({ where: { id: client.id }, data: { levels: next } });
  }
  return next;
}
