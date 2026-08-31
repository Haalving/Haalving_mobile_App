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
import {
  CHAIN_KINDS,
  DEFAULT_CHAINS,
  FLOW_VERSION,
  ROLES,
  healTicks,
  pillarForRole,
  todayISO,
  type Role,
} from '@haalving/shared';

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

interface DemoWorklistItem {
  id: string;
  text: string;
  ownerId: string;
  due: string;
  pill: string;
  status: string;
  pillar: string | null;
  type: string;
  clientId: string | null;
}

interface DemoApproval {
  id: string;
  type: string;
  clientId: string | null;
  prospect: string | null;
  pillar: string | null;
  title: string;
  ownerId: string;
  status: string;
  stage: number;
  due: string;
  aiDraft: string;
  returnReason: string | null;
  history: Array<{ act: string; byId: string | null; note: string | null; minsAgo: number }>;
}

interface DemoMeal {
  id: string;
  clientId: string;
  slot: string;
  capturedMinsAgo: number;
  fullness: string;
  photo: string | null;
  dishes: string[];
  ai: { stars: number; conf: number; detected: string[]; note: string };
  final: {
    stars: number;
    byId: string | null;
    voiceSec: number;
    note: string;
    rubric: Record<string, string> | null;
  } | null;
  protein: number;
  kcal: number;
}

interface DemoMedical {
  id: string;
  clientId: string | null;
  prospect: string | null;
  title: string;
  kind: string;
  uploadedOn: string;
  status: string;
  signedById: string | null;
  body: { conditions: string[]; flags: string[]; metrics: string[]; history: unknown[] };
}

interface DemoDeviation {
  id: string;
  clientId: string | null;
  kind: string;
  state: string;
  mode: string;
}

/**
 * A post on either canvas. `authorId` is null for the house account, `clientId`
 * for the client it is about — the two are a pair, not a duplicate: the first is
 * who wrote it and the second is whose scope it falls in.
 */
interface DemoCommunityPost {
  id: string;
  authorId: string | null;
  clientId: string | null;
  kind: string;
  caption: string;
  img: string | null;
  secs: number | null;
  quiz: Record<string, unknown> | null;
  minsAgo: number;
  likes: string[];
  comments: Array<{ byId: string | null; clientId: string | null; text: string }>;
}

interface DemoGathering {
  id: string;
  title: string;
  when: string;
  where: string;
  host: string | null;
  spots: string | null;
  desc: string;
  about: string[];
  agenda: Array<{ t: string; v: string }>;
  bring: string[];
  img: string;
}

interface DemoChallenge {
  id: string;
  title: string;
  days: number;
  host: string | null;
  stake: string | null;
  desc: string;
  about: string[];
  how: string[];
  arc: Array<{ k: string; v: string }>;
  img: string;
}

interface DemoGameDay {
  id: string;
  label: string;
  date: string;
  qs: Array<{ q: string; opts: string[]; ans: number; why: string }>;
}

interface DemoZone {
  id: string;
  name: string;
  createdById: string | null;
  memberIds: string[];
  posts: DemoCommunityPost[];
}

