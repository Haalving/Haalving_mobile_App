import { Prisma } from '@prisma/client';
import type { AudienceMode, BroadcastKind as StoredKind } from '@prisma/client';
import {
  AUDIENCE_MODES,
  COMMUNITY_SECTIONS,
  COMMUNITY_SECTION_LABELS,
  DEFAULT_CHALLENGE_IMG,
  DEFAULT_GATHERING_IMG,
  HOUSE_AUTHOR_ID,
  HOUSE_AUTHOR_NAME,
  LINK_LABEL,
  PLANS,
  POST_KIND_LABELS,
  STANDING_LINK_TARGETS,
  atFloor,
  isBroadcastImage,
  plansOnSale,
  reachOf,
  type AudienceSpec,
  type BroadcastKind,
  type CommunitySection,
  type FeedLens,
  type PostKind,
  type Reach,
  type schemas,
} from '@haalving/shared';
import type { z } from 'zod';

import { prisma } from '../config/prisma.js';
import { can, navFor } from '../middleware/authorize.js';
import { ApiError } from '../utils/apiResponse.js';
import * as audit from './audit.service.js';
import { postMessage } from './circle.service.js';
import { clientScopeWhere, type Scoper } from './scope.service.js';

/**
 * COMMUNITY — the commons, and the one outbound tab beside it.
 *
 * THE LINE THIS WHOLE FILE IS DRAWN AGAINST is the demo's own
 * (console-community.js:24), and it is worth restating because every function
 * below sits on one side of it:
 *
 *   CONTENT       a gathering's title, when, where, desc, about, agenda, bring;
 *                 a challenge's arc; a game day's questions; a post's caption and
 *                 its author. This screen owns these and `manageTribe` writes
 *                 them.
 *   MEMBER STATE  going, joined, answered, liked, commented. This screen READS
 *                 these for a count pill and has never written one. Nothing in
 *                 this file writes one either, and there is no route that could.
 *   MODERATION    pinned and hidden — a third category, staff action on somebody
 *                 else's words, which is why it has its own call rather than
 *                 riding along with an edit to the caption.
 *
 * TWO PERMISSIONS, TWO SURFACES, and conflating them is the mistake this module
 * exists to make impossible:
 *
 *   `manageTribe`     runs the community. Everything on the first five tabs.
 *   `announceClients` reaches clients' OWN threads from the sixth. Super Admin
 *                     and Operations Head hold it and nobody else does.
 *
 * Neither is `broadcast`, which means the STAFF feed in People & Access — the
 * label on that key had to grow to keep the two apart (shared/people.ts:17) and
 * widening it here would turn "post to the team" into "message every client on
 * the platform".
 *
 * READS ARE OPEN TO ANYBODY WITH THE NAV. Console access IS nav membership, and
 * a Super User carries Community without carrying `manageTribe`: they read the
 * commons and change nothing, which is exactly what a reviewer's seat is.
 */

/* ------------------------------------------------------------------ refusals */

/**
 * Refuse, and write the row that makes the promise true.
 *
 * Every locked surface in this console tells the person "This attempt was
 * logged". Only the server can make that a fact, so no refusal in this file
 * throws without passing through here.
 */
async function deny(
  user: Scoper,
  what: string,
  subjectId: string | null,
  message: string,
  /*
   * WHAT THE REFUSAL WAS ABOUT.
   *
   * Every denial here used to be filed under 'community' while the SUCCESSES were
   * filed under 'gathering', 'challenge' and the rest — so one object collected
   * two subject types depending on whether the act worked, and an auditor asking
   * "everything anybody tried on this gathering" got half an answer. Callers that
   * know the object say so; the rest keep the old shape.
   */
  subjectType = 'community',
): Promise<never> {
  await audit.record({
    actorId: user.id,
    action: 'denied',
    subjectType,
    subjectId,
    reason: what,
    meta: { role: user.role },
  });
  throw ApiError.forbidden(message);
}

/**
 * Community is a staff surface. `clientScopeWhere` resolves a client to their own
 * record, so without this every scope check below would pass for a client and
 * they would be reading the moderation queue from the console's API.
 */
function assertStaff(user: Scoper): void {
  if (user.role === 'client') throw ApiError.forbidden();
}

/* ------------------------------------------------------------- who may write */

/** Runs the community. Everything on the first five tabs. */
export async function canManage(user: Scoper): Promise<boolean> {
  if (user.role === 'client') return false;
  return can(user.role, 'manageTribe');
}

/**
 * MAY DELETE, which is a narrower right than may edit.
 *
 * The demo says `canManage() && (role === 'admin' || role === 'opshead')`
 * (console-community.js:79) because its little registry has nowhere else to put
 * the rule. Those two roles are exactly the holders of `manageTribe` who also
 * hold `manageConfig`, so the permission pair says the same thing today and keeps
 * saying it after somebody adds a role in People & Access — which a role list
 * cannot, and which is the same argument the meals board makes for its own gate.
 *
 * And it reads correctly as a sentence: an edit changes what a gathering says,
 * a delete removes it from every client's page at once, which is a
 * configuration-grade act.
 */
export async function canDelete(user: Scoper): Promise<boolean> {
  if (!(await canManage(user))) return false;
  return can(user.role, 'manageConfig');
}

/** Reaches clients' own threads. A DIFFERENT permission — see the file header. */
export async function canAnnounce(user: Scoper): Promise<boolean> {
  if (user.role === 'client') return false;
  return can(user.role, 'announceClients');
}

/**
 * MAY LET A GATHERING OUT — a different right from may write one.
 *
 * Writing a gathering is `manageTribe`, and the Haalving Coach holds it: proposing
 * a trek is his job. Publishing it puts it on every client's Community tab at
 * once, which is nearer to broadcasting than to editing, so it answers to its own
 * key held by the Super Admin alone.
 *
 * Necessary but NOT sufficient — see `approveGathering`, which also refuses your
 * own. The whole value of a gate is the second pair of eyes.
 */
export async function canApprove(user: Scoper): Promise<boolean> {
  if (user.role === 'client') return false;
  return can(user.role, 'approveCommunity');
}

/**
 * MAY PROPOSE A GATHERING — a lower bar than `manageTribe`, on purpose.
 *
 * Anyone who can open Community may put one up: the Super Admin, the Haalving
 * Coach, the Operations Head and the Super User. That last one holds no
 * `manageTribe` at all — it is a reviewing seat, "read-only elsewhere" — and it
 * stays read-only on Challenges, Game Days, Feed and Zones. Granting it
 * `manageTribe` to let it suggest a trek would have opened all four.
 *
 * A LOW BAR IS SAFE BECAUSE OF THE GATE, and only because of it. A proposal is
 * inert: nobody outside the approver and its author ever sees it, and it reaches
 * a client only when somebody else approves it. Take the gate away and this
 * becomes the wrong rule immediately.
 *
 * Asked of the LIVE role row, like every other gate here, so widening Community
 * to a coach bench in People & Access carries this with it rather than needing a
 * second edit somebody forgets.
 */
export async function canPropose(user: Scoper): Promise<boolean> {
  if (user.role === 'client') return false;
  return (await navFor(user.role)).has('community');
}

async function requirePropose(user: Scoper, what: string): Promise<void> {
  assertStaff(user);
  if (await canPropose(user)) return;
  await deny(user, what, null, 'Adding a gathering is not available for your role.', 'gathering');
}

async function requireApprove(user: Scoper, what: string, subjectId: string): Promise<void> {
  assertStaff(user);
  if (await canApprove(user)) return;
  await deny(
    user,
    what,
    subjectId,
    'Approving a gathering is not available for your role. This attempt was logged.',
    'gathering',
  );
}

async function requireManage(user: Scoper, what: string, subjectId: string | null): Promise<void> {
  assertStaff(user);
  if (await canManage(user)) return;
  await deny(
    user,
    what,
    subjectId,
    'Editing the community needs the “Manage community” permission. This attempt was logged.',
  );
}

async function requireDelete(user: Scoper, what: string, subjectId: string | null): Promise<void> {
  assertStaff(user);
  if (await canDelete(user)) return;
  await deny(user, what, subjectId, 'Deleting community content is not available for your role.');
}

