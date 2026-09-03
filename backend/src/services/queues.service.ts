import type { ApprovalStatus, ChainKind, Prisma, WorklistType } from '@prisma/client';
import {
  CHAIN_LABELS,
  QUEUE_BOARDS,
  QUEUE_BOARD_LABELS,
  chainWalked,
  compareBySla,
  ratingNoteSatisfied,
  slaReading,
  stageRoleOf,
  type ChainStep,
  type Perm,
  type QueueBoard,
  type SlaReading,
} from '@haalving/shared';

import { prisma } from '../config/prisma.js';
import { startOfDay, todayISO } from '../utils/dates.js';
import { can } from '../middleware/authorize.js';
import { ApiError } from '../utils/apiResponse.js';
import * as audit from './audit.service.js';
import { postMessage } from './circle.service.js';
import * as config from './config.service.js';
import { clientScopeWhere, podSeatScope, type Scoper } from './scope.service.js';

/**
 * WORK QUEUES — the six SLA-bound boards, and the rules that move them.
 *
 * The host draws six tabs in one fixed order (console-queues.js:10) and the
 * boards themselves belong to five different modules in the demo. Here they are
 * one service, because what they share is what matters: a clock, a scope, and a
 * refusal that has to be written down.
 *
 * THREE RULES RUN THROUGH EVERYTHING BELOW.
 *
 * 1. THE CHAIN IS SNAPSHOTTED AT CREATION and never re-read while an item is in
 *    flight. `create` is the only place a snapshot is taken and `chainOf` is the
 *    only place one is read; nothing in this file calls `config.getChain` for an
 *    approval that already exists. See `create` for the argument.
 *
 * 2. THE SLA CLOCK IS LIVE. `config.getSla()` is read on every meals request and
 *    nothing about it is stored on a meal, so an Ops edit to the reply target
 *    moves every pill on the board on the next read. That is the deliberate
 *    opposite of rule 1, and the two are not in tension: a chain is a sequence
 *    somebody is halfway through, a reply target is a promise being kept now.
 *
 * 3. A BOARD A ROLE MAY NOT SEE DOES NOT APPEAR. The demo's own words — "a role
 *    with no permitted board never reaches this screen" — so `boards()` filters
 *    rather than disabling, and every direct call to a board a caller may not see
 *    is refused and logged.
 */

/* ------------------------------------------------------------------ refusals */

/**
 * Refuse, and write the row that makes the console's promise true.
 *
 * Every screen in this module tells somebody "This access attempt was logged"
 * (console-medical.js:233 says it in as many words). Only the server can make
 * that a fact, so no refusal in this file throws without passing through here.
 */
async function deny(
  user: Scoper,
  what: string,
  subjectType: string,
  subjectId: string | null,
  message: string,
): Promise<never> {
  await audit.record({
    actorId: user.id,
    action: 'denied',
    subjectType,
    subjectId,
    reason: what,
    meta: { role: user.role },
  });
  throw ApiError.forbidden(message);
}

/**
 * Queues is a staff surface. `clientScopeWhere` resolves a client to their OWN
 * record, so without this line every scope check below would pass for a client
 * and they would be reading their own meal queue from the console's API.
 */
function assertStaff(user: Scoper): void {
  if (user.role === 'client') throw ApiError.forbidden();
}

/* -------------------------------------------------------------- the six boards */

/**
 * Who may see which board.
 *
 * PERMISSIONS, NOT ROLE LISTS. The demo's meals board carries
 * `roles: ['dietitian','admin','opshead','opsmgr','core']` because its little
 * registry has nowhere else to put the rule; those five are exactly the roles
 * holding `rateMeals` or `seeAllClients`, so the permission pair says the same
 * thing and keeps saying it after somebody edits the matrix in People & Access.
 * The medical board already reads this way in the demo (`perm: 'rawRecords'`).
 *
 * `null` means every staff seat, which is how the work list is open to all of
 * them: it is the board of your own work, and everybody has some.
 *
 * ANY ONE of the listed permissions is enough.
 */
const BOARD_GATE: Record<QueueBoard, readonly Perm[] | null> = {
  work: null,
  approvals: ['approve'],
  meals: ['rateMeals', 'seeAllClients'],
  /* reading raw records and signing the summary off them are two rights, and the
     desk is open to either — a role granted only `signSummary` still has work
     here, it simply never sees the document behind it */
  medical: ['rawRecords', 'signSummary'],
  /*
   * NO GATE — the board is scoped instead, which is the honest shape for it.
   *
   * It used to need `seeAllClients`, which kept every pillar coach out of a board
   * about THEIR clients while handing the Haalving Coach the whole building. Both
   * halves were wrong. `listDeviations` narrows by pod seat now, so a coach with
   * no clients sees an empty board rather than being refused one.
   */
  deviations: null,
  live: ['seeAllClients'],
};

async function maySee(user: Scoper, board: QueueBoard): Promise<boolean> {
  const gate = BOARD_GATE[board];
  if (!gate) return true;
  for (const perm of gate) {
    if (await can(user.role, perm)) return true;
  }
  return false;
}

/** Every board this caller may see, in the host's order. */
async function visibleBoards(user: Scoper): Promise<QueueBoard[]> {
  const out: QueueBoard[] = [];
  for (const board of QUEUE_BOARDS) {
    if (await maySee(user, board)) out.push(board);
  }
  return out;
}

/**
 * The gate on every direct read of a board.
 *
 * The tab list already hides what a caller may not see, but a hidden tab is a
 * hint: the URL is still guessable and the API is still open to anything holding
 * a token. This is the rule.
 */
async function requireBoard(user: Scoper, board: QueueBoard): Promise<void> {
  assertStaff(user);
  if (await maySee(user, board)) return;
  await deny(user, `queues.${board}`, 'queues', board, 'Not available for your role.');
}

export interface BoardTab {
  key: QueueBoard;
  label: string;
  /**
   * What the tab badges. NULL, not 0, for a board that keeps no count — the demo
   * gives `deviations` and `live` no `count()` at all, and a hard zero over a
   * board that simply does not badge would read as "nothing to do here".
   */
  count: number | null;
}

/**
 * The whole host in one call: the tabs, their counts, and the waiting pill.
 *
 * ONE ROUND TRIP on purpose. Six calls would mean the header's total could
 * disagree with the tab it is summing, which is exactly the drift the demo
 * called out on its own work board — "Badge and list now read off the exact same
 * scoping expression" (console-ops.js:341).
 */
export async function boards(user: Scoper): Promise<{ boards: BoardTab[]; waiting: number }> {
  assertStaff(user);
  const visible = await visibleBoards(user);
  const scope = await clientScopeWhere(user);

  const tabs: BoardTab[] = [];
  for (const key of visible) {
    tabs.push({ key, label: QUEUE_BOARD_LABELS[key], count: await countFor(user, key, scope) });
  }

  return {
    boards: tabs,
    /* the demo's own sum (console-queues.js:22): a board with no count adds
       nothing rather than adding zero, which is the same number and a different
       statement */
    waiting: tabs.reduce((n, t) => n + (t.count ?? 0), 0),
  };
}

