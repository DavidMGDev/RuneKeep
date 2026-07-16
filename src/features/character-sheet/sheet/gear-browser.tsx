import { type FC, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { type SvgProps } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Rune } from '@/constants/theme';
import { classColor } from '@/constants/identity';
import { ALL_ARMOR, ALL_PRIMARY_WEAPONS, ALL_SECONDARY_WEAPONS } from '@/data/equipment-data';
import { CLASS_CARDS } from '@/features/create/components/class-cards';
import { ForgedCard } from '@/features/create/components/forged-card';
import { StraightCarousel, type StraightCarouselHandle, type StraightItem } from '@/features/create/components/straight-carousel';
import { CATALOG } from '@/data/catalog';
import { catalogFor, classExpansion } from '@/lib/expansions';
import { isEnabledForCreation, type LibraryCard } from '@/lib/library';
import { libraryCardBody, libraryCardKindLabel } from '@/lib/library-embed';
import { listExpansions } from '@/lib/library-store';
import { type CardEffect, TARGET_LABEL } from '@/lib/modifiers';

import { FullScreenPanel } from './full-screen-panel';

// #252: character cards (domain/ancestry/community/subclass/class) browsed as the creation carousel
// (card ART, no names); weapons/armor stay a list. The Loot/Items tabs are gone.
type Cat = 'domain' | 'ancestry' | 'community' | 'subclass' | 'class' | 'transformation' | 'weapon' | 'armor' | 'homebrew';
const CARD_KINDS: Cat[] = ['domain', 'ancestry', 'community', 'subclass', 'class', 'transformation'];
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function effSummary(effects?: CardEffect[]): string {
  if (!effects?.length) return '';
  return effects.map((e) => `${e.dynamic ? '+dyn' : e.byTier ? `${e.byTier[3]}*` : signed(e.delta ?? 0)} ${TARGET_LABEL[e.target]}`).join(' · ');
}

const DOMAINS = [...new Set(CATALOG.filter((c) => c.kind === 'domain' && c.domain).map((c) => c.domain!))];

/** A live class card (no webp) for the carousel — the real forged class feature card, no stat effects. */
function classCardNode(key: string, title: string, Banner: FC<SvgProps>, body: string) {
  return <ForgedCard title={title} kindLabel="Class" body={body} accentDeep={classColor(key as never).deep} Banner={Banner} classKey={key as never} multilineTitle />;
}

