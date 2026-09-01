/**
 * RBAC — ported VERBATIM from demo/app/js/core.js (`HV.ROLES`, `HV.NAV_ITEMS`).
 *
 * Nothing here may be added, removed or renamed. The demo enforces access twice
 * on purpose — the router blocks the route, and sensitive sub-sections re-check
 * `HV.can()` inside the view — and the production port keeps that shape, with a
 * third and final gate in the API. This file is the single source all three read.
 *
 * `home` and `route` keep the demo's hash strings so a diff against core.js is
 * literal. `homePath()` / `navPath()` derive the Next.js path from them, which is
 * the only transformation this port applies.
 */

/** The console's own vocabulary for a sidebar item. */
export const NAV_KEYS = [
  'home',
  'clients',
  'queues',
  'schedule',
  'catalog',
  'community',
  'people',
  'leave',
  'config',
] as const;
export type NavKey = (typeof NAV_KEYS)[number];

/**
 * Every permission the matrix below hands out — the union of its `perms` arrays.
 * Typed as a closed set so a typo in a `can()` call is a compile error rather
 * than a silent `false`, which in an access check reads as a policy decision
 * instead of a bug.
 */
export const PERMS = [
  'seeAllClients',
  'seeDeptClients',
  'approve',
  'allocate',
  'editRules',
  'sendDigest',
  'keyInBody',
  'overrideCapacity',
  'finalizeLevel',
  'editAnyCatalog',
  'editCatalog',
  'editTemplates',
  'assignPlan',
  'manageTribe',
  'managePeople',
  'manageConfig',
  'assignPod',
  'broadcast',
  'announceClients',
  'approveLeave',
  'joinAnySession',
  'rawRecords',
  'signSummary',
  'rateMeals',
  'buildDiet',
  'buildCharts',
  'reassignLeave',
  /*
   * ownsOnboarding — A DELIBERATE DEPARTURE FROM THE DEMO, and the only key in
   * this file the demo does not carry.
   *
   * The demo puts ten roles on the Onboarding board and narrows the DETAIL each
   * one sees. HAALVING runs it the other way: onboarding is one desk, and the
   * Super Admin is sitting at it. Trainer allocation happens during onboarding,
   * so allocation is a Super-Admin act and a coach meets a client at promotion.
   *
   * It is a PERMISSION rather than a role check so that widening it later — to
   * the Operations Head, say — is a row edit in People & Access rather than a
   * deploy. That is how the rest of this console treats authority, and a
   * hasRole('admin') scattered across twelve routes would not have been.
   */
  'ownsOnboarding',
  /*
   * seeAllDeviations — the third departure, and the one that makes the Deviations
   * board mean something to a coach.
   *
   * `seeAllClients` is the wrong question here. The Haalving Coach holds it, so
   * the board answered "every deviation in the building" to somebody who can only
   * act on their own pod — a list you cannot work is noise, and noise is what
   * stops a board being read at all. Deviations now scope BY POD SEAT, and this
   * permission is the exemption: the seat that must see every one because it is
   * the seat every SLA escalates to.
   */
  'seeAllDeviations',
  /*
   * bookAnyone — the fourth departure, and the one that makes the Schedule sheet
   * tell the truth about who you may put on a task.
   *
   * Without it the New-task sheet offered every client and every colleague to
   * anybody who could open it, and `create` enforced nothing at all — the pickers
   * were the only gate, which means they were no gate. The rule is now that you
   * book YOURSELF and anyone who allocates (the Super Admin, the Haalving Coach,
   * the Operations Head, a Head of Department) — upward and sideways, never onto a
   * coach's calendar — and only for clients whose pod you sit on.
   *
   * This is the exemption from both halves: any person, any client. It is one key
   * rather than two because the question the sheet asks is single — who may be on
   * this task — and splitting it would let a seat book a client it cannot staff.
   */
  'bookAnyone',
  /*
   * approveCommunity — the fifth departure, and one key for four kinds.
   * than a role check.
   *
   * A gathering, a challenge, a game day or a zone goes onto every client's
   * Community tab at once, so letting one out is nearer to broadcasting than to
   * editing. One key rather than four: the question each kind asks is the same
   * question, and four keys held by the same seat would be four ways to say it. WRITING one is a low bar on
   * purpose — a proposal is inert until somebody approves it, and the whole
   * value of the gate is that it makes proposing safe.
   *
   * No existing permission is the Super Admin's alone: `manageConfig` and
   * `announceClients` are both the Operations Head's too, so reusing either
   * would hand him the gate today rather than leaving that a decision somebody
   * makes later in People & Access.
   *
   * Holding it is necessary and not sufficient — the service also refuses your
   * own gathering, whoever you are. A second pair of eyes is the point.
   */
  'approveCommunity',
] as const;
export type Perm = (typeof PERMS)[number];

