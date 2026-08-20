import { type FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { type SvgProps } from 'react-native-svg';

import { LoadingScreen } from '@/components/loading-screen';
import { ChamferBox } from '@/components/chamfer-box';
import { Overlay } from '@/components/overlay-host';
import { RuneButton } from '@/components/rune-button';
import { showToast } from '@/components/toast';
import { playSfx } from '@/lib/sfx';
import { Body, Rune } from '@/constants/theme';
import { classColor } from '@/constants/identity';
import { ALL_ARMOR, ALL_PRIMARY_WEAPONS, ALL_SECONDARY_WEAPONS } from '@/data/equipment-data';
import { ALL_LOOT, lootTable } from '@/data/loot-data';
import { matchesQuery, rollMatches } from '@/lib/gear-search';
import { CLASS_CARDS } from '@/features/create/components/class-cards';
import { ForgedCard } from '@/features/create/components/forged-card';
import { StraightCarousel, type StraightCarouselHandle, type StraightItem } from '@/features/create/components/straight-carousel';
import { CATALOG } from '@/data/catalog';
import { catalogFor, classExpansion } from '@/lib/expansions';
import { isEnabledForCreation, type LibraryCard } from '@/lib/library';
import { libraryCardEffects } from '@/lib/library-embed';
import { hasHomebrew, type BrowseCat, keepSource, type SourceFilter } from '@/lib/homebrew-filter';
import { withResolvedPlaque } from '@/lib/card-plaque';
import { cardsOfType, contentTypes } from '@/lib/content-types';
import { LibraryForgedCard } from '@/features/create/components/library-forged-card';
import { listExpansions } from '@/lib/library-store';
import { type CardEffect, TARGET_LABEL } from '@/lib/modifiers';

import { FullScreenPanel } from './full-screen-panel';
import { NumberKeypad } from './number-keypad';

// #252: character cards (domain/ancestry/community/subclass/class) browsed as the creation carousel
// (card ART, no names); weapons/armor stay a list. v0.14.0: Loot + Consumables are back as list tabs —
// the rulebook's 120 items had no acquisition path at all, so none of them were reachable in play.
/**
 * v0.43.0: plus one tab per KIND an installed pack invented.
 *
 * "If I press add gear, there should be a new category with the same name as the custom type, and I
 * should be able to go in there and actually give those cards to my character." Namespaced with a
 * prefix rather than by the type's name, so a pack that calls its kind "Weapons" cannot take over the
 * weapons tab. See `lib/content-types`.
 */
type Cat = 'domain' | 'ancestry' | 'community' | 'subclass' | 'class' | 'transformation' | 'weapon' | 'armor' | 'loot' | 'consumable' | `type:${string}`;

const TYPE_CAT = 'type:';
const isTypeCat = (c: Cat): boolean => c.startsWith(TYPE_CAT);
const typeCatId = (c: Cat): string => c.slice(TYPE_CAT.length);

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
/**
 * ASKING FOR A THING BY NAME (v0.43.0, owner).
 *
 * The item tabs are flat lists of sixty and more, and until now the only way to narrow one was the
 * tier chips, which two of the four tabs do not have. It sits UNDER whatever narrowing controls the
 * tab already offers, because tier is a coarser cut than a name and the coarser cut should be read
 * first.
 */
function SearchField({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  return (
    <ChamferBox chamfer={6} fill="rgba(14,17,22,0.9)" stroke="rgba(218,162,73,0.4)" strokeWidth={1} style={{ flex: 1, height: 34, justifyContent: 'center', paddingHorizontal: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder="Search by name, trait, damage, hands"
          placeholderTextColor={Rune.muted}
          selectionColor={Rune.goldBright}
          autoCorrect={false}
          autoCapitalize="none"
          style={{ flex: 1, color: Rune.sheet, fontSize: 12.5, fontFamily: Body.medium, padding: 0 }}
          accessibilityLabel="Search this category"
        />
        {value ? (
          <Pressable onPress={() => onChange('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
            <Text style={{ color: Rune.muted, fontSize: 14, fontFamily: Body.bold }}>{'\u2715'}</Text>
          </Pressable>
        ) : null}
      </View>
    </ChamferBox>
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
  /** v0.43.0: the search box, per visit. Cleared on a tab change, because a query is about a list. */
  const [query, setQuery] = useState('');
  /**
   * v0.43.0 (owner): the ROLL PAD, and which table it is reading.
   *
   * "They can also enter which table it is from, like Table 1 or Table 2. It should accept a number
   * from 1 to 60, and it basically chooses an item from Table 1 or Table 2 based on the number." The
   * DM already holds the number; typing it is faster than finding the row it names.
   */
  const [rollPad, setRollPad] = useState(false);
  const [rollTable, setRollTable] = useState<1 | 2>(1);
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
  /**
   * A record-stored (expansion) library card as a forged carousel item (v0.13.1 ancestries → v0.13.2
   * all kinds). v0.43.0: drawn against the whole record set, so a card wearing its class's, domain's
   * or type's chip shows it here as well as in the library.
   */
  const recordItem = useCallback((lc: LibraryCard): StraightItem => ({ id: lc.id, custom: <LibraryForgedCard card={lc} pack={records} /> }), [records]);
  /**
   * Handing a homebrew card OUT (v0.43.0).
   *
   * The copy is stamped with whatever chip it inherits before it leaves, because from here it goes on
   * to a character, where the pack that defines that chip may not be installed. See `lib/card-plaque`.
   */
  const handOut = useCallback((lc: LibraryCard) => onAddCustom?.(withResolvedPlaque(lc, records)), [onAddCustom, records]);
  const recordWeapons = useMemo(() => records.filter((c) => c.contentType === 'weapon'), [records]);
  const recordArmor = useMemo(() => records.filter((c) => c.contentType === 'armor'), [records]);
  const recordLoose = useMemo(() => records.filter((c) => c.contentType === 'inventory' || c.contentType === 'generic'), [records]);
  const recordAncestries = useMemo(() => records.filter((c) => c.contentType === 'ancestry'), [records]);
  const recordDomains = useMemo(() => records.filter((c) => c.contentType === 'domain'), [records]);
  const recordCommunities = useMemo(() => records.filter((c) => c.contentType === 'community'), [records]);
  const recordSubclasses = useMemo(() => records.filter((c) => c.contentType === 'subclass'), [records]);
  /**
   * v0.43.1: CLASS INFO CARDS, not class templates.
   *
   * A class card declares the class and nobody ever holds one, so offering it here handed a player a
   * card with a name and no content. The pages are what a class actually is to a player.
   */
  const recordClasses = useMemo(() => records.filter((c) => c.contentType === 'class' && c.classSpec?.role === 'page'), [records]);
  const domains = useMemo(() => [...new Set([...allowed.filter((c) => c.kind === 'domain' && c.domain).map((c) => c.domain!), ...(recordDomains.map((c) => c.domain).filter(Boolean) as string[])])], [allowed, recordDomains]);
  /** An invented kind's cards are real forged cards, so they browse in the carousel, not as a list. */
  const isCardKind = (CARD_KINDS as string[]).includes(cat) || isTypeCat(cat);
  const [source, setSource] = useState<Source>('all');
  /**
   * The Homebrew chip exists only where it would find something (v0.34.0).
   *
   * `records` arrives asynchronously, so this is derived rather than stored: the chip appears the
   * moment the expansions load, and a homebrew selection that the new category cannot satisfy is
   * dropped on the way in rather than left lit over an empty list.
   */
  // An invented kind is entirely homebrew, so the Official/Homebrew pair has nothing to choose
  // between there and is not offered (v0.43.0).
  const homebrewHere = useMemo(() => (isTypeCat(cat) ? false : hasHomebrew(cat as BrowseCat, records)), [cat, records]);
  const kept = isTypeCat(cat) ? 'all' : keepSource(source, cat as BrowseCat, records);
  if (kept !== source) setSource(kept);
  /** Nothing selected shows everything, which is why 'all' is the default and stays it. */
  const wantOfficial = source !== 'homebrew';
  const wantHomebrew = source !== 'official';

  // carousel items (character-card kinds) — card ART only, NO names rendered by StraightCarousel
  const items: StraightItem[] = useMemo(() => {
    const off = (xs: StraightItem[]) => (wantOfficial ? xs : []);
    const hb = (xs: LibraryCard[]) => (wantHomebrew ? xs : []);
    if (isTypeCat(cat)) return cardsOfType(records, typeCatId(cat)).map(recordItem);
    if (cat === 'class') return [...off(CLASS_CARDS.filter((c) => { const e = classExpansion(c.key); return !e || allowedExp.has(e); }).map((c) => ({ id: `class-${c.key}`, custom: classCardNode(c.key, c.title, c.Banner, c.body) }))), ...hb(recordClasses).map(recordItem)];
    if (cat === 'domain') return [...off(allowed.filter((c) => c.kind === 'domain' && c.domain === domain).map((c) => ({ id: c.id, thumb: c.thumb, source: c.source }))), ...hb(recordDomains.filter((c) => c.domain === domain)).map(recordItem)];
    if (cat === 'ancestry' || cat === 'community' || cat === 'subclass' || cat === 'transformation') {
      const catalog = allowed.filter((c) => c.kind === cat).map((c) => ({ id: c.id, thumb: c.thumb, source: c.source }));
      // transformations can't be authored (no LibraryContentType) — catalog only; the rest merge records.
      const rec = cat === 'ancestry' ? recordAncestries : cat === 'community' ? recordCommunities : cat === 'subclass' ? recordSubclasses : [];
      return [...off(catalog), ...hb(rec).map(recordItem)];
    }
    return [];
  }, [cat, domain, records, recordItem, recordAncestries, recordDomains, recordCommunities, recordSubclasses, recordClasses, allowed, allowedExp, wantOfficial, wantHomebrew]);
  const centerId = items[Math.min(centerIdx, items.length - 1)]?.id;
  const centerAcquired = !!centerId && acquiredIds.has(centerId);
  const addCard = useCallback(() => {
    if (!centerId) return;
    const lc = records.find((c) => c.id === centerId);
    if (lc) handOut(lc);
    else onAdd(centerId);
    if (!multi) onClose();
  }, [centerId, records, handOut, onAdd, multi, onClose]);


  /**
   * Table 2 exists only when Hope and Fear does (v0.43.0).
   *
   * `lootTable` calls the expansion's items Table 2, so offering the chip without the pack would be
   * offering sixty rolls that can never resolve.
   */
  const hasTable2 = useMemo(() => allowedExp.has('void'), [allowedExp]);
  const table = hasTable2 ? rollTable : 1;
  /**
   * The item a roll names, added without ever finding its row.
   *
   * The DM has rolled and is holding a number. Everything the browser does between that number and
   * the card is work the number already did, so this skips all of it.
   */
  const addByRoll = useCallback((n: number) => {
    setRollPad(false);
    const hit = ALL_LOOT.find((l) => l.kind === cat && lootTable(l) === table && rollMatches(l.roll, n) && (!l.expansion || allowedExp.has(l.expansion)));
    if (!hit) { showToast(`Nothing is at roll ${n} on Table ${table}.`, 'error'); return; }
    onAdd(hit.id);
    showToast(`Added ${hit.name}.`, 'success');
    if (!multi) onClose();
  }, [cat, table, allowedExp, onAdd, multi, onClose]);

  /** `card` is set for a HOMEBREW row, which is added through onAddCustom rather than by catalog id. */
  type Row = { id: string; name: string; sub: string; /** v0.43.0: everything this row can be found BY, as one string. See `lib/gear-search`. */ search: string; effects?: CardEffect[]; card?: LibraryCard };
  // v0.19.2 item 5: HF (Hope and Fear) equipment shows only when the pack is enabled for this character.
  const expOk = useCallback((exp?: string) => !exp || allowedExp.has(exp), [allowedExp]);
  const rows: Row[] = useMemo(() => {
    const custom = (c: LibraryCard, sub: string, extra = ''): Row => ({ id: c.id, name: c.title || 'Untitled', sub, search: `${c.title} ${sub} ${extra} ${c.text ?? ''}`, effects: libraryCardEffects(c), card: c });
    if (cat === 'weapon') {
      /**
       * HOW MANY HANDS (v0.43.0, owner).
       *
       * "Make sure you display which handedness the weapon has." `burden` is on every WeaponDef and
       * on every homebrew WeaponSpec, and the row printed trait, range and damage and then stopped.
       * It is the fact that decides whether a shield is possible, which makes it the second most
       * consequential thing about a weapon after its damage die.
       */
      const official = wantOfficial ? [...ALL_PRIMARY_WEAPONS, ...ALL_SECONDARY_WEAPONS].filter((w) => w.tier === tier && expOk(w.expansion)).map((w) => ({
        id: w.id,
        name: w.name,
        sub: `${w.slot === 'secondary' ? 'Secondary · ' : ''}${w.trait} · ${w.range} · ${w.damage} ${w.damageType} · ${w.burden}`,
        search: `${w.name} ${w.trait} ${w.range} ${w.damage} ${w.damageType} ${w.burden} ${w.kind} ${w.slot} tier ${w.tier} ${w.feature?.name ?? ''} ${w.feature?.text ?? ''}`,
        effects: w.effects,
      })) : [];
      // A homebrew weapon carries a tier of its own, so it files under the same tier tabs.
      const mine = wantHomebrew ? recordWeapons.filter((c) => (c.weapon?.tier ?? 1) === tier).map((c) => custom(c, c.weapon ? `Homebrew · ${c.weapon.trait} · ${c.weapon.range} · ${c.weapon.damage} ${c.weapon.damageType} · ${c.weapon.burden}` : 'Homebrew weapon', c.weapon ? `${c.weapon.kind} ${c.weapon.slot} tier ${c.weapon.tier}` : '')) : [];
      return [...official, ...mine];
    }
    if (cat === 'armor') {
      const official = wantOfficial ? ALL_ARMOR.filter((a) => a.tier === tier && expOk(a.expansion)).map((a) => ({
        id: a.id,
        name: a.name,
        sub: `Thresholds ${a.thresholds} · Score ${a.baseScore}`,
        search: `${a.name} thresholds ${a.thresholds} score ${a.baseScore} tier ${a.tier} ${a.feature?.name ?? ''} ${a.feature?.text ?? ''}`,
        effects: a.effects,
      })) : [];
      const mine = wantHomebrew ? recordArmor.filter((c) => (c.armor?.tier ?? 1) === tier).map((c) => custom(c, c.armor ? `Homebrew · Thresholds ${c.armor.thresholds} · Score ${c.armor.baseScore}` : 'Homebrew armor', c.armor ? `tier ${c.armor.tier}` : '')) : [];
      return [...official, ...mine];
    }
    // Loot has no tier — the rulebook indexes it by table roll (Table 1 = base, Table 2 = Hope and Fear).
    if (cat === 'loot' || cat === 'consumable') {
      const official = wantOfficial ? ALL_LOOT.filter((l) => l.kind === cat && expOk(l.expansion)).map((l) => ({
        id: l.id,
        name: l.name,
        sub: `Roll ${l.roll} · Table ${lootTable(l)} · ${l.text.split('\n')[0]}`,
        // Both spellings of the roll, so "3" and "03" are the same question.
        search: `${l.name} roll ${l.roll} ${parseInt(l.roll, 10)} table ${lootTable(l)} ${l.text}`,
        effects: l.effects,
      })) : [];
      // Loose homebrew (an item, or a card with no other home) rides Loot rather than a tab of its own.
      const mine = wantHomebrew && cat === 'loot' ? recordLoose.map((c) => custom(c, `Homebrew · ${(c.text ?? '').split('\n')[0] || 'Card'}`)) : [];
      return [...official, ...mine];
    }
    return [];
  }, [cat, tier, expOk, wantOfficial, wantHomebrew, recordWeapons, recordArmor, recordLoose]);
  /** The rows the search box leaves standing. An empty query leaves all of them (see `lib/gear-search`). */
  const shownRows = useMemo(() => rows.filter((r) => matchesQuery(r.search, query)), [rows, query]);

  const hasTransforms = useMemo(() => allowed.some((c) => c.kind === 'transformation'), [allowed]);
  const ALL_TABS: { key: Cat; label: string }[] = [
    { key: 'domain', label: 'Domains' }, { key: 'ancestry', label: 'Ancestry' },
    // v0.12.2 (A6): transformations are their own category, sitting beside Ancestry (their arsenal home).
    ...(hasTransforms ? [{ key: 'transformation' as Cat, label: 'Transform' }] : []),
    { key: 'community', label: 'Community' },
    { key: 'subclass', label: 'Subclass' }, { key: 'class', label: 'Class' }, { key: 'weapon', label: 'Weapons' }, { key: 'armor', label: 'Armor' },
    { key: 'loot', label: 'Loot' }, { key: 'consumable', label: 'Consumables' },
    /**
     * v0.43.0: one tab per invented kind, last, so a pack's own content sits after the game's.
     *
     * Only kinds that HAVE cards, because a tab that opens on nothing is a tab that reads as broken.
     */
    ...contentTypes(records)
      .filter((t) => cardsOfType(records, t.id).length > 0)
      .map((t) => ({ key: `${TYPE_CAT}${t.id}` as Cat, label: t.title.trim() })),
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
          <Pressable key={t.key} onPress={() => { setCat(t.key); setCenterIdx(0); setQuery(''); }} accessibilityRole="button" accessibilityState={{ selected: cat === t.key }}>
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

      {/**
        * THE SEARCH ROW (v0.43.0, owner).
        *
        * Under the tier chips for Weapons and Armor, and under the Homebrew/Official chips (or the
        * tabs, when a pack has not put any there) for Loot and Consumables: "it should go below the
        * category selection". The card tabs are a carousel you swipe, so they get none of this.
        *
        * The hash button beside it is the DM's door: it opens the roll pad ABOVE this panel, through
        * the panel's own OverlayHost, rather than underneath it.
        */}
      {!isCardKind ? (
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 8 }}>
          <SearchField value={query} onChange={setQuery} />
          {cat === 'loot' || cat === 'consumable' ? (
            <Pressable onPress={() => { playSfx('buttonTap'); setRollPad(true); }} accessibilityRole="button" accessibilityLabel="Add by roll number">
              <ChamferBox chamfer={6} fill="rgba(200,27,24,0.18)" stroke={Rune.red} strokeWidth={1} style={{ width: 40, height: 34, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: Rune.goldBright, fontSize: 17, fontFamily: Body.bold }}>#</Text>
              </ChamferBox>
            </Pressable>
          ) : null}
        </View>
      ) : null}

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
          {shownRows.length === 0 ? (
            <Text style={{ color: Rune.muted, fontSize: 12, fontFamily: Body.regular, textAlign: 'center', marginTop: 24 }}>
              {query ? `Nothing here matches "${query}".` : 'Nothing here yet.'}
            </Text>
          ) : null}
          {shownRows.map((r) => {
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
                <RuneButton label={has ? 'Add again' : 'Add'} kind="secondary" dense height={32} style={{ paddingHorizontal: 14 }} onPress={() => (r.card ? handOut(r.card) : onAdd(r.id))} />
              </View>
            );
          })}
        </ScrollView>
      )}
      {/**
        * THE ROLL PAD (v0.43.0, owner: "make sure it's not below it, because sometimes you do that").
        *
        * Wrapped in `Overlay`, so it is drawn at the FullScreenPanel's root rather than where it is
        * written. That is the whole of not-below-it: this component renders inside the panel's
        * content, and an absolutely-positioned dialog written there is positioned against the
        * content rather than the screen. See `components/overlay-host`.
        */}
      {rollPad ? (
        <Overlay>
          <NumberKeypad
            title={cat === 'consumable' ? 'Consumable by roll' : 'Loot by roll'}
            subtitle="The number you rolled on the table."
            extra={
              hasTable2 ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {([1, 2] as const).map((t) => (
                    <Pressable key={t} onPress={() => { playSfx('buttonTap'); setRollTable(t); }} style={{ flex: 1 }} accessibilityRole="button" accessibilityState={{ selected: table === t }}>
                      <ChamferBox chamfer={6} fill={table === t ? 'rgba(200,27,24,0.22)' : 'rgba(20,24,31,0.7)'} stroke={table === t ? Rune.red : 'rgba(218,162,73,0.4)'} strokeWidth={1} style={{ height: 30, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: table === t ? Rune.goldBright : Rune.muted, fontSize: 11, fontFamily: Body.bold }}>{`Table ${t}`}</Text>
                      </ChamferBox>
                    </Pressable>
                  ))}
                </View>
              ) : undefined
            }
            min={1}
            max={60}
            onSubmit={addByRoll}
            onClose={() => setRollPad(false)}
          />
        </Overlay>
      ) : null}
    </FullScreenPanel>
  );
}
