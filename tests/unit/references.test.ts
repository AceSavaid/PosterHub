import { describe, expect, it, vi } from 'vitest';
import { latexToText, parseBibtex, parseName } from '../../src/lib/refs/bibtex';
import { extractDois, fromCsl, fromDataCite, lookupDoi, parseCslJson } from '../../src/lib/refs/doi';
import { compressNumbers, formatReference } from '../../src/lib/refs/format';
import { bibliography, citeCounts, findDuplicate, listHtml, removeReference, syncCitations } from '../../src/lib/refs/citations';
import { referencesFromText } from '../../src/components/ReferencesDialog';
import { checkPoster } from '../../src/lib/checks';
import { htmlToRuns } from '../../src/lib/exporters';
import { PALETTES, createPoster, makeElement } from '../../src/model';
import type { Poster, Reference } from '../../src/types';

const BIB = String.raw`
@string{nat = "Nature"}
@article{lecun2015,
  author  = {LeCun, Yann and Bengio, Yoshua and Hinton, Geoffrey},
  title   = {Deep {Learning}},
  journal = nat,
  year    = 2015,
  volume  = {521},
  number  = {7553},
  pages   = {436--444},
  doi     = {10.1038/nature14539},
}
@book{knuth,
  author = "Donald E. Knuth",
  title = {The {\TeX}book},
  publisher = {Addison-Wesley},
  address = {Reading, MA},
  year = {1984},
  edition = {2},
}
@comment{ignore me @article{nope, title={x}} }
@inproceedings{vaswani2017,
  title={Attention is all you need},
  author={Vaswani, Ashish and Shazeer, Noam and Parmar, Niki and others},
  booktitle={Advances in Neural Information Processing Systems},
  pages={5998--6008},
  year={2017}
}
@phdthesis{erdos, author = {Erd{\H{o}}s, P{\'a}l and M{\"u}ller, J\"urgen}, title = {On {S}chr\"odinger's cat \& friends}, school = {ETH Z{\"u}rich}, year = {1999}}
@misc{who, author = {{World Health Organization}}, title = {Physical activity}, url = {https://www.who.int/news-room/fact-sheets/detail/physical-activity}, year = {2022}}
`;

const ARTICLE: Reference = {
  id: 'a1', kind: 'article', title: 'Deep learning', container: 'Nature', year: '2015', volume: '521', issue: '7553', pages: '436–444', doi: '10.1038/nature14539',
  authors: [{ family: 'LeCun', given: 'Yann' }, { family: 'Bengio', given: 'Yoshua' }, { family: 'Hinton', given: 'Geoffrey' }],
};
const BOOK: Reference = { id: 'b1', kind: 'book', title: 'The TeXbook', year: '1984', publisher: 'Addison-Wesley', place: 'Reading, MA', edition: '2', authors: [{ family: 'Knuth', given: 'Donald E.' }] };
const CHAPTER: Reference = {
  id: 'c1', kind: 'chapter', title: 'Memory consolidation', container: 'Handbook of Sleep', year: '2019', pages: '10–20', publisher: 'Springer',
  authors: [{ family: 'Walker', given: 'Matthew' }], editors: [{ family: 'Smith', given: 'Anne' }],
};

function poster(refs: Reference[], style?: Poster['citationStyle']): Poster {
  const p = createPoster({ name: 'T', width: 841, height: 1189, sizePreset: 'A0', columns: 3, palette: PALETTES[0], headingFont: 'Montserrat', bodyFont: 'Open Sans', template: 'blank' as never });
  p.elements = [];
  p.references = refs;
  p.citationStyle = style;
  return p;
}
const cite = (...ids: string[]) => `<span class="cite" data-cite="${ids.join(',')}" contenteditable="false">[?]</span>`;
const textOf = (html: string) => {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.textContent ?? '';
};

