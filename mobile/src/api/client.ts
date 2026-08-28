import * as SecureStore from 'expo-secure-store';

/**
 * The API client, mobile edition.
 *
 * THE DIFFERENCE FROM THE WEB, and it is the only one: there is no cookie jar
 * worth the name on a device, so the refresh token comes back in the body and is
 * kept in the OS keychain (expo-secure-store) rather than in a cookie. The access
 * token still lives in memory only.
 *
 * `X-Client: mobile` is what tells the API which envelope to use. One service,
 * two transports.
 */

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const REFRESH_KEY = 'hv.refresh';

let accessToken: string | null = null;
let refreshing: Promise<string | null> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export async function setRefreshToken(token: string | null): Promise<void> {
  if (token) await SecureStore.setItemAsync(REFRESH_KEY, token);
  else await SecureStore.deleteItemAsync(REFRESH_KEY);
}

export function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_KEY);
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
    throw new ApiError(res.status, 'bad_response', 'The server sent something we could not read.');
  }
  if (!res.ok || !body.ok) {
    const err = body.error;
    throw new ApiError(res.status, err?.code ?? 'unknown', err?.message ?? 'Something went wrong.', err?.details);
  }
  return body.data as T;
}

/**
 * One shared refresh, for the same reason the web has one: rotation revokes its
 * predecessor, so six concurrent 401s each rotating would leave five presenting
 * a token that had just been invalidated — and the API would read that as a
 * replay and kill the whole family.
 */
async function refreshAccessToken(): Promise<string | null> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const stored = await getRefreshToken();
        if (!stored) return null;
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Client': 'mobile' },
          body: JSON.stringify({ refreshToken: stored }),
        });
        if (!res.ok) {
          await setRefreshToken(null);
          return null;
        }
        const body = (await res.json()) as Envelope<{ accessToken: string; refreshToken: string }>;
        accessToken = body.data?.accessToken ?? null;
        if (body.data?.refreshToken) await setRefreshToken(body.data.refreshToken);
        return accessToken;
      } catch {
        return null;
      } finally {
        setTimeout(() => {
          refreshing = null;
        }, 0);
      }
    })();
  }
  return refreshing;
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  _retried?: boolean;
}

export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { body, _retried, headers, ...rest } = opts;

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      'X-Client': 'mobile',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(headers as Record<string, string> | undefined),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (res.status === 401 && !_retried) {
    const token = await refreshAccessToken();
    if (token) return apiFetch<T>(path, { ...opts, _retried: true });
    accessToken = null;
    throw new ApiError(401, 'unauthorized', 'Your session has ended. Please sign in again.');
  }

  return parse<T>(res);
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'PATCH', body }),
};

export { API_URL };
