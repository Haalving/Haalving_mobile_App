import { Prisma } from '@prisma/client';
import {
  TEMPLATE_PILLARS,
  isSessionPillar,
  optId,
  optX,
  pillarForRole,
  specFor,
  stageRoleOf,
  to24,
  type ChainStep,
  type OptionEntry,
  type Slot,
} from '@haalving/shared';

import { prisma } from '../config/prisma.js';
import { can } from '../middleware/authorize.js';
import { ApiError } from '../utils/apiResponse.js';
import { todayISO } from '../utils/dates.js';
import * as audit from './audit.service.js';
import { hhmm } from './client-app/calendar-context.js';
import * as config from './config.service.js';
import { clientScopeWhere, type Scoper } from './scope.service.js';

/**
 * THE CLIENT'S PLAN — a ticket per pillar, ported from the demo's Plan tab
 * (console-clients.js:1041-2330: `planHtml`, `assignSheet`, `editDaySheet`,
 * `approvePlan`, `discardDraft`, `timeSheet`, `doseSheet`, `targetsSheet`,
 * `saveTemplateSheet`).
 *
 * A `PlanTemplate` is the master recipe book, written once for a level and a
 * track by whoever owns that library. Calling one FOR A CLIENT writes a TICKET,
 * and the client is served only what the chef has signed. Every edit a coach
 * makes — the template, a day, the client's own hour, dose or targets — lands on
 * the ticket; the console reads the ticket; the client app reads the LIVE
 * columns and nothing else. "Approve — publish" copies the ticket onto the live
 * plan wholesale; "Discard draft" throws it away.
 *
 * Two rules, both load-bearing, both the demo's own:
 *
 *   1. NOTHING outside the console reads the ticket. `calendar-context.ts` reads
 *      `templateId: { not: null }` rows and their live columns — that is the
 *      whole of "the client sees nothing until you approve".
 *   2. The ticket's `overrides` is a FULL deep copy, never a sparse patch.
 *      Approve replaces the live overrides wholesale, so a patch would silently
 *      delete every day approved before this draft was opened.
 *
 * WHO MAY TOUCH WHAT, ported from `planGate` (console-clients.js:1159):
 *
 *   `assignPlan`   assign and edit EVERY pillar   — Super Admin, Ops Head, Haalving Coach
 *   `editCatalog`  assign and edit their OWN      — the pillar coaches
 *   everybody else read                           — the Doctor, the Super User
 *
 * The middle line is the one worth keeping in view. TJ's note on 17 Aug: "the
 * person who knows this client's yoga best chooses their yoga". Motivation is a
 * library nobody's pillar owns, so only `assignPlan` holders set it.
 *
 * READING IS SEPARATE FROM WRITING, and it is scope rather than permission. If you
 * can see the client you can see their plan; the Doctor reads every plan of every
 * client she carries and can set none of them.
 */

export interface PlanActor extends Scoper {}

/* ------------------------------------------------------------------ types */

type Overrides = Record<string, { slots: Slot[] }>;
type Dose = Record<string, number | string>;
type Targets = Record<string, number>;

/** The staged draft as the row stores it — the demo's `a.draft`. */
interface Ticket {
  templateId: string | null;
  overrides: Overrides;
  time?: string | null;
  dose?: Dose | null;
  targets?: Targets | null;
  byId: string | null;
  at: string;
}

interface LogEntry {
  act: string;
  byId: string | null;
  at: string;
}

type TemplateDays = Record<string, { slots?: Slot[]; targets?: Targets | null }>;

/** The columns of a template the tab prints without its days. */
const TEMPLATE_REF = {
  id: true,
  name: true,
  notes: true,
  pillar: true,
  level: true,
  track: true,
  published: true,
} satisfies Prisma.PlanTemplateSelect;

type TemplateRefRow = Prisma.PlanTemplateGetPayload<{ select: typeof TEMPLATE_REF }>;

interface TemplateRef {
  id: string;
  name: string;
  desc: string;
  pillar: string;
  level: number;
  track: string;
  published: boolean;
}

interface Person {
  id: string;
  name: string;
}

const toRef = (t: TemplateRefRow | null | undefined): TemplateRef | null =>
  t
    ? {
        id: t.id,
        name: t.name,
        desc: t.notes ?? '',
        pillar: t.pillar,
        level: t.level,
        track: t.track,
        published: t.published,
      }
    : null;

const PLAN_INCLUDE = {
  template: { select: TEMPLATE_REF },
  assignedBy: { select: { id: true, name: true } },
} satisfies Prisma.ClientPlanInclude;

type PlanRow = Prisma.ClientPlanGetPayload<{ include: typeof PLAN_INCLUDE }>;

/** The plan's history keeps the last thirty acts — enough to read, not a ledger. */
const LOG_KEEP = 30;

/* ---------------------------------------------------------------- helpers */

const PILLARS: readonly string[] = TEMPLATE_PILLARS;

function assertPillar(pillar: string): void {
  if (!PILLARS.includes(pillar)) {
    throw ApiError.badRequest(`${pillar} is not a pillar.`);
  }
}

const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const first = (name: string): string => name.trim().split(/\s+/)[0] ?? name;

const nonEmpty = (o: object | null | undefined): boolean => !!o && Object.keys(o).length > 0;

