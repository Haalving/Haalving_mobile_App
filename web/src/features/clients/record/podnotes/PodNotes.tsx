'use client';

import { useState } from 'react';
import { ago } from '@haalving/shared';

import { Empty, Notice, SecTitle, SkeletonRows, useToast } from '@/components/ui';
import {
  POD_NOTE_MAX,
  useAddPodNote,
  useDeletePodNote,
  useEditPodNote,
  usePodNotes,
  type PodNote,
} from '@/features/clients/record/podnotes/queries';
import { useCan } from '@/lib/can';
import { useSession } from '@/store/session.store';

/**
 * POD NOTES — the pod's private lane about one client, on their Overview.
 *
 * THE HANDOVER SENTENCE, and the one object on this record the client must never
 * see. It is deliberately none of the three things it sits beside: a Circle
 * message is written TO the client, a Client Log records what HAPPENED, and an
 * Attention ticket is work somebody OWES. A pod note is what one specialist
 * tells the next — "she cried when we got to the sleep questions, go gently".
 *
 * THE BANNER IS NOT THE GUARANTEE. It tells a coach what they are typing into;
 * the confidentiality itself is `podnote.service.ts` refusing the `client` role
 * outright, ahead of scoping, and no client-facing route returning these rows.
 * A panel that only LOOKED private would be the exact failure this build set out
 * to avoid.
 *
 * WHO MAY CHANGE A NOTE IS A FACT ABOUT THE NOTE — its author, or a seat holding
 * `managePeople`. Drawing Edit and Delete on somebody else's note would offer a
 * coach two buttons the API answers 403 to, and the server records that refusal.
 */

