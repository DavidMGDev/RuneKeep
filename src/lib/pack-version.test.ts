import { afterShare, nextShareVersion, packChangedSinceShare, packSig } from './pack-version';
import type { Expansion, LibraryCard } from './library';

const card = (id: string, over: Partial<LibraryCard> = {}): LibraryCard =>
  ({ id, contentType: 'generic', title: id, text: '', imageUri: null, ...over });

const pack = (over: Partial<Expansion> = {}): Expansion => ({
  id: 'e1', name: 'My pack', author: 'me', description: 'stuff', version: 1,
  createdAt: '2026-01-01', cards: [card('a'), card('b')], ...over,
});

describe('packSig', () => {
  it('is stable across two reads of the same pack', () => {
    expect(packSig(pack())).toBe(packSig(pack()));
  });

  it(`moves when a card text changes`, () => {
    expect(packSig(pack({ cards: [card('a', { text: 'new' })] }))).not.toBe(packSig(pack({ cards: [card('a')] })));
  });

  it('moves when a card is added or removed', () => {
    expect(packSig(pack({ cards: [card('a')] }))).not.toBe(packSig(pack()));
  });

  it('moves when the campaign rules change, because they change what a receiver can build', () => {
    expect(packSig(pack({ campaign: { on: true, disabled: ['class:x'] } }))).not.toBe(packSig(pack()));
  });

  it('does NOT move for the pack own labels, which change nothing about the cards', () => {
    expect(packSig(pack({ name: 'Renamed', author: 'somebody', description: 'other' }))).toBe(packSig(pack()));
  });
});

describe('packChangedSinceShare', () => {
  it('says a pack that has never been shared has changed', () => {
    expect(packChangedSinceShare(pack())).toBe(true);
  });

  it('says a pack shared and untouched has not', () => {
    expect(packChangedSinceShare(afterShare(pack()))).toBe(false);
  });

  it('says an edited pack has', () => {
    const shared = afterShare(pack());
    expect(packChangedSinceShare({ ...shared, cards: [...shared.cards, card('c')] })).toBe(true);
  });
});

describe('afterShare', () => {
  it('bumps the first time, because nobody had it before', () => {
    expect(afterShare(pack({ version: 1 })).version).toBe(2);
  });

  it('does NOT bump when the same pack is shared twice, so a version is a thing two people can name', () => {
    const once = afterShare(pack({ version: 1 }));
    expect(afterShare(once).version).toBe(once.version);
  });

  it('bumps again once something has actually changed', () => {
    const once = afterShare(pack({ version: 1 }));
    const edited = { ...once, cards: [...once.cards, card('c')] };
    expect(afterShare(edited).version).toBe(once.version + 1);
  });

  it('does not bump for a rename, an author change or a new description', () => {
    const once = afterShare(pack({ version: 1 }));
    expect(afterShare({ ...once, name: 'Renamed', description: 'other' }).version).toBe(once.version);
  });

  it('stamps the signature either way, so the next share compares against what went out', () => {
    const once = afterShare(pack());
    expect(once.sharedSig).toBe(packSig(once));
  });
});

describe('nextShareVersion', () => {
  it('is what the header should promise', () => {
    const p = pack({ version: 4 });
    expect(nextShareVersion(p)).toBe(5);
    expect(nextShareVersion(afterShare(p))).toBe(5);
  });
});
