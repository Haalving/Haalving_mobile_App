import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api } from '@/api/client';

/**
 * THE CLIENT SURFACE, typed once.
 *
 * These shapes mirror `backend/src/services/client-app/index.ts` exactly. They are
 * restated here rather than imported from `@haalving/shared` because they are the
 * SERIALISED shape, not the domain one: the five rules in
 * `services/client-app/rules.ts` remove fields on the way out, and a type that
 * still carried `aiStars` would invite a screen to read a field the server has
 * already decided this client may not see.
 *
 * NOTHING IS FILTERED HERE. If a field must not reach this client it is absent
 * from the payload — the phone is not a second gate, and adding one would hide
 * the day a rule stops working.
 */

/** A coach in the client's pod, for one pillar. */
export type PodSeat = {
  seat: string;
  name: string;
  /** true while a leave cover is standing in — the name above is the COVER's. */
  covering: boolean;
};

/** Where somebody is on the twelve-step rail, while they are not a client yet. */
export type Onboarding = {
  /** one-based, as the person reads it: "step 1 of 12" */
  step: number;
  total: number;
  label: string;
  phase: string;
  arrivedAt: string;
};

export type ClientMe = {
  /**
   * NULL UNTIL THEY ARE ONBOARDED. Sign-up mints a login and an arrival; the
   * client record is minted twelve steps later, and this is null in between.
   */
  id: string | null;
  /**
   * THE GATE EVERY SCREEN READS. False means the person has an account and is on
   * the onboarding rail: every tab is reachable, and what is inside them is not
   * there yet — because there genuinely is no plan, no pod and no cycle until the
   * team finishes the rail.
   */
  onboarded: boolean;
  /** present exactly while `onboarded` is false */
  onboarding?: Onboarding;
  name: string;
  plan: string;
  cycle: number;
  day: number;
  /** days 1-5, or the flag set by hand: a different Today, not a filtered one */
  observation: boolean;
  levels: Record<string, number>;
  pod: PodSeat[];
  unread: number;
  /**
   * The streak the Today band draws (F1b): `days` is the run of kept days ending
   * today, `kept` the last seven cycle-days oldest-first. Absent for observation.
   */
  streak?: { days: number; kept: boolean[] };
};

export type Session = {
  id: string;
  title: string;
  pillar: string | null;
  startMin: number | null;
  durMin: number | null;
  /** whether a room EXISTS. The link itself only arrives when the door is opened. */
  joinable: boolean;
  done: boolean;
  coach: string | null;
};

/**
 * ONE ROW OF THE DAY'S PLATE, and it is the PRESCRIPTION first.
 *
 * The plate the console publishes is what draws this list: assign a Nutrition
 * template and its day's slots (Breakfast, Mid-morning, Lunch, Dinner) arrive
 * here whether or not anything has been photographed yet. A slot fills in as the
 * day is eaten — the server matches a logged plate to its slot by name — so the
 * card reads as a schedule rather than as a history.
 *
 * `id` IS THE WHOLE STATE. Null means nothing has been photographed into this
 * slot: no capture time, no rating, and nothing to open. A row with an id is a
 * real plate in the meal queue.
 */
export type Meal = {
  /** null until a plate is photographed into this slot */
  id: string | null;
  slot: string;
  /** the template's suggested clock, "8:00"; null on an unprescribed plate */
  time: string | null;
  /** false for a plate the client logged that the template never asked for */
  planned: boolean;
  capturedAt: string | null;
  photo: string | null;
  dishes: unknown;
  /** the client's own reading of the plate, "Just right" — a word, never a number */
  fullness: string | null;
  /** null through observation - nobody has rated anything yet, and that is rule 3 */
  stars: number | null;
  note: string | null;
  /**
   * WHAT TO EAT, in the plan's own words: "Idli ×2 + Coconut chutney or Plain
   * dosa + Coconut chutney". Foods inside one option are eaten together; the
   * options are alternatives. Empty on a plate the plan never asked for.
   */
  dish: string;
  /**
   * The FIRST option's reading. Alternatives replace it, they never add to it —
   * a plate that summed them all would ask the client to eat three breakfasts.
   * Null when the foods carry no nutrients, so the row says nothing rather than
   * printing a zero against a real meal.
   */
  kcal: number | null;
  protein: number | null;
  /** the lead food's picture, as the catalogue stores it */
  image: string | null;
  /** the band this meal sits under */
  part: 'Morning' | 'Afternoon' | 'Evening';
};

