'use client';

import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * The bottom sheet — `HV.sheet` / `HV.closeSheet`, ported.
 *
 * EVERY DIALOG OWNS THE KEYBOARD WHILE OPEN: focus moves in, Tab cannot leave,
 * Escape closes, and the trigger gets the keyboard back afterwards. The demo
 * learned each of those separately and the port keeps all four — a modal that
 * leaves focus on the page beneath is unusable with a keyboard and invisible to
 * a screen reader.
 *
 * The listener is on the DOCUMENT, not the overlay: a view may rewrite the
 * sheet's own contents (the task pager does) and drop focus to <body>, and
 * Escape and Tab have to keep working from there.
 */

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** 'tall' fills the bottom 90% — the task-sheet size. */
  variant?: 'tall';
  /** Labels the dialog when it has no `.h1` of its own. */
  label?: string;
}

export function Sheet({ open, onClose, children, variant, label }: SheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    if (!open) return;

    returnFocus.current = document.activeElement as HTMLElement | null;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        return;
      }
      if (e.key !== 'Tab') return;

      const sheet = sheetRef.current;
      if (!sheet) return;
      const f = sheet.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!f.length) return;

      const first = f[0]!;
      const last = f[f.length - 1]!;
      const out = !sheet.contains(document.activeElement);

      if (e.shiftKey && (out || document.activeElement === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (out || document.activeElement === last)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);

    /* focus lands inside on open — otherwise the keyboard is still on the page
       beneath and Tab walks a list the user cannot see */
    const sheet = sheetRef.current;
    const first = sheet?.querySelector<HTMLElement>(FOCUSABLE);
    if (first) first.focus();
    else sheet?.focus();

    return () => {
      document.removeEventListener('keydown', onKey);
      const back = returnFocus.current;
      if (back && document.contains(back)) back.focus();
      returnFocus.current = null;
    };
  }, [open, close]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={sheetRef}
        className={`sheet${variant ? ` ${variant}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
