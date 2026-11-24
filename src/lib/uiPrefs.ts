import { useCallback, useEffect, useState } from 'react';
import { sanitizePrintOptions } from './print';

/**
 * Per-person settings: colour theme, contrast, interface size, which side panels are shown
 * where, print extras and backup reminders.
 * Kept in localStorage (not in the poster) because it's about the person's screen,
 * not the document.
 */
export type Theme = 'system' | 'light' | 'dark';
/** 'system' follows the computer's "increase contrast" setting */
export type Contrast = 'system' | 'normal' | 'high';
/** how big the menus, panels and buttons are drawn (the poster itself is unaffected) */
export type UiSize = 'normal' | 'large' | 'xlarge';
export const UI_SIZE_ZOOM: Record<UiSize, number> = { normal: 1, large: 1.15, xlarge: 1.3 };

export interface UiPrefs {
  theme: Theme;
  contrast: Contrast;
  uiSize: UiSize;
  /** true puts the Insert/Layout/Design panel on the right and Properties on the left */
  swapPanels: boolean;
  showTools: boolean;
  showProperties: boolean;
  /** PDF bleed in mm (0 = none). Kept per person: it depends on their print shop, not the poster. */
  pdfBleedMm: number;
  /** Add crop marks to PDFs. */
  pdfCropMarks: boolean;
  /** PNG export resolution (and the PDF's fallback image), remembered between visits */
  pngDpi: number;
  /** draw review-note pins on the poster while editing */
  showNotes: boolean;
  /** id of the brand kit new posters start with ('' = none) */
  brandKit: string;
  /** remind people on the web to download a backup of all posters every week */
  backupReminder: boolean;
  /** a one-line tip about the selected element at the top of the Properties panel */
  showTips: boolean;
  /** when the last "all posters" backup was downloaded (ms, 0 = never) */
  lastBackupAt: number;
  /** "Remind me later" hides the reminder until this time (ms) */
  backupSnoozedUntil: number;
}

export const DEFAULT_PREFS: UiPrefs = { theme: 'system', swapPanels: false, showTools: true, showProperties: true, pdfBleedMm: 0, pdfCropMarks: false, pngDpi: 200, showNotes: true, brandKit: '', contrast: 'system', uiSize: 'normal', backupReminder: true, showTips: true, lastBackupAt: 0, backupSnoozedUntil: 0 };
export const PREFS_KEY = 'posterhub.ui';
export const PNG_DPI_CHOICES = [
  { dpi: 100, label: 'Draft (100 dpi)' },
  { dpi: 150, label: 'Good (150 dpi)' },
  { dpi: 200, label: 'High (200 dpi)' },
  { dpi: 300, label: 'Print (300 dpi)' },
];

/** Fills in defaults and drops anything malformed (old versions, hand-edited storage). */
export function sanitizePrefs(raw: unknown): UiPrefs {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  const time = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
  return {
    theme: r.theme === 'light' || r.theme === 'dark' || r.theme === 'system' ? r.theme : DEFAULT_PREFS.theme,
    swapPanels: bool(r.swapPanels, DEFAULT_PREFS.swapPanels),
    showTools: bool(r.showTools, DEFAULT_PREFS.showTools),
    showProperties: bool(r.showProperties, DEFAULT_PREFS.showProperties),
    pdfBleedMm: sanitizePrintOptions({ bleedMm: r.pdfBleedMm as number }).bleedMm,
    pdfCropMarks: bool(r.pdfCropMarks, DEFAULT_PREFS.pdfCropMarks),
    pngDpi: PNG_DPI_CHOICES.some((c) => c.dpi === r.pngDpi) ? (r.pngDpi as number) : DEFAULT_PREFS.pngDpi,
    showNotes: bool(r.showNotes, DEFAULT_PREFS.showNotes),
    contrast: r.contrast === 'normal' || r.contrast === 'high' || r.contrast === 'system' ? r.contrast : DEFAULT_PREFS.contrast,
    uiSize: r.uiSize === 'large' || r.uiSize === 'xlarge' || r.uiSize === 'normal' ? r.uiSize : DEFAULT_PREFS.uiSize,
    backupReminder: bool(r.backupReminder, DEFAULT_PREFS.backupReminder),
    showTips: bool(r.showTips, DEFAULT_PREFS.showTips),
    lastBackupAt: time(r.lastBackupAt),
    backupSnoozedUntil: time(r.backupSnoozedUntil),
    brandKit: typeof r.brandKit === 'string' && /^[a-z0-9-]{1,40}$/.test(r.brandKit) ? r.brandKit : DEFAULT_PREFS.brandKit,
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

const prefersMoreContrast = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-contrast: more)').matches;

/** True when the high-contrast colours should be used. */
export function wantsHighContrast(c: Contrast, systemMore = prefersMoreContrast()) {
  return c === 'high' || (c === 'system' && systemMore);
}

/** Theme, contrast and interface size as attributes on <html>, which the CSS reads. */
export function applyAppearance(p: Pick<UiPrefs, 'theme' | 'contrast' | 'uiSize'>, root: HTMLElement = document.documentElement) {
  applyTheme(p.theme, root);
  if (wantsHighContrast(p.contrast)) root.setAttribute('data-contrast', 'high');
  else root.removeAttribute('data-contrast');
  if (p.uiSize === 'normal') {
    root.removeAttribute('data-ui-size');
    root.style.removeProperty('--ui-zoom');
  } else {
    root.setAttribute('data-ui-size', p.uiSize);
    root.style.setProperty('--ui-zoom', String(UI_SIZE_ZOOM[p.uiSize]));
  }
}

/** Re-applies when the computer's contrast setting changes while the app is open. */
export function watchSystemContrast() {
  const mq = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-contrast: more)') : undefined;
  mq?.addEventListener?.('change', () => applyAppearance(current ?? loadPrefs()));
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
      applyAppearance(current);
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
    applyAppearance(current);
    listeners.forEach((l) => l(current!));
  }, []);

  return [prefs, change] as const;
}

/** Test hook: forget the cached prefs so the next hook reads storage again. */
export function resetPrefsCache() {
  current = null;
}
