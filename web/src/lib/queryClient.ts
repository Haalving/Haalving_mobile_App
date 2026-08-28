'use client';

import { QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/lib/api';

/**
 * One query client for the console.
 *
 * The retry rule is the part worth reading: a 4xx is an ANSWER, not a failure.
 * Retrying a 403 three times writes three `denied` rows into the audit log for
 * one refused page, which turns a security record into noise. Only genuine
 * transport failures and 5xx are retried.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (error instanceof ApiError && error.status < 500) return false;
          return failureCount < 2;
        },
      },
      mutations: {
        retry: false,
      },
    },
  });
}
