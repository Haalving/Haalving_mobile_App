/* TR-01 · Trackers — the body at the centre, every signal one tap away.

   Reworked 9 Aug (TJ, Samsung Health reference): the page is a HUB now.
   The Nutrient Panel's hologram figure stands mid-page with eight satellite
   buttons around it — nutrition on the left (calories, macros, the five
   critical micros → the Nutrient Panel sheet), the tracked day on the right
   (sleep, screen, activity, water, steps → each signal's own detail page).
   Two in-page tabs carry the page's two time-horizons: Daily Tracking (the
   hub) and Journey (client-journey.js's page, its bottom-bar seat retired).
   A [+] quick-add floats on every trackers route: sleep, mood, water,
   weight, and attach-a-document — add stats here, read them here.

   Sub-routes carry the state (the tribe-classic pattern), so every screen
   is a link and Back always works:
     #/trackers            the hub (Daily Tracking)
     #/trackers/journey    the Journey tab
     #/trackers/daily|sleep|water|screen   one signal's detail page

   A detail page keeps the pre-hub anatomy exactly:
     back chip → filter row → day strip → hero (instrument + tiles +
     summary) → the day broken down → the last three weeks

   The hero instrument is HV.ui.quad — concentric quadrilaterals, one ring per
   signal. The day strip is the one thing Samsung gets exactly right and we
   copy outright: whole-cell days, each wearing a miniature of the page's own
   instrument (THE FIT RULE below).

   All data flows through HV.trackers — the seam Health Connect registers
   behind once the app ships in its native shell. Water and (since 9 Aug)
   sleep are the manual writers; the rest wait for the phone. */
