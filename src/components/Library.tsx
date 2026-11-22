import AppearanceMenu from './AppearanceMenu';
import { lazy, Suspense, useEffect, useState } from 'react';
import type { Poster } from '../types';
import { deletePoster, exportPosterFile, listPosters, openLibraryFolder, pickFile, readText, savePoster, storageInfo } from '../lib/storage';
import { parsePosterText } from '../lib/posterFile';
import { backupDue, daysSinceBackup, downloadLibraryBackup, parseBackupText, planRestore, restoreMessage, snoozeUntil } from '../lib/backup';
import { useUiPrefs } from '../lib/uiPrefs';
import GearIcon from './GearIcon';
import type { PptxDeck } from '../lib/pptxImport';
import { uid, PALETTES } from '../model';
import { lazyPart } from '../lib/lazyPart';
import ConfirmDialog from './ConfirmDialog';
import SupportFooter from './SupportFooter';

// PowerPoint import is rarely used, so it loads only when someone picks a file.
const SlidePicker = lazy(() => import('./SlidePicker'));
const loadPptx = () => import('../lib/pptxImport');
// Dialogs load when opened, so My posters itself appears sooner.
const NewPosterDialog = lazyPart(() => import('./NewPosterDialog'));
const SettingsDialog = lazyPart(() => import('./SettingsDialog'));
const CopySizeDialog = lazyPart(() => import('./CopySizeDialog'));