async function requireAnnounce(user: Scoper, what: string): Promise<void> {
  assertStaff(user);
  if (await canAnnounce(user)) return;
  await deny(
    user,
    what,
    null,
    'Sending needs the “Announce to clients” permission. This attempt was logged.',
  );
}

/* ----------------------------------------------------------------- the scope */

/**
 * THE STAFF LENS ONTO WHAT A CLIENT WROTE.
 *
 * The Common Canvas is public among members — every client in the circle sees
 * every post on it. This is not that surface. This is the console, and a console
 * reading a client's own words follows the same scope every other client record
 * in this system follows: `seeAllClients` sees the lot, an HoD sees their bench's
 * people, a coach sees the clients they sit on.
 *
 * In the demo the rule is invisible, because all four roles carrying the
 * Community tab also carry `seeAllClients`. It becomes visible the moment People
 * & Access grants the tab to somebody narrower, which is precisely when it needs
 * to already be here.
 *
 * `clientId: null` — a house post, a staff-authored one — is about nobody and is
 * always visible. The OR is written with `client: { is: scope }` rather than
 * `client: scope`: a bare relation filter inside an OR on a NULLABLE relation
 * collapses to the other branch, which is how the sibling module's approvals
 * board once showed a Super Admin the two prospect sign-offs and none of the
 * client ones.
 */
async function postScope(user: Scoper): Promise<Prisma.CommunityPostWhereInput> {
  const scope = await clientScopeWhere(user);
  return { OR: [{ clientId: null }, { client: { is: scope } }] };
}

/**
 * A zone is a room of clients, so the same lens applies: a space you can see
 * nobody in is not yours to manage. Every zone has at least one member — the
 * service refuses one without — so this can never hide a zone by accident.
 */
async function zoneScope(user: Scoper): Promise<Prisma.ZoneWhereInput> {
  const scope = await clientScopeWhere(user);
  return { members: { some: { client: { is: scope } } } };
}

/* ------------------------------------------------------------ the six tabs */

export interface SectionTab {
  key: CommunitySection;
  label: string;
  /** What the tab badges. The demo badges only Announcements; the rest read as
   *  a count of what is in them, which is what the console draws anyway. */
  count: number;
}

/**
 * The whole host in one call: the six tabs with their counts, and what this
 * caller may do.
 *
 * The capabilities travel with the tabs deliberately. The console draws an "Add
 * gathering" button off `canManage` and a "New announcement" button off
 * `canAnnounce`, and a screen that had to guess at either would guess wrong for
 * the Super User — who reads every tab and writes none of them.
 */
export async function sections(user: Scoper) {
  assertStaff(user);
  const [scope, zScope] = await Promise.all([postScope(user), zoneScope(user)]);

  const [gatherings, challenges, quiz, feed, zones, announce, manage, del, announcePerm, approve, propose] =
    await Promise.all([
      /*
       * EVERY BADGE READS THE CLAUSE ITS LIST READS — see approvalScopeFor.
       *
       * Gatherings were scoped and the other three were not: the same drift, three
       * more times. A coach would see "Challenges 4" above three of them with no
       * way to reach the fourth. The Feed is not gated at all — client feedback,
       * moderated rather than approved — so it keeps its own clause untouched.
       */
      prisma.gathering.count({ where: await approvalScopeFor(user) }),
      prisma.challenge.count({ where: await approvalScopeFor(user) }),
      prisma.gameDay.count({ where: await approvalScopeFor(user) }),
      prisma.communityPost.count({ where: { AND: [{ zoneId: null }, scope] } }),
      prisma.zone.count({ where: { AND: [zScope, await approvalScopeFor(user, 'proposedById')] } }),
      prisma.broadcast.count(),
      canManage(user),
      canDelete(user),
      canAnnounce(user),
      canApprove(user),
      canPropose(user),
    ]);

  const counts: Record<CommunitySection, number> = {
    gatherings,
    challenges,
    quiz,
    feed,
    zones,
    announce,
  };

  return {
    sections: COMMUNITY_SECTIONS.map((key) => ({
      key,
      label: COMMUNITY_SECTION_LABELS[key],
      count: counts[key],
    })) satisfies SectionTab[],
    canManage: manage,
    /* the gate, and the lower bar beneath it — the sheet needs both: who may put
       one up at all, and who may let it out once it is up */
    canApprove: approve,
    canPropose: propose,
    canDelete: del,
    canAnnounce: announcePerm,
  };
}

/* ------------------------------------------------------------ positioning */

/**
 * Where a new item lands: at the TOP.
 *
 * The console unshifts, and the client pages read the first element as the
 * current one. `min - 1` reproduces that without renumbering anything, so
 * creating a gathering never rewrites the rows beside it.
 */
async function topPosition(
  agg: Promise<{ _min: { position: number | null } }>,
): Promise<number> {
  return ((await agg)._min.position ?? 0) - 1;
}

/* ------------------------------------------------------------- gatherings */

type GatheringInput = z.infer<typeof schemas.gatheringSchema>;
type ChallengeInput = z.infer<typeof schemas.challengeSchema>;
type GameDayInput = z.infer<typeof schemas.gameDaySchema>;
type PostInput = z.infer<typeof schemas.postSchema>;
type ModerateInput = z.infer<typeof schemas.moderatePostSchema>;
type ZoneInput = z.infer<typeof schemas.zoneSchema>;
type SendInput = z.infer<typeof schemas.sendBroadcastSchema>;

const asPairs = (v: Prisma.JsonValue): Array<Record<string, string>> =>
  Array.isArray(v) ? (v as unknown as Array<Record<string, string>>) : [];

/** The content columns, and only those. A save always starts from the row. */
function gatheringContent(input: GatheringInput) {
  return {
    title: input.title,
    when: input.when,
    where: input.where,
    host: input.host ?? null,
    spots: input.spots ?? null,
    desc: input.desc,
    about: input.about,
    agenda: input.agenda as unknown as Prisma.InputJsonValue,
    bring: input.bring,
  };
}

/**
 * THE ONE SCOPING EXPRESSION for anything on this page that goes through the gate.
 *
 * The tab badge and the list beneath it MUST read this same clause. They did not,
 * once: the list filtered by approval and authorship while the badge counted every
 * row, so a coach saw "Gatherings 4" above three of them with no way to find the
 * fourth. That is the drift this console has already recorded fixing twice
 * elsewhere, and it came back the moment a list learned a rule its count did not.
 * One function, read by both, for every kind.
 */
async function approvalScopeFor(user: Scoper, authorColumn: 'createdById' | 'proposedById' = 'createdById') {
  /* the seat that must decide on a proposal sees every one */
  if (await canApprove(user)) return {};
  /*
   * Everybody else: the community's, plus their own while it waits.
   *
   * A ZONE NAMES ITS AUTHOR DIFFERENTLY. `zones.createdById` is presentational and
   * deliberately null — the tab prints "made by ..." and an official zone reads as
   * HAALVING's — so the gate reads `proposedById` there instead. Passing the column
   * rather than branching keeps one clause for all four kinds.
   */
  return { OR: [{ approvedAt: { not: null } }, { [authorColumn]: user.id }] };
}

/** Gatherings ask it under their own name, which the read below still uses. */
const gatheringScope = approvalScopeFor;

/**
 * Let a piece of community content out, or send it back.
 *
 * ONE IMPLEMENTATION FOR FOUR KINDS. The rules do not vary by kind and writing
 * them four times is how three of them quietly drift from the fourth: holding
 * `approveCommunity` is necessary and never sufficient, nobody approves their own
 * whoever they are, an already-approved row is a 409 rather than a second
 * approval, and a refusal is logged against THAT row so an auditor asking what was
 * tried on one challenge gets a whole answer.
 *
 * The 403/409 split is the same distinction throughout: 403 is a permission fact,
 * 409 is a state fact. You may not do this at all, versus you may, but not to this.
 */
type ApprovableKind = 'gathering' | 'challenge' | 'gameDay' | 'zone';

const APPROVABLE = {
  gathering: { model: () => prisma.gathering, noun: 'gathering', author: 'createdById' },
  challenge: { model: () => prisma.challenge, noun: 'challenge', author: 'createdById' },
  gameDay: { model: () => prisma.gameDay, noun: 'game day', author: 'createdById' },
  /* a zone's presented author and its proposer are two different facts */
  zone: { model: () => prisma.zone, noun: 'zone', author: 'proposedById' },
} as const;

