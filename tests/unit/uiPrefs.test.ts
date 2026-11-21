import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, PREFS_KEY, UI_SIZE_ZOOM, applyAppearance, applyTheme, loadPrefs, resetPrefsCache, sanitizePrefs, savePrefs, wantsHighContrast } from '../../src/lib/uiPrefs';

beforeEach(() => {
  localStorage.clear();
  resetPrefsCache();
  document.documentElement.removeAttribute('data-theme');
});

describe('editor appearance preferences', () => {
  it('defaults to following the system theme with both panels in place', () => {
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
    expect(DEFAULT_PREFS).toMatchObject({ theme: 'system', contrast: 'system', uiSize: 'normal', swapPanels: false, showTools: true, showProperties: true, showTips: true, backupReminder: true, lastBackupAt: 0 });
  });

  it('round-trips through localStorage', () => {
    const p = { ...DEFAULT_PREFS, theme: 'dark' as const, contrast: 'high' as const, uiSize: 'xlarge' as const, swapPanels: true, showTools: false, pdfBleedMm: 3, pdfCropMarks: true, showNotes: false, brandKit: 'ontario-tech', showTips: false, backupReminder: false, lastBackupAt: 1700000000000, backupSnoozedUntil: 1700000500000 };
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

describe('contrast and interface size', () => {
  it('keeps valid values and drops unknown ones', () => {
    expect(sanitizePrefs({ contrast: 'high', uiSize: 'large' })).toMatchObject({ contrast: 'high', uiSize: 'large' });
    expect(sanitizePrefs({ contrast: 'neon', uiSize: 'huge' })).toMatchObject({ contrast: 'system', uiSize: 'normal' });
    expect(sanitizePrefs({ lastBackupAt: -5, backupSnoozedUntil: 'soon' })).toMatchObject({ lastBackupAt: 0, backupSnoozedUntil: 0 });
  });

  it('uses high contrast when chosen, or when the computer asks for more contrast on Auto', () => {
    expect(wantsHighContrast('high', false)).toBe(true);
    expect(wantsHighContrast('normal', true)).toBe(false);
    expect(wantsHighContrast('system', true)).toBe(true);
    expect(wantsHighContrast('system', false)).toBe(false);
  });

  it('sets the attributes the CSS reads, and clears them again', () => {
    const root = document.documentElement;
    applyAppearance({ theme: 'dark', contrast: 'high', uiSize: 'xlarge' });
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(root.getAttribute('data-contrast')).toBe('high');
    expect(root.getAttribute('data-ui-size')).toBe('xlarge');
    expect(root.style.getPropertyValue('--ui-zoom')).toBe(String(UI_SIZE_ZOOM.xlarge));
    applyAppearance({ theme: 'system', contrast: 'normal', uiSize: 'normal' });
    expect(root.hasAttribute('data-contrast')).toBe(false);
    expect(root.hasAttribute('data-ui-size')).toBe(false);
    expect(root.style.getPropertyValue('--ui-zoom')).toBe('');
  });
});
