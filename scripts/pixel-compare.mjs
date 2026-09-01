#!/usr/bin/env node
/**
 * THE PIXEL HARNESS — the demo and the app, side by side, counted.
 *
 * WHAT IT IS. It opens the same screen twice — once in the demo, once in the
 * Expo app running under react-native-web — at one phone viewport, and counts
 * the pixels that differ. The count is the whole point: "looks the same" is an
 * opinion, 1,284 differing pixels is not.
 *
 * WHAT IT PROVES, AND WHAT IT DOES NOT. See docs/pixel/REPORT.md. The short
 * version: react-native-web runs the same Yoga layout the app uses for flexbox,
 * spacing, type sizes and colour, so a delta here is a real delta. It is NOT the
 * native renderer — shadows, `gap`, and font metrics can still differ on device.
 * A clean run means the layout matches; it does not mean the screen is shipped.
 *
 * TODAY IT IS A REPORT, NOT A GATE. It exits 0 on deltas. It exits non-zero only
 * when it could not run at all, which is a different kind of failure and must not
 * be silent. Deltas land in docs/pixel/REPORT.md; anything over the threshold also
 * earns a line in docs/pixel/TODO.md, which is the precision list.
 *
 * USAGE
 *   pnpm --filter @haalving/mobile dev --web    # leave Metro running
 *   pnpm pixel                                  # every screen
 *   pnpm pixel today profile                    # just these
 */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'pixel', 'shots');

/* The demo's client shell is max-width:520px with breakpoints at 374, 360 and
   340. 390 sits clear of all three, so neither side is rendering a narrow-screen
   branch the other is not. 844 is the iPhone 14 height. DPR 2 because a 1x shot
   hides half-pixel borders, and half-pixel borders are exactly where a port like
   this drifts first. */
const VIEWPORT = { width: 390, height: 844 };
const DPR = 2;

/* Above this many differing pixels a screen earns a line in TODO.md. The brief
   says 2px of movement; a count is what a diff can actually measure, so this is a
   proxy — large enough to ignore antialiasing along glyph edges, small enough
   that a 2px shift of any real block clears it. */
const THRESHOLD = 2000;

/* pixelmatch's own default per-pixel tolerance: strict enough to catch a
   one-shade colour error, loose enough not to flag subpixel text rendering. */
const MATCH_TOLERANCE = 0.1;

const APP_ORIGIN = process.env.PIXEL_APP_ORIGIN ?? 'http://localhost:8081';

/* The two personas, chosen because between them they answer rule 1 in both
   directions: Rajesh is Poorna with four HUMAN pillars, so no AI copy may appear
   anywhere; Ananya is Svayam end to end, so it must appear everywhere. A screen
   that looks right for one and wrong for the other is the bug this pair exists
   to catch. */
const PERSONAS = {
  rajesh: { demoUser: 'u-cl-rajesh', label: 'Poorna - human pillars' },
  ananya: { demoUser: 'u-cl-ananya', label: 'Svayam - AI end to end' },
};

/* The manifest. `demo` is the demo hash; `app` is the Expo route. A screen with
   `personas` runs once per persona; without it, once as rajesh. */
const SCREENS = [
  { key: 'today', demo: '#/today', app: '/today', personas: ['rajesh', 'ananya'] },
  { key: 'profile', demo: '#/profile', app: '/profile' },
  { key: 'plan', demo: '#/plan', app: '/plan', personas: ['rajesh', 'ananya'] },
  { key: 'trackers', demo: '#/trackers', app: '/trackers' },
  { key: 'journey', demo: '#/trackers/journey', app: '/trackers/journey' },
  { key: 'coach', demo: '#/coach', app: '/coach', personas: ['rajesh', 'ananya'] },
  { key: 'community', demo: '#/hive', app: '/community' },
];

/* ------------------------------------------------------------------ serving */

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json',
};

