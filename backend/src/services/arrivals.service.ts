import type { Prisma } from '@prisma/client';
import {
  FLOW,
  FLOW_VERSION,
  PILLAR_KEYS,
  canTick,
  firstGap,
  plansOnSale,
  readyToFinish,
  stepComplete,
  stepDef,
  stepIndex,
  tickKey,
  tickedCount,
  todayISO,
  type FlowRecord,
} from '@haalving/shared';

import { prisma } from '../config/prisma.js';
import { can } from '../middleware/authorize.js';
import { ApiError } from '../utils/apiResponse.js';
import { startOfDay } from '../utils/dates.js';
import * as audit from './audit.service.js';
import * as capacity from './capacity.service.js';
import * as circle from './circle.service.js';
/* the client READ, so a client this file mints is answered in exactly the shape
   `GET /clients/:id` answers — see `addClientDirect` */
import * as clients from './client.service.js';
import * as config from './config.service.js';
import * as arrivalCircle from './client-app/arrival-circle.js';

/**
 * The Onboarding rail — the twelve steps of HAAL/QMS/OP/2026/01/00.
 *
 * EVERY RULE IS ENFORCED HERE, not only in the console. The demo's disabled
 * checkbox is a hint; this is the rule. In particular: ticks land only on the
 * current step or an earlier one, a step closes only when all of its tasks are
 * ticked, and nothing closes or promotes while a step behind it has a hole in it.
 *
 * All step maths comes from `@haalving/shared` and is never re-implemented —
 * a second copy of `stepComplete` is how a console and its server come to
 * disagree about whether somebody may be promoted.
 */

export interface Actor {
  id: string;
  role: string;
}

/* ------------------------------------------------------------- who may run */

/**
 * Who owns onboarding — ONE permission, held by the Super Admin alone.
 *
 * This used to be `allocate || seeAllClients` (the demo's `canRunFlow`, which
 * put ten roles on the board and narrowed what each could see). HAALVING runs
 * onboarding as a single desk instead: the Super Admin walks an arrival through
 * all twelve steps and allocates its team, and a coach meets that person at
 * promotion. The permission is granted in `@haalving/shared` to `admin` only.
 *
 * It is deliberately not a role check. Widening this to the Operations Head is
 * then a row edit in People & Access, not a deploy — and `can()` reads the live
 * Role row before falling back to the code matrix, so the grant takes effect on
 * the next request.
 *
 * `canRunFlow` is left in shared untouched because that file is a verbatim port
 * of the demo's flow maths. It is simply no longer the question we ask.
 */
export async function canRun(actor: Actor): Promise<boolean> {
  return can(actor.role, 'ownsOnboarding');
}

/**
 * Refuse, and leave both records the refusal is owed.
 *
 * The console tells the person "This attempt was logged" — a promise only the
 * server can keep. The ArrivalEvent puts it on the record they were touching so
 * it is visible where it happened; the AuditLog row puts it on the console-wide
 * trail where a reviewer looks for it. Neither alone is enough.
 */
async function deny(
  actor: Actor,
  arrivalId: string | null,
  what: string,
  message: string,
  meta: Record<string, unknown> = {},
): Promise<never> {
  if (arrivalId) {
    await prisma.arrivalEvent.create({
      data: {
        arrivalId,
        kind: 'DENIED',
        byId: actor.id,
        meta: { action: what, role: actor.role, ...meta } as Prisma.InputJsonValue,
      },
    });
  }
  await audit.record({
    actorId: actor.id,
    action: 'arrival.denied',
    subjectType: 'arrival',
    subjectId: arrivalId,
    reason: what,
    meta: { role: actor.role, ...meta } as Prisma.InputJsonValue,
  });
  throw ApiError.forbidden(message);
}

/** Every run action funnels through this, so no route can forget the gate. */
async function requireRun(actor: Actor, arrivalId: string | null, what: string): Promise<void> {
  if (await canRun(actor)) return;
  await deny(
    actor,
    arrivalId,
    what,
    'Onboarding is run by the Super Admin. This attempt was logged.',
  );
}

/* ------------------------------------------------------------- the record */

type ArrivalRow = Prisma.ArrivalGetPayload<Record<string, never>>;

const asTicks = (v: Prisma.JsonValue): Record<string, boolean> =>
  (v as Record<string, boolean> | null) ?? {};

const asSeats = (v: Prisma.JsonValue): Record<string, string> =>
  (v as Record<string, string> | null) ?? {};

/** The shape the shared helpers read. */
const toRecord = (a: Pick<ArrivalRow, 'step' | 'ticks'>): FlowRecord => ({
  step: a.step,
  ticks: asTicks(a.ticks),
});

