import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import PptxGenJS from 'pptxgenjs';
import { chartSpecFromXml, importPptx, openPptx, posterFromImport } from '../../src/lib/pptxImport';
import { tableRowsFromHtml } from '../../src/lib/exporters';

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const IN = 914400; // EMU per inch
const MM = 36000; // EMU per mm

async function deck(build: (pptx: PptxGenJS) => void) {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'P', width: 20, height: 30 });
  pptx.layout = 'P';
  build(pptx);
  return new Blob([(await pptx.write({ outputType: 'arraybuffer' })) as ArrayBuffer]);
}

/** Rewrites parts of a generated deck so tests can use hand-written PowerPoint XML. */
async function patch(blob: Blob, edits: Record<string, string | ((xml: string) => string) | Uint8Array>) {
  const zip = await JSZip.loadAsync(blob);
  for (const [path, edit] of Object.entries(edits)) {
    if (typeof edit === 'function') zip.file(path, edit((await zip.file(path)?.async('string')) ?? ''));
    else zip.file(path, edit);
  }
  return zip.generateAsync({ type: 'blob' });
}

const withShapes = (shapes: string) => (xml: string) => xml.replace('</p:spTree>', shapes + '</p:spTree>');

const box = (x: number, y: number, w: number, h: number) => `<a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>`;
const sp = (inner: string, name = 'Shape') => `<p:sp><p:nvSpPr><p:cNvPr id="${Math.floor(Math.random() * 1e6)}" name="${name}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>${inner}</p:sp>`;
const ph = (type: string, idx: string, inner: string) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${Math.floor(Math.random() * 1e6)}" name="${type}"/><p:cNvSpPr/><p:nvPr><p:ph type="${type}" idx="${idx}"/></p:nvPr></p:nvSpPr>${inner}</p:sp>`;
const para = (t: string, rPr = '') => `<a:p><a:r><a:rPr lang="en-US"${rPr}/><a:t>${t}</a:t></a:r></a:p>`;

