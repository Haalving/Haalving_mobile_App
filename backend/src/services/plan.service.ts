import { PILLAR_KEYS, pillarForRole } from '@haalving/shared';

import { prisma } from '../config/prisma.js';
import { can } from '../middleware/authorize.js';
import { ApiError } from '../utils/apiResponse.js';
import * as audit from './audit.service.js';
import { clientScopeWhere, type Scoper } from './scope.service.js';

/**
 * WHICH TEMPLATE A CLIENT IS ON — the join between the Catalog and a person.
 *
 * A `PlanTemplate` is written once, for a level and a track, by whoever owns that
 * library. Choosing one FOR A CLIENT is a different decision: a different seat
 * makes it, at a different time, about one person rather than about a level. This
 * service is only that second decision.
 *
 * THE RULE, ported from `planGate` (console-clients.js:1159) with its own reason
 * recorded there:
 *
 *   `assignPlan`   assign and edit EVERY pillar   — Super Admin, Ops Head, Haalving Coach
 *   `editCatalog`  assign and edit their OWN      — the pillar coaches
 *   everybody else read                           — the Doctor, the Super User
 *
 * The middle line is the one worth keeping in view. TJ's note on 17 Aug: "the
 * person who knows this client's yoga best chooses their yoga". A Yoga Coach may
 * set this client's yoga plan and may not touch their nutrition — the same matrix
 * `canEditLibrary` uses for authoring, applied to assigning.
 *
 * READING IS SEPARATE FROM WRITING, and it is scope rather than permission. If you
 * can see the client you can see their plan; the Doctor reads every plan of every
 * client she carries and can set none of them.
 */

export interface PlanActor extends Scoper {}

/** The four pillars a plan can exist for. Motivation is a library, not a pillar. */
const PILLARS: readonly string[] = PILLAR_KEYS;

function assertPillar(pillar: string): void {
  if (!PILLARS.includes(pillar)) {
    throw ApiError.badRequest(`${pillar} is not a pillar.`);
  }
}

/**
 * May this person set THIS pillar's plan for a client?
 *
 * Deliberately the same shape as `canEditLibrary` in catalog.service — one matrix
 * expressed twice would drift, and the drift would be invisible: a coach who could
 * write a yoga template but not assign one, or worse the reverse.
 */
export async function mayAssign(actor: PlanActor, pillar: string): Promise<boolean> {
  if (await can(actor.role, 'assignPlan')) return true;
  if (!(await can(actor.role, 'editCatalog'))) return false;
  return pillarForRole(actor.role) === pillar;
}

/** Which pillars this person may set, so the console can draw the tab correctly. */
export async function assignablePillars(actor: PlanActor): Promise<string[]> {
  const out: string[] = [];
  for (const p of PILLARS) if (await mayAssign(actor, p)) out.push(p);
  return out;
}

/**
 * Refuse, and record it.
 *
 * The message names neither the permission nor the pillar that would have worked:
 * a refusal that explains itself precisely is a map of the matrix for anyone
 * probing it. `recordDenial` on the route says the same thing about paths.
 */
async function denyAssign(actor: PlanActor, clientId: string, pillar: string): Promise<never> {
  await audit.record({
    actorId: actor.id,
    action: 'denied',
    subjectType: 'clientPlan',
    subjectId: clientId,
    reason: `Blocked: plan.assign.${pillar}`,
    meta: { pillar, role: actor.role },
  });
  throw ApiError.forbidden('Not available for your role.');
}

/**
 * The client, if this person may see them at all.
 *
 * SCOPE FIRST, ALWAYS. Without it a coach could read — and with the right role,
 * write — the plan of somebody who is not theirs, simply by knowing an id. The
 * answer for a client outside the scope is 404 rather than 403: a 403 confirms the
 * client exists.
 */
async function reachableClient(actor: PlanActor, clientId: string) {
  const scope = await clientScopeWhere(actor);
  const c = await prisma.client.findFirst({
    where: { AND: [{ id: clientId }, scope] },
    select: { id: true, name: true, levels: true, track: true },
  });
  if (!c) throw ApiError.notFound('No such client.');
  return c;
}

