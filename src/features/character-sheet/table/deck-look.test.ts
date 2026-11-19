import { BUILTIN_LOOKS, cardOffset, cleanLook, decodeLook, DEFAULT_LOOK, encodeLook, lookScale, lookX, LOOK_PAGES } from './deck-look';

describe('deck look', () => {
  it('round-trips a look through a share code', () => {
    const look = { ...DEFAULT_LOOK, size: 300, edge: 'blur' as const, loop: true, spacing: -0.4 };
    const code = encodeLook(look);
    expect(code.startsWith('RK1:')).toBe(true);
    expect(decodeLook(`  ${code}\n`)).toEqual(look);
  });

  it('shares the default as an empty code', () => {
    expect(decodeLook(encodeLook(DEFAULT_LOOK))).toEqual(DEFAULT_LOOK);
  });

  it('rejects what is not a code', () => {
    expect(decodeLook('hello')).toBeNull();
    expect(decodeLook('RK1:%%%')).toBeNull();
    expect(decodeLook('RK1:' + btoa('[1,2]'))).toBeNull();
  });

  it('clamps numbers to the panel limits and drops unknown choices', () => {
    const l = cleanLook({ size: 99999, edge: 'sparkles', centre: 'three', loop: 'yes', bogus: 1 });
    expect(l.size).toBe(520);
    expect(l.edge).toBe(DEFAULT_LOOK.edge);
    expect(l.centre).toBe(DEFAULT_LOOK.centre);
    expect(l.loop).toBe(false);
    expect('bogus' in l).toBe(false);
  });

  it('keeps every built-in look inside the limits', () => {
    for (const b of BUILTIN_LOOKS) expect(cleanLook(b.look)).toEqual(b.look);
  });

  it('describes every setting exactly once', () => {
    const keys = LOOK_PAGES.flatMap((p) => p.controls.map((c) => c.key));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.sort()).toEqual(Object.keys(DEFAULT_LOOK).sort());
  });

  it('places cards further out monotonically and interpolates between detents', () => {
    const w = 200;
    const xs = [0, 1, 2, 3, 4].map((k) => lookX(k, DEFAULT_LOOK, w));
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
    expect(lookX(1.5, DEFAULT_LOOK, w)).toBeCloseTo((xs[1] + xs[2]) / 2, 5);
  });

  it('never shrinks past the smallest card', () => {
    expect(lookScale(100, { ...DEFAULT_LOOK, shrink: 0.4, minScale: 0.25 })).toBe(0.25);
  });

  it('wraps offsets the short way round a looping deck', () => {
    expect(cardOffset(9, 0, 10, true)).toBe(-1);
    expect(cardOffset(1, 9, 10, true)).toBe(2);
    expect(cardOffset(9, 0, 10, false)).toBe(9);
  });
});
