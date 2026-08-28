import { prisma } from '../config/prisma.js';
import { clientScopeWhere, type Scoper } from './scope.service.js';

/**
 * The Home screen's counters.
 *
 * EVERY COUNT IS SCOPED. A coach's Home must not report "42 clients" over a list
 * showing six — a headline number that disagrees with the page under it is worse
 * than no number, because it teaches people to distrust the whole screen.
 *
 * The stubs below are honest about being stubs: they return zero and are named,
 * so the console can render the real tiles today and light up as each board lands
 * rather than having its layout rebuilt on the day the data arrives.
 */

export interface HomeSummary {
  clients: {
    total: number;
    active: number;
    observation: number;
    poorna: number;
    svayam: number;
  };
  pipeline: {
    open: number;
    byStage: Record<string, number>;
  };
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
}

export async function summary(user: Scoper): Promise<HomeSummary> {
  const scope = await clientScopeWhere(user);

  const [total, active, observation, poorna, svayam, pipelineRows] = await Promise.all([
    prisma.client.count({ where: scope }),
    prisma.client.count({ where: { AND: [scope, { status: 'active' }] } }),
    prisma.client.count({ where: { AND: [scope, { observation: true }] } }),
    prisma.client.count({ where: { AND: [scope, { plan: 'POORNA' }] } }),
    prisma.client.count({ where: { AND: [scope, { plan: 'SVAYAM' }] } }),
    /* a pipeline card can precede its client record, so it is counted on its own
       rather than through the client scope — an onboarding board that hid
       prospects until they became clients would be empty exactly when it matters */
    prisma.pipelineCard.groupBy({ by: ['stage'], _count: { _all: true } }),
  ]);

  const byStage: Record<string, number> = {};
  let open = 0;
  for (const row of pipelineRows) {
    byStage[row.stage] = row._count._all;
    if (row.stage !== 'active') open += row._count._all;
  }

  return {
    clients: { total, active, observation, poorna, svayam },
    pipeline: { open, byStage },
    queues: { meals: 0, approvals: 0, medical: 0, reports: 0 },
    notices: { unseen: 0 },
  };
}
