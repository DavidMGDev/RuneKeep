/**
 * v0.14.0: how a custom subclass's three tier cards LINK into one family, and how an incomplete family
 * is detected. Authors overwhelmingly name all three cards the same and never touch the family field,
 * so the title fallback is the load-bearing behavior here.
 */
import { incompleteSubclasses, type LibraryCard, subclassFamilyKey, subclassFamilyName } from './library';

const card = (over: Partial<LibraryCard>): LibraryCard => ({
  id: 'c1',
  contentType: 'subclass',
  title: 'Blood Mage',
  text: '',
  imageUri: null,
  ...over,
});

describe('subclassFamilyKey', () => {
  it('links cards that share a title, ignoring case and extra whitespace', () => {
    const a = card({ id: 'a', title: 'Blood Mage', tier: 1 });
    const b = card({ id: 'b', title: 'blood   mage', tier: 2 });
    expect(subclassFamilyKey(a)).toBe(subclassFamilyKey(b));
  });

  it('prefers the explicit family field over the title, so the three cards may be titled differently', () => {
    const a = card({ id: 'a', title: 'Crimson Awakening', subclass: 'Blood Mage', tier: 1 });
    const b = card({ id: 'b', title: 'Sanguine Mastery', subclass: 'blood mage', tier: 3 });
    expect(subclassFamilyKey(a)).toBe(subclassFamilyKey(b));
  });

  it('keeps same-named subclasses of DIFFERENT classes apart', () => {
    const a = card({ id: 'a', title: 'Sentinel', className: 'guardian' });
    const b = card({ id: 'b', title: 'Sentinel', className: 'ranger' });
    expect(subclassFamilyKey(a)).not.toBe(subclassFamilyKey(b));
  });

  it('names the family by the explicit field when present, else the title', () => {
    expect(subclassFamilyName(card({ title: 'Crimson', subclass: 'Blood Mage' }))).toBe('Blood Mage');
    expect(subclassFamilyName(card({ title: 'Blood Mage' }))).toBe('Blood Mage');
  });
});

describe('incompleteSubclasses', () => {
  const trio = (titles: [string, 1 | 2 | 3][]) => titles.map(([title, tier], i) => card({ id: `c${i}`, title, tier }));

  it('reports nothing for a complete family linked by title alone', () => {
    expect(incompleteSubclasses(trio([['Blood Mage', 1], ['Blood Mage', 2], ['Blood Mage', 3]]))).toEqual([]);
  });

  it('names the family and every missing tier', () => {
    expect(incompleteSubclasses(trio([['Blood Mage', 1]]))).toEqual([{ name: 'Blood Mage', missing: ['Specialization', 'Mastery'] }]);
  });

  it('treats a card with no tier as the Foundation', () => {
    expect(incompleteSubclasses([card({ id: 'a', title: 'Blood Mage' })])).toEqual([{ name: 'Blood Mage', missing: ['Specialization', 'Mastery'] }]);
  });

  it('reports each incomplete family separately and skips the complete ones', () => {
    const cards = [
      ...trio([['Blood Mage', 1], ['Blood Mage', 2], ['Blood Mage', 3]]),
      card({ id: 'x', title: 'Stormcaller', tier: 1 }),
      card({ id: 'y', title: 'Stormcaller', tier: 3 }),
    ];
    expect(incompleteSubclasses(cards)).toEqual([{ name: 'Stormcaller', missing: ['Specialization'] }]);
  });

  it('ignores non-subclass cards entirely', () => {
    expect(incompleteSubclasses([card({ contentType: 'ancestry', title: 'Ribbet' })])).toEqual([]);
    expect(incompleteSubclasses([])).toEqual([]);
  });
});
