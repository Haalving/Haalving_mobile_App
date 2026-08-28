/* TB-02/TB-04 · Haalving Zone — the community's canvases page at
   #/tribe-classic (the route name is historical and frozen; the third
   hexagon on Community is its door). Reworked 8 Aug 2026 from the retained
   feed version into three canvases:

       Common Canvas   everyone's feed — every HAALVING member posts here
       My Canvas       your own wall: profile header + a 3-column grid of
                       everything you have shared, anywhere
       My Zones        small private circles you create — WhatsApp-shaped in
                       the making (pick people → name it → straight in),
                       Instagram-shaped in the living (a private post canvas)

       #/tribe-classic            Common Canvas (default)
       #/tribe-classic/canvas     My Canvas
       #/tribe-classic/zones      My Zones
       #/tribe-classic/zone/z1    one zone, opened as its own page
       #/tribe-classic/quiz|events|challenges|event/:id|challenge/:id
                                  the shared faces, kept for deep links

   This file still LENDS its three faces — the daily Health Games book, the events
   and challenges decks — to the Community honeycomb via HV.tribeFaces.

   Content lives in HV.store.tribeFeed (catalogue-refilled when absent, then
   persisted; zones grafted by heal()). Load-bearing rule from the v116
   review: NEVER call HV.refresh() here — core's render() scrolls to top, so
   every mutation patches the DOM in place or redraws through redrawPage()
   below. Route changes DO re-render; feedScroll puts the page back where the
   reader left it. */
