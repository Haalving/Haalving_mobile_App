/*
 * dotenv FIRST, and as a side-effect import so the file is on process.env before
 * the schema below reads it. Node's own --env-file would cover the server but not
 * tsx-run scripts (the seed) or vitest, and three ways of loading one file is how
 * a config drifts.
 */
import 'dotenv/config';

import { z } from 'zod';

/**
 * Environment, validated once at startup.
 *
 * The process exits NAMING the key that is wrong. A server that boots with a
 * missing secret and fails on the first login is worse than one that refuses to
 * boot: the failure surfaces hours later, in a request, as something else.
 *
 * Nothing else in the codebase reads `process.env` — importing `env` from here is
 * the only door, which is what keeps secrets out of the source.
 */

const duration = z
  .string()
  .regex(/^\d+[smhd]$/, 'Expected a duration like 15m, 24h or 30d');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  /**
   * Asia/Kolkata by default and set on the process before anything reads a clock.
   * Every clock rule in the product is a LOCAL-time rule — the cycle day, quiet
   * hours 22:00-07:00, the SLA ladder — and a UTC server reports local midnight
   * in IST as the previous day.
   */
  TZ: z.string().default('Asia/Kolkata'),

  /*
   * Both PostgreSQL schemes are valid and Prisma accepts either — `postgres://`
   * is what most hosts and CLIs hand you, `postgresql://` is what the Prisma docs
   * print. Accepting only one turns a correct connection string into a startup
   * failure that names the wrong problem.
   */
  DATABASE_URL: z
    .string()
    .url()
    .refine((v) => v.startsWith('postgresql://') || v.startsWith('postgres://'), {
      message: 'must be a PostgreSQL URL (postgresql:// or postgres://)',
    }),
  /* `rediss://` is the TLS scheme every managed Redis offers; refusing it would
     force a hosted instance to be reached in the clear. */
  REDIS_URL: z
    .string()
    .url()
    .refine((v) => v.startsWith('redis://') || v.startsWith('rediss://'), {
      message: 'must be a Redis URL (redis:// or rediss://)',
    }),

  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  JWT_ACCESS_TTL: duration.default('15m'),
  JWT_REFRESH_TTL: duration.default('30d'),

  WEB_ORIGIN: z.string().url(),

  /**
   * A SECOND browser origin, honoured in DEVELOPMENT ONLY.
   *
   * The Expo web target - which is what the pixel harness drives - serves the
   * client app from Metro on :8081, and CORS is a one-origin allow-list. Without
   * this the app boots, finds its stored session, and every call it makes is
   * blocked by the browser, so the harness photographs the login wall on every
   * screen and reports the difference as a design delta.
   *
   * Optional and defaulted, so nobody has to touch their .env. `app.ts` ignores it
   * outside development: production keeps exactly one origin, which is the whole
   * point of an allow-list when credentials are on.
   */
  EXPO_WEB_ORIGIN: z.string().url().default('http://localhost:8081'),

  R2_ACCOUNT_ID: z.string().default(''),
  R2_ACCESS_KEY_ID: z.string().default(''),
  R2_SECRET_ACCESS_KEY: z.string().default(''),
  R2_BUCKET: z.string().default('haalving-media'),
  R2_PUBLIC_URL: z.string().default(''),

  /** `console` prints the OTP to the terminal — development only. */
  SMS_PROVIDER: z.enum(['console', 'msg91', 'twilio']).default('console'),
  SMS_API_KEY: z.string().default(''),
  SMS_SENDER_ID: z.string().default(''),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    process.stderr.write(
      ['', 'Cannot start: the environment is not valid.', ...lines, '', 'See .env.example.', '', ''].join('\n'),
    );
    process.exit(1);
  }

  const env = parsed.data;

  /* Two secrets that are equal means an access token can be presented as a
     refresh token. The signature would verify, and a 15-minute credential would
     buy 30 days. Refusing here is cheaper than finding out. */
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    process.stderr.write(
      '\nCannot start: JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ.\n' +
        'Sharing them lets an access token be replayed as a refresh token.\n\n',
    );
    process.exit(1);
  }

  if (env.NODE_ENV === 'production') {
    const weak: string[] = [];
    if (env.JWT_ACCESS_SECRET.length < 32 || env.JWT_ACCESS_SECRET === 'change-me') weak.push('JWT_ACCESS_SECRET');
    if (env.JWT_REFRESH_SECRET.length < 32 || env.JWT_REFRESH_SECRET === 'change-me') weak.push('JWT_REFRESH_SECRET');
    if (weak.length) {
      process.stderr.write(
        `\nCannot start in production: ${weak.join(' and ')} must be at least 32 random characters.\n\n`,
      );
      process.exit(1);
    }
    if (env.SMS_PROVIDER === 'console') {
      process.stderr.write(
        '\nCannot start in production: SMS_PROVIDER=console prints one-time codes to the log.\n\n',
      );
      process.exit(1);
    }
  }

  return env;
}

export const env: Env = load();

export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const isDev = env.NODE_ENV === 'development';
