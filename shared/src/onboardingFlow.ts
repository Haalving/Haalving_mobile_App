/**
 * The onboarding flow — HAAL/QMS/OP/2026/01/00, "Operations Process Flow".
 *
 * Ported verbatim from `FLOW` in demo/app/js/views/console-pipeline.js:66-282.
 * Twelve steps across four phases, from the first health record to the calendar
 * meeting; the thirteenth thing that happens is Day 1 of Level 1, which is
 * exactly the moment an arrival stops being an arrival and becomes a client.
 *
 * THIS FILE IS THE ONLY PLACE THE FLOW LIVES. The service computes step state
 * from these helpers and the web renders what the API returns — neither
 * re-implements the maths. A second copy of `stepComplete` is how a console and
 * its server come to disagree about whether somebody may be promoted.
 *
 * `by` is a role KEY wherever the SOP names a role that exists in ROLES, so the
 * owner chip always shows that role's CURRENT title — People & Access can
 * rename a role and this list follows. `team` and `client` are the two owners
 * the document names that are not single seats.
 */

/**
 * The SOP revision these steps were transcribed from. Stamped onto every arrival
 * at creation, so a record can always say which flow it walked — and so a future
 * revision that adds a task can tell an old record from a new one instead of
 * showing it a phantom open item.
 */
export const FLOW_VERSION = 'HAAL/QMS/OP/2026/01/00';

/** A role key from ROLES, or one of the two owners that are not single seats. */
export type TaskOwner = string;

/** The affordance a task grows inline. Doing the work is ticking it. */
export type TaskAct = 'capacity' | 'inbody' | 'welcome';

export interface FlowTask {
  /** The task line, exactly as the SOP words it. */
  t: string;
  by: TaskOwner;
  /** Present when the console can actually DO this task rather than describe it. */
  act?: TaskAct;
}

export interface BriefSection {
  h: string;
  by?: TaskOwner;
  pts: string[];
}

export interface FlowStep {
  key: string;
  phase: string;
  label: string;
  /** A line above the checklist where the SOP qualifies the step. */
  note?: string;
  tasks: FlowTask[];
  /**
   * Two steps carry a brief as well as a checklist, transcribed from the SOP's
   * annexures. Tasks are what you tick; the brief is what you say. They are kept
   * apart deliberately — where the script covers ground the process flow does not
   * name as a presenting task, the mismatch stays visible instead of being
   * quietly reconciled by inventing a task.
   */
  briefTitle?: string;
  briefRef?: string;
  brief?: BriefSection[];
}