/**
 * Serve the demo over http rather than file://. Its service worker, its module
 * scripts and its media fetches all need a real origin; on file:// half of them
 * fail quietly and the capture is of a broken page.
 */
function serveDemo(dir) {
  return new Promise((done) => {
    const server = createServer(async (req, res) => {
      const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
      const file = join(dir, path === '/' ? 'index.html' : path);
      try {
        const body = await readFile(file);
        res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
        res.end(body);
      } catch {
        res.writeHead(404).end('not found');
      }
    });
    server.listen(0, '127.0.0.1', () => done({ server, port: server.address().port }));
  });
}

/* ---------------------------------------------------------------- capturing */

/**
 * Settle: fonts resolved, animations past, one more frame painted.
 *
 * Without this the two sides are photographed at different moments of the same
 * transition, and every screen reports a delta that is not there.
 */
async function settle(page) {
  await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
  await page.waitForTimeout(400);
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
}

/**
 * Navigate, and mean it.
 *
 * When a goto fails - an unreachable Metro, say - Chromium commits its error
 * page ASYNCHRONOUSLY, after the call has already rejected. The next goto then
 * races that commit and is rejected too, with the misleading "interrupted by
 * another navigation". Left alone, one unreachable route cascades into every
 * screen after it reporting a failure it never had. One retry, after the error
 * page has settled, is enough to break the chain.
 */
async function goTo(page, url, options) {
  try {
    return await page.goto(url, options);
  } catch (first) {
    if (!/interrupted by another navigation/.test(String(first.message))) throw first;
    await page.waitForTimeout(250);
    return page.goto(url, options);
  }
}

/** Boot has painted when #app has children. */
const BOOTED = () => {
  const app = document.getElementById('app');
  return !!(app && app.children.length > 0);
};

/**
 * Photograph one demo screen.
 *
 * TWO NAVIGATIONS, NOT ONE, and the order matters. The demo signs a persona in
 * by writing `HV.store.session` and persisting it, but the session alone does not
 * move the router: assigning `location.hash` afterwards leaves the app one
 * hashchange away from the screen we want, and anything that reloads in that gap
 * lands on a URL with no hash at all, which boot then sends to `#/login`. So the
 * session is written on the FIRST load and the hash is carried in the URL of the
 * SECOND — after which the screen is correct no matter how many times the page
 * reloads underneath us.
 *
 * The persona is set through the store rather than by driving the login form.
 * The form is a screen under test in its own right, and typing into it would
 * make every other capture depend on it still working.
 */
async function shootDemo(page, origin, hash, persona) {
  await goTo(page, origin + '/index.html', { waitUntil: 'load' });
  await page.waitForFunction(BOOTED, null, { timeout: 15000 });
  await page.evaluate((user) => {
    window.HV.store.session = user;
    window.HV.save();
  }, PERSONAS[persona].demoUser);

  await goTo(page, origin + '/index.html' + hash, { waitUntil: 'load' });
  await page.waitForFunction(BOOTED, null, { timeout: 15000 });
  await dismissOverlays(page);
  await settle(page);
  return page.screenshot({ animations: 'disabled' });
}

/**
 * Clear whatever the demo raised over the screen.
 *
 * The demo's boot runs five sweeps - SLA, reminders, auto, flow, reports - and
 * they push arrival nudges, request popovers and the daily film over the top of
 * whatever route is showing. Those are real behaviour, but they are not the
 * screen under test: which one fires depends on the clock, so photographing them
 * makes the count depend on the time of day rather than on the port.
 *
 * Each overlay lives in its own root outside #app, so emptying the roots removes
 * them without touching the screen itself. `.req-pop` is the one that attaches
 * straight to <body> and so has to be named.
 */
async function dismissOverlays(page) {
  await page.evaluate(() => {
    ['overlay-root', 'film-root', 'toast-root'].forEach((id) => {
      const root = document.getElementById(id);
      if (root) root.innerHTML = '';
    });
    document.querySelectorAll('.req-pop').forEach((el) => el.remove());
    /* Sheets latch a class on <body> to lock scrolling; the screen sits at the
       wrong offset if it is left behind. */
    document.body.classList.remove('locked', 'no-scroll', 'sheet-open');
  });
}

