/**
 * Community — the pure vocabulary the console, the API and the tests all read.
 *
 * The one idea this whole module is built around, stated once here because every
 * file below it depends on it: CONTENT and MEMBER STATE are different things.
 * A gathering's title, when, where and agenda are content — the console owns
 * them. Whether a client is going, has joined, has answered a question or has
 * liked a post is member state — the console only ever READS it, for the trailing
 * count pill, and never writes it (console-community.js:24).
 *
 * Everything here is a list or a rule that more than one caller asks about.
 * Nothing here touches a database or a request.
 */

/* ------------------------------------------------------------ the six tabs */

/**
 * The six sections, IN THE VIEW'S OWN ORDER (console-community.js:56).
 *
 * They mirror the CLIENT's own structure rather than inventing a second one —
 * the view's header draws the mapping out arrow by arrow — which is why
 * `announce` sits at the end: it is the one OUTBOUND tab, and it writes nothing
 * the other five write.
 */
export const COMMUNITY_SECTIONS = [
  'gatherings',
  'challenges',
  'quiz',
  'feed',
  'zones',
  'announce',
] as const;

export type CommunitySection = (typeof COMMUNITY_SECTIONS)[number];

/** The view's own tab labels, verbatim. */
export const COMMUNITY_SECTION_LABELS: Record<CommunitySection, string> = {
  gatherings: 'Gatherings',
  challenges: 'Challenges',
  quiz: 'Game days',
  feed: 'Feed',
  zones: 'Zones',
  announce: 'Announcements',
};

/**
 * `posts` was the Feed tab's key before the Haalving Zone existed
 * (console-community.js:65). The console's route alias rewrites the old page, but
 * an old link's section word still says `posts` — mapped rather than 404'd, and
 * mapped HERE rather than in the console alone, so a bookmark works against the
 * API too.
 */
export const SECTION_ALIAS: Record<string, CommunitySection> = { posts: 'feed' };

export function sectionOf(word: string | undefined): CommunitySection | null {
  if (!word) return null;
  const want = SECTION_ALIAS[word] ?? word;
  return (COMMUNITY_SECTIONS as readonly string[]).includes(want)
    ? (want as CommunitySection)
    : null;
}

/* --------------------------------------------------------------- the floor */

/**
 * The two collections that may never be emptied.
 *
 * The client pages index these unguarded: `client-tribe.js`'s heal() reads
 * `events[0].about` and `client-hive.js`'s today() reads `quizDays[0].qs` with no
 * length check (console-community.js:1096). Deleting the last gathering or the
 * last game day therefore blanks two client pages for everybody — so the last
 * survivor in each is a FLOOR, refused rather than merely confirmed. Challenges
 * and posts render fine empty and keep unrestricted delete.
 *
 * The demo enforces this in its delete sheet. Here it is the rule, because a
 * sheet is a hint and an API is not.
 */
export const FLOOR_SECTIONS = ['gatherings', 'quiz'] as const;

export function hasFloor(section: CommunitySection): boolean {
  return (FLOOR_SECTIONS as readonly string[]).includes(section);
}

/** Would deleting one from a collection of `count` cross the floor? */
export function atFloor(section: CommunitySection, count: number): boolean {
  return hasFloor(section) && count <= 1;
}

/* ---------------------------------------------------------------- the feed */

/** The four post kinds a canvas carries (`KIND_LABEL`, console-community.js:436). */
export const POST_KINDS = ['text', 'photo', 'short', 'quiz'] as const;
export type PostKind = (typeof POST_KINDS)[number];

export const POST_KIND_LABELS: Record<PostKind, string> = {
  text: 'Text',
  photo: 'Photo',
  short: 'Short',
  quiz: 'Game',
};

/**
 * The house account's id ON THE WIRE.
 *
 * `HV.whoName` resolves it to "HAALVING" without reading a user record, because
 * there is no such record — the house is the organisation speaking, not a person.
 * The port stores it as a NULL author for the same reason it stores `u-ai` as a
 * null rater; this constant is only the word the API accepts and hands back in
 * its place, so no caller has to know that.
 */
export const HOUSE_AUTHOR_ID = 'haalving';
export const HOUSE_AUTHOR_NAME = 'HAALVING';

/** The three lenses over the Common Canvas (console-community.js:457). */
export const FEED_LENSES = ['all', 'pinned', 'hidden'] as const;
export type FeedLens = (typeof FEED_LENSES)[number];