/** The demo's `fmtTime`: 1155 → "7:15 pm". Only the plan's log speaks this way. */
function fmtTime(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h % 12 || 12}:${String(mm).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

function hmToMin(t: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

/**
 * The category's own name, from the one list that holds it. Capitalising the raw
 * key printed "Athlete" on the record while the Catalog printed "athlete" for
 * the same category — two spellings of one thing, from two different rules.
 */
async function trackLabel(track: string | null | undefined): Promise<string> {
  if (!track) return '';
  const cats = await config.getCategories();
  return cats.find((c) => c.key === track)?.name ?? String(track);
}

const rowOverrides = (r: { overrides: Prisma.JsonValue }): Overrides =>
  (r.overrides as unknown as Overrides | null) ?? {};
const rowTicket = (r: { ticket: Prisma.JsonValue }): Ticket | null =>
  (r.ticket as unknown as Ticket | null) ?? null;
const rowLog = (r: { log: Prisma.JsonValue }): LogEntry[] =>
  (r.log as unknown as LogEntry[] | null) ?? [];
const rowDose = (r: { dose: Prisma.JsonValue }): Dose | null => (r.dose as unknown as Dose | null) ?? null;
const rowTargets = (r: { targets: Prisma.JsonValue }): Targets | null =>
  (r.targets as unknown as Targets | null) ?? null;

const json = (v: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull =>
  v === null || v === undefined ? Prisma.JsonNull : (v as Prisma.InputJsonValue);

/** Append to the plan's own history, keeping the last thirty. */
function pushLog(log: LogEntry[], act: string, byId: string): LogEntry[] {
  const next = [...log, { act, byId, at: new Date().toISOString() }];
  return next.length > LOG_KEEP ? next.slice(next.length - LOG_KEEP) : next;
}

/** The day keys of a template, as numbers, in order. */
function dayKeys(days: TemplateDays | null | undefined): number[] {
  return Object.keys(days ?? {})
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
}

/* --------------------------------------------------------------- the gate */

/**
 * May this person set THIS pillar's plan for a client?
 *
 * Deliberately the same shape as `canEditLibrary` in catalog.service — one matrix
 * expressed twice would drift, and the drift would be invisible: a coach who could
 * write a yoga template but not assign one, or worse the reverse. `pillarForRole`
 * never answers `motivation`, which is how the film library stays with Ops.
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

async function requireAssign(actor: PlanActor, clientId: string, pillar: string): Promise<void> {
  if (!(await mayAssign(actor, pillar))) await denyAssign(actor, clientId, pillar);
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
    select: {
      id: true,
      name: true,
      levels: true,
      track: true,
      cycle: true,
      cycleDay: true,
      shapeVersion: true,
    },
  });
  if (!c) throw ApiError.notFound('No such client.');
  return c;
}

type Client = Awaited<ReturnType<typeof reachableClient>>;

const levelOf = (c: Client, pillar: string): number =>
  Number((c.levels as Record<string, number> | null)?.[pillar] ?? 1) || 1;

/* ----------------------------------------------------------- the reading */

/**
 * The session bookings for one client, keyed by pillar then cycle-day — the same
 * sliding axis `calendar-context.ts` keys on: a one-off session Task carries an
 * absolute date, and its cycle-day is the client's current day plus the date's
 * offset from today.
 */
async function bookingsFor(c: Client) {
  const today = new Date(`${todayISO()}T00:00:00.000Z`).getTime();
  const tasks = await prisma.task.findMany({
    where: { clientId: c.id, kind: 'SESSION', pillar: { in: ['fitness', 'yoga', 'wellness'] } },
    select: {
      id: true,
      pillar: true,
      date: true,
      startMin: true,
      durMin: true,
      link: true,
      assigneeIds: true,
    },
    orderBy: [{ date: 'asc' }, { startMin: 'asc' }],
  });
  const coachIds = [...new Set(tasks.map((t) => t.assigneeIds[0]).filter((v): v is string => !!v))];
  const coaches = coachIds.length
    ? await prisma.user.findMany({ where: { id: { in: coachIds } }, select: { id: true, name: true } })
    : [];
  const coachById = new Map(coaches.map((u) => [u.id, u]));

  const out: Record<string, Record<number, unknown>> = {};
  for (const t of tasks) {
    if (!t.date || !t.pillar) continue;
    const d = c.cycleDay + Math.round((t.date.getTime() - today) / 86_400_000);
    const byDay = (out[t.pillar] ??= {});
    /* the first booking on a day wins, matching calendarFor's reconciliation */
    if (byDay[d]) continue;
    const coach = t.assigneeIds[0] ? (coachById.get(t.assigneeIds[0]) ?? null) : null;
    byDay[d] = {
      taskId: t.id,
      time: hhmm(t.startMin),
      startMin: t.startMin ?? 0,
      durMin: t.durMin ?? 0,
      coach,
      joinable: !!t.link,
      link: t.link,
    };
  }
  return out;
}

/** The templates a set of ids names, with their days, keyed by id. */
async function templatesWithDays(ids: Iterable<string | null | undefined>) {
  const want = [...new Set([...ids].filter((v): v is string => !!v))];
  const rows = want.length
    ? await prisma.planTemplate.findMany({ where: { id: { in: want } }, select: { ...TEMPLATE_REF, days: true } })
    : [];
  const out: Record<string, TemplateRef & { days: TemplateDays }> = {};
  for (const t of rows) out[t.id] = { ...toRef(t)!, days: (t.days as unknown as TemplateDays | null) ?? {} };
  return out;
}

/** Everyone the rows name — authors of log lines and tickets — resolved once. */
async function peopleFor(rows: PlanRow[]): Promise<Map<string, Person>> {
  const ids = new Set<string>();
  for (const r of rows) {
    for (const l of rowLog(r)) if (l.byId) ids.add(l.byId);
    const t = rowTicket(r);
    if (t?.byId) ids.add(t.byId);
  }
  const people = ids.size
    ? await prisma.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true } })
    : [];
  return new Map(people.map((p) => [p.id, p]));
}

