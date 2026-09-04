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
  rajesh: { demoUser: 'u-cl-rajesh', phone: '+919847022110', label: 'Poorna - human pillars' },
  ananya: { demoUser: 'u-cl-ananya', phone: '+919400126834', label: 'Svayam - AI end to end' },
};

const API_URL = process.env.PIXEL_API_URL ?? 'http://localhost:4001/api/v1';

/**
 * The dev server's log, where the harness reads the one-time code.
 *
 * NOT A BACK DOOR. The harness signs in through the app's OWN endpoints -
 * `/auth/client/otp/request` then `/auth/client/otp/verify` - exactly as the phone
 * does. The only thing it needs that a phone gets by SMS is the code, and in
 * development `SMS_PROVIDER=console` writes it to the terminal (utils/otp.ts:43).
 * `env.ts` refuses to boot production with that setting for the obvious reason, so
 * this path exists only where it is already safe.
 *
 * The alternative was minting a token from the signing secret, which would have
 * been a bypass: it would keep passing after the real login flow broke.
 */
const BACKEND_LOG = process.env.PIXEL_BACKEND_LOG ?? '';

/** The token the app's own storage layer looks for (`api/client.ts`). */
const REFRESH_KEY = 'hv.refresh';

/* The manifest. `demo` is the demo hash; `app` is the Expo route. A screen with
   `personas` runs once per persona; without it, once as rajesh. */
const SCREENS = [
  { key: 'today', demo: '#/today', app: '/today', personas: ['rajesh', 'ananya'] },
  { key: 'profile', demo: '#/profile', app: '/profile' },
  { key: 'plan', demo: '#/plan', app: '/plan', personas: ['rajesh', 'ananya'] },
  { key: 'trackers', demo: '#/trackers', app: '/trackers' },
  /* journey lives inside the trackers tab in the demo; in the app it is a hidden
     (tabs) route at /journey (reached from the Trackers segmented control). */
  { key: 'journey', demo: '#/trackers/journey', app: '/journey' },
  { key: 'coach', demo: '#/coach', app: '/coach', personas: ['rajesh', 'ananya'] },
  { key: 'community', demo: '#/hive', app: '/community' },
  { key: 'meal', demo: '#/meal', app: '/meal' },
  { key: 'meal-detail', demo: '#/meal-detail/m-raj-bf', app: '/meal-detail/m-raj-bf' },
  { key: 'coaches', demo: '#/coaches/fitness', app: '/coaches/fitness' },
  { key: 'onboard', demo: '#/onboard', app: '/onboard' },
];

/** The first line of an error, which is the part worth printing. */
const firstLine = (err) => String(err && err.message ? err.message : err).split(/\r?\n/)[0];

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

/**
 * Photograph one app screen, signed in.
 *
 * The token is written to `localStorage` under the key the app's storage layer
 * reads (`api/client.ts`), which on web is where the keychain falls back to. It
 * has to be in place BEFORE the bundle runs - the root layout reads it in its
 * first effect - so it is seeded on `about:blank`, on the app's own origin,
 * rather than after the navigation that would already have missed it.
 */
async function shootApp(page, route, refreshToken) {
  if (refreshToken) {
    await goTo(page, APP_ORIGIN + '/');
    await page.evaluate(
      ([key, token]) => {
        window.localStorage.setItem(key, token);
      },
      [REFRESH_KEY, refreshToken],
    );
  }
  await goTo(page, APP_ORIGIN + route, { waitUntil: 'load', timeout: 60000 });
  /* the session is recovered in an effect and every screen then fetches; a plain
     load event lands well before any of that has resolved */
  await page.waitForTimeout(2500);
  await dismissOverlays(page);
  await settle(page);
  return page.screenshot({ animations: 'disabled' });
}

/* ---------------------------------------------------------------- signing in */

const post = async (path, body) => {
  const res = await fetch(API_URL + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Client': 'mobile' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.ok) {
    const err = new Error(json?.error?.message ?? `${path} answered ${res.status}`);
    /* the status rides along so a caller can tell "no such route" from "the route
       said no" — dev-code's two callers need exactly that distinction */
    err.status = res.status;
    throw err;
  }
  return json.data;
};

