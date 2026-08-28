/* HAALVING console — CC-13 Schedule: the team's working calendar.
   Built from the Operations Process Flow SOP: the business runs on fixed
   cycles whose every beat is a scheduled act — alternate-day fitness/yoga
   sessions, three kinds of client meetings with strict prep ritual (Meet
   link out, three reminders, team pre-joins ten minutes early), hard-timed
   review-day internal deadlines, and daily per-role duties. The SOP's own
   bottleneck list names trainer availability and last-minute rescheduling
   as top risks — so this calendar makes load VISIBLE and rescheduling a
   DRAG, not a rebuild.
   Deliberate rule (TJ): overlapping bookings are PERMITTED — one person may
   hold two tasks at once and sequence them as they choose. The calendar
   shows the collision side-by-side and asks for an explicit "in parallel"
   tick when saving into one; it never rejects.
   Time is relative like the rest of the demo: a task lives on a day OFFSET
   from today (rd), so the seeded week is always "this week". Recurring
   tasks expand at render; per-occurrence changes write into t.exc[rd]
   (edits) or detach the occurrence into a standalone task (cross-day moves). */
(function () {
  'use strict';

  const DAY_MS = 864e5;
  const H0 = 7, H1 = 21;                      /* visible hours */
  const PXH = 48;                             /* pixels per hour */
  const SNAP = 15;                            /* minutes */

  const KINDS = {
    session:  { name: 'Client session', cls: 'k-session' },
    meeting:  { name: 'Client meeting', cls: 'k-meeting' },
    internal: { name: 'Team internal',  cls: 'k-internal' },
    duty:     { name: 'Daily duty',     cls: 'k-duty' },
  };

  /* the ICONS set is closed inside core; the two marks this view adds keep
     the same voice: 24-box, hairline, round caps */
  const I_REPEAT = '<svg viewBox="0 0 24 24"><path d="M4 9.5a5 5 0 0 1 5-5h8M14.5 2 17 4.5 14.5 7M20 14.5a5 5 0 0 1-5 5H7M9.5 22 7 19.5 9.5 17"/></svg>';
  const I_LINK = '<svg viewBox="0 0 24 24"><path d="M10 14a4.5 4.5 0 0 0 6.4.4l2.3-2.3a4.5 4.5 0 0 0-6.4-6.4L11 7"/><path d="M14 10a4.5 4.5 0 0 0-6.4-.4l-2.3 2.3a4.5 4.5 0 0 0 6.4 6.4L13 17"/></svg>';

  /* one inline style block, .sch3- prefixed (A3 additions): availability
     hatching, acceptance borders/pills, participant rows, the brief */
  const STYLE = '<style>' +
    '.sch3-off{position:absolute; left:0; right:0; pointer-events:none;' +
      'background:repeating-linear-gradient(-45deg, transparent 0 5px,' +
      'color-mix(in srgb, var(--ink-2) 14%, transparent) 5px 6px)}' +
    '.tile.sch3-open{border:1.5px dashed color-mix(in srgb, var(--ink-2) 50%, transparent)}' +
    '.tile.sch3-conf{border:1.5px solid color-mix(in srgb, var(--ok) 55%, transparent)}' +
    '.sch3-rsp{display:inline-flex; align-items:center; gap:var(--s1); flex:none;' +
      'font-size:var(--t-micro); font-weight:600; color:var(--ink-2);' +
      'background:var(--surface-2); border-radius:var(--r-full); padding:0 var(--s2)}' +
    '.tile.sch3-conf .sch3-rsp{color:var(--ok); background:var(--ok-wash)}' +
    '.sch3-rsp svg{width:10px; height:10px; stroke:currentColor; fill:none;' +
      'stroke-width:2; stroke-linecap:round; stroke-linejoin:round}' +
    '.sch3-parts{display:flex; flex-wrap:wrap; gap:var(--s2)}' +
    '.sch3-parts .pill{margin-left:var(--s1)}' +
    '.sch3-brief summary{cursor:pointer; font-weight:600}' +
    '.sch3-brief ul{margin:var(--s2) 0; padding-left:var(--s5)}' +
    '.sch3-brief li{margin:var(--s1) 0}' +
    '.sch3-noov{gap:var(--s2); align-items:center}' +
  '</style>';

  function first(name) { return String(name || '').split(' ')[0]; }
  function T(h, m) { return h * 60 + (m || 0); }
  function pad2(n) { return String(n).padStart(2, '0'); }
  /* 'HH:MM' (the u.avail vocabulary) ↔ minutes-of-day (this view's clock) */
  function hmToMin(hm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || ''));
    return m ? (+m[1]) * 60 + (+m[2]) : null;
  }
  function hmOf(min) { return pad2(Math.floor(min / 60)) + ':' + pad2(min % 60); }
  function clampMin(v) { return Math.max(T(H0), Math.min(T(H1) - SNAP, v)); }
  function snap(v) { return Math.round(v / SNAP) * SNAP; }

  function fmtT(min) {
    const h = Math.floor(min / 60), m = min % 60;
    return (h % 12 || 12) + (m ? ':' + String(m).padStart(2, '0') : '') + (h < 12 ? ' am' : ' pm');
  }
  function dayDate(rd) { return new Date(Date.now() + rd * DAY_MS); }
  function dayName(rd) {
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayDate(rd).getDay()];
  }

  /* ---------------- people & groups ----------------
     Groups mirror how the business already organises itself: the per-client
     WhatsApp pod, the departments, Ops, Core, everyone. Tasks store group
     IDS so membership stays live — reallocate a pod and its meetings follow. */
  function staffAll() { return HV.store.users.filter(function (u) { return u.role !== 'client' && !u.inactive; }); }

  /* role-derived, not a staff-id literal map — a new hire in one of these four
     coach roles gets the right auto-pillar on their sessions for free */
  const ROLE_PILLAR = { fitness: 'fitness', yoga: 'yoga', mind: 'wellness', dietitian: 'culture' };
  const pillarOf = (staffId) => ROLE_PILLAR[(HV.staff(staffId).role)] || null;

  function groupsAll() {
    const gs = [
      { id: 'g-all',  name: 'Whole team',        roles: null },
      { id: 'g-ops',  name: 'Operations',        roles: ['admin', 'opsmgr', 'opshead'] },
      { id: 'g-core', name: 'Management · Core', roles: ['core'] },
      { id: 'g-doc',  name: 'Doctors',           roles: ['doctor'] },
      { id: 'g-diet', name: 'Dietitians',        roles: ['dietitian'] },
      { id: 'g-fit',  name: 'Fitness team',      roles: ['fitness'] },
      { id: 'g-yoga', name: 'Yoga team',         roles: ['yoga'] },
      { id: 'g-mind', name: 'Mind wellness',     roles: ['mind'] },
    ];
    HV.store.clients.forEach(function (c) {
      if (Object.keys(c.pod || {}).length) {
        gs.push({ id: 'g-pod-' + c.id, name: first(c.name) + '’s pod', clientId: c.id });
      }
    });
    return gs;
  }
  function groupById(gid) {
    return groupsAll().find(function (g) { return g.id === gid; }) || null;
  }
  function groupMembers(gid) {
    const g = groupById(gid);
    if (!g) return [];
    if (g.clientId) {
      /* cover-aware: while a leave cover is active the covering coach holds
         the seat, so the pod's meetings follow the cover automatically */
      const c = HV.client(g.clientId);
      const ids = Object.keys((c && c.pod) || {})
        .map(function (k) { return HV.staffFor(c, k).id; })
        .filter(function (id) { return id && id !== 'u-ai'; });
      return ids.filter(function (id, i) { return ids.indexOf(id) === i; });
    }
    return staffAll()
      .filter(function (u) { return !g.roles || g.roles.indexOf(u.role) !== -1; })
      .map(function (u) { return u.id; });
  }
  /* everyone a task binds — direct assignees plus expanded groups, deduped */
  function taskPeople(t) {
    const ids = (t.assignees || []).slice();
    (t.groups || []).forEach(function (gid) {
      groupMembers(gid).forEach(function (id) { if (ids.indexOf(id) === -1) ids.push(id); });
    });
    return ids;
  }

  /* ---------------- the person lens' colours ----------------
     A person's colour is their SEAT on the staff list, not their position in
     the current selection — so it holds still while people are added and
     dropped around them. Twelve tokens for twelve staff: nobody shares, and a
     thirteenth hire wraps rather than crashing. Rebuilt each paint because a
     new hire (or a deactivation) reshuffles the seats. */
  const WHO_N = 12;
  /* Neighbours on the staff list are the people most often read together — a
     bench, a client's pod — so walking the palette in order would hand them
     ADJACENT hues, the one pairing that must stay far apart. The stride is
     coprime with the palette size, so it still visits all twelve before it
     repeats, but consecutive seats land five slots (~150°) apart. */
  const WHO_STRIDE = 5;
  let whoIx = {};
  function indexPeople() {
    whoIx = {};
    staffAll().forEach(function (u, i) { whoIx[u.id] = ((i * WHO_STRIDE) % WHO_N) + 1; });
  }
  function whoVar(uid) { return 'var(--who-' + (whoIx[uid] || WHO_N) + ')'; }
  function whoDot(uid) { return '<span class="whodot" style="background:' + whoVar(uid) + '" aria-hidden="true"></span>'; }

  /* ---------------- task store (lazily seeded, persisted) ---------------- */
  function tseq() { HV.store.taskSeq = (HV.store.taskSeq || 0) + 1; return HV.store.taskSeq; }

  function mk(o) {
    o.id = 'tk-' + tseq();
    o.assignees = o.assignees || [];
    o.groups = o.groups || [];
    o.link = o.link || '';
    o.notes = o.notes || '';
    o.exc = {};
    o.done = {};
    return o;
  }

  /* the demo week, written straight from the SOP */
  function defaultTasks() {
    const out = [];
    /* The five hand-written session bookings that used to live here are gone.
       They are DERIVED in data.js from the same runsOn() the templates use, so
       the coach's grid and the client's My Plan can no longer disagree about
       which session exists — which they did: Rajesh was told to do yoga at
       17:30 while Vikram had a fitness session booked for the same evening.
       What stays here is everything that is NOT a client session: the internal
       meetings, the duty rota and the admin tasks. */
    /* — Suresh P. sits on the review day: the level-change machine starts
       today. The note names the day through HV.reviewDay() so it follows the
       configured cycle rather than asserting a number of its own. — */
    out.push(mk({ title: 'Level-change discussion', kind: 'internal', clientId: 'c-sureshp',
      assignees: ['u-rohan'], groups: ['g-pod-c-sureshp'], day: 0, start: T(15, 0), dur: 45, recur: null,
      notes: 'Day ' + HV.reviewDay() + ' (SOP): session dates + charts from trainers, new diet plan for approval, level sheet updated.' }));
    out.push(mk({ title: 'Progress data prep', kind: 'internal', clientId: 'c-sureshp',
      groups: ['g-pod-c-sureshp'], day: 1, start: T(10, 30), dur: 30, recur: null }));
    out.push(mk({ title: 'Compile & send progress data', kind: 'duty', clientId: 'c-sureshp',
      assignees: ['u-anita'], day: 1, start: T(11, 0), dur: 30, recur: null }));
    out.push(mk({ title: 'Calendar completion', kind: 'internal', clientId: 'c-sureshp',
      assignees: ['u-anita', 'u-rohan'], day: 1, start: T(12, 0), dur: 45, recur: null,
      notes: 'Hard SOP deadline: calendar complete @12, approved diet plan @12.' }));
    out.push(mk({ title: 'Calendar approval', kind: 'internal', clientId: 'c-sureshp',
      assignees: ['u-rohan', 'u-sureshk'], day: 1, start: T(13, 0), dur: 30, recur: null,
      notes: 'Verify & approve from operations @1 pm (SOP).' }));
    out.push(mk({ title: 'Team pre-join · progress meeting', kind: 'internal', clientId: 'c-sureshp',
      groups: ['g-pod-c-sureshp', 'g-core'], day: 2, start: T(16, 45), dur: 15, recur: null,
      notes: 'Team and doctor join 10 min early to discuss the client (SOP).' }));
    out.push(mk({ title: 'Progress meeting · cycle-6 calendar', kind: 'meeting', clientId: 'c-sureshp',
      groups: ['g-pod-c-sureshp', 'g-core'], day: 2, start: T(17, 0), dur: 45, recur: null,
      link: 'https://meet.google.com/haa-sursh-p11',
      notes: 'Order: goal & 7-level — Ops Head · habits & concerns — Doctor · diet — Dietitian · charts & dates — Trainers.' }));

    /* — Priya K. is in observation (day 3): the first-calendar run-up — */
    out.push(mk({ title: 'Food-photo follow-ups', kind: 'duty', clientId: 'c-priya',
      assignees: ['u-sneha'], day: 0, start: T(9, 30), dur: 15, recur: { freq: 'daily', until: 2 },
      notes: 'Observation: three gentle nudges a day until 10+ meal photos are in (SOP).' }));
    out.push(mk({ title: 'Observation data complete check', kind: 'internal', clientId: 'c-priya',
      assignees: ['u-rohan', 'u-anita'], day: 1, start: T(12, 0), dur: 30, recur: null }));
    out.push(mk({ title: 'First calendar assembly', kind: 'internal', clientId: 'c-priya',
      assignees: ['u-anita', 'u-rohan'], day: 2, start: T(12, 0), dur: 45, recur: null }));
    out.push(mk({ title: 'First calendar meeting', kind: 'meeting', clientId: 'c-priya',
      groups: ['g-pod-c-priya', 'g-core'], day: 3, start: T(18, 0), dur: 45, recur: null,
      link: 'https://meet.google.com/haa-priya-cal1',
      notes: 'Three reminders on the day (morning · midday · just before); missed call to the group 15 min prior.' }));

    /* — a prospect's assessment meeting: the whole bench shows up — */
    out.push(mk({ title: 'Assessment meeting · Anil (prospect)', kind: 'meeting',
      groups: ['g-all'], day: 1, start: T(11, 0), dur: 60, recur: null,
      link: 'https://meet.google.com/haa-anil-assess',
      notes: 'Join 10 min early. Order: Ops Head → Doctor → Dietitian → Fitness → Yoga · mock test at the end.' }));

    /* — the standing daily duties, one per owning role (SOP daily beats) — */
    out.push(mk({ title: 'Star-rating window (3× daily)', kind: 'duty',
      assignees: ['u-sneha'], day: 0, start: T(13, 30), dur: 30, recur: { freq: 'daily', until: null } }));
    out.push(mk({ title: 'Daily activity reminders', kind: 'duty',
      assignees: ['u-vikram'], day: 0, start: T(8, 30), dur: 15, recur: { freq: 'daily', until: null },
      notes: 'Steps · water · sleep · screen time, into each client group (SOP).' }));
    out.push(mk({ title: 'Group monitoring sweep', kind: 'duty',
      assignees: ['u-anita'], day: 0, start: T(10, 0), dur: 20, recur: { freq: 'daily', until: null },
      notes: 'Status screenshot ×3 a day; deviations reported to Ops (SOP).' }));
    /* — the win-back call the risk ladder demands — */
    out.push(mk({ title: 'Win-back call', kind: 'duty', clientId: 'c-meena',
      assignees: ['u-sneha', 'u-rohan'], day: 0, start: T(12, 30), dur: 15, recur: null,
      notes: 'Ladder step 2 — three silent days.' }));
    /* — weekly management review — */
    out.push(mk({ title: 'Team review with Bineesh', kind: 'internal',
      assignees: ['u-bineesh'], groups: ['g-all'], day: 4, start: T(16, 0), dur: 45,
      recur: { freq: 'weekly', until: null },
      notes: 'Client teams sit with Core for follow-up discussion (SOP, Day-5 rhythm).' }));

    /* ---- what does not hold a slot, and what may share one ----
       Overlap is opt-in everywhere else, so the two exceptions are named here.

       The DAILY RHYTHM is not an appointment. These never draw on the grid at
       all (the Daily-rhythm strip owns them — see the isDaily guard in
       dayOccs); they are standing to-dos pinned to a nominal hour, and a coach
       fires the group messages off between sets. Marking them `rhythm` takes
       them out of capacity in BOTH directions: blocking a client's session
       behind the reminder sweep would be nonsense.

       And one genuine SOP pair: two review-day deadlines land at noon and are
       worked side by side by the same two people. That is two appointments
       agreeing, so it is allowOverlap — which needs both of them to say so. */
    out.forEach(function (t) { if (isDaily(t)) t.rhythm = true; });
    out.filter(function (t) {
      return t.title === 'Calendar completion' || t.title === 'Observation data complete check';
    }).forEach(function (t) { t.allowOverlap = true; });
    return out;
  }

  function tasksAll() {
    const s = HV.store;
    /* the seed ships the client-session bookings; this page adds the internal,
       duty and meeting tasks on top of them, ONCE. Additive and idempotent —
       the old form replaced s.tasks wholesale, which would now delete every
       booking the calendar depends on. */
    if (!s.tasksExtras) {
      s.tasks = (s.tasks || []).concat(defaultTasks());
      s.tasksExtras = true;
      HV.save();
    }
    return s.tasks || [];
  }
  function taskById(id) { return tasksAll().find(function (t) { return t.id === id; }); }

  /* ---------------- recurrence expansion ----------------
     The arithmetic moved to core as HV.occursOn: it was copied here, into
     console-digest.js and into the reminder band — three versions of one rule,
     free to drift. A view may read core; core must never reach into a view. */
  const occursOn = HV.occursOn;
  /* the lens keeps a task if ANY selected person is bound to it — an OR, not
     an AND. A meeting the whole pod attends belongs on every one of their
     grids, and asking for the intersection would hide exactly the shared work
     an allocator opened the multi-person view to find. */
  function matchesFilter(t, flt) {
    if (flt.client && t.clientId !== flt.client) return false;
    const who = flt.people || [];
    if (who.length) {
      const bound = taskPeople(t);
      if (!who.some(function (id) { return bound.indexOf(id) !== -1; })) return false;
    }
    return true;
  }

  function occsForDay(rd, flt) {
    const out = [];
    tasksAll().forEach(function (t) {
      if (isDaily(t)) return;               /* the Daily-rhythm strip owns these */
      const o = occursOn(t, rd);
      if (!o) return;
      if (!matchesFilter(t, flt)) return;
      out.push(o);
    });
    return out.sort(function (a, b) { return a.start - b.start || b.dur - a.dur; });
  }

  /* the daily tasks the current filter can see, with the rd each is best
     opened at (today if it runs today, else its first visible day) */
  function dailiesFor(days, flt) {
    return tasksAll().filter(function (t) { return isDaily(t) && matchesFilter(t, flt); })
      .map(function (t) {
        let at = null;
        [0].concat(days).some(function (rd) { if (occursOn(t, rd)) { at = rd; return true; } return false; });
        return { t: t, at: at == null ? t.day : at };
      })
      .sort(function (a, b) { return a.t.start - b.t.start; });
  }

  /* overlap layout — Google-Calendar style lane packing. Overlaps are a
     FEATURE here (the SOP permits parallel holds), so colliding tiles share
     the column width instead of erroring. */
  function layout(occs) {
    /* TJ's lane model: every tile keeps ONE standard width; a day with
       parallel work opens extra lanes and the whole COLUMN widens (via flex
       shares) instead of squeezing tiles. Sequential tasks reuse lane 0, so
       an overlap-free day stays single-lane. Lane packing uses a 25-minute
       visual minimum (a tile is drawn ≥ ~18px tall) so back-to-back short
       tasks don't visually bleed — data never uses this. */
    const VIS_MIN = 25;
    const laneEnds = [];
    occs.forEach(function (o) {
      let li = 0;
      while (laneEnds[li] != null && laneEnds[li] > o.start) li++;
      laneEnds[li] = o.start + Math.max(o.dur, VIS_MIN);
      o.lane = li;
    });
    const n = Math.max(1, laneEnds.length);
    occs.forEach(function (o) { o.lanes = n; });
    return { occs: occs, lanes: n };
  }

  /* slide a whole series in time: anchor, bound, exceptions and done marks
     move TOGETHER, or earlier occurrences silently fall off the front
     (occursOn requires rd >= t.day) and exception keys point at nothing */
  function shiftSeries(t, delta) {
    if (!delta) return;
    t.day += delta;
    if (t.recur && t.recur.until != null) t.recur.until += delta;
    ['exc', 'done'].forEach(function (k) {
      const src = t[k] || {};
      const out = {};
      Object.keys(src).forEach(function (rd) { out[Number(rd) + delta] = src[rd]; });
      t[k] = out;
    });
  }

  /* everything standing in the way of this slot, from the one engine in core.
     Group expansion is passed IN, because these groups are derived per client
     and are cover-aware — core must not have to know that. */
  function conflictsAt(people, rd, start, dur, exceptIds, allowOv, hoursFor) {
    return HV.conflicts(people, rd, start, dur, {
      tasks: tasksAll(), exceptIds: exceptIds || [], allowOverlap: !!allowOv,
      /* declared hours bind the people NAMED on the task, not everyone a group
         drags in — see HV.conflicts. Being busy or on leave binds everyone. */
      hoursFor: hoursFor || people,
      peopleOf: function (t) { return taskPeople(t); },
    }).map(function (c) {
      return { type: c.type, who: first(c.who), what: c.detail };
    });
  }
  /* just the "someone already holds these minutes" half */
  function collisions(people, rd, start, dur, exceptIds, allowOv) {
    return conflictsAt(people, rd, start, dur, exceptIds, allowOv)
      .filter(function (c) { return c.type === 'busy'; });
  }

  /* the refusal. Overlap is OPT-IN (TJ, 17 Aug 2026): a clash is refused
     unless the incoming task AND the task it lands on both carry
     allowOverlap. Every path comes through here — sheet, in-day drag,
     cross-day move, proposal apply. */
  function hardClashAt(t, rd, start, dur, exceptIds) {
    const clash = conflictsAt(taskPeople(t), rd, start, dur,
      exceptIds || [t.id], t.allowOverlap, t.assignees || []);
    return clash.length ? clash[0] : null;
  }
  /* one refusal, said in words — the drag paths get the same sentence the
     sheet does, and it names WHY rather than just saying no */
  function blockWords(c) {
    return c.type === 'busy'
        ? 'Blocked — ' + c.who + ' already holds “' + c.what + '”. Tick “allow overlap” on the task to run both.'
      : c.type === 'leave'
        ? 'Blocked — ' + c.who + ' is on approved leave that day.'
        : 'Blocked — ' + c.who + ' ' + c.what + '.';
  }
  /* the same refusal said in words */
  function clashWords(list) {
    return list.slice(0, 3).map(function (c) {
      return HV.esc(c.who) + ' ' +
        (c.type === 'busy' ? 'already holds “' + HV.esc(c.what) + '”'
         : c.type === 'leave' ? 'is on approved leave'
         : HV.esc(c.what));
    }).join(' · ') + (list.length > 3 ? ' · +' + (list.length - 3) + ' more' : '');
  }

  /* ---------------- acceptance, availability, lens gate ---------------- */
  const RESP = {
    accepted: { label: 'Accepted', cls: 'ok' },
    declined: { label: 'Declined', cls: 'bad' },
    hold:     { label: 'Hold',     cls: 'warn' },
    resched:  { label: 'New time', cls: 'info' },
  };
  /* a task needing acceptance: more than one pair of hands, or any group */
  function isGroupTask(t) {
    return (t.groups || []).length > 0 || taskPeople(t).length > 1;
  }
  function respState(t) {
    const people = taskPeople(t);
    const rs = t.responses || {};
    const acc = people.filter(function (id) { return rs[id] === 'accepted'; }).length;
    return { total: people.length, accepted: acc, confirmed: people.length > 0 && acc === people.length };
  }
  /* who a proposal lands with: the task's creator when known, else every
     active allocator (they hold the Apply button) */
  function proposalRecipients(t) {
    const me = HV.me();
    if (t.byId && t.byId !== me.id) return [t.byId];
    return HV.store.users.filter(function (u) {
      if (u.role === 'client' || u.inactive || u.id === me.id) return false;
      const r = HV.roleDef(u.role);
      return !!(r && r.perms && r.perms.indexOf('allocate') !== -1);
    }).map(function (u) { return u.id; });
  }

  /* widening the lens beyond yourself is an allocator's privilege */
  function canWiden() {
    const me = HV.me();
    return !!me && (HV.can('allocate') || HV.can('seeAllClients') || me.role === 'hod');
  }

  /* the visible hours OUTSIDE a person's declared window for that weekday,
     as [fromMin, toMin] segments — what the grid hatches */
  /* A SPLIT shift leaves more than one gap — before the first window, between
     the windows, and after the last — so this walks the day's windows rather
     than a single from/to pair. The old single-pair version read a nested
     window as the string '06:00,10:00', failed its own regex, and hatched
     NOTHING at all: silently, which is how this codebase tends to break. */
  function availOffSegs(uid, rd) {
    const u = HV.staff(uid);
    if (!u || u.ai || !u.avail) return [];
    const wins = HV.availWindows(u, HV.wdOf(rd));
    if (!wins.length) return [[T(H0), T(H1)]];
    const segs = [];
    let cur = T(H0);
    wins.forEach(function (w) {
      if (w[0] > cur) segs.push([cur, Math.min(w[0], T(H1))]);
      cur = Math.max(cur, w[1]);
    });
    if (cur < T(H1)) segs.push([cur, T(H1)]);
    return segs.filter(function (s) { return s[1] > s[0] && s[0] < T(H1); });
  }
  /* the sheet's live hint, from the same engine that does the refusing — so
     the sentence a coach reads and the rule that stops them cannot disagree */
  function outsideAvail(people, rd, start, dur) {
    return HV.outsideHours(people, rd, start, dur, { tasks: tasksAll() })
      .map(function (c) { return first(c.who) + ' ' + c.detail; });
  }
  /* the slot restated on the client's own clock, when it differs from IST */
  function tzLineFor(cl, startMin) {
    if (!cl || cl.tzo == null || cl.tzo === 5.5) return '';
    return '<p class="sub sch3-tz" style="margin:0"><span class="num">' + HV.esc(fmtT(startMin)) + '</span> IST · ' +
      '<span class="num">' + HV.esc(HV.tzShift(hmOf(startMin), cl.tzo)) + '</span> ' +
      HV.esc(cl.tzLabel || 'local') + ' (client local)</p>';
  }

  function canEdit(t) {
    if (HV.can('allocate')) return true;
    return taskPeople(t).indexOf(HV.me().id) !== -1;
  }

  /* ---------------- view state (session only) ---------------- */
  let mode = null;            /* 'week' | 'day' — null resolves per viewport */
  let anchor = 0;             /* week mode: week offset · day mode: rd */
  /* The lens is a SET of staff ids, because the question an allocator actually
     asks is "when are these four free", not "when is this one free". An EMPTY
     set means the whole team — deselecting everybody can only sensibly mean
     "stop narrowing", and it keeps the old single-select's "" default intact.
     null is the third state: not chosen yet, resolve from the role. */
  let lensIds = null;
  let fltClient = '';
  let lastMe = null;
  let keepScroll = null;

  /* progressive disclosure, rule 1: you land on YOUR schedule. Ops (who run
     everyone's day) land on the whole team, an HoD on their bench; roles
     without the allocator privilege are LOCKED to themselves. A department is
     no longer a lens MODE of its own — it is simply that bench, pre-selected,
     so one model covers "the yoga team" and "Lakshmi and Meera" alike. */
  function defaultLens(me) {
    if (!me) return [];
    if (!canWiden()) return [me.id];
    if (me.role === 'hod' && me.dept) return HV.deptMembers(me.dept).map(function (u) { return u.id; });
    return HV.can('allocate') ? [] : [me.id];
  }
  function ensureDefaults() {
    const me = HV.me();
    indexPeople();
    if (me && me.id !== lastMe) {
      lastMe = me.id;
      lensIds = defaultLens(me);
      fltClient = '';
    }
    if (lensIds === null) lensIds = defaultLens(me);
    /* the lock, re-asserted every paint: a role that cannot widen cannot hold
       anyone but itself, whatever a stale session state says */
    if (me && !canWiden() && (lensIds.length !== 1 || lensIds[0] !== me.id)) lensIds = [me.id];
    /* a departed staff member must not keep filtering the grid forever */
    lensIds = lensIds.filter(function (id) { return whoIx[id]; });
  }

  /* re-render without losing the grid's scroll or (optionally) focus */
  function repaint(focusSel) {
    const sc = document.querySelector('.schscroll');
    keepScroll = sc ? sc.scrollTop : null;
    HV.refresh();
    if (focusSel) {
      const n = document.querySelector(focusSel);
      if (n) n.focus();
    }
  }

  /* daily standing duties live OFF the grid — painted seven times over they
     are pure noise; the strip above the grid states them once */
  function isDaily(t) { return !!(t.recur && t.recur.freq === 'daily'); }

  function resolveMode() {
    if (mode) return mode;
    return window.innerWidth <= 860 ? 'day' : 'week';
  }
  function visibleDays() {
    if (resolveMode() === 'day') return [anchor];
    /* the Monday of the anchored week, as day-offsets from today */
    const today = new Date();
    const mon = -((today.getDay() + 6) % 7) + anchor * 7;
    const out = [];
    for (let i = 0; i < 7; i++) out.push(mon + i);
    return out;
  }

  /* ---------------- HTML ---------------- */

  /* the rail: one band per selected person the task binds, stacked top to
     bottom. Hard colour stops, so two people read as two bands and never as
     a blend — a gradient between two identities would name a third person. */
  function railHtml(ids) {
    const step = 100 / ids.length;
    const stops = ids.map(function (id, i) {
      return whoVar(id) + ' ' + (i * step).toFixed(2) + '% ' + ((i + 1) * step).toFixed(2) + '%';
    }).join(',');
    return '<span class="whorail" aria-hidden="true" style="background:linear-gradient(to bottom,' + stops + ')"></span>';
  }

  function tileHtml(o, view) {
    const t = o.t;
    const top = (o.start - T(H0)) / 60 * PXH;
    const h = Math.max(18, o.dur / 60 * PXH - 2);
    const cl = HV.client(t.clientId);
    const people = taskPeople(t);
    /* whose hour this is, said in colour — but only from two people up. With
       one person in the lens every tile on the grid is theirs and the rail
       would be decoration; with Everyone selected, twelve colours is soup.
       The names go into the tile's accessible label either way, because
       colour on its own is never allowed to be the only carrier. */
    const lensHit = lensIds.length >= 2
      ? people.filter(function (id) { return lensIds.indexOf(id) !== -1; })
      : [];
    const editable = canEdit(t);
    const w = 100 / (o.lanes || 1);
    const sizeCls = h < 26 ? ' xs' : '';
    /* acceptance state: a group task stays dashed until every participant
       is in, then it reads Confirmed */
    const grp = isGroupTask(t);
    const stt = grp ? respState(t) : null;
    const rspCls = grp ? (stt.confirmed ? ' sch3-conf' : ' sch3-open') : '';
    const rspPill = !grp ? '' : stt.confirmed
      ? '<span class="sch3-rsp">' + HV.ui.icon('check') + (view === 'week' ? '' : 'Confirmed') + '</span>'
      : '<span class="sch3-rsp"><span class="num">' + stt.accepted + '/' + stt.total + '</span>' + (view === 'week' ? '' : ' in') + '</span>';
    const kindCls = (KINDS[t.kind] || KINDS.internal).cls +
      (t.kind === 'session' && t.pillar ? ' ' + HV.PILLARS[t.pillar].cls : '');
    /* the tile says little; its accessible name says everything the sheet holds */
    const label = (o.done ? 'Done: ' : '') + (KINDS[t.kind] || KINDS.internal).name + ' — ' + o.title +
      (cl ? ', client ' + first(cl.name) : '') +
      ', ' + fmtT(o.start) + ' to ' + fmtT(o.start + o.dur) + ', ' + dayName(o.rd) +
      (lensHit.length ? ', ' + lensHit.map(function (id) { return first(HV.staff(id).name); }).join(' and ') : '') +
      (people.length > 1 ? ', ' + people.length + ' people' : '') +
      (grp ? (stt.confirmed ? ', confirmed' : ', ' + stt.accepted + ' of ' + stt.total + ' accepted') : '') +
      (t.recur ? ', repeats' : '') + (o.link ? ', has meeting link' : '');
    /* TJ's tile grammar — week: colour + start time, nothing else (click for
       details); day: colour + start time + heading */
    const body = view === 'week'
      ? '<span class="tt"><span class="num">' + HV.esc(fmtT(o.start)) + '</span>' + rspPill + '</span>'
      : '<span class="tt"><span class="num">' + HV.esc(fmtT(o.start)) + '</span>' +
          (o.link ? '<span class="tic" aria-hidden="true">' + I_LINK + '</span>' : '') + rspPill + '</span>' +
        '<span class="tn">' + HV.esc(o.title) + '</span>';
    return '<button class="tile ' + kindCls + sizeCls + rspCls + (o.done ? ' done' : '') +
      (lensHit.length ? ' haswho' : '') + (editable ? ' candrag' : '') + '"' +
      ' data-tile="' + t.id + '" data-rd="' + o.rd + '"' +
      ' style="top:' + top.toFixed(1) + 'px; height:' + h.toFixed(1) + 'px; left:' + (o.lane * w).toFixed(2) + '%; width:calc(' + w.toFixed(2) + '% - 2px)"' +
      ' aria-label="' + HV.esc(label) + '">' +
      (lensHit.length ? railHtml(lensHit) : '') +
      body +
      (editable && o.dur >= 45 ? '<span class="rz" data-rz aria-hidden="true"></span>' : '') +
    '</button>';
  }

  /* the Daily-rhythm strip: the standing duties, said once — not 7× on the
     grid. Closed it is one quiet line; open it lists them (native details,
     the product's established disclosure element). */
  function dailiesHtml(days, flt) {
    const ds = dailiesFor(days, flt);
    if (!ds.length) return '';
    const rows = ds.map(function (d) {
      const t = d.t;
      const bound = taskPeople(t);
      const owners = bound.slice(0, 2).map(function (id) { return first(HV.staff(id).name); }).join(', ');
      /* the duties are part of the schedule, so they answer the lens in the
         same colour the grid does — the names are already spelled out here,
         so the dots are a second reading of the same fact, never the only one */
      const dots = lensIds.length >= 2
        ? bound.filter(function (id) { return lensIds.indexOf(id) !== -1; }).slice(0, 3).map(whoDot).join('')
        : '';
      return '<button class="drow" data-duty="' + t.id + '" data-at="' + d.at + '">' +
        '<span class="num">' + HV.esc(fmtT(t.start)) + '</span>' +
        '<span class="grow">' + HV.esc(t.title) + '</span>' +
        '<small>' + dots + HV.esc(owners) + '</small>' +
        '<span class="tic" aria-hidden="true">' + I_REPEAT + '</span>' +
      '</button>';
    }).join('');
    return '<details class="dailies">' +
      '<summary>Daily rhythm — <span class="num">' + ds.length + '</span> standing dut' + (ds.length === 1 ? 'y' : 'ies') +
      ' <span class="sub">same beat every day · tap to open</span></summary>' +
      '<div class="dlist">' + rows + '</div>' +
    '</details>';
  }

  function colData(rd, view) {
    const lay = layout(occsForDay(rd, { people: lensIds, client: fltClient }));
    const isToday = rd === 0;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const nowLine = isToday && nowMin >= T(H0) && nowMin <= T(H1)
      ? '<span class="nowline" style="top:' + ((nowMin - T(H0)) / 60 * PXH).toFixed(1) + 'px"></span>' : '';
    /* EXACTLY one person in the lens → hatch the hours outside their declared
       week. Two people's off-hours laid over one column would be a hatch that
       belongs to nobody, so the cue simply steps aside as the lens widens. */
    let offs = '';
    if (lensIds.length === 1) {
      offs = availOffSegs(lensIds[0], rd).map(function (seg) {
        return '<span class="sch3-off" aria-hidden="true" style="top:' + (((seg[0] - T(H0)) / 60) * PXH).toFixed(1) +
          'px; height:' + (((seg[1] - seg[0]) / 60) * PXH).toFixed(1) + 'px"></span>';
      }).join('');
    }
    return {
      lanes: lay.lanes,
      html: '<div class="schcol' + (isToday ? ' today' : '') + '" data-col="' + rd + '" style="flex-grow:' + lay.lanes + '">' +
        offs + nowLine + lay.occs.map(function (o) { return tileHtml(o, view); }).join('') + '</div>',
    };
  }

  function gridHtml(days, view) {
    let hours = '';
    for (let h = H0; h < H1; h++) {
      hours += '<span class="hlbl num" style="top:' + ((h - H0) * PXH) + 'px">' + (h % 12 || 12) + (h < 12 ? ' am' : ' pm') + '</span>';
    }
    /* a day's column carries as many flex shares as it has lanes, so every
       tile on the calendar keeps ONE standard width and a day with parallel
       work simply grows wider (TJ's model). The header mirrors the shares. */
    const cols = days.map(function (rd) { return colData(rd, view); });
    return '<div class="schwrap">' +
      '<div class="schhead">' +
        '<span class="gut"></span>' +
        days.map(function (rd, i) {
          return '<button class="dh' + (rd === 0 ? ' today' : '') + '" data-goday="' + rd + '" style="flex-grow:' + cols[i].lanes + '">' +
            '<small>' + dayName(rd) + '</small><b class="num">' + dayDate(rd).getDate() + '</b></button>';
        }).join('') +
      '</div>' +
      '<div class="schscroll"><div class="schgrid" style="height:' + ((H1 - H0) * PXH) + 'px">' +
        '<div class="gut">' + hours + '</div>' +
        cols.map(function (c) { return c.html; }).join('') +
      '</div></div>' +
    '</div>';
  }

  /* ---------------- the lens: label, legend, picker ---------------- */

  /* the selection in one phrase — nobody is the whole team, one or two are
     named outright, more become a count the legend below spells out */
  function lensLabel() {
    if (!lensIds.length) return 'Everyone';
    if (lensIds.length <= 2) return lensIds.map(function (id) { return first(HV.staff(id).name); }).join(' · ');
    return lensIds.length + ' people';
  }

  /* the legend IS the lens: every name on it can be dropped with one tap, so
     reading who is on the grid and changing who is on the grid are one act.
     It only appears once colour is doing work — at two people and up. */
  function wholegHtml() {
    if (lensIds.length < 2) return '';
    return '<div class="wholeg" role="group" aria-label="People on the grid">' +
      '<span>On the grid:</span>' +
      lensIds.map(function (id) {
        const nm = first(HV.staff(id).name);
        return '<button class="whochip" data-whodrop="' + HV.esc(id) + '"' +
          ' aria-label="Remove ' + HV.esc(nm) + ' from the grid">' +
          whoDot(id) + HV.esc(nm) + HV.ui.icon('x') + '</button>';
      }).join('') +
      '<button class="btn sm quiet" id="sch-whoclear">Show everyone</button>' +
    '</div>';
  }

  /* the picker's benches, as a true partition: each person appears once, in
     the first group that claims them, and whoever no group claims lands in
     the tail bucket rather than falling off the list */
  function lensGroups() {
    const staff = staffAll();
    const seen = {};
    const out = [];
    function take(name, list) {
      const fresh = list.filter(function (u) { return !seen[u.id]; });
      fresh.forEach(function (u) { seen[u.id] = true; });
      if (fresh.length) out.push({ name: name, ids: fresh.map(function (u) { return u.id; }) });
    }
    const OPS = ['admin', 'opsmgr', 'opshead', 'core'];
    take('Operations & management', staff.filter(function (u) { return OPS.indexOf(u.role) !== -1; }));
    take('Doctors', staff.filter(function (u) { return u.role === 'doctor'; }));
    /* the four benches, HoD included — this is where the old "department"
       lens went: a bench is no longer a mode, it is a one-tap selection */
    Object.keys(HV.DEPTS).forEach(function (k) { take(HV.DEPTS[k], HV.deptMembers(k)); });
    take('Everyone else', staff);
    return out;
  }

  function openLensSheet() {
    if (!canWiden()) return;
    let draft = lensIds.slice();
    const groups = lensGroups();
    HV.sheet(
      '<div class="h1">Whose schedule</div>' +
      '<p class="sub" style="margin:0">Pick as many people as you like. Each keeps their own colour on the grid, ' +
      'and a task two of them share shows both colours on the one tile. Pick nobody to see the whole team.</p>' +
      groups.map(function (g) {
        return '<button class="whogrp" data-whoall="' + HV.esc(g.ids.join(',')) + '"' +
            ' aria-label="Select or clear everyone in ' + HV.esc(g.name) + '">' +
            HV.esc(g.name) + ' · all <span class="num">' + g.ids.length + '</span></button>' +
          '<div class="whopeople">' + g.ids.map(function (id) {
            const u = HV.staff(id);
            const nm = id === lastMe ? first(u.name) + ' (you)' : u.name;
            return '<button class="chip" data-who="' + HV.esc(id) + '" aria-pressed="false">' +
              whoDot(id) + ' ' + HV.esc(nm) + '</button>';
          }).join('') + '</div>';
      }).join('') +
      '<div class="notice" id="who-count"></div>' +
      '<div class="row" style="justify-content:flex-end; flex-wrap:wrap">' +
        '<button class="btn sm quiet" id="who-none">Everyone</button>' +
        '<button class="btn sm ghost" id="who-cancel">Cancel</button>' +
        '<button class="btn sm" id="who-done">Show on the grid</button>' +
      '</div>',
      function (sheet) {
        /* chips are repainted in place, never re-rendered — rebuilding the
           markup here would drop the listeners attached to it */
        function paint() {
          sheet.querySelectorAll('[data-who]').forEach(function (b) {
            const on = draft.indexOf(b.dataset.who) !== -1;
            b.classList.toggle('sel', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
          });
          sheet.querySelector('#who-count').innerHTML = !draft.length
            ? 'Nobody picked — the whole team’s week, coloured by kind of work.'
            : draft.length === 1
              ? 'One person — their hours, with the time outside their declared week hatched.'
              : '<span class="num">' + draft.length + '</span> people on one grid, each with their own colour.';
        }
        sheet.querySelectorAll('[data-who]').forEach(function (b) {
          b.addEventListener('click', function () {
            const i = draft.indexOf(b.dataset.who);
            if (i === -1) draft.push(b.dataset.who); else draft.splice(i, 1);
            paint();
          });
        });
        /* a bench header toggles: all in when any is out, all out when all in */
        sheet.querySelectorAll('[data-whoall]').forEach(function (b) {
          b.addEventListener('click', function () {
            const ids = b.dataset.whoall.split(',');
            const allOn = ids.every(function (id) { return draft.indexOf(id) !== -1; });
            ids.forEach(function (id) {
              const i = draft.indexOf(id);
              if (allOn) { if (i !== -1) draft.splice(i, 1); }
              else if (i === -1) draft.push(id);
            });
            paint();
          });
        });
        sheet.querySelector('#who-none').addEventListener('click', function () { draft = []; paint(); });
        sheet.querySelector('#who-cancel').addEventListener('click', HV.closeSheet);
        sheet.querySelector('#who-done').addEventListener('click', function () {
          /* normalised to staff order, so the legend reads the same however
             the chips were tapped, and the colours never appear to shuffle */
          lensIds = staffAll().map(function (u) { return u.id; })
            .filter(function (id) { return draft.indexOf(id) !== -1; });
          HV.closeSheet();
          repaint('#sch-who');
        });
        paint();
      }
    );
  }

  function toolbarHtml(days) {
    const m = resolveMode();
    const a = dayDate(days[0]), b = dayDate(days[days.length - 1]);
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const range = m === 'day'
      ? dayName(days[0]) + ' <span class="num">' + a.getDate() + '</span> ' + MON[a.getMonth()]
      : '<span class="num">' + a.getDate() + '</span> ' + MON[a.getMonth()] + ' – <span class="num">' + b.getDate() + '</span> ' + MON[b.getMonth()];
    const widen = canWiden();
    const n = lensIds.length;
    const sub = !n ? 'The whole team’s week — drag a tile to reschedule.'
      : n === 1
        ? (widen ? first(HV.staff(lensIds[0]).name) + '’s week — add more people to read them together.'
                 : 'Your week — the lens stays on you for your role.')
        : '<span class="num">' + n + '</span> people’s hours on one grid, each in their own colour.';
    /* the lens: allocators and HoDs open a picker and hold as many people as
       they like; everyone else holds a dead button naming themselves. The
       button wears the chosen colours, so the legend starts in the toolbar. */
    const whoBtn = '<button class="btn sm ghost" id="sch-who"' +
      (widen ? '' : ' disabled title="Widening the lens needs an allocator role"') +
      ' aria-label="Whose schedule — currently ' + HV.esc(lensLabel()) + '">' +
      (n ? lensIds.slice(0, 4).map(whoDot).join('') : HV.ui.icon('users')) +
      HV.esc(lensLabel()) + '</button>';
    return '<div class="h1-row"><div><div class="kicker">TODAY’S HOURS</div><h1 class="h1">Schedule</h1>' +
      '<div class="sub">' + sub + '</div></div>' +
      '<button class="btn" id="sch-new">' + HV.ui.icon('plus') + 'New task</button></div>' +

      '<div class="schbar wrap">' +
        '<button class="btn sm ghost" id="sch-today">Today</button>' +
        '<button class="pgbtn" id="sch-prev" aria-label="Earlier">' + HV.ui.icon('chevL') + '</button>' +
        '<button class="pgbtn" id="sch-next" aria-label="Later">' + HV.ui.icon('chevR') + '</button>' +
        '<span class="schrange">' + range + '</span>' +
        '<span class="grow"></span>' +
        whoBtn +
        '<select class="input sel" id="sch-client" aria-label="Filter by client">' +
          '<option value="">All clients</option>' +
          HV.store.clients.map(function (c) {
            const tz = c.tzo != null && c.tzo !== 5.5 && c.tzLabel ? ' · ' + c.tzLabel : '';
            return '<option value="' + c.id + '"' + (fltClient === c.id ? ' selected' : '') + '>' + HV.esc(c.name + tz) + '</option>';
          }).join('') +
        '</select>' +
        '<div class="vtog" role="group" aria-label="Calendar view">' +
          '<button data-vm="day" class="' + (m === 'day' ? 'on' : '') + '" aria-pressed="' + (m === 'day') + '">Day</button>' +
          '<button data-vm="week" class="' + (m === 'week' ? 'on' : '') + '" aria-pressed="' + (m === 'week') + '">Week</button>' +
        '</div>' +
      '</div>';
  }

  /* ---------------- detail sheet ---------------- */
  function openDetail(tid, rd) {
    const t = taskById(tid);
    const o = t && occursOn(t, rd);
    if (!o) return;
    const me = HV.me();
    const cl = HV.client(t.clientId);
    const people = taskPeople(t);
    const kindName = (KINDS[t.kind] || KINDS.internal).name;
    const gnames = (t.groups || []).map(function (g) { return (groupById(g) || {}).name; }).filter(Boolean);
    const grp = isGroupTask(t);
    const rs = t.responses || {};
    const stt = respState(t);
    const mine = me ? rs[me.id] : null;
    const amIn = me && people.indexOf(me.id) !== -1;
    const canApply = HV.can('allocate') || (t.byId && me && t.byId === me.id);

    /* participants: on group tasks every name carries its response pill */
    const partsHtml = grp
      ? '<div class="sec-title">Participants · <span class="num">' + stt.accepted + '/' + stt.total + '</span>' +
          (stt.confirmed ? ' · confirmed' : ' in') + '</div>' +
        '<div class="sch3-parts">' + people.map(function (id) {
          const u = HV.staff(id);
          const r = RESP[rs[id]] || null;
          return '<span class="chip">' + HV.ui.avatar(u.name, 'sm') + ' ' + HV.esc(first(u.name)) +
            '<span class="pill ' + (r ? r.cls : 'neutral') + '">' + (r ? r.label : 'No response') + '</span></span>';
        }).join('') + '</div>' +
        (gnames.length ? '<p class="sub" style="margin:0">via ' + HV.esc(gnames.join(', ')) + '</p>' : '')
      : '<div class="row" style="flex-wrap:wrap">' +
          people.map(function (id) {
            const u = HV.staff(id);
            return '<span class="chip">' + HV.ui.avatar(u.name, 'sm') + ' ' + HV.esc(first(u.name)) + '</span>';
          }).join('') +
          (gnames.length ? '<span class="sub">via ' + HV.esc(gnames.join(', ')) + '</span>' : '') +
        '</div>';

    /* my say, when I'm one of the participants */
    const respActs = grp && amIn
      ? '<div class="row" style="flex-wrap:wrap">' +
          [['accepted', 'Accept'], ['hold', 'Hold'], ['declined', 'Decline']].map(function (p) {
            return '<button class="btn sm' + (mine === p[0] ? '' : ' ghost') + '" data-resp="' + p[0] + '"' +
              ' aria-pressed="' + (mine === p[0] ? 'true' : 'false') + '">' + p[1] + '</button>';
          }).join('') +
          '<button class="btn sm ghost" id="dt-propose">Propose new time</button>' +
        '</div>'
      : '';

    /* proposals land with whoever can apply them — the existing move
       machinery does the actual reschedule */
    const props = t.proposals || {};
    const pids = Object.keys(props).filter(function (uid) { return props[uid]; });
    const propHtml = pids.length && canApply
      ? '<div class="sec-title">Proposed times</div>' + pids.map(function (uid) {
          const p = props[uid];
          const u = HV.staff(uid);
          return '<div class="trow">' + HV.ui.avatar(u.name) +
            '<span class="grow"><b>' + HV.esc(first(u.name)) + '</b>' +
            '<small>proposes ' + dayName(p.day) + ' <span class="num">' + dayDate(p.day).getDate() + '</span>' +
            ' · <span class="num">' + HV.esc(fmtT(p.start)) + '</span></small></span>' +
            '<button class="btn sm" data-applyprop="' + HV.esc(uid) + '">Apply</button></div>';
        }).join('')
      : '';

    /* ── the room door, and the report it owes afterwards ──────────────
       A session is joinable from ten minutes before it starts until it
       ends — the same promise the client's Today card has always made.
       Outside that window the sheet says when the door opens rather than
       showing a button that would refuse. */
    const nowD = new Date();
    const nowM = nowD.getHours() * 60 + nowD.getMinutes();
    const isRoom = t.kind === 'session' || t.kind === 'meeting';
    const live = isRoom && rd === 0 && nowM >= o.start - 10 && nowM < o.start + o.dur;
    const ended = isRoom && rd === 0 && HV.sessionEnded(o, nowM);
    const canRoom = HV.meetui && HV.meetui.mayJoin && HV.meetui.mayJoin(t);
    const joinHtml = !isRoom ? ''
      : live && canRoom
        ? '<button class="btn block" id="dt-meet">' + I_LINK + 'Join the session room</button>'
        : (rd === 0 && !ended && canRoom
            ? '<p class="sub" style="margin:0">Room opens at <span class="num">' +
                HV.esc(fmtT(o.start - 10)) + '</span>.</p>'
            : '');

    /* the obligation, stated on the session itself: a session nobody
       reported has to leave a visible trace that a report was due, the same
       way an unminuted meeting does on the client record. */
    let repHtml = '';
    if (ended && HV.reportRequired(t)) {
      const dISO = HV.todayISO();
      const owed = HV.reportsOwed({ nowMin: nowM, todayISO: dISO })
        .filter(function (r) { return r.t.id === t.id; });
      const filed = (HV.store.sessionReports || [])
        .filter(function (r) { return r.taskId === t.id && r.dateISO === dISO; });
      const total = filed.length + owed.length;
      const iOwe = me && owed.some(function (r) { return r.uid === me.id; });
      /* Three states, and the third is why this is not a two-way test: a
         task whose people arrive only through a GROUP names nobody, so
         nothing is owed and nothing was filed. Reading that as "everyone has
         filed" would tell the room a report exists when none ever will —
         core cannot expand groups, so those attendees owe one only if they
         actually walked in. */
      var headline = total ? '<span class="num">' + filed.length + '</span> of <span class="num">' + total + '</span> filed'
        : 'Nobody was named on this one';
      var sub = owed.length
        ? HV.esc(owed.map(function (r) { return first(HV.staff(r.uid).name); }).join(', ')) + ' still to file'
        : total ? 'Every attendee has filed.'
        : 'Whoever joins the room owes one on the way out.';
      repHtml = '<div class="sec-title">Session report</div>' +
        '<div class="trow">' + HV.ui.iconTile('doc', 'sm') +
          '<span class="grow"><b>' + headline + '</b>' +
          '<small>' + sub + '</small></span>' +
          (iOwe ? '<button class="btn sm" id="dt-report">File yours</button>' : '') +
        '</div>';
    }

    /* the pre-session brief, composed live from the client's store record */
    const brief = t.clientId ? HV.brief(t.clientId) : null;
    const briefHtml = brief && brief.lines.length
      ? '<details class="sch3-brief"><summary>Coach brief · AI-drafted</summary>' +
          '<ul>' + brief.lines.map(function (l) { return '<li>' + HV.esc(l) + '</li>'; }).join('') + '</ul>' +
          '<p class="audit" style="margin:0">AI-drafted · from live client data</p>' +
        '</details>'
      : '';

    HV.sheet(
      '<div class="h1">' + HV.esc(o.title) + '</div>' +
      '<p class="sub" style="margin:0">' + HV.esc(kindName) + ' · ' + dayName(rd) + ' <span class="num">' + dayDate(rd).getDate() + '</span>' +
        ' · <span class="num">' + HV.esc(fmtT(o.start)) + '</span>–<span class="num">' + HV.esc(fmtT(o.start + o.dur)) + '</span>' +
        (t.recur ? ' · repeats ' + (t.recur.freq === 'alt' ? 'alternate days' : t.recur.freq) : '') +
        (t.allowOverlap ? ' · may run in parallel' : '') +
        (o.edited ? ' · this occurrence was modified' : '') + '</p>' +
      tzLineFor(cl, o.start) +
      (cl ? '<button class="trow click" data-client="' + cl.id + '">' + HV.ui.avatar(cl.name) +
        '<span class="grow"><b>' + HV.esc(cl.name) + '</b><small>open the client 360</small></span>' + HV.ui.icon('chevR') + '</button>' : '') +
      partsHtml +
      respActs +
      propHtml +
      joinHtml +
      /* the pasted external link stays available as a secondary door for
         anyone whose team really is meeting on Google Meet */
      (o.link ? '<a class="btn ghost block" href="' + HV.esc(o.link) + '" target="_blank" rel="noopener">' + I_LINK + 'Open the external link</a>' : '') +
      repHtml +
      (o.notes ? '<div class="notice">' + HV.esc(o.notes) + '</div>' : '') +
      briefHtml +
      '<div class="row" style="justify-content:flex-end; flex-wrap:wrap">' +
        '<button class="btn sm quiet" id="dt-done">' + (o.done ? 'Mark not done' : 'Mark done') + '</button>' +
        (canEdit(t) ? '<button class="btn sm ghost" id="dt-edit">Edit</button>' +
          '<button class="btn sm ghost" id="dt-del" style="color:var(--danger); border-color:var(--danger)">Delete</button>' : '') +
        '<button class="btn sm" id="dt-close">Close</button>' +
      '</div>',
      function (sheet) {
        sheet.querySelector('#dt-close').addEventListener('click', HV.closeSheet);
        const cbtn = sheet.querySelector('[data-client]');
        if (cbtn) cbtn.addEventListener('click', function () { HV.closeSheet(); HV.go('#/client/' + cbtn.dataset.client); });
        sheet.querySelector('#dt-done').addEventListener('click', function () {
          t.done = t.done || {};
          if (t.done[rd]) delete t.done[rd]; else t.done[rd] = true;
          HV.save(); HV.closeSheet(); repaint(null);
        });
        const mt = sheet.querySelector('#dt-meet');
        if (mt) mt.addEventListener('click', function () { HV.closeSheet(); HV.meetui.join(t.id, rd); });
        const rp = sheet.querySelector('#dt-report');
        if (rp) rp.addEventListener('click', function () { HV.closeSheet(); HV.meetui.reportSheet(t.id, HV.todayISO()); });
        const ed = sheet.querySelector('#dt-edit');
        if (ed) ed.addEventListener('click', function () { HV.closeSheet(); openTaskSheet(t, rd); });
        const del = sheet.querySelector('#dt-del');
        if (del) del.addEventListener('click', function () { HV.closeSheet(); openDelete(t, rd); });
        /* my acceptance — one write, persisted, tile pill follows */
        sheet.querySelectorAll('[data-resp]').forEach(function (b) {
          b.addEventListener('click', function () {
            (t.responses = t.responses || {})[me.id] = b.dataset.resp;
            HV.save(); HV.closeSheet(); repaint(null);
            HV.toast('Your response is in: ' + RESP[b.dataset.resp].label + '.');
          });
        });
        const pp = sheet.querySelector('#dt-propose');
        if (pp) pp.addEventListener('click', function () { HV.closeSheet(); openPropose(t, rd); });
        sheet.querySelectorAll('[data-applyprop]').forEach(function (b) {
          b.addEventListener('click', function () {
            const uid = b.dataset.applyprop;
            const p = (t.proposals || {})[uid];
            if (!p) return;
            const hard = hardClashAt(t, p.day, p.start, o.dur, [t.id]);
            if (hard) { HV.toast(blockWords(hard)); return; }
            delete t.proposals[uid];
            (t.responses = t.responses || {})[uid] = 'accepted';
            HV.notice(uid, 'task', 'Your proposed time for “' + o.title + '” was applied.', t.clientId);
            HV.closeSheet();
            applyMove(t, rd, p.day, p.start);
          });
        });
      }
    );
  }

  /* the participant's counter-offer: a day + start pair that lands with the
     task's owner (or the allocators) as an applyable proposal */
  function openPropose(t, rd) {
    const o = occursOn(t, rd) || { start: t.start };
    HV.sheet(
      '<div class="h1">Propose a new time</div>' +
      '<p class="sub" style="margin:0">“' + HV.esc(t.title) + '” — your proposal goes to the task’s owner, who can apply it.</p>' +
      '<div class="grid2">' +
        '<span><label class="field-label" for="pp-day">Day</label>' +
        '<select class="input" id="pp-day">' + dayOpts(rd) + '</select></span>' +
        '<span><label class="field-label" for="pp-start">Starts</label>' +
        '<select class="input" id="pp-start">' + timeOpts(o.start) + '</select></span>' +
      '</div>' +
      '<div class="row" style="justify-content:flex-end; flex-wrap:wrap">' +
        '<button class="btn sm ghost" id="pp-cancel">Cancel</button>' +
        '<button class="btn sm" id="pp-send">Send proposal</button>' +
      '</div>',
      function (sheet) {
        sheet.querySelector('#pp-cancel').addEventListener('click', HV.closeSheet);
        sheet.querySelector('#pp-send').addEventListener('click', function () {
          const me = HV.me();
          const day = Number(sheet.querySelector('#pp-day').value);
          const start = Number(sheet.querySelector('#pp-start').value);
          (t.proposals = t.proposals || {})[me.id] = { day: day, start: start };
          (t.responses = t.responses || {})[me.id] = 'resched';
          proposalRecipients(t).forEach(function (id) {
            HV.notice(id, 'task', first(me.name) + ' proposes ' + dayName(day) + ' ' + fmtT(start) +
              ' for “' + t.title + '”.', t.clientId);
          });
          HV.save(); HV.closeSheet(); repaint(null);
          HV.toast('Proposal sent — the owner can apply it from the task.');
        });
      }
    );
  }

  function openDelete(t, rd) {
    if (!t.recur) {
      HV.store.tasks = tasksAll().filter(function (x) { return x.id !== t.id; });
      HV.save(); repaint(null); HV.toast('Task deleted.');
      return;
    }
    HV.sheet(
      '<div class="h1">Delete a repeating task</div>' +
      '<p class="sub" style="margin:0">“' + HV.esc(t.title) + '” repeats. What should go?</p>' +
      '<div class="row" style="justify-content:flex-end; flex-wrap:wrap">' +
        '<button class="btn sm ghost" id="dl-cancel">Cancel</button>' +
        '<button class="btn sm ghost" id="dl-one">Only ' + dayName(rd) + '</button>' +
        '<button class="btn sm" id="dl-all">Whole series</button>' +
      '</div>',
      function (sheet) {
        sheet.querySelector('#dl-cancel').addEventListener('click', HV.closeSheet);
        sheet.querySelector('#dl-one').addEventListener('click', function () {
          (t.exc = t.exc || {})[rd] = { cancelled: true };
          HV.save(); HV.closeSheet(); repaint(null);
          HV.toast('That occurrence is gone; the series continues.');
        });
        sheet.querySelector('#dl-all').addEventListener('click', function () {
          HV.store.tasks = tasksAll().filter(function (x) { return x.id !== t.id; });
          HV.save(); HV.closeSheet(); repaint(null);
          HV.toast('Series deleted.');
        });
      }
    );
  }

  /* ---------------- create / edit sheet ---------------- */
  function timeOpts(sel) {
    let s = '';
    for (let m = T(H0); m <= T(20, 45); m += SNAP) {
      s += '<option value="' + m + '"' + (m === sel ? ' selected' : '') + '>' + fmtT(m) + '</option>';
    }
    return s;
  }
  function dayOpts(sel) {
    let s = '';
    for (let rd = -7; rd <= 21; rd++) {
      const label = rd === 0 ? 'Today' : rd === 1 ? 'Tomorrow' : rd === -1 ? 'Yesterday'
        : dayName(rd) + ' ' + dayDate(rd).getDate();
      s += '<option value="' + rd + '"' + (rd === sel ? ' selected' : '') + '>' + label + '</option>';
    }
    return s;
  }

  /* t=null → create; t + rd → edit (recurring tasks ask occurrence-vs-series) */
  function openTaskSheet(t, rd, prefill) {
    const isNew = !t;
    const base = t ? occursOn(t, rd) || { start: t.start, dur: t.dur, title: t.title, link: t.link, notes: t.notes } : null;
    const v = {
      title: t ? base.title : (prefill && prefill.title) || '',
      kind: t ? t.kind : 'internal',
      clientId: t ? t.clientId || '' : '',
      day: t ? rd : (prefill && prefill.day != null ? prefill.day : 0),
      start: t ? base.start : (prefill && prefill.start != null ? prefill.start : T(10, 0)),
      dur: t ? base.dur : (prefill && prefill.dur) || 30,
      link: t ? base.link : '',
      notes: t ? base.notes : '',
      recur: t ? (t.recur ? t.recur.freq : '') : '',
      assignees: t ? (t.assignees || []).slice() : (prefill && prefill.assignees) || [],
      groups: t ? (t.groups || []).slice() : [],
      allowOverlap: t ? !!t.allowOverlap : false,
      /* absent means required, so a task authored before this field existed
         still asks for its report. Only an explicit refusal is stored. */
      reportRequired: t ? t.reportRequired !== false : true,
    };
    const DUR = [15, 30, 45, 60, 90, 120];
    const staff = staffAll();

    HV.sheet(
      '<div class="h1">' + (isNew ? 'New task' : 'Edit task') + '</div>' +
      (!isNew && t.recur
        ? '<div class="vtog" role="group" aria-label="Apply to"><button data-scope="one" class="on" aria-pressed="true">Only this occurrence</button><button data-scope="all" aria-pressed="false">Whole series</button></div>'
        : '') +
      '<label class="field-label" for="tf-title">Title</label>' +
      '<input class="input" id="tf-title" value="' + HV.esc(v.title) + '" placeholder="What happens?">' +
      '<div class="grid2">' +
        '<span><label class="field-label" for="tf-kind">Kind</label>' +
        '<select class="input" id="tf-kind">' +
          Object.keys(KINDS).map(function (k) {
            return '<option value="' + k + '"' + (v.kind === k ? ' selected' : '') + '>' + KINDS[k].name + '</option>';
          }).join('') + '</select></span>' +
        '<span><label class="field-label" for="tf-client">Client (optional)</label>' +
        '<select class="input" id="tf-client"><option value="">—</option>' +
          HV.store.clients.map(function (c) {
            return '<option value="' + c.id + '"' + (v.clientId === c.id ? ' selected' : '') + '>' + HV.esc(c.name) + '</option>';
          }).join('') + '</select></span>' +
      '</div>' +
      '<div class="grid3 tight">' +
        '<span><label class="field-label" for="tf-day">Day</label>' +
        '<select class="input" id="tf-day">' + dayOpts(v.day) + '</select></span>' +
        '<span><label class="field-label" for="tf-start">Starts</label>' +
        '<select class="input" id="tf-start">' + timeOpts(v.start) + '</select></span>' +
        '<span><label class="field-label" for="tf-dur">Length</label>' +
        '<select class="input" id="tf-dur">' +
          DUR.map(function (d) { return '<option value="' + d + '"' + (v.dur === d ? ' selected' : '') + '>' + (d < 60 ? d + ' min' : (d / 60) + ' h') + '</option>'; }).join('') +
        '</select></span>' +
      '</div>' +
      '<span id="tf-recur-wrap"><label class="field-label" for="tf-recur">Repeats</label>' +
      '<select class="input" id="tf-recur">' +
        '<option value=""' + (v.recur === '' ? ' selected' : '') + '>Does not repeat</option>' +
        '<option value="daily"' + (v.recur === 'daily' ? ' selected' : '') + '>Daily</option>' +
        '<option value="alt"' + (v.recur === 'alt' ? ' selected' : '') + '>Alternate days (session rhythm)</option>' +
        '<option value="weekly"' + (v.recur === 'weekly' ? ' selected' : '') + '>Weekly</option>' +
      '</select></span>' +
      '<label class="field-label" id="tf-people-l">People — individuals</label>' +
      '<div id="tf-people" role="group" aria-labelledby="tf-people-l">' + staff.map(function (u) {
        const on = v.assignees.indexOf(u.id) !== -1;
        return '<button class="chip' + (on ? ' sel' : '') + '" data-pe="' + u.id + '" aria-pressed="' + on + '">' +
          HV.ui.avatar(u.name, 'sm') + ' ' + HV.esc(first(u.name)) + '</button>';
      }).join('') + '</div>' +
      '<label class="field-label" id="tf-groups-l">People — groups</label>' +
      '<div id="tf-groups" role="group" aria-labelledby="tf-groups-l">' + groupsAll().map(function (g) {
        const on = v.groups.indexOf(g.id) !== -1;
        return '<button class="chip' + (on ? ' sel' : '') + '" data-gr="' + g.id + '" aria-pressed="' + on + '">' +
          HV.ui.icon('users') + ' ' + HV.esc(g.name) + '</button>';
      }).join('') + '</div>' +
      '<label class="field-label" for="tf-link">Meeting link</label>' +
      '<input class="input" id="tf-link" value="' + HV.esc(v.link) + '" placeholder="https://meet.google.com/…" inputmode="url">' +
      '<label class="field-label" for="tf-notes">Notes</label>' +
      '<textarea class="input" id="tf-notes" rows="2" placeholder="Agenda, SOP step, anything the team should read first…">' + HV.esc(v.notes) + '</textarea>' +
      '<label class="row sch3-noov"><input type="checkbox" id="tf-allowov"' + (v.allowOverlap ? ' checked' : '') + '> ' +
        'Allow this task to overlap another — they run both, in their own order</label>' +
      '<label class="row sch3-noov" id="tf-repreq-wrap"><input type="checkbox" id="tf-repreq"' + (v.reportRequired ? ' checked' : '') + '> ' +
        'Require a session report from every staff attendee once it ends</label>' +
      '<div id="tf-tz"></div><div id="tf-avail"></div>' +
      '<div id="tf-clash"></div>' +
      '<div class="row" style="justify-content:flex-end">' +
        '<button class="btn ghost" id="tf-cancel">Cancel</button>' +
        '<button class="btn" id="tf-save">' + (isNew ? 'Add to calendar' : 'Save') + '</button>' +
      '</div>',
      function (sheet) {
        let scope = 'one';
        sheet.querySelectorAll('[data-scope]').forEach(function (b) {
          b.addEventListener('click', function () {
            scope = b.dataset.scope;
            sheet.querySelectorAll('[data-scope]').forEach(function (x) {
              x.classList.toggle('on', x === b);
              x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
            });
            /* occurrence edits can't change the rhythm — only the series can */
            sheet.querySelector('#tf-recur-wrap').style.display = scope === 'one' ? 'none' : '';
          });
        });
        if (!isNew && t.recur) sheet.querySelector('#tf-recur-wrap').style.display = 'none';

        /* live, non-blocking hints: the client's own clock for the chosen
           slot, and anyone the slot falls outside the declared week of */
        function readForm() {
          return {
            day: Number(sheet.querySelector('#tf-day').value),
            start: Number(sheet.querySelector('#tf-start').value),
            dur: Number(sheet.querySelector('#tf-dur').value),
            clientId: sheet.querySelector('#tf-client').value || null,
            assignees: Array.prototype.map.call(sheet.querySelectorAll('[data-pe].sel'), function (b) { return b.dataset.pe; }),
            groups: Array.prototype.map.call(sheet.querySelectorAll('[data-gr].sel'), function (b) { return b.dataset.gr; }),
          };
        }
        function liveHints() {
          const f = readForm();
          sheet.querySelector('#tf-tz').innerHTML = tzLineFor(f.clientId ? HV.client(f.clientId) : null, f.start);
          const outs = outsideAvail(taskPeople({ assignees: f.assignees, groups: f.groups }), f.day, f.start, f.dur);
          sheet.querySelector('#tf-avail').innerHTML = outs.length
            ? '<div class="notice warn">Outside declared availability: ' +
              outs.slice(0, 4).map(HV.esc).join(' · ') +
              (outs.length > 4 ? ' · +' + (outs.length - 4) + ' more' : '') +
              ' — a soft warning, not a block.</div>'
            : '';
        }
        sheet.querySelectorAll('[data-pe],[data-gr]').forEach(function (ch) {
          ch.addEventListener('click', function () {
            ch.classList.toggle('sel');
            ch.setAttribute('aria-pressed', ch.classList.contains('sel') ? 'true' : 'false');
            liveHints();
          });
        });
        /* the report switch only means something where a report could be owed:
           a client's session or meeting. A team internal has no client record
           to file against, and the all-hands would otherwise conscript twelve
           people into writing one. Hidden, not disabled — an unusable tick is
           a question the author cannot answer. */
        function repVis() {
          const k = sheet.querySelector('#tf-kind').value;
          const hasClient = !!sheet.querySelector('#tf-client').value;
          const on = (k === 'session' || k === 'meeting') && hasClient;
          sheet.querySelector('#tf-repreq-wrap').style.display = on ? '' : 'none';
        }
        ['#tf-day', '#tf-start', '#tf-dur', '#tf-client'].forEach(function (sel) {
          sheet.querySelector(sel).addEventListener('change', liveHints);
        });
        ['#tf-kind', '#tf-client'].forEach(function (sel) {
          sheet.querySelector(sel).addEventListener('change', repVis);
        });
        liveHints(); repVis();
        sheet.querySelector('#tf-cancel').addEventListener('click', HV.closeSheet);

        sheet.querySelector('#tf-save').addEventListener('click', function () {
          const title = sheet.querySelector('#tf-title').value.trim();
          if (!title) { HV.toast('Give the task a name first.'); return; }
          const day = Number(sheet.querySelector('#tf-day').value);
          const start = Number(sheet.querySelector('#tf-start').value);
          const dur = Number(sheet.querySelector('#tf-dur').value);
          const kind = sheet.querySelector('#tf-kind').value;
          const clientId = sheet.querySelector('#tf-client').value || null;
          const link = sheet.querySelector('#tf-link').value.trim();
          const notes = sheet.querySelector('#tf-notes').value.trim();
          const recurSel = sheet.querySelector('#tf-recur').value;
          const assignees = Array.prototype.map.call(sheet.querySelectorAll('[data-pe].sel'), function (b) { return b.dataset.pe; });
          const groups = Array.prototype.map.call(sheet.querySelectorAll('[data-gr].sel'), function (b) { return b.dataset.gr; });
          if (!assignees.length && !groups.length) { HV.toast('Add at least one person or group.'); return; }
          const allowOv = sheet.querySelector('#tf-allowov').checked;
          const repReq = sheet.querySelector('#tf-repreq').checked;

          /* THE TWO CHECKS (TJ, 17 Aug 2026), and both refuse: is anyone
             already holding these minutes, and is everyone actually working
             then. Consent to overlap is given by the tick BEFORE saving, so
             there is no "warn, then offer a parallel box" afterthought — a
             clash the author has not already permitted is simply refused. */
          const people = taskPeople({ assignees: assignees, groups: groups });
          const conf = conflictsAt(people, day, start, dur, t ? [t.id] : null, allowOv, assignees);
          if (conf.length) {
            const busy = conf.some(function (c) { return c.type === 'busy'; });
            sheet.querySelector('#tf-clash').innerHTML =
              '<div class="notice bad"><b>Blocked:</b> ' + clashWords(conf) +
              (busy ? ' — tick “Allow this task to overlap” above, or pick another time.'
                    : ' — pick a time inside their working week.') + '</div>';
            return;
          }

          if (isNew) {
            const nt = mk({ title: title, kind: kind, clientId: clientId,
              pillar: kind === 'session' ? pillarOf(assignees[0]) : null,
              assignees: assignees, groups: groups, day: day, start: start, dur: dur,
              link: link, notes: notes, allowOverlap: allowOv, byId: HV.me() ? HV.me().id : null,
              recur: recurSel ? { freq: recurSel, until: null } : null });
            /* only the refusal is written — absent means required, so nothing
               seeded before this field existed needs a migration */
            if (!repReq) nt.reportRequired = false;
            tasksAll().push(nt);
            HV.toast('On the calendar. Everyone attached can see it now.');
          } else if (t.recur && scope === 'one') {
            if (day !== rd) {
              /* a moved occurrence detaches into its own task. Series-level
                 flags travel with it — a detached occurrence that silently
                 forgot the series said "no report" would start asking again. */
              (t.exc = t.exc || {})[rd] = { cancelled: true };
              const dt = mk({ title: title, kind: kind, clientId: clientId, pillar: t.pillar || null,
                assignees: assignees, groups: groups, day: day, start: start, dur: dur,
                link: link, notes: notes, allowOverlap: t.allowOverlap || false, byId: t.byId || null,
                recur: null });
              if (t.reportRequired === false) dt.reportRequired = false;
              tasksAll().push(dt);
            } else {
              (t.exc = t.exc || {})[rd] = { start: start, dur: dur, title: title, link: link, notes: notes };
            }
            HV.toast('Changed this occurrence only — the series is untouched.');
          } else {
            /* whole series: the Day field was seeded from the OPENED occurrence,
               so its delta slides the whole series (anchor, bound, exceptions
               and done marks together); an untouched Day field is delta 0 and
               the anchor stays put — earlier occurrences survive */
            shiftSeries(t, day - (t.recur ? rd : t.day));
            t.title = title; t.kind = kind; t.clientId = clientId;
            t.assignees = assignees; t.groups = groups;
            t.start = start; t.dur = dur; t.link = link; t.notes = notes;
            t.allowOverlap = allowOv;
            if (repReq) delete t.reportRequired; else t.reportRequired = false;
            t.recur = recurSel ? { freq: recurSel, until: t.recur ? t.recur.until : null } : null;
            HV.toast('Series updated.');
          }
          HV.save(); HV.closeSheet(); repaint(null);
        });
      }
    );
  }

  /* ---------------- drag: move, resize, draw-to-create ---------------- */
  function wireDrag(el) {
    const grid = el.querySelector('.schgrid');
    if (!grid) return;
    let st = null;          /* {kind:'move'|'resize'|'create', ...} */
    let justDragged = false;

    /* ALL tile-opening goes through the real click event — it fires for
       mouse, keyboard (Enter/Space on the button) and read-only roles whose
       pointerdown never arms a drag. A completed drag sets justDragged so
       the release-click doesn't also open the sheet. */
    grid.addEventListener('click', function (e) {
      if (justDragged) { justDragged = false; return; }
      const tile = e.target.closest('[data-tile]');
      if (tile) openDetail(tile.dataset.tile, Number(tile.dataset.rd));
    });

    function colAt(x) {
      const cols = grid.querySelectorAll('.schcol');
      for (let i = 0; i < cols.length; i++) {
        const r = cols[i].getBoundingClientRect();
        if (x >= r.left && x < r.right) return cols[i];
      }
      return null;
    }
    function minAt(col, y) {
      const r = col.getBoundingClientRect();
      return clampMin(snap(T(H0) + (y - r.top) / PXH * 60));
    }

    grid.addEventListener('pointerdown', function (e) {
      justDragged = false;
      const rz = e.target.closest('[data-rz]');
      const tile = e.target.closest('[data-tile]');
      if (tile) {
        const t = taskById(tile.dataset.tile);
        if (!t || !canEdit(t)) return;   /* the click listener opens the sheet */
        const o = occursOn(t, Number(tile.dataset.rd));
        st = { kind: rz ? 'resize' : 'move', t: t, rd: Number(tile.dataset.rd),
          o: o, tile: tile, x0: e.clientX, y0: e.clientY, moved: false };
      } else {
        const col = e.target.closest('.schcol');
        if (!col) return;
        st = { kind: 'create', col: col, rd: Number(col.dataset.col),
          m0: minAt(col, e.clientY), x0: e.clientX, y0: e.clientY, moved: false };
      }
      /* no capture and no preventDefault YET — capturing on pointerdown
         retargets the coming click to the grid, so tiles never open. The
         pointer is captured only once a real drag starts (below). */
    });

    grid.addEventListener('pointermove', function (e) {
      if (!st) return;
      if (!st.moved && Math.abs(e.clientX - st.x0) < 5 && Math.abs(e.clientY - st.y0) < 5) return;
      if (!st.moved) grid.setPointerCapture(e.pointerId);
      st.moved = true;

      if (st.kind === 'move') {
        const col = colAt(e.clientX) || st.tile.parentElement;
        const m = clampMin(snap(st.o.start + (e.clientY - st.y0) / PXH * 60));
        st.toRd = Number(col.dataset.col);
        st.toMin = m;
        if (st.ghost && st.ghost.parentElement !== col) st.ghost.remove(), st.ghost = null;
        if (!st.ghost) {
          st.ghost = st.tile.cloneNode(true);
          st.ghost.classList.add('ghost');
          st.ghost.style.left = '0'; st.ghost.style.width = 'calc(100% - 2px)';
          col.appendChild(st.ghost);
          st.tile.classList.add('lift');
        }
        st.ghost.style.top = ((m - T(H0)) / 60 * PXH).toFixed(1) + 'px';
      } else if (st.kind === 'resize') {
        const end = Math.max(st.o.start + SNAP, snap(st.o.start + st.o.dur + (e.clientY - st.y0) / PXH * 60));
        st.toDur = Math.min(end, T(H1)) - st.o.start;
        st.tile.style.height = Math.max(18, st.toDur / 60 * PXH - 2).toFixed(1) + 'px';
      } else {
        const m1 = minAt(st.col, e.clientY);
        st.a = Math.min(st.m0, m1); st.b = Math.max(st.m0, m1) + SNAP;
        if (!st.ghost) {
          st.ghost = document.createElement('span');
          st.ghost.className = 'drawsel';
          st.col.appendChild(st.ghost);
        }
        st.ghost.style.top = ((st.a - T(H0)) / 60 * PXH).toFixed(1) + 'px';
        st.ghost.style.height = ((st.b - st.a) / 60 * PXH).toFixed(1) + 'px';
      }
    });

    function finish(e) {
      if (!st) return;
      const s = st; st = null;
      if (s.ghost) s.ghost.remove();
      if (s.tile) s.tile.classList.remove('lift');

      if (!s.moved) return;              /* a plain click — the click listener owns it */
      justDragged = true;
      if (s.kind === 'create') {
        openTaskSheet(null, null, { day: s.rd, start: s.a, dur: Math.max(SNAP, s.b - s.a),
          assignees: HV.can('allocate') ? [] : [HV.me().id] });
        return;
      }
      if (s.kind === 'resize') {
        const nd = s.toDur || s.o.dur;
        const hardR = hardClashAt(s.t, s.rd, s.o.start, nd, [s.t.id]);
        if (hardR) { HV.toast(blockWords(hardR)); repaint(null); return; }
        applyTimeChange(s.t, s.rd, s.o.start, nd);
        return;
      }
      if (s.toRd == null || (s.toRd === s.rd && s.toMin === s.o.start)) { repaint(null); return; }
      /* the drag path honours the same hard block as the sheet */
      const hardM = hardClashAt(s.t, s.toRd, s.toMin, s.o.dur, [s.t.id]);
      if (hardM) { HV.toast(blockWords(hardM)); repaint(null); return; }
      applyMove(s.t, s.rd, s.toRd, s.toMin);
    }
    grid.addEventListener('pointerup', finish);
    grid.addEventListener('pointercancel', function () {
      if (st && st.ghost) st.ghost.remove();
      if (st && st.tile) st.tile.classList.remove('lift');
      st = null;
      repaint(null);
    });
  }

  function overlapToast(t, rd, start, dur, alsoExcept) {
    const clash = collisions(taskPeople(t), rd, start, dur, [t.id].concat(alsoExcept || []));
    if (clash.length) {
      HV.toast('Runs alongside ' + clash[0].who + '’s “' + clash[0].what +
        '” — this task is set to allow overlap, so both stand.');
      return true;
    }
    return false;
  }

  /* a resize changes DURATION only — the series branch must not copy the
     occurrence's (possibly exception-moved) start into the series base */
  function applyTimeChange(t, rd, start, dur) {
    const write = function (one) {
      if (one) {
        (t.exc = t.exc || {})[rd] = Object.assign({}, (t.exc || {})[rd], { dur: dur });
      } else {
        t.dur = dur;
        /* stale per-occurrence lengths would silently override the new one */
        Object.keys(t.exc || {}).forEach(function (k) { delete t.exc[k].dur; });
      }
      HV.save(); repaint(null);
      if (!overlapToast(t, rd, start, dur)) HV.toast(one ? 'This occurrence now runs ' + fmtT(start) + '–' + fmtT(start + dur) + '.' : 'Rescheduled to ' + fmtT(start) + '–' + fmtT(start + dur) + '.');
    };
    if (t.recur) askScope(t, function (one) { write(one); });
    else write(false);
  }

  function applyMove(t, fromRd, toRd, toMin) {
    const write = function (one) {
      let detached = null;
      if (one) {
        if (toRd === fromRd) {
          (t.exc = t.exc || {})[fromRd] = Object.assign({}, (t.exc || {})[fromRd], { start: toMin });
        } else {
          const o = occursOn(t, fromRd) || { dur: t.dur, title: t.title, link: t.link, notes: t.notes };
          (t.exc = t.exc || {})[fromRd] = { cancelled: true };
          detached = mk({ title: o.title, kind: t.kind, clientId: t.clientId, pillar: t.pillar || null,
            assignees: (t.assignees || []).slice(), groups: (t.groups || []).slice(),
            day: toRd, start: toMin, dur: o.dur, link: o.link, notes: o.notes,
            allowOverlap: t.allowOverlap || false, byId: t.byId || null, recur: null });
          /* series-level flags travel with the detached copy, same as overlap */
          if (t.reportRequired === false) detached.reportRequired = false;
          tasksAll().push(detached);
        }
      } else {
        shiftSeries(t, toRd - fromRd);
        t.start = toMin;
      }
      HV.save(); repaint(null);
      /* the freshly detached copy must not collide with itself */
      if (!overlapToast(t, toRd, toMin, t.dur, detached ? [detached.id] : null)) {
        HV.toast((one && t.recur ? 'Moved this occurrence to ' : 'Moved to ') + dayName(toRd) + ' ' + fmtT(toMin) + '.');
      }
    };
    if (t.recur) askScope(t, write);
    else write(false);
  }

  function askScope(t, cb) {
    /* repaint first: the drag preview (a dragged-out tile height, a ghost)
       must not survive an Escape or overlay dismissal of this sheet */
    repaint(null);
    HV.sheet(
      '<div class="h1">Change a repeating task</div>' +
      '<p class="sub" style="margin:0">“' + HV.esc(t.title) + '” repeats ' + (t.recur.freq === 'alt' ? 'on alternate days' : t.recur.freq) + '. Apply this change to…</p>' +
      '<div class="row" style="justify-content:flex-end; flex-wrap:wrap">' +
        '<button class="btn sm ghost" id="sc-cancel">Cancel</button>' +
        '<button class="btn sm ghost" id="sc-one">Only this occurrence</button>' +
        '<button class="btn sm" id="sc-all">Whole series</button>' +
      '</div>',
      function (sheet) {
        sheet.querySelector('#sc-cancel').addEventListener('click', function () { HV.closeSheet(); });
        sheet.querySelector('#sc-one').addEventListener('click', function () { HV.closeSheet(); cb(true); });
        sheet.querySelector('#sc-all').addEventListener('click', function () { HV.closeSheet(); cb(false); });
      }
    );
  }

  /* ---------------- view registration ---------------- */
  HV.registerView('schedule', {
    title: 'Schedule',

    /* #/schedule is pure calendar — the work board that used to share this
       screen as a second tab now lives under Work Queues (#/queues/work)
       instead, alongside the rest of the SLA-bound boards. */
    render: function (el) {
      ensureDefaults();
      const days = visibleDays();
      const flt = { people: lensIds, client: fltClient };
      el.innerHTML = STYLE + toolbarHtml(days) +
        wholegHtml() +
        dailiesHtml(days, flt) +
        gridHtml(days, resolveMode()) +
        '<div class="schbar wrap" style="margin-top:calc(var(--s2) * -1)">' +
          '<span class="klegend">' +
            Object.keys(KINDS).map(function (k) {
              return '<span class="kl ' + KINDS[k].cls + '"><i></i>' + KINDS[k].name + '</span>';
            }).join('') +
          '</span>' +
        '</div>' +
        '<p class="audit" style="margin:0">Drag a tile to move it, its lower edge to stretch it, empty grid to create. ' +
        'A clash is refused: nobody holds two things at once unless the task is ticked to allow it. ' +
        'Hatching is time outside the declared working week — a booking there is refused too.</p>';

      el.querySelector('#sch-new').addEventListener('click', function () {
        openTaskSheet(null, null, { day: resolveMode() === 'day' ? anchor : 0,
          assignees: HV.can('allocate') ? [] : [HV.me().id] });
      });
      el.querySelector('#sch-today').addEventListener('click', function () { anchor = 0; repaint('#sch-today'); });
      el.querySelector('#sch-prev').addEventListener('click', function () { anchor -= 1; repaint('#sch-prev'); });
      el.querySelector('#sch-next').addEventListener('click', function () { anchor += 1; repaint('#sch-next'); });
      el.querySelectorAll('[data-vm]').forEach(function (b) {
        b.addEventListener('click', function () {
          const to = b.dataset.vm;
          if (to === resolveMode()) return;
          /* keep the eye where it was: week→day lands on today or the week's Monday */
          anchor = to === 'day' ? (visibleDays().indexOf(0) !== -1 ? 0 : visibleDays()[0]) : 0;
          mode = to;
          repaint('[data-vm="' + to + '"]');
        });
      });
      el.querySelectorAll('[data-goday]').forEach(function (b) {
        b.addEventListener('click', function () { mode = 'day'; anchor = Number(b.dataset.goday); repaint(null); });
      });
      /* wrapped, not passed bare: a listener hands its MouseEvent to the
         function as a first argument, and openLensSheet takes none */
      el.querySelector('#sch-who').addEventListener('click', function () { openLensSheet(); });
      el.querySelectorAll('[data-whodrop]').forEach(function (b) {
        b.addEventListener('click', function () {
          lensIds = lensIds.filter(function (id) { return id !== b.dataset.whodrop; });
          repaint('#sch-who');
        });
      });
      const wclr = el.querySelector('#sch-whoclear');
      if (wclr) wclr.addEventListener('click', function () { lensIds = []; repaint('#sch-who'); });
      el.querySelector('#sch-client').addEventListener('change', function (e) { fltClient = e.target.value; repaint('#sch-client'); });
      el.querySelectorAll('[data-duty]').forEach(function (b) {
        b.addEventListener('click', function () { openDetail(b.dataset.duty, Number(b.dataset.at)); });
      });

      wireDrag(el);

      /* keep the grid where the eye was; first paint lands on the working
         morning, not 7 am */
      const sc = el.querySelector('.schscroll');
      if (sc) sc.scrollTop = keepScroll != null ? keepScroll : 1.5 * PXH;
      keepScroll = null;
    },
  });

  /* the cross-view entry point, published like HV.planui and HV.chatui.
     Group expansion is cover-aware and lives here; core must never reach
     into a view, so the session room asks this file who is actually on a
     task rather than reading t.assignees and missing every group invitee. */
  HV.schedui = {
    taskPeople: taskPeople,
    tasksAll: tasksAll,
  };
})();
