import { activeRing, nextCategory, ringContains } from './carousel-categories';

describe('activeRing', () => {
  it('is just abilities + inventory for a plain hero', () => {
    expect(activeRing({})).toEqual(['abilities', 'inventory']);
  });
  it('adds notes when toggled on', () => {
    expect(activeRing({ showNotes: true })).toEqual(['abilities', 'inventory', 'notes']);
  });
  it('adds wildshape for a druid', () => {
    expect(activeRing({ isDruid: true })).toEqual(['abilities', 'inventory', 'wildshape']);
  });
  it('is four categories for a druid with notes, in canonical order', () => {
    expect(activeRing({ isDruid: true, showNotes: true })).toEqual(['abilities', 'inventory', 'notes', 'wildshape']);
  });
});

describe('nextCategory', () => {
  const ring = activeRing({ isDruid: true, showNotes: true });
  it('steps forward and wraps', () => {
    expect(nextCategory(ring, 'abilities', 1)).toBe('inventory');
    expect(nextCategory(ring, 'wildshape', 1)).toBe('abilities');
  });
  it('steps backward and wraps', () => {
    expect(nextCategory(ring, 'abilities', -1)).toBe('wildshape');
    expect(nextCategory(ring, 'inventory', -1)).toBe('abilities');
  });
  it('with two categories, both directions are the other one (old toggle behavior)', () => {
    const two = activeRing({});
    expect(nextCategory(two, 'abilities', 1)).toBe('inventory');
    expect(nextCategory(two, 'abilities', -1)).toBe('inventory');
    expect(nextCategory(two, 'inventory', 1)).toBe('abilities');
  });
  it('falls back to the first ring entry when current is no longer present', () => {
    const two = activeRing({});
    expect(nextCategory(two, 'notes', 1)).toBe('abilities');
  });
});

describe('ringContains', () => {
  it('reflects membership', () => {
    expect(ringContains(activeRing({}), 'notes')).toBe(false);
    expect(ringContains(activeRing({ showNotes: true }), 'notes')).toBe(true);
  });
});
