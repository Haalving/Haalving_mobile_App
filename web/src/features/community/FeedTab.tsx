'use client';

import { useState } from 'react';
import { FEED_LENSES, HOUSE_AUTHOR_ID, HOUSE_AUTHOR_NAME, type FeedLens } from '@haalving/shared';

import { Audit, Avatar, Empty, Notice, Num, Pill, Sheet, SkeletonRows, useToast } from '@/components/ui';
import { Icon } from '@/components/icons/Icon';
import {
  useCommunityMeta,
  useDeletePost,
  useFeed,
  useModeratePost,
  useSavePost,
  useStaff,
  type CommunityPost,
} from './queries';

/**
 * The Common Canvas — every post clients see on the Haalving Zone.
 *
 * Ported from console-community.js:417-603.
 *
 * HIDING IS NOT DELETING. A hidden post comes off the shared canvas but its author
 * still sees it on My Canvas, marked hidden — we do not remove people's words
 * quietly. That is why hide and delete are different controls with different
 * permissions, and why the moderation sheet says so in as many words.
 *
 * MODERATION IS A THIRD CATEGORY beside content and member state: staff action on
 * somebody else's post. It gets its own sheet so the content sheet stays purely
 * about what the post says.
 */

const LENS_LABEL: Record<FeedLens, string> = { all: 'All', pinned: 'Pinned', hidden: 'Hidden' };

function PostRow({
  p,
  canManage,
  canDelete,
  onModerate,
  onEdit,
  onDelete,
}: {
  p: CommunityPost;
  canManage: boolean;
  canDelete: boolean;
  onModerate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="trow">
      {/* THE HOUSE IS NOT A PERSON. Initials drawn for HAALVING would read as
          somebody's monogram; the house gets its mark instead. */}
      {p.by === HOUSE_AUTHOR_ID ? (
        <span className="icon-tile" aria-hidden="true">
          <Icon name="leaf" />
        </span>
      ) : (
        <Avatar name={p.byName} />
      )}
      <div className="grow">
        <b>{p.byName}</b>
        <small>{p.caption}</small>
      </div>
      {p.pinned ? <Pill kind="info">Pinned</Pill> : null}
      {p.hidden ? <Pill kind="warn">Hidden</Pill> : null}
      <Pill kind="neutral">{p.kindLabel}</Pill>
      <Pill kind="neutral">
        <Num>{p.likes}</Num> likes
      </Pill>
      {canManage ? (
        <button type="button" className="btn sm ghost" onClick={onModerate}>
          <Icon name="gauge" />
          Moderate
        </button>
      ) : null}
      {canManage ? (
        <button type="button" className="btn sm ghost" onClick={onEdit}>
          <Icon name="pencil" />
          Edit
        </button>
      ) : null}
      {canDelete ? (
        <button
          type="button"
          className="btn sm ghost"
          style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
          onClick={onDelete}
        >
          <Icon name="x" />
          Delete
        </button>
      ) : null}
    </div>
  );
}

/** A switch row in the moderation sheet. */
function SwitchRow({
  on,
  label,
  sub,
  tone,
  onToggle,
  busy,
}: {
  on: boolean;
  label: string;
  sub: string;
  tone: 'info' | 'warn';
  onToggle: () => void;
  busy: boolean;
}) {
  return (
    <div className="row" style={{ padding: 'var(--s3) 0', borderTop: '1px solid var(--line)' }}>
      <span className="grow">
        {label}
        <small className="sub" style={{ display: 'block' }}>
          {sub}
        </small>
      </span>
      <button
        type="button"
        className={`pill ${on ? tone : 'neutral'}`}
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={busy}
        onClick={onToggle}
      >
        {on ? 'On' : 'Off'}
      </button>
    </div>
  );
}

