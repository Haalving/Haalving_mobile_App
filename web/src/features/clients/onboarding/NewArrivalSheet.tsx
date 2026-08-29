'use client';

import { useState } from 'react';
import { PLANS, PLAN_KEYS, plansOnSale, schemas } from '@haalving/shared';

import { Chip, Pill, Sheet, useToast } from '@/components/ui';
import { useCreateArrival, type CreateArrivalInput } from '@/features/clients/onboarding/queries';

/**
 * A new arrival — name, plan, and where they came from.
 *
 * The plan picker is `planPickHtml` (console-pipeline.js:796-828): every plan is
 * listed, and one that is not on sale is shown disabled behind an "Opening soon"
 * pill rather than hidden. Hiding it would make Svayam look like something that
 * does not exist; showing it says it is coming and cannot be sold today, which is
 * the actual state of the business. The server refuses an off-sale plan anyway —
 * this is the same rule, one layer up, where a person can see it.
 */

/* the SOP's three, in the schema's order, with the words a coordinator would use */
const SOURCES: { key: CreateArrivalInput['source']; label: string }[] = [
  { key: 'sales', label: 'Sales' },
  { key: 'self', label: 'Self sign-up' },
  { key: 'referral', label: 'Referral' },
];

export function NewArrivalSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const sale = plansOnSale();
  const create = useCreateArrival();
  const toast = useToast();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState<string>(sale[0] ?? PLAN_KEYS[0]);
  const [source, setSource] = useState<CreateArrivalInput['source']>('sales');
  const [note, setNote] = useState('');

  const reset = () => {
    setName('');
    setPhone('');
    setEmail('');
    setPlan(sale[0] ?? PLAN_KEYS[0]);
    setSource('sales');
    setNote('');
  };

  /* the schema's own floor, read from the schema rather than retyped — a name of
     one character is refused at the edge and the button should say so first */
  const named = schemas.createArrivalSchema.shape.name.safeParse(name).success;

  const submit = () => {
    create.mutate(
      {
        name: name.trim(),
        /* an empty box is an ABSENT field, not an empty string: the schema
           validates a phone and a mail address when they are given, and "" is
           neither of those things */
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(email.trim() ? { email: email.trim() } : {}),
        plan,
        source,
        ...(note.trim() ? { note: note.trim() } : {}),
      },
      {
        onSuccess: (row) => {
          reset();
          onClose();
          toast(`${row.name} is on the rail at step 1 · ${row.stepLabel}.`);
        },
        /* the server's own sentence — it is the one that knows why */
        onError: (e) => toast((e as Error).message),
      },
    );
  };

  return (
    <Sheet open={open} onClose={onClose} label="New arrival">
      <div className="h1">New arrival</div>
      <p className="sub">
        They start on step 1 of the SOP. Nothing about a client exists yet — that is created on the
        far side of step 12.
      </p>

      <div className="sec-title">Who</div>
      <input
        className="input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Full name"
        aria-label="Full name"
        autoComplete="off"
      />
      <input
        className="input"
        style={{ marginTop: 'var(--s2)' }}
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Phone (optional)"
        aria-label="Phone"
        autoComplete="off"
      />
      <input
        className="input"
        style={{ marginTop: 'var(--s2)' }}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email (optional)"
        aria-label="Email"
        autoComplete="off"
      />

      <div className="sec-title">Plan</div>
      <div className="list">
        {PLAN_KEYS.map((k) => {
          const pl = PLANS[k];
          const onSale = sale.includes(k);
          return (
            /* the demo dims the row it will not accept rather than removing it
               (console-pipeline.js:812) */
            <label className="trow" key={k} style={onSale ? undefined : { opacity: 0.55 }}>
              <input
                type="radio"
                name="ob-plan"
                value={k}
                checked={plan === k}
                disabled={!onSale}
                onChange={() => setPlan(k)}
              />
              {/* `.pslot .grow{flex:1;min-width:0}` (app.css:2686) — the demo's own
                  rule for a radio row, carried inline because `.pslot` is not one
                  of the ported classes */}
              <span className="grow" style={{ flex: 1, minWidth: 0 }}>
                <b>{pl.name}</b>
                <small>
                  {pl.tag} · {pl.flow}
                </small>
              </span>
              {onSale ? null : <Pill kind="neutral">Opening soon</Pill>}
            </label>
          );
        })}
      </div>
      <p className="audit" style={{ margin: 'var(--s2) 0 0' }}>
        This launch sells {sale.map((k) => PLANS[k].name).join(' and ')} only — every Poorna
        conversation trains the AI that will run Svayam.
      </p>

      <div className="sec-title">Where they came from</div>
      <div className="row" style={{ gap: 'var(--s2)' }}>
        {SOURCES.map((s) => (
          <Chip key={s.key} selected={source === s.key} onClick={() => setSource(s.key)}>
            {s.label}
          </Chip>
        ))}
      </div>

      <div className="sec-title">Note</div>
      <textarea
        className="input"
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Anything the team should know before step 1 (optional)"
        aria-label="Onboarding note"
      />

      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 'var(--s3)' }}>
        <button type="button" className="btn sm ghost" onClick={onClose}>
          Not now
        </button>
        <button
          type="button"
          className="btn sm"
          disabled={!named || create.isPending}
          onClick={submit}
        >
          Add to Onboarding
        </button>
      </div>
    </Sheet>
  );
}
