import type { CustomStep } from '@/lib/content-types';

import { deckDone, decksFor, EMPTY } from './create-constants';
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

  it('sits beside Transform when there is one, after it', () => {
    const rail = keys(decksFor(false, true, [ORDERS]));
    expect(rail.indexOf('transformation')).toBe(rail.indexOf('ancestry') + 1);
    expect(rail.indexOf('custom:t1')).toBe(rail.indexOf('transformation') + 1);
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
