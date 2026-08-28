/**
 * The seed — the demo's starting story, in Postgres.
 *
 * It reads `demo-seed.json`, which `extract-demo-seed.mjs` produced by RUNNING
 * the demo's own data.js in a stub DOM. Nothing here is transcribed by hand, so
 * a reviewer who knows the demo recognises the console immediately: Rajesh
 * mid-cycle on day 6, Meena silent for three days, Priya still in her observation
 * window, Vikram reading 50/50 FULL.
 *
 * Idempotent: every write is an upsert on a stable id, so re-running it converges
 * rather than duplicating.
 *
 *   pnpm db:seed
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Prisma, PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { FLOW_VERSION, ROLES, healTicks, pillarForRole, todayISO, type Role } from '@haalving/shared';

import { startOfDay } from '../src/utils/dates.js';

const prisma = new PrismaClient();
const here = dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ types */

interface DemoUser {
  id: string;
  role: string;
  name: string;
  subtitle?: string;
  level?: number;
  doj?: string;
  dept?: string | null;
  tzo?: number;
  tzLabel?: string;
  emergency?: { name: string; phone: string };
  memo?: string;
  cv?: string | null;
  tags?: string[];
  avail?: Record<string, unknown>;
}

interface DemoClient {
  id: string;
  userId: string | null;
  name: string;
  code?: string;
  designation?: string;
  sex: string;
  dob?: string;
  heightCm?: number;
  weightKg?: number;
  health?: string[];
  gender?: string;
  address?: string;
  location?: string;
  email?: string;
  mobile?: string;
  plan: string;
  tier?: string;
  humanPillars?: string[];
  cycle: number;
  day: number;
  levels: Record<string, number>;
  track?: string;
  observation?: boolean;
  status?: string;
  statusWhy?: string;
  joinedISO?: string;
  term?: { days?: number; startISO?: string };
  goal?: string;
  purpose?: string;
  tzo?: number;
  tzLabel?: string;
  pod?: Record<string, string>;
  risk?: string | null;
  riskWhy?: string | null;
  anniv?: string | null;
  compliance?: number | null;
  lastCycleIndex?: Record<string, number> | null;
  sessions?: Record<string, { done: number; target: number; cancelled?: number }> | null;
}

interface DemoDigest {
  clientId: string;
  flag?: string | null;
  text: string;
  evidence?: string | null;
}

interface DemoFollowupDraft {
  id: string;
  clientId: string;
  text: string;
  status: string;
}

interface DemoSeed {
  seedVersion: number;
  programShape: {
    levels: number;
    cycleDays: number;
    reviewDay: number;
    restDays: number[];
    meetingDay: number;
    termDays: number;
    sessions: Record<string, number>;
  };
  users: DemoUser[];
  clients: DemoClient[];
  capacity: Array<{ staffId: string; roleLabel: string; load: number; cap: number; full?: boolean }>;
  teamFeed: Array<{ id: string; byId: string; tag: string; text: string; minsAgo: number }>;
  leaves: Array<{
    id: string;
    staffId: string;
    fromDay: number;
    toDay: number;
    reason: string;
    status: string;
    reallocations: Array<{ clientId: string; seatKey: string; toId: string }>;
    history: Array<{ act: string; byId: string; minsAgo: number }>;
  }>;
  leaveConfig: { approverRole: string };
  pipeline: Array<{ id: string; name: string; step: string; ticks: Record<string, boolean>; note: string; plan: string; mins?: number }>;
  tasks: Array<{
    id: string;
    title: string;
    kind: string;
    clientId: string | null;
    day: number;
    start: number;
    dur: number;
    recur: { freq: string; until?: number | null } | null;
    assignees: string[];
    groups: string[];
    link: string | null;
    notes: string | null;
    allowOverlap: boolean;
  }>;
  slaConfig: { replyTargetMin: number; notifyAfterMin: number; escalateAfterMin: number; escalateToRole: string };
  notifRules: Array<Record<string, unknown>>;
  mealPlans: Record<string, unknown>;
  catalog: Record<string, Array<Record<string, unknown>>>;
  program: Record<string, unknown>;
  digest: DemoDigest[];
  followupDrafts: DemoFollowupDraft[];
}

const demo = JSON.parse(readFileSync(join(here, 'demo-seed.json'), 'utf8')) as DemoSeed;

/* ----------------------------------------------------------------- logins */

