/**
 * Card Library (v0.10.0) — the app-level home for homebrew content, reached from the main menu's
 * "Cards". Browse the system archive, or author/share/import EXPANSIONS: versioned bundles of cards
 * (ancestries, communities, domain cards, subclasses, classes, generic cards) that feed character
 * creation. Sharing/import use the shared `.rkp` file format; importing a newer version of an
 * expansion you already have updates it in place.
 */
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { AppScreen } from '@/components/app-screen';
import { ArtImage } from '@/components/art-image';
import { ChamferBox } from '@/components/chamfer-box';
import { LoadingScreen } from '@/components/loading-screen';
import { PopupDialog } from '@/components/popup-dialog';
import { RuneButton } from '@/components/rune-button';
import { showToast } from '@/components/toast';
import { CardEditor, type CardDraft } from '@/components/card-editor';
import { Body, Display, DmRune, Gap, Rune } from '@/constants/theme';
import { ALL_DOMAINS, CLASSES } from '@/constants/identity';
import { playSfx } from '@/lib/sfx';
import {
  type ArmorSpec,
  CONTENT_TYPE_LABEL,
  type Expansion,
  type LibraryCard,
  type LibraryContentType,
  type WeaponSpec,
  expansionShareIssues,
  expansionSummary,
  incompleteSubclasses,
  isEnabledForCreation,
  isExpansionEnabled,
  SUBCLASS_TIER_LABEL,
  subclassFamilyName,
} from '@/lib/library';
import { formMarkdown } from '@/lib/card-form';
import { ownImage } from '@/lib/owned-image';
import { cardById } from '@/data/catalog';
import { ALL_LOOT } from '@/data/loot-data';
import { expansionCardCount, isOfficialExpansion, seedOfficialExpansions } from '@/lib/expansions';
import { deleteExpansion, exportRkp, importExpansionRkp, listExpansions, saveExpansion } from '@/lib/library-store';
import { embedCardImageForNfc, embedExpansionImages } from '@/lib/image-embed';
import { nfcModulesPresent } from '@/lib/nfc';
import type { RkpContent } from '@/lib/rkp';
import { type CardAdvance, type CardFunction, type FunctionState, meaningfulFunctions } from '@/lib/card-functions';
import { attachmentsFor, classTitlesIn, subclassNamesFor } from '@/lib/class-links';
import { paginate, sectionOf } from '@/lib/expansion-sort';
import { dependencyNote, extraDependencies, moveCards, type MoveMode } from '@/lib/card-move';
import { getDmMode, setDmMode } from '@/lib/dm-mode';
import { type CustomClassSpec, domainProblems, EMPTY_CLASS_SPEC } from '@/lib/custom-class';
import { GearBrowser } from '@/features/character-sheet/sheet/gear-browser';
import { CATEGORY_ICON_KEYS, CategoryIconSvg } from '@/features/character-sheet/sheet/category-icons';
import { CounterField, SelectRow, TextField } from '@/components/form-controls';
import { LibraryForgedCard } from '@/features/create/components/library-forged-card';
import { CampaignSettingsForm } from './campaign-settings-form';
import { ExpansionGallery } from './expansion-gallery-view';
import { FunctionEditor } from './function-editor';
import { CardFunctionsForm, ClassSpecForm } from './class-spec-form';
import { NfcSendModal } from '@/features/share/nfc-modal';
import { DimScreen } from '@/lib/screen-dim';

const newId = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
/** Content types the New-card chooser offers (Feature 5/6), in display order. */
/** The six traits a subclass may cast with, in the sheet's own order (v0.42.0). */
const SPELLCAST_TRAITS: { key: string; label: string }[] = [
  { key: 'agility', label: 'Agility' }, { key: 'strength', label: 'Strength' }, { key: 'finesse', label: 'Finesse' },
  { key: 'instinct', label: 'Instinct' }, { key: 'presence', label: 'Presence' }, { key: 'knowledge', label: 'Knowledge' },
];

/**
 * The chooser's sections (v0.42.1, owner).
 *
 * Ordered by what an author is usually doing: building a class needs several of the first group in
 * one sitting, so those lead. Every type in `CHOOSABLE_TYPES` appears in exactly one group.
 */
/**
 * What an author can make, grouped (v0.42.3, owner).
 *
 * The class group leads and now offers the FEATURE CARD in place of the plain Card, because a feature
 * card is what a class's abilities are and the group's own sentence says so: advanced tracking and
 * level advancements are done there, not on some other card that happens to carry a counter.
 *
 * "Anything else" is gone. It was a group of one, named after the absence of a reason to pick it, and
 * a plain Card belongs with the rest of the content rather than in a shrug at the bottom.
 */
const TYPE_GROUPS: { label: string; hint: string; types: LibraryContentType[] }[] = [
  {
    label: 'A class, and what belongs to it',
    hint: 'Make the class card first, then point its subclasses and features at it. A Feature card is where a class gives the player something to track: a counter, a switch, a line to write on, and the level advancements that change them.',
    types: ['class', 'subclass', 'feature'],
  },
  { label: 'Domains', hint: 'A domain of your own, and the cards that fill it. A playable domain needs at least eleven: one at each level, two at level 1, and as many more as you like.', types: ['customDomain', 'domain'] },
  { label: 'Who a character is', hint: 'Options offered at character creation.', types: ['ancestry', 'community'] },
  { label: 'What they carry', hint: 'Gear, anything that lands in the inventory, and a plain card for whatever the rest of this list does not cover.', types: ['weapon', 'armor', 'inventory', 'generic'] },
];
const WEAPON_TRAITS = ['Agility', 'Strength', 'Finesse', 'Instinct', 'Presence', 'Knowledge'];
const WEAPON_RANGES = ['Melee', 'Very Close', 'Close', 'Far', 'Very Far'];
const DEFAULT_WEAPON: WeaponSpec = { trait: 'Agility', range: 'Melee', damage: 'd6', damageType: 'phy', burden: 'One-Handed', kind: 'physical', slot: 'primary', tier: 1 };
const DEFAULT_ARMOR: ArmorSpec = { baseScore: 3, thresholds: '7/15', tier: 1 };

/** Type the content-config block writes (the non-visual parts of a LibraryCard). */
interface CardConfig {
  contentType: LibraryContentType;
  domain?: string;
  level?: number;
  className?: string;
  /** subclass content (v0.10.5): the family name shared by its 3 tier cards + which tier this one is. */
  subclass?: string;
  tier?: 1 | 2 | 3;
  /** subclass content (v0.42.0): the trait it casts with, or nothing for a martial subclass. */
  spellcastTrait?: string;
  /** class content (v0.42.0): everything a homebrew class needs to be played. */
  classSpec?: CustomClassSpec;
  /** v0.42.1: the subclass family within `className` this card belongs to. */
  linkSubclass?: string;
  /** v0.42.1: a generic card marked as one of its class's abilities. */
  classRole?: 'feature';
  /** v0.42.1: the level advancements this card's elements offer. */
  advances?: CardAdvance[];
  /** any card (v0.42.0): the counters, text fields and cycling buttons it carries. */
  functions?: CardFunction[];
  /** any card (v0.42.0): a category of its own for this card, instead of the arsenal. */
  functionCategory?: { key: string; label: string; icon?: string };
  ancestryEffectTrait?: 1 | 2;
  weapon?: WeaponSpec;
  armor?: ArmorSpec;
  /** generic 'Card': an optional custom plaque label typed by the user (Feature 6). */
  typeLabel?: string;
}

/** Fresh config for a newly-chosen content type (Feature 5). */
function defaultConfigFor(t: LibraryContentType): CardConfig {
  // v0.42.3: a domain card is an Ability unless its author says otherwise, which is what most of the
  // published ones are, and a class card is a NEW class unless its author says otherwise.
  if (t === 'domain') return { contentType: t, domain: '', level: 1, typeLabel: 'Ability' };
  if (t === 'class') return { contentType: t, classSpec: { ...EMPTY_CLASS_SPEC } };
  if (t === 'ancestry') return { contentType: t, ancestryEffectTrait: 1 };
  if (t === 'subclass') return { contentType: t, tier: 1 };
  if (t === 'weapon') return { contentType: t, weapon: { ...DEFAULT_WEAPON } };
  if (t === 'armor') return { contentType: t, armor: { ...DEFAULT_ARMOR } };
  return { contentType: t };
}

