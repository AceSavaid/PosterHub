// "Fill from your abstract": splits an abstract into Background / Methods / Results /
// Conclusions and drops each part into the matching section of the poster.
//
// Structured abstracts ("Background: … Methods: …") are split at their headings. Abstracts
// without headings are split sentence by sentence using cue phrases ("we recruited",
// "we found", "these findings suggest") and where each sentence sits, keeping the parts in
// the usual order. Either way the person checks and fixes the split before anything changes.

import JSZip from 'jszip';
import type { Poster, PosterElement } from '../types';
import { isStarterText } from '../templates';
import { headingOwner, sectionHeadings, sectionKey } from './relayout';
import { cleanHtml, htmlToText } from './sanitize';

export type AbstractKind = 'background' | 'aims' | 'methods' | 'results' | 'discussion' | 'conclusions' | 'other';

export interface AbstractPart {
  kind: AbstractKind;
  /** The heading as written in the abstract, or the guessed name. */
  label: string;
  /** Plain text; paragraphs separated by "\n". */
  text: string;
  /** true when the abstract had no heading here and the split is a best guess */
  guessed: boolean;
}

export interface ParsedAbstract {
  parts: AbstractPart[];
  /** true when the abstract had its own headings */
  structured: boolean;
}

const KIND_NAMES: Record<AbstractKind, string> = {
  background: 'Background',
  aims: 'Aims',
  methods: 'Methods',
  results: 'Results',
  discussion: 'Discussion',
  conclusions: 'Conclusions',
  other: 'Other',
};

/** Headings used in structured abstracts, and which part each one starts. */
const LABELS: [string, AbstractKind][] = [
  ['background and aims', 'background'], ['background and objectives', 'background'], ['background and purpose', 'background'],
  ['background', 'background'], ['introduction', 'background'], ['context', 'background'], ['rationale', 'background'],
  ['importance', 'background'], ['motivation', 'background'], ['problem', 'background'], ['purpose', 'aims'],
  ['aims and objectives', 'aims'], ['aim', 'aims'], ['aims', 'aims'], ['objective', 'aims'], ['objectives', 'aims'],
  ['study objective', 'aims'], ['study objectives', 'aims'], ['goal', 'aims'], ['goals', 'aims'], ['research question', 'aims'],
  ['research questions', 'aims'], ['hypothesis', 'aims'], ['hypotheses', 'aims'],
  ['materials and methods', 'methods'], ['methods and materials', 'methods'], ['patients and methods', 'methods'],
  ['subjects and methods', 'methods'], ['participants and methods', 'methods'], ['methods', 'methods'], ['method', 'methods'],
  ['methodology', 'methods'], ['design', 'methods'], ['study design', 'methods'], ['design and methods', 'methods'],
  ['design, setting, and participants', 'methods'], ['design, setting and participants', 'methods'], ['setting', 'methods'],
  ['participants', 'methods'], ['patients', 'methods'], ['approach', 'methods'], ['procedure', 'methods'], ['procedures', 'methods'],
  ['data sources', 'methods'], ['interventions', 'methods'], ['intervention', 'methods'], ['exposures', 'methods'], ['exposure', 'methods'],
  ['main outcome measures', 'methods'], ['main outcomes and measures', 'methods'], ['measures', 'methods'], ['analysis', 'methods'],
  ['experimental design', 'methods'], ['study selection', 'methods'], ['data extraction', 'methods'],
  ['results', 'results'], ['result', 'results'], ['findings', 'results'], ['main results', 'results'], ['outcomes', 'results'],
  ['discussion', 'discussion'], ['limitations', 'discussion'],
  ['conclusions and relevance', 'conclusions'], ['conclusions', 'conclusions'], ['conclusion', 'conclusions'],
  ['interpretation', 'conclusions'], ['implications', 'conclusions'], ['significance', 'conclusions'],
  ['clinical relevance', 'conclusions'], ['summary', 'conclusions'],
  ['keywords', 'other'], ['key words', 'other'], ['trial registration', 'other'], ['registration', 'other'], ['funding', 'other'],
];
const LABEL_KIND = new Map(LABELS);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LABEL_ALT = [...LABEL_KIND.keys()].sort((a, b) => b.length - a.length).map((l) => escapeRe(l).replace(/ /g, '\\s+')).join('|');
// A heading starts the text, a line, or follows the end of a sentence; it ends with a colon,
// a dash, a full stop or a line break, or (written in capitals) just a space.
const HEADING_RE = new RegExp(`(^|\\n|[.!?;)][”"’']?[ \\t]+)[ \\t]*(${LABEL_ALT})[ \\t]*([:\\-–—.]|(?=\\n)|$|[ \\t]+(?=\\S))`, 'gi');

