'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { navFor, type NavKey } from '@haalving/shared';

import { Icon } from '@/components/icons/Icon';
import { useSession } from '@/store/session.store';

/**
 * The console shell — sidebar, rail, burger drawer, topbar.
 *
 * Ported from `consoleShell` in core.js:2570. The markup matches the demo's
 * exactly, because app.css styles `.shell-console`, `.side`, `.side-head`,
 * `.side nav button`, `.me`, `.cs-top` and `.cs-main` by name — the classes
 * carry the whole layout, including the rail collapse and the mobile drawer.
 *
 * THE SIDEBAR IS BUILT FROM THE SERVER'S ROLE, in the matrix's own order. It is
 * never sorted, never filtered by anything else, and never assembled from a
 * second list: "which pages exist for this role" has exactly one answer.
 */

const RAIL_KEY = 'hv.console.rail';

export function ConsoleShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const role = useSession((s) => s.role);
  const user = useSession((s) => s.user);

  /**
   * The rail choice is a per-browser convenience, so localStorage is the right
   * home for it — it is not account state and must not travel to another device
   * or wait on a network round trip.
   *
   * Read in an effect rather than during render: reading storage while
   * rendering makes the server and the first client paint disagree, and React
   * throws away the markup.
   */
  const [rail, setRail] = useState(false);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    try {
      setRail(localStorage.getItem(RAIL_KEY) === '1');
    } catch {
      /* private mode: the console simply opens expanded */
    }
  }, []);

  /* a navigation closes the phone drawer — leaving it open over the new page is
     the classic "I tapped a link and nothing happened" */
  useEffect(() => {
    setDrawer(false);
  }, [pathname]);

  if (!role || !user) return null;

  const items = navFor(role.key).filter((i) => role.nav.includes(i.key));

  const toggleRail = () => {
    const next = !rail;
    setRail(next);
    try {
      localStorage.setItem(RAIL_KEY, next ? '1' : '0');
    } catch {
      /* nothing to remember it with; the toggle still works for this visit */
    }
  };

  /* every sub-route declares its parent, so the highlight survives a deep link:
     /clients/c-rajesh lights Clients */
  const isOn = (key: NavKey, path: string, owns: readonly string[]) => {
    if (pathname === path) return true;
    if (pathname.startsWith(`${path}/`)) return true;
    const first = pathname.split('/').filter(Boolean)[0];
    return !!first && (owns.includes(first) || first === key);
  };

  return (
    <div className="shell-console">
      <aside className={`side${rail ? ' rail' : ''}${drawer ? ' open' : ''}`} id="side">
        <div className="side-head">
          <div className="wordmark">HAALVING · CONSOLE</div>
          <button
            type="button"
            id="side-toggle"
            aria-label={rail ? 'Expand menu' : 'Collapse menu to icons'}
            onClick={toggleRail}
          >
            <Icon name={rail ? 'chevR' : 'chevL'} />
          </button>
        </div>

        <nav>
          {items.map((item) => {
            const on = isOn(item.key, item.path, item.owns);
            return (
              <button
                key={item.key}
                type="button"
                /* explicit aria-label: in rail mode the .lbl is display:none and
                   name-from-content would fall through to the count badge — a
                   button announced as "2" instead of "Work Queues (2)" */
                aria-label={item.label}
                aria-current={on ? 'page' : undefined}
                className={on ? 'on' : ''}
                title={rail ? item.label : undefined}
                onClick={() => router.push(item.path)}
              >
                <Icon name={item.icon} />
                <span className="lbl">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="me">
          <b>{user.name}</b>
          <small>{role.title}</small>
          <SignOutButton rail={rail} />
        </div>
      </aside>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="cs-top">
          <button type="button" className="burger" aria-label="Menu" onClick={() => setDrawer((d) => !d)}>
            <Icon name="menu" />
          </button>
          <span className="wordmark">HAALVING</span>
          <span className="sub" style={{ marginLeft: 'auto' }}>
            {user.name}
          </span>
        </div>
        <main className="cs-main" id="view-root">
          {children}
        </main>
      </div>

      {drawer ? <div className="scrim" onClick={() => setDrawer(false)} /> : null}
    </div>
  );
}

function SignOutButton({ rail }: { rail: boolean }) {
  const router = useRouter();
  const clear = useSession((s) => s.clear);

  const signOut = async () => {
    const { api } = await import('@/lib/api');
    try {
      await api.post('/auth/logout', {});
    } catch {
      /* the cookie may already be gone; the local session still has to end */
    }
    /* the hint is what middleware reads as 'there is a session' — leaving it
       behind would send the next navigation into the shell, which would call
       /me, fail, and bounce back here */
    document.cookie = 'hv_nav=; Path=/; Max-Age=0; SameSite=Lax';
    clear();
    router.replace('/login');
  };

  return (
    <button type="button" id="cs-logout" title={rail ? 'Sign out' : undefined} onClick={signOut}>
      <span className="lbl">Sign out </span>
      <Icon name="caretDown" />
    </button>
  );
}
