/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * RuneKeep visual identity — sampled from the Daggerheart sheet art
 * (gold filigree, heraldic red, ivory parchment, ink-navy panels).
 * Use these everywhere instead of raw hex so the theme stays consistent.
 */
export const Rune = {
  ink: '#0B0E13', // app background / darkest navy
  sheet: '#FAF8F2', // near-white sheet surface, faintly warm (never pure white)
  inkText: '#14110C', // near-black text, tinted warm (never pure black)
  panel: '#0E1116', // armor-panel dark fill
  gold: '#C8923A', // filigree / outlines
  goldBright: '#E0B563', // highlighted gold (crowns, accents)
  goldText: '#F9D68D', // gold label text (Evasion / Armor / Proficiency)
  red: '#C81B18', // heraldic red (banners, level number)
  redDeep: '#B5231F',
  ivory: '#FDFCF7', // parchment / trait banner numerals
  parchment: '#F4ECDC',
  hpRed: '#BD1B1B', // current-HP numerals
  muted: '#938E88', // secondary text (class & subclass line)
  hopeAmber: '#CC8F0F',
} as const;

/**
 * Type system (loaded in the root layout) — one athletic grotesque, the way the mockup does it:
 * - `Display` = Archivo at its heaviest. Character name + every hero numeral + trait modifiers.
 * - `Body` = Archivo at text weights. Tracked-uppercase labels, secondary lines, badge values, quote.
 * One superfamily, weight contrast carries the hierarchy. No serif.
 */
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

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
