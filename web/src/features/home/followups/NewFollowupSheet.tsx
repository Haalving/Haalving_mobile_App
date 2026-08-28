'use client';

import { useEffect, useMemo, useState } from 'react';

import { Avatar, Empty, Notice, Num, Sheet, SkeletonRows, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useCan } from '@/lib/can';
import { useClients } from '@/features/clients/queries';
import { useCreateFollowup } from '@/features/home/followups/queries';

/**
 * The coach's own follow-up — the one line on the Follow-ups board the copilot
 * did not write.
 *
 * The tab's sentence is "The copilot drafts; a named human sends"
 * (console-digest.js:637-643). This sheet is the other half of it: a human may
 * DRAFT too, and the rule about who may SEND does not soften because the words
 * came from a person. So a coach writes and hands it up — `Sent for approval.`
 * — and only a caller holding `sendDigest` also gets `Send now`, which is the
 * same right the board's `Approve & send` spends.
 *
 * The two footers therefore differ by exactly one button, and by nothing else.
 */

/**
 * The courtesy ceiling.
 *
 * THE SERVER OWNS THE REAL LIMIT and re-checks it on every POST — a browser is
 * a client and a client can be edited, so this number stops a run-on message
 * being TYPED, it does not stop one being sent. If the two ever disagree the
 * API wins and this constant is the thing that needs correcting.
 */
const MAX_CHARS = 600;

