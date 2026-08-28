/* TD-01 · Today — the daily front door for the signed-in client.
   Today's sessions from the four pillars, and the daily read. No scores here —
   the HAALVING Index lives on Journey, and logging lives on Trackers.
   Observation clients (days 1–5) get a gentle observation banner instead of
   session content.

   A day stepper walks the current 11-day cycle: `#/today` is today, `#/today/9`
   is day 9. Reading another day shows the PLAN for it — the sessions, the
   plate, the prescription — but never today's live state. A call is a moment
   and a logged photo is a fact about today, so the join door and the meal
   counter exist on today alone. Past cycles are not reachable here; the Plan
   tab already browses those, calendar by calendar. */
(function () {
  'use strict';

  /* the observation window that runs BEFORE day 1 of level 1. Not the cycle,
     not in programShape, and it does not move when the cycle length does. */
  const OBS_DAYS = 5;

  /* How long a given cycle actually ran. The config says how long a cycle IS;
     a cycle already recorded at another length keeps its own, so walking
     backwards over the boundary asks the data first and the config only for
     the live cycle. Getting this wrong is silent: the walk lands on a day the
     old cycle never had, the lookup returns nothing, and a streak simply stops
     counting with no error anywhere. */
  function cycleLen(c, cy) {
    if (cy === c.cycle) return HV.cycleDays();
    const past = ((HV.store.calendarsPast || {})[c.id] || {})[cy];
    return (past && past.length) || HV.cycleDays();
  }

  const firstName = name => String(name || '').split(' ')[0];

  function greeting() {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }

  function dailyCard(obs) {
    return obs
      ? { icon: 'sprout', title: 'Why we watch before we change',
          sub: 'Days 1–5 teach us your normal, so your plan fits your life — not the other way round · 2-min read',
          body: '<p>Most plans don’t work because they start from a template, not from you. So for five days we simply observe: what you already eat, when you actually sleep, how your day really moves.</p><p>Every photo and tracker tap you log now becomes the foundation your care team builds on from day 6. Nothing is graded — everything is noticed.</p>' }
      : { icon: 'walk', img: 'img/tasks/fitness-cardio.webp', title: 'The 10-minute walk that beats willpower',
          sub: 'A short post-dinner stroll steadies blood sugar better than skipping dessert · 3-min read',
          body: '<p>After a meal, your muscles are the fastest place for glucose to go — but only if they’re moving. Ten easy minutes is enough; no pace, no gear, no tracking guilt.</p><p>Tonight, try it after dinner. It pairs beautifully with your evening session days, and it’s the single habit our dietitians wish everyone stole.</p>' };
  }

  /* ---------------- NP-01 · the Nutrient Panel ----------------
     The Vital Panel's sibling: the lab reads what the body holds, this reads
     what the plates put in. A floating button on Today opens it as the same
     tall bottom sheet a pillar task uses; the task sheet's ‹ › pager walks
     steps, this one walks the days of the cycle. Everything numeric grades
     against a daily target with one rule — under 85% deficient, to 115%
     sufficient, over it surplus — and the word is always printed beside the
     colour, so colour is never the only carrier. */

  /* deterministic story jitter: the same client + day + nutrient always
     reads the same, so a demo day never changes under a reload. 1 ± spread. */
  function drift(seedStr, spread) {
    let h = 0;
    for (const ch of String(seedStr)) h = (h * 31 + ch.charCodeAt(0)) % 9973;
    return 1 + (h / 9973 - 0.5) * 2 * spread;
  }

  const npState = pct => pct < 85 ? ['Deficient', 'bad'] : pct <= 115 ? ['Sufficient', 'ok'] : ['Surplus', 'warn'];

  /* a reading formatted for its own scale: fine targets keep one decimal,
     coarse ones group in the Indian style (3,500) */
  const npFmt = (v, target) =>
    (target < 10 ? Math.round(v * 10) / 10 : Math.round(v)).toLocaleString('en-IN');

  /* one day's reading. mode: 'past' (as eaten), 'today' (so far — kcal and
     protein summed from the meal queue, the record of truth; the rest scaled
     by the eaten fraction), 'plan' (what the plan provides, before the day
     is lived — no jitter, a paper number is exact). */
  function npReading(c, day, mode) {
    const nut = HV.store.nutrition;
    if (!nut) return null;
    /* Every macro target comes from HV.nutTargetsFor — the client's own
       override, else their nutrition template, else (kcal/protein only) the
       legacy plate header, else the derivation. Carbs and fat are authorable
       now; the resolver still derives them from the energy split when nobody
       has stated one, so this line never sees a hole. The old
       mealPlans-or-nothing guard is gone with it, so a client carrying a
       template but no legacy plate now has a panel. */
    const T = HV.nutTargetsFor(c, day);
    if (!T) return null;
    const kcalT = T.kcal;
    const targets = {
      protein: T.protein,
      carbs: T.carbs,
      fat: T.fat,
      fibre: T.fibre,
    };
    let frac = 1, eatenK = null, eatenP = null;
    if (mode === 'today') {
      eatenK = 0; eatenP = 0;
      HV.store.meals.filter(x => x.clientId === c.id).forEach(x => {
        eatenK += x.kcal || 0; eatenP += x.protein || 0;
      });
      frac = Math.min(1.15, eatenK / kcalT);
    }
    const dj = key => mode === 'plan' ? 1 : drift(c.id + ':' + day + ':' + key, 0.15);
    const macros = ['protein', 'carbs', 'fat', 'fibre'].map(k => {
      const T = targets[k];
      const v = mode === 'today'
        ? (k === 'protein' ? eatenP : T * nut.macroBias[k] * dj(k) * frac)
        : T * nut.macroBias[k] * dj(k);
      return { name: k === 'carbs' ? 'Carbohydrate' : k[0].toUpperCase() + k.slice(1),
        unit: 'g', value: v, target: T };
    });
    const micros = nut.micros.map(m => ({
      k: m.k, name: m.name, unit: m.unit, group: m.group, target: m.target,
      value: m.target * m.bias * dj(m.k) * (mode === 'today' ? frac : 1),
    }));
    /* the past-day headline is the energy-weighted mean of the four macro
       drifts — never an independent drift, so the kcal figure and its own
       macro breakdown cannot contradict each other (review C0) */
    const MK = { Protein: 4, Carbohydrate: 4, Fat: 9, Fibre: 2 };
    const kcal = mode === 'today' ? eatenK
      : mode === 'plan' ? kcalT
      : kcalT * macros.reduce((s, m) => s + m.value * MK[m.name], 0)
              / macros.reduce((s, m) => s + m.target * MK[m.name], 0);
    return { kcal: { value: kcal, target: kcalT }, macros, micros };
  }

  /* ── the hologram body — TJ's reference implemented as itself: one
     generated 33KB webp (img/np/body.webp — glowing wireframe figure,
     sternum star, calibration circles, rays), worn by the stage and, in
     miniature, by the floating button. The day's calories still fill the
     body: a brightened copy of the same image is clipped from the
     waterline down, so the figure lights from the feet up. The body spans
     NP_BT%–NP_BB% of the image's height (head top … soles). */
  const NP_BT = 15, NP_BB = 84;
  function npBodyImg(fillPct) {
    const p = Math.max(0, Math.min(1, fillPct));
    const lvl = NP_BB - (NP_BB - NP_BT) * p;
    return '<span class="npbody" aria-hidden="true">' +
      '<img src="img/np/body.webp" alt="" decoding="async">' +
      /* the lit layer fades in over an 8%-tall gradient instead of a hard
         clip — a clip edge drew a seam right across the image's ambient
         glow; a fade reads as light rising through the body. At a full day
         the mask drops away and the class's radial mask takes over. */
      (p > 0
        ? '<img class="lit" src="img/np/body.webp" alt="" decoding="async"' +
          (p < 1
            ? ' style="-webkit-mask-image:linear-gradient(to bottom, transparent ' +
              (lvl - 4).toFixed(1) + '%, #000 ' + (lvl + 4).toFixed(1) + '%);' +
              'mask-image:linear-gradient(to bottom, transparent ' +
              (lvl - 4).toFixed(1) + '%, #000 ' + (lvl + 4).toFixed(1) + '%)"'
            : '') + '>'
        : '') +
      (p > 0 && p < 1 ? '<i class="wline" style="top:' + lvl.toFixed(1) + '%"></i>' : '') +
      '</span>';
  }

  /* the pad the figure stands on — dashed light rings whose dashes circulate
     (a stroke-dashoffset loop), so the pad reads as spinning in perspective */
  function npPad() {
    return '<svg class="nppad" viewBox="0 0 360 120" aria-hidden="true">' +
      '<ellipse class="pglow" cx="180" cy="62" rx="80" ry="18"/>' +
      '<ellipse class="pr r1" cx="180" cy="62" rx="150" ry="34"/>' +
      '<ellipse class="pr r2" cx="180" cy="62" rx="118" ry="27"/>' +
      '<ellipse class="pr r3" cx="180" cy="62" rx="86" ry="20"/>' +
      '<ellipse class="pr r4" cx="180" cy="62" rx="52" ry="12"/>' +
      '</svg>';
  }

  /* ── the panel is a reading, not a stage (TJ, 18 Aug) ───────────────────
     The hologram stood in this sheet until now, micros down one flank of it
     and macros down the other. Two things were wrong with that. The figure
     already stands on the Trackers hub — the page the sheet opens FROM — so
     drawing it again said the same thing twice; and the 36%-wide columns it
     left over were never enough room for “222 of 840 µg”, which is why the
     micros had to stack onto two lines and the macros collided with the
     arms.

     What replaces it is the hub's own ledger — .tkgrp titles over .tkrow
     rows, a state dot, a dotted leader, the value in the data serif — so the
     sheet and the page behind it are visibly one object. The sheet then
     earns its keep by carrying what the hub's card deliberately does not:
     all eleven micros, split into the vitamins and the minerals, on any day
     of the cycle. One instrument survives the figure, below. */

  /* one ledger row. Published as HV.np.row and used by the hub's card too,
     so the two ledgers cannot drift apart. */
  function npRow(name, m) {
    const st = npState(m.target ? m.value / m.target * 100 : 0);
    return '<div class="tkrow"><i class="hdot ' + st[1] + '" aria-hidden="true"></i>' +
      '<span>' + HV.esc(name) + '</span>' +
      '<b class="num">' + npFmt(m.value, m.target) +
      '<small> / ' + npFmt(m.target, m.target) + ' ' + HV.esc(m.unit) + '</small></b>' +
      '<span class="vh"> — ' + st[0] + '</span></div>';
  }

  /* the energy track — the calorie waterline that used to rise through the
     body, laid flat. The scale runs to 125% of the day's target and the tick
     stands at 100%, so a surplus reads as light PAST the mark: a track that
     simply filled up would have drawn 1,500 and 1,900 identically. */
  function npEnergy(r, mode) {
    const pct = r.kcal.target ? r.kcal.value / r.kcal.target * 100 : 0;
    const st = npState(pct);
    return '<div class="card npen">' +
      '<div class="npen-h"><span class="k">Energy</span>' + HV.ui.pill(st[0], st[1]) + '</div>' +
      '<div class="npen-v"><b class="num">' + npFmt(r.kcal.value, 100) + '</b>' +
        '<small>of <span class="num">' + npFmt(r.kcal.target, 100) + '</span> kcal a day' +
        (mode === 'today' ? ' · so far' : mode === 'past' ? ' · as eaten' : ' · as planned') +
        '</small></div>' +
      '<div class="npen-t" aria-hidden="true"><i class="' + st[1] +
        '" style="width:' + Math.min(100, pct / 1.25).toFixed(1) + '%"></i></div>' +
      '</div>';
  }

  function npSheetHtml(c, cal, idx) {
    const entry = cal[idx] || null;
    const todayIdx = cal.findIndex(d => d.today);
    const mode = !entry || entry.today ? 'today'
      : (todayIdx !== -1 && idx < todayIdx) ? 'past' : 'plan';
    const day = entry ? entry.day : c.day;
    const r = npReading(c, day, mode);

    /* the id is written HERE, not left to core's labelledby wiring: paging
       rebuilds the sheet's HTML, and an id core assigned once would name a
       destroyed element from the second page on (review C6, answered again) */
    /* the close mark rides IN the title row, not pinned to the sheet's corner:
       a 44px circle inset 8px from a 24px corner radius sits half on the
       curve, and every other sheet's X hangs off a hero that gives it a
       ground to sit on. This one has the title's own line instead. */
    /* the sub names the mode, so it is printed only when there IS a reading
       to be in that mode — "eaten so far" over an empty panel promises a
       number the sheet does not have */
    const head = '<div class="nphd"><div>' +
      '<div class="h1" id="np-title">Nutrient Panel</div>' +
      (r ? '<p class="sub">' + (mode === 'today' ? 'Today · eaten so far'
        : 'Day ' + day + (mode === 'past' ? ' · as eaten' : ' · as planned')) + '</p>' : '') +
      '</div>' +
      '<button class="tsheet-x" data-npclose aria-label="Close">' + HV.ui.icon('x') + '</button></div>';

    const body = r
      ? npEnergy(r, mode) +
        '<div class="card tkled">' +
          '<div class="tkgrp">Macros · daily targets</div>' +
          r.macros.map(m => npRow(m.name === 'Carbohydrate' ? 'Carbs' : m.name, m)).join('') +
          '<div class="tkgrp">Vitamins</div>' +
          r.micros.filter(m => m.group === 'vitamin').map(m => npRow(m.name, m)).join('') +
          '<div class="tkgrp">Minerals</div>' +
          r.micros.filter(m => m.group === 'mineral').map(m => npRow(m.name, m)).join('') +
        '</div>'
      : HV.ui.empty('sprout', 'We’re still learning your normal.',
          'The panel calibrates when your first plate plan arrives, day ' + (OBS_DAYS + 1) + '.');

    /* the footer pager walks the cycle's days — the same grammar as a task
       sheet's steps. No calendar (observation window) → no pager, just Close. */
    const nav = cal.length > 1 && entry
      ? '<div class="tsheet-nav">' +
        '<button class="pg" data-npprev' + (idx === 0 ? ' disabled' : '') +
        ' aria-label="Previous day (showing day ' + day + ')">' + HV.ui.icon('chevL') + '</button>' +
        '<span class="pgn num">Day ' + day + '</span>' +
        '<button class="pg" data-npnext' + (idx === cal.length - 1 ? ' disabled' : '') +
        ' aria-label="Next day (showing day ' + day + ')">' + HV.ui.icon('chevR') + '</button>' +
        '<button class="btn" data-npclose>Close</button></div>'
      : '<div class="tsheet-nav"><button class="btn" data-npclose style="flex:1">Close</button></div>';

    return '<div class="tsheet npanel">' + head +
      '<div class="tsheet-scroll">' + body + '</div>' + nav + '</div>';
  }

  function openNutrientPanel(c, cal, startIdx) {
    let i = Math.max(0, startIdx);
    const page = () => npSheetHtml(c, cal, i);
    /* whether there is a panel at all is a property of the CLIENT, not of the
       day being read, so the tall sheet is decided once: a client still in
       the observation window gets one sentence, and 95dvh of sheet under a
       sentence is worse than no sheet at all. */
    const tall = npReading(c, c.day, 'today') ? 'tall' : '';
    HV.sheet(page(), sheet => {
      /* paging rebuilds the sheet's HTML, destroying the pressed button —
         hand keyboard focus back to its successor (same move as a task sheet) */
      const refocus = sel => {
        const b = sheet.querySelector(sel);
        (b && !b.disabled ? b : sheet.querySelector('.btn[data-npclose]')).focus();
      };
      const wire = () => {
        sheet.querySelectorAll('[data-npclose]').forEach(b => b.addEventListener('click', HV.closeSheet));
        const prev = sheet.querySelector('[data-npprev]'), next = sheet.querySelector('[data-npnext]');
        if (prev) prev.addEventListener('click', () => {
          if (i > 0) { i -= 1; sheet.innerHTML = page(); wire(); refocus('[data-npprev]'); }
        });
        if (next) next.addEventListener('click', () => {
          if (i < cal.length - 1) { i += 1; sheet.innerHTML = page(); wire(); refocus('[data-npnext]'); }
        });
      };
      wire();
    }, tall);
  }

  /* ---------- the arrival — mood, a small ceremony ----------
     One mood per cycle-day, revocable; every arrival also lands in the
     c.moodLog diary with its clock time. Faces are hairline marks — the
     chosen one wears brand ink; expression lives in the drawing, never in
     a colour per mood. Module scope since 9 Aug: Today's glass band and
     the Trackers quick-add (HV.moodSheet) open the same sheet. */
  const MOODS = {
    happy: { label: 'Happy',
      line: 'Carry it gently — happiness shared with the tribe multiplies.',
      sm: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M9 10.1v.01M15 10.1v.01M8.8 14.1c.9 1.2 2 1.8 3.2 1.8s2.3-.6 3.2-1.8"/></svg>',
      lg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.3"/><path d="M8.9 9.9v.01M15.1 9.9v.01M7.2 12.6c.5-.4 1-.6 1.6-.7M16.8 12.6c-.5-.4-1-.6-1.6-.7M8.2 13.9c1 1.6 2.3 2.4 3.8 2.4s2.8-.8 3.8-2.4"/></svg>' },
    sad: { label: 'Sad',
      line: 'Noted, softly. A slower plate and an easier practice are honourable today.',
      sm: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M9 10.1v.01M15 10.1v.01M8.8 15.9c.9-1.2 2-1.8 3.2-1.8s2.3.6 3.2 1.8"/></svg>',
      lg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.3"/><path d="M8.2 8.9c.5-.3 1.1-.4 1.7-.3M15.8 8.9c-.5-.3-1.1-.4-1.7-.3M9 11.2v.01M15 11.2v.01M8.4 16.4c1-1.5 2.2-2.2 3.6-2.2s2.6.7 3.6 2.2"/></svg>' },
    angry: { label: 'Angry',
      line: 'Heat is fuel. Tonight’s session will take it from you.',
      sm: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M8.2 9.4l2.6 1M15.8 9.4l-2.6 1M9.7 12.4v.01M14.3 12.4v.01M9.3 15.6h5.4"/></svg>',
      lg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.3"/><path d="M7.8 8.8l3 1.3M16.2 8.8l-3 1.3M12 8.1v1.1M9.5 12.6v.01M14.5 12.6v.01M9 15.9c1-.4 2-.6 3-.6s2 .2 3 .6"/></svg>' },
    drained: { label: 'Drained',
      line: 'Rest is part of the programme, not a break from it.',
      sm: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M8.1 10.6h2.3M13.6 10.6h2.3M9.6 15.4c.8.5 1.7.7 2.6.5"/></svg>',
      lg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.3"/><path d="M7.9 11h2.7M13.4 11h2.7M9.8 15.7c.9.6 1.9.8 2.9.6"/></svg>' },
  };
  const NEUTRAL_FACE = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.3"/><path d="M9 10.3v.01M15 10.3v.01M9.4 14.8h5.2"/></svg>';

  /* the last seven arrivals, oldest first, ending on today */
  function arriveStrip(c) {
    let cells = '';
    for (let i = 6; i >= 0; i--) {
      let cy = c.cycle, d = c.day - i;
      while (d <= 0) { cy -= 1; d += cycleLen(c, cy); }
      const m = cy > 0 ? (c.moods || {})[cy + '.' + d] : null;
      cells += `<span class="ms${i === 0 ? ' today' : ''}${m ? ' has' : ''}">` +
        (m ? MOODS[m].sm
           : '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" stroke-dasharray="2.2 2.6"/></svg>') +
        `<small class="num">${d}</small></span>`;
    }
    return cells;
  }

  /* the arrival sheet — a ceremony, not a form: one large face that
     listens, four small ones that answer, seven days of weather below.
     A mood is offered, never owed: today's note can always be cleared. */
  function openArrival(c) {
    const moodKey = c.cycle + '.' + c.day;
    let pick = (c.moods || {})[moodKey] || '';
    const note = (c.moodNotes || {})[moodKey] || '';
    /* the diary behind the strip: every arrival lands in c.moodLog with
       its clock time — append, never replace, so a re-check-in later the
       same day is a second entry. Within ONE open sheet, though, taps
       refine a single entry (settling on a face is one arrival, not
       four). c.moods keeps only the latest per day for the strip. */
    let logIdx = -1;
    const minsNow = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
    const todaysLast = () => {
      const L = c.moodLog || [];
      for (let i = L.length - 1; i >= 0; i--)
        if (L[i].cy === c.cycle && L[i].d === c.day) return i;
      return -1;
    };
    /* tapping a face IS the note — it saves at once and the band behind
       the sheet updates live. document-scoped since the sheet can open
       from Trackers too; away from Today there is no band and the guard
       simply stands down. Closing is simply done; nothing is owed. */
    const syncBand = () => {
      const af = document.querySelector('.arrive .af'), at = document.querySelector('.arrive .at b');
      const m = (c.moods || {})[moodKey];
      if (!af) return;
      af.classList.toggle('on', !!m);
      af.innerHTML = m ? MOODS[m].lg : NEUTRAL_FACE;
      at.textContent = m ? 'Arrived ' + MOODS[m].label.toLowerCase() : 'How are you arriving?';
    };
    HV.sheet(
      `<button class="shx" id="m-x" aria-label="Done — close">${HV.ui.icon('x')}</button>
      <div class="kicker">THIS MORNING</div>
      <div class="h1">How are you arriving?</div>
      <div class="mbig" id="mb">${pick ? MOODS[pick].lg : NEUTRAL_FACE}</div>
      <p class="sub mline" id="ml">${pick ? MOODS[pick].line : 'A mood is weather, not climate — name it and it loosens its grip.'}</p>
      <div class="moodrow" role="group" aria-label="Choose how you are arriving">` +
      Object.keys(MOODS).map(k =>
        `<button class="mood" data-mood="${k}" aria-pressed="${pick === k}">
          <span class="md">${MOODS[k].sm}</span><small>${MOODS[k].label}</small>
        </button>`).join('') +
      `</div>
      <div class="mnote"><textarea id="m-why" rows="2" aria-label="A line about why, optional"
        placeholder="A line about why — only if you want">${HV.esc(note)}</textarea></div>
      <div class="mstrip"><div class="msr" id="msr">${arriveStrip(c)}</div>
      <small class="cap">Your last seven arrivals, day by day</small></div>
      <button class="mclear" id="m-clear"${pick ? '' : ' style="display:none"'}>Clear today’s note</button>`,
      sh => {
        sh.querySelectorAll('.mood[data-mood]').forEach(b => b.addEventListener('click', () => {
          pick = b.dataset.mood;
          c.moods = c.moods || {};
          c.moods[moodKey] = pick;
          /* first tap this visit appends to the diary; further taps
             refine the same entry (mood and time move with the tap) */
          c.moodLog = c.moodLog || [];
          if (logIdx === -1) {
            c.moodLog.push({ cy: c.cycle, d: c.day, min: minsNow(), mood: pick });
            logIdx = c.moodLog.length - 1;
          }
          c.moodLog[logIdx].mood = pick;
          c.moodLog[logIdx].min = minsNow();
          const noteNow = sh.querySelector('#m-why').value.trim();
          if (noteNow) c.moodLog[logIdx].note = noteNow; else delete c.moodLog[logIdx].note;
          HV.save();
          sh.querySelectorAll('.mood').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
          sh.querySelector('#mb').innerHTML = MOODS[pick].lg;
          sh.querySelector('#ml').textContent = MOODS[pick].line;
          sh.querySelector('#msr').innerHTML = arriveStrip(c);
          sh.querySelector('#m-clear').style.display = '';
          syncBand();
        }));
        sh.querySelector('#m-why').addEventListener('input', e => {
          c.moodNotes = c.moodNotes || {};
          const v = e.target.value.trim();
          if (v) c.moodNotes[moodKey] = v; else delete c.moodNotes[moodKey];
          /* the note rides on the diary too — this visit's entry if one
             exists, else today's latest (a note typed without a fresh
             tap belongs to the arrival already recorded) */
          const i = logIdx !== -1 ? logIdx : todaysLast();
          if (i !== -1) {
            if (v) c.moodLog[i].note = v; else delete c.moodLog[i].note;
          }
          HV.save();
        });
        sh.querySelector('#m-x').addEventListener('click', () => HV.closeSheet());
        sh.querySelector('#m-clear').addEventListener('click', () => {
          pick = '';
          delete (c.moods || {})[moodKey];
          delete (c.moodNotes || {})[moodKey];
          /* revoke only THIS visit's diary entry — earlier arrivals
             today are history, and history is kept */
          if (logIdx !== -1) { c.moodLog.splice(logIdx, 1); logIdx = -1; }
          HV.save();
          sh.querySelectorAll('.mood').forEach(x => x.setAttribute('aria-pressed', 'false'));
          sh.querySelector('#mb').innerHTML = NEUTRAL_FACE;
          sh.querySelector('#ml').textContent = 'A mood is weather, not climate — name it and it loosens its grip.';
          sh.querySelector('#m-why').value = '';
          sh.querySelector('#msr').innerHTML = arriveStrip(c);
          sh.querySelector('#m-clear').style.display = 'none';
          syncBand();
        });
      }, 'tall');
  }
  HV.moodSheet = openArrival;

  /* the Trackers hub wears the hologram now (TJ, 9 Aug) — the panel's
     pieces go public so that page can build the centre figure and open the
     same sheet without a second copy of any of this */
  HV.np = {
    reading: npReading,
    bodyImg: npBodyImg,
    pad: npPad,
    state: npState,
    fmt: npFmt,
    row: npRow,
    open: openNutrientPanel,
    openToday(c) {
      const cal = HV.calendarFor(c);
      openNutrientPanel(c, cal, Math.max(0, cal.findIndex(d => d.today)));
    },
  };

  HV.registerView('today', {
    title: 'Today',
    roles: ['client'],

    render(el, params) {
      const c = HV.myClient();
      if (!c) {
        el.innerHTML = HV.ui.empty('leaf', 'We couldn’t find your profile. Switch persona and try again.');
        return;
      }

      const obs = !!c.observation;
      const cal = HV.calendarFor(c);
      /* Which day is on screen. The route carries it, so the back button walks
         the days and re-opening the tab always lands on today — a day you
         browsed to is a glance, not a place you should be returned to. A day
         number that isn't in this cycle falls back to today rather than
         emptying the screen. */
      const todayIdx = cal.findIndex(d => d.today);
      const asked = params && params[0] ? cal.findIndex(d => d.day === Number(params[0])) : -1;
      const viewIdx = asked !== -1 ? asked : todayIdx;
      const todayEntry = viewIdx !== -1 ? cal[viewIdx] : null;
      const isToday = !!(todayEntry && todayEntry.today);
      const todayItems = todayEntry ? todayEntry.items : [];
      const card = dailyCard(obs);
      const dismissed = !!(HV.store.dailyCardDismissed && HV.store.dailyCardDismissed[c.id]);

      /* ---------- observation banner (replaces the old score hero) ---------- */
      let obsHtml = '';
      if (obs) {
        obsHtml =
          `<div class="card row">
            ${HV.ui.ring((c.day / OBS_DAYS) * 100, 'brand', c.day + '/' + OBS_DAYS, 'lg')}
            <div class="grow">
              <span class="card-title">Observation · Day ${c.day} of ${OBS_DAYS}</span>
              <div class="sub" style="margin-top:var(--s1)">We’re learning your rhythm. Your care team meets on day ${OBS_DAYS} to shape your first 11-day calendar.</div>
            </div>
          </div>
          <div class="notice">Days 1–${OBS_DAYS} are your observation window. We learn how you already eat, move and rest before we change a single thing. Ratings and levels switch on from day ${OBS_DAYS + 1} — until then, photos and taps are all we ask.</div>`;
      }

      /* ---------- today, grouped under the four pillars ----------
         There is no separate calls widget: a session belongs to the pillar that
         owns it, so Fitness carries its call and Yoga carries its live room.
         Under each session sits the actual prescription from the level book —
         reps, minutes, poses, plate — because "Strength (bands) II" on its own
         tells nobody what to do at 6:30. Rest days say rest, per pillar. */
      const rest = !!(todayEntry && todayEntry.rest);
      const track = c.track || 'sedentary';
      const lvl = k => (c.levels && c.levels[k]) || 1;
      /* the level book for a pillar at this client's track and level. Tracks we
         haven't transcribed fall back to sedentary rather than showing nothing. */
      const book = k => {
        const b = HV.store.program && HV.store.program[k];
        if (!b) return null;
        const t = b[track] || b.sedentary;
        return t ? (t[lvl(k)] || null) : null;
      };
      /* the task catalogue — every card row and its sheet page, built once in
         core and shared with My Plan so the two surfaces cannot drift. Rows
         carry data-topen; wireTasks() below turns a tap into the task sheet. */
      /* the BROWSED day, not merely today's. Today supports #/today/3, and it
         already showed day 3's sessions — but its task cards came from the
         day-blind level book, so day 3 listed today's exercises. */
      const tasks = HV.tasks(c, todayEntry ? todayEntry.day : c.day);
      const sub = inner => `<div class="tg-sub">${inner}</div>`;
      /* second-level disclosure: the reference material a client reads once and
         then knows. Kept on the page, kept out of the way. */
      const fold = (label, inner) =>
        `<details class="tg-fold"><summary>${HV.esc(label)}</summary>${inner}</details>`;
      const head = t => `<div class="tg-h">${HV.esc(t)}</div>`;
      /* the banded section header Nutrition's plate uses — one grammar for every
         pillar: band → rail → bold noun → grey detail → action at the right */
      /* the label lives in ONE span: the band is a flex row, and bare text
         fragments would each become flex items and wrap as broken columns */
      const band = (icon, label) => `<div class="tg-part">${HV.ui.icon(icon)}<span>${label}</span></div>`;
      const note = t => `<div class="tg-note">${HV.esc(t)}</div>`;
      const meta = t => `<div class="tg-meta">${HV.esc(t)}</div>`;
      const room = (HV.store.liveRooms && HV.store.liveRooms.yoga) || '';

      const sessionRow = it => {
        const staff = HV.staff(it.staffId);
        /* the AI coach has no first name to shorten — "Your · AI" reads like a bug */
        const who = staff && staff.ai ? 'your AI coach' : firstName(staff ? staff.name : 'your coach');
        /* the door exists on the day itself and nowhere else: a room you cannot
           walk into is a broken promise, so another day reads its own status */
        /* the booking behind the row, if a coach made one: inside its window
           the chip opens the real room, and walking out of that room is what
           asks for the stars. Outside the window the old promise stands. */
        const bk = isToday && it.pillar && todayEntry ? HV.bookingFor(c, todayEntry.day, it.pillar) : null;
        const nowM = (() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); })();
        const openNow = bk && nowM >= bk.start - 10 && nowM < bk.start + bk.dur;
        const action = it.status === 'done' ? HV.ui.pill('Done', 'ok')
          : it.status === 'cancelled' ? HV.ui.pill('Cancelled', 'bad')
          : !isToday ? HV.ui.pill('Planned', 'neutral')
          : openNow
            ? `<button class="chip live" data-meet="${HV.esc(bk.t.id)}:${bk.rd}">${HV.ui.icon('video')}Join</button>`
          : it.pillar === 'yoga' && room
            ? `<a class="chip live" href="${room}" target="_blank" rel="noopener">${HV.ui.icon('video')}Join live</a>`
            : `<button class="chip join" data-join="${HV.esc(who)}">${HV.ui.icon('phone')}Join</button>`;
        return `<div class="tg-item"><span class="grow"><b>${HV.esc(it.label)}</b>
          <small>${HV.esc(it.time)} · with ${HV.esc(who)}</small></span>${action}</div>`;
      };

      /* Today opens short. Each pillar is a closed drawer showing one line — the
         headline you can act on — and the next thing that actually needs doing
         starts open. Choices are remembered, so a client who always wants the
         plate in front of them keeps Nutrition open. */
      /* Nutrition leads: the plate is the decision a client faces first and most
         often — three times before the evening session comes round. */
      const PILLAR_ORDER = ['culture', 'fitness', 'yoga', 'wellness'];
      const firstLive = PILLAR_ORDER.find(k => todayItems.some(i => i.pillar === k && i.status !== 'done'));
      const openMap = HV.store.todayOpen || {};
      const isOpen = k => (k in openMap) ? !!openMap[k] : k === firstLive;

      const groups = PILLAR_ORDER.map(k => {
        const p = HV.PILLARS[k];
        const mine = todayItems.filter(i => i.pillar === k);
        let rows = mine.map(sessionRow).join('');
        let summary = '';
        const bk = book(k);

        /* ---- Fitness: the session, then the block it actually contains.
           Category sits in the rail, the exercise is the bold noun, the dose is
           its serif detail line — so nothing wraps orphaned and the eye lands
           on the move, not the label. ---- */
        if (k === 'fitness' && bk && !obs) {
          if (mine.length) {
            rows += sub(
              band('flame', 'Home block · <span class="num">' + HV.esc(String(bk.home.mins)) + ' min</span> · ' + HV.esc(bk.rpe)) +
              tasks.fitness.map((t, i) => HV.ui.taskRow(t, '', 'fitness', i)).join('') +
              fold('At the gym instead', note(bk.gym.line)) +
              meta(bk.phase + ' · intensity ' +
                HV.esc((String(bk.intensity).match(/^[\d–—\-–%\s]+/) || [String(bk.intensity)])[0].trim())));
          }
          /* steps and water are standing targets, not today's task — they live
             on Trackers, so Today stays a to-do list, not a rulebook */
          summary = mine.length ? HV.esc(mine[0].label) + ' · ' + HV.esc(mine[0].time)
            : 'No session today';
        }

        /* ---- Nutrition: today's plate, slot by slot, then the level's habits.
           A slot reads as logged the moment its photo lands in the meal queue —
           the queue is the record of truth, so nothing is stored twice. ---- */
        if (k === 'culture') {
          const m = HV.trackers.read('meals');
          const plan = (HV.store.mealPlans && HV.store.mealPlans[c.id]) || null;
          const shot = HV.store.meals.filter(x => x.clientId === c.id).map(x => x.slot);
          let plate = '';
          /* the prescribed meals are what draw the plate — gating on the legacy
             mealPlans row left a client carrying a template but no plate row
             reading "3 meals planned" over an empty group */
          if (tasks.culture.length) {
            /* the plate reads as a day schedule: meals grouped by the part of
               the day they belong to. What goes in a plate — the fibre-
               protein-carb table, the notes, the swaps — lives on the task
               sheet a tap away, so the rows stay a clean glanceable list. */
            const partIcon = { Morning: 'sun', Afternoon: 'flame', Evening: 'moon' };
            let part = '';
            /* the same targets the Nutrient Panel measures against — reading
               the legacy plate header here printed 1400 kcal over a panel
               counting to 1800, which is one day described two ways */
            const hT = HV.nutTargetsFor(c, todayEntry ? todayEntry.day : c.day) ||
              (plan ? { kcal: plan.kcal, protein: plan.protein } : null);
            const title = (plan && plan.title) ||
              'Diet plan · L' + ((c.levels || {}).culture || 1) + ' · cycle ' + (c.cycle || 1);
            plate = head(title + (hT ? ' · ' + hT.kcal + ' kcal · ' + hT.protein + ' g protein a day' : '')) +
              tasks.culture.map((t, i) => {
                const partHead = t.part !== part ? band(partIcon[t.part], t.part) : '';
                part = t.part;
                const pill = t.photo
                  ? ((isToday && shot.includes(t.slot)) ? HV.ui.pill('Logged', 'ok') : HV.ui.pill('Photo', 'neutral'))
                  : '';
                return partHead + HV.ui.taskRow(t, pill, 'culture', i);
              }).join('');
          }
          const habits = (bk && !obs) ? fold('Level ' + lvl('culture') + ' habits · ' + bk.star,
            bk.habits.map(h => `<div class="tg-line hab"><span class="tv">${HV.esc(h)}</span></div>`).join('') +
            (bk.plate ? meta('Your plate: ' + bk.plate) : '') +
            (bk.cheat ? meta(bk.cheat) : '')) : '';
          /* the photo counter is a fact about today, not a line in the plan */
          const logRow = isToday
            ? `<div class="tg-item"><span class="grow"><b>Log ${m.target} meal photos</b>
              <small><span class="num">${m.value}</span> of <span class="num">${m.target}</span> so far · every plate teaches us</small></span>
              ${m.value >= m.target ? HV.ui.pill('Done', 'ok') : ''}</div>`
            : '';
          rows = (plate ? sub(plate + habits) : habits) + logRow + rows;
          /* count what the client is actually PRESCRIBED today, not how many
             slots the legacy plate happens to carry — the assigned template is
             what decides the day, and a header saying "6 meals planned" over
             three cards is simply wrong. */
          summary = tasks.culture.length
            ? tasks.culture.length + (tasks.culture.length === 1 ? ' meal planned' : ' meals planned') +
              (isToday ? ' · <span class="num">' + m.value + ' of ' + m.target + '</span> photos logged' : '')
            : isToday ? '<span class="num">' + m.value + ' of ' + m.target + '</span> photos logged'
            : 'Plate not set for this cycle';
          /* one source for the count and the rows, so the header can never
             describe a group it is not standing over */
        }

        /* ---- Yoga: delivered live, so the session carries a door. On the days
           the live class doesn't run, the practice still stands — the level book
           prescribes it daily — so the sequence is here to follow alone. ---- */
        if (k === 'yoga' && bk && !obs && !rest) {
          /* the session's three blocks as card rows — each block's practice,
             key poses and purpose live on its task sheet, one tap away. */
          rows += sub(
            band('leaf', (mine.length ? 'Live session' : 'Own practice') + ' · <span class="num">' + HV.esc(bk.dur) + '</span>') +
            tasks.yoga.map((t, i) => HV.ui.taskRow(t, '', 'yoga', i)).join('') +
            fold('What this level is for', note(bk.goal) + note(bk.focus)));
          summary = mine.length ? 'Live · ' + HV.esc(mine[0].time) + ' · ' + HV.esc(bk.dur)
            : 'Own practice · ' + HV.esc(bk.dur);
        }

        /* ---- Mind Wellness: today's practice is the task. Sleep and screen caps
           are standing targets — Trackers carries those. The practice line
           splits at its first dot: the practice is the bold noun, the dose is
           its detail — same grammar as a dish or an exercise. ---- */
        if (k === 'wellness' && !obs) {
          const w = (HV.store.program && HV.store.program.wellness) ? HV.store.program.wellness[lvl('wellness')] : null;
          if (w && tasks.wellness.length) {
            rows += sub(
              band('moon', 'Tonight') +
              tasks.wellness.map((t, i) => HV.ui.taskRow(t, '', 'wellness', i)).join(''));
            summary = mine.length ? HV.esc(mine[0].label) + ' · ' + HV.esc(mine[0].time)
              : HV.esc(w.practice);
          }
        }

        if (!rows) {
          rows = '<div class="tg-empty">' + (rest
            ? 'Active rest — recovery is the session.'
            : (obs ? 'Begins after your observation window.'
              : 'Nothing on the plan here today.<br><span class="sub">Rest is part of the programme — your body banks it.</span>')) + '</div>';
        }

        /* No "This cycle" progress rows here by TJ's call (28 Jul) — Today is
           the to-do list; cycle progress lives on Plan. Do not re-add. */
        if (!summary) {
          summary = rest ? 'Active rest'
            : obs ? 'Begins after your observation window'
            : mine.length ? HV.esc(mine[0].label) + ' · ' + HV.esc(mine[0].time)
            : 'Nothing scheduled today';
        }
        /* every pillar carries its own door to the coach marketplace — the
           page is one, filtered to the pillar that was tapped (CH-04) */
        const coachRow = `<a class="tg-getcoach" href="#/coaches/${k}">${HV.ui.icon('users')}<span>Get a coach</span>${HV.ui.icon('chevR')}</a>`;
        return `<details class="tg ${p.cls}" data-p="${k}"${isOpen(k) ? ' open' : ''}>
          <summary>
            ${HV.ui.plate(k)}
            <span class="tg-name"><b>${HV.esc(p.name)}</b><small class="tsum">${summary}</small></span>
            <small class="lvl">${obs ? 'Obs' : 'L' + lvl(k)}</small>
            ${HV.ui.icon('chevR')}
          </summary>
          <div class="tg-body">${rows}${coachRow}</div></details>`;
      }).join('');

      const todayHtml = '<div class="card tgroups">' + groups + '</div>' +
        (rest ? '<div class="notice">Active rest day — a gentle walk, plenty of water, early to bed. Rest is part of the plan, not a break from it.</div>' : '');

      /* ---------- the day stepper ----------
         It stands where the section title stood, because it does that job: it
         names the day the drawers below belong to. An arrow at a cycle edge
         stays in place greyed rather than disappearing — a control that comes
         and goes makes the row jump under the thumb. */
      const dayNav = (!obs && todayEntry && cal.length > 1) ? (() => {
        const step = (i, icon, label) => {
          const d = cal[i];
          return d
            ? `<a class="dnav-step" href="#/today/${d.day}" aria-label="${label}: day ${d.day}">${HV.ui.icon(icon)}</a>`
            : `<span class="dnav-step off" aria-hidden="true">${HV.ui.icon(icon)}</span>`;
        };
        const tag = todayEntry.today ? ['Today', 'ok']
          : todayEntry.review ? ['Level review', 'warn']
          : todayEntry.meeting ? ['Progress meeting', 'info']
          : todayEntry.rest ? ['Active rest', 'neutral']
          : viewIdx < todayIdx ? ['Already done', 'neutral']
          : ['Planned', 'neutral'];
        return `<div class="daynav">
          ${step(viewIdx - 1, 'chevL', 'Previous day')}
          <span class="dnav-mid">
            <span class="dnav-day"><span class="num">Day ${todayEntry.day}</span>${
              todayEntry.date ? ' · ' + HV.esc(todayEntry.date) : ''}</span>
            ${HV.ui.pill(tag[0], tag[1])}
          </span>
          ${step(viewIdx + 1, 'chevR', 'Next day')}
        </div>` +
        (isToday ? '' : `<div class="notice">${viewIdx < todayIdx
          ? 'Looking back at a day you have already lived. Sessions show how it went — logging and calls stay on today.'
          : 'Looking ahead. This is what your team has planned for that day — nothing to log yet.'
        } <a class="dnav-back" href="#/today">Back to today</a></div>`);
      })() : '<div class="sec-title">Today</div>';

      /* ---------- daily content card (one per day, dismissible) ----------
         Today's read belongs to today; another day is not the day to read it. */
      const dailyHtml = (dismissed || !isToday) ? '' :
        `<div class="sec-title">Today’s read</div>
        <div class="card" style="position:relative">
          <button id="daily-dismiss" aria-label="Dismiss today’s read" style="position:absolute; top:0; right:0; width:44px; height:44px; display:flex; align-items:center; justify-content:center; color:var(--ink-3)">${HV.ui.icon('x')}</button>
          <button class="row" id="daily-open" style="width:100%; padding-right:var(--s8)">
            ${card.img
              ? '<span class="tcard" aria-hidden="true"><img src="' + card.img + '" alt="" loading="lazy" decoding="async"></span>'
              : HV.ui.iconTile(card.icon, 'sm')}
            <div class="grow"><b>${HV.esc(card.title)}</b>
            <small class="sub" style="display:block">${HV.esc(card.sub)}</small></div>
          </button>
        </div>`;

      /* ---------- mood check-in — the arrival, a small ceremony ----------
         A glass band in the morning scene invites; the sheet itself
         (openArrival) lives at module scope since 9 Aug — the Trackers
         quick-add opens the same ceremony as HV.moodSheet. */
      const moodKey = c.cycle + '.' + c.day;
      const moodNow = (c.moods || {})[moodKey] || '';
      const moodHtml = !isToday ? '' :
        `<button class="arrive" id="arrive-open" aria-haspopup="dialog">
          <span class="af${moodNow ? ' on' : ''}">${moodNow ? MOODS[moodNow].lg : NEUTRAL_FACE}</span>
          <span class="at"><small>ARRIVING</small>
          <b>${moodNow ? 'Arrived ' + MOODS[moodNow].label.toLowerCase() : 'How are you arriving?'}</b></span>
          <span class="ac" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M10 7l5 5-5 5"/></svg></span>
        </button>`;

      /* ---------- streak — the gamification family's second instrument.
         One flame a day, lit when that day's tasks are all done; the count of
         days kept is the only word beside them. A rest day carries no tasks,
         so there is nothing on it to break — its flame stays lit. Today does
         not break a streak either: a day still being lived is not a day lost. */
      const pastCal = (HV.store.calendarsPast || {})[c.id] || {};
      const dayEntry = (cy, d) => {
        const days = cy === c.cycle ? cal : pastCal[cy];
        return days ? days.find(x => x.day === d) : null;
      };
      const dayKept = e => !!e && (e.items || []).every(i => i.status === 'done');
      const isNow = (cy, d) => cy === c.cycle && d === c.day;
      let streak = 0;
      for (let cy = c.cycle, d = c.day; cy >= 1; ) {
        const e = dayEntry(cy, d);
        if (!e) break;
        if (dayKept(e)) streak += 1;
        else if (!isNow(cy, d)) break;
        d -= 1;
        if (d < 1) { cy -= 1; d = cycleLen(c, cy); }
      }
      /* the last seven days, oldest first, so the row ends on today */
      const FLAME = '<svg viewBox="0 0 24 24"><path d="M12 3.5c.5 2.7 2 4.2 3.5 5.8 1.4 1.5 2.5 3.1 2.5 5.2a6 6 0 0 1-12 0c0-1.7.7-3.2 1.8-4.4.3 1 .9 1.8 1.7 2.3-.4-3 .7-6.2 2.5-8.9z"/></svg>';
      let lit = 0, days = '';
      for (let i = 6; i >= 0; i--) {
        let cy = c.cycle, d = c.day - i;
        while (d <= 0) { cy -= 1; d += cycleLen(c, cy); }
        const kept = cy >= 1 && dayKept(dayEntry(cy, d));
        if (kept) lit += 1;
        days += `<span class="sd${kept ? ' on' : ''}">${FLAME}</span>`;
      }
      const streakHtml = (!isToday || obs || !streak) ? '' :
        `<div class="streak">
          <b class="num">${streak}</b>
          <span class="st"><small>DAY STREAK</small></span>
          <span class="sdays" role="img" aria-label="${lit} of the last seven days complete">${days}</span>
        </div>`;

      /* ---------- Today's extras: the birthday band ----------
         One quiet instrument around the arrival, marking the day itself.
         Session reminders and automation prompts moved to the request layer
         (HV.requests in core) — they hover app-wide now, not here. */
      const TDX_CSS =
        `<style>
        .tdx-bday{display:flex;align-items:center;gap:var(--s3);width:100%;
          margin:0 0 var(--s3);padding:var(--s3) var(--s4);border-radius:var(--r-lg);
          background:var(--brand-wash);color:var(--brand)}
        .tdx-bday > svg{width:22px;height:22px;flex:none;fill:none;stroke:currentColor;
          stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round}
        .tdx-bday small{display:block;font-size:var(--t-micro);letter-spacing:.14em;color:var(--ink-3)}
        .tdx-bday b{display:block;font-size:var(--t-sm);font-weight:600;color:var(--ink)}
        </style>`;

      /* birthday — generic month-day check against c.dob, so any client
         whose date lands today gets the band. Quiet by design: a sentence,
         not confetti (HV.celebrate is budgeted elsewhere). */
      const bdayHtml = (isToday && c.dob &&
        String(c.dob).slice(5) === HV.todayISO().slice(5))
        ? `<div class="tdx-bday" role="status">${HV.ui.icon('sparkle')}
            <span class="grow"><small>A DAY WORTH MARKING</small>
            <b>Happy birthday, ${HV.esc(firstName(c.name))} — the team is cheering for you today.</b></span>
          </div>`
        : '';

      /* ---------- the morning film ----------
         Today's prescribed film, resolved from the 11-day template. The play
         mark rides in the band's right seat all day; on the FIRST open of the
         day it also takes the screen. A day you browsed back to is a glance,
         not an arrival, so only the real today plays.

         The test is "did you browse away", NOT isToday: a client in the
         observation window has no calendar yet, so isToday is false for them
         every morning — and the observation window is exactly when a reason to
         get up matters most. */
      const browsedAway = asked !== -1 && asked !== todayIdx;
      const film = browsedAway ? null : HV.motivationFor(c);

      el.innerHTML = TDX_CSS +
        HV.ui.sceneBand('THIS MORNING', greeting() + ', ' + firstName(c.name), obs
          ? 'Observation · Day ' + c.day + ' of ' + OBS_DAYS + ' · ' + HV.esc(c.tier)
          : 'Cycle ' + c.cycle + ' · ' + HV.copy.dayOf(c) + ' · ' + HV.esc(c.tier),
          film ? HV.film.mark(film) : '') +
        `${streakHtml}
        ${moodHtml}
        ${bdayHtml}
        ${obsHtml}
        ${dayNav}
        ${todayHtml}
        ${dailyHtml}`;
      /* the #np-fab hologram button retired 9 Aug (TJ) — the figure was
         promoted to the Trackers hub's centre, where HV.np builds it; the
         .fab CSS now serves the quick-add [+] on that page instead */

      /* ---------- wiring ---------- */
      /* a drawer the client opened stays open — that state belongs to them, not
         to the screen, so it survives every re-render and every visit. */
      el.querySelectorAll('.tg[data-p]').forEach(d => d.addEventListener('toggle', () => {
        const k = d.dataset.p;
        const stored = HV.store.todayOpen || {};
        /* the parser queues one toggle for every drawer rendered open — only a
           state that differs from what we rendered is the client's choice */
        const rendered = (k in stored) ? !!stored[k] : k === firstLive;
        if (d.open === rendered) return;
        HV.store.todayOpen = stored;
        stored[k] = d.open;
        HV.save();
      }));

      /* the morning film: the mark replays it on demand, and the first arrival
         of the day opens it by itself. HV.film.open stamps the date as it
         opens, so a refresh mid-film does not start the day over. */
      const filmBtn = el.querySelector('.filmmark');
      if (filmBtn && film) {
        filmBtn.addEventListener('click', () => HV.film.open(c, film, filmBtn));
        if (!HV.film.seen(c)) HV.film.open(c, film, filmBtn);
      }

      /* the arrival sheet lives at module scope (openArrival) — the same
         ceremony answers the Trackers quick-add as HV.moodSheet (9 Aug) */
      const arriveBtn = el.querySelector('#arrive-open');
      if (arriveBtn) arriveBtn.addEventListener('click', () => openArrival(c));

      /* session reminders and the weigh-in automation moved to the request
         layer (HV.requests / the hovering deck in core) — nothing to wire. */

      /* every task card row opens its sheet — the group walks with ‹ › */
      HV.ui.wireTasks(el, tasks);

      /* the call now lives on its session row; joining is the same promise it
         always was — the room opens ten minutes early and the coach is in it.
         Inside that window the chip opens the real room instead of promising
         one, and leaving the room is what asks for the stars. */
      el.querySelectorAll('[data-meet]').forEach(b => b.addEventListener('click', () => {
        const p = b.dataset.meet.split(':');
        HV.meetui.join(p[0], Number(p[1]));
      }));
      el.querySelectorAll('.chip.join').forEach(b => b.addEventListener('click', () =>
        HV.toast('Join opens 10 minutes before. ' + b.dataset.join + ' will be there.')));

      const openBtn = el.querySelector('#daily-open');
      if (openBtn) openBtn.addEventListener('click', () => {
        HV.sheet(
          `<div class="h1">${HV.esc(card.title)}</div>
          <div class="sub">Today’s read</div>
          ${card.body}
          <button class="btn block" id="dc-done">Done reading</button>`,
          sh => sh.querySelector('#dc-done').addEventListener('click', () => {
            HV.closeSheet();
            HV.toast('Small reads, big shifts.');
          })
        );
      });

      const disBtn = el.querySelector('#daily-dismiss');
      if (disBtn) disBtn.addEventListener('click', () => {
        HV.store.dailyCardDismissed = HV.store.dailyCardDismissed || {};
        HV.store.dailyCardDismissed[c.id] = true;
        HV.save();
        HV.refresh();
        HV.toast('Dismissed. A fresh read arrives tomorrow.');
      });
    },
  });
})();
