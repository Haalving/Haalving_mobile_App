import { slaReading } from '@haalving/shared';

import { prisma } from '../config/prisma.js';
import * as config from './config.service.js';

/**
 * THE DEVIATIONS GENERATOR — what turns the board from a poster into a signal.
 *
 * The Deviation model, its endpoint and its scoping already exist; until now the
 * rows came only from the seed, so the board showed the same three names forever.
 * This reads the live data the other boards read and writes the deviations that
 * are actually true right now — the same three the demo names, from real signals:
 *
 *   Meal photo SLA breach   — an unrated plate past the escalation line
 *   Non-response (3 d)       — no meal, mood or message from the client in 72 h
 *   Rating decline over 1★   — the trailing-7-day mean dropped ≥ 1 star WoW
 *
 * IDEMPOTENT, AND IT DOES NOT NEED A MIGRATION. Each generated row carries a
 * deterministic id `dev-<clientId>-<slug>`, upserted by that id, so a second run
 * updates in place rather than piling up duplicates — and the board's "seen" set,
 * which is keyed by id, stays stable. Rows it generates are the only ones it ever
 * deletes (the `dev-` prefix): a client who resumes logging loses their
 * non-response row on the next run, while the seed's own `dv-*` rows are never
 * touched. `at` is set once, on first sight, and left alone on later runs so the
 * board keeps telling the reader when a deviation actually started.
 *
 * It is NOT wired into the read. A GET that generates is a GET that writes, and it
 * would make the board's contents depend on the instant it was fetched; these are
 * daily-scale signals, so it runs on the 08:00 digest cron (jobs/index.ts) and can
 * be triggered by hand. `listDeviations` stays a pure read.
 */

const AUTO_PREFIX = 'dev-';

const SLA = { slug: 'meal-sla', kind: 'Meal photo SLA breach' } as const;
const SILENT = { slug: 'no-response', kind: 'Non-response (3 d)' } as const;
const DECLINE = { slug: 'rating-decline', kind: 'Rating decline over 1 star WoW' } as const;

/** No meal, mood or own message in this long is "non-response (3 d)". */
const NON_RESPONSE_MS = 72 * 60 * 60 * 1000;
/** A week-over-week mean-star fall this large or larger is a "decline". */
const DECLINE_DROP = 1.0;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? name;
const autoId = (clientId: string, slug: string): string => `${AUTO_PREFIX}${clientId}-${slug}`;

interface Desired {
  id: string;
  clientId: string;
  kind: string;
  state: string;
  mode: string;
}

/**
 * Scan every active client and reconcile their auto-deviations with reality.
 *
 * Pure of wall-clock in the sense the schedule cares about: it takes `nowMs`, so a
 * test can put the clock where it needs it and a cron can hand it the real one.
 */
