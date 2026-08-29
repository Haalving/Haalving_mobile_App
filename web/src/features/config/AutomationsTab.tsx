'use client';

import { useState } from 'react';
import { TRIGGER_LABELS, stepWhen, type FlowTrigger } from '@haalving/shared';

import { Icon } from '@/components/icons/Icon';
import { Notice, Num, Pill, useToast } from '@/components/ui';
import {
  useAddFlow,
  useAddStep,
  useDeleteFlow,
  useDeleteStep,
  useUpdateFlow,
  type FlowRow,
} from '@/features/config/queries';

/**
 * The Automations tab — the message sequences a client walks without anybody
 * sending them.
 *
 * Ported from `flowsHtml` / `wireFlows` (console-config.js:684-848).
 *
 * PAUSING IS NOT DELETING, and the difference is the point of this screen. A
 * template anybody is switched on for cannot be deleted — the messages would stop
 * with no record of why, and nobody would know until a client asked. The server
 * refuses with that sentence and the × shows it.
 */

const fmtAt = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}`;
};

export function AutomationsTab({
  flows,
  reach,
  canEdit,
}: {
  flows: FlowRow[];
  reach: Record<string, { on: number; live: number }>;
  canEdit: boolean;
}) {
  const update = useUpdateFlow();
  const remove = useDeleteFlow();
  const addFlow = useAddFlow();
  const addStep = useAddStep();
  const delStep = useDeleteStep();
  const toast = useToast();

  const [open, setOpen] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState<FlowTrigger>('ENROL');
  const [defaultOn, setDefaultOn] = useState(false);

  return (
    <>
      <div className="card">
        <div className="list">
          {flows.map((f) => {
            const r = reach[f.id] ?? { on: 0, live: 0 };
            const expanded = open === f.id;
            return (
              <div key={f.id}>
                <div className="trow">
                  <span className="grow">
                    <b>{f.name}</b>
                    {f.desc ? <small>{f.desc}</small> : null}
                  </span>

                  <span className="pill">{TRIGGER_LABELS[f.trigger]}</span>

                  <button
                    type="button"
                    className="pill"
                    aria-label={`${expanded ? 'Hide' : 'Show'} the steps of ${f.name}`}
                    onClick={() => setOpen(expanded ? null : f.id)}
                  >
                    <Num>{f.steps.length}</Num> steps
                  </button>

                  <small>
                    Switched on for <Num>{r.on}</Num> of <Num>{r.live}</Num>
                  </small>

                  {canEdit ? (
                    <button
                      type="button"
                      className={`pill ${f.defaultOn ? 'ok' : ''}`}
                      aria-label={`New clients ${f.defaultOn ? 'on' : 'off'} for ${f.name}`}
                      onClick={() => update.mutate({ id: f.id, patch: { defaultOn: !f.defaultOn } })}
                    >
                      New clients {f.defaultOn ? 'On' : 'Off'}
                    </button>
                  ) : (
                    <Pill kind={f.defaultOn ? 'ok' : 'neutral'}>
                      New clients {f.defaultOn ? 'On' : 'Off'}
                    </Pill>
                  )}

                  {canEdit ? (
                    <button
                      type="button"
                      className={`pill ${f.enabled ? 'ok' : 'warn'}`}
                      aria-label={f.enabled ? `Pause ${f.name}` : `Switch on ${f.name}`}
                      onClick={() => update.mutate({ id: f.id, patch: { enabled: !f.enabled } })}
                    >
                      {f.enabled ? 'On' : 'Paused'}
                    </button>
                  ) : (
                    <Pill kind={f.enabled ? 'ok' : 'warn'}>{f.enabled ? 'On' : 'Paused'}</Pill>
                  )}

                  {canEdit ? (
                    <button
                      type="button"
                      className="cfg-del"
                      aria-label={`Delete ${f.name}`}
                      onClick={() =>
                        remove.mutate(f.id, {
                          onSuccess: () => toast('Template deleted.'),
                          /* "… is switched on for 6 clients. Pause it instead." */
                          onError: (e) => toast((e as Error).message),
                        })
                      }
                    >
                      <Icon name="x" />
                    </button>
                  ) : null}
                </div>

                {expanded ? (
                  <div style={{ padding: 'var(--s2) 0 var(--s3)' }}>
                    <ol className="cfg-steps">
                      {f.steps.map((s) => (
                        <li key={s.id}>
                          <b>{s.title}</b> — {stepWhen(f.trigger, s)} · {fmtAt(s.at)}
                          {canEdit ? (
                            <button
                              type="button"
                              className="cfg-del"
                              aria-label={`Remove the step ${s.title}`}
                              style={{ marginLeft: 'var(--s2)' }}
                              onClick={() => delStep.mutate({ id: f.id, stepId: s.id })}
                            >
                              <Icon name="x" />
                            </button>
                          ) : null}
                        </li>
                      ))}
                      {!f.steps.length ? (
                        <li>
                          <em>No steps yet — it sends nothing until one is added.</em>
                        </li>
                      ) : null}
                    </ol>

                    {canEdit ? (
                      <button
                        type="button"
                        className="btn sm ghost"
                        style={{ marginTop: 'var(--s2)' }}
                        onClick={() =>
                          addStep.mutate(
                            {
                              id: f.id,
                              step: {
                                ...(f.trigger === 'ENROL' ? { after: 0 } : { on: 1 }),
                                at: 540,
                                title: 'New step',
                                text: 'Write the message here.',
                              },
                            },
                            { onError: (e) => toast((e as Error).message) },
                          )
                        }
                      >
                        Add a step
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 'var(--s3)' }}>
        <Notice>
          Pausing a template stops it for everybody, however many people have it switched on
          individually. A client&rsquo;s own switch lives on their Automations pad.
        </Notice>
      </div>

      {canEdit ? (
        <div className="card" style={{ marginTop: 'var(--s3)' }}>
          <span className="k">Add a template</span>
          <div className="cfg-nradd">
            <input
              className="input"
              placeholder="Template name"
              aria-label="Template name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <select
              className="input"
              value={trigger}
              aria-label="Trigger"
              onChange={(e) => setTrigger(e.target.value as FlowTrigger)}
            >
              <option value="ENROL">Once, from joining</option>
              <option value="CYCLE_DAY">Every cycle</option>
            </select>
            <button
              type="button"
              className={`pill ${defaultOn ? 'ok' : ''}`}
              onClick={() => setDefaultOn((v) => !v)}
            >
              New clients {defaultOn ? 'On' : 'Off'}
            </button>
            <button
              type="button"
              className="btn sm"
              disabled={!name.trim() || addFlow.isPending}
              onClick={() =>
                addFlow.mutate(
                  { name: name.trim(), trigger, defaultOn },
                  {
                    onSuccess: () => {
                      setName('');
                      toast('Template added.');
                    },
                    onError: (e) => toast((e as Error).message),
                  },
                )
              }
            >
              Add template
            </button>
          </div>
          <p className="audit" style={{ marginTop: 'var(--s2)' }}>
            A new template starts with no steps and sends nothing until one is added.
          </p>
        </div>
      ) : null}
    </>
  );
}