(function () {
  'use strict';

  /* count-up plays once per visit to this page, not on every re-draw and not
     on a hub↔detail hop (those are hashchanges WITHIN trackers now) — only a
     hashchange whose first segment newly becomes 'trackers' arms the flag.
     Registered at script-load time, ahead of core.js's own hashchange
     listener, so this always sees the route change first. */
  const hashSeg = u => { const i = String(u).indexOf('#'); return i === -1 ? '' : String(u).slice(i + 2).split('/')[0]; };
  let freshEntry = location.hash.slice(2).split('/')[0] === 'trackers';
  window.addEventListener('hashchange', e => {
    if (hashSeg(e.newURL) === 'trackers' && hashSeg(e.oldURL) !== 'trackers') freshEntry = true;
  });

  /* Module-level, deliberately: HV.refresh() re-enters render() from the top,
     so anything held in a render closure would snap back the moment something
     elsewhere refreshed the shell. (The chosen tracker itself moved into the
     hash on 9 Aug — only the chosen DAY and the strip's place remain.) */
  let dayBack = 0;                                   // 0 = today, up to the history length
  let lastClientId = null;
  /* which day sits at the strip's left edge, kept across the innerHTML swap
     in draw() — null means "not placed yet", which opens it at today */
  let stripAnchor = null;
  /* held so the observer is not collected: draw() replaces the node it
     watches on every redraw, and an unreferenced ResizeObserver can be
     garbage-collected out from under a long-lived page */
  let dstripRO = null;

  const TABS = [
    { id: 'daily',  label: 'Daily activity' },
    { id: 'sleep',  label: 'Sleep' },
    { id: 'water',  label: 'Water' },
    { id: 'screen', label: 'Screen time' },
  ];

  /* ── reading a chosen day ───────────────────────────────────────────────
     HV.trackers.read() hands back 21 values, oldest first, with today last —
     so "n days back" is just an index from the end. Every page reads its day
     through here and nowhere else, which is why the day strip can move all
     four pages with one variable. */
  function at(r, back) {
    if (!r || !r.week) return 0;
    const i = r.week.length - 1 - back;
    return i >= 0 ? (r.week[i] || 0) : 0;
  }

  /* the strip reaches exactly as far back as the readings do — asked from the
     data rather than fixed at 7, so a longer history lengthens the strip and
     nothing has to agree about a number in two places */
  function historyLen() {
    const r = HV.trackers.read('steps');
    return (r && r.week && r.week.length) || 21;
  }

  const pctOf = (v, target) => (target ? Math.min(100, Math.round(v / target * 100)) : 0);

  /* the day a strip button means, counted back from today */
  function dateBack(back) {
    const d = new Date();
    d.setDate(d.getDate() - back);
    return d;
  }

  function dayName(back) {
    if (back === 0) return 'Today';
    if (back === 1) return 'Yesterday';
    return dateBack(back).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
  }

  /* ── the day's shape ────────────────────────────────────────────────────
     An hourly chart needs an hourly source, and the demo store keeps daily
     totals. Rather than invent 24 numbers per day per signal, we keep ONE
     curve per kind of signal — the shape a day actually traces — and scale it
     to whatever that day's total was. The chart therefore always sums to the
     figure printed above it, and a bigger day is the same day drawn taller.
     Two curves, because screens and legs do not share a rhythm: movement
     peaks at the morning walk and the evening one, screens climb all evening. */
  const SHAPE = {
    move:   [0, 0, 0, 0, 0, 1, 4, 7, 6, 3, 3, 4, 5, 4, 3, 3, 4, 6, 8, 7, 4, 2, 1, 0],
    screen: [0, 0, 0, 0, 0, 0, 1, 3, 4, 3, 2, 2, 4, 3, 2, 2, 3, 4, 6, 9, 11, 8, 5, 2],
  };
  const shapeSum = k => SHAPE[k].reduce((a, b) => a + b, 0);
  const hourly = (total, k) => SHAPE[k].map(s => total * s / shapeSum(k));

  /* an "active hour" is an hour you took 250 steps in — the same threshold
     the wearables use, applied to our own curve so the number is derived,
     never invented */
  const activeHours = steps => hourly(steps, 'move').filter(v => v >= 250).length;
  /* 70 cm of ground per step: the stride an adult walking at pace covers */
  const distanceKm = steps => steps * 0.0007;

  const n0 = v => Math.round(v).toLocaleString('en-IN');

  /* ── shared page furniture ──────────────────────────────────────────────*/

  /* the filter row — Samsung's "Hours · Days · Weeks · Months" grammar: the
     chosen one wears a filled pill, the rest are bare text. Since 9 Aug the
     buttons are LINKS (data-go full-hash, the tribe-classic pattern), so
     lateral movement between details is navigation and Back walks it. */
  function filterRow(active) {
    return '<div class="hswrap"><div class="tfil" role="group" aria-label="Tracker">' +
      TABS.map(t =>
        '<button data-go="#/trackers/' + t.id + '" class="' + (active === t.id ? 'on' : '') + '"' +
        (active === t.id ? ' aria-current="page"' : '') + '>' + HV.esc(t.label) + '</button>').join('') +
      '</div><button class="hs-more" aria-label="Show more trackers">' + HV.ui.icon('chevR') + '</button></div>';
  }

  /* the two seats above everything: the hub and the journey — the page's
     two time-horizons, hash-carried like every other state here */
  function tabRow(which) {
    return '<div class="tfil t2" role="group" aria-label="Daily tracking or journey">' +
      '<button data-go="#/trackers"' + (which === 'daily' ? ' class="on" aria-current="page"' : '') + '>Daily Tracking</button>' +
      '<button data-go="#/trackers/journey"' + (which === 'journey' ? ' class="on" aria-current="page"' : '') + '>Journey</button>' +
      '</div>';
  }

  /* the way back up from a detail — the hub is one chip away */
  function backChip() {
    return '<button class="chip tkback" data-go="#/trackers">' + HV.ui.icon('chevL') + 'All signals</button>';
  }

  /* ── the day mark ───────────────────────────────────────────────────────
     One quadrilateral per day with the HAALVING H at its centre, filled to
     how close that day came to its targets and lit when it met all of them
     (TJ, 9 Aug). It replaces the three concentric bands on the hub's strip:
     the hub is not about one signal, so its miniature should not be either.

     Brand teal, deliberately, and never a series colour — the mark speaks
     for the whole day at once, and wearing sleep's indigo or water's blue
     would claim it was about one of them. */
  function dayMark(pct) {
    const p = Math.max(0, Math.min(100, Math.round(pct)));
    /* the diamond opened at the top vertex and walked clockwise, the same
       origin and direction as HV.ui.quad and the dial's arc — a half-drawn
       mark here and a half-turned dial there have to mean the same thing */
    const d = 'M50 10L90 50L50 90L10 50Z';
    return '<span class="dmk' + (p >= 100 ? ' full' : '') + '" style="--dp:' + p + '">' +
      '<svg viewBox="0 0 100 100" aria-hidden="true">' +
        '<path class="dmk-t" d="' + d + '"/>' +
        '<path class="dmk-f" d="' + d + '" pathLength="100"/>' +
        /* the H of the coin's mark, at the size the diamond leaves free */
        '<path class="dmk-h" d="M40 38v24M60 38v24M40 50h20"/>' +
      '</svg></span>';
  }

  /* the sleep score is measured against an eight-hour night — the same 480
     minutes core.js's sleep writer divides by. Restated rather than exported
     because it is a fact about sleep, not a setting. */
  const SLEEP_NEED = 480;

  /* ── one day's completion, 0–100 ────────────────────────────────────────
     Six satellites have a target to come close to, and four of them are
     "more is better" — they score as a fraction of that target. The other
     two are not, and scoring them the same way would be a lie: a calorie
     surplus is not a win, and the screen figure is a ceiling you stay under.
     Those two score by DISTANCE from the line instead.

     Every part is capped at 100 before the mean, so one heroic step count
     cannot carry a bad night — which is also what makes the full mark mean
     something: the average only reaches 100 when every single part does.

     The readings are taken once and closed over: the strip asks for 21 days
     and re-reading the store for each of them would be 105 lookups. */
  function dayScorer() {
    const steps = HV.trackers.read('steps');
    const active = HV.trackers.read('active');
    const water = HV.trackers.read('water');
    const sleep = HV.trackers.read('sleep');
    const screen = HV.trackers.read('screen');
    const c = HV.myClient();
    const cap = v => Math.max(0, Math.min(100, v));
    return back => {
      const sv = at(screen, back);
      /* a day the phone never reported is not a day that went badly — and it
         would otherwise score 20, because zero screen time is technically
         "under the ceiling". No readings at all means an empty mark. */
      if (!sv && !at(steps, back) && !at(active, back) && !at(water, back) && !at(sleep, back)) return 0;
      const parts = [
        pctOf(at(steps, back), steps.target),
        pctOf(at(active, back), active.target),
        pctOf(at(water, back), water.target),
        cap(at(sleep, back)),
        /* under the ceiling is a clean 100; past it the score falls away and
           reaches zero at double it */
        sv <= screen.target ? 100 : cap(100 - (sv - screen.target) / screen.target * 100),
      ];
      /* the plates, read the way the Nutrient Panel itself reads that day, so
         the strip and the sheet can never disagree about how a day went */
      const r = c && HV.np.reading(c, c.day - back, back === 0 ? 'today' : 'past');
      if (r && r.kcal.target) parts.push(cap(100 - Math.abs(r.kcal.value / r.kcal.target * 100 - 100)));
      return Math.round(parts.reduce((a, v) => a + v, 0) / parts.length);
    };
  }

  /* seven days, each wearing a miniature of this page's own instrument.
     `mini(back)` returns the rings for that day, so every tab gets the same
     strip without the strip knowing anything about the tab. */
  function dayStrip(glyph, note) {
    let out = '';
    for (let b = historyLen() - 1; b >= 0; b--) {
      const d = dateBack(b);
      out += '<button class="dday' + (b === dayBack ? ' on' : '') + '" data-back="' + b + '"' +
        (b === dayBack ? ' aria-current="true"' : '') +
        ' aria-label="' + HV.esc(dayName(b) + (note ? ' — ' + note(b) : '')) + '">' +
        '<span class="dw">' + HV.esc(d.toLocaleDateString('en-IN', { weekday: 'narrow' })) + '</span>' +
        '<span class="dg">' + glyph(b) + '</span>' +
        '<span class="dn num">' + d.getDate() + '</span>' +
        '</button>';
    }
    return '<div class="dstrip" role="group" aria-label="Pick a day">' + out + '</div>' +
      '<div class="dsel">' + HV.esc(dayName(dayBack)) + '</div>';
  }

  /* the row of bordered readings under the instrument — Samsung's one genuinely
     reusable component (it carries the macros on the Food page too), and the
     only place a tracker's series colour appears */
  function tiles(list) {
    return '<div class="mtiles">' + list.map(t =>
      '<div class="mtile" style="--mc:var(--' + t.color + ')">' +
        '<span class="ml">' + HV.esc(t.label) + '</span>' +
        '<span class="mv"><b class="num"' +
          (t.countup != null ? ' data-countup="' + t.countup + '"' : '') + '>' + HV.esc(t.value) + '</b>' +
          (t.unit ? '<small>' + HV.esc(t.unit) + '</small>' : '') + '</span>' +
        '<span class="mt num">/ ' + HV.esc(t.target) + '</span>' +
      '</div>').join('') + '</div>';
  }

  /* label ·········· value — the dotted leader Samsung prints its day totals on */
  function sumRows(rows) {
    return '<div class="sumrows">' + rows.map(r =>
      '<div class="sumrow"><span>' + HV.esc(r.k) + '</span>' +
      '<b class="num">' + HV.esc(r.v) + (r.u ? '<small> ' + HV.esc(r.u) + '</small>' : '') + '</b></div>').join('') +
      '</div>';
  }

  function hourChart(title, total, kind, fmt, color) {
    const vals = hourly(total, kind);
    const peak = Math.max.apply(null, vals);
    const bars = vals.map((v, h) =>
      '<i style="height:' + (peak > 0 ? Math.max(2, Math.round(v / peak * 100)) : 0) + '%"' +
      ' title="' + HV.esc(String(h).padStart(2, '0') + ':00 · ' + fmt(v)) + '"></i>').join('');
    return '<div class="hchart" style="--hc:var(--' + color + ')">' +
      '<div class="hh"><b>' + HV.esc(title) + '</b>' +
      '<small>' + (total > 0 ? HV.esc(fmt(total)) : 'No recorded data') + '</small></div>' +
      '<div class="hbars" aria-hidden="true">' + bars + '</div>' +
      '<div class="hax"><span>0</span><span>6</span><span>12</span><span>18</span><span>(h)</span></div>' +
      '</div>';
  }

  function group(title, cells) {
    return '<div class="dgroup"><div class="sec-title">' + HV.esc(title) + '</div>' +
      '<div class="grid2">' + cells.map(c =>
        '<div class="dcell"><span class="k">' + HV.esc(c.k) + '</span>' +
        '<span class="v num">' + HV.esc(c.v) + (c.u ? '<small> ' + HV.esc(c.u) + '</small>' : '') + '</span></div>').join('') +
      '</div></div>';
  }

  const avgOf = week => {
    const days = week.filter(v => v > 0);
    return days.length ? Math.round(days.reduce((s, v) => s + v, 0) / days.length) : 0;
  };

  /* ── the four pages ─────────────────────────────────────────────────────*/

  function dailyPage(c) {
    const steps = HV.trackers.read('steps');
    const active = HV.trackers.read('active');
    const burn = HV.trackers.read('actCal');
    const s = at(steps, dayBack), a = at(active, dayBack), k = at(burn, dayBack);
    const rings = [
      { pct: pctOf(s, steps.target), color: 'tk-move', label: 'Steps' },
      { pct: pctOf(a, active.target), color: 'tk-time', label: 'Active time' },
      { pct: pctOf(k, burn.target), color: 'tk-burn', label: 'Activity calories' },
    ];
    const bmr = c.trackers.bmr || 0;
    const live = dayBack === 0;

    return '<div class="card tkhero">' +
        '<div class="qwrap">' + HV.ui.quad(rings) + '</div>' +
        tiles([
          { label: 'Steps', color: 'tk-move', value: n0(s), unit: '', target: n0(steps.target), countup: live ? s : null },
          { label: 'Active time', color: 'tk-time', value: String(a), unit: 'min', target: active.target + ' min' },
          { label: 'Activity calories', color: 'tk-burn', value: n0(k), unit: 'kcal', target: n0(burn.target) + ' kcal' },
        ]) +
        sumRows([
          { k: 'Total burnt calories', v: n0(bmr + k), u: 'kcal' },
          { k: 'Distance while active', v: distanceKm(s).toFixed(2), u: 'km' },
        ]) +
      '</div>' +

      '<div class="card">' +
        hourChart('Steps', s, 'move', v => n0(v) + ' steps', 'tk-move') +
        hourChart('Active time', a, 'move', v => HV.fmtMins(v), 'tk-time') +
        hourChart('Activity calories', k, 'move', v => n0(v) + ' kcal', 'tk-burn') +
      '</div>' +

      '<div class="card">' +
        group('Motion', [
          { k: 'Distance', v: distanceKm(s).toFixed(2), u: 'km' },
          { k: 'Active hours', v: String(activeHours(s)), u: 'h' },
        ]) +
        group('Time', [
          { k: 'Active time', v: HV.fmtMins(a) },
          { k: 'Left to target', v: a >= active.target ? 'met' : HV.fmtMins(active.target - a) },
        ]) +
        group('Calories', [
          { k: 'Activity burn', v: n0(k), u: 'kcal' },
          { k: 'Resting burn', v: n0(bmr), u: 'kcal' },
        ]) +
      '</div>' +

      '<div class="card tk"><b>Steps · last three weeks</b>' +
        HV.ui.weekBars(steps.week, steps.target, 'avg ' + n0(avgOf(steps.week)),
          v => n0(v) + ' steps') + '</div>';
  }

  function sleepPage(c) {
    const sleep = HV.trackers.read('sleep');
    const pct = at(sleep, dayBack);
    const t = c.trackers;
    const st = t.stages || { deep: 0, rem: 0, light: 0, awake: 0 };
    const seeded = st.deep + st.rem + st.light + st.awake;
    /* the night's LENGTH moves day to day, its SHAPE barely does — so a past
       night is this sleeper's own stage proportions stretched to that night's
       total. Scaling from the percentage keeps stages and headline agreeing. */
    const scale = seeded && sleep.value ? pct / sleep.value : 0;
    const mins = key => Math.round(st[key] * scale);
    /* the four stages together are the night IN BED, not the night asleep —
       the seed proves it: every client's stages sum to exactly their bed→wake
       span. So asleep is that span minus the time awake in it, and the two
       readings never contradict the bed and wake times printed beside them. */
    const total = mins('deep') + mins('rem') + mins('light') + mins('awake');
    const asleep = total - mins('awake');
    const live = dayBack === 0;

    const STAGES = [
      { k: 'deep', name: 'Deep' }, { k: 'rem', name: 'REM' },
      { k: 'light', name: 'Light' }, { k: 'awake', name: 'Awake' },
    ];

    const bar = total
      ? '<div class="stagebar" aria-hidden="true">' + STAGES.map(x =>
          '<i class="sg-' + x.k + '" style="flex:' + mins(x.k) + '"></i>').join('') + '</div>'
      : '';

    return '<div class="card tkhero">' +
        '<div class="qwrap">' + HV.ui.quad([{ pct: pct, color: 'tk-rest', label: 'Sleep' }],
          { cap: '<b class="num">' + pct + '%</b> of the sleep you need' }) + '</div>' +
        '<div class="tk-read"><span class="num">' + HV.esc(asleep ? HV.fmtMins(asleep) : '—') + '</span>' +
          '<small> asleep</small></div>' +
        tiles([
          { label: 'Sleep score', color: 'tk-rest', value: String(pct), unit: '%', target: '100%', countup: live ? pct : null },
          { label: 'To bed', color: 'tk-rest', value: HV.esc(t.bed || '—'), unit: '', target: 'lights out' },
          { label: 'Awake', color: 'tk-rest', value: HV.esc(t.wake || '—'), unit: '', target: 'up' },
        ]) +
        sumRows([
          { k: 'Time in bed', v: total ? HV.fmtMins(total) : '—' },
          { k: 'Against your need', v: pct ? pct + '%' : '—' },
        ]) +
      '</div>' +

      (total
        ? '<div class="card"><div class="sec-title">Stages</div>' + bar +
            '<div class="list">' + STAGES.map(x =>
              '<div class="strow"><span class="sdot sg-' + x.k + '"></span>' +
              '<span class="grow">' + x.name + '</span>' +
              '<b class="num">' + HV.fmtMins(mins(x.k)) + '</b>' +
              '<small class="num">' + Math.round(mins(x.k) / total * 100) + '%</small></div>').join('') +
            '</div></div>'
        : '<div class="card">' + HV.ui.empty('moon', 'No sleep recorded for ' + dayName(dayBack).toLowerCase() + '. Wear your band overnight and it lands here by morning.') + '</div>') +

      '<div class="card tk"><b>Sleep · last three weeks</b>' +
        HV.ui.weekBars(sleep.week, 100, 'avg ' + avgOf(sleep.week) + '%',
          v => (v ? v + '% of your sleep need' : 'no reading')) + '</div>';
  }

  function waterPage(c) {
    const water = HV.trackers.read('water');
    const v = at(water, dayBack);
    const live = dayBack === 0;
    /* today has real stamps; a past day has only a count, and slicing today's
       log to it would date this morning's glasses to last Tuesday. So, as the
       sleep stages and screen apps do, a past day's shape is derived from its
       total — v glasses spread across the waking window — and the list always
       ends on the glass the headline claims. */
    const spread = k => Array.from({ length: k }, (_, i) => {
      const m = 7 * 60 + Math.round((k === 1 ? 0.5 : i / (k - 1)) * 13 * 60);
      return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    });
    const log = live ? (c.trackers.waterLog || []) : spread(v);

    /* the glasses are only tappable on today — you cannot drink yesterday */
    let dots = '';
    for (let i = 1; i <= water.target; i++) {
      dots += '<button data-glass="' + i + '" class="' + (i <= v ? 'on' : '') + '"' +
        (live ? '' : ' disabled') +
        ' aria-label="' + i + (i === 1 ? ' glass' : ' glasses') + '"' +
        (i === v ? ' aria-pressed="true"' : '') + '>' + HV.ui.icon('drop') + '</button>';
    }

    return '<div class="card tkhero">' +
        '<div class="qwrap">' + HV.ui.quad([{ pct: pctOf(v, water.target), color: 'tk-water', label: 'Water' }],
          { cap: '<b class="num">' + pctOf(v, water.target) + '%</b> of the day’s glasses' }) + '</div>' +
        '<div class="tk-read"><span class="num"' + (live ? ' data-countup="' + v + '"' : '') + '>' + v + '</span>' +
          '<small> of ' + water.target + ' glasses</small></div>' +
        '<div class="wdots" role="group" aria-label="Glasses of water today">' + dots + '</div>' +
        sumRows([
          { k: 'Roughly', v: (v * 0.25).toFixed(2), u: 'litres' },
          { k: 'Still to drink', v: v >= water.target ? 'none' : String(water.target - v), u: v >= water.target ? '' : 'glasses' },
        ]) +
      '</div>' +

      (log.length
        ? '<div class="card"><div class="sec-title">Through the day</div><div class="list">' +
            log.map((time, i) =>
              '<div class="strow"><span class="sdot sg-water"></span>' +
              '<span class="grow">Glass ' + (i + 1) + '</span>' +
              '<b class="num">' + HV.esc(time) + '</b></div>').join('') +
          '</div></div>'
        : '<div class="card">' + HV.ui.empty('drop', live
            ? 'No glasses logged yet today. Tap a drop above the moment you drink one.'
            : 'Nothing logged on ' + dayName(dayBack).toLowerCase() + '.') + '</div>') +

      '<div class="card tk"><b>Water · last three weeks</b>' +
        HV.ui.weekBars(water.week, water.target, 'avg ' + avgOf(water.week),
          x => x + (x === 1 ? ' glass' : ' glasses')) + '</div>';
  }

  function screenPage(c) {
    const screen = HV.trackers.read('screen');
    const v = at(screen, dayBack);
    const apps = c.trackers.screenApps || [];
    const seeded = apps.reduce((s, a) => s + a.mins, 0);
    /* same trick as sleep stages: the split holds, the total moves */
    const scale = seeded ? v / seeded : 0;
    const over = v > screen.target;

    /* screen time reads its instrument the other way round — the target is a
       ceiling, so the ring filling up is the warning, not the reward */
    return '<div class="card tkhero">' +
        '<div class="qwrap">' + HV.ui.quad([{ pct: pctOf(v, screen.target), color: 'tk-screen', label: 'Screen time' }],
          { cap: '<b class="num">' + pctOf(v, screen.target) + '%</b> of your ceiling' }) + '</div>' +
        '<div class="tk-read"><span class="num">' + HV.esc(HV.fmtMins(v)) + '</span>' +
          '<small> on screens</small></div>' +
        tiles([
          { label: 'Your ceiling', color: 'tk-screen', value: HV.esc(HV.fmtMins(screen.target)), unit: '', target: 'a day' },
          { label: over ? 'Over by' : 'Under by', color: 'tk-screen',
            value: HV.esc(HV.fmtMins(Math.abs(screen.target - v))), unit: '', target: over ? 'too long' : 'good' },
          { label: 'Share of waking', color: 'tk-screen', value: String(Math.round(v / (16 * 60) * 100)), unit: '%', target: '16 h awake' },
        ]) +
        (over
          ? '<div class="notice warn">You went past your ceiling ' + HV.esc(dayBack === 0 ? 'today' : 'that day') +
            '. The evening hours are where it usually goes.</div>'
          : '') +
      '</div>' +

      (seeded && v
        ? '<div class="card"><div class="sec-title">Where it went</div><div class="list">' +
            apps.map(a => {
              const m = Math.round(a.mins * scale);
              return '<div class="approw"><span class="grow">' + HV.esc(a.name) + '</span>' +
                '<b class="num">' + HV.esc(HV.fmtMins(m)) + '</b>' +
                '<span class="abar"><i style="width:' + Math.round(m / v * 100) + '%"></i></span></div>';
            }).join('') +
          '</div></div>'
        : '') +

      '<div class="card">' + hourChart('Screen time', v, 'screen', x => HV.fmtMins(x), 'tk-screen') + '</div>' +

      '<div class="card tk"><b>Screen time · last three weeks</b>' +
        HV.ui.weekBars(screen.week, screen.target, 'avg ' + HV.fmtMins(avgOf(screen.week)),
          x => (x ? HV.fmtMins(x) + ' on screens' : 'no reading')) + '</div>';
  }

  /* ── the miniature each tab wears in its day strip ──────────────────────*/
  function miniFor(tabId) {
    const steps = HV.trackers.read('steps');
    const active = HV.trackers.read('active');
    const burn = HV.trackers.read('actCal');
    const water = HV.trackers.read('water');
    const sleep = HV.trackers.read('sleep');
    const screen = HV.trackers.read('screen');
    if (tabId === 'daily') {
      return b => [
        { pct: pctOf(at(steps, b), steps.target), color: 'tk-move', label: 'Steps' },
        { pct: pctOf(at(active, b), active.target), color: 'tk-time', label: 'Active time' },
        { pct: pctOf(at(burn, b), burn.target), color: 'tk-burn', label: 'Activity calories' },
      ];
    }
    if (tabId === 'sleep')  return b => [{ pct: at(sleep, b), color: 'tk-rest', label: 'Sleep' }];
    if (tabId === 'water')  return b => [{ pct: pctOf(at(water, b), water.target), color: 'tk-water', label: 'Water' }];
    return b => [{ pct: pctOf(at(screen, b), screen.target), color: 'tk-screen', label: 'Screen time' }];
  }

  /* ── the hub — the body at the centre, eight signals around it ──────────*/

  /* the five micros a care team actually acts on (TJ, 9 Aug: "only the 5
     most critical"): the two chronic Indian-context deficiencies (vitamin D,
     B12), the two borderline minerals (iron, calcium) and the one habitual
     surplus (sodium). A curated list HERE, not a flag in data.js — the seed
     is persisted, and a shape change there costs every demo its story. */
  const CRITICAL_MICROS = ['vitd', 'b12', 'iron', 'calc', 'sod'];

  /* ── where each seat sits ───────────────────────────────────────────────
     The figure is 482px tall inside a 492px stage, hung 30px above the
     stage's ceiling, so the body itself (the webp puts head-top at 15% and
     soles at 84% of the image) runs from y=42 to y=375 in stage
     coordinates. Every seat is measured against THAT, not against the stage:

       y     the chip's top, chosen so its whisker (24px further down) meets
             the body at the fraction of its height this signal belongs to
       gap   how far the chip's INNER edge sits from the figure's midline —
             the body's half-width there, plus the whisker. This is why the
             numbers are not a rhythm: they trace the silhouette, wide at the
             hands, narrow at the head and the ankles
       lead  the whisker's own length, so its dot lands on the outline

     Measured from the midline rather than the screen edge on purpose: the
     shell grows to 520px on a tablet, and edge-anchored chips would drift
     away from a centred figure and end up pointing at nothing.

     The whole set moved up 56px on 18 Aug, with .tkhub's height, the figure's
     top and the pad's bottom in app.css — the void above the crown chip was
     reading as a missing element. Shift one of the five and the composition
     comes apart, so they change together or not at all. */
  const SEATS = {
    cal:   { y: 58,  gap: 56, lead: 28, d: '.2s'  },   /* throat */
    macro: { y: 174, gap: 78, lead: 22, d: '.6s'  },   /* core, level with the hands */
    micro: { y: 291, gap: 48, lead: 30, d: '1s'   },   /* thigh  */
    head:  { y: 25,  gap: 42, lead: 30, d: '0s'   },   /* crown  */
    chest: { y: 124, gap: 70, lead: 26, d: '.4s'  },   /* chest, the widest seat */
    belly: { y: 224, gap: 57, lead: 28, d: '.8s'  },   /* belly  */
    shin:  { y: 311, gap: 47, lead: 30, d: '1.2s' },   /* shin   */
    foot:  { y: 393, gap: 0,  lead: 0,  d: '1.6s' },   /* under the soles */
  };

  /* one satellite button. o: {seat key into SEATS, side 'l' | 'r' | 'foot',
     sc series-token name | null, np | go, icon, k label, v value html, dots
     html | null, pct bar fill | null, aria}. A tracker satellite carries its
     series colour through --sc (icon stroke + bar) and nowhere else; a
     nutrition satellite carries NO series colour — the Nutrient Panel's state
     dots speak for it, each with its .vh word so colour is never the only
     carrier. */
  function sat(o) {
    const p = SEATS[o.seat];
    return '<button class="sat ' + o.side + (o.cls || '') + '" style="--y:' + p.y + 'px;' +
      (o.side === 'foot' ? '' : ' --gap:' + p.gap + 'px; --lead:' + p.lead + 'px;') +
      ' --d:' + p.d + ';' + (o.sc ? ' --sc:var(--' + o.sc + ');' : '') + '"' +
      (o.np != null ? ' data-npday="' + o.np + '"' : ' data-go="' + o.go + '"') +
      ' aria-label="' + HV.esc(o.aria) + '">' +
      '<span class="sat-ic" aria-hidden="true">' + HV.ui.icon(o.icon) + '</span>' +
      '<span class="sat-k">' + HV.esc(o.k) + '</span>' +
      '<span class="sat-v">' + o.v + '</span>' +
      (o.dots || '') +
      (o.pct != null
        ? '<span class="sat-bar" aria-hidden="true"><i style="width:' +
          Math.max(0, Math.min(100, Math.round(o.pct))) + '%"></i></span>'
        : '') +
      '</button>';
  }

  const npStateOf = m => HV.np.state(m.target ? m.value / m.target * 100 : 0);

  /* how many of a group sit inside the sufficient band. A surplus does not
     count as met — sodium at 135% is a finding, not a win — and the dots
     under the count keep all three states on the chip. */
  const metCount = ms => ms.filter(m => npStateOf(m)[1] === 'ok').length;

  const npDots = ms => '<span class="sat-dots" aria-hidden="true">' +
    ms.map(m => '<i class="hdot ' + npStateOf(m)[1] + '"></i>').join('') + '</span>';

  /* one line of the ledger under the stage — where the listed detail lives
     now. At full page width a row has the room to print "Sodium 1,707 /
     2,000 mg" on ONE line, which is exactly what a 79px column could not do
     and why those rows had to stack inside the old tile.

     The row itself is built by HV.np.row (client-today.js, which loads
     first): the Nutrient Panel sheet prints the same ledger, and two copies
     of this markup drifted apart the first time one of them was touched.
     Called at render time, never at load time — the usual rule for a
     cross-view entry point. */
  const ledgerRow = (name, m) => HV.np.row(name, m);

  /* the same reading, spoken: "Protein 62 of 96 g, …" for the aria label */
  function npList(ms) {
    return ms.map(m => m.name + ' ' + HV.np.fmt(m.value, m.target) +
      ' of ' + HV.np.fmt(m.target, m.target) + ' ' + m.unit).join(', ');
  }

  function hubHtml(c) {
    /* the hub follows the day strip above it. dayBack is the module's own
       state, already shared with the four detail pages, so tapping a day here
       and then opening Sleep lands on the same day — one variable moves the
       whole section. */
    const back = dayBack;
    const live = back === 0;
    /* the same reading the Nutrient Panel itself opens on — hub and sheet can
       never disagree. Null during observation: the figure stands unlit and the
       nutrition seats read as em-dashes until calibration. */
    const r = HV.np.reading(c, c.day - back, live ? 'today' : 'past');
    const kPct = r && r.kcal.target ? r.kcal.value / r.kcal.target * 100 : 0;

    const sleep = HV.trackers.read('sleep');
    const screen = HV.trackers.read('screen');
    const active = HV.trackers.read('active');
    const burn = HV.trackers.read('actCal');
    const water = HV.trackers.read('water');
    const steps = HV.trackers.read('steps');
    const sleepV = at(sleep, back), screenV = at(screen, back), activeV = at(active, back);
    const burnV = at(burn, back), waterV = at(water, back), stepsV = at(steps, back);
    /* today keeps its written display ("6 h 40 m"); a past day has only its
       score, so the night is read back out of it against the same eight hours
       the score was measured against */
    const sleepText = live ? (sleep.display || '—')
      : (sleepV ? HV.fmtMins(Math.round(sleepV / 100 * SLEEP_NEED)) : '—');

    /* the nutrition seats open the panel ON THE DAY YOU ARE LOOKING AT — the
       sheet has its own pager, and handing it today's page while the hub shows
       Friday would make the two disagree in the same tap */
    const cal = HV.calendarFor(c);
    const todayIdx = Math.max(0, cal.findIndex(d => d.today));
    const npIdx = Math.max(0, todayIdx - back);

    const kSt = r ? HV.np.state(kPct) : null;
    const crit = r
      ? CRITICAL_MICROS.map(k => r.micros.find(m => m.k === k)).filter(Boolean)
      : [];
    const when = live ? ' so far' : ' as eaten';
    const npAria = r
      ? ' Opens the Nutrient Panel.'
      : ' The panel calibrates when your first plate plan arrives.';
    /* the seat prints the reading; the ledger below prints the units. 84px of
       chip is exactly enough for "990 / 1,400" and not a character more. */
    const calV = r
      ? '<b class="num">' + n0(r.kcal.value) + '</b><small class="num"> / ' + n0(r.kcal.target) + '</small>' +
        '<span class="vh"> kcal — ' + kSt[0] + '</span>'
      : '<b class="num">—</b>';
    const groupV = (ms, of) => ms.length
      ? '<b class="num">' + metCount(ms) + '</b><small> of ' + of + ' met</small>'
      : '<b class="num">—</b>';

    const stage = '<div class="tkhub">' +
      HV.np.pad() + HV.np.bodyImg(kPct / 100) +

      /* left — what the plates put in */
      sat({ seat: 'cal', side: 'l', np: npIdx, icon: 'flame', k: 'Calories', v: calV,
        cls: r ? ' st-' + kSt[1] : '', pct: r ? kPct : null,
        aria: r ? n0(r.kcal.value) + ' of ' + n0(r.kcal.target) + ' kcal' + when + ' — ' + kSt[0] + '.' + npAria
                : 'Calories — not calibrated yet.' + npAria }) +
      sat({ seat: 'macro', side: 'l', np: npIdx, icon: 'bowl', k: 'Macros',
        v: groupV(r ? r.macros : [], 4), dots: r ? npDots(r.macros) : '', pct: null,
        aria: (r ? 'Macros — ' + npList(r.macros)
                 : 'Macros — protein, carbohydrate, fat and fibre') + '.' + npAria }) +
      sat({ seat: 'micro', side: 'l', np: npIdx, icon: 'leaf', k: 'Micros',
        v: groupV(crit, 5), dots: r ? npDots(crit) : '', pct: null,
        aria: (r ? 'Micros — ' + npList(crit)
                 : 'Micros — your five critical micronutrients') + '.' + npAria }) +

      /* right — the tracked day, read head to feet. Water sits at the belly
         and Activity at the shin (TJ, 9 Aug — the two were the other way
         round until the seats became anatomy and the swap became obvious). */
      sat({ seat: 'head', side: 'r', sc: 'tk-rest', go: '#/trackers/sleep', icon: 'moon', k: 'Sleep',
        v: '<b class="num">' + HV.esc(sleepText) + '</b>', pct: sleepV,
        aria: 'Sleep — ' + sleepText + ', ' + sleepV + '% of your need. Open the sleep page.' }) +
      sat({ seat: 'chest', side: 'r', sc: 'tk-screen', go: '#/trackers/screen', icon: 'device', k: 'Screen',
        v: '<b class="num">' + HV.esc(HV.fmtMins(screenV)) + '</b>', pct: pctOf(screenV, screen.target),
        aria: 'Screen time — ' + HV.fmtMins(screenV) + ' of your ' + HV.fmtMins(screen.target) + ' ceiling. Open the screen page.' }) +
      sat({ seat: 'belly', side: 'r', sc: 'tk-water', go: '#/trackers/water', icon: 'drop', k: 'Water',
        v: '<b class="num">' + waterV + '</b><small class="num"> of ' + water.target + '</small>',
        pct: pctOf(waterV, water.target),
        aria: 'Water — ' + waterV + ' of ' + water.target + ' glasses. Open the water page.' }) +
      /* the burnt calories drop off the chip and stay in the aria sentence
         and on the daily page — "38 m · 210 kcal" does not fit 84px */
      sat({ seat: 'shin', side: 'r', sc: 'tk-time', go: '#/trackers/daily', icon: 'pulse', k: 'Activity',
        v: '<b class="num">' + HV.esc(HV.fmtMins(activeV)) + '</b>',
        pct: pctOf(activeV, active.target),
        aria: 'Activity — ' + HV.fmtMins(activeV) + ' active, ' + n0(burnV) + ' kilocalories burnt. Open the daily activity page.' }) +

      /* and the eighth, standing on the pad where the feet are */
      sat({ seat: 'foot', side: 'foot', sc: 'tk-move', go: '#/trackers/daily', icon: 'walk', k: 'Steps',
        v: '<b class="num">' + n0(stepsV) + '</b>', pct: pctOf(stepsV, steps.target),
        aria: 'Steps — ' + n0(stepsV) + ' of ' + n0(steps.target) + '. Open the daily activity page.' }) +
    '</div>';

    if (!r) return stage;

    return stage +
      '<div class="card tkled">' +
        '<div class="tkgrp">Macros</div>' +
        r.macros.map(m => ledgerRow(m.name === 'Carbohydrate' ? 'Carbs' : m.name, m)).join('') +
        '<div class="tkgrp">Micros · the five your team acts on</div>' +
        crit.map(m => ledgerRow(m.name, m)).join('') +
      '</div>';
  }

  /* ── quick add — the [+]'s sheet: add stats here, read them here ────────*/

  function sleepSheet(c) {
    const t = c.trackers;
    HV.sheet(
      '<div class="h1">Sleep time</div>' +
      '<p class="sub" style="margin:0">Last night, as well as you remember it — the band fills in the detail once it syncs.</p>' +
      '<label class="sub" for="qa-bed" style="display:block;margin-top:var(--s4)">To bed</label>' +
      '<input class="input num" id="qa-bed" type="time" value="' + HV.esc(t.bed || '22:30') + '">' +
      '<label class="sub" for="qa-wake" style="display:block;margin-top:var(--s3)">Awake</label>' +
      '<input class="input num" id="qa-wake" type="time" value="' + HV.esc(t.wake || '06:30') + '">' +
      '<p class="sub" id="qa-span" style="margin:var(--s3) 0 0"></p>' +
      '<button class="btn block" id="qa-sleep-save" style="margin-top:var(--s3)">Record sleep</button>',
      sh => {
        const bed = sh.querySelector('#qa-bed'), wake = sh.querySelector('#qa-wake');
        const cap = sh.querySelector('#qa-span'), btn = sh.querySelector('#qa-sleep-save');
        const mins = s => { const p = String(s || '').split(':'); return (+p[0] || 0) * 60 + (+p[1] || 0); };
        const span = () => bed.value && wake.value ? (mins(wake.value) - mins(bed.value) + 1440) % 1440 : 0;
        const sync = () => {
          const m = span();
          btn.disabled = !m;
          cap.innerHTML = m ? '<b class="num">' + HV.fmtMins(m) + '</b> in bed' : 'Bed and wake times make the night.';
        };
        bed.addEventListener('input', sync); wake.addEventListener('input', sync); sync();
        btn.addEventListener('click', () => {
          const after = HV.trackers.set('sleep', { bed: bed.value, wake: wake.value });
          if (!after) return;
          HV.closeSheet();
          HV.toast('Sleep recorded — ' + after.display + ', ' + after.value + '% of your need.');
          HV.refresh();
        });
      });
  }

  /* The Samsung "Quick add" grid, in the honeycomb's tile grammar. Attach
     rides LAST and full-width (TJ, 9 Aug — it replaced the composer's clip).
     Tiles that open another sheet simply call HV.sheet again — the overlay
     swaps content in place; the focus-return then points at a destroyed
     tile, which focus() answers with a silent no-op. */
  HV.quickAdd = function (c) {
    const waterSub = w => w.value + ' of ' + w.target + ' glasses today';
    const tile = (id, icon, label, sub, wide) =>
      '<button class="hxtile' + (wide ? ' qa-attach' : '') + '" id="' + id + '">' +
        HV.ui.iconTile(icon, 'sm') +
        '<b>' + HV.esc(label) + '</b>' +
        '<small class="sub">' + HV.esc(sub) + '</small>' +
      '</button>';
    HV.sheet(
      '<div class="h1">Quick add</div>' +
      '<p class="sub" style="margin:0">Log it in a breath — every entry lands in your trackers.</p>' +
      '<div class="hxtiles qagrid">' +
        tile('qa-sleep', 'moon', 'Sleep time', 'Bed to wake, one night') +
        tile('qa-mood', 'smile', 'Mood', 'How you are arriving') +
        tile('qa-water', 'drop', 'Water', waterSub(HV.trackers.read('water'))) +
        tile('qa-weight', 'scale', 'Weight', 'The cycle weigh-in') +
        tile('qa-attach', 'clip', 'Attach a document', 'A report for your Records Vault', true) +
      '</div>',
      sh => {
        sh.querySelector('#qa-sleep').addEventListener('click', () => sleepSheet(c));
        sh.querySelector('#qa-mood').addEventListener('click', () => HV.moodSheet(c));
        sh.querySelector('#qa-weight').addEventListener('click', () => HV.weighSheet(c));
        sh.querySelector('#qa-attach').addEventListener('click', () => { HV.closeSheet(); HV.attachDoc(c); });
        /* water logs IN PLACE — a quick add must not cost a navigation.
           The page beneath re-renders at once (the sheet lives in
           #overlay-root, outside #app, so it survives the refresh). */
        sh.querySelector('#qa-water').addEventListener('click', () => {
          const cur = HV.trackers.read('water');
          if (cur.value >= cur.target) { HV.toast('All ' + cur.target + ' glasses already today.'); return; }
          const after = HV.trackers.add('water', 1);
          const sub = sh.querySelector('#qa-water small');
          if (sub) sub.textContent = waterSub(after);
          HV.refresh();
          if (after.value === after.target) {
            HV.closeSheet();
            HV.celebrate('drop', 'Water goal met', 'All ' + after.target + ' glasses today — your evening self says thanks.');
          } else {
            HV.toast('Glass ' + after.value + ' of ' + after.target);
          }
        });
      });
  };

  /* the [+] itself — floats on every trackers route, wearing the .fab chrome
     the hologram button left behind on Today */
  function fabHtml() {
    return '<button class="fab" id="qa-fab" aria-label="Quick add — sleep, mood, water, weight or a document">' +
      '<span class="fab-lift">' + HV.ui.icon('plus') + '</span></button>';
  }

  HV.registerView('trackers', {
    title: 'Trackers',
    roles: ['client'],

    render(el, params) {
      const c = HV.myClient();
      if (!c) {
        el.innerHTML = HV.ui.empty('leaf', 'We couldn’t find your profile. Switch persona and try again.');
        return;
      }
      /* a different person is a different set of days — never land them on
         somebody else's chosen day */
      if (lastClientId !== c.id) { lastClientId = c.id; dayBack = 0; stripAnchor = null; }

      /* which screen the hash asks for: nothing → the hub; a detail id →
         that signal's page; anything unknown falls back to the hub (the
         console-leave default-fallback idiom) */
      const asked = params && params[0];
      const page = ['daily', 'sleep', 'water', 'screen', 'journey'].indexOf(asked) !== -1 ? asked : 'hub';

      /* Everything below re-draws through draw(), never HV.refresh(): core's
         render() ends with a scrollTo(0,0), which would yank the page from
         under a thumb that just tapped a glass or a day. */
      function draw(countUp) {
        if (page === 'journey') {
          el.innerHTML =
            HV.ui.sceneBand('YOUR SIGNALS', 'Trackers', c.observation
              ? 'Journey · Observation · day ' + c.day + ' of 5'
              : 'Journey · Cycle ' + c.cycle + ' · day ' + c.day + ' of ' + HV.cycleDays() +
                ' · ' + HV.levels() + ' levels × ' + HV.cycleDays() + ' days') +
            tabRow('journey') +
            '<div id="jhost"></div>' +
            fabHtml();
          HV.journeyPage(el.querySelector('#jhost'), c);
          wire(false);
          return;
        }
        if (page === 'hub') {
          const score = dayScorer();
          el.innerHTML =
            HV.ui.sceneBand('YOUR SIGNALS', 'Trackers', 'Pick a day · tap any signal to open it') +
            tabRow('daily') +
            /* the strip that used to live on the pre-hub Trackers page, back
               between the tabs and the composition and carrying one mark per
               day instead of three rings (TJ, 9 Aug) */
            dayStrip(b => dayMark(score(b)), b => score(b) + '% of the day’s targets') +
            hubHtml(c) +
            '<p class="audit">Steps, activity, sleep and screen time will sync automatically from your ' +
            'phone’s Health Connect once the HAALVING app is installed. The [+] logs the rest, any time.</p>' +
            fabHtml();
          wire(false);
          return;
        }
        const body = page === 'daily' ? dailyPage(c)
          : page === 'sleep' ? sleepPage(c)
          : page === 'water' ? waterPage(c)
          : screenPage(c);

        el.innerHTML =
          HV.ui.sceneBand('YOUR SIGNALS', 'Trackers', 'Today · synced readings and one-tap logs together') +
          backChip() +
          filterRow(page) +
          dayStrip(b => HV.ui.quad(miniFor(page)(b), { size: 'sm' })) +
          body +
          '<p class="audit">Steps, activity, sleep and screen time will sync automatically from your ' +
          'phone’s Health Connect once the HAALVING app is installed. Water is one tap here, any time.</p>' +
          fabHtml();

        wire(countUp);
      }

      function wire(countUp) {
        /* history strips open at today (the right end) and stay pinned there
           when the strip changes width — a rotation recomputes the bar width,
           and without this today would drift off the edge */
        el.querySelectorAll('.tstrip').forEach(s => {
          const pinToToday = () => { s.scrollLeft = s.scrollWidth; };
          pinToToday();
          new ResizeObserver(pinToToday).observe(s);
        });
        el.querySelectorAll('.tday').forEach(b => {
          b.addEventListener('click', () => HV.toast(b.dataset.say));
        });

        /* ── THE FIT RULE ────────────────────────────────────────────────
           A day is either wholly on screen or not on screen at all: half a
           quadrilateral is not a smaller reading, it is a wrong one.

           So the cell width is not chosen, it is solved for. Take however
           many whole cells this device can hold at a comfortable size, then
           lay every cell out at exactly container ÷ that count — N cells
           tile the strip with nothing left over. scroll-snap then lands
           every scroll on a cell edge, and because the strip's whole width
           is a whole number of cells, both ends of the travel are cell
           edges too. No partial day is reachable, at any width, on any
           device, at either end of the scroll. */
        const dstrip = el.querySelector('.dstrip');
        if (dstrip) {
          /* Measure the room from the caption below the strip, never from the
             strip itself. Once the strip carries an explicit width its own
             clientWidth is an answer we wrote, and clearing it to re-measure
             lets 21 cells of content briefly size the ancestor — after which
             every cell is solved against a width no phone has. `.dsel` is a
             plain full-width line that nothing ever sizes. */
          const room = () => {
            const ref = el.querySelector('.dsel');
            return ref ? ref.clientWidth : 0;
          };
          const fit = () => {
            const w = room();
            if (!w) return;
            /* 54px keeps every cell past the 44px touch floor with room for
               the glyph; three is the fewest that still reads as a strip */
            const n = Math.max(3, Math.floor(w / 54));
            /* Land the cell on the device-pixel grid. container ÷ n alone is
               usually a fraction (335/6, 389.9/7), the engine rounds each
               cell to the pixel grid anyway, and 21 of those roundings drift
               about a pixel — enough for a hairline of the next day to show.
               Rounding DOWN to the grid first makes every cell identical and
               exactly representable, so nothing accumulates. */
            const dpr = window.devicePixelRatio || 1;
            const cw = Math.floor(w / n * dpr) / dpr;
            dstrip.style.setProperty('--dw', cw + 'px');
            /* and give the strip a width that is a whole number of cells, so
               the viewport itself cannot expose a sliver. The leftover is
               under 4px and is centred away by margin-inline:auto. */
            dstrip.style.width = (n * cw) + 'px';
          };
          /* the position is remembered as a DAY, never as a pixel offset —
             a rotation changes what a pixel is worth, and the reader's place
             in the history is the thing they actually care about keeping */
          const cellW = () => {
            const c = dstrip.querySelector('.dday');
            return c ? c.getBoundingClientRect().width : 0;
          };
          const place = () => {
            const cw = cellW();
            if (!cw) return;
            dstrip.scrollLeft = stripAnchor == null ? dstrip.scrollWidth : stripAnchor * cw;
          };
          fit();
          place();
          dstrip.addEventListener('scroll', () => {
            const cw = cellW();
            if (cw) stripAnchor = Math.round(dstrip.scrollLeft / cw);
          });
          /* Re-solve on rotation. The observer watches the REFERENCE line,
             not the strip: an observer that scrolls or resizes the very
             element it observes re-fires itself, and Chrome answers an RO
             loop by dropping the callback for good — after which a rotation
             leaves stale cell widths and the partial days come back. */
          const ref = el.querySelector('.dsel');
          if (ref) {
            /* draw() replaced the node the previous observer was watching */
            if (dstripRO) dstripRO.disconnect();
            dstripRO = new ResizeObserver(() => { fit(); place(); });
            dstripRO.observe(ref);
          }
        } else if (dstripRO) {
          /* the hub and journey screens carry no strip — stand the old
             observer down rather than leave it holding a detached .dsel */
          dstripRO.disconnect();
          dstripRO = null;
        }

        /* the filter row overflows on a narrow phone — fade the edge and give
           the chevron something to do, exactly as My Plan's tab row does */
        const wrap = el.querySelector('.hswrap');
        const strip = el.querySelector('.tfil');
        if (wrap && strip) {
          const mark = () => {
            wrap.classList.toggle('at-end', strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 2);
            wrap.classList.toggle('off-start', strip.scrollLeft > 2);
          };
          /* bring the chosen pill fully into view — on a narrow phone
             "Screen time" sits under the fade and the chevron, and a filter
             you cannot read is worse than one you cannot reach */
          const chosen = strip.querySelector('button.on');
          if (chosen) {
            const over = chosen.offsetLeft + chosen.offsetWidth - (strip.clientWidth - 34);
            if (over > 0) strip.scrollLeft = over + 8;
            else if (chosen.offsetLeft < strip.scrollLeft) strip.scrollLeft = 0;
          }
          mark();
          strip.addEventListener('scroll', mark);
          new ResizeObserver(mark).observe(strip);
          const more = wrap.querySelector('.hs-more');
          if (more) more.addEventListener('click', () => {
            strip.scrollBy({ left: strip.clientWidth * 0.8, behavior: 'smooth' });
          });
        }

        /* tabs, filter pills, satellites and the back chip are all LINKS
           since 9 Aug — one delegate; core's render owns the redraw */
        el.querySelectorAll('[data-go]').forEach(b =>
          b.addEventListener('click', () => HV.go(b.dataset.go)));
        /* the panel opens on the day the strip has chosen, not on today */
        const npCal = HV.calendarFor(c);
        el.querySelectorAll('[data-npday]').forEach(b =>
          b.addEventListener('click', () => HV.np.open(c, npCal, +b.dataset.npday)));
        const fab = el.querySelector('#qa-fab');
        if (fab) fab.addEventListener('click', () => HV.quickAdd(c));

        el.querySelectorAll('[data-back]').forEach(b => {
          b.addEventListener('click', () => {
            const next = +b.dataset.back;
            if (next === dayBack) return;
            dayBack = next;
            draw(false);
            const again = el.querySelector('[data-back="' + dayBack + '"]');
            if (again) again.focus();
          });
        });

        el.querySelectorAll('.wdots button:not([disabled])').forEach(b => {
          b.addEventListener('click', () => {
            const g = +b.dataset.glass;
            const cur = HV.trackers.read('water').value;
            /* tapping the last filled dot undoes it; anything else sets the count */
            const after = HV.trackers.set('water', (g === cur) ? g - 1 : g);
            draw(false);
            if (after.value === after.target) {
              HV.celebrate('drop', 'Water goal met', 'All ' + after.target + ' glasses today — your evening self says thanks.');
            } else if (after.value > cur) {
              HV.toast('Glass ' + after.value + ' of ' + after.target);
            }
          });
        });

        /* the readings count up once, on arrival — not on every tap */
        if (countUp) {
          el.querySelectorAll('[data-countup]').forEach(x => HV.countUp(x, Number(x.dataset.countup)));
        }
      }

      const doCountUp = freshEntry;
      freshEntry = false;
      draw(doCountUp);
    },
  });
})();