type ApprovableRow = { id: string; approvedAt: Date | null; createdById: string | null };

async function loadApprovable(kind: ApprovableKind, id: string): Promise<ApprovableRow> {
  const row = (await (APPROVABLE[kind].model() as never as {
    findUnique(a: unknown): Promise<ApprovableRow | null>;
  }).findUnique({
    where: { id },
    select: { id: true, approvedAt: true, [APPROVABLE[kind].author]: true },
  })) as (Omit<ApprovableRow, 'createdById'> & Record<string, unknown>) | null;
  if (!row) throw ApiError.notFound(`No such ${APPROVABLE[kind].noun}.`);
  /* normalised, so every caller below asks one question about authorship */
  return { ...row, createdById: (row[APPROVABLE[kind].author] as string | null) ?? null };
}

export async function approveContent(user: Scoper, kind: ApprovableKind, id: string) {
  await requireApprove(user, `community.${kind}.approve`, id);
  const row = await loadApprovable(kind, id);

  if (row.approvedAt) throw ApiError.conflict(`That ${APPROVABLE[kind].noun} is already approved.`);
  if (row.createdById === user.id) {
    throw ApiError.conflict(
      `A ${APPROVABLE[kind].noun} is approved by somebody other than the person who wrote it.`,
    );
  }

  const at = new Date();
  await (APPROVABLE[kind].model() as never as {
    update(a: unknown): Promise<unknown>;
  }).update({ where: { id }, data: { approvedById: user.id, approvedAt: at, returnNote: null } });

  await audit.record({
    actorId: user.id,
    action: `community.${kind}_approved`,
    subjectType: kind,
    subjectId: id,
    meta: { createdById: row.createdById },
  });

  return { id, status: 'APPROVED' as const, approvedAt: at.toISOString() };
}

export async function returnContent(user: Scoper, kind: ApprovableKind, id: string, note: string) {
  await requireApprove(user, `community.${kind}.return`, id);
  const row = await loadApprovable(kind, id);

  if (row.approvedAt) throw ApiError.conflict(`That ${APPROVABLE[kind].noun} is already approved.`);
  if (row.createdById === user.id) {
    throw ApiError.conflict(
      `A ${APPROVABLE[kind].noun} is reviewed by somebody other than the person who wrote it.`,
    );
  }

  await (APPROVABLE[kind].model() as never as {
    update(a: unknown): Promise<unknown>;
  }).update({ where: { id }, data: { returnNote: note } });

  await audit.record({
    actorId: user.id,
    action: `community.${kind}_returned`,
    subjectType: kind,
    subjectId: id,
    meta: { note },
  });

  return { id, status: 'PENDING' as const, returnNote: note };
}

/**
 * WHOSE IS IT TO CHANGE — the author's, and the Super Admin's. One rule, four
 * kinds, for the reason the approval is one implementation.
 */
async function requireOwnContent(user: Scoper, kind: ApprovableKind, id: string, what: string) {
  const row = await loadApprovable(kind, id);
  if (row.createdById === user.id) return row;
  if (await canApprove(user)) return row;
  await deny(
    user,
    what,
    id,
    `A ${APPROVABLE[kind].noun} is changed by whoever wrote it. This attempt was logged.`,
    kind,
  );
}


export async function listGatherings(user: Scoper) {
  assertStaff(user);

  /*
   * A PENDING GATHERING IS NOT THE COMMUNITY'S YET.
   *
   * It is shown to the seat that must decide on it, and to whoever wrote it —
   * asking somebody to submit a thing and then hiding it from them is how a
   * console teaches people to stop trusting it. Everybody else sees the
   * community, which is the approved list.
   */
  const rows = await prisma.gathering.findMany({
    where: await gatheringScope(user),
    orderBy: { position: 'asc' },
    include: {
      _count: { select: { enrolments: true } },
      createdBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
    },
  });
  return rows.map((g) => ({
    id: g.id,
    title: g.title,
    when: g.when,
    where: g.where,
    host: g.host,
    spots: g.spots,
    desc: g.desc,
    about: g.about,
    agenda: asPairs(g.agenda),
    bring: g.bring,
    img: g.img,
    /* the trailing count pill, and the ONLY member state this screen ever sees */
    going: g._count.enrolments,
    /*
     * DERIVED, not stored. There is no status column and deliberately no enum —
     * the timestamp is the fact and this is the word for it, so the console and
     * the tests speak in PENDING/APPROVED without Postgres carrying a type that
     * would need altering to gain a third state.
     */
    status: g.approvedAt ? ('APPROVED' as const) : ('PENDING' as const),
    approvedAt: g.approvedAt?.toISOString() ?? null,
    approvedBy: g.approvedBy,
    createdBy: g.createdBy,
    returnNote: g.returnNote,
    /* so the sheet can hide its own Approve button without asking twice */
    mine: g.createdById === user.id,
  }));
}

/**
 * THE PUBLISHED GATHERINGS, for everybody else.
 *
 * `listGatherings` above is the Community TAB's read: it carries the approval
 * state, the pending ones, and the controls to act on them, and it lives behind
 * the `community` nav that four roles hold.
 *
 * This is the other half of the same fact — what the community actually has on —
 * and it answers to no nav at all. A Fitness Coach cannot open Community and has
 * no business editing a gathering, but "there is a sunrise walk on Saturday" is
 * not privileged information: it is the thing the walk exists to tell people.
 *
 * PENDING NEVER APPEARS HERE, whoever asks. That is the whole point of the gate —
 * an unapproved gathering is a proposal, and a proposal is not the community's.
 */
/**
 * WHOSE GATHERING IS IT TO CHANGE — the author's, and the Super Admin's.
 *
 * `manageTribe` used to be the whole answer, which meant the Haalving Coach could
 * rewrite a gathering the Operations Head wrote and neither would know. On a board
 * where a row now carries an author and went through a gate, that is wrong twice:
 * it lets somebody edit a proposal after it was approved on different words, and
 * it leaves no one accountable for what a gathering says.
 *
 * So authorship, plus one override. `approveGathering` is the override rather than
 * a sixth key because it already means "this seat decides what the community's
 * calendar holds" — the seat that says whether a gathering may exist at all is the
 * seat that may fix one that is wrong. Splitting them would be two keys held by
 * the same person to say one thing.
 *
 * THE SEEDED THREE HAVE NO AUTHOR — they predate the field — so only the Super
 * Admin may touch them. That is the correct reading of a null: unowned content is
 * the community's, and the community's is hers.
 */
async function requireOwnGathering(user: Scoper, id: string, what: string) {
  const row = await prisma.gathering.findUnique({
    where: { id },
    select: { id: true, createdById: true, title: true },
  });
  if (!row) throw ApiError.notFound('No such gathering.');

  if (row.createdById === user.id) return row;
  if (await canApprove(user)) return row;

  await deny(
    user,
    what,
    id,
    'A gathering is changed by whoever wrote it. This attempt was logged.',
    'gathering',
  );
}

export async function approvedGatherings() {
  const rows = await prisma.gathering.findMany({
    where: { approvedAt: { not: null } },
    orderBy: { position: 'asc' },
    include: { _count: { select: { enrolments: true } } },
  });

  return rows.map((g) => ({
    id: g.id,
    title: g.title,
    when: g.when,
    where: g.where,
    host: g.host,
    spots: g.spots,
    desc: g.desc,
    about: g.about,
    agenda: asPairs(g.agenda),
    bring: g.bring,
    img: g.img,
    going: g._count.enrolments,
  }));
}

