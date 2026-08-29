'use client';

import { useState } from 'react';

import { Audit, Empty, Notice, Num, Pill, Sheet, useToast } from '@/components/ui';
import { Icon } from '@/components/icons/Icon';
import { itemArt } from './art';
import {
  useArchiveItem,
  useSaveItem,
  type CatalogData,
  type CatalogItem,
  type Library,
} from './queries';

/**
 * One library — a shelf of building blocks, filtered two different ways.
 *
 * Ported from console-catalog.js `renderPillarTab`, `chipsRowHtml` and
 * `itemRowHtml`.
 *
 * THE TWO FILTER ROWS ARE TWO DIFFERENT QUESTIONS. Category is a segmented
 * control because it is pick-exactly-one; tags are counted chips because that is
 * pick-any-number. The shapes say so without a word of copy, which is why they
 * are not both rendered as chip rows.
 *
 * A ZERO-COUNT TAG IS DISABLED, NEVER HIDDEN. A chip row that reshuffles as you
 * filter is unreadable, and hiding the active chip would strand the filter with
 * no way back.
 *
 * THE COUNT ON A TAG IS FACETED: it is computed against every other filter but
 * NOT against the tag row itself, so it answers "how many would I get if I added
 * this" rather than "how many exist". A count that ignored the search box would
 * advertise "diabetes 2" over an empty list.
 */

/** The first sentence of the instructions, which is what a row has room for. */
function firstSentence(s: string): string {
  const cut = s.search(/[.!?]/);
  return cut > 0 ? s.slice(0, cut + 1) : s;
}

function matchesQuery(it: CatalogItem, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return it.name.toLowerCase().includes(s) || it.instructions.toLowerCase().includes(s);
}

/* a film has no category; every other library files its items on one */
const hasTrack = (key: string) => key !== 'motivation';

