'use client';

import { CHAIN_LABELS, STORABLE_ROLE_KEYS, roleTitle, type ChainKind } from '@haalving/shared';

import { Icon } from '@/components/icons/Icon';
import { Notice, useToast } from '@/components/ui';
import { useSetChain, type ChainRow } from '@/features/config/queries';

/**
 * The Chains tab — the sequence of signatures an item collects before it
 * publishes, and the last signature is what publishes it.
 *
 * Ported from `chainsHtml` / `wireChains` (console-config.js:292-380). The server
 * refuses an empty chain and a role appearing twice, so the `Add step…` select
 * only offers roles the chain does not already hold — the UI narrows the choice,
 * the API enforces it.
 */

/* every seat a chain or an escalation can name. STORABLE_ROLE_KEYS already drops
   `ai` — it is not a seat anybody signs from — so only `client` is filtered here. */
const ROLE_OPTIONS = STORABLE_ROLE_KEYS.filter((k) => k !== 'client').map((key) => ({
  key,
  title: roleTitle(key),
}));

export function ChainsTab({ chains, canEdit }: { chains: ChainRow[]; canEdit: boolean }) {
  const save = useSetChain();
  const toast = useToast();

  const write = (kind: string, steps: Array<{ role: string }>) =>
    save.mutate(
      { kind, steps },
      {
        onSuccess: () => toast('Saved.'),
        /* the server's own sentence — "A role can only appear once in a chain." */
        onError: (e) => toast((e as Error).message),
      },
    );

  return (
    <div className="cfg-chains">
      <Notice>
        Chain edits apply to new submissions only — anything already collecting signatures keeps the
        chain it started with.
      </Notice>

      {chains.map((c) => {
        const taken = new Set(c.steps.map((s) => s.role));
        const available = ROLE_OPTIONS.filter((r) => !taken.has(r.key));

        const move = (i: number, delta: number) => {
          const next = [...c.steps];
          const j = i + delta;
          if (j < 0 || j >= next.length) return;
          [next[i], next[j]] = [next[j]!, next[i]!];
          write(c.kind, next);
        };

        return (
          <div className="card" style={{ marginTop: 'var(--s3)' }} key={c.kind}>
            <span className="k">{CHAIN_LABELS[c.kind as ChainKind] ?? c.kind}</span>

            <div className="row" style={{ gap: 'var(--s2)', flexWrap: 'wrap', marginTop: 'var(--s3)' }}>
              {c.steps.map((s, i) => (
                <span className="chip" key={`${s.role}-${i}`}>
                  Step {i + 1} · {roleTitle(s.role)}
                  {canEdit ? (
                    <>
                      {i > 0 ? (
                        <button type="button" aria-label={`Move ${roleTitle(s.role)} earlier`} onClick={() => move(i, -1)}>
                          <Icon name="chevL" />
                        </button>
                      ) : null}
                      {i < c.steps.length - 1 ? (
                        <button type="button" aria-label={`Move ${roleTitle(s.role)} later`} onClick={() => move(i, 1)}>
                          <Icon name="chevR" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        data-ch-rm=""
                        aria-label={`Remove ${roleTitle(s.role)}`}
                        onClick={() => write(c.kind, c.steps.filter((_x, j) => j !== i))}
                      >
                        <Icon name="x" />
                      </button>
                    </>
                  ) : null}
                </span>
              ))}
            </div>

            {canEdit && available.length ? (
              <div className="cfg-addrow">
                <select
                  className="input"
                  value=""
                  aria-label={`Add a step to ${CHAIN_LABELS[c.kind as ChainKind] ?? c.kind}`}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    write(c.kind, [...c.steps, { role: e.target.value }]);
                  }}
                >
                  <option value="">Add step…</option>
                  {available.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.title}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        );
      })}

      <p className="audit" style={{ marginTop: 'var(--s3)' }}>
        Each chain is the sequence of signatures an item must collect before it publishes — the last
        signature publishes it.
      </p>
    </div>
  );
}
