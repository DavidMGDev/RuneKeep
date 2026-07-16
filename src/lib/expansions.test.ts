/**
 * Expansion gating (v0.12.2) — guards the load-bearing invariant: expansion content is ADDITIVE and
 * OFF BY DEFAULT, so base-game creation can never be broken or changed by a Void card leaking in.
 */
import { CATALOG } from '@/data/catalog';
import { VOID_EXPANSION_ID } from '@/constants/identity';

import { catalogFor, classExpansion, isOfficialExpansion } from './expansions';
import { isEnabledForCreation, type Expansion } from './library';

const exp = (over: Partial<Expansion>): Expansion => ({
  id: 'x', name: 'X', author: '', description: '', version: 1, createdAt: '', cards: [], ...over,
});

describe('expansion gating', () => {
  test('base-only creation sees every base card and zero Void cards', () => {
    const baseOnly = catalogFor([]);
    expect(baseOnly.some((c) => c.expansion)).toBe(false);
    const baseCount = CATALOG.filter((c) => !c.expansion).length;
    expect(baseOnly.length).toBe(baseCount);
    expect(baseCount).toBeGreaterThan(0);
  });

  test('enabling The Void un-gates exactly the Void cards (nothing else changes)', () => {
    const withVoid = catalogFor([VOID_EXPANSION_ID]);
    expect(withVoid.length).toBe(CATALOG.length);
    expect(withVoid.some((c) => c.expansion === VOID_EXPANSION_ID)).toBe(true);
  });

  test('classExpansion tags only Void classes', () => {
    expect(classExpansion('warrior')).toBeUndefined();
    expect(classExpansion('assassin')).toBe(VOID_EXPANSION_ID);
  });

  test('official packs are OFF by default; custom packs are ON by default', () => {
    expect(isEnabledForCreation(exp({ official: true, enabled: false }))).toBe(false);
    expect(isEnabledForCreation(exp({ official: true, enabled: true }))).toBe(true);
    expect(isEnabledForCreation(exp({}))).toBe(true); // custom, enabled undefined
    expect(isEnabledForCreation(exp({ enabled: false }))).toBe(false);
  });

  test('The Void is the one official expansion this build ships', () => {
    expect(isOfficialExpansion(VOID_EXPANSION_ID)).toBe(true);
    expect(isOfficialExpansion('some-homebrew')).toBe(false);
  });
});
