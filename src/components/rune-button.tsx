import { type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { ChamferBox } from '@/components/chamfer-box';
import { Body, Rune } from '@/constants/theme';

const PRESS_SPRING = { damping: 22, stiffness: 320, mass: 0.6 };

interface RuneButtonProps {
  label: string;
  onPress?: () => void;
  /** primary = red fill (ONE per region); secondary = gold hairline on ink; ghost = muted hairline. */
  kind?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  height?: number;
  /** Leading slot (small svg glyph). */
  icon?: ReactNode;
  /** Compact header variant: tighter padding + smaller type (shrinks from the LEFT — the right
   *  edge stays put in a header corner). */
  dense?: boolean;
  style?: object;
  accessibilityLabel?: string;
}

/** The app's chamfered button. Flat fill or hairline, 45° corners, subtle press scale. */
export function RuneButton({ label, onPress, kind = 'secondary', disabled, height = 48, icon, dense, style, accessibilityLabel }: RuneButtonProps) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const fill = kind === 'primary' ? Rune.red : 'transparent';
  const stroke = kind === 'primary' ? 'transparent' : kind === 'secondary' ? Rune.goldEdge : Rune.muted;
  const color = kind === 'primary' ? Rune.ivory : kind === 'secondary' ? Rune.goldText : Rune.muted;
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
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
      style={[{ opacity: disabled ? 0.38 : 1, alignSelf: dense ? 'flex-end' : undefined }, style]}>
      <Animated.View style={anim}>
        <ChamferBox chamfer={dense ? 7 : 10} fill={fill} stroke={stroke} strokeWidth={kind === 'primary' ? 0 : 1.4} style={{ height, justifyContent: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: dense ? 9 : 16 }}>
            {icon}
            <Text numberOfLines={1} style={{ color, fontSize: dense ? 11 : 14, fontFamily: Body.bold, letterSpacing: dense ? 1 : 1.6, textTransform: 'uppercase' }}>
              {label}
            </Text>
          </View>
        </ChamferBox>
      </Animated.View>
    </Pressable>
  );
}
