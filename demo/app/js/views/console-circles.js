/* HAALVING console — HV.chatui, the one Care Circle thread renderer.
   The circle itself is no longer a screen of its own: it is the Circle tab of
   the Clients workspace (console-clients.js), and #/circles/<id> aliases to
   #/clients/<id>/circle in the router. What survives here is the engine every
   host shares — how a message becomes a bubble, how a meal opens, and the
   composer whose Send always carries a named human's signature.
   Consumers call HV.chatui inside render() only: this file parses after some
   of them, but every render() fires after all scripts have loaded. */
(function () {
  'use strict';

  function first(name) { return String(name || '').split(' ')[0]; }

  function mealById(id) {
    return HV.store.meals.find(function (m) { return m.id === id; });
  }

  function circleMsgs(cid) { return HV.store.circles[cid] || []; }

  /* ---------------- message renderers (shared via HV.chatui) ---------------- */

  function teamonlyHtml(m, c) {
    const w = m.fromId === 'ai' ? 'Copilot' : (HV.staff(m.fromId) ? HV.staff(m.fromId).name : 'Team');
    return '<div class="teamonly">' +
      '<span class="lbl">' + HV.ui.icon('lock') + ' Team only — ' +
        (c ? HV.esc(first(c.name)) + ' never sees this' : 'the client never sees this') + '</span>' +
      '<b>' + HV.esc(w) + ':</b> ' + HV.esc(m.text) +
      '<div class="audit" style="margin-top:var(--s1)">' + HV.esc(HV.ago(m.minsAgo)) + ' · internal lane</div>' +
    '</div>';
  }

  /* an approved artifact delivered into the thread — an attachment row, not a bubble */
  function docHtml(m) {
    return '<div class="trow" style="align-self:stretch">' +
      HV.ui.iconTile('doc') +
      '<span class="grow"><b>' + HV.esc(m.text) + '</b>' +
      '<small>Published to plan · ' + HV.esc(HV.ago(m.minsAgo)) + '</small></span>' +
    '</div>';
  }

  function msgHtml(m, c, me) {
    if (m.kind === 'teamonly') return teamonlyHtml(m, c);
    if (m.kind === 'doc') return docHtml(m);
    /* an announcement the Community page sent — a send, not a conversation,
       so it is a row rather than a bubble. Staff see WHO sent it; the client
       sees only HAALVING. Without this branch it falls through to a plain
       bubble and silently drops its picture and its link. */
    if (m.kind === 'promo') {
      /* provenance has to be TRUE. A workflow step is not somebody sending an
         announcement from Community, and saying so would credit a coach with
         a message they never wrote — so an automated post names its template
         instead and says plainly that nobody typed it. */
      const prov = m.auto
        ? 'Sent automatically · ' + HV.esc(m.flowName || 'workflow') +
          ', step ' + ((m.stepIx || 0) + 1) + ' · nobody typed this'
        : 'Sent by ' + HV.esc(HV.staff(m.fromId).name) + ' from Community';
      return '<div class="trow">' + HV.ui.iconTile(m.auto ? 'sparkle' : m.notice ? 'bell' : 'send', 'sm') +
        '<div class="grow"><b>' + HV.esc(m.title || 'Announcement') + '</b> ' +
        HV.ui.pill(m.notice ? 'Service notice' : m.auto ? 'Automated' : 'Announcement',
                   m.notice ? 'warn' : m.auto ? 'neutral' : 'info') +
        (m.link && m.link.href ? ' ' + HV.ui.pill('Link', 'neutral') : '') +
        (m.img || (m.media && m.media.src) ? ' ' + HV.ui.pill('Picture', 'neutral') : '') +
        /* the same .richb + HV.md the client gets. Escaping it here printed
           the raw dialect — "They **walk, garden and climb stairs**" — so the
           console showed asterisks for the exact text the client saw in bold,
           and a coach could not proof-read what was actually sent. */
        '<div class="richb">' + HV.md(m.text || '') + '</div>' +
        '<div class="audit" style="margin-top:var(--s1)">' + prov + '</div></div>' +
        '<small class="num" style="flex:none">' + HV.ago(m.minsAgo) + '</small></div>';
    }

    const mine = m.fromId === me.id;
    const cls = mine ? 'me' : 'them';
    let who;
    if (m.fromId === 'client') who = c ? c.name : 'Client';
    else if (mine) who = 'You · ' + ((HV.roleDef(me.role) || {}).title || me.role);
    else {
      const u = HV.staff(m.fromId);
      who = u ? u.name + ' · ' + ((HV.roleDef(u.role) || {}).title || u.role) : 'Team';
    }

    let body = HV.esc(m.text);
    if (m.kind === 'meal') {
      const meal = mealById(m.mealId);
      if (meal) {
        body = '<span class="row" style="align-items:flex-start">' +
          HV.ui.mealArt(meal, 'sm') +
          '<span>' + HV.esc(m.text) + '<br><small style="color:var(--ink-2)">' + HV.esc(meal.dishes.join(', ')) + '</small><br>' +
          '<button class="sub" data-meal="' + HV.esc(meal.id) + '" style="color:var(--brand);font-weight:600">View photo &amp; details</button></span>' +
        '</span>';
      }
    } else if (m.kind === 'rating') {
      const meal = mealById(m.mealId);
      const stars = meal ? (meal.final ? meal.final.stars : meal.ai.stars) : null;
      body = HV.esc(m.text) +
        (stars ? '<div style="margin-top:var(--s1)">' + HV.ui.stars(stars) + '</div>' : '') +
        (meal && meal.final && meal.final.voiceSec ? '<div style="margin-top:var(--s2)">' + HV.ui.voice(meal.final.voiceSec) + '</div>' : '');
    } else if (m.kind === 'assess') {
      /* the onboarding assessment ask — the CTA belongs to the client; the
         console mirrors its state. Poorna's door books a call; the AI-led
         plans run the chat assessment, and the pills say which. */
      const call = c && c.plan === 'poorna';
      body = HV.esc(m.text) + '<div style="margin-top:var(--s1)">' +
        (m.done
          ? HV.ui.pill(call ? 'Assessment call booked' : 'Assessment complete', 'ok')
          : HV.ui.pill(call ? 'Awaiting booking' : 'Awaiting assessment', 'warn')) + '</div>';
    } else if (m.kind === 'rich') {
      /* the same .richb wrapper the client view uses — without it the
         bullet spans render inline and the lines run together */
      body = '<div class="richb">' + HV.md(m.text) + '</div>';
    } else if (m.kind === 'media') {
      /* the console reads the caption; the media itself is the client's view */
      body = HV.esc(m.text) + '<div style="margin-top:var(--s1)">' +
        HV.ui.pill(m.media && m.media.type === 'video' ? 'Video'
          : m.media && m.media.type === 'gif' ? 'GIF' : 'Photo', 'info') + '</div>';
    } else if (m.kind === 'choice' || m.kind === 'multi' || m.kind === 'grade') {
      /* assessment questions mirror as question + answer state */
      const ans = (m.opts || []).filter(function (o) {
        return m.kind === 'multi' ? (m.answers || []).indexOf(o.k) >= 0 : m.answer === o.k;
      }).map(function (o) { return o.label; }).join(', ');
      body = HV.esc(m.text) + '<div style="margin-top:var(--s1)">' +
        (m.done ? HV.ui.pill('Answered · ' + ans, 'ok') : HV.ui.pill('Awaiting reply', 'warn')) + '</div>';
    }

    /* the standing rules post plain text under a real staff name — the sender
       is honest, but a coach must be able to tell at a glance which lines they
       actually wrote and which a rule sent for them */
    return '<div class="msg ' + cls + '"><span class="who">' + HV.esc(who) +
      (m.auto ? ' · automated' : '') + '</span>' + body +
      '<span class="when">' + HV.esc(HV.ago(m.minsAgo)) + '</span></div>';
  }

  /* ---------------- meal detail sheet ---------------- */

  function openMealSheet(mealId) {
    const m = mealById(mealId);
    if (!m) { HV.toast('That meal is not in this demo slice'); return; }
    const c = HV.client(m.clientId);
    HV.sheet(
      HV.ui.mealArt(m, 'lg') +
      '<div class="h1-row"><div>' +
        '<div class="h1">' + HV.esc(m.slot) + ' · ' + HV.esc(c ? c.name : '') + '</div>' +
        '<div class="sub">Captured ' + HV.esc(HV.ago(m.capturedMinsAgo)) + ' · Fullness: ' + HV.esc(m.fullness) + '</div>' +
      '</div>' + (m.final ? HV.ui.stars(m.final.stars) : HV.ui.pill('Awaiting rating', 'warn')) + '</div>' +
      '<div>' + m.dishes.map(function (d) { return '<span class="chip">' + HV.esc(d) + '</span>'; }).join('') + '</div>' +
      HV.ui.aidraft('Detected: ' + HV.esc(m.ai.detected.join(', ')) + ' · ' + HV.esc(m.ai.note) +
        ' <span class="sub">(confidence <span class="num">' + m.ai.conf + '%</span>)</span>') +
      (m.final && m.final.note ? '<div class="notice"><b>Coach note</b> — ' + HV.esc(m.final.note) + '</div>' : '') +
      '<button class="btn block" id="ms-close">Close</button>',
      function (sheet) { sheet.querySelector('#ms-close').addEventListener('click', HV.closeSheet); }
    );
  }

  /* ---------------- HV.chatui — the one thread/composer renderer ---------------- */

  HV.chatui = {
    /* full message list: pinned cards on top, then the chat lane.
       opts.teamonly === false strips the amber lane and its messages. */
    thread: function (cid, opts) {
      const me = HV.me();
      const c = HV.client(cid);
      const showTeam = !opts || opts.teamonly !== false;
      const msgs = circleMsgs(cid).filter(function (m) { return showTeam || m.kind !== 'teamonly'; });
      const pinned = msgs.filter(function (m) { return m.kind === 'card'; });
      const lane = msgs.filter(function (m) { return m.kind !== 'card'; });
      return pinned.map(function (m) { return '<div class="notice"><b>Pinned</b> — ' + HV.esc(m.text) + '</div>'; }).join('') +
        '<div class="chat">' + lane.map(function (m) { return msgHtml(m, c, me); }).join('') + '</div>';
    },

    wire: function (el, cid) {
      el.addEventListener('click', function (e) {
        const meal = e.target.closest('[data-meal]');
        if (meal) openMealSheet(meal.dataset.meal);
      });
    },

    /* every element id carries idPrefix so two composers never collide */
    composer: function (idPrefix, opts) {
      const team = !opts || opts.teamonly !== false;
      const ph = (opts && opts.placeholder) || 'Write a message…';
      return '<div class="composer" style="flex-wrap:wrap">' +
        '<input class="input" id="' + HV.esc(idPrefix) + '-input" placeholder="' + HV.esc(ph) + '" aria-label="' + HV.esc(ph) + '" style="flex:1 1 12em">' +
        '<button class="btn" id="' + HV.esc(idPrefix) + '-sendclient">Send to client thread</button>' +
        (team ? '<button class="btn quiet" id="' + HV.esc(idPrefix) + '-sendteam">' + HV.ui.icon('lock') + 'Team only</button>' : '') +
      '</div>';
    },

    wireComposer: function (el, cid, idPrefix) {
      const input = el.querySelector('#' + idPrefix + '-input');
      const c = HV.client(cid);
      function send(kind) {
        const v = input ? input.value.trim() : '';
        if (!v) { HV.toast('Write a line first. Nothing sends on its own.'); return; }
        HV.pushMsg(cid, { fromId: HV.me().id, kind: kind, text: v });
        HV.markRead(cid);
        HV.refresh();
        HV.toast(kind === 'teamonly'
          ? 'Posted to the internal thread. The client cannot see it.'
          : 'Sent to ' + first(c ? c.name : 'the client') + '. Visible in their app now.');
        /* refresh rebuilt the DOM — hand focus back to this composer's input */
        const ni = document.getElementById(idPrefix + '-input');
        if (ni) ni.focus();
      }
      const sendC = el.querySelector('#' + idPrefix + '-sendclient');
      if (sendC) sendC.addEventListener('click', function () { send('text'); });
      const sendT = el.querySelector('#' + idPrefix + '-sendteam');
      if (sendT) sendT.addEventListener('click', function () { send('teamonly'); });
    },
  };
})();
