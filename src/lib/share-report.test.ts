import { canSharePack, reportHeading, shareReport } from './share-report';
import type { LibraryCard, LibraryContentType } from './library';

const card = (id: string, contentType: LibraryContentType, title: string, over: Partial<LibraryCard> = {}): LibraryCard =>
  ({ id, contentType, title, text: '', imageUri: null, ...over });

const GOOD_CLASS = {
  role: 'base' as const,
  startingEvasion: 10,
  startingHp: 6,
  hopeFeature: { name: '', text: '' },
  summary: 'Keepers of the old borders.',
  domains: ['sage', 'valor'],
  fixedItemIds: ['i1'],
  choiceAItemIds: ['i2', 'i3'],
  choiceBItemIds: ['i4', 'i5'],
};

const completeClass = () => [
  card('k', 'class', 'Warden', { classSpec: GOOD_CLASS }),
  card('s', 'subclass', 'Bramble', { className: 'Warden', tier: 1 }),
  card('f', 'feature', 'Mark', { className: 'Warden' }),
];

describe('shareReport', () => {
  it('says a finished pack is ready', () => {
    const r = shareReport({ cards: completeClass() });
    expect(r.ok).toBe(true);
    expect(r.count).toBe(0);
  });

  it('will not call an EMPTY pack ready, because there is nothing to send', () => {
    expect(shareReport({ cards: [] }).ok).toBe(false);
  });

  it('groups problems UNDER THE CARD, naming it', () => {
    const r = shareReport({ cards: [card('x', 'domain', 'Ember', { level: 1 })] });
    expect(r.cards[0].title).toBe('Ember');
    expect(r.cards[0].problems.join(' ')).toContain('which domain');
  });

  it('names an untitled card by its position, so two of them can be told apart', () => {
    const r = shareReport({ cards: [card('a', 'generic', ''), card('b', 'generic', '')] });
    expect(r.cards.map((c) => c.title)).toEqual(['Untitled card 1', 'Untitled card 2']);
  });

  it('says what KIND a card is, for the same reason', () => {
    expect(shareReport({ cards: [card('a', 'domain', '')] }).cards[0].kind).toBe('Domain card');
  });

  it('reports a class card part by part rather than as one failure', () => {
    const r = shareReport({ cards: [card('k', 'class', 'Warden', { classSpec: { ...GOOD_CLASS, summary: '', fixedItemIds: [] } })] });
    const said = r.cards[0].problems.join(' ');
    expect(said).toContain('summary');
    expect(said).toContain('everyone receives');
    expect(r.cards[0].problems.length).toBeGreaterThan(2);
  });

  it('tells a domain WHICH LEVELS it still needs', () => {
    const r = shareReport({ cards: [card('d', 'customDomain', 'Pyre')] });
    expect(r.cards[0].problems[0]).toMatch(/1, 2, 3/);
  });

  it('counts a domain that is nearly done, rather than repeating itself', () => {
    const cards = [
      card('d', 'customDomain', 'Pyre'),
      ...Array.from({ length: 10 }, (_, i) => card(`c${i}`, 'domain', `Card ${i}`, { domain: 'Pyre', level: i + 1 })),
    ];
    const r = shareReport({ cards });
    expect(r.cards[0].problems[0]).toContain('10 of 11');
  });

  it('catches a domain card with no domain and no level', () => {
    const said = shareReport({ cards: [card('x', 'domain', 'Ember')] }).cards[0].problems.join(' ');
    expect(said).toContain('which domain');
    expect(said).toContain('level');
  });

  it('catches a subclass pointing at nothing', () => {
    expect(shareReport({ cards: [card('s', 'subclass', 'Bramble')] }).cards[0].problems.join(' ')).toContain('which class');
  });

  it('catches an image card with no image', () => {
    expect(shareReport({ cards: [card('i', 'generic', 'A face', { fullImage: true })] }).cards[0].problems.join(' ')).toContain('no image');
  });

  it('counts every problem, not every card', () => {
    const r = shareReport({ cards: [card('a', 'domain', '')] });
    expect(r.count).toBe(r.cards[0].problems.length);
  });
});

describe('canSharePack', () => {
  it('is the SAME answer the report gives, which is the point of it', () => {
    const cards = completeClass();
    expect(canSharePack({ cards })).toBe(shareReport({ cards }).ok);
    expect(canSharePack({ cards: [card('a', 'domain', '')] })).toBe(false);
  });
});

describe('reportHeading', () => {
  it('says the size of the job', () => {
    expect(reportHeading(shareReport({ cards: completeClass() }))).toBe('Ready to share');
    expect(reportHeading(shareReport({ cards: [card('a', 'domain', 'X')] }))).toContain('on 1 card');
  });
});
