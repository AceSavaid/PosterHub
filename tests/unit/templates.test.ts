import { describe, expect, it } from 'vitest';
import { PALETTES, TEMPLATES, buildTemplate, createPoster, sizeFor } from '../../src/model';
import { isStarterText } from '../../src/templates';
import type { Orientation, PosterElement } from '../../src/types';

const base = { name: 'Test', palette: PALETTES[0], headingFont: 'Montserrat', bodyFont: 'Open Sans' };
const make = (template: (typeof TEMPLATES)[number]['id'], width: number, height: number, columns: number) =>
  createPoster({ ...base, width, height, sizePreset: 'custom', columns, template });

// Content that must never sit on top of other content. Shapes are backgrounds and may sit behind anything.
const isContent = (e: PosterElement) => e.type !== 'shape';
const overlaps = (a: PosterElement, b: PosterElement) => {
  const eps = 0.01;
  return a.x < b.x + b.w - eps && b.x < a.x + a.w - eps && a.y < b.y + b.h - eps && b.y < a.y + a.h - eps;
};

const sizes: { label: string; width: number; height: number }[] = [
  ...(['portrait', 'landscape'] as Orientation[]).flatMap((o) => [
    { label: `A0 ${o}`, ...sizeFor('A0', o) },
    { label: `A4 ${o}`, ...sizeFor('A4', o) },
    { label: `36x48in ${o}`, ...sizeFor('36x48', o) },
  ]),
  { label: 'wide banner 2000x600', width: 2000, height: 600 },
  { label: 'tall 600x1800', width: 600, height: 1800 },
];

describe('template gallery', () => {
  it('has a good range of distinct, named templates with a blank option', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(10);
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
    expect(new Set(TEMPLATES.map((t) => t.label)).size).toBe(TEMPLATES.length);
    expect(TEMPLATES.some((t) => t.id === 'blank')).toBe(true);
    for (const t of TEMPLATES) expect(t.description.length).toBeGreaterThan(20);
  });

  it('covers the header, section and footer styles', () => {
    const headers = new Set(TEMPLATES.map((t) => t.header));
    for (const h of ['band', 'logos', 'minimal', 'split', 'sidebar']) expect(headers).toContain(h);
    const sections = new Set(TEMPLATES.map((t) => t.sections));
    for (const s of ['plain', 'boxed', 'bars', 'numbered', 'framed']) expect(sections).toContain(s);
    const footers = new Set(TEMPLATES.map((t) => t.footer));
    for (const f of ['references', 'logos', 'qr']) expect(footers).toContain(f);
  });

  it('gives each template a different arrangement', () => {
    const shape = (id: (typeof TEMPLATES)[number]['id']) =>
      make(id, 841, 1189, 3)
        .elements.map((e) => `${e.type}:${Math.round(e.x)},${Math.round(e.y)},${Math.round(e.w)},${Math.round(e.h)}:${e.fill ?? ''}`)
        .join('|');
    const all = TEMPLATES.map((t) => shape(t.id));
    expect(new Set(all).size).toBe(TEMPLATES.length);
  });
});

describe('every template on every size, orientation and column count', () => {
  for (const t of TEMPLATES.filter((t) => t.id !== 'blank')) {
    for (const sz of sizes) {
      for (const cols of [1, 2, 3, 4, 5, 6]) {
        it(`${t.id} / ${sz.label} / ${cols} col`, () => {
          const p = make(t.id, sz.width, sz.height, cols);
          expect(p.elements.length).toBeGreaterThan(3);
          for (const e of p.elements) {
            expect(e.w, `${e.type} width`).toBeGreaterThan(0);
            expect(e.h, `${e.type} height`).toBeGreaterThan(0);
            expect(e.x).toBeGreaterThanOrEqual(-0.01);
            expect(e.y).toBeGreaterThanOrEqual(-0.01);
            expect(e.x + e.w).toBeLessThanOrEqual(p.width + 0.01);
            expect(e.y + e.h).toBeLessThanOrEqual(p.height + 0.01);
          }
          expect(p.elements.filter((e) => e.type === 'title')).toHaveLength(1);
          expect(p.elements.filter((e) => e.type === 'subtitle')).toHaveLength(1);
          expect(p.elements.some((e) => e.type === 'heading')).toBe(true);
          expect(new Set(p.elements.map((e) => e.id)).size).toBe(p.elements.length);

          const content = p.elements.filter(isContent);
          for (let i = 0; i < content.length; i++)
            for (let j = i + 1; j < content.length; j++) {
              const a = content[i];
              const b = content[j];
              expect(overlaps(a, b), `${a.type} "${a.html ?? a.placeholder}" overlaps ${b.type} "${b.html ?? b.placeholder}"`).toBe(false);
            }
        });
      }
    }
  }
});

