import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { io as ioClient, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeRealtime, emitCircleUpdate, initRealtime } from '../src/realtime.js';
import { signAccessToken } from '../src/utils/tokens.js';

/**
 * THE LIVE LANE. A circle write nudges the client's room; the socket carries no
 * content, so these pin the two things that matter: the RIGHT room hears it, and a
 * token the door does not trust never connects at all.
 */

let http: HttpServer;
let origin: string;

const clientToken = signAccessToken({ sub: 'u-cl-rajesh', role: 'client', aud: 'client', cid: 'c-rajesh' });

function connect(auth: Record<string, unknown>): Socket {
  return ioClient(origin, { path: '/rt', transports: ['websocket'], auth, reconnection: false });
}

/** Resolve when the socket emits `event`, or reject after `ms`. */
function once<T = unknown>(socket: Socket, event: string, ms = 3000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

beforeAll(async () => {
  http = createServer();
  initRealtime(http);
  await new Promise<void>((resolve) => http.listen(0, resolve));
  origin = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await closeRealtime();
  await new Promise<void>((resolve) => http.close(() => resolve()));
});

describe('realtime circle', () => {
  it('nudges the client in its own room on a circle write', async () => {
    const socket = connect({ token: clientToken });
    await once(socket, 'connect');
    const got = once<{ clientId: string }>(socket, 'circle:update');
    emitCircleUpdate('c-rajesh');
    expect((await got).clientId).toBe('c-rajesh');
    socket.disconnect();
  });

  it('does not nudge a client about someone else’s circle', async () => {
    const socket = connect({ token: clientToken });
    await once(socket, 'connect');
    let heard = false;
    socket.on('circle:update', () => {
      heard = true;
    });
    emitCircleUpdate('c-someone-else');
    await new Promise((r) => setTimeout(r, 300));
    expect(heard).toBe(false);
    socket.disconnect();
  });

  it('refuses a connection with no token', async () => {
    const socket = connect({});
    const err = await once<Error>(socket, 'connect_error');
    expect(String(err)).toContain('unauthorized');
    socket.disconnect();
  });

  it('lets a staff socket WATCH a named client’s room', async () => {
    const staff = signAccessToken({ sub: 'u-anita', role: 'admin', aud: 'staff' });
    const socket = connect({ token: staff });
    await once(socket, 'connect');
    socket.emit('circle:watch', 'c-rajesh');
    await new Promise((r) => setTimeout(r, 150)); // let the join land
    const got = once<{ clientId: string }>(socket, 'circle:update');
    emitCircleUpdate('c-rajesh');
    expect((await got).clientId).toBe('c-rajesh');
    socket.disconnect();
  });
});
