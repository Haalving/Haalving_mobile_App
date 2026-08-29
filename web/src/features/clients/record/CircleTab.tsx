'use client';

import { useState } from 'react';

import { Empty, Notice, Pill, useToast } from '@/components/ui';
import { Icon } from '@/components/icons/Icon';
import { useCircle, usePostCircle, type ClientDetail } from '@/features/clients/queries';
import { ago, first } from './ScratchPad';

/**
 * The Circle — the one tab the client reads too.
 *
 * Ported from console-clients.js `bodyFor('circle')` and the composer beneath it.
 *
 * THIS LANE IS CLIENT-VISIBLE AND THE HEADER SAYS SO. Everything here lands in
 * the client's own app; the scratch pad beside it never does. That is why the
 * two are different panels rather than one thread with a toggle — a toggle is a
 * thing you can be wrong about, and being wrong sends an internal note to the
 * person it was about.
 *
 * A ROOM HOLDS MORE THAN TALK. A rating, a published artifact and a logged plate
 * are their own kinds, and each is drawn as a card rather than as a sentence —
 * a reader that had to infer them from the wording would infer wrong the first
 * time somebody typed "logged".
 */

const KIND_LABEL: Record<string, string> = {
  CARD: 'Pinned',
  DOC: 'Published',
  RATING: 'Rating',
  MEAL: 'Meal',
  PROMO: 'Announcement',
  WISH: 'Wishes',
};

export function CircleTab({ c, meId }: { c: ClientDetail; meId: string | null }) {
  const { data, isLoading } = useCircle(c.id, 'client');
  const post = usePostCircle(c.id);
  const toast = useToast();
  const [text, setText] = useState('');

  const send = () => {
    const t = text.trim();
    if (!t) return;
    post.mutate(
      { text: t },
      {
        onSuccess: () => {
          setText('');
          toast(`Sent to ${first(c.name)}.`);
        },
        onError: (e) => toast((e as Error).message),
      },
    );
  };

  return (
    <>
      <div className="ccscroll">
        {/* days 1-5 are for learning, and the thread says so rather than leaving
            a client to wonder why nothing is being scored */}
        {c.observation ? (
          <Notice>
            Observation days 1–5 — no ratings or scores appear in this thread yet.
          </Notice>
        ) : null}

        {isLoading ? <div className="skel" style={{ height: 120 }} /> : null}

        {data && data.length ? (
          <div className="chat">
            {data.map((m) => {
              const mine = !!meId && m.from?.id === meId;
              const fromClient = m.fromKind === 'CLIENT';
              const label = KIND_LABEL[m.kind];
              return (
                <div className={`msg ${mine ? 'me' : 'them'}`} key={m.id}>
                  {!mine ? (
                    <span className="who">
                      {fromClient ? first(c.name) : (m.from?.name ? first(m.from.name) : 'HAALVING')}
                    </span>
                  ) : null}
                  {label ? (
                    <span style={{ display: 'block', marginBottom: 'var(--s1)' }}>
                      <Pill kind={m.kind === 'DOC' ? 'ok' : 'neutral'}>{label}</Pill>
                    </span>
                  ) : null}
                  {m.text}
                  <span className="when">{ago(m.at)}</span>
                </div>
              );
            })}
          </div>
        ) : null}

        {data && !data.length ? (
          <Empty icon="chat" sentence="Nothing in this room yet." />
        ) : null}
      </div>

      <div className="cccomposer">
        <input
          className="input"
          placeholder={`Message ${first(c.name)} — lands in their app`}
          aria-label={`Message ${first(c.name)}`}
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              send();
            }
          }}
        />
        <button
          type="button"
          className="btn sm"
          disabled={!text.trim() || post.isPending}
          onClick={send}
        >
          <Icon name="send" />
          Send
        </button>
      </div>
    </>
  );
}