/**
 * ONE PILLAR'S BLOCK — the demo's `planHtml` derivations (`draftView`,
 * `stagedVal`, `isStaged`, `isStagedKey`, `hasDraft`, `unpublished`), answered
 * by the server so the tab never chooses between the ticket and the plate itself.
 */
function pillarBlock(
  pillar: string,
  row: PlanRow | null,
  templates: Record<string, TemplateRef & { days: TemplateDays }>,
  mayHere: boolean,
  people: Map<string, Person>,
  bookings: Record<number, unknown>,
) {
  const sp = specFor(pillar);
  const who = (id: string | null | undefined): Person | null => (id ? (people.get(id) ?? null) : null);
  const ref = (id: string | null): TemplateRef | null => {
    if (!id) return null;
    const t = templates[id];
    return t ? { id: t.id, name: t.name, desc: t.desc, pillar: t.pillar, level: t.level, track: t.track, published: t.published } : null;
  };

  const live = {
    templateId: row?.templateId ?? null,
    template: row?.template ? toRef(row.template) : null,
    overrides: row ? rowOverrides(row) : {},
    time: row?.time ?? null,
    dose: row ? rowDose(row) : null,
    targets: row ? rowTargets(row) : null,
  };

  const tk = row ? rowTicket(row) : null;
  const ticket = tk
    ? {
        templateId: tk.templateId ?? null,
        template: ref(tk.templateId ?? null),
        overrides: tk.overrides ?? {},
        ...('time' in tk ? { time: tk.time ?? null } : {}),
        ...('dose' in tk ? { dose: tk.dose ?? null } : {}),
        ...('targets' in tk ? { targets: tk.targets ?? null } : {}),
        by: who(tk.byId),
        at: tk.at,
      }
    : null;

  /* the console reads the TICKET — the draft when one is open, else the live
     plan. A scalar the ticket mentions is staged, '' included ('clear this');
     one it does not mention reads live. This is the ONLY place that choice is
     made. */
  const view = tk
    ? {
        templateId: tk.templateId ?? null,
        template: ref(tk.templateId ?? null),
        overrides: tk.overrides ?? {},
        time: 'time' in tk ? tk.time || null : live.time,
        dose: 'dose' in tk ? (nonEmpty(tk.dose) ? tk.dose! : null) : live.dose,
        targets: 'targets' in tk ? (nonEmpty(tk.targets) ? tk.targets! : null) : live.targets,
      }
    : live;

  /* does a day read differently on the ticket than on the plate? A called
     template changes every day at once, so say so on each day that has one. */
  let stagedDays: number[] = [];
  if (tk) {
    if (tk.templateId !== live.templateId) {
      stagedDays = dayKeys(view.templateId ? templates[view.templateId]?.days : null);
    } else {
      const days = new Set([...Object.keys(tk.overrides ?? {}), ...Object.keys(live.overrides)]);
      stagedDays = [...days]
        .map(Number)
        .filter((d) => {
          const dr = (tk.overrides ?? {})[String(d)]?.slots ?? null;
          const lv = live.overrides[String(d)]?.slots ?? null;
          return JSON.stringify(dr) !== JSON.stringify(lv);
        })
        .sort((a, b) => a - b);
    }
  }

  /* '', null and absent all mean the same thing — not set. Comparing them raw
     marks "cleared something that was never there" as a staged change. */
  const stagedKeys = (['time', 'dose', 'targets'] as const).filter((k) => {
    if (!tk || !(k in tk)) return false;
    const d = tk[k];
    const l = live[k];
    const dSet = k === 'time' ? !!d : nonEmpty(d as object | null);
    const lSet = k === 'time' ? !!l : nonEmpty(l as object | null);
    if (!dSet && !lSet) return false;
    return JSON.stringify(d ?? null) !== JSON.stringify(l ?? null);
  });

  return {
    pillar,
    name: sp.name,
    cls: sp.cls,
    /* per pillar, because a Yoga Coach may set one of these five and not the
       other four — a single page-level flag could not say that */
    mayAssign: mayHere,
    live,
    ticket,
    view,
    hasDraft: !!tk,
    /* never approved: the pillar has been called but the client has no plan */
    unpublished: !!tk && !live.templateId,
    modified: nonEmpty(live.overrides),
    edits: Object.keys(view.overrides ?? {}).length,
    stagedDays,
    stagedKeys,
    assignedBy: row?.assignedBy ?? null,
    assignedAt: row?.assignedAt?.toISOString() ?? null,
    log: (row ? rowLog(row) : []).map((l) => ({ act: l.act, by: who(l.byId), at: l.at })),
    bookings: isSessionPillar(pillar) ? bookings : {},
  };
}

/** One pillar's block after a write, with the templates it references — what every write returns. */
async function blockFor(c: Client, pillar: string, actor: PlanActor) {
  const row = await prisma.clientPlan.findUnique({
    where: { clientId_pillar: { clientId: c.id, pillar } },
    include: PLAN_INCLUDE,
  });
  const templates = await templatesWithDays([row?.templateId, rowTicket(row ?? { ticket: null })?.templateId]);
  const people = await peopleFor(row ? [row] : []);
  const bookings = isSessionPillar(pillar) ? ((await bookingsFor(c))[pillar] ?? {}) : {};
  return {
    ...pillarBlock(pillar, row, templates, await mayAssign(actor, pillar), people, bookings),
    templates,
  };
}

