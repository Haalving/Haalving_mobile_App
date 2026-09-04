import type { DigestFlag, Prisma } from '@prisma/client';

import { prisma } from '../config/prisma.js';
import { calendarDay, todayISO } from '../utils/dates.js';
import { logger } from '../utils/logger.js';
import { DIGEST_RULES, RULE_STRIDE } from './digest-rules/index.js';
import { clientScopeWhere, type Scoper } from './scope.service.js';
import type { NoticeKind } from '@prisma/client';

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
  /* `DigestEntry.date` is a `@db.Date` — a calendar day, built in UTC */
  const today = calendarDay(todayISO());

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

export interface NoticeRow {
  id: string;
  /* FROM THE SCHEMA, not restated here. A hand-written union has to be edited
     every time a sweep learns a new kind, and the copy that was NOT edited is a
     type error in a file nobody was working on — which is exactly how
     CLIENT_RISK and SLA_BREACH arrived. */
  kind: NoticeKind;
  text: string;
  client: { id: string; name: string } | null;
  /** ISO — the board reads "X ago" from it. */
  createdAt: string;
  seen: boolean;
}

/**
 * The sweeps' outbox for ONE person — SLA nudges and escalations, session
 * reminders, leave decisions and celebrations, newest first. This is the
 * demo's `HV.noticesFor(me.id)`, surfaced on the work board.
 *
 * No client-scope clause: a Notice is already addressed to a recipient by the
 * flow that wrote it (`toId`), so the recipient is the scope.
 *
 * IT NO LONGER SYNTHESISES ANYTHING, and that is the change worth reading this
 * comment for. Until `Notice` carried a dedupe key, the at-risk and late-plate
 * lines could not be WRITTEN — a sweep that wrote them would write them again on
 * every run — so this function invented them from the morning's digest at read
 * time and handed them out pre-seen, because a row nobody could stamp had to
 * arrive already stamped. `@@unique([toId, dedupeKey])` removed that constraint,
 * and the 08:00 escalations step (escalations.service.ts) now writes them as
 * real rows with a real lifecycle. Two things follow, and both are the point:
 * the board's SLA lines can be read, acknowledged and clicked through to the
 * ticket they announce, and a line only appears for the person it was actually
 * addressed to rather than for everyone who could see the client.
 *
 * The shape is unchanged on purpose — `NoticesSection.tsx` reads exactly these
 * fields, and this board keeps meaning what it meant.
 */
