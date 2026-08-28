/**
 * What is actually in the database?
 *
 *   node backend/scripts/db-summary.mjs
 *   pnpm --filter @haalving/backend db:summary
 *
 * Read-only. Prints a row count for every table this project owns, then the
 * seeded story in enough detail to recognise it — the cast, the clients and
 * where each stands, who holds which pod seat, and the declared capacities.
 *
 * No credential is printed: the connection string is read from backend/.env and
 * only the database name is echoed.
 */
import { readFileSync } from 'node:fs';

const raw = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const kv = {};
for (const l of raw.split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l);
  if (m) kv[m[1]] = m[2].trim();
}
process.env.DATABASE_URL = kv.DATABASE_URL;
const dbName = new URL(kv.DATABASE_URL).pathname.replace(/^\//, '');

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient({ log: [] });

const pad = (s, n) => String(s).padEnd(n);
const rpad = (s, n) => String(s).padStart(n);

try {
  console.log(`\nDATABASE  ${dbName}\n`);

  /* ---- every table, with a live count ---- */
  const tables = await prisma.$queryRawUnsafe(`
    SELECT c.relname AS name
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname`);

  console.log('TABLES');
  const counts = {};
  for (const t of tables) {
    const [{ n }] = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t.name}"`);
    counts[t.name] = n;
  }
  const width = Math.max(...tables.map((t) => t.name.length));
  for (const t of tables) {
    const n = counts[t.name];
    console.log(`  ${pad(t.name, width + 2)}${rpad(n, 5)}${n === 0 ? '   (empty — its screens are not built yet)' : ''}`);
  }

  /* ---- the cast ---- */
  const staff = await prisma.user.findMany({
    where: { role: { not: 'client' } },
    select: { name: true, role: true, dept: true, level: true, email: true, capacity: true },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  });
  console.log(`\nSTAFF (${staff.length})`);
  for (const u of staff) {
    const cap = u.capacity && u.capacity.declared > 0 ? `${u.capacity.load}/${u.capacity.declared}` : '—';
    const full = u.capacity && u.capacity.declared > 0 && u.capacity.load >= u.capacity.declared ? ' FULL' : '';
    console.log(
      `  ${pad(u.name, 12)} ${pad(u.role, 10)} ${pad(u.dept ?? '—', 10)} L${u.level ?? '?'}  cap ${pad(cap + full, 10)} ${u.email}`,
    );
  }

  /* ---- the clients ---- */
  const clients = await prisma.client.findMany({
    select: {
      name: true, plan: true, cycle: true, cycleDay: true, levels: true, track: true,
      observation: true, status: true, userId: true, humanPillars: true,
      pod: { select: { seat: true, staff: { select: { name: true } } } },
    },
    orderBy: { name: 'asc' },
  });
  console.log(`\nCLIENTS (${clients.length})`);
  for (const c of clients) {
    const L = c.levels;
    const lv = `F${L.fitness} N${L.culture} Y${L.yoga} M${L.wellness}`;
    const where = c.observation ? `obs d${c.cycleDay}` : `cy${c.cycle} d${c.cycleDay}`;
    const login = c.userId ? 'app' : 'no login';
    console.log(
      `  ${pad(c.name, 11)} ${pad(c.plan, 7)} ${pad(where, 9)} ${pad(lv, 16)} ${pad(c.track, 10)} ${pad(c.status, 9)} ${pad(login, 9)} ${c.pod.length} seats`,
    );
  }

  /* ---- who sits where ---- */
  console.log('\nPOD SEATS (who is answerable for whom)');
  const seats = await prisma.podSeat.findMany({
    select: { seat: true, client: { select: { name: true } }, staff: { select: { name: true } } },
    orderBy: [{ clientId: 'asc' }, { seat: 'asc' }],
  });
  const bySeat = {};
  for (const s of seats) (bySeat[s.seat] ??= []).push(s.staff?.name ?? 'AI');
  for (const [seat, holders] of Object.entries(bySeat)) {
    const tally = {};
    for (const h of holders) tally[h] = (tally[h] ?? 0) + 1;
    console.log(`  ${pad(seat, 11)} ${Object.entries(tally).map(([n, c]) => `${n}×${c}`).join('  ')}`);
  }

  /* ---- the rest ---- */
  const roles = await prisma.role.findMany({ select: { key: true, nav: true, perms: true }, orderBy: { key: 'asc' } });
  console.log(`\nROLES (${roles.length}) — nav items / permissions`);
  console.log('  ' + roles.map((r) => `${r.key}:${r.nav.length}/${r.perms.length}`).join('   '));

  const cat = await prisma.catalogItem.groupBy({ by: ['pillar'], _count: { _all: true } });
  console.log('\nCATALOG');
  console.log('  ' + cat.map((c) => `${c.pillar} ${c._count._all}`).join('   '));

  const pipe = await prisma.pipelineCard.findMany({ select: { name: true, stage: true }, orderBy: { name: 'asc' } });
  console.log('\nONBOARDING PIPELINE');
  console.log('  ' + pipe.map((p) => `${p.name} (${p.stage})`).join('   '));

  const shape = await prisma.programShape.findUnique({ where: { id: 'default' } });
  if (shape) {
    console.log('\nPROGRAMME SHAPE');
    console.log(
      `  ${shape.levels} levels x ${shape.cycleDays} days · review d${shape.reviewDay} · meeting d${shape.meetingDay} · rest d${shape.restDays.join(',')} · term ${shape.termDays}d`,
    );
  }

  const sla = await prisma.slaConfig.findUnique({ where: { id: 'default' } });
  if (sla) {
    console.log('\nSLA LADDER');
    console.log(
      `  reply target ${sla.replyTargetMin}min · notify after ${sla.notifyAfterMin} · escalate after a further ${sla.escalateAfterMin} to ${sla.escalateToRole}`,
    );
  }

  const audit = await prisma.auditLog.groupBy({ by: ['action'], _count: { _all: true } });
  if (audit.length) {
    console.log('\nAUDIT LOG');
    console.log('  ' + audit.map((a) => `${a.action} ${a._count._all}`).join('   '));
  }
  console.log('');
} finally {
  await prisma.$disconnect().catch(() => {});
}
