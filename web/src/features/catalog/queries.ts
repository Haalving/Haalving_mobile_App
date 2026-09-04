'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

/**
 * The Catalog — five libraries and the templates built out of them.
 *
 * ONE READ FOR THE WHOLE PAGE. Every tab is a slice of the same answer, and the
 * tag counts on one library are computed against the items in that same payload,
 * so a chip can never advertise a number the list below it does not have.
 *
 * WHO MAY AUTHOR WHERE comes back per library rather than being inferred from the
 * role here: a pillar coach owns one aisle and reads the other four, and
 * `editAnyCatalog` opens all five. `canEdit` on the library is the server's
 * answer to that question and the only one this page asks.
 */

export interface CatalogItem {
  id: string;
  library: string;
  name: string;
  /** The category — 'sedentary' | 'moderate' | 'active'. Null for a film. */
  track: string | null;
  level: number | null;
  archived: boolean;
  tags: string[];
  instructions: string;
  media: { image: string | null; video: string | null } | null;
  /** what to watch for; free text */
  caution: string;
  /** anything else worth knowing; free text */
  notes: string;
  /** per-portion macros — the editor sums an option's from these */
  nutrients: ItemNutrients | null;
  dose: Record<string, unknown> | null;
  portion: Record<string, unknown> | null;
}

export interface ItemNutrients {
  kcal?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fibre?: number;
  micros?: Array<{ k: string; v: number }>;
}

/* ---- a template day's grammar, exactly as the client-app reader forwards it ---- */

/** One catalog item in an option — a bare id, or an id taken `x` portions over. */
export type OptionEntry = string | { id: string; x?: number };
export interface TemplateSlot {
  pillar?: string;
  label: string;
  time?: string | null;
  /** the A/B/C alternatives — each a list of items taken together */
  options: OptionEntry[][];
  dose?: Record<string, unknown> | null;
}
export interface DayTargets {
  kcal?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fibre?: number;
}
export interface TemplateDay {
  slots: TemplateSlot[];
  targets?: DayTargets | null;
}

export interface Library {
  key: string;
  name: string;
  canEdit: boolean;
  items: CatalogItem[];
}

/**
 * Where a template sits on the `template` approval chain (Ops Head, then Super
 * User). `published` stays the source of truth for "assignable / frozen"; this is
 * the reading BETWEEN draft and published — whose desk it is on, or why it came
 * back — and it is null for a draft nobody has sent up yet.
 */
export interface TemplateApproval {
  id: string;
  status: 'DRAFT' | 'SUBMITTED' | 'PUBLISHED';
  stage: number;
  /** role KEY the item waits on, only while SUBMITTED */
  waitingOn: string | null;
  /** that seat's CURRENT title — keys are history, words are live */
  waitingOnTitle: string | null;
  /** set when a signer returned it; status is then DRAFT again */
  returnReason: string | null;
}

export interface PlanTemplate {
  id: string;
  name: string;
  pillar: string;
  level: number;
  track: string;
  /** Keyed 1..14; a day a pillar does not run is PRESENT with empty slots. */
  days: Record<string, TemplateDay> | null;
  notes: string | null;
  published: boolean;
  approval: TemplateApproval | null;
  createdBy: { id: string; name: string } | null;
}

/**
 * The four readings a template can give, in the order they win.
 *
 * Both the list's pill and the editor's lock read THIS, so the two screens cannot
 * call one template two things. `published` wins outright because a published
 * row's approval is finished history; a returned item is a draft again, so it is
 * told apart from a plain draft only by the reason the signer left.
 */
export type TemplateState = 'published' | 'inflight' | 'returned' | 'draft';
export function templateState(t: PlanTemplate): TemplateState {
  if (t.published) return 'published';
  if (t.approval?.status === 'SUBMITTED') return 'inflight';
  if (t.approval?.status === 'DRAFT' && t.approval.returnReason) return 'returned';
  return 'draft';
}