/**
 * The targets line above the plate — "Everyday plate — L1 Sedentary · 1700 kcal
 * · 75 g protein a day", the same sentence the console prints on the client's
 * Plan tab, resolved by the same shared function so the two cannot disagree.
 *
 * Null in observation, and for anyone with no plan assigned: a derived target
 * would be a goal nobody set, printed over a plate that does not exist.
 */
export type PlateHead = {
  title: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
};

export type Today = {
  observation: boolean;
  date: string;
  cycle: number;
  day: number;
  sessions: Session[];
  meals: Meal[];
  /** the day's nutrition targets, or null when nothing is prescribed */
  plate?: PlateHead | null;
  /**
   * The mood recorded for this cycle-day, or null when none is set — the arrival
   * band draws the answered face or the unanswered state from it.
   */
  arrival?: { mood: string | null };
  /**
   * The day's prescribed morning film, or null — the live Motivation plan's slot
   * for this cycle-day, resolved to the film in the library. `url` is the film
   * itself (the item's video) and is null when the library holds no link yet, so
   * the play mark opens the film when there is one and stays inert otherwise.
   * Null on an observation day and when no Motivation plan is live.
   */
  film?: { id: string; name: string; url: string | null } | null;
};

/**
 * One meal, read on the meal-detail screen. `final` is present only after a
 * rating (human or AI); an observation client never carries stars. The shape of
 * `GET /client/meals/:id`.
 */
export type MealDetail = {
  id: string;
  slot: string;
  /** a display string ("5 h ago"); the server will send capturedAt to derive it */
  ago: string;
  photo: string | null;
  dishes: string[];
  fullness: string;
  protein: number;
  kcal: number;
  observation: boolean;
  /** Branch C copy when unrated and not in observation; else null */
  pendingLine: string | null;
  final: {
    stars: number;
    /** first name, or "your AI coach" */
    byName: string;
    isAI: boolean;
    voiceSec: number;
    note: string;
    rubric: { label: string; value: string }[];
  } | null;
};

/** A signed medical summary. Rule 5: nothing unsigned reaches this list. */
export type MedicalRecord = {
  id: string;
  title: string;
  kind: string;
  uploadedOn: string;
};

export type Profile = {
  id: string;
  name: string;
  code: string | null;
  designation: string | null;
  plan: string;
  cycle: number;
  day: number;
  levels: Record<string, number>;
  /** the four in the product's own order, never an object's key order */
  pillars: string[];
  health: unknown;
  heightCm: number | null;
  weightKg: number | null;
  pod: PodSeat[];
  records: MedicalRecord[];
};

/* ------------------------------------------------------------------- hooks */

/**
 * The keys. One place, because a key typed twice is a cache that never
 * invalidates and a screen that quietly shows yesterday.
 */
export const clientKeys = {
  me: ['client', 'me'] as const,
  today: (day?: string) => ['client', 'today', day ?? 'today'] as const,
  profile: ['client', 'profile'] as const,
};

export function useMe(): UseQueryResult<ClientMe> {
  return useQuery({ queryKey: clientKeys.me, queryFn: () => api.get<ClientMe>('/client/me') });
}

/**
 * One day. `day` is an ISO date; omitted means today.
 *
 * A day the client browsed to is a GLANCE, not a place they should be returned
 * to — the demo says so where it reads the route (client-today.js:472) — so the
 * day lives in screen state and never in storage.
 */
export function useToday(day?: string): UseQueryResult<Today> {
  return useQuery({
    queryKey: clientKeys.today(day),
    queryFn: () => api.get<Today>(`/client/today${day ? `?day=${day}` : ''}`),
  });
}

