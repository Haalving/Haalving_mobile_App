/* HAALVING console — Time & Cover (#/leave): the team's clock in one place.
   Four tabs, each scoped by role:
     My availability — paint-your-week editor over u.avail (every staff seat)
     My leave        — my applications + the apply sheet (every staff seat)
     Team            — the cover board: HoD (own dept), Ops Head / Super Admin (all)
     Approvals       — the sign-off packet for leaveConfig.approverRole
   A leave walks FOUR steps: reassign (the cover board plans it) → accept (every
   named cover says yes) → pending (the approver signs) → approved | declined.
   The accept step is TJ's rule, 17 Aug 2026: a HoD picking a name from a
   dropdown is not the same as that coach agreeing to work the morning. Any
   decline sends the whole plan back to `reassign`, or it would strand in a
   state with no button anywhere.

   Reallocation covers the pod SEATS and the booked SESSIONS in the window —
   the seats alone left the appointments naming a coach who was away.
   Approving writes c.podCover per reallocation and t.exc[rd].assignees per
   session; covers expire by date alone (HV.coverActive reads the window), so
   nothing ever needs a cleanup job. */
(function () {
  'use strict';

  var DAYS = [
    ['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'],
    ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday'],
  ];
  var ACT_LABELS = { applied: 'Applied', reassigned: 'Cover planned',
    'cover accepted': 'Cover accepted', 'cover declined': 'Cover declined',
    approved: 'Approved', declined: 'Declined' };

  /* one style block, .lv- prefixed, tokens only; hairline separators are
     list grammar (the no-border rule is about card outlines) */
  function css() {
    return '<style>' +
      '#lv-root .trow .grow{flex:1; min-width:0}' +
      '.lv-week{display:flex; flex-direction:column; margin-top:var(--s3)}' +
      '.lv-dayrow{display:flex; align-items:center; gap:var(--s3); padding:var(--s2) 0; min-height:44px}' +
      '.lv-dayrow + .lv-dayrow{border-top:1px solid var(--line)}' +
      '.lv-dtog{display:flex; align-items:center; gap:var(--s2); flex:1; min-width:0; font-weight:600; font-size:var(--t-sm); cursor:pointer}' +
      '.lv-dtog input{accent-color:var(--brand); width:18px; height:18px; flex:none}' +
      /* a split shift wraps to its own line rather than squeezing the pickers */
      '.lv-times{display:flex; align-items:center; gap:var(--s2); flex-wrap:wrap; justify-content:flex-end}' +
      '.lv-range{display:flex; align-items:center; gap:var(--s2)}' +
      '.lv-addr{font-size:var(--t-micro); white-space:nowrap}' +
      '.lv-daysplit{align-items:flex-start}' +
      '.lv-daysplit .lv-dtog{padding-top:var(--s2)}' +
      '.lv-time{width:auto; padding:var(--s2) var(--s3); font-size:var(--t-sm)}' +
      '.lv-off{min-width:3em; text-align:right}' +
      '.lv-card{display:flex; flex-direction:column; gap:var(--s3)}' +
      '.lv-retab{display:flex; flex-direction:column}' +
      '.lv-re{display:flex; align-items:center; gap:var(--s3); padding:var(--s2) 0}' +
      '.lv-re + .lv-re{border-top:1px solid var(--line)}' +
      '.lv-re .grow{flex:1; min-width:0}' +
      '.lv-re small{display:block; color:var(--ink-2); font-size:var(--t-xs)}' +
      '.lv-re svg{width:16px; height:16px; stroke:currentColor; fill:none; stroke-width:1.6; stroke-linecap:round; stroke-linejoin:round; color:var(--ink-3); flex:none}' +
      '.lv-cov{display:flex; align-items:center; gap:var(--s2); font-size:var(--t-sm)}' +
      '.lv-cbrow{display:flex; align-items:center; gap:var(--s3); padding:var(--s2) 0}' +
      '.lv-cbrow + .lv-cbrow{border-top:1px solid var(--line)}' +
      '.lv-cbrow .grow{flex:1; min-width:0}' +
      '.lv-cbrow small{display:block; color:var(--ink-2); font-size:var(--t-xs)}' +
      '.lv-sel{width:auto; max-width:17em; padding:var(--s2) var(--s3); font-size:var(--t-sm)}' +
      '</style>';
  }

  /* ---------------- vocabulary helpers ---------------- */
  function cfg() { return HV.store.leaveConfig || { approverRole: 'admin' }; }
  function first(name) { return String(name || '').split(' ')[0]; }
  function roleTitle(key) { var r = HV.roleDef(key); return r ? r.title : (key || '—'); }

  function fmtD(iso) {
    var p = String(iso || '').split('-');
    if (p.length !== 3) return String(iso || '');
    return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function fmtDshort(iso) {
    var p = String(iso || '').split('-');
    if (p.length !== 3) return String(iso || '');
    return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }
  function dspan(iso) { return '<span class="num">' + HV.esc(fmtD(iso)) + '</span>'; }
  function range(lv) { return dspan(lv.from) + ' – ' + dspan(lv.to); }
  function agoTs(ts) { return HV.ago(Math.max(0, HV.minsSince(ts))); }

  function tzPill(u) {
    var tzo = u.tzo == null ? 5.5 : u.tzo;
    var a = Math.abs(tzo), h = Math.floor(a), m = Math.round((a - h) * 60);
    var off = 'UTC' + (tzo < 0 ? '−' : '+') + h + (m ? ':' + (m < 10 ? '0' : '') + m : '');
    return '<span class="pill neutral">' + HV.esc(u.tzLabel || 'IST') + ' · <span class="num">' + off + '</span></span>';
  }
  function lvlPill(u) {
    return u.level ? '<span class="pill neutral"><span class="num">L' + u.level + '</span></span>' : '';
  }
  function statusPill(lv) {
    return lv.status === 'reassign' ? HV.ui.pill('Cover plan due', 'warn')
      : lv.status === 'accept' ? HV.ui.pill('Waiting on the cover', 'warn')
      : lv.status === 'pending' ? HV.ui.pill('Awaiting ' + roleTitle(cfg().approverRole), 'info')
      : lv.status === 'approved' ? HV.ui.pill('Approved', 'ok')
      : HV.ui.pill('Declined', 'bad');
  }

  /* ---------------- leave-model helpers ---------------- */
  /* the pod seat a staff member holds: coaches sit on their role key, an HoD
     sits on their department's key; everyone else holds no coach seat */
  function coachSeat(u) {
    var k = u.role === 'hod' ? u.dept : u.role;
    return HV.DEPTS[k] ? k : null;
  }
  function overlaps(lv, from, to) { return lv.from <= to && from <= lv.to; }
  function onApprovedLeave(uid, from, to) {
    return (HV.store.leaves || []).some(function (l) {
      return l.staffId === uid && l.status === 'approved' && overlaps(l, from, to);
    });
  }
  /* clients whose seat resolves to the applicant TODAY (cover-aware) */
  function clientsRiding(applicant) {
    var seat = coachSeat(applicant);
    if (!seat) return [];
    return HV.store.clients.filter(function (c) { return HV.staffFor(c, seat).id === applicant.id; });
  }
  /* the bench that can take the seat: dept members minus the applicant, minus
     anyone on approved leave overlapping the window — same level first */
  function bench(applicant, lv) {
    var dept = applicant.dept || coachSeat(applicant);
    if (!dept) return [];
    return HV.deptMembers(dept)
      .filter(function (u) { return u.id !== applicant.id && !onApprovedLeave(u.id, lv.from, lv.to); })
      .sort(function (a, b) {
        var sa = a.level === applicant.level ? 0 : 1;
        var sb = b.level === applicant.level ? 0 : 1;
        return (sa - sb) || ((a.level || 9) - (b.level || 9)) || String(a.name).localeCompare(String(b.name));
      });
  }
  /* Every session occurrence falling inside a leave window. The board used to
     reallocate pod SEATS only, so eight of Vikram's booked appointments sat
     inside his leave with nothing anywhere saying so — and the client's own My
     Plan still named him, because a booking wins on "with whom". */
  function sessionsInLeave(lv) {
    var out = [];
    (HV.store.tasks || []).forEach(function (t) {
      if ((t.assignees || []).indexOf(lv.staffId) === -1) return;
      /* a RHYTHM is a standing to-do pinned to a nominal hour, not an
         appointment somebody is waiting at — there is nobody to hand it to */
      if (t.rhythm) return;
      for (var rd = -30; rd <= 60; rd++) {
        var o = HV.occursOn(t, rd);
        if (!o) continue;
        var iso = HV.dateAdd(HV.todayISO(), rd);
        if (iso < lv.from || iso > lv.to) continue;
        out.push({ taskId: t.id, rd: rd, iso: iso, title: o.title,
                   start: o.start, dur: o.dur, clientId: t.clientId });
      }
    });
    return out.sort(function (a, b) {
      return a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : a.start - b.start;
    });
  }
  /* WHY somebody cannot take a slot, in the right words. "Clashes" means
     double-booked; being outside a coach's declared week is a different thing,
     and saying "clashes" for it reads as a scheduling fault rather than the
     plain fact that they do not work then. Vikram is a 6 am / 5 pm split-shift
     trainer and Nikhil works middays, so most of this board is the second
     case, not the first. */
  function whyNot(uid, s) {
    var c = HV.conflicts([uid], s.rd, s.start, s.dur, {});
    if (!c.length) return 'free';
    if (c.some(function (x) { return x.type === 'busy'; })) return 'already booked';
    if (c.some(function (x) { return x.type === 'leave'; })) return 'on leave';
    return 'outside their hours';
  }
  function coverPill(uid, s, o) {
    if (!o) return '';
    var c = HV.conflicts([uid], s.rd, o.start, o.dur, {});
    if (!c.length) return HV.ui.pill('You are free', 'ok');
    if (c.some(function (x) { return x.type === 'busy'; })) return HV.ui.pill('Clashes for you', 'bad');
    if (c.some(function (x) { return x.type === 'leave'; })) return HV.ui.pill('You are on leave', 'bad');
    return HV.ui.pill('Outside your hours', 'warn');
  }
  /* can this bench member actually take them? The bench filter only ever
     excluded people on approved leave, so it would happily hand you someone
     already booked solid across the whole window. */
  function benchLoad(uid, sessions) {
    var clashes = sessions.filter(function (s) {
      return HV.conflicts([uid], s.rd, s.start, s.dur, {}).length > 0;
    }).length;
    return { free: sessions.length - clashes, clashes: clashes, total: sessions.length };
  }
  function loadWords(uid, sessions) {
    if (!sessions.length) return '';
    var l = benchLoad(uid, sessions);
    return l.clashes === 0 ? ' · free for all ' + l.total
      : l.free === 0 ? ' · clashes with all ' + l.total
      : ' · ' + l.clashes + ' of ' + l.total + ' clash';
  }
  /* the covers waiting on ME to say yes or no */
  function mineToAccept(me) {
    return (HV.store.leaves || []).filter(function (l) {
      return l.status === 'accept' && (l.coverAccepts || {})[me.id] === null;
    });
  }
  /* The LAST acceptance moves the application on; ANY decline sends the whole
     plan back to the board. Without that route back, a decline strands the
     leave in a state with no button anywhere. */
  function respondCover(lv, me, yes) {
    lv.coverAccepts = lv.coverAccepts || {};
    lv.coverAccepts[me.id] = yes ? 'accepted' : 'declined';
    lv.history.push({ act: yes ? 'cover accepted' : 'cover declined', byId: me.id, ts: HV.now() });
    var ap = HV.staff(lv.staffId);
    if (!yes) {
      lv.status = 'reassign';
      HV.notice(lv.staffId, 'leave', me.name + ' cannot take the cover — back to the board.');
      var hod = ap.dept ? HV.hodOf(ap.dept) : null;
      if (hod && hod.id !== me.id) {
        HV.notice(hod.id, 'leave', me.name + ' declined the cover for ' + ap.name + ' — re-plan it.');
      }
    } else if (Object.keys(lv.coverAccepts).every(function (k) { return lv.coverAccepts[k] === 'accepted'; })) {
      lv.status = 'pending';
      approvers().forEach(function (u) {
        HV.notice(u.id, 'leave', ap.name + '’s cover plan is accepted in full — your signature is next.');
      });
    }
    HV.save();
    HV.toast(yes
      ? (lv.status === 'pending' ? 'Accepted — it goes to the ' + roleTitle(cfg().approverRole) + ' now.'
                                 : 'Accepted — still waiting on the others.')
      : 'Declined — the board will re-plan it.');
    HV.refresh();
  }
  function approvers() {
    return HV.store.users.filter(function (u) { return u.role === cfg().approverRole && !u.inactive; });
  }
  function gates(me) {
    return {
      team: me.role === 'hod' || me.role === 'opshead' || me.role === 'admin' || HV.can('reassignLeave'),
      approve: me.role === cfg().approverRole || HV.can('approveLeave'),
    };
  }
  /* an HoD's queue is their own bench; Ops Head / Super Admin see everything */
  function teamLeaves(me) {
    var all = HV.store.leaves || [];
    if (me.role === 'hod' && me.dept) {
      return all.filter(function (l) {
        var ap = HV.staff(l.staffId);
        return (ap.dept || coachSeat(ap)) === me.dept;
      });
    }
    return all;
  }

  /* ---------------- shared fragments ---------------- */
  function history(lv) {
    return (lv.history || []).map(function (h) {
      var who = HV.staff(h.byId);
      return '<p class="audit">' + HV.esc(ACT_LABELS[h.act] || h.act) + ' — ' + HV.esc(who.name) +
        ' · <span class="num">' + HV.esc(agoTs(h.ts)) + '</span></p>';
    }).join('');
  }
  function reallocRows(lv) {
    if (!(lv.reallocations || []).length) return '<p class="sub">No client covers needed for this window.</p>';
    return '<div class="lv-retab">' + lv.reallocations.map(function (r) {
      var c = HV.client(r.clientId), cov = HV.staff(r.toId);
      return '<div class="lv-re"><span class="grow"><b>' + HV.esc(c ? c.name : r.clientId) + '</b>' +
        '<small>' + HV.esc(HV.DEPTS[r.roleKey] || r.roleKey) + ' seat</small></span>' +
        HV.ui.icon('arrow') +
        '<span class="lv-cov">' + HV.ui.avatar(cov.name, 'sm') + '<b>' + HV.esc(cov.name) + '</b></span></div>';
    }).join('') + '</div>';
  }

  /* ---------------- tab 1: my availability ---------------- */
  /* 'HH:MM' back out of minutes, for the <input type="time"> value */
  function minToHm(m) {
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  }
  function availHtml(me) {
    var rows = DAYS.map(function (d) {
      var wins = HV.availWindows(me, d[0]);
      var ranges = wins.map(function (w, i) {
        return '<span class="lv-range">' +
          '<input class="input lv-time num" type="time" data-avfrom="' + d[0] + ':' + i + '" value="' +
            HV.esc(minToHm(w[0])) + '" aria-label="' + d[1] + ' range ' + (i + 1) + ' start">' +
          '<span class="sub">to</span>' +
          '<input class="input lv-time num" type="time" data-avto="' + d[0] + ':' + i + '" value="' +
            HV.esc(minToHm(w[1])) + '" aria-label="' + d[1] + ' range ' + (i + 1) + ' end">' +
          /* the first range is the day itself — the checkbox removes that one */
          (i === 0 ? '' : '<button class="btn ghost sm" data-avdel="' + d[0] + ':' + i +
            '" aria-label="Remove ' + d[1] + ' range ' + (i + 1) + '">' + HV.ui.icon('x') + '</button>') +
        '</span>';
      }).join('');
      return '<div class="lv-dayrow' + (wins.length > 1 ? ' lv-daysplit' : '') + '">' +
        '<label class="lv-dtog"><input type="checkbox" data-avon="' + d[0] + '"' + (wins.length ? ' checked' : '') + '>' +
        '<span>' + d[1] + '</span></label>' +
        (wins.length
          ? '<span class="lv-times">' + ranges +
            '<button class="btn ghost sm lv-addr" data-avadd="' + d[0] + '">Add a range</button></span>'
          : '<span class="sub lv-off">Off</span>') +
        '</div>';
    }).join('');
    return '<div class="card">' +
      '<div class="h1-row"><b>My working week</b>' + tzPill(me) + '</div>' +
      '<p class="sub">Add a second range for a split shift — a morning and an evening with the ' +
        'middle of the day free. The schedule shades every hour outside your ranges, bookings are ' +
        'refused outside them, and the cover board respects them. Changes save as you make them.</p>' +
      '<div class="lv-week">' + rows + '</div></div>';
  }
  function wireAvail(root, me) {
    /* ONE range stays in the simpler flat shape and only nests when it earns
       it — so a record that has never had a split shift reads exactly as it
       always did, and both shapes read back identically through
       HV.availWindows. */
    function writeDay(dayKey, wins) {
      me.avail = me.avail || {};
      me.avail[dayKey] = !wins.length ? null
        : wins.length === 1 ? [minToHm(wins[0][0]), minToHm(wins[0][1])]
        : wins.map(function (w) { return [minToHm(w[0]), minToHm(w[1])]; });
      HV.save();
    }
    root.querySelectorAll('[data-avon]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        writeDay(cb.dataset.avon, cb.checked ? [[9 * 60, 17 * 60]] : []);
        HV.refresh();
      });
    });
    /* a new range goes after the last one, in the first free hour of the
       evening it can have — never on top of a range already there */
    root.querySelectorAll('[data-avadd]').forEach(function (b) {
      b.addEventListener('click', function () {
        var day = b.dataset.avadd;
        var wins = HV.availWindows(me, day);
        var last = wins.length ? wins[wins.length - 1][1] : 9 * 60;
        var from = Math.min(last + 60, 22 * 60);
        if (from + 60 > 24 * 60) { HV.toast('There is no room left in the day for another range.'); return; }
        writeDay(day, wins.concat([[from, Math.min(from + 240, 24 * 60)]]));
        HV.refresh();
      });
    });
    root.querySelectorAll('[data-avdel]').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = b.dataset.avdel.split(':');
        var wins = HV.availWindows(me, p[0]).slice();
        wins.splice(Number(p[1]), 1);
        writeDay(p[0], wins);
        HV.refresh();
      });
    });
    /* a range must start before it ends, and must not run into its
       neighbours — two overlapping ranges are not a split shift, they are a
       record that cannot be read back */
    function onTime(inp, idx) {
      var p = (inp.dataset.avfrom || inp.dataset.avto).split(':');
      var day = p[0], ix = Number(p[1]);
      var wins = HV.availWindows(me, day).slice();
      var cur = wins[ix];
      if (!cur) return;
      var v = HV.hmToMin(inp.value);
      var next = [cur[0], cur[1]];
      next[idx] = v;
      var clash = v == null || next[0] >= next[1] ||
        wins.some(function (w, i) { return i !== ix && next[0] < w[1] && w[0] < next[1]; });
      if (clash) {
        HV.toast(v == null || next[0] >= next[1]
          ? 'A range has to start before it ends — kept the old time.'
          : 'That runs into another range on the same day — kept the old time.');
        inp.value = minToHm(cur[idx]);
        return;
      }
      wins[ix] = next;
      writeDay(day, wins);   /* no refresh — the picker may still be under the pointer */
    }
    root.querySelectorAll('[data-avfrom]').forEach(function (i) {
      i.addEventListener('change', function () { onTime(i, 0); });
    });
    root.querySelectorAll('[data-avto]').forEach(function (i) {
      i.addEventListener('change', function () { onTime(i, 1); });
    });
  }

  /* The covers waiting on ME. This lives on MY LEAVE, not the Team board:
     being asked to cover is something that happens to a person, and a plain
     coach has no Team tab at all — the ask would never have reached them. */
  function toAcceptHtml(me) {
    var toAccept = mineToAccept(me);
    if (!toAccept.length) return '';
    /* first on the page, because somebody is waiting on an answer */
    return '<div class="sec-title">Waiting on you</div><div class="list">' +
        toAccept.map(function (lv) {
          var ap = HV.staff(lv.staffId);
          var mine = (lv.sessions || []).filter(function (s) { return s.toId === me.id; });
          var seats = (lv.reallocations || []).filter(function (r) { return r.toId === me.id; });
          return '<div class="card lv-card">' +
            '<div class="trow">' + HV.ui.avatar(ap.name) +
              '<span class="grow"><b>Cover ' + HV.esc(ap.name) + '</b><small>' +
              HV.esc(roleTitle(ap.role)) + ' · ' + HV.esc(fmtD(lv.from)) + ' – ' + HV.esc(fmtD(lv.to)) +
              '</small></span>' + statusPill(lv) + '</div>' +
            '<p class="sub" style="margin:0">' +
              '<span class="num">' + seats.length + '</span> client seat' + (seats.length === 1 ? '' : 's') +
              ' · <span class="num">' + mine.length + '</span> booked session' + (mine.length === 1 ? '' : 's') +
              ' would move to you.</p>' +
            (mine.length ? '<div class="lv-retab">' + mine.map(function (s) {
                var t = (HV.store.tasks || []).find(function (x) { return x.id === s.taskId; });
                var o = t ? HV.occursOn(t, s.rd) : null;
                var cl = t && t.clientId ? HV.client(t.clientId) : null;
                return '<div class="lv-re">' + HV.ui.icon('cal') +
                  '<span class="grow"><b>' + HV.esc(o ? o.title : 'Session') + '</b><small>' +
                  HV.esc(fmtDshort(HV.dateAdd(HV.todayISO(), s.rd))) +
                  (o ? ' · <span class="num">' + HV.esc(HV.fmtTime(o.start)) + '</span>' : '') +
                  (cl ? ' · ' + HV.esc(cl.name) : '') + '</small></span>' +
                  coverPill(me.id, s, o) +
                '</div>';
              }).join('') + '</div>' : '') +
            '<div class="row" style="justify-content:flex-end; gap:var(--s2)">' +
              '<button class="btn ghost sm" data-covno="' + HV.esc(lv.id) + '">I can’t take these</button>' +
              '<button class="btn sm" data-covyes="' + HV.esc(lv.id) + '">Accept the cover</button>' +
            '</div></div>';
        }).join('') + '</div>';
  }

  /* ---------------- tab 2: my leave ---------------- */
  function mineHtml(me) {
    var ask = toAcceptHtml(me);
    var mine = (HV.store.leaves || []).filter(function (l) { return l.staffId === me.id; })
      .slice().sort(function (a, b) { return a.from < b.from ? 1 : a.from > b.from ? -1 : 0; });
    var html = ask + '<div class="notice">Leave walks four steps: you apply; your department head ' +
      'reallocates your clients <em>and the sessions already booked in that window</em>; every coach ' +
      'named as a cover accepts; then the ' + HV.esc(roleTitle(cfg().approverRole)) + ' signs it off — ' +
      'nothing reaches them until the covers have agreed. Approved covers switch on and off by their ' +
      'dates automatically.</div>';
    html += mine.length
      ? '<div class="list">' + mine.map(function (lv) {
          return '<div class="card lv-card">' +
            '<div class="h1-row"><b>' + range(lv) + '</b>' + statusPill(lv) + '</div>' +
            '<div class="sub">“' + HV.esc(lv.reason) + '”</div>' +
            (lv.declineReason ? '<div class="notice warn">Declined: “' + HV.esc(lv.declineReason) + '”</div>' : '') +
            ((lv.reallocations || []).length ? reallocRows(lv) : '') +
            history(lv) + '</div>';
        }).join('') + '</div>'
      : HV.ui.empty('sun', 'No leave on file.', 'Apply below when you need a break — the team plans the cover.');
    html += '<button class="btn block" data-apply style="margin-top:var(--s4)">Apply for leave</button>';
    return html;
  }

  function applySheet(me) {
    var t = HV.todayISO();
    var hod = me.dept ? HV.hodOf(me.dept) : null;
    var toHod = hod && hod.id !== me.id;
    HV.sheet(
      '<div class="h1">Apply for leave</div>' +
      '<p class="sub">Your application goes to ' +
        HV.esc(toHod ? hod.name + ', your department head,' : 'the Ops Head') +
        ' to plan covers for your clients, then to the ' + HV.esc(roleTitle(cfg().approverRole)) + ' to sign.</p>' +
      '<label class="field-label" for="lv-from">First day</label>' +
      '<input class="input num" id="lv-from" type="date" value="' + HV.esc(HV.dateAdd(t, 1)) + '" min="' + HV.esc(t) + '">' +
      '<label class="field-label" for="lv-to">Last day</label>' +
      '<input class="input num" id="lv-to" type="date" value="' + HV.esc(HV.dateAdd(t, 1)) + '" min="' + HV.esc(t) + '">' +
      '<label class="field-label" for="lv-why">Reason</label>' +
      '<textarea class="input" id="lv-why" placeholder="Reason (required) — travels with the request"></textarea>' +
      '<button class="btn block" id="lv-send" disabled>Send the application</button>' +
      '<button class="btn block ghost" id="lv-cancel">Not now</button>',
      function (sheet) {
        var from = sheet.querySelector('#lv-from'), to = sheet.querySelector('#lv-to');
        var why = sheet.querySelector('#lv-why'), go = sheet.querySelector('#lv-send');
        function check() {
          go.disabled = !(from.value && to.value && from.value <= to.value && why.value.trim());
        }
        [from, to, why].forEach(function (i) {
          i.addEventListener('input', check);
          i.addEventListener('change', check);
        });
        sheet.querySelector('#lv-cancel').addEventListener('click', HV.closeSheet);
        go.addEventListener('click', function () {
          if (!(from.value && to.value && from.value <= to.value && why.value.trim())) return;
          var s = HV.store;
          s.leaveSeq = (s.leaveSeq || (s.leaves || []).length) + 1;
          var lv = { id: 'lv-' + s.leaveSeq, staffId: me.id, from: from.value, to: to.value,
            reason: why.value.trim(), status: 'reassign', reallocations: [],
            history: [{ act: 'applied', byId: me.id, ts: HV.now() }] };
          (s.leaves = s.leaves || []).push(lv);
          HV.save();
          var targets = toHod ? [hod]
            : s.users.filter(function (u) { return u.role === 'opshead' && !u.inactive; });
          targets.forEach(function (u) {
            HV.notice(u.id, 'leave', me.name + ' applied for leave, ' + fmtD(lv.from) + ' – ' + fmtD(lv.to) +
              ' — the cover board is waiting.');
          });
          HV.closeSheet();
          HV.toast('Applied — next stop is the cover board.');
          HV.refresh();
        });
      });
  }

  /* ---------------- tab 3: team (the cover board) ---------------- */
  function teamHtml(me) {
    var scope = teamLeaves(me);
    var open = scope.filter(function (l) { return l.status === 'reassign'; });
    var pend = scope.filter(function (l) { return l.status === 'pending'; });
    var decided = scope.filter(function (l) { return l.status === 'approved' || l.status === 'declined'; });
    var today = HV.todayISO();
    var active = [];
    scope.forEach(function (l) {
      if (l.status !== 'approved' || !(l.from <= today && today <= l.to)) return;
      (l.reallocations || []).forEach(function (r) { active.push({ lv: l, r: r }); });
    });

    var html = me.role === 'hod' && me.dept
      ? '<p class="sub">Scoped to your bench — ' + HV.esc(HV.DEPTS[me.dept] || me.dept) + '.</p>' : '';

    html += '<div class="sec-title">Needs a cover plan</div>';
    html += open.length
      ? '<div class="list">' + open.map(function (lv) {
          var ap = HV.staff(lv.staffId);
          var n = clientsRiding(ap).length;
          var ns = sessionsInLeave(lv).length;
          return '<div class="card lv-card">' +
            '<div class="trow">' + HV.ui.avatar(ap.name) +
              '<span class="grow"><b>' + HV.esc(ap.name) + '</b><small>' + HV.esc(roleTitle(ap.role)) + '</small></span>' +
              lvlPill(ap) + statusPill(lv) + '</div>' +
            '<div class="h1-row"><b>' + range(lv) + '</b><span class="sub"><span class="num">' + n + '</span> client' +
              (n === 1 ? '' : 's') + ' ride on this seat · <span class="num">' + ns + '</span> booked session' +
              (ns === 1 ? '' : 's') + ' in the window</span></div>' +
            '<div class="sub">“' + HV.esc(lv.reason) + '”</div>' +
            history(lv) +
            '<div class="row"><button class="btn sm" data-plan="' + HV.esc(lv.id) + '">Plan the cover</button></div>' +
            '</div>';
        }).join('') + '</div>'
      : HV.ui.empty('leaf', 'No applications waiting on a cover plan.');

    /* planned, but the cover has not answered yet. Without this group an
       application in `accept` shows in NO section of the board at all. */
    var waiting = scope.filter(function (l) { return l.status === 'accept'; });
    if (waiting.length) {
      html += '<div class="sec-title">Waiting on the cover to accept</div><div class="list">' +
        waiting.map(function (lv) {
          var ap = HV.staff(lv.staffId);
          var acc = lv.coverAccepts || {};
          var yet = Object.keys(acc).filter(function (k) { return acc[k] === null; });
          return '<div class="card lv-card">' +
            '<div class="h1-row"><b>' + HV.esc(ap.name) + ' · ' + range(lv) + '</b>' + statusPill(lv) + '</div>' +
            '<p class="sub" style="margin:0">Waiting on ' +
              HV.esc(yet.map(function (id) { return HV.staff(id).name; }).join(' and ') || 'nobody') +
              '. Nothing reaches the ' + HV.esc(roleTitle(cfg().approverRole)) + ' until they answer.</p>' +
            reallocRows(lv) + '</div>';
        }).join('') + '</div>';
    }

    html += '<div class="sec-title">Waiting on ' + HV.esc(roleTitle(cfg().approverRole)) + '</div>';
    html += pend.length
      ? '<div class="list">' + pend.map(function (lv) {
          var ap = HV.staff(lv.staffId);
          return '<div class="card lv-card">' +
            '<div class="h1-row"><b>' + HV.esc(ap.name) + ' · ' + range(lv) + '</b>' + statusPill(lv) + '</div>' +
            reallocRows(lv) + '</div>';
        }).join('') + '</div>'
      : '<p class="sub">Nothing from here is in the approval queue.</p>';

    html += '<div class="sec-title">Covers running today</div>';
    html += active.length
      ? '<div class="list">' + active.map(function (x) {
          var cov = HV.staff(x.r.toId), ap = HV.staff(x.lv.staffId), c = HV.client(x.r.clientId);
          return '<div class="trow">' + HV.ui.avatar(cov.name) +
            '<span class="grow"><b>' + HV.esc(cov.name) + ' covers ' + HV.esc(ap.name) + '</b>' +
            '<small>' + HV.esc(c ? c.name : x.r.clientId) + ' · ' + HV.esc(HV.DEPTS[x.r.roleKey] || x.r.roleKey) + ' seat</small></span>' +
            '<span class="pill ok">Until <span class="num">' + HV.esc(fmtDshort(x.lv.to)) + '</span></span></div>';
        }).join('') + '</div>' +
        '<p class="audit">Covers lapse by date on their own — the seat returns to its owner the morning after.</p>'
      : HV.ui.empty('sun', 'No covers running today.');

    if (decided.length) {
      html += '<div class="sec-title">Decided</div><div class="list">' + decided.map(function (lv) {
        var ap = HV.staff(lv.staffId);
        return '<div class="trow">' + HV.ui.avatar(ap.name) +
          '<span class="grow"><b>' + HV.esc(ap.name) + '</b><small>' + range(lv) + '</small></span>' +
          statusPill(lv) + '</div>';
      }).join('') + '</div>';
    }
    return html;
  }

  /* the reallocation board: one cover picker per client riding the seat */
  function planSheet(lv, me) {
    var ap = HV.staff(lv.staffId);
    var seat = coachSeat(ap);
    var riding = seat ? clientsRiding(ap) : [];
    var cands = seat ? bench(ap, lv) : [];
    var sess = sessionsInLeave(lv);
    var rows;
    if (!seat) {
      rows = '<div class="notice">No coach seat rides on the ' + HV.esc(roleTitle(ap.role)) +
        ' role — this application can go straight to the ' + HV.esc(roleTitle(cfg().approverRole)) + '.</div>';
    } else if (!riding.length) {
      rows = '<div class="notice">No clients resolve to ' + HV.esc(ap.name) +
        ' right now — nothing to reallocate, send it on.</div>';
    } else if (!cands.length) {
      rows = '<div class="notice bad">No one on the ' + HV.esc(HV.DEPTS[ap.dept || seat] || 'department') +
        ' bench is free ' + fmtD(lv.from) + ' – ' + fmtD(lv.to) + ' — the application cannot move until someone is.</div>';
    } else {
      /* the whole window's load, so every option can say what it costs */
      var optsFor = function (sessions) {
        return cands.map(function (u, i) {
          return '<option value="' + HV.esc(u.id) + '"' + (i === 0 ? ' selected' : '') + '>' +
            HV.esc(u.name + ' · L' + (u.level || 2) + (u.level === ap.level ? ' · same level' : '') +
              (u.role === 'hod' ? ' · HoD' : '') + loadWords(u.id, sessions)) + '</option>';
        }).join('');
      };
      var seatOpts = optsFor(sess);
      rows = '<div class="sec-title">The pod seats</div>' + riding.map(function (c) {
        return '<div class="lv-cbrow">' + HV.ui.avatar(c.name, 'sm') +
          '<span class="grow"><b>' + HV.esc(c.name) + '</b><small>' + HV.esc(HV.DEPTS[seat]) + ' seat</small></span>' +
          '<select class="input lv-sel" data-cover="' + HV.esc(c.id) + '" aria-label="Cover for ' + HV.esc(c.name) + '">' +
          seatOpts + '</select></div>';
      }).join('');
    }
    /* the appointments themselves — each one picked over individually, because
       a cover free on Thursday may be booked solid on Friday */
    var sessRows = !sess.length
      ? '<p class="sub">No booked sessions fall inside this window.</p>'
      : sess.map(function (s) {
          var cl = s.clientId ? HV.client(s.clientId) : null;
          return '<div class="lv-cbrow">' + HV.ui.iconTile('cal', 'sm') +
            '<span class="grow"><b>' + HV.esc(s.title) + '</b><small>' +
              HV.esc(fmtDshort(s.iso)) + ' · <span class="num">' + HV.esc(HV.fmtTime(s.start)) + '</span>' +
              (cl ? ' · ' + HV.esc(cl.name) : '') + '</small></span>' +
            (cands.length
              ? '<select class="input lv-sel" data-sesscover="' + HV.esc(s.taskId + ':' + s.rd) +
                  '" aria-label="Cover for ' + HV.esc(s.title) + '">' +
                  cands.map(function (u, i) {
                    return '<option value="' + HV.esc(u.id) + '"' + (i === 0 ? ' selected' : '') + '>' +
                      HV.esc(u.name + ' · ' + whyNot(u.id, s)) + '</option>';
                  }).join('') + '</select>'
              : '') +
          '</div>';
        }).join('');
    var sendable = !seat || (!riding.length && !sess.length) || cands.length > 0;
    HV.sheet(
      '<div class="h1">Cover board — ' + HV.esc(ap.name) + '</div>' +
      '<p class="sub">' + range(lv) + ' · “' + HV.esc(lv.reason) + '”. Same-level teammates list first; anyone already on approved leave in this window is left off the bench, and every option says whether they are actually free.</p>' +
      rows +
      '<div class="sec-title" style="margin-top:var(--s4)">The booked sessions</div>' +
      '<p class="sub" style="margin:0">' + (sess.length
        ? '<span class="num">' + sess.length + '</span> appointment' + (sess.length === 1 ? '' : 's') +
          ' fall inside this window. Each needs a name against it — the client is expecting somebody.'
        : 'Nothing booked in this window.') + '</p>' +
      sessRows +
      '<button class="btn block" id="lv-plan-go"' + (sendable ? '' : ' disabled') + ' style="margin-top:var(--s3)">Send for approval</button>' +
      '<button class="btn block ghost" id="lv-plan-x">Not yet</button>',
      function (sheet) {
        sheet.querySelector('#lv-plan-x').addEventListener('click', HV.closeSheet);
        var go = sheet.querySelector('#lv-plan-go');
        go.addEventListener('click', function () {
          if (go.disabled || lv.status !== 'reassign' || !gates(me).team) return;
          lv.reallocations = Array.prototype.map.call(sheet.querySelectorAll('select[data-cover]'), function (sel) {
            return { clientId: sel.dataset.cover, roleKey: seat, toId: sel.value };
          });
          /* the appointments, each with the name that will actually turn up */
          lv.sessions = Array.prototype.map.call(sheet.querySelectorAll('select[data-sesscover]'), function (sel) {
            var p = sel.dataset.sesscover.split(':');
            return { taskId: p[0], rd: Number(p[1]), toId: sel.value };
          });
          /* THE STEP TJ ADDED: a HoD picking a name from a dropdown is not the
             same as that coach agreeing to work the morning. Everyone named
             has to accept before the approver ever sees it. */
          var named = {};
          lv.reallocations.concat(lv.sessions).forEach(function (r) { named[r.toId] = true; });
          lv.coverAccepts = {};
          Object.keys(named).forEach(function (id) { lv.coverAccepts[id] = null; });
          var anyone = Object.keys(lv.coverAccepts).length;
          lv.status = anyone ? 'accept' : 'pending';
          lv.history.push({ act: 'reassigned', byId: me.id, ts: HV.now() });
          HV.save();
          if (anyone) {
            Object.keys(lv.coverAccepts).forEach(function (id) {
              var mine = lv.sessions.filter(function (s) { return s.toId === id; }).length;
              HV.notice(id, 'leave', 'You have been asked to cover for ' + ap.name + ', ' +
                fmtD(lv.from) + ' – ' + fmtD(lv.to) +
                (mine ? ' — ' + mine + ' booked session' + (mine === 1 ? '' : 's') + '. Accept or decline.'
                      : ' — accept or decline.'));
            });
          } else {
            approvers().forEach(function (u) {
              HV.notice(u.id, 'leave', ap.name + '’s leave (' + fmtD(lv.from) + ' – ' + fmtD(lv.to) +
                ') needs no cover — your signature is next.');
            });
          }
          HV.closeSheet();
          HV.toast(anyone
            ? 'Cover plan sent — waiting on ' +
              Object.keys(lv.coverAccepts).map(function (id) { return first(HV.staff(id).name); }).join(' and ')
            : 'Sent for approval — no covers needed');
          HV.refresh();
        });
      });
  }

  /* ---------------- tab 4: approvals ---------------- */
  function approveHtml() {
    var all = HV.store.leaves || [];
    var pend = all.filter(function (l) { return l.status === 'pending'; });
    var done = all.filter(function (l) { return l.status === 'approved' || l.status === 'declined'; });
    var html = '<p class="sub">Each packet shows the leave and how the work was reallocated — one signature approves both.</p>';
    html += pend.length
      ? '<div class="list">' + pend.map(function (lv) {
          var ap = HV.staff(lv.staffId);
          return '<div class="card lv-card">' +
            '<div class="trow">' + HV.ui.avatar(ap.name) +
              '<span class="grow"><b>' + HV.esc(ap.name) + '</b><small>' + HV.esc(roleTitle(ap.role)) + '</small></span>' +
              lvlPill(ap) + statusPill(lv) + '</div>' +
            '<div class="h1-row"><b>' + range(lv) + '</b></div>' +
            '<div class="sub">“' + HV.esc(lv.reason) + '”</div>' +
            reallocRows(lv) + history(lv) +
            '<div class="row">' +
              '<button class="btn sm" data-ok="' + HV.esc(lv.id) + '">Approve</button>' +
              '<button class="btn sm ghost" data-no="' + HV.esc(lv.id) + '">Decline</button></div>' +
            '</div>';
        }).join('') + '</div>'
      : HV.ui.empty('leaf', 'Nothing waiting on your signature.');
    if (done.length) {
      html += '<div class="sec-title">Decided</div><div class="list">' + done.map(function (lv) {
        var ap = HV.staff(lv.staffId);
        return '<div class="trow">' + HV.ui.avatar(ap.name) +
          '<span class="grow"><b>' + HV.esc(ap.name) + '</b><small>' + range(lv) + '</small></span>' +
          statusPill(lv) + '</div>';
      }).join('') + '</div>';
    }
    return html;
  }

  function approve(lv, me) {
    if (!gates(me).approve) return;
    lv.status = 'approved';
    lv.history.push({ act: 'approved', byId: me.id, ts: HV.now() });
    (lv.reallocations || []).forEach(function (r) {
      var c = HV.client(r.clientId);
      if (!c) return;
      c.podCover = c.podCover || {};
      c.podCover[r.roleKey] = { coverId: r.toId, from: lv.from, to: lv.to, leaveId: lv.id };
    });
    /* THE APPOINTMENTS FOLLOW THE COVER. The seat alone was never enough: a
       booking wins on "with whom", so moving only podCover left every booked
       session naming the coach who is away — and said so on the client's own
       My Plan. HV.occursOn carries assignees through an exception, so this one
       write reaches the grid, the digest, the reminder sweep and the client's
       calendar together. Per OCCURRENCE, never the series: only these days
       move, and the coach comes back to the rest. */
    (lv.sessions || []).forEach(function (s) {
      var t = (HV.store.tasks || []).find(function (x) { return x.id === s.taskId; });
      if (!t) return;
      t.exc = t.exc || {};
      t.exc[s.rd] = t.exc[s.rd] || {};
      t.exc[s.rd].assignees = [s.toId];
    });
    HV.clearCalCache();
    HV.save();
    var ap = HV.staff(lv.staffId);
    HV.notice(lv.staffId, 'leave', 'Your leave ' + fmtD(lv.from) + ' – ' + fmtD(lv.to) + ' is approved — covers are set.');
    var byCover = {};
    (lv.reallocations || []).forEach(function (r) { (byCover[r.toId] = byCover[r.toId] || []).push(r); });
    (lv.sessions || []).forEach(function (s) { byCover[s.toId] = byCover[s.toId] || []; });
    Object.keys(byCover).forEach(function (uid) {
      var n = byCover[uid].length;
      var ns = (lv.sessions || []).filter(function (s) { return s.toId === uid; }).length;
      HV.notice(uid, 'leave',
        'You cover ' + n + ' of ' + ap.name + '’s client' + (n === 1 ? '' : 's') +
        (ns ? ' and ' + ns + ' booked session' + (ns === 1 ? '' : 's') : '') +
        ', ' + fmtD(lv.from) + ' – ' + fmtD(lv.to) + '.',
        (byCover[uid][0] || {}).clientId);
    });
    HV.toast('Approved — covers switch on ' + fmtD(lv.from));
    HV.refresh();
  }

  function declineSheet(lv, me) {
    var ap = HV.staff(lv.staffId);
    HV.sheet(
      '<div class="h1">Decline ' + HV.esc(ap.name) + '’s leave</div>' +
      '<p class="sub">A decline travels back with a line the applicant can act on.</p>' +
      '<textarea class="input" id="lv-no-why" aria-label="Reason for declining" placeholder="Reason (required)"></textarea>' +
      '<button class="btn block" id="lv-no-go" disabled>Decline</button>' +
      '<button class="btn block ghost" id="lv-no-x">Keep it pending</button>',
      function (sheet) {
        var ta = sheet.querySelector('#lv-no-why'), go = sheet.querySelector('#lv-no-go');
        ta.addEventListener('input', function () { go.disabled = !ta.value.trim(); });
        sheet.querySelector('#lv-no-x').addEventListener('click', HV.closeSheet);
        go.addEventListener('click', function () {
          var why = ta.value.trim();
          if (!why || !gates(me).approve || lv.status !== 'pending') return;
          lv.status = 'declined';
          lv.declineReason = why;
          lv.history.push({ act: 'declined', byId: me.id, ts: HV.now() });
          HV.save();
          HV.notice(lv.staffId, 'leave', 'Your leave ' + fmtD(lv.from) + ' – ' + fmtD(lv.to) +
            ' was declined — “' + why + '”.');
          HV.closeSheet();
          HV.toast('Declined — the applicant has the reason.');
          HV.refresh();
        });
      });
  }

  /* ---------------- registration ---------------- */
  HV.registerView('leave', {
    title: 'Time & Cover',
    /* no roles[] — console access is nav membership (HV.allowedView); every
       console role's seeded nav carries 'leave' */
    render: function (el, params) {
      var me = HV.me();
      var g = gates(me);
      var scope = g.team ? teamLeaves(me) : [];
      var tabs = [
        { key: 'avail', label: 'My availability' },
        { key: 'mine', label: 'My leave', count: mineToAccept(me).length },
      ];
      if (g.team) tabs.push({ key: 'team', label: 'Team',
        count: scope.filter(function (l) { return l.status === 'reassign'; }).length });
      if (g.approve) tabs.push({ key: 'approve', label: 'Approvals',
        count: (HV.store.leaves || []).filter(function (l) { return l.status === 'pending'; }).length });
      var active = tabs.some(function (t) { return t.key === params[0]; }) ? params[0] : 'avail';

      el.innerHTML = css() +
        '<div class="h1-row"><div><div class="kicker">THE TEAM CLOCK</div><h1 class="h1">Time &amp; Cover</h1>' +
        '<p class="sub">Working hours, leave, and who holds each seat while someone is away.</p></div></div>' +
        HV.ui.tabs(tabs, active) +
        '<div id="lv-root" style="margin-top:var(--s3)"></div>';

      el.querySelectorAll('.tabs button[data-tab]').forEach(function (b) {
        b.addEventListener('click', function () { HV.go('#/leave/' + b.dataset.tab); });
      });

      var root = el.querySelector('#lv-root');
      if (active === 'avail') {
        root.innerHTML = availHtml(me);
        wireAvail(root, me);
      } else if (active === 'mine') {
        root.innerHTML = mineHtml(me);
        root.querySelector('[data-apply]').addEventListener('click', function () { applySheet(me); });
        /* the cover's own answer. Re-read the record and re-check that I am
           still the one being asked — another session may have moved it on. */
        root.querySelectorAll('[data-covyes],[data-covno]').forEach(function (b) {
          b.addEventListener('click', function () {
            var id = b.dataset.covyes || b.dataset.covno;
            var lv = (HV.store.leaves || []).find(function (l) { return l.id === id; });
            if (!lv || lv.status !== 'accept' || (lv.coverAccepts || {})[me.id] !== null) return;
            respondCover(lv, me, !!b.dataset.covyes);
          });
        });
      } else if (active === 'team') {
        root.innerHTML = teamHtml(me);
        root.querySelectorAll('[data-plan]').forEach(function (b) {
          b.addEventListener('click', function () {
            var lv = (HV.store.leaves || []).find(function (l) { return l.id === b.dataset.plan; });
            if (lv && lv.status === 'reassign') planSheet(lv, me);
          });
        });
      } else if (active === 'approve') {
        root.innerHTML = approveHtml();
        root.addEventListener('click', function (e) {
          var ok = e.target.closest('[data-ok]');
          var no = e.target.closest('[data-no]');
          var id = ok ? ok.dataset.ok : no ? no.dataset.no : null;
          if (!id) return;
          var lv = (HV.store.leaves || []).find(function (l) { return l.id === id; });
          if (!lv || lv.status !== 'pending') return;
          if (ok) approve(lv, me); else declineSheet(lv, me);
        });
      }
    },
  });
})();
