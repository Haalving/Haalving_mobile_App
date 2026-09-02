import type { Server as HttpServer } from 'node:http';

import { isStaffRole } from '@haalving/shared';
import { Server as IOServer, type Socket } from 'socket.io';

import { isProd } from './config/env.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { verifyAccessToken } from './utils/tokens.js';

/**
 * THE LIVE LANE — Socket.IO beside the REST API.
 *
 * The Care Circle is the one screen where a delay reads as neglect: a coach replies
 * and the client should not have to pull-to-refresh to see it. So a circle WRITE
 * nudges everyone in that client's room to refetch — the nudge carries no content
 * (a refetch reads the committed row over the authenticated REST route, where the
 * five rules already strip what the client may not see), so the socket never
 * becomes a second, unguarded copy of the data.
 *
 * AUTH IS THE SAME TOKEN THE REST API TRUSTS. The handshake carries the access
 * token; an unverifiable one is refused at the door, exactly as `authenticate`
 * refuses an HTTP request. A client socket joins only its OWN room; a staff socket
 * may WATCH a named client's room (the console record it is looking at), and only
 * staff may.
 *
 * The mobile client treats this as an enhancement, not a dependency: React Query
 * still refetches on focus, so a dropped socket degrades to a slightly slower app,
 * never a broken one.
 */

const room = (clientId: string): string => `circle:${clientId}`;

let io: IOServer | null = null;

function corsOrigins(): string[] {
  /* the same allow-list the HTTP CORS uses — one origin in production, plus the
     Expo web target in development */
  return isProd ? [env.WEB_ORIGIN] : [env.WEB_ORIGIN, env.EXPO_WEB_ORIGIN];
}

export function initRealtime(httpServer: HttpServer): IOServer {
  io = new IOServer(httpServer, {
    path: '/rt',
    cors: { origin: corsOrigins(), credentials: true },
    /* a lightweight signal channel, not a data firehose — small and infrequent */
    serveClient: false,
  });

  io.use((socket: Socket, next) => {
    const token = (socket.handshake.auth?.token ?? '') as string;
    if (!token) return next(new Error('unauthorized'));
    try {
      const claims = verifyAccessToken(token);
      socket.data.userId = claims.sub;
      socket.data.role = claims.role;
      socket.data.cid = claims.cid ?? null;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket: Socket) => {
    /* a client is only ever in its own room; the token, not the client, decides
       which — an id the socket could name would be a scoping hole */
    const cid = socket.data.cid as string | null;
    if (cid) void socket.join(room(cid));

    /* a staff socket asks to watch the record it is viewing; refused unless it is
       actually staff, so a client token cannot listen in on another's room */
    socket.on('circle:watch', (clientId: unknown) => {
      if (typeof clientId === 'string' && isStaffRole(socket.data.role as string)) {
        void socket.join(room(clientId));
      }
    });
    socket.on('circle:unwatch', (clientId: unknown) => {
      if (typeof clientId === 'string') void socket.leave(room(clientId));
    });
  });

  logger.info('realtime: Socket.IO up on /rt');
  return io;
}

/**
 * Nudge everyone in a client's circle room to refetch. Safe before init (returns
 * quietly) so a unit test or a job that never opened a socket server does not throw.
 */
export function emitCircleUpdate(clientId: string): void {
  io?.to(room(clientId)).emit('circle:update', { clientId });
}

/** Test/shutdown seam — close the server and drop the singleton. */
export async function closeRealtime(): Promise<void> {
  if (!io) return;
  await new Promise<void>((resolve) => io!.close(() => resolve()));
  io = null;
}
