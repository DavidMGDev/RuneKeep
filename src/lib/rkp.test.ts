import type { CharacterFile } from './character-file';
import type { Expansion, LibraryCard } from './library';
import { parseRkp, rkpKind, serializeRkp } from './rkp';

const character: CharacterFile = {
  schemaVersion: 1,
  id: 'c1',
  createdAt: '2026-01-01',
  name: 'Borin',
  portraitUri: null,
  className: 'guardian',
  subclassCardId: 'subclass-stalwart-1-foundation',
  ancestryCardId: 'ancestry-giant',
  communityCardId: 'community-wildborne',
  domainCardIds: ['valor-01-1', 'blade-01-1'],
  level: 1,
};

const card: LibraryCard = { id: 'lc1', contentType: 'domain', title: 'Ember Bolt', text: 'Deal damage.', imageUri: null, domain: 'Pyre', level: 1 };

const expansion: Expansion = {
  id: 'exp1',
  name: 'Pyre Domain',
  author: 'Koy',
  description: 'A homebrew fire domain.',
  version: 2,
  createdAt: '2026-06-23',
  cards: [card, { id: 'lc2', contentType: 'ancestry', title: 'Emberkin', text: 'Born of fire.', imageUri: null, ancestryEffectTrait: 1 }],
};

describe('rkp round-trip', () => {
  it('round-trips a character', () => {
    const r = parseRkp(serializeRkp({ kind: 'character', payload: character }));
    expect(r.kind).toBe('character');
    expect(r.payload).toMatchObject({ id: 'c1', name: 'Borin', className: 'guardian' });
  });
  it('round-trips a single card', () => {
    const r = parseRkp(serializeRkp({ kind: 'card', payload: card }));
    expect(r.kind).toBe('card');
    expect(r.payload).toMatchObject({ id: 'lc1', contentType: 'domain', domain: 'Pyre', level: 1 });
  });
  it('round-trips a catalog-reference card, preserving catalogId (#357 archive NFC share)', () => {
    const refCard = { id: 'share-1', contentType: 'domain' as const, title: 'Whirlwind', text: '', imageUri: null, catalogId: 'blade-01-1' };
    const r = parseRkp(serializeRkp({ kind: 'card', payload: refCard }));
    expect(r.kind).toBe('card');
    expect(r.payload).toMatchObject({ catalogId: 'blade-01-1', title: 'Whirlwind' });
  });
  it('round-trips an expansion (preserving version + cards)', () => {
    const r = parseRkp(serializeRkp({ kind: 'expansion', payload: expansion }));
    expect(r.kind).toBe('expansion');
    const e = r.payload as Expansion;
    expect(e.version).toBe(2);
    expect(e.cards).toHaveLength(2);
    expect(e.cards[1]).toMatchObject({ contentType: 'ancestry', ancestryEffectTrait: 1 });
  });
});

describe('rkp validation', () => {
  it('rejects non-JSON', () => {
    expect(() => parseRkp('not json {')).toThrow(/bad JSON/);
  });
  it('rejects JSON that is not an rkp envelope', () => {
    expect(() => parseRkp(JSON.stringify({ hello: 'world' }))).toThrow(/RuneKeep/);
  });
  it('rejects an unknown kind', () => {
    expect(() => parseRkp(JSON.stringify({ format: 'rkp', rkpVersion: 1, kind: 'monster', payload: {} }))).toThrow(/Unknown/);
  });
  it('rkpKind peeks the kind without throwing', () => {
    expect(rkpKind(serializeRkp({ kind: 'expansion', payload: expansion }))).toBe('expansion');
    expect(rkpKind('garbage')).toBeNull();
    expect(rkpKind(JSON.stringify({ format: 'other' }))).toBeNull();
  });
});