/**
 * `GET /clients/:id/plan` — the four pillars, and what each is on.
 *
 * EVERY PILLAR IS RETURNED, including the ones with no row. A tab that listed only
 * the assigned pillars would make "not set up yet" invisible, and the whole point
 * of this screen is seeing which of the four are still empty.
 */
export async function getPlan(actor: PlanActor, clientId: string) {
  const client = await reachableClient(actor, clientId);

  const rows = await prisma.clientPlan.findMany({
    where: { clientId },
    include: {
      template: { select: { id: true, name: true, pillar: true, level: true, track: true, published: true } },
      assignedBy: { select: { id: true, name: true } },
    },
  });
  const byPillar = new Map(rows.map((r) => [r.pillar, r]));
  const mayEdit = await assignablePillars(actor);

  return {
    clientId: client.id,
    clientName: client.name,
    /* what the console needs to decide which pickers to draw, answered by the
       server so the two can never disagree about who may do what */
    mayAssign: mayEdit,
    pillars: PILLARS.map((pillar) => {
      const row = byPillar.get(pillar);
      return {
        pillar,
        /*
         * THREE STATES, NOT TWO, and the demo names all three:
         *   no row          — the pillar has never been opened
         *   row, no template — "called, but the client has no plan"
         *   row + template   — assigned, draft or live
         */
        state: !row ? ('UNOPENED' as const) : row.templateId ? ('ASSIGNED' as const) : ('CALLED' as const),
        template: row?.template ?? null,
        draft: row?.draft ?? null,
        assignedBy: row?.assignedBy ?? null,
        assignedAt: row?.assignedAt?.toISOString() ?? null,
        /* per pillar, because a Yoga Coach may set one of these four and not the
           other three — a single page-level flag could not say that */
        mayAssign: mayEdit.includes(pillar),
      };
    }),
  };
}

/**
 * `PUT /clients/:id/plan/:pillar` — put this client on this template.
 *
 * REPLACES rather than appends. A client has one nutrition plan, not a stack of
 * them; the audit row is what remembers the one before.
 *
 * The template must MATCH THE PILLAR. Assigning a yoga template to the nutrition
 * seat would pass every permission check and produce a plan nobody could act on,
 * so it is refused here rather than left to the screen not to offer it.
 */
export async function assignTemplate(
  actor: PlanActor,
  clientId: string,
  pillar: string,
  templateId: string | null,
  draft = true,
) {
  assertPillar(pillar);
  const client = await reachableClient(actor, clientId);
  if (!(await mayAssign(actor, pillar))) await denyAssign(actor, clientId, pillar);

  let template = null;
  if (templateId) {
    template = await prisma.planTemplate.findUnique({
      where: { id: templateId },
      select: { id: true, name: true, pillar: true, published: true },
    });
    if (!template) throw ApiError.notFound('No such template.');
    if (template.pillar !== pillar) {
      throw ApiError.badRequest(`${template.name} is a ${template.pillar} template.`);
    }
    /*
     * A DRAFT TEMPLATE MAY NOT BE MADE LIVE.
     *
     * It may be assigned — a coach lining a client up against something still in
     * review is ordinary work — but it cannot leave draft, because publishing is
     * the step that says somebody stands behind the content.
     */
    if (!template.published && !draft) {
      throw ApiError.badRequest(`${template.name} is not published yet. Assign it as a draft.`);
    }
  }

  const before = await prisma.clientPlan.findUnique({
    where: { clientId_pillar: { clientId, pillar } },
    select: { templateId: true, template: { select: { name: true } } },
  });

  const row = await prisma.clientPlan.upsert({
    where: { clientId_pillar: { clientId, pillar } },
    create: {
      clientId,
      pillar,
      templateId,
      draft,
      assignedById: templateId ? actor.id : null,
      assignedAt: templateId ? new Date() : null,
    },
    update: {
      templateId,
      draft,
      assignedById: templateId ? actor.id : null,
      assignedAt: templateId ? new Date() : null,
    },
    include: {
      template: { select: { id: true, name: true, pillar: true, level: true, track: true, published: true } },
      assignedBy: { select: { id: true, name: true } },
    },
  });

  await audit.record({
    actorId: actor.id,
    action: templateId ? 'plan.assigned' : 'plan.cleared',
    subjectType: 'clientPlan',
    subjectId: clientId,
    meta: {
      pillar,
      client: client.name,
      template: template?.name ?? null,
      draft,
      /* what it REPLACED — the only record of the plan this client was on before,
         since the row itself is overwritten */
      replaced: before?.template?.name ?? null,
    },
  });

  return row;
}

