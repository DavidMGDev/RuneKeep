import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, Rune } from '@/constants/theme';
import { expansionCardCount, isOfficialExpansion } from '@/lib/expansions';
import { type Expansion } from '@/lib/library';
import { playSfx } from '@/lib/sfx';

/** The pseudo-id for the always-present "Base Game" row. Never stored on the character (it's the
 *  implicit, untagged content). */
export const BASE_PICK_ID = 'base';

/** A single check row inside the picker. Base Game is locked ON; expansions toggle. */
function PickRow({ name, subtitle, checked, locked, onToggle }: { name: string; subtitle: string; checked: boolean; locked?: boolean; onToggle: () => void }) {
  return (
    <Pressable onPress={locked ? undefined : onToggle} disabled={locked} accessibilityRole="checkbox" accessibilityState={{ checked, disabled: !!locked }} accessibilityLabel={name}>
      {({ pressed }) => (
        <ChamferBox
          chamfer={9}
          fill={pressed && !locked ? 'rgba(20,24,31,0.95)' : 'rgba(14,17,22,0.86)'}
          stroke={locked ? 'rgba(147,142,136,0.45)' : checked ? Rune.goldEdge : 'rgba(218,162,73,0.28)'}
          strokeWidth={1.2}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 13, paddingVertical: 11 }}>
          {/* checkbox — gold when a live checked toggle; a LOCKED row renders the whole control greyed
              (v0.13.0 item 6): it must read as "always on, not yours to change", not as deselectable. */}
          <ChamferBox chamfer={5} fill={locked ? 'rgba(147,142,136,0.4)' : checked ? Rune.goldEdge : 'transparent'} stroke={locked ? Rune.muted : checked ? Rune.goldBright : Rune.muted} strokeWidth={1.4} style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
            {checked ? <Text style={{ color: locked ? '#C8CBD2' : Rune.ink, fontSize: 14, fontFamily: Body.bold, lineHeight: 16 }}>✓</Text> : null}
          </ChamferBox>
          <View style={{ flex: 1, opacity: locked ? 0.6 : checked ? 1 : 0.75 }}>
            <Text numberOfLines={1} style={{ color: Rune.ivory, fontSize: 15, fontFamily: Display.black, letterSpacing: 0.4, textTransform: 'uppercase' }}>{name}</Text>
            <Text numberOfLines={1} style={{ color: Rune.goldText, fontSize: 10.5, fontFamily: Body.medium, letterSpacing: 0.3, marginTop: 2 }}>{subtitle}</Text>
          </View>
          {locked ? <Text style={{ color: Rune.muted, fontSize: 9, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>Always on</Text> : null}
        </ChamferBox>
      )}
    </Pressable>
  );
}

/**
 * Per-character EXPANSION PICKER (v0.12.2) — shown when character creation opens. Choose which content
 * packs creation offers: Base Game (always on) plus any installed expansions ("The Void" official pack +
 * homebrew). The chosen set gates the classes/ancestries/communities/domains/subclasses the creator
 * shows. Confirm with "Continue"; at least one row must stay checked (Base guarantees this).
 */
export function ExpansionPicker({ expansions, initial, onConfirm, onCancel }: { expansions: Expansion[]; initial: Set<string>; onConfirm: (picked: Set<string>) => void; onCancel?: () => void }) {
  const [checked, setChecked] = useState<Set<string>>(() => new Set(initial));
  const toggle = (id: string) => {
    playSfx('buttonTap');
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const rows = useMemo(
    () =>
      // v0.13.0 item 6: fixed order — Base Game (hard-rendered first below) → official packs (The
      // Void) → the user's expansions, each group keeping its incoming order.
      [...expansions]
        .sort((a, b) => Number(isOfficialExpansion(b.id)) - Number(isOfficialExpansion(a.id)))
        .map((e) => {
          // official packs keep most cards in the catalog + some on the record — expansionCardCount sums both
          const count = expansionCardCount(e);
          const bits = [isOfficialExpansion(e.id) ? 'Official' : e.author || 'Homebrew'];
          if (count > 0) bits.push(`${count} card${count === 1 ? '' : 's'}`);
          return { id: e.id, name: e.name, subtitle: bits.join(' · ') };
        }),
    [expansions],
  );
  const canContinue = checked.size > 0; // Base is locked ON, so this is always true — a defensive guard.

  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 12000, alignItems: 'center', justifyContent: 'center' }}>
      {/* non-dismissing backdrop: the picker must be resolved via Continue (no outside-tap close) */}
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(6,8,13,0.92)' }} />
      <ChamferBox chamfer={16} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} style={{ width: 344, maxWidth: '92%', paddingHorizontal: 18, paddingTop: 16, paddingBottom: 16, gap: 12 }}>
        <View style={{ gap: 3 }}>
          <Text style={{ color: Rune.goldText, fontSize: 20, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.5 }}>Choose expansions</Text>
          <Text style={{ color: Rune.muted, fontSize: 11.5, fontFamily: Body.medium, lineHeight: 16 }}>Pick which content this hero can draw from. You can always start with just the base game.</Text>
        </View>
        <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <PickRow name="Base Game" subtitle="Core classes, ancestries, communities & domains" checked locked onToggle={() => {}} />
          {rows.map((r) => (
            <PickRow key={r.id} name={r.name} subtitle={r.subtitle} checked={checked.has(r.id)} onToggle={() => toggle(r.id)} />
          ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {onCancel ? <RuneButton label="Cancel" kind="ghost" height={44} style={{ flex: 1 }} onPress={onCancel} /> : null}
          <RuneButton label="Continue" kind="primary" height={44} style={{ flex: 1.6 }} disabled={!canContinue} onPress={() => onConfirm(new Set(checked))} accessibilityLabel="Continue to character creation" />
        </View>
      </ChamferBox>
    </View>
  );
}
