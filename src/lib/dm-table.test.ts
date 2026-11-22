import { arrangeDecks, cleanDmTable, FEAR_MAX, removeDeck } from './dm-table';
import { FAVORITES_CATEGORY } from './favorites';

const card = (id: string) => ({ id });
const base = { 'dm-foes': [card('a'), card('b'), card('c')], 'dm-party': [card('p')] };
const ids = (list: { id: string }[]) => list.map((c) => c.id);

describe('the DM table', () => {
  it('reads nothing, or nonsense, as an empty table with Fear off', () => {
    for (const raw of [undefined, null, 'x', [], { fear: 'lots', decks: 4, tokens: [] }]) {
      expect(cleanDmTable(raw)).toMatchObject({ category: 'dm-foes', favorites: [], decks: [], fear: { on: false, n: 0 } });
    }
  });

  it('keeps the party beside the screen until it is put away', () => {
    expect(cleanDmTable({}).partyBeside).toBe(true);
    expect(cleanDmTable({ partyBeside: false }).partyBeside).toBe(false);
  });

  it('holds Fear between none and twelve', () => {
    expect(cleanDmTable({ fear: { n: 40 } }).fear.n).toBe(FEAR_MAX);
    expect(cleanDmTable({ fear: { n: -3 } }).fear.n).toBe(0);
  });

  it('puts a moved card in its deck, and back home once that deck is gone', () => {
    const t = cleanDmTable({ decks: [{ key: 'own-1', label: 'Boss night' }], moved: { b: 'own-1' } });
    const out = arrangeDecks(base, t);
    expect(ids(out['own-1'])).toEqual(['b']);
    expect(ids(out['dm-foes'])).toEqual(['a', 'c']);
    expect(ids(arrangeDecks(base, removeDeck(t, 'own-1'))['dm-foes'])).toEqual(['a', 'b', 'c']);
  });

  it('keeps an order, with cards it has not met after it', () => {
    expect(ids(arrangeDecks(base, cleanDmTable({ order: { 'dm-foes': ['c', 'a'] } }))['dm-foes'])).toEqual(['c', 'a', 'b']);
  });

  it('mirrors favourites and skips ones that are gone', () => {
    const out = arrangeDecks(base, cleanDmTable({ favorites: ['p', 'missing', 'a'] }));
    expect(ids(out[FAVORITES_CATEGORY])).toEqual(['p', 'a']);
    expect(ids(out['dm-foes'])).toEqual(['a', 'b', 'c']);
  });
});
