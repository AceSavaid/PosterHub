import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ChartSpec, ElementType, Poster, PosterElement } from '../types';
import { MM_TO_PX, makeElement, uid } from '../model';
import { usePosterHistory } from '../lib/usePoster';
import { align, distribute, intersects, matchSize } from '../lib/arrange';
import { exportPosterFile, fileToDataUrl, pickFile, savePoster } from '../lib/storage';
import { ensurePosterFonts } from '../lib/fonts';
import { copyImageToClipboard, effectiveDpi, exportPdf, exportPng, exportPptx, makeThumbnail } from '../lib/exporters';
import { Canvas } from './Canvas';
import LeftPanel from './LeftPanel';
import Inspector from './Inspector';
import ChartDialog from './ChartDialog';
import ViewMode from './ViewMode';
import { chartCanvases } from './ChartView';
import { Logo } from './Library';
import AppearanceMenu from './AppearanceMenu';
import { useUiPrefs } from '../lib/uiPrefs';

const CLIP_MIME = 'application/x-posterhub-element';
let internalClipboard: PosterElement | null = null;

async function imageFileToDataUrl(file: Blob, maxSide = 4000): Promise<{ src: string; ratio: number }> {
  const src = await fileToDataUrl(file);
  const img = new Image();
  img.src = src;
  await img.decode();
  const ratio = img.naturalWidth / img.naturalHeight || 1;
  if (Math.max(img.naturalWidth, img.naturalHeight) <= maxSide || file.type === 'image/svg+xml') return { src, ratio };
  const k = maxSide / Math.max(img.naturalWidth, img.naturalHeight);
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k);
  c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return { src: c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.92), ratio };
}

interface Props {
  initial: Poster;
  onClose: () => void;
}

