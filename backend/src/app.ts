import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

import { env, isTest } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { globalLimiter } from './middleware/rateLimit.js';
import routes from './routes/index.js';
import { logger } from './utils/logger.js';
import { ok } from './utils/apiResponse.js';

export function createApp(): Express {
  const app = express();

  /**
   * Behind a proxy in every deployment, so `req.ip` must come from
   * X-Forwarded-For or every rate limiter buckets the whole internet under one
   * address — the load balancer's.
   *
   * `1`, not `true`: trusting the whole chain lets a caller prepend a forged
   * header and pick their own bucket, which turns the limiter off for anyone who
   * reads this file.
   */
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      /* the API serves JSON, never a document — a CSP here governs nothing and
         only makes the real one, on the Next.js side, harder to reason about */
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  /**
   * CORS is an ALLOW-LIST of exactly one origin, and credentials are on because
   * the console's refresh token rides in a cookie. `origin: true` (reflect
   * whatever asked) with credentials would let any site on the internet make
   * authenticated calls on a signed-in user's behalf.
   *
   * The mobile app sends no Origin header at all, which is why a missing one is
   * allowed through — it is a native client, not a browser.
   */
  /*
   * IN DEVELOPMENT ONLY there is a second origin: the Expo web target, which
   * serves the CLIENT app from Metro and IS a browser, so it does send one.
   * Without it the app boots, finds its stored session, and then has every call
   * blocked — which reads as a broken app rather than as a refused origin.
   *
   * The gate is NODE_ENV, not whether the value is set, so a production
   * deployment that happened to carry the variable still allows exactly one
   * origin. That is the whole point of an allow-list when credentials are on.
   */
  const allowed = new Set([env.WEB_ORIGIN]);
  if (env.NODE_ENV === 'development') allowed.add(env.EXPO_WEB_ORIGIN);

  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin || allowed.has(origin)) return cb(null, true);
        /* cb(null, false), never cb(new Error(...)): an error here becomes a 500,
           which reads as 'the API is broken' when the truth is 'that origin may
           not call it'. Omitting the headers is the correct refusal — the
           browser blocks the response, which is what CORS is for. */
        return cb(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Client'],
    }),
  );

  /* 1mb: every Day 1 body is a form. Media goes to object storage with a signed
     URL rather than through the API, so nothing here needs a larger ceiling. */
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  if (!isTest) {
    app.use(
      pinoHttp({
        logger,
        /* health checks are the majority of production log volume and carry no
           information; drop them to info-below unless they fail */
        autoLogging: { ignore: (req) => req.url === '/health' },
      }),
    );
  }

  app.get('/health', (_req, res) => ok(res, { status: 'ok', at: new Date().toISOString() }));

  app.use('/api/v1', globalLimiter, routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
