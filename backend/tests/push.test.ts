import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '../src/config/prisma.js';
import { inQuietHours } from '../src/services/config.service.js';
import { pushToClient } from '../src/services/push.service.js';

/**
 * CLIENT PUSH. The Expo API is mocked — these pin the shape of what we send, that
 * quiet hours are respected, that a client with no device is a silent no-op, and
 * that a dead token is pruned rather than retried for ever.
 */

const CLIENT = 'c-rajesh';
const TOKEN = 'ExponentPushToken[push-test-xyz]';

function mockFetch(payload: unknown) {
  const fn = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
  vi.stubGlobal('fetch', fn);
  return fn;
}

beforeEach(async () => {
  vi.unstubAllGlobals();
  await prisma.pushToken.deleteMany({ where: { clientId: CLIENT } });
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await prisma.pushToken.deleteMany({ where: { clientId: CLIENT } });
});

describe('push.service', () => {
  it('quiet hours are 22:00–07:00 local and wrap midnight', () => {
    const at = (h: number) => new Date(2026, 0, 1, h, 0, 0);
    expect(inQuietHours(at(23))).toBe(true);
    expect(inQuietHours(at(3))).toBe(true);
    expect(inQuietHours(at(6))).toBe(true);
    expect(inQuietHours(at(7))).toBe(false);
    expect(inQuietHours(at(12))).toBe(false);
    expect(inQuietHours(at(21))).toBe(false);
  });

  it('sends to every registered device via the Expo API', async () => {
    await prisma.pushToken.create({ data: { clientId: CLIENT, token: TOKEN } });
    const fetchMock = mockFetch({ data: [{ status: 'ok' }] });
    await pushToClient(CLIENT, { title: 'Hi', body: 'a reply', data: { link: 'circle' } }, { bypassQuietHours: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toContain('exp.host');
    const sent = JSON.parse(init.body) as Array<Record<string, unknown>>;
    expect(sent[0]).toMatchObject({ to: TOKEN, title: 'Hi', body: 'a reply', data: { link: 'circle' } });
  });

  it('is a silent no-op when the client has no device', async () => {
    const fetchMock = mockFetch({ data: [] });
    await pushToClient(CLIENT, { title: 'x', body: 'y' }, { bypassQuietHours: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('prunes a token the device no longer holds', async () => {
    await prisma.pushToken.create({ data: { clientId: CLIENT, token: TOKEN } });
    mockFetch({ data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }] });
    await pushToClient(CLIENT, { title: 'x', body: 'y' }, { bypassQuietHours: true });
    expect(await prisma.pushToken.findUnique({ where: { token: TOKEN } })).toBeNull();
  });
});