const tidy = (s: string) =>
  s
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t ]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');

/** Finds the headings of a structured abstract, or nothing when it has fewer than two. */
function findHeadings(text: string): { start: number; end: number; label: string; kind: AbstractKind }[] {
  const found: { start: number; end: number; label: string; kind: AbstractKind }[] = [];
  HEADING_RE.lastIndex = 0;
  for (let m: RegExpExecArray | null; (m = HEADING_RE.exec(text)); ) {
    const [whole, lead, label, delim] = m;
    const start = m.index + lead.length;
    const atLineStart = lead === '' || lead === '\n';
    const caps = label === label.toUpperCase();
    const ok =
      delim === ':' || /[-–—]/.test(delim) ? true
      : delim === '.' ? atLineStart
      : delim === '' ? atLineStart // the heading is a line of its own
      : caps && label.length > 2; // "BACKGROUND The aim of…"
    if (!ok) {
      // let the next search start inside this match so a heading right after it isn't skipped
      HEADING_RE.lastIndex = m.index + Math.max(1, lead.length);
      continue;
    }
    const kind = LABEL_KIND.get(label.toLowerCase().replace(/\s+/g, ' '))!;
    found.push({ start, end: m.index + whole.length, label: label.replace(/\s+/g, ' '), kind });
  }
  const real = found.filter((f) => f.kind !== 'other');
  return real.length >= 2 ? found : [];
}

const titleCase = (s: string) => (s === s.toUpperCase() ? s.toLowerCase() : s).replace(/^\w/, (c) => c.toUpperCase());

/** Splits an abstract into its parts. */
export function parseAbstract(raw: string): ParsedAbstract {
  const text = tidy(raw).replace(/^abstract\b[ \t]*[:.\-–—]?[ \t]*\n?/i, '');
  if (!text) return { parts: [], structured: false };
  const heads = findHeadings(text);
  if (heads.length) {
    const parts: AbstractPart[] = [];
    const lead = tidy(text.slice(0, heads[0].start));
    if (lead) parts.push({ kind: 'background', label: 'Opening text', text: lead, guessed: true });
    heads.forEach((h, i) => {
      const body = tidy(text.slice(h.end, i + 1 < heads.length ? heads[i + 1].start : text.length));
      if (!body) return;
      parts.push({ kind: h.kind, label: titleCase(h.label), text: body, guessed: false });
    });
    return { parts, structured: true };
  }
  return { parts: guessParts(text), structured: false };
}

// ---------- best guess for abstracts without headings ----------

const ABBREV = /\b(e\.g|i\.e|et al|vs|cf|fig|figs|eq|approx|ca|no|nos|dr|prof|mr|mrs|ms|st|resp|incl|etc|al|sp|spp|var|min|max|vol)\.$/i;

