/* HAALVING console view — Community (was "Tribe", renamed TJ 17 Aug).
   Authors the same HV.store.tribeFeed the client Community pages read
   (client-hive.js at #/tribe, client-tribe.js at #/tribe-classic), over six
   tabs that mirror the client's own structure rather than inventing a
   second one:

     CLIENT  #/tribe (honeycomb)          CONSOLE  #/community
       Health Games              ───────►   Game days
       Events & Challenges       ───────►   Gatherings · Challenges
       Haalving Zone                        Feed · Zones
         └ Common Canvas         ───────►     Feed
         └ My Zones              ───────►     Zones
       (lands in My Circle, not here) ───►   Announcements

   Announcements are the one OUTBOUND tab: they do not write tribeFeed at
   all, they push a card into many clients' own circles via HV.sendBroadcast
   (core.js). Sending needs `announceClients`, which only Super Admin and
   Ops Head hold — deliberately NOT the older `broadcast` perm, which means
   the STAFF announcements feed in People & Access and must not be widened
   into a licence to message every client on the platform.

   Content vs. state, the rule this whole file is built around: a gathering's
   title/when/where/desc/about/agenda/bring are CONTENT — this screen owns
   them. Whether a given client is going, joined, has answered a question, or
   has liked/commented on a post is MEMBER STATE — this screen only ever
   reads it (for the trailing count pill) and never writes it. A saved edit
   therefore always starts from the existing object and overwrites content
   keys only; a new object seeds its state fields to the same type the seed
   uses (going:false, joined:false, likes:[], comments:[], answered:null) so
   nothing downstream has to special-case a console-authored item.

   IDs are minted from one shared HV.store.tribeSeq counter (no Date.now /
   Math.random — same rule console-catalog.js's catSeq and console-
   schedule.js's taskSeq already follow), prefixed per collection so an event
   id can never collide with a post id.

   Posts: the "by" field is a STAFF SELECT (HAALVING the house account, or
   any non-client user) — this console can post as the team, not impersonate
   a client. Editing an existing, older post authored by a client (the seed
   has several) keeps that authorship as a locked extra option rather than
   silently reassigning it the moment an admin opens the sheet to fix a typo.
   Editing never touches an existing post's kind/img/quiz payload, only by +
   caption — so a photo or quiz post keeps its media when its caption is
   corrected.

   Game days: a day is edited as a whole — label, date, and its questions,
   each block read from the DOM on demand (on "Add question" and on Save)
   rather than wired field-by-field, so the "add question" affordance can
   just re-paint the question list. Existing questions keep their `answered`
   state because the draft is a deep copy of the day's own qs and only its
   q/opts/ans/why keys are ever overwritten. */
