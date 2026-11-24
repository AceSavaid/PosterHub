// Pasting into a text box, like Google Docs: Ctrl/⌘ V keeps bold, italic, underline,
// superscript, subscript, lists and line breaks but takes on the poster's own font,
// size and colours; Ctrl/⌘ Shift V pastes the words only.
import { cleanHtml } from './sanitize';

const KEEP: Record<string, string> = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u', SUP: 'sup', SUB: 'sub', UL: 'ul', OL: 'ol', LI: 'li' };
const BLOCK = /^(P|DIV|H[1-6]|BLOCKQUOTE|TR|PRE)$/;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Copied HTML reduced to the simple formatting a poster text box keeps. Returns '' when nothing is left. */
export function simplifyPastedHtml(html: string): string {
  // Parsed in an inert document, so nothing in it loads or runs.
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, head, title, meta, link, template, noscript').forEach((n) => n.remove());
  const out: string[] = [];
  const endLine = () => {
    const last = out[out.length - 1];
    if (out.length && last !== '<br>' && !/^<\/?(ul|ol|li)>$/.test(last)) out.push('<br>');
  };
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) {
      const t = (n.textContent ?? '').replace(/[\r\n\t]+/g, ' ');
      if (t.trim() || (t && out.length)) out.push(esc(t));
      return;
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    const el = n as HTMLElement;
    const tag = el.tagName;
    if (tag === 'BR') return void out.push('<br>');
    const st = el.getAttribute('style') ?? '';
    const weight = /font-weight\s*:\s*(\w+)/i.exec(st)?.[1];
    const wraps: string[] = [];
    let keep = KEEP[tag];
    // Google Docs wraps everything in <b style="font-weight:normal">
    if (keep === 'b' && weight && (weight === 'normal' || Number(weight) < 600)) keep = '';
    if (keep) wraps.push(keep);
    if (tag !== 'B' && tag !== 'STRONG' && weight && (weight === 'bold' || Number(weight) >= 600)) wraps.push('b');
    if (tag !== 'I' && tag !== 'EM' && /font-style\s*:\s*italic/i.test(st)) wraps.push('i');
    if (tag !== 'U' && /text-decoration[^;]*underline/i.test(st)) wraps.push('u');
    if (/vertical-align\s*:\s*super/i.test(st)) wraps.push('sup');
    else if (/vertical-align\s*:\s*sub/i.test(st)) wraps.push('sub');
    const block = BLOCK.test(tag);
    if (block) endLine();
    for (const w of wraps) out.push(`<${w}>`);
    el.childNodes.forEach(walk);
    for (const w of [...wraps].reverse()) out.push(`</${w}>`);
    if (block) endLine();
  };
  doc.body.childNodes.forEach(walk);
  while (out.length && out[out.length - 1] === '<br>') out.pop();
  while (out.length && out[0] === '<br>') out.shift();
  const result = cleanHtml(out.join('').replace(/<(b|i|u|sup|sub)><\/\1>/g, ''));
  return result.replace(/<[^>]*>/g, '').trim() ? result : '';
}

/** Plain text as HTML for a text box (line breaks kept). */
export function plainTextHtml(text: string): string {
  return esc(text.replace(/\r\n?/g, '\n')).replace(/\n/g, '<br>');
}
