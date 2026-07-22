/**
 * CombatantPanel (v0.15.0; reworked v0.16.0, PRD #6/#9) — an adversary or NPC in an encounter. Filled
 * sheet-coloured StatPulses driven by the screen's global direction, a PENCIL to configure. Deletion is
 * deliberately hard (PRD #9): the X DOWNS a live unit (it becomes "name — Fallen" with a Recover button);
 * only a fallen unit's X actually deletes. Bulk delete goes through multi-select. Supports selection mode.
 */
import { Pressable, Text, View } from 'react-native';
import Svg, { Line, Path, Polyline } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { FitLine } from '@/components/fit-line';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, DmRune } from '@/constants/theme';
import { type Combatant, type CombatantStat } from '@/lib/session';
import { StatGlyph } from './stat-glyphs';
import { StatPulse } from './stat-pulse';

function Pencil() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="M4 20 L4 16 L15 5 L19 9 L8 20 Z" fill="none" stroke={DmRune.accent} strokeWidth={1.8} strokeLinejoin="round" /><Line x1={13} y1={7} x2={17} y2={11} stroke={DmRune.accent} strokeWidth={1.8} /></Svg>
  );
}

export function CombatantPanel({
  combatant,
  dir,
  selecting,
  selected,
  onStat,
  onRequestSet,
  onEdit,
  onFell,
  onRecover,
  onDelete,
  onLongPress,
  onToggleSelect,
  onHoldStart,
  onHoldEnd,
}: {
  combatant: Combatant;
  dir: 1 | -1;
  selecting?: boolean;
  selected?: boolean;
  onStat: (stat: CombatantStat, dir: 1 | -1) => void;
  onRequestSet: (stat: CombatantStat) => void;
  onEdit: () => void;
  onFell: () => void;
  onRecover: () => void;
  onDelete: () => void;
  onLongPress?: () => void;
  onToggleSelect?: () => void;
  onHoldStart?: (stat: CombatantStat) => void;
  onHoldEnd?: (stat: CombatantStat) => void;
}) {
  const c = combatant;
  const stroke = selected ? DmRune.accent : c.fallen ? 'rgba(139,144,154,0.5)' : 'rgba(178,86,78,0.5)';

  // A fallen unit collapses to name + Fallen + Recover; its X deletes.
  if (c.fallen) {
    return (
      <Pressable onPress={selecting ? onToggleSelect : undefined} onLongPress={onLongPress} delayLongPress={360} accessibilityRole="button" accessibilityLabel={`${c.name}, fallen`}>
        <ChamferBox chamfer={11} fill="rgba(16,16,18,0.9)" stroke={stroke} strokeWidth={selected ? 1.8 : 1.3} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 12 }}>
          <FitLine style={{ flex: 1, color: DmRune.muted, fontSize: 15, fontFamily: Display.black, letterSpacing: 0.5, textTransform: 'uppercase' }}>{c.name}</FitLine>
          <Text style={{ color: DmRune.red, fontSize: 11, fontFamily: Body.bold, letterSpacing: 1.4, textTransform: 'uppercase' }}>Fallen</Text>
          <RuneButton label="Recover" kind="secondary" height={30} dense dm onPress={onRecover} />
          <Pressable onPress={onDelete} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Delete ${c.name}`}>
            <Svg width={15} height={15} viewBox="0 0 16 16"><Line x1={3} y1={3} x2={13} y2={13} stroke={DmRune.red} strokeWidth={2} /><Line x1={13} y1={3} x2={3} y2={13} stroke={DmRune.red} strokeWidth={2} /></Svg>
          </Pressable>
        </ChamferBox>
      </Pressable>
    );
  }

  const anyTrack = c.show.hp || c.show.stress || c.show.thresholds;
  return (
    <Pressable onPress={selecting ? onToggleSelect : undefined} onLongPress={onLongPress} delayLongPress={360} accessibilityRole="button" accessibilityLabel={c.name}>
      <ChamferBox chamfer={11} fill="rgba(18,15,15,0.92)" stroke={stroke} strokeWidth={selected ? 1.8 : 1.3} style={{ paddingHorizontal: 12, paddingVertical: 11, gap: anyTrack || c.show.description ? 10 : 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {selecting ? (
            <ChamferBox chamfer={4} fill={selected ? DmRune.accent : 'transparent'} stroke={DmRune.accentDim} strokeWidth={1.2} style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
              {selected ? <Svg width={11} height={11} viewBox="0 0 12 12"><Polyline points="2,6 5,9 10,3" fill="none" stroke={DmRune.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg> : null}
            </ChamferBox>
          ) : null}
          <FitLine style={{ flex: 1, color: DmRune.ivory, fontSize: 15, fontFamily: Display.black, letterSpacing: 0.5, textTransform: 'uppercase' }}>{c.name}</FitLine>
          {!selecting ? (
            <>
              <Pressable onPress={onEdit} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Configure ${c.name}`}><Pencil /></Pressable>
              <Pressable onPress={onFell} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Down ${c.name}`}>
                <Svg width={15} height={15} viewBox="0 0 16 16"><Line x1={3} y1={3} x2={13} y2={13} stroke={DmRune.red} strokeWidth={2} /><Line x1={13} y1={3} x2={3} y2={13} stroke={DmRune.red} strokeWidth={2} /></Svg>
              </Pressable>
            </>
          ) : null}
        </View>

        {anyTrack ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, flexWrap: 'wrap', paddingLeft: selecting ? 30 : 0 }}>
            {c.show.hp ? <StatPulse kind="hp" value={c.hp ?? 0} max={c.maxHp ?? 0} dir={dir} onStep={(d) => onStat('hp', d)} onRequestSet={() => onRequestSet('hp')} onHoldStart={() => onHoldStart?.('hp')} onHoldEnd={() => onHoldEnd?.('hp')} /> : null}
            {c.show.stress ? <StatPulse kind="stress" value={c.stress ?? 0} max={c.maxStress ?? 0} dir={dir} onStep={(d) => onStat('stress', d)} onRequestSet={() => onRequestSet('stress')} onHoldStart={() => onHoldStart?.('stress')} onHoldEnd={() => onHoldEnd?.('stress')} /> : null}
            {c.show.thresholds ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <StatGlyph kind="threshold" color={DmRune.accentDim} size={16} />
                <Text style={{ color: DmRune.accent, fontSize: 15, fontFamily: Display.black }}>{c.thresholds?.major ?? 0}/{c.thresholds?.severe ?? 0}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {c.show.description && c.description ? (
          <Text style={{ color: DmRune.muted, fontSize: 12, fontFamily: Body.regular, lineHeight: 17 }}>{c.description}</Text>
        ) : null}
      </ChamferBox>
    </Pressable>
  );
}