export type Shell = 'client' | 'console';

export interface RoleDef {
  /** The role's name as the product says it out loud. */
  title: string;
  /** Which of the two apps this role signs into. */
  shell: Shell;
  /** Where a fresh login lands, as the demo's hash route. */
  home: string;
  /** Which sidebar items exist for this role. Absent for the client shell. */
  nav?: readonly NavKey[];
  /** What this role may do, consulted through `can()`. */
  perms?: readonly Perm[];
}

/**
 * THE MATRIX — verbatim from core.js:930.
 *
 * `ai` is a pseudo-role: `HV.staff()` synthesises an AI-coach user for any id it
 * does not know, so an unfilled pillar seat renders as the AI without special-
 * casing. No stored user ever carries it, which is why the database's user-role
 * enum has eleven members while this object has twelve.
 */
export const ROLES = {
  client: { title: 'Client', shell: 'client', home: '#/today' },

  admin: {
    title: 'Super Admin',
    shell: 'console',
    home: '#/home',
    nav: ['home', 'clients', 'queues', 'schedule', 'catalog', 'community', 'people', 'leave', 'config'],
    perms: [
      'seeAllClients', 'approve', 'allocate', 'editRules', 'sendDigest', 'keyInBody',
      'overrideCapacity', 'finalizeLevel', 'editAnyCatalog', 'editTemplates',
      'assignPlan', 'manageTribe', 'managePeople', 'manageConfig',
      'assignPod', 'broadcast', 'announceClients', 'approveLeave', 'joinAnySession',
      /* the keys that are ours, not the demo's — see PERMS above */
      'ownsOnboarding',
      'seeAllDeviations',
      'bookAnyone',
      'approveCommunity',
    ],
  },

  /* Haalving Coach — lead client coach; first signature on every chain (was Ops Manager) */
  opsmgr: {
    title: 'Haalving Coach',
    shell: 'console',
    home: '#/home',
    nav: ['home', 'clients', 'queues', 'schedule', 'catalog', 'community', 'leave'],
    perms: [
      'seeAllClients', 'approve', 'allocate', 'sendDigest',
      'assignPlan', 'editTemplates', 'manageTribe',
      /*
       * rateMeals — OURS, not the demo's, and the second deliberate departure.
       *
       * The demo gives this to the Dietician alone. HAALVING puts the plate in
       * front of the coach who owns that client's pod: the Haalving Coach rates,
       * the Dietician rates on the nutrition pillar, and the Super Admin watches
       * a board it cannot write to. That read-only stance is the whole reason the
       * meal SLA escalates TO admin — an escalation is worth nothing if the seat
       * it reaches is the seat already holding the pen.
       */
      'rateMeals',
    ],
  },

  opshead: {
    title: 'Operations Head',
    shell: 'console',
    home: '#/home',
    nav: ['home', 'clients', 'queues', 'schedule', 'catalog', 'community', 'people', 'leave', 'config'],
    perms: [
      'seeAllClients', 'approve', 'allocate', 'overrideCapacity', 'editRules',
      'finalizeLevel', 'sendDigest', 'editAnyCatalog', 'editTemplates',
      'assignPlan', 'manageTribe', 'manageConfig',
      'assignPod', 'broadcast',
      /*
       * announceClients IS GONE FROM THIS SEAT, and it is the sixth departure.
       *
       * The demo gives it to the Operations Head as well. An announcement lands
       * in every client's own thread at once — it is the one act on this console
       * that reaches people outside the building, and it cannot be recalled. That
       * is the Super Admin's to make.
       *
       * `broadcast` above is untouched and is a DIFFERENT right: it posts to the
       * STAFF feed, which stays inside the team. The two were always two
       * permissions precisely because they are two audiences.
       */
    ],
  },

  /* Super User — management reviewer; final signature; read-only elsewhere */
  core: {
    title: 'Super User',
    shell: 'console',
    home: '#/queues/approvals',
    nav: ['home', 'clients', 'queues', 'schedule', 'catalog', 'community', 'people', 'leave', 'config'],
    perms: ['seeAllClients', 'approve'],
  },

  doctor: {
    title: 'Doctor',
    shell: 'console',
    home: '#/home',
    nav: ['home', 'clients', 'queues', 'schedule', 'catalog', 'leave'],
    perms: ['rawRecords', 'signSummary'],
  },

  dietitian: {
    title: 'Dietician',
    shell: 'console',
    home: '#/queues/meals',
    nav: ['home', 'clients', 'queues', 'schedule', 'catalog', 'leave'],
    perms: ['rateMeals', 'buildDiet', 'editCatalog'],
  },

  fitness: {
    title: 'Fitness Coach',
    shell: 'console',
    home: '#/home',
    nav: ['home', 'clients', 'queues', 'schedule', 'catalog', 'leave'],
    perms: ['buildCharts', 'editCatalog'],
  },

  yoga: {
    title: 'Yoga Coach',
    shell: 'console',
    home: '#/home',
    nav: ['home', 'clients', 'queues', 'schedule', 'catalog', 'leave'],
    perms: ['buildCharts', 'editCatalog'],
  },

  mind: {
    title: 'Mind Wellness Coach',
    shell: 'console',
    home: '#/home',
    nav: ['home', 'clients', 'queues', 'schedule', 'catalog', 'leave'],
    perms: ['buildCharts', 'editCatalog'],
  },

  /* Head of Department — leads one of the four coach benches (u.dept says
     which); sees the dept's clients, runs its cover board on leave */
  hod: {
    title: 'Head of Department',
    shell: 'console',
    home: '#/home',
    nav: ['home', 'clients', 'queues', 'schedule', 'catalog', 'people', 'leave'],
    perms: ['seeDeptClients', 'allocate', 'assignPod', 'approve', 'broadcast', 'reassignLeave'],
  },

  ai: { title: 'AI Coach', shell: 'console', home: '#/home', nav: [], perms: [] },
} as const satisfies Record<string, RoleDef>;