/**
 * Development credentials.
 *
 * The password is the same for every staff account ON PURPOSE — this is a demo
 * reviewer's login, and eleven different passwords would be eleven things to
 * paste. It is also why `env.ts` refuses to boot production with a `change-me`
 * secret: the two facts belong together.
 */
const STAFF_PASSWORD = 'Haalving@123';

/**
 * `u-anita` -> anita@haalving.dev.
 *
 * The id suffix, not the first name: two people are called Suresh (a staff member
 * and a client), and "Dr. Kavya" would give `dr@haalving.dev`. The suffix is the
 * one handle that is already unique and already readable.
 */
function staffEmail(id: string): string {
  return `${id.replace(/^u-/, '')}@haalving.dev`;
}

/** E.164, so one number cannot become two accounts by being spaced differently. */
function normalisePhone(raw: string | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[\s()-]/g, '');
  return digits.startsWith('+91') ? digits : `+91${digits.replace(/^\+?91/, '')}`;
}

function isoToDate(iso: string | undefined | null): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/* ---------------------------------------------------------------- helpers */

/* ------------------------------------------------------------------- seed */

async function seedRoles(): Promise<void> {
  const keys = Object.keys(ROLES) as Role[];
  for (const key of keys) {
    const def = ROLES[key];
    const data = {
      title: def.title,
      shell: def.shell,
      home: def.home,
      nav: 'nav' in def && def.nav ? [...def.nav] : [],
      perms: 'perms' in def && def.perms ? [...def.perms] : [],
    };
    await prisma.role.upsert({ where: { key }, create: { key, ...data }, update: data });
  }
  console.log(`  roles       ${keys.length} (from @haalving/shared, verbatim)`);
}

async function seedProgramShape(): Promise<void> {
  const s = demo.programShape;
  const data = {
    levels: s.levels,
    cycleDays: s.cycleDays,
    reviewDay: s.reviewDay,
    meetingDay: s.meetingDay,
    restDays: s.restDays,
    termDays: s.termDays,
    sessions: s.sessions as Prisma.InputJsonValue,
  };
  await prisma.programShape.upsert({ where: { id: 'default' }, create: { id: 'default', ...data }, update: data });
  console.log(`  shape       ${s.levels} levels x ${s.cycleDays} days, review ${s.reviewDay}, meeting ${s.meetingDay}`);
}

async function seedUsers(): Promise<Map<string, string>> {
  const passwordHash = await bcrypt.hash(STAFF_PASSWORD, 12);
  const ids = new Map<string, string>();

  /* clients first: a client User is created here, and the Client record below
     points at it. Doing it the other way round would need a second pass. */
  const clientPhone = new Map<string, string>();
  for (const c of demo.clients) {
    if (c.userId && c.mobile) clientPhone.set(c.userId, c.mobile);
  }

  for (const u of demo.users) {
    const isClient = u.role === 'client';
    const phone = isClient ? normalisePhone(clientPhone.get(u.id)) : null;

    const data = {
      name: u.name,
      role: u.role as never,
      email: isClient ? null : staffEmail(u.id),
      phone,
      /* a client has no password — the OTP door is the only one they use */
      passwordHash: isClient ? null : passwordHash,
      subtitle: u.memo ?? u.subtitle ?? null,
      dept: (u.dept ?? null) as never,
      level: u.level ?? null,
      joinedAt: isoToDate(u.doj),
      avail: (u.avail ?? {}) as Prisma.InputJsonValue,
      tz: 'Asia/Kolkata',
      tzo: u.tzo ?? 5.5,
      tzLabel: u.tzLabel ?? 'IST',
      emergency: (u.emergency ?? undefined) as Prisma.InputJsonValue | undefined,
      tags: u.tags ?? [],
      cv: u.cv ?? null,
      status: 'active' as const,
    };

    /* the demo's own id is kept as the primary key. Every seeded relationship
       names it, and a reviewer comparing the two systems can match rows by eye. */
    const row = await prisma.user.upsert({
      where: { id: u.id },
      create: { id: u.id, ...data },
      update: data,
    });
    ids.set(u.id, row.id);
  }

  const staff = demo.users.filter((u) => u.role !== 'client').length;
  console.log(`  users       ${demo.users.length} (${staff} staff, ${demo.users.length - staff} client logins)`);
  return ids;
}

