import type { DigestFlag, Prisma } from '@prisma/client';

import { prisma } from '../config/prisma.js';
import { startOfDay, todayISO } from '../utils/dates.js';
import { logger } from '../utils/logger.js';
import { DIGEST_RULES } from './digest-rules/index.js';
import { clientScopeWhere, type Scoper } from './scope.service.js';

/**
 * The morning digest, and the freshness bag that tracks what a person has read.
 *
 * Ported from `attentionHtml`, `seenBag`/`freshIds`/`stampSeen` and `tabModel`
 * in console-digest.js. The demo keeps the seen list in its localStorage store;
 * here it is a row per user per tab, because "new since you last looked" is a
 * fact about the PERSON, not about the browser they happened to open.
 */

/** The Home tabs that carry a "new since you looked" count. */
export const SEEN_TABS = ['attention', 'replies', 'followups', 'tasks', 'notices', 'sessions'] as const;
export type SeenTab = (typeof SEEN_TABS)[number];

/**
 * Flag order: HIGH, then MED, then unflagged.
 *
 * Postgres would sort the enum by its declaration order, but the sort is done in
 * JavaScript so NULL lands LAST deliberately — in SQL a null sorts first or last
 * depending on the dialect and the direction, and an unflagged line arriving at
 * the top of an attention-ordered list is exactly backwards.
 */
const FLAG_RANK: Record<string, number> = { HIGH: 0, MED: 1 };
const rank = (flag: DigestFlag | null): number => (flag ? (FLAG_RANK[flag] ?? 2) : 2);

export interface AttentionRow {
  id: string;
  clientId: string;
  flag: DigestFlag | null;
  text: string;
  evidence: string[];
  position: number;
  /** Not yet seen by THIS user on this tab. */
  fresh: boolean;
  client: {
    id: string;
    name: string;
    plan: string;
    levels: Prisma.JsonValue;
    sessions: Prisma.JsonValue;
  };
}

async function seenIds(userId: string, tab: SeenTab): Promise<Set<string>> {
  const row = await prisma.homeSeen.findUnique({
    where: { userId_tabKey: { userId, tabKey: tab } },
    select: { ids: true },
  });
  return new Set(row?.ids ?? []);
}

/**
 * Today's digest, for the clients this caller may see.
 *
 * SCOPED THROUGH THE SAME CLAUSE `/clients` uses — a nested `client: scope`
 * filter rather than a fetch-then-filter, so a coach cannot be shown a line
 * about someone whose record they could not open.
 */
export async function listAttention(user: Scoper): Promise<AttentionRow[]> {
  const scope = await clientScopeWhere(user);
  const today = startOfDay(todayISO());

  const rows = await prisma.digestEntry.findMany({
    where: { date: today, client: scope },
    select: {
      id: true,
      clientId: true,
      flag: true,
      text: true,
      evidence: true,
      position: true,
      client: { select: { id: true, name: true, plan: true, levels: true, sessions: true } },
    },
  });

  const seen = await seenIds(user.id, 'attention');

  /* attention order: loudest first, and within one loudness the order the lines
     were written in */
  rows.sort((a, b) => rank(a.flag) - rank(b.flag) || a.position - b.position);

  return rows.map((r) => ({ ...r, fresh: !seen.has(r.clientId) }));
}

/**
 * Which ids each tab holds, so the badge, the New marks and the seen-stamp all
 * read ONE list and can never disagree. This is `tabModel`.
 *
 * The unbuilt tabs return `[]` and name what they will read — a tab that
 * invented a count before its board existed would put a badge on a page that
 * cannot explain it.
 */
export async function tabIds(user: Scoper): Promise<Record<SeenTab, string[]>> {
  const scope = await clientScopeWhere(user);
  const today = startOfDay(todayISO());

  const attention = await prisma.digestEntry.findMany({
    where: { date: today, client: scope },
    select: { clientId: true, flag: true, position: true },
  });
  attention.sort((a, b) => rank(a.flag) - rank(b.flag) || a.position - b.position);

  return {
    attention: attention.map((d) => d.clientId),
    /* rooms with unread messages — reads CircleMessage + CircleRead */
    replies: [],
    /* drafts still unsent — reads FollowupDraft */
    followups: [],
    /* my open work items — reads WorklistItem */
    tasks: [],
    /* my unseen notices — reads Notice */
    notices: [],
    /* today's bookings, coach roles only — reads Task/ScheduledSession */
    sessions: [],
  };
}

