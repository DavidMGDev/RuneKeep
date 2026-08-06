import { type ImageContentFit } from 'expo-image';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type NativeSyntheticEvent, Platform, Text, type TextLayoutEventData, View } from 'react-native';

import { ArtImage } from '@/components/art-image';
import { PressableArt } from '@/components/pressable-art';
import { Display } from '@/constants/theme';
import { box } from '@/lib/design';
import { fitFontSize, measureWeb } from './fit-text';
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

/**
 * Cap on the OS font-size multiplier for design-px text (v0.22.0). The sheet's boxes are fixed
 * rectangles inside DesignStage: the stage scales box + glyph together, but the OS accessibility
 * multiplier is applied INSIDE that space to fontSize only, so it grows text without growing its
 * box. 1.1 is the headroom the tightest boxes carry after the v0.22.0 widening.
 */
export const SHEET_MAX_FONT_SCALE = 1.1;

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
        // v0.22.0: these boxes are design-px rectangles that DON'T grow with the OS font setting —
        // DesignStage scales the box and the glyph together, but the OS multiplier is applied inside
        // that space to fontSize alone. Uncapped it is a pure overflow multiplier into a hard clip.
        maxFontSizeMultiplier={SHEET_MAX_FONT_SCALE}
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

interface FillTextProps {
  left: number;
  top: number;
  width: number;
  height: number;
  color: string;
  family?: string;
  align?: HAlign;
  vAlign?: VAlign;
  uppercase?: boolean;
  letterSpacing?: number;
  /** Max wrapped lines the text may use (the character name fills up to 2). */
  maxLines?: number;
  minSize?: number;
  maxSize?: number;
  children: string;
}

/**
 * FILL-the-box auto-size text (#214): unlike `SheetText fit` (which only *shrinks* from a fixed size
 * via `adjustsFontSizeToFit` — and on Android mis-wraps a long name onto one tiny line), this
 * binary-searches the LARGEST font that fits the box, GROWING a short one-word name up to fill it and
 * SHRINKING a long name down (wrapping to `maxLines`). It measures real line widths/heights via
 * `onTextLayout` (design px — the DesignStage scales by transform, not layout), so it never stretches
 * the glyphs — only sizes them. Used for the sheet's character name.
 */
export function FillText({ left, top, width, height, color, family = Display.black, align = 'left', vAlign = 'center', uppercase, letterSpacing = 0, maxLines = 2, minSize = 13, maxSize = 56, children }: FillTextProps) {
  /**
   * v0.27.0: in a BROWSER the size is worked out before rendering, not after.
   *
   * The search below is driven by `onTextLayout`, which react-native-web does not implement, so it
   * never took a step: the name stayed at `maxSize`, overflowed a box with `overflow: hidden`, and
   * the sheet appeared to have no name on it at all. A canvas can measure text without rendering it,
   * so on the web the answer is known up front. Null means no canvas was available (an old engine,
   * a blocked context); the layout-driven path stays in place underneath for exactly that case.
   */
  const webSize = useMemo(() => {
    if (Platform.OS !== 'web') return null;
    const text = uppercase ? children.toUpperCase() : children;
    const spec = { text, family, letterSpacing, lineHeightRatio: 1.04, width };
    if (!measureWeb(spec, minSize)) return null;
    return fitFontSize({ width, height, maxLines, minSize, maxSize, measure: (s) => measureWeb(spec, s) ?? { lines: 99, widest: 1e6, height: 1e6 } });
  }, [children, family, letterSpacing, uppercase, width, height, maxLines, minSize, maxSize]);

  const [size, setSize] = useState(webSize ?? maxSize);
  const [ready, setReady] = useState(webSize !== null);
  const lo = useRef(minSize);
  const hi = useRef(maxSize);
  // Re-search whenever the text or box changes.
  useEffect(() => {
    if (webSize !== null) {
      setSize(webSize);
      setReady(true);
      return;
    }
    lo.current = minSize;
    hi.current = maxSize;
    setReady(false);
    setSize(maxSize);
  }, [children, width, height, minSize, maxSize, maxLines, webSize]);

  const onTextLayout = useCallback(
    (e: NativeSyntheticEvent<TextLayoutEventData>) => {
      if (ready) return;
      const lines = e.nativeEvent.lines;
      if (!lines.length) return;
      const lineCount = lines.length;
      const maxLineW = lines.reduce((m, l) => Math.max(m, l.width), 0);
      const totalH = lines.reduce((s, l) => s + l.height, 0);
      const fits = lineCount <= maxLines && maxLineW <= width + 0.5 && totalH <= height + 0.5;
      if (fits) lo.current = size;
      else hi.current = size;
      // Converged: settle on the largest size known to fit (lo), then reveal.
      if (hi.current - lo.current <= 1) {
        const final = Math.max(minSize, Math.floor(lo.current));
        if (final !== size) setSize(final);
        setReady(true);
        return;
      }
      const next = Math.max(minSize, Math.min(maxSize, Math.round((lo.current + hi.current) / 2)));
      if (next === size) {
        setReady(true);
        return;
      }
      setSize(next);
    },
    [ready, size, width, height, maxLines, minSize, maxSize],
  );

  return (
    <View style={[box(left, top, width, height), { justifyContent: justify[vAlign], alignItems: items[align], overflow: 'hidden' }]} pointerEvents="none">
      <Text
        onTextLayout={onTextLayout}
        numberOfLines={ready ? maxLines : undefined}
        maxFontSizeMultiplier={SHEET_MAX_FONT_SCALE}
        style={{
          maxWidth: width,
          color,
          fontSize: size,
          lineHeight: size * 1.04,
          fontFamily: family,
          textAlign: align,
          textAlignVertical: 'center',
          // Drop Android's extra font padding (#248 item 9) so the glyph fills the line box — a short
          // name ("Joe") then sizes UP to fill the whole name box instead of floating at the top.
          includeFontPadding: false,
          letterSpacing,
          textTransform: uppercase ? 'uppercase' : 'none',
          opacity: ready ? 1 : 0, // hide the search frames; reveal once the size is settled
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
  /** Art per state — or use `renderPip` for fully custom pips instead. */
  artFor?: (state: PipState) => number;
  /** Custom pip renderer (#70 C: e.g. chamfered stress shapes). Wins over art. */
  renderPip?: (state: PipState) => ReactNode;
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
  renderPip,
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
           
          key={i}
          style={{ width: pipWidth, height: pipHeight }}
          pressedScale={1.25}
          hitSlop={Math.max(0, Math.round((44 - pipWidth) / 2))}
          onPress={onPressPip ? () => onPressPip(i) : undefined}
          accessibilityLabel={trackLabel ? `${trackLabel}, ${PIP_STATE_WORD[state]}` : undefined}
          accessibilityHint={trackLabel && onPressPip ? 'Double tap to set this level' : undefined}>
          {renderPip ? (
            renderPip(state)
          ) : artFor ? (
            <ArtImage source={artFor(state)} fit={pipFit} tint={tintFor?.(state)} />
          ) : null}
        </PressableArt>
      ))}
    </View>
  );
}
