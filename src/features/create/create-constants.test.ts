import type { CustomStep } from '@/lib/content-types';
import type { CustomClassSpec } from '@/lib/custom-class';

import { CLASS_RESET, deckDone, decksFor, domainCardsWanted, EMPTY, inventoryGroups } from './create-constants';
import type { Draft } from './create-types';

const ORDERS: CustomStep = { typeId: 't1', key: 'custom:t1', label: 'Orders', pick: 2 };
const VOWS: CustomStep = { typeId: 't2', key: 'custom:t2', label: 'Vows', pick: 1 };

const keys = (list: { key: string }[]) => list.map((d) => d.key);

describe('where a custom step sits on the rail', () => {
  it('follows Ancestry, in place of Transform when no pack offers one', () => {
    const rail = keys(decksFor(false, false, [ORDERS]));
    expect(rail.indexOf('custom:t1')).toBe(rail.indexOf('ancestry') + 1);
    expect(rail).not.toContain('transformation');
  });

  // v0.43.3 (playtest): Transform is not part of making a character, pack enabled or not.
  it('leaves Transform out of ordinary creation and keeps it for characterize', () => {
    expect(keys(decksFor(false, true, [ORDERS]))).not.toContain('transformation');
    const rail = keys(decksFor(true, true));
    expect(rail.indexOf('transformation')).toBe(rail.indexOf('ancestry') + 1);
  });

  it('keeps several in the order the packs declare them', () => {
    expect(keys(decksFor(false, false, [ORDERS, VOWS])).slice(2, 5)).toEqual(['ancestry', 'custom:t1', 'custom:t2']);
  });

  it('never asks a characterized stat block which order it belongs to', () => {
    expect(keys(decksFor(true, true, [ORDERS]))).not.toContain('custom:t1');
  });

  it('changes nothing when no pack asks for a step', () => {
    expect(keys(decksFor(false, false, []))).toEqual(keys(decksFor(false, false)));
  });
});

describe('when a custom step counts as answered', () => {
  const draft = (picks: string[]): Draft => ({ ...EMPTY, customPicks: { t1: picks } });

  it('needs as many cards as its type asked for', () => {
    expect(deckDone('custom:t1', draft([]), [ORDERS])).toBe(false);
    expect(deckDone('custom:t1', draft(['a']), [ORDERS])).toBe(false);
    expect(deckDone('custom:t1', draft(['a', 'b']), [ORDERS])).toBe(true);
  });

  it('is answered by a Skip, like every other step', () => {
    expect(deckDone('custom:t1', { ...EMPTY, skipped: ['custom:t1'] }, [ORDERS])).toBe(true);
  });

  /** A pack switched off since the draft was saved must not leave the creator unable to finish. */
  it('does not block when its type is no longer around', () => {
    expect(deckDone('custom:t1', draft([]), [])).toBe(true);
  });
});

describe('the playtest report (v0.43.3)', () => {
  const potions = inventoryGroups('druid')[0];

  it('asks a homebrew class its own two lists, never its carrier\'s', () => {
    const spec = { choiceAItemIds: ['a', 'b'], choiceBItemIds: ['c', 'd'] } as CustomClassSpec;
    expect(inventoryGroups('druid', spec)).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('keeps both questions for an unfinished class, so the step can still be answered', () => {
    expect(inventoryGroups('druid', { choiceAItemIds: [], choiceBItemIds: [] } as unknown as CustomClassSpec)).toHaveLength(2);
  });

  it('asks a bundled class the guide\'s two questions, by option id', () => {
    expect(inventoryGroups('druid')).toHaveLength(2);
    expect(potions).toHaveLength(2);
    expect(inventoryGroups(null)).toEqual([]);
  });

  it('counts a homebrew item as ONE answer, not the whole step', () => {
    expect(deckDone('inventory', { ...EMPTY, inventoryLibIds: ['x'] })).toBe(false);
    expect(deckDone('inventory', { ...EMPTY, inventoryLibIds: ['x'], inventoryItemIds: ['y'] })).toBe(true);
    expect(deckDone('inventory', { ...EMPTY, inventoryItemIds: [potions[0]] })).toBe(false);
  });

  it('gives a School of Knowledge wizard a third domain card and nobody else', () => {
    const knowledge = 'subclass-school-of-knowledge-1-foundation';
    expect(domainCardsWanted(knowledge)).toBe(3);
    expect(domainCardsWanted('subclass-school-of-war-1-foundation')).toBe(2);
    expect(domainCardsWanted(null)).toBe(2);
    expect(deckDone('domains', { ...EMPTY, subclassCardId: knowledge, domainCardIds: ['a', 'b'] })).toBe(false);
    expect(deckDone('domains', { ...EMPTY, subclassCardId: knowledge, domainCardIds: ['a', 'b', 'c'] })).toBe(true);
    expect(deckDone('domains', { ...EMPTY, domainCardIds: ['a', 'b'] })).toBe(true);
  });

  it('clears everything that belonged to the last class', () => {
    expect(CLASS_RESET).toMatchObject({ subclassCardId: null, domainCardIds: [], inventoryItemIds: [], inventoryLibIds: [] });
  });
});