/** The composer and the editor are the same control, so it is written once. */
function Composer({
  value,
  onChange,
  onSubmit,
  onCancel,
  busy,
  submitLabel,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  busy: boolean;
  submitLabel: string;
  placeholder: string;
}) {
  const trimmed = value.trim();
  const over = value.length > POD_NOTE_MAX;
  /* the API's floor and ceiling, restated so the button goes live and dead at
     exactly the moments the server would accept and refuse */
  const ready = trimmed.length > 0 && !over && !busy;

  return (
    <>
      <textarea
        className="input"
        rows={3}
        value={value}
        maxLength={POD_NOTE_MAX + 200}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="row" style={{ gap: 'var(--s2)', marginTop: 'var(--s2)' }}>
        <button type="button" className="btn sm" disabled={!ready} onClick={onSubmit}>
          {busy ? 'Saving…' : submitLabel}
        </button>
        {onCancel ? (
          <button type="button" className="btn sm ghost" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        {/* only once it matters — a counter on an empty box is noise */}
        {value.length > POD_NOTE_MAX - 400 ? (
          <small style={over ? { color: 'var(--danger)' } : undefined}>
            {value.length} / {POD_NOTE_MAX}
          </small>
        ) : null}
      </div>
    </>
  );
}

function NoteRow({
  n,
  clientId,
  mayChange,
}: {
  n: PodNote;
  clientId: string;
  mayChange: boolean;
}) {
  const toast = useToast();
  const edit = useEditPodNote(clientId);
  const del = useDeletePodNote(clientId);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(n.content);
  const [confirming, setConfirming] = useState(false);

  const busy = edit.isPending || del.isPending;

  const save = () => {
    edit.mutate(
      { id: n.id, content: draft.trim() },
      {
        onSuccess: () => {
          setEditing(false);
          toast('Note updated.');
        },
        onError: (e) => toast((e as Error).message),
      },
    );
  };

  return (
    <div className="trow">
      <span className="grow" style={{ flex: 1, minWidth: 0 }}>
        <span className="row" style={{ gap: 'var(--s2)' }}>
          {/* the note outlives the seat: a writer who has left is still named as
              gone rather than silently blanked */}
          <b>{n.author ? n.author.name : 'A former colleague'}</b>
          {n.author ? <small>{n.author.role}</small> : null}
        </span>

        {editing ? (
          <div style={{ marginTop: 'var(--s2)' }}>
            <Composer
              value={draft}
              onChange={setDraft}
              onSubmit={save}
              onCancel={() => {
                setDraft(n.content);
                setEditing(false);
              }}
              busy={busy}
              submitLabel="Save"
              placeholder="What should the next specialist know?"
            />
          </div>
        ) : (
          /* the note's own line breaks are the note — a handover written as three
             short lines is not the same sentence run together */
          <small style={{ whiteSpace: 'pre-wrap' }}>{n.content}</small>
        )}

        <small>
          {ago(n.createdAt)}
          {/* `editedAt` is stamped only by a human edit, so this says what it means */}
          {n.editedAt ? ` · edited ${ago(n.editedAt)}` : ''}
        </small>

        {mayChange && !editing ? (
          <span className="row" style={{ gap: 'var(--s2)', marginTop: 'var(--s2)' }}>
            <button
              type="button"
              className="btn sm quiet"
              disabled={busy}
              onClick={() => {
                setDraft(n.content);
                setEditing(true);
              }}
            >
              Edit
            </button>

            {/*
              THE DELETE ASKS, IN PLACE, AND SAYS WHAT IT ACTUALLY DOES.
              It is a soft delete: the panel stops showing the note and the record
              keeps it. Saying "permanently" would be a lie, and saying nothing
              would let a coach think it were one.
            */}
            {confirming ? (
              <>
                <small>Remove from the panel?</small>
                <button
                  type="button"
                  className="btn sm"
                  disabled={busy}
                  onClick={() =>
                    del.mutate(n.id, {
                      onSuccess: () => toast('Removed from the panel — the record keeps it.'),
                      onError: (e) => {
                        setConfirming(false);
                        toast((e as Error).message);
                      },
                    })
                  }
                >
                  Remove
                </button>
                <button
                  type="button"
                  className="btn sm ghost"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                >
                  Keep
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn sm ghost"
                disabled={busy}
                onClick={() => setConfirming(true)}
              >
                Remove
              </button>
            )}
          </span>
        ) : null}
      </span>
    </div>
  );
}

export function PodNotes({ clientId }: { clientId: string }) {
  const toast = useToast();
  const meId = useSession((s) => s.user?.id ?? null);
  /* the seat that may change a colleague's note — the service's second branch */
  const managePeople = useCan('managePeople');

  const { data, isLoading, isError, error, refetch } = usePodNotes(clientId);
  const add = useAddPodNote(clientId);

  const [draft, setDraft] = useState('');

  const post = () => {
    add.mutate(draft.trim(), {
      onSuccess: () => {
        setDraft('');
        toast('Note added for the pod.');
      },
      onError: (e) => toast((e as Error).message),
    });
  };

  return (
    <div className="card">
      <SecTitle>Pod notes</SecTitle>

      {/*
        SAID BEFORE THE BOX, NOT AFTER IT. A coach decides what to type from what
        they believe the note is for, so the sentence that settles it has to be
        above the cursor.
      */}
      <Notice>
        Private to the pod. The client never sees these, and they are not part of the Care Circle
        — write what the next specialist needs to know.
      </Notice>

      {isError ? (
        <Notice kind="bad">
          We could not read the pod notes. {(error as Error).message}
          <div className="retry">
            <button type="button" className="btn sm" onClick={() => void refetch()}>
              Try again
            </button>
          </div>
        </Notice>
      ) : null}

      {isLoading ? <SkeletonRows rows={2} height={72} /> : null}

      {!isLoading && !isError && (data?.length ?? 0) === 0 ? (
        <Empty icon="pencil" sentence="Nothing from the pod yet." sub="The first note is yours." />
      ) : null}

      {data && data.length > 0 ? (
        <div className="list">
          {data.map((n) => (
            <NoteRow
              key={n.id}
              n={n}
              clientId={clientId}
              /* the row's own rule, not the reader's: author, or `managePeople` */
              mayChange={managePeople || (!!meId && n.author?.id === meId)}
            />
          ))}
        </div>
      ) : null}

      <div style={{ marginTop: 'var(--s3)' }}>
        <Composer
          value={draft}
          onChange={setDraft}
          onSubmit={post}
          busy={add.isPending}
          submitLabel="Add note"
          placeholder="What should the next specialist know before they open this record?"
        />
      </div>
    </div>
  );
}
