import { type FC, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { type SvgProps } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, Rune } from '@/constants/theme';
import { classColor } from '@/constants/identity';
import { ALL_ARMOR, ALL_PRIMARY_WEAPONS, ALL_SECONDARY_WEAPONS } from '@/features/create/equipment-data';
import { CLASS_CARDS } from '@/features/create/class-cards';
import { CATALOG } from '@/features/cards/catalog';
import { type CardEffect, TARGET_LABEL } from '@/lib/modifiers';

// #248/#250: character cards (domain/ancestry/community/subclass/class) are browsed as a card CAROUSEL;
// weapons/armor stay as a short list. No own dark scrim — relies on the shared SheetDim.
type Cat = 'domain' | 'ancestry' | 'community' | 'subclass' | 'class' | 'weapon' | 'armor';
const CARD_KINDS: Cat[] = ['domain', 'ancestry', 'community', 'subclass', 'class'];
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function effSummary(effects?: CardEffect[]): string {
  if (!effects?.length) return '';
  return effects.map((e) => `${e.dynamic ? '+dyn' : e.byTier ? `${e.byTier[3]}*` : signed(e.delta ?? 0)} ${TARGET_LABEL[e.target]}`).join(' · ');
}

const DOMAINS = [...new Set(CATALOG.filter((c) => c.kind === 'domain' && c.domain).map((c) => c.domain!))];

interface CardEntry { id: string; label: string; sub?: string; thumb?: number; Banner?: FC<SvgProps>; color?: string }

const TILE_W = 132;
const TILE_H = Math.round((TILE_W * 7) / 5);