(function () {
  'use strict';

  const feed = () => HV.store.tribeFeed;

  /* CLASSIC is this page. FEED is whichever page a face currently hangs over —
     this one, or the honeycomb at #/tribe — because a face's back chevron and
     close X must land on the page you opened it from, not on a fixed address.
     hostPatch is that page's redraw for the same reason: enrolling in an event
     changes the rings here and the hexagon meta there. Both are set on every
     open() call, so they can never be left pointing at the page you left. */
  const CLASSIC = '#/tribe-classic';
  let FEED = CLASSIC;

  /* core's render() wipes #app and scrolls to top on every route change, so
     opening a face would otherwise throw the reader back to the top of the
     feed. This listener runs on EVERY hash change — a tap, a back chevron,
     the backdrop, the phone's Back button all end here — and it fires before
     core re-renders, while the page is still on screen and still at the
     reader's position.
     The offset is remembered WITH the page it was measured on: since the
     rework the sub-routes are different pages (three canvas tabs, zone
     pages), and restoring one page's offset onto another mis-lands the
     reader. A face route keys to the page beneath it — the sheet never moves
     the page — so closing a face still puts the canvas back where it was. */
  const FACES = ['quiz', 'events', 'challenges', 'event', 'challenge'];
  function pageKey(h) {
    const a = h.slice(CLASSIC.length).split('/')[1];
    return (!a || FACES.indexOf(a) >= 0) ? CLASSIC : h;
  }
  let feedScroll = 0;
  let scrollKey = '';
  let fromTribe = false;
  window.addEventListener('hashchange', function (e) {
    const oldHash = new URL(e.oldURL).hash;
    fromTribe = oldHash.indexOf(CLASSIC) === 0;
    if (fromTribe) {
      feedScroll = window.scrollY;
      scrollKey = pageKey(oldHash);
    }
  });

  const goTo = hash => HV.go(hash);

  /* every navigation in this view is a [data-go] hash — one wiring for the
     rings, the cards, the back chevrons and the close X */
  function wireGo(root) {
    root.querySelectorAll('[data-go]').forEach(b =>
      b.addEventListener('click', () => goTo(b.dataset.go)));
  }

  function who(id) {
    if (id === 'haalving') return { id: 'haalving', name: 'HAALVING', official: true };
    return HV.store.users.find(u => u.id === id) || { id: id, name: 'A tribe member' };
  }
  const firstName = n => n.split(' ')[0];

  /* escape, then set every numeral in the serif data face */
  const numWrap = s => HV.esc(s).replace(/\d[\d,.:]*/g, '<span class="num">$&</span>');

  /* ---------- shared fragments ---------- */

  /* a face's header row: back chevron, title, close X. `back` is the hash one
     step up the trail — the feed for the three top faces, the deck for a
     detail — so the chevron and the phone's Back button agree. */
  function sheetHead(title, back) {
    return '<div class="tsh">' +
      '<button class="tback" data-go="' + back + '" aria-label="Back">' + HV.ui.icon('chevL') + '</button>' +
      '<div class="h1">' + HV.esc(title) + '</div>' +
      '<button class="tsheet-x" data-go="' + FEED + '" aria-label="Close">' + HV.ui.icon('x') + '</button></div>';
  }

  /* shared onMount for every face: its links, plus the backdrop. Core already
     closes the sheet when the backdrop is tapped — this only brings the URL
     along, so Back afterwards leaves the tab instead of reopening the face. */
  function wireSheet(sheet) {
    wireGo(sheet);
    const ov = sheet.parentElement;
    ov.addEventListener('click', e => { if (e.target === ov) goTo(FEED); });
  }

  function quizPanel(qz, dataAttr, extraCls) {
    const done = qz.answered != null;
    return '<div class="tqz' + (extraCls ? ' ' + extraCls : '') + '">' +
      '<div class="q">' + HV.esc(qz.q) + '</div>' +
      qz.opts.map((o, i) => {
        /* the verdict wears a mark as well as a hue — colour alone is not
           status — plus hidden words so a screen reader hears the verdict */
        let cls = 'qopt', mark = '';
        if (done && i === qz.ans) { cls += ' right'; mark = '<span class="omark" aria-hidden="true">' + HV.ui.icon('check') + '</span><span class="vh">Correct answer: </span>'; }
        else if (done && i === qz.answered) { cls += ' wrong'; mark = '<span class="omark" aria-hidden="true">' + HV.ui.icon('x') + '</span><span class="vh">Your pick: </span>'; }
        return '<button class="' + cls + '" ' + dataAttr + '="' + i + '"' + (done ? ' disabled' : '') + '>' + mark + HV.esc(o) + '</button>';
      }).join('') +
      (done ? '<div class="why" tabindex="-1">' + HV.esc(qz.why) + '</div>' : '') +
      '</div>';
  }

  /* a carousel's nav row: chevrons + one dot per slide */
  function carNav(n) {
    let dots = '';
    for (let i = 0; i < n; i++) dots += '<span class="cdot' + (i === 0 ? ' on' : '') + '"></span>';
    return '<div class="carnav">' +
      '<button class="cbtn" data-cprev aria-label="Previous">' + HV.ui.icon('chevL') + '</button>' +
      '<span class="cdots">' + dots + '</span>' +
      '<button class="cbtn" data-cnext aria-label="Next">' + HV.ui.icon('chevR') + '</button>' +
      '</div>';
  }

  /* wire one .hcar to its nav: swipe updates the dots, chevrons page it */
  function wireCar(root) {
    const car = root.querySelector('.hcar');
    if (!car) return;
    const dots = root.querySelectorAll('.cdot');
    const width = () => car.clientWidth || 1;
    car.addEventListener('scroll', () => {
      const i = Math.round(car.scrollLeft / width());
      dots.forEach((d, j) => d.classList.toggle('on', j === i));
    }, { passive: true });
    /* the CSS reduced-motion kill cannot reach programmatic scrolling —
       gate it here, same as core does for countUp and the login film */
    const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    const prev = root.querySelector('[data-cprev]');
    const next = root.querySelector('[data-cnext]');
    if (prev) prev.addEventListener('click', () => car.scrollBy({ left: -width(), behavior }));
    if (next) next.addEventListener('click', () => car.scrollBy({ left: width(), behavior }));
  }

  /* ---------- face routing ---------- */

  /* the route decides which face is open — one place, so a hand-typed URL, a
     deep link and the Back button all land in the same state. Canvas routes
     (canvas / zones / zone) are pages, not faces, so they fall through to the
     close branch: whatever sheet was up comes down. */
  function openFace(params) {
    const a = params[0];
    if (a === 'quiz') openQuizSheet();
    else if (a === 'events' || a === 'challenges') openListSheet(a);
    else if (a === 'event') openItemSheet('events', params[1]);
    else if (a === 'challenge') openItemSheet('challenges', params[1]);
    else HV.closeSheet();
  }

  /* What a face redraws on the page beneath it after a join or a quiz answer.
     On the honeycomb that is the hexagon meta (handed in through tribeFaces);
     here the canvases carry no enrolment surface — joined gatherings live on
     Community — so this page's own patch is a quiet no-op. */
  let hostPatch = function () {};

  /* ---------- the Health Games book ---------- */

  let qDayIdx = 0;

  function dayScore(day) {
    return day.qs.filter(q => q.answered != null && q.answered === q.ans).length;
  }

  function starRow(day) {
    const right = dayScore(day);
    let s = '';
    for (let i = 0; i < 5; i++) s += '<span class="' + (i < right ? 'on' : '') + '">' + HV.ui.icon('star') + '</span>';
    return s;
  }

  /* the stars are decorative to a screen reader — the score rides the label */
  const chipLabel = day => day.label + ' ' + day.date + ', ' + dayScore(day) + ' of 5 right';

  function fillQuiz(sheet) {
    const tf = feed();
    const d = tf.quizDays[qDayIdx];
    const body = sheet.querySelector('.tsheet-scroll');
    body.innerHTML =
      '<div class="qcal" role="group" aria-label="Game days">' + tf.quizDays.map((day, i) =>
        '<button class="qday' + (i === qDayIdx ? ' on' : '') + '" data-day="' + i + '"' +
          ' aria-label="' + HV.esc(chipLabel(day)) + '"' +
          (i === qDayIdx ? ' aria-current="true"' : '') + '>' +
          '<b class="num">' + day.date.split(' ')[0] + '</b><small>' + HV.esc(day.label) + '</small>' +
          '<span class="qstars" aria-hidden="true">' + starRow(day) + '</span></button>').join('') + '</div>' +
      '<p class="qprog">' + HV.esc(d.label) + ' ' + numWrap(d.date) +
        ' · <span class="num">' + d.qs.length + '</span> questions · swipe, or the arrows below</p>' +
      '<div class="hcar qcar">' + d.qs.map((q, j) =>
        '<div class="qslide">' + quizPanel(q, 'data-qj="' + j + '" data-qopt', 'rd') + '</div>').join('') + '</div>';

    /* the pager lives in the sheet's own bottom bar, not in the scroll — the
       way to the next question must never scroll out of reach */
    sheet.querySelector('.carbar').innerHTML = carNav(d.qs.length);
    wireCar(sheet);
    body.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () => {
      qDayIdx = +b.dataset.day;
      fillQuiz(sheet);
      /* the refill destroyed the chip that held focus — hand it back */
      const again = body.querySelector('[data-day="' + qDayIdx + '"]');
      if (again) again.focus();
    }));
    body.querySelectorAll('[data-qopt]').forEach(b => b.addEventListener('click', () => {
      const j = +b.dataset.qj;
      const q = d.qs[j];
      if (q.answered != null) return;
      q.answered = +b.dataset.qopt;
      HV.save();
      HV.toast(q.answered === q.ans ? 'Right — a star for that.' : 'Good try — the why is below.');
      /* reveal in place; the answered panel is inert so nothing to rewire.
         The swap destroys the focused option — land focus on the why, so a
         keyboard or screen-reader user arrives at the explanation. */
      const slide = body.querySelectorAll('.qslide')[j];
      slide.querySelector('.tqz').outerHTML = quizPanel(q, 'data-qj="' + j + '" data-qopt', 'rd');
      const w = slide.querySelector('.why');
      if (w) w.focus({ preventScroll: true });
      const chip = body.querySelector('[data-day="' + qDayIdx + '"]');
      if (chip) {
        chip.setAttribute('aria-label', chipLabel(d));
        chip.querySelector('.qstars').innerHTML = starRow(d);
      }
      hostPatch();   /* today's ring quietens once all five are answered */
    }));
  }

  function openQuizSheet() {
    qDayIdx = 0;
    HV.sheet(
      '<div class="tsheet">' + sheetHead('Health Games', FEED) +
        '<div class="tsheet-scroll"></div>' +
        '<div class="carbar"></div></div>',
      sheet => {
        wireSheet(sheet);
        fillQuiz(sheet);
      }, 'tall');
  }

  /* ---------- events & challenges ----------
     TJ's shape (3 Aug): the quiz slides sideways, but a gathering is READ —
     hero, the facts, the whole description and its own join button, one after
     another down the page, newest first (seed order). Nothing to tap through:
     scrolling IS the navigation, so no card ever hides the detail behind it. */

  const enrolLabel = (isEv, on) => on
    ? (isEv ? 'Going — tap to step back' : 'Joined — tap to leave')
    : (isEv ? 'Enrol for this event' : 'Join the challenge');

  /* one gathering told in full — the page a reader can keep scrolling: the
     facts, the join button above the fold, then the long read (about, the
     day's agenda or the challenge's arc, what to bring, how it works).
     Every section renders only if its field exists, so a store persisted
     before the content grew still draws clean. `head` is false where the
     sheet's own header already carries the title. */
  function itemBlock(kind, it, head) {
    const isEv = kind === 'events';
    const on = isEv ? it.going : it.joined;
    const ul = arr => '<ul>' + arr.map(x => '<li>' + HV.esc(x) + '</li>').join('') + '</ul>';
    const seg = (h, inner) => inner ? '<div class="tsheet-h">' + h + '</div>' + inner : '';
    const rows = (arr, icon, b, s) => '<div class="list">' + arr.map((a, i) =>
      '<div class="trow">' + HV.ui.iconTile(typeof icon === 'function' ? icon(i) : icon, 'sm') +
      '<div class="grow"><b>' + numWrap(b(a)) + '</b><small>' + HV.esc(s(a)) + '</small></div></div>').join('') + '</div>';
    const ARC = ['sprout', 'flame', 'award'];
    return '<section class="tev">' +
      '<img class="thero" src="' + it.img + '" alt="" loading="lazy">' +
      (head ? '<div class="tev-t">' + HV.esc(it.title) + '</div>' : '') +
      '<div class="list">' +
        (isEv
          ? '<div class="trow">' + HV.ui.iconTile('cal', 'sm') +
              '<div class="grow"><b>' + numWrap(it.when) + '</b><small>' + HV.esc(it.where) + '</small></div></div>'
          : '<div class="trow">' + HV.ui.iconTile('flame', 'sm') +
              '<div class="grow"><b><span class="num">' + it.days + '</span> days</b><small>The tribe board tracks everyone together</small></div></div>') +
        (it.host ? '<div class="trow">' + HV.ui.iconTile('users', 'sm') +
          '<div class="grow"><b>Hosted</b><small>' + HV.esc(it.host) + '</small></div></div>' : '') +
        (it.spots ? '<div class="trow">' + HV.ui.iconTile('flag', 'sm') +
          '<div class="grow"><b>Places</b><small>' + numWrap(it.spots) + '</small></div></div>' : '') +
        (it.stake ? '<div class="trow">' + HV.ui.iconTile('award', 'sm') +
          '<div class="grow"><b>At stake</b><small>' + HV.esc(it.stake) + '</small></div></div>' : '') +
      '</div>' +
      '<p class="tdesc">' + HV.esc(it.desc) + '</p>' +
      '<button class="btn enrol' + (on ? ' on' : '') + '" data-enrol="' + it.id + '">' +
        enrolLabel(isEv, on) + '</button>' +
      seg(isEv ? 'About this event' : 'About this challenge',
        it.about && it.about.map(p => '<p class="tdesc">' + HV.esc(p) + '</p>').join('')) +
      seg('The day', it.agenda && rows(it.agenda, 'clock', a => a.t, a => a.v)) +
      seg('What to bring', it.bring && ul(it.bring)) +
      seg('How it works', it.how && ul(it.how)) +
      seg('How the days go', it.arc && rows(it.arc, i => ARC[i % 3], a => a.k, a => a.v)) +
      (it.about ? RINGS_NOTE : '') +
      '</section>';
  }

  /* every join button in the sheet, wherever it sits in the scroll */
  function wireEnrol(sheet, kind) {
    const isEv = kind === 'events';
    sheet.querySelectorAll('[data-enrol]').forEach(b => b.addEventListener('click', () => {
      const it = feed()[kind].find(x => x.id === b.dataset.enrol);
      const now = isEv ? (it.going = !it.going) : (it.joined = !it.joined);
      HV.save();
      b.classList.toggle('on', now);
      b.textContent = enrolLabel(isEv, now);
      HV.toast(now ? (isEv ? 'See you there.' : 'You are in — the tribe board has you.')
                   : (isEv ? 'Taken off the list.' : 'Left the challenge.'));
      hostPatch();   /* the page beneath gains or loses this gathering live */
    }));
  }

  /* where an enrolment surfaces — true wherever a face is opened from */
  const RINGS_NOTE = '<p class="audit">Enrolled events and challenges show on your Community page.</p>';

  /* one gathering per screen, newest first: swipe sideways or tap the arrows
     to reach the next, scroll down inside one to read it out and join.
     One door now holds both kinds (the Events & Challenges hexagon), so the
     sheet carries a two-chip toggle — each chip is a route, which keeps the
     phone's Back button honest about which list it reopens. */
  function openListSheet(kind) {
    const isEv = kind === 'events';
    const list = feed()[kind];
    HV.sheet(
      '<div class="tsheet">' + sheetHead('Events & Challenges', FEED) +
        '<div class="tfil gkind" role="group" aria-label="Kind of gathering">' +
          '<button data-go="' + FEED + '/events"' + (isEv ? ' class="on" aria-current="true"' : '') + '>Events</button>' +
          '<button data-go="' + FEED + '/challenges"' + (isEv ? '' : ' class="on" aria-current="true"') + '>Challenges</button>' +
        '</div>' +
        '<div class="hcar gcar">' + list.map(it =>
          '<div class="gslide">' + itemBlock(kind, it, true) + '</div>').join('') + '</div>' +
        '<div class="carbar">' + carNav(list.length) + '</div>' +
      '</div>',
      sheet => {
        wireSheet(sheet);
        wireCar(sheet);
        wireEnrol(sheet, kind);
      }, 'tall');
  }

  /* a single gathering on its own route — where an enrolled ring lands */
  function openItemSheet(kind, id) {
    const it = feed()[kind].find(x => x.id === id);
    if (!it) { HV.closeSheet(); return; }
    HV.sheet(
      '<div class="tsheet">' + sheetHead(it.title, FEED + '/' + kind) +
        '<div class="tsheet-scroll">' +
          itemBlock(kind, it, false) +
          (it.about ? '' : RINGS_NOTE) +
        '</div></div>',
      sheet => {
        wireSheet(sheet);
        wireEnrol(sheet, kind);
      }, 'tall');
  }

  /* ---------- the feed ---------- */

  function likesLine(p) {
    if (!p.likes.length) return '';
    return 'Liked by ' + HV.esc(firstName(who(p.likes[0]).name)) +
      (p.likes.length > 1 ? ' and <span class="num">' + (p.likes.length - 1) + '</span> more' : '');
  }

  function postHtml(p, myId) {
    const u = who(p.by);
    const liked = p.likes.includes(myId);
    let media = '';
    if (p.kind === 'photo' || p.kind === 'short') {
      media = '<div class="pmedia" data-dbl="' + p.id + '">' +
        '<img src="' + p.img + '" alt="" loading="lazy">' +
        (p.kind === 'short'
          ? '<span class="playchip">' + HV.ui.icon('play') + '</span>' +
            '<span class="dur num">0:' + String(p.secs).padStart(2, '0') + '</span>'
          : '') +
        '<div class="bigheart">' + HV.ui.icon('heart') + '</div>' +
        '</div>';
    } else if (p.kind === 'quiz') {
      media = quizPanel(p.quiz, 'data-qpost="' + p.id + '" data-qopt');
    } else if (p.kind === 'text') {
      /* a text post wears the wash panel — words where the photo would be */
      media = '<div class="tqz"><div class="q">' + HV.esc(p.caption) + '</div></div>';
    }
    return '<article class="tpost" data-post="' + p.id + '">' +
      '<div class="phead">' + HV.ui.avatar(u.name, 'sm') +
        '<div class="grow"><b>' + HV.esc(u.name) + '</b>' +
        (u.official ? '<small>Official</small>' : '') + '</div>' +
        '<button class="pmore" data-more aria-label="More options">' + HV.ui.icon('more') + '</button>' +
      '</div>' +
      media +
      '<div class="pacts">' +
        '<button data-like="' + p.id + '" class="' + (liked ? 'lit' : '') + '" aria-pressed="' + liked + '" aria-label="Like">' + HV.ui.icon('heart') + '</button>' +
        '<button data-cmt="' + p.id + '" aria-label="Comments">' + HV.ui.icon('chat') + '</button>' +
        '<button data-share aria-label="Share">' + HV.ui.icon('send') + '</button>' +
        '<button data-keep="' + p.id + '" class="save' + (p.kept ? ' kept' : '') + '" aria-pressed="' + !!p.kept + '" aria-label="Save">' + HV.ui.icon('bookmark') + '</button>' +
      '</div>' +
      '<div class="plikes" data-likes="' + p.id + '">' + likesLine(p) + '</div>' +
      (p.kind !== 'text' && p.caption
        ? '<div class="pcap"><b>' + HV.esc(firstName(u.name)) + '</b>' + HV.esc(p.caption) + '</div>' : '') +
      '<div data-cmts="' + p.id + '">' + cmtsFoot(p) + '</div>' +
      '<div class="ptime">' + (p.minsAgo ? numWrap(HV.ago(p.minsAgo)) : 'Just now') + '</div>' +
      '</article>';
  }

  /* the comments footer — teaser plus latest — regenerated in place after a
     new comment lands, so the feed never needs a scroll-resetting refresh */
  function cmtsFoot(p) {
    const latest = p.comments.length ? p.comments[p.comments.length - 1] : null;
    return (p.comments.length > 1
        ? '<button class="pcmts" data-cmt="' + p.id + '">View all <span class="num">' + p.comments.length + '</span> comments</button>' : '') +
      (latest
        ? '<div class="pcap"><b>' + HV.esc(firstName(who(latest.by).name)) + '</b>' + HV.esc(latest.text) + '</div>' : '');
  }

  function patchCmts(list, p) {
    const box = document.querySelector('[data-cmts="' + p.id + '"]');
    if (!box) return;
    box.innerHTML = cmtsFoot(p);
    const t = box.querySelector('[data-cmt]');
    if (t) t.addEventListener('click', () => openComments(list, p.id));
  }

  function applyLike(p, root) {
    const art = root.querySelector('[data-post="' + p.id + '"]');
    if (!art) return;
    const liked = p.likes.includes(HV.me().id);
    const btn = art.querySelector('[data-like]');
    btn.classList.toggle('lit', liked);
    btn.setAttribute('aria-pressed', String(liked));
    art.querySelector('[data-likes]').innerHTML = likesLine(p);
  }

  function cmtRows(p) {
    return p.comments.map(c => {
      const u = who(c.by);
      return '<div class="trow">' + HV.ui.avatar(u.name, 'sm') +
        '<div class="grow"><b>' + HV.esc(u.name) + '</b><small>' + HV.esc(c.text) + '</small></div></div>';
    }).join('') || '<p class="audit">No comments yet — yours starts it.</p>';
  }

  /* `list` is whichever canvas the post lives on — the common feed, a zone's
     posts, or the one-post list a grid cell opens — so one comments sheet
     serves them all. `back` exists only when the comments were opened from a
     post SHEET: HV.sheet is single-slot, so opening comments destroyed that
     sheet, and without a way back the reader would land on the grid instead
     of the post they were reading. */
  function openComments(list, pid, back) {
    const p = list.find(x => x.id === pid);
    HV.sheet(
      (back
        ? '<div class="tsh"><button class="tback" data-cback aria-label="Back to the post">' + HV.ui.icon('chevL') + '</button>' +
          '<div class="h1">Comments</div></div>'
        : '<div class="h1">Comments</div>') +
      '<div class="list">' + cmtRows(p) + '</div>' +
      '<div class="tcmt-row">' +
        '<input class="input" maxlength="280" placeholder="Add a comment…" aria-label="Add a comment">' +
        '<button class="go" aria-label="Post comment">' + HV.ui.icon('send') + '</button>' +
      '</div>',
      sheet => {
        const inp = sheet.querySelector('input');
        const send = () => {
          const t = inp.value.trim();
          if (!t) return;
          p.comments.push({ by: HV.me().id, text: t });
          HV.save();
          /* patch in place — the sheet keeps focus, the feed keeps its scroll */
          sheet.querySelector('.list').innerHTML = cmtRows(p);
          patchCmts(list, p);
          inp.value = '';
          inp.focus();
        };
        sheet.querySelector('.go').addEventListener('click', send);
        /* isComposing: an IME confirm also lands as Enter — don't post half a word */
        inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) send(); });
        const cb = sheet.querySelector('[data-cback]');
        if (cb) cb.addEventListener('click', back);
        inp.focus();
      });
  }

  /* ---------- shared post wiring ----------
     One wiring for every surface that draws .tpost articles — the Common
     Canvas, a zone's canvas, and the single-post sheet a grid cell opens.
     `list` is the array those posts live in; every mutation writes there.
     `cmtBack` is set only when `root` is itself a sheet — the comments sheet
     will replace it, and the back chevron needs a way to redraw it. */
  function wirePosts(root, list, cmtBack) {
    const me = HV.me();

    root.querySelectorAll('[data-like]').forEach(b => b.addEventListener('click', () => {
      const p = list.find(x => x.id === b.dataset.like);
      const i = p.likes.indexOf(me.id);
      if (i >= 0) p.likes.splice(i, 1); else p.likes.push(me.id);
      HV.save();
      applyLike(p, root);
    }));

    /* the double-tap: two taps inside 350ms like the post (never unlike,
       same as the feed pattern this borrows from) and pop the big heart */
    root.querySelectorAll('[data-dbl]').forEach(m => {
      let last = 0;
      m.addEventListener('click', () => {
        const now = Date.now();
        if (now - last < 350) {
          last = 0;
          const p = list.find(x => x.id === m.dataset.dbl);
          if (!p.likes.includes(me.id)) { p.likes.push(me.id); HV.save(); applyLike(p, root); }
          const h = m.querySelector('.bigheart');
          h.classList.remove('pop'); void h.offsetWidth; h.classList.add('pop');
        } else { last = now; }
      });
    });

    root.querySelectorAll('[data-cmt]').forEach(b =>
      b.addEventListener('click', () => openComments(list, b.dataset.cmt, cmtBack)));

    root.querySelectorAll('[data-qopt]').forEach(b => b.addEventListener('click', () => {
      const p = list.find(x => x.id === b.dataset.qpost);
      p.quiz.answered = +b.dataset.qopt;
      HV.save();
      HV.toast(p.quiz.answered === p.quiz.ans ? 'Right — well read.' : 'Good try — the why is below.');
      /* reveal in place — a refresh would scroll the answer out from under
         the reader's thumb. The answered panel is inert, so no rewiring;
         focus lands on the why for keyboard and screen-reader users. */
      const art = root.querySelector('[data-post="' + p.id + '"]');
      if (art) {
        art.querySelector('.tqz').outerHTML =
          quizPanel(p.quiz, 'data-qpost="' + p.id + '" data-qopt');
        const w = art.querySelector('.why');
        if (w) w.focus({ preventScroll: true });
      }
    }));

    root.querySelectorAll('[data-share]').forEach(b =>
      b.addEventListener('click', () => HV.toast('Shared with your community')));

    root.querySelectorAll('[data-keep]').forEach(b => b.addEventListener('click', () => {
      const p = list.find(x => x.id === b.dataset.keep);
      p.kept = !p.kept;
      HV.save();
      b.classList.toggle('kept', p.kept);
      b.setAttribute('aria-pressed', String(p.kept));
      HV.toast(p.kept ? 'Saved for later' : 'Removed from saved');
    }));

    root.querySelectorAll('[data-more]').forEach(b =>
      b.addEventListener('click', () => HV.toast('Post options are on the way')));
  }

  /* ---------- the three canvases ---------- */

  const zones = () => feed().zones;
  const myZones = me => (zones() || []).filter(z => z.members.includes(me.id));

  /* the page is redrawn in place after a mutation (a new post, new zone
     members) — the route hasn't changed, so going through the router would
     only fight the scroll. render() records how it was called; redrawPage
     calls the same way again. */
  let PAGE = null;
  function redrawPage() { if (PAGE) renderRoute(PAGE.el, PAGE.params); }

  const TABS = [
    { k: 'common', label: 'Common Canvas', route: CLASSIC },
    { k: 'canvas', label: 'My Canvas',     route: CLASSIC + '/canvas' },
    { k: 'zones',  label: 'My Zones',      route: CLASSIC + '/zones' },
  ];

  function zoneHead(tab) {
    return '<h1 class="vh">Haalving Zone</h1>' +
      '<div class="zhead"><div class="zt">Haalving Zone</div>' +
      '<p class="zs">Three canvases — everyone’s, yours, and the zones you keep close.</p></div>' +
      '<div class="tfil zfil">' + TABS.map(t =>
        '<button data-go="' + t.route + '" class="' + (t.k === tab ? 'on' : '') + '"' +
        (t.k === tab ? ' aria-current="page"' : '') + '>' + t.label + '</button>').join('') + '</div>';
  }

  /* the composer door — an Instagram-style "what would you share" bar */
  function shareBar(label) {
    return '<button class="zshare" data-compose>' + HV.ui.avatar(HV.me().name, 'sm') +
      '<span class="grow">' + HV.esc(label) + '</span>' + HV.ui.icon('plus') + '</button>';
  }

  /* the dashed first-post tile — a brand-new canvas must never be bare */
  function firstTile(line) {
    return '<button class="zfirst" data-compose>' + HV.ui.icon('plus') +
      '<span>' + HV.esc(line) + '</span></button>';
  }

  /* A post the console has hidden leaves the Common Canvas for everyone, and a
     pinned one leads it. Both fields are optional — absent means false — so
     nothing in the seed or in heal() has to change. */
  const visible = list => (list || []).filter(p => !p.hidden);
  const pinnedFirst = list =>
    visible(list).filter(p => p.pinned).concat(visible(list).filter(p => !p.pinned));

  function commonHtml(tf) {
    const me = HV.me();
    return shareBar('Share to the Common Canvas…') +
      '<div class="tfeed">' + pinnedFirst(tf.posts).map(p => postHtml(p, me.id)).join('') + '</div>';
  }

  /* everything I have shared, wherever it lives — common-canvas posts plus my
     posts inside each of my zones, newest first. A zone post carries its zone
     so the grid can badge it as zone-only. */
  function minePosts(me) {
    const mine = feed().posts.filter(p => p.by === me.id).map(p => ({ p: p, zone: null }));
    myZones(me).forEach(z => z.posts.forEach(p => {
      if (p.by === me.id) mine.push({ p: p, zone: z });
    }));
    return mine.sort((a, b) => a.p.minsAgo - b.p.minsAgo);
  }

  function canvasHtml() {
    const me = HV.me();
    const mine = minePosts(me);
    const zc = myZones(me).length;
    const likes = mine.reduce((n, m) => n + m.p.likes.length, 0);
    const stat = (n, label) => '<span class="zstat"><b class="num">' + n + '</b><small>' + label + '</small></span>';
    /* a post the team has hidden STAYS on its author's own canvas, marked —
       taking someone's words off the wall and not telling them is the one
       version of moderation this product will not do */
    const cells = mine.map((m, i) =>
      '<button class="zcell' + (m.p.hidden ? ' zhid' : '') + '" data-open="' + i +
        '" aria-label="Open your post' +
        (m.p.hidden ? ' — hidden from the Common Canvas' : '') +
        (m.zone ? ' — shared only in ' + HV.esc(m.zone.name) : '') + '">' +
        (m.p.img ? '<img src="' + m.p.img + '" alt="" loading="lazy">'
                 : '<span class="ztxt">' + HV.esc((m.p.caption || '').slice(0, 64)) + '</span>') +
        (m.p.hidden ? '<span class="zhidtag">Hidden</span>' : '') +
        (m.zone ? '<span class="zonly" aria-hidden="true">' + HV.ui.icon('zone') + '</span>' : '') +
      '</button>').join('');
    return '<div class="zprof">' + HV.ui.avatar(me.name, 'lg') +
        '<div class="grow"><b>' + HV.esc(me.name) + '</b>' +
        '<div class="zstats">' +
          stat(mine.length, mine.length === 1 ? 'post' : 'posts') +
          stat(zc, zc === 1 ? 'zone' : 'zones') +
          stat(likes, 'likes') +
        '</div></div></div>' +
      shareBar('Share something…') +
      (mine.length
        ? '<div class="zgrid">' + cells + '</div>'
        : firstTile('Share your first update — it lands here and on the Common Canvas.'));
  }

  /* one of my posts, opened full from its grid cell — same article, same
     wiring, over whichever canvas it actually lives on */
  function openPostSheet(m) {
    const list = m.zone ? m.zone.posts : feed().posts;
    HV.sheet(
      '<div class="tsheet"><div class="tsh">' +
        '<div class="h1">' + HV.esc(m.zone ? m.zone.name : 'Common Canvas') + '</div>' +
        '<button class="tsheet-x" data-x aria-label="Close">' + HV.ui.icon('x') + '</button></div>' +
        '<div class="tsheet-scroll"><div class="tfeed zsingle">' + postHtml(m.p, HV.me().id) + '</div></div>' +
      '</div>',
      sheet => {
        sheet.querySelector('[data-x]').addEventListener('click', HV.closeSheet);
        /* comments replace this sheet (single-slot) — give them the way back */
        wirePosts(sheet, list, () => openPostSheet(m));
      }, 'tall');
  }

  /* the WhatsApp-group-header sensibility: who a zone is, at a glance */
  function facepile(z, n) {
    return '<span class="zfaces" aria-hidden="true">' + z.members.slice(0, n || 3).map(id =>
      HV.ui.avatar(who(id).name, 'sm')).join('') + '</span>';
  }

  function zonesHtml() {
    const me = HV.me();
    const mine = myZones(me);
    const rows = mine.map(z => {
      const latest = z.posts[0];
      const teaser = latest
        ? firstName(who(latest.by).name) + ': ' + (latest.caption || '').slice(0, 44)
        : 'No posts yet — yours starts it';
      return '<button class="trow click zrow" data-go="' + CLASSIC + '/zone/' + z.id + '">' +
        facepile(z) +
        '<span class="grow"><b>' + HV.esc(z.name) + '</b>' +
        '<small>' + numWrap(z.members.length + ' people · ') + HV.esc(teaser) + '</small></span>' +
        HV.ui.icon('chevR') + '</button>';
    }).join('');
    return '<p class="zintro">Small circles of the people close to you. What a zone shares stays in the zone.</p>' +
      (mine.length
        ? '<div class="list">' + rows + '</div>'
        : HV.ui.empty('users', 'No zones yet — make one for the people who keep you honest.')) +
      '<button class="btn block" data-newzone>New zone</button>';
  }

  function renderZonePage(el, id) {
    const z = (zones() || []).find(x => x.id === id);
    if (!z) { HV.go(CLASSIC + '/zones'); return; }
    HV.closeSheet();
    const me = HV.me();
    el.innerHTML =
      '<div class="zpage-h">' +
        '<button class="tback" data-go="' + CLASSIC + '/zones" aria-label="Back to My Zones">' + HV.ui.icon('chevL') + '</button>' +
        '<div class="grow"><h1 class="zt">' + HV.esc(z.name) + '</h1>' +
          '<small>Zone · ' + numWrap(z.members.length + ' people') + '</small></div>' +
        '<button class="zadd" data-addppl>' + HV.ui.icon('plus') + '<span>Add</span></button>' +
      '</div>' +
      '<div class="zmembers">' + facepile(z, 5) +
        '<small>' + HV.esc(z.members.map(id => firstName(who(id).name)).join(', ')) + '</small></div>' +
      shareBar('Share with ' + z.name + '…') +
      /* the SECOND place hidden must be honoured — one renderer, two feeds */
      (visible(z.posts).length
        ? '<div class="tfeed">' + pinnedFirst(z.posts).map(p => postHtml(p, me.id)).join('') + '</div>'
        : firstTile('Share the first update — only ' + z.name + ' will see it.'));
    wireGo(el);
    wirePosts(el, z.posts);
    el.querySelectorAll('[data-compose]').forEach(b =>
      b.addEventListener('click', () => openCompose(z)));
    el.querySelector('[data-addppl]').addEventListener('click', () => openAddPeople(z));
  }

  /* ---------- the composer ----------
     The demo stand-in for the real camera flow: a short note, optionally one
     of the photographs already shipped in the build. Share needs at least one
     of the two. */
  const PICKS = ['img/onboard/culture.webp', 'img/onboard/fitness.webp', 'img/onboard/yoga.webp',
    'img/onboard/mindspace.webp', 'img/onboard/bz-live.webp', 'img/onboard/bz-table.webp',
    'img/food/m-priya-bf.webp', 'img/food/m-raj-lunch.webp'];

  function openCompose(zone) {
    const list = zone ? zone.posts : feed().posts;
    let img = null;
    HV.sheet(
      '<div class="h1">Share to ' + HV.esc(zone ? zone.name : 'the Common Canvas') + '</div>' +
      (zone
        ? '<p class="sub" style="margin:0">Only the ' + numWrap(zone.members.length + ' people') + ' in this zone see it.</p>'
        : '<p class="sub" style="margin:0">Every HAALVING member sees the Common Canvas.</p>') +
      '<textarea class="input zcap" maxlength="280" rows="3" placeholder="What kept you living well today?" aria-label="Your update"></textarea>' +
      '<div class="zpick" role="group" aria-label="Add a photo">' + PICKS.map((src, i) =>
        '<button data-pick="' + i + '" aria-pressed="false" aria-label="Photo option ' + (i + 1) + '">' +
        '<img src="' + src + '" alt=""></button>').join('') + '</div>' +
      '<button class="btn block" data-post-it disabled>Share</button>',
      sheet => {
        const cap = sheet.querySelector('.zcap');
        const send = sheet.querySelector('[data-post-it]');
        const ready = () => { send.disabled = !cap.value.trim() && img == null; };
        cap.addEventListener('input', ready);
        sheet.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
          img = img === PICKS[+b.dataset.pick] ? null : PICKS[+b.dataset.pick];
          sheet.querySelectorAll('[data-pick]').forEach(x => {
            const on = PICKS[+x.dataset.pick] === img;
            x.classList.toggle('on', on);
            x.setAttribute('aria-pressed', String(on));
          });
          ready();
        }));
        send.addEventListener('click', () => {
          const text = cap.value.trim();
          if (!text && img == null) return;
          const p = { id: 'up' + Date.now(), by: HV.me().id, kind: img ? 'photo' : 'text',
            caption: text, minsAgo: 0, likes: [], comments: [] };
          if (img) p.img = img;
          list.unshift(p);
          HV.save();
          HV.closeSheet();
          HV.toast(zone ? 'Shared with ' + zone.name : 'Shared to the Common Canvas');
          redrawPage();
        });
        cap.focus();
      });
  }

  /* ---------- making a zone ----------
     WhatsApp's proven order, two sheets: people first, then the name, then
     straight into the open zone — nothing else is asked at creation. The
     same picker later adds people to an existing zone. */

  const memberSub = () => 'HAALVING member';

  function candidatesFor(zone) {
    const me = HV.me();
    const taken = zone ? zone.members : [me.id];
    return feed().circle.filter(id => taken.indexOf(id) < 0 && id !== me.id);
  }

  /* opts: title · blurb · cta · candidates · preset (ids) · onDone(sel) */
  function pickerSheet(opts) {
    let sel = (opts.preset || []).slice();
    let qtext = '';
    const chip = id => '<button class="zchip" data-unsel="' + id + '" aria-label="Remove ' + HV.esc(who(id).name) + '">' +
      HV.ui.avatar(who(id).name, 'sm') + '<span>' + HV.esc(firstName(who(id).name)) + '</span>' +
      HV.ui.icon('x') + '</button>';
    const row = id => {
      const on = sel.indexOf(id) >= 0;
      return '<button class="trow click zmrow' + (on ? ' on' : '') + '" data-sel="' + id + '" aria-pressed="' + on + '">' +
        HV.ui.avatar(who(id).name, 'sm') +
        '<span class="grow"><b>' + HV.esc(who(id).name) + '</b><small>' + memberSub() + '</small></span>' +
        '<span class="zmark" aria-hidden="true">' + HV.ui.icon('check') + '</span></button>';
    };
    HV.sheet(
      '<div class="tsheet"><div class="tsh">' +
        '<div class="h1">' + HV.esc(opts.title) + '</div>' +
        '<button class="tsheet-x" data-x aria-label="Close">' + HV.ui.icon('x') + '</button></div>' +
        '<p class="tdesc" style="margin:0">' + HV.esc(opts.blurb) + '</p>' +
        '<input class="input" data-q placeholder="Search people" aria-label="Search people">' +
        '<div class="zchips" data-chips></div>' +
        '<div class="tsheet-scroll"><div class="list" data-rows></div></div>' +
        '<button class="btn block" data-done disabled></button>' +
      '</div>',
      sheet => {
        const rows = sheet.querySelector('[data-rows]');
        const chips = sheet.querySelector('[data-chips]');
        const done = sheet.querySelector('[data-done]');
        function paint() {
          const ql = qtext.toLowerCase();
          rows.innerHTML = opts.candidates
            .filter(id => who(id).name.toLowerCase().indexOf(ql) >= 0)
            .map(row).join('') ||
            '<p class="audit">No one matches — try fewer letters.</p>';
          chips.innerHTML = sel.map(chip).join('');
          chips.style.display = sel.length ? '' : 'none';
          done.innerHTML = HV.esc(opts.cta) + (sel.length ? ' · <span class="num">' + sel.length + '</span>' : '');
          done.disabled = !sel.length;
          rows.querySelectorAll('[data-sel]').forEach(b => b.addEventListener('click', () => {
            const i = sel.indexOf(b.dataset.sel);
            if (i >= 0) sel.splice(i, 1); else sel.push(b.dataset.sel);
            paint();
          }));
          chips.querySelectorAll('[data-unsel]').forEach(b => b.addEventListener('click', () => {
            sel.splice(sel.indexOf(b.dataset.unsel), 1);
            paint();
          }));
        }
        sheet.querySelector('[data-x]').addEventListener('click', HV.closeSheet);
        sheet.querySelector('[data-q]').addEventListener('input', e => { qtext = e.target.value; paint(); });
        done.addEventListener('click', () => { if (sel.length) opts.onDone(sel); });
        paint();
      }, 'tall');
  }

  /* `draftName` rides along both directions: each HV.sheet call is a fresh
     DOM, so stepping back to the people picker and forward again would
     otherwise present an empty name box — WhatsApp keeps the draft, so do we */
  function openNewZone(preset, draftName) {
    pickerSheet({
      title: 'New zone',
      blurb: 'Pick the people close to you — they see everything this zone shares, and nothing leaves it.',
      cta: 'Next',
      preset: preset,
      candidates: candidatesFor(null),
      onDone: sel => nameZone(sel, draftName),
    });
  }

  function nameZone(sel, draftName) {
    const kept = (draftName || '').trim();
    HV.sheet(
      '<div class="tsheet"><div class="tsh">' +
        '<button class="tback" data-back aria-label="Back to choosing people">' + HV.ui.icon('chevL') + '</button>' +
        '<div class="h1">Name your zone</div>' +
        '<button class="tsheet-x" data-x aria-label="Close">' + HV.ui.icon('x') + '</button></div>' +
        '<div class="zchips">' + sel.map(id => '<span class="zchip still">' + HV.ui.avatar(who(id).name, 'sm') +
          '<span>' + HV.esc(firstName(who(id).name)) + '</span></span>').join('') + '</div>' +
        '<input class="input" data-zname maxlength="32" placeholder="e.g. Morning Walkers" aria-label="Zone name" value="' + HV.esc(kept) + '">' +
        '<p class="audit">You can add more people any time, from inside the zone.</p>' +
        '<button class="btn block" data-create' + (kept ? '' : ' disabled') + '>Create zone</button>' +
      '</div>',
      sheet => {
        const inp = sheet.querySelector('[data-zname]');
        const create = sheet.querySelector('[data-create]');
        inp.addEventListener('input', () => { create.disabled = !inp.value.trim(); });
        sheet.querySelector('[data-back]').addEventListener('click', () => openNewZone(sel, inp.value));
        sheet.querySelector('[data-x]').addEventListener('click', HV.closeSheet);
        create.addEventListener('click', () => {
          const name = inp.value.trim();
          if (!name) return;
          const z = { id: 'z' + Date.now(), name: name, createdBy: HV.me().id,
            members: [HV.me().id].concat(sel), posts: [] };
          zones().push(z);
          HV.save();
          HV.closeSheet();
          HV.toast('Zone created — everyone in it has been told.');
          HV.go(CLASSIC + '/zone/' + z.id);
        });
        inp.focus();
      }, 'tall');
  }

  function openAddPeople(z) {
    if (!candidatesFor(z).length) {
      HV.toast('Everyone in your community is already in this zone.');
      return;
    }
    pickerSheet({
      title: 'Add people',
      blurb: 'They join ' + z.name + ' right away and see everything it has shared.',
      cta: 'Add',
      candidates: candidatesFor(z),
      onDone: sel => {
        sel.forEach(id => z.members.push(id));
        HV.save();
        HV.closeSheet();
        HV.toast(sel.length + (sel.length === 1 ? ' person' : ' people') + ' added to ' + z.name);
        redrawPage();
      },
    });
  }

  /* ---------- the page router ---------- */

  function renderRoute(el, params) {
    const a = params[0];
    if (a === 'zone' && params[1]) { renderZonePage(el, params[1]); return; }
    const tab = a === 'canvas' ? 'canvas' : a === 'zones' ? 'zones' : 'common';
    const tf = feed();
    el.innerHTML = zoneHead(tab) +
      (tab === 'common' ? commonHtml(tf) : tab === 'canvas' ? canvasHtml() : zonesHtml());
    wireGo(el);
    el.querySelectorAll('[data-compose]').forEach(b =>
      b.addEventListener('click', () => openCompose(null)));
    const nz = el.querySelector('[data-newzone]');
    if (nz) nz.addEventListener('click', () => openNewZone());
    if (tab === 'common') wirePosts(el, tf.posts);
    if (tab === 'canvas') {
      const mine = minePosts(HV.me());
      el.querySelectorAll('[data-open]').forEach(b =>
        b.addEventListener('click', () => openPostSheet(mine[+b.dataset.open])));
    }
    openFace(params);   /* deep-linked faces still rise over the common canvas */
  }

  /* ---------- the view ---------- */

  /* The three faces are the tribe's CONTENT, not this page's layout, so the
     honeycomb at #/tribe opens the very same sheets rather than a second copy
     of them. `home` is where the back chevron, the close X and the backdrop
     land; `onChange` is the host's redraw after a join or an answer. Both are
     set here, on every open, so a face can never be wired to the page you
     came from two navigations ago. */
  HV.tribeFaces = {
    open(params, home, onChange) {
      FEED = home || CLASSIC;
      hostPatch = onChange || function () {};
      openFace(params);
    },

    /* the store as this page and the honeycomb both need it: a store persisted
       before the quiz-book rework — or before the gatherings grew their
       long-read content — carries an old tribeFeed shape, and tf.quizDays[0]
       would throw. Replacing it from the seed costs the demo's interactions in
       the old shape, which is the cheaper of the two losses. */
    heal() {
      /* every hop is checked before the next one reads through it — a feed with
         no events at all used to throw *inside* the check meant to replace it */
      const tf = feed();
      if (!tf || !tf.quizDays || !tf.quizDays[0] || !tf.events || !tf.events[0] || !tf.events[0].about) {
        HV.store.tribeFeed = JSON.parse(JSON.stringify(HV.seed.tribeFeed));
        HV.save();
      }
      /* zones arrived 8 Aug — a store persisted before then carries a healthy
         feed with no zones at all. Graft only the seed's zones rather than
         replacing the feed: likes, answers and joins are user state worth
         keeping. */
      if (!HV.store.tribeFeed.zones) {
        HV.store.tribeFeed.zones = JSON.parse(JSON.stringify(HV.seed.tribeFeed.zones || []));
        HV.save();
      }
    },
  };

  HV.registerView('tribe-classic', {
    title: 'Haalving Zone',
    roles: ['client'],

    render(el, params) {
      /* point the shared faces back at THIS page BEFORE anything draws: a
         face's hashes are built from FEED, and a visit to the honeycomb left
         it pointing at #/tribe. */
      FEED = CLASSIC;
      hostPatch = function () {};

      HV.tribeFaces.heal();

      PAGE = { el: el, params: params };
      renderRoute(el, params);

      /* core scrolls to top right after this render returns — put the page
         back on the next frame, once that has happened. Only when this IS the
         page the offset was measured on: a different canvas starts at the top. */
      if (fromTribe && feedScroll && scrollKey === pageKey(location.hash)) {
        const y = feedScroll;
        requestAnimationFrame(() => window.scrollTo(0, y));
      }
    },
  });
})();
