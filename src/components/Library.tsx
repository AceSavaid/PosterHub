import { lazy, Suspense, useEffect, useState } from 'react';
import type { Poster } from '../types';
import type { PosterSummary } from '../lib/store';
import { deletePoster, exportPosterFile, listPosterSummaries, loadPoster, openLibraryFolder, pickFile, readText, savePoster, storageInfo } from '../lib/storage';
import { parsePosterText } from '../lib/posterFile';
import { backupDue, daysSinceBackup, downloadLibraryBackup, parseBackupText, planRestore, restoreMessage, snoozeUntil } from '../lib/backup';
import { useUiPrefs } from '../lib/uiPrefs';
import GearIcon from './GearIcon';
import type { PptxDeck } from '../lib/pptxImport';
import { uid, PALETTES } from '../model';
import { lazyPart } from '../lib/lazyPart';
import { hashPosterId, pushPosterEntry } from '../lib/posterHistory';
import ConfirmDialog from './ConfirmDialog';
import SupportFooter from './SupportFooter';
import ContextMenu from './ContextMenu';
import { posterActionItems } from './posterActions';

// PowerPoint import is rarely used, so it loads only when someone picks a file.
const SlidePicker = lazy(() => import('./SlidePicker'));
const loadPptx = () => import('../lib/pptxImport');
// Dialogs load when opened, so My posters itself appears sooner.
const NewPosterDialog = lazyPart(() => import('./NewPosterDialog'));
const SettingsDialog = lazyPart(() => import('./SettingsDialog'));
const CopySizeDialog = lazyPart(() => import('./CopySizeDialog'));
const SaveTemplateDialog = lazyPart(() => import('./SaveTemplateDialog'));

