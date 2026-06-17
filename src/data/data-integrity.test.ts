/**
 * Data-layer integrity (#300 phase 3). Guards the move of all static game data into src/data/:
 * ids stay unique, every accessor round-trips, cross-references resolve, and the tier-1 starter
 * lists really are tier 1. A bad data edit fails here instead of in the app.
 */
import { CATALOG, cardById, type CatalogKind } from '@/data/catalog';
import { CATALOG_EFFECTS } from '@/data/catalog-effects';
import {
  ALL_ARMOR,
  ALL_WEAPONS,
  armorById,
  PRIMARY_WEAPONS,
  SECONDARY_WEAPONS,
  TIER1_ARMOR,
  weaponById,
} from '@/data/equipment-data';
import { ALL_LOOT, lootById } from '@/data/loot-data';

const duplicates = (ids: string[]): string[] => ids.filter((id, i) => ids.indexOf(id) !== i);

describe('catalog', () => {
  it('has unique card ids', () => {
    expect(duplicates(CATALOG.map((c) => c.id))).toEqual([]);
  });

  it('cardById round-trips every entry and returns undefined for unknowns', () => {
    for (const c of CATALOG) expect(cardById(c.id)).toBe(c);
    expect(cardById('does-not-exist')).toBeUndefined();
  });

  it('every card has art handles, a label, and a known kind', () => {
    // require() yields a numeric module id under Metro but an object stub under jest — so assert the
    // handle is present, not its runtime type.
    const kinds: CatalogKind[] = ['domain', 'ancestry', 'community', 'subclass'];
    for (const c of CATALOG) {
      expect(c.source != null).toBe(true);
      expect(c.thumb != null).toBe(true);
      expect(c.label.length).toBeGreaterThan(0);
      expect(kinds).toContain(c.kind);
    }
  });
});

describe('catalog effects', () => {
  it('every effect key references a real catalog card', () => {
    const unresolved = Object.keys(CATALOG_EFFECTS).filter((id) => !cardById(id));
    expect(unresolved).toEqual([]);
  });

  it('every effect names a target', () => {
    for (const effects of Object.values(CATALOG_EFFECTS))
      for (const e of effects) expect(e.target.length).toBeGreaterThan(0);
  });
});

describe('equipment', () => {
  it('weapon and armor ids are unique', () => {
    expect(duplicates(ALL_WEAPONS.map((w) => w.id))).toEqual([]);
    expect(duplicates(ALL_ARMOR.map((a) => a.id))).toEqual([]);
  });

  it('weaponById / armorById round-trip every entry', () => {
    for (const w of ALL_WEAPONS) expect(weaponById(w.id)).toBe(w);
    for (const a of ALL_ARMOR) expect(armorById(a.id)).toBe(a);
  });

  it('the tier-1 starter lists contain only tier-1 gear', () => {
    for (const w of [...PRIMARY_WEAPONS, ...SECONDARY_WEAPONS]) expect(w.tier).toBe(1);
    for (const a of TIER1_ARMOR) expect(a.tier).toBe(1);
  });
});

describe('loot', () => {
  it('has unique ids and lootById round-trips', () => {
    expect(duplicates(ALL_LOOT.map((x) => x.id))).toEqual([]);
    for (const x of ALL_LOOT) expect(lootById(x.id)).toBe(x);
  });
});
