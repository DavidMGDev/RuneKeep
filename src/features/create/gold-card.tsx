import { Pressable, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { DividerPlaque } from '@/components/card-divider';
import { Body, Display, Rune } from '@/constants/theme';
import { FORGED_H, FORGED_W } from './forged-card';

/**
 * Gold (#128, owner): handfuls roll into bags, bags into a chest. 10 handfuls make a bag, 10 bags
 * make a chest, never two chests — so the displayed maxima are 9 handfuls, 9 bags, 1 chest (the
 * 10th of each rolls up). ONE central +/- adds/removes a single handful, carrying/borrowing across
 * the rows. Rows run handfuls (top, by the title) → bags → chest (bottom). Looks like a normal
 * forged card: flat gold art band, the regular divider plaque, title.
 */
export interface GoldAmount {
  handfuls: number;
  bags: number;
  chest: number;
}
export const GOLD_DEFAULT: GoldAmount = { handfuls: 1, bags: 0, chest: 0 }; // the kit's "handful of gold"
const ART_H = Math.round(FORGED_H * 0.4);
const GOLD = '#E4C25C'; // flat golden, no gradient (owner)

export function addHandful(g: GoldAmount): GoldAmount {
  let { handfuls: h, bags: b, chest: c } = g;
  h++;
  if (h > 9) {
    h = 0;
    b++;
  }
  if (b > 9) {
    b = 0;
    c++;
  }
  if (c > 1) return g; // already at the 9/9/1 ceiling — can't add more
  return { handfuls: h, bags: b, chest: c };
}
export function subHandful(g: GoldAmount): GoldAmount {
  let { handfuls: h, bags: b, chest: c } = g;
  h--;
  if (h < 0) {
    if (b > 0) {
      b--;
      h = 9;
    } else if (c > 0) {
      c--;
      b = 9;
      h = 9;
    } else {
      h = 0; // already empty
    }
  }
  return { handfuls: h, bags: b, chest: c };
}
const isMax = (g: GoldAmount) => g.handfuls === 9 && g.bags === 9 && g.chest === 1;
const isEmpty = (g: GoldAmount) => g.handfuls === 0 && g.bags === 0 && g.chest === 0;

function Coin({ filled, size }: { filled: boolean; size: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1.2, borderColor: '#9a7a2e', backgroundColor: filled ? GOLD : 'transparent' }} />;
}

function Row({ label, count, max, size }: { label: string; count: number; max: number; size: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 5 }}>
      <Text style={{ width: 52, color: Rune.inkMuted, fontSize: 7.5, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3, flex: 1 }}>
        {Array.from({ length: max }, (_, i) => (
          <Coin key={i} filled={i < count} size={size} />
        ))}
      </View>
    </View>
  );
}

function Step({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={8} accessibilityRole="button" accessibilityLabel={label === '+' ? 'Add a handful of gold' : 'Remove a handful of gold'}>
      <View style={{ width: 34, height: 30, alignItems: 'center', justifyContent: 'center', borderWidth: 1.4, borderColor: disabled ? 'rgba(122,94,34,0.3)' : '#9a7a2e', backgroundColor: 'rgba(228,194,92,0.16)', opacity: disabled ? 0.4 : 1 }}>
        <Text style={{ color: '#5a4416', fontSize: 20, fontFamily: Display.bold, lineHeight: 22 }}>{label}</Text>
      </View>
    </Pressable>
  );
}

export function GoldCard({ gold, onChange }: { gold: GoldAmount; onChange: (g: GoldAmount) => void }) {
  return (
    <View style={{ width: FORGED_W, height: FORGED_H, backgroundColor: Rune.sheet, overflow: 'hidden' }}>
      {/* flat gold art band + coin emblem */}
      <View style={{ height: ART_H, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={Math.round(ART_H * 0.5)} height={Math.round(ART_H * 0.5)} viewBox="0 0 40 40">
          <Rect x={6} y={6} width={28} height={28} rx={14} fill="rgba(255,246,212,0.22)" stroke="#5a4416" strokeWidth={2} />
          <Path d="M 20 11 V 29 M 16 15.5 h 7 a 3 3 0 0 1 0 6 h -6 a 3 3 0 0 0 0 6 h 7" fill="none" stroke="#5a4416" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </View>
      {/* the regular divider plaque */}
      <View style={{ position: 'absolute', top: ART_H - (FORGED_W + 14) / (1978.811 / 151.3009) / 2, left: -7, right: -7, alignItems: 'center' }} pointerEvents="none">
        <DividerPlaque width={FORGED_W + 14} maskFill={Rune.sheet}>
          <Text numberOfLines={1} style={{ color: Rune.red, fontSize: 8, fontFamily: Body.bold, letterSpacing: 1.2, textTransform: 'uppercase' }}>Currency</Text>
        </DividerPlaque>
      </View>
      <View style={{ flex: 1, paddingHorizontal: 14, paddingTop: 18, paddingBottom: 14 }}>
        <Text style={{ color: Rune.inkText, fontSize: 16, fontFamily: Display.bold, letterSpacing: 0.4, textTransform: 'uppercase', textAlign: 'center' }}>Gold</Text>
        {/* handfuls near the title, chest at the bottom (#128 inverted order) */}
        <Row label="Handfuls" count={gold.handfuls} max={9} size={12} />
        <Row label="Bags" count={gold.bags} max={9} size={14} />
        <Row label="Chest" count={gold.chest} max={1} size={20} />
        {/* one central +/- — adds/removes a handful, carrying across the rows */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 'auto' }}>
          <Step label="–" onPress={() => onChange(subHandful(gold))} disabled={isEmpty(gold)} />
          <Step label="+" onPress={() => onChange(addHandful(gold))} disabled={isMax(gold)} />
        </View>
      </View>
    </View>
  );
}