export const FLOW: readonly FlowStep[] = [
  /* ---------- PHASE 1 · CLIENT ONBOARDING ---------- */
  {
    key: 'records',
    phase: 'Client onboarding',
    label: 'Health records',
    tasks: [{ t: 'Collect health records from sales or the client', by: 'admin' }],
  },
  {
    key: 'team',
    phase: 'Client onboarding',
    label: 'Team allocation',
    tasks: [
      { t: 'Allocate the client team and take approval', by: 'opshead', act: 'capacity' },
      { t: 'Create the WhatsApp group for the team', by: 'admin' },
      { t: 'Send InBody reports and medical records to the group and the doctor', by: 'admin', act: 'inbody' },
    ],
  },

  /* ---------- PHASE 2 · CLIENT ASSESSMENT MEETING ---------- */
  {
    key: 'assessprep',
    phase: 'Assessment meeting',
    label: 'Prep',
    tasks: [
      { t: 'Coordinate and arrange the assessment call with the client', by: 'admin' },
      { t: 'Send the Google Meet link to the team, core and doctor', by: 'admin' },
      { t: 'Send three reminders on the day — morning, midday, just before', by: 'admin' },
      { t: 'Missed call on the team WhatsApp group 15 minutes before', by: 'admin' },
      { t: 'Team and doctor join 10 minutes early and discuss the client', by: 'admin' },
      { t: 'Accept the client into the meeting on the dot', by: 'admin' },
      { t: 'If the client has not joined — call, and remind in the client group', by: 'admin' },
      { t: 'Post a screenshot of the team waiting for the client', by: 'admin' },
    ],
  },
  {
    key: 'assessmeet',
    phase: 'Assessment meeting',
    label: 'The meeting',
    note: 'Order of presentation. The script below is what each seat covers.',
    tasks: [
      { t: 'Operations Head presents', by: 'opshead' },
      { t: 'Doctor presents', by: 'doctor' },
      { t: 'Dietitian presents', by: 'dietitian' },
      { t: 'Fitness trainer presents', by: 'fitness' },
      { t: 'Yoga trainer presents', by: 'yoga' },
      /* TJ, 17 Aug: the fourth pillar presents like the other three. The call
         script always had a Mind Wellness segment; the process flow did not name
         it as a presenting task, and that gap is now closed rather than
         annotated. */
      { t: 'Mind Wellness coach presents', by: 'mind' },
      { t: 'Fitness and yoga mock test', by: 'fitness' },
    ],
    briefTitle: 'The call script — what each seat covers',
    briefRef:
      'Assessment Call Script · HAAL/QMS/OPS/2026/01/00 Annexure OPS_ · issued 27 Jul 2026, ' +
      'with Mind Wellness raised to a presenting seat alongside the other three pillars (TJ, 17 Aug 2026).',
    brief: [
      {
        h: 'Opening',
        by: 'opshead',
        pts: [
          'Goal, in the client’s own words — weight loss, a medical issue, a specific goal, fatty liver',
          'Vision — longevity. The habits of healthy living are the four pillars; introduce the team and say plainly that they stay with the client throughout the journey',
          'Mission — 77 days to reach the goal, 16 weeks of journey towards longevity, 20 weeks to cement the habits',
          'Data collected alongside the dietitian — name, height, age, weight, BMI, job, inches, injuries, client picture',
        ],
      },
      {
        h: 'Health',
        by: 'doctor',
        pts: [
          'Any health issues — fatty liver, PCOD / PCOS, thyroid, hypertension, diabetes, and the stage of each',
          'After eating — acidity, bloating, urine shades, constipation, addictions, periods',
        ],
      },
      {
        h: 'Nutrition',
        by: 'dietitian',
        pts: [
          'The Haalving system of diet — 80% healthy food, 20% food of your liking',
          'Start with 20–25% gene food, 30–35% climate-based food, 40–45% growth food',
          'Smoking and alcohol — no judgement. We guide what to eat that day and the detox the next',
          'Outside food — tell us what is accessible and we guide the choice towards the goal',
          'Snacking — the pros and the cons',
          'The 5-day observation pattern — at least 15 to 20 meal pictures, so the pre-diet plan is built on real days',
          'How Haalving is different — habit creation takes time, and we deliver healthy habits as the product, not a wellness service',
          'Food habits — home-cooked or outside, how many times a week they dine out, preferred likes and dislikes, fried snacks (parippu vada, pazham pori, samosa), gravy, processed food, sugar in a day from tea and biscuits',
          'Close by reassuring — this is habit building. No pressure, no push',
        ],
      },
      {
        h: 'Fitness',
        by: 'fitness',
        pts: [
          'The phases — build, maintain, protect',
          'Preference — self-workout or with a trainer; online or offline; our trainer, their own, or videos; a professional gym, at home, or the building gym',
          'Trainer asks — any injuries',
          'Preferred workout — cardio (swimming, boxing, cycling, running) or gym work for muscle, with machines and weights',
          'Walking — do they like it, and how much on an average day',
          'Suggest 3 to 4 workout days a week and ask whether that is comfortable',
        ],
      },
      {
        h: 'Yoga',
        by: 'yoga',
        pts: [
          'Why yoga, in 10 to 20 seconds — flexibility, mobility and breath, tied back to the habits of healthy living',
          'Yoga is low intensity, and one hour burns around 250 kcal — close to an hour at the gym',
          'Ask about pain, low BP, asthma, movement issues, breath issues',
          'Are they comfortable doing breathing exercises?',
          'We prefer 3 yoga days — ask whether they are comfortable starting with 2 a week',
          'Fasting — why this is the best time to start',
        ],
      },
      {
        h: 'Mind Wellness',
        by: 'mind',
        pts: [
          'Name what is coming — self-doubt, lack of motivation, peer pressure, the feeling that the weight is stuck',
          'Nobody has to go looking elsewhere for answers; the health counselling team knows them better than any social-media expert does',
          'Weekly counselling sessions with our psychologists to clear confusion and refocus on the goal',
          'Weekly meditations for mind wellness',
          'Community programmes and webinars keep them current on what the wellness world is discussing',
        ],
      },
      /* 'team' rather than 'fitness': the test is run by fitness but scores the
         yoga domain too, and both benches read it when levels are set */
      {
        h: 'Mock test',
        by: 'team',
        pts: [
          'Flexibility — standing forward bend',
          'Mobility — wind-relieving pose, and bound angle / butterfly pose with deep breathing',
          'Balance — tree pose',
          'Score each as a percentage. These three numbers are what Day 1 level-setting reads.',
        ],
      },
    ],
  },
  {
    key: 'assessafter',
    phase: 'Assessment meeting',
    label: 'Immediately after',
    tasks: [
      { t: 'Add the client to the WhatsApp group', by: 'admin' },
      { t: 'Send the welcome message', by: 'admin', act: 'welcome' },
      { t: 'Send do’s & don’ts, daily activity and daily updates', by: 'admin' },
      { t: 'CRM data collection', by: 'admin' },
      { t: 'Request body measurements', by: 'fitness' },
      { t: 'Add the client to the 7-11 progress sheet', by: 'opshead' },
      { t: 'Add the client to the level change sheet', by: 'admin' },
      { t: 'Add the client to the calorie sheet', by: 'admin' },
      { t: 'Add the client to the worklist', by: 'team' },
      { t: 'Add the client to the trainer incentive tracker', by: 'admin' },
    ],
  },

  /* ---------- PHASE 3 · OBSERVATION, 5 DAYS ---------- */
  {
    key: 'obs1',
    phase: 'Observation · 5 days',
    label: 'Day 1',
    tasks: [
      { t: 'Goal setting with the team', by: 'opshead' },
      { t: 'Level setting with the concerned departments', by: 'team' },
      { t: 'Approval of the goal and the levels', by: 'core' },
      { t: 'Compile the assessment data and goal, send to the client group', by: 'opshead' },
      { t: 'Send any newly received health records to the client group', by: 'client' },
      { t: 'Follow-up message for food updates — three times', by: 'dietitian' },
      { t: 'Star rating, motivation and suggestions — 20-second voice note', by: 'dietitian' },
      { t: 'Daily activity reminder — steps, water, sleep, screen time', by: 'fitness' },
      { t: 'Track the last three steps in the follow-up tracker', by: 'admin' },
    ],
    briefTitle: 'Mapping the evaluation to a starting level',
    briefRef:
      'Mapping evaluation to starting level · issued 27 Jul 2026. Four levels are set here, one per pillar — ' +
      'they move independently from this point on, and no single number stands for all four.',
    brief: [
      {
        h: 'What the assessment tells you',
        pts: [
          'Profession, and activity level',
          'Body pain, movement issues, breathing issues, asthma',
          'Thyroid, hypertension, diabetes — and the stage of each',
          'Acidity and bloating; period-related issues',
          'Sleep quality and stress level',
          'Previous injuries, and previous yoga experience',
          'Specific conditions — PCOD, fatty liver, disc bulge and the like',
        ],
      },
      {
        h: 'The mock-test score',
        pts: [
          'Flexibility — standing forward bend',
          'Mobility — wind-relieving pose, and bound angle / butterfly pose with deep breathing',
          'Balance — tree pose',
        ],
      },
      {
        h: 'Reading the score',
        pts: [
          'Below 50% — sedentary',
          'Below 75% — moderate',
          '80% and above — active',
          'The medical conditions above and any previous yoga experience are weighed on top of the band, never replaced by it',
        ],
      },
    ],
  },
  {
    key: 'obs2',
    phase: 'Observation · 5 days',
    label: 'Day 2',
    tasks: [
      /* TJ, 17 Aug: four pillars, four charts, one line each.
         The SOP carried "the fitness and yoga charts" as a single line owned by
         fitness, which the coach lens turns into a real fault — the yoga bench
         would see the approval gate but not the task that builds their own
         chart. One line per bench is what makes each seat's view true. The
         creation lines sit BEFORE the approval, because a chart is signed after
         it exists, and the heads sign all four together. */
      { t: 'Create the fitness chart from assessment and level data', by: 'fitness' },
      { t: 'Create the yoga chart from assessment and level data', by: 'yoga' },
      { t: 'Create the mind wellness chart — counselling sessions and weekly meditations', by: 'mind' },
      /* 'team', not 'yoga': every bench that made a chart takes it to its head,
         so the approval gate belongs to all four */
      { t: 'Take approval from the department heads', by: 'team' },
    ],
  },
  {
    key: 'obs4',
    phase: 'Observation · 5 days',
    label: 'Day 4',
    note: 'The observation window extends until 10 meal pictures are in — that is a client-side bottleneck, not a failure.',
    tasks: [
      { t: 'If fewer than 10 meal pictures are in, start preparing the diet plan', by: 'dietitian' },
      {
        t: 'Complete data collection — fitness chart, yoga chart, mind wellness chart, approved diet plan, current weight',
        by: 'team',
      },
      { t: 'Ensure data collection is complete by 12:00', by: 'opshead' },
      { t: 'Hand over the collected data for calendar preparation', by: 'admin' },
      { t: 'Contact the client for calendar-meeting availability — call and message the group', by: 'admin' },
    ],
  },
  {
    key: 'obs5',
    phase: 'Observation · 5 days',
    label: 'Day 5',
    tasks: [
      { t: 'Complete calendar preparation by 12:00', by: 'team' },
      { t: 'Verify and approve the calendar from operations at 13:00', by: 'opshead' },
      { t: 'Confirm the client’s availability for the meeting', by: 'admin' },
      { t: 'Client team sits with management for the follow-up discussion', by: 'core' },
    ],
  },

  /* ---------- PHASE 4 · CALENDAR MEETING ---------- */
  {
    key: 'calprep',
    phase: 'Calendar meeting',
    label: 'Prep',
    tasks: [
      { t: 'Coordinate and arrange the calendar call with the client', by: 'admin' },
      { t: 'Send the Google Meet link to the team, core and doctor', by: 'admin' },
      { t: 'Send three reminders on the day — morning, midday, just before', by: 'admin' },
      { t: 'Missed call on the team WhatsApp group 15 minutes before', by: 'admin' },
      { t: 'Team and doctor join 10 minutes early and discuss the client', by: 'admin' },
      { t: 'Accept the client into the meeting on the dot', by: 'admin' },
      { t: 'If the client has not joined — call, and remind in the client group', by: 'admin' },
      { t: 'Post a screenshot of the team waiting for the client', by: 'admin' },
    ],
  },
  {
    key: 'calmeet',
    phase: 'Calendar meeting',
    label: 'The meeting',
    note: 'Order of conversation.',
    tasks: [
      { t: 'Explain the goal and the 7-level process', by: 'opshead' },
      { t: 'Explain happy habits and health concerns', by: 'doctor' },
      { t: 'Explain the pre / customised diet plan', by: 'dietitian' },
      { t: 'Explain the workout chart and session dates', by: 'fitness' },
      { t: 'Explain the yoga chart and session dates', by: 'yoga' },
      /* parity with the assessment call — the fourth pillar has an arc to
         explain here too, and three-of-four presenting is what made Mind
         Wellness look optional in the first place */
      { t: 'Explain the counselling arc and the weekly meditations', by: 'mind' },
      { t: 'Inform and educate the client on the result of deviation', by: 'opshead' },
    ],
  },
  {
    key: 'calafter',
    phase: 'Calendar meeting',
    label: 'Immediately after',
    tasks: [
      { t: 'Send the calendar in the client group', by: 'admin' },
      { t: 'Send the diet plan in the client group', by: 'dietitian' },
      { t: 'Send the happy habits poster in the client group', by: 'dietitian' },
      { t: 'Send any other posters', by: 'admin' },
    ],
  },
];

