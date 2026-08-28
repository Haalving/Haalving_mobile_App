'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { ToastProvider } from '@/components/ui';
import { makeQueryClient } from '@/lib/queryClient';

/**
 * `useState` rather than a module-level client: in the App Router the module can
 * be evaluated per request on the server, and a shared client would leak one
 * user's cached data into another's render.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