export function useProfile(): UseQueryResult<Profile> {
  return useQuery({ queryKey: clientKeys.profile, queryFn: () => api.get<Profile>('/client/profile') });
}

/**
 * A message in the care-circle thread. `teamonly` messages are stripped by the
 * server (rules.ts) and never appear here. The kinds the client thread actually
 * renders: a pinned `card`, a `doc` publish, a `meal` attachment (client-sent), a
 * `rating` from a coach, and plain `text`.
 */
export type CircleMessage = {
  id: string;
  kind: 'card' | 'doc' | 'meal' | 'rating' | 'text';
  /** true when the client sent it (right-hand bubble) */
  mine: boolean;
  /** "Name · Role" for a team message; null for the client's own and pinned cards */
  who: string | null;
  text: string;
  ago: string;
  /** meal attachment */
  mealId?: string;
  slot?: string;
  dishes?: string[];
  /** rating */
  stars?: number;
  voiceSec?: number;
};

export type CircleThread = {
  /** who reads this — the sub under the scene band */
  sub: string;
  /** whether older day-sessions exist (shows the "See chat history" chip) */
  hasHistory: boolean;
  /** oldest → newest; the pinned card sits first, the screen lands at the bottom */
  messages: CircleMessage[];
};

/** The care-circle thread — `GET /client/circle`, live-updated by useCircleLive. */
export function useCircle(): UseQueryResult<CircleThread> {
  return useQuery({
    queryKey: ['client', 'circle'] as const,
    queryFn: () => api.get<CircleThread>('/client/circle'),
    /* THE FALLBACK behind the live socket (see useCircleLive). If the socket is
       refused or dropped, a coach's reply still surfaces within the minute; when
       the socket is up it invalidates this query the instant a message lands, so
       the poll is a floor on freshness, not the mechanism. */
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

/* -------------------------------------------------------------- settings */

export type ToggleRow = { key: string; label: string; sub: string; on: boolean };
export type ConsentRow = { id: string; name: string; sub: string };
export type ClientSettings = {
  notif: ToggleRow[];
  announce: { on: boolean; label: string; sub: string };
  consents: ConsentRow[];
};

/** Profile settings — `GET /client/settings`. */
export function useSettings(): UseQueryResult<ClientSettings> {
  return useQuery({
    queryKey: ['client', 'settings'] as const,
    queryFn: () => api.get<ClientSettings>('/client/settings'),
  });
}

/** Flip a notification toggle or the announce opt-out — `PATCH /client/settings`. */
export function useUpdateSettings(): UseMutationResult<
  ClientSettings,
  Error,
  { notif?: Record<string, boolean>; announce?: boolean }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch) => api.patch<ClientSettings>('/client/settings', patch),
    /* the server merges and returns the whole settings object, so the cache
       becomes the truth rather than the screen's optimistic guess */
    onSuccess: (data) => qc.setQueryData(['client', 'settings'], data),
  });
}

/**
 * Write a line into the thread — `POST /client/circle`.
 *
 * IT WORKS IN BOTH STATES, because the server answers both from one route: a
 * promoted client writes into their care circle, and somebody still on the
 * onboarding rail writes to the team running it. That second case is the whole
 * point — while there is no plan yet, asking is the only thing they can do.
 */
export function useSendCircle(): UseMutationResult<unknown, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => api.post('/client/circle', { text }),
    /* the server assigns the sequence and the clock, so the thread is re-read
       rather than guessed at — an optimistic bubble here would be the app
       inventing an `ago` the server had not yet decided */
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['client', 'circle'] }),
  });
}

/**
 * Mark the care-circle thread caught up — `POST /client/circle/read`. Clears the
 * unread dot on `GET /client/me`, so `me` is refetched on success.
 */
export function useMarkCircleRead(): UseMutationResult<unknown, Error, void> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/client/circle/read'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: clientKeys.me }),
  });
}

