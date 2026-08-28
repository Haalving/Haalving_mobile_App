/* HAALVING client view — Onboarding (standalone: no shell, no session).
   A chaptered first-run flow: welcome → you (name · mobile + OTP — sex and
   birth date left for the assessment conversation, TJ 8 Aug)
   → the HAALVING story deck (Blue Zones → Culture, a stacked deck peeled
   card by card, JioHotstar-style) →
   health conditions → goals → fitness level → measures (height, weight,
   then an optional body-composition reading) →
   your guide (Svayam / Poorna) → begin. Internal step state machine —
   the hash never changes between steps; the draft lives at module level so
   answers survive back-and-forward navigation.
   The measures speak the product's instrument language: a graduated tape
   sliding under a fixed needle, read like a scale rather than typed like
   a form. Finishing lands the new client in My Circle, where the first
   message asks them to start their assessment. */
(function () {
  'use strict';

  var CHAPTERS = [[1], [2], [3, 4, 5], [6, 7, 8], [9]];  /* You · The way · Focus · Measures · Guide */
  var KICKERS = {
    1: 'Chapter one · You',
    2: 'Chapter two · The HAALVING way',
    3: 'Chapter three · Your focus',
    4: 'Chapter three · Your focus',
    5: 'Chapter three · Your focus',
    6: 'Chapter four · Your measures',
    7: 'Chapter four · Your measures',
    8: 'Chapter four · Your measures',
    9: 'Chapter five · Your guide',
    10: 'Your beginning',
  };

  /* goals carry the pillar they mostly serve, so the picks can elect the
     leading pillars without a separate election step */
  var GOALS = [
    { k: 'Lose weight',           icon: 'scale',    p: 'culture' },
    { k: 'Build strength',        icon: 'dumbbell', p: 'fitness' },
    { k: 'More energy daily',     icon: 'flame',    p: 'fitness' },
    { k: 'Sleep better',          icon: 'moon',     p: 'wellness' },
    { k: 'Reduce stress',         icon: 'leaf',     p: 'wellness' },
    { k: 'Eat healthier',         icon: 'bowl',     p: 'culture' },
    { k: 'Improve flexibility',   icon: 'meditate', p: 'yoga' },
    { k: 'Improve stamina',       icon: 'walk',     p: 'fitness' },
    { k: 'Practice mindfulness',  icon: 'sprout',   p: 'wellness' },
    { k: 'Build healthy habits',  icon: 'target',   p: 'culture' },
  ];
  var GOALS_MAX = 5;

  var CONDS = [
    { k: 'Manage diabetes',     icon: 'sugar' },
    { k: 'Blood pressure',      icon: 'heart' },
    { k: 'Thyroid condition',   icon: 'thyroid' },
    { k: 'PCOS / PCOD',         icon: 'flask' },
    { k: 'Back or joint pain',  icon: 'walk' },
    { k: 'High cholesterol',    icon: 'lipid' },
    { k: 'Digestive issues',    icon: 'microbe' },
    { k: 'Asthma / breathing',  icon: 'pulse' },
  ];

  /* the fitness self-read: four honest doors, each showing what the first
     cycles will feel like. Maps to the level-book track underneath. */
  var FITS = [
    { k: 'beginner', name: 'Beginner', tag: 'New to working out',
      line: 'I’m new, or under six months in.',
      structure: 'Foundation, built steadily', freq: '3–4 sessions / cycle',
      note: 'Fundamentals first — form before load, intensity raised gently across your ' + HV.copy.cycleWord() + ' cycles.',
      track: 'sedentary', activity: 'seated' },
    { k: 'intermediate', name: 'Intermediate', tag: '1–3 years of training',
      line: 'I’ve trained consistently for 1–3 years.',
      structure: 'Build · peak · deload', freq: '4–5 sessions / cycle',
      note: 'Progressive overload with compound movement, structured cycle by cycle.',
      track: 'moderate', activity: 'light' },
    { k: 'advanced', name: 'Advanced', tag: '3–5 years of training',
      line: 'I’ve trained consistently for 3–5 years.',
      structure: 'Build · peak · deload', freq: '5–6 sessions / cycle',
      note: 'Higher intensity with accessory work and strength benchmarks.',
      track: 'active', activity: 'active' },
    { k: 'elite', name: 'Expert / Elite', tag: '5+ years of training',
      line: 'I’ve trained for 5+ years and know my body well.',
      structure: 'Specialisation · peaking', freq: '6 sessions / cycle',
      note: 'Auto-regulated programming with performance metrics your coach reads with you.',
      track: 'active', activity: 'active' },
  ];

  /* the doors in (TJ, 30 Jul: Svayam and Poorna only — no middle tier; the NAME
     carries the card, no descriptor beside it). `k` IS the plan key now, so the
     door and the record it writes can never disagree.

     First launch is Poorna only (TJ, 16 Aug): Svayam still renders, marked as
     the next door, but cannot be chosen — the coach conversations Poorna
     produces are the training material the Svayam AI is built on. HV.PLANS
     carries the launch flag, so opening the second door is a data change here
     and nowhere else. */
  var GUIDES = [
    { k: 'svayam', name: 'Svayam',
      title: 'Your AI coach, end to end',
      desc: 'A personal experience guided by the HAALVING AI coach — daily plans, meal readings and check-ins. Add a human coach to any pillar whenever you want more.',
      price: '5,000', per: '/month', trial: '7-day free trial' },
    { k: 'poorna', name: 'Poorna',
      title: 'A dedicated team of experts',
      desc: 'A coach on each of the four pillars, coordinated by your <span class="inv">HAALVING Coach</span> — with a doctor above them all.',
      price: null, per: '', trial: 'By invitation · contact us to know the details' },
  ];
  function guideOpen(g) { return !!(HV.PLANS[g.k] && HV.PLANS[g.k].launch); }

  /* the story deck — Blue Zones into HAALVING Culture, told portrait-first.
     Slides 1–7 wear generated photography; the last slide is the Index
     itself, because the product's own instrument is the point. */
  var CARDS = [
    { img: 'bz-live', k: 'The Blue Zones', h: 'Where living past 100 is ordinary',
      s: 'Okinawa · Sardinia · Nicoya · Ikaria · Loma Linda — five corners of the world where long life is simply how people live.' },
    { img: 'bz-table', k: 'What they share', h: 'No gyms. No diets. A rhythm.',
      s: 'Plant-rich plates, natural movement, a reason to wake, and people to share it all with.' },
    { img: 'culture', k: 'HAALVING Culture', h: 'That way of living, brought home',
      s: 'HAALVING Culture rebuilds the Blue Zone rhythm around your own days — four practices, one balance.' },
    { img: 'nutrition', cls: 'p-culture', k: 'HAALVING Nutrition', h: 'The daily plate',
      s: 'Real food, planned to your goal — photographed, read and refined every single day.' },
    { img: 'fitness', cls: 'p-fitness', k: 'HAALVING Fitness', h: 'Move without injury',
      s: 'Strength built session by session, at your level, never past it.' },
    { img: 'yoga', cls: 'p-yoga', k: 'HAALVING Yoga', h: 'Strength in stillness',
      s: 'Mobility, flexibility and breath — practised live, coached like a craft.' },
    { img: 'mindspace', cls: 'p-wellness', k: 'HAALVING Mind Wellness', h: 'Mind & rest',
      s: 'Sleep, downshift and stillness — the pillar the other three stand on.' },
    { fin: true, k: 'One balance', h: 'Culture is balance.',
      s: 'Nutrition + Fitness + Yoga + Mind Wellness. Four pillars, each climbing at its own pace — balance is the shape they make together.' },
  ];

  function defaults() {
    return {
      name: '', phone: '', otpSent: false, otpOk: false,
      /* sex and birth date are no longer asked here — the assessment collects
         them in conversation. The demo default keeps age-derived readings sane. */
      dob: '1978-06-15',
      carSeen: 0,
      goals: [], addingGoal: false,
      conds: [],
      fitlevel: null,
      heightCm: 170, heightUnit: 'cm',
      weightKg: 70, weightUnit: 'kg', weightLb: null,
      /* the optional body-composition reading — null means "not given", which
         is a first-class answer, never a zero */
      fatPct: null, musclePct: null, proteinPct: null,
      guide: null,
    };
  }

  var draft = defaults();
  var step = 0;
  var rootEl = null;

  /* ---------------- small helpers ---------------- */
  function q(sel) { return rootEl.querySelector(sel); }
  function qa(sel) { return rootEl.querySelectorAll(sel); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function bmiOf() { var m = draft.heightCm / 100; return draft.weightKg / (m * m); }
  function bmiBand(b) { return b < 18.5 ? 'light' : b < 25 ? 'steady' : b < 30 ? 'elevated' : 'high'; }
  /* the pill is an instrument reading, so it carries the reading's tone */
  function bmiTone(b) { return b < 18.5 ? 'warn' : b < 25 ? 'ok' : b < 30 ? 'warn' : 'bad'; }
  function bmiPill() {
    var b = bmiOf();
    /* built by hand, not HV.ui.pill — the reading inside must wear the data face */
    return '<span class="pill ' + bmiTone(b) + '">BMI&nbsp;<span class="num">' + b.toFixed(1) +
      '</span>&nbsp;· ' + bmiBand(b) + '</span>';
  }

  function heightReadout() {
    if (draft.heightUnit === 'cm') return draft.heightCm + '<small>cm</small>';
    var totalIn = Math.round(draft.heightCm / 2.54);
    return Math.floor(totalIn / 12) + '&#8242;' + (totalIn % 12) + '&#8243;';
  }
  function heightText() {
    if (draft.heightUnit === 'cm') return draft.heightCm + ' cm';
    var totalIn = Math.round(draft.heightCm / 2.54);
    return Math.floor(totalIn / 12) + '′' + (totalIn % 12) + '″';
  }
  /* the pounds the user actually landed on. Re-deriving lb from the 0.5 kg
     canonical value drifts ±1 lb for one value in ten, so the tape's own
     reading is remembered while lb mode is live. */
  function lbShown() {
    return draft.weightLb != null ? draft.weightLb : Math.round(draft.weightKg * 2.20462);
  }
  function weightReadout() {
    return draft.weightUnit === 'kg'
      ? draft.weightKg.toFixed(1) + '<small>kg</small>'
      : lbShown() + '<small>lb</small>';
  }
  function weightText() {
    return draft.weightUnit === 'kg'
      ? draft.weightKg.toFixed(1) + ' kg'
      : lbShown() + ' lb';
  }

  function phoneOk() { return draft.phone.replace(/\D/g, '').length === 10; }
  function phoneText() {
    var d = draft.phone.replace(/\D/g, '');
    return '+91 ' + (d.length === 10 ? d.slice(0, 5) + ' ' + d.slice(5) : d);
  }

  function unitToggleHtml(units, cur) {
    return '<div class="row" style="justify-content:center"><div class="unit-toggle">' +
      units.map(function (u) {
        return '<button data-unit="' + u + '" class="' + (u === cur ? 'on' : '') +
          '" aria-pressed="' + (u === cur) + '">' + u + '</button>';
      }).join('') + '</div></div>';
  }

  /* ---------------- the tape engine ----------------
     One instrument, two orientations. cfg (all in DISPLAY units):
       min, max, step, pxStep   the scale and its physical pitch
       maj(v), mid(v)           which graduations speak louder
       label(v)                 the numeral a major tick wears
       vertical                 height reads upward; weight reads across
       aria(v)                  the spoken reading
       onChange(v)              rounded display-unit value, every change */
  function posOf(cfg, v) {
    return (cfg.vertical ? (cfg.max - v) : (v - cfg.min)) / cfg.step * cfg.pxStep;
  }

  function tapeHtml(id, cfg, value) {
    var ticks = '';
    var n = Math.round((cfg.max - cfg.min) / cfg.step);
    for (var i = 0; i <= n; i++) {
      var v = cfg.min + i * cfg.step;
      var cls = cfg.maj(v) ? ' maj' : cfg.mid(v) ? ' mid' : '';
      ticks += '<i class="tick' + cls + '" style="' + (cfg.vertical ? 'top' : 'left') + ':' +
        posOf(cfg, v).toFixed(1) + 'px">' +
        (cfg.maj(v) ? '<span>' + cfg.label(v) + '</span>' : '') + '</i>';
    }
    return '<div class="tape ' + (cfg.vertical ? 'v' : 'h') + '" id="' + id + '" tabindex="0" role="slider"' +
      ' aria-orientation="' + (cfg.vertical ? 'vertical' : 'horizontal') + '"' +
      ' aria-valuemin="' + cfg.min + '" aria-valuemax="' + cfg.max + '"' +
      ' aria-valuenow="' + value + '" aria-valuetext="' + cfg.aria(value) + '"' +
      ' aria-label="' + cfg.ariaLabel + '">' +
        '<div class="strip">' + ticks + '</div>' +
        '<div class="needle" aria-hidden="true"></div>' +
      '</div>';
  }

  function wireTape(el, cfg, value) {
    var strip = el.querySelector('.strip');
    var live = value;                              /* unrounded, follows the finger */
    var shown = value;                             /* rounded, what the needle reads */

    function center() { return (cfg.vertical ? el.clientHeight : el.clientWidth) / 2; }
    function rounded(v) { return clamp(Math.round(v / cfg.step) * cfg.step, cfg.min, cfg.max); }
    function place(v) {
      var t = (center() - posOf(cfg, v)).toFixed(2) + 'px';
      strip.style.transform = cfg.vertical ? 'translateY(' + t + ')' : 'translateX(' + t + ')';
    }
    function apply(v, settle) {
      live = clamp(v, cfg.min, cfg.max);
      var r = rounded(live);
      place(settle ? r : live);
      if (r !== shown) {
        shown = r;
        el.setAttribute('aria-valuenow', r);
        el.setAttribute('aria-valuetext', cfg.aria(r));
        /* the click of a real scale — only under a finger, where the browser
           allows it (and where it means something) */
        if (down && navigator.vibrate) navigator.vibrate(2);
        cfg.onChange(r);
      }
    }

    var down = false, startPos = 0, startVal = 0;
    el.addEventListener('pointerdown', function (e) {
      down = true;
      el.classList.remove('snap');
      startPos = cfg.vertical ? e.clientY : e.clientX;
      startVal = live;
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* capture is best-effort */ }
      e.preventDefault();
      el.focus();
    });
    el.addEventListener('pointermove', function (e) {
      if (!down) return;
      var d = (cfg.vertical ? e.clientY : e.clientX) - startPos;
      /* the strip follows the finger; the value is whatever lands on the needle */
      apply(startVal + (cfg.vertical ? d : -d) / cfg.pxStep * cfg.step, false);
    });
    function release() {
      if (!down) return;
      down = false;
      el.classList.add('snap');                    /* settle onto the graduation */
      apply(shown, true);
      live = shown;
    }
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('keydown', function (e) {
      var dir = (e.key === 'ArrowUp' || e.key === 'ArrowRight') ? 1
              : (e.key === 'ArrowDown' || e.key === 'ArrowLeft') ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      el.classList.add('snap');
      apply(rounded(live) + dir * cfg.step, true);
      live = shown;
    });
    el.addEventListener('wheel', function (e) {
      e.preventDefault();
      el.classList.add('snap');
      apply(rounded(live) + (e.deltaY < 0 ? 1 : -1) * cfg.step, true);
      live = shown;
    }, { passive: false });

    place(value);                                  /* first paint, no transition */
  }

  /* ---------------- header ---------------- */
  function segFill(chapter) {
    var first = chapter[0], last = chapter[chapter.length - 1];
    if (step > last) return 1;
    if (step < first) return 0;
    if (chapter.length === 1) return 0.5;
    var at = chapter.indexOf(step);
    return (at + 1) / (chapter.length + 1);
  }

  function headHtml() {
    if (step === 0) return '';
    return '<div class="ob-head">' +
      '<button class="back" id="ob-back" aria-label="Back">' + HV.ui.icon('chevL') + '</button>' +
      '<div class="seg-progress" aria-hidden="true">' +
        CHAPTERS.map(function (ch) { return '<i style="--f:' + segFill(ch) + '"></i>'; }).join('') +
      '</div>' +
      (step < 10
        ? '<button class="skip" id="ob-skip">Skip</button>'
        : '<span class="skip" aria-hidden="true"></span>') +
      '</div>';
  }

  function kicker() {
    return KICKERS[step] ? '<div class="kicker">' + KICKERS[step] + '</div>' : '';
  }

  /* ---------------- body per step ---------------- */
  function bodyHtml() {
    if (step === 0) return welcomeHtml();
    if (step === 1) return aboutHtml();
    if (step === 2) return storyHtml();
    if (step === 3) return condsHtml();   /* conditions before goals (TJ, 8 Aug) */
    if (step === 4) return goalsHtml();
    if (step === 5) return fitHtml();
    if (step === 6) return heightHtml();
    if (step === 7) return weightHtml();
    if (step === 8) return compHtml();
    if (step === 9) return guideHtml();
    return beginHtml();
  }

  /* the film's morning stays on screen behind every step (the .ob backdrop);
     the first step only sets the wordmark over it and lets it breathe */
  function welcomeHtml() {
    return '<div class="ob-wm">HAALVING</div>' +
      '<div style="flex:1"></div>' +
      '<div class="kicker">Welcome</div>' +
      '<h1 class="q">A way of living, measured beautifully.</h1>' +
      '<div class="qs">HAALVING studies how you already live, then builds your practice around it — four pillars, one calendar, a circle of care.</div>';
  }

  /* ---- step 1 · you: name, mobile + OTP (one screen, not two). Sex and
     birth date were removed (TJ, 8 Aug) — the assessment asks them in
     conversation. With two fields gone the page is rebalanced: the fields
     breathe wider apart, and a quiet line at the foot says where the rest
     of the story is collected, so the space reads intentional, not empty. */
  function otpHtml() {
    if (!draft.otpSent) return '';
    if (draft.otpOk) {
      return '<div class="otp-done">' + HV.ui.icon('check') +
        '<span>Verified · <span class="num">' + HV.esc(phoneText()) + '</span></span></div>';
    }
    var boxes = '';
    for (var i = 0; i < 4; i++) {
      boxes += '<input class="otp num" data-i="' + i + '" inputmode="numeric" maxlength="1"' +
        ' autocomplete="one-time-code" aria-label="OTP digit ' + (i + 1) + '">';
    }
    return '<div class="field-label" id="otp-label">Enter the 4-digit code</div>' +
      '<div class="otp-row" role="group" aria-labelledby="otp-label">' + boxes + '</div>' +
      '<div class="otp-meta"><span>Demo build — any four digits verify.</span>' +
      '<button id="ob-resend">Resend code</button></div>';
  }

  function aboutHtml() {
    return kicker() +
      '<h1 class="q">Let’s begin with you.</h1>' +
      '<div class="qs">Only your care team ever sees what you share here.</div>' +
      '<div class="field-label">Name</div>' +
      '<input class="input" id="ob-name" aria-label="Name" placeholder="Your first name" autocomplete="given-name" value="' + HV.esc(draft.name) + '">' +
      '<div class="field-label">Mobile number</div>' +
      '<div class="phone-row">' +
        '<span class="ccode num" aria-hidden="true">+91</span>' +
        '<input class="input num" id="ob-phone" type="tel" inputmode="numeric" autocomplete="tel-national"' +
        ' placeholder="98765 43210" aria-label="Mobile number" value="' + HV.esc(draft.phone) + '"' +
        (draft.otpOk ? ' disabled' : '') + '>' +
        (draft.otpOk
          ? ''
          : '<button class="sendcode" id="ob-send"' + (phoneOk() ? '' : ' disabled') + '>' +
            (draft.otpSent ? 'Sent' : 'Send code') + '</button>') +
      '</div>' +
      otpHtml() +
      '<div style="flex:1"></div>' +
      '<div class="audit" style="text-align:center">Two answers are enough to begin — everything else is asked in your assessment, as a conversation.</div>';
  }

  /* ---- step 2 · the story deck: a stacked deck, peeled card by card ---- */
  function storyHtml() {
    var slides = CARDS.map(function (c, i) {
      if (c.fin) {
        var idx = (HV.store.demoPreview && HV.store.demoPreview.index) ||
          { fitness: 80, culture: 88, yoga: 67, wellness: 100 };
        return '<div class="obslide fin" role="group" aria-label="Slide ' + (i + 1) + ' of ' + CARDS.length + '">' +
          HV.ui.index(idx, { size: 'sm' }) +
          '<div class="txt"><span class="k2">' + c.k + '</span>' +
          '<div class="h">' + c.h + '</div><div class="s">' + c.s + '</div></div></div>';
      }
      return '<div class="obslide' + (c.cls ? ' ' + c.cls : '') + '" role="group" aria-label="Slide ' + (i + 1) + ' of ' + CARDS.length + '">' +
        '<img src="img/onboard/' + c.img + '.webp" alt="" loading="lazy" decoding="async">' +
        '<div class="scrim" aria-hidden="true"></div>' +
        '<div class="txt"><span class="k2">' + c.k + '</span>' +
        '<div class="h">' + c.h + '</div><div class="s">' + c.s + '</div></div></div>';
    }).join('');
    /* two lines of text, no more — this step is the visual storyteller, so
       the deck keeps every other pixel (TJ, 30 Jul) */
    return kicker() +
      '<h1 class="q">One way of living.</h1>' +
      '<div class="obdeck" id="ob-deck" tabindex="0" role="group" aria-roledescription="carousel" aria-label="The HAALVING story — ' + CARDS.length + ' cards. Swipe, use arrow keys, or the dots below.">' +
        slides + '</div>' +
      /* swipes are silent to a screen reader — go() speaks into this */
      '<div class="obdeck-live" id="ob-live" aria-live="polite"></div>' +
      /* real controls, not decoration: a screen reader's virtual cursor never
         fires scroll events, so the dots must be able to walk the deck too */
      '<div class="obdots" id="ob-dots">' +
        CARDS.map(function (_, i) {
          return '<button data-slide="' + i + '"' + (i === 0 ? ' class="on"' : '') +
            ' aria-label="Go to slide ' + (i + 1) + ' of ' + CARDS.length + '"></button>';
        }).join('') +
      '</div>';
  }

  /* ---- step 4 · goals (pick up to five, or add your own) ---- */
  function goalsHtml() {
    var chips = GOALS.map(function (g) {
      var on = draft.goals.indexOf(g.k) >= 0;
      return '<button class="gchip' + (on ? ' on' : '') + '" data-goal="' + HV.esc(g.k) +
        '" aria-pressed="' + on + '">' + HV.ui.icon(g.icon) + '<span>' + HV.esc(g.k) + '</span></button>';
    }).join('');
    /* custom goals the user typed render as first-class picks */
    chips += draft.goals.filter(function (k) {
      return !GOALS.some(function (g) { return g.k === k; });
    }).map(function (k) {
      return '<button class="gchip on" data-goal="' + HV.esc(k) + '" aria-pressed="true">' +
        HV.ui.icon('target') + '<span>' + HV.esc(k) + '</span></button>';
    }).join('');
    chips += draft.addingGoal
      ? '<div class="gchip hold"><input class="ginput" id="ob-goal-new" placeholder="Your own goal"' +
        ' aria-label="Add your own goal" maxlength="40"></div>'
      : '<button class="gchip add" id="ob-goal-add">' + HV.ui.icon('plus') + '<span>Add your own</span></button>';
    return kicker() +
      '<h1 class="q">What changes do you want?</h1>' +
      '<div class="qs">Choose up to five. Your circle builds the first cycle around them.</div>' +
      '<div class="gcount num" id="ob-gcount">' + draft.goals.length + ' of ' + GOALS_MAX + '</div>' +
      '<div class="goal-grid" id="ob-goals">' + chips + '</div>';
  }

  /* ---- step 3 · health conditions ---- */
  function condsHtml() {
    return kicker() +
      '<h1 class="q">Anything your circle should hold?</h1>' +
      '<div class="qs">Conditions shape the plan — they never exclude you from it.</div>' +
      '<div class="goal-grid" id="ob-conds">' +
        CONDS.map(function (c) {
          var on = draft.conds.indexOf(c.k) >= 0;
          return '<button class="gchip' + (on ? ' on' : '') + '" data-cond="' + HV.esc(c.k) +
            '" aria-pressed="' + on + '">' + HV.ui.icon(c.icon) + '<span>' + HV.esc(c.k) + '</span></button>';
        }).join('') +
      '</div>' +
      '<div class="audit">Your doctor reads these before your first calendar is built.</div>';
  }

  /* ---- step 5 · fitness self-read, with the chosen door opening ---- */
  function fitHtml() {
    var cards = FITS.map(function (f) {
      var on = draft.fitlevel === f.k;
      return '<button class="choice-card fitx' + (on ? ' on' : '') + '" data-fit="' + f.k +
        '" aria-pressed="' + on + '" aria-expanded="' + on + '">' +
        '<span class="grow"><span class="fitx-top"><b>' + f.name + '</b>' +
        '<span class="pill neutral">' + f.tag + '</span></span>' +
        '<small>' + f.line + '</small>' +
        (on
          ? '<span class="fitx-detail"><span class="k">Your first cycles</span>' +
            '<span class="grid2">' +
            '<span class="fitx-cell"><small>Structure</small><b>' + f.structure + '</b></span>' +
            '<span class="fitx-cell"><small>Rhythm</small><b class="num">' + f.freq + '</b></span>' +
            '</span><small class="fitx-note">' + f.note + '</small></span>'
          : '') +
        '</span></button>';
    }).join('');
    return kicker() +
      '<h1 class="q">How fit are you right now?</h1>' +
      '<div class="qs">Be honest — this sets your starting intensity, never your worth.</div>' +
      '<div style="display:flex; flex-direction:column; gap:var(--s2)">' + cards + '</div>';
  }

  function heightCfg() {
    if (draft.heightUnit === 'cm') {
      return {
        min: 120, max: 210, step: 1, pxStep: 7, vertical: true,
        maj: function (v) { return v % 10 === 0; },
        mid: function (v) { return v % 5 === 0; },
        label: function (v) { return v; },
        aria: function (v) { return v + ' centimetres'; },
        ariaLabel: 'Height',
        onChange: function (v) {
          draft.heightCm = v;
          q('#ht-val').innerHTML = heightReadout();
        },
      };
    }
    return {                                       /* the same tape, graduated in inches */
      min: 48, max: 82, step: 1, pxStep: 16, vertical: true,
      maj: function (v) { return v % 12 === 0; },
      mid: function (v) { return v % 6 === 0; },
      label: function (v) { return (v / 12) + '&#8242;'; },
      aria: function (v) { return Math.floor(v / 12) + ' feet ' + (v % 12) + ' inches'; },
      ariaLabel: 'Height',
      onChange: function (v) {
        draft.heightCm = clamp(Math.round(v * 2.54), 120, 210);
        q('#ht-val').innerHTML = heightReadout();
      },
    };
  }
  function heightVal() {
    return draft.heightUnit === 'cm' ? draft.heightCm
      : clamp(Math.round(draft.heightCm / 2.54), 48, 82);
  }

  function heightHtml() {
    return kicker() +
      '<h1 class="q">How tall are you?</h1>' +
      '<div class="qs">Slide the tape — the needle reads it for you.</div>' +
      unitToggleHtml(['cm', 'ft'], draft.heightUnit) +
      '<div class="tape-wrap">' +
        '<div class="tape-read"><span class="val num" id="ht-val">' + heightReadout() + '</span></div>' +
        tapeHtml('ht-tape', heightCfg(), heightVal()) +
      '</div>';
  }

  function weightCfg() {
    if (draft.weightUnit === 'kg') {
      return {
        min: 35, max: 180, step: 0.5, pxStep: 9, vertical: false,
        maj: function (v) { return v % 5 === 0; },
        mid: function (v) { return v % 1 === 0; },
        label: function (v) { return v; },
        aria: function (v) { return v + ' kilograms'; },
        ariaLabel: 'Weight',
        onChange: function (v) {
          draft.weightKg = v;
          draft.weightLb = null;
          q('#wt-val').innerHTML = weightReadout();
          q('#w-derive').innerHTML = bmiPill();
        },
      };
    }
    return {
      min: 77, max: 397, step: 1, pxStep: 9, vertical: false,
      maj: function (v) { return v % 10 === 0; },
      mid: function (v) { return v % 5 === 0; },
      label: function (v) { return v; },
      aria: function (v) { return v + ' pounds'; },
      ariaLabel: 'Weight',
      onChange: function (v) {
        draft.weightLb = v;                        /* what the needle shows is what reads back */
        draft.weightKg = clamp(Math.round(v / 2.20462 * 2) / 2, 35, 180);
        q('#wt-val').innerHTML = weightReadout();
        q('#w-derive').innerHTML = bmiPill();
      },
    };
  }
  function weightVal() {
    return draft.weightUnit === 'kg' ? draft.weightKg : clamp(lbShown(), 77, 397);
  }

  function weightHtml() {
    return kicker() +
      '<h1 class="q">And your weight this morning?</h1>' +
      '<div class="qs">A starting point, not a verdict — we watch the trend, never one day.</div>' +
      unitToggleHtml(['kg', 'lb'], draft.weightUnit) +
      '<div class="tape-wrap">' +
        '<div class="tape-read"><span class="val num" id="wt-val">' + weightReadout() + '</span></div>' +
        tapeHtml('wt-tape', weightCfg(), weightVal()) +
      '</div>' +
      '<div class="derive" id="w-derive">' + bmiPill() + '</div>';
  }

  /* ---- step 8 · body composition — the optional deeper reading ----
     Three numbers a smart scale or an InBody report gives: fat, muscle and
     protein as a share of body weight. Optional by design: every value starts
     unset ('—'), the first tap lands it on a sensible midpoint, and the one
     footer button reads as Skip until something is entered — a provision,
     never a gate. */
  var COMPS = [
    { k: 'fatPct',     label: 'Body fat',min: 5,  max: 55, start: 24, hint: 'Most scales read this as fat %' },
    { k: 'musclePct',  label: 'Muscle',  min: 20, max: 60, start: 33, hint: 'Skeletal muscle share of body weight' },
    { k: 'proteinPct', label: 'Protein', min: 10, max: 25, start: 16, hint: 'Body protein share, from an InBody report' },
  ];

  function compVal(v) {
    return v == null ? '<span class="unset">—</span>'
      : (v % 1 ? v.toFixed(1) : v) + '<small>%</small>';
  }
  function compAny() {
    return COMPS.some(function (r) { return draft[r.k] != null; });
  }

  function compHtml() {
    return kicker() +
      '<h1 class="q">A closer reading, if you have one.</h1>' +
      '<div class="qs">From any smart scale or a recent InBody report. No reading at hand? Skip — your coach adds these later.</div>' +
      '<div class="bcomp">' + COMPS.map(function (r) {
        /* the clear mark is always in the DOM (hidden while unset) so the row
           never changes width — and "not given" stays reachable: one stray
           tap must never write a reading the client cannot take back */
        return '<div class="bcrow" data-comp="' + r.k + '">' +
          '<span class="grow"><b>' + r.label + '</b><small>' + r.hint + '</small></span>' +
          '<button class="bcbtn" data-dec aria-label="Decrease ' + r.label + '">&minus;</button>' +
          '<span class="bcval num" aria-live="polite">' + compVal(draft[r.k]) + '</span>' +
          '<button class="bcbtn" data-inc aria-label="Increase ' + r.label + '">+</button>' +
          '<button class="bcx' + (draft[r.k] == null ? ' off' : '') + '" data-clear aria-label="Clear ' + r.label + ' — back to not given">' + HV.ui.icon('x') + '</button>' +
        '</div>';
      }).join('') + '</div>' +
      '<div class="audit">These sharpen your starting plan — they never gate it.</div>';
  }

  function wireComp() {
    qa('.bcrow').forEach(function (row) {
      var def = COMPS.find(function (r) { return r.k === row.dataset.comp; });
      var clear = row.querySelector('[data-clear]');
      function paint() {
        row.querySelector('.bcval').innerHTML = compVal(draft[def.k]);
        clear.classList.toggle('off', draft[def.k] == null);
        updateFoot();                              /* Skip ↔ Continue follows the values */
      }
      function bump(dir) {
        var v = draft[def.k];
        /* the first touch lands on the midpoint; every touch after steps it */
        draft[def.k] = v == null ? def.start : clamp(Math.round((v + dir * 0.5) * 2) / 2, def.min, def.max);
        paint();
      }
      row.querySelector('[data-dec]').addEventListener('click', function () { bump(-1); });
      row.querySelector('[data-inc]').addEventListener('click', function () { bump(1); });
      clear.addEventListener('click', function () { draft[def.k] = null; paint(); });
    });
  }

  /* ---- step 9 · the guide: Svayam / Poorna — the name IS the card ---- */
  function guideHtml() {
    var open = GUIDES.filter(guideOpen).length;
    var cards = GUIDES.map(function (g) {
      var live = guideOpen(g);
      var on = live && draft.guide === g.k;
      /* a door that is not open yet says so where its price would be — the
         card still shows what is coming, it simply cannot be walked through */
      var price = !live
        ? '<span class="ptag">Opening soon</span>'
        : g.price
          ? '<span class="price"><span class="num">₹' + g.price + '</span><small>' + g.per + '</small></span>' +
            '<span class="pill ok">' + g.trial + '</span>'
          : '<span class="ptag">' + g.trial + '</span>';
      return '<button class="plan-card' + (g.k === 'poorna' ? ' poorna' : '') + (on ? ' on' : '') +
        '" data-guide="' + g.k + '" aria-pressed="' + on + '"' +
        (live ? '' : ' disabled aria-disabled="true" style="opacity:.55"') + '>' +
        (g.k === 'poorna' ? '<span class="pmark" aria-hidden="true">' + HV.ui.icon('sparkle') + '</span>' : '') +
        '<span class="pname">' + g.name + '</span>' +
        (g.k === 'poorna' ? '<span class="prule" aria-hidden="true"></span>' : '') +
        '<b>' + g.title + '</b>' +
        '<span class="desc">' + g.desc + '</span>' +
        '<span class="plan-foot">' + price + '</span></button>';
    }).join('');
    return kicker() +
      '<h1 class="q">How would you like to be guided?</h1>' +
      '<div class="qs">' + (open > 1
        ? 'Two doors into the same way of living.'
        : 'We are opening with Poorna — a coach on every pillar. Svayam, the AI-guided door, follows.') + '</div>' +
      '<div style="display:flex; flex-direction:column; gap:var(--s3)">' + cards + '</div>' +
      '<button class="alt" id="ob-call" style="align-self:center">Poorna begins with a conversation — request a call</button>';
  }

  function srow(label, valueHtml) {
    return '<div class="row" style="justify-content:space-between; margin-top:var(--s3)">' +
      '<span class="sub">' + label + '</span>' +
      '<span style="text-align:right">' + valueHtml + '</span></div>';
  }

  function beginHtml() {
    var g = GUIDES.find(function (x) { return x.k === draft.guide; });
    var f = FITS.find(function (x) { return x.k === draft.fitlevel; });
    var goals = draft.goals.length
      ? HV.esc(draft.goals.slice(0, 2).join(' · ')) +
        (draft.goals.length > 2 ? ' <span class="num">+' + (draft.goals.length - 2) + '</span>' : '')
      : '<span class="sub">To be chosen with your circle</span>';
    return kicker() +
      '<h1 class="q">Five quiet days come first.</h1>' +
      '<div class="qs">We watch how you already live before we change a single thing — your plan is built from your normal, not a template.</div>' +
      '<div class="card">' +
        '<span class="k">What you told us</span>' +
        srow('Name', '<b>' + HV.esc(draft.name || 'Guest') + '</b>') +
        (draft.otpOk ? srow('Mobile', '<span class="num">' + HV.esc(phoneText()) + '</span>') : '') +
        srow('Goals', goals) +
        srow('Health notes', draft.conds.length
          ? '<b class="num">' + draft.conds.length + '</b> flagged'
          : '<span class="sub">Nothing flagged</span>') +
        (f ? srow('Fitness', '<b>' + f.name + '</b>') : '') +
        srow('Height', '<span class="num">' + heightText() + '</span>') +
        srow('Weight', '<span class="row" style="gap:var(--s2); justify-content:flex-end"><span class="num">' + weightText() + '</span>' + bmiPill() + '</span>') +
        srow('Body composition', compAny()
          ? COMPS.filter(function (r) { return draft[r.k] != null; })
              .map(function (r) { return r.label + ' <span class="num">' + (draft[r.k] % 1 ? draft[r.k].toFixed(1) : draft[r.k]) + '%</span>'; })
              .join(' · ')
          : '<span class="sub">Skipped — add any time</span>') +
        srow('Your guide', g ? '<b>' + g.name + '</b>' : '<span class="sub">Svayam to start</span>') +
      '</div>' +
      '<div class="audit">Your first message is waiting in My Circle — your assessment begins there.</div>';
  }

  /* ---------------- footer ---------------- */
  function cta(label, disabled) {
    return '<button class="btn block" id="ob-next"' + (disabled ? ' disabled' : '') + '>' + label + '</button>';
  }

  function footHtml() {
    if (step === 0) {
      return cta('Begin') + '<button class="alt" id="ob-alt">I already have an account</button>';
    }
    if (step === 1) return cta(draft.otpSent && !draft.otpOk ? 'Verify to continue' : 'Continue', !draft.name.trim() || !draft.otpOk);
    if (step === 2) {
      /* input-neutral gate copy: arrows and the dots open it too, not just a swipe */
      return draft.carSeen >= CARDS.length - 1
        ? cta('Continue')
        : cta('See all ' + CARDS.length + ' cards to continue', true);
    }
    if (step === 3) return cta(draft.conds.length ? 'Continue' : 'Nothing to flag — continue');
    if (step === 4) return cta(draft.goals.length ? 'Continue' : 'Choose at least one goal', !draft.goals.length);
    if (step === 5) {
      var f = FITS.find(function (x) { return x.k === draft.fitlevel; });
      return cta(f ? 'Continue as ' + f.name : 'Select your level', !f);
    }
    /* the one button IS the skip until a reading is entered */
    if (step === 8) return cta(compAny() ? 'Continue' : 'Skip for now');
    if (step === 9) {
      var g = GUIDES.find(function (x) { return x.k === draft.guide; });
      return cta(g ? 'Continue with ' + g.name : 'Choose how you begin', !g);
    }
    if (step === 10) {
      return cta(draft.guide === 'svayam' ? 'Start your free week' : 'Enter your observation window');
    }
    return cta('Continue');
  }

  /* ---------------- draw + wire ---------------- */
  /* Every draw is a full re-render, which throws focus to <body>. On a step
     change focus lands on the new question (screen readers announce where you
     are); an intra-step redraw hands it back via focusSel to the control the
     user was on. */
  var drawnStep = -1;
  function draw(focusSel) {
    rootEl.innerHTML =
      '<div class="ob">' +
        headHtml() +
        /* the story step is media-first: the words shrink to a caption so the
           deck keeps the height */
        '<div class="ob-body' + (step === 2 ? ' media-first' : '') + '">' + bodyHtml() + '</div>' +
        '<div class="ob-foot" id="ob-cta">' + footHtml() + '</div>' +
      '</div>';
    var target = focusSel ? q(focusSel) : null;
    if (!target && step !== drawnStep) {
      target = q('.q');
      if (target) target.setAttribute('tabindex', '-1');
    }
    drawnStep = step;
    if (target) target.focus({ preventScroll: true });
    wire();                                        /* after focus — the name field's own autofocus wins */
    window.scrollTo(0, 0);
  }

  function wireFoot() {
    var next = q('#ob-next');
    if (next) next.addEventListener('click', function () {
      if (next.disabled) return;
      if (step === 10) { finish(); return; }
      step += 1;
      draw();
    });
    var alt = q('#ob-alt');
    if (alt) alt.addEventListener('click', function () { HV.go('#/login'); });
  }

  function updateFoot() {
    var foot = q('#ob-cta');
    if (foot) { foot.innerHTML = footHtml(); wireFoot(); }
  }

  function wire() {
    var back = q('#ob-back');
    if (back) back.addEventListener('click', function () { step = Math.max(0, step - 1); draw(); });
    var skip = q('#ob-skip');
    if (skip) skip.addEventListener('click', function () {
      if (!draft.name.trim()) draft.name = 'Guest';
      step = 10;
      draw();
    });
    wireFoot();
    if (step === 1) wireAbout();
    else if (step === 2) wireStory();
    else if (step === 3) wireConds();
    else if (step === 4) wireGoals();
    else if (step === 5) wireFit();
    else if (step === 6) wireMeasure('#ht-tape', heightCfg, heightVal, 'heightUnit', syncHeightUnit);
    else if (step === 7) wireMeasure('#wt-tape', weightCfg, weightVal, 'weightUnit', syncWeightUnit);
    else if (step === 8) wireComp();
    else if (step === 9) wireGuide();
  }

  function wireAbout() {
    var nameIn = q('#ob-name');
    nameIn.addEventListener('input', function () {
      draft.name = nameIn.value;                 /* store first, then refresh only the footer so focus survives */
      updateFoot();
    });
    if (!draft.name) nameIn.focus();

    var phoneIn = q('#ob-phone');
    if (phoneIn) phoneIn.addEventListener('input', function () {
      draft.phone = phoneIn.value.replace(/\D/g, '').slice(0, 10);
      if (draft.otpSent) { draft.otpSent = false; draft.otpOk = false; draw('#ob-phone'); return; }
      var send = q('#ob-send');
      if (send) send.disabled = !phoneOk();
      updateFoot();
    });
    var send = q('#ob-send');
    if (send) send.addEventListener('click', function () {
      if (!phoneOk()) return;
      draft.otpSent = true;
      draw('.otp[data-i="0"]');
      HV.toast('Code sent to ' + phoneText() + ' — demo: any four digits');
    });
    var resend = q('#ob-resend');
    if (resend) resend.addEventListener('click', function () {
      HV.toast('Code sent again to ' + phoneText());
    });

    /* four boxes, one code: digits auto-advance, backspace walks back,
       the fourth digit verifies (demo: any code is the right code) */
    var boxes = qa('.otp');
    boxes.forEach(function (b, i) {
      b.addEventListener('input', function () {
        b.value = b.value.replace(/\D/g, '').slice(-1);
        if (b.value && i < boxes.length - 1) boxes[i + 1].focus();
        var code = Array.prototype.map.call(boxes, function (x) { return x.value; }).join('');
        if (code.length === 4) {
          draft.otpOk = true;
          draw('#ob-next');
          HV.toast('Number verified');
        }
      });
      b.addEventListener('keydown', function (e) {
        if (e.key === 'Backspace' && !b.value && i > 0) boxes[i - 1].focus();
      });
    });

  }

  /* The deck is a stack, not a strip: the story's earlier card always sits
     ABOVE the later one, so advancing PEELS the top card off to the left,
     and the next card is simply unmasked — it was already in place beneath,
     and only rises ~4% to full size. Swiping back deals the previous card
     back on top from the left. The geometry (fan steps of +16px, .955 scale
     per depth, an 8px sliver of the dealt-away card at the left edge,
     ≤200ms ease-out with no overshoot) is measured from the JioHotstar
     hero deck. */
  function wireStory() {
    var deck = q('#ob-deck');
    var slides = Array.prototype.slice.call(deck.children);
    var dots = q('#ob-dots') ? q('#ob-dots').children : [];
    var N = slides.length;
    var cur = clamp(draft.carSeen, 0, N - 1);    /* returning mid-deck restores the reader's place */
    var W = 0;                                   /* front-card width, read fresh at every layout */

    var FAN = 16, SCALE = 0.955, SLIVER = 8;

    /* where a card rests for a given depth. Depth is clamped to [-1, 2]:
       the fan shows exactly two edges (deeper cards hide behind the second),
       and every dealt-away card shares the same left-edge sliver. */
    function slotPos(s) {
      if (s <= -1) return { x: -(SLIVER + (W / 2) * (1 + SCALE)), sc: SCALE };
      s = Math.min(s, 2);
      var sc = Math.pow(SCALE, s);
      /* centred scale pulls the right edge in — the translate restores it,
         then adds the fan step, so edges land +16px apart like the original */
      return { x: (W / 2) * (1 - sc) + FAN * s, sc: sc };
    }
    function put(el, p) { el.style.transform = 'translateX(' + p.x + 'px) scale(' + p.sc + ')'; }
    function lerp(a, b, t) { return { x: a.x + (b.x - a.x) * t, sc: a.sc + (b.sc - a.sc) * t }; }

    /* a card reached by ANY route advances the gate — pointer events alone
       never fire for a screen reader walking the dots */
    function reach(i) {
      if (i > draft.carSeen) {
        var wasDone = draft.carSeen >= CARDS.length - 1;
        draft.carSeen = i;
        if (!wasDone && i >= CARDS.length - 1) updateFoot();
      }
    }

    function layout() {
      W = slides[0].offsetWidth;
      slides.forEach(function (s, i) {
        s.style.zIndex = N - i;                  /* earlier in the story = nearer the eye, always */
        s.classList.remove('peel');
        s.setAttribute('aria-hidden', i === cur ? 'false' : 'true');
        put(s, slotPos(i - cur));
      });
      for (var d = 0; d < dots.length; d++) {
        dots[d].classList.toggle('on', d === cur);
        dots[d].setAttribute('aria-current', d === cur ? 'true' : 'false');
      }
    }

    var snapT = null;
    function finishSnap() {
      clearTimeout(snapT);
      deck.classList.remove('anim');
      slides.forEach(function (s) { s.classList.remove('peel'); s.style.removeProperty('--peelA'); });
    }
    function snap() {
      /* the card that was moving keeps its shadow through the settle */
      var peeled = slides.filter(function (s) { return s.classList.contains('peel'); });
      deck.classList.add('anim');
      layout();
      peeled.forEach(function (s) { s.classList.add('peel'); });
      clearTimeout(snapT);
      snapT = setTimeout(finishSnap, 230);
    }
    var live = q('#ob-live');
    function go(i) {
      cur = clamp(i, 0, N - 1);
      reach(cur);
      snap();
      /* a pointer swipe is silent to a screen reader — say where we landed */
      if (live) live.textContent = 'Card ' + (cur + 1) + ' of ' + N + ' — ' + CARDS[cur].k;
    }

    /* the live drag. dx < 0 peels the front card away 1:1 under the finger
       while the cards beneath ease one slot forward; dx > 0 drags the
       previous card back on top 1:1 while the deck recedes one slot. */
    function render(dx) {
      if ((dx < 0 && cur >= N - 1) || (dx > 0 && cur <= 0)) dx *= 0.25;  /* the ends push back */
      if (dx <= 0) {
        var p = W ? Math.min(1, -dx / W) : 0;
        slides.forEach(function (s, i) {
          var slot = i - cur;
          if (slot < 0) put(s, slotPos(slot));
          else if (slot === 0) {
            s.classList.add('peel');
            s.style.setProperty('--peelA', p.toFixed(3));
            s.style.transform = 'translateX(' + dx + 'px) scale(1)';
          }
          else put(s, lerp(slotPos(slot), slotPos(slot - 1), cur < N - 1 ? p : 0));
        });
      } else if (cur === 0) {
        /* no card to bring back — the deck itself leans with the damped pull */
        slides.forEach(function (s, i) {
          if (i === 0) s.style.transform = 'translateX(' + dx + 'px) scale(1)';
          else put(s, slotPos(i));
        });
      } else {
        var away = slotPos(-1);
        var p2 = Math.min(1, dx / -away.x);
        slides.forEach(function (s, i) {
          var slot = i - cur;
          if (slot === -1) {
            s.classList.add('peel');
            s.style.setProperty('--peelA', p2.toFixed(3));
            /* full size the whole way back — it returns as the top card */
            put(s, { x: Math.min(0, away.x + dx), sc: SCALE + (1 - SCALE) * p2 });
          }
          else if (slot < -1) put(s, slotPos(slot));
          else put(s, lerp(slotPos(slot), slotPos(slot + 1), p2));
        });
      }
    }

    var down = null;
    deck.addEventListener('pointerdown', function (e) {
      if (down) return;                              /* one finger owns the deck */
      if (deck.classList.contains('anim')) finishSnap();  /* land the settle, keep the gesture */
      W = slides[0].offsetWidth;
      down = { x: e.clientX, y: e.clientY, id: e.pointerId, lock: false,
               lx: e.clientX, lt: performance.now(), vx: 0 };
    });
    deck.addEventListener('pointermove', function (e) {
      if (!down || e.pointerId !== down.id) return;
      if (e.pointerType === 'mouse' && !e.buttons) { /* the up happened off-deck */
        var wasLocked = down.lock;
        down = null;
        if (wasLocked) snap();
        return;
      }
      var dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (!down.lock) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        /* direction lock: a mostly-vertical start belongs to the page scroll
           (touch-action: pan-y already lets the browser take it) */
        if (Math.abs(dy) > Math.abs(dx)) { down = null; return; }
        down.lock = true;
        try { deck.setPointerCapture(down.id); } catch (err) { /* best-effort */ }
      }
      var now = performance.now();
      if (now > down.lt + 12) {                  /* velocity over the last stretch, not per-event noise */
        down.vx = (e.clientX - down.lx) / (now - down.lt);
        down.lx = e.clientX; down.lt = now;
      }
      render(dx);
    });
    function release(e) {
      if (!down || e.pointerId !== down.id) return;
      var locked = down.lock, vx = down.vx;
      if (performance.now() - down.lt > 90) vx = 0;  /* a flick that paused is no flick */
      var dx = locked ? e.clientX - down.x : 0;
      down = null;
      if (!locked) return;
      /* commit past 30% of the card, or on a flick in the same direction */
      var commit = Math.abs(dx) > W * 0.3 || (Math.abs(vx) > 0.55 && (vx < 0) === (dx < 0));
      if (commit && dx < 0 && cur < N - 1) go(cur + 1);
      else if (commit && dx > 0 && cur > 0) go(cur - 1);
      else snap();                               /* home again — same ease, no overshoot */
    }
    deck.addEventListener('pointerup', release);
    deck.addEventListener('pointercancel', function (e) {
      if (down && e.pointerId === down.id) { down = null; snap(); }
    });

    /* the deck answers arrow keys and dots too — a deck is not touch-only */
    deck.addEventListener('keydown', function (e) {
      var dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      go(clamp(cur + dir, 0, N - 1));
    });
    Array.prototype.forEach.call(dots, function (d) {
      d.addEventListener('click', function () { go(Number(d.dataset.slide) || 0); });
    });

    if (window.ResizeObserver) new ResizeObserver(function () { layout(); }).observe(deck);
    reach(cur);
    layout();
  }

  function toggleIn(list, key, max, maxMsg) {
    var i = list.indexOf(key);
    if (i >= 0) { list.splice(i, 1); return true; }
    if (max && list.length >= max) { HV.toast(maxMsg); return false; }
    list.push(key);
    return true;
  }

  function wireGoals() {
    qa('[data-goal]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!toggleIn(draft.goals, b.dataset.goal, GOALS_MAX, 'Five goals lead a beginning. Remove one first.')) return;
        var on = draft.goals.indexOf(b.dataset.goal) >= 0;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on);
        var c = q('#ob-gcount');
        if (c) c.textContent = draft.goals.length + ' of ' + GOALS_MAX;
        updateFoot();
      });
    });
    var add = q('#ob-goal-add');
    if (add) add.addEventListener('click', function () {
      draft.addingGoal = true;
      draw('#ob-goal-new');
    });
    var input = q('#ob-goal-new');
    if (input) {
      /* Enter redraws at once; blur DELAYS the redraw — blur fires on the
         pointerdown of whatever the user tapped next, and a full re-render
         between press and release detaches that element so its click never
         lands. The state is committed immediately either way. */
      var committed = false;
      var commit = function (viaBlur) {
        if (committed) return;
        committed = true;
        var v = input.value.trim();
        draft.addingGoal = false;
        if (v && draft.goals.indexOf(v) < 0) {
          if (draft.goals.length >= GOALS_MAX) HV.toast('Five goals lead a beginning. Remove one first.');
          else draft.goals.push(v);
        }
        if (viaBlur) {
          var stepAt = step;
          setTimeout(function () { if (step === stepAt && !draft.addingGoal) draw(); }, 180);
        } else draw('#ob-goal-add');
      };
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') commit(false); });
      input.addEventListener('blur', function () { commit(true); });
    }
  }

  function wireConds() {
    qa('[data-cond]').forEach(function (b) {
      b.addEventListener('click', function () {
        toggleIn(draft.conds, b.dataset.cond);
        var on = draft.conds.indexOf(b.dataset.cond) >= 0;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on);
        updateFoot();                              /* adaptive CTA text */
      });
    });
  }

  function wireFit() {
    qa('[data-fit]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (draft.fitlevel === b.dataset.fit) return;
        draft.fitlevel = b.dataset.fit;
        draw('[data-fit="' + b.dataset.fit + '"]');
      });
    });
  }

  function wireGuide() {
    qa('[data-guide]').forEach(function (b) {
      b.addEventListener('click', function () {
        var g = GUIDES.find(function (x) { return x.k === b.dataset.guide; });
        /* a closed door is inert rather than silent — the card explains itself
           instead of looking broken when it refuses the tap */
        if (!g || !guideOpen(g)) {
          HV.toast(g ? g.name + ' opens after our first launch — Poorna is the door in today.' : '');
          return;
        }
        if (draft.guide === b.dataset.guide) return;
        draft.guide = b.dataset.guide;
        draw('[data-guide="' + b.dataset.guide + '"]');
      });
    });
    var call = q('#ob-call');
    if (call) call.addEventListener('click', function () {
      HV.toast('Our team will call you within a day — no form, just a conversation.');
    });
  }

  /* Entering a unit lands the draft on a value the new tape can actually
     show, so the readout and the graduation under the needle never disagree
     at the extremes (120 cm reads 4′0″, the tape's own floor). */
  function syncHeightUnit(u) {
    if (u === 'ft') {
      var inches = clamp(Math.round(draft.heightCm / 2.54), 48, 82);
      draft.heightCm = clamp(Math.round(inches * 2.54), 120, 210);
    }
  }
  function syncWeightUnit(u) {
    if (u === 'lb') {
      draft.weightLb = clamp(Math.round(draft.weightKg * 2.20462), 77, 397);
      draft.weightKg = clamp(Math.round(draft.weightLb / 2.20462 * 2) / 2, 35, 180);
    } else draft.weightLb = null;
  }

  /* height and weight share one wiring: the tape plus its unit toggle */
  function wireMeasure(sel, cfgOf, valOf, unitKey, syncUnit) {
    wireTape(q(sel), cfgOf(), valOf());
    qa('.unit-toggle button').forEach(function (b) {
      b.addEventListener('click', function () {
        if (draft[unitKey] === b.dataset.unit) return;
        draft[unitKey] = b.dataset.unit;
        syncUnit(b.dataset.unit);
        draw('[data-unit="' + b.dataset.unit + '"]');
      });
    });
  }

  /* ---------------- finish: create a real observation client ---------------- */
  /* the goal picks elect the leading pillars — most-served pillar first */
  function leadPillarsOf() {
    var tally = {};
    draft.goals.forEach(function (k) {
      var g = GOALS.find(function (x) { return x.k === k; });
      if (g) tally[g.p] = (tally[g.p] || 0) + 1;
    });
    return Object.keys(tally).sort(function (a, b) { return tally[b] - tally[a]; }).slice(0, 2);
  }

  function finish() {
    var name = draft.name.trim() || 'Guest';
    var guide = GUIDES.find(function (x) { return x.k === draft.guide; }) || GUIDES[0];
    var fit = FITS.find(function (x) { return x.k === draft.fitlevel; });
    var tpl = HV.store.clients.find(function (c) { return c.observation; });
    var clone = JSON.parse(JSON.stringify(tpl));
    var now = Date.now();
    clone.id = 'c-onb-' + now;
    clone.userId = 'u-onb-' + now;
    clone.name = name;
    /* the answers BECOME the record — the clone borrows the template's shape,
       never its identity. Without this, every new client kept the template's
       sex and age, and the Vital Panel read their markers against the wrong
       reference bands. */
    /* sex and birth date are not asked in onboarding any more — the
       assessment conversation writes them. Until then the record is sex-
       neutral, and age falls back to the demo default so age-derived
       readings (BMR, marker bands) stay sane rather than zero. */
    clone.sex = null;
    clone.dob = draft.dob;
    clone.age = Math.max(0, Math.floor((now - new Date(draft.dob).getTime()) / 31557600000));
    clone.phone = draft.otpOk ? phoneText() : null;
    clone.heightCm = draft.heightCm;
    clone.weightKg = draft.weightKg;
    /* the optional body-composition reading — null when skipped, never zeros */
    clone.bodyComp = compAny()
      ? { fatPct: draft.fatPct, musclePct: draft.musclePct, proteinPct: draft.proteinPct }
      : null;
    clone.goal = draft.goals.length ? draft.goals.join(' · ') : 'To be shaped with your care circle';
    clone.purpose = 'To be shaped at your assessment.';
    clone.leadPillars = leadPillarsOf();
    clone.flags = draft.conds.slice();
    clone.health = draft.conds.slice();
    clone.fitLevel = fit ? fit.name : null;
    clone.track = fit ? fit.track : 'sedentary';
    clone.rhythm = { wake: '06:30', wind: '22:30', activity: fit ? fit.activity : 'light' };
    clone.day = 1;
    clone.observation = true;
    clone.compliance = null;                       /* no data yet is null, never a measured 0% */
    clone.riskWhy = 'observation day 1 of 5 — assessment awaited';
    /* which door was chosen decides who coaches: Poorna keeps the template's
       full pod; Svayam is the AI end-to-end, with human coaches addable per
       pillar later through the marketplace */
    clone.plan = guide.k;
    clone.tier = 'HAALVING ' + guide.name;
    if (guide.k === 'svayam') { clone.pod = {}; clone.humanPillars = []; }
    /* the tracker contract: 20-day history per key, and the key set the
       trackers screen actually reads — steps, active, actCal, water,
       sleepPct, screen. Every reading the four inside pages draw has to be
       zeroed here, not just the headline ones: a day-one client who
       inherited the donor's sleep stages or water log would be reading
       somebody else's night. */
    var zeros = function () { var a = []; for (var i = 0; i < 20; i++) a.push(0); return a; };
    clone.trackers.waterDone = 0;
    clone.trackers.steps = 0;
    clone.trackers.sleep = '—';
    clone.trackers.sleepPct = 0;
    clone.trackers.mealsLogged = 0;
    clone.trackers.screenMins = 0;
    clone.trackers.activeMins = 0;
    clone.trackers.actCal = 0;
    /* the one tracker reading that is a fact about THIS body rather than a
       target or a log, so it is derived from the answers just stored above and
       never inherited — a new client showing the template's resting burn would
       be reading somebody else's metabolism. Mifflin-St Jeor, with the
       sex-neutral midpoint when sex was not stated. */
    clone.trackers.bmr = Math.round(10 * clone.weightKg + 6.25 * clone.heightCm - 5 * clone.age +
      (clone.sex === 'F' ? -161 : clone.sex === 'M' ? 5 : -78));
    clone.trackers.bed = null;
    clone.trackers.wake = null;
    clone.trackers.stages = { deep: 0, rem: 0, light: 0, awake: 0 };
    clone.trackers.waterLog = [];
    clone.trackers.screenApps = [];
    clone.trackers.week = { steps: zeros(), water: zeros(), sleepPct: zeros(), screen: zeros(),
      active: zeros(), actCal: zeros() };
    if (clone.culturePhotos) clone.culturePhotos.uploaded = 0;

    var subtitle = guide.k === 'svayam' ? 'Svayam · AI coach · observation'
      : 'Poorna · full care team · observation';
    HV.store.users.push({ id: clone.userId, name: name, role: 'client', subtitle: subtitle });
    HV.store.clients.push(clone);
    /* no calendar is written here any more: a client's days are DERIVED from
       whatever their coaches assign (HV.calendarFor). An empty array used to
       mean "no plan yet"; now the empty skeleton says it properly. */
    HV.save();

    /* the first session of My Circle: a welcome, and the assessment door.
       pushMsg stamps seq, so unread and read markers work from message one.
       On Poorna the voice is the care team's (a Poorna client never hears the
       AI directly); a Svayam client is greeted by their AI coach. */
    var fromWho = guide.k === 'poorna' ? 'u-anita' : 'ai';
    var hello = guide.k === 'poorna'
      ? 'Welcome, ' + name + ' — I’m Anita from your care team. Five experts are being assembled around you; every one of them reads this thread.'
      : 'Welcome, ' + name + '. I’m your HAALVING coach — I read your goals and your days, and I build your plan around them.';
    HV.pushMsg(clone.id, { fromId: 'u-anita', kind: 'card', text: 'Pinned: Welcome to HAALVING · How we’ll work together' });
    HV.pushMsg(clone.id, { fromId: fromWho, kind: 'text', text: hello });
    /* the door matches the plan: Poorna's assessment is a guided call with
       the care team; Svayam's runs as a conversation right here in chat */
    HV.pushMsg(clone.id, { fromId: fromWho, kind: 'assess', text: guide.k === 'poorna'
      ? 'Your journey begins with your assessment — 30 minutes on a call with your care team: your story, your vitals, your goals. Everything we build starts from it.'
      : 'Your journey begins with a short assessment, right here in this chat — a few honest questions, a one-minute film, and one gentle stretch. Everything we build starts from it.' });

    draft = defaults();                          /* a later new-client run starts clean */
    step = 0;

    /* land inside the app on My Circle, where the assessment message waits */
    HV.celebrate('sprout', 'Welcome to HAALVING', 'Your circle is ready — begin with your assessment.');
    HV.store.session = clone.userId;
    HV.save();
    HV.go('#/coach');
  }

  /* ---------------- register ---------------- */
  HV.registerView('onboard', {
    standalone: true,
    render: function (root) {
      rootEl = root;
      step = 0;
      drawnStep = -1;                              /* a fresh entry announces its first screen */
      draft = defaults();
      draw();
    },
  });
})();
