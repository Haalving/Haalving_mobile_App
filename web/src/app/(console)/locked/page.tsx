'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { LockScreen } from '@/components/shell/LockScreen';

/**
 * Where the edge gate sends a refused navigation.
 *
 * It sits INSIDE the console group on purpose, so it renders within the shell
 * with the sidebar intact — the demo refuses the same way, and a full-page
 * takeover would read as "you are logged out" rather than "not this page".
 */
function Locked() {
  const params = useSearchParams();
  return <LockScreen path={params.get('from') ?? '/'} />;
}

export default function LockedPage() {
  return (
    <Suspense fallback={null}>
      <Locked />
    </Suspense>
  );
}
