import { z } from 'zod';

import { AUDIENCE_MODES, BROADCAST_KINDS, FEED_LENSES } from '../community.js';

/**
 * Community — the bodies the six sections accept.
 *
 * These schemas assert SHAPE and the two things that are properties of the
 * REQUEST rather than of the record: that a game day's correct answer indexes
 * into its own options, and that an announcement names one audience mode rather
 * than several. Everything else — whether the caller may author here, whether a
 * post may be attributed to that person, whether this is the last gathering and
 * therefore may not be deleted, whether an audience reaches anybody — is decided
 * in `community.service.ts`, because each of those is a question about the world
 * rather than about the body.
 *
 * MEMBER STATE HAS NO SCHEMA HERE, and that is the point. There is no body in
 * this file that sets `going`, `joined`, a like, a comment or an answer: this
 * console reads those and never writes them (console-community.js:24), so the
 * API it drives offers no way to.
 */

/* ------------------------------------------------------------- small parts */

const title = z.string().trim().min(1).max(200);
const line = z.string().trim().min(1).max(400);
/** "one paragraph per line" — the sheets parse a textarea into an array. */
const paragraphs = z.array(z.string().trim().min(1).max(2000)).max(20).default([]);
const lines = z.array(line).max(40).default([]);

/**
 * The two pair lists, each parsed from a textarea of "left | right" lines.
 *
 * They keep the demo's own key names rather than a shared `{left,right}`: the
 * client's gathering page reads `agenda[i].t` and its challenge page reads
 * `arc[i].k`, and renaming a key here would mean the port authored content those
 * two pages cannot render.
 */
const agendaLines = z
  .array(z.object({ t: z.string().trim().max(120), v: z.string().trim().max(600) }))
  .max(40)
  .default([]);

const arcLines = z
  .array(z.object({ k: z.string().trim().max(120), v: z.string().trim().max(600) }))
  .max(40)
  .default([]);

/* ------------------------------------------------------------- gatherings */

/**
 * A gathering, whole.
 *
 * There is no `img` field, and there is no `going`. The first because the sheet
 * asks for no picture and the service supplies the shipped default; the second
 * because who is enrolled is member state and this screen has never written it.
 */
export const gatheringSchema = z.object({
  title,
  when: z.string().trim().max(120).default(''),
  where: z.string().trim().max(160).default(''),
  /** Optional in the sheet, and the sheet DELETES the key when it is blank. */
  host: z.string().trim().max(160).nullish(),
  spots: z.string().trim().max(160).nullish(),
  desc: z.string().trim().max(2000).default(''),
  about: paragraphs,
  agenda: agendaLines,
  bring: lines,
});
export type GatheringInput = z.infer<typeof gatheringSchema>;

/* ------------------------------------------------------------- challenges */

export const challengeSchema = z.object({
  title,
  /** `Number(...) || 1` in the sheet — a challenge of zero days is not one. */
  days: z.number().int().min(1).max(365),
  host: z.string().trim().max(160).nullish(),
  stake: z.string().trim().max(200).nullish(),
  desc: z.string().trim().max(2000).default(''),
  about: paragraphs,
  how: lines,
  arc: arcLines,
});
export type ChallengeInput = z.infer<typeof challengeSchema>;

/* -------------------------------------------------------------- game days */

/**
 * One question of the Health Games book.
 *
 * `ans` INDEXES INTO `opts`, and that is checked here because both halves are in
 * the body — the console's own sheet does `Number(value) || 0` with no bound at
 * all, so a typed 7 against three options silently marks a question no answer can
 * ever get right. It is the one rule in this file the demo does not have.
 */
export const gameQuestionSchema = z
  .object({
    q: z.string().trim().min(1).max(400),
    opts: z.array(z.string().trim().min(1).max(200)).min(2).max(8),
    ans: z.number().int().min(0),
    why: z.string().trim().max(600).default(''),
  })
  .refine((v) => v.ans < v.opts.length, {
    message: 'The correct option has to be one of the options.',
    path: ['ans'],
  });

/**
 * A game day, whole.
 *
 * `date` is FREE TEXT ('3 Aug') because the demo's is: the book is read as a row
 * of labelled days, and flattening it onto a DateTime would force a label to
 * carry a year nobody wrote. Five questions is the book's shape rather than a
 * rule — the sheet advises it and the star row is drawn for five — so the floor
 * here is one and the cap is generous.
 */
export const gameDaySchema = z.object({
  label: z.string().trim().min(1).max(60),
  date: z.string().trim().max(60).default(''),
  qs: z.array(gameQuestionSchema).min(1).max(20),
});
export type GameDayInput = z.infer<typeof gameDaySchema>;

