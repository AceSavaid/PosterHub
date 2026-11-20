import { describe, expect, it } from 'vitest';
import { DULL_THRESHOLD, dullColorIssues, hexToLab, labToHex, posterColors, printsDull, replaceColor } from '../../src/lib/printColor';
import { checkPoster } from '../../src/lib/checks';
import { PALETTES, PALETTE_ROLES, createPoster, makeElement, sizeFor } from '../../src/model';
import type { Poster } from '../../src/types';

function poster(palette = PALETTES[0]): Poster {
  const p = createPoster({ name: 't', ...sizeFor('A1', 'portrait'), sizePreset: 'A1', columns: 3, palette, headingFont: 'Inter', bodyFont: 'Inter', template: 'blank' });
  p.elements = [];
  return p;
}

describe('colour conversion', () => {
  it('converts sRGB to CIELAB', () => {
    expect(hexToLab('#ffffff')!.map((v) => Math.round(v) + 0)).toEqual([100, 0, 0]);
    expect(hexToLab('#000000')!.map((v) => Math.round(v) + 0)).toEqual([0, 0, 0]);
    expect(hexToLab('#ff0000')!.map(Math.round)).toEqual([53, 80, 67]);
    expect(hexToLab('nope')).toBeNull();
  });
  it('round-trips through CIELAB', () => {
    for (const c of ['#1f4e79', '#e67e22', '#00ff00', '#7651b3', '#ffffff', '#123456']) expect(labToHex(hexToLab(c)!)).toBe(c);
  });
});

describe('colours that print dull', () => {
  it('flags vivid screen colours that inks cannot reach', () => {
    for (const c of ['#0000ff', '#00ff00', '#ff00ff', '#00ffff', '#39ff14', '#ff0000']) {
      const r = printsDull(c);
      expect(r, c).not.toBeNull();
      expect(r!.excess).toBeGreaterThanOrEqual(DULL_THRESHOLD);
    }
  });

  it('suggests a printable colour of the same family', () => {
    const r = printsDull('#0000ff')!;
    expect(printsDull(r.suggestion)).toBeNull();
    const [, a, b] = hexToLab(r.suggestion)!;
    expect(b).toBeLessThan(-20); // still blue
    expect(a).toBeGreaterThan(0);
    const g = hexToLab(printsDull('#00ff00')!.suggestion)!;
    expect(g[1]).toBeLessThan(-30); // still green
  });

  it('leaves greys, black, white and muted colours alone', () => {
    for (const c of ['#000000', '#ffffff', '#808080', '#1f4e79', '#e67e22', '#ffff00', '#f4b183', '#2e75b6']) expect(printsDull(c), c).toBeNull();
  });

  it('every built-in palette prints as it looks', () => {
    for (const pal of PALETTES) for (const r of PALETTE_ROLES) expect(printsDull(pal[r]), `${pal.name} ${r}`).toBeNull();
  });
});

describe('poster colour check', () => {
  it('collects colours with the items that use them', () => {
    const p = poster();
    const band = makeElement('shape', p, { fill: '#0000FF' });
    const text = makeElement('text', p, { html: 'Hi <span style="color: rgb(0, 255, 0)">there</span>' });
    p.elements = [band, text];
    const uses = posterColors(p);
    expect(uses.find((u) => u.hex === '#0000ff')?.elementIds).toEqual([band.id]);
    expect(uses.find((u) => u.hex === '#00ff00')?.elementIds).toEqual([text.id]);
    expect(uses.find((u) => u.hex === PALETTES[0].background)?.roles).toContain('background');
  });

  it('reports each dull colour once, with a fix, in the poster check', () => {
    const p = poster();
    p.elements = [makeElement('shape', p, { fill: '#0000ff' }), makeElement('shape', p, { fill: '#0000ff' })];
    const issues = dullColorIssues(p);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ id: 'cmyk-0000ff', severity: 'warning', fix: { from: '#0000ff' } });
    expect(issues[0].detail).toContain('2 items');
    expect(checkPoster(p).some((i) => i.id === 'cmyk-0000ff')).toBe(true);
  });

  it('names the palette colour when that is the source', () => {
    const p = poster({ ...PALETTES[0], primary: '#ff00ff' });
    p.elements = [makeElement('shape', p, { fill: '@primary' })];
    expect(dullColorIssues(p)[0].detail).toContain("palette's Main colour");
  });

  it('the fix swaps the colour everywhere, including the palette and inline text colours', () => {
    const p = poster({ ...PALETTES[0], accent: '#0000ff' });
    p.elements = [
      makeElement('shape', p, { fill: '#0000FF', borderColor: '#00f', borderWidth: 1 }),
      makeElement('text', p, { html: 'a <font color="#0000ff">b</font> <span style="color: #ff0000">c</span>' }),
    ];
    const to = printsDull('#0000ff')!.suggestion;
    const fixed = replaceColor(p, '#0000ff', to);
    expect(fixed.palette.accent).toBe(to);
    expect(fixed.elements[0].fill).toBe(to);
    expect(fixed.elements[0].borderColor).toBe(to);
    expect(fixed.elements[1].html).toBe(`a <font color="${to}">b</font> <span style="color: #ff0000">c</span>`);
    expect(dullColorIssues(fixed).some((i) => i.id === 'cmyk-0000ff')).toBe(false);
    expect(p.palette.accent).toBe('#0000ff'); // original untouched
  });
});
