/** Small stat glyphs for the DM overview/encounter panels (v0.15.0) — sheet-language icons at a compact
 *  size, standing in for the sheet's full tracks (PRD #23). */
import Svg, { Circle, Path, Polygon, Polyline } from 'react-native-svg';

export type StatGlyphKind = 'hp' | 'armor' | 'stress' | 'hope' | 'threshold';

export function StatGlyph({ kind, color, size = 18 }: { kind: StatGlyphKind; color: string; size?: number }) {
  const sw = 1.8;
  if (kind === 'hp') return (
    <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M12 21 C4 14 3 8 7 5 C10 3 12 6 12 6 C12 6 14 3 17 5 C21 8 20 14 12 21 Z" fill="none" stroke={color} strokeWidth={sw} strokeLinejoin="round" /></Svg>
  );
  if (kind === 'armor') return (
    <Svg width={size} height={size} viewBox="0 0 24 24"><Polygon points="12,2 20,5 20,12 12,22 4,12 4,5" fill="none" stroke={color} strokeWidth={sw} strokeLinejoin="round" /></Svg>
  );
  if (kind === 'stress') return (
    <Svg width={size} height={size} viewBox="0 0 24 24"><Polygon points="13,2 5,13 11,13 10,22 19,10 12,10" fill="none" stroke={color} strokeWidth={sw} strokeLinejoin="round" /></Svg>
  );
  if (kind === 'hope') return (
    <Svg width={size} height={size} viewBox="0 0 24 24"><Polygon points="12,2 14,9 21,9 15,13 17,21 12,16 7,21 9,13 3,9 10,9" fill="none" stroke={color} strokeWidth={sw} strokeLinejoin="round" /></Svg>
  );
  // threshold: two chevrons
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24"><Polyline points="5,8 12,14 19,8" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" /><Polyline points="5,14 12,20 19,14" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" /><Circle cx={12} cy={4} r={0} fill="none" /></Svg>
  );
}
