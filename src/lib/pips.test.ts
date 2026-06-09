import { describe, expect, it } from '@jest/globals';

import { resolvePips } from './pips';

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
