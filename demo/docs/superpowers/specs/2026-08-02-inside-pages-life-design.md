# Inside-Pages Life — Design Spec

**Date:** 2026-08-02 · **Status:** approved in conversation (TJ), spec for review
**Decisions locked:** scope = client pages AND console at full depth · engine = scene + instruments + voice (promotion over invention) · new assets = yes, budgeted and lazy-loaded

## 1. Problem

The login and onboarding screens are one continuous cinematic idea — the Kerala arrival film stays behind every step, chapters announce themselves with a teal kicker, every question is a display-size human sentence, readings arrive on instruments, the finish celebrates. The inside pages don't lack polish; they lack **access to those same materials**. The scene system (photograph + twin-gradient scrim + night tokens + kicker + display heading + glass buttons) exists only as one-off CSS scoped to `.login-hero`, `.ob`, and `.obslide` — written three separate times (`app/css/app.css` ~231–236, ~1353–1378, ~2017–2020). No inside page can wear them.

The 2026-07-29 audit (`.impeccable/critique/2026-07-29T02-10-06Z__app.md`) reached the same verdict — "authored core, generic admin edges" — and set the constraint this spec obeys: the next gain comes from **finishing the authored world**, not adding more polish. It also flagged that imagery/voice rules live only in the archived Handoff (`Archives/HAALVING-Design-Handoff.md` 167–187) while Design System v2 (`Archives/HAALVING-Design-System-v2.md`) has no imagery or voice section at all — two competing authorities.

## 2. Evidence (what the readers found)

**Life devices, all currently lobby-locked or one-off:**
- Scene: full-bleed film + poster fallback + reduced-motion still (`core.js` ~298–368), twin-gradient scrim, fixed film still behind onboarding, night-scheme tokens welded to `.ob`.
- Voice: kicker chapter labels, question-as-screen display headings (`app.css` ~1396–1420), human sentences throughout onboarding, adaptive CTA copy.
- Instruments with motion: dial/ring arc sweep (`app.css` ~560–562, 613–614), deck peel physics, measuring tape with haptic click, staggered page rise (`app.css` ~214–221).
- Celebration: `HV.celebrate` — wired on Trackers water goal, Journey preview, coach assessment finish; absent everywhere else.

**Flat spots, ranked (client):**
1. **Meal flow** (`client-meal.js`) — a food-photography flow with zero food imagery: `.mealph` bowl-icon placeholders at every step (~61, 122, 135, 161, 308, 322); the star reveal (~291–303) renders statically with no celebrate; pending states are text walls (~304–327).
2. **Today drawers** (`client-today.js` ~139–262) — text task rows; "Today's read" is two bare paragraphs (~300–311, 349–359); generic one-line empties (~237–240); no celebrate on day completion.
3. **Plan sub-routes** (`client-plan.js`) — plan-detail is text throughout (~736–995); plan-full repeats eleven near-identical rows (~693–709); dailyTab is four icon trows (~541–554).
4. **Profile lower half** (`client-profile.js` ~316–410) — settings wall, text-only Records Vault.
5. **Journey edges** (`client-journey.js`) — care team as plain trows (~100–109), level review one trow (~162–169), observation variant leans on notices (~194–199).
6. **Coach** — meal messages attach a bowl icon not the photo (~129–137); generic empty state.

**Flat spots (console):** digest stat trio is bare numbers (~218–222) and its queues are avatar+text rows; approvals has no instrument, no pillar colour, a text-chip stepper duplicated with builder's (`console-approvals.js` ~26–40, `console-builder.js` ~40–56); circles list and open-circle header carry no client-state visuals (~279–301, ~492–503); meals renders a bowl icon where the rated photo should be (~100, 192) and never renders the 4-part rubric it stores (~59–64); builder's goalsheet sign-off is chips (~62–76) one screen above a proper gate-grid (~294–319).

**Missing motion on existing instruments:** Index radar shape snaps (`.ishape`/`.ighost`, `app.css` ~1096–1131); Vital Panel marker dot jumps (~1686–1688); gate ribbon appears without entrance (~597–599); `.score-hero` numeral has no count-up (~669–690); level-map cells don't transition (~1069–1084); chat bubbles have no entrance (~806–812).

