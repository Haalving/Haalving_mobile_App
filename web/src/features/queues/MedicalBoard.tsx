'use client';

import { useState } from 'react';

import { Audit, Empty, Notice, Pill, SkeletonRows, useToast } from '@/components/ui';
import { Icon } from '@/components/icons/Icon';
import { useMedical, useSignSummary, type SummaryRow } from '@/features/queues/queries';

/**
 * Medical — the doctor's desk.
 *
 * Ported from console-medical.js.
 *
 * ONE ROW, TWO AUDIENCES. The raw document renders only for `rawRecords`; the
 * structured summary is what the pod reads and is all anybody else is ever
 * given. Those are two separate rights, answered separately by the server, so
 * this screen never has to infer one from the other — a seat holding only
 * `signSummary` still has work here, it simply never sees the document behind it.
 *
 * READING IT IS AN EVENT. "Every open is audit-logged" is printed under the page
 * title, and the row that makes it true is written by the server on the read, not
 * by this component. A promise a client makes to itself is not an audit trail.
 *
 * VERSIONS NEVER OVERWRITE PRIORS. Re-signing pushes the outgoing version into
 * history — a contraindication flag that quietly disappeared would take a plan's
 * reason for excluding an exercise with it.
 */

const GROUPS = [
  { key: 'conditions' as const, label: 'Conditions', ph: 'Add a condition…' },
  { key: 'flags' as const, label: 'Contraindication flags', ph: 'Add a flag…' },
  { key: 'metrics' as const, label: 'Key metrics', ph: 'Add a metric…' },
];

type Draft = { conditions: string[]; flags: string[]; metrics: string[] };

