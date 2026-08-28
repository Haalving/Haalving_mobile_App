'use client';

import { useParams } from 'next/navigation';

import { PendingPage } from '@/components/shell/PendingPage';

/**
 * Work Queues — the host for the four boards.
 *
 * A CATCH-ALL, and it has to be. `NAV_ITEMS.queues.owns` names four sub-routes,
 * and two of them are where a role's login LANDS: the Super User's home is
 * `#/queues/approvals` and the Dietitian's is `#/queues/meals` (rbac.ts:133,
 * 149). With only `/queues` on disk those two roles signed in and hit Next's
 * bare 404 — no shell, no sidebar, no way back except editing the URL. Three
 * accounts on the seed could not use the product at all.
 *
 * So the segment resolves here whether or not its board is built, exactly as
 * the demo's router does: it splits the hash and hands `['approvals']` to the
 * one `queues` view rather than looking for a separate route per board
 * (core.js:1332).
 *
 * Each board says what it will hold, in its own words. A shared "not built yet"
 * for all four would make the landing read as broken rather than pending, and
 * these are the first screens two roles ever see.
 */

const BOARDS: Record<string, { title: string; sub: string; icon: string; sentence: string; detail: string }> = {
  approvals: {
    title: 'Approvals',
    sub: 'Everything waiting on your signature, oldest first.',
    icon: 'check',
    sentence: 'Items awaiting a signature land here.',
    detail: 'Each with its signature chain: who raised it, who has signed, and who is still outstanding.',
  },
  meals: {
    title: 'Meal Queue',
    sub: 'Logged meals waiting to be rated, against their SLA.',
    icon: 'clock',
    sentence: 'Meals waiting on a rating land here.',
    detail: 'Newest first with the SLA countdown running, so the one about to breach is the one on top.',
  },
  medical: {
    title: 'Medical Review',
    sub: 'Cases a doctor needs to look at.',
    icon: 'heart',
    sentence: 'Cases raised for medical review land here.',
    detail: 'Vitals, medication changes and anything a coach escalated, with the reason it was raised.',
  },
  builder: {
    title: 'Chart Builder',
    sub: 'Diet and training charts being drafted.',
    icon: 'doc',
    sentence: 'Charts in draft land here.',
    detail: 'Each one editable until it is issued, and never issued on your behalf.',
  },
};

const HOST = {
  title: 'Work Queues',
  sub: 'Approvals, the meal queue, medical review and the chart builder — everything waiting on you.',
  icon: 'clock',
  sentence: 'The four boards land here.',
  detail:
    'Approvals with their signature chain, the dietitian’s meal queue with its SLA countdown, medical review, and the chart builder.',
};

export default function QueuesPage() {
  const params = useParams<{ board?: string[] }>();
  const asked = params.board?.[0];
  /* an unknown segment falls back to the host rather than 404ing — a stale link
     should still leave you somewhere with a sidebar */
  const board = (asked && BOARDS[asked]) || HOST;

  return (
    <PendingPage
      kicker="YOUR DESK"
      title={board.title}
      sub={board.sub}
      icon={board.icon}
      sentence={board.sentence}
      detail={board.detail}
    />
  );
}