async function seedClients(): Promise<void> {
  for (const c of demo.clients) {
    const term = c.term ?? {};
    const data = {
      userId: c.userId,
      name: c.name,
      code: c.code ?? null,
      designation: c.designation ?? null,
      sex: c.sex as never,
      dob: isoToDate(c.dob),
      heightCm: c.heightCm ?? null,
      weightKg: c.weightKg ?? null,
      health: c.health ?? [],
      gender: c.gender ?? null,
      address: c.address ?? null,
      location: c.location ?? null,
      email: c.email ?? null,
      phone: normalisePhone(c.mobile),
      plan: (c.plan === 'svayam' ? 'SVAYAM' : 'POORNA') as never,
      humanPillars: c.humanPillars ?? [],
      tier: c.tier ?? null,
      cycle: c.cycle,
      cycleDay: c.day,
      levels: c.levels as Prisma.InputJsonValue,
      track: (c.track ?? 'sedentary') as never,
      observation: !!c.observation,
      status: (c.status ?? 'active') as never,
      statusWhy: c.statusWhy || null,
      termDays: term.days ?? 90,
      termStart: isoToDate(term.startISO ?? c.joinedISO),
      goal: c.goal ?? null,
      purpose: c.purpose ?? null,
      tzo: c.tzo ?? 5.5,
      tzLabel: c.tzLabel ?? 'IST',
      onboardedAt: isoToDate(c.joinedISO),

      /* the roster cards' own fields */
      anniv: isoToDate(c.anniv),
      risk: (c.risk ?? null) as never,
      riskWhy: c.riskWhy ?? null,
      /* `?? null`, never `?? 0` — a client still in their observation window has
         nothing to comply with, and 0% would read as total non-compliance */
      compliance: c.compliance ?? null,
      lastCycleIndex: (c.lastCycleIndex ?? undefined) as Prisma.InputJsonValue | undefined,
      sessions: (c.sessions ?? undefined) as Prisma.InputJsonValue | undefined,
    };

    await prisma.client.upsert({
      where: { id: c.id },
      create: { id: c.id, ...data },
      update: data,
    });

    /**
     * Pod seats.
     *
     * Only the seats the demo actually fills are written. An ABSENT seat is not a
     * gap to be filled with a placeholder — it means the AI holds it, which is
     * the ordinary state for an unbought pillar on a Svayam plan. Ananya has no
     * seats at all and that is her story: AI end to end.
     */
    const seats = Object.entries(c.pod ?? {}).filter(([, id]) => id && id !== 'u-ai');

    for (const [seat, staffId] of seats) {
      await prisma.podSeat.upsert({
        where: { clientId_seat: { clientId: c.id, seat: seat as never } },
        create: { clientId: c.id, seat: seat as never, staffId },
        update: { staffId },
      });
    }

    /* Seats the demo does NOT name are removed, not left alone.
     *
     * Upserting only what the story fills makes the seed converge but not
     * RESTORE: a seat somebody assigned (or handed back to the AI, which writes
     * a row with a null staff) would survive every re-run, and Ananya — whose
     * story is an empty pod, AI end to end — would quietly stop being that. The
     * seed's whole job is that a reviewer recognises the console. */
    await prisma.podSeat.deleteMany({
      where: { clientId: c.id, seat: { notIn: seats.map(([seat]) => seat as never) } },
    });
  }

  const seats = await prisma.podSeat.count();
  console.log(`  clients     ${demo.clients.length}, with ${seats} pod seats filled`);
}

/**
 * Capacity.
 *
 * DECLARED, NEVER DERIVED. The demo's numbers are carried across as written —
 * Vikram reads 50 of 50 and FULL while carrying six clients in the database, and
 * that is correct rather than a bug to be tidied: what fills up is his WEEK.
 * Deriving `load` from a count of pod seats here would quietly make that story
 * impossible to tell.
 */
async function seedCapacity(): Promise<void> {
  for (const row of demo.capacity) {
    const data = { declared: row.cap, load: row.load, note: row.roleLabel };
    await prisma.capacity.upsert({
      where: { staffId: row.staffId },
      create: { staffId: row.staffId, ...data },
      update: data,
    });
  }

  /* every other active staff member gets a row at zero, so the allocation picker
     never meets a missing record and read it as "unlimited" */
  const staff = await prisma.user.findMany({
    where: { role: { not: 'client' }, capacity: { is: null } },
    select: { id: true },
  });
  for (const s of staff) {
    await prisma.capacity.create({ data: { staffId: s.id, declared: 0, load: 0 } });
  }

  console.log(`  capacity    ${demo.capacity.length} declared, ${staff.length} more at zero`);
}

