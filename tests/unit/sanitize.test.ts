import { describe, expect, it } from 'vitest';
import { cleanHtml, htmlToText, safeFontDataUrl, safeImageUrl, sanitizePoster } from '../../src/lib/sanitize';
import { readPosterFile } from '../../src/lib/storage';
import { createPoster, PALETTES, sizeFor } from '../../src/model';
import { TEMPLATES } from '../../src/templates';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

describe('cleaning text-box HTML', () => {
  it('keeps the formatting the editor makes', () => {
    const html =
      '<div style="text-align: center;">Mean <b>time</b> <i>p</i> &lt; 0.05, H<sub>2</sub>O x<sup>2</sup> <u>u</u> <span style="font-size: 12pt; color: rgb(255, 0, 0);">red</span></div>' +
      '<ul><li>First</li><li>Second</li></ul><br>' +
      '<table style="width:100%"><colgroup><col style="width: 50%;"></colgroup><tbody><tr><td colspan="2" style="padding: 1mm;">cell</td></tr></tbody></table>';
    expect(cleanHtml(html)).toBe(html);
  });

  it('keeps citation markers and reference entries', () => {
    const html = 'Shown before <span class="cite" data-cite="id1,id2" contenteditable="false">[1, 2]</span>.<div class="ref-entry">Smith J. (2020) Title.</div>';
    expect(cleanHtml(html)).toBe(html);
  });

  it('removes scripts, event handlers and anything that loads from the web', () => {
    const evil = [
      '<img src=x onerror="alert(1)">',
      '<script>alert(1)</script>',
      '<svg onload="alert(1)"></svg>',
      '<iframe src="https://evil.example"></iframe>',
      '<a href="javascript:alert(1)">link</a>',
      '<div onclick="alert(1)" style="background:url(https://evil.example/x.png)">hi</div>',
      '<style>@import "https://evil.example/x.css";</style>',
      '<object data="x"></object><embed src="x"><link rel="stylesheet" href="https://evil.example">',
      '<math><mi xlink:href="javascript:alert(1)">m</mi></math>',
    ].join('');
    const out = cleanHtml(evil);
    expect(out).not.toMatch(/<(img|script|svg|iframe|a|style|object|embed|link|math)\b/i);
    expect(out).not.toMatch(/on\w+=|javascript:|url\(|@import|evil\.example/i);
    expect(out).toContain('hi'); // text survives
    expect(out).toContain('link');
  });

  it('keeps every template intact', () => {
    for (const t of TEMPLATES) {
      for (const landscape of [false, true]) {
        const p = createPoster({ name: 't', ...sizeFor('A0', landscape ? 'landscape' : 'portrait'), sizePreset: 'A0', columns: landscape ? 4 : 3, palette: PALETTES[0], headingFont: 'Lora', bodyFont: 'Inter', template: t.id });
        for (const el of p.elements) if (el.html) expect(cleanHtml(el.html), `${t.id} ${el.html}`).toBe(el.html);
      }
    }
  });

  it('reads plain text without running anything', () => {
    (globalThis as Record<string, unknown>).__ran = false;
    expect(htmlToText('a<b>b</b><br>c<img src=x onerror="globalThis.__ran=true">')).toBe('ab\nc');
    expect((globalThis as Record<string, unknown>).__ran).toBe(false);
  });
});

describe('cleaning a whole poster from a file', () => {
  const evilPoster = () => {
    const p = createPoster({ name: 'Evil', ...sizeFor('A0', 'portrait'), sizePreset: 'A0', columns: 3, palette: PALETTES[0], headingFont: 'Lora', bodyFont: 'Inter', template: TEMPLATES[0].id });
    p.elements.find((e) => e.html)!.html = '<b>Title</b><img src=x onerror="alert(1)">';
    p.elements.push({ id: 'img', type: 'image', x: 0, y: 0, w: 10, h: 10, src: 'https://tracker.example/pixel.png' } as never);
    p.elements.push({ id: 'img2', type: 'image', x: 0, y: 0, w: 10, h: 10, src: PNG } as never);
    p.customFonts = [
      { family: 'Good', dataUrl: 'data:font/ttf;base64,AAEAAAAL' },
      { family: 'Bad"}body{x', dataUrl: 'data:font/ttf;base64,AA); } body { background: url(https://evil.example)' },
    ];
    p.backgroundImage = 'https://evil.example/bg.png';
    p.thumbnail = 'javascript:alert(1)';
    return p;
  };

  it('strips the dangerous parts and keeps the rest', () => {
    const p = sanitizePoster(evilPoster());
    expect(p.elements.find((e) => e.html?.includes('Title'))!.html).toBe('<b>Title</b>');
    expect(p.elements.find((e) => e.id === 'img')!.src).toBeUndefined();
    expect(p.elements.find((e) => e.id === 'img2')!.src).toBe(PNG);
    expect(p.customFonts).toEqual([{ family: 'Good', dataUrl: 'data:font/ttf;base64,AAEAAAAL' }]);
    expect(p.backgroundImage).toBeUndefined();
    expect(p.thumbnail).toBeUndefined();
  });

  it('is applied when a project file is opened', async () => {
    const file = new File([JSON.stringify(evilPoster())], 'evil.poster.json');
    const p = await readPosterFile(file);
    expect(JSON.stringify(p)).not.toMatch(/onerror|evil\.example|tracker\.example|javascript:/);
  });

  it('only accepts embedded images and font files', () => {
    expect(safeImageUrl(PNG)).toBe(PNG);
    expect(safeImageUrl('blob:http://x/1')).toBeDefined();
    expect(safeImageUrl('https://x/y.png')).toBeUndefined();
    expect(safeImageUrl('data:text/html,<script>')).toBeUndefined();
    expect(safeFontDataUrl('data:application/octet-stream;base64,AAAA')).toBeDefined();
    expect(safeFontDataUrl('data:font/woff2;base64,AA")')).toBeUndefined();
  });
});
