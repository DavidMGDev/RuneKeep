import { describe, expect, it } from '@jest/globals';

import { resolveHearts, resolvePips } from './pips';

describe('resolvePips', () => {
  it('renders all-active when active equals total', () => {
    expect(resolvePips({ total: 6, active: 6 })).toEqual(Array(6).fill('active'));
  });

  it('fills active first, then empty remainder', () => {
    expect(resolvePips({ total: 6, active: 4 })).toEqual([
      'active', 'active', 'active', 'active', 'empty', 'empty',
    ]);
  });

  it('renders the remainder as depleted when requested (Hope: 5 of 6)', () => {
    expect(resolvePips({ total: 6, active: 5, depletedRemainder: true })).toEqual([
      'active', 'active', 'active', 'active', 'active', 'depleted',
    ]);
  });

  it('places locked slots last (Stress: 10 active, 1 depleted, 1 locked)', () => {
    const pips = resolvePips({ total: 12, active: 10, locked: 1, depletedRemainder: true });
    expect(pips).toHaveLength(12);
    expect(pips.filter((p) => p === 'active')).toHaveLength(10);
    expect(pips.at(-1)).toBe('locked');
    expect(pips.filter((p) => p === 'depleted')).toHaveLength(1);
  });

  it('matches the armor track (9 active, 2 depleted, 1 locked of 12)', () => {
    const pips = resolvePips({ total: 12, active: 9, locked: 1, depletedRemainder: true });
    expect(pips.filter((p) => p === 'active')).toHaveLength(9);
    expect(pips.filter((p) => p === 'depleted')).toHaveLength(2);
    expect(pips.filter((p) => p === 'locked')).toHaveLength(1);
  });

  it('clamps active to the number of unlocked slots', () => {
    const pips = resolvePips({ total: 5, active: 99, locked: 2 });
    expect(pips.filter((p) => p === 'active')).toHaveLength(3);
    expect(pips.filter((p) => p === 'locked')).toHaveLength(2);
  });

  it('never produces more slots than total, even with absurd inputs', () => {
    expect(resolvePips({ total: 4, active: -3, locked: 99 })).toHaveLength(4);
  });
});

describe('resolveHearts (golden ×2 HP, slots = 6)', () => {
  // The §1A state table — each row is HP → [golden, red, empty] and the derived readout.
  const cases: [number, number, number, number, string][] = [
    [0, 0, 0, 6, '0 / 12'],
    [5, 0, 5, 1, '5 / 12'],
    [6, 0, 6, 0, '6 / 12'],
    [7, 1, 5, 0, '7 / 12'],
    [8, 2, 4, 0, '8 / 12'],
    [12, 6, 0, 0, '12 / 12'],
  ];
  it.each(cases)('hp %i → %i golden, %i red, %i empty (%s)', (hp, golden, red, empty, readout) => {
    const h = resolveHearts(hp, 6);
    expect([h.golden, h.red, h.empty]).toEqual([golden, red, empty]);
    expect(`${h.current} / ${h.max}`).toBe(readout);
    expect(h.states).toHaveLength(6);
  });

  it('orders golden first, then red, then empty', () => {
    expect(resolveHearts(8, 6).states).toEqual(['golden', 'golden', 'active', 'active', 'active', 'active']);
  });

  it('never shows golden until all slots are red (HP ≥ 7)', () => {
    expect(resolveHearts(6, 6).states.includes('golden')).toBe(false);
    expect(resolveHearts(7, 6).states.includes('golden')).toBe(true);
  });

  it('the summed pip worth always equals current HP', () => {
    for (let hp = 0; hp <= 12; hp++) {
      const h = resolveHearts(hp, 6);
      expect(h.golden * 2 + h.red).toBe(h.current);
    }
  });

  it('clamps HP into 0..max', () => {
    expect(resolveHearts(99, 6).current).toBe(12);
    expect(resolveHearts(-5, 6).current).toBe(0);
  });
});

describe('heartBoundaries (#81: only the two boundary hearts are interactive)', () => {
  const { heartBoundaries } = require('./pips');

  it('hp 5/12: last red (#5 -> idx 4) breaks, first empty (#6 -> idx 5) fills', () => {
    expect(heartBoundaries(5)).toEqual({ up: 5, upAction: 'fill', down: 4, downAction: 'break' });
  });

  it('hp 0: nothing to lose, first slot fills', () => {
    expect(heartBoundaries(0)).toEqual({ up: 0, upAction: 'fill', down: -1, downAction: 'break' });
  });

  it('hp 6 (all red): the FIRST heart goldifies, the last red breaks', () => {
    expect(heartBoundaries(6)).toEqual({ up: 0, upAction: 'goldify', down: 5, downAction: 'break' });
  });

  it('hp 7: the lone golden degolds, the next red goldifies', () => {
    expect(heartBoundaries(7)).toEqual({ up: 1, upAction: 'goldify', down: 0, downAction: 'degold' });
  });

  it('hp 12: full golden — only the last golden can degold', () => {
    expect(heartBoundaries(12)).toEqual({ up: -1, upAction: 'goldify', down: 5, downAction: 'degold' });
  });
});
