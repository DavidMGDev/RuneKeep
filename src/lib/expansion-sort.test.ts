import { CARDS_PER_PAGE, paginate, sectionOf, sortExpansionCards } from './expansion-sort';
import type { LibraryCard, LibraryContentType } from './library';

const c = (contentType: LibraryContentType, title: string, over: Partial<LibraryCard> = {}): LibraryCard => ({
  id: `${contentType}-${title}`, contentType, title, text: '', imageUri: null, ...over,
});

describe('sortExpansionCards', () => {
  it('leads with the class, because everything else points at it', () => {
    const out = sortExpansionCards([c('generic', 'A note'), c('class', 'Warden'), c('inventory', 'A rope')]);
    expect(out[0].title).toBe('Warden');
  });

  it('groups domain cards by their domain and orders them by LEVEL', () => {
    const out = sortExpansionCards([
      c('domain', 'Pyre 3', { domain: 'Pyre', level: 3 }),
      c('domain', 'Tide 1', { domain: 'Tide', level: 1 }),
      c('domain', 'Pyre 1', { domain: 'Pyre', level: 1 }),
      c('domain', 'Pyre 10', { domain: 'Pyre', level: 10 }),
    ]);
    expect(out.map((x) => x.title)).toEqual(['Pyre 1', 'Pyre 3', 'Pyre 10', 'Tide 1']);
  });

  it('orders a subclass family by tier', () => {
    const out = sortExpansionCards([
      c('subclass', 'Bramble Mastery', { subclass: 'Bramble', tier: 3 }),
      c('subclass', 'Bramble Foundation', { subclass: 'Bramble', tier: 1 }),
      c('subclass', 'Bramble Specialization', { subclass: 'Bramble', tier: 2 }),
    ]);
    expect(out.map((x) => x.tier)).toEqual([1, 2, 3]);
  });

  it('keeps a domain and its cards apart, with the domain first', () => {
    const out = sortExpansionCards([c('domain', 'A card', { domain: 'Pyre', level: 1 }), c('customDomain', 'Pyre')]);
    expect(out[0].contentType).toBe('customDomain');
  });

  it('falls back to the title, so two runs never disagree', () => {
    const twice = () => sortExpansionCards([c('generic', 'Beta'), c('generic', 'Alpha'), c('generic', 'Gamma')]).map((x) => x.title);
    expect(twice()).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(twice()).toEqual(twice());
  });

  it('does not mutate what it was given', () => {
    const cards = [c('generic', 'B'), c('class', 'A')];
    const before = cards.map((x) => x.id);
    sortExpansionCards(cards);
    expect(cards.map((x) => x.id)).toEqual(before);
  });
});

describe('sectionOf', () => {
  it('names a domain card by its domain', () => {
    expect(sectionOf(c('domain', 'x', { domain: 'Pyre' }))).toBe('Pyre cards');
  });

  it('never collides a domain with its own cards', () => {
    expect(sectionOf(c('customDomain', 'Pyre'))).not.toBe(sectionOf(c('domain', 'x', { domain: 'Pyre' })));
  });

  it('names a subclass by the class it belongs to', () => {
    expect(sectionOf(c('subclass', 'Bramble', { className: 'Warden' }))).toBe('Warden subclasses');
  });

  it('says something for a card that belongs to nothing', () => {
    expect(sectionOf(c('subclass', 'Loose'))).toBe('Unattached subclasses');
  });
});

describe('paginate', () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => c('generic', `Card ${String(i).padStart(2, '0')}`));

  it('cuts the SORTED list, so a page means something', () => {
    const pages = paginate([c('generic', 'Z'), c('class', 'A')], 1);
    expect(pages[0][0].title).toBe('A');
  });

  it('fills each page before starting the next', () => {
    const pages = paginate(many(CARDS_PER_PAGE + 1));
    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveLength(CARDS_PER_PAGE);
    expect(pages[1]).toHaveLength(1);
  });

  it('gives an empty expansion ONE empty page, so the pager always has something to draw', () => {
    expect(paginate([])).toEqual([[]]);
  });

  it('loses nothing', () => {
    const cards = many(23);
    expect(paginate(cards).flat()).toHaveLength(23);
  });
});
