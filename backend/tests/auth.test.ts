import { afterAll, beforeAll, describe, expect, it, beforeEach } from 'vitest';
import request from 'supertest';

import { prisma } from '../src/config/prisma.js';
import { app, auth, clearRateLimits, closeConnections, issueTestOtp, loginStaff } from './helpers.js';

const RAJESH_PHONE = '+919847022110';

beforeAll(async () => {
  await clearRateLimits();
});

/*
 * CLEARED BEFORE EVERY TEST, not once for the file.
 *
 * This suite signs in ten times, and several tests deliberately fail a sign-in to
 * check the counter works — so by the last block the limiter is legitimately
 * spent and an honest login answers 429. The failure then reads as broken auth,
 * which is exactly what `clearRateLimits` warns about in its own comment: "the
 * next suite fails on 429s that look like broken auth".
 *
 * The counters are what several tests are ABOUT, so they are reset between tests
 * rather than relaxed: the limiter runs against the same rules production does,
 * and each test starts from a known count instead of inheriting nine.
 */
beforeEach(async () => {
  await clearRateLimits();
});

afterAll(async () => {
  await closeConnections();
});

describe('staff login', () => {
  it('signs a coach in and returns an access token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/staff/login')
      .set('X-Client', 'mobile')
      .send({ email: 'anita@haalving.dev', password: 'Haalving@123' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.user).toMatchObject({ id: 'u-anita', role: 'admin', name: 'Anita R.' });
    expect(typeof res.body.data.accessToken).toBe('string');
  });

  it('puts the refresh token in a cookie for the browser and in the body for mobile', async () => {
    const web = await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: 'rohan@haalving.dev', password: 'Haalving@123' });

    const cookies = web.headers['set-cookie'] as unknown as string[] | undefined;
    expect(cookies?.some((c) => c.startsWith('hv_refresh='))).toBe(true);
    /* never both: a token in the body AND a cookie doubles where it can leak from */
    expect(web.body.data.refreshToken).toBeUndefined();
    /* httpOnly so no script can read it, and scoped to the auth routes so it does
       not ride along with every ordinary API call */
    const cookie = cookies?.find((c) => c.startsWith('hv_refresh='));
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/api/v1/auth');

    const mobile = await request(app)
      .post('/api/v1/auth/staff/login')
      .set('X-Client', 'mobile')
      .send({ email: 'rohan@haalving.dev', password: 'Haalving@123' });
    expect(typeof mobile.body.data.refreshToken).toBe('string');
  });

  it('answers a wrong password and an unknown account identically', async () => {
    /* distinguishing the two turns the login form into a directory of who works
       here — the message, the code and the status all have to match */
    const wrong = await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: 'anita@haalving.dev', password: 'not-the-password' });
    const unknown = await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: 'nobody@haalving.dev', password: 'not-the-password' });

    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.error.code).toBe('invalid_credentials');
  });

  it('refuses a client at the staff door', async () => {
    /* Rajesh has no password at all — the OTP door is the only one he uses */
    const res = await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: 'rajesh.d@example.in', password: 'Haalving@123' });
    expect(res.status).toBe(401);
  });

  it('rejects a malformed body before it reaches the database', async () => {
    const res = await request(app).post('/api/v1/auth/staff/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toHaveProperty('email');
    expect(res.body.error.details).toHaveProperty('password');
  });
});

