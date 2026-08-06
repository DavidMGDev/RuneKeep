import { type ReactNode } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { ChamferBox } from '@/components/chamfer-box';
import { Body, DmRune, Rune } from '@/constants/theme';
import { playSfx } from '@/lib/sfx';

const PRESS_SPRING = { damping: 22, stiffness: 320, mass: 0.6 };

interface RuneButtonProps {
  label: string;
  onPress?: () => void;
  /**
   * primary = red fill (ONE per region); secondary = gold hairline on ink; ghost = muted hairline.
   *
   * v0.36 adds `danger`: a RED hairline and red label, for a destructive action sitting in a row of
   * ordinary ones. `primary` was the only red the button had and it is a filled shape reserved for
   * the one main action of a region, so a Delete button among five others had no way to say so.
   */
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  height?: number;
  /** Leading slot (small svg glyph). */
  icon?: ReactNode;
  /** Compact header variant: tighter padding + smaller type (shrinks from the LEFT — the right
   *  edge stays put in a header corner). */
  dense?: boolean;
  style?: object;
  accessibilityLabel?: string;
  /** Suppress the generic tap SFX (#255) — for buttons that already fire a bigger sound (confirm
   *  level, finish rest), so the click doesn't double up. */
  muteSfx?: boolean;
  /** DM Mode (v0.15.0): desaturate into the DM palette. */
  dm?: boolean;
}

/** The app's chamfered button. Flat fill or hairline, 45° corners, subtle press scale. */
const WEB = Platform.OS === 'web';

/** How much to shrink a web label so it fits without truncating. Uppercase letter-spaced text runs
 *  wide, so the thresholds are deliberately early. */
function webShrink(label: string): number {
  const n = label.length;
  if (n <= 12) return 1;
  if (n <= 18) return 0.9;
  return 0.8;
}

export function RuneButton({ label, onPress, kind = 'secondary', disabled, height = 48, icon, dense, style, accessibilityLabel, muteSfx, dm }: RuneButtonProps) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const fill = kind === 'primary' ? (dm ? DmRune.red : Rune.red) : 'transparent';
  const stroke = kind === 'primary' ? 'transparent' : kind === 'danger' ? (dm ? DmRune.red : Rune.red) : kind === 'secondary' ? (dm ? DmRune.accentDim : Rune.goldEdge) : (dm ? DmRune.muted : Rune.muted);
  const color = kind === 'primary' ? (dm ? DmRune.ivory : Rune.ivory) : kind === 'danger' ? (dm ? DmRune.red : Rune.red) : kind === 'secondary' ? (dm ? DmRune.accent : Rune.goldText) : (dm ? DmRune.muted : Rune.muted);
  return (
    <Pressable
      onPress={
        disabled
          ? undefined
          : () => {
              if (!muteSfx) playSfx('buttonTap');
              onPress?.();
            }
      }
      onPressIn={() => {
        scale.value = withSpring(0.965, PRESS_SPRING);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, PRESS_SPRING);
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[{ opacity: disabled ? 0.38 : 1 }, style]}>
      <Animated.View style={anim}>
        <ChamferBox chamfer={dense ? 7 : 10} fill={fill} stroke={stroke} strokeWidth={kind === 'primary' ? 0 : 1.4} style={{ height, justifyContent: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: dense ? 9 : 16 }}>
            {icon}
            {/* v0.13.2 (#359): auto-shrink so wide uppercase labels ("Delete expansion", "New expansion")
                never tail-truncate to "Delete E…" in a narrow flex column — they scale down to fit.

                v0.26.0: `adjustsFontSizeToFit` does nothing in react-native-web, so on the web that
                silently degraded to numberOfLines={1} and truncated after all — a control the player
                cannot read is worse than one that is two lines tall. The web path shrinks by label
                length instead and allows a second line. A rough measure is fine here: it only has to
                keep the text inside the button, and the button is already sized for its label. */}
            <Text
              numberOfLines={WEB ? 2 : 1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              style={{ color, fontSize: (dense ? 11 : 14) * (WEB ? webShrink(label) : 1), lineHeight: WEB ? (dense ? 12 : 15) : undefined, fontFamily: Body.bold, letterSpacing: dense ? 1 : 1.6, textTransform: 'uppercase', textAlign: 'center' }}>
              {label}
            </Text>
          </View>
        </ChamferBox>
      </Animated.View>
    </Pressable>
  );
}
