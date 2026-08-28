import { NextResponse, type NextRequest } from 'next/server';
import { VIEW_NAV, type NavKey } from '@haalving/shared';

/**
 * The edge gate.
 *
 * WHAT IT IS AND IS NOT. This is an OPTIMISTIC check, exactly as the demo's
 * router is: it stops a wrong page being painted, and it is not what makes the
 * data safe. The API re-checks every rule on every request and is the only gate
 * that binds. If the two ever disagree, the API wins and the user sees a refusal
 * from it — which is the correct failure direction.
 *
 * WHY A HINT COOKIE RATHER THAN THE REAL SESSION. The access token lives in
 * memory only (a token in localStorage is readable by any script that reaches
 * the page), and the refresh token is httpOnly and deliberately scoped to
 * /api/v1/auth. Middleware therefore cannot know the caller's role without
 * minting a token of its own on every navigation — a second, drifting copy of
 * the auth flow at the edge. Instead the console writes a NON-SECRET hint after
 * each `/me`: the role key and its nav list, which are the same for everyone
 * holding that role and grant nothing on their own. Forging it buys a redirect
 * and nothing else; the API still answers 403.
 */

/**
 * The session hint. It carries the role key and its nav list, and its PRESENCE is
 * what tells middleware a session exists.
 *
 * It cannot use the refresh cookie for that: the refresh cookie is httpOnly and
 * deliberately scoped to /api/v1/auth, so the browser never sends it to the Next
 * server at all — middleware would see every visitor as signed out and bounce
 * them to /login in a loop. Narrowing that cookie is the right call (it should
 * ride along with nothing but the auth routes), so the hint carries the signal
 * instead.
 *
 * Forging it buys a redirect and nothing else. The API is the gate that binds,
 * and a page reached with a forged hint answers 401 on its first request and
 * sends the visitor straight back to /login.
 */
const HINT_COOKIE = 'hv_nav';

/** Paths that are not console pages and never need a role. */
const PUBLIC = ['/login', '/locked'];

interface NavHint {
  role: string;
  nav: string[];
}

function readHint(req: NextRequest): NavHint | null {
  const raw = req.cookies.get(HINT_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'role' in parsed &&
      'nav' in parsed &&
      Array.isArray((parsed as NavHint).nav)
    ) {
      return parsed as NavHint;
    }
  } catch {
    /* a corrupt hint is treated as no hint — the page renders and NavGate,
       which reads the real session, decides */
  }
  return null;
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const hint = readHint(req);

  /* the console's front door: send an arriving visitor to their role's home,
     which the demo does through HV.ROLES[role].home */
  if (pathname === '/') {
    const url = req.nextUrl.clone();
    url.pathname = hint ? '/home' : '/login';
    return NextResponse.redirect(url);
  }

  /* no hint at all means no session to recover — go straight to the login
     screen rather than painting a shell that will immediately empty */
  if (!hint) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = pathname === '/home' ? '' : `?from=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  const view = pathname.split('/').filter(Boolean)[0] ?? 'home';
  const needs: NavKey | undefined = VIEW_NAV[view];
  if (!needs) return NextResponse.next();

  if (hint.nav.includes(needs)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/locked';
  url.search = `?from=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  /* everything except Next's own assets and the public files. A middleware that
     runs on /_next/static costs a hop on every chunk for no decision. */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|fonts|media|.*\\.svg$).*)'],
};
