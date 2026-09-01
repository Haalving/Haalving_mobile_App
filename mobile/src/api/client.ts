import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

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

/**
 * WHERE THE REFRESH TOKEN LIVES, per platform.
 *
 * On a device it is the OS keychain, which is the point of using it at all.
 *
 * ON WEB THERE IS NO KEYCHAIN. `expo-secure-store` ships no web implementation:
 * calling `getItemAsync` in a browser throws
 * "_ExpoSecureStore.default.getValueWithKeyAsync is not a function", and because
 * the root layout reads the token during its first effect, that exception took
 * the whole app down before anything painted. The pixel harness found it on its
 * first run against a real screen.
 *
 * So web falls back to `localStorage`, and it is worth being plain about what
 * that means: localStorage is NOT secure storage. It is readable by any script on
 * the origin and survives until it is cleared. The web target exists for the
 * harness and for development, never as a way to ship this app to a browser — if
 * that ever changes, this is the line that has to change with it.
 */
const store = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS !== 'web') return SecureStore.getItemAsync(key);
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      /* private mode, or storage disabled: no stored session, which is a valid
         answer rather than a failure */
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    if (Platform.OS !== 'web') return SecureStore.setItemAsync(key, value);
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      /* the session simply will not survive a reload; the app still works */
    }
  },
  async remove(key: string): Promise<void> {
    if (Platform.OS !== 'web') return SecureStore.deleteItemAsync(key);
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      /* nothing stored means nothing to clear */
    }
  },
};

let accessToken: string | null = null;
let refreshing: Promise<string | null> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export async function setRefreshToken(token: string | null): Promise<void> {
  if (token) await store.set(REFRESH_KEY, token);
  else await store.remove(REFRESH_KEY);
}

export function getRefreshToken(): Promise<string | null> {
  return store.get(REFRESH_KEY);
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