async function shootApp(page, route) {
  await goTo(page, APP_ORIGIN + route, { waitUntil: 'load', timeout: 60000 });
  await dismissOverlays(page);
  await settle(page);
  return page.screenshot({ animations: 'disabled' });
}

/* ---------------------------------------------------------------- comparing */

function compare(aBuf, bBuf) {
  const a = PNG.sync.read(aBuf);
  const b = PNG.sync.read(bBuf);
  /* Different sizes are not a comparison failure, they ARE the finding. Compare
     the overlapping region and say so, rather than throwing and reporting
     nothing at all. */
  const width = Math.min(a.width, b.width);
  const height = Math.min(a.height, b.height);
  const crop = (src) => {
    if (src.width === width && src.height === height) return src;
    const out = new PNG({ width, height });
    PNG.bitblt(src, out, 0, 0, width, height, 0, 0);
    return out;
  };
  const diff = new PNG({ width, height });
  const delta = pixelmatch(crop(a).data, crop(b).data, diff.data, width, height, {
    threshold: MATCH_TOLERANCE,
    includeAA: false,
  });
  return {
    delta,
    total: width * height,
    diff: PNG.sync.write(diff),
    sizeMismatch:
      a.width !== b.width || a.height !== b.height
        ? 'demo ' + a.width + 'x' + a.height + ' vs app ' + b.width + 'x' + b.height
        : null,
  };
}

/* ------------------------------------------------------------------- report */

const STAMP_START = '<!-- RESULTS:START -->';
const STAMP_END = '<!-- RESULTS:END -->';

async function writeReport(rows, when) {
  const file = join(ROOT, 'docs', 'pixel', 'REPORT.md');
  const table = [
    '_Last run: ' +
      when +
      ' - viewport ' +
      VIEWPORT.width +
      'x' +
      VIEWPORT.height +
      ' @' +
      DPR +
      'x - threshold ' +
      THRESHOLD.toLocaleString() +
      ' px_',
    '',
    '| Screen | Persona | Differing px | % of frame | Note |',
    '|---|---|---:|---:|---|',
    ...rows.map((r) => {
      const pct = r.total ? ((r.delta / r.total) * 100).toFixed(2) + '%' : '-';
      const px = r.delta == null ? '-' : r.delta.toLocaleString();
      return '| ' + r.key + ' | ' + r.persona + ' | ' + px + ' | ' + pct + ' | ' + (r.note || '') + ' |';
    }),
  ].join('\n');

  const body = existsSync(file) ? await readFile(file, 'utf8') : '';
  if (body.includes(STAMP_START) && body.includes(STAMP_END)) {
    const head = body.slice(0, body.indexOf(STAMP_START) + STAMP_START.length);
    const tail = body.slice(body.indexOf(STAMP_END));
    await writeFile(file, head + '\n\n' + table + '\n\n' + tail);
  } else {
    await writeFile(file, body + '\n\n' + STAMP_START + '\n\n' + table + '\n\n' + STAMP_END + '\n');
  }
  return file;
}

