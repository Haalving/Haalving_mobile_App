'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

/**
 * POD NOTES — the pod's private lane about one client.
 *
 * WHAT THE POD SAYS TO THE POD, and the one object on this record the client
 * must never see. It is not a circle message (which the client reads), not a
 * client log (which is the record of what HAPPENED), and not an attention ticket
 * (which is work somebody owes). It is the handover sentence a coach leaves for
 * the next specialist: "she cried when we got to the sleep questions — go gently
 * there."
 *
 * THE CONFIDENTIALITY IS THE SERVER'S, NOT THIS MODULE'S. Nothing here is what
 * keeps a client out: `podnote.service.ts` refuses the `client` role outright,
 * ahead of scoping, because scope would resolve a client to their own record and
 * answer TRUE. These notes are reachable only through the console's own
 * `/clients/:id/pod-notes`, and no client-facing API returns them. If this file
 * were deleted the guarantee would be unchanged — which is the test of whether
 * it was ever a real one.
 *
 * WHO MAY CHANGE ONE IS A FACT ABOUT THE ROW, not about the reader: its author,
 * or a seat holding `managePeople`. The panel draws controls on that basis and
 * the server decides it again, recording the refusal in the audit trail.
 */

export interface PodNote {
  id: string;
  content: string;
  /** Null once its writer has left the building — the note outlives the seat. */
  author: { id: string; name: string; role: string } | null;
  createdAt: string;
  /** Stamped only by a human edit, so the panel can say "edited" and mean it. */
  editedAt: string | null;
}

/** The API's own ceiling, restated so the composer can count down to it. */
export const POD_NOTE_MAX = 4000;

const key = (clientId: string) => ['clients', clientId, 'pod-notes'] as const;

export function usePodNotes(clientId: string) {
  return useQuery({
    queryKey: key(clientId),
    queryFn: () => api.get<PodNote[]>(`/clients/${clientId}/pod-notes`),
  });
}

/**
 * Every write refetches the panel rather than patching the cache by hand.
 *
 * The list is short, it is read by a pod rather than by one person, and a
 * colleague's note arriving between this render and the next is exactly the
 * thing the panel exists to show. An optimistic splice would hide it until
 * something else happened to refetch.
 */
function useInvalidate(clientId: string): () => void {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: key(clientId) });
  };
}

export function useAddPodNote(clientId: string) {
  const invalidate = useInvalidate(clientId);
  return useMutation({
    mutationFn: (content: string) =>
      api.post<PodNote>(`/clients/${clientId}/pod-notes`, { content }),
    onSuccess: invalidate,
  });
}

/**
 * An edit REPLACES the note — there is no partial, because there is only one
 * field a human owns and a PATCH that could omit it would change nothing.
 */
export function useEditPodNote(clientId: string) {
  const invalidate = useInvalidate(clientId);
  return useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      api.patch<PodNote>(`/clients/${clientId}/pod-notes/${id}`, { content }),
    onSuccess: invalidate,
  });
}

/**
 * A SOFT delete: the panel stops showing it, the record keeps it.
 *
 * Somebody removing a line cannot remove the reason a decision was made — the
 * service's own words. A second delete is a 404 rather than a silent re-stamp.
 */
export function useDeletePodNote(clientId: string) {
  const invalidate = useInvalidate(clientId);
  return useMutation({
    mutationFn: (id: string) => api.del<{ id: string }>(`/clients/${clientId}/pod-notes/${id}`),
    onSuccess: invalidate,
  });
}
