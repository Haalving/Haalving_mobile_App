import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Express 4 does not catch a rejected promise from a handler — it hangs, and the
 * request times out with nothing in the log. Every async route goes through this.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(fn(req, res, next)).catch(next);
  };
}
