'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError, api } from '@/lib/api';

/**
 * The Follow-ups board — its one read, and every write that can move a line on it.
 *
 * ONE MODULE, because all nine writes share the same invalidation rule and the
 * same list key. Spread across the components that call them, a near-miss on
 * that key is invisible until it is embarrassing: the send succeeds, the server
 * agrees, and the row is still sitting on the board.
 *
 * THE SERVER OWNS THE ORDER AND THE SCOPE. `/followups` answers already grouped
 * — PENDING_APPROVAL, RETURNED, DRAFT, SENT, newest first inside each group —
 * for the clients this caller carries and nobody else's. Nothing here re-sorts
 * it and nothing here widens it; the tab only ever partitions the list it was
 * given, exactly as the Attention board does (attention/queries.ts:31-36).
 */

/** A named human on a follow-up: its author, its sender, or its approver. */
export interface FollowupPerson {
  id: string;
  name: string;
}

export interface FollowupRow {
  id: string;
  clientId: string;
  text: string;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'RETURNED' | 'SENT';
  source: 'AI' | 'COACH';
  /** Why an approver sent it back. Only ever set on a RETURNED row. */
  returnNote: string | null;
  /** Not yet seen by THIS user on this tab. Always false once SENT. */
  fresh: boolean;
  client: { id: string; name: string };
  /** The coach who wrote it. Null on an AI draft — nobody wrote it. */
  createdBy: FollowupPerson | null;
  sentBy: FollowupPerson | null;
  approvedBy: FollowupPerson | null;
  createdAt: string;
}

/**
 * The five reasons a draft can be dismissed, IN THE ORDER THE SHEET SHOWS THEM
 * (console-digest.js:647).
 *
 * AN ORDERED ARRAY, not a Record. The demo's chip order is the order a coach
 * reads — the commonest reason first — and that is a designed sequence, not an
 * incidental one; object key order is not a thing to bet a rendered list on.
 *
 * `code` is what the API records and what the copilot is later trained on;
 * `label` is the demo's own wording, and the two are paired here so a sheet can
 * never show one reason and log another.
 */
export const DISMISS_REASONS = [
  { code: 'ALREADY_HANDLED_IN_PERSON', label: 'Already handled in person' },
  { code: 'CLIENT_REACHED_OUT_FIRST', label: 'Client reached out first' },
  { code: 'NOT_THE_RIGHT_MOMENT', label: 'Not the right moment' },
  { code: 'TONE_NEEDS_REWORK', label: 'Tone needs rework' },
  { code: 'DUPLICATE_NUDGE', label: 'Duplicate nudge' },
] as const;

export type DismissReason = (typeof DISMISS_REASONS)[number]['code'];

/**
 * The list key, in the `['home', <tab>]` family the digest already uses
 * (`['home', 'attention']`, attention/queries.ts:33) rather than a
 * resource-shaped `['followups']`.
 *
 * This list is a BOARD OF THE MORNING DIGEST, not a resource collection: it is
 * scoped, grouped and ordered by the server for this one reader on this one
 * day. Filing it beside its siblings says so, and it lets `['home']` invalidate
 * the whole digest at once when a role change moves what the reader may see.
 */
export const FOLLOWUPS_KEY = ['home', 'followups'] as const;

/** The board. Rendered in the order it arrives — see the note at the top. */
export function useFollowups() {
  return useQuery({
    queryKey: FOLLOWUPS_KEY,
    queryFn: () => api.get<FollowupRow[]>('/followups'),
  });
}

/**
 * What every follow-up write invalidates.
 *
 * The list, obviously. And `home/summary`, because `fresh.followups` feeds the
 * tab badge and the sidebar count — a row that has just been sent must stop
 * being counted as waiting, or the badge outlives the work it described.
 *
 * Note this is the OPPOSITE of `useMarkSeen`, which marks the summary stale
 * WITHOUT refetching (attention/queries.ts:92). Reading a row is not a change
 * to it, so the counts are allowed to lag a render there. Sending one is, so
 * they are not.
 */
function useInvalidateFollowups(): () => void {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: FOLLOWUPS_KEY });
    void qc.invalidateQueries({ queryKey: ['home', 'summary'] });
  };
}

