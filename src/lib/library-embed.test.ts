import { armorSpecEffects, libraryCardBody, libraryCardEffects, mixedCrossedTrait } from './library-embed';
import type { CharacterFile } from './character-file';
import type { LibraryCard } from './library';

const lc = (over: Partial<LibraryCard>): LibraryCard => ({ id: 'x', contentType: 'generic', title: 'T', text: '', imageUri: null, ...over });

describe('armorSpecEffects', () => {
  it('bakes score + set thresholds from a "major / severe" string', () => {
    expect(armorSpecEffects({ baseScore: 4, thresholds: '7 / 15', tier: 1 })).toEqual([
      { target: 'armorScore', mode: 'bonus', delta: 4 },
      { target: 'majorThreshold', mode: 'set', delta: 7 },
      { target: 'severeThreshold', mode: 'set', delta: 15 },
    ]);
  });
  it('omits a zero score', () => {
    expect(armorSpecEffects({ baseScore: 0, thresholds: '5/9', tier: 1 })).toEqual([
      { target: 'majorThreshold', mode: 'set', delta: 5 },
      { target: 'severeThreshold', mode: 'set', delta: 9 },
    ]);
  });
});

describe('libraryCardEffects', () => {
  it('armor = own effects + baked score/thresholds', () => {
    const c = lc({ contentType: 'armor', armor: { baseScore: 3, thresholds: '6/12', tier: 1 }, effects: [{ target: 'evasion', delta: -1 }] });
    expect(libraryCardEffects(c)).toEqual([
      { target: 'evasion', delta: -1 },
      { target: 'armorScore', mode: 'bonus', delta: 3 },
      { target: 'majorThreshold', mode: 'set', delta: 6 },
      { target: 'severeThreshold', mode: 'set', delta: 12 },
    ]);
  });
  it('non-armor = own effects only', () => {
    expect(libraryCardEffects(lc({ effects: [{ target: 'agility', delta: 1 }] }))).toEqual([{ target: 'agility', delta: 1 }]);
  });
});

describe('libraryCardBody', () => {
  it('prepends a stat line for armor, then the body', () => {
    expect(libraryCardBody(lc({ contentType: 'armor', armor: { baseScore: 3, thresholds: '6/12', tier: 1 }, text: 'Sturdy.' }))).toBe('**Score 3 · Thresholds 6/12**\n\nSturdy.');
  });
  it('composes sections for a text card', () => {
    expect(libraryCardBody(lc({ sections: [{ name: 'Tough', body: 'hardy' }] }))).toBe('**Tough.** hardy');
  });
  it('strikes the given section index (mixed-ancestry cross-out)', () => {
    const anc = lc({ sections: [{ name: 'One', body: 'x' }, { name: 'Two', body: 'y' }] });
    expect(libraryCardBody(anc, 1)).toBe('**One.** x\n\n~~**Two.** y~~');
    expect(libraryCardBody(anc, 0)).toBe('~~**One.** x~~\n\n**Two.** y');
    expect(libraryCardBody(anc)).toBe('**One.** x\n\n**Two.** y');
  });
});

describe('mixedCrossedTrait', () => {
  const file = (m?: { first: string; second: string }) => ({ mixedAncestry: m } as CharacterFile);
  it('first-picked crosses feature 2, second crosses feature 1', () => {
    expect(mixedCrossedTrait(file({ first: 'a', second: 'b' }), 'a')).toBe(2);
    expect(mixedCrossedTrait(file({ first: 'a', second: 'b' }), 'b')).toBe(1);
    expect(mixedCrossedTrait(file({ first: 'a', second: 'b' }), 'c')).toBe(0);
    expect(mixedCrossedTrait(file(), 'a')).toBe(0);
  });
});
