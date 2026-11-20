import { useState } from 'react';
import type { ElementType, Poster, PosterElement } from '../types';
import { applyLayout, describeReport } from '../lib/relayout';
import { PALETTE_ROLES, TEMPLATES, templateDef, typeScale, type TemplateId } from '../model';
import { SizeFields } from './SizeFields';
import { PaletteSwatches } from './PaletteSwatches';
import { FontSelect } from './FontSelect';
import { fileToDataUrl, pickFile } from '../lib/storage';
import { fontNameFromFile, loadGoogleFont, registerCustomFont } from '../lib/fonts';
import { importPptx } from '../lib/pptxImport';
import { askConfirm } from '../lib/dialogs';
import { SHAPE_CHOICES } from '../lib/shapes';

type Tab = 'insert' | 'layout' | 'design';

interface Props {
  poster: Poster;
  update: (fn: (d: Poster) => void, coalesce?: string) => void;
  onInsert: (type: ElementType, extra?: Partial<PosterElement>) => void;
  onInsertImage: () => void;
  onInsertChart: () => void;
  onInsertQr: () => void;
  onInsertAuthors: () => void;
  onInsertReferences: () => void;
  onInsertTable: () => void;
  onInsertEquation: () => void;
  notify: (msg: string) => void;
}

export default function LeftPanel({ poster, update, onInsert, onInsertImage, onInsertChart, onInsertQr, onInsertAuthors, onInsertReferences, onInsertTable, onInsertEquation, notify }: Props) {
  const [tab, setTab] = useState<Tab>('insert');
  return (
    <aside className="panel left">
      <div className="tabs">
        {(['insert', 'layout', 'design'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      <div className="panel-body">
        {tab === 'insert' && <InsertTab onInsert={onInsert} onInsertImage={onInsertImage} onInsertChart={onInsertChart} onInsertQr={onInsertQr} onInsertAuthors={onInsertAuthors} onInsertReferences={onInsertReferences} onInsertTable={onInsertTable} onInsertEquation={onInsertEquation} />}
        {tab === 'layout' && <LayoutTab poster={poster} update={update} notify={notify} />}
        {tab === 'design' && <DesignTab poster={poster} update={update} notify={notify} />}
      </div>
    </aside>
  );
}

function InsertTab({ onInsert, onInsertImage, onInsertChart, onInsertQr, onInsertAuthors, onInsertReferences, onInsertTable, onInsertEquation }: Pick<Props, 'onInsert' | 'onInsertImage' | 'onInsertChart' | 'onInsertQr' | 'onInsertAuthors' | 'onInsertReferences' | 'onInsertTable' | 'onInsertEquation'>) {
  return (
    <>
      <h3>Text</h3>
      <div className="insert-list">
        <button className="insert-btn" onClick={() => onInsert('title')}>
          <span aria-hidden className="ib-icon t-title">T</span>Title
        </button>
        <button className="insert-btn" onClick={() => onInsert('subtitle')}>
          <span aria-hidden className="ib-icon t-sub">T</span>Subtitle
        </button>
        <button className="insert-btn" onClick={onInsertAuthors}>
          <span aria-hidden className="ib-icon t-sub">A¹</span>Authors and affiliations…
        </button>
        <button className="insert-btn" onClick={() => onInsert('heading')}>
          <span aria-hidden className="ib-icon t-head">H</span>Section header
        </button>
        <button className="insert-btn" onClick={() => onInsert('text')}>
          <span aria-hidden className="ib-icon t-body">¶</span>Text box
        </button>
        <button className="insert-btn" onClick={onInsertReferences}>
          <span aria-hidden className="ib-icon">[1]</span>References / citations…
        </button>
        <button className="insert-btn" onClick={onInsertEquation}>
          <span aria-hidden className="ib-icon t-eq">∑</span>Equation (LaTeX)…
        </button>
      </div>
      <h3>Media and data</h3>
      <div className="insert-list">
        <button className="insert-btn" onClick={onInsertImage}>
          <span aria-hidden className="ib-icon">🖼</span>Image…
        </button>
        <button className="insert-btn" onClick={onInsertTable}>
          <span aria-hidden className="ib-icon">▤</span>Table
        </button>
        <button className="insert-btn" onClick={onInsertChart}>
          <span aria-hidden className="ib-icon">📊</span>Graph from CSV…
        </button>
        <button className="insert-btn" onClick={onInsertQr}>
          <span aria-hidden className="ib-icon">▦</span>QR code
        </button>
      </div>
      <h3>Shapes</h3>
      <div className="insert-list">
        {SHAPE_CHOICES.map((c) => (
          <button key={c.label} className="insert-btn" onClick={() => onInsert('shape', { shape: c.kind, ...c.extra })}>
            <span aria-hidden className="ib-icon">{c.icon}</span>
            {c.label === 'Rectangle' ? 'Box / panel' : c.label}
          </button>
        ))}
      </div>
      <p className="hint">
        Tip: paste text, images or cells from Excel / Google Sheets straight onto the poster with Ctrl/⌘ + V, or drag image and CSV files in. Double-click any text to edit it.
      </p>
    </>
  );
}

function LayoutTab({ poster, update, notify }: Pick<Props, 'poster' | 'update' | 'notify'>) {
  const [scaleContent, setScaleContent] = useState(true);
  const [template, setTemplate] = useState<TemplateId>('classic');

  const resize = (o: string, preset: string, w: number, h: number) =>
    update((d) => {
      const sx = w / d.width;
      const sy = h / d.height;
      if (scaleContent) {
        const fs = Math.min(sx, sy);
        for (const e of d.elements) {
          e.x *= sx;
          e.w *= sx;
          e.y *= sy;
          e.h *= sy;
          if (e.style) e.style.fontSize = Math.max(4, Math.round(e.style.fontSize * fs * 10) / 10);
          if (e.chart) e.chart.fontSize = Math.max(4, Math.round(e.chart.fontSize * fs));
          if (e.table) e.table.fontSize = Math.max(4, Math.round(e.table.fontSize * fs * 10) / 10);
          if (e.equation) e.equation.fontSize = Math.max(4, Math.round(e.equation.fontSize * fs * 10) / 10);
        }
        d.margin *= Math.min(sx, sy);
        d.gutter *= Math.min(sx, sy);
      }
      d.width = w;
      d.height = h;
      d.sizePreset = preset;
      void o;
    });

  const num = (label: string, key: 'margin' | 'gutter', step = 1) => (
    <label>
      {label} (mm)
      <input type="number" min={0} step={step} value={Math.round(poster[key] * 10) / 10} onChange={(e) => update((d) => void (d[key] = Math.max(0, +e.target.value || 0)), 'layout-' + key)} />
    </label>
  );

  return (
    <>
      <h3>Page</h3>
      <div className="form-grid">
        <SizeFields orientation={poster.width > poster.height ? 'landscape' : 'portrait'} preset={poster.sizePreset} width={poster.width} height={poster.height} onChange={resize} />
        <label className="check span2">
          <input type="checkbox" checked={scaleContent} onChange={(e) => setScaleContent(e.target.checked)} /> Scale content when the size changes
        </label>
      </div>
      <h3>Columns</h3>
      <div className="form-grid">
        <label className="span2">
          Number of columns
          <div className="seg">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button key={n} className={poster.columns === n ? 'active' : ''} onClick={() => update((d) => void (d.columns = n))}>
                {n}
              </button>
            ))}
          </div>
        </label>
        {num('Margin', 'margin')}
        {num('Gap between columns', 'gutter')}
      </div>
      <p className="hint">
        Columns show as blue guides, and elements snap to them while you drag (hold Alt to skip). Changing the number of columns moves the guides only; your
        content stays where it is.
      </p>
      <h3>Switch layout</h3>
      <p className="hint">Rearranges the poster into another layout with {poster.columns} column{poster.columns > 1 ? 's' : ''}. Your content moves into the matching places.</p>
      <div className="form-grid">
        <label className="span2">
          Layout
          <select value={template} onChange={(e) => setTemplate(e.target.value as TemplateId)}>
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </label>
        <p className="hint span2">{templateDef(template).description} Your text, figures and logos carry over.</p>
        <button
          className="btn span2"
          onClick={async () => {
            if (!(await askConfirm('Switch to this layout?', 'Your title, authors, section text, figures, logos and QR codes move into the matching places. You can undo afterwards.', 'Apply layout'))) return;
            const { elements, report } = applyLayout(poster, template);
            update((d) => void (d.elements = elements));
            notify(describeReport(report));
          }}
        >
          Apply to {poster.columns} column{poster.columns > 1 ? 's' : ''}
        </button>
      </div>
    </>
  );
}

