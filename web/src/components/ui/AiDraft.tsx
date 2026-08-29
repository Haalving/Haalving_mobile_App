import type { ReactNode } from 'react';

import { Icon } from '@/components/icons/Icon';

/**
 * The AI-draft container — `HV.ui.aidraft` (core.js:2658), ported.
 *
 * THE LABEL IS THE POINT. Anything a machine wrote is inside this box and says
 * so, above the words themselves, before a human reads them — the product's one
 * boundary between what the AI suggests and what a coach decides. A draft that
 * arrived without the frame would be a coach's sentence in the client's eyes,
 * and there would be no way to tell afterwards which it had been.
 *
 * The markup is the demo's, because `.aidraft`, `.lbl` and `.acts` are styled by
 * class — the tint, the border and the 13px sparkle all hang off this structure.
 */
export function AiDraft({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="aidraft">
      <span className="lbl">
        <Icon name="sparkle" /> AI draft — review before use
      </span>
      {children}
      {actions ? <div className="acts">{actions}</div> : null}
    </div>
  );
}
