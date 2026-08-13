import { featurePages } from '@/data/class-data';

import { acquiredPageId, classPageCount, classPageId, classPageMark, isLegacyClassCard, trackerFor, withoutLegacyClassCards } from './class-cards';

describe('classPageCount', () => {
  it('counts the ABILITY pages and not the cover, which is the whole of the 2/4 bug', () => {
    expect(classPageCount('bard')).toBe(featurePages('bard').length);
  });

  it('is at least one for every class in the game', () => {
    for (const cls of ['bard', 'druid', 'guardian', 'ranger', 'rogue', 'seraph', 'sorcerer', 'warrior', 'wizard'] as const) {
      expect(classPageCount(cls)).toBeGreaterThan(0);
    }
  });
});

describe('classPageMark', () => {
  it('counts from one, so the first page reads 1 of n', () => {
    expect(classPageMark(0, 3)).toBe('1/3');
    expect(classPageMark(2, 3)).toBe('3/3');
  });

  it('never produces the 2/4 the owner reported', () => {
    const total = classPageCount('bard');
    const marks = Array.from({ length: total }, (_, i) => classPageMark(i, total));
    expect(marks[0]).toBe(`1/${total}`);
    expect(marks).toHaveLength(total);
  });
});

describe('classPageId / acquiredPageId', () => {
  it('is deterministic, so the same page is the same card across a reload', () => {
    expect(classPageId('bard', 0)).toBe(classPageId('bard', 0));
  });

  it('never collides two pages of one class', () => {
    expect(classPageId('bard', 0)).not.toBe(classPageId('bard', 1));
  });

  it('keeps a character own class apart from one they picked up', () => {
    expect(classPageId('bard', 0)).not.toBe(acquiredPageId('bard', 0));
  });
});

describe('trackerFor', () => {
  it('gives the Brawler its Combo Die', () => {
    const t = trackerFor('brawler', 'Combo Strike');
    expect(t?.functions[0].title).toBe('Combo Die');
    expect(t?.advances).toHaveLength(1);
  });

  it('finds it through a split page name, because the packer renames long abilities', () => {
    expect(trackerFor('brawler', 'Combo Strike (1/2)')).toBeDefined();
  });

  it('says nothing about an ordinary ability', () => {
    expect(trackerFor('bard', 'Rally')).toBeUndefined();
  });
});

describe('withoutLegacyClassCards', () => {
  const mine = { id: 'cc-1' };
  const legacy = { id: 'cls-bard-0' };

  it('drops what the old expand wrote', () => {
    expect(withoutLegacyClassCards([mine, legacy], true)).toEqual([mine]);
  });

  it('leaves a character who never expanded completely alone, even one whose card looks like it', () => {
    const cards = [mine, legacy];
    expect(withoutLegacyClassCards(cards, false)).toBe(cards);
    expect(withoutLegacyClassCards(cards, undefined)).toBe(cards);
  });

  it('is reference-identical when there is nothing to drop, so the common case allocates nothing', () => {
    const cards = [mine];
    expect(withoutLegacyClassCards(cards, true)).toBe(cards);
  });

  it('copes with a character who has no authored cards at all', () => {
    expect(withoutLegacyClassCards(undefined, true)).toBeUndefined();
    expect(withoutLegacyClassCards([], true)).toEqual([]);
  });

  it('is idempotent', () => {
    const once = withoutLegacyClassCards([mine, legacy], true)!;
    expect(withoutLegacyClassCards(once, true)).toBe(once);
  });
});

describe('isLegacyClassCard', () => {
  it('recognises only the old prefix, and not the new page ids', () => {
    expect(isLegacyClassCard('cls-bard-0')).toBe(true);
    expect(isLegacyClassCard(classPageId('bard', 0))).toBe(false);
    expect(isLegacyClassCard('cc-1')).toBe(false);
  });
});
