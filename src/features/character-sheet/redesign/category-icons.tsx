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

/** Each icon draws its content in a 48×48 viewBox (a fragment of SVG primitives). Redesigned (#264
 *  item 3) for legibility: detailed, recognizable silhouettes in the gold-on-dark, chamfered language. */
const PATHS: Record<string, () => ReactElement> = {
  star: () => <Polygon points="24,6 28.4,18.2 41,18.6 31,26.4 34.5,38.6 24,31.5 13.5,38.6 17,26.4 7,18.6 19.6,18.2" fill={G} />,
  sword: () => (
    <Fragment>
      <Path d="M24 4 L27 13 L26.5 30 L21.5 30 L21 13 Z" fill={F} stroke={G} strokeWidth={sw} strokeLinejoin="round" />
      <Path d="M14 31 H34" stroke={G} strokeWidth={3.1} strokeLinecap="round" />
      <Path d="M24 31 V40" stroke={G} strokeWidth={3.6} strokeLinecap="round" />
      <Circle cx={24} cy={42} r={2.4} fill={G} />
    </Fragment>
  ),
  shield: () => (
    <Fragment>
      <Path d="M24 6 L39 11 V24 C39 33 32 39 24 43 C16 39 9 33 9 24 V11 Z" fill={F} stroke={G} strokeWidth={sw} strokeLinejoin="round" />
      <Path d="M24 8 V41" stroke={G} strokeWidth={1.6} />
    </Fragment>
  ),
  potion: () => (
    <Fragment>
      <Path d="M21 11 V19 A9.5 9.5 0 1 0 27 19 V11 Z" fill={F} stroke={G} strokeWidth={sw} strokeLinejoin="round" />
      <Rect x={20.5} y={7} width={7} height={4.5} rx={1.4} fill={G} />
      <Circle cx={21} cy={32} r={1.7} fill={G} />
      <Circle cx={26} cy={28} r={1.3} fill={G} />
    </Fragment>
  ),
  scroll: () => (
    <Fragment>
      <Rect x={14} y={15} width={20} height={18} fill={F} stroke={G} strokeWidth={sw} />
      <Rect x={12} y={11} width={24} height={5} rx={2.5} fill={F} stroke={G} strokeWidth={sw} />
      <Rect x={12} y={32} width={24} height={5} rx={2.5} fill={F} stroke={G} strokeWidth={sw} />
      <Path d="M18 20 H30 M18 24 H30 M18 28 H27" stroke={G} strokeWidth={1.1} strokeLinecap="round" />
    </Fragment>
  ),
  flame: () => (
    <Fragment>
      <Path d="M24 5 C30 13 33 17 33 26 C33 34 29 42 24 42 C19 42 15 34 15 26 C15 20 19 17 21 14 C22 19 25 18 24 13 Z" fill={F} stroke={G} strokeWidth={sw} strokeLinejoin="round" />
      <Path d="M24 22 C27 26 28 29 26 33 C25 36 23 36 22 33 C20 30 22 27 24 22 Z" fill={G} />
    </Fragment>
  ),
  leaf: () => (
    <Fragment>
      <Path d="M24 6 C33 12 34 28 22 41 C12 30 14 13 24 6 Z" fill={F} stroke={G} strokeWidth={sw} strokeLinejoin="round" />
      <Path d="M24 9 C23 20 22 32 22 39" stroke={G} strokeWidth={1.3} fill="none" />
      <Path d="M22.6 17 L28 15 M22.4 23 L29 22 M22.2 29 L27 29" stroke={G} strokeWidth={1} strokeLinecap="round" />
    </Fragment>
  ),
  gem: () => (
    <Fragment>
      <Path d="M16 16 H32 L38 22 L24 42 L10 22 Z" fill={F} stroke={G} strokeWidth={sw} strokeLinejoin="round" />
      <Path d="M10 22 H38 M16 16 L20 22 M32 16 L28 22 M20 22 L24 42 M28 22 L24 42 M20 22 H28" stroke={G} strokeWidth={1.1} fill="none" />
    </Fragment>
  ),
  book: () => (
    <Fragment>
      <Path d="M24 14 C20 11 13 10 8 12 V35 C13 33 20 34 24 37 Z" fill={F} stroke={G} strokeWidth={sw} strokeLinejoin="round" />
      <Path d="M24 14 C28 11 35 10 40 12 V35 C35 33 28 34 24 37 Z" fill={F} stroke={G} strokeWidth={sw} strokeLinejoin="round" />
      <Path d="M24 14 V37" stroke={G} strokeWidth={sw} />
      <Path d="M12 18 H20 M12 22 H20 M12 26 H20 M28 18 H36 M28 22 H36 M28 26 H36" stroke={G} strokeWidth={0.9} strokeLinecap="round" />
    </Fragment>
  ),
  crown: () => (
    <Fragment>
      <Path d="M12 33 L14 18 L20 26 L24 13 L28 26 L34 18 L36 33 Z" fill={F} stroke={G} strokeWidth={sw} strokeLinejoin="round" />
      <Rect x={12} y={33} width={24} height={6} fill={F} stroke={G} strokeWidth={sw} />
      <Circle cx={14} cy={17} r={2} fill={G} />
      <Circle cx={24} cy={12.5} r={2.3} fill={G} />
      <Circle cx={34} cy={17} r={2} fill={G} />
    </Fragment>
  ),
  eye: () => (
    <Fragment>
      <Path d="M6 24 C14 14 34 14 42 24 C34 34 14 34 6 24 Z" fill={F} stroke={G} strokeWidth={sw} strokeLinejoin="round" />
      <Circle cx={24} cy={24} r={5.5} fill="none" stroke={G} strokeWidth={sw} />
      <Circle cx={24} cy={24} r={2} fill={G} />
    </Fragment>
  ),
  bag: () => (
    <Fragment>
      <Path d="M14 28 C14 21 18 23 24 23 C30 23 34 21 34 28 C34 40 29 42 24 42 C19 42 14 40 14 28 Z" fill={F} stroke={G} strokeWidth={sw} strokeLinejoin="round" />
      <Path d="M19 23 L17 14 L24 18.5 L31 14 L29 23 Z" fill={F} stroke={G} strokeWidth={sw} strokeLinejoin="round" />
      <Path d="M19 23 H29" stroke={G} strokeWidth={1.3} />
      <Circle cx={24} cy={33} r={4} fill="none" stroke={G} strokeWidth={1.3} />
    </Fragment>
  ),
  paw: () => (
    <Fragment>
      <Path d="M24 41 C17 41 15 35 18 31 C20 28 28 28 30 31 C33 35 31 41 24 41 Z" fill={G} />
      <Circle cx={15} cy={27} r={3.2} fill={G} />
      <Circle cx={20} cy={22} r={3.4} fill={G} />
      <Circle cx={28} cy={22} r={3.4} fill={G} />
      <Circle cx={33} cy={27} r={3.2} fill={G} />
    </Fragment>
  ),
  dice: () => (
    <Fragment>
      <Path d="M24 8 L38 16 L24 24 L10 16 Z" fill={F} stroke={G} strokeWidth={sw} strokeLinejoin="round" />
      <Path d="M10 16 L24 24 L24 40 L10 32 Z" fill={F} stroke={G} strokeWidth={sw} strokeLinejoin="round" />
      <Path d="M38 16 L24 24 L24 40 L38 32 Z" fill={F} stroke={G} strokeWidth={sw} strokeLinejoin="round" />
      <Circle cx={24} cy={16} r={1.8} fill={G} />
      <Circle cx={15.5} cy={22} r={1.4} fill={G} />
      <Circle cx={18.5} cy={31} r={1.4} fill={G} />
      <Circle cx={29.5} cy={22} r={1.4} fill={G} />
      <Circle cx={32.5} cy={27} r={1.4} fill={G} />
      <Circle cx={32.5} cy={33} r={1.4} fill={G} />
    </Fragment>
  ),
  key: () => (
    <Fragment>
      <Circle cx={14} cy={24} r={7} fill="none" stroke={G} strokeWidth={sw} />
      <Circle cx={14} cy={24} r={2.4} fill="none" stroke={G} strokeWidth={1.4} />
      <Path d="M21 24 H40" stroke={G} strokeWidth={sw} strokeLinecap="round" />
      <Path d="M34 24 V30 M39 24 V28" stroke={G} strokeWidth={sw} strokeLinecap="round" />
    </Fragment>
  ),
  heart: () => <Path d="M24 40 C10 30 10 18 17 16 C21 15 24 18 24 21 C24 18 27 15 31 16 C38 18 38 30 24 40 Z" fill={F} stroke={G} strokeWidth={sw} strokeLinejoin="round" />,
  ring: () => (
    <Fragment>
      <Circle cx={24} cy={30} r={9} fill="none" stroke={G} strokeWidth={sw} />
      <Path d="M24 6 L29 13 L24 19.5 L19 13 Z" fill={F} stroke={G} strokeWidth={sw} strokeLinejoin="round" />
      <Path d="M21 18 L24 21.5 L27 18" fill="none" stroke={G} strokeWidth={1.4} />
    </Fragment>
  ),
  bolt: () => <Polygon points="27,5 13,27 22,27 19,43 35,19 25,19 29,5" fill={G} />,
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
