import { reorderBlock } from './edit-drag';
import { cardMenuAngle, clampMenuAnchor } from './carousel-geometry';

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
  it('dropping a block back at its own position returns the IDENTICAL order (a no-op → no commit)', () => {
    // v0.11.2 item 8d: the drag commit deselects only on a REAL move. Dropping {b,c} right after `a`
    // (their own spot) must equal the original — the signal that nothing changed.
    expect(reorderBlock(ids, new Set(['b', 'c']), 1)).toEqual(ids);
    expect(reorderBlock(ids, new Set(['a']), 0)).toEqual(ids); // first card back to the front
  });
});

describe('cardMenuAngle — even full-circle spacing from due-north', () => {
  it('option 0 is straight up (-90°)', () => {
    expect(cardMenuAngle(0, 5)).toBe(-90);
    expect(cardMenuAngle(0, 1)).toBe(-90);
  });
  it('steps by 360/n', () => {
    expect(cardMenuAngle(1, 4)).toBe(0);
    expect(cardMenuAngle(2, 4)).toBe(90);
  });
});

describe('clampMenuAnchor — keep the (bigger, v0.11.0) wheel on screen', () => {
  it('pushes an edge anchor inward on both axes', () => {
    const c = clampMenuAnchor(4, 850);
    expect(c.x).toBeGreaterThan(4);
    expect(c.y).toBeLessThan(850);
    // a centred anchor is untouched
    expect(clampMenuAnchor(206, 446)).toEqual({ x: 206, y: 446 });
  });
});
