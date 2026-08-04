import { hexToHsl, hslToHex, LIGHT_STEPS, nearestColorName, nearestShadeIndex, normalizeHex, randomShade, readableInk, SAT_BANDS, shadesForHue } from './color';

describe('hex and hsl', () => {
  it('converts the corners', () => {
    expect(hslToHex({ h: 0, s: 100, l: 50 })).toBe('#ff0000');
    expect(hslToHex({ h: 120, s: 100, l: 50 })).toBe('#00ff00');
    expect(hslToHex({ h: 240, s: 100, l: 50 })).toBe('#0000ff');
    expect(hslToHex({ h: 0, s: 0, l: 100 })).toBe('#ffffff');
    expect(hslToHex({ h: 0, s: 0, l: 0 })).toBe('#000000');
  });

  it('round-trips a colour back to itself', () => {
    for (const hex of ['#00b4d8', '#8a2be2', '#2e8b57', '#ffd700']) {
      expect(hslToHex(hexToHsl(hex))).toBe(hex);
    }
  });

  it('wraps a hue past the end of the wheel rather than clipping it', () => {
    expect(hslToHex({ h: 360, s: 100, l: 50 })).toBe(hslToHex({ h: 0, s: 100, l: 50 }));
    expect(hslToHex({ h: -30, s: 100, l: 50 })).toBe(hslToHex({ h: 330, s: 100, l: 50 }));
  });
});

describe('reading a typed hex', () => {
  it('takes the forms people actually paste', () => {
    expect(normalizeHex('#00B4D8')).toBe('#00b4d8');
    expect(normalizeHex('00b4d8')).toBe('#00b4d8');
    expect(normalizeHex('  #0f0 ')).toBe('#00ff00');
  });

  it('refuses anything else rather than guessing', () => {
    expect(normalizeHex('')).toBeNull();
    expect(normalizeHex('#12345')).toBeNull();
    expect(normalizeHex('rgb(0,0,0)')).toBeNull();
    expect(normalizeHex('#gggggg')).toBeNull();
  });
});

describe('the shade ladder', () => {
  const shades = shadesForHue(197);

  it('is long enough to be worth scrolling', () => {
    expect(shades).toHaveLength(SAT_BANDS.length * LIGHT_STEPS);
  });

  it('runs light to dark inside a band, so a scroll reads as a gradient', () => {
    const l = shades.slice(0, LIGHT_STEPS).map((h) => hexToHsl(h).l);
    for (let i = 1; i < l.length; i += 1) expect(l[i]).toBeLessThan(l[i - 1]);
  });

  it('keeps the hue it was asked for', () => {
    // The greyest band cannot carry a hue, and neither can the extremes of lightness.
    for (const hex of shades.slice(0, LIGHT_STEPS * 2)) {
      const { h, s } = hexToHsl(hex);
      if (s > 8) expect(Math.min(Math.abs(h - 197), 360 - Math.abs(h - 197))).toBeLessThanOrEqual(2);
    }
  });

  it('never repeats a square', () => {
    expect(new Set(shades).size).toBe(shades.length);
  });
});

describe('landing a typed hex on a square', () => {
  it('finds the exact square when the colour IS one', () => {
    const shades = shadesForHue(197);
    expect(nearestShadeIndex(shades, shades[23])).toBe(23);
  });

  it('lands close for a colour that is not on the ladder', () => {
    const shades = shadesForHue(197);
    const i = nearestShadeIndex(shades, '#00b4d8');
    const { h } = hexToHsl(shades[i]);
    expect(Math.abs(h - 197)).toBeLessThanOrEqual(3);
  });
});

describe('ink on a swatch', () => {
  it('is dark on light and light on dark', () => {
    expect(readableInk('#ffffff')).toBe('#0B0D11');
    expect(readableInk('#000000')).toBe('#F6F1E6');
  });

  it('reads yellow as bright, which a flat average does not', () => {
    expect(readableInk('#ffff00')).toBe('#0B0D11');
    expect(readableInk('#0000ff')).toBe('#F6F1E6');
  });
});

describe('naming a colour', () => {
  it('gives a named colour its own name', () => {
    expect(nearestColorName('#6495ed')).toBe('Cornflower Blue');
    expect(nearestColorName('#ff0000')).toBe('Red');
  });

  it('names a colour that is merely near one', () => {
    expect(nearestColorName('#00b4d8')).toBe('Dark Turquoise');
  });
});

describe('surprise me', () => {
  it('always lands on a real square of its own hue', () => {
    for (let i = 0; i < 40; i += 1) {
      const { hue, index, hex } = randomShade();
      expect(shadesForHue(hue)[index]).toBe(hex);
    }
  });
});
describe('naming the greys (owner, v0.34.5)', () => {
  const grey = (h: number) => hslToHex({ h, s: 14, l: 34 });

  it('gives DIFFERENT names to different hues of the same washed-out tone', () => {
    // The old nearest-in-RGB answered "Dark Slate Gray" for every one of these.
    const names = new Set([0, 60, 120, 200, 280].map((h) => nearestColorName(grey(h))));
    expect(names.size).toBeGreaterThanOrEqual(4);
  });

  it('says which colour it is, not just that it is grey', () => {
    expect(nearestColorName(hslToHex({ h: 130, s: 16, l: 30 }))).toContain('Green');
    expect(nearestColorName(hslToHex({ h: 240, s: 16, l: 30 }))).toContain('Blue');
  });

  it('drops the hue word from a TRUE neutral, which does not have one', () => {
    expect(nearestColorName(hslToHex({ h: 200, s: 0, l: 50 }))).toBe('Muted Gray');
  });

  it('keeps the CSS name for anything with real colour in it', () => {
    expect(nearestColorName('#ff69b4')).toBe('Hot Pink');
    expect(nearestColorName('#2e8b57')).toBe('Sea Green');
  });

  it('has a real black and a real white at the ends', () => {
    expect(nearestColorName('#000000')).toBe('Black');
    expect(nearestColorName('#ffffff')).toBe('White');
    // and the ladder actually reaches one
    const darkest = shadesForHue(200)[shadesForHue(200).length - 1];
    expect(hexToHsl(darkest).l).toBeLessThan(5);
  });
});
describe('naming the DARK end (owner, v0.34.6)', () => {
  it('does not call two whole rows of the ladder Black', () => {
    // The CSS list has almost nothing dark in it, so every deep colour matched Black.
    const dark = [200, 30, 120, 300].flatMap((h) => shadesForHue(h).slice(-3, -1));
    for (const hex of dark) expect(nearestColorName(hex)).not.toBe('Black');
  });

  it('keeps the hue in the name of a dark SATURATED colour, and never calls it grey', () => {
    const deepTeal = hslToHex({ h: 190, s: 90, l: 18 });
    const name = nearestColorName(deepTeal);
    expect(name).toContain('Teal');
    expect(name).not.toContain('Gray');
  });

  it('gives different dark hues different names', () => {
    const names = new Set([10, 100, 190, 250, 310].map((h) => nearestColorName(hslToHex({ h, s: 80, l: 20 }))));
    expect(names.size).toBe(5);
  });

  it('still says Black for an actual black', () => {
    expect(nearestColorName('#000000')).toBe('Black');
    expect(nearestColorName(shadesForHue(200)[shadesForHue(200).length - 1])).toBe('Black');
  });
});
