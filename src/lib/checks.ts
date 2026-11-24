// "Check poster": common problems that are easy to miss on screen but
// obvious once printed. Pure functions so they can be unit tested; image
// pixel sizes are passed in because reading them needs the browser.
import type { Poster, PosterElement } from '../types';
import { resolveColor, typeScale } from '../model';
import { boundsOf, intersects } from './arrange';
import { outerBounds } from './geometry';
import { wordCount } from './textTools';
import { citeCounts } from './refs/citations';
import { dullColorIssues } from './printColor';
import { authorName, openNotes, preview } from './notes';
import { seriesColors, seriesData } from './chart';
import { confusablePairs, visionInfo, type VisionMode } from './colorVision';
import { normalizeTable } from './table';
import { conferenceIssues } from './conference';
import { parseColor } from './color';

export type Severity = 'problem' | 'warning' | 'tip';

export interface Issue {
  id: string;
  elementId?: string;
  /** set when the issue is an unresolved review note */
  noteId?: string;
  severity: Severity;
  title: string;
  detail: string;
  /** Example text or an empty figure box left over from the layout: a to-do, not a mistake. */
  leftover?: boolean;
  /** A one-click fix the Check panel can offer: swap one colour for another everywhere. */
  fix?: { label: string; from: string; to: string };
  /** a colour-vision preview that shows the problem */
  preview?: VisionMode;
  /** The element has no description for screen readers; the Check panel offers a box to type one. */
  needsAlt?: boolean;
}

export const PLACEHOLDER_TEXT = ['Your Poster Title Goes Here', 'Replace this text with your own', 'Type or paste your text here', 'Section Heading', 'Author One, Author Two', 'Describe what the figure shows', 'State your main result in one clear sentence', 'Author, A. (2025). Title of work'];