/** Splits text into sentences, keeping abbreviations such as "et al." and "e.g." inside them. */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let cur = '';
    const pieces = para.split(/(?<=[.!?][”"’')\]]?)\s+(?=[A-Z0-9“"‘'(\[])/);
    for (const piece of pieces) {
      cur = cur ? `${cur} ${piece}` : piece;
      if (!ABBREV.test(cur) && !/\b[A-Z]\.$/.test(cur)) {
        out.push(cur.trim());
        cur = '';
      }
    }
    if (cur.trim()) out.push(cur.trim());
  }
  return out.filter(Boolean);
}

type GuessKind = 'background' | 'methods' | 'results' | 'conclusions';
const ORDER: GuessKind[] = ['background', 'methods', 'results', 'conclusions'];
const CENTRE: Record<GuessKind, number> = { background: 0.08, methods: 0.38, results: 0.65, conclusions: 0.95 };

const CUES: Record<GuessKind, RegExp[]> = {
  background: [
    /\b(little|less|not much) is known\b/i, /\b(remains?|is|are) (unclear|unknown|poorly understood|understudied|debated)\b/i,
    /\bhave (been|long been) (shown|suggested|linked|proposed|associated)\b/i, /\bprevious (studies|research|work)\b/i,
    /\b(is|are) (a|an|the|one of the)\b.*\b(common|major|leading|important|key|growing|serious|global)\b/i,
    /\b(however|despite|although)\b/i, /\b(increasingly|growing (evidence|interest|body))\b/i,
    /\b(the )?(aim|purpose|objective|goal)s? of (this|the|our) (study|work|paper|project|research)\b/i,
    /\bwe (aimed|aim|sought|seek|set out|hypothesi[sz]ed|asked|investigated whether)\b/i,
    /\bthis (study|paper|project|work|research) (aims|aimed|investigates|examines|explores|asks|addresses)\b/i,
    /\b(here|in this (study|paper|work)),? we (ask|investigate|examine|explore)\b/i, /\bgap\b/i,
  ],
  methods: [
    /\bwe (recruited|collected|used|conducted|performed|measured|analy[sz]ed|surveyed|interviewed|sampled|randomi[sz]ed|assessed|compared|developed|designed|applied|trained|tested|built|simulated|model+ed|extracted|enrolled|followed|combined|fitted|fit|implemented|propose|present|introduce|carried out|obtained|searched|reviewed)\b/i,
    /\b(was|were) (recruited|randomi[sz]ed|assigned|collected|measured|analy[sz]ed|interviewed|enrolled|asked|obtained|used|included|selected|surveyed|tested|assessed|performed|conducted|administered|scanned|sequenced|recorded|coded|extracted|followed)\b/i,
    /\b(participants|respondents|patients|subjects|volunteers|mice|rats|samples|specimens)\b/i,
    /\b(cross-sectional|longitudinal|randomi[sz]ed|retrospective|prospective|cohort|case-control|qualitative|quantitative|mixed[- ]methods?|observational|pilot|controlled) (study|design|trial|analysis|approach|survey)\b/i,
    /\b(n|N)\s*=\s*\d/, /\b(regression|ANOVA|t-tests?|chi-square|mixed[- ]effects?|questionnaires?|semi-structured|thematic analysis|survey|interviews|focus groups|meta-analysis|systematic review)\b/i,
    /\busing (a|an|the|data|our)?\b/i, /\bdata (were|was|from)\b/i, /\b(sample|cohort) of\b/i,
  ],
  results: [
    /\bwe (found|observed|identified|show|showed|detected|report)\b/i,
    /\b(results|findings|analys[ie]s|data) (showed|show|revealed|reveal|indicated|indicate|demonstrated|demonstrate)\b/i,
    /\b(was|were|is|are) (significantly|strongly|positively|negatively|not) (associated|correlated|related|higher|lower|greater|reduced|increased|different)\b/i,
    /\bsignificant(ly)?\b/i, /\bp\s*[<=>≤]\s*0?\.\d/i, /\d+(\.\d+)?\s?%/, /\b(odds|hazard|risk) ratio\b/i, /\b(95% CI|CI|OR|HR|RR|SD|SE)\b/,
    /\b(increased|decreased|improved|reduced|rose|fell|declined) (by|from|to)\b/i, /\b(higher|lower|greater|fewer|more) than\b/i,
    /\b(outperform(s|ed)?|achiev(ed|es))\b/i, /\b(accuracy|sensitivity|specificity|precision|AUC)\b/i, /\b[rR]\s*=\s*[-−]?0?\.\d/,
    /\b(no|a) (statistically )?(significant )?(difference|association|correlation|effect)\b/i, /\bthemes? (emerged|were identified)\b/i,
  ],
  conclusions: [
    /\b(in )?conclusions?\b/i, /\b(these|our|the) (findings|results|data|observations) (suggest|indicate|show|highlight|support|demonstrate|provide|imply|underscore)\b/i,
    /\bsuggests? that\b/i, /\bimplications?\b/i, /\b(may|could|should|might) (be used|help|inform|improve|guide|support|benefit|lead)\b/i,
    /\bfuture (research|work|studies)\b/i, /\bfurther (research|work|studies|investigation)\b/i, /\bhighlights? the (need|importance|potential)\b/i,
    /\bwe conclude\b/i, /\bthis (study|work|research) (shows|demonstrates|provides|highlights|suggests|is the first)\b/i,
    /\b(taken together|overall|together,)\b/i, /\b(underscores?|warrants?)\b/i, /\b(clinical(ly)? (practice|relevant|implications)|policy|practitioners)\b/i,
  ],
};

function score(sentence: string, kind: GuessKind, pos: number, n: number): number {
  let s = 0;
  for (const re of CUES[kind]) if (re.test(sentence)) s += 2;
  s = Math.min(s, 6);
  s -= Math.abs(pos - CENTRE[kind]) * 3;
  if (n >= 3 && pos === 0 && kind === 'background') s += 1.5;
  if (n >= 4 && pos === 1 && kind === 'conclusions') s += 1.5;
  return s;
}

/** Labels each sentence, keeping the parts in the usual order (background → methods → results → conclusions). */
export function guessParts(text: string): AbstractPart[] {
  const sentences = splitSentences(text);
  const n = sentences.length;
  if (!n) return [];
  const pos = (i: number) => (n === 1 ? 0 : i / (n - 1));
  // best[i][k]: best total for sentences 0..i with sentence i labelled ORDER[k]
  const best: number[][] = [];
  const from: number[][] = [];
  for (let i = 0; i < n; i++) {
    best.push([]);
    from.push([]);
    for (let k = 0; k < ORDER.length; k++) {
      const own = score(sentences[i], ORDER[k], pos(i), n);
      if (i === 0) {
        best[i][k] = own;
        from[i][k] = -1;
        continue;
      }
      let bk = 0;
      for (let j = 1; j <= k; j++) if (best[i - 1][j] > best[i - 1][bk]) bk = j;
      best[i][k] = best[i - 1][bk] + own;
      from[i][k] = bk;
    }
  }
  let k = 0;
  for (let j = 1; j < ORDER.length; j++) if (best[n - 1][j] > best[n - 1][k]) k = j;
  const labels: GuessKind[] = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    labels[i] = ORDER[k];
    k = from[i][k];
  }
  const parts: AbstractPart[] = [];
  sentences.forEach((s, i) => {
    const last = parts[parts.length - 1];
    if (last && last.kind === labels[i]) last.text += ' ' + s;
    else parts.push({ kind: labels[i], label: KIND_NAMES[labels[i]], text: s, guessed: true });
  });
  return parts;
}

