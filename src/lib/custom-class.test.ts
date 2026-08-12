import { canShare, classKeyOf, classPageCount, classProblems, domainProblems, EMPTY_CLASS_SPEC, expansionClassProblems, expansionDomainProblems, problemToast } from './custom-class';
import type { LibraryCard } from './library';

const card = (over: Partial<LibraryCard> = {}): LibraryCard => ({
  id: 'lc-1', contentType: 'class', title: 'Warden', text: '', imageUri: null, ...over,
});

/**
 * A complete class SPEC. v0.42.1 moved the features out of it: they are cards now, linked back to the
 * class, so what is left here is only what belongs to the class itself.
 */
const GOOD_SPEC = {
  startingEvasion: 10,
  startingHp: 6,
  hopeFeature: { name: 'Root', text: 'Spend 3 Hope to hold your ground.' },
  summary: 'Keepers of the old borders.',
  domains: ['sage', 'valor'],
  fixedItemIds: ['it-1'],
  choiceAItemIds: ['it-2', 'it-3'],
  choiceBItemIds: ['it-4', 'it-5'],
};

/** What points at the class. One feature card and one subclass is the floor. */
const ATTACHED = { features: 1, subclasses: 1 };

const complete = () => card({ classSpec: GOOD_SPEC });
const subclassFor = (className: string) => card({ id: 'lc-2', contentType: 'subclass', title: 'Bramble', className, tier: 1 });
const featureFor = (className: string) => card({ id: 'lc-3', contentType: 'generic', title: 'Warden’s Mark', className, classRole: 'feature' });

describe('classPageCount', () => {
  it('is the feature cards plus the hope feature', () => {
    expect(classPageCount(GOOD_SPEC, 1)).toBe(2);
    expect(classPageCount(GOOD_SPEC, 2)).toBe(3);
  });

  it('is one for a class nothing points at, which is why one feature is the floor', () => {
    expect(classPageCount(EMPTY_CLASS_SPEC)).toBe(1);
  });
});

describe('classProblems', () => {
  it('reports nothing about a complete class', () => {
    expect(classProblems(complete(), ATTACHED)).toEqual([]);
  });

  it('reports a class card with no details at all', () => {
    expect(classProblems(card())).toContain('fill in the class details');
  });

  it('reports a missing name', () => {
    expect(classProblems(card({ title: '  ', classSpec: GOOD_SPEC }), ATTACHED)).toContain('give the class a name');
  });

  it('reports a missing hope feature', () => {
    expect(classProblems(card({ classSpec: { ...GOOD_SPEC, hopeFeature: { name: 'Root', text: '' } } }), ATTACHED)).toContain('write the Hope feature');
  });

  it('reports a class no feature card points at', () => {
    expect(classProblems(complete(), { features: 0, subclasses: 1 }).some((p) => p.includes('feature card'))).toBe(true);
  });

  it('reports a class no subclass points at', () => {
    expect(classProblems(complete(), { features: 1, subclasses: 0 }).some((p) => p.includes('subclass'))).toBe(true);
  });

  it('reports missing stats', () => {
    expect(classProblems(card({ classSpec: { ...GOOD_SPEC, startingHp: 0 } }), ATTACHED)).toContain('set starting Hit Points');
    expect(classProblems(card({ classSpec: { ...GOOD_SPEC, startingEvasion: 0 } }), ATTACHED)).toContain('set a starting Evasion');
  });

  it('reports fewer than two domains', () => {
    expect(classProblems(card({ classSpec: { ...GOOD_SPEC, domains: ['sage'] } }), ATTACHED)).toContain('choose the two domains it grants');
  });

  it('demands one item everyone gets and two choices of at least two (v0.42.1)', () => {
    expect(classProblems(card({ classSpec: { ...GOOD_SPEC, fixedItemIds: [] } }), ATTACHED).some((p) => p.includes('everyone receives'))).toBe(true);
    expect(classProblems(card({ classSpec: { ...GOOD_SPEC, choiceAItemIds: ['one'] } }), ATTACHED).some((p) => p.includes('first item choice'))).toBe(true);
    expect(classProblems(card({ classSpec: { ...GOOD_SPEC, choiceBItemIds: [] } }), ATTACHED).some((p) => p.includes('second item choice'))).toBe(true);
  });

  it('still accepts a class authored before the features became cards', () => {
    const old = { ...GOOD_SPEC, features: [{ name: 'Mark', text: 'Mark a Stress.' }] };
    expect(classProblems(card({ classSpec: old }), { features: 0, subclasses: 1 })).toEqual([]);
  });
});