/* ══════════════════════ the helpers ══════════════════════
   Ported from console-pipeline.js:293-365. Everything that decides where an
   arrival stands lives here and is called from both sides of the wire. */

/** What a record needs to answer any of the questions below. */
export interface FlowRecord {
  /** The step the RECORD stands on — never where somebody is looking. */
  step: string;
  /** `{ "assessprep#3": true }` — ticks live under the step key, so stepping
   *  back and forth never mixes two steps' progress. */
  ticks: Record<string, boolean>;
}

export interface Phase {
  name: string;
  steps: { step: FlowStep; i: number }[];
}

/** The phases, in order, each with the steps under it. */
export function phases(): Phase[] {
  const out: Phase[] = [];
  const seen = new Map<string, Phase>();
  FLOW.forEach((s, i) => {
    let p = seen.get(s.phase);
    if (!p) {
      p = { name: s.phase, steps: [] };
      seen.set(s.phase, p);
      out.push(p);
    }
    p.steps.push({ step: s, i });
  });
  return out;
}

/**
 * The position of a step key. An unknown key answers 0 — the demo's behaviour,
 * kept: a record whose step was renamed by a later SOP revision reads as being
 * at the beginning, which is recoverable, rather than throwing on every read.
 */
export function stepIndex(k: string): number {
  for (let i = 0; i < FLOW.length; i++) if (FLOW[i]!.key === k) return i;
  return 0;
}