async function load(id: string): Promise<ArrivalRow> {
  const a = await prisma.arrival.findUnique({ where: { id } });
  if (!a) throw ApiError.notFound('No such arrival.');
  return a;
}

/** An arrival that is still walking. A promoted one is a Client now. */
async function loadActive(id: string): Promise<ArrivalRow> {
  const a = await load(id);
  if (a.status !== 'ACTIVE') {
    throw ApiError.conflict(
      a.status === 'PROMOTED'
        ? `${a.name} has already been onboarded.`
        : `${a.name} withdrew before the end.`,
    );
  }
  return a;
}

function event(
  arrivalId: string,
  kind: Prisma.ArrivalEventCreateInput['kind'],
  actor: Actor,
  extra: { stepKey?: string; taskIndex?: number; meta?: Record<string, unknown> } = {},
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return tx.arrivalEvent.create({
    data: {
      arrivalId,
      kind,
      byId: actor.id,
      stepKey: extra.stepKey ?? null,
      taskIndex: extra.taskIndex ?? null,
      meta: (extra.meta ?? {}) as Prisma.InputJsonValue,
    },
  });
}

/* ------------------------------------------------------------- the reading */

/** What a rail row needs, and nothing more — the list is read far more than it is opened. */
export interface ArrivalRailRow {
  id: string;
  name: string;
  plan: string;
  step: string;
  stepIndex: number;
  stepLabel: string;
  stepPhase: string;
  ticked: number;
  taskCount: number;
  openItem: boolean;
  arrivedAt: string;
}

function railRow(a: ArrivalRow): ArrivalRailRow {
  const rec = toRecord(a);
  const s = stepDef(a.step);
  return {
    id: a.id,
    name: a.name,
    plan: a.plan,
    step: a.step,
    stepIndex: stepIndex(a.step),
    stepLabel: s.label,
    stepPhase: s.phase,
    ticked: tickedCount(rec, s),
    taskCount: s.tasks.length,
    openItem: firstGap(rec) >= 0,
    arrivedAt: a.arrivedAt.toISOString(),
  };
}

/**
 * The rail.
 *
 * Whoever can run the flow sees every arrival. Everyone else sees only the ones
 * they are SEATED ON — an arrival has no Client row yet, so there is no pod to
 * scope through and the seats live in `podSeats` until promotion. A coach with no
 * seats sees an empty rail rather than everybody's, which is the safe default and
 * the one the demo's lens implies.
 *
 * Ordered the demo's way: furthest along first, and within one step the one who
 * has been waiting longest.
 */
export async function list(actor: Actor): Promise<ArrivalRailRow[]> {
  /*
   * THE BOARD IS REFUSED, NOT NARROWED.
   *
   * This used to hand a coach the arrivals they were already seated on. That
   * seat is assigned DURING onboarding, so the effect was a pre-promotion
   * window: a coach could watch a client walk the twelve steps before that
   * client was theirs. The rule is now that onboarding is one desk, so there is
   * nothing here to narrow — a caller either owns the board or has no business
   * knowing how many people are on it.
   *
   * A refusal rather than an empty list, because an empty list is a lie about a
   * board that has five people on it, and the console promises the attempt is
   * logged.
   */
  await requireRun(actor, null, 'arrival.list');

  const mine = await prisma.arrival.findMany({ where: { status: 'ACTIVE' } });

  mine.sort(
    (x, y) =>
      stepIndex(y.step) - stepIndex(x.step) || x.arrivedAt.getTime() - y.arrivedAt.getTime(),
  );
  return mine.map(railRow);
}

