/* HAALVING client view — Journey (PR-01/02/03/04 + PR-05 preview).
   The HAALVING Journey — four brick pillars side by side, one course of
   bricks per level: a level advance lays one more brick (TJ, 9 Aug: the
   monument's altar pillars read as complicated; the radial-web index is
   omitted). Plus the level-review countdown. Observation clients get an
   unbuilt variant. The care team moved to Profile as MY CIRCLE OF CARE. */
(function () {
  'use strict';

  var ORDER = ['fitness', 'culture', 'yoga', 'wellness'];

  /* ---- the HAALVING Journey bricks (9 Aug, TJ) ----
     The monument's altar pillars read as complicated, so the instrument
     came home to masonry: four towers stand side by side, one course of
     bricks per level — a level advance lays one more brick, and height IS
     the reading. No radial web, no averaged centre, nothing to decode.
     A level is EARNED OR NOT EARNED — there is no part-way state inside
     one (TJ, 9 Aug), so no course is ever drawn part-filled; the course
     under way says so by breathing instead. Pillar colour appears only in
     that pillar's own tower and label, per the colour law. Pure HTML/CSS
     — no art plate, no SVG. The HV.ui.index radar lives on unchanged in
     onboarding; the monument plates and their engine retired 9 Aug. */
  function brickIndex(levels, unlit) {
    /* read at render time, not module load — HV.store does not exist yet when
       this file is parsed, and Configuration can move the number afterwards */
    var LEVELS = HV.levels();
    var aria = unlit
      ? 'HAALVING Journey — the bricks wait: your four pillars start building when observation ends and your starting levels are set.'
      : 'HAALVING Journey — ' + ORDER.map(function (k) {
          return HV.PILLARS[k].name + ' level ' + levels[k] + ' of ' + LEVELS;
        }).join(', ') + '. Each level advance lays one more brick.';

    return '<div class="jbrk' + (unlit ? ' unlit' : '') + '" role="img" aria-label="' + HV.esc(aria) + '">' +
      ORDER.map(function (k) {
        var lv = unlit ? 0 : Math.max(1, Math.min(LEVELS, Number((levels || {})[k]) || 1));
        /* the course under way — the level this pillar is working toward.
           A finished tower (level 7) has none, and in observation nothing
           is under way yet. */
        var now = (unlit || lv >= LEVELS) ? 0 : lv + 1;
        /* courses render top-down so level 7 heads the tower. Every laid
           course carries its own level numeral; the course under way
           carries its numeral too and breathes; the rest are empty slots
           waiting to be filled. */
        var bricks = '';
        for (var i = LEVELS; i >= 1; i--) {
          var st = i <= lv ? 'on' : (i === now ? 'now' : 'wait');
          bricks += '<span class="jb ' + st + '">' +
            (st === 'wait' ? '' : '<i class="jbn num">' + i + '</i>') +
          '</span>';
        }
        return '<div class="jcol p-' + k + '">' +
          '<span class="jstack">' + bricks + '</span>' +
          '<span class="jname">' + HV.esc(HV.PILLARS[k].name) + '</span>' +
          '<span class="jlv"><small>LEVEL</small>' +
            '<b class="num">' + (unlit ? '—' : lv) + '</b></span>' +
        '</div>';
      }).join('') + '</div>';
  }

  /* ---------------- standard variant ---------------- */
  function renderStandard(el, c) {
    /* Each pillar climbs on its own (TJ, 16 Aug) — there is no headline level
       and no lowest-pillar rule, so nothing here reduces four numbers to one.
       The towers already say it: four heights, read side by side. */
    var rev = HV.reviewDay();
    var daysLeft = rev - c.day;
    var reviewLine = c.day >= rev ? 'Review today' : 'Level review in ' + daysLeft + (daysLeft === 1 ? ' day' : ' days');

    el.innerHTML =
      /* Trackers owns the page identity now — the heading survives for the
         rotor only, and the cycle/day line rides Trackers' scene band */
      '<h2 class="vh">Your journey</h2>' +

      /* the towers speak for themselves — a brick laid is a level earned;
         the header names the instrument and the masonry carries the rest */
      '<div class="card"><span class="k">HAALVING Journey</span>' +
      brickIndex(c.levels) +
      '</div>' +

      '<div class="sec-title">Level review</div>' +
      '<div class="trow">' + HV.ui.iconTile('cal', 'sm') +
      '<span class="grow"><b>' + reviewLine + '</b><small>Your care team confirms every level change together — nothing moves without them.</small></span>' +
      HV.ui.pill('Day ' + rev + ' of ' + HV.cycleDays(), c.day >= rev ? 'warn' : 'neutral') + '</div>' +
      '<p class="sub" style="margin:var(--s2) 0 0">Each pillar climbs on its own — a level earned in one is yours to keep, whatever the other three are doing.</p>' +

      '<button class="btn ghost block" id="btn-levelup">Preview a level-up</button>';

    el.querySelector('#btn-levelup').addEventListener('click', function () {
      HV.celebrate('award', 'Level up!', 'Fitness moves to L4 — your care team just confirmed it.');
    });
  }

  /* ---------------- observation variant (neutral, care-toned) ---------------- */
  function renderObservation(el, c) {
    var left = Math.max(0, 5 - c.day);
    var wrapLine = left === 0 ? 'Observation wraps up today' : 'Observation wraps up in ' + left + (left === 1 ? ' day' : ' days');

    el.innerHTML =
      '<h2 class="vh">Your journey</h2>' +

      '<div class="notice">Five quiet days — we learn your normal before we shape it.</div>' +

      '<div class="card"><span class="k">What happens after day 5</span>' +
      '<div class="list" style="margin-top:8px">' +
      '<div class="trow">' + HV.ui.iconTile('users', 'sm') + '<span class="grow">Your care team sets your starting levels <b>with</b> you<small>Nothing is decided about you without you</small></span></div>' +
      '<div class="trow">' + HV.ui.iconTile('grid', 'sm') + '<span class="grow">Your four pillars start building<small>One brick per level — <span class="num">' + HV.levels() + '</span> bricks finish a pillar</small></span></div>' +
      '<div class="trow">' + HV.ui.iconTile('sprout', 'sm') + '<span class="grow">Sessions and gentle ratings begin<small>Always encouraging, never punitive</small></span></div>' +
      '</div></div>' +

      '<div class="sec-title">Your HAALVING Journey</div>' +
      '<div class="card">' +
      brickIndex({ fitness: 1, culture: 1, yoga: 1, wellness: 1 }, true) +
      '<p class="sub" style="margin:var(--s3) 0 0; text-align:center">The bricks wait for you. When observation ends your care team sets your starting levels with you — then each pillar lays one brick per level, <span class="num">' + HV.levels() + '</span> courses to the top.</p></div>' +

      '<div class="trow">' + HV.ui.iconTile('cal', 'sm') +
      '<span class="grow"><b>' + wrapLine + '</b><small>Keep logging as you normally would — that’s all we need.</small></span>' +
      HV.ui.pill('Day ' + c.day + ' of 5', 'neutral') + '</div>' +

      '<button class="btn ghost block" id="btn-how">How the journey works</button>';

    el.querySelector('#btn-how').addEventListener('click', function () {
      HV.sheet(
        '<div class="h1">The <span class="num">' + HV.levels() + '</span>-level journey</div>' +
        '<p class="sub" style="margin:0">' + HV.copy.journeyLine() +
          ' of small, steady steps across four pillars.</p>' +
        '<div class="list">' +
        ORDER.map(function (k) {
          var p = HV.PILLARS[k];
          return '<div class="trow">' + HV.ui.pillarChip(k) + '<span class="grow"><small>' + HV.esc(p.sub) + '</small></span></div>';
        }).join('') +
        '</div>' +
        '<p class="sub" style="margin:0">Every level change is confirmed by your care team — you’re never graded by a machine.</p>' +
        '<button class="btn block" id="sh-ok">Got it</button>',
        function (sheet) {
          sheet.querySelector('#sh-ok').addEventListener('click', function () {
            HV.closeSheet();
            HV.toast('No rush, ' + c.name.split(' ')[0] + ' — we’re still learning your normal');
          });
        }
      );
    });
  }

  /* The standalone view retired 9 Aug (TJ): Journey lost its bottom-bar
     seat and renders as a tab inside Trackers, which calls this. The file,
     both renderers and the #/journey route all survive — the route
     redirects to #/trackers/journey via ROUTE_ALIASES in core. */
  HV.journeyPage = function (el, c) {
    if (c.observation) renderObservation(el, c);
    else renderStandard(el, c);
  };
})();
