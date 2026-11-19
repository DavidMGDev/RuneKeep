/**
 * The catalogue on desktop (v0.47.10, owner: "a full screen catalogue, remade from scratch very much like the level
 * up panel"). Same frame as Level Up: a header with the way back, the title and the actions; the categories down the
 * left; the cards (or the gear) in the middle as a grid you can see at once instead of a carousel to swipe; and the
 * card you picked large on the right, with the button that adds it.
 *
 * Everything it shows and does comes from the catalogue itself (`GearBrowser`): the same tabs, domains, tiers,
 * homebrew filter, search, roll pad and multi-card mode. Only the layout is desktop's own.
 */
import { type ReactNode, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { ArtImage } from '@/components/art-image';
import { ChamferBox } from '@/components/chamfer-box';
import { DesktopPortal } from '@/components/desktop-portal';
import { LoadingScreen } from '@/components/loading-screen';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, Rune } from '@/constants/theme';
import { FORGED_H, FORGED_W } from '@/features/create/components/forged-card';
import type { StraightItem } from '@/features/create/components/straight-carousel';
import { SectionDivider } from '@/features/create/create-ui';
import { playSfx } from '@/lib/sfx';

export interface CatalogRow { id: string; name: string; sub: string; eff?: string }

/** A card at any width: its art, or its live face scaled from the size it is drawn at. */
function CardPic({ item, width }: { item: StraightItem; width: number }) {
  const h = (width * FORGED_H) / FORGED_W;
  const k = width / FORGED_W;
  return (
    <View style={{ width, height: h, overflow: 'hidden', backgroundColor: '#0b0e13' }}>
      {item.custom ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: (width - FORGED_W) / 2, top: (h - FORGED_H) / 2, width: FORGED_W, height: FORGED_H, transform: [{ scale: k }] }}>{item.custom}</View>
      ) : (
        <ArtImage source={(width > 200 ? item.source ?? item.thumb : item.thumb ?? item.source) as number} fit="contain" recyclingKey={`${item.id}-${width > 200 ? 'hi' : 'lo'}`} />
      )}
    </View>
  );
}

