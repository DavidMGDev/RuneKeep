/**
 * Colour arithmetic for the picker (v0.34.4).
 *
 * The v0.34.3 picker was a fixed grid of swatches, which the owner called what it was: an assortment,
 * not a picker. This is the machinery behind the replacement, where you choose a HUE and then scroll
 * an endless carousel of that hue's shades, with a hex field that reads and writes the centred one.
 *
 * All of it is pure, because none of it is obvious by looking at the screen: whether the shade ladder
 * is evenly spaced, whether a typed hex lands on the square it should, and whether the label on a
 * swatch is readable are exactly the questions a test answers better than an eye does.
 *
 * Hex in, hex out. The owner asked for hex and nothing else, so there is no rgb()/hsl() parsing here
 * and no colour space beyond HSL, which is the one that makes "shades of this hue" a straight line.
 */

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const hex2 = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');

export interface Hsl {
  /** 0-359 */
  h: number;
  /** 0-100 */
  s: number;
  /** 0-100 */
  l: number;
}

export function hslToHex({ h, s, l }: Hsl): string {
  const sn = clamp(s, 0, 100) / 100;
  const ln = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = ln - c / 2;
  return `#${hex2((r + m) * 255)}${hex2((g + m) * 255)}${hex2((b + m) * 255)}`;
}

/** Split a hex into 0-255 channels. Assumes a normalized `#rrggbb`. */
export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function hexToHsl(hex: string): Hsl {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  // NOT rounded: rounding here costs a couple of units on the way back, so a colour read out of the
  // hex field and written straight back would not be the colour that was typed. Callers round for
  // display (the hue slider wants a whole degree); the maths wants what is actually there.
  return { h: ((h % 360) + 360) % 360, s: s * 100, l: l * 100 };
}

/**
 * Read anything a player might type as a hex, or null.
 *
 * Accepts a missing `#`, either case and the three-digit short form, because all three are things
 * people paste. Anything else is refused rather than guessed at: a field that silently turns a typo
 * into a colour is worse than one that simply does not accept it.
 */
