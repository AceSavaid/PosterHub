import { describe, expect, it } from 'vitest';
import { BACKUP_EVERY_DAYS, backupDue, backupFileName, backupToText, daysSinceBackup, formatBytes, parseBackupText, planRestore, restoreMessage, snoozeUntil } from '../../src/lib/backup';
import { createPoster, PALETTES, sizeFor } from '../../src/model';
import type { Poster } from '../../src/types';

const DAY = 86400000;
const NOW = Date.UTC(2026, 10, 21, 12);
function poster(id: string, updatedAt: number, createdAt = updatedAt): Poster {
  return { ...createPoster({ name: 'x', ...sizeFor('A0', 'portrait'), sizePreset: 'A0', columns: 3, palette: PALETTES[0], headingFont: 'Montserrat', bodyFont: 'Open Sans', template: 'blank' }), id, name: 'P ' + id, createdAt, updatedAt };
}
const prefs = (p: Partial<{ backupReminder: boolean; lastBackupAt: number; backupSnoozedUntil: number }> = {}) => ({ backupReminder: true, lastBackupAt: 0, backupSnoozedUntil: 0, ...p });

describe('library backup file', () => {
  it('round-trips every poster, including its thumbnail', () => {
    const a = { ...poster('a', NOW), thumbnail: 'data:image/png;base64,AAAA' };
    const b = poster('b', NOW - DAY);
    const back = parseBackupText(backupToText([a, b], NOW))!;
    expect(back.skipped).toBe(0);
    expect(back.posters.map((p) => p.id)).toEqual(['a', 'b']);
    expect(back.posters[0].thumbnail).toBe(a.thumbnail);
    expect(back.posters[1].name).toBe('P b');
  });

  it('is not confused with a single poster file or other JSON', () => {
    expect(parseBackupText(JSON.stringify({ app: 'posterhub', ...poster('a', NOW) }))).toBeNull();
    expect(parseBackupText('not json')).toBeNull();
    expect(() => parseBackupText('{"app":"posterhub-backup"}')).toThrow(/damaged/);
  });

  it('skips broken posters and unsafe thumbnails instead of failing the whole restore', () => {
    const text = JSON.stringify({ app: 'posterhub-backup', version: 1, posters: [{ ...poster('ok', NOW), thumbnail: 'javascript:alert(1)' }, { nonsense: true }, 7] });
    const back = parseBackupText(text)!;
    expect(back.posters.map((p) => p.id)).toEqual(['ok']);
    expect(back.posters[0].thumbnail).toBeUndefined();
    expect(back.skipped).toBe(2);
  });

  it('names the file with the date', () => {
    expect(backupFileName(NOW)).toBe('PosterHub-backup-2026-11-21.posterhub-backup.json');
  });
});

describe('restoring', () => {
  it('adds missing posters, updates older ones and never overwrites newer work', () => {
    const library = [poster('same', NOW), poster('older', NOW - 5 * DAY), poster('newer', NOW)];
    const backup = [poster('same', NOW), poster('older', NOW - DAY), poster('newer', NOW - 3 * DAY), poster('new', NOW)];
    const plan = planRestore(library, backup);
    expect(plan.add.map((p) => p.id)).toEqual(['new']);
    expect(plan.replace.map((p) => p.id)).toEqual(['older']);
    expect(plan.keep.map((p) => p.id)).toEqual(['same', 'newer']);
    expect(restoreMessage(plan, 1)).toBe(
      'Backup restored: added 1 poster, updated 1 poster to the backup’s newer version, kept 2 posters you already had (same or newer). 1 poster in the file could not be read and was skipped.',
    );
    expect(restoreMessage({ add: [], replace: [], keep: [] }, 0)).toBe('The backup had no posters in it.');
  });
});

describe('weekly reminder', () => {
  it('waits a week after the first poster, then reminds until a backup is made', () => {
    const lib = [poster('a', NOW - DAY, NOW - 6 * DAY)];
    expect(backupDue(lib, prefs(), NOW)).toBe(false);
    const older = [poster('a', NOW - DAY, NOW - BACKUP_EVERY_DAYS * DAY)];
    expect(backupDue(older, prefs(), NOW)).toBe(true);
    expect(daysSinceBackup(older, 0, NOW)).toBe(7);
  });

  it('counts from the last backup, and stays quiet when nothing changed since', () => {
    const last = NOW - 10 * DAY;
    expect(backupDue([poster('a', last - DAY)], prefs({ lastBackupAt: last }), NOW)).toBe(false);
    expect(backupDue([poster('a', last + DAY)], prefs({ lastBackupAt: last }), NOW)).toBe(true);
    expect(backupDue([poster('a', NOW - DAY)], prefs({ lastBackupAt: NOW - 2 * DAY }), NOW)).toBe(false);
  });

  it('respects "Remind me later" and the setting being off', () => {
    const lib = [poster('a', NOW, NOW - 30 * DAY)];
    expect(backupDue(lib, prefs({ backupSnoozedUntil: snoozeUntil(NOW - DAY) }), NOW)).toBe(false);
    expect(backupDue(lib, prefs({ backupSnoozedUntil: snoozeUntil(NOW - 4 * DAY) }), NOW)).toBe(true);
    expect(backupDue(lib, prefs({ backupReminder: false }), NOW)).toBe(false);
    expect(backupDue([], prefs(), NOW)).toBe(false);
  });
});

describe('storage sizes', () => {
  it('reads like a person would say it', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(12.44 * 1024 * 1024)).toBe('12.4 MB');
    expect(formatBytes(300 * 1024 ** 3)).toBe('300 GB');
  });
});