describe('template details', () => {
  const A0 = sizeFor('A0', 'portrait');
  const placeholders = (id: (typeof TEMPLATES)[number]['id']) =>
    make(id, A0.width, A0.height, 3).elements.filter((e) => e.type === 'image').map((e) => e.placeholder);

  it('labels logo and QR code areas so people know what goes there', () => {
    expect(placeholders('boxed').filter((p) => p === 'Logo')).toHaveLength(2);
    expect(placeholders('bars').filter((p) => p === 'Logo').length).toBeGreaterThanOrEqual(2);
    for (const id of ['minimal', 'sidebar', 'takeaway', 'showcase', 'framed'] as const) expect(placeholders(id)).toContain('QR code');
    expect(placeholders('classic')).toContain('Figure');
  });

  it('puts the sidebar in the first column and the body in the rest', () => {
    const p = make('sidebar', A0.width, A0.height, 3);
    const title = p.elements.find((e) => e.type === 'title')!;
    expect(title.x).toBeCloseTo(p.margin);
    expect(title.w).toBeLessThan(p.width / 2);
    const headings = p.elements.filter((e) => e.type === 'heading' && e.html !== 'At a glance');
    expect(headings.every((h) => h.x > title.x + title.w)).toBe(true);
  });

  it('falls back to a top header for a one-column sidebar poster', () => {
    const p = make('sidebar', A0.width, A0.height, 1);
    const title = p.elements.find((e) => e.type === 'title')!;
    expect(title.w).toBeGreaterThan(p.width * 0.8);
  });

  it('spans the middle two columns for the takeaway on an even column count', () => {
    const p = make('takeaway', 1189, 841, 4);
    const statement = p.elements.find((e) => e.type === 'text' && e.html?.includes('main finding'))!;
    expect(statement.w).toBeGreaterThan(p.width * 0.4);
    expect(statement.x + statement.w / 2).toBeCloseTo(p.width / 2, 0);
  });

  it('numbers sections in reading order', () => {
    const p = make('minimal', A0.width, A0.height, 3);
    const numbers = p.elements.filter((e) => e.type === 'heading' && /^\d+$/.test(e.html ?? '')).map((e) => +e.html!);
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
    expect(numbers.length).toBeGreaterThanOrEqual(3);
  });

  it('uses palette colours so switching palettes restyles the template', () => {
    for (const t of TEMPLATES) {
      const fills = make(t.id, A0.width, A0.height, 3).elements.filter((e) => e.type === 'shape' && e.fill).map((e) => e.fill!);
      expect(fills.every((f) => f.startsWith('@'))).toBe(true);
    }
  });

  it('can rebuild an existing poster with a new template', () => {
    const p = make('classic', A0.width, A0.height, 3);
    const els = buildTemplate('showcase', p);
    expect(els.some((e) => e.placeholder === 'QR code')).toBe(true);
    expect(buildTemplate('blank', p)).toEqual([]);
  });
});

describe('section names', () => {
  it('never falls back to generic names on common layouts', () => {
    for (const t of TEMPLATES) {
      for (const o of ['portrait', 'landscape'] as Orientation[]) {
        for (const cols of [2, 3, 4]) {
          const p = make(t.id, sizeFor('A0', o).width, sizeFor('A0', o).height, cols);
          const names = p.elements.filter((e) => e.type === 'heading').map((e) => e.html ?? '');
          expect(names.filter((n) => /^Section \d/.test(n)), `${t.id} ${o} ${cols}`).toEqual([]);
          const real = names.filter((n) => !/^\d+$/.test(n));
          expect(new Set(real).size, `${t.id} ${o} ${cols} duplicates`).toBe(real.length);
        }
      }
    }
  });
});