export function NewFollowupSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const canSend = useCan('sendDigest');
  const create = useCreateFollowup();

  const [q, setQ] = useState('');
  const [clientId, setClientId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  /*
   * ONE scoped read, filtered in memory.
   *
   * `/clients` already answers with the people this caller may write to and
   * nobody else, so the search here is presentation and not access — there is
   * no wider list a query string could reach. Reading it unfiltered also shares
   * the Clients page's own cache entry (`['clients', {}]`), so opening this
   * sheet after visiting that page costs nothing, where passing `q` through
   * would mint a fresh entry and a fresh request on every keystroke.
   */
  const { data: clients, isLoading } = useClients();
  const roster = useMemo(() => clients ?? [], [clients]);

  /*
   * Reset on REOPEN, not on close.
   *
   * Clearing inside `onClose` would blank the fields while the sheet is still
   * on screen; keying the reset to `open` leaves the closing frame intact and
   * still guarantees the next visit starts empty — which matters most on the
   * path that just succeeded, where the old text has already gone.
   */
  useEffect(() => {
    if (!open) return;
    setQ('');
    setClientId(null);
    setText('');
    setError(null);
  }, [open]);

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return roster;
    return roster.filter((c) => c.name.toLowerCase().includes(needle));
  }, [roster, q]);

  const chosen = roster.find((c) => c.id === clientId) ?? null;
  const body = text.trim();
  /* `isPending` joins the two conditions the brief names: a second click during
     the round trip would post a second follow-up, and the client would read the
     same nudge twice */
  const ready = !!chosen && body.length > 0 && !create.isPending;

  const submit = (sendNow: boolean) => {
    if (!chosen || !body) return;
    setError(null);
    create.mutate(
      { clientId: chosen.id, text: body, ...(sendNow ? { sendNow: true } : {}) },
      {
        onSuccess: () => {
          toast(sendNow ? `${chosen.name}: follow-up sent.` : 'Sent for approval.');
          onClose();
        },
        /* a NOTICE, not a toast: the message the coach just wrote is still in
           the field, and a failure they have 2600ms to read is a failure they
           will miss and then retype */
        onError: (err: Error) =>
          setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.'),
      },
    );
  };

  return (
    <Sheet open={open} onClose={onClose} label="New follow-up">
      <div className="h1">New follow-up</div>
      <p className="sub" style={{ margin: 0 }}>
        Your own words, not the copilot&rsquo;s. It lands in that client&rsquo;s Care Circle under
        your name{canSend ? '' : ', once a named sender has approved it'}.
      </p>

      {error ? <Notice kind="bad">{error}</Notice> : null}

      <div className="sec-title">Who is this for</div>

      <input
        className="input"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search clients"
        aria-label="Search clients"
        autoComplete="off"
      />

      {isLoading ? <SkeletonRows rows={3} height={64} /> : null}

      {!isLoading && roster.length === 0 ? (
        <Empty icon="leaf" sentence="No clients allocated to you yet." />
      ) : null}

      {!isLoading && roster.length > 0 && matches.length === 0 ? (
        /* the demo's own words for a search that found nobody
           (console-clients.js:786) */
        <p className="sub">Nobody matches that search.</p>
      ) : null}

      <div className="list">
        {matches.map((c) => {
          const on = c.id === clientId;
          return (
            <button
              key={c.id}
              type="button"
              /*
                `cwrow` UNCONDITIONALLY, `on` only when chosen.

                `.cwrow` is align-items:flex-start and `.cwrow.on` is the brand
                wash (demo-classes.css:771-772). Hanging both on the selection
                would re-align the row the moment it was picked, so the row
                keeps its alignment and only its ground changes.

                NO `flex: 1` on the `.grow` below: `.grow` is scoped to `.row`
                and NOT to `.trow` (demo-classes.css:271), which is the whole
                point of the note in AttentionRow. The demo's own client rail
                ships this row with no such rule (console-clients.js:766) and
                sizes the middle to its content.
              */
              className={`trow click cwrow${on ? ' on' : ''}`}
              aria-current={on ? 'true' : undefined}
              onClick={() => setClientId(c.id)}
            >
              <Avatar name={c.name} className="sm" />
              <span className="grow">
                <b>{c.name}</b>
                {/* the rail's own second line (console-clients.js:763-765) */}
                <small>
                  {c.observation ? (
                    <>
                      Observation · Day <Num>{c.cycleDay}</Num>
                    </>
                  ) : (
                    <>
                      Cycle <Num>{c.cycle}</Num> · Day <Num>{c.cycleDay}</Num>
                    </>
                  )}
                </small>
              </span>
            </button>
          );
        })}
      </div>

      <div className="sec-title">The message</div>

      {/* who it is addressed to, said in words rather than left to the ground
          colour of a row a later search can filter out of sight — the demo's
          own line, one verb along (console-digest.js:611) */}
      {chosen ? (
        <div className="sub" style={{ marginBottom: 'var(--s2)' }}>
          To <b>{chosen.name}</b> — write, then send:
        </div>
      ) : null}

      <textarea
        className="input"
        value={text}
        /* `maxLength` stops typing and pasting past the ceiling; the slice is
           belt and braces for a value that ever arrives some other way, so the
           counter below can never read higher than the number beside it */
        maxLength={MAX_CHARS}
        onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
        rows={5}
        placeholder={
          chosen ? `What do you want ${chosen.name} to read?` : 'Pick a client first, then write.'
        }
        aria-label="Your message"
      />

      <p className="sub" style={{ margin: 0 }}>
        <Num>{text.length}</Num> of <Num>{MAX_CHARS}</Num> characters.
      </p>

      {/*
        The demo's sheet footer, verbatim: a `.row` pushed to the trailing edge
        (console-digest.js:663 and :719).

        BOTH submits wear `btn sm`, and that is deliberate. Which of them is the
        real action depends on who is looking — approval is the coach's habit,
        sending is the sender's — so demoting either would misdescribe one of
        the two people this footer serves. Only Cancel steps back.
      */}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn sm ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn sm" disabled={!ready} onClick={() => submit(false)}>
          Send for approval
        </button>
        {canSend ? (
          <button type="button" className="btn sm" disabled={!ready} onClick={() => submit(true)}>
            Send now
          </button>
        ) : null}
      </div>
    </Sheet>
  );
}
