import { useCallback, useEffect, useState } from 'react';

/**
 * Per-person editor appearance: colour theme and which side panels are shown where.
 * Kept in localStorage (not in the poster) because it's about the person's screen,
 * not the document.
 */
export type Theme = 'system' | 'light' | 'dark';

export interface UiPrefs {
  theme: Theme;
  /** true puts the Insert/Layout/Design panel on the right and Properties on the left */
  swapPanels: boolean;
  showTools: boolean;
  showProperties: boolean;
}

export const DEFAULT_PREFS: UiPrefs = { theme: 'system', swapPanels: false, showTools: true, showProperties: true };
export const PREFS_KEY = 'posterhub.ui';

/** Fills in defaults and drops anything malformed (old versions, hand-edited storage). */
export function sanitizePrefs(raw: unknown): UiPrefs {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  return {
    theme: r.theme === 'light' || r.theme === 'dark' || r.theme === 'system' ? r.theme : DEFAULT_PREFS.theme,
    swapPanels: bool(r.swapPanels, DEFAULT_PREFS.swapPanels),
    showTools: bool(r.showTools, DEFAULT_PREFS.showTools),
    showProperties: bool(r.showProperties, DEFAULT_PREFS.showProperties),
  };
}

export function loadPrefs(): UiPrefs {
  try {
    const s = localStorage.getItem(PREFS_KEY);
    return sanitizePrefs(s ? JSON.parse(s) : null);
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(p: UiPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* private mode or storage full: prefs just won't persist */
  }
}

/** "system" removes the attribute so the CSS follows prefers-color-scheme. */
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement) {
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

const listeners = new Set<(p: UiPrefs) => void>();
let current: UiPrefs | null = null;

/** Shared across components (library + editor) and across tabs via the storage event. */
export function useUiPrefs() {
  const [prefs, setPrefs] = useState<UiPrefs>(() => (current ??= loadPrefs()));

  useEffect(() => {
    listeners.add(setPrefs);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== PREFS_KEY) return;
      current = loadPrefs();
      applyTheme(current.theme);
      listeners.forEach((l) => l(current!));
    };
    window.addEventListener('storage', onStorage);
    return () => {
      listeners.delete(setPrefs);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const change = useCallback((patch: Partial<UiPrefs>) => {
    current = { ...(current ?? loadPrefs()), ...patch };
    savePrefs(current);
    applyTheme(current.theme);
    listeners.forEach((l) => l(current!));
  }, []);

  return [prefs, change] as const;
}

/** Test hook: forget the cached prefs so the next hook reads storage again. */
export function resetPrefsCache() {
  current = null;
}