describe('choosing a slide', () => {
  it('lists every slide with its title and imports the chosen one', async () => {
    const blob = await deck((pptx) => {
      pptx.addSlide().addText('Intro slide', { x: 1, y: 1, w: 10, h: 2 });
      const s2 = pptx.addSlide();
      s2.background = { color: '102030' };
      s2.addText('Results poster', { x: 2, y: 3, w: 10, h: 2, color: 'FFFFFF' });
      pptx.addSlide().addText('Third', { x: 1, y: 1, w: 10, h: 2 });
    });
    const d = await openPptx(blob);
    expect(d.slideCount).toBe(3);
    expect(d.pages.map((p) => p.label)).toEqual(['Slide 1', 'Slide 2', 'Slide 3']);
    expect(d.pages[1].title).toBe('Results poster');
    expect(d.pages.every((p) => p.kind === 'slide')).toBe(true);

    const r = await d.importPage(1);
    expect(r.poster.palette.background).toBe('#102030');
    expect(r.poster.elements.some((e) => e.html?.includes('Results poster'))).toBe(true);
    expect(r.poster.elements.some((e) => e.html?.includes('Intro slide'))).toBe(false);

    // importPptx keeps working with an index, and clamps out-of-range values.
    const last = await importPptx(blob, 99);
    expect(last.poster.elements.some((e) => e.html?.includes('Third'))).toBe(true);
  });

  it('offers layouts when a template has no slides (.potx)', async () => {
    let blob = await deck((pptx) => pptx.addSlide());
    const layout2 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout ${NS}><p:cSld name="Big Banner"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${sp(
      `<p:spPr>${box(0, 0, 20 * IN, 4 * IN)}<a:solidFill><a:srgbClr val="AA0000"/></a:solidFill></p:spPr>`,
    )}${ph('title', '', `<p:spPr>${box(IN, IN, 18 * IN, 2 * IN)}</p:spPr><p:txBody><a:bodyPr/><a:lstStyle/>${para('Click to add title')}</p:txBody>`)}${ph(
      'pic',
      '13',
      `<p:spPr>${box(IN, 10 * IN, 8 * IN, 6 * IN)}</p:spPr>`,
    )}${ph('sldNum', '12', `<p:spPr>${box(IN, 28 * IN, IN, IN)}</p:spPr><p:txBody><a:bodyPr/><a:lstStyle/>${para('‹#›')}</p:txBody>`)}</p:spTree></p:cSld></p:sldLayout>`;
    blob = await patch(blob, {
      'ppt/presentation.xml': (x) => x.replace(/<p:sldIdLst>.*<\/p:sldIdLst>/s, ''),
      'ppt/slideLayouts/slideLayout2.xml': layout2,
      'ppt/slideLayouts/_rels/slideLayout2.xml.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`,
      'ppt/slideMasters/slideMaster1.xml': (x) => x.replace('</p:sldLayoutIdLst>', '<p:sldLayoutId id="2147483650" r:id="rId99"/></p:sldLayoutIdLst>'),
      'ppt/slideMasters/_rels/slideMaster1.xml.rels': (x) =>
        x.replace('</Relationships>', '<Relationship Id="rId99" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout2.xml"/></Relationships>'),
    });
    const d = await openPptx(blob);
    expect(d.slideCount).toBe(0);
    expect(d.pages.map((p) => [p.kind, p.label])).toEqual([
      ['layout', 'DEFAULT'],
      ['layout', 'Big Banner'],
    ]);
    const r = await d.importPage(1);
    const els = r.poster.elements;
    expect(els.find((e) => e.type === 'shape')?.fill).toBe('#aa0000');
    expect(els.find((e) => e.type === 'title')?.html).toContain('Click to add title');
    // Empty picture placeholders become image frames the user can fill in.
    const frame = els.find((e) => e.type === 'image');
    expect(frame).toBeTruthy();
    expect(frame!.src).toBeUndefined();
    expect(frame!.x).toBeCloseTo(25.4, 1);
    // Slide numbers, dates and footers are left out.
    expect(els.some((e) => e.html?.includes('‹#›'))).toBe(false);
  });

  it('builds a complete poster from an import', async () => {
    const r = await importPptx(await deck((p) => p.addSlide()));
    const poster = posterFromImport(r, 'My lab');
    expect(poster.name).toBe('My lab');
    expect(poster.columns).toBe(3);
    expect(poster.id).toBeTruthy();
  });
});

