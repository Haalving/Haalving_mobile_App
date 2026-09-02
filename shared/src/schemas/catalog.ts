import { z } from 'zod';

import { PILLAR_KEYS } from '../pillars.js';

/**
 * The Catalog's bodies.
 *
 * `library` is the FIVE, not the four pillars: motivation is a fifth library and
 * not a fifth pillar, so it is enumerated here rather than reusing `pillarEnum` —
 * which would either reject the films or quietly make the product five-pillared.
 */
export const LIBRARY_KEYS = [...PILLAR_KEYS, 'motivation'] as const;
export const libraryEnum = z.enum(LIBRARY_KEYS as unknown as [string, ...string[]]);

/**
 * An item's media — a picture and a clip.
 *
 * `image` is the card art and the top of the instruction sheet; `video` is the
 * film that plays above the text, or a Motivation film's link. Both are a path or
 * a URL, not validated as one — the demo allows `img/tasks/x.webp` as readily as a
 * YouTube link — so this is a bounded string, not `z.string().url()`.
 */
const media = z
  .object({
    image: z.string().trim().max(1000).optional(),
    video: z.string().trim().max(1000).optional(),
  })
  .nullable();

export const createCatalogItemSchema = z.object({
  library: libraryEnum,
  name: z.string().trim().min(2).max(160),
  track: z.string().trim().max(60).nullish(),
  level: z.number().int().min(1).max(20).nullish(),
  tags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  instructions: z.string().trim().max(4000).optional(),
  media: media.optional(),
  /** what to watch for; free text, optional */
  caution: z.string().trim().max(2000).optional(),
  /** anything else worth knowing; free text, optional */
  notes: z.string().trim().max(2000).optional(),
  dose: z.record(z.string(), z.unknown()).nullish(),
  portion: z.record(z.string(), z.unknown()).nullish(),
});
export type CreateCatalogItemInput = z.infer<typeof createCatalogItemSchema>;

export const updateCatalogItemSchema = createCatalogItemSchema
  .omit({ library: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to change' });
export type UpdateCatalogItemInput = z.infer<typeof updateCatalogItemSchema>;

export const archiveCatalogItemSchema = z.object({ archived: z.boolean() });

/** One day of a template: which items sit on it. */
const templateDay = z.object({
  day: z.number().int().min(1).max(60),
  items: z.array(z.string().min(1)).max(20),
});

export const createTemplateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  pillar: libraryEnum,
  /* checked against the PROGRAMME's own level count in the service — the ceiling
     is configurable, so a fixed max here would be a second, staler rule */
  level: z.number().int().min(1).max(20),
  track: z.string().trim().min(1).max(60),
  days: z.array(templateDay).max(60).optional(),
  notes: z.string().trim().max(2000).nullish(),
});
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

export const updateTemplateSchema = createTemplateSchema
  .omit({ pillar: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to change' });
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

export const publishTemplateSchema = z.object({ published: z.boolean() });
