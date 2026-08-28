/* HAALVING console ops — CC-10 Work List / Deviations / Live board / Calorie log / Incentives,
   plus Reports & Exports. "The productised spreadsheets." */
(function () {
  'use strict';

  /* ---------------- Work List & Ops Boards (CC-10) ---------------- */

  /* the ONE scoping expression for who sees which worklist rows — seeAllClients
     (not the old role==='admin'||role==='opshead' literal) is the perm the rest
     of this rework already uses for "sees everyone's work", so the work board's
     tab badge (count, below) and its body (renderWorkTab, below) have to read
     off this same function or the two silently drift apart per role. */
  function scopedWorklist(me) {
    return HV.can('seeAllClients')
      ? HV.store.worklist
      : HV.store.worklist.filter(function (w) { return w.owner === me.id; });
  }

  /* module-local filter state for the work board's chip row — chip clicks
     re-mount the board body only, never HV.refresh(), so this state (and the
     rest of the Queues page around it) survives a filter change */
  var workFilter = { status: 'open', pillar: null, type: null, owner: null };
  var TYPE_LABELS = { task: 'Task', rating: 'Rating', review: 'Review', report: 'Session report' };
  var STATUS_OPTS = [{ v: 'open', t: 'Open' }, { v: 'done', t: 'Done' }];
  var TYPE_OPTS = [{ v: '', t: 'All types' }].concat(Object.keys(TYPE_LABELS).map(function (k) {
    return { v: k, t: TYPE_LABELS[k] };
  }));
  function pillarOpts() {
    return [{ v: '', t: 'All pillars' }].concat(Object.keys(HV.PILLARS).map(function (k) {
      return { v: k, t: HV.PILLARS[k].name };
    }));
  }
  function staffAll() { return HV.store.users.filter(function (u) { return u.role !== 'client'; }); }

  /* one .tfil row per filter dimension (the grammar from client Trackers) —
     the chosen option wears the filled pill, the rest stay bare text */
  function tfilRow(label, opts, current, dataKey) {
    return '<div class="tfil" role="group" aria-label="' + HV.esc(label) + '">' +
      opts.map(function (o) {
        var on = (o.v || null) === (current || null);
        return '<button data-wf="' + dataKey + '" data-wv="' + HV.esc(o.v) + '" class="' + (on ? 'on' : '') + '"' +
          (on ? ' aria-current="true"' : '') + '>' + HV.esc(o.t) + '</button>';
      }).join('') + '</div>';
  }

  function workFilterHtml(seeAll) {
    return '<div style="display:flex; flex-direction:column; gap:var(--s1)">' +
      tfilRow('Status', STATUS_OPTS, workFilter.status, 'status') +
      tfilRow('Pillar', pillarOpts(), workFilter.pillar, 'pillar') +
      tfilRow('Type', TYPE_OPTS, workFilter.type, 'type') +
      (seeAll
        ? '<select class="input sel" id="wf-owner" aria-label="Owner">' +
            '<option value="">Everyone</option>' +
            staffAll().map(function (u) {
              return '<option value="' + HV.esc(u.id) + '"' + (workFilter.owner === u.id ? ' selected' : '') + '>' + HV.esc(u.name) + '</option>';
            }).join('') +
          '</select>'
        : '') +
    '</div>';
  }

  function filterWorklist(items) {
    return items.filter(function (w) {
      var st = w.status === 'done' ? 'done' : 'open';
      if (workFilter.status && st !== workFilter.status) return false;
      if (workFilter.pillar && w.pillar !== workFilter.pillar) return false;
      if (workFilter.type && w.type !== workFilter.type) return false;
      if (workFilter.owner && w.owner !== workFilter.owner) return false;
      return true;
    });
  }

  function renderWorkTab(me) {
    var scoped = scopedWorklist(me);
    var items = filterWorklist(scoped);
    if (!items.length) {
      return HV.ui.empty('leaf', scoped.length
        ? 'No tasks match these filters.'
        : 'No tasks for you right now — the rules are quiet.');
    }
    /* open tasks first; done tasks sink to the bottom (stable sort keeps rule order) */
    var sorted = items.slice().sort(function (a, b) {
      return (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0);
    });
    var rows = sorted.map(function (w) {
      var owner = HV.staff(w.owner);
      var done = w.status === 'done';
      return '<div class="trow"' + (done ? ' style="opacity:.55"' : '') + '>' +
        '<div class="grow"' + (done ? ' style="text-decoration:line-through"' : '') + '>' +
          HV.esc(w.text) +
          '<small>' + HV.esc(owner ? owner.name : '—') + '</small>' +
        '</div>' +
        (done ? HV.ui.pill('Done', 'ok') : '<span class="pill ' + w.pill + '"><span class="num">' + HV.esc(w.due) + '</span></span>') +
        /* a report row is completed by WRITING the report, not by ticking a
           box — the tick stays available so a row can still be dismissed,
           but File is the honest action and leads the pair.
           Only the OWNER gets it: the report is filed under whoever clicks,
           so an admin (who sees every row) would otherwise sign a colleague's
           session with their own name. */
        (done || w.type !== 'report' || w.owner !== me.id ? '' :
          '<button class="btn sm" data-file="' + HV.esc(w.taskId) + '|' + HV.esc(w.dateISO) + '">File</button>') +
        (done ? '' : '<button class="btn sm quiet" data-done="' + HV.esc(w.id) + '">Done</button>') +
      '</div>';
    }).join('');
    return '<div class="list">' + rows + '</div>' +
      '<p class="audit">Every task traces to its generating rule.</p>';
  }

  /* ── happening now ───────────────────────────────────────────────────
     The queue is where a coach stands between jobs, so it is also the
     natural door into a room that is open right now. Ten minutes before
     the start, the same promise the client's card makes, until it ends. */
  function liveNowHtml(me) {
    var d = new Date();
    var nowMin = d.getHours() * 60 + d.getMinutes();
    var rows = [];
    (HV.store.tasks || []).forEach(function (t) {
      if (t.kind !== 'session' && t.kind !== 'meeting') return;
      var occ = HV.occursOn(t, 0);
      if (!occ) return;
      if (nowMin < occ.start - 10 || nowMin >= occ.start + occ.dur) return;
      if (!HV.meetui || !HV.meetui.mayJoin(t)) return;
      var c = t.clientId ? HV.client(t.clientId) : null;
      rows.push('<div class="trow">' + HV.ui.iconTile('video', 'sm') +
        '<span class="grow"><b>' + HV.esc(occ.title) + '</b><small>' +
          (c ? HV.esc(c.name) + ' · ' : '') +
          '<span class="num">' + HV.esc(HV.fmtTime(occ.start)) + '</span>–' +
          '<span class="num">' + HV.esc(HV.fmtTime(occ.start + occ.dur)) + '</span></small></span>' +
        '<button class="btn sm" data-joinnow="' + HV.esc(t.id) + '">Join</button></div>');
    });
    if (!rows.length) return '';
    return '<div class="sec-title">Happening now</div>' +
      '<div class="list">' + rows.join('') + '</div>';
  }

  function renderDeviationsTab() {
    var rows = HV.store.deviations.map(function (d) {
      return '<tr><td>' + HV.esc(d.client) + '</td><td>' + HV.esc(d.type) + '</td><td>' +
        HV.esc(d.state) + '</td><td>' + HV.ui.pill(d.mode, 'info') + '</td></tr>';
    }).join('');
    return '<div class="tablewrap"><table class="data">' +
      '<thead><tr><th>Client</th><th>Type</th><th>State</th><th>Mode</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<div class="notice">Target: <span class="num">−80%</span> deviations cycle-over-cycle — Ops verifies here.</div>';
  }

  function renderLiveTab() {
    var s = HV.store.opsStats;
    var allClear = s.unrated60 === 0 && s.unconfirmedCal24 === 0 && s.approvals4h === 0;
    function tile(k, v, cls) {
      return '<div class="stat"><div class="k">' + k + '</div>' +
        '<div class="v num' + (cls ? ' ' + cls : '') + '">' + HV.esc(v) + '</div></div>';
    }
    /* the reading this board exists for — on-time delivery, as an instrument */
    var onPct = parseInt(String(s.onTime), 10);
    var onTile = isNaN(onPct)
      ? tile('12:00/13:00 on-time', s.onTime, '')
      : '<div class="stat" style="display:flex;align-items:center;justify-content:center">' +
        HV.ui.dial(onPct, '12:00 / 13:00 on-time', { size: 'sm' }) + '</div>';
    return '<div class="grid3">' +
        tile('Unrated &gt; 60 min', s.unrated60, s.unrated60 > 0 ? 'bad' : '') +
        tile('Unconfirmed cal &gt; 24 h', s.unconfirmedCal24, s.unconfirmedCal24 > 0 ? 'bad' : '') +
        tile('Approvals &gt; 4 h', s.approvals4h, s.approvals4h === 0 ? 'ok' : 'bad') +
        onTile +
      '</div>' +
      (allClear ? HV.ui.empty('leaf', 'Zero open deviations — first time this month.') : '');
  }

  function renderCaloriesTab() {
    var rows = HV.store.calorieLog.map(function (r) {
      var c = HV.client(r.clientId);
      return '<tr><td>' + HV.esc(c ? c.name : '—') + '</td>' +
        '<td>' + HV.esc(r.date) + '</td>' +
        '<td class="num">' + HV.esc(r.meals) + '</td>' +
        '<td class="num">' + HV.esc(r.protein) + ' g</td>' +
        '<td class="num">' + HV.esc(r.kcal) + '</td>' +
        '<td>' + HV.esc(r.note || '—') + '</td></tr>';
    }).join('');
    return '<div class="tablewrap"><table class="data">' +
      '<thead><tr><th>Client</th><th>Date</th><th>Meals</th><th>Protein</th><th>Kcal</th><th>Note</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<div class="notice">Auto-filled from rated meals — replaces the manual calorie sheet.</div>';
  }

  /* ---- Team performance: derived live, not copied from a sheet ----
     sessions delivered = sum of c.sessions[k].done over clients whose k-seat
     resolves to this person TODAY (HV.staffFor — so an active cover inherits
     the seat's clients); meals rated + avg stars from meals[].final.byId;
     work-list open/done from ownership. Only the payout stays seeded. */
  function perfRows() {
    var s = HV.store;
    var staff = s.users.filter(function (u) {
      return u.role !== 'client' && u.role !== 'ai' && u.id !== 'u-ai' && !u.inactive;
    });
    var rows = staff.map(function (u) {
      var sessions = 0;
      s.clients.forEach(function (c) {
        Object.keys(c.sessions || {}).forEach(function (k) {
          if (HV.staffFor(c, k).id === u.id) sessions += (c.sessions[k].done || 0);
        });
      });
      var rated = (s.meals || []).filter(function (m) { return m.final && m.final.byId === u.id; });
      var avg = rated.length
        ? Math.round(rated.reduce(function (t, m) { return t + m.final.stars; }, 0) / rated.length * 10) / 10
        : null;
      var open = (s.worklist || []).filter(function (w) { return w.owner === u.id && w.status !== 'done'; }).length;
      var done = (s.worklist || []).filter(function (w) { return w.owner === u.id && w.status === 'done'; }).length;
      var seeded = (s.incentives || []).find(function (r) { return r.staffId === u.id; });
      /* a simple composite just to order the table — sessions weigh most */
      var score = sessions * 3 + rated.length * 2 + done + (avg || 0) * 2;
      return { u: u, sessions: sessions, rated: rated.length, avg: avg,
               open: open, done: done, payout: seeded ? seeded.payout : null, score: score };
    }).filter(function (r) { return r.score > 0 || r.payout; });
    rows.sort(function (a, b) { return b.score - a.score; });
    return rows;
  }

  function renderPerformanceTab() {
    var rows = perfRows();
    if (!rows.length) return HV.ui.empty('leaf', 'No team activity to rank yet.');
    var body = rows.map(function (r, i) {
      var title = (HV.roleDef(r.u.role) || {}).title || r.u.role;
      return '<tr><td><b>' + HV.esc(r.u.name) + '</b>' +
        (i === 0 ? ' <span class="pill ok">' + HV.ui.icon('award') + '&nbsp;Top performer</span>' : '') +
        '<br><small class="sub">' + HV.esc(title) + '</small></td>' +
        '<td class="num">' + r.sessions + '</td>' +
        '<td class="num">' + r.rated + '</td>' +
        '<td class="num">' + (r.avg == null ? '—' : r.avg) + '</td>' +
        '<td><span class="num">' + r.done + '</span> done · <span class="num">' + r.open + '</span> open</td>' +
        '<td class="num">' + (r.payout ? HV.esc(r.payout) : '—') + '</td></tr>';
    }).join('');
    return '<style>' +
        /* .pill has no svg rule of its own — size the award mark like .chip svg */
        '.opsx-perf .pill svg{width:13px; height:13px; stroke:currentColor; fill:none; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round}' +
      '</style>' +
      '<div class="tablewrap opsx-perf"><table class="data">' +
      '<thead><tr><th>Staff</th><th>Sessions delivered</th><th>Meals rated</th><th>Avg stars given</th><th>Work list</th><th>Cycle payout (seeded)</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div>' +
      '<div class="notice">Derived live from sessions, ratings and the work list.</div>';
  }

  /* ---------------- boards ----------------
     The five panels this module owns, registered once so the hosts (Schedule,
     Queues, Reports) can compose them. A board renders its body only — the host
     draws the page header and the tab bar. */

  var ALL_STAFF = ['admin', 'opshead', 'doctor', 'dietitian', 'fitness', 'yoga', 'mind'];
  var OPS_ONLY  = ['admin', 'opshead'];

  function wireDone(el) {
    el.querySelectorAll('[data-done]').forEach(function (b) {
      b.addEventListener('click', function () {
        var item = HV.store.worklist.find(function (w) { return w.id === b.dataset.done; });
        if (!item) return;
        item.status = 'done';
        HV.save();
        HV.refresh();
        HV.toast('Task auto-cleared. The underlying rule is satisfied.');
      });
    });
  }

  /* ---- notices: the sweeps' outbox, surfaced on the work board ----
     SLA nudges/escalations, session reminders, leave decisions and
     celebrations all land here (HV.notice writes them). Unseen ones are
     highlighted for THIS render, then marked seen — viewing the board is
     the acknowledgement, so the Home nav badge drains itself. */
  var NOTICE_ICONS = { sla: 'clock', reminder: 'bell', celebration: 'sparkle', leave: 'cal', task: 'doc' };

  function noticesHtml(me) {
    var list = HV.noticesFor(me.id);
    if (!list.length) return '';
    var unseen = list.filter(function (n) { return !n.seen; }).length;
    var rows = list.slice(0, 8).map(function (n) {
      var c = n.clientId ? HV.client(n.clientId) : null;
      return '<div class="trow' + (n.seen ? '' : ' opsx-new') + '">' +
        HV.ui.iconTile(NOTICE_ICONS[n.kind] || 'star') +
        '<div class="grow">' + HV.esc(n.text) +
          '<small>' + (c ? HV.esc(c.name) + ' · ' : '') + HV.esc(HV.ago(HV.minsSince(n.ts))) + '</small>' +
        '</div>' +
        (n.seen ? '' : HV.ui.pill('New', 'info')) +
      '</div>';
    }).join('');
    return '<style>' +
        '.opsx-notices{margin-bottom:var(--s4)}' +
        '.opsx-notices .trow.opsx-new{background:var(--brand-wash)}' +
      '</style>' +
      '<div class="opsx-notices">' +
        '<div class="sec-title">Notices ' +
          (unseen ? '<span class="pill info"><span class="num">' + unseen + '</span> new</span>' : '') + '</div>' +
        '<div class="list">' + rows + '</div>' +
        (list.length > 8
          ? '<p class="audit"><span class="num">' + (list.length - 8) + '</span> older notices kept in the store.</p>'
          : '') +
        '<p class="audit">Escalations, reminders and leave decisions land here — marked seen once viewed.</p>' +
      '</div>';
  }

  function mountWork(el) {
    var me = HV.me();
    var seeAll = HV.can('seeAllClients');
    el.innerHTML = liveNowHtml(me) + noticesHtml(me) +
      workFilterHtml(seeAll) +
      '<div id="wf-list" style="margin-top:var(--s3)">' + renderWorkTab(me) + '</div>';
    /* viewing IS the acknowledgement — highlight this render, seen on the next */
    HV.seenNotices(me.id);
    wireDone(el);
    el.querySelectorAll('[data-joinnow]').forEach(function (b) {
      b.addEventListener('click', function () { HV.meetui.join(b.dataset.joinnow, 0); });
    });
    el.querySelectorAll('[data-file]').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = b.dataset.file.split('|');
        HV.meetui.reportSheet(p[0], p[1]);
      });
    });
    el.querySelectorAll('[data-wf]').forEach(function (b) {
      b.addEventListener('click', function () {
        workFilter[b.dataset.wf] = b.dataset.wv || null;
        mountWork(el);   /* re-render the board body only, not HV.refresh() */
      });
    });
    var ownerSel = el.querySelector('#wf-owner');
    if (ownerSel) {
      ownerSel.addEventListener('change', function () {
        workFilter.owner = ownerSel.value || null;
        mountWork(el);
      });
    }
  }

  HV.registerBoard('work', {
    label: 'Work list',
    /* no perm to check and no natural role subset — HV.boardsFor hides a
       board that declares neither `perm` nor `roles` ([].includes(role) is
       always false), so "every role may see this" has to be spelled out as
       the full staff list, opsmgr, core and hod included now that Work
       Queues (and this board with it) reaches them too. */
    roles: ALL_STAFF.concat(['opsmgr', 'core', 'hod']),
    /* HV.worklist.mine() (data.js) checks role==='admin'||role==='opshead' —
       a different, narrower test than the seeAllClients this board's own
       list uses (mountWork/scopedWorklist above). For opsmgr and core that
       drift showed a "0" badge over a 6-row list. Badge and list now read off
       the exact same scoping expression, open items only. */
    count: function () {
      var me = HV.me();
      if (!me) return 0;
      return scopedWorklist(me).filter(function (w) { return w.status === 'open'; }).length;
    },
    mount: function (el) { mountWork(el); },
  });

  HV.registerBoard('deviations', {
    label: 'Deviations',
    perm: 'seeAllClients',
    mount: function (el) { el.innerHTML = renderDeviationsTab(); },
  });

  HV.registerBoard('live', {
    label: 'Live board',
    perm: 'seeAllClients',
    mount: function (el) { el.innerHTML = renderLiveTab(); },
  });

  HV.registerBoard('calories', {
    label: 'Calorie log',
    roles: ALL_STAFF,
    mount: function (el) { el.innerHTML = renderCaloriesTab(); },
  });

  /* the board's own roles carry the restriction the in-view lock screen used to */
  HV.registerBoard('incentives', {
    label: 'Team performance',
    roles: OPS_ONLY,
    /* read by Home's ledger section (console-digest.js) for its summary line */
    count: function () { return perfRows().length; },
    mount: function (el) { el.innerHTML = renderPerformanceTab(); },
  });


  /* ---------------- Reports & Exports ---------------- */

  /* ---- the Complete Sheet, for real: one client -> one CSV file ----
     CSV, not HTML — so values go through csvCell (RFC-4180 quoting), never
     HV.esc. Sections mirror what the paper sheet carried: profile, levels,
     sessions, tracker snapshot, goal ledger, weigh-ins, latest lab values. */
  function csvCell(v) {
    var s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function csvRow(arr) { return arr.map(csvCell).join(','); }
  function buildClientCsv(c) {
    var lines = [];
    lines.push(csvRow(['HAALVING Complete Sheet']));
    lines.push(csvRow(['Client', c.name]));
    lines.push(csvRow(['Exported', new Date().toISOString().slice(0, 10)]));
    lines.push('');
    lines.push(csvRow(['PROFILE', '']));
    [['Id', c.id], ['Age', c.age], ['Sex', c.sex], ['Tier', c.tier], ['Plan', c.plan],
     ['Cycle', c.cycle], ['Day', c.day], ['Goal', c.goal], ['Purpose', c.purpose],
     ['Risk', c.risk], ['Compliance %', c.compliance]].forEach(function (p) {
      lines.push(csvRow(p));
    });
    lines.push('');
    lines.push(csvRow(['LEVELS', 'Level']));
    Object.keys(HV.PILLARS).forEach(function (k) {
      lines.push(csvRow([HV.PILLARS[k].name, (c.levels || {})[k]]));
    });
    lines.push('');
    lines.push(csvRow(['SESSIONS', 'Done', 'Target', 'Cancelled']));
    var SNAMES = { fitness: 'Fitness', yoga: 'Yoga', mind: 'Mind Wellness' };
    Object.keys(c.sessions || {}).forEach(function (k) {
      var sk = c.sessions[k];
      lines.push(csvRow([SNAMES[k] || k, sk.done, sk.target, sk.cancelled || 0]));
    });
    lines.push('');
    lines.push(csvRow(['TRACKERS', 'Value', 'Target']));
    var t = c.trackers || {};
    lines.push(csvRow(['Steps', t.steps, t.stepsTarget]));
    lines.push(csvRow(['Water (glasses)', t.waterDone, t.waterTarget]));
    lines.push(csvRow(['Sleep', t.sleep, '']));
    lines.push(csvRow(['Meals logged', t.mealsLogged, t.mealsTarget]));
    lines.push(csvRow(['Active minutes', t.activeMins, t.activeTarget]));
    lines.push(csvRow(['Screen minutes', t.screenMins, t.screenTarget]));
    lines.push('');
    lines.push(csvRow(['GOAL LEDGER', 'Target', 'Result', 'State']));
    (c.goalLedger || []).forEach(function (g) {
      lines.push(csvRow(['Level ' + g.level, g.target, g.result || '', g.state]));
    });
    lines.push('');
    lines.push(csvRow(['WEIGHT LOG', 'Cycle', 'Day', 'Kg']));
    (c.weightLog || []).forEach(function (w, i) {
      lines.push(csvRow(['Entry ' + (i + 1), w.cy, w.day, w.kg]));
    });
    var rep = (HV.vitals && HV.vitals.report) ? HV.vitals.report(c.id) : null;
    if (rep) {
      lines.push('');
      lines.push(csvRow(['LAB REPORT · ' + rep.date + (rep.label ? ' · ' + rep.label : ''), 'Value', 'Unit', 'Status']));
      Object.keys(rep.values).forEach(function (k) {
        var r = HV.vitals.read(k, rep, c.sex);
        if (!r) { lines.push(csvRow([k, rep.values[k], '', ''])); return; }
        lines.push(csvRow([r.def.name || k, r.display, r.def.unit || '', r.out ? 'Out of range' : 'Within range']));
      });
    }
    return lines.join('\r\n');
  }
  /* Blob + a[download] — the BOM keeps Excel reading the UTF-8 minus signs */
  function downloadCsv(name, text) {
    var blob = new Blob(['\ufeff' + text], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  /* A FUNCTION, not a const array: one of these lines names the progress-meeting
     day, and a module-level literal would call HV.meetingDay() while this file
     is still being parsed — before HV.store exists — freezing the number at the
     seed's and ignoring Configuration ever after. Anything reading the
     programme's shape has to be evaluated at render time. */
  function reportCards() {
    return [
      { t: 'Progress Sheet (PDF/CSV)', s: 'Per-client cycle progress, ready for the Day-' + HV.meetingDay() + ' meeting.' },
      { t: 'Level Change decision log', s: 'Every upgrade, hold and observe — with who decided, and why.' },
      { t: 'Complete Sheet (CSV)', s: 'The single live sheet: profile, levels, sessions, trackers, goals, weigh-ins and labs.', csv: true },
      { t: 'CRM webhook — last sync 2 min ago', s: 'Stage changes flow to the CRM on their own.' },
      { t: 'Notification log (send · opened · action ≤ 60 min)', s: 'Proof that nudges land and lead to action.' },
    ];
  }

  function mountExports(el) {
    var me = HV.me();
    var s = HV.store;
    var log = (s.exportLog || []).filter(function (e) { return e.kind === 'complete-csv'; });
    var last = log[log.length - 1];
    var lastLine = last
      ? '<p class="audit" style="margin-top:var(--s2)">Last export: ' +
          HV.esc((HV.client(last.clientId) || { name: last.clientId }).name) + ' · ' +
          HV.esc(HV.ago(HV.minsSince(last.ts))) + '</p>'
      : '';
    el.innerHTML =
      '<div class="grid2">' + reportCards().map(function (c, i) {
        var action = c.csv
          ? '<div class="row" style="gap:var(--s2); flex-wrap:wrap">' +
              '<select class="input sel" id="csv-client" aria-label="Client" style="flex:1; min-width:0">' +
                s.clients.map(function (cl) {
                  return '<option value="' + HV.esc(cl.id) + '">' + HV.esc(cl.name) + '</option>';
                }).join('') +
              '</select>' +
              '<button class="btn sm" id="csv-dl">Download CSV</button>' +
            '</div>' + lastLine
          : '<button class="btn sm quiet" data-export="' + i + '">Export</button>';
        return '<div class="card">' +
          '<b>' + HV.esc(c.t) + '</b>' +
          '<p class="sub" style="margin:var(--s1) 0 var(--s3)">' + HV.esc(c.s) + '</p>' +
          action +
        '</div>';
      }).join('') + '</div>' +
      '<div class="notice">Live sheets replace the spreadsheets; exports exist for the CRM and audits.</div>';

    el.querySelectorAll('[data-export]').forEach(function (b) {
      b.addEventListener('click', function () {
        HV.toast('Exported (demo). Three taps or fewer in production.');
      });
    });
    var dl = el.querySelector('#csv-dl');
    if (dl) dl.addEventListener('click', function () {
      var sel = el.querySelector('#csv-client');
      var c = HV.client(sel.value);
      if (!c) return;
      downloadCsv('haalving-' + c.id + '.csv', buildClientCsv(c));
      s.exportLog = s.exportLog || [];
      s.exportLog.push({ ts: HV.now(), byId: me.id, clientId: c.id, kind: 'complete-csv' });
      HV.save();
      HV.toast('Complete sheet downloaded — haalving-' + c.id + '.csv');
      /* re-mount the board body only (the audit line updates); keep the pick */
      mountExports(el);
      var sel2 = el.querySelector('#csv-client');
      if (sel2) sel2.value = c.id;
    });
  }

  HV.registerBoard('exports', {
    label: 'Exports',
    roles: OPS_ONLY,
    /* read by Home's ledger section (console-digest.js) for its summary line */
    count: function () { return reportCards().length; },
    mount: function (el) { mountExports(el); },
  });

  /* Reports opens to every role that can read a calorie log today — the tabs,
     not the door, carry the restriction. A coach sees one tab. */
  HV.registerView('reports', {
    title: 'Reports & Exports',
    roles: ALL_STAFF,
    render: function (el, params) {
      var boards = HV.boardsFor(['exports', 'calories', 'incentives']);
      if (!boards.length) {
        el.innerHTML = HV.ui.empty('leaf', 'Nothing here for your role.');
        return;
      }
      var active = boards.some(function (b) { return b.key === params[0]; }) ? params[0] : boards[0].key;
      var board = boards.find(function (b) { return b.key === active; });

      el.innerHTML =
        '<div class="h1-row"><div><div class="kicker">THE LEDGER</div><h1 class="h1">Reports &amp; Exports</h1>' +
        '<p class="sub">Everything the team used to copy into spreadsheets by hand, generated live.</p></div></div>' +
        HV.ui.tabs(boards.map(function (b) {
          return { key: b.key, label: b.label, count: b.count ? b.count() : 0 };
        }), active) +
        '<div id="board-root" style="display:flex;flex-direction:column;gap:var(--s3);margin-top:var(--s3)"></div>';

      board.mount(el.querySelector('#board-root'));

      el.querySelectorAll('.tabs button').forEach(function (b) {
        b.addEventListener('click', function () { HV.go('#/reports/' + b.dataset.tab); });
      });
    },
  });
})();