async function writeTodo(rows, when) {
  const over = rows.filter((r) => r.delta != null && r.delta > THRESHOLD);
  const missing = rows.filter((r) => r.delta == null);
  const file = join(ROOT, 'docs', 'pixel', 'TODO.md');
  const lines = [
    '# Pixel TODO',
    '',
    'Screens whose measured delta is over the threshold. This is the precision list:',
    'each line is a screen to sit with and close, not a screen that is broken.',
    '',
    '_From the run at ' + when + '._',
    '',
    ...(over.length
      ? over.map(
          (r) =>
            '- [ ] **' +
            r.key +
            '** (' +
            r.persona +
            ') - ' +
            r.delta.toLocaleString() +
            ' px differ' +
            (r.sizeMismatch ? ', ' + r.sizeMismatch : '') +
            '. Diff: `docs/pixel/shots/' +
            r.key +
            '.' +
            r.persona +
            '.diff.png`',
        )
      : ['- Nothing over threshold in the last run.']),
    ...(missing.length
      ? [
          '',
          '## Not captured',
          '',
          'Not a pass and not a delta - the harness could not photograph one side.',
          '',
          ...missing.map((r) => '- **' + r.key + '** (' + r.persona + ') - ' + r.note),
        ]
      : []),
  ];
  await writeFile(file, lines.join('\n') + '\n');
  return { file, count: over.length, missing: missing.length };
}

/* --------------------------------------------------------------------- run */

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const wanted = only.length ? SCREENS.filter((s) => only.includes(s.key)) : SCREENS;
if (!wanted.length) {
  console.error(
    'No screen matched ' + only.join(', ') + '. Known: ' + SCREENS.map((s) => s.key).join(', '),
  );
  process.exit(1);
}

await mkdir(OUT, { recursive: true });
const { server, port } = await serveDemo(join(ROOT, 'demo', 'app'));
const demoOrigin = 'http://127.0.0.1:' + port;

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: DPR,
  /* The client app is dark ALWAYS - app.css:639 puts the client shell in the same
     always-dark group as onboarding, and never consults the system setting. Both
     sides are pinned dark here so a difference can never be the harness's own
     theme choice leaking into the measurement. */
  colorScheme: 'dark',
  reducedMotion: 'reduce',
  /* Block the demo's service worker. It calls skipWaiting() on install, and the
     resulting takeover reloads the tab to the bare document - hash discarded -
     roughly a second after load. That reload lands on `#/login` and photographs
     the login film instead of the screen under test, which is not a difference
     between the demo and the app at all. */
  serviceWorkers: 'block',
});
const page = await context.newPage();

const rows = [];
for (const screen of wanted) {
  for (const persona of screen.personas ?? ['rajesh']) {
    const name = screen.key + '.' + persona;
    let demoShot = null;
    try {
      demoShot = await shootDemo(page, demoOrigin, screen.demo, persona);
      await writeFile(join(OUT, name + '.demo.png'), demoShot);
    } catch (err) {
      const why = String(err.message).split('\n')[0];
      rows.push({ key: screen.key, persona, delta: null, total: 0, note: 'demo did not render: ' + why });
      console.log('  ' + name.padEnd(22) + ' demo failed - ' + why);
      continue;
    }
    try {
      const appShot = await shootApp(page, screen.app);
      await writeFile(join(OUT, name + '.app.png'), appShot);
      const { delta, total, diff, sizeMismatch } = compare(demoShot, appShot);
      await writeFile(join(OUT, name + '.diff.png'), diff);
      rows.push({ key: screen.key, persona, delta, total, note: sizeMismatch || '', sizeMismatch });
      const pct = ((delta / total) * 100).toFixed(2);
      console.log(
        '  ' +
          name.padEnd(22) +
          String(delta).padStart(9) +
          ' px  ' +
          pct.padStart(6) +
          '%  ' +
          (delta > THRESHOLD ? 'TODO' : 'ok') +
          (sizeMismatch ? '  (' + sizeMismatch + ')' : ''),
      );
    } catch (err) {
      const why = String(err.message).split('\n')[0];
      rows.push({ key: screen.key, persona, delta: null, total: 0, note: 'app not captured: ' + why });
      console.log('  ' + name.padEnd(22) + ' app not captured - ' + why);
    }
  }
}

await browser.close();
server.close();

const when = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
const report = await writeReport(rows, when);
const todo = await writeTodo(rows, when);
console.log('\n  report -> ' + report);
console.log('  todo   -> ' + todo.file + '  (' + todo.count + ' over threshold, ' + todo.missing + ' not captured)');
