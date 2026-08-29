'use client';

import { STORABLE_ROLE_KEYS, roleTitle } from '@haalving/shared';

import { Notice, Num, useToast } from '@/components/ui';
import { useSetService, type ServiceConfig } from '@/features/config/queries';

/**
 * The Service tab — the meal reply ladder and who is answerable.
 *
 * Ported from `serviceHtml` / `wireService` (console-config.js:200-274).
 *
 * THESE NUMBERS ARE LIVE, not versioned like the program shape: the meals queue
 * counts every awaiting photo against the reply target on every request, and Time
 * & Cover routes leave to the approver named here. So each control saves on
 * change and the audit line says so.
 */

/* every seat a chain or an escalation can name. STORABLE_ROLE_KEYS already drops
   `ai` — it is not a seat anybody signs from — so only `client` is filtered here. */
const ROLE_OPTIONS = STORABLE_ROLE_KEYS.filter((k) => k !== 'client').map((key) => ({
  key,
  title: roleTitle(key),
}));

export function ServiceTab({ service, canEdit }: { service: ServiceConfig; canEdit: boolean }) {
  const save = useSetService();
  const toast = useToast();

  const set = (patch: Partial<ServiceConfig>) =>
    save.mutate(patch, {
      onSuccess: () => toast('Saved.'),
      onError: (e) => toast((e as Error).message),
    });

  const numRow = (
    label: string,
    sub: string,
    field: 'replyTargetMin' | 'notifyAfterMin' | 'escalateAfterMin',
  ) => (
    <div className="trow">
      <span className="grow">
        <b>{label}</b>
        <small>{sub}</small>
      </span>
      {canEdit ? (
        <input
          className="input num cfg-num"
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          defaultValue={service[field]}
          aria-label={label}
          /* on BLUR, not on every keystroke: a number typed digit by digit would
             otherwise save 2 on its way to 20 */
          onBlur={(e) => {
            const v = Number(e.target.value);
            if (v && v !== service[field]) set({ [field]: v } as Partial<ServiceConfig>);
          }}
        />
      ) : (
        <span className="num">{service[field]}</span>
      )}
    </div>
  );

  const roleRow = (
    label: string,
    sub: string,
    field: 'escalateToRole' | 'approverRole',
  ) => (
    <div className="trow">
      <span className="grow">
        <b>{label}</b>
        <small>{sub}</small>
      </span>
      {canEdit ? (
        <select
          className="input"
          defaultValue={service[field]}
          aria-label={label}
          onChange={(e) => set({ [field]: e.target.value } as Partial<ServiceConfig>)}
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r.key} value={r.key}>
              {r.title}
            </option>
          ))}
        </select>
      ) : (
        <span>{roleTitle(service[field])}</span>
      )}
    </div>
  );

  return (
    <>
      <Notice>
        These numbers drive live behaviour: the meals queue counts every awaiting photo against the
        reply target, and Time &amp; Cover routes leave to the approver named here.
      </Notice>

      <div className="card" style={{ marginTop: 'var(--s3)' }}>
        <span className="k">Meal reply ladder</span>
        <div className="list" style={{ marginTop: 'var(--s3)' }}>
          {numRow('Reply target', 'The clock every awaiting meal photo is judged against', 'replyTargetMin')}
          {numRow('Nudge after', 'Minutes of silence before the responsible dietitian is nudged', 'notifyAfterMin')}
          {numRow('Escalate after', 'Minutes past the nudge before the miss escalates upward', 'escalateAfterMin')}
        </div>
        <p className="audit" style={{ marginTop: 'var(--s3)' }}>
          The ladder as configured: <Num>{service.replyTargetMin}</Num> min target · nudge at{' '}
          <Num>{service.notifyAfterMin}</Num> min · escalate at{' '}
          {/* the escalation is counted FROM the nudge, so the line adds them */}
          <Num>{service.notifyAfterMin + service.escalateAfterMin}</Num> min · to{' '}
          {roleTitle(service.escalateToRole)}.
        </p>
      </div>

      <div className="card" style={{ marginTop: 'var(--s4)' }}>
        <span className="k">Who is answerable</span>
        <div className="list" style={{ marginTop: 'var(--s3)' }}>
          {roleRow(
            'Escalations go to',
            'Every user in this role is notified when a meal blows past the ladder',
            'escalateToRole',
          )}
          {roleRow(
            'Leave approver',
            'This role sees the Approvals tab in Time & Cover and signs every leave',
            'approverRole',
          )}
        </div>
        <p className="audit" style={{ marginTop: 'var(--s3)' }}>
          {canEdit
            ? 'Saved on change — the meals queue and Time & Cover read these live. No engineering involved.'
            : 'Read-only for your role. Editing service levels needs Super Admin or Operations Head access.'}
        </p>
      </div>
    </>
  );
}