async function countFor(
  user: Scoper,
  board: QueueBoard,
  scope: Prisma.ClientWhereInput,
): Promise<number | null> {
  switch (board) {
    case 'work':
      /*
       * THE BADGE COUNTS THE LIST, literally.
       *
       * It used to be a `count()` over the same where-clause, which was honest
       * while "open" was a column. It is not one any more — today's occurrence of
       * a recurring duty is done or not, and only the shaping knows. A SQL count
       * would answer a different question from the list beneath it, which is the
       * exact drift this board already recorded fixing once.
       */
      return (await listWorklist(user, { status: 'OPEN' })).length;
    case 'approvals':
      /* what is waiting on THIS person's signature, which is what the demo's
         ring counts — not every approval in the building */
      return (await signatureQueue(user, scope)).length;
    case 'meals':
      return prisma.meal.count({ where: { AND: [{ client: scope }, { finalStars: null }] } });
    case 'medical':
      return prisma.medicalSummary.count({
        where: { AND: [medicalScope(scope), { status: 'PENDING' }] },
      });
    case 'deviations': {
      /*
       * "New since you looked", not "how many exist".
       *
       * A Deviation carries no resolved state, so a plain count would climb
       * forever — and a badge that never clears is one nobody reads. The demo's
       * own seen-bag answers the right question, and the board stamps it.
       */
      const [rows, seen] = await Promise.all([
        prisma.deviation.findMany({
          where: { client: await deviationScope(user) },
          select: { id: true },
        }),
        deviationsSeen(user.id),
      ]);
      return rows.filter((d) => !seen.has(d.id)).length;
    }
    case 'live':
      return null;
  }
}

/* ------------------------------------------------------------------ work list */

/**
 * WHO SEES WHICH ROWS — the one scoping expression, so the badge and the list
 * cannot drift apart (console-ops.js:13).
 *
 * This is the ONE board that does not scope through `clientScopeWhere`, and the
 * reason is what a work item is: a line addressed to a PERSON. "Call Meena I."
 * belongs to whoever has to make the call, not to everyone who can see Meena,
 * and taking it away from its owner because they lost a pod seat would lose the
 * work rather than reassign it. `seeAllClients` sees everybody's, which is the
 * demo's rule and the one its own filter row is built for.
 */
async function worklistScope(
  user: Scoper,
  q: { pillar?: string; type?: WorklistType | 'MEETING'; ownerId?: string },
): Promise<Prisma.TaskWhereInput> {
  const seeAll = await can(user.role, 'seeAllClients');

  /*
   * ONE DAY'S WORK, WHATEVER SHAPE IT ARRIVED IN.
   *
   * This used to say `date: null` — "the work queue is the slotless half of
   * tasks" — which is exactly why a task somebody added in Schedule never showed
   * up here. That was the wrong cut. The list is not the half of the table with
   * no hour on it; it is everything one person has to act on today. A 13:00
   * session and an untimed "call Meena" belong in one list because they are one
   * person's afternoon.
   *
   * So: rows with no slot at all (a rule's work, a typed-in task) OR rows
   * scheduled for today. Tomorrow's calendar is the calendar's business.
   */
  const day = startOfDay(todayISO());

  /*
   * WHOSE WORK. `ownerId` names the desk a slotless row sits on; `assigneeIds`
   * names who a booked task is booked onto. Both are "mine", and asking only the
   * first is how a task the Super Admin put on your calendar stays invisible.
   */
  const who = (id: string): Prisma.TaskWhereInput => ({
    OR: [{ ownerId: id }, { assigneeIds: { has: id } }],
  });

  return {
    AND: [
      /*
       * Slotless work OR today's — PLUS every meeting still to come.
       *
       * A meeting booked onto you is work you have to show up for, and "when to
       * do" it is the whole point of the row, so unlike an ordinary task it earns
       * its place in the list before its day arrives. Past meetings fall away on
       * their own — a date behind `day` matches none of these branches.
       */
      { OR: [{ date: null }, { date: day }, { AND: [{ kind: 'MEETING' }, { date: { gt: day } }] }] },
      /* an owner filter from a caller who cannot see everybody's work is ignored
         rather than refused — it is a UI filter, and the answer is still correctly
         their own rows */
      seeAll ? (q.ownerId ? who(q.ownerId) : {}) : who(user.id),
      ...(q.pillar ? [{ pillar: q.pillar }] : []),
      /* MEETING is a `kind`, not a `workType`; the other four are workTypes */
      ...(q.type ? [q.type === 'MEETING' ? { kind: 'MEETING' as const } : { workType: q.type }] : []),
    ],
  };
}

/*
 * STATUS IS NOT A SQL CLAUSE ANY MORE, and it cannot be.
 *
 * "Done" means two different things depending on the row. A slotless task is done
 * once, so any TaskDone closes it. A booked one is done per occurrence, so only a
 * TaskDone STAMPED WITH THAT DAY closes it. Postgres cannot express that in one
 * predicate over a joined table, and faking it would give the board a status the
 * calendar disagrees with.
 *
 * THE DAY A BOOKED ROW IS READ AGAINST IS ITS OWN, not the wall clock's. The list
 * holds today's slots and the meetings still to come, so the row on screen IS the
 * occurrence; reading Thursday's meeting against Wednesday would show it open the
 * day after somebody closed it.
 *
 * So the filter runs here, over a page that is one person's day.
 */
function isDone(t: { date: Date | null; dones: Array<{ date: Date | null }> }): boolean {
  if (!t.date) return t.dones.length > 0;
  const day = t.date.getTime();
  return t.dones.some((d) => d.date !== null && d.date.getTime() === day);
}

const WORKLIST_ROW = {
  id: true,
  title: true,
  due: true,
  pill: true,
  pillar: true,
  workType: true,
  /* a meeting is a MEETING-kind task; the board labels it from this and shows a
     join button instead of the free-text due pill */
  kind: true,
  link: true,
  clientId: true,
  sourceRule: true,
  /* the slot, which is what makes a row a calendar tile as well as a to-do */
  date: true,
  startMin: true,
  durMin: true,
  /* who it is booked onto, and who put it there — the two halves of `source` */
  assigneeIds: true,
  createdById: true,
  owner: { select: { id: true, name: true, role: true } },
  client: { select: { id: true, name: true } },
  /*
   * EVERY completion, not `take: 1`.
   *
   * A recurring duty carries one row per day it was done, so taking the first
   * would answer "was this ever done" when the question is "was it done today".
   */
  dones: { select: { at: true, byId: true, date: true } },
} satisfies Prisma.TaskSelect;

/**
 * The queue's own reading of a task row — the shape the board has always had,
 * plus where the row came from.
 *
 * `source` is a FIELD, not two systems. A task somebody typed into Schedule and a
 * row a rule raised sit in the same list and sort together; the only difference is
 * how each arrived, and the console may say so if it wants to.
 */
function shapeWork(t: Prisma.TaskGetPayload<{ select: typeof WORKLIST_ROW }>, user: Scoper) {
  const done = isDone(t);
  const occurrence = t.date?.getTime();
  const doneRow = t.date
    ? (t.dones.find((d) => d.date !== null && d.date.getTime() === occurrence) ?? null)
    : (t.dones[0] ?? null);

  /* a rule that raised it beats everything: the row is the rule's, whoever it
     landed on. Otherwise you either made it or somebody made it for you. */
  const source: 'rule' | 'manual' | 'assigned' = t.sourceRule
    ? 'rule'
    : t.createdById === user.id
      ? 'manual'
      : 'assigned';

  return {
    id: t.id,
    /* the board calls it `text`; the table calls it `title`. One row, two
       vocabularies — the screen keeps the word it has always used. */
    text: t.title,
    due: t.due ?? '',
    pill: t.pill ?? 'info',
    status: done ? 'DONE' : 'OPEN',
    pillar: t.pillar,
    /* a meeting reads as its own type; everything else keeps its workType (or the
       plain TASK a rule/typed row carries) */
    type: t.kind === 'MEETING' ? 'MEETING' : (t.workType ?? 'TASK'),
    clientId: t.clientId,
    sourceRule: t.sourceRule,
    source,
    /* present only on a booked row — the console draws the time pill from it */
    date: t.date ? t.date.toISOString().slice(0, 10) : null,
    startMin: t.startMin,
    durMin: t.durMin,
    /* a meeting's room, when it has one, so the row can offer "Join" */
    link: t.link ?? null,
    doneAt: doneRow?.at ?? null,
    owner: t.owner,
    client: t.client,
  };
}