export interface CreateFollowupVars {
  clientId: string;
  text: string;
  /** Omitted entirely on the approval path — never sent as `false`. */
  sendNow?: boolean;
}

/** A coach's own follow-up: the one line on this board the copilot did not write. */
export function useCreateFollowup() {
  const invalidate = useInvalidateFollowups();
  return useMutation({
    mutationFn: (vars: CreateFollowupVars) => api.post<FollowupRow>('/followups', vars),
    onSuccess: invalidate,
  });
}

export function useEditFollowup() {
  const invalidate = useInvalidateFollowups();
  return useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      api.patch<FollowupRow>(`/followups/${id}`, { text }),
    onSuccess: invalidate,
  });
}

export function useSendFollowup() {
  const invalidate = useInvalidateFollowups();
  return useMutation({
    mutationFn: (id: string) => api.post<FollowupRow>(`/followups/${id}/send`, {}),
    onSuccess: invalidate,
  });
}

export function useApproveFollowup() {
  const invalidate = useInvalidateFollowups();
  return useMutation({
    /* the contract allows `{ text? }` so an approver can amend as they approve.
       The board never does: it has a full Edit action, and an edit that only
       existed inside an approval would land in the record unattributed. */
    mutationFn: (id: string) => api.post<FollowupRow>(`/followups/${id}/approve`, {}),
    onSuccess: invalidate,
  });
}

/** Send a coach's draft back to its author, carrying the note that says why. */
export function useReturnFollowup() {
  const invalidate = useInvalidateFollowups();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      api.post<FollowupRow>(`/followups/${id}/return`, { note }),
    onSuccess: invalidate,
  });
}

export function useResubmitFollowup() {
  const invalidate = useInvalidateFollowups();
  return useMutation({
    mutationFn: (id: string) => api.post<FollowupRow>(`/followups/${id}/resubmit`, {}),
    onSuccess: invalidate,
  });
}

/**
 * A DISMISSAL IS A RECORD, NOT A DELETE — which is why the reason is a required
 * argument here and not an optional one.
 *
 * The sheet promises "every dismissal is logged so the copilot learns"
 * (console-digest.js:648) and the demo keeps that promise literally, writing the
 * reason before it drops the draft (console-digest.js:672-677). A reason-less
 * dismissal would leave that sentence lying, so the type refuses to express one.
 */
export function useDismissFollowup() {
  const invalidate = useInvalidateFollowups();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: DismissReason }) =>
      api.post<{ ok: true }>(`/followups/${id}/dismiss`, { reason }),
    onSuccess: invalidate,
  });
}

export function useDeleteFollowup() {
  const invalidate = useInvalidateFollowups();
  return useMutation({
    mutationFn: async (id: string) => {
      try {
        await api.del<null>(`/followups/${id}`);
      } catch (err) {
        /*
         * A 204 IS THE SUCCESS, and lib/api.ts cannot say so yet.
         *
         * `parse()` calls `res.json()` on every response before it looks at
         * `res.ok`, and a No Content body has nothing to parse — so a perfectly
         * good delete comes back as ApiError('bad_response'). The thrown error
         * carries the real status, which is the one thing that distinguishes
         * this case from a genuine unreadable reply, so 204 is swallowed and
         * everything else still throws.
         *
         * The real fix is a 204 short-circuit in `parse()`. That file is shared
         * by every read and write in the console, so the narrow guard lives here
         * — beside the one DELETE it protects — and goes away when the general
         * fix lands.
         */
        if (!(err instanceof ApiError) || err.status !== 204) throw err;
      }
    },
    onSuccess: invalidate,
  });
}

/**
 * The bulk path. `ids` are the drafts the reviewer left ticked, and THE SERVER
 * RE-CHECKS EVERY ONE — the sheet's list is a courtesy, not a warrant.
 *
 * It answers `{ sent, skipped }` rather than a bare count, because a draft can
 * move between the sheet opening and the button being pressed: another approver
 * may have sent it, or its author may have withdrawn it. A skip is not an error.
 */
export function useSendAllFollowups() {
  const invalidate = useInvalidateFollowups();
  return useMutation({
    mutationFn: ({ ids }: { ids: string[] }) =>
      api.post<{ sent: number; skipped: number }>('/followups/send-all', { ids }),
    onSuccess: invalidate,
  });
}
