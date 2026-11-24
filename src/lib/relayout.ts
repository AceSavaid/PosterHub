// Switching layouts without losing work.
//
// applyLayout() builds the new layout, then moves what the person has already written or
// added (title, authors, section text, figures, graphs, logos, QR codes, references) into the
// matching places. Sections are matched by name ("Methods" goes to "Methods", "Conclusion"
// to "Conclusions"), then in reading order. Nothing the person made is dropped: anything that
// has no place in the new layout is appended to the last section or kept where it was.

import type { Poster, PosterElement } from '../types';
import { buildTemplate, isStarterText, type TemplateId } from '../templates';

interface OldSection {
  name: string; // normalised, for matching
  headingHtml: string;
  renamed: boolean;
  bodies: string[];
  figures: PosterElement[];
  captions: string[];
  /** Text or figures the person changed, or a renamed heading. */
  edited: boolean;
  /** the icon at the end of the old heading, carried over to the new one */
  headingIcon?: PosterElement['headingIcon'];
}

interface Extracted {
  title?: string;
  subtitle?: string;
  sections: OldSection[];
  figures: PosterElement[]; // figures not in any section
  logos: PosterElement[];
  qrs: PosterElement[];
  references: string[];
  summary: string[];
  keyFinding: string[];
  keep: PosterElement[]; // the person's own extra elements, kept where they are
}

export interface RelayoutReport {
  sections: number;
  figures: number;
  /** Elements with no place in the new layout, left where they were. */
  keptInPlace: number;
}

const strip = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

const SYNONYMS: Record<string, string> = {
  introduction: 'introduction', intro: 'introduction', background: 'background', motivation: 'introduction',
  aim: 'aims', aims: 'aims', objective: 'aims', objectives: 'aims', 'research question': 'aims', 'research questions': 'aims',
  hypothesis: 'hypotheses', hypotheses: 'hypotheses',
  method: 'methods', methods: 'methods', methodology: 'methods', 'materials and methods': 'methods', approach: 'methods', 'study design': 'methods', design: 'methods',
  participants: 'participants', sample: 'participants', subjects: 'participants', materials: 'materials',
  analysis: 'analysis', 'data analysis': 'analysis', 'statistical analysis': 'analysis',
  result: 'results', results: 'results', findings: 'results', 'key figure': 'results', 'key findings': 'key findings',
  discussion: 'discussion', limitation: 'limitations', limitations: 'limitations',
  conclusion: 'conclusions', conclusions: 'conclusions', summary: 'conclusions', 'take home message': 'conclusions', takeaways: 'conclusions',
  'future work': 'future work', 'future directions': 'future work', 'next steps': 'future work',
  acknowledgements: 'acknowledgements', acknowledgments: 'acknowledgements', 'acknowledgement': 'acknowledgements', funding: 'funding',
  references: 'references', bibliography: 'references', 'literature cited': 'references',
  // Names used by the research-field layouts, so content finds its place when switching to or from them.
  problem: 'introduction', context: 'background', question: 'aims',
  'learning points': 'conclusions', 'teaching points': 'conclusions',
  'case summary': 'case summary', 'case presentation': 'case summary', 'case report': 'case summary', 'case description': 'case summary',
  'code and data': 'data and code', 'data and code': 'data and code',
};

export function sectionKey(html: string): string {
  const t = strip(html).toLowerCase().replace(/^[\d.)\s]+/, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  return SYNONYMS[t] ?? t;
}

const hasContent = (e: PosterElement) =>
  e.type === 'chart' ? !!e.chart : e.type === 'image' ? !!e.src : e.type === 'shape' ? false : !isStarterText(e.html);

const overlapX = (a: PosterElement, b: PosterElement) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);

/** Section headings on a poster (not the numbers in numbered layouts). */
export function sectionHeadings(elements: PosterElement[]): PosterElement[] {
  return elements.filter((e) => e.type === 'heading' && (e.role ?? 'heading') === 'heading' && !/^\s*\d+\s*$/.test(strip(e.html ?? '')));
}

/** Finds the section heading an element belongs to: its group, else the closest heading above it in the same column. */
export function headingOwner(headings: PosterElement[]): (e: PosterElement) => PosterElement | undefined {
  const groupHeading = new Map<string, PosterElement>();
  for (const h of headings) if (h.group) groupHeading.set(h.group, h);
  return (e) => {
    if (e.group && groupHeading.has(e.group)) return groupHeading.get(e.group);
    if (e.group) return undefined;
    let best: PosterElement | undefined;
    for (const h of headings) {
      if (h.y > e.y + 0.5 || overlapX(h, e) < Math.min(h.w, e.w) * 0.5) continue;
      if (!best || h.y > best.y) best = h;
    }
    return best;
  };
}