function LibInput({ label, value, onChangeText, placeholder, keyboardType, maxLength }: { label: string; value: string; onChangeText: (s: string) => void; placeholder?: string; keyboardType?: 'default' | 'number-pad'; maxLength?: number }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: Rune.bronze, fontSize: 10, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' }}>{label}</Text>
      <ChamferBox chamfer={6} fill="rgba(14,17,22,0.9)" stroke="rgba(218,162,73,0.45)" strokeWidth={1.1} style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 11 }}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Rune.muted}
          selectionColor={Rune.goldBright}
          keyboardType={keyboardType}
          maxLength={maxLength}
          style={{ color: Rune.sheet, fontSize: 14, fontFamily: Body.semibold, padding: 0 }}
          accessibilityLabel={label}
        />
      </ChamferBox>
    </View>
  );
}

/** v0.12.0: an enable/disable toggle shown on the RIGHT of each expansion row, so expansions can be
 *  turned on/off from the hub without opening them (the in-detail button is gone). */
function ExpansionToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <Pressable
      onPress={onToggle}
      hitSlop={12}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={on ? 'Enabled for creation. Tap to disable' : 'Disabled. Tap to enable'}
      style={{ width: 46, height: 26, borderRadius: 13, padding: 3, justifyContent: 'center', backgroundColor: on ? Rune.goldEdge : 'rgba(70,72,78,0.6)', borderWidth: 1, borderColor: on ? Rune.goldBright : 'rgba(147,142,136,0.5)' }}>
      <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: on ? Rune.ivory : '#B7BBC3', alignSelf: on ? 'flex-end' : 'flex-start' }} />
    </Pressable>
  );
}

/** A single expansion row on the hub — name + version/count/author, with the enable toggle on the right.
 *  Shared by the "Official Expansions" and "My expansions" sections (identical layout). */
function ExpansionRow({ e, on, cardCount, onOpen, onToggle, onHold }: { e: Expansion; on: boolean; cardCount: number; onOpen: () => void; onToggle: () => void; onHold?: () => void }) {
  return (
    // v0.42.3: HOLD opens the row's menu, which is where Delete lives. The same gesture, the same
    // place and the same escalation a DM campaign uses, because an expansion is more work than one.
    <Pressable onPress={onOpen} onLongPress={onHold} delayLongPress={340} accessibilityRole="button" accessibilityLabel={`Open ${e.name}`}>
      {({ pressed }) => (
        <ChamferBox chamfer={10} fill={pressed ? 'rgba(20,24,31,0.95)' : 'rgba(14,17,22,0.86)'} stroke="rgba(218,162,73,0.4)" strokeWidth={1.1} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 13, paddingVertical: 12 }}>
          <View style={{ flex: 1, opacity: on ? 1 : 0.5 }}>
            <Text numberOfLines={1} style={{ color: Rune.ivory, fontSize: 16, fontFamily: Display.black, letterSpacing: 0.5, textTransform: 'uppercase' }}>{e.name}</Text>
            <Text style={{ color: Rune.goldText, fontSize: 11, fontFamily: Body.medium, letterSpacing: 0.3, marginTop: 3 }}>v{e.version} · {cardCount} card{cardCount === 1 ? '' : 's'}{e.author ? ` · ${e.author}` : ''}</Text>
          </View>
          {/* v0.12.0: toggle enable/disable right here, no need to open the expansion. */}
          <ExpansionToggle on={on} onToggle={onToggle} />
        </ChamferBox>
      )}
    </Pressable>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}>
      <View style={{ paddingHorizontal: 11, paddingVertical: 7, borderRadius: 5, backgroundColor: on ? Rune.red : 'rgba(20,24,31,0.7)', borderWidth: 1, borderColor: on ? 'transparent' : 'rgba(218,162,73,0.4)' }}>
        <Text style={{ color: on ? Rune.ivory : Rune.sheet, fontSize: 12.5, fontFamily: Body.bold }}>{label}</Text>
      </View>
    </Pressable>
  );
}

// v0.13.0: all 15 class keys (base + Void) so Void subclasses/classes can be authored.
const BUILTIN_CLASSES = CLASSES.map((c) => c.key);
const smallLabel = { color: Rune.bronze, fontSize: 10, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' as const };
const chipRow = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6 };

/**
 * The three types the published DOMAIN CARDS carry (v0.42.3, owner).
 *
 * "It is important for Domain Card creation to customize what the card type is... since they are
 * based on images that already have those card types painted on them."
 *
 * Each has a plaque of its own keyed to exactly these words, so a homebrew Spell reads as a Spell.
 */
const DOMAIN_CARD_TYPES = ['Ability', 'Spell', 'Grimoire'] as const;

/** The per-type mechanical/config fields shown inside the card editor (its `extraField`). The content
 *  type is chosen up front (Feature 5), so this no longer offers a type switcher. */