/** A class card tile (no webp exists for class cards): the class colour + its banner + name. */
function ClassTile({ Banner, label, color }: { Banner: FC<SvgProps>; label: string; color: string }) {
  return (
    <View style={{ width: '100%', height: '100%', backgroundColor: color, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 8 }}>
      <View style={{ width: 56, height: 56 }}><Banner width={56} height={56} /></View>
      <Text numberOfLines={1} style={{ color: Rune.ivory, fontSize: 14, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</Text>
      <Text style={{ color: 'rgba(253,252,247,0.7)', fontSize: 9, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>Class</Text>
    </View>
  );
}

/**
 * Catalog browser (#180/#248/#250): add a CHARACTER card (domain/ancestry/community/subclass/class) —
 * browsed as a swipeable card carousel — or a weapon/armor — to your decks. Class cards add with NO
 * stat effects. Reached from New Card; adds the id to the file's acquired list.
 */
export function GearBrowser({ acquiredIds, onAdd, onBack, onClose }: { acquiredIds: Set<string>; onAdd: (id: string) => void; onBack: () => void; onClose: () => void }) {
  const [cat, setCat] = useState<Cat>('domain');
  const [tier, setTier] = useState<1 | 2 | 3 | 4>(1);
  const [domain, setDomain] = useState(DOMAINS[0]);
  const { height: screenH } = useWindowDimensions();
  const isCardKind = (CARD_KINDS as string[]).includes(cat);

  const cards: CardEntry[] = useMemo(() => {
    if (cat === 'class') return CLASS_CARDS.map((c) => ({ id: `class-${c.key}`, label: c.title, Banner: c.Banner, color: classColor(c.key).deep }));
    if (cat === 'domain') return CATALOG.filter((c) => c.kind === 'domain' && c.domain === domain).map((c) => ({ id: c.id, label: `${cap(c.domain!)} ${c.level}`, sub: `Level ${c.level}`, thumb: c.thumb }));
    if (cat === 'ancestry' || cat === 'community' || cat === 'subclass') return CATALOG.filter((c) => c.kind === cat).map((c) => ({ id: c.id, label: c.label, thumb: c.thumb }));
    return [];
  }, [cat, domain]);

  type Row = { id: string; name: string; sub: string; effects?: CardEffect[] };
  const rows: Row[] = useMemo(() => {
    if (cat === 'weapon') {
      return [...ALL_PRIMARY_WEAPONS, ...ALL_SECONDARY_WEAPONS].filter((w) => w.tier === tier).map((w) => ({ id: w.id, name: w.name, sub: `${w.slot === 'secondary' ? 'Secondary · ' : ''}${w.trait} · ${w.range} · ${w.damage} ${w.damageType}`, effects: w.effects }));
    }
    if (cat === 'armor') return ALL_ARMOR.filter((a) => a.tier === tier).map((a) => ({ id: a.id, name: a.name, sub: `Thresholds ${a.thresholds} · Score ${a.baseScore}`, effects: a.effects }));
    return [];
  }, [cat, tier]);

  const TABS: { key: Cat; label: string }[] = [
    { key: 'domain', label: 'Domains' },
    { key: 'ancestry', label: 'Ancestry' },
    { key: 'community', label: 'Community' },
    { key: 'subclass', label: 'Subclass' },
    { key: 'class', label: 'Class' },
    { key: 'weapon', label: 'Weapons' },
    { key: 'armor', label: 'Armor' },
  ];

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
      <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
        <ChamferBox chamfer={16} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} style={{ width: 360, maxHeight: Math.round(screenH * 0.86), paddingHorizontal: 14, paddingTop: 14, paddingBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: Rune.goldText, fontSize: 20, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.5 }}>Add card from catalog</Text>
              <Text style={{ color: Rune.muted, fontSize: 11, fontFamily: Body.medium, marginTop: 2 }}>Swipe, tap a card to add.</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close" style={{ padding: 4 }}><Text style={{ color: Rune.muted, fontSize: 18, fontFamily: Body.bold }}>✕</Text></Pressable>
          </View>

          {/* tabs (horizontal) */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 8 }} style={{ flexGrow: 0, marginBottom: 8 }}>
            {TABS.map((t) => (
              <Pressable key={t.key} onPress={() => setCat(t.key)} accessibilityRole="button" accessibilityState={{ selected: cat === t.key }}>
                <ChamferBox chamfer={7} fill={cat === t.key ? Rune.red : 'rgba(20,24,31,0.7)'} stroke={cat === t.key ? 'transparent' : 'rgba(218,162,73,0.4)'} strokeWidth={1} style={{ height: 36, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: cat === t.key ? Rune.ivory : Rune.muted, fontSize: 11, fontFamily: Body.bold, textTransform: 'uppercase', letterSpacing: 0.3 }}>{t.label}</Text>
                </ChamferBox>
              </Pressable>
            ))}
          </ScrollView>

          {/* per-tab filter */}
          {cat === 'domain' ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5, paddingRight: 8 }} style={{ flexGrow: 0, marginBottom: 8 }}>
              {DOMAINS.map((d) => (
                <Pressable key={d} onPress={() => setDomain(d)} accessibilityRole="button" accessibilityState={{ selected: domain === d }}>
                  <ChamferBox chamfer={5} fill={domain === d ? 'rgba(200,27,24,0.18)' : 'rgba(20,24,31,0.6)'} stroke={domain === d ? Rune.red : 'rgba(218,162,73,0.3)'} strokeWidth={1} style={{ height: 28, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: domain === d ? Rune.goldBright : Rune.muted, fontSize: 10, fontFamily: Body.bold, textTransform: 'uppercase' }}>{cap(d)}</Text>
                  </ChamferBox>
                </Pressable>
              ))}
            </ScrollView>
          ) : cat === 'weapon' || cat === 'armor' ? (
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
              {([1, 2, 3, 4] as const).map((t) => (
                <Pressable key={t} onPress={() => setTier(t)} style={{ flex: 1 }} accessibilityRole="button" accessibilityState={{ selected: tier === t }}>
                  <ChamferBox chamfer={6} fill={tier === t ? 'rgba(200,27,24,0.18)' : 'rgba(20,24,31,0.6)'} stroke={tier === t ? Rune.red : 'rgba(218,162,73,0.35)'} strokeWidth={1} style={{ height: 30, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: tier === t ? Rune.goldBright : Rune.muted, fontSize: 11, fontFamily: Body.bold }}>{`Tier ${t}`}</Text>
                  </ChamferBox>
                </Pressable>
              ))}
            </View>
          ) : null}

          {/* the card carousel (character kinds) OR the weapon/armor list */}
          {isCardKind ? (
            <View style={{ height: TILE_H + 56 }}>
              {cards.length === 0 ? (
                <Text style={{ color: Rune.muted, fontSize: 12, fontFamily: Body.regular, textAlign: 'center', marginTop: 20 }}>No cards.</Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={TILE_W + 12} decelerationRate="fast" contentContainerStyle={{ gap: 12, paddingHorizontal: 4 }}>
                  {cards.map((c) => {
                    const has = acquiredIds.has(c.id);
                    return (
                      <Pressable key={c.id} onPress={() => { if (!has) onAdd(c.id); }} disabled={has} accessibilityRole="button" accessibilityLabel={has ? `${c.label}, added` : `Add ${c.label}`} style={{ width: TILE_W }}>
                        <View style={{ width: TILE_W, height: TILE_H, borderRadius: 8, borderWidth: has ? 2.5 : 1.4, borderColor: has ? Rune.red : 'rgba(218,162,73,0.5)', overflow: 'hidden', backgroundColor: '#0c0f14' }}>
                          {c.thumb ? <Image source={c.thumb} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={80} /> : c.Banner ? <ClassTile Banner={c.Banner} label={c.label} color={c.color ?? Rune.panel} /> : null}
                          {has ? (
                            <View style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: Rune.red, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: Rune.ivory, fontSize: 14, fontFamily: Body.bold }}>✓</Text></View>
                          ) : null}
                        </View>
                        <Text numberOfLines={1} style={{ color: Rune.sheet, fontSize: 11.5, fontFamily: Body.bold, textAlign: 'center', marginTop: 6 }}>{c.label}</Text>
                        <Text style={{ color: has ? Rune.goldBright : Rune.muted, fontSize: 10, fontFamily: Body.bold, textAlign: 'center', textTransform: 'uppercase' }}>{has ? 'Added ✓' : 'Tap to add'}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          ) : (
            <ScrollView style={{ maxHeight: Math.round(screenH * 0.5) }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
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
                    {has ? <Text style={{ color: Rune.goldBright, fontSize: 12, fontFamily: Body.bold }}>Added ✓</Text> : <RuneButton label="Add" kind="secondary" dense height={32} style={{ paddingHorizontal: 14 }} onPress={() => onAdd(r.id)} />}
                  </View>
                );
              })}
            </ScrollView>
          )}

          <RuneButton label="← Author a custom card instead" kind="ghost" dense height={36} style={{ marginTop: 10 }} onPress={onBack} />
        </ChamferBox>
      </View>
    </View>
  );
}
