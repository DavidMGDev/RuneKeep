/**
 * CombatantPanel (v0.15.0; reworked v0.16.0–v0.18.0) — an adversary or NPC in an encounter. A portrait
 * (tap → fullscreen), sheet-coloured radial StatPulses (tap = keypad, hold = ±wheel), a PENCIL to configure.
 * Tapping the TITLE / top row expands the full SRD stat block with a smooth layout animation — surrounding
 * cards reflow, nothing pops (item 5). Outline colour signals side: red = adversary, teal = ally (item 5).
 * Selection is bold — accent wash + check badge (item 4). Deletion stays hard (PRD #9): the X downs a live
 * unit to "Fallen"; only a fallen unit's X actually deletes.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import Svg, { Line, Path, Polyline } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { FitLine } from '@/components/fit-line';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, DmRune } from '@/constants/theme';
import { type Combatant, type CombatantStat } from '@/lib/session';
import { AdversaryPortrait, hasStatBlock, StatBlockDetail } from './adversary-detail';
import { StatGlyph } from './stat-glyphs';
import { StatPulse } from './stat-pulse';

// item 4: short, smooth reflow — no spring bounce.
const SPRING = LinearTransition.duration(180).easing(Easing.out(Easing.cubic));

function Pencil() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="M4 20 L4 16 L15 5 L19 9 L8 20 Z" fill="none" stroke={DmRune.accent} strokeWidth={1.8} strokeLinejoin="round" /><Line x1={13} y1={7} x2={17} y2={11} stroke={DmRune.accent} strokeWidth={1.8} /></Svg>
  );
}

function CheckBadge() {
  return (
    <ChamferBox chamfer={5} fill={DmRune.accent} stroke="transparent" strokeWidth={0} style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={13} height={13} viewBox="0 0 12 12"><Polyline points="2,6 5,9 10,3" fill="none" stroke={DmRune.ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
    </ChamferBox>
  );
}

export function CombatantPanel({
  combatant,
  friendly,
  selecting,
  selected,
  onApply,
  onRequestSet,
  onEdit,
  onFell,
  onRecover,
  onDelete,
  onLongPress,
  onToggleSelect,
  onOpenImage,
}: {
  combatant: Combatant;
  friendly?: boolean;
  selecting?: boolean;
  selected?: boolean;
  onApply: (stat: CombatantStat, delta: number) => void;
  onRequestSet: (stat: CombatantStat) => void;
  onEdit: () => void;
  onFell: () => void;
  onRecover: () => void;
  onDelete: () => void;
  onLongPress?: () => void;
  onToggleSelect?: () => void;
  onOpenImage?: () => void;
}) {
  const c = combatant;
  const [open, setOpen] = useState(false);
  const sideColor = friendly ? DmRune.ally : DmRune.red;
  const stroke = selected ? DmRune.accent : c.fallen ? 'rgba(139,144,154,0.5)' : `${sideColor}80`;
  const fill = selected ? 'rgba(196,200,208,0.16)' : c.fallen ? 'rgba(16,16,18,0.9)' : friendly ? 'rgba(15,20,20,0.92)' : 'rgba(20,15,15,0.92)';
  const canExpand = hasStatBlock(c);

  // A fallen unit collapses to name + Fallen + Recover; its X deletes.
  if (c.fallen) {
    return (
      <Animated.View layout={SPRING}>
        <Pressable onPress={selecting ? onToggleSelect : undefined} onLongPress={onLongPress} delayLongPress={340} accessibilityRole="button" accessibilityLabel={`${c.name}, fallen`}>
          <ChamferBox chamfer={11} fill={fill} stroke={stroke} strokeWidth={selected ? 2 : 1.3} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 12 }}>
            {selecting ? (selected ? <CheckBadge /> : <ChamferBox chamfer={5} fill="transparent" stroke={DmRune.accentDim} strokeWidth={1.3} style={{ width: 24, height: 24 }} />) : null}
            <FitLine style={{ flex: 1, color: DmRune.muted, fontSize: 15, fontFamily: Display.black, letterSpacing: 0.5, textTransform: 'uppercase' }}>{c.name}</FitLine>
            <Text style={{ color: DmRune.red, fontSize: 11, fontFamily: Body.bold, letterSpacing: 1.4, textTransform: 'uppercase' }}>Fallen</Text>
            {!selecting ? (
              <>
                <RuneButton label="Recover" kind="secondary" height={30} dense dm onPress={onRecover} />
                <Pressable onPress={onDelete} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Delete ${c.name}`}>
                  <Svg width={15} height={15} viewBox="0 0 16 16"><Line x1={3} y1={3} x2={13} y2={13} stroke={DmRune.red} strokeWidth={2} /><Line x1={13} y1={3} x2={3} y2={13} stroke={DmRune.red} strokeWidth={2} /></Svg>
                </Pressable>
              </>
            ) : null}
          </ChamferBox>
        </Pressable>
      </Animated.View>
    );
  }

  const anyTrack = c.show.hp || c.show.stress || c.show.thresholds;
  const headerTap = () => { if (selecting) onToggleSelect?.(); else if (canExpand) setOpen((o) => !o); };
  return (
    <Animated.View layout={SPRING}>
      <ChamferBox chamfer={11} fill={fill} stroke={stroke} strokeWidth={selected ? 2 : 1.3} style={{ paddingHorizontal: 12, paddingVertical: 11, gap: anyTrack || (c.show.description && !open) || open ? 10 : 0 }}>
        {/* header row — tap toggles the stat block; hold multi-selects */}
        <Pressable onPress={headerTap} onLongPress={onLongPress} delayLongPress={340} accessibilityRole="button" accessibilityLabel={`${c.name}${canExpand ? ', tap to expand' : ''}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {selecting ? (selected ? <CheckBadge /> : <ChamferBox chamfer={5} fill="transparent" stroke={DmRune.accentDim} strokeWidth={1.3} style={{ width: 24, height: 24 }} />) : (
            <AdversaryPortrait uri={c.portraitUri} size={38} tint={sideColor} onPress={onOpenImage} />
          )}
          <FitLine style={{ flex: 1, color: DmRune.ivory, fontSize: 15, fontFamily: Display.black, letterSpacing: 0.5, textTransform: 'uppercase' }}>{c.name}</FitLine>
          {!selecting ? (
            <>
              {canExpand ? <Svg width={14} height={14} viewBox="0 0 16 16" style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}><Polyline points="5,3 11,8 5,13" fill="none" stroke={DmRune.accentDim} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg> : null}
              <Pressable onPress={onEdit} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Configure ${c.name}`}><Pencil /></Pressable>
              <Pressable onPress={onFell} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Down ${c.name}`}>
                <Svg width={15} height={15} viewBox="0 0 16 16"><Line x1={3} y1={3} x2={13} y2={13} stroke={DmRune.red} strokeWidth={2} /><Line x1={13} y1={3} x2={3} y2={13} stroke={DmRune.red} strokeWidth={2} /></Svg>
              </Pressable>
            </>
          ) : null}
        </Pressable>

        {anyTrack ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, flexWrap: 'wrap', paddingLeft: selecting ? 0 : 48 }}>
            {c.show.hp ? <StatPulse kind="hp" value={c.hp ?? 0} max={c.maxHp ?? 0} onApply={(d) => onApply('hp', d)} onRequestSet={() => onRequestSet('hp')} /> : null}
            {c.show.stress ? <StatPulse kind="stress" value={c.stress ?? 0} max={c.maxStress ?? 0} onApply={(d) => onApply('stress', d)} onRequestSet={() => onRequestSet('stress')} /> : null}
            {c.show.thresholds ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <StatGlyph kind="threshold" color={DmRune.accentDim} size={16} />
                <Text style={{ color: DmRune.accent, fontSize: 15, fontFamily: Display.black }}>{c.thresholds?.major ?? 0}/{c.thresholds?.severe ?? 0}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {c.show.description && c.description && !open ? (
          <Text style={{ color: DmRune.muted, fontSize: 12, fontFamily: Body.regular, lineHeight: 17 }}>{c.description}</Text>
        ) : null}

        {open ? (
          <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
            <StatBlockDetail c={c} />
          </Animated.View>
        ) : null}
      </ChamferBox>
    </Animated.View>
  );
}
