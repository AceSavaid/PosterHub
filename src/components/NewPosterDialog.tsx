import { useMemo, useState } from 'react';
import type { Orientation, Palette, PosterElement } from '../types';
import { PALETTES, SIZE_PRESETS, TEMPLATES, columnLefts, columnWidth, createPoster, resolveColor, sizeFor, type TemplateId, POPULAR_GOOGLE_FONTS, SYSTEM_FONTS } from '../model';
import type { Poster } from '../types';
import { SizeFields } from './SizeFields';
import { PaletteSwatches } from './PaletteSwatches';
import { useDialog } from '../lib/useDialog';
import MyTemplates from './MyTemplates';
import { posterFromTemplate, type UserTemplate } from '../lib/userTemplates';
import { addKitFonts, fillLogoSpots, kitPalette, type BrandKit } from '../lib/brandKit';
import { BRAND_KITS, brandKitById } from '../brandKits';
import { useUiPrefs } from '../lib/uiPrefs';
import { loadGoogleFont } from '../lib/fonts';

interface Props {
  onCreate: (p: Poster) => void;
  onCancel: () => void;
}

const DEFAULT_LOOK = { palette: PALETTES[0], headingFont: 'Montserrat', bodyFont: 'Open Sans' };
const kitLook = (kit: BrandKit | null) => (kit ? { palette: kitPalette(kit), headingFont: kit.headingFont, bodyFont: kit.bodyFont } : DEFAULT_LOOK);

/** Builds the poster the dialog describes, adding the brand kit's fonts and logos when one is chosen. */
export function buildNewPoster(o: Parameters<typeof createPoster>[0], kit: BrandKit | null) {
  const p = createPoster(o);
  if (kit) {
    addKitFonts(p, kit);
    fillLogoSpots(p, kit);
  }
  return p;
}

