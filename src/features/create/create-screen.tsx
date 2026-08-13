import * as ImagePicker from 'expo-image-picker';

import { ownImage } from '@/lib/owned-image';
import { type Href, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Platform, Pressable, Text, TextInput, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path, Polyline } from 'react-native-svg';

import { AppScreen } from '@/components/app-screen';
import { CardEditor, type CardDraft } from '@/components/card-editor';
import { ChamferBox } from '@/components/chamfer-box';
import { intentFor } from '@/lib/keybinds';
import { ChamferedImage } from './components/chamfered-image';
import { PopupDialog } from '@/components/popup-dialog';
import { RuneButton } from '@/components/rune-button';
import { showToast } from '@/components/toast';
import { type ClassName, CLASSES, classColor, classInfo, isVoidClass } from '@/constants/identity';
import { Body, Rune } from '@/constants/theme';
import { CATALOG, cardById } from '@/data/catalog';
import { type TraitKey } from '@/features/character-sheet/character';
import { type CharacterFile, type CustomCardDef, newCharacterId, toSheetCharacter } from '@/lib/character-file';
import { getCharacter, saveCharacter } from '@/lib/character-store';
import { classExpansion, seedOfficialExpansions } from '@/lib/expansions';
import { contentForCreation, type CreationContent, type Expansion, featureSectionIndexes, isEnabledForCreation, type LibraryCard, subclassFamilyKey } from '@/lib/library';
import { hasStrikeLines } from '@/data/ancestry-trait-regions';
import { VOID_ANCESTRY_FACE } from '@/data/void-ancestries';
import { LibraryForgedCard } from './components/library-forged-card';
import { listExpansions, saveExpansion } from '@/lib/library-store';
import { BASE_PICK_ID, ExpansionPicker } from './expansion-picker';
import { playSfx } from '@/lib/sfx';
import { CLASS_CARDS } from './components/class-cards';
import { featurePages, spellcastTraitForSubclass } from '@/data/class-data';
import { ForgedArmorCard, ForgedCard, ForgedLootCard, ForgedTextCard, ForgedWeaponCard } from './components/forged-card';
import { lootById } from '@/data/loot-data';
import { PRIMARY_WEAPONS, SECONDARY_WEAPONS, TIER1_ARMOR, type WeaponKind, weaponById } from '@/data/equipment-data';
import { CLASS_INVENTORY, isConsumableName, itemOptionId, itemTitle } from '@/data/class-inventory-data';
import { itemColor } from '@/data/item-colors';

import { useForgedSnapshots } from './components/forged-snapshots';
import { StraightCarousel, type StraightCarouselHandle, type StraightFace, type StraightItem } from './components/straight-carousel';
import { type DeckKey, type Draft, isCardDeck, isCarouselDeck, nextMixSlot } from './create-types';
import { clearDraft, isResumable, loadDraft, saveDraft } from '@/lib/draft-store';
import { shouldShow } from '@/lib/onboarding-store';

import { campaignWarnings } from '@/lib/campaign-warnings';
import { ImageCropper } from '@/components/image-cropper';
import { assembleClasses, faceMark } from '@/lib/custom-class-pages';
import { classKeyOf } from '@/lib/custom-class';
import { type CampaignSettings, campaignNote, EMPTY_CAMPAIGN_SETTINGS, isOptionOn, isStepOn, mergeSettings, optionKey, setKeys, stepKey, syncSteps, toggleKey } from '@/lib/campaign-settings';
import { DECKS, deckDone, decksFor, EMPTY, MIXED_ANCESTRY_ID, SINGLE_ANCESTRY_ID } from './create-constants';
import { CharacterizeTraitsTab, LevelTab } from './characterize-tabs';
import { canSkipClass, cardedItems, carriesThresholds, carryItems, type CarryItem, heldEffectsFor, isGenericName, keptLevel, levelForStatBlock } from '@/lib/characterize';
import { SkipMenu, SkipMenuButton, type SkipStepRow } from './skip-menu';
import { addTemplate, loadAdversaries, saveAdversaries } from '@/lib/adversary-library';
import { addMembers, type Party } from '@/lib/party';
import { getParty, saveParty } from '@/lib/party-store';
import { type Combatant } from '@/lib/session';
import { getEncounter, getSession, saveEncounter } from '@/lib/session-store';
import { initialVitals } from '@/lib/dm-vitals';
import { mutedCardColor } from '@/components/card-editor';
import { CreateLoader, DeckLoader } from './create-loaders';
import { DeckRail } from './create-rail';
import { DeckTab, SectionDivider, Segmented } from './create-ui';
import { ExperiencesTab } from './experiences-tab';
import { QuickCardFlow } from '@/features/character-sheet/sheet/quick-card-flow';
import type { CardEffect } from '@/lib/modifiers';
import { TraitsTab } from './traits-tab';

/**
 * The decks a campaign may cut options from (v0.42.1).
 *
 * The picked-content decks and nothing else: gear and traits are the character's own business, and a
 * DM who wants to limit the weapons on offer turns the whole step off. Keys match `optionKey`.
 */
const CAMPAIGN_DECKS: string[] = ['class', 'subclass', 'ancestry', 'community', 'domains'];

/**
 * The BUNDLED class a homebrew one borrows its look from (v0.42.6).
 *
 * Every derived number, the class colour, the banner and a dozen keyed lookups want a real
 * `ClassName`, and giving a homebrew class a second code path through all of them would be a second
 * copy of the app. So it carries one: the class whose two domains overlap its own most, which is the
 * closest thing to "what is this class like", falling back to the first. Only the LOOK comes from
 * here; every number comes from the author's spec (see `lib/played-class`).
 */
function carrierClassFor(card: LibraryCard): ClassName {
  const want = (card.classSpec?.domains ?? []).map((d) => d.trim().toLowerCase()).filter(Boolean);
  let best = CLASSES[0];
  let bestScore = -1;
  for (const c of CLASSES) {
    const score = (c.domains as string[]).filter((d) => want.includes(d)).length;
    if (score > bestScore) { best = c; bestScore = score; }
  }
  return best.key;
}

// ---------- screen ----------

/**
 * Character creation, forge edition (#102, impeccable craft): a centered column — Details under
 * its divider plaque (name, portrait, full-width add-image), then the Origin divider with five
 * deck tabs, then the STRAIGHT carousel where every choice is made by reading actual cards.
 * Class picks are FORGED cards; deck swaps fade out → load → fade all back in (no travel);
 * selections per deck are remembered, FORGE arms when all five are set.
 */
// v0.10.2 (Feature 3): inline "Skip" cards that end the weapons/armor/inventory carousels. Selecting one
// sets the matching skip flag so the step counts as done with nothing equipped. Module-scope so the
// `items` memo keeps a stable reference.
const SKIP_WEAPONS: StraightItem = { id: 'weapons-skip', label: 'Skip weapons', custom: <ForgedCard title="No weapon" kindLabel="Weapon" body="Skip, start with no weapon equipped." accentDeep={Rune.panel} colorArt="#262A32" multilineTitle /> };
const SKIP_ARMOR: StraightItem = { id: 'armor-skip', label: 'Skip armor', custom: <ForgedCard title="No armor" kindLabel="Armor" body="Skip, start with no armor equipped." accentDeep={Rune.panel} colorArt="#262A32" multilineTitle /> };
/**
 * The "take nothing here" card, one per inventory choice (v0.26.0).
 *
 * Worth spelling out rather than just saying "skip": a player who leaves a choice empty has usually
 * either decided they do not need it or agreed something else with their GM, and both are perfectly
 * ordinary. Saying so stops the option reading like a mistake.
 */
const skipInventoryCard = (choice: 0 | 1): StraightItem => ({
  id: `inventory-skip-${choice}`,
  label: 'No items / Custom',
  custom: (
    <ForgedCard
      title="No items / Custom"
      kindLabel="Item"
      body="Take nothing for this choice, either because you do not need it or because your GM has agreed you carry something of your own instead. You can add your own cards later."
      accentDeep={Rune.panel}
      colorArt="#262A32"
      multilineTitle
    />
  ),
});


// v0.10.3 (B4): a homebrew library card as a creation carousel item — rendered live (no webp) like the
// other forged cards. Stats for weapon/armor are folded into the body.
// `struckIndex` (v0.12.4): strike a section's text (mixed-ancestry crossed-out feature) live in the
// creation carousel — structured ancestries have no webp to overlay, so the cross-out rides the markdown.
const libCardItem = (lc: LibraryCard, struckIndex?: number): StraightItem => {
  /**
   * A PRINTED FACE is ONE image (v0.33.0, corrected v0.33.1).
   *
   * The Hope and Fear ancestries are single bundled bitmaps: there is nothing to lay out and nothing
   * to forge. Handing them over as `custom` made them a live component anyway, and the carousel only
   * mounts a window of slots, so grinding past them rebuilt the element every time the window moved.
   *
   * v0.33.0 gave them `thumb` AND `source`, which made it worse rather than better. Those are meant
   * to be a LOD PAIR of two different files, and the carousel mounts the `source` layer only within
   * two slots of the centre, so every card you passed mounted a SECOND image view onto the very same
   * bundled asset and unmounted it again a moment later. Two views sharing one decoded bitmap, one of
   * them being torn down on a timer, is a blank card waiting to happen, and with a run of these
   * ancestries side by side it happens to several at once, which is what reads as the whole carousel
   * blinking. There is no LOD to have here anyway: both halves were the same picture.
   *
   * So: one persistent image, mounted for as long as the slot is, never swapped. `struckIndex` is
   * deliberately ignored, because a printed face has no text blocks to strike and the carousel draws
   * the mixed-ancestry cross-out over the bitmap itself.
   */
  const face = VOID_ANCESTRY_FACE[lc.id];
  if (face) return { id: lc.id, label: lc.title || 'Card', thumb: face };
  return { id: lc.id, label: lc.title || 'Card', custom: <LibraryForgedCard card={lc} struckIndex={struckIndex} /> };
};

/**
 * A draft is worth persisting/resuming only if SOMETHING was chosen — otherwise resuming would show
 * an empty creator and ask the player to decide about nothing.
 */
function draftHasContent(d: unknown): boolean {
  const x = d as Draft | undefined;
  if (!x) return false;
  return !!x.name?.trim() || DECKS.some((k) => deckDone(k.key, x));
}

/**
 * Height reserved at the bottom of the carousel rail for the SELECT / RANDOM cluster, and the offset
 * the cluster itself sits at. v0.23.0: previously the rail used its full height, so the centred card
 * (the biggest one) grew down into the buttons. Weapons no longer needs its own smaller offset --
 * reserving the band handles the taller filter row for free.
 */
/**
 * v0.27.3: 96 -> 102, and the cluster itself moved from `bottom: 20` to 14.
 *
 * The SELECT / RANDOM cluster is an absolute child, so it ignores AppScreen's padding and its top
 * edge landed a few dp INSIDE the rail, painting over the bottom of the golden gear that rides the
 * rail's edge. 14 is the floor for the cluster: AppScreen reserves 14 at the bottom to clear the
 * frame's gold line. Between the two the gear clears the buttons by about 8dp.
 *
 * Known cost, since the last release bought headroom above the card: the rail is 6dp shorter, and the
 * card rests at a FRACTION of the rail, so roughly 2dp of that headroom goes back.
 */
const CONTROLS_BAND = 102;

/**
 * The class a CLASSLESS characterized character is filed under (v0.36.2).
 *
 * A `CharacterFile` must name a class, because the sheet derives its starting numbers from one. The
 * class step is only skippable when the stat block carries both of the numbers a class would give,
 * so every one of this one's is overwritten and none of it is visible: `classless` also drops its
 * cards and its label off the sheet. It exists to satisfy the shape of the file, nothing else.
 */
const FALLBACK_CLASS: ClassName = 'warrior';

/**
 * Reverse the mixed-ancestry pair (v0.29.0).
 *
 * Two arrows passing each other, which is the plainest way to draw "these two change places". It is
 * disabled, and visibly so, until BOTH ancestries are chosen: with one or none there is no pair to
 * reverse, and the control would be a promise the screen cannot keep.
 */
function MixReverseButton({ mixed, onReverse }: { mixed: { first: string | null; second: string | null }; onReverse: () => void }) {
  const ready = !!mixed.first && !!mixed.second;
  const tint = ready ? Rune.goldBright : 'rgba(147,142,136,0.45)';
  return (
    <Pressable
      onPress={ready ? onReverse : undefined}
      disabled={!ready}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityState={{ disabled: !ready }}
      accessibilityLabel="Reverse the ancestry order"
      accessibilityHint={ready ? 'Swaps which ancestry gives its first feature and which gives its second' : 'Pick both ancestries first'}>
      {({ pressed }) => (
        <ChamferBox
          chamfer={6}
          fill={pressed ? 'rgba(218,162,73,0.22)' : 'rgba(20,24,31,0.7)'}
          stroke={ready ? Rune.goldEdge : 'rgba(147,142,136,0.3)'}
          strokeWidth={1}
          style={{ width: 34, height: 30, alignItems: 'center', justifyContent: 'center', opacity: ready ? 1 : 0.55 }}>
          <Svg width={18} height={18} viewBox="0 0 24 24">
            {/* upper arrow pointing right, lower arrow pointing left */}
            <Polyline points="4,9 20,9" fill="none" stroke={tint} strokeWidth={2} strokeLinecap="round" />
            <Polyline points="16,5 20,9 16,13" fill="none" stroke={tint} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            <Polyline points="20,17 4,17" fill="none" stroke={tint} strokeWidth={2} strokeLinecap="round" />
            <Polyline points="8,13 4,17 8,21" fill="none" stroke={tint} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </ChamferBox>
      )}
    </Pressable>
  );
}

