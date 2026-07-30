import { destinationOrder } from './carousel-categories';

/**
 * The destination prompt's ordering. The suggested category has to lead, because that is the one tap
 * the common case needs, and Favorites has to be absent, because it is a mirror of other decks and a
 * card cannot be created into it.
 */
describe('orderForPicker', () => {
  const CATS = ['abilities', 'inventory', 'notes', 'archive'];

  it('leads with the suggested category, keeping the rest in order', () => {
    expect(destinationOrder(CATS, 'notes')).toEqual(['notes', 'abilities', 'inventory', 'archive']);
  });

  it('leaves the order alone when the suggestion is already first', () => {
    expect(destinationOrder(CATS, 'abilities')).toEqual(CATS);
  });

  it('leaves the order alone when there is no suggestion', () => {
    expect(destinationOrder(CATS)).toEqual(CATS);
  });

  it('ignores a suggestion that is not on offer rather than adding it', () => {
    expect(destinationOrder(CATS, 'wildshape')).toEqual(CATS);
  });

  it('never offers Favorites, which is a mirror of other decks', () => {
    expect(destinationOrder([...CATS, 'favorites'])).not.toContain('favorites');
    expect(destinationOrder([...CATS, 'favorites'], 'favorites')).not.toContain('favorites');
  });

  it('keeps custom categories, which are ordinary destinations', () => {
    expect(destinationOrder([...CATS, 'cat-spells'], 'cat-spells')[0]).toBe('cat-spells');
  });
});
