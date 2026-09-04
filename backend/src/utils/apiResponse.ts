import type { Response } from 'express';

/**
 * One response envelope, so every client can unwrap the same shape.
 *
 *   { ok: true,  data }
 *   { ok: false, error: { code, message, details? } }
 *
 * `code` is a stable machine string; `message` is a sentence a human would say.
 * Both frontends key their handling on `code` and show `message`, which is why
 * neither may be dropped when the other seems enough.
 */

export interface ApiOk<T> {
  ok: true;
  data: T;
}

export interface ApiErr {
  ok: false;
  error: { code: string; message: string; details?: unknown };
}

export function ok<T>(res: Response, data: T, status = 200): Response {
  return res.status(status).json({ ok: true, data } satisfies ApiOk<T>);
}

export function created<T>(res: Response, data: T): Response {
  return ok(res, data, 201);
}

export function noContent(res: Response): Response {
  return res.status(204).end();
}

export function fail(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): Response {
  const body: ApiErr = { ok: false, error: { code, message } };
  if (details !== undefined) body.error.details = details;
  return res.status(status).json(body);
}

/**
 * A thrown error that already knows its status. Services throw these; the error
 * handler is the only thing that turns one into a response.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, 'bad_request', message, details);
  }
  static unauthorized(message = 'Sign in to continue.'): ApiError {
    return new ApiError(401, 'unauthorized', message);
  }
  static forbidden(message = 'Not available for your role.'): ApiError {
    return new ApiError(403, 'forbidden', message);
  }
  static notFound(message = 'Not found.'): ApiError {
    return new ApiError(404, 'not_found', message);
  }
  static conflict(message: string, details?: unknown): ApiError {
    return new ApiError(409, 'conflict', message, details);
  }
  static tooMany(message = 'Too many attempts. Try again shortly.'): ApiError {
    return new ApiError(429, 'too_many_requests', message);
  }
  /**
   * A dependency this request needed is not available — object storage with no
   * credentials, most often. 503 rather than 500: nothing is broken, something is
   * unconfigured, and the difference decides whether a person retries or a person
   * edits an .env.
   */
  static unavailable(message: string): ApiError {
    return new ApiError(503, 'unavailable', message);
  }
}