/** A row of the left column: a category, a domain, a tier. */
function Row({ label, active, onPress, small }: { label: string; active: boolean; onPress: () => void; small?: boolean }) {
  return (
    <Pressable onPress={() => { playSfx('buttonTap', { volume: 0.5 }); onPress(); }} accessibilityRole="tab" accessibilityState={{ selected: active }}>
      {({ hovered }: { hovered?: boolean }) => (
        <ChamferBox chamfer={7} fill={active ? 'rgba(224,181,99,0.12)' : hovered ? 'rgba(224,181,99,0.05)' : 'transparent'} stroke={active ? Rune.goldBright : 'rgba(147,142,136,0.3)'} strokeWidth={active ? 1.6 : 1.1}
          style={{ height: small ? 34 : 40, paddingHorizontal: 12, justifyContent: 'center' }}>
          <Text numberOfLines={1} style={{ color: active ? Rune.goldBright : hovered ? Rune.ivory : Rune.sheet, fontSize: small ? 11.5 : 12, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>{label}</Text>
        </ChamferBox>
      )}
    </Pressable>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={() => { playSfx('buttonTap', { volume: 0.5 }); onPress(); }} accessibilityRole="button" accessibilityState={{ selected: on }}>
      <ChamferBox chamfer={6} fill={on ? Rune.red : 'rgba(20,24,31,0.7)'} stroke={on ? 'transparent' : 'rgba(218,162,73,0.4)'} strokeWidth={1} style={{ height: 32, paddingHorizontal: 12, justifyContent: 'center' }}>
        <Text style={{ color: on ? Rune.ivory : Rune.muted, fontSize: 11.5, fontFamily: Body.bold, letterSpacing: 0.4, textTransform: 'uppercase' }}>{label}</Text>
      </ChamferBox>
    </Pressable>
  );
}

export function DesktopCatalog(p: {
  tabs: { key: string; label: string }[];
  cat: string;
  onCat: (c: string) => void;
  domains: string[];
  domain: string;
  onDomain: (d: string) => void;
  tier: 1 | 2 | 3 | 4;
  onTier: (t: 1 | 2 | 3 | 4) => void;
  /** The Official / Homebrew filter, when the tab has any homebrew. */
  source: 'all' | 'official' | 'homebrew';
  homebrewHere: boolean;
  onSource: (s: 'all' | 'official' | 'homebrew') => void;
  isCardKind: boolean;
  items: StraightItem[];
  ready: boolean;
  rows: CatalogRow[];
  query: string;
  onQuery: (q: string) => void;
  acquired: Set<string>;
  onAddItem: (id: string) => void;
  onAddRow: (id: string) => void;
  multi: boolean;
  onMulti: () => void;
  /** The roll pad's button (loot and consumables), and the pad itself when open. */
  onRollPad?: () => void;
  rollPad?: ReactNode;
  onClose: () => void;
}) {
  const [pick, setPick] = useState<string | null>(null);
  // A new tab or filter starts with its first card picked.
  useEffect(() => { setPick(p.items[0]?.id ?? null); }, [p.cat, p.domain, p.source, p.items.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const picked = p.items.find((i) => i.id === pick) ?? p.items[0];
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const tabLabel = p.tabs.find((t) => t.key === p.cat)?.label ?? '';
  const subtitle = p.isCardKind ? `${p.items.length} card${p.items.length === 1 ? '' : 's'}. Click one to see it, then add it.` : `${p.rows.length} to choose from.`;
  return (
    <DesktopPortal to="window" onDismiss={p.onClose}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: Rune.ink }}>
        {/* The header: back, the title, and what applies to the whole catalogue. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 22, height: 92, paddingHorizontal: 40, borderBottomWidth: 1, borderBottomColor: 'rgba(218,162,73,0.35)' }}>
          <Pressable onPress={p.onClose} accessibilityRole="button" accessibilityLabel="Back to the sheet">
            {({ hovered }: { hovered?: boolean }) => (
              <ChamferBox chamfer={7} fill={hovered ? '#1A1E26' : 'transparent'} stroke={Rune.goldEdge} strokeWidth={1.4} style={{ height: 38, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: Rune.goldText, fontSize: 16, fontFamily: Body.bold }}>{'‹'}</Text>
                <Text style={{ color: Rune.goldText, fontSize: 12, fontFamily: Body.bold, letterSpacing: 1.4, textTransform: 'uppercase' }}>Back</Text>
              </ChamferBox>
            )}
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ color: Rune.ivory, fontSize: 30, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.6 }}>Catalogue</Text>
            <Text style={{ color: Rune.muted, fontSize: 13, fontFamily: Body.medium }}>{`${tabLabel}${p.cat === 'domain' ? `, ${cap(p.domain)}` : p.cat === 'weapon' || p.cat === 'armor' ? `, Tier ${p.tier}` : ''}. ${subtitle}`}</Text>
          </View>
          {!p.isCardKind ? (
            <ChamferBox chamfer={7} fill="rgba(20,24,31,0.8)" stroke="rgba(218,162,73,0.45)" strokeWidth={1.1} style={{ width: 320, height: 40, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 }}>
              <TextInput value={p.query} onChangeText={p.onQuery} placeholder="Search by name, trait, damage, hands" placeholderTextColor="rgba(147,142,136,0.8)" accessibilityLabel="Search this category"
                style={{ flex: 1, color: Rune.ivory, fontSize: 14, fontFamily: Body.medium, outlineStyle: 'none' } as object} />
              {p.query ? <Pressable onPress={() => p.onQuery('')} accessibilityRole="button" accessibilityLabel="Clear search"><Text style={{ color: Rune.muted, fontSize: 16, fontFamily: Body.bold }}>{'×'}</Text></Pressable> : null}
            </ChamferBox>
          ) : null}
          <View style={{ width: 230 }}>
            <RuneButton label={p.multi ? 'Several at once: on' : 'Several at once: off'} kind={p.multi ? 'secondary' : 'ghost'} height={40} onPress={() => { playSfx('buttonTap'); p.onMulti(); }} />
          </View>
        </View>

        <View style={{ flex: 1, flexDirection: 'row', paddingHorizontal: 40, paddingTop: 26, gap: 36 }}>
          {/* The categories, and what narrows the one you are in. */}
          <ScrollView style={{ width: 240, flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
            <SectionDivider label="Categories" />
            {p.tabs.map((t) => <Row key={t.key} label={t.label} active={p.cat === t.key} onPress={() => p.onCat(t.key)} />)}
            {p.cat === 'domain' && p.domains.length ? (
              <>
                <View style={{ height: 10 }} />
                <SectionDivider label="Domain" />
                {p.domains.map((d) => <Row key={d} small label={cap(d)} active={p.domain === d} onPress={() => p.onDomain(d)} />)}
              </>
            ) : null}
            {p.cat === 'weapon' || p.cat === 'armor' ? (
              <>
                <View style={{ height: 10 }} />
                <SectionDivider label="Tier" />
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  {([1, 2, 3, 4] as const).map((t) => <Chip key={t} label={`Tier ${t}`} on={p.tier === t} onPress={() => p.onTier(t)} />)}
                </View>
              </>
            ) : null}
            {p.homebrewHere ? (
              <>
                <View style={{ height: 10 }} />
                <SectionDivider label="Source" />
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  <Chip label="Official" on={p.source === 'official'} onPress={() => p.onSource(p.source === 'official' ? 'all' : 'official')} />
                  <Chip label="Homebrew" on={p.source === 'homebrew'} onPress={() => p.onSource(p.source === 'homebrew' ? 'all' : 'homebrew')} />
                </View>
              </>
            ) : null}
            {p.onRollPad ? (
              <>
                <View style={{ height: 10 }} />
                <SectionDivider label="By roll" />
                <RuneButton label="Add by roll number" kind="ghost" height={38} onPress={() => { playSfx('buttonTap'); p.onRollPad?.(); }} />
              </>
            ) : null}
          </ScrollView>

          {/* The cards, all at once; or the gear, as rows. */}
          <View style={{ flex: 1 }}>
            {p.isCardKind ? (
              p.items.length === 0 ? (
                !p.ready ? <View style={{ height: 200 }}><LoadingScreen label="Opening the catalogue" /></View>
                  : <Text style={{ color: Rune.muted, fontSize: 14, fontFamily: Body.medium, textAlign: 'center', marginTop: 40 }}>Nothing here yet. Try another category.</Text>
              ) : (
                <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18, paddingBottom: 36 }} showsVerticalScrollIndicator={false}>
                  {p.items.map((it) => {
                    const on = picked?.id === it.id;
                    const has = p.acquired.has(it.id);
                    return (
                      <Pressable key={it.id} onPress={() => { playSfx('cardSelect', { volume: 0.4 }); setPick(it.id); }} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`Card ${it.id}${has ? ', already added' : ''}`}>
                        {({ hovered }: { hovered?: boolean }) => (
                          <View style={{ padding: 3, borderWidth: 2, borderColor: on ? Rune.red : hovered ? 'rgba(224,181,99,0.7)' : 'transparent', transform: [{ translateY: hovered && !on ? -3 : 0 }] }}>
                            <CardPic item={it} width={170} />
                            {has ? (
                              <View style={{ position: 'absolute', right: 8, top: 8, backgroundColor: Rune.red, paddingHorizontal: 7, paddingVertical: 3 }}>
                                <Text style={{ color: Rune.ivory, fontSize: 10, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>Added</Text>
                              </View>
                            ) : null}
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )
            ) : (
              <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 36 }} showsVerticalScrollIndicator={false}>
                {p.rows.length === 0 ? <Text style={{ color: Rune.muted, fontSize: 14, fontFamily: Body.medium, textAlign: 'center', marginTop: 40 }}>{p.query ? `Nothing here matches "${p.query}".` : 'Nothing here yet.'}</Text> : null}
                {p.rows.map((r) => {
                  const has = p.acquired.has(r.id);
                  return (
                    <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: 'rgba(218,162,73,0.3)', backgroundColor: 'rgba(20,24,31,0.6)' }}>
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={1} style={{ color: Rune.ivory, fontSize: 15, fontFamily: Body.bold }}>{r.name}</Text>
                        <Text numberOfLines={2} style={{ color: Rune.muted, fontSize: 13, fontFamily: Body.medium, marginTop: 3 }}>{r.sub}</Text>
                        {r.eff ? <Text numberOfLines={1} style={{ color: Rune.goldText, fontSize: 12.5, fontFamily: Body.bold, marginTop: 3 }}>{r.eff}</Text> : null}
                      </View>
                      <View style={{ width: 130 }}>
                        <RuneButton label={has ? 'Add again' : 'Add'} kind="secondary" height={38} onPress={() => p.onAddRow(r.id)} />
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {/* The card picked, large, and the button that adds it. */}
          {p.isCardKind ? (
            <View style={{ width: 320, gap: 14, paddingBottom: 28 }}>
              <SectionDivider label="Picked" />
              {picked ? (
                <>
                  <View style={{ alignItems: 'center' }}><CardPic item={picked} width={300} /></View>
                  <RuneButton label={p.acquired.has(picked.id) ? 'Add another copy' : 'Add card'} kind="primary" height={48} onPress={() => p.onAddItem(picked.id)} />
                  <Text style={{ color: Rune.muted, fontSize: 12.5, fontFamily: Body.medium, textAlign: 'center' }}>
                    {p.multi ? 'Several at once is on: the catalogue stays open after each card.' : 'The catalogue closes once the card is added.'}
                  </Text>
                </>
              ) : null}
            </View>
          ) : null}
        </View>
        {p.rollPad}
      </View>
    </DesktopPortal>
  );
}