function DesignTab({ poster, update, notify }: Pick<Props, 'poster' | 'update' | 'notify'>) {
  const [gfont, setGfont] = useState('');

  async function addGoogle() {
    const name = gfont.trim().replace(/\s+/g, ' ');
    if (!name) return;
    await loadGoogleFont(name);
    const ok = document.fonts.check(`16px "${name}"`);
    if (!ok) notify(`Couldn't confirm “${name}” on Google Fonts — check the spelling at fonts.google.com.`);
    update((d) => {
      if (!d.googleFonts.includes(name)) d.googleFonts.push(name);
    });
    setGfont('');
    if (ok) notify(`Added ${name}. It's now in every font menu.`);
  }

  async function uploadFont() {
    const f = await pickFile('.ttf,.otf,.woff,.woff2');
    if (!f) return;
    const family = fontNameFromFile(f.name);
    const dataUrl = await fileToDataUrl(f);
    registerCustomFont({ family, dataUrl });
    update((d) => {
      d.customFonts = d.customFonts.filter((x) => x.family !== family);
      d.customFonts.push({ family, dataUrl });
    });
    notify(`Added your font “${family}”.`);
  }

  async function setBackground() {
    const f = await pickFile('image/*');
    if (!f) return;
    const url = await fileToDataUrl(f);
    update((d) => void (d.backgroundImage = url));
  }

  async function paletteFromPptx() {
    const f = await pickFile('.pptx,.potx');
    if (!f) return;
    try {
      const r = await importPptx(f);
      update((d) => {
        d.palette = r.poster.palette;
        d.headingFont = r.poster.headingFont;
        d.bodyFont = r.poster.bodyFont;
      });
      notify('Applied the colours and fonts from that PowerPoint theme.');
    } catch (e) {
      notify('Could not read that file: ' + (e as Error).message);
    }
  }

  return (
    <>
      <h3>Colour palette</h3>
      <PaletteSwatches value={poster.palette.name} onPick={(p) => update((d) => void (d.palette = { ...p }))} />
      <div className="role-editor">
        {PALETTE_ROLES.map((r) => (
          <label key={r} className="role-row">
            <input
              type="color"
              value={poster.palette[r]}
              onChange={(e) =>
                update((d) => {
                  d.palette[r] = e.target.value;
                  d.palette.name = 'Custom';
                }, 'palette-' + r)
              }
            />
            <span>{r[0].toUpperCase() + r.slice(1)}</span>
            <code>{poster.palette[r]}</code>
          </label>
        ))}
      </div>
      <button className="btn small-btn" onClick={paletteFromPptx}>Use colours from a PowerPoint theme…</button>

      <h3>Fonts</h3>
      <div className="form-grid">
        <label className="span2">
          Headings
          <FontSelect poster={poster} value={poster.headingFont} onChange={(f) => update((d) => void (d.headingFont = f))} />
        </label>
        <label className="span2">
          Body text
          <FontSelect poster={poster} value={poster.bodyFont} onChange={(f) => update((d) => void (d.bodyFont = f))} />
        </label>
        <label className="span2">
          Add any Google font
          <div className="inline">
            <input placeholder="e.g. Nunito Sans" value={gfont} onChange={(e) => setGfont(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addGoogle()} />
            <button className="btn" onClick={addGoogle}>Add</button>
          </div>
        </label>
        <div className="span2">
          <button className="btn" onClick={uploadFont}>Upload your own font (.ttf, .otf, .woff)</button>
          {poster.customFonts.length > 0 && (
            <ul className="font-list">
              {poster.customFonts.map((f) => (
                <li key={f.family} style={{ fontFamily: `"${f.family}"` }}>
                  {f.family}
                  <button className="link danger" onClick={() => update((d) => void (d.customFonts = d.customFonts.filter((x) => x.family !== f.family)))}>
                    remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <h3>Background</h3>
      <div className="inline">
        <button className="btn" onClick={setBackground}>Background image…</button>
        {poster.backgroundImage && (
          <button className="btn" onClick={() => update((d) => void delete d.backgroundImage)}>
            Remove
          </button>
        )}
      </div>
      <p className="hint">Text sizes are tuned for this poster: body text is about {Math.round(28 * typeScale(poster))} pt.</p>
    </>
  );
}
