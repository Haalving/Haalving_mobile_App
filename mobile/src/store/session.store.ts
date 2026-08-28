import { create } from 'zustand';

import { setAccessToken, setRefreshToken } from '@/api/client';

/**
 * The signed-in client.
 *
 * The role comes from the SERVER on every boot, exactly as the console's does —
 * one source, so a change reaches both apps the same way.
 */
export interface SessionUser {
  id: string;
  name: string;
  phone: string | null;
  role: string;
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
  /** false until the first /me settles — distinct from "signed out". */
  ready: boolean;
  setSession: (user: SessionUser, role: SessionRole) => void;
  clear: () => Promise<void>;
  setReady: (ready: boolean) => void;
}

export const useSession = create<SessionState>((set) => ({
  user: null,
  role: null,
  ready: false,
  setSession: (user, role) => set({ user, role, ready: true }),
  clear: async () => {
    setAccessToken(null);
    await setRefreshToken(null);
    set({ user: null, role: null, ready: true });
  },
  setReady: (ready) => set({ ready }),
}));
