'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { VIEW_NAV, type NavKey } from '@haalving/shared';

import { LockScreen } from '@/components/shell/LockScreen';
import { useSession } from '@/store/session.store';

/**
 * The in-shell route gate — the port of the demo's router RBAC check.
 *
 * `HV.allowedView`: console access IS nav membership, so a role that gains a
 * sidebar item gains its pages with it and no second list is maintained.
 *
 * This runs BESIDE the edge middleware rather than instead of it. Middleware
 * decides optimistically from a role hint the browser carries, which can be
 * stale for exactly as long as it takes the next `/me` to land; this one decides
 * from the session the server just returned. Neither is the enforcement — the
 * API re-checks every request, and that is the gate that binds.
 */
export function NavGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const role = useSession((s) => s.role);

  const view = pathname.split('/').filter(Boolean)[0] ?? 'home';
  const needs: NavKey | undefined = VIEW_NAV[view];

  /* an unknown view is not a console page at all (/locked is one) — it renders,
     and its own page decides what to show */
  if (!needs) return <>{children}</>;
  if (!role) return null;
  if (role.nav.includes(needs)) return <>{children}</>;

  return <LockScreen path={pathname} />;
}
