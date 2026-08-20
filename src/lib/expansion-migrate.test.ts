import { migrateCards, migrateExpansion, needsMigration, splitInfoId } from './expansion-migrate';
import type { Expansion, LibraryCard } from './library';

const card = (p: Partial<LibraryCard> & { id: string }): LibraryCard => ({
  contentType: 'generic', title: '', text: '', imageUri: null, ...p,
});

/** A class card written the OLD way: it declares the class AND carries the page a player reads. */
const oldStyle = card({
  id: 'cl1',
  contentType: 'class',
  title: 'Shaman',
  imageUri: 'banner.png',
  color: '#332244',
  sections: [{ body: 'Speaks with the drowned.' }],
  plaque: { from: '#101014', to: '#2A2A33' },
  classSpec: { role: 'base', startingEvasion: 10, startingHp: 6, summary: 'A voice for the dead.', domains: [], fixedItemIds: [], choiceAItemIds: [], choiceBItemIds: [], hopeFeature: { name: '', text: '' } } as never,
});

describe('splitting an old class card', () => {
  const out = migrateCards([oldStyle]);

  it('makes two cards where there was one, in reading order', () => {
    expect(out.map((c) => c.id)).toEqual(['cl1', splitInfoId('cl1')]);
  });

  it('leaves the TEMPLATE with the name, the chip and the spec, and no paint', () => {
    const t = out[0];
    expect(t.title).toBe('Shaman');
    expect(t.plaque).toEqual({ from: '#101014', to: '#2A2A33' });
    expect(t.classSpec?.summary).toBe('A voice for the dead.');
    expect(t.imageUri).toBeNull();
    expect(t.color).toBeNull();
    expect(t.sections).toBeUndefined();
  });

  it('gives the INFO card the banner, the colour and the sections', () => {
    const i = out[1];
    expect(i.classSpec?.role).toBe('page');
    expect(i.className).toBe('Shaman');
    expect(i.imageUri).toBe('banner.png');
    expect(i.color).toBe('#332244');
    expect(i.sections).toEqual([{ body: 'Speaks with the drowned.' }]);
  });

  it('does not give the info card a chip of its own, so it inherits the class one', () => {
    expect(out[1].plaque).toBeUndefined();
  });
});

describe('when NOT to split', () => {
  it('leaves a class card that carries nothing a player would read', () => {
    const bare = card({ id: 'cl2', contentType: 'class', title: 'Shaman', classSpec: { role: 'base' } as never });
    expect(migrateCards([bare])).toEqual([bare]);
  });

  it('leaves a class that already has info cards of its own', () => {
    const info = card({ id: 'p1', contentType: 'class', title: 'p', className: 'Shaman', classSpec: { role: 'page' } as never });
    expect(migrateCards([oldStyle, info]).map((c) => c.id)).toEqual(['cl1', 'p1']);
  });

  it('is idempotent: running it twice changes nothing the second time', () => {
    const once = migrateCards([oldStyle]);
    expect(migrateCards(once)).toEqual(once);
  });

  it('leaves every other kind of card alone', () => {
    const rest = [card({ id: 'a', contentType: 'ancestry', title: 'Elf', imageUri: 'x.png' }), card({ id: 'w', contentType: 'weapon', title: 'Axe' })];
    expect(migrateCards(rest)).toEqual(rest);
  });

  it('leaves a class PAGE alone even though it carries content', () => {
    const page = card({ id: 'p', contentType: 'class', title: 'A page', className: 'Shaman', imageUri: 'b.png', classSpec: { role: 'page' } as never });
    expect(migrateCards([page])).toEqual([page]);
  });
});

describe('needsMigration / migrateExpansion', () => {
  const exp = (cards: LibraryCard[]): Expansion => ({ id: 'e', name: 'Pack', author: '', description: '', version: 1, createdAt: '', cards });

  it('reports whether there is anything to do', () => {
    expect(needsMigration([oldStyle])).toBe(true);
    expect(needsMigration(migrateCards([oldStyle]))).toBe(false);
  });

  it('returns the SAME object when nothing changed, so a read can skip the write', () => {
    const e = exp([card({ id: 'w', contentType: 'weapon', title: 'Axe' })]);
    expect(migrateExpansion(e)).toBe(e);
  });

  it('returns a new pack when it split something', () => {
    const e = exp([oldStyle]);
    expect(migrateExpansion(e)).not.toBe(e);
    expect(migrateExpansion(e).cards).toHaveLength(2);
  });

  it('copes with a pack whose cards are missing entirely', () => {
    expect(() => migrateExpansion({ id: 'e', name: 'x' } as Expansion)).not.toThrow();
  });
});