/** The newest sign-off on a template, as the Catalog prints it. */
function approvalOf(
  ap: { status: string; stage: number; chain: Prisma.JsonValue } | undefined,
  titles: Record<string, string>,
) {
  if (!ap) return null;
  const chain = (ap.chain as unknown as ChainStep[] | null) ?? [];
  const waitingOn = ap.status === 'SUBMITTED' ? stageRoleOf(chain, ap.stage) : null;
  return { status: ap.status, waitingOn, waitingOnTitle: waitingOn ? (titles[waitingOn] ?? waitingOn) : null };
}

/**
 * `GET /clients/:id/plan` — the five shelves, and what each is on.
 *
 * EVERY PILLAR IS RETURNED, including the ones with no row. A tab that listed only
 * the assigned pillars would make "not set up yet" invisible, and the whole point
 * of this screen is seeing which shelves are still empty. Every template any
 * pillar's live or ticket names rides along WITH its days, so the tab draws the
 * day grid without a second call.
 */
export async function getPlan(actor: PlanActor, clientId: string) {
  const client = await reachableClient(actor, clientId);

  const [rows, shape, mayEdit, assignAll, editTemplates, bookings] = await Promise.all([
    prisma.clientPlan.findMany({ where: { clientId }, include: PLAN_INCLUDE }),
    config.getShapeFor(client),
    assignablePillars(actor),
    can(actor.role, 'assignPlan'),
    can(actor.role, 'editTemplates'),
    bookingsFor(client),
  ]);
  const byPillar = new Map(rows.map((r) => [r.pillar, r]));

  const templates = await templatesWithDays(rows.flatMap((r) => [r.templateId, rowTicket(r)?.templateId]));
  const people = await peopleFor(rows);

  /* "Saved from this plan" — the templates promoted out of this client's plan,
     each with where its sign-off stands, so the tab can offer the submit button */
  const [derivedRows, roleRows] = await Promise.all([
    prisma.planTemplate.findMany({
      where: { forClientId: clientId },
      orderBy: { createdAt: 'asc' },
      select: {
        ...TEMPLATE_REF,
        approvals: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 1,
          select: { status: true, stage: true, chain: true },
        },
      },
    }),
    prisma.role.findMany({ select: { key: true, title: true } }),
  ]);
  const titles = Object.fromEntries(roleRows.map((r) => [r.key, r.title]));

  return {
    clientId: client.id,
    clientName: client.name,
    firstName: first(client.name),
    cycle: client.cycle,
    day: client.cycleDay,
    track: client.track ?? null,
    levels: (client.levels as Record<string, number> | null) ?? {},
    shape: {
      cycleDays: shape.cycleDays,
      restDays: [...shape.restDays],
      reviewDay: shape.reviewDay,
      meetingDay: shape.meetingDay,
    },
    /* what the console needs to decide which pickers to draw, answered by the
       server so the two can never disagree about who may do what */
    mayAssign: mayEdit,
    canSaveTemplate: assignAll || editTemplates,
    pillars: PILLARS.map((pillar) =>
      pillarBlock(
        pillar,
        byPillar.get(pillar) ?? null,
        templates,
        mayEdit.includes(pillar),
        people,
        bookings[pillar] ?? {},
      ),
    ),
    templates,
    derived: derivedRows.map((t) => ({ ...toRef(t)!, approval: approvalOf(t.approvals[0], titles) })),
  };
}

/**
 * `GET /clients/:id/plan/:pillar/templates` — the published templates that could
 * go in this pillar's seat, for the Call sheet.
 *
 * PUBLISHED ONLY. The demo lists nothing else: a draft has not cleared the chain,
 * and a plan built on it would be a plan nobody stands behind. Track and level
 * are MARKED, not filtered — a coach may hold somebody a level back, or put a
 * deconditioned client on the gentler track's plan — and the client's own shelf
 * sorts to the top, which is the demo's "say which is the obvious choice, never
 * make it".
 */
export async function templatesFor(actor: PlanActor, clientId: string, pillar: string) {
  assertPillar(pillar);
  const client = await reachableClient(actor, clientId);
  const level = levelOf(client, pillar);

  const rows = await prisma.planTemplate.findMany({
    where: { pillar, published: true },
    orderBy: [{ level: 'asc' }, { name: 'asc' }],
    select: TEMPLATE_REF,
  });

  const marked = rows.map((t) => {
    const onTrack = !!client.track && t.track === client.track;
    const onLevel = t.level === level;
    return { ...toRef(t)!, onShelf: onTrack && onLevel, onTrack, onLevel };
  });
  /* the client's own shelf first, then their track — a stable sort, so the level
     ordering the query already applied survives inside each group */
  marked.sort((a, b) => Number(b.onShelf) - Number(a.onShelf) || Number(b.onTrack) - Number(a.onTrack));

  return { pillar, track: client.track ?? null, level, templates: marked };
}

/* ------------------------------------------------------------ the writes */

/** A pillar's row, created "called, not chosen" when it has never been opened. */
async function ensureRow(clientId: string, pillar: string): Promise<PlanRow> {
  const row = await prisma.clientPlan.findUnique({
    where: { clientId_pillar: { clientId, pillar } },
    include: PLAN_INCLUDE,
  });
  if (row) return row;
  /* the LIVE record is created empty on a first call — the calendar reads
     nothing for a null templateId, so the client's day stays exactly as it was
     until the first Approve */
  return prisma.clientPlan.create({
    data: { clientId, pillar, templateId: null, overrides: {}, log: [] },
    include: PLAN_INCLUDE,
  });
}