export function GearBrowser({ acquiredIds, enabledExpansionIds, onAdd, onAddCustom, onBack, onClose }: { acquiredIds: Set<string>; enabledExpansionIds?: string[]; onAdd: (id: string) => void; onAddCustom?: (card: LibraryCard) => void; onBack: () => void; onClose: () => void }) {
  const [cat, setCat] = useState<Cat>('domain');
  const [tier, setTier] = useState<1 | 2 | 3 | 4>(1);
  // v0.12.2: ADD GEAR only offers content from THIS character's enabled expansions (base always).
  const allowed = useMemo(() => catalogFor(enabledExpansionIds), [enabledExpansionIds]);
  const allowedExp = useMemo(() => new Set(enabledExpansionIds ?? []), [enabledExpansionIds]);
  const domains = useMemo(() => [...new Set(allowed.filter((c) => c.kind === 'domain' && c.domain).map((c) => c.domain!))], [allowed]);
  const [domain, setDomain] = useState(DOMAINS[0]);
  const [centerIdx, setCenterIdx] = useState(0);
  const carRef = useRef<StraightCarouselHandle>(null);
  // v0.10.3 (B4): loose homebrew cards (generic/inventory/weapon/armor) from ENABLED expansions.
  const [homebrew, setHomebrew] = useState<LibraryCard[]>([]);
  useEffect(() => {
    let live = true;
    void listExpansions().then((exps) => {
      if (!live) return;
      setHomebrew(exps.filter((e) => isEnabledForCreation(e) && (!e.id || allowedExp.size === 0 || allowedExp.has(e.id) || !e.official)).flatMap((e) => e.cards).filter((c) => c.contentType === 'generic' || c.contentType === 'inventory' || c.contentType === 'weapon' || c.contentType === 'armor'));
    });
    return () => { live = false; };
  }, [allowedExp]);
  const isCardKind = (CARD_KINDS as string[]).includes(cat) || cat === 'homebrew';

  // carousel items (character-card kinds) — card ART only, NO names rendered by StraightCarousel
  const items: StraightItem[] = useMemo(() => {
    if (cat === 'class') return CLASS_CARDS.filter((c) => { const e = classExpansion(c.key); return !e || allowedExp.has(e); }).map((c) => ({ id: `class-${c.key}`, custom: classCardNode(c.key, c.title, c.Banner, c.body) }));
    if (cat === 'domain') return allowed.filter((c) => c.kind === 'domain' && c.domain === domain).map((c) => ({ id: c.id, thumb: c.thumb, source: c.source }));
    if (cat === 'ancestry' || cat === 'community' || cat === 'subclass' || cat === 'transformation') return allowed.filter((c) => c.kind === cat).map((c) => ({ id: c.id, thumb: c.thumb, source: c.source }));
    if (cat === 'homebrew') return homebrew.map((lc) => ({ id: lc.id, custom: <ForgedCard title={lc.title} kindLabel={libraryCardKindLabel(lc)} body={libraryCardBody(lc)} accentDeep={Rune.panel} imageUri={lc.imageUri} colorArt={lc.color} multilineTitle /> }));
    return [];
  }, [cat, domain, homebrew, allowed, allowedExp]);
  const centerId = items[Math.min(centerIdx, items.length - 1)]?.id;
  const centerAcquired = !!centerId && acquiredIds.has(centerId);

  type Row = { id: string; name: string; sub: string; effects?: CardEffect[] };
  const rows: Row[] = useMemo(() => {
    if (cat === 'weapon') return [...ALL_PRIMARY_WEAPONS, ...ALL_SECONDARY_WEAPONS].filter((w) => w.tier === tier).map((w) => ({ id: w.id, name: w.name, sub: `${w.slot === 'secondary' ? 'Secondary · ' : ''}${w.trait} · ${w.range} · ${w.damage} ${w.damageType}`, effects: w.effects }));
    if (cat === 'armor') return ALL_ARMOR.filter((a) => a.tier === tier).map((a) => ({ id: a.id, name: a.name, sub: `Thresholds ${a.thresholds} · Score ${a.baseScore}`, effects: a.effects }));
    return [];
  }, [cat, tier]);

  const hasTransforms = useMemo(() => allowed.some((c) => c.kind === 'transformation'), [allowed]);
  const TABS: { key: Cat; label: string }[] = [
    { key: 'domain', label: 'Domains' }, { key: 'ancestry', label: 'Ancestry' },
    // v0.12.2 (A6): transformations are their own category, sitting beside Ancestry (their arsenal home).
    ...(hasTransforms ? [{ key: 'transformation' as Cat, label: 'Transform' }] : []),
    { key: 'community', label: 'Community' },
    { key: 'subclass', label: 'Subclass' }, { key: 'class', label: 'Class' }, { key: 'weapon', label: 'Weapons' }, { key: 'armor', label: 'Armor' },
    ...(homebrew.length ? [{ key: 'homebrew' as Cat, label: 'Homebrew' }] : []),
  ];

  return (
    <FullScreenPanel
      title="Add card from catalog"
      subtitle={isCardKind ? 'Swipe the cards, then Select the one you want.' : 'Pick a piece of gear.'}
      onClose={onClose}
      footer={
        <View style={{ gap: 8 }}>
          {isCardKind && items.length > 0 ? (
            // #269: a card can be added more than once — each copy becomes an individual card.
            <RuneButton label={centerAcquired ? 'Add another copy' : 'Select this card'} kind="primary" height={46} onPress={() => { if (!centerId) return; if (cat === 'homebrew') { const lc = homebrew.find((c) => c.id === centerId); if (lc) onAddCustom?.(lc); } else onAdd(centerId); }} />
          ) : null}
          <RuneButton label="← Author a custom card instead" kind="ghost" dense height={36} onPress={onBack} />
        </View>
      }>
      {/* tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 8 }} style={{ flexGrow: 0, marginBottom: 8 }}>
        {TABS.map((t) => (
          <Pressable key={t.key} onPress={() => { setCat(t.key); setCenterIdx(0); }} accessibilityRole="button" accessibilityState={{ selected: cat === t.key }}>
            <ChamferBox chamfer={7} fill={cat === t.key ? Rune.red : 'rgba(20,24,31,0.7)'} stroke={cat === t.key ? 'transparent' : 'rgba(218,162,73,0.4)'} strokeWidth={1} style={{ height: 36, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: cat === t.key ? Rune.ivory : Rune.muted, fontSize: 11, fontFamily: Body.bold, textTransform: 'uppercase', letterSpacing: 0.3 }}>{t.label}</Text>
            </ChamferBox>
          </Pressable>
        ))}
      </ScrollView>

      {cat === 'domain' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5, paddingRight: 8 }} style={{ flexGrow: 0, marginBottom: 8 }}>
          {domains.map((d) => (
            <Pressable key={d} onPress={() => { setDomain(d); setCenterIdx(0); }} accessibilityRole="button" accessibilityState={{ selected: domain === d }}>
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

      {isCardKind ? (
        <View style={{ flex: 1, minHeight: 260 }}>
          {items.length === 0 ? (
            <Text style={{ color: Rune.muted, fontSize: 12, fontFamily: Body.regular, textAlign: 'center', marginTop: 24 }}>No cards.</Text>
          ) : (
            <StraightCarousel key={`${cat}-${domain}`} ref={carRef} items={items} selectedIds={[...acquiredIds]} onIndexChange={setCenterIdx} />
          )}
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 6 }}>
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
                {/* #269: allow several copies — each becomes an individual card */}
                <RuneButton label={has ? 'Add again' : 'Add'} kind="secondary" dense height={32} style={{ paddingHorizontal: 14 }} onPress={() => onAdd(r.id)} />
              </View>
            );
          })}
        </ScrollView>
      )}
    </FullScreenPanel>
  );
}
