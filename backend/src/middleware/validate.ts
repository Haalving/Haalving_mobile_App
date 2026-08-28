import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';

import { ApiError } from '../utils/apiResponse.js';

/**
 * Every request body, query and route param goes through a Zod schema before a
 * controller sees it.
 *
 * The PARSED value replaces the raw one, so a controller can never accidentally
 * read an unvalidated field: `req.body` after this middleware is the schema's
 * output, coercions and defaults applied.
 */

type Source = 'body' | 'query' | 'params';

function flatten(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    /* first message per field: a form shows one line under an input, and a list
       of three ways the same value is wrong helps nobody */
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

export function validate(schema: ZodTypeAny, source: Source = 'body'): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(ApiError.badRequest('Some fields need another look.', flatten(result.error)));
      return;
    }
    /* req.query is a getter on Express 4's prototype in some versions, so assign
       through defineProperty rather than trusting a plain write to stick */
    Object.defineProperty(req, source, { value: result.data, writable: true, configurable: true });
    next();
  };
}

export const validateBody = (s: ZodTypeAny): RequestHandler => validate(s, 'body');
export const validateQuery = (s: ZodTypeAny): RequestHandler => validate(s, 'query');
export const validateParams = (s: ZodTypeAny): RequestHandler => validate(s, 'params');
