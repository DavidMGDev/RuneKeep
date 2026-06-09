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
}: ArtBoxProps) {
  const image = <ArtImage source={source} fit={fit} />;
  if (pressable) {
    return (
      <PressableArt style={box(left, top, width, height)} onPress={onPress} pressedScale={pressedScale}>
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
  /** Lower bound for auto-shrink, as a fraction of `size`. */
  minScale?: number;
  children: ReactNode;
}

const justify = { top: 'flex-start', center: 'center', bottom: 'flex-end' } as const;
const items = { left: 'flex-start', center: 'center', right: 'flex-end' } as const;

/**
 * A text run pinned to a design-px box. The box is the text's HARD limit: it clips
 * (`overflow: hidden`) and the text auto-shrinks (`adjustsFontSizeToFit`) so it can never spill past
 * the rectangle — the Ligma rects are max bounding boxes, not suggestions. `size` is the ceiling.
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
        adjustsFontSizeToFit
        minimumFontScale={minScale}
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
  artFor: (state: PipState) => number;
  onPressPip?: (index: number) => void;
}

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
  artFor,
  onPressPip,
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
          onPress={onPressPip ? () => onPressPip(i) : undefined}>
          <ArtImage source={artFor(state)} fit="contain" />
        </PressableArt>
      ))}
    </View>
  );
}
