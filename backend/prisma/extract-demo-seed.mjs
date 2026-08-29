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
/**
 * Two lookups the Work Queues slices need, built once.
 *
 * `staffId` turns the demo's `u-ai` into null: `ai` is a pseudo-role that
 * `HV.staff()` invents for any id it does not know, and no such user is ever
 * stored — so a rating or a signature attributed to it belongs to nobody, which
 * a null says truthfully and a foreign key could not say at all.
 *
 * `clientNamedIn` resolves a person's NAME out of a sentence. The demo writes
 * names into its work-list rows and its deviations table and finds them again by
 * searching the prose; a name is matched to an id ONCE here so the port can link
 * on a column instead. Longest name first, so no shorter name matches inside a
 * longer one.
 */
const clientIds = new Set(HV.seed.clients.map((c) => c.id));
const staffIds = new Set(HV.seed.users.map((u) => u.id));
const staffId = (id) => (id && staffIds.has(id) ? id : null);

const byLongestName = [...HV.seed.clients].sort((a, b) => b.name.length - a.name.length);
const clientNamedIn = (text) => {
  const hit = byLongestName.find((c) => String(text || '').includes(c.name));
  return hit ? hit.id : null;
};

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

  /* Configuration's own tables. `chains` gains `template`, which the demo's VIEW
     adds rather than its seed. */
  chains: { ...(HV.seed.chains ?? {}) },
  flowTemplates: (HV.seed.flowTemplates ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    desc: t.desc ?? null,
    trigger: t.trigger === 'cycleDay' ? 'CYCLE_DAY' : 'ENROL',
    defaultOn: !!t.defaultOn,
    steps: (t.steps ?? []).map((st) => ({
      after: st.after ?? null,
      on: st.on ?? null,
      at: st.at,
      title: st.title,
      text: st.text,
    })),
  })),
  clientFlows: HV.seed.clientFlows ?? {},
  tracks: HV.seed.tracks ?? [],
  catTags: HV.seed.catTags ?? [],


  /*
   * ═════════════════════════════ Work Queues ═════════════════════════════
   *
   * The six boards' own data. Three of these slices need a RULE applied on the
   * way out rather than a straight copy, and each rule is written down where it
   * is applied — because the alternative is somebody later reading the JSON,
   * finding it differs from data.js, and assuming the extractor is broken.
   */

  /*
   * The work list. `owner` becomes `ownerId`, and the row gains the client it is
   * ABOUT, which the demo never records: it writes the person's name into the
   * sentence and finds the row again by searching that sentence
   * (console-medical.js:404). Matching prose is a coincidence, not a link, so the
   * name is resolved to an id ONCE here and the port matches on the column.
   *
   * Longest name first, so "Suresh P." is never matched by a shorter name that
   * happens to sit inside it.
   */
  worklist: (HV.seed.worklist ?? []).map((w) => ({
    id: w.id,
    text: w.text,
    ownerId: w.owner,
    due: w.due,
    pill: w.pill,
    status: String(w.status || 'open').toUpperCase(),
    pillar: w.pillar ?? null,
    type: String(w.type || 'task').toUpperCase(),
    clientId: clientNamedIn(w.text),
  })),

  /*
   * The approvals, with their trails. `minsAgo` for each act, like the team feed,
   * so a seeded audit line still reads "3 h ago" whenever the seed is run.
   *
   * NOT CARRIED: `departments` on the goal sheet (a per-pillar sub-state that
   * belongs to the level-review screen, which is not built), and `payload`, which
   * no seeded approval has. Both would be columns nothing reads.
   *
   * The CHAIN IS NOT CARRIED EITHER, deliberately: an approval's chain is a
   * SNAPSHOT taken from Configuration, and the seed takes it from the chain rows
   * it has just written rather than from a copy frozen into this file — which is
   * the same rule `queues.service.create` follows, applied at seed time.
   */
  approvals: (HV.seed.approvals ?? []).map((a) => ({
    id: a.id,
    type: a.type,
    clientId: a.clientId ?? null,
    prospect: a.prospect ?? null,
    pillar: a.pillar ?? null,
    title: a.title,
    ownerId: a.ownerId,
    status: String(a.status || 'draft').toUpperCase(),
    stage: a.stage ?? 0,
    due: a.due,
    aiDraft: a.aiDraft ?? '',
    returnReason: a.returnReason ?? null,
    history: (a.history ?? []).map((h) => ({
      act: String(h.act || '').toUpperCase(),
      byId: staffId(h.byId),
      note: h.note || null,
      minsAgo: Math.max(0, Math.round(h.minsAgo ?? 0)),
    })),
  })),

  /*
   * The meals.
   *
   * ONE CAPTURE TIME, and the demo has two. `ts` drives the SLA ladder
   * (HV.slaLeft, core.js:3749) while `capturedMinsAgo` drives the "captured 14
   * min ago" label, and on Rajesh's lunch they disagree — 5 minutes against 14.
   * The port has one column, so it takes `ts` wherever the demo sets one: that is
   * the value the SLA story depends on ("five minutes old at boot — inside the
   * reply target, nudge pending", and Mathew's lunch 35 minutes old so the ladder
   * demonstrates a full escalation). A plate with no `ts` is already rated and
   * owes nobody a reply, so its display age is the only age it has.
   *
   * `byId: 'u-ai'` becomes NULL. `ai` is a pseudo-role and no such user is ever
   * stored, so a foreign key would point at nobody; a null rater means the AI
   * rated it, exactly as a null pod seat means the AI holds it.
   */
  meals: (HV.seed.meals ?? []).map((m) => ({
    id: m.id,
    clientId: m.clientId,
    slot: m.slot,
    capturedMinsAgo:
      m.ts != null ? Math.max(0, Math.round((HV.now() - m.ts) / 60000)) : m.capturedMinsAgo,
    fullness: m.fullness,
    photo: m.photo ?? null,
    dishes: m.dishes ?? [],
    ai: {
      stars: m.ai.stars,
      conf: m.ai.conf,
      detected: m.ai.detected ?? [],
      note: m.ai.note ?? '',
    },
    final: m.final
      ? {
          stars: m.final.stars,
          byId: staffId(m.final.byId),
          voiceSec: m.final.voiceSec ?? 0,
          note: m.final.note ?? '',
          rubric: m.final.rubric ?? null,
        }
      : null,
    protein: m.protein ?? 0,
    kcal: m.kcal ?? 0,
  })),

  /*
   * The medical documents and the summaries signed off them, joined into the one
   * row the port keeps: the demo splits them across `documents` and
   * `healthSummaries` because its summaries are a map keyed by document id, and a
   * summary without its document is not a thing that exists.
   *
   * Kiran R.'s blood panel names `clientId: 'c-kiran'`, and there is no such
   * client — Kiran is still an ARRIVAL. The id is dropped and the prospect name
   * carried instead, which is what the demo's own `ownerName()` falls back to.
   */
  medical: (HV.seed.documents ?? []).map((d) => {
    const sum = (HV.seed.healthSummaries ?? {})[d.id] ?? null;
    return {
      id: d.id,
      clientId: clientIds.has(d.clientId) ? d.clientId : null,
      prospect: d.prospect ?? (clientIds.has(d.clientId) ? null : d.clientId ? d.name : null),
      title: d.name,
      kind: d.type,
      uploadedOn: d.date,
      status: d.summary === 'ready' ? 'READY' : 'PENDING',
      signedById: staffId(sum && sum.signedBy),
      body: sum
        ? {
            conditions: sum.conditions ?? [],
            flags: sum.flags ?? [],
            metrics: sum.metrics ?? [],
            /* no version history in the demo's seed — the first signature IS the
               first version, and inventing priors would seed a record of
               revisions that never happened */
            history: [],
          }
        : { conditions: [], flags: [], metrics: [], history: [] },
    };
  }),

  /*
   * The deviations board. The demo keys each row by the client's NAME, so the
   * name is resolved to an id here for the same reason the work list's is.
   * `dv-N` ids are minted from position, because the demo authors none and a row
   * without a stable id cannot be restored on a re-seed.
   */
  deviations: (HV.seed.deviations ?? []).map((d, i) => ({
    id: `dv-${i + 1}`,
    clientId: clientNamedIn(d.client),
    kind: d.type,
    state: d.state,
    mode: d.mode,
  })),


  /*
   * ═════════════════════════════ Community ═════════════════════════════
   *
   * `HV.seed.tribeFeed`, taken apart along the ONE line the whole module is
   * built on: content on one side, member state on the other. The demo keeps
   * both inside each object — `going: false` sits beside `title`, `likes` beside
   * `caption` — because its store belongs to one browser holding one person's
   * copy of the world. The port has everybody's, so the state comes out into its
   * own lists here and the seed writes it as rows per person.
   *
   * Three rules are applied on the way out, each written where it is applied.
   */

  community: (() => {
    const tf = HV.seed.tribeFeed ?? {};

    /*
     * RULE 1. The demo addresses people by USER id everywhere in this slice —
     * the circle, a zone's members, a like, a comment's author. Membership and
     * reactions are CLIENT facts in the port (you are in the room because you are
     * on a plan), so a user id is resolved to its client id ONCE here rather than
     * joined through `Client.userId` on every read. An id that resolves to no
     * client is dropped: the demo's circle is five client personas and nothing
     * else, and a member who is not a client is not a fact this seed can state.
     */
    const clientOfUser = new Map(
      HV.seed.clients.filter((c) => c.userId).map((c) => [c.userId, c.id]),
    );
    const asClient = (userId) => clientOfUser.get(userId) ?? null;
    const asClients = (ids) => (ids ?? []).map(asClient).filter(Boolean);

    /*
     * RULE 2. `by: 'haalving'` becomes a NULL author. The house account has no
     * user record — `HV.whoName` resolves the literal to "HAALVING" without
     * reading one, because the house is the organisation speaking rather than a
     * person — so a foreign key would point at nobody. It is the same null the
     * work-queues slices write for `u-ai`, for the same reason.
     */
    const author = (by) => (by && by !== 'haalving' && staffIds.has(by) ? by : null);

    /*
     * RULE 3. A post carries the CLIENT IT IS ABOUT alongside its author. That is
     * the column the staff-side scope reads, and it is resolved here rather than
     * hopped through the author on every read — see the column's own comment for
     * the OR-collapse that made the sibling module's scope go quiet.
     */
    const post = (p) => ({
      id: p.id,
      authorId: author(p.by),
      clientId: asClient(p.by),
      kind: String(p.kind || 'text').toUpperCase(),
      caption: p.caption ?? '',
      img: p.img ?? null,
      secs: p.secs ?? null,
      /* the four content keys only. A game post's payload carries `answered`
         too, and that is the same one-reader boolean `going` is — leaving it in
         would smuggle member state back inside the content column the console
         is allowed to rewrite. */
      quiz: p.quiz
        ? { q: p.quiz.q, opts: p.quiz.opts ?? [], ans: p.quiz.ans ?? 0, why: p.quiz.why ?? '' }
        : null,
      /* like the team feed: minutes ago, rebuilt against the run instant, so a
         seeded post still reads "3 h ago" whenever the seed is run */
      minsAgo: Math.max(0, Math.round(p.minsAgo ?? 0)),
      /* MEMBER STATE, out of the object and into its own lists */
      likes: asClients(p.likes),
      comments: (p.comments ?? []).map((c) => ({
        byId: author(c.by),
        clientId: asClient(c.by),
        text: c.text,
      })),
    });

    return {
      /* the community circle — the pool the zone picker draws from */
      circle: asClients(tf.circle),

      /*
       * NEITHER `going` NOR `joined` IS CARRIED, and their absence is the honest
       * reading rather than an omission. Both are booleans in the demo because
       * that store is ONE PERSON'S: `going: false` says "the reader of this
       * browser is not going". A server has many readers, so the port makes
       * enrolment a row per client — and a boolean written for one reader cannot
       * be turned into rows for five without inventing who they are. Nobody is
       * enrolled in the demo's opening state, so there is nothing to write.
       * `answered` on a game question is the same fact and gets the same answer.
       */
      gatherings: (tf.events ?? []).map((e) => ({
        id: e.id,
        title: e.title,
        when: e.when ?? '',
        where: e.where ?? '',
        host: e.host ?? null,
        spots: e.spots ?? null,
        desc: e.desc ?? '',
        about: e.about ?? [],
        agenda: e.agenda ?? [],
        bring: e.bring ?? [],
        img: e.img,
      })),

      challenges: (tf.challenges ?? []).map((c) => ({
        id: c.id,
        title: c.title,
        days: c.days,
        host: c.host ?? null,
        stake: c.stake ?? null,
        desc: c.desc ?? '',
        about: c.about ?? [],
        how: c.how ?? [],
        arc: c.arc ?? [],
        img: c.img,
      })),

      gameDays: (tf.quizDays ?? []).map((d) => ({
        id: d.id,
        label: d.label,
        date: d.date ?? '',
        qs: (d.qs ?? []).map((q) => ({
          q: q.q,
          opts: q.opts ?? [],
          ans: q.ans ?? 0,
          why: q.why ?? '',
        })),
      })),

      posts: (tf.posts ?? []).map(post),

      zones: (tf.zones ?? []).map((z) => ({
        id: z.id,
        name: z.name,
        createdById: author(z.createdBy),
        memberIds: asClients(z.members),
        posts: (z.posts ?? []).map(post),
      })),
    };
  })(),

  /*
   * The outbound log. `HV.seed.broadcasts` is `[]` (data.js:2174) — nothing has
   * been sent in the demo's opening state — and it is carried anyway rather than
   * assumed, so the day somebody seeds a first announcement the seed already has
   * somewhere to put it and a reviewer does not have to notice.
   */
  broadcasts: HV.seed.broadcasts ?? [],

  /* ---- plan templates -------------------------------------------------
     `seed.templates` is set as a PLAIN PROPERTY after the seed literal rather
     than inside it (data.js:2691), which is why a key-by-key extractor missed
     it and the Catalog's Templates tab came up empty against a demo that has
     five. Each carries all 14 days keyed 1..14; days a pillar does not run are
     present with an empty `slots`, which is what makes "6 of 14 days written"
     a real reading rather than a missing-data artefact. */
  templates: HV.seed.templates ?? [],

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
    `${out.followupDrafts.length} follow-up drafts, ` +
    `${out.worklist.length} work items, ${out.approvals.length} approvals, ` +
    `${out.meals.length} meals, ${out.medical.length} documents, ` +
    `${out.deviations.length} deviations, ` +
    `${out.community.gatherings.length} gatherings, ${out.community.challenges.length} challenges, ` +
    `${out.community.gameDays.length} game days, ${out.community.posts.length} posts, ` +
    `${out.community.zones.length} zones, ${out.community.circle.length} in the circle`,
);
