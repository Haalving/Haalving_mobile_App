/* HAALVING console board — 'approvals': the unified sign-off queue (SOP chains).
   Every movement goes through HV.approvals; this screen only asks for signatures.
   Mounted under Work Queues (#/queues/approvals) — the old standalone view and
   its role list are gone; access is the queues route (nav gate) plus the
   `approve` perm the board declares itself. */
(function () {
  'use strict';

  var TYPE_LABELS = {
    team: 'Team allocation', goalsheet: 'Goal sheet', diet: 'Diet plan',
    chart: 'Chart', level: 'Level change', calendar: 'Calendar', template: 'Template',
  };

  function typeLabel(t) { return TYPE_LABELS[t] || (t.charAt(0).toUpperCase() + t.slice(1)); }
  function roleTitle(role) { var r = HV.roleDef(role); return r ? r.title : (role || '—'); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /* a template sign-off belongs to the library, not to a client — it carries
     templateId instead of clientId, and every "who is this about" line reads
     that field first */
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

  function trail(ap) {
    return (ap.history || []).map(function (h) {
      var who = HV.staff(h.byId);
      return '<p class="audit">' + HV.esc(cap(h.act)) + ' — ' + HV.esc(who.name) +
        ' · <span class="num">' + HV.esc(HV.ago(h.minsAgo)) + '</span>' +
        (h.note ? ' · “' + HV.esc(h.note) + '”' : '') + '</p>';
    }).join('');
  }

  function duePill(ap) {
    return '<span class="pill ' + (/min/.test(ap.due) ? 'bad' : 'warn') +
      '">Due <span class="num">' + HV.esc(ap.due) + '</span></span>';
  }

  function whoLine(ap) {
    return '<div class="row" style="gap:var(--s2)"><span class="sub">' + HV.esc(apName(ap)) + '</span>' +
      (ap.templateId ? HV.ui.pill('Library template', 'neutral')
        : ap.clientId ? '' : HV.ui.pill('Prospect', 'neutral')) +
      (ap.pillar ? HV.ui.pillarChip(ap.pillar) : '') + '</div>';
  }

  function queueCard(ap) {
    var owner = HV.staff(ap.ownerId);
    return '<div class="card" style="display:flex; flex-direction:column; gap:var(--s3)">' +
      '<div class="h1-row"><b>' + HV.esc(ap.title) + '</b><span class="row" style="gap:var(--s2)">' +
        HV.ui.pill(typeLabel(ap.type), 'neutral') + duePill(ap) + '</span></div>' +
      whoLine(ap) +
      '<div class="sub">Proposed by ' + HV.esc(owner.name) + ' · ' + HV.esc(roleTitle(owner.role)) + '</div>' +
      HV.ui.stepper(ap) +
      HV.ui.aidraft('<div>' + HV.esc(ap.aiDraft) + '</div>') +
      trail(ap) +
      '<div class="row" style="gap:var(--s2)">' +
        '<button class="btn sm" data-act="approve" data-id="' + HV.esc(ap.id) + '">Approve</button>' +
        '<button class="btn sm ghost" data-act="return" data-id="' + HV.esc(ap.id) + '">Return with reason</button>' +
      '</div>' +
    '</div>';
  }

  function flightCard(ap) {
    return '<div class="card" style="display:flex; flex-direction:column; gap:var(--s3)">' +
      '<div class="h1-row"><b>' + HV.esc(ap.title) + '</b>' +
        HV.ui.pill('Waiting on ' + roleTitle(HV.approvals.stageRole(ap)), 'info') + '</div>' +
      whoLine(ap) + HV.ui.stepper(ap) + '</div>';
  }

  function returnedCard(ap, showHint) {
    return '<div class="card" style="display:flex; flex-direction:column; gap:var(--s3)">' +
      '<div class="h1-row"><b>' + HV.esc(ap.title) + '</b>' + HV.ui.pill('Returned', 'warn') + '</div>' +
      whoLine(ap) +
      '<div class="notice warn">Returned with reason: “' + HV.esc(ap.returnReason) + '”</div>' +
      (showHint ? '<p class="audit">Edit and resubmit from <a href="#/builder">Charts &amp; Plans</a>.</p>' : '') +
    '</div>';
  }

  function boardRow(ap) {
    var pill;
    if (ap.status === 'draft') pill = HV.ui.pill('Draft', 'neutral');
    else if (ap.status === 'submitted') {
      pill = HV.ui.pill('With ' + roleTitle(HV.approvals.stageRole(ap)), 'info');
    } else {
      var pc = ap.type === 'calendar' && ap.clientId ? HV.store.proposedCalendars[ap.clientId] : null;
      pill = HV.ui.pill(pc && pc.confirmed ? 'Confirmed by client' : 'Published', 'ok');
    }
    return '<div class="trow"><span class="grow"><b>' + HV.esc(ap.title) + '</b>' +
      '<small>' + HV.esc(apName(ap)) +
      (ap.templateId ? ' · library' : ap.clientId ? '' : ' · prospect') + ' · ' +
      HV.esc(typeLabel(ap.type)) + '</small></span>' + pill + '</div>';
  }

  function approveSheet(ap) {
    HV.sheet(
      '<div class="h1">Approve “' + HV.esc(ap.title) + '”</div>' +
      '<p class="sub">Your signature moves it one step down the chain; the last signature publishes to the Care Circle.</p>' +
      '<textarea class="input" id="apr-note" aria-label="Note to the requester" placeholder="Note (optional) — travels with the audit trail"></textarea>' +
      '<button class="btn block" id="apr-go">Approve</button>' +
      '<button class="btn block ghost" id="apr-cancel">Not yet</button>',
      function (sheet) {
        sheet.querySelector('#apr-cancel').addEventListener('click', HV.closeSheet);
        sheet.querySelector('#apr-go').addEventListener('click', function () {
          var note = sheet.querySelector('#apr-note').value.trim();
          HV.approvals.approve(ap, note);
          HV.closeSheet();
          if (ap.status === 'published') {
            /* a template publishes into the library, where every coach can
               assign it — the engine knows chains, this screen knows types */
            var tpl = apTemplate(ap);
            if (tpl) { tpl.status = 'published'; HV.save(); }
            HV.toast(tpl ? 'Published — the template is assignable across the roster'
              : ap.clientId ? 'Published — delivered to the Care Circle'
              : 'Published — recorded on the prospect file');
            if (ap.type === 'level') HV.celebrate('award', 'Level change published', 'The client sees the new levels now.');
          } else {
            HV.toast('Signed — moved to ' + roleTitle(HV.approvals.stageRole(ap)));
          }
          HV.refresh();
        });
      }
    );
  }

  function returnSheet(ap) {
    HV.sheet(
      '<div class="h1">Return “' + HV.esc(ap.title) + '”</div>' +
      '<p class="sub">A return never travels empty-handed — the owner sees exactly what to fix.</p>' +
      '<textarea class="input" id="ret-reason" aria-label="Reason for returning" placeholder="Reason (required)"></textarea>' +
      '<button class="btn block" id="ret-go" disabled>Return with reason</button>' +
      '<button class="btn block ghost" id="ret-cancel">Keep in the queue</button>',
      function (sheet) {
        var ta = sheet.querySelector('#ret-reason');
        var go = sheet.querySelector('#ret-go');
        ta.addEventListener('input', function () { go.disabled = !ta.value.trim(); });
        sheet.querySelector('#ret-cancel').addEventListener('click', HV.closeSheet);
        go.addEventListener('click', function () {
          var v = ta.value.trim();
          if (!v) return;
          HV.approvals.sendBack(ap, v);
          HV.closeSheet();
          HV.toast('Returned with reason — back with the owner as a draft');
          HV.refresh();
        });
      }
    );
  }

  /* body only — the host (Work Queues) draws the h1 and the tab bar, so this
     board never repeats them; every sheet/handler below re-queries inside
     `el`, so a re-mount after Approve/Return just works. */
  function drawApprovals(el, me) {
    var all = HV.store.approvals || [];
    var queue = HV.approvals.queueFor(me.id);
    /* items waiting on the viewer's own signature live in the queue above, not here */
    var inFlight = all.filter(function (a) { return a.ownerId === me.id && a.status === 'submitted' && HV.approvals.stageRole(a) !== me.role; });
    var returned = all.filter(function (a) { return a.ownerId === me.id && a.status === 'draft' && a.returnReason; });
    var nav = HV.roleMeta().nav || [];
    var showHint = nav.indexOf('builder') >= 0 || nav.indexOf('meals') >= 0;

    var html =
      '<div class="h1-row"><p class="sub" style="margin:0">Every sign-off in the SOP, one queue — the last signature publishes to the Care Circle.</p>' +
      '<span class="row" style="gap:var(--s2)">' + HV.ui.ring(queue.length ? 100 : 0, 'brand', String(queue.length), 'sm') +
      '<span class="sub">waiting on you</span></span></div>' +

      '<div class="sec-title">Waiting on your signature</div>' +
      (queue.length
        ? '<div class="list">' + queue.map(queueCard).join('') + '</div>'
        : HV.ui.empty('leaf', 'Nothing waiting on you. Charts move fast here.'));

    if (inFlight.length || returned.length) {
      html += '<div class="sec-title">Mine, in flight</div><div class="list">' +
        inFlight.map(flightCard).join('') +
        returned.map(function (a) { return returnedCard(a, showHint); }).join('') +
        '</div>';
    }

    if (HV.can('seeAllClients')) {
      html += '<div class="sec-title">All approvals</div>' +
        (all.length
          ? '<div class="list">' + all.map(boardRow).join('') + '</div>'
          : HV.ui.empty('leaf', 'No approvals anywhere — the board is clear.'));
    }

    el.innerHTML = html;

    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var ap = (HV.store.approvals || []).find(function (a) { return a.id === b.dataset.id; });
      if (!ap) return;
      if (b.dataset.act === 'approve') approveSheet(ap);
      else if (b.dataset.act === 'return') returnSheet(ap);
    });
  }

  HV.registerBoard('approvals', {
    label: 'Approvals', perm: 'approve',
    count: function () { var me = HV.me(); return me ? HV.approvals.queueFor(me.id).length : 0; },
    mount: function (el) { drawApprovals(el, HV.me()); },
  });
})();
