import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { Body, Display, Rune } from '@/constants/theme';
import { FORGED_H, FORGED_W } from './forged-card';

/**
 * Gold (#128, owner): measured in handfuls, bags, and a chest. 10 handfuls make a bag, 10 bags make
 * a chest, and nobody holds two chests — so the max is 10 handfuls + 10 bags + 1 chest. The counts
 * are tracked independently (each capped); the card carries its OWN +/- controls and tappable coin
 * rows. It's a live/interactive card (only the focused carousel card lets you actually press them).
 */
export interface GoldAmount {
  handfuls: number;
  bags: number;
  chest: number;
}
export const GOLD_MAX = { handfuls: 10, bags: 10, chest: 1 } as const;
export const GOLD_DEFAULT: GoldAmount = { handfuls: 1, bags: 0, chest: 0 }; // the starting "handful of gold"

export function clampGold(g: GoldAmount): GoldAmount {
  return {
    handfuls: Math.max(0, Math.min(GOLD_MAX.handfuls, Math.round(g.handfuls))),
    bags: Math.max(0, Math.min(GOLD_MAX.bags, Math.round(g.bags))),
    chest: Math.max(0, Math.min(GOLD_MAX.chest, Math.round(g.chest))),
  };
}

function StepBtn({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={4} accessibilityRole="button" accessibilityLabel={label === '+' ? 'Increase' : 'Decrease'}>
      <View style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1.2, borderColor: disabled ? 'rgba(122,94,34,0.3)' : '#9a7a2e', backgroundColor: 'rgba(231,198,104,0.12)', opacity: disabled ? 0.4 : 1 }}>
        <Text style={{ color: '#5a4416', fontSize: 15, fontFamily: Display.bold, lineHeight: 17 }}>{label}</Text>
      </View>
    </Pressable>
  );
}

function GoldRow({ label, count, max, onSet }: { label: string; count: number; max: number; onSet: (n: number) => void }) {
  return (
    <View style={{ marginTop: 7 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: Rune.inkText, fontSize: 8.5, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>
          {label} <Text style={{ color: Rune.inkMuted }}>{count}/{max}</Text>
        </Text>
        <View style={{ flexDirection: 'row', gap: 5 }}>
          <StepBtn label="–" onPress={() => onSet(count - 1)} disabled={count <= 0} />
          <StepBtn label="+" onPress={() => onSet(count + 1)} disabled={count >= max} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
        {Array.from({ length: max }, (_, i) => {
          const filled = i < count;
          return (
            <Pressable key={i} onPress={() => onSet(filled && i === count - 1 ? i : i + 1)} hitSlop={2} accessibilityRole="button" accessibilityLabel={`${label} ${i + 1}`}>
              <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 1.3, borderColor: '#9a7a2e', backgroundColor: filled ? '#e7c668' : 'transparent' }} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function GoldCard({ gold, onChange }: { gold: GoldAmount; onChange: (g: GoldAmount) => void }) {
  const set = (patch: Partial<GoldAmount>) => onChange(clampGold({ ...gold, ...patch }));
  return (
    <View style={{ width: FORGED_W, height: FORGED_H, backgroundColor: Rune.sheet, overflow: 'hidden' }}>
      <View style={{ height: 64, overflow: 'hidden' }}>
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="rk_gold_live" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#7a5e22" />
              <Stop offset="0.45" stopColor="#e7c668" />
              <Stop offset="0.62" stopColor="#fff2c4" />
              <Stop offset="0.82" stopColor="#caa247" />
              <Stop offset="1" stopColor="#6f5320" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#rk_gold_live)" />
        </Svg>
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Svg width={34} height={34} viewBox="0 0 40 40">
            <Circle cx={20} cy={20} r={14} fill="rgba(255,246,212,0.18)" stroke="#fff6df" strokeWidth={2} />
            <Path d="M 20 11 V 29 M 16 15.5 h 7 a 3 3 0 0 1 0 6 h -6 a 3 3 0 0 0 0 6 h 7" fill="none" stroke="#5a4416" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          <Text style={{ color: '#3a2c10', fontSize: 20, fontFamily: Display.black, letterSpacing: 1 }}>GOLD</Text>
        </View>
      </View>
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14 }}>
        <GoldRow label="Chest" count={gold.chest} max={GOLD_MAX.chest} onSet={(n) => set({ chest: n })} />
        <GoldRow label="Bags" count={gold.bags} max={GOLD_MAX.bags} onSet={(n) => set({ bags: n })} />
        <GoldRow label="Handfuls" count={gold.handfuls} max={GOLD_MAX.handfuls} onSet={(n) => set({ handfuls: n })} />
        <Text style={{ color: Rune.inkMuted, fontSize: 7.5, fontFamily: Body.medium, marginTop: 8, lineHeight: 11 }}>10 handfuls = a bag · 10 bags = a chest</Text>
      </View>
    </View>
  );
}
