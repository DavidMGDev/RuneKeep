import { canShare, classKeyOf, classPageCount, classProblems, EMPTY_CLASS_SPEC, expansionClassProblems, problemToast } from './custom-class';
import type { LibraryCard } from './library';

const card = (over: Partial<LibraryCard> = {}): LibraryCard => ({
  id: 'lc-1', contentType: 'class', title: 'Warden', text: '', imageUri: null, ...over,
});

const GOOD_SPEC = {
  startingEvasion: 10,
  startingHp: 6,
  classItems: 'A bundle of dried sage',
  hopeFeature: { name: 'Root', text: 'Spend 3 Hope to hold your ground.' },
  features: [{ name: 'Warden’s Mark', text: 'Mark a Stress to name a foe.' }],
  summary: 'Keepers of the old borders.',
  domains: ['sage', 'valor'],
};

const complete = () => card({ classSpec: GOOD_SPEC });
const subclassFor = (className: string) => card({ id: 'lc-2', contentType: 'subclass', title: 'Bramble', className, tier: 1 });

describe('classPageCount', () => {
  it('is the features plus the hope feature', () => {
    expect(classPageCount(GOOD_SPEC)).toBe(2);
    expect(classPageCount({ ...GOOD_SPEC, features: [GOOD_SPEC.features[0], GOOD_SPEC.features[0]] })).toBe(3);
  });

  it('is one for a class with nothing in it, which is why one feature is the floor', () => {
    expect(classPageCount(EMPTY_CLASS_SPEC)).toBe(1);
  });
});

describe('classProblems', () => {
  it('reports nothing about a complete class', () => {
    expect(classProblems(complete())).toEqual([]);
  });

  it('reports a class card with no details at all', () => {
    expect(classProblems(card())).toContain('fill in the class details');
  });

  it('reports a missing name', () => {
    expect(classProblems(card({ title: '  ', classSpec: GOOD_SPEC }))).toContain('give the class a name');
  });

  it('reports a missing hope feature', () => {
    expect(classProblems(card({ classSpec: { ...GOOD_SPEC, hopeFeature: { name: 'Root', text: '' } } }))).toContain('write the Hope feature');
  });

  it('reports a class with no features, because two pages is the floor', () => {
    const problems = classProblems(card({ classSpec: { ...GOOD_SPEC, features: [] } }));
    expect(problems.some((p) => p.includes('at least one class feature'))).toBe(true);
  });

  it('reports a half-written feature', () => {
    expect(classProblems(card({ classSpec: { ...GOOD_SPEC, features: [{ name: 'Mark', text: '' }] } }))).toContain('finish every class feature');
  });

  it('reports missing stats', () => {
    expect(classProblems(card({ classSpec: { ...GOOD_SPEC, startingHp: 0 } }))).toContain('set starting Hit Points');
    expect(classProblems(card({ classSpec: { ...GOOD_SPEC, startingEvasion: 0 } }))).toContain('set a starting Evasion');
  });

  it('reports fewer than two domains', () => {
    expect(classProblems(card({ classSpec: { ...GOOD_SPEC, domains: ['sage', ''] } }))).toContain('choose the two domains it grants');
  });
});

describe('expansionClassProblems', () => {
  it('has nothing to say about an expansion with no classes in it', () => {
    expect(expansionClassProblems({ cards: [card({ contentType: 'domain' })] })).toEqual([]);
  });

  it('demands at least one subclass', () => {
    const out = expansionClassProblems({ cards: [complete()] });
    expect(out).toEqual(['Warden: add at least one subclass for it']);
  });

  it('is satisfied by a subclass pointing at the class by name', () => {
    expect(expansionClassProblems({ cards: [complete(), subclassFor('Warden')] })).toEqual([]);
  });

  it('matches the class regardless of capitals or spacing', () => {
    expect(expansionClassProblems({ cards: [complete(), subclassFor('  warden ')] })).toEqual([]);
  });

  it('names the class in every problem, so an author with two knows which', () => {
    const out = expansionClassProblems({ cards: [card({ title: 'Warden', classSpec: { ...GOOD_SPEC, summary: '' } }), subclassFor('Warden')] });
    expect(out.every((p) => p.startsWith('Warden: '))).toBe(true);
  });
});

describe('canShare', () => {
  it('refuses an incomplete class', () => {
    expect(canShare({ cards: [complete()] })).toBe(false);
  });

  it('allows a complete one', () => {
    expect(canShare({ cards: [complete(), subclassFor('Warden')] })).toBe(true);
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