export async function createGathering(user: Scoper, input: GatheringInput) {
  await requirePropose(user, 'community.gathering.create');
  const row = await prisma.gathering.create({
    data: {
      ...gatheringContent(input),
      /* the sheet asks for no picture, and the client honeycomb reads `img` with
         no fallback of its own — an unset one is a broken tile, not a plain card */
      img: DEFAULT_GATHERING_IMG,
      position: await topPosition(prisma.gathering.aggregate({ _min: { position: true } })),
      /*
       * WHO PROPOSED IT, which the gate needs: nobody approves their own, so the
       * rule has to know whose it is. `approvedAt` is left unset — a new gathering
       * is PENDING whoever wrote it, the Super Admin included, because a gate the
       * gatekeeper can walk around is decoration.
       */
      createdById: user.id,
    },
  });
  await audit.record({
    actorId: user.id,
    action: 'community.gathering_created',
    subjectType: 'gathering',
    subjectId: row.id,
    meta: { title: row.title },
  });
  return row.id;
}

/**
 * Let a gathering out.
 *
 * TWO RULES, and the second is the one that matters. Holding `approveGathering`
 * is necessary — it is the Super Admin's alone today — and it is NOT sufficient:
 * nobody approves their own, whoever they are. A gate the gatekeeper can walk
 * around is decoration, and the Super Admin walking around it is the single case
 * where that would actually happen, because she is the only one who holds both
 * halves.
 *
 * The refusals are DIFFERENT ANSWERS to different questions, and the status codes
 * say which. 403: you may not do this at all — a permission fact, logged against
 * the gathering. 409: you may, but not to THIS one — a state fact, and nothing is
 * logged because nothing was attempted that a reviewer needs to know about.
 */
export async function approveGathering(user: Scoper, id: string) {
  await requireApprove(user, 'community.gathering.approve', id);

  const row = await prisma.gathering.findUnique({
    where: { id },
    select: { id: true, title: true, approvedAt: true, createdById: true },
  });
  if (!row) throw ApiError.notFound('No such gathering.');

  if (row.approvedAt) throw ApiError.conflict('That gathering is already approved.');
  if (row.createdById === user.id) {
    throw ApiError.conflict('A gathering is approved by somebody other than the person who wrote it.');
  }

  const next = await prisma.gathering.update({
    where: { id },
    data: { approvedById: user.id, approvedAt: new Date(), returnNote: null },
    select: { id: true, title: true, approvedAt: true },
  });

  await audit.record({
    actorId: user.id,
    action: 'community.gathering_approved',
    subjectType: 'gathering',
    subjectId: id,
    meta: { title: next.title, createdById: row.createdById },
  });

  return { id: next.id, status: 'APPROVED' as const, approvedAt: next.approvedAt?.toISOString() ?? null };
}

/**
 * Send it back with a reason.
 *
 * The reason is REQUIRED, the same rule the approval chain keeps for a return: a
 * gathering that comes back with no word attached tells its author nothing except
 * that somebody said no, and they will simply resubmit it.
 */
export async function returnGathering(user: Scoper, id: string, note: string) {
  await requireApprove(user, 'community.gathering.return', id);

  const row = await prisma.gathering.findUnique({
    where: { id },
    select: { id: true, title: true, approvedAt: true, createdById: true },
  });
  if (!row) throw ApiError.notFound('No such gathering.');
  if (row.approvedAt) throw ApiError.conflict('That gathering is already approved.');
  if (row.createdById === user.id) {
    throw ApiError.conflict('A gathering is reviewed by somebody other than the person who wrote it.');
  }

  await prisma.gathering.update({ where: { id }, data: { returnNote: note } });
  await audit.record({
    actorId: user.id,
    action: 'community.gathering_returned',
    subjectType: 'gathering',
    subjectId: id,
    meta: { title: row.title, note },
  });

  return { id, status: 'PENDING' as const, returnNote: note };
}

export async function updateGathering(user: Scoper, id: string, input: GatheringInput) {
  await requireOwnGathering(user, id, 'community.gathering.update');
  const exists = await prisma.gathering.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw ApiError.notFound('No such gathering.');

  /* CONTENT KEYS ONLY. `img` is not written and neither is anything about who is
     enrolled — a saved edit starts from the existing row and overwrites what the
     sheet asked about, which is the rule the demo states in its own header. */
  await prisma.gathering.update({ where: { id }, data: gatheringContent(input) });
  await audit.record({
    actorId: user.id,
    action: 'community.gathering_updated',
    subjectType: 'gathering',
    subjectId: id,
    meta: { title: input.title },
  });
  return id;
}

export async function removeGathering(user: Scoper, id: string) {
  await requireOwnGathering(user, id, 'community.gathering.delete');
  const [row, count] = await Promise.all([
    prisma.gathering.findUnique({ where: { id }, select: { id: true, title: true } }),
    prisma.gathering.count({
      /*
       * THE FLOOR COUNTS WHAT A CLIENT CAN SEE, and counting every row was a bug.
       *
       * The floor exists because the client page reads [0] with no length check. A
       * pending row is invisible to a client, so one approved row beside two
       * pending ones read as three and let the only PUBLISHED one be deleted —
       * blanking the very page the floor exists to protect.
       */
      where: { approvedAt: { not: null } },
    }),
  ]);
  if (!row) throw ApiError.notFound('No such gathering.');

  /* THE FLOOR. The client's gathering page reads `events[0].about` with no length
     check, so emptying this collection blanks that page for every client. The
     demo refuses in a sheet; here it is the rule. */
  if (atFloor('gatherings', count)) {
    throw ApiError.conflict(
      'The Community page needs at least one gathering — edit this one, or add another before deleting it.',
      { floor: true, section: 'gatherings' },
    );
  }

  await prisma.gathering.delete({ where: { id } });
  await audit.record({
    actorId: user.id,
    action: 'community.gathering_deleted',
    subjectType: 'gathering',
    subjectId: id,
    meta: { title: row.title },
  });
  return { id };
}

/* ------------------------------------------------------------- challenges */

function challengeContent(input: ChallengeInput) {
  return {
    title: input.title,
    days: input.days,
    host: input.host ?? null,
    stake: input.stake ?? null,
    desc: input.desc,
    about: input.about,
    how: input.how,
    arc: input.arc as unknown as Prisma.InputJsonValue,
  };
}

export async function listChallenges(user: Scoper) {
  assertStaff(user);
  const rows = await prisma.challenge.findMany({
    /* the same clause the badge counts — see approvalScopeFor */
    where: await approvalScopeFor(user),
    orderBy: { position: 'asc' },
    include: { _count: { select: { entries: true } } },
  });
  return rows.map((c) => ({
    id: c.id,
    title: c.title,
    days: c.days,
    host: c.host,
    stake: c.stake,
    desc: c.desc,
    about: c.about,
    how: c.how,
    arc: asPairs(c.arc),
    img: c.img,
    joined: c._count.entries,
  }));
}

export async function createChallenge(user: Scoper, input: ChallengeInput) {
  await requirePropose(user, 'community.challenge.create');
  const row = await prisma.challenge.create({
    data: {
      ...challengeContent(input),
      img: DEFAULT_CHALLENGE_IMG,
      position: await topPosition(prisma.challenge.aggregate({ _min: { position: true } })),
    },
  });
  await audit.record({
    actorId: user.id,
    action: 'community.challenge_created',
    subjectType: 'challenge',
    subjectId: row.id,
    meta: { title: row.title },
  });
  return row.id;
}

export async function updateChallenge(user: Scoper, id: string, input: ChallengeInput) {
  await requireOwnContent(user, 'challenge', id, 'community.challenge.update');
  const exists = await prisma.challenge.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw ApiError.notFound('No such challenge.');
  await prisma.challenge.update({ where: { id }, data: challengeContent(input) });
  await audit.record({
    actorId: user.id,
    action: 'community.challenge_updated',
    subjectType: 'challenge',
    subjectId: id,
    meta: { title: input.title },
  });
  return id;
}

/**
 * Challenges have NO FLOOR, and that is a deliberate difference from gatherings.
 * The client's challenge page tests `.length` before it indexes, so an empty
 * collection renders an empty state rather than a blank page.
 */
export async function removeChallenge(user: Scoper, id: string) {
  await requireOwnContent(user, 'challenge', id, 'community.challenge.delete');
  const row = await prisma.challenge.findUnique({ where: { id }, select: { title: true } });
  if (!row) throw ApiError.notFound('No such challenge.');
  await prisma.challenge.delete({ where: { id } });
  await audit.record({
    actorId: user.id,
    action: 'community.challenge_deleted',
    subjectType: 'challenge',
    subjectId: id,
    meta: { title: row.title },
  });
  return { id };
}

