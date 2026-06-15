import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Rune } from '@/constants/theme';
import { ALL_ARMOR, ALL_PRIMARY_WEAPONS, ALL_SECONDARY_WEAPONS } from '@/features/create/equipment-data';
import { CATALOG } from '@/features/cards/catalog';
import { CATALOG_EFFECTS } from '@/features/cards/catalog-effects';
import { type CardEffect, TARGET_LABEL } from '@/lib/modifiers';

import { OverlayShell } from './overlay-shell';

// #248 item 5: the catalog is CHARACTER cards (domains/ancestries/communities/subclasses) + equipment.
// The old Loot / Items tabs are gone.
type Cat = 'weapon' | 'armor' | 'domain' | 'ancestry' | 'community' | 'subclass';
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function effSummary(effects?: CardEffect[]): string {
  if (!effects?.length) return '';
  return effects.map((e) => `${e.dynamic ? '+dyn' : e.byTier ? `${e.byTier[3]}*` : signed(e.delta ?? 0)} ${TARGET_LABEL[e.target]}`).join(' · ');
}

/** The distinct domain names present in the catalog (for the domain sub-filter). */
const DOMAINS = [...new Set(CATALOG.filter((c) => c.kind === 'domain' && c.domain).map((c) => c.domain!))];

/**
 * Catalog browser (#180/#248 item 5): add a CHARACTER card from the Daggerheart catalog — any domain,
 * ancestry, community, or subclass card — plus weapons/armor — to your decks, so it can be equipped +
 * enabled like any card. Reached from New Card. Adds the card id to the file's acquired list.
 */
export function GearBrowser({ acquiredIds, onAdd, onBack, onClose }: { acquiredIds: Set<string>; onAdd: (id: string) => void; onBack: () => void; onClose: () => void }) {
  const [cat, setCat] = useState<Cat>('domain');
  const [tier, setTier] = useState<1 | 2 | 3 | 4>(1);
  const [domain, setDomain] = useState(DOMAINS[0]);
  const usesTier = cat === 'weapon' || cat === 'armor';

  type Row = { id: string; name: string; sub: string; effects?: CardEffect[] };
  const rows: Row[] = useMemo(() => {
    if (cat === 'weapon') {
      return [...ALL_PRIMARY_WEAPONS, ...ALL_SECONDARY_WEAPONS]
        .filter((w) => w.tier === tier)
        .map((w) => ({ id: w.id, name: w.name, sub: `${w.slot === 'secondary' ? 'Secondary · ' : ''}${w.trait} · ${w.range} · ${w.damage} ${w.damageType} · ${w.burden}`, effects: w.effects }));
    }
    if (cat === 'armor') {
      return ALL_ARMOR.filter((a) => a.tier === tier).map((a) => ({ id: a.id, name: a.name, sub: `Thresholds ${a.thresholds} · Score ${a.baseScore}`, effects: a.effects }));
    }
    if (cat === 'domain') {
      return CATALOG.filter((c) => c.kind === 'domain' && c.domain === domain).map((c) => ({ id: c.id, name: c.label, sub: `${cap(c.domain!)} · Level ${c.level}`, effects: CATALOG_EFFECTS[c.id] }));
    }
    return CATALOG.filter((c) => c.kind === cat).map((c) => ({ id: c.id, name: c.label, sub: c.className ? cap(c.className) : cat, effects: CATALOG_EFFECTS[c.id] }));
  }, [cat, tier, domain]);

  const TABS: { key: Cat; label: string }[] = [
    { key: 'domain', label: 'Domains' },
    { key: 'ancestry', label: 'Ancestry' },
    { key: 'community', label: 'Community' },
    { key: 'subclass', label: 'Subclass' },
    { key: 'weapon', label: 'Weapons' },
    { key: 'armor', label: 'Armor' },
  ];

  const catBar = (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {TABS.map((t) => (
          <Pressable key={t.key} onPress={() => setCat(t.key)} style={{ flexGrow: 1, flexBasis: '31%' }} accessibilityRole="button" accessibilityState={{ selected: cat === t.key }}>
            <ChamferBox chamfer={7} fill={cat === t.key ? Rune.red : 'rgba(20,24,31,0.7)'} stroke={cat === t.key ? 'transparent' : 'rgba(218,162,73,0.4)'} strokeWidth={1} style={{ height: 36, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: cat === t.key ? Rune.ivory : Rune.muted, fontSize: 10.5, fontFamily: Body.bold, textTransform: 'uppercase', letterSpacing: 0.3 }}>{t.label}</Text>
            </ChamferBox>
          </Pressable>
        ))}
      </View>
      <RuneButton label="← Author a custom card instead" kind="ghost" dense height={34} onPress={onBack} />
    </View>
  );

  return (
    <OverlayShell title="Add card from catalog" subtitle="From the Daggerheart catalog" onClose={onClose} footer={catBar} dismissOnScrim={false}>
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
      {cat === 'domain' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
          {DOMAINS.map((d) => (
            <Pressable key={d} onPress={() => setDomain(d)} accessibilityRole="button" accessibilityState={{ selected: domain === d }}>
              <ChamferBox chamfer={5} fill={domain === d ? 'rgba(200,27,24,0.18)' : 'rgba(20,24,31,0.6)'} stroke={domain === d ? Rune.red : 'rgba(218,162,73,0.3)'} strokeWidth={1} style={{ height: 28, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: domain === d ? Rune.goldBright : Rune.muted, fontSize: 10, fontFamily: Body.bold, textTransform: 'uppercase' }}>{cap(d)}</Text>
              </ChamferBox>
            </Pressable>
          ))}
        </View>
      ) : null}
      {rows.map((r) => {
        const has = acquiredIds.has(r.id);
        const eff = effSummary(r.effects);
        return (
          <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 12, gap: 10, borderWidth: 1, borderColor: 'rgba(218,162,73,0.3)', backgroundColor: 'rgba(20,24,31,0.6)' }}>
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
          </View>
        );
      })}
      <View style={{ height: 4 }} />
      <Text style={{ color: Rune.muted, fontSize: 10, fontFamily: Body.italic }}>* tier-scaled values shown at their tier-4 amount; the sheet applies your current tier.</Text>
    </OverlayShell>
  );
}
