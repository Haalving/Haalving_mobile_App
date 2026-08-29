'use client';

import { useParams, useRouter } from 'next/navigation';

import { Tabs } from '@/components/ui';
import { useCan } from '@/lib/can';
import { useSession } from '@/store/session.store';
import { ApprovalsTab } from '@/features/leave/ApprovalsTab';
import { AvailabilityTab } from '@/features/leave/AvailabilityTab';
import { MyLeaveTab } from '@/features/leave/MyLeaveTab';
import { TeamTab } from '@/features/leave/TeamTab';
import { useApprovals, useTeamLeave } from '@/features/leave/queries';

/**
 * Time & Cover — the team's clock.
 *
 * Four tabs, and TWO OF THEM ARE ROLE-SCOPED. Everybody has a working week and
 * everybody can need a break, so the first two are for every staff seat. Team is
 * for whoever plans covers — an HoD over their own bench, Ops and the Super Admin
 * over everyone — and Approvals for whoever signs.
 *
 * The tabs are hidden rather than shown-and-refused, because a tab that exists
 * only to tell you it is not yours is a worse answer than one that was never
 * there. The SERVER still refuses either way: `/leave/team` answers 403 and writes
 * an audit row, whatever the sidebar decided to draw.
 */

type TabKey = 'availability' | 'mine' | 'team' | 'approvals';

export default function LeavePage() {
  const router = useRouter();
  const params = useParams<{ tab?: string[] }>();
  const role = useSession((s) => s.role);

  /* the same test the service makes: HoD, Ops Head, Super Admin, or the perm */
  const canReassign = useCan('reassignLeave');
  const canSeeAll = useCan('seeAllClients');
  const canApproveLeave = useCan('approveLeave');
  const key = role?.key ?? '';
  const showTeam = key === 'hod' || key === 'opshead' || key === 'admin' || canReassign || canSeeAll;
  /* the approver role is configurable, so the page ASKS rather than assuming
     `admin` — Configuration can move it to the Ops Head and this follows */
  const approvals = useApprovals(true);
  const showApprovals = canApproveLeave || approvals.isSuccess;

  const team = useTeamLeave(showTeam);

  const TABS = [
    { key: 'availability' as const, label: 'My availability', count: 0 },
    { key: 'mine' as const, label: 'My leave', count: 0 },
    ...(showTeam
      ? [
          {
            key: 'team' as const,
            label: 'Team',
            count: (team.data?.needsPlan.length ?? 0) + (team.data?.waiting.length ?? 0),
          },
        ]
      : []),
    ...(showApprovals
      ? [{ key: 'approvals' as const, label: 'Approvals', count: approvals.data?.pending.length ?? 0 }]
      : []),
  ];

  const asked = params.tab?.[0];
  const active: TabKey = TABS.some((t) => t.key === asked) ? (asked as TabKey) : 'availability';

  return (
    <>
      <div className="h1-row">
        <div>
          <div className="kicker">THE TEAM CLOCK</div>
          <h1 className="h1">Time &amp; Cover</h1>
          <div className="sub">
            Working hours, leave, and who holds each seat while someone is away.
          </div>
        </div>
      </div>

      <Tabs
        items={TABS}
        active={active}
        onSelect={(k) => router.push(k === 'availability' ? '/leave' : `/leave/${k}`)}
      />

      <div className="lv-root">
        {active === 'availability' ? <AvailabilityTab /> : null}
        {active === 'mine' ? <MyLeaveTab /> : null}
        {active === 'team' && showTeam ? <TeamTab /> : null}
        {active === 'approvals' && showApprovals ? <ApprovalsTab /> : null}
      </div>
    </>
  );
}
