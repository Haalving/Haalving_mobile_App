# Nutrient Panel — design (2026-08-03)

TJ's ask: a hovering button on Today with a hover animation; tapping opens a
bottom sheet (like a pillar-task sheet) showing a wireframe human, the day's
calories, and macro + essential micronutrients, each graded deficient /
sufficient / surplus. Reference: a dark body-scan onboarding screen (Fittr-like);
we translate it into HAALVING's Instrument language.

## Name

**Nutrient Panel** — the sibling of the Vital Panel. The Vital Panel reads what
the lab says about your body; the Nutrient Panel reads what your plates put
into it. Same tri-state grammar (low / in range / high → deficient /
sufficient / surplus), same row instrument.

## Entry: the floating button (Today only)

- `.fab`, fixed above the tab bar at the right edge of the 520px shell,
  56px circle on `--brand-fill` (a ground that carries white), elevation 3.
- Mark: new hairline `body` icon (standing figure) in the 45-mark set.
- "Hover animation" = a gentle levitation loop (±3px translateY, ~3.4s) with a
  breathing shadow; scale-up on pointer hover, scale-down on press. The loop is
  gated behind `prefers-reduced-motion: no-preference`.
- Opens the panel for the day currently on screen (`#/today/N` respects N).

## The sheet

`HV.sheet(html, mount, 'tall')` — the same 95dvh bottom sheet as a pillar task,
reusing the `.tsheet` skeleton: hero → title/sub → scroll → footer nav. The
task sheet's ‹ n/N › pager walks *steps*; the Nutrient Panel's pager walks
*days of the cycle* — one grammar, two instruments.

