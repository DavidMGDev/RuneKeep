import { Pressable, Text, View } from 'react-native';

import { Body, Display, Rune } from '@/constants/theme';
import { DividerPlaque, getPlaqueTheme } from '@/features/create/components/card-divider';
import { FORGED_H, FORGED_W, PlaqueLabel } from '@/features/create/components/forged-card';

import { MartialFormIcon } from '../sheet/deck-toggle-icon';

/**
 * The Martial Artist's FOCUS card (#357) — a live, interactive card at the head of the Martial Form
 * category. Focus is rolled physically during a rest (d6s equal to Instinct, tokens = the highest
 * value), so the card only TRACKS the tokens: six tappable pips, current-value taps are gameplay
 * (the companion-stress convention — no padlock; there is no structure to protect).
 */
const ART_H = Math.round(FORGED_H * 0.26);
const MAX_FOCUS = 6; // tokens = the highest of the rolled d6s → can never exceed 6

export function MartialFocusCard({ focus, onChange }: { focus: number; onChange: (n: number) => void }) {
  const theme = getPlaqueTheme('Ability');
  const cur = Math.max(0, Math.min(MAX_FOCUS, focus));
  return (
    <View style={{ width: FORGED_W, height: FORGED_H, backgroundColor: Rune.sheet, overflow: 'hidden' }}>
      <View style={{ height: ART_H, backgroundColor: '#4a3520', alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ transform: [{ scale: 1.4 }] }}><MartialFormIcon /></View>
      </View>
      <View style={{ position: 'absolute', top: ART_H - (FORGED_W + 14) / (1978.811 / 151.3009) / 2, left: -7, right: -7, alignItems: 'center' }} pointerEvents="none">
        <DividerPlaque width={FORGED_W + 14} gradientStops={theme.gradientStops} maskFill={theme.solidColor}>
          <PlaqueLabel text="Focus" textColor={theme.textColor} />
        </DividerPlaque>
      </View>
      <View style={{ flex: 1, paddingHorizontal: 14, paddingTop: 18, paddingBottom: 12, alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', gap: 7, justifyContent: 'center', marginTop: 6 }}>
          {Array.from({ length: MAX_FOCUS }, (_, i) => (
            <Pressable key={i} onPress={() => onChange(i + 1 <= cur ? i : i + 1)} hitSlop={4} accessibilityRole="button" accessibilityLabel={`Focus ${i + 1}`}>
              <View style={{ width: 20, height: 20, borderWidth: 1.6, borderColor: '#8a6a2e', backgroundColor: i < cur ? Rune.goldBright : 'transparent', transform: [{ rotate: '45deg' }] }} />
            </Pressable>
          ))}
        </View>
        <Text style={{ color: Rune.inkText, fontSize: 26, fontFamily: Display.black, marginTop: 12 }}>{cur}</Text>
        <Text style={{ color: Rune.inkText, fontSize: 9.5, lineHeight: 13.2, fontFamily: Body.regular, textAlign: 'left', marginTop: 10 }}>
          <Text style={{ fontFamily: Body.bold }}>Focus: </Text>
          During a rest, roll a number of d6s equal to your Instinct and set this card to the highest value rolled. Spend a Focus to shift into a stance until you take Severe damage, the scene ends, you mark your last Hit Point, or you shift into another stance.
        </Text>
        <Text style={{ color: Rune.inkMuted, fontSize: 8.5, fontFamily: Body.medium, textAlign: 'center', marginTop: 'auto' }}>Tap a pip to set · roll your Focus with physical dice</Text>
      </View>
    </View>
  );
}