export async function listWorklist(
  user: Scoper,
  q: { status?: 'OPEN' | 'DONE' | 'ALL'; pillar?: string; type?: WorklistType | 'MEETING'; ownerId?: string } = {},
) {
  await requireBoard(user, 'work');

  const rows = await prisma.task.findMany({
    where: await worklistScope(user, q),
    select: WORKLIST_ROW,
    /* oldest first; the open-before-done half of the sort happens below, because
       "done" is the presence of a row in another table stamped with today, which
       Postgres cannot order by directly. Sorting one person's day costs nothing. */
    orderBy: [{ createdAt: 'asc' }],
  });

  const status = q.status ?? 'OPEN';
  const shaped = rows
    .map((t) => shapeWork(t, user))
    .filter((r) => status === 'ALL' || r.status === status);

  /*
   * Open work first, then BY THE CLOCK inside each half.
   *
   * A booked row has an hour and a slotless one does not, so the timed work sorts
   * to the top of the open half in the order it will actually happen, and the
   * untimed follows in the order it was raised. Sorting them into one undated
   * heap would bury a 13:00 session under a task with no deadline.
   */
  const key = (r: { startMin: number | null }) => r.startMin ?? Number.MAX_SAFE_INTEGER;
  return shaped.sort(
    (a, b) =>
      (a.status === 'DONE' ? 1 : 0) - (b.status === 'DONE' ? 1 : 0) || key(a) - key(b),
  );
}

/**
 * Tick a row off.
 *
 * Only its OWNER, or somebody who can see everybody's work. The demo has no such
 * check — a browser store trusts whoever is looking at it — but "Done" is a claim
 * that work was carried out, and a claim made under somebody else's name is worth
 * refusing and worth logging.
 */
/**
 * Put a line of work on somebody's desk.
 *
 * WHO MAY ASSIGN TO WHOM. Anybody may give themselves work — that needs no
 * permission, because it grants nothing. Assigning to somebody ELSE is a claim
 * on their day, so it needs `seeAllClients`, the same right that lets you see
 * everybody's queue in the first place: you should not be able to fill a list
 * you cannot read.
 *
 * THE ROW IS UNSCHEDULED. It carries no date, which is what makes it queue-only
 * — the Schedule reads `date IS NOT NULL` and will never draw it. Giving it a
 * time is a separate act on the calendar, and the same row moves there.
 *
 * `sourceRule` is left null on purpose: a person typed this, and the column
 * exists to say when one did not.
 */
export interface CreateWorkInput {
  text: string;
  ownerId: string;
  clientId?: string | null;
  pillar?: string | null;
  type?: WorklistType;
  due?: string;
  pill?: string;
}

export async function createWork(user: Scoper, input: CreateWorkInput) {
  await requireBoard(user, 'work');

  if (input.ownerId !== user.id && !(await can(user.role, 'seeAllClients'))) {
    await deny(
      user,
      'queues.worklistCreate',
      'worklist',
      input.ownerId,
      'Putting work on somebody else’s list needs the permission that lets you see it.',
    );
  }

  const owner = await prisma.user.findUnique({
    where: { id: input.ownerId },
    select: { id: true, status: true },
  });
  if (!owner) throw ApiError.badRequest('No such person to give it to.');
  /* a deactivated seat cannot act, so work filed there is work nobody will do */
  if (owner.status !== 'active') {
    throw ApiError.badRequest('That person is not active — their queue is not being worked.');
  }

  /* a client named on the row has to be one this caller can actually see, or the
     queue becomes a way to learn who is a member by guessing ids */
  if (input.clientId) {
    const scope = await clientScopeWhere(user);
    const seen = await prisma.client.findFirst({
      where: { AND: [{ id: input.clientId }, scope] },
      select: { id: true },
    });
    if (!seen) throw ApiError.notFound('No such client.');
  }

  const row = await prisma.task.create({
    data: {
      title: input.text,
      kind: 'INTERNAL',
      /* no slot — this is what keeps it off the calendar */
      date: null,
      startMin: null,
      durMin: null,
      ownerId: input.ownerId,
      assigneeIds: [input.ownerId],
      workType: input.type ?? 'TASK',
      due: input.due ?? 'today',
      pill: input.pill ?? 'info',
      pillar: input.pillar ?? null,
      clientId: input.clientId ?? null,
      createdById: user.id,
    },
    select: WORKLIST_ROW,
  });

  await audit.record({
    actorId: user.id,
    action: 'queues.worklist_create',
    subjectType: 'worklist',
    subjectId: row.id,
    meta: { text: input.text, ownerId: input.ownerId, forSelf: input.ownerId === user.id },
  });

  return shapeWork(row, user);
}

/**
 * Tick a line of work off — EVERY line, whatever shape it arrived in.
 *
 * This door used to refuse a booked row: "close it on the day it runs", on the
 * Schedule. But the board that shows the row is where a person is standing when
 * they finish it, and a list where some rows can be closed and others can only be
 * read teaches you to leave the board to do your work. The list already holds one
 * person's day — today's slots and the meetings still to come — so the row on
 * screen names its own occurrence, and closing it here writes the SAME `TaskDone`
 * the calendar writes rather than a second, private notion of done.
 */
export async function markWorklistDone(user: Scoper, id: string) {
  await requireBoard(user, 'work');

  const row = await prisma.task.findUnique({
    where: { id },
    select: {
      id: true,
      ownerId: true,
      assigneeIds: true,
      title: true,
      date: true,
      /* EVERY completion, not `take: 1` — a booked row carries one per day it was
         done, and the question here is whether THIS occurrence is closed */
      dones: { select: { id: true, date: true } },
    },
  });
  if (!row) throw ApiError.notFound('No such task.');

  /* the day the tick is stamped with: a booked row is done per occurrence, so it
     carries its own date; unscheduled work is done once and today is the only
     date it has */
  const day = row.date ?? startOfDay(todayISO());

  /* WHOSE ROW IT IS, read the way the list reads it: `ownerId` names the desk a
     slotless row sits on, `assigneeIds` names who a booking is booked onto.
     Asking only the first would show a coach a session they cannot close. */
  const mine = row.ownerId === user.id || row.assigneeIds.includes(user.id);
  if (!mine && !(await can(user.role, 'seeAllClients'))) {
    await deny(user, 'queues.worklistDone', 'worklist', id, 'That task is not yours to close.');
  }
  if (isDone(row)) throw ApiError.conflict('That task is already closed.');

  /* completion is a `TaskDone` row, the same record the calendar keeps — and
     `upsert` on the (task, day) pair, because two people on one meeting both
     ticking it off is agreement, not a collision */
  await prisma.taskDone.upsert({
    where: { taskId_date: { taskId: id, date: day } },
    create: { taskId: id, date: day, byId: user.id },
    update: { byId: user.id, at: new Date() },
  });
  const next = shapeWork(
    await prisma.task.findUniqueOrThrow({ where: { id }, select: WORKLIST_ROW }),
    user,
  );

  await audit.record({
    actorId: user.id,
    action: 'queues.worklist_done',
    subjectType: 'worklist',
    subjectId: id,
    meta: { text: row.title, ownerId: row.ownerId },
  });

  return next;
}

