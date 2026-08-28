/* HAALVING console view — CC-01 Home.
   v185 (TJ, 16 Aug): the single scrolling canvas became a TAB BAR. Home was one
   long column that mixed six unrelated jobs — read the numbers, work the queue,
   answer the rooms, approve the drafts, clear the notices, run your day — and
   the only way to know whether any of them had changed was to scroll past it.

   Now each job is a tab, the first is a DASHBOARD of interactive instruments,
   and every other tab carries a count of the items that arrived since you last
   opened it. That count is the point: it behaves like a notification, so an
   untouched tab tells you there is something new inside without being read.

   The freshness model, deliberately simple: per user, per tab, we remember the
   set of item ids that were on screen the last time the tab was opened
   (HV.store.homeSeen[userId][tabKey]). The badge is the number of current ids
   NOT in that set. Opening a tab re-stamps the set, so the badge drains — the
   same "viewing IS the acknowledgement" contract the work board and the team
   feed already use. Ids that vanish are forgotten, which keeps the bag bounded
   and means a genuinely new arrival of the same id badges again. */
(function () {
  'use strict';

  /* which draft is currently being edited inline (persists across re-renders) */
  let editingId = null;

  /* the general search, the console's front desk. Module-level so a keystroke
     can swap the body without HV.refresh(), which would rebuild the input and
     take the caret with it — the same rule the client rail follows. */
  let searchQ = '';

  /* set of client ids the signed-in staff member may see (RBAC scoping) */
  function scopedIds() {
    const ids = {};
    HV.myClients().forEach(function (c) { ids[c.id] = true; });
    return ids;
  }

  /* mark a draft sent + push its text into that client's Care Circle from me */
  function sendDraft(d) {
    const me = HV.me();
    d.status = 'sent';
    d.sentById = me.id;
    HV.pushMsg(d.clientId, { fromId: me.id, kind: 'text', text: d.text });
  }

  /* one-line preview of the latest client-visible message in a room */
  function replyRow(c) {
    /* a broadcast is not a reply and nobody is waiting on it — letting it win
       the preview would make every room in this queue say the same sentence
       at the same moment, the instant one announcement goes out */
    const msgs = (HV.store.circles[c.id] || []).filter(function (m) {
      return m.kind !== 'teamonly' && m.kind !== 'promo';
    });
    const last = msgs[msgs.length - 1];
    let preview = '';
    if (last) {
      let who = 'Team';
      if (last.fromId === 'client') who = c.name.split(' ')[0];
      else if (last.fromId === 'ai') who = 'Copilot';
      else who = HV.staff(last.fromId).name;
      preview = who + ': ' + last.text;
      if (preview.length > 60) preview = preview.slice(0, 60) + '…';
    }
    return '<div class="trow click" data-goto="#/clients/' + HV.esc(c.id) + '/circle" role="button" tabindex="0">' +
      HV.ui.avatar(c.name) +
      '<span class="grow"><b>' + HV.esc(c.name) + '</b><small>' + HV.esc(preview) + '</small></span>' +
      '<span class="pill info"><span class="num">' + HV.unread(c.id) + '</span> unread</span>' +
    '</div>';
  }

  function signRow(ap) {
    const who = ap.clientId ? HV.client(ap.clientId).name : (ap.prospect || '');
    return '<div class="trow click" data-goto="#/queues/approvals" role="button" tabindex="0">' +
      HV.ui.iconTile('shield') +
      '<span class="grow"><b>' + HV.esc(ap.title) + '</b><small>' + HV.esc(who) + ' · due ' + HV.esc(ap.due) + '</small></span>' +
      HV.ui.pill('Sign', 'info') +
    '</div>';
  }

  function flagPill(flag) {
    if (flag === 'high') return HV.ui.pill('High', 'bad');
    if (flag === 'med') return HV.ui.pill('Watch', 'warn');
    return '';
  }

  /* one vital-stat tile — the same k/v shape as the Live board's instruments
     (console-ops.js renderLiveTab), so Home and the ops boards read as one
     family of numbers. v goes through HV.esc + .num (serif-for-data law). */
  function statTile(k, v, cls) {
    return '<div class="stat"><div class="k">' + k + '</div>' +
      '<div class="v num' + (cls ? ' ' + cls : '') + '">' + HV.esc(v) + '</div></div>';
  }

  /* a stat tile that is a door: same instrument, plus a hit target and a hint
     of where it leads. Everything on the dashboard that HAS a drill-down uses
     this, so "looks interactive" and "is interactive" never come apart. */
  function goTile(k, v, sub, route, cls) {
    return '<button class="stat dg-go" data-goto="' + HV.esc(route) + '">' +
      '<div class="k">' + k + '</div>' +
      '<div class="v num' + (cls ? ' ' + cls : '') + '">' + HV.esc(v) + '</div>' +
      '<div class="sub">' + sub + '</div>' +
    '</button>';
  }

  /* ── styles ────────────────────────────────────────────────────────────
     One token-only block, .dg- prefixed. */
  var DG_STYLE =
    '<style>' +
    '.dg-banner{display:flex;align-items:center;gap:var(--s3)}' +
    '.dg-banner .grow{display:flex;flex-direction:column;gap:var(--s1);min-width:0}' +
    '.dg-dim{color:var(--ink-3)}' +
    '.dg-nt-head{display:flex;align-items:center;gap:var(--s2)}' +
    '.dg-nt-head .btn{margin-left:auto}' +
    '.dg-nt-seen{opacity:.65}' +
    '.dg-celebs{display:flex;gap:var(--s3);overflow-x:auto;padding-bottom:var(--s2);scroll-snap-type:x proximity}' +
    '.dg-celeb{flex:0 0 auto;min-width:min(70vw,15rem);scroll-snap-align:start;display:flex;flex-direction:column;gap:var(--s3)}' +
    '.dg-celeb .grow{display:flex;flex-direction:column;min-width:0}' +
    '.dg-celeb-act{display:flex;justify-content:flex-end}' +
    '.dg-sess{display:flex;flex-direction:column;gap:var(--s2)}' +
    '.dg-brief{display:flex;flex-direction:column;gap:var(--s2);padding:var(--s3);border-radius:var(--r-md);background:var(--surface-2);font-size:var(--t-sm)}' +
    /* author display:flex would beat the UA's [hidden]{display:none} — restate it */
    '.dg-brief[hidden]{display:none}' +
    /* a row that arrived since this tab was last opened */
    '.dg-fresh{box-shadow:inset 2px 0 0 var(--brand)}' +
    /* --- dashboard --- */
    '.dg-go{display:flex;flex-direction:column;gap:2px;text-align:left;border:0;font:inherit;cursor:pointer;width:100%}' +
    '.dg-go:hover{background:var(--brand-wash)}' +
    '.dg-go:focus-visible{outline:2px solid var(--brand-2);outline-offset:2px}' +
    '.dg-dialrow{display:flex;flex-wrap:wrap;gap:var(--s5);align-items:center;justify-content:center;padding:var(--s2) 0}' +
    '.dg-dialcell{display:flex;flex-direction:column;align-items:center;gap:var(--s2)}' +
    /* the pillar-level chart: one row per pillar, the bar in that pillar's own
       colour (the colour law's "its own series" clause) */
    '.dg-lvl{display:flex;flex-direction:column;gap:var(--s2);margin-top:var(--s3)}' +
    '.dg-lvlrow{display:grid;grid-template-columns:8.5em 1fr auto;align-items:center;gap:var(--s3)}' +
    '.dg-lvlname{font-size:var(--t-sm);font-weight:600;display:flex;align-items:center;gap:var(--s2);min-width:0}' +
    '.dg-track{display:flex;gap:3px}' +
    '.dg-seg{flex:1;height:10px;border-radius:2px;background:var(--line)}' +
    '.dg-seg.on{background:var(--pcd,var(--brand))}' +
    '.dg-split{display:flex;height:12px;border-radius:var(--r-full);overflow:hidden;background:var(--line);margin-top:var(--s2)}' +
    '.dg-split i{display:block;height:100%}' +
    '.dg-legend{display:flex;flex-wrap:wrap;gap:var(--s3);margin-top:var(--s2);font-size:var(--t-micro);color:var(--ink-2)}' +
    '.dg-legend span{display:inline-flex;align-items:center;gap:var(--s1)}' +
    '.dg-key{width:9px;height:9px;border-radius:2px;flex:none}' +
    /* --- the general search --- */
    '.dg-search{margin:var(--s3) 0 var(--s2)}' +
    '.dg-search .input{width:100%}' +
    /* .grow is scoped to .row in app.css — a .trow needs its own rule, which
       is why .strow, .pslot and .bcrow each carry one. Without it the id and
       the status pill sat mid-row instead of at the trailing edge. */
    '.dg-sres .grow{flex:1;min-width:0}' +
    '.dg-resid{font-size:var(--t-micro);color:var(--ink-3);flex:none}' +
    '</style>';

  /* relative-time voice for banner + notices; numerals carry .num */
  function agoFmt(ts) {
    var m = HV.minsSince(ts);
    if (m < 1) return 'just now';
    if (m < 60) return '<span class="num">' + m + '</span> min ago';
    var h = Math.floor(m / 60);
    if (h < 24) return '<span class="num">' + h + '</span> h ago';
    return '<span class="num">' + Math.floor(h / 24) + '</span> d ago';
  }

  /* ── the freshness bag ─────────────────────────────────────────────────
     One store key, one shape: homeSeen[userId][tabKey] = [ids seen]. */
  function seenBag(me) {
    var s = HV.store;
    s.homeSeen = s.homeSeen || {};
    s.homeSeen[me.id] = s.homeSeen[me.id] || {};
    return s.homeSeen[me.id];
  }
  function freshIds(me, tabKey, ids) {
    var seen = seenBag(me)[tabKey] || [];
    return ids.filter(function (id) { return seen.indexOf(id) === -1; });
  }
  function isFresh(me, tabKey, id) {
    return (seenBag(me)[tabKey] || []).indexOf(id) === -1;
  }
  /* re-stamp the tab with exactly what is on screen now. Called AFTER the
     markup is built, so this render still shows its New marks and the next
     one does not. */
  function stampSeen(me, tabKey, ids) {
    var bag = seenBag(me);
    var before = bag[tabKey] || [];
    var same = before.length === ids.length &&
      ids.every(function (id) { return before.indexOf(id) !== -1; });
    if (same) return;
    bag[tabKey] = ids.slice();
    HV.save();
  }
  function freshPill(me, tabKey, id) {
    return isFresh(me, tabKey, id) ? HV.ui.pill('New', 'info') : '';
  }

  /* the latest team announcement as a slim banner — every console role sees
     it; roles holding the People nav can click through to the full feed */
  function bannerHtml(me) {
    var feed = (HV.store.teamFeed || []).slice().sort(function (a, b) { return b.ts - a.ts; });
    var latest = feed[0];
    if (!latest) return '';
    var isNew = latest.ts > ((HV.store.teamFeedReads || {})[me.id] || 0);
    var by = HV.staff(latest.byId);
    var txt = latest.text.length > 120 ? latest.text.slice(0, 120) + '…' : latest.text;
    var canGo = ((HV.roleDef(me.role) || {}).nav || []).indexOf('people') !== -1;
    return '<div class="card dg-banner' + (canGo ? ' click' : '') + '"' +
      (canGo ? ' data-goto="#/people/feed" role="button" tabindex="0" aria-label="Open announcements"' : '') + '>' +
      HV.ui.iconTile('bell') +
      '<span class="grow">' +
        '<span class="row" style="gap:var(--s2);align-items:center"><b>Announcement</b>' +
          HV.ui.pill(latest.tag, 'info') + (isNew ? HV.ui.pill('New', 'warn') : '') + '</span>' +
        '<small>' + HV.esc(txt) + '</small>' +
        '<small class="dg-dim">' + HV.esc(by.name) + ' · ' + agoFmt(latest.ts) + '</small>' +
      '</span>' +
    '</div>';
  }

  /* ══════════════════════ TAB 1 · Dashboard ══════════════════════
     The numbers as instruments, every one of them a door. Nothing here is
     invented: each reading is computed from the same store the drill-down
     screen reads, so a tile and the page behind it can never disagree. */

  /* average level per pillar across the roster, drawn as a 7-segment track in
     that pillar's own colour. This chart exists BECAUSE the headline level was
     retired (TJ, 16 Aug) — four independent climbs need four independent
     readings, and an average of the four would smuggle the old rule back in. */
  function pillarLevelsHtml(clients) {
    var scored = clients.filter(function (c) { return c.levels && !c.observation; });
    if (!scored.length) return '';
    var rows = Object.keys(HV.PILLARS).map(function (k) {
      var p = HV.PILLARS[k];
      var vals = scored.map(function (c) { return Number(c.levels[k]) || 1; });
      var avg = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
      var whole = Math.round(avg * 10) / 10;
      var segs = '';
      for (var i = 1; i <= HV.levels(); i++) {
        segs += '<span class="dg-seg' + (i <= Math.round(avg) ? ' on' : '') + '"></span>';
      }
      return '<div class="dg-lvlrow ' + p.cls + '" title="' + HV.esc(p.name) +
          ' — mean level ' + whole + ' of ' + HV.levels() + ' across ' + scored.length + ' clients">' +
        '<span class="dg-lvlname"><span class="pdot"></span>' + HV.esc(p.name) + '</span>' +
        '<span class="dg-track" role="img" aria-label="' + HV.esc(p.name) +
          ' mean level ' + whole + ' of ' + HV.levels() + '">' + segs + '</span>' +
        '<span class="num" style="font-size:var(--t-sm)">L' + whole + '</span>' +
      '</div>';
    }).join('');
    return '<div class="card"><span class="k">Levels across the roster</span>' +
      '<p class="sub" style="margin:var(--s1) 0 0">Mean level per pillar over <span class="num">' +
        scored.length + '</span> scored ' + (scored.length === 1 ? 'client' : 'clients') +
        '. Each pillar climbs on its own — there is no combined level.</p>' +
      '<div class="dg-lvl">' + rows + '</div>' +
    '</div>';
  }

  /* the roster split by plan — a single stacked bar, because there are two
     plans and a pie of two slices is a worse bar */
  function planSplitHtml(clients) {
    if (!clients.length) return '';
    var keys = Object.keys(HV.PLANS);
    var counts = keys.map(function (k) {
      return { k: k, n: clients.filter(function (c) { return c.plan === k; }).length };
    }).filter(function (x) { return x.n; });
    if (!counts.length) return '';
    var TONE = { poorna: 'var(--brand)', svayam: 'var(--brand-2)' };
    var bars = counts.map(function (x) {
      return '<i style="width:' + (x.n / clients.length * 100) + '%;background:' +
        (TONE[x.k] || 'var(--ink-3)') + '"></i>';
    }).join('');
    var legend = counts.map(function (x) {
      return '<span><span class="dg-key" style="background:' + (TONE[x.k] || 'var(--ink-3)') + '"></span>' +
        HV.esc(HV.PLANS[x.k].name.replace(/^HAALVING /, '')) +
        ' <span class="num">' + x.n + '</span></span>';
    }).join('');
    return '<div class="card"><span class="k">Roster by plan</span>' +
      '<div class="dg-split" role="img" aria-label="' + HV.esc(counts.map(function (x) {
        return HV.PLANS[x.k].name + ': ' + x.n;
      }).join(', ')) + '">' + bars + '</div>' +
      '<div class="dg-legend">' + legend + '</div>' +
      (HV.plansOnSale().length < Object.keys(HV.PLANS).length
        ? '<p class="audit" style="margin:var(--s2) 0 0">Only ' +
          HV.esc(HV.plansOnSale().map(function (k) { return HV.PLANS[k].name; }).join(' and ')) +
          ' is on sale this launch — Svayam opens once the coach conversations have trained it.</p>'
        : '') +
    '</div>';
  }

  function dashHtml(me, counts) {
    var clients = HV.myClients();
    var highRisk = clients.filter(function (c) { return c.risk === 'high'; }).length;
    var watch = clients.filter(function (c) { return c.risk === 'medium'; }).length;
    var seeAll = HV.can('seeAllClients');
    var s = HV.store;

    /* ── your people, by status ─────────────────────────────────────────
       HV.myClients() is already role-scoped (core.js): Ops and Admin get
       everyone through seeAllClients, a HoD their department, a coach their
       own pod. So every role sees a true count of THEIR people with no new
       permission and no new access logic.

       Paused counts separately from Inactive on purpose (TJ, 17 Aug): a
       paused client is coming back and an inactive one is not, and rolling
       them together hides the only number a win-back call acts on. */
    var byStatus = function (s) {
      return clients.filter(function (c) { return c.status === s; }).length;
    };
    var roster = '<div class="card" data-roster style="margin-bottom:var(--s4)">' +
      '<span class="k">YOUR PEOPLE</span>' +
      '<div class="grid3" style="margin-top:var(--s3)">' +
        goTile('Total', clients.length, 'on your roster', '#/clients') +
        goTile('Active', byStatus('active'), 'living the programme', '#/clients?status=active', 'ok') +
        goTile('Paused', byStatus('paused'), 'coming back', '#/clients?status=paused', 'warn') +
        goTile('Inactive', byStatus('inactive'), 'not coming back unaided', '#/clients?status=inactive', 'bad') +
      '</div></div>';

    /* the headline row — roster, attention, signature */
    var head = '<div class="grid3">' +
      /* This tile used to headline the roster COUNT — which the Your People
         card above now states, so the same number appeared twice in different
         words. Its risk breakdown was the part not shown anywhere else, so
         that is what it leads with now. */
      goTile('Needs extra care', highRisk,
        '<span class="num">' + watch + '</span> more on a gentle watch',
        '#/clients?status=risk', highRisk ? 'bad' : '') +
      goTile('Needs a reply', clients.filter(function (c) { return HV.unread(c.id) > 0; }).length,
        'rooms with the call light on', '#/home/replies') +
      goTile('Waiting on your signature', HV.approvals.queueFor(me.id).length,
        'in the approvals chain', '#/queues/approvals',
        HV.approvals.queueFor(me.id).length ? 'warn' : '') +
    '</div>';

    /* the shop-floor row, ops only — the same numbers the Live board watches,
       so Home is the glance and Live is the drill-down */
    var ops = '';
    if (seeAll) {
      var unrated = s.meals.filter(function (m) { return !m.final; }).length;
      var breached = s.meals.filter(function (m) {
        var l = HV.slaLeft(m);
        return l != null && l < 0;
      }).length;
      var docsPending = s.documents.filter(function (d) { return d.summary === 'pending'; }).length;
      var onPct = parseInt(String(s.opsStats.onTime), 10);
      var dials = '<div class="card"><span class="k">Service right now</span>' +
        '<div class="dg-dialrow">' +
          (isNaN(onPct) ? '' :
            '<span class="dg-dialcell">' + HV.ui.dial(onPct, 'On-time delivery') + '</span>') +
          '<span class="dg-dialcell">' +
            HV.ui.ring(unrated ? Math.min(100, unrated / Math.max(1, s.meals.length) * 100) : 0,
              breached ? 'danger' : 'brand', String(unrated), 'lg') +
            '<span class="sub">meals awaiting a rating</span>' +
          '</span>' +
        '</div>' +
      '</div>';
      ops = dials + '<div class="grid3">' +
        goTile('Past reply target', breached, breached ? 'escalations sent' : 'none right now',
          '#/queues/meals', breached ? 'bad' : 'ok') +
        goTile('Docs pending a summary', docsPending, 'waiting on the Doctor',
          '#/queues/medical', docsPending ? 'warn' : '') +
        goTile('Open tasks', counts.tasks, 'across the team', '#/home/tasks') +
      '</div>';
    }

    return roster + head + ops + planSplitHtml(clients) + pillarLevelsHtml(clients) + celebsHtml(scopedIds());
  }

  /* ══════════════════════ celebrations (dashboard) ══════════════════════ */
  var WK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function celebsHtml(ids) {
    var cels = HV.upcomingCelebrations(7).filter(function (x) { return ids[x.clientId]; });
    if (!cels.length) return '';
    return '<div class="sec-title">Celebrations this week</div>' +
      '<div class="dg-celebs">' + cels.map(function (cel) {
        var c = HV.client(cel.clientId);
        var sent = !!(HV.store.wishes || {})[cel.clientId + '-' + String(cel.dateISO).slice(0, 4)];
        var p = String(cel.dateISO).split('-');
        var when = cel.inDays === 0 ? 'Today'
          : cel.inDays === 1 ? 'Tomorrow'
          : WK[new Date(+p[0], +p[1] - 1, +p[2]).getDay()] + ' · in <span class="num">' + cel.inDays + '</span> d';
        var kind = cel.kind === 'birthday' ? 'Birthday' : 'Anniversary';
        return '<div class="card dg-celeb">' +
          '<div class="row" style="gap:var(--s2);align-items:center">' + HV.ui.avatar(c.name, 'sm') +
            '<span class="grow"><b>' + HV.esc(c.name) + '</b><small class="dg-dim">' + kind + ' · ' + when + '</small></span>' +
          '</div>' +
          '<div class="dg-celeb-act">' + (sent
            ? HV.ui.pill('Wishes sent', 'ok')
            : '<button class="btn sm" data-act="wish" data-cel="' + HV.esc(cel.clientId + '|' + cel.kind + '|' + cel.dateISO) + '">Send wishes</button>') +
          '</div>' +
        '</div>';
      }).join('') + '</div>';
  }

  /* congrats message into the client's Care Circle, from me, once a year */
  function openWish(cel) {
    var me = HV.me();
    var c = HV.client(cel.clientId);
    if (!c) return;
    var key = cel.clientId + '-' + String(cel.dateISO).slice(0, 4);
    var first = c.name.split(' ')[0];
    var msg = cel.kind === 'birthday'
      ? 'Happy birthday, ' + first + '! The whole team is cheering for you today — wishing you a gentle, joyful year ahead.'
      : 'Happy anniversary, ' + first + '! Warm wishes on the day from your whole care team.';
    HV.sheet(
      '<div class="h1">Send wishes</div>' +
      '<p class="sub">Lands in ' + HV.esc(c.name) + '’s Care Circle under your name.</p>' +
      '<textarea class="input" id="dg-wish-text" aria-label="Wishes message">' + HV.esc(msg) + '</textarea>' +
      '<div class="row" style="justify-content:flex-end">' +
        '<button class="btn sm ghost" id="dg-wish-keep">Not now</button>' +
        '<button class="btn sm" id="dg-wish-send">Send wishes</button>' +
      '</div>',
      function (sheet) {
        sheet.querySelector('#dg-wish-keep').addEventListener('click', HV.closeSheet);
        sheet.querySelector('#dg-wish-send').addEventListener('click', function () {
          var v = sheet.querySelector('#dg-wish-text').value.trim();
          if (!v) return;
          HV.pushMsg(cel.clientId, { fromId: me.id, kind: 'text', text: v });
          (HV.store.wishes = HV.store.wishes || {})[key] = HV.now();
          HV.save();
          HV.closeSheet();
          HV.refresh();
          HV.toast('Wishes sent to ' + first + '.');
        });
      }
    );
  }

  /* ══════════════════════ TAB · Notices ══════════════════════ */
  var NOTICE_ICON = { sla: 'warn', reminder: 'clock', celebration: 'sparkle', leave: 'cal', task: 'check' };
  function noticesHtml(me) {
    var all = HV.noticesFor(me.id);
    if (!all.length) return HV.ui.empty('bell', 'No notices for you.', 'Escalations, reminders and leave decisions land here.');
    var unseen = all.filter(function (n) { return !n.seen; }).length;
    return '<div class="sec-title dg-nt-head">Notices' +
        (unseen ? ' <span class="pill warn"><span class="num">' + unseen + '</span> new</span>' : '') +
        (unseen ? '<button class="btn sm ghost" data-act="seen">Mark all seen</button>' : '') +
      '</div>' +
      '<div class="list">' + all.map(function (n) {
        var c = n.clientId ? HV.client(n.clientId) : null;
        return '<div class="trow' + (n.seen ? ' dg-nt-seen' : '') + '">' +
          HV.ui.iconTile(NOTICE_ICON[n.kind] || 'bell') +
          '<span class="grow"><b>' + HV.esc(n.text) + '</b>' +
            '<small>' + (c ? HV.esc(c.name) + ' · ' : '') + agoFmt(n.ts) + '</small></span>' +
          (n.seen ? '' : HV.ui.pill('New', 'info')) +
        '</div>';
      }).join('') + '</div>';
  }

  /* ══════════════════════ TAB · Sessions (coach roles) ══════════════════
     Session bookings ship in the seed now, so a coach no longer has to open
     the Schedule page for them to exist. Occurrence arithmetic comes from
     HV.occursOn — it used to be a private copy here that mirrored the one in
     console-schedule.js and the reminder sweep in core.js, and that copy
     silently IGNORED per-day exceptions, so a cancelled session still showed
     up as due today. */
  var PILLAR_SEAT = { culture: 'dietitian', fitness: 'fitness', yoga: 'yoga', wellness: 'mind' };
  var TASK_ICON = { fitness: 'dumbbell', yoga: 'meditate', culture: 'cutlery', wellness: 'moon' };
  var KIND_ICON = { meeting: 'users', review: 'flag' };
  var COACH_ROLES = ['dietitian', 'fitness', 'yoga', 'mind', 'hod'];

  /* day 0 is today; HV.occursOn honours cancellations and moved times */
  function occursToday(t) { return !!HV.occursOn(t, 0); }

  /* my tasks still to come today — cover-aware: while I cover a colleague's
     seat (HV.coverActive), their sessions with that client surface here too */
  function myTasksToday(me, nowMin) {
    return (HV.store.tasks || []).map(function (t) {
      if (!occursToday(t)) return null;
      if ((t.start || 0) + (t.dur || 0) <= nowMin) return null;
      if ((t.assignees || []).indexOf(me.id) !== -1) return { t: t, cover: false };
      if (t.clientId) {
        var c = HV.client(t.clientId);
        var seat = PILLAR_SEAT[t.pillar];
        var cov = c && seat && HV.coverActive(c, seat);
        if (cov && cov.coverId === me.id && (t.assignees || []).indexOf((c.pod || {})[seat]) !== -1)
          return { t: t, cover: true };
      }
      return null;
    }).filter(Boolean).sort(function (a, b) { return (a.t.start || 0) - (b.t.start || 0); });
  }

  /* the R23 surface: HV.brief composed live at render, disclosed on tap */
  function briefBox(t) {
    var b = HV.brief(t.clientId);
    return '<div class="dg-brief" data-briefbox="' + HV.esc(t.id) + '" hidden>' +
      (b.lines.length
        ? b.lines.map(function (l) { return '<div>' + HV.esc(l) + '</div>'; }).join('')
        : '<div>Nothing notable on file — a clean slate today.</div>') +
      '<div class="audit">Prep brief · AI-drafted from live client data</div>' +
    '</div>';
  }

  function sessionsHtml(me) {
    var d = new Date();
    var rows = myTasksToday(me, d.getHours() * 60 + d.getMinutes());
    if (!rows.length) {
      return HV.ui.empty('cal', 'Nothing left on your grid today.',
        (HV.store.tasks || []).length ? '' : 'The Schedule page builds the week when it first opens.');
    }
    return rows.map(function (r) {
      var t = r.t;
      var c = t.clientId ? HV.client(t.clientId) : null;
      return '<div class="card dg-sess">' +
        '<div class="trow">' +
          HV.ui.iconTile(TASK_ICON[t.pillar] || KIND_ICON[t.kind] || 'clock') +
          '<span class="grow"><b>' + HV.esc(t.title || 'Session') + '</b>' +
            '<small><span class="num">' + HV.fmtTime(t.start || 0) + '</span>' +
            (t.dur ? ' · <span class="num">' + t.dur + '</span> min' : '') +
            (c ? ' · ' + HV.esc(c.name) : '') + '</small></span>' +
          (r.cover ? HV.ui.pill('Covering', 'warn') : '') +
          (c ? '<button class="btn sm ghost" data-act="brief" data-tid="' + HV.esc(t.id) + '" aria-expanded="false">Prep brief</button>' : '') +
        '</div>' +
        (c ? briefBox(t) : '') +
      '</div>';
    }).join('');
  }

  /* ══════════════════════ TAB · Tasks ══════════════════════ */
  var LEDGER_LABEL = {
    exports: ' report types ready to export',
    incentives: " staff on this cycle's payout",
  };
  var LEDGER_ICON = { exports: 'doc', incentives: 'award' };

  function ledgerRow(b) {
    return '<div class="trow click" data-goto="#/reports/' + HV.esc(b.key) + '" role="button" tabindex="0">' +
      HV.ui.iconTile(LEDGER_ICON[b.key] || 'doc') +
      '<span class="grow"><b>' + HV.esc(b.label) + '</b>' +
        '<small><span class="num">' + b.count() + '</span>' + HV.esc(LEDGER_LABEL[b.key] || '') + '</small></span>' +
    '</div>';
  }

  function tasksHtml(me) {
    var next = HV.worklist.next();
    var rest = HV.worklist.mine().filter(function (t) { return !next || t.id !== next.id; });
    var signQueue = HV.approvals.queueFor(me.id);
    var ledgerBoards = (HV.can('seeAllClients') && (me.role === 'admin' || me.role === 'opshead'))
      ? HV.boardsFor(['exports', 'incentives'])
      : [];

    if (!next && !rest.length && !signQueue.length) {
      return HV.ui.empty('leaf', 'No tasks for you right now — the rules are quiet.') +
        (ledgerBoards.length
          ? '<div class="sec-title">The ledger</div><div class="list">' + ledgerBoards.map(ledgerRow).join('') + '</div>'
          : '');
    }

    return (next
      ? '<div class="card"><div class="kicker">NEXT</div>' +
        '<div class="row" style="justify-content:space-between;align-items:flex-start;gap:var(--s3)">' +
          '<b class="grow">' + HV.esc(next.text) + '</b>' +
          '<span class="pill ' + HV.esc(next.pill) + '"><span class="num">' + HV.esc(next.due) + '</span></span>' +
        '</div></div>'
      : '') +
      (rest.length
        ? '<div class="sec-title">Your open tasks</div>' +
          '<div class="list">' + rest.map(function (t) {
            return '<div class="trow' + (isFresh(me, 'tasks', t.id) ? ' dg-fresh' : '') + '">' +
              '<span class="grow">' + HV.esc(t.text) + '</span>' +
              freshPill(me, 'tasks', t.id) +
              '<span class="pill ' + HV.esc(t.pill) + '"><span class="num">' + HV.esc(t.due) + '</span></span></div>';
          }).join('') + '</div>'
        : '') +
      (signQueue.length
        ? '<div class="sec-title">Waiting on your signature</div>' +
          '<div class="list">' + signQueue.map(signRow).join('') + '</div>'
        : '') +
      (ledgerBoards.length
        ? '<div class="sec-title">The ledger</div>' +
          '<div class="list">' + ledgerBoards.map(ledgerRow).join('') + '</div>'
        : '');
  }

  /* ══════════════════════ TAB · Attention ══════════════════════ */
  function attentionHtml(me, ids) {
    var rows = HV.store.digest.filter(function (d) { return ids[d.clientId]; });
    if (!rows.length) return HV.ui.empty('leaf', 'No clients allocated to you yet.');
    return '<p class="sub">Attention-ordered — the loudest thing about each client, with the evidence behind it.</p>' +
      '<div class="list">' + rows.map(function (d) {
        var c = HV.client(d.clientId);
        var hasLevels = c && c.levels && c.sessions;
        return '<div class="trow click' + (isFresh(me, 'attention', d.clientId) ? ' dg-fresh' : '') +
          '" data-cid="' + HV.esc(d.clientId) + '" role="button" tabindex="0">' +
          HV.ui.avatar(c.name) +
          '<span class="grow">' +
            '<span class="row" style="gap:var(--s2)"><b>' + HV.esc(c.name) + '</b>' + flagPill(d.flag) +
              freshPill(me, 'attention', d.clientId) + '</span>' +
            '<small>' + HV.esc(d.text) + '</small>' +
            '<button class="sub" data-ev="' + HV.esc(d.evidence) + '" style="color:var(--brand);font-weight:600">Evidence: ' + HV.esc(d.evidence) + '</button>' +
            (hasLevels ? '<span class="row" style="gap:var(--s2); margin-top:var(--s1)">' + HV.consoleui.levelBadges(c) + '</span>' : '') +
          '</span>' +
          (hasLevels ? '<span class="row" style="gap:var(--s2)">' + HV.consoleui.sessionRings(c, 'sm') + '</span>' : '') +
        '</div>';
      }).join('') + '</div>';
  }

  /* ══════════════════════ TAB · Replies ══════════════════════ */
  function repliesHtml() {
    var rooms = HV.myClients().filter(function (c) { return HV.unread(c.id) > 0; });
    if (!rooms.length) return HV.ui.empty('chat', 'Every room is answered.', 'Nothing is waiting on a reply from you.');
    return '<p class="sub">Rooms with your call light on.</p>' +
      '<div class="list">' + rooms.map(replyRow).join('') + '</div>';
  }

  /* ══════════════════════ TAB · Follow-ups ══════════════════════ */
  function draftHtml(me, d) {
    const c = HV.client(d.clientId);

    if (d.status === 'sent') {
      const by = HV.staff(d.sentById) || HV.me();
      return '<div class="trow" style="opacity:.8">' +
        HV.ui.pill('Sent by ' + by.name, 'ok') +
        '<span class="grow"><small><b>' + HV.esc(c.name) + '</b> · ' + HV.esc(d.text) + '</small></span>' +
      '</div>';
    }

    let body, acts;
    if (editingId === d.id) {
      body =
        '<div class="sub" style="margin-bottom:var(--s2)">To <b>' + HV.esc(c.name) + '</b> — edit, then save:</div>' +
        '<textarea class="input" id="fu-edit-' + HV.esc(d.id) + '" aria-label="Edit draft message">' + HV.esc(d.text) + '</textarea>';
      acts =
        '<button class="btn sm" data-act="save" data-id="' + HV.esc(d.id) + '">Save</button>' +
        '<button class="btn sm ghost" data-act="canceledit" data-id="' + HV.esc(d.id) + '">Cancel</button>';
    } else {
      body =
        '<div class="row" style="align-items:flex-start">' + HV.ui.avatar(c.name, 'sm') +
          '<span class="grow"><b>' + HV.esc(c.name) + '</b>' + freshPill(me, 'followups', d.id) +
          '<br>' + HV.esc(d.text) + '</span>' +
        '</div>';
      acts =
        '<button class="btn sm ghost" data-act="edit" data-id="' + HV.esc(d.id) + '">Edit</button>' +
        '<button class="btn sm" data-act="send" data-id="' + HV.esc(d.id) + '">Approve &amp; send</button>' +
        '<button class="btn sm quiet" data-act="dismiss" data-id="' + HV.esc(d.id) + '">Dismiss…</button>';
    }
    return HV.ui.aidraft(body, acts);
  }

  function followupsHtml(me, ids) {
    var drafts = HV.store.followupDrafts.filter(function (d) { return ids[d.clientId]; });
    var pending = drafts.filter(function (d) { return d.status === 'draft'; });
    if (!drafts.length) return HV.ui.empty('leaf', 'No follow-ups drafted for your clients today.');
    return '<div class="h1-row"><p class="sub" style="margin:0">The copilot drafts; a named human sends. Every message lands in that client’s Care Circle under your name.</p>' +
      (HV.can('sendDigest') && pending.length
        ? '<button class="btn" data-act="sendall">Review &amp; send all (<span class="num">' + pending.length + '</span>)</button>'
        : '') +
      '</div>' +
      '<div class="list">' + drafts.map(function (d) { return draftHtml(me, d); }).join('') + '</div>';
  }

  function openDismiss(id) {
    const REASONS = ['Already handled in person', 'Client reached out first', 'Not the right moment', 'Tone needs rework', 'Duplicate nudge'];
    HV.sheet(
      '<div class="h1">Dismiss this draft?</div>' +
      '<p class="sub">Choose a reason — every dismissal is logged so the copilot learns. Nothing goes to the client.</p>' +
      '<div>' + REASONS.map(function (r) {
        return '<button class="chip" data-r="' + HV.esc(r) + '">' + HV.esc(r) + '</button>';
      }).join('') + '</div>' +
      '<div class="row" style="justify-content:flex-end">' +
        '<button class="btn sm ghost" id="dis-keep">Keep draft</button>' +
        '<button class="btn sm" id="dis-ok" disabled>Dismiss &amp; log</button>' +
      '</div>',
      function (sheet) {
        let chosen = null;
        sheet.querySelectorAll('.chip').forEach(function (ch) {
          ch.addEventListener('click', function () {
            sheet.querySelectorAll('.chip').forEach(function (x) { x.classList.remove('sel'); });
            ch.classList.add('sel');
            chosen = ch.dataset.r;
            sheet.querySelector('#dis-ok').disabled = false;
          });
        });
        sheet.querySelector('#dis-keep').addEventListener('click', HV.closeSheet);
        sheet.querySelector('#dis-ok').addEventListener('click', function () {
          if (!chosen) return;
          /* the sheet promises "every dismissal is logged" — keep that true */
          const d = HV.store.followupDrafts.find(function (x) { return x.id === id; });
          (HV.store.dismissLog = HV.store.dismissLog || []).push({
            id: id, clientId: d ? d.clientId : null, reason: chosen, by: HV.me().id,
          });
          HV.store.followupDrafts = HV.store.followupDrafts.filter(function (x) { return x.id !== id; });
          HV.save();
          HV.closeSheet();
          HV.refresh();
          HV.toast('Dismissed · reason logged');
        });
      }
    );
  }

  /* the bulk path earns its label: every message is shown in full and any
     can be held back before it reaches a client — the same promise as the
     per-draft Approve & send, kept at batch size. */
  function openSendAll() {
    const scope = scopedIds();
    const pending = HV.store.followupDrafts.filter(function (x) { return x.status === 'draft' && scope[x.clientId]; });
    if (!pending.length) return;
    HV.sheet(
      '<div class="h1">Review before sending</div>' +
      '<p class="sub">Each message goes to that client’s Care Circle under your name. Untick any you want to hold back as drafts.</p>' +
      '<div class="list">' + pending.map(function (d) {
        const c = HV.client(d.clientId);
        return '<label class="trow" style="align-items:flex-start; cursor:pointer">' +
          '<input type="checkbox" checked data-send="' + HV.esc(d.id) + '">' +
          '<span class="grow"><b>' + HV.esc(c.name) + '</b><small>' + HV.esc(d.text) + '</small></span>' +
        '</label>';
      }).join('') + '</div>' +
      '<div class="row" style="justify-content:flex-end">' +
        '<button class="btn sm ghost" id="sa-keep">Keep as drafts</button>' +
        '<button class="btn sm" id="sa-send">Send <span class="num">' + pending.length + '</span> reviewed</button>' +
      '</div>',
      function (sheet) {
        const send = sheet.querySelector('#sa-send');
        const recount = function () {
          const n = sheet.querySelectorAll('[data-send]:checked').length;
          send.disabled = !n;
          send.innerHTML = 'Send <span class="num">' + n + '</span> reviewed';
        };
        sheet.querySelectorAll('[data-send]').forEach(function (cb) { cb.addEventListener('change', recount); });
        sheet.querySelector('#sa-keep').addEventListener('click', HV.closeSheet);
        send.addEventListener('click', function () {
          const picked = {};
          sheet.querySelectorAll('[data-send]:checked').forEach(function (cb) { picked[cb.dataset.send] = true; });
          const chosen = HV.store.followupDrafts.filter(function (x) { return picked[x.id]; });
          chosen.forEach(sendDraft);
          HV.save();
          HV.closeSheet();
          HV.refresh();
          HV.toast(chosen.length + ' follow-up' + (chosen.length === 1 ? '' : 's') + ' sent after your review.');
        });
      }
    );
  }

  /* ══════════════════════ the general search ══════════════════════
     One field, two registers: the people you look after and the people you
     work with.

     Clients come from HV.myClients(), which core already scopes by role, so
     this introduces no new access — a coach searching finds their own pod and
     nobody else's. The team half is open to every console role, because a
     staff directory is not a secret and coaches already read each other's
     names in the pod, the schedule and the cover board. What a row OPENS is
     gated: HV.peopleui.open hands the full record to People-nav roles and a
     colleague card to everyone else, and it decides that for itself so this
     view never has to know the rule. */
  function searchHtml(raw) {
    const s = raw.trim().toLowerCase();
    const hit = (name, id) =>
      String(name).toLowerCase().indexOf(s) !== -1 || String(id).toLowerCase().indexOf(s) !== -1;

    const clients = HV.myClients().filter(c => hit(c.name, c.id));
    const team = HV.store.users.filter(u => u.role !== 'client' && hit(u.name, u.id));

    if (!clients.length && !team.length) {
      return HV.ui.empty('search', 'Nothing matches “' + HV.esc(raw.trim()) + '”.',
        'Search by name, or by an id like c-rajesh or u-vikram.');
    }

    const clientRow = function (c) {
      const plan = HV.PLANS[c.plan];
      const bits = [];
      if (plan) bits.push(HV.esc(plan.name));
      if (c.observation) bits.push('observation period');
      else if (c.cycle) bits.push('Cycle <span class="num">' + c.cycle + '</span>');
      const st = c.status === 'active' ? '' :
        '<span class="pill ' + (c.status === 'paused' ? 'warn' : 'neutral') + '">' +
        HV.esc(c.status.charAt(0).toUpperCase() + c.status.slice(1)) + '</span>';
      return '<div class="trow dg-sres" role="button" tabindex="0" data-cid="' + HV.esc(c.id) + '">' +
        HV.ui.avatar(c.name, 'sm') +
        '<span class="grow"><b>' + HV.esc(c.name) + '</b><small>' + bits.join(' · ') + '</small></span>' +
        '<span class="dg-resid">' + HV.esc(c.id) + '</span>' + st + '</div>';
    };

    const teamRow = function (u) {
      const role = HV.roleDef(u.role);
      const tags = (HV.peopleui && HV.peopleui.tagsOf) ? HV.peopleui.tagsOf(u) : [];
      const flag = tags.indexOf('On leave') !== -1 ? '<span class="pill warn">On leave</span>'
        : u.inactive ? '<span class="pill neutral">Inactive</span>' : '';
      return '<div class="trow dg-sres" role="button" tabindex="0" data-uid="' + HV.esc(u.id) + '">' +
        HV.ui.avatar(u.name, 'sm') +
        '<span class="grow"><b>' + HV.esc(u.name) + '</b><small>' +
        HV.esc(role ? role.title : '—') +
        (u.dept ? ' · ' + HV.esc(HV.DEPTS[u.dept] || u.dept) : '') + '</small></span>' +
        '<span class="dg-resid">' + HV.esc(u.id) + '</span>' + flag + '</div>';
    };

    const section = (label, rows) =>
      '<div class="sec-title">' + label + ' <span class="num">' + rows.length + '</span></div>' +
      '<div class="list">' + rows.join('') + '</div>';

    return (clients.length ? section('Clients', clients.map(clientRow)) : '') +
      (team.length ? section('Team', team.map(teamRow)) : '');
  }

  /* ══════════════════════ the tab model ══════════════════════
     Each tab declares the ids it holds, so the badge, the New marks and the
     seen-stamp all read one list and can never disagree. `dash` declares no
     ids on purpose: a summary is never "unread". */
  function tabModel(me, ids) {
    var list = [
      { key: 'dash', label: 'Dashboard', ids: null },
      { key: 'attention', label: 'Attention',
        ids: HV.store.digest.filter(function (d) { return ids[d.clientId]; })
          .map(function (d) { return d.clientId; }) },
      { key: 'replies', label: 'Replies',
        ids: HV.myClients().filter(function (c) { return HV.unread(c.id) > 0; })
          .map(function (c) { return c.id; }) },
      { key: 'followups', label: 'Follow-ups',
        ids: HV.store.followupDrafts.filter(function (d) {
          return ids[d.clientId] && d.status === 'draft';
        }).map(function (d) { return d.id; }) },
      { key: 'tasks', label: 'Tasks',
        ids: HV.worklist.mine().map(function (t) { return t.id; }) },
      { key: 'notices', label: 'Notices',
        ids: HV.noticesFor(me.id).map(function (n) { return n.id; }) },
    ];
    if (COACH_ROLES.indexOf(me.role) !== -1) {
      var d = new Date();
      list.splice(1, 0, { key: 'sessions', label: 'Today’s sessions',
        ids: myTasksToday(me, d.getHours() * 60 + d.getMinutes())
          .map(function (r) { return r.t.id; }) });
    }
    return list;
  }

  HV.registerView('home', {
    title: 'Home',
    /* no roles list: console access = 'home' nav membership (HV.allowedView),
       so the HoD role — and any runtime-created role that ticks the Home nav
       box in People & Access — reaches its own front door. Client-shell roles
       stay blocked by the shell check inside that gate. */

    render(el, params) {
      const me = HV.me();
      const ids = scopedIds();
      const tabs = tabModel(me, ids);
      const active = tabs.some(function (t) { return t.key === params[0]; }) ? params[0] : 'dash';

      /* badges are computed BEFORE the active tab is stamped, so opening a tab
         still shows this render's New marks and drains on the next one */
      const counts = {};
      tabs.forEach(function (t) {
        counts[t.key] = t.ids ? freshIds(me, t.key, t.ids).length : 0;
      });
      counts.tasks = HV.worklist.mine().length;   /* the dashboard tile wants the total, not the fresh count */

      /* drop stale editing state if that draft was sent or removed */
      const pendingIds = HV.store.followupDrafts
        .filter(function (d) { return d.status === 'draft'; }).map(function (d) { return d.id; });
      if (editingId && pendingIds.indexOf(editingId) === -1) editingId = null;

      let body;
      if (active === 'dash') body = dashHtml(me, counts);
      else if (active === 'attention') body = attentionHtml(me, ids);
      else if (active === 'replies') body = repliesHtml();
      else if (active === 'followups') body = followupsHtml(me, ids);
      else if (active === 'tasks') body = tasksHtml(me);
      else if (active === 'notices') body = noticesHtml(me);
      else body = sessionsHtml(me);

      const tabItems = tabs.map(function (t) {
        const n = t.ids ? freshIds(me, t.key, t.ids).length : 0;
        return { key: t.key, label: t.label, count: n };
      });

      const searching = searchQ.trim();

      el.innerHTML =
        DG_STYLE +
        '<div class="h1-row">' +
          '<div><div class="kicker">TODAY</div><h1 class="h1">Home</h1>' +
          '<div class="sub">Digest generated <span class="num">08:00</span> in <span class="num">24</span> s · a count on a tab means something new arrived in it</div></div>' +
        '</div>' +
        '<div class="dg-search"><input class="input" id="dg-q" type="search"' +
          ' placeholder="Search clients and team by name or id"' +
          ' aria-label="Search clients and team by name or id" autocomplete="off"' +
          ' value="' + HV.esc(searchQ) + '"></div>' +
        bannerHtml(me) +
        HV.ui.tabs(tabItems, active) +
        '<div id="dg-body" style="margin-top:var(--s3)">' +
          (searching ? searchHtml(searchQ) : body) + '</div>';

      /* viewing IS the acknowledgement — stamp after the markup is built.
         NOT while a search is showing: the tab's items were never on screen,
         and stamping them would drain a badge nobody has read. */
      const at = tabs.find(function (t) { return t.key === active; });
      if (!searching && at && at.ids) stampSeen(me, active, at.ids);

      /* swap only the body, so the caret survives between two keystrokes */
      const qEl = el.querySelector('#dg-q');
      if (qEl) qEl.addEventListener('input', function () {
        searchQ = qEl.value;
        const box = el.querySelector('#dg-body');
        if (box) box.innerHTML = searchQ.trim() ? searchHtml(searchQ) : body;
      });

      el.querySelectorAll('.tabs button[data-tab]').forEach(function (b) {
        b.addEventListener('click', function () {
          /* picking a tab is the way out of a search — otherwise the tab you
             chose would render behind results you had stopped looking at */
          searchQ = '';
          HV.go('#/home/' + b.dataset.tab);
        });
      });

      /* one delegated click handler for the whole view */
      el.addEventListener('click', function (e) {
        const ev = e.target.closest('[data-ev]');
        if (ev) { HV.toast('Evidence opened: ' + ev.dataset.ev); return; }

        const go = e.target.closest('[data-goto]');
        if (go) {
          /* '#/clients?status=paused' is not a route — the clients route is
             #/clients/:cid/:tab and would read 'status' as a client id. The
             suffix is stripped here and handed to the rail as a filter. */
          var dest = go.dataset.goto, q = dest.indexOf('?status=');
          if (q !== -1) {
            if (HV.consoleui && HV.consoleui.setFilter) HV.consoleui.setFilter(dest.slice(q + 8));
            dest = dest.slice(0, q);
          }
          HV.go(dest);
          return;
        }

        const act = e.target.closest('[data-act]');
        if (act) {
          if (act.dataset.act === 'wish') {
            const p = (act.dataset.cel || '').split('|');
            openWish({ clientId: p[0], kind: p[1], dateISO: p[2] });
            return;
          }
          if (act.dataset.act === 'seen') {
            HV.seenNotices(me.id);
            HV.refresh();
            HV.toast('Notices marked seen.');
            return;
          }
          if (act.dataset.act === 'brief') {
            const box = el.querySelector('[data-briefbox="' + act.dataset.tid + '"]');
            if (box) {
              const opening = box.hasAttribute('hidden');
              if (opening) box.removeAttribute('hidden'); else box.setAttribute('hidden', '');
              act.setAttribute('aria-expanded', opening ? 'true' : 'false');
              act.textContent = opening ? 'Hide brief' : 'Prep brief';
            }
            return;
          }
          if (act.dataset.act === 'sendall') { openSendAll(); return; }

          const id = act.dataset.id;
          const draft = HV.store.followupDrafts.find(function (x) { return x.id === id; });
          if (act.dataset.act === 'edit') {
            editingId = id;
            HV.refresh();
          } else if (act.dataset.act === 'canceledit') {
            editingId = null;
            HV.refresh();
          } else if (act.dataset.act === 'save') {
            const ta = el.querySelector('#fu-edit-' + id);
            const v = ta ? ta.value.trim() : '';
            if (v) draft.text = v;
            editingId = null;
            HV.save();
            HV.refresh();
            HV.toast('Draft updated. Your edit is part of the record.');
          } else if (act.dataset.act === 'send') {
            sendDraft(draft);
            HV.save();
            HV.refresh();
            HV.toast(HV.client(draft.clientId).name + ': follow-up sent, recorded as your edit.');
          } else if (act.dataset.act === 'dismiss') {
            openDismiss(id);
          }
          return;
        }

        /* a team row from the search. HV.peopleui.open decides how much of the
           record this role may see — the full one, or a colleague card. */
        const who = e.target.closest('[data-uid]');
        if (who) {
          if (HV.peopleui) HV.peopleui.open(who.dataset.uid);
          return;
        }

        const row = e.target.closest('[data-cid]');
        if (row) HV.go('#/clients/' + row.dataset.cid);
      });

      /* rows are divs with role=button, so the keyboard needs a twin of the
         delegated click */
      el.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const row = e.target.closest('.trow[role="button"], .card[role="button"]');
        if (row) { e.preventDefault(); row.click(); }
      });
    },
  });
})();
