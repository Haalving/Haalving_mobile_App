'use client';

import { useParams, useRouter } from 'next/navigation';

import { Tabs } from '@/components/ui';
import { useCan } from '@/lib/can';
import { AnnouncementsTab } from '@/features/people/AnnouncementsTab';
import { CapacityTab } from '@/features/people/CapacityTab';
import { RolesTab } from '@/features/people/RolesTab';
import { StaffTab } from '@/features/people/StaffTab';
import { useFeed } from '@/features/people/queries';

/**
 * People & Access — four tabs.
 *
 * READING THE PAGE AND EDITING IT ARE DIFFERENT RIGHTS. The page sits behind the
 * `people` sidebar item, which the Ops Head and the Super User also hold; every
 * write needs `managePeople`, which only the Super Admin has. So a read-only seat
 * sees the whole matrix and cannot move any of it — which is the point of a page
 * that exists to explain who may do what.
 */

type TabKey = 'staff' | 'roles' | 'capacity' | 'feed';

export default function PeoplePage() {
  const router = useRouter();
  const params = useParams<{ tab?: string[] }>();
  const canManage = useCan('managePeople');
  const feed = useFeed();

  const TABS = [
    { key: 'staff' as const, label: 'Staff', count: 0 },
    { key: 'roles' as const, label: 'Roles & permissions', count: 0 },
    { key: 'capacity' as const, label: 'Capacity', count: 0 },
    /* the only tab that carries a count — the others are lists, not inboxes */
    { key: 'feed' as const, label: 'Announcements', count: feed.data?.unseen ?? 0 },
  ];

  const asked = params.tab?.[0];
  const active: TabKey = TABS.some((t) => t.key === asked) ? (asked as TabKey) : 'staff';

  return (
    <>
      <div className="h1-row">
        <div>
          <div className="kicker">THE TEAM</div>
          <h1 className="h1">People &amp; Access</h1>
          <div className="sub">
            Who is on the team, what each seat may do, and how loaded everyone is.
          </div>
        </div>
      </div>

      <Tabs
        items={TABS}
        active={active}
        onSelect={(k) => router.push(k === 'staff' ? '/people' : `/people/${k}`)}
      />

      {active === 'staff' ? <StaffTab /> : null}
      {active === 'roles' ? <RolesTab canEdit={canManage} /> : null}
      {active === 'capacity' ? <CapacityTab canEdit={canManage} /> : null}
      {active === 'feed' ? <AnnouncementsTab /> : null}
    </>
  );
}
