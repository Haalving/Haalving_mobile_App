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

  /**
   * Re-open the development-only routes on a box that LOOKS deployed — see
   * `computeDevRoutesAllowed` below for what "looks deployed" means. The only
   * accepted value is `allow` (an empty value is the same as unset, the house
   * pattern for placeholders), so a typo is a startup failure that names the key
   * rather than a switch that is silently off. Never honoured in production, and
   * never where a hosting-platform variable (PLATFORM_MARKERS) says the process
   * is on a platform.
   */
  HV_DEV_ROUTES: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['allow']).optional()),
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

/* ------------------------------------------------- development-only routes */

export interface DevRoutesInput {
  nodeEnv: Env['NODE_ENV'];
  databaseUrl: string;
  /** The hosting-platform markers only (PLATFORM_MARKERS) — see `computeDevRoutesAllowed`. */
  platformEnv: Record<string, string | undefined>;
  /** `HV_DEV_ROUTES`, when set. */
  override?: string;
}

export interface DevRoutesDecision {
  allowed: boolean;
  looksDeployed: boolean;
  /** One human sentence, for the boot log. */
  reason: string;
}

/**
 * Variables a hosting platform injects into every service it runs, and nothing
 * else sets. Any one of them present means the process is deployed, whatever
 * NODE_ENV says. Railway is where this API lives today; the others are there so
 * a move to another host does not silently reopen the route — a Render or Fly
 * box with a sidecar database at localhost would otherwise pass the database
 * check. Exported so the tests pin the list rather than copying it.
 */
export const PLATFORM_MARKERS = [
  'RAILWAY_ENVIRONMENT',
  'RAILWAY_ENVIRONMENT_NAME',
  'RAILWAY_PROJECT_ID',
  'RAILWAY_SERVICE_ID',
  'RENDER',
  'RENDER_SERVICE_ID',
  'FLY_APP_NAME',
  'FLY_MACHINE_ID',
  'KUBERNETES_SERVICE_HOST',
  'DYNO',
  'ECS_CONTAINER_METADATA_URI',
  'ECS_CONTAINER_METADATA_URI_V4',
  'K_SERVICE',
  'WEBSITE_SITE_NAME',
] as const;

/**
 * The hosts a DEVELOPMENT database lives on. A closed list rather than
 * "anything without a dot", deliberately: a Compose service name like
 * `postgres` is not on it, so a containerised box counts as deployed until
 * somebody says otherwise with HV_DEV_ROUTES=allow. Both spellings of the IPv6
 * loopback, because the URL parser keeps the brackets on a `postgres://` host.
 */
const LOCAL_DB_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'host.docker.internal']);

interface DatabaseHost {
  host: string;
  /** True when a `?host=` parameter supplied it, so the boot log can say so. */
  fromQuery: boolean;
}

/**
 * The host Prisma will ACTUALLY connect to, lower-cased; null when the string
 * does not parse.
 *
 * Not simply `new URL(...).hostname`: Prisma gives a `?host=` query parameter
 * precedence over the authority host. That is how a Unix socket or a Cloud SQL
 * instance is addressed (`postgresql://u:p@localhost/db?host=/cloudsql/...`),
 * and it takes a hostname just as happily — so a guard that read the authority
 * alone would call `postgres://u:p@localhost/db?host=postgres.railway.internal`
 * local while the process talked to the remote database. A socket path is never
 * on LOCAL_DB_HOSTS, so a developer on one says HV_DEV_ROUTES=allow. A repeated
 * `?host=` names whichever value is remote: whichever of them Prisma honours,
 * a remote one anywhere has to count.
 *
 * Lower-cased by hand because `postgres://` is not one of the URL parser's
 * "special" schemes, and on those it leaves the host exactly as typed.
 */
function databaseHost(databaseUrl: string): DatabaseHost | null {
  try {
    const url = new URL(databaseUrl);
    const overrides = url.searchParams
      .getAll('host')
      .map((h) => h.toLowerCase())
      .filter((h) => h.length > 0);
    const last = overrides.at(-1);
    if (last !== undefined) {
      return { host: overrides.find((h) => !LOCAL_DB_HOSTS.has(h)) ?? last, fromQuery: true };
    }
    return { host: url.hostname.toLowerCase(), fromQuery: false };
  } catch {
    return null;
  }
}

/**
 * MAY THE DEVELOPMENT-ONLY ROUTES EXIST IN THIS PROCESS?
 *
 * NODE_ENV defaults to `development`, so a deployment that never set it would
 * otherwise register `POST /auth/client/otp/dev-code` — a route that hands back
 * a live one-time code for ANY client number, to anybody who asks. That is an
 * account takeover, and it is exactly what a Railway service without NODE_ENV
 * was serving. NODE_ENV=production cannot simply be set there yet: production
 * refuses to boot with SMS_PROVIDER=console and no real provider is wired up.
 * Until it can, the guard has to read the room rather than the flag.
 *
 * "Looks deployed" is either piece of evidence:
 *
 *   - a hosting-platform variable (PLATFORM_MARKERS) is present, or
 *   - the DATABASE_URL host is not a local one (LOCAL_DB_HOSTS) — the host
 *     Prisma will use, which a `?host=` parameter overrides. A URL that does
 *     not parse at all counts as remote — the failure mode has to be a missing
 *     convenience, never a leaked code.
 *
 * Then: production never allows, whatever else is set; a box that does not look
 * deployed allows; and a box that looks deployed only by its database host
 * allows under an explicit HV_DEV_ROUTES=allow, for the developer whose local
 * server happens to point at a hosted database. A platform variable is not a
 * heuristic — it is the host saying where the process runs — and the override
 * does not outrank it. Otherwise the whole guard would be one dashboard
 * variable away from off, with nothing in the boot log to show for it, and
 * operator misconfiguration on the platform is the case it exists to survive.
 *
 * PURE, so the rule can be tested without booting a server: every input is a
 * parameter and the decision is a value.
 */