/**
 * Close the work a completed act was generated for.
 *
 * "Completing the underlying action auto-clears the generated task"
 * (console-medical.js:403). The demo finds the row by MATCHING ITS TEXT, which
 * works in a store of six hand-written strings and is a coincidence anywhere
 * else — so the port matches on the two columns that actually say what a row is
 * about: its type and its client. A rule that generated no row clears nothing,
 * which is the correct no-op.
 */
async function clearGeneratedWork(
  tx: Prisma.TransactionClient,
  clientId: string,
  type: WorklistType,
): Promise<void> {
  const open = await tx.task.findMany({
    where: { clientId, workType: type, date: null, dones: { none: {} } },
    select: { id: true },
  });
  const day = new Date(new Date().setHours(0, 0, 0, 0));
  for (const t of open) {
    await tx.taskDone.create({ data: { taskId: t.id, date: day } });
  }
}

/* ------------------------------------------------------------------ approvals */

const APPROVAL_ROW = {
  id: true,
  type: true,
  clientId: true,
  prospect: true,
  pillar: true,
  title: true,
  status: true,
  stage: true,
  due: true,
  aiDraft: true,
  returnReason: true,
  chain: true,
  chainVersion: true,
  createdAt: true,
  owner: { select: { id: true, name: true, role: true } },
  client: { select: { id: true, name: true } },
  history: {
    orderBy: { at: 'asc' },
    select: {
      act: true,
      note: true,
      at: true,
      by: { select: { id: true, name: true, role: true } },
    },
  },
} satisfies Prisma.ApprovalSelect;

type ApprovalRow = Prisma.ApprovalGetPayload<{ select: typeof APPROVAL_ROW }>;

/**
 * The chain this item walks — ITS OWN, off the row.
 *
 * The only reader of the snapshot, and deliberately the only one: a second place
 * that worked out "whose signature is next" could work it out from the live
 * chain, and then the board and the service would disagree about who is holding
 * something up.
 */
function chainOf(ap: { chain: Prisma.JsonValue }): ChainStep[] {
  return (ap.chain as unknown as ChainStep[] | null) ?? [];
}

/**
 * A role's name as the product says it out loud, for the sentences a refusal
 * hands back. Read from the Role table rather than the shared matrix, because
 * People & Access renames roles at runtime and "waiting on opshead" is not a
 * sentence anybody says.
 */
async function roleTitle(key: string | null): Promise<string> {
  if (!key) return 'nobody';
  const row = await prisma.role.findUnique({ where: { key }, select: { title: true } });
  return row?.title ?? key;
}

/** Whose signature it is waiting on, or null when it is not waiting on one. */
function stageRole(ap: { chain: Prisma.JsonValue; stage: number; status: ApprovalStatus }): string | null {
  if (ap.status !== 'SUBMITTED') return null;
  return stageRoleOf(chainOf(ap), ap.stage);
}

function shapeApproval(ap: ApprovalRow) {
  return {
    id: ap.id,
    type: ap.type,
    typeLabel: CHAIN_LABELS[ap.type as ChainKind] ?? ap.type,
    title: ap.title,
    pillar: ap.pillar,
    due: ap.due,
    aiDraft: ap.aiDraft,
    status: ap.status,
    stage: ap.stage,
    returnReason: ap.returnReason,
    /* the whole chain, not only the step it sits on: the board draws a stepper
       and a client cannot draw one from a single role name */
    chain: chainOf(ap),
    chainVersion: ap.chainVersion,
    waitingOn: stageRole(ap),
    owner: ap.owner,
    client: ap.client,
    /* the name to print. A prospect has no client row, and the board says so
       with its own pill rather than showing a blank line. */
    about: ap.client?.name ?? ap.prospect ?? null,
    isProspect: !ap.clientId && !!ap.prospect,
    createdAt: ap.createdAt,
    history: ap.history,
  };
}

/**
 * The clause that decides which approvals a caller may see.
 *
 * Client-scoped like every other board, PLUS the ones that belong to no client:
 * a goal sheet for a prospect is about somebody who has no pod yet, so no pod
 * scope can reach it and hiding it would hide the work.
 *
 * A CONSTRAINT THIS PUTS ON CONFIGURATION, stated here because it is the only
 * place it is visible: a role named in a chain needs the scope to see the clients
 * it signs for. Every role in the seeded chains (Haalving Coach, Operations Head,
 * Super User) holds `seeAllClients`, so this narrows nothing today — but a chain
 * edited to name a pillar coach would show that coach only their own people's
 * items, which is the safe direction and not a silent one: the item still names
 * the role it is waiting on.
 */
function approvalScope(scope: Prisma.ClientWhereInput): Prisma.ApprovalWhereInput {
  /*
   * `client: { is: scope }`, NEVER `client: scope`.
   *
   * On a NULLABLE relation the two are not the same clause, and the difference
   * only shows for the widest scope there is. `seeAllClients` resolves to `{}`,
   * and Prisma reads a bare `{}` there as the relation filter's own empty
   * object — which contributes nothing in an AND but collapses this OR to its
   * second branch, so the board showed a Super Admin the two prospect items and
   * hid every approval that named a client. `is:` states which of the two
   * meanings we want, and states it identically for every scope.
   */
  return { OR: [{ client: { is: scope } }, { clientId: null }] };
}

/** Items waiting on this caller's own signature. */
async function signatureQueue(user: Scoper, scope: Prisma.ClientWhereInput): Promise<ApprovalRow[]> {
  if (!(await can(user.role, 'approve'))) return [];

  const submitted = await prisma.approval.findMany({
    where: { AND: [approvalScope(scope), { status: 'SUBMITTED' }] },
    select: APPROVAL_ROW,
    orderBy: { createdAt: 'asc' },
  });

  /* the stage role is read from each row's own snapshot, so this cannot be a
     Postgres filter — and must not be, because a filter written against the live
     chain is precisely the bug the snapshot exists to prevent */
  return submitted.filter((ap) => stageRole(ap) === user.role);
}

/**
 * The board: what is waiting on you, what of yours is out, and — for whoever can
 * see everybody — everything else.
 */
export async function listApprovals(user: Scoper) {
  await requireBoard(user, 'approvals');
  const scope = await clientScopeWhere(user);

  const [queue, mine, seeAll] = await Promise.all([
    signatureQueue(user, scope),
    prisma.approval.findMany({
      where: { AND: [approvalScope(scope), { ownerId: user.id }] },
      select: APPROVAL_ROW,
      orderBy: { createdAt: 'desc' },
    }),
    can(user.role, 'seeAllClients'),
  ]);

  const queueIds = new Set(queue.map((a) => a.id));

  const all = seeAll
    ? await prisma.approval.findMany({
        where: approvalScope(scope),
        select: APPROVAL_ROW,
        orderBy: { createdAt: 'desc' },
      })
    : [];

  /*
   * THE ROLE TITLES, once, for the whole board.
   *
   * A chain step stores a role KEY and nothing else, because People & Access can
   * rename a role at runtime and a snapshot holding "Operations Head" would go on
   * saying it after somebody renamed the seat. So the stepper is drawn from live
   * titles over a frozen sequence: the ORDER is history, the WORDS are current.
   */
  const titles = Object.fromEntries(
    (await prisma.role.findMany({ select: { key: true, title: true } })).map((r) => [
      r.key,
      r.title,
    ]),
  );

  return {
    roleTitles: titles,
    queue: queue.map(shapeApproval),
    /* mine, in flight — and an item waiting on my OWN signature is in the queue
       above rather than twice on one screen (console-approvals.js:164) */
    inFlight: mine
      .filter((a) => a.status === 'SUBMITTED' && !queueIds.has(a.id))
      .map(shapeApproval),
    returned: mine
      .filter((a) => a.status === 'DRAFT' && a.returnReason)
      .map(shapeApproval),
    drafts: mine.filter((a) => a.status === 'DRAFT' && !a.returnReason).map(shapeApproval),
    all: all.map(shapeApproval),
    seesAll: seeAll,
  };
}