export interface CatalogData {
  libraries: Library[];
  templates: PlanTemplate[];
  categories: Array<{ key: string; name: string; seeded: boolean }>;
  tags: Array<{ id: string; name: string; slug: string }>;
  canEditAny: boolean;
}

const KEY = ['catalog'] as const;

export function useCatalog() {
  return useQuery({ queryKey: KEY, queryFn: () => api.get<CatalogData>('/catalog') });
}

/**
 * Every write re-reads the catalog. `also` names any OTHER page's read the write
 * moves — the queues, when a template goes up the chain — because a badge over
 * there reading the old count is the kind of drift the demo recorded as a bug.
 */
function useCatalogMutation<TArgs, TResult>(
  fn: (a: TArgs) => Promise<TResult>,
  also: ReadonlyArray<readonly unknown[]> = [],
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      for (const k of also) void qc.invalidateQueries({ queryKey: k });
    },
  });
}

export interface ItemBody {
  library: string;
  name: string;
  track?: string | null;
  tags?: string[];
  instructions?: string;
  media?: { image?: string | null; video?: string | null } | null;
  caution?: string;
  notes?: string;
}

export function useSaveItem() {
  return useCatalogMutation((a: { id?: string; body: ItemBody }) =>
    a.id ? api.patch(`/catalog/items/${a.id}`, a.body) : api.post('/catalog/items', a.body),
  );
}

/**
 * ARCHIVED, NEVER DELETED.
 *
 * A template or a client's live plan may already name this item, and a hard
 * delete would leave a recipe with a missing ingredient and no explanation. The
 * server has no delete route for an item at all — this is the only door.
 */
export function useArchiveItem() {
  return useCatalogMutation((a: { id: string; archived: boolean }) =>
    api.post(`/catalog/items/${a.id}/archive`, { archived: a.archived }),
  );
}

export interface TemplateBody {
  name: string;
  pillar: string;
  level: number;
  track: string;
  days?: Array<{ day: number; items: unknown[] }>;
  notes?: string | null;
}

export function useSaveTemplate() {
  return useCatalogMutation((a: { id?: string; body: TemplateBody }) =>
    a.id ? api.patch(`/catalog/templates/${a.id}`, a.body) : api.post('/catalog/templates', a.body),
  );
}

/** What `{ published: true }` answers with: the row as the catalog now reads it, and the approval it rides. */
export interface PublishResult {
  template: PlanTemplate;
  approval: TemplateApproval | null;
}

/**
 * ONE ROUTE, TWO MOVES. `published: true` no longer flips a flag — it SENDS THE
 * TEMPLATE UP THE `template` CHAIN (creating the approval, or resubmitting a
 * returned one); the last signature in Work Queues › Approvals is what publishes.
 * The server refuses with a 409 when it is already published or already in
 * flight, and with a 400 when no day has been written yet — the message is the
 * toast. `published: false` still unpublishes directly, the reversible move.
 *
 * The queues are re-read too: the item just landed on somebody's Approvals board
 * and the tab badge counts it.
 */
export function usePublishTemplate() {
  return useCatalogMutation(
    (a: { id: string; published: boolean }) =>
      api.post<PublishResult>(`/catalog/templates/${a.id}/publish`, { published: a.published }),
    [['queues']],
  );
}

/** Save ONE day of a template's cycle — the editor's "Save day N". */
export function useSaveTemplateDay() {
  return useCatalogMutation((a: { id: string; day: number; body: TemplateDay }) =>
    api.put(`/catalog/templates/${a.id}/days/${a.day}`, a.body),
  );
}

/** "Duplicate to edit" — a published template's copy is a fresh draft. */
export function useDuplicateTemplate() {
  return useCatalogMutation((id: string) =>
    api.post<PlanTemplate>(`/catalog/templates/${id}/duplicate`),
  );
}

/** Refused with a 409 while the template is published — unpublish first. */
export function useDeleteTemplate() {
  return useCatalogMutation((id: string) => api.del(`/catalog/templates/${id}`));
}
