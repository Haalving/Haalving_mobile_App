/* HAALVING demo seed data — one coherent story across client app and console.
   Cast: Rajesh (cycle 3, day 6), Meena (risk: silent 3 days), Suresh P. (day 9 — level review today),
   Priya (observation, day 3), Mathew (cycle 8, day 3 — Level 5 on its third
   carry, transcribed from a real 77-day paper trail, identity anonymised).
   Staff: the seven-role pod plus the two SOP
   signatories above it (Haalving Coach, Super User). All times are
   demo-relative ("mins ago"). */
(function () {
  'use strict';

  HV.seedVersion = 48;

  /* ---- THE one literal statement of the programme's shape ----
     Everywhere else in the app this is read through HV.cycleDays() / HV.levels()
     / HV.isRest(), which resolve HV.store.programShape and fall back to this via
     HV.seed. data.js cannot use those helpers: the seed is built at parse time,
     before HV.store exists and before HV.seed itself is assigned. So the numbers
     live here, once, and are handed to the store as seed.programShape below.

     Change a number here and the whole demo follows — but bump HV.seedVersion
     with it, because it changes the SHAPE of seeded arrays and a saved store at
     the old version would keep its old lengths while every helper answered new
     ones. */
  const SHAPE = { levels: 7, cycleDays: 14, reviewDay: 12, restDays: [5, 10],
                  meetingDay: 14, termDays: 90,
                  sessions: { fitness: 5, yoga: 3, mind: 1 } };

  /* 14 older days synthesized deterministically ahead of each client's curated
     recent six, so the tracker history strips can scroll back three weeks.
     Sine keeps it plausible; the dip every sixth day keeps it honest. */
  function back(base, amp, cap) {
    var out = [];
    for (var i = 0; i < 14; i++) {
      var v = base + amp * Math.sin(i * 1.7) + ((i % 6 === 2) ? -base * 0.4 : 0);
      v = Math.max(0, Math.round(v));
      if (cap) v = Math.min(cap, v);
      out.push(v);
    }
    return out;
  }

  /* demo-pop dates: birthdays, anniversaries, leave windows and log stamps
     are computed against the machine's own today at seed build, so the
     celebration and cover stories are live whenever the demo boots. */
  const NOW = new Date();
  function iso(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }
  /* today + n days, as a local ISO date */
  function isoIn(days) { const d = new Date(NOW); d.setDate(d.getDate() + days); return iso(d); }
  /* a date whose month-day lands `offsetDays` from today, `years` back —
     one helper covers both birthdays and anniversaries */
  function dob(years, offsetDays) {
    const d = new Date(NOW); d.setDate(d.getDate() + offsetDays);
    d.setFullYear(d.getFullYear() - years);
    return iso(d);
  }
  /* an epoch-ms timestamp n minutes before boot */
  function msAgo(mins) { return NOW.getTime() - mins * 60000; }
  /* n days before today, as a local ISO date — joining dates and term starts */
  function isoAgo(days) { return isoIn(-days); }
  /* the age someone of this birth date IS today, which is not always the age
     dob(years, …) was asked for: a birthday still a few days out means they
     are the younger age until it arrives */
  function ageFromISO(s) {
    return Math.max(0, Math.floor((NOW.getTime() - new Date(s).getTime()) / 31557600000));
  }

  /* ---- Templates (TJ, 17 Aug): ONE PILLAR, ONE LEVEL, one activity track ----
     A template used to be a single object spanning every pillar across all
     seven cycles, which meant "level" was a compartment inside it and could
     never be a shelf label. Now the shelf IS the identity — Nutrition · Level 1
     · Sedentary — and a client carries one assignment per pillar, each chosen
     and tailored by the coach who owns that pillar.

     Days are flat (1..cycleDays) because one template is one level is one
     cycle. A day with no slots is a legitimate blank: a pillar simply does not
     run that day. Rest/review/meeting are NOT written onto template days — they
     come from programShape, because four templates could otherwise disagree
     about whether day 5 is a rest day and there is no sane way to merge that.

     Plain and deterministic — no Date.now/Math.random — so two calls with the
     same args always produce identical output. */
  function genTemplate(o) {
    const days = {};
    for (let d = 1; d <= SHAPE.cycleDays; d++) days[d] = { slots: o.day(d) || [] };
    /* what the day is MEASURED against, as opposed to what it holds. Targets
       live ON THE DAY (a later day inherits the nearest earlier statement —
       HV.tplTargetsOn); a seed that states one set writes it on day 1 and
       every day of the cycle inherits it, which is what a flat daily plan
       means. Non-culture pillars simply never state one. */
    if (o.targets) days[1].targets = o.targets;
    return { id: o.id, pillar: o.pillar, level: o.level, track: o.track,
             name: o.name, desc: o.desc, by: o.by, status: o.status || 'published',
             days: days };
  }

  /* the morning films, one per day, walked so that no two days of a cycle
     repeat. `motivation` is a template KIND and a library, still not a fifth
     pillar — HV.PILLARS stays at four. */
  const MOT = ['mv-belong', 'mv-plate', 'mv-move', 'mv-eighty', 'mv-breath', 'mv-sleep',
               'mv-purpose', 'mv-strength', 'mv-sugar', 'mv-slow', 'mv-circle',
               'mv-water', 'mv-walk', 'mv-rest'];

  /* which days each pillar runs, derived from SHAPE rather than pinned to
     literals, so the pattern survives a change of cycle length: sessions
     alternate fitness/yoga and skip the rest days. */
  function runsOn(kind) {
    const out = [];
    for (let d = 1; d <= SHAPE.cycleDays; d++) {
      if (SHAPE.restDays.includes(d)) continue;
      if (kind === 'fitness' && d % 2 === 1) out.push(d);
      if (kind === 'yoga'    && d % 2 === 0) out.push(d);
      if (kind === 'mind'    && d === SHAPE.reviewDay) out.push(d);
    }
    return out;
  }

  /* A session's NAME, not just its pillar. The derived calendar reads slot
     labels straight through onto the client's My Plan, so a template whose
     slots are all called "Session" would turn the hand-written calendar this
     replaces — "Strength (bands) II", "Breath & spine" — into a wall of
     identical rows. The rotation walks the pillar's own run-days, and the
     review day always carries the assessment. */
  const SESSION_NAMES = {
    fitness: ['Strength (bands)', 'Mobility + cardio', 'Strength (bands) II',
              'Cardio intervals', 'Tempo + carries'],
    yoga:    ['Hatha basics', 'Breath & spine', 'Flow & balance', 'Recovery flow'],
  };
  function sessionName(kind, d) {
    if (kind === 'fitness' && d === SHAPE.reviewDay) return 'Assessment-lite';
    const days = runsOn(kind);
    const names = SESSION_NAMES[kind] || ['Session'];
    const i = days.indexOf(d);
    return names[(i < 0 ? 0 : i) % names.length];
  }

  /* ---- The two plans (TJ, 16 Aug). One AI flow each, and they are the whole
     model: Poorna is AI→Coach→Client, Svayam is AI→Client.

     POORNA — all four pillars carried by dedicated human coaches, coordinated
     by the Haalving Coach, with the doctor above them. The AI never speaks to
     the client; it guides the coaches, and the coach's judgement sits over it.

     SVAYAM — the AI guides the client directly. Human coaches are optional and
     added per pillar; `humanPillars` is the list of pillars a Svayam client has
     bought a human for, so an empty array is pure AI and a partial array is the
     mixed state the old Grey plan used to name.

     `launch: false` keeps Svayam defined but unsold: the first launch is Poorna
     only, and the coach conversations it produces are the training material the
     Svayam AI is built from. Flipping this one flag opens the second door
     everywhere — onboarding, the console filters and the Plans tab all read it. */
  HV.PLANS = {
    poorna: { key: 'poorna', name: 'HAALVING Poorna', tag: 'Four pillars, four dedicated coaches',
              flow: 'AI → Coach → Client', launch: true,
              desc: 'A dedicated coach on each of the four pillars — Nutrition, Fitness, Yoga and Mind Wellness — coordinated by your Haalving Coach, with a doctor above them all. AI works only in the background, giving your coaches data and holistic analysis; every coach applies their own judgement over it.' },
    svayam: { key: 'svayam', name: 'HAALVING Svayam', tag: 'AI-guided, add coaches as you like',
              flow: 'AI → Client', launch: false,
              desc: 'The HAALVING AI coaches you directly — daily plans, meal readings and check-ins. Add a human coach to any pillar whenever you want more. Safety escalations always reach a human.' },
  };
  /* the plans a client may actually be sold today */
  HV.plansOnSale = function () {
    return Object.keys(HV.PLANS).filter(function (k) { return HV.PLANS[k].launch; });
  };
  /* Does the AI speak to this client directly? Poorna: never — it briefs the
     coaches instead. Svayam: yes. One test, so no screen has to re-derive it. */
  HV.aiLeads = function (c) { return !!c && c.plan === 'svayam'; };
  /* Is this pillar carried by a human for this client? Poorna is all four by
     definition; Svayam only where a coach was added. Pillar keys, not role keys. */
  HV.humanPillar = function (c, pillarKey) {
    if (!c) return false;
    if (c.plan === 'poorna') return true;
    return (c.humanPillars || []).indexOf(pillarKey) !== -1;
  };

  const seed = {
    session: null,

    /* ---- day-0 demo state: a sample HAALVING Index so observation clients
       can see how the four-pillar balance will read once scoring begins ---- */
    demoPreview: {
      index: { fitness: 80, culture: 88, yoga: 67, wellness: 100 },
      ghost: { fitness: 68, culture: 74, yoga: 52, wellness: 84 },
    },

    users: [
      { id: 'u-cl-rajesh', role: 'client', name: 'Rajesh D.', subtitle: 'Poorna · four dedicated coaches · Cycle 3' },
      { id: 'u-cl-priya',  role: 'client', name: 'Priya K.',  subtitle: 'Poorna · observation period' },
      { id: 'u-cl-dev',    role: 'client', name: 'Dev K.',    subtitle: 'Svayam · AI coach + Vikram (Fitness)' },
      { id: 'u-cl-ananya', role: 'client', name: 'Ananya S.', subtitle: 'Svayam · AI coach end-to-end' },
      { id: 'u-cl-mathew', role: 'client', name: 'Mathew', subtitle: 'Poorna · four dedicated coaches · Cycle 8' },
      /* staff carry an employee record: level (1|2, L1 senior), doj, dept
         (one of the four coach-department keys, null for ops/medical seats),
         timezone, an emergency contact, a one-line memo, a cv filename and a
         weekly availability window per weekday (null = off). People & Access
         edits these; Time & Cover reads avail and the leave board. */
      { id: 'u-anita',   role: 'admin',     name: 'Anita R.',
        level: 1, doj: '2022-04-18', dept: null, tzo: 5.5, tzLabel: 'IST',
        emergency: { name: 'Ravi R.', phone: '+91 98470 22110' },
        memo: 'Runs the onboarding cadence end to end.', cv: null,
        avail: { mon: ['09:00', '18:00'], tue: ['09:00', '18:00'], wed: ['09:00', '18:00'], thu: ['09:00', '18:00'], fri: ['09:00', '18:00'], sat: ['09:00', '13:00'], sun: null } },
      { id: 'u-rohan',   role: 'opsmgr',    name: 'Rohan M.',
        level: 1, doj: '2022-08-01', dept: null, tzo: 5.5, tzLabel: 'IST',
        emergency: { name: 'Maya M.', phone: '+91 98950 31421' },
        memo: 'First signature on every chain; owns the templates.', cv: null,
        avail: { mon: ['08:00', '17:00'], tue: ['08:00', '17:00'], wed: ['08:00', '17:00'], thu: ['08:00', '17:00'], fri: ['08:00', '17:00'], sat: null, sun: null } },
      { id: 'u-sureshk', role: 'opshead',   name: 'Suresh K.',
        level: 1, doj: '2021-06-14', dept: null, tzo: 5.5, tzLabel: 'IST',
        emergency: { name: 'Latha K.', phone: '+91 94470 88213' },
        memo: 'Final operational say; capacity overrides live here.', cv: null,
        avail: { mon: ['09:00', '19:00'], tue: ['09:00', '19:00'], wed: ['09:00', '19:00'], thu: ['09:00', '19:00'], fri: ['09:00', '19:00'], sat: ['10:00', '14:00'], sun: null } },
      { id: 'u-bineesh', role: 'core',      name: 'Bineesh',
        level: 1, doj: '2021-01-05', dept: null, tzo: 5.5, tzLabel: 'IST',
        emergency: { name: 'Anu B.', phone: '+91 98460 10021' },
        memo: 'Management reviewer — reads everything, signs last.', cv: null,
        avail: { mon: ['10:00', '16:00'], tue: ['10:00', '16:00'], wed: ['10:00', '16:00'], thu: ['10:00', '16:00'], fri: ['10:00', '16:00'], sat: null, sun: null } },
      { id: 'u-kavya',   role: 'doctor',    name: 'Dr. Kavya',
        level: 1, doj: '2022-02-21', dept: null, tzo: 5.5, tzLabel: 'IST',
        emergency: { name: 'Dr. Mohan', phone: '+91 94950 55672' },
        memo: 'Signs every health summary; raw records stop at her desk.', cv: 'kavya-md-cv.pdf',
        avail: { mon: ['11:00', '15:00'], tue: ['11:00', '15:00'], wed: null, thu: ['11:00', '15:00'], fri: ['11:00', '15:00'], sat: null, sun: null } },
      { id: 'u-sneha',   role: 'dietitian', name: 'Sneha M.',
        level: 1, doj: '2022-09-12', dept: 'dietitian', tzo: 5.5, tzLabel: 'IST',
        emergency: { name: 'Hari M.', phone: '+91 97460 41190' },
        memo: 'South Indian kitchens are her home ground.', cv: 'sneha-rd-cv.pdf',
        avail: { mon: ['07:00', '15:00'], tue: ['07:00', '15:00'], wed: ['07:00', '15:00'], thu: ['07:00', '15:00'], fri: ['07:00', '15:00'], sat: ['08:00', '12:00'], sun: null } },
      { id: 'u-vikram',  role: 'fitness',   name: 'Vikram S.',
        level: 1, doj: '2022-05-02', dept: 'fitness', tzo: 5.5, tzLabel: 'IST',
        emergency: { name: 'Priya S.', phone: '+91 98471 77045' },
        memo: 'Form first, load second — twelve injury-free years.', cv: 'vikram-cpt-cv.pdf',
        /* a TYPED tag. The tag row on People & Access mixes these with tags the
           record works out for itself (New joinee, On leave, Unallocated…);
           this is the kind nothing can derive, so a human keys it in. */
        tags: ['First aid certified'],
        /* a SPLIT shift — the only one on the bench. A personal trainer
           carrying six one-on-ones works early mornings and evenings with the
           middle of the day empty; five and a half hours of sessions fit in no
           single window. Lakshmi and Meera keep single shifts, so the contrast
           between the two shapes stays visible in the demo. */
        avail: { mon: [['06:00', '10:00'], ['17:00', '21:00']],
                 tue: [['06:00', '10:00'], ['17:00', '21:00']],
                 wed: [['06:00', '10:00'], ['17:00', '21:00']],
                 thu: [['06:00', '10:00'], ['17:00', '21:00']],
                 fri: [['06:00', '10:00'], ['17:00', '21:00']],
                 sat: [['06:00', '10:00']], sun: null } },
      { id: 'u-lakshmi', role: 'yoga',      name: 'Lakshmi N.',
        level: 1, doj: '2021-12-06', dept: 'yoga', tzo: 5.5, tzLabel: 'IST',
        emergency: { name: 'Nandan N.', phone: '+91 94001 26834' },
        memo: 'Live teaching only — reads a room of one like a shala of forty.', cv: null,
        avail: { mon: ['06:00', '12:00'], tue: ['06:00', '12:00'], wed: ['06:00', '12:00'], thu: ['06:00', '12:00'], fri: ['06:00', '12:00'], sat: ['07:00', '11:00'], sun: null } },
      { id: 'u-meera',   role: 'mind',      name: 'Meera J.',
        level: 1, doj: '2023-03-20', dept: 'mind', tzo: 5.5, tzLabel: 'IST',
        emergency: { name: 'Arun J.', phone: '+91 98090 63317' },
        memo: 'Sleep is her craft; evenings are her clinic hours.', cv: null,
        avail: { mon: ['14:00', '21:00'], tue: ['14:00', '21:00'], wed: ['14:00', '21:00'], thu: ['14:00', '21:00'], fri: ['14:00', '21:00'], sat: null, sun: null } },
      /* the first Head of Department seat — fitness. The other three
         departments route to the Operations Head until theirs are hired. */
      { id: 'u-arjun',   role: 'hod',       name: 'Arjun Nair',
        level: 1, doj: '2021-10-11', dept: 'fitness', tzo: 5.5, tzLabel: 'IST',
        emergency: { name: 'Devika Nair', phone: '+91 98460 90551' },
        memo: 'Heads the fitness bench; owns its cover board and rosters.', cv: 'arjun-msc-cv.pdf',
        avail: { mon: ['08:00', '17:00'], tue: ['08:00', '17:00'], wed: ['08:00', '17:00'], thu: ['08:00', '17:00'], fri: ['08:00', '17:00'], sat: null, sun: null } },
      /* the two L2 seats the cover board reaches for when an L1 is away.
         Their joining dates are RELATIVE to boot, not literal, for the same
         reason the schedule's tasks are: a date typed as '2024-07-15' stops
         being a recent hire the year after it is written, and "New joinee" —
         which reads the record rather than a typed label — would then be a
         chip nobody ever matches. Nikhil is six weeks in and Divya well over
         a year, so New joinee and Bench cover stay two different populations
         and the demo shows the filters are independent. */
      { id: 'u-nikhil',  role: 'fitness',   name: 'Nikhil T.',
        level: 2, doj: isoAgo(45), dept: 'fitness', tzo: 5.5, tzLabel: 'IST',
        emergency: { name: 'Thomas T.', phone: '+91 97455 12908' },
        memo: 'Second fitness seat — strong with beginners and home blocks.', cv: null,
        tags: ['Probation'],
        avail: { mon: ['12:00', '20:00'], tue: ['12:00', '20:00'], wed: ['12:00', '20:00'], thu: ['12:00', '20:00'], fri: ['12:00', '20:00'], sat: ['10:00', '14:00'], sun: null } },
      { id: 'u-divya',   role: 'dietitian', name: 'Divya R.',
        level: 2, doj: isoAgo(400), dept: 'dietitian', tzo: 5.5, tzLabel: 'IST',
        emergency: { name: 'Rekha R.', phone: '+91 94002 78314' },
        memo: 'Covering Sneha today — PCOS plates and family meals otherwise.', cv: 'divya-rd-cv.pdf',
        avail: { mon: ['09:00', '17:00'], tue: ['09:00', '17:00'], wed: ['09:00', '17:00'], thu: ['09:00', '17:00'], fri: ['09:00', '17:00'], sat: null, sun: null } },
    ],

    clients: [
      {
        /* sex is here for one reason: half the reference bands on the Vital
           Panel differ by it, and a panel that flags a healthy woman's
           haemoglobin against a man's band is worse than no panel. */
        /* ---- the client record -------------------------------------------
           `sex` and `gender` are TWO DIFFERENT FIELDS and must stay that way.
           `sex` is CLINICAL: HV.vitals reads it to choose lab reference bands
           (haemoglobin, ferritin and creatinine have different normal ranges
           for male and female bodies) and the BMR formula uses it. `gender`
           is IDENTITY, and `address` is how this person asked to be addressed.
           Merging them silently moves a client's lab reference bands, which
           nobody notices until it matters.

           `age` is NOT authoritative — HV.ageOf(c) derives it from `dob`, and
           a normalisation pass at the foot of this file keeps the stored
           number equal to it. The stored one survives only so a record with
           no dob still reads.

           `term` is the ENGAGEMENT clock, not the programme clock: 90 days
           paid for, against 7 levels x 14 days of programme. Suresh carries a
           60-day term so the per-client override is exercised on first boot. */
        id: 'c-rajesh', userId: 'u-cl-rajesh', name: 'Rajesh D.', age: 46, sex: 'M',
        code: 'HV-0142', designation: 'Regional Sales Head',
        gender: 'M', address: 'he/him',
        joinedISO: isoAgo(33), heightCm: 172, weightKg: 84.0,
        status: 'active', statusWhy: '', statusBy: null, statusAt: null,
        email: 'rajesh.d@example.in', emailOk: true, emailBy: 'u-anita', emailAt: msAgo(33 * 1440),
        mobile: '+91 98470 22110', mobileOk: true, mobileBy: 'u-anita', mobileAt: msAgo(33 * 1440),
        location: 'Kochi, Kerala',
        term: { days: 90, startISO: isoAgo(33), renewals: [] },
        log: [], meetings: [],
        /* demo-pop pair: his birthday lands two days out, the anniversary four —
           so the console's celebrations strip is never empty at boot */
        dob: dob(46, 2), anniv: dob(19, 4), tzo: 5.5, tzLabel: 'IST',
        tier: 'HAALVING Poorna', plan: 'poorna', humanPillars: ['fitness', 'culture', 'yoga', 'wellness'], cycle: 3, day: 6, observation: false,
        goal: 'Bring HbA1c under 6.5 and lose 8 kg', purpose: 'Be able to trek with my kids at 60.',
        levels: { fitness: 3, culture: 2, yoga: 3, wellness: 4 },
        /* arrival moods, keyed 'cycle.day' — day 3.3 left blank on purpose:
           an unrecorded day renders as a dashed circle in the seven-day strip */
        moods: { '2.11': 'sad', '3.1': 'happy', '3.2': 'drained', '3.4': 'happy', '3.5': 'sad' },
        /* the diary behind the strip: every check-in with its clock time
           (min = minutes since midnight; several per day allowed). moods above
           keeps only the latest per day; days 3.4 and 3.5 carry the intraday
           movement the console's emotion chart draws. */
        moodLog: [
          { cy: 2, d: 11, min: 540, mood: 'sad' },
          { cy: 3, d: 1, min: 505, mood: 'happy' },
          { cy: 3, d: 2, min: 555, mood: 'drained', note: 'Slept badly — client call ran past midnight' },
          { cy: 3, d: 4, min: 485, mood: 'sad', note: 'Heavy start to the day' },
          { cy: 3, d: 4, min: 790, mood: 'drained' },
          { cy: 3, d: 4, min: 1170, mood: 'happy', note: 'Best session of the cycle' },
          { cy: 3, d: 5, min: 470, mood: 'happy' },
          { cy: 3, d: 5, min: 1215, mood: 'sad', note: 'Work news soured the evening' },
        ],
        /* day-8 weigh-ins, one per cycle — this cycle's is still open */
        weightLog: [{ cy: 2, day: 8, kg: 81.4, ts: msAgo(13 * 1440) }],
        /* gamification: HAALVING coins (redeemable). The streak is not stored —
           it is counted back through the calendars, so the flames and the number
           can never disagree. */
        coins: 1240,
        risk: 'medium', riskWhy: 'meal rating average down 1.2 stars week-over-week',
        lastCycleIndex: { fitness: 80, culture: 76, yoga: 67, wellness: 100 },
        pod: { dietitian: 'u-sneha', fitness: 'u-vikram', yoga: 'u-lakshmi', mind: 'u-meera', doctor: 'u-kavya', admin: 'u-anita', opshead: 'u-sureshk' },
        /* temporary seat cover while Sneha is on approved leave (lv-0) —
           HV.staffFor resolves through this; it lapses by date, no cleanup job */
        podCover: { dietitian: { coverId: 'u-divya', from: isoIn(0), to: isoIn(1), leaveId: 'lv-0' } },
        trackers: { waterDone: 5, waterTarget: 8, steps: 6100, stepsTarget: 8000, sleep: '6 h 40 m', sleepPct: 83, mealsLogged: 2, mealsTarget: 3, screenMins: 96, screenTarget: 120,
          activeMins: 38, activeTarget: 60, actCal: 210, actCalTarget: 350, bmr: 1580,
          bed: '23:20', wake: '06:00', stages: { deep: 58, rem: 76, light: 244, awake: 22 },
          waterLog: ['07:10', '09:40', '12:05', '15:20', '18:45'],
          screenApps: [{ name: 'Messaging', mins: 34 }, { name: 'News', mins: 26 }, { name: 'Video', mins: 21 }, { name: 'Everything else', mins: 15 }],
          week: { steps: back(6800, 1600).concat([7200, 5400, 8100, 6800, 7900, 4200]), water: back(6, 2, 8).concat([8, 6, 7, 8, 5, 6]), sleepPct: back(82, 10, 100).concat([90, 75, 88, 80, 92, 70]), screen: back(150, 40).concat([135, 170, 110, 150, 95, 125]),
            active: back(42, 14).concat([48, 30, 55, 44, 52, 26]), actCal: back(235, 80).concat([265, 165, 300, 245, 285, 145]) } },
        sessions: { fitness: { done: 3, target: 5, cancelled: 0 }, yoga: { done: 2, target: 3, cancelled: 0 }, mind: { done: 1, target: 1 } },
        reviewAns: {},   /* per-cycle review-day questionnaire answers land here */
        /* the client's own stars after a session — the coach side lives in
           store.staffSessionNotes */
        sessionFeedback: [
          { cy: 3, day: 4, key: 'yoga', stars: 5, note: 'Felt strong, no knee trouble', ts: msAgo(2 * 1440) },
        ],
        compliance: 83, calendarProposed: false, track: 'sedentary',
        health: ['Type-2 diabetes', 'Occasional back pain'],
        culturePhotos: { uploaded: 18, of: 33, min: 25 },
        cycleKcal: 7590, /* eaten so far this cycle — the paper level-progress report's "total calorie intake" line */
        goalLedger: [
          { level: 1, target: '\u22121.0 kg', result: '\u22121.2 kg', state: 'ok' },
          { level: 2, target: '\u22121.0 kg', result: '\u22120.6 kg \u00b7 carried', state: 'cur' },
          { level: 3, target: '\u22121.0 kg', state: 'todo' },
          { level: 4, target: '\u22121.5 kg', state: 'todo' },
          { level: 5, target: '\u22121.5 kg', state: 'todo' },
          { level: 6, target: '\u22121.0 kg', state: 'todo' },
          { level: 7, target: '\u22121.0 kg', state: 'todo' },
        ],
        cycleHistory: [
          { cycle: 1, level: 1, target: '\u22121.0 kg', result: '\u22121.2 kg', outcome: 'achieved',
            sessions: { done: 8, target: 9 }, compliance: 78, index: { fitness: 72, culture: 70, yoga: 60, wellness: 80 } },
          { cycle: 2, level: 2, target: '\u22121.0 kg', result: '\u22120.6 kg', outcome: 'continued',
            sessions: { done: 7, target: 9 }, compliance: 76, index: { fitness: 80, culture: 76, yoga: 67, wellness: 100 } },
        ],
      },
      {
        id: 'c-meena', userId: null, name: 'Meena I.', age: 52, sex: 'F',
        code: 'HV-0136', designation: 'School Principal',
        gender: 'F', address: 'she/her',
        joinedISO: isoAgo(23), heightCm: 158, weightKg: 68.5,
        status: 'active', statusWhy: '', statusBy: null, statusAt: null,
        email: 'meena.i@example.in', emailOk: true, emailBy: 'u-anita', emailAt: msAgo(23 * 1440),
        mobile: '+91 94470 88213', mobileOk: false, mobileBy: null, mobileAt: null,
        location: 'Thrissur, Kerala',
        term: { days: 90, startISO: isoAgo(23), renewals: [] },
        log: [], meetings: [],
        /* demo-pop: her birthday IS today — the celebrations strip opens on her */
        dob: dob(52, 0), anniv: '1996-02-14', tzo: 5.5, tzLabel: 'IST',
        tier: 'HAALVING Poorna', plan: 'poorna', humanPillars: ['fitness', 'culture', 'yoga', 'wellness'], cycle: 2, day: 7, observation: false,
        goal: 'Sleep 7+ hours, reduce BP medication', purpose: 'Feel rested enough to enjoy my grandkids.',
        levels: { fitness: 2, culture: 2, yoga: 1, wellness: 2 },
        moodLog: [],   /* three silent days — the empty diary IS her story */
        weightLog: [], reviewAns: {}, sessionFeedback: [],
        risk: 'high', riskWhy: 'no logs for 3 days — non-response ladder at step 2',
        lastCycleIndex: { fitness: 40, culture: 62, yoga: 33, wellness: 50 },
        pod: { dietitian: 'u-sneha', fitness: 'u-vikram', yoga: 'u-lakshmi', mind: 'u-meera', doctor: 'u-kavya', admin: 'u-anita', opshead: 'u-sureshk' },
        trackers: { waterDone: 0, waterTarget: 8, steps: 0, stepsTarget: 7000, sleep: '—', sleepPct: 0, mealsLogged: 0, mealsTarget: 3, screenMins: 205, screenTarget: 180,
          activeMins: 0, activeTarget: 45, actCal: 0, actCalTarget: 300, bmr: 1290,
          bed: null, wake: null, stages: { deep: 0, rem: 0, light: 0, awake: 0 },
          waterLog: [],
          screenApps: [{ name: 'Video', mins: 96 }, { name: 'Messaging', mins: 58 }, { name: 'Social', mins: 34 }, { name: 'Everything else', mins: 17 }],
          week: { steps: back(2800, 1400).concat([3000, 2500, 0, 1800, 0, 0]), water: back(3, 2, 8).concat([3, 2, 0, 1, 0, 0]), sleepPct: back(62, 12, 100).concat([60, 55, 0, 58, 0, 0]), screen: back(250, 60).concat([260, 280, 0, 230, 0, 0]),
            active: back(16, 10).concat([18, 14, 0, 10, 0, 0]), actCal: back(95, 55).concat([105, 80, 0, 60, 0, 0]) } },
        sessions: { fitness: { done: 2, target: 5, cancelled: 2 }, yoga: { done: 1, target: 3, cancelled: 1 }, mind: { done: 0, target: 1 } },
        compliance: 58, calendarProposed: false, track: 'sedentary',
        health: ['Hypertension'],
        culturePhotos: { uploaded: 9, of: 33, min: 25 },
        goalLedger: [
          { level: 1, target: 'Wind-down by 11 pm', result: '9 of 11 nights', state: 'ok' },
          { level: 2, target: '7 h sleep, 6 nights', state: 'cur' },
          { level: 3, target: 'Screens off by 10', state: 'todo' },
          { level: 4, target: '7 h sleep, 9 nights', state: 'todo' },
          { level: 5, target: 'BP review with Dr. Kavya', state: 'todo' },
          { level: 6, target: 'Hold it for a full cycle', state: 'todo' },
          { level: 7, target: 'Dose review', state: 'todo' },
        ],
        cycleHistory: [
          { cycle: 1, level: 1, target: 'Wind-down by 11 pm', result: '9 of 11 nights', outcome: 'achieved',
            sessions: { done: 6, target: 9 }, compliance: 61, index: { fitness: 40, culture: 62, yoga: 33, wellness: 50 } },
        ],
      },
      {
        id: 'c-sureshp', userId: null, name: 'Suresh P.', age: 41, sex: 'M',
        code: 'HV-0129', designation: 'Civil Engineer',
        gender: 'M', address: 'he/him',
        joinedISO: isoAgo(58), heightCm: 176, weightKg: 74.2,
        status: 'active', statusWhy: '', statusBy: null, statusAt: null,
        email: 'suresh.p@example.in', emailOk: true, emailBy: 'u-anita', emailAt: msAgo(58 * 1440),
        mobile: '+91 98460 10021', mobileOk: true, mobileBy: 'u-anita', mobileAt: msAgo(58 * 1440),
        location: 'Kozhikode, Kerala',
        /* a 60-day term, not 90 — the per-client override, and the one client
           whose term bar reads amber on first boot */
        term: { days: 60, startISO: isoAgo(58), renewals: [] },
        log: [], meetings: [],
        dob: '1985-03-22', anniv: '2010-12-05', tzo: 5.5, tzLabel: 'IST',
        tier: 'HAALVING Poorna', plan: 'poorna', humanPillars: ['fitness', 'culture', 'yoga', 'wellness'], cycle: 5, day: 9, observation: false,
        goal: 'Run a 10K without knee pain', purpose: 'Get back on the trail runs I gave up at 35.',
        levels: { fitness: 5, culture: 4, yoga: 5, wellness: 5 },
        /* a steady arc into review day — latest-of-day mirrored in moods */
        moods: { '5.7': 'happy', '5.8': 'happy', '5.9': 'happy' },
        moodLog: [
          { cy: 5, d: 7, min: 495, mood: 'happy' },
          { cy: 5, d: 8, min: 520, mood: 'happy' },
          { cy: 5, d: 9, min: 480, mood: 'happy', note: 'Review day — ready' },
        ],
        weightLog: [], reviewAns: {}, sessionFeedback: [],
        risk: 'low', riskWhy: 'level review today — pack ready',
        lastCycleIndex: { fitness: 100, culture: 84, yoga: 100, wellness: 100 },
        pod: { dietitian: 'u-sneha', fitness: 'u-vikram', yoga: 'u-lakshmi', mind: 'u-meera', doctor: 'u-kavya', admin: 'u-anita', opshead: 'u-sureshk' },
        /* Divya covers his Nutrition seat too while Sneha is out (lv-0) */
        podCover: { dietitian: { coverId: 'u-divya', from: isoIn(0), to: isoIn(1), leaveId: 'lv-0' } },
        trackers: { waterDone: 7, waterTarget: 8, steps: 9400, stepsTarget: 9000, sleep: '7 h 10 m', sleepPct: 96, mealsLogged: 3, mealsTarget: 3, screenMins: 48, screenTarget: 90,
          activeMins: 72, activeTarget: 60, actCal: 385, actCalTarget: 350, bmr: 1520,
          bed: '22:30', wake: '05:40', stages: { deep: 74, rem: 92, light: 248, awake: 16 },
          waterLog: ['06:20', '08:00', '10:15', '12:30', '14:45', '17:00', '19:30'],
          screenApps: [{ name: 'Messaging', mins: 20 }, { name: 'News', mins: 14 }, { name: 'Everything else', mins: 14 }],
          week: { steps: back(9000, 900).concat([8800, 9200, 9600, 8700, 9900, 9100]), water: back(7, 1, 8).concat([7, 8, 8, 7, 8, 8]), sleepPct: back(90, 6, 100).concat([88, 92, 95, 90, 94, 91]), screen: back(75, 20).concat([70, 60, 80, 55, 65, 60]),
            active: back(70, 10).concat([68, 72, 76, 66, 78, 71]), actCal: back(375, 55).concat([360, 385, 400, 355, 415, 380]) } },
        sessions: { fitness: { done: 4, target: 5, cancelled: 0 }, yoga: { done: 3, target: 3, cancelled: 0 }, mind: { done: 1, target: 1 } },
        compliance: 86, calendarProposed: true, track: 'active',
        health: ['Old ACL injury (left knee)'],
        culturePhotos: { uploaded: 29, of: 33, min: 25 },
        cycleKcal: 17890,
        goalLedger: [
          { level: 1, target: 'Walk 5 km comfortably', result: 'done', state: 'ok' },
          { level: 2, target: 'Jog 2 km, no knee pain', result: 'done', state: 'ok' },
          { level: 3, target: 'Run 5 km', result: 'done', state: 'ok' },
          { level: 4, target: 'Run 7 km', result: 'done', state: 'ok' },
          { level: 5, target: 'Run 8.5 km', state: 'cur' },
          { level: 6, target: 'Run 10 km easy', state: 'todo' },
          { level: 7, target: 'Race-day 10K', state: 'todo' },
        ],
        cycleHistory: [
          { cycle: 1, level: 1, target: 'Walk 5 km comfortably', result: 'done', outcome: 'achieved',
            sessions: { done: 8, target: 9 }, compliance: 80, index: { fitness: 78, culture: 74, yoga: 70, wellness: 100 } },
          { cycle: 2, level: 2, target: 'Jog 2 km, no knee pain', result: 'done', outcome: 'achieved',
            sessions: { done: 9, target: 9 }, compliance: 82, index: { fitness: 88, culture: 80, yoga: 90, wellness: 100 } },
          { cycle: 3, level: 3, target: 'Run 5 km', result: 'done', outcome: 'achieved',
            sessions: { done: 8, target: 9 }, compliance: 84, index: { fitness: 92, culture: 82, yoga: 95, wellness: 100 } },
          { cycle: 4, level: 4, target: 'Run 7 km', result: 'done', outcome: 'achieved',
            sessions: { done: 9, target: 9 }, compliance: 86, index: { fitness: 100, culture: 84, yoga: 100, wellness: 100 } },
        ],
      },
      {
        id: 'c-priya', userId: 'u-cl-priya', name: 'Priya K.', age: 38, sex: 'F',
        code: 'HV-0160', designation: 'Product Designer',
        gender: 'F', address: 'she/her',
        joinedISO: isoAgo(3), heightCm: 163, weightKg: 71.0,
        status: 'active', statusWhy: '', statusBy: null, statusAt: null,
        email: 'priya.k@example.in', emailOk: false, emailBy: null, emailAt: null,
        mobile: '+91 97460 41190', mobileOk: true, mobileBy: 'u-anita', mobileAt: msAgo(3 * 1440),
        location: 'Bengaluru, Karnataka',
        term: { days: 90, startISO: isoAgo(3), renewals: [] },
        log: [], meetings: [],
        dob: '1988-01-15', anniv: null, tzo: 5.5, tzLabel: 'IST',
        tier: 'HAALVING Poorna', plan: 'poorna', humanPillars: ['fitness', 'culture', 'yoga', 'wellness'], cycle: 1, day: 3, observation: true,
        goal: 'More energy through the workday', purpose: 'Stop running on coffee and cortisol.',
        levels: { fitness: 1, culture: 1, yoga: 1, wellness: 1 },
        moodLog: [], weightLog: [], reviewAns: {}, sessionFeedback: [],
        risk: 'low', riskWhy: 'observation day 3 of 5 — 7 of 10 meal photos received',
        pod: { dietitian: 'u-sneha', fitness: 'u-vikram', yoga: 'u-lakshmi', mind: 'u-meera', doctor: 'u-kavya', admin: 'u-anita', opshead: 'u-sureshk' },
        trackers: { waterDone: 3, waterTarget: 8, steps: 4200, stepsTarget: 7000, sleep: '6 h 05 m', sleepPct: 76, mealsLogged: 1, mealsTarget: 3, screenMins: 195, screenTarget: 180,
          activeMins: 24, activeTarget: 45, actCal: 135, actCalTarget: 300, bmr: 1340,
          bed: '00:15', wake: '06:20', stages: { deep: 46, rem: 68, light: 224, awake: 27 },
          waterLog: ['08:30', '13:10', '19:05'],
          screenApps: [{ name: 'Social', mins: 88 }, { name: 'Video', mins: 62 }, { name: 'Messaging', mins: 30 }, { name: 'Everything else', mins: 15 }],
          week: { steps: Array(14).fill(0).concat([0, 0, 0, 0, 3800, 4500]), water: Array(14).fill(0).concat([0, 0, 0, 0, 4, 5]), sleepPct: Array(14).fill(0).concat([0, 0, 0, 0, 72, 78]), screen: Array(14).fill(0).concat([0, 0, 0, 0, 240, 210]),
            active: Array(14).fill(0).concat([0, 0, 0, 0, 22, 26]), actCal: Array(14).fill(0).concat([0, 0, 0, 0, 120, 150]) } },
        sessions: { fitness: { done: 0, target: 5, cancelled: 0 }, yoga: { done: 0, target: 3, cancelled: 0 }, mind: { done: 0, target: 1 } },
        compliance: null, calendarProposed: false, track: 'sedentary',
        health: ['None reported'],
        culturePhotos: { uploaded: 7, of: 33, min: 25 },
      },
      {
        id: 'c-dev', userId: 'u-cl-dev', name: 'Dev K.', age: 34, sex: 'M',
        code: 'HV-0151', designation: 'Software Engineer',
        /* gender and sex deliberately differ here — this is the record that
           proves the two fields are not the same field. HV.vitals still reads
           `sex` for the lab bands; every screen reads `gender` and `address`. */
        gender: 'X', address: 'they/them',
        joinedISO: isoAgo(13), heightCm: 178, weightKg: 79.4,
        status: 'active', statusWhy: '', statusBy: null, statusAt: null,
        email: 'dev.k@example.in', emailOk: true, emailBy: 'u-anita', emailAt: msAgo(13 * 1440),
        mobile: '+91 98090 63317', mobileOk: true, mobileBy: 'u-anita', mobileAt: msAgo(13 * 1440),
        location: 'Kochi, Kerala',
        term: { days: 90, startISO: isoAgo(13), renewals: [] },
        log: [], meetings: [],
        /* Dubai-based — the one client whose session times shift off IST */
        dob: '1992-04-09', anniv: null, tzo: 4, tzLabel: 'GST',
        tier: 'HAALVING Svayam', plan: 'svayam', humanPillars: ['fitness'], cycle: 1, day: 8, observation: false,
        goal: 'Build strength without losing my mornings', purpose: 'Strong enough to carry my own gear on treks.',
        levels: { fitness: 1, culture: 2, yoga: 1, wellness: 1 },
        moodLog: [], weightLog: [], reviewAns: {}, sessionFeedback: [],
        risk: 'low', riskWhy: 'on pace — Svayam plan: AI day-to-day, Vikram on Fitness',
        pod: { fitness: 'u-vikram', admin: 'u-anita', opshead: 'u-sureshk' },
        trackers: { waterDone: 6, waterTarget: 8, steps: 7800, stepsTarget: 8000, sleep: '7 h 05 m', sleepPct: 92, mealsLogged: 2, mealsTarget: 3, screenMins: 82, screenTarget: 120,
          activeMins: 55, activeTarget: 60, actCal: 290, actCalTarget: 350, bmr: 1610,
          bed: '23:00', wake: '06:05', stages: { deep: 70, rem: 88, light: 248, awake: 19 },
          waterLog: ['07:00', '09:30', '12:00', '14:30', '17:15', '20:00'],
          screenApps: [{ name: 'Messaging', mins: 30 }, { name: 'Video', mins: 24 }, { name: 'News', mins: 18 }, { name: 'Everything else', mins: 10 }],
          week: { steps: back(7600, 1100).concat([8200, 7600, 6900, 8000, 7400, 8100]), water: back(6, 1, 8).concat([7, 6, 7, 5, 6, 7]), sleepPct: back(86, 7, 100).concat([85, 90, 82, 88, 91, 86]), screen: back(115, 30).concat([105, 90, 125, 100, 85, 110]),
            active: back(54, 9).concat([58, 54, 48, 56, 52, 57]), actCal: back(285, 50).concat([305, 285, 255, 295, 275, 300]) } },
        sessions: { fitness: { done: 3, target: 5, cancelled: 0 }, yoga: { done: 2, target: 3, cancelled: 0 }, mind: { done: 1, target: 1 } },
        compliance: 81, calendarProposed: false, track: 'moderate',
        health: ['None reported'],
        culturePhotos: { uploaded: 21, of: 33, min: 25 },
        cycleKcal: 14060,
        goalLedger: [
          { level: 1, target: 'Bands 3\u00d7 a week', state: 'cur' },
          { level: 2, target: 'Full-body 2\u00d7 + walk days', state: 'todo' },
          { level: 3, target: 'First weighted circuit', state: 'todo' },
          { level: 4, target: 'Carry 10 kg on a day hike', state: 'todo' },
          { level: 5, target: 'Strength benchmarks', state: 'todo' },
          { level: 6, target: 'Full trek kit, 5 km', state: 'todo' },
          { level: 7, target: 'Own-gear trek', state: 'todo' },
        ],
        cycleHistory: [],
      },
      {
        id: 'c-ananya', userId: 'u-cl-ananya', name: 'Ananya S.', age: 29, sex: 'F',
        code: 'HV-0155', designation: 'Content Strategist',
        gender: 'F', address: 'she/her',
        joinedISO: isoAgo(20), heightCm: 165, weightKg: 62.8,
        /* the paused client — a reason is mandatory, and this is what one
           looks like on the record */
        status: 'paused', statusWhy: 'Travelling for work — back 1 Sep',
        statusBy: 'u-anita', statusAt: msAgo(4 * 1440),
        email: 'ananya.s@example.in', emailOk: true, emailBy: 'u-anita', emailAt: msAgo(20 * 1440),
        mobile: '+91 94001 26834', mobileOk: false, mobileBy: null, mobileAt: null,
        location: 'Chennai, Tamil Nadu',
        term: { days: 90, startISO: isoAgo(20), renewals: [] },
        log: [], meetings: [],
        /* London-based — the second off-IST client */
        dob: '1997-05-27', anniv: null, tzo: 1, tzLabel: 'BST',
        tier: 'HAALVING Svayam', plan: 'svayam', humanPillars: [], cycle: 2, day: 4, observation: false,
        goal: 'Consistent energy, better sleep', purpose: 'Run my studio without running on empty.',
        levels: { fitness: 2, culture: 1, yoga: 2, wellness: 1 },
        moodLog: [], weightLog: [], reviewAns: {}, sessionFeedback: [],
        risk: 'low', riskWhy: 'AI-guided (Svayam) — no human pod',
        lastCycleIndex: { fitness: 55, culture: 70, yoga: 45, wellness: 60 },
        pod: {},
        trackers: { waterDone: 4, waterTarget: 8, steps: 5200, stepsTarget: 7000, sleep: '6 h 50 m', sleepPct: 86, mealsLogged: 2, mealsTarget: 3, screenMins: 132, screenTarget: 150,
          activeMins: 33, activeTarget: 50, actCal: 175, actCalTarget: 320, bmr: 1350,
          bed: '23:45', wake: '06:35', stages: { deep: 60, rem: 80, light: 246, awake: 24 },
          waterLog: ['08:15', '11:00', '14:20', '18:30'],
          screenApps: [{ name: 'Video', mins: 52 }, { name: 'Social', mins: 38 }, { name: 'Messaging', mins: 26 }, { name: 'Everything else', mins: 16 }],
          week: { steps: back(6000, 900).concat([6400, 5800, 6100, 5500, 6800, 5900]), water: back(5, 2, 8).concat([6, 5, 6, 4, 5, 6]), sleepPct: back(82, 8, 100).concat([80, 84, 78, 88, 82, 85]), screen: back(175, 45).concat([160, 145, 180, 150, 175, 140]),
            active: back(36, 8).concat([40, 34, 37, 32, 42, 35]), actCal: back(190, 45).concat([210, 180, 195, 170, 220, 185]) } },
        sessions: { fitness: { done: 2, target: 5, cancelled: 1 }, yoga: { done: 1, target: 3, cancelled: 0 }, mind: { done: 0, target: 1 } },
        compliance: 78, calendarProposed: false, track: 'sedentary',
        health: ['None reported'],
        culturePhotos: { uploaded: 11, of: 33, min: 25 },
        cycleKcal: 5310,
        goalLedger: [
          { level: 1, target: 'Sleep by 11:30', result: '8 of 11 nights', state: 'ok' },
          { level: 2, target: 'No-coffee afternoons', state: 'cur' },
          { level: 3, target: 'Morning light walk', state: 'todo' },
          { level: 4, target: 'Steady 7 h nights', state: 'todo' },
          { level: 5, target: 'Energy dips gone', state: 'todo' },
          { level: 6, target: 'Hold it for a full cycle', state: 'todo' },
          { level: 7, target: 'Studio weeks feel easy', state: 'todo' },
        ],
        cycleHistory: [
          { cycle: 1, level: 1, target: 'Sleep by 11:30', result: '8 of 11 nights', outcome: 'achieved',
            sessions: { done: 7, target: 9 }, compliance: 74, index: { fitness: 55, culture: 70, yoga: 45, wellness: 60 } },
        ],
      },
      /* Mathew — the longest-running client in the cast, built from a real
         77-day paper programme (goal sheet, monthly calendars, level progress
         reports, workout/yoga charts, customised L5 diet plan) with the
         identity anonymised. Active track; started May 9 at 71 kg chasing 66.
         Levels 1–4 cleared on rhythm; Level 5's kilo has carried across two
         cycles, and this third attempt is his best yet: 66.7 kg, 0.7 to go. */
      {
        id: 'c-mathew', userId: 'u-cl-mathew', name: 'Mathew', age: 59, sex: 'M',
        code: 'HV-0121', designation: 'Retired Bank Manager',
        gender: 'M', address: 'he/him',
        /* intake weight, not current: his weigh-in log reads 66.7 kg, and the
           Profile caption shows both. 88.6 was an invented figure that put a
           169 cm client at BMI 31 on arrival and implied 22 kg lost in eight
           cycles — 72.4 is the loss his own record supports. */
        joinedISO: isoAgo(96), heightCm: 169, weightKg: 72.4,
        /* the longest-standing client, and the one whose term has run out —
           the Renew path has to be reachable from a seeded record, not only
           after somebody edits a date by hand */
        status: 'inactive', statusWhy: 'Term lapsed — win-back call not yet made',
        statusBy: 'u-sureshk', statusAt: msAgo(2 * 1440),
        email: 'mathew@example.in', emailOk: true, emailBy: 'u-anita', emailAt: msAgo(96 * 1440),
        mobile: '+91 98461 55207', mobileOk: true, mobileBy: 'u-anita', mobileAt: msAgo(96 * 1440),
        location: 'Kottayam, Kerala',
        term: { days: 90, startISO: isoAgo(96), renewals: [] },
        log: [], meetings: [],
        dob: '1966-11-30', anniv: '1993-10-02', tzo: 5.5, tzLabel: 'IST',
        /* day 8 with no weigh-in logged this cycle — the Day-8 automation
           demos on his login the moment Today renders */
        tier: 'HAALVING Poorna', plan: 'poorna', humanPillars: ['fitness', 'culture', 'yoga', 'wellness'], cycle: 8, day: 8, observation: false,
        goal: '5 kg fat loss — body fat 33.4% down to 29%', purpose: 'Walk into 60 fitter than I left 50.',
        levels: { fitness: 5, culture: 5, yoga: 5, wellness: 5 },
        moods: { '8.2': 'happy', '8.3': 'happy', '8.5': 'drained', '8.7': 'happy' },
        moodLog: [
          { cy: 8, d: 2, min: 500, mood: 'happy' },
          { cy: 8, d: 3, min: 480, mood: 'happy', note: 'Half moon without the wall' },
          { cy: 8, d: 5, min: 1150, mood: 'drained', note: 'Long day on the site' },
          { cy: 8, d: 7, min: 460, mood: 'happy' },
        ],
        /* day-8 weigh-ins for cycles 6 and 7; cycle 8's is deliberately
           missing — that gap is what arms the weigh-in prompt */
        weightLog: [
          { cy: 6, day: 8, kg: 67.2, ts: msAgo(25 * 1440) },
          { cy: 7, day: 8, kg: 66.7, ts: msAgo(12 * 1440) },
        ],
        reviewAns: {}, sessionFeedback: [],
        risk: 'medium', riskWhy: 'Level 5 target carried twice — 0.7 kg to go, best attempt yet underway',
        lastCycleIndex: { fitness: 78, culture: 84, yoga: 62, wellness: 90 },
        pod: { dietitian: 'u-sneha', fitness: 'u-vikram', yoga: 'u-lakshmi', mind: 'u-meera', doctor: 'u-kavya', admin: 'u-anita', opshead: 'u-sureshk' },
        trackers: { waterDone: 6, waterTarget: 8, steps: 8400, stepsTarget: 12000, sleep: '7 h 20 m', sleepPct: 96, mealsLogged: 2, mealsTarget: 3, screenMins: 38, screenTarget: 60,
          activeMins: 61, activeTarget: 75, actCal: 330, actCalTarget: 450, bmr: 1690,
          bed: '22:15', wake: '05:35', stages: { deep: 78, rem: 96, light: 250, awake: 16 },
          waterLog: ['05:50', '07:30', '10:00', '13:15', '16:40', '19:20'],
          screenApps: [{ name: 'Messaging', mins: 16 }, { name: 'News', mins: 12 }, { name: 'Everything else', mins: 10 }],
          week: { steps: back(11400, 2200).concat([12100, 13400, 9800, 12600, 11900, 12800]), water: back(7, 1, 8).concat([7, 8, 6, 8, 7, 7]), sleepPct: back(88, 8, 100).concat([90, 94, 86, 92, 95, 91]), screen: back(70, 25).concat([55, 40, 70, 45, 50, 42]),
            active: back(68, 14).concat([74, 80, 58, 76, 72, 78]), actCal: back(390, 80).concat([420, 455, 340, 435, 410, 440]) } },
        sessions: { fitness: { done: 1, target: 5, cancelled: 0 }, yoga: { done: 1, target: 3, cancelled: 0 }, mind: { done: 0, target: 1 } },
        compliance: 88, calendarProposed: false, track: 'active',
        health: ['High visceral fat at intake (grade 12)', 'No medical conditions reported'],
        culturePhotos: { uploaded: 8, of: 33, min: 25 },
        cycleKcal: 3760,
        goalLedger: [
          { level: 1, target: '−0.5 kg', result: '−0.6 kg', state: 'ok' },
          { level: 2, target: '−0.5 kg', result: '−0.5 kg', state: 'ok' },
          { level: 3, target: '−1.0 kg', result: '−1.0 kg', state: 'ok' },
          { level: 4, target: '−1.0 kg', result: '−1.1 kg', state: 'ok' },
          { level: 5, target: '−1.0 kg', result: '−1.1 kg across 2 carries', state: 'cur' },
          { level: 6, target: '−0.5 kg', state: 'todo' },
          { level: 7, target: '−0.5 kg', state: 'todo' },
        ],
        cycleHistory: [
          { cycle: 1, level: 1, target: '−0.5 kg', result: '−0.6 kg', outcome: 'achieved',
            sessions: { done: 7, target: 9 }, compliance: 74, index: { fitness: 58, culture: 66, yoga: 48, wellness: 72 } },
          { cycle: 2, level: 2, target: '−0.5 kg', result: '−0.5 kg', outcome: 'achieved',
            sessions: { done: 6, target: 9 }, compliance: 71, index: { fitness: 62, culture: 70, yoga: 50, wellness: 76 } },
          { cycle: 3, level: 3, target: '−1.0 kg', result: '−1.0 kg', outcome: 'achieved',
            sessions: { done: 6, target: 9 }, compliance: 75, index: { fitness: 66, culture: 72, yoga: 55, wellness: 80 } },
          { cycle: 4, level: 4, target: '−1.0 kg', result: '−1.1 kg', outcome: 'achieved',
            sessions: { done: 7, target: 9 }, compliance: 79, index: { fitness: 70, culture: 76, yoga: 58, wellness: 84 } },
          { cycle: 5, level: 5, target: '−1.0 kg', result: '−0.4 kg', outcome: 'continued',
            sessions: { done: 7, target: 9 }, compliance: 76, index: { fitness: 72, culture: 78, yoga: 60, wellness: 86 } },
          { cycle: 6, level: 5, target: '−1.0 kg', result: '−0.2 kg', outcome: 'continued',
            sessions: { done: 5, target: 9 }, compliance: 62, index: { fitness: 64, culture: 70, yoga: 52, wellness: 82 } },
          { cycle: 7, level: 5, target: '−1.0 kg', result: '−0.5 kg', outcome: 'continued',
            sessions: { done: 8, target: 9 }, compliance: 88, index: { fitness: 78, culture: 84, yoga: 62, wellness: 90 } },
        ],
      },
    ],

    /* ---- meals: the star-rating pipeline ---- */
    meals: [
      { id: 'm-raj-lunch', clientId: 'c-rajesh', slot: 'Lunch', emoji: '', capturedMinsAgo: 14, fullness: 'Just right',
        photo: 'img/food/m-raj-lunch.webp',
        dishes: ['Dal tadka', 'Jeera rice', 'Papad'],
        ai: { stars: 3, conf: 82, detected: ['Dal tadka', 'Jeera rice', 'Papad'], note: 'Rice instead of phulka; fried papad.' },
        /* ts is the SLA clock (HV.slaLeft); slaMin stays as the legacy label.
           Five minutes old at boot — inside the reply target, nudge pending. */
        final: null, protein: 22, kcal: 610, slaMin: 46, ts: msAgo(5) },
      { id: 'm-priya-bf', clientId: 'c-priya', slot: 'Breakfast', emoji: '', capturedMinsAgo: 95, fullness: 'Light',
        photo: 'img/food/m-priya-bf.webp',
        dishes: ['Poha', 'Peanuts', 'Chai'],
        ai: { stars: 4, conf: 88, detected: ['Poha', 'Peanuts', 'Chai with sugar'], note: 'Observation period — capture only, no rating shown to client.' },
        final: null, protein: 14, kcal: 420, slaMin: -35 },
      { id: 'm-raj-bf', clientId: 'c-rajesh', slot: 'Breakfast', emoji: '', capturedMinsAgo: 300, fullness: 'Just right',
        photo: 'img/food/m-raj-bf.webp',
        dishes: ['Besan chilla', 'Mint chutney'],
        ai: { stars: 4, conf: 90, detected: ['Besan chilla', 'Mint chutney'], note: 'Good protein start.' },
        final: { stars: 4, byId: 'u-sneha', voiceSec: 22, note: 'Lovely start, Rajesh! One tweak: swap the fried papad at lunch.',
                 rubric: { 'Plan match': '2 / 2 stars', 'Portion': '1 / 1 stars', 'Quality': '0 / 1 stars · fried item', 'Timing': '1 / 1 stars' } },
        protein: 24, kcal: 380, slaMin: null },
      { id: 'm-sur-lunch', clientId: 'c-sureshp', slot: 'Lunch', emoji: '', capturedMinsAgo: 120, fullness: 'Just right',
        photo: 'img/food/m-sur-lunch.webp',
        dishes: ['Ragi roti', 'Palak paneer', 'Salad'],
        ai: { stars: 5, conf: 93, detected: ['Ragi roti', 'Palak paneer', 'Salad'], note: 'Matches plan fully.' },
        final: { stars: 5, byId: 'u-sneha', voiceSec: 0, note: 'Perfect plate — nothing to correct.',
                 rubric: { 'Plan match': '2 / 2 stars', 'Portion': '1 / 1 stars', 'Quality': '1 / 1 stars', 'Timing': '1 / 1 stars' } },
        protein: 31, kcal: 540, slaMin: null },
      { id: 'm-ana-bf', clientId: 'c-ananya', slot: 'Breakfast', emoji: '', capturedMinsAgo: 210, fullness: 'Just right',
        photo: 'img/food/m-ana-bf.webp',
        dishes: ['Moong dosa', 'Avocado', 'Buttermilk'],
        ai: { stars: 5, conf: 91, detected: ['Moong dosa', 'Avocado', 'Buttermilk'], note: 'Great protein + fibre start.' },
        final: { stars: 5, byId: 'u-ai', voiceSec: 0, note: 'Rated instantly by your AI coach — great protein + fibre start.',
                 rubric: { 'Plan match': '2 / 2 stars', 'Portion': '1 / 1 stars', 'Quality': '1 / 1 stars', 'Timing': '1 / 1 stars' } },
        protein: 21, kcal: 430, slaMin: null },
      { id: 'm-dev-lunch', clientId: 'c-dev', slot: 'Lunch', emoji: '', capturedMinsAgo: 80, fullness: 'Just right',
        photo: 'img/food/m-dev-lunch.webp',
        dishes: ['Millet bowl', 'Chana', 'Curd'],
        ai: { stars: 4, conf: 89, detected: ['Millet bowl', 'Chana', 'Curd'], note: 'Curd portion slightly large.' },
        final: { stars: 4, byId: 'u-ai', voiceSec: 0, note: 'Rated by your AI coach — solid plate; watch the curd portion.',
                 rubric: { 'Plan match': '2 / 2 stars', 'Portion': '0 / 1 stars · curd portion', 'Quality': '1 / 1 stars', 'Timing': '1 / 1 stars' } },
        protein: 27, kcal: 560, slaMin: null },
      { id: 'm-mat-bf', clientId: 'c-mathew', slot: 'Breakfast', emoji: '', capturedMinsAgo: 510, fullness: 'Just right',
        photo: 'img/food/m-mat-bf.webp',
        dishes: ['Wheat dosa', 'Green gram salad', 'Chicken curry', 'Pomegranate'],
        ai: { stars: 5, conf: 92, detected: ['Wheat dosa', 'Green gram salad', 'Chicken curry', 'Pomegranate'], note: 'Matches the Tuesday plan line exactly — fibre first.' },
        final: { stars: 5, byId: 'u-sneha', voiceSec: 16, note: 'Fifth clean breakfast in a row, Mathew — the kilo is coming.',
                 rubric: { 'Plan match': '2 / 2 stars', 'Portion': '1 / 1 stars', 'Quality': '1 / 1 stars', 'Timing': '1 / 1 stars' } },
        protein: 28, kcal: 390, slaMin: null },
      { id: 'm-mat-lunch', clientId: 'c-mathew', slot: 'Lunch', emoji: '', capturedMinsAgo: 270, fullness: 'Just right',
        photo: 'img/food/m-mat-lunch.webp',
        dishes: ['Foxtail millet', 'Veg thoran', 'Chicken curry'],
        ai: { stars: 4, conf: 88, detected: ['Foxtail millet', 'Veg thoran', 'Chicken curry'], note: 'Millet portion reads closer to 200 g than the planned 150 g.' },
        /* thirty-five minutes old at boot — past both the nudge (10) and the
           escalation (25), so the SLA ladder demos fully on first sweep */
        final: null, protein: 34, kcal: 520, slaMin: 38, ts: msAgo(35) },
    ],

    /* ---- 11-day level calendar (SOP 7/11: fitness/yoga alternate, 9 session days + 2 active rest) ---- */
    /* calendars: REMOVED. A client's days are no longer hand-seeded —
       HV.calendarFor derives them from the per-pillar templates their
       coaches assign (finding F2). calendarsPast below STAYS: those
       cycles already ran, often at a different level under a different
       template, and deriving them from today's assignment would be a lie. */

    /* proposed next-cycle calendar (client must confirm — PL-12) */
    proposedCalendars: {
      'c-sureshp': { cycle: 6, note: '5 fitness + 3 yoga + 1 mind — alternate days, 9 session + 2 active rest', confirmed: false },
    },

    /* ---- plans (PL-06..09 content, per client) ---- */
    plans: {
      'c-rajesh': {
        fitness: { title: 'Workout Chart · L3 · Cycle 3', by: 'u-vikram', lines: ['2 × strength (resistance bands, home)', '2 × mobility + cardio', '1 × assessment-lite', 'Excludes overhead loading — shoulder flag from Health Summary'] },
        culture: { title: 'Diet Plan · L2 · Cycle 3', by: 'u-sneha', lines: ['Breakfast: besan chilla / moong dosa', 'Lunch: phulka + dal + sabzi (no fried sides)', 'Dinner: early, light — soup + millet', 'Plant-forward; sweets on Sunday only'] },
        yoga: { title: 'Yoga Chart · L3 · Cycle 3', by: 'u-lakshmi', lines: ['Hatha basics + breath work', 'Flow & balance', 'Spine care sequence'] },
        wellness: { title: 'Mind Session · Cycle 3', by: 'u-meera', lines: ['1 × guided downshift (20 min)', 'Nightly wind-down breath (2 min, optional)'] },
      },
      'c-sureshp': {
        fitness: { title: 'Workout Chart · L5 · Cycle 5', by: 'u-vikram', lines: ['Tempo + interval runs', 'Lower-body strength', 'Knee-safe loading — ACL flag respected'] },
        culture: { title: 'Diet Plan · L4 · Cycle 5', by: 'u-sneha', lines: ['Endurance fuelling plan', 'Ragi + paneer rotation', 'Hydration ladder on run days'] },
        yoga: { title: 'Yoga Chart · L5 · Cycle 5', by: 'u-lakshmi', lines: ['Runner’s yoga', 'Hip mobility', 'Recovery flow'] },
        wellness: { title: 'Mind Session · Cycle 5', by: 'u-meera', lines: ['1 × race-day visualisation (20 min)'] },
      },
      'c-dev': {
        fitness: { title: 'Workout Chart · L1 · Cycle 1', by: 'u-vikram', lines: ['Form & foundations block', 'Strength A/B/C rotation', 'Tempo work for squat depth (AI-flagged, Vikram-confirmed)'] },
        culture: { title: 'Diet Plan · L2 · Cycle 1 (AI)', by: 'u-ai', lines: ['Millet-forward lunches', 'Protein at every meal', 'Instant AI star ratings on photos'] },
        yoga: { title: 'Yoga Chart · L1 · Cycle 1 (AI-guided)', by: 'u-ai', lines: ['Guided mobility flows', 'Breath & spine basics'] },
        wellness: { title: 'Mind Session · Cycle 1 (AI-guided)', by: 'u-ai', lines: ['1 × guided downshift (15 min)'] },
      },
      'c-ananya': {
        fitness: { title: 'Workout Chart · L2 · Cycle 2 (AI)', by: 'u-ai', lines: ['Guided bodyweight sessions', 'Strength basics + intervals'] },
        culture: { title: 'Diet Plan · L1 · Cycle 2 (AI)', by: 'u-ai', lines: ['Protein + fibre breakfasts', 'Instant AI star ratings', 'Hydration ladder to 8 glasses'] },
        yoga: { title: 'Yoga Chart · L2 · Cycle 2 (AI)', by: 'u-ai', lines: ['Guided morning flows', 'Evening 20-min flow'] },
        wellness: { title: 'Mind Session · Cycle 2 (AI)', by: 'u-ai', lines: ['1 × AI mind session', 'Nightly wind-down at 10:30'] },
      },
      'c-mathew': {
        fitness: { title: 'Workout Chart · L5 · Cycle 8', by: 'u-vikram', lines: ['Push: chest presses + triceps, 12.5–17.5 kg', 'Pull: lat pulldown + rows, 45–55 kg', 'Legs: back squat, RDL, calf raises', 'Every session 3 × 15 — warm-up first, stretch to close', 'Plank finisher — 3 × 1-min holds'] },
        culture: { title: 'Diet Plan · L5 · Cycle 8', by: 'u-sneha', lines: ['1,400 kcal · 90 g protein a day', 'Wake-up drink rotation + 1 tsp ghee after', 'Two-meal days twice a week — the L5 pattern', 'Dinner by 7 pm — 14-hour window', 'No white rice, red meat, maida or fried food'] },
        yoga: { title: 'Yoga Chart · L5 · Cycle 8', by: 'u-lakshmi', lines: ['Sun Salutation × 5 opens every session', 'Warrior series + triangle standing work', 'Balance: half moon, eagle, chair', 'Camel, bridge & variations to close the week'] },
        wellness: { title: 'Mind Session · Cycle 8', by: 'u-meera', lines: ['1 × session, client’s choice: guided downshift or yoga-led', 'Screen cap 1 h · sleep 7–8 h'] },
      },
    },

    /* ---- today's plate. Modelled on the real pre-diet plan format (Dt. Anfia,
       Rawmaterials/Biju Pre Diet Plan): every slot carries its clock time, its
       calorie and protein yield, and the fibre → protein → carbs order the
       client is taught to eat in. `swap` is the "choose any one" column, so a
       client who has no chickpeas can still eat on plan. `photo: true` marks
       the slots the star rating runs on — three of them, which is where the
       "log 3 meal photos" target comes from. Observation clients have no plan
       by design: days 1–5 we watch, we do not prescribe. ---- */
    mealPlans: {
      'c-rajesh': { by: 'u-sneha', title: 'Diet Plan · L2 · Cycle 3', kcal: 1400, protein: 73,
        slots: [
          { slot: 'Morning drink', time: '6:00 am', dish: 'Anti-inflammatory drink · 300 ml',
            parts: [{ k: 'Make it', v: '½ tsp turmeric + a pinch of pepper and pink salt + ½ lime in warm water' }],
            swap: 'Warm fenugreek water 1 tsp · boiled jeera water ½ tsp · cinnamon–lemon–ginger infused water' },
          { slot: 'Breakfast', time: '9:00 am', kcal: 350, protein: 20, dish: 'Besan chilla + mint chutney', photo: true,
            parts: [{ k: 'Fibre', v: '1 tbsp chia or flax powder, or ½ cup mixed berries' },
                    { k: 'Protein', v: 'Boiled chickpeas 100 g + 2 boiled eggs' },
                    { k: 'Carbs', v: 'Oats 60 g' }],
            swap: 'Puttu ½ cylinder · appam 2 · whole-grain bread 3 slices · sweet potato 120 g' },
          { slot: 'Mid-day snack', time: '11:30 am', kcal: 150, dish: 'Carrot juice 240 ml + 1 apple',
            swap: '1 orange + 15 soaked almonds · papaya 120 g + 5 walnuts' },
          { slot: 'Lunch', time: '1:00 pm', kcal: 400, protein: 30, dish: 'Phulka, dal, sabzi', photo: true,
            parts: [{ k: 'Fibre', v: 'Leafy greens, or sambar / avial / thoran' },
                    { k: 'Protein', v: 'Masoor dal 200 g + natholi 60 g' },
                    { k: 'Carbs', v: 'Chapati 2, or brown rice 150 g' }],
            note: 'No pickles, deep-fried items or creamy gravies',
            swap: 'Tuna 100 g · mackerel 130 g · chicken breast 100 g' },
          { slot: 'Pre-workout', time: '5:00 pm', kcal: 150, dish: 'Roasted chana + green tea',
            swap: '1 banana + 200 ml black coffee · 1 apple + 2 dates · 2 brown bread + 2 tsp peanut butter' },
          { slot: 'Dinner', time: '7:00 pm', kcal: 350, protein: 20, dish: 'Millet soup + sautéed greens', photo: true,
            parts: [{ k: 'Fibre', v: 'Cucumber, carrot, broccoli, beans — as stew, sambar or salad' },
                    { k: 'Protein', v: 'Grilled fish 100 g, or paneer 80 g' }],
            note: 'Finish by 7 pm — nothing after' },
        ] },
      'c-sureshp': { by: 'u-sneha', title: 'Diet Plan · L4 · Cycle 5', kcal: 2100, protein: 95,
        slots: [
          { slot: 'Morning drink', time: '5:30 am', dish: 'Warm jeera water + 4 soaked almonds' },
          { slot: 'Breakfast', time: '9:00 am', kcal: 480, protein: 26, dish: 'Oats 60 g, peanut butter, banana', photo: true,
            parts: [{ k: 'Fibre', v: 'Banana + 1 tbsp flax powder' },
                    { k: 'Protein', v: 'Greek yoghurt 120 g + 2 egg whites' },
                    { k: 'Carbs', v: 'Oats 60 g' }],
            note: 'Endurance fuelling — eat within an hour of the run' },
          { slot: 'Lunch', time: '1:00 pm', kcal: 620, protein: 34, dish: 'Ragi roti, palak paneer, salad', photo: true,
            parts: [{ k: 'Fibre', v: 'Salad + sambar' }, { k: 'Protein', v: 'Paneer 100 g' }, { k: 'Carbs', v: 'Ragi roti 2' }] },
          { slot: 'Pre-workout', time: '4:30 pm', kcal: 180, dish: 'Buttermilk + 6 almonds' },
          { slot: 'Dinner', time: '7:00 pm', kcal: 520, protein: 28, dish: 'Paneer bhurji + sautéed veg', photo: true,
            note: '14-hour fasting window starts at 7 pm' },
        ] },
      'c-dev': { by: 'u-ai', title: 'Diet Plan · L2 · Cycle 1 (AI)', kcal: 1900, protein: 88,
        slots: [
          { slot: 'Morning drink', time: '6:30 am', dish: 'Warm lime water · 300 ml on waking' },
          { slot: 'Breakfast', time: '9:00 am', kcal: 450, protein: 24, dish: 'Egg bhurji + multigrain toast', photo: true,
            parts: [{ k: 'Fibre', v: 'Tomato, onion, capsicum in the bhurji' },
                    { k: 'Protein', v: '3 eggs' }, { k: 'Carbs', v: 'Multigrain toast 2 slices' }] },
          { slot: 'Lunch', time: '1:30 pm', kcal: 560, protein: 30, dish: 'Millet bowl, chana, curd', photo: true,
            parts: [{ k: 'Fibre', v: 'Cabbage–carrot thoran' }, { k: 'Protein', v: 'Chana 150 g + curd 100 g' },
                    { k: 'Carbs', v: 'Millet 120 g' }],
            note: 'Watch the curd portion — one small bowl' },
          { slot: 'Snack', time: '5:00 pm', kcal: 160, dish: 'Sprouts chaat' },
          { slot: 'Dinner', time: '7:30 pm', kcal: 480, protein: 26, dish: 'Grilled paneer + stir-fried veg', photo: true },
        ] },
      'c-ananya': { by: 'u-ai', title: 'Diet Plan · L1 · Cycle 2 (AI)', kcal: 1500, protein: 70,
        slots: [
          { slot: 'Morning drink', time: '7:00 am', dish: '300 ml water on waking',
            note: 'Level 1 habit — before anything else' },
          { slot: 'Breakfast', time: '9:00 am', kcal: 400, protein: 21, dish: 'Moong dosa, avocado, buttermilk', photo: true,
            parts: [{ k: 'Fibre', v: 'Avocado ½' }, { k: 'Protein', v: 'Moong batter + buttermilk' },
                    { k: 'Carbs', v: 'Dosa 2' }] },
          { slot: 'Lunch', time: '1:00 pm', kcal: 450, protein: 24, dish: 'Brown rice, rajma, cucumber salad', photo: true,
            parts: [{ k: 'Fibre', v: 'Cucumber salad' }, { k: 'Protein', v: 'Rajma 150 g' },
                    { k: 'Carbs', v: 'Brown rice 120 g' }] },
          { slot: 'Snack', time: '5:00 pm', kcal: 140, dish: 'Fruit + roasted seeds' },
          { slot: 'Dinner', time: '7:00 pm', kcal: 380, protein: 20, dish: 'Vegetable khichdi + curd', photo: true },
        ] },
      /* Mathew's plate is the real customised L5 document, Tuesday's rotation:
         1,400 kcal · 90 g protein, a six-drink wake-up rotation, and the
         pre-workout slot the paper plan carries. */
      'c-mathew': { by: 'u-sneha', title: 'Diet Plan · L5 · Cycle 8', kcal: 1400, protein: 90,
        slots: [
          { slot: 'Wake-up drink', time: '6:00 am', dish: 'Beetroot water with mint · 300 ml',
            parts: [{ k: 'After', v: '1 tsp ghee once the drink is down' }],
            swap: 'Soaked chia in warm lemon water · chamomile tea · ash gourd–turmeric–ginger drink · flax + chia water · ginger, turmeric & pepper water' },
          { slot: 'Breakfast', time: '9:00 am', kcal: 400, protein: 30, dish: 'Wheat dosa + chicken curry 80 g', photo: true,
            parts: [{ k: 'Fibre', v: 'Green gram salad 50 g + pomegranate 70 g' },
                    { k: 'Protein', v: 'Chicken curry 80 g' },
                    { k: 'Carbs', v: 'Chapati or wheat dosa 1' }],
            swap: 'Omelette (2 whole + 3 whites) + chana salad · millet dosa 2 + chicken curry · overnight oats + Greek yogurt + 2 boiled eggs' },
          { slot: 'Lunch', time: '12:00 pm', kcal: 500, protein: 35, dish: 'Foxtail millet 150 g + chicken curry 100 g', photo: true,
            parts: [{ k: 'Fibre', v: 'Veg thoran 80 g' },
                    { k: 'Protein', v: 'Chicken curry 100 g' },
                    { k: 'Carbs', v: 'Quinoa or foxtail millet, 150 g cooked' }],
            note: 'No gravies, white rice or fried sides',
            swap: 'Brown rice 150 g + fish curry · chapati 2 + moong dal + soya chunks · pesarattu dosa 2 + sambar + omelette' },
          { slot: 'Pre-workout', time: '4:30 pm', kcal: 100, protein: 5, dish: 'Black coffee + banana + 1 egg white',
            swap: 'Black coffee + roasted chana 20 g · apple + almonds 10 g' },
          { slot: 'Dinner', time: '7:00 pm', kcal: 330, protein: 25, dish: 'Grilled chicken salad 100 g + yoghurt 30 g', photo: true,
            parts: [{ k: 'Fibre', v: 'Mixed vegetables — spinach three times a week' },
                    { k: 'Protein', v: 'Grilled chicken 100 g + yoghurt 30 g' }],
            note: 'Finish by 7 pm — the 14-hour window starts here' },
        ] },
    },

    /* ---- the Nutrient Panel's reference table (NP-01) — the Vital Panel's
       sibling: the lab reads what the body holds, this reads what the plates
       put in. Targets are ICMR-flavoured adult daily needs — facts about a
       day, not about any one client. `bias` is the story: the fraction of its
       target this demo kitchen typically delivers, so the panel reads
       coherently (vitamin D low — a plate cannot carry it; sodium over — a
       home kitchen usually is) rather than as random noise. Macro targets are
       not stored — they derive from each client's own meal plan: protein is
       the plan's number, carbs and fat take `split` shares of its kcal,
       fibre runs per 1,000 kcal. ---- */
    nutrition: {
      split: { carbs: 0.50, fat: 0.27 },
      fibrePer1000: 14,
      macroBias: { protein: 0.94, carbs: 1.06, fat: 1.02, fibre: 0.84 },
      micros: [
        { k: 'vita',   name: 'Vitamin A',   unit: 'µg', target: 840,  bias: 0.96, group: 'vitamin' },
        { k: 'b12',    name: 'Vitamin B12', unit: 'µg', target: 2.2,  bias: 0.70, group: 'vitamin' },
        { k: 'vitc',   name: 'Vitamin C',   unit: 'mg', target: 80,   bias: 1.12, group: 'vitamin' },
        { k: 'vitd',   name: 'Vitamin D',   unit: 'µg', target: 15,   bias: 0.40, group: 'vitamin' },
        { k: 'folate', name: 'Folate',      unit: 'µg', target: 300,  bias: 1.02, group: 'vitamin' },
        { k: 'iron',   name: 'Iron',        unit: 'mg', target: 19,   bias: 0.80, group: 'mineral' },
        { k: 'calc',   name: 'Calcium',     unit: 'mg', target: 1000, bias: 0.90, group: 'mineral' },
        { k: 'magn',   name: 'Magnesium',   unit: 'mg', target: 385,  bias: 1.00, group: 'mineral' },
        { k: 'zinc',   name: 'Zinc',        unit: 'mg', target: 14,   bias: 0.86, group: 'mineral' },
        { k: 'pot',    name: 'Potassium',   unit: 'mg', target: 3500, bias: 0.88, group: 'mineral' },
        { k: 'sod',    name: 'Sodium',      unit: 'mg', target: 2000, bias: 1.35, group: 'mineral' },
      ],
    },

    /* ---- the 7-level programme books, transcribed from Rawmaterials:
       "7 LEVELS FITNESS/YOGA … Professionals" and "7 LEVELS OF HAALVING
       CULTURE …". Shape is track → level → what today actually asks. Fitness
       and yoga prescriptions differ by track, so the demo carries the two
       tracks its client logins use and falls back to sedentary otherwise.
       `demos` are the illustrated moves in the level book — each one becomes a
       video link on Today, because a rep count nobody can picture is not a
       prescription. Yoga is delivered live, so every yoga level carries a room. ---- */
    program: {
      fitness: {
        sedentary: {
          1: { phase: 'Foundation Phase', tag: 'Awakening muscles & form correction',
               goal: 'Establish baseline fitness, activate muscles, improve basic endurance and stamina.',
               intensity: '0–10% · low-impact, technique and muscle activation',
               rpe: 'Very light (RPE 2–3)', steps: '5,000 steps', water: '2.0–3.0 L', screen: '2–2.5 h with movement breaks',
               home: { mins: 15, sets: [
                 { k: 'Strength', name: 'Chair sit-to-stand', dose: '8–10 reps' },
                 { k: 'Muscle', name: 'Wall push-ups', dose: '8 reps' },
                 { k: 'Endurance', name: 'Seated marching', dose: '20–30 sec' },
                 { k: 'Cardio', name: 'Slow walking', dose: '5–10 min' }],
                 demos: ['Neck circles', 'Arm rotation', 'Seated marching', 'Seated calf raise'] },
               gym: { mins: 15, line: 'Leg press 8 reps (10–20%) · Chest press machine 8 reps · Seated row 8 reps · Cycle, no resistance, 5–7 min' } },
          2: { phase: 'Activation & Rebuild Phase', tag: 'Introducing strength & endurance',
               goal: 'Begin building muscle strength and cardiovascular endurance with light resistance.',
               intensity: '10–20% · gradual progression',
               rpe: 'Very light–Light (RPE 3)', steps: '8,000–10,000 steps', water: '2.5–3.0 L', screen: '2 h with movement breaks',
               home: { mins: 20, sets: [
                 { k: 'Strength', name: 'Sit-to-stand', dose: '10 reps' },
                 { k: 'Muscle', name: 'Wall push-ups', dose: '10 reps' },
                 { k: 'Endurance', name: 'Heel raises', dose: '10–12 reps' },
                 { k: 'Cardio', name: 'Walking', dose: '10–12 min' }],
                 demos: ['Bird dog', 'Wall push-up', 'Standing side leg raise', 'Half squat'] },
               gym: { mins: 45, line: 'Leg press 10 reps (20–30%) · Lat pulldown 10 reps light · Seated row 10 reps · Cycle 8–10 min' } },
          3: { phase: 'Strength & Healing Phase', tag: 'Effective strength & stamina',
               goal: 'Enhance functional strength and muscular stamina for everyday movement.',
               intensity: '20–30% · moderate resistance, basic functional movements',
               rpe: 'Light (RPE 3–4)', steps: '10,000 steps', water: '2.5–3.0 L', screen: '1.5 h to maximise active time',
               home: { mins: 25, sets: [
                 { k: 'Strength', name: 'Supported squats', dose: '10–12 reps' },
                 { k: 'Muscle', name: 'Incline push-ups', dose: '10 reps' },
                 { k: 'Endurance', name: 'Step touch', dose: '30–40 sec' },
                 { k: 'Cardio', name: 'Walking', dose: '12–15 min' }],
                 demos: ['Arm circles', 'Dead bug', 'Knee plank', 'Glute bridge'] },
               gym: { mins: 45, line: 'Leg press 10–12 reps (30–40%) · Chest press 10 reps · Cable row 10 reps · Treadmill walk 10–12 min' } },
          4: { phase: 'Happy Energy Phase', tag: 'Strength & endurance development',
               goal: 'Build significant muscle strength and cardiovascular endurance.',
               intensity: '30–45% · heavier resistance with aerobic intervals',
               rpe: 'Light–Moderate (RPE 4–5)', steps: '10,000–12,000 steps', water: '3.0–3.5 L', screen: '1 h',
               home: { mins: 30, sets: [
                 { k: 'Strength', name: 'Half squats', dose: '12–15 reps' },
                 { k: 'Muscle', name: 'Incline push-ups', dose: '12 reps' },
                 { k: 'Endurance', name: 'Step-ups, low height', dose: '8 per leg' },
                 { k: 'Cardio', name: 'Brisk walk', dose: '15–20 min' }],
                 demos: ['Push-up', 'March with arm swings', 'Full squat', 'Incline push-up'] },
               gym: { mins: 45, line: 'Leg press 10 reps (40–50%) · Machine chest press 10–12 reps · Lat pulldown 10–12 reps · Cycling 12–15 min' } },
          5: { phase: 'Habit Transition Phase', tag: 'Advanced strength & endurance conditioning',
               goal: 'Improve muscular strength and dynamic endurance for higher activity levels.',
               intensity: '45–60% · compound lifts, dynamic endurance training',
               rpe: 'Moderate (RPE 5–6)', steps: '12,000–15,000 steps', water: '3.0–3.5 L', screen: '1 h with active breaks',
               home: { mins: 35, sets: [
                 { k: 'Strength', name: 'Static lunges', dose: '10 per leg' },
                 { k: 'Muscle', name: 'Burpees, level 2', dose: '8 reps' },
                 { k: 'Endurance', name: 'Plank', dose: '40–60 sec' },
                 { k: 'Cardio', name: 'Brisk walk', dose: '20 min' }],
                 demos: ['Static lunges', 'Burpee level 2', 'Plank', 'Single leg hip thrust'] },
               gym: { mins: 45, line: 'Barbell squat · Dumbbell shrug · Dumbbell shoulder press · Incline treadmill walk' } },
          6: { phase: 'Sustainable Phase', tag: 'Maximising performance',
               goal: 'Optimise strength, endurance and stamina for peak functional performance.',
               intensity: '60–80% · sport-specific drills and interval training',
               rpe: 'Moderate–High (RPE 6–7)', steps: '12,000–15,000+ steps', water: '3.0–3.5 L', screen: '1 h, prioritising sleep',
               home: { mins: 40, sets: [
                 { k: 'Strength', name: 'Squats', dose: '12–15 reps' },
                 { k: 'Muscle', name: 'Push-ups', dose: '10–12 reps' },
                 { k: 'Endurance', name: 'Lunges', dose: '8 per leg' },
                 { k: 'Cardio', name: 'Brisk walk or light jog', dose: '20–25 min' }],
                 demos: ['Shoulder taps', 'Wall sit', 'Walking lunges', 'Leg raises'] },
               gym: { mins: 60, line: 'Leg press 8 reps (60–65%) · Incline chest press 8–10 reps · Lat pulldown 10 reps · Treadmill 20 min' } },
          7: { phase: 'HAALVING Phase', tag: 'Maintenance & lifestyle combination',
               goal: 'Maintain peak fitness with balanced lifestyle integration.',
               intensity: '80–100% · maintenance training and injury prevention',
               rpe: 'Moderate–High (RPE 6–7)', steps: '12,000–15,000+ steps', water: '3.0–3.5 L', screen: '1 h',
               home: { mins: 45, sets: [
                 { k: 'Strength', name: 'Squats', dose: '15 reps' },
                 { k: 'Muscle', name: 'Push-ups', dose: '12–15 reps' },
                 { k: 'Endurance', name: 'Step-ups', dose: '12 per leg' },
                 { k: 'Cardio', name: 'Walk + jog intervals', dose: '25–30 min' }],
                 demos: ['Push-up and shoulder tap', 'Mountain climbers', 'Bulgarian split squat', 'Sit-ups'] },
               gym: { mins: 60, line: 'Leg press 6–8 reps (65–70%) · Dumbbell press 8–10 reps · Row machine 10 reps · Treadmill intervals 20–25 min' } },
        },
        moderate: {
          1: { phase: 'Foundation Phase', tag: 'Awakening muscles & form correction',
               goal: 'Establish baseline fitness, activate muscles, improve basic endurance.',
               intensity: '0–10% · low-impact, technique focused',
               rpe: 'Very light (RPE 3)', steps: '7,000–9,000 steps', water: '2.5–3.0 L', screen: '2–2.5 h',
               home: { mins: 35, sets: [
                 { k: 'Strength', name: 'Squats', dose: '10 reps' },
                 { k: 'Muscle', name: 'Push-ups', dose: '10 reps' },
                 { k: 'Endurance', name: 'Marching in place', dose: '30 sec' },
                 { k: 'Cardio', name: 'Walking', dose: '10 min' }],
                 demos: ['Full squats', 'Glute bridge', 'Arm circles', 'Calf raise'] },
               gym: { mins: 45, line: 'Leg press 10 reps (20–30%) · Chest press machine 10 reps light · Seated row 10 reps · Cycle 8–10 min' } },
          2: { phase: 'Activation & Rebuild Phase', tag: 'Introducing strength & endurance',
               goal: 'Build muscle strength and cardiovascular endurance for noticeable daily improvements.',
               intensity: '15–25% · light resistance, moderate aerobic activity',
               rpe: 'Light (RPE 3–4)', steps: '9,000–11,000 steps', water: '3.0–3.5 L', screen: '2 h with movement breaks',
               home: { mins: 40, sets: [
                 { k: 'Strength', name: 'Squats', dose: '12 reps' },
                 { k: 'Muscle', name: 'Incline push-ups', dose: '10–12 reps' },
                 { k: 'Endurance', name: 'Heel raises', dose: '15 reps' },
                 { k: 'Cardio', name: 'Brisk walk', dose: '12–15 min' }],
                 demos: ['Incline push-up', 'Plank', 'Full squat', 'Pike push-up'] },
               gym: { mins: 45, line: 'Leg press 12 reps (30–40%) · Lat pulldown 12 reps · Cable row 12 reps · Elliptical 10–12 min' } },
          3: { phase: 'Strength & Healing Phase', tag: 'Effective strength & stamina',
               goal: 'Enhance functional strength and muscular stamina for daily and recreational activity.',
               intensity: '30–40% · moderate resistance, compound movements',
               rpe: 'Light–Moderate (RPE 4–5)', steps: '11,000–13,000 steps on varied terrain', water: '3.0–3.5 L', screen: '1.5 h',
               home: { mins: 40, sets: [
                 { k: 'Strength', name: 'Full squats', dose: '15 reps' },
                 { k: 'Muscle', name: 'Push-ups', dose: '12 reps' },
                 { k: 'Endurance', name: 'Step-ups', dose: '10 per leg' },
                 { k: 'Cardio', name: 'Brisk walk', dose: '15–20 min' }],
                 demos: ['Full squat', 'Push-up', 'Step-up', 'Plank'] },
               gym: { mins: 45, line: 'Compound lifts at 30–40% · lat pulldown · cable row · 15 min cardio finisher' } },
        },
      },
      yoga: {
        sedentary: {
          1: { phase: 'Foundation Phase', tag: 'Awakening the body · Hatha', dur: '20–30 min',
               goal: 'Gently prepare body and mind; reduce stiffness and introduce mindful breathing.',
               blocks: [{ k: 'Mobility', v: 'Cat-Cow flows & joint circles — shoulders, wrists, ankles', mins: '5 min' },
                        { k: 'Flexibility', v: 'Seated forward bends & gentle neck stretches', mins: '5 min' },
                        { k: 'Breath', v: 'Basic pranayama — natural breath awareness', mins: '10 min' }],
               poses: ['Cat-cow', 'Alternate nostril breathing'],
               focus: 'Trainer guides body awareness and foundational breath control. Comfort over depth.' },
          2: { phase: 'Activation & Rebuild Phase', tag: 'Building foundations', dur: '30–35 min',
               goal: 'Build body awareness and basic flexibility through standing poses with breath integration.',
               blocks: [{ k: 'Mobility', v: 'Mountain Pose flows & gentle hip openers', mins: '10 min' },
                        { k: 'Flexibility', v: 'Hamstring and shoulder stretches', mins: '10 min' },
                        { k: 'Breath', v: 'Pranayama with longer exhalations', mins: '10 min' }],
               poses: ['Mountain pose', 'Hip openers', 'Downward dog'],
               focus: 'Alignment in foundational postures; the mind–body link starts here.' },
          3: { phase: 'Strength & Healing Phase', tag: 'Core activation', dur: '35–45 min',
               goal: 'Activate and strengthen the core; build stability and endurance with breath synchronisation.',
               blocks: [{ k: 'Mobility', v: 'Dynamic spinal movements & twists', mins: '10 min' },
                        { k: 'Flexibility', v: 'Hip flexor & back stretches — low lunges, pigeon prep', mins: '10 min' },
                        { k: 'Breath', v: 'Ujjayi breathing with core engagement', mins: '15 min' }],
               poses: ['Boat pose', 'Plank', 'Cat-cow', 'Seated spinal twist'],
               focus: 'Engage the core with every breath cycle; steady Ujjayi throughout.' },
          4: { phase: 'Happy Energy Phase', tag: 'Strength development', dur: '45 min',
               goal: 'Develop muscular endurance and overall strength while holding breath control under effort.',
               blocks: [{ k: 'Mobility', v: 'Active joint mobilisations — shoulder circles, hip rotations', mins: '10 min' },
                        { k: 'Flexibility', v: 'Targeted stretches; Surya Namaskar (1)', mins: '10 min' },
                        { k: 'Breath', v: 'Kumbhaka — breath retention, held into final relaxation', mins: '15 min' }],
               poses: ['Warrior II', 'Bridge pose', 'Low push-up'],
               focus: 'Instructor guides attention through relaxation to sharpen cognitive recovery.' },
          5: { phase: 'Habit Transition Phase', tag: 'Balance & awareness', dur: '45–60 min',
               goal: 'Improve balance and body awareness through slow, controlled transitions.',
               blocks: [{ k: 'Mobility', v: 'Ankle & hip drills for proprioception', mins: '15 min' },
                        { k: 'Flexibility', v: 'Side body stretches, gentle twists and side bends', mins: '10 min' },
                        { k: 'Breath', v: 'Slow rhythmic breathing, bridging into Yoga Nidra', mins: '20 min' }],
               poses: ['Tree pose', 'Eagle pose', 'Seated spinal twist'],
               focus: 'Alignment precision and breath steadiness through the balance poses.' },
          6: { phase: 'Sustainable Phase', tag: 'Endurance & flow · vinyasa + power', dur: '45–60 min',
               goal: 'Build stamina through dynamic Sun Salutation sequences and continuous breath.',
               blocks: [{ k: 'Mobility', v: 'Dynamic flow — Sun Salutation transitions, Warrior flows', mins: '20 min' },
                        { k: 'Flexibility', v: 'Full body stretches — forward folds, side bends, gentle backbends', mins: '15 min' },
                        { k: 'Breath', v: 'Continuous breath linked to every transition', mins: '15 min' }],
               poses: ['Sun Salutation', 'Warrior flow'],
               focus: 'Breath initiates each movement; smooth transitions throughout.' },
          7: { phase: 'HAALVING Phase', tag: 'Integration & habit formation', dur: '45–60 min',
               goal: 'Consolidate every learned skill into a daily practice you keep for life.',
               blocks: [{ k: 'Mobility', v: 'Personalised blended sequence', mins: '15 min' },
                        { k: 'Flexibility', v: 'Your own maintenance set', mins: '15 min' },
                        { k: 'Breath', v: 'Advanced pranayama with meditation', mins: '15 min' }],
               poses: ['Customised sequence'],
               focus: 'Reinforcing a balanced routine you can run without a trainer.' },
        },
        moderate: {
          1: { phase: 'Foundation Phase', tag: 'Hatha yoga', dur: '45 min',
               goal: 'Assess flexibility, joint alignment and breath awareness to establish a safe baseline.',
               blocks: [{ k: 'Mobility', v: 'Foundational joint work', mins: '40% of session' },
                        { k: 'Flexibility', v: 'Mountain pose, downward facing dog', mins: '40% of session' },
                        { k: 'Breath', v: 'Mindful breath observation', mins: '20% of session' }],
               poses: ['Mountain pose', 'Downward facing dog'],
               focus: 'Sets the groundwork for every stage that follows.' },
          2: { phase: 'Activation & Rebuild Phase', tag: 'Sun Salutation B & Warrior series', dur: '45 min',
               goal: 'Improve endurance and integrate poses at moderate intensity.',
               blocks: [{ k: 'Mobility', v: 'Warrior series', mins: '40% of session' },
                        { k: 'Flexibility', v: 'Sun Salutation B', mins: '30% of session' },
                        { k: 'Breath', v: 'Ujjayi coordinated with movement', mins: '30% of session' }],
               poses: ['Sun Salutation B', 'Warrior I & II'],
               focus: 'Breath awareness calms the mind after the workout.' },
          3: { phase: 'Strength & Healing Phase', tag: 'Hatha yoga', dur: '45 min',
               goal: 'Strengthen core muscles and improve overall balance.',
               blocks: [{ k: 'Mobility', v: 'Postural control drills', mins: '50% of session' },
                        { k: 'Flexibility', v: 'Plank to Chaturanga, Side plank, Boat pose', mins: '20% of session' },
                        { k: 'Breath', v: 'Kumbhaka — breath retention practice', mins: '30% of session' }],
               poses: ['Plank to Chaturanga', 'Side plank', 'Boat pose'],
               focus: 'Alignment refinement and timing breath with movement.' },
        },
      },
      culture: {
        sedentary: {
          1: { phase: 'Foundation Phase', aim: 'Reduced bloating, lighter stomach, first control over eating habits',
               star: 'Star rating begins · most plates start at 2–3 stars',
               habits: ['Burp theory — stop at 80% full', 'Reduce processed food, bakery and gravies',
                        'Drink 300 ml water on waking', 'Total 2–2.5 L water through the day'],
               diet: ['Adding pre- and probiotics', 'Disease-specific dietary modifications',
                      'Avoid or limit processed foods', 'Food label awareness'],
               plate: '20% gene food · 30–40% climate food · 40% growth food',
               cheat: 'Cheat day — any occasion, or Sunday' },
          2: { phase: 'Activation & Rebuild Phase', aim: 'Fibre, protein and carbs pattern with reduced portion size',
               star: 'Aim for at least 4-star meals',
               habits: ['Burp theory — stop at 80% full (50%)', 'Eat in order: fibre → protein → carbs',
                        'Reduce processed food, bakery, gravy (30%)', 'Drink 2.5–3 L water (30%)',
                        'Breakfast by 9 am · dinner by 7 pm', 'Always carry a healthy snack option'],
               diet: ['Introduce fibre, protein and carbs; reduce portion size',
                      'Proper nutrient distribution in every meal', 'Reduce excess sugar and transfat',
                      'Add vegetable and fruit juices'],
               plate: '20% gene food · 30–40% climate food · 40% growth food' },
          3: { phase: 'Strength & Healing Phase', aim: 'Prioritised micro and macro nutrients',
               star: 'Aim for at least 5-star meals',
               habits: ['Burp theory — stop at 80% full (70%)', 'Minimum protein; do not exceed daily calories',
                        'Reduce processed food, sugar, bakery, gravy, chocolate, carbonated drinks (70%)',
                        'Drink 2.5–3 L water (80%)', 'Breakfast 9 am · dinner 7 pm (50%)'],
               diet: ['Functional nutrient based modification', 'Prioritise micro-nutrient rich foods',
                      'Prefer whole, natural foods'] },
          4: { phase: 'Happy Energy Phase', aim: '14-hour intermittent fasting pattern',
               star: 'Achieve 5-star meals',
               habits: ['Reduce processed food, sugar, bakery, gravy, chocolate, carbonated drinks (100%)',
                        'Drink 3 L water (100%)', 'Breakfast 9 am · dinner 7 pm (80%)'],
               diet: ['Hold the 14-hour intermittent fasting window', 'Balanced macro and micro nutrients'],
               cheat: 'Healthy cheat day — day 11' },
          5: { phase: 'Habit Transition Phase', aim: 'Two meals a day, twice a week',
               star: 'Achieve 5-star meals',
               habits: ['Minimum protein; do not exceed daily calories (70–80%)',
                        'Processed food, sugar, bakery, gravy, chocolate, carbonated drinks (100%)',
                        'Breakfast 9 am · dinner 7 pm (100%)'],
               diet: ['Replace with a variety of millets', 'Increase fibre intake', 'Different protein options',
                      '14-hour fasting window (70–80%)', '2 meals per day, twice weekly — for autophagy'],
               cheat: 'Healthy cheat day — day 11' },
          6: { phase: 'Sustainable Phase', aim: 'One meal a day, once a week',
               star: 'Hold 5-star meals',
               habits: ['Balanced meal pattern', 'Processed food, sugar, bakery, gravy held at 100%'],
               diet: ['Balanced macro and micro nutrients', 'Allow variety for sustainability',
                      '2 meals per day on selected days'] },
          7: { phase: 'HAALVING Phase', aim: 'The way you eat now, without a plan to follow',
               star: 'Hold 5-star meals',
               habits: ['Balanced meal pattern by instinct', 'Flexibility in food choices'],
               diet: ['Sustained energy levels', 'Prevent regaining'] },
        },
        moderate: {
          1: { phase: 'Foundation Phase', aim: 'Introduction to meal plating',
               star: 'Star rating begins · most plates start at 2–3 stars',
               habits: ['Burp theory — stop at 80% full', 'Reduce processed food, sugar, bakery, gravies',
                        'Drink 300 ml water on waking', 'Total 2–2.5 L water',
                        'Breakfast at 9 am, finish dinner at 7 pm'],
               diet: ['Warm water, fibre and light protein (1 g × body weight)', 'Simple, clean meals',
                      'Avoid or limit processed foods'],
               plate: '20% gene food · 30–40% climate food · 40% growth food' },
          2: { phase: 'Activation & Rebuild Phase', aim: 'Prebiotic and probiotic foods; protein, fibre and healthy fats',
               star: 'Aim for at least 3-star meals',
               habits: ['Eat in order: fibre → protein → carbs', 'Reduce processed food, sugar, bakery, gravy (40%)',
                        'Drink 2–2.5 L water', 'Fix meal timing', 'Always carry a healthy snack option'],
               diet: ['Fibre, protein (1 g × body weight), healthy fats',
                      'Add variety: whole grains, pulses and fruits',
                      'Portion control begins — 20% gene, 40% protein, 40% growth food'],
               plate: '20% gene food · 40% protein food · 40% growth food' },
          3: { phase: 'Strength & Healing Phase', aim: 'Functional foods with vitamins and antioxidants',
               star: 'Aim for at least 4-star meals',
               habits: ['Minimum protein; do not exceed daily calories',
                        'Reduce processed food, sugar, bakery, gravy, chocolate, carbonated drinks (70%)',
                        'Drink 2–2.5 L water (100%)'],
               diet: ['Add probiotics (curd, yoghurt) and prebiotics (fibre-rich foods)',
                      'Anti-inflammatory foods — turmeric, nuts, seeds',
                      'Improve protein intake (1.2 × body weight)'] },
        },
      },
      /* mind wellness runs on the same 11-day clock but its prescription is a
         daily-activity one: sleep, screen discipline, and one guided session.
         Screen caps track the fitness level book; sleep and screen discipline
         are the standing house rules from the client happy-habits sheet. */
      wellness: {
        1: { sleep: '7–8 h', screen: '2–2.5 h', practice: 'Nightly wind-down breath · 2 min' },
        2: { sleep: '7–8 h', screen: '2 h', practice: 'Nightly wind-down breath · 2 min' },
        3: { sleep: '7–8 h', screen: '1.5 h', practice: 'Guided downshift · 20 min on session days' },
        4: { sleep: '7–8 h', screen: '1 h', practice: 'Guided downshift · 20 min, plus nightly wind-down breath' },
        5: { sleep: '7–8 h', screen: '1 h', practice: 'Yoga Nidra bridge after your evening practice' },
        6: { sleep: '7–8 h', screen: '1 h', practice: 'Self-led wind-down; Nidra twice a week' },
        7: { sleep: '7–8 h', screen: '1 h', practice: 'Your own routine, held without prompting' },
      },
    },

    /* the live yoga room. Yoga is delivered live, so the session row carries a
       door, not a description. One demo room stands in for the per-session
       links the real scheduler will mint. */
    liveRooms: { yoga: 'https://meet.google.com/hlv-yoga-live' },

    /* ---- My Tribe: the community feed (TB-02). A small circle of fellow
       clients sharing progress the way a photo feed does, plus three house
       rings where a story row would sit: the daily Health Games, events and
       challenges. Refilled on boot when absent (catalogue), and then
       persisted — likes, comments, answers and joins are user state. Feed
       media reuses art already shipped; nothing here precaches. */
    tribeFeed: {
      /* the circle: every seeded client persona sees the same tribe */
      circle: ['u-cl-rajesh', 'u-cl-priya', 'u-cl-dev', 'u-cl-ananya', 'u-cl-mathew'],

      /* the daily Health Games book: five questions a day, newest day first. A day's
         stars = how many of its five were answered right. */
      quizDays: [
        { id: 'qd0', label: 'Mon', date: '3 Aug', qs: [
          { q: 'How do the longest-lived communities move?', opts: ['Structured gym hours', 'Natural movement woven through the day', 'Weekend-only training'], ans: 1,
            why: 'Gardens, walking, kneading, climbing — movement lives inside the day, not beside it.', answered: null },
          { q: 'Hara hachi bu, the Okinawan table rule, means…', opts: ['Eat until about 80% full', 'Finish everything served', 'No food after sunset'], ans: 0,
            why: 'Stopping at 80% gives the stomach its twenty-minute head start on the brain.', answered: null },
          { q: 'The strongest dinner habit for deeper sleep?', opts: ['A late, heavy dinner', 'No dinner at all', 'An early, lighter dinner'], ans: 2,
            why: 'Digesting and deep sleep compete — an early plate hands the night to sleep.', answered: null },
          { q: 'What do nearly all documented centenarians share?', opts: ['A strict diet plan', 'A clear sense of purpose', 'Daily supplements'], ans: 1,
            why: 'Ikigai, plan de vida — a reason to wake up adds years, and years add reasons.', answered: null },
          { q: 'Your circle of friends most strongly shapes…', opts: ['Only your mood', 'Your daily habits', 'Nothing measurable'], ans: 1,
            why: 'Habits are contagious — the tribe you keep is the diet you keep.', answered: null },
        ] },
        { id: 'qd1', label: 'Sun', date: '2 Aug', qs: [
          { q: 'A ten-minute walk after meals mainly helps…', opts: ['Steadier blood sugar', 'Taller posture', 'Faster digestion of fat'], ans: 0,
            why: 'Working muscles drink up glucose, so the after-meal rise stays gentle.', answered: null },
          { q: 'Which fats anchor Blue Zones plates?', opts: ['Butter and cream', 'Olive, nut and seed fats', 'Deep-fried oils'], ans: 1,
            why: 'Sardinia and Ikaria run on olive oil and nuts — fats that carry the vegetables.', answered: null },
          { q: 'Beans in the Blue Zones are eaten…', opts: ['Rarely, as a garnish', 'Only fermented', 'Around a cup most days'], ans: 2,
            why: 'The world’s longevity all-star food is the humble, daily bowl of beans.', answered: null },
          { q: 'Screens late at night mostly disturb…', opts: ['Melatonin timing', 'Appetite', 'Body temperature'], ans: 0,
            why: 'Bright light tells the brain it is still daytime, so the sleep signal comes late.', answered: null },
          { q: 'Water before a meal supports…', opts: ['Nutrient dilution', 'Satiety and slower eating', 'Nothing at all'], ans: 1,
            why: 'A glass before the plate takes the edge off hunger and slows the fork.', answered: null },
        ] },
        { id: 'qd2', label: 'Sat', date: '1 Aug', qs: [
          { q: 'A downshift practice is…', opts: ['A short daily pause that lowers stress', 'A lighter workout', 'A cheat meal'], ans: 0,
            why: 'Every Blue Zone has one — prayer, naps, tea, remembering ancestors. Stress needs a valve.', answered: null },
          { q: 'Whole grains beat refined ones mainly because…', opts: ['They taste stronger', 'The fibre is still there', 'They cook faster'], ans: 1,
            why: 'Intact fibre slows the sugar and feeds the gut — milling it away leaves just the spike.', answered: null },
          { q: 'Okinawan elders keep gardens because they give…', opts: ['Purpose, movement and greens in one', 'Extra income', 'Afternoon shade'], ans: 0,
            why: 'One plot delivers a reason to rise, a daily bend-and-carry, and dinner.', answered: null },
          { q: 'The Sardinian shepherds’ movement secret was…', opts: ['Sprint intervals', 'Daily hill walking', 'Heavy lifting'], ans: 1,
            why: 'Five gentle uphill miles a day, most days, for a lifetime — no gym required.', answered: null },
          { q: 'Eating with company tends to make meals…', opts: ['Faster and larger', 'Slower and more satisfying', 'Exactly the same'], ans: 1,
            why: 'Conversation is a natural pause button — the table fills before the plate refills.', answered: null },
        ] },
        { id: 'qd3', label: 'Fri', date: '31 Jul', qs: [
          { q: 'Caffeine after mid-afternoon mainly costs you…', opts: ['Deep sleep that night', 'Morning appetite', 'Hydration'], ans: 0,
            why: 'Half of a 3 PM coffee is still circulating at 9 PM, quietly shaving the deep stages.', answered: null },
          { q: 'Morning sunlight helps because it…', opts: ['Sets the body clock for the day', 'Replaces breakfast', 'Burns fat directly'], ans: 0,
            why: 'Ten bright minutes anchor the rhythm that decides tonight’s sleepiness.', answered: null },
          { q: 'Protein works best for muscle when…', opts: ['Loaded into one big dinner', 'Spread across the day’s meals', 'Taken only after workouts'], ans: 1,
            why: 'Muscle listens at every meal — even portions beat one flood.', answered: null },
          { q: 'A slow exhale calms you because it…', opts: ['Speaks to the calming half of the nervous system', 'Adds oxygen', 'Warms the chest'], ans: 0,
            why: 'A longer out-breath is the body’s own brake pedal — free and always installed.', answered: null },
          { q: 'The healthiest snack habit in the Zones is…', opts: ['A handful of nuts', 'Something sweet hourly', 'No food between meals, strictly'], ans: 0,
            why: 'Nut eaters live measurably longer — a small handful, most days.', answered: null },
        ] },
        { id: 'qd4', label: 'Thu', date: '30 Jul', qs: [
          { q: 'NEAT — the movement that adds up most — is…', opts: ['Non-exercise activity: stairs, chores, walks', 'A new workout format', 'Stretching'], ans: 0,
            why: 'The day’s ordinary motion burns more than the gym hour for most people.', answered: null },
          { q: 'Added sugar is best kept…', opts: ['Under about 25g a day', 'Only at breakfast', 'Unlimited if you exercise'], ans: 0,
            why: 'Roughly six teaspoons — beyond that the liver starts bottling the excess.', answered: null },
          { q: 'Fermented foods like curd and kanji mainly feed…', opts: ['Your gut microbes', 'Your muscles', 'Your skin'], ans: 0,
            why: 'Live cultures keep the gut’s garden diverse — and the gut talks to everything.', answered: null },
          { q: 'A simple gratitude habit measurably improves…', opts: ['Sleep and mood', 'Height', 'Metabolism only'], ans: 0,
            why: 'Three written lines a night lower rumination — the mind unclenches before bed.', answered: null },
          { q: 'The best hydration signal to trust is…', opts: ['Thirst plus pale urine', 'A fixed eight glasses', 'Drinking only at meals'], ans: 0,
            why: 'The body posts its own gauge twice — listen rather than count.', answered: null },
        ] },
      ],

      /* gatherings — newest first; enrolling surfaces the event beside the rings.
         Each one is read at full width in the Events face, so `img` must be a
         PHOTOGRAPH — pillar and task plates are cut-out specimen art and show
         their ground when cropped to a 16:9 hero. */
      events: [
        { id: 'ev1', title: 'One-day trek to Malayattoor', when: 'Sat · 5:30 AM', where: 'Malayattoor, Kerala',
          img: 'img/onboard/bz-live.webp', going: false,
          desc: 'A gentle 8 km forest trail with the tribe — river crossing, a packed Blue Zones breakfast, and the kind of conversation only a hill can start. All levels welcome; your coach clears your plan for the day.',
          host: 'Anand walks lead · Sneha packs the plates', spots: '24 places · kept small on purpose',
          about: [
            'The oldest habit in every Blue Zone is the least glamorous one: people walk, together, on ground that isn’t flat. This is that habit, borrowed for a day. The trail climbs slowly through rubber and forest to the hilltop church — the pace is conversation pace, and the group waits at every fork.',
            'Nobody is graded and nothing syncs to your plan except your steps. Fitness clears the day for you: it counts as your session, and clients with a human Nutrition coach get their plates swapped for the packed breakfast automatically.',
          ],
          agenda: [
            { t: '5:30 AM', v: 'Assemble at the pickup point — the bus leaves at 5:45 sharp' },
            { t: '7:00 AM', v: 'Trailhead · briefing, water top-up, phones to silent' },
            { t: '9:30 AM', v: 'River crossing and the packed Blue Zones breakfast' },
            { t: '12:30 PM', v: 'Kurisumudy viewpoint — the long sit, the short photos' },
            { t: '2:00 PM', v: 'Descent · buttermilk stop at the foothill stall' },
            { t: '4:00 PM', v: 'Bus back — home before the evening session' },
          ],
          bring: ['Worn-in walking shoes — not new ones', '2 litres of water', 'A hat and a light rain shell',
            'Nothing to eat — the kitchen carries the day'] },
        { id: 'ev2', title: 'One-pot Blue Zones cooking session', when: 'Sun · 11:00 AM', where: 'Live room',
          img: 'img/food/m-sur-lunch.webp', going: false,
          desc: 'Sneha cooks a Sardinian minestrone the HAALVING way — one pot, five vegetables, beans in the lead. Cook along live; the shopping list arrives the evening before.',
          host: 'Sneha · Dietician', spots: 'The room is open — enrolling shapes the shopping list',
          about: [
            'Sardinia’s longest-lived families eat from one pot more days than not. This session is that pot: minestrone the way Seulo cooks it, beans first, vegetables by what the market had, olive oil at the end and never before.',
            'Cook along in your own kitchen with the camera on or off — both are welcome. The recipe scales from one bowl to a family; the swaps for what your plan allows arrive with the shopping list the evening before.',
          ],
          agenda: [
            { t: '10:45 AM', v: 'Mise en place together — chop, soak-check, pot on' },
            { t: '11:00 AM', v: 'The cook, live · beans lead, vegetables follow' },
            { t: '11:40 AM', v: 'The swap round — your region’s beans, your plan’s grains' },
            { t: '12:00 PM', v: 'We eat together, cameras optional, seconds encouraged' },
          ],
          bring: ['A 3-litre pot', 'The shopping list’s vegetables — five is plenty', 'Beans soaked overnight (the list says which)'] },
        { id: 'ev3', title: 'Sunrise group walk · Cubbon Park', when: 'Next Sat · 6:30 AM', where: 'Bengaluru',
          img: 'img/onboard/culture.webp', going: false,
          desc: 'Five easy kilometres under the rain trees before the city wakes. We end at the bandstand with buttermilk and filter coffee — decaf for the brave.',
          host: 'Your pod coaches walk with you', spots: '40 places across the pods',
          about: [
            'The easiest session of the month: flat ground, old trees, no pace to keep. We walk in loose clumps that form and reform — the point is as much the talking as the walking. Regulars call it the unofficial progress meeting.',
            'It counts as your steps target for the day, and the buttermilk at the end is on the plan — the filter coffee is between you and your conscience.',
          ],
          agenda: [
            { t: '6:15 AM', v: 'Gather at Gate 2 — look for the HAALVING flag' },
            { t: '6:30 AM', v: 'Walk starts · two loops, five easy kilometres' },
            { t: '7:20 AM', v: 'Bandstand halt — stretch, sit, talk' },
            { t: '7:45 AM', v: 'Buttermilk and filter coffee at the kiosk' },
          ],
          bring: ['Shoes you already like', 'Nothing else — truly'] },
      ],

      /* standing challenges — one per card; joining surfaces it beside the rings */
      challenges: [
        { id: 'ch1', title: '7-day fasting challenge', days: 7,
          img: 'img/onboard/nutrition.webp', joined: false,
          desc: 'A gentle overnight fast: dinner done by 8, breakfast at 10 — a 14-hour pause your body spends housekeeping. No skipped meals, no heroics; your coach adjusts if your plan needs it.',
          host: 'Set by the dietitian pod · your own coach signs you in', stake: 'A fasting ring on your Journey — and lighter mornings',
          about: [
            'Every Blue Zone eats across a short day without calling it fasting — supper early, breakfast late, and the night left to the body’s housekeeping. This challenge borrows exactly that and nothing more: fourteen quiet hours, seven nights.',
            'Nothing about your plates changes — the same food, moved closer together. Clients on medication or with flagged markers get a coach call before day one; the panel adjusts the window rather than dropping you out.',
          ],
          how: ['Dinner finished by 8 PM — finished, not started', 'Breakfast from 10 AM, as your plan already writes it',
            'Water, plain herbal tea and black coffee stay open all night', 'Miss a night? Log it and carry on — streaks bend, they don’t break',
            'On medication: your coach confirms your window before day one'],
          arc: [
            { k: 'Days 1–2', v: 'The fidgety window — the 9 PM habit argues back. Warm water wins.' },
            { k: 'Days 3–5', v: 'The quiet stretch — hunger arrives on schedule and leaves politely.' },
            { k: 'Days 6–7', v: 'The settled mornings — most people report the first one here.' },
          ] },
        { id: 'ch2', title: '10k steps · 11 days', days: 11,
          img: 'img/onboard/fitness.webp', joined: false,
          desc: 'Ten thousand steps a day for one full cycle. The tribe board keeps everyone’s week side by side — walk together, even apart.',
          host: 'The fitness pod referees · the tribe board keeps score', stake: 'The walker’s crown on the tribe board, held till someone takes it',
          about: [
            'Ten thousand is not a magic number — it is simply far enough that it cannot happen by accident. Hitting it daily for a whole cycle means the walking found places to live in your day: the call you take on your feet, the stop before your stop, the after-dinner loop.',
            'Your tracker syncs the board each night, and the board shows the tribe side by side — not to shame the short days, but because a row of other people’s green squares is the best walking shoe ever made.',
          ],
          how: ['Your own watch or phone counts — the board syncs at midnight', 'Active-rest days keep an 8k floor, the plan says which days those are',
            'Rain, travel, deadlines — log the honest number; the board carries context chips', 'Three short days in a row and your fitness coach checks in — help, not homework'],
          arc: [
            { k: 'Days 1–3', v: 'Find your slots — where the steps actually fit your day.' },
            { k: 'Days 4–8', v: 'Protect the evening walk — the slot every miss has in common.' },
            { k: 'Days 9–11', v: 'Hold it without thinking. That is the whole point.' },
          ] },
        { id: 'ch3', title: 'Table before eight', days: 11,
          img: 'img/onboard/bz-table.webp', joined: false,
          desc: 'Dinner on the table and done by 8 PM for one cycle. Late plates make honest confessions in the feed.',
          host: 'The whole tribe, honour system · confessions welcome in the feed', stake: 'A Table ring — and your sleep tracker’s quiet gratitude',
          about: [
            'The earliest habit HAALVING borrows from the Blue Zones is the early table: supper done while the sky is still lighter than the room. Digestion gets its evening, sleep gets its full night, and tomorrow’s breakfast gets an appetite.',
            'This one runs on the honour system. No tracker watches your table — the feed does. Late plates make the best posts, and the tribe has never once been unkind to a confession.',
          ],
          how: ['Dinner served AND finished by 8 PM', 'A photo to the meal queue if you like — the dietitian reads it either way',
            'Miss a night, post the story — a samosa at 9:40 has friends here', 'Eleven nights, one cycle — the review meeting sees the pattern, not the slips'],
          arc: [
            { k: 'Days 1–4', v: 'The scramble — dinner argues with traffic and the fridge.' },
            { k: 'Days 5–8', v: 'The 8 PM reflex forms — the kitchen starts earlier on its own.' },
            { k: 'Days 9–11', v: 'The sleep dividend lands — mornings vote to keep the habit.' },
          ] },
      ],

      posts: [
        { id: 'tp1', by: 'u-cl-priya', kind: 'photo', img: 'img/food/m-priya-bf.webp', minsAgo: 45,
          caption: 'Observation day 4 — ragi dosa with sambar, no rush, actually tasted it. My dietitian says slow is a skill.',
          likes: ['u-cl-dev', 'u-cl-mathew', 'u-cl-ananya'],
          comments: [
            { by: 'u-cl-mathew', text: 'The slow part took me two cycles. Worth it.' },
            { by: 'u-cl-dev', text: 'That sambar looks proper.' },
          ] },
        { id: 'tp2', by: 'haalving', kind: 'quiz', minsAgo: 180,
          caption: 'Health Games — one question, thirty seconds, no grades.',
          quiz: {
            q: 'What matters most for post-meal blood sugar?',
            opts: ['Eating dessert first', 'The order you eat: fibre, protein, then carbs', 'Skipping lunch entirely'],
            ans: 1,
            why: 'Fibre and protein ahead of carbs slow the spike — same plate, gentler curve.',
            answered: null },
          likes: ['u-cl-priya', 'u-cl-ananya'], comments: [] },
        { id: 'tp3', by: 'u-cl-dev', kind: 'short', img: 'img/onboard/fitness.webp', secs: 24, minsAgo: 420,
          caption: 'Vikram put farmer carries in my block this cycle. Forearms have opinions now.',
          likes: ['u-cl-rajesh', 'u-cl-mathew'],
          comments: [ { by: 'u-cl-rajesh', text: 'Wait till he adds the stairs.' } ] },
        { id: 'tp4', by: 'u-cl-mathew', kind: 'text', minsAgo: 900,
          caption: 'Cycle 8 begins today. Same four pillars, same eleven days — but the first cycle I have not once thought of it as a diet. It is just how our house eats now.',
          likes: ['u-cl-priya', 'u-cl-rajesh', 'u-cl-ananya', 'u-cl-dev'],
          comments: [
            { by: 'u-cl-ananya', text: 'This is the post I needed today.' },
            { by: 'u-cl-priya', text: 'Eight cycles. Quietly incredible.' },
          ] },
        { id: 'tp5', by: 'u-cl-ananya', kind: 'photo', img: 'img/onboard/yoga.webp', minsAgo: 1300,
          caption: 'Morning mobility on the terrace before the city wakes. The AI coach moved my block to sunrise and honestly it was right.',
          likes: ['u-cl-priya'],
          comments: [] },
        { id: 'tp6', by: 'haalving', kind: 'photo', img: 'img/onboard/bz-table.webp', minsAgo: 1800,
          caption: 'From the field notes: in Sardinia the table is the longest meal of the day and nobody eats it alone. This week’s challenge, Table before eight, borrows exactly that.',
          likes: ['u-cl-mathew', 'u-cl-rajesh'],
          comments: [ { by: 'u-cl-mathew', text: 'Our dinner table thanks you.' } ] },
        { id: 'tp7', by: 'u-cl-rajesh', kind: 'photo', img: 'img/food/m-raj-lunch.webp', minsAgo: 2600,
          caption: 'Lunch scored four stars from Sneha — the missing star was the white rice mountain. Noted.',
          likes: ['u-cl-dev'],
          comments: [ { by: 'u-cl-dev', text: 'The mountain is a lifestyle.' } ] },
      ],

      /* ---- zones (TB-04, 8 Aug): small private circles inside the Haalving
         Zone page. WhatsApp-shaped in the making (pick people, then name it),
         Instagram-shaped in the living (a private canvas of posts only the
         members see). Grafted by tribeFaces.heal() into stores persisted
         before zones existed, so adding one needs no seedVersion bump. */
      zones: [
        { id: 'z1', name: 'Morning Walkers', createdBy: 'u-cl-mathew',
          members: ['u-cl-mathew', 'u-cl-rajesh', 'u-cl-priya', 'u-cl-dev', 'u-cl-ananya'],
          posts: [
            { id: 'zp1', by: 'u-cl-rajesh', kind: 'photo', img: 'img/onboard/culture.webp', minsAgo: 160,
              caption: 'The 6 AM loop had five of us today. The bench count is officially a tradition.',
              likes: ['u-cl-mathew', 'u-cl-priya'],
              comments: [ { by: 'u-cl-mathew', text: 'Saturday we take the long way round.' } ] },
            { id: 'zp2', by: 'u-cl-priya', kind: 'text', minsAgo: 1420,
              caption: 'Rain plan for tomorrow: terrace stairs, twenty minutes, same time. Who is in?',
              likes: ['u-cl-dev'],
              comments: [] },
          ] },
      ],
    },

    /* ---- care circle threads. kind 'teamonly' renders ONLY in the console (CC-08). ---- */
    circles: {
      'c-rajesh': [
        { id: 'cm1', fromId: 'u-anita', kind: 'card', text: 'Pinned: Dos & Don’ts · How we’ll work together', minsAgo: 4320 },
        { id: 'cmdoc', fromId: 'u-sneha', kind: 'doc', text: 'Diet Plan · L2 · Cycle 3 — approved and published to your plan.', minsAgo: 2800 },
        { id: 'cm2', fromId: 'client', kind: 'meal', mealId: 'm-raj-bf', text: 'Breakfast logged', minsAgo: 300 },
        { id: 'cm3', fromId: 'u-sneha', kind: 'rating', mealId: 'm-raj-bf', text: 'Breakfast rated 4 stars, voice note attached. Watch the fried sides at lunch!', minsAgo: 288 },
        { id: 'cm4', fromId: 'u-vikram', kind: 'text', text: 'See you at 6:30, Rajesh. Bands ready? We’re locking session 4 of 5 tonight.', minsAgo: 130 },
        { id: 'cm5', fromId: 'client', kind: 'text', text: 'Ready. Knee felt fine yesterday.', minsAgo: 95 },
        { id: 'cm6', fromId: 'client', kind: 'meal', mealId: 'm-raj-lunch', text: 'Lunch logged', minsAgo: 14 },
        { id: 'cm7', fromId: 'ai', kind: 'teamonly', text: 'Copilot flag: rating average declining (4.2 to 3.5 stars week-over-week). Evidence: 6 rated meals. Suggested action drafted for Sneha.', minsAgo: 60 },
        { id: 'cm8', fromId: 'u-vikram', kind: 'teamonly', text: 'He mentioned knee soreness last week — going easy on lunges, watch in tonight’s session.', minsAgo: 55 },
      ],
      'c-meena': [
        { id: 'me1', fromId: 'u-anita', kind: 'card', text: 'Pinned: Dos & Don’ts · How we’ll work together', minsAgo: 20160 },
        { id: 'me2', fromId: 'u-sneha', kind: 'text', text: 'Meena, no pressure — even one photo today helps me help you.', minsAgo: 2880 },
        { id: 'me3', fromId: 'ai', kind: 'teamonly', text: 'Copilot flag: HIGH — no logs for 3 days. Non-response ladder at step 2 (call scheduled). Draft win-back message ready for Anita.', minsAgo: 240 },
      ],
      'c-sureshp': [
        { id: 'su1', fromId: 'u-vikram', kind: 'text', text: 'Big day — assessment-lite this morning, then your Level 5 review. You’ve earned this one.', minsAgo: 420 },
        { id: 'su2', fromId: 'client', kind: 'text', text: 'Let’s go!', minsAgo: 400 },
        { id: 'su3', fromId: 'ai', kind: 'teamonly', text: 'Level Review Pack compiled: engine reads upgrade-eligible on all four pillars. Decision grid open.', minsAgo: 180 },
      ],
      'c-priya': [
        { id: 'pr1', fromId: 'u-anita', kind: 'card', text: 'Pinned: Dos & Don’ts · Welcome to your observation window', minsAgo: 4320 },
        { id: 'pr2', fromId: 'u-sneha', kind: 'text', text: 'Hi Priya — days 1–5 we simply learn your life before we change it. Photos, not judgement.', minsAgo: 4300 },
        { id: 'pr3', fromId: 'client', kind: 'meal', mealId: 'm-priya-bf', text: 'Breakfast logged', minsAgo: 95 },
      ],
      'c-ananya': [
        { id: 'an1', fromId: 'ai', kind: 'card', text: 'Pinned: How your AI coach works · A human is always reachable for safety', minsAgo: 5760 },
        { id: 'an2', fromId: 'ai', kind: 'text', text: 'Morning, Ananya. Sleep synced at 6 h 50 m — a touch short. Tonight let’s try the 10:30 wind-down. Your 20-min guided flow is queued for 7 pm.', minsAgo: 480 },
        { id: 'an3', fromId: 'client', kind: 'meal', mealId: 'm-ana-bf', text: 'Breakfast logged', minsAgo: 210 },
        { id: 'an4', fromId: 'ai', kind: 'rating', mealId: 'm-ana-bf', text: 'Breakfast: 5 stars, rated instantly. A great protein and fibre start; the same idea at lunch keeps your energy steady.', minsAgo: 209 },
        { id: 'an5', fromId: 'client', kind: 'text', text: 'Feeling it already — remind me about water?', minsAgo: 180 },
        { id: 'an6', fromId: 'ai', kind: 'text', text: 'Done — nudges every 2 hours till 8 pm. You’re at 4 of 8 glasses.', minsAgo: 179 },
      ],
      'c-dev': [
        { id: 'dv1', fromId: 'ai', kind: 'card', text: 'Pinned: Your Svayam plan · AI coaches you daily — Vikram leads Fitness', minsAgo: 8640 },
        { id: 'dv2', fromId: 'ai', kind: 'rating', mealId: 'm-dev-lunch', text: 'Lunch: 4 stars, rated instantly. Solid plate; watch the curd portion.', minsAgo: 79 },
        { id: 'dv3', fromId: 'u-vikram', kind: 'text', text: 'Dev — 7 pm strength tonight. The AI flagged your squat depth from last session’s notes; we’ll fix form first, then load.', minsAgo: 120 },
        { id: 'dv4', fromId: 'client', kind: 'text', text: 'On it. Knees felt fine after the mobility work.', minsAgo: 90 },
        { id: 'dv5', fromId: 'ai', kind: 'teamonly', text: 'Copilot brief for Vikram: Dev’s squat depth inconsistent in 2 of 3 sessions; suggest tempo work. Sleep + protein trends attached.', minsAgo: 130 },
      ],
      'c-mathew': [
        { id: 'mt1', fromId: 'u-anita', kind: 'card', text: 'Pinned: Dos & Don’ts · How we’ll work together', minsAgo: 20160 },
        { id: 'mt2', fromId: 'u-sneha', kind: 'doc', text: 'Diet Plan · L5 · Cycle 8 — approved and published to your plan.', minsAgo: 2900 },
        { id: 'mt3', fromId: 'u-vikram', kind: 'text', text: 'Strong push day yesterday, Mathew — 17.5 kg held for all three sets. Pull day Wednesday, 6:30.', minsAgo: 1290 },
        { id: 'mt4', fromId: 'u-lakshmi', kind: 'text', text: 'Lovely balance work this morning — half moon without the wall, first time.', minsAgo: 600 },
        { id: 'mt5', fromId: 'client', kind: 'meal', mealId: 'm-mat-bf', text: 'Breakfast logged', minsAgo: 510 },
        { id: 'mt6', fromId: 'u-sneha', kind: 'rating', mealId: 'm-mat-bf', text: 'Breakfast rated 5 stars. Hold the 7 pm dinner line and this is the cycle the kilo goes.', minsAgo: 468 },
        { id: 'mt7', fromId: 'client', kind: 'meal', mealId: 'm-mat-lunch', text: 'Lunch logged', minsAgo: 270 },
        { id: 'mt8', fromId: 'ai', kind: 'teamonly', text: 'Copilot: Level 5 carried twice; 66.7 kg against the 66.0 target. Current deficit clears 0.7 kg by day 9 if the two-meal days hold — flag drops to low at a day-5 weigh-in of 66.4 or under.', minsAgo: 240 },
      ],
    },

    /* ---- the approval chains (SOP "Approval levels"). Each type lists the
       roles that must sign, in order, AFTER the owner submits; the last
       signature publishes. "Dept head" collapses onto the Operations Head
       seat in this demo cast — the chain shape is the SOP's. ---- */
    chains: {
      team:      [{ role: 'opsmgr' }, { role: 'opshead' }, { role: 'core' }],
      goalsheet: [{ role: 'opsmgr' }, { role: 'core' }],
      diet:      [{ role: 'opshead' }, { role: 'core' }],
      chart:     [{ role: 'opshead' }],
      level:     [{ role: 'opsmgr' }, { role: 'opshead' }],
      calendar:  [{ role: 'opsmgr' }, { role: 'opshead' }],
    },

    /* ---- the coach marketplace (CH-04 · "Get a coach") ----
       Reference catalogue, not user state — refilled from the seed on boot.
       staffId ties a listing to a real pod member so "Your coach" can lead
       the list; the rest are marketplace-only. Titles follow the naming
       decision: Nutrition Expert (never "Culture"), Mind Wellness Coach. */
    coachMarket: [
      { id: 'co-vikram', staffId: 'u-vikram', pillar: 'fitness', name: 'Vikram S.', title: 'Fitness Expert',
        years: 12, rating: 4.9, clients: 260, price: 9000,
        spec: ['Strength', 'Injury-safe training', 'Metabolic health'],
        line: 'Twelve years of strength coaching without a training injury on his watch — form first, load second.' },
      { id: 'co-arjun', pillar: 'fitness', name: 'Arjun P.', title: 'Fitness Expert',
        years: 8, rating: 4.8, clients: 180, price: 7500,
        spec: ['Fat loss', 'Running', 'Home training'],
        line: 'Turned 180 desk-bound beginners into steady movers — home blocks that survive busy weeks.' },
      { id: 'co-farhan', pillar: 'fitness', name: 'Farhan A.', title: 'Fitness Expert',
        years: 6, rating: 4.7, clients: 120, price: 6000,
        spec: ['Beginners', 'Mobility', 'Strength'],
        line: 'Endlessly patient with first-timers — the coach for the person who has never held a dumbbell.' },
      { id: 'co-sneha', staffId: 'u-sneha', pillar: 'culture', name: 'Sneha M.', title: 'Nutrition Expert',
        years: 10, rating: 4.9, clients: 240, price: 8500,
        spec: ['Diabetes-safe plates', 'South Indian kitchens', 'Weight loss'],
        line: 'Rebuilds the food you already love into the plan you actually follow — no imported diets.' },
      { id: 'co-divya', pillar: 'culture', name: 'Divya R.', title: 'Nutrition Expert',
        years: 7, rating: 4.8, clients: 150, price: 7000,
        spec: ['PCOS nutrition', 'Gut health', 'Family meals'],
        line: 'One plan the whole family can eat — hormone-aware plates that never need a second kitchen.' },
      { id: 'co-kavitha', pillar: 'culture', name: 'Kavitha S.', title: 'Nutrition Expert',
        years: 9, rating: 4.7, clients: 190, price: 6500,
        spec: ['Vegetarian protein', 'Meal prep', 'Sustainable habits'],
        line: 'Protein-complete vegetarian eating, planned Sunday to Sunday — habits that hold at month six.' },
      { id: 'co-lakshmi', staffId: 'u-lakshmi', pillar: 'yoga', name: 'Lakshmi N.', title: 'Yoga Expert',
        years: 14, rating: 4.9, clients: 300, price: 8000,
        spec: ['Hatha', 'Mobility', 'Breath work'],
        line: 'Fourteen years of live teaching — she reads a room of one as closely as a shala of forty.' },
      { id: 'co-ishaan', pillar: 'yoga', name: 'Ishaan V.', title: 'Yoga Expert',
        years: 9, rating: 4.8, clients: 170, price: 6500,
        spec: ['Ashtanga', 'Back care', 'Flexibility'],
        line: 'Back-care first: half his practice was built for people who sit ten hours a day.' },
      { id: 'co-anju', pillar: 'yoga', name: 'Anju T.', title: 'Yoga Expert',
        years: 6, rating: 4.7, clients: 110, price: 5500,
        spec: ['Gentle yoga', 'Balance', 'Beginners'],
        line: 'Gentle, exact, unhurried — the teacher for a body that needs convincing, not conquering.' },
      { id: 'co-meera', staffId: 'u-meera', pillar: 'wellness', name: 'Meera J.', title: 'Mind Wellness Coach',
        years: 11, rating: 4.9, clients: 220, price: 7500,
        spec: ['Sleep', 'Yoga nidra', 'Stress'],
        line: 'Sleep is her craft — eleven years of turning racing evenings into quiet nights.' },
      { id: 'co-rahul', pillar: 'wellness', name: 'Rahul B.', title: 'Mind Wellness Coach',
        years: 8, rating: 4.8, clients: 140, price: 6000,
        spec: ['Meditation', 'Screen habits', 'Focus'],
        line: 'A former product manager who rebuilt his own attention — and now coaches yours.' },
      { id: 'co-sara', pillar: 'wellness', name: 'Sara F.', title: 'Mind Wellness Coach',
        years: 7, rating: 4.7, clients: 130, price: 5500,
        spec: ['Breath work', 'Evening rituals', 'Calm'],
        line: 'Ten quiet minutes, twice a day — her clients keep the ritual years after they stop needing her.' },
    ],

    /* ---- approvals — every sign-off in one engine (CC-05 + SOP chains).
       status: draft → submitted (stage = which signature it waits on) →
       published (→ confirmed, calendars only, when the client confirms).
       history is the audit trail: one line per act, oldest first. ---- */
    approvals: [
      { id: 'ap-sur-chart', type: 'chart', clientId: 'c-sureshp', pillar: 'fitness', title: 'Workout Chart · L6 · Cycle 6 (next level)',
        ownerId: 'u-vikram', status: 'draft', stage: 0, history: [], due: 'Day ' + SHAPE.reviewDay + ' (today)',
        aiDraft: 'L6 · Cycle 6 · 5 sessions: 2 hill-strength, 2 tempo+mobility, 1 assessment-lite. Keeps knee-safe loading (ACL flag). Alternate-day layout with yoga.' },
      { id: 'ap-sur-diet', type: 'diet', clientId: 'c-sureshp', pillar: 'culture', title: 'Diet Plan · L5 · Cycle 6 (next level)',
        ownerId: 'u-sneha', status: 'submitted', stage: 0, due: 'Day 10 @ 12:00',
        history: [{ act: 'submitted', byId: 'u-sneha', note: '', minsAgo: 210 }],
        aiDraft: 'Endurance base + 10% protein bump. Race-week carb pattern in week 2. Swaps table included.' },
      { id: 'ap-sur-cal', type: 'calendar', clientId: 'c-sureshp', pillar: null, title: '11-day Calendar · Cycle 6',
        ownerId: 'u-anita', status: 'submitted', stage: 1, due: 'Day 10 @ 13:00 · 23 min left',
        history: [{ act: 'submitted', byId: 'u-anita', note: 'Zero conflicts against pod availability.', minsAgo: 300 },
                  { act: 'approved', byId: 'u-rohan', note: 'Layout checked against capacity.', minsAgo: 120 }],
        aiDraft: '5+3+1 assembled on alternate days (9 session + 2 active rest) against pod availability. Zero conflicts.' },
      { id: 'ap-raj-yoga', type: 'chart', clientId: 'c-rajesh', pillar: 'yoga', title: 'Yoga Chart · L3 · Cycle 4 (next level)',
        ownerId: 'u-lakshmi', status: 'draft', stage: 0, history: [], due: 'Day ' + SHAPE.reviewDay,
        aiDraft: 'L3→L4 progression: longer holds, add shoulder-stand prep. Respect back-pain flag: no deep backbends.' },
      /* a finished chain, so the audit trail has a complete example to show */
      { id: 'ap-raj-diet', type: 'diet', clientId: 'c-rajesh', pillar: 'culture', title: 'Diet Plan · L2 · Cycle 3',
        ownerId: 'u-sneha', status: 'published', stage: 2, due: 'Done',
        history: [{ act: 'submitted', byId: 'u-sneha', note: '', minsAgo: 3100 },
                  { act: 'approved', byId: 'u-sureshk', note: 'Diabetic-safe swaps verified.', minsAgo: 2950 },
                  { act: 'approved', byId: 'u-bineesh', note: '', minsAgo: 2800 },
                  { act: 'published', byId: 'u-bineesh', note: '', minsAgo: 2800 }],
        aiDraft: 'Low-GI rotation with a 46 g protein floor. Post-meal walk cues after lunch and dinner.' },
      /* a returned chain — the reason travels with the chart */
      { id: 'ap-meena-diet', type: 'diet', clientId: 'c-meena', pillar: 'culture', title: 'Diet Plan · L2 · Cycle 3 (re-engagement)',
        ownerId: 'u-sneha', status: 'draft', stage: 0, due: 'This week',
        returnReason: 'Add BP-safe sodium guidance before this goes up — Dr. Kavya’s flag.',
        history: [{ act: 'submitted', byId: 'u-sneha', note: '', minsAgo: 1500 },
                  { act: 'returned', byId: 'u-sureshk', note: 'Add BP-safe sodium guidance before this goes up — Dr. Kavya’s flag.', minsAgo: 1320 }],
        aiDraft: 'Gentle re-entry: 3 anchor meals, no fasting windows. Comfort-food swaps from her favourites list.' },
      { id: 'ap-nisha-goal', type: 'goalsheet', clientId: null, prospect: 'Nisha T.', title: 'Goal Sheet & starting levels · Nisha T.',
        ownerId: 'u-anita', status: 'draft', stage: 0, history: [], due: '24 h SLA · 9 h left',
        departments: { fitness: 'approved', culture: 'pending', yoga: 'approved', wellness: 'approved' },
        aiDraft: 'Proposed: F-L1 · C-L2 · Y-L1 · W-L1 from assessment. Reasoning: sedentary baseline, strong home-cooking habit.' },
      /* waiting on the Super User — Bineesh's demo moment */
      { id: 'ap-nisha-team', type: 'team', clientId: null, prospect: 'Nisha T.', title: 'Care team allocation · Nisha T.',
        ownerId: 'u-anita', status: 'submitted', stage: 2, due: 'Before assessment call',
        history: [{ act: 'submitted', byId: 'u-anita', note: 'Sneha · Vikram · Lakshmi · Meera · Dr. Kavya proposed.', minsAgo: 700 },
                  { act: 'approved', byId: 'u-rohan', note: '', minsAgo: 540 },
                  { act: 'approved', byId: 'u-sureshk', note: 'Vikram at capacity — override noted.', minsAgo: 420 }],
        aiDraft: 'Pod proposal: Dietician Sneha (42/50), Fitness Vikram (50/50 — needs override), Yoga Lakshmi, Mind Meera, Dr. Kavya.' },
    ],

    /* ---- Culture level-upgrade checklist (source: LEVEL UPGRADE CHECKLIST haalving culture.docx) ----
       Five gates per level; goals vary per level and per activity track. */
    cultureCriteria: {
      gates: [
        { key: 'goals', label: 'Level goals achieved', target: '≥ 80%' },
        { key: 'diet', label: 'Diet plan compliance', target: '≥ 80%' },
        { key: 'group', label: 'Group participation & recommendations', target: '≥ 80%' },
        { key: 'photos', label: 'Food photo updates', target: 'min 25 of 33' },
        { key: 'calpro', label: 'Calorie & protein targets', target: '≥ 80%' },
      ],
      tracks: {
        sedentary: { label: 'Sedentary', levels: {
          1: { goals: ['Gut health improvement', 'Symptom/discomfort stabilisation', 'Building healthy eating habits', 'Understanding the star rating system', 'Level-based happy habits ≥ 80%'] },
          2: { goals: ['Improved hormone response', 'Controlled sugar cravings and appetite', 'Proper inclusion of fibre, protein and carbohydrates', 'Minimum 4-star meals achieved in this phase', 'Level-based happy habits ≥ 80%'] },
          3: { goals: ['Functional nutrient-based modification', 'Improved energy levels', 'Nutritional deficiency correction support', 'Improved hydration and nourishment', 'Minimum 5-star meals achieved', '14-hour intermittent fasting followed properly', 'Level-based happy habits ≥ 80%'] },
          4: { goals: ['Increased protein intake', 'Maintaining 5-star meals', '14-hour intermittent fasting followed properly', 'Level-based happy habits ≥ 80%'] },
          5: { goals: ['Prevent stagnation phase', 'Maintain medical stability', 'Preserve muscle mass', '14-hour intermittent fasting', '2 meals/day twice weekly (based on suitability)', 'Maintaining 5-star meals', 'Level-based happy habits ≥ 80%'] },
          6: { goals: ['Sustained energy levels', 'Prevent weight regain', 'Flexible food choices', 'One meal/day practice weekly (based on suitability)', 'Maintaining 5-star meals', 'Level-based happy habits ≥ 80%'] },
          7: { goals: ['Goal-based calorie management', 'Improved body composition', 'Progressive protein intake improvement', 'All level habits followed', 'Maintaining 5-star meals', 'Level-based happy habits ≥ 80%'] },
        } },
        moderate: { label: 'Moderately Active', levels: {
          1: { name: 'Foundation Phase', goals: ['Balanced meal plate (protein + fibre + healthy carbs)', 'Consistent meal timing', 'Adequate daily protein intake', 'Processed foods reduced by 60%', 'Daily water intake target achieved', 'Level-based happy habits ≥ 80%'] },
          2: { name: 'Activation & Rebuild Phase', goals: ['Protein intake per activity level', 'Disease-specific nutrition recommendations followed', 'Processed foods reduced by 70%', 'Daily hydration target achieved', 'Soluble and insoluble fibre variety', 'Level-based happy habits ≥ 80%'] },
          3: { name: 'Strength & Healing Phase', goals: ['Probiotic and prebiotic foods regularly', 'Anti-inflammatory foods consistently', 'Protein improved per body goal', 'Processed foods reduced by 80%', '100% daily water target', 'Level-based happy habits ≥ 80%'] },
          4: { name: 'Happy Energy Phase', goals: ['Suitable pre-workout meal', 'Essential vitamins and minerals daily', 'Consistent meal timing maintained', 'Processed foods reduced by 90%', 'Daily hydration maintained', 'Level-based happy habits ≥ 80%'] },
          5: { name: 'Habit Transition Phase', goals: ['Protein intake further optimised', 'Healthy portion control', '2 meals/day twice weekly (where suitable)', 'Processed foods avoided completely', '6–8 hours quality sleep', 'Level-based happy habits ≥ 80%'] },
          6: { name: 'Sustainable Phase', goals: ['Protein maintained per body goal', '80:20 healthy eating rule', 'Two meals/day twice weekly', 'One meal/day once weekly (rest day, if suitable)', 'Healthy choices maintained consistently', 'Level-based happy habits ≥ 80%'] },
          7: { name: 'Haalving Phase', goals: ['One meal/day twice weekly (where suitable)', 'Consistent protein intake', 'Stable energy through the day', 'Healthy digestion and gut health', 'Healthy body composition maintained', 'Level-based happy habits ≥ 80%'] },
        } },
        active: { label: 'Active', levels: {
          1: { goals: ['Symbiosis development', 'Gut health improvement', 'Better digestion and metabolism', 'Enjoyable, sustainable eating pattern', 'Adequate protein intake', 'Level-based happy habits ≥ 80%'] },
          2: { goals: ['Improved hormone response', 'Controlled sugar cravings', 'Controlled appetite', 'Proper pre/post-workout meal distribution', '2 meals/day twice on selected days', '5-star meals achieved', 'Level-based happy habits ≥ 90%'] },
          3: { goals: ['Improved energy levels', 'Nutritional deficiency correction', 'Support autophagy and deep cellular healing', '5-star meals achieved', 'Level-based happy habits ≥ 80%'] },
          4: { goals: ['Support deep ketosis', 'Better sleep quality, reduced stress', 'Muscle preservation', 'Better immune function', '5-star meals achieved', 'One meal/day practice twice (based on suitability)', 'Level-based happy habits ≥ 80%'] },
          5: { goals: ['Muscle preservation', 'Increased fat oxidation', 'Improved overall body functions', 'Free radical neutralisation support', '5-star meals achieved', 'Level-based happy habits ≥ 80%'] },
          6: { goals: ['Improved internal functions', 'Intuitive eating habits', 'Higher fasting intervals (based on suitability)', 'Consistent sustainable habits', '5-star meals achieved', 'Level-based happy habits ≥ 80%'] },
        } },
      },
    },

    /* ---- Fitness & Yoga level-up checklist (source: Rawmaterials/"Criteria for
       each level check list" PDF) — the body-side twin of cultureCriteria.
       The paper rule: reach 75% of the level's goals, keep cancellations down,
       practise the chart as written. Session bars (min 4 of 5 fitness, 3 of 3
       yoga) are the SOP full-cycle rule the review engine already applies. ---- */
    bodyCriteria: {
      bar: '≥ 75% of level goals',
      sessionBars: { fitness: 'min 4 of 5', yoga: '3 of 3' },
      tracks: {
        sedentary: { label: 'Sedentary', levels: {
          1: ['Ease stiffness', 'Boost awareness', 'Gentle motion', 'Reduce tension'],
          2: ['Set base', 'Align posture', 'Build stability', 'Safe moves', 'Daily support'],
          3: ['Activate core', 'Strengthen abs', 'Improve posture', 'Support organs', 'Ignite power'],
          4: ['Gain strength', 'Build endurance', 'Muscle growth', 'Functional power', 'Resist weakness'],
          5: ['Master balance', 'Heighten awareness', 'Sharpen focus', 'Boost coordination', 'Steady mind'],
          6: ['Extend stamina', 'Fluid flow', 'Breath sync', 'Dynamic sequences', 'Fight fatigue'],
          7: ['Integrate practice', 'Form habits', 'Daily routine', 'Lifestyle shift', 'Lifelong adherence'],
        } },
        moderate: { label: 'Moderately Active', levels: {
          1: ['Perfect posture', 'Assess flexibility', 'Identify weaknesses', 'Build awareness'],
          2: ['Build muscle', 'Improve endurance', 'Enhance balance', 'Integrate poses'],
          3: ['Strengthen core', 'Boost stability', 'Refine balance', 'Increase control'],
          4: ['Master sequences', 'Smooth transitions', 'Build rhythm', 'Increase stamina'],
          5: ['Deepen stretches', 'Expand range', 'Release tension', 'Improve mobility'],
          6: ['Boost power', 'Extend holds', 'Heighten intensity', 'Sustain energy'],
          7: ['Calm mind', 'Unite breath', 'Deepen focus', 'Achieve harmony'],
        } },
        active: { label: 'Active', levels: {
          1: ['Restore joint motion', 'Calm the nervous system', 'Improve posture', 'Prevent injuries'],
          2: ['Build body strength', 'Sync breath and motion', 'Strengthen stabilisers', 'Link training and mindfulness'],
          3: ['Sharpen balance', 'Focus the mind', 'Improve coordination', 'Build patience'],
          4: ['Smooth transitions', 'Boost endurance', 'Ready the body', 'Mind–body flow'],
          5: ['Increase flexibility', 'Release tension', 'Improve posture', 'Relax deeply'],
          6: ['Maximise power', 'Boost focus', 'Protect joints', 'Sustain performance'],
          7: ['Deep recovery', 'Self-reflection', 'Recalibrate the body', 'Align lifestyle'],
        } },
      },
    },

    /* ---- level review packs (CC-06), keyed by client — Suresh P. is at
       day 9 with his ready. Renamed from the singular levelPack so a second
       client's review can open without evicting the first. ---- */
    levelPacks: {
      'c-sureshp': {
      clientId: 'c-sureshp', ready: true,
      engine: { fitness: '4/5 met (bar is 4)', yoga: '3/3 met', wellness: '1/1 met', compliance: '86% met · photos 29/33 (min 25)' },
      culture: {
        track: 'active', level: 4,
        gates: [
          { key: 'goals', value: '86% (6 of 7 goals)', met: true },
          { key: 'diet', value: '86%', met: true },
          { key: 'group', value: '92%', met: true },
          { key: 'photos', value: '29 of 33', met: true },
          { key: 'calpro', value: '88%', met: true },
        ],
        note: 'One goal partially met: one-meal/day practised once of twice — within the 80% bar.',
      },
      headline: 'Engine: upgrade eligible on all four pillars. Nutrition checklist: 5 of 5 gates met (Active L4). Full-cycle badge: earned (5+3+1+80%).',
      decisions: { fitness: null, culture: null, yoga: null, wellness: null },
      deptOwner: { fitness: 'u-vikram', culture: 'u-sneha', yoga: 'u-lakshmi', wellness: 'u-meera' },
      cardDraft: 'Four pillars up! Fitness → L6, Nutrition → L5, Yoga → L6, Mind Wellness → L6. Suresh, this was a complete cycle — every session, every plate, on rhythm. Day-' + SHAPE.meetingDay + ' progress meeting: Wednesday 7 pm.',
      published: false, handedOver: false,
      },
    },

    /* ---- morning digest (CC-01), per attention order ---- */
    digest: [
      { clientId: 'c-meena', flag: 'high', text: 'No logs for 3 days. Non-response ladder is at step 2; call scheduled today (Anita). Last seen Tue evening.', evidence: 'tracker log · ladder rule' },
      { clientId: 'c-rajesh', flag: 'med', text: 'Logged 2/3 meals (averaging 3.5 stars, down from 4.2), 6,100 steps, missed evening water. Today: Fitness 6:30 pm with Vikram.', evidence: '6 rated meals · tracker sync' },
      { clientId: 'c-mathew', flag: 'med', text: 'Level 5, third carry: 0.7 kg to target, 8 days left. Morning yoga done; lunch awaiting rating (SLA 38 min).', evidence: 'goal ledger · cycle reports' },
      { clientId: 'c-sureshp', flag: null, text: 'Day ' + SHAPE.reviewDay + '. Level Review Pack ready; the engine reads upgrade-eligible on all four pillars. Assessment-lite 6:00 am done.', evidence: 'level pack' },
      { clientId: 'c-priya', flag: null, text: 'Observation day 3 of 5, with 7 of 10 meal photos in. On pace; no action needed.', evidence: 'observation counter' },
      { clientId: 'c-dev', flag: null, text: 'Svayam plan: AI coaches day-to-day, you lead Fitness. Copilot brief ready — squat-depth tempo work for tonight’s 7 pm session.', evidence: 'copilot brief · session notes' },
    ],
    followupDrafts: [
      { id: 'fd1', clientId: 'c-rajesh', text: 'Great consistency this week, Rajesh — tonight’s session locks your 4th of 5. Bands ready?', status: 'draft' },
      { id: 'fd2', clientId: 'c-meena', text: 'We saved your progress exactly where you left it, Meena. One small step restarts everything, even one photo.', status: 'draft' },
      { id: 'fd3', clientId: 'c-sureshp', text: 'Big day, Suresh: your review is this afternoon. Whatever the grid says, this cycle was your best yet.', status: 'draft' },
    ],

    /* ---- work list / deviations / ops boards (CC-10) ---- */
    worklist: [
      { id: 'w1', text: 'Call Meena I. — no logs 48 h (rule: non-response ladder)', owner: 'u-anita', due: 'today', pill: 'warn', status: 'open', type: 'task' },
      { id: 'w2', text: 'Approve Cycle-6 calendar — Suresh P.', owner: 'u-sureshk', due: '13:00 · 23 min', pill: 'bad', status: 'open', type: 'task' },
      { id: 'w3', text: 'Rate Rajesh D. lunch (SLA 46 min left)', owner: 'u-sneha', due: 'SLA', pill: 'warn', status: 'open', pillar: 'culture', type: 'rating' },
      { id: 'w6', text: 'Rate Mathew lunch (SLA 38 min left)', owner: 'u-sneha', due: 'SLA', pill: 'warn', status: 'open', pillar: 'culture', type: 'rating' },
      { id: 'w4', text: 'Health Summary — Kiran R. blood panel', owner: 'u-kavya', due: 'today', pill: 'warn', status: 'open', type: 'task' },
      { id: 'w5', text: 'Record Mind decision — Suresh P. level review', owner: 'u-meera', due: 'today', pill: 'info', status: 'open', pillar: 'wellness', type: 'review' },
    ],
    deviations: [
      { client: 'Meena I.', type: 'Non-response (3 d)', state: 'Ladder step 2 — human call today', mode: 'Coach' },
      { client: 'Priya K.', type: 'Meal photo SLA breach', state: 'Ops notified · queue reordered', mode: 'Coach' },
      { client: 'Rajesh D.', type: 'Rating decline over 1 star WoW', state: 'Nudge drafted, awaiting Sneha', mode: 'Coach' },
    ],
    opsStats: { unrated60: 1, unconfirmedCal24: 1, approvals4h: 0, onTime: '96%' },

    /* ---- calorie log (replaces the calorie sheet) & incentive tracker ---- */
    calorieLog: [
      { clientId: 'c-rajesh', date: 'Today', meals: '2 / 3', protein: 46, kcal: 990, note: 'Dinner pending' },
      { clientId: 'c-rajesh', date: 'Yesterday', meals: '3 / 3', protein: 68, kcal: 1610, note: '' },
      { clientId: 'c-sureshp', date: 'Today', meals: '3 / 3', protein: 82, kcal: 1740, note: 'Run day fuelling' },
      { clientId: 'c-mathew', date: 'Today', meals: '2 / 3', protein: 62, kcal: 910, note: 'Dinner window closes 7 pm' },
      { clientId: 'c-meena', date: 'Today', meals: '0 / 3', protein: 0, kcal: 0, note: 'No logs — ladder active' },
      { clientId: 'c-priya', date: 'Today', meals: '1 / 3', protein: 14, kcal: 420, note: 'Observation — capture only' },
    ],
    incentives: [
      { staffId: 'u-vikram', sessions: 41, avgRating: 4.8, onTime: '98%', payout: '₹12,300' },
      { staffId: 'u-lakshmi', sessions: 33, avgRating: 4.9, onTime: '100%', payout: '₹9,900' },
      { staffId: 'u-meera', sessions: 12, avgRating: 5.0, onTime: '100%', payout: '₹4,800' },
      { staffId: 'u-sneha', sessions: 0, avgRating: 4.7, onTime: '96%', payout: '₹8,200' },
    ],

    /* ---- documents & health summaries (CC-12; raw = Doctor only) ---- */
    documents: [
      { id: 'd1', clientId: 'c-rajesh', name: 'InBody report', date: '12 Oct', type: 'InBody', summary: 'ready' },
      /* not "Blood panel": this one document is the source of Rajesh's whole
         Vital Panel, microbiome and Epilimo included, and a name that promised
         only bloodwork would contradict the twelve categories it draws */
      { id: 'd2', clientId: 'c-rajesh', name: 'Health panel (HbA1c 7.1)', date: '14 Oct', type: 'Lab', summary: 'ready' },
      { id: 'd3', clientId: 'c-kiran', prospect: 'Kiran R.', name: 'Blood panel', date: 'Today', type: 'Lab', summary: 'pending' },
      { id: 'd4', clientId: 'c-sureshp', name: 'Knee MRI (2019, ACL)', date: '2 Oct', type: 'Imaging', summary: 'ready' },
      { id: 'd6', clientId: 'c-mathew', name: 'Body composition report (intake)', date: '27 Nov', type: 'InBody', summary: 'ready' },
      /* the source of Ananya's Vital Panel — the panel cites a reviewed report,
         so that report has to exist in her vault or the two screens contradict */
      { id: 'd5', clientId: 'c-ananya', name: 'Annual health check', date: '2 Nov', type: 'Lab', summary: 'ready' },
    ],
    healthSummaries: {
      d1: { conditions: ['Overweight (BMI 28.4)'], flags: ['Progressive loading only'], metrics: ['SMM 31.2 kg', 'PBF 27%'], signedBy: 'u-kavya' },
      d2: { conditions: ['Type-2 diabetes'], flags: ['No fasting workouts', 'Monitor post-meal walks'], metrics: ['HbA1c 7.1'], signedBy: 'u-kavya' },
      d4: { conditions: ['Old ACL repair'], flags: ['Knee-safe loading', 'No deep pivots'], metrics: ['Full ROM'], signedBy: 'u-kavya' },
      d6: { conditions: ['Overweight at intake (BMI 28.3)', 'Visceral fat grade 12'],
            flags: ['Progressive loading only — age 59', 'Protein floor 90 g · muscle +3.2 kg target', 'Re-test body age at Level 7'],
            metrics: ['Weight 80.9 kg', 'PBF 38%', 'SMM 27.6 kg', 'BMR 1452 kcal', 'Body age 63'], signedBy: 'u-kavya' },
      d5: { conditions: ['Iron-deficiency pattern (microcytic)', 'Subclinical hypothyroidism'],
            flags: ['Recheck TSH in 8 weeks', 'Iron-rich plan, pair with vitamin C'],
            metrics: ['Hb 11.6', 'MCV 82.1', 'TSH 5.2'], signedBy: 'u-kavya' },
    },

    /* ---- onboarding pipeline (CC-07) ----
       `step` is a key from the SOP flow in console-pipeline.js; every step
       BEFORE it is complete by definition of having been passed, so only the
       current step needs ticks. `ticks` is keyed '<step>#<taskIndex>'.
       The five arrivals are deliberately spread across the four phases so the
       board shows the whole process at once. */
    pipeline: [
      { id: 'p1', name: 'Arun M.', step: 'records', ticks: {},
        note: 'Registered 2 h ago — records not in yet', mins: 120, plan: 'poorna' },
      { id: 'p2', name: 'Divya S.', step: 'assessprep', ticks: { 'assessprep#0': true, 'assessprep#1': true },
        note: 'Assessment call set for tomorrow 10:00 — reminders pending', mins: 1440, plan: 'poorna' },
      { id: 'p3', name: 'Kiran R.', step: 'assessafter',
        ticks: { 'assessafter#0': true, 'assessafter#2': true, 'assessafter#3': true },
        note: 'Assessment done · InBody key-in pending, summary pending (Dr. Kavya)', mins: 300, plan: 'poorna' },
      { id: 'p4', name: 'Nisha T.', step: 'obs4',
        ticks: { 'obs4#0': true, 'obs4#1': true },
        note: 'Observation day 4 — goal sheet approved, calendar data being collected', mins: 900, plan: 'poorna' },
      { id: 'p5', name: 'Rahul V.', step: 'calafter',
        ticks: { 'calafter#0': true, 'calafter#1': true },
        note: 'Calendar meeting done — posters still to go out', mins: 60, plan: 'poorna' },
    ],
    capacity: [
      { staffId: 'u-sneha', roleLabel: 'Dietician', load: 42, cap: 50 },
      { staffId: 'u-vikram', roleLabel: 'Fitness Coach', load: 50, cap: 50, full: true },
      { staffId: 'u-lakshmi', roleLabel: 'Yoga Coach', load: 31, cap: 40 },
      { staffId: 'u-meera', roleLabel: 'Mind Wellness Coach', load: 18, cap: 40 },
      { staffId: 'u-kavya', roleLabel: 'Doctor', load: 88, cap: 120 },
    ],

    /* CC-13's old list-schedule seed is gone — the calendar view
       (console-schedule.js) seeds HV.store.tasks from the SOP instead.
       The two demo extras (meeting responses + the 2-h-out reminder session)
       are patched onto that lazy seed by core.js once tasks exist. */

    /* ---- notification rules (CC-10 admin) ---- */
    notifRules: [
      { id: 'n1', name: 'Water reminder', schedule: '2-hourly · 08:00–20:00', audience: 'Clients (opted in)', channel: 'Push', enabled: true },
      { id: 'n2', name: 'Session confirmation', schedule: 'T-1 day + T-60 min', audience: 'Client + trainer', channel: 'Push', enabled: true },
      { id: 'n3', name: 'Meal follow-up', schedule: '08:00 / 13:30 / 20:30', audience: 'Clients', channel: 'Push', enabled: true },
      { id: 'n4', name: 'Non-response ladder', schedule: '24 h → 48 h → human call', audience: 'Team + client', channel: 'Push + task', enabled: true },
      { id: 'n5', name: 'Quiet hours', schedule: '22:00–07:00 (session-critical exempt)', audience: 'All', channel: '—', enabled: true },
    ],

    /* ---- the start assessment, as a conversation (client-coach.js engine).
       Reference catalogue: content, not user state — boot-refilled, so adding
       or editing a step never needs a seedVersion bump. Steps run in order;
       interactive kinds (choice / multi / grade) wait for the client, the
       rest post together. `save` keys the answer into assessRun.ans, and
       {name} {day} {flex} {balance} in later text interpolate those answers.
       The speaker is decided at runtime: Anita on Poorna, the AI otherwise. */
    assessFlow: [
      { id: 'intro', kind: 'rich', text: 'Before we build anything, we read where you are — honestly, kindly, in about **three minutes**.\nWe’ll cover:\n• How your days actually move\n• One short film on the way of living we build from\n• Two gentle physical self-tests — nothing to prove\nYour answers set the level you _start_ at. Starting low is not a judgement; it’s a calibration.' },
      { id: 'film', kind: 'media', text: 'Sixty seconds from the backwaters — the way of living everything here is built from.', media: { type: 'video', src: 'media/welcome.mp4', poster: 'media/welcome.jpg', alt: 'HAALVING — a way of living, filmed on Kerala’s backwaters' } },
      { id: 'ready', kind: 'choice', style: 'chips', text: 'Ready when you are.', opts: [
        { k: 'go', label: 'Let’s begin' },
        { k: 'ask', label: 'I have a question first', reply: 'Ask it right here whenever it forms — a human reads this thread every day. Meanwhile, let’s begin.' },
      ] },
      { id: 'day', kind: 'choice', style: 'list', save: 'day', text: 'How does a typical weekday move for you?', opts: [
        { k: 'sedentary', label: 'Mostly seated', sub: 'Desk, drives, screens — movement is the exception' },
        { k: 'moderate', label: 'On my feet a fair bit', sub: 'Errands, stairs, short walks woven through' },
        { k: 'active', label: 'Moving most of the day', sub: 'Regular exercise, or an active job' },
      ] },
      { id: 'truths', kind: 'multi', save: 'truths', text: 'Which of these are true for you most weeks? Choose all that apply.', opts: [
        { k: 'sleep', label: 'I sleep under 7 hours most nights' },
        { k: 'desk', label: 'I sit 8+ hours a day' },
        { k: 'walk', label: 'I get outside for a walk most days' },
        { k: 'cook', label: 'Most of my meals are home-cooked' },
        { k: 'stress', label: 'Evenings carry the day’s stress home' },
      ] },
      { id: 'body', kind: 'rich', text: 'Now the body reads — **two small self-tests**, right where you’re standing.\nNo camera, no coach watching. You grade yourself; honest reads make an honest plan.' },
      { id: 'fold', kind: 'media', text: 'Uttanasana — the standing forward fold. Soften the knees, exhale, and let the arms hang. Three slow breaths, then reach toward the floor.', media: { type: 'gif', src: 'img/assess/uttanasana-loop.webp', alt: 'Uttanasana, the standing forward fold — a slow breathing loop' } },
      { id: 'flex', kind: 'grade', save: 'flex', img: 'img/assess/uttanasana.webp', text: 'Where did your hands settle on the third breath?', opts: [
        { k: 'floor', label: 'Palms flat on the floor', sub: 'Deep fold, easy breath', band: 4 },
        { k: 'toes', label: 'Fingertips brushing the toes', band: 3 },
        { k: 'shin', label: 'Around mid-shin', band: 2 },
        { k: 'knee', label: 'Above the knees', sub: 'The most common honest answer', band: 1 },
      ] },
      { id: 'balance', kind: 'choice', style: 'list', save: 'balance', text: 'One more: stand on one leg, eyes open. How long before the other foot touched down?', opts: [
        { k: 'b10', label: 'Under 10 seconds' },
        { k: 'b30', label: '10–30 seconds' },
        { k: 'b60', label: '30–60 seconds' },
        { k: 'b60p', label: 'Over a minute' },
      ] },
      { id: 'wrap', kind: 'rich', text: 'Thank you, {name} — that took honesty, and honesty is the whole foundation.\nYour first reads:\n• Movement: **{day}**\n• Forward fold: **{flex}**\n• Balance: **{balance}**\nYour circle takes these into your live assessment and confirms the level each pillar starts at. Nothing here is a verdict — it’s a baseline, and baselines exist to be moved.' },
    ],

    /* ---- the review-day check-in, as a conversation (client-coach.js).
       Same item schema and same standing as assessFlow above: a reference
       catalogue (boot-refilled — editing a question never needs a seedVersion
       bump). `save` keys each answer into c.reviewAns[cycle].ans. ---- */
    reviewFlow: [
      { id: 'energy', kind: 'choice', style: 'list', save: 'energy', text: 'How was your energy this cycle, overall?', opts: [
        { k: 'rising', label: 'Rising', sub: 'Better than the cycle before' },
        { k: 'steady', label: 'Steady', sub: 'About the same' },
        { k: 'dipping', label: 'Dipping', sub: 'Harder than usual' },
      ] },
      { id: 'hardest', kind: 'multi', save: 'hardest', text: 'Which habits were hardest to hold? Choose all that apply.', opts: [
        { k: 'meals', label: 'Meal timing and plates' },
        { k: 'sessions', label: 'Making every session' },
        { k: 'sleep', label: 'The wind-down and sleep window' },
        { k: 'water', label: 'Water through the day' },
        { k: 'screen', label: 'Screen discipline' },
      ] },
      { id: 'sleepq', kind: 'choice', style: 'list', save: 'sleepq', text: 'How did you sleep, most nights?', opts: [
        { k: 'deep', label: '7+ hours, woke rested' },
        { k: 'broken', label: 'Enough hours, but broken' },
        { k: 'short', label: 'Under 7 most nights' },
      ] },
      { id: 'confidence', kind: 'grade', save: 'confidence', text: 'How confident do you feel about the next level?', opts: [
        { k: 'c5', label: 'Ready now', sub: 'Bring it on', band: 5 },
        { k: 'c4', label: 'Mostly ready', band: 4 },
        { k: 'c3', label: 'Halfway there', band: 3 },
        { k: 'c2', label: 'Unsure', band: 2 },
        { k: 'c1', label: 'Not yet', sub: 'The honest answer is also fine', band: 1 },
      ] },
      { id: 'change', kind: 'choice', style: 'list', save: 'change', text: 'One thing you would change about the plan?', opts: [
        { k: 'timing', label: 'Session timings' },
        { k: 'variety', label: 'More meal variety' },
        { k: 'pace', label: 'Slow the pace a little' },
        { k: 'nothing', label: 'Nothing — keep it as is' },
      ] },
      { id: 'team', kind: 'choice', style: 'chips', save: 'team', text: 'A word for your team before the review?', opts: [
        { k: 'grateful', label: 'Grateful — they carried me' },
        { k: 'push', label: 'Push me harder' },
        { k: 'listen', label: 'I need more listening' },
      ] },
    ],

    /* ---- time & cover: leave applications and the reallocation flow ----
       status walks reassign (waiting on the HoD's cover board) → pending
       (waiting on leaveConfig.approverRole) → approved | declined. Approving
       writes podCover onto each reallocated client — see c-rajesh/c-sureshp,
       whose entries match lv-0 so temporary access is live at boot. ---- */
    leaves: [
      { id: 'lv-0', staffId: 'u-sneha', from: isoIn(0), to: isoIn(1),
        reason: 'Medical appointment in Kochi', status: 'approved',
        reallocations: [
          { clientId: 'c-rajesh', roleKey: 'dietitian', toId: 'u-divya' },
          { clientId: 'c-sureshp', roleKey: 'dietitian', toId: 'u-divya' },
        ],
        history: [
          { act: 'applied', byId: 'u-sneha', ts: msAgo(2880) },
          /* the dietitian bench has no HoD yet, so Ops Head ran the board */
          { act: 'reassigned', byId: 'u-sureshk', ts: msAgo(1500) },
          { act: 'approved', byId: 'u-anita', ts: msAgo(1380) },
        ] },
      { id: 'lv-1', staffId: 'u-vikram', from: isoIn(3), to: isoIn(5),
        reason: 'Family function in Kochi', status: 'reassign',
        reallocations: [],
        history: [{ act: 'applied', byId: 'u-vikram', ts: msAgo(300) }] },
    ],
    leaveConfig: { approverRole: 'admin' },   /* who signs leave; Configuration edits this */
    /* the reply-deadline ladder for meals awaiting a human rating:
       target → nudge the seat → escalate to a role. HV.slaLeft is the read. */
    slaConfig: { replyTargetMin: 15, notifyAfterMin: 10, escalateAfterMin: 15, escalateToRole: 'admin' },

    /* ---- team announcements, newest first, + per-user read marks ---- */
    teamFeed: [
      { id: 'tf2', byId: 'u-sureshk', ts: msAgo(180), tag: 'Policy',
        text: 'Meal-photo SLA update: the reply target is now 15 minutes, with a nudge at 10 and escalation to the Super Admin at 25. The meals queue shows the live countdown.' },
      { id: 'tf1', byId: 'u-anita', ts: msAgo(1560), tag: 'Holiday',
        text: 'Independence Day, Aug 15 — the centre is closed. Client sessions move to their backup slots; on-call coverage per the roster.' },
    ],
    teamFeedReads: {},

    /* sweep-fed notices (SLA nudges, reminders, celebrations, leave, tasks) —
       HV.notice appends, HV.noticesFor reads, HV.seenNotices clears the badge */
    notices: [],

    /* team-side session evaluations — the coach's counterpart to each
       client's own sessionFeedback stars */
    staffSessionNotes: [
      { clientId: 'c-rajesh', byId: 'u-vikram', cy: 3, day: 4, key: 'fitness', stars: 4,
        summary: 'Held depth on every set and the knee stayed quiet — load nudges up next session.', ts: msAgo(2880) },
    ],

    /* filed session reports — the structured record a staff attendee owes
       once a session ends. The obligation is derived from (taskId, dateISO);
       the (cy, day, pillar) triple is snapshotted at write time so the client
       record's Sessions card can join it without a task lookup. `taskId` is
       filled in below by LOOKUP against the generated bookings — booking ids
       are placement-order dependent, so hard-coding one detaches the record
       the first time a coach's hours change. */
    sessionReports: [
      { id: 'sr-1', taskId: null, dateISO: isoAgo(2), clientId: 'c-rajesh', byId: 'u-lakshmi',
        cy: 3, day: 4, pillar: 'yoga', went: 'great',
        note: 'Forward fold reached the floor for the first time — the hamstring work is landing.',
        concern: '', next: 'Hold the pigeon a count longer next time.', ts: msAgo(2 * 1440) },
    ],
    reportSeq: 1,

    /* automation once-guards (key → ts) and the celebration acknowledge log */
    autoLog: {},
    wishes: {},
  };

  /* ---- past-cycle calendars, generated from cycleHistory. The paper book
     keeps every month's page; the app keeps every cycle's calendar. Shape is
     the SOP 7/11 layout (5 fitness + 3 yoga + 1 mind on alternate days, 2
     active rest); any shortfall against that cycle's recorded session count is
     marked missed from the tail — recorded, never erased. ---- */
  /* ---- age is derived, and stays derived -------------------------------
     Every client's stored `age` is recomputed from their `dob` here, so the
     two can never disagree. They already did: dob(46, 2) puts the birthday
     two days out, which made Rajesh 46 on the record and 45 in fact. The
     stored number survives only for records with no dob at all; HV.ageOf is
     what every screen reads. ---- */
  seed.clients.forEach(c => { if (c.dob) c.age = ageFromISO(c.dob); });

  seed.calendarsPast = {};
  seed.clients.forEach(c => {
    (c.cycleHistory || []).forEach(h => {
      /* 11 here is DELIBERATE and must not become SHAPE.cycleDays. These
         cycles already ran, under the 11-day rhythm. Config decides what gets
         BUILT; the data decides what gets DRAWN — a past cycle draws 11 cells
         forever, which is exactly what the verification asserts. */
      const days = [];
      for (let d = 1; d <= 11; d++) {
        if (d === 5 || d === 10) { days.push({ day: d, items: [], rest: true }); continue; }
        const items = [];
        if ([1, 3, 6, 8].includes(d)) items.push({ pillar: 'fitness', label: 'Fitness session', time: '6:30 pm', staffId: (c.pod || {}).fitness || null, status: 'done' });
        if (d === 9) items.push({ pillar: 'fitness', label: 'Assessment-lite', time: '6:30 pm', staffId: (c.pod || {}).fitness || null, status: 'done' });
        if ([2, 4, 7].includes(d)) items.push({ pillar: 'yoga', label: 'Yoga session', time: '7:00 am', staffId: (c.pod || {}).yoga || null, status: 'done' });
        if (d === 8) items.push({ pillar: 'wellness', label: 'Mind session', time: '8:30 pm', staffId: (c.pod || {}).mind || null, status: 'done' });
        if (d === 11) items.push({ pillar: 'yoga', label: 'Recovery flow', time: '7:00 am', staffId: (c.pod || {}).yoga || null, status: 'done' });
        const o = { day: d, items: items };
        if (d === 9) o.review = true;
        if (d === 11) o.meeting = true;
        days.push(o);
      }
      /* mark the shortfall missed, newest day first */
      let miss = Math.max(0, h.sessions ? h.sessions.target - h.sessions.done : 0);
      for (let i = days.length - 1; i >= 0 && miss > 0; i--) {
        for (let j = (days[i].items || []).length - 1; j >= 0 && miss > 0; j--) {
          days[i].items[j].status = 'missed'; miss--;
        }
      }
      (seed.calendarsPast[c.id] = seed.calendarsPast[c.id] || {})[h.cycle] = days;
    });
  });

  /* ---- the Assistant pad's per-client automation switches. Seeded here
     (rather than lazily in console-clients.js) so the standing rules ship
     with the story.

     This block used to build the rows by hand and CLAIMED its shape matched
     the pad's lazy defaults. It did not: the pad built four rows with no
     `key` on any of them, so a client promoted at runtime had no weigh-in
     switch and could never turn the one working automation off. Both callers
     now go through HV.defaultAutos, which is handed SHAPE because HV.shape()
     cannot answer while the seed it reads is still being built. ---- */
  seed.padAuto = {};
  seed.clients.forEach(c => { seed.padAuto[c.id] = HV.defaultAutos(c, SHAPE); });

  /* ---- workflow automation templates (TJ, 17 Aug) ----------------------
     A template is a named, ordered run of messages a client receives on a
     clock — the publication; switching it on for a client is the
     subscription. CONTENT, not user state: it is in core.js's boot-refill
     list, so authoring one never needs a seedVersion bump. What IS user
     state is seed.clientFlows below — who is subscribed.

     Two triggers, and the difference is which clock:
       'enrol'    — days since the client's term started. Runs ONCE.
       'cycleDay' — a day number inside the cycle. Runs EVERY cycle, which is
                    why HV.flowSweep's once-guard adds the cycle to the key
                    for these and not for the other kind.

     `at` is a minute of the day. Every value here is daytime on purpose: the
     sweep refuses to deliver inside the quiet hours notifRules n5 declares,
     and a step scheduled at 23:00 would simply wait for morning. ---- */
  seed.flowTemplates = [
    {
      id: 'fl-welcome', name: 'Welcome sequence',
      desc: 'The first messages a new client receives, on their own clock.',
      trigger: 'enrol', defaultOn: true,
      steps: [
        { after: 0, at: 540, title: 'Welcome to HAALVING',
          text: 'You are in. HAALVING is not a diet and not a gym — it is **a way of living**, built four pillars at a time: Nutrition, Fitness, Yoga and Mind Wellness.\n\nFor the next few days we only watch. No targets, no grading. Log what you already eat and how you already move, and your team reads it before anyone prescribes anything.' },
        { after: 2, at: 540, title: 'How we work together',
          text: 'Your circle is one thread. Ask anything in it — a human reads it every day.\n\nWe move in **' + SHAPE.cycleDays + '-day cycles**. Day ' + SHAPE.reviewDay + ' is your review, day ' + SHAPE.meetingDay + ' is the meeting where we set what comes next, and days ' + SHAPE.restDays.join(' and ') + ' are rest — they are part of the plan, not a gap in it.' },
        { after: 6, at: 600, title: 'Your first week',
          text: 'A week in. The habit that matters most right now is the smallest one you can keep every day.\n\nIf something is not working, say so in the thread — a plan you cannot live with is a plan we wrote wrong.' },
      ],
    },
    {
      id: 'fl-habits', name: 'HAALVING healthy-living habits',
      desc: 'One Blue Zones habit a cycle-week, posted on its own.',
      trigger: 'cycleDay', defaultOn: true,
      steps: [
        { on: 3, at: 480, title: 'Move naturally',
          text: 'The longest-lived people on earth do not lift weights. They **walk, garden, and climb stairs** all day without calling it exercise.\n\nToday: take the stairs once you would have taken the lift.' },
        { on: 7, at: 480, title: 'Eat until you are eighty per cent full',
          text: 'Okinawans say *hara hachi bu* before eating — a reminder to stop at eighty per cent.\n\nToday: put the spoon down when you are no longer hungry, rather than when the plate is empty.' },
        { on: 11, at: 480, title: 'Belong to something',
          text: 'Across every Blue Zone, the strongest predictor of a long life was not food or exercise. It was **belonging** — a circle that notices when you are missing.\n\nToday: message one person you have not spoken to in a while. Your Community tab counts too.' },
      ],
    },
    {
      id: 'fl-checkin', name: 'Mid-cycle check-in',
      desc: 'A single nudge at the halfway mark. Off by default.',
      trigger: 'cycleDay', defaultOn: false,
      steps: [
        { on: Math.round(SHAPE.cycleDays / 2), at: 660, title: 'Halfway',
          text: 'Halfway through the cycle. Nothing to do here — just a moment to notice what has been easy and what has not, before the review asks.' },
      ],
    },
  ];

  /* ---- who is subscribed. Deliberately a THIN on/off map, never a copy of
     the template: padAuto's per-client label copies are exactly why renaming
     a switch used to leave stale text on every client. An absent entry means
     "use the template's defaultOn", the same absent-means-default contract
     announcePrefs keeps, so a template added next month needs no migration.

     Ananya is seeded off the habits drip so the demo has a real example of a
     template that is on for the house and off for one person — the whole
     point of per-client enablement. ---- */
  seed.clientFlows = {};
  seed.clients.forEach(c => { seed.clientFlows[c.id] = {}; });
  seed.clientFlows['c-ananya'] = { 'fl-habits': false };

  /* ---- announcement opt-out, per client. Keyed by client id like padAuto
     above — deliberately NOT modelled on notifPrefs, which is one global
     object and would let a single client's choice silence everybody the
     moment the console started resolving recipients across many of them.

     Default is ON, and HV.announceOn treats an absent record as on, so a
     client added later needs no migration. Ananya is seeded OFF so the
     console's reach log has a real muted count to show on first boot, and
     so the operational-notice override is demonstrable rather than
     theoretical: a service notice still reaches her. ---- */
  seed.announcePrefs = {};
  seed.clients.forEach(c => { seed.announcePrefs[c.id] = true; });
  seed.announcePrefs['c-ananya'] = false;

  /* ---- the reach log: every announcement the console has sent to clients,
     newest first. Starts empty — the demo's first broadcast is the one the
     operator sends. Counts are STAMPED into each record at send time and
     never recomputed, because audience membership drifts (a plan change, a
     pod reassignment, a client flipping their switch) and last week's log
     must not change its mind about last week. ---- */
  seed.broadcasts = [];

  /* ---- lab reports, per client and dated — the store side of the Vital
     Panel. Marker DEFINITIONS and reference bands stay in vitals.js (facts,
     not demo state); the values a lab actually returned live here, as user
     state. Rajesh carries two dated panels so change-tracking has a real
     delta: February is the rough winter draw, July is the panel the app has
     always shown (values unchanged — vitals.js defaults every legacy read
     to the LATEST report, so client-profile renders as before). ---- */
  const rajJulValues = {
    /* the Epilimo readings and the bioAge/pace printed at the head of the
       panel are the SAME two numbers — 49 against 46 lived is a +3 gap.
       Change one and change the other, or the panel argues with itself. */
    epi_pace: 1.08, epi_gap: 3, epi_telomere: 6.9, epi_methyl: 74.2, epi_immune: 66,
    mb_shannon: 2.9, mb_fb: 3.6, mb_akk: 0.3, mb_bifido: 1.8,
    mb_butyrate: 4.4, mb_entero: 2.8, mb_calpro: 42,
    hba1c: 7.1, fbs: 138, abg: 157,
    hb: 15.2, hct: 45.8, rbc: 5.12, mcv: 89.4, mch: 29.7, mchc: 33.2, rdw: 14.6,
    wbc: 7.9, neut_abs: 4.9, neut_diff: 62, lymph_abs: 2.21, lymph_diff: 28,
    mono_abs: 0.47, mono_diff: 6, eos_abs: 0.24, eos_diff: 3, baso_abs: 0.04, baso_diff: 0.5,
    plt: 232, mpv: 10.4, pdw: 15.2,
    tchol: 210, ldl: 142, hdl: 36, nonhdl: 174, vldl: 42, tg: 212,
    ldl_hdl: 3.94, tc_hdl: 5.83, lpa: 18, apoa1: 118, apob: 118, apo_ratio: 1,
    homocysteine: 16.4, troponin: 3.2, ntprobnp: 42,
    hscrp: 3.8,
    creatinine: 0.97, urea: 32, bun: 15, bun_creat: 15.5, egfr: 92, uric: 7.6,
    sodium: 139, potassium: 4.4, chloride: 102,
    sgpt: 58, sgot: 44, sgot_sgpt: 0.76, ggt: 64, alp: 88,
    bili_total: 0.9, bili_conj: 0.2, bili_unconj: 0.7,
    protein_total: 7.3, albumin: 4.4, globulin: 2.9, ag_ratio: 1.52,
    tsh: 2.8, t4: 8.1, t3: 1.2,
    testosterone: 388,
    u_colour: 'Pale yellow', u_appearance: 'Clear', u_ph: 6, u_sg: 1.018,
    u_protein: 'Negative', u_glucose: 'Trace', u_ketones: 'Negative',
    u_bilirubin: 'Negative', u_urobilinogen: 'Normal', u_nitrite: 'Negative',
    u_leuk_est: 'Negative', u_blood: 'Negative', u_rbc: 'Nil', u_pus: '0-5',
    u_epithelial: '0-2', u_casts: 'Nil', u_crystals: 'Nil', u_bacteria: 'Nil',
    u_yeast: 'Negative',
  };
  seed.labReports = {
    'c-rajesh': [
      { id: 'lr-raj-1', date: '2026-02-10', label: 'Health panel', signedBy: 'u-kavya',
        ago: '6 months ago', bioAge: 50, pace: 1.16,
        /* the winter draw — worse exactly where the programme has since bitten:
           sugar, lipids, inflammation, liver. Everything else reads the same. */
        values: Object.assign({}, rajJulValues, {
          hba1c: 7.6, fbs: 152, abg: 171,
          tchol: 226, ldl: 158, hdl: 34, nonhdl: 192, tg: 248, vldl: 50,
          ldl_hdl: 4.65, tc_hdl: 6.65, apob: 126, apo_ratio: 1.07,
          hscrp: 4.6, sgpt: 66, ggt: 72, homocysteine: 18.2, uric: 7.9,
          epi_pace: 1.16, epi_gap: 4,
        }) },
      { id: 'lr-raj-2', date: '2026-07-14', label: 'Health panel', docId: 'd2', signedBy: 'u-kavya',
        ago: '3 weeks ago', bioAge: 49, pace: 1.08, values: rajJulValues },
    ],
    'c-ananya': [
      { id: 'lr-ana-1', date: '2025-11-02', label: 'Annual health check', docId: 'd5', signedBy: 'u-kavya',
        ago: '9 months ago', bioAge: 27, pace: 0.94,
        values: {
          /* 27 against 29 lived is a −2 gap — same pair as the panel head */
          epi_pace: 0.94, epi_gap: -2, epi_telomere: 7.6, epi_methyl: 79.1, epi_immune: 84,
          mb_shannon: 3.9, mb_fb: 1.4, mb_akk: 1.8, mb_bifido: 0.8,
          mb_butyrate: 11.2, mb_entero: 1.1, mb_calpro: 28,
          hba1c: 5.2, fbs: 88,
          hb: 11.6, hct: 36.4, rbc: 4.12, mcv: 82.1, mch: 26.4, mchc: 32.6, rdw: 15.1,
          wbc: 6.4, neut_abs: 3.6, neut_diff: 56, lymph_abs: 2.1, lymph_diff: 33,
          mono_abs: 0.42, mono_diff: 6.5, eos_abs: 0.19, eos_diff: 3, baso_abs: 0.03, baso_diff: 0.5,
          plt: 268, mpv: 9.8, pdw: 14.1,
          tchol: 176, ldl: 96, hdl: 58, nonhdl: 118, vldl: 22, tg: 108,
          ldl_hdl: 1.66, tc_hdl: 3.03,
          hscrp: 1.2,
          creatinine: 0.78, urea: 24, bun: 11, bun_creat: 14.1, egfr: 108, uric: 4.2,
          sodium: 141, potassium: 4.1, chloride: 103,
          sgpt: 22, sgot: 24, sgot_sgpt: 1.09, ggt: 19, alp: 74,
          bili_total: 0.6, bili_conj: 0.1, bili_unconj: 0.5,
          protein_total: 7.1, albumin: 4.3, globulin: 2.8, ag_ratio: 1.54,
          tsh: 5.2, t4: 6.9, t3: 0.9,
          u_colour: 'Pale yellow', u_appearance: 'Clear', u_ph: 6.5, u_sg: 1.012,
          u_protein: 'Negative', u_glucose: 'Negative', u_ketones: 'Negative',
          u_blood: 'Negative', u_rbc: 'Nil', u_pus: '0-5', u_epithelial: '0-2',
          u_nitrite: 'Negative', u_leuk_est: 'Negative',
        } },
    ],
  };

  /* ---- chat plumbing: stamp every seeded message with its sequence number,
     then set each person's read marker. Most of the team is caught up; the
     story's unread pockets are set explicitly so badges light where the
     narrative already points (Vikram → Rajesh's knee reply, Sneha → the
     unrated lunch, Anita → Meena's silence flag, Rajesh → Vikram's ping). ---- */
  let seq = 0;
  Object.keys(seed.circles).forEach(cid => seed.circles[cid].forEach(m => { m.seq = ++seq; }));
  seed.msgSeq = seq;

  const topSeq = {};
  Object.keys(seed.circles).forEach(cid => {
    topSeq[cid] = seed.circles[cid].reduce((a, m) => Math.max(a, m.seq), 0);
  });
  seed.reads = {};
  seed.users.forEach(u => {
    seed.reads[u.id] = {};
    Object.keys(topSeq).forEach(cid => { seed.reads[u.id][cid] = topSeq[cid]; });
  });
  const seqOf = (cid, id) => (seed.circles[cid].find(m => m.id === id) || {}).seq || 0;
  seed.reads['u-vikram']['c-rajesh'] = seqOf('c-rajesh', 'cm4');
  seed.reads['u-sneha']['c-rajesh'] = seqOf('c-rajesh', 'cm5');
  seed.reads['u-sneha']['c-mathew'] = seqOf('c-mathew', 'mt6');
  seed.reads['u-anita']['c-meena'] = seqOf('c-meena', 'me2');
  seed.reads['u-cl-rajesh']['c-rajesh'] = seqOf('c-rajesh', 'cm3');
  seed.reads['u-cl-dev']['c-dev'] = seqOf('c-dev', 'dv2');

  /* ---- roles: the RBAC matrix, copied into the store as USER STATE.
     HV.ROLES (core.js) stays the code-shipped fallback; HV.roleDef() reads
     the store first, so once People & Access edits a title, nav list or perm
     set here, that edit is what every screen sees. Store resets (a version
     bump, or the very first boot) start again from this copy — like every
     other seeded user-state key, editing it afterward doesn't need one. */
  seed.roles = {};
  Object.keys(HV.ROLES).forEach(k => {
    if (k === 'client' || k === 'ai') return;
    const r = HV.ROLES[k];
    seed.roles[k] = { title: r.title, shell: r.shell, home: r.home,
                       nav: (r.nav || []).slice(), perms: (r.perms || []).slice() };
  });

  /* ---- programShape: the cycle every calendar, template and level book is
     built from — declared once as SHAPE at the top of this file and handed to
     the store here. Content, not user state: it is boot-refilled like the other
     reference catalogues, so Configuration → Program can move it and the change
     survives a reload. Read it anywhere else through HV.cycleDays() and friends,
     never by reaching for the key. */
  seed.programShape = JSON.parse(JSON.stringify(SHAPE));

  /* ---- the two catalogue vocabularies -----------------------------------
     CATEGORIES and TAGS, the governed lists behind the Catalog page, edited in
     Configuration → Catalog and read only through HV.tracks() / HV.catTags().

     A category is the activity level an item is prescribed at, and its key is
     ALSO client.track — it indexes the level books and the level-review
     criteria, so the three seeded keys can never be renamed. A fourth added in
     Configuration has no level book of its own and falls back to Sedentary,
     which the Config screen says out loud rather than hiding.

     Tags are the client-outcome words an item is filed under. Before this list
     existed they were free text typed into a comma box, so `PCOD` and `pcod`
     became two chips filtering two different ways. Console-only: no client
     surface renders them.

     Both are content, not user state. They are boot-refilled — and because
     that graft fires only when a key is ABSENT, these land in every existing
     save without a seedVersion bump. */
  seed.tracks = [
    { k: 'sedentary', t: 'Sedentary' },
    { k: 'moderate',  t: 'Moderate' },
    { k: 'active',    t: 'Active' },
  ];
  seed.catTags = ['weight loss', 'diabetes', 'PCOD', 'muscle building', 'stress', 'sleep'];

  /* ---- catalog: the four pillar libraries the Team Console's Catalog page
     lists and edits — fitness sets, yoga asanas, culture (food) dishes and
     wellness practices. track is the activity level a coach prescribes it
     at, keyed to seed.tracks above; tags are keyed to seed.catTags.

     `media` carries the item's picture, its film and — through `instructions`
     — its text, and all three reach the client: the picture is the task tile
     and the sheet hero, the film plays inside the instruction sheet, and each
     LINE of instructions becomes one step page. The original {kind, ref} shape
     is still honoured; HV.itemMedia() is the only reader and understands both.
     `dose` is the DEFAULT prescription a
     template inherits when its slot does not override it — so one exercise
     can be 3x10 at level 1 and 4x15 at level 4 without being duplicated. nutrients + allergies are food-only;
     caution is never set on wellness items — those are self-paced, nothing
     to injure yourself on. Content, not user state — but NOT in the boot
     graft list: an edit to a seeded item reaches an existing save only via
     the full-seed rebuild, so it needs a seedVersion bump. */
  seed.catalog = {
    fitness: [
      { id: 'ci-walk', dose: { mins: 25, rpe: 4 }, track: 'sedentary', name: 'Brisk walk intervals',
        instructions: 'Walk two minutes briskly — the pace where talking takes effort but is still possible.\n' +
          'Drop to an easy stroll for one minute. Let the breath come back on its own.\n' +
          'Repeat that pair for the whole session. The pace changes train the heart, not the distance.\n' +
          'Finish on an easy minute rather than a hard one.',
        media: { image: 'img/tasks/fitness-cardio.webp', video: 'media/welcome.mp4' },
        tags: ['weight loss', 'diabetes'] },
      /* the worked example of the full media contract: a picture, a film and
         instructions written ONE STEP PER LINE — each line becomes its own page
         in the client's instruction sheet.

         The film is media/welcome.mp4 — the house brand film — standing in as a
         demo placeholder wherever a seeded item carries a video, because no
         exercise or recipe has actually been shot yet. A real item takes a
         YouTube link pasted into Catalog → the item → Media → Video. The point
         of seeding it is that the pipeline is visible on first load rather than
         only after someone authors an item. */
      { id: 'ci-squat', dose: { sets: 3, reps: 10, rpe: 5 }, track: 'sedentary', name: 'Chair squats',
        instructions: 'Stand in front of a sturdy chair, feet shoulder-width apart, arms loose at your sides.\n' +
          'Push your hips back as though you were about to sit, and lower until you lightly touch the seat.\n' +
          'Press through your heels to stand tall again, squeezing the glutes at the top.\n' +
          'Breathe in on the way down, out on the way up. Ten of those, then rest.',
        media: { image: 'img/tasks/fitness-strength.webp', video: 'media/welcome.mp4' },
        caution: 'Skip if knee pain — reduce depth and hold the chair.',
        tags: ['PCOD', 'weight loss'] },
      { id: 'ci-wallpush', track: 'sedentary', name: 'Wall push-ups',
        instructions: 'Place your palms on a wall at shoulder height, step back until your body is at a slight angle, then bend your elbows to bring your chest toward the wall and press back out.',
        media: { kind: 'photo', ref: 'img/tasks/fitness-strength.webp' },
        tags: ['muscle building'] },
      { id: 'ci-glutebridge', track: 'sedentary', name: 'Glute bridge',
        instructions: 'Lie on your back with knees bent and feet flat, then squeeze your glutes to lift your hips until your body forms a straight line from knees to shoulders.',
        media: { kind: 'photo', ref: 'img/tasks/fitness-strength.webp' },
        tags: ['PCOD'] },
      { id: 'ci-stepup', dose: { sets: 3, reps: 12, rpe: 6 }, track: 'moderate', name: 'Step-ups',
        instructions: 'Step fully onto a sturdy step or low bench with one foot, drive through the heel to stand tall, then step back down with control.',
        media: { kind: 'photo', ref: 'img/tasks/fitness-strength.webp' },
        tags: ['weight loss'] },
      { id: 'ci-goblet', track: 'moderate', name: 'Goblet squats',
        instructions: 'Hold a dumbbell or kettlebell close to your chest with both hands, then squat down between your knees and drive back up through your heels.',
        media: { kind: 'photo', ref: 'img/tasks/fitness-muscle.webp' },
        caution: 'Keep a neutral spine throughout — don’t round or arch the lower back under load.',
        tags: ['muscle building'] },
      { id: 'ci-band', track: 'moderate', name: 'Resistance-band rows',
        instructions: 'Anchor the band at chest height, step back to create tension, and pull the handles toward your ribs while squeezing your shoulder blades together.',
        media: { kind: 'photo', ref: 'img/tasks/fitness-muscle.webp' },
        tags: ['muscle building'] },
      { id: 'ci-plank', dose: { sets: 3, reps: 1, mins: 1, rpe: 6 }, track: 'moderate', name: 'Plank hold',
        instructions: 'Rest on your forearms and toes with your body in one straight line from head to heels, and hold while breathing steadily.',
        media: { kind: 'photo', ref: 'img/tasks/fitness-strength.webp' },
        tags: ['muscle building'] },
      { id: 'ci-farmercarry', track: 'moderate', name: 'Farmer carry',
        instructions: 'Pick up a heavy dumbbell or kettlebell in each hand and walk tall for the stated distance, keeping your shoulders back and core braced.',
        media: { kind: 'photo', ref: 'img/tasks/fitness-muscle.webp' },
        tags: ['muscle building'] },
      { id: 'ci-kbswing', dose: { sets: 4, reps: 15, rpe: 7 }, track: 'active', name: 'Kettlebell swings',
        instructions: 'Stand with feet shoulder-width apart, hinge at the hips to swing the kettlebell back between your legs, then drive your hips forward to swing it to chest height.',
        media: { kind: 'photo', ref: 'img/tasks/fitness-cardio.webp' },
        caution: 'This is a hip hinge, not a squat — drive through the hips and keep the knees soft.',
        tags: ['weight loss'] },
      { id: 'ci-temporun', track: 'active', name: 'Tempo run',
        instructions: 'Run at a pace that’s comfortably hard — one where a full sentence is difficult but a few words are still possible — for the stated duration.',
        media: { kind: 'photo', ref: 'img/tasks/fitness-endurance.webp' },
        tags: ['weight loss'] },
      { id: 'ci-pushladder', track: 'active', name: 'Push-up ladder',
        instructions: 'Do one push-up, rest a few seconds, then two, then three, climbing the ladder as high as clean form allows before starting back down.',
        media: { kind: 'photo', ref: 'img/tasks/fitness-muscle.webp' },
        tags: ['muscle building'] },
    ],

    yoga: [
      { id: 'ci-catcow', dose: { mins: 5, focus: 'spine' }, track: 'sedentary', name: 'Cat–Cow',
        instructions: 'On hands and knees, inhale as you drop your belly and lift your chest and tailbone (Cow), then exhale as you round your spine toward the ceiling (Cat).',
        media: { kind: 'photo', ref: 'img/tasks/yoga-mobility.webp' },
        tags: ['stress'] },
      { id: 'ci-uttan', dose: { mins: 4, focus: 'hamstrings' }, track: 'sedentary', name: 'Uttanasana forward fold',
        instructions: 'From standing, hinge at the hips and fold forward, letting your head and arms hang heavy toward the floor.',
        media: { kind: 'photo', ref: 'img/tasks/yoga-flexibility.webp' },
        caution: 'Keep a soft bend in the knees, and rise slowly if you have low blood pressure.',
        tags: ['stress'] },
      { id: 'ci-baddha', track: 'sedentary', name: 'Baddha Konasana',
        instructions: 'Sit tall, bring the soles of your feet together, and let your knees drop toward the floor while you hold your ankles.',
        media: { kind: 'photo', ref: 'img/tasks/yoga-flexibility.webp' },
        tags: ['PCOD'] },
      { id: 'ci-surya', dose: { mins: 12, focus: 'whole body' }, track: 'moderate', name: 'Surya Namaskar A',
        instructions: 'Stand at the front of your mat, palms together at the heart, and take one steady breath.\n' +
          'Inhale the arms overhead; exhale and fold forward from the hips.\n' +
          'Inhale to a halfway lift, exhale and step or jump back to plank.\n' +
          'Lower through chaturanga, inhale to upward dog, exhale to downward dog. Hold five breaths.\n' +
          'Walk or jump the feet back in, rise to standing, and begin the next round.',
        media: { image: 'img/tasks/yoga-mobility.webp', video: 'media/welcome.mp4' },
        tags: ['weight loss'] },
      { id: 'ci-trikona', track: 'moderate', name: 'Trikonasana',
        instructions: 'Step your feet wide, turn one foot out, and reach that hand down toward your shin or the floor while the other arm reaches up.',
        media: { kind: 'photo', ref: 'img/tasks/yoga-flexibility.webp' },
        tags: ['diabetes'] },
      { id: 'ci-warrior2', track: 'moderate', name: 'Warrior II',
        instructions: 'Step your feet wide, bend the front knee to a right angle, and stretch your arms out parallel to the floor while gazing over your front hand.',
        media: { kind: 'photo', ref: 'img/tasks/yoga-mobility.webp' },
        tags: ['muscle building'] },
      { id: 'ci-bridgepose', track: 'moderate', name: 'Bridge pose',
        instructions: 'Lie on your back with knees bent, press through your feet to lift your hips, and clasp your hands beneath you if that’s comfortable.',
        media: { kind: 'photo', ref: 'img/tasks/yoga-flexibility.webp' },
        tags: ['PCOD'] },
      { id: 'ci-crowprep', dose: { mins: 8, focus: 'wrists' }, track: 'active', name: 'Crow prep',
        instructions: 'Squat low, place your hands shoulder-width apart on the floor, and lean your weight forward onto your hands, lifting one foot and then the other to tap your knees onto your upper arms.',
        media: { kind: 'photo', ref: 'img/tasks/yoga-mobility.webp' },
        caution: 'Warm up the wrists first, and come out immediately if you feel any wrist pain.',
        tags: ['muscle building'] },
      { id: 'ci-headprep', track: 'active', name: 'Headstand prep',
        instructions: 'Interlace your fingers on the floor, place the crown of your head between your hands, and walk your feet in to lift your hips overhead against a wall.',
        media: { kind: 'photo', ref: 'img/tasks/yoga-mobility.webp' },
        caution: 'Never attempt your first headstand unsupervised — practice against a wall with a coach or experienced partner nearby.',
        tags: ['muscle building'] },
      { id: 'ci-nidraw', track: 'sedentary', name: 'Yoga-nidra wind-down',
        instructions: 'Lie down in Savasana and follow a guided body scan from toes to head, staying awake but completely still and relaxed.',
        media: { kind: 'photo', ref: 'img/tasks/yoga-breath.webp' },
        tags: ['sleep'] },
    ],

    /* Every food declares its PORTION — {qty, unit} with unit from
       pc/cup/bowl/glass/tbsp/g/ml — and every number in `nutrients` is for
       exactly that portion. A template asks for multiples ({id, x:2} in an
       option group) and HV.slotSum multiplies; nothing here is a total for
       "however much of it a plate happens to hold". Micro keys are the
       Nutrient Panel roster's own (data.js nutrition.micros — calc, pot,
       sod…), values numeric in the roster's unit, so a sum can finally read
       them. */
    culture: [
      { id: 'ci-idli', track: 'sedentary', name: 'Idli',
        portion: { qty: 1, unit: 'pc' },
        instructions: 'Steam the idlis until a knife comes out clean — about ten minutes on a rolling boil.\n' +
          'Serve them hot. An idli left to cool goes dense, and half the point is the lightness.\n' +
          'Pair with sambar and a spoon of chutney; skip the extra oil.',
        media: { image: 'img/dishes/dish-idli-1.webp', video: 'media/welcome.mp4' },
        tags: ['weight loss'],
        nutrients: { kcal: 60, protein: 2, carbs: 12, fat: 0.3, fibre: 0.8,
          micros: [{ k: 'iron', v: 0.3 }, { k: 'calc', v: 15 }, { k: 'sod', v: 65 }] },
        allergies: [] },
      { id: 'ci-chutney', track: 'sedentary', name: 'Coconut chutney',
        portion: { qty: 2, unit: 'tbsp' },
        instructions: 'Serve fresh alongside idli or dosa as a small side — a couple of tablespoons is plenty.',
        media: { image: 'img/dishes/dish-chutney-1.webp', video: 'media/welcome.mp4' },
        tags: ['diabetes'],
        nutrients: { kcal: 105, protein: 1.5, carbs: 4, fat: 9, fibre: 2,
          micros: [{ k: 'pot', v: 95 }, { k: 'magn', v: 9 }] },
        allergies: ['coconut'] },
      { id: 'ci-dosa', track: 'sedentary', name: 'Plain dosa',
        portion: { qty: 1, unit: 'pc' },
        instructions: 'Cook the fermented batter thin and crisp on a hot griddle, and serve plain or with a light vegetable filling.',
        media: { image: 'img/dishes/dish-dosa-1.webp', video: 'media/welcome.mp4' },
        tags: ['weight loss'],
        nutrients: { kcal: 165, protein: 3.5, carbs: 29, fat: 4, fibre: 1,
          micros: [{ k: 'iron', v: 0.7 }, { k: 'sod', v: 120 }] },
        allergies: [] },
      { id: 'ci-sambar', track: 'sedentary', name: 'Sambar',
        portion: { qty: 1, unit: 'cup' },
        instructions: 'Simmer toor dal with tamarind, sambar powder and mixed vegetables until the lentils soften into a thick, tangy stew.',
        media: { image: 'img/dishes/dish-sambar-1.webp', video: 'media/welcome.mp4' },
        tags: ['diabetes'],
        nutrients: { kcal: 140, protein: 6, carbs: 18, fat: 4, fibre: 5,
          micros: [{ k: 'iron', v: 1.5 }, { k: 'pot', v: 210 }, { k: 'folate', v: 40 }] },
        allergies: [] },
      { id: 'ci-oats', track: 'sedentary', name: 'Oats bowl',
        portion: { qty: 1, unit: 'bowl' },
        instructions: 'Cook rolled oats in water or low-fat milk and top with fruit or a spoon of nuts for a fibre-rich start to the day.',
        media: { image: 'img/dishes/dish-oats-1.webp', video: 'media/welcome.mp4' },
        tags: ['weight loss', 'diabetes'],
        nutrients: { kcal: 190, protein: 6, carbs: 32, fat: 4, fibre: 4,
          micros: [{ k: 'iron', v: 1.4 }, { k: 'magn', v: 55 }, { k: 'zinc', v: 1.2 }] },
        allergies: ['gluten'] },
      { id: 'ci-cheela', track: 'sedentary', name: 'Moong-dal cheela',
        portion: { qty: 1, unit: 'pc' },
        instructions: 'Blend soaked moong dal into a thick batter, season with ginger and green chilli, and cook thin on a hot griddle like a savoury pancake.',
        media: { image: 'img/dishes/dish-cheela-1.webp', video: 'media/welcome.mp4' },
        tags: ['muscle building', 'diabetes'],
        nutrients: { kcal: 180, protein: 10, carbs: 20, fat: 6, fibre: 4,
          micros: [{ k: 'iron', v: 1.8 }, { k: 'folate', v: 60 }] },
        allergies: [] },
      { id: 'ci-paneer', track: 'sedentary', name: 'Grilled paneer salad',
        portion: { qty: 1, unit: 'bowl' },
        instructions: 'Grill the paneer cubes on a hot dry pan until lightly charred on two sides.\n' +
          'Build the bed first — mixed greens, cucumber, tomato — then lay the paneer over it warm.\n' +
          'Dress with lemon and a pinch of salt. No creamy dressing; it undoes the point of the dish.',
        media: { image: 'img/dishes/dish-paneer-1.webp', video: 'media/welcome.mp4' },
        tags: ['muscle building'],
        nutrients: { kcal: 240, protein: 16, carbs: 9, fat: 15, fibre: 3,
          micros: [{ k: 'calc', v: 200 }, { k: 'zinc', v: 1.1 }] },
        allergies: ['milk'] },
      { id: 'ci-curdrice', track: 'sedentary', name: 'Curd rice',
        portion: { qty: 1, unit: 'bowl' },
        instructions: 'Mash cooked rice with fresh curd, temper with mustard seeds and curry leaves, and serve cool as a gut-settling finish to the meal.',
        media: { image: 'img/dishes/dish-curdrice-1.webp', video: 'media/welcome.mp4' },
        tags: ['PCOD'],
        nutrients: { kcal: 210, protein: 6, carbs: 32, fat: 6, fibre: 1.5,
          micros: [{ k: 'calc', v: 150 }, { k: 'b12', v: 0.4 }] },
        allergies: ['milk'] },
      { id: 'ci-ragi', track: 'sedentary', name: 'Ragi porridge',
        portion: { qty: 1, unit: 'bowl' },
        instructions: 'Whisk ragi flour into water or low-fat milk and simmer until thick, sweetening lightly with jaggery if needed.',
        media: { image: 'img/dishes/dish-ragi-1.webp', video: 'media/welcome.mp4' },
        tags: ['diabetes'],
        nutrients: { kcal: 150, protein: 4, carbs: 28, fat: 2, fibre: 4,
          micros: [{ k: 'calc', v: 200 }, { k: 'iron', v: 1.9 }] },
        allergies: [] },
      { id: 'ci-sprouts', track: 'sedentary', name: 'Sprouts chaat',
        portion: { qty: 1, unit: 'bowl' },
        instructions: 'Toss steamed moong and matki sprouts with chopped onion, tomato, lemon juice and chaat masala for a crunchy, protein-rich snack.',
        media: { image: 'img/dishes/dish-sprouts-1.webp', video: 'media/welcome.mp4' },
        tags: ['weight loss'],
        nutrients: { kcal: 130, protein: 8, carbs: 17, fat: 2, fibre: 6,
          micros: [{ k: 'folate', v: 50 }, { k: 'vitc', v: 12 }, { k: 'iron', v: 1.5 }] },
        allergies: [] },
      { id: 'ci-upma', track: 'sedentary', name: 'Vegetable upma',
        portion: { qty: 1, unit: 'bowl' },
        instructions: 'Roast semolina until fragrant, then simmer with sautéed vegetables and water until it comes together soft and fluffy.',
        media: { image: 'img/dishes/dish-upma-1.webp', video: 'media/welcome.mp4' },
        tags: ['weight loss'],
        nutrients: { kcal: 200, protein: 5, carbs: 33, fat: 6, fibre: 3,
          micros: [{ k: 'iron', v: 1.2 }, { k: 'sod', v: 240 }] },
        allergies: ['gluten'] },
      { id: 'ci-buttermilk', track: 'sedentary', name: 'Buttermilk',
        portion: { qty: 1, unit: 'glass' },
        instructions: 'Whisk chilled curd with water, a pinch of roasted cumin and salt, and serve cold as a light, cooling drink with meals.',
        media: { image: 'img/dishes/dish-buttermilk-1.webp', video: 'media/welcome.mp4' },
        tags: ['stress'],
        nutrients: { kcal: 40, protein: 2, carbs: 4, fat: 1, fibre: 0,
          micros: [{ k: 'calc', v: 110 }, { k: 'b12', v: 0.3 }, { k: 'sod', v: 180 }] },
        allergies: ['milk'] },
    ],

    wellness: [
      { id: 'ci-box', dose: { mins: 5 }, track: 'sedentary', name: 'Box breathing 5 min',
        instructions: 'Inhale for a count of four, hold for four, exhale for four, and hold empty for four — repeat the square for five minutes.',
        media: { kind: 'photo', ref: 'img/tasks/wellness-breath.webp' },
        tags: ['stress'] },
      { id: 'ci-nidra', dose: { mins: 20 }, track: 'sedentary', name: 'Yoga nidra 20 min',
        instructions: 'Lie on your back somewhere warm, legs a little apart, palms turned up.\n' +
          'Let the breath settle on its own. Nothing to lengthen, nothing to count.\n' +
          'Follow the guided scan from the feet upward, resting attention on each part as it is named.\n' +
          'If you drift off, that is not a failure — the practice has done its work.',
        media: { image: 'img/tasks/wellness-nidra.webp', video: 'media/welcome.mp4' },
        tags: ['sleep'] },
      { id: 'ci-downshift', track: 'sedentary', name: 'Digital downshift hour',
        instructions: 'Switch off screens for the hour before bed and swap them for reading, stretching or quiet conversation to let your mind settle.',
        media: { kind: 'photo', ref: 'img/tasks/wellness-downshift.webp' },
        tags: ['sleep'] },
      { id: 'ci-gratitude', dose: { mins: 5 }, track: 'sedentary', name: 'Gratitude journal',
        instructions: 'Write down three specific things that went well today, however small, before you put the day to rest.',
        tags: ['stress'] },
      { id: 'ci-bodyscan', dose: { mins: 10 }, track: 'moderate', name: 'Body scan 10 min',
        instructions: 'Lie down and bring your attention slowly through each part of your body in turn, noticing tension and consciously releasing it.',
        media: { kind: 'photo', ref: 'img/tasks/wellness-nidra.webp' },
        tags: ['stress'] },
      { id: 'ci-478breath', track: 'moderate', name: '4-7-8 breath',
        instructions: 'Inhale quietly through your nose for four counts, hold for seven, and exhale slowly through your mouth for eight — repeat four rounds.',
        media: { kind: 'photo', ref: 'img/tasks/wellness-breath.webp' },
        tags: ['sleep'] },
      { id: 'ci-walknophone', track: 'moderate', name: 'Walk without phone',
        instructions: 'Take a walk of at least fifteen minutes leaving your phone behind, and let your attention rest on your surroundings instead of a screen.',
        media: { kind: 'photo', ref: 'img/tasks/wellness-downshift.webp' },
        tags: ['stress'] },
      { id: 'ci-winddown', track: 'sedentary', name: 'Wind-down routine',
        instructions: 'Follow the same simple sequence every night — dim the lights, stretch gently, and note tomorrow’s one priority — so your body learns bedtime is near.',
        media: { kind: 'photo', ref: 'img/tasks/wellness-downshift.webp' },
        tags: ['sleep'] },
    ],

    /* ---- motivation: the morning films. A fifth library beside the four
       pillars — same item shape, so the Catalog's existing editor lists and
       edits them unchanged. These are NOT prescribed by activity level: a film
       is watched, not performed, so no `track` here and no track filter on the
       tab.

       media.ref is a YouTube video id or a full YouTube URL — the player pulls
       the id out either way, so a pasted link works without thought. An EMPTY
       ref means "not produced yet": the player falls back to the house film
       (media/welcome.mp4, cropped to portrait) so every day of the demo has
       something to play. Replacing a placeholder is a one-field edit in the
       console or one string here — no code changes. */
    motivation: [
      { id: 'mv-belong', name: 'The village that eats together',
        instructions: 'The people who live longest almost never eat alone. Ninety seconds on the table as the oldest health technology we have.',
        media: { kind: 'youtube', ref: '' }, mins: 2, tags: ['stress'] },
      { id: 'mv-plate', name: 'What a hundred-year-old plate looks like',
        instructions: 'Not a diet — a shape. Beans, greens, grains and whatever grew nearby, on repeat for eighty years.',
        media: { kind: 'youtube', ref: '' }, mins: 2, tags: ['weight loss', 'diabetes'] },
      { id: 'mv-move', name: 'Movement you never scheduled',
        instructions: 'Nobody in a Blue Zone goes to the gym. They garden, they walk to the shop, they sit on the floor. Why that beats an hour of effort.',
        media: { kind: 'youtube', ref: '' }, mins: 2, tags: ['weight loss'] },
      { id: 'mv-eighty', name: 'The eighty per cent rule',
        instructions: 'Hara hachi bu — the Okinawan habit of stopping when you are eighty per cent full, and the twenty minutes your stomach needs to tell your brain.',
        media: { kind: 'youtube', ref: '' }, mins: 2, tags: ['weight loss'] },
      { id: 'mv-breath', name: 'The first breath of the day',
        instructions: 'Four counts in, four held, four out. What a single square of breathing does to a nervous system that woke up already behind.',
        media: { kind: 'youtube', ref: '' }, mins: 1, tags: ['stress'] },
      { id: 'mv-sleep', name: 'The hour before you sleep',
        instructions: 'Sleep is not what happens after the day ends — it is built in the sixty minutes before it does.',
        media: { kind: 'youtube', ref: '' }, mins: 2, tags: ['sleep'] },
      { id: 'mv-purpose', name: 'Ikigai — a reason to get up',
        instructions: 'The Okinawan word for the thing that gets you out of bed. Seven years of life expectancy sit in the answer.',
        media: { kind: 'youtube', ref: '' }, mins: 3, tags: ['stress'] },
      { id: 'mv-strength', name: 'Why muscle is a savings account',
        instructions: 'What you build in your forties is what you spend in your seventies. The most honest argument for lifting anything at all.',
        media: { kind: 'youtube', ref: '' }, mins: 2, tags: ['muscle building'] },
      { id: 'mv-sugar', name: 'The sweetness you did not choose',
        instructions: 'Blue Zone diets are not sugar-free — they are sugar-honest. On the difference between a festival sweet and a daily one.',
        media: { kind: 'youtube', ref: '' }, mins: 2, tags: ['diabetes', 'PCOD'] },
      { id: 'mv-slow', name: 'Downshift',
        instructions: 'Every long-lived culture has a ritual for shedding the day — a nap, a prayer, a walk, a glass on the porch. Stress is the same everywhere; the routine is what differs.',
        media: { kind: 'youtube', ref: '' }, mins: 2, tags: ['stress', 'sleep'] },
      { id: 'mv-circle', name: 'The five people around you',
        instructions: 'Moai — the lifelong circle of friends an Okinawan is placed in at birth. Your habits are, statistically, an average of theirs.',
        media: { kind: 'youtube', ref: '' }, mins: 3, tags: ['stress'] },
      /* the library must hold at least one film per day of a cycle, or the walk
         wraps and a client sees the same film twice inside one cycle — which is
         the one thing the morning film promises not to do */
      { id: 'mv-water', name: 'The first glass',
        instructions: 'Nobody in a Blue Zone counts litres. They keep water within arm’s reach and the counting takes care of itself.',
        media: { kind: 'youtube', ref: '' }, mins: 2, tags: ['weight loss'] },
      { id: 'mv-walk', name: 'The errand that became exercise',
        instructions: 'The longest-lived people on earth do not go to a gym. Their villages are built so that the shortest route to anything is on foot.',
        media: { kind: 'youtube', ref: '' }, mins: 2, tags: ['weight loss'] },
      { id: 'mv-rest', name: 'Doing nothing, properly',
        instructions: 'Rest is not the absence of the programme — it is a part of it that happens to feel like a reward.',
        media: { kind: 'youtube', ref: '' }, mins: 2, tags: ['stress', 'sleep'] },
    ],
  };

  /* ---- templates: one per pillar per level per track, assembled from the
     catalog above. A full shelf would be 5 x 7 x 3 = 105 objects, which is a
     library to be authored, not seeded — so the demo carries a complete
     Sedentary Level 1 set (all five pillars, the shelf a new client lands on),
     one Level 2 Nutrition to show a second rung, and one Moderate Fitness draft
     mid-authoring.

     Content, but NOT in core.js's boot-refill array — so a plain seed property,
     landed once per version rebuild, is what lets a runtime-created template
     survive a reload; there is no refill pass for this key to race against. */
  const L1 = { level: 1, track: 'sedentary' };
  seed.templates = [
    genTemplate(Object.assign({}, L1, {
      id: 'tp-nut-l1', pillar: 'culture', by: 'u-sneha',
      targets: { kcal: 1700, protein: 75, carbs: 210, fat: 52, fibre: 25 },
      name: 'Everyday plate — L1 Sedentary',
      desc: 'Three meals and a mid-morning, built on idli, dosa and millet. Alternatives on every slot.',
      day: (d) => [
        { pillar: 'culture', time: '8:00', label: 'Breakfast',
          options: [[{ id: 'ci-idli', x: 2 }, 'ci-chutney'], ['ci-dosa', 'ci-chutney'], ['ci-oats']] },
        { pillar: 'culture', time: '11:30', label: 'Mid-morning',
          options: [['ci-oats']], dose: { note: 'Only if genuinely hungry' } },
        { pillar: 'culture', time: '13:00', label: 'Lunch',
          options: [['ci-curdrice'], ['ci-cheela']] },
        { pillar: 'culture', time: '19:30', label: 'Dinner',
          options: [['ci-upma'], ['ci-ragi']],
          dose: { note: d % 2 ? 'Finish by 7:30 pm' : '' } },
      ] })),
    genTemplate(Object.assign({}, L1, {
      id: 'tp-fit-l1', pillar: 'fitness', by: 'u-vikram',
      name: 'Foundations — L1 Sedentary',
      desc: 'Alternate days, form before load. Rest days carry nothing at all.',
      day: (d) => runsOn('fitness').includes(d)
        ? [{ pillar: 'fitness', time: '6:30 pm', label: sessionName('fitness', d),
             options: [['ci-walk'], ['ci-squat', 'ci-plank']],
             dose: { sets: 3, reps: 10, rpe: 5, mins: 30 } }]
        : [] })),
    genTemplate(Object.assign({}, L1, {
      id: 'tp-yog-l1', pillar: 'yoga', by: 'u-lakshmi',
      name: 'Breath & spine — L1 Sedentary',
      desc: 'The alternate days fitness leaves open. Short, and never forced.',
      day: (d) => runsOn('yoga').includes(d)
        ? [{ pillar: 'yoga', time: '7:00 am', label: sessionName('yoga', d),
             options: [['ci-surya'], ['ci-catcow', 'ci-uttan']],
             dose: { mins: 20, focus: d % 4 === 0 ? 'hips' : 'spine' } }]
        : [] })),
    genTemplate(Object.assign({}, L1, {
      id: 'tp-mnd-l1', pillar: 'wellness', by: 'u-meera',
      name: 'Wind-down — L1 Sedentary',
      desc: 'A nightly wind-down, and the counselling session that lands on review day.',
      day: (d) => runsOn('mind').includes(d)
        ? [{ pillar: 'wellness', time: '8:00 pm', label: 'Mind Wellness session',
             options: [['ci-bodyscan']], dose: { mins: 45 } },
           { pillar: 'wellness', time: '9:00 pm', label: 'Wind-down',
             options: [['ci-nidra'], ['ci-box']], dose: { mins: 10 } }]
        : [{ pillar: 'wellness', time: '9:00 pm', label: 'Wind-down',
             options: [['ci-nidra'], ['ci-box']], dose: { mins: 10 } }] })),
    genTemplate(Object.assign({}, L1, {
      id: 'tp-mot-l1', pillar: 'motivation', by: 'u-rohan',
      name: 'Opening films — L1 Sedentary',
      desc: 'One film a day, none repeated inside a cycle. It opens the morning.',
      day: (d) => [{ pillar: 'motivation', label: 'Morning film',
                     options: [[MOT[(d - 1) % MOT.length]]] }] })),
    /* a second rung, so the level filter has something to find */
    genTemplate({ id: 'tp-nut-l2', pillar: 'culture', level: 2, track: 'sedentary', by: 'u-sneha',
      targets: { kcal: 1800, protein: 90, carbs: 220, fat: 55, fibre: 28 },
      name: 'Everyday plate — L2 Sedentary',
      desc: 'Level 2: protein raised at breakfast, the mid-morning dropped.',
      day: () => [
        { pillar: 'culture', time: '8:00', label: 'Breakfast',
          options: [['ci-paneer'], [{ id: 'ci-idli', x: 2 }, 'ci-chutney']] },
        { pillar: 'culture', time: '13:00', label: 'Lunch',
          options: [['ci-curdrice'], ['ci-cheela']] },
        { pillar: 'culture', time: '19:30', label: 'Dinner',
          options: [['ci-ragi']] },
      ] }),
  ];
  /* a deliberately incomplete draft, to demo authoring in progress */
  const draft = genTemplate({ id: 'tp-fit-l3m', pillar: 'fitness', level: 3, track: 'moderate',
    by: 'u-vikram', status: 'draft', name: 'Strength block — L3 Moderate',
    desc: 'First five days drafted; strength emphasis.',
    day: (d) => (d <= 5 && runsOn('fitness').includes(d))
      ? [{ pillar: 'fitness', time: '6:30', label: 'Session',
           options: [['ci-squat', 'ci-plank']], dose: { sets: 4, reps: 12, rpe: 7, mins: 45 } }]
      : [] });
  seed.templates.push(draft);

  /* ---- clientPlans: PER-PILLAR assignment plus day-level overrides.
     Keyed by pillar because each coach owns and assigns their own; any pillar
     may be absent, which simply means that pillar has nothing on the calendar
     yet. Override keys are a plain day number now — one template is one level
     is one cycle, so the old 'cycle.day' compound has nothing left to say.
     User state, seeded like every other client-state key in this file. */
  seed.clientPlans = {
    'c-rajesh': {
      culture: { templateId: 'tp-nut-l2', modified: true, assignedBy: 'u-sneha',
        overrides: { 3: { slots: null } },   // filled in below
        log: [{ act: 'Assigned Everyday plate — L2 Sedentary', byId: 'u-sneha', minsAgo: 2880 },
              { act: 'Day 3 breakfast swapped', byId: 'u-sneha', minsAgo: 240 }] },
      fitness: { templateId: 'tp-fit-l1', modified: false, assignedBy: 'u-vikram', overrides: {},
        log: [{ act: 'Assigned Foundations — L1 Sedentary', byId: 'u-vikram', minsAgo: 2880 }] },
      yoga: { templateId: 'tp-yog-l1', modified: false, assignedBy: 'u-lakshmi', overrides: {},
        log: [{ act: 'Assigned Breath & spine — L1 Sedentary', byId: 'u-lakshmi', minsAgo: 2820 }] },
      wellness: { templateId: 'tp-mnd-l1', modified: false, assignedBy: 'u-meera', overrides: {},
        log: [{ act: 'Assigned Wind-down — L1 Sedentary', byId: 'u-meera', minsAgo: 2700 }] },
      motivation: { templateId: 'tp-mot-l1', modified: false, assignedBy: 'u-rohan', overrides: {},
        log: [{ act: 'Assigned Opening films — L1 Sedentary', byId: 'u-rohan', minsAgo: 4300 }] },
    },
    /* The rest of the Poorna roster. The library is small on purpose, so a
       Level-5 client sits on the nearest published template rather than a
       bespoke one — a demo that is honest about its own catalogue being
       young, instead of one where four clients have a blank calendar.
       Priya is absent entirely: she is still in her observation window, and
       an unassigned client is exactly what the empty state has to survive. */
    'c-meena': {
      culture: { templateId: 'tp-nut-l2', modified: false, assignedBy: 'u-sneha', overrides: {},
        log: [{ act: 'Assigned Everyday plate — L2 Sedentary', byId: 'u-sneha', minsAgo: 4320 }] },
      fitness: { templateId: 'tp-fit-l1', modified: false, assignedBy: 'u-vikram', overrides: {},
        log: [{ act: 'Assigned Foundations — L1 Sedentary', byId: 'u-vikram', minsAgo: 4320 }] },
      yoga: { templateId: 'tp-yog-l1', modified: false, assignedBy: 'u-lakshmi', overrides: {},
        log: [{ act: 'Assigned Breath & spine — L1 Sedentary', byId: 'u-lakshmi', minsAgo: 4260 }] },
      wellness: { templateId: 'tp-mnd-l1', modified: false, assignedBy: 'u-meera', overrides: {},
        log: [{ act: 'Assigned Wind-down — L1 Sedentary', byId: 'u-meera', minsAgo: 4200 }] },
      motivation: { templateId: 'tp-mot-l1', modified: false, assignedBy: 'u-rohan', overrides: {},
        log: [{ act: 'Assigned Opening films — L1 Sedentary', byId: 'u-rohan', minsAgo: 4320 }] },
    },
    'c-sureshp': {
      culture: { templateId: 'tp-nut-l2', modified: false, assignedBy: 'u-sneha', overrides: {},
        log: [{ act: 'Assigned Everyday plate — L2 Sedentary', byId: 'u-sneha', minsAgo: 10080 }] },
      fitness: { templateId: 'tp-fit-l1', modified: false, assignedBy: 'u-vikram', overrides: {},
        log: [{ act: 'Assigned Foundations — L1 Sedentary', byId: 'u-vikram', minsAgo: 10080 }] },
      yoga: { templateId: 'tp-yog-l1', modified: false, assignedBy: 'u-lakshmi', overrides: {},
        log: [{ act: 'Assigned Breath & spine — L1 Sedentary', byId: 'u-lakshmi', minsAgo: 10020 }] },
      wellness: { templateId: 'tp-mnd-l1', modified: false, assignedBy: 'u-meera', overrides: {},
        log: [{ act: 'Assigned Wind-down — L1 Sedentary', byId: 'u-meera', minsAgo: 9960 }] },
      motivation: { templateId: 'tp-mot-l1', modified: false, assignedBy: 'u-rohan', overrides: {},
        log: [{ act: 'Assigned Opening films — L1 Sedentary', byId: 'u-rohan', minsAgo: 10080 }] },
    },
    'c-ananya': {
      culture: { templateId: 'tp-nut-l1', modified: false, assignedBy: 'u-sneha', overrides: {},
        log: [{ act: 'Assigned Everyday plate — L1 Sedentary', byId: 'u-sneha', minsAgo: 5760 }] },
      fitness: { templateId: 'tp-fit-l1', modified: false, assignedBy: 'u-vikram', overrides: {},
        log: [{ act: 'Assigned Foundations — L1 Sedentary', byId: 'u-vikram', minsAgo: 5760 }] },
      yoga: { templateId: 'tp-yog-l1', modified: false, assignedBy: 'u-lakshmi', overrides: {},
        log: [{ act: 'Assigned Breath & spine — L1 Sedentary', byId: 'u-lakshmi', minsAgo: 5700 }] },
      motivation: { templateId: 'tp-mot-l1', modified: false, assignedBy: 'u-rohan', overrides: {},
        log: [{ act: 'Assigned Opening films — L1 Sedentary', byId: 'u-rohan', minsAgo: 5760 }] },
    },
    'c-mathew': {
      culture: { templateId: 'tp-nut-l2', modified: false, assignedBy: 'u-sneha', overrides: {},
        log: [{ act: 'Assigned Everyday plate — L2 Sedentary', byId: 'u-sneha', minsAgo: 20160 }] },
      fitness: { templateId: 'tp-fit-l1', modified: false, assignedBy: 'u-vikram', overrides: {},
        log: [{ act: 'Assigned Foundations — L1 Sedentary', byId: 'u-vikram', minsAgo: 20160 }] },
      yoga: { templateId: 'tp-yog-l1', modified: false, assignedBy: 'u-lakshmi', overrides: {},
        log: [{ act: 'Assigned Breath & spine — L1 Sedentary', byId: 'u-lakshmi', minsAgo: 20100 }] },
      wellness: { templateId: 'tp-mnd-l1', modified: false, assignedBy: 'u-meera', overrides: {},
        log: [{ act: 'Assigned Wind-down — L1 Sedentary', byId: 'u-meera', minsAgo: 20040 }] },
      motivation: { templateId: 'tp-mot-l1', modified: false, assignedBy: 'u-rohan', overrides: {},
        log: [{ act: 'Assigned Opening films — L1 Sedentary', byId: 'u-rohan', minsAgo: 20160 }] },
    },
    /* Dev is Svayam with only Fitness bought — three pillars deliberately
       unassigned, which is what a partly-filled calendar looks like */
    'c-dev': {
      fitness: { templateId: 'tp-fit-l1', modified: false, assignedBy: 'u-vikram', overrides: {},
        log: [{ act: 'Assigned Foundations — L1 Sedentary', byId: 'u-vikram', minsAgo: 4320 }] },
      motivation: { templateId: 'tp-mot-l1', modified: false, assignedBy: 'u-rohan', overrides: {},
        log: [{ act: 'Assigned Opening films — L1 Sedentary', byId: 'u-rohan', minsAgo: 4320 }] },
    },
  };

  /* ---- session bookings, generated from the same runsOn() the templates use
     ------------------------------------------------------------------------
     THE GAP THIS CLOSES: the console's Schedule and the client's My Plan used
     to be written independently, so Rajesh was told to do yoga at 17:30 while
     Vikram had a fitness session booked for 18:30 the same evening — they
     disagreed about which session even existed. Bookings are now derived from
     the templates' own run-days, so the two clocks agree by construction, and
     HV.calendarFor lets the booking win on time and coach when a coach moves
     one.

     They live in the SEED rather than being built lazily by the Schedule view.
     They used to be built on that page's first open, which meant what a client
     saw depended on whether a coach had happened to visit a console page.

     Only pillars a human carries get a booking: Nutrition is asynchronous, and
     Mind Wellness books the review-day counselling, not the nightly wind-down.
     A booking is one alternate-day series with the non-prescribed occurrences
     cancelled through `exc` — the mechanism the grid already honours — so it
     lands on exactly the days the template names and no others. ---- */
  const BOOK = {
    /* `pref` is the hour the pillar WANTS — yoga at dawn, fitness and mind
       wellness after the working day. It seeds the search; the coach's own
       declared week decides what is actually possible, and when the preferred
       stretch fills the batch spills back through the rest of their day. */
    fitness:  { role: 'fitness',   kind: 'fitness', pref: 17 * 60, dur: 60, title: 'Fitness session' },
    yoga:     { role: 'yoga',      kind: 'yoga',    pref: 6 * 60,  dur: 60, title: 'Yoga session' },
    wellness: { role: 'mind',      kind: 'mind',    pref: 18 * 60, dur: 45, title: 'Mind Wellness session' },
  };
  let bookSeq = 0;
  /* Each client of a coach takes a DISTINCT slot inside that coach's declared
     hours, so no two of their sessions can collide on any day. The previous
     15-minute stagger was arithmetically guaranteed to fail — a 60-minute
     session at 18:30 and another at 18:45 overlap for 45 minutes — and every
     fitness session it placed sat four hours after Vikram went home.

     `placed` is seed.tasks itself, appended to as we go: each client's
     placement must see the ones already made, or they all land on the same
     minute again. */
  function bookingsFor(c, placed) {
    if (c.observation) return;              /* nothing is booked before day 1 */
    Object.keys(BOOK).forEach(pillar => {
      const b = BOOK[pillar];
      /* a human has to be carrying this pillar for there to be an appointment */
      const human = c.plan === 'poorna' || (c.humanPillars || []).indexOf(pillar) !== -1;
      const staffId = (c.pod || {})[b.role];
      if (!human || !staffId || staffId === 'u-ai') return;
      /* only if the template actually prescribes this pillar for this client */
      if (!((seed.clientPlans[c.id] || {})[pillar])) return;

      const days = runsOn(b.kind);
      if (!days.length) return;
      const rd = cd => cd - c.day;
      const world = { users: seed.users, tasks: placed, leaves: [], from: b.pref };
      /* the coach's own week decides the hour, across EVERY day the series
         runs — a slot that clears Tuesday may be outside a narrower Saturday */
      let rds = days.map(rd);
      let start = HV.firstFreeSlot(staffId, rds, b.dur, world);
      /* A ONE-OFF session that lands on the coach's day off MOVES; a recurring
         one skips that occurrence and keeps the other six. Mind Wellness books
         a single counselling a cycle, and nobody cancels a client's counselling
         because it fell on a Sunday — they shift it a day. The moved booking
         reaches the client as an unprescribed one, which is exactly what a
         rescheduled appointment is. */
      if (start == null && days.length === 1) {
        for (const step of [1, -1, 2, -2, 3, -3]) {
          const alt = [rds[0] + step];
          const s = HV.firstFreeSlot(staffId, alt, b.dur, world);
          if (s != null) { rds = alt; start = s; break; }
        }
      }
      if (start == null) return;            /* genuinely unplaceable: no booking
                                               is made, and the template's
                                               prescription goes unbooked */
      const t = { id: 'tk-sd' + (++bookSeq), title: b.title, kind: 'session', pillar: pillar,
        clientId: c.id, assignees: [staffId], groups: [], link: '', notes: '',
        day: rds[0], start: start, dur: b.dur,
        recur: rds.length > 1 ? { freq: 'alt', until: rds[rds.length - 1] } : null,
        exc: {}, done: {} };
      /* an alternate-day series steps over days the template does not name —
         rest days are the usual case — and now also over days its coach does
         not work. Cancel those occurrences rather than inventing a recurrence
         rule that can express "odd days except 5". */
      if (t.recur) {
        const u = seed.users.find(x => x.id === staffId);
        for (let r = t.day; r <= t.recur.until; r += 2) {
          if (days.indexOf(c.day + r) === -1) { t.exc[r] = { cancelled: true }; continue; }
          if (!HV.availFits(u, HV.wdOf(r), start, b.dur)) t.exc[r] = { cancelled: true };
        }
      }
      placed.push(t);
    });
  }
  seed.tasks = [];
  seed.clients.forEach(c => { bookingsFor(c, seed.tasks); });
  /* the Schedule view appends its internal, duty and meeting tasks on top of
     these, once — see tasksAll() there */
  seed.taskSeq = bookSeq;

  /* the one filed session report points at a real booking, found rather than
     named: 'tk-sd<n>' ids come out of the placement loop, so the number moves
     the moment a coach's hours or the cast change */
  (function () {
    const yoga = seed.tasks.find(t => t.clientId === 'c-rajesh' && t.pillar === 'yoga');
    if (yoga) seed.sessionReports[0].taskId = yoga.id;
  })();

  /* Rajesh's swap: the dosa option replaced with cheela on day 3 — the
     "Modified" story. Find Breakfast by NAME, never by index: a positional
     edit here silently rewrites whichever slot happens to sit at that spot. */
  const rajeshBase = seed.templates.find(t => t.id === 'tp-nut-l2').days[3].slots;
  const rajeshMod = JSON.parse(JSON.stringify(rajeshBase));
  const rajeshBfast = rajeshMod.find(s => s.label === 'Breakfast');
  rajeshBfast.options = [[{ id: 'ci-idli', x: 2 }, 'ci-chutney'], ['ci-cheela']];
  seed.clientPlans['c-rajesh'].culture.overrides[3] = { slots: rajeshMod };

  /* Rajesh demos the ticket on first login. Sneha has a Nutrition draft open —
     day 5's dinner swapped and his targets tightened — which the console shows
     as staged and his app does not show at all until she approves it. Find the
     slot by NAME for the same reason the day-3 swap above does. */
  const rjNut = seed.clientPlans['c-rajesh'].culture;
  rjNut.draft = {
    templateId: rjNut.templateId,
    overrides: JSON.parse(JSON.stringify(rjNut.overrides)),
    targets: { kcal: 1650, protein: 95, carbs: 190, fat: 50, fibre: 30 },
    by: 'u-sneha',
  };
  const rjDay5 = JSON.parse(JSON.stringify(
    seed.templates.find(t => t.id === 'tp-nut-l2').days[5].slots));
  const rjDinner = rjDay5.find(s => s.label === 'Dinner');
  if (rjDinner) rjDinner.options = [['ci-upma'], ['ci-curdrice']];
  rjNut.draft.overrides[5] = { slots: rjDay5 };
  rjNut.log.push({ act: 'Draft staged — day 5 dinner and daily targets', byId: 'u-sneha', minsAgo: 30 });

  /* His wind-down moved to 9:30 pm without touching the template — the
     per-client clock, on the one pillar whose evening slot is deliberately
     unbooked, so it is visible on his Today with nothing to click. */
  seed.clientPlans['c-rajesh'].wellness.time = '21:30';
  seed.clientPlans['c-rajesh'].wellness.log.push(
    { act: 'Wind-down moved to 9:30 pm', byId: 'u-meera', minsAgo: 120 });

  HV.seed = seed;

  /* ---------------- how-to cues ----------------
     Two honest coaching cues per exercise in the level books — the task
     sheet's "How to do it". Content, not state: it ships with the seed file
     but never enters the store. HV.howtoKind is the fallback by set
     category for any exercise a future book adds before its cues land. */
  HV.howto = {
    'Slow walking': ['Walk at an easy, comfortable pace — this is about moving, not speed.', 'Keep your shoulders relaxed and let your arms swing naturally.'],
    'Walking': ['Walk tall at a steady pace you could hold for the full duration.', 'Land softly and roll through the whole foot with each step.'],
    'Brisk walk': ['Walk fast enough that your breathing deepens but you can still speak in sentences.', 'Drive gently with your arms — elbows bent, hands relaxed.'],
    'Brisk walk or light jog': ['Start with a brisk walk; ease into a light jog only if it feels comfortable.', 'Keep your breathing steady — drop back to walking any time it races.'],
    'Walk + jog intervals': ['Alternate an easy walk with a gentle jog for the stated stretches.', 'Finish each jog still able to speak — the walk is your recovery, not a pause.'],
    'Marching in place': ['Stand tall and lift your knees one at a time, toward hip height if you can.', 'Swing the opposite arm with each knee to keep an easy rhythm.'],
    'Seated marching': ['Sit tall near the front of a stable chair, feet flat on the floor.', 'Lift one knee at a time and lower it with control, alternating sides.'],
    'Step touch': ['Step one foot out to the side, bring the other to meet it, then reverse.', 'Stay light on your feet and add a gentle arm swing for rhythm.'],
    'Step-ups': ['Step fully onto the step and press through the heel of the top foot.', 'Step down with control and alternate the leading leg.'],
    'Step-ups, low height': ['Use a low, stable step; place the whole foot before you press up.', 'Push through the heel and come down softly, alternating legs.'],
    'Sit-to-stand': ['From sitting, lean slightly forward and stand up without using your hands.', 'Lower back down slowly — the sitting-down half is the exercise too.'],
    'Chair sit-to-stand': ['Sit near the chair’s edge with your feet under your knees, then stand tall.', 'Reverse slowly with control; use your hands only if you must.'],
    'Supported squats': ['Hold a sturdy support, feet shoulder-width, and sit your hips back.', 'Go only as low as feels stable, then press through your heels to rise.'],
    'Half squats': ['Feet shoulder-width apart, sit your hips back to about half depth.', 'Keep your chest lifted and your knees tracking over your toes.'],
    'Squats': ['Feet shoulder-width, sit back and down as if reaching for a chair.', 'Keep your heels grounded and your chest up; press through the floor to rise.'],
    'Full squats': ['Descend under control to your full comfortable depth.', 'Keep your heels down and your chest proud; drive up without bouncing.'],
    'Wall push-ups': ['Hands on a wall at shoulder height, body in one straight line.', 'Bend your elbows to bring your chest toward the wall, then press away.'],
    'Incline push-ups': ['Hands on a bench or counter, body straight from head to heels.', 'Lower your chest to the edge with control, then push back up.'],
    'Push-ups': ['Hands under your shoulders, body in one rigid line from head to heels.', 'Lower your chest close to the floor and press up without letting the hips sag.'],
    'Plank': ['Forearms down, elbows under your shoulders, body in one straight line.', 'Brace your middle and keep breathing — don’t let the hips sag or pike.'],
    'Lunges': ['Step forward and lower until both knees are near right angles.', 'Push through the front heel to return, then switch legs.'],
    'Static lunges': ['Take a split stance and lower straight down, not forward.', 'Keep your front knee over the ankle and press up through the front heel.'],
    'Heel raises': ['Stand tall — hold a support if needed — and rise onto the balls of your feet.', 'Pause at the top, then lower your heels slowly to the floor.'],
    'Burpees, level 2': ['Squat, place your hands down, and step or hop back to a plank.', 'Bring your feet back under you and stand tall — jump only if it feels good.'],
  };
  HV.howtoKind = {
    strength: ['Move with control — two slow counts down, one strong count up.', 'Brace your middle and keep your breath moving; never rush a rep.'],
    muscle: ['Work close to effortful by the last rep, with your form intact.', 'Full range, steady tempo — the slow half of each rep does the building.'],
    endurance: ['Settle into a rhythm you can hold for the whole stated time.', 'Smooth and steady beats fast and ragged — finish able to speak.'],
    cardio: ['Find a pace where your heart lifts but a sentence still comes easily.', 'Tall posture, relaxed shoulders, easy breath — let the rhythm carry you.'],
  };

  /* nav badge counts, computed live from store */
  /* the work list, scoped the way it has always been scoped: Super Admin and
     Operations Head see every task, everyone else sees the ones they own.
     Home reads this; so does the work board. */
  /* Named HV.worklist, NOT HV.tasks — that name belongs to the client app's
     per-client task builder in core.js, which client-today and client-plan
     depend on. Assigning it here would silently break both. */
  HV.worklist = {
    mine: function () {
      const me = HV.me();
      if (!me) return [];
      const open = HV.store.worklist.filter(w => w.status === 'open');
      const isOps = me.role === 'admin' || me.role === 'opshead';
      return isOps ? open : open.filter(w => w.owner === me.id);
    },
    /* clock times and SLAs outrank "today", which outranks everything else.
       sort is stable, so ties keep the order the rules generated them in. */
    next: function () {
      const rank = w => (/\d{1,2}:\d{2}|SLA/.test(w.due) ? 0 : /today/i.test(w.due) ? 1 : 2);
      return HV.worklist.mine().slice().sort((a, b) => rank(a) - rank(b))[0] || null;
    },
  };

  /* Badges follow the eight-item menu: a count sits on the item you would open
     to clear it. Clients absorbs the old pipeline + unread-circles counts (one
     nav item covers both now); Queues absorbs approvals the same way. Queues
     asks its own boards rather than hardcoding their sums, so a role that
     cannot see a board never carries its number. */
  HV.navCounts = function () {
    const s = HV.store;
    const me = HV.me();
    if (!me) return {};
    /* Home also carries my unseen notices — a sweep-fed nudge is something
       you would open Home to clear, same as an open task */
    const homeCount = HV.worklist.mine().length +
      (HV.noticesFor ? HV.noticesFor(me.id).filter(n => !n.seen).length : 0);
    const pipelineCount = s.pipeline.length;
    const circlesUnread = HV.myClients().filter(c => HV.unread(c.id) > 0).length;
    const queuesCount = HV.boardsFor(['meals', 'medical']).reduce((n, b) => n + (b.count ? b.count() : 0), 0);
    const approvalsCount = HV.approvals.queueFor(me.id).length;
    return {
      home:    homeCount,
      clients: pipelineCount + circlesUnread,
      queues:  queuesCount + approvalsCount,
    };
  };
})();
