import { type CardEffect } from '@/lib/modifiers';

import { allCardTypes, BUILTIN_CARD_TYPES, defaultTypeForCategory, effectsForType, isBuiltinType, SCAR_TYPE, typePickerGroups } from './card-types';

describe('card types (#246)', () => {
  describe('defaultTypeForCategory', () => {
    it('maps built-in categories to a sensible default', () => {
      expect(defaultTypeForCategory('inventory')).toBe('Item');
      expect(defaultTypeForCategory('notes')).toBe('Note');
      expect(defaultTypeForCategory('abilities')).toBe('Ability');
      expect(defaultTypeForCategory('wildshape')).toBe('Ability');
    });
    it('defaults a custom category to "Card"', () => {
      expect(defaultTypeForCategory('cat-xyz')).toBe('Card');
    });
  });

  describe('allCardTypes', () => {
    it('returns the built-ins when there are no custom types', () => {
      expect(allCardTypes()).toEqual(BUILTIN_CARD_TYPES);
    });
    it('puts custom types first and de-duplicates (case-insensitive)', () => {
      const out = allCardTypes(['Ritual', 'ability']); // "ability" collides with built-in "Ability"
      expect(out[0]).toBe('Ritual');
      expect(out.filter((t) => t.toLowerCase() === 'ability').length).toBe(1);
    });
    it('ignores blank custom types', () => {
      expect(allCardTypes(['  '])).toEqual(BUILTIN_CARD_TYPES);
    });
  });

  describe('isBuiltinType', () => {
    it('recognises built-ins, rejects custom', () => {
      expect(isBuiltinType('Weapon')).toBe(true);
      expect(isBuiltinType('weapon')).toBe(true);
      expect(isBuiltinType('Ritual')).toBe(false);
    });
  });

  describe('typePickerGroups', () => {
    it('omits the Custom group when there are no custom types', () => {
      expect(typePickerGroups().some((g) => g.label === 'Custom')).toBe(false);
    });
    it('leads with a Custom group of only non-built-in types', () => {
      const groups = typePickerGroups(['Ritual', 'Weapon']);
      expect(groups[0].label).toBe('Custom');
      expect(groups[0].types).toEqual(['Ritual']); // Weapon is built-in → excluded from Custom
    });
  });

  /**
   * v0.37.1: choosing the Scar type IS choosing the scar. Nothing on screen says so, so these say it
   * instead: the effect arrives with the type, leaves with it, and never touches anything else.
   */
  describe('effectsForType (Scar)', () => {
    const armor: CardEffect = { target: 'armorScore', delta: 2 };

    it('adds one scar when the type becomes Scar', () => {
      expect(effectsForType([], SCAR_TYPE)).toEqual([{ target: 'scar', delta: 1 }]);
    });
    it('takes the scar away when the type becomes anything else', () => {
      expect(effectsForType([{ target: 'scar', delta: 1 }], 'Note')).toEqual([]);
    });
    it('never adds a second scar to a card that is already a Scar', () => {
      const once = effectsForType([], SCAR_TYPE);
      expect(effectsForType(once, SCAR_TYPE)).toEqual([{ target: 'scar', delta: 1 }]);
    });
    it("leaves the player's own effects alone, both ways", () => {
      expect(effectsForType([armor], SCAR_TYPE)).toEqual([armor, { target: 'scar', delta: 1 }]);
      expect(effectsForType([armor, { target: 'scar', delta: 1 }], 'Item')).toEqual([armor]);
    });
    it('is case-insensitive about the type, like every other type check', () => {
      expect(effectsForType([], 'scar')).toEqual([{ target: 'scar', delta: 1 }]);
    });
    it('copes with a card that has no effects yet', () => {
      expect(effectsForType(undefined, 'Note')).toEqual([]);
    });
  });

  describe('the v0.37.1 types', () => {
    it('offers Attack in the arsenal, three more notes, and Scar with Experience', () => {
      expect(typePickerGroups().find((g) => g.label === 'Arsenal')?.types).toContain('Attack');
      const notes = typePickerGroups().find((g) => g.label === 'Notes')?.types ?? [];
      expect(notes).toEqual(expect.arrayContaining(['Lore', 'Flavor', 'Mystery']));
      expect(typePickerGroups().find((g) => g.label === 'Character')?.types).toContain(SCAR_TYPE);
    });
    it('treats them as built-ins, so they cannot be deleted', () => {
      for (const t of ['Attack', 'Lore', 'Flavor', 'Mystery', SCAR_TYPE]) expect(isBuiltinType(t)).toBe(true);
    });
  });
});
