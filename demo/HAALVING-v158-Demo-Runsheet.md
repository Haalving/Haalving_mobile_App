# HAALVING v158 — Admin & Team Console Demo Run Sheet

**Build:** v158 / seed 32 (branch `console-ia-phase-a`) — the "bridge the gap" wave implementing
the 24-point Admin & Team console checklist. Browser-verified 8 Aug 2026: 49 routes × 9
personas, zero console errors, all writes survive reload.

**Setup:** hard-reload, then `Reset demo data` on the login screen (the new seed carries the
whole story: dated birthdays, an in-flight leave, an active cover, overdue meal SLAs).

**New personas:** Arjun Nair (Head of Department · Fitness), Nikhil T. (Fitness L2),
Divya R. (Dietician L2). Seeded story: Sneha is on approved leave TODAY with Divya covering
her Rajesh + Suresh seats; Vikram has a leave application waiting for Arjun's cover plan.

---

## Act 1 — Super Admin's morning (Anita)

1. **Home**: announcement banner (SLA policy, "New" pill) → click through to People ›
   Announcements. Notices panel: the boot sweep has already escalated Mathew's 35-min-old
   meal photo to you (the configured escalation target). Celebrations strip: Meena
   (Birthday · **Today**), Rajesh (+2 d), Rajesh's anniversary (+4 d) → **Send wishes** on
   Meena → the message lands in her Care Circle; card flips to "Wishes sent".
2. **Clients › Rajesh › Overview**: the **Care team** card resolves seats live — Nutrition
   shows *Divya R. · covering Sneha M. until tomorrow*. Tap **Assign** on the seat: bench
   with L1/L2 badges, client counts, "On leave today" on Sneha → pick Divya → Confirm.
   The seat changes permanently, an audit note lands in the team lane, Divya is notified.
