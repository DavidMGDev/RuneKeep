import * as Haptics from 'expo-haptics';

/**
 * Tiny haptic helpers for the animation-first feel (§7 A4). Every call is fire-and-forget and
 * swallows errors so it is a no-op where haptics are unavailable (web, emulators, denied permission).
 */
export function tapHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function focusHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}