/**
 * WHY THE HARNESS NAMES THIS ITSELF. `env.ts` registers dev-code only where it
 * judges the API a development box — no hosting-platform variable and a localhost
 * DATABASE_URL (the host Prisma uses, so a `?host=` parameter counts). Against
 * a hosted database, or under `railway run`, the route answers 404 and the run
 * would otherwise fall back, silently, to one cached token per persona — which
 * the app's boot rotation spends after the first capture, so every later screen
 * photographs the login wall and reports it as a design delta. Said once per
 * run, not once per screen.
 */
let devCodeOffSaid = false;
function explainDevCodeOff(err) {
  if (err?.status !== 404 || devCodeOffSaid) return;
  devCodeOffSaid = true;
  console.log(
    '  dev-code is off (404): the API judged itself deployed (hosted DATABASE_URL or a' +
      ' platform variable set). Run the harness against a LOCAL API; on a dev box that' +
      ' merely uses a hosted database, set HV_DEV_ROUTES=allow in backend/.env (see the' +
      ' API boot warning). A deployed API never serves dev-code.',
  );
}

/**
 * Sign a persona in and hand back their refresh token.
 *
 * Two calls, both the app's own. The code comes out of the dev log because that
 * is where development delivery puts it; without a log path the harness says so
 * plainly rather than photographing the login wall and calling the difference a
 * design delta.
 */
/**
 * Where a persona's refresh token is kept between runs.
 *
 * WHY CACHE AT ALL. `otpRequestLimiter` caps how often a number may ask for a
 * code, and it is right to. A harness that signs in from scratch on every run
 * spends that budget on itself, and the run after a few quick iterations reports
 * "too many codes" for screens that are perfectly fine. Reusing a live token asks
 * for a code only when there isn't one.
 *
 * Gitignored, and only ever holds development tokens for seeded demo accounts.
 */
const TOKEN_CACHE = join(ROOT, 'scripts', '.pixel-tokens.json');

async function readCache() {
  try {
    return JSON.parse(await readFile(TOKEN_CACHE, 'utf8'));
  } catch {
    return {};
  }
}

/** Is this token still good? `/auth/refresh` is the only honest way to ask. */
async function stillValid(token) {
  try {
    const data = await post('/auth/refresh', { refreshToken: token });
    /* refresh MAY rotate; hand back whatever is live now rather than the old one */
    return data?.refreshToken ?? token;
  } catch {
    return null;
  }
}

async function signIn(persona) {
  const { phone } = PERSONAS[persona];

  const cache = await readCache();
  if (cache[persona]) {
    const live = await stillValid(cache[persona]);
    if (live) {
      if (live !== cache[persona]) {
        cache[persona] = live;
        await writeFile(TOKEN_CACHE, JSON.stringify(cache, null, 2));
      }
      return live;
    }
  }

  /* THE CODE, STRAIGHT FROM THE DEV ENDPOINT. `/auth/client/otp/dev-code` mints
     through the app's real path and hands the code back — no SMS, no log to
     scrape, and nothing to lose when a parallel session resets the database
     mid-run. The route exists only where `env.ts`'s devRoutesAllowed is true — a
     development box by the API's own reckoning, or HV_DEV_ROUTES=allow — and
     answers 404 anywhere else, which explainDevCodeOff names. Falls back to
     scraping the dev log for an API that has no such endpoint. */
  let code = null;
  try {
    const dev = await post('/auth/client/otp/dev-code', { phone });
    code = dev?.code ?? null;
  } catch (err) {
    /* endpoint absent (older API) or switched off — say which, then fall through
       to the log */
    explainDevCodeOff(err);
  }

  if (!code) {
    if (!BACKEND_LOG) {
      throw new Error(
        'sign-in needs the dev OTP endpoint (/auth/client/otp/dev-code, see HV_DEV_ROUTES) or PIXEL_BACKEND_LOG',
      );
    }
    const before = existsSync(BACKEND_LOG) ? (await readFile(BACKEND_LOG, 'utf8')).length : 0;
    await post('/auth/client/otp/request', { phone });
    /* the log is written by another process; give it a moment, then read only what
       was appended, so a code from an earlier run can never be picked up */
    for (let i = 0; i < 20 && !code; i++) {
      await new Promise((r) => setTimeout(r, 150));
      const tail = (await readFile(BACKEND_LOG, 'utf8')).slice(before);
      const found = [...tail.matchAll(/OTP for [^:]*:\s*(\d{6})/g)].pop();
      if (found) code = found[1];
    }
  }
  if (!code) throw new Error('no one-time code from the dev endpoint or the API log');

  const data = await post('/auth/client/otp/verify', { phone, code });
  if (!data?.refreshToken) throw new Error('sign-in returned no refresh token');

  const fresh = await readCache();
  fresh[persona] = data.refreshToken;
  await writeFile(TOKEN_CACHE, JSON.stringify(fresh, null, 2));
  return data.refreshToken;
}