/** Unseen count per tab — what the tab badges and the sidebar Home badge read. */
export async function freshCounts(user: Scoper): Promise<Record<SeenTab, number>> {
  const ids = await tabIds(user);

  const rows = await prisma.homeSeen.findMany({
    where: { userId: user.id },
    select: { tabKey: true, ids: true },
  });
  const bag = new Map(rows.map((r) => [r.tabKey, new Set(r.ids)]));

  const out = {} as Record<SeenTab, number>;
  for (const tab of SEEN_TABS) {
    const seen = bag.get(tab) ?? new Set<string>();
    out[tab] = ids[tab].filter((id) => !seen.has(id)).length;
  }
  return out;
}

/**
 * Stamp a tab with exactly what was on screen.
 *
 * THE SET COMPARISON IS THE POINT, and it is `stampSeen`'s: if the stored ids
 * already equal the posted ids, nothing is written and `changed: false` comes
 * back. Without it every render would write a row, and `updatedAt` would churn
 * on a page nobody had interacted with.
 *
 * Compared as SETS, not arrays — the client sorts its rows by flag, and a
 * re-order is not a change in what was seen.
 */
export async function markSeen(
  user: Scoper,
  tab: SeenTab,
  ids: string[],
): Promise<{ changed: boolean }> {
  const next = [...new Set(ids)];

  const existing = await prisma.homeSeen.findUnique({
    where: { userId_tabKey: { userId: user.id, tabKey: tab } },
    select: { ids: true },
  });

  if (existing) {
    const before = new Set(existing.ids);
    const same = before.size === next.length && next.every((id) => before.has(id));
    if (same) return { changed: false };
  }

  await prisma.homeSeen.upsert({
    where: { userId_tabKey: { userId: user.id, tabKey: tab } },
    create: { userId: user.id, tabKey: tab, ids: next },
    update: { ids: next },
  });

  return { changed: true };
}

/** When today's digest was written — the header's "Digest generated 08:00". */
export async function generatedAt(user: Scoper): Promise<string | null> {
  const scope = await clientScopeWhere(user);
  const latest = await prisma.digestEntry.findFirst({
    where: { date: startOfDay(todayISO()), client: scope },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  return latest ? latest.createdAt.toISOString() : null;
}

/* ------------------------------------------------------------ the build */

/**
 * Run every rule and write what they produce.
 *
 * IT NEVER DELETES. The seeded lines are the demo's story and a reviewer expects
 * to find them; a build that cleared the day first would erase them the first
 * time the job ran at 08:00. Rules therefore UPSERT on (date, clientId), so a
 * rule may replace its own line for a client and can never remove somebody
 * else's.
 *
 * `position` is offset by the rule's index so lines keep the registry's order
 * within a flag group — see DIGEST_RULES.
 */
export async function buildFor(date: Date): Promise<{ written: number; byRule: Record<string, number> }> {
  const day = startOfDay(date.toISOString().slice(0, 10));
  const byRule: Record<string, number> = {};
  let written = 0;

  for (const [i, rule] of DIGEST_RULES.entries()) {
    let produced;
    try {
      produced = await rule.run(day);
    } catch (err) {
      /* one rule failing must not cost the morning its whole digest */
      logger.error({ rule: rule.key, err: (err as Error).message }, 'digest rule failed');
      byRule[rule.key] = 0;
      continue;
    }

    byRule[rule.key] = produced.length;

    for (const entry of produced) {
      const data = {
        flag: entry.flag,
        text: entry.text,
        evidence: entry.evidence,
        position: i * 100 + entry.position,
      };
      await prisma.digestEntry.upsert({
        where: { date_clientId: { date: day, clientId: entry.clientId } },
        create: { date: day, clientId: entry.clientId, ...data },
        update: data,
      });
      written += 1;
    }
  }

  return { written, byRule };
}
