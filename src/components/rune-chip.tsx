import { Pressable, Text } from 'react-native';

import { ChamferBox } from '@/components/chamfer-box';
import { Body, Rune } from '@/constants/theme';
import { playSfx } from '@/lib/sfx';

/**
 * A small chamfered filter/selection chip: red fill when active, gold hairline at rest
 * (DESIGN.md chips). Optional identity tint colors the ACTIVE fill instead of red.
 */
export function RuneChip({
  label,
  active,
  onPress,
  tint,
  muteSfx,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  /** Identity color for the active fill (domain/class deep tone); defaults to the red. */
  tint?: string;
  /** Suppress the generic tap SFX (#258). */
  muteSfx?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress ? () => { if (!muteSfx) playSfx('buttonTap'); onPress(); } : undefined}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      accessibilityLabel={label}
      hitSlop={6}>
      <ChamferBox
        chamfer={6}
        fill={active ? (tint ?? Rune.red) : 'transparent'}
        stroke={active ? 'transparent' : 'rgba(218,162,73,0.55)'}
        strokeWidth={1.2}
        style={{ height: 30, justifyContent: 'center', paddingHorizontal: 12 }}>
        <Text numberOfLines={1} style={{ color: active ? Rune.ivory : Rune.goldText, fontSize: 11, fontFamily: Body.bold, letterSpacing: 1.1, textTransform: 'uppercase' }}>
          {label}
        </Text>
      </ChamferBox>
    </Pressable>
  );
}
