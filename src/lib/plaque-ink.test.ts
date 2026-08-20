import { hexToHsl } from './color';
import { autoInk, brightness, DEFAULT_FROM, inkReads, plaqueInk } from './plaque-ink';

const light = (hex: string) => hexToHsl(hex).l;

describe('autoInk', () => {
  it('goes LIGHT on a dark band and DARK on a light one', () => {
    expect(light(autoInk('#101014', '#2A2A33'))).toBeGreaterThan(80);
    expect(light(autoInk('#F0E6C8', '#FFF8E0'))).toBeLessThan(20);
  });

  it('is never full white or full black', () => {
    for (const [a, b] of [['#000000', '#000000'], ['#FFFFFF', '#FFFFFF'], ['#101014', '#2A2A33']]) {
      const ink = autoInk(a, b).toUpperCase();
      expect(ink).not.toBe('#FFFFFF');
      expect(ink).not.toBe('#000000');
    }
  });

  /** The owner's "find a good color for the gradient", not one of two constants. */
  it('keeps the band hue, so two different dark bands get two different words', () => {
    const warm = autoInk('#3A1A1A', '#5C2E2E'); // crimson
    const cool = autoInk('#1F3330', '#2F4C46'); // sage
    expect(warm).not.toBe(cool);
    expect(Math.abs(hexToHsl(warm).h - hexToHsl(cool).h)).toBeGreaterThan(30);
  });

  /**
   * The rule is the better WORST CASE of a light word and a dark one.
   *
   * Deliberately not "the tone with the most numeric distance": on a black-to-white band that would
   * be mid-grey, which scores best at the two ends and is washed-out grey-on-grey across the middle,
   * where the word actually sits. A chip's word is bone or it is ink. On a band this extreme neither
   * reads at both ends and the test says so rather than pretending otherwise.
   */
  it('picks the better of a light word and a dark one', () => {
    const ink = autoInk('#000000', '#FFFFFF');
    expect(inkReads(ink, '#000000', '#FFFFFF')).toBe(false);
    expect(light(ink) > 80 || light(ink) < 20).toBe(true);
  });

  it('prefers the candidate whose closest stop is furthest away', () => {
    // Both stops dark, so a light word clears them both and a dark one would sit on top of them.
    const ink = autoInk('#101014', '#1A1A22');
    const d = (x: string, y: string) => Math.abs(brightness(x) - brightness(y));
    expect(Math.min(d(ink, '#101014'), d(ink, '#1A1A22'))).toBeGreaterThan(150);
  });

  it('reads on every band the bundled palette actually uses', () => {
    // Two stops close in value, which is the rule KIND_THEMES follows for every published card type.
    const bands: [string, string][] = [
      ['#2C3038', '#414750'], ['#3A1A1A', '#5C2E2E'], ['#1F3330', '#2F4C46'],
      ['#4A3410', '#6E4E17'], ['#E8E1CE', '#D6CCB2'], ['#F0D9A8', '#E0BE7C'],
    ];
    for (const [f, t] of bands) expect(inkReads(autoInk(f, t), f, t)).toBe(true);
  });

  it('copes with one stop, or none', () => {
    expect(autoInk('#101014', undefined)).toBe(autoInk('#101014', '#101014'));
    expect(autoInk(undefined, undefined)).toBe(autoInk(DEFAULT_FROM, DEFAULT_FROM));
  });

  it('ignores a malformed colour rather than throwing', () => {
    expect(() => autoInk('not a colour', '#2A2A33')).not.toThrow();
  });
});

describe('plaqueInk', () => {
  it('uses the author colour when they set one', () => {
    expect(plaqueInk({ from: '#101014', to: '#2A2A33', text: '#FF0000' })).toBe('#ff0000');
  });

  it('falls back to automatic when they have not', () => {
    expect(plaqueInk({ from: '#101014', to: '#2A2A33' })).toBe(autoInk('#101014', '#2A2A33'));
    expect(plaqueInk({ from: '#101014', to: '#2A2A33', text: '' })).toBe(autoInk('#101014', '#2A2A33'));
  });

  it('answers for a spec that says nothing at all', () => {
    expect(plaqueInk(undefined)).toBe(autoInk(undefined, undefined));
  });
});

describe('inkReads', () => {
  it('is true when the word is far from both stops', () => {
    expect(inkReads('#F6F1E6', '#101014', '#2A2A33')).toBe(true);
  });

  it('is false when the word disappears into the band', () => {
    expect(inkReads('#2A2A33', '#101014', '#2A2A33')).toBe(false);
  });

  it('has no opinion when the band has no colours', () => {
    expect(inkReads('#F6F1E6')).toBe(true);
  });
});

describe('brightness', () => {
  it('weights green above red above blue, so yellow reads brighter than blue', () => {
    expect(brightness('#FFFF00')).toBeGreaterThan(brightness('#0000FF'));
  });
});
