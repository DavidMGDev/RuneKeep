import { reorderBlock } from './edit-drag';
import { pickWedgeFull, cardMenuAngle, clampMenuAnchor, CARD_MENU_DEAD } from './carousel-geometry';

describe('reorderBlock — multi-select drag (v0.10.7)', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  it('moves a non-contiguous selection as one block, preserving relative order', () => {
    // drag {b, d} to the front of the remaining [a, c, e]
    expect(reorderBlock(ids, new Set(['b', 'd']), 0)).toEqual(['b', 'd', 'a', 'c', 'e']);
    // ...between a and c
    expect(reorderBlock(ids, new Set(['b', 'd']), 1)).toEqual(['a', 'b', 'd', 'c', 'e']);
    // ...to the end
    expect(reorderBlock(ids, new Set(['b', 'd']), 3)).toEqual(['a', 'c', 'e', 'b', 'd']);
  });
  it('a single-card drag still works', () => {
    // remaining [b,c,d,e], insert 'a' at index 2 → between c and d
    expect(reorderBlock(ids, new Set(['a']), 2)).toEqual(['b', 'c', 'a', 'd', 'e']);
  });
  it('clamps insertAt to the remaining length', () => {
    expect(reorderBlock(ids, new Set(['a', 'b']), 99)).toEqual(['c', 'd', 'e', 'a', 'b']);
    expect(reorderBlock(ids, new Set(['a', 'b']), -5)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('pickWedgeFull — full-circle radial hit-test', () => {
  it('due-north is option 0', () => {
    expect(pickWedgeFull(200, 400, 200, 400 - 50, 5)).toBe(0);
  });
  it('cancels inside the dead-zone', () => {
    expect(pickWedgeFull(200, 400, 200, 400, 5, CARD_MENU_DEAD)).toBe(-1);
    expect(pickWedgeFull(200, 400, 205, 400, 5, CARD_MENU_DEAD)).toBe(-1);
  });
  it('resolves each of the five directions to a distinct option', () => {
    const got = new Set<number>();
    for (let i = 0; i < 5; i++) {
      const a = (cardMenuAngle(i, 5) * Math.PI) / 180;
      got.add(pickWedgeFull(200, 400, 200 + 60 * Math.cos(a), 400 + 60 * Math.sin(a), 5));
    }
    expect(got).toEqual(new Set([0, 1, 2, 3, 4]));
  });
  it('a single-option menu selects it from any direction past the dead-zone', () => {
    expect(pickWedgeFull(200, 400, 200 + 50, 400, 1)).toBe(0);
    expect(pickWedgeFull(200, 400, 200, 400 + 50, 1)).toBe(0);
  });
});

describe('clampMenuAnchor — keep the wheel on screen', () => {
  it('pushes an edge anchor inward on both axes', () => {
    const c = clampMenuAnchor(4, 850);
    expect(c.x).toBeGreaterThan(4);
    expect(c.y).toBeLessThan(850);
    // a centred anchor is untouched
    expect(clampMenuAnchor(206, 446)).toEqual({ x: 206, y: 446 });
  });
});
