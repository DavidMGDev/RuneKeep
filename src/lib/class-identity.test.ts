import { BUILTIN_CLASS_LABELS, builtinKeyFor, classDisplayName, classIdentityFor, displayTitle, inheritsClassLook, withClassIdentity, withClassIdentityAsPage } from './class-identity';
import type { LibraryCard } from './library';

const card = (over: Partial<LibraryCard> = {}): LibraryCard =>
  ({ id: 'c', contentType: 'generic', title: 'A card', text: '', imageUri: null, ...over });

const classBase = (title: string, over: Partial<LibraryCard> = {}) =>
  card({ id: `base-${title}`, contentType: 'class', title, color: '#884422', imageUri: 'banner.png', classSpec: { role: 'base', startingEvasion: 10, startingHp: 6, hopeFeature: { name: '', text: '' }, summary: '', domains: [], fixedItemIds: [], choiceAItemIds: [], choiceBItemIds: [] }, ...over });

const pack = [classBase('Warden')];

describe('classIdentityFor', () => {
  it('takes a homebrew class own colour and banner', () => {
    const id = classIdentityFor(pack, 'Warden')!;
    expect(id.title).toBe('Warden');
    expect(id.color).toBe('#884422');
    expect(id.imageUri).toBe('banner.png');
  });

  it('matches however the author capitalised it', () => {
    expect(classIdentityFor(pack, '  warden ')?.title).toBe('Warden');
  });

  it('falls back to a PUBLISHED class palette, so a Bard page looks like a Bard', () => {
    const id = classIdentityFor(pack, 'Bard')!;
    expect(id.title).toBe('Bard');
    expect(id.color).toBeTruthy();
    expect(id.key).toBe('bard');
  });

  it('ignores a PAGE when looking for the class, because a page is not the class', () => {
    const pages = [card({ contentType: 'class', title: 'Not the base', className: 'Warden', classSpec: { role: 'page' } as never })];
    expect(classIdentityFor(pages, 'Warden')?.color).toBeUndefined();
  });

  it('says nothing about a card that names no class', () => {
    expect(classIdentityFor(pack, undefined)).toBeUndefined();
    expect(classIdentityFor(pack, '  ')).toBeUndefined();
  });

  it('still carries the NAME of a class that is not here', () => {
    expect(classIdentityFor([], 'Ghost')?.title).toBe('Ghost');
  });
});

describe('withClassIdentity', () => {
  const id = classIdentityFor(pack, 'Warden')!;

  it('paints a card in its class colours', () => {
    const out = withClassIdentity(card(), id);
    expect(out.color).toBe('#884422');
    expect(out.imageUri).toBe('banner.png');
  });

  it('keeps a card own name, because a feature is its own card', () => {
    expect(withClassIdentity(card({ title: 'Mark' }), id).title).toBe('Mark');
  });

  it('keeps a card own art when it has some', () => {
    expect(withClassIdentity(card({ imageUri: 'mine.png' }), id).imageUri).toBe('mine.png');
  });

  it('keeps a card own colour when it has one', () => {
    expect(withClassIdentity(card({ color: '#111111' }), id).color).toBe('#111111');
  });

  it('changes nothing when there is no class to inherit from', () => {
    const c = card();
    expect(withClassIdentity(c, undefined)).toBe(c);
  });
});

describe('withClassIdentityAsPage', () => {
  it('takes the class TITLE, because a page IS the class card', () => {
    const id = classIdentityFor(pack, 'Warden')!;
    expect(withClassIdentityAsPage(card({ title: 'whatever' }), id).title).toBe('Warden');
  });
});

describe('inheritsClassLook', () => {
  it('is true for a page, a feature and a subclass', () => {
    expect(inheritsClassLook(card({ contentType: 'class', classSpec: { role: 'page' } as never }))).toBe(true);
    expect(inheritsClassLook(card({ contentType: 'feature' }))).toBe(true);
    expect(inheritsClassLook(card({ contentType: 'subclass' }))).toBe(true);
  });

  it('is false for the class card itself, which IS the identity', () => {
    expect(inheritsClassLook(classBase('Warden'))).toBe(false);
  });

  it('is false for gear, because a rope is a rope', () => {
    expect(inheritsClassLook(card({ contentType: 'inventory' }))).toBe(false);
  });
});

describe('displayTitle', () => {
  it('gives a PAGE its class name, so it never has to be named itself', () => {
    const page = card({ contentType: 'class', title: '', className: 'Warden', classSpec: { role: 'page' } as never });
    expect(displayTitle(page, pack)).toBe('Warden');
  });

  it('leaves every other card its own name', () => {
    expect(displayTitle(card({ title: 'Mark' }), pack)).toBe('Mark');
  });
});

describe('classDisplayName and the label list', () => {
  it('capitalises a published class however it was stored (owner, item 11)', () => {
    expect(classDisplayName('bard')).toBe('Bard');
    expect(classDisplayName('WARRIOR')).toBe('Warrior');
  });

  it('capitalises a homebrew name without rewriting it', () => {
    expect(classDisplayName('the warden')).toBe('The warden');
  });

  it('offers every published class capitalised', () => {
    expect(BUILTIN_CLASS_LABELS.every((l) => l[0] === l[0].toUpperCase())).toBe(true);
  });

  it('resolves a label back to its key', () => {
    expect(builtinKeyFor('Bard')).toBe('bard');
    expect(builtinKeyFor('Nobody')).toBeUndefined();
  });
});
