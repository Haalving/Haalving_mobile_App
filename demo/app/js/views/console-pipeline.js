/* HAALVING console — Onboarding (CC-07) and the shared capacity panel.

   v185 (TJ, 16 Aug): the arrivals kanban is retired. Onboarding is now the
   SECOND RAIL of the Clients workspace and reads exactly like the first —
   a list of people on the left, one person open on the right. The two rail
   tabs are "Onboarded" (clients proper) and "Onboarding" (people still
   walking in), and finishing the last step MOVES a person from the second
   list to the first. One geometry, one mental model, one place to look.

   v186 (TJ, 16 Aug): the five made-up stages are gone. The flow below IS the
   SOP — HAAL/QMS/OP/2026/01/00, "Operations Process Flow", transcribed step by
   step and task by task with the owning role the document names. Twelve steps
   across four phases, from the first health record to the calendar meeting;
   the thirteenth thing that happens is Day 1 of Level 1, which is exactly the
   moment an arrival stops being an arrival and becomes a client.

   SEQUENTIAL, and enforced rather than suggested: only the CURRENT step's
   tasks can be ticked. Earlier steps are complete by definition of having been
   passed; later steps render locked and inert. A step advances only when every
   one of its tasks is ticked, so "we're on step 7" always means the same thing
   for every arrival and every person reading the board. Stepping back re-opens
   a step with its tasks restored as ticked — it was completed, and pretending
   otherwise would lose work.

   Where a task is a thing the console can actually DO — allocate the team,
   send the welcome, key in the InBody — the task carries an `act` and grows the
   affordance inline, so the checklist is the work rather than a description of
   it happening somewhere else.

   v187 (TJ, 17 Aug): the flow gets a spine. Twelve numbered crumbs across the
   top, grouped by phase, and clicking one OPENS that step in the panel below —
   a closed one to check what was done, a locked one to read what it will ask
   for before you get there. Looking is separated from being: `viewing` is a
   lens the reader points, `p.step` is where the record actually stands, and
   only one of those two is anybody else's business.

   Editing is the other half. A step closed on the way past can be re-opened
   for correction without rewinding the flow to it — but the correction is not
   free: unticking a task in a closed step leaves an OPEN ITEM, the crumb turns
   amber, and nothing advances or promotes until it is closed again. A record
   that says "step 9" while step 3 has a hole in it is worse than one that
   admits the hole.

   Two steps carry a BRIEF as well as a checklist, transcribed from the SOP's
   annexures: the assessment meeting from the Assessment Call Script, and Day 1
   level-setting from the evaluation-to-level mapping. Tasks are what you tick;
   the brief is what you say. They are kept apart deliberately — where the
   script covers ground the process flow does not name as a presenting task
   (Mind Wellness is the live example), the mismatch stays visible instead of
   being quietly reconciled by inventing a task.

   Promotion is the only place in the console that mints a client. It clones a
   client in its observation window purely for SHAPE, then zeroes every reading
   that belongs to the donor — the same contract client-onboard.js's finish()
   keeps, for the same reason: a day-one client must never read somebody else's
   sleep, weight or metabolism. */
