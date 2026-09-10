'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A TRAY HUNG OFF A CORNER BUTTON — the bell's and the chats' shared behaviour.
 *
 * Opens under the button, hanging from its right edge, when the button sits in
 * the right half of the screen (the desktop corner); beside it when it sits on
 * the left (the sidebar drawer). A click anywhere else closes it, except inside
 * a Sheet the tray itself opened — those render through a portal, outside the
 * tray's DOM — and Escape closes it unless a Sheet on top owns Escape. On a
 * phone the tray is placed by CSS under the topbar and `at` stays null.
 */

export interface TrayAt {
  left?: number;
  right?: number;
  top: number;
}

export function useCornerTray() {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<TrayAt | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const tray = useRef<HTMLDivElement>(null);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const r = btn.current?.getBoundingClientRect();
    if (r && window.innerWidth > 860) {
      setAt(
        r.left > window.innerWidth / 2
          ? { right: Math.round(window.innerWidth - r.right), top: Math.round(r.bottom + 8) }
          : { left: Math.round(r.right + 10), top: Math.round(Math.max(8, r.top - 4)) },
      );
    } else {
      setAt(null);
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (tray.current?.contains(t) || btn.current?.contains(t)) return;
      if ((t as Element).closest?.('.overlay')) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('.overlay')) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return { open, at, btn, tray, toggle, close: () => setOpen(false) };
}
