import { colorRank, type SortEntry, sortEntries, sortWithinSelection, titleKey } from './card-sort';

const e = (id: string, p: Partial<SortEntry> = {}): SortEntry => ({ id, title: id, type: '', group: '', length: 0, color: null, ...p });

describe('colorRank', () => {
  it('puts hues in one band, greys in the next, and nothing at all last', () => {
    expect(colorRank('#C81B18').band).toBe(0);
    expect(colorRank('#808080').band).toBe(1);
    expect(colorRank(null).band).toBe(2);
  });
  it('reads the wheel with red at the start and blue past green', () => {
    const red = colorRank('#FF0000').hue, green = colorRank('#00FF00').hue, blue = colorRank('#0000FF').hue;
    expect(red).toBeCloseTo(0, 3);
    expect(green).toBeGreaterThan(red);
    expect(blue).toBeGreaterThan(green);
  });
  it('treats a near-white and a near-black as greys, told apart by brightness', () => {
    expect(colorRank('#FAF8F2').band).toBe(1);
    expect(colorRank('#0B0E13').band).toBe(1);
    expect(colorRank('#FAF8F2').light).toBeGreaterThan(colorRank('#0B0E13').light);
  });
  it('accepts a three-digit hex and ignores a missing hash', () => {
    expect(colorRank('#f00').hue).toBeCloseTo(colorRank('FF0000').hue, 5);
  });
  it('calls nonsense no colour rather than throwing', () => {
    expect(colorRank('rebeccapurple').band).toBe(2);
    expect(colorRank('#12345').band).toBe(2);
  });
});

describe('titleKey', () => {
  it('files a title without its article, its case or its accents', () => {
    expect(titleKey('The Broadsword')).toBe('broadsword');
    expect(titleKey('  a Rune Ward ')).toBe('rune ward');
    expect(titleKey('Élan')).toBe('elan');
  });
});

describe('sortEntries', () => {
  it('orders by title both ways', () => {
    const list = [e('c', { title: 'Cinder' }), e('a', { title: 'Adept' }), e('b', { title: 'Blink' })];
    expect(sortEntries(list, 'title', 'asc').map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(sortEntries(list, 'title', 'desc').map((x) => x.id)).toEqual(['c', 'b', 'a']);
  });

  it('orders by length, and a card with no description is a real zero rather than a blank', () => {
    const list = [e('long', { length: 400 }), e('none', { length: 0 }), e('mid', { length: 40 })];
    expect(sortEntries(list, 'length', 'asc').map((x) => x.id)).toEqual(['none', 'mid', 'long']);
    expect(sortEntries(list, 'length', 'desc').map((x) => x.id)).toEqual(['long', 'mid', 'none']);
  });

  it('orders categories the way the type picker lists them, not alphabetically', () => {
    const list = [e('n', { group: 'Notes', type: 'Note' }), e('a', { group: 'Arsenal', type: 'Ability' }), e('c', { group: 'Character', type: 'Scar' }), e('i', { group: 'Inventory', type: 'Item' })];
    expect(sortEntries(list, 'group', 'asc').map((x) => x.id)).toEqual(['a', 'i', 'n', 'c']);
  });

  it('breaks a category tie on the type name, so one family stays together', () => {
    const list = [e('w', { group: 'Arsenal', type: 'Weapon' }), e('a', { group: 'Arsenal', type: 'Ability' })];
    expect(sortEntries(list, 'group', 'asc').map((x) => x.id)).toEqual(['a', 'w']);
  });

  it('sorts colours by hue and then by brightness', () => {
    const list = [
      e('darkred', { color: '#5C1010' }),
      e('blue', { color: '#1E3A8A' }),
      e('brightred', { color: '#FF4040' }),
    ];
    expect(sortEntries(list, 'color', 'asc').map((x) => x.id)).toEqual(['darkred', 'brightred', 'blue']);
  });

  it('keeps greys after the hues and colourless cards after everything, in BOTH directions', () => {
    const list = [e('grey', { color: '#8A8A8A' }), e('none'), e('red', { color: '#C81B18' })];
    expect(sortEntries(list, 'color', 'asc').map((x) => x.id)).toEqual(['red', 'grey', 'none']);
    expect(sortEntries(list, 'color', 'desc').map((x) => x.id)[2]).toBe('none');
  });

  it('is deterministic when the key cannot tell two cards apart', () => {
    const list = [e('z', { title: 'Same', length: 5 }), e('a', { title: 'Same', length: 5 })];
    expect(sortEntries(list, 'length', 'asc').map((x) => x.id)).toEqual(['a', 'z']);
    expect(sortEntries(list, 'length', 'desc').map((x) => x.id)).toEqual(['a', 'z']);
  });

  it('does not mutate what it was given', () => {
    const list = [e('b'), e('a')];
    sortEntries(list, 'title', 'asc');
    expect(list.map((x) => x.id)).toEqual(['b', 'a']);
  });
});

describe('sortWithinSelection', () => {
  const deck = ['1', '2', '3', '4', '5'];

  it('deals the sorted cards back into the slots the selection already held', () => {
    const entries = [e('4', { title: 'Apple' }), e('2', { title: 'Cherry' }), e('1', { title: 'Banana' })];
    // slots 0, 1 and 3 are selected → they take Apple, Banana, Cherry; 3 and 5 never move.
    expect(sortWithinSelection(deck, entries, 'title', 'asc')).toEqual(['4', '1', '3', '2', '5']);
  });

  it('leaves the deck alone when fewer than two cards are selected', () => {
    expect(sortWithinSelection(deck, [e('3')], 'title', 'asc')).toEqual(deck);
    expect(sortWithinSelection(deck, [], 'title', 'asc')).toEqual(deck);
  });

  it('ignores a selected card that is not in this deck', () => {
    const out = sortWithinSelection(deck, [e('9'), e('2'), e('1')], 'title', 'desc');
    expect(out).toEqual(['2', '1', '3', '4', '5']);
  });

  it('returns the same ids, never a duplicate and never a loss', () => {
    const entries = deck.map((id) => e(id, { length: Number(id) }));
    const out = sortWithinSelection(deck, entries, 'length', 'desc');
    expect([...out].sort()).toEqual([...deck].sort());
  });
});