/* -------------------------------------------------------------- game days */

export async function listGameDays(user: Scoper) {
  assertStaff(user);
  const rows = await prisma.gameDay.findMany({
    /* the same clause the badge counts — see approvalScopeFor */
    where: await approvalScopeFor(user),
    orderBy: { position: 'asc' },
    include: {
      questions: {
        orderBy: { position: 'asc' },
        include: { _count: { select: { answers: true } } },
      },
    },
  });

  return rows.map((d) => ({
    id: d.id,
    label: d.label,
    date: d.date,
    qs: d.questions.map((q) => ({
      id: q.id,
      q: q.prompt,
      opts: q.options,
      ans: q.answer,
      why: q.why,
      answers: q._count.answers,
    })),
    /*
     * "3 of 5 answered".
     *
     * The demo counts questions whose `answered` is set, which in a one-browser
     * store means "the reader answered it". There is no such reader here, so the
     * pill has to say something a server can actually know: how many of the day's
     * questions ANYBODY has answered. The raw total travels beside it, so nothing
     * downstream can mistake the first number for a per-person reading.
     */
    answered: d.questions.filter((q) => q._count.answers > 0).length,
    answers: d.questions.reduce((n, q) => n + q._count.answers, 0),
  }));
}

/**
 * A game day is edited WHOLE — its label, its date and its questions in one save.
 *
 * The questions are rewritten BY POSITION rather than deleted and recreated, and
 * that is the whole reason `GameQuestion` is a table: a client's answer points at
 * a question, and a delete-then-insert would either destroy every answer the day
 * has collected or silently re-address them to whatever now sits in that slot.
 * Position 3 stays position 3, keeps its id, and keeps the answers given to it.
 *
 * A save that SHORTENS the day does delete the questions it dropped, and their
 * answers go with them — which is right: the question is gone, so an answer to it
 * is not an answer to anything.
 */
export async function saveGameDayQuestions(gameDayId: string, qs: GameDayInput['qs']) {
  const existing = await prisma.gameQuestion.findMany({
    where: { gameDayId },
    orderBy: { position: 'asc' },
    select: { id: true, position: true },
  });

  for (const [i, q] of qs.entries()) {
    const hit = existing.find((e) => e.position === i);
    const data = { prompt: q.q, options: q.opts, answer: q.ans, why: q.why };
    if (hit) await prisma.gameQuestion.update({ where: { id: hit.id }, data });
    else await prisma.gameQuestion.create({ data: { gameDayId, position: i, ...data } });
  }

  const dropped = existing.filter((e) => e.position >= qs.length).map((e) => e.id);
  if (dropped.length) await prisma.gameQuestion.deleteMany({ where: { id: { in: dropped } } });
}

export async function createGameDay(user: Scoper, input: GameDayInput) {
  await requirePropose(user, 'community.gameday.create');
  const row = await prisma.gameDay.create({
    data: {
      label: input.label,
      date: input.date,
      position: await topPosition(prisma.gameDay.aggregate({ _min: { position: true } })),
    },
  });
  await saveGameDayQuestions(row.id, input.qs);
  await audit.record({
    actorId: user.id,
    action: 'community.gameday_created',
    subjectType: 'gameDay',
    subjectId: row.id,
    meta: { label: row.label, questions: input.qs.length },
  });
  return row.id;
}

export async function updateGameDay(user: Scoper, id: string, input: GameDayInput) {
  await requireOwnContent(user, 'gameDay', id, 'community.gameday.update');
  const before = await prisma.gameDay.findUnique({
    where: { id },
    select: { id: true, approvedAt: true },
  });
  if (!before) throw ApiError.notFound('No such game day.');

  /*
   * EDITING AN APPROVED DAY RE-OPENS THE GATE.
   *
   * A game day is not its own content — the questions are, and they live one
   * table down in `GameQuestion`, rewritten wholesale by `saveGameDayQuestions`
   * below. So a day approved with five questions could be edited into five
   * different ones and stay APPROVED: unreviewed content published through an
   * approval that was given to something else.
   *
   * A gathering has no such hole — its edit lands on the very row an approver
   * reads. This one does, so the edit costs the approval.
   */
  const reopened = before.approvedAt !== null;

  await prisma.gameDay.update({
    where: { id },
    data: {
      label: input.label,
      date: input.date,
      ...(reopened ? { approvedById: null, approvedAt: null, returnNote: null } : {}),
    },
  });
  await saveGameDayQuestions(id, input.qs);
  await audit.record({
    actorId: user.id,
    action: 'community.gameday_updated',
    subjectType: 'gameDay',
    subjectId: id,
    meta: { label: input.label, questions: input.qs.length, reopened },
  });
  return id;
}

export async function removeGameDay(user: Scoper, id: string) {
  await requireOwnContent(user, 'gameDay', id, 'community.gameday.delete');
  const [row, count] = await Promise.all([
    prisma.gameDay.findUnique({ where: { id }, select: { label: true } }),
    prisma.gameDay.count({
      /*
       * THE FLOOR COUNTS WHAT A CLIENT CAN SEE, and counting every row was a bug.
       *
       * The floor exists because the client page reads [0] with no length check. A
       * pending row is invisible to a client, so one approved row beside two
       * pending ones read as three and let the only PUBLISHED one be deleted —
       * blanking the very page the floor exists to protect.
       */
      where: { approvedAt: { not: null } },
    }),
  ]);
  if (!row) throw ApiError.notFound('No such game day.');

  /* the second floor: the client's Health Games page reads `quizDays[0].qs` with
     no length check of its own */
  if (atFloor('quiz', count)) {
    throw ApiError.conflict(
      'The Community page needs at least one game day — edit this one, or add another before deleting it.',
      { floor: true, section: 'quiz' },
    );
  }

  await prisma.gameDay.delete({ where: { id } });
  await audit.record({
    actorId: user.id,
    action: 'community.gameday_deleted',
    subjectType: 'gameDay',
    subjectId: id,
    meta: { label: row.label },
  });
  return { id };
}

/* ------------------------------------------------------------------- feed */

const authorName = (a: { name: string } | null): string => a?.name ?? HOUSE_AUTHOR_NAME;
const authorWire = (id: string | null): string => id ?? HOUSE_AUTHOR_ID;

function shapePost(p: {
  id: string;
  authorId: string | null;
  author: { id: string; name: string } | null;
  clientId: string | null;
  kind: PostKind | string;
  caption: string;
  img: string | null;
  secs: number | null;
  quiz: Prisma.JsonValue;
  pinned: boolean;
  hidden: boolean;
  postedAt: Date;
  _count: { likes: number; comments: number };
}) {
  const kind = String(p.kind).toLowerCase() as PostKind;
  return {
    id: p.id,
    by: authorWire(p.authorId),
    byName: authorName(p.author),
    clientId: p.clientId,
    kind,
    kindLabel: POST_KIND_LABELS[kind] ?? kind,
    caption: p.caption,
    img: p.img,
    secs: p.secs,
    quiz: p.quiz,
    pinned: p.pinned,
    hidden: p.hidden,
    postedAt: p.postedAt.toISOString(),
    /* member state, counted and never written */
    likes: p._count.likes,
    comments: p._count.comments,
  };
}

const POST_SHAPE = {
  author: { select: { id: true, name: true } },
  _count: { select: { likes: true, comments: true } },
} as const;

/**
 * The Common Canvas, through the three lenses the console draws.
 *
 * The LENS IS A FILTER OVER ONE LIST and never a separate query per chip: the
 * counts on the three chips have to add up to what the list shows, and two
 * queries are two chances for them not to. Pinned first, then newest — the order
 * the client's own canvas keeps.
 */
export async function listPosts(user: Scoper, lens: FeedLens = 'all') {
  assertStaff(user);
  const scope = await postScope(user);
  const rows = await prisma.communityPost.findMany({
    where: { AND: [{ zoneId: null }, scope] },
    orderBy: [{ pinned: 'desc' }, { postedAt: 'desc' }],
    include: POST_SHAPE,
  });

  const all = rows.map(shapePost);
  const list =
    lens === 'pinned' ? all.filter((p) => p.pinned)
    : lens === 'hidden' ? all.filter((p) => p.hidden)
    : all;

  return {
    lens,
    counts: {
      all: all.length,
      pinned: all.filter((p) => p.pinned).length,
      hidden: all.filter((p) => p.hidden).length,
    },
    posts: list,
  };
}

