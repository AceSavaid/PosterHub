// Conference requirements: the rules in a call for posters (size, orientation,
// smallest text, poster number, QR code, logos) checked against the poster.
import type { ConferenceRules, Poster, PosterElement } from '../types';
import { IN_TO_MM } from '../model';
import { htmlToText } from './textTools';
import type { Issue } from './checks';

/** Size difference (mm) still counted as "the same size": printers and presets round. */
export const SIZE_TOLERANCE_MM = 2;

export interface RuleResult {
  id: string;
  ok: boolean;
  /** what the rule asks for, e.g. "Size: A0 portrait" */
  rule: string;
  /** what was found, in plain words */
  detail: string;
  elementIds?: string[];
}

const mm = (v: number) => Math.round(v);
const inches = (v: number) => +(v / IN_TO_MM).toFixed(1);
/** "841 × 1189 mm (33.1 × 46.8 in)" */
export function sizeText(w: number, h: number) {
  return `${mm(w)} × ${mm(h)} mm (${inches(w)} × ${inches(h)} in)`;
}

/** True when there are rules worth checking. */
export function hasRules(r: ConferenceRules | undefined): r is ConferenceRules {
  if (!r) return false;
  return !!((r.width && r.height) || r.orientation || r.minFontPt || r.posterNumber?.trim() || r.requireQr || r.logos);
}

function elementText(el: PosterElement): string {
  const parts = [htmlToText(el.html ?? '')];
  if (el.table) parts.push(el.table.rows.flat().join(' '));
  if (el.chart) parts.push(el.chart.title, el.chart.xLabel, el.chart.yLabel);
  return parts.join(' ');
}

/** Pictures that look like logos: marked as a logo slot, or a small picture in the header or footer band. */
export function logoElements(p: Poster): PosterElement[] {
  return p.elements.filter((e) => {
    if (e.type !== 'image' || !e.src || e.qr) return false;
    if (e.role === 'logo' || /logo/i.test(e.placeholder ?? '')) return true;
    const small = e.w <= p.width * 0.25 && e.h <= p.height * 0.15;
    const inBand = e.y + e.h <= p.height * 0.2 || e.y >= p.height * 0.85;
    return small && inBand;
  });
}

/** Text smaller than the minimum: text boxes, table cells, graph labels and equations. */
function tooSmall(p: Poster, min: number) {
  const found: { el: PosterElement; pt: number }[] = [];
  for (const el of p.elements) {
    if (el.style && htmlToText(el.html ?? '').trim()) {
      // sizes set on selected words inside the box count too
      const inline = [...(el.html ?? '').matchAll(/font-size:\s*([\d.]+)pt/g)].map((m) => +m[1]);
      const pt = Math.min(el.style.fontSize, ...inline);
      if (pt < min) found.push({ el, pt });
    } else if (el.table && el.table.fontSize < min) found.push({ el, pt: el.table.fontSize });
    else if (el.chart && el.chart.fontSize < min) found.push({ el, pt: el.chart.fontSize });
    else if (el.equation && el.equation.fontSize < min) found.push({ el, pt: el.equation.fontSize });
  }
  return found;
}

