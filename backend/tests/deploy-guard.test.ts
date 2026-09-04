import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import { computeDevRoutesAllowed, devRoutesAllowed, PLATFORM_MARKERS } from '../src/config/env.js';
import { app, closeConnections } from './helpers.js';

/**
 * THE DEPLOY-AWARE GUARD on the development-only routes.
 *
 * NODE_ENV defaults to development, so `!isProd` alone let a Railway service that
 * never set it serve `POST /auth/client/otp/dev-code` — a live one-time code for
 * any client number. `computeDevRoutesAllowed` is the rule that closes that, and
 * it is pure, so every branch is pinned here without booting anything: the
 * inputs are values and so is the answer.
 */

const LOCAL_DB = 'postgresql://hv:hv@localhost:5433/haalving';
const REMOTE_DB = 'postgres://u:p@junction.proxy.rlwy.net:5432/db';
/* the list itself is the API's — a marker added there (Render, Fly, Kubernetes,
   Heroku, ECS, Cloud Run, Azure) is tested here without anybody remembering to
   copy it; the four Railway names are the ones the live service carries today */
const RAILWAY_MARKERS = PLATFORM_MARKERS;

afterAll(async () => {
  await closeConnections();
});

describe('computeDevRoutesAllowed', () => {
  it('allows a local development box', () => {
    const d = computeDevRoutesAllowed({ nodeEnv: 'development', databaseUrl: LOCAL_DB, platformEnv: {} });
    expect(d).toMatchObject({ allowed: true, looksDeployed: false });
    expect(d.reason).toMatch(/development box/);
  });

  it('allows NODE_ENV=test against a localhost database', () => {
    const d = computeDevRoutesAllowed({
      nodeEnv: 'test',
      databaseUrl: 'postgresql://hv:hv@127.0.0.1:5432/haalving_test',
      platformEnv: {},
    });
    expect(d).toMatchObject({ allowed: true, looksDeployed: false });
  });

  it('refuses when any hosting-platform variable is present, even on a local database', () => {
    for (const key of RAILWAY_MARKERS) {
      const d = computeDevRoutesAllowed({
        nodeEnv: 'development',
        databaseUrl: LOCAL_DB,
        platformEnv: { [key]: 'x' },
      });
      expect(d, key).toMatchObject({ allowed: false, looksDeployed: true });
      /* the log names the evidence, so the operator can see WHY it was refused */
      expect(d.reason, key).toContain(key);
    }
  });

  it('refuses a remote DATABASE_URL host under development', () => {
    const d = computeDevRoutesAllowed({ nodeEnv: 'development', databaseUrl: REMOTE_DB, platformEnv: {} });
    expect(d).toMatchObject({ allowed: false, looksDeployed: true });
    expect(d.reason).toContain('junction.proxy.rlwy.net');
  });

  it('never allows production, even with the override', () => {
    for (const databaseUrl of [LOCAL_DB, REMOTE_DB]) {
      const d = computeDevRoutesAllowed({
        nodeEnv: 'production',
        databaseUrl,
        platformEnv: {},
        override: 'allow',
      });
      expect(d.allowed, databaseUrl).toBe(false);
    }
  });

  it('re-allows a development box that only LOOKS deployed by its database host, with HV_DEV_ROUTES=allow', () => {
    const remote = computeDevRoutesAllowed({
      nodeEnv: 'development',
      databaseUrl: REMOTE_DB,
      platformEnv: {},
      override: 'allow',
    });
    expect(remote).toMatchObject({ allowed: true, looksDeployed: true });
    expect(remote.reason).toContain('HV_DEV_ROUTES=allow');
  });

  it('ignores HV_DEV_ROUTES=allow where a hosting-platform variable is present — the platform outranks the override', () => {
    /* the database heuristic is what the override exists to overrule; a RAILWAY_*
       variable is the platform itself saying where the process runs, and a
       guard one dashboard variable away from off would not survive the
       misconfiguration it was built for */
    for (const key of RAILWAY_MARKERS) {
      for (const databaseUrl of [LOCAL_DB, REMOTE_DB]) {
        const d = computeDevRoutesAllowed({
          nodeEnv: 'development',
          databaseUrl,
          platformEnv: { [key]: 'x' },
          override: 'allow',
        });
        expect(d, `${key} ${databaseUrl}`).toMatchObject({ allowed: false, looksDeployed: true });
        /* and the log says the override was seen and set aside, not silently dropped */
        expect(d.reason, key).toContain('HV_DEV_ROUTES=allow is ignored');
        expect(d.reason, key).toContain(key);
      }
    }
  });

  it('honours only the exact word "allow" as the override', () => {
    for (const override of ['true', '1', 'yes', 'ALLOW', '']) {
      const d = computeDevRoutesAllowed({ nodeEnv: 'development', databaseUrl: REMOTE_DB, platformEnv: {}, override });
      expect(d.allowed, JSON.stringify(override)).toBe(false);
    }
  });

  it('treats a malformed DATABASE_URL as deployed — it fails closed', () => {
    /* the last two parse without throwing but carry no host at all; a missing
       host is not a local host */
    for (const databaseUrl of ['not a url', '', 'localhost:5432', 'postgresql:///db']) {
      const d = computeDevRoutesAllowed({ nodeEnv: 'development', databaseUrl, platformEnv: {} });
      expect(d, JSON.stringify(databaseUrl)).toMatchObject({ allowed: false, looksDeployed: true });
    }
  });

  it('judges the host Prisma will use — a ?host= parameter outranks the one before the port', () => {
    /* Prisma gives `?host=` precedence over the authority host, so
       `localhost` before the port and a Railway proxy after it CONNECTS to
       Railway; the same shape addresses a Unix socket or a Cloud SQL instance.
       A guard that read only the authority would call every one of these local. */
    const deployed = [
      'postgres://u:p@localhost:5432/db?host=junction.proxy.rlwy.net',
      'postgresql://u:p@localhost/db?host=/cloudsql/p:r:i',
      'postgres://u:p@localhost/db?host=%2Fcloudsql%2Fp%3Ar%3Ai',
      'postgresql:///db?host=/var/run/postgresql',
      /* repeated: a remote value anywhere counts, whichever Prisma would honour */
      'postgres://u:p@localhost/db?host=localhost&host=remote.example',
      'postgres://u:p@localhost/db?host=remote.example&host=localhost',
    ];
    for (const databaseUrl of deployed) {
      const d = computeDevRoutesAllowed({ nodeEnv: 'development', databaseUrl, platformEnv: {} });
      expect(d, databaseUrl).toMatchObject({ allowed: false, looksDeployed: true });
      expect(d.reason, databaseUrl).toContain('?host=');
    }
    const cloud = computeDevRoutesAllowed({
      nodeEnv: 'development',
      databaseUrl: 'postgresql://u:p@localhost/db?host=/cloudsql/p:r:i',
      platformEnv: {},
    });
    expect(cloud.reason).toContain('/cloudsql/p:r:i');

    /* and the other way round: Prisma really does connect to localhost here */
    const local = [
      'postgres://u:p@remote.example/db?host=localhost',
      'postgres://u:p@remote.example/db?host=LOCALHOST',
      'postgres://u:p@remote.example/db?host=127.0.0.1',
      /* an empty parameter is no parameter; the authority host stands */
      'postgres://u:p@localhost/db?host=',
    ];
    for (const databaseUrl of local) {
      const d = computeDevRoutesAllowed({ nodeEnv: 'development', databaseUrl, platformEnv: {} });
      expect(d, databaseUrl).toMatchObject({ allowed: true, looksDeployed: false });
    }
    /* the override re-opens the socket case, as the comment on databaseHost promises */
    const socket = computeDevRoutesAllowed({
      nodeEnv: 'development',
      databaseUrl: 'postgresql:///db?host=/var/run/postgresql',
      platformEnv: {},
      override: 'allow',
    });
    expect(socket).toMatchObject({ allowed: true, looksDeployed: true });
  });

  it('knows the closed list of local hosts, and nothing else', () => {
    for (const host of ['localhost', 'LOCALHOST', '127.0.0.1', '[::1]', 'host.docker.internal']) {
      const d = computeDevRoutesAllowed({
        nodeEnv: 'development',
        databaseUrl: `postgres://u:p@${host}:5432/db`,
        platformEnv: {},
      });
      expect(d.looksDeployed, host).toBe(false);
    }
    /* a Compose service name has no dot and is still not local — a container
       counts as deployed until HV_DEV_ROUTES says otherwise */
    for (const host of ['postgres', 'db', 'localhost.evil.com']) {
      const d = computeDevRoutesAllowed({
        nodeEnv: 'development',
        databaseUrl: `postgres://u:p@${host}:5432/db`,
        platformEnv: {},
      });
      expect(d.looksDeployed, host).toBe(true);
    }
  });
});

describe('the route under test', () => {
  it('is registered here: the suites run as test against a local database', async () => {
    expect(devRoutesAllowed).toBe(true);
    /* a malformed body answers 400 from the validator, where a route that was
       never registered would answer 404 — and nothing touches the database */
    const res = await request(app).post('/api/v1/auth/client/otp/dev-code').send({});
    expect(res.status).toBe(400);
  });
});
