'use client';

import { create } from 'zustand';

import { setAccessToken } from '@/lib/api';

/**
 * The signed-in person and their role definition.
 *
 * The role comes from the SERVER on every boot — `/me` reads the Role table — so
 * a Configuration edit reaches the sidebar without a deploy, and a role change
 * takes effect on the user's next page load rather than whenever their cached
 * copy happens to expire.
 *
 * Nothing here is persisted. The access token is memory-only (see lib/api.ts)
 * and the session is recovered by calling /auth/refresh against the httpOnly
 * cookie, which is the only durable half.
 */

export interface SessionUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  subtitle: string | null;
  dept: string | null;
  level: number | null;
  status: string;
}

export interface SessionRole {
  key: string;
  title: string;
  shell: string;
  home: string;
  nav: string[];
  perms: string[];
}

interface SessionState {
  user: SessionUser | null;
  role: SessionRole | null;
  /** null until the first /me settles — distinct from "signed out". */
  ready: boolean;
  setSession: (user: SessionUser, role: SessionRole) => void;
  clear: () => void;
  setReady: (ready: boolean) => void;
}

export const useSession = create<SessionState>((set) => ({
  user: null,
  role: null,
  ready: false,
  setSession: (user, role) => set({ user, role, ready: true }),
  clear: () => {
    setAccessToken(null);
    set({ user: null, role: null, ready: true });
  },
  setReady: (ready) => set({ ready }),
}));