/**
 * WHO A POST MAY BE ATTRIBUTED TO.
 *
 * The house account, or any non-client staff member: this console can post AS the
 * team and cannot impersonate a client. On an EDIT the post's existing author is
 * added, because several seeded posts were written by clients and opening the
 * sheet to fix a typo must not silently reassign somebody's words to whichever
 * staff name sorts first (console-community.js:426).
 *
 * Returns the author id to store — null for the house account.
 */
async function resolveAuthor(
  by: string,
  existingAuthorId: string | null | undefined,
): Promise<string | null> {
  if (by === HOUSE_AUTHOR_ID) return null;
  if (existingAuthorId !== undefined && by === (existingAuthorId ?? HOUSE_AUTHOR_ID)) {
    return existingAuthorId ?? null;
  }
  const u = await prisma.user.findUnique({ where: { id: by }, select: { id: true, role: true } });
  if (!u) throw ApiError.badRequest('No such person to post as.');
  if ((u.role as string) === 'client') {
    throw ApiError.conflict(
      'This console posts as the team or as HAALVING — never as a client.',
      { by },
    );
  }
  return u.id;
}

/**
 * A new post.
 *
 * TEXT, always. The console's own sheet says so ("New posts are text posts") and
 * there is no field here for media or a game payload — a photograph arrives from
 * the client app, which is the only place that has one.
 *
 * `clientId` is null: a post the team wrote is about nobody, and the scope lets
 * those through for everybody.
 */
export async function createPost(user: Scoper, input: PostInput) {
  await requireManage(user, 'community.post.create', null);
  const authorId = await resolveAuthor(input.by, undefined);

  const row = await prisma.communityPost.create({
    data: { authorId, clientId: null, kind: 'TEXT', caption: input.caption },
    include: POST_SHAPE,
  });
  await audit.record({
    actorId: user.id,
    action: 'community.post_created',
    subjectType: 'communityPost',
    subjectId: row.id,
    meta: { by: authorWire(authorId) },
  });
  return shapePost(row);
}

/**
 * An edit changes the AUTHOR and the CAPTION and nothing else.
 *
 * Not the kind, not the image, not the game payload — so a photo keeps its
 * photograph and a game keeps its question when somebody fixes a typo. And not
 * `clientId`: whose words these are does not change because an admin corrected
 * the spelling, and letting an edit move it would move the post between people's
 * scopes.
 */
export async function updatePost(user: Scoper, id: string, input: PostInput) {
  await requireManage(user, 'community.post.update', id);
  const scope = await postScope(user);
  const post = await prisma.communityPost.findFirst({
    where: { AND: [{ id }, scope] },
    select: { id: true, authorId: true },
  });
  /* 404 rather than 403 for a post out of scope, exactly as /clients does: a 403
     would confirm the post exists, which is itself the sensitive fact */
  if (!post) throw ApiError.notFound('No such post.');

  const authorId = await resolveAuthor(input.by, post.authorId);
  const row = await prisma.communityPost.update({
    where: { id },
    data: { authorId, caption: input.caption },
    include: POST_SHAPE,
  });
  await audit.record({
    actorId: user.id,
    action: 'community.post_updated',
    subjectType: 'communityPost',
    subjectId: id,
    meta: { by: authorWire(authorId) },
  });
  return shapePost(row);
}

/**
 * Moderation — pin and hide, and the two interlock.
 *
 * SINGLE-PIN IS ENFORCED ON THE WRITE, in a transaction, so two pinned posts are
 * impossible rather than merely unlikely: the client's canvas sorts pinned-first
 * and a second pin would make that order arbitrary. Pinning also clears `hidden`
 * — a hidden post cannot lead the canvas — and hiding clears `pinned`, for the
 * same reason read the other way.
 *
 * HIDING IS NOT A DELETE and is reversible. It takes the post off the Common
 * Canvas for everyone else; its author still sees it on My Canvas, marked hidden.
 * We do not remove people's words quietly.
 */
export async function moderatePost(user: Scoper, id: string, input: ModerateInput) {
  await requireManage(user, 'community.post.moderate', id);
  const scope = await postScope(user);
  const post = await prisma.communityPost.findFirst({
    where: { AND: [{ id }, scope] },
    select: { id: true, pinned: true, hidden: true, zoneId: true },
  });
  if (!post) throw ApiError.notFound('No such post.');

  /* a zone's canvas is private to its members and has no pinned slot at all —
     moderating one would be moderating a conversation this page does not host */
  if (post.zoneId) {
    throw ApiError.conflict('A zone post is not on the Common Canvas and is not moderated here.');
  }

  /* the schema has already refused a body naming both, so exactly one of these
     branches is the request and the other flag is only ever cleared, never set */
  const next =
    input.pinned !== undefined
      ? input.pinned
        ? { pinned: true, hidden: false }
        : { pinned: false, hidden: post.hidden }
      : input.hidden
        ? { pinned: false, hidden: true }
        : { pinned: post.pinned, hidden: false };

  const row = await prisma.$transaction(async (tx) => {
    if (next.pinned) {
      /* release whatever is pinned now — one at a time, said once */
      await tx.communityPost.updateMany({
        where: { zoneId: null, pinned: true, NOT: { id } },
        data: { pinned: false },
      });
    }
    return tx.communityPost.update({ where: { id }, data: next, include: POST_SHAPE });
  });

  await audit.record({
    actorId: user.id,
    action: 'community.post_moderated',
    subjectType: 'communityPost',
    subjectId: id,
    meta: { pinned: next.pinned, hidden: next.hidden },
  });
  return shapePost(row);
}

export async function removePost(user: Scoper, id: string) {
  await requireDelete(user, 'community.post.delete', id);
  const scope = await postScope(user);
  const post = await prisma.communityPost.findFirst({
    where: { AND: [{ id }, scope] },
    select: { id: true, authorId: true, zoneId: true },
  });
  if (!post) throw ApiError.notFound('No such post.');

  await prisma.communityPost.delete({ where: { id } });
  await audit.record({
    actorId: user.id,
    action: 'community.post_deleted',
    subjectType: 'communityPost',
    subjectId: id,
    meta: { by: authorWire(post.authorId), zoneId: post.zoneId },
  });
  return { id };
}

/* ------------------------------------------------------------------ zones */

/**
 * The member pool — the community circle.
 *
 * THE SAME LIST THE CLIENT'S OWN ZONE PICKER DRAWS FROM, so the two never offer
 * different people, and narrowed by the caller's scope so a coach is not handed a
 * roster of clients they may not see.
 */
export async function circle(user: Scoper) {
  assertStaff(user);
  const scope = await clientScopeWhere(user);
  const rows = await prisma.communityMember.findMany({
    where: { client: { is: scope } },
    include: { client: { select: { id: true, name: true, plan: true } } },
    orderBy: { joinedAt: 'asc' },
  });
    /* the plan key as the shared PLANS map spells it, so a console can look the
     display name up rather than lower-casing an enum itself */
  return rows.map((m) => ({
    clientId: m.clientId,
    name: m.client.name,
    plan: m.client.plan.toLowerCase(),
  }));
}

export async function listZones(user: Scoper) {
  assertStaff(user);
  const scope = await zoneScope(user);
  const rows = await prisma.zone.findMany({
    /* the zone's own membership scope AND the approval gate — a zone you may see
       is still not the community's until somebody lets it out */
    where: { AND: [scope, await approvalScopeFor(user, 'proposedById')] },
    orderBy: { position: 'asc' },
    include: {
      createdBy: { select: { id: true, name: true } },
      members: { include: { client: { select: { id: true, name: true } } } },
      _count: { select: { posts: true } },
    },
  });

  return rows.map((z) => ({
    id: z.id,
    name: z.name,
    createdBy: authorWire(z.createdById),
    createdByName: authorName(z.createdBy),
    members: z.members.map((m) => ({ clientId: m.clientId, name: m.client.name })),
    /* the count in the delete warning: deleting a zone destroys other people's
       writing, and that has to be said out loud with a number on it */
    posts: z._count.posts,
  }));
}

