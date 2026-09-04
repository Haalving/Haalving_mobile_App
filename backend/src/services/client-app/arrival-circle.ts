import { FLOW, stepIndex } from '@haalving/shared';

import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../utils/apiResponse.js';

/**
 * THE CIRCLE BEFORE THERE IS A CIRCLE.
 *
 * Somebody who has signed up has an account and a place on the twelve-step rail,
 * and no client record — so the care circle, which is keyed to one, cannot hold
 * their conversation. This is the thread that does: the person and whoever is
 * running their onboarding, which is where the assessment gets booked and where
 * they ask why nothing has happened yet.
 *
 * IT IS THE SAME SHAPE THE CLIENT CIRCLE ANSWERS IN. The app draws one screen for
 * both, and a screen that had to know which kind of thread it was reading before
 * it could draw a bubble would be the place the two quietly drift apart.
 *
 * NOTHING IS HIDDEN HERE, and that is a real difference from the care circle. The
 * five rules exist because a pod writes things about a client that the client
 * must not read; this thread has no pod and no team-only lane — every line in it
 * was written to the person, so every line is served. If a team-only note is ever
 * wanted on an arrival, it belongs on the rail's own event log, not in here.
 */

/** Who wrote a line, in the words the app's bubbles read. */
type Kind = 'CLIENT' | 'STAFF' | 'AI';

export interface ArrivalThread {
  /** who this conversation is with — the sub under the scene band */
  sub: string;
  hasHistory: boolean;
  messages: Array<{
    id: string;
    kind: 'text';
    mine: boolean;
    who: string | null;
    text: string;
    ago: string;
  }>;
}

/** "just now" · "5 h ago" · "3 d ago" — the same clock the care circle prints. */
function ago(at: Date, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - at.getTime()) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} d ago`;
}

/**
 * The live arrival behind an account, or null.
 *
 * Found by PHONE, which is what the account and the arrival were both keyed on at
 * sign-up. It is a join on a value rather than a foreign key, and the day an
 * arrival should be linkable to its account by id, this is the line that becomes
 * a relation.
 */
export async function arrivalFor(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } });
  if (!u?.phone) return null;
  return prisma.arrival.findFirst({
    where: { phone: u.phone, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, step: true },
  });
}

/** The thread, oldest first — the order the screen scrolls to the bottom of. */
export async function thread(arrivalId: string, step: string): Promise<ArrivalThread> {
  const rows = await prisma.arrivalMessage.findMany({
    where: { arrivalId },
    orderBy: { seq: 'asc' },
    select: {
      id: true,
      fromKind: true,
      text: true,
      createdAt: true,
      fromUser: { select: { name: true, role: true } },
    },
  });

  const i = stepIndex(step);
  const label = FLOW[i]?.label ?? step;

  return {
    /* what the person is actually talking to, said plainly. "Your care circle"
       would be a promise this thread cannot keep — there is no pod yet. */
    sub: `Your onboarding team · step ${i + 1} of ${FLOW.length}, ${label}`,
    hasHistory: false,
    messages: rows.map((m) => ({
      id: m.id,
      kind: 'text' as const,
      mine: m.fromKind === 'CLIENT',
      /* "Name · Role" for the team, null for the person's own — the bubble draws
         a who-line only on the side that needs one */
      who:
        m.fromKind === 'CLIENT'
          ? null
          : m.fromUser
            ? `${m.fromUser.name} · ${m.fromUser.role}`
            : 'Your onboarding team',
      text: m.text,
      ago: ago(m.createdAt),
    })),
  };
}

/**
 * Write a line into the thread.
 *
 * THE SEQUENCE IS ASSIGNED UNDER A TRANSACTION, exactly as the care circle's is:
 * two messages racing for the same number would violate the unique index, and the
 * loser's message would be lost rather than merely reordered.
 */
export async function post(
  arrivalId: string,
  input: { text: string; fromKind: Kind; fromUserId?: string | null },
) {
  const text = input.text.trim();
  if (!text) throw ApiError.badRequest('Write something first.');

  return prisma.$transaction(async (tx) => {
    const last = await tx.arrivalMessage.findFirst({
      where: { arrivalId },
      orderBy: { seq: 'desc' },
      select: { seq: true },
    });
    return tx.arrivalMessage.create({
      data: {
        arrivalId,
        fromUserId: input.fromUserId ?? null,
        fromKind: input.fromKind as never,
        text,
        seq: (last?.seq ?? 0) + 1,
      },
      select: { id: true, seq: true, createdAt: true },
    });
  });
}

/**
 * The line the team writes the moment somebody signs up.
 *
 * A thread that opens empty reads as nobody being there. The deck has just
 * promised "your first message is waiting in My Circle", and this is that
 * message — so the promise is kept by the same request that made it.
 */
export async function openThread(arrivalId: string, firstName: string) {
  await post(arrivalId, {
    fromKind: 'STAFF',
    text:
      `Welcome, ${firstName}. Your onboarding has started — we collect your health ` +
      `records first, then book your assessment. Ask us anything here in the meantime.`,
  });
}
