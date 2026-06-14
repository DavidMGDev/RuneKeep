import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Rune } from '@/constants/theme';
import { ALL_ARMOR, ALL_PRIMARY_WEAPONS, ALL_SECONDARY_WEAPONS } from '@/features/create/equipment-data';
import { CONSUMABLES, LOOT } from '@/lib/loot-data';
import { type CardEffect, TARGET_LABEL } from '@/lib/modifiers';

import { OverlayShell } from './overlay-shell';

type Cat = 'weapon' | 'armor' | 'loot' | 'consumable';
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

function effSummary(effects?: CardEffect[]): string {
  if (!effects?.length) return '';
  return effects
    .map((e) => {
      const v = e.dynamic ? '+Prof' : e.byTier ? `+${e.byTier[3]}*` : signed(e.delta ?? 0);
      return `${v} ${TARGET_LABEL[e.target]}`;
    })
    .join(' · ');
}

/**
 * Gear/Loot catalog browser (#180): pick a system weapon / armor / loot / consumable from the full
 * rulebook catalog and add it to your decks, so tier 2+ gear can be equipped + enabled like any card.
 * Reached from the New Card flow. Adds the card's id to the character file's acquired list.
 */
export function GearBrowser({ acquiredIds, onAdd, onBack, onClose }: { acquiredIds: Set<string>; onAdd: (id: string) => void; onBack: () => void; onClose: () => void }) {
  const [cat, setCat] = useState<Cat>('weapon');
  const [tier, setTier] = useState<1 | 2 | 3 | 4>(1);
  const usesTier = cat === 'weapon' || cat === 'armor';

  type Row = { id: string; name: string; sub: string; effects?: CardEffect[] };
  const rows: Row[] =
    cat === 'weapon'
      ? [...ALL_PRIMARY_WEAPONS, ...ALL_SECONDARY_WEAPONS]
          .filter((w) => w.tier === tier)
          .map((w) => ({ id: w.id, name: w.name, sub: `${w.slot === 'secondary' ? 'Secondary · ' : ''}${w.trait} · ${w.range} · ${w.damage} ${w.damageType} · ${w.burden}`, effects: w.effects }))
      : cat === 'armor'
        ? ALL_ARMOR.filter((a) => a.tier === tier).map((a) => ({ id: a.id, name: a.name, sub: `Thresholds ${a.thresholds} · Score ${a.baseScore}`, effects: a.effects }))
        : (cat === 'loot' ? LOOT : CONSUMABLES).map((l) => ({ id: l.id, name: l.name, sub: l.text, effects: l.effects }));

  const catBar = (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {(['weapon', 'armor', 'loot', 'consumable'] as Cat[]).map((c) => (
          <Pressable key={c} onPress={() => setCat(c)} style={{ flex: 1 }} accessibilityRole="button" accessibilityState={{ selected: cat === c }}>
            <ChamferBox chamfer={7} fill={cat === c ? Rune.red : 'rgba(20,24,31,0.7)'} stroke={cat === c ? 'transparent' : 'rgba(218,162,73,0.4)'} strokeWidth={1} style={{ height: 38, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: cat === c ? Rune.ivory : Rune.muted, fontSize: 10.5, fontFamily: Body.bold, textTransform: 'uppercase', letterSpacing: 0.3 }}>{c === 'consumable' ? 'Items' : c === 'loot' ? 'Loot' : c === 'armor' ? 'Armor' : 'Weapons'}</Text>
            </ChamferBox>
          </Pressable>
        ))}
      </View>
      <RuneButton label="← Author a custom card instead" kind="ghost" dense height={34} onPress={onBack} />
    </View>
  );

  return (
    <OverlayShell title="Add gear & loot" subtitle="From the Daggerheart catalog" onClose={onClose} footer={catBar} dismissOnScrim={false}>
      {usesTier ? (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {([1, 2, 3, 4] as const).map((t) => (
            <Pressable key={t} onPress={() => setTier(t)} style={{ flex: 1 }} accessibilityRole="button" accessibilityState={{ selected: tier === t }}>
              <ChamferBox chamfer={6} fill={tier === t ? 'rgba(200,27,24,0.18)' : 'rgba(20,24,31,0.6)'} stroke={tier === t ? Rune.red : 'rgba(218,162,73,0.35)'} strokeWidth={1} style={{ height: 32, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: tier === t ? Rune.goldBright : Rune.muted, fontSize: 11, fontFamily: Body.bold }}>{`Tier ${t}`}</Text>
              </ChamferBox>
            </Pressable>
          ))}
        </View>
      ) : null}
      {rows.map((r) => {
        const has = acquiredIds.has(r.id);
        const eff = effSummary(r.effects);
        return (
          <ChamferBox key={r.id} chamfer={8} fill="rgba(20,24,31,0.6)" stroke={eff ? Rune.red : 'rgba(218,162,73,0.35)'} strokeWidth={eff ? 1.2 : 1} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 12, gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ color: Rune.sheet, fontSize: 13, fontFamily: Body.bold }}>{r.name}</Text>
              <Text numberOfLines={2} style={{ color: Rune.muted, fontSize: 10.5, fontFamily: Body.regular, marginTop: 1 }}>{r.sub}</Text>
              {eff ? <Text numberOfLines={1} style={{ color: Rune.goldText, fontSize: 10.5, fontFamily: Body.bold, marginTop: 2 }}>{eff}</Text> : null}
            </View>
            {has ? (
              <Text style={{ color: Rune.goldBright, fontSize: 12, fontFamily: Body.bold }}>Added ✓</Text>
            ) : (
              <RuneButton label="Add" kind="secondary" dense height={32} style={{ paddingHorizontal: 14 }} onPress={() => onAdd(r.id)} />
            )}
          </ChamferBox>
        );
      })}
      {!usesTier && rows.length > 30 ? <Text style={{ color: Rune.muted, fontSize: 10, fontFamily: Body.italic, textAlign: 'center' }}>{`${rows.length} items`}</Text> : null}
      <View style={{ height: 4 }} />
      <Text style={{ color: Rune.muted, fontSize: 10, fontFamily: Body.italic }}>* tier-scaled values shown at their tier-4 amount; the sheet applies your current tier.</Text>
    </OverlayShell>
  );
}
