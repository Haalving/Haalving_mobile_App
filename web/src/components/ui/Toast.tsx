'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * The toast — `HV.toast`, ported.
 *
 * ONE polite live region for the whole app, mounted once. The demo learned this
 * the hard way: a live region wrapping the app re-announced every keystroke and
 * every slider tick, so the announcement moved to a single `#toast-root` and
 * dialogs announce through focus management instead.
 *
 * 2600ms, matching the demo — long enough to read a sentence, short enough not
 * to sit over the thing you just did.
 */

interface ToastItem {
  id: number;
  message: string;
}

const ToastContext = createContext<(message: string) => void>(() => {});

export function useToast(): (message: string) => void {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  /*
   * The portal waits for mount.
   *
   * `typeof document !== 'undefined'` is TRUE during hydration, so guarding on it
   * alone renders #toast-root on the client's first pass while the server HTML
   * has no such node — React sees a tree that does not match, throws away the
   * markup and re-renders the whole page. Mounting on an effect is what keeps
   * the first client render identical to the server's.
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const toast = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, message }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 2600);
  }, []);

  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted
        ? createPortal(
            <div id="toast-root" role="status" aria-live="polite">
              {items.map((t) => (
                <div key={t.id} className="toast">
                  {t.message}
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}
