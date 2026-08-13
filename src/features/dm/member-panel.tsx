/**
 * MemberPanel (v0.15.0; reworked v0.16.0, PRD #4/#15) — one compact summary of a party character, shared
 * by the party overview and an encounter's allies list. Vitals (HP/Armor/Stress/Hope) are tightly grouped
 * StatPulses in sheet colours driven by the screen's global direction; Evasion + thresholds are read-only.
 * Absent members render greyed with a tag. Tap the header (clear chevron) to expand into traits, level,
 * proficiency and the character's unique domain-card count (Armor is not repeated there).
 */
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import {  } from 'expo-image'; // item 2: robust with base64 data-URIs (imported/NFC portraits) — RN Image drops them on Android
import Svg, {  Polyline } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { FitLine } from '@/components/fit-line';
import { RuneButton } from '@/components/rune-button';
import { DmType, Body, Display, DmRune } from '@/constants/theme';
import { domainCardCount, memberSummary } from '@/lib/dm-vitals';
import { type CharacterFile } from '@/lib/character-file';
import { type MemberMaxes, type MemberVitals, type VitalKey } from '@/lib/party';
import { DownedVeil, Portrait } from '@/components/portrait';
import { StatPulse } from './stat-pulse';
import { DmPress } from './dm-ui';

const TRAIT_ORDER: [keyof ReturnType<typeof memberSummary>['traits'], string][] = [
  ['agility', 'Agi'], ['strength', 'Str'], ['finesse', 'Fin'], ['instinct', 'Ins'], ['presence', 'Pre'], ['knowledge', 'Kno'],
];

function ReadStat({ label, value, color = DmRune.text }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 2 }}>
      <Text style={{ color, fontSize: DmType.title, fontFamily: Display.black }}>{value}</Text>
      <Text style={{ color: DmRune.muted, fontSize: DmType.micro, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' }}>{label}</Text>
    </View>
  );
}

