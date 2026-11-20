import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { PALETTES, createPoster, sizeFor } from '../../src/model';
import type { TemplateId } from '../../src/templates';
import type { Poster } from '../../src/types';
import {
  describeFill,
  fillPoster,
  guessParts,
  parseAbstract,
  posterSections,
  readDocx,
  splitSentences,
  suggestTargets,
  type AbstractPart,
} from '../../src/lib/abstractImport';

const make = (template: TemplateId = 'classic', columns = 3): Poster =>
  createPoster({ name: 'T', ...sizeFor('A0', 'portrait'), sizePreset: 'A0', columns, palette: PALETTES[0], headingFont: 'Montserrat', bodyFont: 'Open Sans', template });

const kinds = (parts: AbstractPart[]) => parts.map((p) => p.kind);

const STRUCTURED = `Background: Sleep supports memory, but little is known about naps in older adults.
Methods: We recruited 42 adults aged 65–80 and randomised them to a nap or a quiet rest.
Results: Recall improved by 18% after a nap (p = 0.01).
Conclusions: Short naps may help older adults remember.`;

const UNSTRUCTURED =
  'Sleep is one of the most important factors for memory, yet little is known about daytime naps in older adults. ' +
  'We recruited 42 adults aged 65–80 (e.g. from local clubs) and randomised them to a 30-minute nap or quiet rest, following Smith et al. 2019. ' +
  'Recall was measured with a word-list test. ' +
  'Recall improved by 18% after a nap compared with rest (p = 0.01). ' +
  'The effect was larger in people who slept poorly at night. ' +
  'These findings suggest that short naps may help older adults remember new information.';

describe('structured abstracts', () => {
  it('splits at "Heading:" labels', () => {
    const { parts, structured } = parseAbstract(STRUCTURED);
    expect(structured).toBe(true);
    expect(kinds(parts)).toEqual(['background', 'methods', 'results', 'conclusions']);
    expect(parts[1].text).toBe('We recruited 42 adults aged 65–80 and randomised them to a nap or a quiet rest.');
    expect(parts.every((p) => !p.guessed)).toBe(true);
  });

  it('reads PubMed style capitals on one line, with or without colons', () => {
    const { parts } = parseAbstract(
      'BACKGROUND Naps are common. OBJECTIVE: To test naps. MATERIALS AND METHODS We ran a trial. RESULTS Recall rose. CONCLUSION Naps help.',
    );
    expect(kinds(parts)).toEqual(['background', 'aims', 'methods', 'results', 'conclusions']);
    expect(parts[2].label).toBe('Materials and methods');
    expect(parts[2].text).toBe('We ran a trial.');
  });

  it('reads headings on their own lines and JAMA-style labels, and drops the word Abstract', () => {
    const { parts } = parseAbstract('Abstract\nImportance\nNaps matter.\nDesign, Setting, and Participants\nA trial in 3 clinics.\nFindings\nRecall rose.\nConclusions and Relevance\nNaps help.');
    expect(kinds(parts)).toEqual(['background', 'methods', 'results', 'conclusions']);
    expect(parts[0].text).toBe('Naps matter.');
  });

  it('does not treat ordinary words in a sentence as headings', () => {
    const { parts, structured } = parseAbstract('Results from earlier work were mixed. We found that methods differ. Our conclusions are tentative.');
    expect(structured).toBe(false);
    expect(parts.map((p) => p.text).join(' ')).toBe('Results from earlier work were mixed. We found that methods differ. Our conclusions are tentative.');
  });

  it('keeps keywords and registration as "other" so they are left out by default', () => {
    const { parts } = parseAbstract(`${STRUCTURED}\nKeywords: sleep; memory; ageing`);
    expect(parts[parts.length - 1]).toMatchObject({ kind: 'other', text: 'sleep; memory; ageing' });
    expect(suggestTargets(parts, posterSections(make().elements)).at(-1)).toBeNull();
  });

  it('keeps any text before the first heading', () => {
    const { parts } = parseAbstract(`Naps in later life.\n${STRUCTURED}`);
    expect(parts[0]).toMatchObject({ kind: 'background', text: 'Naps in later life.', guessed: true });
    expect(parts).toHaveLength(5);
  });
});

