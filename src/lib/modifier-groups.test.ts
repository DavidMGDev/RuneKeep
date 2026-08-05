import { deleteGroup, freeGroupName, groupEffects, groupNames, isGroupOn, isGroupOpen, moveToGroup, renameGroup, setGroupOn, setGroupOpen } from './modifier-groups';
import type { CardEffect } from './modifiers';

const EFFECTS: CardEffect[] = [
  { target: 'evasion', delta: 1 },
  { target: 'maxHp', delta: 2, group: 'Storm' },
  { target: 'agility', delta: -1, group: 'Storm' },
  { target: 'presence', delta: 3, group: 'Blessing' },
];

describe('grouping', () => {
  it('leads with the ungrouped band, then each group in first-appearance order', () => {
    const bands = groupEffects(EFFECTS);
    expect(bands.map((b) => b.name)).toEqual([null, 'Storm', 'Blessing']);
    expect(bands[1].rows.map((r) => r.index)).toEqual([1, 2]);
  });

  it('keeps each row pointing at its index in the original list', () => {
    const bands = groupEffects(EFFECTS);
    expect(bands[2].rows[0]).toEqual({ effect: EFFECTS[3], index: 3 });
  });

  it('treats a blank group name as no group', () => {
    expect(groupNames([{ target: 'evasion', delta: 1, group: '  ' }])).toEqual([]);
  });
});

describe('toggling a group', () => {
  it('switches every modifier inside it and nothing outside', () => {
    const off = setGroupOn(EFFECTS, 'Storm', false);
    expect(off.filter((e) => e.off)).toHaveLength(2);
    expect(off[0].off).toBeUndefined();
    expect(off[3].off).toBeUndefined();
  });

  it('reads as on while any one of its modifiers is live', () => {
    const half = EFFECTS.map((e, i) => (i === 1 ? { ...e, off: true } : e));
    expect(isGroupOn(half, 'Storm')).toBe(true);
    expect(isGroupOn(setGroupOn(half, 'Storm', false), 'Storm')).toBe(false);
  });

  it('switches a half-off group fully back on', () => {
    const half = EFFECTS.map((e, i) => (i === 1 ? { ...e, off: true } : e));
    expect(setGroupOn(half, 'Storm', true).filter((e) => e.off)).toHaveLength(0);
  });
});

describe('moving and deleting', () => {
  it('moves one modifier between groups without touching the others', () => {
    const moved = moveToGroup(EFFECTS, 3, 'Storm');
    expect(groupEffects(moved).find((b) => b.name === 'Storm')?.rows).toHaveLength(3);
    expect(groupNames(moved)).toEqual(['Storm']);
  });

  it('moves a modifier out of every group', () => {
    const moved = moveToGroup(EFFECTS, 1, null);
    expect(moved[1].group).toBeUndefined();
    expect(groupEffects(moved)[0].rows).toHaveLength(2);
  });

  it('deleting a group keeps its modifiers, ungrouped', () => {
    const after = deleteGroup(EFFECTS, 'Storm');
    expect(after).toHaveLength(4);
    expect(groupNames(after)).toEqual(['Blessing']);
    expect(after[1].delta).toBe(2);
  });

  it('renaming keeps the modifiers together under the new name', () => {
    const after = renameGroup(EFFECTS, 'Storm', 'Gale');
    expect(groupNames(after)).toEqual(['Gale', 'Blessing']);
    expect(after.filter((e) => e.group === 'Gale')).toHaveLength(2);
  });

  it('never hands out a name that is already taken', () => {
    expect(freeGroupName(EFFECTS, 'Storm')).toBe('Storm 2');
    expect(freeGroupName(EFFECTS)).toBe('Group');
  });
});

describe('collapsed state', () => {
  it('is open until it has been closed, and closes per card', () => {
    expect(isGroupOpen(undefined, 'card-1', 'Storm')).toBe(true);
    const closed = setGroupOpen(undefined, 'card-1', 'Storm', false);
    expect(isGroupOpen(closed, 'card-1', 'Storm')).toBe(false);
    expect(isGroupOpen(closed, 'card-2', 'Storm')).toBe(true);
  });

  it('does not accumulate duplicate entries', () => {
    let closed = setGroupOpen(undefined, 'c', 'g', false);
    closed = setGroupOpen(closed, 'c', 'g', false);
    expect(closed).toHaveLength(1);
    expect(setGroupOpen(closed, 'c', 'g', true)).toHaveLength(0);
  });
});
