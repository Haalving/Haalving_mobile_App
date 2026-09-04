'use client';

import { useState } from 'react';

import { Empty, Num, useToast } from '@/components/ui';
import { Icon } from '@/components/icons/Icon';
import { useCircle, usePostCircle, type ClientDetail } from '@/features/clients/queries';

/**
 * The scratch pad — the third panel of the client workspace.
 *
 * Ported from console-clients.js `padHtml` / `teamHtml`.
 *
 * THE CLIENT NEVER SEES ANY OF THIS. The whole Team tab is the amber zone —
 * ONE banner across the top rather than a label on every note, because a warning
 * repeated on each line stops being read by the third one. The lane is enforced
 * on the server: this panel asks for `?lane=team`, and the client's own app has
 * no route that returns those rows at all.
 *
 * THE AI IS EXCLUDED FROM THIS LANE. The demo's own filter drops a copilot line
 * here: the pad is where people think aloud to each other, and a machine's note
 * among them reads as a colleague's when it is not one. The server does the
 * dropping, so no rendering mistake can put one back.
 */

const first = (name: string) => name.split(' ')[0] ?? name;

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

function TeamLane({ c, meId }: { c: ClientDetail; meId: string | null }) {
  const { data, isLoading } = useCircle(c.id, 'team');

  return (
    <>
      <div className="padband">
        <Icon name="lock" />
        <span>Team only — {first(c.name)} never sees this panel</span>
      </div>

      {isLoading ? <div className="skel" style={{ height: 80 }} /> : null}

      {data && data.length ? (
        <div className="chat">
          {data.map((m) => {
            const mine = !!meId && m.from?.id === meId;
            return (
              <div className={`msg ${mine ? 'me' : 'them'}`} key={m.id}>
                {!mine && m.from ? <span className="who">{first(m.from.name)}</span> : null}
                {m.text}
                <span className="when">{ago(m.at)}</span>
              </div>
            );
          })}
        </div>
      ) : null}

      {data && !data.length ? (
        <Empty icon="chat" sentence="No internal notes yet — think aloud here." />
      ) : null}
    </>
  );
}

/**
 * The Assistant and Automations tabs are declared but not built.
 *
 * They are in the pad because the demo's pad has three tabs and a two-tab pad
 * would be a different component pretending to be this one. What each needs is
 * named rather than mocked: a suggestion queue with accept/reject/post, and the
 * per-client view of the automation flows Configuration owns. A canned list
 * would look finished and teach somebody to expect behaviour that is not there.
 */
function NotBuilt({ what, needs }: { what: string; needs: string }) {
  return (
    <>
      <div className="padsec-t">{what}</div>
      <Empty icon="sparkle" sentence={needs} />
    </>
  );
}

export function ScratchPad({
  c,
  meId,
  onClose,
}: {
  c: ClientDetail;
  meId: string | null;
  /** present when the panel can be dismissed — it draws its own close then */
  onClose?: () => void;
}) {
  const [tab, setTab] = useState<'team' | 'assist' | 'auto'>('team');
  const [text, setText] = useState('');
  const post = usePostCircle(c.id);
  const toast = useToast();

  const send = () => {
    const t = text.trim();
    if (!t) return;
    post.mutate(
      { text: t, teamOnly: true },
      {
        onSuccess: () => {
          setText('');
          toast('Noted for the team.');
        },
        onError: (e) => toast((e as Error).message),
      },
    );
  };

  return (
    <aside className="ccpad" aria-label="Scratch pad">
      <div className="padtabs">
        <button type="button" className={tab === 'team' ? 'on' : ''} onClick={() => setTab('team')}>
          Teams
        </button>
        <button type="button" className={tab === 'assist' ? 'on' : ''} onClick={() => setTab('assist')}>
          Assistant
          <span className="aimark" aria-hidden="true">
            <Icon name="sparkle" />
          </span>
        </button>
        <button type="button" className={tab === 'auto' ? 'on' : ''} onClick={() => setTab('auto')}>
          Automations
        </button>
        {/* the panel's own way out — closing from the tab strip on the far side
            of the record means crossing the whole page to dismiss the thing you
            are looking at */}
        {onClose ? (
          <button type="button" className="padclose" onClick={onClose} aria-label="Close the team panel" title="Close">
            <Icon name="x" />
          </button>
        ) : null}
      </div>

      <div className="padbody">
        {tab === 'team' ? <TeamLane c={c} meId={meId} /> : null}
        {tab === 'assist' ? (
          <NotBuilt
            what="Assistant"
            needs="The suggestion queue is not built yet — accept, reject and post-as-you still need a server to hold a suggestion's state."
          />
        ) : null}
        {tab === 'auto' ? (
          <NotBuilt
            what="Automations"
            needs="This client's automation flows are not surfaced here yet — Configuration owns the templates and the per-client view still has to read them."
          />
        ) : null}
      </div>

      {tab === 'team' ? (
        <div className="padfoot">
          <input
            className="input"
            placeholder="Note to the team…"
            aria-label="Team-only note"
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
            className="btn sm quiet"
            disabled={!text.trim() || post.isPending}
            onClick={send}
          >
            <Icon name="lock" />
            Post
          </button>
        </div>
      ) : null}
    </aside>
  );
}

/** Exported for the Circle tab, which prints the same relative time. */
export { ago, first };

/** Kept so the unread badge can count without a second fetch shape. */
export function UnreadCount({ n }: { n: number }) {
  return (
    <span className="pill info">
      <Num>{n}</Num>
    </span>
  );
}
