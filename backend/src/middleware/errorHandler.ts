import { Prisma } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

import { isProd } from '../config/env.js';
import { ApiError, fail } from '../utils/apiResponse.js';
import { logger } from '../utils/logger.js';

/**
 * The one place an error becomes a response.
 *
 * Two rules hold here:
 *
 *  1. A 500 NEVER carries its message to the client. An unexpected error's text
 *     is written by whatever threw it — a driver, a library, a stack frame — and
 *     that text routinely contains a connection string, a column name or a row's
 *     contents. The client gets a generic sentence and the log gets everything.
 *  2. A known error keeps its own message, because those are written for the
 *     person reading them.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): Response {
  if (err instanceof ApiError) {
    if (err.status >= 500) logger.error({ err, path: req.originalUrl }, err.message);
    return fail(res, err.status, err.code, err.message, err.details);
  }

  /* a schema that threw rather than being safeParsed — the validate middleware
     normally catches these, so this is the belt to its braces */
  if (err instanceof ZodError) {
    const details: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || '_';
      if (!(key in details)) details[key] = issue.message;
    }
    return fail(res, 400, 'bad_request', 'Some fields need another look.', details);
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined)?.join(', ') ?? 'value';
      return fail(res, 409, 'conflict', `That ${target} is already in use.`);
    }
    if (err.code === 'P2025') {
      return fail(res, 404, 'not_found', 'Not found.');
    }
    if (err.code === 'P2003') {
      return fail(res, 409, 'conflict', 'That record is still referenced elsewhere.');
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    logger.error({ err: err.message, path: req.originalUrl }, 'prisma validation error');
    return fail(res, 400, 'bad_request', 'That request could not be understood.');
  }

  const e = err as Error;
  logger.error(
    { err: e?.message, stack: e?.stack, path: req.originalUrl, method: req.method },
    'unhandled error',
  );

  return fail(
    res,
    500,
    'internal_error',
    'Something went wrong at our end. The team has been told.',
    /* the real message only ever leaves the process in development */
    isProd ? undefined : e?.message,
  );
}

/** A 404 that goes through the same envelope as everything else. */
export function notFoundHandler(req: Request, res: Response): Response {
  return fail(res, 404, 'not_found', `No route for ${req.method} ${req.path}.`);
}
