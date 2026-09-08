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

  /*
   * FOCUS LANDS INSIDE ONCE, WHEN THE SHEET OPENS — and this effect depends on
   * `open` ALONE, deliberately.
   *
   * It used to also depend on `close`, which meant it re-ran whenever `close`
   * changed identity. `close` wraps the caller's `onClose`, and most callers pass
   * a plain arrow function that is rebuilt on every render — so every keystroke
   * in the sheet re-ran this effect and moved the caret back to the first field.
   * Typing in the second box bounced you to the first, in every form that uses a
   * Sheet.
   *
   * The key-handler below needs the CURRENT `close`; this does not. Splitting
   * them is what keeps both true: the listener may re-bind freely, while focus is
   * placed exactly once per opening.
   */
  useEffect(() => {
    if (!open) return;

    returnFocus.current = document.activeElement as HTMLElement | null;

    /* otherwise the keyboard is still on the page beneath and Tab walks a list
       the user cannot see */
    const sheet = sheetRef.current;
    const first = sheet?.querySelector<HTMLElement>(FOCUSABLE);
    if (first) first.focus();
    else sheet?.focus();

    return () => {
      const back = returnFocus.current;
      if (back && document.contains(back)) back.focus();
      returnFocus.current = null;
    };
  }, [open]);

  /* Escape to close, and Tab kept inside the sheet. Re-binds when `close`
     changes; that is harmless, which is precisely why it is separate. */
  useEffect(() => {
    if (!open) return;

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
    return () => document.removeEventListener('keydown', onKey);
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
