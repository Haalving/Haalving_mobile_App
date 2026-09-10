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

/**
 * A coach in the client's pod, for one pillar.
 *
 * THE NAME IS NESTED UNDER `coach`, and it is worth saying why, because this type
 * used to declare a flat `name` that the server has never sent. Nothing failed
 * loudly: `seat.name` was `undefined`, every reader had a `?? ''` or a fallback
 * behind it, and the screens quietly printed "your dietitian" and blank avatars
 * instead of "Sneha M." Read the name through `seatName` rather than reaching in.
 */
export type PodSeat = {
  seat: string;
  coach: { id: string; name: string; role: string } | null;
  /** true while a leave cover is standing in — the name above is the COVER's. */
  covering: boolean;
};

/** The person in a seat, "Sneha M.", or null when the seat is empty. */
export function seatName(seat: PodSeat | undefined | null): string | null {
  return seat?.coach?.name?.trim() || null;
}

/** Just "Sneha" — how a client refers to their own coach. */
export function seatFirstName(seat: PodSeat | undefined | null): string | null {
  return seatName(seat)?.split(/\s+/)[0] || null;
}

/** Where somebody is on the twelve-step rail, while they are not a client yet. */
export type OnboardingStep = {
  n: number;
  label: string;
  phase: string;
  state: 'done' | 'now' | 'next';
};

export type Onboarding = {
  /** one-based, as the person reads it: "step 1 of 12" */
  step: number;
  total: number;
  label: string;
  phase: string;
  arrivedAt: string;
  /* the fields below arrived later; optional so an older server still draws */
  /** the whole rail, with the stage you stand in marked */
  steps?: OnboardingStep[];
  /** what you typed into the sign-up deck — empty lists and nulls where nothing was said */
  told?: {
    goals: string[];
    conditions: string[];
    fitness: string | null;
    track: string | null;
    note: string | null;
  };
  /** what has been measured — null until it has */
  measured?: {
    heightCm: number | null;
    weightKg: number | null;
    fat: number | null;
    muscle: number | null;
    protein: number | null;
    source: string | null;
  };
  contact?: { phone: string | null; email: string | null };
  welcomed?: boolean;
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
  /**
   * WHAT THE SESSION IS MADE OF — one row per move, each with its picture.
   *
   * The same shape a plate row has, because a move and a dish are described by
   * the same code on the server (`describeSlot`), and the screen draws them with
   * the same illustrated row.
   */
  moves?: Meal[];
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
  /** "5 h ago" — the API's own wording, so the app never reimplements it */
  ago?: string | null;
  photo: string | null;
  /** what was actually on the plate; empty for a slot nobody has logged */
  dishes: string[];
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
  /** the three pages behind a tap; absent on a plate nobody prescribed */
  detail?: SlotDetail;
};

/** One food in the option the client is being asked to eat. */
export type SlotItem = {
  id: string;
  name: string;
  /** already multiplied by the option's ×N — "2 pc", "1 bowl" */
  portion: string;
  kcal: number | null;
  protein: number | null;
  image: string | null;
};

/**
 * What a slot answers when it is opened: how it is made, what goes in it, and
 * what may be eaten instead. Every line comes from the catalogue, so the sheet
 * cannot describe a dish the plan is not actually prescribing.
 */
export type SlotDetail = {
  /** the lead food's method, one line per step */
  how: string[];
  video: string | null;
  items: SlotItem[];
  /** the other options, each already joined: "Plain dosa + Coconut chutney" */
  alternatives: string[];
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
  /** the programme's length, from the server's configuration */
  cycleDays?: number;
  /** this day belongs to the queued NEXT cycle — nothing on it is live yet */
  preview?: boolean;
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
  /** null while onboarding — there is no client record yet */
  id: string | null;
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
  /** present while onboarding — the step the person stands on */
  onboarding?: Onboarding;
};

/* ------------------------------------------------------------------- hooks */

/**
 * The keys. One place, because a key typed twice is a cache that never
 * invalidates and a screen that quietly shows yesterday.
 */
const clientKeys = {
  me: ['client', 'me'] as const,
  today: (day?: string) => ['client', 'today', day ?? 'today'] as const,
  profile: ['client', 'profile'] as const,
};

