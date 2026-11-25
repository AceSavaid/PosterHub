import { useEffect, useState } from 'react';
import { DEFAULT_PREFS, useUiPrefs, type Contrast, type Theme, type UiSize } from '../lib/uiPrefs';
import { BRAND_KITS } from '../brandKits';
import { loadReviewerName, saveReviewerName } from '../lib/notes';
import { askToKeepStorage, formatBytes, storageUse, type StorageUse } from '../lib/backup';
import { useDialog } from '../lib/useDialog';
import { keys } from '../lib/keys';

interface Props {
  onClose: () => void;
  /** where posters are kept: browser storage on the web, a folder in the desktop app */
  storageKind?: 'browser' | 'folder';
  /** downloads one file with every poster; resolves false if cancelled */
  onBackupAll?: () => Promise<boolean | void>;
  /** told when the reviewer name changes, so an open editor signs new notes with it */
  onReviewer?: (name: string) => void;
}

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string; title?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} role="radio" aria-checked={value === o.id} className={value === o.id ? 'active' : ''} title={o.title} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const THEMES: { id: Theme; label: string; title?: string }[] = [
  { id: 'system', label: 'Auto', title: 'Match your computer’s light or dark setting' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];
const CONTRASTS: { id: Contrast; label: string; title?: string }[] = [
  { id: 'system', label: 'Auto', title: 'Use high contrast when your computer’s “increase contrast” setting is on' },
  { id: 'normal', label: 'Standard' },
  { id: 'high', label: 'High' },
];
const SIZES: { id: UiSize; label: string; title?: string }[] = [
  { id: 'normal', label: 'Standard' },
  { id: 'large', label: 'Large', title: '115%' },
  { id: 'xlarge', label: 'Extra large', title: '130%' },
];

/** Every per-person setting in one place. Settings stay on this computer; they are never saved into posters. */
export default function SettingsDialog({ onClose, storageKind = 'browser', onBackupAll, onReviewer }: Props) {
  const [prefs, change] = useUiPrefs();
  const [reviewer, setReviewer] = useState(loadReviewerName);
  const [use, setUse] = useState<StorageUse | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [keepRefused, setKeepRefused] = useState(false);
  const dialog = useDialog(onClose, 'settings-title');

  useEffect(() => {
    if (storageKind === 'browser') storageUse().then(setUse);
  }, [storageKind]);

  const saveName = (name: string) => {
    setReviewer(name);
    saveReviewerName(name);
    onReviewer?.(name.trim());
  };

  const pct = use ? Math.min(100, (use.usedBytes / use.quotaBytes) * 100) : 0;
  const lastBackup = prefs.lastBackupAt ? new Date(prefs.lastBackupAt).toLocaleDateString() : null;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide settings-dialog" {...dialog}>
        <h2 id="settings-title">Settings</h2>
        <p className="muted">These are saved on this computer only. They change how PosterHub looks and works for you, not your posters.</p>

        <h3>Appearance</h3>
        <div className="settings-grid">
          <div className="field-label">Theme</div>
          <Seg label="Theme" value={prefs.theme} options={THEMES} onChange={(theme) => change({ theme })} />
          <div className="field-label">Contrast</div>
          <Seg label="Contrast" value={prefs.contrast} options={CONTRASTS} onChange={(contrast) => change({ contrast })} />
          <div className="field-label">Interface size</div>
          <Seg label="Interface size" value={prefs.uiSize} options={SIZES} onChange={(uiSize) => change({ uiSize })} />
        </div>
        <p className="hint">Interface size makes menus, panels and buttons bigger. It doesn’t change the poster; use the zoom percentage at the top of the editor for that.</p>

        <h3>Editor</h3>
        <div className="settings-checks">
          <label className="check">
            <input type="checkbox" checked={prefs.showNotes} onChange={(e) => change({ showNotes: e.target.checked })} /> Show review notes on the poster
          </label>
          <label className="check">
            <input type="checkbox" checked={prefs.showTips} onChange={(e) => change({ showTips: e.target.checked })} /> Show a tip for the selected element
          </label>
          <label className="check">
            <input type="checkbox" checked={prefs.autoFormat} onChange={(e) => change({ autoFormat: e.target.checked })} /> Format as I type: “- ” or “1. ” starts a list, curly quotes, 10–20 dashes
          </label>
          <label className="check">
            <input type="checkbox" checked={prefs.showTools} onChange={(e) => change({ showTools: e.target.checked })} /> Show the Insert panel
          </label>
          <label className="check">
            <input type="checkbox" checked={prefs.showProperties} onChange={(e) => change({ showProperties: e.target.checked })} /> Show the Properties panel
          </label>
          <label className="check">
            <input type="checkbox" checked={prefs.swapPanels} onChange={(e) => change({ swapPanels: e.target.checked })} /> Insert panel on the right
          </label>
        </div>
        <p className="hint">{keys('Ctrl/⌘ \\ hides or shows both side panels. Press ? in the editor for every shortcut.')}</p>

        <div className="settings-grid">
          <label htmlFor="settings-reviewer" className="field-label">Your name on notes</label>
          <input id="settings-reviewer" placeholder="e.g. Dr Patel" maxLength={60} value={reviewer} onChange={(e) => saveName(e.target.value)} />
        </div>

        <h3>New posters</h3>
        <div className="settings-grid">
          <label htmlFor="settings-kit" className="field-label">Brand kit</label>
          <select id="settings-kit" value={prefs.brandKit} onChange={(e) => change({ brandKit: e.target.value })}>
            <option value="">None</option>
            {BRAND_KITS.map((k) => (
              <option key={k.id} value={k.id}>{k.name}</option>
            ))}
          </select>
        </div>

        {storageKind === 'browser' && (
          <>
            <h3>Storage and backups</h3>
            <p className="hint">Your posters are saved in this browser only. Clearing browsing data, or using another computer, means they won’t be there, so keep a backup.</p>
            {use && (
              <div className="storage-use" data-testid="storage-use">
                <div className="storage-meter" role="meter" aria-label="Browser storage used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-valuetext={`${formatBytes(use.usedBytes)} of ${formatBytes(use.quotaBytes)}`}>
                  <div style={{ width: `${Math.max(pct, 1)}%` }} />
                </div>
                <p className="muted small">
                  {formatBytes(use.usedBytes)} used of {formatBytes(use.quotaBytes)} this browser allows.{' '}
                  {use.persisted ? (
                    'The browser won’t clear it on its own.'
                  ) : (
                    keepRefused ? (
                      'The browser said not yet. Browsers usually agree once you use a site often, so keep a backup for now.'
                    ) : (
                      <button
                        className="link"
                        onClick={async () => {
                          const ok = await askToKeepStorage();
                          if (!ok) setKeepRefused(true);
                          setUse(await storageUse());
                        }}
                      >
                        Ask the browser to keep it
                      </button>
                    )
                  )}
                </p>
              </div>
            )}
            <div className="settings-checks">
              <label className="check">
                <input type="checkbox" checked={prefs.backupReminder} onChange={(e) => change({ backupReminder: e.target.checked })} /> Remind me weekly to download a backup
              </label>
            </div>
            {onBackupAll && (
              <p>
                <button
                  className="btn"
                  disabled={backingUp}
                  onClick={async () => {
                    setBackingUp(true);
                    try {
                      await onBackupAll();
                    } finally {
                      setBackingUp(false);
                    }
                  }}
                >
                  Download backup of all posters
                </button>{' '}
                <span className="muted small">{lastBackup ? `Last backup: ${lastBackup}` : 'No backup yet.'}</span>
              </p>
            )}
          </>
        )}

        <div className="modal-actions">
          <button
            className="btn"
            onClick={() => change({ ...DEFAULT_PREFS, lastBackupAt: prefs.lastBackupAt, backupSnoozedUntil: prefs.backupSnoozedUntil })}
            title="Theme, contrast, size, panels, brand kit and print options go back to how they started. Posters are not changed."
          >
            Reset to defaults
          </button>
          <button className="btn primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
