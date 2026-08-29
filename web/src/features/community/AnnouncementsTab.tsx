'use client';

import { useEffect, useState } from 'react';
import {
  BROADCAST_IMAGES,
  LINK_LABEL,
  type AudienceSpec,
  type BroadcastKind,
  type Reach,
} from '@haalving/shared';

import { Audit, Avatar, Empty, IconTile, Notice, Num, Pill, Sheet, SkeletonRows, useToast } from '@/components/ui';
import { Icon } from '@/components/icons/Icon';
import {
  useBroadcasts,
  useCommunityMeta,
  useComposer,
  usePreviewReach,
  useSendBroadcast,
} from './queries';

/**
 * Announcements — the one outbound tab.
 *
 * Ported from console-community.js:743-1060.
 *
 * THE REACH NUMBER COMES FROM THE SERVER, always. The browser does not hold the
 * mute list and could not work it out; more to the point, one function has to feed
 * the confirm bar and the send, or the number the operator agreed to can disagree
 * with what actually went out.
 *
 * A NOTICE AND AN ANNOUNCEMENT DIFFER IN WHO CAN MUTE THEM. An announcement is
 * marketing and clients who switched announcements off do not receive it; an
 * operational notice reaches them anyway. Changing the kind therefore changes the
 * number, which is why the preview re-asks whenever either moves.
 *
 * COUNTS ARE STAMPED AT SEND AND NEVER RECALCULATED — a client changing their
 * setting next week cannot rewrite what was already delivered.
 */

/**
 * The composer's own audience, with all three lists REQUIRED.
 *
 * `AudienceSpec` makes them optional because a wire body may legitimately omit
 * the two lists its mode does not read. The composer is the opposite case: it
 * holds all three alive at once so switching modes and switching back does not
 * lose what was already picked, and a type that admitted `undefined` would put a
 * guard on every toggle for a state this component never enters.
 */
type Audience = Required<AudienceSpec>;

const MODE_LABEL: Record<string, string> = {
  all: 'Everyone',
  plan: 'By plan',
  coach: 'By coach',
  pick: 'Pick people',
};

const EMPTY_AUDIENCE: Audience = { mode: 'all', plans: [], staffIds: [], clientIds: [] };

/**
 * The reach reply, which NAMES THE AUDIENCE as well as counting it.
 *
 * The label is the server's for the same reason the numbers are: "Sneha M.'s
 * clients" has to mean the same thing in the confirm bar, in the sent list and in
 * the audit trail, and a second implementation in the browser is a second thing to
 * keep in step. Plan names in particular are Configuration's to change.
 */
type ReachReply = Reach & { audienceLabel?: string };

function Row({ b }: { b: import('./queries').Broadcast }) {
  return (
    <div className="trow">
      <IconTile name={b.kind === 'notice' ? 'bell' : 'send'} />
      <div className="grow">
        <b>{b.title || b.text}</b>
        <small>
          {b.byName} · {b.audienceLabel}
        </small>
      </div>
      <Pill kind={b.kind === 'notice' ? 'warn' : 'info'}>
        {b.kind === 'notice' ? 'Notice' : 'Announcement'}
      </Pill>
      <Pill kind="ok">
        <Num>{b.sent.delivered}</Num> of <Num>{b.sent.targeted}</Num> reached
      </Pill>
      {b.sent.muted ? (
        <Pill kind="neutral">
          <Num>{b.sent.muted}</Num> muted
        </Pill>
      ) : null}
    </div>
  );
}

