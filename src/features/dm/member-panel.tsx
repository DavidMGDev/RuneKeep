/**
 * MemberPanel (v0.15.0; reworked v0.16.0, PRD #4/#15) — one compact summary of a party character, shared
 * by the party overview and an encounter's allies list. Vitals (HP/Armor/Stress/Hope) are tightly grouped
 * StatPulses in sheet colours driven by the screen's global direction; Evasion + thresholds are read-only.
 * Absent members render greyed with a tag. Tap the header (clear chevron) to expand into traits, level,
 * proficiency and the character's unique domain-card count (Armor is not repeated there).
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image'; // item 2: robust with base64 data-URIs (imported/NFC portraits) — RN Image drops them on Android
import Svg, { Polygon, Polyline } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { FitLine } from '@/components/fit-line';
import { Body, Display, DmRune } from '@/constants/theme';
import { domainCardCount, memberSummary } from '@/lib/dm-vitals';
import { type CharacterFile } from '@/lib/character-file';
import { type MemberVitals, type VitalKey } from '@/lib/party';
import { StatPulse } from './stat-pulse';

const TRAIT_ORDER: [keyof ReturnType<typeof memberSummary>['traits'], string][] = [
  ['agility', 'Agi'], ['strength', 'Str'], ['finesse', 'Fin'], ['instinct', 'Ins'], ['presence', 'Pre'], ['knowledge', 'Kno'],
];

function ReadStat({ label, value, color = DmRune.text }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 2 }}>
      <Text style={{ color, fontSize: 15, fontFamily: Display.black }}>{value}</Text>
      <Text style={{ color: DmRune.muted, fontSize: 8, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' }}>{label}</Text>
    </View>
  );
}

export function MemberPanel({
  file,
  vitals,
  editable,
  absent,
  selected,
  onApply,
  onRequestSet,
  onBlocked,
  onLongPress,
}: {
  file: CharacterFile;
  vitals: MemberVitals;
  editable: boolean;
  absent?: boolean;
  selected?: boolean;
  onApply: (key: VitalKey, delta: number) => void;
  onRequestSet: (key: VitalKey) => void;
  onBlocked?: () => void;
  onLongPress?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const s = memberSummary(file);
  const m = s.maxes;
  const pulse = (key: VitalKey, kind: 'hp' | 'armor' | 'stress' | 'hope', mx: number) => (
    <StatPulse
      kind={kind}
      value={vitals[key]}
      max={mx}
      disabled={!editable}
      onApply={(d) => onApply(key, d)}
      onRequestSet={() => onRequestSet(key)}
      onBlocked={onBlocked}
    />
  );

  return (
    <ChamferBox chamfer={11} fill={selected ? 'rgba(196,200,208,0.16)' : 'rgba(14,17,22,0.92)'} stroke={selected ? DmRune.accent : DmRune.line} strokeWidth={selected ? 2 : 1.3} style={{ paddingHorizontal: 12, paddingVertical: 12, gap: 12, opacity: absent ? 0.5 : 1 }}>
      {/* header: portrait + identity (tap to expand) + read-only Evasion / thresholds + a clear chevron */}
      <Pressable onPress={() => setOpen((o) => !o)} onLongPress={onLongPress} delayLongPress={360} accessibilityRole="button" accessibilityLabel={`${s.name}${absent ? ', absent' : ''}, ${open ? 'collapse' : 'expand for traits'}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
        <ChamferBox chamfer={6} fill={DmRune.ink} stroke={DmRune.accentDim} strokeWidth={1.2} style={{ width: 46, height: 46, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {s.portraitUri ? <Image source={s.portraitUri} style={{ width: 46, height: 46 }} contentFit="cover" /> : (
            <Svg width={20} height={20} viewBox="0 0 26 26"><Polygon points="13,2 23,12 23,14 13,24 3,14 3,12" fill="none" stroke={DmRune.accentDim} strokeWidth={1.6} /></Svg>
          )}
        </ChamferBox>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <FitLine style={{ flexShrink: 1, color: DmRune.ivory, fontSize: 16, fontFamily: Display.black, letterSpacing: 0.5, textTransform: 'uppercase' }}>{s.name}</FitLine>
            {absent ? <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: DmRune.accentDim }}><Text style={{ color: DmRune.accentDim, fontSize: 8, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>Absent</Text></View> : null}
          </View>
          <Text numberOfLines={1} style={{ color: DmRune.muted, fontSize: 10.5, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 2 }}>{s.subclass || `Lvl ${s.level}`}</Text>
        </View>
        <ReadStat label="Eva" value={String(s.evasion)} />
        <ReadStat label="Thr" value={`${s.thresholds.major}/${s.thresholds.severe}`} color={DmRune.accent} />
        {selected ? (
          <ChamferBox chamfer={5} fill={DmRune.accent} stroke="transparent" strokeWidth={0} style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={13} height={13} viewBox="0 0 12 12"><Polyline points="2,6 5,9 10,3" fill="none" stroke={DmRune.ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
          </ChamferBox>
        ) : (
          <Svg width={13} height={13} viewBox="0 0 16 16" style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}><Polyline points="5,3 11,8 5,13" fill="none" stroke={DmRune.accentDim} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
        )}
      </Pressable>

      {/* vitals row: the four editable tracks, tightly grouped, sheet-coloured */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', columnGap: 14, rowGap: 8 }}>
        {pulse('hp', 'hp', m.maxHp)}
        {pulse('armor', 'armor', m.armorMax)}
        {pulse('stress', 'stress', m.stressMax)}
        {pulse('hope', 'hope', m.hopeMax)}
      </View>

      {open ? (
        <View style={{ gap: 9, borderTopWidth: 1, borderTopColor: DmRune.line, paddingTop: 10, paddingHorizontal: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
            {TRAIT_ORDER.map(([k, label]) => (
              <View key={k} style={{ alignItems: 'center', gap: 2 }}>
                <Text style={{ color: DmRune.ivory, fontSize: 15, fontFamily: Display.black }}>{s.traits[k] >= 0 ? `+${s.traits[k]}` : s.traits[k]}</Text>
                <Text style={{ color: DmRune.muted, fontSize: 8, fontFamily: Body.bold, letterSpacing: 0.4, textTransform: 'uppercase' }}>{label}</Text>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 30 }}>
            <ReadStat label="Level" value={String(s.level)} />
            <ReadStat label="Prof" value={String(s.proficiency)} color={DmRune.accent} />
            <ReadStat label="Domain Cards" value={String(domainCardCount(file))} color={DmRune.accent} />
          </View>
        </View>
      ) : null}
    </ChamferBox>
  );
}
