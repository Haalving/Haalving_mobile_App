'use client';

import type * as React from 'react';
import { useParams, useRouter } from 'next/navigation';

import { Empty, Notice, SkeletonRows, Tabs } from '@/components/ui';
import { AnnouncementsTab } from '@/features/community/AnnouncementsTab';
import { ChallengesTab } from '@/features/community/ChallengesTab';
import { FeedTab } from '@/features/community/FeedTab';
import { GameDaysTab } from '@/features/community/GameDaysTab';
import { GatheringsTab } from '@/features/community/GatheringsTab';
import { ZonesTab } from '@/features/community/ZonesTab';
import { useCommunityMeta } from '@/features/community/queries';

/**
 * Community — the console side of the client's Community tab.
 *
 * Ported from console-community.js. THE TABS ARE THE SERVER'S ANSWER, not a
 * filtered copy of one: `GET /community` returns the sections this caller may see
 * with their counts, so a badge and the list it points at come from one scoping
 * expression.
 *
 * The section keys are the demo's own, `quiz` and `announce` included — they are
 * in URLs and in `SECTION_ALIAS`, and renaming them to read better here would
 * break links that already exist.
 */

const TABS: Record<string, () => React.ReactNode> = {
  gatherings: GatheringsTab,
  challenges: ChallengesTab,
  quiz: GameDaysTab,
  feed: FeedTab,
  zones: ZonesTab,
  announce: AnnouncementsTab,
};

export default function CommunityPage() {
  const router = useRouter();
  const params = useParams<{ tab?: string[] }>();
  const { data, isLoading, error } = useCommunityMeta();

  const sections = data?.sections ?? [];
  const asked = params.tab?.[0];
  const active = sections.some((s) => s.key === asked) ? (asked as string) : sections[0]?.key;
  const Tab = active ? TABS[active] : undefined;

  return (
    <>
      <div className="h1-row">
        <div>
          <div className="kicker">THE COMMONS</div>
          <h1 className="h1">Community</h1>
          <p className="sub">
            Gatherings, challenges, the Health Games book, the Haalving Zone canvases and what the
            team announces — the same community clients see on their Community tab.
          </p>
        </div>
      </div>

      {isLoading ? <SkeletonRows rows={3} height={72} /> : null}

      {/* a failed read is SAID OUT LOUD — a page that draws its header and then
          nothing reads as an empty section, which is the one reading that would
          stop somebody checking */}
      {error ? <Notice kind="bad">{(error as Error).message}</Notice> : null}

      {data && !sections.length ? (
        <Empty icon="users" sentence="No community sections for your role." />
      ) : null}

      {sections.length ? (
        <>
          <Tabs
            items={sections.map((s) => ({ key: s.key, label: s.label, count: s.count }))}
            active={active as string}
            onSelect={(k) => router.push(k === sections[0]?.key ? '/community' : `/community/${k}`)}
          />
          <div
            id="community-root"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--s3)',
              marginTop: 'var(--s3)',
            }}
          >
            {Tab ? <Tab /> : null}
          </div>
        </>
      ) : null}
    </>
  );
}