/** Reads what is on the poster now: by role for layouts made by the app, by position for anything else. */
export function extractContent(elements: PosterElement[]): Extracted {
  const out: Extracted = { sections: [], figures: [], logos: [], qrs: [], references: [], summary: [], keyFinding: [], keep: [] };
  const fromTemplate = elements.some((e) => e.role);
  const headings = sectionHeadings(elements);

  // One section per heading.
  const byHeading = new Map<PosterElement, OldSection>();
  for (const h of [...headings].sort((a, b) => a.x - b.x || a.y - b.y)) {
    const name = sectionKey(h.html ?? '');
    const renamed = !isStarterText(h.html);
    const sec: OldSection = { name, headingHtml: h.html ?? '', renamed, bodies: [], figures: [], captions: [], edited: renamed || !!h.headingIcon };
    if (h.headingIcon) sec.headingIcon = { ...h.headingIcon };
    byHeading.set(h, sec);
  }
  const headingOf = headingOwner(headings);
  const ownerOf = (e: PosterElement): OldSection | undefined => {
    const h = headingOf(e);
    return h && byHeading.get(h);
  };

  for (const e of elements) {
    if (e.type === 'heading' && headings.includes(e)) continue;
    const role = e.role ?? (e.type === 'title' || e.type === 'subtitle' ? e.type : undefined);
    if (role === 'decor' || role === 'number' || role === 'summaryHeading' || role === 'qrCaption') continue;
    if (role === 'title' || role === 'subtitle') {
      if (!isStarterText(e.html) && out[role] == null) out[role] = e.html;
      else if (!isStarterText(e.html)) out.keep.push(e);
      continue;
    }
    if (!hasContent(e)) {
      // Untouched starter text and empty boxes are rebuilt by the new layout. Plain shapes
      // the person drew on an app-made layout are theirs, so keep them.
      if (e.type === 'shape' && fromTemplate && !e.role) out.keep.push(e);
      continue;
    }
    const isFigure = e.type === 'image' || e.type === 'chart';
    const placeholderRole = e.placeholder === 'Logo' ? 'logo' : e.placeholder === 'QR code' ? 'qr' : undefined;
    const r = role ?? placeholderRole ?? (e.qr ? 'qr' : undefined);
    if (r === 'logo') out.logos.push(e);
    else if (r === 'qr') out.qrs.push(e);
    else if (r === 'references' || (!r && e.type === 'text' && /^references\b/i.test(strip(e.html ?? '')))) out.references.push(e.html!);
    else if (r === 'summary') out.summary.push(e.html!);
    else if (r === 'keyFinding') out.keyFinding.push(e.html!);
    else {
      const sec = ownerOf(e);
      if (sec) {
        sec.edited = true;
        if (isFigure) sec.figures.push(e);
        else if (r === 'caption') sec.captions.push(e.html!);
        else sec.bodies.push(e.html!);
      } else if (isFigure) out.figures.push(e);
      else if (r === 'caption') out.keep.push(e);
      else out.keep.push(e);
    }
  }

  // Reading order: down each column, then across.
  const order = [...byHeading.entries()].sort(([a], [b]) => (Math.abs(a.x - b.x) > 1 ? a.x - b.x : a.y - b.y));
  out.sections = order.map(([, s]) => s).filter((s) => s.edited);
  return out;
}

interface NewSection {
  key: string;
  heading?: PosterElement;
  body?: PosterElement;
  figure?: PosterElement;
  caption?: PosterElement;
  used: boolean;
}

const append = (a: string | undefined, b: string) => (a && !isStarterText(a) ? `${a}<br>${b}` : b);