export default function Editor({ initial, onClose }: Props) {
  const { poster, update, updateElement, undo, redo, canUndo, canRedo, ref: posterRef } = usePosterHistory(initial);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  /** the primary (last clicked) selection */
  const selectedId = selectedIds[selectedIds.length - 1] ?? null;
  const setSelectedId = useCallback((id: string | null) => setSelectedIds(id ? [id] : []), []);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [overflow, setOverflow] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.2);
  const [showGrid, setShowGrid] = useState(true);
  const [snap, setSnap] = useState(true);
  const [viewing, setViewing] = useState(false);
  const [chartDialog, setChartDialog] = useState<{ id?: string; spec?: ChartSpec; text?: string } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [dpi, setDpi] = useState(200);
  const [toast, setToast] = useState('');
  const [saved, setSaved] = useState(true);
  const posterNode = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<number>(undefined);
  const [prefs, setPrefs] = useUiPrefs();

  const notify = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 4000);
  }, []);

  // ---- fit to screen on open
  const fit = useCallback(() => {
    const s = scroller.current;
    if (!s) return;
    const p = posterRef.current;
    const z = Math.min((s.clientWidth - 64) / (p.width * MM_TO_PX), (s.clientHeight - 64) / (p.height * MM_TO_PX));
    setZoom(Math.max(0.02, Math.min(4, z)));
  }, [posterRef]);
  useEffect(() => {
    fit();
  }, [fit, prefs.showTools, prefs.showProperties]);

  // ---- fonts + autosave
  useEffect(() => {
    ensurePosterFonts(poster);
  }, [poster.headingFont, poster.bodyFont, poster.customFonts, poster.googleFonts]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (poster === initial) return;
    setSaved(false);
    const t = setTimeout(() => savePoster(posterRef.current).then(() => setSaved(true)), 600);
    return () => clearTimeout(t);
  }, [poster, initial, posterRef]);

  async function saveWithThumbnail() {
    const p = posterRef.current;
    const thumb = posterNode.current ? await makeThumbnail(posterNode.current, p) : undefined;
    await savePoster({ ...p, thumbnail: thumb ?? p.thumbnail });
    setSaved(true);
  }

  async function close() {
    setSelectedId(null);
    setEditingId(null);
    await new Promise((r) => setTimeout(r, 30));
    await saveWithThumbnail();
    onClose();
  }

  // ---- element helpers
  function viewCenter() {
    const s = scroller.current;
    const p = posterRef.current;
    if (!s || !posterNode.current) return { x: p.width / 2, y: p.height / 2 };
    const r = posterNode.current.getBoundingClientRect();
    const sr = s.getBoundingClientRect();
    const k = zoom * MM_TO_PX;
    return {
      x: Math.min(p.width, Math.max(0, (sr.left + sr.width / 2 - r.left) / k)),
      y: Math.min(p.height, Math.max(0, (sr.top + sr.height / 2 - r.top) / k)),
    };
  }

  /** An empty image placeholder that is selected gets filled instead of adding a new element. */
  function selectedPlaceholder() {
    const el = posterRef.current.elements.find((e) => e.id === selectedId);
    return el && el.type === 'image' && !el.src ? el : null;
  }

  function addElement(el: PosterElement, center = true) {
    const ph = selectedPlaceholder();
    if (ph && (el.type === 'image' || el.type === 'chart')) {
      update((d) => {
        const i = d.elements.findIndex((e) => e.id === ph.id);
        d.elements[i] = { ...el, id: ph.id, x: ph.x, y: ph.y, w: ph.w, h: el.type === 'image' ? Math.min(ph.h, ph.w * (el.h / el.w)) : ph.h, fill: el.type === 'chart' ? el.fill : undefined };
      });
      return el;
    }
    if (center) {
      const c = viewCenter();
      const p = posterRef.current;
      el.x = Math.max(0, Math.min(p.width - el.w, c.x - el.w / 2));
      el.y = Math.max(0, Math.min(p.height - el.h, c.y - el.h / 2));
    }
    update((d) => void d.elements.push(el));
    setSelectedId(el.id);
    return el;
  }

  function insert(type: ElementType, extra?: Partial<PosterElement>) {
    const el = makeElement(type, posterRef.current, extra);
    addElement(el);
    if (el.style) setEditingId(el.id);
  }

  async function insertImageFile(file: Blob, at?: { x: number; y: number }, replaceId?: string) {
    const { src, ratio } = await imageFileToDataUrl(file);
    if (replaceId) {
      updateElement(replaceId, (e) => {
        e.src = src;
        if (!e.src || e.fit !== 'cover') e.h = e.w / ratio;
      });
      return;
    }
    const base = makeElement('image', posterRef.current);
    base.src = src;
    base.h = base.w / ratio;
    if (at) {
      base.x = at.x - base.w / 2;
      base.y = at.y - base.h / 2;
    }
    addElement(base, !at);
  }

  async function chooseImage(replaceId?: string) {
    const f = await pickFile('image/*');
    if (f) await insertImageFile(f, undefined, replaceId);
  }

  function saveChart(spec: ChartSpec) {
    const id = chartDialog?.id;
    if (id) updateElement(id, { chart: spec });
    else {
      const el = makeElement('chart', posterRef.current);
      el.chart = spec;
      addElement(el);
    }
    setChartDialog(null);
  }

  function removeSelected() {
    if (!selectedIds.length) return;
    const ids = new Set(selectedIds);
    update((d) => void (d.elements = d.elements.filter((e) => !ids.has(e.id))));
    setSelectedId(null);
  }

  function duplicate(src?: PosterElement, offset = 8) {
    const sources = src ? [src] : posterRef.current.elements.filter((e) => selectedIds.includes(e.id));
    if (!sources.length) return;
    const copies = sources.map((el) => ({ ...structuredClone(el), id: uid(), x: el.x + offset, y: el.y + offset, locked: false }));
    update((d) => void d.elements.push(...copies));
    setSelectedIds(copies.map((c) => c.id));
  }

  function arrange(fn: (els: PosterElement[], d: Poster) => void) {
    const ids = new Set(selectedIds);
    update((d) => {
      // keep the order the user selected them in (the first one is the reference for "match size")
      const els = selectedIds.map((id) => d.elements.find((e) => e.id === id)).filter((e): e is PosterElement => !!e && ids.has(e.id));
      fn(els, d);
    });
  }

  /** Text that doesn't fit its box: measured from the rendered poster. */
  function textNode(id: string) {
    return posterNode.current?.querySelector<HTMLElement>(`[data-id="${id}"] .el-body`) ?? null;
  }

  useLayoutEffect(() => {
    const n = selectedId ? textNode(selectedId) : null;
    setOverflow(!!n && n.scrollHeight > n.clientHeight + 1);
  });

  function growToFit() {
    const n = selectedId && textNode(selectedId);
    if (!n) return;
    const el = posterRef.current.elements.find((e) => e.id === selectedId)!;
    const extra = el.h * MM_TO_PX - n.clientHeight; // padding + border
    updateElement(el.id, { h: (n.scrollHeight + extra) / MM_TO_PX + 0.5 });
  }

  function shrinkToFit() {
    const n = selectedId && textNode(selectedId);
    if (!n) return;
    const el = posterRef.current.elements.find((e) => e.id === selectedId)!;
    const original = n.style.fontSize;
    let size = el.style!.fontSize;
    while (size > 4 && n.scrollHeight > n.clientHeight + 1) {
      size = Math.round((size - Math.max(0.5, size * 0.03)) * 2) / 2;
      n.style.fontSize = `${size}pt`;
    }
    n.style.fontSize = original;
    updateElement(el.id, (e) => void (e.style!.fontSize = size));
  }

  /** Rubber-band selection: drag on an empty part of the poster or the grey area. */
  function startMarquee(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const additive = e.shiftKey;
    const start = { x: e.clientX, y: e.clientY };
    const before = additive ? selectedIds : [];
    let moved = false;
    const toPoster = (cx: number, cy: number) => {
      const r = posterNode.current!.getBoundingClientRect();
      const k = zoom * MM_TO_PX;
      return { x: (cx - r.left) / k, y: (cy - r.top) / k };
    };
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4) return;
      moved = true;
      setMarquee({ x0: start.x, y0: start.y, x1: ev.clientX, y1: ev.clientY });
      const a = toPoster(start.x, start.y);
      const b = toPoster(ev.clientX, ev.clientY);
      const box = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
      const hit = posterRef.current.elements.filter((el) => intersects(box, el) && !el.locked).map((el) => el.id);
      setSelectedIds([...before.filter((id) => !hit.includes(id)), ...hit]);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setMarquee(null);
      if (!moved && !additive) setSelectedId(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function layer(dir: 'front' | 'back' | 'up' | 'down') {
    update((d) => {
      const i = d.elements.findIndex((e) => e.id === selectedId);
      if (i < 0) return;
      const [el] = d.elements.splice(i, 1);
      const j = dir === 'front' ? d.elements.length : dir === 'back' ? 0 : dir === 'up' ? Math.min(d.elements.length, i + 1) : Math.max(0, i - 1);
      d.elements.splice(j, 0, el);
    });
  }

  // ---- keyboard, clipboard, drag & drop
  useEffect(() => {
    const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    const onKey = (e: KeyboardEvent) => {
      if (viewing || chartDialog) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveWithThumbnail().then(() => notify('Saved to My posters.'));
        return;
      }
      if (mod && e.key === '\\') {
        e.preventDefault();
        const anyShown = prefs.showTools || prefs.showProperties;
        setPrefs({ showTools: !anyShown, showProperties: !anyShown });
        return;
      }
      if (isTyping(e.target)) return;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicate();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.length) {
          e.preventDefault();
          removeSelected();
        }
      } else if (e.key === 'Escape') {
        setSelectedId(null);
      } else if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelectedIds(posterRef.current.elements.filter((x) => !x.locked).map((x) => x.id));
      } else if (e.key === 'Enter' && selectedId) {
        const el = posterRef.current.elements.find((x) => x.id === selectedId);
        if (el?.style) {
          e.preventDefault();
          setEditingId(el.id);
        }
      } else if (e.key.startsWith('Arrow') && selectedId) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        const ids = new Set(selectedIds);
        update((d) => {
          for (const el of d.elements)
            if (ids.has(el.id) && !el.locked) {
              el.x += dx;
              el.y += dy;
            }
        }, 'nudge');
      } else if (!mod && e.key === '0' && e.shiftKey) fit();
    };
    const onCopy = (e: ClipboardEvent) => {
      if (isTyping(e.target) || isTyping(document.activeElement) || !selectedId) return;
      const el = posterRef.current.elements.find((x) => x.id === selectedId);
      if (!el) return;
      e.preventDefault();
      internalClipboard = structuredClone(el);
      const div = document.createElement('div');
      div.innerHTML = el.html ?? '';
      e.clipboardData?.setData('text/plain', div.innerText || div.textContent || '');
      e.clipboardData?.setData(CLIP_MIME, JSON.stringify(el));
      if (e.type === 'cut') removeSelected();
    };
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target) || isTyping(document.activeElement) || viewing || chartDialog) return;
      const dt = e.clipboardData;
      if (!dt) return;
      const json = dt.getData(CLIP_MIME);
      if (json) {
        e.preventDefault();
        try {
          duplicate(JSON.parse(json));
        } catch {
          /* ignore */
        }
        return;
      }
      const img = Array.from(dt.files).find((f) => f.type.startsWith('image/'));
      if (img) {
        e.preventDefault();
        insertImageFile(img);
        return;
      }
      const text = dt.getData('text/plain');
      if (text && internalClipboard && text === (() => { const d = document.createElement('div'); d.innerHTML = internalClipboard.html ?? ''; return d.innerText || d.textContent || ''; })()) {
        e.preventDefault();
        duplicate(internalClipboard);
        return;
      }
      if (text) {
        e.preventDefault();
        // Tab-separated text with several lines looks like spreadsheet cells: offer a graph.
        if (/\t/.test(text) && text.trim().split('\n').length > 2) {
          setChartDialog({ text: text.replace(/\t/g, ',') });
          return;
        }
        const el = makeElement('text', posterRef.current);
        const div = document.createElement('div');
        div.textContent = text;
        el.html = div.innerHTML.replace(/\n/g, '<br>');
        addElement(el);
      }
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCopy);
    document.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCopy);
      document.removeEventListener('paste', onPaste);
    };
  });

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    const r = posterNode.current!.getBoundingClientRect();
    const k = zoom * MM_TO_PX;
    const at = { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k };
    const target = (e.target as HTMLElement).closest('[data-id]')?.getAttribute('data-id');
    const targetEl = posterRef.current.elements.find((x) => x.id === target);
    for (const f of files) {
      if (f.type.startsWith('image/')) insertImageFile(f, at, targetEl?.type === 'image' ? targetEl.id : undefined);
      else if (/\.(csv|tsv|txt)$/i.test(f.name) || f.type === 'text/csv')
        f.text().then((text) => setChartDialog(targetEl?.type === 'chart' ? { id: targetEl.id, text } : { text }));
    }
  }

  // ---- export
  async function runExport(kind: 'pdf' | 'png' | 'pptx' | 'project') {
    setExportOpen(false);
    setSelectedId(null);
    setEditingId(null);
    const p = posterRef.current;
    await new Promise((r) => setTimeout(r, 50));
    try {
      if (kind === 'project') return exportPosterFile(p);
      notify(kind === 'pptx' ? 'Building PowerPoint…' : `Rendering at ${effectiveDpi(p, dpi)} dpi… large posters can take a few seconds.`);
      if (kind === 'pdf') await exportPdf(posterNode.current!, p, dpi);
      if (kind === 'png') await exportPng(posterNode.current!, p, dpi);
      if (kind === 'pptx') {
        const images = new Map<string, string>();
        chartCanvases.forEach((c, id) => images.set(id, c.toDataURL('image/png')));
        const k = await exportPptx(p, images);
        if (k < 1) {
          notify(`PowerPoint slides max out at 56 inches, so the slide was scaled to ${Math.round(k * 100)}%. Print it at ${Math.round(100 / k)}% to get full size.`);
          return;
        }
      }
      notify('Export finished. Check your downloads.');
    } catch (err) {
      console.error(err);
      notify('Export failed: ' + (err as Error).message);
    }
  }

  async function copyImage() {
    setSelectedId(null);
    setEditingId(null);
    await new Promise((r) => setTimeout(r, 50));
    try {
      await copyImageToClipboard(posterNode.current!, posterRef.current);
      notify('Poster image copied. Paste it into an email, chat or document.');
    } catch (err) {
      notify((err as Error).message || 'Could not copy the image.');
    }
  }

  const selected = poster.elements.find((e) => e.id === selectedId) ?? null;

  if (viewing) return <ViewMode poster={poster} onClose={() => setViewing(false)} />;

  return (
    <div className="editor" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <header className="topbar">
        <button className="btn ghost" onClick={close} title="Back to My posters">
          <Logo /> ‹ My posters
        </button>
        <input className="poster-name" value={poster.name} onChange={(e) => update((d) => void (d.name = e.target.value), 'name')} aria-label="Poster name" />
        <span className="muted small save-state">{saved ? 'Saved' : 'Saving…'}</span>
        <div className="spacer" />
        <button className="icon-btn" disabled={!canUndo} onClick={undo} title="Undo (Ctrl/⌘ Z)">↶</button>
        <button className="icon-btn" disabled={!canRedo} onClick={redo} title="Redo (Ctrl/⌘ Shift Z)">↷</button>
        <span className="sep" />
        <button className="icon-btn" onClick={() => setZoom((z) => Math.max(0.02, z / 1.25))} title="Zoom out">−</button>
        <button className="btn ghost zoom-label" onClick={fit} title="Fit to screen (Shift 0)">{Math.round(zoom * 100)}%</button>
        <button className="icon-btn" onClick={() => setZoom((z) => Math.min(4, z * 1.25))} title="Zoom in">+</button>
        <span className="sep" />
        <label className="toggle" title="Show column guides">
          <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> Guides
        </label>
        <label className="toggle" title="Snap to columns and other elements">
          <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> Snap
        </label>
        <AppearanceMenu panels />
        <span className="sep" />
        <button className="btn" onClick={() => setViewing(true)}>View</button>
        <button className="btn" onClick={copyImage} title="Copy an image of the poster to share">Copy image</button>
        <div className="menu-wrap">
          <button className="btn primary" onClick={() => setExportOpen((o) => !o)}>Export ▾</button>
          {exportOpen && (
            <div className="menu" onMouseLeave={() => setExportOpen(false)}>
              <button onClick={() => runExport('pdf')}>
                <strong>PDF</strong>
                <span>For printing</span>
              </button>
              <button onClick={() => runExport('pptx')}>
                <strong>PowerPoint (.pptx)</strong>
                <span>Editable text, shapes and native charts</span>
              </button>
              <button onClick={() => runExport('png')}>
                <strong>PNG image</strong>
                <span>For web, slides or social media</span>
              </button>
              <button onClick={() => runExport('project')}>
                <strong>Project file (.poster.json)</strong>
                <span>Back up, or open on another computer</span>
              </button>
              <label className="menu-dpi">
                Image quality for PDF / PNG
                <select value={dpi} onChange={(e) => setDpi(+e.target.value)}>
                  <option value={100}>Draft (100 dpi)</option>
                  <option value={150}>Good (150 dpi)</option>
                  <option value={200}>High (200 dpi)</option>
                  <option value={300}>Print (300 dpi)</option>
                </select>
                {effectiveDpi(poster, dpi) < dpi && <small>Capped at {effectiveDpi(poster, dpi)} dpi for this size by browser limits.</small>}
              </label>
            </div>
          )}
        </div>
      </header>
      <div className={`workspace${prefs.swapPanels ? ' swapped' : ''}`}>
        {prefs.showTools ? (
          <LeftPanel
            poster={poster}
            update={update}
            onInsert={insert}
            onInsertImage={() => chooseImage()}
            onInsertChart={() => setChartDialog({})}
            notify={notify}
          />
        ) : (
          <button className="panel-reveal tools" title="Show tools panel" aria-label="Show tools panel" onClick={() => setPrefs({ showTools: true })}>
            <span>Tools</span>
          </button>
        )}
        <div
          className="stage"
          ref={scroller}
          onPointerDown={startMarquee}
          onWheel={(e) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            e.preventDefault();
            setZoom((z) => Math.max(0.02, Math.min(4, z * (e.deltaY < 0 ? 1.1 : 1 / 1.1))));
          }}
        >
          <div className="stage-inner">
            <Canvas
              ref={posterNode}
              poster={poster}
              zoom={zoom}
              showGrid={showGrid}
              snap={snap}
              selectedIds={selectedIds}
              editingId={editingId}
              onSelect={(id, additive) =>
                setSelectedIds((cur) => (additive ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : cur.includes(id) ? cur : [id]))
              }
              onMoveMany={(moves, key) =>
                update((d) => {
                  for (const m of moves) {
                    const el = d.elements.find((e) => e.id === m.id);
                    if (el) Object.assign(el, m.patch);
                  }
                }, key)
              }
              onEdit={setEditingId}
              onChange={(id, patch, key) => updateElement(id, patch, key)}
              onCommitText={(id, html) => updateElement(id, { html })}
              onActivate={(el) => {
                if (el.type === 'image') chooseImage(el.id);
                if (el.type === 'chart') setChartDialog({ id: el.id, spec: el.chart });
              }}
            />
          </div>
        </div>
        {prefs.showProperties ? (
          <Inspector
            poster={poster}
            el={selectedIds.length > 1 ? null : selected}
            multi={selectedIds.length}
            overflow={overflow}
            onShrinkText={shrinkToFit}
            onGrowBox={growToFit}
            onAlign={(mode) => arrange((els, d) => align(els, mode, { x: d.margin, y: d.margin, w: d.width - 2 * d.margin, h: d.height - 2 * d.margin }))}
            onDistribute={(axis) => arrange((els) => distribute(els, axis))}
            onMatchSize={(dim) => arrange((els) => matchSize(els, dim))}
            editing={!!editingId && editingId === selectedId}
            onChange={(patch, key) => selected && updateElement(selected.id, patch, key)}
            onDelete={removeSelected}
            onDuplicate={() => duplicate()}
            onLayer={layer}
            onReplaceImage={() => selected && chooseImage(selected.id)}
            onEditChart={() => selected && setChartDialog({ id: selected.id, spec: selected.chart })}
          />
        ) : (
          <button className="panel-reveal props" title="Show properties panel" aria-label="Show properties panel" onClick={() => setPrefs({ showProperties: true })}>
            <span>Properties</span>
          </button>
        )}
      </div>
      {chartDialog && <ChartDialog poster={poster} initial={chartDialog.spec} initialText={chartDialog.text} onSave={saveChart} onCancel={() => setChartDialog(null)} />}
      {toast && <div className="toast">{toast}</div>}
      {marquee && (
        <div
          className="marquee"
          style={{ left: Math.min(marquee.x0, marquee.x1), top: Math.min(marquee.y0, marquee.y1), width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0) }}
        />
      )}
    </div>
  );
}
