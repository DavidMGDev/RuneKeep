import { assembleClass, assembleClasses, classTitles, expandedMark, faceMark, inheritedPage, isClassBase, isClassPage, withoutClassPages } from './custom-class-pages';
import type { LibraryCard } from './library';

const base = (title: string, over: Partial<LibraryCard> = {}): LibraryCard => ({
  id: `base-${title}`, contentType: 'class', title, text: '', imageUri: null, color: '#884422',
  classSpec: { role: 'base', startingEvasion: 10, startingHp: 6, hopeFeature: { name: '', text: '' }, summary: 's', domains: ['sage', 'valor'], fixedItemIds: [], choiceAItemIds: [], choiceBItemIds: [] },
  ...over,
});

const page = (id: string, className: string, over: Partial<LibraryCard> = {}): LibraryCard => ({
  id, contentType: 'class', title: 'whatever the author typed', text: 'A page', imageUri: null, className,
  classSpec: { role: 'page', startingEvasion: 0, startingHp: 0, hopeFeature: { name: '', text: '' }, summary: '', domains: [], fixedItemIds: [], choiceAItemIds: [], choiceBItemIds: [] },
  ...over,
});

describe('isClassBase / isClassPage', () => {
  it('tells the first page of a class from a further one', () => {
    expect(isClassBase(base('Warden'))).toBe(true);
    expect(isClassPage(base('Warden'))).toBe(false);
    expect(isClassPage(page('p1', 'Warden'))).toBe(true);
  });

  it('treats a class authored before roles existed as a base, which is what it was', () => {
    expect(isClassBase({ id: 'x', contentType: 'class', title: 'Old', text: '', imageUri: null })).toBe(true);
  });

  it('says nothing about a card that is not a class at all', () => {
    expect(isClassBase({ id: 'f', contentType: 'feature', title: 'F', text: '', imageUri: null })).toBe(false);
  });
});

describe('inheritedPage', () => {
  const b = base('Warden', { imageUri: 'art.png', color: '#123456' });

  it('takes the class title, so the pages read as one card', () => {
    expect(inheritedPage(page('p', 'Warden'), b).title).toBe('Warden');
  });

  it('takes the class colour and art', () => {
    const out = inheritedPage(page('p', 'Warden'), b);
    expect(out.color).toBe('#123456');
    expect(out.imageUri).toBe('art.png');
  });

  it('keeps a page own art when it has some', () => {
    expect(inheritedPage(page('p', 'Warden', { imageUri: 'mine.png' }), b).imageUri).toBe('mine.png');
  });

  it('keeps the page own text, which is the only thing that is really the page own', () => {
    expect(inheritedPage(page('p', 'Warden', { text: 'Mine' }), b).text).toBe('Mine');
  });
});

describe('assembleClass', () => {
  it('puts the base first and its pages after, in authored order', () => {
    const cards = [base('Warden'), page('p1', 'Warden'), page('p2', 'Warden')];
    const a = assembleClass(cards, cards[0]);
    /**
     * v0.43.1: the CLASS CARD IS NOT A FACE. It is a template that declares the class, not a page
     * anybody reads, and putting it in the deck put a card with a name and no content at the front
     * of every homebrew class.
     */
    expect(a.faces.map((f) => f.id)).toEqual(['p1', 'p2']);
  });

  it('shows the class card only when the class has no info cards yet', () => {
    const cards = [base('Warden')];
    expect(assembleClass(cards, cards[0]).faces.map((f) => f.id)).toEqual(['base-Warden']);
  });

  it('matches the class however the author capitalised it', () => {
    const cards = [base('Warden'), page('p1', '  warden ')];
    expect(assembleClass(cards, cards[0]).pages).toHaveLength(1);
  });

  it('ignores pages belonging to another class', () => {
    const cards = [base('Warden'), page('p1', 'Bard')];
    expect(assembleClass(cards, cards[0]).pages).toEqual([]);
  });
});

describe('assembleClasses', () => {
  it('gives one assembly per class', () => {
    const cards = [base('Warden'), page('p1', 'Warden'), base('Seer'), page('p2', 'Seer')];
    expect(assembleClasses(cards).map((a) => a.base.title)).toEqual(['Warden', 'Seer']);
  });

  it('DROPS a page whose class is not here, because half a card says nothing', () => {
    expect(assembleClasses([page('orphan', 'Nobody')])).toEqual([]);
  });
});

describe('withoutClassPages', () => {
  it('removes the pages, because they are already inside their class card', () => {
    const cards = [base('Warden'), page('p1', 'Warden'), { id: 'f', contentType: 'feature' as const, title: 'F', text: '', imageUri: null }];
    expect(withoutClassPages(cards).map((c) => c.id)).toEqual(['base-Warden', 'f']);
  });
});

describe('the page marks', () => {
  it('counts every face while the class is one card', () => {
    expect(faceMark(0, 3)).toBe('1/3');
    expect(faceMark(2, 3)).toBe('3/3');
  });

  it('counts only the pages once it is expanded, because the first page is gone', () => {
    expect(expandedMark(0, 2)).toBe('1/2');
    expect(expandedMark(1, 2)).toBe('2/2');
  });
});

describe('classTitles', () => {
  it('names the bases and not the pages', () => {
    expect(classTitles([base('Warden'), page('p', 'Warden'), base('Seer')])).toEqual(['Warden', 'Seer']);
  });
});
