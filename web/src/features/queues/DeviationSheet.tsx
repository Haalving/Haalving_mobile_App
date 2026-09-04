'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Notice, Pill, Sheet, useToast } from '@/components/ui';
import { Icon } from '@/components/icons/Icon';
import { usePostCircle } from '@/features/clients/queries';
import type { DeviationRow } from '@/features/queues/queries';

/**
 * ONE DEVIATION, AND THE TWO WAYS TO ANSWER IT.
 *
 * The board names a client and a state — "Ladder step 2, human call today" — and
 * until now offered nothing to do about either. You read the row, then went
 * hunting for the person in another tab, which is how a board that exists to
 * prompt action becomes a board people stop opening.
 *
 * TWO CHANNELS, AND THEY ARE NOT THE SAME CHANNEL. A line in the care circle
 * lands in the client's app and is part of their record for ever; an email leaves
 * the system entirely and is the right reach for somebody who has stopped opening
 * the app, which is exactly what a non-response deviation means. So both are
 * offered and neither is dressed up as the other.
 *
 * THE MAIL IS A `mailto:`, ON PURPOSE. This console has no outbound mail service,
 * and a Send button that quietly did nothing would be worse than no button. It
 * hands the address to whatever the person already uses, with the subject
 * written, and the record of it lives in their sent items rather than here — which
 * the sheet says out loud rather than implying otherwise.
 */
export function DeviationSheet({
  row,
  open,
  onClose,
}: {
  row: DeviationRow | null;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState('');
  /* the hook needs an id at call time; an empty string while the sheet is shut
     is harmless because nothing is sent until there is a row */
  const post = usePostCircle(row?.client.id ?? '');

  if (!row) return null;

  const send = () => {
    const body = text.trim();
    if (!body || post.isPending) return;
    post.mutate(
      { text: body },
      {
        onSuccess: () => {
          setText('');
          toast(`Sent to ${row.client.name}'s circle.`);
          onClose();
        },
        onError: (e) => toast((e as Error).message),
      },
    );
  };

  const mailto = row.client.email
    ? `mailto:${row.client.email}?subject=${encodeURIComponent(
        `HAALVING · ${row.kind}`,
      )}&body=${encodeURIComponent(`Hello ${row.client.name.split(' ')[0]},\n\n`)}`
    : null;

  return (
    <Sheet open={open} onClose={onClose} label="Deviation">
      <div className="h1">{row.client.name}</div>
      <p className="sub">
        {row.kind} · {row.state}
      </p>

      <div className="sec-title">Who to reach</div>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="k">Mode</span>
          <Pill kind="info">{row.mode}</Pill>
        </div>
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 'var(--s2)' }}>
          <span className="k">Email</span>
          <span>{row.client.email ?? '— none on file'}</span>
        </div>
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 'var(--s2)' }}>
          <span className="k">Mobile</span>
          <span>{row.client.phone ?? '— none on file'}</span>
        </div>
      </div>

      <div className="sec-title">Write into their circle</div>
      <textarea
        className="input"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`A line to ${row.client.name.split(' ')[0]} — this lands in their app.`}
        aria-label="Message"
      />

      <div className="row" style={{ gap: 'var(--s2)', marginTop: 'var(--s3)' }}>
        <button type="button" className="btn sm" disabled={!text.trim() || post.isPending} onClick={send}>
          {post.isPending ? 'Sending…' : 'Send to circle'}
        </button>

        {mailto ? (
          <a className="btn sm ghost" href={mailto}>
            <Icon name="send" />
            Email instead
          </a>
        ) : (
          /* saying why the button is missing beats a dead button */
          <span className="sub">No email on file — the circle is the only way in.</span>
        )}

        <button
          type="button"
          className="btn sm ghost"
          onClick={() => {
            onClose();
            router.push(`/clients/${row.client.id}`);
          }}
        >
          Open the record
        </button>
      </div>

      <Notice kind="warn">
        An email leaves HAALVING — it opens in your own mail app and its record
        lives there, not on this client&rsquo;s file. A line in the circle stays on
        the record.
      </Notice>
    </Sheet>
  );
}
