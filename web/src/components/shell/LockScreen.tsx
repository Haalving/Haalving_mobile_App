'use client';

import { useEffect, useRef } from 'react';

import { Icon } from '@/components/icons/Icon';
import { api } from '@/lib/api';
import { useSession } from '@/store/session.store';

/**
 * The refusal, worded exactly as the demo words it.
 *
 * It renders INSIDE the console shell, so the sidebar and the page frame stay:
 * being refused is not the same as being lost, and the difference matters when
 * someone is working out why. The demo does the same thing for the same reason.
 *
 * The screen promises the attempt was logged, so it reports it. Once per path
 * per mount — a re-render must not write a second audit row for one refusal.
 */
export function LockScreen({ path }: { path: string }) {
  const role = useSession((s) => s.role);
  const reported = useRef<string | null>(null);

  useEffect(() => {
    if (!role || reported.current === path) return;
    reported.current = path;
    const view = path.split('/').filter(Boolean)[0] ?? '';
    void api.post('/audit/denied', { path, view }).catch(() => {
      /* the refusal stands whether or not the log write lands — the user must
         never see a different screen because an audit row failed */
    });
  }, [role, path]);

  return (
    <div className="lock">
      <span className="big" aria-hidden="true" style={{ color: 'var(--ink-3)' }}>
        <Icon name="lock" />
      </span>
      <div>
        Not available for your role{role ? ` (${role.title})` : ''}.
        <br />
        <span className="audit">This access attempt was logged.</span>
      </div>
    </div>
  );
}