// ---------- Word files ----------

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const MAX_DOCX = 50 * 1024 * 1024;
const MAX_XML = 40 * 1024 * 1024;

export interface DocxText {
  title?: string;
  /** The abstract (or the whole document when it has no "Abstract" heading), one paragraph per line. */
  text: string;
}

interface Para {
  text: string;
  style: string;
  /** heading level from the paragraph style, 0 for body text */
  level: number;
}

function paragraphText(p: Element): string {
  let out = '';
  const walk = (node: Element) => {
    for (const c of Array.from(node.children)) {
      if (c.namespaceURI === W) {
        if (c.localName === 'del' || c.localName === 'instrText' || c.localName === 'delText' || c.localName === 'footnoteReference') continue;
        if (c.localName === 't') out += c.textContent ?? '';
        else if (c.localName === 'tab') out += ' ';
        else if (c.localName === 'br' || c.localName === 'cr') out += '\n';
        else if (c.localName === 'noBreakHyphen') out += '-';
        else walk(c);
      } else if (c.localName !== 'Fallback') walk(c);
    }
  };
  walk(p);
  return out;
}

/** Reads the abstract (and title) out of a Word .docx file. */
export async function readDocx(file: Blob): Promise<DocxText> {
  if (file.size > MAX_DOCX) throw new Error('That file is too large to read (over 50 MB).');
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error('This does not look like a Word (.docx) file. Older .doc files need saving as .docx first.');
  }
  const entry = zip.file('word/document.xml');
  if (!entry) throw new Error('This does not look like a Word (.docx) file.');
  const size = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
  if (size != null && size > MAX_XML) throw new Error('That document is too large to read.');
  const xml = await entry.async('string');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('This Word file looks damaged.');
  const body = doc.getElementsByTagNameNS(W, 'body')[0];
  if (!body) throw new Error('This Word file has no text.');

  const paras: Para[] = [];
  for (const p of Array.from(body.getElementsByTagNameNS(W, 'p'))) {
    // Text boxes are stored twice (modern and fallback); read only the modern copy.
    let inFallback = false;
    for (let a = p.parentElement; a; a = a.parentElement) if (a.localName === 'Fallback') inFallback = true;
    if (inFallback) continue;
    const styleEl = Array.from(p.getElementsByTagNameNS(W, 'pStyle')).find((s) => s.parentElement?.parentElement === p);
    const style = (styleEl?.getAttributeNS(W, 'val') ?? styleEl?.getAttribute('w:val') ?? '').toLowerCase();
    const lvl = /^heading\s?(\d)$/.exec(style) ?? /^(?:berschrift|titre)(\d)$/.exec(style);
    const text = paragraphText(p).replace(/[ \t ]+/g, ' ').trim();
    if (text) paras.push({ text, style, level: lvl ? +lvl[1] : 0 });
  }

  const title = paras.find((p) => p.style === 'title')?.text;
  let start = 0;
  let end = paras.length;
  const absIdx = paras.findIndex((p) => /^abstract\b[\s:.\-–—]*$/i.test(p.text) || /^abstract\s*[:.\-–—]\s*\S/i.test(p.text));
  if (absIdx >= 0) {
    const abs = paras[absIdx];
    const inline = abs.text.replace(/^abstract\s*[:.\-–—]?\s*/i, '');
    start = absIdx + 1;
    if (inline) {
      paras[absIdx] = { ...abs, text: inline };
      start = absIdx;
    }
    for (let i = absIdx + 1; i < paras.length; i++) {
      const p = paras[i];
      if (/^key\s?words?\b/i.test(p.text)) {
        end = i;
        break;
      }
      // the next heading at the same level or above ends the abstract
      if (p.level && (!abs.level || p.level <= abs.level)) {
        end = i;
        break;
      }
    }
  }
  const text = paras
    .slice(start, end)
    .filter((p) => p.style !== 'title')
    .map((p) => p.text)
    .join('\n');
  return { title: title || undefined, text };
}