/**
 * The five arrivals, spread across the four phases so the board shows the whole
 * process at once.
 *
 * `arrivedAt` is computed HERE from the demo's `mins`, not frozen into
 * demo-seed.json at extraction time. The header reads "here 5 h" off this
 * timestamp, and a value baked into a committed file would be five hours old only
 * on the day it was written — Kiran would read "here 3 weeks" by the time anybody
 * looked. The demo means "five hours before now", so the seed computes it at run
 * time and the story stays true on every re-seed.
 *
 * The ticks are HEALED on the way in, with the same `healTicks` the service uses.
 * The demo records ticks only for the step somebody is standing on and treats
 * everything behind it as complete BY POSITION; the port needs the invariant to
 * be real in the data, because "passed" and "passed, then an edit re-opened it"
 * are different facts and only the ticks can tell them apart.
 *
 * RESTORING, not merely idempotent: re-running the seed puts a promoted or
 * half-corrected arrival back exactly where the demo starts it, which is what
 * makes the verification steps repeatable.
 */
async function seedArrivals(): Promise<void> {
  const now = Date.now();

  for (const card of demo.pipeline) {
    const { ticks, seen } = healTicks(card.step, (card.ticks ?? {}) as Record<string, boolean>);

    const data = {
      name: card.name,
      plan: (card.plan === 'svayam' ? 'SVAYAM' : 'POORNA') as never,
      source: 'SALES' as never,
      note: card.note,
      arrivedAt: new Date(now - (card.mins ?? 0) * 60_000),
      step: card.step,
      ticks: ticks as Prisma.InputJsonValue,
      healed: seen as Prisma.InputJsonValue,
      flowVersion: FLOW_VERSION,
      /* the demo seeds nobody mid-allocation: every arrival starts with its
         seats, InBody and welcome unset, and the flow is what fills them */
      podSeats: {} as Prisma.InputJsonValue,
      inbody: Prisma.DbNull,
      welcomedAt: null,
      welcomeText: null,
      status: 'ACTIVE' as never,
      promotedClientId: null,
    };

    /* the events are the arrival's own history, so a re-seed clears them rather
       than leaving yesterday's ticks explaining a record that has been reset */
    await prisma.arrivalEvent.deleteMany({ where: { arrivalId: card.id } });

    await prisma.arrival.upsert({
      where: { id: card.id },
      create: { id: card.id, ...data },
      update: data,
    });
  }

  console.log(`  arrivals    ${demo.pipeline.length} on the flow`);
}

/**
 * The team's week.
 *
 * `day` is an OFFSET in the demo — 0 is today, -5 is last Tuesday — because a
 * browser store reseeded on every load can afford that. Here it becomes a real
 * date relative to the seed run, so the seeded week is always the CURRENT week
 * however long ago the JSON was written. `recur.until` is an offset too and moves
 * with it, or a series would end before it began.
 *
 * A session's PILLAR is derived from the coach's role rather than stored in the
 * demo: it is the one place a pillar colour appears on the grid, and deriving it
 * means a coach who changes bench takes the colour with them.
 */