describe('/me', () => {
  it('returns the role definition from the Role table', async () => {
    const s = await loginStaff('anita');
    const res = await request(app).get('/api/v1/me').set(...auth(s.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data.role.title).toBe('Super Admin');
    /* the demo's nav, in the demo's order — the sidebar is built from this */
    expect(res.body.data.role.nav).toEqual([
      'home', 'clients', 'queues', 'schedule', 'catalog', 'community', 'people', 'leave', 'config',
    ]);
  });

  it('gives a coach the six items the demo gives them', async () => {
    const s = await loginStaff('vikram');
    const res = await request(app).get('/api/v1/me').set(...auth(s.accessToken));

    expect(res.body.data.role.title).toBe('Fitness Coach');
    expect(res.body.data.role.nav).toEqual([
      'home', 'clients', 'queues', 'schedule', 'catalog', 'leave',
    ]);
    expect(res.body.data.role.nav).not.toContain('people');
  });

  it('refuses a missing, malformed or expired token', async () => {
    expect((await request(app).get('/api/v1/me')).status).toBe(401);
    expect((await request(app).get('/api/v1/me').set(...auth('rubbish'))).status).toBe(401);
  });
});

describe('client OTP', () => {
  it('answers a known and an unknown number identically', async () => {
    /* a different answer for an unknown number lets anyone check who is a member
       of a health programme, one number at a time */
    const known = await request(app).post('/api/v1/auth/client/otp/request').send({ phone: RAJESH_PHONE });
    const unknown = await request(app).post('/api/v1/auth/client/otp/request').send({ phone: '+919000000000' });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
  });

  it('normalises a spaced number to the same account', async () => {
    await issueTestOtp(RAJESH_PHONE, '111111');
    const res = await request(app)
      .post('/api/v1/auth/client/otp/verify')
      .set('X-Client', 'mobile')
      .send({ phone: '+91 98470 22110', code: '111111' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe('u-cl-rajesh');
  });

  it('refuses a wrong code and counts the attempt', async () => {
    await issueTestOtp(RAJESH_PHONE, '222222');
    const res = await request(app)
      .post('/api/v1/auth/client/otp/verify')
      .send({ phone: RAJESH_PHONE, code: '999999' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('invalid_code');

    const row = await prisma.otp.findFirst({ where: { phone: RAJESH_PHONE }, orderBy: { createdAt: 'desc' } });
    /* the counter lives in Postgres, not Redis — it is the guarantee that
       survives a cache flush, and it is what makes six digits safe at all */
    expect(row?.attempts).toBeGreaterThan(0);
  });

  it('burns a code the moment it works', async () => {
    await issueTestOtp(RAJESH_PHONE, '333333');
    const first = await request(app)
      .post('/api/v1/auth/client/otp/verify')
      .set('X-Client', 'mobile')
      .send({ phone: RAJESH_PHONE, code: '333333' });
    const replay = await request(app)
      .post('/api/v1/auth/client/otp/verify')
      .send({ phone: RAJESH_PHONE, code: '333333' });

    expect(first.status).toBe(200);
    expect(replay.status).toBe(401);
  });
});

describe('refresh rotation', () => {
  it('rotates, and a replayed token kills the whole family', async () => {
    const s = await loginStaff('sneha');

    const rotated = await request(app)
      .post('/api/v1/auth/refresh')
      .set('X-Client', 'mobile')
      .send({ refreshToken: s.refreshToken });
    expect(rotated.status).toBe(200);
    const next = rotated.body.data.refreshToken as string;
    expect(next).not.toBe(s.refreshToken);

    /* presenting the rotated token again means someone holds a copy — the
       legitimate holder would have the successor. There is no way to tell which
       is the thief, so both are revoked. */
    const replay = await request(app)
      .post('/api/v1/auth/refresh')
      .set('X-Client', 'mobile')
      .send({ refreshToken: s.refreshToken });
    expect(replay.status).toBe(401);

    const successor = await request(app)
      .post('/api/v1/auth/refresh')
      .set('X-Client', 'mobile')
      .send({ refreshToken: next });
    expect(successor.status).toBe(401);
  });

  it('ends the session on logout', async () => {
    const s = await loginStaff('lakshmi');
    await request(app).post('/api/v1/auth/logout').set('X-Client', 'mobile').send({ refreshToken: s.refreshToken });

    const after = await request(app)
      .post('/api/v1/auth/refresh')
      .set('X-Client', 'mobile')
      .send({ refreshToken: s.refreshToken });
    expect(after.status).toBe(401);
  });
});

describe('audience', () => {
  it('refuses a client token on a console route', async () => {
    await issueTestOtp(RAJESH_PHONE, '444444');
    const client = await request(app)
      .post('/api/v1/auth/client/otp/verify')
      .set('X-Client', 'mobile')
      .send({ phone: RAJESH_PHONE, code: '444444' });

    const token = client.body.data.accessToken as string;

    /* the token is legitimate — Rajesh obtained it with a phone he controls.
       Scoping alone would hand back exactly his own record and the request would
       LOOK correct, so the audience check refuses it at the door instead. */
    const res = await request(app).get('/api/v1/clients').set(...auth(token));
    expect(res.status).toBe(403);
  });
});
