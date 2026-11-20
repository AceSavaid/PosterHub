import { describe, expect, it } from 'vitest';
import { countWords, findInHtml, findInPoster, htmlToText, replaceAllInPoster, replaceInHtml, searchableText, wordCount } from '../../src/lib/textTools';
import { checkPoster } from '../../src/lib/checks';
import { PALETTES, createPoster, makeElement, sizeFor } from '../../src/model';
import type { Poster } from '../../src/types';

function blank(): Poster {
  return createPoster({ name: 't', ...sizeFor('A0', 'portrait'), sizePreset: 'A0', columns: 3, palette: PALETTES[0], headingFont: 'Inter', bodyFont: 'Inter', template: 'blank' });
}

describe('reading text out of HTML', () => {
  it('decodes entities and turns block tags into line breaks', () => {
    expect(htmlToText('Cats &amp; dogs<br>are &lt;3&nbsp;fun')).toBe('Cats & dogs\nare <3 fun');
    expect(htmlToText('<p>One</p><p>Two</p>')).toBe('\nOne\n\nTwo\n');
    expect(htmlToText('a&#233;&#x41;')).toBe('aéA');
  });
});

describe('find', () => {
  it('finds text regardless of case unless asked', () => {
    expect(findInHtml('Cell cell CELL', 'cell')).toHaveLength(3);
    expect(findInHtml('Cell cell CELL', 'cell', { matchCase: true })).toHaveLength(1);
  });

  it('can match whole words only', () => {
    expect(findInHtml('cell cells subcell', 'cell')).toHaveLength(3);
    expect(findInHtml('cell cells subcell', 'cell', { wholeWord: true }).map((m) => m.start)).toEqual([0]);
  });

  it('treats the query as plain text, not a pattern', () => {
    expect(findInHtml('p < 0.05 and p<0.05x', 'p < 0.05')).toHaveLength(1);
    expect(findInHtml('a.b axb', 'a.b')).toHaveLength(1);
    expect(findInHtml('(n = 12)', '(n = 12)')).toHaveLength(1);
  });

  it('matches across formatting but never across a line break', () => {
    expect(findInHtml('the <b>quick</b> fox', 'the quick')).toHaveLength(1);
    expect(findInHtml('the<br>quick', 'the quick')).toHaveLength(0);
  });

  it('never matches inside markup', () => {
    expect(findInHtml('<span style="color:red">blue</span>', 'red')).toHaveLength(0);
    expect(findInHtml('<span style="color:red">blue</span>', 'blue')).toHaveLength(1);
  });

  it('ignores an empty query', () => {
    expect(findInHtml('anything', '')).toEqual([]);
    expect(findInHtml('anything', '   ')).toEqual([]);
  });

  it('gives a little context around each match', () => {
    const [m] = findInHtml('We measured the growth rate daily', 'growth');
    expect(m.before).toBe('We measured the ');
    expect(m.after).toBe(' rate daily');
  });
});

describe('replace', () => {
  it('keeps formatting around the replaced words', () => {
    const html = 'The <b>mice</b> were <i>fed</i> daily';
    expect(replaceInHtml(html, 'mice', 'rats').html).toBe('The <b>rats</b> were <i>fed</i> daily');
  });

  it('replaces a match that spans formatting, keeping the first part’s style', () => {
    const r = replaceInHtml('the <b>quick</b> fox', 'the quick', 'a slow');
    expect(r.count).toBe(1);
    expect(htmlToText(r.html)).toBe('a slow fox');
  });

  it('can replace just one match', () => {
    const r = replaceInHtml('a cat, a cat, a cat', 'cat', 'dog', {}, 1);
    expect(r).toEqual({ html: 'a cat, a dog, a cat', count: 1 });
  });

  it('escapes special characters in the replacement', () => {
    expect(replaceInHtml('x and y', 'and', '<&>').html).toBe('x &lt;&amp;&gt; y');
  });

  it('leaves untouched text exactly as it was', () => {
    const html = 'Tom&nbsp;&amp;&nbsp;Jerry<br>cat';
    expect(replaceInHtml(html, 'cat', 'dog').html).toBe('Tom&nbsp;&amp;&nbsp;Jerry<br>dog');
  });

  it('deletes when the replacement is empty', () => {
    expect(replaceInHtml('very very good', 'very ', '').html).toBe('good');
  });

  it('works across the whole poster', () => {
    const p = blank();
    p.elements = [
      makeElement('heading', p, { x: 20, y: 100, w: 250, h: 20, html: 'Methods' }),
      makeElement('text', p, { x: 20, y: 130, w: 250, h: 100, html: 'We sampled <b>mice</b>. More mice.' }),
      makeElement('shape', p, { x: 0, y: 0, w: 10, h: 10 }),
    ];
    expect(findInPoster(p, 'mice').map((m) => m.index)).toEqual([0, 1]);
    expect(replaceAllInPoster(p, 'mice', 'rats')).toBe(2);
    expect(p.elements[1].html).toBe('We sampled <b>rats</b>. More rats.');
  });

  it('lists matches column by column, top to bottom', () => {
    const p = blank();
    p.elements = [
      makeElement('text', p, { x: 300, y: 100, w: 250, h: 50, html: 'x second column' }),
      makeElement('text', p, { x: 20, y: 400, w: 250, h: 50, html: 'x first column, lower' }),
      makeElement('text', p, { x: 20, y: 100, w: 250, h: 50, html: 'x first column, top' }),
    ];
    expect(findInPoster(p, 'x').map((m) => m.elementId)).toEqual([p.elements[2].id, p.elements[1].id, p.elements[0].id]);
  });
});