/**
 * `POST /clients/:id/plan/:pillar/publish` — the plan stops being a draft.
 *
 * Separate from assigning on purpose. Choosing a template is a coach thinking;
 * taking it out of draft is the moment it becomes what the client is actually on,
 * and the client app reads only the latter.
 */
export async function publishPlan(actor: PlanActor, clientId: string, pillar: string) {
  assertPillar(pillar);
  const client = await reachableClient(actor, clientId);
  if (!(await mayAssign(actor, pillar))) await denyAssign(actor, clientId, pillar);

  const row = await prisma.clientPlan.findUnique({
    where: { clientId_pillar: { clientId, pillar } },
    include: { template: { select: { id: true, name: true, published: true } } },
  });
  if (!row) throw ApiError.notFound('No plan for that pillar.');
  if (!row.templateId) throw ApiError.badRequest('Choose a template before publishing the plan.');
  if (!row.template?.published) {
    throw ApiError.badRequest(`${row.template?.name} is not published yet.`);
  }
  if (!row.draft) return row;

  const next = await prisma.clientPlan.update({
    where: { clientId_pillar: { clientId, pillar } },
    data: { draft: false },
    include: {
      template: { select: { id: true, name: true, pillar: true, level: true, track: true, published: true } },
      assignedBy: { select: { id: true, name: true } },
    },
  });

  await audit.record({
    actorId: actor.id,
    action: 'plan.published',
    subjectType: 'clientPlan',
    subjectId: clientId,
    meta: { pillar, client: client.name, template: row.template?.name ?? null },
  });

  return next;
}

/**
 * The templates that could go in this pillar's seat, for the picker.
 *
 * NARROWED TO THE PILLAR AND NOTHING ELSE. Track and level are both MARKED, not
 * filtered, and the two decisions are the same decision.
 *
 * This filtered by the client's track at first, reasoning that a template is
 * written for a track and offering the athlete's book to a sedentary client
 * offers a mistake. But level was deliberately left unfiltered on the grounds that
 * a coach may hold somebody a level back — and a coach may just as deliberately
 * put a deconditioned client on the gentler track's plan. Filtering one and
 * marking the other was inconsistent, and the cost was real: a client on a track
 * with one template got a picker that could not change anything.
 *
 * So the rule is the demo's own throughout — say which is the obvious choice,
 * never make it. `onTrack` and `onLevel` carry that, and the client's own track
 * sorts to the top.
 */
export async function templatesFor(actor: PlanActor, clientId: string, pillar: string) {
  assertPillar(pillar);
  const client = await reachableClient(actor, clientId);
  const level = (client.levels as Record<string, number> | null)?.[pillar] ?? null;

  const rows = await prisma.planTemplate.findMany({
    where: { pillar },
    orderBy: [{ level: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, pillar: true, level: true, track: true, published: true },
  });

  const marked = rows.map((t) => ({
    ...t,
    onTrack: !!client.track && t.track === client.track,
    onLevel: level !== null && t.level === level,
  }));
  /* the client's own track first, then by level — a stable sort, so the level
     ordering the query already applied survives inside each group */
  marked.sort((a, b) => Number(b.onTrack) - Number(a.onTrack));

  return {
    pillar,
    track: client.track,
    level,
    templates: marked,
  };
}