/** Every rule that has been filled in, and whether the poster meets it. */
export function conferenceResults(p: Poster): RuleResult[] {
  const r = p.conference;
  if (!hasRules(r)) return [];
  const out: RuleResult[] = [];
  const portrait = p.height >= p.width;

  if (r.width && r.height) {
    // Without an orientation rule, either way round is fine.
    const [rw, rh] = r.orientation ? (r.orientation === 'portrait' ? [Math.min(r.width, r.height), Math.max(r.width, r.height)] : [Math.max(r.width, r.height), Math.min(r.width, r.height)]) : [r.width, r.height];
    const fits = (w: number, h: number) =>
      r.sizeMode === 'max' ? p.width <= w + SIZE_TOLERANCE_MM && p.height <= h + SIZE_TOLERANCE_MM : Math.abs(p.width - w) <= SIZE_TOLERANCE_MM && Math.abs(p.height - h) <= SIZE_TOLERANCE_MM;
    const ok = fits(rw, rh) || (!r.orientation && fits(rh, rw));
    out.push({
      id: 'size',
      ok,
      rule: `Size: ${r.sizeMode === 'max' ? 'at most ' : ''}${sizeText(rw, rh)}`,
      detail: ok ? `The poster is ${sizeText(p.width, p.height)}.` : `The poster is ${sizeText(p.width, p.height)}. Change it under Layout → Size; “Scale content” keeps your layout.`,
    });
  }

  if (r.orientation) {
    const ok = (r.orientation === 'portrait') === portrait;
    out.push({
      id: 'orientation',
      ok,
      rule: `Orientation: ${r.orientation}`,
      detail: ok ? `The poster is ${portrait ? 'portrait' : 'landscape'}.` : `The poster is ${portrait ? 'portrait (tall)' : 'landscape (wide)'}. Switch it under Layout.`,
    });
  }

  if (r.minFontPt) {
    const small = tooSmall(p, r.minFontPt);
    const smallest = small.length ? Math.min(...small.map((s) => s.pt)) : null;
    out.push({
      id: 'min-font',
      ok: !small.length,
      rule: `Text at least ${r.minFontPt} pt`,
      detail: small.length
        ? `${small.length} ${small.length === 1 ? 'box has' : 'boxes have'} smaller text (down to ${smallest} pt). Click to select them.`
        : 'All text is big enough.',
      elementIds: small.map((s) => s.el.id),
    });
  }

  const num = r.posterNumber?.trim();
  if (num) {
    const norm = (s: string) => s.toLowerCase().replace(/[\s\-–_#.]/g, '');
    const hit = p.elements.find((e) => norm(elementText(e)).includes(norm(num)));
    out.push({
      id: 'number',
      ok: !!hit,
      rule: `Poster number “${num}” shown`,
      detail: hit ? 'It is on the poster.' : 'Add it where people can see it, usually a corner of the header (Insert → Text box).',
      elementIds: hit ? [hit.id] : undefined,
    });
  }

  if (r.requireQr) {
    const qr = p.elements.filter((e) => e.type === 'image' && e.qr);
    out.push({
      id: 'qr',
      ok: qr.length > 0,
      rule: 'QR code',
      detail: qr.length ? 'The poster has a QR code.' : 'Add one under Insert → QR code, with a link to your paper, data or abstract.',
      elementIds: qr.map((e) => e.id),
    });
  }

  if (r.logos) {
    const logos = logoElements(p);
    out.push({
      id: 'logos',
      ok: logos.length >= r.logos,
      rule: `${r.logos} logo${r.logos > 1 ? 's' : ''}`,
      detail:
        logos.length >= r.logos
          ? `Found ${logos.length}.`
          : `Found ${logos.length}. Fill the logo spots in your layout, or add pictures in the header or footer.`,
      elementIds: logos.map((e) => e.id),
    });
  }
  return out;
}

/** Unmet rules as Check panel problems. */
export function conferenceIssues(p: Poster): Issue[] {
  const name = p.conference?.name?.trim();
  const who = name ? `${name} rule` : 'Conference rule';
  return conferenceResults(p)
    .filter((x) => !x.ok)
    .map((x) => ({
      id: 'conf-' + x.id,
      elementId: x.elementIds?.[0],
      severity: x.id === 'size' || x.id === 'orientation' || x.id === 'min-font' ? 'problem' : 'warning',
      title: `${who}: ${x.rule}`,
      detail: x.detail,
    }));
}

/** Keeps only well-formed rules from an opened file (anything else is dropped). */
export function cleanRules(raw: unknown): ConferenceRules | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const pos = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= max ? v : undefined);
  const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.slice(0, max) : undefined);
  const out: ConferenceRules = {
    name: str(r.name, 120),
    width: pos(r.width, 10000),
    height: pos(r.height, 10000),
    sizeMode: r.sizeMode === 'max' || r.sizeMode === 'exact' ? r.sizeMode : undefined,
    orientation: r.orientation === 'portrait' || r.orientation === 'landscape' ? r.orientation : undefined,
    minFontPt: pos(r.minFontPt, 500),
    posterNumber: str(r.posterNumber, 40),
    requireQr: r.requireQr === true ? true : undefined,
    logos: pos(r.logos, 50) && Math.round(r.logos as number),
  };
  for (const k of Object.keys(out) as (keyof ConferenceRules)[]) if (out[k] === undefined) delete out[k];
  return hasRules(out) || (out as ConferenceRules).name ? out : undefined;
}