(function () {
  'use strict';

  /* ── THE FLOW ──────────────────────────────────────────────────────────
     Verbatim from the SOP, in its order. `by` is a role KEY wherever the
     document names a role that exists in HV.ROLES, so the owner chip always
     shows that role's current title (People & Access can rename a role and
     this list follows). 'team' and 'client' are the two owners the document
     names that are not single seats. */
  var FLOW = [
    /* ---------- PHASE 1 · CLIENT ONBOARDING ---------- */
    { key: 'records', phase: 'Client onboarding', label: 'Health records',
      tasks: [
        { t: 'Collect health records from sales or the client', by: 'admin' },
      ] },
    { key: 'team', phase: 'Client onboarding', label: 'Team allocation',
      tasks: [
        { t: 'Allocate the client team and take approval', by: 'opshead', act: 'capacity' },
        { t: 'Create the WhatsApp group for the team', by: 'admin' },
        { t: 'Send InBody reports and medical records to the group and the doctor', by: 'admin', act: 'inbody' },
      ] },

    /* ---------- PHASE 2 · CLIENT ASSESSMENT MEETING ---------- */
    { key: 'assessprep', phase: 'Assessment meeting', label: 'Prep',
      tasks: [
        { t: 'Coordinate and arrange the assessment call with the client', by: 'admin' },
        { t: 'Send the Google Meet link to the team, core and doctor', by: 'admin' },
        { t: 'Send three reminders on the day — morning, midday, just before', by: 'admin' },
        { t: 'Missed call on the team WhatsApp group 15 minutes before', by: 'admin' },
        { t: 'Team and doctor join 10 minutes early and discuss the client', by: 'admin' },
        { t: 'Accept the client into the meeting on the dot', by: 'admin' },
        { t: 'If the client has not joined — call, and remind in the client group', by: 'admin' },
        { t: 'Post a screenshot of the team waiting for the client', by: 'admin' },
      ] },
    { key: 'assessmeet', phase: 'Assessment meeting', label: 'The meeting',
      note: 'Order of presentation. The script below is what each seat covers.',
      tasks: [
        { t: 'Operations Head presents', by: 'opshead' },
        { t: 'Doctor presents', by: 'doctor' },
        { t: 'Dietitian presents', by: 'dietitian' },
        { t: 'Fitness trainer presents', by: 'fitness' },
        { t: 'Yoga trainer presents', by: 'yoga' },
        /* TJ, 17 Aug: the fourth pillar presents like the other three. The
           call script always had a Mind Wellness segment; the process flow
           did not name it as a presenting task, and that gap is now closed
           rather than annotated. */
        { t: 'Mind Wellness coach presents', by: 'mind' },
        { t: 'Fitness and yoga mock test', by: 'fitness' },
      ],
      briefTitle: 'The call script — what each seat covers',
      briefRef: 'Assessment Call Script · HAAL/QMS/OPS/2026/01/00 Annexure OPS_ · issued 27 Jul 2026, ' +
        'with Mind Wellness raised to a presenting seat alongside the other three pillars (TJ, 17 Aug 2026).',
      brief: [
        { h: 'Opening', by: 'opshead', pts: [
          'Goal, in the client’s own words — weight loss, a medical issue, a specific goal, fatty liver',
          'Vision — longevity. The habits of healthy living are the four pillars; introduce the team and say plainly that they stay with the client throughout the journey',
          'Mission — 77 days to reach the goal, 16 weeks of journey towards longevity, 20 weeks to cement the habits',
          'Data collected alongside the dietitian — name, height, age, weight, BMI, job, inches, injuries, client picture',
        ] },
        { h: 'Health', by: 'doctor', pts: [
          'Any health issues — fatty liver, PCOD / PCOS, thyroid, hypertension, diabetes, and the stage of each',
          'After eating — acidity, bloating, urine shades, constipation, addictions, periods',
        ] },
        { h: 'Nutrition', by: 'dietitian', pts: [
          'The Haalving system of diet — 80% healthy food, 20% food of your liking',
          'Start with 20–25% gene food, 30–35% climate-based food, 40–45% growth food',
          'Smoking and alcohol — no judgement. We guide what to eat that day and the detox the next',
          'Outside food — tell us what is accessible and we guide the choice towards the goal',
          'Snacking — the pros and the cons',
          'The 5-day observation pattern — at least 15 to 20 meal pictures, so the pre-diet plan is built on real days',
          'How Haalving is different — habit creation takes time, and we deliver healthy habits as the product, not a wellness service',
          'Food habits — home-cooked or outside, how many times a week they dine out, preferred likes and dislikes, fried snacks (parippu vada, pazham pori, samosa), gravy, processed food, sugar in a day from tea and biscuits',
          'Close by reassuring — this is habit building. No pressure, no push',
        ] },
        { h: 'Fitness', by: 'fitness', pts: [
          'The phases — build, maintain, protect',
          'Preference — self-workout or with a trainer; online or offline; our trainer, their own, or videos; a professional gym, at home, or the building gym',
          'Trainer asks — any injuries',
          'Preferred workout — cardio (swimming, boxing, cycling, running) or gym work for muscle, with machines and weights',
          'Walking — do they like it, and how much on an average day',
          'Suggest 3 to 4 workout days a week and ask whether that is comfortable',
        ] },
        { h: 'Yoga', by: 'yoga', pts: [
          'Why yoga, in 10 to 20 seconds — flexibility, mobility and breath, tied back to the habits of healthy living',
          'Yoga is low intensity, and one hour burns around 250 kcal — close to an hour at the gym',
          'Ask about pain, low BP, asthma, movement issues, breath issues',
          'Are they comfortable doing breathing exercises?',
          'We prefer 3 yoga days — ask whether they are comfortable starting with 2 a week',
          'Fasting — why this is the best time to start',
        ] },
        { h: 'Mind Wellness', by: 'mind', pts: [
          'Name what is coming — self-doubt, lack of motivation, peer pressure, the feeling that the weight is stuck',
          'Nobody has to go looking elsewhere for answers; the health counselling team knows them better than any social-media expert does',
          'Weekly counselling sessions with our psychologists to clear confusion and refocus on the goal',
          'Weekly meditations for mind wellness',
          'Community programmes and webinars keep them current on what the wellness world is discussing',
        ] },
        /* 'team' rather than 'fitness': the test is run by fitness but scores
           the yoga domain too, and both benches read it when levels are set */
        { h: 'Mock test', by: 'team', pts: [
          'Flexibility — standing forward bend',
          'Mobility — wind-relieving pose, and bound angle / butterfly pose with deep breathing',
          'Balance — tree pose',
          'Score each as a percentage. These three numbers are what Day 1 level-setting reads.',
        ] },
      ] },
    { key: 'assessafter', phase: 'Assessment meeting', label: 'Immediately after',
      tasks: [
        { t: 'Add the client to the WhatsApp group', by: 'admin' },
        { t: 'Send the welcome message', by: 'admin', act: 'welcome' },
        { t: 'Send do’s & don’ts, daily activity and daily updates', by: 'admin' },
        { t: 'CRM data collection', by: 'admin' },
        { t: 'Request body measurements', by: 'fitness' },
        { t: 'Add the client to the 7-11 progress sheet', by: 'opshead' },
        { t: 'Add the client to the level change sheet', by: 'admin' },
        { t: 'Add the client to the calorie sheet', by: 'admin' },
        { t: 'Add the client to the worklist', by: 'team' },
        { t: 'Add the client to the trainer incentive tracker', by: 'admin' },
      ] },

    /* ---------- PHASE 3 · OBSERVATION, 5 DAYS ---------- */
    { key: 'obs1', phase: 'Observation · 5 days', label: 'Day 1',
      tasks: [
        { t: 'Goal setting with the team', by: 'opshead' },
        { t: 'Level setting with the concerned departments', by: 'team' },
        { t: 'Approval of the goal and the levels', by: 'core' },
        { t: 'Compile the assessment data and goal, send to the client group', by: 'opshead' },
        { t: 'Send any newly received health records to the client group', by: 'client' },
        { t: 'Follow-up message for food updates — three times', by: 'dietitian' },
        { t: 'Star rating, motivation and suggestions — 20-second voice note', by: 'dietitian' },
        { t: 'Daily activity reminder — steps, water, sleep, screen time', by: 'fitness' },
        { t: 'Track the last three steps in the follow-up tracker', by: 'admin' },
      ],
      briefTitle: 'Mapping the evaluation to a starting level',
      briefRef: 'Mapping evaluation to starting level · issued 27 Jul 2026. Four levels are set here, one per pillar — ' +
        'they move independently from this point on, and no single number stands for all four.',
      brief: [
        { h: 'What the assessment tells you', pts: [
          'Profession, and activity level',
          'Body pain, movement issues, breathing issues, asthma',
          'Thyroid, hypertension, diabetes — and the stage of each',
          'Acidity and bloating; period-related issues',
          'Sleep quality and stress level',
          'Previous injuries, and previous yoga experience',
          'Specific conditions — PCOD, fatty liver, disc bulge and the like',
        ] },
        { h: 'The mock-test score', pts: [
          'Flexibility — standing forward bend',
          'Mobility — wind-relieving pose, and bound angle / butterfly pose with deep breathing',
          'Balance — tree pose',
        ] },
        { h: 'Reading the score', pts: [
          'Below 50% — sedentary',
          'Below 75% — moderate',
          '80% and above — active',
          'The medical conditions above and any previous yoga experience are weighed on top of the band, never replaced by it',
        ] },
      ] },
    { key: 'obs2', phase: 'Observation · 5 days', label: 'Day 2',
      tasks: [
        /* TJ, 17 Aug: four pillars, four charts, one line each.
           The SOP carried "the fitness and yoga charts" as a single line owned
           by fitness, which the coach lens turns into a real fault — the yoga
           bench would see the approval gate but not the task that builds their
           own chart. One line per bench is what makes each seat's view true.
           The creation lines sit BEFORE the approval, because a chart is signed
           after it exists, and the heads sign all four together. */
        { t: 'Create the fitness chart from assessment and level data', by: 'fitness' },
        { t: 'Create the yoga chart from assessment and level data', by: 'yoga' },
        { t: 'Create the mind wellness chart — counselling sessions and weekly meditations', by: 'mind' },
        /* 'team', not 'yoga': every bench that made a chart takes it to its
           head, so the approval gate belongs to all four */
        { t: 'Take approval from the department heads', by: 'team' },
      ] },
    { key: 'obs4', phase: 'Observation · 5 days', label: 'Day 4',
      note: 'The observation window extends until 10 meal pictures are in — that is a client-side bottleneck, not a failure.',
      tasks: [
        { t: 'If fewer than 10 meal pictures are in, start preparing the diet plan', by: 'dietitian' },
        { t: 'Complete data collection — fitness chart, yoga chart, mind wellness chart, approved diet plan, current weight', by: 'team' },
        { t: 'Ensure data collection is complete by 12:00', by: 'opshead' },
        { t: 'Hand over the collected data for calendar preparation', by: 'admin' },
        { t: 'Contact the client for calendar-meeting availability — call and message the group', by: 'admin' },
      ] },
    { key: 'obs5', phase: 'Observation · 5 days', label: 'Day 5',
      tasks: [
        { t: 'Complete calendar preparation by 12:00', by: 'team' },
        { t: 'Verify and approve the calendar from operations at 13:00', by: 'opshead' },
        { t: 'Confirm the client’s availability for the meeting', by: 'admin' },
        { t: 'Client team sits with management for the follow-up discussion', by: 'core' },
      ] },

    /* ---------- PHASE 4 · CALENDAR MEETING ---------- */
    { key: 'calprep', phase: 'Calendar meeting', label: 'Prep',
      tasks: [
        { t: 'Coordinate and arrange the calendar call with the client', by: 'admin' },
        { t: 'Send the Google Meet link to the team, core and doctor', by: 'admin' },
        { t: 'Send three reminders on the day — morning, midday, just before', by: 'admin' },
        { t: 'Missed call on the team WhatsApp group 15 minutes before', by: 'admin' },
        { t: 'Team and doctor join 10 minutes early and discuss the client', by: 'admin' },
        { t: 'Accept the client into the meeting on the dot', by: 'admin' },
        { t: 'If the client has not joined — call, and remind in the client group', by: 'admin' },
        { t: 'Post a screenshot of the team waiting for the client', by: 'admin' },
      ] },
    { key: 'calmeet', phase: 'Calendar meeting', label: 'The meeting',
      note: 'Order of conversation.',
      tasks: [
        { t: 'Explain the goal and the 7-level process', by: 'opshead' },
        { t: 'Explain happy habits and health concerns', by: 'doctor' },
        { t: 'Explain the pre / customised diet plan', by: 'dietitian' },
        { t: 'Explain the workout chart and session dates', by: 'fitness' },
        { t: 'Explain the yoga chart and session dates', by: 'yoga' },
        /* parity with the assessment call — the fourth pillar has an arc to
           explain here too, and three-of-four presenting is what made Mind
           Wellness look optional in the first place */
        { t: 'Explain the counselling arc and the weekly meditations', by: 'mind' },
        { t: 'Inform and educate the client on the result of deviation', by: 'opshead' },
      ] },
    { key: 'calafter', phase: 'Calendar meeting', label: 'Immediately after',
      tasks: [
        { t: 'Send the calendar in the client group', by: 'admin' },
        { t: 'Send the diet plan in the client group', by: 'dietitian' },
        { t: 'Send the happy habits poster in the client group', by: 'dietitian' },
        { t: 'Send any other posters', by: 'admin' },
      ] },
  ];

  /* the phases, in order, each with the steps under it */
  function phases() {
    var out = [], seen = {};
    FLOW.forEach(function (s, i) {
      if (!seen[s.phase]) { seen[s.phase] = { name: s.phase, steps: [] }; out.push(seen[s.phase]); }
      seen[s.phase].steps.push({ step: s, i: i });
    });
    return out;
  }

  function stepIndex(k) {
    for (var i = 0; i < FLOW.length; i++) if (FLOW[i].key === k) return i;
    return 0;
  }
  function stepDef(k) { return FLOW[stepIndex(k)]; }
  function ownerTitle(by) {
    if (by === 'team') return 'Team';
    if (by === 'client') return 'Client';
    var r = HV.roleDef(by);
    return r ? r.title : by;
  }

  /* ticks live under the step key, so stepping back and forth never mixes two
     steps' progress: p.ticks['assessprep#3'] === true */
  function tickKey(stepKey, i) { return stepKey + '#' + i; }
  function isTicked(p, stepKey, i) { return !!(p.ticks || {})[tickKey(stepKey, i)]; }
  function tickedCount(p, s) {
    var n = 0;
    s.tasks.forEach(function (t, i) { if (isTicked(p, s.key, i)) n++; });
    return n;
  }
  function stepComplete(p, s) { return tickedCount(p, s) === s.tasks.length; }

  /* the earliest CLOSED step that is no longer whole — the hole an edit can
     leave behind, and the only reason a step before the current one is ever
     worth looking at twice. -1 when the record has no holes. */
  function firstGap(p) {
    var cur = stepIndex(p.step);
    for (var i = 0; i < cur; i++) if (!stepComplete(p, FLOW[i])) return i;
    return -1;
  }

  /* the last step closed AND nothing left open behind it. Editing made the
     second half necessary: promoting on a record with a hole in step 3 would
     mint a client the SOP was never actually finished for. */
  function readyToFinish(p) {
    return stepIndex(p.step) === FLOW.length - 1 &&
      stepComplete(p, stepDef(p.step)) && firstGap(p) < 0;
  }

  function hasStep(k) {
    for (var i = 0; i < FLOW.length; i++) if (FLOW[i].key === k) return true;
    return false;
  }

  /* WHERE SOMEBODY IS LOOKING and WHERE THE RECORD STANDS are different facts.
     `viewing` is the crumb the reader clicked; `editing` is the closed step
     they unlocked to correct. Both are lenses — module state, never written to
     the record, never persisted, and gone on reload, because neither is
     anybody else's business. `p.step` alone says where the arrival is. */
  var viewing = {}, editing = {};
  function viewKey(p) {
    var k = viewing[p.id];
    return (k && hasStep(k)) ? k : p.step;
  }
  /* only a CLOSED step is ever "being edited" — once the flow steps back onto
     it, it is simply the open step again and needs no unlocking */
  function editKey(p) {
    var k = editing[p.id];
    return (k && hasStep(k) && stepIndex(k) < stepIndex(p.step)) ? k : null;
  }

  /* v186 recorded ticks only for the step somebody was standing on — every
     step behind it was complete BY POSITION, never in the data. v187 has to be
     able to tell "passed" from "passed, and then an edit re-opened it", and
     that is a question only the ticks can answer. So the invariant is made
     real, once, on first read: everything behind the current step carries its
     ticks. ONCE is the whole trick — re-running it on every read would quietly
     re-fill the very untick an edit was for, which is the bug this flag exists
     to prevent, not a detail of it. */
  function heal(p) {
    if (!p) return p;
    p.ticks = p.ticks || {};
    /* v187 recorded this as a boolean, which could not survive the SOP gaining
       a task: a line added to a step an arrival had already walked past would
       never be backfilled, and every such record would show a phantom open
       item for the rest of its life. So the marker counts instead — per step,
       how many of its tasks this record has been reckoned with. A boolean from
       v187/v188 is reset, which re-closes any gap deliberately left open in
       that window; a phantom gap that blocks the flow is the worse of the two. */
    var seen = (p.healed && typeof p.healed === 'object') ? p.healed : (p.healed = {});
    var cur = stepIndex(p.step), changed = false;
    for (var i = 0; i < cur; i++) {
      var s = FLOW[i], from = seen[s.key] || 0;
      if (from >= s.tasks.length) continue;
      /* only the indices this record has never seen — a task it HAS seen and
         somebody unticked on purpose is a decision, and stays untouched */
      for (var ti = from; ti < s.tasks.length; ti++) {
        var k = tickKey(s.key, ti);
        if (!p.ticks[k]) { p.ticks[k] = true; changed = true; }
      }
      seen[s.key] = s.tasks.length;
      changed = true;
    }
    if (changed) HV.save();
    return p;
  }

  function rows() {
    return (HV.store.pipeline || []).map(heal).sort(function (a, b) {
      return stepIndex(b.step) - stepIndex(a.step) || (a.mins || 0) - (b.mins || 0);
    });
  }
  function find(id) {
    return heal((HV.store.pipeline || []).filter(function (p) { return p.id === id; })[0]) || null;
  }
  /* who may move an arrival along. The same permission that allocates a team,
     because that is what every step transition here amounts to. */
  function canRun() { return HV.can('allocate') || HV.can('seeAllClients'); }

  /* ---------------- the coach's lens ----------------
     A coach opens the same record and reads the same STATUS — twelve crumbs,
     every step's own count, where the arrival stands. What narrows is the
     detail: inside a step they see the lines their seat owns and nothing
     else, because sixty-six tasks of somebody else's process is not context,
     it is noise, and it buries the two lines that are actually theirs.

     The line is drawn where it already was: whoever can RUN the flow reads
     all of it, being accountable for every step closing. Everyone else gets
     the lens. No new permission — one rule, already true.

     `null` means no lens at all. */
  function lensRole() {
    if (canRun()) return null;
    var me = HV.me();
    return me ? me.role : null;
  }
  /* 'team' is every coach's line by definition — the SOP uses it for the work
     the client team does together. 'client' is not: those are the lines ops
     chases the client for. */
  function ownedBy(lens, by) { return !lens || by === lens || by === 'team'; }

  function stepPill(p) {
    var s = stepDef(p.step);
    var i = stepIndex(p.step);
    if (firstGap(p) >= 0) return HV.ui.pill('Open item behind', 'bad');
    var tone = readyToFinish(p) ? 'ok' : i >= FLOW.length - 3 ? 'info' : 'neutral';
    return HV.ui.pill(s.phase + ' · ' + s.label, tone);
  }

  /* ---------------- the rail list ----------------
     Deliberately the same row grammar as a client row (.trow.cwrow, avatar,
     name, second line, trailing mark) so switching tabs does not switch
     languages. The trailing mark is where they are in the flow, not an unread
     count, and the second line carries a hairline progress bar because "step 7
     of 12" is a number you feel faster than you read. */
  function railRows(openId, list) {
    list = list || rows();
    if (!list.length) {
      return HV.ui.empty('users', 'Nobody is mid-onboarding.',
        'New sign-ups appear here the moment they register.');
    }
    return list.map(function (p) {
      var on = p.id === openId;
      var i = stepIndex(p.step);
      var s = FLOW[i];
      var done = tickedCount(p, s);
      /* progress across the WHOLE flow: whole steps passed, plus this step's
         own ticks as a fraction of it */
      var pct = Math.round(((i + (s.tasks.length ? done / s.tasks.length : 0)) / FLOW.length) * 100);
      return '<div class="trow click cwrow' + (on ? ' on' : '') + '" data-cid="' + HV.esc(p.id) + '" ' +
        'role="button" tabindex="0"' + (on ? ' aria-current="true"' : '') + '>' +
        HV.ui.avatar(p.name) +
        '<span class="grow"><b>' + HV.esc(p.name) + '</b>' +
          '<small>Step <span class="num">' + (i + 1) + '</span> of <span class="num">' + FLOW.length +
            '</span> · ' + HV.esc(s.label) + ' · <span class="num">' + done + '</span>/<span class="num">' +
            s.tasks.length + '</span> done</small>' +
          '<span class="ob-bar" aria-hidden="true"><i style="width:' + pct + '%"></i></span>' +
        '</span>' +
        /* a hole left by an edit has to be visible from the LIST, not only from
           inside the record — otherwise "step 9 of 12, 4/4 done" reads perfect
           while step 3 sits open, which is the plausible-and-invisible kind of
           wrong this whole screen exists to prevent */
        (readyToFinish(p) ? HV.ui.pill('Ready', 'ok')
          : firstGap(p) >= 0 ? HV.ui.pill('Open item', 'bad') : '') +
      '</div>';
    }).join('');
  }

  /* ---------------- the record ---------------- */
  var OB_CSS = '<style>' +
    /* the rail's hairline progress bar */
    '.ob-bar{display:block;height:3px;border-radius:var(--r-full);background:var(--line);margin-top:6px;overflow:hidden}' +
    '.ob-bar i{display:block;height:100%;background:var(--brand);border-radius:var(--r-full)}' +
    /* the crumb spine — twelve nodes grouped by phase. It WRAPS rather than
       scrolling: a breadcrumb whose job is "where am I among twelve" fails the
       moment some of the twelve are off-screen. Phase groups stay whole, so a
       wrap always falls between phases and never inside one. The overflow rule
       is a floor, not the plan — it only bites below one phase group's width. */
    '.ob-crumbs{display:flex;flex-wrap:wrap;gap:var(--s4) var(--s5);overflow-x:auto;' +
      'padding:var(--s3) var(--s4);margin:var(--s3) 0;background:var(--surface-2);' +
      'border-radius:var(--r-md)}' +
    '.ob-crgrp{flex:none}' +
    '.ob-crph{display:block;font-size:var(--t-micro);font-weight:600;letter-spacing:.14em;' +
      'text-transform:uppercase;color:var(--ink-3);margin-bottom:var(--s2);white-space:nowrap}' +
    '.ob-crrow{display:flex;align-items:flex-start}' +
    '.ob-cr{position:relative;flex:none;width:66px;padding:0;border:0;background:none;font:inherit;' +
      'color:var(--ink-3);cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:var(--s1)}' +
    /* the rail runs BEHIND the dots, drawn as two half-segments per node so the
       first and last of a phase stop at their own dot */
    '.ob-cr::before,.ob-cr::after{content:"";position:absolute;top:11px;height:2px;background:var(--line)}' +
    '.ob-cr::before{left:0;right:50%}' +
    '.ob-cr::after{left:50%;right:0}' +
    '.ob-cr:first-child::before,.ob-cr:last-child::after{display:none}' +
    '.ob-crd{position:relative;z-index:1;width:24px;height:24px;border-radius:var(--r-full);' +
      'display:flex;align-items:center;justify-content:center;background:var(--surface-3);' +
      'color:var(--ink-3);font-family:var(--f-data);font-size:var(--t-micro);' +
      'box-shadow:0 0 0 3px var(--surface-2)}' +
    '.ob-crd svg{width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}' +
    '.ob-crl{font-size:var(--t-micro);line-height:1.25;text-align:center}' +
    '.ob-cr.done .ob-crd{background:var(--ok);color:#fff}' +
    '.ob-cr.now .ob-crd{background:var(--brand-fill);color:#fff}' +
    '.ob-cr.gap .ob-crd{background:var(--danger-fill);color:#fff}' +
    '.ob-cr.on .ob-crl{color:var(--ink);font-weight:600}' +
    '.ob-cr.on .ob-crd{box-shadow:0 0 0 3px var(--surface-2),0 0 0 5px var(--brand)}' +
    '.ob-cr:focus-visible{outline:2px solid var(--brand);outline-offset:2px;border-radius:var(--r-sm)}' +
    /* the flow */
    '.ob-phase{margin-top:var(--s4)}' +
    '.ob-phase:first-child{margin-top:0}' +
    '.ob-phname{font-size:var(--t-micro);font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3);' +
      'display:flex;align-items:center;gap:var(--s2);margin-bottom:var(--s2)}' +
    '.ob-step{display:grid;grid-template-columns:auto 1fr auto;gap:var(--s3);align-items:start;padding:var(--s3) 0}' +
    '.ob-step + .ob-step{border-top:1px solid var(--line)}' +
    '.ob-dot{width:24px;height:24px;border-radius:var(--r-full);flex:none;display:flex;align-items:center;justify-content:center;' +
      'background:var(--surface-3);color:var(--ink-3);font-family:var(--f-data);font-size:var(--t-micro)}' +
    '.ob-dot svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}' +
    '.ob-step.done .ob-dot{background:var(--ok);color:#fff}' +
    '.ob-step.now .ob-dot{background:var(--brand-fill);color:#fff}' +
    '.ob-step.now > span > b{color:var(--brand)}' +
    /* the hover tint bleeds out on a pseudo-element rather than on the row
       itself: giving a clickable row horizontal padding would make its
       border-top wider than the open row's, and ragged separators are exactly
       the kind of sloppiness a process screen cannot afford */
    '.ob-step.click{cursor:pointer;position:relative}' +
    '.ob-step.click > *{position:relative;z-index:1}' +
    '.ob-step.click::before{content:"";position:absolute;z-index:0;' +
      'inset:2px calc(var(--s3) * -1);border-radius:var(--r-sm);background:transparent}' +
    '.ob-step.click:hover::before{background:var(--surface-3)}' +
    '.ob-step.click:focus-visible{outline:none}' +
    '.ob-step.click:focus-visible::before{background:var(--surface-3);' +
      'outline:2px solid var(--brand);outline-offset:-2px}' +
    '.ob-step.lock{opacity:.5}' +
    /* opacity applies to the outline too, so a focus ring on a locked row
       would arrive at half strength — the one place the dimming must lift.
       The padlock and the "locked until" line carry the state; the fade was
       only ever decoration. */
    '.ob-step.lock.click:hover,.ob-step.lock.click:focus-visible{opacity:1}' +
    /* a locked step you deliberately opened is being read, not skipped — it
       gets its full contrast back for as long as it is open */
    '.ob-step.lock.open{opacity:1}' +
    '.ob-step.gap .ob-dot{background:var(--danger-fill);color:#fff}' +
    '.ob-step.gap > span > b{color:var(--danger)}' +
    '.ob-step small{display:block;color:var(--ink-3)}' +
    /* the current step\'s task list */
    '.ob-tasks{display:flex;flex-direction:column;margin-top:var(--s3);' +
      'background:var(--surface-2);border-radius:var(--r-md);padding:var(--s2) var(--s3)}' +
    '.ob-task{display:flex;align-items:flex-start;gap:var(--s3);padding:var(--s3) 0;min-height:44px}' +
    '.ob-task + .ob-task{border-top:1px solid var(--line)}' +
    '.ob-task input{accent-color:var(--brand);width:18px;height:18px;flex:none;margin-top:2px;cursor:pointer}' +
    '.ob-task input:disabled{cursor:not-allowed}' +
    '.ob-task .tt{flex:1;min-width:0;font-size:var(--t-sm);line-height:1.45}' +
    '.ob-task.on .tt{color:var(--ink-3);text-decoration:line-through}' +
    '.ob-who{font-size:var(--t-micro);font-weight:600;letter-spacing:.06em;text-transform:uppercase;' +
      'color:var(--ink-3);background:var(--surface-3);border-radius:var(--r-full);padding:2px 8px;white-space:nowrap;flex:none}' +
    /* the inline affordance sits UNDER its task text, never beside it — a
       span left inline overlaps the sentence it belongs to */
    '.ob-sub{display:block;margin-top:var(--s2)}' +
    '.ob-sub:empty{display:none}' +
    '.ob-acts{display:flex;flex-wrap:wrap;gap:var(--s2);margin-top:var(--s3)}' +
    '.ob-cap{display:flex;flex-direction:column;gap:var(--s2);margin-top:var(--s2)}' +
    '.ob-edit{display:flex;flex-wrap:wrap;align-items:center;gap:var(--s3);margin-top:var(--s3)}' +
    /* the brief — what is SAID in a session, kept plainly apart from the
       checklist of what is DONE in it */
    '.ob-brief{margin-top:var(--s4);border-top:1px solid var(--line);padding-top:var(--s3)}' +
    '.ob-bh{font-size:var(--t-micro);font-weight:600;letter-spacing:.14em;' +
      'text-transform:uppercase;color:var(--ink-3)}' +
    '.ob-bblk{margin-top:var(--s3)}' +
    '.ob-bhead{display:flex;align-items:center;gap:var(--s2);flex-wrap:wrap}' +
    '.ob-bhead b{font-size:var(--t-sm)}' +
    '.ob-bblk ul{margin:var(--s1) 0 0;padding-left:var(--s4)}' +
    '.ob-bblk li{font-size:var(--t-sm);line-height:1.5;color:var(--ink-2);margin-top:var(--s1)}' +
    '</style>';

  /* one task row. `live` is whether this box moves — the current step always,
     a closed step only while it is unlocked for correction. That is where the
     "sequential" promise is actually kept, not in the copy. `acts` is narrower
     still: the do-it-here affordances belong to the OPEN step only, because
     re-running "send the welcome" from a step closed a week ago would send a
     second welcome. */
  function taskHtml(p, s, t, i, live, acts) {
    var on = isTicked(p, s.key, i);
    var id = 'ob-t-' + s.key + '-' + i;
    /* the input is NESTED in the label, so it is already associated with it —
       adding for="" as well makes a click on the box toggle it twice and land
       back where it started */
    return '<label class="ob-task' + (on ? ' on' : '') + '">' +
      '<input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') +
        (live && canRun() ? '' : ' disabled') +
        ' data-tick="' + HV.esc(s.key) + ':' + i + '">' +
      '<span class="tt">' + HV.esc(t.t) +
        (t.act && acts ? '<span class="ob-sub" data-actslot="' + HV.esc(t.act) + '"></span>' : '') +
      '</span>' +
      '<span class="ob-who">' + HV.esc(ownerTitle(t.by)) + '</span>' +
    '</label>';
  }

  /* the brief: what is SAID in this session, transcribed from the annexure the
     step names. Never mixed into the checklist — a line you say is not a line
     you tick, and blurring the two is how a script becomes busywork. */
  function briefHtml(s, lens) {
    if (!s.brief) return '';
    /* a block with no `by` is shared ground, not somebody's script — the
       level-setting criteria are the case, and every bench reads those */
    var blocks = s.brief.filter(function (b) { return ownedBy(lens, b.by) || !b.by; });
    if (!blocks.length) return '';
    return '<div class="ob-brief">' +
      '<div class="ob-bh">' + HV.esc(s.briefTitle || 'The brief') + '</div>' +
      blocks.map(function (b) {
        return '<div class="ob-bblk">' +
          '<div class="ob-bhead"><b>' + HV.esc(b.h) + '</b>' +
            (b.by ? '<span class="ob-who">' + HV.esc(ownerTitle(b.by)) + '</span>' : '') + '</div>' +
          '<ul>' + b.pts.map(function (t) { return '<li>' + HV.esc(t) + '</li>'; }).join('') + '</ul>' +
        '</div>';
      }).join('') +
      (s.briefRef ? '<p class="audit">' + HV.esc(s.briefRef) + '</p>' : '') +
    '</div>';
  }

  /* one place decides how a step reads, so the crumb, the row and the tick
     handler can never disagree about what state it is in */
  function stepState(p, i) {
    var cur = stepIndex(p.step);
    if (i < cur) return stepComplete(p, FLOW[i]) ? 'done' : 'gap';
    return i === cur ? 'now' : 'lock';
  }
  function stepMeta(p, i) {
    var s = FLOW[i], st = stepState(p, i);
    var done = tickedCount(p, s), open = s.tasks.length - done;
    var word = s.tasks.length === 1 ? 'task' : 'tasks';
    if (st === 'gap') {
      return '<span class="num">' + open + '</span> open ' + (open === 1 ? 'task' : 'tasks') +
        ' — this step was closed, and an edit re-opened it';
    }
    if (st === 'done') return '<span class="num">' + s.tasks.length + '</span> ' + word + ' complete';
    if (st === 'now') return '<span class="num">' + done + '</span> of <span class="num">' + s.tasks.length + '</span> done';
    return '<span class="num">' + s.tasks.length + '</span> ' + word +
      ' · locked until step <span class="num">' + i + '</span> closes';
  }
  function stepDotIcon(p, i) {
    var st = stepState(p, i);
    return st === 'gap' ? HV.ui.icon('warn')
      : st === 'done' ? HV.ui.icon('check')
      : st === 'now' ? '<span class="num">' + (i + 1) + '</span>'
      : HV.ui.icon('lock');
  }

  /* ---------------- the crumb spine ----------------
     Twelve steps is too many to hold in your head and exactly the right number
     to hold on a rail. Each crumb is a real button: it moves the LENS, never
     the record, so a reader can look ahead at the calendar meeting from step 2
     without anything about step 2 changing. */
  function crumbsInner(p) {
    var view = stepIndex(viewKey(p));
    return phases().map(function (ph) {
      return '<div class="ob-crgrp"><span class="ob-crph">' + HV.esc(ph.name) + '</span>' +
        '<div class="ob-crrow">' + ph.steps.map(function (x) {
          var i = x.i, s = x.step, st = stepState(p, i);
          var says = st === 'gap' ? 'has an open task'
            : st === 'done' ? 'closed'
            : st === 'now' ? 'open now'
            : 'locked';
          var label = 'Step ' + (i + 1) + ' of ' + FLOW.length + ' · ' + s.label + ' — ' + says;
          return '<button type="button" class="ob-cr ' + st + (i === view ? ' on' : '') + '"' +
            ' data-crumb="' + HV.esc(s.key) + '" title="' + HV.esc(label) + '"' +
            (i === view ? ' aria-current="step"' : '') + '>' +
            '<span class="ob-crd" aria-hidden="true">' + stepDotIcon(p, i) + '</span>' +
            '<span class="ob-crl" aria-hidden="true">' + HV.esc(s.label) + '</span>' +
            '<span class="vh">' + HV.esc(label) + '</span>' +
          '</button>';
        }).join('') + '</div></div>';
    }).join('');
  }
  function crumbsHtml(p) {
    return '<nav class="ob-crumbs" id="ob-crumbs" aria-label="The twelve onboarding steps">' +
      crumbsInner(p) + '</nav>';
  }

  /* the body of whichever step is open: its note, its tasks, its brief, and —
     on a closed step — the way in and out of correcting it */
  function stepBody(p, i) {
    var s = FLOW[i], cur = stepIndex(p.step);
    var closed = i < cur, ahead = i > cur;
    var editingThis = editKey(p) === s.key;
    var live = (i === cur) || editingThis;
    var run = canRun();
    var lens = lensRole();
    /* the original index travels with the task — a filtered list must still
       tick tickKey(step, ORIGINAL i), or a coach's second visible task would
       write to the second task of the step */
    var mine = s.tasks
      .map(function (t, ti) { return { t: t, i: ti }; })
      .filter(function (x) { return ownedBy(lens, x.t.by); });
    var others = s.tasks.length - mine.length;
    var tasksHtml = mine.length
      ? '<div class="ob-tasks">' + mine.map(function (x) {
          return taskHtml(p, s, x.t, x.i, live, (i === cur) && !lens);
        }).join('') + '</div>'
      : '<p class="sub" style="margin:var(--s3) 0 0">No line on this step belongs to your seat.</p>';
    return (s.note ? '<small style="margin-top:var(--s1)">' + HV.esc(s.note) + '</small>' : '') +
      (ahead
        ? '<div class="notice" style="margin-top:var(--s3)">Not open yet. This is what step <span class="num">' +
          (i + 1) + '</span> will ask for — reading it early is how you arrive ready for it.</div>'
        : '') +
      (closed && !editingThis && run
        ? '<div class="ob-edit">' +
            '<button class="btn sm quiet" data-ob="edit" data-step="' + HV.esc(s.key) + '">' +
              HV.ui.icon('pencil') + ' Edit this step</button>' +
            '<span class="sub">Closed on the way past. Open it if something was ticked in error.</span>' +
          '</div>'
        : '') +
      (closed && editingThis
        ? '<div class="notice warn" style="margin-top:var(--s3)">You are editing a closed step. ' +
          'Unticking a task leaves an open item behind, and nothing advances or promotes past it ' +
          'until it is closed again.</div>'
        : '') +
      tasksHtml +
      (lens && others
        ? '<p class="audit"><span class="num">' + others + '</span> other ' +
          (others === 1 ? 'line' : 'lines') + ' on this step belong to other seats. ' +
          'Their progress is in the count above — the step closes when all of them are in.</p>'
        : '') +
      (closed && editingThis
        ? '<div class="ob-edit"><button class="btn sm" data-ob="editdone">Done editing</button></div>'
        : '') +
      briefHtml(s, lens);
  }

  /* the whole flow, grouped by phase: every step a one-liner, the OPEN one —
     whichever the crumbs point at — expanded underneath its own row */
  function trackHtml(p) {
    var cur = stepIndex(p.step);
    var view = stepIndex(viewKey(p));
    return phases().map(function (ph) {
      var rowsHtml = ph.steps.map(function (x) {
        var i = x.i, s = x.step;
        var open = i === view;
        /* a collapsed row IS its own crumb — same action, second door. Only
           collapsed rows carry it: the open one already holds the checkboxes
           and the Edit button, and a click surface wrapped around those would
           be a click surface fighting them. */
        return '<div class="ob-step ' + stepState(p, i) + (open ? ' open' : ' click') +
            '" data-step="' + HV.esc(s.key) + '"' +
            (open ? '' : ' data-open="' + HV.esc(s.key) + '" role="button" tabindex="0"' +
              ' aria-label="Open step ' + (i + 1) + ' of ' + FLOW.length + ' · ' + HV.esc(s.label) + '"') +
            '>' +
          '<span class="ob-dot">' + stepDotIcon(p, i) + '</span>' +
          '<span><b>' + HV.esc(s.label) + '</b><small>' + stepMeta(p, i) + '</small>' +
            (open ? stepBody(p, i) : '') +
          '</span>' +
          (i === cur ? HV.ui.pill('Here now', 'info') : open ? HV.ui.pill('Viewing', 'neutral') : '') +
        '</div>';
      }).join('');
      return '<div class="ob-phase"><div class="ob-phname">' + HV.esc(ph.name) + '</div>' + rowsHtml + '</div>';
    }).join('');
  }

  /* thin capacity bar shared by the allocation picker and the admin capacity list */
  function capBar(c) {
    var pct = Math.min(100, Math.round((c.load / c.cap) * 100));
    var full = c.load >= c.cap;
    return '<div style="height:var(--s1);border-radius:var(--r-full);background:var(--line);margin-top:var(--s1)">' +
      '<div style="height:var(--s1);border-radius:var(--r-full);width:' + pct + '%;background:' +
      (full ? 'var(--danger)' : 'var(--brand)') + '"></div></div>';
  }

  /* the allocation panel, shown on the stage that needs it */
  function capacityHtml() {
    var s = HV.store;
    var totLoad = s.capacity.reduce(function (a, c) { return a + c.load; }, 0);
    var totCap = s.capacity.reduce(function (a, c) { return a + c.cap; }, 0);
    var dial = totCap ? HV.ui.dial(Math.round((totLoad / totCap) * 100), 'Pod load', { size: 'sm' }) : '';
    var capRows = s.capacity.map(function (c) {
      var st = HV.staff(c.staffId);
      var full = c.load >= c.cap;
      return '<div class="row" style="align-items:flex-start">' + HV.ui.avatar(st.name, 'sm') +
        '<span class="grow">' +
          '<span class="row" style="justify-content:space-between">' +
            '<span style="font-size:var(--t-sm)' + (full ? ';color:var(--danger);font-weight:600' : '') + '">' +
              HV.esc(c.roleLabel) + ': ' + HV.esc(st.name) + '</span>' +
            '<span class="num sub">' + c.load + '/' + c.cap + '</span>' +
          '</span>' + capBar(c) +
          (full ? '<span style="display:block;font-size:var(--t-micro);font-weight:600;color:var(--danger);margin-top:var(--s1)">Full — Ops Head override required, reason logged</span>' : '') +
        '</span>' +
        (full ? '<button class="btn sm danger" data-ovr="' + HV.esc(c.staffId) + '">Override</button>' : '') +
      '</div>';
    }).join('');
    return '<div class="card">' +
      '<div class="row" style="justify-content:space-between;align-items:flex-start;gap:var(--s3)">' +
        '<span class="card-title">Team allocation · live capacity</span>' + dial + '</div>' +
      '<div class="ob-cap">' + capRows + '</div>' +
    '</div>';
  }

  function planPickHtml(p) {
    var sale = HV.plansOnSale();
    var chosen = p.plan || sale[0];
    /* which plan an arrival is on is context a coach needs; CHOOSING it is a
       commercial decision they have no part in. Showing them a picker that
       refuses every tap is worse than showing them the fact. */
    if (!canRun()) {
      var pl = HV.PLANS[chosen];
      return '<div class="card"><span class="k">Plan</span>' +
        '<div class="trow" style="margin-top:var(--s2)">' + HV.ui.iconTile('bookmark', 'sm') +
          '<span class="grow"><b>' + HV.esc(pl.name) + '</b><small>' +
            HV.esc(pl.tag) + ' · ' + HV.esc(pl.flow) + '</small></span></div>' +
      '</div>';
    }
    return '<div class="card"><span class="k">Plan</span>' +
      '<div class="list" style="margin-top:var(--s2)">' + Object.keys(HV.PLANS).map(function (k) {
        var pl = HV.PLANS[k];
        var open = sale.indexOf(k) !== -1;
        return '<label class="trow pslot"' + (open ? '' : ' style="opacity:.55"') + '>' +
          '<input type="radio" name="ob-plan" value="' + HV.esc(k) + '"' +
            (k === chosen ? ' checked' : '') + (open ? '' : ' disabled') + '>' +
          '<span class="grow"><b>' + HV.esc(pl.name) + '</b><small>' + HV.esc(pl.tag) + ' · ' + HV.esc(pl.flow) + '</small></span>' +
          (open ? '' : HV.ui.pill('Opening soon', 'neutral')) +
        '</label>';
      }).join('') + '</div>' +
      '<p class="audit" style="margin:var(--s2) 0 0">This launch sells ' +
        HV.esc(sale.map(function (k) { return HV.PLANS[k].name; }).join(' and ')) +
        ' only — every Poorna conversation trains the AI that will run Svayam.</p>' +
    '</div>';
  }

  /* the action row, extracted because a tick has to be able to rebuild JUST
     this — the Close-step button changes label and state, and the promote
     button appears, on every tick of the last step */
  function actsHtml(p) {
    var cur = stepIndex(p.step);
    var view = stepIndex(viewKey(p));
    var s = FLOW[cur];
    var run = canRun();
    var complete = stepComplete(p, s);
    var last = cur === FLOW.length - 1;
    var left = s.tasks.length - tickedCount(p, s);
    var gap = firstGap(p);
    /* the buttons act on where the RECORD is, never on what the reader happens
       to be looking at — so the open step is named on the button itself */
    var nextLabel = gap >= 0
      ? 'Step <span class="num">' + (gap + 1) + '</span> is open behind you'
      : complete
        ? 'Close step <span class="num">' + (cur + 1) + '</span> → ' + HV.esc(FLOW[Math.min(cur + 1, FLOW.length - 1)].label)
        : '<span class="num">' + left + '</span> task' + (left === 1 ? '' : 's') + ' left in step <span class="num">' + (cur + 1) + '</span>';
    /* "Fix" is a verb only somebody who can run the flow has — a coach still
       sees the open item in the flags and the crumb, but not a button that
       promises them a correction they cannot make */
    return (run && gap >= 0
        ? '<button class="btn danger" data-ob="gap">Fix step <span class="num">' + (gap + 1) + '</span> · ' +
          HV.esc(FLOW[gap].label) + '</button>'
        : '') +
      (run && !last
        ? '<button class="btn" data-ob="next"' + (complete && gap < 0 ? '' : ' disabled') + '>' + nextLabel + '</button>'
        : '') +
      (run && readyToFinish(p) ? '<button class="btn" data-ob="promote">Start Level 1 · move to Onboarded</button>' : '') +
      (view !== cur
        ? '<button class="btn ghost" data-ob="tocur">Back to step <span class="num">' + (cur + 1) + '</span> · ' +
          HV.esc(FLOW[cur].label) + '</button>'
        : '') +
      (run && cur > 0 ? '<button class="btn ghost" data-ob="back">Step back</button>' : '');
  }

  /* everything that a tick, a crumb or a step change can alter, in one card —
     so those three things repaint exactly this and leave the rail's scroll,
     the note being typed and the plan picker alone */
  function flagsHtml(p) {
    var gap = firstGap(p);
    return (readyToFinish(p)
        ? '<div class="notice">Every step of the SOP is closed. Moving ' + HV.esc(p.name.split(' ')[0]) +
          ' across creates their client record, opens their Care Circle and starts Day 1 of Level 1.</div>'
        : '') +
      (gap >= 0
        ? '<div class="notice bad">Step <span class="num">' + (gap + 1) + '</span> · ' + HV.esc(FLOW[gap].label) +
          ' was closed and then re-opened by an edit. The flow stays where it is until that step is whole again.</div>'
        : '');
  }

  function flowCardHtml(p) {
    return '<div class="h1-row"><span class="k" style="margin:0">The process</span>' +
        '<span class="sub">HAAL/QMS/OP/2026/01/00 · Operations Process Flow</span></div>' +
      '<p class="sub" style="margin:var(--s2) 0 0">' + (lensRole()
        ? 'Every step and its progress is here. Open one and you will see the lines your seat owns — ' +
          'the rest belong to other benches and close in their own hands.'
        : 'Steps run in order. Only the open step can be ticked — ' +
          'but every step can be read, and a closed one can be corrected.') + '</p>' +
      crumbsHtml(p) +
      '<div id="ob-flags">' + flagsHtml(p) + '</div>' +
      trackHtml(p) +
      '<div class="ob-acts" id="ob-acts">' + actsHtml(p) + '</div>';
  }

  function workspaceHtml(p) {
    var cur = stepIndex(p.step);
    var run = canRun();

    return OB_CSS +
      '<header class="cchead">' +
        '<button class="btn sm ghost cwback" data-goto="#/clients" aria-label="Back to all clients">' + HV.ui.icon('chevL') + '</button>' +
        HV.ui.avatar(p.name) +
        '<span class="grow"><h1 class="ccname">' + HV.esc(p.name) + '</h1>' +
        '<small>Step <span class="num">' + (cur + 1) + '</span> of <span class="num">' + FLOW.length +
          '</span> · here <span class="num">' + HV.esc(HV.ago(p.mins || 0).replace(/ ago$/, '')) + '</span></small></span>' +
        stepPill(p) +
      '</header>' +
      '<div class="ccscroll" id="cw-body">' +
        '<div class="card" id="ob-flow">' + flowCardHtml(p) + '</div>' +
        planPickHtml(p) +
        '<div class="card"><span class="k">Note</span>' +
          '<textarea class="input" id="ob-note" rows="2" aria-label="Onboarding note"' +
            (run ? '' : ' readonly') + '>' + HV.esc(p.note || '') + '</textarea>' +
          (run ? '<div class="row" style="margin-top:var(--s2)"><button class="btn sm" data-ob="note">Save note</button></div>' : '') +
        '</div>' +
        '<p class="audit">Assessment booking cannot exist before the team allocation is approved — the order of these steps is the control.</p>' +
      '</div>';
  }

  /* ---------------- actions ---------------- */

  /* the index of a task inside a step, by the `act` it carries — so a sheet
     can tick its own task without a hard-coded number drifting out of date
     the moment a line is added to the SOP */
  function taskIndexByAct(stepKey, act) {
    var s = stepDef(stepKey);
    for (var i = 0; i < s.tasks.length; i++) if (s.tasks[i].act === act) return i;
    return -1;
  }

  function welcomeSheet(p, after) {
    var me = HV.me();
    HV.sheet(
      '<div class="h1">Circle welcome — ' + HV.esc(p.name) + '</div>' +
      '<p class="sub">Nothing sends without your review. Sending ticks this task.</p>' +
      HV.ui.aidraft(
        '<p id="wl-body" style="margin:var(--s1) 0">Welcome to HAALVING, ' + HV.esc(p.name.split(' ')[0]) +
        '. Meet your four coaches — Nutrition, Fitness, Yoga and Mind Wellness — with your Haalving Coach coordinating and your doctor above them all. First up: five quiet observation days. We learn your life before we change it. Your Dos &amp; Don’ts are pinned at the top of the Circle.</p>',
        '<button class="btn sm" id="wl-send">Send as ' + HV.esc(me.name.split(' ')[0]) + '</button>' +
        '<button class="btn sm ghost" id="wl-edit">Edit</button>' +
        '<button class="btn sm quiet" id="wl-dismiss">Dismiss</button>'
      ),
      function (sheet) {
        sheet.querySelector('#wl-send').addEventListener('click', function () {
          p.welcomed = true;
          p.note = 'Welcome + Dos & Don’ts pinned in the client group';
          /* doing the work IS ticking it — never make someone tick a box for
             a thing they just did on the same screen */
          var i = taskIndexByAct(p.step, 'welcome');
          if (i >= 0) setTick(p, p.step, i, true);
          HV.save();
          HV.closeSheet();
          HV.toast('Welcome and pinned Dos & Don’ts sent. Every coach on the pod was notified.');
          if (after) after();
        });
        sheet.querySelector('#wl-edit').addEventListener('click', function () {
          var body = sheet.querySelector('#wl-body');
          if (!body) return;
          var ta = document.createElement('textarea');
          ta.className = 'input';
          ta.value = body.textContent;
          body.replaceWith(ta);
          ta.focus();
        });
        sheet.querySelector('#wl-dismiss').addEventListener('click', HV.closeSheet);
      }
    );
  }

  function overrideSheet(staffId, after) {
    var c = HV.store.capacity.find(function (x) { return x.staffId === staffId; });
    if (!c) return;
    var st = HV.staff(c.staffId);
    if (!HV.can('overrideCapacity')) { HV.toast('Ops Head only. This attempt was logged.'); return; }
    HV.sheet(
      '<div class="h1">Capacity override — ' + HV.esc(st.name) + '</div>' +
      '<p class="sub">' + HV.esc(c.roleLabel) + ' is at <span class="num">' + c.load + '/' + c.cap +
        '</span>. Every override is logged with your name and a reason.</p>' +
      '<textarea class="input" id="ovr-reason" placeholder="Reason (required — goes to the audit log)"></textarea>' +
      '<button class="btn block" id="ovr-go">Raise cap by 5 — reason logged</button>',
      function (sheet) {
        sheet.querySelector('#ovr-go').addEventListener('click', function () {
          var reason = sheet.querySelector('#ovr-reason').value.trim();
          if (!reason) { HV.toast('A reason is required. It goes to the audit log.'); return; }
          c.cap += 5;
          c.full = c.load >= c.cap;
          HV.save();
          HV.closeSheet();
          HV.toast('Capacity override recorded');
          if (after) after();
        });
      }
    );
  }

  /* ---------------- promotion: the pipeline's one irreversible step ----------------
     A clone gives the record its SHAPE; everything that is a reading about a
     body or a history is zeroed, exactly as client-onboard.js does, because a
     day-one client reading the donor's sleep or metabolism is the worst kind of
     wrong — plausible, and invisible. */
  function zeros() { var a = []; for (var i = 0; i < 20; i++) a.push(0); return a; }

  function promote(p) {
    var s = HV.store;
    var tpl = s.clients.find(function (c) { return c.observation; }) || s.clients[0];
    if (!tpl) { HV.toast('No client record to model the new one on.'); return null; }
    var clone = JSON.parse(JSON.stringify(tpl));
    s.pipeSeq = (s.pipeSeq || 0) + 1;
    var n = s.pipeSeq;

    clone.id = 'c-ob' + n;
    clone.userId = 'u-cl-ob' + n;
    clone.name = p.name;
    clone.plan = p.plan || HV.plansOnSale()[0] || 'poorna';
    clone.tier = HV.PLANS[clone.plan].name;
    clone.humanPillars = clone.plan === 'poorna' ? Object.keys(HV.PILLARS) : [];
    if (clone.plan !== 'poorna') clone.pod = {};

    /* a fresh arrival: observation day 1, nothing measured, nothing scored */
    clone.cycle = 1;
    clone.day = 1;
    /* the engagement term starts TODAY. Cloning left the donor's start date in
       place, so a brand-new client opened with part of their 90 days already
       spent — and, once the welcome sequence began reading this clock, with
       their first message already in the past and therefore never sent. */
    clone.joinedISO = HV.todayISO();
    clone.term = { days: (clone.term && clone.term.days) || HV.termDays(),
                   startISO: HV.todayISO(), renewals: [] };
    clone.observation = true;
    clone.compliance = null;                    /* no data yet is null, never a measured 0% */
    clone.risk = null;
    clone.riskWhy = 'observation day 1 of 5 — assessment awaited';
    clone.coins = 0;
    clone.notes = '';
    clone.levels = { fitness: 1, culture: 1, yoga: 1, wellness: 1 };
    Object.keys(clone.sessions || {}).forEach(function (k) { clone.sessions[k].done = 0; });
    clone.moodLog = [];
    clone.weightLog = [];
    clone.goalLedger = [];
    clone.sessionFeedback = [];
    clone.reviewAns = {};
    delete clone.assessRun;
    delete clone.reviewRun;
    delete clone.podCover;
    clone.assess = {};

    var t = clone.trackers || (clone.trackers = {});
    t.waterDone = 0; t.steps = 0; t.sleep = '—'; t.sleepPct = 0;
    t.mealsLogged = 0; t.screenMins = 0; t.activeMins = 0; t.actCal = 0;
    t.bed = null; t.wake = null;
    t.stages = { deep: 0, rem: 0, light: 0, awake: 0 };
    t.waterLog = [];
    t.screenApps = [];
    t.week = { steps: zeros(), water: zeros(), sleepPct: zeros(), screen: zeros(),
               active: zeros(), actCal: zeros() };
    /* Mifflin-St Jeor from THIS record, never the donor's resting burn */
    t.bmr = Math.round(10 * (clone.weightKg || 70) + 6.25 * (clone.heightCm || 170) -
      5 * (clone.age || 35) + (clone.sex === 'F' ? -161 : clone.sex === 'M' ? 5 : -78));
    if (clone.culturePhotos) clone.culturePhotos.uploaded = 0;

    var sub = clone.plan === 'poorna'
      ? 'Poorna · four dedicated coaches · observation'
      : 'Svayam · AI coach · observation';
    s.users.push({ id: clone.userId, name: clone.name, role: 'client', subtitle: sub });
    s.clients.push(clone);
    /* no calendar is written here any more — see client-onboard.js */
    s.circles[clone.id] = s.circles[clone.id] || [];

    /* the pin stays here — it is a reference card at the top of the thread,
       not a message in a sequence. The welcome ITSELF has moved out: it used
       to be two hardcoded pushMsg calls in this function, which meant the
       first thing every client ever read could only be changed by editing
       JavaScript. It is now step 1 of the 'Welcome sequence' template, which
       Ops edits in Configuration → Automations and which any client can be
       taken off individually. Leaving both would greet everybody twice. */
    HV.pushMsg(clone.id, { fromId: 'u-anita', kind: 'card',
      text: 'Pinned: Welcome to HAALVING · How we’ll work together' });

    /* out of the pipeline, into the roster */
    s.pipeline = s.pipeline.filter(function (x) { return x.id !== p.id; });
    HV.save();
    /* deliver anything already due rather than waiting up to 45 s for the next
       tick — the welcome should be in the thread before the coach has finished
       reading the toast */
    HV.flowSweep();
    return clone;
  }

  /* ---------------- wiring ---------------- */
  /* `repaint` is handed in by the host (console-clients) so a stage change
     redraws the workspace without a full HV.refresh() throwing away the rail's
     search box and scroll position. */
  /* tick a task on the current step, or on the one closed step somebody has
     deliberately unlocked. The guard is not cosmetic: a disabled checkbox is a
     hint, this is the rule — and "unlocked" is a decision somebody made on
     this screen, not a state a stray click can reach. */
  function setTick(p, stepKey, i, on) {
    if (stepKey !== p.step && stepKey !== editKey(p)) return false;
    p.ticks = p.ticks || {};
    if (on) p.ticks[tickKey(stepKey, i)] = true;
    else delete p.ticks[tickKey(stepKey, i)];
    HV.save();
    return true;
  }

  function wireWorkspace(el, p, repaint) {
    function flowEl() { return el.querySelector('#ob-flow'); }

    /* keep the crumb you are on inside the strip. Setting scrollLeft by hand
       rather than calling scrollIntoView, because scrollIntoView also nudges
       every scrollable ancestor — here that means the panel jumping vertically
       every time somebody clicks sideways. */
    function centreCrumb(host) {
      var nav = host.querySelector('#ob-crumbs');
      var on = nav && nav.querySelector('.ob-cr.on');
      if (!nav || !on) return;
      var nr = nav.getBoundingClientRect(), cr = on.getBoundingClientRect();
      nav.scrollLeft += (cr.left - nr.left) - (nr.width / 2) + (cr.width / 2);
    }
    /* and bring the newly-opened step under the eye, in the PANEL's scroller */
    function revealOpen(host) {
      var sc = el.querySelector('#cw-body');
      var open = host.querySelector('.ob-step.open');
      if (!sc || !open) return;
      var sr = sc.getBoundingClientRect(), or = open.getBoundingClientRect();
      sc.scrollTop += (or.top - sr.top) - 24;
    }

    /* a crumb click or an edit toggle rebuilds the flow card and nothing else,
       so the note being typed and the plan picker below survive it */
    function repaintFlow(reveal) {
      var host = flowEl();
      if (!host) return;
      host.innerHTML = flowCardHtml(p);
      wireFlow(host);
      centreCrumb(host);
      if (reveal) revealOpen(host);
    }

    /* --- ticking ---
       A tick NEVER rebuilds the twelve steps. Redrawing sixty-six rows to
       record one checkbox would throw away the scroll position, and working
       down a ten-task list from the top is exactly what this screen is for.
       Only what a tick can actually change is touched: the boxes, the open
       step's own row, the crumbs, the flags, the actions and the rail row. */
    function syncAfterTick() {
      var host = flowEl();
      if (!host) return;
      var vi = stepIndex(viewKey(p));
      host.querySelectorAll('[data-tick]').forEach(function (b) {
        var a = b.dataset.tick.split(':');
        var on = isTicked(p, a[0], Number(a[1]));
        b.checked = on;
        var row = b.closest('.ob-task');
        if (row) row.classList.toggle('on', on);
      });

      var openRow = host.querySelector('.ob-step.open');
      if (openRow) {
        openRow.className = 'ob-step ' + stepState(p, vi) + ' open';
        var dot = openRow.querySelector('.ob-dot');
        if (dot) dot.innerHTML = stepDotIcon(p, vi);
        var meta = openRow.querySelector('small');
        if (meta) meta.innerHTML = stepMeta(p, vi);
      }

      var nav = host.querySelector('#ob-crumbs');
      if (nav) { nav.innerHTML = crumbsInner(p); wireCrumbs(nav); }
      var flags = host.querySelector('#ob-flags');
      if (flags) flags.innerHTML = flagsHtml(p);
      var acts = host.querySelector('#ob-acts');
      if (acts) { acts.innerHTML = actsHtml(p); acts.querySelectorAll('[data-ob]').forEach(wireOb); }

      /* the rail row's progress bar and counter belong to the same fact */
      var railRow = document.querySelector('#cw-list [data-cid="' + p.id + '"]');
      if (railRow) {
        var i = stepIndex(p.step), s = stepDef(p.step), done = tickedCount(p, s);
        var pct = Math.round(((i + (s.tasks.length ? done / s.tasks.length : 0)) / FLOW.length) * 100);
        var bar = railRow.querySelector('.ob-bar i');
        if (bar) bar.style.width = pct + '%';
        var small = railRow.querySelector('small');
        if (small) {
          small.innerHTML = 'Step <span class="num">' + (i + 1) + '</span> of <span class="num">' + FLOW.length +
            '</span> · ' + HV.esc(s.label) + ' · <span class="num">' + done + '</span>/<span class="num">' +
            s.tasks.length + '</span> done';
        }
        var mark = railRow.querySelector('.pill');
        if (mark) mark.remove();
        var pill = readyToFinish(p) ? HV.ui.pill('Ready', 'ok')
          : firstGap(p) >= 0 ? HV.ui.pill('Open item', 'bad') : '';
        if (pill) railRow.insertAdjacentHTML('beforeend', pill);
      }
    }

    /* opening a step moves the LENS, so it carries no permission check of its
       own: reading where a process stands is not an action on it. The gate
       that matters is upstream and unchanged — who gets an Onboarding rail at
       all, which is still the four ops roles on the 'incoming' board. Anyone
       already inside this panel may look anywhere in it. */
    function openStep(key) {
      viewing[p.id] = key;
      repaintFlow(true);
    }

    function wireCrumbs(root) {
      root.querySelectorAll('[data-crumb]').forEach(function (b) {
        b.addEventListener('click', function (e) { e.preventDefault(); openStep(b.dataset.crumb); });
      });
    }

    /* the same action from the canvas: a collapsed step row opens itself. The
       row is a div, so the keyboard behaviour a <button> would have given for
       free has to be written out — Enter and Space both, and Space's default
       page-scroll suppressed. */
    function wireRows(root) {
      root.querySelectorAll('[data-open]').forEach(function (row) {
        row.addEventListener('click', function (e) { e.preventDefault(); openStep(row.dataset.open); });
        row.addEventListener('keydown', function (e) {
          if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
          e.preventDefault();
          openStep(row.dataset.open);
        });
      });
    }

    function wireFlow(root) {
      /* --- the inline affordances a task grows when it IS the work --- */
      root.querySelectorAll('[data-actslot]').forEach(function (slot) {
        var act = slot.dataset.actslot;
        if (act === 'capacity') slot.innerHTML = capacityHtml();
        else if (act === 'inbody') {
          slot.innerHTML = HV.store.inbodyKeyed
            ? HV.ui.pill('InBody keyed in', 'ok')
            : '<button class="btn sm quiet" data-ob="keyin">Confirm InBody key-in</button>';
        } else if (act === 'welcome') {
          slot.innerHTML = p.welcomed
            ? HV.ui.pill('Welcome sent', 'ok')
            : '<button class="btn sm" data-ob="welcome">Review &amp; send welcome</button>';
        }
      });

      root.querySelectorAll('[data-ovr]').forEach(function (b) {
        b.addEventListener('click', function (e) { e.preventDefault(); overrideSheet(b.dataset.ovr, repaint); });
      });
      root.querySelectorAll('[data-cap]').forEach(function (inp) {
        /* the capacity input sits inside a <label>; without this a click to
           focus it would toggle the task's checkbox underneath */
        inp.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); inp.focus(); });
      });

      root.querySelectorAll('[data-tick]').forEach(function (cb) {
        cb.addEventListener('change', function () {
          if (!canRun()) { HV.toast('Ticking a task needs the allocate permission. This attempt was logged.'); cb.checked = !cb.checked; return; }
          var a = cb.dataset.tick.split(':');
          if (!setTick(p, a[0], Number(a[1]), cb.checked)) { cb.checked = !cb.checked; return; }
          syncAfterTick();
        });
      });

      wireCrumbs(root);
      wireRows(root);
      root.querySelectorAll('[data-ob]').forEach(wireOb);
    }

    function wireOb(b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        var a = b.dataset.ob;
        /* looking is not doing: these three move the lens and nothing else, so
           they sit above the permission gate */
        if (a === 'tocur') { viewing[p.id] = p.step; repaintFlow(true); return; }
        if (a === 'gap') {
          var g = firstGap(p);
          if (g < 0) return;
          viewing[p.id] = FLOW[g].key;
          if (canRun()) editing[p.id] = FLOW[g].key;
          repaintFlow(true);
          return;
        }
        if (a === 'editdone') { delete editing[p.id]; repaintFlow(false); return; }

        if (!canRun()) { HV.toast('Moving an arrival along needs the allocate permission. This attempt was logged.'); return; }
        var cur = stepIndex(p.step);
        var s = FLOW[cur];
        if (a === 'edit') {
          editing[p.id] = b.dataset.step;
          viewing[p.id] = b.dataset.step;
          repaintFlow(false);
        } else if (a === 'next') {
          /* the sequence rule, enforced at the action and not just in the UI */
          if (!stepComplete(p, s)) { HV.toast('Every task in this step has to be ticked first.'); return; }
          var g2 = firstGap(p);
          if (g2 >= 0) {
            HV.toast('Step ' + (g2 + 1) + ' · ' + FLOW[g2].label + ' has an open task. Close it before moving on.');
            return;
          }
          if (cur >= FLOW.length - 1) return;
          p.step = FLOW[cur + 1].key;
          p.mins = 0;
          viewing[p.id] = p.step;
          delete editing[p.id];
          HV.save();
          HV.toast(p.name.split(' ')[0] + ' → step ' + (cur + 2) + ' · ' + FLOW[cur + 1].label);
          repaint();
        } else if (a === 'back' && cur > 0) {
          var prev = FLOW[cur - 1];
          /* the step being re-opened WAS complete, so restore its ticks —
             dropping them would quietly lose work somebody actually did. An
             edit that deliberately left a hole is the one exception: those
             unticks are a decision, and re-filling them would undo it. */
          p.ticks = p.ticks || {};
          if (stepComplete(p, prev)) {
            prev.tasks.forEach(function (t, i) { p.ticks[tickKey(prev.key, i)] = true; });
          }
          p.step = prev.key;
          p.mins = 0;
          viewing[p.id] = p.step;
          delete editing[p.id];
          HV.save();
          HV.toast('Back to step ' + cur + ' · ' + prev.label + '.');
          repaint();
        } else if (a === 'note') {
          var ta = el.querySelector('#ob-note');
          p.note = ta ? ta.value.trim() : p.note;
          HV.save();
          HV.toast('Note saved.');
        } else if (a === 'keyin') {
          HV.store.inbodyKeyed = true;
          var ki = taskIndexByAct(p.step, 'inbody');
          if (ki >= 0) setTick(p, p.step, ki, true);
          HV.save();
          HV.toast('Values committed. The client sees them read-only in their profile.');
          repaint();
        } else if (a === 'welcome') {
          welcomeSheet(p, repaint);
        } else if (a === 'promote') {
          if (!readyToFinish(p)) {
            var g3 = firstGap(p);
            HV.toast(g3 >= 0
              ? 'Step ' + (g3 + 1) + ' · ' + FLOW[g3].label + ' is still open. The SOP is not finished.'
              : 'The last step still has open tasks.');
            return;
          }
          var c = promote(p);
          if (!c) return;
          delete viewing[p.id];
          delete editing[p.id];
          HV.celebrate('sprout', 'Welcome to HAALVING',
            c.name + ' is a client now — their circle is open and Day 1 of Level 1 starts.');
          HV.go('#/clients/' + c.id);
        }
      });
    }

    /* the flow card wires itself; everything outside it — the note button —
       is wired once here, and never twice */
    var flow = flowEl();
    el.querySelectorAll('[data-ob]').forEach(function (b) {
      if (flow && flow.contains(b)) return;
      wireOb(b);
    });
    if (flow) { wireFlow(flow); centreCrumb(flow); }

    el.querySelectorAll('input[name="ob-plan"]').forEach(function (r) {
      r.addEventListener('change', function () {
        if (!canRun()) { HV.toast('Ops decides the plan. This attempt was logged.'); return; }
        p.plan = r.value;
        HV.save();
        HV.toast(HV.PLANS[r.value].name + ' — recorded for ' + p.name.split(' ')[0] + '.');
      });
    });
  }

  /* ---------------- the module the Clients workspace consumes ---------------- */
  HV.onboarding = {
    flow: FLOW,
    stepIndex: stepIndex,
    readyToFinish: readyToFinish,
    rows: rows,
    find: find,
    count: function () { return (HV.store.pipeline || []).length; },
    railRows: railRows,
    workspaceHtml: workspaceHtml,
    wireWorkspace: wireWorkspace,
    promote: promote,
  };

  /* the board registration survives for its ROLE GATE and its count — the
     Clients rail asks HV.boardsFor(['incoming']) whether this viewer gets an
     Onboarding tab at all. mount() is no longer used for a page of its own. */
  HV.registerBoard('incoming', {
    label: 'Onboarding',
    /* TJ, 17 Aug: the coach benches join the ops roles here. A coach who will
       be presenting at somebody's assessment call on Thursday had, until now,
       no way to see that the call existed. What they get is the STATUS in
       full and the DETAIL narrowed to their own seat — see lensRole(). */
    roles: ['admin', 'opsmgr', 'opshead', 'core', 'hod',
            'doctor', 'dietitian', 'fitness', 'yoga', 'mind'],
    count: function () { return (HV.store.pipeline || []).length; },
    mount: function (el) { el.innerHTML = railRows(null); },
  });

  /* ============================ Capacity panel ============================
     Mounted by People & Access. Editing stays gated on overrideCapacity — Ops
     Head keeps exactly the reach it has today, nobody else gains any. */
  HV.capacityPanel = function (el) {
    var s = HV.store;
    var canCaps = HV.can('overrideCapacity');

    var capRows = s.capacity.map(function (c) {
      var st = HV.staff(c.staffId);
      return '<div class="row" style="margin-top:var(--s3);align-items:flex-start">' +
        HV.ui.avatar(st.name, 'sm') +
        '<span class="grow">' +
          '<span class="row" style="justify-content:space-between">' +
            '<span style="font-size:var(--t-sm)">' + HV.esc(c.roleLabel) + ': ' + HV.esc(st.name) + '</span>' +
            '<span class="num sub">' + c.load + ' allocated</span>' +
          '</span>' +
          capBar(c) +
        '</span>' +
        (canCaps
          ? '<label class="sub" style="flex:none">cap <input type="number" class="input num" data-cap="' + HV.esc(c.staffId) + '" value="' + c.cap + '" min="' + c.load + '" style="width:5.5em;padding:var(--s1) var(--s2);margin-left:var(--s1)"></label>'
          : '<span class="num sub" style="flex:none">cap ' + c.cap + '</span>') +
      '</div>';
    }).join('');

    el.innerHTML =
      '<div class="card">' + capRows +
        '<p class="sub" style="margin:var(--s3) 0 0">' + (canCaps
          ? 'Edits apply to the allocation picker immediately. One-off exceptions belong in the override flow, where the reason is logged.'
          : 'Caps are Ops Head-editable — you can view. One-off exceptions go through the override flow, reason logged.') + '</p>' +
      '</div>';

    /* --- cap editing (Ops Head) --- */
    el.querySelectorAll('[data-cap]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var c = s.capacity.find(function (x) { return x.staffId === inp.dataset.cap; });
        var v = parseInt(inp.value, 10);
        if (!v || v < c.load) {
          HV.toast('Cap can’t go below the current load (' + c.load + ')');
          inp.value = c.cap;
          return;
        }
        c.cap = v;
        c.full = c.load >= c.cap;
        HV.save();
        HV.toast('Capacity updated. The allocation picker reflects it immediately.');
        HV.refresh();
      });
    });
  };
})();
