import { activeRing, availableCategories, type CustomCategory, nextCategory, ringContains } from './carousel-categories';

const CUSTOM: CustomCategory[] = [
  { id: 'cat-a', label: 'Spells', icon: 'flame' },
  { id: 'cat-b', label: 'Quests', icon: 'scroll' },
];

describe('activeRing', () => {
  it('shows abilities + inventory + notes by default for a plain hero', () => {
    expect(activeRing({})).toEqual(['abilities', 'inventory', 'notes']);
  });
  it('drops a category that is hidden', () => {
    expect(activeRing({ hidden: ['notes'] })).toEqual(['abilities', 'inventory']);
  });
  it('adds wildshape for a druid (Notes last)', () => {
    expect(activeRing({ isDruid: true })).toEqual(['abilities', 'inventory', 'wildshape', 'notes']);
  });
  it('honors multiple hidden categories', () => {
    expect(activeRing({ isDruid: true, hidden: ['notes', 'inventory'] })).toEqual(['abilities', 'wildshape']);
  });
  it('never returns empty — falls back to abilities', () => {
    expect(activeRing({ hidden: ['abilities', 'inventory', 'notes'] })).toEqual(['abilities']);
  });
});

describe('nextCategory', () => {
  const ring = activeRing({ isDruid: true }); // [abilities, inventory, wildshape, notes]
  it('steps forward and wraps', () => {
    expect(nextCategory(ring, 'abilities', 1)).toBe('inventory');
    expect(nextCategory(ring, 'wildshape', 1)).toBe('notes');
    expect(nextCategory(ring, 'notes', 1)).toBe('abilities');
  });
  it('steps backward and wraps', () => {
    expect(nextCategory(ring, 'abilities', -1)).toBe('notes');
    expect(nextCategory(ring, 'inventory', -1)).toBe('abilities');
  });
  it('with two categories, both directions are the other one (old toggle behavior)', () => {
    const two = activeRing({ hidden: ['notes'] }); // [abilities, inventory]
    expect(nextCategory(two, 'abilities', 1)).toBe('inventory');
    expect(nextCategory(two, 'abilities', -1)).toBe('inventory');
    expect(nextCategory(two, 'inventory', 1)).toBe('abilities');
  });
  it('falls back to the first ring entry when current is no longer present', () => {
    const two = activeRing({ hidden: ['notes'] });
    expect(nextCategory(two, 'notes', 1)).toBe('abilities');
  });
});

describe('ringContains', () => {
  it('reflects membership', () => {
    expect(ringContains(activeRing({ hidden: ['notes'] }), 'notes')).toBe(false);
    expect(ringContains(activeRing({}), 'notes')).toBe(true);
  });
});

describe('custom categories (#246)', () => {
  it('appends custom categories after the built-ins', () => {
    expect(activeRing({ custom: CUSTOM })).toEqual(['abilities', 'inventory', 'notes', 'cat-a', 'cat-b']);
  });
  it('availableCategories lists built-in + custom (incl. wildshape for druids)', () => {
    expect(availableCategories({ isDruid: true, custom: CUSTOM })).toEqual(['abilities', 'inventory', 'wildshape', 'notes', 'cat-a', 'cat-b']);
  });
  it('applies an explicit order, then appends anything not listed', () => {
    expect(activeRing({ custom: CUSTOM, order: ['cat-b', 'notes'] })).toEqual(['cat-b', 'notes', 'abilities', 'inventory', 'cat-a']);
  });
  it('hides a custom category', () => {
    expect(activeRing({ custom: CUSTOM, hidden: ['cat-a'] })).toEqual(['abilities', 'inventory', 'notes', 'cat-b']);
  });
  it('a custom category rides the overscroll ring', () => {
    const ring = activeRing({ custom: CUSTOM });
    expect(nextCategory(ring, 'notes', 1)).toBe('cat-a');
    expect(nextCategory(ring, 'cat-b', 1)).toBe('abilities');
  });
});
