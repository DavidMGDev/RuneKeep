/**
 * Category icon library (#246): a set of chamfer-friendly gold glyphs a player can assign to a custom
 * carousel category. Built-in categories keep their dedicated glyphs (see deck-toggle-icon); these are
 * for custom categories + the icon picker. Keyed so the choice persists as a short string.
 */
import { Fragment, type ReactElement } from 'react';
import Svg, { Circle, Path, Polygon, Rect } from 'react-native-svg';

import { Rune } from '@/constants/theme';

const G = Rune.goldBright;
const F = '#15191F';
const sw = 2.4;

/** Each icon draws its content in a 48×48 viewBox (a fragment of SVG primitives). */
const PATHS: Record<string, () => ReactElement> = {
  star: () => <Polygon points="24,7 29,19 42,20 32,29 35,42 24,35 13,42 16,29 6,20 19,19" fill={G} />,
  sword: () => <Path d="M24 6 L24 30 M18 30 H30 M21 33 H27 M24 36 V42" fill="none" stroke={G} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />,
  shield: () => <Path d="M24 7 L39 12 V25 C39 34 32 39 24 42 C16 39 9 34 9 25 V12 Z" fill={F} stroke={G} strokeWidth={sw} strokeLinejoin="round" />,
  potion: () => <Path d="M20 8 H28 V16 L33 30 C34 37 29 41 24 41 C19 41 14 37 15 30 L20 16 Z" fill={F} stroke={G} strokeWidth={sw} strokeLinejoin="round" />,
  scroll: () => <Path d="M14 10 H34 V36 Q34 40 30 40 H14 Q18 40 18 36 V14 Q18 10 14 10 Z" fill={F} stroke={G} strokeWidth={sw} strokeLinejoin="round" />,
  flame: () => <Path d="M24 6 C30 14 34 18 34 27 C34 35 29 41 24 41 C19 41 14 35 14 27 C14 21 18 19 20 16 C22 21 24 20 24 16 Z" fill={F} stroke={G} strokeWidth={sw} strokeLinejoin="round" />,
  leaf: () => <Path d="M12 38 C12 20 26 8 38 8 C38 26 26 38 12 38 Z" fill={F} stroke={G} strokeWidth={sw} strokeLinejoin="round" />,
  gem: () => <Polygon points="24,8 36,18 24,42 12,18" fill={F} stroke={G} strokeWidth={sw} strokeLinejoin="round" />,
  book: () => <Path d="M9 11 C16 9 22 11 24 13 C26 11 32 9 39 11 V37 C32 35 26 37 24 39 C22 37 16 35 9 37 Z" fill={F} stroke={G} strokeWidth={sw} strokeLinejoin="round" />,
  crown: () => <Path d="M9 34 L12 15 L20 24 L24 13 L28 24 L36 15 L39 34 Z" fill={F} stroke={G} strokeWidth={sw} strokeLinejoin="round" />,
  eye: () => (
    <Fragment>
      <Path d="M7 24 C13 15 35 15 41 24 C35 33 13 33 7 24 Z" fill={F} stroke={G} strokeWidth={sw} strokeLinejoin="round" />
      <Circle cx={24} cy={24} r={4} fill={G} />
    </Fragment>
  ),
  bag: () => <Path d="M14 19 H34 L37 40 H11 Z M18 19 C18 12 30 12 30 19" fill={F} stroke={G} strokeWidth={sw} strokeLinejoin="round" />,
  paw: () => (
    <Fragment>
      <Path d="M24 40 C16 40 14 33 17 29 C19 26 29 26 31 29 C34 33 32 40 24 40 Z" fill={G} />
      <Circle cx={15} cy={25} r={3.4} fill={G} />
      <Circle cx={20} cy={19} r={3.6} fill={G} />
      <Circle cx={28} cy={19} r={3.6} fill={G} />
      <Circle cx={33} cy={25} r={3.4} fill={G} />
    </Fragment>
  ),
  dice: () => (
    <Fragment>
      <Rect x={12} y={12} width={24} height={24} rx={3} fill={F} stroke={G} strokeWidth={sw} />
      <Circle cx={19} cy={19} r={2} fill={G} />
      <Circle cx={29} cy={29} r={2} fill={G} />
      <Circle cx={24} cy={24} r={2} fill={G} />
    </Fragment>
  ),
  key: () => <Path d="M30 12 A8 8 0 1 0 30 28 L30 24 L40 24 M34 24 V28" fill="none" stroke={G} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />,
  heart: () => <Path d="M24 40 C8 30 10 16 18 16 C22 16 24 20 24 20 C24 20 26 16 30 16 C38 16 40 30 24 40 Z" fill={F} stroke={G} strokeWidth={sw} strokeLinejoin="round" />,
  ring: () => (
    <Fragment>
      <Circle cx={24} cy={27} r={10} fill="none" stroke={G} strokeWidth={sw} />
      <Polygon points="24,8 28,15 20,15" fill={G} />
    </Fragment>
  ),
  bolt: () => <Polygon points="26,6 14,26 22,26 20,42 34,20 25,20" fill={G} />,
};

/** Ordered list of icon keys for the picker. */
export const CATEGORY_ICON_KEYS: string[] = ['star', 'sword', 'shield', 'potion', 'scroll', 'flame', 'leaf', 'gem', 'book', 'crown', 'eye', 'bag', 'paw', 'dice', 'key', 'heart', 'ring', 'bolt'];

/** The default icon for a custom category without an explicit choice (#246). */
export const DEFAULT_CATEGORY_ICON = 'star';

/** Render a library icon by key (fallback to the default). */
export function CategoryIconSvg({ iconKey, size = 42 }: { iconKey?: string; size?: number }) {
  const key = iconKey && PATHS[iconKey] ? iconKey : DEFAULT_CATEGORY_ICON;
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      {PATHS[key]()}
    </Svg>
  );
}
