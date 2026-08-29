'use client';

import { useState } from 'react';

import { Icon } from '@/components/icons/Icon';
import { Notice, Pill, useToast } from '@/components/ui';
import {
  useAddNotifRule,
  useDeleteNotifRule,
  useUpdateNotifRule,
  type NotifRule,
} from '@/features/config/queries';

/**
 * The Notifications tab.
 *
 * Ported from `notifHtml` / `wireNotif` (console-config.js:381-522). Tapping a
 * schedule turns it into an input — Enter saves, Escape cancels — and the On /
 * Paused pill toggles in place.
 *
 * THE SCHEDULE IS FREE TEXT. The jobs interpret the cadences they know and store
 * the rest, so Ops can write down a rule before there is code to run it. A closed
 * list here would mean a new cadence needed a deploy before it could be described.
 */
export function NotificationsTab({
  rules,
  canEdit,
}: {
  rules: NotifRule[];
  canEdit: boolean;
}) {
  const add = useAddNotifRule();
  const update = useUpdateNotifRule();
  const remove = useDeleteNotifRule();
  const toast = useToast();

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [name, setName] = useState('');
  const [schedule, setSchedule] = useState('');
  const [enabled, setEnabled] = useState(true);

  const commit = (id: string) => {
    if (draft.trim()) update.mutate({ id, patch: { schedule: draft.trim() } });
    setEditing(null);
  };

  return (
    <>
      <div className="card">
        <div className="list">
          {rules.map((r) => (
            <div className="trow" key={r.id}>
              <span className="grow">
                <b>{r.name}</b>
                {r.detail ? <small>{r.detail}</small> : null}
              </span>

              {editing === r.id ? (
                <input
                  className="input"
                  autoFocus
                  value={draft}
                  aria-label={`Schedule for ${r.name}`}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => commit(r.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commit(r.id);
                    if (e.key === 'Escape') setEditing(null);
                  }}
                />
              ) : canEdit ? (
                <button
                  type="button"
                  className="pill"
                  aria-label={`Edit the schedule for ${r.name}`}
                  onClick={() => {
                    setEditing(r.id);
                    setDraft(r.schedule);
                  }}
                >
                  {r.schedule}
                </button>
              ) : (
                <span className="pill">{r.schedule}</span>
              )}

              <span className="pill">{r.audience}</span>
              <span className="pill">{r.channel}</span>

              {canEdit ? (
                <button
                  type="button"
                  className={`pill ${r.enabled ? 'ok' : 'warn'}`}
                  aria-label={r.enabled ? `Pause ${r.name}` : `Switch on ${r.name}`}
                  onClick={() => update.mutate({ id: r.id, patch: { enabled: !r.enabled } })}
                >
                  {r.enabled ? 'On' : 'Paused'}
                </button>
              ) : (
                <Pill kind={r.enabled ? 'ok' : 'warn'}>{r.enabled ? 'On' : 'Paused'}</Pill>
              )}

              {canEdit ? (
                <button
                  type="button"
                  className="cfg-del"
                  aria-label={`Delete ${r.name}`}
                  onClick={() =>
                    remove.mutate(r.id, {
                      onSuccess: () => toast('Rule deleted.'),
                      onError: (e) => toast((e as Error).message),
                    })
                  }
                >
                  <Icon name="x" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 'var(--s3)' }}>
        <Notice>The notification log proves behaviour; this editor changes it.</Notice>
      </div>

      {canEdit ? (
        <div className="card" style={{ marginTop: 'var(--s3)' }}>
          <span className="k">Add a rule</span>
          <div className="cfg-nradd">
            <input
              className="input"
              placeholder="Rule name"
              aria-label="Rule name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="input"
              placeholder="Schedule"
              aria-label="Schedule"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
            />
            <button
              type="button"
              className={`pill ${enabled ? 'ok' : 'warn'}`}
              onClick={() => setEnabled((v) => !v)}
            >
              {enabled ? 'On' : 'Paused'}
            </button>
            <button
              type="button"
              className="btn sm"
              disabled={!name.trim() || !schedule.trim() || add.isPending}
              onClick={() =>
                add.mutate(
                  { name: name.trim(), schedule: schedule.trim(), enabled },
                  {
                    onSuccess: () => {
                      setName('');
                      setSchedule('');
                      toast('Rule added.');
                    },
                    onError: (e) => toast((e as Error).message),
                  },
                )
              }
            >
              Add rule
            </button>
          </div>
          <p className="audit" style={{ marginTop: 'var(--s2)' }}>
            New rules go to everyone over Push until narrowed.
          </p>
        </div>
      ) : null}
    </>
  );
}
