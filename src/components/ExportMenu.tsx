import { useRef, useState } from 'react';
import type { Poster } from '../types';
import { exportWarningFor, type Issue } from '../lib/checks';
import { effectiveDpi } from '../lib/exporters';
import { BLEED_CHOICES } from '../lib/print';
import { PNG_DPI_CHOICES, useUiPrefs } from '../lib/uiPrefs';
import { usePopover } from '../lib/usePopover';

export type ExportKind = 'pdf' | 'png' | 'pptx' | 'project';

interface Props {
  poster: Poster;
  issues: Issue[];
  onExport: (kind: ExportKind) => void;
  onCopyImage: () => void;
  /** opens the poster check, from the warning line at the top */
  onReview: () => void;
}

/** The Export ▾ button and its menu: one warning line, the formats, and their print and image options folded at the bottom. The project file is under the poster's ⋯ menu. */
export default function ExportMenu({ poster, issues, onExport, onCopyImage, onReview }: Props) {
  const [prefs, change] = useUiPrefs();
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  usePopover(open, [menu, btn], () => setOpen(false), { returnFocus: btn });
  const exportWarning = exportWarningFor(issues);
  const run = (kind: ExportKind) => {
    setOpen(false);
    onExport(kind);
  };

  return (
    <div className="menu-wrap" data-tour="export">
      <button ref={btn} className="btn primary" aria-expanded={open} aria-controls="export-menu" onClick={() => setOpen((o) => !o)}>Export ▾</button>
      {open && (
        <div className="menu" id="export-menu" role="group" aria-label="Export" ref={menu}>
          {exportWarning && (
            <button
              className={exportWarning.urgent ? 'menu-warn' : 'menu-note'}
              onClick={() => {
                setOpen(false);
                onReview();
              }}
            >
              <strong>{exportWarning.headline}</strong>
              <span>{[...exportWarning.more, 'Show me'].join(' · ')}</span>
            </button>
          )}
          <button onClick={() => run('pdf')}>
            <strong>PDF</strong>
            <span>
              For printing
              {(prefs.pdfBleedMm > 0 || prefs.pdfCropMarks) && ` · with ${[prefs.pdfBleedMm > 0 && 'bleed', prefs.pdfCropMarks && 'crop marks'].filter(Boolean).join(' and ')}`}
            </span>
          </button>
          <button onClick={() => run('png')}>
            <strong>PNG image</strong>
            <span>For web, slides or social media · {PNG_DPI_CHOICES.find((c) => c.dpi === prefs.pngDpi)?.label.split(' (')[0] ?? prefs.pngDpi + ' dpi'} quality</span>
          </button>
          <button
            onClick={() => {
              setOpen(false);
              onCopyImage();
            }}
          >
            <strong>Copy as image</strong>
            <span>Paste it straight into an email, chat or slide</span>
          </button>
          <button onClick={() => run('pptx')}>
            <strong>PowerPoint (.pptx)</strong>
            <span>Editable text, shapes and charts</span>
          </button>
          <details className="menu-options" open={prefs.pdfBleedMm > 0 || prefs.pdfCropMarks || undefined}>
            <summary>Print and image options</summary>
            <div className="menu-print">
              <label>
                PDF bleed
                <select aria-label="Bleed" value={prefs.pdfBleedMm} onChange={(e) => change({ pdfBleedMm: +e.target.value })}>
                  {BLEED_CHOICES.map((b) => (
                    <option key={b.mm} value={b.mm}>{b.label}</option>
                  ))}
                </select>
              </label>
              <label className="check">
                <input type="checkbox" checked={prefs.pdfCropMarks} onChange={(e) => change({ pdfCropMarks: e.target.checked })} /> Crop marks
              </label>
              <small>Only if your print shop asks. Bleed runs edge colours past the trim; crop marks show where to cut.</small>
            </div>
            <label className="menu-dpi">
              PNG quality
              <select value={prefs.pngDpi} onChange={(e) => change({ pngDpi: +e.target.value })}>
                {PNG_DPI_CHOICES.map((c) => (
                  <option key={c.dpi} value={c.dpi}>{c.label}</option>
                ))}
              </select>
              {effectiveDpi(poster, prefs.pngDpi) < prefs.pngDpi && <small>Capped at {effectiveDpi(poster, prefs.pngDpi)} dpi for this size by browser limits.</small>}
            </label>
          </details>
        </div>
      )}
    </div>
  );
}