/**
 * Write the row THE CALLER READ, and nobody else's.
 *
 * Every act on a plan is read-modify-write: load the row, rebuild the ticket,
 * save. Two coaches saving different days of the same pillar within the same
 * moment would each rebuild from the row they read, and the second save would
 * quietly carry the first's day away. The row's own clock is the guard — the
 * update matches only the version that was read, and a lost race is a 409 the
 * screen can answer with a reload rather than a silent overwrite.
 */
async function writeRow(row: PlanRow, data: Prisma.ClientPlanUncheckedUpdateManyInput): Promise<void> {
  const hit = await prisma.clientPlan.updateMany({
    where: { clientId: row.clientId, pillar: row.pillar, updatedAt: row.updatedAt },
    data,
  });
  if (hit.count === 0) {
    throw ApiError.conflict('This plan changed under you — reload it and try again.');
  }
}

/** The ticket, opened as a full shadow of the live fields if none is open — the demo's `ensureDraft`. */
function ensureDraft(row: PlanRow, actorId: string): Ticket {
  return (
    rowTicket(row) ?? {
      templateId: row.templateId,
      overrides: copy(rowOverrides(row)),
      byId: actorId,
      at: new Date().toISOString(),
    }
  );
}

/**
 * `PUT /clients/:id/plan/:pillar` — "Call a template". Writes the TICKET.
 *
 * Day overrides belong to the template they were written against, so a new call
 * starts them empty. The client's own hour, dose and targets do NOT — they
 * describe the person, not the template — so anything already staged survives
 * the swap. The hour and dose from the sheet are staged only when they actually
 * CHANGE something: writing '' onto a pillar that never had a time stages
 * nothing, and would otherwise raise a "Staged" pill against it.
 */
export async function callTemplate(
  actor: PlanActor,
  clientId: string,
  pillar: string,
  input: { templateId: string; time?: string | null; dose?: Dose | null },
) {
  assertPillar(pillar);
  const client = await reachableClient(actor, clientId);
  await requireAssign(actor, clientId, pillar);

  const template = await prisma.planTemplate.findUnique({ where: { id: input.templateId }, select: TEMPLATE_REF });
  if (!template) throw ApiError.notFound('No such template.');
  if (template.pillar !== pillar) {
    throw ApiError.badRequest(`${template.name} is a ${specFor(template.pillar).name} template.`);
  }
  if (!template.published) {
    throw ApiError.badRequest(`${template.name} is still a draft. One has to clear the approval chain before it can be assigned.`);
  }
  if (input.dose && nonEmpty(input.dose) && !isSessionPillar(pillar)) {
    throw ApiError.badRequest(`${specFor(pillar).name} has no session dose.`);
  }

  const row = await ensureRow(clientId, pillar);
  const keep = rowTicket(row) ?? ({} as Partial<Ticket>);
  const ticket: Ticket = { templateId: template.id, overrides: {}, byId: actor.id, at: new Date().toISOString() };
  if ('targets' in keep) ticket.targets = keep.targets ?? null;
  if ('time' in keep) ticket.time = keep.time ?? null;
  if ('dose' in keep) ticket.dose = keep.dose ?? null;

  if (input.time !== undefined && isSessionPillar(pillar)) {
    if ((input.time || '') !== (to24(row.time) || '')) ticket.time = input.time || '';
  }
  if (input.dose !== undefined && isSessionPillar(pillar)) {
    const now = nonEmpty(input.dose) ? input.dose : null;
    if (JSON.stringify(now) !== JSON.stringify(rowDose(row))) ticket.dose = now;
  }

  await writeRow(row, {
    ticket: json(ticket),
    log: pushLog(rowLog(row), `Called ${template.name} — draft`, actor.id) as unknown as Prisma.InputJsonValue,
  });

  return blockFor(client, pillar, actor);
}

/**
 * `PUT /clients/:id/plan/:pillar/days/:day` — "Edit day". Writes the TICKET.
 *
 * A day the coach touched replaces the template's day WHOLE — the template
 * itself is never written to here, and the client sees none of it until the
 * ticket is approved. Every item has to be in the pillar's own library, so a
 * plan cannot name an ingredient the Catalog does not hold.
 */