/**
 * Every member has to be in the community circle.
 *
 * The demo's picker can only offer circle members, so this can never fail there —
 * which is exactly why it is checked here: an API is not a picker, and a zone
 * holding somebody who is not in the commons is a room its own members cannot
 * explain.
 */
async function resolveMembers(memberIds: string[]): Promise<string[]> {
  const unique = [...new Set(memberIds)];
  const rows = await prisma.communityMember.findMany({
    where: { clientId: { in: unique } },
    select: { clientId: true },
  });
  const found = new Set(rows.map((r) => r.clientId));
  const missing = unique.filter((id) => !found.has(id));
  if (missing.length) {
    throw ApiError.badRequest('Zones are made from people in the community circle.', { missing });
  }
  return unique;
}

export async function createZone(user: Scoper, input: ZoneInput) {
  await requirePropose(user, 'community.zone.create');
  const memberIds = await resolveMembers(input.memberIds);

  const row = await prisma.zone.create({
    data: {
      name: input.name,
      /* created BY THE HOUSE ACCOUNT, not the acting admin: an official zone
         reads as HAALVING's, and this console has never posted as a person who
         is not doing the posting */
      createdById: null,
      /* and who actually submitted it, which the gate reads and the tab does not */
      proposedById: user.id,
      position: await topPosition(prisma.zone.aggregate({ _min: { position: true } })),
      members: { create: memberIds.map((clientId) => ({ clientId })) },
    },
  });
  await audit.record({
    actorId: user.id,
    action: 'community.zone_created',
    subjectType: 'zone',
    subjectId: row.id,
    meta: { name: row.name, members: memberIds.length },
  });
  return row.id;
}

/**
 * Rename it, and set who is in it.
 *
 * REMOVING SOMEBODY DOES NOT REMOVE WHAT THEY WROTE. Their posts stay in the
 * zone, because they were written to the people who were there and taking them
 * out would edit a conversation on somebody's behalf.
 */
export async function updateZone(user: Scoper, id: string, input: ZoneInput) {
  await requireOwnContent(user, 'zone', id, 'community.zone.update');
  const scope = await zoneScope(user);
  const zone = await prisma.zone.findFirst({ where: { AND: [{ id }, scope] }, select: { id: true } });
  if (!zone) throw ApiError.notFound('No such zone.');

  const memberIds = await resolveMembers(input.memberIds);

  await prisma.$transaction(async (tx) => {
    await tx.zone.update({ where: { id }, data: { name: input.name } });
    await tx.zoneMember.deleteMany({ where: { zoneId: id, clientId: { notIn: memberIds } } });
    for (const clientId of memberIds) {
      /* upsert rather than delete-all-then-create: a member who was already here
         keeps the day they joined, which is the only thing this row records */
      await tx.zoneMember.upsert({
        where: { zoneId_clientId: { zoneId: id, clientId } },
        create: { zoneId: id, clientId },
        update: {},
      });
    }
  });

  await audit.record({
    actorId: user.id,
    action: 'community.zone_updated',
    subjectType: 'zone',
    subjectId: id,
    meta: { name: input.name, members: memberIds.length },
  });
  return id;
}

/**
 * Deleting a zone deletes the posts its members wrote in it — a cascade, and the
 * count comes back so a caller can say so out loud. It cannot be undone.
 */
export async function removeZone(user: Scoper, id: string) {
  await requireOwnContent(user, 'zone', id, 'community.zone.delete');
  const scope = await zoneScope(user);
  const zone = await prisma.zone.findFirst({
    where: { AND: [{ id }, scope] },
    select: { id: true, name: true, _count: { select: { posts: true, members: true } } },
  });
  if (!zone) throw ApiError.notFound('No such zone.');

  await prisma.zone.delete({ where: { id } });
  await audit.record({
    actorId: user.id,
    action: 'community.zone_deleted',
    subjectType: 'zone',
    subjectId: id,
    meta: { name: zone.name, posts: zone._count.posts, members: zone._count.members },
  });
  return { id, posts: zone._count.posts, members: zone._count.members };
}

/* ---------------------------------------------------------- announcements */

/**
 * WHO AN AUDIENCE ACTUALLY IS — the port of `HV.audienceClients` (core.js:1123).
 *
 * Only clients who can actually OPEN THE APP: a client with no login has no
 * thread to deliver into, and counting them would inflate every number the
 * composer shows and every number the reach log keeps.
 *
 * NOT NARROWED BY THE SENDER'S SCOPE, deliberately. "Everyone" has to mean the
 * same thing whoever sends it, or the confirm bar's number becomes a property of
 * the operator rather than of the audience — and that ambiguity is exactly what
 * the single-mode composer exists to avoid. The right to reach every client IS
 * `announceClients`, which is the gate on this call and is held by two roles.
 */
async function audienceClients(spec: AudienceSpec): Promise<string[]> {
  const live: Prisma.ClientWhereInput = { userId: { not: null } };

  if (spec.mode === 'all') {
    const rows = await prisma.client.findMany({ where: live, select: { id: true } });
    return rows.map((c) => c.id);
  }

  if (spec.mode === 'plan') {
    /* only plans on sale: an operator must never target an unlaunched plan and
       watch it silently match nobody */
    const onSale = plansOnSale() as string[];
    const want = (spec.plans ?? []).filter((p) => onSale.includes(p));
    if (!want.length) return [];
    const rows = await prisma.client.findMany({
      where: { AND: [live, { plan: { in: want.map((p) => p.toUpperCase()) as never } }] },
      select: { id: true },
    });
    return rows.map((c) => c.id);
  }

  if (spec.mode === 'coach') {
    const want = spec.staffIds ?? [];
    if (!want.length) return [];
    /* the seat, however it is held. An AI-held or empty seat has no staff id and
       so never matches a real person, which is the answer every other screen
       gives too. */
    const rows = await prisma.client.findMany({
      where: { AND: [live, { pod: { some: { staffId: { in: want } } } }] },
      select: { id: true },
    });
    return rows.map((c) => c.id);
  }

  const want = spec.clientIds ?? [];
  if (!want.length) return [];
  const rows = await prisma.client.findMany({
    where: { AND: [live, { id: { in: want } }] },
    select: { id: true },
  });
  return rows.map((c) => c.id);
}

/** Who has switched announcements off. Absence means ON — see the pref table. */
async function mutedClients(ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const rows = await prisma.clientAnnouncePref.findMany({
    where: { clientId: { in: ids }, on: false },
    select: { clientId: true },
  });
  return rows.map((r) => r.clientId);
}

/**
 * The sentence the operator reads and the record keeps.
 *
 * Built here rather than in the console because it is STORED with the send: a
 * coach who leaves or a plan that is withdrawn must not rewrite the description
 * of an announcement that already went out.
 */
async function audienceLabel(spec: AudienceSpec): Promise<string> {
  if (spec.mode === 'all') return 'Every client';
  if (spec.mode === 'plan') {
    const names = (spec.plans ?? []).map(
      (p) => (PLANS as Record<string, { name: string }>)[p]?.name ?? p,
    );
    return names.join(' · ') || 'No plan chosen';
  }
  if (spec.mode === 'coach') {
    const rows = await prisma.user.findMany({
      where: { id: { in: spec.staffIds ?? [] } },
      select: { name: true },
    });
    return rows.length ? `${rows.map((u) => u.name).join(' · ')}’s clients` : '—';
  }
  const n = (spec.clientIds ?? []).length;
  return n ? `${n} hand-picked` : '—';
}

/**
 * Every deep link the composer may offer, built live from the content that
 * actually exists — so a broadcast can never point at a gathering somebody
 * deleted last week.
 *
 * ZONES ARE NOT OFFERED, and that is a security rule: the client's zone page
 * bounces on a zone that does not exist and never on a non-member, so a
 * broadcast zone link would open five people's private canvas to whoever
 * received it. Gatherings and challenges are public by design; a zone is not.
 */