describe('placeholders', () => {
  it('inherit position and text style from the layout and master', async () => {
    let blob = await deck((pptx) => pptx.addSlide());
    const titleStyle = `<p:titleStyle><a:lvl1pPr algn="ctr"><a:defRPr sz="6000" b="1"><a:solidFill><a:schemeClr val="accent1"/></a:solidFill><a:latin typeface="+mj-lt"/></a:defRPr></a:lvl1pPr></p:titleStyle>`;
    const bodyStyle = `<p:bodyStyle><a:lvl1pPr><a:buChar char="•"/><a:defRPr sz="2800"/></a:lvl1pPr></p:bodyStyle>`;
    blob = await patch(blob, {
      'ppt/slideMasters/slideMaster1.xml': (x) => x.replace(/<p:titleStyle>.*?<\/p:titleStyle>/s, titleStyle).replace(/<p:bodyStyle>.*?<\/p:bodyStyle>/s, bodyStyle),
      'ppt/slideLayouts/slideLayout1.xml': withShapes(
        ph('title', '0', `<p:spPr>${box(2 * MM * 10, 3 * MM * 10, 400 * MM, 80 * MM)}<a:solidFill><a:srgbClr val="EEEEEE"/></a:solidFill></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/>${para('Layout prompt')}</p:txBody>`) +
          ph('body', '1', `<p:spPr>${box(20 * MM, 150 * MM, 300 * MM, 200 * MM)}</p:spPr><p:txBody><a:bodyPr/><a:lstStyle><a:lvl1pPr><a:defRPr i="1"/></a:lvl1pPr></a:lstStyle>${para('Body prompt')}</p:txBody>`),
      ),
      'ppt/slides/slide1.xml': withShapes(
        ph('title', '0', `<p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${para('Sleep and memory')}</p:txBody>`) +
          ph('body', '1', `<p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${para('First finding')}${para('Second finding')}<a:p><a:pPr><a:buNone/></a:pPr><a:r><a:t>Plain note</a:t></a:r></a:p></p:txBody>`),
      ),
    });
    const r = await importPptx(blob);
    const els = r.poster.elements;
    expect(els.some((e) => e.html?.includes('prompt'))).toBe(false); // layout prompts are not shown on slides

    const title = els.find((e) => e.type === 'title')!;
    expect(title.html).toContain('Sleep and memory');
    expect(title.x).toBeCloseTo(20, 1);
    expect(title.y).toBeCloseTo(30, 1);
    expect(title.w).toBeCloseTo(400, 1);
    expect(title.fill).toBe('#eeeeee'); // fill inherited from the layout placeholder
    expect(title.style!.fontSize).toBe(60);
    expect(title.style!.bold).toBe(true);
    expect(title.style!.align).toBe('center');
    expect(title.style!.fontFamily).toBe('@heading');
    expect(title.style!.color).toBe(r.poster.palette.primary);

    const body = els.find((e) => e.html?.includes('First finding'))!;
    expect(body.y).toBeCloseTo(150, 1);
    expect(body.style!.fontSize).toBe(28);
    expect(body.style!.italic).toBe(true); // from the layout's list style
    expect(body.html).toBe('<ul><li>First finding</li><li>Second finding</li></ul><div>Plain note</div>');
  });

  it('respects slides that hide the master graphics', async () => {
    let blob = await deck((pptx) => pptx.addSlide());
    blob = await patch(blob, {
      'ppt/slideMasters/slideMaster1.xml': withShapes(sp(`<p:spPr>${box(0, 0, IN, IN)}<a:solidFill><a:srgbClr val="00FF00"/></a:solidFill></p:spPr>`)),
    });
    expect((await importPptx(blob)).poster.elements.some((e) => e.fill === '#00ff00')).toBe(true);
    blob = await patch(blob, { 'ppt/slides/slide1.xml': (x) => x.replace('<p:sld ', '<p:sld showMasterSp="0" ') });
    expect((await importPptx(blob)).poster.elements.some((e) => e.fill === '#00ff00')).toBe(false);
  });
});

