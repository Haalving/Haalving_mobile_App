/* HAALVING client view — Profile (PF-01/02/04 + consents).
   Header, purpose statement, medical notes, the Vital Panel, Records Vault,
   notification & reminder settings (toggles persisted in HV.store.notifPrefs),
   DPDP consents, sign-out and demo reset. */
(function () {
  'use strict';

  /* ══════════════════════ the Vital Panel ══════════════════════════════
     Three levels, the structure Fittr uses on My Health → Summary:
       1  a report-level reading — what share of markers sit inside reference
       2  a grid of body systems, each silent unless something is flagged
       3  a category sheet listing every marker against its own band, and
          under that a marker sheet explaining what the marker even is.
     Reference bands and marker text live in HV.vitals; nothing here invents
     a clinical fact. The verdict a client reads is COMPUTED from their own
     results — no written-in narrative, so it can never drift from the data. */

  /* Print a value with the precision the reading and its band deserve:
     creatinine stays 0.97, an Apo ratio of 1 prints as 1.0 because its band
     is written to one place, a platelet count of 232 gains no decimal. */
  function dp(n) {
    var s = String(n), i = s.indexOf('.');
    return i === -1 ? 0 : s.length - i - 1;
  }
  function fmt(r) {
    if (r.qual) return r.display;
    var d = Math.max(dp(r.value), dp(r.low), dp(r.high));
    return r.value.toFixed(d);
  }
  function fmtEnd(v, r) {
    return v.toFixed(Math.max(dp(r.low), dp(r.high)));
  }

  /* ══════════════════ the report series (A8) ═══════════════════════════
     Reports live in HV.store.labReports as a dated series. The panel shows
     ONE report at a time — a chip row picks which — and every marker sheet
     carries the delta against the report before it. Seeded reports carry
     bioAge/pace/signedBy; a self-reported one carries only date+values, so
     every render of those fields is guarded. */
  var selRepId = null;   /* module-local: survives HV.refresh() */
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function reports(c) { return HV.vitals.reportsFor(c.id); }
  function selReport(c) {
    var arr = reports(c);
    if (!arr.length) return null;
    var hit = arr.filter(function (r) { return r.id === selRepId; })[0];
    return hit || arr[arr.length - 1];
  }
  function prevReport(c) {
    var arr = reports(c), sel = selReport(c);
    var i = arr.indexOf(sel);
    return i > 0 ? arr[i - 1] : null;
  }
  /* 'Feb 2026' — month+year is enough unless two reports share the month */
  function repChip(r, arr) {
    var p = r.date.split('-');
    var my = MONTHS[+p[1] - 1] + ' ' + p[0];
    var dup = arr.some(function (o) { return o !== r && o.date.slice(0, 7) === r.date.slice(0, 7); });
    return dup ? +p[2] + ' ' + my : my;
  }

  /* The delta line under a marker's big value. Colour answers ONE question —
     did the reading move toward the band or away from it? — because the
     direction of 'good' differs per marker (HDL up is good, LDL up is not)
     and the band already encodes that. Both readings inside the band, or
     equidistant outside it, stay neutral ink. */
  function deltaHtml(key, c) {
    var prev = prevReport(c);
    if (!prev) return '';
    var cur = HV.vitals.read(key, selReport(c), c.sex);
    var old = HV.vitals.read(key, prev, c.sex);
    if (!cur || !old || cur.qual || old.qual) return '';
    var when = repChip(prev, reports(c));
    var d = cur.value - old.value;
    if (!d) {
      return '<div class="vpk-delta">' + HV.ui.icon('minus') +
        '<span>No change since ' + HV.esc(when) + '</span></div>';
    }
    var gap = function (v) { return v < cur.low ? cur.low - v : v > cur.high ? v - cur.high : 0; };
    var was = gap(old.value), now = gap(cur.value);
    var cls = now < was ? ' good' : now > was ? ' away' : '';
    var prec = Math.max(dp(cur.value), dp(old.value));
    return '<div class="vpk-delta' + cls + '">' +
      HV.ui.icon(d > 0 ? 'caretUp' : 'caretDown') +
      '<b class="num">' + HV.esc(Math.abs(d).toFixed(prec)) + '</b>' +
      (cur.def.unit ? '<small>' + HV.esc(cur.def.unit) + '</small>' : '') +
      '<span>since ' + HV.esc(when) + '</span>' +
      (cls === ' good' ? '<span class="tag">toward range</span>'
        : cls === ' away' ? '<span class="tag">away from range</span>' : '') +
    '</div>';
  }

  var VPK_CSS =
    '<style>' +
    '.vpk-row{display:flex; flex-wrap:wrap; align-items:center; gap:var(--s1); margin:0 0 var(--s3)}' +
    '.vpk-row .chip{margin:0}' +
    '.vpk-row .chip svg{width:14px; height:14px; margin-right:var(--s1)}' +
    '.vpk-delta{display:flex; align-items:center; gap:var(--s2); font-size:var(--t-sm); color:var(--ink-2)}' +
    '.vpk-delta svg{width:14px; height:14px; flex:none}' +
    '.vpk-delta.good{color:var(--ok)}' +
    '.vpk-delta.away{color:var(--danger)}' +
    '.vpk-delta .tag{font-size:var(--t-xs); padding:0 var(--s2); border-radius:var(--r-full); background:var(--surface-2)}' +
    '.vpk-delta.good .tag{background:var(--ok-wash)}' +
    '.vpk-delta.away .tag{background:var(--danger-wash)}' +
    '.vpk-frow{display:flex; align-items:center; gap:var(--s3); padding:var(--s1) 0; font-size:var(--t-sm)}' +
    '.vpk-frow .input{flex:0 0 30%; min-width:0; text-align:right}' +
    '.vpk-frow .sub{display:block}' +
    '</style>';

  /* the ~8 headline markers a person can read off any printed report */
  var SELF_KEYS = ['hba1c', 'fbs', 'ldl', 'hdl', 'tg', 'hscrp', 'uric', 'hb'];

  function openAddReport(c) {
    var rows = SELF_KEYS.map(function (k) {
      var m = HV.vitals.markers[k];
      if (!m) return '';
      return '<label class="vpk-frow"><span class="grow">' + HV.esc(m.name) +
        (m.unit ? '<small class="sub">' + HV.esc(m.unit) + '</small>' : '') + '</span>' +
        '<input class="input num" type="number" step="any" inputmode="decimal" ' +
          'data-nv="' + HV.esc(k) + '" placeholder="—" aria-label="' + HV.esc(m.name) + '"></label>';
    }).join('');

    HV.sheet(
      '<div class="h1" style="margin:0">Add a report</div>' +
      '<p class="sub" style="margin:0">Type in the headline numbers from a recent lab report. Leave anything you don’t have blank.</p>' +
      '<label class="vpk-frow"><span class="grow">Report date</span>' +
        '<input class="input num" type="date" id="vpk-date" value="' + HV.esc(HV.todayISO()) + '" ' +
        'max="' + HV.esc(HV.todayISO()) + '" aria-label="Report date"></label>' +
      rows +
      '<div class="notice">Self-reported numbers join your panel as “Self-reported” — no doctor sign-off, so no biological age or pace is derived from them.</div>' +
      '<button class="btn block" id="vpk-save">Save report</button>' +
      '<button class="btn quiet block" id="vpk-cancel">Not now</button>',
      function (sheet) {
        sheet.querySelector('#vpk-cancel').addEventListener('click', HV.closeSheet);
        sheet.querySelector('#vpk-save').addEventListener('click', function () {
          var date = sheet.querySelector('#vpk-date').value;
          var values = {}, n = 0;
          sheet.querySelectorAll('[data-nv]').forEach(function (inp) {
            var v = inp.value.trim();
            if (v === '' || isNaN(Number(v))) return;
            values[inp.dataset.nv] = Number(v); n++;
          });
          if (!date) { HV.toast('Pick the report date first.'); return; }
          if (!n) { HV.toast('Enter at least one number.'); return; }
          if (!HV.store.labReports) HV.store.labReports = {};
          if (!HV.store.labReports[c.id]) HV.store.labReports[c.id] = [];
          var id = 'lr-self-' + Date.now();
          HV.store.labReports[c.id].push({ id: id, date: date, label: 'Self-reported', values: values });
          selRepId = id;
          HV.save();
          HV.closeSheet();
          HV.toast('Report added — ' + n + (n === 1 ? ' marker' : ' markers') + ' recorded.');
          HV.refresh();
        });
      }
    );
  }

  /* demo: a PDF attach lands in the Records Vault as 'Summary pending', which
     is exactly the state the Doctor's medical queue picks up */
  function attachPdf(c) {
    var d = new Date();
    HV.store.documents.push({
      id: 'd-' + Date.now(), clientId: c.id,
      name: 'Lab report (PDF upload)', date: d.getDate() + ' ' + MONTHS[d.getMonth()],
      type: 'Lab', summary: 'pending',
    });
    HV.save();
    HV.toast('Attached to your Records Vault. Dr. Kavya will review it and publish a summary.');
    HV.refresh();
  }
  /* the quick-add sheet's last tile attaches through the same door the
     profile's own button uses (TJ, 9 Aug) */
  HV.attachDoc = attachPdf;

  /* The band always occupies the middle 45.5% of the track: the domain is
     the band plus 60% of its own width at each end. Every bar in the product
     therefore reads identically — the dot's position is the only variable,
     which is what makes a column of them scannable. */
  function dotPos(r) {
    var span = (r.high - r.low) || Math.abs(r.high) || 1;
    var lo = r.low - span * 0.6, hi = r.high + span * 0.6;
    return Math.max(3, Math.min(97, (r.value - lo) / (hi - lo) * 100));
  }

  function markerBar(r) {
    if (r.qual) {
      return '<span class="mbar qual">' +
        '<span class="pill ' + (r.out ? 'bad' : 'neutral') + '">' +
          HV.esc(r.out ? 'Outside' : 'Expected') + '</span></span>';
    }
    return '<span class="mbar">' +
      '<span class="mtrack"><i class="band"></i>' +
        '<i class="dot' + (r.out ? ' out' : '') + '" style="left:' + dotPos(r).toFixed(1) + '%"></i>' +
      '</span>' +
      '<span class="ends"><b class="num">' + HV.esc(fmtEnd(r.low, r)) + '</b>' +
        '<b class="num">' + HV.esc(fmtEnd(r.high, r)) + '</b></span>' +
    '</span>';
  }

  function markerRow(r, date) {
    return '<button class="mrow" data-mk="' + HV.esc(r.key) + '">' +
      '<span class="mtx">' +
        '<span class="mnm">' + HV.esc(r.def.name) + '</span>' +
        '<span class="mval num' + (r.out ? ' out' : '') + '">' + HV.esc(fmt(r)) +
          (r.def.unit ? '<small>' + HV.esc(r.def.unit) + '</small>' : '') + '</span>' +
        '<small class="mdate">' + HV.esc(date) + '</small>' +
      '</span>' +
      markerBar(r) +
      HV.ui.icon('chevR') +
    '</button>';
  }

  /* the verdict, derived — never authored.
     A group whose bands are cohort ranges must not be told it is outside
     "reference": the noun is the only thing separating "unusual among well
     people" from "abnormal", so it follows the bands the group actually uses. */
  function verdict(g) {
    var noun = g.rows.some(function (r) { return r.def.cohort; }) ? 'expected range' : 'reference band';
    if (!g.out) return { cls: '', text: 'Every marker in this group sits inside its ' + noun + '.' };
    var names = g.rows.filter(function (r) { return r.out; })
      .map(function (r) { return r.def.name.replace(/\s*\([^)]*\)\s*$/, ''); });
    var lead = g.out / g.rows.length <= 0.25
      ? 'Mostly in range, with ' + g.out + (g.out === 1 ? ' marker' : ' markers') + ' to review.'
      : g.out + ' of ' + g.rows.length + ' markers sit outside their ' + noun + '.';
    return { cls: g.out / g.rows.length <= 0.25 ? ' warn' : ' bad',
             text: lead + ' Outside: ' + names.join(', ') + '.' };
  }

  /* ---- level 3: one marker explained ---- */
  function openMarker(key, c, backCat) {
    var rep = selReport(c);
    var r = HV.vitals.read(key, rep, c.sex);
    if (!r) return;
    var inCats = HV.vitals.categories.filter(function (cat) {
      return cat.markers.indexOf(key) !== -1 && rep.values[key] != null;
    });
    /* a cohort band is where most well people sit, not a clinical limit — the
       word in front of the numbers is the only thing that says so, so it is
       not decoration and must not be dropped */
    var ref = r.qual
      ? 'Expected: ' + r.def.ok.join(' or ')
      : (r.def.cohort ? 'Healthy-cohort range ' : 'Reference ') +
        fmtEnd(r.low, r) + ' – ' + fmtEnd(r.high, r) + (r.def.unit ? ' ' + r.def.unit : '');

    HV.sheet(
      '<div class="h1" style="margin:0">' + HV.esc(r.def.name) + '</div>' +
      '<div class="row" style="gap:var(--s3); align-items:flex-end">' +
        '<span class="mbig num' + (r.out ? ' out' : '') + '">' + HV.esc(fmt(r)) +
          (r.def.unit ? '<small>' + HV.esc(r.def.unit) + '</small>' : '') + '</span>' +
        HV.ui.pill(r.out ? (r.qual ? 'Outside expected' : (r.dir === 'low' ? 'Below range' : 'Above range')) : 'In range',
                   r.out ? 'bad' : 'ok') +
      '</div>' +
      deltaHtml(key, c) +
      (r.qual ? '' : '<div class="mbar wide">' +
        '<span class="mtrack"><i class="band"></i>' +
          '<i class="dot' + (r.out ? ' out' : '') + '" style="left:' + dotPos(r).toFixed(1) + '%"></i></span>' +
        '<span class="ends"><b class="num">' + HV.esc(fmtEnd(r.low, r)) + '</b>' +
          '<b class="num">' + HV.esc(fmtEnd(r.high, r)) + '</b></span></div>') +
      '<div class="sub">' + HV.esc(ref) + ' · measured ' + HV.esc(rep.date) + '</div>' +
      '<p style="margin:0; font-size:var(--t-sm)">' + HV.esc(r.def.what) + '</p>' +
      '<div class="row" style="gap:var(--s1); flex-wrap:wrap">' +
        '<span class="sub" style="font-size:var(--t-xs)">Appears in</span>' +
        inCats.map(function (cat) {
          return '<button class="chip" data-gocat="' + HV.esc(cat.key) + '">' + HV.esc(cat.name) + '</button>';
        }).join('') +
      '</div>' +
      '<div class="notice">A single reading is one moment, not a verdict. Your Doctor reads it against the rest of the panel and your history before anything in your plan changes.</div>' +
      (backCat ? '<button class="btn quiet block" id="mk-back">Back to ' +
        HV.esc(HV.vitals.categories.filter(function (x) { return x.key === backCat; })[0].name) + '</button>' : '') +
      '<button class="btn block" id="mk-ask">Ask my care team about this</button>',
      function (sheet) {
        sheet.querySelectorAll('[data-gocat]').forEach(function (b) {
          b.addEventListener('click', function () { openCategory(b.dataset.gocat, c); });
        });
        var back = sheet.querySelector('#mk-back');
        if (back) back.addEventListener('click', function () { openCategory(backCat, c); });
        sheet.querySelector('#mk-ask').addEventListener('click', function () {
          if (c) HV.pushMsg(c.id, { fromId: 'client', kind: 'text',
            text: 'Question about my ' + r.def.name + ' reading — can we talk this through at my next review?' });
          HV.closeSheet();
          HV.toast('Noted. Dr. Kavya will pick this up in your next review.');
        });
      }
    );
  }

  /* ---- level 2: one category, every marker it claims ---- */
  function openCategory(catKey, c, flaggedOnly) {
    var rep = selReport(c);
    var g = HV.vitals.category(catKey, rep, c.sex);
    if (!g) return;
    var v = verdict(g);
    var shown = flaggedOnly ? g.rows.filter(function (r) { return r.out; }) : g.rows;
    var pct = g.rows.length ? (g.within / g.rows.length * 100) : 0;

    HV.sheet(
      '<div class="row" style="gap:var(--s4)">' +
        HV.vitals.plate(g.cat.key, g.out > 0, 'sm') +
        '<span class="grow"><span class="h1" style="display:block; margin:0">' + HV.esc(g.cat.name) + '</span>' +
          '<small class="sub" style="display:block">' + HV.esc(rep.label) + ' · ' + HV.esc(rep.date) + '</small></span>' +
      '</div>' +
      '<div class="vsplit" role="img" aria-label="' + g.within + ' of ' + g.rows.length + ' markers in range">' +
        '<i class="in" style="width:' + pct.toFixed(1) + '%"></i>' +
        '<i class="out" style="width:' + (100 - pct).toFixed(1) + '%"></i>' +
      '</div>' +
      '<div class="vcount">' +
        '<span class="vc in"><small>In range</small><b class="num">' + g.within + '</b></span>' +
        '<span class="vc out"><small>Flagged</small><b class="num">' + g.out + '</b></span>' +
      '</div>' +
      '<p class="sub" style="margin:0">' + HV.esc(g.cat.blurb) + '</p>' +
      '<div class="notice' + v.cls + '">' + HV.esc(v.text) + '</div>' +
      (g.out
        ? '<button class="chip' + (flaggedOnly ? ' sel' : '') + '" id="vt-only" aria-pressed="' + !!flaggedOnly + '">' +
            'Show only flagged (' + g.out + ')</button>'
        : '') +
      '<div class="mlist">' + shown.map(function (r) { return markerRow(r, rep.date); }).join('') + '</div>' +
      '<div class="audit">' + (g.rows.some(function (r) { return r.def.cohort; })
        ? 'Bands in this group are healthy-cohort ranges — where most well people sit — not clinical limits. Outside means unusual, not abnormal, and your Doctor reads it against the rest of your panel.'
        : 'Reference bands are adult ranges for your sex. Your Doctor may read a band differently for you.') + '</div>' +
      '<button class="btn quiet block" id="vt-done">Done</button>',
      function (sheet) {
        var only = sheet.querySelector('#vt-only');
        if (only) only.addEventListener('click', function () { openCategory(catKey, c, !flaggedOnly); });
        sheet.querySelectorAll('[data-mk]').forEach(function (b) {
          b.addEventListener('click', function () { openMarker(b.dataset.mk, c, catKey); });
        });
        sheet.querySelector('#vt-done').addEventListener('click', HV.closeSheet);
      }
    );
  }

  /* ---- level 1: the panel section on Profile ---- */
  function vitalsSection(c) {
    var arr = reports(c);
    var rep = selReport(c);

    /* the series picker: one chip per dated report, plus the way in for a
       new one. Renders even with a single report — the row is where the
       series concept lives, so it must exist before the second report does. */
    var picker =
      '<div class="vpk-row">' +
        arr.map(function (r) {
          return '<button class="chip' + (r === rep ? ' sel' : '') + '" data-rep="' + HV.esc(r.id) + '"' +
            (r === rep ? ' aria-current="true"' : '') + '>' + HV.esc(repChip(r, arr)) + '</button>';
        }).join('') +
        '<button class="chip" id="vpk-add">' + HV.ui.icon('plus') + 'Add report</button>' +
      '</div>';

    if (!rep) {
      return VPK_CSS + picker +
        '<div class="card"><span class="k">Vital Panel</span>' +
        '<p class="sub" style="margin:var(--s3) 0 0">' +
          (c.observation
            ? 'Nothing here yet — your observation window comes first. Once you share a lab report and Dr. Kavya reviews it, every marker appears here grouped by body system.'
            : 'No lab report shared yet. Add one to your Records Vault and, once Dr. Kavya has reviewed it, every marker appears here grouped by body system.') +
        '</p></div>' +
        '<button class="btn quiet block" id="vpk-attach" style="margin-top:var(--s3)">Attach report PDF</button>';
    }

    var s = HV.vitals.summary(rep, c.sex);
    var grid = HV.vitals.grid(rep, c.sex);
    /* a self-reported entry carries no sign-off — every derived field guards */
    var doc = rep.signedBy ? HV.staff(rep.signedBy) : null;

    /* The dial stacks ABOVE the counts rather than sitting beside them: side by
       side, the dial's own caption and the "In range" count label repeated the
       same words a centimetre apart. Stacked, the dial states the proportion
       and the row beneath states the tally — Fittr's arrangement, and it is
       the arrangement for the same reason. */
    var head =
      '<div class="card vsum">' +
        HV.ui.dial(s.pct, 'Within reference', { value: s.pct, suffix: '%', color: 'brand', size: 'lg' }) +
        '<div class="vcount">' +
          '<span class="vc in"><small>In range</small><b class="num">' + s.within + '</b></span>' +
          '<span class="vc out"><small>Flagged</small><b class="num">' + s.out + '</b></span>' +
          '<span class="vc"><small>Markers</small><b class="num">' + s.total + '</b></span>' +
        '</div>' +
        '<div class="vprov">' + HV.esc(rep.label) + ' · ' + HV.esc(rep.date) +
          (doc ? '<br>Reviewed by ' + HV.esc(doc.name)
               : '<br>Shared with your Doctor — not yet reviewed') + '</div>' +
        (rep.bioAge != null && rep.pace != null
          ? '<div class="grid2">' +
              '<div class="vderive"><span class="k">Biological age</span>' +
                '<b class="num">' + rep.bioAge + '</b><small>vs ' + c.age + ' lived</small></div>' +
              '<div class="vderive"><span class="k">Pace of ageing</span>' +
                '<b class="num">' + rep.pace.toFixed(2) + '</b><small>years per year</small></div>' +
            '</div>'
          : '') +
      '</div>';

    var cards = grid.map(function (g) {
      return '<button class="gate' + (g.out ? ' miss' : '') + '" data-cat="' + HV.esc(g.cat.key) + '"' +
        (g.out ? ' data-flag="' + g.out + ' out"' : '') + '>' +
        /* NOT wrapped in .ic — that class carries `.gate .ic svg{width:24px}`
           for the console's gate cards, and at two classes it outranked
           `.vplate svg`, which silently rendered every plate at a quarter size.
           The plate is its own component; it does not borrow .ic's chrome. */
        HV.vitals.plate(g.cat.key, g.out > 0) +
        '<span class="nm">' + HV.esc(g.cat.name) + '</span>' +
        '<span class="mt">' + HV.esc(rep.ago || rep.date) + '</span>' +
      '</button>';
    }).join('');

    return VPK_CSS + picker + head +
      '<p class="sub" style="margin:0">Ten body systems, one report. A card stays quiet unless something in it needs a look.</p>' +
      '<div class="gate-grid">' + cards + '</div>' +
      '<div class="notice">Your raw report stays with your Doctor. What you see here is the reviewed panel — the same one your care team works from.</div>' +
      '<button class="btn quiet block" id="vpk-attach">Attach report PDF</button>' +
      '<div class="audit">A PDF you attach lands in your Records Vault as “Summary pending” — your Doctor reviews it from there.</div>';
  }

  function wireVitals(el, c) {
    el.querySelectorAll('[data-cat]').forEach(function (b) {
      b.addEventListener('click', function () { openCategory(b.dataset.cat, c); });
    });
    el.querySelectorAll('[data-rep]').forEach(function (b) {
      b.addEventListener('click', function () { selRepId = b.dataset.rep; HV.refresh(); });
    });
    var add = el.querySelector('#vpk-add');
    if (add) add.addEventListener('click', function () { openAddReport(c); });
    var att = el.querySelector('#vpk-attach');
    if (att) att.addEventListener('click', function () { attachPdf(c); });
  }

  /* The doctor-signed Health Summary, read to the client in their own words:
     the console calls these "contraindication flags" and "key metrics" because
     that is what a plan builder consumes — a client reads cautions and numbers.
     Same three lists, same source, no second copy of the data. */
  var MED_GROUPS = [
    { key: 'conditions', label: 'Conditions',     cls: '' },
    { key: 'flags',      label: 'Take care with', cls: ' warn' },
    { key: 'metrics',    label: 'Key numbers',    cls: ' num' },
  ];

  var NOTIFS = [
    { key: 'water',   label: 'Water reminder',  sub: 'Every 2 hours · 08:00–20:00',           def: true  },
    { key: 'workout', label: 'Workout reminder', sub: 'Day before + 60 min before each session', def: true  },
    { key: 'meals',   label: 'Meal follow-ups', sub: '08:00 / 13:30 / 20:30',                 def: true  },
    { key: 'sleep',   label: 'Sleep wind-down', sub: 'Opt-in · a gentle nudge before bed',    def: false },
  ];

  var CONSENTS = [
    { id: 'health', name: 'Health data processing',
      sub: 'Lets your care team see your trackers, plans and doctor-approved Health Summaries' },
    { id: 'mealai', name: 'Meal photo AI pre-scoring',
      sub: 'AI suggests a star rating for each meal photo; your dietitian always makes the final call' },
  ];

  function ensurePrefs() {
    if (!HV.store.notifPrefs) {
      var prefs = {};
      NOTIFS.forEach(function (n) { prefs[n.key] = n.def; });
      HV.store.notifPrefs = prefs;
      HV.save();
    }
    return HV.store.notifPrefs;
  }

  /* ---- MY CIRCLE OF CARE (moved here from Journey, TJ 9 Aug) ----
     Listed in the order a client meets them: the two who run the programme,
     the doctor who signs off on it, then the four coaches who deliver it one
     pillar each. The label is what the CLIENT calls the role — the console's
     own titles ("Ops Head", "Mind Wellness Coach") are staff vocabulary and
     stay in the console. `ops` marks the three roles that are never AI. */
  var TEAM = [
    { key: 'opshead',   label: 'Operations Head', ops: true },
    { key: 'admin',     label: 'Admin',           ops: true },
    { key: 'doctor',    label: 'Doctor',          ops: true },
    { key: 'dietitian', label: 'Dietitian' },
    { key: 'fitness',   label: 'Fitness Trainer' },
    { key: 'yoga',      label: 'Yoga Trainer' },
    { key: 'mind',      label: 'Counsellor' },
  ];

  function roleHolder(role) {
    return HV.store.users.filter(function (u) { return u.role === role; })[0] || null;
  }

  /* Who fills a seat. A pillar seat the pod doesn't name is genuinely the AI's
     — that is what Svayam means. An OPERATIONS seat is never the AI's:
     ops, admin and medical oversight are human on every plan, so when the pod
     is silent the role's holder answers for it rather than a coach avatar. */
  function seatFor(c, row) {
    var id = (c.pod || {})[row.key];
    if (id) return HV.staff(id);
    if (row.ops) return roleHolder(row.key) || HV.staff(null);
    return HV.staff(null);
  }

  function teamCard(c) {
    return '<div class="list">' + TEAM.map(function (row) {
      var who = seatFor(c, row);
      return '<div class="trow">' + HV.ui.avatar(who.name, 'sm') +
        '<span class="grow"><b>' + HV.esc(who.name) + '</b>' +
          '<small>' + HV.esc(row.label) + '</small></span>' +
        (who.ai ? HV.ui.pill('AI', 'info') : '') +
      '</div>';
    }).join('') + '</div>';
  }

  HV.registerView('profile', {
    title: 'Profile',
    roles: ['client'],

    render: function (el, params) {
      var c = HV.myClient();
      if (!c) {
        el.innerHTML = HV.ui.empty('leaf', 'No client record found for this account.');
        return;
      }
      var prefs = ensurePrefs();
      var docs = HV.store.documents.filter(function (d) { return d.clientId === c.id; });

      /* ---- header ---- */
      var header =
        '<div class="row" style="gap:var(--s3); padding:var(--s1) 0">' +
          HV.ui.avatar(c.name, 'lg') +
          '<div class="grow">' +
            '<h1 class="h1" style="margin:0">' + HV.esc(c.name) + '</h1>' +
            '<div class="row" style="gap:var(--s2); flex-wrap:wrap; margin-top:var(--s1)">' +
              HV.ui.pill(c.tier, 'info') +
              (c.observation ? HV.ui.pill('Observation window', 'warn') : '') +
              '<span class="sub">Cycle <span class="num">' + HV.esc(c.cycle) + '</span> · Day <span class="num">' + HV.esc(c.day) + '</span></span>' +
            '</div>' +
          '</div>' +
        '</div>';

      /* ---- purpose statement ---- */
      var purpose =
        '<div class="card">' +
          '<span class="k">Purpose statement</span>' +
          '<div style="font-size:var(--t-h3); font-weight:600; margin-top:var(--s2)">“' + HV.esc(c.purpose) + '”</div>' +
        '</div>';

      /* ---- the circle of care ---- */
      var circle =
        '<div class="kicker">MY CIRCLE OF CARE</div>' +
        teamCard(c) +
        '<p class="sub" style="margin:var(--s2) 0 0">These are the people at your ' + HV.copy.reviewWord() + ' review. They share one Care Circle, so nothing about your plan is decided in a conversation you cannot see.</p>';

      /* ---- medical notes ---- */
      /* One block per signed document rather than one merged list: a note means
         something only against the report it was signed on, so the provenance
         line stays attached to its own chips. */
      var summarised = docs.filter(function (d) { return HV.store.healthSummaries[d.id]; });
      var medBody = summarised.length
        ? summarised.map(function (d, i) {
            var s = HV.store.healthSummaries[d.id];
            var by = HV.staff(s.signedBy);
            return '<div style="' + (i ? 'border-top:1px solid var(--line); margin-top:var(--s4); padding-top:var(--s4)' : 'margin-top:var(--s3)') + '">' +
              '<div class="sub">' + HV.esc(d.name) + ' · ' + HV.esc(d.date) +
                ' · reviewed by ' + HV.esc(by.name) + '</div>' +
              MED_GROUPS.map(function (g) {
                var items = s[g.key] || [];
                if (!items.length) return '';
                return '<div style="margin-top:var(--s3)">' +
                  '<span class="k" style="display:block">' + HV.esc(g.label) + '</span>' +
                  items.map(function (x) {
                    return '<span class="chip' + g.cls + '">' + HV.esc(x) + '</span>';
                  }).join('') +
                '</div>';
              }).join('') +
            '</div>';
          }).join('')
        : '<p class="sub" style="margin:var(--s3) 0 0">Nothing here yet. Once your Doctor reviews a report you have shared, the conditions, cautions and key numbers they note appear here.</p>';

      var medical =
        '<div class="card">' +
          '<span class="k">Medical notes</span>' +
          medBody +
          '<div class="audit" style="margin-top:var(--s3)">Only your Doctor writes here. Your coaches read these notes and plan around them — they cannot change them.</div>' +
        '</div>';

      /* ---- records vault ---- */
      var docRows = docs.length
        ? docs.map(function (d, i) {
            return '<div class="row" style="padding:var(--s3) 0;' + (i ? ' border-top:1px solid var(--line)' : '') + '">' +
              HV.ui.iconTile('doc', 'sm') +
              '<span class="grow">' + HV.esc(d.name) +
                '<small class="sub" style="display:block">' + HV.esc(d.date) + ' · ' + HV.esc(d.type) + '</small></span>' +
              (d.summary === 'ready'
                ? HV.ui.pill('Summary ready', 'ok')
                : HV.ui.pill('Summary pending', 'warn')) +
            '</div>';
          }).join('')
        : '<p class="sub" style="margin:var(--s3) 0 0">No records yet. Share any report with your care team and it will appear here.</p>';

      var vault =
        '<div class="card">' +
          '<div class="kicker">YOUR RECORDS</div>' +
          '<span class="k">Records Vault</span>' +
          docRows +
          '<div class="notice" style="margin-top:var(--s4)">Raw records: your Doctor only. Your team sees the doctor-approved Health Summary.</div>' +
          '<div class="audit" style="margin-top:var(--s3)">Every document is versioned — new uploads never overwrite an earlier version.</div>' +
        '</div>';

      /* ---- notification & reminder settings ---- */
      var notif =
        '<div class="card">' +
          '<div class="kicker">HOW WE REACH YOU</div>' +
          '<span class="k">Notifications &amp; reminders</span>' +
          NOTIFS.map(function (n, i) {
            var on = !!prefs[n.key];
            return '<div class="row" style="padding:var(--s3) 0;' + (i ? ' border-top:1px solid var(--line)' : '') + '">' +
              '<span class="grow">' + HV.esc(n.label) +
                '<small class="sub" style="display:block">' + HV.esc(n.sub) + '</small></span>' +
              '<button class="pill ' + (on ? 'ok' : 'neutral') + '" data-toggle="' + n.key + '" role="switch" ' +
                'aria-checked="' + on + '" aria-label="' + HV.esc(n.label) + '">' + (on ? 'On' : 'Off') + '</button>' +
            '</div>';
          }).join('') +
          '<div class="audit" style="margin-top:var(--s3)">Quiet hours: 22:00–07:00 (session-critical exempt)</div>' +
        '</div>';

      /* ---- announcements from HAALVING ----
         Deliberately NOT a fifth NOTIFS row: that array feeds notifPrefs,
         which is ONE global object. The console resolves recipients across
         many clients, so a global flag would let one person's choice
         silence everybody. This writes announcePrefs[c.id]. ---- */
      var annOn = HV.announceOn(c.id);
      var announce =
        '<div class="card">' +
          '<div class="kicker">WHAT WE SEND YOU</div>' +
          '<span class="k">Announcements</span>' +
          '<div class="row" style="padding:var(--s3) 0">' +
            '<span class="grow">Offers, events and news' +
              '<small class="sub" style="display:block">Community invitations, new programmes and ' +
              'offers from HAALVING, in your Circle.</small></span>' +
            '<button class="pill ' + (annOn ? 'ok' : 'neutral') + '" data-announce="1" role="switch" ' +
              'aria-checked="' + annOn + '" aria-label="Offers, events and news">' +
              (annOn ? 'On' : 'Off') + '</button>' +
          '</div>' +
          /* the honest boundary, stated where the switch is — not buried */
          '<div class="audit" style="margin-top:var(--s3)">Your care team’s messages always ' +
          'reach you, and so does anything about your schedule or your safety. Turning this ' +
          'off stops offers and invitations only.</div>' +
        '</div>';

      /* ---- consents (DPDP) ---- */
      var consents =
        '<div class="card">' +
          '<div class="kicker">YOUR DATA</div>' +
          '<span class="k">Consents &amp; privacy (DPDP)</span>' +
          CONSENTS.map(function (cn, i) {
            return '<div class="row" style="padding:var(--s3) 0;' + (i ? ' border-top:1px solid var(--line)' : '') + '">' +
              '<span class="grow">' + HV.esc(cn.name) +
                '<small class="sub" style="display:block">' + HV.esc(cn.sub) + '</small></span>' +
              HV.ui.pill('Granted', 'ok') +
              '<button class="btn sm quiet" data-consent="' + cn.id + '">Manage</button>' +
            '</div>';
          }).join('') +
        '</div>';

      /* ---- account actions ---- */
      var account =
        '<div class="kicker">YOUR CALL</div>' +
        '<div class="sec-title">Account</div>' +
        '<button class="btn ghost block" id="pf-logout">Sign out</button>' +
        '<button class="btn ghost block" id="pf-reset" style="border-color:var(--danger); color:var(--danger)">Reset demo data</button>';

      el.innerHTML = header + purpose + circle + medical +
        '<div class="sec-title">Vital Panel</div>' + vitalsSection(c) +
        '<div class="sec-title">Records Vault</div>' + vault +
        '<div class="sec-title">Settings</div>' + notif + announce + consents +
        account;

      /* ---- wiring ---- */
      wireVitals(el, c);

      el.querySelectorAll('[data-toggle]').forEach(function (b) {
        b.addEventListener('click', function () {
          var key = b.dataset.toggle;
          HV.store.notifPrefs[key] = !HV.store.notifPrefs[key];
          HV.save();
          var def = NOTIFS.find(function (n) { return n.key === key; });
          HV.toast(HV.store.notifPrefs[key]
            ? def.label + ' is on'
            : def.label + ' paused. Resume any time.');
          HV.refresh();
        });
      });

      /* separate attribute from data-toggle on purpose — this one is keyed by
         client id and must never be swept into the global notifPrefs handler */
      el.querySelectorAll('[data-announce]').forEach(function (b) {
        b.addEventListener('click', function () {
          var on = !HV.announceOn(c.id);
          (HV.store.announcePrefs = HV.store.announcePrefs || {})[c.id] = on;
          HV.save();
          HV.toast(on
            ? 'Offers and invitations are on.'
            : 'Offers paused. Your team, your schedule and safety notices still reach you.');
          HV.refresh();
        });
      });

      el.querySelectorAll('[data-consent]').forEach(function (b) {
        b.addEventListener('click', function () {
          var cn = CONSENTS.find(function (x) { return x.id === b.dataset.consent; });
          HV.sheet(
            '<div class="h1" style="margin:0">' + HV.esc(cn.name) + '</div>' +
            '<div class="row" style="gap:var(--s2)">' + HV.ui.pill('Granted', 'ok') +
              '<span class="sub">under DPDP (India’s Digital Personal Data Protection Act)</span></div>' +
            '<p style="margin:0; font-size:var(--t-sm)">' + HV.esc(cn.sub) + '.</p>' +
            '<div class="notice">In the live app you can withdraw this consent at any time. Withdrawing pauses the linked feature and your care team is notified — nothing changes silently. In this demo, consents stay granted.</div>' +
            '<button class="btn block" id="cs-done">Done</button>' +
            '<button class="btn quiet block" id="cs-ask">Ask my care team about this</button>',
            function (sheet) {
              sheet.querySelector('#cs-done').addEventListener('click', HV.closeSheet);
              sheet.querySelector('#cs-ask').addEventListener('click', function () {
                if (c) HV.pushMsg(c.id, { fromId: 'client', kind: 'text',
                  text: 'Question about my ' + cn.name + ' consent — can someone walk me through what it covers?' });
                HV.closeSheet();
                HV.toast('Noted. Your care team will follow up.');
              });
            }
          );
        });
      });

      el.querySelector('#pf-logout').addEventListener('click', HV.logout);
      el.querySelector('#pf-reset').addEventListener('click', HV.reset);
    },
  });
})();
