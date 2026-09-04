'use client';

import { useMemo, useState } from 'react';
import { DERIVED_TAGS, tagTone } from '@haalving/shared';

import { Avatar, Notice, Num, Pill, Sheet, SkeletonRows, useToast } from '@/components/ui';
import { Icon } from '@/components/icons/Icon';
import { useCan } from '@/lib/can';
import { StaffDetail } from '@/features/people/StaffDetail';
import { StaffSheet } from '@/features/people/StaffSheet';
import {
  joinRoster,
  useSetStaffActive,
  useStaff,
  useStaffRoster,
  type StaffRosterRow,
} from '@/features/people/queries';

/**
 * The Staff tab — `staffHtml` / `staffTableHtml` (console-people.js:328–400).
 *
 * A BOARD, NOT A LIST OF CARDS. Seven columns, because the questions asked of
 * this screen are comparative — who is unallocated, who is on the Nutrition
 * bench, which seats are L2 — and a stack of cards answers none of them without
 * scrolling. The ID column is there for the same reason the demo has one: people
 * quote `u-vikram` at each other in tickets.
 *
 * TAGS COME FROM THE SERVER, derived and typed together in one list (`allTags`).
 * Re-deriving "New joinee" in the browser would put a second clock on the same
 * fact, and the two would disagree on the 183rd day.
 *
 * READING THE BENCH AND EDITING IT ARE TWO DIFFERENT RIGHTS. The page sits behind
 * the `people` SIDEBAR ITEM, which an HoD holds; creating, editing and switching
 * a seat off needs `managePeople`, which only the Super Admin holds.
 */

const ALL = 'all';

interface ChipDef {
  k: string;
  label: string;
  n: number;
}

/**
 * A chip counts the rows CLICKING IT would give you.
 *
 * The search, plus the OTHER dimension, never its own. Counting a role chip
 * against the role filter would print 0 beside every role you are not already
 * standing on, and a chip that lands on an empty table reads as a bug rather
 * than a filter.
 */
function ChipRow({
  chips,
  active,
  label,
  onPick,
}: {
  chips: ChipDef[];
  active: string;
  label: string;
  onPick: (k: string) => void;
}) {
  return (
    <div className="tfil pa2-fil" role="group" aria-label={label}>
      {chips.map((c) => (
        <button
          key={c.k}
          type="button"
          className={c.k === active ? 'on' : ''}
          aria-pressed={c.k === active}
          onClick={() => onPick(c.k)}
        >
          {c.label} <span className="num">{c.n}</span>
        </button>
      ))}
    </div>
  );
}

