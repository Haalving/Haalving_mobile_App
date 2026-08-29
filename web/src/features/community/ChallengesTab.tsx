'use client';

import { useState } from 'react';

import { Audit, Empty, IconTile, Notice, Num, Pill, Sheet, SkeletonRows, useToast } from '@/components/ui';
import { Icon } from '@/components/icons/Icon';
import { arrToLines, linesToArr, pairLinesToText, parsePairLines } from './lines';
import {
  useChallenges,
  useCommunityMeta,
  useDeleteChallenge,
  useSaveChallenge,
  type Challenge,
} from './queries';

/**
 * Challenges — the streaks the community joins.
 *
 * Ported from console-community.js:224-311.
 *
 * WHO HAS JOINED IS MEMBER STATE AND IS NEVER CHANGED HERE, the same rule the
 * gatherings tab keeps: `joined` is a count of entries this page reads.
 */

interface Draft {
  title: string;
  days: string;
  host: string;
  stake: string;
  desc: string;
  about: string;
  how: string;
  arc: string;
}

/* eleven days is the cycle, and the demo opens a new challenge on it */
const EMPTY: Draft = {
  title: '',
  days: '11',
  host: '',
  stake: '',
  desc: '',
  about: '',
  how: '',
  arc: '',
};

function draftOf(c: Challenge): Draft {
  return {
    title: c.title,
    days: String(c.days),
    host: c.host ?? '',
    stake: c.stake ?? '',
    desc: c.desc,
    about: arrToLines(c.about),
    how: arrToLines(c.how),
    arc: pairLinesToText(c.arc, 'k', 'v'),
  };
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {children}
    </>
  );
}

export function ChallengesTab() {
  const { data, isLoading } = useChallenges();
  const { data: meta } = useCommunityMeta();
  const save = useSaveChallenge();
  const remove = useDeleteChallenge();
  const toast = useToast();

  const [editing, setEditing] = useState<Challenge | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [deleting, setDeleting] = useState<Challenge | null>(null);

  const canManage = !!meta?.canManage;
  const canDelete = !!meta?.canDelete;

  const openNew = () => {
    setDraft(EMPTY);
    setEditing(null);
    setAdding(true);
  };
  const openEdit = (c: Challenge) => {
    setDraft(draftOf(c));
    setAdding(false);
    setEditing(c);
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
      toast('Give the challenge a title first.');
      return;
    }
    save.mutate(
      {
        ...(editing ? { id: editing.id } : {}),
        body: {
          title,
          /* a challenge of zero days is not one — the demo's own `|| 1` */
          days: Number(draft.days) || 1,
          host: draft.host.trim() || null,
          stake: draft.stake.trim() || null,
          desc: draft.desc.trim(),
          about: linesToArr(draft.about),
          how: linesToArr(draft.how),
          arc: parsePairLines(draft.arc, 'k', 'v'),
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
      {canManage ? (
        <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 'var(--s2)' }}>
          <button type="button" className="btn" onClick={openNew}>
            <Icon name="plus" />
            Add challenge
          </button>
        </div>
      ) : null}

      {isLoading ? <SkeletonRows rows={3} height={72} /> : null}

      {data && !data.length ? (
        <Empty icon="flame" sentence="No challenges yet. Add one for the community to join." />
      ) : null}

      {data && data.length ? (
        <div className="list">
          {data.map((c) => (
            <div className="trow" key={c.id}>
              <IconTile name="flame" />
              <div className="grow">
                <b>{c.title}</b>
                <small>
                  <Num>{c.days}</Num> days
                </small>
              </div>
              {c.joined ? (
                <Pill kind="info">
                  <Num>{c.joined}</Num> joined
                </Pill>
              ) : null}
              {canManage ? (
                <button type="button" className="btn sm ghost" onClick={() => openEdit(c)}>
                  <Icon name="pencil" />
                  Edit
                </button>
              ) : null}
              {canDelete ? (
                <button
                  type="button"
                  className="btn sm ghost"
                  style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                  onClick={() => setDeleting(c)}
                >
                  <Icon name="x" />
                  Delete
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <Sheet open={open} onClose={closeSheet} label={editing ? 'Edit challenge' : 'Add challenge'}>
        <div className="h1">{editing ? 'Edit challenge' : 'Add challenge'}</div>

        <Field id="ch-title" label="Title">
          <input
            className="input"
            id="ch-title"
            value={draft.title}
            placeholder="e.g. Table before eight"
            onChange={set('title')}
          />
        </Field>
        <Field id="ch-days" label="Days">
          <input className="input num" id="ch-days" type="number" min={1} value={draft.days} onChange={set('days')} />
        </Field>
        <Field id="ch-host" label="Host">
          <input
            className="input"
            id="ch-host"
            value={draft.host}
            placeholder="Who set this — optional"
            onChange={set('host')}
          />
        </Field>
        <Field id="ch-stake" label="At stake">
          <input
            className="input"
            id="ch-stake"
            value={draft.stake}
            placeholder="What finishing earns — optional"
            onChange={set('stake')}
          />
        </Field>
        <Field id="ch-desc" label="Description">
          <textarea className="input" id="ch-desc" rows={3} value={draft.desc} onChange={set('desc')} />
        </Field>
        <Field id="ch-about" label="About — one paragraph per line">
          <textarea
            className="input"
            id="ch-about"
            rows={3}
            value={draft.about}
            placeholder="Optional — the long-read paragraphs"
            onChange={set('about')}
          />
        </Field>
        <Field id="ch-how" label="How it works — one line per rule">
          <textarea
            className="input"
            id="ch-how"
            rows={3}
            value={draft.how}
            placeholder="Optional"
            onChange={set('how')}
          />
        </Field>
        <Field id="ch-arc" label={'How the days go — one line per stretch, "days | detail"'}>
          <textarea
            className="input"
            id="ch-arc"
            rows={2}
            value={draft.arc}
            placeholder="e.g. Days 1–3 | Finding the slot"
            onChange={set('arc')}
          />
        </Field>

        <Audit>Who has joined is member state and is never changed here.</Audit>

        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn ghost" onClick={closeSheet}>
            Cancel
          </button>
          <button type="button" className="btn" disabled={save.isPending} onClick={submit}>
            {editing ? 'Save' : 'Add challenge'}
          </button>
        </div>
      </Sheet>

      <Sheet open={!!deleting} onClose={() => setDeleting(null)} label="Delete challenge">
        <div className="h1">Delete “{deleting?.title}”?</div>
        <Notice kind="bad">
          {deleting?.joined ? (
            <>
              <Num>{deleting.joined}</Num> {deleting.joined === 1 ? 'member is' : 'members are'} part
              way through this. Deleting it takes the streak with it and cannot be undone.
            </>
          ) : (
            <>This removes the challenge from every member&rsquo;s Community tab. It cannot be undone.</>
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
                  toast('Challenge deleted');
                },
                onError: (e) => toast((e as Error).message),
              })
            }
          >
            Delete challenge
          </button>
        </div>
      </Sheet>
    </>
  );
}
