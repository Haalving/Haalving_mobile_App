/* TB-03 · My Tribe, the honeycomb — the second version of the tribe page,
   built 6 Aug 2026 after the client read the feed version as Instagram.

   The two pages are a SHELL swap, not a content fork. Everything the tribe
   actually contains — the daily Health Games book, the events deck, the challenges
   deck and their detail pages — still lives in client-tribe.js and is opened
   here through HV.tribeFaces.open(params, home, onChange). This file owns only
   the way in: a greeting, three hexagons, four tiles, and the short list of
   what you have joined.

       #/tribe            this page, the honeycomb
       #/tribe/quiz       ─┐
       #/tribe/events      ├─ HV.tribeFaces — client-tribe.js draws these
       #/tribe/challenges  │
       #/tribe/event/ev1   │
       #/tribe/challenge/ch1 ─┘
       #/tribe/partners   ─┐ this file draws these two
       #/tribe/learn      ─┘
       #/tribe-classic    Haalving Zone — the canvases page (client-tribe.js);
                          the third hexagon is its door

   Same load-bearing rule as the feed page: NEVER call HV.refresh() from here.
   Core's render() wipes #app, which would tear down an open sheet mid-tap;
   every mutation patches the DOM in place instead (patchHive below). */
(function () {
  'use strict';

  const HOME = '#/tribe';
  const CLASSIC = '#/tribe-classic';
  const feed = () => HV.store.tribeFeed;

  /* Is this hash the honeycomb or one of its faces? It must NOT be a bare
     prefix test: '#/tribe-classic'.indexOf('#/tribe') is 0, so a plain
     startsWith would count every visit to the feed page as a visit to this
     one and hand it the wrong scroll position. */
  const isHome = h => h === HOME || h.indexOf(HOME + '/') === 0;

  /* core's render() rebuilds the view and scrolls to top on every route change.
     Opening a face hides that — the sheet covers the page — and then reveals it
     the moment you close one: you land back at the top with the row you tapped
     off screen. This listener runs on EVERY hash change, before core re-renders,
     while the page is still on screen at the reader's position. Only moves that
     START here are remembered, so arriving from another tab still opens at the
     top. Same two halves the feed page has carried since v116. */
  let pageScroll = 0;
  let fromHive = false;
  window.addEventListener('hashchange', function (e) {
    fromHive = isHome(new URL(e.oldURL).hash);
    if (fromHive) pageScroll = window.scrollY;
  });

  /* escape, then set every numeral in the serif data face */
  const numWrap = s => HV.esc(s).replace(/\d[\d,.:]*/g, '<span class="num">$&</span>');

  /* every navigation on this page is a [data-go] hash — one wiring for the
     hexagons, the tiles, the joined rows, the back chevrons and the close X */
  function wireGo(root) {
    root.querySelectorAll('[data-go]').forEach(b =>
      b.addEventListener('click', () => HV.go(b.dataset.go)));
  }

  /* ---------- the two shelves ----------
     Static reference lists with no user state — nothing here is ever written
     back, so they stay constants in the view rather than becoming seed fields
     that HV.boot has to refill on every launch. */

  const SHELVES = {
    partners: {
      title: 'Our Partners',
      blurb: 'The places HAALVING has already vetted, so a day away from your plan ' +
             'is still a day on it. Your coach can book any of these for you.',
      foot: 'Partner rates apply to Poorna memberships.',
      items: [
        { icon: 'flask',    name: 'Thyrocare · Kochi',            note: 'Home draws before 8 AM · your Vital Panel updates the same evening' },
        { icon: 'leaf',     name: 'Kairali Ayurvedic Group',      note: 'Panchakarma weeks in Palakkad and Thrissur' },
        { icon: 'dumbbell', name: 'Anytime Fitness · Kakkanad',   note: 'Open-gym access on any Fitness day away from home' },
        { icon: 'meditate', name: 'Sivananda Yoga · Neyyar Dam',  note: 'Weekend intensives · counts as your Yoga block' },
        { icon: 'bowl',     name: 'Blue Zones Kitchen · Panampilly', note: 'Plates cooked to your dietitian’s plan, delivered' },
        { icon: 'device',   name: 'Ultrahuman',                   note: 'Ring and patch readings flow straight into Trackers' },
      ],
    },
    learn: {
      title: 'E-Learning & Content',
      blurb: 'The reading behind the plan — why the four pillars are the four ' +
             'pillars, in the words of the people who set them.',
      foot: 'New pieces land on the first day of every cycle.',
      items: [
        { icon: 'doc',   kind: 'Read',   name: 'The nine lessons of the Blue Zones', note: '12 min · Buettner’s original nine, annotated for a Kerala kitchen' },
        { icon: 'video', kind: 'Film',   name: 'Hara hachi bu at an Indian table',   note: '8 min · Sneha M. on stopping at eighty per cent' },
        { icon: 'video', kind: 'Film',   name: 'Why your level moves on day nine',   note: '6 min · Anand K. on how each pillar climbs' },
        { icon: 'doc',   kind: 'Read',   name: 'Reading your own Vital Panel',       note: '15 min · what a flagged marker does and does not mean' },
        { icon: 'mic',   kind: 'Listen', note: '31 min · a fisherman, a farmer and a monk on the same question', name: 'Purpose, in three voices' },
        { icon: 'doc',   kind: 'Read',   name: 'The downshift, and why every Blue Zone has one', note: '9 min · prayer, naps, tea and the ancestors' },
      ],
    },
  };

  /* ---------- the honeycomb ---------- */

  const today = tf => tf.quizDays[0];
  const answeredToday = tf => today(tf).qs.filter(q => q.answered != null).length;

  /* Three doors, and one live line each so a hexagon is never just a label.
     `key` doubles as the fill class and as patchHive's handle on the meta —
     keys stay quiz/event/chal (frozen, like every key vocabulary here) while
     the labels carry the display names (TJ, 8 Aug): the event door holds both
     kinds of gathering, and the chal door became the way into Haalving Zone,
     the canvases page. */
  function hexDefs(tf) {
    const done = answeredToday(tf);
    const total = today(tf).qs.length;
    const zones = (tf.zones || []).length;
    return [
      { key: 'quiz',  label: 'Health Games', icon: 'bulb',  go: HOME + '/quiz',
        meta: done ? done + ' of ' + total + ' today'
                   : total + (total === 1 ? ' question today' : ' questions today') },
      { key: 'event', label: 'Events & Challenges', icon: 'cal', go: HOME + '/events',
        meta: (tf.events.length + tf.challenges.length) + ' to join' },
      /* the VISIBLE count — a hexagon promising 7 posts that opens onto 6
         because one was hidden is a live bug, not a rounding difference */
      { key: 'chal',  label: 'Haalving Zone', icon: 'zone', go: CLASSIC,
        meta: (tf.posts || []).filter(p => !p.hidden).length +
              ' posts · ' + zones + (zones === 1 ? ' zone' : ' zones') },
    ];
  }

  function hexBtn(h) {
    return '<button class="hx hx-' + h.key + '" data-go="' + h.go + '">' +
      '<span class="hxi" aria-hidden="true">' + HV.ui.icon(h.icon) + '</span>' +
      '<span class="hxl">' + HV.esc(h.label) + '</span>' +
      '<span class="hxm">' + numWrap(h.meta) + '</span>' +
      '</button>';
  }

  /* Two above, one nested below — the reference's arrangement, and the reason
     the hexagons are cut by clip-path as well as masked: the mask is only a
     picture, but the clip decides where a tap lands, so the two top cells
     cannot steal each other's taps across the gutter.
     The four ghosts are half off the section on every side; overflow:hidden
     trims them, and they are what make three cells read as part of a comb. */
  function combHtml(tf) {
    const d = hexDefs(tf);
    return '<div class="hxcomb">' +
      '<span class="hxghost g1" aria-hidden="true"></span>' +
      '<span class="hxghost g2" aria-hidden="true"></span>' +
      '<span class="hxghost g3" aria-hidden="true"></span>' +
      '<span class="hxghost g4" aria-hidden="true"></span>' +
      '<div class="hxrow">' + hexBtn(d[0]) + hexBtn(d[1]) + '</div>' +
      '<div class="hxrow">' + hexBtn(d[2]) + '</div>' +
      '</div>';
  }

  /* ---------- the four tiles ---------- */

  const TILES = [
    { icon: 'award', label: 'Our Partners',          go: HOME + '/partners' },
    { icon: 'doc',   label: 'E-Learning & Content',  go: HOME + '/learn' },
    { icon: 'grid',  label: 'Placeholder 3', soon: true },
    { icon: 'flow',  label: 'Placeholder 4', soon: true },
  ];

  function tilesHtml() {
    return '<div class="hxtiles">' + TILES.map(t =>
      '<button class="hxtile' + (t.soon ? ' soon' : '') + '"' +
        (t.go ? ' data-go="' + t.go + '"' : ' data-soon') + '>' +
        HV.ui.iconTile(t.icon, 'sm') +
        '<b>' + HV.esc(t.label) + '</b>' +
        (t.soon ? HV.ui.pill('Soon', 'neutral') : '') +
      '</button>').join('') + '</div>';
  }

  /* ---------- what you have joined ----------
     Status by exception: a client who has joined nothing gets no section at
     all. The empty <section> still ships, because it is what patchHive fills
     when an enrolment lands while a sheet is open over this page. */

  function joinedList(tf) {
    return tf.events.filter(e => e.going).map(e =>
        ({ id: e.id, kind: 'event', icon: 'cal',   title: e.title, sub: e.when + ' · ' + e.where }))
      .concat(tf.challenges.filter(c => c.joined).map(c =>
        ({ id: c.id, kind: 'challenge', icon: 'flame', title: c.title, sub: c.days + ' days · running now' })));
  }

  function joinedHtml(tf) {
    const mine = joinedList(tf);
    if (!mine.length) return '';
    return '<div class="sec-title">What you have joined</div>' +
      '<div class="list">' + mine.map(m =>
        '<button class="trow click" data-go="' + HOME + '/' + m.kind + '/' + m.id + '">' +
          HV.ui.iconTile(m.icon, 'sm') +
          '<span class="grow"><b>' + HV.esc(m.title) + '</b><small>' + numWrap(m.sub) + '</small></span>' +
          HV.ui.icon('chevR') +
        '</button>').join('') + '</div>';
  }

  /* ---------- the shelf sheets ---------- */

  function sheetHead(title) {
    return '<div class="tsh">' +
      '<button class="tback" data-go="' + HOME + '" aria-label="Back">' + HV.ui.icon('chevL') + '</button>' +
      '<div class="h1">' + HV.esc(title) + '</div>' +
      '<button class="tsheet-x" data-go="' + HOME + '" aria-label="Close">' + HV.ui.icon('x') + '</button></div>';
  }

  /* the sheet's links, plus the backdrop. Core already closes the sheet when
     the backdrop is tapped — this only brings the URL along, so Back
     afterwards leaves the tab instead of reopening the shelf. */
  function wireSheet(sheet) {
    wireGo(sheet);
    const ov = sheet.parentElement;
    ov.addEventListener('click', e => { if (e.target === ov) HV.go(HOME); });
  }

  function openShelf(which) {
    const s = SHELVES[which];
    HV.sheet(
      '<div class="tsheet">' + sheetHead(s.title) +
        '<div class="tsheet-scroll">' +
          '<p class="tdesc">' + HV.esc(s.blurb) + '</p>' +
          '<div class="list">' + s.items.map(it =>
            '<div class="trow">' + HV.ui.iconTile(it.icon, 'sm') +
              '<span class="grow"><b>' + HV.esc(it.name) + '</b><small>' + numWrap(it.note) + '</small></span>' +
              (it.kind ? HV.ui.pill(it.kind, 'info') : '') +
            '</div>').join('') + '</div>' +
          '<p class="audit">' + HV.esc(s.foot) + '</p>' +
        '</div></div>',
      wireSheet, 'tall');
  }

  /* ---------- routing ----------
     One place decides which face is open, so a hand-typed URL, a hexagon tap
     and the phone's Back button all land in the same state. Anything this file
     does not own is handed to the shared faces, which close the sheet when the
     sub-route is empty or unknown. */
  function openFace(params) {
    const a = params[0];
    if (a === 'partners' || a === 'learn') openShelf(a);
    else HV.tribeFaces.open(params, HOME, patchHive);
  }

  /* the host redraw the shared faces call after a join or a quiz answer: the
     hexagon meta lines and the joined list, patched where they stand */
  function patchHive() {
    const tf = feed();
    hexDefs(tf).forEach(h => {
      const m = document.querySelector('.hx-' + h.key + ' .hxm');
      if (m) m.innerHTML = numWrap(h.meta);
    });
    const box = document.querySelector('[data-joined]');
    if (box) { box.innerHTML = joinedHtml(tf); wireGo(box); }
  }

  /* ---------- the page ---------- */

  HV.registerView('tribe', {
    title: 'Community',
    roles: ['client'],

    render(el, params) {
      HV.tribeFaces.heal();
      const tf = feed();

      el.innerHTML =
        '<div class="hxhead">' +
          /* the route's name leads the h1 and the greeting follows it: a rotor
             listing headings has to say which page this is, and "Welcome,
             Mathew" does not. Sighted readers see only the greeting. */
          '<h1 class="hxgreet"><span class="vh">Community. </span>' +
            '<span>Welcome,</span>' + HV.esc(HV.me().name) + '</h1>' +
        '</div>' +
        combHtml(tf) +
        tilesHtml() +
        '<section data-joined>' + joinedHtml(tf) + '</section>';

      wireGo(el);
      el.querySelectorAll('[data-soon]').forEach(b =>
        b.addEventListener('click', () => HV.toast('This one is still being built.')));

      /* core scrolls to top right after this render returns — put the page back
         on the next frame, once that has happened */
      if (fromHive && pageScroll) {
        const y = pageScroll;
        requestAnimationFrame(() => window.scrollTo(0, y));
      }

      openFace(params);
    },
  });
})();
