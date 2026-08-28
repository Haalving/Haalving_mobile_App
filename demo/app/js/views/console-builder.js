/* HAALVING console views — CC-05 'builder' (Charts, Plans & Calendar authoring rail)
   and CC-06 'review' (Level Review Pack & decision grid). Vanilla JS, no dependencies.
   Signatures happen in the Approvals view; here the owner drafts and submits.
   Packs live in store.levelPacks keyed by clientId — #/review/<clientId> opens one;
   bare #/review falls back to the first open pack (the seeded Suresh P.). */
(function () {
  'use strict';

  /* which pillar each console role owns (dietitian owns Nutrition — pillar key 'culture') */
  var ROLE_PILLAR = { fitness: 'fitness', yoga: 'yoga', mind: 'wellness', dietitian: 'culture' };
  var PILLAR_ORDER = ['fitness', 'culture', 'yoga', 'wellness'];
  var PILLAR_ICON = { fitness: 'dumbbell', culture: 'bowl', yoga: 'meditate', wellness: 'moon' };
  /* pillar key → the pod seat (staff-role key) that owns its call */
  var PILLAR_POD = { fitness: 'fitness', culture: 'dietitian', yoga: 'yoga', wellness: 'mind' };

  /* five culture upgrade gates → their instrument marks */
  var GATE_ICONS = { goals: 'target', diet: 'bowl', group: 'users', photos: 'camera', calpro: 'flag' };

  /* transient UI state (never persisted) — which AI draft is open for inline editing.
     editingCard holds the clientId whose Level Change Card is being edited, so an
     open editor on one pack never bleeds into another. */
  var editingId = null;
  var editingCard = null;

  /* ---------------- level packs, keyed by client ---------------- */

  function packs() { return HV.store.levelPacks || {}; }
  function packFor(cid) { return packs()[cid] || null; }
  function defaultPackCid() {
    var ks = Object.keys(packs());
    return ks.length ? ks[0] : null;
  }

  /* review day: a client at or past the configured review day is due a pack */
  function reviewDue(c) { return (c.day || 0) >= HV.reviewDay(); }

  function engineLine(c, sessionKey) {
    var s = (c.sessions || {})[sessionKey];
    if (!s) return 'no sessions logged';
    return (s.done || 0) + ' of ' + (s.target || 0) + ' done';
  }

  /* a fresh pack compiles from live client data — decisions start empty and the
     same four-seat + Ops-Head finalize flow runs on it as on the seeded pack */
  function startPack(c) {
    if (!c || packFor(c.id)) return;
    var deptOwner = {};
    PILLAR_ORDER.forEach(function (p) {
      deptOwner[p] = HV.staffFor(c, PILLAR_POD[p]).id;
    });
    var pack = {
      clientId: c.id, ready: true, generated: true,
      engine: {
        fitness: engineLine(c, 'fitness'),
        yoga: engineLine(c, 'yoga'),
        wellness: engineLine(c, 'mind'),
        compliance: (c.compliance != null ? c.compliance + '% cycle compliance' : 'no compliance read'),
      },
      headline: 'Pack opened on day ' + (c.day || 9) + ' of cycle ' + (c.cycle || 1) +
        ' — compiled from live session and compliance data. Each department records its own call below.',
      decisions: {},
      deptOwner: deptOwner,
      cardDraft: 'Cycle ' + (c.cycle || 1) + ' review — ' + (c.name || '').split(' ')[0] +
        ', your team sat with your whole cycle today. The call for each pillar is below; the Day-' + HV.meetingDay() + ' progress meeting walks you through every number.',
      published: false, handedOver: false,
    };
    (HV.store.levelPacks = HV.store.levelPacks || {})[c.id] = pack;
    HV.save();
  }

  /* a template sign-off belongs to the library, not to a client or a prospect —
     it carries templateId instead of clientId. Same branch as console-approvals.js;
     duplicated rather than lifted, because the approvals ENGINE stays untouched. */
  function apTemplate(ap) {
    if (!ap.templateId) return null;
    return (HV.store.templates || []).find(function (t) { return t.id === ap.templateId; }) || null;
  }

  function apName(ap) {
    var t = apTemplate(ap);
    if (t) return t.name;
    if (ap.clientId) { var c = HV.client(ap.clientId); return c ? c.name : ap.clientId; }
    return ap.prospect || '—';
  }

  /* published calendars only complete when the client confirms (PL-12) */
  function calendarConfirmed(ap) {
    if (ap.type !== 'calendar' || !ap.clientId) return false;
    var pc = HV.store.proposedCalendars[ap.clientId];
    return !!(pc && pc.confirmed);
  }

  /* one line of the audit trail, rendered flat */
  function histLine(h) {
    var by = HV.staff(h.byId);
    var act = h.act.charAt(0).toUpperCase() + h.act.slice(1);
    return HV.esc(act + ' by ' + (by ? by.name : '—') +
      (h.note ? ' — “' + h.note + '”' : '') + ' · ' + HV.ago(h.minsAgo));
  }

  /* ---------------- CC-05 builder ---------------- */

  /* status-by-exception, same pattern as the culture checklist below: a
     signed-off department stays silent, only a pending one carries a flag.
     The pending tile that belongs to the signed-in owner IS the tap target —
     no separate button underneath — so its data-* attributes must survive. */
  function goalGrid(ap, me) {
    var myPillar = ROLE_PILLAR[me.role] || null;
    var allDone = PILLAR_ORDER.every(function (d) { return ap.departments[d] === 'approved'; });
    var tiles = PILLAR_ORDER.map(function (d) {
      var p = HV.PILLARS[d];
      var icon = HV.ui.icon(PILLAR_ICON[d] || 'target');
      if (ap.departments[d] === 'approved') return HV.ui.gate(icon, p.name, 'Signed off', null);
      if (!allDone && myPillar === d) {
        return '<button class="gate miss" data-flag="Awaiting sign-off" data-act="dept-approve" data-id="' +
          HV.esc(ap.id) + '" data-dept="' + HV.esc(d) + '">' +
          '<div class="ic" aria-hidden="true">' + icon + '</div>' +
          '<div class="nm">' + HV.esc(p.name) + '</div>' +
          '<div class="mt">Tap to approve</div>' +
        '</button>';
      }
      return HV.ui.gate(icon, p.name, '9 h left · nudge at 12 h', 'Awaiting sign-off');
    }).join('');
    return '<div class="card-title" style="margin-top:var(--s4)">Department sign-off · 24 h SLA</div>' +
      '<div class="gate-grid">' + tiles + '</div>' +
      (allDone ? '<div class="notice">All four departments approved — Ops finalises, then the packet posts to the Care Circle (ON-16).</div>' : '');
  }

  function apCard(ap, me) {
    var owner = HV.staff(ap.ownerId);
    var mine = ap.ownerId === me.id;
    var tpl = apTemplate(ap);
    var typeLabel = ap.type === 'goalsheet' ? 'Goal sheet' :
      ap.type.charAt(0).toUpperCase() + ap.type.slice(1);

    var head =
      '<div class="h1-row"><b>' + HV.esc(ap.title) + '</b><span class="row" style="gap:var(--s2)">' +
        HV.ui.pill(typeLabel, 'neutral') +
        '<span class="pill ' + (/min/.test(ap.due) ? 'bad' : 'warn') + '">Due <span class="num">' + HV.esc(ap.due) + '</span></span></span></div>' +
      '<div class="sub">' + (tpl ? '' : ap.clientId ? 'Client: ' : 'Prospect: ') + HV.esc(apName(ap)) +
        ' · Owner: ' + HV.esc(owner ? owner.name : '—') + (mine ? ' (you)' : '') +
        (ap.pillar ? ' · ' : '') + '</div>' +
      (tpl ? '<div>' + HV.ui.pill('Library template', 'neutral') + '</div>' : '') +
      (ap.pillar ? '<div>' + HV.ui.pillarChip(ap.pillar) + '</div>' : '');

    var returned = (ap.status === 'draft' && ap.returnReason) ?
      '<div class="notice warn">Returned: ' + HV.esc(ap.returnReason) + '</div>' : '';

    /* AI draft body + owner actions — nothing flows onward untouched */
    var body, acts = '';
    /* edit mode is the owner's alone — stale editingId must not survive a persona switch */
    if (editingId === ap.id && mine && ap.status === 'draft') {
      body = '<textarea class="input" id="ta-' + ap.id + '" rows="4" aria-label="Edit section text">' + HV.esc(ap.aiDraft) + '</textarea>';
      acts = '<button class="btn sm" data-act="save-edit" data-id="' + ap.id + '">Save draft</button>' +
             '<button class="btn sm ghost" data-act="cancel-edit">Cancel</button>';
    } else {
      body = '<div>' + HV.esc(ap.aiDraft) + '</div>';
      if (mine && ap.status === 'draft') {
        acts = '<button class="btn sm ghost" data-act="edit" data-id="' + ap.id + '">Edit</button>';
        /* goal sheets stay blocked until all four departments sign off */
        var blocked = ap.type === 'goalsheet' && ap.departments &&
          !PILLAR_ORDER.every(function (d) { return ap.departments[d] === 'approved'; });
        if (!blocked) acts += '<button class="btn sm" data-act="submit" data-id="' + ap.id + '">Submit</button>';
      }
    }

    /* submitted items wait on the chain — signing happens only in Approvals */
    var statusLine = '';
    if (ap.status === 'submitted') {
      var role = HV.approvals.stageRole(ap);
      var last = (ap.history || [])[ap.history.length - 1];
      statusLine =
        '<div class="row" style="gap:var(--s2); flex-wrap:wrap">' +
          HV.ui.pill('Waiting on ' + (role ? (HV.roleDef(role) || {}).title : '—'), 'info') +
          (HV.approvals.canAct(ap) ? '<button class="btn sm ghost" data-act="go-approvals">Sign in Approvals</button>' : '') +
        '</div>' +
        (last ? '<p class="audit">' + histLine(last) + '</p>' : '');
    }
    if (ap.status === 'published') {
      if (ap.type === 'calendar' && ap.clientId) {
        statusLine = calendarConfirmed(ap)
          ? '<div>' + HV.ui.pill('Published · client confirmed', 'ok') + '</div>'
          : '<div>' + HV.ui.pill('Published · awaiting client confirm', 'info') + '</div>';
      } else if (tpl) {
        /* a template publishes into the library — it was never a client delivery */
        statusLine = '<div>' + HV.ui.pill('Published to the Catalog', 'ok') + '</div>';
      } else {
        statusLine = '<div>' + HV.ui.pill('Published — delivered to the Care Circle', 'ok') + '</div>';
      }
    }

    return '<div class="card" style="display:flex; flex-direction:column; gap:var(--s3)">' +
      head + HV.ui.stepper(ap) + returned + HV.ui.aidraft(body, acts) +
      (ap.type === 'goalsheet' ? goalGrid(ap, me) : '') + statusLine + '</div>';
  }

  /* the level-review shelf on the builder rail: every open pack, plus every
     client the cycle has carried to the review day without one — those get the
     Start button (R20). Row order follows the client roster. */
  function reviewShelf() {
    var rows = (HV.store.clients || []).filter(function (c) {
      return packFor(c.id) || reviewDue(c);
    }).map(function (c) {
      var lp = packFor(c.id);
      if (lp) {
        return '<div class="trow click" data-act="go-review" data-cid="' + HV.esc(c.id) + '" role="button" tabindex="0">' +
          '<span class="grow"><b>Level Review Pack — ' + HV.esc(c.name) + '</b>' +
          '<small><span class="num">Day ' + HV.esc(String(c.day || 9)) + '</span> · decision grid open · only published artifacts are client-visible</small></span>' +
          HV.ui.pill('Open', 'info') + '</div>';
      }
      return '<div class="trow"><span class="grow"><b>' + HV.esc(c.name) + '</b>' +
        '<small><span class="num">Day ' + HV.esc(String(c.day)) + '</span> of cycle <span class="num">' +
        HV.esc(String(c.cycle)) + '</span> · review due — no pack yet</small></span>' +
        '<button class="btn sm" data-act="start-pack" data-cid="' + HV.esc(c.id) + '">Start review pack</button></div>';
    }).join('');
    if (!rows) rows = '<p class="audit">No client is at day ' + HV.reviewDay() + ' yet — review packs open here on review day.</p>';
    return '<div class="card-title" style="margin-top:var(--s4)">Level reviews · packs open at day ' + HV.reviewDay() + '</div>' +
      '<div class="list">' + rows + '</div>';
  }

  HV.registerView('builder', {
    title: 'Charts, Plans & Calendar',
    render: function (el) {
      var me = HV.me();
      var myPillar = ROLE_PILLAR[me.role] || null;
      var seeAll = me.role === 'admin' || me.role === 'opshead';

      var rail = HV.store.approvals.filter(function (ap) {
        if (seeAll) return true;
        if (ap.ownerId === me.id) return true;
        if (ap.pillar && ap.pillar === myPillar) return true;
        if (ap.type === 'goalsheet' && ap.departments && myPillar && (myPillar in ap.departments)) return true;
        return false;
      });

      el.innerHTML =
        '<div class="h1-row"><div><div class="kicker">CHARTS &amp; PLANS</div><h1 class="h1">Charts, Plans &amp; Calendar</h1>' +
        '<div class="sub">First cycle: Day-2 charts · Day-4 diet · Day-5 calendar. Every level: Day-' + HV.meetingDay() + ' next-level charts and diet · Day-' + (HV.meetingDay() - 1) + ' approvals 12:00, to Ops 13:00.</div></div></div>' +
        '<div class="notice">Hard rule: <b>double-booking impossible — conflicting slots cannot save.</b> Calendars assemble 5+3+1 on alternate days against live availability.</div>' +
        reviewShelf() +
        '<div class="card-title" style="margin-top:var(--s4)">Approval rail · ' + (seeAll ? 'all departments' : 'yours &amp; your pillar') + '</div>' +
        '<div class="list">' +
          (rail.length ? rail.map(function (ap) { return apCard(ap, me); }).join('') :
            HV.ui.empty('leaf', 'Nothing waiting on you — every chart, plan and calendar is moving.')) +
        '</div>';

      el.addEventListener('click', function (e) {
        var b = e.target.closest('[data-act]');
        if (!b) return;
        var act = b.dataset.act;
        if (act === 'go-review') {
          HV.go('#/review' + (b.dataset.cid ? '/' + b.dataset.cid : ''));
          return;
        }
        if (act === 'go-approvals') { HV.go('#/approvals'); return; }
        if (act === 'start-pack') {
          var cid = b.dataset.cid;
          var c = HV.client(cid);
          if (c && !packFor(cid)) {
            startPack(c);
            HV.toast('Review pack opened for ' + c.name + ' — the decision grid is live.');
          }
          HV.go('#/review/' + cid);
          return;
        }
        var id = b.dataset.id;
        var ap = HV.store.approvals.find(function (a) { return a.id === id; });
        if (act === 'edit') { editingId = id; HV.refresh(); return; }
        if (act === 'cancel-edit') { editingId = null; HV.refresh(); return; }
        if (!ap) return;
        if (act === 'save-edit') {
          var ta = el.querySelector('#ta-' + id);
          if (ta && ta.value.trim()) ap.aiDraft = ta.value.trim();
          editingId = null;
          HV.save();
          HV.refresh();
          HV.toast('Draft saved. Still yours until you submit.');
          return;
        }
        if (act === 'submit') {
          HV.approvals.submit(ap);
          HV.refresh();
          HV.toast('Submitted. A copilot draft never reaches Ops unsigned; your name is on it.');
          return;
        }
        if (act === 'dept-approve') {
          var dept = b.dataset.dept;
          ap.departments[dept] = 'approved';
          HV.save();
          HV.refresh();
          HV.toast(HV.PILLARS[dept].name + ' sign-off recorded.');
          return;
        }
      });

      el.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var row = e.target.closest('.trow.click[data-act]');
        if (!row) return;
        e.preventDefault();
        row.click();
      });
    },
  });

  /* ---------------- CC-06 level review pack ---------------- */

  function holdSheet(cid, pillar) {
    var pm = HV.PILLARS[pillar];
    HV.sheet(
      '<div class="h1">Hold — ' + HV.esc(pm.name) + '</div>' +
      '<p class="sub">The engine reads upgrade-eligible. Disagreeing takes one line — it goes on the record, next to your name.</p>' +
      '<textarea class="input" id="hold-reason" aria-label="Reason for hold" placeholder="One-line reason (required) — e.g. compliance dipped week 2"></textarea>' +
      '<button class="btn block" id="hold-go">Record Hold</button>' +
      '<button class="btn block ghost" id="hold-cancel">Back to the grid</button>',
      function (sheet) {
        sheet.querySelector('#hold-cancel').addEventListener('click', HV.closeSheet);
        sheet.querySelector('#hold-go').addEventListener('click', function () {
          var lp = packFor(cid);
          if (!lp) { HV.closeSheet(); return; }
          var v = sheet.querySelector('#hold-reason').value.trim();
          if (!v) { HV.toast('A one-line reason is required to disagree with the engine'); return; }
          lp.decisions[pillar] = { call: 'Hold', by: HV.me().id, reason: v };
          HV.save();
          HV.closeSheet();
          HV.refresh();
          HV.toast('Hold recorded for ' + pm.name + ', with reason.');
        });
      }
    );
  }

  /* Upgrade agrees with the engine, so the note is optional — but it still
     travels with the pack into the chain, next to the recorder's name */
  function upgradeSheet(cid, pillar) {
    var pm = HV.PILLARS[pillar];
    HV.sheet(
      '<div class="h1">Upgrade — ' + HV.esc(pm.name) + '</div>' +
      '<p class="sub">The engine agrees. A short note is optional — it goes on the record with your call.</p>' +
      '<textarea class="input" id="up-note" aria-label="Optional note" placeholder="Optional one-liner — e.g. cleared every gate with two days to spare"></textarea>' +
      '<button class="btn block" id="up-go">Record Upgrade</button>' +
      '<button class="btn block ghost" id="up-cancel">Back to the grid</button>',
      function (sheet) {
        sheet.querySelector('#up-cancel').addEventListener('click', HV.closeSheet);
        sheet.querySelector('#up-go').addEventListener('click', function () {
          var lp = packFor(cid);
          if (!lp) { HV.closeSheet(); return; }
          var v = sheet.querySelector('#up-note').value.trim();
          var d = { call: 'Upgrade', by: HV.me().id };
          if (v) d.note = v;
          lp.decisions[pillar] = d;
          HV.save();
          HV.closeSheet();
          HV.refresh();
          HV.toast(pm.name + ' upgrade recorded' + (v ? ', with note.' : '.'));
        });
      }
    );
  }

  function levelApFor(cid) {
    var id = 'ap-' + cid + '-level';
    return HV.store.approvals.find(function (a) { return a.id === id; });
  }

  /* the pack goes up the SOP chain — levels move and the card posts only when
     the chain publishes (the engine's side effects, not ours) */
  function sendForApproval(cid) {
    var lp = packFor(cid);
    if (!lp) return;
    if (!PILLAR_ORDER.every(function (p) { return lp.decisions[p]; }) || !HV.can('finalizeLevel')) return;
    var client = HV.client(lp.clientId);
    var upgrades = {};
    PILLAR_ORDER.forEach(function (p) {
      var d = lp.decisions[p];
      if (d && d.call === 'Upgrade' && client) upgrades[p] = (client.levels[p] || 0) + 1;
    });
    var ap = levelApFor(cid);
    if (!ap) {
      ap = {
        id: 'ap-' + cid + '-level', type: 'level', clientId: lp.clientId, pillar: null,
        title: 'Level Change · ' + (client ? client.name : '') + ' · Cycle ' + (client ? client.cycle : ''),
        ownerId: HV.me().id, status: 'draft', stage: 0, history: [],
        aiDraft: lp.cardDraft, due: 'Day ' + HV.reviewDay(),
        payload: { upgrades: upgrades, message: lp.cardDraft },
      };
      HV.store.approvals.push(ap);
    } else {
      /* resubmit after a return — carry the current card and calls */
      ap.aiDraft = lp.cardDraft;
      ap.payload = { upgrades: upgrades, message: lp.cardDraft };
    }
    HV.approvals.submit(ap);
    /* the seeded Suresh worklist item closes with his pack — other packs
       have no seeded w-item to close */
    if (cid === 'c-sureshp') {
      var w5 = HV.store.worklist.find(function (x) { return x.id === 'w5'; });
      if (w5) w5.status = 'done';
    }
    HV.save();
    HV.refresh();
    HV.toast('Sent up the chain — Ops Manager signs next.');
  }

  /* Nutrition — Level Upgrade Checklist evidence card (pack.culture × cultureCriteria).
     Status-by-exception gates: a met gate is silent, only a miss carries a flag. */
  function cultureChecklistCard(lp) {
    var cu = lp.culture;
    var crit = HV.store.cultureCriteria;
    if (!cu || !crit) return '';

    var trackDef = crit.tracks[cu.track] || { label: cu.track, levels: {} };
    var lvlDef = trackDef.levels[cu.level] || {};
    var metCount = cu.gates.filter(function (g) { return g.met; }).length;
    var title = 'Nutrition — Level Upgrade Checklist · ' + trackDef.label + ' L' + cu.level +
      (lvlDef.name ? ' · ' + lvlDef.name : '');

    var gateTiles = cu.gates.map(function (g) {
      var def = null;
      for (var i = 0; i < crit.gates.length; i++) {
        if (crit.gates[i].key === g.key) { def = crit.gates[i]; break; }
      }
      var meta = g.value + (def && def.target ? ' · target ' + def.target : '');
      return HV.ui.gate(HV.ui.icon(GATE_ICONS[g.key] || 'target'),
        def ? def.label : g.key, meta, g.met ? null : 'Not met');
    }).join('');

    var goals = (lvlDef.goals || []);
    var goalsSec = goals.length
      ? '<details><summary class="sub" style="cursor:pointer">This level’s goals (<span class="num">' + goals.length + '</span>) — expand</summary>' +
        '<div style="margin-top:var(--s2)">' +
          goals.map(function (g) { return '<span class="chip">' + HV.esc(g) + '</span>'; }).join('') +
        '</div></details>'
      : '';

    return '<div class="card p-culture" style="display:flex; flex-direction:column; gap:var(--s3)">' +
      '<div class="h1-row"><span class="row" style="gap:var(--s2)"><span class="pdot"></span><b>' + HV.esc(title) + '</b></span>' +
        '<span class="pill ' + (metCount === cu.gates.length ? 'ok' : 'warn') + '"><span class="num">' + metCount + ' of ' + cu.gates.length + '</span> gates met</span></div>' +
      '<div class="gate-grid">' + gateTiles + '</div>' +
      goalsSec +
      (cu.note ? '<p class="audit">' + HV.esc(cu.note) + '</p>' : '') +
      '<div class="sub">Checklist per the HAALVING Culture SOP — all five gates must hold for the Nutrition upgrade.</div>' +
      '</div>';
  }

  /* one review-day questionnaire answer, in whatever shape the engine filed it —
     {k, ks, labels, band} today; strings or arrays degrade gracefully */
  function fmtAns(a) {
    if (a == null) return '—';
    if (typeof a === 'string') return HV.esc(a);
    if (Array.isArray(a)) return HV.esc(a.join(', '));
    if (a.labels && a.labels.length) {
      return HV.esc(a.labels.join(', ')) +
        (a.band ? ' · <span class="num">' + HV.esc(String(a.band)) + '/5</span>' : '');
    }
    return HV.esc(String(a.label || a.k || '—'));
  }

  /* the R15 console surface: the client's own review-day words, next to the grid.
     Question labels come from the reviewFlow catalogue; answers from
     c.reviewAns[c.cycle], filed by the circle's questionnaire run. */
  function checkinCard(client) {
    var flow = (HV.store.reviewFlow || []).filter(function (s) { return s.save; });
    var ra = client && client.reviewAns ? client.reviewAns[client.cycle] : null;
    var head = '<div class="h1-row"><span class="card-title">Client check-in · Day-' + HV.reviewDay() + ' questionnaire</span>' +
      (ra ? HV.ui.pill('Submitted', 'ok') : HV.ui.pill('Not submitted yet', 'neutral')) + '</div>';
    var body;
    if (!ra) {
      body = '<div class="sub">Not submitted yet — the check-in reaches ' +
        HV.esc(client ? (client.name || '').split(' ')[0] : 'the client') +
        ' in the Care Circle at day ' + HV.reviewDay() + '; the answers land here the moment they finish.</div>';
    } else {
      var covered = {};
      var rows = flow.map(function (item) {
        covered[item.save] = true;
        return '<div class="rvp-qa"><small>' + HV.esc(item.text) + '</small><b>' +
          fmtAns(ra.ans ? ra.ans[item.save] : null) + '</b></div>';
      });
      /* an answer whose question left the catalogue still shows, under its key */
      Object.keys(ra.ans || {}).forEach(function (k) {
        if (!covered[k]) rows.push('<div class="rvp-qa"><small>' + HV.esc(k) + '</small><b>' + fmtAns(ra.ans[k]) + '</b></div>');
      });
      body = rows.join('') +
        '<p class="audit">Submitted by the client · ' + HV.esc(HV.ago(Math.max(0, HV.minsSince(ra.ts)))) + '</p>';
    }
    return '<div class="card" style="display:flex; flex-direction:column; gap:var(--s3)">' + head + body + '</div>';
  }

  /* no pack for this route yet — review day onward gets the Start door, earlier days an
     explanation, an unknown id the eligible list */
  function renderNoPack(el, cid) {
    var client = cid ? HV.client(cid) : null;
    var inner;
    if (client && reviewDue(client)) {
      inner = '<div class="card" style="display:flex; flex-direction:column; gap:var(--s3)">' +
        '<b>' + HV.esc(client.name) + ' — <span class="num">Day ' + HV.esc(String(client.day)) + '</span> of cycle <span class="num">' + HV.esc(String(client.cycle)) + '</span></b>' +
        '<div class="sub">Review day reached and no pack is open. Starting one compiles the engine reads from live session and compliance data and opens the four-department decision grid.</div>' +
        '<div><button class="btn" data-act="start-pack" data-cid="' + HV.esc(client.id) + '">Start review pack</button></div>' +
        '</div>';
    } else if (client) {
      inner = '<div class="notice">' + HV.esc(client.name) + ' is on <span class="num">day ' + HV.esc(String(client.day)) + '</span> of cycle <span class="num">' + HV.esc(String(client.cycle)) + '</span> — the Level Review Pack opens at <span class="num">day ' + HV.reviewDay() + '</span>.</div>';
    } else {
      var due = (HV.store.clients || []).filter(reviewDue);
      inner = due.length
        ? '<div class="list">' + due.map(function (c) {
            var lp = packFor(c.id);
            return '<div class="trow"><span class="grow"><b>' + HV.esc(c.name) + '</b>' +
              '<small><span class="num">Day ' + HV.esc(String(c.day)) + '</span> of cycle <span class="num">' + HV.esc(String(c.cycle)) + '</span></small></span>' +
              (lp ? '<button class="btn sm" data-act="open" data-cid="' + HV.esc(c.id) + '">Open pack</button>'
                  : '<button class="btn sm" data-act="start-pack" data-cid="' + HV.esc(c.id) + '">Start review pack</button>') +
              '</div>';
          }).join('') + '</div>'
        : HV.ui.empty('leaf', 'No client is at day ' + HV.reviewDay() + ' yet — review packs open here on review day.');
    }
    el.innerHTML =
      '<div class="h1-row"><div><div class="kicker">LEVEL REVIEW</div><h1 class="h1">Level Review Pack</h1>' +
      '<div class="sub">Packs open at <span class="num">day ' + HV.reviewDay() + '</span> · one call per department · the Ops Head sends the card up the chain</div></div></div>' +
      inner;
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var id = b.dataset.cid;
      if (b.dataset.act === 'open') { HV.go('#/review/' + id); return; }
      if (b.dataset.act === 'start-pack') {
        var c = HV.client(id);
        if (c && !packFor(id)) {
          startPack(c);
          HV.toast('Review pack opened for ' + c.name + ' — the decision grid is live.');
        }
        HV.go('#/review/' + id);
      }
    });
  }

  HV.registerView('review', {
    title: 'Level Review Pack',
    roles: ['admin', 'opshead', 'hod', 'doctor', 'dietitian', 'fitness', 'yoga', 'mind'],
    render: function (el, params) {
      var me = HV.me();
      var cid = (params && params[0]) || defaultPackCid();
      var lp = cid ? packFor(cid) : null;
      if (!lp) { renderNoPack(el, cid); return; }
      var client = HV.client(lp.clientId);
      var canFinalise = HV.can('finalizeLevel');
      var allRecorded = PILLAR_ORDER.every(function (p) { return lp.decisions[p]; });

      /* the pack's state comes from its approval; lp.published only covers saved stores */
      var ap = levelApFor(cid);
      var published = ap ? ap.status === 'published' : !!lp.published;
      var inApproval = !!ap && ap.status === 'submitted';

      /* engine reads with pillar dots */
      var engineBits = ['fitness', 'yoga', 'wellness'].map(function (k) {
        var p = HV.PILLARS[k];
        return '<span class="row ' + p.cls + '" style="display:inline-flex; gap:var(--s1)">' +
          '<span class="pdot"></span>' + p.name + ' <span class="num">' + HV.esc(lp.engine[k]) + '</span></span>';
      }).join('<span class="sub"> · </span>') +
      '<span class="sub"> · </span><span>Compliance <span class="num">' + HV.esc(lp.engine.compliance) + '</span></span>';

      var evidence = ['session telemetry', 'rating histogram', 'InBody deltas', 'deviations'].map(function (n) {
        return '<button class="btn sm quiet" data-act="evi">' + HV.esc(n) + '</button>';
      }).join('');

      /* decision grid — one call per department */
      var hasDisabled = false;
      var rows = PILLAR_ORDER.map(function (p) {
        var pm = HV.PILLARS[p];
        var ownerU = HV.staff(lp.deptOwner[p]);
        var d = lp.decisions[p];
        var right;
        if (d) {
          var by = HV.staff(d.by);
          right = d.call === 'Upgrade'
            ? HV.ui.pill('Upgrade' + (d.note ? ' · “' + HV.esc(d.note) + '”' : '') + ' · ' + (by ? by.name : ''), 'ok')
            : HV.ui.pill('Hold · “' + HV.esc(d.reason || '') + '” · ' + (by ? by.name : ''), 'warn');
        } else {
          var mayAct = me.id === lp.deptOwner[p] || canFinalise;
          if (!mayAct) hasDisabled = true;
          var dis = mayAct ? '' : ' disabled';
          right = '<button class="btn sm" data-act="decide" data-pillar="' + p + '" data-call="Upgrade"' + dis + '>Upgrade</button>' +
                  '<button class="btn sm ghost" data-act="decide" data-pillar="' + p + '" data-call="Hold"' + dis + '>Hold</button>';
        }
        return '<div class="trow ' + pm.cls + '"><span class="pdot"></span><span class="grow">' +
          pm.name + ' — ' + HV.esc(ownerU ? ownerU.name : '—') + '</span>' +
          '<span class="row" style="gap:var(--s2)">' + right + '</span></div>';
      }).join('');

      /* publish block — driven by the approval's place in the chain */
      var publishSec = '';
      if (published) {
        publishSec =
          '<div class="card" style="display:flex; flex-direction:column; gap:var(--s3)">' +
            '<div class="row">' + HV.ui.pill('Published — client-visible in the Care Circle', 'ok') + '</div>' +
            '<div class="sub">“' + HV.esc(lp.cardDraft) + '”</div>' +
            (lp.handedOver
              ? '<div>' + HV.ui.pill('Handed over — Day-10 calendar prep unblocked', 'ok') + '</div>'
              : '<div><button class="btn sm" data-act="handover"' + (canFinalise ? '' : ' disabled') + '>Mark handed over</button>' +
                (canFinalise ? '' : ' <span class="audit">Handover is recorded by the Ops Head.</span>') + '</div>') +
          '</div>';
      } else if (inApproval) {
        var role = HV.approvals.stageRole(ap);
        publishSec =
          '<div class="card" style="display:flex; flex-direction:column; gap:var(--s3)">' +
            '<div class="row">' + HV.ui.pill('In approval — waiting on ' + (role ? (HV.roleDef(role) || {}).title : '—'), 'info') + '</div>' +
            HV.ui.aidraft('<div>' + HV.esc(lp.cardDraft) + '</div>',
              '<button class="btn sm ghost" disabled>Edit</button>') +
            '<p class="audit">The card locks while the chain signs — signatures happen in Approvals.</p>' +
          '</div>';
      } else if (allRecorded && canFinalise) {
        var returned = (ap && ap.status === 'draft' && ap.returnReason)
          ? '<div class="notice warn">Returned: ' + HV.esc(ap.returnReason) + '</div>' : '';
        publishSec = returned + (editingCard === cid
          ? HV.ui.aidraft(
              '<textarea class="input" id="ta-card" rows="4" aria-label="New card text">' + HV.esc(lp.cardDraft) + '</textarea>',
              '<button class="btn sm" data-act="save-card">Save</button>' +
              '<button class="btn sm ghost" data-act="cancel-card">Cancel</button>')
          : HV.ui.aidraft(
              '<div>' + HV.esc(lp.cardDraft) + '</div>',
              '<button class="btn sm ghost" data-act="edit-card">Edit</button>' +
              '<button class="btn sm" data-act="send-approval">Send for approval</button>'));
      } else if (allRecorded) {
        publishSec = '<div class="notice">All four departments recorded — the Ops Head sends the Level Change Card up the approval chain.</div>';
      } else {
        publishSec = '<p class="audit">The pack cannot go up the chain until every department records — Ops may override with reason.</p>';
      }

      el.innerHTML =
        '<style>' +
          '.rvp-qa{display:flex; flex-direction:column; gap:var(--s1)}' +
          '.rvp-qa small{color:var(--ink-3)}' +
        '</style>' +
        '<div class="h1-row"><div><h1 class="h1">Level Review Pack — ' + HV.esc(client ? client.name : '') +
          ', Cycle <span class="num">' + (client ? client.cycle : '') + '</span></h1>' +
        '<div class="sub"><span class="num">Day ' + (client ? client.day : 9) + '</span> · auto-compiled · zero manual assembly</div></div></div>' +
        '<div class="trow" style="flex-wrap:wrap">' +
          '<span class="grow" style="display:flex; flex-wrap:wrap; gap:var(--s1) var(--s2); align-items:center">' + engineBits + '</span>' +
          (lp.generated ? HV.ui.pill('Engine: compiled from cycle data', 'info') : HV.ui.pill('Engine: upgrade eligible', 'ok')) + '</div>' +
        '<div class="notice">' + HV.esc(lp.headline) + '</div>' +
        '<div class="card"><div class="card-title">Evidence · every number links to source</div>' +
          '<div class="row" style="flex-wrap:wrap; gap:var(--s2); margin-top:var(--s2)">' + evidence + '</div></div>' +
        cultureChecklistCard(lp) +
        checkinCard(client) +
        '<div class="card-title" style="margin-top:var(--s4)">Decision grid · one call per department</div>' +
        '<div class="list">' + rows + '</div>' +
        (hasDisabled ? '<p class="audit">Buttons stay disabled unless the call is yours to make — decisions are recorded by the department owner or the Ops Head, and every action is audited.</p>' : '') +
        publishSec +
        '<div class="trow"><span class="grow"><b><span class="num">Day-' + HV.meetingDay() + '</span> · Client progress meeting (video)</b>' +
          '<small>Team presents progress, new goal, next-level charts, diet plan &amp; calendar — same agenda as the calendar meeting.</small></span>' +
          HV.ui.pill('Scheduled', 'ok') + '</div>';

      el.addEventListener('click', function (e) {
        var b = e.target.closest('[data-act]');
        if (!b || b.disabled) return;
        var act = b.dataset.act;
        var pack = packFor(cid);
        if (!pack) return;
        if (act === 'evi') { HV.toast('Evidence opened (linked to source data)'); return; }
        if (act === 'decide') {
          var p = b.dataset.pillar;
          if (b.dataset.call === 'Upgrade') upgradeSheet(cid, p);
          else holdSheet(cid, p);
          return;
        }
        if (act === 'edit-card') { editingCard = cid; HV.refresh(); return; }
        if (act === 'cancel-card') { editingCard = null; HV.refresh(); return; }
        if (act === 'save-card') {
          var ta = el.querySelector('#ta-card');
          if (ta && ta.value.trim()) pack.cardDraft = ta.value.trim();
          editingCard = null;
          HV.save();
          HV.refresh();
          HV.toast('Card updated. Send when ready.');
          return;
        }
        if (act === 'send-approval') { sendForApproval(cid); return; }
        if (act === 'handover') {
          pack.handedOver = true;
          HV.save();
          HV.refresh();
          HV.toast('Day-10 calendar prep unblocked');
          return;
        }
      });
    },
  });
})();
