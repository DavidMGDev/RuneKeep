import { cardsPdfHtml, type PdfCard } from './card-pdf';

const card = (n: number): PdfCard => ({ title: `Card ${n}`, typeLabel: 'Ability', body: 'Does a thing.' });

describe('printing cards, nine to a sheet (v0.34.8)', () => {
  const pages = (html: string) => html.split('class="page"').length - 1;
  const body = (html: string) => html.slice(html.indexOf('<body>'));
  const slots = (html: string) => html.split('class="c"').length - 1 + (html.split('class="c blank"').length - 1);

  it('lays nine cards on one page', () => {
    const html = cardsPdfHtml(Array.from({ length: 9 }, (_, i) => card(i)));
    expect(pages(html)).toBe(1);
    expect(html).toContain('Card 8');
    expect(body(html)).not.toContain('blank');
  });

  it('starts a new page at the tenth card, and pads the last one', () => {
    const html = cardsPdfHtml(Array.from({ length: 10 }, (_, i) => card(i)));
    expect(pages(html)).toBe(2);
    expect(slots(html)).toBe(18); // every page keeps a full 3x3 so the grid never reflows
  });

  it('keeps a card 5:7 on US Letter, inside a margin a printer will not clip', () => {
    const html = cardsPdfHtml([card(1)]);
    expect(html).toContain('size: letter');
    expect(html).toContain('@page { size: letter; margin: 0; }'); // our margins, not the dialog's
    // v0.35: the margins are fixed and the card is what fits inside them. It stays 5:7, stays close
    // to true size, and nine still fit; the exact number is derived, so it is checked rather than
    // written down twice.
    const [, w, h] = /\.c \{ width: ([\d.]+)in; height: ([\d.]+)in/.exec(html) ?? [];
    const cw = Number(w);
    const ch = Number(h);
    expect(ch / cw).toBeCloseTo(7 / 5, 2);
    expect(cw).toBeGreaterThan(2.2); // still recognisably a playing card
    expect(cw).toBeLessThanOrEqual(2.5); // never larger than the real thing
    expect(3 * cw + 2 * 0.2 + 2 * 0.5).toBeLessThanOrEqual(8.5); // three across, inside a half inch
    expect(3 * ch + 2 * 0.2 + 2 * 0.2).toBeLessThanOrEqual(11); // three down
    expect(html).toContain('gap: 0.2in'); // twice v0.34.8's, per the owner
  });

  it('draws a card WITH a bitmap as the whole face, and nothing over it', () => {
    const html = cardsPdfHtml([{ ...card(1), image: 'data:image/png;base64,AAAA' }]);
    expect(html).toContain('class="face" src="data:image/png;base64,AAAA"');
    expect(body(html)).not.toContain('plaque'); // the picture IS the card; nothing is drawn over it
  });

  it('falls back to a laid-out card when there is no bitmap (the browser case)', () => {
    const html = cardsPdfHtml([{ title: 'Whirlwind', typeLabel: 'Domain', body: '**Bold** and *thin*.\n- a bullet', color: '#334455' }]);
    expect(html).toContain('Whirlwind');
    expect(html).toContain('background:#334455');
    expect(html).toContain('Bold and thin.'); // markdown markers are stripped, not printed
    expect(html).toContain('• a bullet');
  });

  it('escapes anything a player typed', () => {
    const html = cardsPdfHtml([{ title: '<script>x</script>', typeLabel: 'Card', body: 'a & b' }]);
    expect(html).not.toContain('<script>');
    expect(html).toContain('a &amp; b');
  });

  it('an empty selection still produces a valid single page', () => {
    expect(pages(cardsPdfHtml([]))).toBe(1);
  });
});
