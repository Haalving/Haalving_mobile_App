import { PILLAR_KEYS, upcomingCelebrations, type PillarKey } from '@haalving/shared';

import { prisma } from '../config/prisma.js';
import { freshCounts, generatedAt, type SeenTab } from './digest.service.js';
import { clientScopeWhere, type Scoper } from './scope.service.js';
import * as peopleService from './people.service.js';

/**
 * The Home screen's counters.
 *
 * EVERY COUNT IS SCOPED to the caller. A coach's Home must not report "42
 * clients" over a list showing six — a headline number that disagrees with the
 * page under it teaches people to distrust the whole screen.
 *
 * The stubs below are honest about being stubs: they return zero and are named,
 * so the console can render the real tiles today and light up as each board
 * lands rather than having its layout rebuilt on the day the data arrives.
 */

export interface HomeSummary {
  clients: {
    total: number;
    /** The demo splits these three deliberately — see the note in `summary()`. */
    active: number;
    paused: number;
    inactive: number;
    observation: number;
    poorna: number;
    svayam: number;
  };
  risk: {
    high: number;
    medium: number;
  };
  /**
   * Mean level per pillar across the SCORED clients, and how many those are.
   * Four numbers, never one — there is no combined level.
   */
  levels: {
    scored: number;
    mean: Record<PillarKey, number>;
  };
  celebrations: Array<{
    clientId: string;
    name: string;
    kind: 'birthday' | 'anniversary';
    dateISO: string;
    inDays: number;
  }>;
  pipeline: {
    open: number;
    byStage: Record<string, number>;
  };
  /** The newest team announcement, for the Home banner. Null when there is none. */
  announcement: {
    id: string;
    tag: string;
    text: string;
    ago: string;
    by: { id: string; name: string; roleTitle: string } | null;
  } | null;
  /** Not built yet. Named so the tiles exist and the layout is final. */
  queues: {
    meals: number;
    approvals: number;
    medical: number;
    reports: number;
  };
  notices: {
    unseen: number;
  };
  /** When today's digest was written — the header's "Digest generated 08:00". */
  generatedAt: string | null;
  /**
   * Unseen count per tab. `attention` is real; the rest are 0 until their board
   * exists — see `tabIds` in digest.service.ts, which names what each will read.
   */
  fresh: Record<SeenTab, number>;
}

export async function summary(user: Scoper): Promise<HomeSummary> {
  const scope = await clientScopeWhere(user);
  const and = (extra: object) => ({ AND: [scope, extra] });

  const [
    total,
    active,
    paused,
    inactive,
    observation,
    poorna,
    svayam,
    highRisk,
    medRisk,
    pipelineRows,
  ] = await Promise.all([
    prisma.client.count({ where: scope }),
    /*
     * Paused and Inactive are counted SEPARATELY, not rolled into "not active".
     *
     * A paused client is coming back and an inactive one is not, and the only
     * number a win-back call acts on is the second. Merging them hides it.
     */
    prisma.client.count({ where: and({ status: 'active' }) }),
    prisma.client.count({ where: and({ status: 'paused' }) }),
    prisma.client.count({ where: and({ status: 'inactive' }) }),
    prisma.client.count({ where: and({ observation: true }) }),
    prisma.client.count({ where: and({ plan: 'POORNA' }) }),
    prisma.client.count({ where: and({ plan: 'SVAYAM' }) }),
    prisma.client.count({ where: and({ risk: 'high' }) }),
    prisma.client.count({ where: and({ risk: 'medium' }) }),
    /* an arrival precedes its client record by definition, so it is counted on
       its own rather than through the client scope — an onboarding board that hid
       people until they became clients would be empty exactly when it matters */
    prisma.arrival.groupBy({
      by: ['step'],
      where: { status: 'ACTIVE' },
      _count: { _all: true },
    }),
  ]);

  /*
   * The level means.
   *
   * SCORED excludes clients in their observation window: they have levels of 1
   * because nothing has been assessed yet, not because they were assessed at 1.
   * Averaging them in drags every pillar toward the floor and makes the roster
   * look worse the more new clients it takes on.
   */
  const scoredRows = await prisma.client.findMany({
    where: and({ observation: false }),
    select: { levels: true },
  });

  const mean = Object.fromEntries(PILLAR_KEYS.map((k) => [k, 0])) as Record<PillarKey, number>;
  if (scoredRows.length) {
    for (const k of PILLAR_KEYS) {
      const sum = scoredRows.reduce((acc, r) => {
        const lv = r.levels as Record<string, number> | null;
        return acc + (Number(lv?.[k]) || 1);
      }, 0);
      /* one decimal, as the demo prints it: "L2.7" says more than "L3" */
      mean[k] = Math.round((sum / scoredRows.length) * 10) / 10;
    }
  }

  /* celebrations in the next week, resolved through the shared pure helper so
     the console and the client app cannot disagree about whose birthday it is */
  const celebRows = await prisma.client.findMany({
    where: and({ OR: [{ dob: { not: null } }, { anniv: { not: null } }] }),
    select: { id: true, name: true, dob: true, anniv: true },
  });
  const names = new Map(celebRows.map((c) => [c.id, c.name]));
  const celebrations = upcomingCelebrations(
    celebRows.map((c) => ({
      clientId: c.id,
      dob: c.dob ? c.dob.toISOString().slice(0, 10) : null,
      anniv: c.anniv ? c.anniv.toISOString().slice(0, 10) : null,
    })),
    7,
  ).map((cel) => ({ ...cel, name: names.get(cel.clientId) ?? '' }));

  /*
   * Every ACTIVE arrival is open by definition — an arrival stops being one at
   * promotion, which is the moment it becomes a Client. The old PipelineCard
   * table needed an 'active' stage to say "this one is already a client" and had
   * to subtract it here; Arrival says that with `status`, so the sum is the count.
   */
  const byStage: Record<string, number> = {};
  let open = 0;
  for (const row of pipelineRows) {
    byStage[row.step] = row._count._all;
    open += row._count._all;
  }

  const [fresh, digestAt, feed] = await Promise.all([
    freshCounts(user),
    generatedAt(user),
    /* the team feed's unread count and its newest post. It rides on Home because
       that is the only surface a coach shares with the Super Admin who wrote it —
       People & Access is not on a coach's sidebar at all. */
    peopleService.feedSummary({ id: user.id, role: user.role }),
  ]);

  /*
   * `notices` counts the TEAM FEED. The digest's own notices board is not built,
   * and its tabIds entry answers [] — so the badge would read zero on a page that
   * genuinely has something new to say. The feed is what that badge means today.
   */
  const freshWithFeed = { ...fresh, notices: feed.unseen };

  return {
    clients: { total, active, paused, inactive, observation, poorna, svayam },
    risk: { high: highRisk, medium: medRisk },
    levels: { scored: scoredRows.length, mean },
    celebrations,
    pipeline: { open, byStage },
    /* THE HOOK for the Home banner: the newest announcement travels with the
       summary so the page can render it without a second round trip. Drawing it is
       the Home module's job and is deliberately not done here. */
    announcement: feed.announcement,
    queues: { meals: 0, approvals: 0, medical: 0, reports: 0 },
    /* the Notices BOARD is not built; its unseen count comes from the same
       freshness bag once it is, and `fresh.notices` already has a home for it */
    notices: { unseen: fresh.notices },
    generatedAt: digestAt,
    fresh: freshWithFeed,
  };
}