export async function listNotices(user: Scoper): Promise<NoticeRow[]> {
  const rows = await prisma.notice.findMany({
    where: { toId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      kind: true,
      text: true,
      createdAt: true,
      seenAt: true,
      client: { select: { id: true, name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    text: r.text,
    client: r.client,
    createdAt: r.createdAt.toISOString(),
    seen: r.seenAt !== null,
  }));
}

/**
 * Viewing the board IS the acknowledgement — stamp every unseen notice seen, the
 * demo's `HV.seenNotices(me.id)`. Idempotent: a second view stamps nothing.
 */
export async function markNoticesSeen(user: Scoper): Promise<{ seen: number }> {
  const res = await prisma.notice.updateMany({
    where: { toId: user.id, seenAt: null },
    data: { seenAt: new Date() },
  });
  return { seen: res.count };
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
  const today = calendarDay(todayISO());

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
    where: { date: calendarDay(todayISO()), client: scope },
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
export async function buildFor(
  date: Date,
  only?: string[],
): Promise<{ written: number; byRule: Record<string, number> }> {
  /*
   * THE DAY IS THE LOCAL ONE, and `todayISO` is what reads it off `date`.
   *
   * `date.toISOString().slice(0,10)` is the UTC calendar day, and between local
   * midnight and 05:30 IST that is YESTERDAY — so a line rebuilt when a client
   * logs a meal at 1am was written to a day no reader asks for and vanished.
   * Every reader of this column builds its key with `calendarDay(todayISO())`;
   * the writer has to mean the same day.
   */
  const day = calendarDay(todayISO(date));
  const byRule: Record<string, number> = {};
  let written = 0;

  /*
   * THE LOUDEST RULE KEEPS THE CLIENT, and this set is what enforces it.
   *
   * One line per client per morning is a database constraint
   * (`@@unique([date, clientId])`), so when two rules both have something to say
   * about one person, one of them must lose. `DIGEST_RULES` is ordered loudest
   * first for exactly this — silence, then a falling rating, then an overdue
   * plate, then the scheduled things that are not problems at all.
   *
   * An unguarded upsert gives the opposite: every rule overwrites the one before
   * it, so the LAST and quietest writer wins and a client who has logged nothing
   * for three days is described by their review date. So the first rule to claim
   * a client keeps them, and a quieter rule's line about the same person is
   * dropped rather than written over the top.
   */
  const claimed = new Set<string>();

  for (const [i, rule] of DIGEST_RULES.entries()) {
    let produced;
    try {
      /*
       * THE RULES ARE HANDED THE MOMENT, not the midnight the row is keyed by.
       *
       * "This plate is 38 minutes past its promise" and "nothing since Tuesday"
       * are both arithmetic against NOW. Passing midnight made every such rule
       * measure to the start of the day instead: an SLA rule comparing against
       * 00:00 finds nothing captured today late, ever, because nothing captured
       * today is older than today began. The row is still filed under `day`.
       */
      produced = await rule.run(date, only);
    } catch (err) {
      /* one rule failing must not cost the morning its whole digest */
      logger.error({ rule: rule.key, err: (err as Error).message }, 'digest rule failed');
      byRule[rule.key] = 0;
      continue;
    }

    let kept = 0;

    for (const entry of produced) {
      if (claimed.has(entry.clientId)) continue;
      claimed.add(entry.clientId);

      const data = {
        flag: entry.flag,
        text: entry.text,
        evidence: entry.evidence,
        /* the rule's index, times the stride — the sort order within a flag
           group, and the only record of WHICH rule wrote a line. Clamped so a
           rule can never number a line into the next rule's range, which is
           what `ruleOf` reads back; see the note beside it. */
        position: i * RULE_STRIDE + Math.min(Math.max(entry.position, 0), RULE_STRIDE - 1),
      };
      await prisma.digestEntry.upsert({
        where: { date_clientId: { date: day, clientId: entry.clientId } },
        create: { date: day, clientId: entry.clientId, ...data },
        update: data,
      });
      written += 1;
      kept += 1;
    }

    byRule[rule.key] = kept;
  }

  /*
   * YESTERDAY'S LINES ARE NOT TODAY'S. A client who was silent on Tuesday and
   * logged a plate on Wednesday morning must not still be carrying Tuesday's
   * HIGH — the row is keyed by day, so today's build simply never wrote them,
   * and anything left over for today from an earlier run of this same morning is
   * a line no rule stands behind any more.
   */
  const stale = await prisma.digestEntry.deleteMany({
    where: {
      date: day,
      /* SCOPED TO THE ROUND THAT JUST RAN. A refresh for one client must clear
         that client's stale line and nobody else's — an unscoped sweep after a
         single-client run would delete the whole morning's digest and leave one
         line standing. */
      clientId: only ? { in: only, notIn: [...claimed] } : { notIn: [...claimed] },
    },
  });
  if (stale.count) logger.info({ cleared: stale.count }, 'digest lines cleared');

  return { written, byRule };
}

/**
 * Rebuild one client's digest line, now, because they just did something.
 *
 * THE DIGEST IS A MORNING ARTEFACT THAT MUST NOT BE A MORNING FOSSIL. The 08:00
 * job reads a roster that was true at 08:00; a client who photographs lunch at
 * two o'clock has just falsified the line that calls them silent, and a coach
 * opening Home at three should see that. So every write a CLIENT makes that a
 * rule can see — a plate, a message — asks for their own line to be rewritten.
 *
 * FIRE AND FORGET, DELIBERATELY. This is called from the request that logs the
 * meal, and a client's log must never fail because the digest could not be
 * rebuilt. The caller does not await it and the error is logged, not raised:
 * the worst case is a line that stays stale until 08:00 tomorrow, which is
 * exactly where the product was before this existed.
 *
 * It does NOT push. The console's Home refetches on mount and on focus, so the
 * next look is current; a socket lane for staff digests would need a room per
 * coach and a subscription on Home, which is a bigger change than the freshness
 * it would buy.
 */
export function refreshFor(clientId: string): void {
  void buildFor(new Date(), [clientId])
    .then(({ written }) => {
      if (written) logger.debug({ clientId }, 'digest line refreshed');
    })
    .catch((err: Error) => logger.error({ clientId, err: err.message }, 'digest refresh failed'));
}

