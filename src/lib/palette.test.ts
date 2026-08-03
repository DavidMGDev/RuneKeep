import { boardPalette, cardPalette } from './palette';

/** Both palettes are grids of a generated hue-by-tone list, so they get the same three questions. */
const lightness = (c: string): number | null => {
  const m = /hsl\(\d+,\s*\d+%,\s*(\d+)%\)/.exec(c);
  return m ? Number(m[1]) : null;
};

describe('the board palette', () => {
  it('leads with the board default, so the way back is the first swatch', () => {
    expect(boardPalette()[0]).toBe('#101A2B');
  });

  it('offers a whole picker of choice rather than a handful', () => {
    expect(boardPalette().length).toBeGreaterThanOrEqual(40);
  });

  it('never repeats a swatch', () => {
    const p = boardPalette();
    expect(new Set(p).size).toBe(p.length);
  });

  it('stays dark enough for artwork to read on top of', () => {
    for (const c of boardPalette()) {
      const l = lightness(c);
      if (l != null) expect(l).toBeLessThanOrEqual(40);
    }
  });
});

describe('the card palette', () => {
  it('offers a whole picker of choice', () => {
    expect(cardPalette().length).toBeGreaterThanOrEqual(40);
  });

  it('never repeats a swatch', () => {
    const p = cardPalette();
    expect(new Set(p).size).toBe(p.length);
  });

  it('stays inside the band the random roll uses, so a picked colour looks like a rolled one', () => {
    // randomCardColor: saturation 42-70, lightness 30-52.
    for (const c of cardPalette()) {
      const m = /hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/.exec(c);
      if (!m) continue;
      expect(Number(m[2])).toBeGreaterThanOrEqual(42);
      expect(Number(m[2])).toBeLessThanOrEqual(70);
      expect(Number(m[3])).toBeGreaterThanOrEqual(30);
      expect(Number(m[3])).toBeLessThanOrEqual(52);
    }
  });

  it('is not the board palette, which would be too dark to be card art', () => {
    expect(cardPalette()).not.toEqual(boardPalette());
  });
});
