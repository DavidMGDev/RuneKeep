import { type ImageContentFit } from 'expo-image';
import { type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { ArtImage } from '@/components/art-image';
import { PressableArt } from '@/components/pressable-art';
import { Display } from '@/constants/theme';
import { box } from '@/lib/design';
import type { PipState } from '@/lib/pips';

interface ArtBoxProps {
  left: number;
  top: number;
  width: number;
  height: number;
  source: number;
  /** `contain` (default) for icons/emblems; `fill` only for panel backgrounds. */
  fit?: ImageContentFit;
  /** Wrap in a PressableArt so the art springs on tap. */
  pressable?: boolean;
  onPress?: () => void;
  pressedScale?: number;
  /** Recolor red art to the accent. */
  tint?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

/** A single art asset positioned in design px — optionally tappable (springs on press). */
export function ArtBox({
  left,
  top,
  width,
  height,
  source,
  fit = 'contain',
  pressable,
  onPress,
  pressedScale,
  tint,
  accessibilityLabel,
  accessibilityHint,
}: ArtBoxProps) {
  const image = <ArtImage source={source} fit={fit} tint={tint} />;
  if (pressable) {
    return (
      <PressableArt style={box(left, top, width, height)} onPress={onPress} pressedScale={pressedScale} accessibilityLabel={accessibilityLabel} accessibilityHint={accessibilityHint}>
        {image}
      </PressableArt>
    );
  }
  return <View style={box(left, top, width, height)}>{image}</View>;
}

type HAlign = 'left' | 'center' | 'right';
type VAlign = 'top' | 'center' | 'bottom';

interface SheetTextProps {
  left: number;
  top: number;
  width: number;
  height: number;
  color: string;
  size: number;
  family?: string;
  align?: HAlign;
  vAlign?: VAlign;
  letterSpacing?: number;
  lineHeight?: number;
  numberOfLines?: number;
  uppercase?: boolean;
  italic?: boolean;
  /** Use lining tabular figures so numerals align — for stat numbers. */
  tabularNums?: boolean;
  /**
   * Opt-in auto-shrink for genuinely variable text (e.g. the character name). OFF by default:
   * `adjustsFontSizeToFit` shrinks on native but is a NO-OP on react-native-web, which made every
   * tight label render smaller on the phone than on web (#43 B). Fixed labels must be sized to fit.
   */
  fit?: boolean;
  /** Lower bound for auto-shrink, as a fraction of `size` (only with `fit`). */
  minScale?: number;
  children: ReactNode;
}

const justify = { top: 'flex-start', center: 'center', bottom: 'flex-end' } as const;
const items = { left: 'flex-start', center: 'center', right: 'flex-end' } as const;

/**
 * A text run pinned to a design-px box. The box is the text's HARD limit: it clips
 * (`overflow: hidden`) — the Ligma rects are max bounding boxes, not suggestions. Text renders at
 * `size` on BOTH platforms (mobile-first, #43 B); pass `fit` only for variable-length content.
 */
export function SheetText({
  left,
  top,
  width,
  height,
  color,
  size,
  family = Display.bold,
  align = 'center',
  vAlign = 'center',
  letterSpacing,
  lineHeight,
  numberOfLines = 1,
  uppercase,
  italic,
  tabularNums,
  fit,
  minScale = 0.5,
  children,
}: SheetTextProps) {
  return (
    <View
      style={[
        box(left, top, width, height),
        { justifyContent: justify[vAlign], alignItems: items[align], overflow: 'hidden' },
      ]}
      pointerEvents="none">
      <Text
        numberOfLines={numberOfLines}
        adjustsFontSizeToFit={fit}
        minimumFontScale={fit ? minScale : undefined}
        style={{
          maxWidth: width,
          color,
          fontSize: size,
          fontFamily: family,
          textAlign: align,
          letterSpacing,
          lineHeight,
          textTransform: uppercase ? 'uppercase' : 'none',
          fontStyle: italic ? 'italic' : 'normal',
          fontVariant: tabularNums ? ['tabular-nums'] : undefined,
        }}>
        {children}
      </Text>
    </View>
  );
}

interface PipRowProps {
  left: number;
  top: number;
  width: number;
  height: number;
  states: PipState[];
  pipWidth: number;
  pipHeight: number;
  /** `fill` lets pip art stretch into a non-square slot (e.g. wide stress pips); default keeps aspect. */
  pipFit?: ImageContentFit;
  artFor: (state: PipState) => number;
  /** Optional per-state tint (e.g. retint the red 'active' pips to the accent color). */
  tintFor?: (state: PipState) => string | undefined;
  onPressPip?: (index: number) => void;
  /** Screen-reader track name, e.g. "Stress" → each pip announces "Stress, filled" (X1). */
  trackLabel?: string;
}

const PIP_STATE_WORD: Record<PipState, string> = {
  active: 'filled',
  empty: 'empty',
  depleted: 'spent',
  locked: 'locked',
  golden: 'golden, worth two',
};

/**
 * A resource track rendered as an evenly-spaced row of pips. Each pip is a PressableArt so it can
 * later spring / spend on tap; art per slot is chosen by `artFor` from the resolved PipState.
 */
export function PipRow({
  left,
  top,
  width,
  height,
  states,
  pipWidth,
  pipHeight,
  pipFit = 'contain',
  artFor,
  tintFor,
  onPressPip,
  trackLabel,
}: PipRowProps) {
  return (
    <View
      style={[
        box(left, top, width, height),
        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
      ]}>
      {states.map((state, i) => (
        <PressableArt
          // eslint-disable-next-line react/no-array-index-key
          key={i}
          style={{ width: pipWidth, height: pipHeight }}
          pressedScale={1.25}
          hitSlop={Math.max(0, Math.round((44 - pipWidth) / 2))}
          onPress={onPressPip ? () => onPressPip(i) : undefined}
          accessibilityLabel={trackLabel ? `${trackLabel}, ${PIP_STATE_WORD[state]}` : undefined}
          accessibilityHint={trackLabel && onPressPip ? 'Double tap to set this level' : undefined}>
          <ArtImage source={artFor(state)} fit={pipFit} tint={tintFor?.(state)} />
        </PressableArt>
      ))}
    </View>
  );
}