/**
 * Open a session's room — `POST /client/sessions/:id/join`. The POST is what
 * RECORDS attendance, and the stored link comes back only when the door is opened.
 */
export function useJoinSession(): UseMutationResult<{ link: string | null }, Error, string> {
  return useMutation({
    mutationFn: (id: string) => api.post<{ link: string | null }>(`/client/sessions/${id}/join`),
  });
}

/** The four moods the arrival check-in offers, matching the server's MOOD_KEYS. */
export const MOODS = ['happy', 'sad', 'angry', 'drained'] as const;
export type Mood = (typeof MOODS)[number];

/**
 * Record this morning's arrival — `POST /client/arrival`. Keyed by cycle-day on the
 * server; the answer rides back on `GET /client/today`, so today is refetched.
 */
export function useSetArrival(): UseMutationResult<
  { mood: string; note: string | null },
  Error,
  { mood: Mood; note?: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api.post<{ mood: string; note: string | null }>('/client/arrival', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['client', 'today'] }),
  });
}

/**
 * Log a plate — `POST /client/meals`. Refetches today (the meal joins the board)
 * and the circle (a logged plate posts a card into the room).
 */
export function useCaptureMeal(): UseMutationResult<
  Meal,
  Error,
  { slot: string; fullness: string; dishes: string[]; photo?: string | null }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api.post<Meal>('/client/meals', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['client', 'today'] });
      void qc.invalidateQueries({ queryKey: ['client', 'circle'] });
    },
  });
}

/* -------------------------------------------------------------- trackers */

/** One tracker signal reading. `series` names a tk-* colour token. */
export type TrackerSignal = {
  key: string;
  icon: string;
  label: string;
  value: string;
  sub?: string;
  pct: number;
  series: string;
};
/** A Nutrient-Panel row — value against target, graded to a state. */
export type NutrientRow = { name: string; value: string; state: 'ok' | 'warn' | 'bad' };
export type Trackers = {
  signals: TrackerSignal[];
  macros: NutrientRow[];
  micros: NutrientRow[];
};

/** The tracker hub — `GET /client/trackers`. Signals are real; the nutrient panel is the next pass. */
export function useTrackers(): UseQueryResult<Trackers> {
  return useQuery({
    queryKey: ['client', 'trackers'] as const,
    queryFn: () => api.get<Trackers>('/client/trackers'),
  });
}

/** What the Quick-add sheet can write — every field optional; send only what was entered. */
export type TrackerLog = {
  /** +N glasses of water (the "+1 glass" tap sends 1) */
  waterAdd?: number;
  /** last night's sleep, in minutes */
  sleepMins?: number;
  /** today's steps so far, absolute */
  steps?: number;
  /** a fresh weigh-in, kg */
  weightKg?: number;
};

/**
 * Log a track — `POST /client/trackers`. A PARTIAL: the body carries only what was
 * entered. The server merges into the same blob the signals read and returns them
 * fresh, so the hub updates from source with no flicker; today and the profile are
 * refetched too (a glass shows on Today, a weigh-in on the profile).
 */
export function useLogTrackers(): UseMutationResult<Trackers, Error, TrackerLog> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api.post<Trackers>('/client/trackers', body),
    onSuccess: (fresh) => {
      qc.setQueryData(['client', 'trackers'], fresh);
      void qc.invalidateQueries({ queryKey: ['client', 'today'] });
      void qc.invalidateQueries({ queryKey: ['client', 'profile'] });
    },
  });
}

/* ------------------------------------------------------------------ plan */

export type PlanDay = {
  day: number;
  date: string;
  rest?: boolean;
  review?: boolean;
  meeting?: boolean;
  today?: boolean;
  past?: boolean;
  flag?: string;
  marks: { pillar: string; status: 'ok' | 'miss' | 'up' }[];
};
export type PlanLedgerRow = {
  level: string;
  target: string;
  result?: string;
  state: 'ok' | 'miss' | 'cur' | 'todo';
  vsOk?: boolean;
};
export type PlanLevelup = { key: string; title: string; bar: string; ticked: number; total: number };
export type PlanDaily = { icon: string; label: string; value: string; sub: string };
export type PlanTile = { key: string; word: string };
export type Plan = {
  cycle: number;
  day: number;
  sub: string;
  goal: string;
  levels: Record<string, number>;
  calendar: PlanDay[];
  tiles: PlanTile[];
  daily: PlanDaily[];
  ledger: PlanLedgerRow[];
  levelup: PlanLevelup[];
};

