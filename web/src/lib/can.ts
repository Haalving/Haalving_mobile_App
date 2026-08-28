'use client';

import type { NavKey, Perm } from '@haalving/shared';

import { useSession } from '@/store/session.store';

/**
 * The UI's permission tests.
 *
 * These decide what is DRAWN. They never decide what is ALLOWED — the API does
 * that, and it re-checks every rule on every request. A browser is a client and
 * a client can be edited, so hiding a button is a courtesy to the user rather
 * than a control on the system.
 *
 * They read the role from the SERVER's copy (the Role table via /me), not from
 * the shared code matrix, so a runtime edit moves the console with it.
 */

export function useCan(perm: Perm): boolean {
  const role = useSession((s) => s.role);
  return !!role?.perms.includes(perm);
}

export function useCanAny(...perms: Perm[]): boolean {
  const role = useSession((s) => s.role);
  return !!role && perms.some((p) => role.perms.includes(p));
}

/** Console access IS nav membership — the rule `HV.allowedView` keeps. */
export function useHasNav(key: NavKey): boolean {
  const role = useSession((s) => s.role);
  return !!role?.nav.includes(key);
}

export function useRoleTitle(): string {
  const role = useSession((s) => s.role);
  return role?.title ?? '';
}