export function hasStep(k: string): boolean {
  return FLOW.some((s) => s.key === k);
}

export function stepDef(k: string): FlowStep {
  return FLOW[stepIndex(k)]!;
}

/** `p.ticks['assessprep#3'] === true` */
export function tickKey(stepKey: string, i: number): string {
  return `${stepKey}#${i}`;
}

export function isTicked(p: FlowRecord, stepKey: string, i: number): boolean {
  return p.ticks?.[tickKey(stepKey, i)] === true;
}

export function tickedCount(p: FlowRecord, s: FlowStep): number {
  let n = 0;
  s.tasks.forEach((_t, i) => {
    if (isTicked(p, s.key, i)) n++;
  });
  return n;
}

export function stepComplete(p: FlowRecord, s: FlowStep): boolean {
  return tickedCount(p, s) === s.tasks.length;
}

/**
 * The earliest CLOSED step that is no longer whole — the hole an edit can leave
 * behind, and the only reason a step before the current one is ever worth
 * looking at twice. -1 when the record has no holes.
 */
export function firstGap(p: FlowRecord): number {
  const cur = stepIndex(p.step);
  for (let i = 0; i < cur; i++) if (!stepComplete(p, FLOW[i]!)) return i;
  return -1;
}

/**
 * The last step closed AND nothing left open behind it.
 *
 * The second half is what editing made necessary: promoting on a record with a
 * hole in step 3 would mint a client the SOP was never actually finished for.
 */
