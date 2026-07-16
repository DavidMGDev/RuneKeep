import { contentForCreation, type Expansion, expansionSummary, featureSectionIndexes, type LibraryCard, mergeDecision, validateExpansion } from './library';

const card = (over: Partial<LibraryCard> = {}): LibraryCard => ({ id: 'c', contentType: 'generic', title: 'T', text: '', imageUri: null, ...over });
const exp = (over: Partial<Expansion> = {}): Expansion => ({ id: 'e1', name: 'Pack', author: 'A', description: '', version: 1, createdAt: '2026-01-01', cards: [], ...over });

describe('mergeDecision (version-aware import)', () => {
  it('adds an expansion the library does not have', () => {
    expect(mergeDecision(undefined, exp())).toBe('add');
  });
  it('updates in place when the incoming version is higher', () => {
    expect(mergeDecision(exp({ version: 1 }), exp({ version: 3 }))).toBe('update');
  });
  it('skips an older incoming version', () => {
    expect(mergeDecision(exp({ version: 3 }), exp({ version: 1 }))).toBe('skip');
  });
  it('reports same when versions match', () => {
    expect(mergeDecision(exp({ version: 2 }), exp({ version: 2 }))).toBe('same');
  });
});

describe('featureSectionIndexes (v0.13.0 re-arrangeable ancestry features)', () => {
  it('legacy cards (no flags) resolve features to sections 0/1', () => {
    expect(featureSectionIndexes({ sections: [{ name: 'A', body: 'x' }, { name: 'B', body: 'y' }] })).toEqual([0, 1]);
    expect(featureSectionIndexes({})).toEqual([0, 1]);
  });
  it('flagged features resolve to their actual indexes, in vertical order', () => {
    const sections = [
      { body: 'a description' },
      { name: 'First', body: 'x', feature: true },
      { body: 'lore' },
      { name: 'Second', body: 'y', feature: true },
    ];
    expect(featureSectionIndexes({ sections })).toEqual([1, 3]);
  });
  it('a single flag falls back to the legacy 0/1 (the editor always keeps two)', () => {
    expect(featureSectionIndexes({ sections: [{ body: 'x', feature: true }] })).toEqual([0, 1]);
  });
  it('the feature flag survives validation round-trips', () => {
    const e = validateExpansion({ id: 'e', name: 'N', cards: [{ id: 'c', contentType: 'ancestry', sections: [{ body: 'd' }, { name: 'F1', body: 'x', feature: true }, { name: 'F2', body: 'y', feature: true }] }] });
    expect(featureSectionIndexes(e.cards[0])).toEqual([1, 2]);
  });
});

describe('contentForCreation', () => {
  it('buckets cards by content type', () => {
    const c = contentForCreation([
      exp({ cards: [card({ id: 'a', contentType: 'ancestry' }), card({ id: 'd', contentType: 'domain', domain: 'Pyre', level: 1 })] }),
      exp({ id: 'e2', cards: [card({ id: 's', contentType: 'subclass', className: 'guardian' }), card({ id: 'cl', contentType: 'class' })] }),
    ]);
    expect(c.ancestries.map((x) => x.id)).toEqual(['a']);
    expect(c.domains.map((x) => x.id)).toEqual(['d']);
    expect(c.subclasses.map((x) => x.id)).toEqual(['s']);
    expect(c.classes.map((x) => x.id)).toEqual(['cl']);
    expect(c.communities).toEqual([]);
  });
});

describe('expansionSummary', () => {
  it('counts cards per type', () => {
    const s = expansionSummary(exp({ cards: [card({ id: '1', contentType: 'ancestry' }), card({ id: '2', contentType: 'ancestry' }), card({ id: '3', contentType: 'domain' })] }));
    expect(s.cardCount).toBe(3);
    expect(s.byType.ancestry).toBe(2);
    expect(s.byType.domain).toBe(1);
  });
});

describe('validateExpansion (import trust boundary)', () => {
  it('accepts and normalizes a well-formed expansion', () => {
    const e = validateExpansion({ id: 'e', name: 'N', cards: [{ id: 'c', contentType: 'domain', title: 'X' }] });
    expect(e.version).toBe(1); // defaulted
    expect(e.cards[0]).toMatchObject({ id: 'c', contentType: 'domain', title: 'X', imageUri: null });
  });
  it('coerces an unknown content type to generic', () => {
    const e = validateExpansion({ id: 'e', name: 'N', cards: [{ id: 'c', contentType: 'wizardry' }] });
    expect(e.cards[0].contentType).toBe('generic');
  });
  it('rejects an object with no id', () => {
    expect(() => validateExpansion({ name: 'N', cards: [] })).toThrow(/id/);
  });
  it('rejects a card with no id', () => {
    expect(() => validateExpansion({ id: 'e', name: 'N', cards: [{ contentType: 'domain' }] })).toThrow(/id/);
  });
});
