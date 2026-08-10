/**
 * The DM's shared glyphs (v0.35.1, owner).
 *
 * Two of them were illegible at the size they are actually drawn: the card archive was a BOOKMARK,
 * which says "saved", not "library", and the party-modifiers button was a pair of circles and a plus
 * that read as noise. Both are here so the same drawing is used everywhere and there is one place to
 * change it.
 */
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { DmRune } from '@/constants/theme';

/** An OPEN BOOK: two pages over a spine. The card archive, wherever it is reached from. */
export function ArchiveIcon({ size = 18, color = DmRune.accent, dim = DmRune.accentDim }: { size?: number; color?: string; dim?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 6.4C10.2 5 7.8 4.6 4 4.8V18c3.8-.2 6.2.2 8 1.6 1.8-1.4 4.2-1.8 8-1.6V4.8c-3.8-.2-6.2.2-8 1.6Z" fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
      <Line x1={12} y1={6.4} x2={12} y2={19.6} stroke={color} strokeWidth={1.6} />
      <Path d="M6.4 8.6h3.2M6.4 11.4h3.2M14.4 8.6h3.2M14.4 11.4h3.2" stroke={dim} strokeWidth={1.2} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * SLIDERS: the universal "adjust these" control, for the party-wide modifiers button.
 *
 * Two tracks with a knob on each, which is the one shape that reads as "settings you change" at 22px.
 * The thing being adjusted is named by the screen it sits on, so the icon does not have to say
 * "party" as well as "modifiers", which is what the old one tried to do and failed at.
 */
export function PartyEffectsIcon({ size = 22, color = DmRune.accent, dim = DmRune.accentDim }: { size?: number; color?: string; dim?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Line x1={3} y1={8} x2={21} y2={8} stroke={dim} strokeWidth={1.7} strokeLinecap="round" />
      <Line x1={3} y1={16} x2={21} y2={16} stroke={dim} strokeWidth={1.7} strokeLinecap="round" />
      <Circle cx={9} cy={8} r={3.1} fill={DmRune.ink} stroke={color} strokeWidth={2} />
      <Circle cx={16} cy={16} r={3.1} fill={DmRune.ink} stroke={color} strokeWidth={2} />
    </Svg>
  );
}

/** Add someone to the party (v0.39.0): a figure with a plus beside it. */
export function AddMemberIcon({ size = 22, color = DmRune.accent, dim = DmRune.accentDim }: { size?: number; color?: string; dim?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={9} cy={8} r={3.4} fill="none" stroke={color} strokeWidth={1.8} />
      <Path d="M3 20c0-3.4 2.7-5.6 6-5.6s6 2.2 6 5.6" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Line x1={18.5} y1={5} x2={18.5} y2={12} stroke={dim} strokeWidth={2} strokeLinecap="round" />
      <Line x1={15} y1={8.5} x2={22} y2={8.5} stroke={dim} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

/** The party sheet: three figures side by side. */
export function PartySheetIcon({ size = 18, color = DmRune.accent, dim = DmRune.accentDim }: { size?: number; color?: string; dim?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={8} r={3.1} fill="none" stroke={color} strokeWidth={1.7} />
      <Path d="M6.2 19c0-3.2 2.6-5.2 5.8-5.2s5.8 2 5.8 5.2" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
      <Circle cx={4.4} cy={9.6} r={2.1} fill="none" stroke={dim} strokeWidth={1.4} />
      <Circle cx={19.6} cy={9.6} r={2.1} fill="none" stroke={dim} strokeWidth={1.4} />
    </Svg>
  );
}
