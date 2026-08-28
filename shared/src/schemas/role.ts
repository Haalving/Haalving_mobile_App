import { z } from 'zod';

import { navKeyEnum, permEnum } from './common.js';

/**
 * The matrix, edited.
 *
 * KEYS NEVER TRAVEL IN THESE BODIES except to name a role that already exists.
 * Renaming changes `title` and nothing else — a key is what every stored Role
 * row, every `requirePerm` and every saved sidebar points at, and changing one
 * silently removes access rather than renaming it.
 */

export const renameRoleSchema = z.object({
  title: z.string().trim().min(2).max(60),
});
export type RenameRoleInput = z.infer<typeof renameRoleSchema>;

/** One chip, toggled. The GUARD is a server rule, not a shape — see people.ts. */
export const toggleNavSchema = z.object({
  navId: navKeyEnum,
  on: z.boolean(),
});
export type ToggleNavInput = z.infer<typeof toggleNavSchema>;

export const togglePermSchema = z.object({
  perm: permEnum,
  on: z.boolean(),
});
export type TogglePermInput = z.infer<typeof togglePermSchema>;

/**
 * A new role starts from an existing one.
 *
 * "Start from" is not a convenience: a role built from nothing has no nav and no
 * permissions, so the first person given it sees an empty console and reads it as
 * broken. Copying a base makes the new seat immediately meaningful and leaves the
 * differences to be taken away rather than added.
 */
export const createRoleSchema = z.object({
  title: z.string().trim().min(2).max(60),
  baseKey: z.string().trim().min(1).max(60),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
