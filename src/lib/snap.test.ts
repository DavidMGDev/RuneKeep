import { ANGLE_SNAP, ANGLE_TARGETS, CENTRE_SNAP, snapValue } from './snap';

const angles = [...ANGLE_TARGETS];

describe('snapValue', () => {
  it('captures a value that comes close to a target', () => {
    const r = snapValue(87, angles, ANGLE_SNAP, null);
    expect(r.value).toBe(90);
    expect(r.target).toBe(90);
  });

  it('leaves a value alone when nothing is near', () => {
    const r = snapValue(45, angles, ANGLE_SNAP, null);
    expect(r.value).toBe(45);
    expect(r.target).toBeNull();
  });

  // The hysteresis: 10 degrees away is too far to be captured, but not far enough to be released.
  it('holds a captured target past the distance that would have captured it', () => {
    expect(snapValue(100, angles, ANGLE_SNAP, null).target).toBeNull();
    expect(snapValue(100, angles, ANGLE_SNAP, 90).value).toBe(90);
  });

  it('releases only past the wider threshold', () => {
    expect(snapValue(103, angles, ANGLE_SNAP, 90).target).toBe(90);
    expect(snapValue(104, angles, ANGLE_SNAP, 90).target).toBeNull();
    expect(snapValue(104, angles, ANGLE_SNAP, 90).value).toBe(104);
  });

  it('reports the entry exactly once, so a haptic cannot stutter', () => {
    const first = snapValue(88, angles, ANGLE_SNAP, null);
    expect(first.entered).toBe(true);
    expect(snapValue(89, angles, ANGLE_SNAP, first.target).entered).toBe(false);
    expect(snapValue(91, angles, ANGLE_SNAP, first.target).entered).toBe(false);
  });

  it('reports a fresh entry when the value moves to a DIFFERENT target', () => {
    const r = snapValue(180, angles, ANGLE_SNAP, 90);
    expect(r.target).toBe(180);
    expect(r.entered).toBe(true);
  });

  it('takes the short way round at the wrap point', () => {
    expect(snapValue(357, angles, ANGLE_SNAP, null).value).toBe(0);
    expect(snapValue(3, angles, ANGLE_SNAP, null).value).toBe(0);
    // Held at 0 and dragged backwards past the wrap: still held, not released by the discontinuity.
    expect(snapValue(350, angles, ANGLE_SNAP, 0).value).toBe(0);
  });

  it('does not wrap an axis with no period', () => {
    // 360 apart on a linear axis is far, not adjacent.
    expect(snapValue(360, [0], CENTRE_SNAP, null).target).toBeNull();
  });

  it('snaps a position axis on the same rules', () => {
    expect(snapValue(208, [206], CENTRE_SNAP, null).value).toBe(206);
    expect(snapValue(218, [206], CENTRE_SNAP, null).target).toBeNull();
    expect(snapValue(218, [206], CENTRE_SNAP, 206).value).toBe(206);
    expect(snapValue(223, [206], CENTRE_SNAP, 206).target).toBeNull();
  });

  it('has an exit wider than its enter, or it would chatter', () => {
    expect(ANGLE_SNAP.exit).toBeGreaterThan(ANGLE_SNAP.enter);
    expect(CENTRE_SNAP.exit).toBeGreaterThan(CENTRE_SNAP.enter);
  });

  it('is free when given no targets', () => {
    expect(snapValue(90, [], ANGLE_SNAP, null)).toEqual({ value: 90, target: null, entered: false });
  });
});