/** Load one, scoped. 404 rather than 403 — that a sign-off exists is itself a fact. */
async function loadApproval(user: Scoper, id: string): Promise<ApprovalRow> {
  const scope = await clientScopeWhere(user);
  const row = await prisma.approval.findFirst({
    where: { AND: [{ id }, approvalScope(scope)] },
    select: APPROVAL_ROW,
  });
  if (!row) throw ApiError.notFound('No such approval.');
  return row;
}

export interface CreateApprovalInput {
  type: ChainKind;
  title: string;
  clientId?: string | null;
  prospect?: string | null;
  pillar?: string | null;
  due: string;
  aiDraft: string;
}

/**
 * Mint one — AND TAKE THE SNAPSHOT. This is the only place in the codebase that
 * does, and everything else reads what it wrote.
 *
 * The chain is copied out of `config.getChainSnapshot(type)` here, at creation,
 * and is never read again while the item is in flight. The reason is not caution
 * about configuration changing; it is that a signature is a statement about a
 * SEQUENCE. If the live chain were consulted on every act, then an Ops Head who
 * removed a step would throw away a signature already given — the item would jump
 * past somebody who had signed — and one who added a step would demand a
 * signature from a person who was never asked for it. Either way the audit trail
 * would describe a walk the item did not take. Configuration's own contract says
 * the same thing from the other side (schema.prisma, ApprovalChain): chain edits
 * apply to NEW submissions only.
 *
 * The version travels with the steps so the trail stays legible: a reader six
 * months from now can see that this item collected chain v3 and go and look at
 * what v3 was.
 *
 * THE OWNER IS THE CALLER, never the body. An approval names who proposed it, and
 * proposing something under a colleague's name is not a field a request may set.
 */
export async function create(user: Scoper, input: CreateApprovalInput) {
  /*
   * NO `approve` GATE HERE, deliberately. Proposing something and signing it are
   * different acts by different people: Vikram writes the chart and holds
   * `buildCharts`, the Operations Head signs it and holds `approve`. Gating
   * creation on the approvals board would mean only signers could ever raise
   * anything, which is the chain upside down.
   */
  assertStaff(user);

  if (!input.clientId && !input.prospect) {
    throw ApiError.badRequest('A sign-off needs a client or a prospect it is about.');
  }

  if (input.clientId) {
    /* asked as a scoped count rather than by loading and comparing, so the answer
       comes from the same clause every list uses */
    const scope = await clientScopeWhere(user);
    const seen = await prisma.client.count({ where: { AND: [scope, { id: input.clientId }] } });
    if (!seen) throw ApiError.notFound('No such client.');
  }

  const snapshot = await config.getChainSnapshot(input.type);
  if (!snapshot.steps.length) {
    /* a chain with no steps would publish on creation — an approval nobody
       approves. Configuration refuses to save one; this refuses to walk one. */
    throw ApiError.conflict(
      `There is no approval chain for ${CHAIN_LABELS[input.type] ?? input.type}.`,
    );
  }

  const row = await prisma.approval.create({
    data: {
      type: input.type,
      clientId: input.clientId ?? null,
      prospect: input.prospect ?? null,
      pillar: input.pillar ?? null,
      title: input.title,
      ownerId: user.id,
      status: 'DRAFT',
      stage: 0,
      due: input.due,
      aiDraft: input.aiDraft,
      chain: snapshot.steps as unknown as Prisma.InputJsonValue,
      chainVersion: snapshot.version,
    },
    select: APPROVAL_ROW,
  });

  await audit.record({
    actorId: user.id,
    action: 'approval.created',
    subjectType: 'approval',
    subjectId: row.id,
    /* the chain is recorded on the CREATION row as well as on the approval: the
       trail should say which sequence this item was born to walk, without having
       to go and read a column that a later migration could reshape */
    meta: {
      type: input.type,
      chainVersion: snapshot.version,
      chain: snapshot.steps,
    } as unknown as Prisma.InputJsonValue,
  });

  return shapeApproval(row);
}

/**
 * Put it on the board. Only its owner, and only while it is a draft.
 *
 * Like `create`, this needs no `approve`: submitting is asking for a signature,
 * not giving one. The owner works from the builder, which is where the demo's
 * returned card sends them ("Edit and resubmit from Charts & Plans").
 */
export async function submit(user: Scoper, id: string, note?: string) {
  assertStaff(user);
  const ap = await loadApproval(user, id);

  if (ap.owner.id !== user.id) {
    await deny(user, 'approval.submit', 'approval', id, 'That sign-off is not yours to submit.');
  }
  if (ap.status !== 'DRAFT') {
    throw ApiError.conflict('That sign-off is already on the board.');
  }
  if (!chainOf(ap).length) {
    throw ApiError.conflict('That sign-off has no chain to walk.');
  }

  const next = await prisma.$transaction(async (tx) => {
    await tx.approvalEvent.create({
      data: { approvalId: id, act: 'SUBMITTED', byId: user.id, note: note ?? null },
    });
    /* back to the top of ITS OWN chain, and the return note goes — the thing it
       asked for has either been done or it has not, and a stale reason on a
       resubmitted draft reads as a fresh objection */
    return tx.approval.update({
      where: { id },
      data: { status: 'SUBMITTED', stage: 0, returnReason: null },
      select: APPROVAL_ROW,
    });
  });

  return shapeApproval(next);
}

/**
 * Sign it.
 *
 * One signature moves it one step down THE SNAPSHOT; the last one publishes, and
 * publishing is what delivers the artifact to the client's Care Circle
 * (console-approvals.js:105).
 *
 * Three different refusals, and they are different on purpose:
 *   403  the caller cannot sign anything at all           (and it is logged)
 *   409  the caller signs, but this is not their turn     (nobody is at fault)
 *   409  it is not waiting on a signature in the first place
 */
export async function sign(user: Scoper, id: string, note?: string) {
  assertStaff(user);

  /* the permission BEFORE the row: a caller who may not sign anything has no
     business learning whether this particular sign-off exists */
  if (!(await can(user.role, 'approve'))) {
    await deny(
      user,
      'approval.sign',
      'approval',
      id,
      'Signing a chart needs the approve permission. This attempt was logged.',
    );
  }

  const ap = await loadApproval(user, id);

  if (ap.status !== 'SUBMITTED') {
    throw ApiError.conflict(
      ap.status === 'PUBLISHED'
        ? 'That sign-off has already published.'
        : 'That sign-off is still a draft.',
    );
  }

  const chain = chainOf(ap);
  const waiting = stageRoleOf(chain, ap.stage);
  if (waiting !== user.role) {
    /* OUT OF TURN. Not a permission failure — this person may well sign it, just
       not yet — so it is a 409 naming who is holding it, and it writes no denial
       row because nobody did anything wrong. */
    throw ApiError.conflict(
      waiting
        ? `That is waiting on ${await roleTitle(waiting)} first.`
        : 'That sign-off has already collected every signature.',
      { waitingOn: waiting, stage: ap.stage, chain },
    );
  }

  const stage = ap.stage + 1;
  const published = chainWalked(chain, stage);

  const next = await prisma.$transaction(async (tx) => {
    await tx.approvalEvent.create({
      data: { approvalId: id, act: 'APPROVED', byId: user.id, note: note ?? null },
    });

    if (published) {
      await tx.approvalEvent.create({ data: { approvalId: id, act: 'PUBLISHED', byId: user.id } });

      /*
       * THE DELIVERY STEP OF THE SOP. "The last signature publishes to the Care
       * Circle" is the sentence the approve sheet shows the signer, and it is
       * only true if something actually lands in the room.
       *
       * Nothing is posted for a prospect: they have no room to post into yet.
       * The card is authored by the OWNER, not by the signer — the plan is the
       * coach's work and the client should see their coach's name on it; who
       * cleared it is recorded on the trail, where that fact belongs.
       */
      if (ap.clientId) {
        await postMessage(
          ap.clientId,
          {
            fromUserId: ap.owner.id,
            fromKind: 'STAFF',
            kind: 'DOC',
            text: `${ap.title} — approved and published to your plan.`,
          },
          tx,
        );
      }
    }

    /* THE ROW IS READ BACK LAST, after every event this act writes. Reading it
       between the two would answer the caller with a trail that stops one line
       short of what just happened — the record correct, the screen a signature
       behind it. */
    return tx.approval.update({
      where: { id },
      data: { stage, status: published ? 'PUBLISHED' : 'SUBMITTED' },
      select: APPROVAL_ROW,
    });
  });

  await audit.record({
    actorId: user.id,
    action: published ? 'approval.published' : 'approval.signed',
    subjectType: 'approval',
    subjectId: id,
    meta: { stage, chainVersion: ap.chainVersion, type: ap.type },
  });

  return shapeApproval(next);
}

