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
 * ONE PALETTE (v0.42.4, owner).
 *
 * `DmRune` was the desaturated twin of `Rune`: the DM screens ran in greys so they read as "the same
 * UI, drained of gold". The owner has decided against it. "I would like for the entire app from
 * player to DM to have a cohesive UI... rework 100% of its colors so that they keep the color palette
 * of the regular interface."
 *
 * So it is the ordinary palette wearing the DM names. Every `dm` prop, every `DmRune.accent` and every
 * dm-aware component goes on compiling and simply stops being grey, which is why this is a remapping
 * rather than a deletion: a sweep that replaced the references by hand would miss a screen, and the
 * one it missed would be the one nobody opens until a session.
 *
 * The role names are kept because they are good names for what they do on those screens. `accent` is
 * the structural colour, `line` the hairline, `red` the destructive one. They now resolve to gold,
 * gold edge and the single heraldic red the rest of the app uses.
 */
export const DmRune = {
  ink: Rune.ink,
  panel: Rune.panel,
  panelLit: '#1A1E26',
  accent: Rune.goldText,
  accentDim: Rune.bronze,
  line: Rune.goldEdge,
  lineStrong: 'rgba(218,162,73,0.85)',
  ivory: Rune.ivory,
  text: Rune.sheet,
  muted: Rune.muted,
  red: Rune.red,
  /** Friendly teal for ally NPC outlines (v0.17.0 item 5). The one colour with a job of its own. */
  ally: '#5FA69C',
} as const;

/**
 * DM Mode type scale (v0.22.0). DM screens had **21 distinct font sizes** across 105 declarations,
 * with no adjacent step reaching 1.07x — five of them (14.5/15/16/17/18) doing the single job
 * "list-row title", two of which rendered 1dp apart in the same ScrollView. That is not hierarchy,
 * it is noise the eye reads as misalignment.
 *
 * Five steps at ~1.25x, assigned by ROLE. For comparison, the menu screen the owner likes uses three
 * sizes at 2.00x and 1.67x.
 */
export const DmType = {
  /** Tags, timestamps, chip text, stat captions. */
  micro: 11,
  /** Sublines, body copy, empty-state prose. */
  body: 13,
  /** List-row and panel titles — the single most over-forked role. */
  title: 16,
  /** Modal and section headings. */
  panel: 20,
  /** The one big numeral a screen is allowed. */
  hero: 26,
} as const;

/**
 * DM Mode spacing (v0.22.0). `Spacing` above has existed since v0.1 and is imported ZERO times; DM
 * screens instead used 25 distinct values across 253 uses, peaking at 10 and 12 — a 2dp difference
 * nobody can perceive. Worse, seven of nine screens had a SECTION gap smaller than or equal to their
 * intra-block gap, against the design law of >= 2x, so nothing grouped and every screen read as one
 * undifferentiated column.
 */
export const DmGap = {
  /** Between elements inside one block. */
  intra: 10,
  /** Between sibling rows in a list. */
  row: 12,
  /** Between sections — deliberately 2x the intra gap, which is the whole point. */
  section: 24,
} as const;

/**
 * The app's spacing scale (v0.42.3).
 *
 * `DmGap` is the same scale under another name: the DM screens found it first, in v0.22.0, when 25
 * hand-picked gaps were collapsed into three. The authoring screens had the same disease and get the
 * same cure, so the values are deliberately identical rather than a second opinion.
 *
 * The rule the whole thing rests on: a section gap is at least TWICE an intra gap. That single ratio
 * is what makes a screen read as groups rather than as a list of everything.
 */
export const Gap = {
  /** Hairline separation: a label and the control it names. */
  hair: 4,
  /** Between the parts of one control: a field and its buttons. */
  tightRow: 7,
  /** Between elements inside one block. */
  intra: 10,
  /** Between sibling rows in a list. */
  row: 12,
  /** Between blocks inside a section. */
  group: 18,
  /** Between sections. Twice the intra gap, which is the whole point. */
  section: 24,
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