describe('expansionClassProblems', () => {
  it('has nothing to say about an expansion with no classes in it', () => {
    expect(expansionClassProblems({ cards: [card({ contentType: 'domain' })] })).toEqual([]);
  });

  it('demands a subclass and a feature card', () => {
    const out = expansionClassProblems({ cards: [complete()] });
    expect(out.some((p) => p.includes('subclass'))).toBe(true);
    expect(out.some((p) => p.includes('feature card'))).toBe(true);
  });

  it('is satisfied by cards pointing at the class by name', () => {
    expect(expansionClassProblems({ cards: [complete(), subclassFor('Warden'), featureFor('Warden')] })).toEqual([]);
  });

  it('matches the class regardless of capitals or spacing', () => {
    expect(expansionClassProblems({ cards: [complete(), subclassFor('  warden '), featureFor('WARDEN')] })).toEqual([]);
  });

  it('names the class in every problem, so an author with two knows which', () => {
    const out = expansionClassProblems({ cards: [card({ title: 'Warden', classSpec: { ...GOOD_SPEC, summary: '' } }), subclassFor('Warden'), featureFor('Warden')] });
    expect(out.every((p) => p.startsWith('Warden: '))).toBe(true);
  });
});

describe('domainProblems (v0.42.1)', () => {
  const dcard = (level: number, i: number) => card({ id: `d-${level}-${i}`, contentType: 'domain', title: `Card ${level}.${i}`, domain: 'Pyre', level });
  const full = () => [dcard(1, 1), dcard(1, 2), ...Array.from({ length: 9 }, (_, k) => dcard(k + 2, 1))];

  it('is satisfied by eleven cards: two at level 1 and one at each of 2 to 10', () => {
    expect(domainProblems('Pyre', full())).toEqual([]);
  });

  it('demands the SECOND level one card', () => {
    expect(domainProblems('Pyre', full().filter((c) => c.id !== 'd-1-2'))).toHaveLength(1);
  });

  it('names every level that is missing', () => {
    expect(domainProblems('Pyre', [dcard(1, 1), dcard(1, 2)])[0]).toContain('2, 3, 4, 5, 6, 7, 8, 9, 10');
  });

  it('counts how many it has of how many it needs', () => {
    expect(domainProblems('Pyre', [dcard(1, 1)])[0]).toContain('1 of 11');
  });

  it('ignores cards of another domain', () => {
    expect(domainProblems('Pyre', full().map((c) => ({ ...c, domain: 'Blade' })))).toHaveLength(1);
  });

  it('matches the domain regardless of capitals', () => {
    expect(domainProblems('  pyre ', full())).toEqual([]);
  });
});

describe('expansionDomainProblems', () => {
  it('has nothing to say when no custom domain is declared', () => {
    expect(expansionDomainProblems({ cards: [card({ contentType: 'domain', domain: 'Pyre', level: 1 })] })).toEqual([]);
  });

  it('reports a declared domain with no cards', () => {
    const out = expansionDomainProblems({ cards: [card({ contentType: 'customDomain', title: 'Pyre' })] });
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('Pyre');
  });

  it('reports a domain with no name', () => {
    expect(expansionDomainProblems({ cards: [card({ contentType: 'customDomain', title: ' ' })] })[0]).toContain('give it a name');
  });
});

describe('canShare', () => {
  it('refuses an incomplete class', () => {
    expect(canShare({ cards: [complete()] })).toBe(false);
  });

  it('refuses an incomplete domain', () => {
    expect(canShare({ cards: [card({ contentType: 'customDomain', title: 'Pyre' })] })).toBe(false);
  });

  it('allows a complete one', () => {
    expect(canShare({ cards: [complete(), subclassFor('Warden'), featureFor('Warden')] })).toBe(true);
  });

  it('allows an expansion with no classes at all, which is every existing one', () => {
    expect(canShare({ cards: [card({ contentType: 'ancestry' })] })).toBe(true);
  });
});

describe('problemToast', () => {
  it('says the first thing to fix and how much else there is', () => {
    expect(problemToast(['do a thing'])).toBe('Before you can share this: do a thing.');
    expect(problemToast(['do a thing', 'and another', 'and one more'])).toBe('Before you can share this: do a thing, and 2 more.');
  });

  it('says nothing when there is nothing to say', () => {
    expect(problemToast([])).toBe('');
  });
});

describe('classKeyOf', () => {
  it('ignores capitals and spacing, so a subclass links to its class the way an author typed it', () => {
    expect(classKeyOf('  The  Warden ')).toBe('the warden');
    expect(classKeyOf(undefined)).toBe('');
  });
});
