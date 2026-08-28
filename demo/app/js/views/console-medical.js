/* HAALVING view — CC-12 Medical Review & Health Summary. Gated by the
   rawRecords PERMISSION, not a hard role list: the Doctor holds it by
   default, and a role granted it in People & Access genuinely gains this
   desk. Everyone else gets a logged lock notice inside the view. */
(function () {
  'use strict';

  /* which document is open in the reviewer — module-local so it survives HV.refresh() */
  let selectedId = null;

  /* unsigned edits per document id: { conditions:[], flags:[], metrics:[] } */
  const drafts = {};

  /* signed docs being revised (doc id -> true) and, for the lab series,
     which report of a client's series is open (clientId -> report id) */
  const revising = {};
  const labSel = {};

  /* Sensible pre-fill for the seeded pending doc (Kiran R. blood panel).
     The editor is manual at v1 — this stands in for the doctor's own reading. */
  const PREFILL = {
    d3: {
      conditions: ['Borderline B12', 'Prediabetic range'],
      flags: ['No fasting workouts', 'Moderate intensity until B12 recovers'],
      metrics: ['HbA1c 5.9', 'B12 210 pg/mL', 'Fasting glucose 104 mg/dL'],
    },
  };

  const GROUPS = [
    { key: 'conditions', label: 'Conditions', hint: 'Diagnoses & findings the pod plans around', ph: 'Add a condition…' },
    { key: 'flags', label: 'Contraindication flags', hint: 'Feeds the plan generators — chart & diet builders exclude these automatically', ph: 'Add a flag…' },
    { key: 'metrics', label: 'Key metrics', hint: 'Structured numbers, trended across document versions', ph: 'Add a metric…' },
  ];

  function ownerName(doc) {
    if (doc.prospect) return doc.prospect;
    const c = HV.client(doc.clientId);
    return c ? c.name : 'Unknown';
  }

  function draftFor(doc) {
    if (!drafts[doc.id]) {
      const p = PREFILL[doc.id];
      drafts[doc.id] = p
        ? { conditions: p.conditions.slice(), flags: p.flags.slice(), metrics: p.metrics.slice() }
        : { conditions: [], flags: [], metrics: [] };
    }
    return drafts[doc.id];
  }

  /* ── the lab marker series (A8) ──────────────────────────────────────
     The doctor's counterpart to the client panel's report picker: for the
     selected document's client, every dated report in store.labReports as
     chips, and each marker's movement against the report before it. */
  const MD_CSS =
    '<style>' +
    '.md-chips{display:flex; flex-wrap:wrap; align-items:center; gap:var(--s1)}' +
    '.md-chips .chip{margin:0}' +
    '.md-mrow{display:flex; align-items:center; gap:var(--s3); padding:var(--s2) 0; font-size:var(--t-sm)}' +
    '.md-mrow + .md-mrow{border-top:1px solid var(--line)}' +
    '.md-mrow b small{color:var(--ink-2); font-weight:400; margin-left:var(--s1)}' +
    '.md-mrow b.md-out{color:var(--danger)}' +
    '.md-d{display:inline-flex; align-items:center; gap:var(--s1); flex:none; font-size:var(--t-xs);' +
      ' color:var(--ink-2); padding:0 var(--s2); border-radius:var(--r-full); background:var(--surface-2)}' +
    '.md-d svg{width:12px; height:12px}' +
    '.md-d.good{color:var(--ok); background:var(--ok-wash)}' +
    '.md-d.away{color:var(--danger); background:var(--danger-wash)}' +
    '</style>';

  const LMON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function repLabel(r, arr) {
    const p = r.date.split('-');
    const my = LMON[+p[1] - 1] + ' ' + p[0];
    const dup = arr.some(o => o !== r && o.date.slice(0, 7) === r.date.slice(0, 7));
    return dup ? +p[2] + ' ' + my : my;
  }
  function dpOf(n) {
    const s = String(n), i = s.indexOf('.');
    return i === -1 ? 0 : s.length - i - 1;
  }
  function seriesFor(clientId) {
    const arr = HV.vitals.reportsFor(clientId);
    if (!arr.length) return null;
    const rep = arr.find(r => r.id === labSel[clientId]) || arr[arr.length - 1];
    const i = arr.indexOf(rep);
    return { arr, rep, prev: i > 0 ? arr[i - 1] : null };
  }

  /* colour answers only: toward the band or away from it? Direction of
     'good' differs per marker, and the band already encodes it — both
     readings inside the band stay neutral ink. */
  function deltaChip(key, rep, prev, sex) {
    if (!prev) return '';
    const cur = HV.vitals.read(key, rep, sex);
    const old = HV.vitals.read(key, prev, sex);
    if (!cur || !old) return '<span class="md-d">new</span>';
    if (cur.qual || old.qual) {
      return '<span class="md-d">' + (String(cur.display) === String(old.display) ? 'same' : 'was ' + HV.esc(old.display)) + '</span>';
    }
    const d = cur.value - old.value;
    if (!d) return '<span class="md-d">same</span>';
    const gap = v => v < cur.low ? cur.low - v : v > cur.high ? v - cur.high : 0;
    const was = gap(old.value), now = gap(cur.value);
    const cls = now < was ? ' good' : now > was ? ' away' : '';
    const prec = Math.max(dpOf(cur.value), dpOf(old.value));
    return '<span class="md-d' + cls + '">' + HV.ui.icon(d > 0 ? 'caretUp' : 'caretDown') +
      '<span class="num">' + HV.esc(Math.abs(d).toFixed(prec)) + '</span></span>';
  }

  function labSeriesHtml(doc) {
    const c = doc.clientId ? HV.client(doc.clientId) : null;
    if (!c) return '';
    const s3 = seriesFor(c.id);
    if (!s3) return '';
    const { arr, rep, prev } = s3;
    const sum = HV.vitals.summary(rep, c.sex);
    const grid = HV.vitals.grid(rep, c.sex);
    return (
      '<div class="sec-title">Lab marker series — ' + HV.esc(c.name) + '</div>' +
      '<div class="card">' +
        '<div class="md-chips">' + arr.map(r =>
          '<button class="chip' + (r === rep ? ' sel' : '') + '" data-lrep="' + HV.esc(r.id) + '"' +
            (r === rep ? ' aria-current="true"' : '') + '>' + HV.esc(repLabel(r, arr)) + '</button>').join('') +
        '</div>' +
        '<p class="sub" style="margin:var(--s2) 0 0">' + HV.esc(rep.label) + ' · ' + HV.esc(rep.date) +
          (rep.signedBy ? ' · signed by ' + HV.esc(HV.staff(rep.signedBy).name) : ' · self-reported, unsigned') +
          ' — <span class="num">' + sum.total + '</span> markers, <span class="num">' + sum.out + '</span> flagged' +
          (prev ? '. Deltas read against ' + HV.esc(repLabel(prev, arr)) + '.' : '. First report in the series — no deltas yet.') +
        '</p>' +
        '<div class="list" style="margin-top:var(--s3)">' + grid.map(g =>
          '<button class="trow click" data-vcat="' + HV.esc(g.cat.key) + '">' +
            '<span class="mealph sm">' + HV.ui.icon('flask') + '</span>' +
            '<span class="grow"><b>' + HV.esc(g.cat.name) + '</b>' +
              '<small><span class="num">' + g.rows.length + '</span> markers ordered</small></span>' +
            (g.out
              ? '<span class="pill bad"><span class="num">' + g.out + '</span>&nbsp;out</span>'
              : '<span class="pill ok">In range</span>') +
          '</button>').join('') + '</div>' +
      '</div>'
    );
  }

  function openCatSheet(catKey, c) {
    const s3 = seriesFor(c.id);
    if (!s3) return;
    const { arr, rep, prev } = s3;
    const g = HV.vitals.category(catKey, rep, c.sex);
    if (!g) return;
    HV.sheet(
      MD_CSS +
      '<div class="h1" style="margin:0">' + HV.esc(g.cat.name) + '</div>' +
      '<div class="sub">' + HV.esc(rep.label) + ' · ' + HV.esc(rep.date) +
        (prev ? ' · deltas vs ' + HV.esc(repLabel(prev, arr)) : '') + '</div>' +
      '<div>' + g.rows.map(r =>
        '<div class="md-mrow">' +
          '<span class="grow">' + HV.esc(r.def.name) + '</span>' +
          '<b class="num' + (r.out ? ' md-out' : '') + '">' + HV.esc(String(r.display)) +
            (r.def.unit ? '<small>' + HV.esc(r.def.unit) + '</small>' : '') + '</b>' +
          deltaChip(r.key, rep, prev, c.sex) +
        '</div>').join('') + '</div>' +
      '<div class="audit">Delta colour marks movement toward or away from the reference band — neutral when both readings sit inside it.</div>' +
      '<button class="btn quiet block" id="md-done">Done</button>',
      sheet => { sheet.querySelector('#md-done').addEventListener('click', HV.closeSheet); }
    );
  }

  /* body only — the host draws the h1. Everything below closes over `el`, so the
     container is a parameter rather than the view's root. */
  function mountInto(el) {
      draw();

      function draw() {
        const me = HV.me();
        const myIds = HV.myClients().map(c => c.id);
        const docs = HV.store.documents.filter(d => d.prospect || myIds.includes(d.clientId));
        const pending = docs.filter(d => d.summary === 'pending');
        const signed = docs.filter(d => d.summary === 'ready');
        const selected = selectedId ? docs.find(d => d.id === selectedId) : null;
        const cap = HV.store.capacity.find(c => c.staffId === me.id);

        el.innerHTML =
          MD_CSS +
          headerHtml(cap, pending.length, signed.length) +
          '<div class="sec-title">Summary pending</div>' +
          (pending.length
            ? '<div class="list">' + pending.map(d => rowHtml(d, selected)).join('') + '</div>'
            : HV.ui.empty('heart', 'All clear — no summaries waiting. Your pod is fully covered.')) +
          (selected
            ? '<div class="sec-title">Document reviewer</div>' + splitHtml(selected, me) + labSeriesHtml(selected)
            : '<p class="sub">Select a document to open the reviewer — raw records render on this screen only.</p>') +
          '<div class="sec-title">Signed — pod-visible</div>' +
          '<div class="list">' + signed.map(d => rowHtml(d, selected)).join('') + '</div>' +
          '<div class="notice" style="margin-top:var(--s1)">Document policy: new versions never overwrite priors. Each sign-off writes a fresh version; older summaries flip to “superseded by new document” and stay in the record.</div>';

        wire(selected, me);
      }

      function headerHtml(cap, nPending, nSigned) {
        const pct = cap && cap.cap ? Math.round((cap.load / cap.cap) * 100) : 0;
        return (
          (cap ? '<div class="row" style="justify-content:flex-end">' +
                 HV.ui.dial(pct, 'caseload used', { color: 'brand' }) + '</div>' : '') +
          '<div class="grid3">' +
            '<div class="stat"><span class="k">My caseload</span><div class="v num">' + (cap ? cap.load + ' / ' + cap.cap : '—') + '</div><span class="sub">clients under medical oversight</span></div>' +
            '<div class="stat"><span class="k">Summaries pending</span><div class="v num">' + nPending + '</div><span class="sub">raw documents awaiting sign-off</span></div>' +
            '<div class="stat"><span class="k">Signed &amp; pod-visible</span><div class="v num ok">' + nSigned + '</div><span class="sub">structured summaries live</span></div>' +
          '</div>'
        );
      }

      function rowHtml(doc, selected) {
        const sel = selected && selected.id === doc.id;
        const pill = doc.summary === 'pending'
          ? HV.ui.pill('Summary pending', 'warn')
          : HV.ui.pill('Signed', 'ok');
        return (
          '<button class="trow click" data-doc="' + HV.esc(doc.id) + '"' + (sel ? ' style="box-shadow:inset 0 0 0 1.5px var(--brand)" aria-current="true"' : '') + '>' +
            '<span class="mealph sm">' + HV.ui.icon('doc') + '</span>' +
            '<span class="grow"><b>' + HV.esc(doc.name) + '</b> — ' + HV.esc(ownerName(doc)) +
            '<small>' + HV.esc(doc.type) + ' · uploaded ' + HV.esc(doc.date) + '</small></span>' +
            pill +
          '</button>'
        );
      }

      function splitHtml(doc, me) {
        return '<div class="split">' + rawViewerHtml(doc, me) +
          (doc.summary === 'pending' || revising[doc.id] ? editorHtml(doc) : signedHtml(doc)) + '</div>';
      }

      function rawViewerHtml(doc, me) {
        if (!HV.can('rawRecords')) {
          return '<div class="card"><div class="empty"><span class="big">' + HV.ui.icon('lock') + '</span>Raw records require doctor access.<br><span class="audit">This access attempt was logged.</span></div></div>';
        }
        return (
          '<div class="card">' +
            '<span class="k">Raw document — never leaves this screen</span>' +
            '<div class="mealph lg" style="margin-top:var(--s2)">' + HV.ui.icon('doc') + '</div>' +
            '<p class="sub" style="margin:var(--s2) 0 var(--s1)">Raw document viewer (zoom) — ' + HV.esc(doc.name) + ' · ' + HV.esc(ownerName(doc)) + '</p>' +
            '<span class="audit">Access to medical records is logged — opened by ' + HV.esc(me.name) + ' · just now</span>' +
          '</div>'
        );
      }

      function editorHtml(doc) {
        const d = draftFor(doc);
        const rev = !!revising[doc.id];
        return (
          '<div class="card">' +
            '<span class="k">Health Summary editor' + (rev ? ' — revision' : '') + '</span>' +
            '<p class="sub" style="margin:var(--s1) 0 0">' + (rev
              ? 'You are revising a signed summary. Re-signing keeps the current version in this document’s history.'
              : 'The pod sees only this structured summary — never the raw record. Manual at v1; copilot pre-extraction arrives later.') + '</p>' +
            GROUPS.map(g => groupHtml(g, d[g.key], true)).join('') +
            '<button class="btn block" id="sign-off" style="margin-top:var(--s4)">' +
              (rev ? 'Re-sign — previous version kept' : 'Sign &amp; publish to pod') + '</button>' +
            (rev ? '<button class="btn quiet block" id="rev-cancel" style="margin-top:var(--s2)">Cancel revision</button>' : '') +
            '<p class="audit" style="margin:var(--s2) 0 0">Signing writes a new version, pod-visible within 1 min. New versions never overwrite priors.</p>' +
          '</div>'
        );
      }

      function groupHtml(g, items, editable) {
        return (
          '<div style="margin-top:var(--s3)">' +
            '<span class="k">' + g.label + '</span>' +
            '<p class="sub" style="margin:var(--s1) 0 var(--s1)">' + g.hint + '</p>' +
            '<div>' + (items.length
              ? items.map((t, i) =>
                  '<span class="chip sel">' + HV.esc(t) +
                  (editable ? '<button data-del="' + g.key + '" data-i="' + i + '" aria-label="Remove ' + HV.esc(t) + '" style="margin-left:var(--s2); font-weight:600">' + HV.ui.icon('x') + '</button>' : '') +
                  '</span>').join('')
              : '<span class="sub">None recorded yet.</span>') + '</div>' +
            (editable
              ? '<div class="row" style="margin-top:var(--s2)">' +
                  '<input class="input" data-inp="' + g.key + '" placeholder="' + g.ph + '" aria-label="' + g.label + '">' +
                  '<button class="btn sm quiet" data-add="' + g.key + '">Add</button>' +
                '</div>'
              : '') +
          '</div>'
        );
      }

      function signedHtml(doc) {
        const sum = HV.store.healthSummaries[doc.id];
        const by = sum && HV.staff(sum.signedBy);
        const data = sum || { conditions: [], flags: [], metrics: [] };
        const hist = (sum && sum.history) || [];
        const histHtml = hist.length
          ? '<div style="margin-top:var(--s3)"><span class="k">Version history</span>' +
            hist.map((h, i) => {
              const hby = HV.staff(h.signedBy);
              const n = (h.conditions || []).length + (h.flags || []).length + (h.metrics || []).length;
              return '<p class="audit" style="margin:var(--s1) 0 0">v' + (i + 1) + ' · ' +
                '<span class="num">' + n + '</span> items · signed by ' + HV.esc(hby ? hby.name : '—') +
                (h.ts ? ' · superseded ' + HV.esc(new Date(h.ts).toLocaleDateString('en-GB',
                  { day: 'numeric', month: 'short', year: 'numeric' })) : '') + '</p>';
            }).join('') + '</div>'
          : '';
        return (
          '<div class="card">' +
            '<div class="row"><span class="k grow">Health Summary — read-only</span>' + HV.ui.pill('Signed · pod-visible', 'ok') + '</div>' +
            GROUPS.map(g => groupHtml(g, data[g.key] || [], false)).join('') +
            '<p class="sub" style="margin:var(--s3) 0 0">Signed by ' + (by ? HV.esc(by.name) : '—') + '.</p>' +
            histHtml +
            '<div class="notice" style="margin-top:var(--s2)">Versioned record: if a newer document of this type arrives, this summary is marked “superseded by new document”. Priors are never edited or deleted.</div>' +
            (sum ? '<button class="btn quiet block" id="md-revise" style="margin-top:var(--s3)">Revise &amp; re-sign</button>' : '') +
          '</div>'
        );
      }

      function wire(selected, me) {
        el.querySelectorAll('[data-doc]').forEach(b =>
          b.addEventListener('click', () => { selectedId = b.dataset.doc; draw(); }));

        /* lab marker series: report chips + category sheets */
        if (selected && selected.clientId) {
          const lc = HV.client(selected.clientId);
          if (lc) {
            el.querySelectorAll('[data-lrep]').forEach(b =>
              b.addEventListener('click', () => { labSel[lc.id] = b.dataset.lrep; draw(); }));
            el.querySelectorAll('[data-vcat]').forEach(b =>
              b.addEventListener('click', () => openCatSheet(b.dataset.vcat, lc)));
          }
        }

        /* signed card: open the editor over a copy of the live summary */
        const rv = el.querySelector('#md-revise');
        if (rv && selected) rv.addEventListener('click', () => {
          const sum = HV.store.healthSummaries[selected.id];
          if (!sum) return;
          drafts[selected.id] = {
            conditions: (sum.conditions || []).slice(),
            flags: (sum.flags || []).slice(),
            metrics: (sum.metrics || []).slice(),
          };
          revising[selected.id] = true;
          draw();
        });

        if (!selected || (selected.summary !== 'pending' && !revising[selected.id])) return;
        const doc = selected;

        const rc = el.querySelector('#rev-cancel');
        if (rc) rc.addEventListener('click', () => {
          delete drafts[doc.id];
          delete revising[doc.id];
          draw();
        });

        function addChip(key) {
          const inp = el.querySelector('[data-inp="' + key + '"]');
          const v = inp.value.trim();
          if (!v) return;
          draftFor(doc)[key].push(v);
          draw();
          const again = el.querySelector('[data-inp="' + key + '"]');
          if (again) again.focus();
        }

        el.querySelectorAll('[data-add]').forEach(b =>
          b.addEventListener('click', () => addChip(b.dataset.add)));
        el.querySelectorAll('[data-inp]').forEach(inp =>
          inp.addEventListener('keydown', e => { if (e.key === 'Enter') addChip(inp.dataset.inp); }));
        el.querySelectorAll('[data-del]').forEach(b =>
          b.addEventListener('click', () => {
            draftFor(doc)[b.dataset.del].splice(Number(b.dataset.i), 1);
            draw();
          }));

        el.querySelector('#sign-off').addEventListener('click', () => {
          const d = draftFor(doc);
          if (!d.conditions.length && !d.flags.length && !d.metrics.length) {
            HV.toast('Add at least one condition, flag or metric before signing.');
            return;
          }
          /* re-signing pushes the outgoing version into history — change
             tracking on summaries; priors are never edited or deleted */
          const prevSum = HV.store.healthSummaries[doc.id];
          const entry = {
            conditions: d.conditions.slice(),
            flags: d.flags.slice(),
            metrics: d.metrics.slice(),
            signedBy: me.id,
            ts: HV.now(),
          };
          if (prevSum) {
            entry.history = (prevSum.history || []).concat([{
              conditions: (prevSum.conditions || []).slice(),
              flags: (prevSum.flags || []).slice(),
              metrics: (prevSum.metrics || []).slice(),
              signedBy: prevSum.signedBy,
              ts: prevSum.ts || null,
            }]);
          }
          doc.summary = 'ready';
          HV.store.healthSummaries[doc.id] = entry;
          const wasRevision = !!revising[doc.id];
          delete revising[doc.id];
          const who = ownerName(doc);
          const pipe = HV.store.pipeline.find(p => p.name === who);
          if (pipe) pipe.note = 'Docs collected · summary ready';
          /* completing the underlying action auto-clears the generated task (CC-10) */
          const task = HV.store.worklist.find(w =>
            w.status === 'open' && w.text.indexOf('Health Summary') === 0 && w.text.indexOf(who) !== -1);
          if (task) task.status = 'done';
          delete drafts[doc.id];
          HV.save();
          HV.refresh();
          HV.toast(wasRevision
            ? 'Summary re-signed. The previous version stays in this document’s history.'
            : 'Health Summary signed. The pod sees the structured summary, never the raw record.');
        });
      }
  }

  const MEDICAL_HEAD =
    '<div class="h1-row"><div><div class="kicker">THE DOCTOR’S DESK</div>' +
      '<h1 class="h1">Medical review &amp; health summary</h1>' +
      '<p class="sub" style="margin:0">Doctor only — raw documents render for no other role. ' +
      'Every open is audit-logged.</p></div></div>';

  HV.registerBoard('medical', {
    label: 'Medical',
    perm: 'rawRecords',
    count() { return HV.store.documents.filter(d => d.summary === 'pending').length; },
    mount(el) { mountInto(el); },
  });

  HV.registerView('medical', {
    title: 'Medical Review',
    /* No roles array — the route rides the nav gate ('queues'), and the
       clinical lock is the rawRecords PERMISSION checked here in render.
       That closes the old gap (any queues-nav role reaching the sign-off
       handlers) while making the gate live: rawRecords stays Doctor-only in
       the seed, but an admin who grants their role the perm in People &
       Access genuinely gains this desk. Everyone else sees a logged lock
       notice, and none of the editor is ever mounted for them. */
    render(el) {
      if (!HV.can('rawRecords')) {
        el.innerHTML = MEDICAL_HEAD +
          '<div class="card"><div class="empty"><span class="big">' + HV.ui.icon('lock') + '</span>' +
          'Raw medical records need the rawRecords permission — the Doctor holds it by default.' +
          '<br><span class="sub">A Super Admin can grant it to a role in People &amp; Access.</span>' +
          '<br><span class="audit">This access attempt was logged.</span></div></div>';
        return;
      }
      el.innerHTML = MEDICAL_HEAD + '<div id="board-root"></div>';
      mountInto(el.querySelector('#board-root'));
    },
  });
})();
