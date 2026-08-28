/* CH-03 · My Circle — the client's side of the circle thread.
   Plan-aware: Poorna shows the human pod; Svayam is the AI coach speaking to
   the client directly, plus any human coaches they have added per pillar.
   The thread is kept in day-sessions: each day is one session, and the screen
   shows the current session only. Everything older lives behind the
   "See chat history" button — sessions listed newest to oldest.
   RBAC boundary: messages with kind 'teamonly' are console-only (CC-08) and are
   filtered out here BEFORE rendering — they must never reach the client's DOM. */
(function () {
  'use strict';

  function mealById(id) { return HV.store.meals.find(m => m.id === id); }

  /* `m` is optional and only an automated message needs it. A standing rule
     posts through a real staff seat so the STORE keeps honest attribution —
     but to the client that message was written by nobody, and signing it
     "Anita R. · Super Admin" both credits a person who never typed it and
     leaks an internal role title into a client's thread. Same contract the
     promo card already keeps: the store records who, the client sees HAALVING. */
  function whoLabel(userId, m) {
    if (m && m.auto) return 'HAALVING · automated';
    const u = HV.staff(userId);
    if (!u) return 'Your team';
    if (u.ai) return 'HAALVING AI coach';
    const role = HV.roleDef(u.role);
    return HV.esc(u.name) + ' · ' + HV.esc(role ? role.title : 'Team');
  }

  function when(m) {
    return '<span class="when">' + HV.esc(HV.ago(m.minsAgo)) + '</span>';
  }

  /* a message's session: how many whole days ago it happened. The label is
     template text, never user data — the numeral wears the data face. */
  const dayOf = m => Math.floor((m.minsAgo || 0) / 1440);
  const dayLabel = d => d === 0 ? 'Today' : d === 1 ? 'Yesterday' : '<span class="num">' + d + '</span> days ago';

  /* incoming bubbles sit on white, so the brand link reads; outgoing bubbles
     invert via the .msg.me a rule and need no inline colour */
  const LINK_STYLE = 'display:inline-block;margin-top:var(--s2);font-size:var(--t-xs);font-weight:600;color:var(--brand)';

  function renderMsg(m) {
    /* pinned card */
    if (m.kind === 'card') {
      return '<div class="card" style="font-size:var(--t-sm)">' +
        '<span class="k">Pinned</span>' +
        '<div style="margin-top:3px">' + HV.esc(String(m.text).replace(/^Pinned:\s*/, '')) + '</div>' +
        '<span class="sub">' + HV.esc(HV.ago(m.minsAgo)) + '</span>' +
      '</div>';
    }

    /* an announcement from the console's Community page — the house speaking
       to many people at once. Two rules it is built around:

       It is NOT a .msg bubble. An offer that borrows a coach's bubble is
       pretending to be a message from someone who knows your story, which is
       the one thing it must never look like. It wears its own card and says
       HAALVING on it.

       It signs HAALVING, not whoLabel(m.fromId, m) — even though fromId is a
       real staff id. Internally the sender stays honest (the console shows
       who sent it); to the client an announcement is the organisation
       speaking, not a person. Reusing whoLabel would also put a coach's name
       and title on an advertisement. */
    if (m.kind === 'promo') {
      const md = m.media;
      let art = '';
      if (md && md.src) {
        art = '<div class="mwrap">' +
          (md.type === 'video'
            ? '<video controls playsinline preload="metadata"' +
              (md.poster ? ' poster="' + HV.esc(md.poster) + '"' : '') +
              ' src="' + HV.esc(md.src) + '" aria-label="' + HV.esc(md.alt || 'Video') + '"></video>'
            : '<img src="' + HV.esc(md.src) + '" alt="' + HV.esc(md.alt || '') + '" loading="lazy">') +
          (md.type === 'gif' ? '<span class="mtag" aria-hidden="true">GIF</span>' : '') +
        '</div>';
      } else if (m.img) {
        art = '<div class="mwrap"><img src="' + HV.esc(m.img) + '" alt="" loading="lazy"></div>';
      }
      /* an automated post says so on its own face. The console's Automations
         pad has promised this in writing since v79 — "every automated message
         lands in the timeline stamped automated" — and until now nothing
         carried the stamp, so a scheduled post was indistinguishable from one
         a coach sat down and wrote. */
      return '<div class="promo' + (m.notice ? ' notice-lane' : '') + '">' +
        '<span class="k">HAALVING · ' +
          (m.notice ? 'Service notice' : m.auto ? 'Automated' : 'Announcement') + '</span>' +
        art +
        (m.title ? '<b class="ptitle">' + HV.esc(m.title) + '</b>' : '') +
        '<div class="richb">' + HV.md(m.text || '') + '</div>' +
        (m.link && m.link.href
          ? '<a href="' + HV.esc(m.link.href) + '" style="' + LINK_STYLE + '">' +
            HV.esc(m.link.label || 'See in Community') + ' →</a>'
          : '') +
        '<span class="sub">' + HV.esc(HV.ago(m.minsAgo)) + '</span>' +
      '</div>';
    }

    /* the assessment door — the first ask of every new client's journey.
       Two doors, one message kind: Poorna's assessment is a guided CALL
       with the care team (the button books it); the AI-led plans run the
       conversational assessment right here in the thread, where a
       half-finished run turns the button into a Continue. */
    if (m.kind === 'assess') {
      const c = HV.myClient();
      const call = c && c.plan === 'poorna';
      const label = call ? 'Book my assessment'
        : m.started ? 'Continue assessment' : 'Start assessment';
      return '<div class="msg them">' +
        '<span class="who">' + whoLabel(m.fromId, m) + '</span>' +
        HV.esc(m.text) +
        (m.done
          ? '<div style="margin-top:var(--s2)">' + HV.ui.pill(call ? 'Assessment call booked' : 'Assessment complete', 'ok') + '</div>'
          : '<button class="btn assess-go" data-assess="' + HV.esc(m.id) + '">' + label + '</button>') +
        when(m) +
      '</div>';
    }

    /* rich text — the tiny **bold** / _italic_ / bullet dialect (HV.md) */
    if (m.kind === 'rich') {
      return '<div class="msg them">' +
        '<span class="who">' + whoLabel(m.fromId, m) + '</span>' +
        '<div class="richb">' + HV.md(m.text) + '</div>' +
        when(m) +
      '</div>';
    }

    /* media — an image, a looping gif, or a video, with the caption below */
    if (m.kind === 'media') {
      const md = m.media || {};
      let inner;
      if (md.type === 'video') {
        inner = '<video controls playsinline preload="metadata"' +
          (md.poster ? ' poster="' + HV.esc(md.poster) + '"' : '') +
          ' src="' + HV.esc(md.src) + '" aria-label="' + HV.esc(md.alt || 'Video') + '"></video>';
      } else {
        /* an animated webp loops by itself — exactly how a gif behaves */
        inner = '<img src="' + HV.esc(md.src) + '" alt="' + HV.esc(md.alt || '') + '">';
      }
      return '<div class="msg them">' +
        '<span class="who">' + whoLabel(m.fromId, m) + '</span>' +
        '<div class="mwrap">' + inner +
          (md.type === 'gif' ? '<span class="mtag" aria-hidden="true">GIF</span>' : '') +
        '</div>' +
        (m.text ? '<div class="mcap">' + HV.esc(m.text) + '</div>' : '') +
        when(m) +
      '</div>';
    }

    /* the interactive kinds — quick-reply chips, MCQ lists, multi-select,
       and the posture self-grade ladder. Options stay visible after the
       answer (disabled, chosen one lit) so history reads like a story. */
    if (m.kind === 'choice' || m.kind === 'multi' || m.kind === 'grade') {
      const isMulti = m.kind === 'multi';
      const list = isMulti || m.kind === 'grade' || m.style === 'list';
      const on = k => isMulti ? (m.answers || []).indexOf(k) >= 0 : m.answer === k;
      const pips = band => '<span class="gpips" aria-hidden="true">' +
        [1, 2, 3, 4].map(i => '<i' + (i <= band ? ' class="on"' : '') + '></i>').join('') + '</span>';
      const opts = (m.opts || []).map(o =>
        '<button class="opt' + (on(o.k) ? ' on' : '') + '"' + (m.done ? ' disabled' : '') +
          ' data-' + (isMulti ? 'mopt' : 'opt') + '="' + HV.esc(m.id) + '" data-k="' + HV.esc(o.k) + '"' +
          (isMulti && !m.done ? ' aria-pressed="' + (on(o.k) ? 'true' : 'false') + '"' : '') + '>' +
          (m.kind === 'grade' ? pips(o.band || 0) : '') +
          '<span class="grow"><b>' + HV.esc(o.label) + '</b>' +
            (o.sub ? '<small>' + HV.esc(o.sub) + '</small>' : '') + '</span>' +
          (on(o.k) ? HV.ui.icon('check') : '') +
        '</button>').join('');
      return '<div class="msg them">' +
        '<span class="who">' + whoLabel(m.fromId, m) + '</span>' +
        (m.qn ? '<span class="astep">Question <span class="num">' + m.qn + '</span> of <span class="num">' + m.qt + '</span></span>' : '') +
        (m.img ? '<div class="mwrap"><img src="' + HV.esc(m.img) + '" alt="' + HV.esc(m.alt || 'The posture to try') + '"></div>' : '') +
        '<div' + (m.qn || m.img ? ' class="qtext"' : '') + '>' + HV.esc(m.text) + '</div>' +
        '<div class="opts' + (list ? ' list' : '') + '"' + (isMulti ? ' role="group" aria-label="Choose all that apply"' : '') + '>' + opts + '</div>' +
        (isMulti && !m.done ? '<button class="btn optdone" data-mdone="' + HV.esc(m.id) + '">That’s everything</button>' : '') +
        when(m) +
      '</div>';
    }

    /* meal photo the client sent — auto-filed to tracker + dietitian queue */
    if (m.kind === 'meal') {
      const ml = mealById(m.mealId);
      return '<div class="msg me">' +
        '<div class="attach">' +
          HV.ui.mealArt(ml, 'sm') +
          '<span class="grow"><b>' + HV.esc(m.text) + '</b>' +
            (ml ? '<span class="sub">' + HV.esc(ml.slot) + ' · ' + HV.esc(ml.dishes.join(', ')) + '</span>' : '') +
          '</span>' +
        '</div>' +
        '<a href="#/meal-detail/' + HV.esc(m.mealId) + '">View meal</a>' +
        when(m) +
      '</div>';
    }

    /* a star rating — human coaches attach a voice note; AI ratings are instant, text-only */
    if (m.kind === 'rating') {
      const ml = mealById(m.mealId);
      const stars = ml && ml.final ? ml.final.stars : (ml && ml.ai ? ml.ai.stars : 0);
      const secs = ml && ml.final ? (ml.final.voiceSec || 0) : 0;
      const fromAI = HV.staff(m.fromId).ai;
      return '<div class="msg them">' +
        '<span class="who">' + whoLabel(m.fromId, m) + '</span>' +
        HV.ui.stars(stars) +
        '<div style="margin-top:3px">' + HV.esc(m.text) + '</div>' +
        (fromAI || !secs ? '' : '<div style="margin-top:7px">' + HV.ui.voice(secs) + '</div>') +
        '<a href="#/meal-detail/' + HV.esc(m.mealId) + '" style="' + LINK_STYLE + '">See why →</a>' +
        when(m) +
      '</div>';
    }

    /* an approved artifact delivered into the thread — reads as a handed-over
       document, not a chat bubble */
    if (m.kind === 'doc') {
      return '<div class="msg them">' +
        '<span class="who">' + whoLabel(m.fromId, m) + '</span>' +
        '<div class="row" style="gap:var(--s3)">' +
          HV.ui.iconTile('doc', 'sm') +
          '<span class="grow"><b style="display:block;font-weight:600">' + HV.esc(m.text) + '</b>' +
            '<small class="sub" style="display:block">Published to your Plan</small>' +
          '</span>' +
        '</div>' +
        when(m) +
      '</div>';
    }

    /* plain text: client bubbles right, team bubbles left with who-line */
    if (m.fromId === 'client') {
      return '<div class="msg me">' + HV.esc(m.text) + when(m) + '</div>';
    }
    return '<div class="msg them">' +
      '<span class="who">' + whoLabel(m.fromId, m) + '</span>' +
      HV.esc(m.text) + when(m) +
    '</div>';
  }

  /* ── the assessment engine ────────────────────────────────────────────
     The flow lives in HV.store.assessFlow (a boot-refilled catalogue in
     data.js). Steps post as ordinary circle messages through HV.pushMsg —
     interactive kinds wait for the client, everything else posts together.
     On Poorna the speaker is Anita; a Poorna client never hears the AI. */
  const speakerOf = c => c.plan === 'poorna' ? 'u-anita' : 'ai';
  const INTERACTIVE = { choice: 1, multi: 1, grade: 1 };
  const flowOf = () => HV.store.assessFlow || [];
  const msgById = (c, id) => (HV.store.circles[c.id] || []).find(x => x.id === id);

  /* {name} {day} {flex} {balance} {truths} in step text pull from the run */
  function interp(client, run, text) {
    return String(text).replace(/\{(\w+)\}/g, (_, key) => {
      if (key === 'name') return client.name.split(' ')[0];
      const a = (run.ans || {})[key];
      return a ? a.labels.join(', ') : '—';
    });
  }

  function pushStep(client, step, run) {
    const msg = {
      fromId: speakerOf(client), kind: step.kind,
      text: interp(client, run, step.text), asStep: step.id,
    };
    /* opts are copied ONTO the message: history stays whole even if the
       catalogue's content changes under a later version */
    if (step.media) msg.media = step.media;
    if (step.opts) msg.opts = step.opts;
    if (step.style) msg.style = step.style;
    if (step.img) msg.img = step.img;
    if (step.save) {
      msg.save = step.save;
      const qs = flowOf().filter(s => s.save);
      msg.qn = qs.findIndex(s => s.id === step.id) + 1;
      msg.qt = qs.length;
    }
    HV.pushMsg(client.id, msg);
  }

  /* post steps from just after `afterId` (null = the top) until one waits
     for the client. Returns true when the flow ran off the end — finished. */
  function advance(client, afterId) {
    const flow = flowOf();
    const run = client.assessRun = client.assessRun || { ans: {} };
    let i = afterId ? flow.findIndex(s => s.id === afterId) + 1 : 0;
    for (; i < flow.length; i++) {
      pushStep(client, flow[i], run);
      if (INTERACTIVE[flow[i].kind]) return false;
    }
    return true;
  }

  /* the finish line: mark the door, file the reads on the record, and hand
     the coaches a team-only summary the client never sees */
  function finishAssess(client) {
    const run = client.assessRun;
    run.done = true;
    const door = (HV.store.circles[client.id] || []).find(x => x.kind === 'assess');
    if (door) door.done = true;
    const a = run.ans;
    client.assess = a;
    if (a.day && a.day.k) client.track = a.day.k;
    if (/assessment awaited/.test(client.riskWhy || '')) {
      client.riskWhy = 'observation — assessment-lite logged, live review ahead';
    }
    const line = k => a[k] ? a[k].labels.join(', ') : '—';
    HV.pushMsg(client.id, {
      fromId: speakerOf(client), kind: 'teamonly',
      text: 'Assessment-lite complete · movement: ' + line('day') +
        ' · forward fold: ' + line('flex') + (a.flex && a.flex.band ? ' (band ' + a.flex.band + '/4)' : '') +
        ' · balance: ' + line('balance') + ' · weekly truths: ' + line('truths') +
        '. Full battery at the live assessment.',
    });
    HV.save();
  }

  /* ── the review-day engine (R15) ─────────────────────────────────────
     A second flow source on the assessment's rails: reviewFlow steps post
     as ordinary circle messages tagged rvStep (+rvCy so cycles never
     cross), the SAME option wiring routes their answers back through
     answer(), and the finish files c.reviewAns[cycle] plus a team-only
     summary the client never sees. An answered cycle never re-invites —
     the invite reads c.reviewAns, not the thread. */
  const rvFlowOf = () => HV.store.reviewFlow || [];

  function pushReviewStep(client, step, run) {
    const msg = {
      fromId: speakerOf(client), kind: step.kind,
      text: interp(client, run, step.text), rvStep: step.id, rvCy: client.cycle,
    };
    /* opts are copied ONTO the message, exactly like the assessment:
       history stays whole even if the catalogue changes later */
    if (step.opts) msg.opts = step.opts;
    if (step.style) msg.style = step.style;
    if (step.save) {
      msg.save = step.save;
      const qs = rvFlowOf().filter(s => s.save);
      msg.qn = qs.findIndex(s => s.id === step.id) + 1;
      msg.qt = qs.length;
    }
    HV.pushMsg(client.id, msg);
  }

  function advanceReview(client, afterId) {
    const flow = rvFlowOf();
    const run = client.reviewRun = client.reviewRun || { cycle: client.cycle, ans: {} };
    let i = afterId ? flow.findIndex(s => s.id === afterId) + 1 : 0;
    for (; i < flow.length; i++) {
      pushReviewStep(client, flow[i], run);
      if (INTERACTIVE[flow[i].kind]) return false;
    }
    return true;
  }

  /* short console-facing labels for the summary line; the save key itself
     is the fallback, so a new catalogue question degrades gracefully */
  const RV_LABELS = {
    energy: 'energy', hardest: 'hardest habits', sleepq: 'sleep',
    confidence: 'confidence', change: 'one change', team: 'to the team',
  };

  function finishReview(client) {
    const run = client.reviewRun;
    run.done = true;
    client.reviewAns = client.reviewAns || {};
    client.reviewAns[client.cycle] = { ans: run.ans, ts: HV.now() };
    const line = k => {
      const a = run.ans[k];
      return a ? a.labels.join(', ') + (a.band ? ' (' + a.band + '/5)' : '') : '—';
    };
    const parts = rvFlowOf().filter(s => s.save)
      .map(s => (RV_LABELS[s.save] || s.save) + ': ' + line(s.save));
    HV.pushMsg(client.id, {
      fromId: speakerOf(client), kind: 'text',
      text: 'That’s everything — thank you. Your circle reads these before the review, so the meeting starts from your truth.',
    });
    HV.pushMsg(client.id, {
      fromId: speakerOf(client), kind: 'teamonly',
      text: HV.copy.reviewWord() + ' check-in complete · cycle ' + client.cycle + ' · ' + parts.join(' · '),
    });
    HV.save();
  }

  /* the invite's tap: start fresh, or pick the run back up exactly the
     way the assessment door does — an open question waits in the thread,
     a half state reposts from the last step the thread actually holds */
  function startReview(client) {
    if (!rvFlowOf().length) { HV.toast('Review content missing — reset demo data to reload it.'); return; }
    const run = client.reviewRun;
    if (run && run.cycle === client.cycle && !run.done) {
      const msgs = (HV.store.circles[client.id] || []).filter(x => x.rvCy === client.cycle);
      const pending = msgs.filter(x => INTERACTIVE[x.kind] && x.rvStep && !x.done).pop();
      if (pending) {
        HV.toast('Pick up where you left off — your next question is below.');
      } else {
        const lastStep = msgs.filter(x => x.rvStep).pop();
        const finished = advanceReview(client, lastStep ? lastStep.rvStep : null);
        if (finished) finishReview(client); else HV.save();
        HV.refresh();
      }
      settleFocus();
      return;
    }
    client.reviewRun = { cycle: client.cycle, ans: {} };
    HV.pushMsg(client.id, {
      fromId: speakerOf(client), kind: 'text',
      text: 'Before your ' + HV.copy.reviewWord() + ' review — six quick questions. Honest answers set the meeting’s starting point.',
    });
    const finished = advanceReview(client, null);
    if (finished) finishReview(client); else HV.save();
    HV.refresh();
    settleFocus();
  }

  /* one answer, of any interactive kind — assessment or review; the
     message's rvStep tag decides which run it belongs to. Echoes the
     client's words back as their own bubble, then advances that flow. */
  function answer(client, m, ks) {
    if (m.done) return;
    const isMulti = m.kind === 'multi';
    const chosen = (m.opts || []).filter(o => ks.indexOf(o.k) >= 0);
    if (!chosen.length) return;
    m.done = true;
    if (isMulti) m.answers = ks; else m.answer = ks[0];
    const isReview = !!m.rvStep;
    const run = isReview
      ? (client.reviewRun = client.reviewRun || { cycle: client.cycle, ans: {} })
      : (client.assessRun = client.assessRun || { ans: {} });
    if (m.save) {
      run.ans[m.save] = { k: ks[0], ks: ks, labels: chosen.map(o => o.label), band: chosen[0].band };
    }
    HV.pushMsg(client.id, { fromId: 'client', kind: 'text', text: chosen.map(o => o.label).join(' · ') });
    const aside = !isMulti && chosen[0].reply;
    if (aside) HV.pushMsg(client.id, { fromId: speakerOf(client), kind: 'text', text: aside });
    const finished = isReview ? advanceReview(client, m.rvStep) : advance(client, m.asStep);
    if (finished) { if (isReview) finishReview(client); else finishAssess(client); }
    else HV.save();
    HV.refresh();
    settleFocus();
    if (finished) {
      if (isReview) {
        HV.toast('Check-in shared with your circle — see you at the review.');
      } else {
        HV.celebrate('gauge', 'Assessment complete',
          'Your circle reviews these reads and confirms the level each pillar starts at.');
      }
    }
  }

  /* after a refresh the tapped button is gone — hand the keyboard to the
     next question's first option, or failing that the conversation itself */
  function settleFocus() {
    setTimeout(() => {
      const next = document.querySelector('#app [data-opt], #app [data-mopt]');
      if (next) { next.focus(); return; }
      const chat = document.querySelector('#app .chat');
      if (chat) { chat.setAttribute('tabindex', '-1'); chat.focus(); }
    }, 30);
  }

  /* Poorna's door: the assessment is a guided call with the care team —
     the sheet books it, Anita confirms it. The AI never runs this one. */
  function bookSheet(client, doorId) {
    HV.sheet(
      '<div class="h1">Your assessment</div>' +
      '<div class="sub">30 minutes on a call with your care team — the foundation of everything we build.</div>' +
      '<div class="card"><span class="k">What it covers</span>' +
        '<div class="trow">' + HV.ui.iconTile('user', 'sm') + '<span class="grow"><b>Your story</b><small>How you live, eat, move and rest today</small></span></div>' +
        '<div class="trow">' + HV.ui.iconTile('pulse', 'sm') + '<span class="grow"><b>Your vitals</b><small>Recent labs and medications, if you have them</small></span></div>' +
        '<div class="trow">' + HV.ui.iconTile('target', 'sm') + '<span class="grow"><b>Your goals</b><small>What the first cycles should move first</small></span></div>' +
      '</div>' +
      '<button class="btn block" id="as-go">Confirm — book my assessment</button>',
      sh => {
        sh.querySelector('#as-go').addEventListener('click', () => {
          const door = msgById(client, doorId);
          if (door) { door.done = true; door.booked = true; }
          HV.pushMsg(client.id, { fromId: 'client', kind: 'text', text: 'I’m ready — book me in.' });
          HV.pushMsg(client.id, {
            fromId: 'u-anita', kind: 'text',
            text: 'Booked. Your circle will confirm the exact slot shortly — keep any recent lab reports handy.',
          });
          HV.closeSheet();
          HV.refresh();
          settleFocus();
          HV.toast('Assessment requested — your circle will confirm the time.');
        });
      }
    );
  }

  /* wire a container's interactive messages — the thread or the history
     sheet. Answers from inside the sheet close it first: the continuation
     posts into today's session, which lives on the main screen. */
  function wireChat(container, client, inSheet) {
    const leaveSheet = () => { if (inSheet) HV.closeSheet(); };

    container.querySelectorAll('[data-assess]').forEach(b => b.addEventListener('click', () => {
      /* Poorna: a guided call with the care team, not a chat flow */
      if (client.plan === 'poorna') { leaveSheet(); bookSheet(client, b.dataset.assess); return; }
      if (!flowOf().length) { HV.toast('Assessment content missing — reset demo data to reload it.'); return; }
      const door = msgById(client, b.dataset.assess);
      if (client.assessRun && !client.assessRun.done) {
        leaveSheet();
        const msgs = HV.store.circles[client.id] || [];
        const pending = msgs.filter(x => INTERACTIVE[x.kind] && x.asStep && !x.done).pop();
        if (pending) {
          /* already underway — the open question is waiting in the thread */
          HV.toast('Pick up where you left off — your next question is below.');
        } else {
          /* a half state (an interrupted save, an older build): repost from
             the last step the thread actually holds instead of dead-ending */
          const lastStep = msgs.filter(x => x.asStep).pop();
          const finished = advance(client, lastStep ? lastStep.asStep : null);
          if (finished) finishAssess(client); else HV.save();
          HV.refresh();
        }
        settleFocus();
        return;
      }
      if (door) door.started = true;
      const finished = advance(client, null);   /* a flow of pure prose could end at once */
      if (finished) finishAssess(client); else HV.save();
      leaveSheet();
      HV.refresh();
      settleFocus();
    }));

    container.querySelectorAll('[data-opt]').forEach(b => b.addEventListener('click', () => {
      const m = msgById(client, b.dataset.opt);
      if (!m) return;
      leaveSheet();
      answer(client, m, [b.dataset.k]);
    }));

    /* multi-select toggles live in the DOM until Done commits them */
    container.querySelectorAll('[data-mopt]').forEach(b => b.addEventListener('click', () => {
      const pressed = b.getAttribute('aria-pressed') === 'true';
      b.setAttribute('aria-pressed', pressed ? 'false' : 'true');
      b.classList.toggle('on', !pressed);
    }));
    container.querySelectorAll('[data-mdone]').forEach(b => b.addEventListener('click', () => {
      const m = msgById(client, b.dataset.mdone);
      if (!m) return;
      const ks = [...container.querySelectorAll('[data-mopt="' + m.id + '"][aria-pressed="true"]')]
        .map(x => x.dataset.k);
      if (!ks.length) { HV.toast('Pick at least one — the closest truth counts.'); return; }
      leaveSheet();
      answer(client, m, ks);
    }));
  }

  function historySheet(sessions, client) {
    const inner = sessions.map((s, i) =>
      '<details class="sess"' + (i === 0 ? ' open' : '') + '>' +
        '<summary><b>' + dayLabel(s.day) + '</b><small class="num">' + s.msgs.length +
          (s.msgs.length === 1 ? ' message' : ' messages') + '</small>' + HV.ui.icon('chevR') + '</summary>' +
        '<div class="chat" style="margin-top:var(--s2)">' + s.msgs.map(renderMsg).join('') + '</div>' +
      '</details>').join('');
    HV.sheet(
      '<div class="h1">Chat history</div>' +
      '<div class="sub">Each day is a session — newest first.</div>' +
      inner +
      '<button class="btn block" id="hs-close" style="margin-top:var(--s4)">Close</button>',
      sh => {
        sh.querySelector('#hs-close').addEventListener('click', HV.closeSheet);
        wireChat(sh, client, true);
      });
  }

  HV.registerView('coach', {
    title: 'My Circle',
    roles: ['client'],
    render(el) {
      const client = HV.myClient();
      if (!client) {
        el.innerHTML = HV.ui.empty('leaf', 'We couldn’t find your record. Switch persona and try again.');
        return;
      }

      /* opening the thread marks the client caught up — markRead saves; never
         refresh here (a refresh inside render would loop). The dot already
         painted on the tab bar this render, so remove it from the DOM directly —
         it now just mirrors what markRead recorded. */
      HV.markRead(client.id);
      const dot = document.querySelector('.tabbar .dot');
      if (dot) dot.remove();

      /* RBAC boundary: strip team-only notes before anything touches the DOM */
      const thread = (HV.store.circles[client.id] || []).filter(m => m.kind !== 'teamonly');

      /* ── day-sessions ──
         Pinned cards stay pinned at the top, outside any session. Everything
         else groups by day; the screen carries the CURRENT session only, and
         the history sheet carries all of them, newest first. */
      const pinned = thread.filter(m => m.kind === 'card');
      const flow = thread.filter(m => m.kind !== 'card');
      const days = [...new Set(flow.map(dayOf))].sort((a, b) => a - b);
      const curDay = days.length ? days[0] : 0;
      const current = flow.filter(m => dayOf(m) === curDay);
      const sessions = days.map(d => ({ day: d, msgs: flow.filter(m => dayOf(m) === d) }));
      const older = sessions.length - (sessions.length ? 1 : 0);

      /* the page is My Circle on both plans; the sub-line is what flexes.
         Poorna names the full team. Svayam is AI-led, and its line names any
         human coaches the client has added per pillar — an empty list reads as
         the invitation to add one, which is the whole Svayam proposition. */
      const plan = client.plan || 'poorna';
      const title = 'My Circle';
      let sub = 'Your whole team reads this — Sneha, Vikram, Lakshmi, Meera, Dr. Kavya';
      if (plan === 'svayam') {
        const hp = client.humanPillars || [];
        /* humanPillars speaks pillar keys, pod speaks role keys — translate */
        const POD_KEY = { fitness: 'fitness', yoga: 'yoga', culture: 'dietitian', wellness: 'mind' };
        const names = hp.map(k => HV.staff((client.pod || {})[POD_KEY[k] || k]).name)
          .filter((n, i, a) => a.indexOf(n) === i).join(', ');
        const pillarNames = hp.map(k => (HV.PILLARS[k] ? HV.PILLARS[k].name : k)).join(', ');
        sub = names
          ? 'AI day-to-day · ' + names + ' on ' + pillarNames
          : 'AI → Client · add a human coach to any pillar, any time';
      }
      /* an observation Poorna circle is still being assembled — say so */
      if (plan === 'poorna' && client.observation) {
        sub = 'Your care team is being assembled around you';
      }

      /* ── the review-day invite ── pinned above the thread from day 8
         (so the day-8 personas can answer ahead of tomorrow's review);
         c.reviewAns[cycle] is the guard — an answered cycle never
         re-invites, and finishing removes the card on the next render */
      const rvDone = !!(client.reviewAns || {})[client.cycle];
      const rvUnderway = client.reviewRun &&
        client.reviewRun.cycle === client.cycle && !client.reviewRun.done;
      const reviewInvite = (client.day >= 8 && !rvDone)
        ? '<div class="card rv-invite">' +
            '<span class="k">Pinned</span>' +
            '<div class="trow">' + HV.ui.iconTile('gauge', 'sm') +
              '<span class="grow"><b>Day-<span class="num">9</span> review check-in</b>' +
              '<small>' + (client.day >= 9 ? 'Review today' : 'Review tomorrow') +
              ' — <span class="num">6</span> short questions</small></span>' +
            '</div>' +
            '<button class="btn block rv-go" data-review="1">' +
              (rvUnderway ? 'Continue check-in' : 'Start check-in') + '</button>' +
          '</div>'
        : '';

      el.innerHTML =
        '<style>' +
          '.rv-invite{margin-bottom:var(--s3)}' +
          '.rv-invite .trow{margin-top:var(--s2)}' +
          '.rv-invite .rv-go{margin-top:var(--s3)}' +
        '</style>' +
        HV.ui.sceneBand('THE ROOM', title, HV.esc(sub)) +
        '<div class="cc-tools">' +
          '<span class="sess-now">Session · ' + dayLabel(curDay) + '</span>' +
          (older > 0
            ? '<button class="chip" id="cc-history">' + HV.ui.icon('clock') + 'See chat history</button>'
            : '') +
        '</div>' +
        (client.observation
          ? '<div class="notice">Observation days 1–5: we’re simply learning your rhythm. Share photos and thoughts — no ratings yet, no judgement.</div>'
          : '') +
        reviewInvite +
        (pinned.length || current.length
          ? '<div class="chat">' + pinned.map(renderMsg).join('') + current.map(renderMsg).join('') + '</div>'
          : HV.ui.empty('chat', 'Your circle is quiet right now.', 'Say anything — someone who knows your story reads this.')) +
        '<div class="composer">' +
          '<div class="field">' +
            '<button class="ic" id="cc-emoji" type="button" aria-label="Emoji">' + HV.ui.icon('smile') + '</button>' +
            /* short visible placeholder (WhatsApp-style); the aria-label stays
               descriptive because screen readers announce it instead */
            '<input class="inp" id="cc-input" placeholder="Message" aria-label="Message your team" autocomplete="off">' +
            /* the clip retired into the quick-add sheet's last tile (TJ,
               9 Aug) — the [+] here opens the same sheet the Trackers FAB does */
            '<button class="ic" id="cc-plus" type="button" aria-label="Quick add — log sleep, mood, water, weight or attach a document">' + HV.ui.icon('plusbox') + '</button>' +
            '<button class="ic" id="cc-scan" type="button" aria-label="Scan a meal to log it">' + HV.ui.icon('scan') + '</button>' +
            '<button class="ic" id="cc-cam" type="button" aria-label="Take a meal photo">' + HV.ui.icon('camera') + '</button>' +
          '</div>' +
          '<button class="primary" id="cc-send" type="button" aria-label="Hold to record a voice note">' + HV.ui.icon('mic') + '</button>' +
        '</div>' +
        (plan === 'svayam'
          ? '<p class="sub" style="text-align:center;margin-top:10px"><button id="cc-human" style="color:var(--brand);font-weight:600">Talk to a human</button></p>'
          : '');

      const input = el.querySelector('#cc-input');
      /* Svayam clients chat with the AI directly — a warm canned reply keeps the
         demo alive. Poorna clients never get this: their AI works only behind
         the coaches, and those conversations are what trains the Svayam AI. */
      const aiReplies = HV.aiLeads(client);
      const first = client.name.split(' ')[0];
      const CANNED = [
        'Got it, ' + first + ' — noted in today’s log. I’m tracking everything in real time, so your plan adjusts as you go.',
        'Thanks for telling me, ' + first + '. I’ve folded that into today’s picture — nothing you need to do right now.',
        'Noted. Keep going, ' + first + ' — small consistent days are what move your score.',
      ];
      function send() {
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        HV.pushMsg(client.id, { fromId: 'client', kind: 'text', text: text });
        HV.refresh();
        /* the refresh rebuilt the composer — hand the keyboard straight back,
           the way a chat app never makes you re-find the input */
        const ni = document.getElementById('cc-input');
        if (ni) ni.focus();
        HV.toast('Sent to your Care Circle');
        if (aiReplies) {
          setTimeout(() => {
            const t = HV.store.circles[client.id];
            HV.pushMsg(client.id, { fromId: 'ai', kind: 'text', text: CANNED[t.length % CANNED.length] });
            /* this refresh can land mid-typing — carry the draft and the
               focus across it, or the reply eats the client's next message */
            const cur = document.getElementById('cc-input');
            const draft = cur ? cur.value : '';
            const had = cur && document.activeElement === cur;
            HV.refresh();
            const fresh = document.getElementById('cc-input');
            if (fresh && draft) { fresh.value = draft; fresh.dispatchEvent(new Event('input')); }
            if (fresh && had) fresh.focus();
          }, 600);
        }
      }
      /* the key swaps mic -> send the moment there is something to send */
      const sendBtn = el.querySelector('#cc-send');
      function syncKey() {
        const hasText = input.value.trim().length > 0;
        sendBtn.innerHTML = HV.ui.icon(hasText ? 'send' : 'mic');
        sendBtn.setAttribute('aria-label', hasText ? 'Send message' : 'Hold to record a voice note');
      }
      input.addEventListener('input', syncKey);
      sendBtn.addEventListener('click', () => {
        if (input.value.trim()) { send(); syncKey(); }
        else HV.toast('Hold to record. Voice notes reach your whole circle.');
      });
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { send(); syncKey(); } });

      el.querySelector('#cc-emoji').addEventListener('click', () => {
        input.focus();
        HV.toast('Emoji keyboard opens on your device');
      });
      el.querySelector('#cc-plus').addEventListener('click', () => HV.quickAdd(client));
      /* the two food routes both land in the meal logger */
      el.querySelector('#cc-scan').addEventListener('click', () => HV.go('#/meal'));
      el.querySelector('#cc-cam').addEventListener('click', () => HV.go('#/meal'));
      const humanBtn = el.querySelector('#cc-human');
      if (humanBtn) humanBtn.addEventListener('click', () =>
        HV.toast('A human coach will call within 2 hours. Safety escalations never wait.'));

      const histBtn = el.querySelector('#cc-history');
      if (histBtn) histBtn.addEventListener('click', () => historySheet(sessions, client));

      const rvBtn = el.querySelector('[data-review]');
      if (rvBtn) rvBtn.addEventListener('click', () => startReview(client));

      wireChat(el, client);

      /* land on the newest message (core scrolls to top after render, so defer) */
      setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 0);
    },
  });

  /* The console's announcement composer previews with THIS function, so the
     preview an operator approves is drawn by the same code that draws the
     real card in the client's thread — a hand-mocked preview disagrees with
     reality within about two changes. Same cross-view contract as
     HV.chatui in console-circles.js; call it inside render() only. */
  HV.clientMsgHtml = renderMsg;
})();
