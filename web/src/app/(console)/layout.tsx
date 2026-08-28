'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { ConsoleShell } from '@/components/shell/ConsoleShell';
import { NavGate } from '@/components/shell/NavGate';
import { api, ApiError, setAccessToken } from '@/lib/api';
import { useSession, type SessionRole, type SessionUser } from '@/store/session.store';

/**
 * The console's boot sequence.
 *
 * A full page load has NO access token — it lives in memory only. What survives
 * is the httpOnly refresh cookie, so the first thing this does is call `/me`,
 * which answers 401, which the API client turns into a silent refresh, and the
 * session comes back. That is the whole recovery path, and it is exactly why the
 * token is never put in localStorage.
 *
 * While it settles the shell renders NOTHING rather than a login form. Flashing
 * "sign in" at someone who is already signed in is the most common failure of
 * this pattern, and it reads as the app having logged them out.
 */

const HINT_COOKIE = 'hv_nav';

/**
 * The middleware's optimistic hint: the role key and its nav list.
 *
 * NOT httpOnly and NOT a secret — it is the same for everyone holding the role
 * and grants nothing on its own. Forging it buys a redirect; the API still
 * answers 403. `SameSite=Lax` so it does not ride along with a cross-site
 * request, and a session lifetime so it dies with the tab rather than outliving
 * a role change on a shared machine.
 */
function writeNavHint(role: SessionRole): void {
  try {
    const value = encodeURIComponent(JSON.stringify({ role: role.key, nav: role.nav }));
    document.cookie = `${HINT_COOKIE}=${value}; Path=/; SameSite=Lax`;
  } catch {
    /* no cookie: middleware falls through and the in-shell gate decides */
  }
}

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const setSession = useSession((s) => s.setSession);
  const clear = useSession((s) => s.clear);
  const ready = useSession((s) => s.ready);
  const user = useSession((s) => s.user);

  const { data, isError, error } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<{ user: SessionUser; role: SessionRole }>('/me'),
    retry: false,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!data) return;
    setSession(data.user, data.role);
    writeNavHint(data.role);
  }, [data, setSession]);

  useEffect(() => {
    if (!isError) return;
    if (error instanceof ApiError && error.status === 401) {
      setAccessToken(null);
      /* the session is genuinely over, so the hint must go with it */
      document.cookie = 'hv_nav=; Path=/; Max-Age=0; SameSite=Lax';
      clear();
      router.replace('/login');
    }
  }, [isError, error, clear, router]);

  if (!ready || !user) {
    /* deliberately blank — see the note above */
    return null;
  }

  return (
    <ConsoleShell>
      <NavGate>{children}</NavGate>
    </ConsoleShell>
  );
}