describe('abstracts without headings', () => {
  it('splits sentences without breaking at abbreviations', () => {
    const s = splitSentences(UNSTRUCTURED);
    expect(s).toHaveLength(6);
    expect(s[1]).toContain('(e.g. from local clubs)');
    expect(s[1]).toContain('Smith et al. 2019.');
  });

  it('makes a best guess in the usual order', () => {
    const { parts, structured } = parseAbstract(UNSTRUCTURED);
    expect(structured).toBe(false);
    expect(kinds(parts)).toEqual(['background', 'methods', 'results', 'conclusions']);
    expect(parts[1].text).toMatch(/^We recruited.*word-list test\.$/);
    expect(parts[2].text).toMatch(/^Recall improved.*slept poorly at night\.$/);
    expect(parts[3].text).toMatch(/^These findings suggest/);
    expect(parts.every((p) => p.guessed)).toBe(true);
  });

  it('never puts a later part before an earlier one, and keeps every word', () => {
    const text = 'We found a large effect. Diabetes is a major global problem. In conclusion, act now. We used a survey.';
    const parts = guessParts(text);
    const order = ['background', 'methods', 'results', 'conclusions'];
    const idx = parts.map((p) => order.indexOf(p.kind));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
    expect(parts.map((p) => p.text).join(' ')).toBe(text);
  });

  it('handles one sentence and empty text', () => {
    expect(parseAbstract('   ').parts).toEqual([]);
    expect(parseAbstract('Naps help memory.').parts).toHaveLength(1);
  });
});

describe('matching parts to poster sections', () => {
  it('finds the sections of a template in reading order', () => {
    const secs = posterSections(make('classic', 3).elements);
    expect(secs.map((s) => s.key)).toContain('methods');
    expect(secs.every((s) => !s.edited)).toBe(true);
  });

  it('puts each part in its matching section', () => {
    const p = make('classic', 3);
    const secs = posterSections(p.elements);
    const { parts } = parseAbstract(STRUCTURED);
    const t = suggestTargets(parts, secs);
    expect(t.map((i) => secs[i!].key)).toEqual(['introduction', 'methods', 'results', 'conclusions']);
  });

  it('joins a part with no matching section to its neighbour', () => {
    const p = make('classic', 1); // one column: Background and Results only
    const secs = posterSections(p.elements);
    expect(secs.map((s) => s.key)).toEqual(['background', 'results']);
    const t = suggestTargets(parseAbstract(STRUCTURED).parts, secs);
    // Methods joins Background (the part before it); Conclusions joins Results.
    expect(t.map((i) => secs[i!].key)).toEqual(['background', 'background', 'results', 'results']);
  });

  it('works on posters drawn by hand (no layout roles)', () => {
    const p = make('classic', 3);
    for (const e of p.elements) {
      delete e.role;
      delete e.group;
    }
    const secs = posterSections(p.elements);
    expect(secs.map((s) => s.key)).toEqual(expect.arrayContaining(['methods', 'results']));
  });

  it('has nothing to offer on a blank poster', () => {
    const secs = posterSections(make('blank').elements);
    expect(secs).toEqual([]);
    expect(suggestTargets(parseAbstract(STRUCTURED).parts, secs)).toEqual([null, null, null, null]);
  });
});

