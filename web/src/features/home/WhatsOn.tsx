'use client';

import { IconTile, Num, Pill, SkeletonRows } from '@/components/ui';
import { useApprovedGatherings } from '@/features/community/queries';

/**
 * What the community has on — for the seats that cannot open Community.
 *
 * PHASE 2 OF THE GATHERING WORK, and the reason it lives on Home rather than
 * behind a tenth sidebar item. Six roles — Doctor, Dietician, the three pillar
 * coaches and a Head of Department — hold no `community` nav, and giving them the
 * whole section to see a walk on Saturday would also hand them Challenges, Game
 * Days, the Feed, Zones and Announcements. This is the read without the section.
 *
 * ONLY THE APPROVED ONES REACH IT, because the endpoint behind it has no other
 * kind: a proposal is not the community's until somebody lets it out, and this is
 * a picture of the community.
 *
 * Rendered only for those roles. A seat that has the tab does not want the same
 * list twice on two screens.
 */
export function WhatsOn() {
  const { data, isLoading } = useApprovedGatherings();

  if (isLoading) return <SkeletonRows rows={2} height={64} />;
  if (!data || !data.length) return null;

  return (
    <>
      <div className="list">
        {data.slice(0, 4).map((g) => (
          <div className="trow" key={g.id}>
            <IconTile name="cal" />
            <div className="grow">
              <b>{g.title}</b>
              <small>
                {g.when}
                {g.where ? ` · ${g.where}` : ''}
              </small>
            </div>
            {g.going ? (
              <Pill kind="info">
                <Num>{g.going}</Num> going
              </Pill>
            ) : null}
          </div>
        ))}
      </div>
      {data.length > 4 ? (
        <span className="audit">
          <Num>{data.length - 4}</Num> more · ask the team for the full list
        </span>
      ) : null}
    </>
  );
}
