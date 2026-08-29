'use client';

import { useState } from 'react';
import { DEPTS, STAFF_ROLE_KEYS, availWindows, fmtTime, roleTitle, wdOf } from '@haalving/shared';

import { Avatar, Empty, Notice, Num, Pill, SkeletonRows } from '@/components/ui';
import { Icon } from '@/components/icons/Icon';
import { useCan } from '@/lib/can';
import { StaffSheet } from '@/features/people/StaffSheet';
import { useStaff, type StaffUser } from '@/features/people/queries';

/**
 * The Staff tab — ported from console-people.js.
 *
 * This was the whole page on Day 1; it is now the first of four tabs, unchanged
 * in behaviour. The page header moved to the tabbed shell so every tab shares it.
 *
 * READING THE BENCH AND EDITING IT ARE TWO DIFFERENT RIGHTS. The page sits
 * behind the `people` SIDEBAR ITEM, which an HoD holds; creating and editing
 * needs `managePeople`, which only the Super Admin holds. So an HoD sees their
 * team and cannot rewrite it, which is exactly the demo's arrangement.
 *
 * The row's second line is TODAY'S HOURS, read through `availWindows` — the same
 * helper the conflict engine uses, so what this screen says and what a booking
 * is refused against cannot disagree. A split shift prints both windows.
 */
export function StaffTab() {
  const canManage = useCan('managePeople');

  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [editing, setEditing] = useState<StaffUser | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, isLoading, isError, error, refetch } = useStaff({
    ...(role ? { role } : {}),
    ...(q.trim() ? { q: q.trim() } : {}),
  });

  /* the staff bench only — a client's login is a User row too, and listing it
     here would put people who have no console seat on the access page */
  const staff = (data ?? []).filter((u) => u.role !== 'client');

  return (
    <>
      {canManage ? (
        <div className="h1-row" style={{ marginBottom: 'var(--s3)' }}>
          <div />
          <button type="button" className="btn" onClick={() => setCreating(true)}>
            <Icon name="plus" style={{ width: 16, height: 16 }} /> Add someone
          </button>
        </div>
      ) : null}

      {!canManage ? (
        <Notice>
          You can read the bench. Adding people and changing what they may see needs a Super Admin.
        </Notice>
      ) : null}

      <input
        className="input"
        type="search"
        placeholder="Search by name or email"
        aria-label="Search the team"
        autoComplete="off"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div className="tfil" role="group" aria-label="Filter by role">
        <button type="button" className={role === '' ? 'on' : ''} onClick={() => setRole('')}>
          Everyone
        </button>
        {STAFF_ROLE_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className={role === k ? 'on' : ''}
            aria-pressed={role === k}
            onClick={() => setRole(role === k ? '' : k)}
          >
            {roleTitle(k)}
          </button>
        ))}
      </div>

      {isError ? (
        <Notice kind="bad">
          {(error as Error).message}
          <div className="retry">
            <button type="button" className="btn sm" onClick={() => void refetch()}>
              Try again
            </button>
          </div>
        </Notice>
      ) : null}

      {isLoading ? <SkeletonRows rows={6} height={72} /> : null}

      {data && staff.length === 0 ? (
        <Empty icon="users" sentence="Nobody matches that search." />
      ) : null}

      {staff.length > 0 ? (
        <div className="list">
          {staff.map((u) => (
            <StaffRow key={u.id} user={u} onOpen={() => setEditing(u)} />
          ))}
        </div>
      ) : null}

      {creating ? <StaffSheet member={null} onClose={() => setCreating(false)} /> : null}
      {editing ? <StaffSheet member={editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function StaffRow({ user, onOpen }: { user: StaffUser; onOpen: () => void }) {
  /* today's declared hours, read the only safe way. Indexing avail[day][0]
     directly returns nothing for a split shift, silently — which is how a coach
     ends up looking free all afternoon. */
  const today = wdOf(0);
  const windows = availWindows({ id: user.id, name: user.name, avail: user.avail }, today);
  const hours = windows.length
    ? windows.map(([a, b]) => `${fmtTime(a)}–${fmtTime(b)}`).join(' and ')
    : 'off today';

  const cap = user.capacity;
  const full = !!cap && cap.declared > 0 && cap.load >= cap.declared;

  return (
    <button type="button" className="trow click" onClick={onOpen}>
      <Avatar name={user.name} />
      <span className="grow" style={{ flex: 1, minWidth: 0 }}>
        <b>
          {user.name}
          {user.level === 2 ? (
            <>
              {' '}
              <span className="pill neutral">L2</span>
            </>
          ) : null}
        </b>
        <small>
          {roleTitle(user.role)}
          {user.dept ? ` · ${DEPTS[user.dept as keyof typeof DEPTS]}` : ''} · {hours}
        </small>
      </span>

      {cap && cap.declared > 0 ? (
        /* declared, never derived — the number the bench's owner typed in */
        <Pill kind={full ? 'warn' : 'neutral'}>
          {full ? 'FULL' : <><Num>{cap.load}</Num>/<Num>{cap.declared}</Num></>}
        </Pill>
      ) : null}

      {user.status !== 'active' ? <Pill kind="bad">Inactive</Pill> : null}
    </button>
  );
}