describe('filling the poster', () => {
  const plan = (p: Poster, text = STRUCTURED, replace = false) => {
    const secs = posterSections(p.elements);
    const { parts } = parseAbstract(text);
    const t = suggestTargets(parts, secs);
    return { parts: parts.map((part, i) => ({ part, bodyId: t[i] == null ? null : secs[t[i]!].bodyId })), replace };
  };
  const body = (p: Poster, key: string) => {
    const s = posterSections(p.elements).find((x) => x.key === key)!;
    return p.elements.find((e) => e.id === s.bodyId)!.html!;
  };

  it('replaces the starter text in each section', () => {
    const p = make('classic', 3);
    const r = fillPoster(p, plan(p));
    expect(r).toEqual({ sections: 4, title: false });
    expect(body(p, 'methods')).toBe('We recruited 42 adults aged 65–80 and randomised them to a nap or a quiet rest.');
    expect(body(p, 'results')).toBe('Recall improved by 18% after a nap (p = 0.01).');
    expect(describeFill(r)).toMatch(/^Filled 4 sections from your abstract\./);
  });

  it('labels parts that share a section', () => {
    const p = make('classic', 1);
    fillPoster(p, plan(p));
    expect(body(p, 'background')).toBe(
      '<b>Background.</b> Sleep supports memory, but little is known about naps in older adults.<br><b>Methods.</b> We recruited 42 adults aged 65–80 and randomised them to a nap or a quiet rest.',
    );
  });

  it('adds after text the person wrote, unless told to replace it', () => {
    const p = make('classic', 3);
    const id = posterSections(p.elements).find((s) => s.key === 'results')!.bodyId;
    p.elements.find((e) => e.id === id)!.html = 'My own notes.';
    expect(posterSections(p.elements).find((s) => s.key === 'results')!.edited).toBe(true);
    fillPoster(p, plan(p));
    expect(body(p, 'results')).toBe('My own notes.<br>Recall improved by 18% after a nap (p = 0.01).');

    const q = make('classic', 3);
    q.elements.find((e) => e.id === posterSections(q.elements).find((s) => s.key === 'results')!.bodyId)!.html = 'My own notes.';
    fillPoster(q, plan(q, STRUCTURED, true));
    expect(body(q, 'results')).toBe('Recall improved by 18% after a nap (p = 0.01).');
  });

  it('treats the abstract as plain text, so markup in it cannot run', () => {
    const p = make('classic', 3);
    fillPoster(p, plan(p, 'Background: <img src=x onerror=alert(1)> & <b>bold</b>\nResults: x < y > z'));
    const html = body(p, 'introduction');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt; &amp; &lt;b&gt;bold&lt;/b&gt;');
    expect(body(p, 'results')).toBe('x &lt; y &gt; z');
  });

  it('keeps paragraphs as line breaks and sets the title when asked', () => {
    const p = make('classic', 3);
    const r = fillPoster(p, { ...plan(p, 'Background: One.\nTwo.\nResults: Three.'), title: 'Naps & memory' });
    expect(body(p, 'introduction')).toBe('One.<br>Two.');
    expect(p.elements.find((e) => e.type === 'title')!.html).toBe('Naps &amp; memory');
    expect(r.title).toBe(true);
  });

  it('skips parts that are left out', () => {
    const p = make('classic', 3);
    const pl = plan(p);
    pl.parts[2].bodyId = null;
    expect(fillPoster(p, pl).sections).toBe(3);
    expect(body(p, 'results')).not.toContain('Recall');
  });
});

// ---------- Word files ----------

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const para = (text: string, style?: string) =>
  `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

async function docx(body: string): Promise<Blob> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${W_NS}"><w:body>${body}</w:body></w:document>`);
  return zip.generateAsync({ type: 'blob' });
}

describe('reading Word files', () => {
  it('takes the title and only the abstract from a full paper', async () => {
    const file = await docx(
      para('Naps and memory in older adults', 'Title') +
        para('A. Researcher, University A') +
        para('Abstract', 'Heading1') +
        para('Background: Naps are common.') +
        `<w:p><w:r><w:t>Methods: We ran a </w:t></w:r><w:del><w:r><w:delText>small </w:delText></w:r></w:del><w:r><w:t>trial.</w:t></w:r></w:p>` +
        para('Results: Recall rose.') +
        para('Conclusions: Naps help.') +
        para('Keywords: sleep') +
        para('Introduction', 'Heading1') +
        para('Long paper text that is not part of the abstract.'),
    );
    const r = await readDocx(file);
    expect(r.title).toBe('Naps and memory in older adults');
    expect(r.text).toBe('Background: Naps are common.\nMethods: We ran a trial.\nResults: Recall rose.\nConclusions: Naps help.');
    expect(kinds(parseAbstract(r.text).parts)).toEqual(['background', 'methods', 'results', 'conclusions']);
  });

  it('reads abstract section headings written as Word headings', async () => {
    const r = await readDocx(
      await docx(para('Abstract', 'Heading1') + para('Background', 'Heading2') + para('Naps are common.') + para('Results', 'Heading2') + para('Recall rose.') + para('Discussion', 'Heading1') + para('Not this.')),
    );
    expect(r.text).toBe('Background\nNaps are common.\nResults\nRecall rose.');
    expect(parseAbstract(r.text).parts.map((p) => p.text)).toEqual(['Naps are common.', 'Recall rose.']);
  });

  it('reads a document that is only the abstract', async () => {
    const r = await readDocx(await docx(para('Sleep matters.') + para('We found naps help.')));
    expect(r).toEqual({ title: undefined, text: 'Sleep matters.\nWe found naps help.' });
  });

  it('explains when the file is not a Word document', async () => {
    await expect(readDocx(new Blob(['hello']))).rejects.toThrow(/does not look like a Word/);
    const zip = new JSZip();
    zip.file('ppt/presentation.xml', '<p/>');
    await expect(readDocx(await zip.generateAsync({ type: 'blob' }))).rejects.toThrow(/does not look like a Word/);
  });
});
