/* HAALVING client views — My Plan hub (PL-01, PL-10..12) + pillar plan detail (PL-06..09). */
(function () {
  'use strict';

  function statusPill(status) {
    if (status === 'done') return HV.ui.pill('done', 'ok');
    if (status === 'today') return HV.ui.pill('today', 'info');
    if (status === 'missed') return HV.ui.pill('missed', 'warn');
    if (status === 'cancelled') return HV.ui.pill('cancelled', 'bad');
    return HV.ui.pill('planned', 'neutral');
  }

  /* the ring grammar behind every pmark: done rings ok (green), missed rings
     miss (red), anything else (today, planned, or no status at all) rings up
     (grey) — the same three states the calendar's legend already teaches. */
  function ringCls(status) {
    return status === 'done' ? 'ok' : status === 'missed' ? 'miss' : 'up';
  }

  /* the plate-in-ring glyph — a pillar's own plate (HV.ui.plate) set inside
     a status ring, for the rows that have room to show one: book rows and
     plan-full day rows, where the pillar is already named beside it.
     Passing no status (or any value besides 'done'/'missed') renders the
     neutral "up" ring — the right read for a prescription that hasn't
     happened yet. 'sm' (36px) matches how this file already sizes a plate
     as a .trow's leading mark (see levelupTargets()). */
  function pmark(key, status) {
    return '<span class="pmark ' + ringCls(status) + '" aria-hidden="true">' + HV.ui.plate(key, 'sm') + '</span>';
  }

  /* the same ring grammar worn by the pillar's NAME instead of its plate.
     A quarter-width day cell gives a plate 22px — too small to read as
     anything but a smudge, and a calendar's job is to say what the day
     holds. So the cell names it: Fitness, Yoga, Mind Wellness, Nutrition,
     each inside the ring that says done / missed / still to come. */
  function dmark(key, status) {
    return '<span class="dmark ' + ringCls(status) + '">' + HV.esc(HV.PILLARS[key].name) + '</span>';
  }

  /* the day is complete when every one of today's calendar items is done —
     Nutrition's plate isn't a calendar item, so meal photos don't gate this.
     Called right after a session flips to done, so it's the freshest read. */
  function dayDone(client) {
    var cal = HV.calendarFor(client);
    var entry = cal.filter(function (d) { return d.today; })[0];
    return !!entry && !!entry.items && entry.items.length > 0 &&
      entry.items.every(function (it) { return it.status === 'done'; });
  }

  /* ── per-session actions: the shared vocabulary ─────────────────────────
     Calendar items speak pillar keys (fitness/yoga/wellness/culture) while
     c.sessions and the pod speak staff-role keys (fitness/yoga/mind/
     dietitian) — skOf is the one bridge, used by the cancel counters, the
     coach notices and the feedback matcher below. */
  function skOf(pillar) {
    return pillar === 'wellness' ? 'mind' : pillar === 'culture' ? 'dietitian' : pillar;
  }

  /* the calendar day that holds this item.
     Identity worked while items were the live store objects. A derived
     calendar builds FRESH objects on every call, so indexOf can return -1
     against a rebuild — and every caller here is null-tolerant, so it would
     have failed silently rather than thrown. The item carries its own day
     number now; identity is only the fast path. */
  function dayOf(client, it) {
    if (!it) return null;
    var cal = HV.calendarFor(client);
    for (var i = 0; i < cal.length; i++) {
      if ((cal[i].items || []).indexOf(it) >= 0) return cal[i];
    }
    if (it.day == null) return null;
    return cal.filter(function (d) { return d.day === it.day; })[0] || null;
  }

  /* the client's own stars for a done session, if given (c.sessionFeedback).
     Matches on cycle + day + key in either vocabulary; a day holding a
     single session also owns a same-day entry whose key drifted (the seeded
     record's key predates the calendar it describes). Live cycle only —
     past cycles reuse day numbers, so the record would lie there. */
  function feedbackFor(client, d, it) {
    if (!d || !it || it.status !== 'done') return null;
    var sk = skOf(it.pillar);
    var sameDay = (client.sessionFeedback || []).filter(function (f) {
      return f.cy === client.cycle && f.day === d.day;
    });
    var hit = sameDay.filter(function (f) { return f.key === it.pillar || f.key === sk; })[0];
    if (!hit && (d.items || []).length === 1) hit = sameDay[0] || null;
    return hit || null;
  }

  /* the one style block behind the session-feedback marks — injected at the
     top of each of this file's views (sheets render over a mounted view, so
     the rules reach them too). Tokens only; dark mode comes with them. */
  var SFB_CSS = '<style>' +
    '.sfb-line{display:block; margin-top:var(--s1)}' +
    '.stars.sfb-s svg{width:12px; height:12px}' +
    '.sfb-tap{display:inline-flex; align-items:center; gap:var(--s2); margin-top:var(--s1); color:var(--ink-2)}' +
    '.sfb-tap small{font-size:var(--t-micro)}' +
    '</style>';

  /* the level book for a pillar at a client's track and level */
  function bookOf(client, key) {
    var prog = HV.store.program;
    if (!prog) return null;
    var lvl = (client.levels && client.levels[key]) || 1;
    if (key === 'wellness') return prog.wellness ? prog.wellness[lvl] : null;
    var b = prog[key];
    if (!b) return null;
    var t = b[client.track || 'sedentary'] || b.sedentary;
    return t ? (t[lvl] || null) : null;
  }

  /* ── the pillar blocks, drawn in Today's vocabulary ─────────────────────
     One visual language for "what this asks" wherever it appears: the Today
     drawers, the calendar's task sheets, and the full pillar plans all use
     the same tg-* markup, so a client never re-learns the screen. */
  var tgSub = function (inner) { return '<div class="tg-sub">' + inner + '</div>'; };
  var tgFold = function (label, inner) {
    return '<details class="tg-fold"><summary>' + HV.esc(label) + '</summary>' + inner + '</details>';
  };
  var tgHead = function (t) { return '<div class="tg-h">' + HV.esc(t) + '</div>'; };
  /* the banded section header — Today's band(): icon + one label span */
  var tgBand = function (icon, label) {
    return '<div class="tg-part">' + HV.ui.icon(icon) + '<span>' + label + '</span></div>';
  };
  var tgNote = function (t) { return '<div class="tg-note">' + HV.esc(t) + '</div>'; };
  var tgMeta = function (t) { return '<div class="tg-meta">' + HV.esc(t) + '</div>'; };
  var tgItem = function (b, small, pill) {
    return '<div class="tg-item"><span class="grow"><b>' + b + '</b>' +
      (small ? '<small>' + small + '</small>' : '') + '</span>' + (pill || '') + '</div>';
  };

  function fitnessBlock(client, bk, day) {
    if (!bk) return '';
    var T = HV.tasks(client, day).fitness;
    return tgSub(
      tgBand('flame', 'Home block · <span class="num">' + HV.esc(String(bk.home.mins)) + ' min</span> · ' + HV.esc(bk.rpe)) +
      T.map(function (t, i) { return HV.ui.taskRow(t, '', 'fitness', i); }).join('') +
      tgFold('At the gym instead', tgNote(bk.gym.line)) +
      tgMeta(bk.phase + ' · intensity ' +
        (String(bk.intensity).match(/^[\d–—\-–%\s]+/) || [String(bk.intensity)])[0].trim()));
  }

  function yogaBlock(client, bk, live, day) {
    if (!bk) return '';
    var T = HV.tasks(client, day).yoga;
    return tgSub(
      tgBand('leaf', (live ? 'Live session' : 'Own practice') + ' · <span class="num">' + HV.esc(bk.dur) + '</span>') +
      T.map(function (t, i) { return HV.ui.taskRow(t, '', 'yoga', i); }).join('') +
      tgFold('What this level is for', tgNote(bk.goal) + tgNote(bk.focus)));
  }

  function cultureBlock(client, bk, day) {
    var plan = (HV.store.mealPlans && HV.store.mealPlans[client.id]) || null;
    var shot = HV.store.meals.filter(function (x) { return x.clientId === client.id; })
      .map(function (x) { return x.slot; });
    var T = HV.tasks(client, day).culture;
    var plate = '';
    /* the same targets the Nutrient Panel measures against — and the plate is
       gated on there being TASKS, not on the legacy mealPlans header: a
       template-only client used to get a plate on Today and nothing here,
       which is one plan described two ways (Today made this same fix first) */
    var hT = HV.nutTargetsFor(client, day) || (plan ? { kcal: plan.kcal, protein: plan.protein } : null);
    if (T.length) {
      var partIcon = { Morning: 'sun', Afternoon: 'flame', Evening: 'moon' };
      var part = '';
      var title = (plan && plan.title) ||
        'Diet plan · L' + ((client.levels || {}).culture || 1) + ' · cycle ' + (client.cycle || 1);
      plate = tgHead(title + (hT ? ' · ' + hT.kcal + ' kcal · ' + hT.protein + ' g protein a day' : '')) +
        T.map(function (t, i) {
          var partHead = t.part !== part ? tgBand(partIcon[t.part], t.part) : '';
          part = t.part;
          var pill = t.photo
            ? (shot.indexOf(t.slot) >= 0 ? HV.ui.pill('Logged', 'ok') : HV.ui.pill('Photo', 'neutral'))
            : '';
          return partHead + HV.ui.taskRow(t, pill, 'culture', i);
        }).join('');
    }
    var habits = bk ? tgFold('Level ' + ((client.levels && client.levels.culture) || 1) + ' habits · ' + bk.star,
      bk.habits.map(function (h) { return '<div class="tg-line hab"><span class="tv">' + HV.esc(h) + '</span></div>'; }).join('') +
      (bk.plate ? tgMeta('Your plate: ' + bk.plate) : '') +
      (bk.cheat ? tgMeta(bk.cheat) : '')) : '';
    return (plate ? tgSub(plate + habits) : habits);
  }

  function wellnessBlock(client, bk, day) {
    if (!bk) return '';
    var T = HV.tasks(client, day).wellness;
    if (!T.length) return '';
    return tgSub(
      tgBand('moon', 'Tonight') +
      T.map(function (t, i) { return HV.ui.taskRow(t, '', 'wellness', i); }).join(''));
  }

  /* `day` is THE trap. HV.tasks resolves the assigned template for a given
     day, and every surface calls it TWICE — once here to draw the rows, once
     in HV.ui.wireTasks to attach the taps. The two calls must return the same
     array or data-topen="fitness:2" opens a different exercise than the one
     under the finger. openTaskSheet can be opened for ANY day, so the day is
     passed in rather than defaulted separately at each call. */
  function pillarBlock(client, key, it, day) {
    var bk = bookOf(client, key);
    if (key === 'fitness') return fitnessBlock(client, bk, day);
    if (key === 'yoga') return yogaBlock(client, bk, !!it, day);
    if (key === 'culture') return cultureBlock(client, bk, day);
    return wellnessBlock(client, bk, day);
  }

  /* the pillar's cycle numbers — the progress that sits beside every task */
  function progTiles(client, key) {
    var tile = function (label, value, sub) {
      return '<div class="stat"><span class="k">' + HV.esc(label) + '</span>' +
        '<div class="v num">' + HV.esc(value) + '</div>' +
        '<div class="sub num">' + HV.esc(sub || 'this cycle') + '</div></div>';
    };
    if (key === 'culture') {
      var ph = client.culturePhotos || { uploaded: 0, of: 33 };
      return tile('Photos', ph.uploaded + '/' + ph.of, 'min ' + (ph.min || 25) + ' needed') +
        tile('On plan', client.compliance == null ? '—' : client.compliance + '%', 'meals on plan');
    }
    var sk = key === 'wellness' ? 'mind' : key;
    var ss = (client.sessions || {})[sk] || { done: 0, target: 0 };
    return tile(key === 'wellness' ? 'Mind' : 'Sessions', ss.done + '/' + ss.target) +
      tile('Cancelled', String(ss.cancelled || 0));
  }

  var FULL_LABELS = {
    culture: 'Full Diet Plan', fitness: 'Full Fitness Plan',
    yoga: 'Full Yoga Plan', wellness: 'Full Mind Wellness Plan',
  };

  /* ── "Can't make it" — the client's two honest exits from a session.
     Cancel writes the calendar item + the cycle's cancelled counter and
     tells the seat's coach (cover-aware, via HV.staffFor); a new-time ask
     mirrors PL-12's request pattern: circle message + ops worklist item +
     coach notice. Shapes shared with Today's reminder band. */
  function openCancelSheet(client, it, key) {
    var d = dayOf(client, it);
    var dayN = d ? d.day : client.day;
    var sk = skOf(key);
    var coach = HV.staffFor(client, sk);
    var when = 'Day ' + dayN + (d && d.date ? ' · ' + d.date : '') + ' · ' + it.time;
    HV.sheet(
      '<div class="h1">Can’t make it?</div>' +
      '<div class="trow"><span class="grow"><b>' + HV.esc(it.label) + '</b>' +
      '<small class="num">' + HV.esc(when) + ' · with ' + HV.esc(coach.name) + '</small></span>' + statusPill(it.status) + '</div>' +
      '<div class="notice">Cancelling tells ' + HV.esc(coach.name) + ' straight away and counts on your cycle report. If only the time is the problem, ask for a new one instead.</div>' +
      '<button class="btn block" data-cancel>Cancel this session</button>' +
      '<div class="card-title" style="margin-top:var(--s3)">Or request a new time</div>' +
      '<textarea class="input" data-newtime placeholder="e.g. Could this move to 7:30 pm?"></textarea>' +
      '<button class="btn ghost block" data-send disabled>Request new time</button>' +
      '<button class="btn quiet block" data-keep>Keep the session</button>',
      function (sheet) {
        sheet.querySelector('[data-keep]').addEventListener('click', HV.closeSheet);
        sheet.querySelector('[data-cancel]').addEventListener('click', function () {
          HV.markSession(client, dayN, it.pillar, 'cancelled');
          var s = client.sessions || {};
          if (s[sk]) s[sk].cancelled = (s[sk].cancelled || 0) + 1;
          HV.save();
          HV.notice(coach.id, 'task',
            client.name + ' cancelled ' + it.label + ' (Day ' + dayN + ', ' + it.time + ').', client.id);
          HV.closeSheet();
          HV.refresh();
          HV.toast('Cancelled — ' + coach.name + ' has been told.');
        });
        var ta = sheet.querySelector('[data-newtime]');
        var send = sheet.querySelector('[data-send]');
        ta.addEventListener('input', function () { send.disabled = !ta.value.trim(); });
        send.addEventListener('click', function () {
          var txt = ta.value.trim();
          if (!txt) return;
          HV.pushMsg(client.id, { fromId: 'client', kind: 'text',
            text: 'New time request — ' + it.label + ' (Day ' + dayN + '): ' + txt });
          HV.store.worklist.push({
            id: 'w-rt-' + Date.now(), text: 'Session time request — ' + client.name + ' · ' + it.label,
            owner: (client.pod && client.pod.admin) || 'u-anita',
            due: 'today', pill: 'warn', status: 'open', type: 'task',
          });
          HV.notice(coach.id, 'task', client.name + ' asked for a new time for ' + it.label + '.', client.id);
          HV.save();
          HV.closeSheet();
          HV.toast('Sent — your care team will offer a new slot.');
        });
      }
    );
  }

  /* ── post-session feedback — five stars the moment a session flips done.
     The sheet itself now lives in core as HV.rateSheet: the request deck and
     the session room both open it too, and the deck cannot reach into a view.
     This wrapper keeps My Plan's own coordinates (the day the tapped item
     belongs to) and its celebrate ordering. */
  function openFeedbackSheet(client, it, key, celebrateDue) {
    var d = dayOf(client, it);
    HV.rateSheet(client, {
      label: it.label, staffId: it.staffId, key: key,
      day: d ? d.day : client.day, celebrateDue: celebrateDue,
    });
  }

  /* ── the task sheet — what a calendar entry actually asks, and the progress
     it feeds, together on one sheet. Mark the session done and the numbers
     move: the calendar cell, the cycle counts, the level-up bar. */
  function openTaskSheet(client, it, key) {
    var p = HV.PILLARS[key];
    var lvl = (client.levels && client.levels[key]) || 1;
    var s = client.sessions || {};
    var sk = skOf(key);

    /* a done session wears the client's own stars; a cancelled one says so */
    var itDay = it ? dayOf(client, it) : null;
    /* which day this session sits on — HV.markSession records against the
       day number, not the item, because the item is rebuilt on every paint.
       Resolved BEFORE the block is drawn: it is also the day whose prescribed
       items the block and the tap wiring must both read. */
    var itDayN = (itDay && itDay.day) || client.day;

    /* the session row + the block behind it, in Today's own markup */
    var sessionRow = it
      ? tgItem(HV.esc(it.label), HV.esc(it.time) + ' · with ' + HV.esc(HV.staff(it.staffId).name), statusPill(it.status))
      : '';
    var task = '<div class="tgroups"><div class="tg ' + p.cls + '">' +
      sessionRow + pillarBlock(client, key, it, itDayN) + '</div></div>';
    var fb = it ? feedbackFor(client, itDay, it) : null;
    var fbHtml = fb
      ? '<div class="card"><span class="k">Your rating · Day <span class="num">' + fb.day + '</span></span>' +
        '<div style="margin-top:var(--s2)">' + HV.ui.stars(fb.stars) + '</div>' +
        (fb.note ? '<p class="sub" style="margin:var(--s2) 0 0">“' + HV.esc(fb.note) + '”</p>' : '') + '</div>'
      : '';
    var cancelledHtml = it && it.status === 'cancelled'
      ? '<div class="notice">This session is cancelled — ' + HV.esc(HV.staffFor(client, sk).name) + ' knows. Ask in your Circle if you want it back.</div>'
      : '';

    var markable = it && it.status === 'today';
    var cancellable = it && (it.status === 'today' || it.status === 'planned');
    HV.sheet(
      '<div class="h1-row ' + p.cls + '" style="margin:0"><span class="h1 row" style="gap:var(--s3); margin:0">' + HV.ui.plate(key) + HV.esc(p.name) + '</span>' +
      HV.ui.pill('Level ' + lvl, 'info') + '</div>' +
      task +
      cancelledHtml +
      fbHtml +
      '<div class="card-title" style="margin-top:var(--s3)">Your progress this cycle</div>' +
      '<div class="grid3 tight">' + progTiles(client, key) + '</div>' +
      (markable ? '<button class="btn block" data-done>Mark session done</button>' : '') +
      (cancellable ? '<button class="btn ghost block" data-cantmake>Can’t make it</button>' : '') +
      '<button class="btn ghost block" data-fullplan>' + HV.esc(FULL_LABELS[key]) + '</button>' +
      '<button class="btn quiet block" data-close>Close</button>',
      function (sheet) {
        /* the block's card rows walk on to the per-task sheet */
        /* the SAME day the block above was drawn from — see pillarBlock */
        HV.ui.wireTasks(sheet, HV.tasks(client, itDayN));
        sheet.querySelector('[data-close]').addEventListener('click', HV.closeSheet);
        sheet.querySelector('[data-fullplan]').addEventListener('click', function () {
          HV.closeSheet();
          HV.go('#/plan-full/' + key);
        });
        var cmBtn = sheet.querySelector('[data-cantmake]');
        if (cmBtn) cmBtn.addEventListener('click', function () { openCancelSheet(client, it, key); });
        var doneBtn = sheet.querySelector('[data-done]');
        if (doneBtn) doneBtn.addEventListener('click', function () {
          HV.markSession(client, itDayN, it.pillar || key, 'done');
          if (s[sk]) s[sk].done += 1;
          HV.save();
          HV.refresh();
          HV.toast('Done — ' + (s[sk] ? s[sk].done + ' of ' + s[sk].target + ' sessions' : 'progress') + ' this cycle.');
          /* the day-complete celebrate — earned once per client per cycle-day,
             so a reload or a second done-tap on an already-cleared day is
             quiet. It now fires from the feedback sheet's close, so the stars
             are asked for before the fanfare. */
          var celebrateDue = false;
          if (dayDone(client)) {
            var dayKey = client.cycle + '-' + client.day;
            if ((HV.store.dayCelebrated || {})[client.id] !== dayKey) celebrateDue = true;
          }
          openFeedbackSheet(client, it, key, celebrateDue);
        });
      }
    );
  }

  /* the criteria rows behind a level-up read — met ticks green, unmet says
     keep going, unmeasurable waits for the review. Shared by the level sheet
     and the gallery's flowing all-pillars list. */
  function luRowsHtml(lu) {
    return lu.rows.map(function (r) {
      var pill = r.met === true ? HV.ui.pill('done', 'ok')
        : r.met === false ? HV.ui.pill('keep going', 'warn')
        : HV.ui.pill('at review', 'neutral');
      return '<div class="trow"><span class="grow"><b>' + HV.esc(r.label) + '</b>' +
        '<small class="num">' + HV.esc(r.small) + '</small></span>' + pill + '</div>';
    }).join('');
  }

  /* ── the level-up sheet — a cycle's target for one pillar: the criteria,
     each ticked live from the client's logs where the app can measure it. */
  function openLevelSheet(client, key) {
    var p = HV.PILLARS[key];
    var lu = HV.levelup(client, key);
    if (!lu) return;
    var rows = luRowsHtml(lu);
    HV.sheet(
      '<div class="h1-row ' + p.cls + '" style="margin:0"><span class="h1 row" style="gap:var(--s3); margin:0">' + HV.ui.plate(key) + HV.esc(p.name) + '</span>' +
      HV.ui.pill('Level ' + lu.level, 'info') + '</div>' +
      '<p class="sub" style="margin:0">What levels ' + HV.esc(p.name) + ' up — ticked live from your logs</p>' +
      '<div class="list">' + rows + '</div>' +
      (lu.goals.length
        ? '<div class="card-title">Goals for this level</div><div>' +
          lu.goals.map(function (g) { return '<span class="chip">' + HV.esc(g) + '</span>'; }).join('') + '</div>'
        : '') +
      '<p class="sub" style="margin:0">' + HV.esc(lu.note) + '</p>' +
      '<button class="btn block" data-full>See the full plan</button>' +
      '<button class="btn quiet block" data-close>Close</button>',
      function (sheet) {
        sheet.querySelector('[data-close]').addEventListener('click', HV.closeSheet);
        sheet.querySelector('[data-full]').addEventListener('click', function () {
          HV.closeSheet();
          HV.go('#/plan-detail/' + key + '/levelup');
        });
      }
    );
  }

  /* one compact day cell — the cycle's own clock, not a borrowed month. The
     serif numeral is the cycle day (the unit the whole product speaks in),
     the date rides under it, and each activity is named in words inside a
     status ring: green done, red missed, grey still to come. The whole cell
     is the button — one honest target that opens the day sheet. */
  function bigCell(client, d, idx, live, todayIdx) {
    var cls = ['bc'];
    if (d.today) cls.push('today');
    if (d.rest) cls.push('rest');
    if (d.review) cls.push('review');
    if (d.meeting) cls.push('meeting');
    /* on the live cycle, days already walked settle back — the eye should
       land on today and what's still ahead */
    if (live && todayIdx >= 0 && idx < todayIdx) cls.push('past');

    var marks = '', said = [];
    if (d.rest) {
      /* no mark — the REST word on the cell says it; imagery is for pillars */
      said.push('active rest');
    } else {
      marks = (d.items || []).map(function (it) {
        said.push(HV.PILLARS[it.pillar].name + ' session' + (it.status ? ', ' + it.status : ''));
        return dmark(it.pillar, it.status);
      }).join('');
    }
    /* Nutrition runs every day — rest days included — so every cell carries
       its name. Days walked ring green (the demo story: the plate got
       logged), today rings green the moment a meal lands, the rest stay grey. */
    if (!client.observation) {
      var cst = null;
      if (!live || (todayIdx >= 0 && idx < todayIdx)) cst = 'done';
      else if (live && idx === todayIdx &&
        HV.store.meals.some(function (m) { return m.clientId === client.id; })) cst = 'done';
      marks += dmark('culture', cst);
      said.push(HV.PILLARS.culture.name + (cst === 'done' ? ', done' : ', upcoming'));
    }

    /* the cycle's waypoints are named on the cell itself, not keyed in a legend */
    var flags = [];
    if (d.review) { flags.push('Review'); said.push('level review'); }
    if (d.meeting) { flags.push('Meeting'); said.push('progress meeting'); }
    if (d.rest) flags.push('Rest');

    var label = 'Day ' + d.day + (d.date ? ', ' + d.date : '') + (d.today ? ', today' : '') +
      (said.length ? ' — ' + said.join(', ') : '');

    return '<button class="' + cls.join(' ') + '" data-day="' + idx + '" aria-label="' + HV.esc(label) + '">' +
      '<span class="bd num">' + d.day + '</span>' +
      (d.date ? '<span class="bdt num">' + HV.esc(d.date) + '</span>' : '') +
      '<span class="bics">' + marks + '</span>' +
      (flags.length ? '<span class="bflag">' + flags.join(' · ') + '</span>' : '') +
      '</button>';
  }

  /* the one-line key under the grid — only the ring grammar needs saying.
     The cells name their own pillars, and review, meeting and rest are
     written on their cells in words. Each key wears the ring it explains,
     so the sample and its label are the one thing. */
  function calLegend() {
    var lg = function (cls, label) {
      return '<span class="dmark ' + cls + '">' + label + '</span>';
    };
    return '<div class="clg">' +
      lg('ok', 'Done') +
      lg('miss', 'Missed') +
      lg('up', 'Upcoming') +
      '</div>';
  }

  /* PL-11 — day detail sheet. The day holds its pillars; on the live cycle
     each pillar row opens its task sheet — the task and the progress together.
     Past cycles read as the record, nothing to press. */
  function openDaySheet(client, d, live) {
    var flags =
      (d.review ? HV.ui.pill('Level review day', 'info') + ' ' : '') +
      (d.meeting ? HV.ui.pill(HV.copy.meetingWord() + ' progress meeting', 'info') + ' ' : '') +
      (d.rest ? HV.ui.pill('Active rest', 'neutral') : '');
    var rows = [];
    if (!d.rest) (d.items || []).forEach(function (it) { rows.push({ key: it.pillar, it: it }); });
    /* Nutrition runs every day — rest days included; the plate is the day's
       standing task */
    if (live && !client.observation) rows.push({ key: 'culture', it: null });
    var body = '';
    if (d.rest) {
      body = '<div class="notice">Active rest day — a gentle walk, plenty of water, an early night. Recovery is part of the plan, not a pause from it.</div>';
    }
    if (!rows.length) {
      if (!d.rest) body = '<p class="sub">Nothing scheduled — enjoy the open day.</p>';
    } else {
      body += '<div class="list">' + rows.map(function (r, i) {
        var p = HV.PILLARS[r.key];
        var inner, pill;
        if (r.it) {
          var staff = HV.staff(r.it.staffId);
          var fb = live ? feedbackFor(client, d, r.it) : null;
          inner = '<span class="grow"><b>' + HV.esc(r.it.label) + '</b>' +
            '<small>' + HV.esc(r.it.time) + ' · ' + HV.esc(staff ? staff.name : 'Your team') + ' · ' + HV.esc(p.name) + '</small>' +
            (fb ? '<span class="sfb-line">' + HV.ui.stars(fb.stars, { cls: 'sfb-s' }) + '</span>' : '') +
            '</span>';
          pill = statusPill(r.it.status);
        } else {
          inner = '<span class="grow"><b>The day’s plate</b>' +
            '<small>' + HV.esc(p.name) + ' · every day · photo your meals</small></span>';
          pill = HV.ui.pill('daily', 'neutral');
        }
        return live
          ? '<button class="trow ' + p.cls + '" data-task="' + i + '" style="width:100%"><span class="pdot"></span>' + inner + pill + '</button>'
          : '<div class="trow ' + p.cls + '"><span class="pdot"></span>' + inner + pill + '</div>';
      }).join('') + '</div>' +
      (live ? '<p class="sub" style="margin:0">Tap a row for the task and your progress in it.</p>' : '');
    }
    HV.sheet(
      '<div><div class="h1">Day ' + d.day + (d.date ? ' · ' + HV.esc(d.date) : '') + '</div>' +
      (flags ? '<div style="margin-top:var(--s1)">' + flags + '</div>' : '') + '</div>' +
      body +
      '<button class="btn quiet block" data-close>Close</button>',
      function (sheet) {
        sheet.querySelector('[data-close]').addEventListener('click', HV.closeSheet);
        sheet.querySelectorAll('[data-task]').forEach(function (b) {
          b.addEventListener('click', function () {
            var r = rows[Number(b.dataset.task)];
            openTaskSheet(client, r.it, r.key);
          });
        });
      }
    );
  }

  /* PL-12 — request a change to the proposed calendar. The request lands in
     the circle thread AND on the ops worklist, so Anita actually sees it. */
  function openChangeSheet(client) {
    HV.sheet(
      '<div class="h1">Request a change</div>' +
      '<p class="sub" style="margin:0">Tell us what you’d like adjusted — timings, days, or the session mix. Nothing changes until you confirm a calendar.</p>' +
      '<textarea class="input" data-change placeholder="e.g. Could weekday fitness move from 6:30 pm to 7:00 pm?"></textarea>' +
      '<button class="btn block" data-send disabled>Send request</button>',
      function (sheet) {
        var ta = sheet.querySelector('[data-change]');
        var sendBtn = sheet.querySelector('[data-send]');
        ta.addEventListener('input', function () { sendBtn.disabled = !ta.value.trim(); });
        sendBtn.addEventListener('click', function () {
          var txt = ta.value.trim();
          if (!txt) return;
          HV.pushMsg(client.id, { fromId: 'client', kind: 'text', text: 'Change request: ' + txt });
          HV.store.worklist.push({
            id: 'w-cr-' + Date.now(), text: 'Calendar change request — ' + client.name,
            owner: (client.pod && client.pod.admin) || 'u-anita',
            due: 'today', pill: 'warn', status: 'open',
          });
          HV.save();
          HV.closeSheet();
          HV.toast('Sent to your care team — Anita picks these up.');
        });
      }
    );
  }

  /* ── the goal ledger — the running level list from the paper HAALVING
     calendar: the overall goal divided across seven levels, each with its
     share and its verdict. A missed level is carried, never erased. */
  function ledgerCard(client) {
    var lg = client.goalLedger;
    if (!lg || !lg.length) return '';
    var rows = lg.map(function (r) {
      var mark = r.state === 'ok' ? HV.ui.icon('check')
        : r.state === 'miss' ? HV.ui.icon('x')
        : r.state === 'cur' ? HV.ui.icon('flag') : '';
      /* the delta chip: target vs result, in one glance — the paper ledger's
         verdict column, rebuilt with a coloured pill (state 'ok' green,
         anything else — 'cur' carried forward — amber) instead of the
         Design System's score-hero .chip-delta, which is unreachable here
         (it's scoped under .score-hero, a hero component no live view still
         renders) and out of this task's CSS-edit budget.
         Most goals are written as a sentence ('Walk 5 km comfortably'),
         already printed as the row's own label — repeating it in the pill
         would say the same thing twice in one row. Only compact numeric
         targets ('−1.0 kg') earn a "vs <target>" comparison pill next to
         the result; anything longer reads as prose, not a number to compare
         against, so the pill carries the result itself as the verdict. */
      var targetCompact = !!r.target && (r.target.length <= 9 || /^[−-]?[\d.]+\s*kg$/.test(r.target));
      var pillKind = r.state === 'ok' ? 'ok' : 'warn';
      var res = !r.result ? (r.state === 'cur' ? '<span class="lres">in progress</span>' : '')
        : targetCompact
          ? '<span class="lres" style="display:inline-flex; align-items:center; gap:var(--s2)">' +
            '<span class="num">' + HV.esc(r.result) + '</span>' +
            '<span class="pill ' + pillKind + '"><span class="num">' + HV.esc('vs ' + r.target) + '</span></span></span>'
          : '<span class="lres"><span class="pill ' + pillKind + '"><span class="num">' + HV.esc(r.result) + '</span></span></span>';
      return '<div class="lrow ' + r.state + '"><span class="lmark" aria-hidden="true">' + mark + '</span>' +
        '<span><b class="num">L' + r.level + '</b> · ' + HV.esc(r.target) + '</span>' + res + '</div>';
    }).join('');
    return '<div class="card ledger"><span class="k">Goal ledger</span>' +
      '<p class="sub" style="margin:var(--s1) 0 var(--s2)">' + HV.esc(client.goal) + ' — each level carries its share.</p>' +
      rows + '</div>';
  }

  /* one past cycle, reported the way the team already reports on paper.
     Its day count comes from the cycle's OWN recorded calendar, not from the
     current config — a cycle that ran eleven days still ran eleven days after
     the programme moves to fourteen. */
  function reportHtml(client, entry, prevEntry) {
    var ranDays = (((HV.store.calendarsPast || {})[client.id] || {})[entry.cycle] || []).length ||
      HV.cycleDays();
    var outcome = entry.outcome === 'achieved'
      ? HV.ui.pill('Level achieved', 'ok')
      : HV.ui.pill('Carried forward', 'warn');
    return '<div class="card">' +
      '<div class="row"><span class="card-title grow">Cycle ' + entry.cycle + ' report · Level ' + entry.level + '</span>' + outcome + '</div>' +
      '<div class="tk-read" style="margin-top:var(--s2)"><span class="num">' + HV.esc(entry.result) + '</span>' +
      '<small> against ' + HV.esc(entry.target) + '</small></div>' +
      '<div class="grid3 tight" style="margin-top:var(--s3)">' +
      '<div><div class="num" style="font-size:20px; font-weight:600">' + entry.sessions.done + ' of ' + entry.sessions.target + '</div><div class="sub">sessions</div></div>' +
      '<div><div class="num" style="font-size:20px; font-weight:600">' + entry.compliance + '%</div><div class="sub">meals on plan</div></div>' +
      '<div><div class="num" style="font-size:20px; font-weight:600">' + ranDays + '</div><div class="sub">days</div></div>' +
      '</div></div>' +
      '<div class="card"><span class="k">Cycle ' + entry.cycle + ' index</span>' +
      '<div style="display:flex; justify-content:center; margin-top:var(--s3)">' +
      HV.ui.index(entry.index, { ghost: prevEntry ? prevEntry.index : null }) + '</div>' +
      (prevEntry
        ? '<p class="sub" style="margin:var(--s3) 0 0; text-align:center">The dashed outline is cycle ' + prevEntry.cycle + '.</p>'
        : '') + '</div>';
  }

  /* ================= PL-01 hub + PL-10..12 calendar + cycle history ================= */
  HV.registerView('plan', {
    title: 'My Plan',
    roles: ['client'],
    render: function (el) {
      var client = HV.myClient();
      var cal = HV.calendarFor(client);
      var prop = HV.store.proposedCalendars[client.id];
      var history = client.cycleHistory || [];
      var viewCycle = client.cycle;
      /* the journey gallery's density — 0 is the bird's-eye wall (every cycle
         visible at once), 1 stacks full day grids. galAnchor names the cycle
         a zoom-in should land on; consumed by the draw that follows. */
      var galZoom = 0;
      var galAnchor = null;

      /* the second level — one tab per concern, the calendar first */
      var TABS = [
        { id: 'calendar', label: 'Calendar' },
        { id: 'weight', label: 'Weight goals' },
        { id: 'daily', label: 'Daily activities' },
        { id: 'levelup', label: 'Level-up targets' },
      ];
      var tab = 'calendar';

      /* the chevron that rides the fading edge — a strip that overflows looks
         complete until something says otherwise, so say it, and let the tap
         do the scrolling for anyone who does not think to swipe */
      function hsCue(label) {
        return '<button class="hs-more" aria-label="' + label + '">' + HV.ui.icon('chevR') + '</button>';
      }

      /* the first level — the cycles, newest first; scroll right for the oldest.
         The gallery door rides ahead of them all: the whole journey at once. */
      function cycleStrip() {
        if (client.observation) return '';
        var chips = [{ cy: client.cycle, label: 'Cycle ' + client.cycle + ' · now' }];
        for (var i = history.length - 1; i >= 0; i--) {
          chips.push({ cy: history[i].cycle, label: 'Cycle ' + history[i].cycle });
        }
        var gal = '<button class="cyc gal' + (viewCycle === 'all' ? ' on' : '') + '" data-cy="all" ' +
          'aria-label="Whole journey — every cycle at once">' + HV.ui.icon('grid') + '</button>';
        return '<div class="cycles">' + gal + chips.map(function (c2) {
          return '<button class="cyc' + (viewCycle === c2.cy ? ' on' : '') + '" data-cy="' + c2.cy + '">' + c2.label + '</button>';
        }).join('') + '</div>';
      }

      /* the cycle's level-up targets — one row per pillar, tap for the
         criteria and where you stand. The paper checklist, kept in view. */
      function levelupTargets() {
        if (client.observation || !client.sessions) {
          return '<div class="notice">Level-up targets switch on after your observation window (day ' + client.day + ' of 5) — then this tab shows exactly what qualifies each pillar for its next level.</div>';
        }
        /* on the gallery chip, every pillar's criteria inline instead of rows-to-sheets */
        if (viewCycle === 'all') return levelupAllHtml();
        var bars = {
          fitness: 'min 4 of 5 sessions · 75% of level goals',
          culture: '5 gates · min 25 of 33 photos · 80% on plan',
          yoga: '3 of 3 sessions · 75% of level goals',
          wellness: 'mind session · sleep 7–8 h · screen cap',
        };
        var rows = Object.keys(HV.PILLARS).map(function (key) {
          var p = HV.PILLARS[key];
          var lu = HV.levelup(client, key);
          if (!lu) return '';
          var next = lu.level >= 7 ? 'L7 · hold it' : 'to L' + (lu.level + 1);
          return '<button class="trow ' + p.cls + '" data-lvlup="' + key + '" style="width:100%">' +
            HV.ui.plate(key, 'sm') +
            '<span class="grow"><b>' + HV.esc(p.name) + ' · ' + HV.esc(next) + '</b>' +
            '<small class="num">' + HV.esc(bars[key]) + '</small></span>' +
            '<span style="flex:none; text-align:right"><span class="num" style="font-weight:600">' + lu.ticked + '/' + lu.total + '</span><br><small class="sub">criteria met</small></span>' +
            HV.ui.icon('chevR') + '</button>';
        }).join('');
        return '<div class="card"><div class="list">' + rows + '</div>' +
          '<p class="sub" style="margin:var(--s2) 0 0">Tap a pillar for its criteria and where you stand. Your care team confirms every level change at the day-' + HV.reviewDay() + ' review.</p></div>';
      }

      /* the grid for any cycle's days — the day cells and a one-line key */
      function calGrid(days, title, hint, live) {
        var todayIdx = -1;
        days.forEach(function (dd, i) { if (dd.today) todayIdx = i; });
        return '<div class="card"><div class="card-title" style="margin-bottom:var(--s3)">' + title + '</div>' +
          '<div class="calc">' +
          days.map(function (d, i) { return bigCell(client, d, i, live, todayIdx); }).join('') +
          '</div>' + calLegend() +
          '<p class="sub" style="margin:var(--s3) 0 0">' + hint + '</p></div>';
      }

      /* tab 1 · the calendar — the month, its legend, the full-plan tiles;
         on the gallery chip, the whole journey's wall instead */
      function calendarTab() {
        if (viewCycle === 'all') return galleryTab();
        if (viewCycle !== client.cycle) return pastHtml(viewCycle);

        var calHtml;
        if (cal && cal.length) {
          var month = String(cal[0].date || '').split(' ')[0];
          calHtml = calGrid(cal, HV.esc(month) + ' · your ' + HV.copy.cycleWord() + ' cycle',
            'Tap a day for its sessions and your progress in them.', true);
        } else {
          calHtml =
            '<div class="notice">You’re in your observation window (day ' + client.day + ' of 5) — no calendar yet, and that’s by design. We learn your normal week first, then your team builds your first ' + HV.copy.cycleWord() + ' cycle around it.</div>';
        }

        /* the full plans — four rounded tiles, two to a row, under the month.
           The label is a designed two-liner (pillar word over a quiet "Full
           plan"), so every tile holds the same shape — the full wording keeps
           living on the sheet buttons and the plan-full headers. No aria-label:
           the visible text IS the accessible name, so what a voice-control
           user says is what the button answers to (WCAG 2.5.3). */
        var TILE_WORDS = { culture: 'Diet', fitness: 'Fitness', yoga: 'Yoga', wellness: 'Mind Wellness' };
        var plans = client.observation ? '' :
          '<div class="fptiles">' + ['culture', 'fitness', 'yoga', 'wellness'].map(function (k2) {
            var p2 = HV.PILLARS[k2];
            return '<button class="fptile ' + p2.cls + '" data-full-plan="' + k2 + '">' +
              HV.ui.plate(k2, 'sm') +
              '<span class="grow"><b>' + HV.esc(TILE_WORDS[k2]) + '</b><small>Full plan</small></span>' +
              HV.ui.icon('chevR') + '</button>';
          }).join('') + '</div>';

        var propHtml = '';
        if (prop && !prop.confirmed) {
          propHtml =
            '<div class="notice">Your Cycle ' + prop.cycle + ' calendar is ready — 5 fitness + 3 yoga + 1 mind, alternate days (9 session + 2 active rest).</div>' +
            '<button class="btn block" data-confirm-cal>Confirm my calendar</button>' +
            '<button class="btn ghost block" data-req-change>Request a change</button>';
        }

        return calHtml + plans + propHtml;
      }

      /* tab 2 · weight goals — the goal ledger from the paper calendar;
         on the gallery chip, the ledger plus every cycle report in one flow */
      function weightTab() {
        if (viewCycle === 'all') return weightAllHtml();
        return ledgerCard(client) ||
          '<div class="notice">Your weight goal is set with your care team after the observation window — the seven-level ledger appears here once your first cycle begins.</div>';
      }

      /* tab 3 · daily activities — the standing targets set on Trackers */
      function dailyTab() {
        var t = client.trackers || {};
        var row = function (icon, b, small) {
          return '<div class="trow">' + HV.ui.iconTile(icon, 'sm') +
            '<span class="grow"><b>' + b + '</b><small>' + HV.esc(small) + '</small></span></div>';
        };
        return '<div class="card"><div class="list">' +
          row('walk', 'Steps · <span class="num">' + (t.stepsTarget || 0).toLocaleString('en-IN') + '</span>', 'every day — counted from your phone or watch') +
          row('drop', 'Water · <span class="num">' + (t.waterTarget || 8) + '</span> glasses', 'spread through the day') +
          row('moon', 'Sleep · <span class="num">7–8 h</span>', 'the band that counts at review') +
          row('device', 'Screen · under <span class="num">' + (t.screenTarget || 120) + '</span> min', 'none in the hour before bed') +
          '</div>' +
          '<p class="sub" style="margin:var(--s2) 0 0">Your standing daily targets — log them as you go on the Trackers tab.</p>' +
          '<button class="btn ghost block" data-go-trackers>Open Trackers</button></div>';
      }

      function pastCal(cy) {
        var byCycle = (HV.store.calendarsPast || {})[client.id] || {};
        return byCycle[cy] || null;
      }

      function pastHtml(cy) {
        var idx = -1;
        history.forEach(function (h, i) { if (h.cycle === cy) idx = i; });
        if (idx < 0) return '';
        var pc = pastCal(cy);
        var grid = pc
          ? calGrid(pc, 'Cycle ' + cy + ' · its ' + (pc || []).length + ' days', 'The record of the cycle — tap a day to read it.', false)
          : '';
        return grid + reportHtml(client, history[idx], idx > 0 ? history[idx - 1] : null);
      }

      /* ── the journey gallery — the strip's first chip. Every cycle on one
         wall, two densities like a photo gallery: z0 is the bird's-eye (one
         row per cycle, one washed cell per day of THAT cycle — the whole
         journey in one screenful), z1 stacks every cycle's full day grid.
         Each row sets its own column count, so cycles of different lengths
         sit on the same wall without going ragged. Pinch, the +/−
         buttons, or a tap on a z0 row move between them. ── */
      function galleryCycles() {
        var list = history.map(function (h) {
          return { cycle: h.cycle, days: pastCal(h.cycle), live: false, level: h.level, outcome: h.outcome };
        }).filter(function (g) { return !!(g.days && g.days.length); });
        if (cal && cal.length) list.push({ cycle: client.cycle, days: cal, live: true });
        return list;
      }

      /* a z0 cell's wash — the ring grammar flattened to a tint: any miss
         says miss, a fully-done day says ok, rest is rest, what hasn't
         happened yet stays plain. A walked day on a past cycle with nothing
         missed is done by definition — the record, not a guess. */
      function gcWash(g, d) {
        if (d.rest) return 'rest';
        var items = d.items || [];
        if (items.some(function (it) { return it.status === 'missed'; })) return 'miss';
        if (items.length && items.every(function (it) { return it.status === 'done'; })) return 'ok';
        if (!g.live) return 'ok';
        return 'up';
      }

      function galLabel(g) {
        return g.live
          ? 'Cycle ' + g.cycle + ' · now'
          : 'Cycle ' + g.cycle + ' · L' + g.level + ' · ' + (g.outcome === 'achieved' ? 'achieved' : 'carried');
      }

      function galleryTab() {
        var gs = galleryCycles();
        if (!gs.length) return '<div class="notice">Your journey wall begins with your first cycle — nothing to look back on yet.</div>';
        var nDays = gs.reduce(function (n, g) { return n + g.days.length; }, 0);
        var tools =
          '<div class="galtools"><span class="grow sub"><span class="num">' + gs.length + '</span> cycles · <span class="num">' + nDays + '</span> days</span>' +
          '<button class="gzb" data-gzoom="out"' + (galZoom === 0 ? ' disabled' : '') + ' aria-label="Zoom out to the whole journey">' + HV.ui.icon('minus') + '</button>' +
          '<button class="gzb" data-gzoom="in"' + (galZoom === 1 ? ' disabled' : '') + ' aria-label="Zoom in to full day cells">' + HV.ui.icon('plus') + '</button></div>';

        var body;
        if (galZoom === 0) {
          body = '<div class="card">' + gs.map(function (g, gi) {
            var missN = 0;
            var cells = g.days.map(function (d) {
              var wash = gcWash(g, d);
              if (wash === 'miss') missN++;
              return '<span class="gc num ' + wash + (d.today ? ' today' : '') + '">' + d.day + '</span>';
            }).join('');
            /* the row's accessible name carries what the washes say — the
               cells themselves are presentation, so the count must speak */
            var said = galLabel(g) + (missN ? ' — ' + missN + ' missed day' + (missN > 1 ? 's' : '') : '');
            return '<button class="galrow" data-gcy="' + gi + '" aria-label="' + HV.esc(said) + ' — zoom in">' +
              '<span class="galcy">' + HV.esc(galLabel(g)) + '</span>' +
              '<span class="galc" style="--galn:' + (g.days.length || HV.cycleDays()) + '">' +
                cells + '</span></button>';
          }).join('') + '</div>' +
          '<p class="sub" style="margin:var(--s3) 0 0">Your whole journey in one look — green days cleared, a dashed red edge carries a miss. Pinch out, tap +, or tap a cycle to read its days.</p>';
        } else {
          body = gs.map(function (g, gi) {
            var todayIdx = -1;
            g.days.forEach(function (dd, i) { if (dd.today) todayIdx = i; });
            return '<div class="card galsec" data-gsec="' + gi + '" tabindex="-1"><div class="card-title" style="margin-bottom:var(--s3)">' + HV.esc(galLabel(g)) + '</div>' +
              '<div class="calc">' + g.days.map(function (d, i) { return bigCell(client, d, i, g.live, todayIdx); }).join('') + '</div></div>';
          }).join('') + calLegend() +
          '<p class="sub" style="margin:var(--s3) 0 0">The record of every cycle, oldest first — tap a day to read it, pinch in for the whole wall.</p>';
        }
        return '<div data-galwrap>' + tools + body + '</div>';
      }

      /* gallery mode for Weight goals — the seven-level ledger, then every
         cycle's report in one flow, oldest first: the whole story, no tabs
         between you and it. */
      function weightAllHtml() {
        var out = ledgerCard(client);
        if (history.length) {
          out += '<div class="sec-title">Every cycle report</div>' +
            history.map(function (h, i) { return reportHtml(client, h, i > 0 ? history[i - 1] : null); }).join('');
        }
        return out ||
          '<div class="notice">Your weight goal is set with your care team after the observation window — the seven-level ledger appears here once your first cycle begins.</div>';
      }

      /* gallery mode for Level-up targets — all four pillars' criteria
         inline, one flowing list, no sheet between you and the detail */
      function levelupAllHtml() {
        return Object.keys(HV.PILLARS).map(function (key) {
          var p = HV.PILLARS[key];
          var lu = HV.levelup(client, key);
          if (!lu) return '';
          return '<div class="card"><div class="row">' + HV.ui.plate(key, 'sm') +
            '<span class="card-title grow">' + HV.esc(p.name) + ' · L' + lu.level + '</span>' +
            '<span class="pill info"><span class="num">' + lu.ticked + '/' + lu.total + '</span></span></div>' +
            '<div class="list" style="margin-top:var(--s2)">' + luRowsHtml(lu) + '</div>' +
            (lu.goals.length
              ? '<div style="margin-top:var(--s2)">' + lu.goals.map(function (g) { return '<span class="chip">' + HV.esc(g) + '</span>'; }).join('') + '</div>'
              : '') +
            '<p class="sub" style="margin:var(--s2) 0 0">' + HV.esc(lu.note) + '</p></div>';
        }).join('');
      }

      function draw() {
        var subLine = client.observation
          ? 'Observation · day ' + client.day + ' of 5'
          : 'Cycle ' + client.cycle + ' · day ' + client.day + ' of ' + HV.cycleDays();
        var content = tab === 'calendar' ? calendarTab()
          : tab === 'weight' ? weightTab()
          : tab === 'daily' ? dailyTab()
          : levelupTargets();
        var strip = cycleStrip();
        el.innerHTML =
          SFB_CSS +
          HV.ui.sceneBand('YOUR ' + HV.cycleDays() + ' DAYS', 'My Plan', HV.esc(subLine)) +
          (strip ? '<div class="hswrap">' + strip + hsCue('Show older cycles') + '</div>' : '') +
          '<div class="hswrap"><div class="tabs">' + TABS.map(function (t2) {
            return '<button data-ptab="' + t2.id + '" class="' + (tab === t2.id ? 'on' : '') + '">' + t2.label + '</button>';
          }).join('') + '</div>' + hsCue('Show more tabs') + '</div>' +
          content;
        wire();
        /* a zoom-in lands on the cycle that asked for it — scrolled into view
           AND focused (tabindex="-1"), because the row button that was pressed
           no longer exists and keyboard users need somewhere to stand */
        if (galAnchor != null) {
          var target = el.querySelector('[data-gsec="' + galAnchor + '"]');
          galAnchor = null;
          if (target) {
            target.scrollIntoView({
              behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
              block: 'start',
            });
            target.focus({ preventScroll: true });
          }
        }
      }

      /* the pinch — two fingers spreading past 1.25× zoom the gallery in
         (anchored to the cycle under the fingers), squeezing under 0.8× zoom
         it out. touch-action:pan-y on the wrap keeps one-finger scrolling
         native; preventDefault here keeps the browser's own page-zoom from
         taking the gesture (the viewport allows user zoom, by design). */
      function wirePinch(gw) {
        var d0 = 0;
        var dist = function (t) {
          return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
        };
        gw.addEventListener('touchstart', function (e) {
          if (e.touches.length === 2) d0 = dist(e.touches);
        }, { passive: true });
        gw.addEventListener('touchmove', function (e) {
          if (e.touches.length !== 2 || !d0) return;
          e.preventDefault();
          var r = dist(e.touches) / d0;
          if (r > 1.25 && galZoom === 0) {
            var hit = document.elementFromPoint(
              (e.touches[0].clientX + e.touches[1].clientX) / 2,
              (e.touches[0].clientY + e.touches[1].clientY) / 2);
            var row = hit && hit.closest ? hit.closest('[data-gcy]') : null;
            galZoom = 1;
            galAnchor = row ? Number(row.dataset.gcy) : null;
            d0 = 0;
            draw();
          } else if (r < 0.8 && galZoom === 1) {
            galZoom = 0;
            d0 = 0;
            draw();
          }
        }, { passive: false });
        gw.addEventListener('touchend', function () { d0 = 0; });
      }

      function wire() {
        /* the fading edge that says "more this way" — on until scrolled out */
        el.querySelectorAll('.hswrap').forEach(function (w) {
          var sc = w.firstElementChild;
          var update = function () {
            var max = sc.scrollWidth - sc.clientWidth;
            w.classList.toggle('at-end', max <= 4 || sc.scrollLeft >= max - 4);
            w.classList.toggle('off-start', sc.scrollLeft > 4);
          };
          sc.addEventListener('scroll', update, { passive: true });
          var more = w.querySelector('.hs-more');
          if (more) more.addEventListener('click', function () {
            sc.scrollBy({ left: Math.round(sc.clientWidth * 0.6), behavior: 'smooth' });
          });
          /* rotation or a late font reflow changes what fits — recompute then
             too, or the fade advertises overflow that no longer exists */
          if (window.ResizeObserver) new ResizeObserver(update).observe(sc);
          update();
        });

        el.querySelectorAll('[data-ptab]').forEach(function (b) {
          b.addEventListener('click', function () { tab = b.dataset.ptab; draw(); });
        });

        el.querySelectorAll('[data-cy]').forEach(function (b) {
          b.addEventListener('click', function () {
            viewCycle = b.dataset.cy === 'all' ? 'all' : Number(b.dataset.cy);
            draw();
          });
        });

        var trBtn = el.querySelector('[data-go-trackers]');
        if (trBtn) trBtn.addEventListener('click', function () { HV.go('#/trackers'); });

        el.querySelectorAll('[data-lvlup]').forEach(function (b) {
          b.addEventListener('click', function () { openLevelSheet(client, b.dataset.lvlup); });
        });

        if (viewCycle === 'all') {
          /* the gallery's day cells — each z1 section knows its own cycle.
             Sheets open as the record (never live): acting on today stays on
             the "now" chip, and a mark-done's refresh would dump the reader
             out of the gallery anyway. */
          var gs = galleryCycles();
          el.querySelectorAll('.galsec').forEach(function (sec) {
            var g = gs[Number(sec.dataset.gsec)];
            sec.querySelectorAll('[data-day]').forEach(function (b) {
              b.addEventListener('click', function () { openDaySheet(client, g.days[Number(b.dataset.day)], false); });
            });
          });

          /* the three zoom paths — the +/− buttons, a tap on a z0 cycle row
             (lands zoomed in on that cycle), and the pinch below */
          el.querySelectorAll('[data-gzoom]').forEach(function (b) {
            b.addEventListener('click', function () {
              galZoom = b.dataset.gzoom === 'in' ? 1 : 0;
              draw();
              /* draw() destroyed the pressed button and its twin in the new
                 DOM is disabled — hand focus to the counterpart, so keyboard
                 users aren't dropped back to the top of the page */
              var next = el.querySelector('[data-gzoom="' + (b.dataset.gzoom === 'in' ? 'out' : 'in') + '"]');
              if (next) next.focus();
            });
          });
          el.querySelectorAll('[data-gcy]').forEach(function (b) {
            b.addEventListener('click', function () {
              galZoom = 1; galAnchor = Number(b.dataset.gcy); draw();
            });
          });
          var gw = el.querySelector('[data-galwrap]');
          if (gw) wirePinch(gw);
        } else {
          var live = viewCycle === client.cycle;
          var viewedCal = live ? cal : pastCal(viewCycle);
          el.querySelectorAll('[data-day]').forEach(function (b) {
            b.addEventListener('click', function () { openDaySheet(client, viewedCal[Number(b.dataset.day)], live); });
          });
        }

        el.querySelectorAll('[data-full-plan]').forEach(function (b) {
          b.addEventListener('click', function () { HV.go('#/plan-full/' + b.dataset.fullPlan); });
        });


        var confirmBtn = el.querySelector('[data-confirm-cal]');
        if (confirmBtn) {
          confirmBtn.addEventListener('click', function () {
            prop.confirmed = true;
            HV.store.opsStats.unconfirmedCal24 = Math.max(0, (HV.store.opsStats.unconfirmedCal24 || 0) - 1);
            /* the published calendar approval needs no touch — confirmation is
               derived from proposedCalendars.confirmed everywhere it matters */
            HV.pushMsg(client.id, { fromId: 'client', kind: 'text', text: 'Calendar confirmed' });
            HV.refresh();
            HV.toast('Calendar confirmed. Cycle ' + prop.cycle + ' begins.');
          });
        }

        var reqBtn = el.querySelector('[data-req-change]');
        if (reqBtn) reqBtn.addEventListener('click', function () { openChangeSheet(client); });
      }

      draw();
    }
  });

  /* ================= the full pillar plans =================
     The whole cycle for one pillar, drawn day by day in Today's vocabulary —
     the tiles below the calendar open these, so Plan and Today read as one
     screenful of the same language. */
  HV.registerView('plan-full', {
    title: 'Full plan',
    roles: ['client'],
    render: function (el, params) {
      var client = HV.myClient();
      var key = params[0];
      var p = HV.PILLARS[key];
      var back = '<button data-back style="color:var(--brand);font-weight:600;font-size:13px" aria-label="Back to My Plan">‹ Back to My Plan</button>';

      if (!p) {
        el.innerHTML = back + HV.ui.empty('leaf', 'We couldn’t find that plan.');
        el.querySelector('[data-back]').addEventListener('click', function () { HV.go('#/plan'); });
        return;
      }

      var lvl = (client.levels && client.levels[key]) || 1;
      var body;
      if (client.observation) {
        body = '<div class="notice">Your plans arrive after the observation window (day ' + client.day + ' of 5) — we learn your normal first, then your team writes the plan around it.</div>';
      } else {
        var blockCard = '<div class="card tgroups" style="margin-top:var(--s3)"><div class="tg ' + p.cls + '">' +
          '<div class="row"><span class="pdot"></span><b>' + HV.esc(p.name) + '</b>' +
          '<small class="lvl">Level ' + lvl + '</small></div>' +
          pillarBlock(client, key, null, client.day) + '</div></div>';

        var daysCard;
        if (key === 'culture') {
          daysCard = '<div class="notice">A new diet plan lands every 11th day — this one runs all of cycle ' + client.cycle + '.</div>';
        } else {
          var cal2 = HV.calendarFor(client);
          daysCard = '<div class="card-title" style="margin-top:var(--s4)">Cycle ' + client.cycle + ' · day by day</div>' +
            '<div class="card tgroups">' + cal2.map(function (d) {
              var mine = (d.items || []).filter(function (i) { return i.pillar === key; });
              var rows = d.rest
                ? '<div class="tg-empty">Active rest — recovery is the session.</div>'
                : mine.length
                  ? mine.map(function (it) {
                      /* a rated session carries its tiny star row; the tap
                         answers with the client's own note */
                      var fb = feedbackFor(client, d, it);
                      return tgItem(HV.esc(it.label),
                        HV.esc(it.time) + ' · with ' + HV.esc(HV.staff(it.staffId).name),
                        statusPill(it.status)) +
                        (fb ? '<button class="sfb-tap" data-fbstars="' + fb.stars + '" data-fbnote="' + HV.esc(fb.note || '') + '">' +
                          HV.ui.stars(fb.stars, { cls: 'sfb-s' }) +
                          '<small>Your rating' + (fb.note ? ' · tap for your note' : '') + '</small></button>' : '');
                    }).join('')
                  : '<div class="tg-empty">' + (key === 'yoga' ? 'Your own practice — the sequence above.' : 'Nothing scheduled.') + '</div>';
              if (d.review) rows += tgMeta('Level review day');
              if (d.meeting) rows += tgMeta('Progress meeting · new plan');
              /* the day's own status glyph, same grammar as the calendar's
                 bigCell: this pillar's item status on the day (done/missed),
                 or the neutral "up" ring when nothing's landed yet or the
                 day has no item for this pillar (e.g. a rest day) */
              var dayStatus = mine.length ? mine[0].status : null;
              return '<div class="tg ' + p.cls + '"><div class="row">' + pmark(key, dayStatus) + '<b>Day ' + d.day + '</b>' +
                (d.date ? '<small class="lvl">' + HV.esc(d.date) + '</small>' : '') + '</div>' + rows + '</div>';
            }).join('') + '</div>';
        }

        body = blockCard + daysCard +
          '<div class="card-title" style="margin-top:var(--s4)">Your progress this cycle</div>' +
          '<div class="grid3 tight">' + progTiles(client, key) + '</div>';
      }

      el.innerHTML =
        SFB_CSS +
        back +
        '<div class="h1-row ' + p.cls + '"><span class="h1 row" style="gap:var(--s3)">' + HV.ui.plate(key, 'lg') + HV.esc(FULL_LABELS[key]) + '</span>' +
        HV.ui.pill('Level ' + lvl, 'info') + '</div>' +
        '<p class="sub" style="margin:0">' + (client.observation
          ? 'Observation · day ' + client.day + ' of 5'
          : 'Cycle ' + client.cycle + ' · day ' + client.day + ' of ' + HV.cycleDays()) + '</p>' +
        body;

      el.querySelector('[data-back]').addEventListener('click', function () { HV.go('#/plan'); });
      el.querySelectorAll('[data-fbstars]').forEach(function (b) {
        b.addEventListener('click', function () {
          HV.toast(b.dataset.fbnote
            ? '“' + b.dataset.fbnote + '”'
            : b.dataset.fbstars + ' of 5 stars — no note added.');
        });
      });
      HV.ui.wireTasks(el, HV.tasks(client, client.day));
    }
  });

  /* ================= PL-06..09 pillar plan detail =================
     The paper HAALVING calendar keeps three sheets per client; the app keeps
     them per pillar. Calendar — the level's target and what to do. Progress —
     what's completed, reported the way the team already reports it on paper.
     Level-up — the criteria that qualify the next level. */
  HV.registerView('plan-detail', {
    title: 'Plan detail',
    roles: ['client'],
    render: function (el, params) {
      var client = HV.myClient();
      var key = params[0];
      var p = HV.PILLARS[key];
      var back = '<button data-back style="color:var(--brand);font-weight:600;font-size:13px" aria-label="Back to My Plan">‹ Back to My Plan</button>';

      if (!p) {
        el.innerHTML = back + HV.ui.empty('leaf', 'We couldn’t find that plan.');
        el.querySelector('[data-back]').addEventListener('click', function () { HV.go('#/plan'); });
        return;
      }

      var TABS = [
        { id: 'calendar', label: 'Calendar' },
        { id: 'progress', label: 'Progress' },
        { id: 'levelup', label: 'Level-up' },
      ];
      var tab = 'calendar';
      TABS.forEach(function (t) { if (params[1] === t.id) tab = t.id; });

      var lvl = (client.levels && client.levels[key]) || 1;
      var track = client.track || 'sedentary';
      var cal = HV.calendarFor(client);
      var sess = client.sessions || null;

      /* stat-tile numbers are set at 30px in a third-width tile — thousands
         abbreviate or they wrap */
      function fmtK(n) { return n >= 1000 ? String(Math.round(n / 100) / 10).replace(/\.0$/, '') + 'k' : String(n); }

      /* this cycle's running total for a tracker: seeded prior days + today */
      function cycleSum(weekArr, today) {
        weekArr = weekArr || [];
        var n = Math.max(0, Math.min(client.day - 1, weekArr.length));
        var t = today || 0;
        for (var i = weekArr.length - n; i < weekArr.length; i++) t += weekArr[i];
        return t;
      }

      function statTile(label, value, sub) {
        return '<div class="stat"><span class="k">' + HV.esc(label) + '</span>' +
          '<div class="v num">' + HV.esc(value) + '</div>' +
          (sub ? '<div class="sub num">' + HV.esc(sub) + '</div>' : '') + '</div>';
      }

      /* the level book for this pillar at this client's track and level */
      function bookFor() {
        var prog = HV.store.program;
        if (!prog) return null;
        if (key === 'wellness') return prog.wellness ? prog.wellness[lvl] : null;
        var b = prog[key];
        if (!b) return null;
        var t = b[track] || b.sedentary;
        return t ? (t[lvl] || null) : null;
      }

      /* what this level asks — the chart content behind each calendar entry */
      function bookHtml(bk) {
        var inner = '';
        if (key === 'fitness') {
          inner = '<div class="card-title">' + HV.esc(bk.phase) + ' · Level ' + lvl + '</div>' +
            '<p class="sub" style="margin:var(--s1) 0 var(--s2)">' + HV.esc(bk.goal) + '</p>' +
            '<div class="list">' +
            bk.home.sets.map(function (s2) {
              return '<div class="trow">' + pmark(key, null) + '<span class="grow"><b>' + HV.esc(s2.name) + ' · <span class="num">' + HV.esc(s2.dose) + '</span></b>' +
                '<small>' + HV.esc(s2.k) + ' · home block, <span class="num">' + bk.home.mins + ' min</span></small></span></div>';
            }).join('') +
            '<div class="trow">' + pmark(key, null) + '<span class="grow"><b>At the gym instead</b><small>' + HV.esc(bk.gym.line) + '</small></span></div>' +
            '</div>' +
            '<p class="sub" style="margin:var(--s2) 0 0">Every day: <span class="num">' + HV.esc(bk.steps) + '</span> · <span class="num">' + HV.esc(bk.water) + '</span> water · intensity ' + HV.esc(bk.intensity) + '</p>';
        } else if (key === 'yoga') {
          inner = '<div class="card-title">' + HV.esc(bk.phase) + ' · Level ' + lvl + ' · ' + HV.esc(bk.dur) + '</div>' +
            '<p class="sub" style="margin:var(--s1) 0 var(--s2)">' + HV.esc(bk.goal) + '</p>' +
            '<div class="list">' +
            bk.blocks.map(function (b2) {
              return '<div class="trow">' + pmark(key, null) + '<span class="grow"><b>' + HV.esc(b2.k) + ' · <span class="num">' + HV.esc(b2.mins) + '</span></b>' +
                '<small>' + HV.esc(b2.v) + '</small></span></div>';
            }).join('') + '</div>' +
            '<p class="sub" style="margin:var(--s2) 0 0">Key poses: ' + bk.poses.map(function (po) { return HV.esc(po); }).join(' · ') + '</p>' +
            '<p class="sub" style="margin:var(--s1) 0 0">' + HV.esc(bk.focus) + '</p>';
        } else if (key === 'culture') {
          var mp = HV.store.mealPlans ? HV.store.mealPlans[client.id] : null;
          inner = '<div class="card-title">' + HV.esc(bk.phase) + ' · Level ' + lvl + '</div>' +
            '<p class="sub" style="margin:var(--s1) 0 var(--s2)">' + HV.esc(bk.aim) + '</p>' +
            (mp ? '<div class="list">' + mp.slots.map(function (s3) {
              return '<div class="trow">' + pmark(key, null) + '<span class="grow"><b>' + HV.esc(s3.dish) + '</b>' +
                '<small>' + HV.esc(s3.slot) + ' · ' + HV.esc(s3.time) + (s3.kcal ? ' · <span class="num">' + s3.kcal + '</span> kcal' : '') + '</small></span></div>';
            }).join('') + '</div>' : '') +
            '<div class="card-title" style="margin-top:var(--s3)">Happy habits</div>' +
            '<div>' + bk.habits.map(function (h) { return '<span class="chip">' + HV.esc(h) + '</span>'; }).join('') + '</div>' +
            (bk.plate ? '<p class="sub" style="margin:var(--s2) 0 0">Your plate: ' + HV.esc(bk.plate) + '</p>' : '') +
            '<p class="sub" style="margin:var(--s1) 0 0">' + HV.esc(bk.star) + '</p>';
        } else {
          inner = '<div class="card-title">Daily practice · Level ' + lvl + '</div>' +
            '<div class="list" style="margin-top:var(--s2)">' +
            '<div class="trow">' + pmark(key, null) + '<span class="grow"><b>Sleep <span class="num">' + HV.esc(bk.sleep) + '</span></b><small>the non-negotiable</small></span></div>' +
            '<div class="trow">' + pmark(key, null) + '<span class="grow"><b>Screen under <span class="num">' + HV.esc(bk.screen) + '</span></b><small>none in the hour before bed</small></span></div>' +
            '<div class="trow">' + pmark(key, null) + '<span class="grow"><b>' + HV.esc(bk.practice) + '</b><small>your mind practice</small></span></div>' +
            '</div>';
        }
        return '<div class="card-title" style="margin-top:var(--s4)">What this level asks</div>' +
          '<div class="card ' + p.cls + '">' + inner + '</div>';
      }

      /* ── 1 · Calendar & targets — the paper calendar's sidebar and month, one pillar at a time ── */
      function calendarHtml() {
        var out = '';

        var cur = null;
        (client.goalLedger || []).forEach(function (r) { if (r.state === 'cur') cur = r; });
        if (cur) {
          out += '<div class="card"><span class="k">This level’s target</span>' +
            '<div class="tk-read" style="margin-top:var(--s2)"><span class="num">' + HV.esc(cur.target) + '</span>' +
            (cur.result ? '<small>so far ' + HV.esc(cur.result) + '</small>' : '<small>level ' + cur.level + ' of ' + HV.levels() + '</small>') + '</div>' +
            '<p class="sub" style="margin:var(--s2) 0 0">Level ' + cur.level + '’s share of “' + HV.esc(client.goal) + '” — the goal ledger on My Plan holds all seven shares.</p></div>';
        }

        var items = [];
        cal.forEach(function (d) {
          (d.items || []).forEach(function (it) { if (it.pillar === key) items.push({ d: d, it: it }); });
        });
        if (items.length) {
          out += '<div class="card-title" style="margin-top:var(--s4)">On your ' + HV.copy.cycleWord() + ' calendar</div>' +
            '<div class="card"><div class="list">' + items.map(function (row) {
              var staff = HV.staff(row.it.staffId);
              var fb = feedbackFor(client, row.d, row.it);
              return '<div class="trow"><span class="grow"><b>' + HV.esc(row.it.label) + '</b>' +
                '<small>Day <span class="num">' + row.d.day + '</span> · ' + HV.esc(row.d.date) + ' · ' + HV.esc(row.it.time) + ' · ' + HV.esc(staff.name) + '</small>' +
                (fb ? '<span class="sfb-line">' + HV.ui.stars(fb.stars, { cls: 'sfb-s' }) + '</span>' : '') +
                '</span>' + statusPill(row.it.status) + '</div>';
            }).join('') + '</div></div>';
        } else if (!client.observation) {
          out += '<div class="notice">' + (key === 'culture'
            ? 'Nutrition runs every day, not on session slots — the plate below is your calendar.'
            : 'No scheduled sessions this cycle — this pillar runs as daily practice.') + '</div>';
        }

        var plan = (HV.store.plans[client.id] || {})[key];
        if (plan) {
          var staff2 = HV.staff(plan.by);
          var byLine = staff2 ? staff2.name + ' · ' + ((HV.roleDef(staff2.role) || {}).title || staff2.role) : 'Your care team';
          out +=
            '<div class="card-title" style="margin-top:var(--s4)">Your chart</div>' +
            '<div class="card ' + p.cls + '">' +
              '<div class="row" style="margin-bottom:var(--s3)">' +
                (staff2 ? HV.ui.avatar(staff2.name) : '') +
                '<span class="grow"><b>' + HV.esc(plan.title) + '</b>' +
                '<span class="sub" style="display:block">by ' + HV.esc(byLine) + '</span></span>' +
                HV.ui.pill('Published', 'ok') +
              '</div>' +
              '<div class="list">' + plan.lines.map(function (l) {
                return '<div class="trow"><span class="pdot"></span><span class="grow">' + HV.esc(l) + '</span></div>';
              }).join('') + '</div>' +
            '</div>';
        } else {
          out += HV.ui.empty('sprout',
            'No published ' + p.name + ' plan yet' +
            (client.observation
              ? ' — you’re in your observation window (day ' + client.day + ' of 5). We learn your normal first; your plan appears here the moment your team publishes it.'
              : '. Your team is shaping it now — it appears here the moment it’s published.'));
        }

        var bk = bookFor();
        if (bk && !client.observation) out += bookHtml(bk);

        return out + '<p class="audit">Only published, team-approved plans appear here.</p>';
      }

      /* same "how many of the last N days cleared zero" average Trackers
         reports under its own strips — kept local since it's only four
         lines and this view doesn't otherwise share scope with that one */
      function avgOf(week) {
        var days = (week || []).filter(function (v) { return v > 0; });
        if (!days.length) return 0;
        return Math.round(days.reduce(function (s, v) { return s + v; }, 0) / days.length);
      }

      /* ── 2 · Progress report — the paper report's quadrants, one pillar at a time ── */
      function progressHtml() {
        if (client.observation || !sess) {
          return '<div class="notice">Reports begin with your first cycle — right now we’re learning your normal (day ' + client.day + ' of 5), and nothing is graded.</div>';
        }
        var t = client.trackers || {};
        var wk = t.week || {};

        /* the standing daily basics, in Trackers' own instrument — steps and
           water sit above the pillar-specific stat tiles because every
           pillar's plan leans on both, not just Fitness's */
        var stepsR = HV.trackers.read('steps');
        var waterR = HV.trackers.read('water');
        var strips =
          '<div class="sec-title">Steps · this week</div><div class="card">' +
          HV.ui.weekBars(stepsR.week, stepsR.target, 'avg ' + avgOf(stepsR.week).toLocaleString('en-IN'),
            function (v) { return v.toLocaleString('en-IN') + ' steps'; }) + '</div>' +
          '<div class="sec-title">Water · this week</div><div class="card">' +
          HV.ui.weekBars(waterR.week, waterR.target, 'avg ' + avgOf(waterR.week),
            function (v) { return v + (v === 1 ? ' glass' : ' glasses'); }) + '</div>';

        var stats = '';
        if (key === 'fitness') {
          var steps = cycleSum(wk.steps, t.steps);
          stats = statTile('Sessions', sess.fitness.done + '/' + sess.fitness.target, 'this cycle') +
            statTile('Cancelled', String(sess.fitness.cancelled || 0), 'this cycle') +
            statTile('Steps', fmtK(steps), 'of ' + fmtK((t.stepsTarget || 0) * client.day) + ' target');
        } else if (key === 'yoga') {
          stats = statTile('Sessions', sess.yoga.done + '/' + sess.yoga.target, 'this cycle') +
            statTile('Cancelled', String(sess.yoga.cancelled || 0), 'this cycle') +
            statTile('Review', client.day >= HV.reviewDay() ? 'today' : 'day ' + HV.reviewDay(),
              client.day >= HV.reviewDay() ? 'your level review' : (HV.reviewDay() - client.day) + ' days away');
        } else if (key === 'culture') {
          var ph = client.culturePhotos;
          /* the denominator is the resolver's daily target × days elapsed —
             the legacy header multiplied here could disagree with every daily
             number the panel shows */
          var nt = HV.nutTargetsFor(client, client.day);
          stats = statTile('Photos', ph.uploaded + '/' + ph.of, 'min ' + ph.min + ' needed') +
            statTile('On plan', client.compliance == null ? '—' : client.compliance + '%', 'meals on plan') +
            statTile('Calories', client.cycleKcal ? fmtK(client.cycleKcal) : '—',
              (client.cycleKcal && nt) ? 'of ' + fmtK(nt.kcal * client.day) + ' planned' : 'kcal this cycle');
        } else {
          var water = cycleSum(wk.water, t.waterDone);
          var arr = wk.sleepPct || [];
          var n = Math.max(0, Math.min(client.day - 1, arr.length));
          var sum = t.sleepPct || 0, cnt = 1;
          for (var i = arr.length - n; i < arr.length; i++) { sum += arr[i]; cnt++; }
          stats = statTile('Mind', sess.mind.done + '/' + sess.mind.target, 'this cycle') +
            statTile('Water', String(water), 'of ' + (t.waterTarget || 8) * client.day + ' glasses') +
            statTile('Sleep', Math.round(sum / cnt) + '%', '7–8 h band');
        }
        return strips +
          '<div class="card" style="margin-top:var(--s4)">' +
          '<div class="row"><span class="card-title grow">Cycle ' + client.cycle + ' report · ' + HV.esc(p.name) + ' L' + lvl + '</span>' +
          HV.ui.pill(HV.copy.dayOf(client), 'info') + '</div>' +
          '<div class="grid3 tight" style="margin-top:var(--s3)">' + stats + '</div>' +
          '<p class="audit" style="margin:var(--s3) 0 0">Calculated from what you log — every photo and tap counts.</p>' +
          '</div>' +
          (client.cycleHistory && client.cycleHistory.length
            ? '<p class="sub" style="margin:var(--s2) 0 0">Past cycle reports live on My Plan — the cycle tabs at the top.</p>'
            : '');
      }

      /* ── 3 · Level-up criteria — what qualifies the next level ── */
      function levelupHtml() {
        var lu = HV.levelup(client, key);
        if (!lu) {
          return '<div class="notice">Levels switch on after your observation window — then this page shows exactly what qualifies ' + HV.esc(p.name) + ' for its next level.</div>';
        }
        var rows = lu.rows.map(function (r) {
          var pill = r.met === true ? HV.ui.pill('done', 'ok')
            : r.met === false ? HV.ui.pill('keep going', 'warn')
            : HV.ui.pill('at review', 'neutral');
          return '<div class="trow"><span class="grow"><b>' + HV.esc(r.label) + '</b>' +
            '<small class="num">' + HV.esc(r.small) + '</small></span>' + pill + '</div>';
        }).join('');
        return '<div class="card">' +
          '<div class="row"><span class="card-title grow">Level-up checklist · ' + HV.esc(p.name) + ' L' + lu.level + '</span>' +
          HV.ui.pill(lu.trackLabel, 'neutral') + '</div>' +
          '<div class="list" style="margin-top:var(--s2)">' + rows + '</div>' +
          (lu.goals.length
            ? '<div class="card-title" style="margin-top:var(--s3)">Goals for this level</div>' +
              '<div>' + lu.goals.map(function (goal) { return '<span class="chip">' + HV.esc(goal) + '</span>'; }).join('') + '</div>'
            : '') +
          '<p class="sub" style="margin:var(--s3) 0 0">' + HV.esc(lu.note) + '</p>' +
          '</div>';
      }

      function draw() {
        el.innerHTML =
          SFB_CSS +
          back +
          '<div class="h1-row ' + p.cls + '"><span class="h1 row" style="gap:var(--s3)">' + HV.ui.plate(key, 'lg') + HV.esc(p.name) + '</span>' +
          HV.ui.pill('Level ' + lvl, 'info') + '</div>' +
          '<p class="sub" style="margin:0">' + HV.esc(p.sub) + '</p>' +
          '<div class="tabs" style="margin-top:var(--s2)">' + TABS.map(function (t2) {
            return '<button data-tab="' + t2.id + '" class="' + (tab === t2.id ? 'on' : '') + '">' + t2.label + '</button>';
          }).join('') + '</div>' +
          (tab === 'calendar' ? calendarHtml() : tab === 'progress' ? progressHtml() : levelupHtml());

        el.querySelector('[data-back]').addEventListener('click', function () { HV.go('#/plan'); });
        el.querySelectorAll('[data-tab]').forEach(function (b) {
          b.addEventListener('click', function () { tab = b.dataset.tab; draw(); });
        });

        /* the Progress tab's weekBars strips are the same instrument as
           Trackers, so they need the same two behaviours: opened at today
           (the right end), pinned there through a width change, and every
           bar tappable for its exact reading */
        el.querySelectorAll('.tstrip').forEach(function (s) {
          var pinToToday = function () { s.scrollLeft = s.scrollWidth; };
          pinToToday();
          new ResizeObserver(pinToToday).observe(s);
        });
        el.querySelectorAll('.tday').forEach(function (b) {
          b.addEventListener('click', function () { HV.toast(b.dataset.say); });
        });
      }

      draw();
    }
  });
})();
