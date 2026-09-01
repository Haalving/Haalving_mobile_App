'use client';

import { useState } from 'react';

import { Audit, Empty, IconTile, Notice, Num, Pill, Sheet, SkeletonRows, useToast } from '@/components/ui';
import { Icon } from '@/components/icons/Icon';
import { arrToLines, linesToArr, pairLinesToText, parsePairLines } from './lines';
import {
  useApproveGathering,
  useCommunityMeta,
  useDeleteGathering,
  useGatherings,
  useSaveGathering,
  type Gathering,
} from './queries';

/**
 * Gatherings — the things members enrol in.
 *
 * Ported from console-community.js:133-223.
 *
 * WHO IS ENROLLED IS MEMBER STATE AND IS NEVER CHANGED HERE. `going` is a count
 * this page reads and never writes; there is no control to add or remove a person
 * from a gathering, and that absence is the rule rather than an omission.
 */

interface Draft {
  title: string;
  when: string;
  where: string;
  host: string;
  spots: string;
  desc: string;
  about: string;
  agenda: string;
  bring: string;
}

const EMPTY: Draft = {
  title: '',
  when: '',
  where: '',
  host: '',
  spots: '',
  desc: '',
  about: '',
  agenda: '',
  bring: '',
};

function draftOf(g: Gathering): Draft {
  return {
    title: g.title,
    when: g.when,
    where: g.where,
    host: g.host ?? '',
    spots: g.spots ?? '',
    desc: g.desc,
    about: arrToLines(g.about),
    agenda: pairLinesToText(g.agenda, 't', 'v'),
    bring: arrToLines(g.bring),
  };
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {children}
    </>
  );
}

