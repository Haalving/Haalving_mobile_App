'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PLANS, PLAN_KEYS, plansOnSale, schemas } from '@haalving/shared';

import { Notice, Pill, Sheet, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAddClientDirect } from '@/features/clients/queries';

/**
 * Add a client directly — the SOP's documented exception.
 *
 * Everywhere else, a client is born on the far side of step 12: the rail
 * collects the assessment, the InBody, the consent and the pod, and promotion is
 * what turns an arrival into a person with a login. This sheet skips all of it,
 * which is why it reads the way it does — a warning that names exactly what is
 * NOT collected, and a required reason that is the only record of why the rail
 * was skipped. Neither is decoration: the reason goes to the audit log beside
 * the act, and six weeks later it is the only answer to "why is this person here
 * with no assessment".
 *
 * The plan picker is `NewArrivalSheet`'s, which is `planPickHtml`
 * (console-pipeline.js:796-828): an off-sale plan is DIMMED behind "Opening
 * soon" rather than hidden, so Svayam reads as coming rather than as absent.
 */
export function AddClientSheet({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  /**
   * Where the caller wants to go with the new record. Left off, the sheet opens
   * the record itself — which is the only sensible destination either way, since
   * the pod is empty and seating it is the next thing this person has to do.
   */
  onAdded?: (clientId: string) => void;
}) {
  const router = useRouter();
  const sale = plansOnSale();
  const add = useAddClientDirect();
  const toast = useToast();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState<string>(sale[0] ?? PLAN_KEYS[0]);
  const [reason, setReason] = useState('');

  /* the refusal lands on the sheet AND in a toast, for the reason
     `NewArrivalSheet` learned: a toast fades, and this sheet is tall enough that
     the person is looking at its foot when the request comes back */
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const reset = () => {
    setName('');
    setPhone('');
    setEmail('');
    setPlan(sale[0] ?? PLAN_KEYS[0]);
    setReason('');
  };

  /* the schema's own floors, read from the schema rather than retyped — the edge
     refuses a one-letter name and an eight-character reason is the audit log's
     minimum, so the button should say so before a round trip does */
  const shape = schemas.addClientDirectSchema.shape;
  const named = shape.name.safeParse(name).success;
  const phoned = shape.phone.safeParse(phone).success;
  const reasoned = shape.reason.safeParse(reason).success;
  const ready = named && phoned && reasoned;

  /* the server's own sentence for a field, printed under that field */
  const fieldNote = (k: string) =>
    fieldErrors[k] ? <p className="field-err">{fieldErrors[k]}</p> : null;

  const submit = () => {
    setError(null);
    setFieldErrors({});
    add.mutate(
      {
        name: name.trim(),
        phone: phone.trim(),
        /* an empty box is an ABSENT field, not an empty string: the schema
           validates a mail address when one is given, and "" is not one */
        ...(email.trim() ? { email: email.trim() } : {}),
        plan,
        reason: reason.trim(),
      },
      {
        onSuccess: (row) => {
          reset();
          onClose();
          toast(`${row.name} is on the roster — seat their pod on the record.`);
          /* straight to the record, because the pod is empty and seating it is
             the next thing this person has to do */
          if (onAdded) onAdded(row.id);
          else router.push(`/clients/${row.id}`);
        },
        onError: (e) => {
          if (e instanceof ApiError && e.details) setFieldErrors(e.details);
          setError((e as Error).message);
          toast((e as Error).message);
        },
      },
    );
  };

  return (
    <Sheet open={open} onClose={onClose} label="Add a client">
      <div className="h1">Add a client</div>
      <p className="sub">
        Straight onto the roster, without the twelve-step rail. Use it for somebody already signed
        and already known.
      </p>

      <Notice kind="warn">
        This skips the onboarding SOP. Nothing is collected — no assessment, no InBody, no records —
        and the pod is empty until you seat it on the record.
      </Notice>

      <div className="sec-title">Who</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s4)' }}>
        <div>
          <div className="field-label">
            Full name <span className="req">*</span>
          </div>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Full name"
            autoComplete="off"
          />
          {fieldNote('name')}
          {/* a disabled button that does not say why reads as a broken one */}
          {name.trim() && !named ? (
            <p className="field-err">A full name — at least two letters.</p>
          ) : null}
        </div>

        <div>
          <div className="field-label">
            Phone <span className="req">*</span>
          </div>
          <input
            className="input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            aria-label="Phone"
            autoComplete="off"
          />
          {/* required here and optional on an arrival, because this call mints
              the login on the spot: a client signs in with their number, so one
              created without a good one is an account nobody can ever reach */}
          <p className="audit">They sign in with this.</p>
          {fieldNote('phone')}
          {phone.trim() && !phoned ? (
            <p className="field-err">An Indian mobile number — ten digits, or +91 and ten.</p>
          ) : null}
        </div>

        <div>
          <div className="field-label">Email</div>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Email"
            autoComplete="off"
          />
          {fieldNote('email')}
        </div>
      </div>

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
                name="direct-plan"
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
      {fieldNote('plan')}

      <div className="sec-title">Why this skips onboarding</div>
      <textarea
        className="input"
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. Signed at the studio last month — Sneha assessed them then"
        aria-label="Why this skips onboarding"
      />
      <p className="audit">
        Required. It goes to the audit log beside this act, and it is the only record of why the SOP
        was skipped.
      </p>
      {fieldNote('reason')}
      {reason.trim() && !reasoned ? (
        <p className="field-err">A sentence, not a word — at least eight characters.</p>
      ) : null}

      {error ? <Notice kind="bad">{error}</Notice> : null}

      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 'var(--s3)' }}>
        <button type="button" className="btn sm ghost" onClick={onClose}>
          Not now
        </button>
        <button type="button" className="btn sm" disabled={!ready || add.isPending} onClick={submit}>
          Add to the roster
        </button>
      </div>
    </Sheet>
  );
}
