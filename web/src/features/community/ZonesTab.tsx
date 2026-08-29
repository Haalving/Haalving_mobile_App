'use client';

import { useState } from 'react';

import { Audit, Avatar, Empty, Notice, Num, Pill, Sheet, SkeletonRows, useToast } from '@/components/ui';
import { Icon } from '@/components/icons/Icon';
import {
  useCircle,
  useCommunityMeta,
  useDeleteZone,
  useSaveZone,
  useZones,
  type Zone,
} from './queries';

/**
 * Zones — the private spaces members keep on the Haalving Zone.
 *
 * Ported from console-community.js:604-742.
 *
 * THIS PAGE MANAGES THE SPACE, NOT THE CONVERSATION. There is no way to read a
 * zone's posts from here and no way to remove one, and that absence is the rule:
 * what is said inside a zone belongs to the people in it. The console may create a
 * zone, rename it, change who is in it, and delete it — and deleting is the one
 * act that destroys other people's writing, which is why it gets its own
 * confirmation carrying the post count rather than the shared one.
 *
 * A CONSOLE-MADE ZONE IS CREATED BY THE HOUSE ACCOUNT, never by the acting admin.
 * The server decides that; there is deliberately no author field in the sheet.
 */

/** Up to three member faces, the way the demo draws them. */
function Facepile({ z }: { z: Zone }) {
  return (
    <span className="row" style={{ gap: 2 }}>
      {z.members.slice(0, 3).map((m) => (
        <Avatar key={m.clientId} name={m.name} />
      ))}
    </span>
  );
}

export function ZonesTab() {
  const { data, isLoading } = useZones();
  const { data: meta } = useCommunityMeta();
  const { data: circle } = useCircle();
  const save = useSaveZone();
  const remove = useDeleteZone();
  const toast = useToast();

  const canManage = !!meta?.canManage;
  const canDelete = !!meta?.canDelete;

  const [editing, setEditing] = useState<Zone | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const [deleting, setDeleting] = useState<Zone | null>(null);

  const openNew = () => {
    setName('');
    setMembers([]);
    setEditing(null);
    setAdding(true);
  };
  const openEdit = (z: Zone) => {
    setName(z.name);
    setMembers(z.members.map((m) => m.clientId));
    setAdding(false);
    setEditing(z);
  };
  const closeSheet = () => {
    setAdding(false);
    setEditing(null);
  };

  const toggle = (id: string) =>
    setMembers((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const submit = () => {
    const n = name.trim();
    if (!n) {
      toast('Give the zone a name first.');
      return;
    }
    if (!members.length) {
      toast('A zone needs at least one member.');
      return;
    }
    save.mutate(
      { ...(editing ? { id: editing.id } : {}), name: n, memberIds: members },
      {
        onSuccess: () => {
          closeSheet();
          toast(editing ? 'Saved' : 'Zone created');
        },
        onError: (e) => toast((e as Error).message),
      },
    );
  };

  const open = adding || !!editing;

  return (
    <>
      <p className="sub">
        The private spaces members keep on the Haalving Zone. What is said inside a zone belongs to
        the people in it — this page manages the space, not their conversation.
      </p>

      {canManage ? (
        <div className="row" style={{ justifyContent: 'flex-end', margin: 'var(--s3) 0' }}>
          <button type="button" className="btn" onClick={openNew}>
            <Icon name="plus" />
            New zone
          </button>
        </div>
      ) : null}

      {isLoading ? <SkeletonRows rows={2} height={72} /> : null}

      {data && !data.length ? (
        <Empty
          icon="users"
          sentence="No zones yet. Members make these on My Zones — you can start one too."
        />
      ) : null}

      {data && data.length ? (
        <div className="list">
          {data.map((z) => (
            <div className="trow" key={z.id}>
              <Facepile z={z} />
              <div className="grow">
                <b>{z.name}</b>
                <small>
                  <Num>{z.members.length}</Num> people · made by {z.createdByName} ·{' '}
                  <Num>{z.posts}</Num> posts
                </small>
              </div>
              {canManage ? (
                <button type="button" className="btn sm ghost" onClick={() => openEdit(z)}>
                  <Icon name="pencil" />
                  Edit
                </button>
              ) : null}
              {canDelete ? (
                <button
                  type="button"
                  className="btn sm ghost"
                  style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                  onClick={() => setDeleting(z)}
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
      <Sheet open={open} onClose={closeSheet} label={editing ? 'Edit zone' : 'New zone'}>
        <div className="h1">{editing ? 'Edit zone' : 'New zone'}</div>

        <label className="field-label" htmlFor="z-name">
          Name
        </label>
        <input
          className="input"
          id="z-name"
          value={name}
          placeholder="Morning Walkers"
          onChange={(e) => setName(e.target.value)}
        />

        <div className="sec-title">Members</div>
        {/* THE POOL IS THE COMMUNITY CIRCLE — the same list the client's own zone
            picker draws from, so the two never offer different people */}
        {circle && circle.length ? (
          <div className="list">
            {circle.map((m) => {
              const on = members.includes(m.clientId);
              return (
                <button
                  type="button"
                  key={m.clientId}
                  className="trow click"
                  aria-pressed={on}
                  onClick={() => toggle(m.clientId)}
                >
                  <Avatar name={m.name} />
                  <span className="grow">
                    <b>{m.name}</b>
                  </span>
                  {on ? <Pill kind="ok">In</Pill> : <Pill kind="neutral">Add</Pill>}
                </button>
              );
            })}
          </div>
        ) : (
          <Empty icon="users" sentence="The community circle is empty." />
        )}

        {editing && editing.posts ? (
          <Audit>
            This zone holds <Num>{editing.posts}</Num> posts written by its members. Removing
            someone does not remove what they wrote.
          </Audit>
        ) : null}

        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn ghost" onClick={closeSheet}>
            Cancel
          </button>
          <button type="button" className="btn" disabled={save.isPending} onClick={submit}>
            {editing ? 'Save' : 'Create zone'}
          </button>
        </div>
      </Sheet>

      {/* ---------------------------------------------------- the delete --
          its own confirm rather than the shared one: the warning has to carry the
          post count, because deleting a zone destroys other people's writing and
          that must be said out loud */}
      <Sheet open={!!deleting} onClose={() => setDeleting(null)} label="Delete zone">
        <div className="h1">Delete “{deleting?.name}”?</div>
        <Notice kind="bad">
          This removes the zone for all <Num>{deleting?.members.length ?? 0}</Num> members
          {deleting?.posts ? (
            <>
              {' '}
              and deletes the <Num>{deleting.posts}</Num> posts they wrote in it
            </>
          ) : null}
          . It cannot be undone.
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
                  toast('Zone deleted');
                },
                onError: (e) => toast((e as Error).message),
              })
            }
          >
            Delete zone
          </button>
        </div>
      </Sheet>
    </>
  );
}
