/**
 * The API client.
 *
 * TWO THINGS IT OWNS, and both exist because getting them wrong is invisible
 * until it is embarrassing:
 *
 *  1. THE ACCESS TOKEN LIVES IN MEMORY, never in localStorage. A token in
 *     localStorage is readable by any script that ends up on the page, and it
 *     survives the tab. The refresh token is in an httpOnly cookie the browser
 *     manages, so a full page load recovers the session by calling /auth/refresh
 *     — which is exactly what the boot sequence does.
 *
 *  2. A 401 REFRESHES ONCE, AND CONCURRENT CALLERS SHARE THAT ONE REFRESH. Six
 *     queries firing on a dashboard would otherwise each rotate the token, and
 *     rotation revokes its predecessor — so five of the six would present a
 *     token that had just been invalidated and the whole family would be killed
 *     as a replay. The single in-flight promise below is what prevents that.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

let accessToken: string | null = null;
let refreshing: Promise<string | null> | null = null;

/** Called by the session store on sign-in and after every refresh. */
export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, string>;

  constructor(status: number, code: string, message: string, details?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** True when a form should paint messages under its fields. */
  get isValidation(): boolean {
    return this.status === 400 && !!this.details;
  }
}

interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; details?: Record<string, string> };
}

async function parse<T>(res: Response): Promise<T> {
  let body: Envelope<T>;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    /* a non-JSON body means something upstream answered instead of the API — a
       proxy error page, usually. Saying so beats "Unexpected token < in JSON". */
    throw new ApiError(res.status, 'bad_response', 'The server sent something we could not read.');
  }

  if (!res.ok || !body.ok) {
    const err = body.error;
    throw new ApiError(
      res.status,
      err?.code ?? 'unknown',
      err?.message ?? 'Something went wrong.',
      err?.details,
    );
  }
  return body.data as T;
}

/**
 * Swap the refresh cookie for a new access token.
 *
 * Shared: every concurrent 401 awaits the same promise, so exactly one rotation
 * happens and the rest use its result.
 */
async function refreshAccessToken(): Promise<string | null> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        if (!res.ok) return null;
        const body = (await res.json()) as Envelope<{ accessToken: string }>;
        const token = body.data?.accessToken ?? null;
        accessToken = token;
        return token;
      } catch {
        return null;
      } finally {
        /* cleared on the next tick so callers that arrived while it was in
           flight still see the settled promise rather than starting a second */
        setTimeout(() => {
          refreshing = null;
        }, 0);
      }
    })();
  }
  return refreshing;
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Internal: stops a refreshed request refreshing again and looping. */
  _retried?: boolean;
}

export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { body, _retried, headers, ...rest } = opts;

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(headers as Record<string, string> | undefined),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (res.status === 401 && !_retried) {
    const token = await refreshAccessToken();
    if (token) return apiFetch<T>(path, { ...opts, _retried: true });
    /* the refresh failed, so the session is genuinely over. The store's
       subscriber sends the user to /login; throwing here keeps the caller from
       rendering half a page against no data. */
    accessToken = null;
    throw new ApiError(401, 'unauthorized', 'Your session has ended. Please sign in again.');
  }

  return parse<T>(res);
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'PUT', body }),
  del: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};

export { API_URL };