export function useMe(): UseQueryResult<ClientMe> {
  return useQuery({ queryKey: clientKeys.me, queryFn: () => api.get<ClientMe>('/client/me'), refetchOnMount: 'always' });
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
    staleTime: 5_000,
    refetchOnMount: 'always',
    /* only the live day polls — a browsed day is a glance */
    refetchInterval: day ? false : 30_000,
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
  /** the plate's picture, ready to load — signed for an R2 object */
  photo?: string | null;
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
/** What the three honeycomb doors say about themselves. */
export interface Hive {
  games: { dayId: string | null; label: string | null; total: number; answered: number };
  events: { total: number; gatherings: number; challenges: number };
  zone: { posts: number; zones: number };
}

/** One read for the whole hub — see the service for why it is not three. */
export function useHive(): UseQueryResult<Hive, Error> {
  return useQuery({
    queryKey: ['client', 'hive'],
    queryFn: () => api.get<Hive>('/client/community/hive'),
  });
}

/**
 * The client ticks a session off.
 *
 * Writes the same completion the team reads — see `ClientSessionDone`. The plan
 * is invalidated rather than patched locally, because the calendar ring, the
 * day's status and the level-up counts are all derived from that one row.
 */
/**
 * The client asking for their next cycle's plan.
 *
 * Offered only on the last two days: the team is told regardless on those days,
 * so this carries the fact that the CLIENT asked — a different thing, and worth
 * saying in the room where they talk.
 */
export function useAskForNextPlan(): UseMutationResult<
  { asked: boolean; cycle: number },
  Error,
  { note?: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b) => api.post<{ asked: boolean; cycle: number }>('/client/plan/next', b),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['client', 'circle'] });
      void qc.invalidateQueries({ queryKey: ['client', 'plan'] });
    },
  });
}

export function useMarkSessionDone(): UseMutationResult<
  { done: boolean; day: number; pillar: string },
  Error,
  { day: number; pillar: string; moveIdx?: number }
> {
  const qc = useQueryClient();
  return useMutation({
    /* `moveIdx` omitted means the session itself — the server reads that as -1 */
    mutationFn: (b) => api.post<{ done: boolean; day: number; pillar: string }>('/client/plan/sessions/done', b),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['client', 'plan'] });
      void qc.invalidateQueries({ queryKey: ['client', 'today'] });
    },
  });
}

/** A row on one of the hive's two reference shelves. */
export interface ShelfItem {
  id: string;
  shelf: string;
  icon: string;
  name: string;
  note: string;
  /** Read | Film | Listen — the learning shelf only. */
  kind: string | null;
  href: string | null;
}

/** Both shelves in one read — two tiles on the same hub. */
export function useShelves(): UseQueryResult<{ partners: ShelfItem[]; learn: ShelfItem[] }, Error> {
  return useQuery({
    queryKey: ['client', 'shelves'],
    queryFn: () => api.get<{ partners: ShelfItem[]; learn: ShelfItem[] }>('/client/community/shelves'),
  });
}

export interface EventCard {
  id: string;
  title: string;
  when: string;
  where: string;
  host: string | null;
  spots: number;
  desc: string;
  about: string[];
  img: string;
  going: number;
  /** the caller's own state, so a button never lies about it */
  joined: boolean;
}

export interface ChallengeCard {
  id: string;
  title: string;
  days: number;
  host: string | null;
  stake: string | null;
  desc: string;
  about: string[];
  how: string[];
  img: string;
  going: number;
  joined: boolean;
}

/** Both lanes behind one door — the hexagon counts them together. */
export function useEvents(): UseQueryResult<{ events: EventCard[]; challenges: ChallengeCard[] }, Error> {
  return useQuery({
    queryKey: ['client', 'events'],
    queryFn: () => api.get<{ events: EventCard[]; challenges: ChallengeCard[] }>('/client/community/events'),
  });
}

export function useJoinEvent(): UseMutationResult<{ joined: boolean; going: number }, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.post<{ joined: boolean; going: number }>(`/client/community/events/${id}/join`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['client', 'events'] });
      void qc.invalidateQueries({ queryKey: ['client', 'hive'] });
    },
  });
}

export function useJoinChallenge(): UseMutationResult<{ joined: boolean; going: number }, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.post<{ joined: boolean; going: number }>(`/client/community/challenges/${id}/join`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['client', 'events'] });
      void qc.invalidateQueries({ queryKey: ['client', 'hive'] });
    },
  });
}

export interface GameQuestion {
  id: string;
  prompt: string;
  options: string[];
  /** null until answered; then what they chose */
  chose: number | null;
  /** the key — sent ONLY once answered, so it is never in the payload early */
  answer: number | null;
  why: string | null;
}

export interface GameDay {
  id: string;
  label: string;
  date: string;
  questions: GameQuestion[];
}

export function useGames(): UseQueryResult<GameDay[], Error> {
  return useQuery({
    queryKey: ['client', 'games'],
    queryFn: () => api.get<GameDay[]>('/client/community/games'),
  });
}

export function useAnswerGame(): UseMutationResult<
  { chose: number; answer: number; why: string; correct: boolean },
  Error,
  { questionId: string; chose: number }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a) =>
      api.post<{ chose: number; answer: number; why: string; correct: boolean }>(
        `/client/community/games/${a.questionId}/answer`,
        { chose: a.chose },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['client', 'games'] });
      void qc.invalidateQueries({ queryKey: ['client', 'hive'] });
    },
  });
}

/** A row in the client's own Records Vault. */
export interface ClientDoc {
  id: string;
  title: string;
  kind: string;
  uploadedOn: string;
  signed: boolean;
  fileName: string | null;
  sizeBytes: number | null;
  /** A short-lived signed URL, or null for a summary with no file attached. */
  url: string | null;
}
/**
 * Record a file that is ALREADY in object storage.
 *
 * Takes a key, never bytes — `uploads.ts` has put the file there before this is
 * called, so a row is never written for a file that failed to land.
 */
