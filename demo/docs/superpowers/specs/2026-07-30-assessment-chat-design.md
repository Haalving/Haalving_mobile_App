# Start-assessment rework — conversational assessment in My Circle

Date: 2026-07-30 · Author: Claude (autonomous session; TJ's brief) · Target: v99

## Goal

Replace the v97 "Start assessment → booking sheet" with a rich, in-chat,
AI-guided assessment ("assessment-lite") that runs inside My Circle. The chat
gains first-class rich message kinds — rich text, video, gif, image, buttons,
single-select MCQ, multi-select — and the assessment includes a physical
flexibility self-test: a yoga posture (Uttanasana) demonstrated with an
animated loop + still image, self-graded by the client.

## Message-kind contract (stored in `HV.store.circles[cid]`, via `HV.pushMsg`)

Every message still carries `text` (plain fallback — console roster previews
and unknown renderers read it). New kinds, client renderer in client-coach.js:

- `rich` — body runs through `HV.md(text)`: escape FIRST, then `**b**`,
  `_i_`, newlines, `• ` bullet lines. No links, no HTML passthrough.
- `media` — `m.media = {type: 'image'|'gif'|'video', src, poster?, alt}`;
  `text` is the caption. video → `<video controls playsinline>`; gif →
  looping `<img>` (animated webp) with a GIF corner tag; image → `<img>`.
- `choice` — single-select. `m.opts = [{k, label, sub?, reply?}]`,
  `m.style: 'chips'|'list'` (chips = quick-reply buttons, list = MCQ rows).
  Answer → `m.done`, `m.answer = k`; client echo bubble with the label;
  `opt.reply` (optional) pushes a coach aside before advancing.
- `multi` — multi-select; toggle in DOM (aria-pressed), Done commits ≥1 →
  `m.done`, `m.answers = [k...]`, echo joined labels.
- `grade` — posture self-grade. `m.img` (still), opts carry `band 1..4`
  rendered as a grade ladder. Answer as `choice`.

`opts` are COPIED onto the stored message — history stays self-contained if
the flow content changes later.

## Engine (client-coach.js)

Flow content is a reference catalogue: `HV.seed.assessFlow` in data.js,
boot-refilled (core.js refill list) — content, not user state; no seedVersion
bump. Steps: `{id, kind, text, media?, opts?, style?, img?, save?}`.

- Speaker: `plan === 'black' ? 'u-anita' : 'ai'` (Black never hears the AI).
- Start (tap on the `assess` door): seed `c.assessRun = {ans: {}}`, push
  steps from 0; stop after the first interactive kind.
- Answer: record on msg + `assessRun.ans[save] = label(s)`, echo bubble,
  advance — push until next interactive or end.
- `{name}` `{flex}` `{balance}` `{day}` tokens in step text interpolate from
  the run answers (wrap-up message).
- Finish: door msg `done`; `c.assess = ans`; `c.track` updated from the day
  MCQ; teamonly summary note into the circle for the coaches; riskWhy
  updated; `HV.celebrate('gauge', 'Assessment complete', …)`.
- Resume: pending interactive already sits in the thread; door button
  becomes "Continue assessment" and scrolls to it. Done → ok pill.

## The flow (10 steps, every kind exercised)

1 rich intro (bold + bullets) · 2 video (media/welcome.mp4 + poster) ·
3 chips "Let's begin / I have a question" (question → reply aside) ·
4 MCQ weekday movement → save track · 5 multi "true this month" ·
6 rich physical-battery intro · 7 gif Uttanasana loop
(img/assess/uttanasana-loop.webp, ffmpeg zoompan of the clay artwork) ·
8 grade: still + "where did your hands settle?" 4 bands → flex ·
9 MCQ single-leg balance → balance · 10 rich wrap with interpolated reads.

## Console mirror (console-circles.js msgHtml)

Compact branches: `rich` → HV.md body; `media` → caption + kind pill;
`choice`/`multi`/`grade` → question + "Answered · <label>" ok-pill or
"Awaiting reply" warn-pill. Assess door pills: "Assessment complete" /
"Awaiting assessment".

## Files

data.js (+assessFlow, seed door text), core.js (HV.md + refill key),
client-coach.js (renderers + engine + wiring), console-circles.js (mirror),
client-onboard.js (door copy), app.css (media block, opt buttons 44px,
grade ladder, GIF tag), index.html + sw.js (v99 + new ASSETS entry),
img/assess/uttanasana-loop.webp (new asset).

## Verification

node --check on all touched JS; headless Chrome CDP: onboard fresh Svayam
client → full assessment walk (screenshot per kind), console persona mirror,
JS console clean, dark-mode spot check. Version levers re-grepped at ship
time (concurrent sessions).

## Rev 2 — the plan split (TJ, 30 Jul, v103)

The assessment door forks by plan. **Svayam (white) = AI-driven**: the
conversational flow above, no call. **Poorna (black) = call-guided**: the
door reads "Book my assessment" and opens the booking sheet (care-team
voice, Anita confirms); `door.booked` set alongside `done`; console pills
say "Awaiting booking / Assessment call booked". Grey (legacy seeds)
follows the AI path. Onboarding seeds plan-matched door copy.

Also fixed here: the header's Poorna marque no longer routes to the
marketplace like "Get a Coach" — it opens the membership sheet
(`poornaSheet` in core.js): the pod roster (pillar coaches, Culture
coordinator, doctor), observation-aware sub-line, "Open My Circle".

## Out of scope

Branching flows beyond `opt.reply`, reduced-motion still for the gif,
composer attachments, serif timestamps (TJ's open call), Black/Grey/White
rename.