describe('shapes, gradients and groups', () => {
  it('turns gradient fills into CSS gradients with a solid fallback', async () => {
    const grad = `<a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="FF0000"/></a:gs><a:gs pos="100000"><a:srgbClr val="0000FF"><a:alpha val="50000"/></a:srgbClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>`;
    const radial = `<a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="FFFFFF"/></a:gs><a:gs pos="100000"><a:srgbClr val="000000"/></a:gs></a:gsLst><a:path path="circle"><a:fillToRect l="50000" t="50000" r="50000" b="50000"/></a:path></a:gradFill>`;
    const blob = await patch(await deck((p) => p.addSlide()), {
      'ppt/slides/slide1.xml': (x) =>
        withShapes(sp(`<p:spPr>${box(0, 0, IN, IN)}${grad}</p:spPr>`) + sp(`<p:spPr>${box(IN, 0, IN, IN)}<a:prstGeom prst="ellipse"/>${radial}</p:spPr>`))(x).replace(
          /<p:cSld([^>]*)>(<p:bg>.*?<\/p:bg>)?/s,
          `<p:cSld$1><p:bg><p:bgPr>${grad}<a:effectLst/></p:bgPr></p:bg>`,
        ),
    });
    const r = await importPptx(blob);
    const els = r.poster.elements;
    // Gradient background becomes a locked full-page shape at the back.
    expect(els[0].locked).toBe(true);
    expect(els[0].w).toBeCloseTo(r.poster.width, 1);
    expect(r.poster.palette.background).toBe('#ff0000');

    const lin = els.find((e) => !e.locked && e.shape === 'rect')!;
    expect(lin.fill).toBe('#ff0000');
    expect(lin.gradient).toBe('linear-gradient(180deg, #ff0000 0%, rgba(0, 0, 255, 0.5) 100%)');
    const rad = els.find((e) => e.shape === 'ellipse')!;
    expect(rad.gradient).toBe('radial-gradient(circle at 50% 50%, #ffffff 0%, #000000 100%)');
  });

  it('uses theme style colours for shapes drawn in PowerPoint', async () => {
    const style = `<p:style><a:lnRef idx="2"><a:schemeClr val="accent1"><a:shade val="50000"/></a:schemeClr></a:lnRef><a:fillRef idx="1"><a:schemeClr val="accent1"/></a:fillRef><a:effectRef idx="0"><a:schemeClr val="accent1"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef></p:style>`;
    const blob = await patch(await deck((p) => p.addSlide()), {
      'ppt/slides/slide1.xml': withShapes(
        sp(`<p:spPr>${box(0, 0, IN, IN)}<a:prstGeom prst="rect"/></p:spPr>${style}<p:txBody><a:bodyPr/><a:lstStyle/>${para('On blue')}</p:txBody>`) +
          sp(`<p:spPr>${box(0, 2 * IN, IN, IN)}<a:prstGeom prst="star5"/></p:spPr>${style}`),
      ),
    });
    const r = await importPptx(blob);
    const t = r.poster.elements.find((e) => e.html?.includes('On blue'))!;
    expect(t.fill).toBe(r.poster.palette.primary);
    expect(t.style!.color).toBe('#ffffff');
    expect(t.borderWidth).toBeGreaterThan(0);
    expect(r.warnings.join(' ')).toMatch(/arrows or stars/);
  });

  it('places nested grouped shapes using the group transforms', async () => {
    // Outer group: child space 0..1000 mapped onto 100mm × 100mm at (10mm, 20mm).
    // Inner group: child space 0..10 mapped onto 500 × 500 (outer child units) at (500, 500).
    const inner = `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="20" name="inner"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="500" y="500"/><a:ext cx="500" cy="500"/><a:chOff x="0" y="0"/><a:chExt cx="10" cy="10"/></a:xfrm></p:grpSpPr>${sp(
      `<p:spPr>${box(0, 0, 5, 10)}<a:solidFill><a:srgbClr val="00AA00"/></a:solidFill></p:spPr>`,
    )}</p:grpSp>`;
    const outer = `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="10" name="outer"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="${10 * MM}" y="${20 * MM}"/><a:ext cx="${100 * MM}" cy="${100 * MM}"/><a:chOff x="0" y="0"/><a:chExt cx="1000" cy="1000"/></a:xfrm></p:grpSpPr>${sp(
      `<p:spPr>${box(0, 0, 1000, 100)}<a:solidFill><a:srgbClr val="AA0000"/></a:solidFill></p:spPr>`,
    )}${inner}</p:grpSp>`;
    const r = await importPptx(await patch(await deck((p) => p.addSlide()), { 'ppt/slides/slide1.xml': withShapes(outer) }));
    const red = r.poster.elements.find((e) => e.fill === '#aa0000')!;
    expect([red.x, red.y, red.w, red.h].map((v) => +v.toFixed(2))).toEqual([10, 20, 100, 10]);
    const green = r.poster.elements.find((e) => e.fill === '#00aa00')!;
    expect([green.x, green.y, green.w, green.h].map((v) => +v.toFixed(2))).toEqual([60, 70, 25, 50]);
  });

  it('reads the fallback of AlternateContent blocks and imports lines', async () => {
    const alt = `<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice Requires="p14"><p:sp/></mc:Choice><mc:Fallback>${sp(
      `<p:spPr>${box(0, 0, IN, IN)}<a:solidFill><a:srgbClr val="123123"/></a:solidFill></p:spPr>`,
    )}</mc:Fallback></mc:AlternateContent>`;
    const line = `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="30" name="line"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr>${box(0, 50 * MM, 0, 100 * MM)}<a:prstGeom prst="line"/><a:ln w="38100"><a:solidFill><a:srgbClr val="333333"/></a:solidFill></a:ln></p:spPr></p:cxnSp>`;
    const r = await importPptx(await patch(await deck((p) => p.addSlide()), { 'ppt/slides/slide1.xml': withShapes(alt + line) }));
    expect(r.poster.elements.some((e) => e.fill === '#123123')).toBe(true);
    const l = r.poster.elements.find((e) => e.shape === 'line')!;
    expect(l.fill).toBe('#333333');
    expect(l.h).toBeCloseTo(100, 1); // vertical line keeps its length
    expect(l.w).toBeCloseTo((3 * 25.4) / 72, 2); // and gets the 3pt thickness as its width
  });
});

