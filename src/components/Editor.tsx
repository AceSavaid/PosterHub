import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ChartSpec, ElementType, Poster, PosterElement, ReviewNote } from '../types';
import { MM_TO_PX, makeElement, uid } from '../model';
import { usePosterHistory } from '../lib/usePoster';
import { align, distribute, emptyFigureSlot, findFreeSpot, intersects, matchSize } from '../lib/arrange';
import { canGroup, canUngroup, dropLonelyGroups, expandToGroups, group, groupMembers, regroupCopies, ungroup, wholeGroup } from '../lib/groups';
import { deletePoster, exportPosterFile, fileToDataUrl, pickFile, savePoster } from '../lib/storage';
import { ensurePosterFonts } from '../lib/fonts';
import { copyImageToClipboard, effectiveDpi, exportPdf, exportPng, exportPptx, makeThumbnail } from '../lib/exporters';
import { Canvas } from './Canvas';
import LeftPanel from './LeftPanel';
import Inspector from './Inspector';
import ChartDialog from './ChartDialog';
import ViewMode from './ViewMode';
import { chartCanvases } from './ChartView';
import { Logo } from './Library';
import CheckPanel, { type CheckTab } from './CheckPanel';
import FindPanel from './FindPanel';
import ContextMenu, { type MenuItem } from './ContextMenu';
import { checkPoster, type ImageInfo, type Issue } from '../lib/checks';
import { replaceAllInPoster } from '../lib/textTools';
import { ignoreKey } from '../lib/spelling';
import AppearanceMenu from './AppearanceMenu';
import AuthorsDialog from './AuthorsDialog';
import { PLACEHOLDER_TEXT } from '../lib/checks';
import type { AuthorList } from '../types';
import ConfirmDialog from './ConfirmDialog';
import { useUiPrefs } from '../lib/uiPrefs';
import { htmlToText, sanitizeElement } from '../lib/sanitize';
import ReferencesDialog from './ReferencesDialog';
import { insertCitationAtCaret } from '../lib/refs/caret';
import { refreshMarkersIn } from '../lib/refs/citations';
import { replaceColor } from '../lib/printColor';
import { BLEED_CHOICES } from '../lib/print';
import { NotesLayer, NotesPanel } from './ReviewNotes';
import { cleanText, createNote, loadReviewerName, MAX_NOTE_LENGTH, notePositionFor, openNotes, saveReviewerName } from '../lib/notes';
import VisionMenu, { VisionBanner, VisionFilters, visionFilter } from './VisionFilters';
import type { VisionMode } from '../lib/colorVision';

/** Start of the example reference in starter templates. */
const EXAMPLE_REFS = 'Author, A. (2025). Title of work';
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
  /** A message to show when the poster opens, e.g. notes from a PowerPoint import. */
  notice?: string;
  /** Called once the poster is saved. `viaBack`: the browser's Back button was used. */
  onClose: (viaBack?: boolean) => void;
}

