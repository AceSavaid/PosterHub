import AppearanceMenu from './AppearanceMenu';
import { useEffect, useState } from 'react';
import type { Poster } from '../types';
import { deletePoster, exportPosterFile, listPosters, pickFile, readPosterFile, savePoster } from '../lib/storage';
import { importPptx } from '../lib/pptxImport';
import { uid, PALETTES } from '../model';
import NewPosterDialog from './NewPosterDialog';

const fmtSize = (p: Poster) => `${Math.round(p.width)} × ${Math.round(p.height)} mm · ${p.width > p.height ? 'landscape' : 'portrait'}`;
const fmtDate = (t: number) => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export default function Library({ onOpen }: { onOpen: (p: Poster) => void }) {
  const [posters, setPosters] = useState<Poster[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  const refresh = () => listPosters().then(setPosters).catch((e) => setError(String(e)));
  useEffect(() => {
    refresh();
  }, []);

  async function create(p: Poster) {
    await savePoster(p);
    setCreating(false);
    onOpen(p);
  }

  async function importProject() {
    const f = await pickFile('.json,.poster.json,application/json');
    if (!f) return;
    try {
      const p = await readPosterFile(f);
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
      const r = await importPptx(f);
      const short = Math.min(r.poster.width, r.poster.height);
      const now = Date.now();
      const p: Poster = {
        ...r.poster,
        id: uid(),
        name: f.name.replace(/\.(pptx|potx)$/i, ''),
        version: 1,
        sizePreset: 'custom',
        columns: r.poster.width > r.poster.height ? 4 : 3,
        margin: Math.round(short * 0.03),
        gutter: Math.round(short * 0.025),
        customFonts: [],
        googleFonts: [],
        createdAt: now,
        updatedAt: now,
      };
      await savePoster(p);
      if (r.warnings.length) alert('Imported with notes:\n\n• ' + r.warnings.join('\n• '));
      onOpen(p);
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

  async function rename(p: Poster) {
    const name = prompt('Rename poster', p.name);
    if (!name) return;
    await savePoster({ ...p, name, updatedAt: Date.now() });
    refresh();
  }

  async function remove(p: Poster) {
    if (!confirm(`Delete “${p.name}”? This cannot be undone.\n\nTip: use Export first if you want a backup file.`)) return;
    await deletePoster(p.id);
    refresh();
  }

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
        </div>
      </header>
      <main className="lib-main">
        <div className="lib-title-row">
          <h1>My posters</h1>
          {!!posters?.length && <input className="search" placeholder="Search posters" value={query} onChange={(e) => setQuery(e.target.value)} />}
        </div>
        {error && (
          <div className="banner error" onClick={() => setError('')}>
            {error} <span className="muted">(click to dismiss)</span>
          </div>
        )}
        {busy && <div className="banner">{busy}</div>}
        {posters && posters.length === 0 && (
          <div className="empty">
            <h2>Make your first research poster</h2>
            <p>Start from a layout, or bring in a PowerPoint template your lab or conference already uses.</p>
            <div className="empty-actions">
              <button className="btn primary big" onClick={() => setCreating(true)}>+ New poster</button>
              <button className="btn big" onClick={importTemplate}>Import PowerPoint template</button>
            </div>
            <p className="muted small">Posters are saved in this browser automatically. Use Export → Project file to back them up or move them to another computer.</p>
          </div>
        )}
        <div className="poster-grid">
          {shown.map((p) => (
            <div className="poster-card" key={p.id}>
              <button className="thumb" onClick={() => onOpen(p)} title="Open" aria-label={`Open ${p.name} preview`}>
                {p.thumbnail ? <img src={p.thumbnail} alt="" /> : <div className="thumb-ph" style={{ aspectRatio: `${p.width}/${p.height}`, background: p.palette?.background ?? PALETTES[0].background }} />}
              </button>
              <div className="card-body">
                <div className="card-name" title={p.name}>{p.name}</div>
                <div className="muted small">{fmtSize(p)}</div>
                <div className="muted small">Edited {fmtDate(p.updatedAt)}</div>
                <div className="card-actions">
                  <button className="link" onClick={() => onOpen(p)}>Open</button>
                  <button className="link" onClick={() => rename(p)}>Rename</button>
                  <button className="link" onClick={() => duplicate(p)}>Duplicate</button>
                  <button className="link" onClick={() => exportPosterFile(p)}>Export</button>
                  <button className="link danger" onClick={() => remove(p)}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
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
