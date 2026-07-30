import { CLASS_INVENTORY, authoredItemOptionId, itemOptionId } from './class-inventory-data';
import { lootById } from './loot-data';
import { startingItemCardId } from './starting-items';

describe('a starting item that exists in the archive', () => {
  // The point of the whole module: the guide's first choice is a real card with real rules text.
  it('resolves both potions to their consumable cards', () => {
    expect(startingItemCardId('a Minor Health Potion')).toBe('consumable-minor-health-potion');
    expect(startingItemCardId('a Minor Stamina Potion')).toBe('consumable-minor-stamina-potion');
  });

  it('gives the card its printed text rather than a repeat of its name', () => {
    expect(lootById(startingItemCardId('a Minor Health Potion')!)?.text).toBe('Clear 1d4 HP.');
  });

  it('ignores the leading article and the casing', () => {
    const id = startingItemCardId('a Minor Health Potion');
    expect(startingItemCardId('Minor Health Potion')).toBe(id);
    expect(startingItemCardId('the minor health POTION')).toBe(id);
  });

  // "Minor Stamina Potion Recipe" is a different card and must never stand in for the potion.
  it('does not match a card that merely contains the name', () => {
    expect(startingItemCardId('a Minor Stamina Potion')).not.toContain('recipe');
  });
});

describe('a starting item with no printed card', () => {
  it('resolves to nothing, so it is authored as a plain item', () => {
    expect(startingItemCardId('a sharpening stone')).toBeNull();
    expect(startingItemCardId('hand wraps from a mentor')).toBeNull();
  });

  it('keeps the id it has always had', () => {
    expect(itemOptionId('a sharpening stone')).toBe('inv-opt-a-sharpening-stone');
  });
});

describe('every class', () => {
  // A guide whose potion stopped resolving would silently go back to the old plain card.
  it('offers a first choice that is entirely archive cards', () => {
    for (const [cls, inv] of Object.entries(CLASS_INVENTORY)) {
      for (const name of inv.choices[0]) {
        expect(`${cls}: ${startingItemCardId(name)}`).toMatch(/consumable-/);
      }
    }
  });

  it('keeps the authored id available for heroes made before this', () => {
    expect(authoredItemOptionId('a Minor Health Potion')).toBe('inv-opt-a-minor-health-potion');
    expect(itemOptionId('a Minor Health Potion')).not.toBe(authoredItemOptionId('a Minor Health Potion'));
  });
});