export function readyToFinish(p: FlowRecord): boolean {
  return (
    stepIndex(p.step) === FLOW.length - 1 && stepComplete(p, stepDef(p.step)) && firstGap(p) < 0
  );
}

/**
 * May this tick land?
 *
 * The rule the SERVER enforces is the first two clauses: the current step is
 * always tickable, an earlier step is tickable as a correction, and a LATER step
 * never is — that is what makes "we're on step 7" mean the same thing for every
 * arrival and every reader.
 *
 * `unlockedKey` is the web's extra half. The console additionally requires that
 * a closed step be deliberately unlocked ("Correct this step") before its boxes
 * respond, so a stray click on a crumb cannot silently re-open a hole. Pass it
 * from the UI; omit it on the server, where the lens does not exist and a
 * correction posted by any legitimate client must be honoured.
 */
export function canTick(p: FlowRecord, stepKey: string, unlockedKey?: string | null): boolean {
  if (!hasStep(stepKey)) return false;
  const at = stepIndex(stepKey);
  const cur = stepIndex(p.step);
  if (at > cur) return false;
  if (at === cur) return true;
  /* a closed step: the server takes it, the console wants it unlocked first */
  return unlockedKey === undefined || unlockedKey === stepKey;
}

/**
 * Who may move an arrival along — the same permission that allocates a team,
 * because that is what every step transition here amounts to.
 *
 * Takes the two answers rather than a role, so the caller uses whichever `can`
 * it already has (the middleware's async one on the server, the store-backed one
 * in the console) and this stays pure.
 */
