'use client';

import { useParams, useRouter } from 'next/navigation';

import { Notice, SkeletonRows, Tabs } from '@/components/ui';
import { useCan } from '@/lib/can';
import { useConfig } from '@/features/config/queries';
import { AutomationsTab } from '@/features/config/AutomationsTab';
import { CatalogTab } from '@/features/config/CatalogTab';
import { ChainsTab } from '@/features/config/ChainsTab';
import { NotificationsTab } from '@/features/config/NotificationsTab';
import { PlansTab } from '@/features/config/PlansTab';
import { ProgramTab } from '@/features/config/ProgramTab';
import { ServiceTab } from '@/features/config/ServiceTab';

/**
 * Configuration — the page where Ops changes the numbers every other module reads.
 *
 * THE TAB LIVES IN THE URL, as `#/config/service` does in the demo: a refresh
 * keeps your place and a link opens the tab it names.
 *
 * `manageConfig` decides EDITING, not reading. A Super User carries the nav item
 * and sees the whole page read-only — every control renders static rather than
 * disappearing, because a settings page that hides what it will not let you change
 * cannot be used to find out what the settings are.
 */

const TABS = [
  { key: 'program', label: 'Program' },
  { key: 'service', label: 'Service' },
  { key: 'plans', label: 'Plans' },
  { key: 'chains', label: 'Chains' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'automations', label: 'Automations' },
  { key: 'catalog', label: 'Catalog' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function ConfigPage() {
  const router = useRouter();
  const params = useParams<{ tab?: string[] }>();
  const canEdit = useCan('manageConfig');
  const { data, isLoading, isError, error, refetch } = useConfig();

  const asked = params.tab?.[0];
  const active: TabKey = TABS.some((t) => t.key === asked) ? (asked as TabKey) : 'program';

  return (
    <>
      <div className="h1-row">
        <div>
          <div className="kicker">THE RULES</div>
          <h1 className="h1">Configuration</h1>
          <div className="sub">
            The programme&rsquo;s shape, the service ladder, the signature chains and the lists every
            other screen reads. {canEdit ? 'Edits here move the whole product.' : 'Read-only for your role.'}
          </div>
        </div>
      </div>

      <Tabs
        items={TABS.map((t) => ({ key: t.key, label: t.label, count: 0 }))}
        active={active}
        onSelect={(key) => router.push(key === 'program' ? '/config' : `/config/${key}`)}
      />

      {isError ? (
        <Notice kind="bad">
          We could not read the configuration. {(error as Error).message}
          <div className="retry">
            <button type="button" className="btn sm" onClick={() => void refetch()}>
              Try again
            </button>
          </div>
        </Notice>
      ) : null}

      {isLoading ? <SkeletonRows rows={4} height={96} /> : null}

      {data ? (
        <>
          {active === 'program' ? <ProgramTab program={data.program} canEdit={canEdit} /> : null}
          {active === 'service' ? <ServiceTab service={data.service} canEdit={canEdit} /> : null}
          {active === 'plans' ? <PlansTab /> : null}
          {active === 'chains' ? <ChainsTab chains={data.chains} canEdit={canEdit} /> : null}
          {active === 'notifications' ? (
            <NotificationsTab rules={data.notifications} canEdit={canEdit} />
          ) : null}
          {active === 'automations' ? (
            <AutomationsTab flows={data.flows} reach={data.reach} canEdit={canEdit} />
          ) : null}
          {active === 'catalog' ? (
            <CatalogTab
              categories={data.categories}
              usage={data.usage}
              tags={data.tags}
              tagUsage={data.tagUsage}
              canEdit={canEdit}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}
