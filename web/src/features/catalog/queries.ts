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
  createdBy: { id: string; name: string } | null;
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

function useCatalogMutation<TArgs, TResult>(fn: (a: TArgs) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
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

export function usePublishTemplate() {
  return useCatalogMutation((a: { id: string; published: boolean }) =>
    api.post(`/catalog/templates/${a.id}/publish`, { published: a.published }),
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