export async function editDay(actor: PlanActor, clientId: string, pillar: string, day: number, input: { slots: Slot[] }) {
  assertPillar(pillar);
  const client = await reachableClient(actor, clientId);
  await requireAssign(actor, clientId, pillar);
  const sp = specFor(pillar);

  const row = await prisma.clientPlan.findUnique({
    where: { clientId_pillar: { clientId, pillar } },
    include: PLAN_INCLUDE,
  });
  const viewTemplateId = row ? (rowTicket(row)?.templateId ?? row.templateId) : null;
  if (!row || !viewTemplateId) throw ApiError.conflict(`Call a ${sp.name} template first.`);

  const shape = await config.getShapeFor(client);
  if (day > shape.cycleDays) throw ApiError.badRequest(`The cycle has ${shape.cycleDays} days.`, { day });

  /* the day has to be one the template writes: an override on a day the grid
     cannot show would reach the client and vanish from "Save as new template" */
  const tpl = await prisma.planTemplate.findUnique({ where: { id: viewTemplateId }, select: { name: true, days: true } });
  if (!tpl) throw ApiError.conflict('The template on this draft no longer exists — discard the draft and call another.');
  if (!dayKeys(tpl.days as TemplateDays | null).includes(day)) {
    throw ApiError.badRequest(`Day ${day} is not on ${tpl.name}.`, { day });
  }

  /* one film a day and no more — a second would have nothing to mean */
  if (sp.one && input.slots.length > 1) throw ApiError.badRequest(`One ${sp.itemWord} a day — a second would have nothing to mean.`);

  /* canonicalise on the way in, exactly as the editor does on Save: empty
     alternatives go, ×1 is the bare id, an empty dose is no dose */
  const slots: Slot[] = [];
  const bad: string[] = [];
  for (const s of input.slots) {
    const options = (s.options ?? [])
      .filter((grp) => grp.length)
      .map((grp) => grp.map((e): OptionEntry => (optX(e) === 1 ? optId(e) : { id: optId(e), x: optX(e) })));
    if (!options.length) {
      bad.push(s.label || sp.slotWord);
      continue;
    }
    const slot: Slot = { ...(s.label ? { label: s.label } : {}), ...(sp.time && s.time !== undefined ? { time: s.time } : {}), options };
    /* the pillar's own fields and nothing else — a number where the spec says
       number, bounded where it says bounded, text kept short; the same door
       the tune sheet's dose goes through */
    const dose = cleanDose(sp, s.dose);
    if (dose) slot.dose = dose;
    slots.push(slot);
  }
  if (bad.length) throw ApiError.badRequest(`${bad[0]} has no options left — a slot needs at least one.`);

  const ids = [...new Set(slots.flatMap((s) => s.options.flatMap((g) => g.map(optId))))];
  if (ids.length) {
    const known = new Set(
      (await prisma.catalogItem.findMany({ where: { id: { in: ids }, pillar, archived: false }, select: { id: true } })).map((i) => i.id),
    );
    const missing = ids.find((id) => !known.has(id));
    if (missing) throw ApiError.badRequest(`No ${sp.itemWord} "${missing}" in the ${sp.name} library.`, { id: missing });
  }

  const ticket = ensureDraft(row, actor.id);
  ticket.overrides = { ...(ticket.overrides ?? {}), [String(day)]: { slots } };

  await writeRow(row, {
    ticket: json(ticket),
    log: pushLog(rowLog(row), `${sp.name} day ${day} edited — draft`, actor.id) as unknown as Prisma.InputJsonValue,
  });

  return blockFor(client, pillar, actor);
}

/**
 * A slot's dose, kept to the pillar's own fields: a number where the spec says
 * number (bounded where it says so), text kept short. Anything the spec does not
 * name is dropped — the day sheet never offers it, so it could only have been
 * typed straight at the API. Null when nothing survives.
 */
function cleanDose(sp: ReturnType<typeof specFor>, raw: Record<string, unknown> | null | undefined): Dose | null {
  if (!raw) return null;
  const out: Dose = {};
  for (const f of sp.fields) {
    const v = raw[f.k];
    if (v === undefined || v === null || v === '') continue;
    if (f.kind === 'num') {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) continue;
      out[f.k] = f.max ? Math.min(n, f.max) : n;
    } else {
      out[f.k] = String(v).slice(0, 60);
    }
  }
  return Object.keys(out).length ? out : null;
}

/**
 * `PATCH /clients/:id/plan/:pillar` — the client's own hour, dose or daily
 * targets. Writes the TICKET.
 *
 * These describe the PERSON, not the template: the hour beats the template's
 * times on every day the pillar runs, the dose beats its numbers, the targets are
 * what their Nutrient Panel measures the day against. '' / null stages a CLEAR,
 * which is a real answer — it hands the client back to the template.
 */
export async function tune(
  actor: PlanActor,
  clientId: string,
  pillar: string,
  input: { time?: string | null; dose?: Dose | null; targets?: Targets | null },
) {
  assertPillar(pillar);
  const client = await reachableClient(actor, clientId);
  await requireAssign(actor, clientId, pillar);
  const sp = specFor(pillar);

  const row = await prisma.clientPlan.findUnique({
    where: { clientId_pillar: { clientId, pillar } },
    include: PLAN_INCLUDE,
  });
  if (!row) throw ApiError.conflict(`Call a ${sp.name} template first.`);

  const ticket = ensureDraft(row, actor.id);
  let log = rowLog(row);

  if ('time' in input) {
    if (!isSessionPillar(pillar)) throw ApiError.badRequest(`${sp.name} has no session time.`);
    const val = input.time || '';
    ticket.time = val;
    log = pushLog(log, val ? `${sp.name} moved to ${fmtTime(hmToMin(val))} — draft` : `${sp.name} back on the template’s times — draft`, actor.id);
  }

  if ('dose' in input) {
    if (!isSessionPillar(pillar)) throw ApiError.badRequest(`${sp.name} has no session dose.`);
    /* a zero or an empty string is "follow the plan" for that field, as the
       sheet reads its boxes; a dose with nothing left in it is a clear */
    const out: Dose = {};
    for (const f of sp.fields) {
      const v = input.dose?.[f.k];
      if (v === undefined || v === null || v === '') continue;
      if (f.kind === 'num') {
        const n = Number(v) || 0;
        if (n) out[f.k] = n;
      } else if (String(v).trim()) out[f.k] = String(v).trim();
    }
    if (nonEmpty(out)) {
      ticket.dose = out;
      log = pushLog(log, `${sp.name} dose set for ${first(client.name)} — draft`, actor.id);
    } else {
      ticket.dose = null;
      log = pushLog(log, `${sp.name} dose back on the plan’s own — draft`, actor.id);
    }
  }

  if ('targets' in input) {
    if (pillar !== 'culture') throw ApiError.badRequest(`Daily targets belong to ${specFor('culture').name}.`);
    const out: Targets = {};
    for (const k of ['kcal', 'protein', 'carbs', 'fat', 'fibre']) {
      const v = Number(input.targets?.[k]);
      if (v > 0) out[k] = Math.round(v);
    }
    if (nonEmpty(out)) {
      ticket.targets = out;
      log = pushLog(log, 'Daily targets staged', actor.id);
    } else {
      ticket.targets = null;
      log = pushLog(log, 'Daily targets cleared — draft', actor.id);
    }
  }

  await writeRow(row, { ticket: json(ticket), log: log as unknown as Prisma.InputJsonValue });

  return blockFor(client, pillar, actor);
}