describe('tables and charts', () => {
  it('turns PowerPoint tables into editable tables', async () => {
    const r = await importPptx(
      await deck((pptx) =>
        pptx.addSlide().addTable(
          [
            [{ text: 'Group', options: { bold: true, fill: { color: '1F4E79' }, color: 'FFFFFF' } }, { text: 'Mean', options: { bold: true, fill: { color: '1F4E79' }, color: 'FFFFFF' } }],
            [{ text: 'Control' }, { text: '4.2', options: { align: 'right' } }],
            [{ text: 'Merged note', options: { colspan: 2 } }],
          ],
          { x: 1, y: 2, w: 6, colW: [4, 2], fontSize: 20 },
        ),
      ),
    );
    const t = r.poster.elements.find((e) => e.html?.includes('<table'))!;
    expect(t.type).toBe('text');
    expect(t.x).toBeCloseTo(25.4, 1);
    expect(t.w).toBeCloseTo(6 * 25.4, 1);
    expect(t.style!.fontSize).toBe(20);
    const div = document.createElement('div');
    div.innerHTML = t.html!;
    const rows = Array.from(div.querySelectorAll('tr'));
    expect(rows).toHaveLength(3);
    const head = rows[0].cells[0];
    expect(head.textContent).toBe('Group');
    expect(head.style.backgroundColor).toMatch(/rgb\(31, 78, 121\)|#1f4e79/);
    expect(head.style.color).toMatch(/rgb\(255, 255, 255\)|#ffffff/);
    expect(rows[1].cells[1].style.textAlign).toBe('right');
    expect(rows[2].cells[0].colSpan).toBe(2);
    expect(Array.from(div.querySelectorAll('col')).map((c) => parseFloat(c.style.width))).toEqual([66.67, 33.33]);

    // and the table survives a PowerPoint export as a native table
    const back = tableRowsFromHtml(t.html!)!;
    expect(back.rows.map((r) => r.length)).toEqual([2, 2, 1]);
    expect(back.rows[0][0].options.fill).toEqual({ color: '1F4E79' });
    expect(back.rows[2][0].options.colspan).toBe(2);
  });

  it('turns PowerPoint charts into editable charts using their data', async () => {
    const r = await importPptx(
      await deck((pptx) =>
        pptx.addSlide().addChart(
          pptx.ChartType.bar,
          [
            { name: 'Placebo', labels: ['Week 1', 'Week 2', 'Week 3'], values: [3, 4, 5] },
            { name: 'Drug', labels: ['Week 1', 'Week 2', 'Week 3'], values: [3, 6, 9] },
          ],
          { x: 1, y: 3, w: 8, h: 6, barDir: 'bar', showTitle: true, title: 'Response by week', showLegend: true, showValAxisTitle: true, valAxisTitle: 'Score' },
        ),
      ),
    );
    const c = r.poster.elements.find((e) => e.type === 'chart')!;
    expect(c.x).toBeCloseTo(25.4, 1);
    expect(c.h).toBeCloseTo(6 * 25.4, 1);
    const spec = c.chart!;
    expect(spec.kind).toBe('horizontalBar');
    expect(spec.title).toBe('Response by week');
    expect(spec.columns).toEqual(['Category', 'Placebo', 'Drug']);
    expect(spec.rows).toEqual([
      ['Week 1', '3', '3'],
      ['Week 2', '4', '6'],
      ['Week 3', '5', '9'],
    ]);
    expect(spec.yColumns).toEqual([1, 2]);
    expect(spec.rowEnd).toBe(2);
    expect(spec.showLegend).toBe(true);
    expect(spec.yLabel).toBe('Score');
    expect(r.warnings).toEqual([]);
  });

  it('reads line, pie and scatter charts', () => {
    const C = 'xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
    const pts = (vals: (string | number)[], tag = 'numCache') => `<c:${tag}><c:ptCount val="${vals.length}"/>${vals.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('')}</c:${tag}>`;
    const doc = (body: string) => new DOMParser().parseFromString(`<c:chartSpace ${C}><c:chart><c:autoTitleDeleted val="1"/><c:plotArea>${body}</c:plotArea></c:chart></c:chartSpace>`, 'application/xml');

    const line = chartSpecFromXml(doc(`<c:lineChart><c:ser><c:tx><c:v>Temp</c:v></c:tx><c:cat><c:strRef>${pts(['Jan', 'Feb'], 'strCache')}</c:strRef></c:cat><c:val><c:numRef>${pts([1, 2])}</c:numRef></c:val></c:ser></c:lineChart>`))!;
    expect(line.spec.kind).toBe('line');
    expect(line.spec.title).toBe('');
    expect(line.spec.rows).toEqual([
      ['Jan', '1'],
      ['Feb', '2'],
    ]);

    const pie = chartSpecFromXml(doc(`<c:doughnutChart><c:ser><c:cat><c:strLit>${pts(['A', 'B'], 'strCache').replace(/strCache/g, 'x')}</c:strLit></c:cat><c:val><c:numLit><c:ptCount val="2"/><c:pt idx="1"><c:v>7</c:v></c:pt></c:numLit></c:val></c:ser></c:doughnutChart>`))!;
    expect(pie.spec.kind).toBe('doughnut');
    expect(pie.spec.rows[0][1]).toBe(''); // missing points stay empty
    expect(pie.spec.rows[1][1]).toBe('7');

    const scatter = chartSpecFromXml(doc(`<c:scatterChart><c:ser><c:xVal><c:numRef>${pts([0.5, 1.5])}</c:numRef></c:xVal><c:yVal><c:numRef>${pts([10, 20])}</c:numRef></c:yVal></c:ser></c:scatterChart>`))!;
    expect(scatter.spec.kind).toBe('scatter');
    expect(scatter.spec.columns).toEqual(['X', 'Series 1']);
    expect(scatter.spec.rows).toEqual([
      ['0.5', '10'],
      ['1.5', '20'],
    ]);

    expect(chartSpecFromXml(doc('<c:surfaceChart/>'))).toBeNull();
  });

  it('warns about SmartArt instead of failing', async () => {
    const smart = `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="40" name="SmartArt"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="0" y="0"/><a:ext cx="${IN}" cy="${IN}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram"/></a:graphic></p:graphicFrame>`;
    const r = await importPptx(await patch(await deck((p) => p.addSlide()), { 'ppt/slides/slide1.xml': withShapes(smart) }));
    expect(r.warnings.join(' ')).toMatch(/SmartArt/);
  });
});

describe('images', () => {
  it('prefers the SVG version of a picture and imports picture-filled shapes', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>';
    const pic = `<p:pic><p:nvPicPr><p:cNvPr id="50" name="logo"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdPng"><a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="rIdSvg"/></a:ext></a:extLst></a:blip><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${box(
      10 * MM,
      10 * MM,
      40 * MM,
      40 * MM,
    )}</p:spPr></p:pic>`;
    const filled = sp(`<p:spPr>${box(60 * MM, 10 * MM, 40 * MM, 40 * MM)}<a:blipFill><a:blip r:embed="rIdPng"/><a:stretch/></a:blipFill></p:spPr>`);
    const emf = `<p:pic><p:nvPicPr><p:cNvPr id="51" name="emf"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdEmf"/></p:blipFill><p:spPr>${box(0, 0, IN, IN)}</p:spPr></p:pic>`;
    const png = Uint8Array.from(atob(PNG_B64), (c) => c.charCodeAt(0));
    const blob = await patch(await deck((p) => p.addSlide()), {
      'ppt/slides/slide1.xml': withShapes(pic + filled + emf),
      'ppt/slides/_rels/slide1.xml.rels': (x) =>
        x.replace(
          '</Relationships>',
          '<Relationship Id="rIdPng" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/pic.png"/><Relationship Id="rIdSvg" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/pic.svg"/><Relationship Id="rIdEmf" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/pic.emf"/></Relationships>',
        ),
      'ppt/media/pic.png': png,
      'ppt/media/pic.svg': svg,
      'ppt/media/pic.emf': new Uint8Array([1, 2, 3]),
    });
    const r = await importPptx(blob);
    const imgs = r.poster.elements.filter((e) => e.type === 'image');
    expect(imgs).toHaveLength(2);
    expect(imgs[0].src!.startsWith('data:image/svg+xml;base64,')).toBe(true);
    expect(imgs[0].x).toBeCloseTo(10, 1);
    expect(imgs[1].src!.startsWith('data:image/png;base64,')).toBe(true);
    expect(imgs[1].x).toBeCloseTo(60, 1);
    expect(r.warnings.join(' ')).toMatch(/EMF\/WMF/);
  });
});

describe('booby-trapped PowerPoint files', () => {
  it('cannot sneak HTML in through font names or text', async () => {
    const evilFont = 'Arial&quot;&gt;&lt;img src=x onerror=&quot;alert(1)&quot;&gt;';
    const runs =
      `<a:p><a:r><a:rPr lang="en-US"/><a:t>Normal </a:t></a:r>` +
      `<a:r><a:rPr lang="en-US"><a:latin typeface="${evilFont}"/></a:rPr><a:t>&lt;script&gt;alert(2)&lt;/script&gt;</a:t></a:r></a:p>`;
    const table =
      `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="77" name="T"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="0" y="0"/><a:ext cx="${100 * MM}" cy="${40 * MM}"/></p:xfrm>` +
      `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblGrid><a:gridCol w="${50 * MM}"/><a:gridCol w="${50 * MM}"/></a:tblGrid>` +
      `<a:tr h="${20 * MM}"><a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:rPr><a:latin typeface="${evilFont}"/></a:rPr><a:t>A</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>` +
      `<a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>B</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc></a:tr>` +
      `<a:tr h="${20 * MM}"><a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>C</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc><a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>D</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc></a:tr>` +
      `</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
    let blob = await deck((pptx) => pptx.addSlide());
    blob = await patch(blob, {
      'ppt/slides/slide1.xml': withShapes(sp(`<p:spPr>${box(0, 0, 200 * MM, 50 * MM)}</p:spPr><p:txBody><a:bodyPr/><a:lstStyle/>${runs}</p:txBody>`) + table),
    });
    const r = await importPptx(blob);
    const html = r.poster.elements.map((e) => e.html ?? '').join('\n');
    expect(html).toContain('Normal');
    expect(html).toContain('&lt;script&gt;'); // the text is shown as text
    expect(html).toContain('<table');
    expect(html).not.toMatch(/<img|<script|onerror=/i);

    const div = document.createElement('div');
    div.innerHTML = html;
    expect(div.querySelector('img, script, [onerror]')).toBeNull();

    const poster = posterFromImport(r, 'Evil');
    expect(poster.elements.map((e) => e.html ?? '').join('')).not.toMatch(/<img|onerror=/i);
    for (const e of poster.elements) if (e.style) expect(e.style.fontFamily).not.toMatch(/[<>"]/); // font names are plain names
  });
});
