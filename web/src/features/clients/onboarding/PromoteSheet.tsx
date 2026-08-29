'use client';

import { useRouter } from 'next/navigation';

import { Num, Sheet, useToast } from '@/components/ui';
import { usePromote, type Arrival } from '@/features/clients/onboarding/queries';

/**
 * Promotion — the rail's one irreversible step, and the only place in the console
 * that mints a client.
 *
 * IT ASKS FIRST. Everything else on this screen can be undone by a second click:
 * a tick unticks, a closed step steps back, a crumb only moves the lens. This one
 * writes a User, a Client, four pod seats and a Care Circle, and there is no
 * button anywhere that takes it back — so it is the one action that stops and
 * makes somebody say yes.
 *
 * On success the reader is taken to the record that now exists. Onboarding is
 * behind them; the rail they return to is Onboarded, because the URL that names
 * the Onboarding tab is left behind with it.
 */

export function PromoteSheet({ a, onClose }: { a: Arrival; onClose: () => void }) {
  const promote = usePromote();
  const router = useRouter();
  const toast = useToast();

  const first = a.name.split(' ')[0];

  const go = () =>
    promote.mutate(a.id, {
      onSuccess: (r) => {
        onClose();
        toast(`${r.name} is a client. Day 1 of Level 1 starts today.`);
        router.push(`/clients/${r.clientId}`);
      },
      /* the server re-reads the SOP before it writes anything, and its sentence
         names the step that is still open */
      onError: (e) => toast((e as Error).message),
    });

  return (
    <Sheet open onClose={onClose} label={`Move ${a.name} to Onboarded`}>
      <div className="h1">Move {a.name} to Onboarded</div>
      <p className="sub">
        All <Num>12</Num> steps of the SOP are closed. Moving {first} across creates their client
        record, opens their Care Circle and starts Day 1 of Level 1.
      </p>

      <p className="sub" style={{ marginTop: 'var(--s3)' }}>
        Their coaches take up the seats you allocated, and the load they carry moves with them —
        which is why it was never counted until now.
      </p>

      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 'var(--s4)' }}>
        <button type="button" className="btn sm ghost" onClick={onClose}>
          Not yet
        </button>
        <button type="button" className="btn sm" disabled={promote.isPending} onClick={go}>
          Start Level 1 · move to Onboarded
        </button>
      </div>

      <p className="audit" style={{ marginTop: 'var(--s3)' }}>
        This is the one step on the rail that cannot be taken back.
      </p>
    </Sheet>
  );
}
