'use client';

import { Avatar, Num, Pill, SkeletonRows, useToast } from '@/components/ui';
import { useCapacityRows, useSetCap } from '@/features/people/queries';

/**
 * Capacity — how many clients each seat carries, and the ceiling they declared.
 *
 * DECLARED, NEVER DERIVED. Vikram reads 50 of 50 and FULL while carrying six
 * clients in the database, and that is correct rather than a bug to tidy: what
 * fills up is his WEEK. Nothing on this page counts pod seats to produce either
 * number.
 *
 * `full` is the one derived value, and it is derived from the two numbers on the
 * row rather than stored — a third number could disagree with them.
 */
export function CapacityTab({ canEdit }: { canEdit: boolean }) {
  const { data, isLoading } = useCapacityRows();
  const setCap = useSetCap();
  const toast = useToast();

  if (isLoading) return <SkeletonRows rows={5} height={72} />;

  return (
    <div className="card">
      <div className="list">
        {(data ?? []).map((c) => {
          const pct = c.cap > 0 ? Math.min(100, Math.round((c.load / c.cap) * 100)) : 0;
          return (
            <div className="trow" key={c.staffId}>
              <Avatar name={c.name} />
              <span className="grow" style={{ flex: 1, minWidth: 0 }}>
                <b>
                  {c.roleLabel}: {c.name}
                </b>
                <small style={{ display: 'block' }}>
                  <Num>{c.load}</Num> allocated
                </small>
                {/* the bar, danger when the week is full */}
                <span
                  aria-hidden="true"
                  style={{
                    display: 'block',
                    height: 4,
                    borderRadius: 'var(--r-full)',
                    background: 'var(--surface-2)',
                    marginTop: 'var(--s1)',
                  }}
                >
                  <span
                    style={{
                      display: 'block',
                      width: `${pct}%`,
                      height: '100%',
                      borderRadius: 'var(--r-full)',
                      background: c.full ? 'var(--danger)' : 'var(--brand)',
                    }}
                  />
                </span>
              </span>

              {c.full ? <Pill kind="bad">Full</Pill> : null}

              {canEdit ? (
                <input
                  className="input num cfg-num"
                  type="number"
                  min={1}
                  max={500}
                  defaultValue={c.cap}
                  aria-label={`Capacity for ${c.name}`}
                  /* on blur, not per keystroke — a ceiling typed digit by digit
                     would otherwise save 5 on its way to 55 */
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (v && v !== c.cap) {
                      setCap.mutate(
                        { staffId: c.staffId, cap: v },
                        {
                          onSuccess: () => toast('Saved.'),
                          onError: (err) => toast((err as Error).message),
                        },
                      );
                    }
                  }}
                />
              ) : (
                <span className="num">{c.cap}</span>
              )}
            </div>
          );
        })}
      </div>

      <p className="audit" style={{ marginTop: 'var(--s3)' }}>
        Edits apply to the allocation picker immediately. One-off exceptions belong in the override
        flow, where the reason is logged.
      </p>
    </div>
  );
}
