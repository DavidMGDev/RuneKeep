import { DEFAULT_TOKEN_KINDS, DIE_BOX, DIE_COLOR, DIE_MAX, DIE_TYPES, dieGeometry, hashStr, kindScale, nextDieType, nextDieValue, pickTokenColor, TOKEN_BASE, TOKEN_COLORS, tokenFill } from './card-tokens-data';

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

  describe('kindScale', () => {
    it('steps wood < bone < iron, colour standard', () => {
      expect(kindScale('wood')).toBeLessThan(kindScale('bone'));
      expect(kindScale('iron')).toBeGreaterThan(kindScale('bone'));
      expect(kindScale('bone')).toBe(1);
      expect(kindScale('color')).toBe(1);
    });
  });

  describe('dice (#293)', () => {
    it('nextDieType cycles the six sizes and wraps', () => {
      expect(DIE_TYPES).toEqual(['d4', 'd6', 'd8', 'd10', 'd12', 'd20']);
      expect(nextDieType('d4')).toBe('d6');
      expect(nextDieType('d12')).toBe('d20');
      expect(nextDieType('d20')).toBe('d4'); // wrap
    });

    it('nextDieValue steps 1..max then wraps to 1', () => {
      expect(nextDieValue('d6', 1)).toBe(2);
      expect(nextDieValue('d6', 5)).toBe(6);
      expect(nextDieValue('d6', 6)).toBe(1); // wrap at max
      expect(nextDieValue('d20', 20)).toBe(1);
    });

    it('every die has a colour and a max, and tokenFill uses the die colour', () => {
      for (const t of DIE_TYPES) {
        expect(DIE_COLOR[t]).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(DIE_MAX[t]).toBeGreaterThan(0);
        expect(tokenFill({ kind: 'die', dieType: t })).toBe(DIE_COLOR[t]);
      }
    });

    it('dieGeometry centres every silhouette in the box and keeps the number on the shape', () => {
      const c = DIE_BOX / 2;
      for (const t of DIE_TYPES) {
        const g = dieGeometry(t);
        let minx, maxx, miny, maxy;
        if (g.rect) {
          [minx, miny] = [g.rect[0], g.rect[1]];
          [maxx, maxy] = [g.rect[0] + g.rect[2], g.rect[1] + g.rect[3]];
        } else {
          const pts = g.points!.split(' ').map((p) => p.split(',').map(Number));
          const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1]);
          [minx, maxx, miny, maxy] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
        }
        // bounding box is centred at (62,62) → the die sits centred in its slot (the owner's complaint).
        expect((minx + maxx) / 2).toBeCloseTo(c, 1);
        expect((miny + maxy) / 2).toBeCloseTo(c, 1);
        // the number stays inside the silhouette's vertical extent.
        expect(g.numberY).toBeGreaterThan(miny);
        expect(g.numberY).toBeLessThan(maxy);
      }
    });
  });
});