// ---------- putting the parts on the poster ----------

export interface PosterSection {
  /** The section heading as shown on the poster. */
  name: string;
  key: string;
  /** The text box that takes the section's text. */
  bodyId: string;
  /** true when that text box holds the person's own writing, not the starter text */
  edited: boolean;
}

/** The poster's sections that have a text box, in reading order (down each column, then across). */
export function posterSections(elements: PosterElement[]): PosterSection[] {
  const headings = sectionHeadings(elements);
  const owner = headingOwner(headings);
  const bodies = new Map<PosterElement, PosterElement>();
  for (const e of elements) {
    if (e.type !== 'text' || e.refList || e.authors) continue;
    if (e.role && e.role !== 'body') continue;
    const h = owner(e);
    if (!h) continue;
    const cur = bodies.get(h);
    if (!cur || e.y < cur.y) bodies.set(h, e);
  }
  return headings
    .filter((h) => bodies.has(h))
    .sort((a, b) => (Math.abs(a.x - b.x) > 1 ? a.x - b.x : a.y - b.y))
    .map((h) => {
      const body = bodies.get(h)!;
      return { name: htmlToText(h.html).trim(), key: sectionKey(h.html ?? ''), bodyId: body.id, edited: !isStarterText(body.html) && !!htmlToText(body.html).trim() };
    });
}

