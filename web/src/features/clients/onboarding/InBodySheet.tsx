'use client';

import { useState } from 'react';
import { schemas } from '@haalving/shared';

import { Notice, Sheet, useToast } from '@/components/ui';
import { useKeyInBody, type Arrival, type InbodyInput } from '@/features/clients/onboarding/queries';

/**
 * The InBody key-in.
 *
 * The demo commits this with a single button and stores a boolean
 * (console-pipeline.js:1325-1331) — there is nowhere in a demo for five readings
 * to go. Here weight and height land on the client record at promotion, so the
 * numbers are actually typed, and every one of them is bounded by
 * `inbodySchema`: a typo of 1750 for a height in cm is the commonest key-in error
 * there is, and it silently poisons every BMI drawn from it afterwards.
 *
 * THE SAME SCHEMA CHECKS BOTH SIDES. The sentence shown before saving and the
 * sentence a refusal returns are built by the same zod object, so they cannot
 * drift apart.
 */

const FIELDS: { key: keyof InbodyInput; label: string; hint: string }[] = [
  { key: 'weightKg', label: 'Weight', hint: 'kg · 20 to 400' },
  { key: 'heightCm', label: 'Height', hint: 'cm · 80 to 250' },
  { key: 'bodyFatPct', label: 'Body fat', hint: 'per cent · 1 to 80' },
  { key: 'skeletalMuscleKg', label: 'Skeletal muscle', hint: 'kg · 5 to 120' },
  { key: 'visceralFat', label: 'Visceral fat', hint: 'level · 1 to 60' },
];

export function InBodySheet({
  a,
  open,
  onClose,
}: {
  a: Arrival;
  open: boolean;
  onClose: () => void;
}) {
  const keyIn = useKeyInBody();
  const toast = useToast();
  /* held as typed text, not as numbers: an empty box is not a zero, and a
     half-typed "1." is not NaN yet */
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  const submit = () => {
    const parsed = schemas.inbodySchema.safeParse(
      Object.fromEntries(FIELDS.map((f) => [f.key, Number(values[f.key])])),
    );
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = FIELDS.find((f) => f.key === issue?.path[0]);
      setError(
        field ? `${field.label} — ${issue?.message ?? 'is not a reading'} (${field.hint}).` : 'Every reading is required.',
      );
      return;
    }

    keyIn.mutate(
      { id: a.id, ...parsed.data },
      {
        onSuccess: () => {
          setValues({});
          setError('');
          onClose();
          toast('Values committed. The client sees them read-only in their profile.');
        },
        onError: (e) => setError((e as Error).message),
      },
    );
  };

  return (
    <Sheet open={open} onClose={onClose} label="InBody key-in">
      <div className="h1">InBody key-in — {a.name}</div>
      <p className="sub">
        Read them off the sheet as printed. Weight and height follow {a.name.split(' ')[0]} onto
        their client record when they are moved across.
      </p>

      {error ? <Notice kind="bad">{error}</Notice> : null}

      <div className="ob-cap">
        {FIELDS.map((f) => (
          <div className="row" key={f.key}>
            <span className="grow">
              <b>{f.label}</b>
              {/* `small` is block-level only inside a `.trow`; this is a `.row`,
                  so the unit line is made a block explicitly */}
              <small style={{ display: 'block' }}>{f.hint}</small>
            </span>
            <input
              className="input sel num"
              type="number"
              inputMode="decimal"
              value={values[f.key] ?? ''}
              aria-label={`${f.label} — ${f.hint}`}
              onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
            />
          </div>
        ))}
      </div>

      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 'var(--s3)' }}>
        <button type="button" className="btn sm ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn sm" disabled={keyIn.isPending} onClick={submit}>
          Commit the readings
        </button>
      </div>

      <p className="audit" style={{ marginTop: 'var(--s2)' }}>
        Committing this ticks the task it belongs to — doing the work is what ticks it.
      </p>
    </Sheet>
  );
}