/**
 * `POST /clients/:id/plan/:pillar/publish` — "Approve — publish to <First>".
 *
 * One wholesale copy, ticket → live. Wholesale is why the ticket's `overrides` is
 * a full deep copy rather than a patch: a patch here would silently delete every
 * day approved before this draft was opened. `time`, `dose` and `targets` are
 * copied only when the ticket MENTIONS them, and an empty staged value means
 * "clear it" — that is how a coach hands a client back to the template's own
 * times. This is the moment the client app starts reading the plan.
 */
export async function publishPlan(actor: PlanActor, clientId: string, pillar: string) {
  assertPillar(pillar);
  const client = await reachableClient(actor, clientId);
  await requireAssign(actor, clientId, pillar);

  const row = await prisma.clientPlan.findUnique({
    where: { clientId_pillar: { clientId, pillar } },
    include: PLAN_INCLUDE,
  });
  const ticket = row ? rowTicket(row) : null;
  if (!row || !ticket) throw ApiError.conflict('Nothing is staged on this plan.');

  /* the template on the ticket has to still exist and still be published —
     a live plan on a template the chain has not signed is exactly what the
     ticket exists to prevent */
  const template = ticket.templateId
    ? await prisma.planTemplate.findUnique({ where: { id: ticket.templateId }, select: TEMPLATE_REF })
    : null;
  if (ticket.templateId && !template) {
    throw ApiError.conflict('The template on this draft no longer exists — discard the draft and call another.');
  }

  const changed = ticket.templateId !== row.templateId;
  /* a NEW template has to have cleared the chain; a ticket that only stages an
     hour or a day on the template the client is already on approves as the
     demo's does — the Catalog unpublishing that template later is the
     Catalog's business, not a reason to freeze this client's plan */
  if (changed && template && !template.published) throw ApiError.badRequest(`${template.name} is not published yet.`);
  const overrides = ticket.overrides ?? {};

  await writeRow(row, {
      templateId: ticket.templateId ?? null,
      overrides: overrides as unknown as Prisma.InputJsonValue,
      ...('time' in ticket ? { time: ticket.time || null } : {}),
      ...('dose' in ticket ? { dose: json(nonEmpty(ticket.dose) ? ticket.dose : null) } : {}),
      ...('targets' in ticket ? { targets: json(nonEmpty(ticket.targets) ? ticket.targets : null) } : {}),
      ...(changed ? { assignedById: actor.id, assignedAt: new Date() } : {}),
      ticket: Prisma.JsonNull,
      log: pushLog(rowLog(row), `Approved ${template?.name ?? 'the plan'} — published`, actor.id) as unknown as Prisma.InputJsonValue,
  });

  await audit.record({
    actorId: actor.id,
    action: 'plan.published',
    subjectType: 'clientPlan',
    subjectId: clientId,
    meta: {
      pillar,
      client: client.name,
      template: template?.name ?? null,
      edits: Object.keys(overrides).length,
      /* what it REPLACED — the only record of the plan this client was on before,
         since the row itself is overwritten */
      replaced: changed ? (row.template?.name ?? null) : undefined,
    } as Prisma.InputJsonValue,
  });

  return blockFor(client, pillar, actor);
}

/**
 * `DELETE /clients/:id/plan/:pillar/draft` — "Discard draft".
 *
 * Every staged change goes, and the client's plan stays exactly as it is now.
 */
export async function discardDraft(actor: PlanActor, clientId: string, pillar: string) {
  assertPillar(pillar);
  const client = await reachableClient(actor, clientId);
  await requireAssign(actor, clientId, pillar);

  const row = await prisma.clientPlan.findUnique({
    where: { clientId_pillar: { clientId, pillar } },
    include: PLAN_INCLUDE,
  });
  if (!row || !rowTicket(row)) throw ApiError.conflict('Nothing is staged on this plan.');

  await writeRow(row, {
    ticket: Prisma.JsonNull,
    log: pushLog(rowLog(row), 'Draft discarded', actor.id) as unknown as Prisma.InputJsonValue,
  });

  return blockFor(client, pillar, actor);
}

/**
 * `POST /clients/:id/plan/:pillar/fit` — "Ask AI to fit".
 *
 * NO MODEL. The demo's rule is the rule: the first published template on the
 * client's own shelf — their level in this pillar, their activity category —
 * else the first published of the pillar. The AI proposes; the human still taps
 * Call. A draft never assigns itself, so nothing is written here.
 */