export function canRunFlow(canAllocate: boolean, canSeeAllClients: boolean): boolean {
  return canAllocate || canSeeAllClients;
}

/**
 * `team` is every coach's line by definition — the SOP uses it for the work the
 * client team does together. `client` is not: those are the lines ops chases the
 * client for.
 */
export function ownedBy(lens: string | null, by: TaskOwner): boolean {
  return !lens || by === lens || by === 'team';
}

/** The owner chip's label. Roles resolve through the caller's title lookup so a
 *  rename in People & Access follows; the two non-seat owners are fixed. */
export function ownerTitle(by: TaskOwner, roleTitle: (key: string) => string | undefined): string {
  if (by === 'team') return 'Team';
  if (by === 'client') return 'Client';
  return roleTitle(by) ?? by;
}

/**
 * Backfill the ticks of every step behind the current one.
 *
 * The demo runs this lazily on read (`heal`, console-pipeline.js:363-389); the
 * port runs it ONCE at seed-extraction time, because the invariant it maintains
 * — everything behind the current step carries its ticks — is exactly what makes
 * "passed" distinguishable from "passed, and then an edit re-opened it". Running
 * it on every read would quietly re-fill the very untick a correction was for.
 *
 * Returns a NEW ticks map; it does not mutate. `seen` carries how many of each
 * step's tasks this record has already been reckoned with, so a task added to
 * the SOP later is backfilled for old records instead of showing them a phantom
 * open item forever.
 */
export function healTicks(
  step: string,
  ticks: Record<string, boolean>,
  seen: Record<string, number> = {},
): { ticks: Record<string, boolean>; seen: Record<string, number> } {
  const out = { ...ticks };
  const nextSeen = { ...seen };
  const cur = stepIndex(step);
  for (let i = 0; i < cur; i++) {
    const s = FLOW[i]!;
    const from = nextSeen[s.key] ?? 0;
    if (from >= s.tasks.length) continue;
    /* only the indices this record has never seen — a task it HAS seen and
       somebody unticked on purpose is a decision, and stays untouched */
    for (let ti = from; ti < s.tasks.length; ti++) {
      const k = tickKey(s.key, ti);
      if (!out[k]) out[k] = true;
    }
    nextSeen[s.key] = s.tasks.length;
  }
  return { ticks: out, seen: nextSeen };
}
