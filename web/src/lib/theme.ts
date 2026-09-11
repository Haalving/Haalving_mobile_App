'use client';

import { useEffect, useSyncExternalStore } from 'react';

/**
 * THE THEME CHOICE — System, Light or Dark, remembered on this browser.
 *
 * The palettes live in tokens.css: light on bare `:root`, dark behind the
 * system's "prefers dark" AND behind `[data-theme="dark"]`; an explicit
 * `[data-theme="light"]` wins over a dark system. So the whole switch is one
 * attribute on `<html>`. It is applied twice: once by the inline script in the
 * root layout, before the first paint, so a dark reader never sees a light
 * flash; and again here whenever the choice changes.
 *
 * Kept per browser, not per account, on purpose: the same person reads on a
 * bright desk by day and a dim laptop at night, and that is a property of the
 * screen, not of the account.
 */
export type Theme = 'system' | 'light' | 'dark';

export const THEME_KEY = 'hv.theme';
const ORDER: Theme[] = ['system', 'light', 'dark'];

export const THEME_LABEL: Record<Theme, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

function read(): Theme {
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(t: Theme): void {
  const el = document.documentElement;
  if (t === 'system') el.removeAttribute('data-theme');
  else el.setAttribute('data-theme', t);
}

const listeners = new Set<() => void>();
let current: Theme | null = null;

function get(): Theme {
  if (current === null) current = typeof window === 'undefined' ? 'system' : read();
  return current;
}

export function setTheme(t: Theme): void {
  current = t;
  try {
    if (t === 'system') window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, t);
  } catch {
    /* private mode: the choice lasts the tab */
  }
  applyTheme(t);
  listeners.forEach((l) => l());
}

/** The next stop on the button: System → Light → Dark → System. */
export function nextTheme(t: Theme): Theme {
  return ORDER[(ORDER.indexOf(t) + 1) % ORDER.length] ?? 'system';
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function useTheme(): Theme {
  const t = useSyncExternalStore(subscribe, get, () => 'system' as Theme);
  /* the boot script already set the attribute; this keeps it right after a
     hot reload or a storage change from another tab */
  useEffect(() => {
    applyTheme(get());
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_KEY) {
        current = read();
        applyTheme(current);
        listeners.forEach((l) => l());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  return t;
}
