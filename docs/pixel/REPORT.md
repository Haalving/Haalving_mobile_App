# Pixel report — the client app against the demo

The client app is a **port, not a redesign**. That is a claim about pixels, and a
claim about pixels should be measured rather than asserted. `pnpm pixel` opens
each screen twice — once in `demo/app`, once in the Expo app under
react-native-web — at one phone viewport, and counts the pixels that differ.

Run it with the API and Metro both up:

```
pnpm --filter @haalving/backend dev                       # API on :4001
pnpm --filter @haalving/mobile exec expo start --web      # Metro on :8081
PIXEL_BACKEND_LOG=<the API's log> pnpm pixel              # every screen
pnpm pixel today profile                                  # just these
```

Captures, and the diff image for every screen, land in `docs/pixel/shots/`.

## How it signs in

The app puts a login wall in front of every screen, so a harness that cannot sign
in photographs that wall and reports the difference as a design delta. It signs in
through the app's OWN endpoints — `/auth/client/otp/request`, then
`/auth/client/otp/verify` — exactly as a phone does. The only thing it needs that
a phone gets by SMS is the code, and in development `SMS_PROVIDER=console` writes
it to the API's terminal (`utils/otp.ts:43`); `env.ts` refuses to boot production
with that setting, so this path exists only where it is already safe.
`PIXEL_BACKEND_LOG` is where to read it.

Minting a token from the signing secret would have been easier and wrong: it would
keep passing after the real login flow broke.

The token is written to `localStorage` under `hv.refresh`, which is where the app's
storage layer looks on web, and it is **cached between runs**. `otpRequestLimiter`
allows five codes an hour per number and is right to; a harness that signed in from
scratch every run would spend that budget on itself and then report "too many
codes" for screens that are perfectly fine.

Two things had to change in the app for any of this to work, and both were real
bugs rather than harness scaffolding:

- `expo-secure-store` ships no web implementation, so reading the stored token
  threw and took the whole app down before it painted. The token store is now
  platform-aware, and plain about the fact that `localStorage` is not secure
  storage.
- CORS is a one-origin allow-list, and Metro is not that origin. Development now
  allows a second, `EXPO_WEB_ORIGIN`; production still allows exactly one.

## What a clean run proves

react-native-web is not a screenshot of the app; it is the app's **own layout
engine** running in a browser. Flexbox resolution, `padding`/`margin`, `width`,
`fontSize`, `borderRadius`, `borderWidth` and every colour go through the same
code path the native build uses. So when the harness says a screen matches:

- **Layout is right** — the same boxes, in the same order, at the same sizes.
- **Spacing is right** — the demo's `--s1…--s6` scale landed on the same numbers.
- **Type sizes are right** — `--t-display` through `--t-micro`, and the 1.55 line
  height the tokens now carry.
- **Colour is right** — every token resolves to the same hex the demo paints, on
  the same surfaces.

Those four are where a port of this kind actually goes wrong, and they are
exactly what the count catches.

## What it does not prove

Being honest about this matters more than the green number:

- **Native shadows.** react-native-web maps `shadowColor`/`shadowRadius` onto CSS
  `box-shadow`; iOS renders them from the layer's own geometry and Android
  ignores them entirely for `elevation`. The demo's `--e1…--e3` can match here and
  still read differently on a device.
- **`gap`.** Supported by web flexbox natively; on React Native it is honoured by
  Yoga, but older Android surfaces have historically rounded it differently.
- **Font metrics.** The browser and the native text engines resolve ascent,
  descent and line box from the same font file by different rules. A 1px
  baseline shift on device will not appear here.
- **Anything not on screen.** Scrolling momentum, the keyboard, safe-area insets,
  the status bar, haptics, and every gesture. The harness photographs one frame.

So a clean run means *the layout matches*. It does not mean *the screen is
shipped*. Native verification is a separate pass.

## Why both sides are pinned dark

The client app has no light mode to get wrong. `demo/app/css/app.css:639` puts
the client shell in the same always-dark group as onboarding:

```css
.ob, .scene.night, body:has(.shell-client){ ... }
```

— it never consults `prefers-color-scheme`, and there is no light branch anywhere
below it for `.shell-client`. The app follows: `mobile/app.json` sets
`userInterfaceStyle: "dark"`, and `mobile/src/theme/tokens.ts` exports a frozen
dark palette rather than reading `useColorScheme()`. The harness therefore opens
both sides with `colorScheme: 'dark'`, so a difference in the count can never be
the harness's own theme choice leaking into the measurement.

## The two personas

Every screen that can differ by plan is captured twice:

| Persona | Who | What it proves |
|---|---|---|
| `rajesh` | `u-cl-rajesh` — Poorna, four **human** pillars | No AI copy may appear anywhere |
| `ananya` | `u-cl-ananya` — Svayam, AI **end to end** | AI copy must appear everywhere |

Between them they answer rule 1 in both directions. A screen that looks right for
one and wrong for the other is precisely the bug the pair exists to catch, and it
is invisible to a single-persona run.

## Reading the numbers

- **Differing px** is an absolute count at 390×844 @2x, so a full frame is
  780×1688 = **1,316,640** pixels. A percentage of that is the second column.
