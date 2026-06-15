import { DEFAULT_TOKEN_KINDS, hashStr, pickTokenColor, TOKEN_BASE, TOKEN_COLORS, tokenFill } from './card-tokens-data';

describe('card tokens — pure helpers (#244)', () => {
  describe('pickTokenColor', () => {
    it('returns a palette colour for any rnd in [0,1)', () => {
      for (let i = 0; i < 20; i++) {
        const c = pickTokenColor(undefined, i / 20);
        expect(TOKEN_COLORS).toContain(c);
      }
    });

    it('is deterministic for a given rnd', () => {
      expect(pickTokenColor(undefined, 0)).toBe(TOKEN_COLORS[0]);
      expect(pickTokenColor(undefined, 0.999999)).toBe(TOKEN_COLORS[TOKEN_COLORS.length - 1]);
    });

    it('never returns the previous colour (a tap always changes it)', () => {
      // rnd lands on index 0; with prev = colour[0] it must step to colour[1].
      expect(pickTokenColor(TOKEN_COLORS[0], 0)).toBe(TOKEN_COLORS[1]);
      // sweep: for every prev + rnd, the result differs from prev
      for (const prev of TOKEN_COLORS) {
        for (let i = 0; i < TOKEN_COLORS.length; i++) {
          expect(pickTokenColor(prev, i / TOKEN_COLORS.length)).not.toBe(prev);
        }
      }
    });

    it('clamps out-of-range rnd into the palette', () => {
      expect(TOKEN_COLORS).toContain(pickTokenColor(undefined, -5));
      expect(TOKEN_COLORS).toContain(pickTokenColor(undefined, 5));
    });
  });

  describe('tokenFill', () => {
    it('resolves a default kind to its material', () => {
      expect(tokenFill({ kind: 'wood' })).toBe(TOKEN_BASE.wood);
      expect(tokenFill({ kind: 'bone' })).toBe(TOKEN_BASE.bone);
      expect(tokenFill({ kind: 'iron' })).toBe(TOKEN_BASE.iron);
    });

    it('uses the frozen colour for a colour token, falling back to the first palette colour', () => {
      expect(tokenFill({ kind: 'color', color: '#123456' })).toBe('#123456');
      expect(tokenFill({ kind: 'color' })).toBe(TOKEN_COLORS[0]);
    });
  });

  describe('hashStr', () => {
    it('is in [0,1) and deterministic', () => {
      const a = hashStr('tk-abc');
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(1);
      expect(hashStr('tk-abc')).toBe(a);
    });

    it('varies across ids', () => {
      expect(hashStr('tk-abc')).not.toBe(hashStr('tk-abd'));
    });
  });

  it('exposes three draggable default kinds', () => {
    expect(DEFAULT_TOKEN_KINDS).toEqual(['wood', 'bone', 'iron']);
    expect(TOKEN_COLORS.length).toBeGreaterThan(1);
  });
});
