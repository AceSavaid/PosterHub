import { useState } from 'react';
import type { Palette } from '../types';
import { PALETTE_ROLES, POPULAR_GOOGLE_FONTS, SYSTEM_FONTS, uid } from '../model';
import { BRAND_KIT_EXT, MAX_KIT_FILE_BYTES, MAX_LOGOS, brandKitToText, emptyBrandKit, kitPalette, parseBrandKitText, useBrandKit, type BrandKit } from '../lib/brandKit';
import { downloadBlob, fileToDataUrl, pickFile, readText, safeFileName } from '../lib/storage';
import { fontNameFromFile, loadGoogleFont, registerCustomFont } from '../lib/fonts';
import { importPptx } from '../lib/pptxImport';
import { askConfirm } from '../lib/dialogs';
import { useDialog } from '../lib/useDialog';
import { PaletteSwatches } from './PaletteSwatches';

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Fonts a kit can pick from: its own uploaded and added fonts first. */
export function kitFontChoices(kit: Pick<BrandKit, 'customFonts' | 'googleFonts'> | null | undefined) {
  return [...new Set([...(kit?.customFonts.map((f) => f.family) ?? []), ...(kit?.googleFonts ?? []), ...POPULAR_GOOGLE_FONTS, ...SYSTEM_FONTS])];
}

/**
 * Set up the university or lab look once: colours, fonts and logos. New
 * posters can then start with it. The kit can be saved to a file and opened
 * on another computer or shared with the rest of a lab.
 */