describe('BibTeX', () => {
  const refs = parseBibtex(BIB);

  it('reads every entry and skips comments', () => {
    expect(refs.map((r) => r.key)).toEqual(['lecun2015', 'knuth', 'vaswani2017', 'erdos', 'who']);
  });

  it('maps fields, macros and page ranges', () => {
    const [a] = refs;
    expect(a).toMatchObject({ kind: 'article', title: 'Deep Learning', container: 'Nature', year: '2015', volume: '521', issue: '7553', pages: '436–444', doi: '10.1038/nature14539' });
    expect(a.authors).toEqual([{ family: 'LeCun', given: 'Yann' }, { family: 'Bengio', given: 'Yoshua' }, { family: 'Hinton', given: 'Geoffrey' }]);
  });

  it('understands "First Last" names, editions and conference papers ("and others" dropped)', () => {
    expect(refs[1]).toMatchObject({ kind: 'book', title: 'The TeXbook', edition: '2', place: 'Reading, MA', authors: [{ family: 'Knuth', given: 'Donald E.' }] });
    expect(refs[2]).toMatchObject({ kind: 'conference', container: 'Advances in Neural Information Processing Systems' });
    expect(refs[2].authors).toHaveLength(3);
  });

  it('turns LaTeX accents and escapes into real characters', () => {
    expect(refs[3].authors).toEqual([{ family: 'Erdős', given: 'Pál' }, { family: 'Müller', given: 'Jürgen' }]);
    expect(refs[3].title).toBe('On Schrödinger\'s cat & friends');
    expect(refs[3]).toMatchObject({ kind: 'thesis', publisher: 'ETH Zürich', container: 'Doctoral dissertation' });
    expect(latexToText('\\c{c}a \\v{s} \\ss{} \\o{} --- $\\alpha$')).toBe('ça š ß ø — α');
  });

  it('keeps organisations as one name', () => {
    expect(refs[4]).toMatchObject({ kind: 'web', authors: [{ family: 'World Health Organization' }] });
    expect(parseName('Ludwig van Beethoven')).toEqual({ family: 'van Beethoven', given: 'Ludwig' });
    expect(parseName('King, Jr, Martin Luther')).toEqual({ family: 'King', given: 'Martin Luther' });
  });

  it('never lets markup through', () => {
    const [r] = parseBibtex('@article{x, title={<img src=x onerror=alert(1)>}, author={<b>Bad</b>}}');
    const html = formatReference(r, 'apa');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;img');
  });
});

