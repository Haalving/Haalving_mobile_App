/* HAALVING core: store, router, RBAC, shells, UI helpers. No build step, no dependencies. */
(function () {
  'use strict';

  const HV = window.HV = {};
  const STORAGE_KEY = 'haalving-demo-v1';

  /* ---------------- pillar + role metadata ---------------- */
  HV.PILLARS = {
    fitness:  { key: 'fitness',  name: 'Fitness',  sub: 'Move without injury',   cls: 'p-fitness' },
    culture:  { key: 'culture',  name: 'Nutrition', sub: 'The daily plate',      cls: 'p-culture' },
    yoga:     { key: 'yoga',     name: 'Yoga',     sub: 'Strength in stillness', cls: 'p-yoga' },
    wellness: { key: 'wellness', name: 'Mind Wellness', sub: 'Mind & rest',          cls: 'p-wellness' },
  };

  /* ---------------- what a day slot is, per pillar ----------------
     A template is one pillar's programme, so its day slots speak that pillar's
     language: a dietitian writes meals, a fitness coach writes sets and reps, a
     yoga teacher writes minutes and a focus. Every slot still shares the same
     three bones — a label, a time, and items chosen with AND/OR — and the
     extras below hang off those.

     `motivation` is the fifth LIBRARY and the fifth template kind, but it is
     still not a fifth pillar: HV.PILLARS stays at four. It appears here because
     a film is prescribed exactly like anything else, just with fewer fields.

     ONE definition, many readers — the template editor builds its form from
     this, the day sheet renders from it, the client's plan reads it. A pillar's
     fields can only ever change in one place. */
  HV.TPL_PILLARS = ['culture', 'fitness', 'yoga', 'wellness', 'motivation'];

  /* ---- the two catalogue vocabularies ------------------------------------
     CATEGORIES (`tracks`) and TAGS are the two governed lists behind the
     Catalog page, edited in Configuration → Catalog. Both read store-then-seed
     for the same reason HV.shape() does: data.js builds the seed at parse time,
     when HV.store is still null.

     A category is NOT merely a catalog filter — the key is `client.track`, and
     it also indexes the level books (store.program[pillar][track][level]) and
     the level-review criteria. A category with no book of its own falls back to
     Sedentary; that is deliberate, stated in the Config UI, and already what
     every book reader does.

     There used to be a second copy of this list, HV.TRACKS, with zero readers
     anywhere in the app while console-catalog.js drove the whole console from a
     private duplicate. One list, read one way, is the point. */
  HV.tracks = function () {
    return (HV.store && HV.store.tracks) || (HV.seed && HV.seed.tracks) ||
      [{ k: 'sedentary', t: 'Sedentary' }, { k: 'moderate', t: 'Moderate' }, { k: 'active', t: 'Active' }];
  };
  /* The ONE label reader. It used to be answered by bodyCriteria, which meant
     the client's Nutrition level-up card took its LABEL from one object and its
     GOALS from another (cultureCriteria) — add a category to one alone and the
     card read "Athlete" over Sedentary goals. A deleted category still has
     items filed under it, so the raw key is the last resort rather than a
     crash or a blank. */
  HV.trackLabel = function (k) {
    const hit = HV.tracks().filter(t => t.k === k)[0];
    return hit ? hit.t : String(k || '');
  };
  HV.catTags = function () {
    return (HV.store && HV.store.catTags) || (HV.seed && HV.seed.catTags) || [];
  };

  /* ---- a catalogue item's media, in one shape ----------------------------
     An item carries a picture, a film and its instructions, and all three reach
     the client: the picture is the task card's tile and the sheet's hero, the
     film plays inside the instruction sheet, the text is its steps.

     Two shapes exist in the wild and both must keep working. The seeded items
     carry the ORIGINAL {kind, ref} — 'photo' for the four pillars, 'youtube'
     for the films, which HV.film still reads directly. Anything authored since
     carries the named fields. This is the only reader; nothing else should
     unpack `media` itself. */
  HV.itemMedia = function (item) {
    const m = (item && item.media) || {};
    return {
      image: m.image || (m.kind === 'photo' ? m.ref : '') || '',
      video: m.video || (m.kind === 'youtube' ? m.ref : '') || '',
    };
  };
  HV.slotSpec = {
    culture: { name: 'Nutrition', slotWord: 'Meal', itemWord: 'food', time: true,
      cls: 'p-culture', defaults: ['Breakfast', 'Mid-morning', 'Lunch', 'Snack', 'Dinner'],
      /* the plate's numbers are SUMMED from the chosen foods, never typed — a
         coach who edits a total by hand has made it a claim, not a reading */
      sums: true,
      fields: [{ k: 'note', t: 'Note', kind: 'text', ph: 'e.g. finish by 7 pm' }] },
    fitness: { name: 'Fitness', slotWord: 'Session', itemWord: 'exercise', time: true,
      cls: 'p-fitness', defaults: ['Session', 'Warm-up', 'Cool-down'],
      /* weight is TEXT, not a number — "5 kg each", "bodyweight" and "red band"
         are all real prescriptions, and a unit-less bare number is not */
      fields: [{ k: 'sets', t: 'Sets', kind: 'num' }, { k: 'reps', t: 'Reps', kind: 'num' },
               { k: 'weight', t: 'Suggested weight', kind: 'text', ph: 'e.g. 5 kg or bodyweight' },
               { k: 'rpe', t: 'RPE', kind: 'num', max: 10 }, { k: 'mins', t: 'Minutes', kind: 'num' }] },
    yoga: { name: 'Yoga', slotWord: 'Practice', itemWord: 'asana', time: true,
      cls: 'p-yoga', defaults: ['Practice', 'Morning flow', 'Evening flow'],
      fields: [{ k: 'count', t: 'Count', kind: 'num' }, { k: 'sets', t: 'Sets', kind: 'num' },
               { k: 'mins', t: 'Minutes', kind: 'num' },
               { k: 'focus', t: 'Focus', kind: 'text', ph: 'e.g. hips, spine' }] },
    wellness: { name: 'Mind Wellness', slotWord: 'Practice', itemWord: 'practice', time: true,
      cls: 'p-wellness', defaults: ['Wind-down', 'Counselling', 'Meditation'],
      fields: [{ k: 'count', t: 'Count', kind: 'num' }, { k: 'sets', t: 'Sets', kind: 'num' },
               { k: 'mins', t: 'Minutes', kind: 'num' }] },
    motivation: { name: 'Motivation', slotWord: 'Film', itemWord: 'film', time: false,
      cls: 'p-motivation', defaults: ['Morning film'], one: true, fields: [] },
  };
  HV.specFor = function (p) { return HV.slotSpec[p] || HV.slotSpec.fitness; };

  /* An option-group entry is a bare item id ('ci-idli') or, when the coach asks
     for more than one portion, {id:'ci-idli', x:2}. These two are the ONLY way
     to read an entry — every consumer of slot.options goes through them, so the
     grammar can grow in one place. x:1 is canonicalised back to the bare string
     on save; a missing or nonsense x reads as 1. */
  HV.optId = function (e) { return typeof e === 'string' ? e : ((e && e.id) || ''); };
  HV.optX = function (e) {
    const x = e && typeof e === 'object' ? Number(e.x) : 1;
    return x > 1 ? Math.round(x) : 1;
  };

  /* A slot's value for one field, in three rungs: the CLIENT'S own number set
     on their assignment (pass `assign` where a client is in scope — it beats
     the plan's days the same way a.time beats slot.time on the clock), else
     what the coach set on THIS slot, else the catalogue item's own default.
     This is what lets one exercise be prescribed 3x10 at level 1 and 4x15 at
     level 4 without duplicating it in the library — and 12 reps for the one
     knee that asked. */
  HV.doseOf = function (slot, pillar, key, assign) {
    const mine = (assign && assign.dose) || {};
    if (mine[key] !== undefined && mine[key] !== '') return mine[key];
    const own = (slot && slot.dose) || {};
    if (own[key] !== undefined && own[key] !== '') return own[key];
    const lib = (HV.store.catalog && HV.store.catalog[pillar]) || [];
    const first = ((slot && slot.options) || [])[0] || [];
    for (const e of first) {
      const it = lib.find(x => x.id === HV.optId(e));
      if (it && it.dose && it.dose[key] !== undefined && it.dose[key] !== '') return it.dose[key];
    }
    return undefined;
  };

  /* One option group's reading: every macro, and the micros, each food × its
     portion multiple. Micro values are Number-coerced defensively: a store
     exported before v47 can still carry '0.6mg' strings on a coach-authored
     item, and NaN in a sum poisons every row after it. */
  HV.groupSum = function (entries) {
    const lib = (HV.store.catalog && HV.store.catalog.culture) || [];
    return (entries || []).reduce((acc, e) => {
      const n = (lib.find(x => x.id === HV.optId(e)) || {}).nutrients || {};
      const x = HV.optX(e);
      acc.kcal += (Number(n.kcal) || 0) * x;
      acc.protein += (Number(n.protein) || 0) * x;
      acc.carbs += (Number(n.carbs) || 0) * x;
      acc.fat += (Number(n.fat) || 0) * x;
      acc.fibre += (Number(n.fibre) || 0) * x;
      (n.micros || []).forEach(m => {
        const v = Number(m.v) || 0;
        if (m.k && v) acc.micros[m.k] = (acc.micros[m.k] || 0) + v * x;
      });
      return acc;
    }, { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0, micros: {} });
  };

  /* The plate's reading is the FIRST option group's — that is the option the
     client is being asked to eat, and alternatives are alternatives, not
     extra food. The editor reads every group through HV.groupSum so a
     dietitian can weigh Option B against A while composing; the day's totals
     never add them together. */
  HV.slotSum = function (slot) {
    return HV.groupSum(((slot && slot.options) || [])[0]);
  };

  /* ---------------- the programme's shape ----------------
     One question — "how long is a cycle, and how many levels are there?" — used
     to be answered by about sixty literals scattered across the app, which is
     why Configuration → Program could be edited without anything moving.

     These read the store first and fall back to the seed, because HV.store is
     null until boot() runs and views are parsed before that. data.js cannot use
     them at all (it builds the seed at parse time, before HV.seed exists) — it
     owns the single literal, hoisted at the top of its own IIFE.

     The rule that keeps a runtime edit safe: CONFIG decides what gets BUILT,
     the DATA decides what gets DRAWN. A cycle recorded at 11 days must still
     draw 11 cells after the programme moves to 14, so anything rendering a
     stored cycle counts that cycle's own days rather than asking here. */
  HV.shape = function () {
    return (HV.store && HV.store.programShape) || (HV.seed && HV.seed.programShape) ||
      { levels: 7, cycleDays: 14, reviewDay: 12, restDays: [5, 10], meetingDay: 14 };
  };
  HV.cycleDays  = function () { return HV.shape().cycleDays; };
  HV.levels     = function () { return HV.shape().levels; };
  HV.reviewDay  = function () { return HV.shape().reviewDay; };
  HV.meetingDay = function () { return HV.shape().meetingDay; };
  HV.isRest     = function (d) { return (HV.shape().restDays || []).indexOf(d) !== -1; };
  HV.levelList  = function () {
    const out = []; for (let i = 1; i <= HV.levels(); i++) out.push(i); return out;
  };

  /* Sentences that state the shape. Kept here so a screen never has to rebuild
     one, and so the numerals land in the serif data face the design system asks
     for. Copy that quotes an outside document is NOT built here — see the two
     marked strings in console-pipeline.js. */
  HV.copy = {
    dayOf:       (c) => 'Day ' + (c.day || 1) + ' of ' + HV.cycleDays(),
    cycleWord:   () => HV.cycleDays() + '-day',
    journeyLine: () => '<span class="num">' + HV.levels() + '</span> levels × <span class="num">' +
                       HV.cycleDays() + '</span> days each — about <span class="num">' +
                       (HV.levels() * HV.cycleDays()) + '</span> days',
    reviewWord:  () => 'Day-' + HV.reviewDay(),
    meetingWord: () => 'Day-' + HV.meetingDay(),
  };

  /* ---- the engagement term: the SECOND clock ----------------------------
     The programme runs 7 levels × 14 days = 98 days. The term a client has
     paid for is 90. They are different clocks, and the screen must never let
     them be confused — a client mid-level with two weeks of term left is an
     ordinary state, not an error. Both are always LABELLED; neither ever
     shows a bare number.

     Config gives the default length; a client may carry their own term. */
  HV.termDays = function () { return HV.shape().termDays || 90; };

  /* Dates go through HV.dateAdd / HV.todayISO (defined with the real-clock
     helpers further down) rather than toISOString(): that converts to UTC
     first, so local midnight in IST reports as the previous day — the term
     would end a day early and every night would misreport for 5½ hours.
     Both are called at runtime, long after this file has finished parsing. */
  function daysBetween(fromISO, toISO) {
    const a = String(fromISO).split('-'), b = String(toISO).split('-');
    return Math.round((new Date(+b[0], +b[1] - 1, +b[2]) - new Date(+a[0], +a[1] - 1, +a[2])) / 86400000);
  }

  HV.termOf = function (c) {
    const t = (c && c.term) || {};
    const days = t.days || HV.termDays();
    const startISO = t.startISO || (c && c.joinedISO) || HV.todayISO();
    const endISO = HV.dateAdd(startISO, days);
    /* elapsed is clamped into the term so a stale start date can't draw a
       negative bar or one past 100% — but `left` is NOT clamped, because a
       term that ended nine days ago has to be able to say so */
    const raw = daysBetween(startISO, HV.todayISO());
    const elapsed = Math.max(0, Math.min(days, raw));
    return { days: days, startISO: startISO, endISO: endISO,
             elapsed: elapsed, left: days - raw, pct: Math.round(elapsed / days * 100),
             ended: raw >= days, renewals: t.renewals || [] };
  };
  HV.termLeft = function (c) { return HV.termOf(c).left; };

  /* Age is DERIVED, never typed — two numbers that must agree eventually
     disagree. The stored c.age survives only as the fallback for a record
     that has no dob. */
  HV.ageOf = function (c) {
    if (!c) return null;
    if (!c.dob) return c.age == null ? null : c.age;
    return Math.max(0, Math.floor((HV.now() - new Date(c.dob).getTime()) / 31557600000));
  };

  /* ---- the record's running notes --------------------------------------
     The Logs tab is DERIVED from the eight stores that already record things
     — messages, meals, moods, weigh-ins, sessions, stars, plan assignments,
     approvals — plus this one append-only list, for the staff acts that have
     no other home: status changes, profile edits, verifications, level moves,
     coach changes, term renewals.

     Deriving the rest is what lets the demo's seeded history appear on first
     load with no back-fill; no amount of new writing could achieve that
     retroactively. One writer, so an act can never be recorded two ways. */
  HV.logAct = function (client, act, text) {
    if (!client) return;
    const me = HV.me();
    client.log = client.log || [];
    client.log.push({ ts: HV.now(), byId: me ? me.id : null, act: act, text: text });
    HV.save();
  };

  /* ---- what the client actually did ------------------------------------
     Lives on the CLIENT record, mirroring sessionFeedback / moodLog /
     weightLog, because it is the client's own history and has to outlive any
     calendar that happens to draw it.

     THE HAZARD this exists to solve: once the calendar is derived, a screen
     that writes `it.status = 'done'` is writing to a throwaway object. The
     toast fires, the counter moves, and the next paint reverts it. This is
     the only writer, and the three sites that used to mutate an item call it.

     The transition dual-write is gone with HV.store.calendars: sessionLog is
     now the only record, and HV.calendarFor reads it. */
  HV.markSession = function (client, day, pillar, status) {
    if (!client) return;
    client.sessionLog = client.sessionLog || [];
    client.sessionLog.push({ cy: client.cycle, d: day, pillar: pillar, status: status, ts: HV.now() });
    HV.save();
  };

  /* the latest word on one session — last entry wins, so a client who
     cancels and then does it anyway ends up 'done' */
  HV.sessionStatus = function (client, day, pillar) {
    const log = (client && client.sessionLog) || [];
    for (let i = log.length - 1; i >= 0; i--) {
      const e = log[i];
      if (e.cy === client.cycle && e.d === day && e.pillar === pillar) return e.status;
    }
    return null;
  };

  /* 'Oct 13' — the shape the calendar has always spoken */
  const CAL_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                   'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  HV.fmtMonthDay = function (d) { return CAL_MON[d.getMonth()] + ' ' + d.getDate(); };

  /* ---- declared working hours -------------------------------------------
     A weekday holds ONE range or SEVERAL. A personal trainer with six
     one-on-ones works a split shift — early mornings and evenings, nothing
     between — and five and a half hours of sessions fit in no single window.
     Both shapes are read, so no stored record needs migrating:

        mon: ['09:00','17:00']                        one window
        mon: [['06:00','10:00'],['17:00','21:00']]    two
        mon: null / absent                            off                   */
  HV.WD = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  HV.wdOf = function (rd) { return HV.WD[new Date(HV.now() + rd * 864e5).getDay()]; };
  HV.availWindows = function (user, wdKey) {
    const av = user && user.avail;
    const day = av && av[wdKey];
    if (!day || !day.length) return [];
    /* one range is a pair of strings; several is an array of pairs */
    const raw = Array.isArray(day[0]) ? day : [day];
    return raw.map(w => [HV.hmToMin(w[0]), HV.hmToMin(w[1])])
      .filter(w => w[0] != null && w[1] != null && w[1] > w[0])
      .sort((a, b) => a[0] - b[0]);
  };
  /* ONE window must hold the whole session. A session straddling the gap in a
     split shift is not "inside declared hours" — it is two half-sessions with
     the coach's lunch in the middle. */
  HV.availFits = function (user, wdKey, start, dur) {
    if (!user || user.ai) return true;        /* the AI keeps no hours */
    if (!user.avail) return true;             /* nobody has declared any */
    return HV.availWindows(user, wdKey).some(w => start >= w[0] && start + dur <= w[1]);
  };

  /* ---- the conflict engine ----------------------------------------------
     "Can this person be here, then?" asked in ONE place. The rule lived inside
     console-schedule.js, so the seed generator and the cover board could not
     reach it and quietly booked a coach four hours after he went home. Same
     disease HV.occursOn cured below, same cure: a view may read core; core may
     reach into no view.

     Every function takes its world in `o` and only falls back to the store,
     because data.js calls this at PARSE time — HV.store is null there and
     HV.staff() resolves nobody.

     `o.peopleOf(task, occurrence)` is the caller's own resolver. Group
     expansion belongs to the Schedule view (its groups are derived per client
     and are cover-aware), so the engine never guesses at it; the default reads
     the occurrence's assignees, which is what a seeded booking carries. */
  function capWorld(o) {
    o = o || {};
    const s = HV.store || {};
    return {
      tasks: o.tasks || s.tasks || [],
      users: o.users || s.users || [],
      leaves: o.leaves || s.leaves || [],
      exceptIds: o.exceptIds || [],
      allowOverlap: !!o.allowOverlap,
      peopleOf: o.peopleOf || function (t, occ) {
        return (occ && occ.assignees) || t.assignees || [];
      },
    };
  }
  function capUser(w, id) { return w.users.find(u => u.id === id) || null; }
  function capName(w, id) { const u = capUser(w, id); return u ? u.name : id; }

  /* who already holds these minutes. An overlap is permitted only when the
     INCOMING task and EVERY task it lands on both allow it — a task that
     permits overlap cannot force itself on top of one that does not. */
  HV.busyAt = function (people, rd, start, dur, o) {
    const w = capWorld(o);
    const out = [];
    w.tasks.forEach(function (t) {
      if (w.exceptIds.indexOf(t.id) !== -1) return;
      /* a RHYTHM is a standing to-do pinned to a nominal hour — the daily
         reminder sweep, the photo follow-ups. It is not an appointment: it
         holds no capacity and blocks none, in either direction. Distinct from
         allowOverlap, which is two APPOINTMENTS agreeing to run side by side
         and therefore needs both of them to say so. */
      if (t.rhythm) return;
      const occ = HV.occursOn(t, rd);
      if (!occ) return;
      if (occ.start + occ.dur <= start || occ.start >= start + dur) return;
      if (w.allowOverlap && t.allowOverlap) return;
      w.peopleOf(t, occ).forEach(function (id) {
        if (people.indexOf(id) === -1) return;
        if (out.some(x => x.whoId === id && x.taskId === t.id)) return;
        out.push({ type: 'busy', whoId: id, who: capName(w, id),
                   detail: occ.title, taskId: t.id });
      });
    });
    return out;
  };
  HV.outsideHours = function (people, rd, start, dur, o) {
    const w = capWorld(o);
    const wd = HV.wdOf(rd);
    const out = [];
    people.forEach(function (id) {
      const u = capUser(w, id);
      if (!u || u.ai || !u.avail) return;
      if (HV.availFits(u, wd, start, dur)) return;
      const win = HV.availWindows(u, wd);
      out.push({ type: 'hours', whoId: id, who: u.name,
        detail: win.length
          ? 'works ' + win.map(v => HV.fmtTime(v[0]) + '–' + HV.fmtTime(v[1])).join(' and ')
          : 'is off that day' });
    });
    return out;
  };
  HV.onLeaveAt = function (people, rd, o) {
    const w = capWorld(o);
    const iso = HV.dateAdd(HV.todayISO(), rd);
    const out = [];
    people.forEach(function (id) {
      const lv = w.leaves.find(l => l.staffId === id && l.status === 'approved' &&
                                    l.from <= iso && iso <= l.to);
      if (lv) out.push({ type: 'leave', whoId: id, who: capName(w, id),
                         detail: 'on approved leave' });
    });
    return out;
  };
  /* The union, most-blocking first.

     `o.hoursFor` narrows WHO the declared-hours check applies to, and defaults
     to everyone. The distinction is real: you can refuse to put a NAMED PERSON
     somewhere, but you cannot refuse to INVITE A TEAM. A whole-team meeting
     cannot sit inside twelve people's windows at once — Lakshmi finishes at
     12:00 and Meera starts at 14:00, so no hour on the clock satisfies both —
     and hard-refusing on hours would make the SOP's own meetings unschedulable.
     Being booked and being on leave still apply to everybody: those are facts
     about the person, not about who invited them. */
  HV.conflicts = function (people, rd, start, dur, o) {
    const hoursFor = (o && o.hoursFor) || people;
    return HV.busyAt(people, rd, start, dur, o)
      .concat(HV.onLeaveAt(people, rd, o))
      .concat(HV.outsideHours(hoursFor, rd, start, dur, o));
  };

  /* the earliest minute a recurring session can sit on EVERY day it runs.
     `rds` is a LIST, not a day: a series that clears Tuesday may be outside a
     narrower Saturday window, and the seed must not discover that a week
     later. Days the person does not work at all are skipped rather than
     fatal — a coach's day off removes that occurrence, it does not cancel the
     series.

     `from` is a preference, not a promise. When the preferred stretch fills,
     the batch spills back through the rest of the working day; the demo keeps
     its character (yoga at dawn) without the seed ever inventing an
     out-of-hours slot to keep it.

     null is a real answer: the series cannot be placed, and the caller must
     say so rather than booking a coach who has gone home. */
  HV.firstFreeSlot = function (personId, rds, dur, o) {
    o = o || {};
    const w = capWorld(o);
    const step = o.step || 15;
    const user = capUser(w, personId);
    const days = (rds || []).filter(rd => HV.availWindows(user, HV.wdOf(rd)).length > 0);
    if (!days.length) return null;
    /* candidate minutes: every window on every day, on the step grid, deduped */
    const seen = {}, cands = [];
    days.forEach(function (rd) {
      HV.availWindows(user, HV.wdOf(rd)).forEach(function (win) {
        for (let m = Math.ceil(win[0] / step) * step; m + dur <= win[1]; m += step) {
          if (!seen[m]) { seen[m] = 1; cands.push(m); }
        }
      });
    });
    const from = o.from || 0;
    /* at or after the preference first, in time order; then everything before
       it, also in time order */
    cands.sort(function (a, b) {
      return ((a >= from ? 0 : 1) - (b >= from ? 0 : 1)) || (a - b);
    });
    const hit = cands.find(function (m) {
      return days.every(rd => HV.conflicts([personId], rd, m, dur, o).length === 0);
    });
    return hit == null ? null : hit;
  };

  /* ---- recurrence, and the bookings behind it ---------------------------
     A scheduled task lives on a days-RELATIVE-TO-TODAY axis (`day: 0` is
     today, `-1` yesterday) with a recurrence rule and per-day exceptions.
     The derived calendar lives on a CYCLE-DAY axis (1..cycleDays). These are
     the app's two clocks, and this pair of functions is the only place they
     are reconciled.

     occursOn lived inside console-schedule.js, with the same arithmetic
     copied into console-digest.js and the reminder band — three copies, free
     to drift. It belongs here: recurrence is model logic, and a VIEW may read
     core while core must never reach into a view. */
  HV.occursOn = function (t, rd) {
    let hit = false;
    if (!t.recur) hit = t.day === rd;
    else if (rd >= t.day && (t.recur.until == null || rd <= t.recur.until)) {
      const gap = rd - t.day;
      hit = t.recur.freq === 'daily' ? true
        : t.recur.freq === 'alt' ? gap % 2 === 0
        : gap % 7 === 0;
    }
    if (!hit) return null;
    const ex = (t.exc || {})[rd];
    if (ex && ex.cancelled) return null;
    return {
      t: t, rd: rd,
      start: ex && ex.start != null ? ex.start : t.start,
      dur: ex && ex.dur != null ? ex.dur : t.dur,
      title: ex && ex.title ? ex.title : t.title,
      link: ex && ex.link != null ? ex.link : t.link,
      notes: ex && ex.notes != null ? ex.notes : t.notes,
      /* a per-occurrence coach swap. This is how an approved leave cover
         reaches the grid, the digest, the reminder sweep AND the client's My
         Plan from a single write — every one of them reads the occurrence.
         Without it the cover moved the SEAT (HV.staffFor) while the
         appointment kept the absent coach's name. */
      assignees: ex && ex.assignees ? ex.assignees : (t.assignees || []),
      edited: !!ex,
      done: !!(t.done || {})[rd],
    };
  };

  /* the booking for one pillar on one CYCLE day, if a coach has made one.
     rd = cycleDay - client.day converts between the two axes. */
  HV.bookingFor = function (client, cycleDay, pillar) {
    if (!client) return null;
    const rd = cycleDay - client.day;
    const tasks = (HV.store.tasks || []).filter(t =>
      t.kind === 'session' && t.clientId === client.id && t.pillar === pillar);
    for (let i = 0; i < tasks.length; i++) {
      const occ = HV.occursOn(tasks[i], rd);
      if (occ) return occ;
    }
    return null;
  };
  /* every booking on one cycle day, whatever pillar */
  HV.bookingsOn = function (client, cycleDay) {
    if (!client) return [];
    const rd = cycleDay - client.day;
    const out = [];
    (HV.store.tasks || []).forEach(t => {
      if (t.kind !== 'session' || t.clientId !== client.id) return;
      const occ = HV.occursOn(t, rd);
      if (occ) out.push(occ);
    });
    return out;
  };

  /* ---- session reports: who owes one -----------------------------------
     The obligation is DERIVED, never stored. A report is owed while three
     things hold at once: the task asks for one, its occurrence has ENDED by
     the clock, and this person has not filed. Storing the obligation would
     need a write every time somebody walked into a room they were never
     rostered for.

     Everything here keys on the REAL date, never rd. rd is a sliding axis —
     0 is always today and nothing ages, so the demo week replays — which
     means an rd-keyed attendance stamp reads as "joined today" every
     morning for ever, and an rd-keyed report would answer tomorrow's
     obligation too. Same reason t.reminded is stamped by todayISO. */
  HV.reportRequired = function (t) {
    /* a client-less meeting (the all-hands) conscripts nobody: twelve people
       do not each owe a "session report" for standing in the same room */
    if (!t || !t.clientId) return false;
    if (t.kind !== 'session' && t.kind !== 'meeting') return false;
    return t.reportRequired !== false;      /* absent means required */
  };
  HV.sessionEnded = function (occ, nowMin) {
    return !!occ && (occ.start || 0) + (occ.dur || 0) <= nowMin;
  };
  HV.reportFiled = function (taskId, dateISO, uid) {
    return (HV.store.sessionReports || []).some(r =>
      r.taskId === taskId && r.dateISO === dateISO && r.byId === uid);
  };
  /* one row per person per ended occurrence. Takes its clock in `o` for the
     same reason the sweeps do: a rule whose whole job is reading the time
     cannot be verified by a caller that cannot move it. */
  HV.reportsOwed = function (o) {
    o = o || {};
    const d = new Date();
    const nowMin = o.nowMin != null ? o.nowMin : d.getHours() * 60 + d.getMinutes();
    const today = o.todayISO || HV.todayISO();
    const users = HV.store.users || [];
    const isStaff = id => {
      const u = users.find(x => x.id === id);
      return !!u && u.role !== 'client' && !u.ai && !u.inactive;
    };
    const out = [];
    (HV.store.tasks || []).forEach(t => {
      if (!HV.reportRequired(t)) return;
      const c = HV.client(t.clientId);
      if (!c || c.observation) return;
      const occ = HV.occursOn(t, 0);
      if (!HV.sessionEnded(occ, nowMin)) return;
      /* a session the client called off never happened, so nobody owes a
         report on it. The occurrence itself stays on the grid (the client
         cancels through markSession, not through exc), so this is the only
         place that difference can be seen. */
      if (t.pillar && HV.sessionStatus(c, c.day, t.pillar) === 'cancelled') return;
      /* occ.assignees, never t.assignees — an approved cover owes the report
         and the coach who was away does not. Joiners union in on top, so the
         admin who dropped into the room owes one as well. Group members are
         NOT expanded: group expansion is cover-aware view logic and core must
         never reach into a view, so a group invitee owes only if they joined. */
      const seats = (occ.assignees || []).slice();
      Object.keys(((t.joined || {})[today]) || {}).forEach(uid => {
        if (seats.indexOf(uid) < 0) seats.push(uid);
      });
      seats.forEach(uid => {
        if (!isStaff(uid)) return;           /* the client walks into the same room */
        if (HV.reportFiled(t.id, today, uid)) return;
        out.push({ t: t, occ: occ, uid: uid, dateISO: today, clientId: t.clientId });
      });
    });
    return out;
  };

  /* ---- the derived calendar — the pass between kitchen and dining room --
     A client's cycle is the UNION of their assigned per-pillar templates.
     Nothing is hand-seeded any more: a coach assigns a template, and this is
     what turns it into the days the client sees. (This is finding F2.)

     THREE RULES, all load-bearing:

     1. items[] is SESSIONS ONLY; the plate gets its own meals[]. Three meals
        a day inside items breaks five readers at once — dayDone would demand
        three meals be ticked before the day-complete celebration fires,
        dayKept would kill every streak, and HV.brief would announce
        "Next session: Breakfast".
     2. Filter to KNOWN session pillar keys. client-plan.js reads
        HV.PILLARS[it.pillar].name unguarded, so one 'motivation' slot leaking
        into items is a TypeError that blanks My Plan.
     3. ALWAYS return the full N-day skeleton, never []. An empty array is
        what quietly breaks things: cal.findIndex(d => d.today) returns -1,
        which silently removes Join buttons and the meal counter, and opens
        the Nutrient Panel on day 1 instead of today. */
  const CAL_ROLE = { culture: 'dietitian', fitness: 'fitness', yoga: 'yoga', wellness: 'mind' };
  const CAL_SESSION = ['fitness', 'yoga', 'wellness'];   /* rule 2, in one place */
  let calCache = { key: null, val: null };
  HV.clearCalCache = function () { calCache = { key: null, val: null }; };

  HV.calendarFor = function (client, opts) {
    if (!client) return [];
    const cycle = (opts && opts.cycle) || client.cycle;
    const key = client.id + '|' + cycle + '|' + client.day;
    if (calCache.key === key) return calCache.val;

    const shape = HV.shape();
    const n = shape.cycleDays;
    const rest = shape.restDays || [];
    const out = [];
    for (let d = 1; d <= n; d++) {
      const items = [];
      const claimed = {};   /* which bookings a prescribed slot has absorbed */
      CAL_SESSION.forEach(function (p) {
        /* the client's own hour for this pillar, set on the assignment and
           read once per pillar rather than per slot */
        const ap = HV.assignment(client, p);
        const own = ap ? HV.hmToMin(ap.time) : null;
        HV.slotsFor(client, p, d).forEach(function (slot) {
          /* THE RECONCILIATION. The template prescribes WHAT and WHICH DAY;
             a coach's booking decides WHEN and WITH WHOM, and the booking
             wins — the client attends the appointment, not the prescription,
             and "the coach's judgement sits above the AI's assistance".
             Without this the console showed a coach one time and the client
             another, with nothing reconciling them. */
          const b = HV.bookingFor(client, d, p);
          if (b) claimed[p] = true;
          /* the booking wins on WHEN and WITH WHOM — not on what the session
             IS. Letting its generic series title through turned the template's
             "Strength (bands) II" into "Fitness session" for every client who
             had a booking. A per-day title the coach typed themselves is a
             deliberate act, so that still wins. */
          const renamed = b && b.title !== b.t.title ? b.title : null;
          items.push({
            pillar: p,
            /* the item carries its own day: a derived calendar builds fresh
               objects every call, so identity can't answer "which day is
               this?" the way it did when items were the live store */
            day: d,
            label: renamed || slot.label || (b && b.title) || HV.specFor(p).slotWord,
            /* THE CLOCK, in three rungs. A booking is an appointment and wins
               outright. Below it sits the CLIENT'S own hour for this pillar —
               Rajesh does yoga at 6:30, Meera's other client at 19:00, off one
               template — and below that the template's own suggested time. */
            time: b ? HV.fmtTime(b.start)
                    : (own != null ? HV.fmtTime(own) : (slot.time || '')),
            staffId: b ? (b.assignees[0] || HV.staffFor(client, CAL_ROLE[p]).id)
                       : HV.staffFor(client, CAL_ROLE[p]).id,
            booked: !!b,
            status: HV.sessionStatus(client, d, p) ||
              (d < client.day ? 'done' : d === client.day ? 'today' : 'planned'),
            slot: slot,
          });
        });
      });
      /* A booking the plan does not prescribe still belongs on the client's
         day. Dev had a Svayam check-in booked with his coach that his own app
         never mentioned — a session nobody told the client about is worse than
         one that isn't in the template. */
      HV.bookingsOn(client, d).forEach(function (b) {
        const p = b.t.pillar;
        if (!p || CAL_SESSION.indexOf(p) === -1 || claimed[p]) return;
        items.push({
          pillar: p, day: d,
          label: b.title || HV.specFor(p).slotWord,
          time: HV.fmtTime(b.start),
          staffId: b.assignees[0] || HV.staffFor(client, CAL_ROLE[p]).id,
          booked: true, unprescribed: true,
          status: HV.sessionStatus(client, d, p) ||
            (d < client.day ? 'done' : d === client.day ? 'today' : 'planned'),
          slot: null,
        });
      });
      const meals = HV.slotsFor(client, 'culture', d);

      out.push({
        day: d, items: items, meals: meals,
        date: HV.fmtMonthDay(new Date(HV.now() + (d - client.day) * 86400000)),
        today: d === client.day,
        /* rest comes from CONFIG, full stop. It was briefly gated on the day
           being empty — which silently deleted every rest day, because the
           Mind Wellness template prescribes a nightly wind-down on all of
           them. A ten-minute wind-down does not stop a rest day being a rest
           day, and config is what decides that. */
        rest: rest.indexOf(d) !== -1,
        review: d === shape.reviewDay,
        meeting: d === shape.meetingDay,
      });
    }
    calCache = { key: key, val: out };
    return out;
  };

  /* ---- the plate --------------------------------------------------------
     mealPlans STAYS. It carries three things a template slot does not: the
     per-slot kcal/protein the Nutrient Panel uses as daily targets, the
     fibre → protein → carbs `parts` teaching order, and the human-voiced
     `swap` line. So the assigned template supplies WHAT and WHEN, and
     mealPlans supplies the teaching around it, matched by slot name.

     Pointing HV.tasks' culture branch at this is the single call-site change
     that closes F2 for Nutrition — Today, My Plan and the task sheets all
     already read HV.tasks(client).culture. */
  HV.plateFor = function (client, day) {
    const fallback = (HV.store.mealPlans && HV.store.mealPlans[client.id]) || null;
    const slots = HV.slotsFor(client, 'culture', day);
    if (!slots.length) return fallback;

    const lib = (HV.store.catalog && HV.store.catalog.culture) || [];
    const asg = HV.assignment(client, 'culture');
    /* an entry speaks its portion: 'Idli ×2', but never a redundant '×1' */
    const nameOf = e => {
      const it = lib.find(x => x.id === HV.optId(e));
      const nm = it ? it.name : HV.optId(e);
      const x = HV.optX(e);
      return x > 1 ? nm + ' ×' + x : nm;
    };
    const byName = {};
    ((fallback && fallback.slots) || []).forEach(s => { byName[s.slot] = s; });

    return { slots: slots.map(s => {
      const ref = byName[s.label] || {};
      const sum = HV.slotSum(s);
      /* the dish's OWN picture and recipe film, from the first food named —
         the group's lead ingredient is what the slot looks like on a plate */
      const lead = lib.find(x => x.id === HV.optId((((s.options || [])[0] || [])[0]))) || null;
      const med = HV.itemMedia(lead);
      /* the AND/OR grammar, spoken as a sentence: groups join with '+',
         alternatives with 'or' */
      const dish = (s.options || []).map(grp => grp.map(nameOf).join(' + ')).join(' or ');
      return {
        slot: s.label || 'Meal',
        time: s.time || ref.time || '',
        dish: dish || ref.dish || '',
        /* summed from the catalogue, never typed — a coach who edits a total
           by hand has made a claim rather than taken a reading. carbs/fat/fibre
           have no legacy rung: the mealPlans header never knew them. */
        kcal: sum.kcal || ref.kcal || 0,
        protein: sum.protein || ref.protein || 0,
        carbs: sum.carbs || 0,
        fat: sum.fat || 0,
        fibre: sum.fibre || 0,
        photo: ref.photo || false,
        parts: ref.parts || null,
        note: HV.doseOf(s, 'culture', 'note', asg) || ref.note || '',
        swap: ref.swap || '',
        image: med.image,
        video: med.video,
        how: (lead && lead.instructions) || '',
      };
    }) };
  };

  /* ---- the VS Code-style splitter, for any two-pane surface -------------
     Drag the seam, double-click resets, arrow keys nudge. The width rides a
     CSS variable on the pad so a phone layout (stacked panes, no splitter)
     can ignore it without fighting an inline width, and it persists in
     HV.store.ui[key] so each surface remembers its own size — a coach sizes
     the Clients scratch pad and the template day editor for different jobs.

     opts: { div, pad, cssVar, key, min, max, def } — all required in spirit;
     the defaults below are the Clients workspace's own numbers. */
  HV.wireSplitter = function (root, opts) {
    const o = opts || {};
    const sel = o.div || '.ccdiv', psel = o.pad || '.ccpad';
    const cssVar = o.cssVar || '--padw', key = o.key || 'padW';
    const min = o.min || 264, max = o.max || 560, def = o.def || 332;
    const div = root && root.querySelector(sel);
    const pad = root && root.querySelector(psel);
    if (!div || !pad) return;
    const ui = function () { return HV.store.ui = HV.store.ui || {}; };
    const clamp = function (w) { return Math.max(min, Math.min(max, Math.round(w))); };
    function setW(w) {
      w = clamp(w);
      pad.style.setProperty(cssVar, w + 'px');
      div.setAttribute('aria-valuenow', w);
      ui()[key] = w;
      HV.save();
    }
    function reset() {
      pad.style.removeProperty(cssVar);
      div.setAttribute('aria-valuenow', def);
      delete ui()[key];
      HV.save();
    }
    let startX = 0, startW = 0, dragging = false;
    div.addEventListener('pointerdown', function (e) {
      dragging = true;
      startX = e.clientX;
      startW = pad.getBoundingClientRect().width;
      div.setPointerCapture(e.pointerId);
      div.classList.add('drag');
      /* preventDefault (needed against text selection) also suppresses
         focus-on-mousedown — restore it, or the arrow keys stay unreachable */
      div.focus();
      e.preventDefault();
    });
    div.addEventListener('pointermove', function (e) {
      if (dragging) pad.style.setProperty(cssVar, clamp(startW + (startX - e.clientX)) + 'px');
    });
    function done() {
      if (!dragging) return;
      dragging = false;
      div.classList.remove('drag');
      setW(pad.getBoundingClientRect().width);
    }
    div.addEventListener('pointerup', done);
    div.addEventListener('pointercancel', done);
    div.addEventListener('dblclick', reset);
    div.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === 'Home') { reset(); e.preventDefault(); return; }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      setW(pad.getBoundingClientRect().width + (e.key === 'ArrowLeft' ? 16 : -16));
      e.preventDefault();
    });
  };

  /* A template's targets for one day. Targets live ON THE DAY now, and a day
     that states none INHERITS from the nearest earlier day that did — that is
     both the composer's prefill rule and the read rule, one rule, so what the
     coach saw while typing day 3 is exactly what day 9 resolves to. A
     template that still carries the old template-level `targets` reads as if
     day 1 had stated them. */
  HV.tplTargetsOn = function (t, day) {
    if (!t) return null;
    for (let d = Math.max(1, Math.min(day || 1, HV.cycleDays())); d >= 1; d--) {
      const tg = t.days && t.days[d] && t.days[d].targets;
      if (tg && tg.kcal) return tg;
    }
    return (t.targets && t.targets.kcal) ? t.targets : null;
  };

  /* ---- the day's nutrition targets, resolved in ONE place ---------------
     Four rungs, per field, so a coach can author as little or as much as they
     like and the panel always has a number:

       1. this client's own override on the assignment (the ticket)
       2. the assigned template's targets for THIS day (stated or inherited
          from the nearest earlier day — HV.tplTargetsOn)
       3. the legacy mealPlans header — kcal and protein only, which is all it
          ever carried
       4. derived — 1800 kcal, protein at 20% of energy, fibre at the
          store's grams-per-1000-kcal rate

     Every macro has rungs 1-2; carbs and fat keep the energy-split derivation
     as their bottom rung (there is no legacy mealPlans rung for them — the
     header never knew them), so a day that states only kcal/protein/fibre
     still resolves cleanly.

     LIVE fields only. An unapproved draft must not move a client's dials. */
  HV.nutTargetsFor = function (client, day) {
    if (!client) return null;
    const a = HV.assignment(client, 'culture');
    const t = a && (HV.store.templates || []).find(x => x.id === a.templateId);
    const ov = (a && a.targets) || {};
    const tt = HV.tplTargetsOn(t, day || client.day || 1) || {};
    const mp = (HV.store.mealPlans || {})[client.id] || {};
    const nut = HV.store.nutrition || {};
    /* NULL when nobody has said anything and nothing is prescribed. A client
       still in the observation window has no plate and no plan, and the panel
       has its own "still calibrating" state for exactly that — inventing 1800
       kcal for them would put a Deficient reading against a target no one set.
       An assigned template with no targets DOES get the derivation: there is a
       real prescribed plate to measure, which is a different situation. */
    /* the record EXISTING is not enough — "Call a template" writes a live
       record with a null templateId precisely so the client sees nothing, and
       keying on the record would leak a full panel reading off an unapproved
       ticket. What counts is an APPROVED template, a plate, or a stated target. */
    if (!ov.kcal && !tt.kcal && !mp.kcal && !(a && a.templateId)) return null;
    const kcal = ov.kcal || tt.kcal || mp.kcal || 1800;
    const split = nut.split || {};
    return {
      kcal: kcal,
      protein: ov.protein || tt.protein || mp.protein || Math.round(kcal * 0.2 / 4),
      carbs: ov.carbs || tt.carbs || Math.round(kcal * (split.carbs || 0.5) / 4),
      fat: ov.fat || tt.fat || Math.round(kcal * (split.fat || 0.27) / 9),
      fibre: ov.fibre || tt.fibre || Math.round(kcal / 1000 * (nut.fibrePer1000 || 14)),
      src: ov.kcal ? 'client' : tt.kcal ? 'template' : mp.kcal ? 'plan' : 'derived',
    };
  };

  /* RBAC — nav item ids each role may see; perms consulted via HV.can() */
  HV.ROLES = {
    client:    { title: 'Client',              shell: 'client',  home: '#/today' },
    admin:     { title: 'Super Admin',        shell: 'console', home: '#/home',
                 nav: ['home','clients','queues','schedule','catalog','community','people','leave','config'],
                 perms: ['seeAllClients','approve','allocate','editRules','sendDigest','keyInBody',
                         'overrideCapacity','finalizeLevel','editAnyCatalog','editTemplates',
                         'assignPlan','manageTribe','managePeople','manageConfig',
                         'assignPod','broadcast','announceClients','approveLeave','joinAnySession'] },
    /* Haalving Coach — lead client coach; first signature on every chain (was Ops Manager) */
    opsmgr:    { title: 'Haalving Coach',     shell: 'console', home: '#/home',
                 nav: ['home','clients','queues','schedule','catalog','community','leave'],
                 perms: ['seeAllClients','approve','allocate','sendDigest',
                         'assignPlan','editTemplates','manageTribe'] },
    opshead:   { title: 'Operations Head',    shell: 'console', home: '#/home',
                 nav: ['home','clients','queues','schedule','catalog','community','people','leave','config'],
                 perms: ['seeAllClients','approve','allocate','overrideCapacity','editRules',
                         'finalizeLevel','sendDigest','editAnyCatalog','editTemplates',
                         'assignPlan','manageTribe','manageConfig',
                         'assignPod','broadcast','announceClients'] },
    /* Super User — management reviewer; final signature; read-only elsewhere */
    core:      { title: 'Super User',         shell: 'console', home: '#/queues/approvals',
                 nav: ['home','clients','queues','schedule','catalog','community','people','leave','config'],
                 perms: ['seeAllClients','approve'] },
    doctor:    { title: 'Doctor',             shell: 'console', home: '#/home',
                 nav: ['home','clients','queues','schedule','catalog','leave'],
                 perms: ['rawRecords','signSummary'] },
    dietitian: { title: 'Dietician',          shell: 'console', home: '#/queues/meals',
                 nav: ['home','clients','queues','schedule','catalog','leave'],
                 perms: ['rateMeals','buildDiet','editCatalog'] },
    fitness:   { title: 'Fitness Coach',      shell: 'console', home: '#/home',
                 nav: ['home','clients','queues','schedule','catalog','leave'],
                 perms: ['buildCharts','editCatalog'] },
    yoga:      { title: 'Yoga Coach',         shell: 'console', home: '#/home',
                 nav: ['home','clients','queues','schedule','catalog','leave'],
                 perms: ['buildCharts','editCatalog'] },
    mind:      { title: 'Mind Wellness Coach',shell: 'console', home: '#/home',
                 nav: ['home','clients','queues','schedule','catalog','leave'],
                 perms: ['buildCharts','editCatalog'] },
    /* Head of Department — leads one of the four coach benches (u.dept says
       which); sees the dept's clients, runs its cover board on leave */
    hod:       { title: 'Head of Department', shell: 'console', home: '#/home',
                 nav: ['home','clients','queues','schedule','catalog','people','leave'],
                 perms: ['seeDeptClients','allocate','assignPod','approve','broadcast','reassignLeave'] },
    ai:        { title: 'AI Coach', shell: 'console', home: '#/home', nav: [], perms: [] },
  };

  /* Eight items. `owns` lists the sub-routes that light a parent, so a deep link
     never leaves the sidebar with nothing marked. */
  HV.NAV_ITEMS = {
    home:      { route: '#/home',       label: 'Home',            icon: 'home',    owns: ['reports'] },
    clients:   { route: '#/clients',    label: 'Clients',         icon: 'users',   owns: ['client','review'] },
    queues:    { route: '#/queues',     label: 'Work Queues',     icon: 'clock',   owns: ['approvals','meals','medical','builder'] },
    schedule:  { route: '#/schedule',   label: 'Schedule',        icon: 'cal' },
    catalog:   { route: '#/catalog',    label: 'Catalog',         icon: 'bookmark' },
    /* Community — the console side of the client's Community tab. Same word,
       same honeycomb mark the client tab bar carries, so staff and clients
       name the one place identically (TJ, 17 Aug; was 'Tribe' at #/tribe-admin) */
    community: { route: '#/community',  label: 'Community',       icon: 'tribe' },
    people:    { route: '#/people',     label: 'People & Access', icon: 'user' },
    leave:     { route: '#/leave',      label: 'Time & Cover',    icon: 'cal' },
    config:    { route: '#/config',     label: 'Configuration',   icon: 'gear' },
  };

  /* ---------------- store ---------------- */
  HV.store = null;

  HV.save = function () {
    /* the derived calendar is memoised; anything that writes the store may
       have changed what it derives from. Dropping the cache here is what
       stops "I assigned a template and nothing happened". */
    HV.clearCalCache();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(HV.store)); } catch (e) { /* private mode: demo continues in memory */ }
  };
  HV.reset = function () {
    localStorage.removeItem(STORAGE_KEY);
    location.hash = '#/login';
    location.reload();
  };

  /* ---------------- session helpers ---------------- */
  HV.me = function () {
    return HV.store.users.find(u => u.id === HV.store.session) || null;
  };
  /* roles live in the store (People & Access edits them); code matrix is the fallback seed */
  HV.roleDef = function (key) {
    const s = HV.store;
    return (s && s.roles && s.roles[key]) || HV.ROLES[key] || null;
  };
  HV.roleMeta = function () { const m = HV.me(); return m ? HV.roleDef(m.role) : null; };
  HV.can = function (perm) {
    const r = HV.roleMeta();
    return !!(r && r.perms && r.perms.includes(perm));
  };
  HV.client = function (id) { return HV.store.clients.find(c => c.id === id); };
  /* staff see allocated clients only; admin/opshead see all (PRD AC-4.6.4).
     Pod membership is COVER-AWARE: while a leave cover is active the covering
     coach gains the client and the absent coach loses them — HV.staffFor is
     the single resolver both this and the views lean on. An HoD sees every
     client whose seat for their department resolves to someone on that bench. */
  HV.myClients = function () {
    const me = HV.me();
    if (!me) return [];
    if (me.role === 'client') return HV.store.clients.filter(c => c.userId === me.id);
    if (HV.can('seeAllClients')) return HV.store.clients;
    if ((me.role === 'hod' || HV.can('seeDeptClients')) && me.dept) {
      const bench = HV.deptMembers(me.dept).map(u => u.id);
      return HV.store.clients.filter(c => bench.includes(HV.staffFor(c, me.dept).id));
    }
    return HV.store.clients.filter(c =>
      Object.keys(c.pod || {}).some(k => HV.staffFor(c, k).id === me.id));
  };
  HV.myClient = function () { /* the logged-in client's record */
    const me = HV.me();
    return me ? HV.store.clients.find(c => c.userId === me.id) : null;
  };
  /* falsy or 'u-ai' resolves to the AI coach pseudo-user, so AI-guided items render safely everywhere */
  HV.staff = function (id) {
    if (!id || id === 'u-ai' || id === 'ai') return { id: 'u-ai', name: 'Your AI coach', role: 'ai', ai: true };
    return HV.store.users.find(u => u.id === id) || { id: id, name: 'Your AI coach', role: 'ai', ai: true };
  };

  /* ── care-circle chat: sequence numbers + read markers ────────────────
     Every message carries a global sequence number (HV.store.msgSeq);
     every person remembers the last seq they saw per thread
     (HV.store.reads[userId][clientId]). unread = messages newer than
     that, not counting your own — the one subtraction behind every
     unread badge in the app. minsAgo stays purely for display. */
  HV.pushMsg = function (clientId, msg) {
    const s = HV.store;
    s.msgSeq = (s.msgSeq || 0) + 1;
    msg.seq = s.msgSeq;
    if (msg.minsAgo == null) msg.minsAgo = 0;
    /* a real clock alongside the relative one. minsAgo is a SEEDED display
       value that never advances, so it cannot answer "how long since this
       client last said anything" — the silence rule needs a timestamp. */
    if (msg.ts == null) msg.ts = HV.now();
    if (!msg.id) msg.id = 'cm-' + s.msgSeq;
    (s.circles[clientId] = s.circles[clientId] || []).push(msg);
    HV.save();
    return msg;
  };
  HV.unread = function (clientId, userId) {
    const s = HV.store;
    const u = userId ? s.users.find(x => x.id === userId) : HV.me();
    if (!u) return 0;
    const isClient = u.role === 'client';
    const last = ((s.reads || {})[u.id] || {})[clientId] || 0;
    return (s.circles[clientId] || []).filter(m =>
      (m.seq || 0) > last &&
      /* your own messages never count; the client never counts the
         team-only lane it cannot see */
      /* The CLIENT counts a broadcast like any other message — an announcement
         lights the dot (TJ, 17 Aug). STAFF never do: one send to all clients
         would otherwise mark every room on the rail unread for every coach,
         seven false "someone needs you" signals for a message nobody owes a
         reply to. */
      !(isClient ? (m.fromId === 'client' || m.kind === 'teamonly')
                 : (m.fromId === u.id || m.kind === 'promo'))
    ).length;
  };
  HV.markRead = function (clientId) {
    const me = HV.me();
    if (!me) return;
    const s = HV.store;
    const top = (s.circles[clientId] || []).reduce((a, m) => Math.max(a, m.seq || 0), 0);
    ((s.reads = s.reads || {})[me.id] = s.reads[me.id] || {})[clientId] = top;
    HV.save();
  };

  /* ── announcements to clients ─────────────────────────────────────────
     The console's Community page can speak to many clients at once. A
     broadcast is composed there, resolved to a list of client ids, and then
     pushed into each client's own circle as an ordinary message of kind
     'promo' — so it inherits the whole thread machinery (seq, unread,
     history sheet) instead of inventing a parallel inbox.

     Two kinds, and the difference is a promise to the client:
       'promo'  — marketing. Offers, events, news. The client may silence it.
       'notice' — operational. Schedule, safety, something they must know.
                  Always delivers; the opt-out does not reach it.

     Opted-out clients are filtered at SEND time, never at render time. A
     message delivered-then-hidden would still take a seq and so light the
     client's unread dot for something they can never open — a bug with no
     clean fix. Filtering here also keeps the reach log honest: 'delivered'
     means the card is genuinely sitting in that thread. */

  /* default ON: a client record added later needs no migration */
  HV.announceOn = function (clientId) {
    return ((HV.store.announcePrefs || {})[clientId]) !== false;
  };

  /* one spec shape, four modes — a single mode (never combined filters)
     keeps the recipient count unambiguous and the composer a radio group */
  HV.audienceClients = function (spec) {
    /* only clients who can actually open the app. Two seeded records
       (c-meena, c-sureshp) carry userId:null — console-side clients with no
       login and no thread. Counting them would inflate every number the
       composer shows and every number the reach log keeps. */
    const all = (HV.store.clients || []).filter(c => c.userId);
    if (!spec) return [];
    if (spec.mode === 'all') return all.map(c => c.id);
    if (spec.mode === 'plan') {
      /* plansOnSale keeps an unlaunched plan from offering an empty bucket */
      const live = HV.plansOnSale();
      const want = (spec.plans || []).filter(p => live.indexOf(p) !== -1);
      return all.filter(c => want.indexOf(c.plan || 'poorna') !== -1).map(c => c.id);
    }
    if (spec.mode === 'coach') {
      const want = spec.staffIds || [];
      /* staffFor, not c.pod[k] directly — it resolves through podCover, so
         while Sneha is on leave her seat belongs to Divya and a broadcast
         addressed to Sneha follows the same answer every other screen gives.
         An AI-held or empty seat never matches a real staff id. */
      return all.filter(c => Object.keys(c.pod || {})
        .some(k => want.indexOf(HV.staffFor(c, k).id) !== -1)).map(c => c.id);
    }
    if (spec.mode === 'pick') {
      const want = spec.clientIds || [];
      return all.filter(c => want.indexOf(c.id) !== -1).map(c => c.id);
    }
    return [];
  };

  /* how many of an audience would actually receive this kind — the number
     the composer's confirm bar shows before anything is sent */
  HV.announceReach = function (spec, kind) {
    const ids = HV.audienceClients(spec);
    const muted = kind === 'promo' ? ids.filter(id => !HV.announceOn(id)).length : 0;
    return { targeted: ids.length, delivered: ids.length - muted, muted: muted };
  };

  /* every deep link the composer may offer, built live from the community
     content that actually exists — so a broadcast can never point at a
     gathering someone deleted last week. The composer is a <select> over
     this, never a free-text field. */
  HV.bcLinkTargets = function () {
    const tf = HV.store.tribeFeed || {};
    const out = [
      { route: '#/tribe',               label: 'Community hub' },
      { route: '#/tribe/events',        label: 'All gatherings' },
      { route: '#/tribe/challenges',    label: 'All challenges' },
      { route: '#/tribe/quiz',          label: 'Health Games' },
      { route: '#/tribe-classic',       label: 'Haalving Zone' },
    ];
    (tf.events || []).forEach(e => out.push({ route: '#/tribe/event/' + e.id, label: 'Gathering · ' + e.title }));
    (tf.challenges || []).forEach(h => out.push({ route: '#/tribe/challenge/' + h.id, label: 'Challenge · ' + h.title }));
    /* zones are deliberately NOT offered. renderZonePage bounces only on a
       zone that doesn't exist, never on a non-member — so broadcasting a
       zone link would open five people's private canvas to whoever received
       it. Gatherings and challenges are public by design; a zone is not. */
    return out;
  };

  /* the core loop. `b` is the composed record minus its `sent` stamp. */
  HV.sendBroadcast = function (b) {
    const s = HV.store;
    const ids = HV.audienceClients(b.audience);
    const reached = [];
    let muted = 0;
    ids.forEach(id => {
      if (b.kind === 'promo' && !HV.announceOn(id)) { muted++; return; }
      HV.pushMsg(id, {
        /* the REAL sender, never a literal 'haalving': HV.staff() falls back
           to the AI pseudo-user for any id it doesn't know, so a house-account
           id would sign every console surface "AI Coach" — a lie, and a breach
           of the rule that a Poorna client never hears the AI. The store keeps
           honest attribution; the CLIENT renderer prints HAALVING regardless,
           because an offer is the organisation speaking, not a person. */
        fromId: b.byId,
        kind: 'promo',
        bcId: b.id,
        notice: b.kind === 'notice',
        title: b.title,
        text: b.text,
        img: b.img || '',
        media: b.media || null,
        link: b.link || null,
      });
      reached.push(id);
    });
    /* stamped, never recomputed: a client flipping their switch next week
       must not rewrite what this send actually did */
    b.sent = { targeted: ids.length, delivered: reached.length, muted: muted,
               clientIds: reached };
    (s.broadcasts = s.broadcasts || []).unshift(b);
    HV.save();
    return b.sent;
  };

  /* ── the approvals engine ─────────────────────────────────────────────
     One chart system for every sign-off in the SOP. An approval waits at
     a stage of its type's chain (HV.store.chains[type], a list of role
     keys); acting on it writes one history line and moves the stage.
     The last signature publishes — and, per the SOP, the published
     artifact drops into the client's Care Circle like a WhatsApp
     attachment. Statuses: draft → submitted (stage N) → published
     (→ confirmed, calendars only, set by the client). */
  HV.approvals = {
    chain(ap) { return (HV.store.chains && HV.store.chains[ap.type]) || []; },
    /* the role whose signature an item is waiting on; null when idle */
    stageRole(ap) {
      if (ap.status !== 'submitted') return null;
      const step = this.chain(ap)[ap.stage || 0];
      return step ? step.role : null;
    },
    canAct(ap) {
      const me = HV.me();
      return !!me && this.stageRole(ap) === me.role;
    },
    log(ap, act, note) {
      const me = HV.me();
      (ap.history = ap.history || []).push({ act, byId: me ? me.id : 'u-ai', note: note || '', minsAgo: 0 });
    },
    submit(ap, note) {
      ap.status = 'submitted'; ap.stage = 0; delete ap.returnReason;
      this.log(ap, 'submitted', note);
      HV.save();
    },
    approve(ap, note) {
      this.log(ap, 'approved', note);
      ap.stage = (ap.stage || 0) + 1;
      if (ap.stage >= this.chain(ap).length) this.publish(ap);
      HV.save();
    },
    sendBack(ap, reason) {
      ap.status = 'draft'; ap.returnReason = reason;
      this.log(ap, 'returned', reason);
      HV.save();
    },
    publish(ap) {
      ap.status = 'published';
      this.log(ap, 'published');
      /* type side effects — the delivery step of the SOP */
      if (ap.type === 'level' && ap.clientId && ap.payload && ap.payload.upgrades) {
        const c = HV.client(ap.clientId);
        if (c) Object.keys(ap.payload.upgrades).forEach(k => { c.levels[k] = ap.payload.upgrades[k]; });
      }
      if (ap.type === 'calendar' && ap.clientId && !HV.store.proposedCalendars[ap.clientId]) {
        const c = HV.client(ap.clientId);
        HV.store.proposedCalendars[ap.clientId] = { cycle: c ? (c.cycle || 0) + 1 : null, note: ap.title, confirmed: false };
      }
      if (ap.clientId) {
        const text = (ap.payload && ap.payload.message) || (ap.title + ' — approved and published to your plan.');
        HV.pushMsg(ap.clientId, { fromId: ap.ownerId, kind: ap.type === 'level' ? 'card' : 'doc', text: text });
      }
      HV.save();
    },
    /* items waiting on this person's signature */
    queueFor(userId) {
      const u = HV.store.users.find(x => x.id === userId);
      if (!u) return [];
      return (HV.store.approvals || []).filter(ap => ap.status === 'submitted' && this.stageRole(ap) === u.role);
    },
  };

  HV.login = function (userId) {
    HV.store.session = userId;
    HV.save();
    const r = HV.roleMeta();
    HV.go(r ? r.home : '#/login');
  };
  HV.logout = function () {
    HV.store.session = null;
    HV.save();
    HV.go('#/login');
  };

  /* ---------------- router ---------------- */
  const views = {};
  HV.registerView = function (route, def) { views[route] = def; };

  /* ---------------- board registry ----------------
     Four host views (Care Circles, Schedule, Queues, Reports) show panels whose
     data belongs to other modules. The owner registers its panel once; the host
     composes it. A board renders its BODY only — the host owns the page header
     and the tab bar, so a board never draws an h1. Registration order does not
     matter: hosts read the registry at render time. */
  HV.boards = {};
  HV.registerBoard = function (key, def) { HV.boards[key] = def; };

  /* the boards from `keys` this role may see, in the order asked for.
     A board may declare `perm: 'approve'` instead of a roles array, so it
     tracks a permission rather than a fixed role list. */
  HV.boardsFor = function (keys) {
    const me = HV.me();
    if (!me) return [];
    return keys
      .map(k => (HV.boards[k] ? Object.assign({ key: k }, HV.boards[k]) : null))
      .filter(b => {
        if (!b) return false;
        const ok = b.perm ? HV.can(b.perm) : (b.roles || []).includes(me.role);
        return ok;
      });
  };

  HV.go = function (hash) {
    if (location.hash === hash) render(); else location.hash = hash;
  };
  HV.refresh = function () { render(); };

  function parseHash() {
    const h = (location.hash || '#/login').slice(2);       // e.g. "client/c-rajesh"
    const parts = h.split('/').filter(Boolean);
    return { name: parts[0] || 'login', params: parts.slice(1) };
  }

  /* ---------------- retired routes ----------------
     Old links live in docs, in memory and in the browser's history, so every
     route the nine-item menu replaced still resolves. location.replace, not
     assignment, so Back doesn't bounce off the alias and land right back on it. */
  const ALIASES = {
    digest:   '#/home',
    worklist: '#/queues/work',
    meals:    '#/queues/meals',
    medical:  '#/queues/medical',
    admin:    '#/config',
    /* #/room/<id> was a brief experiment; Care Circles owns #/circles/<id> */
    room:     '#/circles',
  };
  const SUB_ALIASES = {
    'worklist/deviations': '#/queues/deviations',
    'worklist/live':       '#/queues/live',
    'worklist/calories':   '#/reports/calories',
    'worklist/incentives': '#/reports/incentives',
  };
  function resolveAlias(name, params) {
    const full = name + (params.length ? '/' + params.join('/') : '');
    if (SUB_ALIASES[full]) return SUB_ALIASES[full];
    if (name === 'room') return params[0] ? '#/circles/' + params[0] : '#/circles';
    if (!params.length && ALIASES[name]) return ALIASES[name];
    return null;
  }

  /* ---------------- route aliases (8-item nav rework) ----------------
     A second, earlier alias pass: it runs on the raw hash, before parseHash
     splits it into {name, params}, so it can rewrite routes the nav rework
     renamed outright (Care Circles into Clients, Approvals/Meals into
     Queues, Library into Catalog, Onboarding's pipeline into Clients). A
     real redirect (location.replace), so the address bar updates and Back
     doesn't bounce off the alias and land right back on it. */
  const ROUTE_ALIASES = [
    [/^#\/circles\/(.+)$/,  (m) => '#/clients/' + m[1] + '/circle'],
    [/^#\/circles$/,        ()  => '#/clients'],
    [/^#\/approvals$/,      ()  => '#/queues/approvals'],
    [/^#\/pipeline$/,       ()  => '#/clients'],
    [/^#\/library(\/.+)?$/, (m) => '#/catalog' + (m[1] || '')],
    [/^#\/meals$/,          ()  => '#/queues/meals'],
    /* Journey lost its bottom-bar seat and lives inside Trackers now
       (TJ, 9 Aug) — old links, the demo runsheets and muscle memory all
       still say #/journey, so the route stays alive as a redirect */
    [/^#\/journey$/,        ()  => '#/trackers/journey'],
    /* Tribe became Community (TJ, 17 Aug) — the console page, its route and
       its sidebar seat all took the client's word for the same place. Old
       demo links and runsheets still say #/tribe-admin, sections included */
    [/^#\/tribe-admin(\/.+)?$/, (m) => '#/community' + (m[1] || '')],
  ];
  function unalias(hash) {
    for (const [re, fn] of ROUTE_ALIASES) { const m = hash.match(re); if (m) return fn(m); }
    return hash;
  }

  /* ---------------- view access gate ----------------
     view name -> owning sidebar item; console access = nav membership, so
     runtime-created roles gain pages by ticking a nav box in People & Access */
  HV.VIEW_NAV = {
    home:'home', reports:'home',
    clients:'clients', client:'clients', review:'clients',
    queues:'queues', approvals:'queues', meals:'queues', medical:'queues', builder:'queues',
    schedule:'schedule', catalog:'catalog', library:'catalog',
    community:'community', people:'people', leave:'leave', config:'config',
  };
  HV.allowedView = function (name, def) {
    const me = HV.me(); if (!me) return false;
    if (def.roles) return def.roles.includes(me.role);   // client-shell views keep explicit lists
    const meta = HV.roleDef(me.role);
    const nav = HV.VIEW_NAV[name];
    return !!(meta && meta.shell === 'console' && nav && (meta.nav || []).includes(nav));
  };

  /* The browser chrome is part of the screen it frames — Android paints the
     status bar and toolbar in theme-color, so a fixed brand teal put a hard
     green strip over the welcome film. Three chromes, one per register:
     'scene' — the film's own top-band tone (sampled from media/welcome.jpg;
               keep in sync with the static meta in index.html), so the bar
               reads as tinted glass over the palms, not a foreign strip;
     'dark'  — near-black for onboarding, whose backdrop is heavily dimmed;
     default — brand teal for the app proper. */
  const chromeMeta = document.querySelector('meta[name="theme-color"]');
  function paintChrome(mode) {
    if (!chromeMeta) return;
    chromeMeta.setAttribute('content',
      mode === 'scene' ? '#4F492E' : mode === 'dark' ? '#0D1211' : '#0B5350');
  }

  function render() {
    /* rewrite renamed routes before the hash is parsed, so a deep link or a
       Back-button press lands on the new route rather than a dead one */
    const target = unalias(location.hash);
    if (target !== location.hash) { location.replace(location.pathname + location.search + target); return; }

    const app = document.getElementById('app');
    const { name, params } = parseHash();
    const me = HV.me();
    /* a fresh paint reads a fresh calendar — a memo that outlived the change
       that invalidated it is the classic "my edit didn't do anything" */
    HV.clearCalCache();

    /* standalone views (onboarding) render without a shell or a session */
    const solo = views[name];
    if (solo && solo.standalone) {
      paintChrome('dark');
      app.innerHTML = '';
      solo.render(app, params);
      window.scrollTo(0, 0);
      return;
    }

    if (!me || name === 'login') { paintChrome('scene'); renderLogin(app); return; }
    paintChrome();

    /* after the session guard — resolveAlias reads HV.client */
    const alias = resolveAlias(name, params);
    if (alias) { location.replace(alias); return; }

    const def = views[name];
    const role = HV.roleDef(me.role) || HV.ROLES.client;
    if (!def) { app.innerHTML = HV.ui.empty('leaf', 'Screen “' + name + '” not found.'); return; }

    /* RBAC gate: view declares roles, or (console views without one) nav membership */
    if (!HV.allowedView(name, def)) {
      app.innerHTML = '';
      const shellEl = role.shell === 'client' ? clientShell(app, name) : consoleShell(app, name);
      shellEl.innerHTML = '<div class="empty"><span class="big">' + HV.ui.icon('lock') + '</span>Not available for your role (' + HV.esc(role.title) + ').<br><span class="audit">This access attempt was logged.</span></div>';
      return;
    }

    app.innerHTML = '';
    const shellEl = role.shell === 'client' ? clientShell(app, name) : consoleShell(app, name);
    def.render(shellEl, params);
    window.scrollTo(0, 0);
  }

  /* ---------------- login screen ---------------- */
  /* The arrival: a Kerala backwater at sunrise, full-bleed, the way Fittr
     opens on a lived morning rather than a form. The persona picker — a demo
     affordance, not the product — waits one tap away in a sheet. */
  /* welcome.mp4 is one film in four cuts — yoga jetty, the table, the climb,
     the still water — so the headline names the pillar you are looking at
     instead of a single fixed line. Times are the cut points in the file;
     re-cut the film and these move with it. */
  const LOGIN_CUES = [
    { t: 0,      word: 'Haalving Yoga' },
    { t: 5.5,    word: 'Haalving Nutrition' },
    { t: 8.375,  word: 'Haalving Fitness' },
    { t: 11.333, word: 'Haalving Mind Wellness' },
  ];

  function renderLogin(app) {
    /* reduced motion: the still IS the arrival — don't fetch 2.1MB of film
       a viewer asked never to see moving */
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    app.innerHTML =
      '<div class="login-hero">' +
        '<div class="lh-media" aria-hidden="true">' +
          (still
            ? '<img src="media/welcome.jpg" alt="">'
            : '<video autoplay muted loop playsinline preload="auto" poster="media/welcome.jpg" src="media/welcome.mp4"></video>') +
        '</div>' +
        '<div class="lh-scrim" aria-hidden="true"></div>' +
        '<div class="lh-top">' +
          '<h1 class="lh-head"><span class="lh-eyebrow">Welcome to HAALVING CULTURE: Rooted in Balance</span><b class="lh-word" id="lh-word">' + LOGIN_CUES[0].word + '</b></h1>' +
          (still ? '' : '<button class="lh-pause" id="lh-pause" aria-pressed="false" aria-label="Pause background video">' + ICONS.pause + '</button>') +
        '</div>' +
        '<div class="lh-bottom">' +
          '<div class="wordmark">HAALVING</div>' +
          '<p class="lh-tag">Habits of Healthy living.</p>' +
          '<button class="btn block lh-begin" id="go-onboard">Begin your journey</button>' +
          '<button class="btn block lh-alt" id="lh-personas">Explore the demo — choose a persona</button>' +
          '<p class="lh-note">A persona for every seat · each role sees only what its access allows</p>' +
        '</div>' +
      '</div>';
    const video = app.querySelector('.lh-media video');
    const pauseBtn = app.querySelector('#lh-pause');
    if (video) {
      /* timeupdate fires ~4×/s, so a swap can land a beat after the cut — the
         rise-in reads as a cross-fade rather than a miss. The word is only
         touched when the cue actually changes, or the animation would restart
         on every tick. */
      const wordEl = app.querySelector('#lh-word');
      let cue = -1;
      const paintWord = () => {
        let i = 0;
        for (let k = LOGIN_CUES.length - 1; k > 0; k--) {
          if (video.currentTime >= LOGIN_CUES[k].t) { i = k; break; }
        }
        if (i === cue) return;
        cue = i;
        wordEl.textContent = LOGIN_CUES[i].word;
        wordEl.classList.remove('in');
        void wordEl.offsetWidth;                  /* reflow, or the animation never replays */
        wordEl.classList.add('in');
      };
      video.addEventListener('timeupdate', paintWord);
      const setPaused = paused => {
        pauseBtn.setAttribute('aria-pressed', String(paused));
        pauseBtn.setAttribute('aria-label', paused ? 'Play background video' : 'Pause background video');
        pauseBtn.innerHTML = paused ? ICONS.play : ICONS.pause;
      };
      /* a failed video leaves the still morning, not a black wall — the poster
         lives on the <video>, so removing the element would take it too */
      video.addEventListener('error', () => {
        const img = document.createElement('img');
        img.src = 'media/welcome.jpg'; img.alt = '';
        video.replaceWith(img);
        pauseBtn.remove();
      });
      pauseBtn.addEventListener('click', () => {
        const pausing = !video.paused;
        if (pausing) video.pause(); else video.play();
        setPaused(pausing);
      });
    }
    app.querySelector('#go-onboard').addEventListener('click', () => HV.go('#/onboard'));
    app.querySelector('#lh-personas').addEventListener('click', personaSheet);
  }

  function personaSheet() {
    const staff = HV.store.users.filter(u => u.role !== 'client');
    const clients = HV.store.users.filter(u => u.role === 'client');
    const row = (u, sub) =>
      '<button class="persona" data-u="' + u.id + '">' + HV.ui.avatar(u.name) +
      '<span><b>' + HV.esc(u.name) + '</b><small>' + HV.esc(sub) + '</small></span></button>';
    HV.sheet(
      '<div class="h2">Choose a persona</div>' +
      '<p class="sub" style="margin:calc(var(--s2)*-1) 0 0">Demo build — every role sees only what its access allows.</p>' +
      '<h3 class="persona-h">Client app</h3>' +
      '<div class="login-grid">' +
        clients.map(u => row(u, u.subtitle || 'Client · HAALVING Complete')).join('') +
      '</div>' +
      '<h3 class="persona-h">Team console</h3>' +
      '<div class="login-grid">' +
        staff.map(u => row(u, (HV.roleDef(u.role) || {}).title || u.role)).join('') +
      '</div>' +
      '<p class="sub">Demo data resets any time: <button style="color:var(--brand);font-weight:600" id="reset-demo">reset demo</button></p>',
      sheet => {
        sheet.setAttribute('aria-label', 'Choose a persona');
        sheet.addEventListener('keydown', e => { if (e.key === 'Escape') HV.closeSheet(); });
        sheet.querySelectorAll('.persona[data-u]').forEach(b =>
          b.addEventListener('click', () => { HV.closeSheet(); HV.login(b.dataset.u); }));
        /* a modal receives focus, or the keyboard is still on the page beneath */
        const first = sheet.querySelector('.persona');
        if (first) first.focus();
        sheet.querySelector('#reset-demo').addEventListener('click', HV.reset);
      });
  }

  /* ---------------- client shell ---------------- */
  /* Six tabs, one time horizon each: Plan = the whole 11-day cycle, Today =
     do now, My Circle = talk, Trackers = log & sync, Journey = how am I doing,
     Community = the community space (TJ, 3 Aug; renamed from My Tribe 8 Aug —
     the route and view keys stay 'tribe', only the label moved). Profile
     lives on the top-right avatar — it isn't a daily destination. Community
     renders like every other seat on purpose: raised/animated treatments
     collided with the chat composer's mic button living in the same corner. */
  /* Five seats since 9 Aug (TJ): Journey's seat retired — the page lives
     inside Trackers (#/trackers/journey; the old #/journey route redirects
     via ROUTE_ALIASES). `core: true` marks the centre seat — My Circle is
     the most-used door and reads half a step brighter at rest. */
  const CLIENT_TABS = [
    { route: '#/plan',     name: 'plan',     label: 'Plan',     icon: 'cal' },
    { route: '#/today',    name: 'today',    label: 'Today',    icon: 'sun' },
    { route: '#/coach',    name: 'coach',    label: 'My Circle', icon: 'circle', dot: true, core: true },
    { route: '#/trackers', name: 'trackers', label: 'Trackers', icon: 'pulse' },
    { route: '#/tribe',    name: 'tribe',    label: 'Community', icon: 'tribe' },
  ];

  function clientShell(app, active) {
    const wrap = document.createElement('div');
    wrap.className = 'shell-client';
    const me = HV.me();
    /* sub-routes light their parent tab: meal flows belong to Today, the
       per-pillar chart detail belongs to Plan, and the Haalving Zone (the
       retained feed page, view key 'tribe-classic') still lights Community */
    const tabOn = t => active === t.name
      || (t.name === 'today' && ['meal', 'meal-detail', 'coaches'].includes(active))
      || (t.name === 'plan' && ['plan-detail', 'plan-full'].includes(active))
      || (t.name === 'tribe' && active === 'tribe-classic');
    const myC = HV.myClient();
    const unread = myC ? HV.unread(myC.id) : 0;
    /* the header's second seat: the coach door for Svayam clients, and the
       membership marque for Poorna — the tier IS the badge (TJ, 30 Jul) */
    const poorna = myC && myC.plan === 'poorna';
    const coachBtn = !myC ? '' : poorna
      ? '<button class="hdr-poorna" id="c-coach" aria-label="Poorna membership — your coaches">' + ICONS.sparkle + 'Poorna</button>'
      : '<button class="hdr-coach" id="c-coach">Get a Coach</button>';
    /* the coin — HAALVING's gold voice: double-rim, stroke-drawn H. It sits
       beside the profile seat on every client page; tapping opens the ledger. */
    const COIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/>' +
      '<circle cx="12" cy="12" r="6.4"/><path d="M9.7 8.8v6.4M14.3 8.8v6.4M9.7 12h4.6"/></svg>';
    const coins = myC ? (myC.coins || 0) : 0;
    const coinBtn = !myC ? '' :
      '<button class="hdr-coins" id="c-coins" aria-label="HAALVING coins — ' + coins + '">' +
      COIN + '<span class="num">' + coins.toLocaleString('en-IN') + '</span></button>';
    wrap.innerHTML =
      '<header class="c-head"><span class="wordmark">HAALVING</span>' + coachBtn + coinBtn +
      '<button id="c-profile" aria-label="Profile and settings">' + HV.ui.avatar(me.name, 'sm quad') + '</button></header>' +
      '<main class="c-body" id="view-root"></main>' +
      '<nav class="tabbar" aria-label="Main">' +
        CLIENT_TABS.map(t =>
          '<button data-r="' + t.route + '" class="' + (tabOn(t) ? 'on' : '') + (t.core ? ' core' : '') + '"' + (tabOn(t) ? ' aria-current="page"' : '') + ' aria-label="' + t.label + '">' +
          (t.dot && unread ? '<span class="dot"></span>' : '') +
          HV.ui.icon(t.icon) + t.label + '</button>').join('') +
      '</nav>';
    app.appendChild(wrap);
    wrap.querySelectorAll('.tabbar button').forEach(b => b.addEventListener('click', () => HV.go(b.dataset.r)));
    wrap.querySelector('#c-profile').addEventListener('click', () => HV.go('#/profile'));
    const coach = wrap.querySelector('#c-coach');
    /* two doors behind one seat: Svayam's button shops the marketplace;
       the Poorna marque opens the membership — this client already HAS
       every coach, so it presents their circle instead of a shop */
    if (coach) coach.addEventListener('click', () => poorna ? poornaSheet(myC) : HV.go('#/coaches'));
    const coinEl = wrap.querySelector('#c-coins');
    if (coinEl) coinEl.addEventListener('click', () => coinSheet(myC));
    /* the request layer: whatever is waiting on this client hovers as a deck
       on arrival, then parks as a pulsing label under the profile seat */
    if (myC) mountRequests(wrap, myC);
    return wrap.querySelector('#view-root');
  }

  /* the coin ledger — balance in serif, how coins arrive, what they buy.
     Redeeming asks once, then spends; the header count follows on re-render. */
  function coinSheet(c) {
    const REDEEM = [
      { name: 'Extra 1:1 coach session', cost: 500 },
      { name: 'Priority slot booking',   cost: 300 },
      { name: 'HAALVING tee',            cost: 800 },
    ];
    const EARNS = [
      ['+40', 'Seven-day streak kept'],
      ['+15', 'Meal photo logged before 9 am'],
      ['+60', 'Community gathering attended'],
    ];
    HV.sheet(
      '<div class="kicker">HAALVING COINS</div>' +
      '<div class="h1">Your coin ledger</div>' +
      '<div class="coinbal"><b class="num">' + (c.coins || 0).toLocaleString('en-IN') + '</b><small>coins to redeem</small></div>' +
      '<div class="sec-title">How they arrive</div>' +
      '<div class="list">' + EARNS.map(e =>
        '<div class="trow"><span class="coinamt num">' + e[0] + '</span><div class="grow"><b>' + e[1] + '</b></div></div>').join('') + '</div>' +
      '<div class="sec-title">Redeem</div>' +
      '<div class="list">' + REDEEM.map((r, i) =>
        '<button class="trow" data-redeem="' + i + '"' + ((c.coins || 0) < r.cost ? ' disabled' : '') + '>' +
        '<div class="grow"><b>' + r.name + '</b></div><span class="pill num">' + r.cost + '</span></button>').join('') + '</div>' +
      '<div class="audit">Coins are earned by living the programme — never bought.</div>',
      sh => {
        sh.querySelectorAll('[data-redeem]').forEach(b => b.addEventListener('click', () => {
          const r = REDEEM[+b.dataset.redeem];
          if ((c.coins || 0) < r.cost) return;
          HV.sheet(
            '<div class="h1">Redeem ' + HV.esc(r.name) + '?</div>' +
            '<p class="sub"><b class="num">' + r.cost + '</b> coins will be set aside. Your coach confirms the booking in your Circle.</p>' +
            '<button class="btn block" id="rd-go">Redeem</button>',
            s2 => s2.querySelector('#rd-go').addEventListener('click', () => {
              c.coins = (c.coins || 0) - r.cost;
              HV.save(); HV.closeSheet(); HV.refresh();
              HV.toast(r.name + ' redeemed — your coach will confirm.');
            }));
        }));
      }, 'tall');
  }

  /* the Poorna membership sheet: the pillar coaches around the client,
     the Culture Coach coordinating, the doctor above them all */
  function poornaSheet(c) {
    const seats = ['dietitian', 'fitness', 'yoga', 'mind', 'admin', 'doctor'];
    const rows = seats.filter(k => (c.pod || {})[k]).map(k => {
      const u = HV.staff(c.pod[k]);
      const role = HV.ROLES[u.role];
      return '<div class="trow">' + HV.ui.avatar(u.name, 'sm') +
        '<span class="grow"><b>' + HV.esc(u.name) + '</b><small>' + HV.esc(role ? role.title : 'Care team') + '</small></span>' +
      '</div>';
    }).join('');
    HV.sheet(
      '<div class="h1">' + HV.esc(c.tier || 'HAALVING Poorna') + '</div>' +
      '<div class="sub">' + (c.observation
        ? 'Your team is being assembled around you — every one of them reads your circle.'
        : 'A dedicated team of experts — every one of them reads your circle.') + '</div>' +
      '<div class="card">' + rows + '</div>' +
      '<button class="btn block" id="po-circle">Open My Circle</button>' +
      '<button class="btn ghost block" id="po-close" style="margin-top:var(--s2)">Close</button>',
      sh => {
        sh.querySelector('#po-circle').addEventListener('click', () => { HV.closeSheet(); HV.go('#/coach'); });
        sh.querySelector('#po-close').addEventListener('click', HV.closeSheet);
      }
    );
  }

  /* ---------------- the request layer ----------------
     A "request" is a question the product owes an answer to — a session to
     confirm, an automation waiting on a number. Requests live on no page:
     on the first screen of a visit the pending pile hovers mid-page as a
     deck of cards (the onboarding story deck's grammar — stack-reveal,
     peel, cards nested behind, no scrim between them). Answering settles a
     card; closing the deck parks the pile as a pulsing label under the
     profile seat; Ignore retires a request for good. */
  let reqShownThisLoad = false;   /* the deck hovers once per app open */

  HV.requests = function (c) {
    if (!c) return [];
    const ig = HV.store.reqIgnored || {};
    const out = [];
    const sameDay = ts => new Date(ts).toDateString() === new Date().toDateString();
    const mins = (() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); })();
    const leadWord = start => {
      const lead = start - mins;
      return lead <= 0 ? 'now' : lead > 90 ? 'in ~' + Math.round(lead / 60) + ' h' : 'in ~' + lead + ' min';
    };
    ((HV.store.clientReminders || {})[c.id] || [])
      .filter(r => sameDay(r.ts) && !r.confirmed && !r.cancelled && !r.rebooked)
      .forEach(r => {
        const id = 'rem.' + r.taskId;
        if (ig[id]) return;
        out.push({ id: id, kind: 'session', icon: 'bell', kicker: 'SESSION',
          title: (r.title || 'Session') + ' at ' + HV.fmtTime(r.start),
          html: HV.esc(r.title || 'Session') + ' at <span class="num">' + HV.esc(HV.fmtTime(r.start)) + '</span>',
          sub: 'Starts ' + leadWord(r.start) + '. Confirm the slot, or tell the team it doesn’t work.',
          rem: r });
      });
    HV.autoChecks(c).forEach(a => {
      const id = 'auto.' + a.key + '.' + c.id + '.' + (c.cycle || 0);
      if (ig[id]) return;
      out.push({ id: id, kind: 'auto', icon: 'scale', kicker: 'AUTOMATION',
        title: a.title, html: HV.esc(a.title), sub: a.body, auto: a });
    });
    /* ── sessions that finished and were never rated ────────────────────
       The optional half of the post-session loop. Ended is read from the
       CLOCK, not from the derived calendar: calendarFor calls every day
       before today 'done', so deriving from status would hand a returning
       client a rate-card for their whole past cycle.

       The card id carries the real date, because Ignore is forever and rd 0
       comes round again every morning — an rd-keyed id would let one skip
       retire every future session of the same series. */
    if (HV.autoOn(c.id, 'rating') && !c.observation) {
      const today = HV.todayISO();
      (HV.store.tasks || []).forEach(t => {
        if (t.kind !== 'session' || t.clientId !== c.id) return;
        if (t.pillar && !HV.humanPillar(c, t.pillar)) return;   /* no human to rate */
        const occ = HV.occursOn(t, 0);
        if (!HV.sessionEnded(occ, mins)) return;
        const id = 'rate.' + t.id + '.' + today;
        if (ig[id]) return;
        /* a session the client cancelled is never asked about; one they
           simply never marked still is — that is the common case */
        const st = HV.sessionStatus(c, c.day, t.pillar);
        if (st === 'cancelled') return;
        const sk = t.pillar === 'wellness' ? 'mind' : t.pillar;
        /* a rating that names its occurrence answers only that one; an older
           record (rated from My Plan, which knows only the pillar and the day)
           still answers for the whole pillar-day, which is all it ever meant */
        const rated = (c.sessionFeedback || []).some(f => f.taskId
          ? f.taskId === t.id
          : (f.cy === c.cycle && f.day === c.day && (f.key === t.pillar || f.key === sk)));
        if (rated) return;
        const coach = HV.staff((occ.assignees || [])[0]);
        out.push({ id: id, kind: 'rate', icon: 'star', kicker: 'SESSION',
          title: 'How was ' + occ.title + '?',
          html: 'How was <b>' + HV.esc(occ.title) + '</b>?',
          sub: 'It finished at ' + HV.fmtTime(occ.start + occ.dur) + '. ' +
            (coach.ai ? 'Stars and a line, if you feel like it.'
                      : String(coach.name).split(' ')[0] + ' would like to know how it went — stars and a line, if you feel like it.'),
          rate: { taskId: t.id, dateISO: today, key: t.pillar, day: c.day,
                  label: occ.title, staffId: (occ.assignees || [])[0] || null } });
      });
    }
    return out;
  };

  /* the two settle sheets, lifted out of Today so any page can host them.
     Can't-make-it: cancel outright (calendar item → 'cancelled', the coach
     is told) or request a new time (circle message + ops worklist + notice —
     the same route a Plan change-request travels). */
  function reqCantSheet(c, r) {
    const task = (HV.store.tasks || []).find(t => t.id === r.taskId) || null;
    const pillar = task ? task.pillar : null;
    HV.sheet(
      '<div class="h1">Can’t make it</div>' +
      '<p class="sub" style="margin:0">' + HV.esc(r.title || 'Session') + ' at <span class="num">' + HV.esc(HV.fmtTime(r.start)) + '</span>. Cancel it outright, or tell us a time that works and the team will move it.</p>' +
      '<button class="btn block" data-cx-cancel style="margin-top:var(--s4)">Cancel this session</button>' +
      '<div class="sec-title">Or request a new time</div>' +
      '<textarea class="input" data-cx-txt aria-label="A time that works better" placeholder="e.g. Could we do 7:30 pm instead?"></textarea>' +
      '<button class="btn ghost block" data-cx-req disabled>Request new time</button>',
      sh => {
        sh.querySelector('[data-cx-cancel]').addEventListener('click', () => {
          /* today's matching calendar item — same pillar, still open */
          const today = HV.calendarFor(c).find(d => d.today) || null;
          const items = today ? (today.items || []) : [];
          const it = items.find(x => (!pillar || x.pillar === pillar) &&
            x.status !== 'done' && x.status !== 'cancelled') || null;
          if (it) HV.markSession(c, today.day, it.pillar, 'cancelled');
          /* session ledger speaks staff-role keys: wellness → mind */
          const sk = pillar === 'wellness' ? 'mind' : pillar;
          if (sk && c.sessions && c.sessions[sk])
            c.sessions[sk].cancelled = (c.sessions[sk].cancelled || 0) + 1;
          r.cancelled = true;
          HV.save();
          const coachId = (task && task.assignees && task.assignees[0]) || (it && it.staffId) || null;
          if (coachId) HV.notice(coachId, 'task',
            c.name + ' cancelled ' + (r.title || 'the session') + ' at ' + HV.fmtTime(r.start) + '.', c.id);
          HV.closeSheet();
          HV.toast('Cancelled — your coach has been told.');
          HV.refresh();
        });
        const ta = sh.querySelector('[data-cx-txt]');
        const req = sh.querySelector('[data-cx-req]');
        ta.addEventListener('input', () => { req.disabled = !ta.value.trim(); });
        req.addEventListener('click', () => {
          const txt = ta.value.trim();
          if (!txt) return;
          HV.pushMsg(c.id, { fromId: 'client', kind: 'text',
            text: 'New time request for ' + (r.title || 'the session') + ': ' + txt });
          const owner = (c.pod && c.pod.admin) || 'u-anita';
          HV.store.worklist.push({
            id: 'w-rt-' + Date.now(), text: 'Session time change — ' + c.name,
            owner: owner, due: 'today', pill: 'warn', status: 'open',
          });
          r.rebooked = true;
          HV.save();
          HV.notice(owner, 'task',
            c.name + ' asked to move ' + (r.title || 'a session') + ': “' + txt + '”', c.id);
          HV.closeSheet();
          HV.toast('Sent — the team will come back with a new slot.');
          HV.refresh();
        });
      });
  }

  /* the weigh-in sheet — one number in, four writes out: the weight log, the
     once-guard, the auto-stamped circle line, and the request's own
     retirement (it is recomputed from the log, so it simply stops pending) */
  function reqWeighSheet(c) {
    HV.sheet(
      '<div class="h1">Cycle weigh-in</div>' +
      '<p class="sub" style="margin:0">Same scale, same time of day — first thing in the morning reads truest.</p>' +
      '<label class="sub" for="rq-kg" style="display:block;margin-top:var(--s4)">Today’s weight (kg)</label>' +
      '<input class="input" id="rq-kg" type="number" inputmode="decimal" step="0.1" min="20" max="300" placeholder="e.g. 81.4">' +
      '<button class="btn block" data-kg-save disabled style="margin-top:var(--s3)">Record weigh-in</button>',
      sh => {
        const inp = sh.querySelector('#rq-kg');
        const btn = sh.querySelector('[data-kg-save]');
        const valid = () => { const v = parseFloat(inp.value); return isFinite(v) && v >= 20 && v <= 300; };
        inp.addEventListener('input', () => { btn.disabled = !valid(); });
        btn.addEventListener('click', () => {
          if (!valid()) return;
          const kg = Math.round(parseFloat(inp.value) * 10) / 10;
          c.weightLog = c.weightLog || [];
          c.weightLog.push({ cy: c.cycle, day: c.day, kg: kg, ts: HV.now() });
          HV.store.autoLog = HV.store.autoLog || {};
          HV.store.autoLog['weighin.' + c.id + '.' + c.cycle] = HV.now();
          HV.save();
          HV.pushMsg(c.id, { fromId: 'client', kind: 'auto',
            text: 'Automated · Day-' + c.day + ' weigh-in recorded: ' + kg.toFixed(1) + ' kg' });
          HV.closeSheet();
          HV.toast('Recorded — ' + kg.toFixed(1) + ' kg. The ' + HV.copy.reviewWord() + ' review sees it.');
          HV.refresh();
        });
      });
  }
  /* the quick-add sheet (Trackers) needs the same sheet the request deck
     opens — one weight writer, two doors (TJ, 9 Aug) */
  HV.weighSheet = reqWeighSheet;

  /* ── the post-session ask ────────────────────────────────────────────
     Five stars and a line, both optional, always skippable — the client's
     half of the loop whose staff counterpart is the session report. It was
     written inside My Plan and could only be reached by tapping a session
     done; lifted here it also opens from the request deck and from leaving
     the session room, which is the moment it is actually about.

     opts: { label, staffId, key (PILLAR vocabulary), day, taskId?, dateISO?,
             celebrateDue? }. celebrateDue keeps My Plan's ordering trick: a
     due day-complete celebration waits behind this sheet, because
     HV.celebrate closes whatever sheet is open and would eat the ask. */
  HV.rateSheet = function (client, opts) {
    opts = opts || {};
    const day = opts.day != null ? opts.day : client.day;
    const coach = HV.staff(opts.staffId);
    let chosen = 0;
    const finish = () => {
      if (opts.celebrateDue) {
        HV.store.dayCelebrated = HV.store.dayCelebrated || {};
        HV.store.dayCelebrated[client.id] = client.cycle + '-' + client.day;
        HV.save();
        HV.celebrate('sun', 'Day ' + client.day + ' complete', 'Every part of today, done. Tomorrow is already laid out.');
      } else {
        HV.closeSheet();
      }
    };
    HV.sheet(
      /* the AI coach has no first name to shorten */
      '<div class="h1">How was the session' + (coach.ai ? '' : ' with ' + HV.esc(String(coach.name).split(' ')[0])) + '?</div>' +
      '<p class="sub" style="margin:0">' + HV.esc(opts.label || 'Session') + ' · Day <span class="num">' + day + '</span> — your stars go to your care team.</p>' +
      '<div data-stars style="text-align:center; margin:var(--s3) 0">' + HV.ui.starInput(0, 0) + '</div>' +
      '<textarea class="input" data-note placeholder="Anything to add? (optional)"></textarea>' +
      '<button class="btn block" data-send disabled>Send feedback</button>' +
      '<button class="btn quiet block" data-skip>Not now</button>',
      sheet => {
        const wrap = sheet.querySelector('[data-stars]');
        const send = sheet.querySelector('[data-send]');
        const wireStars = () => {
          wrap.querySelectorAll('[data-star]').forEach(b => {
            b.addEventListener('click', () => {
              chosen = Number(b.dataset.star);
              wrap.innerHTML = HV.ui.starInput(0, chosen);
              send.disabled = false;
              wireStars();
              /* the pressed button was just re-rendered — keep the keyboard
                 standing on its twin */
              const again = wrap.querySelector('[data-star="' + chosen + '"]');
              if (again) again.focus();
            });
          });
        };
        wireStars();
        sheet.querySelector('[data-skip]').addEventListener('click', finish);
        send.addEventListener('click', () => {
          if (!chosen) return;
          const note = sheet.querySelector('[data-note]').value.trim();
          const rec = { cy: client.cycle, day: day, key: opts.key, stars: chosen, note: note, ts: HV.now() };
          /* new records carry the occurrence they answer; the (cy, day, key)
             triple stays because every existing reader joins on it */
          if (opts.taskId) { rec.taskId = opts.taskId; rec.dateISO = opts.dateISO || HV.todayISO(); }
          client.sessionFeedback = client.sessionFeedback || [];
          client.sessionFeedback.push(rec);
          HV.save();
          HV.toast('Thank you — your stars reached the team.');
          HV.refresh();
          finish();
        });
      }
    );
  };

  function mountRequests(wrap, c) {
    /* a route change while the deck hovered: the shell is rebuilt, so any
       floating layer from the previous page goes with it */
    document.querySelectorAll('.req-pop').forEach(n => n.remove());
    const list = HV.requests(c);
    if (!list.length) return;
    const head = wrap.querySelector('.c-head');

    /* the label under the profile seat — the pile at rest. Extra layers
       behind the face ARE the stack: one request is a label, three is
       visibly a pile. */
    const badge = document.createElement('button');
    badge.className = 'req-badge';
    function paintBadge(n) {
      badge.setAttribute('aria-label', n + (n > 1 ? ' requests are' : ' request is') + ' waiting — open');
      badge.innerHTML =
        (n > 2 ? '<span class="lyr l3" aria-hidden="true"></span>' : '') +
        (n > 1 ? '<span class="lyr l2" aria-hidden="true"></span>' : '') +
        '<span class="face">' + ICONS.bell + '<b class="num">' + n + '</b></span>';
    }
    paintBadge(list.length);
    head.appendChild(badge);
    badge.addEventListener('click', openDeck);

    function openDeck() {
      const pending = HV.requests(c);   /* re-read: a sheet may have settled some */
      if (!pending.length) { badge.remove(); return; }
      badge.classList.add('hide');      /* the pile is in hand */

      const pop = document.createElement('div');
      pop.className = 'req-pop';
      pop.setAttribute('role', 'dialog');
      pop.setAttribute('aria-modal', 'true');
      pop.setAttribute('tabindex', '-1');   /* focus lands here, ring-free */
      pop.setAttribute('aria-label', 'Requests waiting for you');
      pop.innerHTML =
        '<div class="req-veil"></div>' +
        '<div class="req-stage">' +
          '<div class="req-deck" tabindex="0" role="group" aria-roledescription="carousel" aria-label="' +
            pending.length + (pending.length > 1 ? ' requests' : ' request') + ' waiting. Swipe or use arrow keys.">' +
          pending.map(rq =>
            '<article class="req-card" data-id="' + HV.esc(rq.id) + '">' +
              '<span class="rq-tile">' + HV.ui.icon(rq.icon) + '</span>' +
              '<small class="rq-k">' + rq.kicker + '</small>' +
              '<b class="rq-t">' + rq.html + '</b>' +
              '<p class="rq-s">' + HV.esc(rq.sub) + '</p>' +
              '<div class="rq-a">' +
                (rq.kind === 'session'
                  ? '<button class="btn block" data-a="ok">Confirm</button>' +
                    '<button class="btn ghost block" data-a="cant">Can’t make it</button>'
                  : rq.kind === 'rate'
                  ? '<button class="btn block" data-a="rate">Rate it</button>'
                  : '<button class="btn block" data-a="log">Log now</button>') +
              '</div>' +
              '<button class="rq-ign" data-a="ign">Ignore</button>' +
            '</article>').join('') +
          '</div>' +
          '<div class="req-dots"' + (pending.length > 1 ? '' : ' style="display:none"') + '>' +
            pending.map((x, i) => '<span' + (i ? '' : ' class="on"') + '></span>').join('') + '</div>' +
          '<button class="req-later">Not now</button>' +
        '</div>';
      document.body.appendChild(pop);

      /* ---- the deck: the onboarding story deck's engine, request-sized.
         Geometry law (measured from the original): earlier card always above
         (z = N − i), forward peel is 1:1 under the finger, the card beneath
         only drifts one fan step and scales .955 → 1. */
      const deck = pop.querySelector('.req-deck');
      let slides = Array.prototype.slice.call(deck.children);
      let cur = 0, W = 0;
      const FAN = 16, SCALE = 0.955, SLIVER = 8;
      const slotPos = s => {
        if (s <= -1) return { x: -(SLIVER + (W / 2) * (1 + SCALE)), sc: SCALE };
        s = Math.min(s, 2);
        const sc = Math.pow(SCALE, s);
        return { x: (W / 2) * (1 - sc) + FAN * s, sc: sc };
      };
      const put = (el, p) => { el.style.transform = 'translateX(' + p.x + 'px) scale(' + p.sc + ')'; };
      const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, sc: a.sc + (b.sc - a.sc) * t });

      function syncDots() {
        const box = pop.querySelector('.req-dots');
        box.style.display = slides.length > 1 ? '' : 'none';
        box.innerHTML = slides.map((x, i) => '<span' + (i === cur ? ' class="on"' : '') + '></span>').join('');
      }
      function layout() {
        W = slides.length ? slides[0].offsetWidth : 0;
        const N = slides.length;
        slides.forEach((s, i) => {
          s.style.zIndex = N - i;
          s.classList.remove('peel');
          s.setAttribute('aria-hidden', i === cur ? 'false' : 'true');
          put(s, slotPos(i - cur));
        });
        syncDots();
      }
      let snapT = null;
      function snap() {
        deck.classList.add('anim');
        layout();
        clearTimeout(snapT);
        snapT = setTimeout(() => deck.classList.remove('anim'), 230);
      }
      function go(i) { cur = Math.max(0, Math.min(i, slides.length - 1)); snap(); }

      function render(dx) {
        const N = slides.length;
        if ((dx < 0 && cur >= N - 1) || (dx > 0 && cur <= 0)) dx *= 0.25;   /* the ends push back */
        if (dx <= 0) {
          const p = W ? Math.min(1, -dx / W) : 0;
          slides.forEach((s, i) => {
            const slot = i - cur;
            if (slot < 0) put(s, slotPos(slot));
            else if (slot === 0) {
              s.classList.add('peel');
              s.style.setProperty('--peelA', p.toFixed(3));
              s.style.transform = 'translateX(' + dx + 'px) scale(1)';
            } else put(s, lerp(slotPos(slot), slotPos(slot - 1), cur < N - 1 ? p : 0));
          });
        } else if (cur === 0) {
          slides.forEach((s, i) => {
            if (i === 0) s.style.transform = 'translateX(' + dx + 'px) scale(1)';
            else put(s, slotPos(i));
          });
        } else {
          const away = slotPos(-1);
          const p2 = Math.min(1, dx / -away.x);
          slides.forEach((s, i) => {
            const slot = i - cur;
            if (slot === -1) {
              s.classList.add('peel');
              s.style.setProperty('--peelA', p2.toFixed(3));
              /* full size the whole way back — it returns as the top card */
              put(s, { x: Math.min(0, away.x + dx), sc: SCALE + (1 - SCALE) * p2 });
            } else if (slot < -1) put(s, slotPos(slot));
            else put(s, lerp(slotPos(slot), slotPos(slot + 1), p2));
          });
        }
      }

      let down = null;
      deck.addEventListener('pointerdown', e => {
        if (down) return;                    /* one finger owns the deck */
        deck.classList.remove('anim');
        W = slides.length ? slides[0].offsetWidth : 0;
        down = { x: e.clientX, y: e.clientY, id: e.pointerId, lock: false,
                 lx: e.clientX, lt: performance.now(), vx: 0 };
      });
      deck.addEventListener('pointermove', e => {
        if (!down || e.pointerId !== down.id) return;
        const dx = e.clientX - down.x, dy = e.clientY - down.y;
        if (!down.lock) {
          if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
          /* a vertical intent scrolls the page, not the deck */
          if (Math.abs(dy) > Math.abs(dx)) { down = null; layout(); return; }
          down.lock = true;
          deck.setPointerCapture(e.pointerId);
        }
        const t = performance.now();
        if (t - down.lt > 0) { down.vx = (e.clientX - down.lx) / (t - down.lt); down.lx = e.clientX; down.lt = t; }
        render(dx);
      });
      const release = e => {
        if (!down || e.pointerId !== down.id) return;
        const dx = down.lock ? e.clientX - down.x : 0;
        const flick = Math.abs(down.vx) > 0.45 && Math.sign(down.vx) === Math.sign(dx) && dx !== 0;
        down = null;
        if (dx < 0 && (flick || -dx > W * 0.3)) go(cur + 1);
        else if (dx > 0 && (flick || dx > W * 0.3)) go(cur - 1);
        else snap();
      };
      deck.addEventListener('pointerup', release);
      deck.addEventListener('pointercancel', release);

      /* ---- closing and settling ---- */
      let closed = false;
      function closePop(allDone) {
        if (closed) return;
        closed = true;
        pop.classList.add('away');           /* the pile flies home to the label */
        setTimeout(() => pop.remove(), 220);
        const left = HV.requests(c).length;
        if (!left) {
          badge.remove();
          if (allDone) HV.toast('All settled — nothing waiting on you.');
        } else {
          paintBadge(left);
          badge.classList.remove('hide');
        }
      }
      /* the answered card peels off left for good; the deck closes ranks */
      function settleCard(card) {
        const i = slides.indexOf(card);
        if (i === -1) return;
        slides.splice(i, 1);
        if (cur >= slides.length) cur = Math.max(0, slides.length - 1);
        if (!slides.length) { closePop(true); return; }
        deck.classList.add('anim');
        card.classList.add('peel');
        card.style.setProperty('--peelA', '1');
        card.style.zIndex = 99;
        put(card, { x: -(W + 60), sc: 1 });
        setTimeout(() => { card.remove(); snap(); }, 200);
      }

      pop.querySelectorAll('.req-card').forEach(card => {
        const rq = pending.find(r => r.id === card.dataset.id);
        card.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => {
          const a = b.dataset.a;
          if (a === 'ign') {
            /* ignored is forever — the pile never asks about this one again */
            (HV.store.reqIgnored = HV.store.reqIgnored || {})[rq.id] = HV.now();
            HV.save();
            settleCard(card);
          } else if (a === 'ok') {
            rq.rem.confirmed = true;
            HV.save();
            HV.toast('Confirmed — see you at ' + HV.fmtTime(rq.rem.start) + '.');
            settleCard(card);
          } else if (a === 'cant') {
            closePop(false);
            reqCantSheet(c, rq.rem);
          } else if (a === 'log') {
            closePop(false);
            reqWeighSheet(c);
          } else if (a === 'rate') {
            /* close the deck BEFORE the sheet: they are different layers,
               and a sheet under a live deck traps the focus in the wrong one */
            closePop(false);
            HV.rateSheet(c, rq.rate);
          }
        }));
      });
      pop.querySelector('.req-veil').addEventListener('click', () => closePop(false));
      pop.querySelector('.req-later').addEventListener('click', () => closePop(false));
      pop.addEventListener('keydown', e => {
        if (e.key === 'Escape') closePop(false);
        else if (e.key === 'ArrowRight') go(cur + 1);
        else if (e.key === 'ArrowLeft') go(cur - 1);
      });

      layout();
      pop.focus({ preventScroll: true });
    }

    /* the deck hovers by itself on the first screen of this visit only —
       after that the label carries the pile until it is answered */
    if (!reqShownThisLoad) { reqShownThisLoad = true; openDeck(); }
  }

  /* ---------------- console shell ---------------- */
  /* The menu panel works like an editor's activity bar: full labels, or
     collapsed to a 68px icon rail — the choice persists in HV.store.ui.rail.
     On phones the same panel is the burger drawer, where a rail makes no
     sense, so rail styles only apply from the desktop breakpoint up (CSS). */
  function consoleShell(app, active) {
    /* the console keeps the sweep heartbeat alive; idempotent, so per-render is free */
    HV.ensureTick();
    const me = HV.me();
    const role = HV.roleDef(me.role) || HV.ROLES.client;
    const ui = HV.store.ui = HV.store.ui || {};
    const wrap = document.createElement('div');
    wrap.className = 'shell-console';

    const counts = HV.navCounts ? HV.navCounts() : {};
    wrap.innerHTML =
      '<aside class="side' + (ui.rail ? ' rail' : '') + '" id="side">' +
        '<div class="side-head"><div class="wordmark">HAALVING · CONSOLE</div>' +
        '<button id="side-toggle" aria-label="' + (ui.rail ? 'Expand menu' : 'Collapse menu to icons') + '">' +
        (ui.rail ? ICONS.chevR : ICONS.chevL) + '</button></div>' +
        '<nav>' + role.nav.map(id => {
          const it = HV.NAV_ITEMS[id];
          const routeName = it.route.slice(2);
          const c = counts[id];
          /* explicit aria-label: in rail mode the .lbl is display:none, and
             name-from-content would fall through to the count badge — a button
             announced as "2" instead of "Care Circles (2)" */
          /* every sub-route declares its parent, so the highlight survives a
             deep link — #/client/<id> lights Clients) */
          const on = active === routeName || (it.owns || []).includes(active);
          return '<button data-r="' + it.route + '"' + (ui.rail ? ' title="' + HV.esc(it.label) + '"' : '') +
            ' aria-label="' + HV.esc(it.label + (c ? ' (' + c + ')' : '')) + '"' +
            ' class="' + (on ? 'on' : '') + '"' + (on ? ' aria-current="page"' : '') + '>' +
            HV.ui.icon(it.icon) + '<span class="lbl">' + HV.esc(it.label) + '</span>' +
            (c ? '<span class="count num">' + c + '</span>' : '') + '</button>';
        }).join('') + '</nav>' +
        '<div class="me">' + '<b>' + HV.esc(me.name) + '</b><small>' + HV.esc(role.title) + '</small>' +
        '<button id="cs-logout"' + (ui.rail ? ' title="Switch role"' : '') + '><span class="lbl">Switch role </span>' + ICONS.caretDown + '</button></div>' +
      '</aside>' +
      '<div style="flex:1; min-width:0; display:flex; flex-direction:column">' +
        '<div class="cs-top"><button class="burger" id="burger" aria-label="Menu">' + HV.ui.icon('menu') + '</button>' +
        '<span class="wordmark">HAALVING</span><span class="sub" style="margin-left:auto">' + HV.esc(me.name) + '</span></div>' +
        '<main class="cs-main" id="view-root"></main>' +
      '</div>';
    app.appendChild(wrap);

    wrap.querySelectorAll('.side nav button').forEach(b => b.addEventListener('click', () => HV.go(b.dataset.r)));
    wrap.querySelector('#cs-logout').addEventListener('click', HV.logout);
    /* rail toggle flips classes in place — no re-render, so view state survives */
    wrap.querySelector('#side-toggle').addEventListener('click', () => {
      ui.rail = !ui.rail;
      HV.save();
      const side = wrap.querySelector('#side');
      side.classList.toggle('rail', ui.rail);
      const t = wrap.querySelector('#side-toggle');
      t.innerHTML = ui.rail ? ICONS.chevR : ICONS.chevL;
      t.setAttribute('aria-label', ui.rail ? 'Expand menu' : 'Collapse menu to icons');
      side.querySelectorAll('nav button').forEach(b => {
        if (ui.rail) b.title = b.querySelector('.lbl').textContent;
        else b.removeAttribute('title');
      });
      const lo = wrap.querySelector('#cs-logout');
      if (ui.rail) lo.title = 'Switch role'; else lo.removeAttribute('title');
    });
    const burger = wrap.querySelector('#burger');
    if (burger) burger.addEventListener('click', () => {
      const side = wrap.querySelector('#side');
      side.classList.toggle('open');
      let scrim = wrap.querySelector('.scrim');
      if (side.classList.contains('open')) {
        scrim = document.createElement('div'); scrim.className = 'scrim';
        scrim.addEventListener('click', () => { side.classList.remove('open'); scrim.remove(); });
        wrap.appendChild(scrim);
      } else if (scrim) scrim.remove();
    });
    return wrap.querySelector('#view-root');
  }

  /* ---------------- UI helpers ---------------- */
  HV.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  };

  /* Rich chat text — a deliberately tiny dialect: **bold**, _italic_, and
     lines that open with "• " become hanging bullets. Escape FIRST, then
     decorate; author text can never smuggle HTML through this. */
  HV.md = function (s) {
    return HV.esc(s)
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/(^|\s)_([^_\n]+)_(?=[\s.,!?)]|$)/g, '$1<i>$2</i>')
      .split('\n').map(line =>
        /^• /.test(line) ? '<span class="mdli">' + line.slice(2) + '</span>' : line
      ).join('<br>').replace(/<\/span><br>/g, '</span>');
  };

  /* ── The HAALVING mark set ──────────────────────────────────────────────
     46 hairline marks, one voice: 24-box, stroke 1.6 (set in CSS), round
     caps. These replace every pictorial emoji in the product. */
  const ICONS = {
    home:  '<svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5M5.5 10v9h13v-9"/></svg>',
    cal:   '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="14" rx="2"/><path d="M4 10h16M8 4v4M16 4v4"/></svg>',
    chat:  '<svg viewBox="0 0 24 24"><path d="M4 6h16v10H9l-5 4z"/></svg>',
    circle:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M8.5 10.5h7M8.5 14h4.5"/></svg>',
    chart: '<svg viewBox="0 0 24 24"><path d="M4 20V9M10 20V4M16 20v-8M21 20H3"/></svg>',
    user:  '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.3-3.5 4-5 7-5s5.7 1.5 7 5"/></svg>',
    users: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8.5" r="3"/><path d="M3.5 19c1-2.8 3.1-4.2 5.5-4.2s4.5 1.4 5.5 4.2M15.5 6a2.8 2.8 0 1 1 0 5.6M17 14.9c2 .4 3.4 1.7 4 4.1"/></svg>',
    tribe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="6.5" r="2.6"/><circle cx="5.2" cy="9.5" r="2.1"/><circle cx="18.8" cy="9.5" r="2.1"/><path d="M8.4 20c.6-3.1 2-4.7 3.6-4.7s3 1.6 3.6 4.7M2.3 18.3c.5-2.3 1.6-3.6 3.1-3.9M21.7 18.3c-.5-2.3-1.6-3.6-3.1-3.9"/></svg>',
    /* the Haalving Zone mark: a canvas over the pile behind it, carrying one
       brushed line — the place where the community paints, not the people */
    zone: '<svg viewBox="0 0 24 24"><rect x="3.6" y="8.2" width="12.2" height="12.2" rx="2.6"/><path d="M8.2 6.2a2.6 2.6 0 0 1 2.6-2.6h7a2.6 2.6 0 0 1 2.6 2.6v7a2.6 2.6 0 0 1-2.6 2.6"/><path d="M6.4 17c1.2-2.6 2.5-3.9 3.9-3.9 1.1 0 1.9.8 2.4 2.3"/></svg>',
    bulb:  '<svg viewBox="0 0 24 24"><path d="M9.5 18h5M10.5 21h3M12 3.5a5.5 5.5 0 0 1 3 10.1c-.7.5-1 1.3-1 2.4h-4c0-1.1-.3-1.9-1-2.4a5.5 5.5 0 0 1 3-10.1z"/></svg>',
    bookmark: '<svg viewBox="0 0 24 24"><path d="M7 4h10v16l-5-3.5L7 20z"/></svg>',
    more:  '<svg viewBox="0 0 24 24"><circle cx="5.5" cy="12" r=".9"/><circle cx="12" cy="12" r=".9"/><circle cx="18.5" cy="12" r=".9"/></svg>',
    camera:'<svg viewBox="0 0 24 24"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.4"/></svg>',
    grid:  '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.4-7 10-7 10z"/></svg>',
    flow:  '<svg viewBox="0 0 24 24"><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="12" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8.5 6H14a2 2 0 0 1 2 2v1.5M8.5 18H14a2 2 0 0 0 2-2v-1.5"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M4 12.5 9.5 18 20 6.5"/></svg>',
    gear:  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></svg>',
    menu:  '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    mic:   '<svg viewBox="0 0 24 24"><rect x="9.5" y="4" width="5" height="10" rx="2.5"/><path d="M6 12a6 6 0 0 0 12 0M12 18v3"/></svg>',
    phone: '<svg viewBox="0 0 24 24"><path d="M5 4.5C5 3.7 5.7 3 6.5 3h2L10 7.5 8 9.3a13.5 13.5 0 0 0 6.7 6.7l1.8-2L21 15.5v2c0 .8-.7 1.5-1.5 1.5C10.8 19 5 13.2 5 4.5z"/></svg>',
    device:'<svg viewBox="0 0 24 24"><rect x="7.5" y="3.5" width="9" height="17" rx="2.4"/><path d="M10.5 17.5h3"/></svg>',
    video: '<svg viewBox="0 0 24 24"><rect x="3.5" y="7" width="12" height="10" rx="2"/><path d="M15.5 11l5-2.5v7l-5-2.5"/></svg>',
    sound: '<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z"/><path d="M15.5 9.2a4 4 0 0 1 0 5.6M18.2 6.6a7.6 7.6 0 0 1 0 10.8"/></svg>',
    drop:  '<svg viewBox="0 0 24 24"><path d="M12 4.5c2.9 3.3 5 6.1 5 8.8a5 5 0 0 1-10 0c0-2.7 2.1-5.5 5-8.8z"/></svg>',
    moon:  '<svg viewBox="0 0 24 24"><path d="M19 14.5A7.5 7.5 0 0 1 9.5 5 7.5 7.5 0 1 0 19 14.5z"/></svg>',
    bowl:  '<svg viewBox="0 0 24 24"><path d="M4.5 12.5h15a7.5 7.5 0 0 1-5 6.3v1.2h-5v-1.2a7.5 7.5 0 0 1-5-6.3z"/><path d="M10 9.5c0-1.2 1-1.6 1-2.8M14 9.5c0-1.2 1-1.6 1-2.8"/></svg>',
    leaf:  '<svg viewBox="0 0 24 24"><path d="M6 18C6 10 11 5.5 19 5c.5 8-4 13-13 13z"/><path d="M6 18c2.5-5 6-8.5 10-10.5"/></svg>',
    sprout:'<svg viewBox="0 0 24 24"><path d="M12 20.5v-7"/><path d="M12 13.5C12 10 9.5 7.5 6 7.5c0 3.5 2.5 6 6 6z"/><path d="M12 11.5c0-3 2-5.5 6-5.5 0 3-2 5.5-6 5.5z"/></svg>',
    lock:  '<svg viewBox="0 0 24 24"><rect x="5.5" y="10.5" width="13" height="9" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>',
    sparkle:'<svg viewBox="0 0 24 24"><path d="M12 4l1.8 5.2L19 11l-5.2 1.8L12 18l-1.8-5.2L5 11l5.2-1.8z"/></svg>',
    bell:  '<svg viewBox="0 0 24 24"><path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2.5h-15z"/><path d="M10 21a2.2 2.2 0 0 0 4 0"/></svg>',
    award: '<svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="5"/><path d="M9.2 13.3 7.5 20l4.5-2.5L16.5 20l-1.7-6.7"/></svg>',
    ruler: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="18" rx="1.5"/><path d="M9 7.5h3M9 12h3M9 16.5h3"/></svg>',
    gauge: '<svg viewBox="0 0 24 24"><path d="M5 17a8 8 0 1 1 14 0"/><path d="M12 13.5 15.5 10"/><circle cx="12" cy="14.5" r="1.2"/></svg>',
    target:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2"/></svg>',
    doc:   '<svg viewBox="0 0 24 24"><path d="M7 3.5h7l4 4V20.5H7z"/><path d="M14 3.5V8h4M10 12.5h5M10 16h5"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    sun:   '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/></svg>',
    walk:  '<svg viewBox="0 0 24 24"><circle cx="13.5" cy="4.5" r="1.7"/><path d="M13 7.5 10.5 12l3 3 1 5.5M10.5 12 8 14l-1.5 5.5M13 7.5l3 2 2.5 1"/></svg>',
    play:  '<svg viewBox="0 0 24 24"><path d="M8.5 5.5 18 12l-9.5 6.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M9 5.5v13M15 5.5v13"/></svg>',
    plus:  '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    /* the plus for a row of icons rather than a label: the bare plus is two
       strokes where its neighbours are six, so it reads as a gap in the row.
       The frame takes scan's exact 4→20 bounds and camera's square corners,
       which is what makes it a sibling instead of a lone mark (TJ, 9 Aug). */
    plusbox: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3.6"/><path d="M12 8.6v6.8M8.6 12h6.8"/></svg>',
    minus: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
    arrow: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    chevL: '<svg viewBox="0 0 24 24"><path d="M14.5 5 8 12l6.5 7"/></svg>',
    chevR: '<svg viewBox="0 0 24 24"><path d="M9.5 5 16 12l-6.5 7"/></svg>',
    info:  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 7.8v.1"/></svg>',
    scale: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.3 10.5a4.5 4.5 0 0 1 7.4 0M12 12.5l1.8-2"/></svg>',
    flag:  '<svg viewBox="0 0 24 24"><path d="M6 21V4"/><path d="M6 5h11l-2.5 3.5L17 12H6"/></svg>',
    shield:'<svg viewBox="0 0 24 24"><path d="M12 3.5 19 6v5.5c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9V6z"/></svg>',
    flame: '<svg viewBox="0 0 24 24"><path d="M12 3.5c.8 3.2-4.5 5.3-4.5 10a4.5 4.5 0 0 0 9 .2c0-2.2-1.2-3.6-2-4.7-.9 1-1.4 2-1.2 3.2-1.5-1.6-1.8-5.2-1.3-8.7z"/></svg>',
    pencil:'<svg viewBox="0 0 24 24"><path d="M4 20l1-4L16.5 4.5a2.12 2.12 0 0 1 3 3L8 19z"/><path d="M14.5 6.5l3 3"/></svg>',
    search:'<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M15.7 15.7 20 20"/></svg>',
    send:  '<svg viewBox="0 0 24 24"><path d="M4 11.5 20 4l-4.5 16-3.5-6.5z"/><path d="M12 13.5 20 4"/></svg>',
    x:     '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    warn:  '<svg viewBox="0 0 24 24"><path d="M12 4 21 19.5H3z"/><path d="M12 10v4M12 16.6v.1"/></svg>',
    /* composer marks */
    smile: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M8.4 14.1a4.3 4.3 0 0 0 7.2 0"/><path d="M9.2 9.5v.1M14.8 9.5v.1"/></svg>',
    clip:  '<svg viewBox="0 0 24 24"><path d="M17.5 11.3 11.6 17a3.7 3.7 0 1 1-5.2-5.2l7-7a2.4 2.4 0 0 1 3.4 3.4l-6.9 7a1.2 1.2 0 0 1-1.7-1.7l5.9-5.9"/></svg>',
    /* scan a meal to log it — bracket frame around a bowl */
    scan:  '<svg viewBox="0 0 24 24"><path d="M4 8.6V6.2A2.2 2.2 0 0 1 6.2 4h2.4M15.4 4h2.4A2.2 2.2 0 0 1 20 6.2v2.4M20 15.4v2.4a2.2 2.2 0 0 1-2.2 2.2h-2.4M8.6 20H6.2A2.2 2.2 0 0 1 4 17.8v-2.4"/><path d="M8.2 11.4h7.6a3.8 3.8 0 0 1-7.6 0z"/></svg>',
    /* the rating star. One path; CSS decides filled or empty, which is the one
       place the hairline language yields — a rating must read at a glance.
       Replaces the ★ text glyph, which changed weight and width per platform
       and took emoji presentation on some Android builds. */
    star:  '<svg viewBox="0 0 24 24"><path d="M12 3.6l2.6 5.75 6.25.72-4.65 4.2 1.25 6.18L12 17.3l-5.45 3.15 1.25-6.18-4.65-4.2 6.25-.72z"/></svg>',
    caretUp:  '<svg viewBox="0 0 24 24"><path d="M6.5 14.5 12 9l5.5 5.5"/></svg>',
    caretDown:'<svg viewBox="0 0 24 24"><path d="M6.5 9.5 12 15l5.5-5.5"/></svg>',
    /* a vital sign, not a speedometer — the trackers tab mark */
    pulse: '<svg viewBox="0 0 24 24"><path d="M3 12.5h4.2l2.3-5.5 3.6 10 2.4-6.5 1.3 2h4.2"/></svg>',
    /* ── the calendar pillar marks — the plainest symbol each pillar owns:
       a dumbbell, a fork and knife, a seated meditator. Moon covers Mind. */
    dumbbell: '<svg viewBox="0 0 24 24"><path d="M7 8.5v7M4.2 10v4M17 8.5v7M19.8 10v4M7 12h10"/></svg>',
    cutlery:  '<svg viewBox="0 0 24 24"><path d="M7 3.8v4a2.3 2.3 0 0 0 4.6 0v-4M9.3 3.8v16.4"/><ellipse cx="16.2" cy="6.8" rx="2.1" ry="3"/><path d="M16.2 9.8v10.4"/></svg>',
    meditate: '<svg viewBox="0 0 24 24"><circle cx="12" cy="5.6" r="2.1"/><path d="M9.9 9.2C8.1 10 7 11.6 6.4 13.9M14.1 9.2c1.8.8 2.9 2.4 3.5 4.7M4.6 17.6c2.2-2.3 4.7-3.4 7.4-3.4s5.2 1.1 7.4 3.4"/></svg>',
    /* ── the vital-panel category marks ──────────────────────────────────
       Fittr sets these as glossy three-dimensional organs; drawn in this
       product's hairline they read as anatomy rather than as illustration.
       Blood and Heart reuse `drop` and `heart` — they were already here. */
    molecule: '<svg viewBox="0 0 24 24"><circle cx="12" cy="5.6" r="2.3"/><circle cx="5.8" cy="16.4" r="2.3"/><circle cx="18.2" cy="16.4" r="2.3"/><path d="M10.8 7.6 7 14.4M13.2 7.6 17 14.4M8.1 16.4h7.8"/></svg>',
    microbe:  '<svg viewBox="0 0 24 24"><path d="M12 4.2c3.5 0 6.3 2.7 6.3 6.1 0 4.1-2.5 9.5-6.3 9.5s-6.3-5.4-6.3-9.5c0-3.4 2.8-6.1 6.3-6.1z"/><circle cx="10.1" cy="10.4" r="1.1"/><circle cx="14" cy="13.2" r="1.1"/></svg>',
    kidney:   '<svg viewBox="0 0 24 24"><path d="M14.6 4c3 0 5.4 3.6 5.4 8s-2.4 8-5.4 8c-2.2 0-3.5-1.7-4.4-3.3-1.2-2-3.2-2.8-4.8-3.6-1.1-.6-1.4-1-1.4-1.4s.3-.8 1.4-1.4c1.6-.8 3.6-1.6 4.8-3.6C11.1 5.7 12.4 4 14.6 4z"/><path d="M14.4 8.4 11.6 12h3.5"/></svg>',
    liver:    '<svg viewBox="0 0 24 24"><path d="M3.6 9.4c4.2-2.6 11.3-3.5 17-1.4-.4 5.6-3.4 9.7-8.1 10.7-4.1.9-7.6-1.3-8.7-5.1-.3-1.2-.4-2.6-.2-4.2z"/><path d="M12.5 18.7c.3-3.1 1.8-5.6 4.6-7.2"/></svg>',
    lipid:    '<svg viewBox="0 0 24 24"><circle cx="9.2" cy="10" r="4.4"/><circle cx="15.6" cy="14.8" r="3.6"/></svg>',
    sugar:    '<svg viewBox="0 0 24 24"><path d="M12 3.6 20 8v8l-8 4.4L4 16V8z"/><path d="M4 8l8 4.4L20 8M12 12.4v8"/></svg>',
    thyroid:  '<svg viewBox="0 0 24 24"><path d="M12 8.4v6.2"/><path d="M12 9.2C10.6 7 8.5 6 6.7 6.6 4.6 7.2 4 9.5 4.8 11.8c.8 2.3 2.9 3.8 5 3.3 1.4-.3 2.2-1.6 2.2-3z"/><path d="M12 9.2c1.4-2.2 3.5-3.2 5.3-2.6 2.1.6 2.7 2.9 1.9 5.2-.8 2.3-2.9 3.8-5 3.3-1.4-.3-2.2-1.6-2.2-3z"/></svg>',
    flask:    '<svg viewBox="0 0 24 24"><path d="M8.4 3.5h7.2M10 3.5v6.2l-3.9 7.6a2.2 2.2 0 0 0 2 3.2h7.8a2.2 2.2 0 0 0 2-3.2L14 9.7V3.5"/><path d="M7.6 14.6h8.8"/></svg>',
    /* the Nutrient Panel mark — the panel's own hologram in miniature: a
       body materializing as scan slices over its pad. Slice widths carry the
       anatomy (shoulders > chest > waist < hips > thighs), so it reads as a
       figure, not a stack. Lives on Today's floating button. */
    body:     '<svg viewBox="0 0 24 24"><circle cx="12" cy="3.9" r="1.8"/><path d="M7.8 7.7h8.4M8.7 10.2h6.6M9.5 12.7h5M9.1 15.2h5.8M10.1 17.7h3.8"/><ellipse cx="12" cy="20.8" rx="5.4" ry="1.4"/></svg>',
  };

  HV.ui = {
    icon: n => ICONS[n] || ICONS.home,

    /* the shared tab bar. Hosts render it, then delegate clicks to a route —
       tab state lives in the hash so a refresh keeps your place. */
    tabs: (items, active) =>
      '<div class="tabs">' + items.map(t =>
        '<button data-tab="' + HV.esc(t.key) + '" class="' + (t.key === active ? 'on' : '') + '"' +
          (t.key === active ? ' aria-current="page"' : '') + '>' +
          HV.esc(t.label) +
          (t.count ? ' <span class="pill info"><span class="num">' + t.count + '</span></span>' : '') +
        '</button>').join('') + '</div>',

    /* an empty state that speaks — a sentence a human would say, never just an icon */
    empty: (icon, sentence, sub) =>
      '<div class="empty"><span class="big">' + (ICONS[icon] || ICONS.leaf) + '</span>' +
      HV.esc(sentence) + (sub ? '<br><span class="sub">' + HV.esc(sub) + '</span>' : '') + '</div>',

    /* icon medallion — the refined replacement for emoji tiles.
       cls: 'sm'|'lg' plus optional pillar class ('p-fitness'…) for tinting */
    iconTile: (n, cls) =>
      '<span class="icon-tile ' + (cls || '') + '" aria-hidden="true">' + (ICONS[n] || ICONS.leaf) + '</span>',

    /* pillar plate — the pillar's specimen artwork, the same matte-clay
       language as the Vital Panel's organ plates. One colourway per pillar
       (set in the pillar's own palette, the only place that colour may
       appear); keyed to alpha, so it sits on any ground. cls: 'sm'|'lg'. */
    plate: (key, cls) =>
      '<span class="pplate ' + (cls || '') + '" aria-hidden="true">' +
      '<img src="img/pillars/' + (HV.PILLARS[key] ? key : 'culture') + '.webp" width="64" height="64" ' +
      'alt="" decoding="async"></span>',

    /* task art — the task's own specimen artwork, one clay language with
       plate() and graded into its pillar's palette family. The catalogue
       lives at img/tasks/<pillar>-<key>.webp; taskKey() resolves a row's
       label to its key: meals by slot, fitness by set category, yoga by
       block, wellness by practice. Unknown labels fall back to the family's
       first subject rather than a broken image. */
    taskKey: (pillar, label) => {
      const s = String(label || '').toLowerCase();
      if (pillar === 'culture') {
        return /break/.test(s) ? 'breakfast' : /lunch/.test(s) ? 'lunch'
          : /dinner/.test(s) ? 'dinner' : /pre-?workout/.test(s) ? 'prework'
          : /snack/.test(s) ? 'snack' : 'drink';
      }
      if (pillar === 'fitness') {
        return /muscle/.test(s) ? 'muscle' : /endur/.test(s) ? 'endurance'
          : /cardio/.test(s) ? 'cardio' : 'strength';
      }
      if (pillar === 'yoga') {
        return /flex/.test(s) ? 'flexibility' : /breath/.test(s) ? 'breath' : 'mobility';
      }
      return /nidra/.test(s) ? 'nidra' : /downshift/.test(s) ? 'downshift' : 'breath';
    },

    taskArtSrc: (pillar, label) =>
      'img/tasks/' + pillar + '-' + HV.ui.taskKey(pillar, label) + '.webp',

    /* an item's film, framed for the instruction sheet. Two kinds of reference
       work, because a coach has two kinds of film: one they shot, sitting in
       the app's own media folder, and one on YouTube. HV.film.ytId accepts a
       full link, a youtu.be link, a Shorts link or a bare id, so a coach can
       paste whatever YouTube handed them.

       No reference — or one nobody can parse — yields NOTHING rather than an
       empty black box, and the sheet is simply text, exactly as it read before
       films existed. That is also the honest state for an item still waiting
       to be filmed. */
    videoHtml: (ref, title) => {
      const r = String(ref || '').trim();
      if (!r) return '';
      if (/\.(mp4|webm|ogg)(\?|#|$)/i.test(r)) {
        return '<div class="tvid"><video src="' + HV.esc(r) + '" controls playsinline preload="none"' +
          ' poster="media/welcome.jpg" title="' + HV.esc(title || 'How to') + '"></video></div>';
      }
      const id = HV.film && HV.film.ytId ? HV.film.ytId(r) : null;
      if (!id) return '';
      return '<div class="tvid"><iframe src="https://www.youtube.com/embed/' + HV.esc(id) +
        '?rel=0&modestbranding=1&playsinline=1" title="' + HV.esc(title || 'How to') +
        '" loading="lazy" allow="encrypted-media; picture-in-picture" allowfullscreen></iframe></div>';
    },

    /* task card row — the specimen in a rounded tile on the pillar's wash,
       the task named big beside it, detail beneath. The row is the button
       that opens the task sheet: data-topen carries "group:index" and
       wireTasks() turns it into a HV.taskSheet call. `trailing` is an
       optional pill (Logged / Photo); sub is trusted HTML (callers escape). */
    taskRow: (it, trailing, gid, idx) =>
      '<button class="tg-task" data-topen="' + gid + ':' + idx + '">' +
      '<span class="tcard" aria-hidden="true"><img src="' + it.art + '" alt="" ' +
      'loading="lazy" decoding="async"></span>' +
      '<span class="grow"><b>' + HV.esc(it.title) + '</b>' +
      (it.sub ? '<small>' + it.sub + '</small>' : '') + '</span>' +
      (trailing || '') + '</button>',

    wireTasks: (root, groups) => {
      root.querySelectorAll('[data-topen]').forEach(b => b.addEventListener('click', () => {
        const at = b.dataset.topen.split(':');
        const items = groups[at[0]];
        const it = items && items[Number(at[1]) || 0];
        if (it) HV.taskSheet(it);
      }));
    },

    avatar: (name, cls) => {
      const initials = String(name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
      let hue = 0; for (const ch of String(name)) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
      /* 34% lightness, not 42%: white initials on a generated hue only clear
         4.5:1 at or below ~36%, and yellow-greens (hue ~60) are the worst case */
      return '<span class="avatar ' + (cls || '') + '" style="background:hsl(' + hue + ' 32% 34%)" aria-hidden="true">' + HV.esc(initials) + '</span>';
    },

    stars: (n, opts) => {
      opts = opts || {};
      let s = '<span class="stars ' + (opts.cls || '') + '" role="img" aria-label="' + n + ' of 5 stars">';
      for (let i = 1; i <= 5; i++) {
        s += '<span class="' + (i <= n ? '' : 'off') + '" aria-hidden="true">' + ICONS.star + '</span>';
      }
      return s + '</span>';
    },

    /* the meal's photograph when it exists; the bowl mark otherwise */
    mealArt: (m, cls) => m && m.photo
      ? '<span class="mealph ' + (cls || '') + ' has-photo"><img src="' + HV.esc(m.photo) + '" alt="" loading="lazy" decoding="async"></span>'
      : '<span class="mealph ' + (cls || '') + '">' + (ICONS.bowl || '') + '</span>',

    /* the page moment — one band of the arrival's morning per main page,
       so the rooms visibly share the lobby's scene. kicker and title are
       escaped here; sub arrives as already-escaped HTML. `extra` is an
       optional right-hand seat (Today parks the film's play mark there);
       every other caller omits it and gets exactly what it always got. */
    sceneBand: (kicker, title, sub, extra) =>
      '<div class="scene night band' + (extra ? ' has-seat' : '') + '">' +
        '<div class="bg" style="background-image:url(\'media/welcome.jpg\')"></div>' +
        '<div class="scrim-y"></div>' +
        '<div class="fg">' +
          '<div class="kicker">' + HV.esc(kicker) + '</div>' +
          '<h1 class="display">' + HV.esc(title) + '</h1>' +
          (sub ? '<div class="sub">' + sub + '</div>' : '') +
        '</div>' +
        (extra ? '<div class="seat">' + extra + '</div>' : '') +
      '</div>',

    /* interactive star rating: ghost = the AI pre-score, drawn as an unconfirmed
       outline. `.rate`, NOT `.input` — the old class collided with the global
       form-field .input rule and the row was picking up field chrome. */
    starInput: (ghost, chosen) => {
      let s = '<span class="stars rate" role="radiogroup" aria-label="Star rating">';
      for (let i = 1; i <= 5; i++) {
        const on = chosen ? i <= chosen : i <= (ghost || 0);
        s += '<button data-star="' + i + '" class="' + (chosen ? (i <= chosen ? '' : 'off') : (on ? 'ghost-star' : 'off')) +
             '" aria-label="' + i + ' stars">' + ICONS.star + '</button>';
      }
      return s + '</span>';
    },

    /* a ring is a dial without a legend — same stroked-arc build, so the two
       share one visual language (and the arc can animate, which a conic
       gradient could not) */
    ring: (pct, colorVar, label, size) => {
      const p = Math.max(0, Math.min(100, Number(pct) || 0));
      const C = 282.74;                                    // 2·π·45
      const txt = label != null ? String(label) : Math.round(p) + '%';
      return '<span class="ring ' + (size || '') + '" style="--arc:' + (C * p / 100).toFixed(2) +
        '; --rc:var(--' + colorVar + ')" role="img" aria-label="' + HV.esc(txt) + '">' +
        '<svg viewBox="0 0 100 100" aria-hidden="true">' +
          '<circle class="rtrack" cx="50" cy="50" r="45"/>' +
          '<circle class="rfill" cx="50" cy="50" r="45"/>' +
        '</svg>' +
        '<span class="rl">' + HV.esc(txt) + '</span></span>';
    },

    /* the history strip: one bar per day, horizontally scrollable and opened
       at today (the right end). The dashed hairline at the top edge IS the
       target — Samsung Health prints a target chip, an instrument draws a
       calibration line. Every bar is tappable via .tday listeners the caller
       wires up; the exact reading is left to a toast, so no value ever hides
       inside a bar. Moved from client-trackers.js's barsHtml (Task B6) so
       Plan's Progress tab can share the same instrument — signature kept
       exactly as it was: week (array, oldest→today), target (drives the
       calibration %), avgLabel (pre-formatted caption string, so trackers'
       "avg 6,213" and screen-time's inverted reading both fit unchanged),
       fmt (value → reading string, used in the per-bar data-say/aria-label). */
    weekBars: (week, target, avgLabel, fmt) => {
      const today = new Date();
      const bars = week.map((v, i) => {
        const d = new Date(today);
        d.setDate(d.getDate() - (week.length - 1 - i));
        const label = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
        const pct = target ? Math.max(6, Math.min(100, Math.round(v / target * 100))) : 6;
        const isToday = i === week.length - 1;
        return '<button class="tday' + (isToday ? ' today' : '') + '"' +
          ' data-say="' + HV.esc((isToday ? 'Today' : label) + ' · ' + fmt(v)) + '"' +
          ' aria-label="' + HV.esc((isToday ? 'Today' : label) + ': ' + fmt(v)) + '">' +
          '<span class="bcol"><i style="height:' + pct + '%"></i></span>' +
          '<span class="dnum num">' + (isToday ? '·' : d.getDate()) + '</span>' +
          '</button>';
      }).join('');
      return '<div class="tstrip"><div class="tin">' + bars + '</div></div>' +
        '<div class="tbars-cap"><span>Last 3 weeks · tap a day</span><span class="num">' + HV.esc(avgLabel) + '</span></div>';
    },

    pill: (text, kind) => '<span class="pill ' + (kind || 'info') + '">' + HV.esc(text) + '</span>',

    pillarChip: key => {
      const p = HV.PILLARS[key];
      return '<span class="row ' + p.cls + '" style="gap:6px; display:inline-flex"><span class="pdot"></span>' + p.name + '</span>';
    },

    /* the signature chain as one instrument: Draft → each signing role → Published
       (→ Confirmed, calendars tied to a client only — HV.store.proposedCalendars
       tracks confirmation, and only exists once a calendar publishes, so this
       stays guarded rather than assumed present). Completed steps read .sel,
       the step being waited on reads .warn; shared by Approvals and Builder,
       which used to build this chip row independently. */
    stepper: ap => {
      const ch = (HV.store.chains && HV.store.chains[ap.type]) || [];
      const hasConfirm = ap.type === 'calendar' && !!ap.clientId;
      const steps = ['Draft'].concat(ch.map(s => (HV.roleDef(s.role) || {}).title), 'Published');
      if (hasConfirm) steps.push('Confirmed');
      const pc = hasConfirm && HV.store.proposedCalendars[ap.clientId];
      const confirmed = !!(pc && pc.confirmed);
      const cur = ap.status === 'draft' ? 0
        : ap.status === 'submitted' ? 1 + (ap.stage || 0)
        : (hasConfirm && !confirmed) ? steps.length - 1
        : steps.length;
      return '<div style="overflow-x:auto"><div class="row" style="flex-wrap:nowrap; gap:var(--s1); width:max-content">' +
        steps.map((s, i) =>
          '<span class="chip' + (i < cur ? ' sel' : i === cur ? ' warn' : '') +
          '" style="white-space:nowrap">' + HV.esc(s) + '</span>').join('') +
        '</div></div>';
    },

    aidraft: (bodyHtml, actionsHtml) =>
      '<div class="aidraft"><span class="lbl">' + ICONS.sparkle + ' AI draft — review before use</span>' + bodyHtml +
      (actionsHtml ? '<div class="acts">' + actionsHtml + '</div>' : '') + '</div>',

    voice: seconds =>
      '<span class="voice"><span class="play">' + ICONS.play + '</span><span class="wave"></span><span class="num">0:' + String(seconds).padStart(2, '0') + '</span></span>',

    /* ── SIGNATURE: the pillar dial ──────────────────────────────────────
       A 270° calibrated arc with hairline ticks and a serif numeral at
       centre — the instrument the product is named for.
         pct   0–100, drives the arc
         label short uppercase caption under the value
         opts  { value, suffix, color, size, ticks }
       `color` is a CSS custom-property name ('fitness', 'brand', …). */
    dial: (pct, label, opts) => {
      opts = opts || {};
      const p = Math.max(0, Math.min(100, Number(pct) || 0));
      const ARC = 207.35;                                  // 270° of r=44
      const nTicks = opts.ticks == null ? 28 : opts.ticks;
      let ticks = '';
      for (let i = 0; i <= nTicks; i++) {
        const th = (i / nTicks) * 270 * Math.PI / 180;     // arc starts at the SVG origin
        const major = i % 7 === 0;
        const r1 = major ? 31 : 33.5, r2 = 37;
        ticks += '<line x1="' + (50 + r1 * Math.cos(th)).toFixed(2) +
                 '" y1="' + (50 + r1 * Math.sin(th)).toFixed(2) +
                 '" x2="' + (50 + r2 * Math.cos(th)).toFixed(2) +
                 '" y2="' + (50 + r2 * Math.sin(th)).toFixed(2) +
                 '"' + (major ? ' stroke-width="1.4"' : '') + '/>';
      }
      const value = opts.value != null ? opts.value : Math.round(p);
      const suffix = opts.suffix != null ? opts.suffix : '%';
      const aria = HV.esc(label ? label + ': ' + value + suffix : value + suffix);
      return '<span class="dial ' + (opts.size || '') + '"' +
        ' style="--arc:' + (ARC * p / 100).toFixed(2) +
        (opts.color ? '; --dc:var(--' + opts.color + ')' : '') + '"' +
        ' role="img" aria-label="' + aria + '">' +
        '<span class="face">' +
          '<svg viewBox="0 0 100 100" aria-hidden="true">' +
            '<g class="ticks">' + ticks + '</g>' +
            '<circle class="track" cx="50" cy="50" r="44"/>' +
            '<circle class="fill" cx="50" cy="50" r="44"/>' +
          '</svg>' +
          '<span class="v">' + HV.esc(value) +
            (suffix ? '<sup>' + HV.esc(suffix) + '</sup>' : '') + '</span>' +
        '</span>' +
        (label ? '<span class="cap">' + HV.esc(label) + '</span>' : '') +
        '</span>';
    },

    /* status-by-exception tile: healthy is silent, only a miss carries a flag */
    gate: (icon, name, meta, missLabel) =>
      '<div class="gate' + (missLabel ? ' miss' : '') + '"' +
      (missLabel ? ' data-flag="' + HV.esc(missLabel) + '"' : '') + '>' +
        '<div class="ic" aria-hidden="true">' + icon + '</div>' +
        '<div class="nm">' + HV.esc(name) + '</div>' +
        (meta ? '<div class="mt">' + HV.esc(meta) + '</div>' : '') +
      '</div>',

    /* ── the HAALVING Index — four-pillar balance radar ──────────────────
       Axis order is FIXED (Fitness top, Nutrition right, Yoga bottom,
       Mind Wellness left) — re-ordering a radar's axes silently changes its
       shape, so it never varies. Values are 0–100 along each axis.
         vals  {fitness, culture, yoga, wellness}
         opts  { ghost:    same shape from an earlier point (dashed outline),
                 size:     'sm' drops the labels and headline (onboarding),
                 rings:    concentric quadrilaterals in the grid (default 4),
                 done:     how many inner rings the shape has fully closed —
                           those are drawn as reached, not as empty calibration,
                 marks:    {pillar: text} replaces the % under each pillar name,
                 headline: HTML dropped under the radar }
       Hand-drawn like the dial: no chart library. */
    index: (vals, opts) => {
      opts = opts || {};
      const ORDER = ['fitness', 'culture', 'yoga', 'wellness'];
      const rings = opts.rings || 4;
      const done = opts.done || 0;

      /* Each pillar names itself at its own axis tip, so the reading and the
         axis it belongs to are never two glances apart. The viewBox carries the
         padding those labels need: side room for the longest name, and room
         above and below for a name stacked over its level. The 'sm' glimpse has
         no labels, so it drops the padding with them — kept, the shape would
         shrink inside empty air. */
      const lab = opts.size !== 'sm';
      /* PX is measured, not guessed: the side gutters hold "Nutrition" and the
         stacked "Mind"/"Wellness" (~58 units at this type size), so the gutter
         clears the longest LINE plus the gap to its vertex, with slack for a
         font that falls back wider. Never widen PX for a long name — the SVG
         renders at a capped CSS width, so every extra gutter unit shrinks the
         whole instrument, type included, under the 12px floor. Stack instead. */
      const R = 90, PX = lab ? 80 : 12, PY = lab ? 42 : 12;
      const CX = R + PX, CY = R + PY;
      const W = CX * 2, H = CY * 2;

      /* THE SCALE — one function, used by both the grid and the shape, so a
         pillar that has cleared level 3 lands exactly on ring 3 and never
         between rings. Rings are deliberately NOT evenly spaced: every level
         out is harder to hold than the one inside it, so every band is drawn
         wider than the band inside it. At exponent 1 the rings would be even;
         above 1 they spread outward. That single number is the whole rule.
         1.15 is deliberately gentle: it widens the outermost band by half over
         the innermost, which reads clearly, while a steeper curve crushed the
         early levels — and most clients live at L2–L3, so the inner rings are
         exactly the ones that must stay legible. */
      const EXP = 1.15;
      const rad = x => R * Math.pow(Math.max(0, Math.min(100, Number(x) || 0)) / 100, EXP);
      const n = x => Number(x.toFixed(2));

      const v = k => Math.max(0, Math.min(100, Number(vals[k]) || 0));
      const pt = {
        fitness:  x => CX + ',' + n(CY - rad(x)),
        culture:  x => n(CX + rad(x)) + ',' + CY,
        yoga:     x => CX + ',' + n(CY + rad(x)),
        wellness: x => n(CX - rad(x)) + ',' + CY,
      };
      const poly = src => ORDER.map(k => pt[k](src[k])).join(' ');

      /* concentric diamonds form the calibration grid — one per level. The
         outermost is the aim, so it carries a heavier stroke. */
      let grid = '';
      for (let i = 1; i <= rings; i++) {
        const r = n(rad(i / rings * 100));
        grid += '<polygon class="igrid' + (i <= done ? ' on' : '') +
          (i === rings ? ' goal' : '') + '" points="' +
          CX + ',' + n(CY - r) + ' ' + n(CX + r) + ',' + CY + ' ' +
          CX + ',' + n(CY + r) + ' ' + n(CX - r) + ',' + CY + '"/>';
      }
      const axes = '<path class="iaxis" d="M' + CX + ' ' + (CY - R) + 'V' + (CY + R) +
        'M' + (CX - R) + ' ' + CY + 'H' + (CX + R) + '"/>';
      /* each vertex carries its pillar's colour — with its label in the same
         colour, this is the only place pillar colour appears */
      const dots = ORDER.map(k =>
        '<circle class="ivtx" r="4" fill="var(--' + k + ')"' +
        ' cx="' + pt[k](v(k)).split(',')[0] + '" cy="' + pt[k](v(k)).split(',')[1] + '"/>').join('');
      /* a pillar reads as its mark when one is given (e.g. "L3"), otherwise
         as its percentage along the axis */
      const read = k => opts.marks && opts.marks[k] != null
        ? String(opts.marks[k]) : Math.round(v(k)) + '%';

      /* sat just outside its own vertex — never over the grid, which would put
         hairlines through the type */
      const AXIS = {
        fitness:  { name: 'Fitness',  x: CX,          y: CY - R - 24, at: 'middle' },
        culture:  { name: 'Nutrition', x: CX + R + 8, y: CY - 3,      at: 'start'  },
        yoga:     { name: 'Yoga',     x: CX,          y: CY + R + 18, at: 'middle' },
        wellness: { name: ['Mind', 'Wellness'], x: CX - R - 8, y: CY - 3,  at: 'end'    },
      };
      const labels = lab ? ORDER.map(k => {
        const a = AXIS[k];
        /* a two-word side label stacks its words in tspans so the gutter only
           pays for the longest word; the reading keeps its seat below */
        const lines = Array.isArray(a.name) ? a.name : [a.name];
        const ny = lines.length > 1 ? a.y - 8 : a.y;
        const vy = lines.length > 1 ? a.y + 24 : a.y + 17;
        return '<text class="ilbl-n" x="' + a.x + '" y="' + ny + '" text-anchor="' + a.at +
            '" fill="var(--' + k + ')">' +
            lines.map((ln, i) => i === 0 ? HV.esc(ln)
              : '<tspan x="' + a.x + '" dy="14">' + HV.esc(ln) + '</tspan>').join('') +
          '</text>' +
          '<text class="ilbl-v" x="' + a.x + '" y="' + vy + '" text-anchor="' + a.at + '">' +
            HV.esc(read(k)) + '</text>';
      }).join('') : '';

      const aria = 'HAALVING Index: Fitness ' + read('fitness') + ', Nutrition ' +
        read('culture') + ', Yoga ' + read('yoga') + ', Mind Wellness ' + read('wellness');
      return '<div class="index ' + (opts.size || '') + '" role="img" aria-label="' + HV.esc(aria) + '">' +
        '<svg viewBox="0 0 ' + W + ' ' + H + '" style="aspect-ratio:' + W + '/' + H + '" aria-hidden="true">' +
          grid + axes +
          (opts.ghost ? '<polygon class="ighost" points="' + poly(opts.ghost) + '"/>' : '') +
          '<polygon class="ishape" points="' + poly(vals) + '"/>' +
          dots + labels +
        '</svg>' +
        (opts.headline || '') +
        '</div>';
    },

    /* ── SIGNATURE: the concentric quadrilateral ─────────────────────────
       Three nested diamonds, one per tracked signal, each drawn round its
       own perimeter to its own percentage. Samsung stacks three hearts and
       lets colour do the telling; the same reading in HAALVING's geometry
       is the Index's diamond, repeated inward — so the day's movement and
       the cycle's balance are visibly the same instrument at two scales.
         rings  [{pct, color, label}] — OUTERMOST FIRST, 1–3 of them
         opts   { size: 'sm' drops the caption entirely,
                  cap: replaces the closed-count caption — a single-ring page
                       has nothing to count, so it says what it measured }
       `color` is a CSS custom-property name, as everywhere else in the kit.
       Each diamond is a <path> carrying pathLength="100", so the dash that
       draws the progress is just the percentage — no perimeter arithmetic,
       and the band radii stay free to change. */
    quad: (rings, opts) => {
      opts = opts || {};
      /* three radii and one stroke, chosen together: the gap between bands
         has to stay wider than the stroke or the rings read as one mass —
         especially at 34px in the day strip, where the same geometry is
         asked to survive a 5× reduction. */
      const R = [46, 32, 18];                              // outermost first
      const n = x => Number(x.toFixed(2));
      /* the diamond, opened at the top vertex and walked clockwise — the
         same origin and direction as the dial's arc, so a half-drawn ring
         here and a half-turned dial there mean the same thing */
      const dia = r => 'M50 ' + n(50 - r) + 'L' + n(50 + r) + ' 50L50 ' +
        n(50 + r) + 'L' + n(50 - r) + ' 50Z';

      let g = '';
      rings.slice(0, 3).forEach((s, i) => {
        const p = Math.max(0, Math.min(100, Number(s.pct) || 0));
        const d = dia(R[i]);
        g += '<path class="qtrack" d="' + d + '"/>' +
          '<path class="qfill" d="' + d + '" pathLength="100"' +
          ' style="--qp:' + n(p) + (s.color ? '; --qc:var(--' + s.color + ')' : '') + '"/>';
      });

      const closed = rings.filter(s => (Number(s.pct) || 0) >= 100).length;
      const aria = rings.map(s => s.label + ' ' + Math.round(Number(s.pct) || 0) + '%').join(', ');
      /* the count sits UNDER the shape, as the dial's caption does — a diamond
         has almost no room at its centre once the innermost band is drawn, and
         a number crushed between two hairlines is not a reading */
      return '<span class="quad ' + (opts.size || '') + '" role="img" aria-label="' + HV.esc(aria) + '">' +
        '<svg viewBox="0 0 100 100" aria-hidden="true">' + g + '</svg>' +
        (opts.size === 'sm' ? '' : '<span class="qc">' + (opts.cap ||
          '<b class="num">' + closed + '</b> of ' + rings.length + ' rings closed') + '</span>') +
        '</span>';
    },
  };

  /* ── tracker data sources ────────────────────────────────────────────
     Every tracker read/write goes through this seam. Today the only
     sources are the demo store ('manual' taps and 'phone'-seeded values);
     when the app ships inside a native shell, Health Connect registers
     behind the same keys and no screen changes. */
  /* minutes → the same "6 h 40 m" voice sleep already speaks in */
  HV.fmtMins = m => {
    m = Math.max(0, Math.round(m || 0));
    return m < 60 ? m + ' m' : Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) + ' m' : '');
  };

  /* count-up for a numeral that is the page's subject; instant under reduced motion */
  HV.countUp = function (el, to, opts) {
    opts = opts || {};
    to = Number(to) || 0;
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = to.toLocaleString('en-IN'); return;
    }
    const from = Number(opts.from) || 0, dur = Number(opts.dur) || 700, t0 = performance.now();
    (function tick(t) {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(from + (to - from) * e).toLocaleString('en-IN');
      if (p < 1) requestAnimationFrame(tick);
    })(t0);
  };

  HV.trackers = {
    read(key) {
      const c = HV.myClient();
      if (!c) return null;
      const t = c.trackers;
      const wk = t.week || {};
      const pct = (v, target) => (target ? Math.min(100, Math.round(v / target * 100)) : 0);
      /* week = the seeded prior days (20 in the demo) plus today's live value */
      const week = (arr, today) => (arr || Array(20).fill(0)).concat([today]);
      switch (key) {
        case 'steps':    return { value: t.steps, target: t.stepsTarget, pct: pct(t.steps, t.stepsTarget),
                                  display: t.steps.toLocaleString('en-IN'), source: 'phone',
                                  week: week(wk.steps, t.steps) };
        /* the other two thirds of the day's movement — minutes on your feet
           and the calories that movement alone burned (never the BMR) */
        case 'active':   return { value: t.activeMins, target: t.activeTarget, pct: pct(t.activeMins, t.activeTarget),
                                  display: HV.fmtMins(t.activeMins), source: 'phone',
                                  week: week(wk.active, t.activeMins) };
        case 'actCal':   return { value: t.actCal, target: t.actCalTarget, pct: pct(t.actCal, t.actCalTarget),
                                  display: t.actCal.toLocaleString('en-IN'), source: 'phone',
                                  week: week(wk.actCal, t.actCal) };
        case 'water':    return { value: t.waterDone, target: t.waterTarget, pct: pct(t.waterDone, t.waterTarget),
                                  display: t.waterDone + ' / ' + t.waterTarget, source: 'manual',
                                  week: week(wk.water, t.waterDone) };
        case 'sleep':    return { value: t.sleepPct, target: 100, pct: t.sleepPct || 0,
                                  display: t.sleep, source: 'phone',
                                  week: week(wk.sleepPct, t.sleepPct) };
        /* screen time inverts the instrument: the target is a ceiling, not a
           goal — the calibration line is the level you stay under */
        case 'screen':   return { value: t.screenMins, target: t.screenTarget, pct: pct(t.screenMins, t.screenTarget),
                                  display: HV.fmtMins(t.screenMins), source: 'phone',
                                  week: week(wk.screen, t.screenMins) };
        case 'meals':    return { value: t.mealsLogged, target: t.mealsTarget, pct: pct(t.mealsLogged, t.mealsTarget),
                                  display: t.mealsLogged + ' / ' + t.mealsTarget, source: 'manual' };
        default:         return null;
      }
    },
    /* A logged glass has a time, not just a tally — the Water page prints
       "Glass 6 · 18:45", so the count and the log have to move together or
       the page contradicts itself. One writer keeps them in step: growing
       the count stamps now, shrinking it drops the most recent stamps. */
    _logWater(t) {
      if (!Array.isArray(t.waterLog)) t.waterLog = [];
      while (t.waterLog.length < t.waterDone) {
        const d = new Date();
        t.waterLog.push(String(d.getHours()).padStart(2, '0') + ':' +
          String(d.getMinutes()).padStart(2, '0'));
      }
      if (t.waterLog.length > t.waterDone) t.waterLog.length = t.waterDone;
    },
    /* manual add for tap-loggable trackers; clamped, persisted */
    add(key, amount) {
      const c = HV.myClient();
      if (!c) return null;
      const t = c.trackers;
      if (key === 'water') { t.waterDone = Math.min(t.waterTarget, t.waterDone + amount); HV.trackers._logWater(t); }
      else return null;
      HV.save();
      return HV.trackers.read(key);
    },
    /* absolute set — the water glass dots write a count directly.
       'sleep' takes {bed, wake} (HH:MM strings) from the quick-add sheet
       (TJ, 9 Aug): night span is computed across midnight, the display
       string matches the seed's '6 h 40 m' voice, the score reads against
       an 8-hour need, and the stages are re-cut so their sum equals the
       bed→wake span EXACTLY — the sleep page presents stages as the night
       itself, so a stage total that disagrees with time in bed is a lie. */
    set(key, value) {
      const c = HV.myClient();
      if (!c) return null;
      const t = c.trackers;
      if (key === 'water') { t.waterDone = Math.max(0, Math.min(t.waterTarget, value)); HV.trackers._logWater(t); }
      else if (key === 'sleep') {
        const mins = s => { const p = String(s || '').split(':'); return (+p[0] || 0) * 60 + (+p[1] || 0); };
        const span = (mins(value.wake) - mins(value.bed) + 1440) % 1440;
        if (!span) return null;
        t.bed = value.bed; t.wake = value.wake;
        t.sleep = HV.fmtMins(span);
        t.sleepPct = Math.min(100, Math.round(span / 480 * 100));
        /* keep the client's own night shape when we have one; else a
           typical adult cut. light absorbs rounding so the sum is exact. */
        const st = t.stages || {};
        const tot = (st.deep || 0) + (st.rem || 0) + (st.light || 0) + (st.awake || 0);
        const p = tot > 0
          ? { deep: st.deep / tot, rem: st.rem / tot, awake: st.awake / tot }
          : { deep: 0.145, rem: 0.19, awake: 0.055 };
        const deep = Math.round(span * p.deep), rem = Math.round(span * p.rem);
        const awake = Math.round(span * p.awake);
        t.stages = { deep: deep, rem: rem, light: Math.max(0, span - deep - rem - awake), awake: awake };
      }
      else return null;
      HV.save();
      return HV.trackers.read(key);
    },
  };

  /* ── the level-up model ──────────────────────────────────────────────
     One place computes what qualifies each pillar for its next level, so
     My Plan and Today read from the same sheet. Sources: cultureCriteria
     (diet checklist docx), bodyCriteria (fitness/yoga checklist PDF), and
     the wellness house rules in the level book. Row `met`: true = ticked,
     false = still to do, null = your team reads it at the level review. */
  HV.levelup = function (c, key) {
    if (!c || c.observation || !c.sessions) return null;
    const s = HV.store;
    const lvl = (c.levels && c.levels[key]) || 1;
    const track = c.track || 'sedentary';
    const rows = [];
    let goals = [], note = '';

    if (key === 'culture') {
      const crit = s.cultureCriteria;
      const tr = crit && (crit.tracks[track] || crit.tracks.sedentary);
      const def = tr ? (tr.levels[lvl] || {}) : {};
      goals = def.goals || [];
      (crit ? crit.gates : []).forEach(g => {
        if (g.key === 'photos') {
          const ph = c.culturePhotos;
          rows.push({ label: g.label, small: ph.uploaded + ' of ' + ph.of + ' photos · min ' + ph.min, met: ph.uploaded >= ph.min });
        } else if (g.key === 'diet') {
          rows.push({ label: g.label, small: (c.compliance == null ? '—' : c.compliance + '%') + ' · target ' + g.target, met: c.compliance != null && c.compliance >= 80 });
        } else {
          rows.push({ label: g.label, small: 'target ' + g.target, met: null });
        }
      });
      note = 'Tick all five gates by day 9 and Nutrition moves up at your review — your care team confirms it together.';
    } else if (key === 'fitness' || key === 'yoga') {
      const crit = s.bodyCriteria;
      const tr = crit && (crit.tracks[track] || crit.tracks.sedentary);
      goals = tr ? (tr.levels[lvl] || []) : [];
      const sess = c.sessions[key];
      const bar = key === 'fitness' ? 4 : sess.target;   /* SOP: min 4 of 5 fitness; every yoga session */
      const cancelled = sess.cancelled || 0;
      rows.push({ label: 'Sessions this cycle', small: sess.done + ' of ' + sess.target + ' · bar is ' + crit.sessionBars[key], met: sess.done >= bar });
      /* the paper checklist records "Number Cancellations" without a bar; the
         ≤1 tick here is the app-side SOP default, and the team still owns the
         call at review — same standing as sessionBars above */
      rows.push({ label: 'Cancellations kept low', small: cancelled + ' cancelled so far', met: cancelled <= 1 });
      rows.push({ label: 'Chart practised as written', small: 'your trainer confirms at review', met: null });
      rows.push({ label: 'Level goals achieved', small: 'target ' + crit.bar, met: null });
      note = 'Reach 75% of the level goals and ' + HV.PILLARS[key].name + ' moves up at the ' + HV.copy.reviewWord() + ' review.';
    } else if (key === 'wellness') {
      const w = (s.program && s.program.wellness) ? s.program.wellness[lvl] : null;
      const mind = c.sessions.mind;
      rows.push({ label: 'Mind session attended', small: mind.done + ' of ' + mind.target + ' this cycle', met: mind.done >= mind.target });
      if (w) {
        rows.push({ label: 'Sleep in the 7–8 h band', small: 'last night ' + (c.trackers.sleep || '—'), met: null });
        rows.push({ label: 'Screen time within your cap', small: 'level cap ' + w.screen, met: null });
        rows.push({ label: 'Daily practice held', small: w.practice, met: null });
      }
      note = 'Your team reads the rhythm, not one night — held steady, Mind Wellness moves at the ' + HV.copy.reviewWord() + ' review.';
    } else return null;

    return {
      level: lvl, track,
      /* the label comes from the category list, full stop. It used to be read
         from bodyCriteria while the goals beside it came from cultureCriteria,
         so the two could disagree on the client's own card. */
      trackLabel: key === 'wellness' ? 'Daily practice' : HV.trackLabel(track),
      rows, goals, note,
      ticked: rows.filter(r => r.met === true).length,
      total: rows.length,
    };
  };

  HV.toast = function (msg) {
    const root = document.getElementById('toast-root');
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    root.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  };

  /* every dialog owns the keyboard while open: focus moves in, Tab cannot
     leave, Escape closes, and the trigger gets the keyboard back after.
     Views may still refine focus in onMount — it runs last, so it wins. */
  let sheetReturnFocus = null;
  let sheetKeyHandler = null;
  const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
  HV.sheet = function (innerHtml, onMount, cls) {
    const root = document.getElementById('overlay-root');
    sheetReturnFocus = document.activeElement;
    root.innerHTML = '<div class="overlay"><div class="sheet' + (cls ? ' ' + cls : '') + '" role="dialog" aria-modal="true">' + innerHtml + '</div></div>';
    const ov = root.querySelector('.overlay');
    const sheet = root.querySelector('.sheet');
    ov.addEventListener('click', e => { if (e.target === ov) HV.closeSheet(); });
    const title = sheet.querySelector('.h1');
    if (title) { if (!title.id) title.id = 'sheet-title'; sheet.setAttribute('aria-labelledby', title.id); }
    /* document-level, not overlay-level: a view may rewrite the sheet's own
       HTML (the task pager does) and drop focus to <body> — Escape and Tab
       must keep working from there, and Tab pulls focus back inside */
    if (sheetKeyHandler) document.removeEventListener('keydown', sheetKeyHandler);
    sheetKeyHandler = e => {
      if (e.key === 'Escape') { HV.closeSheet(); return; }
      if (e.key !== 'Tab') return;
      const f = sheet.querySelectorAll(FOCUSABLE);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      const out = !sheet.contains(document.activeElement);
      if (e.shiftKey && (out || document.activeElement === first)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (out || document.activeElement === last)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', sheetKeyHandler);
    const first = sheet.querySelector(FOCUSABLE);
    if (first) first.focus();
    else { sheet.setAttribute('tabindex', '-1'); sheet.focus(); }
    if (onMount) onMount(sheet);
  };
  HV.closeSheet = function () {
    if (sheetKeyHandler) { document.removeEventListener('keydown', sheetKeyHandler); sheetKeyHandler = null; }
    document.getElementById('overlay-root').innerHTML = '';
    if (sheetReturnFocus && document.contains(sheetReturnFocus)) sheetReturnFocus.focus();
    sheetReturnFocus = null;
  };

  /* ---------------- the morning film ----------------
     Think of it as a cinema. The LIBRARY is store.catalog.motivation, authored
     in the console's Catalog. The SCHEDULE is the 11-day template — every day
     carries one 'Morning film' slot. The PROJECTIONIST is HV.motivationFor:
     given a client, it works out which reel screens for them today. The
     AUDITORIUM is the full-bleed overlay below, and when the lights come up the
     play mark stays in Today's hero band like a poster in the lobby.

     'motivation' is a slot KIND, not a fifth pillar — HV.PILLARS stays at four
     (the 30 Jul naming decision), and every console slot helper already falls
     back gracefully for a key it doesn't recognise. */

  /* A YouTube id out of whatever was pasted: a bare id, a watch URL, a youtu.be
     short link or a /shorts/ link. Anything else — including '' — returns null,
     which is the signal to fall back to the house film. */
  function ytId(ref) {
    const s = String(ref || '').trim();
    if (!s) return null;
    if (/^[\w-]{11}$/.test(s)) return s;
    const m = /(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([\w-]{11})/.exec(s);
    return m ? m[1] : null;
  }

  /* Which reel screens for this client today.
       1. the coach's override for this exact day, if there is one
       2. the assigned template's day
       3. walk the library by cycle+day — so the nine demo personas with no
          assigned plan still have a film every morning
     Returns the catalogue item, or null only when the library itself is empty. */
  /* ---- what one pillar prescribes on one day of this client's cycle ----
     The single place that resolves an assignment: the coach's day override
     wins, else the assigned template's day, else nothing. Every reader of a
     client's programme goes through here, so "what is on day 3" can only have
     one answer. Returns [] for a pillar with no template assigned, which is a
     real and ordinary state — a pillar simply does not run for this client. */
  HV.assignment = function (client, pillar) {
    return ((HV.store.clientPlans || {})[client && client.id] || {})[pillar] || null;
  };
  HV.slotsFor = function (client, pillar, day) {
    const a = HV.assignment(client, pillar);
    if (!a) return [];
    const ov = (a.overrides || {})[day];
    if (ov && ov.slots) return ov.slots;
    const t = (HV.store.templates || []).find(x => x.id === a.templateId);
    return (t && t.days && t.days[day] && t.days[day].slots) || [];
  };

  HV.motivationFor = function (client) {
    const lib = (HV.store.catalog && HV.store.catalog.motivation) || [];
    if (!client || !lib.length) return null;
    const cy = client.cycle || 1;
    const d = client.day || 1;
    const slot = HV.slotsFor(client, 'motivation', d)[0];
    const id = HV.optId(slot && slot.options && slot.options[0] && slot.options[0][0]);
    const it = id ? lib.find(x => x.id === id) : null;
    /* a film deleted from the library but still named in a template falls
       through to the walk rather than emptying the morning */
    if (it) return it;
    /* no Motivation template assigned — the nine demo personas still get a
       film every morning, walked so no two days of a cycle repeat */
    return lib[((cy - 1) * 3 + (d - 1)) % lib.length] || null;
  };

  /* the lobby poster: YouTube's silhouette in HAALVING's voice — a brand-fill
     squircle with a white triangle. Brand teal is not a pillar colour, so §2 of
     the colour law is untouched. */
  const FILM_MARK =
    '<svg viewBox="0 0 30 21" aria-hidden="true">' +
      '<rect x="0.6" y="0.6" width="28.8" height="19.8" rx="6.2"/>' +
      '<path class="tri" d="M12 6.3 19.4 10.5 12 14.7Z"/>' +
    '</svg>';

  let filmKeyHandler = null;
  let filmReturnFocus = null;

  function closeFilm(collapseTo) {
    const root = document.getElementById('film-root');
    if (!root || !root.firstChild) return;
    if (filmKeyHandler) { document.removeEventListener('keydown', filmKeyHandler); filmKeyHandler = null; }
    const box = root.querySelector('.film');
    /* the shrink: measure the poster still on the page, then move the whole
       auditorium onto it. A client who never sees this happen has to hunt for
       where the film went — so the animation is the explanation. */
    const mark = collapseTo && document.contains(collapseTo) ? collapseTo : document.querySelector('.filmmark');
    if (box && mark) {
      const a = box.getBoundingClientRect();
      const b = mark.getBoundingClientRect();
      const s = Math.max(b.width / a.width, 0.04);
      box.style.transformOrigin = 'top left';
      box.style.transform = 'translate(' + (b.left - a.left) + 'px,' + (b.top - a.top) + 'px) scale(' + s + ')';
      box.style.opacity = '0';
    } else if (box) {
      box.style.opacity = '0';
    }
    /* the iframe keeps playing audio until it leaves the document, so the
       teardown is on a timer, not on transitionend — which never fires if the
       element was never painted */
    window.setTimeout(() => { root.innerHTML = ''; }, box ? 320 : 0);
    if (filmReturnFocus && document.contains(filmReturnFocus)) filmReturnFocus.focus();
    filmReturnFocus = null;
  }

  /* Open the auditorium. `fromEl` is the poster it should shrink back onto. */
  function openFilm(client, item, fromEl) {
    if (!item) return;
    let root = document.getElementById('film-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'film-root';
      document.body.appendChild(root);
    }
    /* stamped the moment it opens, never when it ends — stamp on 'ended' and a
       refresh mid-film replays it forever */
    HV.store.motSeen = HV.store.motSeen || {};
    if (HV.store.motSeen[client.id] !== HV.todayISO()) {
      HV.store.motSeen[client.id] = HV.todayISO();
      HV.save();
    }
    filmReturnFocus = document.activeElement;

    const media = item.media || {};
    const id = media.kind === 'image' ? null : ytId(media.ref);
    let stage;
    if (media.kind === 'image' && media.ref) {
      stage = '<img src="' + HV.esc(media.ref) + '" alt="' + HV.esc(item.name) + '">';
    } else if (id) {
      /* enablejsapi lets the frame tell us when the film ends; mute is not a
         choice — no browser autoplays audio without a gesture first */
      const origin = location.origin && location.origin !== 'null'
        ? '&origin=' + encodeURIComponent(location.origin) : '';
      stage = '<iframe src="https://www.youtube.com/embed/' + HV.esc(id) +
        '?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1&enablejsapi=1' + origin +
        '" title="' + HV.esc(item.name) + '" allow="autoplay; encrypted-media" allowfullscreen></iframe>';
    } else {
      /* no link yet — the house film stands in, cropped to portrait, so every
         day of the demo has something to play */
      stage = '<video autoplay muted playsinline poster="media/welcome.jpg" src="media/welcome.mp4"></video>';
    }

    root.innerHTML =
      '<div class="film" role="dialog" aria-modal="true" aria-label="Today’s film">' +
        '<div class="film-stage">' + stage + '</div>' +
        '<button class="film-x" aria-label="Close today’s film">' + ICONS.x + '</button>' +
        (media.kind === 'image' ? '' : '<button class="film-sound">' + ICONS.sound + 'Tap for sound</button>') +
        '<div class="film-foot">' +
          '<div class="kicker">TODAY’S FILM</div>' +
          '<b>' + HV.esc(item.name) + '</b>' +
          (item.instructions ? '<p>' + HV.esc(item.instructions) + '</p>' : '') +
        '</div>' +
      '</div>';

    const box = root.querySelector('.film');
    const xBtn = root.querySelector('.film-x');
    const sound = root.querySelector('.film-sound');
    const frame = root.querySelector('iframe');
    const vid = root.querySelector('video');
    const done = () => closeFilm(fromEl);

    xBtn.addEventListener('click', done);
    if (vid) vid.addEventListener('ended', done);

    /* the YouTube frame answers only in postMessage. We ask it to report state
       changes; state 0 is 'ended'. If the answer never arrives — offline, an
       extension eating the frame — the ✕ is still there and nothing is stuck. */
    let ytMsg = null;
    if (frame) {
      const post = msg => { try { frame.contentWindow.postMessage(JSON.stringify(msg), '*'); } catch (e) { /* frame not ready */ } };
      frame.addEventListener('load', () => post({ event: 'listening', id: 1, channel: 'widget' }));
      ytMsg = e => {
        /* only the frame we opened may speak — and e.origin is 'null' for a
           sandboxed sender, which is not a URL and would throw */
        if (!/^https:\/\/(www\.)?youtube(-nocookie)?\.com$/.test(e.origin)) return;
        let d; try { d = JSON.parse(e.data); } catch (err) { return; }
        if (d && d.info && d.info.playerState === 0) done();
      };
      window.addEventListener('message', ytMsg);
      if (sound) sound.addEventListener('click', () => {
        post({ event: 'command', func: 'unMute', args: [] });
        sound.remove();
      });
    } else if (sound) {
      sound.addEventListener('click', () => { if (vid) vid.muted = false; sound.remove(); });
    }

    filmKeyHandler = e => {
      if (e.key === 'Escape') { done(); return; }
      if (e.key !== 'Tab') return;
      const f = box.querySelectorAll(FOCUSABLE);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      const out = !box.contains(document.activeElement);
      if (e.shiftKey && (out || document.activeElement === first)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (out || document.activeElement === last)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', filmKeyHandler);
    xBtn.focus();

    /* one listener for the whole life of the overlay, dropped with it */
    const off = () => {
      if (ytMsg) window.removeEventListener('message', ytMsg);
      window.removeEventListener('hashchange', off);
    };
    window.addEventListener('hashchange', off);
  }

  /* the overlay must never outlive its page: HV.refresh() repaints the view
     underneath it (which is fine and wanted), but leaving Today is an exit */
  window.addEventListener('hashchange', () => closeFilm());

  HV.film = {
    for: HV.motivationFor,
    ytId: ytId,
    /* has this client already had today's film? */
    seen: c => !!c && (HV.store.motSeen || {})[c.id] === HV.todayISO(),
    /* the poster, for the hero band's right seat */
    mark: item => !item ? '' :
      '<button class="filmmark" data-film="1" aria-label="Play today’s film — ' +
      HV.esc(item.name) + '">' + FILM_MARK + '</button>',
    open: openFilm,
    close: closeFilm,
  };

  /* ---------------- the task catalogue ----------------
     Every task card row and its sheet page, built from the same sources the
     views already read: the meal plan for Nutrition, the level book for the
     other three. Today, My Plan and the plan sheets all render from THIS —
     three surfaces, one builder, so they cannot drift.
     Each item: { pillar, art, title, sub (HTML), body (HTML) } plus, for
     Nutrition, { part, slot, photo } so the day-part bands and the Logged pill
     stay the caller's decision (only Today knows whether it is today).

     `day` — WHICH day of the cycle to build. It defaults to the client's own
     day, which is what every caller used to get implicitly. Two reasons it now
     has to be sayable:

     1. The three session pillars read the ASSIGNED TEMPLATE first (below), and
        a template prescribes per day — so a day-blind builder could only ever
        show one day's exercises for the whole cycle. Today already lets a
        client browse to #/today/3 and shows day 3's sessions; its task cards
        came from the day-blind level book, so day 3 listed today's exercises.
     2. THE TRAP: every surface calls this TWICE — once to draw rows through
        HV.ui.taskRow(item, trailing, gid, index), once to attach taps through
        HV.ui.wireTasks(root, HV.tasks(...)). The two calls must return arrays
        of identical order and length or data-topen="fitness:2" opens the wrong
        exercise. client-plan.js's session sheet can be opened for ANY day, so
        the day is threaded to both calls and never defaulted twice. */
  HV.tasks = function (client, day) {
    const lvl = k => (client.levels && client.levels[k]) || 1;
    const track = client.track || 'sedentary';
    const onDay = day || client.day;
    const book = k => {
      const b = HV.store.program && HV.store.program[k];
      if (!b) return null;
      if (k === 'wellness') return b[lvl(k)] || null;
      const t = b[track] || b.sedentary;
      return t ? (t[lvl(k)] || null) : null;
    };
    const vid = name => 'https://www.youtube.com/results?search_query=' +
      encodeURIComponent(name + ' exercise proper form technique');
    const chip = name => '<a class="chip vid" href="' + vid(name) + '" target="_blank" rel="noopener">' +
      HV.ui.icon('play') + HV.esc(name) + '</a>';
    const ul = arr => '<ul>' + arr.map(t => '<li>' + t + '</li>').join('') + '</ul>';
    const out = { culture: [], fitness: [], yoga: [], wellness: [] };

    /* ---- the prescribed items for one session pillar on one day ----
       The template names WHAT; the catalogue item carries the picture, the
       film and the instructions that reach the client. Returns [] when this
       pillar does not run today, or when no template is assigned at all —
       both ordinary states, and the caller falls back to the level book.

       Only the FIRST option group becomes tasks. That is the rule HV.slotSum
       and HV.doseOf already keep: alternatives are alternatives, not extra
       work. The rest become the sheet's "Or instead" page. */
    const prescribed = (pillar) => {
      const spec = HV.specFor(pillar);
      const lib = (HV.store.catalog && HV.store.catalog[pillar]) || [];
      /* the client's own numbers for this pillar, resolved once — HV.doseOf
         puts them above the plan's own days, the way a.time beats slot.time */
      const asg = HV.assignment(client, pillar);
      const rows = [];
      HV.slotsFor(client, pillar, onDay).forEach(slot => {
        const groups = slot.options || [];
        /* an id naming an item that has since been deleted is skipped, never
           pushed as undefined — the same forgiveness HV.motivationFor keeps */
        const first = (groups[0] || []).map(e => lib.filter(x => x.id === HV.optId(e))[0]).filter(Boolean);
        if (!first.length) return;
        /* the dose, in this pillar's own language — sets/reps/weight for
           fitness, rounds and minutes for yoga, minutes for a practice.
           Weight and focus are text and fall through to the bare default:
           "5 kg each" already carries its own unit. */
        const dose = spec.fields.map(f => {
          const v = HV.doseOf(slot, pillar, f.k, asg);
          if (v === undefined || v === '') return '';
          return f.k === 'sets' ? '<span class="num">' + HV.esc(String(v)) + '</span> sets'
            : f.k === 'reps' ? '<span class="num">' + HV.esc(String(v)) + '</span> reps'
            : f.k === 'count' ? '<span class="num">' + HV.esc(String(v)) + '</span> rounds'
            : f.k === 'rpe' ? 'RPE <span class="num">' + HV.esc(String(v)) + '</span>'
            : f.k === 'mins' ? '<span class="num">' + HV.esc(String(v)) + '</span> min'
            : HV.esc(String(v));
        }).filter(Boolean).join(' · ');
        const alts = groups.slice(1)
          .map(g => g.map(e => (lib.filter(x => x.id === HV.optId(e))[0] || {}).name).filter(Boolean).join(' + '))
          .filter(Boolean);

        first.forEach(it => {
          const med = HV.itemMedia(it);
          /* an item with no picture of its own still renders — the family art
             stands in rather than showing a broken image */
          const art = med.image || HV.ui.taskArtSrc(pillar, slot.label || it.name);
          const steps = String(it.instructions || '').split('\n')
            .map(s => s.trim()).filter(Boolean);
          const pages = [];
          /* the film and the first instruction, together — TJ's ask: the sheet
             "will contain the video along with text instructions". Only when
             there is something to show: an item with no film and no words
             would otherwise open on a blank page numbered 1/1. */
          if (med.video || steps.length) {
            pages.push({
              h: 'How to do it',
              html: HV.ui.videoHtml(med.video, it.name) +
                (steps.length ? '<p class="tstep">' + HV.esc(steps[0]) + '</p>' : ''),
            });
          }
          steps.slice(1).forEach((s, n) => pages.push({
            h: 'Step ' + (n + 2) + ' of ' + steps.length,
            html: '<p class="tstep">' + HV.esc(s) + '</p>',
          }));
          if (it.caution) pages.push({ h: 'Take care', html: '<p class="tstep">' + HV.esc(it.caution) + '</p>' });
          if (alts.length) pages.push({ h: 'Or instead', html: ul(alts.map(a => HV.esc(a))) });
          if (it.notes) pages.push({ h: 'Good to know', html: '<p class="tg-note">' + HV.esc(it.notes) + '</p>' });
          rows.push({
            pillar: pillar, art: art, title: it.name,
            /* the DOSE, not the slot's name. The session row directly above
               already says "Strength (bands), 6:00 am, with Vikram"; repeating
               it here put "Strength (bands)" under the words "Brisk walk
               intervals", which reads as a mistake. What the client needs from
               this line is how much of it to do. */
            sub: dose || HV.esc(slot.label || spec.slotWord),
            pages: pages,
          });
        });
      });
      return rows;
    };

    /* the assigned Nutrition template, falling back to mealPlans — this one
       line is what carries a coach's template onto the client's plate (F2) */
    const plan = HV.plateFor(client, onDay);
    if (plan) {
      const hourOf = t => {
        const m = /(\d+):(\d+)\s*(am|pm)/i.exec(t);
        return m ? (+m[1] % 12) + (/pm/i.test(m[3]) ? 12 : 0) : 0;
      };
      out.culture = plan.slots.map(s => {
        const h = hourOf(s.time);
        const yields = [s.kcal ? '<span class="num">' + s.kcal + '</span> kcal' : '',
          s.protein ? '<span class="num">' + s.protein + '</span> g protein' : ''].filter(Boolean).join(' · ');
        return {
          pillar: 'culture', slot: s.slot, photo: !!s.photo,
          part: h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening',
          /* the dish's own picture, with the day-part's family art standing in
             while a food is still being photographed */
          art: s.image || HV.ui.taskArtSrc('culture', s.slot),
          title: s.dish,
          sub: '<span class="num">' + HV.esc(s.time) + '</span> · ' + HV.esc(s.slot) +
            (yields ? ' · ' + yields : ''),
          pages: [
            /* one LINE is one step, the same contract the author sheet states
               and the other four libraries already keep — a recipe written as
               four lines was printing as one paragraph here */
            (s.video || s.how)
              ? { h: 'How it’s made', html: HV.ui.videoHtml(s.video, s.dish) +
                  String(s.how || '').split('\n').map(l => l.trim()).filter(Boolean)
                    .map(l => '<p class="tstep">' + HV.esc(l) + '</p>').join('') }
              : null,
            s.parts && s.parts.length
              ? { h: 'What goes in it', html: ul(s.parts.map(pt => '<b>' + HV.esc(pt.k) + '</b> — ' + HV.esc(pt.v))) }
              : null,
            s.note ? { h: 'Good to know', html: '<p class="tstep">' + HV.esc(s.note) + '</p>' } : null,
            s.swap ? { h: 'Or instead', html: '<p class="tstep">' + HV.esc(s.swap) + '</p>' } : null,
          ].filter(Boolean),
        };
      });
    }

    /* Fitness, Yoga and Mind Wellness: the assigned template's own items win,
       because those are the ones a coach chose and the ones carrying media.
       The level book stands in when this pillar does not run today, or when
       the client has no template assigned at all (Priya, still in her
       observation window) — and on the pillar plan pages, which describe a
       LEVEL rather than a day. Neither state is an error. */
    const fromTemplate = { fitness: prescribed('fitness'), yoga: prescribed('yoga'), wellness: prescribed('wellness') };

    const fb = book('fitness');
    if (fromTemplate.fitness.length) out.fitness = fromTemplate.fitness;
    else if (fb) {
      out.fitness = fb.home.sets.map(s => {
        const cues = (HV.howto && HV.howto[s.name]) ||
          (HV.howtoKind && HV.howtoKind[s.k.toLowerCase()]) || [];
        return {
          pillar: 'fitness',
          art: HV.ui.taskArtSrc('fitness', s.k),
          title: s.name,
          sub: HV.esc(s.k) + ' · <span class="num">' + HV.esc(s.dose) + '</span>',
          pages: [
            ...cues.map((c, n) => ({
              h: 'Step ' + (n + 1) + ' of ' + cues.length,
              html: '<p class="tstep">' + HV.esc(c) + '</p>',
            })),
            { h: 'At a glance',
              html: '<p class="tg-note">Part of your <span class="num">' + fb.home.mins +
                ' min</span> home block · ' + HV.esc(fb.rpe) + ' · intensity ' + HV.esc(String(fb.intensity)) + '</p>' +
                '<div class="vrow">' + chip(s.name) + '</div>' },
          ],
        };
      });
    }

    const yb = book('yoga');
    if (fromTemplate.yoga.length) out.yoga = fromTemplate.yoga;
    else if (yb) {
      out.yoga = yb.blocks.map(b => ({
        pillar: 'yoga',
        art: HV.ui.taskArtSrc('yoga', b.k),
        title: b.k,
        sub: '<span class="num">' + HV.esc(String(b.mins).replace(' of session', '')) +
          '</span> of a <span class="num">' + HV.esc(yb.dur) + '</span> session',
        pages: [
          { h: 'The practice', html: '<p class="tstep">' + HV.esc(b.v) + '</p>' },
          { h: 'Key poses this level', html: '<div class="vrow">' + yb.poses.map(chip).join('') + '</div>' },
          { h: 'What this level is for',
            html: '<p class="tg-note">' + HV.esc(yb.goal) + '</p><p class="tg-meta">' + HV.esc(yb.focus) + '</p>' },
        ],
      }));
    }

    const wb = book('wellness');
    if (fromTemplate.wellness.length) out.wellness = fromTemplate.wellness;
    else if (wb) {
      const dot = wb.practice.indexOf('·');
      const pName = dot > 0 ? wb.practice.slice(0, dot).trim() : wb.practice;
      const pDetail = dot > 0 ? wb.practice.slice(dot + 1).trim() : '';
      out.wellness = [{
        pillar: 'wellness',
        art: HV.ui.taskArtSrc('wellness', pName),
        title: pName,
        sub: pDetail ? HV.esc(pDetail) : 'Tonight',
        pages: [
          { h: 'Tonight', html: '<p class="tstep">Set the day down before you set yourself down — the practice is the bridge between the two.</p>' },
          { h: 'Alongside it, every night',
            html: ul(['Sleep <b>' + HV.esc(wb.sleep) + '</b> — the non-negotiable.',
              'Screens under <b>' + HV.esc(wb.screen) + '</b>, none in the hour before bed.']) },
        ],
      }];
    }
    return out;
  };

  /* the task sheet — TJ's Pilates-style detail (28 Jul): hero on the
     pillar's wash, the task named large, and ONE activity's detail divided
     into steps. The ‹ n/N › pager walks the steps of THIS activity only —
     it never moves on to the next activity (TJ's correction, 28 Jul eve).
     Fills the bottom 90% of the screen. */
  HV.taskSheet = function (item) {
    const pages = item.pages && item.pages.length ? item.pages
      : [{ h: '', html: '' }];
    let i = 0;
    const p = HV.PILLARS[item.pillar];
    const page = () => {
      const pg = pages[i];
      return '<div class="tsheet ' + (p ? p.cls : '') + '">' +
        '<div class="tsheet-hero"><img src="' + item.art + '" alt="" decoding="async">' +
        '<button class="tsheet-x" data-tclose aria-label="Close">' + HV.ui.icon('x') + '</button></div>' +
        '<div>' +
        '<div class="tsheet-title">' + HV.esc(item.title) + '</div>' +
        (item.sub ? '<div class="tsheet-sub">' + item.sub + '</div>' : '') + '</div>' +
        '<div class="tsheet-scroll">' +
        (pg.h ? '<div class="tsheet-h">' + HV.esc(pg.h) + '</div>' : '') +
        (pg.html || '') + '</div>' +
        '<div class="tsheet-nav">' +
        '<button class="pg" data-tprev' + (i === 0 ? ' disabled' : '') + ' aria-label="Previous step">' + HV.ui.icon('chevL') + '</button>' +
        '<span class="pgn num">' + (i + 1) + '/' + pages.length + '</span>' +
        '<button class="pg" data-tnext' + (i === pages.length - 1 ? ' disabled' : '') + ' aria-label="Next step">' + HV.ui.icon('chevR') + '</button>' +
        '<button class="btn" data-tclose>Close</button>' +
        '</div></div>';
    };
    HV.sheet(page(), sheet => {
      /* paging rebuilds the sheet's HTML, destroying the pressed button —
         hand keyboard focus back to its successor (or Close at either end) */
      const refocus = sel => {
        const b = sheet.querySelector(sel);
        (b && !b.disabled ? b : sheet.querySelector('.btn[data-tclose]')).focus();
      };
      const wire = () => {
        sheet.querySelectorAll('[data-tclose]').forEach(b => b.addEventListener('click', HV.closeSheet));
        sheet.querySelector('[data-tprev]').addEventListener('click', () => {
          if (i > 0) { i -= 1; sheet.innerHTML = page(); wire(); refocus('[data-tprev]'); }
        });
        sheet.querySelector('[data-tnext]').addEventListener('click', () => {
          if (i < pages.length - 1) { i += 1; sheet.innerHTML = page(); wire(); refocus('[data-tnext]'); }
        });
      };
      wire();
    }, 'tall');
  };

  /* mark: an ICONS name (preferred) — renders as a medallion. Any other
     string falls back to text so no call site can break. */
  HV.celebrate = function (mark, title, sub) {
    /* a route can change straight from an <a href="#/..."> inside an open
       sheet (bypassing HV.closeSheet), landing here with the sheet's DOM
       still live — close it the normal way first, so its keydown handler
       unbinds instead of outliving the node it was keyed to and trapping
       Tab against a detached sheet */
    HV.closeSheet();
    const root = document.getElementById('overlay-root');
    const face = ICONS[mark]
      ? '<div class="mark" aria-hidden="true">' + ICONS[mark] + '</div>'
      : '<div class="big">' + HV.esc(mark) + '</div>';
    sheetReturnFocus = document.activeElement;
    root.innerHTML = '<div class="celebrate" role="dialog" aria-modal="true" aria-label="' + HV.esc(title) + '"><div class="inner">' + face + '<div class="h1">' + HV.esc(title) + '</div><p class="sub">' + HV.esc(sub) + '</p><button class="btn" id="cel-ok" style="margin-top:var(--s4)">Continue</button></div></div>';
    const ok = root.querySelector('#cel-ok');
    ok.addEventListener('click', HV.closeSheet);
    root.querySelector('.celebrate').addEventListener('keydown', e => { if (e.key === 'Escape') HV.closeSheet(); });
    ok.focus();
  };

  /* relative demo-time helper: minutes ago label */
  HV.ago = function (mins) {
    if (mins < 60) return mins + ' min ago';
    const h = Math.floor(mins / 60);
    return h + ' h ' + (mins % 60 ? (mins % 60) + ' m ' : '') + 'ago';
  };

  /* ── real-clock helpers ──────────────────────────────────────────────
     The demo mostly runs on relative time ("mins ago"); the leave board,
     the SLA ladder and the celebration strip need the actual clock. One
     seam (HV.now) so a test can freeze it. */
  HV.now = function () { return Date.now(); };
  const pad2 = n => String(n).padStart(2, '0');
  const isoOf = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  HV.todayISO = function () { return isoOf(new Date()); };
  HV.dateAdd = function (iso, days) {
    const p = String(iso).split('-');
    return isoOf(new Date(+p[0], +p[1] - 1, +p[2] + (days || 0)));
  };
  HV.minsSince = function (ts) { return Math.floor((HV.now() - ts) / 60000); };
  /* minutes-of-day → 'h:mm am' — the clock voice the schedule already speaks */
  HV.fmtTime = function (min) {
    min = ((Math.round(min) % 1440) + 1440) % 1440;
    const h = Math.floor(min / 60), mm = min % 60;
    return (h % 12 || 12) + ':' + pad2(mm) + (h < 12 ? ' am' : ' pm');
  };
  /* 'HH:MM' → minutes-of-day, or null when it is not a clock. The per-client
     session time is stored the way <input type="time"> hands it over, and this
     is what lets it print in the same voice a booking speaks. */
  HV.hmToMin = function (hm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || ''));
    if (!m) return null;
    const mins = +m[1] * 60 + +m[2];
    return mins >= 0 && mins < 1440 ? mins : null;
  };
  /* an 'HH:MM' IST base time restated in a client's own timezone offset */
  HV.tzShift = function (hm, tzo) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || ''));
    if (!m) return String(hm || '');
    const mins = (+m[1] * 60 + +m[2]) + Math.round(((tzo == null ? 5.5 : tzo) - 5.5) * 60);
    return HV.fmtTime(mins);
  };

  /* ── departments, covers, and the cover-aware seat resolver ────────── */
  HV.DEPTS = { dietitian: 'Nutrition', fitness: 'Fitness', yoga: 'Yoga', mind: 'Mind Wellness' };
  /* the bench: active staff in the dept role, plus its HoD when one exists */
  HV.deptMembers = function (dept) {
    return HV.store.users.filter(u => !u.inactive &&
      (u.role === dept || (u.role === 'hod' && u.dept === dept)));
  };
  HV.hodOf = function (dept) {
    return HV.store.users.find(u => u.role === 'hod' && u.dept === dept && !u.inactive) || null;
  };
  /* the podCover record for a seat when today falls inside its window —
     covers expire by date alone, so approved leave needs no cleanup job */
  HV.coverActive = function (c, roleKey) {
    const pc = c && c.podCover && c.podCover[roleKey];
    if (!pc) return null;
    const t = HV.todayISO();
    return (pc.from <= t && t <= pc.to) ? pc : null;
  };
  /* THE cover-aware resolver: who actually holds this seat today. Views that
     read c.pod[k] for the current responsible person should come through here. */
  HV.staffFor = function (clientOrId, roleKey) {
    const c = typeof clientOrId === 'string' ? HV.client(clientOrId) : clientOrId;
    if (!c) return HV.staff(null);
    const cov = HV.coverActive(c, roleKey);
    return HV.staff(cov ? cov.coverId : (c.pod || {})[roleKey]);
  };

  /* ── notices: the sweeps' outbox ─────────────────────────────────────
     kind ∈ sla | reminder | celebration | leave | task. The Home badge
     carries the unseen count (see HV.navCounts in data.js). */
  HV.notice = function (toId, kind, text, clientId) {
    const s = HV.store;
    s.notices = s.notices || [];
    s.noticeSeq = (s.noticeSeq || 0) + 1;
    const n = { id: 'nt-' + s.noticeSeq, toId: toId, ts: HV.now(), kind: kind, text: text, seen: false };
    if (clientId) n.clientId = clientId;
    s.notices.push(n);
    HV.save();
    return n;
  };
  HV.noticesFor = function (userId) {
    return (HV.store.notices || []).filter(n => n.toId === userId).sort((a, b) => b.ts - a.ts);
  };
  HV.seenNotices = function (userId) {
    let changed = false;
    (HV.store.notices || []).forEach(n => { if (n.toId === userId && !n.seen) { n.seen = true; changed = true; } });
    if (changed) HV.save();
  };

  /* ── the meal-reply SLA ladder ───────────────────────────────────────
     slaLeft is the single truth for "how long until this plate is late":
     minutes remaining against slaConfig.replyTargetMin, negative when past.
     null when no human rating is due (rated, observation, or no ts). */
  HV.slaLeft = function (meal) {
    if (!meal || meal.final || meal.ts == null) return null;
    const c = HV.client(meal.clientId);
    if (!c || c.observation) return null;
    const cfg = HV.store.slaConfig || { replyTargetMin: 15 };
    return cfg.replyTargetMin - HV.minsSince(meal.ts);
  };
  HV.slaSweep = function () {
    const s = HV.store;
    if (!s || !s.slaConfig) return;
    const cfg = s.slaConfig;
    let changed = false;
    (s.meals || []).forEach(m => {
      if (HV.slaLeft(m) == null) return;
      const elapsed = HV.minsSince(m.ts);
      const c = HV.client(m.clientId);
      /* nudge the seat that owes the reply — cover-aware, once per meal */
      if (elapsed >= cfg.notifyAfterMin && !m.slaNotified) {
        m.slaNotified = true; changed = true;
        const seat = HV.staffFor(c, 'dietitian');
        if (seat && !seat.ai) HV.notice(seat.id, 'sla',
          c.name + '’s ' + (m.slot || 'meal').toLowerCase() + ' is ' + elapsed +
          ' min unrated — target is ' + cfg.replyTargetMin + '.', m.clientId);
      }
      /* then escalate to the configured role — also once */
      if (elapsed >= cfg.notifyAfterMin + cfg.escalateAfterMin && !m.slaEscalated) {
        m.slaEscalated = true; changed = true;
        s.users.filter(u => u.role === cfg.escalateToRole && !u.inactive).forEach(u =>
          HV.notice(u.id, 'sla', 'Escalated: ' + c.name + '’s ' + (m.slot || 'meal').toLowerCase() +
            ' unrated for ' + elapsed + ' min.', m.clientId));
      }
    });
    if (changed) HV.save();
  };

  /* ── the two demo task extras ────────────────────────────────────────
     HV.store.tasks itself is seeded lazily by the Schedule view (the SOP
     week lives in that file), so these wait for it and land exactly once
     (autoLog guard): acceptance responses on the whole-team meeting, and a
     session ~2 h out for Vikram × Rajesh so the reminder ladder demos. */
  function seedTaskExtras() {
    const s = HV.store;
    if (!s || !s.tasks || !s.tasks.length) return;
    s.autoLog = s.autoLog || {};
    if (s.autoLog.taskExtras) return;
    s.autoLog.taskExtras = HV.now();
    const meet = s.tasks.find(t => t.kind === 'meeting' && (t.groups || []).includes('g-all'));
    if (meet) meet.responses = { 'u-lakshmi': 'accepted', 'u-meera': 'accepted' };
    const d = new Date();
    /* about two hours out, so the reminder ladder demos — but placed through
       the same engine as every other booking, so it lands inside Vikram's
       declared hours and never on top of a session he is already running.
       `from` aims at the two-hour mark; the engine takes the first slot at or
       after it and spills back through his day when the evening is full. */
    const aim = Math.floor((d.getHours() * 60 + d.getMinutes() + 120) / 15) * 15;
    const start = HV.firstFreeSlot('u-vikram', [0], 30, { from: aim });
    if (start == null) return;              /* he is off or booked solid today
                                               — the demo extra simply sits out */
    s.taskSeq = (s.taskSeq || 0) + 1;
    s.tasks.push({ id: 'tk-' + s.taskSeq, title: 'Form check-in', kind: 'session', pillar: 'fitness',
      clientId: 'c-rajesh', assignees: ['u-vikram'], groups: [], day: 0, start: start, dur: 30,
      recur: null, link: '', notes: 'Short form review ahead of tonight’s bands session.',
      exc: {}, done: {} });
    HV.save();
  }

  /* ── the two rooms the demo needs on arrival ─────────────────────────
     One session that FINISHED a little while ago, so Meera lands on a report
     she owes and Rajesh on a rating card he may ignore; and one running RIGHT
     NOW, so "Happening now" has a door to walk through. Both are placed
     against the clock at first boot rather than seeded at a fixed hour — a
     9 a.m. demo would otherwise show neither.

     Its own guard key, separate from taskExtras: these arrived later, and a
     store that already burned the first key must still get these. */
  function seedRoomExtras() {
    const s = HV.store;
    if (!s || !s.tasks || !s.tasks.length) return;
    s.autoLog = s.autoLog || {};
    if (s.autoLog.roomExtras) return;
    const d = new Date();
    const nowMin = d.getHours() * 60 + d.getMinutes();
    /* both grafts want a plausible working hour on either side of now */
    if (nowMin < 9 * 60 + 30 || nowMin > 21 * 60) return;
    s.autoLog.roomExtras = HV.now();

    /* The finished session is one of the client's OWN bookings, slid into the
       past — never a second booking for a pillar they already have today.
       HV.bookingFor answers with the FIRST booking it finds, so a duplicate
       would be invisible to the client's own Today card and the door on it
       would never open. Moving the occurrence is also what actually happens
       when a coach shifts a session, and exc[0] is exactly that write. */
    /* Both writes go through HV.conflicts, like every other writer in the
       app: nothing may put a person in a slot without asking first, and a
       demo graft is not exempt — a coach parked outside her declared hours
       is the exact defect the capacity engine exists to prevent. */
    const c = HV.client('c-rajesh');
    const mine = (s.tasks || []).filter(t =>
      t.kind === 'session' && t.clientId === 'c-rajesh' && HV.occursOn(t, 0));
    if (mine.length) {
      const t0 = mine[0];
      const occ = HV.occursOn(t0, 0);
      const dur = Math.min(occ.dur, 45);
      const endedStart = Math.floor((nowMin - 90) / 15) * 15;
      /* excepting the task itself, or it would clash with where it already is */
      if (endedStart > 0 &&
          !HV.conflicts(occ.assignees || [], 0, endedStart, dur, { exceptIds: [t0.id] }).length) {
        (t0.exc = t0.exc || {})[0] = { start: endedStart, dur: dur };
      }
    }
    /* and one CLIENT MEETING running right now — the room an admin is meant to
       be able to walk into whether or not anybody put them on it */
    const liveStart = Math.floor((nowMin - 10) / 15) * 15;
    const host = (c && c.pod && c.pod.opshead) || 'u-sureshk';
    if (liveStart > 0 && !HV.conflicts([host], 0, liveStart, 45).length) {
      s.taskSeq = (s.taskSeq || 0) + 1;
      s.tasks.push({ id: 'tk-' + s.taskSeq, title: 'Progress meeting · cycle ' + (c ? c.cycle : 3),
        kind: 'meeting', pillar: null, clientId: 'c-rajesh',
        assignees: [host], groups: [], day: 0, start: liveStart, dur: 45,
        recur: null, link: '', exc: {}, done: {},
        notes: 'Mid-cycle read: where the four pillars stand before the level review.' });
    }
    HV.clearCalCache && HV.clearCalCache();
    HV.save();
  }

  /* ── session reminders ───────────────────────────────────────────────
     Sessions on today's grid starting within the next two hours: the
     assigned coach gets a notice, and the client gets a reminder entry
     (store.clientReminders) their Today page can band. Once per task+day. */
  HV.reminderSweep = function () {
    seedTaskExtras();
    seedRoomExtras();
    const s = HV.store;
    if (!s || !s.tasks) return;
    const d = new Date();
    const nowMin = d.getHours() * 60 + d.getMinutes();
    const today = HV.todayISO();
    let changed = false;
    s.tasks.forEach(t => {
      if (t.kind !== 'session') return;
      /* rd-relative like the whole schedule: day 0 is today. This was a third
         private copy of the recurrence rule, and like the digest's it ignored
         per-day exceptions — so a CANCELLED session still reminded both the
         coach and the client, and a session moved to a new time reminded at
         the old one. HV.occursOn honours both, and occ.start is the time the
         session actually happens. */
      const occ = HV.occursOn(t, 0);
      if (!occ) return;
      const lead = occ.start - nowMin;
      if (lead <= 0 || lead > 120) return;
      t.reminded = t.reminded || {};
      if (t.reminded[today]) return;
      t.reminded[today] = HV.now();
      changed = true;
      /* occ, not t — a moved session must remind at the time it moved to */
      (t.assignees || []).forEach(uid => HV.notice(uid, 'reminder',
        (occ.title || 'Session') + ' at ' + HV.fmtTime(occ.start) + ' · in ' + lead + ' min.', t.clientId));
      /* the CLIENT half of the reminder is what the pad's "Session reminder"
         switch governs — the coach's own notice above is not the client's to
         turn off. Until now this sweep never consulted padAuto at all, so
         flipping that switch off reminded them anyway. */
      if (t.clientId && HV.autoOn(t.clientId, 'session')) {
        s.clientReminders = s.clientReminders || {};
        (s.clientReminders[t.clientId] = s.clientReminders[t.clientId] || [])
          .push({ taskId: t.id, start: occ.start, title: occ.title, ts: HV.now() });
      }
    });
    if (changed) HV.save();
  };

  /* ── the per-client automation switches ──────────────────────────────
     ONE generator, called from the two places that used to disagree. The
     seed built five rows and put a `key` on the weigh-in; the pad's own lazy
     defaults built four with NO key on anything — so a client promoted at
     runtime got no weigh-in row at all and could never switch off the one
     automation that actually ran.

     The KEY is the contract. HV.autoOn tests keys, never labels, so renaming
     a switch in one place can never quietly detach it from its engine. Row
     ids are derived from the key rather than sequenced, so the same client
     always regenerates the same ids.

     PURE, for the same reason HV.conflicts is: data.js calls this while it is
     BUILDING the seed, when HV.store is null and HV.seed is not yet assigned,
     so HV.shape() would throw. The caller hands its own shape in; every other
     caller gets the live one. */
  HV.defaultAutos = function (c, shape) {
    const sh = shape || HV.shape();
    const f = String(c.name || '').split(' ')[0];
    const row = (key, label, desc, on) =>
      ({ id: 'pa-' + c.id + '-' + key, key: key, label: label, desc: desc, on: on });
    /* observation (days 1–5) has no running cycle and no booked sessions —
       the Assistant only watches the collection rhythm */
    if (c.observation) return [
      row('photo', 'Meal-photo nudge', 'Ping ' + f + ' if no photo lands by 2 pm', true),
      row('silence', 'Silence alert', 'Flag the team after 48 h without a log', true),
    ];
    return [
      row('photo', 'Meal-photo nudge', 'Ping ' + f + ' if no photo lands by 2 pm', true),
      row('session', 'Session reminder', 'Remind ' + f + ' 2 h before every booked session', true),
      row('silence', 'Silence alert', 'Flag the team after 48 h without a log', true),
      row('weighin', 'Cycle weigh-in',
        'Ask ' + f + ' for a Day-' + (sh.reviewDay - 1) + ' weigh-in when none is logged', true),
      row('summary', 'Cycle summary draft',
        'Draft a Day-' + sh.meetingDay + ' progress note for your review', false),
      row('rating', 'Post-session rating ask',
        'Ask ' + f + ' for stars once a session has finished', true),
    ];
  };

  /* the ONE test every automation asks before it acts. Absent means ON — the
     same contract HV.announceOn keeps — so a client record added later needs
     no migration and a coach who has never opened the pad still gets the
     standing rules. */
  HV.autoOn = function (clientId, key) {
    const row = (((HV.store.padAuto || {})[clientId]) || []).find(a => a.key === key);
    return !row || row.on !== false;
  };

  /* ── client-side automation prompts, computed live ───────────────────
     Today renders these as cards; each rule guards itself on store state
     (here: no weigh-in logged this cycle) plus its padAuto switch. */
  HV.autoChecks = function (c) {
    const out = [];
    if (!c || c.observation) return out;
    const logged = (c.weightLog || []).some(w => w.cy === c.cycle);
    if ((c.day || 0) >= HV.reviewDay() - 1 && !logged && HV.autoOn(c.id, 'weighin')) {
      out.push({ key: 'weigh-in', title: 'Cycle weigh-in',
        body: 'Day ' + c.day + ' of the cycle and no weigh-in yet — a number today keeps the ' + HV.copy.reviewWord() + ' review honest.' });
    }
    return out;
  };

  /* ── who the house speaks as ─────────────────────────────────────────
     NEVER a literal 'haalving' id. HV.staff() signs any id it does not know
     as the AI pseudo-user, so a house account would put "AI Coach" on every
     automated message — a lie, and a breach of the rule that a Poorna client
     never hears the AI. The store keeps honest attribution; the CLIENT
     renderer prints HAALVING regardless, because house content is the
     organisation speaking rather than a person. */
  HV.houseSender = function (c) {
    const seat = c && c.pod && c.pod.admin ? HV.staffFor(c, 'admin') : null;
    if (seat && !seat.ai) return seat;
    const users = HV.store.users || [];
    return users.find(u => u.role === 'admin' && !u.inactive) ||
           users.find(u => u.role !== 'client') || null;
  };

  /* ── the delivery log ────────────────────────────────────────────────
     store.autoLog has been seeded empty since v158 and read by nobody. It is
     the once-guard: every automation stamps a key here the moment it acts, so
     a sweep running every 45 seconds delivers exactly once. Returns false if
     this key has already gone out. */
  function autoOnce(key) {
    const s = HV.store;
    s.autoLog = s.autoLog || {};
    if (s.autoLog[key]) return false;
    s.autoLog[key] = HV.now();
    return true;
  }
  function isoOfTs(ts) { return isoOf(new Date(ts)); }

  /* the newest thing this client actually did. moodLog carries cycle-day
     coordinates rather than a clock, so it cannot answer "how long ago"; the
     signals that can are meals, weigh-ins and their own messages. A client
     who has never logged anything falls back to their term start, so a fresh
     arrival is not flagged silent on their first afternoon. */
  function lastLogTs(c) {
    let last = 0;
    (HV.store.meals || []).forEach(m => {
      if (m.clientId === c.id && m.ts > last) last = m.ts;
    });
    (c.weightLog || []).forEach(w => { if (w.ts && w.ts > last) last = w.ts; });
    ((HV.store.circles || {})[c.id] || []).forEach(m => {
      if (m.fromId === 'client' && m.ts && m.ts > last) last = m.ts;
    });
    if (!last) {
      const t = HV.termOf(c);
      if (t && t.startISO) last = new Date(t.startISO + 'T00:00:00').getTime();
    }
    return last || HV.now();
  }

  /* ── the standing rules ──────────────────────────────────────────────
     The four switches the pad has always shown and nothing ever ran. These
     are CONDITIONS, not schedules — that is what separates them from the
     workflow templates, which fire on a clock. Each asks HV.autoOn first and
     stamps a once-per-day key, so however often the tick runs a client hears
     each rule at most once a day. */
  /* `o` lets a caller supply the clock, the same way HV.conflicts takes its
     world in `o` — these rules do nothing but read the time, so a caller that
     cannot move the clock cannot check them at all. Absent, it is the wall. */
  HV.autoSweep = function (o) {
    const s = HV.store;
    if (!s || !s.clients) return;
    const d = new Date();
    const today = (o && o.todayISO) || HV.todayISO();
    const nowMin = (o && o.nowMin != null) ? o.nowMin : d.getHours() * 60 + d.getMinutes();
    let changed = false;

    s.clients.forEach(c => {
      /* two seeded records carry userId:null — console-side clients with no
         login and no thread. HV.audienceClients filters them for the same
         reason: posting into a room nobody can open is not a delivery. */
      if (!c.userId) return;
      const f = String(c.name || '').split(' ')[0];

      /* Meal-photo nudge — past 2 pm with nothing logged today */
      if (HV.autoOn(c.id, 'photo') && nowMin >= 840) {
        const logged = (s.meals || []).some(m =>
          m.clientId === c.id && m.ts != null && isoOfTs(m.ts) === today);
        if (!logged && autoOnce('photo|' + c.id + '|' + today)) {
          const by = HV.houseSender(c);
          if (by) {
            HV.pushMsg(c.id, { fromId: by.id, kind: 'text', auto: true,
              text: 'No meal photo yet today, ' + f +
                ' — one snap of your next plate keeps the read honest.' });
            changed = true;
          }
        }
      }

      /* Silence alert — 48 h of nothing, told to the team rather than to the
         client. This is the rule the seeded worklist item describes in words. */
      if (HV.autoOn(c.id, 'silence')) {
        const mins = HV.minsSince(lastLogTs(c));
        if (mins >= 2880 && autoOnce('silence|' + c.id + '|' + today)) {
          const by = HV.houseSender(c);
          if (by) {
            HV.notice(by.id, 'sla', c.name + ' — nothing logged for ' +
              Math.floor(mins / 1440) + ' days. The non-response ladder starts here.', c.id);
            changed = true;
          }
        }
      }

      /* Cycle summary draft — the meeting day, DRAFTED for a coach to send.
         Keyed by cycle rather than by date: one draft per cycle, not one a
         day for as long as the client sits on the meeting day. */
      if (HV.autoOn(c.id, 'summary') && !c.observation && c.day === HV.meetingDay()) {
        if (autoOnce('summary|' + c.id + '|' + c.cycle)) {
          s.followupDrafts = s.followupDrafts || [];
          s.followupDrafts.push({
            id: 'fd-auto-' + c.id + '-' + c.cycle, clientId: c.id, status: 'draft', auto: true,
            text: 'Cycle ' + c.cycle + ' closes today, ' + f + ' — ' +
              (c.compliance != null ? c.compliance + '% of the plan kept, and ' : '') +
              'your review meeting is the place we set the next one together.',
          });
          changed = true;
        }
      }
    });
    if (changed) HV.save();
  };

  /* ── workflow automation templates ───────────────────────────────────
     A template is the publication: a named, ordered run of messages. Turning
     it on for a client is the subscription. This sweep is the delivery round,
     store.autoLog is the delivery log, and subscribing today does not deliver
     last month's back issues.

     Templates are CONTENT (boot-refilled, no seedVersion bump); who is
     subscribed is USER STATE. */
  HV.flowTemplates = function () { return HV.store.flowTemplates || []; };
  HV.flowTemplate = function (id) {
    return HV.flowTemplates().find(t => t.id === id) || null;
  };

  /* absent means the template's own default — the same absent-means-default
     contract HV.announceOn keeps, so a template authored next month reaches
     the clients it should without anyone migrating a record. */
  HV.flowOn = function (clientId, tplId) {
    const rec = (HV.store.clientFlows || {})[clientId] || {};
    if (rec[tplId] != null) return rec[tplId] !== false;
    const t = HV.flowTemplate(tplId);
    return !!(t && t.defaultOn);
  };

  /* where a step sits on the client's OWN clock. The two triggers read two
     different clocks and collapsing them would be wrong in both directions:
     an enrol step counts days since the term started and happens once in a
     lifetime; a cycleDay step happens on that day of every cycle. */
  function stepPos(c, t, step) {
    if (t.trigger === 'cycleDay') {
      const on = Number(step.on), day = Number(c.day || 0);
      return day === on ? 'due' : day > on ? 'past' : 'future';
    }
    const term = HV.termOf(c);
    const elapsed = term ? term.elapsed : 0;
    const after = Number(step.after);
    return elapsed === after ? 'due' : elapsed > after ? 'past' : 'future';
  }

  /* a cycleDay step recurs every cycle, so its guard key carries the cycle —
     without that the habits drip would fire once and never again. An enrol
     step must NOT carry it, or the welcome would arrive afresh at the top of
     every cycle. */
  function flowKey(c, t, i) {
    return 'flow|' + c.id + '|' + t.id + '|' + i +
      (t.trigger === 'cycleDay' ? '|cy' + (c.cycle || 1) : '');
  }

  /* THE CATCH-UP RULE. Switching a flow on stamps every step already behind
     the client as skipped. Without it, enabling a twelve-step drip for
     somebody on cycle day 9 empties nine messages into their thread at once.
     The sentinel is -1, not 0: autoOnce tests truthiness and a 0 would sail
     straight through it. */
  function skipPast(clientId, tplId) {
    const s = HV.store;
    const c = HV.client(clientId);
    const t = HV.flowTemplate(tplId);
    if (!c || !t) return;
    s.autoLog = s.autoLog || {};
    (t.steps || []).forEach((step, i) => {
      const k = flowKey(c, t, i);
      /* 'past' ONLY, never 'due'. Skipping a step that falls due today would
         mean switching a journey on in the morning silently swallowed that
         morning's message — you subscribe today, you still get today's issue;
         it is only the back issues that are not delivered. */
      if (!s.autoLog[k] && stepPos(c, t, step) === 'past') s.autoLog[k] = -1;
    });
  }

  HV.setFlow = function (clientId, tplId, on) {
    const s = HV.store;
    s.clientFlows = s.clientFlows || {};
    s.clientFlows[clientId] = s.clientFlows[clientId] || {};
    s.clientFlows[clientId][tplId] = !!on;
    if (on) skipPast(clientId, tplId);
    HV.save();
  };

  const QUIET_FROM = 22 * 60, QUIET_TO = 7 * 60;
  HV.flowSweep = function (o) {
    const s = HV.store;
    if (!s || !s.clients) return;
    const d = new Date();
    const nowMin = (o && o.nowMin != null) ? o.nowMin : d.getHours() * 60 + d.getMinutes();
    /* notifRules n5 declares quiet hours 22:00–07:00. Honouring it here stops
       that rule being one more thing the console states and never does; a
       step whose hour falls inside the window simply waits for morning. */
    if (nowMin >= QUIET_FROM || nowMin < QUIET_TO) return;
    let changed = false;
    s.clients.forEach(c => {
      if (!c.userId) return;                       /* no login, no thread */
      const by = HV.houseSender(c);
      if (!by) return;
      HV.flowTemplates().forEach(t => {
        if (t.enabled === false) return;           /* paused for the house */
        if (!HV.flowOn(c.id, t.id)) return;        /* THE requirement */
        (t.steps || []).forEach((step, i) => {
          if (stepPos(c, t, step) !== 'due') return;
          if (nowMin < Number(step.at || 0)) return;
          /* the guard is stamped LAST, after everything that could refuse —
             burning a key without delivering loses that step forever */
          if (!autoOnce(flowKey(c, t, i))) return;
          HV.pushMsg(c.id, {
            fromId: by.id, kind: 'promo', auto: true,
            flowId: t.id, flowName: t.name, stepIx: i,
            title: step.title, text: step.text,
            img: step.img || '', media: step.media || null, link: step.link || null,
          });
          changed = true;
        });
      });
    });
    if (changed) HV.save();
  };

  /* ── the session-report chase ────────────────────────────────────────
     Leaving the room asks for the report there and then; this is for
     everyone else — the coach who closed the tab, the one who never opened
     the room at all, the admin who dropped in and walked out. Within one
     tick of the session ending they get a notice and a work-list row, and
     the row stays open until the report is filed.

     NO QUIET-HOURS GATE, deliberately. notifRules n5 declares 22:00–07:00
     quiet with session-critical traffic exempt, and this is exactly that:
     a staff obligation landing in staff surfaces, never in a client's
     thread. Gating it would silently drop every evening session — and
     would make any suite run after 22:00 watch these assertions fail.

     The guard is per PERSON, not per session, and is stamped LAST. A sweep
     that burned one key for the whole session would go quiet for good the
     first time it ran on an empty owed set — which is precisely the moment
     somebody walks in late. */
  HV.reportSweep = function (o) {
    o = o || {};
    const s = HV.store;
    if (!s || !s.tasks) return;
    const d = new Date();
    const nowMin = o.nowMin != null ? o.nowMin : d.getHours() * 60 + d.getMinutes();
    const todayISO = o.todayISO || HV.todayISO();
    let changed = false;
    HV.reportsOwed({ nowMin: nowMin, todayISO: todayISO }).forEach(r => {
      if (!autoOnce('rpt|' + r.t.id + '|' + todayISO + '|' + r.uid)) return;
      const c = HV.client(r.clientId);
      s.worklist = s.worklist || [];
      s.worklist.push({
        id: 'w-rpt-' + r.t.id + '-' + todayISO + '-' + r.uid,
        text: 'Session report — ' + r.occ.title + (c ? ' · ' + c.name : ''),
        owner: r.uid, due: 'today', pill: 'warn', status: 'open',
        type: 'report', pillar: r.t.pillar || null,
        taskId: r.t.id, dateISO: todayISO,
      });
      HV.notice(r.uid, 'task', 'Session report due — “' + r.occ.title + '”' +
        (c ? ' with ' + c.name : '') + ' has ended.', r.clientId);
      changed = true;
    });
    if (changed) HV.save();
  };

  /* ── the pre-session coach brief ─────────────────────────────────────
     Composed LIVE from what the store already knows — no stored prose, so
     it can never go stale. Callers render it with an 'AI-drafted · from
     live client data' audit line. */
  HV.brief = function (clientId) {
    const s = HV.store;
    const c = HV.client(clientId);
    if (!c) return { title: 'Coach brief', lines: [] };
    const lines = [];
    const mood = (c.moodLog || [])[(c.moodLog || []).length - 1];
    if (mood) lines.push('Mood: ' + mood.mood + ' at ' + HV.fmtTime(mood.min) +
      (mood.note ? ' — “' + mood.note + '”' : '') + ' (day ' + mood.d + ')');
    const meals = (s.meals || []).filter(m => m.clientId === clientId);
    if (meals.length) {
      const rated = meals.filter(m => m.final);
      const last = rated[rated.length - 1];
      lines.push('Meals: ' + meals.length + ' logged · ' + rated.length + ' rated' +
        (last ? ' · last ' + last.final.stars + ' stars' : ''));
    }
    if (c.compliance != null) lines.push('Compliance ' + c.compliance + '%');
    if (c.risk) lines.push('Risk ' + c.risk + (c.riskWhy ? ' — ' + c.riskWhy : ''));
    /* the last thing a coach wrote after actually sitting with them — the
       most recent read of the room, ahead of any derived number */
    const reps = (s.sessionReports || []).filter(r => r.clientId === clientId);
    const lastRep = reps[reps.length - 1];
    if (lastRep) lines.push('Last session report: ' +
      (HV.meetui ? HV.meetui.wentWord(lastRep.went).toLowerCase() : lastRep.went) +
      ' — “' + lastRep.note + '”' + (lastRep.concern ? ' · flagged: ' + lastRep.concern : ''));
    const msgs = (s.circles[clientId] || []).filter(m => m.kind !== 'teamonly');
    const lastMsg = msgs[msgs.length - 1];
    if (lastMsg) lines.push('Last in the circle: “' +
      (lastMsg.text.length > 80 ? lastMsg.text.slice(0, 77) + '…' : lastMsg.text) + '”');
    const firstName = c.name.split(' ')[0];
    (s.worklist || []).filter(w => w.status === 'open' && w.text.indexOf(firstName) !== -1)
      .forEach(w => lines.push('Open: ' + w.text));
    /* next session: the live task grid when it exists, else today's calendar */
    const next = (s.tasks || []).filter(t => t.kind === 'session' && t.clientId === clientId &&
        !t.recur && t.day >= 0).sort((a, b) => (a.day - b.day) || (a.start - b.start))[0];
    if (next) lines.push('Next session: ' + next.title + ' · ' +
      (next.day === 0 ? 'today' : 'in ' + next.day + ' d') + ' at ' + HV.fmtTime(next.start));
    else {
      /* items[] is sessions-only by design — this line is why. If the plate
         lived in items, the brief would announce "Next session: Breakfast". */
      const cal = HV.calendarFor(c).find(dy =>
        (dy.items || []).some(it => it.status === 'today' || it.status === 'planned'));
      const it = cal && cal.items.find(x => x.status === 'today' || x.status === 'planned');
      if (it) lines.push('Next session: ' + it.label + ' · ' + it.time);
    }
    return { title: 'Coach brief · ' + c.name, lines: lines };
  };

  /* ── celebrations: birthdays and anniversaries in the next n days ──── */
  HV.upcomingCelebrations = function (days) {
    days = days == null ? 7 : days;
    const out = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    HV.store.clients.forEach(c => {
      [['dob', 'birthday'], ['anniv', 'anniversary']].forEach(pair => {
        const src = c[pair[0]];
        if (!src) return;
        const p = String(src).split('-');
        let next = new Date(today.getFullYear(), +p[1] - 1, +p[2]);
        if (next < today) next = new Date(today.getFullYear() + 1, +p[1] - 1, +p[2]);
        const inDays = Math.round((next - today) / 864e5);
        if (inDays <= days) out.push({ clientId: c.id, kind: pair[1], dateISO: isoOf(next), inDays: inDays });
      });
    });
    return out.sort((a, b) => a.inDays - b.inDays);
  };

  /* ── the 45-second heartbeat ─────────────────────────────────────────
     One interval, installed once (consoleShell calls this on every render;
     the guard makes that free). Sweeps save only when they changed
     something and never force a re-render — an open sheet must not be
     yanked mid-type; views re-read notices on their own renders. */
  let tickTimer = null;
  HV.ensureTick = function () {
    if (tickTimer) return;
    tickTimer = setInterval(() => {
      HV.slaSweep(); HV.reminderSweep(); HV.autoSweep(); HV.flowSweep(); HV.reportSweep();
    }, 45000);
  };

  /* ---------------- boot ---------------- */
  HV.boot = function () {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) { saved = null; }
    if (saved && saved.__v === HV.seedVersion) HV.store = saved;
    else { HV.store = JSON.parse(JSON.stringify(HV.seed)); HV.store.__v = HV.seedVersion; HV.save(); }
    /* Reference catalogues are content, not state — the level books, the diet
       plans, the live rooms. A save written before we added one would otherwise
       render an empty screen until someone thought to reset the demo, so they
       are refilled from the seed on every boot. */
    /* NOTE the guard below: this grafts a key only when it is ABSENT. It never
       refreshes one — an edit to seeded content still needs a seedVersion bump.
       So a NEW key (tracks, catTags) lands in every existing save, which is
       exactly why the two catalogue vocabularies could ship without one. */
    ['program', 'programShape', 'mealPlans', 'liveRooms', 'cultureCriteria', 'bodyCriteria', 'calendarsPast', 'chains', 'coachMarket', 'assessFlow', 'reviewFlow', 'tribeFeed', 'nutrition', 'broadcasts', 'flowTemplates', 'tracks', 'catTags'].forEach(k => {
      if (!HV.store[k] && HV.seed[k]) HV.store[k] = JSON.parse(JSON.stringify(HV.seed[k]));
    });
    /* the sweeps run once at boot; the console shell keeps them ticking.
       flowSweep is last on purpose — autoSweep may push a nudge into the same
       thread, and the welcome should not arrive underneath it. */
    HV.slaSweep(); HV.reminderSweep(); HV.autoSweep(); HV.flowSweep(); HV.reportSweep();
    if (!location.hash) location.hash = '#/login';
    window.addEventListener('hashchange', render);
    render();
  };
})();
