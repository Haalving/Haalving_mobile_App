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
  dose: Record<string, unknown> | null;
  portion: Record<string, unknown> | null;
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
  days: Record<string, { slots: unknown[]; targets?: unknown }> | null;
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

/** Refused with a 409 while the template is published — unpublish first. */
export function useDeleteTemplate() {
  return useCatalogMutation((id: string) => api.del(`/catalog/templates/${id}`));
}