export default function BrandKitDialog({ onClose }: { onClose: () => void }) {
  const [saved, save] = useBrandKit();
  const [draft, setDraft] = useState<BrandKit | null>(null);
  const [gfont, setGfont] = useState('');
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [dirty, setDirty] = useState(false);
  const dialog = useDialog<HTMLFormElement>(onClose, 'brand-kit-title');

  // Start editing from the saved kit once it has loaded.
  const kit = draft ?? (saved === undefined ? null : saved ?? emptyBrandKit());
  const edit = (patch: Partial<BrandKit>) => {
    setDraft({ ...kit!, ...patch });
    setDirty(true);
  };
  const say = (text: string, error = false) => setMessage({ text, error });

  async function addLogo() {
    const f = await pickFile('image/*');
    if (!f || !kit) return;
    if (!f.type.startsWith('image/')) return say('That file is not an image.', true);
    const src = await fileToDataUrl(f);
    const name = kit.name || f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
    edit({ logos: [...kit.logos, { id: uid(), name, src }] });
  }

  function moveLogo(i: number, by: number) {
    const logos = [...kit!.logos];
    [logos[i], logos[i + by]] = [logos[i + by], logos[i]];
    edit({ logos });
  }

  async function addGoogle() {
    const name = gfont.trim().replace(/\s+/g, ' ');
    if (!name || !kit) return;
    await loadGoogleFont(name);
    edit({ googleFonts: kit.googleFonts.includes(name) ? kit.googleFonts : [...kit.googleFonts, name] });
    setGfont('');
    say(`Added ${name}. Pick it as the heading or body font below.`);
  }

  async function uploadFont() {
    const f = await pickFile('.ttf,.otf,.woff,.woff2');
    if (!f || !kit) return;
    const family = fontNameFromFile(f.name);
    const dataUrl = await fileToDataUrl(f);
    registerCustomFont({ family, dataUrl });
    edit({ customFonts: [...kit.customFonts.filter((x) => x.family !== family), { family, dataUrl }] });
    say(`Added your font “${family}”. Pick it as the heading or body font below.`);
  }

  async function fromPowerPoint() {
    const f = await pickFile('.pptx,.potx');
    if (!f || !kit) return;
    try {
      const r = await importPptx(f);
      edit({ palette: { ...r.poster.palette }, headingFont: r.poster.headingFont, bodyFont: r.poster.bodyFont });
      say('Took the colours and fonts from that PowerPoint theme.');
    } catch (e) {
      say('Could not read that file: ' + (e as Error).message, true);
    }
  }

  async function importFile() {
    const f = await pickFile(`${BRAND_KIT_EXT},.json,application/json`);
    if (!f) return;
    try {
      if (f.size > MAX_KIT_FILE_BYTES) throw new Error('This file is too big to be a brand kit.');
      const k = parseBrandKitText(await readText(f));
      k.customFonts.forEach(registerCustomFont);
      setDraft(k);
      setDirty(true);
      say(`Opened “${k.name || 'brand kit'}”. Check it over, then press Save brand kit.`);
    } catch (e) {
      say((e as Error).message, true);
    }
  }

  async function exportFile() {
    if (!kit) return;
    const blob = new Blob([brandKitToText({ ...kit, palette: kitPalette(kit) })], { type: 'application/json' });
    await downloadBlob(blob, safeFileName(kit.name || 'brand-kit') + BRAND_KIT_EXT);
  }

  async function removeKit() {
    if (!(await askConfirm('Remove your brand kit?', 'New posters will start with the standard colours and fonts. Posters you already made keep their look.', 'Remove kit', true))) return;
    await save(null);
    onClose();
  }

  if (!kit) return null;
  const fonts = kitFontChoices(kit);
  const setRole = (r: (typeof PALETTE_ROLES)[number], v: string) => edit({ palette: { ...kit.palette, [r]: v, name: 'Custom' } });

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        {...dialog}
        className="modal wide brand-kit"
        role="dialog"
        aria-label="Brand kit"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await save({ ...kit, palette: kitPalette(kit) });
            onClose();
          } catch (err) {
            say('Could not save the brand kit: ' + String(err), true);
          }
        }}
      >
        <h2 id="brand-kit-title">Brand kit</h2>
        <p className="hint">
          Set your university or lab colours, fonts and logos once. Every new poster can start with them, and the logos go into the layout’s logo spots.
        </p>
        <div className="form-grid">
          <label className="span2">
            University or lab name
            <input autoFocus value={kit.name} placeholder="e.g. University of Westbrook" maxLength={80} onChange={(e) => edit({ name: e.target.value })} />
          </label>

          <div className="span2">
            <div className="field-label">Colours <span className="muted">· start from a palette, then set your exact brand colours</span></div>
            <PaletteSwatches value={kit.palette.name} onPick={(p: Palette) => edit({ palette: { ...p } })} />
            <div className="role-editor kit-roles">
              {PALETTE_ROLES.map((r) => (
                <label key={r} className="role-row">
                  <input type="color" aria-label={`${cap(r)} colour`} value={kit.palette[r]} onChange={(e) => setRole(r, e.target.value)} />
                  <span>{cap(r)}</span>
                  <input
                    className="hex"
                    aria-label={`${cap(r)} colour code`}
                    defaultValue={kit.palette[r]}
                    key={kit.palette[r]}
                    maxLength={7}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      const hex = v.startsWith('#') ? v : '#' + v;
                      if (/^#[0-9a-f]{6}$/i.test(hex)) setRole(r, hex.toLowerCase());
                      else e.target.value = kit.palette[r];
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), e.currentTarget.blur())}
                  />
                </label>
              ))}
            </div>
            <button type="button" className="btn small-btn" onClick={fromPowerPoint}>Use colours and fonts from a PowerPoint theme…</button>
          </div>

          <label>
            Heading font
            <select value={kit.headingFont} onChange={(e) => edit({ headingFont: e.target.value })}>
              {fonts.map((f) => <option key={f}>{f}</option>)}
            </select>
          </label>
          <label>
            Body font
            <select value={kit.bodyFont} onChange={(e) => edit({ bodyFont: e.target.value })}>
              {fonts.map((f) => <option key={f}>{f}</option>)}
            </select>
          </label>
          <label className="span2">
            Add any Google font
            <div className="inline">
              <input placeholder="e.g. Nunito Sans" value={gfont} onChange={(e) => setGfont(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addGoogle())} />
              <button type="button" className="btn" onClick={addGoogle}>Add</button>
            </div>
          </label>
          <div className="span2">
            <button type="button" className="btn" onClick={uploadFont}>Upload your university font (.ttf, .otf, .woff)</button>
            {kit.customFonts.length > 0 && (
              <ul className="font-list">
                {kit.customFonts.map((f) => (
                  <li key={f.family} style={{ fontFamily: `"${f.family}"` }}>
                    {f.family}
                    <button type="button" className="link danger" aria-label={`Remove font ${f.family}`} onClick={() => edit({ customFonts: kit.customFonts.filter((x) => x.family !== f.family) })}>
                      remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="span2">
            <div className="field-label">Logos <span className="muted">· they fill a layout’s logo spots in this order</span></div>
            {kit.logos.length > 0 && (
              <ul className="kit-logos" aria-label="Logos">
                {kit.logos.map((l, i) => (
                  <li key={l.id}>
                    <img src={l.src} alt="" />
                    <input aria-label={`Logo ${i + 1} name`} value={l.name} placeholder="Organisation name" maxLength={80} onChange={(e) => edit({ logos: kit.logos.map((x) => (x.id === l.id ? { ...x, name: e.target.value } : x)) })} />
                    <button type="button" className="icon-btn" aria-label={`Move logo ${i + 1} up`} disabled={i === 0} onClick={() => moveLogo(i, -1)}>↑</button>
                    <button type="button" className="icon-btn" aria-label={`Move logo ${i + 1} down`} disabled={i === kit.logos.length - 1} onClick={() => moveLogo(i, 1)}>↓</button>
                    <button type="button" className="icon-btn" aria-label={`Remove logo ${i + 1}`} onClick={() => edit({ logos: kit.logos.filter((x) => x.id !== l.id) })}>✕</button>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className="btn" onClick={addLogo} disabled={kit.logos.length >= MAX_LOGOS}>
              + Add logo
            </button>
            <span className="hint"> PNG or SVG with a transparent background looks best.</span>
          </div>
        </div>

        {message && (
          <p className={'hint' + (message.error ? ' error' : '')} role={message.error ? 'alert' : 'status'}>
            {message.text}
          </p>
        )}

        <div className="modal-actions sticky-actions kit-actions">
          <button type="button" className="btn" onClick={importFile}>Open kit file…</button>
          <button type="button" className="btn" onClick={exportFile}>Save kit file</button>
          {saved && <button type="button" className="btn ghost danger" onClick={removeKit}>Remove kit</button>}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!dirty && !!saved}>Save brand kit</button>
        </div>
      </form>
    </div>
  );
}
