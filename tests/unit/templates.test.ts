import { describe, expect, it } from 'vitest';
import { PALETTES, TEMPLATES, buildTemplate, createPoster, sizeFor } from '../../src/model';
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