/**
 * The seed imagery a console-authored gathering or challenge falls back to.
 *
 * Neither sheet asks for an image, and the client honeycomb and feed read `img`
 * with no fallback of their own — so an unset one renders
 * `<img src="undefined">` (console-community.js:71). Both files are already
 * shipped and precached.
 */
export const DEFAULT_GATHERING_IMG = 'img/onboard/bz-live.webp';
export const DEFAULT_CHALLENGE_IMG = 'img/onboard/fitness.webp';

/* ----------------------------------------------------------- announcements */

/**
 * The two kinds, and the difference is a PROMISE TO THE CLIENT (core.js:1105):
 *   ANNOUNCEMENT — marketing. Offers, events, news. The client may silence it.
 *   NOTICE       — operational. Schedule, safety. The opt-out does not reach it.
 */
export const BROADCAST_KINDS = ['announcement', 'notice'] as const;
export type BroadcastKind = (typeof BROADCAST_KINDS)[number];

/**
 * One spec shape, four modes, NEVER combined — a single mode is what keeps the
 * recipient count unambiguous and the composer a radio group (core.js:1123).
 */
export const AUDIENCE_MODES = ['all', 'plan', 'coach', 'pick'] as const;
export type AudienceMode = (typeof AUDIENCE_MODES)[number];

export interface AudienceSpec {
  mode: AudienceMode;
  plans?: string[];
  staffIds?: string[];
  clientIds?: string[];
}

/**
 * The only pictures an announcement may carry.
 *
 * House imagery, and only what the service worker precaches — an arbitrary src
 * is a broken tile the moment the client is offline (console-community.js:744).
 * The demo makes that true by offering a fixed chip row; here it is CHECKED, so a
 * body naming any other path is refused rather than trusted.
 */
export const BROADCAST_IMAGES = [
  { src: 'img/onboard/bz-live.webp', label: 'Blue Zone life' },
  { src: 'img/onboard/bz-table.webp', label: 'The table' },
  { src: 'img/onboard/culture.webp', label: 'Nutrition' },
  { src: 'img/onboard/nutrition.webp', label: 'On the plate' },
  { src: 'img/onboard/fitness.webp', label: 'Fitness' },
  { src: 'img/onboard/yoga.webp', label: 'Yoga' },
  /* the file keeps the frozen key; the operator reads the display name */
  { src: 'img/onboard/mindspace.webp', label: 'Mind Wellness' },
] as const;

export function isBroadcastImage(src: string): boolean {
  return BROADCAST_IMAGES.some((p) => p.src === src);
}

/**
 * The fixed half of the deep-link menu (`HV.bcLinkTargets`, core.js:1166). The
 * per-gathering and per-challenge routes are appended by the service from the
 * content that actually exists, so a broadcast can never point at a gathering
 * somebody deleted last week.
 *
 * ZONES ARE DELIBERATELY ABSENT, and that is a security rule rather than an
 * omission: the client's zone page bounces on a zone that does not exist and
 * never on a non-member, so a broadcast zone link would open five people's
 * private canvas to whoever received it.
 */
export const STANDING_LINK_TARGETS = [
  { route: '#/tribe', label: 'Community hub' },
  { route: '#/tribe/events', label: 'All gatherings' },
  { route: '#/tribe/challenges', label: 'All challenges' },
  { route: '#/tribe/quiz', label: 'Health Games' },
  { route: '#/tribe-classic', label: 'Haalving Zone' },
] as const;

/** The label every announcement's link carries. The composer offers no other. */
export const LINK_LABEL = 'See in Community';

/** What the confirm bar shows, and what the send then stamps. */
export interface Reach {
  targeted: number;
  delivered: number;
  muted: number;
}

/**
 * How many of an audience would actually receive this kind — the port of
 * `HV.announceReach` (core.js:1156).
 *
 * ONE FUNCTION FEEDS THE CONFIRM BAR AND THE SEND, so the number the operator
 * agreed to cannot disagree with what actually went out.
 */
export function reachOf(targeted: string[], mutedIds: string[], kind: BroadcastKind): Reach {
  const muted = kind === 'notice' ? 0 : targeted.filter((id) => mutedIds.includes(id)).length;
  return { targeted: targeted.length, delivered: targeted.length - muted, muted };
}