/* ------------------------------------------------------------------- feed */

export const feedLensEnum = z.enum(FEED_LENSES);

export const feedQuery = z.object({
  lens: feedLensEnum.optional(),
});
export type FeedQuery = z.infer<typeof feedQuery>;

/**
 * A post from this console.
 *
 * `by` is an author id — `haalving` for the house account, or a staff user's id.
 * WHICH ids are allowed is the service's call, not this schema's: on a new post
 * the answer is "the house or any non-client staff member", and on an edit it
 * also includes whoever already wrote it, and neither of those can be known from
 * the body alone.
 *
 * There is no `kind`, no `img` and no `quiz`. New posts from here are text posts;
 * editing an existing one changes its author and its caption and nothing else, so
 * a photo or a game keeps its media when its caption is corrected
 * (console-community.js:42).
 */
export const postSchema = z.object({
  by: z.string().trim().min(1).max(200),
  caption: z.string().trim().min(1).max(2000),
});
export type PostInput = z.infer<typeof postSchema>;

/**
 * Moderation — a THIRD category beside content and member state: staff action on
 * somebody else's words (console-community.js:496).
 *
 * One switch per request, because the two interlock: pinning releases whatever is
 * pinned now and clears `hidden`, hiding clears `pinned`. A body carrying both at
 * once would have to state which of those wins.
 */
export const moderatePostSchema = z
  .object({
    pinned: z.boolean().optional(),
    hidden: z.boolean().optional(),
  })
  .refine((v) => (v.pinned === undefined) !== (v.hidden === undefined), {
    message: 'Pin or hide — one switch at a time.',
  });
export type ModeratePostInput = z.infer<typeof moderatePostSchema>;

/* ------------------------------------------------------------------ zones */

/**
 * A zone — a private space members keep on the Haalving Zone.
 *
 * `memberIds` are CLIENTS, and the service checks each one is in the community
 * circle: the demo's picker draws from that circle so the two never offer
 * different people, and a body is not a picker.
 *
 * There is no `createdBy`: a console-made zone is created BY the house account,
 * never by the acting admin — this console has never posted as a client and does
 * not start by minting a space in one's name.
 */
export const zoneSchema = z.object({
  name: z.string().trim().min(1).max(120),
  memberIds: z.array(z.string().min(1).max(200)).min(1).max(200),
});
export type ZoneInput = z.infer<typeof zoneSchema>;

/* ---------------------------------------------------------- announcements */

export const broadcastKindEnum = z.enum(BROADCAST_KINDS);
export const audienceModeEnum = z.enum(AUDIENCE_MODES);

/**
 * WHO GETS IT.
 *
 * One mode, and the lists belonging to the other three are simply ignored — the
 * service reads only the list its mode names. That is deliberate: the demo keeps
 * all four lists alive on one draft object so switching modes and switching back
 * does not lose what was already picked, and a schema that rejected the leftovers
 * would make the composer's Back button lose them.
 */
export const audienceSchema = z.object({
  mode: audienceModeEnum,
  plans: z.array(z.string().min(1).max(40)).max(10).default([]),
  staffIds: z.array(z.string().min(1).max(200)).max(200).default([]),
  clientIds: z.array(z.string().min(1).max(200)).max(500).default([]),
});
export type AudienceInput = z.infer<typeof audienceSchema>;

/** The composer's live count, asked before anything is sent. */
export const reachSchema = z.object({
  kind: broadcastKindEnum,
  audience: audienceSchema,
});
export type ReachInput = z.infer<typeof reachSchema>;

/**
 * Sending one.
 *
 * `text` is required and `title` is not, exactly as the composer's own guard
 * reads ("Write the message first"). `img` must be one of the shipped house
 * pictures and `link` must be a route the live content actually offers; both are
 * checked in the service against lists that change as content does.
 *
 * There is no `sent` and no `audienceLabel`. Both are STAMPED by the send —
 * counts recorded when an announcement goes out and never recalculated, so a
 * client changing their setting next week cannot rewrite what was delivered.
 */
export const sendBroadcastSchema = z.object({
  kind: broadcastKindEnum,
  title: z.string().trim().max(200).default(''),
  text: z.string().trim().min(1, 'Write the message first.').max(4000),
  img: z.string().trim().max(300).default(''),
  /** A route from the live link menu, or nothing. The label is not the caller's. */
  link: z.string().trim().max(300).nullish(),
  audience: audienceSchema,
});
export type SendBroadcastInput = z.infer<typeof sendBroadcastSchema>;
