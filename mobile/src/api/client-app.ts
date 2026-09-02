import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api } from '@/api/client';
import { orFixture } from '@/api/fixtures';
import { trackersFixture } from '@/api/fixtures/trackers';

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

export type ClientMe = {
  id: string;
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

export type Meal = {
  id: string;
  slot: string;
  capturedAt: string;
  photo: string | null;
  dishes: unknown;
  fullness: number | null;
  /** null through observation - nobody has rated anything yet, and that is rule 3 */
  stars: number | null;
  note: string | null;
};

export type Today = {
  observation: boolean;
  date: string;
  cycle: number;
  day: number;
  sessions: Session[];
  meals: Meal[];
  /**
   * The mood recorded for this cycle-day, or null when none is set — the arrival
   * band draws the answered face or the unanswered state from it.
   */
  arrival?: { mood: string | null };
  /**
   * C1c STUB — the day's prescribed morning film, or null. The play mark rides the
   * band's right seat, present but inert, until this arrives. Not served yet.
   */
  film?: { name: string; url?: string } | null;
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

/** The tracker hub. Falls back to the fixture until `GET /client/trackers` ships. */
export function useTrackers(): UseQueryResult<Trackers> {
  return useQuery({
    queryKey: ['client', 'trackers'] as const,
    queryFn: () => orFixture(() => api.get<Trackers>('/client/trackers'), trackersFixture),
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
