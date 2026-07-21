import '@/global.css';

/**
 * RuneKeep visual identity — sampled from the Daggerheart sheet art
 * (gold filigree, heraldic red, ivory parchment, ink-navy panels).
 * Use these everywhere instead of raw hex so the theme stays consistent.
 */
export const Rune = {
  ink: '#0B0E13', // app background / darkest navy
  sheet: '#FAF8F2', // near-white sheet surface, faintly warm (never pure white)
  inkText: '#14110C', // near-black text, tinted warm (never pure black)
  inkMuted: '#5B554C', // secondary text on parchment — AA-safe (replaces the too-light grey)
  panel: '#0E1116', // armor-panel dark fill
  gold: '#C8923A', // filigree / outlines
  goldBright: '#E0B563', // highlighted gold (crowns, accents)
  goldEdge: '#DAA249', // chamfer-frame strokes / dividers
  goldText: '#F9D68D', // gold label text on DARK panels (Evasion / Armor / Proficiency)
  bronze: '#8A5A12', // deep gold for labels on the bright parchment (AA at small sizes)
  red: '#C81B18', // THE red — one heraldic red across the whole interface (owner, #70 B)
  redDeep: '#C81B18', // aligned to the single red (legacy name kept for compatibility)
  ivory: '#FDFCF7', // parchment / trait banner numerals
  parchment: '#F4ECDC',
  hpRed: '#C81B18', // current-HP numerals — aligned to the single red (#70 B)
  muted: '#938E88', // secondary text (legacy; prefer inkMuted on parchment)
  hopeAmber: '#CC8F0F',
} as const;

/**
 * Type system (loaded in the root layout) — one athletic grotesque, the way the mockup does it:
 * - `Display` = Archivo at its heaviest. Character name + every hero numeral + trait modifiers.
 * - `Body` = Archivo at text weights. Tracked-uppercase labels, secondary lines, badge values, quote.
 * One superfamily, weight contrast carries the hierarchy. No serif.
 */
/**
 * DM Mode palette (v0.15.0) — the desaturated twin of `Rune`, reusing the Golden-Gear-Edit greys
 * (`#C4C8D0` / `#9AA0AA`) so DM surfaces read as "the same UI, drained of gold". Enabling DM Mode swaps
 * these in; disabling reverts entirely. `accent`/`accentDim` replace gold; `line` replaces goldEdge.
 */
export const DmRune = {
  ink: '#0B0E13',
  panel: '#12151B',
  panelLit: '#1A1E26',
  accent: '#C4C8D0', // was gold
  accentDim: '#9AA0AA',
  line: 'rgba(196,200,208,0.5)',
  lineStrong: 'rgba(196,200,208,0.85)',
  ivory: '#F0F1F4',
  text: '#E7E9ED',
  muted: '#8B909A',
  red: '#B2564E', // desaturated heraldic red for destructive/loss accents
} as const;

export const Display = {
  regular: 'Archivo_700Bold',
  semibold: 'Archivo_800ExtraBold',
  bold: 'Archivo_800ExtraBold',
  black: 'Archivo_900Black',
} as const;

export const Body = {
  regular: 'Archivo_400Regular',
  medium: 'Archivo_500Medium',
  semibold: 'Archivo_600SemiBold',
  bold: 'Archivo_700Bold',
  italic: 'Archivo_400Regular_Italic',
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;
