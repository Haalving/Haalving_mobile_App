'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AudienceSpec, BroadcastKind, FeedLens, Reach } from '@haalving/shared';

import { api } from '@/lib/api';

/**
 * Community — the console side of what clients see on their Community tab.
 *
 * ONE READ FOR THE HOST (`GET /community`) carries the six tabs, their counts and
 * the three permission flags, so the tab badge and the list it points at come from
 * one scoping expression and cannot drift apart.
 *
 * THREE GATES, NOT ONE. `canManage` authors content, `canDelete` destroys it, and
 * `canAnnounce` writes into clients' circles. They are separate on the server and
 * they stay separate here, because a role that may fix a typo is not automatically
 * a role that may delete somebody's zone.
 */

/* --------------------------------------------------------------- the host */

export interface SectionTab {
  key: string;
  label: string;
  count: number;
}

export interface CommunityMeta {
  sections: SectionTab[];
  canManage: boolean;
  canDelete: boolean;
  canAnnounce: boolean;
}

/* --------------------------------------------------------------- content */

export interface Gathering {
  id: string;
  title: string;
  when: string;
  where: string;
  host: string | null;
  spots: string | null;
  desc: string;
  about: string[];
  agenda: Array<{ t: string; v: string }>;
  bring: string[];
  img: string;
  /** How many members have enrolled. Member state — read here, never written. */
  going: number;
}

export interface Challenge {
  id: string;
  title: string;
  days: number;
  host: string | null;
  stake: string | null;
  desc: string;
  about: string[];
  how: string[];
  arc: Array<{ k: string; v: string }>;
  img: string;
  /** Entries. Member state, like `going`. */
  joined: number;
}

export interface GameQuestion {
  id?: string;
  q: string;
  opts: string[];
  /** ZERO-BASED index into `opts`. The server refuses `ans >= opts.length`. */
  ans: number;
  why: string;
  answers?: number;
}

export interface GameDay {
  id: string;
  label: string;
  date: string;
  qs: GameQuestion[];
  answered: number;
  answers: number;
}

export interface CommunityPost {
  id: string;
  /** Author id — `haalving` for the house account, or a staff/client user id. */
  by: string;
  byName: string;
  clientId: string | null;
  kind: string;
  kindLabel: string;
  caption: string;
  img: string | null;
  secs: number | null;
  quiz: unknown;
  pinned: boolean;
  hidden: boolean;
  postedAt: string;
  likes: number;
  comments: number;
}

export interface FeedData {
  lens: FeedLens;
  counts: { all: number; pinned: number; hidden: number };
  posts: CommunityPost[];
}

export interface Zone {
  id: string;
  name: string;
  createdBy: string;
  createdByName: string;
  members: Array<{ clientId: string; name: string }>;
  posts: number;
}

export interface CircleMember {
  clientId: string;
  name: string;
  plan: string;
}

export interface Broadcast {
  id: string;
  kind: BroadcastKind;
  title: string;
  text: string;
  img: string | null;
  link: string | null;
  byId: string;
  byName: string;
  sentAt: string;
  audienceLabel: string;
  /** STAMPED AT SEND and never recalculated. */
  sent: Reach;
}

export interface ComposerData {
  modes: string[];
  plans: Array<{ key: string; name: string }>;
  links: Array<{ route: string; label: string }>;
  coaches: Array<{ id: string; name: string; role: string }>;
  clients: Array<{ id: string; name: string; plan: string }>;
  canAnnounce: boolean;
}

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  roleTitle: string;
}

/* ------------------------------------------------------------------ reads */

const KEY = ['community'] as const;

export function useCommunityMeta() {
  return useQuery({ queryKey: KEY, queryFn: () => api.get<CommunityMeta>('/community') });
}

export function useGatherings() {
  return useQuery({
    queryKey: [...KEY, 'gatherings'],
    queryFn: () => api.get<Gathering[]>('/community/gatherings'),
  });
}

export function useChallenges() {
  return useQuery({
    queryKey: [...KEY, 'challenges'],
    queryFn: () => api.get<Challenge[]>('/community/challenges'),
  });
}

export function useGameDays() {
  return useQuery({
    queryKey: [...KEY, 'game-days'],
    queryFn: () => api.get<GameDay[]>('/community/game-days'),
  });
}

/**
 * The feed, keyed on the lens.
 *
 * The lens is VIEW STATE, not a route: it is a filter over one list rather than a
 * page, and pushing /community/feed/hidden into history would make Back mean
 * something the reader never asked for (console-community.js:453).
 */
export function useFeed(lens: FeedLens) {
  return useQuery({
    queryKey: [...KEY, 'feed', lens],
    queryFn: () => api.get<FeedData>(`/community/posts?lens=${lens}`),
  });
}

export function useZones() {
  return useQuery({ queryKey: [...KEY, 'zones'], queryFn: () => api.get<Zone[]>('/community/zones') });
}