/** The full record, plus its history and the bench it will be allocated from. */
export async function get(actor: Actor, id: string) {
  const a = await load(id);

  if (!(await canRun(actor))) {
    /*
     * 404, not 403, exactly as /clients does: a 403 would confirm the record
     * exists, which is itself the sensitive fact. This is the deep-link door —
     * hiding the tab is a hint, and this is the rule.
     *
     * The pod-seat exemption that used to stand here is gone with the rest of
     * the pre-promotion window; being allocated to an arrival no longer lets
     * you read it.
     */
    throw ApiError.notFound('No such arrival.');
  }

  const rec = toRecord(a);
  const [events, bench] = await Promise.all([
    prisma.arrivalEvent.findMany({
      where: { arrivalId: id },
      orderBy: { at: 'desc' },
      take: 50,
      include: { by: { select: { id: true, name: true } } },
    }),
    capacity.listAll(),
  ]);

  return {
    ...railRow(a),
    phone: a.phone,
    email: a.email,
    note: a.note,
    ticks: asTicks(a.ticks),
    podSeats: asSeats(a.podSeats),
    inbody: a.inbody,
    welcomedAt: a.welcomedAt?.toISOString() ?? null,
    welcomeText: a.welcomeText,
    status: a.status,
    flowVersion: a.flowVersion,
    promotedClientId: a.promotedClientId,
    firstGap: firstGap(rec),
    stepComplete: stepComplete(rec, stepDef(a.step)),
    readyToFinish: readyToFinish(rec),
    /* The caller's own standing, so the console never has to guess at it.
       Always true now: the 404 above refuses everyone without the permission,
       so no reader reaches this record read-only. Kept in the payload because
       the console reads it, and so widening the grant to a second seat never
       needs a shape change here. */
    canRun: true,
    events: events.map((e) => ({
      id: e.id,
      kind: e.kind,
      stepKey: e.stepKey,
      taskIndex: e.taskIndex,
      by: e.by ? { id: e.by.id, name: e.by.name } : null,
      meta: e.meta,
      at: e.at.toISOString(),
    })),
    capacity: bench.map((c) => ({
      staffId: c.staffId,
      name: c.staff.name,
      role: c.staff.role,
      load: c.load,
      cap: c.declared,
      /* the one derived field, and it is derived on purpose: `full` is a reading
         of two numbers, never a third number that can disagree with them */
      full: c.load >= c.declared,
    })),
  };
}

/* ------------------------------------------------------------- the writing */

export interface CreateInput {
  name: string;
  phone?: string;
  email?: string;
  plan: string;
  source: string;
  note?: string;
}

export async function create(actor: Actor, input: CreateInput) {
  await requireRun(actor, null, 'arrival.create');

  /* the plan must be one that is actually on sale — Svayam is `launch: false`
     for this launch, and the console renders it "Opening soon". A body that
     names it anyway is refused here, where the rule cannot be skipped. */
  if (!plansOnSale().includes(input.plan as never)) {
    throw ApiError.badRequest(`That plan is not on sale yet.`, { plan: input.plan });
  }

  const a = await prisma.arrival.create({
    data: {
      name: input.name,
      phone: input.phone ?? null,
      email: input.email ?? null,
      plan: (input.plan === 'svayam' ? 'SVAYAM' : 'POORNA') as never,
      source: input.source.toUpperCase() as never,
      note: input.note ?? null,
      step: FLOW[0]!.key,
      ticks: {},
      healed: {},
      flowVersion: FLOW_VERSION,
      createdById: actor.id,
    },
  });

  await audit.record({
    actorId: actor.id,
    action: 'arrival.created',
    subjectType: 'arrival',
    subjectId: a.id,
    meta: { name: a.name, plan: a.plan, source: a.source },
  });

  return railRow(a);
}