async function seedTasks(): Promise<void> {
  const today = startOfDay(todayISO());
  const dayOf = (offset: number) => new Date(today.getTime() + offset * 86_400_000);

  const KIND: Record<string, string> = {
    session: 'SESSION',
    meeting: 'MEETING',
    internal: 'INTERNAL',
    duty: 'DUTY',
  };
  const FREQ: Record<string, string> = {
    daily: 'DAILY',
    alt: 'ALT',
    weekly: 'WEEKLY',
  };

  const staff = await prisma.user.findMany({ select: { id: true, role: true } });
  const roleOf = new Map(staff.map((u) => [u.id, u.role as string]));
  const creator = await prisma.user.findFirst({ where: { role: 'admin' }, select: { id: true } });

  for (const t of demo.tasks) {
    const firstCoach = t.assignees[0];
    const pillar =
      t.kind === 'session' && firstCoach ? (pillarForRole(roleOf.get(firstCoach) ?? '') ?? null) : null;

    const data = {
      title: t.title,
      kind: (KIND[t.kind] ?? 'INTERNAL') as never,
      clientId: t.clientId,
      pillar,
      date: dayOf(t.day),
      startMin: t.start,
      durMin: t.dur,
      recurFreq: (t.recur ? (FREQ[t.recur.freq] ?? 'NONE') : 'NONE') as never,
      recurUntil: t.recur && t.recur.until != null ? dayOf(t.recur.until) : null,
      assigneeIds: t.assignees,
      groupIds: t.groups,
      link: t.link,
      notes: t.notes,
      allowOverlap: t.allowOverlap,
      createdById: creator?.id ?? null,
    };

    /* restoring, like the rest of this file: a task a test moved or an exception
       a test wrote goes back to the demo's week */
    await prisma.taskException.deleteMany({ where: { taskId: t.id } });
    await prisma.taskDone.deleteMany({ where: { taskId: t.id } });
    await prisma.taskResponse.deleteMany({ where: { taskId: t.id } });
    await prisma.taskProposal.deleteMany({ where: { taskId: t.id } });

    await prisma.task.upsert({
      where: { id: t.id },
      create: { id: t.id, ...data },
      update: data,
    });
  }

  const duties = demo.tasks.filter((t) => t.kind === 'duty' && t.recur?.freq === 'daily').length;
  console.log(`  schedule    ${demo.tasks.length} tasks (${duties} standing duties)`);
}

/**
 * The two announcements the console opens with.
 *
 * `minsAgo` becomes a timestamp at RUN time for the same reason the arrivals'
 * `mins` does: the feed renders "3 h ago" off it, and a value frozen into the
 * committed JSON would read "3 months ago" by the time anybody looked.
 *
 * Read marks are NOT seeded. Every post has to be new to somebody on a fresh
 * database, or the New pills and the tab badge would open at zero and there would
 * be nothing to demonstrate.
 */
async function seedTeamFeed(): Promise<void> {
  const now = Date.now();
  for (const post of demo.teamFeed) {
    const data = {
      byId: post.byId,
      tag: post.tag.toUpperCase() as never,
      text: post.text,
      createdAt: new Date(now - post.minsAgo * 60_000),
    };
    await prisma.teamPost.upsert({
      where: { id: post.id },
      create: { id: post.id, ...data },
      update: data,
    });
  }
  await prisma.teamFeedRead.deleteMany({});
  console.log(`  team feed   ${demo.teamFeed.length} posts, unread by everyone`);
}

/**
 * Leave, and the covers an approved one has already written.
 *
 * `fromDay`/`toDay` are offsets so Sneha's cover is LIVE TODAY whenever the seed
 * runs — a frozen date would put the demo's boot state in the past within a day,
 * and "Divya covers Sneha" is the one row that proves the cover-aware resolver
 * works at all.
 *
 * The PodCover rows are written HERE rather than left to the approve path,
 * because the demo ships them already approved: `data.js` says so in as many
 * words ("writes podCover onto each reallocated client ... so temporary access is
 * live at boot").
 */
async function seedLeave(): Promise<void> {
  const today = startOfDay(todayISO());
  const dayOf = (offset: number) => new Date(today.getTime() + offset * 86_400_000);
  const now = Date.now();

  await prisma.leaveConfig.upsert({
    where: { id: 'default' },
    create: { id: 'default', approverRole: demo.leaveConfig.approverRole },
    update: { approverRole: demo.leaveConfig.approverRole },
  });

  for (const lv of demo.leaves) {
    /* restoring, like the rest of this file: the children are rewritten from the
       demo rather than merged, so a test that planned a cover is undone */
    await prisma.leaveEvent.deleteMany({ where: { leaveId: lv.id } });
    await prisma.leaveReallocation.deleteMany({ where: { leaveId: lv.id } });
    await prisma.leaveSessionCover.deleteMany({ where: { leaveId: lv.id } });
    await prisma.leaveCoverResponse.deleteMany({ where: { leaveId: lv.id } });
    await prisma.podCover.deleteMany({ where: { leaveId: lv.id } });

    const data = {
      staffId: lv.staffId,
      from: dayOf(lv.fromDay),
      to: dayOf(lv.toDay),
      reason: lv.reason,
      status: lv.status as never,
      declineReason: null,
    };
    await prisma.leave.upsert({
      where: { id: lv.id },
      create: { id: lv.id, ...data },
      update: data,
    });

    for (const r of lv.reallocations) {
      await prisma.leaveReallocation.create({
        data: { leaveId: lv.id, clientId: r.clientId, seatKey: r.seatKey, toId: r.toId },
      });
      /* an APPROVED leave has already handed the seat over */
      if (lv.status === 'APPROVED') {
        await prisma.podCover.create({
          data: {
            clientId: r.clientId,
            seatKey: r.seatKey,
            coverId: r.toId,
            from: dayOf(lv.fromDay),
            to: dayOf(lv.toDay),
            leaveId: lv.id,
          },
        });
      }
    }

    for (const h of lv.history) {
      await prisma.leaveEvent.create({
        data: {
          leaveId: lv.id,
          act: h.act as never,
          byId: h.byId,
          at: new Date(now - h.minsAgo * 60_000),
        },
      });
    }
  }

  const covers = await prisma.podCover.count();
  console.log(`  leave       ${demo.leaves.length} applications, ${covers} covers live`);
}