/** Builds `template` for this poster and moves the person's content into it. */
export function applyLayout(poster: Poster, template: TemplateId): { elements: PosterElement[]; report: RelayoutReport } {
  const old = extractContent(poster.elements);
  const els = buildTemplate(template, poster);
  const report: RelayoutReport = { sections: 0, figures: 0, keptInPlace: 0 };
  if (!els.length) {
    // Blank layout: keep everything the person made exactly where it is.
    const kept = poster.elements.filter((e) => hasContent(e) || (e.type === 'shape' && !e.role && poster.elements.some((x) => x.role)));
    return { elements: kept.map((e) => ({ ...e })), report: { sections: 0, figures: 0, keptInPlace: kept.length } };
  }

  const byRole = (role: string) => els.filter((e) => e.role === role);
  const first = (role: string) => els.find((e) => e.role === role);

  if (old.title != null) first('title')!.html = old.title;
  if (old.subtitle != null) first('subtitle')!.html = old.subtitle;

  // Sections in the new layout, in build order (which is reading order).
  const groups = new Map<string, NewSection>();
  for (const e of els) {
    if (!e.group) continue;
    const g = groups.get(e.group) ?? { key: '', used: false };
    if (e.role === 'heading') {
      g.heading = e;
      g.key = sectionKey(e.html ?? '');
    } else if (e.role === 'body') g.body = e;
    else if (e.role === 'figure') g.figure = e;
    else if (e.role === 'caption') g.caption = e;
    groups.set(e.group, g);
  }
  const slots = [...groups.values()].filter((g) => g.heading);

  // 1. same name, 2. any free section in reading order, 3. append to the last section.
  const assigned = new Map<OldSection, NewSection>();
  for (const sec of old.sections) {
    const match = slots.find((g) => !g.used && g.key === sec.name);
    if (match) {
      match.used = true;
      assigned.set(sec, match);
    }
  }
  for (const sec of old.sections) {
    if (assigned.has(sec)) continue;
    const free = slots.find((g) => !g.used && g.body);
    if (free) {
      free.used = true;
      assigned.set(sec, free);
    }
  }
  const textSlots = slots.filter((g) => g.body || g.caption);
  const lastText = textSlots[textSlots.length - 1];
  const figurePool: PosterElement[] = [...old.figures];

  for (const sec of old.sections) {
    const slot = assigned.get(sec);
    const text = [...sec.bodies, ...sec.captions].join('<br>');
    if (slot) {
      report.sections++;
      // Keep the person's own heading, and the old name when content lands in a differently named spot.
      if (slot.heading && (sec.renamed || slot.key !== sec.name)) slot.heading.html = sec.headingHtml;
      if (slot.heading && sec.headingIcon) slot.heading.headingIcon = sec.headingIcon;
      if (slot.body && sec.bodies.length) slot.body.html = sec.bodies.join('<br>');
      if (slot.caption && sec.captions.length) slot.caption.html = sec.captions.join('<br>');
      else if (!slot.body && slot.caption && sec.bodies.length) slot.caption.html = sec.bodies.join('<br>');
      else if (slot.body && !slot.caption && sec.captions.length) slot.body.html = append(slot.body.html, sec.captions.join('<br>'));
    } else if (lastText) {
      report.sections++;
      const target = (lastText.body ?? lastText.caption)!;
      const heading = strip(sec.headingHtml) || capitalise(sec.name);
      target.html = append(target.html, `<b>${heading}</b>${text ? '<br>' + text : ''}`);
    }
    const figs = [...sec.figures];
    if (slot?.figure && figs.length) {
      place(els, slot.figure, figs.shift()!);
      slot.figure = undefined;
      report.figures++;
    }
    figurePool.push(...figs);
  }

  // Remaining figures go into empty figure spots, the big ones first.
  // (Spots already holding one of the person's figures are not empty.)
  const emptyFigures = byRole('figure').filter((f) => !hasContent(f)).sort((a, b) => b.w * b.h - a.w * a.h);
  for (const fig of figurePool) {
    const spot = emptyFigures.find((f) => els.includes(f));
    if (spot) {
      place(els, spot, fig);
      emptyFigures.splice(emptyFigures.indexOf(spot), 1);
      report.figures++;
    } else {
      els.push({ ...fig });
      report.keptInPlace++;
    }
  }

  fillSlots(els, byRole('logo'), old.logos, report);
  fillSlots(els, byRole('qr'), old.qrs, report);

  const toText = (role: string, htmls: string[]) => {
    if (!htmls.length) return;
    const slot = first(role);
    const html = htmls.join('<br>');
    if (slot) slot.html = html;
    else {
      const target = role === 'references' ? lastText : textSlots[0];
      const el = target && (target.body ?? target.caption);
      if (el) el.html = role === 'references' ? append(el.html, html) : isStarterText(el.html) ? html : `${html}<br>${el.html}`;
    }
  };
  toText('references', old.references);
  toText('keyFinding', old.keyFinding);
  if (old.summary.length) {
    // A summary fits the sidebar; otherwise the key-finding strip; otherwise the first section.
    if (first('summary')) toText('summary', old.summary);
    else if (first('keyFinding') && !old.keyFinding.length) toText('keyFinding', old.summary);
    else toText('summary', old.summary);
  }

  for (const e of old.keep) {
    els.push({ ...e });
    report.keptInPlace++;
  }
  return { elements: els, report };
}

/** Puts the person's figure, logo or QR code into a spot, taking the spot's size and position. */
function place(els: PosterElement[], spot: PosterElement, item: PosterElement) {
  const moved: PosterElement = { ...item, x: spot.x, y: spot.y, w: spot.w, h: spot.h, group: spot.group, role: spot.role };
  if (moved.type === 'image') moved.placeholder = spot.placeholder;
  els[els.indexOf(spot)] = moved;
}

function fillSlots(els: PosterElement[], spots: PosterElement[], items: PosterElement[], report: RelayoutReport) {
  items.forEach((item, i) => {
    if (spots[i]) place(els, spots[i], item);
    else {
      els.push({ ...item });
      report.keptInPlace++;
    }
  });
}

const capitalise = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

export function describeReport(r: RelayoutReport): string {
  const parts: string[] = [];
  if (r.sections) parts.push(`${r.sections} section${r.sections > 1 ? 's' : ''}`);
  if (r.figures) parts.push(`${r.figures} figure${r.figures > 1 ? 's' : ''}`);
  let msg = parts.length ? `Layout applied. Moved your ${parts.join(' and ')} into it.` : 'Layout applied.';
  if (r.keptInPlace) msg += ` ${r.keptInPlace} item${r.keptInPlace > 1 ? 's' : ''} had no matching spot and stayed where ${r.keptInPlace > 1 ? 'they were' : 'it was'}.`;
  return msg + ' Undo with Ctrl/⌘ Z.';
}