export function normalizeHex(input: string): string | null {
  const raw = input.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw.split('').map((c) => c + c).join('').toLowerCase()}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`;
  return null;
}

/**
 * The shade ladder for one hue: saturation bands, each running light to dark.
 *
 * Ordered so a scroll reads as a gradient rather than as noise, and long enough that the carousel is
 * worth scrolling (the owner asked for "a LOT of shades"). The lightness range stops short of pure
 * white and pure black on purpose: at either end every hue is the same colour, and a picker that
 * spends six squares on indistinguishable near-white is wasting the scroll.
 */
export const SAT_BANDS = [96, 74, 52, 30, 12] as const;
export const LIGHT_STEPS = 14;

export function shadesForHue(h: number): string[] {
  const out: string[] = [];
  for (const s of SAT_BANDS) {
    for (let i = 0; i < LIGHT_STEPS; i += 1) {
      // 88% down to 10%: light first, so scrolling right walks into the dark.
      const l = 88 - (i * (88 - 10)) / (LIGHT_STEPS - 1);
      out.push(hslToHex({ h, s, l }));
    }
  }
  return out;
}

/** Squared RGB distance. Squared because only the ORDER matters and the root costs nothing back. */
function dist2(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2;
}

/** The index in `shades` closest to `hex`. Used to land a typed hex on a real square. */
export function nearestShadeIndex(shades: readonly string[], hex: string): number {
  let best = 0;
  let bestD = Infinity;
  shades.forEach((s, i) => {
    const d = dist2(s, hex);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/**
 * Black or ivory ink for a swatch, by perceived brightness.
 *
 * The owner's "be careful with font color on each square". Rec. 601 weights rather than a flat mean,
 * because a saturated yellow and a saturated blue of the same mean are nowhere near as bright as each
 * other, and the flat version puts white text on the yellow.
 */
export function readableInk(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#0B0D11' : '#F6F1E6';
}

/**
 * The CSS named colours, which is the lightweight colour-name list the owner hoped for.
 *
 * No dependency: the list is 140 entries, it is a web standard, and the names are ones people already
 * recognise ("Cornflower Blue", "Sea Green"). A 30,000-name package would name a swatch more
 * precisely and would also be a megabyte in the bundle for a caption.
 */
const CSS_COLORS: Record<string, string> = {
  'Alice Blue': '#f0f8ff', 'Antique White': '#faebd7', Aqua: '#00ffff', Aquamarine: '#7fffd4', Azure: '#f0ffff',
  Beige: '#f5f5dc', Bisque: '#ffe4c4', Black: '#000000', 'Blanched Almond': '#ffebcd', Blue: '#0000ff',
  'Blue Violet': '#8a2be2', Brown: '#a52a2a', Burlywood: '#deb887', 'Cadet Blue': '#5f9ea0', Chartreuse: '#7fff00',
  Chocolate: '#d2691e', Coral: '#ff7f50', 'Cornflower Blue': '#6495ed', Cornsilk: '#fff8dc', Crimson: '#dc143c',
  'Dark Blue': '#00008b', 'Dark Cyan': '#008b8b', 'Dark Goldenrod': '#b8860b', 'Dark Gray': '#a9a9a9',
  'Dark Green': '#006400', 'Dark Khaki': '#bdb76b', 'Dark Magenta': '#8b008b', 'Dark Olive Green': '#556b2f',
  'Dark Orange': '#ff8c00', 'Dark Orchid': '#9932cc', 'Dark Red': '#8b0000', 'Dark Salmon': '#e9967a',
  'Dark Sea Green': '#8fbc8f', 'Dark Slate Blue': '#483d8b', 'Dark Slate Gray': '#2f4f4f', 'Dark Turquoise': '#00ced1',
  'Dark Violet': '#9400d3', 'Deep Pink': '#ff1493', 'Deep Sky Blue': '#00bfff', 'Dim Gray': '#696969',
  'Dodger Blue': '#1e90ff', Firebrick: '#b22222', 'Floral White': '#fffaf0', 'Forest Green': '#228b22',
  Fuchsia: '#ff00ff', Gainsboro: '#dcdcdc', 'Ghost White': '#f8f8ff', Gold: '#ffd700', Goldenrod: '#daa520',
  Gray: '#808080', Green: '#008000', 'Green Yellow': '#adff2f', Honeydew: '#f0fff0', 'Hot Pink': '#ff69b4',
  'Indian Red': '#cd5c5c', Indigo: '#4b0082', Ivory: '#fffff0', Khaki: '#f0e68c', Lavender: '#e6e6fa',
  'Lavender Blush': '#fff0f5', 'Lawn Green': '#7cfc00', 'Lemon Chiffon': '#fffacd', 'Light Blue': '#add8e6',
  'Light Coral': '#f08080', 'Light Cyan': '#e0ffff', 'Light Goldenrod': '#fafad2', 'Light Gray': '#d3d3d3',
  'Light Green': '#90ee90', 'Light Pink': '#ffb6c1', 'Light Salmon': '#ffa07a', 'Light Sea Green': '#20b2aa',
  'Light Sky Blue': '#87cefa', 'Light Slate Gray': '#778899', 'Light Steel Blue': '#b0c4de', 'Light Yellow': '#ffffe0',
  Lime: '#00ff00', 'Lime Green': '#32cd32', Linen: '#faf0e6', Maroon: '#800000', 'Medium Aquamarine': '#66cdaa',
  'Medium Blue': '#0000cd', 'Medium Orchid': '#ba55d3', 'Medium Purple': '#9370db', 'Medium Sea Green': '#3cb371',
  'Medium Slate Blue': '#7b68ee', 'Medium Spring Green': '#00fa9a', 'Medium Turquoise': '#48d1cc',
  'Medium Violet Red': '#c71585', 'Midnight Blue': '#191970', 'Mint Cream': '#f5fffa', 'Misty Rose': '#ffe4e1',
  Moccasin: '#ffe4b5', 'Navajo White': '#ffdead', Navy: '#000080', 'Old Lace': '#fdf5e6', Olive: '#808000',
  'Olive Drab': '#6b8e23', Orange: '#ffa500', 'Orange Red': '#ff4500', Orchid: '#da70d6', 'Pale Goldenrod': '#eee8aa',
  'Pale Green': '#98fb98', 'Pale Turquoise': '#afeeee', 'Pale Violet Red': '#db7093', 'Papaya Whip': '#ffefd5',
  'Peach Puff': '#ffdab9', Peru: '#cd853f', Pink: '#ffc0cb', Plum: '#dda0dd', 'Powder Blue': '#b0e0e6',
  Purple: '#800080', 'Rebecca Purple': '#663399', Red: '#ff0000', 'Rosy Brown': '#bc8f8f', 'Royal Blue': '#4169e1',
  'Saddle Brown': '#8b4513', Salmon: '#fa8072', 'Sandy Brown': '#f4a460', 'Sea Green': '#2e8b57', Seashell: '#fff5ee',
  Sienna: '#a0522d', Silver: '#c0c0c0', 'Sky Blue': '#87ceeb', 'Slate Blue': '#6a5acd', 'Slate Gray': '#708090',
  Snow: '#fffafa', 'Spring Green': '#00ff7f', 'Steel Blue': '#4682b4', Tan: '#d2b48c', Teal: '#008080',
  Thistle: '#d8bfd8', Tomato: '#ff6347', Turquoise: '#40e0d0', Violet: '#ee82ee', Wheat: '#f5deb3',
  White: '#ffffff', 'White Smoke': '#f5f5f5', Yellow: '#ffff00', 'Yellow Green': '#9acd32',
};

const NAMES = Object.entries(CSS_COLORS);

/** The nearest named colour to `hex`. Always returns something: every colour is near enough to one. */
export function nearestColorName(hex: string): string {
  let best = NAMES[0][0];
  let bestD = Infinity;
  for (const [name, value] of NAMES) {
    const d = dist2(value, hex);
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return best;
}

/** A random colour anywhere in the picker's own space, so Surprise me and the carousel agree. */
export function randomShade(): { hue: number; index: number; hex: string } {
  const hue = Math.floor(Math.random() * 360);
  const shades = shadesForHue(hue);
  const index = Math.floor(Math.random() * shades.length);
  return { hue, index, hex: shades[index] };
}
