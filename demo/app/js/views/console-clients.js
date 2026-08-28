/* HAALVING console — Clients: one three-panel workspace for the whole relationship.
   Panel 1 is the rail (your roster, plus the arrivals board for the roles that own
   onboarding), panel 2 is the client — header, six tabs, the client-visible thread —
   and panel 3 is the team scratch pad (Teams / Assistant / Automations).
   Client-visible and team-only are separate PANELS, never interleaved styles, so
   mis-sending an internal note to a client stays implausible by design.
   The open client and the open tab live in the URL (#/clients/:cid/:tab), so Back
   works, deep links land, and the sidebar's Clients badge stays honest.
   Also exports HV.consoleui — the shared roster instruments console-digest.js reads. */
(function () {
  'use strict';

  var TABS = [
    /* The order TJ's client asked for, with Trackers and Notes kept and moved
       to the end. `docs` keeps its ID even though its LABEL is now Documents:
       the id sits in the route (#/clients/:cid/docs), so renaming it would
       break every existing deep link and bookmark. */
    { id: 'overview', label: 'Overview' },
    { id: 'logs',     label: 'Logs' },
    { id: 'circle',   label: 'Circle' },
    { id: 'plan',     label: 'Plan' },
    { id: 'emotions', label: 'Emotions' },
    { id: 'docs',     label: 'Documents' },
    { id: 'meetings', label: 'Meetings' },
    { id: 'trackers', label: 'Trackers' },
    { id: 'notes',    label: 'Notes' },
  ];
  /* status filters live beside the plan filters on the rail — the same row,
     because "who is live" and "which plan" are both ways of narrowing the
     same list */
  var STATUS_FILTERS = [
    { k: 'active',   label: 'Active' },
    { k: 'paused',   label: 'Paused' },
    { k: 'inactive', label: 'Inactive' },
  ];
  /* the plan filters are DERIVED from HV.PLANS, not typed out — adding or
     retiring a plan must never leave a stale chip behind on this rail */
  function planFilters() {
    return [{ k: 'all', label: 'All' }]
      .concat(Object.keys(HV.PLANS).map(function (k) {
        return { k: k, label: HV.PLANS[k].name.replace(/^HAALVING /, '') };
      }))
      .concat(STATUS_FILTERS)
      .concat([{ k: 'risk', label: 'High risk' }]);
  }
  var SESSION_COLOR = { fitness: 'fitness', yoga: 'yoga', mind: 'wellness' };
  var SESSION_NAME = { fitness: 'Fitness', yoga: 'Yoga', mind: 'Mind' };
  var SVAYAM_SUB = 'AI-guided — no human pod · safety escalations route to Ops';

  /* in-memory UI state — demo session only, deliberately not persisted.
     (The pad's own decisions DO persist: they live in HV.store.padSug/padAuto.) */
  var railTab = 'clients';      /* clients | onboarding */
  var railQuery = '';
  var railFilter = 'all';       /* all | black | grey | white | risk */
  var padTab = 'team';          /* team | assist | auto */
  var lastPadCid = null;

  function first(name) { return String(name || '').split(' ')[0]; }
  function circleMsgs(cid) { return HV.store.circles[cid] || []; }

  /* ---------------- shared instruments ---------------- */

  function levelBadges(c) {
    return Object.keys(HV.PILLARS).map(function (k) {
      var p = HV.PILLARS[k];
      return '<span class="' + p.cls + ' num" style="display:inline-flex; align-items:center; gap:var(--s1); font-size:var(--t-micro); font-weight:600; color:var(--pcd)" title="' + HV.esc(p.name) + ' · Level ' + c.levels[k] + '">' +
        '<span class="pdot"></span>L' + c.levels[k] + '</span>';
    }).join('');
  }

  function sessionRings(c, size) {
    return Object.keys(c.sessions).map(function (k) {
      var s = c.sessions[k];
      var pct = s.target ? (s.done / s.target) * 100 : 0;
      return HV.ui.ring(pct, SESSION_COLOR[k] || 'brand', s.done + '/' + s.target, size || 'sm');
    }).join('');
  }

  /* the 7-level HAALVING Index glimpse — client-journey's math, console-side.
     Per pillar: whole levels cleared plus this cycle's progress across the
     current band.

     No ring is drawn as "closed" (TJ, 16 Aug: the headline level is retired).
     A closed ring could only ever mean "every pillar has cleared this level",
     which is the lowest-pillar rule wearing a different coat — and pillars now
     progress independently. Each pillar's own level rides its own axis mark,
     which is the whole reading. */
  function headerIndex(c) {
    function pct(done, target) { return target ? Math.min(100, Math.round(done / target * 100)) : 0; }
    var s = c.sessions;
    var within = {
      fitness: pct(s.fitness.done, s.fitness.target),
      culture: c.compliance || 0,
      yoga: pct(s.yoga.done, s.yoga.target),
      wellness: pct(s.mind.done, s.mind.target),
    };
    var vals = {}, marks = {}, top = HV.levels();
    Object.keys(HV.PILLARS).forEach(function (k) {
      var lv = Math.max(1, Math.min(top, Number(c.levels[k]) || 1));
      vals[k] = Math.min(100, (lv - 1 + Math.min(100, within[k]) / 100) / top * 100);
      marks[k] = 'L' + lv;
    });
    return HV.ui.index(vals, { size: 'sm', rings: top, marks: marks });
  }

  /* ---------------- HV.consoleui — shared roster instruments ----------------
     Consumers (console-digest.js) call these inside render() only. Script tag
     order doesn't guarantee this file parses first — but every render() fires
     after all scripts have loaded, so HV.consoleui is always set by then.
     Same load-order contract as HV.chatui in console-circles.js. */
  /* setFilter lets another view (the Home dashboard's roster tiles) open this
     rail already narrowed. It is a setter rather than a route because
     '#/clients/status/active' would parse as client id 'status', tab
     'active' — the route shape is #/clients/:cid/:tab and cannot carry it. */
  HV.consoleui = { sessionRings: sessionRings, levelBadges: levelBadges, headerIndex: headerIndex,
    setFilter: function (k) { railFilter = k || 'all'; railTab = 'clients'; } };

  function riskPill(risk) {
    if (risk === 'high') return HV.ui.pill('Extra care', 'bad');
    if (risk === 'medium') return HV.ui.pill('Gentle watch', 'warn');
    return '';
  }

  /* plan chip — Poorna is the full-pod plan; Svayam surfaces where the AI leads
     and names any human coaches the client has added on top of it */
  function planChip(c) {
    if (c.plan === 'svayam') {
      var humans = (c.humanPillars || []).map(function (k) {
        return HV.PILLARS[k] ? HV.PILLARS[k].name : k;
      }).join(' + ');
      /* a Svayam client who has added no coaches yet — say so, not "AI + human " */
      return HV.ui.pill(humans ? 'Svayam · AI + human ' + humans : 'Svayam · AI-led · coaches by choice', 'info');
    }
    return HV.ui.pill('Poorna', 'neutral');
  }

  /* ================= client 360 · this wave's additions =================
     Emotions chart, celebration wishes, goal + onboarding + sessions cards,
     the pod-wide lab summary, and the pod assign sheet. One CSS block,
     tokens only, everything prefixed .c360-. */

  var C360_CSS = '<style>' +
    /* celebration chip in the header + the rail's small mark */
    '.c360-cel{display:inline-flex; align-items:center; gap:var(--s1); border:0; cursor:pointer;' +
      'font:inherit; font-size:var(--t-micro); font-weight:600; color:var(--amber); background:var(--amber-wash);' +
      'border-radius:var(--r-full); padding:var(--s1) var(--s3); white-space:nowrap}' +
    '.c360-cel svg{width:14px; height:14px; stroke:currentColor; fill:none; stroke-width:1.6; stroke-linecap:round; stroke-linejoin:round}' +
    '.c360-gift{display:inline-flex; margin-left:var(--s1); color:var(--amber); vertical-align:-2px}' +
    '.c360-gift svg{width:13px; height:13px; stroke:currentColor; fill:none; stroke-width:1.6; stroke-linecap:round; stroke-linejoin:round}' +
    /* the emotions chart */
    '.c360-chart{overflow-x:auto; margin-top:var(--s3); padding-bottom:var(--s1)}' +
    '.c360-main{display:block; height:auto}' +
    '.c360-grid{stroke:var(--line); stroke-width:1}' +
    '.c360-tick{stroke:var(--line); stroke-width:1}' +
    '.c360-ax{fill:var(--ink-3); font-size:12px}' +
    '.c360-dl{fill:var(--ink-2); font-size:12px; text-anchor:middle}' +
    '.c360-ln{fill:none; stroke:url(#c360g); stroke-width:2; stroke-linecap:round; stroke-linejoin:round}' +
    '.c360-pt{cursor:pointer}' +
    '.c360-pt:focus-visible{outline:2px solid var(--brand-2); outline-offset:2px; border-radius:var(--r-sm)}' +
    '.c360-face circle{fill:var(--card); stroke:currentColor; stroke-width:1.6}' +
    '.c360-face path{fill:none; stroke:currentColor; stroke-width:1.6; stroke-linecap:round; stroke-linejoin:round}' +
    '.c360-lv4{color:var(--ok)}.c360-lv3{color:var(--amber)}.c360-lv2{color:var(--amber)}.c360-lv1{color:var(--danger)}' +
    '.c360-mm{display:inline-flex; flex:none; width:28px; height:28px}' +
    '.c360-mm svg{width:100%; height:100%}' +
    /* label:value rows (onboarding answers) + the goal ledger table */
    '.c360-kv{display:flex; flex-direction:column; gap:2px; padding:var(--s2) 0}' +
    '.c360-kv + .c360-kv{border-top:1px solid var(--line)}' +
    '.c360-kv small{font-size:var(--t-micro); font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--ink-3)}' +
    '.c360-ledger{width:100%; border-collapse:collapse; margin-top:var(--s2); font-size:var(--t-sm)}' +
    '.c360-ledger th{text-align:left; font-size:var(--t-micro); font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--ink-3); padding:var(--s1) var(--s2) var(--s1) 0}' +
    '.c360-ledger td{padding:var(--s1) var(--s2) var(--s1) 0; border-top:1px solid var(--line)}' +
    /* team session notes nest under their session row */
    '.c360-tnote{display:flex; align-items:baseline; gap:var(--s2); padding-top:var(--s1); color:var(--ink-2)}' +
    /* delta chips on the lab summary */
    '.c360-d{display:inline-flex; align-items:center; gap:var(--s1)}' +
    '.c360-d.ok{color:var(--ok); background:var(--ok-wash); box-shadow:none}' +
    '.c360-d.bad{color:var(--danger); background:var(--danger-wash); box-shadow:none}' +
    /* the star input in the team-note sheet */
    '.c360-strow{display:flex; gap:var(--s2); margin:var(--s2) 0 var(--s3)}' +
    '.c360-strow button{border:0; background:none; cursor:pointer; padding:var(--s1); color:var(--line-strong)}' +
    '.c360-strow button svg{width:26px; height:26px; stroke:currentColor; stroke-width:1.4; fill:none}' +
    '.c360-strow button.on{color:var(--amber)}' +
    '.c360-strow button.on svg{fill:currentColor}' +
  '</style>';

  /* ---- celebrations: chips, the rail dot, the wishes sheet (R6) ---- */
  function celsFor(cid) {
    return HV.upcomingCelebrations(7).filter(function (x) { return x.clientId === cid; });
  }
  function wishKey(cid) { return cid + '-' + new Date().getFullYear(); }
  function celWhen(x) {
    if (x.inDays === 0) return 'today';
    if (x.inDays === 1) return 'tomorrow';
    if (x.inDays < 7) {
      var p = String(x.dateISO).split('-');
      return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(+p[0], +p[1] - 1, +p[2]).getDay()];
    }
    return 'in <span class="num">' + x.inDays + '</span> d';
  }
  function fmtDay(iso) {
    var p = String(iso || '').split('-');
    if (p.length < 3) return String(iso || '');
    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+p[1] - 1] + ' ' + +p[2];
  }

  function celChips(c) {
    var cels = celsFor(c.id);
    if (!cels.length) return '';
    var sent = (HV.store.wishes || {})[wishKey(c.id)];
    return cels.map(function (x) {
      return '<button class="c360-cel" data-c360-cel="' + HV.esc(x.kind) + '" title="Send wishes">' +
        HV.ui.icon('award') + (x.kind === 'birthday' ? 'Birthday' : 'Anniversary') + ' · ' + celWhen(x) + '</button>';
    }).join('') + (sent ? HV.ui.pill('Wishes sent', 'ok') : '');
  }

  function wishesSheet(c, kind) {
    var me = HV.me();
    var key = wishKey(c.id);
    var sent = (HV.store.wishes || {})[key];
    var cel = celsFor(c.id).find(function (x) { return x.kind === kind; }) || celsFor(c.id)[0];
    var word = kind === 'anniversary' ? 'anniversary' : 'birthday';
    var draft = kind === 'anniversary'
      ? 'Happy anniversary, ' + first(c.name) + ' — warm wishes from your whole care team. Enjoy the day together.'
      : 'Happy birthday, ' + first(c.name) + '! Your whole care team is cheering for you today.';
    HV.sheet(
      '<div class="h1">Send wishes</div>' +
      '<p class="sub">' + HV.esc(c.name) + '’s ' + word + (cel ? ' · ' + HV.esc(fmtDay(cel.dateISO)) : '') +
        '. The message lands in their app as an ordinary circle message, signed by you.</p>' +
      (sent ? '<div class="notice">Wishes already went out this year — sending again simply adds a second message to the thread.</div>' : '') +
      '<textarea class="input" id="c360-wish" rows="3" aria-label="Your wishes">' + HV.esc(draft) + '</textarea>' +
      '<button class="btn block" id="c360-wish-go">' + (sent ? 'Send again' : 'Send wishes') + '</button>' +
      '<button class="btn block ghost" id="c360-wish-x">Cancel</button>',
      function (sheet) {
        sheet.querySelector('#c360-wish-x').addEventListener('click', HV.closeSheet);
        sheet.querySelector('#c360-wish-go').addEventListener('click', function () {
          var v = sheet.querySelector('#c360-wish').value.trim();
          if (!v) { HV.toast('Write a line first.'); return; }
          HV.pushMsg(c.id, { fromId: me.id, kind: 'text', text: v });
          (HV.store.wishes = HV.store.wishes || {})[key] = HV.now();
          HV.save();
          HV.closeSheet();
          HV.refresh();
          HV.toast('Wishes sent — they land in ' + first(c.name) + '’s app.');
        });
      }
    );
  }

  /* ---- the Emotions tab: c.moodLog drawn as a day-by-day chart (R5) ----
     X: the most recent seven days that carry entries, one column each,
     subdivided by clock time (ticks at 6 am, noon, 6 pm). Y: mood as a
     level (happy 4 → angry 1). The line rides a green→amber→red gradient
     built from the status inks — mood is a status, never a pillar. */
  var MOOD_LEVEL = { happy: 4, drained: 3, sad: 2, angry: 1 };
  var MOOD_WORD = { happy: 'Happy', drained: 'Drained', sad: 'Sad', angry: 'Angry' };
  /* the arrival sheet's hairline faces in miniature — mouth up / flat /
     down / zigzag; drawn strokes, never emoji */
  var MOOD_FACE = {
    happy: '<circle cx="12" cy="12" r="8.5"/><path d="M9 10.1v.01M15 10.1v.01M8.8 14.1c.9 1.2 2 1.8 3.2 1.8s2.3-.6 3.2-1.8"/>',
    drained: '<circle cx="12" cy="12" r="8.5"/><path d="M8.1 10.6h2.3M13.6 10.6h2.3M9.4 15h5.2"/>',
    sad: '<circle cx="12" cy="12" r="8.5"/><path d="M9 10.1v.01M15 10.1v.01M8.8 15.9c.9-1.2 2-1.8 3.2-1.8s2.3.6 3.2 1.8"/>',
    angry: '<circle cx="12" cy="12" r="8.5"/><path d="M8.2 9.4l2.6 1M15.8 9.4l-2.6 1M9.7 12.4v.01M14.3 12.4v.01M8.6 15.8l1.7-1.1 1.7 1.1 1.7-1.1 1.7 1.1"/>',
  };
  function moodFace(mood) {
    return '<span class="c360-mm c360-face c360-lv' + (MOOD_LEVEL[mood] || 3) + '" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24">' + (MOOD_FACE[mood] || MOOD_FACE.drained) + '</svg></span>';
  }

  /* the chart's tap targets, rebuilt on every render — the index into this
     flattened list rides each point's [data-mpt] attribute */
  var emoPts = [];

  function emotionsHtml(c) {
    var log = (c.moodLog || []).slice().sort(function (a, b) {
      return (a.cy - b.cy) || (a.d - b.d) || (a.min - b.min);
    });
    if (!log.length) {
      emoPts = [];
      return HV.ui.empty('smile', 'No mood check-ins yet.',
        first(c.name) + '’s arrival moods chart here the moment the first one lands.');
    }
    var days = [], byKey = {};
    log.forEach(function (e) {
      var k = e.cy + '.' + e.d;
      if (!byKey[k]) { byKey[k] = { cy: e.cy, d: e.d, entries: [] }; days.push(byKey[k]); }
      byKey[k].entries.push(e);
    });
    days = days.slice(-7);

    var AX = 76, W = 108, TOP = 18, ROW = 34, PB = 34;
    var H = TOP + 3 * ROW + PB;
    var width = AX + days.length * W + 12;
    var yOf = function (mood) { return TOP + (4 - (MOOD_LEVEL[mood] || 3)) * ROW; };

    emoPts = [];
    var pts = [], faces = '', gridLines = '', ticks = '', dayLabels = '';

    var axis = ['happy', 'drained', 'sad', 'angry'].map(function (m) {
      return '<text class="c360-ax" x="' + (AX - 10) + '" y="' + (yOf(m) + 4) + '" text-anchor="end">' + MOOD_WORD[m] + '</text>';
    }).join('');

    days.forEach(function (dy, i) {
      var x0 = AX + i * W;
      gridLines += '<line class="c360-grid" x1="' + x0 + '" y1="' + (TOP - 8) + '" x2="' + x0 + '" y2="' + (TOP + 3 * ROW + 8) + '"/>';
      [0.25, 0.5, 0.75].forEach(function (f) {
        var tx = (x0 + f * W).toFixed(1);
        ticks += '<line class="c360-tick" x1="' + tx + '" y1="' + (TOP + 3 * ROW + 4) + '" x2="' + tx + '" y2="' + (TOP + 3 * ROW + 8) + '"/>';
      });
      dayLabels += '<text class="c360-dl num" x="' + (x0 + W / 2) + '" y="' + (H - 8) + '">C' + dy.cy + ' · D' + dy.d + '</text>';
      dy.entries.forEach(function (e) {
        var px = x0 + (Math.max(0, Math.min(1439, e.min || 0)) / 1440) * W;
        var py = yOf(e.mood);
        var idx = emoPts.length;
        emoPts.push(e);
        pts.push(px.toFixed(1) + ',' + py);
        faces += '<g class="c360-pt c360-face c360-lv' + (MOOD_LEVEL[e.mood] || 3) + '" data-mpt="' + idx + '" tabindex="0" role="button" ' +
          'aria-label="' + HV.esc((MOOD_WORD[e.mood] || e.mood) + ' · ' + HV.fmtTime(e.min) + ' · cycle ' + e.cy + ' day ' + e.d + (e.note ? ' · has note' : '')) + '" ' +
          'transform="translate(' + (px - 10).toFixed(1) + ',' + (py - 10) + ')">' +
          '<svg width="20" height="20" viewBox="0 0 24 24">' + (MOOD_FACE[e.mood] || MOOD_FACE.drained) + '</svg></g>';
      });
    });
    gridLines += '<line class="c360-grid" x1="' + (AX + days.length * W) + '" y1="' + (TOP - 8) + '" x2="' + (AX + days.length * W) + '" y2="' + (TOP + 3 * ROW + 8) + '"/>';

    var svg = '<svg class="c360-main" viewBox="0 0 ' + width + ' ' + H + '" style="width:100%; min-width:' + width + 'px" role="img" ' +
      'aria-label="Mood over the last ' + days.length + ' recorded days">' +
      '<defs><linearGradient id="c360g" x1="0" y1="' + TOP + '" x2="0" y2="' + (TOP + 3 * ROW) + '" gradientUnits="userSpaceOnUse">' +
        '<stop offset="0" style="stop-color:var(--ok)"/><stop offset=".5" style="stop-color:var(--amber)"/><stop offset="1" style="stop-color:var(--danger)"/>' +
      '</linearGradient></defs>' +
      gridLines + ticks + axis + dayLabels +
      (pts.length > 1 ? '<polyline class="c360-ln" points="' + pts.join(' ') + '"/>' : '') +
      faces +
    '</svg>';

    var noteRows = log.filter(function (e) { return e.note; }).reverse().map(function (e) {
      var idx = emoPts.indexOf(e);
      return '<div class="trow' + (idx >= 0 ? ' click' : '') + '"' +
        (idx >= 0 ? ' data-mpt="' + idx + '" role="button" tabindex="0"' : '') + '>' +
        moodFace(e.mood) +
        '<span class="grow"><b>' + HV.esc(MOOD_WORD[e.mood] || e.mood) + ' · <span class="num">' + HV.esc(HV.fmtTime(e.min)) + '</span></b>' +
        '<small>Cycle <span class="num">' + e.cy + '</span> · Day <span class="num">' + e.d + '</span> — ' + HV.esc(e.note) + '</small></span>' +
      '</div>';
    }).join('');

    return '<div class="card"><div class="card-title">Mood, day by day</div>' +
      '<p class="sub" style="margin:var(--s1) 0 0">Every arrival check-in, placed at its clock time — the small ticks mark 6 am, noon and 6 pm. Tap a face for the note behind it.</p>' +
      '<div class="c360-chart">' + svg + '</div>' +
      '<p class="audit" style="margin:0">Self-reported at arrival · times are ' + HV.esc(first(c.name)) + '’s own clock</p>' +
    '</div>' +
    (noteRows
      ? '<div class="sec-title">Notes behind the check-ins</div><div class="list">' + noteRows + '</div>'
      : '<p class="sub">No notes yet — faces without words still count.</p>');
  }

  function moodPointSheet(c, e) {
    HV.sheet(
      '<div class="h1">' + HV.esc(MOOD_WORD[e.mood] || e.mood) + '</div>' +
      '<div class="row" style="gap:var(--s3); margin:var(--s2) 0">' + moodFace(e.mood) +
        '<span class="grow sub">Cycle <span class="num">' + e.cy + '</span> · Day <span class="num">' + e.d +
        '</span> · <span class="num">' + HV.esc(HV.fmtTime(e.min)) + '</span></span></div>' +
      (e.note ? '<div class="notice">“' + HV.esc(e.note) + '”</div>'
        : '<p class="sub">No note came with this one — the face was the whole message.</p>') +
      '<p class="audit">Self-reported by ' + HV.esc(first(c.name)) + ' at the morning arrival</p>' +
      '<button class="btn block ghost" id="c360-mp-x">Close</button>',
      function (sheet) { sheet.querySelector('#c360-mp-x').addEventListener('click', HV.closeSheet); }
    );
  }

  /* ---- the care team card + the assign sheet (R1's heart) ----
     Every seat resolves through HV.staffFor, so an approved leave's cover
     shows here without special-casing; assigning rewrites the permanent
     seat and leaves an audit trail the pod can read. */
  var SEAT_ORDER = ['dietitian', 'fitness', 'yoga', 'mind'];
  var SUPPORT_SEATS = ['doctor', 'admin', 'opshead'];

  function careTeamCard(c) {
    var canAssign = HV.can('assignPod');
    var rows = SEAT_ORDER.map(function (k) {
      var u = HV.staffFor(c, k);
      var cov = HV.coverActive(c, k);
      var base = HV.staff((c.pod || {})[k]);
      var subBits = [HV.DEPTS[k]];
      if (u.ai) subBits.push('AI coach — no human seat filled');
      else if (u.level) subBits.push('L' + u.level);
      return '<div class="trow">' + HV.ui.avatar(u.name, 'sm') +
        '<span class="grow"><b>' + HV.esc(u.name) + '</b>' +
        '<small>' + HV.esc(subBits.join(' · ')) + '</small>' +
        (cov ? '<small class="audit">Covering ' + HV.esc(base.name) + ' until ' + HV.esc(fmtDay(cov.to)) + ' · approved leave</small>' : '') +
        '</span>' +
        (cov ? HV.ui.pill('Cover', 'info') : '') +
        (canAssign ? '<button class="btn sm ghost" data-c360-assign="' + HV.esc(k) + '">Assign</button>' : '') +
      '</div>';
    }).join('');
    var support = SUPPORT_SEATS.map(function (k) {
      var id = (c.pod || {})[k];
      if (!id) return '';
      var u = HV.staff(id);
      return '<span class="chip">' + HV.esc(u.name) + ' · ' + HV.esc((HV.roleDef(k) || {}).title || k) + '</span>';
    }).join('');
    return '<div class="card"><div class="card-title">Care team</div>' +
      (c.plan === 'svayam' && !(c.humanPillars || []).length
        ? '<p class="sub" style="margin:var(--s1) 0 0">' + HV.esc(SVAYAM_SUB) + '</p>' : '') +
      '<div class="list" style="margin-top:var(--s2)">' + rows + '</div>' +
      (support ? '<div style="margin-top:var(--s2)">' + support + '</div>' : '') +
      (canAssign
        ? '<p class="audit" style="margin:var(--s2) 0 0">Seats resolve cover-aware — an approved leave shows its cover until it lapses. Assign rewrites the permanent seat.</p>'
        : '<p class="audit" style="margin:var(--s2) 0 0">Seat changes are made by Ops or the department head.</p>') +
    '</div>';
  }

  function assignSeatSheet(c, roleKey) {
    var me = HV.me();
    var dept = HV.DEPTS[roleKey] || roleKey;
    var curId = (c.pod || {})[roleKey] || null;
    var cur = HV.staff(curId);
    var cov = HV.coverActive(c, roleKey);
    var today = HV.todayISO();
    var members = HV.deptMembers(roleKey);
    if (!members.length) { HV.toast('No one on the ' + dept + ' bench yet — hire in People & Access first.'); return; }
    function onLeaveToday(uid) {
      return (HV.store.leaves || []).some(function (l) {
        return l.staffId === uid && l.status === 'approved' && l.from <= today && today <= l.to;
      });
    }
    function seatCount(uid) {
      return HV.store.clients.filter(function (x) { return (x.pod || {})[roleKey] === uid; }).length;
    }
    var rows = members.map(function (u) {
      var n = seatCount(u.id);
      return '<label class="trow pslot"><input type="radio" name="c360-as" value="' + HV.esc(u.id) + '"' +
        (u.id === curId ? ' checked' : '') + '>' +
        HV.ui.avatar(u.name, 'sm') +
        '<span class="grow"><b>' + HV.esc(u.name) + '</b>' +
        '<small>' + HV.esc(u.role === 'hod' ? 'Head of Department · ' + dept : dept + ' coach') + '</small></span>' +
        HV.ui.pill('L' + (u.level || 2), u.level === 1 ? 'info' : 'neutral') +
        '<span class="pill neutral"><span class="num">' + n + '</span>&nbsp;' + (n === 1 ? 'client' : 'clients') + '</span>' +
        (onLeaveToday(u.id) ? HV.ui.pill('On leave today', 'warn') : '') +
        (u.id === curId ? HV.ui.pill('Current', 'ok') : '') +
      '</label>';
    }).join('');
    HV.sheet(
      '<div class="h1">' + HV.esc(dept) + ' seat · ' + HV.esc(c.name) + '</div>' +
      '<p class="sub">Held by ' + HV.esc(cur.name) + (cur.ai ? ' — no human assigned yet' : '') +
        '. The new coach gains ' + HV.esc(first(c.name)) + '’s thread, plan edits and meal SLAs the moment you confirm.</p>' +
      (cov ? '<div class="notice warn">' + HV.esc(HV.staff(cov.coverId).name) + ' covers this seat until ' +
        HV.esc(fmtDay(cov.to)) + ' (approved leave). Assigning changes the permanent seat — the cover still applies until it lapses.</div>' : '') +
      '<div class="list">' + rows + '</div>' +
      '<button class="btn block" id="c360-as-go">Confirm assignment</button>' +
      '<button class="btn block ghost" id="c360-as-x">Cancel</button>',
      function (sheet) {
        sheet.querySelector('#c360-as-x').addEventListener('click', HV.closeSheet);
        sheet.querySelector('#c360-as-go').addEventListener('click', function () {
          var sel = sheet.querySelector('input[name="c360-as"]:checked');
          if (!sel) { HV.toast('Pick a coach first.'); return; }
          if (sel.value === curId) { HV.toast(cur.name + ' already holds this seat.'); return; }
          var chosen = HV.staff(sel.value);
          c.pod = c.pod || {};
          c.pod[roleKey] = chosen.id;
          /* the audit trail: a pod-private note in the thread, and a notice
             to the coach who just gained the seat */
          HV.pushMsg(c.id, { fromId: me.id, kind: 'teamonly',
            text: 'Pod change · ' + dept + ' seat: ' + cur.name + ' → ' + chosen.name + ' — assigned by ' + me.name });
          HV.notice(chosen.id, 'task',
            'You now hold ' + c.name + '’s ' + dept + ' seat — assigned by ' + me.name, c.id);
          HV.save();
          HV.closeSheet();
          HV.refresh();
          HV.toast(chosen.name + ' now holds ' + first(c.name) + '’s ' + dept + ' seat.');
        });
      }
    );
  }

  /* ---- goal + onboarding cards (R16 / R19 / R12) ---- */
  var LEDGER_STATE = { ok: ['Achieved', 'ok'], cur: ['In play', 'info'], todo: ['Ahead', 'neutral'], miss: ['Missed', 'bad'] };
  function goalCard(c) {
    if (!c.goal && !c.purpose && !(c.goalLedger || []).length) return '';
    var ledger = (c.goalLedger || []).map(function (g) {
      var st = LEDGER_STATE[g.state] || [g.state || '—', 'neutral'];
      return '<tr><td class="num">L' + g.level + '</td><td>' + HV.esc(g.target || '—') + '</td>' +
        '<td class="num">' + HV.esc(g.result || '—') + '</td><td>' + HV.ui.pill(st[0], st[1]) + '</td></tr>';
    }).join('');
    return '<div class="card"><div class="card-title">Goal</div>' +
      (c.goal ? '<p style="margin:var(--s1) 0 0"><b>' + HV.esc(c.goal) + '</b></p>' : '') +
      (c.purpose ? '<p class="sub" style="margin:var(--s1) 0 0">“' + HV.esc(c.purpose) + '”</p>' : '') +
      (ledger ? '<div style="overflow-x:auto"><table class="c360-ledger">' +
        '<thead><tr><th>Level</th><th>Target</th><th>Result</th><th></th></tr></thead><tbody>' + ledger + '</tbody></table></div>' : '') +
      '<p class="audit" style="margin:var(--s2) 0 0">The ledger moves only at the Day-' + HV.reviewDay() + ' review — one level, one verdict.</p>' +
    '</div>';
  }

  var ASSESS_LABEL = { day: 'A typical weekday', truths: 'Weekly truths', flex: 'Forward fold', balance: 'One-leg balance' };
  function onboardingCard(c) {
    var a = c.assess || {};
    var keys = Object.keys(a);
    var body = keys.length
      ? keys.map(function (k) {
          var v = a[k];
          var val = (v && v.labels) ? v.labels.join(' · ') : String(v == null ? '—' : v);
          if (v && v.band) val += ' · band ' + v.band + '/4';
          return '<div class="c360-kv"><small>' + HV.esc(ASSESS_LABEL[k] || k) + '</small><b>' + HV.esc(val) + '</b></div>';
        }).join('')
      : '<p class="sub" style="margin:var(--s2) 0 0">Nothing filed yet — the assessment-lite writes its answers here when ' +
        HV.esc(first(c.name)) + ' completes it in their app.</p>';
    return '<div class="card"><div class="card-title">Onboarding answers</div>' + body +
      (keys.length ? '<p class="audit" style="margin:var(--s2) 0 0">Self-reported at the start assessment — the live assessment confirms the levels.</p>' : '') +
    '</div>';
  }

  /* ---- sessions + feedback card (R24, both sides) ----
     Rows come from the cycle calendar's done sessions; client stars from
     c.sessionFeedback, team reads from store.staffSessionNotes. Entries
     that don't line up with a calendar item still get their own row —
     recorded feedback must never vanish on a calendar mismatch. */
  function sessionsCard(c, me) {
    var rowMap = {}, rows = [];
    function rowFor(day, key, it) {
      var k = day + ':' + key;
      if (!rowMap[k]) {
        rowMap[k] = { day: day, key: key,
          it: it || { label: (SESSION_NAME[key] || key) + ' session', time: '', staffId: (c.pod || {})[key] } };
        rows.push(rowMap[k]);
      }
      return rowMap[k];
    }
    /* feedback arrives in either vocabulary — client-plan writes pillar keys
       ('wellness'), this card and the console write session keys ('mind') */
    function skey(k) { return { wellness: 'mind' }[k] || k; }
    HV.calendarFor(c).forEach(function (dy) {
      (dy.items || []).forEach(function (it) {
        var key = { fitness: 'fitness', yoga: 'yoga', wellness: 'mind' }[it.pillar];
        if (key && it.status === 'done') rowFor(dy.day, key, it);
      });
    });
    (c.sessionFeedback || []).forEach(function (f) { if (f.cy === c.cycle) rowFor(f.day, skey(f.key)); });
    (HV.store.staffSessionNotes || []).forEach(function (n) {
      if (n.clientId === c.id && n.cy === c.cycle) rowFor(n.day, skey(n.key));
    });
    /* filed session reports sit on the same rows: the report carries a (cy,
       day, pillar) snapshot precisely so this card needs no task lookup */
    (HV.store.sessionReports || []).forEach(function (r) {
      if (r.clientId === c.id && r.cy === c.cycle && r.pillar) rowFor(r.day, skey(r.pillar));
    });
    rows.sort(function (a, b) { return a.day - b.day; });

    var isPod = Object.keys(c.pod || {}).some(function (k) { return HV.staffFor(c, k).id === me.id; });
    var body = rows.length
      ? '<div class="list" style="margin-top:var(--s2)">' + rows.map(function (r) {
          var coach = HV.staff(r.it.staffId);
          var fb = (c.sessionFeedback || []).find(function (f) {
            return f.cy === c.cycle && f.day === r.day && skey(f.key) === r.key;
          });
          var notes = (HV.store.staffSessionNotes || []).filter(function (n) {
            return n.clientId === c.id && n.cy === c.cycle && n.day === r.day && skey(n.key) === r.key;
          });
          return '<div class="trow">' + pillarDot(SESSION_COLOR[r.key] || 'fitness') +
            '<span class="grow"><b>' + HV.esc(r.it.label) + '</b>' +
            '<small>Day <span class="num">' + r.day + '</span>' +
              (r.it.time ? ' · <span class="num">' + HV.esc(r.it.time) + '</span>' : '') +
              ' · ' + HV.esc(coach.name) + '</small>' +
            (fb
              ? '<small>' + HV.ui.stars(fb.stars) + (fb.note ? ' “' + HV.esc(fb.note) + '” — ' + HV.esc(first(c.name)) : ' — ' + HV.esc(first(c.name)) + '’s rating') + '</small>'
              : '<small class="sub">No client rating yet</small>') +
            notes.map(function (n) {
              return '<small class="c360-tnote">' + HV.ui.stars(n.stars) +
                '<span>' + HV.esc(n.summary) + ' — ' + HV.esc(HV.staff(n.byId).name) + '</span></small>';
            }).join('') +
            (HV.store.sessionReports || []).filter(function (rp) {
              return rp.clientId === c.id && rp.cy === c.cycle && rp.day === r.day &&
                skey(rp.pillar) === r.key;
            }).map(function (rp) {
              return '<small class="c360-tnote"><span>' +
                HV.ui.pill(HV.meetui.wentWord(rp.went), HV.meetui.wentTone(rp.went)) + ' ' +
                HV.esc(rp.note) +
                (rp.concern ? ' ' + HV.ui.pill('Concern', 'bad') + ' ' + HV.esc(rp.concern) : '') +
                (rp.next ? ' · next: ' + HV.esc(rp.next) : '') +
                ' — ' + HV.esc(HV.staff(rp.byId).name) + '</span></small>';
            }).join('') +
            '</span>' +
            (isPod ? '<button class="btn sm ghost" data-c360-snote="' + r.day + ':' + HV.esc(r.key) + '" data-c360-lbl="' + HV.esc(r.it.label) + '">Team note</button>' : '') +
          '</div>';
        }).join('') + '</div>'
      : '<p class="sub" style="margin:var(--s2) 0 0">No sessions completed yet this cycle.</p>';

    return '<div class="card"><div class="h1-row"><div class="card-title" style="margin:0">Sessions · cycle <span class="num">' + c.cycle + '</span></div>' +
      '<span class="row" style="gap:var(--s2)">' + sessionRings(c, 'sm') + '</span></div>' +
      body +
      '<p class="audit" style="margin:var(--s2) 0 0">Stars are ' + HV.esc(first(c.name)) + '’s own; team notes and session reports stay pod-side and feed the Day-' + HV.reviewDay() + ' review.</p>' +
    '</div>';
  }

  function staffNoteSheet(c, day, key, label) {
    var me = HV.me();
    var chosen = 0;
    var starBtns = [1, 2, 3, 4, 5].map(function (i) {
      return '<button type="button" data-c360-st="' + i + '" aria-label="' + i + ' of 5 stars">' + HV.ui.icon('star') + '</button>';
    }).join('');
    HV.sheet(
      '<div class="h1">Team note · ' + HV.esc(label) + '</div>' +
      '<p class="sub">' + HV.esc(c.name) + ' · cycle <span class="num">' + c.cycle + '</span> · day <span class="num">' + day + '</span>. ' +
        'Your read of the session — pod-only, never client-visible.</p>' +
      '<div class="c360-strow" role="radiogroup" aria-label="Session rating">' + starBtns + '</div>' +
      '<textarea class="input" id="c360-sn-t" rows="3" aria-label="Session summary" placeholder="How did it actually go?"></textarea>' +
      '<button class="btn block" id="c360-sn-go">Save note</button>' +
      '<button class="btn block ghost" id="c360-sn-x">Cancel</button>',
      function (sheet) {
        var row = sheet.querySelector('.c360-strow');
        row.addEventListener('click', function (e) {
          var b = e.target.closest('[data-c360-st]');
          if (!b) return;
          chosen = Number(b.dataset.c360St);
          row.querySelectorAll('button').forEach(function (x) {
            x.classList.toggle('on', Number(x.dataset.c360St) <= chosen);
          });
        });
        sheet.querySelector('#c360-sn-x').addEventListener('click', HV.closeSheet);
        sheet.querySelector('#c360-sn-go').addEventListener('click', function () {
          var v = sheet.querySelector('#c360-sn-t').value.trim();
          if (!chosen) { HV.toast('Pick the stars first — both parts are required.'); return; }
          if (!v) { HV.toast('Write the summary too — stars alone don’t brief the pod.'); return; }
          (HV.store.staffSessionNotes = HV.store.staffSessionNotes || []).push({
            clientId: c.id, byId: me.id, cy: c.cycle, day: day, key: key,
            stars: chosen, summary: v, ts: HV.now(),
          });
          HV.save();
          HV.closeSheet();
          HV.refresh();
          HV.toast('Noted — the pod sees it on the session and in the review pack.');
        });
      }
    );
  }

  /* ---- the pod-wide lab summary (R12 / R13 surface) ----
     Category counts from the LATEST stored report, headline deltas against
     the one before. Direction of "good" differs per marker, so the tone
     follows distance from the reference band, not the sign of the move. */
  var LAB_HEADLINE = [['hba1c', 'HbA1c'], ['ldl', 'LDL'], ['hscrp', 'hs-CRP'], ['fbs', 'Fasting glucose']];
  function labPanelCard(c) {
    var reps = HV.vitals.reportsFor(c.id);
    if (!reps.length) return '';
    var latest = reps[reps.length - 1];
    var prev = reps.length > 1 ? reps[reps.length - 2] : null;
    var sum = HV.vitals.summary(latest, c.sex);
    var cats = HV.vitals.grid(latest, c.sex).map(function (g) {
      return g.out
        ? '<span class="chip warn">' + HV.esc(g.cat.name) + ' · <span class="num">' + g.out + '</span> flagged</span>'
        : '<span class="chip">' + HV.esc(g.cat.name) + ' · clear</span>';
    }).join('');
    var deltas = !prev ? '' : LAB_HEADLINE.map(function (p) {
      var k = p[0];
      if (latest.values[k] == null || prev.values[k] == null) return '';
      var v = Number(latest.values[k]), pv = Number(prev.values[k]);
      var band = HV.vitals.band(k, c.sex);
      var dist = function (x) { return !band ? 0 : x < band.low ? band.low - x : x > band.high ? x - band.high : 0; };
      var tone = dist(v) < dist(pv) ? 'ok' : dist(v) > dist(pv) ? 'bad' : '';
      var diff = Math.round((v - pv) * 10) / 10;
      return '<span class="chip c360-d ' + tone + '"><b>' + HV.esc(p[1]) + '</b>' +
        '<span class="num">' + v + '</span>' +
        (diff ? HV.ui.icon(diff < 0 ? 'caretDown' : 'caretUp') + '<span class="num">' + Math.abs(diff) + '</span>'
              : '<span class="num">±0</span>') +
      '</span>';
    }).join('');
    return '<div class="card"><div class="card-title">Lab panel · latest report</div>' +
      '<p class="sub" style="margin:var(--s1) 0 0"><span class="num">' + sum.out + '</span> of <span class="num">' + sum.total +
        '</span> markers outside range · ' + HV.esc(latest.label || 'Report') + ', ' + HV.esc(fmtDay(latest.date)) +
        (prev ? ' · compared with ' + HV.esc(fmtDay(prev.date)) : '') + '</p>' +
      (deltas ? '<div style="margin-top:var(--s2)">' + deltas + '</div>' : '') +
      '<div style="margin-top:var(--s2)">' + cats + '</div>' +
      '<p class="audit" style="margin:var(--s2) 0 0">Summary view for the whole pod — the raw report stays behind the Doctor’s access.</p>' +
    '</div>';
  }

  /* Overview is the cover sheet, in the order TJ's client asked for:
     Profile, Goal, Team, Medical Details — then the programme's own cards and
     the recent-activity glance. Logs is the complete record behind it. */
  function overviewHtml(c) {
    var me = HV.me();
    return HV.clientRecord.profileHtml(c) +
      goalCard(c) +
      careTeamCard(c) +
      HV.clientRecord.medicalHtml(c) +
      sessionsCard(c, me) + onboardingCard(c) +
      '<div class="sec-title">Recent activity</div>' + timelineHtml(c);
  }

  /* one delegated listener for everything this wave added */
  function wireC360(el, c) {
    el.addEventListener('click', function (e) {
      var cel = e.target.closest('[data-c360-cel]');
      if (cel) { wishesSheet(c, cel.dataset.c360Cel); return; }
      var mp = e.target.closest('[data-mpt]');
      if (mp) {
        var pt = emoPts[Number(mp.dataset.mpt)];
        if (pt) moodPointSheet(c, pt);
        return;
      }
      var as = e.target.closest('[data-c360-assign]');
      if (as) { assignSeatSheet(c, as.dataset.c360Assign); return; }
      var sn = e.target.closest('[data-c360-snote]');
      if (sn) {
        var a = sn.dataset.c360Snote.split(':');
        staffNoteSheet(c, Number(a[0]), a[1], sn.dataset.c360Lbl || 'Session');
      }
    });
    /* chart points are SVG <g role="button"> — SVG nodes have no .click(),
       so Enter and Space open the sheet directly */
    el.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var g = e.target.closest ? e.target.closest('[data-mpt]') : null;
      if (!g) return;
      e.preventDefault();
      var pt = emoPts[Number(g.dataset.mpt)];
      if (pt) moodPointSheet(c, pt);
    });
  }

  /* ================= panel 1 · the rail ================= */

  /* unread rooms first, then by latest message recency — the same order the
     old Care Circles list used, because it is the order attention arrives in */
  /* a real exchange between people — a broadcast is a send, not a conversation */
  function convo(m) { return m.kind !== 'promo'; }

  function railSorted() {
    return HV.myClients().slice().sort(function (a, b) {
      var ua = HV.unread(a.id) > 0 ? 0 : 1;
      var ub = HV.unread(b.id) > 0 ? 0 : 1;
      if (ua !== ub) return ua - ub;
      /* recency ignores broadcasts: one send lands in every room at minsAgo 0
         and would flatten the whole rail to a tie, destroying the order
         attention actually arrived in */
      var la = circleMsgs(a.id).filter(convo), lb = circleMsgs(b.id).filter(convo);
      var ta = la.length ? la[la.length - 1].minsAgo : Infinity;
      var tb = lb.length ? lb[lb.length - 1].minsAgo : Infinity;
      return ta - tb;
    });
  }

  function railMatches(c) {
    var q = railQuery.trim().toLowerCase();
    if (q && String(c.name).toLowerCase().indexOf(q) === -1) return false;
    if (railFilter === 'risk') return c.risk === 'high';
    /* status and plan share the chip row, so the status keys are checked
       before falling through to a plan comparison */
    if (STATUS_FILTERS.some(function (s) { return s.k === railFilter; })) {
      return c.status === railFilter;
    }
    if (railFilter !== 'all') return c.plan === railFilter;
    return true;
  }

  function railRow(c, openCid) {
    var n = HV.unread(c.id);
    /* a quiet cue, not an alarm — high-risk rooms must be findable at a glance,
       steady rooms carry no colour at all */
    var risk = c.risk === 'high' ? ' style="border-left:3px solid var(--danger)"' : '';
    var on = c.id === openCid;
    /* a flagged room shows WHY on its second line — the red edge says look,
       riskWhy says at what. Cycle and day step aside; they are on the header
       one tap away, the evidence is not. */
    var line = c.risk === 'high' && c.riskWhy
      ? '<small class="cwwhy">' + HV.esc(c.riskWhy) + '</small>'
      : '<small>' + (c.observation
          ? 'Observation · Day <span class="num">' + c.day + '</span>'
          : 'Cycle <span class="num">' + c.cycle + '</span> · Day <span class="num">' + c.day + '</span>') + '</small>';
    return '<div class="trow click cwrow' + (on ? ' on' : '') + '"' + risk +
      ' data-cid="' + HV.esc(c.id) + '" role="button" tabindex="0"' + (on ? ' aria-current="true"' : '') + '>' +
      HV.ui.avatar(c.name) +
      '<span class="grow"><b>' + HV.esc(c.name) +
      (celsFor(c.id).length ? '<span class="c360-gift" title="Celebration this week" aria-label="Celebration this week">' + HV.ui.icon('award') + '</span>' : '') +
      '</b>' + line +
      '<span class="cwlv">' + levelBadges(c) + '</span></span>' +
      (n ? '<span class="pill info"><span class="num">' + n + '</span></span>' : '') +
    '</div>';
  }

  /* the onboarding rail, filtered by the same search box as the client rail.
     The row markup lives in one place (HV.onboarding.railRows) and takes the
     list to draw, so filtering here never forks the row grammar. */
  function obRailHtml(openId) {
    if (!HV.onboarding) return '';
    var q = railQuery.trim().toLowerCase();
    var list = HV.onboarding.rows();
    if (q) list = list.filter(function (p) { return String(p.name).toLowerCase().indexOf(q) !== -1; });
    if (q && !list.length) {
      return '<p class="sub" style="padding:var(--s4) var(--s2)">Nobody matches that search.</p>';
    }
    return HV.onboarding.railRows(openId, list);
  }

  function railListHtml(openCid) {
    var all = railSorted();
    if (!all.length) {
      return HV.ui.empty('leaf', 'No clients allocated to you yet.', 'Ops assigns your first pod from Onboarding.');
    }
    var rows = all.filter(railMatches);
    if (!rows.length) return '<p class="sub" style="padding:var(--s4) var(--s2)">Nothing matches that search or filter.</p>';
    return rows.map(function (c) { return railRow(c, openCid); }).join('');
  }

  /* the two rails, named for the state a person is in rather than the screen
     they came from (TJ, 16 Aug): everyone is either still walking in, or in.
     Finishing onboarding moves a row from the second list to the first. */
  function railHtml(openCid, incoming) {
    /* the route's one h1. With a client open the h1 moves into the header —
       the person you opened IS the page — so the rail drops it. */
    var head = openCid ? '' :
      '<div class="cwtop"><div class="kicker">YOUR PEOPLE</div><h1 class="h1">Clients</h1></div>';
    var tabs = '<div class="tabs cwrtabs">' +
      '<button data-rt="clients" class="' + (railTab === 'clients' ? 'on' : '') + '">Onboarded</button>' +
      (incoming
        ? '<button data-rt="onboarding" class="' + (railTab === 'onboarding' ? 'on' : '') + '">Onboarding' +
          (incoming.count && incoming.count()
            ? ' <span class="pill info"><span class="num">' + incoming.count() + '</span></span>' : '') + '</button>'
        : '') +
    '</div>';

    /* the onboarding rail is the SAME list geometry as the client rail — a
       search box, then rows — so the two tabs never read as two products */
    if (railTab === 'onboarding' && incoming) {
      return head + tabs +
        '<div class="cwsearch"><input class="input" id="cw-q" type="search" placeholder="Search arrivals" ' +
          'aria-label="Search arrivals" autocomplete="off" value="' + HV.esc(railQuery) + '"></div>' +
        '<div class="cwlist" id="cw-list">' + obRailHtml(openCid) + '</div>';
    }

    return head + tabs +
      '<div class="cwsearch"><input class="input" id="cw-q" type="search" placeholder="Search clients" aria-label="Search clients" autocomplete="off" value="' + HV.esc(railQuery) + '"></div>' +
      '<div class="tfil" role="group" aria-label="Filter clients">' +
        planFilters().map(function (f) {
          return '<button data-fil="' + f.k + '" class="' + (railFilter === f.k ? 'on' : '') + '"' +
            (railFilter === f.k ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>' + HV.esc(f.label) + '</button>';
        }).join('') +
      '</div>' +
      '<div class="cwlist" id="cw-list">' + railListHtml(openCid) + '</div>';
  }

  /* ================= panel 2 · tab bodies ================= */

  /* ---- Overview: the merged timeline ---- */
  function fromLabel(m, c) {
    if (m.fromId === 'client') return { name: c.name, role: 'Client' };
    if (m.fromId === 'ai') {
      if (m.kind === 'teamonly') return { name: 'Copilot', role: 'AI · team-side only' };
      return { name: HV.staff('ai').name, role: 'AI Coach · client-visible' };
    }
    var s = HV.staff(m.fromId);
    return s ? { name: s.name, role: (HV.roleDef(s.role) || {}).title || s.role } : { name: 'Team', role: '' };
  }

  function mealRow(m) {
    var status;
    if (m.final) status = HV.ui.stars(m.final.stars);
    else if (m.slaMin != null && m.slaMin < 0) status = HV.ui.pill('SLA breached · Ops notified', 'bad');
    else if (m.slaMin != null) status = HV.ui.pill('Awaiting rating · SLA ' + m.slaMin + ' min', 'warn');
    else status = HV.ui.pill('Awaiting rating', 'warn');
    return '<div class="trow">' + HV.ui.mealArt(m, 'sm') +
      '<div class="grow"><b>' + HV.esc(m.slot) + ' logged</b>' +
      '<small>' + HV.esc(m.dishes.join(' · ')) + ' · felt “' + HV.esc(m.fullness) + '”</small></div>' +
      status +
      '<small class="num" style="flex:none">' + HV.ago(m.capturedMinsAgo) + '</small></div>';
  }

  function timelineHtml(c) {
    var evs = [];
    circleMsgs(c.id).forEach(function (m) {
      if (m.kind === 'meal') return; /* the meal itself renders as a richer event below */
      evs.push({ mins: m.minsAgo, msg: m });
    });
    HV.store.meals.forEach(function (m) {
      if (m.clientId === c.id) evs.push({ mins: m.capturedMinsAgo, meal: m });
    });
    evs.sort(function (a, b) { return a.mins - b.mins; });

    if (!evs.length) {
      return HV.ui.empty('leaf', 'Nothing logged yet — the timeline fills as ' +
        first(c.name) + ' lives their days.');
    }

    var rows = evs.map(function (ev) {
      if (ev.meal) return mealRow(ev.meal);
      var m = ev.msg;
      var f = fromLabel(m, c);
      if (m.kind === 'teamonly') {
        return '<div class="teamonly"><span class="lbl">' + HV.ui.icon('lock') + ' Team only · never client-visible — ' + HV.esc(f.name) + '</span>' +
          HV.esc(m.text) +
          '<div class="audit" style="margin-top:var(--s1)">' + HV.ago(ev.mins) + '</div></div>';
      }
      if (m.kind === 'doc') {
        /* an approved artifact delivered into the thread — attachment-flavoured, not a bubble */
        return '<div class="trow">' + HV.ui.iconTile('doc', 'sm') +
          '<div class="grow"><b>' + HV.esc(f.name) + '</b> <span class="sub">· ' + HV.esc(f.role) + '</span><br>' +
          HV.esc(m.text) + '</div>' +
          '<small class="num" style="flex:none">' + HV.ago(ev.mins) + '</small></div>';
      }
      if (m.kind === 'promo') {
        /* a Community announcement, not something this client was told
           personally — say so, or it reads as a coach's message */
        return '<div class="trow">' + HV.ui.iconTile(m.notice ? 'bell' : 'send', 'sm') +
          '<div class="grow"><b>' + HV.esc(m.title || 'Announcement') + '</b> ' +
          HV.ui.pill(m.notice ? 'Service notice' : 'Announcement', m.notice ? 'warn' : 'info') +
          '<br>' + HV.esc(m.text || '') +
          '<div class="audit" style="margin-top:var(--s1)">Broadcast from Community by ' +
          HV.esc(HV.staff(m.fromId).name) + '</div></div>' +
          '<small class="num" style="flex:none">' + HV.ago(ev.mins) + '</small></div>';
      }
      var prefix = m.kind === 'card' ? HV.ui.pill('Card', 'info') + ' ' : '';
      return '<div class="trow">' + HV.ui.avatar(f.name, 'sm') +
        '<div class="grow"><b>' + HV.esc(f.name) + '</b> <span class="sub">· ' + HV.esc(f.role) + '</span><br>' +
        prefix + HV.esc(m.text) + '</div>' +
        '<small class="num" style="flex:none">' + HV.ago(ev.mins) + '</small></div>';
    }).join('');

    return '<div class="list">' + rows + '</div>' +
      '<p class="audit">Any client-logged datum appears here within 10 s · amber items are the internal thread (CC-08) — clients never see them</p>';
  }

  /* ---- Trackers ---- */
  function trackersHtml(c) {
    var t = c.trackers;

    var obs = '';
    if (c.observation) {
      /* derived from the record, not asserted — a freshly onboarded client has
         collected nothing yet, and the console must not claim otherwise */
      var got = (c.culturePhotos && c.culturePhotos.uploaded) || 0;
      var done = got ? HV.ui.pill('Done', 'ok') : HV.ui.pill('Awaited', 'neutral');
      obs = '<div class="card"><div class="card-title">Observation checklist · Days 1–5 collections</div>' +
        '<div class="list" style="margin-top:var(--s2)">' +
          '<div class="row">' + HV.ui.iconTile('camera', 'sm') + '<span class="grow">Meal photos</span><span class="pill info"><span class="num">' + got + ' / 10</span>&nbsp;received</span></div>' +
          '<div class="row">' + HV.ui.iconTile('scale', 'sm') + '<span class="grow">InBody scan</span>' + done + '</div>' +
          '<div class="row">' + HV.ui.iconTile('walk', 'sm') + '<span class="grow">Movement self-rating</span>' + done + '</div>' +
        '</div>' +
        '<p class="sub" style="margin:var(--s2) 0 0">We learn ' + HV.esc(first(c.name)) + '’s normal before we change it — no scores or ratings shown yet.</p>' +
      '</div>';
    }

    var comp = c.compliance == null
      ? '<div class="stat"><div class="k">Compliance</div><div class="v">—</div><div class="sub">not scored during observation</div></div>'
      : '<div class="stat"><div class="k">Compliance</div><div class="v num ' + (c.compliance >= 80 ? 'ok' : '') + '">' + c.compliance + '%</div><div class="sub">meals · sessions · trackers</div></div>';

    return obs +
      '<div class="grid3">' +
        '<div class="stat"><div class="k">Water</div><div class="v num">' + t.waterDone + ' / ' + t.waterTarget + '</div><div class="sub">glasses today</div></div>' +
        '<div class="stat"><div class="k">Steps</div><div class="v num">' + t.steps.toLocaleString('en-IN') + '</div><div class="sub">of <span class="num">' + t.stepsTarget.toLocaleString('en-IN') + '</span> target</div></div>' +
        '<div class="stat"><div class="k">Sleep</div><div class="v num">' + HV.esc(t.sleep) + '</div><div class="sub">' + (t.sleepPct ? '<span class="num">' + t.sleepPct + '</span>% of need' : 'no sync yet') + '</div></div>' +
        '<div class="stat"><div class="k">Meals logged</div><div class="v num">' + t.mealsLogged + ' / ' + t.mealsTarget + '</div><div class="sub">today</div></div>' +
        comp +
      '</div>' +
      '<div class="card"><div class="k">Sessions this cycle</div>' +
        '<div class="row" style="gap:var(--s5); margin-top:var(--s2); flex-wrap:wrap">' +
          Object.keys(c.sessions).map(function (k) {
            var s = c.sessions[k];
            return '<div class="row" style="gap:var(--s2)">' +
              HV.ui.ring(s.target ? (s.done / s.target) * 100 : 0, SESSION_COLOR[k] || 'brand', s.done + '/' + s.target) +
              '<span class="sub">' + (SESSION_NAME[k] || k) + '</span></div>';
          }).join('') +
        '</div>' +
        '<p class="audit" style="margin:var(--s2) 0 0">These rings equal the numbers the level-review engine uses — one source of truth.</p>' +
      '</div>';
  }

  /* ---- Docs (RBAC core: raw = Doctor only; the lab SUMMARY is pod-wide) ---- */
  function documentsHtml(c) {
    var docs = HV.store.documents.filter(function (d) { return d.clientId === c.id; });
    var lab = labPanelCard(c);

    if (HV.can('rawRecords')) {
      if (!docs.length) return lab + HV.ui.empty('doc', 'No documents on file yet.');
      return lab + '<div class="list">' + docs.map(function (d) {
        return '<div class="trow">' + HV.ui.iconTile('doc', 'sm') +
          '<div class="grow"><b>' + HV.esc(d.name) + '</b><small>' + HV.esc(d.type) + ' · ' + HV.esc(d.date) + '</small></div>' +
          (d.summary === 'ready' ? HV.ui.pill('Summary signed', 'ok') : HV.ui.pill('Summary pending', 'warn')) +
          '<button class="btn sm ghost" data-raw="' + HV.esc(d.id) + '">Open raw (access logged)</button></div>';
      }).join('') + '</div>' +
      '<p class="audit">Raw medical records are Doctor-only — every open is written to the audit trail</p>';
    }

    var sums = docs.filter(function (d) { return HV.store.healthSummaries[d.id]; });
    var cards = sums.map(function (d) {
      var s = HV.store.healthSummaries[d.id];
      var signer = HV.staff(s.signedBy);
      return '<div class="card"><div class="card-title">Health Summary · signed by ' + HV.esc(signer ? signer.name : 'Doctor') + '</div>' +
        '<div class="sub">' + HV.esc(d.name) + ' · ' + HV.esc(d.date) + '</div>' +
        '<div style="margin-top:var(--s2)">' +
          s.conditions.map(function (x) { return '<span class="chip">' + HV.esc(x) + '</span>'; }).join('') +
          s.flags.map(function (x) { return '<span class="chip" style="color:var(--amber); background:var(--amber-wash); box-shadow:none">' + HV.esc(x) + '</span>'; }).join('') +
          s.metrics.map(function (x) { return '<span class="chip num">' + HV.esc(x) + '</span>'; }).join('') +
        '</div></div>';
    }).join('');

    return lab + (cards || HV.ui.empty('doc', 'No signed health summaries yet.')) +
      '<div class="notice">Raw records: Doctor only. Trainers never open raw medical records — the screen for it doesn’t exist.</div>';
  }

  /* ---- Notes ---- */
  function notesHtml(c) {
    return '<div class="card"><div class="k">Pod notes</div>' +
      '<p class="sub" style="margin:var(--s1) 0 var(--s2)">Private to the care pod — ' + HV.esc(first(c.name)) + ' never sees these.</p>' +
      '<textarea class="input" id="cw-note" rows="5" aria-label="Add a note" placeholder="Context the next specialist should know…">' + HV.esc(c.notes || '') + '</textarea>' +
      '<div class="row" style="margin-top:var(--s2)"><button class="btn sm" id="cw-note-save">Save note</button></div></div>';
  }

  /* ================= panel 2 · the Plan tab =================
     A client's plan is now FIVE plans (TJ, 17 Aug), one per pillar, each
     assigned by the coach who owns that pillar:

       clientPlans[cid] = {
         culture:  { templateId, modified, assignedBy, overrides:{ <day>:{slots} }, log },
         fitness: {...}, yoga: {...}, wellness: {...}, motivation: {...} }

     Any pillar may be absent, and that is an ordinary state — it means that
     pillar has nothing on this client's calendar yet, not that something is
     broken. Override keys are a plain day number: a template is one level is
     one cycle, so the old 'cycle.day' compound had nothing left to say.

     A day is the template's day UNLESS an override replaces its slots, and
     effectiveDay() is the only place that decision is made — so the day grid,
     the slot list, the editor and save-as-template can never disagree.

     A slot's options are OR-groups of AND-items: [[idli, chutney], [cheela]]
     reads "Option A: Idli + Chutney or Option B: Cheela". Exactly one level
     deep, deliberately — a coach can express alternatives without the plan
     turning into a programming language. */

  var ROLE_PILLAR = { dietitian: 'culture', fitness: 'fitness', yoga: 'yoga', mind: 'wellness' };
  /* the pillars that run as a SESSION at an hour — Nutrition keeps a time per
     meal slot, which is a different question and not one number */
  var SESSION_P = ['fitness', 'yoga', 'wellness'];
  /* which pillar and day the coach is looking at — in-memory like the rail's
     filters. Reset when another client opens AND when another PERSON does:
     the opening pillar is the viewer's own seat, so leaving one user's choice
     lying around means a dietitian opens on somebody else's pillar and reads
     their own client as read-only. */
  var planCid = null, planViewer = null, planPillar = null, planDay = null;

  /* The chain a template sign-off walks: Operations Head, then Super User.
     HV.store.chains is a reference catalogue core.js refills only when the key
     is ABSENT, so adding one key here survives every reload — and data.js, the
     seed, stays untouched. */
  function ensureTemplateChain() {
    var ch = HV.store.chains = HV.store.chains || {};
    if (!ch.template) { ch.template = [{ role: 'opshead' }, { role: 'core' }]; HV.save(); }
  }

  function planTemplate(id) {
    return (HV.store.templates || []).find(function (t) { return t.id === id; });
  }
  /* the whole per-pillar bundle for a client, and one pillar out of it */
  function planFor(cid) { return (HV.store.clientPlans || {})[cid] || null; }
  function assignFor(cid, pillar) { return (planFor(cid) || {})[pillar] || null; }
  function assignedPillars(cid) {
    var pl = planFor(cid) || {};
    return HV.TPL_PILLARS.filter(function (k) { return !!pl[k]; });
  }
  function dayKeys(t) {
    return Object.keys((t && t.days) || {}).map(Number).sort(function (a, b) { return a - b; });
  }
  /* the category's own name, from the one list that holds it. Capitalising the
     raw key printed "Athlete" here while the Catalog printed "athlete" for the
     same category — two spellings of one thing, from two different rules. */
  function trackWord(tr) { return HV.trackLabel(tr); }

  function itemName(pillar, id) {
    var lib = (HV.store.catalog && HV.store.catalog[pillar]) || [];
    var it = lib.find(function (x) { return x.id === id; });
    return it ? it.name : id;
  }

  /* the AND/OR line, the plan's whole grammar in one sentence. `pillar` is
     passed in now rather than read off the slot: a template belongs to one
     pillar, so the slot no longer has to carry the answer itself — though it
     still does, and is used as the fallback for anything older. */
  function optionsLine(slot, pillar) {
    var p = pillar || slot.pillar;
    return (slot.options || []).map(function (grp, i) {
      return (slot.options.length > 1 ? '<b>Option ' + String.fromCharCode(65 + i) + ':</b> ' : '') +
        grp.map(function (e) {
          var x = HV.optX(e);
          return HV.esc(itemName(p, HV.optId(e))) + (x > 1 ? ' <span class="num">×' + x + '</span>' : '');
        }).join(' + ');
    }).join(' <span class="cwor">or</span> ');
  }

  /* one pillar's day for this client: the coach's override wins, else the
     assigned template's day. Day keys are a plain number now — one template is
     one level is one cycle, so the old 'cycle.day' compound said nothing. */
  function effectiveDay(assign, t, d) {
    var tplDay = t && t.days && t.days[d];
    var o = (assign.overrides || {})[d];
    if (o && o.slots) return Object.assign({}, tplDay || {}, { slots: o.slots });
    return tplDay || null;
  }
  function isEdited(assign, d) {
    var o = (assign.overrides || {})[d];
    return !!(o && o.slots);
  }

  /* ---- the ticket ------------------------------------------------------
     A template is the master recipe book; calling one for a client writes a
     TICKET, and the client is served only what the chef has signed. The
     ticket is `a.draft`, a full shadow copy of the fields the client reads:

       a.draft = { templateId, overrides, time?, targets?, by }

     Two rules, both load-bearing:

     1. NOTHING outside this file reads `a.draft`. HV.slotsFor, calendarFor,
        plateFor, tasks and the Nutrient Panel read the LIVE fields only —
        that is the whole of "the client sees nothing until you approve".
     2. `overrides` is a FULL deep copy, never a sparse patch. Approve does
        `a.overrides = draft.overrides` wholesale, so a patch would silently
        delete every day approved before this draft was opened.

     An absent draft means today's behaviour, so the seeded assignments need
     no migration — the same absent-means-default contract HV.flowOn keeps. */
  function draftView(a) {
    return a && a.draft
      ? { templateId: a.draft.templateId, overrides: a.draft.overrides || {} }
      : a;
  }
  function ensureDraft(a) {
    if (!a.draft) {
      a.draft = {
        templateId: a.templateId,
        overrides: JSON.parse(JSON.stringify(a.overrides || {})),
        by: (HV.me() || {}).id,
      };
    }
    return a.draft;
  }
  /* does this day read differently on the ticket than on the plate? A called
     template changes every day at once, so say so on each day that has one. */
  function isStaged(a, d) {
    if (!a || !a.draft) return false;
    if (a.draft.templateId !== a.templateId) return true;
    var dr = ((a.draft.overrides || {})[d] || {}).slots || null;
    var lv = ((a.overrides || {})[d] || {}).slots || null;
    return JSON.stringify(dr) !== JSON.stringify(lv);
  }
  /* the value the console shows for a scalar the ticket may carry: the
     staged one when the draft mentions it at all (an empty string is a real
     staged value — 'clear this'), else the live one */
  function stagedVal(a, k) {
    return (a && a.draft && k in a.draft) ? a.draft[k] : (a || {})[k];
  }
  function isStagedKey(a, k) {
    if (!a || !a.draft || !(k in a.draft)) return false;
    var d = a.draft[k], live = a[k];
    /* '', null and absent all mean the same thing — not set. Comparing them
       raw marks "cleared something that was never there" as a staged change. */
    if (!d && !live) return false;
    return JSON.stringify(d) !== JSON.stringify(live);
  }
  function hasDraft(a) { return !!(a && a.draft); }
  /* never approved: the pillar has been called but the client has no plan */
  function unpublished(a) { return !!(a && a.draft && !a.templateId); }

  /* Who may touch what. Ops (assignPlan) assigns and edits every pillar; a
     pillar coach now ASSIGNS AND EDITS THEIR OWN PILLAR (TJ, 17 Aug) — the
     person who knows this client's yoga best chooses their yoga — and reads
     the rest. Everyone else, the Doctor and the Super User, reads. */
  function planGate() {
    var me = HV.me() || {};
    var all = HV.can('assignPlan');
    var pillar = !all && HV.can('editCatalog') ? ROLE_PILLAR[me.role] : null;
    return { assign: all, all: all, pillar: pillar || null,
             edit: all || !!pillar, saveTpl: all || HV.can('editTemplates') };
  }
  /* may this person assign/edit THIS pillar? */
  function mayPillar(g, p) { return !!(g.all || (g.pillar && g.pillar === p)); }
  function mayEditSlot(g, slot) { return g.all || g.pillar === slot.pillar; }

  /* the pillar's colour, on the pillar's own dot and nowhere else */
  function pillarDot(k) {
    var p = HV.PILLARS[k];
    if (!p) return '';
    return '<span class="' + p.cls + '" style="display:inline-flex; flex:none" title="' + HV.esc(p.name) + '">' +
      '<span class="pdot"></span></span>';
  }

  function dayMark(day) {
    if (!day) return '';
    if (day.rest) return 'Rest';
    if (day.review) return 'Review';
    if (day.meeting) return 'Meeting';
    return '';
  }

  /* one slot on the Plan tab, in its pillar's own language — the same reading
     the template editor gives, so a coach sees the identical thing in both */
  function slotRow(slot, g, pillar, assign) {
    var p = pillar || slot.pillar;
    var sp = HV.specFor(p);
    var note = HV.doseOf(slot, p, 'note', assign);
    var dose = '';
    if (sp.sums) {
      var n = HV.slotSum(slot);
      if (n.kcal) dose = '<span class="tdose" title="' + HV.esc(n.kcal + ' kcal · ' + n.protein +
          ' g protein · ' + n.carbs + ' g carbs · ' + n.fat + ' g fat · ' + n.fibre + ' g fibre') +
        '"><span class="num">' + n.kcal + '</span> kcal' +
        (n.protein ? ' · <span class="num">' + n.protein + '</span> g' : '') + '</span>';
    } else {
      var bits = [];
      var sets = HV.doseOf(slot, p, 'sets', assign), reps = HV.doseOf(slot, p, 'reps', assign);
      if (sets && reps) bits.push('<span class="num">' + sets + '</span>×<span class="num">' + reps + '</span>');
      var count = HV.doseOf(slot, p, 'count', assign);
      if (count) bits.push('<span class="num">' + count + '</span> rounds');
      var weight = HV.doseOf(slot, p, 'weight', assign);
      if (weight) bits.push(HV.esc(String(weight)));
      var mins = HV.doseOf(slot, p, 'mins', assign);
      if (mins) bits.push('<span class="num">' + mins + '</span> min');
      var rpe = HV.doseOf(slot, p, 'rpe', assign);
      if (rpe) bits.push('RPE <span class="num">' + rpe + '</span>');
      var focus = HV.doseOf(slot, p, 'focus', assign);
      if (focus) bits.push(HV.esc(String(focus)));
      if (bits.length) dose = '<span class="tdose">' + bits.join(' · ') + '</span>';
    }
    return '<div class="trow pslot">' + pillarDot(p) +
      '<span class="grow"><b>' + HV.esc(slot.label || sp.slotWord) + '</b>' +
      '<small>' + optionsLine(slot, p) + '</small>' +
      (note ? '<small class="audit">' + HV.esc(String(note)) + '</small>' : '') + '</span>' +
      dose +
      (sp.time && slot.time ? '<span class="pill neutral"><span class="num">' + HV.esc(slot.time) + '</span></span>' : '') +
    '</div>';
  }

  /* templates saved out of THIS client's plan — the id carries the client, so
     the plan can offer them their sign-off button without a new store key */
  function derivedTemplates(cid) {
    return (HV.store.templates || []).filter(function (t) {
      return t.id.length > cid.length + 1 && t.id.slice(-(cid.length + 1)) === '-' + cid;
    });
  }
  function templateAp(t) {
    return (HV.store.approvals || []).find(function (a) { return a.id === 'ap-tpl-' + t.id; });
  }

  function planHtml(c) {
    var meId = (HV.me() || {}).id;
    if (planCid !== c.id || planViewer !== meId) {
      planCid = c.id; planViewer = meId; planPillar = null; planDay = null;
    }
    ensureTemplateChain();
    var g = planGate();
    var pl = planFor(c.id) || {};

    /* open on the viewer's own pillar if they have one — a yoga coach opening a
       client wants yoga, not whatever happens to sort first */
    if (!planPillar || HV.TPL_PILLARS.indexOf(planPillar) < 0) {
      planPillar = (g.pillar && HV.TPL_PILLARS.indexOf(g.pillar) >= 0) ? g.pillar
        : (assignedPillars(c.id)[0] || 'culture');
    }

    /* the five shelves at a glance — assigned, or visibly not */
    var chips = '<div class="tfil" role="group" aria-label="Pillar">' +
      HV.TPL_PILLARS.map(function (k) {
        var sp = HV.specFor(k);
        var has = !!pl[k];
        return '<button data-pp="' + k + '" class="' + (k === planPillar ? 'on' : '') + '"' +
          ' aria-pressed="' + (k === planPillar) + '">' +
          HV.esc(sp.name) + (has ? '' : ' <span class="pdim">—</span>') + '</button>';
      }).join('') + '</div>';

    var sp = HV.specFor(planPillar);
    var mayHere = mayPillar(g, planPillar);
    var a = pl[planPillar];
    /* the console reads the TICKET — the draft when one is open, else the live
       plan. The client reads only the live fields. This is the ONLY place on
       the Plan tab where that choice is made. */
    var v = a ? draftView(a) : null;
    var t = v && planTemplate(v.templateId);

    if (!t) {
      return chips +
        HV.ui.empty('cal', 'No ' + sp.name + ' template assigned.',
          sp.name + ' has nothing on ' + first(c.name) + '’s calendar until one lands here.') +
        (mayHere
          ? '<div class="row" style="justify-content:center"><button class="btn" data-plan="assign">' +
            'Call a ' + HV.esc(sp.name) + ' template</button></div>'
          : '<p class="audit" style="text-align:center">' + HV.esc(sp.name) +
            ' is assigned by its own coach, or by Ops.</p>');
    }

    var nums = dayKeys(t);
    if (!nums.length) return chips + '<div class="notice warn">This template has no days.</div>';
    if (!planDay || nums.indexOf(planDay) < 0) planDay = Math.min(c.day || 1, nums[nums.length - 1]);

    var day = effectiveDay(v, t, planDay);
    var edits = Object.keys(v.overrides || {}).length;

    var head = '<div class="card tplhead ' + sp.cls + '">' +
      '<div class="h1-row"><b>' + HV.esc(t.name) + '</b>' +
        '<span class="row" style="gap:var(--s2)">' +
          '<span class="tshelf ' + sp.cls + '"><span class="tsp">' + HV.esc(sp.name) + '</span>' +
            '<span class="tsl">L<span class="num">' + (t.level || 1) + '</span></span>' +
            '<span class="tst">' + HV.esc(trackWord(t.track)) + '</span></span>' +
          (unpublished(a) ? '' :
            (a.modified ? HV.ui.pill('Modified', 'warn') : HV.ui.pill('As published', 'ok'))) +
          (hasDraft(a) ? HV.ui.pill(unpublished(a)
            ? 'Draft — ' + HV.esc(first(c.name)) + ' sees nothing yet'
            : 'Draft — unpublished', 'warn') : '') +
        '</span></div>' +
      '<p class="sub" style="margin:var(--s1) 0 0">' + HV.esc(t.desc || '') + '</p>' +
      /* the level the template was written for, against the level this client
         actually stands at — a mismatch is not an error, but it is worth seeing */
      (Number(t.level) !== Number((c.levels || {})[planPillar] || t.level)
        ? '<p class="audit">Written for level <span class="num">' + (t.level || 1) +
          '</span>; ' + HV.esc(first(c.name)) + ' is at level <span class="num">' +
          ((c.levels || {})[planPillar] || 1) + '</span> in ' + HV.esc(sp.name) + '.</p>'
        : '') +
      (edits
        ? '<p class="audit">' + (hasDraft(a) ? 'On this draft, ' : 'Modified from ' + HV.esc(t.name) + ' — ') +
          '<span class="num">' + edits + '</span> ' +
          (edits === 1 ? 'day rides' : 'days ride') + ' on top of the template.</p>'
        : '') +
      (hasDraft(a)
        ? '<p class="audit">Nothing on this draft reaches ' + HV.esc(first(c.name)) +
          ' until it is approved.</p>'
        : '') +
      '<p class="audit">Assigned by ' + HV.esc(HV.staff(a.assignedBy).name) + '</p>' +
      (a.log || []).map(function (l) {
        return '<p class="audit">' + HV.esc(l.act) + ' — ' + HV.esc(HV.staff(l.byId).name) +
          ' · <span class="num">' + HV.esc(HV.ago(l.minsAgo)) + '</span></p>';
      }).join('') +
    '</div>';

    var grid = '<div class="pdays ' + sp.cls + '" role="group" aria-label="Days">' +
      nums.map(function (d) {
        var ed = isEdited(v, d);
        var st = isStaged(a, d);
        var n = ((effectiveDay(v, t, d) || {}).slots || []).length;
        var mark = HV.isRest(d) ? 'Rest' : (d === HV.reviewDay() ? 'Review'
          : (d === HV.meetingDay() ? 'Meeting' : ''));
        return '<button class="pday' + (d === planDay ? ' on' : '') + (n ? ' has' : '') +
          '" data-pd="' + d + '"' + (d === planDay ? ' aria-current="true"' : '') +
          ' aria-label="Day ' + d + (mark ? ' · ' + mark : '') + ' · ' +
            (n ? n + ' ' + sp.slotWord.toLowerCase() + (n > 1 ? 's' : '') : 'nothing') +
            (ed ? ' · edited' : '') + (st ? ' · staged' : '') + '"' +
          (d === (c.day || 0) ? ' data-today="1"' : '') + '>' +
          '<span class="d num">' + d + '</span>' +
          '<span class="m">' + (n ? '<span class="num">' + n + '</span> ' +
            HV.esc(sp.slotWord.toLowerCase()) + (n > 1 ? 's' : '') : (mark || '—')) + '</span>' +
          (st ? '<span class="e stg">Staged</span>' : ed ? '<span class="e">Edited</span>' : '') +
        '</button>';
      }).join('') + '</div>';

    var marks =
      (HV.isRest(planDay) ? HV.ui.pill('Active rest', 'neutral') : '') +
      (planDay === HV.reviewDay() ? HV.ui.pill('Day-' + HV.reviewDay() + ' review', 'info') : '') +
      (planDay === HV.meetingDay() ? HV.ui.pill('Team meeting', 'info') : '') +
      (planDay === (c.day || 0) ? HV.ui.pill('Today', 'info') : '') +
      (isStaged(a, planDay) ? HV.ui.pill('Staged', 'warn')
        : isEdited(v, planDay) ? HV.ui.pill('Edited', 'warn') : '');

    /* The two things a ticket carries that the recipe book cannot: this
       client's own hour for the pillar, and — on Nutrition — the daily
       targets their panel reads. Both stage like any other edit. */
    var tune = '';
    if (['fitness', 'yoga', 'wellness'].indexOf(planPillar) >= 0) {
      var tmin = HV.hmToMin(stagedVal(a, 'time'));
      tune += '<div class="trow pslot">' + HV.ui.iconTile('clock', 'sm') +
        '<span class="grow"><b>Session time</b><small>' +
        (tmin != null
          ? HV.esc(first(c.name)) + '’s own hour, on every day ' + HV.esc(sp.name.toLowerCase()) + ' runs'
          : 'Following the template’s own times') +
        '</small></span>' +
        (tmin != null ? '<span class="pill"><span class="num">' + HV.esc(HV.fmtTime(tmin)) + '</span></span>'
                      : HV.ui.pill('Template', 'neutral')) +
        (isStagedKey(a, 'time') ? HV.ui.pill('Staged', 'warn') : '') +
        (mayHere ? '<button class="btn sm ghost" data-plan="time">Set</button>' : '') +
      '</div>';
      /* the client's own numbers — sets, reps, a weight — over the plan's.
         Same contract as the hour above: they describe the person, and they
         beat the template's own doses on every day until cleared. */
      var dstg = stagedVal(a, 'dose') || {};
      var dbits = sp.fields.map(function (f) {
        var dv = dstg[f.k];
        if (dv === undefined || dv === '') return '';
        return '<span class="pill"><span class="num">' + HV.esc(String(dv)) + '</span>' +
          (f.k === 'rpe' ? ' RPE' : f.k === 'count' ? ' rounds' : f.k === 'mins' ? ' min'
            : f.kind === 'num' ? ' ' + HV.esc(f.t.toLowerCase()) : '') + '</span>';
      }).filter(Boolean).join('');
      tune += '<div class="trow pslot">' + HV.ui.iconTile('gauge', 'sm') +
        '<span class="grow"><b>Session dose</b><small>' +
        (dbits ? HV.esc(first(c.name)) + '’s own numbers, over the plan’s'
               : 'Following the plan’s own doses') +
        '</small></span>' +
        (dbits || HV.ui.pill('Template', 'neutral')) +
        (isStagedKey(a, 'dose') ? HV.ui.pill('Staged', 'warn') : '') +
        (mayHere ? '<button class="btn sm ghost" data-plan="dose">Set</button>' : '') +
      '</div>';
      /* the door into the room, on the day being looked at. This page is
         template-driven and knows nothing about bookings, so the booking is
         resolved here — and when there is none on this day, nothing renders:
         a Join that opens nowhere is a broken promise. */
      var bk = HV.bookingFor(c, planDay, planPillar);
      if (bk && HV.meetui && HV.meetui.mayJoin(bk.t)) {
        var nowD = new Date();
        var nowM = nowD.getHours() * 60 + nowD.getMinutes();
        var liveNow = bk.rd === 0 && nowM >= bk.start - 10 && nowM < bk.start + bk.dur;
        var coach = HV.staff((bk.assignees || [])[0]);
        tune += '<div class="trow pslot">' + HV.ui.iconTile('video', 'sm') +
          '<span class="grow"><b>Session room</b><small>' +
            '<span class="num">' + HV.esc(HV.fmtTime(bk.start)) + '</span>' +
            (coach && !coach.ai ? ' · with ' + HV.esc(first(coach.name)) : '') +
            (liveNow ? ' · open now' : ' · opens ten minutes before') +
          '</small></span>' +
          (liveNow ? '<button class="btn sm" data-plan="join:' + HV.esc(bk.t.id) + ':' + bk.rd + '">Join</button>'
                   : HV.ui.pill('Not open', 'neutral')) +
        '</div>';
      }
    }
    if (planPillar === 'culture') {
      var stg = stagedVal(a, 'targets') || {};
      var tplT = HV.tplTargetsOn(t, planDay) || {};
      var res = HV.nutTargetsFor(c, planDay) || {};
      var show = { kcal: stg.kcal || tplT.kcal || res.kcal,
                   protein: stg.protein || tplT.protein || res.protein,
                   carbs: stg.carbs || tplT.carbs || res.carbs,
                   fat: stg.fat || tplT.fat || res.fat,
                   fibre: stg.fibre || tplT.fibre || res.fibre };
      var srcWord = stg.kcal ? 'Set for ' + first(c.name) + ', over the template'
        : tplT.kcal ? 'From ' + t.name + ' — day ' + planDay + '’s reading'
        : res.src === 'plan' ? 'From their diet plan header'
        : 'Derived from energy — nobody has stated these yet';
      tune += '<div class="trow pslot">' + HV.ui.iconTile('target', 'sm') +
        '<span class="grow"><b>Daily targets</b><small>' + HV.esc(srcWord) + '</small></span>' +
        '<span class="row" style="gap:var(--s2); flex-wrap:wrap; justify-content:flex-end">' +
          '<span class="pill"><span class="num">' + show.kcal + '</span> kcal</span>' +
          '<span class="pill"><span class="num">' + show.protein + '</span> g protein</span>' +
          '<span class="pill"><span class="num">' + show.carbs + '</span> g carbs</span>' +
          '<span class="pill"><span class="num">' + show.fat + '</span> g fat</span>' +
          '<span class="pill"><span class="num">' + show.fibre + '</span> g fibre</span>' +
        '</span>' +
        (isStagedKey(a, 'targets') ? HV.ui.pill('Staged', 'warn') : '') +
        (mayHere ? '<button class="btn sm ghost" data-plan="targets">Set</button>' : '') +
      '</div>';
    }
    if (tune) tune = '<div class="list">' + tune + '</div>';

    var dayBody = (day && (day.slots || []).length)
      ? '<div class="list">' + day.slots.map(function (s2) {
          /* the console reads the TICKET, so the dose rows show the staged
             per-client numbers the client will get on approval */
          return slotRow(s2, g, planPillar, v);
        }).join('') + '</div>'
      : HV.ui.empty('cal', sp.name + ' does not run on day ' + planDay + '.',
          mayHere ? 'Open the day to put something on it.' : '');

    var acts = '<div class="row" style="gap:var(--s2); flex-wrap:wrap">' +
      (mayHere ? '<button class="btn sm" data-plan="edit">Edit day <span class="num">' + planDay + '</span></button>' : '') +
      (mayHere && hasDraft(a)
        ? '<button class="btn sm" data-plan="approve">Approve — publish to ' +
          HV.esc(first(c.name)) + '</button>' +
          '<button class="btn sm ghost" data-plan="discard">Discard draft</button>'
        : '') +
      (mayHere && a.modified ? '<button class="btn sm ghost" data-plan="savetpl">Save as new template</button>' : '') +
      (mayHere ? '<button class="btn sm ghost" data-plan="assign">' +
        (hasDraft(a) ? 'Call another' : 'Reassign') + '</button>' : '') +
    '</div>' +
      (mayHere ? ''
        : '<p class="audit">Read-only for your role — ' + HV.esc(sp.name) + ' is edited by its own coach and Ops.</p>');

    var derived = derivedTemplates(c.id).filter(function (dt) { return dt.pillar === planPillar; });
    var derivedHtml = derived.length
      ? '<div class="sec-title">Saved from this plan</div><div class="list">' +
        derived.map(function (dt) {
          var ap = templateAp(dt);
          var pill = dt.status === 'published' ? HV.ui.pill('Published', 'ok')
            : ap && ap.status === 'submitted'
              ? HV.ui.pill('With ' + (HV.roleDef(HV.approvals.stageRole(ap)) || { title: 'the chain' }).title, 'info')
              : HV.ui.pill('Draft', 'neutral');
          var can = mayHere && dt.status !== 'published' && !(ap && ap.status === 'submitted');
          return '<div class="trow pslot">' + HV.ui.iconTile('bookmark', 'sm') +
            '<span class="grow"><b>' + HV.esc(dt.name) + '</b><small>' + HV.esc(dt.desc || '') + '</small></span>' +
            pill +
            (can ? '<button class="btn sm ghost" data-plan="submit:' + HV.esc(dt.id) + '">Submit for approval</button>' : '') +
          '</div>';
        }).join('') + '</div>'
      : '';

    return chips + head + tune + grid +
      '<div class="h1-row"><div class="sec-title" style="margin:0">Day <span class="num">' + planDay +
        '</span></div><span class="row" style="gap:var(--s2)">' + marks + '</span></div>' +
      dayBody + acts + derivedHtml;
  }

  /* ---- Call · a published template for ONE pillar, chosen by a human ----
     The list is filtered to this pillar and defaults to the client's own shelf:
     their level in this pillar, their activity category. Everything else on the
     pillar is still offered — the default is a suggestion, not a rule.

     Calling writes a TICKET, not a plan. The coach then edits it freely — days,
     the client's own hour, their targets — and the client sees the lot only
     when Approve is pressed. The recipe book itself is never touched. */
  function assignSheet(c, pillar) {
    var me = HV.me();
    var sp = HV.specFor(pillar);
    var lvl = (c.levels || {})[pillar] || 1;
    var pubs = (HV.store.templates || []).filter(function (t) {
      return t.status === 'published' && t.pillar === pillar;
    });
    if (!pubs.length) {
      HV.sheet('<div class="h1">No published ' + HV.esc(sp.name) + ' templates</div>' +
        '<p class="sub">Every ' + HV.esc(sp.name) + ' template is still a draft. One has to clear the ' +
          'approval chain before it can be assigned.</p>' +
        '<button class="btn block" id="as-x">Close</button>',
        function (sheet) { sheet.querySelector('#as-x').addEventListener('click', HV.closeSheet); });
      return;
    }
    var a = assignFor(c.id, pillar);
    var onShelf = pubs.filter(function (t) {
      return Number(t.level) === Number(lvl) && t.track === c.track;
    });
    /* the sheet reflects the TICKET, like every other control on this tab —
       preselecting the live template while a different one sits staged made
       Confirm silently revert the staged choice */
    var curTpl = a ? ((a.draft ? a.draft.templateId : a.templateId) || null) : null;
    var picked = (curTpl && pubs.some(function (t) { return t.id === curTpl; })) ? curTpl
      : (onShelf[0] || pubs[0]).id;
    var drops = a ? Object.keys((a.draft ? a.draft.overrides : a.overrides) || {}).length : 0;

    function row(t) {
      var fit = Number(t.level) === Number(lvl) && t.track === c.track;
      return '<label class="trow pslot"><input type="radio" name="as-t" value="' + HV.esc(t.id) + '"' +
        (t.id === picked ? ' checked' : '') + '>' +
        '<span class="grow"><b>' + HV.esc(t.name) + '</b><small>' + HV.esc(t.desc || '') + '</small></span>' +
        '<span class="tshelf ' + sp.cls + '"><span class="tsl">L<span class="num">' + (t.level || 1) +
          '</span></span><span class="tst">' + HV.esc(trackWord(t.track)) + '</span></span>' +
        (fit ? HV.ui.pill('Their shelf', 'ok') : '') + '</label>';
    }

    HV.sheet(
      '<div class="h1">Call a ' + HV.esc(sp.name) + ' template</div>' +
      '<p class="sub">' + HV.esc(c.name) + ' · ' + HV.esc(trackWord(c.track)) + ' · ' +
        HV.esc(sp.name) + ' level <span class="num">' + lvl + '</span>. ' +
        'The template decides what their day looks like; your edits ride on top of it, ' +
        'and nothing reaches ' + HV.esc(first(c.name)) + ' until you approve.</p>' +
      (drops ? '<div class="notice warn">A new call starts from the new template — the <span class="num">' + drops +
        '</span> edited ' + (drops === 1 ? 'day' : 'days') + ' on the current ' + HV.esc(sp.name) +
        ' plan drop when you approve it.</div>' : '') +
      '<div class="list">' + pubs.map(row).join('') + '</div>' +
      (SESSION_P.indexOf(pillar) >= 0
        ? '<div class="sec-title">Session time</div>' +
          '<p class="sub" style="margin:0 0 var(--s2)">' + HV.esc(first(c.name)) +
            '’s own hour for ' + HV.esc(sp.name.toLowerCase()) + '. Leave it empty to follow the ' +
            'template’s times. A booked session always keeps the hour the coach booked.</p>' +
          '<input class="input" type="time" id="as-time" value="' +
            HV.esc(a ? (to24(stagedVal(a, 'time')) || '') : '') + '" aria-label="Session time">' +
          '<div class="sec-title">Session dose</div>' +
          '<p class="sub" style="margin:0 0 var(--s2)">' + HV.esc(first(c.name)) +
            '’s own numbers — they beat the template’s doses on every day. ' +
            'Leave a field empty to follow the plan.</p>' +
          '<div class="grid2">' +
          sp.fields.map(function (f) {
            var cur = (a && stagedVal(a, 'dose')) || {};
            var dv = cur[f.k];
            return '<span><label class="field-label" for="as-d-' + f.k + '">' + HV.esc(f.t) + '</label>' +
              '<input class="input" id="as-d-' + f.k + '"' +
              (f.kind === 'num' ? ' type="number" min="0"' + (f.max ? ' max="' + f.max + '"' : '') : '') +
              (f.ph ? ' placeholder="' + HV.esc(f.ph) + '"' : '') +
              ' value="' + (dv !== undefined ? HV.esc(String(dv)) : '') + '"></span>';
          }).join('') +
          '</div>'
        : '') +
      '<div id="as-ai"></div>' +
      '<button class="btn block ghost" id="as-ask">Ask AI to fit</button>' +
      '<button class="btn block" id="as-go">Call for ' + HV.esc(first(c.name)) + '</button>' +
      '<button class="btn block ghost" id="as-cancel">Cancel</button>',
      function (sheet) {
        sheet.querySelector('#as-cancel').addEventListener('click', HV.closeSheet);

        /* the AI proposes; the human still taps Assign — a draft never assigns itself */
        sheet.querySelector('#as-ask').addEventListener('click', function () {
          var fit = onShelf[0] || pubs[0];
          var radio = sheet.querySelector('input[name="as-t"][value="' + fit.id + '"]');
          if (radio) radio.checked = true;
          sheet.querySelector('#as-ai').innerHTML = HV.ui.aidraft('<div>' + HV.esc(
            trackWord(c.track) + ', ' + sp.name + ' level ' + lvl + ' — ' + fit.name +
            (onShelf.length ? ' sits on exactly that shelf' : ' is the nearest published fit') +
            ', and ' + first(c.name) + '’s coach can still edit any day on top of it. ' +
            'Confirm to assign.') + '</div>');
        });

        sheet.querySelector('#as-go').addEventListener('click', function () {
          var sel = sheet.querySelector('input[name="as-t"]:checked');
          if (!sel) { HV.toast('Pick a template first.'); return; }
          var t = planTemplate(sel.value);
          if (!t) return;
          var had = !!a;
          HV.store.clientPlans = HV.store.clientPlans || {};
          var bundle = HV.store.clientPlans[c.id] = HV.store.clientPlans[c.id] || {};
          /* the LIVE record is created empty on a first call — HV.slotsFor
             returns [] for a null templateId, so the client's calendar stays
             exactly as it was until the first Approve */
          var rec = bundle[pillar] = bundle[pillar] ||
            { templateId: null, modified: false, assignedBy: me.id, overrides: {}, log: [] };
          /* Day overrides belong to the template they were written against, so
             a new call starts them empty. The client's own hour and targets do
             NOT — they describe the person, not the template — so anything
             already staged survives the swap. */
          var keep = rec.draft || {};
          rec.draft = { templateId: t.id, overrides: {}, by: me.id };
          if ('targets' in keep) rec.draft.targets = keep.targets;
          if ('time' in keep) rec.draft.time = keep.time;
          if ('dose' in keep) rec.draft.dose = keep.dose;
          /* stage the hour only when it actually CHANGES something — writing
             '' onto a pillar that never had a time stages nothing and would
             still raise a "Staged" pill against it */
          var tm = sheet.querySelector('#as-time');
          if (tm && (tm.value || '') !== (to24(a && a.time) || '')) {
            rec.draft.time = tm.value || '';
          }
          /* the dose, under the same changed-only guard — read back from the
             fields, staged only when it differs from what the live record holds */
          if (SESSION_P.indexOf(pillar) >= 0) {
            var dOut = {};
            sp.fields.forEach(function (f) {
              var inp = sheet.querySelector('#as-d-' + f.k);
              if (!inp) return;
              var raw = inp.value.trim();
              if (raw === '') return;
              var dv = f.kind === 'num' ? (Number(raw) || 0) : raw;
              if (dv) dOut[f.k] = dv;
            });
            var was = JSON.stringify((a && a.dose) || null);
            var now = JSON.stringify(Object.keys(dOut).length ? dOut : null);
            if (now !== was) rec.draft.dose = Object.keys(dOut).length ? dOut : null;
          }
          rec.log.push({ act: 'Called ' + t.name + ' — draft', byId: me.id, minsAgo: 0 });
          planDay = null;
          HV.save();
          HV.closeSheet();
          HV.refresh();
          HV.toast(t.name + ' called — edit it freely, then approve to publish.');
        });
      }
    );
  }

  /* ---- The AND/OR slot editor · one grammar, two writers ----
     The sheet works on a deep copy: nothing touches the store until Save, so
     Escape is always a clean way out. Slots outside a pillar coach's own
     pillar render read-only — they still travel into the saved set untouched,
     because a day is always saved WHOLE.

     Exported through HV.planui, because two surfaces write these same slots:
     the Plan tab below saves them as a client's day override, and the
     Catalog's template editor saves them into the template itself. One sheet,
     so the grammar can only ever change in one place.
       slots  — the day's slots as they stand now (never mutated)
       opts   — { titleHtml, gate:{all,pillar}, track, addSlot, saveLabel }
       onSave — called with the pruned copy; the CALLER writes and closes. */
  /* Slot times are stored the way a coach writes them — '8:00', '19:30' — but
     <input type="time"> insists on a zero-padded HH:MM. Two tiny adapters, so
     the stored shape never has to change to suit a form control. */
  function to24(t) {
    /* seeded slots are written the way a coach speaks — '6:30 pm' as readily
       as '19:30'. Reading only the 24-hour form meant the form control came up
       empty and Save then wrote that emptiness over a real time. */
    var m = /^(\d{1,2}):(\d{2})\s*([ap]\.?m\.?)?$/i.exec(String(t || '').trim());
    if (!m) return '';
    var h = Number(m[1]);
    if (m[3]) h = (h % 12) + (/^p/i.test(m[3]) ? 12 : 0);
    if (h > 23 || Number(m[2]) > 59) return '';
    return (h < 10 ? '0' : '') + h + ':' + m[2];
  }
  function from24(t) {
    var m = /^(\d{2}):(\d{2})$/.exec(String(t || ''));
    return m ? String(Number(m[1])) + ':' + m[2] : '';
  }

  function catalogFor(pillar, track) {
    var lib = (HV.store.catalog && HV.store.catalog[pillar]) || [];
    var fit = lib.filter(function (i) { return i.track === track; });
    return { items: fit.length ? fit : lib, all: !fit.length };
  }

  /* what the LIBRARY would give this slot for one field, ignoring any override
     the coach has typed. Shown as the input's placeholder, so an empty box
     still tells you what the client will actually get. */
  function libDefault(slot, pillar, key) {
    return HV.doseOf({ options: slot.options }, pillar, key);
  }

  /* The markup and the wiring that brings it to life are separable, because
     the editor now has two homes: the Plan tab mounts it inside a sheet, the
     Catalog's composer mounts it inside its day panel. Everything above the
     mount is shared verbatim, which is the whole point — one grammar. */
  function slotEditorParts(slots, opts, onSave) {
    var o = opts || {};
    var g = o.gate || { all: true, pillar: null };
    var track = o.track || 'sedentary';
    /* the pillar this whole day belongs to. Templates are per-pillar now, so
       the sheet usually knows it up front; the client Plan tab passes it too.
       Falling back to the slot's own pillar keeps any older mixed day working. */
    var only = o.pillar || null;
    var draft = JSON.parse(JSON.stringify(slots || []));

    function pillarOf(slot) { return only || slot.pillar; }

    function grpHtml(slot, si, grp, gi, editable, lib) {
      var p = pillarOf(slot);
      var letter = 'Option ' + String.fromCharCode(65 + gi);
      return '<div class="pgrp"><div class="k">' + letter + '</div>' +
        (grp.length ? '' : '<p class="audit">Nothing in this alternative yet — add an item, or remove the option.</p>') +
        grp.map(function (e, ii) {
          var id = HV.optId(e), x = HV.optX(e);
          var nm = itemName(p, id);
          /* portions are a FOOD concept — only a sums pillar shows the ×N
             cycle (×1 → ×2 → ×3 → ×1). One compact button with its own
             class: .pgrp .chip button paints any chip button danger-red on
             hover, which is the REMOVE grammar, not the portion's */
          var food = HV.specFor(p).sums;
          return '<span class="chip">' + HV.esc(nm) +
            (food && editable
              ? '<button class="chipx num" data-ed="xn:' + si + ':' + gi + ':' + ii +
                  '" aria-label="' + HV.esc(nm) + ' portion, now ×' + x + ' — tap to change">×' + x + '</button>'
              : (x > 1 ? '<span class="chipx num">×' + x + '</span>' : '')) +
            (editable ? '<button data-ed="rm:' + si + ':' + gi + ':' + ii + '" aria-label="Remove ' +
              HV.esc(nm) + ' from ' + letter + '">' + HV.ui.icon('x') + '</button>' : '') +
          '</span>';
        }).join('') +
        (editable
          ? '<div class="row" style="gap:var(--s2); margin-top:var(--s2); flex-wrap:wrap">' +
              '<select class="input sel" data-ed="add:' + si + ':' + gi + '" aria-label="Add an item to ' + letter + '">' +
                '<option value="">Add ' + HV.esc(HV.specFor(p).itemWord) + '…</option>' +
                lib.items.map(function (it) {
                  return '<option value="' + HV.esc(it.id) + '">' + HV.esc(it.name) + '</option>';
                }).join('') +
              '</select>' +
              (slot.options.length > 1
                ? '<button class="btn sm quiet" data-ed="rmgrp:' + si + ':' + gi + '">Remove option</button>' : '') +
            '</div>'
          : '') +
      '</div>';
    }

    /* the pillar's own fields — sets and reps for a session, minutes and a
       focus for a practice, a note for a meal. Built from HV.slotSpec, so a
       pillar gains a field by one edit in core.js and never a hunt through
       the views. An empty box shows the library's default as its placeholder;
       typing in it overrides that for this template only. */
    function fieldsHtml(slot, si, editable) {
      var p = pillarOf(slot);
      var sp = HV.specFor(p);
      if (!sp.fields.length && !sp.sums) return '';
      var readout = '';
      if (sp.sums) {
        /* the one surface that earns the full reading inline — the dietitian
           is composing here, and portions moved these numbers. EVERY option
           gets its own reading, micros included, so B can be weighed against
           A while it is being built; the day's totals still follow Option A
           alone, because the client eats A or B, never both. */
        var roster = (HV.store.nutrition && HV.store.nutrition.micros) || [];
        var r1 = function (v) { return Math.round(v * 10) / 10; };
        readout = (slot.options || []).map(function (grp, gi) {
          var n = HV.groupSum(grp);
          var mics = Object.keys(n.micros).map(function (k) {
            var ref = roster.filter(function (m) { return m.k === k; })[0];
            return (ref ? HV.esc(ref.name) : HV.esc(k)) + ' <span class="num">' + r1(n.micros[k]) +
              '</span>' + (ref ? ' ' + HV.esc(ref.unit) : '');
          }).join(' · ');
          return '<p class="audit" style="margin:var(--s2) 0 0"><b>Option ' +
            String.fromCharCode(65 + gi) + '</b> reads <span class="num">' +
            r1(n.kcal) + '</span> kcal · <span class="num">' + r1(n.protein) + '</span> g protein · <span class="num">' +
            r1(n.carbs) + '</span> g carbs · <span class="num">' + r1(n.fat) + '</span> g fat · <span class="num">' +
            r1(n.fibre) + '</span> g fibre' + (mics ? '<br>' + mics : '') + '</p>';
        }).join('') +
        '<p class="audit" style="margin:var(--s1) 0 0">Summed from the foods and their portions, never typed. ' +
          ((slot.options || []).length > 1
            ? 'The day counts Option A — alternatives replace it, they never add.' : '') + '</p>';
      }
      if (!sp.fields.length) return readout;
      /* when the client's own dose is set, a number typed here visibly does
         nothing — say so rather than let the coach wonder */
      var mine = (o.assign && o.assign.dose) || {};
      var beaten = sp.fields.filter(function (f) {
        return mine[f.k] !== undefined && mine[f.k] !== '';
      }).map(function (f) { return f.t.toLowerCase(); });
      var notice = beaten.length
        ? '<p class="audit" style="margin:var(--s2) 0 0">This client’s own ' + HV.esc(beaten.join(', ')) +
          ' win' + (beaten.length === 1 ? 's' : '') + ' over what is typed here — clear them on Session dose to hand the plan back.</p>'
        : '';
      var boxes = sp.fields.map(function (f) {
        var val = ((slot.dose || {})[f.k] !== undefined) ? slot.dose[f.k] : '';
        var dflt = libDefault(slot, p, f.k);
        var ph = f.ph || (dflt !== undefined ? String(dflt) : '');
        return '<div><label class="field-label" for="dz-' + si + '-' + f.k + '">' + HV.esc(f.t) + '</label>' +
          '<input class="input" id="dz-' + si + '-' + f.k + '" data-dose="' + si + ':' + f.k + '"' +
            (f.kind === 'num' ? ' type="number" min="0" inputmode="numeric"' : '') +
            (f.max ? ' max="' + f.max + '"' : '') +
            ' value="' + HV.esc(String(val)) + '" placeholder="' + HV.esc(ph) + '"' +
            (editable ? '' : ' readonly') + ' autocomplete="off"></div>';
      }).join('');
      return '<div class="' + (sp.fields.length > 2 ? 'grid2' : '') + '" style="margin-top:var(--s2)">' +
        boxes + '</div>' + notice + readout;
    }

    function slotBlock(slot, si) {
      var p = pillarOf(slot);
      var editable = only ? (g.all || g.pillar === p) : mayEditSlot(g, slot);
      var lib = catalogFor(p, track);
      var sp = HV.specFor(p);
      return '<div class="card quiet ' + sp.cls + '">' +
        '<div class="h1-row">' +
          '<span class="row" style="gap:var(--s2)">' + pillarDot(p) +
            (editable
              ? '<input class="input" data-lbl="' + si + '" value="' + HV.esc(slot.label || sp.slotWord) +
                '" aria-label="' + HV.esc(sp.slotWord) + ' name" autocomplete="off" style="max-width:190px">'
              : '<b>' + HV.esc(slot.label || sp.slotWord) + '</b>') +
            (sp.time
              ? (editable
                  ? '<input class="input" data-time="' + si + '" type="time" value="' +
                    HV.esc(to24(slot.time)) + '" aria-label="Time" style="max-width:120px">'
                  : (slot.time ? '<span class="pill neutral"><span class="num">' + HV.esc(slot.time) + '</span></span>' : ''))
              : '') +
          '</span>' +
          (editable ? '<button class="btn sm quiet" data-ed="rmslot:' + si + '">Remove</button>'
                    : HV.ui.pill('Read-only', 'neutral')) +
        '</div>' +
        slot.options.map(function (grp, gi) { return grpHtml(slot, si, grp, gi, editable, lib); }).join('') +
        (editable
          ? (lib.all ? '<p class="audit">No ' + HV.esc(track) + ' items in this library — every category is offered.</p>' : '') +
            '<button class="btn sm ghost" data-ed="addgrp:' + si + '" style="margin-top:var(--s2)">' +
              HV.ui.icon('plus') + 'Add alternative</button>'
          : '') +
        fieldsHtml(slot, si, editable) +
      '</div>';
    }

    /* a new slot. With a pillar fixed (every template) there is nothing to
       choose but the name, offered as this pillar's usual ones — Breakfast and
       Lunch for a dietitian, Session and Warm-up for a trainer. Mixed days keep
       the old pillar picker. */
    var newPillars = only
      ? (g.all || g.pillar === only ? [only] : [])
      : Object.keys(HV.PILLARS).filter(function (k) { return g.all || g.pillar === k; });
    var specNew = HV.specFor(newPillars[0] || only || 'fitness');
    /* one film a day and no more — a second would have nothing to mean */
    var full = only && specNew.one && draft.length >= 1;
    var addSlotHtml = (o.addSlot && newPillars.length && !full)
      ? '<div class="card quiet">' +
          '<label class="field-label" for="ed-newlabel">Add a ' + HV.esc(specNew.slotWord.toLowerCase()) + '</label>' +
          '<div class="row" style="gap:var(--s2); flex-wrap:wrap">' +
            (only ? '' :
              '<select class="input sel" id="ed-newp" aria-label="Pillar for the new slot">' +
                newPillars.map(function (k) {
                  return '<option value="' + k + '">' + HV.esc(HV.PILLARS[k].name) + '</option>';
                }).join('') +
              '</select>') +
            '<input class="input" id="ed-newlabel" list="ed-names" placeholder="' +
              HV.esc(specNew.defaults[0] || specNew.slotWord) + '" ' +
              'aria-label="Name for the new ' + HV.esc(specNew.slotWord.toLowerCase()) + '" ' +
              'autocomplete="off" style="flex:1; min-width:140px">' +
            '<datalist id="ed-names">' +
              specNew.defaults.map(function (d) { return '<option value="' + HV.esc(d) + '">'; }).join('') +
            '</datalist>' +
            '<button class="btn sm ghost" id="ed-addslot">' + HV.ui.icon('plus') + 'Add</button>' +
          '</div>' +
        '</div>'
      : '';

    var html =
      '<p class="sub">Items inside one option are taken together; separate options are alternatives — ' +
        (only
          ? 'this day belongs to ' + HV.esc(HV.specFor(only).name) + '.'
          : (g.all ? 'you may edit every slot.' : 'you may edit your own pillar’s slots.')) + '</p>' +
      '<div id="ed-body"></div>' + addSlotHtml +
      '<button class="btn block" id="ed-save">' + HV.esc(o.saveLabel || 'Save day') + '</button>' +
      (o.onCancel ? '<button class="btn block ghost" id="ed-cancel">Cancel</button>' : '');

    /* has anything landed in the draft since it was mounted? The panel asks,
       so it can say out loud what the sheet used to discard in silence. */
    var dirty = false;

    function wire(sheet) {
        var body = sheet.querySelector('#ed-body');
        function paint() {
          body.innerHTML = draft.length
            ? draft.map(slotBlock).join('')
            : HV.ui.empty('cal', 'Nothing on this day.',
                o.addSlot ? 'Add the first one below — a blank day is a legitimate answer too.'
                          : 'This day is empty in the template.');
        }
        paint();

        var addBtn = sheet.querySelector('#ed-addslot');
        if (addBtn) addBtn.addEventListener('click', function () {
          var p = only || sheet.querySelector('#ed-newp').value;
          var sp = HV.specFor(p);
          var lbl = sheet.querySelector('#ed-newlabel');
          var slot = { pillar: p, label: lbl.value.trim() || sp.defaults[0] || sp.slotWord, options: [[]] };
          if (sp.time) slot.time = '';
          draft.push(slot);
          lbl.value = '';
          dirty = true;
          paint();
        });

        body.addEventListener('click', function (e) {
          var b = e.target.closest('[data-ed]');
          if (!b || b.tagName === 'SELECT') return;
          var a = b.dataset.ed.split(':');
          var slot = draft[Number(a[1])];
          if (!slot) return;
          var p = pillarOf(slot);
          if (!(only ? (g.all || g.pillar === p) : mayEditSlot(g, slot))) return;
          if (a[0] === 'rm') {
            slot.options[Number(a[2])].splice(Number(a[3]), 1);
          } else if (a[0] === 'xn') {
            /* the portion cycle: ×1 → ×2 → ×3 → ×1. A bare id IS ×1, so
               stepping down to one canonicalises back to the plain string —
               the seed diff and the staged-day compare both stay minimal */
            var xg = slot.options[Number(a[2])];
            var xi = Number(a[3]);
            var cur = HV.optX(xg[xi]);
            var nxt = cur >= 3 ? 1 : cur + 1;
            xg[xi] = nxt === 1 ? HV.optId(xg[xi]) : { id: HV.optId(xg[xi]), x: nxt };
          } else if (a[0] === 'rmgrp') {
            if (slot.options.length <= 1) { HV.toast('A slot needs at least one option.'); return; }
            slot.options.splice(Number(a[2]), 1);
          } else if (a[0] === 'addgrp') {
            /* an empty alternative is a legal HALF-WAY state, never a saved one:
               Save prunes the empties and refuses a slot left with none */
            slot.options.push([]);
          } else if (a[0] === 'rmslot') {
            draft.splice(Number(a[1]), 1);
          } else return;
          dirty = true;
          paint();
        });

        /* Item pickers repaint (the chips and any plate reading change with
           them). The text and number fields must NOT — a repaint mid-edit takes
           the cursor out of the box the coach is typing in. */
        body.addEventListener('change', function (e) {
          var s = e.target.closest('select[data-ed]');
          if (s && s.value) {
            var a = s.dataset.ed.split(':');
            var slot = draft[Number(a[1])];
            if (!slot) return;
            var grp = slot.options[Number(a[2])];
            /* compare by id, never by entry — an {id, x:2} object would slip
               past indexOf and the same food would land twice */
            var dup = grp.some(function (en) { return HV.optId(en) === s.value; });
            if (!dup) grp.push(s.value);
            else HV.toast('Already in that option.');
            dirty = true;
            paint();
            return;
          }
          var d = e.target.closest('[data-dose]');
          if (d) {
            var da = d.dataset.dose.split(':');
            var ds = draft[Number(da[0])];
            if (!ds) return;
            ds.dose = ds.dose || {};
            var v = d.value.trim();
            if (v === '') delete ds.dose[da[1]];
            else ds.dose[da[1]] = (d.type === 'number') ? Number(v) : v;
            dirty = true;
            return;
          }
          var tm = e.target.closest('[data-time]');
          if (tm) { var ts = draft[Number(tm.dataset.time)]; if (ts) ts.time = from24(tm.value); dirty = true; return; }
          var lb = e.target.closest('[data-lbl]');
          if (lb) { var ls = draft[Number(lb.dataset.lbl)]; if (ls) ls.label = lb.value.trim() || ls.label; dirty = true; }
        });

        var cancel = sheet.querySelector('#ed-cancel');
        if (cancel && o.onCancel) cancel.addEventListener('click', o.onCancel);
        sheet.querySelector('#ed-save').addEventListener('click', function () {
          var bad = null;
          draft.forEach(function (slot) {
            slot.options = slot.options.filter(function (grp) { return grp.length; })
              /* canonicalise on the way out: ×1 is the bare string, always */
              .map(function (grp) {
                return grp.map(function (en) { return HV.optX(en) === 1 ? HV.optId(en) : en; });
              });
            if (!slot.options.length) bad = slot.label || pillarOf(slot);
            if (slot.dose && !Object.keys(slot.dose).length) delete slot.dose;
          });
          if (bad) { HV.toast(bad + ' has no options left — a slot needs at least one.'); paint(); return; }
          dirty = false;
          onSave(JSON.parse(JSON.stringify(draft)));
        });
        return { isDirty: function () { return dirty; } };
    }

    return { html: html, wire: wire };
  }

  /* Mount the editor into ANY container. Returns { isDirty() }.
     LAW: at most ONE editor is mounted at a time — its #ed-* ids are
     singletons. The sheet and the Catalog panel live on different routes, so
     this holds by construction; it is written down because it is a law rather
     than a guarantee. */
  function slotEditor(host, slots, opts, onSave) {
    var parts = slotEditorParts(slots, opts, onSave);
    host.innerHTML = parts.html;
    return parts.wire(host);
  }

  /* The sheet mount, signature unchanged — every existing caller is untouched. */
  function slotSheet(slots, opts, onSave) {
    var o = opts || {};
    var parts = slotEditorParts(slots, Object.assign({}, o, { onCancel: HV.closeSheet }), onSave);
    HV.sheet((o.titleHtml || '<div class="h1">Edit day</div>') + parts.html,
      function (sheet) { parts.wire(sheet); });
  }

  /* ---- Edit day · the plan tab's writer ----
     The same sheet, saved as an override on the TICKET: a day the coach touched
     replaces the template's day whole, the template itself is never written to
     here, and the client sees none of it until the ticket is approved. */
  function editDaySheet(c, pillar, d) {
    var me = HV.me();
    var g = planGate();
    if (!mayPillar(g, pillar)) return;
    var a = assignFor(c.id, pillar);
    var v = a ? draftView(a) : null;
    var t = v && planTemplate(v.templateId);
    if (!t) return;
    var day = effectiveDay(v, t, d) || { slots: [] };
    var sp = HV.specFor(pillar);

    slotSheet(day.slots || [], {
      titleHtml: '<div class="h1">Day <span class="num">' + d + '</span></div>' +
        '<p class="sub" style="margin:0">' + HV.esc(first(c.name)) + ' · ' + HV.esc(sp.name) + '</p>',
      pillar: pillar,
      gate: { all: true, pillar: null },   // mayPillar above already decided
      track: t.track,
      addSlot: true,
      /* the ticket view, so the editor can say when this client's own dose
         beats a number typed on a slot */
      assign: v,
    }, function (slots) {
      var dr = ensureDraft(a);
      dr.overrides[d] = { slots: slots };
      (a.log = a.log || []).push({
        act: sp.name + ' day ' + d + ' edited — draft', byId: me.id, minsAgo: 0,
      });
      HV.save();
      HV.closeSheet();
      HV.refresh();
      HV.toast('Day staged — ' + first(c.name) + ' sees it when you approve.');
    });
  }

  /* ---- Approve · the chef signs the ticket ----
     One wholesale copy, draft → live. Wholesale is why `draft.overrides` is a
     full deep copy rather than a patch: a patch here would silently delete
     every day approved before this draft was opened.

     `time` and `targets` are copied only when the draft MENTIONS them, and an
     empty staged value means "clear it" — that is how a coach hands a client
     back to the template's own times. */
  function approvePlan(c, pillar) {
    var me = HV.me();
    var a = assignFor(c.id, pillar);
    if (!a || !a.draft) return;
    var d = a.draft;
    var t = planTemplate(d.templateId);
    a.templateId = d.templateId;
    a.overrides = d.overrides || {};
    if ('time' in d) { if (d.time) a.time = d.time; else delete a.time; }
    if ('targets' in d) { if (d.targets) a.targets = d.targets; else delete a.targets; }
    if ('dose' in d) { if (d.dose) a.dose = d.dose; else delete a.dose; }
    a.modified = !!Object.keys(a.overrides).length;
    delete a.draft;
    (a.log = a.log || []).push({
      act: 'Approved ' + ((t && t.name) || 'the plan') + ' — published',
      byId: me.id, minsAgo: 0,
    });
    HV.save();
    HV.refresh();
    HV.toast('Approved — ' + first(c.name) + ' sees this plan now.');
  }

  function discardDraft(c, pillar) {
    var me = HV.me();
    var a = assignFor(c.id, pillar);
    if (!a || !a.draft) return;
    var sp = HV.specFor(pillar);
    HV.sheet('<div class="h1">Discard this draft?</div>' +
      '<p class="sub">Every staged ' + HV.esc(sp.name) + ' change goes, and ' +
        HV.esc(first(c.name)) + '’s plan stays exactly as it is now.</p>' +
      '<button class="btn block" id="dd-go">Discard the draft</button>' +
      '<button class="btn block ghost" id="dd-x">Keep editing</button>',
      function (sheet) {
        sheet.querySelector('#dd-x').addEventListener('click', HV.closeSheet);
        sheet.querySelector('#dd-go').addEventListener('click', function () {
          delete a.draft;
          (a.log = a.log || []).push({ act: 'Draft discarded', byId: me.id, minsAgo: 0 });
          HV.save();
          HV.closeSheet();
          HV.refresh();
          HV.toast('Draft discarded.');
        });
      });
  }

  /* ---- this client's own hour for one session pillar ----
     Stored as a zero-padded 24-hour 'HH:MM', which is exactly what the form
     control hands over — HV.hmToMin refuses anything else, and a refusal reads
     as "no per-client time", which would be a silent fallback to the template. */
  function timeSheet(c, pillar) {
    var me = HV.me();
    var a = assignFor(c.id, pillar);
    if (!a) return;
    var sp = HV.specFor(pillar);
    var cur = to24(stagedVal(a, 'time')) || '';
    HV.sheet('<div class="h1">' + HV.esc(sp.name) + ' session time</div>' +
      '<p class="sub">' + HV.esc(first(c.name)) + '’s own hour, on every day ' +
        HV.esc(sp.name.toLowerCase()) + ' runs. Leave it empty to follow the template’s ' +
        'own times. A session the coach has booked always keeps its booked hour.</p>' +
      '<input class="input" type="time" id="ts-t" value="' + HV.esc(cur) + '" aria-label="Session time">' +
      '<button class="btn block" id="ts-go">Stage this time</button>' +
      '<button class="btn block ghost" id="ts-clear">Follow the template</button>' +
      '<button class="btn block ghost" id="ts-x">Cancel</button>',
      function (sheet) {
        sheet.querySelector('#ts-x').addEventListener('click', HV.closeSheet);
        function stage(val, word) {
          ensureDraft(a).time = val;
          (a.log = a.log || []).push({ act: word, byId: me.id, minsAgo: 0 });
          HV.save();
          HV.closeSheet();
          HV.refresh();
          HV.toast('Staged — ' + first(c.name) + ' sees it when you approve.');
        }
        sheet.querySelector('#ts-go').addEventListener('click', function () {
          var val = sheet.querySelector('#ts-t').value;
          if (HV.hmToMin(val) == null) { HV.toast('Pick a time first.'); return; }
          stage(val, sp.name + ' moved to ' + HV.fmtTime(HV.hmToMin(val)) + ' — draft');
        });
        sheet.querySelector('#ts-clear').addEventListener('click', function () {
          stage('', sp.name + ' back on the template’s times — draft');
        });
      });
  }

  /* ---- this client's own session dose ----
     The person's numbers — sets, reps, a weight, rounds — over the plan's, the
     same contract as their hour: they beat the template's own doses on every
     day until cleared. Staged on the ticket like everything else. */
  function doseSheet(c, pillar) {
    var me = HV.me();
    var a = assignFor(c.id, pillar);
    if (!a) return;
    var sp = HV.specFor(pillar);
    var cur = stagedVal(a, 'dose') || {};
    var flds = sp.fields;
    HV.sheet('<div class="h1">Session dose — ' + HV.esc(first(c.name)) + '</div>' +
      '<p class="sub">' + HV.esc(first(c.name)) + '’s own numbers for every ' +
        HV.esc(sp.slotWord.toLowerCase()) + '. A number here beats the plan’s own doses ' +
        'on every day; leave a field empty to follow the plan.</p>' +
      '<div class="' + (flds.length > 2 ? 'grid2' : '') + '">' +
      flds.map(function (f) {
        var dv = cur[f.k];
        return '<span><label class="field-label" for="ds-' + f.k + '">' + HV.esc(f.t) + '</label>' +
          '<input class="input" id="ds-' + f.k + '"' +
          (f.kind === 'num' ? ' type="number" min="0"' + (f.max ? ' max="' + f.max + '"' : '') : '') +
          (f.ph ? ' placeholder="' + HV.esc(f.ph) + '"' : '') +
          ' value="' + (dv !== undefined ? HV.esc(String(dv)) : '') + '"></span>';
      }).join('') +
      '</div>' +
      '<button class="btn block" id="ds-go">Stage these numbers</button>' +
      '<button class="btn block ghost" id="ds-clear">Follow the plan’s doses</button>' +
      '<button class="btn block ghost" id="ds-x">Cancel</button>',
      function (sheet) {
        sheet.querySelector('#ds-x').addEventListener('click', HV.closeSheet);
        function stage(out, word) {
          ensureDraft(a).dose = out;
          (a.log = a.log || []).push({ act: word, byId: me.id, minsAgo: 0 });
          HV.save();
          HV.closeSheet();
          HV.refresh();
          HV.toast('Staged — ' + first(c.name) + ' sees it when you approve.');
        }
        sheet.querySelector('#ds-go').addEventListener('click', function () {
          var out = {};
          flds.forEach(function (f) {
            var raw = sheet.querySelector('#ds-' + f.k).value.trim();
            if (raw === '') return;
            out[f.k] = f.kind === 'num' ? (Number(raw) || 0) : raw;
            if (f.kind === 'num' && !out[f.k]) delete out[f.k];
          });
          if (!Object.keys(out).length) { HV.toast('Set a number first — or use “Follow the plan”.'); return; }
          stage(out, sp.name + ' dose set for ' + first(c.name) + ' — draft');
        });
        sheet.querySelector('#ds-clear').addEventListener('click', function () {
          stage(null, sp.name + ' dose back on the plan’s own — draft');
        });
      });
  }

  /* ---- this client's daily nutrition targets ----
     Five numbers the Nutrient Panel reads. Left empty they fall back through
     the template and then the derivation, which is what HV.nutTargetsFor does
     — so an empty field here is a real answer, not a missing one. */
  function targetsSheet(c) {
    var me = HV.me();
    var a = assignFor(c.id, 'culture');
    if (!a) return;
    var cur = stagedVal(a, 'targets') || {};
    var res = HV.nutTargetsFor(c, c.day) || {};
    function fld(k, label, unit, ph) {
      return '<div class="field-label" id="tg-' + k + '-l">' + HV.esc(label) +
          ' <small>(' + HV.esc(unit) + ')</small></div>' +
        '<input class="input num" type="number" min="0" id="tg-' + k + '"' +
          ' aria-labelledby="tg-' + k + '-l" value="' +
          (cur[k] != null ? HV.esc(String(cur[k])) : '') +
          '" placeholder="' + HV.esc(ph != null ? String(ph) : '—') + '">';
    }
    HV.sheet('<div class="h1">Daily targets</div>' +
      '<p class="sub">What ' + HV.esc(first(c.name)) + '’s Nutrient Panel measures the day against. ' +
        'Leave a field empty to let the template — and then the standard derivation — answer it.</p>' +
      fld('kcal', 'Energy', 'kcal', res.kcal) +
      fld('protein', 'Protein', 'g', res.protein) +
      fld('carbs', 'Carbs', 'g', res.carbs) +
      fld('fat', 'Fat', 'g', res.fat) +
      fld('fibre', 'Fibre', 'g', res.fibre) +
      '<button class="btn block" id="tg-go">Stage these targets</button>' +
      '<button class="btn block ghost" id="tg-x">Cancel</button>',
      function (sheet) {
        sheet.querySelector('#tg-x').addEventListener('click', HV.closeSheet);
        sheet.querySelector('#tg-go').addEventListener('click', function () {
          var out = {};
          ['kcal', 'protein', 'carbs', 'fat', 'fibre'].forEach(function (k) {
            var v = Number(sheet.querySelector('#tg-' + k).value);
            if (v > 0) out[k] = Math.round(v);
          });
          ensureDraft(a).targets = Object.keys(out).length ? out : null;
          (a.log = a.log || []).push({
            act: Object.keys(out).length ? 'Daily targets staged' : 'Daily targets cleared — draft',
            byId: me.id, minsAgo: 0,
          });
          HV.save();
          HV.closeSheet();
          HV.refresh();
          HV.toast('Staged — ' + first(c.name) + ' sees it when you approve.');
        });
      });
  }

  /* ---- Save as new template · the plan, overrides baked in, as a draft ---- */
  function saveTemplateSheet(c, pillar) {
    var me = HV.me();
    var a = assignFor(c.id, pillar);
    var base = a && planTemplate(a.templateId);
    if (!base) return;
    var sp = HV.specFor(pillar);
    var n = Object.keys(a.overrides || {}).length;

    HV.sheet(
      '<div class="h1">Save as new template</div>' +
      '<p class="sub">Everything this ' + HV.esc(sp.name) + ' plan carries — ' + HV.esc(base.name) + ' with its <span class="num">' + n +
        '</span> edited ' + (n === 1 ? 'day' : 'days') + ' baked in — becomes a template of its own. It lands as a ' +
        'draft; the approval chain publishes it.</p>' +
      '<input class="input" id="st-name" aria-label="Template name" autocomplete="off" value="' +
        HV.esc(base.name + ' · ' + first(c.name)) + '">' +
      '<button class="btn block" id="st-go">Save as draft template</button>' +
      '<button class="btn block ghost" id="st-cancel">Cancel</button>',
      function (sheet) {
        sheet.querySelector('#st-cancel').addEventListener('click', HV.closeSheet);
        sheet.querySelector('#st-go').addEventListener('click', function () {
          var name = sheet.querySelector('#st-name').value.trim();
          if (!name) { HV.toast('Give the template a name first.'); return; }
          /* no Date.now — the id is a count plus the client, so the same demo
             step always produces the same id */
          var seq = HV.store.templates.length + 1;
          var id = 'tp-' + seq + '-' + c.id;
          while (planTemplate(id)) { seq++; id = 'tp-' + seq + '-' + c.id; }

          /* the overrides baked down into ordinary days — after this the new
             template stands on its own and owes the client nothing */
          var days = JSON.parse(JSON.stringify(base.days));
          Object.keys(a.overrides || {}).forEach(function (k) {
            var o = a.overrides[k];
            if (o && o.slots && days[k]) days[k].slots = JSON.parse(JSON.stringify(o.slots));
          });

          /* a promoted plan carries the client's own targets when they set
             some — written onto day 1 of the copy, where every later day
             inherits them; the baked days already carry any per-day
             statements the base template made */
          if (a.targets) {
            days[1] = days[1] || { slots: [] };
            days[1].targets = JSON.parse(JSON.stringify(a.targets));
          }
          HV.store.templates.push({
            id: id, name: name, desc: 'Adapted from ' + base.name + ' for ' + c.name,
            pillar: base.pillar, level: base.level, track: base.track,
            by: me.id, base: base.id, status: 'draft', days: days,
          });
          HV.save();
          HV.closeSheet();
          HV.refresh();
          HV.toast('Saved as a draft template — submit it when you want it published.');
        });
      }
    );
  }

  /* ---- Submit a draft template up the chain ----
     type 'template' rides HV.store.chains.template (Ops Head, then Super User);
     the entry carries templateId, and console-approvals.js publishes the
     template off THAT field on the final signature. */
  function submitTemplate(t) {
    ensureTemplateChain();
    var me = HV.me();
    var id = 'ap-tpl-' + t.id;
    var ap = (HV.store.approvals || []).find(function (a) { return a.id === id; });
    if (!ap) {
      ap = { id: id, type: 'template', templateId: t.id, title: 'Template — ' + t.name,
             ownerId: me.id, status: 'draft', stage: 0, history: [], due: 'This cycle',
             aiDraft: t.desc };
      HV.store.approvals.push(ap);
    }
    HV.approvals.submit(ap);
    HV.refresh();
    HV.toast('Sent up the chain — the Operations Head signs next.');
  }

  /* ---- the shared plan-editing surface ----
     The Catalog's template editor edits the SAME slots with the SAME sheet and
     submits drafts up the SAME chain. Exported rather than copied, so the day
     grammar and the sign-off path each exist exactly once.
     ensureTemplateChain() is the one that bites: HV.approvals.stageRole() reads
     HV.store.chains.template, which nothing seeds — any surface that submits a
     template has to call this first. */
  HV.planui = {
    slotSheet: slotSheet,
    slotEditor: slotEditor,
    optionsLine: optionsLine,
    pillarDot: pillarDot,
    ensureTemplateChain: ensureTemplateChain,
    submitTemplate: submitTemplate,
  };

  function wirePlan(el, c) {
    var body = el.querySelector('#cw-body');
    if (!body) return;
    body.addEventListener('click', function (e) {
      var ppb = e.target.closest('[data-pp]');
      if (ppb) {
        planPillar = ppb.dataset.pp; planDay = null;
        HV.refresh();
        var np = document.querySelector('[data-pp="' + planPillar + '"]');
        if (np) np.focus();
        return;
      }
      var db = e.target.closest('[data-pd]');
      if (db) {
        planDay = Number(db.dataset.pd);
        HV.refresh();
        var nd = document.querySelector('[data-pd="' + planDay + '"]');
        if (nd) nd.focus();
        return;
      }
      var pb = e.target.closest('[data-plan]');
      if (!pb) return;
      var a = pb.dataset.plan.split(':');
      if (a[0] === 'assign') assignSheet(c, planPillar);
      else if (a[0] === 'edit') editDaySheet(c, planPillar, planDay);
      else if (a[0] === 'approve') approvePlan(c, planPillar);
      else if (a[0] === 'discard') discardDraft(c, planPillar);
      else if (a[0] === 'time') timeSheet(c, planPillar);
      else if (a[0] === 'dose') doseSheet(c, planPillar);
      else if (a[0] === 'targets') targetsSheet(c);
      else if (a[0] === 'savetpl') saveTemplateSheet(c, planPillar);
      else if (a[0] === 'join') HV.meetui.join(a[1], Number(a[2]));
      else if (a[0] === 'submit') { var t = planTemplate(a[1]); if (t) submitTemplate(t); }
    });
  }

  /* ================= panel 3 · the scratch pad =================
     The Assistant reads the client's live state once and proposes a starting set
     of suggestions; from then on every decision belongs to the humans (kept in
     HV.store, so it survives reloads and vanishes with a demo reset).
     A suggestion: { id, kind: reply|action|flag|note, title, ev (evidence),
     text, status: open|accepted|rejected|posted|later }. */

  /* context-appropriate warm suggested reply (AI draft — a human always sends) */
  function suggestReply(c) {
    var f = first(c.name);
    if (c.risk === 'high') {
      return 'No pressure at all, ' + f + ' — we saved your progress exactly where you left it. Even one small photo today counts.';
    }
    if (c.observation) {
      return 'Lovely pace, ' + f + ' — these first days we simply learn your normal. Photos, not judgement.';
    }
    var msgs = circleMsgs(c.id);
    var lastClient = null;
    msgs.forEach(function (m) { if (m.fromId === 'client') lastClient = m; });
    if (lastClient && lastClient.kind === 'meal') {
      return 'Thanks for logging, ' + f + ' — one gentle tweak for next time: swap the fried side for a roasted one and this plate is spot on.';
    }
    if (c.riskWhy && c.riskWhy.indexOf('review') !== -1) {
      return 'Big day, ' + f + ' — whatever the grid says this afternoon, this cycle was your strongest yet.';
    }
    return 'Lovely consistency this week, ' + f + ' — keep the rhythm going, one day at a time.';
  }

  function padSeq() { HV.store.padSeq = (HV.store.padSeq || 0) + 1; return HV.store.padSeq; }

  function defaultSuggestions(c) {
    var f = first(c.name);
    var out = [];
    /* a reply drafted from the thread's latest context */
    out.push({
      id: 'sg' + padSeq(), kind: 'reply', title: 'Suggested reply', status: 'open',
      ev: c.risk === 'high' ? '3 silent days · progress saved where they left it'
        : c.observation ? 'observation pace · photos coming in'
        : 'the latest messages in ' + f + '’s thread',
      text: suggestReply(c),
    });
    /* one action read from the client's live state */
    if (c.risk === 'high') {
      out.push({ id: 'sg' + padSeq(), kind: 'action', title: 'Win-back call', status: 'open',
        ev: 'non-response ladder · step 2',
        text: 'Schedule a 10-minute call with ' + f + ' today — step 2 of the ladder after 3 silent days.' });
    } else if (c.observation) {
      out.push({ id: 'sg' + padSeq(), kind: 'action', title: 'Photo cadence', status: 'open',
        ev: 'observation · day ' + c.day + ' of 5',
        text: 'Queue a gentle photo reminder for tomorrow morning — collection sits at 7 of 10.' });
    } else if (c.day >= 8) {
      out.push({ id: 'sg' + padSeq(), kind: 'action', title: 'Level review prep', status: 'open',
        ev: 'day ' + c.day + ' of 11 · review imminent',
        text: 'Assemble ' + f + '’s Day-' + HV.reviewDay() + ' review pack tonight so the pod signs it together.' });
    } else {
      out.push({ id: 'sg' + padSeq(), kind: 'action', title: 'Reminder shift', status: 'open',
        ev: 'lunch logs landing late',
        text: 'Move ' + f + '’s lunch reminder to 12:45 pm — the late logs cluster just after noon.' });
    }
    /* the watch-flag the Copilot used to drop into the team lane — the Teams
       tab is humans-only now, so the AI's own reads surface here instead */
    var aiNote = circleMsgs(c.id).filter(function (m) { return m.kind === 'teamonly' && m.fromId === 'ai'; }).pop();
    if (aiNote) {
      out.push({ id: 'sg' + padSeq(), kind: 'flag', title: 'Watch flag', status: 'open',
        ev: 'the Assistant’s own read of the thread', text: aiNote.text });
    }
    return out;
  }

  /* the local defaultAutos is gone — it built four rows with no `key`, so it
     silently disagreed with the seed's five and left a promoted client unable
     to switch off the only automation that ran. HV.defaultAutos is now the one
     generator; see core.js. */

  function padSuggestions(cid) {
    var s = HV.store;
    s.padSug = s.padSug || {};
    if (!s.padSug[cid]) { s.padSug[cid] = defaultSuggestions(HV.client(cid)); HV.save(); }
    return s.padSug[cid];
  }

  function autos(cid) {
    var s = HV.store;
    s.padAuto = s.padAuto || {};
    if (!s.padAuto[cid]) { s.padAuto[cid] = HV.defaultAutos(HV.client(cid)); HV.save(); }
    return s.padAuto[cid];
  }

  /* Teams tab — the humans' lane. The Assistant never writes here; its own
     reads surface as Watch flags on the Assistant tab instead. */
  function teamHtml(cid, me) {
    var c = HV.client(cid);
    var msgs = circleMsgs(cid).filter(function (m) { return m.kind === 'teamonly' && m.fromId !== 'ai'; });
    var lane = msgs.length
      ? '<div class="chat">' + msgs.map(function (m) {
          var mine = m.fromId === me.id;
          return '<div class="msg ' + (mine ? 'me' : 'them') + '">' +
            (mine ? '' : '<span class="who">' + HV.esc(first(HV.staff(m.fromId).name)) + '</span>') +
            HV.esc(m.text) +
            '<span class="when">' + HV.esc(HV.ago(m.minsAgo)) + '</span></div>';
        }).join('') + '</div>'
      : HV.ui.empty('chat', 'No internal notes yet — think aloud here.');
    return '<div class="padband">' + HV.ui.icon('lock') +
      '<span>Team only — ' + HV.esc(first(c.name)) + ' never sees this panel</span></div>' + lane;
  }

  /* Assistant tab — the suggestion queue. Tick accepts, cross rejects, the send
     mark posts a drafted reply into the client thread under YOUR name, the clock
     parks it for later, Refine asks the AI to rewrite. */
  var SUG_ICON = { reply: 'chat', action: 'target', flag: 'warn', note: 'pencil' };

  function sugCard(s) {
    if (s.status === 'later') return '';   /* parked items render in Later */
    if (s.status !== 'open') {
      var mark = s.status === 'accepted' ? 'check' : s.status === 'posted' ? 'send' : 'x';
      var word = s.status === 'accepted' ? 'Accepted — logged'
        : s.status === 'posted' ? 'Posted to the client thread, signed by you'
        : 'Rejected — logged, the Assistant learns';
      return '<div class="sug done">' + HV.ui.icon(mark) + '<span>' + HV.esc(s.title) + ' · ' + word + '</span></div>';
    }
    return '<div class="sug" data-sid="' + HV.esc(s.id) + '">' +
      '<div class="sug-k">' + HV.ui.icon(SUG_ICON[s.kind] || 'sparkle') + HV.esc(s.title) + '</div>' +
      '<div class="sug-t">“' + HV.esc(s.text) + '”</div>' +
      '<div class="audit">Why: ' + HV.esc(s.ev) + '</div>' +
      '<div class="sug-acts">' +
        '<button class="ib" data-sact="accept" aria-label="Accept" title="Accept">' + HV.ui.icon('check') + '</button>' +
        '<button class="ib no" data-sact="reject" aria-label="Reject" title="Reject">' + HV.ui.icon('x') + '</button>' +
        (s.kind === 'reply' || s.kind === 'note'
          ? '<button class="ib go" data-sact="post" aria-label="Post to the client thread" title="Post to the client thread">' + HV.ui.icon('send') + '</button>' : '') +
        '<button class="ib" data-sact="later" aria-label="Save for later" title="Later">' + HV.ui.icon('clock') + '</button>' +
        '<button class="btn sm ghost" data-sact="refine">' + HV.ui.icon('sparkle') + 'Refine</button>' +
      '</div>' +
    '</div>';
  }

  function laterHtml(cid) {
    var parked = padSuggestions(cid).filter(function (s) { return s.status === 'later'; });
    var rows = parked.map(function (s) {
      return '<div class="latrow"><span class="lic" aria-hidden="true">' + HV.ui.icon('clock') + '</span>' +
        '<span class="grow">' + HV.esc(s.text) + '</span>' +
        (s.kind === 'note' ? '' :
          '<button class="pico" data-lact="open:' + HV.esc(s.id) + '" aria-label="Reopen suggestion" title="Reopen">' + HV.ui.icon('caretUp') + '</button>') +
        '<button class="pico" data-lact="del:' + HV.esc(s.id) + '" aria-label="Remove" title="Remove">' + HV.ui.icon('x') + '</button>' +
      '</div>';
    }).join('');
    return (rows || '<p class="sub" style="margin:0">Nothing parked.</p>') +
      '<div class="row" style="margin-top:var(--s3)">' +
        '<input class="input" id="lat-new" placeholder="Park a note for later…" aria-label="Park a note for later" autocomplete="off" style="flex:1; min-width:0">' +
        '<button class="btn sm" id="lat-add">Add</button>' +
      '</div>';
  }

  function assistHtml(c) {
    var f = first(c.name);
    var active = padSuggestions(c.id).filter(function (s) { return s.status !== 'later'; });
    var cards = active.map(sugCard).join('') ||
      '<p class="sub" style="margin:0">Nothing right now — the Assistant re-reads after every new message in ' + HV.esc(f) + '’s thread.</p>';
    return '<div class="padwho"><span class="aimark" aria-hidden="true">' + HV.ui.icon('sparkle') + '</span>' +
      '<span class="grow"><b>Assistant</b><small>Reads ' + HV.esc(f) + '’s thread and the team’s duties — suggests, never sends on its own</small></span></div>' +
      '<div class="padsec"><div class="padsec-t">Suggestions</div>' + cards + '</div>' +
      '<div class="padsec"><div class="padsec-t">Later</div>' + laterHtml(c.id) + '</div>' +
      '<p class="audit" style="margin:0">Accept, reject, post or park — every decision is logged; a named human signs every send.</p>';
  }

  /* Automations tab — standing instructions the Assistant runs */
  function autoRow(a) {
    return '<div class="padauto">' +
      '<span class="grow"><b>' + HV.esc(a.label) + '</b><small>' + HV.esc(a.desc) + '</small></span>' +
      '<button class="tsw' + (a.on ? ' on' : '') + '" data-auto="' + HV.esc(a.id) + '" role="switch" aria-checked="' + (a.on ? 'true' : 'false') + '" aria-label="' + HV.esc(a.label) + '"></button>' +
    '</div>';
  }

  /* a journey is a house-authored run of messages on the client's own clock;
     the switch is the subscription. The row shows nothing the template does
     not currently say — no per-client copy of the name — so renaming one in
     Configuration cannot leave stale text on twelve client records. */
  function flowRow(c, t) {
    var on = HV.flowOn(c.id, t.id);
    var n = (t.steps || []).length;
    var when = t.trigger === 'cycleDay' ? 'every cycle' : 'once, from joining';
    return '<div class="padauto">' +
      '<span class="grow"><b>' + HV.esc(t.name) + '</b><small>' +
        '<span class="num">' + n + '</span> step' + (n === 1 ? '' : 's') + ' · ' + when +
        (t.enabled === false ? ' · paused for everyone' : '') +
      '</small></span>' +
      '<button class="tsw' + (on ? ' on' : '') + '" data-flow="' + HV.esc(t.id) + '"' +
        ' role="switch" aria-checked="' + (on ? 'true' : 'false') + '"' +
        ' aria-label="' + HV.esc(t.name) + '"></button>' +
    '</div>';
  }

  function autosTabHtml(c) {
    var f = first(c.name);
    var flows = HV.flowTemplates();
    return '<p class="sub" style="margin:0">A journey is a run of messages on ' + HV.esc(f) +
        '’s own clock; a standing rule watches for a condition. Flip either off and it stops instantly.</p>' +
      (flows.length
        ? '<div class="padsec"><div class="padsec-t">Journeys</div>' +
          flows.map(function (t) { return flowRow(c, t); }).join('') + '</div>'
        : '') +
      '<div class="padsec"><div class="padsec-t">Standing rules</div>' +
        autos(c.id).map(autoRow).join('') + '</div>' +
      '<p class="audit" style="margin:0">Every automated message lands in the timeline stamped “automated” — ' +
      'nothing sends silently. Switching a journey on starts it from today; steps ' + HV.esc(f) +
      ' has already passed are not back-filled.</p>';
  }

  function padHtml(cid, me) {
    var c = HV.client(cid);
    var padW = (HV.store.ui && HV.store.ui.padW)
      ? ' style="--padw:' + Number(HV.store.ui.padW) + 'px"' : '';
    return '<div class="ccdiv" role="separator" aria-orientation="vertical" tabindex="0" aria-label="Resize scratch pad"' +
        ' aria-valuemin="264" aria-valuemax="560" aria-valuenow="' + ((HV.store.ui && HV.store.ui.padW) || 332) + '"' +
        ' title="Drag to resize · double-click or Enter to reset"></div>' +
      '<aside class="ccpad"' + padW + ' aria-label="Scratch pad">' +
        '<div class="padtabs">' +
          '<button data-pt="team" class="' + (padTab === 'team' ? 'on' : '') + '">Teams</button>' +
          '<button data-pt="assist" class="' + (padTab === 'assist' ? 'on' : '') + '">Assistant<span class="aimark" aria-hidden="true">' + HV.ui.icon('sparkle') + '</span></button>' +
          '<button data-pt="auto" class="' + (padTab === 'auto' ? 'on' : '') + '">Automations</button>' +
        '</div>' +
        '<div class="padbody">' +
          (padTab === 'team' ? teamHtml(cid, me) : padTab === 'assist' ? assistHtml(c) : autosTabHtml(c)) +
        '</div>' +
        (padTab === 'team'
          ? '<div class="padfoot"><input class="input" id="tm-input" placeholder="Note to the team…" aria-label="Team-only note" autocomplete="off">' +
            '<button class="btn sm quiet" id="tm-send">' + HV.ui.icon('lock') + 'Post</button></div>'
          : '') +
      '</aside>';
  }

  /* ---------------- refine-with-AI sheet ----------------
     The Assistant rewrites a suggestion on request — canned spins in the demo,
     a model call in production. The human always saves (or doesn't); nothing
     changes without their hand. */
  function openRefineSheet(cid, sid) {
    var s = padSuggestions(cid).find(function (x) { return x.id === sid; });
    if (!s) return;
    var c = HV.client(cid);
    var f = first(c.name);
    var base = s.text;
    var decap = function (t) { return t.charAt(0).toLowerCase() + t.slice(1); };
    var cut = base.search(/[.!?]/);
    /* each spin works from the ORIGINAL text, so tapping chips never compounds */
    var SPIN = {
      warmer: 'Lovely rhythm this week, ' + f + ' — ' + decap(base),
      shorter: cut > 0 ? base.slice(0, cut + 1) : base,
      firmer: 'Let’s keep it simple, ' + f + ': ' + decap(base),
      specific: base + ' Your team reads this together at the Day-' + HV.reviewDay() + ' review.',
    };
    HV.sheet(
      '<div class="h2">Refine with the Assistant</div>' +
      '<p class="sub" style="margin:0">The AI rewrites; you decide. A send still carries your name.</p>' +
      '<textarea class="input" id="rf-text" aria-label="Suggestion text">' + HV.esc(s.text) + '</textarea>' +
      '<div>' +
        '<button class="chip" data-rf="warmer">Warmer</button>' +
        '<button class="chip" data-rf="shorter">Shorter</button>' +
        '<button class="chip" data-rf="firmer">Firmer</button>' +
        '<button class="chip" data-rf="specific">More specific</button>' +
      '</div>' +
      '<div class="row" style="justify-content:flex-end">' +
        '<button class="btn ghost" id="rf-cancel">Cancel</button>' +
        '<button class="btn" id="rf-save">Save refinement</button>' +
      '</div>',
      function (sheet) {
        var ta = sheet.querySelector('#rf-text');
        sheet.querySelectorAll('[data-rf]').forEach(function (ch) {
          ch.addEventListener('click', function () { ta.value = SPIN[ch.dataset.rf]; ta.focus(); });
        });
        sheet.querySelector('#rf-cancel').addEventListener('click', HV.closeSheet);
        sheet.querySelector('#rf-save').addEventListener('click', function () {
          var v = ta.value.trim();
          if (v) s.text = v;
          HV.save();
          HV.closeSheet();
          HV.refresh();
          HV.toast('Refined — the suggestion now reads your way.');
        });
      }
    );
  }

  /* ================= panel 2 · shell ================= */

  /* The SECOND clock, beside the first. The programme runs HV.levels() ×
     HV.cycleDays() days; the term is what the client has paid for. A client
     at Cycle 3 · Day 6 with 57 days left is correct and would read as a
     contradiction if either number stood alone — so both are always labelled
     and neither ever shows a bare figure. */
  function termBar(c) {
    var t = HV.termOf(c);
    var tone = t.ended ? 'bad' : t.left <= 14 ? 'warn' : 'ok';
    var text = t.ended
      ? 'Term ended <span class="num">' + Math.abs(t.left) + '</span> d ago'
      : '<span class="num">' + t.left + '</span> days left of <span class="num">' + t.days + '</span>';
    return '<span class="ctermb ' + tone + '" data-term title="Engagement term — ends ' +
      HV.esc(t.endISO) + '">' +
      '<span class="ctbar"><i style="width:' + t.pct + '%"></i></span>' +
      '<small>' + text + '</small></span>';
  }

  function headHtml(c, tab) {
    return '<header class="cchead">' +
      '<button class="btn sm ghost cwback" data-goto="#/clients" aria-label="Back to all clients">' + HV.ui.icon('chevL') + '</button>' +
      HV.ui.avatar(c.name) +
      /* the open client is the page — their name carries the route's h1, wearing
         the header's own type so nothing moves */
      '<span class="grow"><h1 class="ccname">' + HV.esc(c.name) + '</h1>' +
      '<small>' + HV.esc(c.tier) + ' · ' +
        (c.observation
          ? 'Observation · <span class="num">Day ' + c.day + '</span>'
          : 'Cycle <span class="num">' + c.cycle + '</span> · <span class="num">Day ' + c.day + '</span>') +
      '</small></span>' +
      termBar(c) +
      (c.observation ? '' : '<span class="row" style="gap:var(--s2); align-items:center">' +
        sessionRings(c, 'sm') + headerIndex(c) + '</span>') +
      planChip(c) +
      riskPill(c.risk) +
      celChips(c) +
      (tab === 'circle' ? HV.ui.pill('Client-visible', 'ok') : '') +
    '</header>';
  }

  function tabsHtml(c, tab) {
    var un = HV.unread(c.id);
    return '<div class="tabs cwtabs">' + TABS.map(function (t) {
      var badge = t.id === 'circle' && un ? ' <span class="pill info"><span class="num">' + un + '</span></span>' : '';
      return '<button data-cwtab="' + t.id + '" class="' + (tab === t.id ? 'on' : '') + '"' +
        (tab === t.id ? ' aria-current="page"' : '') + '>' + t.label + badge + '</button>';
    }).join('') + '</div>';
  }

  function bodyFor(c, tab) {
    if (tab === 'circle') {
      return (c.observation ? '<div class="notice">Observation days 1–5 — no ratings or scores appear in this thread yet.</div>' : '') +
        HV.chatui.thread(c.id, { teamonly: false });
    }
    if (tab === 'plan') return planHtml(c);
    if (tab === 'trackers') return trackersHtml(c);
    if (tab === 'emotions') return emotionsHtml(c);
    if (tab === 'docs') return documentsHtml(c);
    if (tab === 'logs') return HV.clientRecord.logsHtml(c);
    if (tab === 'meetings') return HV.clientRecord.meetingsHtml(c);
    if (tab === 'notes') return notesHtml(c);
    return overviewHtml(c);
  }

  function middleHtml(c, tab) {
    if (!c) {
      return '<div class="ccscroll">' +
        HV.ui.empty('users', 'Select a client to open their workspace.',
          'Their thread, plan, trackers and documents all live behind one row.') +
      '</div>';
    }
    return headHtml(c, tab) + tabsHtml(c, tab) +
      '<div class="ccscroll" id="cw-body">' + bodyFor(c, tab) + '</div>' +
      (tab === 'circle'
        ? '<div class="cccomposer">' + HV.chatui.composer('cw', {
            teamonly: false,
            placeholder: 'Message ' + first(c.name) + ' — lands in their app',
          }) + '</div>'
        : '');
  }

  /* `prospect` is an onboarding entry rather than a client: it takes the same
     middle panel and the same rail, but no scratch pad — there is no thread to
     be private about yet, and no pod to be private from. */
  function workspaceHtml(c, tab, me, incoming, prospect) {
    var openId = c ? c.id : (prospect ? prospect.id : null);
    var mode = (c || prospect) ? ' open' : '';
    var middle = prospect
      ? HV.onboarding.workspaceHtml(prospect)
      : middleHtml(c, tab);
    return C360_CSS + '<div class="ccwrap cw' + mode + '">' +
      '<aside class="cwrail" aria-label="Clients">' +
        railHtml(openId, incoming) +
      '</aside>' +
      '<section class="ccchat" aria-label="Client workspace">' + middle + '</section>' +
      (c ? padHtml(c.id, me) : '') +
    '</div>';
  }

  /* the blocked states render as normal flowing pages, not the workspace */
  function guardHtml(cid) {
    var back = '<button class="btn sm ghost" data-goto="#/clients" style="align-self:flex-start">' + HV.ui.icon('chevL') + 'All clients</button>';
    if (!HV.client(cid)) {
      return back + HV.ui.empty('leaf', 'This client is not in the demo slice.');
    }
    return back + '<div class="empty"><span class="big">' + HV.ui.icon('lock') + '</span>Not allocated to you — access logged.<br>' +
      '<span class="audit">RBAC AC-4.6.4 · staff see only the clients allocated to their pod.</span></div>';
  }

  /* ---------------- workspace wiring ---------------- */

  /* the workspace seam. The mechanism lives in core (HV.wireSplitter) because
     the Catalog's template day editor hangs a panel off the same grammar; the
     numbers here are this surface's own. */
  function wireSplitter(el) {
    HV.wireSplitter(el, { div: '.ccdiv', pad: '.ccpad', cssVar: '--padw',
                          key: 'padW', min: 264, max: 560, def: 332 });
  }

  /* the sidebar badge was computed BEFORE markRead ran (the shell renders
     first) — sync it, or the menu keeps a count this panel just cleared */
  function syncNavBadge() {
    var navBtn = document.querySelector('.side nav button[data-r="#/clients"]');
    if (!navBtn || !HV.navCounts) return;
    var n = HV.navCounts().clients;
    var badge = navBtn.querySelector('.count');
    if (badge) { if (n) badge.textContent = n; else badge.remove(); }
    var lbl = navBtn.querySelector('.lbl');
    if (lbl) navBtn.setAttribute('aria-label', lbl.textContent + (n ? ' (' + n + ')' : ''));
  }

  function wireWorkspace(el, cid, tab, me) {
    var c = HV.client(cid);

    if (tab === 'circle') {
      HV.chatui.wireComposer(el, cid, 'cw');
      var ci = el.querySelector('#cw-input');
      var cs = el.querySelector('#cw-sendclient');
      if (ci && cs) ci.addEventListener('keydown', function (e) { if (e.key === 'Enter') cs.click(); });
      /* land on the newest message — the panel scrolls, not the page */
      var sc = el.querySelector('.ccscroll');
      if (sc) setTimeout(function () { sc.scrollTop = sc.scrollHeight; }, 0);
      syncNavBadge();
    }

    if (tab === 'plan') wirePlan(el, c);

    /* the pad's team lane: humans only, and it posts to the internal thread */
    var ti = el.querySelector('#tm-input');
    var ts = el.querySelector('#tm-send');
    function postTeam() {
      var v = ti ? ti.value.trim() : '';
      if (!v) { HV.toast('Write a line first. Nothing sends on its own.'); return; }
      HV.pushMsg(cid, { fromId: me.id, kind: 'teamonly', text: v });
      HV.markRead(cid);
      HV.refresh();
      HV.toast('Posted to the team pad. ' + first(c.name) + ' cannot see it.');
      var ni = document.getElementById('tm-input');
      if (ni) ni.focus();
    }
    if (ts) ts.addEventListener('click', postTeam);
    if (ti) ti.addEventListener('keydown', function (e) { if (e.key === 'Enter') postTeam(); });

    var ln = el.querySelector('#lat-new');
    var la = el.querySelector('#lat-add');
    function addLater() {
      var v = ln ? ln.value.trim() : '';
      if (!v) { HV.toast('Write the note first.'); return; }
      padSuggestions(cid).push({ id: 'sg' + padSeq(), kind: 'note', title: 'Your note', ev: 'added by you', text: v, status: 'later' });
      HV.save();
      HV.refresh();
      HV.toast('Parked — the Assistant holds it for you.');
      var ni = document.getElementById('lat-new');
      if (ni) ni.focus();
    }
    if (la) la.addEventListener('click', addLater);
    if (ln) ln.addEventListener('keydown', function (e) { if (e.key === 'Enter') addLater(); });

    var noteSave = el.querySelector('#cw-note-save');
    if (noteSave) noteSave.addEventListener('click', function () {
      c.notes = el.querySelector('#cw-note').value.trim();
      HV.save();
      HV.toast('Note saved · visible to the pod only');
    });

    wireC360(el, c);
    HV.clientRecord.wire(el, c);
    wireSplitter(el);
  }

  /* ---------------- view registration ---------------- */

  HV.registerView('clients', {
    title: 'Clients',
    /* no roles array on purpose: console access is nav membership (HV.allowedView),
       so a runtime-created role gains this page by ticking Clients in People & Access */
    render: function (el, params) {
      var me = HV.me();
      var cid = params && params[0] ? params[0] : null;
      var tab = params && params[1] ? params[1] : 'overview';
      if (!TABS.some(function (t) { return t.id === tab; })) tab = 'overview';

      var c = cid ? HV.client(cid) : null;
      var allowed = !!(c && HV.myClients().some(function (x) { return x.id === c.id; }));
      var incoming = HV.boardsFor(['incoming'])[0] || null;

      /* the id might name an ARRIVAL rather than a client — pipeline ids never
         collide with client ids, so one lookup decides which rail we are on and
         a deep link to an arrival works exactly like a deep link to a client */
      var prospect = (!c && cid && incoming && HV.onboarding) ? HV.onboarding.find(cid) : null;
      if (prospect) railTab = 'onboarding';

      /* unknown or unallocated client: a flowing page, not the workspace */
      if (cid && !allowed && !prospect) {
        el.innerHTML = guardHtml(cid);
        el.addEventListener('click', function (e) {
          var go = e.target.closest('[data-goto]');
          if (go) HV.go(go.dataset.goto);
        });
        return;
      }

      if (railTab === 'onboarding' && !incoming) railTab = 'clients';
      if (cid !== lastPadCid) { lastPadCid = cid; padTab = 'team'; }

      /* opening the Circle tab IS reading the thread — mark before building HTML */
      if (allowed && tab === 'circle') HV.markRead(cid);

      /* workspace mode fills the viewport and scrolls inside its panels */
      el.classList.add('cc3');
      el.innerHTML = workspaceHtml(allowed ? c : null, tab, me, incoming, prospect);

      /* the rail's search filters in place — a full re-render would take the
         focus (and the caret) away between two keystrokes */
      function paintList() {
        var list = el.querySelector('#cw-list');
        if (!list) return;
        list.innerHTML = railTab === 'onboarding'
          ? obRailHtml(prospect ? prospect.id : null)
          : railListHtml(allowed ? c.id : null);
      }
      var q = el.querySelector('#cw-q');
      if (q) q.addEventListener('input', function () { railQuery = q.value; paintList(); });

      if (prospect) {
        /* the arrival's own panel repaints itself on a stage change rather than
           calling HV.refresh(), so the rail keeps its search text and scroll */
        HV.onboarding.wireWorkspace(el, prospect, function () { HV.go('#/clients/' + prospect.id); HV.refresh(); });
      }

      if (allowed) {
        HV.chatui.wire(el, cid);
        wireWorkspace(el, cid, tab, me);
      }

      /* one delegated click handler for the rail, the tabs and the pad */
      el.addEventListener('click', function (e) {
        var go = e.target.closest('[data-goto]');
        if (go) { HV.go(go.dataset.goto); return; }

        var row = e.target.closest('[data-cid]');
        if (row) {
          /* an arrival has no tabs to preserve — only a client carries one */
          HV.go('#/clients/' + row.dataset.cid + (railTab === 'onboarding' ? '' : '/' + tab));
          return;
        }

        var rt = e.target.closest('[data-rt]');
        if (rt) {
          railTab = rt.dataset.rt;
          railQuery = '';
          /* switching rails clears the selection — the person you had open
             lives on the other list, so keeping them open reads as a bug */
          if (cid) HV.go('#/clients'); else HV.refresh();
          return;
        }

        var fil = e.target.closest('[data-fil]');
        if (fil) {
          railFilter = fil.dataset.fil;
          el.querySelectorAll('[data-fil]').forEach(function (b) {
            var on = b.dataset.fil === railFilter;
            b.classList.toggle('on', on);
            b.setAttribute('aria-pressed', String(on));
          });
          paintList();
          return;
        }

        var ct = e.target.closest('[data-cwtab]');
        if (ct && cid) { HV.go('#/clients/' + cid + '/' + ct.dataset.cwtab); return; }

        var pt = e.target.closest('[data-pt]');
        if (pt) {
          padTab = pt.dataset.pt;
          HV.refresh();
          var nb = document.querySelector('[data-pt="' + padTab + '"]');
          if (nb) nb.focus();
          return;
        }

        if (!allowed) return;

        var raw = e.target.closest('[data-raw]');
        if (raw) { HV.toast('Raw record opened · access logged'); return; }

        /* Assistant suggestion actions: tick / cross / send / clock / refine */
        var sa = e.target.closest('[data-sact]');
        if (sa) {
          var card = e.target.closest('[data-sid]');
          var s = card && padSuggestions(cid).find(function (x) { return x.id === card.dataset.sid; });
          if (!s) return;
          var a = sa.dataset.sact;
          if (a === 'refine') { openRefineSheet(cid, s.id); return; }
          if (a === 'post') {
            HV.pushMsg(cid, { fromId: me.id, kind: 'text', text: s.text });
            s.status = 'posted';
            HV.markRead(cid);
            HV.save();
            HV.refresh();
            HV.toast('Posted to ' + first(HV.client(cid).name) + '’s thread, signed by you.');
            return;
          }
          s.status = a === 'accept' ? 'accepted' : a === 'reject' ? 'rejected' : 'later';
          HV.save();
          HV.refresh();
          HV.toast(a === 'accept' ? 'Accepted — logged. The Assistant will set it up.'
            : a === 'reject' ? 'Rejected — logged. The Assistant learns from it.'
            : 'Parked for later.');
          return;
        }

        /* Later list: reopen a parked suggestion, or drop it */
        var lact = e.target.closest('[data-lact]');
        if (lact) {
          var at = lact.dataset.lact.split(':');
          var list = padSuggestions(cid);
          var ls = list.find(function (x) { return x.id === at[1]; });
          if (!ls) return;
          if (at[0] === 'open') ls.status = 'open';
          else HV.store.padSug[cid] = list.filter(function (x) { return x.id !== at[1]; });
          HV.save();
          HV.refresh();
          return;
        }

        /* automations flip in place — a full refresh would throw away the pad's
           scroll position for a one-bit change */
        var au = e.target.closest('[data-auto]');
        if (au) {
          var at2 = autos(cid).find(function (x) { return x.id === au.dataset.auto; });
          if (!at2) return;
          at2.on = !at2.on;
          HV.save();
          au.classList.toggle('on', at2.on);
          au.setAttribute('aria-checked', String(at2.on));
          HV.toast((at2.on ? 'On — ' : 'Paused — ') + at2.label);
          return;
        }

        /* a journey subscription. HV.setFlow carries the catch-up rule with
           it — switching one on marks the steps this client has already
           passed as skipped, so nobody receives a fortnight of back issues
           in one afternoon. */
        var fl = e.target.closest('[data-flow]');
        if (fl) {
          var tpl = HV.flowTemplate(fl.dataset.flow);
          if (!tpl) return;
          var now = !HV.flowOn(cid, tpl.id);
          HV.setFlow(cid, tpl.id, now);
          fl.classList.toggle('on', now);
          fl.setAttribute('aria-checked', String(now));
          HV.toast(now
            ? 'On — ' + tpl.name + '. It starts from today; earlier steps are not back-filled.'
            : 'Paused — ' + tpl.name + '. Nothing further sends for this client.');
        }
      });

      el.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var row = e.target.closest('.trow[data-cid]');
        if (row) { e.preventDefault(); row.click(); }
      });
    },
  });

  /* legacy deep links — #/client/<id> from sheets, docs and older sessions.
     location.replace, not HV.go: an assignment would leave the dead route in
     history and Back would bounce straight forward again. */
  HV.registerView('client', {
    title: 'Client',
    render: function (el, params) {
      var id = params && params[0] ? params[0] : '';
      location.replace(location.pathname + location.search + '#/clients' + (id ? '/' + id : ''));
    },
  });
})();
