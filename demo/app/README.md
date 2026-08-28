# HAALVING — Demo PWA

A responsive Progressive Web App demo of the HAALVING platform: the **client app** (mobile-first) and the **Team Console** (role-scoped admin) in one build, seeded with coherent demo data for walking a client through the entire 7/11 workflow.

No build step, no dependencies — plain HTML/CSS/JS.

## Run it

```bash
cd /Users/USER/claude_tj/HAALIVING/app
python3 -m http.server 8080
```

Open **http://localhost:8080** — on a phone on the same Wi-Fi, use `http://<your-mac-ip>:8080`.
Chrome/Edge will offer "Install app" (PWA manifest + offline service worker included).

Demo state persists in the browser (localStorage). **Reset demo data** from the login screen or the client Profile tab any time — resetting restores the exact starting story below.

## The cast (login screen personas)

Three plans: **Black** (full human team, AI behind the coaches — AI → Coach → Client), **Grey** (AI coach + chosen human pillars — both flows), **White** (AI coaches the client directly — AI → Client).

| Persona | Role | Why they're in the demo |
|---|---|---|
| Rajesh D. | Client (Black) | Mid-cycle (Cycle 3, Day 6 of 11) — the full-human-team experience |
| Priya K. | Client (Black) | Observation period (Day 3 of 5) — the "no judgement yet" variant |
| Dev K. | Client (Grey) | AI coach day-to-day + Vikram on Fitness — both AI flows at once |
| Ananya S. | Client (White) | All-AI coaching: instant meal ratings, AI chat, guided sessions |
| Anita R. | Admin / Ops | Digest, pipeline, allocation, follow-ups |
| Suresh K. | Ops Head | Approvals, capacity overrides, level finalisation |
| Dr. Kavya | Doctor | The ONLY role that can open raw medical records |
| Sneha M. | Dietitian | Meal review queue — the signature surface |
| Vikram S. | Fitness Trainer | Chart builder, AI-drafted next-level chart |
| Lakshmi N. | Yoga Trainer | Role-scoped console (same shell, own queue) |
| Meera J. | Mind Wellness Coach | The 7th role — full pod accounted for |

## Suggested 10-minute demo script

1. **Client: Rajesh** — Home shows the Way-of-Living score, "Day 6 of 11" cycle countdown with the four pillar rings, tracker tiles (tap Water: it logs). Tap the camera button: capture → fullness → confirm dishes → "Sent to Sneha".
2. **Switch to Sneha (Dietitian)** — the Meal Queue has Rajesh's lunch with an SLA countdown and an **AI pre-score (3★, 82%)** in the dashed "AI draft" container. Confirm or override the stars; below 5★ the voice note is mandatory. Submit.
3. **Back to Rajesh** — Coach tab / meal detail now shows the **human-confirmed** star rating with Sneha's voice note and the rubric. *Point out: the AI advised, the human decided, the client only ever sees the human.*
4. **Anita (Admin)** — Morning Digest reads every client in seconds; Meena is flagged HIGH (silent 3 days) with the "why" and evidence links. Bulk **Review & send** the AI-drafted follow-ups (each editable first).
5. **Anita → Onboarding** — the pipeline board (Registered → … → Active), allocation picker with live capacity (Vikram is FULL — only the Ops Head can override, with a logged reason). Mind Wellness Coach and future role types visible.
6. **Vikram (Fitness Trainer)** — Charts & Plans: the **next level's chart is AI-drafted on the review day** (knee-safe, from the doctor's flags); he edits and submits; nothing reaches the client unpublished.
7. **Suresh K. (Ops Head) → Level Review** — Suresh P.'s review-day pack is auto-compiled: engine reads, evidence links, the four-department decision grid (each row records Upgrade/Hold — Hold against the engine needs a reason). Finalise → the Level Change Card publishes and the celebration fires.
8. **Dr. Kavya (Doctor)** — Medical Review: raw document beside the Health Summary editor; sign off → the pod sees the summary, never the raw record. Then log in as Vikram and try `#/medical` — **locked, and the attempt is logged**. That's RBAC.
9. **Worklist / Live board** (any staff) — SLA breaches are loud, everything else quiet; the calorie log and trainer incentive tracker replace the old Google Sheets.
10. **The three-plan contrast** — log a meal as **Ananya (White)**: rated instantly by the AI, with the note in her AI chat. Log one as **Rajesh (Black)**: it goes to Sneha's queue for human judgement. Open **Dev (Grey)**: his chat mixes the AI's daily coaching with Vikram's messages — and Vikram's console digest carries the AI's brief for tonight's session. Same platform, three price points, one honest rule everywhere: *the coach's judgement sits above the AI's assistance.*
11. Close on the login screen: *one platform, eleven personas, every role seeing exactly what it should.*

## Architecture (for the follow-up conversation)

- `js/core.js` — store (localStorage), hash router, **RBAC matrix** (roles → nav + permissions), shells, UI kit
- `js/data.js` — the seeded demo story (versioned; bump `seedVersion` to force re-seed)
- `js/views/*.js` — one module per screen group, registered against the router
- `css/app.css` — HAALVING design tokens (binding palette from the Design Handoff), light + dark
- `manifest.webmanifest` + `sw.js` — installable, offline-capable app shell

Production path: same screens over a real backend (Supabase/Postgres + row-level security mirroring this RBAC matrix), AI endpoints for pre-scoring/drafts, push notifications per the PRD's canonical engine.