async function seedConfig(): Promise<void> {
  const sla = demo.slaConfig;
  await prisma.slaConfig.upsert({
    where: { id: 'default' },
    create: { id: 'default', ...sla },
    update: sla,
  });

  for (const rule of demo.notifRules) {
    const id = String(rule.id ?? '');
    if (!id) continue;
    const data = {
      title: String(rule.title ?? rule.rule ?? id),
      detail: rule.detail ? String(rule.detail) : null,
      enabled: rule.enabled !== false,
      body: rule as Prisma.InputJsonValue,
    };
    await prisma.notifRule.upsert({ where: { id }, create: { id, ...data }, update: data });
  }
  console.log(`  config      SLA ladder + ${demo.notifRules.length} notification rules`);
}

/**
 * The five libraries. `motivation` is a template KIND and a library — still not a
 * fifth pillar; HV.PILLARS stays at four.
 */
async function seedCatalog(): Promise<void> {
  let n = 0;
  for (const [pillar, items] of Object.entries(demo.catalog ?? {})) {
    for (const item of items) {
      const id = String(item.id ?? '');
      if (!id) continue;
      const data = {
        pillar,
        kind: String(item.kind ?? pillar),
        name: String(item.name ?? id),
        body: item as Prisma.InputJsonValue,
        track: item.track ? String(item.track) : null,
        level: typeof item.level === 'number' ? item.level : null,
        archived: false,
      };
      await prisma.catalogItem.upsert({ where: { id }, create: { id, ...data }, update: data });
      n += 1;
    }
  }
  console.log(`  catalog     ${n} items across ${Object.keys(demo.catalog ?? {}).length} libraries`);
}

/**
 * The morning digest.
 *
 * Wiped and rewritten for TODAY rather than upserted across days: the digest is
 * a dated reading, and regenerating it is what the real one does every morning.
 * Only today's rows are touched, so a history — once there is one — survives a
 * re-seed.
 */
async function seedDigest(): Promise<void> {
  const today = startOfDay(todayISO());

  await prisma.digestEntry.deleteMany({ where: { date: today } });

  let n = 0;
  for (const [i, d] of (demo.digest ?? []).entries()) {
    const exists = await prisma.client.findUnique({ where: { id: d.clientId }, select: { id: true } });
    if (!exists) continue;

    await prisma.digestEntry.create({
      data: {
        date: today,
        clientId: d.clientId,
        /* null is a real value — "no action needed" is still a line worth
           printing, and the demo prints it */
        flag: d.flag ? (d.flag === 'high' ? 'HIGH' : 'MED') : null,
        text: d.text,
        /* the demo carries one string joined by ' · '; stored split, because it
           IS a list — the row prints it joined and a later evidence viewer will
           want the parts */
        evidence: d.evidence ? d.evidence.split(' · ').map((x) => x.trim()).filter(Boolean) : [],
        /* seed order. The tab sorts by flag first and this second, so lines of
           equal loudness keep the order they were written in. */
        position: i,
      },
    });
    n += 1;
  }

  const flagged = (demo.digest ?? []).filter((d) => d.flag).length;
  console.log(`  digest      ${n} lines for today (${flagged} flagged)`);
}

