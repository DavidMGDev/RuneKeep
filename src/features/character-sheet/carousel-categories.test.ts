import { activeRing, availableCategories, type CustomCategory, nextCategory, ringContains } from './carousel-categories';

const CUSTOM: CustomCategory[] = [
  { id: 'cat-a', label: 'Spells', icon: 'flame' },
  { id: 'cat-b', label: 'Quests', icon: 'scroll' },
];

// #306: `archive` is a built-in stash, last in the built-in order. The PURE ring includes it when not
// hidden; the sheet additionally drops EMPTY categories (so an empty archive never rides the carousel).

describe('activeRing', () => {
  it('shows abilities + inventory + notes + archive by default for a plain hero', () => {
    expect(activeRing({})).toEqual(['abilities', 'inventory', 'notes', 'archive']);
  });
  it('drops a category that is hidden', () => {
    expect(activeRing({ hidden: ['notes'] })).toEqual(['abilities', 'inventory', 'archive']);
  });
  it('adds wildshape for a druid (Notes then Archive last)', () => {
    expect(activeRing({ isDruid: true })).toEqual(['abilities', 'inventory', 'wildshape', 'notes', 'archive']);
  });
  it('honors multiple hidden categories', () => {
    expect(activeRing({ isDruid: true, hidden: ['notes', 'inventory', 'archive'] })).toEqual(['abilities', 'wildshape']);
  });
  it('never returns empty — falls back to abilities', () => {
    expect(activeRing({ hidden: ['abilities', 'inventory', 'notes', 'archive'] })).toEqual(['abilities']);
  });
});

describe('nextCategory', () => {
  const ring = activeRing({ isDruid: true }); // [abilities, inventory, wildshape, notes, archive]
  it('steps forward and wraps', () => {
    expect(nextCategory(ring, 'abilities', 1)).toBe('inventory');
    expect(nextCategory(ring, 'wildshape', 1)).toBe('notes');
    expect(nextCategory(ring, 'notes', 1)).toBe('archive');
    expect(nextCategory(ring, 'archive', 1)).toBe('abilities');
  });
  it('steps backward and wraps', () => {
    expect(nextCategory(ring, 'abilities', -1)).toBe('archive');
    expect(nextCategory(ring, 'inventory', -1)).toBe('abilities');
  });
  it('with two categories, both directions are the other one (old toggle behavior)', () => {
    const two = activeRing({ hidden: ['notes', 'archive'] }); // [abilities, inventory]
    expect(nextCategory(two, 'abilities', 1)).toBe('inventory');
    expect(nextCategory(two, 'abilities', -1)).toBe('inventory');
    expect(nextCategory(two, 'inventory', 1)).toBe('abilities');
  });
  it('falls back to the first ring entry when current is no longer present', () => {
    const two = activeRing({ hidden: ['notes', 'archive'] });
    expect(nextCategory(two, 'notes', 1)).toBe('abilities');
  });
});

describe('ringContains', () => {
  it('reflects membership', () => {
    expect(ringContains(activeRing({ hidden: ['notes'] }), 'notes')).toBe(false);
    expect(ringContains(activeRing({}), 'notes')).toBe(true);
    expect(ringContains(activeRing({}), 'archive')).toBe(true);
  });
});

describe('custom categories (#246)', () => {
  it('appends custom categories after the built-ins', () => {
    expect(activeRing({ custom: CUSTOM })).toEqual(['abilities', 'inventory', 'notes', 'archive', 'cat-a', 'cat-b']);
  });
  it('availableCategories lists built-in + custom (incl. wildshape for druids)', () => {
    expect(availableCategories({ isDruid: true, custom: CUSTOM })).toEqual(['abilities', 'inventory', 'wildshape', 'notes', 'archive', 'cat-a', 'cat-b']);
  });
  it('applies an explicit order, then appends anything not listed', () => {
    expect(activeRing({ custom: CUSTOM, order: ['cat-b', 'notes'] })).toEqual(['cat-b', 'notes', 'abilities', 'inventory', 'archive', 'cat-a']);
  });
  it('hides a custom category', () => {
    expect(activeRing({ custom: CUSTOM, hidden: ['cat-a'] })).toEqual(['abilities', 'inventory', 'notes', 'archive', 'cat-b']);
  });
  it('a custom category rides the overscroll ring', () => {
    const ring = activeRing({ custom: CUSTOM });
    expect(nextCategory(ring, 'archive', 1)).toBe('cat-a');
    expect(nextCategory(ring, 'cat-b', 1)).toBe('abilities');
  });
});

describe('subclass-gated categories (#311 companion)', () => {
  it('companion is hidden by default and shown only for Beastbound', () => {
    expect(activeRing({})).not.toContain('companion');
    expect(activeRing({ hasCompanion: true })).toEqual(['abilities', 'inventory', 'companion', 'notes', 'archive']);
  });
  it('availableCategories includes companion only when hasCompanion', () => {
    expect(availableCategories({})).not.toContain('companion');
    expect(availableCategories({ hasCompanion: true })).toContain('companion');
  });
  it('a Druid Beastbound (multiclass) shows both wildshape and companion', () => {
    expect(activeRing({ isDruid: true, hasCompanion: true })).toEqual(['abilities', 'inventory', 'wildshape', 'companion', 'notes', 'archive']);
  });
  it('martialform appears only for a Martial Artist (#357), after companion', () => {
    expect(availableCategories({})).not.toContain('martialform');
    expect(availableCategories({ hasMartialForm: true })).toContain('martialform');
    expect(activeRing({ hasMartialForm: true })).toEqual(['abilities', 'inventory', 'martialform', 'notes', 'archive']);
  });
});
