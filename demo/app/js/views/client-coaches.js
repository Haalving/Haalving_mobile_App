/* CH-04 · Get a coach — the coach marketplace, one page filtered by pillar.
   Reached from a pillar's "Get a coach" row on Today: #/coaches/<pillar>.
   Fittr's coach-listing structure rebuilt in this product's language: no
   glossy hero banners — the avatar, the record in serif numerals, the
   specialities as chips, and one quiet promise line. The client's current
   human coach (if the pillar has one) leads the list wearing "Your coach". */
(function () {
  'use strict';

  /* humanPillars/pillar keys → the pod's role keys (the eternal translation) */
  const POD_KEY = { fitness: 'fitness', yoga: 'yoga', culture: 'dietitian', wellness: 'mind' };
  const ORDER = ['fitness', 'culture', 'yoga', 'wellness'];

  function coachCard(co, isMine) {
    const stat = (v, label) =>
      '<span class="cstat"><b class="num">' + v + '</b><small>' + label + '</small></span>';
    return '<div class="card coachc' + (isMine ? ' mine' : '') + '">' +
      '<div class="trow" style="margin:0">' +
        HV.ui.avatar(co.name, 'lg') +
        '<span class="grow"><b>' + HV.esc(co.name) + '</b>' +
          '<small>' + HV.esc(co.title) + '</small></span>' +
        (isMine ? HV.ui.pill('Your coach', 'ok') : HV.ui.stars(Math.round(co.rating))) +
      '</div>' +
      '<div class="coach-meta">' +
        stat(co.rating.toFixed(1), 'rating') +
        stat(co.years, 'yrs coaching') +
        stat(co.clients, 'clients') +
      '</div>' +
      '<div class="coach-tags">' +
        co.spec.map(s => '<span class="chip">' + HV.esc(s) + '</span>').join('') +
      '</div>' +
      '<div class="coach-foot">' +
        '<span class="cprice"><span class="num">₹' + co.price.toLocaleString('en-IN') + '</span><small>/month</small></span>' +
        (isMine
          ? '<span class="sub">In your circle</span>'
          : '<button class="btn sm" data-connect="' + HV.esc(co.id) + '">Connect</button>') +
      '</div>' +
    '</div>';
  }

  HV.registerView('coaches', {
    title: 'Get a coach',
    roles: ['client'],
    render(el, params) {
      const client = HV.myClient();
      if (!client) {
        el.innerHTML = HV.ui.empty('leaf', 'We couldn’t find your record. Switch persona and try again.');
        return;
      }
      const sel = ORDER.includes(params && params[0]) ? params[0] : 'fitness';
      const p = HV.PILLARS[sel];
      const market = (HV.store.coachMarket || []).filter(c => c.pillar === sel);
      const mineId = (client.pod || {})[POD_KEY[sel]];
      /* the current coach leads; the rest follow by rating */
      const list = market.slice().sort((a, b) =>
        (b.staffId === mineId) - (a.staffId === mineId) || b.rating - a.rating);

      el.innerHTML =
        /* .dnav-back carries the brand voice AND the 44px touch-reach pseudo */
        '<button class="dnav-back" data-back style="font-size:var(--t-xs)">‹ Back to Today</button>' +
        '<div class="h1-row ' + p.cls + '" style="margin-top:var(--s2)">' +
          '<h1 class="h1 row" style="gap:var(--s3); margin:0">' + HV.ui.plate(sel) + 'Get a coach</h1>' +
        '</div>' +
        '<p class="sub" style="margin:0">Handpicked ' + HV.esc(p.name) + ' experts — a human voice over your AI’s working.</p>' +
        '<div class="cfilter" role="tablist" aria-label="Pillar">' +
          ORDER.map(k =>
            '<a class="chip' + (k === sel ? ' sel' : '') + '" href="#/coaches/' + k + '"' +
            (k === sel ? ' aria-current="page"' : '') + '>' + HV.esc(HV.PILLARS[k].name) + '</a>').join('') +
        '</div>' +
        (list.length
          ? list.map(co => coachCard(co, co.staffId && co.staffId === mineId)).join('')
          : HV.ui.empty('users', 'Coaches for this pillar are joining soon.')) +
        '<div class="audit">Every HAALVING coach keeps 100% of their coaching earnings.</div>';

      el.querySelector('[data-back]').addEventListener('click', () => HV.go('#/today'));

      el.querySelectorAll('[data-connect]').forEach(b => b.addEventListener('click', () => {
        const co = market.find(c => c.id === b.dataset.connect);
        if (!co) return;
        HV.sheet(
          '<div class="h1">' + HV.esc(co.name) + '</div>' +
          '<div class="sub">' + HV.esc(co.title) + ' · ' + HV.esc(p.name) + '</div>' +
          '<div class="card"><span class="k">Why clients choose ' + HV.esc(co.name.split(' ')[0]) + '</span>' +
            '<div style="margin-top:var(--s2); font-size:var(--t-sm)">' + HV.esc(co.line) + '</div>' +
            '<div class="coach-tags" style="margin-top:var(--s3)">' +
              co.spec.map(s => '<span class="chip">' + HV.esc(s) + '</span>').join('') +
            '</div>' +
          '</div>' +
          '<div class="row" style="justify-content:space-between">' +
            '<span class="cprice"><span class="num">₹' + co.price.toLocaleString('en-IN') + '</span><small>/month</small></span>' +
            HV.ui.stars(Math.round(co.rating)) +
          '</div>' +
          '<button class="btn block" id="co-req">Request ' + HV.esc(co.name.split(' ')[0]) + ' as my coach</button>',
          sh => sh.querySelector('#co-req').addEventListener('click', () => {
            HV.pushMsg(client.id, {
              fromId: client.plan === 'poorna' ? 'u-anita' : 'ai', kind: 'text',
              text: co.name + ' has your request for ' + p.name + ' — a fit call comes first, then they join your circle.',
            });
            HV.closeSheet();
            HV.toast('Request sent — ' + co.name.split(' ')[0] + ' will reach out for a fit call.');
          })
        );
      }));
    },
  });
})();
