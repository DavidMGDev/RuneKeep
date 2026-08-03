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
import { ALL_LOOT, CONSUMABLES, LOOT, lootById } from '@/data/loot-data';
import { EFFECT_TARGETS } from '@/lib/modifiers';
import { ANCESTRY_STRIKES, hasStrikeLines } from '@/data/ancestry-trait-regions';
import { VOID_ANCESTRIES, VOID_ANCESTRY_FACE } from '@/data/void-ancestries';
import { featureSectionIndexes } from '@/lib/library';

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
    const kinds: CatalogKind[] = ['domain', 'ancestry', 'community', 'subclass', 'transformation'];
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

  // v0.14.0: the loot table shipped missing rolls 01-19 for several releases and nothing caught it.
  it.each([['loot', LOOT] as const, ['consumable', CONSUMABLES] as const])('%s covers all 60 rulebook rolls exactly once', (kind, table) => {
    expect(table.map((x) => x.roll).sort()).toEqual(Array.from({ length: 60 }, (_, i) => String(i + 1).padStart(2, '0')).sort());
    for (const x of table) expect(x.kind).toBe(kind);
  });

  it('every entry has a name and body text', () => {
    for (const x of ALL_LOOT) {
      expect(x.name.trim().length).toBeGreaterThan(0);
      expect(x.text.trim().length).toBeGreaterThan(0);
    }
  });

  // v0.14.1: the Major potions shipped with `effects: []`, so drinking one changed nothing on the
  // sheet. Anything whose text promises a numeric bonus to a SHEET stat must carry a real effect.
  it.each([
    ['consumable-stride-potion', 'agility', 1],
    ['consumable-enlighten-potion', 'knowledge', 1],
    ['consumable-major-enlighten-potion', 'knowledge', 1],
    ['consumable-major-bolster-potion', 'strength', 1],
    ['consumable-shrinking-potion', 'agility', 2],
    ['consumable-growing-potion', 'strength', 2],
    ['loot-enlighten-relic', 'knowledge', 1],
  ])('%s applies %s %+d when equipped', (id, target, delta) => {
    expect(lootById(id)?.effects).toEqual(expect.arrayContaining([expect.objectContaining({ target, delta })]));
  });

  it('the shrink/grow potions trade a trait against Proficiency', () => {
    expect(lootById('consumable-shrinking-potion')?.effects).toEqual(expect.arrayContaining([expect.objectContaining({ target: 'proficiency', delta: -1 })]));
    expect(lootById('consumable-growing-potion')?.effects).toEqual(expect.arrayContaining([expect.objectContaining({ target: 'proficiency', delta: 1 })]));
  });

  it('every declared effect names a real target', () => {
    for (const x of ALL_LOOT) for (const e of x.effects ?? []) expect(EFFECT_TARGETS.includes(e.target as never) || e.target === 'experience').toBe(true);
  });

  // effectsForCardId checks loot LAST, so an id shared with a weapon/armor/catalog card would be
  // shadowed silently and the loot's effects would never apply.
  it('loot ids never collide with catalog, weapon or armor ids', () => {
    const others = new Set([...CATALOG.map((c) => c.id), ...ALL_WEAPONS.map((w) => w.id), ...ALL_ARMOR.map((a) => a.id)]);
    expect(ALL_LOOT.filter((x) => others.has(x.id)).map((x) => x.id)).toEqual([]);
  });
  // v0.25.0: the Hope and Fear ancestries are printed faces, so the mixed-ancestry cross-out is DRAWN
  // at measured positions rather than applied to text. A face without marks would silently stop
  // crossing anything out, which looks like a working card showing two features it should not have.
  describe('printed-face ancestries carry their strike lines', () => {
    it('every Hope and Fear ancestry has a face and marks for both features', () => {
      for (const a of VOID_ANCESTRIES) {
        expect(VOID_ANCESTRY_FACE[a.id]).toBeDefined();
        expect(hasStrikeLines(a.id)).toBe(true);
        expect(ANCESTRY_STRIKES[a.id].a.length).toBeGreaterThan(0);
        expect(ANCESTRY_STRIKES[a.id].b.length).toBeGreaterThan(0);
      }
    });

    it('marks sit below the art, in order, and inside the card', () => {
      for (const [id, s] of Object.entries(ANCESTRY_STRIKES)) {
        const all = [...s.a, ...s.b];
        expect(all.every((y) => y > 0.4 && y < 1)).toBe(true); // text half of the card, never the art
        expect([...all].sort((p, q) => p - q)).toEqual(all); // feature 1 above feature 2
        expect(id).toMatch(/^ancestry-/);
      }
    });

    it('still resolves which section holds each feature, for the text fallback and effects', () => {
      for (const a of VOID_ANCESTRIES) {
        const [first, second] = featureSectionIndexes(a);
        expect(first).toBeGreaterThanOrEqual(0);
        expect(second).toBeGreaterThan(first);
      }
    });
  });
});

/**
 * The Hope and Fear ancestries live in exactly ONE place (v0.34.0).
 *
 * They are structured LibraryCards on the expansion record, and they used to also be rows in the
 * generated catalog. v0.12.3 removed those rows by hand; regenerating the catalog in v0.32.0 put them
 * back, and every one of them then appeared twice in the creator's ancestry deck. Two cards sharing
 * an id also means two image views sharing a recycling key, which is what made that end of the deck
 * flicker. The generator excludes them now, and this is what stops the next regeneration undoing it.
 */
describe('structured ancestries are not also catalog rows', () => {
  it('has no catalog entry for an ancestry authored as a library card', () => {
    const structured = new Set(VOID_ANCESTRIES.map((a) => a.id));
    const dupes = CATALOG.filter((c) => structured.has(c.id)).map((c) => c.id);
    expect(dupes).toEqual([]);
  });

  it('has no duplicate id anywhere in the catalog', () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const c of CATALOG) {
      if (seen.has(c.id)) dupes.push(c.id);
      seen.add(c.id);
    }
    expect(dupes).toEqual([]);
  });

  it('still knows every printed face, which is what the creator draws them from', () => {
    for (const a of VOID_ANCESTRIES) expect(VOID_ANCESTRY_FACE[a.id]).toBeTruthy();
  });
});
