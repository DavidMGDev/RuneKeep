/** Stat glyphs for the DM overview/encounter panels (v0.15.0; filled + sheet-coloured in v0.16.0, PRD
 *  #4/#6). These deliberately carry the CHARACTER SHEET's colours (not the desaturated DM palette): HP &
 *  Stress heraldic red, Armor gold, Hope amber. `filled` paints the glyph solid so it reads under a finger. */
import { Rune } from '@/constants/theme';
import Svg, { Path, Polygon, Polyline } from 'react-native-svg';

export type StatGlyphKind = 'hp' | 'armor' | 'stress' | 'hope' | 'threshold' | 'difficulty';

/** Sheet-matched stat colours (PRD #4): HP/Stress = the one heraldic red, Armor = gold, Hope = amber. */
export const STAT_COLOR: Record<StatGlyphKind, string> = {
  hp: Rune.hpRed,
  armor: Rune.goldEdge,
  stress: Rune.red,
  hope: Rune.hopeAmber,
  threshold: Rune.goldEdge,
  // v0.36.1: Difficulty is the number an attack must BEAT, so it reads in the same gold as the
  // other defensive numbers rather than competing with the red vitals.
  difficulty: Rune.goldEdge,
};

export function StatGlyph({ kind, color, size = 18, filled }: { kind: StatGlyphKind; color?: string; size?: number; filled?: boolean }) {
  const c = color ?? STAT_COLOR[kind];
  const fill = filled ? c : 'none';
  const stroke = filled ? 'none' : c;
  const sw = 1.8;
  if (kind === 'hp') return (
    <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M12 21 C4 14 3 8 7 5 C10 3 12 6 12 6 C12 6 14 3 17 5 C21 8 20 14 12 21 Z" fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" /></Svg>
  );
  if (kind === 'armor') return (
    <Svg width={size} height={size} viewBox="0 0 24 24"><Polygon points="12,2 20,5 20,12 12,22 4,12 4,5" fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" /></Svg>
  );
  if (kind === 'stress') return (
    <Svg width={size} height={size} viewBox="0 0 24 24"><Polygon points="13,2 5,13 11,13 10,22 19,10 12,10" fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" /></Svg>
  );
  if (kind === 'hope') return (
    <Svg width={size} height={size} viewBox="0 0 24 24"><Polygon points="12,2 14,9 21,9 15,13 17,21 12,16 7,21 9,13 3,9 10,9" fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" /></Svg>
  );
  if (kind === 'difficulty') return (
    // A target: the number to beat.
    <Svg width={size} height={size} viewBox="0 0 24 24"><Polygon points="12,2 20,6 20,13 12,22 4,13 4,6" fill="none" stroke={c} strokeWidth={sw} strokeLinejoin="round" /><Polygon points="12,8 15,10 15,13 12,16 9,13 9,10" fill={c} stroke="none" /></Svg>
  );
  // threshold: two chevrons (always stroked)
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24"><Polyline points="5,8 12,14 19,8" fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" /><Polyline points="5,14 12,20 19,14" fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" /></Svg>
  );
}
