// Backups of the whole "My posters" library. On the web, posters live only in
// this browser, so clearing site data or a new computer loses them. A backup
// is one file holding every poster; "Open project file" restores it.
import type { Poster } from '../types';
import { parsePosterText } from './posterFile';
import type { UiPrefs } from './uiPrefs';
import { downloadBlob, listPosters } from './storage';

export const BACKUP_APP = 'posterhub-backup';
export const BACKUP_EXT = '.posterhub-backup.json';
const DAY = 24 * 60 * 60 * 1000;
/** Remind after this many days without a backup. */
export const BACKUP_EVERY_DAYS = 7;
/** "Remind me later" waits this long. */
export const SNOOZE_DAYS = 3;

export function backupFileName(now = Date.now()) {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `PosterHub-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}${BACKUP_EXT}`;
}

export function backupToText(posters: Poster[], now = Date.now()) {
  // keep thumbnails so the restored library shows previews straight away
  return JSON.stringify({ app: BACKUP_APP, version: 1, savedAt: now, posters: posters.map((p) => ({ app: 'posterhub', ...p })) });
}

/**
 * Reads a backup file. Returns null when the text is not a backup (it may be a
 * single poster). Posters that fail the usual project-file checks are counted
 * in `skipped` instead of stopping the whole restore.
 */
export function parseBackupText(text: string): { posters: Poster[]; skipped: number } | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || (data as { app?: unknown }).app !== BACKUP_APP) return null;
  const list = (data as { posters?: unknown }).posters;
  if (!Array.isArray(list)) throw new Error('This backup file is damaged: it has no posters in it.');
  const posters: Poster[] = [];
  let skipped = 0;
  for (const item of list) {
    try {
      const thumb = item && typeof item === 'object' && typeof item.thumbnail === 'string' && item.thumbnail.startsWith('data:image/') ? item.thumbnail : undefined;
      const p = parsePosterText(JSON.stringify(item));
      if (typeof p.id !== 'string' || !p.id) throw new Error('no id');
      if (thumb) p.thumbnail = thumb;
      posters.push(p);
    } catch {
      skipped++;
    }
  }
  return { posters, skipped };
}

export interface RestorePlan {
  /** posters not in the library yet */
  add: Poster[];
  /** posters whose library copy is older than the backup's */
  replace: Poster[];
  /** posters the library already has the same or a newer version of */
  keep: Poster[];
}

/** Never overwrites newer work: a poster edited since the backup keeps its current version. */
export function planRestore(library: Poster[], backup: Poster[]): RestorePlan {
  const have = new Map(library.map((p) => [p.id, p]));
  const plan: RestorePlan = { add: [], replace: [], keep: [] };
  for (const p of backup) {
    const mine = have.get(p.id);
    if (!mine) plan.add.push(p);
    else if ((p.updatedAt ?? 0) > (mine.updatedAt ?? 0)) plan.replace.push(p);
    else plan.keep.push(p);
  }
  return plan;
}

export function restoreMessage(plan: RestorePlan, skipped: number) {
  const n = (k: number, one: string, many = one + 's') => `${k} ${k === 1 ? one : many}`;
  const parts: string[] = [];
  if (plan.add.length) parts.push(`added ${n(plan.add.length, 'poster')}`);
  if (plan.replace.length) parts.push(`updated ${n(plan.replace.length, 'poster')} to the backup’s newer version`);
  if (plan.keep.length) parts.push(`kept ${n(plan.keep.length, 'poster')} you already had (same or newer)`);
  let msg = parts.length ? 'Backup restored: ' + parts.join(', ') + '.' : 'The backup had no posters in it.';
  if (skipped) msg += ` ${n(skipped, 'poster')} in the file could not be read and ${skipped === 1 ? 'was' : 'were'} skipped.`;
  return msg;
}

/**
 * Days since the library was last backed up, counted from the first poster's
 * creation when there has never been a backup. Null when nothing needs backing up.
 */
export function daysSinceBackup(posters: Poster[], lastBackupAt: number, now = Date.now()): number | null {
  const changed = posters.filter((p) => (p.updatedAt ?? 0) > lastBackupAt);
  if (!changed.length) return null;
  const since = lastBackupAt || Math.min(...posters.map((p) => p.createdAt || p.updatedAt || now));
  return Math.max(0, Math.floor((now - since) / DAY));
}

/** Whether the library page should show the weekly backup reminder. */
export function backupDue(posters: Poster[], prefs: Pick<UiPrefs, 'backupReminder' | 'lastBackupAt' | 'backupSnoozedUntil'>, now = Date.now()) {
  if (!prefs.backupReminder || now < prefs.backupSnoozedUntil) return false;
  const days = daysSinceBackup(posters, prefs.lastBackupAt, now);
  return days !== null && days >= BACKUP_EVERY_DAYS;
}

export const snoozeUntil = (now = Date.now()) => now + SNOOZE_DAYS * DAY;

export interface StorageUse {
  usedBytes: number;
  quotaBytes: number;
  /** true when the browser has promised not to clear this site's data on its own */
  persisted: boolean;
}

/** How much browser storage is used. Null where the browser can't tell (or in the desktop app). */
export async function storageUse(): Promise<StorageUse | null> {
  const s = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (!s?.estimate) return null;
  try {
    const [est, persisted] = await Promise.all([s.estimate(), s.persisted ? s.persisted() : Promise.resolve(false)]);
    if (!est.quota) return null;
    return { usedBytes: est.usage ?? 0, quotaBytes: est.quota, persisted };
  } catch {
    return null;
  }
}

/** Asks the browser to keep this site's data even when the disk gets full. */
export async function askToKeepStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

/** "12.4 MB" */
export function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = b;
  let i = -1;
  do {
    v /= 1024;
    i++;
  } while (v >= 1024 && i < units.length - 1);
  return `${v >= 100 ? Math.round(v) : +v.toFixed(1)} ${units[i]}`;
}

/** Downloads every poster in the library as one backup file. Resolves to the time it was saved, or 0 if cancelled. */
export async function downloadLibraryBackup(now = Date.now()): Promise<number> {
  const posters = await listPosters();
  const ok = await downloadBlob(new Blob([backupToText(posters, now)], { type: 'application/json' }), backupFileName(now));
  return ok ? now : 0;
}