describe('DOIs', () => {
  it('finds DOIs, links and arXiv ids in pasted text', () => {
    const t = 'see 10.1038/nature14539, https://doi.org/10.1126/science.aaa8415. doi:10.1000/XYZ123 and arXiv:1706.03762v5\n10.1038/NATURE14539';
    expect(extractDois(t)).toEqual(['10.1038/nature14539', '10.1126/science.aaa8415', '10.1000/XYZ123', '10.48550/arXiv.1706.03762']);
  });

  it('maps a Crossref record, stripping JATS markup from titles', () => {
    const r = fromCsl({
      type: 'journal-article', title: ['Effects of <i>Drosophila</i> CO<sub>2</sub>'], 'container-title': ['Cell'],
      author: [{ given: 'Ada', family: 'Lovelace' }, { name: 'The Consortium' }], issued: { 'date-parts': [[2021, 3]] },
      volume: '184', issue: '2', page: '100-110', DOI: '10.1016/j.cell.2021.01.001', URL: 'http://dx.doi.org/10.1016/j.cell.2021.01.001', publisher: 'Elsevier',
    });
    expect(r).toMatchObject({ kind: 'article', title: 'Effects of Drosophila CO2', container: 'Cell', year: '2021', pages: '100–110', doi: '10.1016/j.cell.2021.01.001' });
    expect(r.authors).toEqual([{ family: 'Lovelace', given: 'Ada' }, { family: 'The Consortium' }]);
    expect(r.url).toBeUndefined();
  });

  it('maps a DataCite (arXiv) record', () => {
    const r = fromDataCite({
      doi: '10.48550/arxiv.1706.03762', titles: [{ title: 'Attention Is All You Need' }], publicationYear: 2017, publisher: 'arXiv',
      creators: [{ name: 'Vaswani, Ashish', nameType: 'Personal' }, { givenName: 'Noam', familyName: 'Shazeer' }], types: { resourceTypeGeneral: 'Preprint' },
    });
    expect(r).toMatchObject({ kind: 'other', title: 'Attention Is All You Need', year: '2017', container: 'arXiv' });
    expect(r.authors).toEqual([{ family: 'Vaswani', given: 'Ashish' }, { family: 'Shazeer', given: 'Noam' }]);
  });

  it('looks up Crossref first and falls back to DataCite', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes('crossref')) return new Response('not found', { status: 404 });
      return Response.json({ data: { attributes: { doi: '10.5281/zenodo.1', titles: [{ title: 'Data' }], publicationYear: 2020, creators: [{ name: 'Lab' }], types: { resourceTypeGeneral: 'Dataset' } } } });
    });
    const r = await lookupDoi('10.5281/zenodo.1', fetchFn as unknown as typeof fetch);
    expect(r.title).toBe('Data');
    expect(fetchFn.mock.calls.map((c) => c[0])).toEqual(['https://api.crossref.org/works/10.5281%2Fzenodo.1', 'https://api.datacite.org/dois/10.5281%2Fzenodo.1']);
  });

  it('explains when offline', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(lookupDoi('10.1/x', fetchFn as unknown as typeof fetch)).rejects.toThrow(/internet connection/);
  });

  it('reads pasted CSL-JSON (Zotero export)', () => {
    const r = parseCslJson('[{"type":"book","title":"Sleep","author":[{"family":"Walker","given":"Matthew"}],"issued":{"date-parts":[[2017]]},"publisher":"Scribner"}]');
    expect(r?.[0]).toMatchObject({ kind: 'book', title: 'Sleep', year: '2017', publisher: 'Scribner' });
    expect(parseCslJson('not json')).toBeNull();
  });

  it('adds references from pasted text, reporting failures', async () => {
    const fetchFn = vi.fn(async (url: string) =>
      url.includes('crossref') && url.includes('good') ? Response.json({ message: { type: 'journal-article', title: ['Good'], DOI: '10.1234/good' } }) : new Response('', { status: 404 }),
    );
    const { refs, errors } = await referencesFromText('10.1234/good\n10.1234/missing', fetchFn as unknown as typeof fetch);
    expect(refs.map((r) => r.title)).toEqual(['Good']);
    expect(errors).toEqual(['No record found for DOI 10.1234/missing.']);
    expect((await referencesFromText('hello')).errors[0]).toMatch(/No DOIs or BibTeX/);
    expect((await referencesFromText(BIB)).refs).toHaveLength(5);
  });
});

