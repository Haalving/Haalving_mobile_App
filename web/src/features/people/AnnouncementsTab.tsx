'use client';

import { useEffect, useState } from 'react';
import { FEED_TAGS, FEED_TAG_LABEL, feedTagTone, type FeedTag } from '@haalving/shared';

import { Avatar, Empty, Pill, SkeletonRows, useToast } from '@/components/ui';
import { useCan } from '@/lib/can';
import { useFeed, useMarkFeedSeen, usePostToFeed } from '@/features/people/queries';

/**
 * Announcements — the staff feed.
 *
 * Ported from `feedHtml` / `wireFeed` (console-people.js:732-823).
 *
 * READING STAMPS THE MARK AFTER RENDER, not before: this render still shows its
 * New pills and the NEXT visit does not. The same contract the Home digest keeps,
 * and for the same reason — a badge that cleared before you had read what it was
 * counting would be lying about what you had seen.
 *
 * Posting needs `broadcast`; everybody with the page reads it. This is the STAFF
 * feed — announcements to clients are a different permission reaching a different
 * surface, and deliberately not this.
 */
export function AnnouncementsTab() {
  const { data, isLoading } = useFeed();
  const post = usePostToFeed();
  const seen = useMarkFeedSeen();
  const canPost = useCan('broadcast');
  const toast = useToast();

  const [text, setText] = useState('');
  const [tag, setTag] = useState<FeedTag>('general');

  /* stamped once the items are on screen — the effect runs after paint */
  const ids = data?.items.map((i) => i.id).join('|');
  useEffect(() => {
    if (!ids) return;
    seen.mutate(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  if (isLoading) return <SkeletonRows rows={3} height={110} />;

  return (
    <>
      {canPost ? (
        <div className="card">
          <span className="k">Post to the team</span>
          <textarea
            className="input"
            style={{ marginTop: 'var(--s2)' }}
            placeholder="Everyone with console access will see this."
            aria-label="Announcement"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="row" style={{ gap: 'var(--s2)', marginTop: 'var(--s2)' }}>
            <select
              className="input"
              value={tag}
              aria-label="Tag"
              onChange={(e) => setTag(e.target.value as FeedTag)}
            >
              {FEED_TAGS.map((t) => (
                <option key={t} value={t}>
                  {FEED_TAG_LABEL[t]}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn sm"
              disabled={!text.trim() || post.isPending}
              onClick={() =>
                post.mutate(
                  { text: text.trim(), tag },
                  {
                    onSuccess: () => {
                      setText('');
                      toast('Posted to the team.');
                    },
                    onError: (e) => toast((e as Error).message),
                  },
                )
              }
            >
              Post
            </button>
          </div>
        </div>
      ) : null}

      {!data?.items.length ? (
        <div className="card" style={{ marginTop: 'var(--s3)' }}>
          <Empty icon="bell" sentence="Nothing has been announced yet." />
        </div>
      ) : (
        data.items.map((p) => (
          <div className="card" style={{ marginTop: 'var(--s3)' }} key={p.id}>
            <div className="row" style={{ gap: 'var(--s3)', alignItems: 'flex-start' }}>
              <Avatar name={p.by?.name ?? '—'} />
              <span className="grow" style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ gap: 'var(--s2)', alignItems: 'baseline' }}>
                  <b>{p.by?.name ?? 'Somebody'}</b>
                  {p.fresh ? <Pill kind="info">New</Pill> : null}
                  <Pill kind={feedTagTone(p.tag)}>{FEED_TAG_LABEL[p.tag as FeedTag] ?? p.tag}</Pill>
                </div>
                <small style={{ display: 'block' }}>
                  {p.by?.roleTitle ?? ''} · {p.ago}
                </small>
                <p className="sub" style={{ marginTop: 'var(--s2)' }}>
                  {p.text}
                </p>
              </span>
            </div>
          </div>
        ))
      )}
    </>
  );
}
