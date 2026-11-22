import { describe, expect, it } from 'vitest';
import { PALETTES, TEMPLATES, createPoster, makeElement, sizeFor } from '../../src/model';
import { applyLayout, describeReport, extractContent, sectionKey } from '../../src/lib/relayout';
import type { Poster, PosterElement } from '../../src/types';
import type { TemplateId } from '../../src/templates';

const make = (template: TemplateId, columns = 3, landscape = false): Poster =>
  createPoster({ name: 'T', ...sizeFor('A0', landscape ? 'landscape' : 'portrait'), sizePreset: 'A0', columns, palette: PALETTES[0], headingFont: 'Montserrat', bodyFont: 'Open Sans', template });

const heading = (p: Poster, name: string) => p.elements.find((e) => e.type === 'heading' && e.html === name)!;
const bodyOf = (els: PosterElement[], name: string) => {
  const h = els.find((e) => e.role === 'heading' && e.html === name);
  return h && els.find((e) => e.group === h.group && (e.role === 'body' || e.role === 'caption'));
};
const figureOf = (els: PosterElement[], name: string) => {
  const h = els.find((e) => e.role === 'heading' && e.html === name);
  return h && els.find((e) => e.group === h.group && (e.type === 'chart' || e.type === 'image'));
};
const allHtml = (els: PosterElement[]) => els.map((e) => e.html ?? '').join('\n');

/** A poster where the person has filled in their content. */
function filled(template: TemplateId = 'classic') {
  const p = make(template);
  p.elements.find((e) => e.type === 'title')!.html = 'Sleep and memory in older adults';
  p.elements.find((e) => e.type === 'subtitle')!.html = 'A. Researcher, B. Student · Dept of Psychology';
  const set = (name: string, html: string) => {
    const h = heading(p, name);
    p.elements.find((e) => e.group === h.group && e.role === 'body')!.html = html;
  };
  set('Introduction', 'Sleep consolidates memory.');
  set('Methods', '42 participants slept in the lab.');
  set('Results', 'Recall improved by 18%.');
  set('Conclusions', 'Naps help.');
  const rh = heading(p, 'Results');
  const fig = p.elements.find((e) => e.group === rh.group && e.role === 'figure')!;
  fig.src = 'data:image/png;base64,RESULTS';
  p.elements.find((e) => e.role === 'references')!.html = '<b>References</b> Smith (2024). Sleep. <i>Nature</i>.';
  return p;
}

describe('section names', () => {
  it('matches common variations of section names', () => {
    expect(sectionKey('<b>Conclusion</b>')).toBe('conclusions');
    expect(sectionKey('Materials and Methods')).toBe('methods');
    expect(sectionKey('2. Results')).toBe('results');
    expect(sectionKey('Acknowledgments')).toBe('acknowledgements');
    expect(sectionKey('Key Figure')).toBe('results');
    expect(sectionKey('Our weird section')).toBe('our weird section');
  });
});

