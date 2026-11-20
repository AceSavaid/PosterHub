import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, PREFS_KEY, applyTheme, loadPrefs, resetPrefsCache, sanitizePrefs, savePrefs } from '../../src/lib/uiPrefs';

beforeEach(() => {
  localStorage.clear();
  resetPrefsCache();
  document.documentElement.removeAttribute('data-theme');
});

describe('editor appearance preferences', () => {
  it('defaults to following the system theme with both panels in place', () => {
    expect(loadPrefs()).toEqual({ theme: 'system', swapPanels: false, showTools: true, showProperties: true, pdfBleedMm: 0, pdfCropMarks: false, showNotes: true });
  });

  it('round-trips through localStorage', () => {
    const p = { theme: 'dark' as const, swapPanels: true, showTools: false, showProperties: true, pdfBleedMm: 3, pdfCropMarks: true, showNotes: false };
    savePrefs(p);
    expect(JSON.parse(localStorage.getItem(PREFS_KEY)!)).toEqual(p);
    expect(loadPrefs()).toEqual(p);
  });

  it('ignores malformed or partial stored values', () => {
    expect(sanitizePrefs({ theme: 'purple', swapPanels: 'yes', showTools: false })).toEqual({ ...DEFAULT_PREFS, showTools: false });
    expect(sanitizePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(sanitizePrefs({ pdfBleedMm: -2, pdfCropMarks: 1 })).toEqual(DEFAULT_PREFS);
    expect(sanitizePrefs({ pdfBleedMm: 'lots' })).toEqual(DEFAULT_PREFS);
    expect(sanitizePrefs('dark')).toEqual(DEFAULT_PREFS);
    localStorage.setItem(PREFS_KEY, '{not json');
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });

  it('sets the theme attribute, and removes it to follow the system', () => {
    const root = document.documentElement;
    applyTheme('dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
    applyTheme('light');
    expect(root.getAttribute('data-theme')).toBe('light');
    applyTheme('system');
    expect(root.hasAttribute('data-theme')).toBe(false);
  });
});