describe('citation styles', () => {
  const plain = (r: Reference, s: Poster['citationStyle']) => textOf(formatReference(r, s!));

  it('APA 7', () => {
    expect(plain(ARTICLE, 'apa')).toBe('LeCun, Y., Bengio, Y., & Hinton, G. (2015). Deep learning. Nature, 521(7553), 436–444. https://doi.org/10.1038/nature14539');
    expect(formatReference(ARTICLE, 'apa')).toContain('<i>Nature</i>, <i>521</i>(7553)');
    expect(plain(BOOK, 'apa')).toBe('Knuth, D. E. (1984). The TeXbook (2nd ed.). Addison-Wesley.');
    expect(plain(CHAPTER, 'apa')).toBe('Walker, M. (2019). Memory consolidation. In A. Smith (Ed.), Handbook of Sleep (pp. 10–20). Springer.');
    expect(plain({ ...ARTICLE, year: undefined }, 'apa')).toContain('(n.d.)');
  });

  it('Harvard', () => {
    expect(plain(ARTICLE, 'harvard')).toBe('LeCun, Y., Bengio, Y. and Hinton, G. (2015) ‘Deep learning’, Nature, 521(7553), pp. 436–444. doi:10.1038/nature14539.');
    expect(plain(BOOK, 'harvard')).toBe('Knuth, D. E. (1984) The TeXbook. 2nd edn. Reading, MA: Addison-Wesley.');
  });

  it('Chicago author-date', () => {
    expect(plain(ARTICLE, 'chicago')).toBe('LeCun, Yann, Yoshua Bengio, and Geoffrey Hinton. 2015. “Deep learning.” Nature 521 (7553): 436–444. https://doi.org/10.1038/nature14539.');
  });

  it('Vancouver', () => {
    expect(plain(ARTICLE, 'vancouver')).toBe('LeCun Y, Bengio Y, Hinton G. Deep learning. Nature. 2015;521(7553):436–444. doi:10.1038/nature14539');
    expect(plain(BOOK, 'vancouver')).toBe('Knuth DE. The TeXbook. 2nd ed. Reading, MA: Addison-Wesley; 1984.');
    const many = { ...ARTICLE, authors: Array.from({ length: 8 }, (_, k) => ({ family: `A${k}`, given: 'B' })) };
    expect(plain(many, 'vancouver')).toMatch(/^A0 B, A1 B, A2 B, A3 B, A4 B, A5 B, et al\./);
  });

  it('IEEE', () => {
    expect(plain(ARTICLE, 'ieee')).toBe('Y. LeCun, Y. Bengio, and G. Hinton, “Deep learning,” Nature, vol. 521, no. 7553, pp. 436–444, 2015. doi: 10.1038/nature14539.');
    expect(plain(BOOK, 'ieee')).toBe('D. E. Knuth, The TeXbook, 2nd ed. Reading, MA: Addison-Wesley, 1984.');
  });

  it('Nature', () => {
    expect(plain(ARTICLE, 'nature')).toBe('LeCun, Y., Bengio, Y. & Hinton, G. Deep learning. Nature 521, 436–444 (2015). https://doi.org/10.1038/nature14539');
    expect(formatReference(ARTICLE, 'nature')).toContain('<b>521</b>');
  });

  it('compresses runs of numbers', () => {
    expect(compressNumbers([3, 1, 2, 5, 7, 8])).toBe('1–3, 5, 7, 8');
    expect(compressNumbers([4, 4, 2], ',')).toBe('2,4');
  });
});