export async function update(actor: Actor, id: string, input: { plan?: string; note?: string }) {
  await requireRun(actor, id, 'arrival.update');
  const a = await loadActive(id);

  if (input.plan !== undefined && !plansOnSale().includes(input.plan as never)) {
    throw ApiError.badRequest('That plan is not on sale yet.', { plan: input.plan });
  }

  const next = await prisma.arrival.update({
    where: { id },
    data: {
      ...(input.plan !== undefined
        ? { plan: (input.plan === 'svayam' ? 'SVAYAM' : 'POORNA') as never }
        : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
    },
  });

  if (input.plan !== undefined) {
    await event(id, 'PLAN_SET', actor, { meta: { from: a.plan, to: next.plan } });
  }
  if (input.note !== undefined) {
    await event(id, 'NOTE', actor, {});
  }

  return railRow(next);
}

/** What every step-moving call answers with, so the console never recomputes. */
export interface FlowState {
  step: string;
  stepIndex: number;
  ticked: number;
  taskCount: number;
  firstGap: number;
  stepComplete: boolean;
  readyToFinish: boolean;
  openItem: boolean;
}

function flowState(a: Pick<ArrivalRow, 'step' | 'ticks'>): FlowState {
  const rec = toRecord(a);
  const s = stepDef(a.step);
  const gap = firstGap(rec);
  return {
    step: a.step,
    stepIndex: stepIndex(a.step),
    ticked: tickedCount(rec, s),
    taskCount: s.tasks.length,
    firstGap: gap,
    stepComplete: stepComplete(rec, s),
    readyToFinish: readyToFinish(rec),
    openItem: gap >= 0,
  };
}

/**
 * Tick or untick one task.
 *
 * SEQUENTIAL, and enforced: the current step takes ticks, an earlier step takes a
 * correction, a LATER step is refused with a 409. The console renders later steps
 * locked and inert, but a disabled checkbox is a hint and this is the rule.
 *
 * `unlockedKey` is deliberately NOT passed to `canTick` here. The unlock lens is
 * a decision made on one screen and is never persisted, so the server cannot
 * verify it and must not pretend to — it enforces the half of the rule that is
 * actually about the record.
 */
export async function setTick(
  actor: Actor,
  id: string,
  input: { stepKey: string; taskIndex: number; on: boolean },
): Promise<FlowState> {
  await requireRun(actor, id, 'arrival.tick');
  const a = await loadActive(id);

  if (!canTick(toRecord(a), input.stepKey)) {
    throw ApiError.conflict(
      `Step ${stepIndex(input.stepKey) + 1} has not been reached yet. Only the open step can be ticked.`,
      { step: a.step, attempted: input.stepKey },
    );
  }

  const ticks = asTicks(a.ticks);
  const key = tickKey(input.stepKey, input.taskIndex);
  const was = ticks[key] === true;
  if (input.on) ticks[key] = true;
  else delete ticks[key];

  const next = await prisma.arrival.update({
    where: { id },
    data: { ticks: ticks as Prisma.InputJsonValue },
  });

  /* only record a real change — a re-tick of something already ticked is a
     double click, not a decision, and an event log full of them is unreadable */
  if (was !== input.on) {
    await event(id, input.on ? 'TICK' : 'UNTICK', actor, {
      stepKey: input.stepKey,
      taskIndex: input.taskIndex,
    });

    /* unticking BEHIND the current step is the thing that opens a hole, and it
       gets its own event so the record says when the gap appeared and who made it */
    if (!input.on && stepIndex(input.stepKey) < stepIndex(a.step)) {
      await event(id, 'FIX_OPENED', actor, { stepKey: input.stepKey, taskIndex: input.taskIndex });
    }
  }

  return flowState(next);
}

export async function closeStep(actor: Actor, id: string): Promise<FlowState> {
  await requireRun(actor, id, 'arrival.closeStep');
  const a = await loadActive(id);
  const rec = toRecord(a);
  const i = stepIndex(a.step);
  const s = stepDef(a.step);

  if (!stepComplete(rec, s)) {
    const left = s.tasks.length - tickedCount(rec, s);
    throw ApiError.conflict(
      `${left} task${left === 1 ? '' : 's'} left in step ${i + 1}.`,
      { left, step: a.step },
    );
  }

  const gap = firstGap(rec);
  if (gap >= 0) {
    throw ApiError.conflict(
      `Step ${gap + 1} · ${FLOW[gap]!.label} has an open item. Close it before moving on.`,
      { firstGap: gap },
    );
  }

  if (i >= FLOW.length - 1) {
    /* the last step does not close — it PROMOTES, which is a different verb with
       a different contract, and conflating them would let a client be minted by
       a button whose label says "next" */
    throw ApiError.conflict('The last step finishes by moving to Onboarded, not by closing.');
  }

  const nextKey = FLOW[i + 1]!.key;
  const next = await prisma.arrival.update({ where: { id }, data: { step: nextKey } });
  await event(id, 'CLOSE_STEP', actor, { stepKey: a.step, meta: { to: nextKey } });
  return flowState(next);
}

/**
 * Back one step, with its ticks intact.
 *
 * Nothing is cleared: the step WAS completed, and pretending otherwise would lose
 * work. It simply becomes the open step again — which also means it stops needing
 * an unlock to correct.
 */
export async function stepBack(actor: Actor, id: string): Promise<FlowState> {
  await requireRun(actor, id, 'arrival.stepBack');
  const a = await loadActive(id);
  const i = stepIndex(a.step);
  if (i === 0) throw ApiError.conflict('Already on the first step.');

  const prevKey = FLOW[i - 1]!.key;
  const next = await prisma.arrival.update({ where: { id }, data: { step: prevKey } });
  await event(id, 'STEP_BACK', actor, { stepKey: a.step, meta: { to: prevKey } });
  return flowState(next);
}

/* ------------------------------------------------------------- the three acts */

/**
 * Seat the team, and tick the task that says so.
 *
 * Doing the work IS ticking it — the SOP's "Allocate the client team and take
 * approval" is not a description of something happening elsewhere.
 *
 * Capacity is checked per seat, and the check runs BEFORE anything is written, so
 * a body naming one full coach and three free ones seats nobody. A partial
 * allocation would be worse than a refusal: it looks like it worked.
 */
export async function allocate(
  actor: Actor,
  id: string,
  input: { seats: Record<string, string>; override?: { staffId: string; reason: string } },
  opts: { ip?: string } = {},
) {
  await requireRun(actor, id, 'arrival.allocate');
  const a = await loadActive(id);

  const entries = Object.entries(input.seats).filter(([, staffId]) => !!staffId);
  if (!entries.length) throw ApiError.badRequest('No seats to allocate.');

  const seen = new Set<string>();
  for (const [, staffId] of entries) {
    /* one person may hold two seats on a pod, but checking them twice would
       demand two overrides for one decision */
    if (seen.has(staffId)) continue;
    seen.add(staffId);
    await capacity.checkAndReserve(staffId, actor, input.override, { ip: opts.ip });
  }

  const seats = { ...asSeats(a.podSeats) };
  for (const [seat, staffId] of entries) seats[seat] = staffId;

  const ticks = asTicks(a.ticks);
  const teamStep = FLOW.find((s) => s.tasks.some((t) => t.act === 'capacity'));
  if (teamStep) {
    const ti = teamStep.tasks.findIndex((t) => t.act === 'capacity');
    ticks[tickKey(teamStep.key, ti)] = true;
  }

  const next = await prisma.arrival.update({
    where: { id },
    data: { podSeats: seats as Prisma.InputJsonValue, ticks: ticks as Prisma.InputJsonValue },
  });

  await event(id, 'ALLOCATED', actor, {
    stepKey: teamStep?.key,
    meta: { seats: Object.fromEntries(entries), overrode: !!input.override },
  });

  return { ...flowState(next), podSeats: asSeats(next.podSeats) };
}

/** The InBody key-in, and the task it satisfies. */
export async function keyInBody(
  actor: Actor,
  id: string,
  input: Record<string, number>,
) {
  await requireRun(actor, id, 'arrival.inbody');
  const a = await loadActive(id);

  const ticks = asTicks(a.ticks);
  const step = FLOW.find((s) => s.tasks.some((t) => t.act === 'inbody'));
  if (step) {
    const ti = step.tasks.findIndex((t) => t.act === 'inbody');
    ticks[tickKey(step.key, ti)] = true;
  }

  const next = await prisma.arrival.update({
    where: { id },
    data: {
      inbody: { ...input, keyedById: actor.id, keyedAt: new Date().toISOString() } as Prisma.InputJsonValue,
      ticks: ticks as Prisma.InputJsonValue,
    },
  });

  await event(id, 'INBODY', actor, { stepKey: step?.key, meta: input });
  return { ...flowState(next), inbody: next.inbody };
}

/**
 * Record the reviewed welcome.
 *
 * NOTHING IS POSTED ANYWHERE YET, deliberately: an arrival has no Care Circle to
 * post into, because it has no Client row for CircleMessage to point at. The text
 * is held here and delivered at promotion, which is the first moment there is a
 * room for it.
 */
export async function welcome(actor: Actor, id: string, input: { text: string }) {
  await requireRun(actor, id, 'arrival.welcome');
  const a = await loadActive(id);

  const ticks = asTicks(a.ticks);
  const step = FLOW.find((s) => s.tasks.some((t) => t.act === 'welcome'));
  if (step) {
    const ti = step.tasks.findIndex((t) => t.act === 'welcome');
    ticks[tickKey(step.key, ti)] = true;
  }

  const next = await prisma.arrival.update({
    where: { id },
    data: {
      welcomedAt: new Date(),
      welcomeText: input.text,
      ticks: ticks as Prisma.InputJsonValue,
    },
  });

  await event(id, 'WELCOME', actor, { stepKey: step?.key });
  return { ...flowState(next), welcomedAt: next.welcomedAt?.toISOString() ?? null };
}

/* ------------------------------------------------------------- promotion */

/**
 * WHERE A CLIENT IS BORN — one place, and now two doors onto it.
 *
 * `promote` is the SOP's far end. `addClientDirect` is the documented exception
 * below. Both come through here, so the two cannot drift into building two
 * different kinds of client.
 *
 * It takes the ARRIVAL as its subject rather than a bag of loose fields because
 * both doors have one, and everything a new client needs is already on that row:
 * the name, the login's phone, the plan, the seats, the InBody, the reviewed
 * welcome. It runs INSIDE a transaction the caller owns — the arrival, the user,
 * the client, its seats and its room are one act or none of them.
 *
 * NOTHING IS CLONED. The demo copies a client in its observation window for SHAPE
 * and then zeroes every reading that belonged to the donor — a defensible trick
 * in a store of loose objects, and a liability here: the zeroing is a list that
 * has to be kept complete, and the day somebody adds a field to Client is the day
 * a new client quietly inherits a stranger's reading of it. A typed row is built
 * from nothing instead, so a new field starts at its own default and the failure
 * mode is a missing value rather than somebody else's.
 *
 * A day-one client therefore reads: cycle 1, day 1, observation, levels 1/1/1/1,
 * every session done 0, no risk, no compliance, nothing measured.
 */
async function birthClient(
  tx: Prisma.TransactionClient,
  a: ArrivalRow,
  actor: Actor,
  shape: Awaited<ReturnType<typeof config.getShape>>,
  targets: Record<string, number>,
): Promise<string> {
  const poorna = a.plan === 'POORNA';
  const seats = asSeats(a.podSeats);
  const body = (a.inbody as Record<string, number> | null) ?? null;
  const today = todayISO();

  /*
   * WHAT THE PERSON THEMSELVES SAID, carried across.
   *
   * Sign-up asks five chapters of questions and the answers wait on the arrival
   * until there is a client to put them on. Landing them here is the whole point
   * of having asked: a client whose first plan is built without the conditions
   * they declared is a client who was made to fill in a form for nothing.
   *
   * An arrival keyed by a coach has none of this, and that is fine — every field
   * below falls back to the same default a blank record would have had.
   */
  const intake = (a.intake ?? {}) as {
    goals?: string[];
    conditions?: string[];
    fitness?: string;
    track?: string;
  };

  /* 1. the login, so OTP works later. A client without a User row can never
        sign in, and the phone is the credential. */
  const user = await tx.user.create({
    data: {
      name: a.name,
      role: 'client' as never,
      phone: a.phone,
      email: a.email,
      status: 'active' as never,
    },
  });

  /* 2. the record, built rather than cloned */
  const client = await tx.client.create({
    data: {
      userId: user.id,
      name: a.name,
      plan: a.plan,
      /* Poorna is all four pillars by definition; Svayam carries none until a
         coach is added to one */
      humanPillars: poorna ? [...PILLAR_KEYS] : [],
      /* not recorded: an arrival never collects it, and inventing one would be
         worse than admitting it is unknown */
      sex: null,
      cycle: 1,
      cycleDay: 1,
      /*
       * RULE 2. The client is pinned to the shape CURRENT AT PROMOTION and walks
       * it until their cycle rolls over. Nothing recomputes mid-cycle, so an Ops
       * edit tomorrow does not move this person's review day this fortnight.
       *
       * THE HOOK: when the cycle engine lands it re-pins here — one line, at
       * rollover, and nowhere else.
       */
      shapeVersion: shape.version,
      observation: true,
      levels: Object.fromEntries(PILLAR_KEYS.map((k) => [k, 1])) as Prisma.InputJsonValue,
      sessions: Object.fromEntries(
        Object.entries(targets).map(([k, target]) => [k, { done: 0, target }]),
      ) as Prisma.InputJsonValue,
      status: 'active' as never,
      /* the term starts TODAY. The demo's clone left the donor's start date in
         place, so a brand-new client opened with part of their 90 days already
         spent — and their first welcome-sequence message already in the past,
         and therefore never sent. */
      /* both are plain `DateTime` columns — instants, not `@db.Date` calendar
         days — so LOCAL midnight is the right value and stays */
      termStart: startOfDay(today),
      onboardedAt: startOfDay(today),
      risk: null,
      riskWhy: 'observation day 1 of 5 — assessment awaited',
      /* null, never a measured 0% — no data yet and a perfect score are not the
         same reading, and a 0 here would show as a compliance failure on day one */
      compliance: null,
      /* the demo also zeroes `coins`; this port's Client has no such column, and
         because the row is BUILT rather than cloned there is nothing to zero —
         which is the whole argument for building it */
      ...(body?.weightKg ? { weightKg: body.weightKg } : {}),
      ...(body?.heightCm ? { heightCm: body.heightCm } : {}),
      /*
       * THE CONDITIONS REACH THE DOCTOR. The deck promises they "shape the plan,
       * they never exclude you from it", and this column is where that promise is
       * kept — it is read before the first calendar is built.
       */
      ...(intake.conditions?.length ? { health: intake.conditions } : {}),
      /*
       * The goal line the Plan hub prints. Their own words, joined the same way
       * the arrival's note joined them, so the rail and the record read alike.
       */
      ...(intake.goals?.length ? { goal: intake.goals.join(', ').slice(0, 280) } : {}),
      /*
       * The programme's axis, resolved at SIGN-UP and merely carried here — see
       * `trackForFitness`. Absent when nobody said, and the column's own default
       * (`sedentary`) is then the honest answer: the gentlest start, which is
       * what you give somebody you have not watched move.
       */
      ...(intake.track === 'moderate' ? { track: 'moderate' as never } : {}),
    },
  });

  /* 3. the seats, and the load they consume. Poorna only: a Svayam client has
        no human pod to seat. */
  if (poorna) {
    for (const [seat, staffId] of Object.entries(seats)) {
      if (!staffId) continue;
      await tx.podSeat.create({
        data: { clientId: client.id, seat: seat as never, staffId },
      });
      /* the load moves HERE, not at allocation — an arrival that never
         finishes must not leave a coach carrying a number for somebody who
         does not exist */
      await tx.capacity.updateMany({ where: { staffId }, data: { load: { increment: 1 } } });
    }
  }

  /* 4. the room, and the card pinned at the top of it */
  await circle.postMessage(
    client.id,
    {
      fromUserId: actor.id,
      fromKind: 'STAFF',
      kind: 'CARD',
      text: 'Pinned: Welcome to HAALVING · How we’ll work together',
    },
    tx,
  );

  /* the welcome the human reviewed on step 5, delivered now that there is
     somewhere to deliver it to */
  if (a.welcomeText) {
    await circle.postMessage(
      client.id,
      { fromUserId: actor.id, fromKind: 'STAFF', kind: 'TEXT', text: a.welcomeText },
      tx,
    );
  }

  /*
   * 6. WHERE THE WELCOME SEQUENCE WILL HOOK IN.
   *
   * The demo calls HV.flowSweep() here so anything already due lands before the
   * coach has finished reading the toast. The port's equivalent is
   * jobs/flowSweep.job.ts, which is not built: the Automations template it would
   * read does not exist yet. When it does, it runs from here rather than from
   * the cron alone, for the same reason the demo does it — the first message
   * should be in the thread immediately, not up to a tick later.
   */

  /* 5. the arrival stops being one, and keeps the record of how it got here */
  await tx.arrival.update({
    where: { id: a.id },
    data: { status: 'PROMOTED', promotedClientId: client.id },
  });

  return client.id;
}

/* ------------------------------------------------- the arrival's own thread */

/**
 * WHAT THE PERSON ON THE RAIL HAS BEEN ASKING.
 *
 * Somebody who signed up can write to the team from the moment they have an
 * account, and this is where those lines are read and answered. It is a support
 * thread, not a care circle: there is no pod yet, so there is no team-only lane
 * and nothing is filtered — every line in it was written to the person.
 */
export async function thread(actor: Actor, id: string) {
  await requireRun(actor, id, 'arrival.thread');
  const a = await loadActive(id);
  return arrivalCircle.thread(a.id, a.step);
}

/** The team's reply. The author is the session, never the body. */
export async function reply(actor: Actor, id: string, text: string) {
  await requireRun(actor, id, 'arrival.reply');
  const a = await loadActive(id);
  const m = await arrivalCircle.post(a.id, {
    fromKind: 'STAFF',
    fromUserId: actor.id,
    text,
  });
  await audit.record({
    actorId: actor.id,
    action: 'arrival.replied',
    subjectType: 'arrival',
    subjectId: a.id,
    meta: { seq: m.seq },
  });
  return { id: m.id, at: m.createdAt.toISOString() };
}

/**
 * The far end of the rail.
 *
 * The gate, the readiness check and the two records the act is owed live here;
 * the minting itself is `birthClient` above, so promotion and the direct add
 * cannot mint two different kinds of day-one client.
 */
export async function promote(actor: Actor, id: string, opts: { ip?: string } = {}) {
  await requireRun(actor, id, 'arrival.promote');
  const a = await loadActive(id);
  const rec = toRecord(a);

  if (!readyToFinish(rec)) {
    const gap = firstGap(rec);
    throw ApiError.conflict(
      gap >= 0
        ? `Step ${gap + 1} · ${FLOW[gap]!.label} has an open item. Close it before moving to Onboarded.`
        : 'Every step of the SOP has to be closed first.',
      { firstGap: gap, step: a.step },
    );
  }

  /* through config.service, never the table: it is the one place that knows which
     shape is current, and promotion is where a new client is PINNED to it */
  const shape = await config.getShape();
  const targets = shape.sessions as unknown as Record<string, number>;

  const clientId = await prisma.$transaction((tx) => birthClient(tx, a, actor, shape, targets));

  await event(id, 'PROMOTED', actor, { meta: { clientId } });
  await audit.record({
    actorId: actor.id,
    action: 'arrival.promoted',
    subjectType: 'arrival',
    subjectId: id,
    meta: { clientId, name: a.name, plan: a.plan, seats: asSeats(a.podSeats) },
    ip: opts.ip ?? null,
  });

  return { clientId, name: a.name };
}

/* ------------------------------------------------- the deliberate exception */

/**
 * Add a client DIRECTLY, without the twelve steps.
 *
 * THIS IS AN EXCEPTION TO THE SOP, NOT A LOOSENING OF IT. The rail exists
 * because somebody who has not been assessed, measured and welcomed is somebody
 * nobody can actually coach. But a few people arrive already sold and already
 * known, and walking them down a rail with nothing left to collect is theatre.
 * So the door exists, and everything about it is built to keep it exceptional:
 * the Super Admin alone, a written reason with a floor, and an audit row of its
 * own that says the SOP was skipped and why.
 *
 * NO TICKS ARE FABRICATED. The arrival behind this client is created already at
 * the far end — PROMOTED, still on step 1, with an empty tick map — because
 * writing twelve closed steps would be the record claiming work nobody did, and
 * the record is the thing here worth protecting. An arrival with no ticks and a
 * PROMOTED status reads, correctly, as "this one did not walk".
 */
export async function addClientDirect(
  actor: Actor,
  input: {
    name: string;
    phone: string;
    email?: string;
    plan: string;
    reason: string;
    note?: string;
  },
  opts: { ip?: string } = {},
) {
  /*
   * The route carries `requirePerm('ownsOnboarding')` too, and this is not the
   * redundant half. There is no arrival yet to hang a DENIED event on, so this
   * audit row is the whole record of the refusal — and a service that a job or a
   * script may call tomorrow must not depend on a middleware for its gate.
   */
  if (!(await canRun(actor))) {
    await audit.record({
      actorId: actor.id,
      action: 'denied',
      subjectType: 'client',
      reason: 'Blocked: client.addDirect',
      meta: { role: actor.role, name: input.name, plan: input.plan },
      ip: opts.ip ?? null,
    });
    throw ApiError.forbidden('Not available for your role.');
  }

  /* the refusal `POST /arrivals` gives, in the same words — skipping the rail
     does not put a plan on sale that is not */
  if (!plansOnSale().includes(input.plan as never)) {
    throw ApiError.badRequest('That plan is not on sale yet.', { plan: input.plan });
  }

  /*
   * THE PHONE IS THE CREDENTIAL, so a number that is taken is refused before
   * anything is written. The column is unique, so the alternative is a 500 from
   * Postgres — and a caller deserves the sentence rather than the stack.
   */
  const taken = await prisma.user.findUnique({
    where: { phone: input.phone },
    select: { id: true },
  });
  if (taken) {
    throw ApiError.conflict('That number already has an account.', {
      phone: 'Already has an account',
    });
  }

  /* pinned at birth, exactly as promotion pins it — see `birthClient` */
  const shape = await config.getShape();
  const targets = shape.sessions as unknown as Record<string, number>;

  const { clientId, arrivalId, plan } = await prisma.$transaction(async (tx) => {
    /* the arrival is still written, because a client record's "how did this
       person get here" must never be blank. It simply records somebody who was
       put straight through rather than somebody who walked. */
    const a = await tx.arrival.create({
      data: {
        name: input.name,
        phone: input.phone,
        email: input.email ?? null,
        plan: (input.plan === 'svayam' ? 'SVAYAM' : 'POORNA') as never,
        /*
         * DIRECT, and not SALES.
         *
         * The source is the record of HOW somebody got here, and this one did not
         * come off a sales desk — nobody walked them down the rail at all. Filing
         * them under SALES would make the arrivals trail read as if the twelve
         * steps had been run by the sales route, which is precisely the fact this
         * door has to be honest about. `direct` is not offered on the New-arrival
         * sheet (see PICKABLE_ARRIVAL_SOURCES) — it is only ever stamped here.
         */
        source: 'DIRECT' as never,
        note: input.note ?? null,
        step: FLOW[0]!.key,
        ticks: {},
        healed: {},
        flowVersion: FLOW_VERSION,
        status: 'PROMOTED' as never,
        createdById: actor.id,
      },
    });

    return {
      clientId: await birthClient(tx, a, actor, shape, targets),
      arrivalId: a.id,
      plan: a.plan,
    };
  });

  /* TWO rows, because two things happened. The first is the row `POST /arrivals`
     writes, so the arrivals trail is complete however a person got onto it. The
     second is this act, and it carries the REASON — the only record of why the
     SOP was skipped, which is the whole price of the door. */
  await audit.record({
    actorId: actor.id,
    action: 'arrival.created',
    subjectType: 'arrival',
    subjectId: arrivalId,
    meta: { name: input.name, plan, source: 'DIRECT' },
    ip: opts.ip ?? null,
  });
  await audit.record({
    actorId: actor.id,
    action: 'client.created_direct',
    subjectType: 'client',
    subjectId: clientId,
    reason: input.reason,
    meta: { name: input.name, plan, reason: input.reason, arrivalId, skippedSop: true },
    ip: opts.ip ?? null,
  });

  /* answered in the shape `GET /clients/:id` answers, THROUGH that same read —
     the Super Admin is sent straight to the record to seat the pod, and a second
     shaper here is how a sheet and a record come to disagree about a client that
     is one second old */
  return clients.get({ id: actor.id, role: actor.role }, clientId);
}