describe('switching layouts keeps the person’s content', () => {
  for (const t of TEMPLATES.filter((t) => t.id !== 'blank' && t.id !== 'classic')) {
    it(`classic → ${t.id}`, () => {
      const p = filled();
      const { elements } = applyLayout(p, t.id);
      const html = allHtml(elements);
      for (const text of ['Sleep and memory in older adults', 'A. Researcher', 'Sleep consolidates memory.', '42 participants', 'Recall improved by 18%.', 'Naps help.', 'Smith (2024)'])
        expect(html, text).toContain(text);
      expect(elements.filter((e) => e.src === 'data:image/png;base64,RESULTS')).toHaveLength(1);
      expect(elements.find((e) => e.type === 'title')!.html).toBe('Sleep and memory in older adults');
      expect(new Set(elements.map((e) => e.id)).size).toBe(elements.length);
    });
  }

  it('puts text under the section with the same name', () => {
    const { elements } = applyLayout(filled(), 'boxed');
    expect(bodyOf(elements, 'Methods')!.html).toBe('42 participants slept in the lab.');
    expect(bodyOf(elements, 'Results')!.html).toBe('Recall improved by 18%.');
    expect(figureOf(elements, 'Results')!.src).toBe('data:image/png;base64,RESULTS');
  });

  it('fits the new figure spot and takes the new layout’s position', () => {
    const { elements } = applyLayout(filled(), 'showcase');
    const fig = elements.find((e) => e.src === 'data:image/png;base64,RESULTS')!;
    const wide = elements.filter((e) => e.role === 'figure').sort((a, b) => b.w - a.w)[0];
    expect(fig).toBe(wide); // the big results figure across the poster
  });

  it('keeps the person’s own heading names and moves them with their text', () => {
    const p = filled();
    heading(p, 'Discussion').html = 'What it means';
    const h = heading(p, 'What it means');
    p.elements.find((e) => e.group === h.group && e.role === 'body')!.html = 'Implications for ageing.';
    const { elements } = applyLayout(p, 'bars');
    expect(bodyOf(elements, 'What it means')!.html).toBe('Implications for ageing.');
  });

  it('round-trips through several layouts without losing anything', () => {
    let p = filled();
    for (const t of ['sidebar', 'takeaway', 'minimal', 'central', 'framed', 'classic'] as TemplateId[]) {
      p = { ...p, elements: applyLayout(p, t).elements };
    }
    const html = allHtml(p.elements);
    for (const text of ['Sleep consolidates memory.', '42 participants', 'Recall improved by 18%.', 'Naps help.', 'Smith (2024)']) expect(html).toContain(text);
    expect(p.elements.filter((e) => e.src === 'data:image/png;base64,RESULTS')).toHaveLength(1);
  });

  it('appends sections that have no free spot to the last section instead of dropping them', () => {
    const p = make('classic', 4); // 8 sections
    p.elements.filter((e) => e.role === 'body').forEach((b, i) => (b.html = `Body ${i + 1}`));
    const { elements, report } = applyLayout(p, 'showcase');
    const html = allHtml(elements);
    for (let i = 1; i <= 8; i++) expect(html).toContain(`Body ${i}`);
    expect(report.sections).toBe(8);
  });

  it('moves logos and QR codes into the new layout’s logo and QR spots', () => {
    const p = make('boxed');
    const logos = p.elements.filter((e) => e.role === 'logo');
    logos[0].src = 'data:image/png;base64,UNI';
    logos[1].src = 'data:image/png;base64,LAB';
    const { elements } = applyLayout(p, 'bars');
    const footerLogos = elements.filter((e) => e.role === 'logo');
    expect(footerLogos.map((e) => e.src)).toEqual(['data:image/png;base64,UNI', 'data:image/png;base64,LAB', undefined]);

    const q = make('minimal');
    Object.assign(q.elements.find((e) => e.role === 'qr')!, { src: 'data:image/gif;base64,QR', qr: 'https://doi.org/10.1/x' });
    const out = applyLayout(q, 'sidebar').elements.find((e) => e.qr);
    expect(out?.role).toBe('qr');
    expect(out?.src).toBe('data:image/gif;base64,QR');
  });

  it('carries graphs, the key finding and the summary', () => {
    const p = make('banner');
    p.elements.find((e) => e.role === 'keyFinding')!.html = 'Naps boost recall by 18%.';
    const rh = heading(p, 'Results');
    const fig = p.elements.find((e) => e.group === rh.group && e.role === 'figure')!;
    const chart = makeElement('chart', p, { x: fig.x, y: fig.y, w: fig.w, h: fig.h, group: fig.group, chart: { kind: 'bar', title: 'Recall', columns: ['g', 'v'], rows: [['a', '1']], xColumn: 0, yColumns: [1], rowStart: 0, rowEnd: 0, xLabel: '', yLabel: '', showLegend: false, fontSize: 20 } });
    p.elements[p.elements.indexOf(fig)] = chart;
    const { elements } = applyLayout(p, 'takeaway');
    expect(elements.find((e) => e.role === 'keyFinding')!.html).toBe('Naps boost recall by 18%.');
    expect(elements.filter((e) => e.type === 'chart')).toHaveLength(1);

    // takeaway → sidebar: the statement has a summary spot to go to
    const s = applyLayout({ ...p, elements }, 'sidebar').elements;
    expect(allHtml(s)).toContain('Naps boost recall by 18%.');
  });

  it('keeps the person’s own extra boxes and drawings where they were', () => {
    const p = filled();
    const note = makeElement('text', p, { x: 10, y: 10, w: 50, h: 20, html: 'Poster #42' });
    const arrow = makeElement('shape', p, { shape: 'rect', x: 100, y: 100, w: 30, h: 5 });
    p.elements.push(note, arrow);
    const { elements, report } = applyLayout(p, 'minimal');
    // The note sits inside the header (no heading above it), so it stays put
    expect(elements.find((e) => e.html === 'Poster #42')).toMatchObject({ x: 10, y: 10 });
    expect(elements.find((e) => e.id === arrow.id)).toBeTruthy();
    expect(report.keptInPlace).toBeGreaterThanOrEqual(2);
  });

  it('does not copy untouched starter text, so the new layout keeps its own wording', () => {
    const p = make('classic');
    const { elements, report } = applyLayout(p, 'sidebar');
    expect(report).toEqual({ sections: 0, figures: 0, keptInPlace: 0 });
    expect(elements.find((e) => e.role === 'summary')!.html).toMatch(/^Summarise/);
    expect(describeReport(report)).toBe('Layout applied. Undo with Ctrl/⌘ Z.');
  });

  it('switching to Blank keeps everything the person made in place', () => {
    const p = filled();
    const { elements } = applyLayout(p, 'blank');
    expect(allHtml(elements)).toContain('Recall improved by 18%.');
    expect(elements.some((e) => e.src)).toBe(true);
    expect(elements.some((e) => e.role === 'decor')).toBe(false);
  });

  it('works on posters without layout roles, using position (imported or older posters)', () => {
    const p = make('classic');
    p.elements = [
      makeElement('title', p, { html: 'Imported title', y: 10 }),
      makeElement('heading', p, { html: 'Methodology', x: 30, y: 200, w: 250, h: 30 }),
      makeElement('text', p, { html: 'We did things.', x: 30, y: 240, w: 250, h: 100 }),
      makeElement('image', p, { src: 'data:image/png;base64,IMG', x: 30, y: 350, w: 250, h: 150 }),
      makeElement('heading', p, { html: 'Findings', x: 300, y: 200, w: 250, h: 30 }),
      makeElement('text', p, { html: 'It worked.', x: 300, y: 240, w: 250, h: 100 }),
    ];
    const ex = extractContent(p.elements);
    expect(ex.sections.map((s) => s.name)).toEqual(['methods', 'results']);
    expect(ex.sections[0].figures).toHaveLength(1);
    const { elements } = applyLayout(p, 'classic');
    expect(elements.find((e) => e.type === 'title')!.html).toBe('Imported title');
    expect(bodyOf(elements, 'Methodology')!.html).toBe('We did things.');
    expect(bodyOf(elements, 'Findings')!.html).toBe('It worked.');
    expect(figureOf(elements, 'Methodology')!.src).toBe('data:image/png;base64,IMG');
  });
});