/**
 * A FRESH refresh token straight from the dev endpoint, or null if it is absent.
 *
 * WHY PER SCREEN. The app rotates the refresh token on boot — its first effect
 * calls `/auth/refresh`, which revokes what it was given and returns a successor.
 * A token reused across screens is therefore already spent by the second capture,
 * and every screen after the first photographs the login wall. The dev endpoint
 * has no rate limiter, so minting one code per screen is free; this is exactly the
 * budget the cache existed to protect, and it no longer needs protecting.
 */
async function devToken(persona) {
  const { phone } = PERSONAS[persona];
  try {
    const dev = await post('/auth/client/otp/dev-code', { phone });
    if (!dev?.code) return null;
    const data = await post('/auth/client/otp/verify', { phone, code: dev.code });
    return data?.refreshToken ?? null;
  } catch (err) {
    explainDevCodeOff(err);
    return null;
  }
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

/* TODO.md is regenerated every run, so the auto-measured list lives between these
   markers and everything OUTSIDE them is preserved. That is what lets a "Needs API
   field" section — a card drawn at its real box today whose value the client API
   does not serve yet — survive a re-run instead of being wiped by the next one. */
const TODO_START = '<!-- PIXEL:AUTO:START -->';
const TODO_END = '<!-- PIXEL:AUTO:END -->';

async function writeTodo(rows, when) {
  const over = rows.filter((r) => r.delta != null && r.delta > THRESHOLD);
  const missing = rows.filter((r) => r.delta == null);
  const file = join(ROOT, 'docs', 'pixel', 'TODO.md');

  const auto = [
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
  ].join('\n');

  const HEAD =
    '# Pixel TODO\n\n' +
    'Screens whose measured delta is over the threshold. This is the precision list:\n' +
    'each line is a screen to sit with and close, not a screen that is broken.\n\n';

  /* the template only lands on first creation; once authored, the section below
     the END marker is preserved verbatim across every run */
  const MANUAL_DEFAULT =
    '\n\n## Needs API field\n\n' +
    "Cards the client app draws at the demo's real boxes today, with the value\n" +
    'stubbed because the client API does not serve the fact yet. Each lights up the\n' +
    'moment its field arrives — no mobile change needed.\n\n' +
    '<!-- add fields here; this section is preserved across harness runs -->\n';

  const wrapped = TODO_START + '\n\n' + auto + '\n\n' + TODO_END;
  const body = existsSync(file) ? await readFile(file, 'utf8') : '';
  let next;
  if (body.includes(TODO_START) && body.includes(TODO_END)) {
    const head = body.slice(0, body.indexOf(TODO_START));
    const tail = body.slice(body.indexOf(TODO_END) + TODO_END.length);
    next = head + wrapped + tail;
  } else {
    next = HEAD + wrapped + MANUAL_DEFAULT;
  }
  await writeFile(file, next + (next.endsWith('\n') ? '' : '\n'));
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

/* One sign-in per persona as the FALLBACK token — used only when the dev endpoint
   is absent (an older API, or switched off by env.ts's deploy guard — see
   explainDevCodeOff), where the OTP rate limiter makes a fresh code per screen
   trip the limiter part way through a run. When the dev endpoint is present
   (the normal dev case) each screen mints its own fresh token below, because the
   app rotates the refresh token on boot and a reused one is spent by the second
   capture. */
const tokens = new Map();
for (const persona of new Set(wanted.flatMap((s) => s.personas ?? ['rajesh']))) {
  try {
    tokens.set(persona, await signIn(persona));
    console.log('  signed in as ' + persona);
  } catch (err) {
    tokens.set(persona, null);
      console.log('  could NOT sign in as ' + persona + ' - ' + firstLine(err));
  }
}

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
      /* a FRESH token per screen (the app rotates on boot; see devToken), falling
         back to the per-persona token when the dev endpoint is absent */
      const token = (await devToken(persona)) ?? tokens.get(persona);
      if (!token) throw new Error('not signed in - the app would show its login wall');
      const appShot = await shootApp(page, screen.app, token);
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