export function AnnouncementsTab() {
  const { data: meta } = useCommunityMeta();
  const canAnnounce = !!meta?.canAnnounce;

  const { data: list, isLoading } = useBroadcasts();
  const { data: composer } = useComposer(canAnnounce);
  const preview = usePreviewReach();
  const send = useSendBroadcast();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [kind, setKind] = useState<BroadcastKind>('announcement');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [img, setImg] = useState('');
  const [link, setLink] = useState('');
  const [audience, setAudience] = useState<Audience>(EMPTY_AUDIENCE);
  const [reach, setReach] = useState<ReachReply | null>(null);

  /*
   * Re-ask the server whenever the audience or the kind moves.
   *
   * `mutateAsync` is not used here on purpose: an in-flight preview that is
   * overtaken by a newer one must not be allowed to write its stale answer, and
   * the guard for that is simplest as a captured token.
   */
  const previewMutate = preview.mutate;
  useEffect(() => {
    if (!open || !canAnnounce) return;
    let live = true;
    previewMutate(
      { kind, audience },
      {
        onSuccess: (r) => {
          if (live) setReach(r);
        },
        onError: () => {
          if (live) setReach(null);
        },
      },
    );
    return () => {
      live = false;
    };
  }, [open, canAnnounce, kind, audience, previewMutate]);

  const reset = () => {
    setKind('announcement');
    setTitle('');
    setText('');
    setImg('');
    setLink('');
    setAudience(EMPTY_AUDIENCE);
    setReach(null);
  };

  const toggleIn = (key: 'plans' | 'staffIds' | 'clientIds', id: string) =>
    setAudience((a) => ({
      ...a,
      [key]: a[key].includes(id) ? a[key].filter((x) => x !== id) : [...a[key], id],
    }));

  const doSend = () => {
    send.mutate(
      { kind, title: title.trim(), text: text.trim(), img, link: link || null, audience },
      {
        onSuccess: (b) => {
          setConfirming(false);
          setOpen(false);
          reset();
          toast(
            `Sent to ${b.sent.delivered} ${b.sent.delivered === 1 ? 'client' : 'clients'}` +
              (b.sent.muted ? ` · ${b.sent.muted} muted` : ''),
          );
        },
        onError: (e) => toast((e as Error).message),
      },
    );
  };

  const tryConfirm = () => {
    if (!text.trim()) {
      toast('Write the message first.');
      return;
    }
    if (!reach || !reach.targeted) {
      toast('That audience matches nobody right now.');
      return;
    }
    if (!reach.delivered) {
      toast(
        'Everyone in that audience has announcements off. Mark it an operational notice if it must reach them.',
      );
      return;
    }
    setConfirming(true);
  };

  return (
    <>
      <p className="sub">
        What the team has told clients directly. An announcement lands as a HAALVING card in each
        client&rsquo;s My Circle — it never impersonates a coach.
      </p>

      {canAnnounce ? (
        <div className="row" style={{ justifyContent: 'flex-end', margin: 'var(--s3) 0' }}>
          <button
            type="button"
            className="btn"
            onClick={() => {
              reset();
              setOpen(true);
            }}
          >
            <Icon name="send" />
            New announcement
          </button>
        </div>
      ) : null}

      {isLoading ? <SkeletonRows rows={2} height={72} /> : null}

      {list && !list.length ? (
        <Empty icon="send" sentence="Nothing sent yet. The first announcement will show its reach here." />
      ) : null}

      {list && list.length ? (
        <div className="list">
          {list.map((b) => (
            <Row key={b.id} b={b} />
          ))}
        </div>
      ) : null}

      <Audit>
        {canAnnounce
          ? 'Counts are recorded when an announcement is sent and never recalculated — a client changing their setting later cannot rewrite what was already delivered.'
          : 'Read-only for your role — sending needs the “Announce to clients” permission (Super Admin and Operations Head). You can see everything that was sent.'}
      </Audit>

      {/* ----------------------------------------------------- the composer */}
      <Sheet
        open={open && !confirming}
        onClose={() => setOpen(false)}
        label="New announcement"
      >
        <div className="h1">New announcement</div>

        <div className="sec-title">What kind</div>
        <div className="row" style={{ flexWrap: 'wrap' }} role="group" aria-label="Kind">
          {(['announcement', 'notice'] as const).map((k) => (
            <button
              type="button"
              key={k}
              className={`chip${kind === k ? ' sel' : ''}`}
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
            >
              {k === 'notice' ? 'Operational notice' : 'Announcement'}
            </button>
          ))}
        </div>
        <Audit>
          {kind === 'notice'
            ? 'A service notice is operational — a schedule change, a closure, something about safety. It reaches every client in the audience even if they have announcements switched off.'
            : 'An announcement is marketing — offers, events, news. Clients who have switched announcements off will not receive it.'}
        </Audit>

        <div className="sec-title">What it says</div>
        <label className="field-label" htmlFor="bc-title">
          Headline
        </label>
        <input
          className="input"
          id="bc-title"
          value={title}
          placeholder="Six places left on the trek"
          onChange={(e) => setTitle(e.target.value)}
        />
        <label className="field-label" htmlFor="bc-text">
          Message
        </label>
        <textarea
          className="input"
          id="bc-text"
          rows={4}
          value={text}
          placeholder="Say it the way a person would."
          onChange={(e) => setText(e.target.value)}
        />

        <div className="sec-title">A picture (optional)</div>
        {/* HOUSE IMAGERY ONLY, and only what the service worker precaches — an
            arbitrary src is a broken tile the moment the client is offline. The
            server refuses anything outside this list. */}
        <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--s2)' }}>
          <button
            type="button"
            className={`chip${img === '' ? ' sel' : ''}`}
            aria-pressed={img === ''}
            onClick={() => setImg('')}
          >
            None
          </button>
          {BROADCAST_IMAGES.map((p) => (
            <button
              type="button"
              key={p.src}
              className={`chip${img === p.src ? ' sel' : ''}`}
              aria-pressed={img === p.src}
              onClick={() => setImg(p.src)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="sec-title">A link into Community (optional)</div>
        <select
          className="input"
          aria-label="Link target"
          value={link}
          onChange={(e) => setLink(e.target.value)}
        >
          <option value="">No link</option>
          {(composer?.links ?? []).map((t) => (
            <option key={t.route} value={t.route}>
              {t.label}
            </option>
          ))}
        </select>
        {link ? <Audit>The card will carry a “{LINK_LABEL}” button.</Audit> : null}

        <div className="sec-title">Who gets it</div>
        <div className="row" style={{ flexWrap: 'wrap' }} role="group" aria-label="Audience">
          {(composer?.modes ?? ['all', 'plan', 'coach', 'pick']).map((m) => (
            <button
              type="button"
              key={m}
              className={`chip${audience.mode === m ? ' sel' : ''}`}
              aria-pressed={audience.mode === m}
              /* the other three lists are KEPT, not cleared: switching modes and
                 switching back must not lose what was already picked */
              onClick={() => setAudience((a) => ({ ...a, mode: m as Audience['mode'] }))}
            >
              {MODE_LABEL[m] ?? m}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 'var(--s3)' }}>
          {audience.mode === 'plan' ? (
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {(composer?.plans ?? []).map((p) => (
                <button
                  type="button"
                  key={p.key}
                  className={`chip${audience.plans.includes(p.key) ? ' sel' : ''}`}
                  aria-pressed={audience.plans.includes(p.key)}
                  onClick={() => toggleIn('plans', p.key)}
                >
                  {p.name}
                </button>
              ))}
            </div>
          ) : null}

          {audience.mode === 'coach' ? (
            <div className="list">
              {(composer?.coaches ?? []).map((u) => {
                const on = audience.staffIds.includes(u.id);
                return (
                  <button
                    type="button"
                    key={u.id}
                    className="trow click"
                    aria-pressed={on}
                    onClick={() => toggleIn('staffIds', u.id)}
                  >
                    <Avatar name={u.name} />
                    <span className="grow">
                      <b>{u.name}</b>
                      <small>{u.role}</small>
                    </span>
                    {on ? <Pill kind="ok">On</Pill> : <Pill kind="neutral">Add</Pill>}
                  </button>
                );
              })}
            </div>
          ) : null}

          {audience.mode === 'pick' ? (
            <div className="list">
              {(composer?.clients ?? []).map((c) => {
                const on = audience.clientIds.includes(c.id);
                return (
                  <button
                    type="button"
                    key={c.id}
                    className="trow click"
                    aria-pressed={on}
                    onClick={() => toggleIn('clientIds', c.id)}
                  >
                    <Avatar name={c.name} />
                    <span className="grow">
                      <b>{c.name}</b>
                      <small>{c.plan}</small>
                    </span>
                    {on ? <Pill kind="ok">On</Pill> : <Pill kind="neutral">Add</Pill>}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <Notice>
          {preview.isPending && !reach ? (
            'Counting…'
          ) : reach && reach.targeted ? (
            <>
              <Num>{reach.delivered}</Num> will receive this
              {kind === 'notice'
                ? ' · a service notice overrides the announcements setting'
                : reach.muted
                  ? ' · '
                  : ' · nobody has announcements off'}
              {kind !== 'notice' && reach.muted ? (
                <>
                  <Num>{reach.muted}</Num> have announcements off
                </>
              ) : null}
            </>
          ) : (
            'That audience matches nobody right now.'
          )}
        </Notice>

        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={tryConfirm}>
            Send
          </button>
        </div>
      </Sheet>

      {/* ------------------------------------------------------- confirm --
          Back returns to the composer WITH THE DRAFT INTACT: the state lives in
          this component rather than in the sheet, so there is nothing to rebuild
          and nothing to lose. */}
      <Sheet open={confirming} onClose={() => setConfirming(false)} label="Send this?">
        <div className="h1">Send this?</div>
        <p className="sub">{title || text.slice(0, 80)}</p>
        <div className="grid2">
          <div className="stat">
            <div className="k">Will receive</div>
            <div className="v num">{reach?.delivered ?? 0}</div>
          </div>
          <div className="stat">
            <div className="k">{kind === 'notice' ? 'Overridden opt-outs' : 'Announcements off'}</div>
            <div className="v num">{reach?.muted ?? 0}</div>
          </div>
        </div>
        <Notice>Going to {reach?.audienceLabel ?? 'the chosen audience'}.</Notice>
        <Audit>
          An announcement cannot be unsent or edited once it is in someone&rsquo;s Circle. Send a
          correction instead.
        </Audit>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn ghost" onClick={() => setConfirming(false)}>
            Back
          </button>
          <button type="button" className="btn" disabled={send.isPending} onClick={doSend}>
            Send to <Num>{reach?.delivered ?? 0}</Num>
          </button>
        </div>
      </Sheet>
    </>
  );
}