export function computeDevRoutesAllowed(input: DevRoutesInput): DevRoutesDecision {
  const marker = PLATFORM_MARKERS.find((key) => input.platformEnv[key] !== undefined);
  const db = databaseHost(input.databaseUrl);

  let looksDeployed: boolean;
  let evidence: string;
  if (marker) {
    looksDeployed = true;
    evidence = `${marker} is set`;
  } else if (db === null) {
    looksDeployed = true;
    evidence = 'DATABASE_URL does not parse, so it is treated as remote';
  } else if (!LOCAL_DB_HOSTS.has(db.host)) {
    looksDeployed = true;
    const via = db.fromQuery ? ', from its ?host= parameter,' : '';
    evidence = `the database host "${db.host}"${via} is not a local one`;
  } else {
    looksDeployed = false;
    evidence = `the database host is "${db.host}" and no hosting-platform variable is set`;
  }

  if (input.nodeEnv === 'production') {
    return {
      allowed: false,
      looksDeployed,
      reason: 'NODE_ENV is production, so the development-only routes are off whatever else is set.',
    };
  }
  if (!looksDeployed) {
    return {
      allowed: true,
      looksDeployed,
      reason: `This looks like a development box (${evidence}), so the development-only routes are on.`,
    };
  }
  if (input.override === 'allow' && marker === undefined) {
    return {
      allowed: true,
      looksDeployed,
      reason:
        `This process looks deployed (${evidence}) but HV_DEV_ROUTES=allow, ` +
        'so the development-only routes are on.',
    };
  }
  if (input.override === 'allow') {
    return {
      allowed: false,
      looksDeployed,
      reason:
        `This process is on a hosting platform (${evidence}), so HV_DEV_ROUTES=allow is ignored ` +
        'and the development-only routes are off.',
    };
  }
  return {
    allowed: false,
    looksDeployed,
    reason:
      `This process looks deployed (${evidence}) and NODE_ENV is ${input.nodeEnv}, ` +
      'so the development-only routes are off.',
  };
}

/**
 * Decided ONCE, here, beside the flags it refines.
 *
 * The PLATFORM_MARKERS are read straight off `process.env` rather than through
 * the schema above. That is the single reading in this file that does not land
 * on `env`, and it is deliberate: they are facts about the host, not
 * configuration anybody sets, and putting them on `env` would invite the rest of
 * the codebase to branch on where it is running. The rule that nothing OUTSIDE
 * this file reads `process.env` stands.
 */
const devRoutes = computeDevRoutesAllowed({
  nodeEnv: env.NODE_ENV,
  databaseUrl: env.DATABASE_URL,
  platformEnv: Object.fromEntries(PLATFORM_MARKERS.map((key) => [key, process.env[key]])),
  override: env.HV_DEV_ROUTES,
});

/**
 * Whether `POST /auth/client/otp/dev-code` may exist in this process. Consulted
 * twice on purpose — where the route is registered and again in the service that
 * would mint the code — so a loosened route guard still cannot leak one.
 */
export const devRoutesAllowed: boolean = devRoutes.allowed;

/*
 * A deployed process without NODE_ENV=production is a misconfiguration worth
 * shouting about at every boot, but not one worth refusing to boot over: the
 * routes are already off, and this is the state the Railway service has to run
 * in until an SMS provider exists. Written to stderr like the other startup
 * diagnostics, because the logger imports this file and cannot be used from it.
 * Silent under test — the suites run against a local database on purpose, and
 * a remote one there is a deliberate choice rather than a mistake.
 */
if (!isProd && !isTest && devRoutes.looksDeployed && !devRoutes.allowed) {
  process.stderr.write(
    [
      '',
      '==========================================================================',
      '  WARNING: this process looks DEPLOYED, but NODE_ENV is not production.',
      `  ${devRoutes.reason}`,
      '',
      '  Switched OFF for this run: POST /api/v1/auth/client/otp/dev-code, the',
      '  one development-only route (it would hand back a live one-time code for',
      '  any client number).',
      '',
      `  EVERYTHING ELSE still runs as NODE_ENV=${env.NODE_ENV}: the extra CORS`,
      '  origin, the refresh cookie without Secure, error messages in responses,',
      '  debug-level request logging.',
      ...(env.SMS_PROVIDER === 'console'
        ? [
            '  And with SMS_PROVIDER=console, every code a client requests through',
            '  POST /api/v1/auth/client/otp/request is still WRITTEN TO THIS LOG.',
          ]
        : []),
      '',
      '  Set NODE_ENV=production once an SMS provider is configured (production',
      '  refuses to boot with SMS_PROVIDER=console). On a machine you know is a',
      '  development box that merely uses a hosted database, HV_DEV_ROUTES=allow',
      '  re-enables the route; it is ignored where a hosting-platform variable',
      '  (RAILWAY_*, RENDER, FLY_APP_NAME, KUBERNETES_SERVICE_HOST, ...) is set.',
      '==========================================================================',
      '',
      '',
    ].join('\n'),
  );
}

/*
 * And when the override is what turned them on, one line at every boot, so a
 * re-opened route is never invisible in a log. Silent under test for the same
 * reason as above.
 */
if (!isTest && devRoutes.looksDeployed && devRoutes.allowed) {
  process.stderr.write(
    `\nNOTE: ${devRoutes.reason}\n` +
      '      POST /api/v1/auth/client/otp/dev-code is live in this process.\n\n',
  );
}
