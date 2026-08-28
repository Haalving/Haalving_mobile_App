import type { Request, Response } from 'express';

import { requireUser } from '../middleware/authenticate.js';
import * as homeService from '../services/home.service.js';
import { loadScoper } from '../services/scope.service.js';
import { ok } from '../utils/apiResponse.js';

export async function summary(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await homeService.summary(scoper));
}