/**
 * Send it back with a reason.
 *
 * Only the person it is waiting on, for the same reason only they may sign: a
 * return is a decision at a stage, and a stage belongs to one seat. It goes back
 * to DRAFT at stage 0 rather than to the previous signature — the demo's own
 * shape (core.js:1255), and the right one: the owner is going to change the thing,
 * and every signature already given was given to a document that no longer exists.
 */
export async function returnApproval(user: Scoper, id: string, reason: string) {
  assertStaff(user);

  if (!(await can(user.role, 'approve'))) {
    await deny(
      user,
      'approval.return',
      'approval',
      id,
      'Returning a chart needs the approve permission. This attempt was logged.',
    );
  }

  const ap = await loadApproval(user, id);

  if (ap.status !== 'SUBMITTED') {
    throw ApiError.conflict('That sign-off is not waiting on a signature.');
  }

  const waiting = stageRoleOf(chainOf(ap), ap.stage);
  if (waiting !== user.role) {
    throw ApiError.conflict(`That is with ${await roleTitle(waiting)}, not with you.`, {
      waitingOn: waiting,
    });
  }

  const next = await prisma.$transaction(async (tx) => {
    await tx.approvalEvent.create({
      data: { approvalId: id, act: 'RETURNED', byId: user.id, note: reason },
    });
    return tx.approval.update({
      where: { id },
      /* the reason lives on the row AND on the trail: the owner reads it on the
         card without opening the history, and the history keeps it after the
         next submission clears the card */
      data: { status: 'DRAFT', stage: 0, returnReason: reason },
      select: APPROVAL_ROW,
    });
  });

  await audit.record({
    actorId: user.id,
    action: 'approval.returned',
    subjectType: 'approval',
    subjectId: id,
    reason,
    meta: { type: ap.type, toOwner: ap.owner.id },
  });

  return shapeApproval(next);
}

/* ---------------------------------------------------------------------- meals */

const MEAL_ROW = {
  id: true,
  clientId: true,
  slot: true,
  capturedAt: true,
  fullness: true,
  photo: true,
  dishes: true,
  aiStars: true,
  aiConf: true,
  aiDetected: true,
  aiNote: true,
  finalStars: true,
  finalNote: true,
  finalVoiceSec: true,
  ratedAt: true,
  rubric: true,
  protein: true,
  kcal: true,
  client: { select: { id: true, name: true, observation: true } },
  finalBy: { select: { id: true, name: true } },
} satisfies Prisma.MealSelect;

type MealRow = Prisma.MealGetPayload<{ select: typeof MEAL_ROW }>;

function shapeMeal(m: MealRow, sla: SlaReading | null) {
  return {
    id: m.id,
    client: m.client,
    slot: m.slot,
    capturedAt: m.capturedAt,
    fullness: m.fullness,
    photo: m.photo,
    dishes: m.dishes,
    /* the pre-score travels as its own object, never merged with the human's:
       the composer draws it as ghost stars BEHIND the choice, and a screen given
       one number could not */
    ai: { stars: m.aiStars, conf: m.aiConf, detected: m.aiDetected, note: m.aiNote },
    final:
      m.finalStars == null
        ? null
        : {
            stars: m.finalStars,
            /* null here is not missing data — it means the AI rated it, the same
               reading a null pod seat carries */
            by: m.finalBy,
            byAi: m.finalBy === null,
            note: m.finalNote,
            voiceSec: m.finalVoiceSec,
            at: m.ratedAt,
            rubric: m.rubric,
          },
    protein: m.protein,
    kcal: m.kcal,
    sla,
  };
}

/**
 * The queue, awaiting first.
 *
 * The SLA READING IS COMPUTED HERE, on every request, from `config.getSla()` —
 * never stored on the row. That is what makes the Service tab live: change the
 * reply target and every pill on this board moves on the next read, including
 * for plates captured before the change.
 */
export async function listMeals(user: Scoper) {
  await requireBoard(user, 'meals');
  const scope = await clientScopeWhere(user);

  const [rows, sla] = await Promise.all([
    prisma.meal.findMany({ where: { client: scope }, select: MEAL_ROW }),
    config.getSla(),
  ]);

  const now = Date.now();
  const read = (m: MealRow) =>
    slaReading(
      sla,
      {
        capturedAtMs: m.capturedAt.getTime(),
        rated: m.finalStars != null,
        observation: m.client.observation,
      },
      now,
    );

  const awaiting = rows
    .filter((m) => m.finalStars == null)
    .map((m) => ({ row: m, sla: read(m), capturedAtMs: m.capturedAt.getTime() }))
    .sort(compareBySla)
    .map((x) => shapeMeal(x.row, x.sla));

  const rated = rows
    .filter((m) => m.finalStars != null)
    .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime())
    .map((m) => shapeMeal(m, null));

  return {
    awaiting,
    rated,
    /* the ladder, printed above the queue in the numbers Configuration owns —
       "15 min reply target · nudge at 10 · escalate at 25 · to Super Admin" */
    ladder: {
      replyTargetMin: sla.replyTargetMin,
      notifyAfterMin: sla.notifyAfterMin,
      escalateAfterMin: sla.escalateAfterMin,
      escalateAtMin: sla.notifyAfterMin + sla.escalateAfterMin,
      escalateToRole: sla.escalateToRole,
    },
    breached: awaiting.filter((m) => m.sla?.breached).length,
    escalated: awaiting.filter((m) => m.sla?.escalated).length,
  };
}

/**
 * Rate a plate.
 *
 * NO AUTO-PUBLISH, EVER (console-meals.js:2) — this is the only door, it needs
 * `rateMeals`, and what it writes is the only rating a client ever sees.
 */