export function useAddDocument(): UseMutationResult<
  { id: string; title: string },
  Error,
  { title: string; kind: string; key: string; fileName: string; mime: string; bytes: number }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api.post<{ id: string; title: string }>('/client/documents', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['client', 'documents'] });
      void qc.invalidateQueries({ queryKey: ['client', 'today'] });
    },
  });
}

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

/** One scheduled session on a day: what it is, when, with whom, where it stands. */
export type PlanDayItem = {
  pillar: string;
  label: string;
  time: string;
  /** the booking behind it, when there is one */
  taskId?: string | null;
  /**
   * WHAT THE SESSION IS — the moves the template prescribes, described exactly
   * the way a meal is. Empty when a pillar has nothing assigned.
   */
  moves?: PlanMove[];
  /** the coach's name, already resolved — the app holds no staff directory */
  staff: string | null;
  status: string;
  /** the SESSION's own tick, as distinct from any one move's */
  done?: boolean;
};

/**
 * One move inside a session — a plate row, plus the two things a client acts on.
 *
 * `idx` is the move's identity: the app sends back the number the server drew, so
 * a tick lands on the row the client actually pressed.
 */
export type PlanMove = Meal & { idx?: number; done?: boolean };

export type PlanDay = {
  day: number;
  date: string;
  rest?: boolean;
  review?: boolean;
  meeting?: boolean;
  today?: boolean;
  past?: boolean;
  flag?: string;
  marks: { pillar: string; status: 'ok' | 'miss' | 'up'; label?: string }[];
  /** The real date, so the day's plate can be fetched from `/client/today`. */
  iso: string;
  /** The day's own sessions — what the grid summarises as one ring per pillar. */
  items: PlanDayItem[];
  /** The plate runs every day, rest days included. */
  plate?: boolean;
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
/** A plan already signed for the next cycle — the answer to the day-13 question. */
export type PlanNext = { pillar: string; name: string; level: number; track: string; forCycle: number | null };
/** One figure in "Your progress this cycle" — label, value, and what it counts. */
export type PlanProgress = { k: string; v: string; sub: string };
export type Plan = {
  cycle: number;
  day: number;
  sub: string;
  goal: string;
  levels: Record<string, number>;
  calendar: PlanDay[];
  tiles: PlanTile[];
  /** the programme's length, from the server's configuration — never typed into a screen */
  cycleDays?: number;
  /** "Your progress this cycle", per pillar key — two figures each. */
  progress?: Record<string, PlanProgress[]>;
  /** what is signed and waiting for next cycle, per pillar — empty when nothing is */
  next?: PlanNext[];
  /**
   * NEXT CYCLE, AS IT WILL BE — the queued templates run through the same
   * calendar engine. Present only when something is queued. Days carry no
   * `plate` (it has not started) and nothing is today, past or done.
   */
  nextCalendar?: PlanDay[];
  nextCycle?: {
    cycle: number;
    from: string;
    /** the queued templates' levels — next cycle's own, not this cycle's */
    levels?: Record<string, number>;
    /** pillars with nothing queued: the app prints "Not allocated" for them */
    unallocated?: string[];
  };
  daily: PlanDaily[];
  ledger: PlanLedgerRow[];
  levelup: PlanLevelup[];
};

/** The plan hub — served for real by `GET /client/plan` (F1b). */
export function usePlan(): UseQueryResult<Plan> {
  return useQuery({
    queryKey: ['client', 'plan'] as const,
    queryFn: () => api.get<Plan>('/client/plan'),
    /* the plan is what the team edits; the phone must not sit on a stale one */
    staleTime: 5_000,
    refetchOnMount: 'always',
    refetchInterval: 30_000,
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
/** A marketplace coach for one pillar. `mine` = the client's current coach there. */
export type Coach = {
  id: string;
  name: string;
  title: string;
  /* null when nobody has written the listing yet — the card prints a dash
     rather than claiming a coach is rated 0.0 and costs nothing */
  years: number | null;
  rating: number | null;
  /** counted from real pod seats, so 0 here is a true zero */
  clients: number;
  price: number | null;
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

/* ------------------------------------------------- the room's info sheet */

/** One person in the room — a seat holder, or the client themselves. */
export type CircleMember = {
  id: string;
  name: string;
  role: string;
  roleTitle: string;
  seat: string;
  seatLabel: string;
  covering: boolean;
  you: boolean;
};
export type CircleInfo = {
  plan: string;
  onboarding: boolean;
  members: CircleMember[];
  media: { id: string; mealId: string; slot: string; photo: string | null; at: string; ago: string }[];
  links: { url: string; who: string | null; at: string; ago: string }[];
  docs: { id: string; text: string; who: string | null; at: string; ago: string }[];
};

/** Who is in the room and what has been shared in it — `GET /client/circle/info`. */
export function useCircleInfo(): UseQueryResult<CircleInfo> {
  return useQuery({
    queryKey: ['client', 'circle', 'info'] as const,
    queryFn: () => api.get<CircleInfo>('/client/circle/info'),
    staleTime: 15_000,
    refetchOnMount: 'always',
  });
}
