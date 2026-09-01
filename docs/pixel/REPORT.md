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

<!-- RESULTS:START -->

_Last run: 2026-09-01 12:27 UTC - viewport 390x844 @2x - threshold 2,000 px_

| Screen | Persona | Differing px | % of frame | Note |
|---|---|---:|---:|---|
| today | rajesh | - | - | app not captured: not signed in - the app would show its login wall |
| today | ananya | 1,51,241 | 11.49% |  |
| profile | rajesh | - | - | app not captured: not signed in - the app would show its login wall |

<!-- RESULTS:END -->