function ContentConfig({ config, onChange, card, siblings, onPickItems }: {
  config: CardConfig;
  onChange: (c: CardConfig) => void;
  /** The card being edited, for the class report. */
  card: LibraryCard;
  /** Every OTHER card in this expansion, so links point at real things (v0.42.1). */
  siblings: LibraryCard[];
  /** v0.42.3: open the card browser to pick starting items for one of a class's three lists. */
  onPickItems: (which: 'fixed' | 'choiceA' | 'choiceB') => void;
}) {
  const set = (patch: Partial<CardConfig>) => onChange({ ...config, ...patch });
  /**
   * What this card may attach to (v0.42.1, owner).
   *
   * Custom classes in this expansion, plus every built-in class, because "I can create a subclass for
   * an existing class" is the owner's own case. A subclass or a tracker names one of these, and the
   * class card simply reports what points at it. See `lib/class-links`.
   */
  const classChoices = [...classTitlesIn(siblings), ...BUILTIN_CLASSES];
  const subclassChoices = config.className ? subclassNamesFor(siblings, config.className) : [];
  const customDomains = siblings.filter((c) => c.contentType === 'customDomain' && c.title.trim()).map((c) => c.title.trim());
  const domainChoices = [...customDomains, ...ALL_DOMAINS];
  /**
   * What a class may hand out at level one (v0.42.1, owner).
   *
   * The expansion's own gear FIRST, because that is what the author just made, then the base game's
   * loot and consumables: "the base game loot and consumables should be selectable". A printed class
   * starts you with a torch and a rope as often as with something of its own, and an author who had
   * to re-make a Minor Health Potion to hand one out would make a slightly different one.
   */
  const itemOptions = [
    ...siblings
      .filter((c) => c.contentType === 'inventory' || c.contentType === 'weapon' || c.contentType === 'armor')
      .map((c) => ({ id: c.id, title: c.title })),
    ...ALL_LOOT.map((l) => ({ id: l.id, title: l.name })),
  ];
  /** Live state for the author's "Try it" controls. Thrown away when the editor closes, by design:
   *  it is a test, not the player's data. */
  const [fnStates, setFnStates] = useState<Record<string, FunctionState>>({});
  const setW = (patch: Partial<WeaponSpec>) => onChange({ ...config, weapon: { ...(config.weapon ?? DEFAULT_WEAPON), ...patch } });
  const setA = (patch: Partial<ArmorSpec>) => onChange({ ...config, armor: { ...(config.armor ?? DEFAULT_ARMOR), ...patch } });
  const t = config.contentType;
  const w = config.weapon ?? DEFAULT_WEAPON;
  const a = config.armor ?? DEFAULT_ARMOR;
  return (
    <View style={{ gap: 8 }}>
      <Text style={smallLabel}>{CONTENT_TYPE_LABEL[t]} details</Text>
      {t === 'domain' ? (
        <>
          {/* v0.42.1 (owner): CHOSEN, never typed, and the domains this expansion defines lead the
              list. A typed domain matched nothing, so the card belonged to no domain at all. */}
          <Text style={smallLabel}>Which domain</Text>
          <View style={chipRow}>{domainChoices.map((d) => <Chip key={d} label={d} on={config.domain === d} onPress={() => set({ domain: d })} />)}</View>
          {customDomains.length === 0 ? (
            <Text style={{ color: Rune.muted, fontSize: 9.5, fontFamily: Body.regular }}>Make a Domain card in this expansion to offer one of your own.</Text>
          ) : null}
          {/* v0.42.3 (owner): a counter. A level is 1 to 10 and a keyboard can produce 47. */}
          <CounterField label="Level" value={config.level ?? 1} min={1} max={10} onChange={(level) => set({ level })} />
          {/* v0.42.3 (owner): the printed TYPE. The real domain cards carry one of three, painted
              into their art, so a homebrew card that cannot pick one never looks like the real thing.
              Each has a plaque of its own in `KIND_THEMES`, keyed to these labels. */}
          <SelectRow
            label="What kind of card it is"
            hint="The word printed on the plaque, the same three the published domain cards use."
            value={(config.typeLabel as (typeof DOMAIN_CARD_TYPES)[number]) ?? 'Ability'}
            options={DOMAIN_CARD_TYPES.map((x) => ({ value: x, label: x }))}
            onChange={(typeLabel) => set({ typeLabel })}
          />
        </>
      ) : null}
      {/* v0.42.1 (owner): a CUSTOM DOMAIN. It owes eleven cards, and says so until it has them. */}
      {t === 'customDomain' ? (
        <View style={{ gap: 6 }}>
          {/* v0.42.3 (owner): "clear up the domain section description because it sounds like the
              user cannot make more than 11 domain cards". Eleven is the FLOOR: what a domain needs to
              be playable at every level. Above that, as many as you like. */}
          <Text style={{ color: Rune.muted, fontSize: 9.5, fontFamily: Body.regular, lineHeight: 13 }}>
            A domain of your own. Write its cards as Domain cards in this expansion and set each one&apos;s domain to this.
            A playable domain needs at least one card at every level from 1 to 10, and two at level 1, so eleven at a minimum.
            Write as many more as you like: several cards can share a level, and the published domains do exactly that.
          </Text>
          {card.title.trim() ? (
            <Text style={{ color: domainProblems(card.title, siblings).length ? Rune.red : Rune.goldText, fontSize: 11, fontFamily: Body.bold, lineHeight: 15 }}>
              {domainProblems(card.title, siblings)[0] ?? 'Every level is covered. This domain is ready.'}
            </Text>
          ) : null}
        </View>
      ) : null}
      {/* v0.42.1 (owner): ANY card may name the class it belongs to, so a feature card, a tracker or
          a subclass all attach the same way and the class card reports them. */}
      {t !== 'class' && t !== 'customDomain' ? (
        <View style={{ gap: 5 }}>
          <Text style={smallLabel}>Belongs to a class (optional)</Text>
          <View style={chipRow}>
            <Chip label="Nothing" on={!config.className} onPress={() => set({ className: undefined, linkSubclass: undefined })} />
            {classChoices.map((c) => <Chip key={c} label={c} on={config.className === c} onPress={() => set({ className: c, linkSubclass: undefined })} />)}
          </View>
          {config.className && subclassChoices.length ? (
            <>
              <Text style={smallLabel}>…and to one of its subclasses (optional)</Text>
              <View style={chipRow}>
                <Chip label="The whole class" on={!config.linkSubclass} onPress={() => set({ linkSubclass: undefined })} />
                {subclassChoices.map((sc) => <Chip key={sc} label={sc} on={config.linkSubclass === sc} onPress={() => set({ linkSubclass: sc })} />)}
              </View>
            </>
          ) : null}
          {t === 'generic' && config.className ? (
            <View style={chipRow}>
              <Chip label="This is one of the class's features" on={config.classRole === 'feature'} onPress={() => set({ classRole: config.classRole === 'feature' ? undefined : 'feature' })} />
            </View>
          ) : null}
        </View>
      ) : null}
      {/* v0.42.0 (owner): a CLASS is authored in full now. The card's own title names it, so there is
          no parent to point at; the subclasses point back at this. */}
      {t === 'class' ? (
        <ClassSpecForm
          spec={config.classSpec}
          card={{ ...card, className: config.className }}
          attachments={attachmentsFor(siblings, card.title)}
          classChoices={classChoices}
          itemTitle={(id) => itemOptions.find((o) => o.id === id)?.title ?? 'A card that is no longer here'}
          onPickItems={onPickItems}
          onClassName={(className) => set({ className })}
          onChange={(classSpec) => set({ classSpec })}
        />
      ) : null}
      {t === 'subclass' ? (
        <View style={{ gap: 4 }}>
          <TextField label="Subclass name (its family)" value={config.subclass ?? ''} placeholder="e.g. Stalwart" onChangeText={(subclass) => set({ subclass })} />
          <SelectRow
            label="Progression tier"
            value={config.tier === 3 ? 'mastery' : config.tier === 2 ? 'spec' : 'foundation'}
            options={[{ value: 'foundation', label: 'Foundation' }, { value: 'spec', label: 'Specialization' }, { value: 'mastery', label: 'Mastery' }]}
            onChange={(v) => set({ tier: v === 'mastery' ? 3 : v === 'spec' ? 2 : 1 })}
          />
          {/* v0.42.0 (owner): the spellcast trait, exactly as an official subclass carries one. */}
          <Text style={smallLabel}>Spellcast trait (optional)</Text>
          <View style={chipRow}>
            {SPELLCAST_TRAITS.map((x) => <Chip key={x.key} label={x.label} on={config.spellcastTrait === x.key} onPress={() => set({ spellcastTrait: config.spellcastTrait === x.key ? undefined : x.key })} />)}
          </View>
          <Text style={{ color: Rune.muted, fontSize: 9.5, fontFamily: Body.regular, lineHeight: 13 }}>Leave it off for a martial subclass. Set it and the sheet uses that trait for Spellcast, exactly as an official caster does.</Text>
          <Text style={{ color: Rune.muted, fontSize: 9.5, fontFamily: Body.regular, lineHeight: 13 }}>Make ALL THREE, a Foundation, a Specialization, and a Mastery. Cards link into one subclass when they share a class and a name: leave the field above blank and just give all three cards the SAME title (capitals don&apos;t matter), or fill it in to link cards with different titles. Foundation is chosen in creation; the other two are added automatically when you upgrade the subclass on level-up.</Text>
        </View>
      ) : null}
      {/* v0.13.2 (#359): the old "Passive on feature line" chip is gone. Which feature is crossed out in a
          mix is decided by SELECTION ORDER (like Void ancestries), and the passive rides Feature 1 by
          convention — no author choice needed. The section editor still organizes Feature 1 / 2 by position. */}
      {/**
        * WHERE A FEATURE CARD LANDS (v0.42.3).
        *
        * The elements themselves are configured in the SECTION LIST now, not here: an element is a
        * block of the card, so it is authored where the card's blocks are. What is left in this panel
        * is the one thing that is about the card rather than about an element.
        */}
      <View style={{ gap: 9, borderTopWidth: 1, borderTopColor: 'rgba(218,162,73,0.25)', paddingTop: 10 }}>
        {t === 'feature' ? (
          <View style={{ gap: 5 }}>
            <Text style={smallLabel}>Where this card lands</Text>
            <View style={chipRow}>
              <Chip label="The arsenal" on={!config.functionCategory} onPress={() => set({ functionCategory: undefined })} />
              <Chip label="Its own category" on={!!config.functionCategory} onPress={() => set({ functionCategory: config.functionCategory ?? { key: `fc-${Date.now().toString(36)}`, label: '' } })} />
            </View>
            {config.functionCategory ? (
              <View style={{ gap: 5 }}>
                <TextField label="Category name" value={config.functionCategory.label} placeholder="e.g. Rites" onChangeText={(label) => set({ functionCategory: { ...config.functionCategory!, label } })} />
                <Text style={smallLabel}>Icon</Text>
                <View style={chipRow}>
                  {CATEGORY_ICON_KEYS.slice(0, 14).map((k) => (
                    <Pressable key={k} onPress={() => set({ functionCategory: { ...config.functionCategory!, icon: k } })} accessibilityRole="button" accessibilityLabel={k}>
                      <View style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 5, backgroundColor: config.functionCategory?.icon === k ? Rune.red : 'rgba(20,24,31,0.7)', borderWidth: 1, borderColor: 'rgba(218,162,73,0.4)' }}>
                        <CategoryIconSvg iconKey={k} size={20} />
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      {t === 'weapon' ? (
        <View style={{ gap: 6 }}>
          <Text style={smallLabel}>Trait</Text><View style={chipRow}>{WEAPON_TRAITS.map((x) => <Chip key={x} label={x} on={w.trait === x} onPress={() => setW({ trait: x })} />)}</View>
          <Text style={smallLabel}>Range</Text><View style={chipRow}>{WEAPON_RANGES.map((x) => <Chip key={x} label={x} on={w.range === x} onPress={() => setW({ range: x })} />)}</View>
          <TextField label="Damage" hint="A die and an optional bonus, the way the printed weapons write it." value={w.damage} placeholder="d8+2" onChangeText={(damage) => setW({ damage })} />
          <View style={chipRow}>
            <Chip label="Physical" on={w.damageType === 'phy'} onPress={() => setW({ damageType: 'phy', kind: 'physical' })} />
            <Chip label="Magic" on={w.damageType === 'mag'} onPress={() => setW({ damageType: 'mag', kind: 'magic' })} />
          </View>
          <View style={chipRow}>
            <Chip label="One-Handed" on={w.burden === 'One-Handed'} onPress={() => setW({ burden: 'One-Handed' })} />
            <Chip label="Two-Handed" on={w.burden === 'Two-Handed'} onPress={() => setW({ burden: 'Two-Handed' })} />
          </View>
          <View style={chipRow}>
            <Chip label="Primary" on={w.slot === 'primary'} onPress={() => setW({ slot: 'primary' })} />
            <Chip label="Secondary" on={w.slot === 'secondary'} onPress={() => setW({ slot: 'secondary' })} />
          </View>
          <Text style={smallLabel}>Tier</Text><View style={chipRow}>{[1, 2, 3, 4].map((n) => <Chip key={n} label={`T${n}`} on={w.tier === n} onPress={() => setW({ tier: n as 1 | 2 | 3 | 4 })} />)}</View>
        </View>
      ) : null}
      {t === 'armor' ? (
        <View style={{ gap: 6 }}>
          <CounterField label="Base armor score" value={a.baseScore} min={0} max={20} onChange={(baseScore) => setA({ baseScore })} />
          <TextField label="Thresholds" hint="Major and severe, separated by a slash." value={a.thresholds} placeholder="7/15" onChangeText={(thresholds) => setA({ thresholds })} />
          <Text style={smallLabel}>Tier</Text><View style={chipRow}>{[1, 2, 3, 4].map((n) => <Chip key={n} label={`T${n}`} on={a.tier === n} onPress={() => setA({ tier: n as 1 | 2 | 3 | 4 })} />)}</View>
        </View>
      ) : null}
      {t === 'generic' || t === 'feature' ? (
        <TextField label="Type label (optional)" hint="The word printed on the plaque. Left blank it says what kind of card this is." value={config.typeLabel ?? ''} placeholder="e.g. Consumable, Relic" onChangeText={(typeLabel) => set({ typeLabel })} />
      ) : null}
    </View>
  );
}

/** New-card type chooser (Feature 5): pick the content type BEFORE authoring. */
function TypeChooser({ onPick, onClose }: { onPick: (t: LibraryContentType) => void; onClose: () => void }) {
  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 9000, alignItems: 'center', justifyContent: 'center' }}>
      {/* v0.13.0: non-dismissing backdrop — closing is deliberate (the Cancel button), never a stray tap. */}
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(6,8,13,0.9)' }} />
      <DimScreen opacity={0.9} />
      <ChamferBox chamfer={14} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} style={{ width: 330, paddingHorizontal: 16, paddingVertical: 16, gap: 12 }}>
        <Text style={{ color: Rune.goldText, fontSize: 18, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.5 }}>What are you making?</Text>
        {/**
          * Grouped, not a heap (v0.42.1, owner).
          *
          * A class is authored as several cards that arrive together, so the things you make in one
          * sitting should sit together: the class and the cards that belong to it, then the content
          * anyone can drop into a game, then the gear. Nine flat chips gave no hint of that.
          */}
        {TYPE_GROUPS.map((g) => (
          <View key={g.label} style={{ gap: 6 }}>
            <Text style={smallLabel}>{g.label}</Text>
            <Text style={{ color: Rune.muted, fontSize: 9.5, fontFamily: Body.regular, lineHeight: 13 }}>{g.hint}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {g.types.map((t) => (
                <Pressable key={t} onPress={() => { playSfx('buttonTap'); onPick(t); }} accessibilityRole="button" accessibilityLabel={CONTENT_TYPE_LABEL[t]}>
                  <View style={{ paddingHorizontal: 13, paddingVertical: 9, borderRadius: 6, backgroundColor: 'rgba(20,24,31,0.8)', borderWidth: 1, borderColor: 'rgba(218,162,73,0.45)' }}>
                    <Text style={{ color: Rune.sheet, fontSize: 13.5, fontFamily: Body.bold }}>{CONTENT_TYPE_LABEL[t]}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
        <RuneButton label="Cancel" kind="ghost" height={40} onPress={onClose} />
      </ChamferBox>
    </View>
  );
}

/**
 * Sending a card to another expansion (v0.42.1, owner).
 *
 * The dependency line is the point: a subclass that leaves its class behind is a broken card in one
 * expansion and a hole in the other, so the cluster travels together and the author is told what is
 * coming with it before they commit. See `lib/card-move`.
 */
function MoveCardModal({ cards, source, targets, onPick, onClose }: {
  cards: LibraryCard[];
  source: LibraryCard[];
  targets: Expansion[];
  onPick: (dest: Expansion, mode: MoveMode) => void;
  onClose: () => void;
}) {
  const [dest, setDest] = useState<Expansion | null>(targets[0] ?? null);
  const extra = extraDependencies(cards.map((c) => c.id), source);
  const what = cards.length === 1 ? `"${cards[0].title || 'Untitled'}"` : `${cards.length} cards`;
  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 9000, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(6,8,13,0.9)' }} />
      <DimScreen opacity={0.9} />
      <ChamferBox chamfer={14} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} style={{ width: 330, paddingHorizontal: 16, paddingVertical: 16, gap: 10 }}>
        <Text style={{ color: Rune.goldText, fontSize: 17, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.5 }}>Send {what} where?</Text>
        {targets.length === 0 ? (
          <Text style={{ color: Rune.muted, fontSize: 12, fontFamily: Body.regular, lineHeight: 17 }}>There is nowhere to send it. Make another expansion first.</Text>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {targets.map((e) => <Chip key={e.id} label={e.name} on={dest?.id === e.id} onPress={() => setDest(e)} />)}
          </View>
        )}
        {extra.length ? (
          <Text style={{ color: Rune.goldText, fontSize: 11, fontFamily: Body.medium, lineHeight: 15 }}>{dependencyNote(extra)}</Text>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <RuneButton label="Copy" kind="ghost" dense height={38} style={{ flex: 1 }} onPress={() => dest && onPick(dest, 'copy')} />
          <RuneButton label="Move" kind="primary" dense height={38} style={{ flex: 1 }} onPress={() => dest && onPick(dest, 'move')} />
        </View>
        <RuneButton label="Cancel" kind="ghost" height={38} onPress={onClose} />
      </ChamferBox>
    </View>
  );
}

/** Create / edit expansion metadata (name, author, description, version). */
function MetaForm({ initial, onSave, onCancel }: { initial?: Expansion; onSave: (m: { name: string; author: string; description: string; version: number }) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [author, setAuthor] = useState(initial?.author ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  /**
    * The version is NOT edited (v0.42.1, owner: "manual versioning of expansions is dropped").
    *
    * It is bumped on every save instead, because that is what it is for: an installed copy updates in
    * place when a higher number arrives, and an author who forgets to raise it by hand ships an update
    * nobody receives. It is still shown, so a DM can tell a player which one they are on.
    */
  const version = (initial?.version ?? 0) + 1;
  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 9000, alignItems: 'center', justifyContent: 'center' }}>
      {/* v0.13.0: non-dismissing backdrop — a stray tap between fields must never destroy typed input.
          The form closes ONLY via its Cancel/Save buttons. */}
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(6,8,13,0.9)' }} />
      <DimScreen opacity={0.9} />
      <ChamferBox chamfer={14} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} style={{ width: 330, paddingHorizontal: 16, paddingVertical: 16, gap: 10 }}>
        <Text style={{ color: Rune.goldText, fontSize: 18, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.5 }}>{initial ? 'Edit expansion' : 'New expansion'}</Text>
        <LibInput label="Name" value={name} onChangeText={setName} placeholder="My homebrew" maxLength={32} />
        <LibInput label="Author" value={author} onChangeText={setAuthor} placeholder="You" />
        <LibInput label="Description" value={description} onChangeText={setDescription} placeholder="What's inside" />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ color: Rune.bronze, fontSize: 10, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' }}>Version</Text>
          <Text style={{ color: Rune.sheet, fontSize: 16, fontFamily: Body.bold }}>{version}</Text>
        </View>
        <Text style={{ color: Rune.muted, fontSize: 9.5, fontFamily: Body.regular }}>Raised for you every time you save, so anyone who already has this pack updates in place. Read it out when a player asks which version they are on.</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          <RuneButton label="Cancel" kind="ghost" height={40} style={{ flex: 1 }} onPress={onCancel} />
          <RuneButton label="Save" kind="primary" height={40} style={{ flex: 1 }} disabled={!name.trim()} onPress={() => onSave({ name: name.trim(), author: author.trim(), description: description.trim(), version })} />
        </View>
      </ChamferBox>
    </View>
  );
}

const cardSummary = (c: LibraryCard) => {
  const parts = [CONTENT_TYPE_LABEL[c.contentType]];
  if (c.contentType === 'domain' && c.domain) parts.push(`${c.domain} L${c.level ?? 1}`);
  if ((c.contentType === 'subclass' || c.contentType === 'class') && c.className) parts.push(c.className);
  // v0.14.0: show the tier AND the family a subclass card is linked into, so an author can see the
  // grouping in the list instead of finding out at level-up whether it worked.
  if (c.contentType === 'subclass') parts.push(SUBCLASS_TIER_LABEL[c.tier ?? 1], `“${subclassFamilyName(c)}”`);
  return parts.join(' · ');
};

/** v0.14.0: the advisory line for an expansion whose subclasses are missing tiers — never blocking. */
function incompleteSubclassWarning(cards: LibraryCard[]): string | null {
  const bad = incompleteSubclasses(cards);
  if (!bad.length) return null;
  const lines = bad.map((f) => `• ${f.name}, missing ${f.missing.join(' and ')}`).join('\n');
  return `A subclass needs all three cards. Foundation, Specialization and Mastery, to level up properly. These are incomplete:\n\n${lines}\n\nYou can still use this pack; the missing tiers just won't be granted on level-up.`;
}

export function LibraryScreen() {
  const router = useRouter();
  const [expansions, setExpansions] = useState<Expansion[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<{ index: number | 'new'; config: CardConfig; draft?: CardDraft } | null>(null);
  /** v0.35.2: an ancestry just saved as one whole picture, waiting to be told what that costs. */
  const [fullImageAncestry, setFullImageAncestry] = useState<string | null>(null);
  const [choosingType, setChoosingType] = useState(false);
  /** v0.42.1: which page of the (sorted) card list is showing. */
  const [cardPage, setCardPage] = useState(0);
  /**
   * v0.42.1: the cards being sent to another expansion. v0.42.3 made it a LIST, because the gallery
   * can select several and moving them one at a time was never the point of dependency tracking.
   */
  const [movingCards, setMovingCards] = useState<LibraryCard[]>([]);
  /** v0.42.3: the cards a delete is being confirmed for. */
  const [confirmDeleteCards, setConfirmDeleteCards] = useState<LibraryCard[]>([]);
  /** v0.42.3: which of a class's three starting-item lists the card browser is filling. */
  const [pickingItems, setPickingItems] = useState<'fixed' | 'choiceA' | 'choiceB' | null>(null);
  /** v0.42.3: which element row is open in the editor, and the live state of the preview's controls. */
  const [editingFn, setEditingFn] = useState<string | null>(null);
  const [fnStates, setFnStates] = useState<Record<string, FunctionState>>({});
  /** v0.42.1: the campaign settings editor, and the warning that leads to it. */
  const [campaignForm, setCampaignForm] = useState(false);
  const [campaignWarn, setCampaignWarn] = useState(false);
/**
   * THE DM PALETTE, AND NOT THE DM MODE (v0.42.3, owner).
   *
   * v0.42.1 read the persisted DM flag here and offered to turn it on. The DM playtesters disliked
   * both halves: they wanted the colours the library already suits, and they did not want opening an
   * expansion to re-label their main menu, still less to be asked about it in a pop-up on the way in.
   *
   * So it is a constant. This screen is grey because authoring content looks better grey, and it
   * changes nothing anywhere else in the app.
   */
  const dm = true;
  const [metaForm, setMetaForm] = useState<'new' | 'edit' | null>(null);
  /**
   * DELETING AN EXPANSION (v0.42.3, owner: "deleting an expansion must be a very hard thing to pull
   * off just like entire campaigns in the DM UI are hard to delete").
   *
   * Exactly the campaign flow, because it is exactly the same kind of loss: hold the row, choose
   * Delete from its menu, confirm what goes, then confirm again against a dialog that shouts. It was
   * one button at the bottom of the editor next to Add card, which is a mis-tap away from months of
   * work, and it is not there any more.
   */
  const [holdingExp, setHoldingExp] = useState<Expansion | null>(null);
  const [confirmDeleteExp, setConfirmDeleteExp] = useState<{ exp: Expansion; step: 1 | 2 } | null>(null);
  const [confirmDeleteCard, setConfirmDeleteCard] = useState<number | null>(null);
  const [message, setMessage] = useState<{ title: string; body: string } | null>(null);
  const [nfcSend, setNfcSend] = useState<{ content: RkpContent; label: string } | null>(null);
  // v0.14.0: an incomplete subclass (missing Foundation / Specialization / Mastery) can still be saved
  // and enabled — but the player is told, both when they switch a pack on and when they open it.
  const warnIncomplete = (e: Expansion) => {
    const body = incompleteSubclassWarning(e.cards);
    if (body) setMessage({ title: 'Incomplete subclass', body });
  };
  const openExpansion = (e: Expansion) => {
    setSelectedId(e.id);
    warnIncomplete(e);
  };
  const toggleExpansion = (e: Expansion, turningOn: boolean) => {
    playSfx('buttonTap');
    void persist({ ...e, enabled: turningOn });
    if (turningOn) warnIncomplete(e);
  };
  // v0.13.2 (#359): NFC RECEIVING moved to the character sheet (a DM taps a card to a player on their
  // sheet). The library only SENDS single cards + shares expansions via Import/Export  one a friend shared with you.
  const nfcOn = nfcModulesPresent();

  const reload = useCallback(() => {
    let live = true;
    // v0.12.2: seed the bundled official expansions (e.g. The Void) BEFORE listing so they appear in
    // the hub. Idempotent + best-effort — swallow errors so a web/storage hiccup never blanks the list.
    seedOfficialExpansions()
      .catch(() => {})
      .then(() => listExpansions())
      .then((all) => { if (live) setExpansions(all); });
    return () => { live = false; };
  }, []);
  useFocusEffect(reload);

  const selected = expansions?.find((e) => e.id === selectedId) ?? null;
  /**
   * The palette this screen paints in: grey while in DM mode, gold otherwise.
   *
   * Mapped by ROLE rather than aliased, because the two palettes do not share key names: the DM one
   * has no gold in it at all, which is the point of it.
   */
  const P = dm
    ? { goldText: DmRune.accent, goldEdge: DmRune.line, bronze: DmRune.accentDim, ivory: DmRune.ivory, muted: DmRune.muted }
    : { goldText: Rune.goldText, goldEdge: Rune.goldEdge, bronze: Rune.bronze, ivory: Rune.ivory, muted: Rune.muted };

  const persist = useCallback(async (exp: Expansion) => {
    await saveExpansion(exp);
    setExpansions((all) => [...(all ?? []).filter((e) => e.id !== exp.id), exp].sort((a, b) => a.name.localeCompare(b.name)));
  }, []);

  /**
   * A pack from a folder of pictures (v0.34.8, owner).
   *
   * Each selected image becomes its own card, rendered edge to edge, which is what the Daggerheart
   * card creator's exports already are. They arrive untitled and generic deliberately: this is the
   * bulk step, and the editing pass afterwards is where each one is given a name and told what it is.
   * `expansionShareIssues` is the gate that stops a pack leaving before then.
   */
  const addCardsFromImages = useCallback(async (exp: Expansion) => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 1 });
      if (res.canceled || !res.assets.length) return;
      const owned = await Promise.all(res.assets.map((a) => ownImage(a.uri)));
      const cards: LibraryCard[] = owned.map((uri) => ({ id: newId('lc'), contentType: 'generic', title: '', text: '', imageUri: uri, fullImage: true }));
      playSfx('customCardCreate');
      await persist({ ...exp, cards: [...exp.cards, ...cards] });
      showToast(cards.length === 1 ? 'Added 1 image card. Name it before sharing.' : `Added ${cards.length} image cards. Name them before sharing.`, 'success');
    } catch {
      showToast('Those pictures could not be added.', 'error');
    }
  }, [persist]);

  const onImport = useCallback(async () => {
    try {
      const res = await importExpansionRkp();
      if (!res) return;
      reload();
      const verb = res.decision === 'add' ? 'imported' : res.decision === 'update' ? 'updated to the new version' : res.decision === 'skip' ? 'skipped (you have a newer version)' : 'already up to date';
      setMessage({ title: res.expansion.name, body: `Expansion ${verb}.` });
    } catch (e) {
      setMessage({ title: 'Import failed', body: e instanceof Error ? e.message : 'Could not read that file.' });
    }
  }, [reload]);

  if (!expansions) return <LoadingScreen label="Opening the library" />;

  // ---- card editor overlay (author/edit a card inside the selected expansion) ----
  if (editingCard && selected) {
    const existing = typeof editingCard.index === 'number' ? selected.cards[editingCard.index] : undefined;
    const cfg = editingCard.config;
    const initial: CardDraft | undefined = existing
      ? {
          title: existing.title,
          text: existing.text,
          imageUri: existing.imageUri,
          color: existing.color ?? null,
          effects: existing.effects ?? [],
          typeLabel: existing.typeLabel,
          fullImage: existing.fullImage,
          // migrate legacy single-body cards into one section so editing keeps their text
          sections: existing.sections ?? (existing.text ? [{ body: existing.text }] : undefined),
        }
      : undefined;
    const isAncestry = cfg.contentType === 'ancestry';
    /**
     * A FEATURE CARD is the only card with elements (v0.42.3, owner), so it is the only card whose
     * editor offers "+ Add function", and the only one that may not be replaced by a whole picture:
     * a picture cannot be pressed, and the elements are the entire reason the card exists.
     */
    const isFeature = cfg.contentType === 'feature';
    /** Which ids one of the three starting-item lists is holding. */
    const itemIdsFor = (spec: CustomClassSpec | undefined, which: 'fixed' | 'choiceA' | 'choiceB'): string[] =>
      (which === 'fixed' ? spec?.fixedItemIds : which === 'choiceA' ? spec?.choiceAItemIds : spec?.choiceBItemIds) ?? [];
    /** Put a picked card into one of them, without letting the same card in twice. */
    const addStartingItem = (which: 'fixed' | 'choiceA' | 'choiceB', id: string) =>
      setEditingCard((st) => {
        if (!st) return st;
        const spec = st.config.classSpec ?? EMPTY_CLASS_SPEC;
        const key = which === 'fixed' ? 'fixedItemIds' : which === 'choiceA' ? 'choiceAItemIds' : 'choiceBItemIds';
        const cur = itemIdsFor(spec, which);
        if (cur.includes(id)) return st;
        return { ...st, config: { ...st.config, classSpec: { ...spec, [key]: [...cur, id] } } };
      });
    /** The card as it will be saved, so the preview above is the card and not an impression of it. */
    const previewCard = (d: CardDraft): LibraryCard => ({
      id: existing?.id ?? 'preview',
      contentType: cfg.contentType,
      title: d.title,
      text: d.text,
      imageUri: d.imageUri,
      color: d.color,
      typeLabel: cfg.typeLabel ?? d.typeLabel,
      sections: d.sections,
      functions: cfg.functions,
      domain: cfg.domain,
      level: cfg.level,
      className: cfg.className,
      subclass: cfg.subclass,
      tier: cfg.tier,
      weapon: cfg.weapon,
      armor: cfg.armor,
      fullImage: d.fullImage,
    });
    return (
      <CardEditor
        kindLabel={cfg.typeLabel || CONTENT_TYPE_LABEL[cfg.contentType]}
        previewSubtitle={cfg.contentType === 'subclass' ? SUBCLASS_TIER_LABEL[cfg.tier ?? 1] : undefined}
        initial={initial}
        sectioned
        sectionsConfig={isAncestry ? { ancestryFeatures: true } : undefined}
        noFullImage={isFeature}
        /**
         * THE PREVIEW (v0.42.3, owner): the real `LibraryForgedCard`, which is the component the
         * character sheet draws, with this card's own elements and live state. Not a mock-up of the
         * card and not a swatch in a panel: what is approved here is what ships.
         */
        renderPreview={(d) => (
          <LibraryForgedCard
            card={previewCard(d)}
            functionStates={fnStates}
            onFunction={(fid, next) => setFnStates((st) => ({ ...st, [fid]: next }))}
          />
        )}
        sectionFunctions={
          isFeature
            ? {
                list: cfg.functions ?? [],
                editingId: editingFn,
                onEdit: setEditingFn,
                onChange: (functions) => setEditingCard((st) => (st ? { ...st, config: { ...st.config, functions } } : st)),
                renderEditor: (fn) => (
                  <FunctionEditor
                    fn={fn}
                    advance={(cfg.advances ?? []).find((a) => a.functionId === fn.id)}
                    onChange={(next) => setEditingCard((st) => (st ? { ...st, config: { ...st.config, functions: (st.config.functions ?? []).map((x) => (x.id === fn.id ? next : x)) } } : st))}
                    onAdvance={(a) =>
                      setEditingCard((st) =>
                        st
                          ? { ...st, config: { ...st.config, advances: [...(st.config.advances ?? []).filter((x) => x.functionId !== fn.id), ...(a ? [a] : [])] } }
                          : st,
                      )
                    }
                  />
                ),
              }
            : undefined
        }
        // v0.30.0: the details block, rewritten as the form below is filled in.
        generatedBody={formMarkdown(cfg)}
        extraField={
          <ContentConfig
            config={cfg}
            card={existing ?? { id: 'new', contentType: cfg.contentType, title: '', text: '', imageUri: null }}
            siblings={selected.cards.filter((c) => c.id !== existing?.id)}
            onPickItems={setPickingItems}
            onChange={(config) => setEditingCard((s) => (s ? { ...s, config } : s))}
          />
        }
        overlay={
          /**
           * THE CARD BROWSER, picking a class's starting items (v0.42.3, owner).
           *
           * The same component the sheet's Add Gear opens, in a select mode: adding a card here puts
           * its id in one of the class's three lists instead of on a character. It already draws real
           * cards, already has the category tabs, and already surfaces this expansion's own records,
           * which is exactly why it is reused rather than rebuilt as another chip cloud.
           */
          pickingItems ? (
            <GearBrowser
              acquiredIds={new Set(itemIdsFor(cfg.classSpec, pickingItems))}
              enabledExpansionIds={[selected.id]}
              onAdd={(id) => { addStartingItem(pickingItems, id); setPickingItems(null); }}
              onAddCustom={(lc) => { addStartingItem(pickingItems, lc.id); setPickingItems(null); }}
              onClose={() => setPickingItems(null)}
            />
          ) : undefined
        }
        onCancel={() => setEditingCard(null)}
        onSave={(d) => {
          const cards = [...selected.cards];
          const base: LibraryCard = {
            id: existing?.id ?? newId('lc'),
            contentType: cfg.contentType,
            title: d.title,
            text: d.text,
            imageUri: d.imageUri,
            color: d.color,
            effects: d.effects,
            typeLabel: cfg.contentType === 'generic' ? cfg.typeLabel : d.typeLabel,
            sections: d.sections,
            domain: cfg.contentType === 'domain' ? cfg.domain : undefined,
            level: cfg.contentType === 'domain' ? cfg.level ?? 1 : undefined,
            className: cfg.contentType === 'class' ? undefined : cfg.className,
            linkSubclass: cfg.contentType === 'class' ? undefined : cfg.linkSubclass,
            classRole: cfg.classRole,
            classSpec: cfg.contentType === 'class' ? cfg.classSpec : undefined,
            functions: meaningfulFunctions(cfg.functions).length ? meaningfulFunctions(cfg.functions) : undefined,
            functionCategory: cfg.functionCategory?.label.trim() ? cfg.functionCategory : undefined,
            // v0.42.1: an advancement whose element has gone is dropped with it, never left dangling.
            advances: (cfg.advances ?? []).filter((a) => meaningfulFunctions(cfg.functions).some((f) => f.id === a.functionId)).length
              ? (cfg.advances ?? []).filter((a) => meaningfulFunctions(cfg.functions).some((f) => f.id === a.functionId))
              : undefined,
            subclass: cfg.contentType === 'subclass' ? cfg.subclass : undefined,
            spellcastTrait: cfg.contentType === 'subclass' ? cfg.spellcastTrait : undefined,
            tier: cfg.contentType === 'subclass' ? cfg.tier ?? 1 : undefined,
            ancestryEffectTrait: cfg.contentType === 'ancestry' ? cfg.ancestryEffectTrait : undefined,
            weapon: cfg.contentType === 'weapon' ? cfg.weapon : undefined,
            armor: cfg.contentType === 'armor' ? cfg.armor : undefined,
            fullImage: d.fullImage, // v0.34.8: the card IS the picture
          };
          if (typeof editingCard.index === 'number') cards[editingCard.index] = base;
          else cards.push(base);
          void persist({ ...selected, cards });
          setEditingCard(null);
        }}
      />
    );
  }

  // ---- official expansion detail (read-only) ----
  // v0.12.2: bundled expansions (The Void) are read-only — name/author/description + card count + the
  // global enable toggle only. No edit/share/add/delete, no editable card list. Their cards live in the
  // catalog (the record's own `cards` is empty), so the count comes from there.
  if (selected && (selected.official || isOfficialExpansion(selected.id))) {
    const cardCount = expansionCardCount(selected);
    const on = isEnabledForCreation(selected);
    return (
      <AppScreen dm={dm} title={selected.name} onBack={() => setSelectedId(null)}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 24 }}>
          <ChamferBox chamfer={10} fill="rgba(14,17,22,0.9)" stroke="rgba(218,162,73,0.4)" strokeWidth={1.2} style={{ padding: 12, gap: 8 }}>
            <Text style={{ color: P.goldText, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.6 }}>by {selected.author || 'unknown'} · {cardCount} card{cardCount === 1 ? '' : 's'}</Text>
            {selected.description ? <Text style={{ color: P.muted, fontSize: 12.5, fontFamily: Body.regular, lineHeight: 18 }}>{selected.description}</Text> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: P.ivory, fontSize: 13, fontFamily: Body.bold }}>{on ? 'Enabled for creation' : 'Disabled'}</Text>
                <Text style={{ color: P.muted, fontSize: 10.5, fontFamily: Body.regular, marginTop: 2 }}>Official expansion, read only</Text>
              </View>
              <ExpansionToggle on={on} onToggle={() => toggleExpansion(selected, !on)} />
            </View>
          </ChamferBox>
        </ScrollView>
      </AppScreen>
    );
  }

  // ---- expansion detail ----
  if (selected) {
    const s = expansionSummary(selected);
    /**
     * The header, re-laid out (v0.42.3, owner: "this entire interface is pretty ass").
     *
     * What it was: three identical ghost buttons over a wall of rows, one of them labelled "Campaign",
     * which said nothing and then walked you through two pop-ups. What it is:
     *
     *  - the pack's own line (author, version, count), then its description, as one quiet block
     *  - ONE row of actions, in the order you would use them: edit the pack, set its campaign rules,
     *    send it. Labels that say what they do. Campaign settings opens in one tap.
     *  - the destructive action is NOT here. It lives on the hold menu, like a DM campaign's does.
     *
     * The gallery gets everything below, because the cards are what the screen is about, and the two
     * creation buttons close it off at the bottom where the primary action belongs.
     */
    const share = (cards: LibraryCard[]) => {
      playSfx('buttonTap');
      const pack = cards === selected.cards ? selected : { ...selected, cards };
      const issues = expansionShareIssues(pack);
      if (issues.length) { setMessage({ title: 'Finish these cards first', body: `${issues.slice(0, 6).join('\n')}${issues.length > 6 ? `\nand ${issues.length - 6} more.` : ''}` }); return; }
      // v0.34.8: the pictures travel INSIDE the file. A card's imageUri is a path into this phone, so
      // a pack shared without this arrived with every image blank.
      void embedExpansionImages(pack)
        .then((packed) => exportRkp({ kind: 'expansion', payload: packed }, pack.name))
        .catch(() => showToast('Could not share that expansion.', 'error'));
    };
    return (
      <AppScreen dm={dm} title={selected.name} onBack={() => setSelectedId(null)}>
        <View style={{ flex: 1, gap: Gap.group }}>
          <View style={{ gap: Gap.intra }}>
            <View style={{ gap: Gap.hair }}>
              <Text style={{ color: P.goldText, fontSize: 10.5, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                by {selected.author || 'unknown'} · v{selected.version} · {s.cardCount} card{s.cardCount === 1 ? '' : 's'}
              </Text>
              {selected.description ? (
                <Text style={{ color: P.muted, fontSize: 12, fontFamily: Body.regular, lineHeight: 17 }}>{selected.description}</Text>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <RuneButton dm={dm} label="Edit details" kind="ghost" dense height={36} style={{ flex: 1 }} onPress={() => setMetaForm('edit')} />
              {/* v0.42.3 (owner): the real name, and one tap. */}
              <RuneButton dm={dm} label="Campaign settings" kind="ghost" dense height={36} style={{ flex: 1.4 }} onPress={() => { playSfx('buttonTap'); setCampaignForm(true); }} />
              {/* v0.34.8 (owner): saving a half-finished pack is fine, sending one is not. */}
              <RuneButton dm={dm} label="Share pack" kind="ghost" dense height={36} style={{ flex: 1 }} onPress={() => share(selected.cards)} />
            </View>
          </View>

          {/* v0.42.3 (owner): the cards, drawn as cards. See `expansion-gallery-view`. */}
          <ExpansionGallery
            cards={selected.cards}
            dm={dm}
            actions={{
              onEdit: (c) =>
                setEditingCard({
                  index: selected.cards.findIndex((x) => x.id === c.id),
                  config: { advances: c.advances, contentType: c.contentType, domain: c.domain, level: c.level, className: c.className, linkSubclass: c.linkSubclass, classRole: c.classRole, subclass: c.subclass, spellcastTrait: c.spellcastTrait, classSpec: c.classSpec, functions: c.functions, functionCategory: c.functionCategory, tier: c.tier, ancestryEffectTrait: c.ancestryEffectTrait, weapon: c.weapon, armor: c.armor, typeLabel: c.typeLabel },
                }),
              onShare: (cs) => {
                // One card goes as a card (it can travel by NFC); several go as a pack of their own.
                if (cs.length === 1) { void embedCardImageForNfc(cs[0]).then((card) => setNfcSend({ content: { kind: 'card', payload: card }, label: card.title || 'card' })); return; }
                share(cs);
              },
              onMove: (cs) => setMovingCards(cs),
              onDelete: (cs) => setConfirmDeleteCards(cs),
            }}
          />

          <View style={{ gap: 8, paddingBottom: 4 }}>
            {/* v0.34.8 (owner): a whole folder of finished card faces becomes a whole pack in one go. */}
            <RuneButton dm={dm} label="Add cards from images" kind="ghost" dense height={36} onPress={() => void addCardsFromImages(selected)} />
            <RuneButton dm={dm} label="Add card" kind="primary" height={46} onPress={() => setChoosingType(true)} />
          </View>
        </View>

        {metaForm === 'edit' ? (
          <MetaForm initial={selected} onCancel={() => setMetaForm(null)} onSave={(m) => { void persist({ ...selected, ...m }); setMetaForm(null); }} />
        ) : null}
        {choosingType ? (
          <TypeChooser onPick={(t) => { setChoosingType(false); setEditingCard({ index: 'new', config: defaultConfigFor(t) }); }} onClose={() => setChoosingType(false)} />
        ) : null}
        {confirmDeleteCards.length ? (
          <PopupDialog
            title={confirmDeleteCards.length === 1 ? 'Delete card?' : `Delete ${confirmDeleteCards.length} cards?`}
            body={confirmDeleteCards.length === 1
              ? `"${confirmDeleteCards[0].title || 'Untitled'}" will be removed from this expansion.`
              : 'They will be removed from this expansion. Anything that pointed at them keeps its own text.'}
            confirmLabel="Delete"
            destructive
            onConfirm={() => {
              const gone = new Set(confirmDeleteCards.map((c) => c.id));
              void persist({ ...selected, cards: selected.cards.filter((c) => !gone.has(c.id)) });
              setConfirmDeleteCards([]);
            }}
            onCancel={() => setConfirmDeleteCards([])} />
        ) : null}

        {movingCards.length ? (
          <MoveCardModal
            cards={movingCards}
            source={selected.cards}
            targets={(expansions ?? []).filter((e) => e.id !== selected.id && !isOfficialExpansion(e.id))}
            onClose={() => setMovingCards([])}
            onPick={(dest, mode) => {
              const r = moveCards(selected.cards, dest.cards, movingCards.map((c) => c.id), mode);
              setMovingCards([]);
              // Two saves, source first, so a crash between them leaves the cards duplicated rather
              // than lost. Duplicates the author can delete; a hole they cannot get back.
              void persist({ ...dest, cards: r.to })
                .then(() => (mode === 'move' ? persist({ ...selected, cards: r.from }) : undefined))
                .then(() => showToast(`${r.moved.length === 1 ? '1 card' : `${r.moved.length} cards`} ${mode === 'move' ? 'moved' : 'copied'} to ${dest.name}.`, 'success'))
                .catch(() => showToast('Could not send that card.', 'error'));
            }}
          />
        ) : null}
        {/* v0.42.1 (owner): the warning. Campaign settings do not add anything, they TAKE things away
            from everyone who enables the pack, which is not what an expansion has ever done before. */}
        {campaignWarn ? (
          <PopupDialog
            title="This limits other people"
            body={'Campaign settings travel with the expansion. Anyone who enables it will only see the classes, ancestries, communities and steps you leave available, and they will be told which pack is limiting them. Nothing is taken away until you turn limits on inside.'}
            confirmLabel="Set them up"
            cancelLabel="Not now"
            onConfirm={() => { setCampaignWarn(false); setCampaignForm(true); }}
            onCancel={() => setCampaignWarn(false)}
          />
        ) : null}
        {campaignForm ? (
          <CampaignSettingsForm
            exp={selected}
            onChange={(campaign) => void persist({ ...selected, campaign })}
            onClose={() => setCampaignForm(false)}
          />
        ) : null}
        {nfcSend ? <NfcSendModal content={nfcSend.content} label={nfcSend.label} onClose={() => setNfcSend(null)} /> : null}
        {message ? <PopupDialog title={message.title} body={message.body} confirmLabel="OK" onConfirm={() => setMessage(null)} onCancel={() => setMessage(null)} /> : null}
        {/* v0.35.2 (owner): a whole-picture ancestry cannot be half struck through. Saying so at the
            moment it is saved is the only time the author can still choose the other shape. */}
        {fullImageAncestry ? (
          <PopupDialog
            title="One picture, no cross-outs"
            body={`${fullImageAncestry} is a whole card image, so RuneKeep cannot see where its two features are. In a mixed ancestry the app strikes through the half a character does not keep, and it will not be able to do that here: the player will have to remember which feature is theirs. Writing the two features out as text instead lets the app cross the right one out for them.`}
            confirmLabel="OK"
            cancelLabel="OK"
            onConfirm={() => setFullImageAncestry(null)}
            onCancel={() => setFullImageAncestry(null)}
          />
        ) : null}
      </AppScreen>
    );
  }

  // ---- hub ----
  // v0.12.2: bundled official expansions (The Void) list FIRST in their own read-only section; the
  // player's authored/received expansions follow under "My expansions".
  const officialExps = expansions.filter((e) => e.official === true);
  const customExps = expansions.filter((e) => !e.official);
  return (
    <AppScreen dm={dm} title="Card library" onBack={() => router.back()}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 16 }}>
        <Pressable onPress={() => { playSfx('enterCardViewer'); router.push('/gallery'); }} accessibilityRole="button" accessibilityLabel="Browse the card archive">
          {({ pressed }) => (
            <ChamferBox chamfer={12} fill={pressed ? 'rgba(20,24,31,0.95)' : 'rgba(14,17,22,0.9)'} stroke="rgba(218,162,73,0.5)" strokeWidth={1.3} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 14 }}>
              <Svg width={24} height={24} viewBox="0 0 24 24">
                <Path d="M4 5 h12 v14 h-12 z M8 5 v14 M20 8 v11 h-12" fill="none" stroke={P.goldEdge} strokeWidth={1.6} strokeLinejoin="round" />
              </Svg>
              <View style={{ flex: 1 }}>
                <Text style={{ color: P.ivory, fontSize: 16, fontFamily: Display.black, letterSpacing: 0.6, textTransform: 'uppercase' }}>Card archive</Text>
                <Text style={{ color: P.muted, fontSize: 12, fontFamily: Body.medium }}>Every system card, weapon & armor</Text>
              </View>
            </ChamferBox>
          )}
        </Pressable>

        {officialExps.length > 0 ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <Text style={{ color: P.goldText, fontSize: 12, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>Official expansions</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(218,162,73,0.25)' }} />
            </View>
            {officialExps.map((e) => (
              <ExpansionRow
                key={e.id}
                e={e}
                on={isEnabledForCreation(e)}
                cardCount={expansionCardCount(e)}
                onOpen={() => openExpansion(e)}
                onToggle={() => toggleExpansion(e, !isEnabledForCreation(e))}
              />
            ))}
          </>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <Text style={{ color: P.goldText, fontSize: 12, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>My expansions</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(218,162,73,0.25)' }} />
        </View>

        {customExps.length === 0 ? (
          <Text style={{ color: P.muted, fontSize: 12.5, fontFamily: Body.medium, textAlign: 'center', paddingVertical: 14, lineHeight: 18 }}>
            No expansions yet. Create one to author homebrew cards,{'\n'}or import one a friend shared with you.
          </Text>
        ) : (
          customExps.map((e) => (
            <ExpansionRow
              key={e.id}
              e={e}
              on={isExpansionEnabled(e)}
              cardCount={expansionSummary(e).cardCount}
              onOpen={() => openExpansion(e)}
              onToggle={() => toggleExpansion(e, !isExpansionEnabled(e))}
              onHold={() => { playSfx('cardSelect'); setHoldingExp(e); }}
            />
          ))
        )}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 10, paddingTop: 8, paddingBottom: 6 }}>
        <RuneButton dm={dm} label="Import a file" kind="ghost" height={46} style={{ flex: 1 }} onPress={onImport} />
        <RuneButton dm={dm} label="New expansion" kind="primary" height={46} style={{ flex: 1 }} onPress={() => setMetaForm('new')} />
      </View>

      {metaForm === 'new' ? (
        <MetaForm
          onCancel={() => setMetaForm(null)}
          onSave={(m) => {
            const exp: Expansion = { id: newId('exp'), createdAt: new Date().toISOString(), cards: [], ...m };
            void persist(exp).then(() => setSelectedId(exp.id));
            setMetaForm(null);
          }}
        />
      ) : null}
      {message ? <PopupDialog title={message.title} body={message.body} confirmLabel="OK" onConfirm={() => setMessage(null)} onCancel={() => setMessage(null)} /> : null}

      {/* The hold menu. Delete lives HERE and nowhere else, the same rule the DM campaigns follow. */}
      {holdingExp ? (
        <PopupDialog
          dm
          title={holdingExp.name}
          body="Open it to author its cards, or remove it from this device."
          confirmLabel="Open it"
          cancelLabel="Close"
          actionsGap={10}
          onConfirm={() => { const e = holdingExp; setHoldingExp(null); openExpansion(e); }}
          onCancel={() => setHoldingExp(null)}>
          <View style={{ marginTop: 14 }}>
            <RuneButton dm label="Delete expansion" kind="ghost" height={40} onPress={() => { const e = holdingExp; setHoldingExp(null); setConfirmDeleteExp({ exp: e, step: 1 }); }} />
          </View>
        </PopupDialog>
      ) : null}

      {confirmDeleteExp?.step === 1 ? (
        <PopupDialog
          dm
          destructive
          title={`Delete ${confirmDeleteExp.exp.name}?`}
          body={`All ${confirmDeleteExp.exp.cards.length} of its cards go with it. Characters already built with them keep their copies, and any file you have exported is untouched.`}
          confirmLabel="Delete"
          onConfirm={() => setConfirmDeleteExp({ exp: confirmDeleteExp.exp, step: 2 })}
          onCancel={() => setConfirmDeleteExp(null)}
        />
      ) : confirmDeleteExp?.step === 2 ? (
        <PopupDialog
          dm
          destructive
          title="THIS CANNOT BE UNDONE"
          body={`DELETE ${confirmDeleteExp.exp.name.toUpperCase()} AND ALL ${confirmDeleteExp.exp.cards.length} OF ITS CARDS?`}
          confirmLabel="DELETE IT"
          cancelLabel="KEEP IT"
          onConfirm={() => {
            const id = confirmDeleteExp.exp.id;
            setConfirmDeleteExp(null);
            setSelectedId(null);
            if (isOfficialExpansion(id)) return; // a bundled pack is never deleted, only switched off
            void deleteExpansion(id).then(reload).then(() => showToast(`${confirmDeleteExp.exp.name} deleted`, 'success'));
          }}
          onCancel={() => setConfirmDeleteExp(null)}
        />
      ) : null}
    </AppScreen>
  );
}