export function FeedTab() {
  const [lens, setLens] = useState<FeedLens>('all');
  const { data, isLoading } = useFeed(lens);
  const { data: meta } = useCommunityMeta();
  const savePost = useSavePost();
  const moderate = useModeratePost();
  const removePost = useDeletePost();
  const toast = useToast();

  const canManage = !!meta?.canManage;
  const canDelete = !!meta?.canDelete;

  const { data: staff } = useStaff(canManage);

  const [moderating, setModerating] = useState<CommunityPost | null>(null);
  const [editing, setEditing] = useState<CommunityPost | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<CommunityPost | null>(null);
  const [by, setBy] = useState(HOUSE_AUTHOR_ID);
  const [caption, setCaption] = useState('');

  /*
   * NEW POSTS MAY ONLY BE AUTHORED AS THE HOUSE OR A STAFF MEMBER — this console
   * cannot impersonate a client. Editing an older client-authored post keeps that
   * authorship as an extra, already-selected option instead of silently
   * reassigning it to whichever name sorts first.
   */
  const authorOptions = (() => {
    const opts: Array<{ id: string; name: string }> = [
      { id: HOUSE_AUTHOR_ID, name: `${HOUSE_AUTHOR_NAME} (official)` },
      ...(staff ?? []).map((s) => ({ id: s.id, name: s.name })),
    ];
    if (editing && !opts.some((o) => o.id === editing.by)) {
      opts.push({ id: editing.by, name: `${editing.byName} (existing author)` });
    }
    return opts;
  })();

  const openNew = () => {
    setBy(HOUSE_AUTHOR_ID);
    setCaption('');
    setEditing(null);
    setAdding(true);
  };
  const openEdit = (p: CommunityPost) => {
    setBy(p.by);
    setCaption(p.caption);
    setAdding(false);
    setEditing(p);
  };
  const closeSheet = () => {
    setAdding(false);
    setEditing(null);
  };

  const submit = () => {
    const text = caption.trim();
    if (!text) {
      toast('Give the post a caption first.');
      return;
    }
    savePost.mutate(
      { ...(editing ? { id: editing.id } : {}), by, caption: text },
      {
        onSuccess: () => {
          closeSheet();
          toast(editing ? 'Saved' : 'Added');
        },
        onError: (e) => toast((e as Error).message),
      },
    );
  };

  /* the sheet's own copy of the post, so a toggle repaints without closing */
  const current = moderating ? (data?.posts.find((p) => p.id === moderating.id) ?? moderating) : null;

  const open = adding || !!editing;

  return (
    <>
      <p className="sub">
        Every post on the client&rsquo;s Common Canvas. Hiding takes a post off that canvas for
        everyone else; its author still sees it on My Canvas, marked hidden — we do not remove
        people&rsquo;s words quietly.
      </p>

      <div
        className="row"
        style={{ flexWrap: 'wrap', margin: 'var(--s3) 0' }}
        role="group"
        aria-label="Filter posts"
      >
        {FEED_LENSES.map((k) => (
          <button
            type="button"
            key={k}
            className={`chip${lens === k ? ' sel' : ''}`}
            aria-pressed={lens === k}
            onClick={() => setLens(k)}
          >
            {LENS_LABEL[k]} <Num>{data ? data.counts[k] : 0}</Num>
          </button>
        ))}
        <span className="grow" />
        {canManage ? (
          <button type="button" className="btn" onClick={openNew}>
            <Icon name="plus" />
            Add post
          </button>
        ) : null}
      </div>

      {isLoading ? <SkeletonRows rows={5} height={64} /> : null}

      {data && !data.posts.length ? (
        <Empty
          icon="chat"
          sentence="Nothing here. The Common Canvas is what clients see on the Haalving Zone."
        />
      ) : null}

      {data && data.posts.length ? (
        <div className="list">
          {data.posts.map((p) => (
            <PostRow
              key={p.id}
              p={p}
              canManage={canManage}
              canDelete={canDelete}
              onModerate={() => setModerating(p)}
              onEdit={() => openEdit(p)}
              onDelete={() => setDeleting(p)}
            />
          ))}
        </div>
      ) : null}

      {/* --------------------------------------------------------- moderate */}
      <Sheet open={!!current} onClose={() => setModerating(null)} label="Moderate this post">
        <div className="h1">Moderate this post</div>
        {current ? (
          <>
            <div className="card">
              <div className="trow">
                {current.by === HOUSE_AUTHOR_ID ? (
                  <span className="icon-tile" aria-hidden="true">
                    <Icon name="leaf" />
                  </span>
                ) : (
                  <Avatar name={current.byName} />
                )}
                <div className="grow">
                  <b>{current.byName}</b>
                  <small>{current.caption}</small>
                </div>
                <Pill kind="neutral">{current.kindLabel}</Pill>
              </div>
            </div>

            <SwitchRow
              on={current.pinned}
              label="Pinned to the top of the Common Canvas"
              sub="One at a time — pinning this releases whatever is pinned now."
              tone="info"
              busy={moderate.isPending}
              onToggle={() =>
                moderate.mutate(
                  { id: current.id, pinned: !current.pinned },
                  {
                    onSuccess: () =>
                      toast(current.pinned ? 'Unpinned.' : 'Pinned to the top of the canvas.'),
                    onError: (e) => toast((e as Error).message),
                  },
                )
              }
            />
            <SwitchRow
              on={current.hidden}
              label="Hidden from the Common Canvas"
              sub="Off the canvas for everyone else. The author still sees it on My Canvas, marked hidden."
              tone="warn"
              busy={moderate.isPending}
              onToggle={() =>
                moderate.mutate(
                  { id: current.id, hidden: !current.hidden },
                  {
                    onSuccess: () =>
                      toast(current.hidden ? 'Back on the canvas.' : 'Hidden from the Common Canvas.'),
                    onError: (e) => toast((e as Error).message),
                  },
                )
              }
            />

            <Audit>
              Likes and comments are member state and are never changed here. Hiding is reversible
              and is not a delete.
            </Audit>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setModerating(null)}>
                Done
              </button>
            </div>
          </>
        ) : null}
      </Sheet>

      {/* ------------------------------------------------------ add / edit */}
      <Sheet open={open} onClose={closeSheet} label={editing ? 'Edit post' : 'Add post'}>
        <div className="h1">{editing ? 'Edit post' : 'Add post'}</div>
        {!editing ? (
          <p className="sub">
            New posts from this console post as the house account or a staff member — never as a
            client.
          </p>
        ) : null}

        <label className="field-label" htmlFor="tp-by">
          Posted as
        </label>
        <select className="input" id="tp-by" value={by} onChange={(e) => setBy(e.target.value)}>
          {authorOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>

        <label className="field-label" htmlFor="tp-caption">
          Caption
        </label>
        <textarea
          className="input"
          id="tp-caption"
          rows={3}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
        />

        <Audit>
          {!editing
            ? 'New posts are text posts. Likes and comments are member state and are never changed here.'
            : editing.kind !== 'text'
              ? `This post carries a ${editing.kindLabel} — only who posted it and the caption are edited here.`
              : 'Editing changes the caption and author only — media and game content are preserved.'}
        </Audit>

        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn ghost" onClick={closeSheet}>
            Cancel
          </button>
          <button type="button" className="btn" disabled={savePost.isPending} onClick={submit}>
            {editing ? 'Save' : 'Add post'}
          </button>
        </div>
      </Sheet>

      {/* ---------------------------------------------------------- delete */}
      <Sheet open={!!deleting} onClose={() => setDeleting(null)} label="Delete post">
        <div className="h1">Delete this post?</div>
        <Notice kind="bad">
          This removes {deleting?.byName === HOUSE_AUTHOR_NAME ? 'the post' : 'somebody else’s words'}{' '}
          from the canvas permanently, along with its <Num>{deleting?.likes ?? 0}</Num> likes and{' '}
          <Num>{deleting?.comments ?? 0}</Num> comments. Hiding is the reversible option.
        </Notice>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn ghost" onClick={() => setDeleting(null)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            style={{ background: 'var(--danger-fill)' }}
            disabled={removePost.isPending}
            onClick={() =>
              deleting &&
              removePost.mutate(deleting.id, {
                onSuccess: () => {
                  setDeleting(null);
                  toast('Post deleted');
                },
                onError: (e) => toast((e as Error).message),
              })
            }
          >
            Delete post
          </button>
        </div>
      </Sheet>
    </>
  );
}