(function () {
  'use strict';

  var SECTIONS = [
    { key: 'gatherings', label: 'Gatherings' },
    { key: 'challenges', label: 'Challenges' },
    { key: 'quiz', label: 'Game days' },
    { key: 'feed', label: 'Feed' },
    { key: 'zones', label: 'Zones' },
    { key: 'announce', label: 'Announcements' },
  ];
  /* 'posts' was this tab's key before the Haalving Zone existed; the route
     alias in core.js rewrites #/tribe-admin/* to #/community/*, but an old
     link's SECTION word still says posts. Map it rather than 404 the tab. */
  var SECTION_ALIAS = { posts: 'feed' };

  /* seed images already shipped and precached — a console-authored gathering
     or challenge that skips the (unasked-for) image field still renders a
     real photograph instead of a broken <img src="undefined"> on the client
     honeycomb and feed pages, which read `img` with no fallback of their own */
  var DEFAULT_EVENT_IMG = 'img/onboard/bz-live.webp';
  var DEFAULT_CHALLENGE_IMG = 'img/onboard/fitness.webp';

  function feed() { return HV.store.tribeFeed; }
  function canManage() { return HV.can('manageTribe'); }
  function canDelete() {
    var me = HV.me();
    return canManage() && !!me && (me.role === 'admin' || me.role === 'opshead');
  }

  function nextId(prefix) {
    HV.store.tribeSeq = (HV.store.tribeSeq || 0) + 1;
    return prefix + '-x' + HV.store.tribeSeq;
  }

  /* ---------------- small field + parsing helpers ---------------- */

  function labeled(id, label, inputHtml) {
    return '<label class="field-label" for="' + id + '">' + HV.esc(label) + '</label>' + inputHtml;
  }
  function textInput(id, val, ph, extra) {
    return '<input class="input" id="' + id + '" value="' + HV.esc(val) + '"' +
      (ph ? ' placeholder="' + HV.esc(ph) + '"' : '') + (extra || '') + '>';
  }
  function numInput(id, val) {
    return '<input class="input" id="' + id + '" type="number" value="' + HV.esc(val) + '">';
  }
  function textArea(id, val, rows, ph) {
    return '<textarea class="input" id="' + id + '" rows="' + (rows || 3) + '"' +
      (ph ? ' placeholder="' + HV.esc(ph) + '"' : '') + '>' + HV.esc(val) + '</textarea>';
  }
  function countPill(n, label) {
    return '<span class="pill neutral"><span class="num">' + n + '</span> ' + HV.esc(label) + '</span>';
  }
  function linesToArr(text) {
    return String(text || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function arrToLines(arr) { return (arr || []).join('\n'); }
  function parsePairLines(text, k1, k2) {
    return String(text || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
      var i = l.indexOf('|');
      var o = {};
      o[k1] = (i === -1 ? l : l.slice(0, i)).trim();
      o[k2] = (i === -1 ? '' : l.slice(i + 1)).trim();
      return o;
    });
  }
  function pairLinesToText(arr, k1, k2) {
    return (arr || []).map(function (o) { return (o[k1] || '') + ' | ' + (o[k2] || ''); }).join('\n');
  }

  function editBtn(attr, id) {
    return '<button class="btn sm ghost" data-' + attr + '="' + HV.esc(id) + '">' + HV.ui.icon('pencil') + 'Edit</button>';
  }
  function delBtn(attr, id) {
    return '<button class="btn sm ghost" data-' + attr + '="' + HV.esc(id) + '" style="color:var(--danger); border-color:var(--danger)">' +
      HV.ui.icon('x') + 'Delete</button>';
  }

  /* ---------------- Gatherings (events) ---------------- */

  function findEvent(id) { return feed().events.filter(function (e) { return e.id === id; })[0] || null; }

  function eventRowHtml(e) {
    return '<div class="trow">' + HV.ui.iconTile('cal', 'sm') +
      '<div class="grow"><b>' + HV.esc(e.title) + '</b>' +
        '<small>' + HV.esc(e.when) + (e.where ? ' · ' + HV.esc(e.where) : '') + '</small></div>' +
      (e.going ? HV.ui.pill('Going', 'info') : '') +
      (canManage() ? editBtn('edit-ev', e.id) : '') +
      (canDelete() ? delBtn('del-ev', e.id) : '') +
    '</div>';
  }

  function renderEvents(body) {
    var list = feed().events;
    body.innerHTML =
      '<div class="row" style="justify-content:flex-end; margin-bottom:var(--s2)">' +
        (canManage() ? '<button class="btn" id="ev-add">' + HV.ui.icon('plus') + 'Add gathering</button>' : '') +
      '</div>' +
      '<div class="list">' + (list.length ? list.map(eventRowHtml).join('') :
        HV.ui.empty('cal', 'No gatherings yet.', 'Add one for members to enrol in.')) + '</div>';

    var add = body.querySelector('#ev-add');
    if (add) add.addEventListener('click', function () { openEventSheet(null); });
    body.querySelectorAll('[data-edit-ev]').forEach(function (b) {
      b.addEventListener('click', function () { openEventSheet(b.dataset.editEv); });
    });
    body.querySelectorAll('[data-del-ev]').forEach(function (b) {
      b.addEventListener('click', function () { openDeleteSheet('events', b.dataset.delEv, findEvent, 'gathering'); });
    });
  }

  function openEventSheet(id) {
    var isNew = !id;
    var existing = isNew ? null : findEvent(id);
    if (!isNew && !existing) return;
    var v = {
      title: existing ? existing.title : '',
      when: existing ? existing.when : '',
      where: existing ? existing.where : '',
      host: existing ? (existing.host || '') : '',
      spots: existing ? (existing.spots || '') : '',
      desc: existing ? (existing.desc || '') : '',
      about: existing ? arrToLines(existing.about) : '',
      agenda: existing ? pairLinesToText(existing.agenda, 't', 'v') : '',
      bring: existing ? arrToLines(existing.bring) : '',
    };
    HV.sheet(
      '<div class="h1">' + (isNew ? 'Add gathering' : 'Edit gathering') + '</div>' +
      labeled('ev-title', 'Title', textInput('ev-title', v.title, 'e.g. Full-moon beach walk')) +
      labeled('ev-when', 'When', textInput('ev-when', v.when, 'e.g. Sat · 7:30 PM')) +
      labeled('ev-where', 'Where', textInput('ev-where', v.where, 'e.g. Kovalam beach')) +
      labeled('ev-host', 'Host', textInput('ev-host', v.host, 'Who is leading this — optional')) +
      labeled('ev-spots', 'Places', textInput('ev-spots', v.spots, 'e.g. 20 places · kept small — optional')) +
      labeled('ev-desc', 'Description', textArea('ev-desc', v.desc, 3)) +
      labeled('ev-about', 'About — one paragraph per line', textArea('ev-about', v.about, 3, 'Optional — the long-read paragraphs')) +
      labeled('ev-agenda', 'The day — one stop per line, "time | detail"', textArea('ev-agenda', v.agenda, 3, 'e.g. 5:30 AM | Assemble at the pickup point')) +
      labeled('ev-bring', 'What to bring — one item per line', textArea('ev-bring', v.bring, 2, 'Optional')) +
      '<p class="audit">Who is enrolled is member state and is never changed here.</p>' +
      '<div class="row" style="justify-content:flex-end">' +
        '<button class="btn ghost" id="ev-cancel">Cancel</button>' +
        '<button class="btn" id="ev-save">' + (isNew ? 'Add gathering' : 'Save') + '</button>' +
      '</div>',
      function (sheet) {
        sheet.querySelector('#ev-cancel').addEventListener('click', HV.closeSheet);
        sheet.querySelector('#ev-save').addEventListener('click', function () {
          var title = sheet.querySelector('#ev-title').value.trim();
          if (!title) { HV.toast('Give the gathering a title first.'); return; }
          var item = existing || { id: nextId('ev'), going: false, img: DEFAULT_EVENT_IMG };
          item.title = title;
          item.when = sheet.querySelector('#ev-when').value.trim();
          item.where = sheet.querySelector('#ev-where').value.trim();
          var host = sheet.querySelector('#ev-host').value.trim();
          if (host) item.host = host; else delete item.host;
          var spots = sheet.querySelector('#ev-spots').value.trim();
          if (spots) item.spots = spots; else delete item.spots;
          item.desc = sheet.querySelector('#ev-desc').value.trim();
          item.about = linesToArr(sheet.querySelector('#ev-about').value);
          item.agenda = parsePairLines(sheet.querySelector('#ev-agenda').value, 't', 'v');
          item.bring = linesToArr(sheet.querySelector('#ev-bring').value);
          if (isNew) feed().events.unshift(item);
          HV.save();
          HV.closeSheet();
          HV.refresh();
          HV.toast(isNew ? 'Added — ' + title : 'Saved — ' + title);
        });
      }
    );
  }

  /* ---------------- Challenges ---------------- */

  function findChallenge(id) { return feed().challenges.filter(function (c) { return c.id === id; })[0] || null; }

  function challengeRowHtml(c) {
    return '<div class="trow">' + HV.ui.iconTile('flame', 'sm') +
      '<div class="grow"><b>' + HV.esc(c.title) + '</b>' +
        '<small><span class="num">' + c.days + '</span> days</small></div>' +
      (c.joined ? HV.ui.pill('Joined', 'info') : '') +
      (canManage() ? editBtn('edit-ch', c.id) : '') +
      (canDelete() ? delBtn('del-ch', c.id) : '') +
    '</div>';
  }

  function renderChallenges(body) {
    var list = feed().challenges;
    body.innerHTML =
      '<div class="row" style="justify-content:flex-end; margin-bottom:var(--s2)">' +
        (canManage() ? '<button class="btn" id="ch-add">' + HV.ui.icon('plus') + 'Add challenge</button>' : '') +
      '</div>' +
      '<div class="list">' + (list.length ? list.map(challengeRowHtml).join('') :
        HV.ui.empty('flame', 'No challenges yet.', 'Add one for the community to join.')) + '</div>';

    var add = body.querySelector('#ch-add');
    if (add) add.addEventListener('click', function () { openChallengeSheet(null); });
    body.querySelectorAll('[data-edit-ch]').forEach(function (b) {
      b.addEventListener('click', function () { openChallengeSheet(b.dataset.editCh); });
    });
    body.querySelectorAll('[data-del-ch]').forEach(function (b) {
      b.addEventListener('click', function () { openDeleteSheet('challenges', b.dataset.delCh, findChallenge, 'challenge'); });
    });
  }

  function openChallengeSheet(id) {
    var isNew = !id;
    var existing = isNew ? null : findChallenge(id);
    if (!isNew && !existing) return;
    var v = {
      title: existing ? existing.title : '',
      days: existing ? existing.days : 11,
      host: existing ? (existing.host || '') : '',
      stake: existing ? (existing.stake || '') : '',
      desc: existing ? (existing.desc || '') : '',
      about: existing ? arrToLines(existing.about) : '',
      how: existing ? arrToLines(existing.how) : '',
      arc: existing ? pairLinesToText(existing.arc, 'k', 'v') : '',
    };
    HV.sheet(
      '<div class="h1">' + (isNew ? 'Add challenge' : 'Edit challenge') + '</div>' +
      labeled('ch-title', 'Title', textInput('ch-title', v.title, 'e.g. Table before eight')) +
      labeled('ch-days', 'Days', numInput('ch-days', v.days)) +
      labeled('ch-host', 'Host', textInput('ch-host', v.host, 'Who set this — optional')) +
      labeled('ch-stake', 'At stake', textInput('ch-stake', v.stake, 'What finishing earns — optional')) +
      labeled('ch-desc', 'Description', textArea('ch-desc', v.desc, 3)) +
      labeled('ch-about', 'About — one paragraph per line', textArea('ch-about', v.about, 3, 'Optional — the long-read paragraphs')) +
      labeled('ch-how', 'How it works — one line per rule', textArea('ch-how', v.how, 3, 'Optional')) +
      labeled('ch-arc', 'How the days go — one line per stretch, "days | detail"', textArea('ch-arc', v.arc, 2, 'e.g. Days 1–3 | Finding the slot')) +
      '<p class="audit">Who has joined is member state and is never changed here.</p>' +
      '<div class="row" style="justify-content:flex-end">' +
        '<button class="btn ghost" id="ch-cancel">Cancel</button>' +
        '<button class="btn" id="ch-save">' + (isNew ? 'Add challenge' : 'Save') + '</button>' +
      '</div>',
      function (sheet) {
        sheet.querySelector('#ch-cancel').addEventListener('click', HV.closeSheet);
        sheet.querySelector('#ch-save').addEventListener('click', function () {
          var title = sheet.querySelector('#ch-title').value.trim();
          if (!title) { HV.toast('Give the challenge a title first.'); return; }
          var item = existing || { id: nextId('ch'), joined: false, img: DEFAULT_CHALLENGE_IMG };
          item.title = title;
          item.days = Number(sheet.querySelector('#ch-days').value) || 1;
          var host = sheet.querySelector('#ch-host').value.trim();
          if (host) item.host = host; else delete item.host;
          var stake = sheet.querySelector('#ch-stake').value.trim();
          if (stake) item.stake = stake; else delete item.stake;
          item.desc = sheet.querySelector('#ch-desc').value.trim();
          item.about = linesToArr(sheet.querySelector('#ch-about').value);
          item.how = linesToArr(sheet.querySelector('#ch-how').value);
          item.arc = parsePairLines(sheet.querySelector('#ch-arc').value, 'k', 'v');
          if (isNew) feed().challenges.unshift(item);
          HV.save();
          HV.closeSheet();
          HV.refresh();
          HV.toast(isNew ? 'Added — ' + title : 'Saved — ' + title);
        });
      }
    );
  }

  /* ---------------- Game days ---------------- */

  function findQuizDay(id) { return feed().quizDays.filter(function (d) { return d.id === id; })[0] || null; }

  function quizRowHtml(d) {
    var right = d.qs.filter(function (q) { return q.answered != null; }).length;
    return '<div class="trow">' + HV.ui.iconTile('bulb', 'sm') +
      '<div class="grow"><b>' + HV.esc(d.label) + '</b><small>' + HV.esc(d.date) + '</small></div>' +
      countPill(right, 'of ' + d.qs.length + ' answered') +
      (canManage() ? editBtn('edit-qd', d.id) : '') +
      (canDelete() ? delBtn('del-qd', d.id) : '') +
    '</div>';
  }

  function renderQuizDays(body) {
    var list = feed().quizDays;
    body.innerHTML =
      '<div class="row" style="justify-content:flex-end; margin-bottom:var(--s2)">' +
        (canManage() ? '<button class="btn" id="qd-add">' + HV.ui.icon('plus') + 'Add game day</button>' : '') +
      '</div>' +
      '<div class="list">' + (list.length ? list.map(quizRowHtml).join('') :
        HV.ui.empty('bulb', 'No game days yet.', 'Add one to start the daily Health Games book.')) + '</div>';

    var add = body.querySelector('#qd-add');
    if (add) add.addEventListener('click', function () { openQuizDaySheet(null); });
    body.querySelectorAll('[data-edit-qd]').forEach(function (b) {
      b.addEventListener('click', function () { openQuizDaySheet(b.dataset.editQd); });
    });
    body.querySelectorAll('[data-del-qd]').forEach(function (b) {
      b.addEventListener('click', function () { openDeleteSheet('quizDays', b.dataset.delQd, findQuizDay, 'game day'); });
    });
  }

  function questionBlockHtml(q, i) {
    return '<div class="card" data-qblock="' + i + '" style="margin-top:var(--s2)">' +
      '<div class="sec-title" style="margin-top:0">Question <span class="num">' + (i + 1) + '</span></div>' +
      labeled('qq-' + i, 'Question', textArea('qq-' + i, q.q, 2)) +
      labeled('qo-' + i, 'Options — one per line', textArea('qo-' + i, (q.opts || []).join('\n'), 3, 'One option per line')) +
      labeled('qa-' + i, 'Correct option — 0 is the first line', numInput('qa-' + i, q.ans != null ? q.ans : 0)) +
      labeled('qw-' + i, 'Why', textArea('qw-' + i, q.why, 2)) +
    '</div>';
  }

  function openQuizDaySheet(id) {
    var isNew = !id;
    var existing = isNew ? null : findQuizDay(id);
    if (!isNew && !existing) return;
    /* a private working copy — every question keeps its own `answered`
       untouched; only q/opts/ans/why are ever rewritten from the form */
    var draftQs = existing ? JSON.parse(JSON.stringify(existing.qs)) : [];

    function syncDraft(sheet) {
      draftQs.forEach(function (q, i) {
        var qEl = sheet.querySelector('#qq-' + i);
        if (!qEl) return;
        q.q = qEl.value.trim();
        q.opts = sheet.querySelector('#qo-' + i).value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
        q.ans = Number(sheet.querySelector('#qa-' + i).value) || 0;
        q.why = sheet.querySelector('#qw-' + i).value.trim();
      });
    }
    function paintQuestions(sheet) {
      sheet.querySelector('#qd-questions').innerHTML = draftQs.map(questionBlockHtml).join('');
    }

    HV.sheet(
      '<div class="h1">' + (isNew ? 'Add game day' : 'Edit game day') + '</div>' +
      labeled('qd-label', 'Label', textInput('qd-label', existing ? existing.label : '', 'e.g. Mon')) +
      labeled('qd-date', 'Date', textInput('qd-date', existing ? existing.date : '', 'e.g. 3 Aug')) +
      '<div class="sec-title">Questions</div>' +
      '<div id="qd-questions">' + draftQs.map(questionBlockHtml).join('') + '</div>' +
      '<button class="btn sm ghost" id="qd-addq" style="margin-top:var(--s2)">' + HV.ui.icon('plus') + 'Add question</button>' +
      '<p class="audit">The Health Games book runs on five questions a day — add five so the star row fills correctly. ' +
        'Whether a client has already answered a question is member state and is never changed here.</p>' +
      '<div class="row" style="justify-content:flex-end">' +
        '<button class="btn ghost" id="qd-cancel">Cancel</button>' +
        '<button class="btn" id="qd-save">' + (isNew ? 'Add game day' : 'Save') + '</button>' +
      '</div>',
      function (sheet) {
        sheet.querySelector('#qd-cancel').addEventListener('click', HV.closeSheet);
        sheet.querySelector('#qd-addq').addEventListener('click', function () {
          syncDraft(sheet);
          draftQs.push({ q: '', opts: ['', ''], ans: 0, why: '', answered: null });
          paintQuestions(sheet);
          var last = sheet.querySelector('#qq-' + (draftQs.length - 1));
          if (last) last.focus();
        });
        sheet.querySelector('#qd-save').addEventListener('click', function () {
          var label = sheet.querySelector('#qd-label').value.trim();
          if (!label) { HV.toast('Give the day a label first.'); return; }
          syncDraft(sheet);
          var item = existing || { id: nextId('qd') };
          item.label = label;
          item.date = sheet.querySelector('#qd-date').value.trim();
          item.qs = draftQs.filter(function (q) { return q.q; });   // drop unfilled stubs
          if (isNew) feed().quizDays.unshift(item);
          HV.save();
          HV.closeSheet();
          HV.refresh();
          HV.toast(isNew ? 'Added — ' + label : 'Saved — ' + label);
        });
      }
    );
  }

  /* ---------------- Posts ---------------- */

  function findPost(id) { return feed().posts.filter(function (p) { return p.id === id; })[0] || null; }

  function whoName(id) {
    if (id === 'haalving') return 'HAALVING';
    var u = HV.store.users.find(function (x) { return x.id === id; });
    return u ? u.name : 'A member';
  }
  function nonClientStaff() { return HV.store.users.filter(function (u) { return u.role !== 'client'; }); }
  /* new posts may only be authored as the house account or a staff member —
     this console cannot impersonate a client. Editing an older, client-
     authored seed post keeps that authorship as an extra, already-selected
     option instead of silently reassigning it to whichever name sorts first */
  function byOptions(currentId) {
    var opts = [{ id: 'haalving', name: 'HAALVING (official)' }].concat(nonClientStaff());
    if (currentId && !opts.some(function (o) { return o.id === currentId; })) {
      opts = opts.concat([{ id: currentId, name: whoName(currentId) + ' (existing author)' }]);
    }
    return opts;
  }

  var KIND_LABEL = { text: 'Text', photo: 'Photo', short: 'Short', quiz: 'Game' };

  function postRowHtml(p) {
    var name = whoName(p.by);
    return '<div class="trow">' + HV.ui.avatar(name, 'sm') +
      '<div class="grow"><b>' + HV.esc(name) + '</b><small>' + HV.esc(p.caption || '') + '</small></div>' +
      (p.pinned ? HV.ui.pill('Pinned', 'info') : '') +
      (p.hidden ? HV.ui.pill('Hidden', 'warn') : '') +
      HV.ui.pill(KIND_LABEL[p.kind] || p.kind, 'neutral') +
      countPill(p.likes.length, 'likes') +
      (canManage() ? '<button class="btn sm ghost" data-mod-tp="' + HV.esc(p.id) + '">' +
        HV.ui.icon('gauge') + 'Moderate</button>' : '') +
      (canManage() ? editBtn('edit-tp', p.id) : '') +
      (canDelete() ? delBtn('del-tp', p.id) : '') +
    '</div>';
  }

  /* The lens is view state, not a route: it is a filter over one list, not a
     page, and pushing #/community/feed/hidden into history would make Back
     mean something the user never asked for. */
  var feedLens = 'all';

  function renderFeed(body) {
    var all = feed().posts;
    var list = feedLens === 'hidden' ? all.filter(function (p) { return p.hidden; })
             : feedLens === 'pinned' ? all.filter(function (p) { return p.pinned; })
             : all;
    var lensChip = function (k, label, n) {
      return '<button class="chip' + (feedLens === k ? ' sel' : '') + '" data-lens="' + k + '"' +
        ' aria-pressed="' + (feedLens === k) + '">' + HV.esc(label) +
        ' <span class="num">' + n + '</span></button>';
    };
    body.innerHTML =
      '<p class="sub">Every post on the client\'s Common Canvas. Hiding takes a post off ' +
      'that canvas for everyone else; its author still sees it on My Canvas, marked hidden — ' +
      'we do not remove people\'s words quietly.</p>' +
      '<div class="row" style="flex-wrap:wrap; margin:var(--s3) 0" role="group" aria-label="Filter posts">' +
        lensChip('all', 'All', all.length) +
        lensChip('pinned', 'Pinned', all.filter(function (p) { return p.pinned; }).length) +
        lensChip('hidden', 'Hidden', all.filter(function (p) { return p.hidden; }).length) +
        '<span class="grow"></span>' +
        (canManage() ? '<button class="btn" id="tp-add">' + HV.ui.icon('plus') + 'Add post</button>' : '') +
      '</div>' +
      '<div class="list">' + (list.length ? list.map(postRowHtml).join('') :
        HV.ui.empty('chat', 'Nothing here.', 'The Common Canvas is what clients see on the Haalving Zone.')) + '</div>';

    body.querySelectorAll('[data-lens]').forEach(function (b) {
      b.addEventListener('click', function () { feedLens = b.dataset.lens; renderFeed(body); });
    });
    var add = body.querySelector('#tp-add');
    if (add) add.addEventListener('click', function () { openPostSheet(null); });
    body.querySelectorAll('[data-edit-tp]').forEach(function (b) {
      b.addEventListener('click', function () { openPostSheet(b.dataset.editTp); });
    });
    body.querySelectorAll('[data-mod-tp]').forEach(function (b) {
      b.addEventListener('click', function () { openModerateSheet(b.dataset.modTp); });
    });
    body.querySelectorAll('[data-del-tp]').forEach(function (b) {
      b.addEventListener('click', function () { openDeleteSheet('posts', b.dataset.delTp, findPost, 'post'); });
    });
  }

  /* Moderation is a THIRD category beside content and member state: staff
     action on someone else's post. It gets its own sheet so the content
     sheet stays purely about what the post says. */
  function openModerateSheet(id) {
    var p = findPost(id);
    if (!p) return;
    var swrow = function (attr, on, label, sub, tone) {
      return '<div class="row" style="padding:var(--s3) 0; border-top:1px solid var(--line)">' +
        '<span class="grow">' + HV.esc(label) +
          '<small class="sub" style="display:block">' + HV.esc(sub) + '</small></span>' +
        '<button class="pill ' + (on ? tone : 'neutral') + '" data-' + attr + ' role="switch" ' +
          'aria-checked="' + !!on + '" aria-label="' + HV.esc(label) + '">' + (on ? 'On' : 'Off') + '</button>' +
      '</div>';
    };
    HV.sheet(
      '<div class="h1">Moderate this post</div>' +
      '<div class="card"><div class="trow">' + HV.ui.avatar(whoName(p.by), 'sm') +
        '<div class="grow"><b>' + HV.esc(whoName(p.by)) + '</b><small>' +
        HV.esc(p.caption || '') + '</small></div>' +
        HV.ui.pill(KIND_LABEL[p.kind] || p.kind, 'neutral') + '</div></div>' +
      swrow('pin', p.pinned, 'Pinned to the top of the Common Canvas',
        'One at a time — pinning this releases whatever is pinned now.', 'info') +
      swrow('hide', p.hidden, 'Hidden from the Common Canvas',
        'Off the canvas for everyone else. The author still sees it on My Canvas, marked hidden.', 'warn') +
      '<p class="audit">Likes and comments are member state and are never changed here. ' +
      'Hiding is reversible and is not a delete.</p>' +
      '<div class="row" style="justify-content:flex-end">' +
        '<button class="btn" id="mod-done">Done</button>' +
      '</div>',
      function (sheet) {
        sheet.querySelector('#mod-done').addEventListener('click', HV.closeSheet);
        sheet.querySelector('[data-pin]').addEventListener('click', function () {
          var next = !p.pinned;
          /* single-pin enforced on WRITE, so two pinned posts are impossible
             rather than merely unlikely — the client sorts pinned-first and
             a second pin would make that order arbitrary */
          feed().posts.forEach(function (o) { o.pinned = false; });
          p.pinned = next;
          if (next) p.hidden = false;   /* a hidden post cannot also lead the canvas */
          HV.save(); HV.closeSheet(); HV.refresh();
          HV.toast(next ? 'Pinned to the top of the canvas.' : 'Unpinned.');
        });
        sheet.querySelector('[data-hide]').addEventListener('click', function () {
          p.hidden = !p.hidden;
          if (p.hidden) p.pinned = false;
          HV.save(); HV.closeSheet(); HV.refresh();
          HV.toast(p.hidden ? 'Hidden from the Common Canvas.' : 'Back on the canvas.');
        });
      }
    );
  }

  function openPostSheet(id) {
    var isNew = !id;
    var existing = isNew ? null : findPost(id);
    if (!isNew && !existing) return;
    var opts = byOptions(existing ? existing.by : null);
    var selected = existing ? existing.by : opts[0].id;

    HV.sheet(
      '<div class="h1">' + (isNew ? 'Add post' : 'Edit post') + '</div>' +
      (isNew ? '<p class="sub">New posts from this console post as the house account or a staff member — never as a client.</p>' : '') +
      labeled('tp-by', 'Posted as', '<select class="input" id="tp-by">' +
        opts.map(function (o) { return '<option value="' + HV.esc(o.id) + '"' + (o.id === selected ? ' selected' : '') + '>' + HV.esc(o.name) + '</option>'; }).join('') +
        '</select>') +
      labeled('tp-caption', 'Caption', textArea('tp-caption', existing ? existing.caption : '', 3)) +
      (isNew
        ? '<p class="audit">New posts are text posts. Likes and comments are member state and are never changed here.</p>'
        : existing.kind !== 'text'
          ? '<p class="audit">This post carries a ' + HV.esc(KIND_LABEL[existing.kind] || existing.kind) + ' — only who posted it and the caption are edited here.</p>'
          : '<p class="audit">Editing changes the caption and author only — media and game content are preserved.</p>') +
      '<div class="row" style="justify-content:flex-end">' +
        '<button class="btn ghost" id="tp-cancel">Cancel</button>' +
        '<button class="btn" id="tp-save">' + (isNew ? 'Add post' : 'Save') + '</button>' +
      '</div>',
      function (sheet) {
        sheet.querySelector('#tp-cancel').addEventListener('click', HV.closeSheet);
        sheet.querySelector('#tp-save').addEventListener('click', function () {
          var caption = sheet.querySelector('#tp-caption').value.trim();
          if (!caption) { HV.toast('Give the post a caption first.'); return; }
          var by = sheet.querySelector('#tp-by').value;
          if (isNew) {
            var item = { id: nextId('tp'), by: by, kind: 'text', caption: caption, minsAgo: 0, likes: [], comments: [] };
            feed().posts.unshift(item);
          } else {
            existing.by = by;
            existing.caption = caption;
          }
          HV.save();
          HV.closeSheet();
          HV.refresh();
          HV.toast(isNew ? 'Added' : 'Saved');
        });
      }
    );
  }

  /* ---------------- Zones ----------------
     Client-created spaces on the Haalving Zone's My Zones canvas. TJ chose
     full admin here (17 Aug): the console may create, rename, manage members
     and delete. The one line it still does not cross is authorship — this
     console has never posted as a client and does not start here, so a
     console-made zone is created BY the house account, and removing a post
     from a zone is moderation, never editing someone's words. */

  function zones() { return feed().zones || (feed().zones = []); }
  function findZone(id) { return zones().filter(function (z) { return z.id === id; })[0] || null; }

  /* the member pool is the community circle — the same list the client's own
     zone picker draws from, so the two never offer different people */
  function circleIds() { return (feed().circle || []).slice(); }

  function facepile(z, n) {
    return (z.members || []).slice(0, n || 3).map(function (uid) {
      return HV.ui.avatar(whoName(uid), 'sm');
    }).join('');
  }

  function zoneRowHtml(z) {
    var posts = (z.posts || []).length;
    return '<div class="trow">' +
      '<span class="row" style="gap:2px">' + facepile(z, 3) + '</span>' +
      '<div class="grow"><b>' + HV.esc(z.name) + '</b><small>' +
        '<span class="num">' + (z.members || []).length + '</span> people · made by ' +
        HV.esc(whoName(z.createdBy)) + ' · <span class="num">' + posts + '</span> posts</small></div>' +
      (canManage() ? editBtn('edit-z', z.id) : '') +
      (canDelete() ? delBtn('del-z', z.id) : '') +
    '</div>';
  }

  function renderZones(body) {
    var list = zones();
    body.innerHTML =
      '<p class="sub">The private spaces members keep on the Haalving Zone. What is said inside ' +
      'a zone belongs to the people in it — this page manages the space, not their conversation.</p>' +
      '<div class="row" style="justify-content:flex-end; margin:var(--s3) 0">' +
        (canManage() ? '<button class="btn" id="z-add">' + HV.ui.icon('plus') + 'New zone</button>' : '') +
      '</div>' +
      '<div class="list">' + (list.length ? list.map(zoneRowHtml).join('') :
        HV.ui.empty('zone', 'No zones yet.', 'Members make these on My Zones — you can start one too.')) + '</div>';

    var add = body.querySelector('#z-add');
    if (add) add.addEventListener('click', function () { openZoneSheet(null); });
    body.querySelectorAll('[data-edit-z]').forEach(function (b) {
      b.addEventListener('click', function () { openZoneSheet(b.dataset.editZ); });
    });
    body.querySelectorAll('[data-del-z]').forEach(function (b) {
      b.addEventListener('click', function () { openZoneDelete(b.dataset.delZ); });
    });
  }

  function openZoneSheet(id) {
    var isNew = !id;
    var z = isNew ? null : findZone(id);
    if (!isNew && !z) return;
    var members = z ? (z.members || []).slice() : [];
    var pool = circleIds();

    HV.sheet(
      '<div class="h1">' + (isNew ? 'New zone' : 'Edit zone') + '</div>' +
      labeled('z-name', 'Name', textInput('z-name', z ? z.name : '', 'Morning Walkers')) +
      '<div class="sec-title">Members</div>' +
      '<div class="list">' + (pool.length ? pool.map(function (uid) {
        var on = members.indexOf(uid) !== -1;
        return '<button class="trow click" data-mem="' + HV.esc(uid) + '" aria-pressed="' + on + '">' +
          HV.ui.avatar(whoName(uid), 'sm') +
          '<span class="grow"><b>' + HV.esc(whoName(uid)) + '</b></span>' +
          (on ? HV.ui.pill('In', 'ok') : HV.ui.pill('Add', 'neutral')) + '</button>';
      }).join('') : HV.ui.empty('users', 'The community circle is empty.')) + '</div>' +
      (z && (z.posts || []).length
        ? '<p class="audit">This zone holds <span class="num">' + z.posts.length + '</span> posts ' +
          'written by its members. Removing someone does not remove what they wrote.</p>'
        : '') +
      '<div class="row" style="justify-content:flex-end">' +
        '<button class="btn ghost" id="z-cancel">Cancel</button>' +
        '<button class="btn" id="z-save">' + (isNew ? 'Create zone' : 'Save') + '</button>' +
      '</div>',
      function (sheet) {
        sheet.querySelectorAll('[data-mem]').forEach(function (b) {
          b.addEventListener('click', function () {
            var uid = b.dataset.mem;
            var i = members.indexOf(uid);
            if (i === -1) members.push(uid); else members.splice(i, 1);
            var on = members.indexOf(uid) !== -1;
            b.setAttribute('aria-pressed', on);
            b.querySelector('.pill').outerHTML = on ? HV.ui.pill('In', 'ok') : HV.ui.pill('Add', 'neutral');
          });
        });
        sheet.querySelector('#z-cancel').addEventListener('click', HV.closeSheet);
        sheet.querySelector('#z-save').addEventListener('click', function () {
          var name = sheet.querySelector('#z-name').value.trim();
          if (!name) { HV.toast('Give the zone a name first.'); return; }
          if (!members.length) { HV.toast('A zone needs at least one member.'); return; }
          if (isNew) {
            /* created BY the house account, not the acting admin — an
               official zone reads as HAALVING's, and whoName already
               resolves 'haalving' without needing a user record */
            zones().unshift({ id: nextId('z'), name: name, createdBy: 'haalving',
                              members: members, posts: [] });
          } else {
            z.name = name;
            z.members = members;
          }
          HV.save(); HV.closeSheet(); HV.refresh();
          HV.toast(isNew ? 'Zone created' : 'Saved');
        });
      }
    );
  }

  /* zones get their own delete confirm rather than the shared one: the
     warning has to carry the post count, because deleting a zone destroys
     other people's writing and that must be said out loud */
  function openZoneDelete(id) {
    var z = findZone(id);
    if (!z) return;
    var n = (z.posts || []).length;
    HV.sheet(
      '<div class="h1">Delete “' + HV.esc(z.name) + '”?</div>' +
      '<div class="notice bad">This removes the zone for all <span class="num">' +
        (z.members || []).length + '</span> members' +
        (n ? ' and deletes the <span class="num">' + n + '</span> posts they wrote in it' : '') +
        '. It cannot be undone.</div>' +
      '<div class="row" style="justify-content:flex-end">' +
        '<button class="btn ghost" id="zd-cancel">Cancel</button>' +
        '<button class="btn" id="zd-go" style="background:var(--danger-fill)">Delete zone</button>' +
      '</div>',
      function (sheet) {
        sheet.querySelector('#zd-cancel').addEventListener('click', HV.closeSheet);
        sheet.querySelector('#zd-go').addEventListener('click', function () {
          var arr = zones();
          arr.splice(arr.indexOf(z), 1);
          HV.save(); HV.closeSheet(); HV.refresh();
          HV.toast('Zone deleted');
        });
      }
    );
  }

  /* ---------------- Announcements ----------------
     The one outbound tab. Writes nothing to tribeFeed; it pushes a card into
     many clients' own circles through HV.sendBroadcast (core.js), which owns
     the audience resolution, the opt-out filter and the reach stamp. */

  function canAnnounce() { return HV.can('announceClients'); }
  function broadcasts() { return HV.store.broadcasts || (HV.store.broadcasts = []); }

  /* only house imagery, and only what the service worker precaches — an
     arbitrary src is a broken tile the moment the client is offline. The
     seven onboard photographs are the set sw.js actually holds. */
  var BC_PICKS = [
    { src: 'img/onboard/bz-live.webp',   label: 'Blue Zone life' },
    { src: 'img/onboard/bz-table.webp',  label: 'The table' },
    { src: 'img/onboard/culture.webp',   label: 'Nutrition' },
    { src: 'img/onboard/nutrition.webp', label: 'On the plate' },
    { src: 'img/onboard/fitness.webp',   label: 'Fitness' },
    { src: 'img/onboard/yoga.webp',      label: 'Yoga' },
    /* the file keeps the frozen key; the operator reads the display name */
    { src: 'img/onboard/mindspace.webp', label: 'Mind Wellness' },
  ];

  function audienceLabel(spec) {
    if (!spec) return '—';
    if (spec.mode === 'all') return 'Every client';
    if (spec.mode === 'plan') {
      return (spec.plans || []).map(function (p) {
        return HV.PLANS[p] ? HV.PLANS[p].name : p;
      }).join(' · ') || 'No plan chosen';
    }
    if (spec.mode === 'coach') {
      return (spec.staffIds || []).map(function (s) { return HV.staff(s).name; }).join(' · ') +
        '’s clients';
    }
    if (spec.mode === 'pick') {
      return (spec.clientIds || []).length + ' hand-picked';
    }
    return '—';
  }

  function bcRowHtml(b) {
    var s = b.sent || {};
    return '<div class="trow">' +
      HV.ui.iconTile(b.kind === 'notice' ? 'bell' : 'send', 'sm') +
      '<div class="grow"><b>' + HV.esc(b.title || b.text || 'Announcement') + '</b><small>' +
        HV.esc(HV.staff(b.byId).name) + ' · ' + HV.esc(HV.ago(Math.round((HV.now() - b.ts) / 60000))) +
        ' · ' + HV.esc(b.audienceLabel || audienceLabel(b.audience)) + '</small></div>' +
      HV.ui.pill(b.kind === 'notice' ? 'Notice' : 'Announcement', b.kind === 'notice' ? 'warn' : 'info') +
      '<span class="pill ok"><span class="num">' + (s.delivered || 0) + '</span> of <span class="num">' +
        (s.targeted || 0) + '</span> reached</span>' +
      (s.muted ? countPill(s.muted, 'muted') : '') +
    '</div>';
  }

  function renderAnnounce(body) {
    var list = broadcasts();
    body.innerHTML =
      '<p class="sub">What the team has told clients directly. An announcement lands as a ' +
      'HAALVING card in each client\'s My Circle — it never impersonates a coach.</p>' +
      '<div class="row" style="justify-content:flex-end; margin:var(--s3) 0">' +
        (canAnnounce() ? '<button class="btn" id="bc-new">' + HV.ui.icon('send') + 'New announcement</button>' : '') +
      '</div>' +
      '<div class="list">' + (list.length ? list.map(bcRowHtml).join('') :
        HV.ui.empty('send', 'Nothing sent yet.', 'The first announcement will show its reach here.')) + '</div>' +
      (canAnnounce()
        ? '<p class="audit">Counts are recorded when an announcement is sent and never recalculated — ' +
          'a client changing their setting later cannot rewrite what was already delivered.</p>'
        : '<p class="audit">Read-only for your role — sending needs the “Announce to clients” ' +
          'permission (Super Admin and Operations Head). You can see everything that was sent.</p>');

    var nb = body.querySelector('#bc-new');
    /* wrapped, never passed bare: the listener would hand openBroadcastSheet
       the MouseEvent as its `draft` argument, and a truthy non-draft makes
       d.audience undefined */
    if (nb) nb.addEventListener('click', function () { openBroadcastSheet(); });
  }

  /* `draft` is passed back in by the confirm step's Back button. HV.sheet is
     single-slot — opening the confirm REPLACES this sheet rather than
     stacking on it — so Back has to rebuild the composer, and it must
     rebuild it with everything the operator had already typed. */
  function openBroadcastSheet(draft) {
    if (!canAnnounce()) { HV.toast('Sending needs the “Announce to clients” permission.'); return; }
    var d = draft || { kind: 'promo', title: '', text: '', img: '', link: null,
                       audience: { mode: 'all', plans: [], staffIds: [], clientIds: [] } };
    /* the plans a client may actually be sold — building the checkboxes from
       plansOnSale means an operator can never target an unlaunched plan and
       watch it silently match nobody */
    var livePlans = HV.plansOnSale();
    var coaches = HV.store.users.filter(function (u) {
      return ['dietitian', 'fitness', 'yoga', 'mind', 'doctor', 'opsmgr', 'opshead'].indexOf(u.role) !== -1;
    });
    var clients = (HV.store.clients || []).filter(function (c) { return c.userId; });

    var modeChip = function (k, label) {
      return '<button class="chip" data-mode="' + k + '">' + HV.esc(label) + '</button>';
    };
    var kindChip = function (k, label) {
      return '<button class="chip" data-kind="' + k + '">' + HV.esc(label) + '</button>';
    };

    HV.sheet(
      '<div class="h1">New announcement</div>' +

      '<div class="sec-title">What kind</div>' +
      '<div class="row" style="flex-wrap:wrap" role="group" aria-label="Kind">' +
        kindChip('promo', 'Announcement') + kindChip('notice', 'Operational notice') +
      '</div>' +
      '<p class="audit" id="bc-kindnote"></p>' +

      '<div class="sec-title">What it says</div>' +
      labeled('bc-title', 'Headline', textInput('bc-title', d.title, 'Six places left on the trek')) +
      labeled('bc-text', 'Message', textArea('bc-text', d.text, 4, 'Say it the way a person would.')) +

      '<div class="sec-title">A picture (optional)</div>' +
      '<div class="row" style="flex-wrap:wrap; gap:var(--s2)" id="bc-pics">' +
        '<button class="chip" data-pic="">None</button>' +
        BC_PICKS.map(function (p) {
          return '<button class="chip" data-pic="' + HV.esc(p.src) + '">' +
            HV.esc(p.label) + '</button>';
        }).join('') +
      '</div>' +

      '<div class="sec-title">A link into Community (optional)</div>' +
      '<select class="input" id="bc-link" aria-label="Link target">' +
        '<option value="">No link</option>' +
        HV.bcLinkTargets().map(function (t) {
          var on = d.link && d.link.href === t.route;
          return '<option value="' + HV.esc(t.route) + '"' + (on ? ' selected' : '') + '>' +
            HV.esc(t.label) + '</option>';
        }).join('') +
      '</select>' +

      '<div class="sec-title">Who gets it</div>' +
      '<div class="row" style="flex-wrap:wrap" role="group" aria-label="Audience">' +
        modeChip('all', 'Everyone') + modeChip('plan', 'By plan') +
        modeChip('coach', 'By coach') + modeChip('pick', 'Pick people') +
      '</div>' +
      '<div id="bc-aud" style="margin-top:var(--s3)"></div>' +
      '<div class="notice" id="bc-count"></div>' +

      '<div class="sec-title">How it lands in their Circle</div>' +
      '<div class="chat" id="bc-prev" style="background:var(--surface-2); padding:var(--s4); border-radius:var(--r-lg)"></div>' +

      '<div class="row" style="justify-content:flex-end">' +
        '<button class="btn ghost" id="bc-cancel">Cancel</button>' +
        '<button class="btn" id="bc-send">Send</button>' +
      '</div>',

      function (sheet) {
        var audBox = sheet.querySelector('#bc-aud');
        var countBox = sheet.querySelector('#bc-count');
        var prev = sheet.querySelector('#bc-prev');

        function selChips(attr, val) {
          sheet.querySelectorAll('[data-' + attr + ']').forEach(function (b) {
            var on = b.getAttribute('data-' + attr) === val;
            b.classList.toggle('sel', on);
            b.setAttribute('aria-pressed', on);
          });
        }

        function paintAudience() {
          var m = d.audience.mode;
          if (m === 'plan') {
            audBox.innerHTML = '<div class="row" style="flex-wrap:wrap">' +
              livePlans.map(function (p) {
                var on = d.audience.plans.indexOf(p) !== -1;
                return '<button class="chip' + (on ? ' sel' : '') + '" data-plan="' + p + '"' +
                  ' aria-pressed="' + on + '">' + HV.esc(HV.PLANS[p].name) + '</button>';
              }).join('') + '</div>' +
              (livePlans.length < Object.keys(HV.PLANS).length
                ? '<p class="audit">Only plans on sale can be targeted.</p>' : '');
            audBox.querySelectorAll('[data-plan]').forEach(function (b) {
              b.addEventListener('click', function () {
                var p = b.dataset.plan, i = d.audience.plans.indexOf(p);
                if (i === -1) d.audience.plans.push(p); else d.audience.plans.splice(i, 1);
                paintAudience(); paintCount();
              });
            });
          } else if (m === 'coach') {
            audBox.innerHTML = '<div class="list">' + coaches.map(function (u) {
              var on = d.audience.staffIds.indexOf(u.id) !== -1;
              return '<button class="trow click" data-staff="' + HV.esc(u.id) + '" aria-pressed="' + on + '">' +
                HV.ui.avatar(u.name, 'sm') +
                '<span class="grow"><b>' + HV.esc(u.name) + '</b><small>' +
                HV.esc(HV.roleDef(u.role) ? HV.roleDef(u.role).title : u.role) + '</small></span>' +
                (on ? HV.ui.pill('On', 'ok') : HV.ui.pill('Add', 'neutral')) + '</button>';
            }).join('') + '</div>';
            audBox.querySelectorAll('[data-staff]').forEach(function (b) {
              b.addEventListener('click', function () {
                var s = b.dataset.staff, i = d.audience.staffIds.indexOf(s);
                if (i === -1) d.audience.staffIds.push(s); else d.audience.staffIds.splice(i, 1);
                paintAudience(); paintCount();
              });
            });
          } else if (m === 'pick') {
            audBox.innerHTML = '<div class="list">' + clients.map(function (c) {
              var on = d.audience.clientIds.indexOf(c.id) !== -1;
              return '<button class="trow click" data-cl="' + HV.esc(c.id) + '" aria-pressed="' + on + '">' +
                HV.ui.avatar(c.name, 'sm') +
                '<span class="grow"><b>' + HV.esc(c.name) + '</b><small>' +
                HV.esc(HV.PLANS[c.plan] ? HV.PLANS[c.plan].name : c.plan || '') + '</small></span>' +
                (on ? HV.ui.pill('On', 'ok') : HV.ui.pill('Add', 'neutral')) + '</button>';
            }).join('') + '</div>';
            audBox.querySelectorAll('[data-cl]').forEach(function (b) {
              b.addEventListener('click', function () {
                var id = b.dataset.cl, i = d.audience.clientIds.indexOf(id);
                if (i === -1) d.audience.clientIds.push(id); else d.audience.clientIds.splice(i, 1);
                paintAudience(); paintCount();
              });
            });
          } else {
            audBox.innerHTML = '';
          }
        }

        /* one function feeds the confirm bar AND the send, so the number the
           operator agreed to cannot disagree with what actually goes out */
        function paintCount() {
          var r = HV.announceReach(d.audience, d.kind);
          countBox.innerHTML = r.targeted
            ? '<span class="num">' + r.delivered + '</span> will receive this' +
              (d.kind === 'notice'
                ? ' · a service notice overrides the announcements setting'
                : (r.muted ? ' · <span class="num">' + r.muted + '</span> have announcements off'
                           : ' · nobody has announcements off'))
            : 'That audience matches nobody right now.';
        }

        function draftMsg() {
          return { kind: 'promo', notice: d.kind === 'notice', title: d.title,
                   text: d.text || 'Your message will read here.',
                   img: d.img, media: null, link: d.link, minsAgo: 0 };
        }
        /* the preview is drawn by the CLIENT's own renderer, so it cannot
           drift from what actually lands in the thread */
        function paintPrev() { prev.innerHTML = HV.clientMsgHtml(draftMsg()); }

        function paintKindNote() {
          sheet.querySelector('#bc-kindnote').textContent = d.kind === 'notice'
            ? 'A service notice is operational — a schedule change, a closure, something about safety. It reaches every client in the audience even if they have announcements switched off.'
            : 'An announcement is marketing — offers, events, news. Clients who have switched announcements off will not receive it.';
        }

        sheet.querySelectorAll('[data-kind]').forEach(function (b) {
          b.addEventListener('click', function () {
            d.kind = b.dataset.kind; selChips('kind', d.kind);
            paintKindNote(); paintCount(); paintPrev();
          });
        });
        sheet.querySelectorAll('[data-mode]').forEach(function (b) {
          b.addEventListener('click', function () {
            d.audience.mode = b.dataset.mode; selChips('mode', d.audience.mode);
            paintAudience(); paintCount();
          });
        });
        sheet.querySelectorAll('[data-pic]').forEach(function (b) {
          b.addEventListener('click', function () {
            d.img = b.dataset.pic; selChips('pic', d.img); paintPrev();
          });
        });
        sheet.querySelector('#bc-title').addEventListener('input', function (e) {
          d.title = e.target.value; paintPrev();
        });
        sheet.querySelector('#bc-text').addEventListener('input', function (e) {
          d.text = e.target.value; paintPrev();
        });
        sheet.querySelector('#bc-link').addEventListener('change', function (e) {
          var route = e.target.value;
          var t = HV.bcLinkTargets().filter(function (x) { return x.route === route; })[0];
          d.link = route ? { href: route, label: 'See in Community' } : null;
          if (t) d.link.label = 'See in Community';
          paintPrev();
        });
        sheet.querySelector('#bc-cancel').addEventListener('click', HV.closeSheet);
        sheet.querySelector('#bc-send').addEventListener('click', function () {
          if (!d.text.trim()) { HV.toast('Write the message first.'); return; }
          var r = HV.announceReach(d.audience, d.kind);
          if (!r.targeted) { HV.toast('That audience matches nobody right now.'); return; }
          if (!r.delivered) {
            HV.toast('Everyone in that audience has announcements off. Mark it an operational notice if it must reach them.');
            return;
          }
          confirmSend(r);
        });

        function confirmSend(r) {
          HV.sheet(
            '<div class="h1">Send this?</div>' +
            '<p class="sub">' + HV.esc(d.title || d.text.slice(0, 80)) + '</p>' +
            '<div class="grid2">' +
              '<div class="stat"><div class="k">Will receive</div><div class="v num">' + r.delivered + '</div></div>' +
              '<div class="stat"><div class="k">' +
                (d.kind === 'notice' ? 'Overridden opt-outs' : 'Announcements off') +
                '</div><div class="v num">' + r.muted + '</div></div>' +
            '</div>' +
            '<div class="notice">Going to ' + HV.esc(audienceLabel(d.audience)) + '.</div>' +
            '<p class="audit">An announcement cannot be unsent or edited once it is in someone’s ' +
            'Circle. Send a correction instead.</p>' +
            '<div class="row" style="justify-content:flex-end">' +
              '<button class="btn ghost" id="cs-back">Back</button>' +
              '<button class="btn" id="cs-go">Send to <span class="num">' + r.delivered + '</span></button>' +
            '</div>',
            function (cs) {
              /* rebuild the composer with the draft intact, never closeSheet */
              cs.querySelector('#cs-back').addEventListener('click', function () {
                openBroadcastSheet(d);
              });
              cs.querySelector('#cs-go').addEventListener('click', function () {
                var me = HV.me();
                var sent = HV.sendBroadcast({
                  id: nextId('bc'), ts: HV.now(), byId: me.id, kind: d.kind,
                  title: d.title, text: d.text, img: d.img, media: null, link: d.link,
                  audience: d.audience, audienceLabel: audienceLabel(d.audience),
                });
                HV.closeSheet(); HV.refresh();
                HV.toast('Sent to ' + sent.delivered + ' ' +
                  (sent.delivered === 1 ? 'client' : 'clients') +
                  (sent.muted ? ' · ' + sent.muted + ' muted' : ''));
              });
            }
          );
        }

        selChips('kind', d.kind);
        selChips('mode', d.audience.mode);
        selChips('pic', d.img || '');
        paintKindNote(); paintAudience(); paintCount(); paintPrev();
      },
      'tall'
    );
  }

  /* ---------------- shared delete confirm ----------------
     Gatherings and quiz days are the two collections the client pages index
     unguarded at [0] — client-tribe.js's heal() reads events[0].about and
     client-hive.js's today() reads quizDays[0].qs with no length check.
     Emptying either collection to [] therefore blanks #/tribe and
     #/tribe-classic for every client until a demo reset, so the last
     surviving item in each is a floor: refused, not merely confirmed.
     Challenges and posts render fine empty (both pages test .length before
     indexing them) and keep unrestricted delete. */
  var FLOOR_COLLECTIONS = { events: true, quizDays: true };

  function openDeleteSheet(collection, id, finder, noun) {
    var it = finder(id);
    if (!it) return;
    var name = it.title || it.label || it.caption || noun;
    var atFloor = FLOOR_COLLECTIONS[collection] && feed()[collection].length <= 1;
    HV.sheet(
      '<div class="h1">Delete this ' + HV.esc(noun) + '?</div>' +
      (atFloor
        ? '<div class="notice warn">The Community page needs at least one ' + HV.esc(noun) +
          ' — edit it instead, or add another before deleting this one.</div>'
        : '<p class="sub">“' + HV.esc(name) + '” disappears from the Common Canvas for every client immediately.</p>') +
      '<div class="row" style="justify-content:flex-end">' +
        '<button class="btn ghost" id="tad-cancel">' + (atFloor ? 'Close' : 'Cancel') + '</button>' +
        (atFloor ? '' : '<button class="btn danger" id="tad-go">Delete</button>') +
      '</div>',
      function (sheet) {
        sheet.querySelector('#tad-cancel').addEventListener('click', HV.closeSheet);
        if (atFloor) return;
        sheet.querySelector('#tad-go').addEventListener('click', function () {
          var list = feed()[collection];
          var idx = -1;
          list.forEach(function (x, i) { if (x.id === id) idx = i; });
          if (idx !== -1) list.splice(idx, 1);
          HV.save();
          HV.closeSheet();
          HV.refresh();
          HV.toast('Deleted');
        });
      }
    );
  }

  /* ---------------- page shell ---------------- */

  HV.registerView('community', {
    title: 'Community',
    render: function (el, params) {
      var want = SECTION_ALIAS[params[0]] || params[0];
      var section = SECTIONS.some(function (s) { return s.key === want; }) ? want : 'gatherings';

      /* the Announcements tab wears its count, so the sidebar's newest
         surface says how much has gone out without being opened */
      var tabs = SECTIONS.map(function (s) {
        return s.key === 'announce' && broadcasts().length
          ? { key: s.key, label: s.label, count: broadcasts().length }
          : s;
      });

      el.innerHTML =
        '<div class="h1-row"><div><div class="kicker">THE COMMONS</div><h1 class="h1">Community</h1>' +
        '<p class="sub">Gatherings, challenges, the Health Games book, the Haalving Zone canvases ' +
        'and what the team announces — the same community clients see on their Community tab.</p></div></div>' +
        HV.ui.tabs(tabs, section) +
        '<div id="ta-body" style="margin-top:var(--s3)"></div>';

      el.querySelectorAll('.tabs button[data-tab]').forEach(function (b) {
        b.addEventListener('click', function () { HV.go('#/community/' + b.dataset.tab); });
      });

      var body = el.querySelector('#ta-body');
      if (section === 'gatherings') renderEvents(body);
      else if (section === 'challenges') renderChallenges(body);
      else if (section === 'quiz') renderQuizDays(body);
      else if (section === 'zones') renderZones(body);
      else if (section === 'announce') renderAnnounce(body);
      else renderFeed(body);
    },
  });
})();
