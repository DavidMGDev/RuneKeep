/**
 * The wheel's hit-test has to agree with the wheel's drawing, wedge for wedge. They are generated
 * from one table, and this is what keeps them that way: if the order is ever changed again, a wedge
 * that reads "+3" and applies −1 fails here rather than at the table.
 */
import { pickWedge, RADIAL_WEDGES } from './radial-wedges';

/** A point on the wheel at `deg`, at the radius the labels are drawn at. */
function at(deg: number, r = 64): { dx: number; dy: number } {
  const a = (deg * Math.PI) / 180;
  return { dx: r * Math.cos(a), dy: r * Math.sin(a) };
}

describe('stat radial wedges', () => {
  it('picks the wedge drawn at each centre', () => {
    RADIAL_WEDGES.forEach((w, i) => {
      const { dx, dy } = at(w.center);
      expect(pickWedge(dx, dy)).toBe(i);
    });
  });

  it('reads as one scale: -3 bottom left through +3 top right', () => {
    // Screen coordinates: y grows downward, so the top row is the negative angles.
    const top = RADIAL_WEDGES.filter((w) => w.center < 0).sort((a, b) => Math.cos((a.center * Math.PI) / 180) - Math.cos((b.center * Math.PI) / 180));
    const bottom = RADIAL_WEDGES.filter((w) => w.center > 0).sort((a, b) => Math.cos((a.center * Math.PI) / 180) - Math.cos((b.center * Math.PI) / 180));
    expect(top.map((w) => w.delta)).toEqual([1, 2, 3]); // left to right
    expect(bottom.map((w) => w.delta)).toEqual([-3, -2, -1]); // left to right
  });

  it('cancels in the side gaps, the dead centre and past the ring', () => {
    expect(pickWedge(...Object.values(at(0)) as [number, number])).toBe(-1); // due right
    expect(pickWedge(...Object.values(at(180)) as [number, number])).toBe(-1); // due left
    expect(pickWedge(0, -4)).toBe(-1); // inside the dead zone
    expect(pickWedge(...Object.values(at(-90, 400)) as [number, number])).toBe(-1); // flung past the ring
  });
});
