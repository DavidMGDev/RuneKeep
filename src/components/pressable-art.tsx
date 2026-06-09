import { type ReactNode } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

interface PressableArtProps {
  children: ReactNode;
  /** Absolute/layout style for the touch target (usually a design-px box). */
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  /** Scale reached while pressed. Tune per element; default a subtle grow. */
  pressedScale?: number;
  disabled?: boolean;
  /** Spring used for the grow; exposed so callers can make specific icons bouncier. */
  spring?: { damping?: number; stiffness?: number; mass?: number };
}

/**
 * The animation-ready wrapper for every interactive art piece on a sheet.
 *
 * It owns a Reanimated `scale` shared value and springs on press, so press feedback exists today and
 * richer behavior (tap-to-grow, particle burst, float) is a localized change here — never bake a
 * bare <Image> in where touch behavior is expected (see docs/animation-stack.md).
 */
export function PressableArt({
  children,
  style,
  onPress,
  pressedScale = 1.14,
  disabled = false,
  spring,
}: PressableArtProps) {
  const scale = useSharedValue(1);
  const config = { damping: 13, stiffness: 220, mass: 0.6, ...spring };

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      style={style}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(pressedScale, config);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { ...config, stiffness: 180 });
      }}>
      <Animated.View style={[{ width: '100%', height: '100%' }, animatedStyle]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
