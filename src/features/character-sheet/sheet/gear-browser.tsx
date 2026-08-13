import { type FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { type SvgProps } from 'react-native-svg';

import { LoadingScreen } from '@/components/loading-screen';
import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { playSfx } from '@/lib/sfx';
import { Body, Rune } from '@/constants/theme';
import { classColor } from '@/constants/identity';
import { ALL_ARMOR, ALL_PRIMARY_WEAPONS, ALL_SECONDARY_WEAPONS } from '@/data/equipment-data';
import { ALL_LOOT, lootTable } from '@/data/loot-data';
import { CLASS_CARDS } from '@/features/create/components/class-cards';
import { ForgedCard } from '@/features/create/components/forged-card';
import { StraightCarousel, type StraightCarouselHandle, type StraightItem } from '@/features/create/components/straight-carousel';
import { CATALOG } from '@/data/catalog';
import { catalogFor, classExpansion } from '@/lib/expansions';
import { isEnabledForCreation, type LibraryCard } from '@/lib/library';
import { libraryCardEffects } from '@/lib/library-embed';
import { hasHomebrew, keepSource, type SourceFilter } from '@/lib/homebrew-filter';
import { LibraryForgedCard } from '@/features/create/components/library-forged-card';
import { listExpansions } from '@/lib/library-store';
import { type CardEffect, TARGET_LABEL } from '@/lib/modifiers';

import { FullScreenPanel } from './full-screen-panel';

// #252: character cards (domain/ancestry/community/subclass/class) browsed as the creation carousel
// (card ART, no names); weapons/armor stay a list. v0.14.0: Loot + Consumables are back as list tabs —
// the rulebook's 120 items had no acquisition path at all, so none of them were reachable in play.
type Cat = 'domain' | 'ancestry' | 'community' | 'subclass' | 'class' | 'transformation' | 'weapon' | 'armor' | 'loot' | 'consumable';

/**
 * Where a card came from, as a FILTER INSIDE each category (v0.32.2).
 *
 * Homebrew used to be a category of its own, which filed a custom weapon somewhere other than
 * Weapons. Finding one meant knowing it was homebrew before you could look for it, which is
 * backwards: what you know is that you want a weapon. Every tab now shows both by default and can be
 * narrowed to either. Weapons and Armor get a single Homebrew toggle instead, because their tier tabs
 * already separate the official gear.
 */
type Source = SourceFilter;

/** One source filter chip. Tapping the lit one clears it, which is how "show me both" is expressed
 *  without a third button that says so. */
function SourceChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${label} only`}>
      <ChamferBox chamfer={6} fill={on ? 'rgba(200,27,24,0.18)' : 'rgba(20,24,31,0.6)'} stroke={on ? Rune.red : 'rgba(218,162,73,0.35)'} strokeWidth={1} style={{ height: 30, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: on ? Rune.goldBright : Rune.muted, fontSize: 11, fontFamily: Body.bold }}>{label}</Text>
      </ChamferBox>
    </Pressable>
  );
}
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

/** A record-stored (expansion) library card as a forged carousel item (v0.13.1 ancestries → v0.13.2 all kinds). */
function recordItem(lc: LibraryCard): StraightItem {
  return { id: lc.id, custom: <LibraryForgedCard card={lc} /> };
}

/**
 * The categories a card can be picked from when it is going to be a STARTING ITEM (v0.42.4, owner).
 *
 * A class hands out gear, not a domain card. The picker offered everything, so an author could pick
 * a Level 1 Blade card as a starting item and the class would then hand out something the game has no
 * way to give you at level one. Restricting the browser is half the fix; the other half is the list
 * being able to NAME anything an older pack already picked (see the library screen's resolver).
 */
const ITEM_CATS: Cat[] = ['weapon', 'armor', 'loot', 'consumable'];

export function GearBrowser({ acquiredIds, enabledExpansionIds, itemsOnly, onAdd, onAddCustom, onClose }: {
  acquiredIds: Set<string>;
  enabledExpansionIds?: string[];
  /** v0.42.4: only what can be a starting item. Used by the class form's item lists. */
  itemsOnly?: boolean;
  onAdd: (id: string) => void;
  onAddCustom?: (card: LibraryCard) => void;
  onClose: () => void;
}) {
  const [cat, setCat] = useState<Cat>(itemsOnly ? 'weapon' : 'domain');
  const [tier, setTier] = useState<1 | 2 | 3 | 4>(1);
  // v0.12.2: ADD GEAR only offers content from THIS character's enabled expansions (base always).
  const allowed = useMemo(() => catalogFor(enabledExpansionIds), [enabledExpansionIds]);
  const allowedExp = useMemo(() => new Set(enabledExpansionIds ?? []), [enabledExpansionIds]);
  const [domain, setDomain] = useState<string>(DOMAINS[0]); // v0.13.2: string, not the catalog union — custom expansions add their own domain names
  const [centerIdx, setCenterIdx] = useState(0);
  const carRef = useRef<StraightCarouselHandle>(null);
  /**
   * v0.28.0: adding a card CLOSES the catalogue, unless you are shopping.
   *
   * The primary button used to read "Select this card" and leave the panel open, which reads as a
   * picker waiting for a second confirm that never comes. It is "Add Card" now and it closes. Multi
   * card mode opts back into staying open for the case where several cards are being added at once.
   *
   * The state is local on purpose: the panel is remounted every time it opens, so a bulk session can
   * never leak into the next visit.
   */
  const [multi, setMulti] = useState(false);
  // v0.13.2 (#359): ALL record-stored cards from globally-enabled expansions (Void + homebrew live on the
  // expansion RECORD, not the bundled catalog). v0.13.1 only surfaced ancestries; now every content type
  // is bucketed so custom domain/community/subclass/class cards appear in their tabs too.
  const [records, setRecords] = useState<LibraryCard[]>([]);
  const [recordsReady, setRecordsReady] = useState(false);
  useEffect(() => {
    let live = true;
    void listExpansions().then((exps) => {
      if (!live) return;
      // A custom (non-official) expansion counts as soon as it's globally enabled, regardless of this
      // character's creation snapshot (`!e.official`); official packs still honor the snapshot.
      const enabled = exps.filter((e) => isEnabledForCreation(e) && (!e.id || allowedExp.size === 0 || allowedExp.has(e.id) || !e.official)).flatMap((e) => e.cards);
      setRecords(enabled);
      setRecordsReady(true);
    });
    return () => { live = false; };
  }, [allowedExp]);
  // v0.32.2: loose homebrew goes to the tab its CONTENT belongs to. A custom weapon is a weapon.
  // `generic` has no macro home of its own, so it joins Loot, the catalogue's bucket for what you carry.
  const recordWeapons = useMemo(() => records.filter((c) => c.contentType === 'weapon'), [records]);
  const recordArmor = useMemo(() => records.filter((c) => c.contentType === 'armor'), [records]);
  const recordLoose = useMemo(() => records.filter((c) => c.contentType === 'inventory' || c.contentType === 'generic'), [records]);
  const recordAncestries = useMemo(() => records.filter((c) => c.contentType === 'ancestry'), [records]);
  const recordDomains = useMemo(() => records.filter((c) => c.contentType === 'domain'), [records]);
  const recordCommunities = useMemo(() => records.filter((c) => c.contentType === 'community'), [records]);
  const recordSubclasses = useMemo(() => records.filter((c) => c.contentType === 'subclass'), [records]);
  const recordClasses = useMemo(() => records.filter((c) => c.contentType === 'class'), [records]);
  const domains = useMemo(() => [...new Set([...allowed.filter((c) => c.kind === 'domain' && c.domain).map((c) => c.domain!), ...(recordDomains.map((c) => c.domain).filter(Boolean) as string[])])], [allowed, recordDomains]);
  const isCardKind = (CARD_KINDS as string[]).includes(cat);
  const [source, setSource] = useState<Source>('all');
  /**
   * The Homebrew chip exists only where it would find something (v0.34.0).
   *
   * `records` arrives asynchronously, so this is derived rather than stored: the chip appears the
   * moment the expansions load, and a homebrew selection that the new category cannot satisfy is
   * dropped on the way in rather than left lit over an empty list.
   */
  const homebrewHere = useMemo(() => hasHomebrew(cat, records), [cat, records]);
  const kept = keepSource(source, cat, records);
  if (kept !== source) setSource(kept);
  /** Nothing selected shows everything, which is why 'all' is the default and stays it. */
  const wantOfficial = source !== 'homebrew';
  const wantHomebrew = source !== 'official';

  // carousel items (character-card kinds) — card ART only, NO names rendered by StraightCarousel
  const items: StraightItem[] = useMemo(() => {
    const off = (xs: StraightItem[]) => (wantOfficial ? xs : []);
    const hb = (xs: LibraryCard[]) => (wantHomebrew ? xs : []);
    if (cat === 'class') return [...off(CLASS_CARDS.filter((c) => { const e = classExpansion(c.key); return !e || allowedExp.has(e); }).map((c) => ({ id: `class-${c.key}`, custom: classCardNode(c.key, c.title, c.Banner, c.body) }))), ...hb(recordClasses).map(recordItem)];
    if (cat === 'domain') return [...off(allowed.filter((c) => c.kind === 'domain' && c.domain === domain).map((c) => ({ id: c.id, thumb: c.thumb, source: c.source }))), ...hb(recordDomains.filter((c) => c.domain === domain)).map(recordItem)];
    if (cat === 'ancestry' || cat === 'community' || cat === 'subclass' || cat === 'transformation') {
      const catalog = allowed.filter((c) => c.kind === cat).map((c) => ({ id: c.id, thumb: c.thumb, source: c.source }));
      // transformations can't be authored (no LibraryContentType) — catalog only; the rest merge records.
      const rec = cat === 'ancestry' ? recordAncestries : cat === 'community' ? recordCommunities : cat === 'subclass' ? recordSubclasses : [];
      return [...off(catalog), ...hb(rec).map(recordItem)];
    }
    return [];
  }, [cat, domain, recordAncestries, recordDomains, recordCommunities, recordSubclasses, recordClasses, allowed, allowedExp, wantOfficial, wantHomebrew]);
  const centerId = items[Math.min(centerIdx, items.length - 1)]?.id;
  const centerAcquired = !!centerId && acquiredIds.has(centerId);
  const addCard = useCallback(() => {
    if (!centerId) return;
    const lc = records.find((c) => c.id === centerId);
    if (lc) onAddCustom?.(lc);
    else onAdd(centerId);
    if (!multi) onClose();
  }, [centerId, records, onAddCustom, onAdd, multi, onClose]);


  /** `card` is set for a HOMEBREW row, which is added through onAddCustom rather than by catalog id. */
  type Row = { id: string; name: string; sub: string; effects?: CardEffect[]; card?: LibraryCard };
  // v0.19.2 item 5: HF (Hope and Fear) equipment shows only when the pack is enabled for this character.
  const expOk = useCallback((exp?: string) => !exp || allowedExp.has(exp), [allowedExp]);
  const rows: Row[] = useMemo(() => {
    const custom = (c: LibraryCard, sub: string): Row => ({ id: c.id, name: c.title || 'Untitled', sub, effects: libraryCardEffects(c), card: c });
    if (cat === 'weapon') {
      const official = wantOfficial ? [...ALL_PRIMARY_WEAPONS, ...ALL_SECONDARY_WEAPONS].filter((w) => w.tier === tier && expOk(w.expansion)).map((w) => ({ id: w.id, name: w.name, sub: `${w.slot === 'secondary' ? 'Secondary · ' : ''}${w.trait} · ${w.range} · ${w.damage} ${w.damageType}`, effects: w.effects })) : [];
      // A homebrew weapon carries a tier of its own, so it files under the same tier tabs.
      const mine = wantHomebrew ? recordWeapons.filter((c) => (c.weapon?.tier ?? 1) === tier).map((c) => custom(c, c.weapon ? `Homebrew · ${c.weapon.trait} · ${c.weapon.range} · ${c.weapon.damage} ${c.weapon.damageType}` : 'Homebrew weapon')) : [];
      return [...official, ...mine];
    }
    if (cat === 'armor') {
      const official = wantOfficial ? ALL_ARMOR.filter((a) => a.tier === tier && expOk(a.expansion)).map((a) => ({ id: a.id, name: a.name, sub: `Thresholds ${a.thresholds} · Score ${a.baseScore}`, effects: a.effects })) : [];
      const mine = wantHomebrew ? recordArmor.filter((c) => (c.armor?.tier ?? 1) === tier).map((c) => custom(c, c.armor ? `Homebrew · Thresholds ${c.armor.thresholds} · Score ${c.armor.baseScore}` : 'Homebrew armor')) : [];
      return [...official, ...mine];
    }
    // Loot has no tier — the rulebook indexes it by table roll (Table 1 = base, Table 2 = Hope and Fear).
    if (cat === 'loot' || cat === 'consumable') {
      const official = wantOfficial ? ALL_LOOT.filter((l) => l.kind === cat && expOk(l.expansion)).map((l) => ({ id: l.id, name: l.name, sub: `Roll ${l.roll} · Table ${lootTable(l)} · ${l.text.split('\n')[0]}`, effects: l.effects })) : [];
      // Loose homebrew (an item, or a card with no other home) rides Loot rather than a tab of its own.
      const mine = wantHomebrew && cat === 'loot' ? recordLoose.map((c) => custom(c, `Homebrew · ${(c.text ?? '').split('\n')[0] || 'Card'}`)) : [];
      return [...official, ...mine];
    }
    return [];
  }, [cat, tier, expOk, wantOfficial, wantHomebrew, recordWeapons, recordArmor, recordLoose]);

  const hasTransforms = useMemo(() => allowed.some((c) => c.kind === 'transformation'), [allowed]);
  const ALL_TABS: { key: Cat; label: string }[] = [
    { key: 'domain', label: 'Domains' }, { key: 'ancestry', label: 'Ancestry' },
    // v0.12.2 (A6): transformations are their own category, sitting beside Ancestry (their arsenal home).
    ...(hasTransforms ? [{ key: 'transformation' as Cat, label: 'Transform' }] : []),
    { key: 'community', label: 'Community' },
    { key: 'subclass', label: 'Subclass' }, { key: 'class', label: 'Class' }, { key: 'weapon', label: 'Weapons' }, { key: 'armor', label: 'Armor' },
    { key: 'loot', label: 'Loot' }, { key: 'consumable', label: 'Consumables' },
  ];
  const TABS = itemsOnly ? ALL_TABS.filter((t) => ITEM_CATS.includes(t.key)) : ALL_TABS;

  return (
    <FullScreenPanel
      title="Add card from catalog"
      subtitle={isCardKind ? 'Swipe the cards, then add the one you want.' : 'Pick a piece of gear.'}
      onClose={onClose}
      footer={
        <View style={{ gap: 8 }}>
          {isCardKind && items.length > 0 ? (
            // #269: a card can be added more than once — each copy becomes an individual card.
            <RuneButton label={centerAcquired ? 'Add another copy' : 'Add Card'} kind="primary" height={46} onPress={addCard} />
          ) : null}
          <RuneButton label={`Multi-Card mode: ${multi ? 'On' : 'Off'}`} kind={multi ? 'secondary' : 'ghost'} dense height={36} onPress={() => { playSfx('buttonTap'); setMulti((m) => !m); }} />
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
          {/* Gear needs no Official chip: the tier tabs already separate the published gear, so one
              Homebrew toggle is the whole filter (v0.32.2), and it only appears when there is any
              (v0.34.0). */}
          {homebrewHere ? <SourceChip label="Homebrew" on={source === 'homebrew'} onPress={() => setSource((v) => (v === 'homebrew' ? 'all' : 'homebrew'))} /> : null}
        </View>
      ) : (
        homebrewHere ? (
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
          <SourceChip label="Official" on={source === 'official'} onPress={() => setSource((v) => (v === 'official' ? 'all' : 'official'))} />
          <SourceChip label="Homebrew" on={source === 'homebrew'} onPress={() => setSource((v) => (v === 'homebrew' ? 'all' : 'homebrew'))} />
        </View>
        ) : null
      )}

      {isCardKind ? (
        <View style={{ flex: 1, minHeight: 260 }}>
          {items.length === 0 ? (
            // v0.22.0: PRODUCT.md 5 says every async surface gets a designed loading state; this was
            // the one that didn't, so a pending catalog was indistinguishable from an empty one.
            !recordsReady ? (
              <View style={{ marginTop: 20, height: 160 }}><LoadingScreen label="Opening the catalogue" /></View>
            ) : (
              <Text style={{ color: Rune.muted, fontSize: 12, fontFamily: Body.regular, textAlign: 'center', marginTop: 24 }}>Nothing here yet. Try another tab, or author a custom card below.</Text>
            )
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
                <RuneButton label={has ? 'Add again' : 'Add'} kind="secondary" dense height={32} style={{ paddingHorizontal: 14 }} onPress={() => (r.card ? onAddCustom?.(r.card) : onAdd(r.id))} />
              </View>
            );
          })}
        </ScrollView>
      )}
    </FullScreenPanel>
  );
}
