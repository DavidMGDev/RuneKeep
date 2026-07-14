import { nextMixSlot } from './create-types';

// Feature 3: the exact Random-press sequence the owner spec'd — 1/2 → 2/2 → re-roll first → re-roll
// second, and a mid-sequence deselect refilling the freed slot without breaking the crossout order.
describe('nextMixSlot', () => {
  const roll = (first: string | null, second: string | null, alt: 'first' | 'second') => nextMixSlot(first, second, alt);

  it('fills empty slots in order, then alternates once both are full', () => {
    // press 1: both empty → first
    let r = roll(null, null, 'first');
    expect(r.slot).toBe('first');
    // press 2: first full → second
    r = roll('anc-a', null, r.alt);
    expect(r.slot).toBe('second');
    // press 3: both full → re-roll first
    r = roll('anc-a', 'anc-b', r.alt);
    expect(r.slot).toBe('first');
    // press 4: both full → re-roll second
    r = roll('anc-c', 'anc-b', r.alt);
    expect(r.slot).toBe('second');
    // press 5: both full → back to first
    r = roll('anc-c', 'anc-d', r.alt);
    expect(r.slot).toBe('first');
  });

  it('refills the freed slot after a deselect (order/crossout stays intact)', () => {
    // both full, user deselects the FIRST slot → next Random must refill first, not touch second
    const r = roll(null, 'anc-b', 'second');
    expect(r.slot).toBe('first');
    // ...and deselecting the SECOND slot refills second
    expect(roll('anc-a', null, 'first').slot).toBe('second');
  });
});