export function GatheringsTab() {
  const { data, isLoading } = useGatherings();
  const { data: meta } = useCommunityMeta();
  const save = useSaveGathering();
  const remove = useDeleteGathering();
  const toast = useToast();

  const [editing, setEditing] = useState<Gathering | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [deleting, setDeleting] = useState<Gathering | null>(null);

  const canManage = !!meta?.canManage;
  const canApprove = !!meta?.canApprove;
  const canPropose = !!meta?.canPropose;
  const approve = useApproveGathering();
  const canDelete = !!meta?.canDelete;

  const openNew = () => {
    setDraft(EMPTY);
    setEditing(null);
    setAdding(true);
  };
  const openEdit = (g: Gathering) => {
    setDraft(draftOf(g));
    setAdding(false);
    setEditing(g);
  };
  const closeSheet = () => {
    setAdding(false);
    setEditing(null);
  };

  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));

  const submit = () => {
    const title = draft.title.trim();
    if (!title) {
      toast('Give the gathering a title first.');
      return;
    }
    save.mutate(
      {
        ...(editing ? { id: editing.id } : {}),
        body: {
          title,
          when: draft.when.trim(),
          where: draft.where.trim(),
          /* blank means absent, not empty — the demo deletes the key rather than
             storing '' so the client's card does not print an empty host line */
          host: draft.host.trim() || null,
          spots: draft.spots.trim() || null,
          desc: draft.desc.trim(),
          about: linesToArr(draft.about),
          agenda: parsePairLines(draft.agenda, 't', 'v'),
          bring: linesToArr(draft.bring),
        },
      },
      {
        onSuccess: () => {
          closeSheet();
          toast(editing ? `Saved — ${title}` : `Added — ${title}`);
        },
        onError: (e) => toast((e as Error).message),
      },
    );
  };

  const open = adding || !!editing;

  return (
    <>
      {canPropose ? (
        <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 'var(--s2)' }}>
          <button type="button" className="btn" onClick={openNew}>
            <Icon name="plus" />
            Add gathering
          </button>
        </div>
      ) : null}

      {isLoading ? <SkeletonRows rows={3} height={72} /> : null}

      {data && !data.length ? (
        <Empty icon="cal" sentence="No gatherings yet. Add one for members to enrol in." />
      ) : null}

      {data && data.length ? (
        <div className="list">
          {data.map((g) => (
            <div className="trow" key={g.id}>
              <IconTile name="cal" />
              <div className="grow">
                <b>{g.title}</b>
                <small>
                  {g.when}
                  {g.where ? ` · ${g.where}` : ''}
                </small>
              </div>
              {g.going ? (
                <Pill kind="info">
                  <Num>{g.going}</Num> going
                </Pill>
              ) : null}
              {/* STATUS ON EVERY ROW, not just the pending ones. A board that marks the
                   exceptions leaves you guessing whether the unmarked ones are approved or
                   simply older than the feature. */}
              {g.status === 'APPROVED' ? (
                <Pill kind="ok">Approved</Pill>
              ) : (
                <Pill kind={g.returnNote ? 'bad' : 'warn'}>{g.returnNote ? 'Returned' : 'Pending'}</Pill>
              )}
              {/* Approve is offered only where it would actually work: you hold the gate,
                   it is not yours, and it is not already out. The server refuses all three
                   anyway — this only avoids showing a button that answers 409. */}
              {canApprove && g.status === 'PENDING' && !g.mine ? (
                <button
                  type="button"
                  className="btn sm"
                  disabled={approve.isPending}
                  onClick={() => approve.mutate(g.id)}
                >
                  <Icon name="check" />
                  Approve
                </button>
              ) : null}
              {canApprove && g.status === 'PENDING' && g.mine ? (
                <span className="audit">Yours — somebody else approves it.</span>
              ) : null}
              {canManage ? (
                <button type="button" className="btn sm ghost" onClick={() => openEdit(g)}>
                  <Icon name="pencil" />
                  Edit
                </button>
              ) : null}
              {canDelete ? (
                <button
                  type="button"
                  className="btn sm ghost"
                  style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                  onClick={() => setDeleting(g)}
                >
                  <Icon name="x" />
                  Delete
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* ------------------------------------------------------- the sheet */}
      <Sheet open={open} onClose={closeSheet} label={editing ? 'Edit gathering' : 'Add gathering'}>
        <div className="h1">{editing ? 'Edit gathering' : 'Add gathering'}</div>

        <Field id="ev-title" label="Title">
          <input
            className="input"
            id="ev-title"
            value={draft.title}
            placeholder="e.g. Full-moon beach walk"
            onChange={set('title')}
          />
        </Field>
        <Field id="ev-when" label="When">
          <input
            className="input"
            id="ev-when"
            value={draft.when}
            placeholder="e.g. Sat · 7:30 PM"
            onChange={set('when')}
          />
        </Field>
        <Field id="ev-where" label="Where">
          <input
            className="input"
            id="ev-where"
            value={draft.where}
            placeholder="e.g. Kovalam beach"
            onChange={set('where')}
          />
        </Field>
        <Field id="ev-host" label="Host">
          <input
            className="input"
            id="ev-host"
            value={draft.host}
            placeholder="Who is leading this — optional"
            onChange={set('host')}
          />
        </Field>
        <Field id="ev-spots" label="Places">
          <input
            className="input"
            id="ev-spots"
            value={draft.spots}
            placeholder="e.g. 20 places · kept small — optional"
            onChange={set('spots')}
          />
        </Field>
        <Field id="ev-desc" label="Description">
          <textarea className="input" id="ev-desc" rows={3} value={draft.desc} onChange={set('desc')} />
        </Field>
        <Field id="ev-about" label="About — one paragraph per line">
          <textarea
            className="input"
            id="ev-about"
            rows={3}
            value={draft.about}
            placeholder="Optional — the long-read paragraphs"
            onChange={set('about')}
          />
        </Field>
        <Field id="ev-agenda" label={'The day — one stop per line, "time | detail"'}>
          <textarea
            className="input"
            id="ev-agenda"
            rows={3}
            value={draft.agenda}
            placeholder="e.g. 5:30 AM | Assemble at the pickup point"
            onChange={set('agenda')}
          />
        </Field>
        <Field id="ev-bring" label="What to bring — one item per line">
          <textarea
            className="input"
            id="ev-bring"
            rows={2}
            value={draft.bring}
            placeholder="Optional"
            onChange={set('bring')}
          />
        </Field>

        <Audit>Who is enrolled is member state and is never changed here.</Audit>

        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn ghost" onClick={closeSheet}>
            Cancel
          </button>
          <button type="button" className="btn" disabled={save.isPending} onClick={submit}>
            {editing ? 'Save' : 'Add gathering'}
          </button>
        </div>
      </Sheet>

      {/* ------------------------------------------------------ the delete */}
      <Sheet open={!!deleting} onClose={() => setDeleting(null)} label="Delete gathering">
        <div className="h1">Delete “{deleting?.title}”?</div>
        <Notice kind="bad">
          {deleting?.going ? (
            <>
              <Num>{deleting.going}</Num> {deleting.going === 1 ? 'member has' : 'members have'}{' '}
              enrolled. Deleting this removes it from their Community tab. It cannot be undone.
            </>
          ) : (
            <>This removes the gathering from every member&rsquo;s Community tab. It cannot be undone.</>
          )}
        </Notice>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn ghost" onClick={() => setDeleting(null)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            style={{ background: 'var(--danger-fill)' }}
            disabled={remove.isPending}
            onClick={() =>
              deleting &&
              remove.mutate(deleting.id, {
                onSuccess: () => {
                  setDeleting(null);
                  toast('Gathering deleted');
                },
                /* THE FLOOR LIVES ON THE SERVER. A gatherings section cannot be
                   emptied below its floor, and the refusal arrives as a sentence
                   rather than a silent no-op — so it is shown, not swallowed. */
                onError: (e) => toast((e as Error).message),
              })
            }
          >
            Delete gathering
          </button>
        </div>
      </Sheet>
    </>
  );
}