export async function rateMeal(
  user: Scoper,
  id: string,
  input: { stars: number; note?: string; voiceSec?: number },
) {
  await requireBoard(user, 'meals');

  if (!(await can(user.role, 'rateMeals'))) {
    await deny(
      user,
      'meal.rate',
      'meal',
      id,
      'Rating a plate needs the rateMeals permission. This attempt was logged.',
    );
  }

  const scope = await clientScopeWhere(user);
  const meal = await prisma.meal.findFirst({
    where: { AND: [{ id }, { client: scope }] },
    select: MEAL_ROW,
  });
  if (!meal) throw ApiError.notFound('No such meal.');

  if (meal.finalStars != null) {
    throw ApiError.conflict('That plate has already been rated.');
  }

  /*
   * THE COACHING NOTE, enforced rather than suggested.
   *
   * Below five stars the console disables the button until there is a voice note
   * or 120 typed characters (console-meals.js:66). A disabled button is a hint;
   * this is the rule, and the thing it protects is a client being told their
   * dinner was worth three stars with nothing said about why.
   */
  if (!ratingNoteSatisfied(input.stars, input.voiceSec, input.note)) {
    throw ApiError.badRequest(
      'Anything under five stars needs a coaching note — a voice note, or at least 120 characters.',
      { stars: input.stars },
    );
  }

  const voiceSec = input.voiceSec ?? 0;
  const note = input.note?.trim() || (voiceSec ? 'Voice note attached' : '');

  const next = await prisma.$transaction(async (tx) => {
    const row = await tx.meal.update({
      where: { id },
      data: {
        finalStars: input.stars,
        finalById: user.id,
        finalNote: note || null,
        finalVoiceSec: voiceSec,
        ratedAt: new Date(),
      },
      select: MEAL_ROW,
    });

    /* the rule that put "Rate Rajesh D. lunch" on somebody's list is satisfied
       the moment the plate is rated (console-meals.js:94) */
    await clearGeneratedWork(tx, meal.clientId, 'RATING');

    /*
     * OBSERVATION CLIENTS SEE NOTHING. Days 1-5 are capture-only: the rating is
     * recorded for the team so the pod learns the person's baseline, and the
     * client is shown no stars at all. Posting one anyway would start rating
     * somebody five days before the programme says the rating means anything.
     */
    if (!meal.client.observation) {
      await postMessage(
        meal.clientId,
        {
          fromUserId: user.id,
          fromKind: 'STAFF',
          kind: 'RATING',
          text:
            `${meal.slot} rated ${input.stars} stars. ` +
            (voiceSec ? 'Voice note attached. ' : note ? 'Note added. ' : '') +
            (input.stars >= 4
              ? 'Lovely work — keep this rhythm.'
              : 'One small tweak inside — you’ve got this.'),
        },
        tx,
      );
    }

    return row;
  });

  await audit.record({
    actorId: user.id,
    action: 'meal.rated',
    subjectType: 'meal',
    subjectId: id,
    meta: {
      stars: input.stars,
      /* whether this confirmed the pre-score or overrode it — the demo logs the
         distinction in its own audit line and it is the number that says whether
         the AI is worth trusting */
      /* NULL WHEN THERE WAS NO PRE-SCORE, which is not the same as "did not
         confirm". A meal captured from the phone arrives before anything has
         scored it, and `stars === null` is false for every possible rating - so
         each one would be counted against an AI that never ran. */
      aiStars: meal.aiStars,
      confirmedAi: meal.aiStars === null ? null : input.stars === meal.aiStars,
      voiceSec,
      observation: meal.client.observation,
    },
  });

  return shapeMeal(next, null);
}

/* -------------------------------------------------------------------- medical */

const SUMMARY_ROW = {
  id: true,
  clientId: true,
  prospect: true,
  title: true,
  kind: true,
  uploadedOn: true,
  status: true,
  signedAt: true,
  body: true,
  createdAt: true,
  client: { select: { id: true, name: true } },
  by: { select: { id: true, name: true } },
} satisfies Prisma.MedicalSummarySelect;

type SummaryRow = Prisma.MedicalSummaryGetPayload<{ select: typeof SUMMARY_ROW }>;

/** The three groups a summary is made of, plus the versions it has been through. */
interface SummaryBody {
  conditions?: string[];
  flags?: string[];
  metrics?: string[];
  history?: Array<{
    conditions: string[];
    flags: string[];
    metrics: string[];
    signedById: string | null;
    signedAt: string | null;
  }>;
}

const asBody = (v: Prisma.JsonValue): SummaryBody => (v as SummaryBody | null) ?? {};

function shapeSummary(d: SummaryRow) {
  const body = asBody(d.body);
  return {
    id: d.id,
    title: d.title,
    kind: d.kind,
    uploadedOn: d.uploadedOn,
    status: d.status,
    client: d.client,
    prospect: d.prospect,
    about: d.client?.name ?? d.prospect ?? 'Unknown',
    signedBy: d.by,
    signedAt: d.signedAt,
    summary: {
      conditions: body.conditions ?? [],
      flags: body.flags ?? [],
      metrics: body.metrics ?? [],
    },
    /* "New versions never overwrite priors" — the count is what the board prints
       as v1, v2, v3 under a re-signed summary */
    versions: body.history?.length ?? 0,
    history: body.history ?? [],
  };
}

/**
 * A prospect's document belongs to nobody's pod, so no pod scope reaches it —
 * and the demo shows it to everyone who reaches the desk (console-medical.js:175).
 * Kiran R.'s blood panel is the one pending summary in the whole seed, so a
 * scope that dropped it would empty the board.
 */
function medicalScope(scope: Prisma.ClientWhereInput): Prisma.MedicalSummaryWhereInput {
  /* `is:` for the reason `approvalScope` gives at length — the same nullable
     relation, the same OR, and the same silent failure for a caller who may see
     everybody */
  return { OR: [{ client: { is: scope } }, { clientId: null }] };
}

/**
 * The doctor's desk.
 *
 * READING IT IS AN EVENT. "Every open is audit-logged" is printed under the page
 * title (console-medical.js:421) and repeated inside the raw viewer; the row
 * written here is what makes it true. It is written for the READ, not for a
 * refusal — the audit trail carries both kinds, and a medical record opened
 * legitimately is exactly the access somebody may need to account for later.
 */
export async function listMedical(user: Scoper) {
  await requireBoard(user, 'medical');
  const scope = await clientScopeWhere(user);

  const [rows, rawRecords, signSummary] = await Promise.all([
    prisma.medicalSummary.findMany({
      where: medicalScope(scope),
      select: SUMMARY_ROW,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    }),
    can(user.role, 'rawRecords'),
    can(user.role, 'signSummary'),
  ]);

  await audit.record({
    actorId: user.id,
    action: 'medical.opened',
    subjectType: 'medical',
    subjectId: null,
    meta: { rows: rows.length, rawRecords, role: user.role },
  });

  const shaped = rows.map(shapeSummary);

  return {
    pending: shaped.filter((d) => d.status === 'PENDING'),
    signed: shaped.filter((d) => d.status === 'READY'),
    /*
     * THE RAW RECORD IS A SEPARATE RIGHT from the summary, and the two are
     * answered separately here so the console never has to infer one from the
     * other. There is nothing stored to hand over yet — the demo's viewer is a
     * placeholder — but the ANSWER to "may this person see the document itself"
     * is already the honest one, and the day a file lands behind it this flag is
     * what gates it.
     */
    canSeeRaw: rawRecords,
    canSign: signSummary,
  };
}

/**
 * Sign the summary — or re-sign it.
 *
 * VERSIONS NEVER OVERWRITE PRIORS (console-medical.js:377). Re-signing pushes the
 * outgoing version into the history and writes the new one on top, so what the
 * pod was told last month survives being told something else this month. That is
 * not tidiness: a contraindication flag that quietly disappeared would take a
 * plan's reason for excluding an exercise with it.
 */
