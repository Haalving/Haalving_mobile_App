# Admin & Team Panel — demo run sheet (v151)

Serve `app/` (any static server), open a fresh/private browser window, `Reset demo data` on the login screen. 60–90s per persona, in this order:

1. **Super Admin (Anita R.)** — Home vital stats + ledger → People & Access: *Add employee* (any name, Dietician) → *New role* "Content Editor" copied from Fitness Coach, untick every sidebar chip except Catalog → show the matrix row updating live. Configuration → Program tab: edit review day, point at the "applies from next cycle" audit line, set it back.
2. **Haalving Coach (Rohan M.)** — Clients → Rajesh → **Plan tab**: cycle 2 day 3 shows the *edited* chip ("Idli + Chutney **or** Cheela") → *Edit day* on day 4's breakfast, add an alternative → *Save as new template* ("Rajesh Special") → *Submit for approval*. Show the pad: Assistant suggestions (accept/refine), Automations, Team-only lane. Rail: Onboarding tab = the pipeline kanban.
3. **Operations Head (Suresh K.)** — Work Queues → Approvals: **sign "Rajesh Special" here** (first console signature; the chain is Coach → Ops Head → Super User). Then Clients rail → Onboarding: capacity override sheet.
4. **Super User (Bineesh)** — lands on Work Queues → Approvals: **final signature** → template flips to *Published* (show it in Catalog → Templates with the green pill). Everything else read-only — that's the point of the seat.
5. **Dietician (Sneha M.)** — lands on the meals queue → rate a meal (below 5 stars demands a voice/typed note) → Catalog opens on **Nutrition**: add a food with macros + allergies.
6. **Doctor (Dr. Kavya)** — Clients → Documents: raw records with the access-log line (no other role has this) → Work Queues → Medical sign-off. Note: no Approvals tab for the Doctor.
7. **Fitness / Yoga / Mind Wellness coach** (pick one) — Catalog authoring only on their own pillar; Clients rail shows only their pod.
8. **Client (Rajesh)** — Today / Plan / Tribe. If you created a gathering in Tribe admin, it appears here with its long-read page.

## Two things NOT to promise live

- The swapped breakfast shows on the **console** Plan tab, not inside Rajesh's client app — the client plan screen still renders its original plan data (wiring `clientPlans` into the client app is the natural next phase).
- Don't free-click "Confirm key-in" / "Review & send welcome" on the Onboarding tab while logged in as Super User — those two buttons aren't yet perm-gated for the read-only seat.
