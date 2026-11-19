// Reads where the browser actually placed every word of a text box, so the PDF
// reproduces its line breaks, alignment, bold/italic runs, sub/superscripts and
// lists exactly.

export interface TextPiece {
  text: string;
  /** poster px, relative to the poster's top-left */
  x: number;
  top: number;
  width: number;
  height: number;
  family: string;
  weight: number;
  italic: boolean;
  /** font size in px */
  size: number;
  color: string;
  underline: boolean;
  strike: boolean;
  /** list markers are positioned by their right edge */
  alignRight?: boolean;
}

export interface Frame {
  left: number;
  top: number;
  /** on-screen px per poster px (the editor's zoom) */
  scale: number;
}

export function frameOf(poster: HTMLElement, widthPx: number): Frame {
  const r = poster.getBoundingClientRect();
  return { left: r.left, top: r.top, scale: r.width / widthPx || 1 };
}

export function firstFamily(fontFamily: string) {
  return (fontFamily.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '') || 'sans-serif';
}

function decorations(el: Element, stop: Element) {
  let underline = false;
  let strike = false;
  for (let n: Element | null = el; n; n = n.parentElement) {
    const line = getComputedStyle(n).textDecorationLine || getComputedStyle(n).textDecoration || '';
    if (line.includes('underline')) underline = true;
    if (line.includes('line-through')) strike = true;
    if (n === stop) break;
  }
  return { underline, strike };
}

interface StyleInfo {
  family: string;
  weight: number;
  italic: boolean;
  size: number;
  color: string;
  underline: boolean;
  strike: boolean;
}

function styleOf(el: Element, stop: Element): StyleInfo {
  const cs = getComputedStyle(el);
  const w = cs.fontWeight === 'bold' ? 700 : cs.fontWeight === 'normal' ? 400 : parseInt(cs.fontWeight, 10) || 400;
  return {
    family: firstFamily(cs.fontFamily),
    weight: w,
    italic: cs.fontStyle !== 'normal',
    size: parseFloat(cs.fontSize) || 16,
    color: cs.color,
    ...decorations(el, stop),
  };
}

export function extractText(body: HTMLElement, frame: Frame): TextPiece[] {
  const out: TextPiece[] = [];
  const range = document.createRange();
  const local = (r: DOMRect) => ({
    x: (r.left - frame.left) / frame.scale,
    top: (r.top - frame.top) / frame.scale,
    width: r.width / frame.scale,
    height: r.height / frame.scale,
  });
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  const styles = new Map<Element, StyleInfo>();
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const parent = node.parentElement;
    if (!parent || parent.closest('.ui-only')) continue;
    let st = styles.get(parent);
    if (!st) styles.set(parent, (st = styleOf(parent, body)));
    const data = node.data;
    for (const m of data.matchAll(/\S+/g)) {
      const start = m.index!;
      const end = start + m[0].length;
      range.setStart(node, start);
      range.setEnd(node, end);
      const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 || r.height > 0);
      if (!rects.length) continue;
      if (rects.length === 1) {
        out.push({ text: m[0], ...local(rects[0]), ...st });
        continue;
      }
      // The word wraps across lines: place it character by character.
      let cur: TextPiece | null = null;
      for (let i = start; i < end; ) {
        const cp = data.codePointAt(i)!;
        const len = cp > 0xffff ? 2 : 1;
        range.setStart(node, i);
        range.setEnd(node, i + len);
        const r = range.getClientRects()[0];
        i += len;
        if (!r) continue;
        const box = local(r);
        if (cur && Math.abs(box.top - cur.top) < cur.height / 2) {
          cur.text += String.fromCodePoint(cp);
          cur.width = box.x + box.width - cur.x;
        } else {
          cur = { text: String.fromCodePoint(cp), ...box, ...st };
          out.push(cur);
        }
      }
    }
  }
  range.detach?.();
  out.push(...listMarkers(body, out, frame));
  return out;
}

const MARKERS: Record<string, string> = { disc: '•', circle: '◦', square: '▪' };

function listMarkers(body: HTMLElement, pieces: TextPiece[], frame: Frame): TextPiece[] {
  const out: TextPiece[] = [];
  body.querySelectorAll('li').forEach((li) => {
    const cs = getComputedStyle(li);
    if (cs.listStylePosition === 'inside') return;
    const type = cs.listStyleType;
    let marker = MARKERS[type];
    if (!marker && /decimal/.test(type)) {
      const list = li.parentElement;
      const start = list instanceof HTMLOListElement ? list.start : 1;
      marker = `${start + Array.from(list?.children ?? []).filter((c) => c.tagName === 'LI').indexOf(li)}.`;
    }
    if (!marker) return;
    const first = firstLineBox(li, frame);
    if (!first) return;
    const r = li.getBoundingClientRect();
    const st = styleOf(li, body);
    // Match the first text piece on that line for the baseline.
    const ref = pieces.find((p) => Math.abs(p.top - first.top) < 1 && p.x >= (r.left - frame.left) / frame.scale - 1);
    out.push({
      text: marker + ' ',
      x: (r.left - frame.left) / frame.scale,
      top: ref?.top ?? first.top,
      height: ref?.height ?? first.height,
      width: 0,
      ...st,
      underline: false,
      strike: false,
      alignRight: true,
    });
  });
  return out;
}

function firstLineBox(li: Element, frame: Frame) {
  const walker = document.createTreeWalker(li, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    if (!n.data.trim()) continue;
    range.selectNodeContents(n);
    const r = range.getClientRects()[0];
    if (r) return { top: (r.top - frame.top) / frame.scale, height: r.height / frame.scale };
  }
  return null;
}
