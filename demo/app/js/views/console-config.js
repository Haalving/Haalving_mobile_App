/* HAALVING console view: Configuration — program shape, service levels,
   plans, approval chains, notification rules. All five tabs read reference/
   user-state the rest of the console already runs on: HV.store.programShape
   (user state — edits stick), HV.store.slaConfig + HV.store.leaveConfig (the
   service-level ladder and leave sign-off), HV.PLANS (module global, ships
   with the product), HV.store.chains (per-type signature sequences — now
   editable) and HV.store.notifRules. Edits are gated on HV.can('manageConfig')
   — Super Admin and Operations Head; Super User reaches this page via nav
   membership and sees it read-only, same shape as People & Access. */
(function () {
  'use strict';

  const CONFIG_TABS = [
    { key: 'program',       label: 'Program' },
    { key: 'service',       label: 'Service' },
    { key: 'plans',         label: 'Plans' },
    { key: 'chains',        label: 'Chains' },
    { key: 'notifications', label: 'Notifications' },
    { key: 'automations',   label: 'Automations' },
    { key: 'catalog',       label: 'Catalog' },
  ];

  const AUDIT_LINE = 'Changes apply from each client’s next cycle — a mid-cycle change never retro-fails anyone.';
  const GATE_TOAST = 'Super Admin or Operations Head only. This attempt was logged.';

  /* one inline style block, .cfg- prefixed, tokens only */
  const STYLE =
    '<style>' +
    '.cfg-chains .chip button{margin-left:var(--s2); padding:0; background:none; border:0; cursor:pointer; color:var(--ink-3); display:inline-flex; align-items:center}' +
    '.cfg-chains .chip button:hover{color:var(--brand)}' +
    '.cfg-chains .chip button[data-ch-rm]:hover{color:var(--danger)}' +
    '.cfg-chains .chip button svg{width:13px; height:13px}' +
    '.cfg-addrow{margin-top:var(--s2)}' +
    '.cfg-addrow .input{max-width:16em; padding:var(--s1) var(--s2)}' +
    '.cfg-num{max-width:6.5em; text-align:right; padding:var(--s1) var(--s2)}' +
    '.cfg-del{padding:0; background:none; border:0; cursor:pointer; color:var(--ink-3); display:inline-flex; align-items:center}' +
    '.cfg-del:hover{color:var(--danger)}' +
    '.cfg-del svg{width:14px; height:14px; stroke:currentColor; fill:none; stroke-width:1.6; stroke-linecap:round; stroke-linejoin:round}' +
    '.cfg-nradd{display:flex; gap:var(--s2); flex-wrap:wrap; align-items:center; margin-top:var(--s3)}' +
    '.cfg-nradd .input{padding:var(--s2) var(--s3)}' +
    /* a template's steps, revealed under its row */
    '.cfg-steps{margin:0; padding-left:var(--s5); display:flex; flex-direction:column; gap:var(--s1)}' +
    '.cfg-steps li{color:var(--ink-2)}' +
    '</style>';

  /* ---- role dropdown helpers: keys from the store RBAC matrix (People &
     Access edits it), titles via HV.roleDef; client + ai never appear ---- */
  function roleKeys() {
    return Object.keys(HV.store.roles || {}).filter(k => k !== 'client' && k !== 'ai');
  }
  function roleTitle(k) {
    const rd = HV.roleDef(k);
    return rd && rd.title ? rd.title : k;
  }
  function roleOptions(sel) {
    return roleKeys().map(k =>
      '<option value="' + HV.esc(k) + '"' + (k === sel ? ' selected' : '') + '>' + HV.esc(roleTitle(k)) + '</option>').join('');
  }

  /* ============================ Program tab ============================ */
  /* set by a failed commit, rendered as .notice.bad on the next paint */
  let programError = '';

  function validateProgram(ps) {
    const wholes = [ps.levels, ps.cycleDays, ps.reviewDay, ps.meetingDay];
    if (wholes.some(n => !Number.isInteger(n) || n <= 0))
      return 'Every program number must be a whole number greater than zero. Nothing was saved.';
    if (!ps.restDays.length || ps.restDays.some(d => !Number.isInteger(d) || d <= 0))
      return 'Rest days must be whole day numbers greater than zero. Nothing was saved.';
    const s = ps.sessions;
    if ([s.fitness, s.yoga, s.mind].some(n => !Number.isInteger(n) || n < 0))
      return 'Session counts must be zero or more. Nothing was saved.';
    /* the term is the second clock and is deliberately NOT checked against
       the cycle — but a term of zero days would make every client read as
       expired the moment it saved */
    if (!Number.isInteger(ps.termDays) || ps.termDays <= 0)
      return 'The engagement term must be a whole number of days greater than zero. Nothing was saved.';
    if (ps.reviewDay > ps.cycleDays)
      return 'The level review must fall inside the cycle — Day ' + ps.reviewDay + ' of a ' + ps.cycleDays + '-day cycle doesn’t exist. Nothing was saved.';
    if (ps.meetingDay > ps.cycleDays)
      return 'The team meeting must fall inside the cycle — Day ' + ps.meetingDay + ' of a ' + ps.cycleDays + '-day cycle doesn’t exist. Nothing was saved.';
    const out = ps.restDays.filter(d => d > ps.cycleDays);
    if (out.length)
      return 'Rest days must fall inside the cycle — day ' + out.join(' & ') + ' is past Day ' + ps.cycleDays + '. Nothing was saved.';
    return '';
  }

  function statTile(key, label, display, sub, canEdit) {
    const editBtn = canEdit
      ? '<button class="btn sm ghost" data-cfg-edit="' + key + '" aria-label="Edit ' + HV.esc(label) + '" style="flex:none">' + HV.ui.icon('pencil') + '</button>'
      : '';
    return '<div class="stat">' +
      '<div class="k">' + HV.esc(label) + '</div>' +
      '<div class="row" style="align-items:baseline;gap:var(--s2);flex-wrap:nowrap;margin-top:var(--s1)">' +
        '<span class="v num" data-cfg-disp="' + key + '">' + HV.esc(display) + '</span>' + editBtn +
      '</div>' +
      '<div class="sub">' + HV.esc(sub) + '</div>' +
    '</div>';
  }

  function programHtml(canEdit) {
    const ps = HV.store.programShape;
    const cc = HV.store.cultureCriteria;
    const bc = HV.store.bodyCriteria;
    const err = programError;
    programError = '';

    const tiles = [
      statTile('levels', 'Levels', String(ps.levels), 'Each pillar climbs independently', canEdit),
      statTile('cycleDays', 'Cycle length', ps.cycleDays + ' days', 'Day 1 to Day ' + ps.cycleDays, canEdit),
      statTile('reviewDay', 'Level review', 'Day ' + ps.reviewDay, 'The only day levels move', canEdit),
      statTile('restDays', 'Rest days', ps.restDays.join(' & '), 'Active rest — no sessions scheduled', canEdit),
      statTile('meetingDay', 'Team meeting', 'Day ' + ps.meetingDay, 'Progress meeting closes the cycle', canEdit),
      statTile('sessions', 'Sessions / cycle', ps.sessions.fitness + ' + ' + ps.sessions.yoga + ' + ' + ps.sessions.mind, 'Fitness + Yoga + Mind Wellness', canEdit),
      /* the SECOND clock — deliberately not tied to the programme's length.
         7 levels x 14 days is 98; a term is what the client paid for. */
      statTile('termDays', 'Engagement term', ps.termDays + ' days', 'What a client signs up for — not the programme', canEdit),
    ].join('');

    return (err ? '<div class="notice bad" role="alert" style="margin-bottom:var(--s3)">' + HV.esc(err) + '</div>' : '') +
      '<div class="grid3">' + tiles + '</div>' +
      (canEdit
        ? '<p class="audit" style="margin-top:var(--s3)">' + HV.esc(AUDIT_LINE) + '</p>'
        : '<p class="audit" style="margin-top:var(--s3)">Read-only for your role. Editing the program shape needs Super Admin or Operations Head access.</p>') +

      '<div class="card" style="margin-top:var(--s4)"><span class="k">Pass conditions</span>' +
        '<p class="sub" style="margin:var(--s2) 0 0">Two rule sets decide a level-up. Both are browsable in full under Catalog.</p>' +
        '<div class="list" style="margin-top:var(--s3)">' +
          '<div class="trow"><span class="grow"><b>Nutrition gates</b><small>' +
            '<span class="num">' + cc.gates.length + '</span> gates across <span class="num">' + ps.levels +
            '</span> levels and <span class="num">' + Object.keys(cc.tracks).length + '</span> activity tracks</small></span></div>' +
          '<div class="trow"><span class="grow"><b>Body criteria</b><small>Bar ' + HV.esc(bc.bar) +
            ' · fitness ' + HV.esc(bc.sessionBars.fitness) + ' · yoga ' + HV.esc(bc.sessionBars.yoga) +
            '</small></span></div>' +
        '</div></div>';
  }

  function wireProgram(el, canEdit) {
    if (!canEdit) return;
    el.querySelectorAll('[data-cfg-edit]').forEach(btn => btn.addEventListener('click', () => {
      if (!HV.can('manageConfig')) { HV.toast(GATE_TOAST); return; }
      const key = btn.dataset.cfgEdit;
      const ps = HV.store.programShape;
      const span = btn.previousElementSibling;
      const wrap = span.parentElement;
      const inp = document.createElement('input');
      inp.className = 'input';
      inp.style.maxWidth = '10em';
      inp.style.padding = 'var(--s1) var(--s2)';
      if (key === 'restDays') inp.value = ps.restDays.join(', ');
      else if (key === 'sessions') inp.value = ps.sessions.fitness + ', ' + ps.sessions.yoga + ', ' + ps.sessions.mind;
      else inp.value = ps[key];
      wrap.replaceChild(inp, span);
      btn.style.display = 'none';
      inp.focus(); inp.select();
      let closed = false;
      const commit = () => {
        if (closed) return;
        closed = true;
        const v = inp.value.trim();
        /* validate the WHOLE shape with the edit applied — a legal number in
           isolation (review Day 12) can still break the cycle it sits in */
        const cand = JSON.parse(JSON.stringify(ps));
        let parsed = true;
        if (key === 'restDays') {
          const nums = v.split(',').map(s => parseInt(s.trim(), 10));
          if (nums.length && nums.every(n => !isNaN(n))) cand.restDays = nums;
          else parsed = false;
        } else if (key === 'sessions') {
          const nums = v.split(',').map(s => parseInt(s.trim(), 10));
          if (nums.length === 3 && nums.every(n => !isNaN(n)))
            cand.sessions = { fitness: nums[0], yoga: nums[1], mind: nums[2] };
          else parsed = false;
        } else {
          const n = parseInt(v, 10);
          if (!isNaN(n)) cand[key] = n;
          else parsed = false;
        }
        const err = parsed ? validateProgram(cand)
          : 'That entry didn’t parse — use whole numbers (rest days and sessions comma-separated). Nothing was saved.';
        if (err) programError = err;
        else {
          Object.assign(ps, cand);
          HV.save(); HV.toast(AUDIT_LINE);
        }
        HV.refresh();
      };
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') { closed = true; HV.refresh(); }
      });
      inp.addEventListener('blur', commit);
    }));
  }

  /* ============================ Service tab ============================
     The two live service-level dials: the meal reply ladder (HV.slaLeft /
     HV.slaSweep read slaConfig on every tick) and who signs leave
     (console-leave's Approvals tab keys off leaveConfig.approverRole). */
  function ladderLine(sla) {
    return '<span class="num">' + sla.replyTargetMin + '</span> min target · nudge at <span class="num">' +
      sla.notifyAfterMin + '</span> min · escalate at <span class="num">' +
      (sla.notifyAfterMin + sla.escalateAfterMin) + '</span> min · to ' + HV.esc(roleTitle(sla.escalateToRole));
  }

  function serviceHtml(canEdit) {
    const sla = HV.store.slaConfig;
    const lc = HV.store.leaveConfig;
    const numCtl = (key, val, label) => canEdit
      ? '<input class="input num cfg-num" type="number" min="1" step="1" inputmode="numeric" value="' + val + '" data-svc="' + key + '" aria-label="' + label + ', minutes">'
      : '<span class="num">' + val + ' min</span>';
    const roleCtl = (which, val, label) => canEdit
      ? '<select class="input" data-svc-sel="' + which + '" aria-label="' + label + '">' + roleOptions(val) + '</select>'
      : HV.ui.pill(roleTitle(val), 'info');

    return '<div class="notice">These numbers drive live behaviour: the meals queue counts every awaiting photo against the reply target, and Time & Cover routes leave to the approver named here.</div>' +

      '<div class="card" style="margin-top:var(--s3)"><span class="k">Meal reply ladder</span>' +
        '<div class="list" style="margin-top:var(--s3)">' +
          '<div class="trow"><span class="grow"><b>Reply target</b><small>The clock every awaiting meal photo is judged against</small></span>' +
            numCtl('replyTargetMin', sla.replyTargetMin, 'Reply target') + '</div>' +
          '<div class="trow"><span class="grow"><b>Nudge after</b><small>Minutes of silence before the responsible dietitian is nudged</small></span>' +
            numCtl('notifyAfterMin', sla.notifyAfterMin, 'Nudge after') + '</div>' +
          '<div class="trow"><span class="grow"><b>Escalate after</b><small>Minutes past the nudge before the miss escalates upward</small></span>' +
            numCtl('escalateAfterMin', sla.escalateAfterMin, 'Escalate after') + '</div>' +
        '</div>' +
        '<p class="audit" style="margin-top:var(--s3)">The ladder as configured: ' + ladderLine(sla) + '.</p>' +
      '</div>' +

      '<div class="card" style="margin-top:var(--s4)"><span class="k">Who is answerable</span>' +
        '<div class="list" style="margin-top:var(--s3)">' +
          '<div class="trow"><span class="grow"><b>Escalations go to</b><small>Every user in this role is notified when a meal blows past the ladder</small></span>' +
            roleCtl('esc', sla.escalateToRole, 'Escalations go to') + '</div>' +
          '<div class="trow"><span class="grow"><b>Leave approver</b><small>This role sees the Approvals tab in Time &amp; Cover and signs every leave</small></span>' +
            roleCtl('appr', lc.approverRole, 'Leave approver') + '</div>' +
        '</div>' +
      '</div>' +

      (canEdit
        ? '<p class="audit" style="margin-top:var(--s3)">Saved on change — the meals queue and Time &amp; Cover read these live. No engineering involved.</p>'
        : '<p class="audit" style="margin-top:var(--s3)">Read-only for your role. Editing service levels needs Super Admin or Operations Head access.</p>');
  }

  function wireService(el, canEdit) {
    if (!canEdit) return;
    el.querySelectorAll('[data-svc]').forEach(inp => inp.addEventListener('change', () => {
      if (!HV.can('manageConfig')) { HV.toast(GATE_TOAST); HV.refresh(); return; }
      const key = inp.dataset.svc;
      const n = parseInt(inp.value, 10);
      if (isNaN(n) || n < 1) {
        HV.toast('Minutes must be a whole number, one or more. Nothing was saved.');
        inp.value = HV.store.slaConfig[key];
        return;
      }
      HV.store.slaConfig[key] = n;
      HV.save();
      HV.toast('Service level saved — the meals queue reads the new ladder immediately.');
      HV.refresh();
    }));
    el.querySelectorAll('[data-svc-sel]').forEach(sel => sel.addEventListener('change', () => {
      if (!HV.can('manageConfig')) { HV.toast(GATE_TOAST); HV.refresh(); return; }
      const title = roleTitle(sel.value);
      if (sel.dataset.svcSel === 'esc') {
        HV.store.slaConfig.escalateToRole = sel.value;
        HV.toast('Overdue meals now escalate to every ' + title + '.');
      } else {
        HV.store.leaveConfig.approverRole = sel.value;
        HV.toast('Leave now routes to ' + title + ' for sign-off.');
      }
      HV.save(); HV.refresh();
    }));
  }

  /* ============================ Plans tab ============================ */
  function plansHtml() {
    const cards = Object.keys(HV.PLANS).map(k => {
      const p = HV.PLANS[k];
      return '<div class="card" style="margin-bottom:var(--s4)">' +
        '<div class="h2">' + HV.esc(p.name) + '</div>' +
        '<p class="sub" style="margin-top:var(--s1)">' + HV.esc(p.tag) + '</p>' +
        '<div class="trow" style="margin-top:var(--s3)"><span class="grow"><b>Flow</b><small>' + HV.esc(p.flow) + '</small></span></div>' +
        '<p style="margin-top:var(--s3)">' + HV.esc(p.desc) + '</p>' +
      '</div>';
    }).join('');
    return cards + '<p class="audit">Plan definitions ship with the product.</p>';
  }

  /* ============================ Chains tab ============================
     Presentation unchanged (label + step chips); manageConfig additionally
     gets, per chip, move-earlier / move-later / remove marks and, per chain,
     an add-step role dropdown. All edits write HV.store.chains. */
  const CHAIN_LABELS = {
    team: 'Team allocation', goalsheet: 'Goal sheet', diet: 'Diet plan',
    chart: 'Workout / Yoga chart', level: 'Level review', calendar: 'Calendar',
    template: 'Plan template',
  };
  const CHAIN_ORDER = ['team', 'goalsheet', 'diet', 'chart', 'level', 'calendar', 'template'];

  function chainsHtml(canEdit) {
    const chains = HV.store.chains || {};
    const rows = CHAIN_ORDER.map(k => {
      const label = CHAIN_LABELS[k] || k;
      const steps = chains[k] || [];
      const pills = steps.map((s, i) => {
        const title = roleTitle(s.role);
        let btns = '';
        if (canEdit) {
          if (i > 0)
            btns += '<button data-ch-mv="' + k + ':' + i + ':-1" aria-label="Move ' + HV.esc(title) + ' one step earlier in ' + HV.esc(label) + '">' + HV.ui.icon('chevL') + '</button>';
          if (i < steps.length - 1)
            btns += '<button data-ch-mv="' + k + ':' + i + ':1" aria-label="Move ' + HV.esc(title) + ' one step later in ' + HV.esc(label) + '">' + HV.ui.icon('chevR') + '</button>';
          btns += '<button data-ch-rm="' + k + ':' + i + '" aria-label="Remove ' + HV.esc(title) + ' from ' + HV.esc(label) + '">' + HV.ui.icon('x') + '</button>';
        }
        return '<span class="chip">Step <span class="num">' + (i + 1) + '</span> · ' + HV.esc(title) + btns + '</span>';
      }).join('');
      const empty = !steps.length
        ? '<small>' + (canEdit ? 'No chain yet — add the first signature below.' : 'No chain yet — created on first template submission.') + '</small>'
        : '';
      const addRow = canEdit
        ? '<div class="cfg-addrow"><select class="input" data-ch-add="' + k + '" aria-label="Add a signature step to ' + HV.esc(label) + '">' +
            '<option value="">Add step…</option>' + roleOptions(null) + '</select></div>'
        : '';
      return '<div class="trow" style="align-items:flex-start"><span class="grow"><b>' + HV.esc(label) + '</b>' +
        empty +
        (pills ? '<div class="row" style="flex-wrap:wrap;margin-top:var(--s2)">' + pills + '</div>' : '') +
        addRow + '</span></div>';
    }).join('');
    return (canEdit
        ? '<div class="notice">Chain edits apply to <b>new submissions</b> only — anything already moving through approvals keeps the chain it started with.</div>' +
          '<div class="card cfg-chains" style="margin-top:var(--s3)">'
        : '<div class="card cfg-chains">') +
      '<div class="list">' + rows + '</div></div>' +
      '<p class="audit">' + (canEdit ? '' : 'Read-only. ') +
        'Each chain is the sequence of signatures an item must collect before it publishes — the last signature publishes it.</p>';
  }

  function wireChains(el, canEdit) {
    if (!canEdit) return;
    const gate = () => {
      if (HV.can('manageConfig')) return true;
      HV.toast(GATE_TOAST);
      return false;
    };
    el.querySelectorAll('[data-ch-mv]').forEach(b => b.addEventListener('click', () => {
      if (!gate()) return;
      const parts = b.dataset.chMv.split(':');
      const steps = HV.store.chains[parts[0]];
      const i = +parts[1], j = i + (+parts[2]);
      if (!steps || j < 0 || j >= steps.length) return;
      const t = steps[i]; steps[i] = steps[j]; steps[j] = t;
      HV.save(); HV.toast('Order saved — applies to new submissions.'); HV.refresh();
    }));
    el.querySelectorAll('[data-ch-rm]').forEach(b => b.addEventListener('click', () => {
      if (!gate()) return;
      const parts = b.dataset.chRm.split(':');
      const steps = HV.store.chains[parts[0]];
      if (!steps) return;
      const removed = steps.splice(+parts[1], 1)[0];
      HV.save();
      HV.toast((removed ? roleTitle(removed.role) : 'Step') + ' removed from the chain — applies to new submissions.');
      HV.refresh();
    }));
    el.querySelectorAll('[data-ch-add]').forEach(sel => sel.addEventListener('change', () => {
      if (!sel.value) return;
      if (!gate()) { sel.value = ''; return; }
      const k = sel.dataset.chAdd;
      if (!HV.store.chains[k]) HV.store.chains[k] = [];
      HV.store.chains[k].push({ role: sel.value });
      HV.save();
      HV.toast(roleTitle(sel.value) + ' added as the last signature — applies to new submissions.');
      HV.refresh();
    }));
  }

  /* ============================ Notifications tab ============================
     Ported verbatim from console-pipeline.js's old config view, with edit
     affordances additionally gated on manageConfig (the old view gated the
     whole page on a roles array; this page is reached by nav membership, so
     the gate moves onto the affordances themselves). manageConfig also gets
     add-rule (name + schedule + enabled) and per-row delete. */
  function notifHtml(canEdit) {
    const ruleRows = HV.store.notifRules.map(r => {
      const schedCell = canEdit
        ? '<button class="chip" data-ed="' + r.id + '" title="Tap to edit"><span class="num">' + HV.esc(r.schedule) + '</span>' + HV.ui.icon('pencil') + '</button>'
        : '<span class="num">' + HV.esc(r.schedule) + '</span>';
      const enabledCell = canEdit
        ? '<button data-tg="' + r.id + '">' + HV.ui.pill(r.enabled ? 'On' : 'Paused', r.enabled ? 'ok' : 'neutral') + '</button>'
        : HV.ui.pill(r.enabled ? 'On' : 'Paused', r.enabled ? 'ok' : 'neutral');
      const delCell = canEdit
        ? '<td><button class="cfg-del" data-del="' + r.id + '" aria-label="Delete rule ' + HV.esc(r.name) + '">' + HV.ui.icon('x') + '</button></td>'
        : '';
      return '<tr>' +
        '<td><b>' + HV.esc(r.name) + '</b></td>' +
        '<td>' + schedCell + '</td>' +
        '<td>' + HV.esc(r.audience) + '</td>' +
        '<td>' + HV.esc(r.channel) + '</td>' +
        '<td>' + enabledCell + '</td>' +
        delCell +
      '</tr>';
    }).join('');
    return '<div class="tablewrap"><table class="data">' +
        '<tr><th>Rule</th><th>Schedule' + (canEdit ? ' (tap to edit)' : '') + '</th><th>Audience</th><th>Channel</th><th>Enabled</th>' +
        (canEdit ? '<th></th>' : '') + '</tr>' +
        ruleRows +
      '</table></div>' +
      '<div class="notice">The notification log proves behaviour; this editor changes it.</div>' +
      (canEdit
        ? '<div class="card" style="margin-top:var(--s4)"><span class="k">Add a rule</span>' +
            '<div class="cfg-nradd">' +
              '<input class="input" id="cfg-nr-name" placeholder="Rule name" aria-label="Rule name" style="flex:1;min-width:11em">' +
              '<input class="input" id="cfg-nr-sched" placeholder="Schedule — e.g. Daily · 07:00" aria-label="Schedule" style="flex:1;min-width:11em">' +
              '<button type="button" class="chip sel" id="cfg-nr-on" aria-pressed="true">On</button>' +
              '<button class="btn sm" id="cfg-nr-add">' + HV.ui.icon('plus') + 'Add rule</button>' +
            '</div>' +
            '<p class="sub" style="margin-top:var(--s2)">New rules go to everyone over Push until narrowed; tap the pill to start it paused.</p>' +
          '</div>'
        : '<p class="audit">Read-only for your role. Editing notification rules needs Super Admin or Operations Head access.</p>');
  }

  function wireNotif(el, canEdit) {
    if (!canEdit) return;

    /* --- inline schedule editing --- */
    el.querySelectorAll('[data-ed]').forEach(b => b.addEventListener('click', () => {
      if (!HV.can('manageConfig')) { HV.toast(GATE_TOAST); return; }
      const rule = HV.store.notifRules.find(r => r.id === b.dataset.ed);
      const td = b.closest('td');
      td.innerHTML = '';
      const inp = document.createElement('input');
      inp.className = 'input';
      inp.value = rule.schedule;
      inp.style.minWidth = '12em';
      inp.style.padding = 'var(--s1) var(--s2)';
      td.appendChild(inp);
      inp.focus();
      inp.select();
      let closed = false;
      const commit = () => {
        if (closed) return;
        closed = true;
        const v = inp.value.trim();
        if (v && v !== rule.schedule) {
          rule.schedule = v;
          HV.save();
          HV.toast('Effective before the next occurrence. No engineering involved.');
        }
        HV.refresh();
      };
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') { closed = true; HV.refresh(); }
      });
      inp.addEventListener('blur', commit);
    }));

    /* --- enabled toggle --- */
    el.querySelectorAll('[data-tg]').forEach(b => b.addEventListener('click', () => {
      if (!HV.can('manageConfig')) { HV.toast(GATE_TOAST); return; }
      const rule = HV.store.notifRules.find(r => r.id === b.dataset.tg);
      rule.enabled = !rule.enabled;
      HV.save();
      HV.toast('“' + rule.name + '” ' + (rule.enabled ? 'enabled. It resumes at its next scheduled slot.' : 'paused. It simply stops; nothing else changes.'));
      HV.refresh();
    }));

    /* --- delete rule --- */
    el.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
      if (!HV.can('manageConfig')) { HV.toast(GATE_TOAST); return; }
      const i = HV.store.notifRules.findIndex(r => r.id === b.dataset.del);
      if (i < 0) return;
      const removed = HV.store.notifRules.splice(i, 1)[0];
      HV.save();
      HV.toast('“' + removed.name + '” deleted. It stops immediately.');
      HV.refresh();
    }));

    /* --- add rule: name + schedule + enabled --- */
    const tgl = el.querySelector('#cfg-nr-on');
    if (tgl) tgl.addEventListener('click', () => {
      const on = tgl.getAttribute('aria-pressed') !== 'true';
      tgl.setAttribute('aria-pressed', on ? 'true' : 'false');
      tgl.textContent = on ? 'On' : 'Paused';
      tgl.classList.toggle('sel', on);
    });
    const add = el.querySelector('#cfg-nr-add');
    if (add) add.addEventListener('click', () => {
      if (!HV.can('manageConfig')) { HV.toast(GATE_TOAST); return; }
      const name = el.querySelector('#cfg-nr-name').value.trim();
      const sched = el.querySelector('#cfg-nr-sched').value.trim();
      if (!name || !sched) { HV.toast('A rule needs a name and a schedule.'); return; }
      const enabled = tgl.getAttribute('aria-pressed') === 'true';
      HV.store.notifRules.push({
        id: 'n' + Date.now(), name: name, schedule: sched,
        audience: 'All', channel: 'Push', enabled: enabled,
      });
      HV.save();
      HV.toast('“' + name + '” added' + (enabled ? ' — live from its next slot.' : ' — saved paused.'));
      HV.refresh();
    });
  }

  /* ============================ Catalog tab ============================
     The two governed vocabularies behind the Catalog page.

     A CATEGORY is the shelf an item sits on — every item sits on exactly one.
     Its key is also `client.track`, which is why the three original keys can
     never be renamed: they index the level books and the level-review
     criteria. A category added here has no level book of its own and falls
     back to Sedentary, which the audit line below says out loud.

     A TAG is a sticker on the jar — an item carries any number, and they cut
     across libraries and shelves. Before this list existed they were free text
     typed into a comma box, so `PCOD` and `pcod` became two chips filtering
     two different ways.

     Both are content: core's boot-refill list grafts them, so neither needed a
     seedVersion bump. Deleting either is refused while anything still uses it
     — one rule for both lists, so there is one thing to learn. */

  /* Every use of a category: catalog items on that shelf, plus templates filed
     under it. tagUnion in the Catalog page walks ONE library at a time, so the
     count here has to walk all five itself. */
  function catUsage() {
    const libs = HV.store.catalog || {};
    const track = {}, tag = {};
    Object.keys(libs).forEach(k => (libs[k] || []).forEach(it => {
      if (it.track) track[it.track] = (track[it.track] || 0) + 1;
      (it.tags || []).forEach(t => { tag[t] = (tag[t] || 0) + 1; });
    }));
    const tpl = {};
    (HV.store.templates || []).forEach(t => { if (t.track) tpl[t.track] = (tpl[t.track] || 0) + 1; });
    /* a client sits on a category too, and reclassifying one behind their back
       is the worst version of this — so they count as a use */
    const cli = {};
    (HV.store.clients || []).forEach(c => { if (c.track) cli[c.track] = (cli[c.track] || 0) + 1; });
    return { track, tpl, cli, tag };
  }

  function usageWords(k, u) {
    const bits = [];
    if (u.track[k]) bits.push('<span class="num">' + u.track[k] + '</span> item' + (u.track[k] === 1 ? '' : 's'));
    if (u.tpl[k]) bits.push('<span class="num">' + u.tpl[k] + '</span> template' + (u.tpl[k] === 1 ? '' : 's'));
    if (u.cli[k]) bits.push('<span class="num">' + u.cli[k] + '</span> client' + (u.cli[k] === 1 ? '' : 's'));
    return bits.length ? bits.join(' · ') : 'Nothing yet';
  }

  function catalogHtml(canEdit) {
    const u = catUsage();
    const tracks = HV.tracks();
    const trackRows = tracks.map(t => {
      const used = (u.track[t.k] || 0) + (u.tpl[t.k] || 0) + (u.cli[t.k] || 0);
      const del = canEdit
        ? (used
            ? '<span class="audit" style="font-style:normal">In use</span>'
            : '<button class="cfg-del" data-ctdel="' + HV.esc(t.k) + '" aria-label="Delete category ' + HV.esc(t.t) + '">' + HV.ui.icon('x') + '</button>')
        : '';
      return '<tr>' +
        '<td>' + (canEdit
          ? '<input class="input" data-ctlbl="' + HV.esc(t.k) + '" value="' + HV.esc(t.t) + '" aria-label="Name of category ' + HV.esc(t.t) + '">'
          : '<b>' + HV.esc(t.t) + '</b>') + '</td>' +
        '<td><code>' + HV.esc(t.k) + '</code></td>' +
        '<td>' + usageWords(t.k, u) + '</td>' +
        '<td>' + del + '</td></tr>';
    }).join('');

    const vocab = HV.catTags();
    const tagChips = vocab.length
      ? vocab.map(t =>
          '<span class="chip">' + HV.esc(t) +
          '<span class="num" style="margin-left:var(--s2)">' + (u.tag[t] || 0) + '</span>' +
          (canEdit ? '<button data-cgdel="' + HV.esc(t) + '" aria-label="Delete tag ' + HV.esc(t) + '">' + HV.ui.icon('x') + '</button>' : '') +
          '</span>').join('')
      : '<span class="audit">No tags yet.</span>';

    /* a tag worn by an item but absent from the list — the state that arises
       when someone deletes one from a hand-edited store. Naming it is better
       than letting it haunt the Catalog's filter row unexplained. */
    const orphans = Object.keys(u.tag).filter(t => vocab.indexOf(t) === -1);

    return '<div class="cfg-chains">' +
      '<div class="sec-title">Categories</div>' +
      '<p class="sub">The shelf an item sits on — every catalog item sits on exactly one. This is the same list a client is placed on, so the key behind each name is fixed.</p>' +
      '<div class="tablewrap"><table class="data"><thead><tr>' +
        '<th>Name</th><th>Key</th><th>Used by</th><th></th>' +
      '</tr></thead><tbody>' + trackRows + '</tbody></table></div>' +
      (canEdit
        ? '<div class="cfg-addrow row">' +
            '<input class="input" id="cfg-ctnew" placeholder="Add a category — e.g. Athlete" aria-label="New category name">' +
            '<button class="btn sm" id="cfg-ctadd">' + HV.ui.icon('plus') + 'Add</button>' +
          '</div>'
        : '') +
      '<p class="audit">A new category falls back to the Sedentary level book until one is written for it. Templates and catalog items file under it immediately. Renaming is always safe — the key never changes. A category in use cannot be deleted.</p>' +

      '<div class="sec-title" style="margin-top:var(--s5)">Tags</div>' +
      '<p class="sub">The stickers on the jar — an item carries any number, and they cut across every library. The number beside each is how many catalog items wear it.</p>' +
      '<div class="row" style="flex-wrap:wrap; gap:var(--s2)">' + tagChips + '</div>' +
      (canEdit
        ? '<div class="cfg-addrow row">' +
            '<input class="input" id="cfg-cgnew" placeholder="Add a tag — e.g. hypertension" aria-label="New tag">' +
            '<button class="btn sm" id="cfg-cgadd">' + HV.ui.icon('plus') + 'Add</button>' +
          '</div>'
        : '') +
      (orphans.length
        ? '<div class="notice warn"><b>Not on the list:</b> ' +
          orphans.map(t => '<span class="chip">' + HV.esc(t) + '</span>').join(' ') +
          ' — worn by items but missing from the vocabulary. They still filter, and adding them here tidies the list.</div>'
        : '') +
      '<p class="audit">Tags are picked, never typed, on an item — so “PCOD” and “pcod” can’t become two different filters. A tag in use cannot be deleted.</p>' +
      '</div>';
  }

  function wireCatalog(el, canEdit) {
    if (!canEdit) return;
    const repaint = () => { HV.save(); HV.refresh(); };
    const u = catUsage();

    el.querySelectorAll('[data-ctlbl]').forEach(inp => {
      inp.addEventListener('change', () => {
        const t = HV.tracks().filter(x => x.k === inp.dataset.ctlbl)[0];
        const v = inp.value.trim();
        if (!t || !v) { HV.refresh(); return; }
        t.t = v;
        repaint();
        HV.toast('Renamed — ' + v);
      });
    });
    el.querySelectorAll('[data-ctdel]').forEach(b => {
      b.addEventListener('click', () => {
        const k = b.dataset.ctdel;
        const used = (u.track[k] || 0) + (u.tpl[k] || 0) + (u.cli[k] || 0);
        if (used) { HV.toast('Still in use — ' + usageWords(k, u).replace(/<[^>]+>/g, '') + '.'); return; }
        HV.store.tracks = HV.tracks().filter(x => x.k !== k);
        repaint();
        HV.toast('Deleted — ' + k);
      });
    });
    const ctAdd = el.querySelector('#cfg-ctadd');
    if (ctAdd) ctAdd.addEventListener('click', () => {
      const inp = el.querySelector('#cfg-ctnew');
      const label = inp.value.trim();
      if (!label) return;
      /* the key is derived once and then frozen — it is what every level book,
         template and client record will point at from here on */
      const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (!key) return;
      if (HV.tracks().some(x => x.k === key)) { HV.toast('Already a category — ' + label); return; }
      HV.store.tracks = HV.tracks().concat([{ k: key, t: label }]);
      repaint();
      HV.toast('Added — ' + label + '. It falls back to the Sedentary level book until one is written.');
    });

    el.querySelectorAll('[data-cgdel]').forEach(b => {
      b.addEventListener('click', () => {
        const t = b.dataset.cgdel;
        if (u.tag[t]) { HV.toast('Still in use — ' + u.tag[t] + ' item' + (u.tag[t] === 1 ? '' : 's') + ' wear it.'); return; }
        HV.store.catTags = HV.catTags().filter(x => x !== t);
        repaint();
        HV.toast('Deleted — ' + t);
      });
    });
    const cgAdd = el.querySelector('#cfg-cgadd');
    if (cgAdd) cgAdd.addEventListener('click', () => {
      const inp = el.querySelector('#cfg-cgnew');
      const v = inp.value.trim();
      if (!v) return;
      /* case-insensitive, because the whole reason this list exists is that
         "PCOD" and "pcod" used to become two chips filtering two ways */
      if (HV.catTags().some(x => x.toLowerCase() === v.toLowerCase())) { HV.toast('Already a tag — ' + v); return; }
      HV.store.catTags = HV.catTags().concat([v]);
      repaint();
      HV.toast('Added — ' + v);
    });
  }

  /* ============================ Automations tab ============================
     The library of workflow templates: named, ordered runs of messages a
     client receives on their OWN clock. Authored here once for the house;
     switched on per client in that client's Automations pad, which is the
     only thing that decides whether a template ever runs for them.

     Templates are CONTENT — they sit in core's boot-refill list, so adding one
     never needs a seedVersion bump. Who is subscribed is user state and lives
     in store.clientFlows. */
  function flowReach(t) {
    return (HV.store.clients || []).filter(c => c.userId && HV.flowOn(c.id, t.id)).length;
  }
  function stepWhen(t, s) {
    return t.trigger === 'cycleDay'
      ? 'Day <span class="num">' + Number(s.on) + '</span> of every cycle'
      : (Number(s.after) === 0 ? 'On joining' : '<span class="num">' + Number(s.after) + '</span> days after joining');
  }

  function flowsHtml(canEdit) {
    const live = (HV.store.clients || []).filter(c => c.userId).length;
    const rows = HV.flowTemplates().map(t => {
      const on = t.enabled !== false;
      const reach = flowReach(t);
      const enabledCell = canEdit
        ? '<button data-ftg="' + HV.esc(t.id) + '">' + HV.ui.pill(on ? 'On' : 'Paused', on ? 'ok' : 'neutral') + '</button>'
        : HV.ui.pill(on ? 'On' : 'Paused', on ? 'ok' : 'neutral');
      const delCell = canEdit
        ? '<td><button class="cfg-del" data-fdel="' + HV.esc(t.id) + '" aria-label="Delete template ' + HV.esc(t.name) + '">' + HV.ui.icon('x') + '</button></td>'
        : '';
      const steps = (t.steps || []).map(s =>
        '<li><b>' + HV.esc(s.title) + '</b> · ' + stepWhen(t, s) +
        ' at <span class="num">' + HV.fmtTime(Number(s.at || 0)) + '</span></li>').join('');
      return '<tr>' +
          '<td><b>' + HV.esc(t.name) + '</b><br><small>' + HV.esc(t.desc || '') + '</small></td>' +
          '<td>' + (t.trigger === 'cycleDay' ? 'Every cycle' : 'Once, from joining') + '</td>' +
          /* NBSP, not a space: .chip is inline-flex, so the text node beside
             the numeral becomes its own flex item and its leading whitespace
             is trimmed — this rendered "3steps". And a template can have one. */
          '<td><button class="chip" data-fex="' + HV.esc(t.id) + '" aria-expanded="false">' +
            '<span class="num">' + (t.steps || []).length + '</span>&nbsp;step' +
            ((t.steps || []).length === 1 ? '' : 's') + '</button></td>' +
          '<td><span class="num">' + reach + '</span> of <span class="num">' + live + '</span></td>' +
          '<td>' + (t.defaultOn ? 'On' : 'Off') + '</td>' +
          '<td>' + enabledCell + '</td>' + delCell +
        '</tr>' +
        '<tr data-fsteps="' + HV.esc(t.id) + '" hidden><td colspan="' + (canEdit ? 7 : 6) + '">' +
          '<ol class="cfg-steps">' + steps + '</ol></td></tr>';
    }).join('');

    return '<div class="tablewrap"><table class="data">' +
        '<tr><th>Template</th><th>Trigger</th><th>Steps</th><th>Switched on for</th>' +
        '<th>New clients</th><th>Enabled</th>' + (canEdit ? '<th></th>' : '') + '</tr>' +
        rows +
      '</table></div>' +
      '<div class="notice">A template only ever runs for a client it is switched on for — that switch lives in the client\'s own Automations pad. Pausing one here stops it for everybody at once.</div>' +
      (canEdit
        ? '<div class="card" style="margin-top:var(--s4)"><span class="k">Add a template</span>' +
            '<div class="cfg-nradd">' +
              '<input class="input" id="cfg-fl-name" placeholder="Template name" aria-label="Template name" style="flex:1;min-width:11em">' +
              '<select class="input" id="cfg-fl-trig" aria-label="Trigger" style="flex:1;min-width:11em">' +
                '<option value="enrol">Once, from joining</option>' +
                '<option value="cycleDay">Every cycle</option>' +
              '</select>' +
              '<button type="button" class="chip sel" id="cfg-fl-def" aria-pressed="true">On for new clients</button>' +
              '<button class="btn sm" id="cfg-fl-add">' + HV.ui.icon('plus') + 'Add template</button>' +
            '</div>' +
            '<p class="sub" style="margin-top:var(--s2)">A new template starts with no steps and sends nothing until one is added.</p>' +
          '</div>'
        : '<p class="audit">Read-only for your role. Authoring templates needs Super Admin or Operations Head access.</p>');
  }

  function wireFlows(el, canEdit) {
    /* the step list expands for everyone — reading a template is not editing it */
    el.querySelectorAll('[data-fex]').forEach(b => b.addEventListener('click', () => {
      const row = el.querySelector('[data-fsteps="' + b.dataset.fex + '"]');
      if (!row) return;
      const opening = row.hasAttribute('hidden');
      if (opening) row.removeAttribute('hidden'); else row.setAttribute('hidden', '');
      b.setAttribute('aria-expanded', opening ? 'true' : 'false');
    }));
    if (!canEdit) return;

    el.querySelectorAll('[data-ftg]').forEach(b => b.addEventListener('click', () => {
      if (!HV.can('manageConfig')) { HV.toast(GATE_TOAST); return; }
      const t = HV.flowTemplate(b.dataset.ftg);
      if (!t) return;
      t.enabled = t.enabled === false;
      HV.save();
      HV.toast('“' + t.name + '” ' + (t.enabled
        ? 'enabled — it resumes for every client it is switched on for.'
        : 'paused for everyone. Per-client switches are remembered.'));
      HV.refresh();
    }));

    el.querySelectorAll('[data-fdel]').forEach(b => b.addEventListener('click', () => {
      if (!HV.can('manageConfig')) { HV.toast(GATE_TOAST); return; }
      const list = HV.store.flowTemplates || [];
      const i = list.findIndex(t => t.id === b.dataset.fdel);
      if (i < 0) return;
      const gone = list.splice(i, 1)[0];
      HV.save();
      HV.toast('“' + gone.name + '” deleted. It stops immediately for every client.');
      HV.refresh();
    }));

    const def = el.querySelector('#cfg-fl-def');
    if (def) def.addEventListener('click', () => {
      const on = def.getAttribute('aria-pressed') !== 'true';
      def.setAttribute('aria-pressed', on ? 'true' : 'false');
      def.textContent = on ? 'On for new clients' : 'Off for new clients';
      def.classList.toggle('sel', on);
    });

    const add = el.querySelector('#cfg-fl-add');
    if (add) add.addEventListener('click', () => {
      if (!HV.can('manageConfig')) { HV.toast(GATE_TOAST); return; }
      const name = el.querySelector('#cfg-fl-name').value.trim();
      if (!name) { HV.toast('A template needs a name.'); return; }
      HV.store.flowTemplates = HV.store.flowTemplates || [];
      /* a MINTED id, never one derived from the name: re-creating a deleted
         template under its old id would inherit that template's delivery log
         and silently skip every step its clients had already received. */
      HV.store.flowTemplates.push({
        id: 'fl-' + HV.now().toString(36), name: name,
        desc: '', trigger: el.querySelector('#cfg-fl-trig').value,
        defaultOn: def.getAttribute('aria-pressed') === 'true',
        enabled: true, steps: [],
      });
      HV.save();
      HV.toast('“' + name + '” added. It sends nothing until it has a step.');
      HV.refresh();
    });
  }

  /* ============================ page shell ============================
     No roles array: reached by nav membership (admin / opshead / core all
     list 'config'), same contract as Catalog and People & Access. Old deep
     links #/config/cycles and #/config/pass (this view's former Cycles and
     Pass-conditions tabs) fold into Program, which now carries both. */
  HV.registerView('config', {
    title: 'Configuration',
    render(el, params) {
      let tab = params[0];
      if (tab === 'cycles' || tab === 'pass') tab = 'program';
      const active = CONFIG_TABS.some(t => t.key === tab) ? tab : 'program';
      const canEdit = HV.can('manageConfig');

      el.innerHTML = STYLE +
        '<div class="h1-row"><div><div class="kicker">THE RULES</div><h1 class="h1">Configuration</h1>' +
          '<p class="sub">Program shape, service levels, plan definitions, approval chains, notification rules, workflow automations and the catalogue’s own categories and tags — the levers Ops can pull without engineering.</p></div></div>' +
        HV.ui.tabs(CONFIG_TABS, active) +
        '<div id="cfg-root" style="margin-top:var(--s3)">' +
          (active === 'program' ? programHtml(canEdit)
            : active === 'service' ? serviceHtml(canEdit)
            : active === 'plans' ? plansHtml()
            : active === 'chains' ? chainsHtml(canEdit)
            : active === 'automations' ? flowsHtml(canEdit)
            : active === 'catalog' ? catalogHtml(canEdit)
            : notifHtml(canEdit)) +
        '</div>';

      el.querySelectorAll('.tabs button').forEach(b => {
        b.addEventListener('click', () => HV.go('#/config/' + b.dataset.tab));
      });

      if (active === 'program') wireProgram(el, canEdit);
      if (active === 'service') wireService(el, canEdit);
      if (active === 'chains') wireChains(el, canEdit);
      if (active === 'notifications') wireNotif(el, canEdit);
      if (active === 'automations') wireFlows(el, canEdit);
      if (active === 'catalog') wireCatalog(el, canEdit);
    },
  });
})();
