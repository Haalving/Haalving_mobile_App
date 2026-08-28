/* HAALVING console view — Catalog. Five item libraries coaches author from —
   Nutrition foods, Fitness exercises, Yoga asanas, Mind Wellness practices and
   Motivation films — and the Templates built out of them.

   The shape of the page is the shape of the idea: the libraries are
   INGREDIENTS, a template is a RECIPE. A template names one pillar, one level
   and one activity category, and holds one day per day of the cycle.

   #/library/<pillar> still works — core.js aliases it onto the matching pillar
   tab here. The level books that used to sit in a sixth tab are gone as a
   browsing surface but entirely intact as data; see the note where they were. */
(function () {
  'use strict';

  /* who edits which pillar without editAnyCatalog — same matrix console-
     builder.js and console-clients.js already carry for the same purpose */
  var ROLE_PILLAR = { dietitian: 'culture', fitness: 'fitness', yoga: 'yoga', mind: 'wellness' };
  var PILLAR_KEYS = ['fitness', 'yoga', 'culture', 'wellness'];
  /* the libraries this page lists. Motivation — the morning films — is a fifth
     library, NOT a fifth pillar: HV.PILLARS stays at four, so anything that
     wants a display name here has to go through libName() rather than
     HV.PILLARS[k].name. Nobody's pillar owns it, so ROLE_PILLAR never points
     at it and canEditPillar() falls through to editAnyCatalog — Ops and the
     Super User author films, pillar coaches read them. */
  var LIB_KEYS = PILLAR_KEYS.concat(['motivation']);
  /* Books retired as a TAB (TJ, 17 Aug) — the level books are still read by
     HV.tasks and the client's Today screen, so the DATA stays exactly where it
     was; only the browsing surface is gone. The page is now five libraries and
     the templates built out of them, which is the whole idea of the screen. */
  var VALID_TABS = LIB_KEYS.concat(['templates']);
  /* THE THREE TIERS, and the whole visual problem this page had.
     A library is an aisle — you are in exactly one. A CATEGORY is the shelf —
     every item sits on exactly one. A TAG is a sticker on the jar — an item
     carries any number, and they cut across aisles and shelves. The old page
     drew categories and tags as the same pill in the same row, so fifteen
     identical chips scrolled past and nothing said which were exclusive.

     Categories and tags both live in the store now, edited in Configuration →
     Catalog, and are read ONLY through HV.tracks() / HV.catTags(). There used
     to be a private copy of the category list here AND a dead HV.TRACKS in
     core.js; one list read one way is the point. */
  function TRACKS() {
    return HV.tracks().map(function (t) { return { key: t.k, label: t.t }; });
  }
  /* One inline style block, .cat- prefixed, tokens only — the same convention
     Configuration keeps. Everything here is reachable only from this page's own
     render() or the sheets it opens, so it may live in the view. `.tvid` does
     NOT: the client's instruction sheet uses it, and a sheet that is only
     styled once some other view has rendered is the defect that printed
     "Mon6:00 am12:00 pm" in v198. That rule lives in app.css. */
  var STYLE =
    '<style>' +
    '.catfil{display:flex; flex-direction:column; gap:var(--s2); margin:var(--s4) 0 var(--s3)}' +
    '.catfrow{display:flex; align-items:center; gap:var(--s3); min-width:0}' +
    '.catfl{flex:none; width:5.5em; font-size:var(--t-micro); font-weight:600; letter-spacing:.06em;' +
      ' text-transform:uppercase; color:var(--ink-3)}' +
    /* the shelf: ONE recessed track, the chosen member raised out of it */
    '.catseg{display:inline-flex; flex:none; gap:2px; padding:3px; border-radius:var(--r-full);' +
      ' background:var(--surface-2); max-width:100%; overflow-x:auto; scrollbar-width:none}' +
    '.catseg::-webkit-scrollbar{display:none}' +
    '.catseg button{flex:none; min-height:34px; padding:var(--s1) var(--s4); border-radius:var(--r-full);' +
      ' font-size:var(--t-sm); font-weight:600; color:var(--ink-3); white-space:nowrap;' +
      ' transition:background var(--d-fast) var(--ease), color var(--d-fast) var(--ease)}' +
    '.catseg button:hover{color:var(--ink-2)}' +
    '.catseg button.on{background:var(--bg); color:var(--ink); box-shadow:var(--e1)}' +
    /* the stickers: smaller, additive, each carrying what it would leave */
    '.cattags{display:flex; flex-wrap:wrap; gap:var(--s1); min-width:0}' +
    '.cattags button{display:inline-flex; align-items:center; gap:var(--s1); min-height:30px;' +
      ' padding:var(--s1) var(--s3); border-radius:var(--r-full); background:var(--surface-2);' +
      ' font-size:var(--t-micro); font-weight:600; color:var(--ink-2); white-space:nowrap;' +
      ' transition:background var(--d-fast) var(--ease), color var(--d-fast) var(--ease)}' +
    '.cattags button .num{color:var(--ink-3); font-size:var(--t-micro)}' +
    '.cattags button:hover:not(:disabled){background:var(--brand-wash); color:var(--ink)}' +
    '.cattags button.on{background:var(--brand-fill); color:#fff}' +
    '.cattags button.on .num{color:rgba(255,255,255,.75)}' +
    '.cattags button:disabled{opacity:.4; cursor:default}' +
    '.cattags.pick{margin-bottom:var(--s2)}' +
    '.catgone{font-size:var(--t-micro); font-weight:500; color:var(--ink-3); font-style:italic}' +
    /* the media preview inside the author sheet */
    '.catprev{display:flex; flex-direction:column; gap:var(--s2); margin:var(--s2) 0 var(--s3)}' +
    '.catprev .tcard.bad{outline:2px solid var(--danger); outline-offset:2px}' +
    '.catsteps{margin:var(--s2) 0; padding-left:var(--s5); display:flex; flex-direction:column; gap:var(--s2)}' +
    '.catsteps li{color:var(--ink-2); line-height:1.5}' +
    /* .grow is scoped to .row, NEVER .trow — without this the trailing pill on
       every catalog row sits mid-row instead of at the edge */
    '.catrow .grow{flex:1; min-width:0}' +
    /* the item's picture, larger than the 64px .tcard the client's Today card
       uses, and filling its tile rather than sitting inside .tcard's 84% inset.
       This row is half again as tall — a name, two lines of instruction and a
       sticker — so at 64px inset the specimen read as a decorative dot at the
       far edge instead of as the item's face. */
    '.catthumb{width:80px; height:80px}' +
    '.catthumb img{width:100%; height:100%}' +
    /* the composer: grid on the left, the day being written on the right, a
       draggable seam between. The seam is the Clients workspace recipe, and
       the width rides its own CSS variable so the two surfaces remember their
       own sizes. On a phone the wrap stacks and the seam retires — pure CSS,
       so there is exactly ONE code path through the editor. */
    '.cattplwrap{display:flex; align-items:stretch; gap:0; margin-top:var(--s3)}' +
    '.cattplmain{flex:1; min-width:0}' +
    '.cattplseam{flex:none; width:7px; margin:0 var(--s3); cursor:col-resize; position:relative;' +
      ' z-index:5; touch-action:none; border-radius:var(--r-full)}' +
    '.cattplseam::after{content:""; position:absolute; inset:0 3px; background:var(--line-soft);' +
      ' border-radius:var(--r-full)}' +
    '.cattplseam:hover::after,.cattplseam.drag::after,.cattplseam:focus-visible::after{' +
      ' inset:0 2px; background:var(--brand-2)}' +
    '.cattplpad{width:var(--tplw, 380px); flex:none; min-width:0; display:flex;' +
      ' flex-direction:column; gap:var(--s3); align-self:flex-start; position:sticky;' +
      ' top:var(--s4); max-height:calc(100dvh - var(--s8)); overflow-y:auto;' +
      ' background:var(--surface); border-radius:var(--r-lg); padding:var(--s4);' +
      ' box-shadow:var(--e1)}' +
    '@media (max-width:860px){' +
      '.cattplwrap{flex-direction:column; gap:var(--s4)}' +
      '.cattplseam{display:none}' +
      '.cattplpad{width:auto; align-self:stretch; position:static; max-height:none}' +
    '}' +
    /* the nutrition template's daily targets, on the template's own card */
    '.cattgt{display:flex; flex-wrap:wrap; align-items:center; gap:var(--s2); margin-top:var(--s3)}' +
    '</style>';

  /* ---- the dish renders, and the one prompt that makes them all alike ----
     GEN_STYLE is `tools/genphoto.sh`'s STYLE recipe, word for word. That fixed
     preamble IS the house style: one lighting setup, one background, one
     framing ratio, so twenty-four dishes photographed months apart still read
     as one set. A coach adds a clause; the preamble is not theirs to change.

     Delivery comes from renders made offline through that exact pipeline —
     nothing generates in the browser. What the coach is shown is therefore the
     真 prompt behind the picture they get, which is the only version of this
     that is worth demonstrating.

     Every subject seats its food on a NON-WHITE vessel — banana leaf,
     terracotta, dark ceramic, brass, copper. process.py flood-keys near-white
     to alpha, so a white plate touching the frame edge is eaten by its own
     background. */
  var GEN_STYLE = function (subject) {
    return 'Professional studio photograph of ' + subject +
      ', soft even diffuse lighting, gentle shadows inside the subject only, ' +
      'centered and isolated on a pure seamless white background, nothing else ' +
      'in frame, no props, no text, subject fills 75 percent of the frame';
  };
  var DISH_POOL = {
    'ci-idli':       { subject: 'two soft steamed white rice idlis on a fresh green banana leaf',
                       imgs: ['img/dishes/dish-idli-1.webp', 'img/dishes/dish-idli-2.webp'] },
    'ci-chutney':    { subject: 'a small terracotta bowl of fresh coconut chutney topped with a mustard-seed tempering and one curry leaf',
                       imgs: ['img/dishes/dish-chutney-1.webp', 'img/dishes/dish-chutney-2.webp'] },
    'ci-dosa':       { subject: 'a golden crisp plain dosa folded in half on a fresh green banana leaf',
                       imgs: ['img/dishes/dish-dosa-1.webp', 'img/dishes/dish-dosa-2.webp'] },
    'ci-sambar':     { subject: 'a rustic brass bowl of sambar lentil stew with visible drumstick and carrot pieces',
                       imgs: ['img/dishes/dish-sambar-1.webp', 'img/dishes/dish-sambar-2.webp'] },
    'ci-oats':       { subject: 'a dark ceramic bowl of cooked oats porridge topped with sliced banana and almonds',
                       imgs: ['img/dishes/dish-oats-1.webp', 'img/dishes/dish-oats-2.webp'] },
    'ci-cheela':     { subject: 'two golden moong dal cheela savoury pancakes folded on a dark ceramic plate',
                       imgs: ['img/dishes/dish-cheela-1.webp', 'img/dishes/dish-cheela-2.webp'] },
    'ci-paneer':     { subject: 'a grilled paneer salad with charred paneer cubes over fresh greens on a dark slate plate',
                       imgs: ['img/dishes/dish-paneer-1.webp', 'img/dishes/dish-paneer-2.webp'] },
    'ci-curdrice':   { subject: 'a dark ceramic bowl of creamy curd rice topped with a mustard-seed and curry-leaf tempering',
                       imgs: ['img/dishes/dish-curdrice-1.webp', 'img/dishes/dish-curdrice-2.webp'] },
    'ci-ragi':       { subject: 'a dark ceramic bowl of smooth ragi finger millet porridge with a small spoon of jaggery',
                       imgs: ['img/dishes/dish-ragi-1.webp', 'img/dishes/dish-ragi-2.webp'] },
    'ci-sprouts':    { subject: 'a wide dark bowl of mixed bean sprouts chaat with chopped onion tomato and fresh coriander',
                       imgs: ['img/dishes/dish-sprouts-1.webp', 'img/dishes/dish-sprouts-2.webp'] },
    'ci-upma':       { subject: 'a dark ceramic bowl of vegetable upma garnished with curry leaves and grated coconut',
                       imgs: ['img/dishes/dish-upma-1.webp', 'img/dishes/dish-upma-2.webp'] },
    'ci-buttermilk': { subject: 'a copper tumbler of spiced buttermilk topped with fresh coriander and a pinch of roasted cumin',
                       imgs: ['img/dishes/dish-buttermilk-1.webp', 'img/dishes/dish-buttermilk-2.webp'] },
  };

  function libName(k) { return HV.PILLARS[k] ? HV.PILLARS[k].name : 'Motivation'; }
  /* a film is watched, not performed — there is no activity level to prescribe
     it at, so the Motivation tab drops the track filter and the track field */
  function hasTrack(k) { return k !== 'motivation'; }

  var TABS = LIB_KEYS.map(function (k) { return { key: k, label: libName(k) }; })
    .concat([{ key: 'templates', label: 'Templates' }]);

  /* transient filter state, one bucket per library tab — never persisted,
     same convention as the old Library screen's own `track` variable */
  var filters = {};
  LIB_KEYS.forEach(function (k) { filters[k] = { track: '', tags: [], q: '' }; });

  function canEditPillar(pillar) {
    var me = HV.me();
    return !!me && (HV.can('editAnyCatalog') || (HV.can('editCatalog') && ROLE_PILLAR[me.role] === pillar));
  }
  function canDeleteItem() { return HV.can('editAnyCatalog'); }

  function firstSentence(s) {
    var t = String(s || '');
    var cut = t.search(/[.!?]/);
    return cut > 0 ? t.slice(0, cut + 1) : t;
  }

  /* Every tag this library could offer: the governed vocabulary, plus anything
     already on an item that has since left it — a tag in use must stay
     filterable or the items wearing it become unreachable.

     Object.create(null), not {}: a plain object inherits Object.prototype, so a
     tag named `constructor`, `toString` or `__proto__` tested truthy and was
     silently dropped from the chip row while still printing on the item. */
  function tagUnion(items) {
    var seen = Object.create(null), out = [];
    var add = function (t) { if (!seen[t]) { seen[t] = true; out.push(t); } };
    HV.catTags().forEach(add);
    items.forEach(function (it) { (it.tags || []).forEach(add); });
    return out;
  }

  /* How many items a tag would leave on screen, counted against everything
     EXCEPT the tag filter itself. That is what makes a faceted count honest:
     it answers "how many would I get if I added this", not "how many exist". */
  function tagCount(items, f, tag) {
    return items.filter(function (it) {
      if (f.track && it.track !== f.track) return false;
      if (!qMatches(it, f.q)) return false;
      return (it.tags || []).indexOf(tag) !== -1;
    }).length;
  }

  function qMatches(it, q) {
    var s = String(q || '').trim().toLowerCase();
    if (!s) return true;
    return (it.name || '').toLowerCase().indexOf(s) !== -1 ||
           (it.instructions || '').toLowerCase().indexOf(s) !== -1;
  }

  function matchesFilter(it, f) {
    if (f.track && it.track !== f.track) return false;
    if (f.tags.length && !(it.tags || []).some(function (t) { return f.tags.indexOf(t) !== -1; })) return false;
    return qMatches(it, f.q);
  }

  function findItem(pillar, id) {
    return (HV.store.catalog[pillar] || []).filter(function (it) { return it.id === id; })[0] || null;
  }

  /* ---------------- pillar tab: filter bar + list ---------------- */

  /* The two filter rows, drawn as the two DIFFERENT questions they are.

     Category is a segmented control — one recessed track, one raised member —
     because it is a pick-exactly-one question, and that shape says so without
     a word of copy. Tags are small counted chips on their own row, because
     that is a pick-any-number question.

     A zero-count tag is DISABLED, never hidden. A chip row that reshuffles as
     you filter is unreadable, and hiding the active chip would strand the
     filter with no way back — the defect People & Access already guards. */
  function chipsRowHtml(pillar, items) {
    var f = filters[pillar];
    var seg = '';
    if (hasTrack(pillar)) {
      var members = [{ key: '', label: 'All' }].concat(TRACKS());
      /* an item filed under a category that has since been deleted keeps a
         member of its own, or the row would silently hide those items' shelf */
      var known = {};
      members.forEach(function (m) { known[m.key] = true; });
      items.forEach(function (it) {
        if (it.track && !known[it.track]) { known[it.track] = true; members.push({ key: it.track, label: HV.trackLabel(it.track), gone: true }); }
      });
      seg = '<div class="catfrow"><span class="catfl">Category</span>' +
        '<div class="catseg" role="group" aria-label="Filter by category">' +
        members.map(function (m) {
          var on = String(f.track || '') === m.key;
          return '<button data-track="' + HV.esc(m.key) + '" class="' + (on ? 'on' : '') + '"' +
            (on ? ' aria-current="true"' : '') + ' aria-pressed="' + on + '">' +
            HV.esc(m.label) + (m.gone ? ' <span class="catgone">removed</span>' : '') + '</button>';
        }).join('') + '</div></div>';
    }

    var all = tagUnion(items);
    var tagBtns = all.map(function (t) {
      var on = f.tags.indexOf(t) !== -1;
      var n = tagCount(items, f, t);
      return '<button data-tag="' + HV.esc(t) + '" class="' + (on ? 'on' : '') + '"' +
        (!n && !on ? ' disabled' : '') + ' aria-pressed="' + on + '">' +
        HV.esc(t) + '<span class="num">' + n + '</span></button>';
    }).join('');
    var tags = !all.length ? '' :
      '<div class="catfrow"><span class="catfl">Tags</span>' +
      '<div class="cattags" role="group" aria-label="Filter by tag">' + tagBtns + '</div></div>';

    return '<div id="cat-tfil" class="catfil">' + seg + tags + '</div>';
  }

  /* the trailing pill answers the question that library asks of an item. For a
     pillar that is "at what activity level?"; for a film it is "is there
     anything to play yet?" — an unlinked film still screens (the house film
     stands in), so this is a production status, not an error. */
  function itemPill(pillar, it) {
    if (hasTrack(pillar)) {
      var lbl = HV.trackLabel(it.track);
      return HV.ui.pill(lbl, 'neutral');
    }
    return HV.film.ytId(it.media && it.media.ref)
      ? HV.ui.pill('Linked', 'ok')
      : HV.ui.pill('Not filmed', 'neutral');
  }

  /* the item's own specimen, at the right edge of its row — the same picture
     the client meets on their Today card, resolved the way core.js resolves it
     there: the authored image, else the pillar's family art, so an item nobody
     has photographed yet reads as itself instead of as a broken tile.

     A film owns no specimen. Its authored poster comes first, then YouTube's
     own frame; an unlinked film shows NOTHING rather than wearing another
     film's face — the "Not filmed" pill beside it is already saying so. */
  function itemThumbHtml(pillar, it) {
    var src = HV.itemMedia(it).image;
    if (!src) {
      src = hasTrack(pillar)
        ? HV.ui.taskArtSrc(pillar, it.name)
        : (function () {
            var yt = HV.film.ytId(it.media && it.media.ref);
            return yt ? 'https://img.youtube.com/vi/' + yt + '/mqdefault.jpg' : '';
          })();
    }
    if (!src) return '';
    return '<span class="tcard catthumb" aria-hidden="true"><img src="' + HV.esc(src) +
      '" alt="" loading="lazy" decoding="async"></span>';
  }

  function itemRowHtml(pillar, it) {
    var tags = (it.tags || []).map(function (t) { return '<span class="chip">' + HV.esc(t) + '</span>'; }).join('');
    return '<button class="trow click catrow" data-item="' + HV.esc(it.id) + '">' +
      '<span class="grow"><b>' + HV.esc(it.name) + '</b>' +
      '<small>' + HV.esc(firstSentence(it.instructions)) + '</small>' +
      (tags ? '<span class="row" style="flex-wrap:wrap; gap:var(--s1); margin-top:var(--s1)">' + tags + '</span>' : '') +
      '</span>' + itemPill(pillar, it) + itemThumbHtml(pillar, it) + '</button>';
  }

  function listHtml(pillar, items) {
    var f = filters[pillar];
    var rows = items.filter(function (it) { return matchesFilter(it, f); });
    if (!rows.length) return HV.ui.empty('leaf', 'Nothing matches that filter.', 'Clear a chip or the search to see the full catalog.');
    return rows.map(function (it) { return itemRowHtml(pillar, it); }).join('');
  }

  function renderPillarTab(body, pillar) {
    var items = HV.store.catalog[pillar] || [];
    var can = canEditPillar(pillar);

    body.innerHTML =
      '<div class="row" style="justify-content:flex-end; margin-bottom:var(--s2)">' +
        (can ? '<button class="btn" id="cat-add">' + HV.ui.icon('plus') + 'Add item</button>' : '') +
      '</div>' +
      chipsRowHtml(pillar, items) +
      '<div style="margin:var(--s2) 0 var(--s3)"><input class="input" id="cat-q" type="search" ' +
        'placeholder="Search ' + HV.esc(libName(pillar)) + '" aria-label="Search ' + HV.esc(libName(pillar)) + '" ' +
        'autocomplete="off" value="' + HV.esc(filters[pillar].q) + '"></div>' +
      '<div class="list" id="cat-list">' + listHtml(pillar, items) + '</div>';

    function wireChips() {
      /* a segmented control SETS, never toggles — tapping the member you are
         already on must not drop you back to All, which is the one behaviour
         that makes a segmented control feel broken */
      body.querySelectorAll('#cat-tfil [data-track]').forEach(function (b) {
        b.addEventListener('click', function () {
          filters[pillar].track = b.dataset.track;
          paintChips(); paintList();
        });
      });
      body.querySelectorAll('#cat-tfil [data-tag]').forEach(function (b) {
        b.addEventListener('click', function () {
          var tag = b.dataset.tag, i = filters[pillar].tags.indexOf(tag);
          if (i === -1) filters[pillar].tags.push(tag); else filters[pillar].tags.splice(i, 1);
          paintChips(); paintList();
        });
      });
    }
    function wireRows() {
      body.querySelectorAll('#cat-list [data-item]').forEach(function (b) {
        b.addEventListener('click', function () { openDetailSheet(pillar, b.dataset.item); });
      });
    }
    function paintChips() {
      var wrap = body.querySelector('#cat-tfil');
      if (wrap) { wrap.outerHTML = chipsRowHtml(pillar, items); wireChips(); }
    }
    /* search re-paints ONLY the list, not the input that holds focus — a
       full innerHTML swap of the input's own parent would drop the cursor
       out of the field after every keystroke, same trap console-clients.js's
       rail search already works around with its own paintList() */
    function paintList() {
      var wrap = body.querySelector('#cat-list');
      if (wrap) { wrap.innerHTML = listHtml(pillar, items); wireRows(); }
    }

    wireChips();
    wireRows();
    var addBtn = body.querySelector('#cat-add');
    if (addBtn) addBtn.addEventListener('click', function () { openAuthorSheet(pillar, null); });
    var q = body.querySelector('#cat-q');
    /* the chip row is repainted too — tagCount already narrows by the query,
       so leaving it alone advertised "diabetes 2" over an empty list. It is a
       SIBLING of the input, never its parent, so the cursor stays put. */
    if (q) q.addEventListener('input', function () {
      filters[pillar].q = q.value;
      paintList();
      paintChips();
    });
  }

  /* ---------------- detail sheet ---------------- */

  function openDetailSheet(pillar, id) {
    var it = findItem(pillar, id);
    if (!it) return;
    var can = canEditPillar(pillar);
    var canDel = canDeleteItem();
    var tagsHtml = (it.tags || []).map(function (t) { return '<span class="chip">' + HV.esc(t) + '</span>'; }).join(' ');
    /* a film's preview is YouTube's own thumbnail, and it says out loud what
       happens when there is no link yet — the house film stands in, so the
       client's morning is never empty while production catches up */
    var ytid = hasTrack(pillar) ? null : HV.film.ytId(it.media && it.media.ref);
    /* the item exactly as the client meets it: the picture that lands on their
       Today card, then the film that plays inside their instruction sheet */
    var im = HV.itemMedia(it);
    var media = hasTrack(pillar)
      ? ((im.image
          ? '<span class="tcard"><img src="' + HV.esc(im.image) + '" alt="" loading="lazy" decoding="async"></span>'
          : '') + HV.ui.videoHtml(im.video, it.name))
      : (ytid
          ? '<span class="tcard"><img src="https://img.youtube.com/vi/' + HV.esc(ytid) +
            '/hqdefault.jpg" alt="" loading="lazy" decoding="async"></span>'
          : '');

    var nutrientHtml = '';
    if (pillar === 'culture' && it.nutrients) {
      var n = it.nutrients;
      /* micro keys are the Nutrient Panel roster's own — print the roster's
         name and unit, never the raw key ("Calcium … mg", not "calc 30") */
      var microRows = (n.micros || []).map(function (m) {
        var ref = microRef(m.k);
        return '<tr><td>' + HV.esc(ref ? ref.name : m.k) + '</td><td><span class="num">' +
          HV.esc(m.v) + '</span>' + (ref ? ' ' + HV.esc(ref.unit) : '') + '</td></tr>';
      }).join('');
      nutrientHtml =
        '<div class="sec-title">Nutrients' + (it.portion ? ' · per ' + HV.esc(portionWord(it.portion)) : '') + '</div>' +
        '<div class="tablewrap"><table class="data"><thead><tr><th>Nutrient</th><th>Amount</th></tr></thead><tbody>' +
        '<tr><td>Calories</td><td><span class="num">' + HV.esc(n.kcal) + '</span> kcal</td></tr>' +
        '<tr><td>Protein</td><td><span class="num">' + HV.esc(n.protein) + '</span> g</td></tr>' +
        '<tr><td>Carbs</td><td><span class="num">' + HV.esc(n.carbs) + '</span> g</td></tr>' +
        '<tr><td>Fat</td><td><span class="num">' + HV.esc(n.fat) + '</span> g</td></tr>' +
        '<tr><td>Fibre</td><td><span class="num">' + HV.esc(n.fibre) + '</span> g</td></tr>' +
        microRows + '</tbody></table></div>';
    }
    var allergyHtml = (pillar === 'culture' && it.allergies && it.allergies.length)
      ? '<div class="notice bad"><b>Contains:</b> ' + it.allergies.map(function (a) { return '<span class="chip">' + HV.esc(a) + '</span>'; }).join(' ') + '</div>'
      : '';

    HV.sheet(
      '<div class="kicker">' + HV.esc(libName(pillar).toUpperCase()) + '</div>' +
      '<div class="h1">' + HV.esc(it.name) + '</div>' +
      '<div class="row" style="margin:var(--s2) 0">' + itemPill(pillar, it) +
        (!hasTrack(pillar) && it.mins ? HV.ui.pill(it.mins + ' min', 'neutral') : '') + '</div>' +
      (media ? '<div style="margin:0 0 var(--s3)">' + media + '</div>' : '') +
      (!hasTrack(pillar) && !ytid
        ? '<div class="notice">No YouTube link yet. Until one is added, this morning plays the house film — nobody sees an empty screen.</div>'
        : '') +
      /* the instructions as the client will page them: one line, one step */
      (function () {
        var steps = String(it.instructions || '').split('\n')
          .map(function (s) { return s.trim(); }).filter(Boolean);
        if (steps.length < 2) return '<p class="sub">' + HV.esc(steps[0] || '') + '</p>';
        return '<ol class="catsteps">' +
          steps.map(function (s) { return '<li>' + HV.esc(s) + '</li>'; }).join('') + '</ol>';
      })() +
      (it.caution ? '<div class="notice warn"><b>Caution:</b> ' + HV.esc(it.caution) + '</div>' : '') +
      (tagsHtml ? '<div class="row" style="flex-wrap:wrap; gap:var(--s2); margin:var(--s3) 0 0">' + tagsHtml + '</div>' : '') +
      (it.notes ? '<div class="sec-title">Notes</div><p class="sub">' + HV.esc(it.notes) + '</p>' : '') +
      nutrientHtml + allergyHtml +
      '<div class="row" style="justify-content:flex-end; margin-top:var(--s4)">' +
        (can ? '<button class="btn ghost" id="cd-edit">' + HV.ui.icon('pencil') + 'Edit</button>' : '') +
        (canDel ? '<button class="btn danger" id="cd-del">' + HV.ui.icon('x') + 'Delete</button>' : '') +
      '</div>',
      function (sheet) {
        var editBtn = sheet.querySelector('#cd-edit');
        if (editBtn) editBtn.addEventListener('click', function () { HV.closeSheet(); openAuthorSheet(pillar, id); });
        var delBtn = sheet.querySelector('#cd-del');
        if (delBtn) delBtn.addEventListener('click', function () { HV.closeSheet(); openDeleteSheet(pillar, id); });
      }
    );
  }

  /* ---------------- add / edit sheet ---------------- */

  function openAuthorSheet(pillar, id) {
    var isNew = !id;
    var existing = isNew ? null : findItem(pillar, id);
    if (!isNew && !existing) return;
    var isCulture = pillar === 'culture';
    var isWellness = pillar === 'wellness';
    /* a film has nothing to injure yourself on and no level to perform it at,
       so it loses Track and Caution and gains the two fields it does need */
    var isFilm = pillar === 'motivation';

    var med = HV.itemMedia(existing);
    /* the tags being edited, held live: the chips are the field now, so the
       sheet carries the working array rather than reading a text box at save */
    var picked = existing ? (existing.tags || []).slice() : [];
    var v = {
      name: existing ? existing.name : '',
      track: existing ? existing.track : (HV.tracks()[0] || {}).k || 'sedentary',
      instructions: existing ? existing.instructions : '',
      caution: existing ? (existing.caution || '') : '',
      notes: existing ? (existing.notes || '') : '',
      image: med.image,
      video: med.video,
      link: existing && existing.media ? (existing.media.ref || '') : '',
      mins: existing && existing.mins ? existing.mins : '',
      kcal: existing && existing.nutrients ? existing.nutrients.kcal : '',
      protein: existing && existing.nutrients ? existing.nutrients.protein : '',
      carbs: existing && existing.nutrients ? existing.nutrients.carbs : '',
      fat: existing && existing.nutrients ? existing.nutrients.fat : '',
      fibre: existing && existing.nutrients ? existing.nutrients.fibre : '',
      allergies: existing && existing.allergies ? existing.allergies.join(', ') : '',
      portionQty: existing && existing.portion ? existing.portion.qty : 1,
      portionUnit: existing && existing.portion ? existing.portion.unit : 'pc',
    };
    /* the item's micro values by roster key, for prefill — the roster owns
       the full list of what CAN be recorded; the item states what IS */
    var microVals = {};
    ((existing && existing.nutrients && existing.nutrients.micros) || []).forEach(function (m) {
      if (m.k) microVals[m.k] = m.v;
    });
    var nameLabel = isCulture ? 'Food' : isFilm ? 'Title' : 'Name';

    /* the category picker. An item filed under a category that has since been
       DELETED keeps an option of its own, marked — without it no option would
       match, the browser would land on index 0, and Save would quietly rewrite
       the item's real category to whichever one happened to be first. */
    var trackOpts = TRACKS().slice();
    if (v.track && !trackOpts.some(function (t) { return t.key === v.track; })) {
      trackOpts.push({ key: v.track, label: HV.trackLabel(v.track) + ' — removed from Configuration' });
    }

    HV.sheet(
      /* the heading names the library, because a coach three sheets deep has
         no other way to tell which one they are writing into */
      '<div class="h1">' + (isNew ? 'Add ' : 'Edit ') + (isFilm ? 'film' : 'item') +
        ' — ' + HV.esc(libName(pillar)) + '</div>' +
      '<label class="field-label" for="cf-name">' + nameLabel + '</label>' +
      '<input class="input" id="cf-name" value="' + HV.esc(v.name) + '" placeholder="' +
        (isCulture ? 'e.g. Millet khichdi' : isFilm ? 'What is the film called?' : 'What is it called?') + '">' +
      (isFilm ?
        '<label class="field-label" for="cf-link">YouTube link</label>' +
        '<input class="input" id="cf-link" value="' + HV.esc(v.link) + '" ' +
          'placeholder="Paste the link, or leave blank until it is filmed">' +
        '<p class="audit">A full YouTube link, a youtu.be link, a Shorts link or the bare video id — all work. Blank means the house film plays instead.</p>' +
        '<label class="field-label" for="cf-mins">Length (minutes)</label>' +
        '<input class="input" id="cf-mins" type="number" min="0" step="1" value="' + HV.esc(v.mins) + '">'
        :
        '<label class="field-label" for="cf-track">Category</label>' +
        '<select class="input" id="cf-track">' +
          trackOpts.map(function (t) {
            return '<option value="' + HV.esc(t.key) + '"' + (v.track === t.key ? ' selected' : '') + '>' +
              HV.esc(t.label) + '</option>';
          }).join('') +
        '</select>') +
      '<label class="field-label" for="cf-instr">' + (isFilm ? 'What it is about' : 'Instructions') + '</label>' +
      '<textarea class="input" id="cf-instr" rows="5" placeholder="' +
        (isFilm ? 'The line a client reads under the film'
                : 'One step per line — each line becomes its own page in the client’s instruction sheet') +
        '">' + HV.esc(v.instructions) + '</textarea>' +
      (isFilm ? '' : '<p class="audit">Each LINE becomes one step the client pages through. One long paragraph is fine too — it simply becomes a single step.</p>') +
      /* media: the picture the client sees on Today, and the film that plays
         inside the instruction sheet. A film's own YouTube link is its `link`
         field above, so the Motivation library shows only the picture here. */
      '<div class="sec-title">Media</div>' +
      '<label class="field-label" for="cf-image">Image</label>' +
      '<input class="input" id="cf-image" value="' + HV.esc(v.image) + '" ' +
        'placeholder="img/tasks/fitness-strength.webp — or any image URL">' +
      '<p class="audit">This is the picture on the client’s Today card and the top of the instruction sheet. Blank falls back to the pillar’s stock artwork.</p>' +
      (isFilm ? '' :
        '<label class="field-label" for="cf-video">Video</label>' +
        '<input class="input" id="cf-video" value="' + HV.esc(v.video) + '" ' +
          'placeholder="A YouTube link, or a file such as media/welcome.mp4">' +
        '<p class="audit">Plays inside the instruction sheet, above the text. Blank means the sheet is text only.</p>') +
      '<div id="cf-prev" class="catprev"></div>' +
      /* Nutrition only: the house style prompt, composed from this dish and
         shown before anything runs. Inline, never a second sheet — HV.sheet is
         single-slot and would destroy this one. */
      (isCulture
        ? '<button class="btn sm ghost" id="cf-gen" type="button">' + HV.ui.icon('sparkle') +
            'Generate with AI</button><div id="cf-ai"></div>'
        : '') +
      '<label class="field-label">Tags</label>' +
      '<div id="cf-tagbox" class="cattags pick" role="group" aria-label="Tags"></div>' +
      (isWellness || isFilm ? '' :
        '<label class="field-label" for="cf-caution">Caution</label>' +
        '<textarea class="input" id="cf-caution" rows="2" placeholder="Anything to watch for (optional)">' + HV.esc(v.caution) + '</textarea>') +
      '<label class="field-label" for="cf-notes">Notes</label>' +
      '<textarea class="input" id="cf-notes" rows="2" placeholder="Anything else worth knowing (optional)">' + HV.esc(v.notes) + '</textarea>' +
      (isCulture ?
        '<div class="sec-title">Portion</div>' +
        '<p class="audit">Every number below is for exactly this much — a template asks for multiples of it (Idli ×2), and the plate multiplies.</p>' +
        '<div class="grid2">' +
          '<span><label class="field-label" for="cf-pqty">Quantity</label><input class="input" id="cf-pqty" type="number" min="0.5" step="0.5" value="' + HV.esc(v.portionQty) + '"></span>' +
          '<span><label class="field-label" for="cf-punit">Unit</label><select class="input" id="cf-punit">' +
            PORTION_UNITS.map(function (u) {
              return '<option value="' + u + '"' + (v.portionUnit === u ? ' selected' : '') + '>' + u + '</option>';
            }).join('') +
          '</select></span>' +
        '</div>' +
        '<div class="sec-title">Nutrients · per portion</div>' +
        '<div class="grid3 tight">' +
          '<span><label class="field-label" for="cf-kcal">Kcal</label><input class="input" id="cf-kcal" type="number" min="0" value="' + HV.esc(v.kcal) + '"></span>' +
          '<span><label class="field-label" for="cf-protein">Protein (g)</label><input class="input" id="cf-protein" type="number" min="0" step="0.1" value="' + HV.esc(v.protein) + '"></span>' +
          '<span><label class="field-label" for="cf-carbs">Carbs (g)</label><input class="input" id="cf-carbs" type="number" min="0" step="0.1" value="' + HV.esc(v.carbs) + '"></span>' +
        '</div>' +
        '<div class="grid2">' +
          '<span><label class="field-label" for="cf-fat">Fat (g)</label><input class="input" id="cf-fat" type="number" min="0" step="0.1" value="' + HV.esc(v.fat) + '"></span>' +
          '<span><label class="field-label" for="cf-fibre">Fibre (g)</label><input class="input" id="cf-fibre" type="number" min="0" step="0.1" value="' + HV.esc(v.fibre) + '"></span>' +
        '</div>' +
        '<div class="sec-title">Micronutrients · per portion</div>' +
        '<p class="audit">Leave blank what the kitchen has not measured — a blank is honest, a zero is a claim.</p>' +
        '<div class="grid3 tight">' +
          microRoster().map(function (m) {
            var mv = microVals[m.k];
            return '<span><label class="field-label" for="cf-mi-' + m.k + '">' + HV.esc(m.name) +
              ' (' + HV.esc(m.unit) + ')</label><input class="input" id="cf-mi-' + m.k +
              '" type="number" min="0" step="0.1" value="' + (mv !== undefined ? HV.esc(mv) : '') + '"></span>';
          }).join('') +
        '</div>' +
        '<label class="field-label" for="cf-allergies">Allergies</label>' +
        '<input class="input" id="cf-allergies" value="' + HV.esc(v.allergies) + '" placeholder="Comma-separated, or leave blank">'
        : '') +
      '<p class="audit">Demo: custom items reset with demo data.</p>' +
      '<div class="row" style="justify-content:flex-end">' +
        '<button class="btn ghost" id="cf-cancel">Cancel</button>' +
        '<button class="btn" id="cf-save">' + (isNew ? 'Add item' : 'Save') + '</button>' +
      '</div>',
      function (sheet) {
        /* ---- tags: the vocabulary as toggle chips ----
           A coach cannot mint a tag here; the list is governed in
           Configuration → Catalog, which is the whole point of having one.
           A tag already ON this item but no longer in the vocabulary still
           shows, marked, so an edit never silently strips it. */
        var tagbox = sheet.querySelector('#cf-tagbox');
        function paintTags() {
          var vocab = HV.catTags().slice();
          picked.forEach(function (t) { if (vocab.indexOf(t) === -1) vocab.push(t); });
          if (!vocab.length) {
            tagbox.innerHTML = '<p class="audit" style="margin:0">No tags yet — add them in Configuration → Catalog.</p>';
            return;
          }
          tagbox.innerHTML = vocab.map(function (t) {
            var on = picked.indexOf(t) !== -1;
            var gone = HV.catTags().indexOf(t) === -1;
            return '<button type="button" data-pick="' + HV.esc(t) + '" class="' + (on ? 'on' : '') + '" ' +
              'aria-pressed="' + on + '">' + HV.esc(t) +
              (gone ? '<span class="catgone">removed</span>' : '') + '</button>';
          }).join('');
          tagbox.querySelectorAll('[data-pick]').forEach(function (b) {
            b.addEventListener('click', function () {
              var t = b.dataset.pick, i = picked.indexOf(t);
              if (i === -1) picked.push(t); else picked.splice(i, 1);
              paintTags();
            });
          });
        }
        paintTags();

        /* ---- media preview ----
           The thumbnail is the only way to find out a path is wrong without
           saving and walking to the client app to look. */
        var prev = sheet.querySelector('#cf-prev');
        var imgIn = sheet.querySelector('#cf-image');
        var vidIn = sheet.querySelector('#cf-video');
        function paintPrev() {
          var img = imgIn ? imgIn.value.trim() : '';
          var vidRef = vidIn ? vidIn.value.trim() : (isFilm ? sheet.querySelector('#cf-link').value.trim() : '');
          var vid = HV.ui.videoHtml(vidRef, v.name || 'Preview');
          if (!img && !vid) { prev.innerHTML = ''; return; }
          prev.innerHTML =
            (img ? '<span class="tcard"><img src="' + HV.esc(img) + '" alt="" decoding="async" ' +
              'onerror="this.closest(\'.tcard\').classList.add(\'bad\')"></span>' : '') +
            vid +
            (vidRef && !vid ? '<p class="audit" style="margin:0">That video reference isn’t a YouTube link or a media file — the sheet will be text only.</p>' : '');
        }
        paintPrev();
        [imgIn, vidIn, sheet.querySelector('#cf-link')].forEach(function (el) {
          if (el) el.addEventListener('input', paintPrev);
        });

        /* ---- generate a dish picture ----
           idle → composing (the real prompt, shown) → generating (a beat) →
           delivered (a path lands in the Image field and the preview paints)
           → refine (words merge into the prompt, the next variant arrives).

           Deterministic: the same taps produce the same pictures every time a
           demo is rehearsed. Nothing auto-saves — the coach still presses Save,
           and what is stored is a path, never the image itself. */
        var genBtn = sheet.querySelector('#cf-gen');
        if (genBtn) (function () {
          var ai = sheet.querySelector('#cf-ai');
          var pool = DISH_POOL[id] || null;
          /* start on a variant the item is NOT already wearing — asking for a
             render and getting back the picture already on screen reads as a
             button that did nothing */
          var vi = 0, extra = '';
          if (pool) {
            var at = pool.imgs.indexOf((imgIn.value || '').trim());
            if (at >= 0) vi = (at + 1) % pool.imgs.length;
          }

          function subject() {
            return pool ? pool.subject
              : 'a serving of ' + (sheet.querySelector('#cf-name').value.trim() || 'the dish').toLowerCase();
          }
          function prompt() { return GEN_STYLE(subject()) + (extra ? ', ' + extra : ''); }

          function paintAi(state) {
            var body = '<p class="audit" id="cf-prompt" style="white-space:pre-wrap; margin:0">' +
              HV.esc(prompt()) + '</p>' +
              (state === 'done' && !pool
                ? '<p class="sub" style="margin:var(--s2) 0 0">No pooled render for this dish yet — ' +
                  'in production this exact prompt goes to the image model. Paste a path above to ' +
                  'use your own picture.</p>'
                : '');
            var acts = state === 'busy'
              ? '<button class="btn sm" disabled>Rendering…</button>'
              : state === 'done'
                ? '<input class="input" id="cf-refine" placeholder="Add to the prompt…" ' +
                    'aria-label="Add to the prompt" style="margin:var(--s2) 0">' +
                  '<button class="btn sm ghost" id="cf-again" type="button">Refine</button>'
                : '<button class="btn sm" id="cf-go" type="button">Generate image</button>';
            ai.innerHTML = HV.ui.aidraft(body, acts);
            wireAi(state);
          }

          function run() {
            paintAi('busy');
            setTimeout(function () {
              if (pool) {
                imgIn.value = pool.imgs[vi % pool.imgs.length];
                paintPrev();
              }
              paintAi('done');
              HV.toast(pool ? 'Rendered — review it before saving.'
                            : 'Prompt composed — no pooled render for this dish yet.');
            }, 700);
          }

          function wireAi(state) {
            var go = ai.querySelector('#cf-go');
            if (go) go.addEventListener('click', run);
            var again = ai.querySelector('#cf-again');
            var ref = ai.querySelector('#cf-refine');
            function refine() {
              var add = ref ? ref.value.trim() : '';
              if (add) extra = extra ? extra + ', ' + add : add;
              vi++;
              run();
            }
            if (again) again.addEventListener('click', refine);
            if (ref) ref.addEventListener('keydown', function (e) {
              if (e.key === 'Enter') { e.preventDefault(); refine(); }
            });
          }

          genBtn.addEventListener('click', function () {
            genBtn.disabled = true;
            paintAi('idle');
          });
        })();

        sheet.querySelector('#cf-cancel').addEventListener('click', HV.closeSheet);
        sheet.querySelector('#cf-save').addEventListener('click', function () {
          var name = sheet.querySelector('#cf-name').value.trim();
          if (!name) return;

          var item = existing || { id: (isFilm ? 'mv-x' : 'ci-x') + (HV.store.catSeq = (HV.store.catSeq || 100) + 1) };
          /* media is written in the NAMED shape; HV.itemMedia still reads the
             original {kind, ref} on seeded items, so nothing needed migrating.
             A film keeps kind/ref as well — HV.film reads those directly. */
          var image = sheet.querySelector('#cf-image').value.trim();
          if (isFilm) {
            item.media = { kind: 'youtube', ref: sheet.querySelector('#cf-link').value.trim() };
            if (image) item.media.image = image;
            var mins = Number(sheet.querySelector('#cf-mins').value);
            if (mins > 0) item.mins = mins; else delete item.mins;
          } else {
            item.track = sheet.querySelector('#cf-track').value;
            item.media = {};
            if (image) item.media.image = image;
            var video = sheet.querySelector('#cf-video').value.trim();
            if (video) item.media.video = video;
          }
          item.name = name;
          item.instructions = sheet.querySelector('#cf-instr').value.replace(/\r/g, '').trim();
          item.tags = picked.slice();

          var caution = (isWellness || isFilm) ? '' : sheet.querySelector('#cf-caution').value.trim();
          if (caution) item.caution = caution; else delete item.caution;

          var notes = sheet.querySelector('#cf-notes').value.trim();
          if (notes) item.notes = notes; else delete item.notes;

          if (isCulture) {
            item.portion = {
              qty: Number(sheet.querySelector('#cf-pqty').value) || 1,
              unit: sheet.querySelector('#cf-punit').value || 'pc',
            };
            /* micros are read back from the roster inputs — numeric, roster
               keys only, blanks dropped. This replaces the old blind
               carry-forward of whatever strings an item used to hold. */
            var micros = [];
            microRoster().forEach(function (m) {
              var raw = sheet.querySelector('#cf-mi-' + m.k).value;
              if (raw === '' || raw == null) return;
              var num = Number(raw);
              if (num > 0) micros.push({ k: m.k, v: num });
            });
            item.nutrients = {
              kcal: Number(sheet.querySelector('#cf-kcal').value) || 0,
              protein: Number(sheet.querySelector('#cf-protein').value) || 0,
              carbs: Number(sheet.querySelector('#cf-carbs').value) || 0,
              fat: Number(sheet.querySelector('#cf-fat').value) || 0,
              fibre: Number(sheet.querySelector('#cf-fibre').value) || 0,
              micros: micros,
            };
            item.allergies = sheet.querySelector('#cf-allergies').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
          }

          if (isNew) HV.store.catalog[pillar].unshift(item);
          HV.save();
          HV.closeSheet();
          HV.refresh();
          HV.toast(isNew ? 'Added — ' + name : 'Saved — ' + name);
        });
      }
    );
  }

  /* ---- the portion vocabulary --------------------------------------------
     A food's numbers are for exactly one declared portion — "1 pc", "2 tbsp",
     "1 bowl" — and a template asks for multiples of it. The unit list is
     deliberately short and physical: a coach choosing between "cup" and
     "bowl" is describing a kitchen, not a lab. */
  var PORTION_UNITS = ['pc', 'cup', 'bowl', 'glass', 'tbsp', 'g', 'ml'];
  function portionWord(p) { return p ? (p.qty + ' ' + p.unit) : ''; }
  /* the Nutrient Panel's micro roster, which owns every key, name and unit */
  function microRoster() { return (HV.store.nutrition && HV.store.nutrition.micros) || []; }
  function microRef(k) {
    return microRoster().filter(function (m) { return m.k === k; })[0] || null;
  }

  function openDeleteSheet(pillar, id) {
    var it = findItem(pillar, id);
    if (!it) return;
    HV.sheet(
      '<div class="h1">Delete “' + HV.esc(it.name) + '”?</div>' +
      '<p class="sub">This removes it from the ' + HV.esc(libName(pillar)) + ' catalog. Plans already built with it keep their own copy.</p>' +
      '<div class="row" style="justify-content:flex-end">' +
        '<button class="btn ghost" id="cdc-cancel">Cancel</button>' +
        '<button class="btn danger" id="cdc-go">Delete</button>' +
      '</div>',
      function (sheet) {
        sheet.querySelector('#cdc-cancel').addEventListener('click', HV.closeSheet);
        sheet.querySelector('#cdc-go').addEventListener('click', function () {
          var list = HV.store.catalog[pillar] || [];
          var idx = -1;
          list.forEach(function (x, i) { if (x.id === id) idx = i; });
          if (idx !== -1) list.splice(idx, 1);
          HV.save();
          HV.closeSheet();
          HV.refresh();
          HV.toast('Deleted — ' + it.name);
        });
      }
    );
  }

  /* ---------------- templates tab ----------------
     A template is ONE PILLAR's programme at ONE LEVEL for ONE activity track
     (TJ, 17 Aug) — "Nutrition · Level 1 · Sedentary". That triple is the shelf
     it is filed under and the thing a coach searches for; a client carries one
     assignment per pillar, each chosen by the coach who owns that pillar.

     Its days are flat, 1..cycleDays, because one template is one level is one
     cycle. A day with no slots is a legitimate blank — that pillar does not run
     that day. Rest, review and meeting days are NOT stamped onto the template:
     they come from programShape, because five templates could otherwise
     disagree about whether day 5 is a rest day.

     Each pillar writes in its own language — meals with a plate reading,
     sessions with sets and reps, practices with minutes and a focus, films with
     nothing but their length. HV.slotSpec (core.js) is the single definition of
     which fields belong to which pillar, so the editor here, the day sheet in
     console-clients.js and the client's own plan can never drift apart.

     Anyone who reaches the Catalog may READ. Authoring is gated: editTemplates
     starts and shapes templates, a pillar coach may author within their own
     pillar, and a draft becomes assignable only by clearing the approval chain.

     ensureTemplateChain() is the trap: HV.approvals.stageRole() reads
     HV.store.chains.template, which the seed never carries, so a template
     submitted from a session that never opened a Plan tab would stall with a
     null stage. mount() calls it before anything else. */

  /* transient: which template and day are on screen, plus the library filters.
     The URL carries the template id; these carry the place inside it. */
  var tplOpen = null, tplDay = null;
  var tplFilter = { pillar: '', level: '', track: '' };

  function templateList() { return (HV.store.templates = HV.store.templates || []); }
  function findTemplate(id) {
    return templateList().filter(function (t) { return t.id === id; })[0] || null;
  }
  function trackLabel(tr) {
    return HV.trackLabel(tr);
  }
  function tplDayNums(t) {
    return Object.keys((t && t.days) || {}).map(Number).sort(function (a, b) { return a - b; });
  }
  /* how much of the template is actually written — the honest progress reading,
     since a blank day is legitimate but an entirely blank template is not */
  function filledDays(t) {
    return tplDayNums(t).filter(function (d) { return (t.days[d].slots || []).length; }).length;
  }
  function templateAp(t) {
    return (HV.store.approvals || []).filter(function (a) { return a.id === 'ap-tpl-' + t.id; })[0] || null;
  }
  function tplPending(t) {
    var ap = templateAp(t);
    return !!(ap && ap.status === 'submitted');
  }

  /* Who may do what to THIS template. A published one is frozen — duplicating
     it is the way to change it; a draft awaiting a signature is frozen too,
     until the chain answers. A pillar coach now authors WITHIN their own
     pillar's templates rather than editing single slots inside a shared one,
     because the template itself belongs to exactly one pillar. */
  function tplGate(t) {
    var me = HV.me() || {};
    var open = t.status !== 'published' && !tplPending(t);
    var all = HV.can('editTemplates');
    var mine = !all && HV.can('editCatalog') && ROLE_PILLAR[me.role] === t.pillar;
    return {
      all: open && all,
      pillar: open && mine ? t.pillar : null,
      edit: open && (all || mine),               // may open the day sheet
      structure: open && all,                    // rename, submit
      duplicate: HV.can('editTemplates') || mine,
    };
  }

  function tplStatusPill(t) {
    if (t.status === 'published') return HV.ui.pill('Published', 'ok');
    var ap = templateAp(t);
    if (ap && ap.status === 'submitted') {
      return HV.ui.pill('With ' + ((HV.roleDef(HV.approvals.stageRole(ap)) || {}).title || 'the chain'), 'warn');
    }
    return HV.ui.pill('Draft', 'neutral');
  }

  /* the shelf label, in the order a coach says it out loud */
  function shelfHtml(t) {
    var sp = HV.specFor(t.pillar);
    return '<span class="tshelf ' + sp.cls + '">' +
      '<span class="tsp">' + HV.esc(sp.name) + '</span>' +
      '<span class="tsl">L<span class="num">' + HV.esc(String(t.level || 1)) + '</span></span>' +
      '<span class="tst">' + HV.esc(trackLabel(t.track)) + '</span>' +
    '</span>';
  }

  /* ---- the list ---- */

  function tplMatches(t) {
    if (tplFilter.pillar && t.pillar !== tplFilter.pillar) return false;
    if (tplFilter.level && Number(t.level) !== Number(tplFilter.level)) return false;
    if (tplFilter.track && t.track !== tplFilter.track) return false;
    return true;
  }

  function tplRowHtml(t) {
    var n = filledDays(t), total = tplDayNums(t).length;
    return '<button class="trow click" data-tpl="' + HV.esc(t.id) + '">' +
      HV.ui.iconTile('bookmark', 'sm') +
      '<span class="grow"><b>' + HV.esc(t.name) + '</b>' +
        '<small>' + HV.esc(t.desc || '') + '</small>' +
        '<small class="audit">By ' + HV.esc(HV.staff(t.by).name) + ' · <span class="num">' + n +
          '</span> of <span class="num">' + total + '</span> days written</small></span>' +
      shelfHtml(t) + tplStatusPill(t) +
    '</button>';
  }

  function tfilRow(label, key, opts) {
    return '<div class="tfil" role="group" aria-label="' + HV.esc(label) + '">' +
      opts.map(function (o) {
        var on = String(tplFilter[key] || '') === String(o.v);
        return '<button data-tf="' + key + '" data-tv="' + HV.esc(String(o.v)) + '" class="' +
          (on ? 'on' : '') + '"' + (on ? ' aria-current="true"' : '') + '>' + o.t + '</button>';
      }).join('') + '</div>';
  }

  function renderTemplateList(body) {
    var can = HV.can('editTemplates') || HV.can('editCatalog');
    var all = templateList();
    var rows = all.filter(tplMatches).map(tplRowHtml).join('');

    var filters =
      tfilRow('Pillar', 'pillar', [{ v: '', t: 'All pillars' }].concat(
        HV.TPL_PILLARS.map(function (k) { return { v: k, t: HV.esc(HV.specFor(k).name) }; }))) +
      tfilRow('Level', 'level', [{ v: '', t: 'All levels' }].concat(
        HV.levelList().map(function (n) { return { v: n, t: 'L<span class="num">' + n + '</span>' }; }))) +
      tfilRow('Category', 'track', [{ v: '', t: 'All categories' }].concat(
        TRACKS().map(function (t) { return { v: t.key, t: HV.esc(t.label) }; })));

    body.innerHTML =
      '<div class="h1-row"><div><div class="sec-title" style="margin:0">Templates</div>' +
        '<p class="sub" style="margin:var(--s1) 0 0">One pillar, one level, one category — ' +
          '<span class="num">' + HV.cycleDays() + '</span> days built from the libraries beside this tab. ' +
          'A draft is assignable only once the approval chain has published it.</p></div>' +
        (can ? '<button class="btn sm" id="tpl-new">' + HV.ui.icon('plus') + 'New template</button>' : '') +
      '</div>' +
      '<div style="display:flex; flex-direction:column; gap:var(--s1); margin-bottom:var(--s3)">' + filters + '</div>' +
      '<div class="list">' + (rows || HV.ui.empty('bookmark',
        all.length ? 'No template on that shelf yet.' : 'No templates yet.',
        all.length ? 'Clear a filter, or start one here.' : 'Start one and fill its days in.')) + '</div>';

    body.querySelectorAll('[data-tpl]').forEach(function (b) {
      b.addEventListener('click', function () { HV.go('#/catalog/templates/' + b.dataset.tpl); });
    });
    body.querySelectorAll('[data-tf]').forEach(function (b) {
      b.addEventListener('click', function () {
        tplFilter[b.dataset.tf] = b.dataset.tv;
        renderTemplateList(body);
      });
    });
    var nb = body.querySelector('#tpl-new');
    if (nb) nb.addEventListener('click', function () { newTemplateSheet(body); });
  }

  /* ---- new template ---- */

  /* every day present and empty. Rest/review/meeting are deliberately NOT
     stamped on: programShape owns those, and a template that carried its own
     copy would go stale the moment Configuration moved. */
  function blankDays() {
    var days = {};
    for (var d = 1; d <= HV.cycleDays(); d++) days[d] = { slots: [] };
    return days;
  }

  /* no Date.now — the id is a count, so the same demo step always produces the
     same id (the Plan tab's save-as-template uses the same rule) */
  function nextTemplateId(pillar) {
    var stem = 'tp-' + String(pillar || 'x').slice(0, 3) + '-';
    var seq = 1;
    while (findTemplate(stem + seq)) seq++;
    return stem + seq;
  }

  function createTemplate(f) {
    var me = HV.me();
    var t = {
      id: nextTemplateId(f.pillar), pillar: f.pillar, level: Number(f.level) || 1,
      track: f.track, name: f.name, desc: f.desc, by: me.id, status: 'draft',
      /* nutrition states what its day is measured against; the other pillars
         leave it null and the field never renders */
      targets: f.targets || null,
      days: f.days,
    };
    if (f.base) t.base = f.base;
    templateList().push(t);
    HV.save();
    return t;
  }

  /* a coach without editTemplates authors inside their own pillar only, so the
     pillar select collapses to that one seat rather than being hidden — they
     can still see which pillar they are writing for */
  function authorPillars() {
    var me = HV.me() || {};
    if (HV.can('editTemplates')) return HV.TPL_PILLARS;
    var mine = ROLE_PILLAR[me.role];
    return mine ? [mine] : [];
  }

  function newTemplateSheet(body) {
    var pillars = authorPillars();
    if (!pillars.length) { HV.toast('Your role does not author templates.'); return; }
    HV.sheet(
      '<div class="h1">New template</div>' +
      '<p class="sub">One pillar, one level, one category — that triple is how coaches find it later. ' +
        'It lands as a draft with <span class="num">' + HV.cycleDays() + '</span> empty days.</p>' +
      '<label class="field-label" for="nt-pillar">Pillar</label>' +
      '<select class="input" id="nt-pillar">' +
        pillars.map(function (k) {
          return '<option value="' + k + '">' + HV.esc(HV.specFor(k).name) + '</option>';
        }).join('') +
      '</select>' +
      '<div class="grid2">' +
        '<div><label class="field-label" for="nt-level">Level</label>' +
        '<select class="input" id="nt-level">' +
          HV.levelList().map(function (n) { return '<option value="' + n + '">Level ' + n + '</option>'; }).join('') +
        '</select></div>' +
        '<div><label class="field-label" for="nt-track">Category</label>' +
        '<select class="input" id="nt-track">' +
          TRACKS().map(function (t) { return '<option value="' + HV.esc(t.key) + '">' + HV.esc(t.label) + '</option>'; }).join('') +
        '</select></div>' +
      '</div>' +
      '<label class="field-label" for="nt-name">Name</label>' +
      '<input class="input" id="nt-name" autocomplete="off" placeholder="e.g. Everyday plate">' +
      '<label class="field-label" for="nt-desc">Description</label>' +
      '<textarea class="input" id="nt-desc" rows="2" placeholder="What this template is for, in a line."></textarea>' +
      '<label class="field-label" for="nt-from">Start from</label>' +
      '<select class="input" id="nt-from">' +
        '<option value="">Blank — <span class="num"></span>empty days</option>' +
        templateList().map(function (t) {
          return '<option value="' + HV.esc(t.id) + '" data-p="' + HV.esc(t.pillar) + '">Copy of ' +
            HV.esc(t.name) + '</option>';
        }).join('') +
      '</select>' +
      '<p class="audit">It lands as a draft — the approval chain is what publishes it.</p>' +
      '<button class="btn block" id="nt-go">Create draft</button>' +
      '<button class="btn block ghost" id="nt-cancel">Cancel</button>',
      function (sheet) {
        sheet.querySelector('#nt-cancel').addEventListener('click', HV.closeSheet);
        sheet.querySelector('#nt-go').addEventListener('click', function () {
          var name = sheet.querySelector('#nt-name').value.trim();
          if (!name) { HV.toast('Give the template a name first.'); return; }
          var pillar = sheet.querySelector('#nt-pillar').value;
          var from = sheet.querySelector('#nt-from').value;
          var src = from ? findTemplate(from) : null;
          /* copying across pillars would carry slots the new pillar cannot
             render — a meal has no sets, a film has no focus */
          if (src && src.pillar !== pillar) {
            HV.toast('That template is ' + HV.specFor(src.pillar).name + ' — copy within a pillar.');
            return;
          }
          var t = createTemplate({
            pillar: pillar,
            level: sheet.querySelector('#nt-level').value,
            track: sheet.querySelector('#nt-track').value,
            name: name,
            desc: sheet.querySelector('#nt-desc').value.trim() ||
              (src ? 'Copied from ' + src.name + '.' : 'Days still to be written.'),
            base: src ? src.id : null,
            days: src ? JSON.parse(JSON.stringify(src.days)) : blankDays(),
          });
          HV.closeSheet();
          HV.go('#/catalog/templates/' + t.id);
          HV.toast('Draft created — fill the days, then send it up the chain.');
        });
      }
    );
  }

  function duplicateTemplate(t) {
    var copy = createTemplate({
      pillar: t.pillar, level: t.level, track: t.track,
      name: t.name + ' (copy)', desc: 'Copied from ' + t.name + '.', base: t.id,
      targets: t.targets ? JSON.parse(JSON.stringify(t.targets)) : null,
      days: JSON.parse(JSON.stringify(t.days)),
    });
    HV.go('#/catalog/templates/' + copy.id);
    HV.toast('Copied as a draft — this one is yours to edit.');
  }

  /* ---- the editor ---- */

  /* one slot, in its own pillar's language. The spec decides which fields show,
     so adding a field to a pillar is a one-line change in core.js and never a
     hunt through the views. */
  function doseLine(slot, pillar) {
    var sp = HV.specFor(pillar);
    if (sp.sums) {
      var n = HV.slotSum(slot);
      if (!n.kcal && !n.protein) return '';
      /* kcal and protein inline; the full macro reading rides the tooltip so
         a template row stays one line */
      return '<span class="tdose" title="' + HV.esc(n.kcal + ' kcal · ' + n.protein +
          ' g protein · ' + n.carbs + ' g carbs · ' + n.fat + ' g fat · ' + n.fibre + ' g fibre') +
        '"><span class="num">' + n.kcal + '</span> kcal' +
        (n.protein ? ' · <span class="num">' + n.protein + '</span> g protein' : '') + '</span>';
    }
    var bits = [];
    var sets = HV.doseOf(slot, pillar, 'sets'), reps = HV.doseOf(slot, pillar, 'reps');
    if (sets && reps) bits.push('<span class="num">' + sets + '</span>×<span class="num">' + reps + '</span>');
    else if (sets) bits.push('<span class="num">' + sets + '</span> sets');
    var count = HV.doseOf(slot, pillar, 'count');
    if (count) bits.push('<span class="num">' + count + '</span> rounds');
    var weight = HV.doseOf(slot, pillar, 'weight');
    if (weight) bits.push(HV.esc(String(weight)));
    var mins = HV.doseOf(slot, pillar, 'mins');
    if (mins) bits.push('<span class="num">' + mins + '</span> min');
    var rpe = HV.doseOf(slot, pillar, 'rpe');
    if (rpe) bits.push('RPE <span class="num">' + rpe + '</span>');
    var focus = HV.doseOf(slot, pillar, 'focus');
    if (focus) bits.push(HV.esc(String(focus)));
    return bits.length ? '<span class="tdose">' + bits.join(' · ') + '</span>' : '';
  }

  function tplSlotRow(slot, pillar) {
    var sp = HV.specFor(pillar);
    var note = HV.doseOf(slot, pillar, 'note');
    return '<div class="trow pslot">' + HV.planui.pillarDot(pillar) +
      '<span class="grow"><b>' + HV.esc(slot.label || sp.slotWord) + '</b>' +
      '<small>' + HV.planui.optionsLine(slot, pillar) + '</small>' +
      (note ? '<small class="audit">' + HV.esc(String(note)) + '</small>' : '') + '</span>' +
      doseLine(slot, pillar) +
      (sp.time && slot.time
        ? '<span class="pill neutral"><span class="num">' + HV.esc(slot.time) + '</span></span>' : '') +
    '</div>';
  }

  /* the marks come from programShape, never from the template — see the header */
  function dayMarks(d) {
    return (HV.isRest(d) ? HV.ui.pill('Active rest', 'neutral') : '') +
      (d === HV.reviewDay() ? HV.ui.pill('Day-' + HV.reviewDay() + ' review', 'info') : '') +
      (d === HV.meetingDay() ? HV.ui.pill('Team meeting', 'info') : '');
  }
  function dayMarkWord(d) {
    if (HV.isRest(d)) return 'Rest';
    if (d === HV.reviewDay()) return 'Review';
    if (d === HV.meetingDay()) return 'Meeting';
    return '';
  }

  /* ---- what a nutrition template MEASURES the day against ----
     Targets are a property of EACH DAY now, authored in the day panel; a day
     that states none inherits the nearest earlier statement (HV.tplTargetsOn).
     The card carries a passive summary — day 1's reading and whether any
     later day restates it — because five pills per day would be noise here. */
  function targetsHtml(t, g) {
    if (t.pillar !== 'culture') return '';
    var tg = HV.tplTargetsOn(t, 1);
    var restated = 0;
    for (var d = 2; d <= HV.cycleDays(); d++) {
      if (t.days && t.days[d] && t.days[d].targets && t.days[d].targets.kcal) restated++;
    }
    return '<div class="cattgt">' +
      '<span class="catfl" style="width:auto">Daily targets</span>' +
      (tg
        ? '<span class="pill"><span class="num">' + (tg.kcal || '—') + '</span> kcal</span>' +
          '<span class="pill"><span class="num">' + (tg.protein || '—') + '</span> g protein</span>' +
          '<span class="pill"><span class="num">' + (tg.carbs || '—') + '</span> g carbs</span>' +
          '<span class="pill"><span class="num">' + (tg.fat || '—') + '</span> g fat</span>' +
          '<span class="pill"><span class="num">' + (tg.fibre || '—') + '</span> g fibre</span>' +
          '<span class="catgone">' + (restated
            ? 'from day 1 · restated on ' + restated + (restated === 1 ? ' later day' : ' later days')
            : 'from day 1 · every day inherits it') + '</span>'
        : '<span class="catgone">Not stated — set them on any day in the panel; later days inherit.</span>') +
    '</div>';
  }


  /* ---- the composer's day panel ----
     The day editor used to be a modal that fired on every day-chip click: the
     widest editor in the product, authored through the narrowest surface, with
     the day grid hidden behind it. It is now a persistent panel beside the
     grid, resizable on the same seam the Clients workspace uses.

     Three pieces of state, all module-scoped because the editor repaints:
       tplOpen      — which template the shell was painted for
       tplDay       — which day is selected
       tplPanelDay  — which day the PANEL currently holds
       tplHandle    — the mounted slot editor, or null when read-only/empty */
  var tplPanelDay = null, tplHandle = null, tplTgtDirty = false;

  /* the per-day targets block, culture only. A field with a VALUE is stated
     on this day; a field showing only a PLACEHOLDER is inheriting — the
     placeholder is the inherited number itself, so the prefill TJ asked for
     is visible without writing fourteen copies of the same figure. Typing
     restates from this day onward; clearing hands the day back to
     inheritance. Saved by the same Save button as the slots. */
  var TGT_FIELDS = [['kcal', 'Energy (kcal)'], ['protein', 'Protein (g)'],
    ['carbs', 'Carbs (g)'], ['fat', 'Fat (g)'], ['fibre', 'Fibre (g)']];
  function tgtBlockHtml(t, d) {
    if (t.pillar !== 'culture') return '';
    var own = (t.days[d] && t.days[d].targets) || null;
    var inh = HV.tplTargetsOn(t, d > 1 ? d - 1 : 1);
    var from = null;
    if (!own && inh) {
      for (var k = d - 1; k >= 1 && from == null; k--) {
        if (t.days[k] && t.days[k].targets && t.days[k].targets.kcal) from = k;
      }
      if (from == null && t.targets && t.targets.kcal) from = 1;
    }
    return '<div class="card quiet" style="margin-bottom:var(--s3)">' +
      '<div class="k">Daily targets · day <span class="num">' + d + '</span></div>' +
      '<div class="grid3 tight" style="margin-top:var(--s2)">' +
      TGT_FIELDS.map(function (f) {
        var val = own && own[f[0]] != null ? own[f[0]] : '';
        var ph = !own && inh && inh[f[0]] != null ? inh[f[0]] : '';
        return '<span><label class="field-label" for="tgd-' + f[0] + '">' + f[1] + '</label>' +
          '<input class="input num" id="tgd-' + f[0] + '" type="number" min="0" value="' +
          HV.esc(String(val)) + '"' + (ph !== '' ? ' placeholder="' + HV.esc(String(ph)) + '"' : '') + '></span>';
      }).join('') +
      '</div>' +
      '<p class="audit" style="margin:var(--s2) 0 0">' +
      (own ? 'Stated on this day — later days inherit it until they restate.'
        : inh ? 'Inheriting day ' + (from || 1) + '’s targets (shown greyed). Type to restate from day ' + d + ' onward.'
        : 'Not stated yet — clients fall back to the standard derivation until a day states one.') +
      '</p></div>';
  }

  function loadDay(body, t, d) {
    var pad = body.querySelector('#tpl-pad');
    if (!pad) return;
    var g = tplGate(t);
    var sp = HV.specFor(t.pillar);

    /* Leaving a day with unsaved edits discards them. The sheet always did
       exactly this on dismiss — silently. A panel has no dismiss, so it says
       so once, and only when there is really something to lose. */
    if (tplHandle && tplPanelDay !== d && (tplHandle.isDirty() || tplTgtDirty)) {
      HV.toast('Day ' + tplPanelDay + ' edits discarded — Save writes a day before you leave it.');
    }
    tplHandle = null;
    tplTgtDirty = false;
    tplPanelDay = d;

    var day = d ? (t.days && t.days[d]) : null;
    if (!day) {
      pad.innerHTML = HV.ui.empty('cal', 'Pick a day',
        'Choose a day on the left and it opens here.');
      return;
    }

    var header = '<div class="h1-row" style="margin:0">' +
      '<div class="sec-title" style="margin:0">Day <span class="num">' + d + '</span></div>' +
      '<span class="row" style="gap:var(--s2)">' + dayMarks(d) + '</span></div>';

    if (!g.edit) {
      var roTg = HV.tplTargetsOn(t, d);
      pad.innerHTML = header +
        (t.pillar === 'culture' && roTg
          ? '<p class="audit" style="margin:0 0 var(--s2)">Daily targets: <span class="num">' + roTg.kcal +
            '</span> kcal · <span class="num">' + (roTg.protein || '—') + '</span> g protein · <span class="num">' +
            (roTg.carbs || '—') + '</span> g carbs · <span class="num">' + (roTg.fat || '—') +
            '</span> g fat · <span class="num">' + (roTg.fibre || '—') + '</span> g fibre</p>'
          : '') +
        ((day.slots || []).length
          ? '<div class="list">' + day.slots.map(function (s2) {
              return tplSlotRow(s2, t.pillar);
            }).join('') + '</div>'
          : HV.ui.empty('cal', 'Nothing on this day.', 'The author left this day empty.')) +
        /* say the TRUE reason. A published template is frozen for everyone,
           including the Super Admin — telling her it is "read-only for your
           role" is simply false, and sends her to People & Access to fix a
           permission that was never the problem. */
        (t.status === 'published'
          ? '<p class="audit">Frozen because it is published — duplicate it to change anything.</p>'
          : tplPending(t)
            ? '<p class="audit">Frozen while the approval chain has it.</p>'
            : '<p class="audit">Read-only for your role — this template belongs to ' +
              HV.esc(sp.name) + '.</p>');
      return;
    }

    pad.innerHTML = header + '<div id="tpl-tgt"></div><div id="tpl-ed"></div>';
    var tgtHost = pad.querySelector('#tpl-tgt');
    tgtHost.innerHTML = tgtBlockHtml(t, d);
    tgtHost.addEventListener('input', function () { tplTgtDirty = true; });
    tplHandle = HV.planui.slotEditor(pad.querySelector('#tpl-ed'), day.slots || [], {
      pillar: t.pillar,
      gate: { all: true, pillar: null },   // the template IS one pillar; tplGate already decided
      track: t.track,
      addSlot: true,
      saveLabel: 'Save day ' + d,
    }, function (slots) {
      t.days[d].slots = slots;
      /* the day's own targets ride the same Save. Stated fields only; a day
         cleared back to all-empty returns to inheriting. */
      if (t.pillar === 'culture') {
        var out = {};
        TGT_FIELDS.forEach(function (f) {
          var inp = tgtHost.querySelector('#tgd-' + f[0]);
          var v = inp ? Number(inp.value) : 0;
          if (v > 0) out[f[0]] = Math.round(v);
        });
        if (Object.keys(out).length) t.days[d].targets = out;
        else delete t.days[d].targets;
      }
      HV.save();
      paintMain(body, t);        // the grid's slot counts move with it
      loadDay(body, t, d);       // a fresh editor, no longer dirty
      HV.toast('Day ' + d + ' saved into ' + t.name + '.');
    });
  }

  /* the left column: what the template IS, and which day you are on. Repainted
     on its own so a rename or a save never remounts the panel mid-edit. */
  function paintMain(body, t) {
    var main = body.querySelector('#tpl-main');
    if (!main) return;
    var g = tplGate(t);
    var sp = HV.specFor(t.pillar);
    var nums = tplDayNums(t);

    var base = t.base ? findTemplate(t.base) : null;
    var head = '<div class="card tplhead ' + sp.cls + '">' +
      '<div class="h1-row">' +
        (g.structure
          ? '<input class="input" id="tpl-name" value="' + HV.esc(t.name) + '" autocomplete="off" ' +
            'aria-label="Template name" style="max-width:340px">'
          : '<b>' + HV.esc(t.name) + '</b>') +
        '<span class="row" style="gap:var(--s2)">' + shelfHtml(t) + tplStatusPill(t) + '</span>' +
      '</div>' +
      '<p class="sub" style="margin:var(--s2) 0 0">' + HV.esc(t.desc || '') + '</p>' +
      '<p class="audit">By ' + HV.esc(HV.staff(t.by).name) +
        (base ? ' · based on ' + HV.esc(base.name) : '') +
        ' · <span class="num">' + filledDays(t) + '</span> of <span class="num">' + nums.length +
        '</span> days written</p>' +
      (t.status === 'published'
        ? '<p class="audit">Published templates are read-only — duplicate it to change anything.</p>'
        : tplPending(t)
          ? '<p class="audit">With the approval chain — frozen until it is signed or sent back.</p>'
          : '') +
      targetsHtml(t, g) +
    '</div>';

    var acts = '<div class="row" style="gap:var(--s2); flex-wrap:wrap; margin-bottom:var(--s3)">' +
      '<button class="btn sm quiet" data-tact="back">' + HV.ui.icon('chevL') + 'All templates</button>' +
      (g.structure ? '<button class="btn sm" data-tact="submit">Submit for approval</button>' : '') +
      (t.status === 'published' && g.duplicate
        ? '<button class="btn sm ghost" data-tact="dup">Duplicate to edit</button>' : '') +
    '</div>';

    var grid = nums.length
      ? '<div class="pdays ' + sp.cls + '" role="group" aria-label="Days">' +
        nums.map(function (d) {
          var n = (t.days[d].slots || []).length;
          var mark = dayMarkWord(d);
          return '<button class="pday' + (d === tplDay ? ' on' : '') + (n ? ' has' : '') +
            '" data-td="' + d + '"' + (d === tplDay ? ' aria-current="true"' : '') +
            ' aria-label="Day ' + d + (mark ? ' · ' + mark : '') + ' · ' +
              (n ? n + ' ' + sp.slotWord.toLowerCase() + (n > 1 ? 's' : '') : 'nothing') + '">' +
            '<span class="d num">' + d + '</span>' +
            '<span class="m">' + (n ? '<span class="num">' + n + '</span> ' +
              HV.esc(sp.slotWord.toLowerCase()) + (n > 1 ? 's' : '') : (mark || '—')) + '</span>' +
          '</button>';
        }).join('') + '</div>'
      : HV.ui.empty('cal', 'This template has no days.', 'That should not happen — reset the demo data.');

    main.innerHTML = acts + head + grid;

    /* listeners go on the elements INSIDE main, never on main itself — this
       function repaints into the same element, and a delegated listener there
       would stack up one more copy on every paint */
    main.querySelectorAll('[data-td]').forEach(function (b) {
      b.addEventListener('click', function () {
        tplDay = Number(b.dataset.td);
        paintMain(body, t);
        loadDay(body, t, tplDay);
        var nd = main.querySelector('[data-td="' + tplDay + '"]');
        if (nd) nd.focus();
      });
    });
    main.querySelectorAll('[data-tact]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.dataset.tact;
        if (a === 'back') HV.go('#/catalog/templates');
        else if (a === 'dup') duplicateTemplate(t);
        else if (a === 'submit') HV.planui.submitTemplate(t);
      });
    });
    /* rename on blur, not on every keystroke — repainting mid-word would drop
       the cursor out of the field. paintMain only, never the whole editor:
       remounting the panel here would throw away an unsaved day. */
    var nameIn = main.querySelector('#tpl-name');
    if (nameIn) nameIn.addEventListener('change', function () {
      var v = nameIn.value.trim();
      if (!v || v === t.name) { nameIn.value = t.name; return; }
      t.name = v;
      HV.save();
      HV.toast('Renamed — ' + v);
    });
  }

  function renderTemplateEditor(body, t) {
    var nums = tplDayNums(t);
    var fresh = !body.querySelector('.cattplwrap') || tplOpen !== t.id;
    if (tplOpen !== t.id) { tplOpen = t.id; tplDay = null; }
    /* open on the first day that HAS something. Several pillars deliberately
       run on alternate days, so day 1 is often blank — landing there makes a
       written template look empty. */
    if (!tplDay || nums.indexOf(tplDay) < 0) {
      var firstFilled = nums.filter(function (d) { return (t.days[d].slots || []).length; })[0];
      tplDay = firstFilled || (nums.length ? nums[0] : null);
    }

    if (fresh) {
      tplHandle = null;
      tplPanelDay = null;
      /* the saved width is restored on the element, not left to the default —
         a seam that forgets its position every time you reopen a template is
         a setting that does not exist */
      var savedW = Number((HV.store.ui || {}).tplPadW) || 380;
      body.innerHTML =
        '<div class="cattplwrap">' +
          '<div class="cattplmain" id="tpl-main"></div>' +
          '<div class="cattplseam" role="separator" aria-orientation="vertical" tabindex="0" ' +
            'aria-label="Resize the day editor" aria-valuemin="300" aria-valuemax="560" ' +
            'aria-valuenow="' + savedW + '"></div>' +
          '<aside class="cattplpad" id="tpl-pad" role="complementary" aria-label="Day editor"' +
            ' style="--tplw:' + savedW + 'px"></aside>' +
        '</div>';
      /* wired ONCE per shell, to elements that die with it */
      HV.wireSplitter(body, { div: '.cattplseam', pad: '.cattplpad', cssVar: '--tplw',
                              key: 'tplPadW', min: 300, max: 560, def: 380 });
    }
    paintMain(body, t);
    loadDay(body, t, tplDay);
  }

  HV.catalogTemplates = {
    mount: function (el, params) {
      HV.planui.ensureTemplateChain();
      var id = (params || [])[1];
      var t = id ? findTemplate(id) : null;
      if (t) renderTemplateEditor(el, t);
      else renderTemplateList(el);
    },
  };

  /* ---------------- books: retired as a tab (TJ, 17 Aug) ----------------
     The seven-level books were a read-only reference surface on this page.
     The Catalog is now five libraries and the templates built from them, so
     the browsing tab is gone. The DATA is untouched and still live: 
     HV.store.program is what HV.tasks() reads to build a client's daily task
     cards, and the client's Today screen renders from it. Nothing here reads
     it any more — that is the whole change. */

  HV.registerView('catalog', {
    title: 'Catalog',
    render: function (el, params) {
      var me = HV.me();
      var def = (me && ROLE_PILLAR[me.role]) || 'fitness';
      var tab = VALID_TABS.indexOf(params[0]) !== -1 ? params[0] : def;

      el.innerHTML = STYLE +
        '<div class="h1-row"><div><div class="kicker">THE CATALOG</div><h1 class="h1">Catalog</h1>' +
        '<p class="sub">The fitness, yoga, food and mind building blocks every plan draws from, the morning films that open a client’s day — and the templates that arrange them into a cycle.</p></div></div>' +
        '<div id="cat-toptabs">' + HV.ui.tabs(TABS, tab) + '</div>' +
        '<div id="cat-body" style="margin-top:var(--s3)"></div>';

      el.querySelector('#cat-toptabs').querySelectorAll('button[data-tab]').forEach(function (b) {
        b.addEventListener('click', function () { HV.go('#/catalog/' + b.dataset.tab); });
      });

      var body = el.querySelector('#cat-body');
      if (LIB_KEYS.indexOf(tab) !== -1) renderPillarTab(body, tab);
      else HV.catalogTemplates.mount(body, params);
    },
  });
})();