export async function generateDeviations(
  nowMs: number = Date.now(),
): Promise<{ written: number; cleared: number }> {
  const [clients, sla] = await Promise.all([
    prisma.client.findMany({
      where: { status: 'active' },
      select: {
        id: true,
        plan: true,
        observation: true,
        /* the dietitian's name for the decline row's "awaiting …", and only that */
        pod: { where: { seat: 'dietitian' }, select: { staff: { select: { name: true } } } },
      },
    }),
    config.getSla(),
  ]);

  const clientIds = clients.map((c) => c.id);
  if (clientIds.length === 0) return { written: 0, cleared: 0 };
  const byId = new Map(clients.map((c) => [c.id, c]));

  /* ---- Meal photo SLA breach: any unrated plate past the escalation line ---- */
  const unrated = await prisma.meal.findMany({
    where: { clientId: { in: clientIds }, finalStars: null },
    select: { clientId: true, capturedAt: true },
  });
  const breached = new Set<string>();
  for (const m of unrated) {
    const c = byId.get(m.clientId);
    if (!c) continue;
    const reading = slaReading(
      sla,
      { capturedAtMs: m.capturedAt.getTime(), rated: false, observation: c.observation },
      nowMs,
    );
    if (reading?.escalated) breached.add(m.clientId);
  }

  /* ---- Non-response: newest of meal / mood / own message older than 72 h ---- */
  const [mealMax, moodMax, msgMax] = await Promise.all([
    prisma.meal.groupBy({
      by: ['clientId'],
      where: { clientId: { in: clientIds } },
      _max: { capturedAt: true },
    }),
    prisma.clientMood.groupBy({
      by: ['clientId'],
      where: { clientId: { in: clientIds } },
      _max: { createdAt: true },
    }),
    prisma.circleMessage.groupBy({
      by: ['clientId'],
      where: { clientId: { in: clientIds }, fromKind: 'CLIENT' },
      _max: { createdAt: true },
    }),
  ]);
  const newest = new Map<string, number>();
  const seen = (clientId: string, at: Date | null): void => {
    if (!at) return;
    newest.set(clientId, Math.max(newest.get(clientId) ?? 0, at.getTime()));
  };
  for (const r of mealMax) seen(r.clientId, r._max.capturedAt);
  for (const r of moodMax) seen(r.clientId, r._max.createdAt);
  for (const r of msgMax) seen(r.clientId, r._max.createdAt);
  const silent = new Set<string>();
  for (const clientId of clientIds) {
    /* a client who has NEVER logged is an onboarding problem, not a lapse — the
       non-response signal only fires on a client who went quiet after speaking */
    const last = newest.get(clientId);
    if (last != null && nowMs - last > NON_RESPONSE_MS) silent.add(clientId);
  }

  /* ---- Rating decline: trailing-7-day mean vs the 7 days before, drop ≥ 1★ ---- */
  const ratedSince = new Date(nowMs - 2 * WEEK_MS);
  const rated = await prisma.meal.findMany({
    where: { clientId: { in: clientIds }, finalStars: { not: null }, ratedAt: { gte: ratedSince } },
    select: { clientId: true, finalStars: true, ratedAt: true },
  });
  const windows = new Map<string, { recent: number[]; prior: number[] }>();
  for (const m of rated) {
    if (m.ratedAt == null || m.finalStars == null) continue;
    const age = nowMs - m.ratedAt.getTime();
    const w = windows.get(m.clientId) ?? { recent: [], prior: [] };
    (age <= WEEK_MS ? w.recent : w.prior).push(m.finalStars);
    windows.set(m.clientId, w);
  }
  const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
  const declined = new Set<string>();
  for (const [clientId, w] of windows) {
    if (w.recent.length && w.prior.length && mean(w.prior) - mean(w.recent) >= DECLINE_DROP) {
      declined.add(clientId);
    }
  }

  /* ---- assemble the desired rows ---- */
  const modeOf = (clientId: string): string => (byId.get(clientId)?.plan === 'SVAYAM' ? 'AI' : 'Coach');
  const dietOf = (clientId: string): string =>
    firstName(byId.get(clientId)?.pod?.[0]?.staff?.name ?? '') || 'the dietitian';

  const desired: Desired[] = [];
  for (const clientId of breached) {
    desired.push({
      id: autoId(clientId, SLA.slug),
      clientId,
      kind: SLA.kind,
      state: 'Ops notified · queue reordered',
      mode: modeOf(clientId),
    });
  }
  for (const clientId of silent) {
    desired.push({
      id: autoId(clientId, SILENT.slug),
      clientId,
      kind: SILENT.kind,
      state: 'Ladder step 2 — human call today',
      mode: modeOf(clientId),
    });
  }
  for (const clientId of declined) {
    desired.push({
      id: autoId(clientId, DECLINE.slug),
      clientId,
      kind: DECLINE.kind,
      state: `Nudge drafted, awaiting ${dietOf(clientId)}`,
      mode: modeOf(clientId),
    });
  }

  /* ---- reconcile: upsert what is true, clear the auto rows that no longer are ---- */
  const at = new Date(nowMs);
  for (const d of desired) {
    await prisma.deviation.upsert({
      where: { id: d.id },
      create: { id: d.id, clientId: d.clientId, kind: d.kind, state: d.state, mode: d.mode, at },
      /* `at` is deliberately absent — first-seen time is kept across runs */
      update: { kind: d.kind, state: d.state, mode: d.mode },
    });
  }

  const keep = new Set(desired.map((d) => d.id));
  const autoRows = await prisma.deviation.findMany({
    where: { id: { startsWith: AUTO_PREFIX } },
    select: { id: true },
  });
  const stale = autoRows.filter((r) => !keep.has(r.id)).map((r) => r.id);
  if (stale.length) await prisma.deviation.deleteMany({ where: { id: { in: stale } } });

  return { written: desired.length, cleared: stale.length };
}
