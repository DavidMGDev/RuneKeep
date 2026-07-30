/**
 * Expansion gating (v0.12.2) — guards the load-bearing invariant: expansion content is ADDITIVE and
 * OFF BY DEFAULT, so base-game creation can never be broken or changed by a Void card leaking in.
 */
import { CATALOG } from '@/data/catalog';
import { THE_VOID_EXPANSION_ID, VOID_EXPANSION_ID } from '@/constants/identity';

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

  // v0.25.0: two official packs, so enabling one no longer un-gates the other's cards. That is the
  // whole point of the split, and it is the property most likely to be broken by a careless retag.
  test('enabling Hope and Fear un-gates its cards and NOT the beta ones', () => {
    const withHf = catalogFor([VOID_EXPANSION_ID]);
    expect(withHf.some((c) => c.expansion === VOID_EXPANSION_ID)).toBe(true);
    expect(withHf.some((c) => c.expansion === THE_VOID_EXPANSION_ID)).toBe(false);
    expect(withHf.length).toBeLessThan(CATALOG.length);
  });

  test('enabling both un-gates the whole catalog', () => {
    expect(catalogFor([VOID_EXPANSION_ID, THE_VOID_EXPANSION_ID]).length).toBe(CATALOG.length);
  });

  test('the beta pack holds the Blood domain and the five cut subclasses, nothing else', () => {
    const beta = CATALOG.filter((c) => c.expansion === THE_VOID_EXPANSION_ID);
    expect(beta.filter((c) => c.kind === 'domain').every((c) => c.domain === 'blood')).toBe(true);
    expect(beta.filter((c) => c.kind === 'domain')).toHaveLength(21);
    expect(beta.filter((c) => c.kind === 'subclass')).toHaveLength(15);
    expect(beta).toHaveLength(36);
    // Dread is printed in the book, so it must NOT have moved.
    expect(CATALOG.filter((c) => c.domain === 'dread').every((c) => c.expansion === VOID_EXPANSION_ID)).toBe(true);
  });

  test('classExpansion sends each class to the pack that actually contains it', () => {
    expect(classExpansion('warrior')).toBeUndefined();
    expect(classExpansion('assassin')).toBe(VOID_EXPANSION_ID);
    expect(classExpansion('brawler')).toBe(VOID_EXPANSION_ID);
    expect(classExpansion('bloodhunter')).toBe(THE_VOID_EXPANSION_ID);
    expect(classExpansion('summoner')).toBe(THE_VOID_EXPANSION_ID);
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