export default function NewPosterDialog({ onCreate, onCancel }: Props) {
  // The last brand kit picked is remembered, so it only has to be chosen once.
  const [prefs, changePrefs] = useUiPrefs();
  const [kit, setKit] = useState<BrandKit | null>(() => brandKitById(prefs.brandKit));
  const [name, setName] = useState('');
  const [orientation, setOrientation] = useState<Orientation>('portrait');
  const [preset, setPreset] = useState('A0');
  const [size, setSize] = useState(sizeFor('A0', 'portrait'));
  const [columns, setColumns] = useState(3);
  const [palette, setPalette] = useState<Palette>(() => kitLook(kit).palette);
  const [template, setTemplate] = useState<TemplateId>('classic');
  const [headingFont, setHeadingFont] = useState(() => kitLook(kit).headingFont);
  const [bodyFont, setBodyFont] = useState(() => kitLook(kit).bodyFont);
  /** A saved template from My templates; when set it supplies size, colours and fonts. */
  const [mine, setMine] = useState<UserTemplate | null>(null);

  function pickKit(id: string) {
    const k = brandKitById(id);
    setKit(k);
    changePrefs({ brandKit: k?.id ?? '' });
    const look = kitLook(k);
    setPalette(look.palette);
    setHeadingFont(look.headingFont);
    setBodyFont(look.bodyFont);
    if (k) [k.headingFont, k.bodyFont].forEach((f) => loadGoogleFont(f));
  }

  const fonts = [...new Set([...(kit ? [kit.headingFont, kit.bodyFont, ...(kit.googleFonts ?? [])] : []), ...POPULAR_GOOGLE_FONTS, ...SYSTEM_FONTS])];
  const dialog = useDialog<HTMLFormElement>(onCancel, 'new-poster-title');

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form
        {...dialog}
        className="modal wide"
        role="dialog"
        aria-label="New poster"
        onSubmit={(e) => {
          e.preventDefault();
          if (mine) {
            // A saved template keeps its own look; the kit only fills logo spots it left empty.
            const p = posterFromTemplate(mine, name || 'Untitled poster');
            if (kit) fillLogoSpots(p, kit);
            return onCreate(p);
          }
          onCreate(buildNewPoster({ name: name || 'Untitled poster', ...size, sizePreset: preset, columns, palette, template, headingFont, bodyFont }, kit));
        }}
      >
        <h2 id="new-poster-title">New poster</h2>
        <div className="form-grid">
          <label className="span2">
            Name
            <input autoFocus value={name} placeholder="e.g. Conference 2026 – Sleep and memory" onChange={(e) => setName(e.target.value)} />
          </label>
          {BRAND_KITS.length > 0 && (
            <label className="span2">
              Brand kit
              <select value={kit?.id ?? ''} onChange={(e) => pickKit(e.target.value)}>
                <option value="">None</option>
                {BRAND_KITS.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
              {kit && <span className="hint">{kit.name} colours and fonts{kit.logos.length ? `, with ${kit.logos.length > 1 ? 'its logos' : 'its logo'} in the layout’s logo spots` : ''}. You can still change anything below.</span>}
            </label>
          )}
          <MyTemplates selected={mine?.id ?? null} onSelect={setMine} />
          {mine && (
            <p className="span2 hint mine-note" role="status">
              Using your template “{mine.name}” with its own size, colours and fonts. <button type="button" className="link" onClick={() => setMine(null)}>Pick a built-in layout instead</button>
            </p>
          )}
          {!mine && <>
          <div className="span2">
            <div className="field-label">Layout <span className="muted">· previews follow the colours, size and columns you pick below</span></div>
            <div className="template-grid">
              {TEMPLATES.map((t) => (
                <button type="button" key={t.id} data-template={t.id} aria-pressed={template === t.id} className={'template-card' + (template === t.id ? ' active' : '')} onClick={() => { setTemplate(t.id); setMine(null); }}>
                  <TemplateThumb id={t.id} width={size.width} height={size.height} columns={columns} palette={palette} />
                  <strong>{t.label}</strong>
                  <span>{t.description}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="span2">
            <div className="field-label">Colour palette</div>
            <PaletteSwatches value={palette.name} onPick={setPalette} extra={kit ? [kitPalette(kit)] : []} />
          </div>
          <SizeFields
            orientation={orientation}
            preset={preset}
            width={size.width}
            height={size.height}
            onChange={(o, pr, w, h) => {
              setOrientation(o);
              setPreset(pr);
              setSize({ width: w, height: h });
            }}
          />
          <label>
            Columns
            <select value={columns} onChange={(e) => setColumns(+e.target.value)}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n} column{n > 1 ? 's' : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Heading font
            <select value={headingFont} onChange={(e) => setHeadingFont(e.target.value)}>
              {fonts.map((f) => <option key={f}>{f}</option>)}
            </select>
          </label>
          <label>
            Body font
            <select value={bodyFont} onChange={(e) => setBodyFont(e.target.value)}>
              {fonts.map((f) => <option key={f}>{f}</option>)}
            </select>
          </label>
          </>}
        </div>
        {!mine && <p className="hint">Sizes available: {SIZE_PRESETS.length} presets or any custom size. You can change everything here later.</p>}
        <div className="modal-actions sticky-actions">
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn primary">Create poster</button>
        </div>
      </form>
    </div>
  );
}

/** A miniature of the real layout: the same elements createPoster() would make, drawn as simple shapes. */
export function TemplateThumb({ id, width, height, columns, palette }: { id: TemplateId; width: number; height: number; columns: number; palette: Palette }) {
  const poster = useMemo(
    () => (width > 0 && height > 0) ? createPoster({ name: '', width, height, sizePreset: 'custom', columns, palette, template: id, headingFont: 'Arial', bodyFont: 'Arial' }) : null,
    [id, width, height, columns, palette],
  );
  if (!poster) return null;
  return <PosterThumb poster={poster} grid={id === 'blank'} />;
}

/** A miniature of any poster, drawn as simple shapes (pictures are drawn as they are). */
export function PosterThumb({ poster, grid = false, box = 96 }: { poster: Poster; grid?: boolean; box?: number }) {
  const { width, height, palette } = poster;
  const k = box / Math.max(width, height);
  const W = width * k;
  const H = height * k;
  const col = (c?: string) => resolveColor(c, palette);
  return (
    <svg className="template-thumb" width={W} height={H} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <rect width={width} height={height} fill={palette.background} stroke="#c3c9d2" strokeWidth={1 / k} />
      {poster.backgroundImage && <image href={poster.backgroundImage} width={width} height={height} preserveAspectRatio="xMidYMid slice" />}
      {grid &&
        columnLefts(poster).map((x, i) => (
          <rect key={i} x={x} y={poster.margin} width={columnWidth(poster)} height={height - 2 * poster.margin} fill="none" stroke="#9ab" strokeDasharray={`${2 / k} ${2 / k}`} strokeWidth={0.6 / k} />
        ))}
      {poster.elements.map((e) => <ThumbElement key={e.id} el={e} col={col} k={k} />)}
    </svg>
  );
}

function ThumbElement({ el: e, col, k }: { el: PosterElement; col: (c?: string) => string; k: number }) {
  const r = e.shape === 'ellipse' ? Math.min(e.w, e.h) / 2 : e.radius ?? 0;
  const frame =
    e.fill || e.borderWidth ? (
      <rect x={e.x} y={e.y} width={e.w} height={e.h} rx={r} fill={e.fill ? col(e.fill) : 'none'} stroke={e.borderWidth ? col(e.borderColor ?? '@primary') : 'none'} strokeWidth={0.8 / k} />
    ) : null;
  if (e.type === 'shape') return frame;
  if (e.type === 'image' && e.src && !e.crop && !e.rotation) {
    return <image href={e.src} x={e.x} y={e.y} width={e.w} height={e.h} preserveAspectRatio={e.fit === 'fill' ? 'none' : e.fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet'} />;
  }
  if (e.type === 'image' || e.type === 'chart' || e.type === 'table' || e.type === 'equation') {
    const qr = e.placeholder === 'QR code';
    const s = Math.min(e.w, e.h);
    return (
      <g>
        <rect x={e.x} y={e.y} width={e.w} height={e.h} rx={r} fill={e.fill ? col(e.fill) : 'none'} stroke="#9aa6b8" strokeWidth={0.6 / k} strokeDasharray={qr ? undefined : `${1.5 / k} ${1 / k}`} />
        {qr &&
          [[0, 0], [0.62, 0], [0, 0.62]].map(([dx, dy], i) => (
            <rect key={i} x={e.x + s * (0.08 + dx * 0.86)} y={e.y + s * (0.08 + dy * 0.86)} width={s * 0.26} height={s * 0.26} fill="#2a2f38" />
          ))}
      </g>
    );
  }
  // Text-like: draw lines of "text" in the element's colour.
  const pad = e.padding ?? 0;
  const st = e.style!;
  const lineH = Math.max(st.fontSize * 0.3528 * st.lineHeight, 1 / k);
  const barH = st.fontSize * 0.3528 * (e.type === 'title' || e.type === 'heading' ? 0.75 : 0.45);
  const innerW = e.w - 2 * pad;
  const lines = e.type === 'title' || e.type === 'subtitle' || e.type === 'heading' ? 1 : Math.max(1, Math.min(8, Math.floor((e.h - 2 * pad) / lineH)));
  const fill = e.type === 'text' && !e.fill ? '#b9bfc8' : col(st.color);
  const lens = [1, 0.92, 0.97, 0.85, 0.95, 0.9, 0.98, 0.7];
  return (
    <g>
      {frame}
      {Array.from({ length: lines }, (_, i) => {
        const w = innerW * (e.type === 'heading' ? Math.min(0.7, (e.html?.length ?? 8) * 0.06 + 0.15) : e.type === 'title' ? 0.8 : lines > 1 && i === lines - 1 ? 0.6 : lens[i]);
        const x = st.align === 'center' ? e.x + pad + (innerW - w) / 2 : st.align === 'right' ? e.x + e.w - pad - w : e.x + pad;
        const y = e.type === 'heading' && e.fill ? e.y + (e.h - barH) / 2 : e.y + pad + i * lineH + (lineH - barH) / 2;
        return <rect key={i} x={x} y={y} width={Math.max(w, 0)} height={barH} rx={barH / 3} fill={fill} />;
      })}
    </g>
  );
}