function GroupEditor({
  label,
  ph,
  items,
  onChange,
}: {
  label: string;
  ph: string;
  items: string[];
  onChange: (next: string[]) => void;
}) {
  const [text, setText] = useState('');
  const add = () => {
    const v = text.trim();
    if (!v) return;
    onChange([...items, v]);
    setText('');
  };

  return (
    <div style={{ marginTop: 'var(--s3)' }}>
      <span className="k">{label}</span>
      <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--s1)', marginTop: 'var(--s1)' }}>
        {items.map((it, i) => (
          <span key={`${it}-${i}`} className="chip sel">
            {it}
            <button
              type="button"
              aria-label={`Remove ${it}`}
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              style={{ marginLeft: 'var(--s1)', background: 'none', border: 0, cursor: 'pointer' }}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="row" style={{ gap: 'var(--s2)', marginTop: 'var(--s2)' }}>
        <input
          className="input"
          placeholder={ph}
          aria-label={label}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn sm quiet" onClick={add}>
          Add
        </button>
      </div>
    </div>
  );
}

function ReadOnlySummary({ d }: { d: SummaryRow }) {
  return (
    <div className="card">
      <div className="row">
        <span className="k grow">Health Summary — read-only</span>
        <Pill kind="ok">Signed · pod-visible</Pill>
      </div>
      {GROUPS.map((g) => (
        <div key={g.key} style={{ marginTop: 'var(--s3)' }}>
          <span className="k">{g.label}</span>
          <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--s1)', marginTop: 'var(--s1)' }}>
            {d.summary[g.key].length ? (
              d.summary[g.key].map((it, i) => (
                <span key={`${it}-${i}`} className="chip">
                  {it}
                </span>
              ))
            ) : (
              <span className="sub">—</span>
            )}
          </div>
        </div>
      ))}
      <p className="sub" style={{ margin: 'var(--s3) 0 0' }}>
        Signed by {d.signedBy?.name ?? '—'}.
      </p>
      <Notice>
        Versioned record: if a newer document of this type arrives, this summary is marked
        “superseded by new document”. Priors are never edited or deleted.
      </Notice>
    </div>
  );
}

export function MedicalBoard() {
  const { data, isLoading } = useMedical();
  const signOff = useSignSummary();
  const toast = useToast();

  const [selId, setSelId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ conditions: [], flags: [], metrics: [] });

  if (isLoading) return <SkeletonRows rows={4} height={72} />;
  if (!data) return null;

  const docs = [...data.pending, ...data.signed];
  const selected = docs.find((d) => d.id === selId) ?? data.pending[0] ?? null;

  const pick = (d: SummaryRow) => {
    setSelId(d.id);
    setDraft({
      conditions: [...d.summary.conditions],
      flags: [...d.summary.flags],
      metrics: [...d.summary.metrics],
    });
  };

  /* the demo's own rule, stated as a sentence a person reads: all three groups
     may be empty individually, but not all at once */
  const hasSomething =
    draft.conditions.length > 0 || draft.flags.length > 0 || draft.metrics.length > 0;

  return (
    <>
      <div className="grid3">
        <div className="stat">
          <span className="k">Summaries pending</span>
          <div className="v num">{data.pending.length}</div>
          <span className="sub">raw documents awaiting sign-off</span>
        </div>
        <div className="stat">
          <span className="k">Signed &amp; pod-visible</span>
          <div className="v num ok">{data.signed.length}</div>
          <span className="sub">structured summaries live</span>
        </div>
        <div className="stat">
          <span className="k">Raw record access</span>
          <div className="v num">{data.canSeeRaw ? 'Yes' : 'No'}</div>
          <span className="sub">{data.canSeeRaw ? 'doctor access' : 'summary only'}</span>
        </div>
      </div>

      <div className="sec-title">Summary pending</div>
      {data.pending.length ? (
        <div className="list">
          {data.pending.map((d) => {
            const sel = selected?.id === d.id;
            return (
              <button
                type="button"
                key={d.id}
                className="trow click"
                {...(sel ? { 'aria-current': 'true' as const } : {})}
                style={sel ? { boxShadow: 'inset 0 0 0 1.5px var(--brand)' } : undefined}
                onClick={() => pick(d)}
              >
                <span className="mealph sm">
                  <Icon name="doc" />
                </span>
                <span className="grow">
                  <b>{d.title}</b> — {d.about}
                  <small style={{ display: 'block' }}>
                    {d.kind} · uploaded {d.uploadedOn}
                  </small>
                </span>
                <Pill kind="warn">Summary pending</Pill>
              </button>
            );
          })}
        </div>
      ) : (
        <Empty icon="heart" sentence="All clear — no summaries waiting. Your pod is fully covered." />
      )}

      {selected ? (
        <>
          <div className="sec-title">Document reviewer</div>
          <div className="split">
            {/* the raw document — a separate right from the summary */}
            {data.canSeeRaw ? (
              <div className="card">
                <span className="k">Raw document — never leaves this screen</span>
                <div className="mealph lg" style={{ marginTop: 'var(--s2)' }}>
                  <Icon name="doc" />
                </div>
                <p className="sub" style={{ margin: 'var(--s2) 0 var(--s1)' }}>
                  Raw document viewer — {selected.title} · {selected.about}
                </p>
                <Audit>Access to medical records is logged — opened just now</Audit>
              </div>
            ) : (
              <div className="card">
                <div className="empty">
                  <span className="big">
                    <Icon name="lock" />
                  </span>
                  Raw records require doctor access.
                  <br />
                  <span className="audit">This access attempt was logged.</span>
                </div>
              </div>
            )}

            {selected.status === 'PENDING' && data.canSign ? (
              <div className="card">
                <span className="k">Health Summary editor</span>
                <p className="sub" style={{ margin: 'var(--s1) 0 0' }}>
                  The pod sees only this structured summary — never the raw record.
                </p>
                {GROUPS.map((g) => (
                  <GroupEditor
                    key={g.key}
                    label={g.label}
                    ph={g.ph}
                    items={draft[g.key]}
                    onChange={(next) => setDraft((p) => ({ ...p, [g.key]: next }))}
                  />
                ))}
                <button
                  type="button"
                  className="btn block"
                  style={{ marginTop: 'var(--s4)' }}
                  disabled={!hasSomething || signOff.isPending}
                  onClick={() =>
                    signOff.mutate(
                      { id: selected.id, ...draft },
                      {
                        onSuccess: () => toast('Signed — pod-visible within 1 min.'),
                        onError: (e) => toast((e as Error).message),
                      },
                    )
                  }
                >
                  Sign &amp; publish to pod
                </button>
                {!hasSomething ? (
                  <Audit>Add at least one condition, flag or metric before signing.</Audit>
                ) : null}
                <Audit>
                  Signing writes a new version, pod-visible within 1 min. New versions never
                  overwrite priors.
                </Audit>
              </div>
            ) : (
              <ReadOnlySummary d={selected} />
            )}
          </div>
        </>
      ) : null}

      <div className="sec-title">Signed — pod-visible</div>
      {data.signed.length ? (
        <div className="list">
          {data.signed.map((d) => (
            <button
              type="button"
              key={d.id}
              className="trow click"
              onClick={() => pick(d)}
            >
              <span className="mealph sm">
                <Icon name="doc" />
              </span>
              <span className="grow">
                <b>{d.title}</b> — {d.about}
                <small style={{ display: 'block' }}>
                  {d.kind} · uploaded {d.uploadedOn}
                  {d.versions ? ` · v${d.versions + 1}` : ''}
                </small>
              </span>
              <Pill kind="ok">Signed</Pill>
            </button>
          ))}
        </div>
      ) : (
        <Empty icon="leaf" sentence="Nothing signed yet." />
      )}

      <Notice>
        Document policy: new versions never overwrite priors. Each sign-off writes a fresh version;
        older summaries flip to “superseded by new document” and stay in the record.
      </Notice>
    </>
  );
}
