import { describe, expect, it } from 'vitest';
import type { AuthorList } from '../../src/types';
import { authorListProblems, authorsHtml, emptyAuthorList, normalizeOrcid, numberAffiliations, removeAffiliation, validOrcid } from '../../src/lib/authors';

const list = (over: Partial<AuthorList> = {}): AuthorList => ({
  authors: [
    { name: 'Ana Silva', affiliations: [1, 0], presenter: true },
    { name: 'Ben Okafor', affiliations: [0], corresponding: true },
    { name: 'Chen Wei', affiliations: [2] },
  ],
  affiliations: ['Dept of Biology, Univ A', 'Institute B', 'Lab C'],
  email: 'ben@univ-a.edu',
  ...over,
});

describe('authors block', () => {
  it('numbers affiliations in order of first use', () => {
    const { order, number } = numberAffiliations(list());
    expect(order).toEqual([1, 0, 2]);
    expect(number.get(1)).toBe(1);
    expect(number.get(0)).toBe(2);
  });

  it('builds the author, affiliation and contact lines', () => {
    expect(authorsHtml(list())).toBe(
      '<u>Ana Silva</u><sup>1,2</sup>, Ben Okafor<sup>2,*</sup>, Chen Wei<sup>3</sup>' +
        '<br><i><sup>1</sup>Institute B; <sup>2</sup>Dept of Biology, Univ A; <sup>3</sup>Lab C</i>' +
        '<br>*Contact: ben@univ-a.edu',
    );
  });

  it('leaves out numbers when everyone shares one affiliation', () => {
    const html = authorsHtml({ authors: [{ name: 'A', affiliations: [0] }, { name: 'B', affiliations: [0] }], affiliations: ['Univ'] });
    expect(html).toBe('A, B<br><i>Univ</i>');
  });

  it('skips blank authors and unused or blank affiliations', () => {
    const html = authorsHtml({ authors: [{ name: ' A ', affiliations: [0, 1] }, { name: '  ', affiliations: [2] }], affiliations: ['', 'Used', 'Unused'] });
    expect(html).toBe('A<br><i>Used</i>');
    expect(authorsHtml(emptyAuthorList())).toBe('');
  });

  it('escapes HTML in names and institutions', () => {
    const html = authorsHtml({ authors: [{ name: '<img src=x onerror=alert(1)>', affiliations: [0] }], affiliations: ['R&D <Lab>'] });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).toContain('R&amp;D &lt;Lab&gt;');
  });

  it('adds ORCID iDs when switched on', () => {
    const l = list({ showOrcid: true });
    l.authors[0].orcid = 'https://orcid.org/0000-0002-1825-0097';
    expect(authorsHtml(l)).toContain('*Contact: ben@univ-a.edu · ORCID: Ana Silva 0000-0002-1825-0097');
    expect(authorsHtml(list())).not.toContain('ORCID');
  });

  it('checks ORCID iDs', () => {
    expect(normalizeOrcid('0000000218250097')).toBe('0000-0002-1825-0097');
    expect(validOrcid('0000-0002-1825-0097')).toBe(true);
    expect(validOrcid('0000-0002-1694-233X')).toBe(true);
    expect(validOrcid('0000-0002-1825-0098')).toBe(false);
    expect(normalizeOrcid('nope')).toBeNull();
  });

  it('reports problems in plain words', () => {
    const l = list({ email: 'not-an-email' });
    l.authors[2].affiliations = [];
    l.authors[0].orcid = '1234';
    const p = authorListProblems(l);
    expect(p).toContain('Chen Wei has no affiliation ticked.');
    expect(p.some((x) => x.includes("Ana Silva's ORCID"))).toBe(true);
    expect(p.some((x) => x.includes('email'))).toBe(true);
    expect(authorListProblems(list())).toEqual([]);
    expect(authorListProblems(emptyAuthorList())).toEqual(['Add at least one author name.']);
  });

  it('keeps ticks pointing at the right institution after removing one', () => {
    const l = removeAffiliation(list(), 0);
    expect(l.affiliations).toEqual(['Institute B', 'Lab C']);
    expect(l.authors.map((a) => a.affiliations)).toEqual([[0], [], [1]]);
  });
});
