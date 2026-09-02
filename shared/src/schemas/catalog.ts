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

/**
 * A template's days — the grammar the seed writes and the client-app reader
 * forwards VERBATIM.
 *
 * `days` is keyed by day-number "1".."60", each a set of `slots`. A slot carries
 * a `label` ("Breakfast", "Warm-up"), an optional `time`, an optional `dose`
 * (a per-slot note or the pillar's dose fields), and `options` — the A/B/C
 * ALTERNATIVES, each a list of catalog-item references. An item is a bare id, or
 * `{id, x}` when a portion is taken more than once. `targets` are the day's macro
 * goals. Nothing here is renamed or flattened, because `slotsFor` in the calendar
 * engine reads `days[String(day)].slots` and hands `options` to the client raw —
 * a different shape makes a client's plate quietly vanish.
 */
const optionEntry = z.union([
  z.string().trim().min(1).max(80),
  z.object({
    id: z.string().trim().min(1).max(80),
    x: z.number().int().min(1).max(20).optional(),
  }),
]);
const templateSlot = z.object({
  pillar: z.string().trim().max(40).optional(),
  label: z.string().trim().min(1).max(80),
  time: z.string().trim().max(10).nullish(),
  options: z.array(z.array(optionEntry).max(20)).min(1).max(6),
  dose: z.record(z.string(), z.unknown()).nullish(),
});
const dayTargets = z.object({
  kcal: z.number().min(0).max(20000).optional(),
  protein: z.number().min(0).max(2000).optional(),
  carbs: z.number().min(0).max(5000).optional(),
  fat: z.number().min(0).max(2000).optional(),
  fibre: z.number().min(0).max(1000).optional(),
});
export const templateDayBody = z.object({
  slots: z.array(templateSlot).max(20),
  targets: dayTargets.nullish(),
});
export type TemplateDayInput = z.infer<typeof templateDayBody>;

/** The whole cycle, keyed by day-number. */
const daysRecord = z.record(z.string(), templateDayBody);

export const createTemplateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  pillar: libraryEnum,
  /* checked against the PROGRAMME's own level count in the service — the ceiling
     is configurable, so a fixed max here would be a second, staler rule */
  level: z.number().int().min(1).max(20),
  track: z.string().trim().min(1).max(60),
  days: daysRecord.optional(),
  notes: z.string().trim().max(2000).nullish(),
});
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

/** The body of `PUT /catalog/templates/:id/days/:day` — one day at a time. */
export const saveTemplateDaySchema = templateDayBody;
export type SaveTemplateDayInput = z.infer<typeof saveTemplateDaySchema>;

export const updateTemplateSchema = createTemplateSchema
  .omit({ pillar: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to change' });
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

export const publishTemplateSchema = z.object({ published: z.boolean() });