/** Section names (as sectionKey gives them) that suit each part, best first. */
const PREFERS: Record<AbstractKind, string[]> = {
  background: ['background', 'introduction', 'aims'],
  aims: ['aims', 'hypotheses', 'introduction', 'background'],
  methods: ['methods', 'participants', 'materials', 'analysis'],
  results: ['results', 'key findings'],
  discussion: ['discussion', 'conclusions', 'limitations'],
  conclusions: ['conclusions', 'discussion', 'key findings', 'future work'],
  other: ['funding'],
};

export const suits = (kind: AbstractKind, key: string) => PREFERS[kind].includes(key);

/**
 * Picks a section for each part (an index into `sections`, or null to leave it out).
 * Parts with no matching section join a neighbouring part, so the text stays in reading order.
 */
export function suggestTargets(parts: AbstractPart[], sections: PosterSection[]): (number | null)[] {
  const out: (number | null)[] = parts.map((p) => {
    for (const key of PREFERS[p.kind]) {
      const i = sections.findIndex((s) => s.key === key);
      if (i >= 0) return i;
    }
    return null;
  });
  if (!sections.length) return out;
  const unmatched = parts.map((p, i) => out[i] == null && p.kind !== 'other');
  // Join the part before; failing that the part after; failing that the first section.
  for (let i = 0; i < parts.length; i++) {
    if (!unmatched[i]) continue;
    let t: number | null = null;
    for (let j = i - 1; j >= 0 && t == null; j--) if (!unmatched[j]) t = out[j];
    for (let j = i + 1; j < parts.length && t == null; j++) if (!unmatched[j]) t = out[j];
    out[i] = t ?? 0;
  }
  return out;
}

export interface FillPlan {
  /** Each part with the text box it goes into (null = leave out). */
  parts: { part: AbstractPart; bodyId: string | null }[];
  /** New poster title, if the person chose to use the one from their Word file. */
  title?: string;
  /** Replace text the person already wrote in those sections, instead of adding after it. */
  replace: boolean;
}

export interface FillReport {
  sections: number;
  title: boolean;
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const toHtml = (text: string) => tidy(text).split('\n').map(escapeHtml).join('<br>');

/** Writes the abstract into the poster (in place). Text is treated as plain text and the result is sanitised. */
export function fillPoster(poster: Poster, plan: FillPlan): FillReport {
  const report: FillReport = { sections: 0, title: false };
  const sections = posterSections(poster.elements);
  const byBody = new Map<string, AbstractPart[]>();
  for (const { part, bodyId } of plan.parts) {
    if (!bodyId || !part.text.trim()) continue;
    byBody.set(bodyId, [...(byBody.get(bodyId) ?? []), part]);
  }
  for (const [bodyId, parts] of byBody) {
    const el = poster.elements.find((e) => e.id === bodyId);
    if (!el) continue;
    const sec = sections.find((s) => s.bodyId === bodyId);
    const labelled = parts.length > 1 || !sec || !suits(parts[0].kind, sec.key);
    const html = parts.map((p) => (labelled ? `<b>${escapeHtml(p.label)}.</b> ` : '') + toHtml(p.text)).join('<br>');
    const keep = !plan.replace && !isStarterText(el.html) && htmlToText(el.html).trim();
    el.html = cleanHtml(keep ? `${el.html}<br>${html}` : html);
    report.sections++;
  }
  const title = plan.title?.trim();
  if (title) {
    const el = poster.elements.find((e) => e.type === 'title');
    if (el) {
      el.html = cleanHtml(escapeHtml(title));
      report.title = true;
    }
  }
  return report;
}

export function describeFill(r: FillReport): string {
  if (!r.sections && !r.title) return 'Nothing was added.';
  const bits: string[] = [];
  if (r.sections) bits.push(`${r.sections} section${r.sections > 1 ? 's' : ''}`);
  if (r.title) bits.push('the title');
  return `Filled ${bits.join(' and ')} from your abstract. Check each box fits (the Check button flags text that overflows). Undo with Ctrl/⌘ Z.`;
}
