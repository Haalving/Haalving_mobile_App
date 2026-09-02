import { env } from './config/env.js';

/**
 * TZ before anything reads a clock.
 *
 * Node caches the zone on first use, so setting it after a date has been
 * formatted somewhere is a no-op that looks like it worked. Every clock rule in
 * this product is a LOCAL-time rule — the cycle day, quiet hours 22:00-07:00, the
 * SLA ladder — so this line has to come before the first import that could touch
 * a Date, which is why it sits above the others.
 */
process.env.TZ = env.TZ;

const { createApp } = await import('./app.js');
const { connectPrisma, disconnectPrisma } = await import('./config/prisma.js');
const { connectRedis, disconnectRedis } = await import('./config/redis.js');
const { registerJobs } = await import('./jobs/index.js');
const { initRealtime, closeRealtime } = await import('./realtime.js');
const { logger } = await import('./utils/logger.js');

async function main(): Promise<void> {
  await connectPrisma();
  logger.info('postgres connected');

  try {
    await connectRedis();
    logger.info('redis connected');
  } catch (err) {
    /* the API is useful without Redis — rate limiting degrades and everything
       else works. Refusing to boot would trade a partial outage for a total one. */
    logger.warn({ err: (err as Error).message }, 'redis unavailable — rate limiting degraded');
  }

  registerJobs();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV, tz: env.TZ }, 'HAALVING API listening');
  });

  /* the live lane rides the same HTTP server, so it shares the port and the
     graceful shutdown below */
  initRealtime(server);

  /**
   * Stop taking new work, let in-flight requests finish, then close the pools.
   * Without this a deploy cuts live requests mid-transaction and leaves
   * connections dangling until Postgres times them out.
   */
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down');
    server.close(() => {
      void Promise.allSettled([closeRealtime(), disconnectPrisma(), disconnectRedis()]).then(() =>
        process.exit(0),
      );
    });
    /* a request that will not finish must not hold the process open for ever */
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err: Error) => {
  process.stderr.write(`\nFailed to start: ${err.message}\n${err.stack ?? ''}\n\n`);
  process.exit(1);
});
