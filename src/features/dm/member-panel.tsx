/**
 * MemberPanel (v0.15.0, PRD #23-25) — one compact horizontal summary of a party character, shared by the
 * party overview and an encounter's allies list. Collapsed: portrait, name, subclass, and the vitals as
 * numbers-that-mean-the-sheet-icons (HP, Evasion, Armor, thresholds xx/XX, Stress, Hope). Editable stats
 * (HP/Armor/Stress/Hope) use the heartbeat StatPulse; Evasion + thresholds are read-only. Tap the header
 * to expand into traits / level / proficiency.
 */
import { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { FitLine } from '@/components/fit-line';
import { Body, Display, DmRune } from '@/constants/theme';
import { memberSummary } from '@/lib/dm-vitals';
import { type CharacterFile } from '@/lib/character-file';
import { type MemberVitals, type VitalKey } from '@/lib/party';
import { StatGlyph } from './stat-glyphs';
import { StatPulse } from './stat-pulse';

const TRAIT_ORDER: [keyof ReturnType<typeof memberSummary>['traits'], string][] = [
  ['agility', 'Agi'], ['strength', 'Str'], ['finesse', 'Fin'], ['instinct', 'Ins'], ['presence', 'Pre'], ['knowledge', 'Kno'],
];

/** A read-only glyph + number (Evasion, thresholds). */
function ReadStat({ label, value, color = DmRune.text }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 2 }}>
      <Text style={{ color, fontSize: 14, fontFamily: Display.black }}>{value}</Text>
      <Text style={{ color: DmRune.muted, fontSize: 8, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' }}>{label}</Text>
    </View>
  );
}

export function MemberPanel({
  file,
  vitals,
  editable,
  onStat,
  onRequestSet,
  onHoldStart,
  onHoldEnd,
}: {
  file: CharacterFile;
  vitals: MemberVitals;
  editable: boolean;
  onStat: (key: VitalKey, dir: 1 | -1) => void;
  onRequestSet: (key: VitalKey) => void;
  onHoldStart?: (key: VitalKey) => void;
  onHoldEnd?: (key: VitalKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const s = memberSummary(file);
  const m = s.maxes;
  const pulse = (key: VitalKey, kind: 'hp' | 'armor' | 'stress' | 'hope', max: number) => (
    <StatPulse
      kind={kind}
      value={vitals[key]}
      max={max}
      compact
      disabled={!editable}
      onStep={(dir) => onStat(key, dir)}
      onRequestSet={() => onRequestSet(key)}
      onHoldStart={() => onHoldStart?.(key)}
      onHoldEnd={() => onHoldEnd?.(key)}
    />
  );

  return (
    <ChamferBox chamfer={11} fill="rgba(14,17,22,0.92)" stroke={DmRune.line} strokeWidth={1.3} style={{ paddingHorizontal: 12, paddingVertical: 10, gap: 10 }}>
      {/* header: portrait + identity (tap to expand) + read-only Evasion / thresholds */}
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityLabel={`${s.name}, ${open ? 'collapse' : 'expand'}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
        <ChamferBox chamfer={6} fill={DmRune.ink} stroke={DmRune.accentDim} strokeWidth={1.2} style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {s.portraitUri ? <Image source={{ uri: s.portraitUri }} style={{ width: 42, height: 42 }} resizeMode="cover" /> : (
            <Svg width={18} height={18} viewBox="0 0 26 26"><Polygon points="13,2 23,12 23,14 13,24 3,14 3,12" fill="none" stroke={DmRune.accentDim} strokeWidth={1.6} /></Svg>
          )}
        </ChamferBox>
        <View style={{ flex: 1, minWidth: 0 }}>
          <FitLine style={{ color: DmRune.ivory, fontSize: 15, fontFamily: Display.black, letterSpacing: 0.5, textTransform: 'uppercase' }}>{s.name}</FitLine>
          <Text numberOfLines={1} style={{ color: DmRune.muted, fontSize: 10.5, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 2 }}>{s.subclass || `Lvl ${s.level}`}</Text>
        </View>
        <ReadStat label="Eva" value={String(s.evasion)} />
        <ReadStat label="Thr" value={`${s.thresholds.major}/${s.thresholds.severe}`} color={DmRune.accent} />
      </Pressable>

      {/* vitals row: the four editable tracks as heartbeat pulses */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
        {pulse('hp', 'hp', m.maxHp)}
        {pulse('armor', 'armor', m.armorMax)}
        {pulse('stress', 'stress', m.stressMax)}
        {pulse('hope', 'hope', m.hopeMax)}
      </View>

      {open ? (
        <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: DmRune.line, paddingTop: 9 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {TRAIT_ORDER.map(([k, label]) => (
              <View key={k} style={{ alignItems: 'center', gap: 2 }}>
                <Text style={{ color: DmRune.ivory, fontSize: 14, fontFamily: Display.black }}>{s.traits[k] >= 0 ? `+${s.traits[k]}` : s.traits[k]}</Text>
                <Text style={{ color: DmRune.muted, fontSize: 8, fontFamily: Body.bold, letterSpacing: 0.4, textTransform: 'uppercase' }}>{label}</Text>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 26 }}>
            <ReadStat label="Level" value={String(s.level)} />
            <ReadStat label="Prof" value={String(s.proficiency)} color={DmRune.accent} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <StatGlyph kind="armor" color={DmRune.accentDim} size={16} />
              <Text style={{ color: DmRune.text, fontSize: 13, fontFamily: Body.bold }}>Armor {vitals.armor}/{m.armorMax}</Text>
            </View>
          </View>
        </View>
      ) : null}
    </ChamferBox>
  );
}
