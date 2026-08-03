import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Path, Polyline, Rect } from 'react-native-svg';

import { Rune } from '@/constants/theme';
import { tapHaptic } from '@/lib/haptics';
import { playSfx } from '@/lib/sfx';

export type MoodAction = 'delete' | 'copy' | 'front' | 'back' | 'centre';

const R_OUT = 78;
const R_IN = 34;
const ICON = 22;

const OPTIONS: { key: MoodAction; label: string }[] = [
  { key: 'delete', label: 'Delete' },
  { key: 'copy', label: 'Duplicate' },
  { key: 'front', label: 'Bring to front' },
  { key: 'back', label: 'Send to back' },
  { key: 'centre', label: 'Centre' },
];

/** One wedge of the ring, drawn in a local 2R x 2R canvas centred at (R, R). */
function sector(a0: number, a1: number): string {
  const p = (r: number, deg: number) => {
    const a = (deg * Math.PI) / 180;
    return [R_OUT + r * Math.cos(a), R_OUT + r * Math.sin(a)];
  };
  const [x0, y0] = p(R_OUT, a0);
  const [x1, y1] = p(R_OUT, a1);
  const [x2, y2] = p(R_IN, a1);
  const [x3, y3] = p(R_IN, a0);
  return `M${x0},${y0} A${R_OUT},${R_OUT} 0 0 1 ${x1},${y1} L${x2},${y2} A${R_IN},${R_IN} 0 0 0 ${x3},${y3} Z`;
}

function ActionGlyph({ kind, lit }: { kind: MoodAction; lit: boolean }) {
  const c = kind === 'delete' ? '#E2705A' : lit ? Rune.goldBright : Rune.goldText;
  const s = { fill: 'none' as const, stroke: c, strokeWidth: 1.9, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  return (
    <Svg width={ICON} height={ICON} viewBox="0 0 24 24" pointerEvents="none">
      {kind === 'delete' ? (
        <>
          <Path d="M5 7 H19" {...s} />
          <Path d="M9.5 7 V5.2 H14.5 V7" {...s} />
          <Path d="M6.5 7 L7.4 19.5 H16.6 L17.5 7" {...s} />
        </>
      ) : kind === 'copy' ? (
        <>
          <Rect x={4} y={4} width={12} height={12} {...s} />
          <Path d="M8 20 H20 V8" {...s} />
        </>
      ) : kind === 'front' ? (
        <>
          <Polyline points="12,3 12,15" {...s} />
          <Polyline points="6,9 12,3 18,9" {...s} />
          <Path d="M4 20 H20" {...s} />
        </>
      ) : kind === 'back' ? (
        <>
          <Polyline points="12,21 12,9" {...s} />
          <Polyline points="6,15 12,21 18,15" {...s} />
          <Path d="M4 4 H20" {...s} />
        </>
      ) : (
        <>
          <Path d="M12 3 V21 M3 12 H21" {...s} />
          <Path d="M8.5 8.5 H15.5 V15.5 H8.5 Z" {...s} />
        </>
      )}
    </Svg>
  );
}

/**
 * The moodboard's per-image menu (v0.34.0).
 *
 * The same wheel the Golden Gear Edit hold uses, minus everything that belongs to a HOLD: there is no
 * finger to track and no drag-to-a-wedge, because this one is opened by a double tap and closed by
 * one. Each wedge is its own pressable so it lights on touch and fires on release, which is the touch
 * feedback the owner asked for.
 *
 * Positioned at the image and clamped so the whole ring stays on the canvas, since a wedge that falls
 * off the edge is an option you cannot pick.
 */
export function MoodboardRadial({ x, y, canvasW, canvasH, onPick, onDismiss }: { x: number; y: number; canvasW: number; canvasH: number; onPick: (a: MoodAction) => void; onDismiss: () => void }) {
  const p = useSharedValue(0);
  const [lit, setLit] = useState<MoodAction | null>(null);
  useEffect(() => {
    p.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) });
    playSfx('panelOpen');
  }, [p]);

  const cx = Math.min(canvasW - R_OUT - 8, Math.max(R_OUT + 8, x));
  const cy = Math.min(canvasH - R_OUT - 8, Math.max(R_OUT + 8, y));
  const style = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ scale: 0.86 + 0.14 * p.value }] }));

  const n = OPTIONS.length;
  const step = 360 / n;

  return (
    <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}>
      {/* A tap anywhere else puts the wheel away, which is the only way out other than choosing. */}
      <Pressable style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }} onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Close the image menu" />
      <Animated.View pointerEvents="box-none" style={[{ position: 'absolute', left: cx - R_OUT, top: cy - R_OUT, width: R_OUT * 2, height: R_OUT * 2 }, style]}>
        <Svg width={R_OUT * 2} height={R_OUT * 2} pointerEvents="none">
          {OPTIONS.map((o, i) => {
            const a0 = -90 + i * step + 1.2;
            const a1 = -90 + (i + 1) * step - 1.2;
            return <Path key={o.key} d={sector(a0, a1)} fill={lit === o.key ? 'rgba(74,82,92,0.95)' : 'rgba(16,20,28,0.92)'} stroke={Rune.goldEdge} strokeWidth={1.1} />;
          })}
        </Svg>
        {OPTIONS.map((o, i) => {
          const mid = ((-90 + (i + 0.5) * step) * Math.PI) / 180;
          const r = (R_IN + R_OUT) / 2;
          return (
            <Pressable
              key={o.key}
              onPressIn={() => { setLit(o.key); tapHaptic(); playSfx('floatMenuHighlight'); }}
              onPressOut={() => setLit(null)}
              onPress={() => onPick(o.key)}
              accessibilityRole="button"
              accessibilityLabel={o.label}
              style={{ position: 'absolute', left: R_OUT + r * Math.cos(mid) - 22, top: R_OUT + r * Math.sin(mid) - 22, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <ActionGlyph kind={o.key} lit={lit === o.key} />
            </Pressable>
          );
        })}
      </Animated.View>
    </View>
  );
}
