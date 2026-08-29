'use client';

import { useState } from 'react';
import {
  NAV_KEYS,
  PERMS,
  isGuardedNav,
  isGuardedPerm,
  navLabel,
  permLabel,
} from '@haalving/shared';

import { Icon } from '@/components/icons/Icon';
import { Num, Sheet, SkeletonRows, useToast } from '@/components/ui';
import {
  useCreateRole,
  useRenameRole,
  useRoles,
  useToggleNav,
  useTogglePerm,
} from '@/features/people/queries';

/**
 * Roles & permissions — the matrix, as editable data.
 *
 * Ported from `rolesHtml` / `wireMatrix` / `openNewRoleSheet`
 * (console-people.js:824-1031).
 *
 * THE CHIPS ARE RENDERED FROM THE API'S ROLE ROWS, never from the code matrix, so
 * what this page shows is exactly what `requirePerm` and the sidebar consult. A
 * chip drawn from `shared/rbac.ts` would keep saying a role holds something the
 * database had already taken away.
 *
 * The two guarded seats render disabled AND are refused by the API: a Super Admin
 * who could take People & Access off their own role would strand every seat with
 * nobody left able to open this page and undo it.
 */
export function RolesTab({ canEdit }: { canEdit: boolean }) {
  const { data, isLoading } = useRoles();
  const nav = useToggleNav();
  const perm = useTogglePerm();
  const rename = useRenameRole();
  const create = useCreateRole();
  const toast = useToast();

  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [baseKey, setBaseKey] = useState('');

  if (isLoading) return <SkeletonRows rows={4} height={140} />;

  /* the console seats only — `client` is a shell, not a role anybody signs from */
  const roles = (data ?? []).filter((r) => r.key !== 'client');

  const fail = (e: unknown) => toast((e as Error).message);

  return (
    <>
      {canEdit ? (
        <div className="h1-row" style={{ marginBottom: 'var(--s3)' }}>
          <div />
          <button
            type="button"
            className="btn"
            onClick={() => {
              setNewTitle('');
              setBaseKey(roles[0]?.key ?? '');
              setAdding(true);
            }}
          >
            + New role
          </button>
        </div>
      ) : null}

      {roles.map((r) => (
        <div className="card" style={{ marginTop: 'var(--s3)' }} key={r.key}>
          <div className="row" style={{ gap: 'var(--s2)', alignItems: 'baseline' }}>
            {editingTitle === r.key ? (
              <>
                <input
                  className="input"
                  autoFocus
                  value={title}
                  aria-label={`Rename ${r.title}`}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setEditingTitle(null);
                    if (e.key === 'Enter' && title.trim()) {
                      rename.mutate(
                        { key: r.key, title: title.trim() },
                        { onSuccess: () => toast('Role renamed.'), onError: fail },
                      );
                      setEditingTitle(null);
                    }
                  }}
                />
                <button type="button" className="btn sm ghost" onClick={() => setEditingTitle(null)}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <b>{r.title}</b>
                <span className="sub">
                  <Num>{r.headcount}</Num> {r.headcount === 1 ? 'person' : 'people'}
                </span>
                {canEdit ? (
                  <button
                    type="button"
                    className="btn sm ghost"
                    aria-label={`Rename ${r.title}`}
                    onClick={() => {
                      setTitle(r.title);
                      setEditingTitle(r.key);
                    }}
                  >
                    <Icon name="pencil" />
                  </button>
                ) : null}
              </>
            )}
          </div>

          <div className="k" style={{ marginTop: 'var(--s3)' }}>
            Sidebar
          </div>
          <div className="row" style={{ gap: 'var(--s2)', flexWrap: 'wrap', marginTop: 'var(--s2)' }}>
            {NAV_KEYS.map((n) => {
              const on = r.nav.includes(n);
              const guarded = isGuardedNav(r.key, n);
              return (
                <button
                  key={n}
                  type="button"
                  className={`chip${on ? ' sel' : ''}`}
                  disabled={!canEdit || guarded}
                  aria-pressed={on}
                  title={guarded ? 'This one cannot be switched off' : undefined}
                  onClick={() =>
                    nav.mutate({ key: r.key, navId: n, on: !on }, { onError: fail })
                  }
                >
                  {navLabel(n)}
                </button>
              );
            })}
          </div>

          <div className="k" style={{ marginTop: 'var(--s3)' }}>
            Permissions
          </div>
          <div className="row" style={{ gap: 'var(--s2)', flexWrap: 'wrap', marginTop: 'var(--s2)' }}>
            {PERMS.map((p) => {
              const on = r.perms.includes(p);
              const guarded = isGuardedPerm(r.key, p);
              return (
                <button
                  key={p}
                  type="button"
                  className={`chip${on ? ' sel' : ''}`}
                  disabled={!canEdit || guarded}
                  aria-pressed={on}
                  title={guarded ? 'This one cannot be switched off' : undefined}
                  onClick={() =>
                    perm.mutate({ key: r.key, perm: p, on: !on }, { onError: fail })
                  }
                >
                  {permLabel(p)}
                </button>
              );
            })}
          </div>

          {r.key === 'admin' ? (
            <p className="audit" style={{ marginTop: 'var(--s3)' }}>
              People &amp; Access and Manage people &amp; roles cannot be switched off here — without
              them nobody could open this page to undo it.
            </p>
          ) : null}
        </div>
      ))}

      <Sheet open={adding} onClose={() => setAdding(false)} label="New role">
        <div className="h1">New role</div>
        <p className="sub">
          A new role starts from an existing one. Built from nothing it would have no pages and no
          permissions, and its first holder would see an empty console.
        </p>

        <label className="k" htmlFor="nr-title">
          Name
        </label>
        <input
          id="nr-title"
          className="input"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />

        <label className="k" htmlFor="nr-base">
          Start from
        </label>
        <select
          id="nr-base"
          className="input"
          value={baseKey}
          onChange={(e) => setBaseKey(e.target.value)}
        >
          {roles.map((r) => (
            <option key={r.key} value={r.key}>
              {r.title}
            </option>
          ))}
        </select>

        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 'var(--s3)' }}>
          <button type="button" className="btn sm ghost" onClick={() => setAdding(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn sm"
            disabled={!newTitle.trim() || !baseKey}
            onClick={() =>
              create.mutate(
                { title: newTitle.trim(), baseKey },
                {
                  onSuccess: () => {
                    setAdding(false);
                    toast('Role created.');
                  },
                  onError: fail,
                },
              )
            }
          >
            Create role
          </button>
        </div>
      </Sheet>
    </>
  );
}
