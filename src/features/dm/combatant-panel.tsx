/**
 * CombatantPanel (v0.15.0, PRD #31-32) — an adversary or NPC in an encounter. Name + only the tracks the
 * DM chose to show (HP/Stress via heartbeat pulses; thresholds read-only; description). Always editable
 * (adversaries are local to the encounter, so they can be prepared ahead of play). The gear opens the
 * config editor to rename, set maxima/thresholds/description and toggle which fields display.
 */
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { FitLine } from '@/components/fit-line';
import { Body, Display, DmRune } from '@/constants/theme';
import { type Combatant, type CombatantStat } from '@/lib/session';
import { StatGlyph } from './stat-glyphs';
import { StatPulse } from './stat-pulse';

export function CombatantPanel({
  combatant,
  onStat,
  onRequestSet,
  onEdit,
  onRemove,
  onHoldStart,
  onHoldEnd,
}: {
  combatant: Combatant;
  onStat: (stat: CombatantStat, dir: 1 | -1) => void;
  onRequestSet: (stat: CombatantStat) => void;
  onEdit: () => void;
  onRemove: () => void;
  onHoldStart?: (stat: CombatantStat) => void;
  onHoldEnd?: (stat: CombatantStat) => void;
}) {
  const c = combatant;
  const anyTrack = c.show.hp || c.show.stress || c.show.thresholds;
  return (
    <ChamferBox chamfer={11} fill="rgba(18,15,15,0.92)" stroke="rgba(178,86,78,0.5)" strokeWidth={1.3} style={{ paddingHorizontal: 12, paddingVertical: 10, gap: anyTrack || c.show.description ? 9 : 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <FitLine style={{ flex: 1, color: DmRune.ivory, fontSize: 15, fontFamily: Display.black, letterSpacing: 0.5, textTransform: 'uppercase' }}>{c.name}</FitLine>
        <Pressable onPress={onEdit} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Configure ${c.name}`}>
          <Svg width={18} height={18} viewBox="0 0 24 24"><Circle cx={12} cy={12} r={3.4} fill="none" stroke={DmRune.accent} strokeWidth={1.8} /><Circle cx={12} cy={12} r={8.4} fill="none" stroke={DmRune.accentDim} strokeWidth={1.6} strokeDasharray="2.4 3" /></Svg>
        </Pressable>
        <Pressable onPress={onRemove} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${c.name}`}>
          <Svg width={15} height={15} viewBox="0 0 16 16"><Line x1={3} y1={3} x2={13} y2={13} stroke={DmRune.red} strokeWidth={2} /><Line x1={13} y1={3} x2={3} y2={13} stroke={DmRune.red} strokeWidth={2} /></Svg>
        </Pressable>
      </View>

      {anyTrack ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          {c.show.hp ? <StatPulse kind="hp" value={c.hp ?? 0} max={c.maxHp ?? 0} compact onStep={(d) => onStat('hp', d)} onRequestSet={() => onRequestSet('hp')} onHoldStart={() => onHoldStart?.('hp')} onHoldEnd={() => onHoldEnd?.('hp')} /> : null}
          {c.show.stress ? <StatPulse kind="stress" value={c.stress ?? 0} max={c.maxStress ?? 0} compact onStep={(d) => onStat('stress', d)} onRequestSet={() => onRequestSet('stress')} onHoldStart={() => onHoldStart?.('stress')} onHoldEnd={() => onHoldEnd?.('stress')} /> : null}
          {c.show.thresholds ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <StatGlyph kind="threshold" color={DmRune.accentDim} size={16} />
              <Text style={{ color: DmRune.accent, fontSize: 14, fontFamily: Display.black }}>{c.thresholds?.major ?? 0}/{c.thresholds?.severe ?? 0}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {c.show.description && c.description ? (
        <Text style={{ color: DmRune.muted, fontSize: 12, fontFamily: Body.regular, lineHeight: 17 }}>{c.description}</Text>
      ) : null}
    </ChamferBox>
  );
}