**Ready-made reusables:** pmark plate-in-status-ring (`client-plan.js` ~228–233); ghost-overlay Index comparison (~407–412); Trackers 3-week bar strips (`client-trackers.js` ~17–34); markerBar band+dot (`client-profile.js` ~44–57); media message kinds; `sessionRings`/`levelBadges`/`headerIndex` (`console-clients.js` ~41–55, ~176–205); the `.mealph` class as the image seam; matte-clay plate families (pillars, vitals, 16+ task images); the proven ffmpeg-zoompan animated-webp technique (`docs/superpowers/specs/2026-07-30-assessment-chat-design.md` ~60–62).

## 3. Goals / non-goals

**Goals:** every page carries one authored "page moment" in the lobby's materials; the flattest surfaces (Meal, Today drawers, Plan sub-routes, console digest/approvals/meals) reach the standard the Journey/Trackers pages already set; instruments move; empty states speak; one design authority.

**Non-goals:** no new video; no redesign of pages that already work (Journey, Trackers, Plan hub calendar, Vital Panel); no layout restructuring of the console shells; no dark-mode redesign (existing counterpart rules apply to new work); no desktop phone-island fix (separate audit item).

## 4. The rules this spec inherits (binding)

1. **One moment per page.** A page gets one kicker + one display sentence + its instruments. Two scenes on one page is a defect.
2. **Colour law.** A pillar's colour appears only in that pillar's own dial/dot/ribbon/series. Food photography and scenes are neutral-warm, never pillar-tinted.
3. **Celebrations are earned and singular** (Handoff): star reveal, day complete, level up. Nothing else. Diya-glow register, not confetti.
4. **Voice** (Handoff): quiet by default; banned words (fail, streak, crush, etc.); every empty state is a sentence a human would say.
5. **Motion** (DS v2): only the existing tokens (`--ease`, `--ease-spring`, `--d-fast/base/slow`); everything dies under `prefers-reduced-motion`.
6. **Weight:** new assets lazy-load (`loading="lazy"`, not in the SW precache list); total new imagery ≤ ~400KB; motion loops are animated-webp, never video.
7. **Serif for data**; no emoji; hairline icons only.

## 5. Design

### Phase A — the materials kit (shared, no visible change on its own)

**A1 · Scene classes** (`app.css`): promote the three scoped copies into one family —
- `.scene` — a positioned ground that takes a photograph (`--scene-img`) with the twin-gradient scrim (ink top and bottom, glass middle).
- `.scene.night` — the onboarding dark-token override, detached from `.ob` (which then consumes it).
- `.kicker` — the tracked teal uppercase chapter label, usable on any surface.
- `.display` — the question-as-screen heading style (display size, tight measure, quiet reason line via `.display + .sub`).
- `.btn.glass` — the frosted white-on-photo button.
Refactor `.login-hero`, `.ob`, `.obslide` to consume these. Pixel-identical result is the acceptance test.