/** The plan hub — served for real by `GET /client/plan` (F1b). */
export function usePlan(): UseQueryResult<Plan> {
  return useQuery({
    queryKey: ['client', 'plan'] as const,
    queryFn: () => api.get<Plan>('/client/plan'),
  });
}


/* ------------------------------------------------------------- full plan */

/** One prescribed slot as the cycle view reads it — the same shape Today's plate uses. */
export type PlanSlot = {
  slot: string;
  time: string | null;
  dish: string;
  kcal: number | null;
  protein: number | null;
  image: string | null;
  part: 'Morning' | 'Afternoon' | 'Evening';
};

/** One session the calendar prescribes for a day. */
export type PlanItem = {
  pillar: string;
  label: string;
  time: string;
  status: string;
  booked?: boolean;
  unprescribed?: boolean;
};

export type PlanFullDay = {
  day: number;
  date: string;
  rest?: boolean;
  review?: boolean;
  meeting?: boolean;
  today?: boolean;
  items: PlanItem[];
  meals: PlanSlot[];
};

export type PlanFull = { cycle: number; day: number; days: PlanFullDay[] };

/**
 * The whole cycle, day by day — `GET /client/plan-full`.
 *
 * What the per-pillar "Full plan" opens: every day of the fortnight with what
 * that pillar prescribes on it, described by the same server-side function the
 * Today plate uses so the two views cannot name one meal differently.
 */
export function usePlanFull(): UseQueryResult<PlanFull> {
  return useQuery({
    queryKey: ['client', 'plan-full'] as const,
    queryFn: () => api.get<PlanFull>('/client/plan-full'),
  });
}

/* ------------------------------------------------------------- community */

/**
 * One published gathering. A DIFFERENT endpoint from the console's — a pending
 * gathering is absent from the answer, not merely hidden (see the route note), so
 * the app never has to filter. `agenda` is a list of {time, item} pairs; `going` is
 * the live enrolment count.
 */
export type Gathering = {
  id: string;
  title: string;
  when: string;
  where: string;
  host: string;
  /** a free-text capacity line, e.g. "24 places · kept small on purpose" */
  spots: string;
  desc: string;
  about: string;
  agenda: { time: string; item: string }[];
  bring: string;
  img: string | null;
  going: number;
};

/** The community's published gatherings — `GET /client/community/gatherings` (F4). */
export function useGatherings(): UseQueryResult<Gathering[]> {
  return useQuery({
    queryKey: ['client', 'community', 'gatherings'] as const,
    queryFn: () => api.get<Gathering[]>('/client/community/gatherings'),
  });
}

/** A marketplace coach for one pillar. `mine` = the client's current coach there. */
export type Coach = {
  id: string;
  name: string;
  title: string;
  years: number;
  rating: number;
  clients: number;
  price: number;
  spec: string[];
  line: string;
  mine: boolean;
};

/** The coach marketplace, keyed by pillar. */
export type CoachMarket = Record<string, Coach[]>;

/** The coach marketplace — `GET /client/coaches`. */
export function useCoaches(): UseQueryResult<CoachMarket> {
  return useQuery({
    queryKey: ['client', 'coaches'] as const,
    queryFn: () => api.get<CoachMarket>('/client/coaches'),
  });
}

/** One meal by id — `GET /client/meals/:id`. */
export function useMeal(id: string): UseQueryResult<MealDetail> {
  return useQuery({
    queryKey: ['client', 'meal', id] as const,
    queryFn: () => api.get<MealDetail>(`/client/meals/${id}`),
  });
}
