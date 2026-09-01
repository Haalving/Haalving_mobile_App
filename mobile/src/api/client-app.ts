import { useQuery, type UseQueryResult } from '@tanstack/react-query';

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
   * C1c STUB — the client API does not serve a streak yet. The Today band draws
   * the streak card's box today and reads 0; when this field arrives the count and
   * the lit flames follow it with no layout change. See docs/pixel/TODO.md
   * "needs API field". `days` is the consecutive kept-day count; `kept` is the last
   * seven cycle-days, oldest first, ending on today.
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
   * C1c STUB — the mood recorded for this cycle-day, or null when none is set. The
   * arrival band draws its box today and shows the unanswered state; when this
   * field arrives the face and line follow the mood. Not served yet — see
   * docs/pixel/TODO.md "needs API field".
   */
  arrival?: { mood: string | null };
  /**
   * C1c STUB — the day's prescribed morning film, or null. The play mark rides the
   * band's right seat, present but inert, until this arrives. Not served yet.
   */
  film?: { name: string; url?: string } | null;
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