const fmtSize = (p: PosterSummary) => `${Math.round(p.width)} × ${Math.round(p.height)} mm · ${p.width > p.height ? 'landscape' : 'portrait'}`;
const fmtDate = (t: number) => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export default function Library({ onOpen }: { onOpen: (p: Poster, notice?: string, start?: 'abstract') => void }) {
  const [posters, setPosters] = useState<PosterSummary[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [openMenu, setOpenMenu] = useState<{ x: number; y: number } | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [where, setWhere] = useState<{ kind: 'browser' | 'folder'; location: string } | null>(null);
  const [picking, setPicking] = useState<{ deck: PptxDeck; name: string; fileName: string } | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<PosterSummary | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [resizing, setResizing] = useState<Poster | null>(null);
  const [templating, setTemplating] = useState<Poster | null>(null);
  const [cardMenu, setCardMenu] = useState<{ x: number; y: number; poster: PosterSummary } | null>(null);
  const [prefs, changePrefs] = useUiPrefs();

  const refresh = () => listPosterSummaries().then(setPosters).catch((e) => setError(String(e)));

  /** The cards hold only a summary; actions that need the whole poster load it first. */
  async function withPoster(s: PosterSummary, then: (p: Poster) => void) {
    try {
      const p = await loadPoster(s.id);
      if (p) then(p);
      else {
        setError(`“${s.name}” could not be found. It may have been deleted in another window.`);
        refresh();
      }
    } catch (e) {
      setError(`Could not open “${s.name}”: ` + String(e));
    }
  }
  const open = (s: PosterSummary) => withPoster(s, (p) => onOpen(p));
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

  async function create(p: Poster, opts: { fromAbstract?: boolean } = {}) {
    pushPosterEntry(p.id); // before saving, so Safari's Back button keeps it (see pushPosterEntry)
    try {
      await savePoster(p);
    } catch (e) {
      if (hashPosterId() === p.id) history.back();
      setCreating(false);
      setError('Could not save the new poster: ' + String(e));
      return;
    }
    setCreating(false);
    onOpen(p, undefined, opts.fromAbstract ? 'abstract' : undefined);
  }

  async function importProject() {
    const f = await pickFile('.json,.poster.json,application/json');
    if (!f) return;
    try {
      const text = await readText(f);
      const backup = parseBackupText(text);
      if (backup) {
        const plan = planRestore(await listPosterSummaries(), backup.posters);
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


  async function finishRename() {
    if (!renaming) return;
    const s = posters?.find((x) => x.id === renaming.id);
    const name = renaming.name.trim();
    setRenaming(null);
    if (!s || !name || name === s.name) return;
    const p = await loadPoster(s.id);
    if (!p) return refresh();
    await savePoster({ ...p, name, updatedAt: Date.now() });
    refresh();
  }

  async function remove(p: PosterSummary) {
    setDeleting(null);
    await deletePoster(p.id);
    refresh();
  }

  async function backupAll() {
    try {
      const t = await downloadLibraryBackup();
      if (t) {
        changePrefs({ lastBackupAt: t, backupSnoozedUntil: 0 });
        setNotice('Backup downloaded. To bring the posters back, use Open ▾ → Open project file… and pick that file.');
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
          <button
            className="btn"
            aria-haspopup="menu"
            aria-expanded={!!openMenu}
            title="Open a project file, or start from a PowerPoint template"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setOpenMenu({ x: r.left, y: r.bottom + 4 });
            }}
          >
            Open ▾
          </button>
          {openMenu && (
            <ContextMenu
              x={openMenu.x}
              y={openMenu.y}
              onClose={() => setOpenMenu(null)}
              items={[
                { label: 'Open project file…', onClick: importProject },
                { label: 'Import PowerPoint template…', onClick: importTemplate },
              ]}
            />
          )}
          <button className="btn primary" onClick={() => setCreating(true)}>+ New poster</button>
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
            <button className="btn" onClick={backupAll} title="One project file with every poster. Open it with Open ▾ → Open project file… to restore.">
              Download all posters
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
            <button className="btn primary" onClick={backupAll}>Download all posters</button>
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
              <button className="thumb" onClick={() => open(p)} title="Open" aria-label={`Open ${p.name} preview`}>
                {p.thumbnail ? <img src={p.thumbnail} alt="" /> : <div className="thumb-ph" style={{ aspectRatio: `${p.width}/${p.height}`, background: p.background ?? PALETTES[0].background }} />}
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
                  <button className="btn small-btn" onClick={() => open(p)}>Open</button>
                  <button
                    className="icon-btn"
                    aria-label={`More for ${p.name}`}
                    title="Rename, copy, download, save as template or delete"
                    aria-haspopup="menu"
                    aria-expanded={cardMenu?.poster.id === p.id}
                    onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setCardMenu({ x: r.left, y: r.bottom + 4, poster: p });
                    }}
                  >
                    ⋯
                  </button>
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
          onCopy={async (copy, message, resized) => {
            setResizing(null);
            try {
              await savePoster(copy);
              // a resized copy usually needs a look straight away; an exact copy just joins the list
              if (resized) onOpen(copy, message);
              else refresh();
            } catch (e) {
              setError('Could not save the copy: ' + String(e));
            }
          }}
        />
      )}
      {cardMenu && (
        <ContextMenu
          x={cardMenu.x}
          y={cardMenu.y}
          onClose={() => setCardMenu(null)}
          items={posterActionItems({
            onRename: () => setRenaming({ id: cardMenu.poster.id, name: cardMenu.poster.name }),
            onCopy: () => withPoster(cardMenu.poster, setResizing),
            onDownload: () => withPoster(cardMenu.poster, exportPosterFile),
            onSaveTemplate: () => withPoster(cardMenu.poster, setTemplating),
            onDelete: () => setDeleting(cardMenu.poster),
          })}
        />
      )}
      {templating && (
        <SaveTemplateDialog
          poster={templating}
          onCancel={() => setTemplating(null)}
          onSave={async (name, keepPictures) => {
            const p = templating;
            setTemplating(null);
            try {
              const { saveAsTemplate } = await import('../lib/userTemplates');
              const t = await saveAsTemplate(p, name, { keepPictures });
              setNotice(`Saved “${t.name}” to My templates. Pick it under New poster → My templates.`);
            } catch (e) {
              setError('Could not save the template: ' + String(e));
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
          message="This cannot be undone. Use “Download project file” first if you might want it again."
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

