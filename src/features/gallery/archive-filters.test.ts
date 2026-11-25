import { EMPTY_FILTERS, pickDomain, pickKind, pickLevel, pickTier } from './archive-filters';

const list = <T,>(s: Set<T>) => [...s];

it('holds one Type at a time, and a second press clears it', () => {
  const a = pickKind(EMPTY_FILTERS(), 'class');
  const b = pickKind(a, 'subclass');
  expect(list(b.kinds)).toEqual(['subclass']);
  expect(list(pickKind(b, 'subclass').kinds)).toEqual([]);
});

it('holds one Domain at a time', () => {
  const a = pickDomain(EMPTY_FILTERS(), 'sage');
  expect(list(pickDomain(a, 'arcana').domains)).toEqual(['arcana']);
  expect(list(pickDomain(a, 'sage').domains)).toEqual([]);
});

it('Class then Sage keeps Class; Domains keeps Sage; Transformations drops it', () => {
  const classSage = pickDomain(pickKind(EMPTY_FILTERS(), 'class'), 'sage');
  expect(list(classSage.kinds)).toEqual(['class']);
  expect(list(classSage.domains)).toEqual(['sage']);
  const domainsSage = pickKind(classSage, 'domain');
  expect(list(domainsSage.domains)).toEqual(['sage']);
  const trans = pickKind(domainsSage, 'transformation');
  expect(list(trans.kinds)).toEqual(['transformation']);
  expect(list(trans.domains)).toEqual([]);
});

it('a domain with no type it applies to shows domain cards', () => {
  expect(list(pickDomain(pickKind(EMPTY_FILTERS(), 'weapon'), 'blade').kinds)).toEqual(['domain']);
  expect(list(pickDomain(EMPTY_FILTERS(), 'blade').kinds)).toEqual(['domain']);
});

it('levels are for domain cards and tiers for gear, and each clears the other', () => {
  const lvl = pickLevel(pickKind(EMPTY_FILTERS(), 'class'), 3);
  expect(list(lvl.kinds)).toEqual(['domain']);
  const tier = pickTier(lvl, 2);
  expect(list(tier.levels)).toEqual([]);
  expect(list(tier.kinds)).toEqual([]);
  expect(list(pickTier(pickKind(EMPTY_FILTERS(), 'armor'), 1).kinds)).toEqual(['armor']);
});
