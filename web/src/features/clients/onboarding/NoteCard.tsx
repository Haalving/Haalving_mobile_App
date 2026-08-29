'use client';

import { useState } from 'react';

import { useToast } from '@/components/ui';
import { useUpdateArrival, type Arrival } from '@/features/clients/onboarding/queries';

/**
 * The onboarding note — `workspaceHtml`'s note card (console-pipeline.js:911-916).
 *
 * A DRAFT IS NOT A SAVE. The textarea holds what is being typed and the button is
 * what writes it, because a note that saved on every keystroke would put a
 * half-sentence on the record and an event in the log for each one. A coach reads
 * it and cannot change it, which is the same line the plan card draws.
 */

export function NoteCard({ a }: { a: Arrival }) {
  const update = useUpdateArrival();
  const toast = useToast();
  const [draft, setDraft] = useState(a.note ?? '');

  return (
    <div className="card">
      <span className="k">Note</span>
      <textarea
        className="input"
        rows={2}
        value={draft}
        readOnly={!a.canRun}
        aria-label="Onboarding note"
        onChange={(e) => setDraft(e.target.value)}
      />
      {a.canRun ? (
        <div className="row" style={{ marginTop: 'var(--s2)' }}>
          <button
            type="button"
            className="btn sm"
            disabled={update.isPending || draft === (a.note ?? '')}
            onClick={() =>
              update.mutate(
                { id: a.id, note: draft.trim() },
                {
                  onSuccess: () => toast('Note saved.'),
                  onError: (e) => toast((e as Error).message),
                },
              )
            }
          >
            Save note
          </button>
        </div>
      ) : null}
    </div>
  );
}