describe('research-field layouts and Switch layout', () => {
  /** Fill every section of a field layout with its own text, and every figure spot with a picture. */
  function filledField(template: TemplateId) {
    const p = make(template);
    p.elements.find((e) => e.type === 'title')!.html = 'My field poster';
    const texts: string[] = [];
    for (const h of p.elements.filter((e) => e.role === 'heading')) {
      const body = p.elements.find((e) => e.group === h.group && e.role === 'body');
      if (body) {
        body.html = `Own words about ${h.html}.`;
        texts.push(body.html);
      }
    }
    const figs = p.elements.filter((e) => e.role === 'figure');
    figs.forEach((f, i) => (f.src = `data:image/png;base64,FIG${i}`));
    const quote = p.elements.find((e) => e.role === 'keyFinding');
    if (quote) {
      quote.html = '“A line from my archive.”';
      texts.push(quote.html);
    }
    return { p, texts, figures: figs.length };
  }

  for (const from of ['clinical', 'lab', 'computing', 'humanities'] as TemplateId[]) {
    for (const to of ['classic', 'sidebar', 'clinical', 'lab', 'computing', 'humanities'] as TemplateId[]) {
      if (from === to) continue;
      it(`${from} → ${to} keeps every section’s text and every picture`, () => {
        const { p, texts, figures } = filledField(from);
        const { elements } = applyLayout(p, to);
        const html = allHtml(elements);
        expect(html).toContain('My field poster');
        for (const t of texts) expect(html, t).toContain(t);
        expect(elements.filter((e) => e.src?.startsWith('data:image/png;base64,FIG'))).toHaveLength(figures);
      });
    }
  }

  it('matches field section names to their general equivalents', () => {
    expect(sectionKey('Learning Points')).toBe('conclusions');
    expect(sectionKey('Case Presentation')).toBe(sectionKey('Case Summary'));
    expect(sectionKey('Problem')).toBe('introduction');
    expect(sectionKey('Code and Data')).toBe(sectionKey('Data and Code'));
  });

  it('moves the classic Conclusions into the clinical Learning Points', () => {
    const { elements } = applyLayout(filled(), 'clinical');
    expect(bodyOf(elements, 'Learning Points')?.html).toBe('Naps help.');
  });

  it('moves the lab Methods band text into a Methods section of a general layout', () => {
    const { p } = filledField('lab');
    const { elements } = applyLayout(p, 'classic');
    expect(bodyOf(elements, 'Methods')?.html).toBe('Own words about Methods.');
  });
});