export function MemberPanel({
  file,
  vitals,
  maxes,
  editable,
  absent,
  selected,
  selecting,
  onApply,
  onRequestSet,
  onBlocked,
  onLongPress,
  onModifiers,
  onCards,
  dimmed,
  foe,
  flash,
}: {
  file: CharacterFile;
  vitals: MemberVitals;
  /** v0.23.0: overrides the file-derived maxes so DM-granted bonuses show as 8/8 rather than 8/6. */
  maxes?: MemberMaxes;
  editable: boolean;
  absent?: boolean;
  selected?: boolean;
  /** v0.36.3: the LIST is selecting, whether or not this one is chosen. */
  selecting?: boolean;
  onApply: (key: VitalKey, delta: number) => void;
  onRequestSet: (key: VitalKey) => void;
  onBlocked?: () => void;
  onLongPress?: () => void;
  /**
   * v0.35 (owner): the DM's modifiers for this character. `edit` opens straight into the editor (the
   * expanded entry's button); the summary first is what a HOLD on the name gives you.
   *
   * The hold is only wired where nothing else claims it. In an encounter a hold on a member starts
   * ally multi-select, which is worth more there, so that screen reaches this through the button.
   */
  onModifiers?: (edit: boolean) => void;
  /** v0.35: open this character's cards. */
  onCards?: () => void;
  /**
   * v0.36 (owner): a PREPARED encounter fades everything that is not a way to start it.
   *
   * Expanding the entry overrides it, because the point of expanding is to read the thing, and it
   * fades back down on close. The state is already here, so the fade costs one animated style.
   */
  dimmed?: boolean;
  /** This character is fighting AGAINST the party (a characterized adversary): outline it red. */
  foe?: boolean;
  /** Bumping this number flashes the panel once, so tapping a portrait in the roster tile lands
   *  somewhere visible rather than silently scrolling. */
  flash?: number;
}) {
  const [open, setOpen] = useState(false);
  const s = memberSummary(file);
  // The dim, and the roster tile's landing flash. Both are opacity only, on plain Views.
  const fade = useSharedValue(1);
  useEffect(() => { fade.value = withTiming(dimmed && !open ? 0.4 : 1, { duration: 220, easing: Easing.out(Easing.quad) }); }, [dimmed, open, fade]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const lit = useSharedValue(0);
  useEffect(() => {
    if (!flash) return;
    lit.value = withSequence(withTiming(1, { duration: 150, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 620, easing: Easing.in(Easing.quad) }));
  }, [flash, lit]);
  const litStyle = useAnimatedStyle(() => ({ opacity: lit.value * 0.3 }));
  const m = maxes ?? s.maxes;
  /**
   * v0.35.1 (owner): at zero hit points the portrait goes grey and dark.
   *
   * A DM scanning a fight needs to see who is down without reading four numbers per row. Their name,
   * their stats and every control stay exactly as they are: this says "down", it does not disable
   * anything, because bringing them back is done through those same controls.
   */
  const downed = vitals.hp <= 0;
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
    <Animated.View style={fadeStyle}>
    <ChamferBox chamfer={11} fill={selected ? 'rgba(218,162,73,0.16)' : 'rgba(14,17,22,0.92)'} stroke={selected ? DmRune.accent : foe ? DmRune.red : DmRune.line} strokeWidth={selected ? 2 : 1.3} style={{ paddingHorizontal: 12, paddingVertical: 12, gap: 12, opacity: absent ? 0.5 : 1 }}>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: DmRune.accent }, litStyle]} />
      {/* Any tap on the entry selects it while the list is selecting. */}
      {selecting ? (
        <Pressable
          onPress={onLongPress}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: !!selected }}
          accessibilityLabel={`${s.name}, ${selected ? 'selected' : 'not selected'}`}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 5 }}
        />
      ) : null}
      {/* header: portrait + identity (tap to expand) + read-only Evasion / thresholds + a clear chevron */}
      <DmPress onPress={() => setOpen((o) => !o)} onLongPress={onLongPress ?? (onModifiers ? () => onModifiers(false) : undefined)} delayLongPress={360} accessibilityRole="button" accessibilityLabel={`${s.name}${absent ? ', absent' : ''}, ${open ? 'collapse' : 'expand for traits'}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
        {/* v0.36.3 (owner): while selecting, the CHECKBOX takes the portrait's place at the
            portrait's size. It used to sit on the right, opposite every other list in the app, and
            the entry kept its full size only by accident. Same slot, same size, nothing moves. */}
        {selecting ? (
          <ChamferBox chamfer={6} fill={selected ? DmRune.accent : 'transparent'} stroke={selected ? 'transparent' : DmRune.accentDim} strokeWidth={1.3} style={{ width: 46, height: 46, alignItems: 'center', justifyContent: 'center' }}>
            {selected ? <Svg width={22} height={22} viewBox="0 0 12 12"><Polyline points="2,6 5,9 10,3" fill="none" stroke={DmRune.ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></Svg> : null}
          </ChamferBox>
        ) : (
          /* v0.36.1: chamfered, so the frame and the picture are one shape (see components/portrait). */
          <View style={downed ? { filter: [{ grayscale: 1 }] } : undefined}>
            <Portrait uri={s.portraitUri} size={46} tint={downed ? DmRune.muted : DmRune.accentDim} fill={DmRune.ink} />
            {/* Greyed AND darkened: desaturation alone is easy to miss on a portrait that is already
                dim, and a scrim alone reads as a loading state. */}
            {downed ? <DownedVeil size={46} /> : null}
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <FitLine style={{ flexShrink: 1, color: DmRune.ivory, fontSize: DmType.title, fontFamily: Display.black, letterSpacing: 0.5, textTransform: 'uppercase' }}>{s.name}</FitLine>
            {absent ? <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: DmRune.accentDim }}><Text style={{ color: DmRune.accentDim, fontSize: DmType.micro, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>Absent</Text></View> : null}
          </View>
          <Text numberOfLines={1} style={{ color: DmRune.muted, fontSize: DmType.micro, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 2 }}>{s.subclass || `Lvl ${s.level}`}</Text>
        </View>
        <ReadStat label="Eva" value={String(s.evasion)} />
        <ReadStat label="Thr" value={`${s.thresholds.major}/${s.thresholds.severe}`} color={DmRune.accent} />
        {selecting ? null : (
          <Svg width={13} height={13} viewBox="0 0 16 16" style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}><Polyline points="5,3 11,8 5,13" fill="none" stroke={DmRune.accentDim} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
        )}
      </DmPress>

      {/* vitals row: the four editable tracks, tightly grouped, sheet-coloured. Inert while selecting
          (v0.36.3): a tap on the entry is a selection then, not a stat change. */}
      <View pointerEvents={selecting ? 'none' : 'auto'} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', columnGap: 14, rowGap: 8 }}>
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
                <Text style={{ color: DmRune.ivory, fontSize: DmType.title, fontFamily: Display.black }}>{s.traits[k] >= 0 ? `+${s.traits[k]}` : s.traits[k]}</Text>
                <Text style={{ color: DmRune.muted, fontSize: DmType.micro, fontFamily: Body.bold, letterSpacing: 0.4, textTransform: 'uppercase' }}>{label}</Text>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 30 }}>
            <ReadStat label="Level" value={String(s.level)} />
            <ReadStat label="Prof" value={String(s.proficiency)} color={DmRune.accent} />
            <ReadStat label="Domain Cards" value={String(domainCardCount(file))} color={DmRune.accent} />
          </View>
          {/* v0.35 (owner): the DM's two tools for this character, where expanding them already is. */}
          {onModifiers || onCards ? (
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
              {onModifiers ? <RuneButton label="Modifiers" kind="secondary" height={34} dense dm style={{ flex: 1 }} onPress={() => onModifiers(true)} /> : null}
              {onCards ? <RuneButton label="Cards" kind="secondary" height={34} dense dm style={{ flex: 1 }} onPress={onCards} /> : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </ChamferBox>
    </Animated.View>
  );
}
