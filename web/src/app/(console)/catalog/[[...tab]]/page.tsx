'use client';

import { useParams, useRouter } from 'next/navigation';

import { Notice, SkeletonRows, Tabs } from '@/components/ui';
import { LibraryTab } from '@/features/catalog/LibraryTab';
import { TemplatesTab } from '@/features/catalog/TemplatesTab';
import { useCatalog } from '@/features/catalog/queries';

/**
 * The Catalog — five libraries, and the templates built out of them.
 *
 * Ported from console-catalog.js. ONE READ SERVES EVERY TAB: the tag counts on a
 * library are computed against the items in the same payload, so a chip cannot
 * advertise a number the list below it does not have.
 *
 * MOTIVATION IS A FIFTH LIBRARY, NOT A FIFTH PILLAR. It sits beside the four
 * pillars here because a morning film is a building block a plan draws from, but
 * nothing in the programme counts it as a pillar and it carries no category.
 */
export default function CatalogPage() {
  const router = useRouter();
  const params = useParams<{ tab?: string[] }>();
  const { data, isLoading, error } = useCatalog();

  const libraries = data?.libraries ?? [];
  const keys = [...libraries.map((l) => l.key), 'templates'];
  const asked = params.tab?.[0];
  const active = keys.includes(asked ?? '') ? (asked as string) : keys[0];

  return (
    <>
      <div className="h1-row">
        <div>
          <div className="kicker">THE CATALOG</div>
          <h1 className="h1">Catalog</h1>
          <p className="sub">
            The fitness, yoga, food and mind building blocks every plan draws from, the morning films
            that open a client&rsquo;s day — and the templates that arrange them into a cycle.
          </p>
        </div>
      </div>

      {isLoading ? <SkeletonRows rows={4} height={80} /> : null}
      {error ? <Notice kind="bad">{(error as Error).message}</Notice> : null}

      {data ? (
        <>
          <Tabs
            items={[
              ...libraries.map((l) => ({ key: l.key, label: l.name })),
              { key: 'templates', label: 'Templates' },
            ]}
            active={active as string}
            onSelect={(k) => router.push(k === keys[0] ? '/catalog' : `/catalog/${k}`)}
          />
          <div
            id="catalog-root"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--s3)',
              marginTop: 'var(--s3)',
            }}
          >
            {active === 'templates' ? (
              <TemplatesTab data={data} />
            ) : (
              (() => {
                const lib = libraries.find((l) => l.key === active);
                /* keyed on the library so switching tabs resets its filters — a
                   category chip carried from Fitness into Nutrition would silently
                   narrow a shelf the reader never filtered */
                return lib ? <LibraryTab key={lib.key} lib={lib} data={data} /> : null;
              })()
            )}
          </div>
        </>
      ) : null}
    </>
  );
}
