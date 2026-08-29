'use client';

import { useState } from 'react';

import { Icon } from '@/components/icons/Icon';
import { Num, useToast } from '@/components/ui';
import {
  useAddCategory,
  useAddTag,
  useDeleteCategory,
  useDeleteTag,
  useRenameCategory,
  type ConfigPayload,
} from '@/features/config/queries';

/**
 * The Catalog tab — the level books' categories, and the tags items carry.
 *
 * Ported from `catalogHtml` / `wireCatalog` (console-config.js:523-683).
 *
 * RENAMING IS ALWAYS SAFE and deleting often is not: the name is only ever
 * displayed, while the KEY is what every item, template and client points at. So
 * the name is an input that saves on blur, the key is fixed and shown in mono, and
 * anything in use offers no delete at all.
 */

/** "3 items · 1 template · 2 clients" — the demo's `usageWords`. */
function usageWords(u: { items: number; templates: number; clients: number } | undefined) {
  const p = u ?? { items: 0, templates: 0, clients: 0 };
  return (
    <>
      <Num>{p.items}</Num> items · <Num>{p.templates}</Num> templates · <Num>{p.clients}</Num>{' '}
      clients
    </>
  );
}

export function CatalogTab({
  categories,
  usage,
  tags,
  tagUsage,
  canEdit,
}: Pick<ConfigPayload, 'categories' | 'usage' | 'tags' | 'tagUsage'> & { canEdit: boolean }) {
  const rename = useRenameCategory();
  const addCat = useAddCategory();
  const delCat = useDeleteCategory();
  const addTag = useAddTag();
  const delTag = useDeleteTag();
  const toast = useToast();

  const [catName, setCatName] = useState('');
  const [tagName, setTagName] = useState('');

  return (
    <>
      <div className="card">
        <span className="k">Categories</span>
        <p className="sub" style={{ margin: 'var(--s2) 0 0' }}>
          Every level book belongs to one. A new category falls back to the Sedentary level book
          until its own is written.
        </p>

        <div className="list" style={{ marginTop: 'var(--s3)' }}>
          {categories.map((c) => {
            const u = usage[c.key];
            const inUse = !!u && u.items + u.templates + u.clients > 0;
            return (
              <div className="trow" key={c.key}>
                <span className="grow">
                  {canEdit ? (
                    <input
                      className="input"
                      defaultValue={c.name}
                      aria-label={`Name of the ${c.name} category`}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== c.name) {
                          rename.mutate(
                            { key: c.key, name: v },
                            { onError: (err) => toast((err as Error).message) },
                          );
                        }
                      }}
                    />
                  ) : (
                    <b>{c.name}</b>
                  )}
                  <small>{usageWords(u)}</small>
                </span>

                <span className="mono">{c.key}</span>

                {c.seeded ? (
                  <small>Ships with the product</small>
                ) : inUse ? (
                  <small>In use</small>
                ) : canEdit ? (
                  <button
                    type="button"
                    className="cfg-del"
                    aria-label={`Delete the ${c.name} category`}
                    onClick={() =>
                      delCat.mutate(c.key, {
                        onSuccess: () => toast('Category deleted.'),
                        onError: (e) => toast((e as Error).message),
                      })
                    }
                  >
                    <Icon name="x" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>

        {canEdit ? (
          <div className="cfg-nradd">
            <input
              className="input"
              placeholder="New category"
              aria-label="New category name"
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
            />
            <button
              type="button"
              className="btn sm"
              disabled={!catName.trim()}
              onClick={() =>
                addCat.mutate(catName.trim(), {
                  onSuccess: () => {
                    setCatName('');
                    toast('Category added.');
                  },
                  onError: (e) => toast((e as Error).message),
                })
              }
            >
              Add category
            </button>
          </div>
        ) : null}

        <p className="audit" style={{ marginTop: 'var(--s2)' }}>
          The three shipped categories cannot be removed or re-keyed — every item, template and
          client already points at them. Renaming one is always safe.
        </p>
      </div>

      <div className="card" style={{ marginTop: 'var(--s4)' }}>
        <span className="k">Tags</span>
        <p className="sub" style={{ margin: 'var(--s2) 0 0' }}>
          What a catalog item is for. One spelling each — a tag that existed twice would split every
          filter that used it.
        </p>

        <div className="row" style={{ gap: 'var(--s2)', flexWrap: 'wrap', marginTop: 'var(--s3)' }}>
          {tags.map((t) => {
            const items = tagUsage[t.id]?.items ?? 0;
            return (
              <span className="chip" key={t.id}>
                {t.name} <Num>{items}</Num>
                {canEdit && items === 0 ? (
                  <button
                    type="button"
                    aria-label={`Delete the ${t.name} tag`}
                    style={{
                      marginLeft: 'var(--s2)',
                      padding: 0,
                      background: 'none',
                      border: 0,
                      cursor: 'pointer',
                      color: 'var(--ink-3)',
                    }}
                    onClick={() =>
                      delTag.mutate(t.id, {
                        onSuccess: () => toast('Tag deleted.'),
                        onError: (e) => toast((e as Error).message),
                      })
                    }
                  >
                    <Icon name="x" />
                  </button>
                ) : null}
              </span>
            );
          })}
        </div>

        {canEdit ? (
          <div className="cfg-nradd">
            <input
              className="input"
              placeholder="New tag"
              aria-label="New tag name"
              value={tagName}
              onChange={(e) => setTagName(e.target.value)}
            />
            <button
              type="button"
              className="btn sm"
              disabled={!tagName.trim()}
              onClick={() =>
                addTag.mutate(tagName.trim(), {
                  onSuccess: () => {
                    setTagName('');
                    toast('Tag added.');
                  },
                  onError: (e) => toast((e as Error).message),
                })
              }
            >
              Add tag
            </button>
          </div>
        ) : null}

        <p className="audit" style={{ marginTop: 'var(--s2)' }}>
          A tag on an item cannot be deleted — clear it from the items first.
        </p>
      </div>
    </>
  );
}