3. **Emotions tab**: the mood chart — 7 day-columns with 6 am/noon/6 pm ticks, hairline
   faces on a green→amber→red line, day C3·D4 shows an intraday climb sad → happy. Tap a
   face for time + note. (Meena's tab shows the empty state.)
4. **Overview cards**: Goal (goal, purpose, 7-level ledger), Sessions (client's 5★ "Felt
   strong" + Vikram's team note — add your own via **Team note**: stars + summary
   required), Onboarding answers.
5. **Docs tab**: Lab panel summary — out-of-range count + HbA1c/LDL/hs-CRP/glucose delta
   chips (Feb → Jul, green = moved toward range). Raw records stay Doctor-only.

## Act 2 — The leave story (requirements 2, 3, 11)

1. **Vikram** → Time & Cover: *My availability* (paint the week, saves live, IST pill);
   *My leave* shows the Kochi application ("Cover plan due").
2. **Arjun (HoD)** → Time & Cover › Team (badge 1): Vikram's leave → **Plan the cover** —
   every riding client gets a picker, same-level colleagues first, best match preselected
   → **Send for approval**.
3. **Anita** → Time & Cover › Approvals: the packet shows dates, reason AND the full
   client→cover reallocation table → **Approve**. Covers are written per client with the
   exact date window.
4. **Divya** → Clients: her roster now INCLUDES Rajesh and Suresh (cover-window access —
   it lapses automatically when the window ends). Her Meals queue carries their reply-SLA
   clocks; Sneha's no longer does.

## Act 3 — Scheduler (requirements 8, 9, 11)

1. **Anita › Schedule**: person dropdown has a **Departments** optgroup (pick "Fitness
   department" for the bench lens). Pick **Vikram** alone: hours outside his declared
   window are hatched.
2. Open the **Assessment meeting**: participant chips with response pills ("2/13 in" —
   dashed tile until everyone accepts). As **Vikram** (his dropdown is locked to himself):
   Accept / Hold / Decline / **Propose new time** → allocators get the proposal with an
   **Apply** button.
3. New task → tick **Block double-booking** → overlapping slots hard-refuse (drag-drop
   included). Attach client *Dev M. (Dubai)* → the slot shows "IST · GST (client local)".
4. Open today's **Form check-in** → **Coach brief · AI-drafted** — live mood, meals,
   compliance, risk from the client's real data.

## Act 4 — Configuration (requirements 4, 7 + leave approver)

- **Service tab**: the reply ladder (15 min target · nudge at 10 · escalate at 25) and
  **who approves leave** — both live dropdowns/fields, persisted. Change reply target to
  20 and reload to prove it.
- **Chains tab**: reorder/add/remove signature steps (writes the live chains).
- **Program tab**: set cycle length to 8 → red notice ("Day 9 of an 8-day cycle doesn't
  exist"), nothing saved.
- As **Bineesh (Super User)**: the whole page is read-only.

## Act 5 — Ops & performance (requirements 7, 18, 19)

- **Meals queue** (Divya today; Sneha normally): ladder audit line, live "Reply due · N
  min" pills, "Overdue · escalated" on Mathew's lunch.
- **Reports › Team performance**: ranked, derived live (sessions cover-aware, meals rated,
  avg stars, worklist), top row crowned "Top performer".
- **Exports › Complete Sheet**: **Download CSV** → a real `haalving-c-rajesh.csv` file
  (profile, levels, sessions, trackers, goal ledger, weight log, lab values).

## Act 6 — Doctor & medical history (requirements 13, 10)

- **Dr. Kavya › Medical**: lab marker **series** — Feb/Jul chips, per-marker delta chips.
  **Revise & re-sign** a summary → version history row appears (nothing overwritten).
- Any other role at `#/medical`: lock notice. Grant that role **Raw medical records** in
  People & Access → the desk genuinely opens (live RBAC).
- **Rajesh › Profile › Vital Panel**: report chips + deltas; **+ Add report** (e.g. HbA1c
  6.0) → a "Self-reported" chip appears and persists; **Attach report PDF** → lands in the
  Doctor's pending queue.

## Act 7 — The client's day (requirements 5, 6, 14, 15, 22, 24)

1. **Rajesh › Today**: arrival sheet now journals each check-in with clock time (the
   console chart reads this). Birthday band appears on his day (+2 d; Meena's is today).
2. **Rajesh › My Plan**: any upcoming session → **Can't make it** → *Cancel* (counter +
   coach notice) or *Request new time* (circle message + ops work item). **Mark session
   done** → star + comment feedback sheet; done days wear their tiny star rows.
3. **Mathew › Today** (day 8): the **Cycle weigh-in** card (the day-8 automation) → log
   78.4 kg → card retires, circle shows "Automated · Day-8 weigh-in recorded".
4. **Mathew › My Circle**: **Day-9 review check-in** invite → six conversational
   questions; answers echo into the thread; on finish a team-only summary posts for staff,
   and the Level Review Pack (console › `#/review`) shows the answers in its "Client
   check-in" card.

## Act 8 — People & HR (requirements 1, 17, 21)

- **People › Staff**: dept chips, L1/L2 badges, "On leave" pill on Sneha. Open a row: DOJ +
  tenure, timezone, emergency contact, CV, memo, availability strip. **Edit record** /
  extended **Add employee**.
- **People › Announcements**: compose with Holiday/Policy/General tag (broadcast perm);
  unread badges for every staff member; also surfaces as the Home banner.
- **Roles & permissions**: the new perms (Post announcements, Approve leave, Assign pod
  seats…) are live toggles.

---

### Quirks worth knowing before a live demo
- The Time & Cover **Approvals tab's deep link is `#/leave/approve`** (not /approvals).
- Team-calendar extras (the "2/13 in" meeting pill, the ~2 h-out Form check-in reminder
  task) seed on the **first Schedule visit** and settle within the next 45-second sweep —
  open Schedule once early in the demo.
- Session reminders reach the client's Today band via the same 45 s sweep after Schedule
  has been opened.
- Sneha demos "on leave" all day today: her clients (and their meal SLAs) belong to Divya
  until tomorrow — that's requirement 3 working, not a bug.
- The deep code-review wave is still pending (usage-limit window); the browser pass above
  is complete.