describe('citations on the poster', () => {
  const A = { ...ARTICLE, id: 'A' };
  const B = { ...BOOK, id: 'B' };
  const C = { ...CHAPTER, id: 'C' };

  function setup(style?: Poster['citationStyle']) {
    const p = poster([A, B, C], style);
    const col2 = makeElement('text', p, { x: 300, y: 100, html: `Later ${cite('A')} and ${cite('B', 'A')}` });
    const col1 = makeElement('text', p, { x: p.margin, y: 400, html: `First ${cite('C')}` });
    const list = makeElement('text', p, { refList: true, refTitle: 'References', x: p.margin, y: 1100, w: 800 });
    p.elements = [col2, col1, list];
    syncCitations(p);
    return { p, col1, col2, list };
  }

  it('numbers references in reading order (column by column)', () => {
    const { col1, col2, list } = setup();
    expect(textOf(col1.html!)).toBe('First [1]');
    expect(textOf(col2.html!)).toBe('Later [2] and [2, 3]');
    expect(textOf(list.html!)).toMatch(/^References1\. Walker M\..*2\. LeCun Y.*3\. Knuth DE/);
  });

  it('renumbers when a box moves or a citation is removed', () => {
    const { p } = setup();
    p.elements[1].x = 600; // move "First [C]" to the last column
    syncCitations(p);
    expect(textOf(p.elements[0].html!)).toBe('Later [1] and [1, 2]');
    expect(textOf(p.elements[1].html!)).toBe('First [3]');

    removeReference(p, 'A');
    syncCitations(p);
    expect(textOf(p.elements[0].html!)).toBe('Later and [1]');
    expect(p.references!.map((r) => r.id)).toEqual(['B', 'C']);
  });

  it('lists uncited references after cited ones and shows [?] for missing ones', () => {
    const p = poster([A, B]);
    p.elements = [makeElement('text', p, { html: `x ${cite('B')} ${cite('gone')}` }), makeElement('text', p, { refList: true, y: 900 })];
    syncCitations(p);
    expect(textOf(p.elements[0].html!)).toBe('x [1] [?]');
    expect(bibliography(p).ordered.map((r) => r.id)).toEqual(['B', 'A']);
    expect(citeCounts(p).get('gone')).toBe(1);
  });

  it('uses author–year markers and an alphabetical list for APA, with a/b for same author and year', () => {
    const A2 = { ...A, id: 'A2', title: 'Another paper' };
    const p = poster([B, A, A2], 'apa');
    p.elements = [makeElement('text', p, { html: `${cite('A', 'B')} ${cite('A2')}` }), makeElement('text', p, { refList: true, refTitle: '', y: 900 })];
    syncCitations(p);
    expect(textOf(p.elements[0].html!)).toBe('(Knuth, 1984; LeCun et al., 2015b) (LeCun et al., 2015a)');
    const list = textOf(p.elements[1].html!);
    expect(list.indexOf('Knuth')).toBeLessThan(list.indexOf('LeCun'));
    expect(list).toContain('(2015a). Another paper');
  });

  it('uses superscripts for Nature and IEEE-style [n] labels', () => {
    const p = poster([A, B], 'nature');
    p.elements = [makeElement('text', p, { html: `x${cite('A', 'B')}` })];
    syncCitations(p);
    expect(p.elements[0].html).toContain('<sup>1,2</sup>');
    p.citationStyle = 'ieee';
    expect(listHtml(p, bibliography(p))).toContain('[1] Y. LeCun');
  });

  it('leaves posters without citations untouched', () => {
    const p = poster([]);
    const el = makeElement('text', p, { html: 'Plain <b>text</b>' });
    p.elements = [el];
    syncCitations(p);
    expect(el.html).toBe('Plain <b>text</b>');
  });

  it('spots duplicates by DOI, BibTeX key or title and year', () => {
    expect(findDuplicate([A], { ...B, doi: '10.1038/NATURE14539' })).toBe(A);
    expect(findDuplicate([A], { ...B, id: 'x', title: 'Deep  Learning!', year: '2015' })).toBe(A);
    expect(findDuplicate([A], B)).toBeUndefined();
  });

  it('exports markers and the list to PowerPoint text', () => {
    const { list, col2 } = setup();
    expect(htmlToRuns(col2.html!).map((r) => r.text).join('')).toBe('Later [2] and [2, 3]');
    const runs = htmlToRuns(list.html!);
    expect(runs.filter((r) => r.options.breakLine).length).toBeGreaterThanOrEqual(3);
    expect(runs.map((r) => r.text).join('')).toContain('1. Walker M.');
    const apa = poster([A], 'apa');
    expect(htmlToRuns(listHtml(apa, bibliography(apa))).some((r) => r.options.italic && r.text === 'Nature')).toBe(true);
  });

  it('poster check flags citations without a list and uncited references', () => {
    const p = poster([A, B]);
    p.elements = [makeElement('text', p, { html: `Some result ${cite('A')}`, x: 50, y: 50 })];
    syncCitations(p);
    const ids = checkPoster(p, new Map(), new Set()).map((i) => i.id);
    expect(ids).toContain('cite-nolist');
    expect(ids).toContain('cite-unused');
  });
});