export type Role = keyof typeof ROLES;

/** Every role key, including the `ai` pseudo-role. */
export const ROLE_KEYS = Object.keys(ROLES) as Role[];

/**
 * The roles a real user record may carry — eleven. `ai` is excluded because
 * `HV.staff()` invents that user rather than reading one, and a stored `ai`
 * account would sign house content "AI Coach", which the product forbids: a
 * Poorna client never hears the AI.
 */
export const STORABLE_ROLE_KEYS = ROLE_KEYS.filter((k) => k !== 'ai') as Exclude<Role, 'ai'>[];

/** The ten roles that sign into the Team Console. */
export const STAFF_ROLE_KEYS = STORABLE_ROLE_KEYS.filter((k) => k !== 'client');

/**
 * NAV_ITEMS — verbatim from core.js:1004.
 *
 * `owns` lists the sub-routes that light a parent, so a deep link never leaves
 * the sidebar with nothing marked.
 */
export const NAV_ITEMS = {
  home: { route: '#/home', label: 'Home', icon: 'home', owns: ['reports'] },
  clients: { route: '#/clients', label: 'Clients', icon: 'users', owns: ['client', 'review'] },
  queues: { route: '#/queues', label: 'Work Queues', icon: 'clock', owns: ['approvals', 'meals', 'medical', 'builder'] },
  schedule: { route: '#/schedule', label: 'Schedule', icon: 'cal' },
  catalog: { route: '#/catalog', label: 'Catalog', icon: 'bookmark' },
  /* Community — the console side of the client's Community tab. Same word,
     same honeycomb mark the client tab bar carries, so staff and clients
     name the one place identically (TJ, 17 Aug; was 'Tribe' at #/tribe-admin) */
  community: { route: '#/community', label: 'Community', icon: 'tribe' },
  people: { route: '#/people', label: 'People & Access', icon: 'user' },
  leave: { route: '#/leave', label: 'Time & Cover', icon: 'cal' },
  config: { route: '#/config', label: 'Configuration', icon: 'gear' },
} as const satisfies Record<NavKey, { route: string; label: string; icon: string; owns?: readonly string[] }>;