export function CreateScreen() {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  // v0.22.0: the draft used to live ONLY here, so the back chevron, hardware back, a phone call or a
  // low-memory kill destroyed ten steps of work in silence. It is now persisted and guarded.
  const nameRef = useRef<TextInput>(null);
  const draftRef = useRef<Draft>(EMPTY);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [resumeOffer, setResumeOffer] = useState<{ draft: Draft; deck?: string; savedAt: string } | null>(null);
  const [resumeChecked, setResumeChecked] = useState(false);
  const [deck, setDeck] = useState<DeckKey>('class');
  // v0.12.2: per-character EXPANSION PICKER — which content packs this hero can draw from. `picked` holds
  // the chosen expansion ids plus the implicit BASE_PICK_ID; it gates every class/origin/domain list below.
  // v0.13.0 item 6: the picker now lives on the CHARACTER SELECT screen, which passes the picks as the
  // `exp` route param (may be '' = base-only). The in-screen picker remains only as the fallback for
  // entry paths that skip the roster (deep links / older routes).
  /**
   * CHARACTERIZE (v0.36, owner): which encounter entry this creation is replacing.
   *
   * Ids rather than a payload, deliberately. The stat block is read back out of the encounter, so
   * nothing large travels through a URL, a reload cannot lose it, and there is exactly one copy of
   * the truth right up until Forge writes the character.
   */
  const params = useLocalSearchParams<{ exp?: string; encId?: string; cid?: string; side?: string; campaign?: string }>();
  const characterizing = !!params.encId && !!params.cid;
  /**
   * CAMPAIGN MODE (v0.42.3, owner) — the creator, used to say what a campaign ALLOWS.
   *
   * "I LITERALLY MEAN HAVING THE DM GO INTO THE MENU AND MAKE SURE HE DISABLES ALL THE CONTENT HE
   * DOES NOT WANT FROM INSIDE THE CHARACTER CREATOR, LIKE CREATING A CHARACTER BUT INSTEAD OF
   * CHOOSING WHAT THEY WANT, THEY CHOOSE WHAT THEY WANT TO DISABLE."
   *
   * So this is not a second screen that looks like the creator. It IS the creator: the same rail, the
   * same carousels, the same cards, reached with the id of the expansion being authored. A tap turns
   * a card off instead of picking it, a disabled card is greyed exactly the way a left-behind card in
   * the Inherit step already is, and Forge becomes Done.
   *
   * Everything underneath is untouched: `lib/campaign-settings` still stores only what is off, still
   * unions across packs, and still hides a step whose last card went.
   */
  const campaignId = typeof params.campaign === 'string' ? params.campaign : undefined;
  const authoring = !!campaignId;
  const [statBlock, setStatBlock] = useState<Combatant | null>(null);
  const [expansions, setExpansions] = useState<Expansion[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set([BASE_PICK_ID, ...(typeof params.exp === 'string' ? params.exp.split(',').filter(Boolean) : [])]),
  );
  /**
   * The picker never opens while CHARACTERIZING (v0.36.1, owner).
   *
   * A DM turning an adversary into a character has already said which packs they use, in the app's
   * own expansion list, and asking again per adversary is a question with the same answer every
   * time. The picks are taken from that list instead, which is exactly where the Transform step
   * already looks.
   */
  /**
   * v0.42.4 (owner): "remove expansion question pop-ups... character draft saving and character draft
   * pop-ups from this interface, it is not necessary."
   *
   * The rules cover whatever is enabled in the Cards menu, which is the only sensible reading: a DM
   * writing rules for their table is writing them about the content their table has. So the picker
   * never opens while authoring, and the two draft ceremonies below are gated the same way.
   */
  const [pickerOpen, setPickerOpen] = useState(typeof params.exp !== 'string' && !(params.encId && params.cid) && typeof params.campaign !== 'string');
  useEffect(() => {
    let live = true;
    // seed the bundled official expansions (The Void) so they show in the picker, then list all installed.
    seedOfficialExpansions().catch(() => {}).then(() => listExpansions()).then((all) => {
      if (!live) return;
      setExpansions(all);
      // Characterize takes the app's enabled packs as given; nothing is asked and nothing waits.
      if (params.encId && params.cid) setPicked(new Set([BASE_PICK_ID, ...all.filter(isEnabledForCreation).map((e) => e.id)]));
    });
    return () => { live = false; };
  }, [params.encId, params.cid]);
  // v0.10.3 (B4): homebrew content offered in the matching decks — now intersected with the PICKED set, so
  // only content from expansions this hero opted into shows. An official pack contributes nothing here (its
  // cards live in the catalog, gated by the same `picked`); custom expansions contribute their cards.
  const libContent = useMemo<CreationContent | null>(
    () => (expansions ? contentForCreation(expansions.filter((e) => picked.has(e.id))) : null),
    [expansions, picked],
  );
  /**
   * CAMPAIGN SETTINGS in force (v0.42.1, owner).
   *
   * The union of every picked expansion's rules, so a second campaign pack can only narrow what the
   * first one allows. Absent from every pack, which is every character made before this existed,
   * merges to inert and every filter below is a pass-through. See `lib/campaign-settings`.
   */
  /** The expansion being authored, and its rules as they are being edited. */
  const [campaignExp, setCampaignExp] = useState<Expansion | null>(null);
  const [draftCampaign, setDraftCampaign] = useState<CampaignSettings | null>(null);
  useEffect(() => {
    if (!campaignId) return;
    void listExpansions().then((all) => {
      const e = all.find((x) => x.id === campaignId);
      if (!e) return;
      setCampaignExp(e);
      // Authoring always starts with the limits ON: the DM came here to set them.
      setDraftCampaign({ ...(e.campaign ?? EMPTY_CAMPAIGN_SETTINGS), on: true });
    });
  }, [campaignId]);
  const campaign = useMemo(
    // While AUTHORING, the rules in force are the ones being written, not the ones already shipped:
    // a card the DM has just turned off must grey out at once, and turning it back on must un-grey it.
    () => (authoring
      ? (draftCampaign ?? EMPTY_CAMPAIGN_SETTINGS)
      : mergeSettings((expansions ?? []).filter((e) => picked.has(e.id)).map((e) => e.campaign))),
    [expansions, picked, authoring, draftCampaign],
  );
  /** Which packs are doing the limiting, so the player is told rather than left guessing. */
  const campaignNames = useMemo(
    () => (expansions ?? []).filter((e) => picked.has(e.id) && e.campaign?.on).map((e) => e.name),
    [expansions, picked],
  );
  /**
   * The player is TOLD, not left guessing (v0.42.1).
   *
   * A creator missing four classes and a whole step with no explanation reads as a broken app, so the
   * pack doing the limiting is named the moment its rules come into force.
   */
  const noted = useRef('');
  useEffect(() => {
    const note = campaign.on ? campaignNote(campaignNames) : '';
    if (!note || note === noted.current) return;
    noted.current = note;
    showToast(note);
  }, [campaign.on, campaignNames]);
  /**
   * The rules are SAVED AS THEY ARE MADE (v0.42.3).
   *
   * There is no Save button because there is nothing to lose: every tap is a complete, valid rule,
   * and the DM should be able to walk away mid-list. Guarded on having loaded the expansion first, so
   * the initial read cannot write an empty ruleset over a real one.
   */
  useEffect(() => {
    if (!campaignExp || !draftCampaign) return;
    void saveExpansion({ ...campaignExp, campaign: draftCampaign });
  }, [campaignExp, draftCampaign]);
  const [pendingDeck, setPendingDeck] = useState<DeckKey | null>(null);
  /** The ally prompt, raised after a characterized ALLY is forged (never for an adversary). */
  const [joinParty, setJoinParty] = useState<{ charId: string; name: string; party: Party } | null>(null);
  const [forging, setForging] = useState(false);
  const [unlockPulse, setUnlockPulse] = useState(0);
  const hadClass = useRef(false);
  const deckIndexes = useRef<Partial<Record<DeckKey, number>>>({});
  const fade = useSharedValue(1);
  const set = useCallback((p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p })), []);

  /**
   * Read the stat block, and seed everything it already knows.
   *
   * Name and portrait come across because retyping them is work the DM has already done, and the
   * level arrives worked out from the tier and difficulty so the common case needs no thought.
   * Traits come across only when there are some, which is the case when the thing being
   * characterized was characterized before; a plain stat block has none and everything starts at 0.
   */
  useEffect(() => {
    if (!characterizing) return;
    let live = true;
    void getEncounter(params.encId!).then((enc) => {
      if (!enc || !live) return;
      const npc = enc.allies.flatMap((a) => (a.kind === 'npc' ? [a.combatant] : []));
      const c = [...enc.adversaries, ...npc].find((x) => x.id === params.cid);
      if (!c) return;
      setStatBlock(c);
      // Open ON the review step: what the stat block hands over should be settled first.
      setDeck('carry');
      // v0.36.3 (owner): the Statblock leads the carry list and the step opens ON it, rather than
      // in the middle like every other deck. It is the card that says what this creature is.
      setCenterIdx(0);
      deckIndexes.current.carry = 0;
      // v0.36.1 (owner): a name the APP made up is not a name. Carrying "Adversary #3" across just
      // means the DM has to clear the field before they can type, so a placeholder is left behind
      // and the name step stays open; a real name is inherited and counts as answered.
      const inheritName = isGenericName(c.name) ? '' : c.name;
      setDraft((d) => ({
        ...d,
        name: d.name || inheritName,
        portraitUri: d.portraitUri ?? c.portraitUri ?? null,
        level: d.level ?? levelForStatBlock(c.tier, c.difficulty),
        // Skipping traits must send what was inherited, not nothing (owner), so they are seeded
        // here rather than only being offered as a Reset on the traits step.
        traits: Object.keys(d.traits).length ? d.traits : { ...(c as unknown as { traits?: Partial<Record<TraitKey, number>> }).traits },
        characterize: { encounterId: params.encId!, combatantId: params.cid!, side: params.side === 'ally' ? 'ally' : 'adversary' },
      }));
    });
    return () => { live = false; };
  }, [characterizing, params.encId, params.cid, params.side]);

  /**
   * The CLASS step is optional when the numbers a class would give are already carried (v0.36.1).
   *
   * Leaving either of those cards behind puts it back, and un-skips it if it had been skipped, so the
   * creator can never reach Forge with a character that has neither a class nor the numbers one
   * would have provided.
   */
  /** Everything the stat block hands over, and what the DM has greyed out of it. */
  const carry = useMemo<CarryItem[]>(() => (statBlock ? carryItems(statBlock) : []), [statBlock]);
  const carryOff = useMemo(() => new Set(draft.carryDisabled ?? []), [draft.carryDisabled]);
  /** One colour per carried card, picked once, so the review carousel and the forged card match. */
  const carryColors = useRef<Record<string, string>>({});
  const carryColor = useCallback((id: string) => (carryColors.current[id] ??= mutedCardColor()), []);
  /** The traits Reset restores: whatever the stat block carried, or nothing. */
  const inheritedTraits = useMemo(() => ({ ...(statBlock as unknown as { traits?: Partial<Record<TraitKey, number>> } | null)?.traits }), [statBlock]);
  /** Transformations follow the APP's expansion switch, not this character's picks (owner). */
  const transformationsOn = !!expansions?.some((e) => e.id === 'void' && isEnabledForCreation(e));
  const deckList = useMemo(
    () =>
      decksFor(characterizing, transformationsOn)
        // v0.42.5 (owner): "Traits and experiences should not be an available step in this campaign
        // settings UI, since nothing will be disabled here." Both are the player's own, made from
        // nothing a pack ships, so there is nothing on either to turn off.
        .filter((d) => !authoring || (d.key !== 'traits' && d.key !== 'experiences'))
        .filter((d) => authoring || isStepOn(campaign, d.key)),
    [characterizing, transformationsOn, campaign, authoring],
  );
  const classOptional = characterizing && canSkipClass(carry, carryOff);

  /**
   * The class comes BACK when its numbers stop being carried (v0.36.1, owner).
   *
   * Class is skippable only while the stat block is supplying the hit points and Evasion a class
   * would. Leaving either card behind after skipping it would otherwise leave a character with
   * neither, and a Forge button that claimed to be ready.
   */
  useEffect(() => {
    if (!characterizing || classOptional) return;
    setDraft((d) => (d.skipped?.includes('class') ? { ...d, skipped: d.skipped.filter((k) => k !== 'class') } : d));
  }, [characterizing, classOptional]);

  useEffect(() => {
    if (draft.className && !hadClass.current) {
      hadClass.current = true;
      setUnlockPulse((n) => n + 1);
    }
  }, [draft.className]);

  // Deck switch (#108: cards must LOAD then fade in, never pop): fade the old deck out → mount the
  // new deck while still INVISIBLE (the loader keeps pulsing) → hold a real paint grace so the new
  // thumbs actually decode at opacity 0 → only THEN hide the loader and fade the ready cards in
  // slowly. The carousel stays mounted (deckVisible true) so the key-change remount is hidden under
  // the fade, not flashed.
  const finishFade = useCallback(
    (next: DeckKey) => {
      setDeck(next);
      setCenterIdx(deckIndexes.current[next] ?? 0);
      // a real grace (#150): the freshly mounted thumbs/cards decode at opacity 0 behind the loader
      // before we reveal them — long enough that nothing is seen assembling.
      setTimeout(() => {
        setPendingDeck(null); // cards are painted → drop the loader
        fade.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) });
      }, 260);
    },
    [fade],
  );
  const switchDeck = useCallback(
    (next: DeckKey) => {
      if (next === deck || pendingDeck) return;
      setPendingDeck(next);
      const apply = () => finishFade(next);
      // fade EVERYTHING (cards + the SELECT controls) out before the swap so no button morphs (#150)
      //
      // v0.27.3: run `apply` whether or not the fade FINISHED. `finished` is false whenever the
      // animation is interrupted, and on that path nothing cleared `pendingDeck` -- so `switchDeck`
      // returned early for every later tap, the loader stayed mounted, and `fade` never came back to
      // 1. Since `fade` drives both the carousel and the SELECT/RANDOM cluster, one interrupted
      // 140ms fade left the creator looking half-dead with no way back. There is nothing to skip on
      // an interrupt: the swap still has to happen.
      fade.value = withTiming(0, { duration: 140, easing: Easing.in(Easing.quad) }, () => {
        runOnJS(apply)();
      });
    },
    [deck, pendingDeck, fade, finishFade],
  );

  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  /**
   * v0.27.3: hoisted out of the carousel's props. As an inline arrow it was a new function on every
   * render of this screen, which made the carousel's own `onCenter` new too, and reanimated builds a
   * derived value's dependencies from its worklet closure -- so the mapper that publishes the centred
   * index was torn down and restarted on every single render, and each restart forces a re-sort of
   * every mapper in the app on the next UI frame.
   */
  const onCenterIdx = useCallback(
    (i: number) => {
      deckIndexes.current[deck] = i;
      setCenterIdx(i);
    },
    [deck],
  );

  // v0.12.2: the class list the creator offers, gated by the PICKED expansions (base classes always; a
  // Void class only when 'void' is picked). Replaces the old base-only CREATION_CLASS_CARDS module const.
  /** The homebrew class this draft is playing, and the key its links are matched on (v0.42.6). */
  const customClass = useMemo(
    () => (draft.customClassId ? (libContent?.classes ?? []).find((c) => c.id === draft.customClassId) : undefined),
    [draft.customClassId, libContent],
  );
  const chosenClassKey = classKeyOf(customClass ? customClass.title : (draft.className ?? ''));
  const creationClassCards = useMemo(
    () => CLASS_CARDS.filter((c) => { const e = classExpansion(c.key); return !e || picked.has(e); }),
    [picked],
  );

  // Pre-render every forged card to a bitmap pair on device (#104 perf): the live components
  // double as the loading state and swap to image cards as each capture lands. Class-card jobs follow the
  // picked set (base-only creation never forges a Void class — no extra work until The Void is chosen).
  /**
   * v0.27.3: forge only the deck that is ON SCREEN.
   *
   * This used to queue every class card, every feature page and every tier-1 weapon and armour at
   * once -- about ninety captures -- regardless of which step the player was looking at. Since
   * v0.24.0 the cache key carries the app version, so a release re-runs the whole queue, and each
   * capture is two `captureRef` calls on the UI thread. Tapping Ancestry therefore queued the deck
   * switch behind sixty unrelated snapshots, which is the long wait.
   *
   * `settled` in useForgedSnapshots is a ref keyed by job, so coming back to a deck re-captures
   * nothing, and a deck never opened costs nothing. Equipment follows `picked` the way the carousel
   * items already do, so an expansion the player did not choose is not forged either.
   */
  const snapshotJobs = useMemo(
    () => [
      ...(deck !== 'class' ? [] : creationClassCards.map((c) => ({
        key: `class-${c.key}`,
        // deck-wide mark (#110): the class card is page 1 of (1 class + feature pages)
        node: <ForgedCard title={c.title} kindLabel="Class" body={c.body} accentDeep={classColor(c.key).deep} Banner={c.Banner} pageMark={`1/${1 + featurePages(c.key).length}`} classKey={c.key} />,
        // Void banners are expo-image rasters (async decode) — settle before capture or the art zone forges blank.
        raster: isVoidClass(c.key),
      }))),
      ...(deck !== 'class' ? [] : creationClassCards.flatMap((c) => {
        const total = 1 + featurePages(c.key).length;
        return featurePages(c.key).map((p) => ({
          key: `feat-${c.key}-${p.pageIndex}`,
          raster: isVoidClass(c.key),
          node: (
            <ForgedTextCard
              title={c.title}
              kindLabel="Features"
              pageMark={`${p.pageIndex + 2}/${total}`}
              sections={p.sections}
              accentDeep={classColor(c.key).deep}
              Banner={c.Banner}
              classKey={c.key}
            />
          ),
        }));
      })),
      // weapon + armor cards (#121) — vector (no raster settle), forged for LOD perf in the carousel
      ...(deck !== 'weapons'
        ? []
        : [...PRIMARY_WEAPONS, ...SECONDARY_WEAPONS]
            .filter((w) => !w.expansion || picked.has(w.expansion))
            .map((w) => ({ key: w.id, node: <ForgedWeaponCard weapon={w} /> }))),
      ...(deck !== 'armor'
        ? []
        : TIER1_ARMOR.filter((a) => !a.expansion || picked.has(a.expansion)).map((a) => ({ key: a.id, node: <ForgedArmorCard armor={a} /> }))),
    ],
    [deck, picked, creationClassCards],
  );
  const { sources, stage } = useForgedSnapshots(snapshotJobs);

  // Entry loader (#110): hold the veil until the first class card is painted (forged on device,
  // live on web), then a hard fallback so it can never hang.
  const [loaderDone, setLoaderDone] = useState(false);
  const [loaderUp, setLoaderUp] = useState(true);
  const firstClassKey = `class-${creationClassCards[0].key}`;
  useEffect(() => {
    if (loaderDone) return;
    // `deck !== 'class'` (v0.27.3): now that the forge is scoped to the deck on screen, a resumed
    // draft that opens on some other deck never forges the first class card, so waiting on it would
    // hold the veil for the whole 2200ms fallback.
    if (Platform.OS === 'web' || deck !== 'class' || sources[firstClassKey]) {
      const t = setTimeout(() => setLoaderDone(true), 260);
      return () => clearTimeout(t);
    }
  }, [sources, loaderDone, firstClassKey, deck]);
  useEffect(() => {
    const t = setTimeout(() => setLoaderDone(true), 2200);
    return () => clearTimeout(t);
  }, []);
  // Bulletproof unmount: drop the loader 380ms after it's flagged done even if the reanimated fade
  // completion callback never fires (web headless can strand exit anims) — it can never get stuck.
  useEffect(() => {
    if (!loaderDone) return;
    const t = setTimeout(() => setLoaderUp(false), 380);
    return () => clearTimeout(t);
  }, [loaderDone]);

  /**
   * The body is INVISIBLE until the veil lifts, and is revealed BY the veil lifting (v0.29.0).
   *
   * The loader only ever COVERED the body, it never hid it, so "loader first" was a property of paint
   * order rather than something this screen guaranteed. In a browser that is a race with nothing
   * holding it: nothing is forged on web, so the wait collapses to a plain timer, while the body
   * underneath is finished and fully drawn the whole time. Anything that covers the screen while that
   * clock runs, and the creation tour is pushed one tick after mount and does exactly that, spends the
   * loader out of sight and then uncovers a body the loader was supposed to be hiding. What the owner
   * saw was the loader flashing on over a creator that was already there.
   *
   * Cross-fading the body in on the same flag that fades the veil out makes the order structural
   * rather than incidental: there is nothing underneath to see early.
   */
  const entry = useSharedValue(0);
  useEffect(() => {
    if (loaderDone) entry.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.quad) });
  }, [loaderDone, entry]);
  const entryStyle = useAnimatedStyle(() => ({ opacity: entry.value }));

  const [centerIdx, setCenterIdx] = useState(0);
  const [editingExperience, setEditingExperience] = useState<number | null>(null);
  /** The draft handed to the full editor when the player asks for Advanced, or null while quick. */
  const [expAdvanced, setExpAdvanced] = useState<CardDraft | null>(null);
  // Weapons deck UI (#121): which kind of primary to browse, and whether we're picking the primary
  // or the (optional, 1H-only) secondary.
  const [weaponKind, setWeaponKind] = useState<WeaponKind>('physical');
  const [weaponSlot, setWeaponSlot] = useState<'primary' | 'secondary'>('primary');
  // v0.26.0: the class guides offer TWO separate choices (a potion, then a keepsake), and the step
  // showed all four cards at once as "pick any two". That let a player take two potions and no
  // keepsake, which is not a choice the book offers, and it never said the two picks were separate
  // questions. Presented like primary and secondary weapons now: one carousel per choice.
  const [invChoice, setInvChoice] = useState<0 | 1>(0);
  const primaryWeapon = draft.weaponPrimaryId ? weaponById(draft.weaponPrimaryId) : null;
  const secondaryAllowed = primaryWeapon?.burden === 'One-Handed';
  // a 2H primary (or no primary) can't have a secondary — snap the toggle back to primary
  useEffect(() => {
    if (weaponSlot === 'secondary' && !secondaryAllowed) setWeaponSlot('primary');
  }, [weaponSlot, secondaryAllowed]);
  const carouselRef = useRef<StraightCarouselHandle>(null);
  // v0.10.6 (Feature 3): when BOTH mixed-ancestry slots are full, Random alternates which one it
  // re-rolls (first, then second, then first…). Empty slots always fill first, so a deselect just works.
  const mixRollNext = useRef<'first' | 'second'>('first');

  // Device back must CLOSE an open overlay before it navigates (#108: backing out of a fullscreen
  // card used to leave a leaked veil that froze the next screen). Priority: editor → features →
  // focused card → default back.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (editingExperience != null) {
          setEditingExperience(null);
          return true;
        }
        if (carouselRef.current?.closeIfFullscreen()) return true;
        // v0.22.0: hardware back used to pop the route and destroy the draft silently.
        if (draftHasContent(draftRef.current)) {
          setLeaveConfirm(true);
          return true;
        }
        return false;
      });
      return () => sub.remove();
    }, [editingExperience]),
  );

  /**
   * A forged equipment card item: the bitmap pair once captured, the live card meanwhile (#121).
   *
   * v0.27.0: the returned object is CACHED, so a card that has not changed keeps the same identity.
   *
   * Cards forge one at a time, and each one finishing changes `sources`, which rebuilt the whole
   * deck's item list. Every item was a brand new object, so every memoized carousel slot saw new
   * props and re-rendered, and a deck of a hundred domain cards re-rendered a hundred times over the
   * course of the forge. That is the stutter: it is at its worst on a fresh install, which is the
   * first time anyone makes a character. Now only the card that actually gained a bitmap changes.
   */
  const itemCache = useRef(new Map<string, StraightItem>());
  /**
   * Keep one object per card, so a card that has not changed keeps its identity across rebuilds.
   *
   * The carousel's slots are memoized, which does nothing when every rebuild hands them a freshly
   * built object. The cache key has to name everything the card's appearance depends on, so a card
   * that DID change still gets a new object.
   */
  const keep = useCallback((cacheKey: string, make: () => StraightItem): StraightItem => {
    const hit = itemCache.current.get(cacheKey);
    if (hit) return hit;
    const made = make();
    itemCache.current.set(cacheKey, made);
    return made;
  }, []);
  /**
   * A LIBRARY card item, cached by everything that changes how it looks.
   *
   * v0.27.2: these were allocated fresh on every rebuild, which is every time any card finishes
   * forging, so a homebrew-heavy deck re-rendered all of its slots throughout the forge even though
   * the v0.27.0 cache was already sparing the catalog ones.
   */
  const keepLib = useCallback(
    (lc: LibraryCard, struckIndex?: number) => keep(`lib|${lc.id}|${lc.title}|${(lc.sections ?? []).length}|${struckIndex ?? ''}`, () => libCardItem(lc, struckIndex)),
    [keep],
  );
  const forgedItem = useCallback(
    (key: string, label: string, live: ReactNode): StraightItem => {
      const pre = sources[key];
      const cacheKey = `${key}|${pre?.full.uri ?? ''}`;
      const hit = itemCache.current.get(cacheKey);
      if (hit) return hit;
      const made: StraightItem = pre ? { id: key, label, thumb: pre.thumb, source: pre.full } : { id: key, label, custom: live };
      // A card only ever moves from live to forged, so an entry is superseded rather than stale; the
      // map is bounded by the number of cards on offer either way.
      itemCache.current.set(cacheKey, made);
      return made;
    },
    [sources],
  );

  /**
   * The deck's options, then the campaign's cut (v0.42.1).
   *
   * One filter over the finished list rather than a condition inside each branch: every deck is
   * covered the moment it is added, and the ids the DM ticked are the same ids the carousel carries.
   * The mode toggles (Mixed Ancestry, the Skip cards) are never options and are never cut.
   */
  /**
   * WHAT THESE RULES WOULD MAKE IMPOSSIBLE (v0.42.5, owner).
   *
   * Three things a character cannot be built without: a class, a subclass of that class, and two
   * level-one domain cards from the two domains it grants. Everything else can be emptied and the
   * step simply skips. The rule lives in `lib/campaign-warnings`, which is pure and tested; this only
   * gathers what is on offer to ask it about.
   */
  const warnings = useMemo(() => {
    if (!authoring) return [];
    const classes = creationClassCards.map((c) => ({ id: `class-${c.key}`, label: c.title, domains: classInfo(c.key).domains as string[] }));
    const subclasses = [
      ...CATALOG.filter((c) => c.kind === 'subclass' && c.tier === 1 && (!c.expansion || picked.has(c.expansion))).map((c) => ({ id: c.id, classId: `class-${c.className}` })),
      ...(libContent?.subclasses ?? []).filter((c) => !c.tier || c.tier === 1).map((c) => ({ id: c.id, classId: `class-${c.className ?? ''}` })),
    ];
    const domainCards = [
      ...CATALOG.filter((c) => c.kind === 'domain' && c.level === 1 && (!c.expansion || picked.has(c.expansion))).map((c) => ({ id: c.id, domain: String(c.domain ?? '') })),
      ...(libContent?.domains ?? []).map((c) => ({ id: c.id, domain: String(c.domain ?? '') })),
    ];
    return campaignWarnings(campaign, { classes, subclasses, domainCards });
  }, [authoring, campaign, creationClassCards, libContent, picked]);
  const rawItems: StraightItem[] = useMemo(() => {
    if (deck === 'carry') {
      // A greyed card is DIMMED rather than outlined: an outline is what selection looks like
      // everywhere else in the creator, and here selecting a card is how you throw it away.
      return carry.map((it) =>
        keep(`carry|${it.id}|${carryOff.has(it.id) ? 'off' : 'on'}`, () => ({
          id: it.id,
          label: it.title,
          /**
           * LEFT BEHIND, without transparency (v0.36.1, owner).
           *
           * Fading the card let the neighbours show through where the carousel overlaps them, and two
           * translucent cards on top of each other read as a bright seam rather than as one dim card.
           * The card is drawn solid and greyed instead: a slate art zone in place of its colour, and
           * a band across it saying so. Nothing behind it shows through at all.
           */
          custom: carryOff.has(it.id) ? (
            <View>
              <ForgedCard title={it.title} kindLabel={it.cardLabel} body={it.text} accentDeep="#20242B" colorArt="#20242B" multilineTitle />
              <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(20,24,31,0.62)' }} />
              <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: '44%', backgroundColor: 'rgba(20,24,31,0.95)', borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(147,142,136,0.5)', paddingVertical: 5 }}>
                <Text style={{ color: Rune.muted, fontSize: 10, fontFamily: Body.bold, letterSpacing: 2, textTransform: 'uppercase', textAlign: 'center' }}>Left behind</Text>
              </View>
            </View>
          ) : (
            <ForgedCard title={it.title} kindLabel={it.cardLabel} body={it.text} accentDeep={Rune.panel} colorArt={carryColor(it.id)} multilineTitle />
          ),
        })),
      );
    }
    if (deck === 'weapons') {
      // v0.19.2 item 5: HF (Hope and Fear) starting weapons only when that pack was picked for this hero.
      const base = weaponSlot === 'secondary' ? SECONDARY_WEAPONS : PRIMARY_WEAPONS.filter((w) => w.kind === weaponKind);
      const list = base.filter((w) => !w.expansion || picked.has(w.expansion));
      const cards = list.map((w) => forgedItem(w.id, w.name, <ForgedWeaponCard weapon={w} />));
      // Skip only on the primary slot — a secondary is already optional (v0.10.2).
      return weaponSlot === 'primary' ? [...cards, SKIP_WEAPONS] : cards;
    }
    if (deck === 'armor') {
      return [...TIER1_ARMOR.filter((a) => !a.expansion || picked.has(a.expansion)).map((a) => forgedItem(a.id, a.name, <ForgedArmorCard armor={a} />)), ...(libContent?.armor ?? []).map((lc) => keepLib(lc)), SKIP_ARMOR];
    }
    if (deck === 'inventory') {
      // Creation inventory shows ONLY the player's per-class CHOICES (#136). The default kit
      // (torch/rope/supplies) and gold are NOT shown here — they belong to the sheet. Custom
      // in-creation items were removed; homebrew items come from Library expansions.
      //
      // v0.26.0: ONE choice at a time. `invChoice` selects which of the guide's two groups is on
      // screen, so choice 1 offers the first pair and choice 2 the second.
      const cinv = draft.className ? CLASS_INVENTORY[draft.className] : null;
      const cap = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;
      const group = cinv?.choices[invChoice] ?? [];
      // v0.27.0: an option that exists in the ARCHIVE is offered as its archive card, so the player
      // is choosing the printed potion ("Clear 1d4 HP") rather than a card that only names itself.
      const optionCards: StraightItem[] = group.map((name) => {
        const id = itemOptionId(name);
        const archive = lootById(id);
        return keep(`inv|${id}`, () => ({
          id,
          label: name,
          custom: archive ? <ForgedLootCard loot={archive} /> : <ForgedCard title={itemTitle(name)} kindLabel={isConsumableName(name) ? 'Consumable' : 'Item'} body={`${cap(name)}.`} accentDeep={Rune.panel} colorArt={itemColor(name)} multilineTitle />,
        }));
      });
      // Homebrew inventory rides the first choice, so it is offered once rather than twice.
      const lib = invChoice === 0 ? (libContent?.inventory ?? []).map((c) => keepLib(c)) : [];
      return [...optionCards, ...lib, keep(`invskip|${invChoice}`, () => skipInventoryCard(invChoice))];
    }
    if (!isCardDeck(deck)) return [];
    switch (deck) {
      case 'class':
        // Each class card is a FLIP-DECK (#110): face 0 = the class card, then one face per feature
        // page. Tapping the focused card flips through them in 3D — no separate features button.
        return creationClassCards.map((c) => {
          const total = 1 + featurePages(c.key).length;
          const classPre = sources[`class-${c.key}`];
          // Every face this card would show, named by whether it has forged yet. Fifteen classes with
          // several feature pages each rebuilt on every single forge before this.
          const forgeKey = [classPre?.full.uri ?? '', ...featurePages(c.key).map((p) => sources[`feat-${c.key}-${p.pageIndex}`]?.full.uri ?? '')].join(',');
          return keep(`class|${c.key}|${forgeKey}`, () => {
            const classFace: StraightFace = classPre
              ? { thumb: classPre.thumb, source: classPre.full }
              : { custom: <ForgedCard title={c.title} kindLabel="Class" body={c.body} accentDeep={classColor(c.key).deep} Banner={c.Banner} pageMark={`1/${total}`} classKey={c.key} /> };
            const featureFaces: StraightFace[] = featurePages(c.key).map((p) => {
              const fpre = sources[`feat-${c.key}-${p.pageIndex}`];
              return fpre
                ? { thumb: fpre.thumb, source: fpre.full }
                : {
                    custom: (
                      <ForgedTextCard
                        title={c.title}
                        kindLabel="Features"
                        pageMark={`${p.pageIndex + 2}/${total}`}
                        sections={p.sections}
                        accentDeep={classColor(c.key).deep}
                        Banner={c.Banner}
                        classKey={c.key}
                      />
                    ),
                  };
            });
            const faces = [classFace, ...featureFaces];
            return { id: `class-${c.key}`, label: c.title, thumb: classFace.thumb, source: classFace.source, custom: classFace.custom, faces };
          });
        }).concat(
          /**
           * HOMEBREW CLASSES (v0.42.6, owner: "custom classes do not appear in character creation").
           *
           * The class step was built from the bundled list and nothing else, so a pack could define a
           * class that nobody could ever choose. They are assembled the same way a published class is:
           * ONE card whose faces are its base page and every page card pointing at it, which is also
           * the owner's second ask, that a class and its pages stop being separate cards. See
           * `lib/custom-class-pages`.
           */
          assembleClasses(libContent?.classes ?? []).map((a) => ({
            id: a.base.id,
            label: a.base.title || 'Untitled class',
            custom: <LibraryForgedCard card={{ ...a.base, typeLabel: 'Class' }} />,
            faces: a.faces.map((f, i) => ({
              custom: <LibraryForgedCard card={{ ...f, typeLabel: i === 0 ? 'Class' : 'Features' }} pageMark={faceMark(i, a.faces.length)} />,
            })),
          })),
        );
      case 'subclass':
        /**
         * AUTHORING SEES ALL OF THEM (v0.42.5, owner).
         *
         * "No step of the character creation process should be blocked off for this UI since it is
         * about disabling content not creating a character. This means the subclass and domains steps
         * must display all subclasses from all enabled expansions so that the user can toggle them on
         * or off."
         *
         * Playing, a subclass list is the chosen class's, because that is the only list that means
         * anything to a player. Authoring, there is no chosen class: the DM is deciding about every
         * subclass in every pack they have enabled, and a list that waited for a class to be picked
         * was a step they could not use at all.
         */
        return [
          ...CATALOG.filter((c) => c.kind === 'subclass' && (authoring || c.className === draft.className) && c.tier === 1 && (!c.expansion || picked.has(c.expansion))).map((c) => keep(`cat|${c.id}`, () => ({ id: c.id, label: c.label, thumb: c.thumb, source: c.source }))),
          ...(libContent?.subclasses ?? []).filter((c) => (!c.tier || c.tier === 1) && (authoring || !c.className || classKeyOf(c.className) === chosenClassKey)).map((lc) => keepLib(lc)),
        ];
      case 'ancestry': {
        const base = CATALOG.filter((c) => c.kind === 'ancestry' && (!c.expansion || picked.has(c.expansion))).map((c) => keep(`cat|${c.id}`, () => ({ id: c.id, label: c.label, thumb: c.thumb, source: c.source })));
        // #265: the last card flips the mode — "Mixed Ancestry" enters mixed mode, "Single Ancestry" leaves it.
        const toggle: StraightItem = draft.mixedAncestry
          ? { id: SINGLE_ANCESTRY_ID, label: 'Single Ancestry', custom: <ForgedCard title="Single Ancestry" kindLabel="Ancestry" body="Go back to choosing a single ancestry." accentDeep={Rune.panel} colorArt="#2A3340" multilineTitle /> }
          : { id: MIXED_ANCESTRY_ID, label: 'Mixed Ancestry', custom: <ForgedCard title="Mixed Ancestry" kindLabel="Ancestry" body="Combine two ancestries: take the first trait of one and the second trait of the other. Pick two, order decides which trait you keep." accentDeep={Rune.panel} colorArt="#3A2A4A" multilineTitle /> };
        // mixed-ancestry cross-out for STRUCTURED ancestries: first-picked keeps Feature 1 (strike
        // Feature 2), second-picked keeps Feature 2 (strike Feature 1) — mirrors ancestryCrossOuts for
        // the image cards. v0.13.0: the struck FEATURE resolves to its actual section index (features
        // can sit anywhere among the sections) via featureSectionIndexes.
        const mix = draft.mixedAncestry;
        // v0.25.0: skip printed-face ancestries — StraightCarousel already draws TraitCrossOut's
        // measured lines over those, and striking the text as well would cross the feature twice.
        const struckIdx = (lc: LibraryCard): number | undefined =>
          hasStrikeLines(lc.id) ? undefined : mix?.first === lc.id ? featureSectionIndexes(lc)[1] : mix?.second === lc.id ? featureSectionIndexes(lc)[0] : undefined;
        return [...base, ...(libContent?.ancestries ?? []).map((lc) => keepLib(lc, struckIdx(lc))), toggle];
      }
      case 'transformation':
        return CATALOG.filter((c) => c.kind === 'transformation').map((c) => keep(`cat|${c.id}`, () => ({ id: c.id, label: c.label, thumb: c.thumb, source: c.source })));
      case 'community':
        return [...CATALOG.filter((c) => c.kind === 'community' && (!c.expansion || picked.has(c.expansion))).map((c) => keep(`cat|${c.id}`, () => ({ id: c.id, label: c.label, thumb: c.thumb, source: c.source }))), ...(libContent?.communities ?? []).map((lc) => keepLib(lc))];
      case 'domains': {
        /**
         * v0.42.5 (owner): "for domain cards just display all level 1 domain cards of every enabled
         * expansion to see which domain cards of level 1 are available with support for expansions."
         *
         * Playing, the list is the two domains the chosen class grants. Authoring, it is every level
         * one card there is, because the DM is deciding which exist at their table and the class that
         * will want them has not been picked by anybody yet.
         */
        if (authoring) {
          return [
            ...CATALOG.filter((c) => c.kind === 'domain' && c.level === 1 && (!c.expansion || picked.has(c.expansion))).map((c) => keep(`cat|${c.id}`, () => ({ id: c.id, label: c.label, thumb: c.thumb, source: c.source }))),
            ...(libContent?.domains ?? []).map((lc) => keepLib(lc)),
          ];
        }
        if (!draft.className) return [];
        // v0.42.6: a homebrew class grants the two domains its author chose.
        const pair = (customClass?.classSpec?.domains.filter((d) => d.trim()) ?? []).length
          ? customClass!.classSpec!.domains.filter((d) => d.trim())
          : (classInfo(draft.className).domains as string[]);
        return [
          ...pair.flatMap((d) => CATALOG.filter((c) => c.kind === 'domain' && c.domain === d && c.level === 1 && (!c.expansion || picked.has(c.expansion)))).map((c) => keep(`cat|${c.id}`, () => ({ id: c.id, label: c.label, thumb: c.thumb, source: c.source }))),
          ...(libContent?.domains ?? []).map((lc) => keepLib(lc)),
        ];
      }
    }
  }, [deck, draft.className, draft.mixedAncestry, sources, weaponKind, weaponSlot, invChoice, forgedItem, keep, keepLib, libContent, picked, creationClassCards, carry, carryOff, carryColor]);
  const items: StraightItem[] = useMemo(() => {
    if (!campaign.on || !CAMPAIGN_DECKS.includes(deck)) return rawItems;
    // AUTHORING marks the off cards; PLAYING drops them. Same rule, two sides of it: the DM needs to
    // see what they turned off in order to turn it back on, and the player must not see it at all.
    return authoring
      ? rawItems.map((it) => (isOptionOn(campaign, deck, it.id) ? it : { ...it, disabledLabel: 'Not in this campaign' }))
      : rawItems.filter((it) => isOptionOn(campaign, deck, it.id));
  }, [rawItems, campaign, deck, authoring]);

  const selectedIds = useMemo(() => {
    // v0.42.3: authoring outlines nothing. A red outline means "this is your pick", and in this mode
    // there are no picks: greying is the whole vocabulary, exactly as it is on the Inherit step.
    if (authoring) return [];
    // The carry step never outlines anything: greying is its whole vocabulary (see `items`).
    if (deck === 'carry') return [];
    if (deck === 'weapons') {
      if (weaponSlot === 'primary' && draft.weaponsSkipped) return ['weapons-skip'];
      const id = weaponSlot === 'secondary' ? draft.weaponSecondaryId : draft.weaponPrimaryId;
      return id ? [id] : [];
    }
    if (deck === 'armor') return draft.armorSkipped ? ['armor-skip'] : draft.armorId ? [draft.armorId] : [];
    if (deck === 'inventory') {
      // Only THIS choice's answer is highlighted, since only this choice is on screen.
      const skipped = (draft.inventorySkips ?? []).includes(invChoice) || (draft.inventorySkipped ?? false);
      return skipped ? [`inventory-skip-${invChoice}`] : [...draft.inventoryItemIds, ...draft.inventoryLibIds];
    }
    if (!isCardDeck(deck)) return [];
    switch (deck) {
      case 'class':
        // v0.42.6: a homebrew class is outlined by its own card id.
        if (draft.customClassId) return [draft.customClassId];
        return draft.className ? [`class-${draft.className}`] : [];
      case 'subclass':
        return draft.subclassCardId ? [draft.subclassCardId] : [];
      case 'ancestry':
        return draft.mixedAncestry
          ? [draft.mixedAncestry.first, draft.mixedAncestry.second].filter((x): x is string => !!x)
          : draft.ancestryCardId ? [draft.ancestryCardId] : [];
      case 'transformation':
        return draft.transformationCardId ? [draft.transformationCardId] : [];
      case 'community':
        return draft.communityCardId ? [draft.communityCardId] : [];
      case 'domains':
        return draft.domainCardIds;
    }
  }, [deck, draft, weaponSlot, invChoice]);

  // #265: live cross-out while picking a mix — the 1st pick keeps trait 1 (cross its trait 2), the 2nd
  // keeps trait 2 (cross its trait 1).
  const ancestryCrossOuts = useMemo<Record<string, 1 | 2>>(() => {
    const m = draft.mixedAncestry;
    if (!m) return {};
    const o: Record<string, 1 | 2> = {};
    if (m.first) o[m.first] = 2;
    if (m.second) o[m.second] = 1;
    return o;
  }, [draft.mixedAncestry]);
  // Fade the ancestry carousel when toggling single↔mixed so the swap never flickers (#265): dip to 0,
  // (the items + selection update under the dip), then rise back — the same hide-until-ready idea as the
  // sheet's ghost-free switch, at the container level.
  const mixedActive = !!draft.mixedAncestry;
  const modeFade = useSharedValue(1);
  const modeFirst = useRef(true);
  useEffect(() => {
    if (modeFirst.current) { modeFirst.current = false; return; }
    modeFade.value = withSequence(withTiming(0, { duration: 150, easing: Easing.in(Easing.cubic) }), withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) }));
  }, [mixedActive, modeFade]);
  const modeFadeStyle = useAnimatedStyle(() => ({ opacity: modeFade.value }));

  /**
   * Answering a step un-skips it AND marks it TOUCHED (v0.36.3, owner).
   *
   * "Filled in" used to mean `deckDone`, which is true for anything the stat block seeded, so Name,
   * Inherit and Level always arrived marked. That is wrong twice: the DM did not fill them in, and
   * it made Skip everything raise the "you are throwing an answer away" warning every single time,
   * for answers nobody had given. A step is filled in when the DM has actually touched it.
   */
  const unskip = useCallback((k: DeckKey | 'name') => {
    setDraft((d) => ({
      ...d,
      ...(k !== 'name' && d.skipped?.includes(k) ? { skipped: d.skipped.filter((x) => x !== k) } : {}),
      ...(k === 'name' && d.nameSkipped ? { nameSkipped: false } : {}),
      ...(d.touched?.includes(k) ? {} : { touched: [...(d.touched ?? []), k] }),
    }));
  }, []);

  /**
   * What a step goes back to when it is SKIPPED (v0.36.1, owner).
   *
   * "Skipping a step must be sensitive to changes on that step. If I skip traits they are sent as
   * default, as inherited, or as all 0 if there were no traits to inherit." So a skip is not just a
   * flag: it puts the step back to the answer the stat block implies, and where the stat block
   * implies nothing, to nothing at all. That is also what the skip menu warns about before it throws
   * an answer away.
   */
  const stepDefault = useCallback(
    (k: DeckKey | 'name'): Partial<Draft> => {
      switch (k) {
        case 'name':
          // Not blank: a character with no name at all cannot be forged, and whatever the stat block
          // was called is the only name anybody has offered.
          return { name: statBlock?.name ?? '' };
        case 'carry':
          return { carryDisabled: [] }; // the default is to inherit everything
        case 'level':
          return { level: levelForStatBlock(statBlock?.tier, statBlock?.difficulty) };
        case 'class':
          // Subclass and domains are chosen FROM a class, so they go with it.
          return { className: null, subclassCardId: null, domainCardIds: [] };
        case 'subclass':
          return { subclassCardId: null };
        case 'ancestry':
          return { ancestryCardId: null, mixedAncestry: null };
        case 'transformation':
          return { transformationCardId: null };
        case 'community':
          return { communityCardId: null };
        case 'domains':
          return { domainCardIds: [] };
        case 'traits':
          return { traits: { ...inheritedTraits } }; // inherited, or nothing, never a player's spread
        case 'experiences':
          return { experiences: [] };
        case 'weapons':
          return { weaponPrimaryId: null, weaponSecondaryId: null, weaponsSkipped: false };
        case 'armor':
          return { armorId: null, armorSkipped: false };
        case 'inventory':
          return { inventoryItemIds: [], inventoryLibIds: [], inventorySkips: [] };
      }
    },
    [statBlock, inheritedTraits],
  );

  /**
   * Mark steps skipped, put each back to its default, and HAND BACK the draft it wrote.
   *
   * Returning it is not a convenience: `setDraft` has not re-rendered by the time the caller wants to
   * forge, so the caller cannot read the result from a ref. This is the only copy that is true.
   */
  const applySkips = useCallback(
    (keys: (DeckKey | 'name')[]): Draft => {
      const d = draftRef.current;
      let next: Draft = { ...d };
      for (const k of keys) next = { ...next, ...stepDefault(k) };
      // Skipping the class takes subclass and domains with it: neither can be chosen without one.
      const all = keys.includes('class') ? [...keys, 'class' as const, 'subclass' as const, 'domains' as const] : keys;
      const deckKeys = all.filter((k): k is DeckKey => k !== 'name');
      // The menu is the WHOLE answer, not an add-only list: unchecking a step un-skips it.
      const out: Draft = { ...next, skipped: [...new Set(deckKeys)], nameSkipped: all.includes('name') };
      draftRef.current = out;
      setDraft(out);
      return out;
    },
    [stepDefault],
  );

  const onToggle = useCallback(
    (id: string) => {
      /**
       * AUTHORING: a tap is a rule, not a pick (v0.42.3).
       *
       * It comes first, before any deck's own handling, because in this mode none of that applies:
       * the DM is not building a character and nothing should be written to the draft. `syncSteps`
       * runs on every change, so turning off the last ancestry turns the ancestry step off too.
       */
      if (authoring) {
        if (!CAMPAIGN_DECKS.includes(deck)) return;
        playSfx('cardSelect');
        setDraftCampaign((cs) => {
          const base = cs ?? EMPTY_CAMPAIGN_SETTINGS;
          const next = toggleKey(base, optionKey(deck, id));
          return syncSteps(next, [{ deck, keys: rawItems.map((it) => optionKey(deck, it.id)) }]);
        });
        return;
      }
      unskip(deck);
      if (deck === 'carry') {
        const off = new Set(draft.carryDisabled ?? []);
        if (off.has(id)) off.delete(id); else off.add(id);
        /**
         * Leaving the LEVEL behind moves the level, it does not freeze it (v0.39.0, owner: "changing
         * the level during characterize became impossible, it stayed stuck at LVL 1").
         *
         * The level is a real value on the draft, seeded from the tier and difficulty, so greying its
         * card out has to WRITE the new default rather than have every reader special-case the
         * disabled set. Putting the card back restores what the stat block implied. Either way the
         * stepper, Random and Reset go on working from wherever it lands.
         */
        const nextLevel = id === 'carry-level' ? (off.has(id) ? 1 : levelForStatBlock(statBlock?.tier, statBlock?.difficulty)) : undefined;
        set({ carryDisabled: [...off], ...(nextLevel === undefined ? {} : { level: nextLevel }) });
        return;
      }
      if (deck === 'weapons') {
        if (id === 'weapons-skip') { set({ weaponsSkipped: !draft.weaponsSkipped, weaponPrimaryId: null, weaponSecondaryId: null }); return; }
        if (weaponSlot === 'secondary') {
          if (!secondaryAllowed) return; // only a 1H primary may carry a secondary
          set({ weaponSecondaryId: draft.weaponSecondaryId === id ? null : id });
        } else {
          if (draft.weaponPrimaryId === id) {
            set({ weaponPrimaryId: null, weaponSecondaryId: null });
          } else {
            const w = weaponById(id);
            // a Two-Handed primary leaves no hand for a secondary → clear it. Selecting a weapon clears skip.
            set({ weaponPrimaryId: id, weaponsSkipped: false, ...(w?.burden === 'Two-Handed' ? { weaponSecondaryId: null } : {}) });
          }
        }
        return;
      }
      if (deck === 'armor') {
        if (id === 'armor-skip') { set({ armorSkipped: !draft.armorSkipped, armorId: null }); return; }
        // v0.36 (owner): armor SETS damage thresholds, and a characterized adversary is holding the
        // ones its stat block had. Say so rather than letting the number quietly move.
        if (draft.armorId !== id && carriesThresholds(carry, carryOff)) {
          showToast('This one carries its own damage thresholds. Armor sets them instead, and with the level bonuses on top they will likely come out higher.');
        }
        set({ armorId: draft.armorId === id ? null : id, armorSkipped: false });
        return;
      }
      if (deck === 'inventory') {
        // v0.26.0: taking nothing answers THIS choice, and clears whatever it had chosen.
        if (id.startsWith('inventory-skip')) {
          const skips = new Set(draft.inventorySkips ?? []);
          const group = CLASS_INVENTORY[draft.className!]?.choices[invChoice] ?? [];
          const ids = new Set(group.map(itemOptionId));
          if (skips.has(invChoice)) skips.delete(invChoice);
          else skips.add(invChoice);
          set({ inventorySkips: [...skips], inventorySkipped: false, inventoryItemIds: draft.inventoryItemIds.filter((x) => !ids.has(x)) });
          return;
        }
        // v0.10.3: a homebrew inventory card toggles into the loose picks (no 2-item cap; clears skip).
        if ((libContent?.inventory ?? []).some((c) => c.id === id)) {
          const had = draft.inventoryLibIds.includes(id);
          set({ inventoryLibIds: had ? draft.inventoryLibIds.filter((x) => x !== id) : [...draft.inventoryLibIds, id], inventorySkipped: false });
          return;
        }
        // optional items: pick up to TWO (#136), replacing the oldest like domains. Any pick clears skip.
        // One pick per choice: choosing replaces whatever this choice held, rather than filling a
        // shared pool of two. That pool let a player take both potions and no keepsake.
        const group = CLASS_INVENTORY[draft.className!]?.choices[invChoice] ?? [];
        const ids = new Set(group.map(itemOptionId));
        const others = draft.inventoryItemIds.filter((x) => !ids.has(x));
        const has = draft.inventoryItemIds.includes(id);
        set({
          inventoryItemIds: has ? others : [...others, id],
          inventorySkips: (draft.inventorySkips ?? []).filter((c) => c !== invChoice),
          inventorySkipped: false,
        });
        return;
      }
      if (!isCardDeck(deck)) return;
      switch (deck) {
        case 'class': {
          /**
           * A HOMEBREW class is picked by its card id (v0.42.6).
           *
           * `className` is still set, to a bundled carrier, because the colour, the banner and every
           * keyed lookup want one; `customClassId` is what makes it that class. Picking either kind
           * clears the subclass and the domain cards, because both belonged to the last one.
           */
          const custom = (libContent?.classes ?? []).find((c) => c.id === id);
          if (custom) {
            if (draft.customClassId === id) set({ className: null, customClassId: null, subclassCardId: null, domainCardIds: [] });
            else set({ className: carrierClassFor(custom), customClassId: id, subclassCardId: null, domainCardIds: [] });
            return;
          }
          const key = id.replace('class-', '') as ClassName;
          if (draft.className === key && !draft.customClassId) set({ className: null, customClassId: null, subclassCardId: null, domainCardIds: [] });
          else set({ className: key, customClassId: null, subclassCardId: null, domainCardIds: [] });
          return;
        }
        case 'subclass':
          set({ subclassCardId: draft.subclassCardId === id ? null : id });
          return;
        case 'ancestry': {
          // #265 mode toggle cards.
          if (id === MIXED_ANCESTRY_ID) { set({ mixedAncestry: { first: null, second: null }, ancestryCardId: null }); return; }
          if (id === SINGLE_ANCESTRY_ID) { set({ mixedAncestry: null }); return; }
          if (draft.mixedAncestry) {
            // Ordered two-pick: 1st filled slot keeps trait 1, 2nd keeps trait 2. Tapping a picked card
            // frees its slot. A card can't fill both slots (tapping it just toggles its own).
            const { first, second } = draft.mixedAncestry;
            if (id === first) { set({ mixedAncestry: { first: null, second } }); return; }
            if (id === second) { set({ mixedAncestry: { first, second: null } }); return; }
            if (!first) { set({ mixedAncestry: { first: id, second } }); return; }
            if (!second) { set({ mixedAncestry: { first, second: id } }); return; }
            return; // both slots full → ignore until one is freed
          }
          set({ ancestryCardId: draft.ancestryCardId === id ? null : id });
          return;
        }
        case 'transformation':
          set({ transformationCardId: draft.transformationCardId === id ? null : id });
          return;
        case 'community':
          set({ communityCardId: draft.communityCardId === id ? null : id });
          return;
        case 'domains': {
          const has = draft.domainCardIds.includes(id);
          if (has) set({ domainCardIds: draft.domainCardIds.filter((x) => x !== id) });
          else if (draft.domainCardIds.length < 2) set({ domainCardIds: [...draft.domainCardIds, id] });
          else set({ domainCardIds: [draft.domainCardIds[1], id] });
          return;
        }
      }
    },
    [deck, draft, set, weaponSlot, invChoice, secondaryAllowed, libContent, unskip, carry, carryOff, statBlock],
  );

  // v0.23.0: teach the creator when the creator opens, not on first launch.
  useEffect(() => {
    // v0.26.0: DEFERRED out of the mount tick, deliberately.
    //
    // Pushing the tour while the creator's own navigation is still settling made both history
    // entries in the same tick, and Firefox collapses those into one. Going back from the tour then
    // went back PAST the creator and landed on the character list, which is empty for a new player,
    // so making a character looked like it had failed. Chrome kept both entries, which is why it only
    // ever happened in one browser.
    //
    // One frame is enough for the creator's entry to exist in its own right. Returning still uses
    // back(), which keeps the creator mounted with everything the player has already chosen; sending
    // them forward to a fresh copy instead would re-ask which expansions they wanted.
    // The creation tour explains making a hero, which is not what a DM came here to do.
    if (authoring || !shouldShow('creation')) return;
    const t = setTimeout(() => router.push('/onboarding?tour=creation' as Href), 0);
    return () => clearTimeout(t);
  }, [router, authoring]);

  useEffect(() => {
    if (resumeChecked) return;
    setResumeChecked(true);
    // v0.42.4 (owner): no draft ceremonies while authoring. Nothing here is a character, so there is
    // no half-made one to be offered back.
    if (authoring) return;
    const stored = loadDraft<Draft>();
    /**
     * A characterize draft belongs to ONE combatant (v0.36.1, owner).
     *
     * There is one draft slot, so without this a DM's half-finished wraith would be offered back to
     * a player starting an ordinary hero on the same device, and an ordinary draft would be offered
     * into a characterize. A draft is only ever offered back to the thing it was started from.
     */
    const mine = stored?.draft?.characterize?.combatantId ?? null;
    const want = characterizing ? params.cid! : null;
    if (mine !== want) { if (!characterizing) clearDraft(); return; }
    if (isResumable(stored, draftHasContent) && stored) setResumeOffer({ draft: stored.draft, deck: stored.deck, savedAt: stored.savedAt });
    else clearDraft();
  }, [resumeChecked, characterizing, params.cid]);

  // Persist after every edit. Cheap (one small JSON) and it means the draft survives anything.
  useEffect(() => {
    if (!resumeChecked || resumeOffer) return; // don't overwrite a draft we're still offering back
    // A characterize draft is saved once it knows WHICH combatant it belongs to, so a phone call
    // mid-characterize loses nothing and the draft can never be handed to the wrong creation.
    if (authoring) return; // nothing here is a character, so there is no draft to keep
    if (characterizing ? !!draft.characterize : draftHasContent(draft)) saveDraft(draft, { deck, picked: [...picked] });
  }, [draft, deck, picked, resumeChecked, resumeOffer, characterizing]);

  draftRef.current = draft;
  // v0.36.1: the name is a step in the skip menu, so skipping it answers it (it falls back to
  // whatever the stat block was called, which is the only name anybody has offered).
  const nameDone = draft.name.trim().length > 0 || !!draft.nameSkipped;
  const complete = deckList.every((d) => deckDone(d.key, draft)) && nameDone;
  // Aggregate progress (v0.22.0). The rail showed per-step ticks but nothing showed how close you
  // were overall, and the NAME requirement had no representation on the rail at all — so a player
  // could hold ten gold ticks and a disabled Forge button with no explanation of why.
  const steps = deckList.length + 1; // +1 for the name
  const stepsDone = deckList.filter((d) => deckDone(d.key, draft)).length + (nameDone ? 1 : 0);
  const missingLabel = !nameDone ? 'a name' : (deckList.find((d) => !deckDone(d.key, draft))?.label.toLowerCase() ?? null);

  /** Tapping Forge while incomplete jumps to the first unmet step instead of doing nothing. */
  const jumpToMissing = useCallback(() => {
    playSfx('buttonTap');
    const next = deckList.find((d) => !deckDone(d.key, draft) && !locked(d.key));
    if (next) switchDeck(next.key);
    else nameRef.current?.focus(); // every deck is done, so the name is what's left
  }, [draft, switchDeck, deckList]);

  const forge = useCallback(async () => {
    if (!complete || !draft.className) return;
    const id = newCharacterId();
    // v0.10.3 (B4): embed a self-contained COPY of every picked homebrew card so the character renders +
    // resolves effects with no expansion installed and survives it being disabled/deleted. Derived from
    // the slot ids + loose inventory picks. A creation with no homebrew picks leaves this undefined.
    const libById = new Map<string, LibraryCard>();
    // v0.42.6: `classes` joins the list, so a homebrew class and its pages travel with the character
    // the same way its ancestry and its domain cards do.
    if (libContent) for (const arr of [libContent.ancestries, libContent.communities, libContent.subclasses, libContent.domains, libContent.armor, libContent.inventory, libContent.classes]) for (const c of arr) libById.set(c.id, c);
    const classPageIds = draft.customClassId
      ? (libContent?.classes ?? []).filter((c) => c.classSpec?.role === 'page' && classKeyOf(c.className) === chosenClassKey).map((c) => c.id)
      : [];
    const pickedIds = [draft.mixedAncestry ? draft.mixedAncestry.first : draft.ancestryCardId, draft.mixedAncestry?.second, draft.subclassCardId, draft.communityCardId, draft.armorId, draft.customClassId, ...classPageIds, ...draft.domainCardIds, ...draft.inventoryLibIds].filter((x): x is string => !!x);
    const libraryCards = [...new Set(pickedIds)].map((pid) => libById.get(pid)).filter((c): c is LibraryCard => !!c);
    // v0.10.5: a custom subclass FOUNDATION drags its specialization + mastery siblings along (same family
    // + class) so the subclass-upgrade advancement can add them on level-up. They stay hidden on the sheet
    // until acquired.
    // v0.14.0: family matching goes through subclassFamilyKey, which falls back to the card TITLE — an
    // author who named all three cards the same and left the family field blank used to get no siblings.
    const subFoundation = draft.subclassCardId ? libById.get(draft.subclassCardId) : undefined;
    if (subFoundation?.contentType === 'subclass') {
      const famKey = subclassFamilyKey(subFoundation);
      for (const sib of libContent?.subclasses ?? []) {
        if (subclassFamilyKey(sib) === famKey && (sib.tier ?? 1) !== 1 && !libraryCards.some((c) => c.id === sib.id)) libraryCards.push(sib);
      }
    }
    // enable custom origin/armor cards so their effects apply (armor score/thresholds, ancestry passive).
    // v0.26.0: the CHOSEN ARMOR is equipped too. A new character arrived with an armor card sitting
    // inert in their arsenal and an Armor Score of zero, because equipping is a hold the player has
    // not learned yet. Armor is the one starting card whose whole purpose is its numbers, so leaving
    // it off made a fresh sheet simply wrong. Onboarding recommends tidying the rest away afterwards.
    const enabledCustom = [
      ...libraryCards.filter((c) => (c.effects?.length ?? 0) > 0 || c.contentType === 'armor').map((c) => c.id),
      ...(draft.armorId ? [draft.armorId] : []),
    ];
    // v0.12.2: record which EXPANSIONS this hero was created with (real ids only — the implicit base is
    // dropped). Omitted when empty so a base-only save stays byte-identical / back-compat.
    const enabledExpansionIds = [...picked].filter((id) => id !== BASE_PICK_ID);
    await saveCharacter({
      schemaVersion: 1,
      id,
      createdAt: new Date().toISOString(),
      name: draft.name.trim(),
      portraitUri: draft.portraitUri,
      className: draft.className,
      // v0.42.6: the homebrew class this character is playing. Its card is embedded with every other
      // library card below, so the character keeps its class even if the pack is later deleted.
      ...(draft.customClassId ? { customClassId: draft.customClassId } : {}),
      subclassCardId: draft.subclassCardId!,
      // #265: mixed ancestry — `first` is the primary ancestry (drives the name), `second` rides along as
      // an acquired card; both carry their cross-out + half-applied modifiers via `mixedAncestry`.
      ancestryCardId: draft.mixedAncestry ? draft.mixedAncestry.first! : draft.ancestryCardId!,
      // Both ancestry cards land in Arsenal, side by side (#276 item 3): the first is the origin card
      // (already in abilities); the second rides in via acquiredCardIds, so pin it to abilities too.
      ...(draft.mixedAncestry ? { mixedAncestry: { first: draft.mixedAncestry.first!, second: draft.mixedAncestry.second! }, acquiredCardIds: [draft.mixedAncestry.second!] } : {}),
      communityCardId: draft.communityCardId!,
      domainCardIds: draft.domainCardIds,
      traits: draft.traits as Record<TraitKey, number>, // complete ⇒ all six assigned
      experiences: draft.experiences,
      // v0.10.2: weapon/armor may be skipped → left undefined (the fields are optional on CharacterFile).
      weaponPrimaryId: draft.weaponPrimaryId ?? undefined,
      weaponSecondaryId: draft.weaponSecondaryId,
      armorId: draft.armorId ?? undefined,
      inventoryItemIds: draft.inventoryItemIds,
      ...(libraryCards.length ? { libraryCards } : {}),
      ...(enabledCustom.length ? { enabledCardIds: enabledCustom } : {}),
      ...(enabledExpansionIds.length ? { enabledExpansionIds } : {}),
      gold: draft.gold,
      level: 1,
      /**
       * A new hero arrives with its class ALREADY EXPANDED (v0.42.0, owner).
       *
       * "Upon creating a character, the class cards get added to the arsenal fully expanded alongside
       * the subclass card, each page as an individual card." The deck you paged through to CHOOSE the
       * class is a decision aid; what you play with is one card per ability.
       */
      /**
       * v0.42.4 (owner): expanding writes NOTHING.
       *
       * A new character still starts expanded, but that is now a rendering decision rather than a
       * pile of authored cards: the sheet draws the class's own pages as individual cards, in the
       * format creation drew them. See `lib/class-cards`.
       */
      classExpanded: true,
      cardCategory: draft.mixedAncestry ? { [draft.mixedAncestry.second!]: 'abilities' } : {},
    }).catch((e: unknown) => {
      // v0.22.0: this was awaited with NO catch, so a failed write produced no feedback at all.
      // Put the draft back so nothing is lost, and say what happened.
      saveDraft(draft, { deck, picked: [...picked] });
      showToast('Could not save your hero. Your draft is safe, try Forge again.', 'error');
      throw e;
    });
    clearDraft(); // only now: the draft has become a character and must not be offered back
    router.replace({ pathname: '/sheet', params: { id } });
  }, [complete, draft, router, libContent, picked]);

  /**
   * BACK to the encounter, never a second copy of it (v0.36.3, owner).
   *
   * `router.replace('/encounter?id=…')` pushed ANOTHER encounter screen on top of the one we came
   * from, which caused three separate reports:
   *
   *  - Pressing back from the new one landed on the OLD one, still holding the state it had before
   *    the characterize, and its next debounced save wrote that stale copy over the good one. That
   *    is the characterized entry "reverting to an adversary after leaving and coming back".
   *  - The back chevron appeared to do nothing, because it transitioned from an encounter to the
   *    same encounter.
   *  - A characterized ALLY looked like it had not been created at all, for the same reason.
   *
   * Going BACK returns to the screen we left, which reloads on focus and reads the truth off disk.
   */
  const backToEncounter = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(`/encounter?id=${draftRef.current.characterize?.encounterId}` as Href);
  }, [router]);

  /**
   * Forge a CHARACTERIZED adversary or ally (v0.36, owner).
   *
   * Three things happen that ordinary creation does not do, and the order between them matters:
   *
   *  1. Every carried item that survived the first step becomes a custom card in the Arsenal, with
   *     its full text so the DM can read what it does, and the colour it was shown in.
   *  2. The sheet is computed ONCE from everything else the character has, and only then are the
   *     carried thresholds and vitals written as the single difference. That is what makes an 8/14
   *     adversary read 8/14 whatever the class, the level bonuses and the chosen cards come to.
   *  3. The combatant in the encounter is replaced by an entry naming this character, on the side it
   *     was already fighting on, and the character joins both the roster and the adversary library.
   */
  const forgeCharacterized = useCallback(async (from?: Draft) => {
    const d = from ?? draftRef.current;
    const ch = d.characterize;
    if (!ch) return;
    /**
     * A CLASSLESS character (v0.36.2, owner: "Skip and Forge did not forge").
     *
     * Skipping the class clears `className`, and this used to bail on that and say nothing, which is
     * why both Skip and Forge and the header's Forge button went dead once the class was skipped.
     *
     * A saved character has to name a class, because every derived number starts from one. So a
     * skipped class takes a fallback and is MARKED classless: `classless` drops its cards and its
     * name off the sheet, and the carried Evasion and hit points overwrite its numbers, which is the
     * whole reason the step was skippable in the first place. Class can only be skipped when both of
     * those are carried, so nothing of the fallback survives except the shape of the file.
     */
    const classless = !d.className;
    const className = d.className ?? FALLBACK_CLASS;
    setForging(true);
    const id = newCharacterId();
    // The Level step's number wins whenever the DM set one; otherwise the kept items decide, and
    // `keptLevel` already answers 1 when the level card was greyed out. v0.39.0: this used to force
    // 1 whenever the card was greyed out, which threw away a level the DM had chosen by hand.
    const level = d.level ?? keptLevel(carry, carryOff);
    // v0.36.3 (owner): only the Statblock, the weapon and the features become cards. The level is
    // the character's level, and the thresholds, vitals and Evasion ride the Statblock rather than
    // taking three cards to repeat numbers the sheet already prints at the top.
    const carded = cardedItems(carry, carryOff);
    const cardOf = (it: CarryItem, effects: CardEffect[]): CustomCardDef => ({
      id: `cz-${it.id}`,
      title: it.title,
      text: it.text,
      imageUri: null,
      color: carryColor(it.id),
      typeLabel: it.cardLabel,
      target: 'arsenal',
      ...(effects.length ? { effects } : {}),
    });

    const libById = new Map<string, LibraryCard>();
    if (libContent) for (const arr of [libContent.ancestries, libContent.communities, libContent.subclasses, libContent.domains, libContent.armor, libContent.inventory]) for (const c of arr) libById.set(c.id, c);
    const pickedIds = [d.mixedAncestry ? d.mixedAncestry.first : d.ancestryCardId, d.mixedAncestry?.second, d.subclassCardId, d.communityCardId, d.armorId, ...d.domainCardIds, ...d.inventoryLibIds].filter((x): x is string => !!x);
    const libraryCards = [...new Set(pickedIds)].map((pid) => libById.get(pid)).filter((c): c is LibraryCard => !!c);
    const acquired = d.transformationCardId ? [d.transformationCardId] : [];

    const common = {
      schemaVersion: 1 as const,
      id,
      createdAt: new Date().toISOString(),
      name: d.name.trim(),
      portraitUri: d.portraitUri,
      className,
      ...(classless ? { classless: true as const } : {}),
      subclassCardId: d.subclassCardId ?? '',
      ancestryCardId: (d.mixedAncestry ? d.mixedAncestry.first : d.ancestryCardId) ?? '',
      communityCardId: d.communityCardId ?? '',
      domainCardIds: d.domainCardIds,
      traits: d.traits as Record<TraitKey, number>,
      experiences: d.experiences,
      weaponPrimaryId: d.weaponPrimaryId ?? undefined,
      weaponSecondaryId: d.weaponSecondaryId,
      armorId: d.armorId ?? undefined,
      inventoryItemIds: d.inventoryItemIds,
      ...(libraryCards.length ? { libraryCards } : {}),
      ...(acquired.length ? { acquiredCardIds: acquired } : {}),
      ...([...picked].filter((x) => x !== BASE_PICK_ID).length ? { enabledExpansionIds: [...picked].filter((x) => x !== BASE_PICK_ID) } : {}),
      gold: d.gold,
      level,
      characterized: true as const,
      arsenalOnly: true as const,
      // "A characterized adversary that skips the inventory step must have no inventory cards at
      // all, no torches, no rope, no potions" (owner). Working through the step still takes the kit.
      skipStartingKit: !!d.skipped?.includes('inventory'),
    };

    // Pass 1: the same file with the carried cards carrying NOTHING, so the sheet reports what
    // everything else adds up to.
    const provisional = { ...common, customCards: carded.map((it) => cardOf(it, [])) } as CharacterFile;
    const sheet = toSheetCharacter(provisional);
    const have = {
      majorThreshold: sheet.damageThresholds.major,
      severeThreshold: sheet.damageThresholds.severe,
      maxHp: sheet.maxHp,
      stressMax: sheet.stress.total - (sheet.stress.locked ?? 0),
      evasion: sheet.evasion,
    };
    const customCards = carded.map((it) => cardOf(it, heldEffectsFor(it, carry, carryOff, have)));
    // Everything on, at once: a DM reading this sheet wants the true numbers, not a character with
    // its own domain cards and armor switched off waiting to be discovered mid-fight.
    const enabledCardIds = [
      ...customCards.map((c) => c.id),
      ...libraryCards.filter((c) => (c.effects?.length ?? 0) > 0 || c.contentType === 'armor').map((c) => c.id),
      ...(d.armorId ? [d.armorId] : []),
      ...(d.weaponPrimaryId ? [d.weaponPrimaryId] : []),
      ...(d.weaponSecondaryId ? [d.weaponSecondaryId] : []),
      ...d.domainCardIds,
      ...acquired,
    ];
    // v0.36.3 (owner): the Statblock is the FIRST card in the arsenal. `cardOrder` is the same
    // field a player's own drag writes, so nothing new is needed and the DM can drag it elsewhere.
    const lead = customCards.find((c) => c.id === 'cz-carry-statblock')?.id;
    const file = {
      ...common,
      customCards,
      enabledCardIds: [...new Set(enabledCardIds)],
      ...(lead ? { cardOrder: { abilities: [lead] } } : {}),
    } as CharacterFile;

    try {
      await saveCharacter(file);
      // The encounter entry: same combatant, same side, now naming a character.
      const enc = await getEncounter(ch.encounterId);
      if (enc) {
        const swap = (c: Combatant): Combatant => (c.id === ch.combatantId ? { ...c, charId: id, name: file.name, portraitUri: file.portraitUri ?? c.portraitUri } : c);
        await saveEncounter({
          ...enc,
          adversaries: enc.adversaries.map(swap),
          allies: enc.allies.map((a) => (a.kind === 'npc' ? { kind: 'npc' as const, combatant: swap(a.combatant) } : a)),
          charVitals: { ...(enc.charVitals ?? {}), [id]: initialVitals(file) },
        });
        // Into the library too, in its own section, so it can be brought back in a later fight.
        const held = [...enc.adversaries, ...enc.allies.flatMap((a) => (a.kind === 'npc' ? [a.combatant] : []))].find((c) => c.id === ch.combatantId);
        if (held) {
          const lib = await loadAdversaries();
          await saveAdversaries(addTemplate(lib, { ...held, charId: id, name: file.name }));
        }
        // An ALLY is offered to the party; an adversary is not, because the app should not suggest
        // recruiting the villain. Either way the character is on the roster and can be added by hand.
        if (ch.side === 'ally') {
          const ses = await getSession(enc.sessionId);
          const party = ses ? await getParty(ses.partyId) : null;
          if (party && !party.memberIds.includes(id)) {
            setForging(false);
            setJoinParty({ charId: id, name: file.name, party });
            return;
          }
        }
      }
    } catch (e: unknown) {
      setForging(false);
      showToast('Could not save this character. Nothing was changed.', 'error');
      throw e;
    }
    clearDraft();
    backToEncounter();
  }, [carry, carryOff, carryColor, libContent, picked, backToEncounter]);

  /** Write an experience into its slot. Shared so the quick flow and the full editor cannot drift. */
  const saveExperience = useCallback((slot: number, d: { title: string; imageUri: string | null; color: string | null; effects?: CardEffect[] }) => {
    const next = [...draft.experiences];
    const existing = next[slot];
    next[slot] = { id: existing?.id ?? `exp-${Date.now().toString(36)}`, title: d.title, text: '', imageUri: d.imageUri, color: d.color, effects: d.effects, modifier: existing?.modifier ?? 2 };
    set({ experiences: next.filter(Boolean) });
    setEditingExperience(null);
  }, [draft.experiences, set]);

  /**
   * v0.42.6 (owner): the picture is POSITIONED before it is kept.
   *
   * "On both web and native i want when I upload a portrait I wish to be able to reposition / zoom /
   * crop the image that I upload."
   *
   * The picker's own `allowsEditing` was turned off in #155 because its native crop box is square on
   * Android and cannot be told otherwise. `components/image-cropper` is the app's own, the same on
   * both platforms, and cropped to the portrait's real 3:4.
   */
  const [croppingPortrait, setCroppingPortrait] = useState<string | null>(null);
  const pickPortrait = useCallback(async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (!res.canceled && res.assets[0]) setCroppingPortrait(res.assets[0].uri);
  }, []);

  /** Read by the two skip paths, which must never land the DM on a step they cannot open. */
  const lockedRef = useRef<(k: DeckKey) => boolean>(() => false);
  const locked = (k: DeckKey) =>
    ((k === 'subclass' || k === 'domains') && !draft.className) || !!deckList.find((d) => d.key === k)?.stub; // stubs land next issue
  lockedRef.current = locked;
  const maxSelect = deck === 'domains' || deck === 'inventory' || (deck === 'ancestry' && !!draft.mixedAncestry) ? 2 : 1;
  // 'domains' used to fall back to the word 'card' — the least specific label in the app, on the one
  // step where you pick two. It only shows now when the centred card's own name is too long to fit.
  const noun = deck === 'weapons' ? weaponSlot : deck === 'class' ? 'class' : deck === 'domains' ? 'domain card' : deck === 'armor' ? 'armor' : deck;
  const centerItem = items[Math.min(centerIdx, Math.max(0, items.length - 1))];
  const allCarryOff = carry.length > 0 && carryOff.size >= carry.length;
  const [skipMenu, setSkipMenu] = useState(false);
  /**
   * Every step of creation as one list (v0.36.1, owner).
   *
   * `done` is deliberately SKIP-BLIND: a step that is only "done" because it was skipped is not an
   * answer, and marking it as one would make the warning about losing answers meaningless. Transform
   * is always listed, greyed when no enabled expansion offers any, because a step missing from the
   * list looks like the list is wrong rather than like the content is off.
   */
  const skipRows = useMemo<SkipStepRow[]>(() => {
    const rows: SkipStepRow[] = [
      { key: 'name', label: 'Name', skippable: true, skipped: !!draft.nameSkipped, done: !!draft.touched?.includes('name') },
    ];
    for (const d of deckList) {
      const classRow = d.key === 'class';
      rows.push({
        key: d.key,
        label: d.label,
        skippable: !classRow || classOptional,
        skipped: !!draft.skipped?.includes(d.key),
        // Touched, not merely answered: an inherited value is not something the DM filled in.
        done: !!draft.touched?.includes(d.key),
        note: classRow && !classOptional ? 'Gives the numbers' : undefined,
      });
    }
    if (!transformationsOn) {
      // Listed but off, so the DM can see the step exists and why it is not offered.
      const at = rows.findIndex((r) => r.key === 'ancestry');
      rows.splice(at + 1, 0, { key: 'transformation', label: 'Transform', skippable: false, skipped: false, done: false, note: 'No pack enabled' });
    }
    return rows;
  }, [deckList, draft, classOptional, transformationsOn]);
  /**
   * SKIP (v0.36, owner): answer a step with nothing and move on.
   *
   * Characterize only, and never on Class, which is the one thing a character cannot be without. It
   * sits beside Random because that is where the thumb already is, and because the two are the same
   * kind of control: a way past a decision you do not want to make card by card.
   */
  const skipStep = useCallback(() => {
    const k = deckRef.current;
    playSfx('buttonTap');
    // The same reset the menu applies, so the two ways of skipping cannot mean different things.
    setDraft((d) => ({ ...d, ...defaultRef.current(k), skipped: [...new Set([...(d.skipped ?? []), k])] }));
    const skipped = [...(draftRef.current.skipped ?? []), k];
    const order = decksRef.current.filter((x) => !x.stub && !lockedRef.current(x.key));
    const at = order.findIndex((x) => x.key === k);
    const next = order.slice(at + 1).find((x) => !deckDone(x.key, { ...draftRef.current, skipped }));
    if (next) switchDeckRef.current(next.key);
  }, []);
  const SkipStep = useCallback(
    () =>
      // v0.36.2 (owner): TRANSFORMATION is skippable in ordinary creation too. It is the one step a
      // player can reach without having asked for it (enabling the pack turns it on for everyone),
      // so it is also the one step outside characterize that has to be answerable with nothing.
      (characterizing ? deck !== 'class' && deck !== 'carry' : deck === 'transformation') ? (
        <RuneButton label={draft.skipped?.includes(deck) ? 'Skipped' : 'Skip'} kind="ghost" dense height={30} muteSfx onPress={skipStep} accessibilityLabel={`Skip ${deck}`} />
      ) : null,
    [characterizing, deck, draft.skipped, skipStep],
  );
  const centerSelected = !!centerItem && selectedIds.includes(centerItem.id);
  // Live mirrors for the keyboard listener, which is registered once and must never close over a
  // stale render. `overlayUp` is everything that covers the creator and therefore owns the keyboard.
  const overlayUpRef = useRef(false);
  overlayUpRef.current = leaveConfirm || !!resumeOffer || pickerOpen || editingExperience !== null || !!expAdvanced || loaderUp;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;
  const deckRef = useRef(deck);
  deckRef.current = deck;
  const switchDeckRef = useRef(switchDeck);
  switchDeckRef.current = switchDeck;
  const decksRef = useRef(deckList);
  decksRef.current = deckList;
  const defaultRef = useRef(stepDefault);
  defaultRef.current = stepDefault;

  /**
   * Keyboard control for the creator (v0.29.0). Web only, and a no-op on a phone.
   *
   * The sheet has had this since v0.26.0 and the creator never did, so on a desktop the one screen
   * where you look through a hundred cards was the one screen you had to drag through with a mouse.
   * The meaning of each key comes from the same pure resolver the sheet uses (`intentFor`), so the
   * two screens cannot drift apart and every awkward case stays a table test.
   *
   * The intents map onto what a creator can actually do: move along the deck, open and close a card,
   * SELECT the centred card (Space, the same key that equips on the sheet), and cross sections with
   * Shift plus up or down, which is what changing category means here.
   */
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      const intent = intentFor(
        { key: e.key, shift: e.shiftKey, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey },
        {
          typing: tag === 'INPUT' || tag === 'TEXTAREA' || !!t?.isContentEditable,
          // Anything covering the creator owns the keyboard: a card editor, the expansion picker,
          // the leave prompt, the tour.
          overlay: overlayUpRef.current,
          focused: !!carouselRef.current?.isFullscreen(),
          editing: false, // the creator has no edit mode
        },
      );
      if (!intent) return;
      const car = carouselRef.current;
      switch (intent.kind) {
        case 'move':
          car?.stepBy(intent.step);
          break;
        case 'focus':
          car?.focusCentre();
          break;
        case 'unfocus':
          car?.closeIfFullscreen();
          break;
        case 'toggle': {
          // Space picks the card in the middle, which is the creator's whole job.
          const it = itemsRef.current[Math.min(car?.centerIndex() ?? 0, Math.max(0, itemsRef.current.length - 1))];
          if (it) {
            playSfx(selectedIdsRef.current.includes(it.id) ? 'cardDeselect' : 'cardSelect');
            onToggleRef.current(it.id);
          }
          break;
        }
        case 'category': {
          const order = decksRef.current.filter((d) => !d.stub).map((d) => d.key);
          const at = order.indexOf(deckRef.current);
          const to = order[Math.min(order.length - 1, Math.max(0, at + intent.step))];
          if (to && to !== deckRef.current) switchDeckRef.current(to);
          break;
        }
        case 'dismiss':
          if (!car?.closeIfFullscreen()) return; // nothing of ours was open; let the app handle it
          break;
        default:
          return; // confirm and the rest belong to whatever is on top
      }
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // v0.10.2 (Feature 2): a per-section Random button. Picks a valid random choice for the CURRENT deck,
  // honoring dependencies (subclass/domains follow the class). Experiences stay manual (freeform text).
  /**
   * Swap which mixed ancestry keeps its FIRST trait and which keeps its SECOND (v0.29.0).
   *
   * The whole selection is derived from this one pair: which effects survive
   * (`isAncestryEffectDisabled` compares the slot against ANCESTRY_EFFECT_TRAIT), which half of each
   * card is struck through, and which card is the origin card on the sheet. So the swap is the swap,
   * and everything else follows on the next render. Nothing is baked into a card bitmap either: the
   * cross-out is drawn as an overlay over the card, so no cached picture goes stale.
   *
   * Guarded on both slots being filled, which is also what greys the button out. Swapping a half-made
   * pair would move the one pick to the far slot, which is a confusing way to lose your place.
   */
  const reverseMix = useCallback(() => {
    const m = draftRef.current.mixedAncestry;
    if (!m?.first || !m?.second) return;
    playSfx('cardSelect');
    set({ mixedAncestry: { first: m.second, second: m.first } });
  }, [set]);

  const randomize = useCallback(() => {
    const pick = <T,>(a: T[]): T | undefined => (a.length ? a[Math.floor(Math.random() * a.length)] : undefined);
    const two = <T,>(a: T[]): T[] => { const p = [...a]; const o: T[] = []; while (p.length && o.length < 2) o.push(p.splice(Math.floor(Math.random() * p.length), 1)[0]); return o; };
    playSfx('cardSelect');
    let focusId: string | undefined; // the picked card to recenter the carousel on (Feature 2)
    switch (deck) {
      case 'class': { const k = pick(creationClassCards.map((c) => c.key)); if (k) { set({ className: k, subclassCardId: null, domainCardIds: [] }); focusId = `class-${k}`; } break; }
      case 'subclass': { if (!draft.className) break; const id = pick(CATALOG.filter((c) => c.kind === 'subclass' && c.className === draft.className && c.tier === 1 && (!c.expansion || picked.has(c.expansion))).map((c) => c.id)); if (id) { set({ subclassCardId: id }); focusId = id; } break; }
      case 'ancestry': {
        const anc = CATALOG.filter((c) => c.kind === 'ancestry' && (!c.expansion || picked.has(c.expansion))).map((c) => c.id);
        if (draft.mixedAncestry) {
          // Feature 3: fill the first EMPTY slot in order; if both are full, alternate which one re-rolls.
          // Re-rolling avoids the other slot's card AND its own current card so the pick visibly changes.
          const { first, second } = draft.mixedAncestry;
          const { slot, alt } = nextMixSlot(first, second, mixRollNext.current);
          mixRollNext.current = alt;
          const other = slot === 'first' ? second : first;
          const current = slot === 'first' ? first : second;
          const fresh = anc.filter((id) => id !== other && id !== current);
          const id = pick(fresh.length ? fresh : anc.filter((x) => x !== other));
          if (id) { set({ mixedAncestry: { ...draft.mixedAncestry, [slot]: id } }); focusId = id; }
          break;
        }
        const id = pick(anc); if (id) { set({ ancestryCardId: id, mixedAncestry: null }); focusId = id; }
        break;
      }
      case 'transformation': { const id = pick(CATALOG.filter((c) => c.kind === 'transformation').map((c) => c.id)); if (id) { set({ transformationCardId: id }); focusId = id; } break; }
      case 'community': { const id = pick(CATALOG.filter((c) => c.kind === 'community' && (!c.expansion || picked.has(c.expansion))).map((c) => c.id)); if (id) { set({ communityCardId: id }); focusId = id; } break; }
      case 'domains': { if (!draft.className) break; const pool = classInfo(draft.className).domains.flatMap((d) => CATALOG.filter((c) => c.kind === 'domain' && c.domain === d && c.level === 1 && (!c.expansion || picked.has(c.expansion)))).map((c) => c.id); const picks = two(pool); set({ domainCardIds: picks }); focusId = picks[picks.length - 1]; break; }
      case 'weapons': { const w = pick(PRIMARY_WEAPONS.filter((x) => x.kind === weaponKind && (!x.expansion || picked.has(x.expansion)))); if (w) { set({ weaponPrimaryId: w.id, weaponsSkipped: false, ...(w.burden === 'Two-Handed' ? { weaponSecondaryId: null } : {}) }); focusId = w.id; } break; }
      case 'armor': { const id = pick(TIER1_ARMOR.filter((a) => !a.expansion || picked.has(a.expansion)).map((a) => a.id)); if (id) { set({ armorId: id, armorSkipped: false }); focusId = id; } break; }
      case 'inventory': { if (!draft.className) break; const groups = CLASS_INVENTORY[draft.className]?.choices ?? []; const picks = groups.map((g) => itemOptionId(g[Math.floor(Math.random() * g.length)])); set({ inventoryItemIds: picks, inventorySkips: [], inventorySkipped: false }); focusId = picks[invChoice] ?? picks[picks.length - 1]; break; }
    }
    if (focusId) {
      const idx = items.findIndex((it) => it.id === focusId);
      if (idx >= 0) carouselRef.current?.scrollTo(idx);
    }
  }, [deck, draft.className, draft.mixedAncestry, weaponKind, invChoice, items, set, picked, creationClassCards]);

  return (
    <AppScreen
      dm={authoring}
      title={authoring ? (campaignExp?.name ?? 'Campaign settings') : 'New hero'}
      onBack={() => {
        // Authoring writes as it goes, so leaving is leaving. Nothing is half-saved and there is
        // nothing to warn about.
        if (authoring) { router.back(); return; }
        if (draftHasContent(draft)) setLeaveConfirm(true); else { clearDraft(); router.back(); }
      }}
      // v0.25.0: Forge is DIM until the character is finished, so the button reports readiness instead
      // of claiming it from the first screen. It stays tappable on purpose: tapping it while
      // incomplete jumps to the step that is missing, which is more use than a dead control, and a
      // truly dead Forge with no explanation is the thing this replaced in the first place.
      headerRight={
        authoring ? (
          // v0.42.3: Done, not Forge. Nothing is being built; the rules are already saved.
          <RuneButton dm label="Done" kind="primary" height={26} dense onPress={() => router.back()} accessibilityLabel="Finish setting the campaign rules" />
        ) : (
        <RuneButton
          label={forging ? 'Forging' : 'Forge'}
          kind={complete ? 'primary' : 'ghost'}
          height={26}
          dense
          disabled={forging}
          onPress={() => {
            if (forging) return;
            if (!complete) { jumpToMissing(); return; }
            // v0.36.2 (owner): never fail in silence. Forge either runs or says why it cannot.
            void (characterizing ? forgeCharacterized() : forge()).catch(() => showToast('Could not forge this character. Nothing was changed.', 'error'));
          }}
          accessibilityLabel={complete ? 'Create character' : `Create character, still needs ${missingLabel ?? 'more'}`}
        />
        )
      }>
      <Animated.View style={[{ flex: 1 }, entryStyle]}>
        {/**
          * WHAT THIS SCREEN IS (v0.42.4, owner).
          *
          * "Replace the Name and Portrait section (Details) and replace it with an explanation that
          * selecting anything in this UI will remove it from the character creation options."
          *
          * A campaign has no name and no portrait; the pack it lives in has both. Standing here with
          * a Name field was the screen telling the DM it was something it is not.
          */}
        {authoring ? (
          /**
           * ONE LINE (v0.42.5, owner: "the description on top is too big, pushing the interface down
           * on top of the cards and making the cards less legible, make the description that replaced
           * the details section from character creation be more compact").
           *
           * Three paragraphs of explanation on a screen whose entire job is looking at cards is three
           * paragraphs in the way. The tour says the rest; this says the one thing a DM needs to have
           * in mind while their thumb is on the button, and the warnings below say the rest when they
           * actually matter.
           */
          <View style={{ paddingTop: 6, paddingBottom: 2, gap: 4 }}>
            <Text style={{ color: Rune.goldText, fontSize: 10.5, fontFamily: Body.bold, letterSpacing: 1.4, textTransform: 'uppercase', textAlign: 'center' }}>
              Removing takes it out of creation
            </Text>
            {warnings.length ? (
              <ChamferBox chamfer={7} fill="rgba(120,30,28,0.22)" stroke={Rune.red} strokeWidth={1.1} style={{ paddingHorizontal: 10, paddingVertical: 7, gap: 3 }}>
                {warnings.map((w) => (
                  <Text key={w.text} style={{ color: Rune.sheet, fontSize: 10.5, fontFamily: Body.regular, lineHeight: 14 }}>{w.text}</Text>
                ))}
              </ChamferBox>
            ) : null}
          </View>
        ) : (
        <>
        {/* ---- details ---- */}
        <SectionDivider label="Details" />
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
          {/* portrait well (left) */}
          <Pressable onPress={pickPortrait} accessibilityRole="button" accessibilityLabel={draft.portraitUri ? 'Change portrait' : 'Add a portrait'}>
            {({ pressed }) => (
              <ChamferBox
                chamfer={10}
                fill={pressed ? 'rgba(20,24,31,0.95)' : 'rgba(14,17,22,0.9)'}
                stroke="rgba(218,162,73,0.5)"
                strokeWidth={1.2}
                style={{ width: 100, height: 128, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {draft.portraitUri ? (
                  <ChamferedImage uri={draft.portraitUri} width={100} height={128} chamfer={10} />
                ) : (
                  <Svg width={30} height={30} viewBox="0 0 26 26">
                    <Circle cx={13} cy={9} r={4.4} fill="none" stroke={Rune.goldEdge} strokeWidth={1.8} />
                    <Path d="M 3.5 23 Q 13 14 22.5 23" fill="none" stroke={Rune.goldEdge} strokeWidth={1.8} />
                  </Svg>
                )}
              </ChamferBox>
            )}
          </Pressable>
          {/* name + caption (top) and the add-image button pinned to the BOTTOM so its lower edge
              lines up with the bottom of the (now portrait-oriented) frame (#135). */}
          <View style={{ flex: 1, justifyContent: 'space-between' }}>
            <View style={{ gap: 6 }}>
              <ChamferBox chamfer={8} fill="rgba(14,17,22,0.9)" stroke="rgba(218,162,73,0.5)" strokeWidth={1.2} style={{ height: 48, justifyContent: 'center', paddingHorizontal: 13 }}>
                <TextInput
                  value={draft.name}
                  onChangeText={(name) => { unskip('name'); set({ name }); }}
                  ref={nameRef}
                  placeholder="Name"
                  placeholderTextColor={Rune.muted}
                  selectionColor={Rune.goldBright}
                  maxLength={40}
                  style={{ color: Rune.sheet, fontSize: 16, fontFamily: Body.semibold, letterSpacing: 0.4, padding: 0 }}
                  accessibilityLabel="Character name"
                />
              </ChamferBox>
              <Text style={{ color: Rune.muted, fontSize: 10, fontFamily: Body.medium, lineHeight: 14 }}>Portrait optional, it sits in the {"sheet's"} portrait frame.</Text>
            </View>
            <RuneButton label={draft.portraitUri ? 'Change image' : 'Add image'} kind="ghost" height={32} onPress={pickPortrait} />
          </View>
        </View>

        </>
        )}
        {/* ---- cards ---- */}
        <View style={{ marginTop: 6 }}>
          <SectionDivider label="Cards" />
        </View>
        {/* v0.22.0: aggregate progress. The rail carried per-step ticks but nothing said how close
            you were overall, and the NAME requirement wasn't on the rail at all — so ten gold ticks
            plus a dead Forge button had no explanation. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, marginBottom: 2 }}>
          <Text style={{ color: complete ? Rune.goldBright : Rune.bronze, fontSize: 10, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>
            {stepsDone} / {steps}
          </Text>
          <View style={{ flex: 1, height: 2, backgroundColor: 'rgba(218,162,73,0.2)' }}>
            <View style={{ width: `${(stepsDone / steps) * 100}%`, height: 2, backgroundColor: complete ? Rune.goldBright : Rune.gold }} />
          </View>
          <Text numberOfLines={1} style={{ color: Rune.muted, fontSize: 10, fontFamily: Body.medium, maxWidth: 150 }}>
            {complete ? 'Ready to forge' : `Next: ${missingLabel}`}
          </Text>
        </View>
        {/* The deck rail (#107, nine steps): fixed-width tabs, free scroll. A thin custom scroll
            indicator (#110) tracks position instead of the old static chevron. */}
        <DeckRail>
          {deckList.map((d) => (
            <DeckTab
              key={d.key}
              deck={d.key}
              label={d.label}
              active={deck === d.key}
              done={!d.stub && deckDone(d.key, draft)}
              locked={locked(d.key)}
              pulseToken={d.key === 'domains' || d.key === 'subclass' ? unlockPulse : 0}
              onPress={() => switchDeck(d.key)}
            />
          ))}
        </DeckRail>

        {/* ---- the forge content: card carousel, or the traits/experiences builders ---- */}
        {/* a relative container so the deck-swap loader can sit AT the card rest position, not the
            top of the content (#150 follow-up) */}
        <View style={{ flex: 1, marginTop: 0 }}>
        <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, fadeStyle]}>
          {/* weapons filter toggles (#121): physical/magic primaries, plus primary/secondary slot.
              flexWrap so the two controls can NEVER overflow the screen margins onto the SVG border
              (#121, owner) — they wrap to a second centered row on a narrow width instead. */}
          {deck === 'weapons' ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 4, paddingHorizontal: 4 }}>
              {weaponSlot === 'primary' ? (
                <Segmented
                  options={[
                    { key: 'physical', label: 'Physical' },
                    { key: 'magic', label: 'Magic' },
                  ]}
                  value={weaponKind}
                  onChange={setWeaponKind}
                />
              ) : null}
              <Segmented
                options={[
                  { key: 'primary', label: 'Primary' },
                  { key: 'secondary', label: 'Secondary', disabled: !secondaryAllowed },
                ]}
                value={weaponSlot}
                onChange={setWeaponSlot}
              />
            </View>
          ) : null}
          {/* v0.26.0: the guide's two inventory choices, one at a time, presented exactly like the
              weapon slots above so the pattern is already familiar by the time it appears. */}
          {deck === 'inventory' && (draft.className ? CLASS_INVENTORY[draft.className].choices.length > 1 : false) ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 4, paddingHorizontal: 4 }}>
              <Segmented
                options={[
                  { key: '0', label: 'Choice 1' },
                  { key: '1', label: 'Choice 2' },
                ]}
                value={String(invChoice)}
                onChange={(k) => setInvChoice(k === '1' ? 1 : 0)}
              />
            </View>
          ) : null}
          {isCarouselDeck(deck) && items.length > 0 ? (
            <Animated.View style={[{ flex: 1 }, modeFadeStyle]}>
              <StraightCarousel
                ref={carouselRef}
                key={deck + (deck === 'weapons' ? `${weaponKind}-${weaponSlot}` : deck === 'inventory' ? String(invChoice) : deck === 'subclass' || deck === 'domains' ? (draft.className ?? '') : '')}
                items={items}
                selectedIds={selectedIds}
                crossOuts={deck === 'ancestry' ? ancestryCrossOuts : undefined}
                reserveBottom={CONTROLS_BAND}
                // v0.36.1 (owner): the LEFT of the two middles. With two cards `floor(n/2)` opened on
                // the last one, so the deck arrived already scrolled to the end, which reads as a
                // mistake. `floor((n-1)/2)` is the true middle for odd counts and the left one for even.
                initialIndex={deckIndexes.current[deck] ?? Math.floor((items.length - 1) / 2)}
                onIndexChange={onCenterIdx}
              />
            </Animated.View>
          ) : null}
          {deck === 'traits' ? (
            characterizing ? (
              <CharacterizeTraitsTab traits={draft.traits} initial={inheritedTraits} onTraits={(traits) => { unskip('traits'); set({ traits }); }} footer={<SkipStep />} />
            ) : (
              <TraitsTab traits={draft.traits} onTraits={(traits) => set({ traits })} spellcastTrait={spellcastTraitForSubclass(draft.subclassCardId ? cardById(draft.subclassCardId)?.subclass : undefined)} />
            )
          ) : null}
          {deck === 'level' ? (
            // v0.39.0 (owner): leaving the inherited level behind sets the DEFAULT to 1, it does not
            // lock the step. This used to read `carryOff.has('carry-level') ? 1 : draft.level`, so
            // greying the card out pinned the display at 1 and the stepper, Random and Reset all
            // appeared dead: they were writing a level nothing ever showed.
            <LevelTab
              level={draft.level ?? (carryOff.has('carry-level') ? 1 : levelForStatBlock(statBlock?.tier, statBlock?.difficulty))}
              derived={carryOff.has('carry-level') ? 1 : levelForStatBlock(statBlock?.tier, statBlock?.difficulty)}
              onLevel={(n) => { unskip('level'); set({ level: n }); }}
              footer={<SkipStep />}
            />
          ) : null}
          {deck === 'experiences' ? <ExperiencesTab experiences={draft.experiences} onEdit={(slot) => setEditingExperience(slot)} /> : null}
          {deck === 'experiences' && characterizing ? (
            <View style={{ alignItems: 'center', paddingBottom: 14 }}>
              <SkipStep />
            </View>
          ) : null}
        </Animated.View>
        {pendingDeck ? <DeckLoader /> : null}
        </View>
      </Animated.View>
      {/* v0.26.0: experiences are authored through the SAME quick flow as cards on the sheet.
          Two ways to make a thing was one too many, and the quick flow is the better one here: an
          experience is a short phrase, which is exactly what it is built for. Advanced is one tap
          away and carries the draft, so nothing that was possible before has been taken away. */}
      {editingExperience != null ? (
        expAdvanced ? (
          <CardEditor
            kindLabel="Experience"
            experienceMode
            modifier={draft.experiences[editingExperience]?.modifier ?? 2}
            initial={expAdvanced}
            onCancel={() => { setExpAdvanced(null); setEditingExperience(null); }}
            onSave={(d) => { saveExperience(editingExperience, d); setExpAdvanced(null); }}
          />
        ) : (
          <QuickCardFlow
            kindLabel="Experience"
            initial={draft.experiences[editingExperience] ? { title: draft.experiences[editingExperience].title, text: draft.experiences[editingExperience].text, imageUri: draft.experiences[editingExperience].imageUri, color: draft.experiences[editingExperience].color ?? null, effects: draft.experiences[editingExperience].effects ?? [] } : undefined}
            onCancel={() => setEditingExperience(null)}
            onAdvanced={(d) => setExpAdvanced(d)}
            onSave={(d) => saveExperience(editingExperience, d)}
          />
        )
      ) : null}
      {/* ---- THE select controls: the screen's TOP layer (#106) — above the carousel veil AND
          the features reader, never dimmed, always tappable, one spot. Card decks only. Hierarchy
          top-to-bottom (#108): SELECT (primary, biggest) → CLASS FEATURES → the n/n counter. */}
      {isCarouselDeck(deck) ? (
        // Weapons sits its cluster lower (the filter toggles push its carousel down, so the cards
        // reach further into this band) — the buttons must never overlap the carousel (owner).
        <Animated.View style={[{ position: 'absolute', left: 0, right: 0, bottom: 14, zIndex: 600, alignItems: 'center', gap: 6 }, fadeStyle]} pointerEvents="box-none">
          {(() => {
            /**
             * REMOVE, not SELECT (v0.42.4, owner).
             *
             * "Change the red button that reads 'Select X' to 'Remove X' to be more intuitive."
             *
             * A red primary button saying SELECT SUMMONER, which BANS the Summoner, was the screen
             * saying the opposite of what it did. It reads Remove while the card is available and
             * Restore while it is not, so the label is always the thing about to happen.
             */
            const short = centerItem?.label && centerItem.label.length <= 16 ? centerItem.label : noun;
            const removed = authoring && !!centerItem && !isOptionOn(campaign, deck, centerItem.id);
            const label = authoring
              ? removed ? `Restore ${short}` : `Remove ${short}`
              : deck === 'carry'
                ? carryOff.has(centerItem?.id ?? '') ? 'Keep this' : 'Leave this behind'
                : centerSelected ? 'Deselect' : `Select ${short}`;
            return (
              <RuneButton
                label={label}
                kind={authoring ? (removed ? 'ghost' : 'primary') : deck === 'carry' ? (carryOff.has(centerItem?.id ?? '') ? 'primary' : 'ghost') : centerSelected ? 'ghost' : 'primary'}
                height={40}
                muteSfx
                onPress={() => {
                  if (!centerItem) return;
                  // #258: selecting a card uses the card-select/deselect chime, not the generic tap.
                  playSfx(centerSelected || (deck === 'carry' && !carryOff.has(centerItem.id)) ? 'cardDeselect' : 'cardSelect');
                  onToggle(centerItem.id);
                }}
                accessibilityLabel={authoring
                  ? label
                  : deck === 'carry' ? (carryOff.has(centerItem?.id ?? '') ? `Carry ${centerItem?.label ?? 'this'}` : `Leave ${centerItem?.label ?? 'this'} behind`) : centerSelected ? `Deselect ${centerItem?.label ?? noun}` : `Select ${centerItem?.label ?? noun}`}
              />
            );
          })()}
          {/* v0.10.2 (Feature 2): roll a random valid choice for this section. */}
          {/* v0.29.0: on the ancestry step in MIXED mode, the reverse control sits BESIDE Random rather
              than under it. The controls band is a fixed 102dp and the existing stack already uses 95
              of it, so a new row would push the cards up; a 30dp square next to a 30dp dense button
              costs nothing. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {/* v0.36: the carry step has no Random. Nothing here is a choice to roll for, it is a
                review of what the stat block said, so its second control clears the lot instead. */}
            {deck === 'carry' ? (
              <RuneButton
                label={allCarryOff ? 'Reset' : 'Select all'}
                kind="ghost"
                dense
                height={30}
                muteSfx
                onPress={() => { playSfx(allCarryOff ? 'cardSelect' : 'cardDeselect'); set({ carryDisabled: allCarryOff ? [] : carry.map((it) => it.id) }); }}
                accessibilityLabel={allCarryOff ? 'Carry everything again' : 'Carry nothing'}
              />
            ) : authoring ? (
              /**
               * TOGGLE ALL (v0.42.4, owner: "replace the random button with a Toggle All button to
               * set all to enabled or all to disabled").
               *
               * Rolling a random card to BAN is not a thing anybody wants. What a DM wants on this
               * step is "none of these, then let me put three back", which is one press and then
               * three. If anything is still available it clears the step; if nothing is, it restores
               * the lot.
               */
              (() => {
                const keys = rawItems.map((it) => optionKey(deck, it.id));
                const anyOn = keys.some((k) => !(campaign.disabled ?? []).includes(k));
                return (
                  <RuneButton
                    label={anyOn ? 'Remove all' : 'Restore all'}
                    kind="ghost"
                    dense
                    height={30}
                    muteSfx
                    onPress={() => {
                      playSfx(anyOn ? 'cardDeselect' : 'cardSelect');
                      setDraftCampaign((cs) => {
                        const next = setKeys(cs ?? EMPTY_CAMPAIGN_SETTINGS, keys, !anyOn);
                        return syncSteps(next, [{ deck, keys }]);
                      });
                    }}
                    accessibilityLabel={anyOn ? `Remove every ${noun}` : `Restore every ${noun}`}
                  />
                );
              })()
            ) : (
              <RuneButton label="Random" kind="ghost" dense height={30} muteSfx onPress={randomize} accessibilityLabel={`Random ${noun}`} />
            )}
            {deck === 'ancestry' && draft.mixedAncestry ? <MixReverseButton mixed={draft.mixedAncestry} onReverse={reverseMix} /> : null}
            {/* v0.36.1 (owner): the class step's Skip is the whole checklist instead, because a class
                is the one step you cannot answer with nothing and the one you always answer first. */}
            {/* v0.36.2 (owner): also on INHERIT, which is where a DM lands first and where they already know
                how little this character needs. */}
            {characterizing && (deck === 'class' || deck === 'carry') ? <SkipMenuButton armed={deck === 'carry' || !!draft.className || classOptional} onPress={() => { playSfx('buttonTap'); setSkipMenu(true); }} /> : <SkipStep />}
          </View>
          {/* v0.10.6: the class/weapons hint tooltips were removed — they pushed these buttons up into
              the card carousel (owner). */}
          {authoring ? (
            /**
             * The STEP switch (v0.42.3, owner: "keep that but MAKE SURE IT USES THE FUCKING EXISTING
             * CHARACTER CREATION UI"). It sits where the pick counter sits when playing, because it
             * answers the same question about this step: what does it hold?
             */
            <Pressable
              onPress={() => { playSfx('buttonTap'); setDraftCampaign((cs) => toggleKey(cs ?? EMPTY_CAMPAIGN_SETTINGS, stepKey(deck))); }}
              hitSlop={8}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isStepOn(campaign, deck) }}
              accessibilityLabel={`This step is ${isStepOn(campaign, deck) ? 'in' : 'not in'} the campaign`}>
              <Text style={{ color: isStepOn(campaign, deck) ? Rune.goldBright : '#E2705A', fontSize: 11, fontFamily: Body.bold, letterSpacing: 1.2 }}>
                {isStepOn(campaign, deck) ? 'STEP IS ON' : 'STEP IS OFF'}
              </Text>
            </Pressable>
          ) : (
          <Text style={{ color: (deck === 'inventory' ? draft.inventoryItemIds.length : selectedIds.length) >= maxSelect ? Rune.goldBright : Rune.muted, fontSize: 11, fontFamily: Body.bold, letterSpacing: 1.2 }}>
            {deck === 'carry' ? `Carrying ${carry.length - carryOff.size}/${carry.length}` : deck === 'inventory' ? `Picked ${draft.inventoryItemIds.length}/2` : `Picked ${selectedIds.length}/${maxSelect}`}
          </Text>
          )}
        </Animated.View>
      ) : null}
      {stage}
      {loaderUp ? <CreateLoader done={loaderDone} onHidden={() => setLoaderUp(false)} /> : null}
      {/* v0.12.2: the per-character expansion picker — shown once the entry loader clears and the installed
          expansions are known. Base defaults checked (plus any expansion enabled-for-creation); confirming
          finalizes `picked`, which gates every content list above. */}
      {/* v0.42.6: position it, then own it. `ownImage` copies out of the picker's cache directory,
          which an app update is free to clear (v0.26.0), so it runs on the CROPPED file. */}
      {croppingPortrait ? (
        <ImageCropper
          uri={croppingPortrait}
          aspect={3 / 4}
          title="Position your portrait"
          onCancel={() => setCroppingPortrait(null)}
          onDone={(r) => { setCroppingPortrait(null); void ownImage(r.uri).then((uri) => set({ portraitUri: uri })); }}
        />
      ) : null}
      {pickerOpen && expansions && !loaderUp ? (
        <ExpansionPicker
          expansions={expansions}
          initial={new Set([BASE_PICK_ID, ...expansions.filter(isEnabledForCreation).map((e) => e.id)])}
          onConfirm={(p) => { setPicked(p); setPickerOpen(false); }}
        />
      ) : null}

      {/* v0.22.0: leaving used to discard everything with no prompt. */}
      {leaveConfirm ? (
        <PopupDialog
          title="Leave character creation?"
          body="Your progress is saved as a draft, you can pick it up next time you start a new hero. Discard it instead to start clean."
          confirmLabel="Keep draft & leave"
          onConfirm={() => { setLeaveConfirm(false); router.back(); }}
          onCancel={() => setLeaveConfirm(false)}>
          <View style={{ marginTop: 16 }}>
            <RuneButton label="Discard draft" kind="ghost" height={40} onPress={() => { clearDraft(); setLeaveConfirm(false); router.back(); }} />
          </View>
        </PopupDialog>
      ) : null}

      {skipMenu ? (
        <SkipMenu
          rows={skipRows}
          onCancel={() => setSkipMenu(false)}
          onConfirm={(keys, andForge) => {
            setSkipMenu(false);
            const applied = applySkips(keys as (DeckKey | 'name')[]);
            playSfx('cardSelect');
            /**
             * Forge from the draft the skip just produced, NOT from the ref (v0.36.2, owner).
             *
             * This used to write the skips with `setDraft` and then read `draftRef.current` inside a
             * `setTimeout(0)`. React had not re-rendered yet, so the ref still held the pre-skip
             * draft, `forgeCharacterized` found no class on it and returned without a word. Pressing
             * Skip and Forge did nothing, and the Forge button in the header did nothing afterwards
             * for the same reason. `applySkips` hands back exactly what it wrote, and that is what
             * gets forged.
             */
            if (andForge) { void forgeCharacterized(applied); return; }
            const next = decksRef.current.find((d) => !deckDone(d.key, applied) && !lockedRef.current(d.key));
            if (next) switchDeck(next.key);
            else void forgeCharacterized(applied);
          }}
        />
      ) : null}
      {forging ? <CreateLoader done={false} onHidden={() => {}} /> : null}
      {joinParty ? (
        <PopupDialog
          title={`Add ${joinParty.name} to ${joinParty.party.name}?`}
          body="They are a character now, so they can be a member of the party like anyone else. Either way they stay in this encounter and on your character list, and you can add them later from the party editor."
          confirmLabel="Add to party"
          cancelLabel="Not now"
          onConfirm={() => {
            const j = joinParty;
            setJoinParty(null);
            void (async () => {
              const f = await getCharacter(j.charId);
              if (f) await saveParty(addMembers(j.party, [{ charId: j.charId, vitals: initialVitals(f) }]));
              clearDraft();
              backToEncounter();
            })();
          }}
          onCancel={() => {
            setJoinParty(null);
            clearDraft();
            backToEncounter();
          }}
        />
      ) : null}

      {resumeOffer ? (
        <PopupDialog
          title="Resume your draft?"
          body="You left a hero part-way through. Pick up where you stopped, or start a new one."
          confirmLabel="Resume"
          onConfirm={() => {
            const o = resumeOffer;
            setDraft(o.draft);
            if (o.deck) setDeck(o.deck as DeckKey);
            setResumeOffer(null);
          }}
          onCancel={() => { clearDraft(); setResumeOffer(null); }}
          cancelLabel="Start fresh"
        />
      ) : null}
    </AppScreen>
  );
}