export function LibraryTab({ lib, data }: { lib: Library; data: CatalogData }) {
  const save = useSaveItem();
  const archive = useArchiveItem();
  const toast = useToast();

  const [track, setTrack] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [q, setQ] = useState('');

  const [detail, setDetail] = useState<CatalogItem | null>(null);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', track: '', tags: '', instructions: '' });

  const items = lib.items;

  /*
   * Every tag this library could offer: the governed vocabulary from
   * Configuration, PLUS anything already on an item that has since left it — a
   * tag in use must stay filterable or the items wearing it become unreachable.
   */
  const tagUnion = (() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of data.tags) if (!seen.has(t.name)) (seen.add(t.name), out.push(t.name));
    for (const it of items) for (const t of it.tags) if (!seen.has(t)) (seen.add(t), out.push(t));
    return out;
  })();

  const tagCount = (tag: string) =>
    items.filter(
      (it) => (!track || it.track === track) && matchesQuery(it, q) && it.tags.includes(tag),
    ).length;

  const shown = items.filter(
    (it) =>
      (!track || it.track === track) &&
      (!tags.length || it.tags.some((t) => tags.includes(t))) &&
      matchesQuery(it, q),
  );

  /* an item filed under a category Configuration has since deleted keeps a
     member of its own, or the row would silently hide those items' shelf */
  const members = (() => {
    const base = [{ key: '', name: 'All', gone: false }, ...data.categories.map((c) => ({ ...c, gone: false }))];
    const known = new Set(base.map((m) => m.key));
    for (const it of items) {
      if (it.track && !known.has(it.track)) {
        known.add(it.track);
        base.push({ key: it.track, name: it.track, gone: true });
      }
    }
    return base;
  })();

  const categoryName = (key: string | null) =>
    data.categories.find((c) => c.key === key)?.name ?? key ?? '—';

  const openNew = () => {
    setDraft({ name: '', track: data.categories[0]?.key ?? '', tags: '', instructions: '' });
    setEditing(null);
    setAdding(true);
  };
  const openEdit = (it: CatalogItem) => {
    setDraft({
      name: it.name,
      track: it.track ?? '',
      tags: it.tags.join(', '),
      instructions: it.instructions,
    });
    setDetail(null);
    setAdding(false);
    setEditing(it);
  };
  const closeAuthor = () => {
    setAdding(false);
    setEditing(null);
  };

  const submit = () => {
    const name = draft.name.trim();
    if (!name) {
      toast('Give the item a name first.');
      return;
    }
    save.mutate(
      {
        ...(editing ? { id: editing.id } : {}),
        body: {
          library: lib.key,
          name,
          track: hasTrack(lib.key) ? draft.track || null : null,
          tags: draft.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          instructions: draft.instructions.trim(),
        },
      },
      {
        onSuccess: () => {
          closeAuthor();
          toast(editing ? `Saved — ${name}` : `Added — ${name}`);
        },
        onError: (e) => toast((e as Error).message),
      },
    );
  };

  return (
    <>
      {lib.canEdit ? (
        <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 'var(--s2)' }}>
          <button type="button" className="btn" onClick={openNew}>
            <Icon name="plus" />
            Add item
          </button>
        </div>
      ) : (
        <Audit>This aisle is not yours to author — you are reading {lib.name}.</Audit>
      )}

      <div className="catfil">
        {hasTrack(lib.key) ? (
          <div className="catfrow">
            <span className="catfl">Category</span>
            <div className="catseg" role="group" aria-label="Filter by category">
              {members.map((m) => {
                const on = track === m.key;
                return (
                  <button
                    type="button"
                    key={m.key || 'all'}
                    className={on ? 'on' : ''}
                    {...(on ? { 'aria-current': 'true' as const } : {})}
                    aria-pressed={on}
                    /* a segmented control SETS, never toggles — tapping the member
                       you are already on must not drop you back to All */
                    onClick={() => setTrack(m.key)}
                  >
                    {m.name}
                    {m.gone ? <span className="catgone"> removed</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {tagUnion.length ? (
          <div className="catfrow">
            <span className="catfl">Tags</span>
            <div className="cattags" role="group" aria-label="Filter by tag">
              {tagUnion.map((t) => {
                const on = tags.includes(t);
                const n = tagCount(t);
                return (
                  <button
                    type="button"
                    key={t}
                    className={on ? 'on' : ''}
                    disabled={!n && !on}
                    aria-pressed={on}
                    onClick={() => setTags((cur) => (on ? cur.filter((x) => x !== t) : [...cur, t]))}
                  >
                    {t}
                    <span className="num">{n}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <div style={{ margin: 'var(--s2) 0 var(--s3)' }}>
        <input
          className="input"
          type="search"
          placeholder={`Search ${lib.name}`}
          aria-label={`Search ${lib.name}`}
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="list">
        {shown.length ? (
          shown.map((it) => (
            <button type="button" className="trow click catrow" key={it.id} onClick={() => setDetail(it)}>
              <span className="grow">
                <b>{it.name}</b>
                <small>{firstSentence(it.instructions)}</small>
                {it.tags.length ? (
                  <span
                    className="row"
                    style={{ flexWrap: 'wrap', gap: 'var(--s1)', marginTop: 'var(--s1)' }}
                  >
                    {it.tags.map((t) => (
                      <span className="chip" key={t}>
                        {t}
                      </span>
                    ))}
                  </span>
                ) : null}
              </span>
              {it.archived ? <Pill kind="warn">Archived</Pill> : null}
              {hasTrack(lib.key) ? (
                <Pill kind="neutral">{categoryName(it.track)}</Pill>
              ) : (
                <Pill kind={it.media?.video ? 'ok' : 'neutral'}>
                  {it.media?.video ? 'Linked' : 'Not filmed'}
                </Pill>
              )}
              {/* the authored picture, else the pillar's family art — an item
                  nobody has photographed yet reads as itself rather than as a
                  gap in the column. A film gets nothing; its pill already says
                  so. */}
              {(() => {
                const art = itemArt(lib.key, it.name, it.media?.image);
                return art ? (
                  <span className="tcard catthumb" aria-hidden="true">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={art} alt="" loading="lazy" decoding="async" />
                  </span>
                ) : null;
              })()}
            </button>
          ))
        ) : (
          <Empty
            icon="leaf"
            sentence="Nothing matches that filter. Clear a chip or the search to see the full catalog."
          />
        )}
      </div>

      {/* -------------------------------------------------------- the detail */}
      <Sheet open={!!detail} onClose={() => setDetail(null)} label={detail?.name ?? 'Item'}>
        {detail ? (
          <>
            <div className="h1">{detail.name}</div>
            <div className="row" style={{ gap: 'var(--s2)', flexWrap: 'wrap' }}>
              {hasTrack(lib.key) ? <Pill kind="neutral">{categoryName(detail.track)}</Pill> : null}
              {detail.archived ? <Pill kind="warn">Archived</Pill> : null}
              {detail.tags.map((t) => (
                <span className="chip" key={t}>
                  {t}
                </span>
              ))}
            </div>

            {(() => {
              const art = itemArt(lib.key, detail.name, detail.media?.image);
              return art ? (
                <span className="tcard" style={{ width: '100%', height: 200, marginTop: 'var(--s3)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={art}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </span>
              ) : null;
            })()}

            {/* the instructions are AUTHORED AS LINES and read as steps */}
            <ol className="catsteps">
              {detail.instructions
                .split('\n')
                .map((l) => l.trim())
                .filter(Boolean)
                .map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
            </ol>

            {detail.dose && Object.keys(detail.dose).length ? (
              <Audit>
                {Object.entries(detail.dose)
                  .map(([k, v]) => `${k} ${String(v)}`)
                  .join(' · ')}
              </Audit>
            ) : null}

            <div className="row" style={{ justifyContent: 'flex-end', gap: 'var(--s2)' }}>
              <button type="button" className="btn ghost" onClick={() => setDetail(null)}>
                Close
              </button>
              {lib.canEdit ? (
                <>
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={archive.isPending}
                    onClick={() =>
                      archive.mutate(
                        { id: detail.id, archived: !detail.archived },
                        {
                          onSuccess: () => {
                            setDetail(null);
                            toast(detail.archived ? 'Back on the shelf.' : 'Archived.');
                          },
                          onError: (e) => toast((e as Error).message),
                        },
                      )
                    }
                  >
                    {detail.archived ? 'Restore' : 'Archive'}
                  </button>
                  <button type="button" className="btn" onClick={() => openEdit(detail)}>
                    <Icon name="pencil" />
                    Edit
                  </button>
                </>
              ) : null}
            </div>
            {lib.canEdit ? (
              <Audit>
                Items are archived, never deleted — a template or a client&rsquo;s live plan may
                already name this one.
              </Audit>
            ) : null}
          </>
        ) : null}
      </Sheet>

      {/* -------------------------------------------------------- the author */}
      <Sheet
        open={adding || !!editing}
        onClose={closeAuthor}
        label={editing ? 'Edit item' : 'Add item'}
      >
        <div className="h1">
          {editing ? 'Edit item' : `Add to ${lib.name}`}
        </div>

        <label className="field-label" htmlFor="ci-name">
          Name
        </label>
        <input
          className="input"
          id="ci-name"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        />

        {hasTrack(lib.key) ? (
          <>
            <label className="field-label" htmlFor="ci-track">
              Category
            </label>
            <select
              className="input"
              id="ci-track"
              value={draft.track}
              onChange={(e) => setDraft((d) => ({ ...d, track: e.target.value }))}
            >
              {data.categories.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.name}
                </option>
              ))}
            </select>
          </>
        ) : null}

        <label className="field-label" htmlFor="ci-tags">
          Tags — comma separated
        </label>
        <input
          className="input"
          id="ci-tags"
          value={draft.tags}
          placeholder={data.tags.map((t) => t.name).slice(0, 3).join(', ')}
          onChange={(e) => setDraft((d) => ({ ...d, tags: e.target.value }))}
        />

        <label className="field-label" htmlFor="ci-instructions">
          Instructions — one step per line
        </label>
        <textarea
          className="input"
          id="ci-instructions"
          rows={6}
          value={draft.instructions}
          onChange={(e) => setDraft((d) => ({ ...d, instructions: e.target.value }))}
        />

        <Notice>
          Tags outside the governed vocabulary are refused — Configuration owns that list.
        </Notice>

        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn ghost" onClick={closeAuthor}>
            Cancel
          </button>
          <button type="button" className="btn" disabled={save.isPending} onClick={submit}>
            {editing ? 'Save' : 'Add item'}
          </button>
        </div>
      </Sheet>

      <Audit>
        <Num>{shown.length}</Num> of <Num>{items.length}</Num> in {lib.name}
      </Audit>
    </>
  );
}
