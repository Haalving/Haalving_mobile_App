/**
 * Extract the demo's starting story as JSON.
 *
 * The demo builds `HV.seed` at parse time inside an IIFE, and it is ~3,000 lines
 * of hand-authored narrative. Transcribing that by hand into a Prisma seed would
 * introduce differences nobody would notice until a reviewer said "that is not
 * the story I remember" — so we run the real file instead, in a stub DOM, and
 * dump what it actually produces.
 *
 * Run:  node backend/prisma/extract-demo-seed.mjs
 * Out:  backend/prisma/demo-seed.json
 *
 * This is a BUILD-TIME tool, not a runtime dependency. It is re-run only when the
 * demo's seed changes; the committed JSON is what `seed.ts` reads.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const demo = join(here, '..', '..', 'demo', 'app', 'js');

/**
 * The smallest DOM core.js needs to finish parsing. It reaches for one meta tag
 * (the theme-color repaint), the three overlay roots and matchMedia; nothing here
 * runs a view, so nothing else is touched.
 */
function stubElement() {
  const el = {
    innerHTML: '',
    style: { setProperty() {}, removeProperty() {} },
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    dataset: {},
    setAttribute() {},
    getAttribute: () => null,
    removeAttribute() {},
    appendChild() {},
    removeChild() {},
    remove() {},
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    focus() {},
    contains: () => false,
    getBoundingClientRect: () => ({ width: 0, height: 0, left: 0, top: 0 }),
  };
  return el;
}