export async function fit(actor: PlanActor, clientId: string, pillar: string) {
  assertPillar(pillar);
  const client = await reachableClient(actor, clientId);
  await requireAssign(actor, clientId, pillar);
  const sp = specFor(pillar);
  const lvl = levelOf(client, pillar);

  const pubs = await prisma.planTemplate.findMany({
    where: { pillar, published: true },
    orderBy: [{ level: 'asc' }, { createdAt: 'asc' }],
    select: TEMPLATE_REF,
  });
  if (!pubs.length) throw ApiError.notFound(`No published ${sp.name} templates.`);

  const onShelf = pubs.filter((t) => t.level === lvl && t.track === client.track);
  const pick = onShelf[0] ?? pubs[0]!;
  const text =
    `${await trackLabel(client.track)}, ${sp.name} level ${lvl} — ${pick.name}` +
    (onShelf.length ? ' sits on exactly that shelf' : ' is the nearest published fit') +
    `, and ${first(client.name)}’s coach can still edit any day on top of it. Confirm to assign.`;

  return { templateId: pick.id, name: pick.name, onShelf: onShelf.length > 0, text };
}

/**
 * `POST /clients/:id/plan/:pillar/save-template` — "Save as new template".
 *
 * The LIVE plan, its overrides baked down into ordinary days, as a DRAFT template
 * of its own — after this it stands alone and owes the client nothing. It lands
 * in the Catalog and on the record's "Saved from this plan" list; the approval
 * chain publishes it, through the Catalog's own send.
 */
export async function saveAsTemplate(actor: PlanActor, clientId: string, pillar: string, name: string) {
  assertPillar(pillar);
  const client = await reachableClient(actor, clientId);
  await requireAssign(actor, clientId, pillar);
  /* promoting a plan into the recipe book is authoring, and it needs the
     authoring permission on top of the assigning one */
  if (!((await can(actor.role, 'assignPlan')) || (await can(actor.role, 'editTemplates')))) {
    await denyAssign(actor, clientId, pillar);
  }

  const row = await prisma.clientPlan.findUnique({
    where: { clientId_pillar: { clientId, pillar } },
    select: { templateId: true, overrides: true, targets: true },
  });
  const base = row?.templateId
    ? await prisma.planTemplate.findUnique({ where: { id: row.templateId }, select: { ...TEMPLATE_REF, days: true } })
    : null;
  if (!row || !base) throw ApiError.conflict(`Nothing is live on ${specFor(pillar).name} to save.`);

  /* the overrides baked down into ordinary days — after this the new template
     stands on its own and owes the client nothing */
  const days = copy((base.days as unknown as TemplateDays | null) ?? {});
  for (const [k, o] of Object.entries(rowOverrides(row))) {
    if (o?.slots && days[k]) days[k] = { ...days[k], slots: copy(o.slots) };
  }
  /* a promoted plan carries the client's own targets when they set some —
     written onto day 1 of the copy, where every later day inherits them */
  const targets = rowTargets(row);
  if (targets && nonEmpty(targets)) days['1'] = { ...(days['1'] ?? { slots: [] }), targets: copy(targets) };

  const made = await prisma.planTemplate.create({
    data: {
      name,
      pillar: base.pillar,
      level: base.level,
      track: base.track,
      notes: `Adapted from ${base.name} for ${client.name}`,
      days: days as unknown as Prisma.InputJsonValue,
      published: false,
      createdById: actor.id,
      forClientId: clientId,
    },
    select: TEMPLATE_REF,
  });

  await audit.record({
    actorId: actor.id,
    action: 'catalog.template_created',
    subjectType: 'planTemplate',
    subjectId: made.id,
    meta: { name: made.name, pillar: made.pillar, level: made.level, from: base.id, client: client.name },
  });

  return toRef(made)!;
}

/* ---------------------------------------------------------------- emotions */

/**
 * `GET /clients/:id/emotions` — the arrival check-ins, for the care team.
 *
 * WHAT THE CLIENT WRITES EVERY MORNING, read by the people responsible for them.
 * The client answers "How are you arriving?" once per cycle-day and may add a line
 * about why; this is the other end of that.
 *
 * SCOPE IS THE GATE, and there is no permission beyond it. A coach sees the
 * check-ins of the clients on their pod; a Super Admin sees everyone's, because
 * `clientScopeWhere` returns `{}` for `seeAllClients`. That is the rule the whole
 * client record already runs on, and a mood is not more privileged than the record
 * it sits in — it is the record.
 *
 * NEWEST FIRST for the notes, but the SERIES IS OLDEST FIRST: a line chart reads
 * left to right through time, and a list of notes reads with the most recent at
 * the top. Two orders because they answer two questions.
 */
export async function emotions(actor: PlanActor, clientId: string, limit = 30) {
  const client = await reachableClient(actor, clientId);

  const rows = await prisma.clientMood.findMany({
    where: { clientId },
    /* by cycle-day, not by createdAt: a check-in edited later in the day must not
       jump to the end of the chart — the DAY is its place on the axis */
    orderBy: [{ cycle: 'asc' }, { day: 'asc' }],
    take: limit,
    select: { id: true, cycle: true, day: true, mood: true, note: true, createdAt: true },
  });

  const series = rows.map((m) => ({
    id: m.id,
    cycle: m.cycle,
    day: m.day,
    mood: m.mood,
    note: m.note,
    /*
     * WHEN THEY ANSWERED, which the chart places on its clock axis. This is the
     * server's record of the moment the check-in arrived — the demo labels the
     * same axis "times are the client's own clock", and on a phone in another
     * timezone the two would differ. Serialised as an instant so the console can
     * decide how to show it rather than being handed a pre-formatted string.
     */
    at: m.createdAt.toISOString(),
  }));

  return {
    clientId: client.id,
    clientName: client.name,
    series,
    /* the same rows the other way up — the console prints these under
       "Notes behind the check-ins", and only the ones that HAVE a note */
    notes: series.filter((m) => m.note).reverse(),
  };
}
