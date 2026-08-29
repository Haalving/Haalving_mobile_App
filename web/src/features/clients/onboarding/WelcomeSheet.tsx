'use client';

import { useState } from 'react';

import { AiDraft, Sheet, useToast } from '@/components/ui';
import { useSession } from '@/store/session.store';
import { useSendWelcome, type Arrival } from '@/features/clients/onboarding/queries';

/**
 * The Circle welcome — ported from `welcomeSheet` (console-pipeline.js:929-966).
 *
 * NOTHING SENDS WITHOUT A HUMAN READING IT. The draft arrives inside the AI-draft
 * frame, the reviewer may edit it in place, and the button carries the reviewer's
 * own name — because the message is signed by them, not by the machine that wrote
 * the first version of it.
 *
 * WHERE THE PORT DIFFERS, and it has to: the demo says the welcome went to the
 * client group. An arrival has no Care Circle, because it has no client record for
 * a message to point at — so what the server does is hold the approved text and
 * post it at promotion, which is the first moment there is a room for it. The copy
 * here says that rather than claiming a delivery that has not happened.
 */

/** The demo's own draft, with the arrival's first name in it. */
const draftFor = (name: string) =>
  `Welcome to HAALVING, ${name.split(' ')[0]}. Meet your four coaches — Nutrition, Fitness, Yoga ` +
  'and Mind Wellness — with your Haalving Coach coordinating and your doctor above them all. ' +
  'First up: five quiet observation days. We learn your life before we change it. Your Dos & ' +
  'Don’ts are pinned at the top of the Circle.';

export function WelcomeSheet({ a, onClose }: { a: Arrival; onClose: () => void }) {
  const me = useSession((s) => s.user);
  const send = useSendWelcome();
  const toast = useToast();

  const [text, setText] = useState(a.welcomeText ?? draftFor(a.name));
  const [editing, setEditing] = useState(false);

  const go = () =>
    send.mutate(
      { id: a.id, text: text.trim() },
      {
        onSuccess: () => {
          onClose();
          toast('Welcome approved. It posts to the Care Circle the moment they are moved across.');
        },
        onError: (e) => toast((e as Error).message),
      },
    );

  return (
    <Sheet open onClose={onClose} label={`Circle welcome for ${a.name}`}>
      <div className="h1">Circle welcome — {a.name}</div>
      <p className="sub">Nothing sends without your review. Approving ticks this task.</p>

      <AiDraft
        actions={
          <>
            <button type="button" className="btn sm" disabled={send.isPending} onClick={go}>
              Send as {me?.name.split(' ')[0] ?? 'me'}
            </button>
            <button type="button" className="btn sm ghost" onClick={() => setEditing(true)}>
              Edit
            </button>
            <button type="button" className="btn sm quiet" onClick={onClose}>
              Dismiss
            </button>
          </>
        }
      >
        {editing ? (
          <textarea
            className="input"
            value={text}
            aria-label="The welcome message"
            onChange={(e) => setText(e.target.value)}
          />
        ) : (
          <p style={{ margin: 'var(--s1) 0' }}>{text}</p>
        )}
      </AiDraft>

      <p className="audit" style={{ marginTop: 'var(--s3)' }}>
        Held on the record until promotion — an arrival has no Care Circle to post into yet.
      </p>
    </Sheet>
  );
}
