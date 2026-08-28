'use client';

import { Empty, Notice, SkeletonRows } from '@/components/ui';
import { AttentionRow } from '@/features/home/attention/AttentionRow';
import { useAttention, useMarkSeen } from '@/features/home/attention/queries';

/**
 * The Attention tab — the first board of the morning digest.
 *
 * One row per client the caller carries, loudest first. The ORDER comes from the
 * server, already sorted High → Watch → unflagged, so the list is rendered as
 * given: a second sort here could disagree with the badge count, which reads the
 * same list.
 */
export function AttentionTab() {
  const { data, isLoading, isError, error, refetch } = useAttention();

  /*
   * Stamp after the rows have rendered, not before.
   *
   * This render still shows its New marks and the next visit does not — the
   * demo's `stampSeen` contract. Passing the ids only once they exist means an
   * error or a still-loading tab never clears a badge it did not show.
   */
  useMarkSeen('attention', data?.map((r) => r.clientId));

  if (isError) {
    return (
      <Notice kind="bad">
        We could not read the digest. {(error as Error).message}
        <div className="retry">
          <button type="button" className="btn sm" onClick={() => void refetch()}>
            Try again
          </button>
        </div>
      </Notice>
    );
  }

  if (isLoading) return <SkeletonRows rows={6} height={104} />;

  /* the demo's own empty state, word for word */
  if (!data || data.length === 0) {
    return <Empty icon="leaf" sentence="No clients allocated to you yet." />;
  }

  return (
    <>
      <p className="sub">
        Attention-ordered — the loudest thing about each client, with the evidence behind it.
      </p>
      <div className="list">
        {data.map((row) => (
          <AttentionRow key={row.id} row={row} />
        ))}
      </div>
    </>
  );
}
