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

  it('keeps cards at true playing-card size on US Letter', () => {
    const html = cardsPdfHtml([card(1)]);
    expect(html).toContain('size: letter');
    expect(html).toContain('width: 2.5in; height: 3.5in');
    expect(html).toContain('@page { size: letter; margin: 0; }'); // our margins, not the dialog's
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
