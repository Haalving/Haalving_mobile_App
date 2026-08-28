/* HAALVING console — the client record: the four surfaces that make a client's
   file a file rather than a dashboard.

     Profile   the cover sheet — who this person is
     Medical   the signed summary; raw records stay Doctor-only
     Logs      the running notes, everything that has happened, newest first
     Meetings  the ward-round minutes, one card per coach

   Split out of console-clients.js, which keeps the rail, the header, the
   three-panel shell and the other five tabs. Exports HV.clientRecord on the
   same contract as HV.consoleui and HV.chatui: consumers call these inside
   render() only, so script-tag order never has to be reasoned about. */
(function () {
  'use strict';

  /* Identity, not biology. c.sex is a separate, CLINICAL field that HV.vitals
     reads for lab reference bands — see the seed comment in data.js. */
  var GENDER = { M: 'Male', F: 'Female', X: 'Other' };
  var STATUS = [
    { k: 'active',   t: 'Active',   tone: 'ok'   },
    { k: 'paused',   t: 'Paused',   tone: 'warn' },
    { k: 'inactive', t: 'Inactive', tone: 'bad'  },
  ];
  function statusDef(k) {
    return STATUS.filter(function (s) { return s.k === k; })[0] || STATUS[0];
  }
  function first(name) { return String(name || '').split(' ')[0]; }

  /* one labelled field. An absent value reads as an em dash, never as the
     word 'null' — a record that says "null" has told the reader nothing and
     looks broken doing it. */
  function row(label, value, extra) {
    var v = (value === null || value === undefined || value === '')
      ? '<span class="pdim">—</span>' : value;
    return '<div class="crrow"><small>' + HV.esc(label) + '</small>' +
      '<b>' + v + '</b>' + (extra || '') + '</div>';
  }
  function num(v) { return '<span class="num">' + HV.esc(String(v)) + '</span>'; }

  /* 12 Jun 2026 — a date a person reads, from an ISO one */
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
             'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function niceDate(iso) {
    if (!iso) return '';
    var p = String(iso).split('-');
    if (p.length < 3) return String(iso);
    return num(+p[2]) + ' ' + MON[+p[1] - 1] + ' ' + num(p[0]);
  }

  /* may this person edit the record? Ops and Admin do; a pillar coach reads.
     Enforced again inside every writer, the same twice-over the router and
     the views already use. */
  function mayEdit() {
    return HV.can('seeAllClients') || HV.can('assignPlan');
  }

  /* ---- verification -----------------------------------------------------
     TJ's decision: an admin marks it. So the line has to name WHO marked it,
     or the record asserts something on a staff member's word with no trace
     of whose word it was. */
  function verifyMark(c, which) {
    var okKey = which + 'Ok', byKey = which + 'By', atKey = which + 'At';
    if (!c[okKey]) return HV.ui.pill('Unverified', 'warn');
    var by = HV.staff(c[byKey]);
    return '<span class="crok" title="Marked verified by ' +
      HV.esc(by ? by.name : 'a team member') + '">' + HV.ui.icon('check') + ' Verified</span>';
  }

  function contactRow(c, which, label) {
    var okKey = which + 'Ok';
    var btn = mayEdit()
      ? '<button class="btn sm ghost" data-verify="' + which + '">' +
        (c[okKey] ? 'Withdraw' : 'Mark verified') + '</button>'
      : '';
    return '<div class="crrow"><small>' + HV.esc(label) + '</small>' +
      '<b>' + (c[which] ? HV.esc(c[which]) : '<span class="pdim">—</span>') + '</b>' +
      '<span class="crvf">' + verifyMark(c, which) + btn + '</span></div>';
  }

  /* ---- the term: the SECOND clock ---------------------------------------
     Always labelled against its own length, never a bare number — a client
     at Cycle 3 Day 6 with 57 days left is correct and would read as a
     contradiction if either number stood alone. */
  function termCard(c) {
    var t = HV.termOf(c);
    var tone = t.ended ? 'bad' : t.left <= 14 ? 'warn' : 'ok';
    var line = t.ended
      ? 'Term ended ' + num(Math.abs(t.left)) + ' days ago'
      : num(t.left) + ' days left of ' + num(t.days);
    var renew = (mayEdit() && (t.ended || t.left <= 14))
      ? '<button class="btn sm" data-renew>Renew</button>' : '';
    var history = (t.renewals || []).length
      ? '<div class="audit">Renewed ' + num(t.renewals.length) + '× · last on ' +
        niceDate(t.renewals[t.renewals.length - 1].toISO) + '</div>'
      : '';
    return '<div class="card" data-term-card>' +
      '<span class="k">ENGAGEMENT TERM</span>' +
      '<div class="crterm ' + tone + '">' +
        '<span class="ctbar"><i style="width:' + t.pct + '%"></i></span>' +
        '<b>' + line + '</b>' + renew +
      '</div>' +
      '<div class="crgrid">' +
        row('Started', niceDate(t.startISO)) +
        row('Ends', niceDate(t.endISO)) +
        row('Length', num(t.days) + ' days') +
      '</div>' + history +
      '<p class="audit">The engagement term, not the programme — that runs ' +
        num(HV.levels()) + ' levels × ' + num(HV.cycleDays()) + ' days.</p>' +
    '</div>';
  }

  /* ---- Profile: the cover sheet ---------------------------------------- */
  function profileHtml(c) {
    var st = statusDef(c.status);
    var statusCell = HV.ui.pill(st.t, st.tone) +
      (mayEdit() ? ' <button class="btn sm ghost" data-status>Change</button>' : '');
    var why = c.statusWhy
      ? '<div class="audit">' + HV.esc(c.statusWhy) +
        (c.statusBy ? ' · set by ' + HV.esc(HV.staff(c.statusBy).name) : '') + '</div>'
      : '';

    /* the typed weight carries the latest weigh-in beside it. TJ chose typed
       fields; this caption is what stops the card silently contradicting the
       Trackers tab when the two drift. */
    var wl = (c.weightLog || [])[(c.weightLog || []).length - 1];
    var weighIn = wl
      ? '<div class="audit">latest weigh-in ' + num(wl.kg) + ' kg · Day ' + num(wl.day) +
        ', cycle ' + num(wl.cy) + '</div>'
      : '';

    var gender = GENDER[c.gender] || null;
    var addressed = c.address ? ' <span class="sub">· ' + HV.esc(c.address) + '</span>' : '';

    return '<div class="card" data-profile>' +
      '<div class="crhead">' +
        HV.ui.avatar(c.name, 'lg') +
        '<div class="grow"><h2 class="crname">' + HV.esc(c.name) + '</h2>' +
          '<small>' + (c.designation ? HV.esc(c.designation) : 'Client') + ' · ' +
            HV.esc(c.location || '') + '</small></div>' +
        (mayEdit() ? '<button class="btn sm ghost" data-editprofile>Edit</button>' : '') +
      '</div>' +
      '<div class="crgrid">' +
        row('Client id', HV.esc(c.code || '')) +
        row('Name', HV.esc(c.name)) +
        row('Designation', HV.esc(c.designation || '')) +
        row('Gender', gender ? HV.esc(gender) + addressed : null) +
        row('Date of birth', niceDate(c.dob)) +
        /* derived from dob, never typed — see HV.ageOf */
        row('Age', HV.ageOf(c) == null ? null : num(HV.ageOf(c))) +
        row('Joining date', niceDate(c.joinedISO)) +
        row('Height', c.heightCm ? num(c.heightCm) + ' cm' : null) +
        row('Weight', c.weightKg ? num(c.weightKg) + ' kg' : null, weighIn) +
        row('Location', HV.esc(c.location || '')) +
        row('Plan', HV.esc((HV.PLANS[c.plan] || {}).name || c.tier || '')) +
        row('Status', statusCell, why) +
      '</div>' +
      '<div class="crgrid">' +
        contactRow(c, 'email', 'Email') +
        contactRow(c, 'mobile', 'Mobile') +
      '</div>' +
      '<p class="audit">Internal id ' + HV.esc(c.id) + ' · joined ' + niceDate(c.joinedISO) + '</p>' +
    '</div>' + termCard(c);
  }

  /* ---- Medical Details --------------------------------------------------
     Reuses the rule the codebase already enforces rather than writing a
     second one: the signed Health Summary is visible to the pod, raw records
     are Doctor-only via HV.can('rawRecords'), and every open is audited.
     The Documents tab renders the same policy from console-clients.js. */
  function medicalHtml(c) {
    var docs = (HV.store.documents || []).filter(function (d) { return d.clientId === c.id; });

    if (HV.can('rawRecords')) {
      var rows = docs.map(function (d) {
        return '<div class="trow">' + HV.ui.iconTile('doc', 'sm') +
          '<div class="grow"><b>' + HV.esc(d.name) + '</b><small>' + HV.esc(d.type) +
            ' · ' + HV.esc(d.date) + '</small></div>' +
          (d.summary === 'ready' ? HV.ui.pill('Summary signed', 'ok') : HV.ui.pill('Summary pending', 'warn')) +
          '<button class="btn sm ghost" data-raw="' + HV.esc(d.id) + '">Open raw (access logged)</button>' +
        '</div>';
      }).join('');
      return '<div class="card" data-medical><span class="k">MEDICAL DETAILS</span>' +
        (rows ? '<div class="list" style="margin-top:var(--s3)">' + rows + '</div>'
              : HV.ui.empty('doc', 'No documents on file yet.')) +
        '<p class="audit">Raw medical records are Doctor-only — every open is written to the audit trail</p>' +
      '</div>';
    }

    var cards = docs.filter(function (d) { return (HV.store.healthSummaries || {})[d.id]; })
      .map(function (d) {
        var s = HV.store.healthSummaries[d.id];
        var signer = HV.staff(s.signedBy);
        return '<div class="crsum"><b>Health Summary</b> <span class="sub">· signed by ' +
          HV.esc(signer ? signer.name : 'the Doctor') + ' · ' + HV.esc(d.date) + '</span>' +
          '<div style="margin-top:var(--s2)">' +
            s.conditions.map(function (x) { return '<span class="chip">' + HV.esc(x) + '</span>'; }).join('') +
            s.flags.map(function (x) {
              return '<span class="chip" style="color:var(--amber); background:var(--amber-wash); box-shadow:none">' +
                HV.esc(x) + '</span>'; }).join('') +
            s.metrics.map(function (x) { return '<span class="chip num">' + HV.esc(x) + '</span>'; }).join('') +
          '</div></div>';
      }).join('');

    return '<div class="card" data-medical><span class="k">MEDICAL DETAILS</span>' +
      (cards || HV.ui.empty('doc', 'No signed health summaries yet.')) +
      '<div class="notice">Raw records: Doctor only. ' + HV.esc(first(c.name)) +
        '’s care team reads the signed summary — the screen for opening raw records ' +
        'does not exist for this role.</div>' +
    '</div>';
  }

  /* ---- Logs: the running notes ------------------------------------------
     DERIVED from the eight stores that already record things, plus c.log for
     the staff acts with no other home. Deriving is what lets the demo's
     seeded history appear on first load with zero back-fill — no amount of
     new writing could achieve that retroactively.

     Everything is normalised to minutes-ago, the unit HV.ago already speaks,
     so one sort works across sources that variously carry a timestamp, a
     minsAgo, or only a cycle-and-day. */
  var logFilter = 'all';   /* in-memory, like the rail's filters */
  var LOG_FILTERS = [
    { k: 'all',     t: 'All' },
    { k: 'client',  t: 'Client' },
    { k: 'team',    t: 'Team' },
    { k: 'plan',    t: 'Plan' },
    { k: 'medical', t: 'Medical' },
  ];
  /* which bucket each act belongs to */
  var LOG_BUCKET = {
    status: 'team', profile: 'team', verify: 'team', coach: 'team',
    term: 'team', note: 'team', level: 'plan',
  };

  /* a cycle-and-day with no timestamp, placed on the same axis as everything
     else — moods and the session ledger are recorded this way */
  function minsAgoOf(c, cy, d, minOfDay) {
    var days = (c.cycle - cy) * HV.cycleDays() + (c.day - d);
    var now = new Date();
    var nowMin = now.getHours() * 60 + now.getMinutes();
    return days * 1440 + (nowMin - (minOfDay == null ? nowMin : minOfDay));
  }
  function minsFromTs(ts) { return Math.max(0, Math.round((HV.now() - ts) / 60000)); }

  function collect(c) {
    var evs = [];
    var add = function (mins, bucket, src, icon, title, sub) {
      evs.push({ mins: mins, bucket: bucket, src: src, icon: icon, title: title, sub: sub || '' });
    };
    var who = function (id) { var s = HV.staff(id); return s ? s.name : 'the team'; };

    /* 1 · the conversation */
    (HV.store.circles[c.id] || []).forEach(function (m) {
      if (m.kind === 'meal') return;   /* the meal itself lands richer, below */
      var fromClient = m.fromId === 'client';
      add(m.minsAgo, fromClient ? 'client' : 'team', 'msg',
        m.kind === 'doc' ? 'doc' : m.kind === 'promo' ? 'send' : 'chat',
        fromClient ? HV.esc(first(c.name)) + ' wrote' : HV.esc(who(m.fromId)) + ' wrote',
        HV.esc(String(m.text || m.title || '').slice(0, 140)));
    });
    /* 2 · meals */
    (HV.store.meals || []).forEach(function (m) {
      if (m.clientId !== c.id) return;
      add(m.capturedMinsAgo, 'client', 'meal', 'leaf',
        HV.esc(m.slot) + ' logged',
        HV.esc((m.dishes || []).join(' · ')) +
          (m.final ? ' · rated ' + num(m.final.stars) + '★' : ' · awaiting rating'));
    });
    /* 3 · moods */
    (c.moodLog || []).forEach(function (m) {
      add(minsAgoOf(c, m.cy, m.d, m.min), 'client', 'mood', 'heart',
        'Mood · ' + HV.esc(m.mood), m.note ? HV.esc(m.note) : '');
    });
    /* 4 · weigh-ins */
    (c.weightLog || []).forEach(function (w) {
      add(minsFromTs(w.ts), 'client', 'weight', 'chart',
        'Weigh-in ' + num(w.kg) + ' kg', 'Day ' + num(w.day) + ', cycle ' + num(w.cy));
    });
    /* 5 · sessions the client marked */
    (c.sessionLog || []).forEach(function (s) {
      add(minsFromTs(s.ts), 'client', 'session',
        s.status === 'done' ? 'check' : 'x',
        (HV.PILLARS[s.pillar] ? HV.PILLARS[s.pillar].name : s.pillar) + ' session ' + HV.esc(s.status),
        'Day ' + num(s.d) + ', cycle ' + num(s.cy));
    });
    /* 6 · the client's own stars */
    (c.sessionFeedback || []).forEach(function (f) {
      add(minsFromTs(f.ts), 'client', 'stars', 'star',
        'Rated a session ' + num(f.stars) + '★', f.note ? HV.esc(f.note) : '');
    });
    /* 7 · plan assignments and edits, per pillar */
    var plans = (HV.store.clientPlans || {})[c.id] || {};
    Object.keys(plans).forEach(function (p) {
      (plans[p].log || []).forEach(function (l) {
        add(l.minsAgo, 'plan', 'plan', 'doc',
          HV.esc(l.act), (HV.PILLARS[p] ? HV.PILLARS[p].name : p) + ' · ' + HV.esc(who(l.byId)));
      });
    });
    /* 8 · approvals naming this client */
    (HV.store.approvals || []).forEach(function (a) {
      if (a.clientId !== c.id) return;
      (a.history || []).forEach(function (ev) {
        add(ev.minsAgo, 'plan', 'approval', 'check',
          HV.esc(a.title), HV.esc(ev.act) + ' by ' + HV.esc(who(ev.byId)));
      });
      if (!(a.history || []).length) {
        add(60 * 24, 'plan', 'approval', 'clock',
          HV.esc(a.title), 'Awaiting sign-off · ' + HV.esc(a.status));
      }
    });
    /* 9 · documents */
    (HV.store.documents || []).forEach(function (d) {
      if (d.clientId !== c.id) return;
      add(60 * 24 * 3, 'medical', 'doc', 'doc',
        HV.esc(d.name) + ' filed', HV.esc(d.type) + ' · ' + HV.esc(d.date));
    });
    /* 10 · the staff acts with no other home */
    (c.log || []).forEach(function (l) {
      add(minsFromTs(l.ts), LOG_BUCKET[l.act] || 'team', l.act, 'lock',
        HV.esc(l.text), HV.esc(who(l.byId)));
    });

    return evs.filter(function (e) { return isFinite(e.mins); })
              .sort(function (a, b) { return a.mins - b.mins; });
  }

  /* which day an entry belongs to, as a heading a person reads */
  function dayHeading(mins) {
    var d = new Date(HV.now() - mins * 60000);
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var then = new Date(d); then.setHours(0, 0, 0, 0);
    var gap = Math.round((today - then) / 86400000);
    if (gap <= 0) return 'Today';
    if (gap === 1) return 'Yesterday';
    return d.getDate() + ' ' + MON[d.getMonth()] + (d.getFullYear() === today.getFullYear()
      ? '' : ' ' + d.getFullYear());
  }

  function logsHtml(c) {
    var all = collect(c);
    var evs = logFilter === 'all' ? all : all.filter(function (e) { return e.bucket === logFilter; });

    var chips = '<div class="tfil" role="group" aria-label="Filter the log">' +
      LOG_FILTERS.map(function (f) {
        var n = f.k === 'all' ? all.length
          : all.filter(function (e) { return e.bucket === f.k; }).length;
        return '<button data-logfil="' + f.k + '" class="' + (logFilter === f.k ? 'on' : '') + '"' +
          (logFilter === f.k ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>' +
          HV.esc(f.t) + ' <span class="num">' + n + '</span></button>';
      }).join('') +
    '</div>';

    if (!evs.length) {
      return chips + HV.ui.empty('leaf',
        'Nothing here yet — the log fills as ' + HV.esc(first(c.name)) + ' lives their days.',
        'Everything the client does and everything the team does to their record lands here.');
    }

    var out = '', head = null;
    evs.forEach(function (e) {
      var hd = dayHeading(e.mins);
      if (hd !== head) { out += '<div class="sec-title">' + HV.esc(hd) + '</div>'; head = hd; }
      out += '<div class="trow" data-logrow data-logkind="' + e.bucket + '" ' +
        'data-logsrc="' + e.src + '" data-logmins="' + e.mins + '">' +
        HV.ui.iconTile(e.icon, 'sm') +
        '<div class="grow"><b>' + e.title + '</b>' +
          (e.sub ? '<small>' + e.sub + '</small>' : '') + '</div>' +
        '<small class="num" style="flex:none">' + HV.ago(e.mins) + '</small>' +
      '</div>';
    });
    return chips + '<div class="list">' + out + '</div>' +
      '<p class="audit">Everything this client has done and everything the team has done to ' +
      'their record — newest first. Derived from the log, not a second copy of it.</p>';
  }

  /* ---- Meetings: the ward-round minutes ---------------------------------
     A meeting is one record with ONE MINUTES CARD PER COACH.

     The programme's own meetings derive themselves from programShape — a
     Day-reviewDay level review and a Day-meetingDay cycle meeting for every
     cycle that has happened. A derived meeting with no filed minutes STILL
     APPEARS, showing every pod seat with a "not filed" mark against anyone
     who owes one. That is the whole point of the tab: a meeting nobody
     minuted has to leave a visible trace that it was due, or the record
     quietly forgets it happened.

     Session notes stay in Logs. Meetings is for meetings — folding every 1:1
     in would make it a nine-entries-per-cycle firehose and stop it being
     readable. */
  var MEET_SEATS = [
    { role: 'dietitian', pillar: 'culture' },
    { role: 'fitness',   pillar: 'fitness' },
    { role: 'yoga',      pillar: 'yoga' },
    { role: 'mind',      pillar: 'wellness' },
    { role: 'doctor',    pillar: null },
  ];

  function derivedMeetings(c) {
    var shape = HV.shape(), out = [];
    var cycles = (c.cycleHistory || []).map(function (h) { return h.cycle; });
    if (cycles.indexOf(c.cycle) === -1) cycles.push(c.cycle);
    cycles.forEach(function (cy) {
      out.push({ id: 'mt-' + c.id + '-' + cy + '-review', kind: 'review', cycle: cy,
                 day: shape.reviewDay, title: 'Level review' });
      out.push({ id: 'mt-' + c.id + '-' + cy + '-cycle', kind: 'cycle', cycle: cy,
                 day: shape.meetingDay, title: 'Cycle meeting' });
    });
    /* a meeting still ahead of the client in the CURRENT cycle has not
       happened yet — listing it as unfiled would accuse nobody of anything */
    return out.filter(function (m) { return m.cycle < c.cycle || m.day <= c.day; });
  }

  function meetingsFor(c) {
    var stored = c.meetings || [];
    var byId = {};
    stored.forEach(function (m) { byId[m.id] = m; });
    var all = derivedMeetings(c).map(function (m) {
      return { id: m.id, kind: m.kind, cycle: m.cycle, day: m.day, title: m.title,
               minutes: (byId[m.id] || {}).minutes || {} };
    });
    /* ad-hoc meetings are stored only — they have no derived twin */
    stored.filter(function (m) { return m.kind === 'adhoc'; }).forEach(function (m) { all.push(m); });
    return all.sort(function (a, b) { return (b.cycle - a.cycle) || (b.day - a.day); });
  }

  function meetingCard(c, m, meId) {
    var seats = MEET_SEATS.map(function (s) {
      var staff = HV.staffFor(c, s.role);
      if (!staff || !staff.id) return '';
      var mine = staff.id === meId;
      var filed = m.minutes[staff.id];
      var role = (HV.roleDef(s.role) || {}).title || s.role;
      var body = filed
        ? '<small>“' + HV.esc(filed.text) + '”</small>'
        : '<small class="pdim" data-notfiled>Not filed' +
          (mine ? '' : ' yet') + '</small>';
      var act = (mine && !filed)
        ? '<button class="btn sm ghost" data-file="' + HV.esc(m.id + '|' + staff.id) + '">File yours</button>'
        : '';
      return '<div class="trow" data-seat="' + HV.esc(staff.id) + '">' +
        HV.ui.avatar(staff.name, 'sm') +
        '<div class="grow"><b>' + HV.esc(staff.name) + '</b> <span class="sub">· ' +
          HV.esc(role) + '</span><br>' + body + '</div>' + act +
      '</div>';
    }).join('');

    var filedN = Object.keys(m.minutes).length;
    var seatN = MEET_SEATS.filter(function (s) {
      var st = HV.staffFor(c, s.role); return st && st.id;
    }).length;

    return '<div class="card" data-meet data-meetkind="' + m.kind + '" ' +
      'data-meetcycle="' + m.cycle + '" data-meetday="' + m.day + '">' +
      '<div class="crhead" style="margin-bottom:var(--s2)">' +
        '<div class="grow"><b>' + HV.esc(m.title) + '</b>' +
          '<small>Cycle ' + num(m.cycle) + ' · Day ' + num(m.day) + '</small></div>' +
        (filedN === seatN
          ? HV.ui.pill('All filed', 'ok')
          : HV.ui.pill(filedN + ' of ' + seatN + ' filed', filedN ? 'warn' : 'neutral')) +
      '</div>' +
      '<div class="list">' + seats + '</div>' +
    '</div>';
  }

  function meetingsHtml(c) {
    var meId = (HV.me() || {}).id;
    var list = meetingsFor(c);
    if (!list.length) {
      return HV.ui.empty('calendar',
        'No meetings yet — the first is the Day-' + HV.reviewDay() + ' level review.',
        'Reviews and cycle meetings appear here on their own; each coach files their own minutes.');
    }
    return '<p class="sub" style="margin:0 0 var(--s3)">Every review and cycle meeting, with what ' +
      'each coach wrote afterwards. A meeting nobody minuted still appears — so an unfiled note ' +
      'is visible rather than forgotten.</p>' +
      list.map(function (m) { return meetingCard(c, m, meId); }).join('');
  }

  /* Minutes are the coach's OWN. The button renders only on their seat, and
     the writer re-checks — the same twice-over the router already uses. */
  function fileSheet(c, meetingId, staffId) {
    var meId = (HV.me() || {}).id;
    if (staffId !== meId) return;
    HV.sheet(
      '<div class="h2">File your minutes</div>' +
      '<p class="sub" style="margin:0">What you took away from this meeting, in your own words. ' +
        'The rest of the pod reads it on this record.</p>' +
      '<textarea class="input" data-mn-text aria-label="Your minutes" rows="5" ' +
        'placeholder="e.g. Portions holding. Move to L3 next cycle."></textarea>' +
      '<div class="row" style="justify-content:flex-end">' +
        '<button class="btn ghost" data-mn-cancel>Cancel</button>' +
        '<button class="btn" data-mn-save disabled>File minutes</button>' +
      '</div>',
      function (sh) {
        var ta = sh.querySelector('[data-mn-text]');
        var save = sh.querySelector('[data-mn-save]');
        ta.addEventListener('input', function () { save.disabled = !ta.value.trim(); });
        sh.querySelector('[data-mn-cancel]').addEventListener('click', HV.closeSheet);
        save.addEventListener('click', function () {
          var txt = ta.value.trim();
          if (!txt || staffId !== (HV.me() || {}).id) return;
          c.meetings = c.meetings || [];
          var rec = c.meetings.filter(function (m) { return m.id === meetingId; })[0];
          if (!rec) {
            var d = meetingsFor(c).filter(function (m) { return m.id === meetingId; })[0];
            rec = { id: meetingId, kind: d ? d.kind : 'adhoc', cycle: d ? d.cycle : c.cycle,
                    day: d ? d.day : c.day, title: d ? d.title : 'Meeting', minutes: {} };
            c.meetings.push(rec);
          }
          rec.minutes = rec.minutes || {};
          rec.minutes[staffId] = { text: txt, at: HV.now() };
          HV.logAct(c, 'note', 'Filed minutes for ' + rec.title + ' · cycle ' + rec.cycle);
          HV.closeSheet(); HV.refresh();
          HV.toast('Minutes filed.');
        });
      }
    );
  }

  /* ---- editing ----------------------------------------------------------
     Three writers, each re-checking mayEdit() rather than trusting that the
     button was only rendered for the right person. Same twice-over the
     router and the views already use for RBAC. */

  /* A status nobody can explain is worse than no status at all — so the
     reason is mandatory and Save stays disabled without one. */
  function statusSheet(c) {
    if (!mayEdit()) return;
    var pick = c.status;
    HV.sheet(
      '<div class="h2">Set status</div>' +
      '<p class="sub" style="margin:0">A paused client is coming back; an inactive one is not. ' +
        'Both need a reason on the record.</p>' +
      '<div class="tfil" role="group" aria-label="Status" style="margin-top:var(--s4)">' +
        STATUS.map(function (s) {
          return '<button data-st-val="' + s.k + '" class="' + (c.status === s.k ? 'on' : '') + '"' +
            (c.status === s.k ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>' +
            HV.esc(s.t) + '</button>';
        }).join('') +
      '</div>' +
      '<textarea class="input" data-st-why aria-label="Reason" ' +
        'placeholder="Why? e.g. Travelling for work — back 1 Sep"></textarea>' +
      '<div class="row" style="justify-content:flex-end">' +
        '<button class="btn ghost" data-st-cancel>Cancel</button>' +
        '<button class="btn" data-st-save disabled>Save status</button>' +
      '</div>',
      function (sh) {
        var why = sh.querySelector('[data-st-why]');
        var save = sh.querySelector('[data-st-save]');
        why.addEventListener('input', function () { save.disabled = !why.value.trim(); });
        sh.querySelectorAll('[data-st-val]').forEach(function (b) {
          b.addEventListener('click', function () {
            pick = b.dataset.stVal;
            sh.querySelectorAll('[data-st-val]').forEach(function (x) {
              x.classList.toggle('on', x === b);
              x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
            });
          });
        });
        sh.querySelector('[data-st-cancel]').addEventListener('click', HV.closeSheet);
        save.addEventListener('click', function () {
          if (!why.value.trim() || !mayEdit()) return;
          var word = statusDef(pick).t;
          c.status = pick;
          c.statusWhy = why.value.trim();
          c.statusBy = (HV.me() || {}).id;
          c.statusAt = HV.now();
          HV.logAct(c, 'status', word + ' — ' + c.statusWhy);
          HV.closeSheet(); HV.refresh();
          HV.toast('Status set to ' + word + '.');
        });
      }
    );
  }

  /* An admin's mark, not the client's own act — so the audit line names who
     marked it. Without that the record asserts something on a staff member's
     word with no trace of whose word it was. */
  function verify(c, which) {
    if (!mayEdit()) return;
    var okKey = which + 'Ok', byKey = which + 'By', atKey = which + 'At';
    c[okKey] = !c[okKey];
    c[byKey] = c[okKey] ? (HV.me() || {}).id : null;
    c[atKey] = c[okKey] ? HV.now() : null;
    HV.logAct(c, 'verify', (which === 'email' ? 'Email' : 'Mobile') +
      (c[okKey] ? ' marked verified' : ' verification withdrawn'));
    HV.refresh();
    HV.toast(c[okKey] ? 'Marked verified.' : 'Verification withdrawn.');
  }

  /* The editable half of the cover sheet. On save the old and new values are
     diffed and ONE line is written naming the fields that moved — not one
     line per field, and nothing at all when nothing changed. */
  var PF = [
    { k: 'name',        t: 'Name' },
    { k: 'code',        t: 'Client id' },
    { k: 'designation', t: 'Designation' },
    { k: 'gender',      t: 'Gender', pick: [['M', 'Male'], ['F', 'Female'], ['X', 'Other']] },
    { k: 'address',     t: 'Addressed as', ph: 'e.g. she/her' },
    { k: 'dob',         t: 'Date of birth', type: 'date' },
    { k: 'joinedISO',   t: 'Joining date', type: 'date' },
    { k: 'heightCm',    t: 'Height (cm)', type: 'number' },
    { k: 'weightKg',    t: 'Weight (kg)', type: 'number' },
    { k: 'email',       t: 'Email', type: 'email' },
    { k: 'mobile',      t: 'Mobile' },
    { k: 'location',    t: 'Location' },
  ];
  function editProfileSheet(c) {
    if (!mayEdit()) return;
    HV.sheet(
      '<div class="h2">Edit profile</div>' +
      '<p class="sub" style="margin:0">Age is worked out from the date of birth, so it is not ' +
        'editable here. Sex — which the lab reference bands read — is a clinical field and lives ' +
        'with the medical record.</p>' +
      '<div class="crgrid" style="margin-top:var(--s4)">' +
        PF.map(function (f) {
          var v = c[f.k] == null ? '' : String(c[f.k]);
          var field = f.pick
            ? '<select class="input" data-pf="' + f.k + '">' + f.pick.map(function (o) {
                return '<option value="' + o[0] + '"' + (v === o[0] ? ' selected' : '') + '>' +
                  HV.esc(o[1]) + '</option>'; }).join('') + '</select>'
            : '<input class="input" data-pf="' + f.k + '" type="' + (f.type || 'text') + '" ' +
              'value="' + HV.esc(v) + '"' + (f.ph ? ' placeholder="' + HV.esc(f.ph) + '"' : '') + '>';
          return '<label class="crrow"><small>' + HV.esc(f.t) + '</small>' + field + '</label>';
        }).join('') +
      '</div>' +
      '<div class="row" style="justify-content:flex-end">' +
        '<button class="btn ghost" data-pf-cancel>Cancel</button>' +
        '<button class="btn" data-pf-save>Save profile</button>' +
      '</div>',
      function (sh) {
        sh.querySelector('[data-pf-cancel]').addEventListener('click', HV.closeSheet);
        sh.querySelector('[data-pf-save]').addEventListener('click', function () {
          if (!mayEdit()) return;
          var moved = [];
          PF.forEach(function (f) {
            var el = sh.querySelector('[data-pf="' + f.k + '"]');
            if (!el) return;
            var raw = el.value.trim();
            var val = f.type === 'number' ? (raw === '' ? null : Number(raw)) : raw;
            var was = c[f.k] == null ? '' : c[f.k];
            if (String(val == null ? '' : val) === String(was)) return;
            c[f.k] = val;
            moved.push(f.t);
          });
          if (moved.length) HV.logAct(c, 'profile', 'Edited ' + moved.join(', '));
          else HV.save();
          HV.closeSheet(); HV.refresh();
          HV.toast(moved.length ? 'Profile updated.' : 'Nothing changed.');
        });
      }
    );
  }

  /* The term clock never silently rolls over — a renewal is a person's
     decision, recorded with their name on it. */
  function renewSheet(c) {
    if (!mayEdit()) return;
    var t = HV.termOf(c);
    HV.sheet(
      '<div class="h2">Renew term</div>' +
      '<p class="sub" style="margin:0">The current term ' +
        (t.ended ? 'ended ' + Math.abs(t.left) + ' days ago' : 'has ' + t.left + ' days left') +
        '. A new term starts today.</p>' +
      '<label class="crrow" style="margin-top:var(--s4)"><small>Length in days</small>' +
        '<input class="input" data-rn-days type="number" value="' + t.days + '"></label>' +
      '<div class="row" style="justify-content:flex-end">' +
        '<button class="btn ghost" data-rn-cancel>Cancel</button>' +
        '<button class="btn" data-rn-save>Renew</button>' +
      '</div>',
      function (sh) {
        sh.querySelector('[data-rn-cancel]').addEventListener('click', HV.closeSheet);
        sh.querySelector('[data-rn-save]').addEventListener('click', function () {
          var days = Number(sh.querySelector('[data-rn-days]').value) || t.days;
          if (!mayEdit() || days <= 0) return;
          c.term = c.term || {};
          c.term.renewals = (c.term.renewals || []).concat([{
            fromISO: t.startISO, toISO: t.endISO, days: t.days,
            byId: (HV.me() || {}).id, at: HV.now() }]);
          c.term.startISO = HV.todayISO();
          c.term.days = days;
          HV.logAct(c, 'term', 'Renewed for ' + days + ' days');
          HV.closeSheet(); HV.refresh();
          HV.toast('Renewed — ' + days + ' days from today.');
        });
      }
    );
  }

  /* one delegated listener for every record surface */
  function wire(el, c) {
    el.addEventListener('click', function (e) {
      if (e.target.closest('[data-status]'))      { statusSheet(c); return; }
      if (e.target.closest('[data-editprofile]')) { editProfileSheet(c); return; }
      if (e.target.closest('[data-renew]'))       { renewSheet(c); return; }
      var vf = e.target.closest('[data-verify]');
      if (vf) { verify(c, vf.dataset.verify); return; }
      var lf = e.target.closest('[data-logfil]');
      if (lf) { logFilter = lf.dataset.logfil; HV.refresh(); return; }
      var fi = e.target.closest('[data-file]');
      if (fi) { var a = fi.dataset.file.split('|'); fileSheet(c, a[0], a[1]); return; }
    });
  }

  HV.clientRecord = {
    profileHtml: profileHtml,
    medicalHtml: medicalHtml,
    logsHtml: logsHtml,
    meetingsHtml: meetingsHtml,
    wire: wire,
  };
}());
