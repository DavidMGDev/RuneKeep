/**
 * The Skip Menu (v0.36.1, owner) — every step of creation as one checklist.
 *
 * Skipping step by step is the right control when you are working through the creator and decide, at
 * that step, that you do not want it. It is the wrong control for the case this exists for: a DM
 * characterizing an adversary that has no ancestry, no community, no domains, no experiences and no
 * inventory, who wants to say so ONCE and get to the two steps that actually need them.
 *
 * So: one pop-up, every step at once, no scrolling. Checked means skipped. Steps that are already
 * skipped arrive checked, steps that cannot be skipped are listed but greyed (they are still part of
 * the picture, and hiding them would make the list look like it was missing something), and steps
 * that are already answered are marked, because skipping one throws that answer away and the DM
 * should be able to see which ones those are before they press the button.
 */
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { PopupDialog } from '@/components/popup-dialog';
import { RuneButton } from '@/components/rune-button';
import { Body, Rune } from '@/constants/theme';
import { playSfx } from '@/lib/sfx';

export interface SkipStepRow {
  key: string;
  label: string;
  /** False for a step the character cannot be forged without (Class, unless its numbers are carried). */
  skippable: boolean;
  /** Already skipped: arrives checked. */
  skipped: boolean;
  /** Already answered. Skipping it throws the answer away, which is what the warning is for. */
  done: boolean;
  /** Why it cannot be skipped, shown in place of the checkbox. */
  note?: string;
}

function Row({ row, checked, onPress }: { row: SkipStepRow; checked: boolean; onPress: () => void }) {
  const off = !row.skippable;
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      disabled={off}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: off }}
      accessibilityLabel={`${row.label}${row.done ? ', already filled in' : ''}${off ? `, ${row.note ?? 'required'}` : ''}`}
      style={({ pressed }) => ({ width: '50%', paddingVertical: 4, paddingRight: 8, opacity: off ? 0.42 : pressed ? 0.6 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ChamferBox
          chamfer={4}
          fill={checked ? Rune.gold : 'transparent'}
          stroke={off ? 'rgba(147,142,136,0.4)' : 'rgba(218,162,73,0.6)'}
          strokeWidth={1.2}
          style={{ width: 19, height: 19, alignItems: 'center', justifyContent: 'center' }}>
          {checked ? (
            <Svg width={11} height={11} viewBox="0 0 12 12">
              <Polyline points="2,6 5,9 10,3" fill="none" stroke={Rune.ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          ) : off ? (
            <View style={{ width: 9, height: 1.6, backgroundColor: 'rgba(147,142,136,0.7)' }} />
          ) : null}
        </ChamferBox>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: off ? Rune.muted : Rune.sheet, fontSize: 12, fontFamily: Body.semibold, letterSpacing: 0.3 }}>
            {row.label}
          </Text>
          {off && row.note ? (
            <Text numberOfLines={1} style={{ color: Rune.muted, fontSize: 8.5, fontFamily: Body.medium, letterSpacing: 0.3, textTransform: 'uppercase' }}>{row.note}</Text>
          ) : row.done ? (
            <Text numberOfLines={1} style={{ color: Rune.goldText, fontSize: 8.5, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' }}>Filled in</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export function SkipMenu({ rows, onConfirm, onCancel }: { rows: SkipStepRow[]; onConfirm: (keys: string[]) => void; onCancel: () => void }) {
  const [checked, setChecked] = useState<Set<string>>(() => new Set(rows.filter((r) => r.skipped && r.skippable).map((r) => r.key)));
  const [warn, setWarn] = useState<string[] | null>(null);

  const toggle = (k: string) => {
    playSfx('buttonTap');
    setChecked((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });
  };

  /**
   * "Skip and Forge" once nothing is left to answer.
   *
   * Everything is either checked, unskippable-but-already-answered, or answered. In that state the
   * button is not a step towards forging, it IS the forge, and saying so saves the DM working out
   * whether there is anything left.
   */
  const ready = useMemo(() => rows.every((r) => checked.has(r.key) || r.done), [rows, checked]);
  /** Answers that pressing the button would throw away. */
  const losing = useMemo(() => rows.filter((r) => r.done && checked.has(r.key) && !r.skipped).map((r) => r.label), [rows, checked]);

  const confirm = () => {
    if (losing.length && !warn) { setWarn(losing); return; }
    setWarn(null);
    onConfirm([...checked]);
  };

  if (warn) {
    return (
      <PopupDialog
        title={warn.length === 1 ? `Skip ${warn[0]}?` : `Skip ${warn.length} steps you have filled in?`}
        body={`${warn.join(', ')} ${warn.length === 1 ? 'has' : 'have'} an answer already. Skipping puts each one back to its default: whatever the stat block carried, or nothing at all where there is nothing to carry.`}
        confirmLabel="Skip anyway"
        cancelLabel="Go back"
        onConfirm={confirm}
        onCancel={() => setWarn(null)}
      />
    );
  }

  return (
    <PopupDialog
      title="Skip steps"
      body="Check every step this character does not need. Nothing is chosen for a skipped step, so it keeps whatever the stat block carried, or stays empty."
      confirmLabel={ready ? 'Skip and Forge' : 'Skip selected'}
      cancelLabel="Cancel"
      onConfirm={confirm}
      onCancel={onCancel}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 14, marginBottom: 2 }}>
        {rows.map((r) => (
          <Row key={r.key} row={r} checked={checked.has(r.key)} onPress={() => toggle(r.key)} />
        ))}
      </View>
    </PopupDialog>
  );
}

/** The trigger: dead until a class is chosen, because until then there is nothing to skip towards. */
export function SkipMenuButton({ armed, onPress }: { armed: boolean; onPress: () => void }) {
  return (
    <RuneButton
      label="Skip menu"
      kind={armed ? 'primary' : 'ghost'}
      dense
      height={30}
      muteSfx
      disabled={!armed}
      onPress={onPress}
      accessibilityLabel={armed ? 'Open the skip menu' : 'Choose a class first to open the skip menu'}
    />
  );
}