export default function Editor({ initial, notice: initialNotice, onClose }: Props) {
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
  const [refsOpen, setRefsOpen] = useState(false);
  const [chartDialog, setChartDialog] = useState<{ id?: string; spec?: ChartSpec; text?: string } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  /** open authors dialog; `id` is the text box it fills (none = add a new one) */
  const [authorsDialog, setAuthorsDialog] = useState<{ id?: string; initial?: AuthorList; replacing?: boolean } | null>(null);
  const [checkOpen, setCheckOpenRaw] = useState(false);
  const [checkTab, setCheckTab] = useState<CheckTab>('problems');
  const [findOpen, setFindOpenRaw] = useState(false);
  // The check and find panels sit in the same spot, so only one is open at a time.
  const setCheckOpen = useCallback((v: boolean | ((o: boolean) => boolean)) => {
    setCheckOpenRaw((o) => {
      const n = typeof v === 'function' ? v(o) : v;
      if (n) setFindOpenRaw(false);
      return n;
    });
  }, []);
  const setFindOpen = useCallback((v: boolean) => {
    setFindOpenRaw(v);
    if (v) {
      setCheckOpenRaw(false);
      setNotesOpen(false);
    }
  }, []);
  const [vision, setVision] = useState<VisionMode>('normal');
  const [posterMenu, setPosterMenu] = useState<{ x: number; y: number } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; el: PosterElement } | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [dpi, setDpi] = useState(200);
  const [toast, setToast] = useState('');
  const [banner, setBanner] = useState(initialNotice);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saved, setSaved] = useState(true);
  const posterNode = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<number>(undefined);
  const [prefs, setPrefs] = useUiPrefs();
  const [notesOpen, setNotesOpen] = useState(false);
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [reviewer, setReviewer] = useState(loadReviewerName);

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

  const closing = useRef(false);
  async function close(viaBack = false) {
    if (closing.current) return;
    closing.current = true;
    setSelectedId(null);
    setEditingId(null);
    await new Promise((r) => setTimeout(r, 30));
    await saveWithThumbnail();
    onClose(viaBack);
  }

  // The browser's Back button returns to My posters (after saving), like the "My posters" button.
  useEffect(() => {
    const onPop = () => {
      if (!location.hash.startsWith('#/poster/')) close(true);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  });

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

  /** How far down a text box its words reach (mm), so the empty space under short text counts as free. */
  function usedHeight(e: PosterElement) {
    if (!e.style) return e.h;
    const box = posterNode.current?.querySelector<HTMLElement>(`[data-id="${e.id}"]`);
    const body = box?.querySelector<HTMLElement>('.el-body');
    if (!box || !body || !body.textContent?.trim()) return e.h;
    const range = document.createRange();
    range.selectNodeContents(body);
    const bottom = range.getBoundingClientRect().bottom;
    return (bottom - box.getBoundingClientRect().top) / (zoom * MM_TO_PX) + (e.padding ?? 0);
  }

  function revealSoon(id: string) {
    requestAnimationFrame(() => posterNode.current?.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
  }

  /**
   * Adds an element where it won't cover anything: a graph or picture goes into the selected
   * (or nearest) empty figure box, anything else into the free space closest to the middle of the screen.
   */
  function addElement(el: PosterElement, center = true) {
    const media = el.type === 'image' || el.type === 'chart';
    const selectedSlot = selectedPlaceholder();
    // (a new QR code box is a placeholder itself, so it never fills a figure box on its own)
    const ph = media ? selectedSlot ?? (center && !el.placeholder ? emptyFigureSlot(posterRef.current, viewCenter()) : null) : null;
    if (ph) {
      update((d) => {
        const i = d.elements.findIndex((e) => e.id === ph.id);
        d.elements[i] = { ...el, id: ph.id, x: ph.x, y: ph.y, w: ph.w, h: el.type === 'image' ? Math.min(ph.h, ph.w * (el.h / el.w)) : ph.h, fill: el.type === 'chart' ? el.fill : undefined };
      });
      setSelectedId(ph.id);
      revealSoon(ph.id);
      if (!selectedSlot) notify(`Put the ${el.type === 'chart' ? 'graph' : 'picture'} in an empty figure box. Drag it anywhere, or press Ctrl/⌘ Z to undo.`);
      return el;
    }
    if (center) {
      const c = viewCenter();
      const p = posterRef.current;
      const spot = findFreeSpot(p, el.w, el.h, c, usedHeight);
      el.x = spot ? spot.x : Math.max(0, Math.min(p.width - el.w, c.x - el.w / 2));
      el.y = spot ? spot.y : Math.max(0, Math.min(p.height - el.h, c.y - el.h / 2));
    }
    update((d) => void d.elements.push(el));
    setSelectedId(el.id);
    revealSoon(el.id);
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
        delete e.qr;
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

  /** A square, empty QR code box; the link is typed in the inspector. */
  function insertQr() {
    const p = posterRef.current;
    const size = Math.min(p.width, p.height) * 0.15;
    addElement(makeElement('image', p, { w: size, h: size, placeholder: 'QR code', fill: '#ffffff', fit: 'contain' }));
    focusQrLink();
  }

  function focusQrLink() {
    setTimeout(() => document.getElementById('qr-link')?.focus(), 50);
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

  /** Opens the authors tool for the selected box, the template's author line, or a new box. */
  function openAuthors(forId?: string) {
    const els = posterRef.current.elements;
    const sel = els.find((e) => e.id === (forId ?? selectedId));
    if (sel?.authors) return setAuthorsDialog({ id: sel.id, initial: sel.authors });
    if (sel?.style && sel.type !== 'title') return setAuthorsDialog({ id: sel.id, replacing: !!sel.html?.trim() });
    const authorLine = PLACEHOLDER_TEXT.find((t) => t.startsWith('Author One'))!;
    const ph = els.find((e) => e.authors || (e.style && e.html?.includes(authorLine)));
    if (ph) return setAuthorsDialog({ id: ph.id, initial: ph.authors });
    setAuthorsDialog({});
  }

  function saveAuthors(list: AuthorList, html: string) {
    const id = authorsDialog?.id;
    let target = id;
    if (id && posterRef.current.elements.some((e) => e.id === id)) {
      updateElement(id, { authors: list, html });
      setSelectedId(id);
    } else {
      const el = makeElement('subtitle', posterRef.current);
      el.authors = list;
      el.html = html;
      el.h = el.h * 1.6; // room for the affiliation and contact lines
      addElement(el);
      target = el.id;
    }
    setAuthorsDialog(null);
    // Make the affiliation and contact lines fit: a new box grows, while a box that
    // sits in a template slot (e.g. a header band) keeps its size and its text shrinks.
    const isNew = target !== id;
    setTimeout(() => {
      const n = target ? textNode(target) : null;
      if (n && n.scrollHeight > n.clientHeight + 1) (isNew ? growToFit : shrinkToFit)(target);
    }, 50);
  }

  function removeSelected() {
    if (!selectedIds.length) return;
    const ids = new Set(selectedIds);
    update((d) => {
      d.elements = d.elements.filter((e) => !ids.has(e.id));
      dropLonelyGroups(d.elements);
    });
    setSelectedId(null);
  }

  function groupSelected() {
    if (!canGroup(selectedIds, posterRef.current.elements)) return;
    let ids: string[] = [];
    update((d) => void (ids = group(d.elements, selectedIds)));
    setSelectedIds(ids);
    notify('Grouped. They now move and resize together. Ctrl/⌘-click picks one out; Ctrl/⌘ Shift G ungroups.');
  }

  function ungroupSelected() {
    if (!canUngroup(selectedIds, posterRef.current.elements)) return;
    update((d) => void ungroup(d.elements, selectedIds));
  }

  function duplicate(src?: PosterElement, offset = 8) {
    const sources = src ? [src] : posterRef.current.elements.filter((e) => selectedIds.includes(e.id));
    if (!sources.length) return;
    const copies = regroupCopies(sources.map((el) => ({ ...structuredClone(el), id: uid(), x: el.x + offset, y: el.y + offset, locked: false })));
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

  function growToFit(id = selectedId) {
    const n = id && textNode(id);
    if (!n) return;
    const el = posterRef.current.elements.find((e) => e.id === id)!;
    const extra = el.h * MM_TO_PX - n.clientHeight; // padding + border
    updateElement(el.id, { h: (n.scrollHeight + extra) / MM_TO_PX + 0.5 });
  }

  function shrinkToFit(id = selectedId) {
    const n = id && textNode(id);
    if (!n) return;
    const el = posterRef.current.elements.find((e) => e.id === id)!;
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
      const hit = expandToGroups(
        posterRef.current.elements.filter((el) => intersects(box, el) && !el.locked).map((el) => el.id),
        posterRef.current.elements,
      );
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
      if (viewing || chartDialog || authorsDialog || confirmDelete) return;
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
      if (mod && (e.key.toLowerCase() === 'f' || e.key.toLowerCase() === 'h') && !e.altKey) {
        e.preventDefault();
        setEditingId(null);
        setFindOpen(true);
        return;
      }
      if (isTyping(e.target)) return;
      // keys pressed on a note pin or in the notes list are about the note, not the selected elements
      if (e.target instanceof HTMLElement && e.target.closest('.notes-layer, .notes-panel') && !mod) return;
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
      } else if (mod && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (e.shiftKey) ungroupSelected();
        else groupSelected();
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
        if (el?.refList) {
          e.preventDefault();
          setRefsOpen(true);
        } else if (el?.style) {
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
      } else if ((!mod && e.key === '0' && e.shiftKey) || (mod && e.key === '0')) {
        e.preventDefault();
        fit();
      } else if (mod && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        setZoom((z) => Math.min(4, z * 1.25));
      } else if (mod && e.key === '-') {
        e.preventDefault();
        setZoom((z) => Math.max(0.02, z / 1.25));
      }
    };
    const onCopy = (e: ClipboardEvent) => {
      if (isTyping(e.target) || isTyping(document.activeElement) || !selectedId) return;
      const el = posterRef.current.elements.find((x) => x.id === selectedId);
      if (!el) return;
      e.preventDefault();
      internalClipboard = structuredClone(el);
      e.clipboardData?.setData('text/plain', htmlToText(el.html));
      e.clipboardData?.setData(CLIP_MIME, JSON.stringify(el));
      if (e.type === 'cut') removeSelected();
    };
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target) || isTyping(document.activeElement) || viewing || chartDialog || authorsDialog) return;
      const dt = e.clipboardData;
      if (!dt) return;
      const json = dt.getData(CLIP_MIME);
      if (json) {
        e.preventDefault();
        try {
          const el = JSON.parse(json) as PosterElement;
          if (el && typeof el === 'object' && typeof el.type === 'string') duplicate(sanitizeElement(el));
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
      if (text && internalClipboard && text === htmlToText(internalClipboard.html)) {
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

  // ---- review notes (never part of the exported poster node)
  function updateNote(id: string, fn: (n: ReviewNote) => void, coalesce?: string) {
    update((d) => {
      const n = d.notes?.find((x) => x.id === id);
      if (n) fn(n);
    }, coalesce);
  }

  function addNote(onEl?: PosterElement) {
    const p = posterRef.current;
    const el = onEl ?? (selectedIds.length === 1 ? p.elements.find((e) => e.id === selectedId) : undefined);
    const note = createNote(el ? notePositionFor(el, p) : viewCenter(), reviewer, el?.id);
    update((d) => void (d.notes = [...(d.notes ?? []), note]));
    if (!prefs.showNotes) setPrefs({ showNotes: true });
    setEditingId(null);
    setOpenNoteId(note.id);
    if (!reviewer) {
      setCheckOpen(false);
      setNotesOpen(true);
      notify('Tip: type your name in the Notes panel so co-authors can see who left each note.');
    }
  }

  function deleteNote(id: string) {
    update((d) => void (d.notes = (d.notes ?? []).filter((n) => n.id !== id)));
    if (openNoteId === id) setOpenNoteId(null);
    notify('Note deleted. Press Ctrl/⌘ Z to undo.');
  }

  function deleteResolvedNotes() {
    const n = (posterRef.current.notes ?? []).filter((x) => x.resolved).length;
    update((d) => void (d.notes = (d.notes ?? []).filter((x) => !x.resolved)));
    notify(`Deleted ${n} resolved note(s). Press Ctrl/⌘ Z to undo.`);
  }

  function resolveNote(id: string, resolved: boolean) {
    updateNote(id, (n) => void (n.resolved = resolved));
    // a resolved note disappears from the poster unless resolved notes are shown
    if (resolved && !showResolved && openNoteId === id) setOpenNoteId(null);
  }

  function pickNote(id: string) {
    if (!prefs.showNotes) setPrefs({ showNotes: true });
    const n = posterRef.current.notes?.find((x) => x.id === id);
    if (n?.resolved) setShowResolved(true);
    setOpenNoteId(id);
    requestAnimationFrame(() =>
      document.querySelector(`[data-note-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' }),
    );
  }

  // ---- export
  async function runExport(kind: 'pdf' | 'png' | 'pptx' | 'project') {
    setExportOpen(false);
    setSelectedId(null);
    setEditingId(null);
    setOpenNoteId(null);
    const p = posterRef.current;
    await new Promise((r) => setTimeout(r, 50));
    try {
      if (kind === 'project') return exportPosterFile(p);
      notify(kind === 'pptx' ? 'Building PowerPoint…' : kind === 'pdf' ? 'Building print-quality PDF…' : `Rendering at ${effectiveDpi(p, dpi)} dpi… large posters can take a few seconds.`);
      if (kind === 'pdf') {
        const res = await exportPdf(posterNode.current!, p, dpi, (id) => chartCanvases.get(id)?.toDataURL('image/png'), {
          bleedMm: prefs.pdfBleedMm,
          cropMarks: prefs.pdfCropMarks,
        });
        if (!res.vector) {
          notify(`Exported the PDF as a ${effectiveDpi(p, dpi)} dpi image because the sharp version could not be built. Check your downloads.`);
          return;
        }
        if (res.warnings.length) {
          notify('PDF exported. Note: ' + [...new Set(res.warnings)].join(' '));
          return;
        }
      }
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

  function runCheck() {
    const images = new Map<string, ImageInfo>();
    const overflowing = new Set<string>();
    posterNode.current?.querySelectorAll<HTMLElement>(':scope > .el').forEach((n) => {
      const id = n.dataset.id!;
      const img = n.querySelector('img');
      if (img?.naturalWidth) images.set(id, { width: img.naturalWidth });
      if (n.dataset.overflow === 'true') overflowing.add(id);
    });
    const found = checkPoster(posterRef.current, images, overflowing);
    setIssues(found);
    return found;
  }

  // Keep the list current while it is open (and for the export menu hint).
  useEffect(() => {
    const t = setTimeout(runCheck, 300);
    return () => clearTimeout(t);
  }, [poster]); // eslint-disable-line react-hooks/exhaustive-deps

  async function duplicatePoster() {
    const p = posterRef.current;
    const now = Date.now();
    await savePoster({ ...structuredClone(p), id: uid(), name: p.name + ' (copy)', createdAt: now, updatedAt: now });
    notify(`Saved “${p.name} (copy)” to My posters. You are still editing the original.`);
  }

  async function deleteThisPoster() {
    setConfirmDelete(false);
    closing.current = true;
    await deletePoster(posterRef.current.id);
    onClose();
  }

  function copyElement(el: PosterElement) {
    internalClipboard = structuredClone(el);
    navigator.clipboard?.writeText(htmlToText(el.html)).catch(() => {});
    notify('Copied. Press Ctrl/⌘ V on the poster to paste it.');
  }

  function menuItems(el: PosterElement): (MenuItem | '-')[] {
    const many = selectedIds.length > 1;
    const items: (MenuItem | '-')[] = [];
    if (!many && el.style) items.push({ label: 'Edit text', shortcut: 'Enter', onClick: () => setEditingId(el.id) });
    if (!many && el.type === 'image') items.push({ label: el.src ? 'Replace image…' : 'Choose image…', onClick: () => chooseImage(el.id) });
    if (!many && el.type === 'chart') items.push({ label: 'Edit graph…', onClick: () => setChartDialog({ id: el.id, spec: el.chart }) });
    if (items.length) items.push('-');
    if (!many) items.push({ label: 'Copy', shortcut: '⌘/Ctrl C', onClick: () => copyElement(el) });
    if (!many && internalClipboard) items.push({ label: 'Paste', shortcut: '⌘/Ctrl V', onClick: () => duplicate(internalClipboard!) });
    items.push({ label: 'Duplicate', shortcut: '⌘/Ctrl D', onClick: () => duplicate() });
    const els = posterRef.current.elements;
    if (canGroup(selectedIds, els)) items.push({ label: 'Group', shortcut: '⌘/Ctrl G', onClick: groupSelected });
    if (canUngroup(selectedIds, els)) items.push({ label: 'Ungroup', shortcut: '⌘/Ctrl ⇧ G', onClick: ungroupSelected });
    items.push('-');
    if (!many) {
      items.push({ label: 'Bring to front', onClick: () => layer('front') });
      items.push({ label: 'Send to back', onClick: () => layer('back') });
      items.push({ label: el.locked ? 'Unlock' : 'Lock position', onClick: () => updateElement(el.id, { locked: !el.locked }) });
      items.push('-');
      items.push({ label: 'Add note', onClick: () => addNote(el) });
    } else {
      items.push({ label: 'Align left edges', onClick: () => arrange((els, d) => align(els, 'left', { x: d.margin, y: d.margin, w: d.width - 2 * d.margin, h: d.height - 2 * d.margin })) });
      items.push({ label: 'Align top edges', onClick: () => arrange((els, d) => align(els, 'top', { x: d.margin, y: d.margin, w: d.width - 2 * d.margin, h: d.height - 2 * d.margin })) });
    }
    items.push('-');
    items.push({ label: many ? `Delete ${selectedIds.length} elements` : 'Delete', shortcut: 'Del', danger: true, onClick: removeSelected });
    return items;
  }

  function fixIssue(issue: Issue) {
    const fix = issue.fix;
    if (!fix) return;
    update((d) => void Object.assign(d, replaceColor(d, fix.from, fix.to)));
    notify(`Changed ${fix.from.toUpperCase()} to ${fix.to.toUpperCase()} everywhere. Undo with Ctrl+Z if you prefer the old colour.`);
  }

  function pickIssue(id: string, ids?: string[]) {
    if (ids) setSelectedIds(ids);
    else setSelectedId(id);
    posterNode.current?.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  }

  /** Double-click / Enter on text: the reference list opens the references dialog instead of typing. */
  function startEditing(id: string | null) {
    const el = id ? posterRef.current.elements.find((x) => x.id === id) : null;
    if (el?.refList) {
      setEditingId(null);
      setRefsOpen(true);
    } else {
      setEditingId(id);
      // typing in a grouped text box edits just that box
      if (id) setSelectedIds((cur) => (cur.length > 1 ? [id] : cur));
    }
  }

  function cite(refId: string) {
    if (!editingId) return;
    const host = insertCitationAtCaret(refId, posterRef.current);
    if (!host) {
      notify('Click inside the text where the citation should go, then pick the reference.');
      return;
    }
    updateElement(editingId, { html: host.innerHTML });
  }

  function addReferenceList(useSelected: boolean) {
    const p = posterRef.current;
    const target = useSelected ? p.elements.find((x) => x.id === selectedId && x.style && !x.refList) : undefined;
    if (target) {
      update((d) => {
        const el = d.elements.find((x) => x.id === target.id)!;
        el.refList = true;
        el.refTitle = 'References';
      });
      setSelectedId(target.id);
    } else if (p.elements.some((x) => x.style && !x.refList && x.html?.includes(EXAMPLE_REFS))) {
      // a template's example "References … Contact …" footer: the list takes its place, contact details stay beside it
      const ex = p.elements.find((x) => x.style && !x.refList && x.html?.includes(EXAMPLE_REFS))!;
      update((d) => {
        const el = d.elements.find((x) => x.id === ex.id)!;
        const contact = /<b>Contact<\/b>[\s\S]*$/.exec(el.html ?? '')?.[0];
        if (contact) {
          const w = el.w;
          el.w = w * 0.72;
          d.elements.push({ ...structuredClone(el), id: uid(), x: el.x + w * 0.75, w: w * 0.25, html: contact, refList: undefined, refTitle: undefined });
        }
        el.refList = true;
        el.refTitle = 'References';
      });
      setSelectedId(ex.id);
    } else {
      const el = makeElement('text', p, { refList: true, refTitle: 'References', html: '' });
      el.style = { ...el.style!, fontSize: Math.max(8, Math.round(el.style!.fontSize * 0.75)) };
      addElement(el);
    }
    setRefsOpen(false);
    notify('Reference list added. It updates by itself as you cite.');
  }

  function showReferenceList() {
    const el = posterRef.current.elements.find((x) => x.refList);
    setRefsOpen(false);
    if (el) pickIssue(el.id);
  }

  // Keep citation numbers right inside the box being typed in (the stored copy is synced on every change).
  useEffect(() => {
    if (!editingId) return;
    const node = posterNode.current?.querySelector<HTMLElement>(`[data-id="${editingId}"] .el-body`);
    if (node) refreshMarkersIn(node, poster);
  }, [poster, editingId]);

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
  // Leftover example text and empty figure boxes are a to-do list, not errors: they don't turn the
  // Check badge red (a brand-new poster is full of them) but are pointed out again in the Export menu.
  const leftovers = issues.filter((i) => i.leftover).length;
  const problems = issues.filter((i) => i.severity === 'problem').length;
  const badge = { count: problems || issues.filter((i) => i.severity === 'warning' && !i.leftover).length, urgent: problems > 0 };

  if (viewing) return <ViewMode poster={poster} vision={vision} onVision={setVision} onClose={() => setViewing(false)} />;

  return (
    <div className="editor" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <header className="topbar">
        <button className="btn ghost" onClick={() => close()} title="Back to My posters">
          <Logo /> ‹ My posters
        </button>
        <input className="poster-name" value={poster.name} onChange={(e) => update((d) => void (d.name = e.target.value), 'name')} aria-label="Poster name" />
        <button
          className="icon-btn"
          aria-label="Poster options"
          title="Poster options"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setPosterMenu({ x: r.left, y: r.bottom + 4 });
          }}
        >
          ⋯
        </button>
        <span className="muted small save-state">{saved ? 'Saved' : 'Saving…'}</span>
        <div className="spacer" />
        <button className="icon-btn" disabled={!canUndo} onClick={undo} title="Undo (Ctrl/⌘ Z)">↶</button>
        <button className="icon-btn" disabled={!canRedo} onClick={redo} title="Redo (Ctrl/⌘ Shift Z)">↷</button>
        <span className="sep" />
        <button className="icon-btn" onClick={() => setZoom((z) => Math.max(0.02, z / 1.25))} title="Zoom out">−</button>
        <button className="btn ghost zoom-label" onClick={fit} title="Fit to screen (Shift 0)">{Math.round(zoom * 100)}%</button>
        <button className="icon-btn" onClick={() => setZoom((z) => Math.min(4, z * 1.25))} title="Zoom in">+</button>
        <span className="sep" />
        <AppearanceMenu panels label="View">
          <div className="field-label">While editing</div>
          <label className="check" title="Blue lines that show the columns">
            <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> Show column guides
          </label>
          <label className="check" title="Line up with columns and other elements while dragging (hold Alt to skip)">
            <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> Snap while dragging
          </label>
        </AppearanceMenu>
        <VisionMenu mode={vision} onChange={setVision} />
        <span className="sep" />
        <button
          className={'btn check-btn notes-btn' + (notesOpen ? ' active' : '')}
          onClick={() => {
            setCheckOpen(false);
            setFindOpen(false);
            setNotesOpen((o) => !o);
          }}
          title="Comments for co-authors and supervisors. Saved with the poster, never printed."
        >
          Notes
          {openNotes(poster).length > 0 && <span className="badge note-badge">{openNotes(poster).length}</span>}
        </button>
        <button
          className={'btn check-btn' + (checkOpen ? ' active' : '')}
          onClick={() => {
            runCheck();
            setNotesOpen(false);
            setCheckOpen((o) => !o);
          }}
          title="Look for small text, low contrast, blurry images and leftover example text"
        >
          Check
          {badge.count > 0 && (
            <span className={'badge' + (badge.urgent ? '' : ' soft')} aria-label={`${badge.count} ${badge.urgent ? 'problems' : 'things'} to look at`}>
              {badge.count}
            </span>
          )}
        </button>
        <button className={'btn' + (findOpen ? ' active' : '')} onClick={() => setFindOpen(!findOpen)} title="Find and replace words on the poster (Ctrl/⌘ F)">Find</button>
        <button className="btn" onClick={() => setViewing(true)} title="See the poster full screen, without editing tools">Preview</button>
        <button className="btn" onClick={copyImage} title="Copy an image of the poster to share">Copy image</button>
        <div className="menu-wrap">
          <button className="btn primary" onClick={() => setExportOpen((o) => !o)}>Export ▾</button>
          {exportOpen && (
            <div className="menu" onMouseLeave={() => setExportOpen(false)}>
              {issues.some((i) => i.severity === 'problem') && (
                <button
                  className="menu-warn"
                  onClick={() => {
                    setExportOpen(false);
                    setCheckTab('problems');
                    setCheckOpen(true);
                  }}
                >
                  <strong>⛔ {issues.filter((i) => i.severity === 'problem').length} problem(s) found</strong>
                  <span>Review them before printing</span>
                </button>
              )}
              {leftovers > 0 && (
                <button
                  className="menu-note"
                  onClick={() => {
                    setExportOpen(false);
                    setCheckOpen(true);
                  }}
                >
                  <strong>
                    {leftovers} box{leftovers > 1 ? 'es' : ''} still {leftovers > 1 ? 'have' : 'has'} example text or no picture
                  </strong>
                  <span>Show me which</span>
                </button>
              )}
              {issues.some((i) => i.id.startsWith('cmyk-')) && (
                <button
                  className="menu-note"
                  onClick={() => {
                    setExportOpen(false);
                    setCheckTab('problems');
                    setCheckOpen(true);
                  }}
                >
                  <strong>🎨 {issues.filter((i) => i.id.startsWith('cmyk-')).length} colour(s) will print duller</strong>
                  <span>See printable alternatives</span>
                </button>
              )}
              <button onClick={() => runExport('pdf')}>
                <strong>PDF</strong>
                <span>
                  For printing: sharp text and graphics at any size
                  {(prefs.pdfBleedMm > 0 || prefs.pdfCropMarks) &&
                    ` · with ${[prefs.pdfBleedMm > 0 && 'bleed', prefs.pdfCropMarks && 'crop marks'].filter(Boolean).join(' and ')}`}
                </span>
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
              <div className="menu-print">
                <strong>For the print shop (PDF)</strong>
                <label>
                  Bleed
                  <select aria-label="Bleed" value={prefs.pdfBleedMm} onChange={(e) => setPrefs({ pdfBleedMm: +e.target.value })}>
                    {BLEED_CHOICES.map((b) => (
                      <option key={b.mm} value={b.mm}>{b.label}</option>
                    ))}
                  </select>
                </label>
                <label className="check">
                  <input type="checkbox" checked={prefs.pdfCropMarks} onChange={(e) => setPrefs({ pdfCropMarks: e.target.checked })} /> Crop marks
                </label>
                <small>Only if your printer asks. Bleed extends edge-to-edge colours and photos past the edge so nothing white shows after trimming; crop marks show where to cut.</small>
              </div>
              <label className="menu-dpi">
                Image quality for PNG
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
      {banner && (
        <div className="notice-bar" role="status">
          <div>{banner}</div>
          <button className="icon-btn" aria-label="Dismiss" onClick={() => setBanner(undefined)}>×</button>
        </div>
      )}
      <div className={`workspace${prefs.swapPanels ? ' swapped' : ''}`}>
        {prefs.showTools ? (
          <LeftPanel
            poster={poster}
            update={update}
            onInsert={insert}
            onInsertImage={() => chooseImage()}
            onInsertChart={() => setChartDialog({})}
            onInsertQr={insertQr}
            onInsertAuthors={() => openAuthors()}
            onInsertReferences={() => setRefsOpen(true)}
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
          <VisionBanner mode={vision} onChange={setVision} />
          <div className="stage-inner" style={{ filter: visionFilter(vision) }}>
            <Canvas
              ref={posterNode}
              poster={poster}
              zoom={zoom}
              showGrid={showGrid}
              snap={snap}
              selectedIds={selectedIds}
              editingId={editingId}
              onSelect={(id, additive, only) =>
                setSelectedIds((cur) => {
                  if (only) return [id];
                  const members = groupMembers(id, posterRef.current.elements);
                  if (additive) return cur.includes(id) ? cur.filter((x) => !members.includes(x)) : [...cur, ...members.filter((x) => !cur.includes(x))];
                  return cur.includes(id) ? cur : members;
                })
              }
              onMoveMany={(moves, key) =>
                update((d) => {
                  for (const m of moves) {
                    const el = d.elements.find((e) => e.id === m.id);
                    if (el) Object.assign(el, m.patch);
                  }
                }, key)
              }
              onEdit={startEditing}
              onChange={(id, patch, key) => updateElement(id, patch, key)}
              onCommitText={(id, html) => updateElement(id, { html })}
              onContextMenu={(el, x, y) => setMenu({ x, y, el })}
              notes={
                prefs.showNotes && (poster.notes?.length ?? 0) > 0 ? (
                  <NotesLayer
                    poster={poster}
                    zoom={zoom}
                    showResolved={showResolved}
                    openId={openNoteId}
                    onOpen={setOpenNoteId}
                    onMove={(id, x, y, key) => updateNote(id, (n) => Object.assign(n, { x, y }), key)}
                    onText={(id, text) => updateNote(id, (n) => void (n.text = cleanText(text, MAX_NOTE_LENGTH)), 'note-text-' + id)}
                    onResolve={resolveNote}
                    onDelete={deleteNote}
                  />
                ) : null
              }
              onActivate={(el) => {
                if (el.type === 'image' && (el.qr || el.placeholder === 'QR code')) focusQrLink();
                else if (el.type === 'image') chooseImage(el.id);
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
            grouped={!!wholeGroup(selectedIds, poster.elements)}
            onGroup={canGroup(selectedIds, poster.elements) ? groupSelected : undefined}
            onUngroup={canUngroup(selectedIds, poster.elements) ? ungroupSelected : undefined}
            overflow={overflow}
            onShrinkText={() => shrinkToFit()}
            onGrowBox={() => growToFit()}
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
            onEditAuthors={() => selected && openAuthors(selected.id)}
            onCite={cite}
            onOpenReferences={() => setRefsOpen(true)}
            onSetStyle={(st) => update((d) => void (d.citationStyle = st))}
          />
        ) : (
          <button className="panel-reveal props" title="Show properties panel" aria-label="Show properties panel" onClick={() => setPrefs({ showProperties: true })}>
            <span>Properties</span>
          </button>
        )}
      </div>
      {posterMenu && (
        <ContextMenu
          x={posterMenu.x}
          y={posterMenu.y}
          onClose={() => setPosterMenu(null)}
          items={[
            { label: 'Duplicate this poster', onClick: duplicatePoster },
            { label: 'Download project file', onClick: () => exportPosterFile(posterRef.current) },
            '-',
            { label: 'Delete this poster…', danger: true, onClick: () => setConfirmDelete(true) },
          ]}
        />
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.el)} onClose={() => setMenu(null)} />}
      {checkOpen && (
        <CheckPanel
          issues={issues}
          poster={poster}
          tab={checkTab}
          onTab={setCheckTab}
          onPick={pickIssue}
          onPickNote={pickNote}
          onPreview={setVision}
          onFix={fixIssue}
          onPickMany={(ids) => ids[0] && pickIssue(ids[0], ids)}
          onFixWord={(word, replacement) => {
            setEditingId(null);
            let n = 0;
            update((d) => {
              n = replaceAllInPoster(d, word, replacement, { matchCase: true, wholeWord: true });
            });
            notify(`Changed “${word}” to “${replacement}”${n > 1 ? ` in ${n} places` : ''}.`);
          }}
          onIgnoreWord={(word) =>
            update((d) => {
              const list = d.ignoredWords ?? [];
              if (!list.some((w) => ignoreKey(w) === ignoreKey(word))) d.ignoredWords = [...list, word];
            })
          }
          onWordLimit={(n) => update((d) => void (d.wordLimit = n), 'word-limit')}
          onClose={() => setCheckOpen(false)}
        />
      )}
      {findOpen && (
        <FindPanel
          poster={poster}
          posterNode={posterNode.current}
          onPick={(id) => pickIssue(id)}
          onChange={(fn) => {
            setEditingId(null);
            update(fn);
          }}
          onNotify={notify}
          onClose={() => setFindOpen(false)}
        />
      )}
      {notesOpen && (
        <NotesPanel
          poster={poster}
          reviewer={reviewer}
          onReviewer={(name) => {
            setReviewer(name);
            saveReviewerName(name);
          }}
          showNotes={prefs.showNotes}
          onShowNotes={(show) => {
            setPrefs({ showNotes: show });
            if (!show) setOpenNoteId(null);
          }}
          showResolved={showResolved}
          onShowResolved={setShowResolved}
          onAdd={() => addNote()}
          onPick={pickNote}
          onResolve={resolveNote}
          onDelete={deleteNote}
          onDeleteResolved={deleteResolvedNotes}
          onClose={() => setNotesOpen(false)}
        />
      )}
      <VisionFilters />
      {chartDialog && <ChartDialog poster={poster} initial={chartDialog.spec} initialText={chartDialog.text} onSave={saveChart} onCancel={() => setChartDialog(null)} />}
      {authorsDialog && <AuthorsDialog initial={authorsDialog.initial} replacing={authorsDialog.replacing} onSave={saveAuthors} onCancel={() => setAuthorsDialog(null)} />}
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete “${poster.name}”?`}
          message="This cannot be undone. Use “Download project file” first if you might want it again."
          confirmLabel="Delete poster"
          danger
          onConfirm={deleteThisPoster}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
      {refsOpen && (
        <ReferencesDialog
          poster={poster}
          update={update}
          selectedTextId={selected?.style && !selected.refList ? selected.id : null}
          onAddList={addReferenceList}
          onShowList={showReferenceList}
          onClose={() => setRefsOpen(false)}
        />
      )}
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
