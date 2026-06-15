import { allCardTypes, BUILTIN_CARD_TYPES, defaultTypeForCategory, isBuiltinType, typePickerGroups } from './card-types';

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
});
