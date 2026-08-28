/* HAALVING demo service worker — cache-first app shell for offline demo resilience. */
/* Bump CACHE on every asset change. The fetch handler matches with
   ignoreSearch:true, so ?v= query bumps alone will NOT invalidate. */
const CACHE = 'haalving-demo-v210';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  /* the data face ships with the shell — without it an offline launch falls
     back to whatever serif the OS has, which is the whole problem it solves */
  './fonts/newsreader-var.woff2',
  './js/core.js', './js/data.js', './js/vitals.js',
  /* shared by both shells — the session room and its report sheet */
  './js/views/meet.js',
  './js/views/client-today.js', './js/views/client-trackers.js', './js/views/client-meal.js', './js/views/client-plan.js',
  './js/views/client-coach.js', './js/views/client-coaches.js', './js/views/client-journey.js',
  './js/views/client-profile.js', './js/views/client-onboard.js',
  /* the two My Tribe pages: the honeycomb at #/tribe, the feed it replaced at
     #/tribe-classic — the honeycomb borrows the feed page's three faces, so
     neither ships without the other */
  './js/views/client-tribe.js', './js/views/client-hive.js',
  './js/views/console-digest.js', './js/views/console-clients.js', './js/views/console-client-record.js', './js/views/console-meals.js',
  './js/views/console-builder.js', './js/views/console-pipeline.js', './js/views/console-ops.js',
  './js/views/console-circles.js', './js/views/console-schedule.js', './js/views/console-medical.js',
  './js/views/console-approvals.js', './js/views/console-queues.js',
  './js/views/console-catalog.js', './js/views/console-people.js',
  './js/views/console-leave.js',
  './js/views/console-community.js', './js/views/console-config.js',
  './icons/icon.svg', './icons/icon-maskable.svg',
  /* the assessment's posture — a still to grade against, and an animated
     webp loop that behaves like a gif */
  './img/assess/uttanasana.webp', './img/assess/uttanasana-loop.webp',
  /* the Vital Panel's organ plates — two colourways per category, because the
     artwork itself carries the flagged state and a raster cannot be retinted
     in CSS. ~5KB each, so all twenty cost about as much as one photograph. */
  './img/vitals/microbiome-green.webp', './img/vitals/microbiome-red.webp',
  './img/vitals/epilimo-green.webp', './img/vitals/epilimo-red.webp',
  './img/vitals/blood-green.webp', './img/vitals/blood-red.webp',
  './img/vitals/heart-green.webp', './img/vitals/heart-red.webp',
  './img/vitals/hormones-green.webp', './img/vitals/hormones-red.webp',
  './img/vitals/infection-green.webp', './img/vitals/infection-red.webp',
  './img/vitals/kidney-green.webp', './img/vitals/kidney-red.webp',
  './img/vitals/lipid-green.webp', './img/vitals/lipid-red.webp',
  './img/vitals/liver-green.webp', './img/vitals/liver-red.webp',
  './img/vitals/sugar-green.webp', './img/vitals/sugar-red.webp',
  './img/vitals/thyroid-green.webp', './img/vitals/thyroid-red.webp',
  './img/vitals/urine-green.webp', './img/vitals/urine-red.webp',
  /* the pillar plates — the same specimen-art language, one per pillar,
     worn wherever a pillar introduces itself on Today and Plan */
  './img/pillars/culture.webp', './img/pillars/fitness.webp',
  './img/pillars/yoga.webp', './img/pillars/wellness.webp',
  /* the task plates — every prescription row's own specimen, graded into
     its pillar's palette family: meal slots, workout categories, yoga
     blocks and wellness practices. ~4KB each. */
  /* the dishes — one photograph per food in the Nutrition library, which the
     seed points every culture item at, so these are prescription art exactly
     as img/tasks is. Only the -1 renders ship: the -2 variants exist for the
     Catalog's generate flow and are runtime-cached on first sight, the same
     bargain img/food keeps. ~40KB each. */
  './img/dishes/dish-idli-1.webp', './img/dishes/dish-chutney-1.webp',
  './img/dishes/dish-dosa-1.webp', './img/dishes/dish-sambar-1.webp',
  './img/dishes/dish-oats-1.webp', './img/dishes/dish-cheela-1.webp',
  './img/dishes/dish-paneer-1.webp', './img/dishes/dish-curdrice-1.webp',
  './img/dishes/dish-ragi-1.webp', './img/dishes/dish-sprouts-1.webp',
  './img/dishes/dish-upma-1.webp', './img/dishes/dish-buttermilk-1.webp',
  './img/tasks/culture-drink.webp', './img/tasks/culture-breakfast.webp',
  './img/tasks/culture-snack.webp', './img/tasks/culture-lunch.webp',
  './img/tasks/culture-prework.webp', './img/tasks/culture-dinner.webp',
  './img/tasks/fitness-strength.webp', './img/tasks/fitness-muscle.webp',
  './img/tasks/fitness-endurance.webp', './img/tasks/fitness-cardio.webp',
  './img/tasks/yoga-mobility.webp', './img/tasks/yoga-flexibility.webp',
  './img/tasks/yoga-breath.webp',
  './img/tasks/wellness-breath.webp', './img/tasks/wellness-downshift.webp',
  './img/tasks/wellness-nidra.webp',
  /* the onboarding story deck — seven portrait cards, Blue Zones into
     HAALVING Culture. ~535KB total; the eighth slide is the Index itself
     and ships as code, not pixels. */
  './img/onboard/bz-live.webp', './img/onboard/bz-table.webp',
  './img/onboard/culture.webp', './img/onboard/nutrition.webp',
  './img/onboard/fitness.webp', './img/onboard/yoga.webp',
  './img/onboard/mindspace.webp',
  /* the Nutrient Panel's hologram body — one 33KB webp, worn by the stage
     and, in miniature, by Today's floating button */
  './img/np/body.webp',
  /* the arrival — the login's Kerala morning. The still is the poster, the
     welcome cover and the reduced-motion fallback; the loop is 2.6MB of
     H.264, light enough to ship with the shell so login never opens blank. */
  './media/welcome.jpg', './media/welcome.mp4'
];

self.addEventListener('install', e => {
  /* cache:'reload' bypasses the HTTP cache so a new CACHE version can never
     freeze stale copies the browser was still holding */
  e.waitUntil(caches.open(CACHE)
    /* code must never freeze stale, but the film + poster were usually just
       fetched by the login screen itself — let media reuse the HTTP cache
       instead of pulling 2.2MB down twice */
    .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: u.startsWith('./media/') ? 'default' : 'reload' }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  /* after claiming, reload every open tab once — a new CACHE means new code,
     and a tab still running the old bundle would otherwise need a second
     manual reload to see it. activate fires once per new SW, so no loop. */
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(cs => cs.forEach(cl => cl.navigate(cl.url).catch(() => {}))));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
      /* only a good response may become an asset — a cached 404 page would
         be served as that asset for the life of the cache */
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => e.request.mode === 'navigate'
      /* offline SPA fallback is for navigations ONLY — an <img> answered
         with index.html decodes to nothing and looks like a missing photo */
      ? caches.match('./index.html')
      : Response.error()))
  );
});