export async function linkTargets(): Promise<Array<{ route: string; label: string }>> {
  const [gatherings, challenges] = await Promise.all([
    prisma.gathering.findMany({ orderBy: { position: 'asc' }, select: { id: true, title: true } }),
    prisma.challenge.findMany({ orderBy: { position: 'asc' }, select: { id: true, title: true } }),
  ]);
  return [
    ...STANDING_LINK_TARGETS.map((t) => ({ route: t.route, label: t.label })),
    ...gatherings.map((g) => ({ route: `#/tribe/event/${g.id}`, label: `Gathering · ${g.title}` })),
    ...challenges.map((c) => ({
      route: `#/tribe/challenge/${c.id}`,
      label: `Challenge · ${c.title}`,
    })),
  ];
}

/**
 * What the composer needs to draw itself: the pictures it may offer, the links
 * that exist, the plans that may be sold, the coaches whose books can be
 * targeted, and the clients who can be picked one by one.
 */
export async function composer(user: Scoper) {
  assertStaff(user);
  const [links, coaches, clients] = await Promise.all([
    linkTargets(),
    prisma.user.findMany({
      where: {
        status: 'active',
        role: { in: ['dietitian', 'fitness', 'yoga', 'mind', 'doctor', 'opsmgr', 'opshead'] as never },
      },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    }),
    /* only clients who can open the app — the same filter the audience uses, so
       the picker can never offer somebody the send would then drop */
    prisma.client.findMany({
      where: { userId: { not: null } },
      select: { id: true, name: true, plan: true },
      orderBy: { name: 'asc' },
    }),
  ]);
  return {
    modes: AUDIENCE_MODES,
    plans: plansOnSale().map((k) => ({ key: k, name: PLANS[k].name })),
    links,
    coaches,
    clients: clients.map((c) => ({ ...c, plan: c.plan.toLowerCase() })),
    canAnnounce: await canAnnounce(user),
  };
}

/**
 * WHO THIS WOULD GO TO, resolved once.
 *
 * ONE FUNCTION FEEDS THE CONFIRM BAR AND THE SEND — literally the same one, and
 * it returns the ids as well as the counts so the send has no reason to work
 * them out a second time. That is the whole point: the number the operator
 * agreed to cannot disagree with what actually goes out.
 */
async function resolveAudience(spec: AudienceSpec, kind: BroadcastKind) {
  const targeted = await audienceClients(spec);
  const muted = await mutedClients(targeted);
  const reach = reachOf(targeted, muted, kind);
  /* for a NOTICE the opt-out does not apply, so everybody targeted is reached —
     `reachOf` already says so in its counts, and this keeps the list agreeing */
  const reached = kind === 'notice' ? targeted : targeted.filter((id) => !muted.includes(id));
  return { targeted, muted, reached, reach };
}

export async function previewReach(
  user: Scoper,
  input: z.infer<typeof schemas.reachSchema>,
): Promise<Reach & { audienceLabel: string }> {
  assertStaff(user);
  const spec = input.audience as AudienceSpec;
  const [{ reach }, label] = await Promise.all([
    resolveAudience(spec, input.kind),
    audienceLabel(spec),
  ]);
  return { ...reach, audienceLabel: label };
}

export async function listBroadcasts(user: Scoper) {
  assertStaff(user);
  const rows = await prisma.broadcast.findMany({
    orderBy: { sentAt: 'desc' },
    take: 100,
    include: { by: { select: { id: true, name: true } } },
  });
  return rows.map((b) => ({
    id: b.id,
    by: { id: b.by.id, name: b.by.name },
    kind: b.kind === 'NOTICE' ? 'notice' : 'announcement',
    title: b.title,
    text: b.text,
    img: b.img,
    link: b.link,
    audience: b.audience,
    audienceLabel: b.audienceLabel,
    /* the stamp, read back exactly as it was written */
    sent: { targeted: b.targeted, delivered: b.delivered, muted: b.muted },
    sentAt: b.sentAt.toISOString(),
  }));
}

/**
 * SEND — the one act in this module that leaves the community and lands in
 * people's own rooms.
 *
 * `announceClients`, never `manageTribe`: the two are different rights over
 * different surfaces, and the Haalving Coach who runs the community every day
 * does not hold this one.
 *
 * The order of the guards is the order the composer states them in, so the
 * refusal a caller gets is the sentence the screen would have shown:
 *   1. the picture has to be one we actually ship
 *   2. the link has to point at content that exists
 *   3. the audience has to match somebody
 *   4. for an announcement, somebody in it has to be listening
 *
 * OPTED-OUT CLIENTS ARE FILTERED HERE, at send time, and never at render time. A
 * message delivered and then hidden would still take a `seq` in that room and so
 * light an unread dot for something the client can never open — a bug with no
 * clean fix (core.js:1110). It is also what makes `delivered` mean the card is
 * genuinely sitting in the thread.
 */
export async function send(user: Scoper, input: SendInput, opts: { ip?: string } = {}) {
  await requireAnnounce(user, 'community.announce');

  if (input.img && !isBroadcastImage(input.img)) {
    throw ApiError.badRequest(
      'An announcement carries house imagery only — anything else is a broken tile the moment a client is offline.',
      { img: input.img },
    );
  }

  let link: { href: string; label: string } | null = null;
  if (input.link) {
    const targets = await linkTargets();
    if (!targets.some((t) => t.route === input.link)) {
      throw ApiError.badRequest('That link does not point at anything in Community.', {
        link: input.link,
      });
    }
    link = { href: input.link, label: LINK_LABEL };
  }

  const spec = input.audience as AudienceSpec;
  const { reached, reach: r } = await resolveAudience(spec, input.kind);

  if (!r.targeted) throw ApiError.conflict('That audience matches nobody right now.');
  if (!r.delivered) {
    throw ApiError.conflict(
      'Everyone in that audience has announcements off. Mark it an operational notice if it must reach them.',
    );
  }

  const kind: StoredKind = input.kind === 'notice' ? 'NOTICE' : 'ANNOUNCEMENT';
  const mode = spec.mode.toUpperCase() as AudienceMode;
  const label = await audienceLabel(spec);

  const broadcast = await prisma.broadcast.create({
    data: {
      byId: user.id,
      kind,
      title: input.title,
      text: input.text,
      img: input.img,
      link: link ? (link as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      audience: { ...spec, mode } as unknown as Prisma.InputJsonValue,
      audienceLabel: label,
      /* STAMPED, never recalculated */
      targeted: r.targeted,
      delivered: r.delivered,
      muted: r.muted,
    },
  });

  /*
   * One card per room, through `circle.postMessage` — the only writer of a
   * CircleMessage in this codebase, so an announcement inherits the same
   * per-client sequence, the same authorship rule and the same push hook every
   * other message has.
   *
   * STAFF with the sender's own id, never a house pseudo-user: the store keeps
   * honest attribution because somebody has to be answerable for what went out,
   * and the CLIENT's renderer prints HAALVING regardless — an offer is the
   * organisation speaking, not a person.
   *
   * Not one transaction across every recipient: an announcement to two hundred
   * rooms would hold two hundred advisory locks at once, and a single failure
   * would unsend cards that had already arrived. Each delivery is its own fact,
   * and the delivery rows are what say which ones landed.
   */
  /*
   * THE ONE THING THIS PORT FLATTENS. A CircleMessage carries a single `text`
   * column, and an announcement has a headline and a message; they are joined
   * into the line the room renders. The Broadcast row keeps them apart, so when
   * the client's room learns to draw a promo CARD it reads the pair from there
   * through `bcId` — the demo's own arrangement — rather than trying to split
   * this string back up.
   */
  const headline = input.title ? `${input.title} — ${input.text}` : input.text;
  for (const clientId of reached) {
    const message = await postMessage(clientId, {
      fromUserId: user.id,
      fromKind: 'STAFF',
      kind: 'PROMO',
      text: headline,
    });
    await prisma.broadcastDelivery.create({
      data: { broadcastId: broadcast.id, clientId, messageId: message.id },
    });
  }

  await audit.record({
    actorId: user.id,
    action: 'community.announced',
    subjectType: 'broadcast',
    subjectId: broadcast.id,
    meta: { kind, audienceLabel: label, ...r },
    ip: opts.ip ?? null,
  });

  return { id: broadcast.id, ...r, audienceLabel: label };
}