describe('research-field layouts', () => {
  const A0 = sizeFor('A0', 'portrait');
  const fields = TEMPLATES.filter((t) => t.field);
  const headings = (id: (typeof TEMPLATES)[number]['id'], cols = 3, w = A0.width, h = A0.height) =>
    make(id, w, h, cols).elements.filter((e) => e.role === 'heading').map((e) => e.html ?? '');

  it('offers clinical, lab, computing and humanities layouts', () => {
    expect(fields.map((t) => t.id).sort()).toEqual(['clinical', 'computing', 'humanities', 'lab']);
    for (const t of fields) expect(t.field).toBe(t.id);
  });

  it('names sections the way each field does', () => {
    expect(headings('clinical')).toEqual(expect.arrayContaining(['Case Summary', 'Investigations', 'Learning Points']));
    expect(headings('lab')).toEqual(expect.arrayContaining(['Methods', 'Results']));
    expect(headings('computing')).toEqual(expect.arrayContaining(['Problem', 'Approach', 'Results']));
    expect(headings('humanities')).toEqual(expect.arrayContaining(['Question', 'Argument', 'Sources']));
    expect(headings('humanities')).not.toContain('Methods');
  });

  it('keeps section names short enough to sit on one line in narrow columns', () => {
    for (const t of fields)
      for (const cols of [1, 2, 3, 4, 5, 6])
        for (const name of headings(t.id, cols, 1189, 841)) expect(name.length, `${t.id} "${name}"`).toBeLessThanOrEqual(16);
  });

  it('writes example text for the field instead of generic filler', () => {
    for (const t of fields) {
      const bodies = make(t.id, A0.width, A0.height, 3).elements.filter((e) => e.role === 'body').map((e) => e.html ?? '');
      expect(bodies.length, t.id).toBeGreaterThan(2);
      expect(bodies.filter((b) => b.startsWith('Replace this text')), t.id).toEqual([]);
      for (const b of bodies) expect(b.length, `${t.id}: ${b}`).toBeLessThanOrEqual(150);
    }
  });

  it('gives every element a role so Switch layout can carry content over', () => {
    for (const t of fields)
      for (const cols of [1, 3, 5]) for (const e of make(t.id, A0.width, A0.height, cols).elements) expect(e.role, `${t.id} ${e.type} ${e.html ?? e.placeholder}`).toBeTruthy();
  });

  it('groups each section heading with its text and figures', () => {
    for (const t of fields) {
      const els = make(t.id, A0.width, A0.height, 3).elements;
      for (const h of els.filter((e) => e.role === 'heading')) {
        expect(h.group, `${t.id} ${h.html}`).toBeTruthy();
        expect(els.some((e) => e.group === h.group && (e.role === 'body' || e.role === 'caption')), `${t.id} ${h.html} has text`).toBe(true);
      }
    }
  });

  it('puts the clinical learning points across the full width at the bottom', () => {
    const p = make('clinical', A0.width, A0.height, 3);
    const lp = p.elements.find((e) => e.html === 'Learning Points')!;
    const others = p.elements.filter((e) => e.role === 'heading' && e !== lp);
    expect(others.every((h) => h.y < lp.y)).toBe(true);
    expect(lp.w).toBeGreaterThan(p.width * 0.8);
  });

  it('puts the lab methods band with a diagram above the other sections', () => {
    const p = make('lab', A0.width, A0.height, 3);
    const m = p.elements.find((e) => e.html === 'Methods')!;
    expect(m.w).toBeGreaterThan(p.width * 0.8);
    expect(p.elements.filter((e) => e.role === 'heading' && e !== m).every((h) => h.y > m.y)).toBe(true);
    expect(p.elements.some((e) => e.group === m.group && e.role === 'figure')).toBe(true);
  });

  it('gives computing results a grid of figures and tables on the right', () => {
    const p = make('computing', A0.width, A0.height, 3);
    const r = p.elements.find((e) => e.html === 'Results')!;
    expect(r.x).toBeGreaterThan(p.width / 3);
    const figs = p.elements.filter((e) => e.group === r.group && e.role === 'figure');
    expect(figs).toHaveLength(4);
    const caps = p.elements.filter((e) => e.group === r.group && e.role === 'caption').map((e) => e.html);
    expect(caps.some((c) => c?.includes('Table'))).toBe(true);
    // One column: no room for a side block, so results flow like the other sections.
    expect(make('computing', A0.width, A0.height, 1).elements.some((e) => e.html === 'Results')).toBe(true);
  });

  it('opens the humanities layout with a pull quote that carries over as the key finding', () => {
    const p = make('humanities', A0.width, A0.height, 3);
    const q = p.elements.find((e) => e.role === 'keyFinding')!;
    expect(q.html).toContain('“');
    const title = p.elements.find((e) => e.role === 'title')!;
    expect(q.y).toBeGreaterThan(title.y);
    expect(p.elements.filter((e) => e.role === 'heading').every((h) => h.y > q.y)).toBe(true);
  });

  it('treats the new example text as starter text', () => {
    for (const t of fields)
      for (const e of make(t.id, A0.width, A0.height, 3).elements) if (e.html) expect(isStarterText(e.html), e.html).toBe(true);
  });
});
