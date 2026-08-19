import { isTemplateCard, plaqueIsSet, plaqueLabelFor, resolvedPlaque, templateOf, withResolvedPlaque } from './card-plaque';
import type { LibraryCard } from './library';

const card = (p: Partial<LibraryCard> & { id: string }): LibraryCard => ({
  contentType: 'generic', title: '', text: '', imageUri: null, ...p,
});

const ORDER = card({ id: 't1', contentType: 'type', title: 'Knights Radiant', plaque: { from: '#123456', to: '#654321', text: '#FFFFFF' } });
const WINDRUNNER = card({ id: 'c1', title: 'Windrunner', customType: 't1' });

const WARDEN = card({ id: 'cl1', contentType: 'class', title: 'Warden', plaque: { label: 'Warden', from: '#0A0A0A', to: '#1A1A1A' } });
const WARDEN_PAGE = card({ id: 'cl2', contentType: 'class', title: 'Warden', className: 'Warden', classSpec: { role: 'page' } as never });
const WARDEN_FEATURE = card({ id: 'f1', contentType: 'feature', title: 'Stone Skin', className: 'warden' });

const PYRE = card({ id: 'd1', contentType: 'customDomain', title: 'Pyre', plaque: { label: 'Pyre', from: '#801A1A', to: '#4A0E0E' } });
const PYRE_CARD = card({ id: 'd2', contentType: 'domain', title: 'Ember', domain: 'Pyre' });

const PACK = [ORDER, WINDRUNNER, WARDEN, WARDEN_PAGE, WARDEN_FEATURE, PYRE, PYRE_CARD];

describe('plaqueIsSet', () => {
  it('is false for nothing and for an empty spec', () => {
    expect(plaqueIsSet(undefined)).toBe(false);
    expect(plaqueIsSet({})).toBe(false);
    expect(plaqueIsSet({ label: '   ' })).toBe(false);
  });
  it('is true as soon as anything is said', () => {
    expect(plaqueIsSet({ label: 'Order' })).toBe(true);
    expect(plaqueIsSet({ from: '#000' })).toBe(true);
  });
});

describe('isTemplateCard', () => {
  it('names the three kinds that declare a set', () => {
    expect(isTemplateCard(ORDER)).toBe(true);
    expect(isTemplateCard(WARDEN)).toBe(true);
    expect(isTemplateCard(PYRE)).toBe(true);
    expect(isTemplateCard(WINDRUNNER)).toBe(false);
  });
});

describe('templateOf', () => {
  it('finds a card’s type', () => {
    expect(templateOf(WINDRUNNER, PACK)?.id).toBe('t1');
  });
  it('finds a domain card’s domain, matching loosely on the name', () => {
    expect(templateOf(PYRE_CARD, PACK)?.id).toBe('d1');
  });
  it('finds a class page’s class, and a feature’s, whatever the capitals', () => {
    expect(templateOf(WARDEN_PAGE, PACK)?.id).toBe('cl1');
    expect(templateOf(WARDEN_FEATURE, PACK)?.id).toBe('cl1');
  });
  it('never makes the class BASE its own template', () => {
    expect(templateOf(WARDEN, PACK)).toBeUndefined();
  });
  it('finds nothing for an ordinary card, or with no pack to look in', () => {
    expect(templateOf(card({ id: 'x', title: 'A rope' }), PACK)).toBeUndefined();
    expect(templateOf(WINDRUNNER, undefined)).toBeUndefined();
  });
});

describe('resolvedPlaque', () => {
  it('inherits the template’s chip', () => {
    expect(resolvedPlaque(WINDRUNNER, PACK)).toEqual(ORDER.plaque);
    expect(resolvedPlaque(WARDEN_FEATURE, PACK)).toEqual(WARDEN.plaque);
  });
  it('lets a card disagree with its set', () => {
    const own = { ...WINDRUNNER, plaque: { label: 'Herald', from: '#FFFFFF' } };
    expect(resolvedPlaque(own, PACK)).toEqual(own.plaque);
  });
  it('returns nothing when neither the card nor its set says anything', () => {
    expect(resolvedPlaque(card({ id: 'x', title: 'A rope' }), PACK)).toBeUndefined();
  });
});

describe('plaqueLabelFor', () => {
  it('prefers the card’s own type label, which is what a player writes', () => {
    const own = { ...WINDRUNNER, typeLabel: 'Relic' };
    expect(plaqueLabelFor(own, 'Card', PACK)).toBe('Relic');
  });
  it('falls back to the TYPE’S NAME when its chip named nothing', () => {
    // The Order's chip sets colours only, so the word comes from the type itself.
    expect(plaqueLabelFor(WINDRUNNER, 'Card', PACK)).toBe('Knights Radiant');
  });
  it('uses an inherited chip word when there is one', () => {
    expect(plaqueLabelFor(WARDEN_FEATURE, 'Feature', PACK)).toBe('Warden');
  });
  it('falls back to what the card is when nothing else names it', () => {
    expect(plaqueLabelFor(card({ id: 'x', title: 'A rope' }), 'Item', PACK)).toBe('Item');
  });
});

describe('withResolvedPlaque', () => {
  it('stamps the inherited chip onto the copy, name included', () => {
    expect(withResolvedPlaque(WINDRUNNER, PACK).plaque).toEqual({ ...ORDER.plaque, label: 'Knights Radiant' });
  });
  it('leaves a card that already has its own chip alone', () => {
    const own = { ...WINDRUNNER, plaque: { label: 'Herald' } };
    expect(withResolvedPlaque(own, PACK)).toBe(own);
  });
  it('leaves a card with nothing to inherit alone', () => {
    const rope = card({ id: 'x', title: 'A rope' });
    expect(withResolvedPlaque(rope, PACK)).toBe(rope);
  });
  it('is a no-op with no pack, which is what an unresolvable copy should be', () => {
    expect(withResolvedPlaque(WINDRUNNER, undefined)).toBe(WINDRUNNER);
  });
});