**A2 · Instrument motion pack** (`app.css` only, ~6 rules): `.ishape`/`.ighost` transition on points is not animatable in CSS — instead the radar gets a one-time draw-in via opacity+scale settle (`--d-slow`); `.mbar .dot` transitions `left` (`--d-base`); `.gate.miss::after` ribbon slides in (`--d-base`); `.score-hero .v` gets a JS count-up helper `HV.countUp(el, from, to)` in core (used where a numeral is the page's subject); `.lvlmap` cell state transitions background/colour; `.chat .msg:last-child` entrance rise. Every rule sits inside the existing `@media (prefers-reduced-motion)` kill.

**A3 · Voice kit**: `HV.ui.empty(icon, sentence, sub)` replaces bare `.empty` markup so every empty state carries an authored sentence; a copy sweep table (old string → new string) maintained in the implementation plan; the banned-word list enforced by a grep check in verification.

### Phase B — the rooms (client, worst first)

**B4 · Meal flow** — generate 12–15 Indian home-food images (matte, warm, real-plate register — "never white-plate Western salads"), one per seeded meal record (`HV.store.meals` gains `photo: 'img/food/<id>.webp'`); `.mealph` renders the photo when present, bowl icon as fallback (markup seam already exists). The star reveal calls `HV.celebrate` (its earned moment). Pending states become `.scene`-headed cards with voiced copy. The same photos surface automatically in coach meal messages, console Meal Queue, circles meal sheets, and Client 360 timeline — all render via meal records.

**B5 · Today** — each pillar drawer head becomes a compact scene strip using the existing pillar/task plates; empties voiced via A3; completing the last undone item of the day fires the day-complete celebrate (once per day, guarded by a store flag); "Today's read" gets one clay illustration and its sheet gets the display treatment.

**B6 · Plan sub-routes** — plan-detail Progress adopts the Trackers bar-strip instrument for its history; bookHtml rows get pmark glyphs; the Level-up tab keeps `HV.levelup` but renders gates as the gate-grid; plan-full day rows collapse into the calendar's visual vocabulary (plate marks + status rings); goal ledger rows carry delta chips.

**B7 · Profile lower half** — sections get kicker headings; Records Vault rows carry document-type plates (reuse vitals/doc iconography, one new generic document plate if needed); DPDP/notifications keep their structure, gain voiced copy.

**B8 · Journey + Coach edges** — care-team rows keep structure but gain role kickers and the section gets one display sentence; coach empty state voiced; coach meal messages show the photo (falls out of B4).

### Phase C — the corridors (console, full depth)

**C9 · Console scene, quiet register** — every console view's `.h1-row` gains a kicker line; one authored moment per view (digest: the morning sentence; approvals: the queue headline as workload ring; circles: the room header). No photographs in the console except meal photos in their working contexts.

**C10 · Instruments where there are lists** —
- Digest: stat trio becomes ring/dial instruments; attention rows gain `levelBadges` + mini `sessionRings` (helpers exist); "Needs a reply" rows keep unread pills.
- Approvals + Builder: one shared `HV.ui.stepper(chain, state)` instrument replaces both text-chip steppers; queue headline gets a workload ring; chart approvals wear their pillar dot (colour law: the pillar's own item only).
- Circles: open-circle header gains the client's `headerIndex` radar + session rings; list rows gain a risk-tone edge.
- Meals: the photo (B4) replaces the bowl in queue and composer; the stored 4-part rubric renders as a gate-grid on the rated view.
- Builder: goalsheet department sign-off re-rendered as the gate-grid pattern proven at ~294–319.

### Phase D — law and budget

**D11 · Governance** — Design System v2 gains three new sections (Imagery, Voice, Celebration) absorbing the Handoff rules verbatim-in-spirit; the Handoff section is marked superseded. The audit's "competing authorities" finding closes.

**D12 · Weight** — new `img/food/` assets: ≤ 30KB each, ≤ 400KB total, `loading="lazy"`, excluded from `sw.js` ASSETS (runtime-cached on first view by the existing fetch handler); a verification step totals the folder.

## 6. Acceptance criteria

1. Onboarding and login are pixel-unchanged after A1 (side-by-side screenshot).
2. Every client page and console view shows exactly one kicker/display moment; none shows two scenes.
3. Meal flow shows real food imagery end-to-end (client capture → coach message → dietitian queue → rating → circle), star reveal celebrates once.
4. All new motion inert under reduced-motion; dark mode checked on every touched surface; no pillar colour outside its own instrument (manual sweep).
5. `img/food/` ≤ 400KB total; sw.js precache list unchanged except version bump; all `?v=`/CACHE/seedVersion levers bumped together (three-places rule for any new file).
6. `node --check` clean on all touched files; console clean in browser on every persona's home; seed changes bump `HV.seedVersion`.
7. Banned-word grep returns nothing on client-facing strings.

## 7. Risks

- **Gilding** — mitigated by the one-moment rule and the audit's constraint as the review bar.
- **Asset weight** — hard budget + lazy-load; verification totals the folder.
- **Radar motion** — SVG polygon points don't CSS-transition; the draw-in settle is the honest fallback (attempting point interpolation in JS is out of scope).
- **Concurrent sessions** — versions re-checked at ship time (`grep` the live CACHE/seedVersion), never assumed from earlier reads.
- **Celebrate inflation** — exactly three earned moments, enumerated in §4.3.
- **Console density** — instruments must encode real data (rings = real session counts); any instrument that decorates rather than reads is cut.