const store = new Map();
const sandbox = {
  console,
  Date,
  Math,
  JSON,
  Number,
  String,
  Object,
  Array,
  Boolean,
  RegExp,
  Error,
  isFinite,
  isNaN,
  parseInt,
  parseFloat,
  encodeURIComponent,
  decodeURIComponent,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  performance,
  requestAnimationFrame: () => 0,
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
  location: { hash: '', pathname: '/', search: '', origin: 'http://localhost', replace() {} },
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  document: {
    createElement: stubElement,
    querySelector: () => stubElement(),
    querySelectorAll: () => [],
    getElementById: () => stubElement(),
    addEventListener() {},
    body: stubElement(),
    contains: () => false,
    activeElement: null,
  },
  navigator: { serviceWorker: undefined },
  addEventListener() {},
  removeEventListener() {},
  scrollTo() {},
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

const ctx = vm.createContext(sandbox);

for (const file of ['core.js', 'data.js', 'vitals.js']) {
  const src = readFileSync(join(demo, file), 'utf8');
  vm.runInContext(src, ctx, { filename: file });
}

/*
 * The Schedule view, for its tasks alone.
 *
 * console-schedule.js is an IIFE that exposes `HV.schedui.tasksAll()`, and that
 * function is the ONLY way to get the demo's real calendar: data.js seeds the
 * client-session bookings and the view lazily concatenates the seventeen
 * internal, duty and meeting tasks on top of them, once. Reading either half
 * alone would miss the other, and hand-transcribing the seventeen would put a
 * second copy of the SOP in this repo.
 *
 * It touches no DOM at load — it only defines functions and assigns HV.schedui —
 * so the stub above is enough.
 *
 * `HV.store` has to exist first. The demo builds it at boot as a deep copy of the
 * seed (core.js:4350) and the extract script never boots, so the same copy is made
 * here — `tasksAll` reads and writes the STORE, not the seed.
 */
vm.runInContext(readFileSync(join(demo, 'views', 'console-schedule.js'), 'utf8'), ctx, {
  filename: 'console-schedule.js',
});
sandbox.HV.store = JSON.parse(JSON.stringify(sandbox.HV.seed));

const HV = sandbox.HV;
if (!HV?.seed) throw new Error('demo seed did not build — HV.seed is missing');

/**
 * Only the slices Day 1 stores. The rest of the demo store (circles, approvals,
 * the schedule, the tribe feed) lands on the days its screens do — carrying it
 * into the database now would create tables nothing reads and a migration to
 * undo later.
 */
const out = {
  seedVersion: HV.seedVersion,
  programShape: HV.seed.programShape,
  users: HV.seed.users,
  clients: HV.seed.clients.map((c) => ({
    id: c.id,
    userId: c.userId,
    name: c.name,
    code: c.code,
    designation: c.designation,
    sex: c.sex,
    dob: c.dob,
    heightCm: c.heightCm,
    weightKg: c.weightKg,
    health: c.health,
    gender: c.gender,
    address: c.address,
    location: c.location,
    email: c.email,
    mobile: c.mobile,
    plan: c.plan,
    tier: c.tier,
    humanPillars: c.humanPillars,
    cycle: c.cycle,
    day: c.day,
    levels: c.levels,
    track: c.track,
    observation: c.observation,
    status: c.status,
    statusWhy: c.statusWhy,
    joinedISO: c.joinedISO,
    term: c.term,
    goal: c.goal,
    purpose: c.purpose,
    tzo: c.tzo,
    tzLabel: c.tzLabel,
    pod: c.pod,

    /* ---- the dashboard's own fields ----------------------------------
       Day 1 pulled only identity, plan and levels. Home's roster cards read
       further, and a field that is absent here is a tile that cannot render
       however finished its UI is. */
    /* 'low' | 'medium' | 'high' — drives "Needs extra care", and riskWhy is
       the second line that says at WHAT, so the two travel together */
    risk: c.risk ?? null,
    riskWhy: c.riskWhy ?? null,
    /* the SECOND celebration date. dob alone gives birthdays and silently
       drops every anniversary from the strip. */
    anniv: c.anniv ?? null,
    /* percent of the plan kept. Null is meaningful: an observation client has
       nothing to comply with yet, which is not the same as 0%. */
    compliance: c.compliance ?? null,
    /* the four-pillar reading from the cycle just closed — the Index's ghost
       outline, and what a level move is measured against */
    lastCycleIndex: c.lastCycleIndex ?? null,
    /* per-pillar session ledger, keyed by STAFF ROLE (mind, not wellness):
         { fitness: {done,target,cancelled}, yoga: {...}, mind: {done,target} }
       Note `mind` carries no `cancelled` — one counselling a cycle is either
       held or it is not. */
    sessions: c.sessions ?? null,
  })),

  /* The morning digest: one line per client, why they need attention, and the
     evidence behind it. A top-level list keyed by clientId, not a per-client
     field — it is the Attention tab's whole content. */
  digest: HV.seed.digest ?? [],

  /* The follow-up drafts the console opens with: the copilot's first line for
     three of the digest's clients, all of them still unsent. Only the four
     fields the demo authors are carried — everything else a draft grows (who
     edited it, who approved it, the message it became) is produced by the
     server, and a seed that invented those would be seeding a history that
     never happened. */
  followupDrafts: (HV.seed.followupDrafts ?? []).map((d) => ({
    id: d.id,
    clientId: d.clientId,
    text: d.text,
    status: d.status,
  })),

  /*
   * The calendar. `day` is an offset from the demo's "today" and stays one here:
   * the seed turns it into a real date at run time, so the seeded week is always
   * the CURRENT week however long ago this file was written.
   */
  tasks: (sandbox.HV.schedui?.tasksAll() ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    kind: t.kind,
    clientId: t.clientId ?? null,
    day: t.day,
    start: t.start,
    dur: t.dur,
    recur: t.recur ?? null,
    assignees: t.assignees ?? [],
    groups: t.groups ?? [],
    link: t.link || null,
    notes: t.notes || null,
    allowOverlap: !!t.allowOverlap,
  })),

  /*
   * The team feed. `ts` is a real timestamp in the demo (msAgo(180)), so it is
   * carried as MINUTES AGO and turned back into a timestamp at seed time — the
   * feed renders "3 h ago" off it, and a frozen absolute value would read
   * "3 months ago" by the time anybody looked.
   */
  teamFeed: (HV.seed.teamFeed ?? []).map((p) => ({
    id: p.id,
    byId: p.byId,
    tag: String(p.tag || 'General').toLowerCase(),
    text: p.text,
    minsAgo: Math.max(0, Math.round((HV.now() - p.ts) / 60000)),
  })),

  /*
   * Leave. `from`/`to` are already ISO dates in the demo (isoIn(n) = today + n),
   * so they are carried as DAY OFFSETS and rebuilt at seed time — Sneha's cover
   * has to be live TODAY whenever the seed runs, which a frozen date cannot be.
   */
  leaves: (HV.seed.leaves ?? []).map((l) => {
    const dayOf = (iso) =>
      Math.round((new Date(iso + 'T00:00:00').getTime() - new Date(HV.todayISO() + 'T00:00:00').getTime()) / 864e5);
    return {
      id: l.id,
      staffId: l.staffId,
      fromDay: dayOf(l.from),
      toDay: dayOf(l.to),
      reason: l.reason,
      status: String(l.status || 'reassign').toUpperCase(),
      reallocations: (l.reallocations ?? []).map((r) => ({
        clientId: r.clientId,
        seatKey: r.roleKey,
        toId: r.toId,
      })),
      history: (l.history ?? []).map((h) => ({
        act: String(h.act || '').toUpperCase().replace(/ /g, '_'),
        byId: h.byId,
        minsAgo: Math.max(0, Math.round((HV.now() - h.ts) / 60000)),
      })),
    };
  }),
  leaveConfig: HV.seed.leaveConfig ?? { approverRole: 'admin' },

  capacity: HV.seed.capacity,
  pipeline: HV.seed.pipeline,
  slaConfig: HV.seed.slaConfig,
  notifRules: HV.seed.notifRules,
  mealPlans: HV.seed.mealPlans,
  catalog: HV.seed.catalog ?? {},
  program: HV.seed.program,
};

writeFileSync(join(here, 'demo-seed.json'), `${JSON.stringify(out, null, 2)}\n`);

console.log(
  `extracted demo seed v${out.seedVersion}: ` +
    `${out.users.length} users, ${out.clients.length} clients, ` +
    `${out.capacity.length} capacity rows, ${out.pipeline.length} pipeline cards, ` +
    `${out.followupDrafts.length} follow-up drafts`,
);