interface DemoCommunity {
  /** The community circle, as CLIENT ids — the extractor resolves them once. */
  circle: string[];
  gatherings: DemoGathering[];
  challenges: DemoChallenge[];
  gameDays: DemoGameDay[];
  posts: DemoCommunityPost[];
  zones: DemoZone[];
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
  chains: Record<string, Array<{ role: string }>>;
  flowTemplates: Array<{
    id: string; name: string; desc: string | null; trigger: string; defaultOn: boolean;
    steps: Array<{ after: number | null; on: number | null; at: number; title: string; text: string }>;
  }>;
  clientFlows: Record<string, Record<string, boolean>>;
  tracks: Array<{ k: string; t: string }>;
  catTags: string[];
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
  templates: Array<{
    id: string; pillar: string; level: number; track: string;
    name: string; desc: string; by: string; status: string;
    days: Record<string, { slots: unknown[]; targets?: unknown }>;
  }>;
  circles: Record<
    string,
    Array<{ id: string; fromId: string; kind: string; text: string; minsAgo: number }>
  >;
  digest: DemoDigest[];
  followupDrafts: DemoFollowupDraft[];
  worklist: DemoWorklistItem[];
  approvals: DemoApproval[];
  meals: DemoMeal[];
  medical: DemoMedical[];
  deviations: DemoDeviation[];
  community: DemoCommunity;
  /* `[]` in the demo's opening state — nothing has been sent yet. Carried so the
     day one is seeded there is already somewhere for it to go. */
  broadcasts: unknown[];
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
  /*
   * RESTORING MEANS REMOVING, TOO.
   *
   * A promoted arrival mints a real client, and the arrivals suite cleans its own
   * up by following `Arrival.promotedClientId`. Re-seeding clears that column —
   * which SEVERS the only link back — so a client minted before a re-seed becomes
   * an orphan nothing can find, and the roster quietly grows by one every time.
   * That is how "8 clients" turned up where the demo has seven.
   *
   * So the seed deletes what the demo's story does not contain. It is the same
   * promise the queues and digest sections already make out loud; clients were
   * the one table upserting without it. The login goes with the client — a person
   * row whose client is gone is a sign-in that reaches nothing.
   */
  const keep = demo.clients.map((c) => c.id);
  const strays = await prisma.client.findMany({
    where: { id: { notIn: keep } },
    select: { id: true, name: true, userId: true },
  });
  for (const stray of strays) {
    /* PodSeat, CircleMessage, Meal and the arrival's FK all cascade or null from
       here; the login is a separate row and has to be taken with it */
    await prisma.client.delete({ where: { id: stray.id } }).catch(() => undefined);
    if (stray.userId) {
      await prisma.user.delete({ where: { id: stray.userId } }).catch(() => undefined);
    }
  }
  if (strays.length) {
    console.log(`  cleared     ${strays.length} client(s) not in the demo: ${strays.map((s) => s.name).join(', ')}`);
  }

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

/**
 * Configuration's own tables.
 *
 * The chains carry `template` even though the demo's SEED does not: its view adds
 * it with a default of Ops Head then Super User, because a plan template that
 * published on one signature would let one person change what every future client
 * is given. DEFAULT_CHAINS in shared holds that decision.
 *
 * The three seeded catalog categories are marked `seeded` and can never be deleted
 * or re-keyed — every catalog item, template and client already points at them.
 */
async function seedConfiguration(): Promise<void> {
  for (const kind of CHAIN_KINDS) {
    const steps = (demo.chains[kind] ?? DEFAULT_CHAINS[kind]) as unknown as Prisma.InputJsonValue;
    await prisma.approvalChain.upsert({
      where: { kind: kind as never },
      create: { kind: kind as never, steps },
      update: { steps },
    });
  }

  for (const [i, t] of demo.flowTemplates.entries()) {
    const data = {
      name: t.name,
      desc: t.desc,
      trigger: t.trigger as never,
      defaultOn: t.defaultOn,
      enabled: true,
      position: i,
    };
    await prisma.flowTemplate.upsert({
      where: { id: t.id },
      create: { id: t.id, ...data },
      update: data,
    });
    /* the steps are rewritten rather than merged, so a test that edited one is
       undone by a re-seed */
    await prisma.flowStep.deleteMany({ where: { templateId: t.id } });
    for (const [j, st] of t.steps.entries()) {
      await prisma.flowStep.create({
        data: {
          templateId: t.id,
          after: st.after,
          on: st.on,
          at: st.at,
          title: st.title,
          text: st.text,
          position: j,
        },
      });
    }
  }

  /* the per-client overrides are THIN — only where somebody differed from the
     template's own default */
  await prisma.clientFlow.deleteMany({});
  for (const [clientId, map] of Object.entries(demo.clientFlows)) {
    for (const [templateId, on] of Object.entries(map)) {
      const exists = await prisma.flowTemplate.findUnique({ where: { id: templateId } });
      const client = await prisma.client.findUnique({ where: { id: clientId } });
      if (!exists || !client) continue;
      await prisma.clientFlow.create({ data: { clientId, templateId, on: !!on } });
    }
  }

  for (const [i, t] of demo.tracks.entries()) {
    const data = { name: t.t, seeded: true, position: i };
    await prisma.catalogCategory.upsert({
      where: { key: t.k },
      create: { key: t.k, ...data },
      update: data,
    });
  }

  for (const [i, name] of demo.catTags.entries()) {
    const slug = name.toLowerCase();
    await prisma.catalogTag.upsert({
      where: { slug },
      create: { name, slug, position: i },
      update: { name, position: i },
    });
  }

  /* every existing client walks the shape that is current at seed time */
  const current = await prisma.programShape.findFirst({ orderBy: { version: 'desc' } });
  if (current) {
    await prisma.client.updateMany({
      where: { shapeVersion: null },
      data: { shapeVersion: current.version },
    });
  }

  console.log(
    `  config      ${CHAIN_KINDS.length} chains, ${demo.flowTemplates.length} automations, ` +
      `${demo.tracks.length} categories, ${demo.catTags.length} tags`,
  );
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
  /*
   * RESTORING MEANS REMOVING, the same rule `seedClients` and the templates
   * keep. An item authored through the console — or left behind by an
   * interrupted test — is not part of the demo's story, and leaving it makes the
   * shelf grow by one every time somebody tries the Add button.
   *
   * It is REPORTED rather than removed silently: this deletes somebody's typing,
   * and a line naming what went is the difference between a restore and a
   * disappearance.
   */
  const keep = Object.values(demo.catalog ?? {})
    .flat()
    .map((i) => String((i as { id?: unknown }).id ?? ''))
    .filter(Boolean);
  const strays = await prisma.catalogItem.findMany({
    where: { id: { notIn: keep } },
    select: { id: true, name: true, pillar: true },
  });
  if (strays.length) {
    await prisma.catalogItem.deleteMany({ where: { id: { in: strays.map((x) => x.id) } } });
    console.log(
      `  cleared     ${strays.length} catalog item(s) not in the demo: ` +
        strays.map((x) => `${x.name} (${x.pillar})`).join(', '),
    );
  }

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
  /*
   * The plan templates.
   *
   * RESTORING, like every other content table: anything not in the demo's story
   * is removed, so a template a reviewer created while looking around does not
   * accumulate across re-seeds the way the eighth client did.
   *
   * `days` is stored as the demo shapes it — an object keyed 1..14, each holding
   * `slots` and optionally `targets`. Days a pillar does not run are PRESENT with
   * an empty `slots` rather than absent, which is what lets the card say "6 of 14
   * days written" and mean it: the difference between a rest day and an unwritten
   * one is a distinction the author actually made.
   */
  const templateIds = (demo.templates ?? []).map((t) => t.id);
  await prisma.planTemplate.deleteMany({ where: { id: { notIn: templateIds } } });

  const staffIds = new Set(
    (await prisma.user.findMany({ select: { id: true } })).map((u) => u.id),
  );

  for (const t of demo.templates ?? []) {
    const data = {
      name: t.name,
      pillar: t.pillar,
      level: t.level,
      track: t.track,
      days: t.days as Prisma.InputJsonValue,
      notes: t.desc || null,
      published: t.status === 'published',
      /* the author may not exist as a user row; the column is nullable and the
         card falls back rather than inventing a name */
      createdById: staffIds.has(t.by) ? t.by : null,
    };
    await prisma.planTemplate.upsert({
      where: { id: t.id },
      create: { id: t.id, ...data },
      update: data,
    });
  }

  console.log(`  catalog     ${n} items across ${Object.keys(demo.catalog ?? {}).length} libraries`);
  console.log(
    `  templates   ${(demo.templates ?? []).length} ` +
      `(${(demo.templates ?? []).filter((t) => t.status === 'published').length} published)`,
  );
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

async function seedWorkQueues(): Promise<void> {
  const now = Date.now();
  const ago = (mins: number) => new Date(now - mins * 60_000);

  /*
   * What a previous run's acts posted into the clients' rooms.
   *
   * Both kinds are written by the SERVER and by nothing else — a rating card
   * comes from `queues.service.rateMeal`, a published artifact from the last
   * signature on a chain — so clearing them is clearing our own output, not
   * touching what anybody said. The follow-ups seed draws the same line and
   * explains it at length: what a client actually wrote in that room was never
   * ours to delete.
   */
  const unposted = await prisma.circleMessage.deleteMany({
    where: { kind: { in: ['RATING', 'DOC'] } },
  });

  /* ------------------------------------------------------------- work list */

  const workIds = demo.worklist.map((w) => w.id);
  /* a row a rule generated during a session is not part of the demo's story */
  await prisma.worklistItem.deleteMany({ where: { id: { notIn: workIds } } });

  for (const w of demo.worklist) {
    const data = {
      text: w.text,
      ownerId: w.ownerId,
      due: w.due,
      pill: w.pill,
      status: w.status as never,
      pillar: w.pillar,
      type: w.type as never,
      clientId: w.clientId,
      /* a row somebody ticked off — or that rating a plate auto-cleared — goes
         back to open, which is the whole point of a restoring seed */
      doneAt: null,
      doneById: null,
    };
    await prisma.worklistItem.upsert({
      where: { id: w.id },
      create: { id: w.id, ...data },
      update: data,
    });
  }

  /* ------------------------------------------------------------- approvals */

  /*
   * THE CHAIN SNAPSHOT, taken here exactly as `queues.service.create` takes it:
   * off the chain rows `seedConfiguration` has just written, with the version
   * they are on. NOT copied from demo-seed.json, and the extractor deliberately
   * does not carry one — a snapshot frozen into a committed file would be a
   * record of what the chain WAS when somebody last ran the extractor, which is
   * precisely the stale reading the snapshot exists to prevent.
   */
  const chains = await prisma.approvalChain.findMany();
  const approvalIds = demo.approvals.map((a) => a.id);
  await prisma.approval.deleteMany({ where: { id: { notIn: approvalIds } } });

  for (const a of demo.approvals) {
    const chain = chains.find((c) => (c.kind as string) === a.type);
    if (!chain) throw new Error(`seed: no approval chain for type ${a.type}`);

    /* the trail is the approval's own history, so a re-seed rewrites it rather
       than leaving yesterday's signature explaining a stage that has been reset */
    await prisma.approvalEvent.deleteMany({ where: { approvalId: a.id } });

    const data = {
      type: a.type as never,
      clientId: a.clientId,
      prospect: a.prospect,
      pillar: a.pillar,
      title: a.title,
      ownerId: a.ownerId,
      status: a.status as never,
      stage: a.stage,
      due: a.due,
      aiDraft: a.aiDraft,
      returnReason: a.returnReason,
      chain: chain.steps as Prisma.InputJsonValue,
      chainVersion: chain.version,
    };

    await prisma.approval.upsert({
      where: { id: a.id },
      create: { id: a.id, ...data },
      update: data,
    });

    for (const h of a.history) {
      await prisma.approvalEvent.create({
        data: {
          approvalId: a.id,
          act: h.act as never,
          byId: h.byId,
          note: h.note,
          at: ago(h.minsAgo),
        },
      });
    }
  }

  /* ----------------------------------------------------------------- meals */

  const mealIds = demo.meals.map((m) => m.id);
  await prisma.meal.deleteMany({ where: { id: { notIn: mealIds } } });

  for (const m of demo.meals) {
    const data = {
      clientId: m.clientId,
      slot: m.slot,
      /* THE SLA CLOCK, rebuilt against this run's `now` */
      capturedAt: ago(m.capturedMinsAgo),
      fullness: m.fullness,
      photo: m.photo,
      dishes: m.dishes,
      aiStars: m.ai.stars,
      aiConf: m.ai.conf,
      aiDetected: m.ai.detected,
      aiNote: m.ai.note,
      finalStars: m.final?.stars ?? null,
      /* null with stars set means the AI rated it — two of the demo's plates */
      finalById: m.final?.byId ?? null,
      finalNote: m.final?.note || null,
      finalVoiceSec: m.final ? m.final.voiceSec : null,
      /*
       * NULL EVEN ON A RATED PLATE. The demo records who rated and what they
       * said but never WHEN, and a seed that invented a rating time would be
       * seeding a fact nobody stated — the "median turnaround" the board prints
       * would then be measuring the seed. `rateMeal` sets it for every rating
       * this system actually observes.
       */
      ratedAt: null,
      rubric: m.final?.rubric ? (m.final.rubric as Prisma.InputJsonValue) : Prisma.DbNull,
      protein: m.protein,
      kcal: m.kcal,
    };

    await prisma.meal.upsert({
      where: { id: m.id },
      create: { id: m.id, ...data },
      update: data,
    });
  }

  /* --------------------------------------------------------------- medical */

  const docIds = demo.medical.map((d) => d.id);
  await prisma.medicalSummary.deleteMany({ where: { id: { notIn: docIds } } });

  for (const d of demo.medical) {
    const signed = d.status === 'READY' && d.signedById;
    const data = {
      clientId: d.clientId,
      prospect: d.prospect,
      title: d.title,
      kind: d.kind,
      uploadedOn: d.uploadedOn,
      status: d.status as never,
      byId: signed ? d.signedById : null,
      /*
       * The demo names the signer but not the hour. The two travel together by
       * the column's own contract — a signature nobody can date is not one — so
       * the seed dates them at the run instant rather than leaving half a fact.
       * Nothing reads the interval, and the alternative was inventing a history
       * of when Dr. Kavya sat down with each file.
       */
      signedAt: signed ? new Date(now) : null,
      body: d.body as unknown as Prisma.InputJsonValue,
    };

    await prisma.medicalSummary.upsert({
      where: { id: d.id },
      create: { id: d.id, ...data },
      update: data,
    });
  }

  /* ------------------------------------------------------------ deviations */

  const devIds = demo.deviations.map((d) => d.id);
  await prisma.deviation.deleteMany({ where: { id: { notIn: devIds } } });

  for (const d of demo.deviations) {
    /* the demo names its client in prose and the extractor resolves it; a name
       that stopped resolving is a broken seed, not a row to drop quietly */
    if (!d.clientId) throw new Error(`seed: deviation ${d.id} names no client we know`);
    const data = { clientId: d.clientId, kind: d.kind, state: d.state, mode: d.mode, at: new Date(now) };
    await prisma.deviation.upsert({
      where: { id: d.id },
      create: { id: d.id, ...data },
      update: data,
    });
  }

  const awaiting = demo.meals.filter((m) => !m.final).length;
  const pending = demo.medical.filter((d) => d.status === 'PENDING').length;
  console.log(
    `  queues      ${demo.worklist.length} work items, ${demo.approvals.length} approvals, ` +
      `${demo.meals.length} meals (${awaiting} awaiting), ${demo.medical.length} documents ` +
      `(${pending} unsigned), ${demo.deviations.length} deviations` +
      (unposted.count ? ` — cleared ${unposted.count} posted messages` : ''),
  );
}

/**
 * The commons.
 *
 * RESTORING, and it has two different jobs to do because this module holds two
 * different kinds of row.
 *
 * CONTENT — gatherings, challenges, the Health Games book, the posts and the one
 * zone — is upserted on the demo's own ids, and anything not in the demo's story
 * is removed. That includes a post an admin wrote during a session and the
 * moderation flags they set: `pinned` and `hidden` are written back to false
 * explicitly rather than left, because a pinned post is a decision somebody made
 * on a screen and the demo's opening state has no pin in it.
 *
 * MEMBER STATE is the second job, and it splits:
 *
 *   likes and comments ARE seeded — the demo authors them — so they are restored
 *   to exactly the seeded set, which means clearing first: a like added in a
 *   session is not part of the story, and upserting the seeded ones would leave
 *   it beside them.
 *
 *   enrolments, challenge entries and game answers are NOT seeded, because the
 *   demo's `going`, `joined` and `answered` are booleans belonging to its one
 *   reader (the extractor says so at more length). The demo's opening state is
 *   "nobody has enrolled", so restoring it means emptying those three tables.
 *
 * And ANNOUNCEMENTS are cleared first of all, with their cards. The order is the
 * point, and it is the follow-ups seed's order for the same reason: the messages
 * come out THROUGH the delivery rows, which are the only record of which
 * messages they were — so what a client actually said in their own room is never
 * reached. It was never ours to delete.
 */
async function seedCommunity(): Promise<void> {
  const c = demo.community;
  const now = Date.now();
  const ago = (mins: number) => new Date(now - mins * 60_000);

  /* ------------------------------------------------------- announcements */

  const cards = await prisma.circleMessage.deleteMany({
    where: { broadcastDelivery: { isNot: null } },
  });
  const sends = await prisma.broadcast.deleteMany({});

  /* -------------------------------------------------------- the circle */

  await prisma.communityMember.deleteMany({ where: { clientId: { notIn: c.circle } } });
  for (const clientId of c.circle) {
    await prisma.communityMember.upsert({
      where: { clientId },
      create: { clientId },
      update: {},
    });
  }

  /* ------------------------------------------------------- gatherings */

  const gatheringIds = c.gatherings.map((g) => g.id);
  await prisma.gathering.deleteMany({ where: { id: { notIn: gatheringIds } } });
  /* nobody is going, in the story this seed restores */
  await prisma.gatheringEnrolment.deleteMany({});

  for (const [i, g] of c.gatherings.entries()) {
    const data = {
      title: g.title,
      when: g.when,
      where: g.where,
      host: g.host,
      spots: g.spots,
      desc: g.desc,
      about: g.about,
      agenda: g.agenda as unknown as Prisma.InputJsonValue,
      bring: g.bring,
      img: g.img,
      /* position from the demo's own order, newest first — the same order the
         console unshifts into and the client page reads [0] from */
      position: i,
    };
    await prisma.gathering.upsert({ where: { id: g.id }, create: { id: g.id, ...data }, update: data });
  }

  /* ------------------------------------------------------- challenges */

  const challengeIds = c.challenges.map((x) => x.id);
  await prisma.challenge.deleteMany({ where: { id: { notIn: challengeIds } } });
  await prisma.challengeEntry.deleteMany({});

  for (const [i, x] of c.challenges.entries()) {
    const data = {
      title: x.title,
      days: x.days,
      host: x.host,
      stake: x.stake,
      desc: x.desc,
      about: x.about,
      how: x.how,
      arc: x.arc as unknown as Prisma.InputJsonValue,
      img: x.img,
      position: i,
    };
    await prisma.challenge.upsert({ where: { id: x.id }, create: { id: x.id, ...data }, update: data });
  }

  /* -------------------------------------------------------- game days */

  const dayIds = c.gameDays.map((d) => d.id);
  await prisma.gameDay.deleteMany({ where: { id: { notIn: dayIds } } });
  await prisma.gameAnswer.deleteMany({});

  for (const [i, d] of c.gameDays.entries()) {
    const data = { label: d.label, date: d.date, position: i };
    await prisma.gameDay.upsert({ where: { id: d.id }, create: { id: d.id, ...data }, update: data });

    /* by POSITION, exactly as `community.service.saveGameDayQuestions` writes
       them — so a re-seed keeps each question's id and a reviewer can point at
       one, and the trailing questions of a shortened day are the ones that go */
    for (const [pos, q] of d.qs.entries()) {
      const qData = { prompt: q.q, options: q.opts, answer: q.ans, why: q.why };
      await prisma.gameQuestion.upsert({
        where: { gameDayId_position: { gameDayId: d.id, position: pos } },
        create: { gameDayId: d.id, position: pos, ...qData },
        update: qData,
      });
    }
    await prisma.gameQuestion.deleteMany({
      where: { gameDayId: d.id, position: { gte: d.qs.length } },
    });
  }

  /* ------------------------------------------------------------ zones */

  const zoneIds = c.zones.map((z) => z.id);
  await prisma.zone.deleteMany({ where: { id: { notIn: zoneIds } } });

  for (const [i, z] of c.zones.entries()) {
    const data = { name: z.name, createdById: z.createdById, position: i };
    await prisma.zone.upsert({ where: { id: z.id }, create: { id: z.id, ...data }, update: data });
    await prisma.zoneMember.deleteMany({ where: { zoneId: z.id, clientId: { notIn: z.memberIds } } });
    for (const clientId of z.memberIds) {
      await prisma.zoneMember.upsert({
        where: { zoneId_clientId: { zoneId: z.id, clientId } },
        create: { zoneId: z.id, clientId },
        update: {},
      });
    }
  }

  /* ------------------------------------------------------------ posts */

  const all = [
    ...c.posts.map((p) => ({ post: p, zoneId: null as string | null })),
    ...c.zones.flatMap((z) => z.posts.map((p) => ({ post: p, zoneId: z.id }))),
  ];
  const postIds = all.map((p) => p.post.id);
  await prisma.communityPost.deleteMany({ where: { id: { notIn: postIds } } });

  for (const { post: p, zoneId } of all) {
    const data = {
      zoneId,
      authorId: p.authorId,
      clientId: p.clientId,
      kind: p.kind as never,
      caption: p.caption,
      img: p.img,
      secs: p.secs,
      quiz: p.quiz ? (p.quiz as Prisma.InputJsonValue) : Prisma.DbNull,
      /* MODERATION, written back rather than left: a pin is a decision made on a
         screen, and the demo's opening canvas has none */
      pinned: false,
      hidden: false,
      /* rebuilt against this run's `now`, so a seeded post still reads "3 h ago"
         however long ago this file was written */
      postedAt: ago(p.minsAgo),
    };
    await prisma.communityPost.upsert({
      where: { id: p.id },
      create: { id: p.id, ...data },
      update: data,
    });

    /* likes and comments are restored WHOLE, not merged: the seeded set is the
       story, and a reaction added during a session is not part of it */
    await prisma.postLike.deleteMany({ where: { postId: p.id } });
    for (const clientId of p.likes) {
      await prisma.postLike.create({ data: { postId: p.id, clientId, at: ago(p.minsAgo) } });
    }

    await prisma.postComment.deleteMany({ where: { postId: p.id } });
    for (const cm of p.comments) {
      await prisma.postComment.create({
        data: {
          postId: p.id,
          byId: cm.byId,
          clientId: cm.clientId,
          text: cm.text,
          /*
           * The demo dates the post and never its replies. A comment cannot
           * predate what it is replying to, so the post's own time is the only
           * bound the source actually states — and the column exists to give the
           * thread an ORDER rather than to claim an hour nobody wrote.
           */
          at: ago(p.minsAgo),
        },
      });
    }
  }

  const zonePosts = c.zones.reduce((n, z) => n + z.posts.length, 0);
  console.log(
    `  community   ${c.gatherings.length} gatherings, ${c.challenges.length} challenges, ` +
      `${c.gameDays.length} game days, ${c.posts.length} canvas posts, ` +
      `${c.zones.length} zones (${zonePosts} posts inside), ${c.circle.length} in the circle` +
      (sends.count ? ` — cleared ${sends.count} announcements and ${cards.count} cards` : ''),
  );
}

/**
 * The care-circle threads.
 *
 * ONE TABLE, TWO LANES. `TEAMONLY` is the console's scratch pad and the client
 * never sees it; every other kind is what they read in their own app. The lane
 * is a value on the row rather than a second table, because the two share a
 * room, a sequence and an authorship rule — see `circle.service.thread`.
 *
 * A NULL AUTHOR IS NOT MISSING DATA. The demo writes `fromId: 'client'` for the
 * client's own line and `'ai'` for a copilot line; neither is a staff user, and
 * neither has a `User` row to point at. The schema says so in as many words:
 * read `fromKind` to tell which. Writing a foreign key to a person who does not
 * exist is the alternative, and it is not one.
 *
 * WIPED AND REWRITTEN like the queues, and for the same reason: `minsAgo` is a
 * reading of a moment. Upserting would leave a re-seeded database claiming a
 * lunch was logged fourteen minutes ago three weeks running.
 *
 * `seq` is assigned here in thread order rather than through
 * `circle.service.postMessage`: the service takes an advisory lock per room to
 * serialise concurrent senders, and a seed is a single writer laying down a
 * history that already has an order. Going through the service would be slower
 * and would still produce exactly this.
 */
async function seedCircles(): Promise<void> {
  const now = Date.now();
  const ago = (mins: number) => new Date(now - mins * 60_000);

  const KIND: Record<string, 'TEXT' | 'TEAMONLY' | 'PROMO' | 'WISH' | 'CARD' | 'DOC' | 'RATING' | 'MEAL'> = {
    text: 'TEXT',
    teamonly: 'TEAMONLY',
    promo: 'PROMO',
    wish: 'WISH',
    card: 'CARD',
    doc: 'DOC',
    rating: 'RATING',
    meal: 'MEAL',
  };

  const clientIds = new Set(
    (await prisma.client.findMany({ select: { id: true } })).map((c) => c.id),
  );
  const userIds = new Set((await prisma.user.findMany({ select: { id: true } })).map((u) => u.id));

  /* the seed's own rows only — a follow-up sent while looking around is the
     server's output and is cleared by `seedFollowups`, not by this */
  const seededIds = Object.values(demo.circles ?? {})
    .flat()
    .map((m) => m.id);
  await prisma.circleMessage.deleteMany({ where: { id: { in: seededIds } } });

  let n = 0;
  let teamOnly = 0;

  for (const [clientId, msgs] of Object.entries(demo.circles ?? {})) {
    if (!clientIds.has(clientId)) continue;

    /* start above whatever the room already holds, so a seeded history and a
       message somebody posted before the re-seed cannot collide on (clientId, seq) */
    const top = await prisma.circleMessage.aggregate({
      where: { clientId },
      _max: { seq: true },
    });
    let seq = (top._max.seq ?? 0) + 1;

    /* oldest first, so `seq` runs the way the thread reads */
    const ordered = [...msgs].sort((x, y) => y.minsAgo - x.minsAgo);

    for (const m of ordered) {
      const kind = KIND[m.kind] ?? 'TEXT';
      const staff = userIds.has(m.fromId);
      await prisma.circleMessage.create({
        data: {
          id: m.id,
          clientId,
          fromUserId: staff ? m.fromId : null,
          fromKind: staff ? 'STAFF' : m.fromId === 'ai' ? 'AI' : 'CLIENT',
          kind: kind as never,
          text: m.text,
          seq: seq++,
          createdAt: ago(m.minsAgo),
        },
      });
      n += 1;
      if (kind === 'TEAMONLY') teamOnly += 1;
    }
  }

  console.log(
    `  circles     ${n} messages in ${Object.keys(demo.circles ?? {}).length} rooms ` +
      `(${teamOnly} team-only)`,
  );
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
  await seedConfiguration();
  await seedConfig();
  await seedCatalog();
  await seedMealPlans();
  await seedWorkQueues();
  await seedCircles();
  await seedDigest();
  await seedFollowups();
  await seedCommunity();

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