export function StaffTab() {
  const canManage = useCan('managePeople');
  const toast = useToast();

  const [q, setQ] = useState('');
  const [role, setRole] = useState(ALL);
  const [tag, setTag] = useState(ALL);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const roster = useStaffRoster();
  /*
   * The RECORD read, for the edit sheet alone.
   *
   * `/people/staff` carries everything the board draws but not `phone`, and a
   * form that opens with somebody's phone number blank is a form that erases it
   * the first time anyone saves. Only a seat that can edit needs it, so a
   * read-only HoD never pays for the request.
   */
  const records = useStaff({}, { enabled: canManage });

  const rows = useMemo(() => roster.data ?? [], [roster.data]);

  /* name OR id, so 'vik', 'u-vik' and 'u-vikram' all reach the same person */
  const matchesQuery = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (u: StaffRosterRow) =>
      !s || u.name.toLowerCase().includes(s) || u.id.toLowerCase().includes(s);
  }, [q]);

  const shown = useMemo(
    () =>
      rows.filter(
        (u) =>
          matchesQuery(u) &&
          (role === ALL || u.role === role) &&
          (tag === ALL || u.tags.includes(tag)),
      ),
    [rows, matchesQuery, role, tag],
  );

  const roleChips = useMemo<ChipDef[]>(() => {
    const pool = rows.filter((u) => matchesQuery(u) && (tag === ALL || u.tags.includes(tag)));
    const keys: string[] = [];
    for (const u of rows) if (!keys.includes(u.role)) keys.push(u.role);

    const out: ChipDef[] = [{ k: ALL, label: 'All roles', n: pool.length }];
    for (const k of keys) {
      const n = pool.filter((u) => u.role === k).length;
      /* a chip nobody in the current result carries is noise — unless you are
         standing on it, when removing it would strand you with no way back */
      if (!n && role !== k) continue;
      out.push({ k, label: rows.find((u) => u.role === k)?.roleTitle ?? k, n });
    }
    return out;
  }, [rows, matchesQuery, role, tag]);

  const tagChips = useMemo<ChipDef[]>(() => {
    const pool = rows.filter((u) => matchesQuery(u) && (role === ALL || u.role === role));
    /* derived names first, in their declared order, then whatever anyone has
       typed, alphabetically — so the automatic half of the row keeps a fixed
       shape as employees come and go */
    const typed: string[] = [];
    for (const u of rows) for (const t of u.typedTags) if (!typed.includes(t)) typed.push(t);
    typed.sort();

    const out: ChipDef[] = [{ k: ALL, label: 'All tags', n: pool.length }];
    for (const t of [...DERIVED_TAGS, ...typed]) {
      const n = pool.filter((u) => u.tags.includes(t)).length;
      if (!n && tag !== t) continue;
      out.push({ k: t, label: t, n });
    }
    return out;
  }, [rows, matchesQuery, role, tag]);

  /* the record the edit sheet needs, roster line and all — `joinRoster` takes
     the manager-only three from the ROSTER, which is the read that redacts */
  const editRecord = useMemo(() => {
    if (!editId) return null;
    const base = (records.data ?? []).find((u) => u.id === editId);
    if (!base) return null;
    return joinRoster(base, rows.find((r) => r.id === editId));
  }, [editId, records.data, rows]);

  const setActive = useSetStaffActive();
  const toggle = (u: StaffRosterRow) => {
    setActive.mutate(
      { id: u.id, inactive: !u.inactive },
      {
        onSuccess: () => toast(`${u.name} ${u.inactive ? 'reactivated' : 'deactivated'}.`),
        /* the server refuses while they still hold pod seats, and names the
           clients — swallowing that would leave a button that does nothing */
        onError: (e) =>
          toast(
            e instanceof Error && e.message
              ? e.message
              : 'That did not go through. Nothing was changed.',
          ),
      },
    );
  };

  return (
    <>
      <div className="pa2-tools">
        <input
          className="input grow"
          type="search"
          placeholder="Search by name or id"
          aria-label="Search employees by name or id"
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {canManage ? (
          <button
            type="button"
            className="btn sm"
            style={{ flex: 'none' }}
            onClick={() => setCreating(true)}
          >
            <Icon name="plus" /> Add employee
          </button>
        ) : null}
      </div>

      {roster.isError ? (
        <Notice kind="bad">
          {(roster.error as Error).message}
          <div className="retry">
            <button type="button" className="btn sm" onClick={() => void roster.refetch()}>
              Try again
            </button>
          </div>
        </Notice>
      ) : null}

      {roster.isLoading ? <SkeletonRows rows={6} height={56} /> : null}

      {roster.data ? (
        <>
          <ChipRow
            chips={roleChips}
            active={role}
            label="Filter employees by role"
            onPick={setRole}
          />
          <ChipRow chips={tagChips} active={tag} label="Filter employees by tag" onPick={setTag} />

          {shown.length ? (
            <div className="tablewrap">
              <table className="data pa2-t">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>ID</th>
                    <th>Role</th>
                    <th>Department</th>
                    <th>Level</th>
                    <th>Allocated</th>
                    <th>Tags</th>
                    {canManage ? (
                      <th>
                        <span className="vh">Actions</span>
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((u) => (
                    <StaffTableRow
                      key={u.id}
                      u={u}
                      canManage={canManage}
                      onOpen={() => setDetailId(u.id)}
                      onEdit={() => setEditId(u.id)}
                      onToggle={() => toggle(u)}
                      busy={setActive.isPending}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="sub" style={{ padding: 'var(--s5) 0' }}>
              Nobody matches that search or filter.
            </p>
          )}
        </>
      ) : null}

      {canManage ? (
        <p className="audit">
          Tap a name for the full employee record. New joinee, Bench cover, On leave, Unallocated,
          Split shift and Inactive are worked out from the record itself and maintain themselves;
          every other tag was typed on the record. Deactivating a seat removes it from new
          scheduling and assignment pickers immediately; existing allocations stay until reassigned.
        </p>
      ) : (
        <p className="audit">
          Read-only for your role. Tap a name for the employee record; adding, editing and
          deactivating staff needs Super Admin access.
        </p>
      )}

      {creating ? <StaffSheet member={null} onClose={() => setCreating(false)} /> : null}

      {editId ? (
        editRecord ? (
          <StaffSheet member={editRecord} onClose={() => setEditId(null)} />
        ) : (
          /* the record read is still in flight. An empty form would look like a
             record with every field blank, and saving it would make one. */
          <Sheet open onClose={() => setEditId(null)} variant="tall" label="Employee record">
            <div className="h1">Employee record</div>
            <SkeletonRows rows={6} height={56} />
          </Sheet>
        )
      ) : null}

      {detailId ? (
        <StaffDetail
          id={detailId}
          onClose={() => setDetailId(null)}
          onEdit={
            canManage
              ? () => {
                  setEditId(detailId);
                  setDetailId(null);
                }
              : undefined
          }
        />
      ) : null}
    </>
  );
}

function StaffTableRow({
  u,
  canManage,
  onOpen,
  onEdit,
  onToggle,
  busy,
}: {
  u: StaffRosterRow;
  canManage: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onToggle: () => void;
  busy: boolean;
}) {
  return (
    <tr
      className="pa2-row"
      /* a deactivated seat is still a seat: it stays on the board, faded, so the
         count above it and the row below it both keep meaning what they say */
      style={u.inactive ? { opacity: 0.55 } : undefined}
      /* the whole row is a convenience target; the name button is the real
         affordance, and its own handler runs for taps that land on it */
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        onOpen();
      }}
    >
      <td>
        <button
          type="button"
          className="pa2-name"
          aria-label={`${u.name} — employee record`}
          onClick={onOpen}
        >
          <Avatar name={u.name} className="sm" />
          <span>
            <b>{u.name}</b>
            {u.subtitle ? <small>{u.subtitle}</small> : null}
          </span>
        </button>
      </td>
      <td className="pa2-id">{u.id}</td>
      <td>{u.roleTitle || '—'}</td>
      <td>{u.deptLabel || '—'}</td>
      <td>
        <Num>L{u.level ?? 2}</Num>
      </td>
      <td>
        <Num>{u.allocated}</Num>
      </td>
      <td>
        <span className="pa2-tags">
          {u.tags.length ? (
            u.tags.map((t) => (
              <Pill key={t} kind={tagTone(t)}>
                {t}
              </Pill>
            ))
          ) : (
            <span className="pa2-id">—</span>
          )}
        </span>
      </td>
      {canManage ? (
        <td>
          <span className="pa2-acts">
            <button
              type="button"
              className="btn sm ghost"
              aria-label={`Edit ${u.name}`}
              onClick={onEdit}
            >
              <Icon name="pencil" />
            </button>
            <button type="button" className="btn sm ghost" disabled={busy} onClick={onToggle}>
              {u.inactive ? 'Reactivate' : 'Deactivate'}
            </button>
          </span>
        </td>
      ) : null}
    </tr>
  );
}