/**
 * The copilot's opening follow-ups.
 *
 * RESTORING, and more insistently so than anything else in this file. A draft is
 * the one seeded row a reviewer SPENDS: sending it writes a message into the
 * client's Care Circle, dismissing it writes a dismissal, and neither is undone
 * by writing the text back. Upserting the words alone would converge on the
 * right three cards attached to the wrong story — a draft reading DRAFT while a
 * dismissal still explains why it was refused, or while pointing at a line
 * already sitting in Rajesh's room.
 *
 * So the previous run's consequences come out first, and the order is the point:
 *
 *   1. the dismissals, which would otherwise justify the refusal of a draft that
 *      is live again;
 *   2. the messages those drafts became — BEFORE the upsert clears
 *      `circleMessageId`, which is the only record of which ones they were.
 *      `onDelete: SetNull` unhooks the draft as they go, and the filter reaches
 *      them THROUGH the draft, so what a client actually said in that room is
 *      untouched: it was never ours to delete.
 *
 * The room's per-client `seq` simply carries on from wherever it had reached.
 * Holes in it are expected — it is an address, not a count.
 */
async function seedFollowups(): Promise<void> {
  const drafts = demo.followupDrafts ?? [];
  const ids = drafts.map((d) => d.id);

  const dismissals = await prisma.followupDismissal.deleteMany({ where: { draftId: { in: ids } } });
  const sent = await prisma.circleMessage.deleteMany({ where: { followupDraft: { is: { id: { in: ids } } } } });

  let n = 0;
  for (const d of drafts) {
    const exists = await prisma.client.findUnique({ where: { id: d.clientId }, select: { id: true } });
    if (!exists) continue;

    const data = {
      clientId: d.clientId,
      text: d.text,
      /* the same string on purpose: nothing has been edited yet, and
         `originalText` is what a later edit will be read against */
      originalText: d.text,
      /* all three open as `draft` (data.js:1769) and this is the state a re-seed
         restores TO, so it is written rather than mapped from the row. Were the
         demo ever to start one mid-flight, the extractor already carries its
         status and the mapping belongs here. */
      status: 'DRAFT' as const,
      /* the copilot wrote these, so there is no author — which is the whole
         reason a human sits in front of them */
      source: 'AI' as const,
      createdById: null,
      /* every lifecycle column, not just the ones today's screens write: a
         column left out here is one that survives the re-seed, and a draft
         carrying last run's approver is exactly the kind of ghost this
         function exists to clear */
      editedById: null,
      editedAt: null,
      approvedById: null,
      approvedAt: null,
      returnNote: null,
      sentById: null,
      sentAt: null,
      circleMessageId: null,
    };

    /* the demo's own id (fd1..fd3), like every other seeded row, so the three
       cards keep their identity across re-seeds and a reviewer can point at one */
    await prisma.followupDraft.upsert({
      where: { id: d.id },
      create: { id: d.id, ...data },
      update: data,
    });
    n += 1;
  }

  console.log(`  follow-ups  ${n} AI drafts (cleared ${dismissals.count} dismissals, ${sent.count} sent messages)`);
}

async function seedMealPlans(): Promise<void> {
  const entries = Object.entries(demo.mealPlans ?? {});
  for (const [clientId, body] of entries) {
    const exists = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!exists) continue;
    const plan = body as { title?: string };
    const data = { title: plan.title ?? null, body: body as Prisma.InputJsonValue };
    await prisma.mealPlan.upsert({
      where: { clientId },
      create: { clientId, ...data },
      update: data,
    });
  }
  console.log(`  meal plans  ${entries.length}`);
}

async function main(): Promise<void> {
  console.log(`\nSeeding HAALVING from the demo's own story (seed v${demo.seedVersion})\n`);

  await seedRoles();
  await seedProgramShape();
  await seedUsers();
  await seedClients();
  await seedCapacity();
  await seedArrivals();
  await seedTasks();
  await seedTeamFeed();
  await seedLeave();
  await seedConfig();
  await seedCatalog();
  await seedMealPlans();
  await seedDigest();
  await seedFollowups();

  const clientLogins = demo.clients.filter((c) => c.userId && c.mobile);

  console.log('\nLogins');
  console.log('  staff     <id>@haalving.dev / ' + STAFF_PASSWORD);
  console.log('            e.g. anita@haalving.dev (Super Admin), vikram@haalving.dev (Fitness Coach)');
  console.log('  clients   phone + OTP; the code prints in the API terminal');
  for (const c of clientLogins) {
    console.log(`            ${normalisePhone(c.mobile)}  ${c.name}`);
  }
  console.log('');
}

main()
  .catch((err: Error) => {
    console.error('\nSeed failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