const fmtSize = (p: Poster) => `${Math.round(p.width)} × ${Math.round(p.height)} mm · ${p.width > p.height ? 'landscape' : 'portrait'}`;
const fmtDate = (t: number) => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export default function Library({ onOpen }: { onOpen: (p: Poster, notice?: string) => void }) {
  const [posters, setPosters] = useState<Poster[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [where, setWhere] = useState<{ kind: 'browser' | 'folder'; location: string } | null>(null);
  const [picking, setPicking] = useState<{ deck: PptxDeck; name: string; fileName: string } | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<Poster | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [resizing, setResizing] = useState<Poster | null>(null);
  const [prefs, changePrefs] = useUiPrefs();

  const refresh = () => listPosters().then(setPosters).catch((e) => setError(String(e)));
  useEffect(() => {
    refresh();
    storageInfo().then(setWhere).catch(() => undefined);
  }, []);

  // Once My posters is showing, fetch the editor and New poster dialog in the background,
  // so the first click on a poster (or + New poster) doesn't wait for a download.
  useEffect(() => {
    const t = setTimeout(() => {
      import('./NewPosterDialog').catch(() => undefined);
      import('./Editor').catch(() => undefined);
    }, 1500);
    return () => clearTimeout(t);
  }, []);

  async function create(p: Poster) {
    try {
      await savePoster(p);
    } catch (e) {
      setCreating(false);
      setError('Could not save the new poster: ' + String(e));
      return;
    }
    setCreating(false);
    onOpen(p);
  }

  async function importProject() {
    const f = await pickFile('.json,.poster.json,application/json');
    if (!f) return;
    try {
      const text = await readText(f);
      const backup = parseBackupText(text);
      if (backup) {
        const plan = planRestore(await listPosters(), backup.posters);
        for (const p of [...plan.add, ...plan.replace]) await savePoster(p);
        await refresh();
        setNotice(restoreMessage(plan, backup.skipped));
        return;
      }
      const p = parsePosterText(text);
      p.id = uid();
      p.updatedAt = Date.now();
      await savePoster(p);
      onOpen(p);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function importTemplate() {
    const f = await pickFile('.pptx,.potx,application/vnd.openxmlformats-officedocument.presentationml.presentation');
    if (!f) return;
    setBusy('Reading PowerPoint template…');
    try {
      const deck = await (await loadPptx()).openPptx(f);
      const name = f.name.replace(/\.(pptx|potx)$/i, '');
      // With several slides (or layouts) let the user choose; otherwise import straight away.
      if (deck.pages.length > 1) setPicking({ deck, name, fileName: f.name });
      else await finishImport(deck, 0, name);
    } catch (e) {
      setError('Could not import that PowerPoint file: ' + (e as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function finishImport(deck: PptxDeck, index: number, name: string) {
    setPicking(null);
    setBusy('Importing…');
    try {
      const r = await deck.importPage(index);
      const p = (await loadPptx()).posterFromImport(r, name);
      await savePoster(p);
      onOpen(p, r.warnings.length ? 'Imported with a few notes:\n• ' + r.warnings.join('\n• ') : undefined);
    } catch (e) {
      setError('Could not import that PowerPoint file: ' + (e as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function duplicate(p: Poster) {
    const copy = { ...structuredClone(p), id: uid(), name: p.name + ' (copy)', createdAt: Date.now(), updatedAt: Date.now() };
    await savePoster(copy);
    refresh();
  }

  async function finishRename() {
    if (!renaming) return;
    const p = posters?.find((x) => x.id === renaming.id);
    const name = renaming.name.trim();
    setRenaming(null);
    if (!p || !name || name === p.name) return;
    await savePoster({ ...p, name, updatedAt: Date.now() });
    refresh();
  }

  async function remove(p: Poster) {
    setDeleting(null);
    await deletePoster(p.id);
    refresh();
  }

  async function backupAll() {
    try {
      const t = await downloadLibraryBackup();
      if (t) {
        changePrefs({ lastBackupAt: t, backupSnoozedUntil: 0 });
        setNotice('Backup downloaded. To bring the posters back, use “Open project file” and pick that file.');
      }
    } catch (e) {
      setError('Could not make the backup: ' + String(e));
    }
  }

  const remindBackup = where?.kind === 'browser' && !!posters?.length && backupDue(posters, prefs);
  const backupDays = remindBackup ? daysSinceBackup(posters!, prefs.lastBackupAt) : null;

  const shown = (posters ?? []).filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="library">
      <header className="lib-header">
        <div className="brand">
          <Logo /> PosterHub
        </div>
        <div className="lib-actions">
          <button className="btn" onClick={importTemplate}>Import PowerPoint template</button>
          <button className="btn" onClick={importProject}>Open project file</button>
          <button className="btn primary" onClick={() => setCreating(true)}>+ New poster</button>
          <AppearanceMenu />
          <button className="icon-btn" aria-label="Settings" title="Settings" onClick={() => setSettingsOpen(true)}>
            <GearIcon />
          </button>
        </div>
      </header>
      <main className="lib-main">
        <div className="lib-title-row">
          <h1>My posters</h1>
          {!!posters?.length && <input className="search" placeholder="Search posters" aria-label="Search posters" value={query} onChange={(e) => setQuery(e.target.value)} />}
          {!!posters?.length && where?.kind === 'browser' && (
            <button className="btn" onClick={backupAll} title="One file with every poster. Open it with “Open project file” to restore.">
              Back up all posters
            </button>
          )}
        </div>
        {where?.kind === 'folder' && (
          <p className="muted small lib-location">
            Saved as files in <code>{where.location}</code>{' '}
            <button className="link" onClick={() => openLibraryFolder().catch((e) => setError(String(e)))}>Show folder</button>
          </p>
        )}
        {error && (
          <div className="banner error" onClick={() => setError('')}>
            {error} <span className="muted">(click to dismiss)</span>
          </div>
        )}
        {busy && <div className="banner">{busy}</div>}
        {notice && (
          <div className="banner" role="status">
            {notice}{' '}
            <button className="link" onClick={() => setNotice('')}>Dismiss</button>
          </div>
        )}
        {remindBackup && (
          <div className="backup-banner" role="region" aria-label="Backup reminder">
            <p>
              <strong>{prefs.lastBackupAt ? `Last backup ${backupDays} days ago.` : 'You haven’t made a backup yet.'}</strong> Your posters are only saved in this browser, so clearing browsing data
              would delete them.
            </p>
            <button className="btn primary" onClick={backupAll}>Download backup</button>
            <button className="btn" onClick={() => changePrefs({ backupSnoozedUntil: snoozeUntil() })}>Remind me later</button>
          </div>
        )}
        {posters && posters.length === 0 && (
          <div className="empty">
            <h2>Make your first research poster</h2>
            <p>Start from a layout, or bring in a PowerPoint template your lab or conference already uses.</p>
            <div className="empty-actions">
              <button className="btn primary big" onClick={() => setCreating(true)}>+ New poster</button>
              <button className="btn big" onClick={importTemplate}>Import PowerPoint template</button>
            </div>
            <p className="muted small">
              {where?.kind === 'folder'
                ? 'Posters are saved automatically as files in your Documents/PosterHub folder, so you can back them up or copy them like any other file.'
                : 'Posters are saved in this browser automatically. Once you have some, download a backup from Settings (the gear, top right) to keep a copy or move them to another computer.'}
            </p>
          </div>
        )}
        <div className="poster-grid">
          {shown.map((p) => (
            <div className="poster-card" key={p.id}>
              <button className="thumb" onClick={() => onOpen(p)} title="Open" aria-label={`Open ${p.name} preview`}>
                {p.thumbnail ? <img src={p.thumbnail} alt="" /> : <div className="thumb-ph" style={{ aspectRatio: `${p.width}/${p.height}`, background: p.palette?.background ?? PALETTES[0].background }} />}
              </button>
              <div className="card-body">
                {renaming?.id === p.id ? (
                  <input
                    className="card-rename"
                    aria-label="Poster name"
                    autoFocus
                    value={renaming.name}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => setRenaming({ id: p.id, name: e.target.value })}
                    onBlur={finishRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') finishRename();
                      if (e.key === 'Escape') setRenaming(null);
                    }}
                  />
                ) : (
                  <div className="card-name" title={p.name}>{p.name}</div>
                )}
                <div className="muted small">{fmtSize(p)}</div>
                <div className="muted small">Edited {fmtDate(p.updatedAt)}</div>
                <div className="card-actions">
                  <button className="link" onClick={() => onOpen(p)}>Open</button>
                  <button className="link" onClick={() => setRenaming({ id: p.id, name: p.name })}>Rename</button>
                  <button className="link" onClick={() => duplicate(p)}>Duplicate</button>
                  <button className="link" onClick={() => setResizing(p)} aria-label={`Copy ${p.name} at another size`} title="Make a copy at another size or orientation, e.g. A1 landscape or an A4 handout">
                    Copy at size…
                  </button>
                  <button className="link" onClick={() => exportPosterFile(p)} title="Save a .poster.json copy you can open on another computer. For PDF or PowerPoint, open the poster and use Export.">
                    Download backup
                  </button>
                  <button className="link danger" onClick={() => setDeleting(p)}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
      <SupportFooter />
      {resizing && (
        <CopySizeDialog
          poster={resizing}
          onCancel={() => setResizing(null)}
          onCopy={async (copy, message) => {
            setResizing(null);
            try {
              await savePoster(copy);
              onOpen(copy, message);
            } catch (e) {
              setError('Could not save the copy: ' + String(e));
            }
          }}
        />
      )}
      {picking && (
        <Suspense fallback={null}>
          <SlidePicker deck={picking.deck} fileName={picking.fileName} onPick={(i) => finishImport(picking.deck, i, picking.name)} onCancel={() => setPicking(null)} />
        </Suspense>
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete “${deleting.name}”?`}
          message="This cannot be undone. Use “Download backup” first if you might want it again."
          confirmLabel="Delete poster"
          danger
          onConfirm={() => remove(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}
      {settingsOpen && <SettingsDialog storageKind={where?.kind ?? 'browser'} onBackupAll={backupAll} onClose={() => setSettingsOpen(false)} />}
      {creating && <NewPosterDialog onCreate={create} onCancel={() => setCreating(false)} />}
    </div>
  );
}

export function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden>
      <rect x="5" y="2" width="22" height="28" rx="2" fill="currentColor" />
      <rect x="8" y="5" width="16" height="4" fill="var(--bg)" />
      <rect x="8" y="12" width="7" height="15" fill="var(--bg)" opacity=".6" />
      <rect x="17" y="12" width="7" height="15" fill="var(--bg)" opacity=".6" />
    </svg>
  );
}

