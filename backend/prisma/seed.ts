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

import { PrismaClient, type Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { ROLES, type Role } from '@haalving/shared';

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
  pipeline: Array<{ id: string; name: string; step: string; ticks: Record<string, boolean>; note: string; plan: string }>;
  slaConfig: { replyTargetMin: number; notifyAfterMin: number; escalateAfterMin: number; escalateToRole: string };
  notifRules: Array<Record<string, unknown>>;
  mealPlans: Record<string, unknown>;
  catalog: Record<string, Array<Record<string, unknown>>>;
  program: Record<string, unknown>;
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

/** The demo's pipeline steps, as the enum. */
const STAGE: Record<string, string> = {
  records: 'records',
  assessprep: 'assessprep',
  assessafter: 'assessafter',
  obs4: 'obs4',
  calafter: 'calafter',
};

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
    for (const [seat, staffId] of Object.entries(c.pod ?? {})) {
      if (!staffId || staffId === 'u-ai') continue;
      await prisma.podSeat.upsert({
        where: { clientId_seat: { clientId: c.id, seat: seat as never } },
        create: { clientId: c.id, seat: seat as never, staffId },
        update: { staffId },
      });
    }
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

async function seedPipeline(): Promise<void> {
  const owner = await prisma.user.findFirst({ where: { role: 'admin' }, select: { id: true } });

  for (const card of demo.pipeline) {
    const data = {
      name: card.name,
      stage: (STAGE[card.step] ?? 'records') as never,
      ticks: card.ticks as Prisma.InputJsonValue,
      note: card.note,
      plan: (card.plan === 'svayam' ? 'SVAYAM' : 'POORNA') as never,
      ownerId: owner?.id ?? null,
    };
    await prisma.pipelineCard.upsert({
      where: { id: card.id },
      create: { id: card.id, ...data },
      update: data,
    });
  }
  console.log(`  pipeline    ${demo.pipeline.length} cards`);
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
  await seedPipeline();
  await seedConfig();
  await seedCatalog();
  await seedMealPlans();

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