// ---- colour maths (WCAG relative luminance)
export function luminance(hex: string): number | null {
  const rgb = parseColor(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number | null {
  const la = luminance(a);
  const lb = luminance(b);
  if (la == null || lb == null) return null;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** The colour behind an element: its own fill, else the topmost filled element under it, else the page. */
export function backgroundBehind(p: Poster, el: PosterElement): string | null {
  const own = el.fill && resolveColor(el.fill, p.palette);
  if (own && own !== 'transparent') return own;
  const idx = p.elements.indexOf(el);
  const cx = el.x + el.w / 2;
  const cy = el.y + el.h / 2;
  for (let i = idx - 1; i >= 0; i--) {
    const u = p.elements[i];
    if (u.type === 'image' && u.src) return null; // can't know the colour of a picture
    if (u.type === 'shape' && u.shape === 'line') continue;
    const f = u.fill && resolveColor(u.fill, p.palette);
    if (f && f !== 'transparent' && cx >= u.x && cx <= u.x + u.w && cy >= u.y && cy <= u.y + u.h) return f;
  }
  if (p.backgroundImage) return null;
  return resolveColor('@background', p.palette);
}

export const plain = (html = '') => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

const NAMES: Record<string, string> = { title: 'Title', subtitle: 'Subtitle', heading: 'Header', text: 'Text box', image: 'Image', chart: 'Graph', shape: 'Shape', table: 'Table', equation: 'Equation', icon: 'Icon' };
function label(el: PosterElement) {
  const t = plain(el.html);
  return t ? `${NAMES[el.type]} “${t.length > 32 ? t.slice(0, 30) + '…' : t}”` : NAMES[el.type];
}

/** Smallest comfortable text for this poster: about 20 pt on A0 (body text ideally 24 pt+), scaled for smaller posters viewed closer. */
export function minReadablePt(p: Poster) {
  return Math.max(9, Math.round(20 * typeScale(p)));
}

/** The colours a graph uses to tell its series (or pie slices) apart, with their names. */
export function chartSeriesColors(el: PosterElement, p: Poster): { names: string[]; colors: string[] } {
  if (!el.chart) return { names: [], colors: [] };
  const d = seriesData(el.chart);
  const pie = el.chart.kind === 'pie' || el.chart.kind === 'doughnut';
  const names = pie ? d.labels.map((l, i) => l || `Slice ${i + 1}`) : d.series.map((s) => s.name);
  const all = seriesColors(p.palette, Math.max(d.series.length, d.labels.length));
  // the colour list repeats after ten; repeated colours are a different problem, so only compare the distinct ones
  const n = Math.min(names.length, 10);
  return { names: names.slice(0, n), colors: all.slice(0, n) };
}

const quote = (s: string) => `“${s.length > 24 ? s.slice(0, 22) + '…' : s}”`;

/** Warn when a graph's colours become hard to tell apart for colour-blind readers or in black-and-white print. */
export function chartColorIssue(el: PosterElement, p: Poster): Issue | null {
  const { names, colors } = chartSeriesColors(el, p);
  if (colors.length < 2) return null;
  const pairs = confusablePairs(colors);
  if (!pairs.length) return null;
  const byMode = new Map<VisionMode, typeof pairs>();
  for (const pr of pairs) byMode.set(pr.mode, [...(byMode.get(pr.mode) ?? []), pr]);
  const order: VisionMode[] = ['normal', 'deuteranopia', 'protanopia', 'tritanopia', 'greyscale'];
  const modes = order.filter((m) => byMode.has(m));
  const colourBlind = modes.filter((m) => m !== 'normal' && m !== 'greyscale');
  const pairText = (m: VisionMode) => {
    const ps = byMode.get(m)!;
    const first = ps[0];
    return `${quote(names[first.i])} and ${quote(names[first.j])}${ps.length > 1 ? ` (and ${ps.length - 1} more pair${ps.length > 2 ? 's' : ''})` : ''}`;
  };
  const what = el.chart!.kind === 'pie' || el.chart!.kind === 'doughnut' ? 'slices' : 'series';
  const parts: string[] = [];
  if (byMode.has('normal')) parts.push(`${pairText('normal')} are almost the same colour for everyone.`);
  if (colourBlind.length) {
    const rg = colourBlind.filter((m) => m !== 'tritanopia').map((m) => visionInfo(m).label.toLowerCase());
    const kinds = [rg.length ? `red-green colour blindness (${rg.join(', ')})` : '', colourBlind.includes('tritanopia') ? 'blue-yellow colour blindness (tritanopia)' : ''].filter(Boolean).join(' or ');
    parts.push(`With ${kinds}, ${pairText(colourBlind[0])} look alike.`);
  }
  if (byMode.has('greyscale')) parts.push(`Printed in black and white, ${pairText('greyscale')} turn the same grey.`);
  parts.push(`Pick a colour scheme whose colours differ in lightness (one dark, one light), or label the ${what} directly.`);
  const severe = byMode.has('normal') || colourBlind.length > 0;
  return {
    id: 'cvd-' + el.id,
    elementId: el.id,
    severity: severe ? 'warning' : 'tip',
    title: severe ? 'Graph colours may be hard to tell apart' : 'Graph colours look alike in black and white',
    detail: parts.join(' '),
    preview: colourBlind[0] ?? (byMode.has('greyscale') ? 'greyscale' : undefined),
  };
}

/**
 * Pictures, graphs and icons with no description (alt text). Screen readers, the
 * accessible PDF and anyone who can't see the poster rely on it. QR codes describe
 * themselves and empty placeholders are reported as leftovers instead.
 */
export function altTextIssue(el: PosterElement): Issue | null {
  if (el.alt?.trim()) return null;
  const base = { id: 'alt-' + el.id, elementId: el.id, needsAlt: true as const };
  if (el.type === 'image' && el.src && !el.qr) {
    const logo = el.role === 'logo';
    return {
      ...base,
      severity: logo ? 'tip' : 'warning',
      title: logo ? 'A logo has no description' : 'A picture has no description',
      detail: logo ? 'Name the organisation, e.g. “Ontario Tech University logo”.' : 'Say what it shows in a sentence, so people using screen readers get it too.',
    };
  }
  if (el.type === 'chart' && el.chart) {
    const title = el.chart.title?.trim();
    return {
      ...base,
      severity: 'warning',
      title: title ? `Graph “${title.length > 28 ? title.slice(0, 26) + '…' : title}” has no description` : 'A graph has no description',
      detail: 'Give the main finding, e.g. “Scores rose from 40% to 75% after training”, not just what is plotted.',
    };
  }
  if (el.type === 'icon' && el.icon) {
    return {
      ...base,
      severity: 'tip',
      title: 'An icon has no description',
      detail: 'Screen readers say the icon’s name. Describe what it stands for here, if it means something.',
    };
  }
  return null;
}

export interface ImageInfo {
  /** pixel width of the image file */
  width: number;
}

export function checkPoster(p: Poster, images: Map<string, ImageInfo> = new Map(), overflowing: Set<string> = new Set()): Issue[] {
  const issues: Issue[] = [];
  const minPt = minReadablePt(p);
  const page = { x: 0, y: 0, w: p.width, h: p.height };

  // ---- unresolved review notes: feedback that has not been dealt with yet
  for (const n of openNotes(p)) {
    issues.push({
      id: 'note-' + n.id, noteId: n.id, severity: 'warning',
      title: `Open note from ${authorName(n)}: “${preview(n.text, 34)}”`,
      detail: 'Resolve or delete it once you have dealt with it. Notes are never printed or exported.',
    });
  }

  if (!p.elements.length) {
    issues.push({ id: 'empty', severity: 'tip', title: 'The poster is empty', detail: 'Add a title from the Insert panel, or pick a layout under Layout → Switch layout.' });
    // size and orientation rules apply before anything is on the page
    issues.push(...conferenceIssues(p));
    return issues;
  }

  for (const el of p.elements) {
    const name = label(el);
    // ---- off the page (rotated elements by the area they actually cover)
    const b = el.rotation ? outerBounds(el) : el;
    const inside = b.x >= -1 && b.y >= -1 && b.x + b.w <= p.width + 1 && b.y + b.h <= p.height + 1;
    if (!intersects(b, page)) {
      issues.push({ id: 'off-' + el.id, elementId: el.id, severity: 'problem', title: `${name} is off the poster`, detail: 'It will not be printed. Move it back onto the page or delete it.' });
    } else if (!inside && el.type !== 'shape') {
      issues.push({ id: 'edge-' + el.id, elementId: el.id, severity: 'warning', title: `${name} is cut off at the edge`, detail: 'Part of it hangs over the edge of the poster and will be trimmed.' });
    } else if (el.style && (b.x < 5 || b.y < 5 || b.x + b.w > p.width - 5 || b.y + b.h > p.height - 5)) {
      issues.push({ id: 'edge-' + el.id, elementId: el.id, severity: 'tip', title: `${name} is very close to the edge`, detail: 'Printers often trim a few millimetres; keep text at least 5 mm from the edge.' });
    }

    if (el.style) {
      const text = plain(el.html);
      // ---- placeholder text
      if (PLACEHOLDER_TEXT.some((t) => text.includes(t))) {
        issues.push({ id: 'ph-' + el.id, elementId: el.id, severity: 'warning', title: `${name} still has example text`, detail: 'Replace it with your own words, or delete the box.', leftover: true });
      } else if (!text) {
        issues.push({ id: 'blank-' + el.id, elementId: el.id, severity: 'tip', title: `An empty ${NAMES[el.type].toLowerCase()}`, detail: 'Type something in it or delete it.' });
      }
      // ---- too small
      // reference lists are read up close, so they may be smaller than body text
      const min = el.refList ? minPt * 0.6 : minPt;
      if (text && el.style.fontSize < min && el.type !== 'title') {
        issues.push({
          id: 'small-' + el.id, elementId: el.id, severity: el.style.fontSize < min * 0.7 ? 'problem' : 'warning',
          title: `${name} may be too small to read`,
          detail: `It is ${el.style.fontSize} pt. On a poster this size, aim for at least ${minPt} pt so it can be read from a step or two away.`,
        });
      }
      // ---- contrast
      const fg = resolveColor(el.style.color, p.palette);
      const bg = backgroundBehind(p, el);
      const ratio = bg ? contrastRatio(fg, bg) : null;
      const need = el.type === 'title' || el.type === 'heading' || el.style.fontSize >= minPt * 1.5 ? 3 : 4.5;
      if (text && ratio != null && ratio < need) {
        issues.push({
          id: 'contrast-' + el.id, elementId: el.id, severity: ratio < 2 ? 'problem' : 'warning',
          title: `${name} is hard to read against its background`,
          detail: `The contrast is ${ratio.toFixed(1)}:1; aim for at least ${need}:1. Choose a darker or lighter text colour.`,
        });
      }
      if (overflowing.has(el.id)) {
        issues.push({ id: 'overflow-' + el.id, elementId: el.id, severity: 'problem', title: `${name}: some text is hidden`, detail: 'Select it and use “Shrink text to fit” or “Make box taller”.' });
      }
    }

    if (el.type === 'image') {
      if (!el.src) {
        issues.push({ id: 'noimg-' + el.id, elementId: el.id, severity: 'warning', title: 'An empty image placeholder', detail: 'Double-click it to add a picture, select it and add a graph, or delete it.', leftover: true });
      } else {
        const info = images.get(el.id);
        if (info) {
          const dpi = (info.width * (el.crop?.w ?? 1)) / (el.w / 25.4);
          if (dpi < 150) {
            issues.push({
              id: 'dpi-' + el.id, elementId: el.id, severity: dpi < 90 ? 'problem' : 'warning',
              title: 'An image may print blurry',
              detail: `At this size it prints at about ${Math.round(dpi)} dpi; 150 dpi or more looks sharp. Use a larger image file or make it smaller on the poster.`,
            });
          }
        }
      }
    }
    if (el.type === 'table') {
      const t = normalizeTable(el.table);
      const filled = t.rows.flat().filter((c) => c.trim()).length;
      if (!filled) issues.push({ id: 'blank-' + el.id, elementId: el.id, severity: 'warning', title: 'An empty table', detail: 'Double-click a cell to type, paste cells from a spreadsheet, or delete the table.' });
      if (filled && t.fontSize < minPt * 0.85) {
        issues.push({
          id: 'small-' + el.id, elementId: el.id, severity: t.fontSize < minPt * 0.6 ? 'problem' : 'warning',
          title: 'Table text may be too small to read',
          detail: `It is ${t.fontSize} pt. On a poster this size, aim for at least ${Math.round(minPt * 0.85)} pt (Text size in the side panel), or move detail to a handout.`,
        });
      }
      if (overflowing.has(el.id)) {
        issues.push({ id: 'overflow-' + el.id, elementId: el.id, severity: 'problem', title: 'Table: some rows are hidden', detail: 'Select it and use “Make box taller” or “Shrink text to fit”.' });
      }
    }
    if (el.type === 'equation' && el.equation && el.equation.fontSize < minPt) {
      issues.push({ id: 'eqfont-' + el.id, elementId: el.id, severity: 'warning', title: 'An equation may be too small to read', detail: `It is ${el.equation.fontSize} pt; aim for at least ${minPt} pt (Size in the side panel).` });
    }
    if (el.type === 'chart' && el.chart && el.chart.fontSize < minPt * 0.75) {
      issues.push({ id: 'chartfont-' + el.id, elementId: el.id, severity: 'warning', title: 'Graph labels may be too small', detail: `They are ${el.chart.fontSize} pt; try at least ${Math.round(minPt * 0.75)} pt (Label size in the side panel).` });
    }
    if (el.type === 'chart' && el.chart) {
      const cvd = chartColorIssue(el, p);
      if (cvd) issues.push(cvd);
    }
    const alt = altTextIssue(el);
    if (alt) issues.push(alt);
  }

  // ---- citations
  const counts = citeCounts(p);
  const refIds = new Set((p.references ?? []).map((r) => r.id));
  const broken = [...counts.keys()].filter((id) => !refIds.has(id));
  if (broken.length) {
    const el = p.elements.find((e) => broken.some((id) => e.html?.includes(id)));
    issues.push({ id: 'cite-missing', elementId: el?.id, severity: 'warning', title: 'A citation points to a missing reference', detail: 'It shows as [?]. Delete the marker and cite the reference again from the Cite list.' });
  }
  if (counts.size && !p.elements.some((e) => e.refList)) {
    issues.push({ id: 'cite-nolist', severity: 'warning', title: 'Citations but no reference list', detail: 'Add one with Insert → References / citations → Add reference list to poster.' });
  }
  const uncited = (p.references ?? []).filter((r) => !counts.has(r.id));
  if (counts.size && uncited.length) {
    issues.push({ id: 'cite-unused', severity: 'tip', title: `${uncited.length} reference${uncited.length > 1 ? 's are' : ' is'} not cited in the text`, detail: 'They are listed at the end of the reference list. Cite them, or remove them under Insert → References / citations.' });
  }

  // ---- crowding: content too close to everything else is hard to spot; keep it simple and check overall balance
  const content = p.elements.filter((e) => e.type !== 'shape');
  if (content.length) {
    const b = boundsOf(content);
    if (b.y + b.h < p.height * 0.6) {
      issues.push({ id: 'empty-bottom', severity: 'tip', title: 'The bottom of the poster is empty', detail: 'Spread your sections down the columns, or make figures larger.' });
    }
  }

  // ---- word limit (set in the Words tab)
  if (p.wordLimit && p.wordLimit > 0) {
    const total = wordCount(p).total;
    if (total > p.wordLimit) {
      issues.push({ id: 'word-limit', severity: 'warning', title: `${total - p.wordLimit} words over the limit`, detail: `The poster has ${total} words and the limit is ${p.wordLimit}. The Words tab shows which sections are longest.` });
    }
  }
  // ---- the conference's own rules (set in the Conference tab)
  issues.push(...conferenceIssues(p));
  // ---- colours that screens can show but ink cannot
  issues.push(...dullColorIssues(p));

  const order: Record<Severity, number> = { problem: 0, warning: 1, tip: 2 };
  return issues.sort((a, b) => order[a.severity] - order[b.severity]);
}

/** The one line at the top of the Export menu that points at the poster check, most serious first. */
export function exportWarningFor(issues: Issue[]): { headline: string; more: string[]; urgent: boolean } | null {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const problems = issues.filter((i) => i.severity === 'problem').length;
  const leftovers = issues.filter((i) => i.leftover).length;
  const dull = issues.filter((i) => i.id.startsWith('cmyk-')).length;
  const parts = [
    problems && `⛔ ${plural(problems, 'problem', 'problems')} to fix before printing`,
    leftovers && `${plural(leftovers, 'box still has', 'boxes still have')} example text or no picture`,
    dull && `🎨 ${plural(dull, 'colour', 'colours')} will print duller`,
  ].filter((x): x is string => !!x);
  if (!parts.length) return null;
  return { headline: parts[0], more: parts.slice(1), urgent: problems > 0 };
}