export function useCircle() {
  return useQuery({
    queryKey: [...KEY, 'circle'],
    queryFn: () => api.get<CircleMember[]>('/community/circle'),
  });
}

export function useBroadcasts() {
  return useQuery({
    queryKey: [...KEY, 'announcements'],
    queryFn: () => api.get<Broadcast[]>('/community/announcements'),
  });
}

export function useComposer(enabled = true) {
  return useQuery({
    queryKey: [...KEY, 'composer'],
    queryFn: () => api.get<ComposerData>('/community/announcements/composer'),
    enabled,
  });
}

/** The author pool for a console-written post — every staff member, never a client. */
export function useStaff(enabled = true) {
  return useQuery({
    queryKey: ['people', 'staff'],
    queryFn: () => api.get<StaffMember[]>('/people/staff'),
    enabled,
  });
}

/* ----------------------------------------------------------------- writes */

function useCommunityMutation<TArgs, TResult>(
  fn: (a: TArgs) => Promise<TResult>,
  alsoHome = false,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      /* an announcement lands in every targeted client's circle, which Home
         counts — invalidating only this page would leave the two disagreeing */
      if (alsoHome) void qc.invalidateQueries({ queryKey: ['home', 'summary'] });
    },
  });
}

type GatheringBody = Omit<Gathering, 'id' | 'img' | 'going'>;
type ChallengeBody = Omit<Challenge, 'id' | 'img' | 'joined'>;

export function useSaveGathering() {
  return useCommunityMutation((a: { id?: string; body: GatheringBody }) =>
    a.id ? api.patch(`/community/gatherings/${a.id}`, a.body) : api.post('/community/gatherings', a.body),
  );
}
export function useDeleteGathering() {
  return useCommunityMutation((id: string) => api.del(`/community/gatherings/${id}`));
}

export function useSaveChallenge() {
  return useCommunityMutation((a: { id?: string; body: ChallengeBody }) =>
    a.id ? api.patch(`/community/challenges/${a.id}`, a.body) : api.post('/community/challenges', a.body),
  );
}
export function useDeleteChallenge() {
  return useCommunityMutation((id: string) => api.del(`/community/challenges/${id}`));
}

export interface GameDayBody {
  label: string;
  date: string;
  qs: Array<{ q: string; opts: string[]; ans: number; why: string }>;
}

export function useSaveGameDay() {
  return useCommunityMutation((a: { id?: string; body: GameDayBody }) =>
    a.id ? api.patch(`/community/game-days/${a.id}`, a.body) : api.post('/community/game-days', a.body),
  );
}
export function useDeleteGameDay() {
  return useCommunityMutation((id: string) => api.del(`/community/game-days/${id}`));
}

export function useSavePost() {
  return useCommunityMutation((a: { id?: string; by: string; caption: string }) =>
    a.id
      ? api.patch(`/community/posts/${a.id}`, { by: a.by, caption: a.caption })
      : api.post('/community/posts', { by: a.by, caption: a.caption }),
  );
}

/**
 * One switch per request.
 *
 * The two interlock — pinning releases whatever is pinned now and clears
 * `hidden`; hiding clears `pinned` — so a body carrying both at once would have
 * to state which of them wins. The server takes them one at a time.
 */
export function useModeratePost() {
  return useCommunityMutation((a: { id: string; pinned?: boolean; hidden?: boolean }) =>
    api.post(`/community/posts/${a.id}/moderate`, {
      ...(a.pinned !== undefined ? { pinned: a.pinned } : {}),
      ...(a.hidden !== undefined ? { hidden: a.hidden } : {}),
    }),
  );
}

export function useDeletePost() {
  return useCommunityMutation((id: string) => api.del(`/community/posts/${id}`));
}

export function useSaveZone() {
  return useCommunityMutation((a: { id?: string; name: string; memberIds: string[] }) =>
    a.id
      ? api.patch(`/community/zones/${a.id}`, { name: a.name, memberIds: a.memberIds })
      : api.post('/community/zones', { name: a.name, memberIds: a.memberIds }),
  );
}
export function useDeleteZone() {
  return useCommunityMutation((id: string) => api.del(`/community/zones/${id}`));
}

/**
 * The live reach preview.
 *
 * ASKED OF THE SERVER, never computed in the browser. One function feeds the
 * confirm bar and the send, so the number the operator agreed to cannot disagree
 * with what actually went out — and the browser does not hold the mute list that
 * would be needed to work it out anyway.
 */
export function usePreviewReach() {
  return useMutation({
    mutationFn: (a: { kind: BroadcastKind; audience: AudienceSpec }) =>
      api.post<Reach & { audienceLabel?: string }>('/community/announcements/reach', a),
  });
}

export function useSendBroadcast() {
  return useCommunityMutation(
    (a: {
      kind: BroadcastKind;
      title: string;
      text: string;
      img: string;
      link: string | null;
      audience: AudienceSpec;
    }) => api.post<Broadcast>('/community/announcements', a),
    true,
  );
}
