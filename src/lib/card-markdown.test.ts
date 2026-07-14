import { composeSections, hasMarkdown, parseCardMarkdown, parseInline } from './card-markdown';

describe('composeSections (v0.10.2)', () => {
  it('returns empty for no sections', () => {
    expect(composeSections()).toBe('');
    expect(composeSections([])).toBe('');
  });
  it('composes name + body as bold lead-in, blank-line separated', () => {
    expect(composeSections([{ name: 'Tough', body: 'You are hardy.' }, { name: 'Keen', body: 'You notice things.' }])).toBe('**Tough.** You are hardy.\n\n**Keen.** You notice things.');
  });
  it('handles name-only and body-only sections, dropping empty ones', () => {
    expect(composeSections([{ name: 'Lead', body: '' }, { body: 'plain' }, { body: '   ' }])).toBe('**Lead.**\n\nplain');
  });
});

describe('parseInline', () => {
  it('leaves plain text as one span', () => {
    expect(parseInline('just words')).toEqual([{ text: 'just words' }]);
  });
  it('parses **bold**', () => {
    expect(parseInline('a **b** c')).toEqual([{ text: 'a ' }, { text: 'b', bold: true }, { text: ' c' }]);
  });
  it('parses *italic* and _italic_', () => {
    expect(parseInline('*x*')).toEqual([{ text: 'x', italic: true }]);
    expect(parseInline('_y_')).toEqual([{ text: 'y', italic: true }]);
  });
  it('combines bold + italic', () => {
    expect(parseInline('**_z_**')).toEqual([{ text: 'z', bold: true, italic: true }]);
  });
  it('degrades unbalanced markers without throwing', () => {
    expect(parseInline('a **b')).toEqual([{ text: 'a ' }, { text: 'b', bold: true }]);
  });
});

describe('parseCardMarkdown', () => {
  it('returns a single paragraph for plain text', () => {
    expect(parseCardMarkdown('hello world')).toEqual([{ kind: 'p', spans: [{ text: 'hello world' }] }]);
  });
  it('splits paragraphs on a blank line', () => {
    const b = parseCardMarkdown('one\n\ntwo');
    expect(b.map((x) => x.kind)).toEqual(['p', 'p']);
  });
  it('joins consecutive plain lines into one paragraph', () => {
    expect(parseCardMarkdown('a\nb')).toEqual([{ kind: 'p', spans: [{ text: 'a b' }] }]);
  });
  it('groups bullet lines into a ul', () => {
    const b = parseCardMarkdown('- one\n- two');
    expect(b).toEqual([{ kind: 'ul', items: [[{ text: 'one' }], [{ text: 'two' }]] }]);
  });
  it('groups numbered lines into an ol with their numbers', () => {
    const b = parseCardMarkdown('1. first\n2. second');
    expect(b).toEqual([
      { kind: 'ol', items: [{ n: 1, spans: [{ text: 'first' }] }, { n: 2, spans: [{ text: 'second' }] }] },
    ]);
  });
  it('does not treat *italic* at line start as a bullet', () => {
    expect(parseCardMarkdown('*emph*')).toEqual([{ kind: 'p', spans: [{ text: 'emph', italic: true }] }]);
  });
  it('mixes paragraphs and lists', () => {
    const b = parseCardMarkdown('intro\n- a\n- b\noutro');
    expect(b.map((x) => x.kind)).toEqual(['p', 'ul', 'p']);
  });
});

describe('hasMarkdown', () => {
  it('is false for plain text and empty', () => {
    expect(hasMarkdown('just a normal sentence.')).toBe(false);
    expect(hasMarkdown('')).toBe(false);
    expect(hasMarkdown(null)).toBe(false);
  });
  it('is true for bold/italic/lists', () => {
    expect(hasMarkdown('a **b**')).toBe(true);
    expect(hasMarkdown('a *b*')).toBe(true);
    expect(hasMarkdown('- item')).toBe(true);
    expect(hasMarkdown('1. item')).toBe(true);
  });
});
