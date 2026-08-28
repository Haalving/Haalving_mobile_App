/* HAALVING client views — meal capture wizard (TR-01..03) and star reveal / meal detail (TR-04/05).
   Plan-aware: a client whose Nutrition pillar is held by a human only ever sees human-confirmed
   ratings (the AI pre-score never renders); a client without one is rated instantly by the AI coach,
   always attributed honestly. Observation clients stay capture-only. */
(function () {
  'use strict';

  const FULLNESS = ['Light', 'Just right', 'Stuffed'];
  const DETECTED = ['Vegetable pulao', 'Raita', 'Salad'];

  function slotByTime() {
    const h = new Date().getHours();
    if (h < 11) return 'Breakfast';
    if (h < 16) return 'Lunch';
    return 'Dinner';
  }

  function dietitianFirstName(c) {
    const u = c && c.pod ? HV.staff(c.pod.dietitian) : null;
    if (u && u.ai) return 'your AI coach';   /* no human dietitian on this plan */
    return u ? u.name.split(' ')[0] : 'your dietitian';
  }

  /* Nutrition is AI-coached whenever no human holds that pillar. Poorna always
     has one; a Svayam client has one only if they added it. HV.humanPillar is
     the single test, so this can never drift from the plan model. */
  function cultureIsAI(c) {
    return !HV.humanPillar(c, 'culture');
  }

  /* the first sentence of a note — up to and including its first ./!/? — for
     the star-reveal celebrate, which quotes rather than dumps the whole note */
  function firstSentence(text) {
    if (!text) return '';
    const m = String(text).match(/^.*?[.!?](?=\s|$)/);
    return m ? m[0] : String(text);
  }

  /* 4-row rubric that adds up to the star score (Plan match /2 + Portion /1 + Quality /1 + Timing /1 = 5) */
  function aiRubric(stars) {
    const rows = [
      { label: 'Plan match', max: 2 },
      { label: 'Portion', max: 1 },
      { label: 'Quality', max: 1 },
      { label: 'Timing', max: 1 },
    ];
    let lost = Math.max(0, 5 - stars);
    const rubric = {};
    rows.forEach(r => {
      const cut = Math.min(lost, r.max);
      lost -= cut;
      rubric[r.label] = (r.max - cut) + ' / ' + r.max + (cut ? ' · see note' : '');
    });
    return rubric;
  }

  /* ---------- shared: today's food log sheet (TR-06 lite) ---------- */
  function openFoodLog(c) {
    const diet = dietitianFirstName(c);
    const meals = HV.store.meals
      .filter(m => m.clientId === c.id)
      .sort((a, b) => b.capturedMinsAgo - a.capturedMinsAgo); /* oldest first = chronological day */
    const rated = meals.filter(m => m.final);
    const protein = meals.reduce((s, m) => s + (m.protein || 0), 0);
    const kcal = meals.reduce((s, m) => s + (m.kcal || 0), 0);
    const target = c.trackers ? c.trackers.mealsTarget : 3;

    const rows = meals.map(m =>
      '<button class="trow click" data-meal="' + HV.esc(m.id) + '">' +
        HV.ui.mealArt(m, 'sm') +
        '<div class="grow"><b>' + HV.esc(m.slot) + '</b>' +
          '<small>' + m.dishes.map(d => HV.esc(d)).join(' · ') + ' · ' + HV.esc(HV.ago(m.capturedMinsAgo)) + '</small></div>' +
        (m.final
          ? HV.ui.stars(m.final.stars)
          : (c.observation ? HV.ui.pill('Capture-only', 'neutral') : HV.ui.pill('With ' + diet, 'warn'))) +
      '</button>').join('');

    HV.sheet(
      '<div class="h1">Today’s food log</div>' +
      '<p class="sub" style="margin:0">' + meals.length + ' of ' + target + ' meals logged · ' +
        (c.observation ? 'observation window — capture only'
          : rated.length + (cultureIsAI(c) ? ' rated by your AI coach' : ' human-confirmed')) + '</p>' +
      (meals.length ? '<div class="list">' + rows + '</div>' : HV.ui.empty('bowl', 'Nothing logged yet today.')) +
      '<p class="sub num" style="margin:0">So far: ' + protein + ' g protein · ' + kcal + ' kcal</p>' +
      '<button class="btn quiet block" id="fl-close">Close</button>',
      sheet => {
        sheet.querySelectorAll('[data-meal]').forEach(b => b.addEventListener('click', () => {
          HV.closeSheet();
          HV.go('#/meal-detail/' + b.dataset.meal);
        }));
        sheet.querySelector('#fl-close').addEventListener('click', HV.closeSheet);
      }
    );
  }

  /* ================= TR-01..03 · capture → fullness → confirm ================= */
  HV.registerView('meal', {
    title: 'Log a meal',
    roles: ['client'],
    render(el) {
      const c = HV.myClient();
      if (!c) { el.innerHTML = HV.ui.empty('leaf', 'No client record found for this login.'); return; }
      const obs = !!c.observation;
      const diet = dietitianFirstName(c);

      /* wizard state lives in this closure; draw() re-renders el for the current step */
      const state = { step: 1, fullness: 1, selected: DETECTED.slice(), extras: [] };

      function stepperHtml() {
        const names = ['Photo', 'Fullness', 'Confirm'];
        return '<div class="stepper">' + names.map((n, i) => {
          const cls = i + 1 < state.step ? 'done' : (i + 1 === state.step ? 'cur' : '');
          return '<i class="' + cls + '">' + (i + 1) + ' · ' + n + '</i>';
        }).join('<em>—</em>') + '</div>';
      }

      function chipsHtml() {
        const all = DETECTED.concat(state.extras);
        return all.map(d => {
          const on = state.selected.indexOf(d) !== -1;
          return '<button class="chip' + (on ? ' sel' : '') + '" data-dish="' + HV.esc(d) + '">' + HV.esc(d) + '</button>';
        }).join('') + '<button class="chip" id="chip-correct">' + HV.ui.icon('plus') + ' Correct a dish</button>';
      }

      function drawStep1() {
        el.innerHTML =
          '<h1 class="h1">Log a meal</h1>' +
          '<p class="sub" style="margin:0">' + (obs
            ? 'Observation days 1–5: we capture and learn your normal — no ratings yet, no judgement.'
            : 'Point, shoot, done — ' + HV.esc(diet) + ' takes it from there.') + '</p>' +
          stepperHtml() +
          '<div class="mealph lg" role="img" aria-label="Camera viewfinder">' + HV.ui.icon('camera') + '</div>' +
          '<p class="sub" style="margin:0; text-align:center">Camera viewfinder · works offline — your photo keeps its original capture time.</p>' +
          '<button class="btn block" id="shutter">Capture</button>' +
          '<button class="btn quiet block" id="cancel">Not now</button>';
        el.querySelector('#shutter').addEventListener('click', () => { state.step = 2; draw(); });
        el.querySelector('#cancel').addEventListener('click', () => HV.go('#/today'));
      }

      function drawStep2() {
        el.innerHTML =
          '<h1 class="h1">How full are you?</h1>' +
          stepperHtml() +
          '<div class="card">' +
            '<div class="row"><span class="mealph sm">' + HV.ui.icon('bowl') + '</span>' +
              '<div class="grow"><b>Photo saved.</b>' +
              '<small class="sub" style="display:block">One honest answer helps ' + HV.esc(diet) + ' read the plate — there is no wrong one.</small></div></div>' +
            '<input type="range" id="fullness" min="0" max="2" step="1" value="' + state.fullness + '" style="width:100%; accent-color:var(--brand); margin-top:14px" aria-label="How full are you?">' +
            '<div class="row" style="justify-content:space-between; margin-top:4px">' +
              FULLNESS.map((f, i) => '<span class="f-lbl" data-i="' + i + '" style="font-size:12px">' + f + '</span>').join('') +
            '</div>' +
          '</div>' +
          '<button class="btn block" id="next">Next</button>' +
          '<button class="btn quiet block" id="back">‹ Retake photo</button>';
        const labels = el.querySelectorAll('.f-lbl');
        const paint = () => labels.forEach(l => {
          const on = +l.dataset.i === state.fullness;
          l.style.fontWeight = on ? '700' : '400';
          l.style.color = on ? 'var(--teal-deep)' : 'var(--ink-2)';
        });
        paint();
        el.querySelector('#fullness').addEventListener('input', e => { state.fullness = +e.target.value; paint(); });
        el.querySelector('#next').addEventListener('click', () => { state.step = 3; draw(); });
        el.querySelector('#back').addEventListener('click', () => { state.step = 1; draw(); });
      }

      function drawStep3() {
        el.innerHTML =
          '<h1 class="h1">Confirm your dishes</h1>' +
          stepperHtml() +
          '<div class="row"><span class="mealph sm">' + HV.ui.icon('bowl') + '</span>' +
            '<div class="grow"><b>' + HV.esc(slotByTime()) + '</b>' +
            '<small class="sub" style="display:block">Felt “' + HV.esc(FULLNESS[state.fullness]) + '” · just now</small></div></div>' +
          HV.ui.aidraft(
            '<b>We think this is…</b><div style="margin-top:4px">' + chipsHtml() + '</div>'
          ) +
          '<p class="sub" style="margin:0">Tap a dish to keep or remove it' +
            (obs ? ' — during observation we simply save the plate; no rating will be sent.'
                 : ' — your corrections go straight to ' + HV.esc(diet) + '.') + '</p>' +
          '<button class="btn block" id="log">Log this meal</button>' +
          '<button class="btn quiet block" id="back">‹ Back</button>';
        el.querySelectorAll('[data-dish]').forEach(b => b.addEventListener('click', () => {
          const d = b.dataset.dish;
          const i = state.selected.indexOf(d);
          if (i === -1) state.selected.push(d); else state.selected.splice(i, 1);
          draw();
        }));
        el.querySelector('#chip-correct').addEventListener('click', openCorrect);
        el.querySelector('#log').addEventListener('click', logMeal);
        el.querySelector('#back').addEventListener('click', () => { state.step = 2; draw(); });
      }

      function openCorrect() {
        HV.sheet(
          '<div class="h1">Correct the dishes</div>' +
          '<p class="sub" style="margin:0">Tell us what’s really on the plate — corrections help us learn your kitchen.</p>' +
          '<input class="input" id="dish-name" placeholder="e.g. Phulka, Curd rice…">' +
          '<button class="btn block" id="dish-add">Add dish</button>' +
          '<button class="btn quiet block" id="dish-cancel">Cancel</button>',
          sheet => {
            const inp = sheet.querySelector('#dish-name');
            inp.focus();
            const add = () => {
              const v = inp.value.trim();
              if (!v) { HV.toast('Type a dish name first'); return; }
              if (DETECTED.concat(state.extras).indexOf(v) === -1) state.extras.push(v);
              if (state.selected.indexOf(v) === -1) state.selected.push(v);
              HV.closeSheet();
              HV.toast('Added “' + v + '”');
              draw();
            };
            sheet.querySelector('#dish-add').addEventListener('click', add);
            inp.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
            sheet.querySelector('#dish-cancel').addEventListener('click', HV.closeSheet);
          }
        );
      }

      function logMeal() {
        if (!state.selected.length) { HV.toast('Keep at least one dish selected'); return; }
        const slot = slotByTime();
        const id = 'm-' + c.id + '-' + Date.now();
        const ai = { stars: 4, conf: 85, detected: DETECTED.concat(state.extras), note: 'Looks close to plan.' };
        /* no human on the Nutrition pillar: the AI coach rates the plate instantly */
        const aiRates = !obs && cultureIsAI(c);
        /* ts starts the reply clock (HV.slaLeft reads it); slaMin stays as
           the legacy label, now sourced from the configurable ladder */
        const sla = (HV.store.slaConfig || {}).replyTargetMin || 15;
        HV.store.meals.push({
          id: id, clientId: c.id, slot: slot, emoji: '', capturedMinsAgo: 0,
          fullness: FULLNESS[state.fullness],
          dishes: state.selected.slice(),
          ai: ai,
          final: aiRates
            ? { stars: ai.stars, byId: 'u-ai', voiceSec: 0,
                note: 'Rated instantly by your AI coach — ' + ai.note,
                rubric: aiRubric(ai.stars) }
            : null,
          protein: 26, kcal: 520, slaMin: aiRates ? null : sla, ts: HV.now()
        });
        /* through HV.pushMsg, never a raw circles[].push — only pushMsg stamps
           the seq that every unread badge counts, so a raw push is a message
           the coach's console never lights up for */
        HV.pushMsg(c.id, { fromId: 'client', kind: 'meal', mealId: id, text: slot + ' logged' });
        if (aiRates) HV.pushMsg(c.id, {
          fromId: 'ai', kind: 'rating', mealId: id,
          text: slot + ': ' + ai.stars + ' stars, rated instantly. ' + ai.note
        });
        if (c.trackers) c.trackers.mealsLogged = (c.trackers.mealsLogged || 0) + 1;
        HV.save();
        if (aiRates) {
          HV.toast('Rated instantly: ' + ai.stars + ' stars. Your AI coach left a note.');
          HV.go('#/meal-detail/' + id);
          return;
        }
        HV.toast(obs
          ? 'Saved to your observation log — capture-only, no rating expected'
          : 'Sent to ' + diet + ' — usually rated within ' + sla + ' minutes');
        HV.go('#/today');
      }

      function draw() {
        if (state.step === 1) drawStep1();
        else if (state.step === 2) drawStep2();
        else drawStep3();
        window.scrollTo(0, 0);
      }
      draw();
    }
  });

  /* ================= TR-04/05 · star reveal + meal detail ================= */
  HV.registerView('meal-detail', {
    title: 'Meal',
    roles: ['client'],
    render(el, params) {
      const c = HV.myClient();
      const meal = HV.store.meals.find(m => m.id === (params && params[0]));

      /* clients only ever see their own meals */
      if (!c || !meal || meal.clientId !== c.id) {
        el.innerHTML = '<div class="empty"><span class="big">' + HV.ui.icon('bowl') + '</span>We couldn’t find that meal.<br>' +
          '<button class="btn quiet sm" id="md-home" style="margin-top:var(--s3)">Back to Home</button></div>';
        el.querySelector('#md-home').addEventListener('click', () => HV.go('#/today'));
        return;
      }

      const f = meal.final;
      const dishChips = meal.dishes.map(d => '<span class="chip sel">' + HV.esc(d) + '</span>').join('');
      const footer =
        '<button class="btn quiet block" id="food-log">See today’s food log</button>' +
        '<button class="btn ghost block" id="md-back">Back to Home</button>';

      if (f) {
        /* -------- TR-04 reveal: the confirmed moment (human coach, or instant AI when none) -------- */
        const by = HV.staff(f.byId);           /* safe: falsy/'u-ai' resolves to the AI coach */
        const isAI = !!by.ai;
        const byName = isAI ? 'your AI coach' : by.name.split(' ')[0];
        const rubricRows = Object.keys(f.rubric || {}).map(k =>
          '<div class="row" style="justify-content:space-between; margin-top:6px"><span>' + HV.esc(k) + '</span><b class="num">' + HV.esc(f.rubric[k]) + '</b></div>'
        ).join('');

        el.innerHTML =
          '<h1 class="h1" style="text-align:center; margin-top:10px">Your ' + HV.esc(meal.slot.toLowerCase()) + '</h1>' +
          '<div style="text-align:center">' + HV.ui.stars(f.stars, { cls: 'lg' }) + '</div>' +
          '<p class="sub" style="text-align:center; margin:0">Rated by <b>' + HV.esc(byName) + '</b> · ' + (isAI ? 'instantly' : 'human-confirmed') +
            (f.stars === 5 ? ' &nbsp;' + HV.ui.pill('Perfect plate', 'ok') : '') + '</p>' +
          (f.voiceSec > 0
            ? '<div class="card"><span class="k">Voice note from ' + HV.esc(byName) + '</span><div style="margin-top:6px">' + HV.ui.voice(f.voiceSec) + '</div></div>'
            : '') +
          '<div class="notice">“' + HV.esc(f.note) + '” — ' + HV.esc(byName) + '</div>' +
          '<div class="card"><span class="k">Why ' + f.stars + (f.stars === 1 ? ' star' : ' stars') + '</span>' + rubricRows + '</div>' +
          '<div class="card"><span class="k">On the plate</span><div style="margin-top:4px">' + dishChips + '</div>' +
            '<p class="sub num" style="margin:8px 0 0">' + meal.protein + ' g protein · ' + meal.kcal + ' kcal · felt “' + HV.esc(meal.fullness) + '”</p></div>' +
          footer;
      } else if (c.observation) {
        /* -------- pending, observation window: capture-only, never a rating -------- */
        el.innerHTML =
          '<h1 class="h1" style="text-align:center; margin-top:10px">Your ' + HV.esc(meal.slot.toLowerCase()) + '</h1>' +
          HV.ui.mealArt(meal, 'lg') +
          '<div class="notice">Saved to your observation log · captured ' + HV.esc(HV.ago(meal.capturedMinsAgo)) + '. Days 1–5 are capture-only — we learn your normal before we change anything, so no rating is expected here.</div>' +
          '<div class="card"><span class="k">On the plate</span><div style="margin-top:4px">' + dishChips + '</div>' +
            '<p class="sub" style="margin:8px 0 0">Felt “' + HV.esc(meal.fullness) + '”</p></div>' +
          footer;
      } else {
        /* -------- pending, normal cycle: with the dietitian, never an AI star -------- */
        const dietUser = HV.staff((c.pod || {}).dietitian);   /* pod-empty/AI-only resolves to the AI coach */
        const pendingLine = dietUser.ai
          ? 'Your AI coach sees this instantly.'
          : HV.esc(dietUser.name.split(' ')[0]) + ' sees this exactly as you sent it. A rating usually lands within the hour.';

        el.innerHTML =
          '<h1 class="h1" style="text-align:center; margin-top:10px">Your ' + HV.esc(meal.slot.toLowerCase()) + '</h1>' +
          '<div class="card" style="text-align:center">' + HV.ui.mealArt(meal, 'lg') +
            '<div class="kicker" style="margin-top:var(--s3)">WITH YOUR DIETITIAN</div>' +
            '<p class="sub" style="margin:4px 0 0">' + pendingLine + '</p>' +
          '</div>' +
          '<div class="card"><span class="k">On the plate</span><div style="margin-top:4px">' + dishChips + '</div>' +
            '<p class="sub" style="margin:8px 0 0">Felt “' + HV.esc(meal.fullness) + '”</p></div>' +
          footer;
      }

      el.querySelector('#food-log').addEventListener('click', () => openFoodLog(c));
      el.querySelector('#md-back').addEventListener('click', () => HV.go('#/today'));

      /* the star reveal celebrates once per meal — a reload of an already-seen
         reveal, or a second visit, stays quiet */
      if (f) {
        if (!HV.store.mealCelebrated) HV.store.mealCelebrated = {};
        if (!HV.store.mealCelebrated[meal.id]) {
          HV.store.mealCelebrated[meal.id] = true;
          const ratedBy = HV.staff(f.byId);
          const sentence = firstSentence(f.note);
          const sub = sentence || (ratedBy.ai
            ? 'Rated the moment it landed — human coaches can always step in.'
            : 'Your dietitian looked at this plate personally.');
          HV.celebrate('star', 'Rated ' + f.stars + ' stars', sub);
          HV.save();
        }
      }
    }
  });
})();
