import { dependencyNote, extraDependencies, moveCards, withDependencies } from './card-move';
import type { LibraryCard, LibraryContentType } from './library';

const c = (id: string, contentType: LibraryContentType, title: string, over: Partial<LibraryCard> = {}): LibraryCard =>
  ({ id, contentType, title, text: '', imageUri: null, ...over });

const CLASS = c('k', 'class', 'Warden', {
  classSpec: {
    startingEvasion: 10, startingHp: 6, hopeFeature: { name: 'Root', text: 'x' }, summary: 's',
    domains: ['sage', 'valor'], fixedItemIds: ['i1'], choiceAItemIds: ['i2'], choiceBItemIds: [],
  },
});
const SUB = c('s', 'subclass', 'Bramble', { className: 'Warden', subclass: 'Bramble', tier: 1 });
const FEAT = c('f', 'generic', 'Mark', { className: 'warden', classRole: 'feature' });
const ITEM = c('i1', 'inventory', 'A rope');
const OTHER = c('i2', 'inventory', 'A lamp');
const LOOSE = c('z', 'generic', 'A note');
const ALL = [CLASS, SUB, FEAT, ITEM, OTHER, LOOSE];

describe('withDependencies', () => {
  it('takes a lone card alone', () => {
    expect(withDependencies(['z'], ALL).map((x) => x.id)).toEqual(['z']);
  });

  it('takes the class a subclass belongs to', () => {
    expect(withDependencies(['s'], ALL).map((x) => x.id)).toContain('k');
  });

  it('takes everything a class is made of, items included', () => {
    expect(withDependencies(['k'], ALL).map((x) => x.id).sort()).toEqual(['f', 'i1', 'i2', 'k', 's']);
  });

  it('matches the class link however it was capitalised', () => {
    expect(withDependencies(['f'], ALL).map((x) => x.id)).toContain('k');
  });

  it('pairs a domain card with its domain, both ways', () => {
    const dom = c('d', 'customDomain', 'Pyre');
    const card = c('dc', 'domain', 'Ember', { domain: ' pyre ', level: 1 });
    expect(withDependencies(['dc'], [dom, card]).map((x) => x.id).sort()).toEqual(['d', 'dc']);
    expect(withDependencies(['d'], [dom, card]).map((x) => x.id).sort()).toEqual(['d', 'dc']);
  });

  it('terminates on a cycle', () => {
    expect(withDependencies(['k'], ALL)).toHaveLength(5);
  });

  it('keeps the source order', () => {
    expect(withDependencies(['f', 'k'], ALL).map((x) => x.id)).toEqual(['k', 's', 'f', 'i1', 'i2']);
  });
});

describe('extraDependencies', () => {
  it('is what the author did not ask for', () => {
    expect(extraDependencies(['s'], ALL).map((x) => x.id).sort()).toEqual(['f', 'i1', 'i2', 'k']);
    expect(extraDependencies(['z'], ALL)).toEqual([]);
  });
});

describe('dependencyNote', () => {
  it('says nothing when nothing travels', () => {
    expect(dependencyNote([])).toBe('');
  });

  it('names a few and counts the rest', () => {
    expect(dependencyNote([LOOSE])).toContain('A note comes too');
    expect(dependencyNote([CLASS, SUB, FEAT, ITEM])).toContain('and 1 more');
  });
});

describe('moveCards', () => {
  it('moves the cluster out of the source', () => {
    const r = moveCards(ALL, [], ['s'], 'move');
    expect(r.from.map((x) => x.id)).toEqual(['z']);
    expect(r.to).toHaveLength(5);
  });

  it('leaves the source alone on a copy', () => {
    expect(moveCards(ALL, [], ['s'], 'copy').from).toHaveLength(ALL.length);
  });

  it('replaces rather than duplicates, so copying twice is copying once', () => {
    const once = moveCards(ALL, [], ['k'], 'copy').to;
    const twice = moveCards(ALL, once, ['k'], 'copy').to;
    expect(twice).toHaveLength(once.length);
  });

  it('keeps ids, because a class holds its items by id', () => {
    const r = moveCards(ALL, [], ['k'], 'copy');
    expect(r.to.map((x) => x.id)).toContain('i1');
  });
});
