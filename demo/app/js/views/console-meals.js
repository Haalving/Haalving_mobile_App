/* CC-04 · Meal Review Queue — the dietitian's signature surface.
   No auto-publish, ever: clients only see the human-confirmed rating. */
(function () {
  'use strict';

  /* view-local state — survives re-renders inside this view */
  let selId = null;       // selected meal id
  let chosen = null;      // dietitian's star choice (null = untouched, ghost pre-score shows)
  let voiceRec = false;   // fake recorded voice-note state
  let typedOpen = false;  // typed-fallback details open?
  let typed = '';         // typed fallback text
  let protein = null;     // editable protein estimate
  let kcal = null;        // editable kcal estimate

  function resetMealState(meal) {
    chosen = null;
    voiceRec = false;
    typedOpen = false;
    typed = '';
    protein = meal ? meal.protein : null;
    kcal = meal ? meal.kcal : null;
  }

  /* live-computed against slaConfig — HV.slaLeft is the single truth now;
     m.slaMin is the legacy label and is never read here anymore */
  function slaPill(m) {
    const left = HV.slaLeft(m);
    if (left == null) return HV.ui.pill('No SLA', 'neutral');
    if (left < 0) return HV.ui.pill('Overdue' + (m.slaEscalated ? ' · escalated' : ''), 'bad');
    const kind = left < 5 ? 'warn' : 'ok';
    return '<span class="pill ' + kind + '">Reply due · <span class="num">' + left + '</span>&nbsp;min</span>';
  }

  /* the ladder, named from config so a Service-tab edit shows up here live */
  function ladderLine() {
    const cfg = HV.store.slaConfig;
    if (!cfg) return '';
    const who = (HV.roleDef(cfg.escalateToRole) || {}).title || cfg.escalateToRole;
    return '<div class="audit"><span class="num">' + cfg.replyTargetMin + '</span> min reply target · ' +
      'nudge at <span class="num">' + cfg.notifyAfterMin + '</span> · ' +
      'escalate at <span class="num">' + (cfg.notifyAfterMin + cfg.escalateAfterMin) + '</span> · ' +
      'to ' + HV.esc(who) + '</div>';
  }

  function getQueue() {
    const visible = HV.myClients().map(c => c.id);
    return HV.store.meals
      .filter(m => m.final === null && visible.includes(m.clientId))
      .slice()
      .sort((a, b) => {
        const al = HV.slaLeft(a), bl = HV.slaLeft(b);
        const as = al == null ? 1e9 : al;
        const bs = bl == null ? 1e9 : bl;
        return (as - bs) || (b.capturedMinsAgo - a.capturedMinsAgo);
      });
  }

  function getRated() {
    const visible = HV.myClients().map(c => c.id);
    return HV.store.meals
      .filter(m => m.final !== null && visible.includes(m.clientId))
      .slice()
      .sort((a, b) => a.capturedMinsAgo - b.capturedMinsAgo);
  }

  function canSubmit() {
    return chosen != null && (chosen === 5 || voiceRec || typed.length >= 120);
  }

  function submitRating(el, meal, client) {
    const me = HV.me();
    /* the toast fires after resetMealState() has already cleared `chosen`,
       so the star count has to be held before the reset or it reads null */
    const stars = chosen;
    const pv = parseInt(protein, 10);
    const kv = parseInt(kcal, 10);
    if (!isNaN(pv)) meal.protein = pv;
    if (!isNaN(kv)) meal.kcal = kv;

    meal.final = {
      stars: chosen,
      byId: me.id,
      voiceSec: voiceRec ? 14 : 0,
      note: typed.trim() || (voiceRec ? 'Voice note attached' : ''),
      rubric: {
        'Plan match': '2 / 2',
        'Portion': '1 / 1',
        'Quality': chosen >= 4 ? '1 / 1' : '0 / 1 · correction noted',
        'Timing': '1 / 1',
      },
    };
    meal.slaMin = null;

    /* Rajesh's lunch closes the open SLA work-list item */
    if (meal.id === 'm-raj-lunch') {
      const w = HV.store.worklist.find(x => x.id === 'w3');
      if (w) w.status = 'done';
    }

    /* Observation clients see capture-only — push NOTHING client-visible */
    if (!client.observation) {
      HV.pushMsg(meal.clientId, {
        id: 'cm-' + meal.id + '-rating',
        fromId: me.id,
        kind: 'rating',
        mealId: meal.id,
        text: meal.slot + ' rated ' + chosen + ' stars. ' + (voiceRec ? 'Voice note attached. ' : (typed.trim() ? 'Note added. ' : '')) +
          (chosen >= 4 ? 'Lovely work — keep this rhythm.' : 'One small tweak inside — you’ve got this.'),
      });
    }

    selId = null;
    resetMealState(null);
    HV.save();
    HV.refresh();
    HV.toast(client.observation
      ? 'Recorded for the team — ' + client.name + ' still sees capture-only'
      : client.name + ' now sees ' + stars + ' stars and your note.');
  }

  function queueRow(m) {
    const c = HV.client(m.clientId);
    const sel = m.id === selId;
    return '<button class="trow click" data-mid="' + m.id + '"' +
      (sel ? ' style="box-shadow:inset 0 0 0 1.5px var(--brand); background:var(--brand-wash)" aria-current="true"' : '') + '>' +
      HV.ui.mealArt(m, 'sm') +
      '<span style="flex:1; min-width:0"><b>' + HV.esc(c.name) + '</b> — ' + HV.esc(m.slot) +
      '<small>captured ' + HV.esc(HV.ago(m.capturedMinsAgo)) + '</small></span>' +
      slaPill(m) +
      '</button>';
  }

  function reviewPane(m) {
    const c = HV.client(m.clientId);
    const plan = HV.store.plans[m.clientId];

    const banner = c.observation
      ? '<div class="notice warn">Observation — rating recorded for the team; the client sees capture-only</div>'
      : '';

    const head =
      '<div class="row">' + HV.ui.avatar(c.name, 'sm') +
        '<span style="flex:1; min-width:0"><b>' + HV.esc(c.name) + '</b>' +
        '<small class="sub" style="display:block">' + HV.esc(m.slot) + ' · captured ' + HV.esc(HV.ago(m.capturedMinsAgo)) + '</small></span>' +
        slaPill(m) +
      '</div>';

    const planHtml = (plan && plan.culture)
      ? '<b>' + HV.esc(plan.culture.title) + ':</b> ' + plan.culture.lines.map(l => HV.esc(l)).join(' · ')
      : '<b>Observation window:</b> no diet plan yet — days 1–5 we learn before we change.';
    const context =
      '<div class="notice">' + planHtml +
      '<br><b>Client felt:</b> ' + HV.esc(m.fullness) + '</div>';

    const aidraft = HV.ui.aidraft(
      '<b>AI pre-score, never client-visible.</b> AI suggests <span class="num">' + m.ai.stars + '</span> stars ' +
      '(<span class="num">' + m.ai.conf + '</span>% confidence). ' +
      'Detected: ' + m.ai.detected.map(d => HV.esc(d)).join(', ') + '. Note: ' + HV.esc(m.ai.note)
    );

    let starAudit = '<div class="audit">Tap a star — one tap confirms the pre-score, a different star overrides.</div>';
    if (chosen != null) {
      starAudit = chosen === m.ai.stars
        ? '<div class="audit">Confirms the AI pre-score — logged as one-tap confirm.</div>'
        : '<div class="audit">Override vs AI pre-score will be logged.</div>';
    }
    const starsHtml =
      '<div>' +
        '<div class="row" style="flex-wrap:wrap">' + HV.ui.starInput(m.ai.stars, chosen) +
        '<span class="sub">ghost stars = AI pre-score</span></div>' +
        starAudit +
      '</div>';

    const macros =
      '<div>' +
        '<div class="row" style="flex-wrap:wrap; gap:var(--s3); align-items:flex-end">' +
          '<label class="sub" style="display:flex; flex-direction:column; gap:var(--s1); flex:1">Protein (g)' +
            '<input id="pr-in" class="input num" type="number" min="0" value="' + HV.esc(protein) + '"></label>' +
          '<label class="sub" style="display:flex; flex-direction:column; gap:var(--s1); flex:1">Energy (kcal)' +
            '<input id="kc-in" class="input num" type="number" min="0" value="' + HV.esc(kcal) + '"></label>' +
        '</div>' +
        '<div class="audit">Auto-estimated, editable — feeds the calorie log.</div>' +
      '</div>';

    let noteHtml = '';
    if (chosen != null && chosen < 5) {
      const recPart = voiceRec
        ? '<div class="row"><div style="flex:1; min-width:0">' + HV.ui.voice(14) + '</div>' +
          '<button class="btn ghost sm" id="rerec-btn">Re-record</button></div>' +
          '<div class="audit" style="margin-top:var(--s1)">Recorded 0:14 · 10 s min · 30 s cap</div>'
        : '<div class="row"><button class="btn quiet sm" id="rec-btn">' + HV.ui.icon('mic') + 'Record voice note</button>' +
          '<span class="audit">10 s min · 30 s cap</span></div>';
      noteHtml =
        '<div>' +
          '<div class="card-title" style="margin-bottom:var(--s2)">Coaching note · required below 5 stars</div>' +
          recPart +
          '<details id="typed-dt"' + (typedOpen ? ' open' : '') + ' style="margin-top:var(--s2)">' +
            '<summary class="sub" style="cursor:pointer; color:var(--brand); font-weight:600">typed fallback (logged accessibility exception)</summary>' +
            '<textarea id="typed-in" class="input" rows="3" style="margin-top:var(--s2)" ' +
              'aria-label="Typed coaching note" ' +
              'placeholder="A warm, specific note — minimum 120 characters, so it lands the way a voice note would.">' + HV.esc(typed) + '</textarea>' +
            '<div class="audit" id="typed-count">' + typed.length + ' / 120 characters minimum · logged as accessibility exception</div>' +
          '</details>' +
        '</div>';
    } else if (chosen === 5) {
      noteHtml = '<div class="audit">A perfect plate needs no correction note. One tap publishes the celebration.</div>';
    }

    const submitLabel = c.observation
      ? 'Record rating (team only)'
      : 'Publish rating to ' + HV.esc(c.name.split(' ')[0]);
    const submit =
      '<button class="btn block" id="submit-btn"' + (canSubmit() ? '' : ' disabled') + '>' + submitLabel + '</button>' +
      '<div class="audit" style="text-align:center">No auto-publish, ever — the client only sees your human-confirmed rating.</div>';

    return '<div class="card" style="display:flex; flex-direction:column; gap:var(--s3)">' +
      banner + head +
      HV.ui.mealArt(m, 'lg') +
      context + aidraft + starsHtml + macros + noteHtml + submit +
      '</div>';
  }

  /* status-by-exception rubric on an already-rated plate — met stays silent,
     only a miss carries the flag (the ribbon text IS the miss value, per the
     rubric's own wording). Rubric values may drift in shape over time, so
     anything not "N / N"-shaped is skipped rather than guessed at. */
  function ratedCard(m) {
    const c = HV.client(m.clientId);
    const rubric = m.final.rubric || {};
    const tiles = Object.keys(rubric).map(key => {
      const value = rubric[key];
      if (typeof value !== 'string' || !/^\d+\s*\/\s*\d+/.test(value)) return '';
      return HV.ui.gate(HV.ui.icon('check'), key, value, value.indexOf('0 /') === 0 ? value : null);
    }).filter(Boolean).join('');
    return '<div class="card" style="display:flex; flex-direction:column; gap:var(--s3)">' +
      '<div class="row">' + HV.ui.mealArt(m, 'sm') +
        '<span style="flex:1; min-width:0"><b>' + HV.esc(c.name) + '</b> — ' + HV.esc(m.slot) +
        '<small>captured ' + HV.esc(HV.ago(m.capturedMinsAgo)) + '</small></span>' +
        HV.ui.stars(m.final.stars) +
      '</div>' +
      '<div class="gate-grid">' + tiles + '</div>' +
    '</div>';
  }

  function draw(el) {
    const queue = getQueue();
    const rated = getRated();
    const ratedSection = rated.length
      ? '<div class="sec-title" style="margin-top:var(--s5)">Rated recently</div>' +
        '<div class="list">' + rated.map(ratedCard).join('') + '</div>'
      : '';
    const breached = queue.filter(m => {
      const l = HV.slaLeft(m);
      return l != null && l < 0;
    }).length;

    /* body only — the host (Queues, or this module's own view) draws the h1 */
    const header =
      '<div class="grid3">' +
        '<div class="stat"><div class="k">Waiting</div><div class="v num">' + queue.length + '</div><div class="sub">photos in the queue</div></div>' +
        '<div class="stat"><div class="k">Past reply target</div><div class="v num' + (breached ? ' bad' : '') + '">' + breached + '</div><div class="sub">' + (breached ? 'escalation notices sent' : 'none right now') + '</div></div>' +
        '<div class="stat"><div class="k">Median turnaround</div><div class="v num">9</div><div class="sub">minutes today</div></div>' +
      '</div>' +
      ladderLine();

    if (!queue.length) {
      selId = null;
      el.innerHTML = header +
        '<div class="empty"><span class="big">' + HV.ui.icon('check') + '</span>All meals rated — median turnaround today: <span class="num">9</span> min.</div>' +
        ratedSection;
      return;
    }

    /* keep a valid selection; reset per-meal state when it moves */
    if (!selId || !queue.some(m => m.id === selId)) {
      selId = queue[0].id;
      resetMealState(queue[0]);
    }
    const meal = HV.store.meals.find(m => m.id === selId);
    const client = HV.client(meal.clientId);

    el.innerHTML = header +
      '<div class="split">' +
        '<div><div class="sec-title">Waiting for review</div>' +
          '<div class="list">' + queue.map(queueRow).join('') + '</div></div>' +
        '<div><div class="sec-title">Review &amp; rating composer</div>' + reviewPane(meal) + '</div>' +
      '</div>' +
      ratedSection;

    /* ---- wiring ---- */
    el.querySelectorAll('[data-mid]').forEach(b => b.addEventListener('click', () => {
      if (selId !== b.dataset.mid) {
        selId = b.dataset.mid;
        resetMealState(HV.store.meals.find(m => m.id === selId));
        draw(el);
      }
    }));

    el.querySelectorAll('[data-star]').forEach(b => b.addEventListener('click', () => {
      chosen = parseInt(b.dataset.star, 10);
      draw(el);
    }));

    const pr = el.querySelector('#pr-in');
    if (pr) pr.addEventListener('input', () => { protein = pr.value; });
    const kc = el.querySelector('#kc-in');
    if (kc) kc.addEventListener('input', () => { kcal = kc.value; });

    const rec = el.querySelector('#rec-btn');
    if (rec) rec.addEventListener('click', () => {
      voiceRec = true;
      HV.toast('Voice note recorded, 0:14');
      draw(el);
    });
    const rerec = el.querySelector('#rerec-btn');
    if (rerec) rerec.addEventListener('click', () => { voiceRec = false; draw(el); });

    const dt = el.querySelector('#typed-dt');
    if (dt) dt.addEventListener('toggle', () => { typedOpen = dt.open; });
    const ta = el.querySelector('#typed-in');
    if (ta) ta.addEventListener('input', () => {
      typed = ta.value;
      const cnt = el.querySelector('#typed-count');
      if (cnt) cnt.textContent = typed.length + ' / 120 characters minimum · logged as accessibility exception';
      const sb = el.querySelector('#submit-btn');
      if (sb) sb.disabled = !canSubmit();
    });

    const sb = el.querySelector('#submit-btn');
    if (sb) sb.addEventListener('click', () => {
      if (canSubmit()) submitRating(el, meal, client);
    });
  }

  HV.registerBoard('meals', {
    label: 'Meals',
    roles: ['dietitian', 'admin', 'opshead', 'opsmgr', 'core'],
    count() { return HV.store.meals.filter(m => !m.final).length; },
    mount(el) { draw(el); },
  });
})();