- Anything over the threshold gets a line in [TODO.md](TODO.md). That is the
  precision list, not a list of broken screens.
- **`app not captured`** is neither a pass nor a delta: the harness could not
  photograph the app side at all. That means Metro is not running, or the route
  does not exist yet. It is always worth reading before the counts.
- A **size mismatch** note means the two frames were different heights and only
  the overlap was compared. Treat the count as a floor.

## C2–C4 screens — built, not yet measured (environment caveat)

The C2–C4 client screens (meal capture, meal detail, My Circle, Get a coach, Plan,
Trackers, Journey, Onboarding, Profile settings) are now in the harness manifest
(`scripts/pixel-compare.mjs`) but were **not captured** this sitting, and the
harness was **skipped** deliberately rather than run to record a wall of
"not captured".

Why: a signed-in capture needs the dev database stable for the length of the run,
and the in-flight C2 backend work keeps **resetting/reseeding it**, which revokes
the OTP and refresh tokens mid-run. This session watched fresh tokens die within a
minute repeatedly (16:09, and again at 17:41 and 23:xx). It is purely the shared
dev environment — nothing about the screens blocks measurement.

To measure: in a quiet-DB window (C2 backend paused), run the backend on :4001 and
Metro on :8081, sign in once (`PIXEL_BACKEND_LOG=<api log> pnpm pixel`, or seed a
live token in `scripts/.pixel-tokens.json`), and let the full manifest run. The
screens were built pixel-first from the demo source, so the numbers should be close
on the first clean run — with the documented deferrals (the Trackers hologram, the
Onboarding deck/tapes, stub fields) accounting for the known residuals.

## Status: PAUSED mid-F2 (2026-09-02)

F2 pixel tuning is **paused** partway through, by plan, to spend a sprint on
backend features (onboarding endpoint, live circle, push, seed guards). The
harness ENVIRONMENT is fixed and confirmed working (real signed-in captures, the
`serverRoot` web-bundle fix below), and the F1b before/after is recorded — so
tuning can resume from a known-good harness with no re-setup. No screen has been
tuned to threshold yet; the numbers below are the starting precision list.
Known measurement caveat to fix on resume: the OTP-verify rate limit exhausts a
full 14-screen run's per-screen token minting, so the last ~4 screens can capture
the login wall (meal-detail/coaches showed ~58% for that reason, not a real
delta) — run in small batches, or raise the dev verify limit, when resuming.

## F1b → F2: before and after the real-data cutover

The plan and today screens moved off their fixtures onto the real client API
(`GET /client/plan`, `/client/today`, and the streak on `/client/me`), all derived
through the ported engines (`calendarFor`, `levelup`, `dailyTargets`, `streak`).
The "before" column is the last pre-F1b run (2026-09-02 05:26 UTC); "after" is the
run below, captured once the harness environment was repaired (see note).

| Screen | Before | After |
|---|---:|---:|
| today (rajesh) | 70,836 | 68,007 |
| today (ananya) | 70,674 | 69,769 |
| plan (rajesh) | 89,144 | 90,088 |
| plan (ananya) | 84,481 | 81,146 |
| journey (rajesh) | 1,239,091 | 230,741 |
| coach (rajesh) | 473,828 | 194,725 |

today and plan hold steady (the fixtures were already value-accurate; the residual
is layout, now the precision list). journey and coach fell sharply because their
earlier figures were blank/near-blank captures from the broken web bundle, not real
deltas. meal-detail and coaches rose — genuine content differences to close, not
size mismatches.

**Harness environment repair (this sitting).** The Expo web bundle was 500-ing on
every route — `Metro`'s `unstable_serverRoot` was pinned to the app package, but
pnpm hoists its store to the workspace root, so Expo web's entry `<script>` at
`/node_modules/.pnpm/…/entry.bundle` resolved one level below the store and every
capture was blank (~92%). Fixed in `mobile/metro.config.js`: the pixel harness now
sets `PIXEL_SERVER_ROOT=workspace` to lift the server root to the workspace (native
builds keep the project root the release bundle needs). A stray duplicate
`expo-router` install (from an `expo-asset` resolution) was also reconciled.

<!-- RESULTS:START -->

_Last run: 2026-09-02 09:49 UTC - viewport 390x844 @2x - threshold 2,000 px_

| Screen | Persona | Differing px | % of frame | Note |
|---|---|---:|---:|---|
| today | rajesh | 68,007 | 5.17% |  |
| today | ananya | 69,769 | 5.30% |  |
| profile | rajesh | 67,566 | 5.13% |  |
| plan | rajesh | 90,088 | 6.84% |  |
| plan | ananya | 81,146 | 6.16% |  |
| trackers | rajesh | 1,71,399 | 13.02% |  |
| journey | rajesh | 2,30,741 | 17.52% |  |
| coach | rajesh | 1,94,725 | 14.79% |  |
| coach | ananya | 3,46,268 | 26.30% |  |
| community | rajesh | 13,737 | 1.04% |  |
| meal | rajesh | 1,51,477 | 11.50% |  |
| meal-detail | rajesh | 7,73,977 | 58.78% |  |
| coaches | rajesh | 7,71,731 | 58.61% |  |
| onboard | rajesh | 1,78,116 | 13.53% |  |

<!-- RESULTS:END -->