describe('searchable text', () => {
  it('lines up with what the search sees, so matches can be highlighted on the page', () => {
    const html = 'a<b>b</b><br>c&nbsp;d';
    const t = searchableText(html);
    expect(t).toBe('ab\nc d');
    const [m] = findInHtml(html, 'c d');
    expect(t.slice(m.start, m.end)).toBe('c d');
  });
});

describe('word count', () => {
  it('counts words like a word processor', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('Hello, world!')).toBe(2);
    expect(countWords("It's a well-known p-value of 0.05 — really")).toBe(7);
    expect(countWords('one\ntwo   three')).toBe(3);
    expect(countWords('n = 1,200 at 3.5 mg')).toBe(5);
  });

  it('does not join words split by a line break in the markup', () => {
    const p = blank();
    p.elements = [makeElement('text', p, { html: 'one<br>two<div>three</div>' })];
    expect(wordCount(p).total).toBe(3);
  });

  it('groups text under the nearest header in the same column', () => {
    const p = blank();
    p.elements = [
      makeElement('title', p, { x: 20, y: 20, w: 800, h: 60, html: 'A study of things' }),
      makeElement('subtitle', p, { x: 20, y: 80, w: 800, h: 20, html: 'Ann Author' }),
      makeElement('heading', p, { x: 20, y: 150, w: 250, h: 20, html: 'Introduction' }),
      makeElement('text', p, { x: 20, y: 175, w: 250, h: 100, html: 'one two three' }),
      makeElement('heading', p, { x: 20, y: 400, w: 250, h: 20, html: 'Methods' }),
      makeElement('text', p, { x: 20, y: 425, w: 250, h: 100, html: 'four five' }),
      makeElement('heading', p, { x: 300, y: 150, w: 250, h: 20, html: 'Results' }),
      makeElement('text', p, { x: 300, y: 175, w: 250, h: 100, html: 'six' }),
      makeElement('text', p, { x: 600, y: 1100, w: 200, h: 30, html: 'Footer note here' }),
      makeElement('shape', p, { x: 0, y: 0, w: 10, h: 10 }),
    ];
    const wc = wordCount(p);
    expect(wc.sections.map((s) => [s.name, s.words])).toEqual([
      ['Title and authors', 6],
      ['Introduction', 4],
      ['Methods', 3],
      ['Results', 2],
      ['Other text', 3],
    ]);
    expect(wc.total).toBe(18);
    expect(wc.sections[1].elementIds).toEqual([p.elements[2].id, p.elements[3].id]);
  });

  it('warns in the poster check when over the word limit', () => {
    const p = blank();
    p.elements = [makeElement('text', p, { x: 20, y: 20, w: 300, h: 1000, html: 'one two three four five' })];
    expect(checkPoster(p).some((i) => i.id === 'word-limit')).toBe(false);
    p.wordLimit = 3;
    const issue = checkPoster(p).find((i) => i.id === 'word-limit');
    expect(issue?.title).toBe('2 words over the limit');
    p.wordLimit = 10;
    expect(checkPoster(p).some((i) => i.id === 'word-limit')).toBe(false);
  });
});