export async function signSummary(
  user: Scoper,
  id: string,
  input: { conditions: string[]; flags: string[]; metrics: string[] },
) {
  await requireBoard(user, 'medical');

  if (!(await can(user.role, 'signSummary'))) {
    await deny(
      user,
      'medical.sign',
      'medical',
      id,
      'Signing a health summary needs the signSummary permission. This attempt was logged.',
    );
  }

  const scope = await clientScopeWhere(user);
  const doc = await prisma.medicalSummary.findFirst({
    where: { AND: [{ id }, medicalScope(scope)] },
    select: SUMMARY_ROW,
  });
  if (!doc) throw ApiError.notFound('No such document.');

  if (!input.conditions.length && !input.flags.length && !input.metrics.length) {
    throw ApiError.badRequest('Add at least one condition, flag or metric before signing.');
  }

  const before = asBody(doc.body);
  const wasSigned = doc.status === 'READY';

  const history = [...(before.history ?? [])];
  if (wasSigned) {
    history.push({
      conditions: before.conditions ?? [],
      flags: before.flags ?? [],
      metrics: before.metrics ?? [],
      /* the SIGNER of the version being superseded, read off the row rather than
         off the body — the row is where it was recorded */
      signedById: doc.by?.id ?? null,
      signedAt: doc.signedAt?.toISOString() ?? null,
    });
  }

  const next = await prisma.medicalSummary.update({
    where: { id },
    data: {
      status: 'READY',
      byId: user.id,
      signedAt: new Date(),
      body: {
        conditions: input.conditions,
        flags: input.flags,
        metrics: input.metrics,
        history,
      } as Prisma.InputJsonValue,
    },
    select: SUMMARY_ROW,
  });

  await audit.record({
    actorId: user.id,
    action: wasSigned ? 'medical.resigned' : 'medical.signed',
    subjectType: 'medical',
    subjectId: id,
    meta: {
      title: doc.title,
      clientId: doc.clientId,
      version: history.length + 1,
      flags: input.flags.length,
    },
  });

  return shapeSummary(next);
}

/** The seen-bag key. `HomeSeen.tabKey` is a free string, so this needs no migration. */
const DEVIATIONS_TAB = 'deviations';

/**
 * Whose deviations these are.
 *
 * `seeAllDeviations` is the Super Admin's exemption and nobody else's: every SLA
 * in this system escalates to that seat, so a deviation about a client they do not
 * coach is still their problem. Everyone else gets their own pod.
 */
async function deviationScope(user: Scoper): Promise<Prisma.ClientWhereInput> {
  return (await can(user.role, 'seeAllDeviations')) ? {} : podSeatScope(user);
}

/** What this person has already looked at. */
async function deviationsSeen(userId: string): Promise<Set<string>> {
  const row = await prisma.homeSeen.findUnique({
    where: { userId_tabKey: { userId, tabKey: DEVIATIONS_TAB } },
    select: { ids: true },
  });
  return new Set(row?.ids ?? []);
}

/**
 * Mark deviations read.
 *
 * A deliberate act by the board rather than a side effect of the read: a GET that
 * silently clears your own notice loses work the moment something prefetches it.
 */
export async function markDeviationsSeen(user: Scoper, ids: string[]): Promise<{ seen: number }> {
  await requireBoard(user, 'deviations');

  /* only ids this caller can actually see — otherwise anyone could stamp a
     deviation they were never shown */
  const mine = await prisma.deviation.findMany({
    where: { AND: [{ id: { in: [...new Set(ids)] } }, { client: await deviationScope(user) }] },
    select: { id: true },
  });

  const next = [...new Set([...(await deviationsSeen(user.id)), ...mine.map((d) => d.id)])];
  await prisma.homeSeen.upsert({
    where: { userId_tabKey: { userId: user.id, tabKey: DEVIATIONS_TAB } },
    create: { userId: user.id, tabKey: DEVIATIONS_TAB, ids: next },
    update: { ids: next },
  });
  return { seen: next.length };
}

/* ----------------------------------------------------------------- deviations */

/**
 * What went off the rails, and who is on it.
 *
 * Scoped like every client board even though the gate is `seeAllClients` and the
 * scope is therefore always open today. The clause stays because the gate is
 * editable in People & Access and the scope is not something a board should have
 * an opinion about — it asks the same question `/clients` asks and gets the same
 * answer.
 */
export async function listDeviations(user: Scoper) {
  await requireBoard(user, 'deviations');

  const rows = await prisma.deviation.findMany({
    where: { client: await deviationScope(user) },
    orderBy: { at: 'desc' },
    select: {
      id: true,
      kind: true,
      state: true,
      mode: true,
      at: true,
      client: { select: { id: true, name: true } },
    },
  });

  return rows;
}

/* ---------------------------------------------------------------- live board */

const MIN = 60_000;

/**
 * The live board — four readings, all of them derived.
 *
 * THE DEMO SEEDS THESE (`opsStats: { unrated60: 1, unconfirmedCal24: 1,
 * approvals4h: 0, onTime: '96%' }`, data.js:1789). A seeded operations dashboard
 * is a poster of a dashboard: it cannot go red, so it can never be the thing
 * anybody looks at when something is wrong. Every number below is counted off
 * the same rows the other five boards read, which is the only way the tile and
 * the board it points at can agree.
 *
 * ONE LABEL DEPARTS FROM THE DEMO and it is called out here rather than buried:
 * the demo's fourth tile says "12:00 / 13:00 on-time" over a hard-coded string,
 * and there is no delivery-window record in this system to derive that from.
 * What there IS is the promise the meals board makes all day — a reply inside
 * the target — so this measures that and says so. A real number under an
 * honest label beats a fabricated one under the demo's.
 */
export async function live(user: Scoper) {
  await requireBoard(user, 'live');
  const scope = await clientScopeWhere(user);

  const now = Date.now();
  const sla = await config.getSla();

  const [unratedOver60, unconfirmedCal24, approvals4h, ratedToday] = await Promise.all([
    prisma.meal.count({
      where: {
        AND: [{ client: scope }, { finalStars: null }, { capturedAt: { lt: new Date(now - 60 * MIN) } }],
      },
    }),
    /*
     * A plate's kcal is auto-estimated at capture and CONFIRMED by the human who
     * rates it (see the Meal model). So an unconfirmed calorie figure is one on a
     * plate nobody has rated, and "> 24 h" is the age at which that stops being a
     * queue and starts being a gap in the calorie log.
     */
    prisma.meal.count({
      where: {
        AND: [
          { client: scope },
          { finalStars: null },
          { capturedAt: { lt: new Date(now - 24 * 60 * MIN) } },
        ],
      },
    }),
    /*
     * Sitting on somebody's signature for over four hours. `updatedAt` is the
     * submit instant for a row still in SUBMITTED — the status is what last moved
     * it — which is why this needs no column of its own.
     */
    prisma.approval.count({
      where: {
        AND: [
          approvalScope(scope),
          { status: 'SUBMITTED' },
          { updatedAt: { lt: new Date(now - 4 * 60 * MIN) } },
        ],
      },
    }),
    prisma.meal.findMany({
      where: {
        AND: [
          { client: scope },
          { ratedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
        ],
      },
      select: { capturedAt: true, ratedAt: true },
    }),
  ]);

  /*
   * On time = answered inside the reply target. NULL rather than 100% when
   * nothing has been rated today: a full ring over an empty morning is the one
   * reading that would make somebody stop looking.
   */
  const onTime = ratedToday.filter(
    (m) => m.ratedAt && m.ratedAt.getTime() - m.capturedAt.getTime() <= sla.replyTargetMin * MIN,
  ).length;
  const onTimePct = ratedToday.length ? Math.round((onTime / ratedToday.length) * 100) : null;

  return {
    unratedOver60,
    unconfirmedCal24,
    approvals4h,
    onTimePct,
    ratedToday: ratedToday.length,
    replyTargetMin: sla.replyTargetMin,
    /* the demo's own all-clear condition, and its sentence */
    allClear: unratedOver60 === 0 && unconfirmedCal24 === 0 && approvals4h === 0,
  };
}
