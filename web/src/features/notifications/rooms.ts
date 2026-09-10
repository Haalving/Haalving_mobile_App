'use client';

import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

/**
 * THE ROOMS — every conversation this person is part of, newest word first,
 * as `GET /rooms` serves them (rooms.service.ts). Two kinds in one list: a
 * client's care circle and an onboarding person's thread.
 *
 * `lit` is the call light, not a read receipt: the person wrote last and
 * nobody has answered. That is what an inbox owes a desk.
 */

export interface RoomLast {
  text: string;
  at: string;
  fromKind: 'STAFF' | 'CLIENT' | 'AI';
  from: string | null;
  lane: 'client' | 'team';
}

export interface RoomRow {
  key: string;
  kind: 'client' | 'onboarding';
  id: string;
  name: string;
  plan: string;
  where: string;
  last: RoomLast | null;
  lit: boolean;
}

export interface RoomsPage {
  rows: RoomRow[];
  lit: number;
}

/** Polled, so the badge moves without a reload — faster while the drawer is open. */
export function useRooms(every = 60_000) {
  return useQuery({
    queryKey: ['rooms'],
    queryFn: () => api.get<RoomsPage>('/rooms'),
    refetchInterval: every,
    refetchOnWindowFocus: true,
  });
}

export const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? name;

/** Who said the last line, the way a phone's inbox says it. */
export function said(r: RoomRow): string {
  const l = r.last;
  if (!l) return 'No messages yet';
  const who = l.fromKind === 'CLIENT' ? firstName(r.name) : l.fromKind === 'AI' ? 'AI' : (l.from ?? 'Team');
  return `${who}: ${l.text}`;
}
