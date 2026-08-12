/**
 * Putting a fight in order (v0.42.0, owner) — a MODE, not a drag.
 *
 * The owner's ask was "find a good way to do this without screwing up the existing UI or the select
 * functionality", and that rules the obvious answer out. An encounter row already owns a tap (expand),
 * a hold (multi-select) and, since v0.41.3, a press on a counter, and this project has lost four
 * separate gestures to a fifth one being added to a control that was already busy: the creator's
 * grind, the stat wheel, the cards gallery twice.
 *
 * So while the DM is reordering, the list stops being panels and becomes handles. Nothing negotiates
 * with anything, selection is untouched because it is not on screen, and it behaves identically on a
 * phone and in a browser, which a drag does not.
 */
import { Text, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { FitLine } from '@/components/fit-line';
import { Body, Display, DmRune, DmType } from '@/constants/theme';
import { playSfx } from '@/lib/sfx';
import { DmPress } from './dm-ui';

function Arrow({ up, label, disabled, onPress }: { up: boolean; label: string; disabled: boolean; onPress: () => void }) {
  return (
    <DmPress
      onPress={() => { if (disabled) return; playSfx('carouselScroll'); onPress(); }}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={label}>
      <ChamferBox chamfer={5} fill="rgba(20,24,30,0.92)" stroke={DmRune.accentDim} strokeWidth={1.2} style={{ width: 34, height: 32, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : 1 }}>
        <Svg width={15} height={15} viewBox="0 0 16 16" style={{ transform: [{ rotate: up ? '180deg' : '0deg' }] }}>
          <Polyline points="3,6 8,11 13,6" fill="none" stroke={DmRune.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </ChamferBox>
    </DmPress>
  );
}

export function ReorderList({ rows, onMove }: { rows: { id: string; name: string }[]; onMove: (id: string, delta: -1 | 1) => void }) {
  return (
    <View style={{ gap: 8 }}>
      {rows.map((r, i) => (
        <ChamferBox key={r.id} chamfer={10} fill="rgba(14,17,22,0.94)" stroke={DmRune.line} strokeWidth={1.2} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 9 }}>
          <Text style={{ width: 22, color: DmRune.muted, fontSize: DmType.body, fontFamily: Display.black, fontVariant: ['tabular-nums'] }}>{i + 1}</Text>
          <FitLine style={{ flex: 1, color: DmRune.ivory, fontSize: DmType.title, fontFamily: Display.black, letterSpacing: 0.5, textTransform: 'uppercase' }}>{r.name}</FitLine>
          <Arrow up label={`Move ${r.name} up`} disabled={i === 0} onPress={() => onMove(r.id, -1)} />
          <Arrow up={false} label={`Move ${r.name} down`} disabled={i === rows.length - 1} onPress={() => onMove(r.id, 1)} />
        </ChamferBox>
      ))}
      <Text style={{ color: DmRune.muted, fontSize: DmType.micro, fontFamily: Body.italic, marginTop: 2 }}>
        Press Done when the order is right.
      </Text>
    </View>
  );
}
