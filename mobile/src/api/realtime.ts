import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';

import { apiUrl, getAccessToken } from '@/api/client';

/* the live lane rides the same host as the REST API, minus its `/api/v1` path —
   read at connect time so a runtime backend-URL override is honoured */
const origin = (): string => apiUrl().replace(/\/api\/v1\/?$/, '');

/**
 * LIVE CARE CIRCLE.
 *
 * Opens the `/rt` socket with the access token and, on a `circle:update` nudge,
 * invalidates the circle query so it refetches over the guarded REST route — the
 * socket never carries the message itself, so nothing bypasses the five rules.
 *
 * IT IS AN ENHANCEMENT, NEVER A DEPENDENCY. The auth handshake reads the token
 * afresh on every (re)connect, so a token that arrives or rotates later is picked
 * up; and if the socket is refused or dropped, `useCircle`'s polling fallback keeps
 * the thread fresh on its own. A logged-out screen (no token yet) simply does not
 * open one.
 */
export function useCircleLive(): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (!getAccessToken()) return;
    const socket: Socket = io(origin(), {
      path: '/rt',
      transports: ['websocket'],
      /* a function, so each reconnect sends the CURRENT token, not a stale one */
      auth: (cb) => cb({ token: getAccessToken() ?? '' }),
    });
    const refetch = () => void qc.invalidateQueries({ queryKey: ['client', 'circle'] });
    socket.on('circle:update', refetch);
    return () => {
      socket.off('circle:update', refetch);
      socket.disconnect();
    };
  }, [qc]);
}