1. **Hero** (`.nphero`): deep-night ground in both themes. A hairline wireframe
   figure (SVG: silhouette strokes + horizontal contour ellipses + dashed
   calibration circles — the dial's tick language) with a soft sternum glow.
   Two glass chips float on it: the day's kcal reading, and the most notable
   nutrient state (worst deficiency, or "all sufficient").
2. **Headline**: the signature dial — kcal as % of the plan's target, serif
   value, `culture` colour (this is a Nutrition instrument; the pillar colour
   is doing signal work, not decoration).
3. **Macronutrients**: Protein, Carbohydrate, Fat, Fibre rows — serif
   "62 of 90 g", a band-and-dot bar (track = 0–150% of target, band = the
   sufficient zone 85–115%), status pill.
4. **Essential micronutrients**: two groups, Vitamins (A, B12, C, D, Folate)
   and Minerals (Iron, Calcium, Magnesium, Zinc, Potassium, Sodium), same row
   instrument.
5. **Provenance** (`.audit`): estimated from logged plates + the plan; the
   dietitian reads the panel — the coach's judgement sits above the AI's
   arithmetic.

## Grading

pct = intake / target. `< 85%` deficient (`--danger`), `85–115%` sufficient
(`--ok`), `> 115%` surplus (`--amber`). The word is always printed beside the
colour — colour is never the only carrier.

## Day semantics (same philosophy as Today)

- **Past day**: the day as eaten — full reading, graded.
- **Today**: "so far" — kcal and protein summed from the meal queue (the record
  of truth); the rest scaled by the eaten-kcal fraction. The sub says it fills
  as plates land.
- **Future day**: what the plan provides — targets met on paper, except what a
  plate cannot carry (vitamin D), which stays honest.

## Data

- New reference catalogue `nutrition` in the seed (content, not state — added
  to the boot refill list, no seedVersion bump): micro definitions with unit,
  an ICMR-flavoured adult target, and a `bias` — the fraction of target this
  demo diet typically delivers, so the story is coherent (D low, B12 low, iron
  low-ish, sodium over) rather than random.
- Macro targets derive from the meal plan: protein is the plan's own number;
  carbs 50% and fat 27% of kcal; fibre 14 g / 1000 kcal.
- Per-day variation is a deterministic hash of (client, day, nutrient) — the
  same day always reads the same, with no Date.now in the story.
- No plan (observation window): the panel opens with a gentle calibrating
  state instead of numbers.

## Ship

v121: bump every `?v=` in index.html + the sw.js CACHE name. No seedVersion
bump (catalogue only). Verify in headless browser; adversarial review
workflow after.

## Revision — the hologram stage (same day, TJ's reference image)

TJ's intent was the body-scan hologram itself, not a decorative hero: the
figure IS the instrument. v123 rebuilds the sheet's top as `.npstage`:

- The silhouette is one closed symmetric SVG path (left half authored,
  mirrored programmatically), meshed with horizontal scan lines.
- **Calories fill the body from the feet up** — a gradient rect clipped to
  the silhouette, with a bright liquid-surface line at the level.
- **Slow rotation**: CSS `rotateY` 360° / 16s on a perspective container.
  The figure is symmetric, so the mirrored back half reads as the body
  continuing to turn; two stroke-only ghost copies fanned at ±20° keep
  volume when the turn passes edge-on.
- The pad is dashed ellipses whose dashes circulate via `stroke-dashoffset`
  (every dash period divides the 640 offset, so loops restart seamlessly);
  a blurred conic gradient casts the cone of rays from above.
- **Micros read down the left of the stage, macros + the kcal headline down
  the right** (aria-hidden duplicates — the graded rows below carry the
  accessible reading). The dial section was dropped; the body-fill replaced it.

Review round (18-agent adversarial workflow) fixed: past-day kcal is now the
energy-weighted mean of its own drifted macros (headline can never contradict
the rows); FAB carries a base shadow independent of its keyframes; FAB pins
with `%` not `vw` (scrollbar drift); serif on every "Day N"; dialog named
via aria-label; pager buttons announce the shown day; graded rows are plain
text rows, not role="img".

## Revision 2 — stage only, true 3D body (same evening, v125)

TJ: "Remove the nutrient panel. I just want the top panel. Also make the
human a 3D human."

- The sheet is now the stage alone: hologram + flanking readouts + the day
  pager. Title block, graded lists and audit line removed (with their CSS).
  The HUD columns became the accessible reading — each carries its state
  word in a visually-hidden span, so colour is never the only carrier.
- The body is rebuilt as real CSS-3D geometry (`npBody3d`): 41 horizontal
  cross-section rings (`rotateX(90°)` discs) stacked down the silhouette's
  own profile, with the arm and leg stacks off the spine so they orbit it
  as the body turns — genuine parallax — plus three silhouette planes
  crossed at 60°. The camera sits above (`perspective-origin: 50% -40%`),
  opening every ring into the reference's scan-slice ellipse; at eye level
  the rings would project to invisible lines, so the raised origin is
  load-bearing.
- Calories still fill the body: rings below the level are lit, the ring at
  the surface burns brightest, rings above stay hollow hairlines. At 90°
  edge-on the figure remains fully present — the failure mode of the flat
  v123 build is gone.

## Revision 3 — an actual 3D wireframe, and the button wears it (v129)

TJ: "Can you create an actual 3D rotating wireframe… The same icon make me
placed in the hover button."

- The CSS-3D ring construction is replaced by a hand-written canvas 3D
  engine (still zero dependencies): `NP_MESH` lofts five tubes — a
  head-and-torso lathe on the spine, two arms, two legs — from the
  silhouette's own half-widths into a real vertex/edge mesh (~1,200 edges).
  Each frame `npDrawWire` rotates the vertices around the spine, tilts them
  to a camera slightly above, projects with plain perspective and strokes
  the wire. Side views are true side views: the arms swing behind the
  torso, the legs eclipse each other.
- The calorie fill became the **waterline**: edges fully below the level
  draw lit, edges above draw faint, and the edges the level cuts through
  draw brightest — the surface emerges from the mesh itself.
- The rotation loop keys its life to the canvas: any re-render detaches the
  canvas and the loop dies on its next frame. Reduced motion is checked in
  JS (the global CSS rule cannot reach canvas) and renders one still frame.
- The floating button now carries the same mesh as a live 30×42 miniature,
  turning slower and filled to today's calories — the button is the panel
  in miniature, literally.

## Revision 4 — the reference image itself, final form (v134)

TJ: "Don't need 3D… just put a image. Implement the image in the picture
as it is. Also, when it comes to micronutrients add 'out of' so that what
is the required daily limit."

- The body is now a generated image (GPT Image 2 through the project's
  Higgsfield pipeline): full-body glowing wireframe figure, sternum star,
  calibration circles, rays — 33 KB webp at `img/np/body.webp`, registered
  in the service worker's asset list. The canvas engine is removed.
- The calorie fill survives the medium change: a brightness-boosted copy of
  the same image sits on top, revealed by a soft vertical gradient mask
  that rises with the day's kcal (a hard clip drew a seam across the
  image's ambient glow — a fade reads as light rising through the body),
  plus a crisp waterline bar spanning just the torso.
- Every micronutrient now prints its daily requirement — "532 of 840 µg" —
  as a two-line HUD row (name above, reading beneath); macros keep the
  compact x/y form.
- The floating button became a night puck (radial navy ground) wearing the
  same image in miniature with a cyan ping — the brand-green disc clashed
  with the image's own near-black ground.
