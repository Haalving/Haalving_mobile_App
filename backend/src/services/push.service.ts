import { prisma } from '../config/prisma.js';
import { logger } from '../utils/logger.js';
import { inQuietHours } from './config.service.js';

/**
 * CLIENT PUSH — the phone's tap on the shoulder, over the Expo Push API.
 *
 * A device registers its Expo token through `POST /client/push-token`; this is the
 * other half — it sends to every token a client has. The payload carries a `data`
 * bag the app reads to DEEP-LINK straight to the thing that changed (a meal, the
 * circle, a session), so a tap lands on the screen, not the home tab.
 *
 * QUIET HOURS (22:00-07:00, from config.service) are honoured by default: a client
 * is not buzzed overnight for anything that can wait until morning. A caller with a
 * genuinely time-critical message (a session starting now) may pass
 * `bypassQuietHours`, and owns that decision.
 *
 * IT NEVER THROWS INTO ITS CALLER. A push is a courtesy on top of data the app can
 * always refetch; a failed send must not fail the write that triggered it, so every
 * error is logged and swallowed. Tokens Expo reports as dead are pruned, so a
 * reinstalled or wiped device stops being retried.
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export interface PushMessage {
  title: string;
  body: string;
  /** deep-link payload the app routes on, e.g. { link: 'circle' } or { link: 'meal', id } */
  data?: Record<string, unknown>;
}

type ExpoTicket = { status: string; details?: { error?: string } };

export async function pushToClient(
  clientId: string,
  msg: PushMessage,
  opts?: { bypassQuietHours?: boolean },
): Promise<void> {
  if (!opts?.bypassQuietHours && inQuietHours()) return;

  const tokens = await prisma.pushToken.findMany({ where: { clientId }, select: { token: true } });
  if (tokens.length === 0) return;

  const messages = tokens.map((t) => ({
    to: t.token,
    title: msg.title,
    body: msg.body,
    sound: 'default' as const,
    ...(msg.data ? { data: msg.data } : {}),
  }));

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
    if (!res.ok) {
      logger.warn({ clientId, status: res.status }, 'push: Expo API returned non-ok');
      return;
    }
    const payload = (await res.json()) as { data?: ExpoTicket[] };
    /* a token Expo cannot reach any more is dead weight — drop it so it is not
       retried on every future send */
    const dead = (payload.data ?? [])
      .map((ticket, i) => (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered' ? tokens[i]?.token : null))
      .filter((v): v is string => !!v);
    if (dead.length) await prisma.pushToken.deleteMany({ where: { token: { in: dead } } });
  } catch (err) {
    logger.warn({ clientId, err: (err as Error).message }, 'push: delivery failed');
  }
}

/** A new Care Circle message — a coach's reply or a follow-up landing in the room. */
export async function notifyCircleMessage(clientId: string, preview: string): Promise<void> {
  await pushToClient(clientId, {
    title: 'Your care circle',
    body: preview.length > 140 ? `${preview.slice(0, 139)}…` : preview,
    data: { link: 'circle' },
  });
}

/** A meal a coach just rated. */
export async function notifyMealRated(clientId: string, mealId: string, slot: string): Promise<void> {
  await pushToClient(clientId, {
    title: 'Your coach rated a meal',
    body: `Your ${slot} has feedback waiting.`,
    data: { link: 'meal', id: mealId },
  });
}

/** A session starting soon — time-critical, so it may ride through quiet hours. */
export async function notifySessionReminder(clientId: string, title: string, startsInMin: number): Promise<void> {
  await pushToClient(
    clientId,
    {
      title: 'Session soon',
      body: `${title} starts in ${startsInMin} min.`,
      data: { link: 'today' },
    },
    { bypassQuietHours: true },
  );
}