/**
 * view name -> owning sidebar item. Console access IS nav membership, so a role
 * whose nav gains an item gains its pages with it. Verbatim from `HV.VIEW_NAV`.
 */
export const VIEW_NAV: Record<string, NavKey> = {
  home: 'home', reports: 'home',
  clients: 'clients', client: 'clients', review: 'clients',
  queues: 'queues', approvals: 'queues', meals: 'queues', medical: 'queues', builder: 'queues',
  schedule: 'schedule', catalog: 'catalog', library: 'catalog',
  community: 'community', people: 'people', leave: 'leave', config: 'config',
};

/* ---------------------------------------------------------------- helpers */

/** The demo's `#/clients` becomes the console's `/clients`. The ONE transform. */
export function hashToPath(hash: string): string {
  return hash.startsWith('#') ? hash.slice(1) : hash;
}

export function roleDef(role: string): RoleDef | null {
  return (ROLES as Record<string, RoleDef>)[role] ?? null;
}

export function roleTitle(role: string): string {
  return roleDef(role)?.title ?? role;
}

/** Where this role's login lands, as a real path. */
export function homePath(role: string): string {
  const def = roleDef(role);
  return def ? hashToPath(def.home) : '/login';
}

export function navPath(key: NavKey): string {
  return hashToPath(NAV_ITEMS[key].route);
}

/** `HV.can` — the only permission test. Unknown role or unknown perm is false. */
export function can(role: string | null | undefined, perm: Perm): boolean {
  if (!role) return false;
  const def = roleDef(role);
  return !!def?.perms?.includes(perm);
}

/** Does this role's sidebar carry this item? Console access is nav membership. */
export function hasNav(role: string | null | undefined, key: NavKey): boolean {
  if (!role) return false;
  const def = roleDef(role);
  return !!def?.nav?.includes(key);
}

export interface NavEntry {
  key: NavKey;
  path: string;
  label: string;
  icon: string;
  owns: readonly string[];
}

/** The sidebar for a role, in the matrix's own order — never re-sorted. */
export function navFor(role: string | null | undefined): NavEntry[] {
  const def = roleDef(role ?? '');
  if (!def?.nav) return [];
  return def.nav.map((key) => {
    const item = NAV_ITEMS[key];
    return {
      key,
      path: navPath(key),
      label: item.label,
      icon: item.icon,
      owns: 'owns' in item ? item.owns : [],
    };
  });
}

/**
 * The router gate. A console view is allowed when the role's sidebar carries the
 * item that owns it — so a runtime role edit that ticks a nav box grants the
 * pages with it, exactly as the demo behaves.
 */
export function allowedView(role: string | null | undefined, viewName: string): boolean {
  const def = roleDef(role ?? '');
  if (!def || def.shell !== 'console') return false;
  const nav = VIEW_NAV[viewName];
  return !!nav && !!def.nav?.includes(nav);
}

/** Which console view a path belongs to: `/clients/c-rajesh` -> `clients`. */
export function viewNameFromPath(pathname: string): string {
  const first = pathname.split('/').filter(Boolean)[0];
  return first ?? 'home';
}

export function isStaffRole(role: string): boolean {
  return roleDef(role)?.shell === 'console' && role !== 'ai';
}

export function isClientRole(role: string): boolean {
  return role === 'client';
}
