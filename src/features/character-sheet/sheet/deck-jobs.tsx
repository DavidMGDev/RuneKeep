/**
 * The cards a character HOLDS, as render jobs (v0.35.3).
 *
 * Lifted verbatim out of the character sheet, where it had lived inside a `useMemo` since the forge
 * existed. It is a pure function of the character file, and it is the ONLY place that knows how to
 * turn a hero into the set of cards they carry: which experiences, which weapons, which pages a class
 * card has, and, crucially, the starting kit, which is derived from the class rather than stored on
 * the file and therefore cannot be found by reading the file at all.
 *
 * That last part is why this moved. The DM's card viewer read the character file directly and so had
 * no way to know about the kit: a player's default inventory cards were simply absent from it. Now
 * both screens build their decks from the same list, and a card the sheet shows is a card the DM can
 * see.
 *
 * A `key` is the forge-cache key (hashed, changes when the card's content changes); an `id` is the
 * STABLE deck-card id used for enabling, effects and per-card state. Jobs with no `id` are keyed by
 * their `key`, which is what the deck builder falls back to.
 */
import { type ReactNode } from 'react';

import { Rune } from '@/constants/theme';
import { classColor, isVoidClass } from '@/constants/identity';
import { hasStrikeLines } from '@/data/ancestry-trait-regions';
import { authoredItemOptionId, CLASS_INVENTORY, isConsumableName, itemOptionId, itemTitle } from '@/data/class-inventory-data';
import { featurePages } from '@/data/class-data';
import { armorById, weaponById } from '@/data/equipment-data';
import { itemColor } from '@/data/item-colors';
import { lootById } from '@/data/loot-data';
import { hasMartialForm, MARTIAL_STANCES, stanceColor } from '@/data/martial-form-data';
import { VOID_ANCESTRY_FACE } from '@/data/void-ancestries';
import { WILDSHAPES } from '@/data/wildshape-data';
import { CLASS_CARDS, classBanner } from '@/features/create/components/class-cards';
import { ForgedArmorCard, ForgedCard, ForgedFaceCard, ForgedLootCard, ForgedTextCard, ForgedWeaponCard } from '@/features/create/components/forged-card';
import { LibraryForgedCard } from '@/features/create/components/library-forged-card';
import { type CharacterFile, experienceBreakdown } from '@/lib/character-file';
import { contentSig } from '@/lib/content-sig';
import { featureSectionIndexes } from '@/lib/library';
import { mixedCrossedTrait } from '@/lib/library-embed';
import { tierForLevel } from '@/lib/modifiers';
import { wildshapeSummary } from './sheet-utils';

/** Druids get Beastform, whether it is their class or their multiclass. */
const hasBeastform = (f: { className: string; multiclassName?: string }) => f.className === 'druid' || f.multiclassName === 'druid';

export type DeckJob = { key: string; node: ReactNode; raster?: boolean; art?: string; id?: string };
export type CustomDeckJob = DeckJob & { target: 'inventory' | 'arsenal' | 'both' };

export interface DeckJobs {
  featJobs: DeckJob[];
  classJob: DeckJob | null;
  mcClassJob: DeckJob | null;
  mcFeatJobs: DeckJob[];
  expJobs: DeckJob[];
  weaponJobs: DeckJob[];
  armorJob: DeckJob | null;
  invJobs: DeckJob[];
  customCardJobs: CustomDeckJob[];
  acqWeaponJobs: DeckJob[];
  acqArmorJobs: DeckJob[];
  acqLootJobs: DeckJob[];
  acqClassJobs: DeckJob[];
  notesJobs: DeckJob[];
  libJobs: DeckJob[];
  wildshapeFaceJobs: DeckJob[];
  martialJobs: DeckJob[];
}

export function buildDeckJobs(deckFile: CharacterFile | null | undefined): DeckJobs {
    // v0.33.1: the deck-facing view of the file. Reference-identical to `file` unless something
    // other than the cosmetic token fields changed, so a placed token cannot rebuild the whole deck.
    const file = deckFile;
    // `key` is the forge-cache key (hashed, changes on edit); `id` is the STABLE deck-card id used for
    // enabling/toggling + effect lookup (#175). Equipment/origin/domain ids are already stable; custom
    // & experience cards carry their own stable id here so a toggle survives an edit.
    type Job = { key: string; node: ReactNode; raster?: boolean; id?: string };
    type CustomJob = Job & { target: 'inventory' | 'arsenal' | 'both' };
    const empty = { featJobs: [] as Job[], classJob: null as Job | null, mcClassJob: null as Job | null, mcFeatJobs: [] as Job[], expJobs: [] as Job[], weaponJobs: [] as Job[], armorJob: null as Job | null, invJobs: [] as Job[], customCardJobs: [] as CustomJob[], acqWeaponJobs: [] as Job[], acqArmorJobs: [] as Job[], acqLootJobs: [] as Job[], acqClassJobs: [] as Job[], notesJobs: [] as Job[], libJobs: [] as Job[], wildshapeFaceJobs: [] as Job[], martialJobs: [] as Job[] };
    if (!file) return empty;
    const cls = file.className;
    const classDef = CLASS_CARDS.find((c) => c.key === cls);
    const title = classDef?.title ?? cls.charAt(0).toUpperCase() + cls.slice(1);
    const fpages = featurePages(cls);
    /**
     * On the SHEET the class card has no cover (v0.42.1, owner).
     *
     * The cover is the class's flavour text, which is what you read while DECIDING to be a druid and
     * has nothing to tell you mid-session. Dropping it makes "Bard 2/3" read "Bard 1/2", which is the
     * owner's own example. Character creation keeps the cover, because there it is the whole point.
     */
    const total = fpages.length;
    // face 0 = the class card (#110: the missing first page); same deck-wide marks as the forge
    // v0.36.2: a CLASSLESS character shows no class card and no feature pages. Its file names a class
    // only because the shape requires one; none of it is theirs.
    const classJob = classDef && !file.classless
      ? { key: `class-${cls}`, raster: isVoidClass(cls), node: <ForgedCard title={title} kindLabel="Class" body={classDef.body} accentDeep={classColor(cls).deep} Banner={classDef.Banner} pageMark={`1/${total}`} classKey={cls} /> }
      : null;
    // Void class banners are expo-image rasters (async decode) — settle before capture (raster flag)
    const featJobs = (file.classless ? [] : fpages).map((p) => ({
      key: `feat-${cls}-${p.pageIndex}`,
      raster: isVoidClass(cls),
      node: (
        <ForgedTextCard
          title={title}
          kindLabel="Features"
          pageMark={`${p.pageIndex + 1}/${total}`}
          sections={p.sections}
          accentDeep={classColor(cls).deep}
          Banner={classBanner(cls)}
          classKey={cls}
        />
      ),
    }));
    // Multiclass (#311): the ADDITIONAL class's feature card, forged exactly like the primary's — a
    // multi-page deck (class card + each feature page). Appears whenever multiclassName is set.
    const mc = file.multiclassName;
    const mcDef = mc ? CLASS_CARDS.find((c) => c.key === mc) : null;
    const mcTitle = mcDef?.title ?? (mc ? mc.charAt(0).toUpperCase() + mc.slice(1) : '');
    const mcFpages = mc ? featurePages(mc) : [];
    const mcTotal = mcFpages.length;
    const mcClassJob: Job | null = mc && mcDef
      ? { key: `mcclass-${mc}`, raster: isVoidClass(mc), node: <ForgedCard title={mcTitle} kindLabel="Class" body={mcDef.body} accentDeep={classColor(mc).deep} Banner={mcDef.Banner} pageMark={`1/${mcTotal}`} classKey={mc} /> }
      : null;
    const mcFeatJobs: Job[] = mc
      ? mcFpages.map((p) => ({ key: `mcfeat-${mc}-${p.pageIndex}`, raster: isVoidClass(mc), node: <ForgedTextCard title={mcTitle} kindLabel="Features" pageMark={`${p.pageIndex + 1}/${mcTotal}`} sections={p.sections} accentDeep={classColor(mc).deep} Banner={classBanner(mc)} classKey={mc} /> }))
      : [];
    // v0.14.0: the pill shows the EFFECTIVE bonus — the level-up total plus any equipped card boosting
    // this Experience (the Honing Relic). The total rides the forge key so equipping it re-forges.
    const expTotals = new Map(experienceBreakdown(file).map((b) => [b.id, b.total]));
    const expJobs = (file.experiences ?? []).map((e) => ({
      /**
       * The LAST length-based cache key (v0.34.6, owner).
       *
       * This hashed the LENGTHS of the fields, which v0.33.0 replaced everywhere else with a real
       * signature for exactly one reason: every owned image path is the same length, so re-picking a
       * photo produced an IDENTICAL key. That is the black experience card. A capture that lost the
       * race with the image decode was written to disk, and re-picking the image asked for the same
       * key and got the same black bitmap back. Setting a COLOUR changed the key (0 to 7 characters),
       * which is why that fixed it, and putting an image back returned to the poisoned key.
       */
      key: `exp-${e.id}-${contentSig(e.title, e.text, e.imageUri, e.color, String(expTotals.get(e.id) ?? e.modifier ?? 0))}`,
      id: e.id,
      node: <ForgedCard title={e.title} kindLabel="Experience" body="" accentDeep={Rune.panel} imageUri={e.imageUri} colorArt={e.color} experience modifier={expTotals.get(e.id) ?? e.modifier ?? 2} />,
      // player photo (file://) decodes async — needs the forge settle so it isn't captured black (#121)
      raster: !!e.imageUri,
      art: e.imageUri ?? undefined,
    }));
    // starting equipment (#121): the primary weapon, the optional secondary, and the armor card
    const weaponJobs = [file.weaponPrimaryId, file.weaponSecondaryId]
      .map((id) => (id ? weaponById(id) : undefined))
      .filter((w): w is NonNullable<typeof w> => !!w)
      .map((w) => ({ key: w.id, node: <ForgedWeaponCard weapon={w} /> }));
    const armorDef = file.armorId ? armorById(file.armorId) : undefined;
    const armorJob = armorDef ? { key: armorDef.id, node: <ForgedArmorCard armor={armorDef} /> } : null;
    // Acquired gear/loot (#180): system cards picked up beyond creation, forged into the decks so
    // tier 2+ equipment + loot can be equipped + enabled. Skip ids already held as starting equipment.
    const startEquip = new Set([file.weaponPrimaryId, file.weaponSecondaryId, file.armorId].filter(Boolean) as string[]);
    const acquired = (file.acquiredCardIds ?? []).filter((id) => !startEquip.has(id));
    const acqWeaponJobs: Job[] = acquired
      .map((id) => weaponById(id))
      .filter((w): w is NonNullable<typeof w> => !!w)
      .map((w) => ({ key: w.id, node: <ForgedWeaponCard weapon={w} /> }));
    const acqArmorJobs: Job[] = acquired
      .map((id) => armorById(id))
      .filter((a): a is NonNullable<typeof a> => !!a)
      .map((a) => ({ key: a.id, node: <ForgedArmorCard armor={a} /> }));
    const acqLootJobs: Job[] = acquired
      .map((id) => lootById(id))
      .filter((l): l is NonNullable<typeof l> => !!l)
      // v0.14.0: loot + consumables get their own forged card (chest / flask glyph, roll stat row,
      // own plaque family) instead of the generic flat-color one, so they read like weapons and armor.
      .map((l) => ({ key: l.id, node: <ForgedLootCard loot={l} /> }));
    // Acquired CLASS cards (#250 item 4 / #328): a MULTI-PAGE card (class card + each feature page),
    // forged exactly like the primary/multiclass class-feature card — NOT a single page (the old bug:
    // catalog/added class cards showed "1 of 4"). NO stat effects. Forged per UNIQUE acquired class
    // (duplicates share the bitmaps; the deck builder makes one item per copy).
    const acqClassKeys = [...new Set(acquired.filter((id) => id.startsWith('class-')).map((id) => id.slice(6)))]
      .filter((k) => CLASS_CARDS.some((c) => c.key === k)) as (typeof cls)[];
    const acqClassJobs: Job[] = acqClassKeys.flatMap((k) => {
      const def = CLASS_CARDS.find((c) => c.key === k)!;
      const fp = featurePages(k);
      /**
       * v0.42.4 (owner): the ABILITY pages are numbered, and the cover is not one of them.
       *
       * "Class cards when created into the character sheet show the first page as 2/4, which is
       * unacceptable, i need the first page to just say 1/3, because the description page is skipped."
       * The cover was counted in the denominator and its own mark pushed everything else along by one.
       * It keeps its card, because an acquired class card is a whole class card; it simply stops
       * being page one of a numbered set it is not part of.
       */
      const tot = fp.length;
      return [
        { key: `acqclass-${k}`, raster: isVoidClass(k), node: <ForgedCard title={def.title} kindLabel="Class" body={def.body} accentDeep={classColor(k).deep} Banner={def.Banner} classKey={k} /> },
        ...fp.map((p) => ({ key: `acqfeat-${k}-${p.pageIndex}`, raster: isVoidClass(k), node: <ForgedTextCard title={def.title} kindLabel="Features" pageMark={`${p.pageIndex + 1}/${tot}`} sections={p.sections} accentDeep={classColor(k).deep} Banner={classBanner(k)} classKey={k} /> })),
      ];
    });
    // Inventory item cards (#136): the default kit (auto), the chosen options, and the custom items.
    const cinv = CLASS_INVENTORY[cls];
    const cap = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;
    // v0.36: a characterized adversary takes NO starting kit. It is not a hero who packed a bag, and
    // a wraith carrying a torch and fifty feet of rope because a Guardian would is simply wrong.
    const kitJobs: Job[] = file.skipStartingKit
      ? []
      : cinv.take.map((name, i) => ({ key: `kit-${cls}-${i}`, node: <ForgedCard title={itemTitle(name)} kindLabel="Item" body={`You carry ${name}.`} accentDeep={Rune.panel} colorArt={itemColor(name)} multilineTitle /> }));
    const chosenIds = file.inventoryItemIds ?? [];
    /**
     * The chosen starting items.
     *
     * v0.27.0: an item that exists in the ARCHIVE renders as its archive card, so the Minor Health
     * Potion every class guide offers arrives saying "Clear 1d4 HP" instead of repeating its own
     * name. Both ids are accepted: heroes made before this hold the authored id, and rewriting their
     * files to chase a nicer card would be a migration for a cosmetic gain.
     */
    const chosenJobs: Job[] = cinv.choices
      .flat()
      .map((name): Job | null => {
        const held = [itemOptionId(name), authoredItemOptionId(name)].find((id) => chosenIds.includes(id));
        if (!held) return null;
        const archive = lootById(held);
        return archive
          ? { key: held, id: held, node: <ForgedLootCard loot={archive} /> }
          : { key: held, id: held, node: <ForgedCard title={itemTitle(name)} kindLabel={isConsumableName(name) ? 'Consumable' : 'Item'} body={`${cap(name)}.`} accentDeep={Rune.panel} colorArt={itemColor(name)} multilineTitle /> };
      })
      .filter((j): j is Job => j !== null);
    /**
     * A card that IS one picture (v0.34.8, owner).
     *
     * Cards exported from cardcreator.daggerheart.com arrive finished, so there is nothing to lay
     * out on top of them. `null` means this card is not one of those and forges normally.
     */
    const faceOf = (it: { imageUri?: string | null; fullImage?: boolean }) =>
      it.fullImage && it.imageUri ? <ForgedFaceCard face={it.imageUri} /> : null;
    const customJobs: Job[] = (file.inventoryCustom ?? []).map((it) => ({
      // v0.34.3: a custom item's TYPE is the player's to set, and it was neither drawn nor part of the
      // cache key, so changing it repainted nothing and the old bitmap stayed.
      key: `itm-${it.id}-${contentSig(it.title, it.text, it.imageUri, it.color, it.typeLabel, it.fullImage ? 'face' : '')}`,
      id: it.id,
      node: faceOf(it) ?? <ForgedCard title={it.title} kindLabel={it.typeLabel ?? 'Item'} body={it.text} accentDeep={Rune.panel} imageUri={it.imageUri} colorArt={it.color} multilineTitle />,
      raster: !!it.imageUri,
      art: it.imageUri ?? undefined,
    }));
    const invJobs = [...kitJobs, ...chosenJobs, ...customJobs];
    // Player-authored cards (#164) → routed to the inventory and/or arsenal deck by `target`.
    const customCardJobs: CustomJob[] = (file.customCards ?? []).map((it) => ({
      key: `cc-${it.id}-${contentSig(it.title, it.text, it.imageUri, it.color, it.typeLabel, it.target, it.fullImage ? 'face' : '')}`,
      id: it.id,
      node: faceOf(it) ?? <ForgedCard title={it.title} kindLabel={it.typeLabel ?? (it.target === 'arsenal' ? 'Ability' : it.target === 'both' ? 'Card' : 'Item')} body={it.text} accentDeep={Rune.panel} imageUri={it.imageUri} colorArt={it.color} multilineTitle />,
      raster: !!it.imageUri,
      art: it.imageUri ?? undefined,
      target: it.target,
    }));
    // Notes (#214): freeform note cards, their own category (every class). Optional title → 'Note'.
    const notesJobs: Job[] = (file.notes ?? []).map((it) => ({
      key: `note-${it.id}-${contentSig(it.title, it.text, it.imageUri, it.color, it.typeLabel, it.fullImage ? 'face' : '')}`,
      id: it.id,
      node: faceOf(it) ?? <ForgedCard title={it.title ?? ''} kindLabel={it.typeLabel ?? 'Note'} body={it.text} accentDeep={Rune.panel} imageUri={it.imageUri} colorArt={it.color} multilineTitle />,
      raster: !!it.imageUri,
      art: it.imageUri ?? undefined,
    }));
    // Embedded homebrew cards (v0.10.3): each picked LibraryCard forges to a card the carousel treats
    // like any scanned card. Structural/domain ones slot into their positions below; loose ones (weapon/
    // armor/inventory/generic added via ADD GEAR) ride the inventory deck.
    const libJobs: Job[] = (file.libraryCards ?? []).map((lc) => {
      // mixed-ancestry cross-out (v0.10.4): strike the feature the mix crosses out on THIS ancestry card.
      // v0.13.0: features can sit at ANY section index — resolve trait 1|2 through featureSectionIndexes.
      const crossed = lc.contentType === 'ancestry' ? mixedCrossedTrait(file, lc.id) : 0;
      // v0.25.0: an ancestry with a PRINTED FACE has no text blocks to strike; TraitCrossOut draws
      // measured lines over the bitmap instead. Striking here as well would cross the feature twice.
      const struckIndex = crossed && !hasStrikeLines(lc.id) ? featureSectionIndexes(lc)[crossed - 1] : undefined;
      // v0.13.0: order-sensitive section signature — re-arranging sections (same lengths) must NOT
      // serve the stale pre-arrange snapshot.
      const secSig = contentSig(...(lc.sections ?? []).flatMap((sec) => [sec.name, sec.body, sec.feature ? 'f' : '']));
      return {
        // v0.34.3: `typeLabel` rides the key too. It is printed on the plaque, so a card that arrives
        // with one (or is given one) has to re-forge like any other content change.
        // v0.43.0: the CHIP rides the key too, for the same reason `typeLabel` does — it is printed
        // on the card, so a card that gains or changes one has to re-forge.
        key: `lib-${lc.id}-${contentSig(lc.title, lc.text, lc.imageUri, lc.color, secSig, crossed, lc.typeLabel, lc.fullImage ? 'face' : '', lc.plaque?.label, lc.plaque?.from, lc.plaque?.to, lc.plaque?.text)}`,
        id: lc.id,
        node: <LibraryForgedCard card={lc} pack={file.libraryCards} struckIndex={struckIndex} />,
        // v0.21.0: bundled Hope-and-Fear ancestry art is an image too, so rasterize those cards like any
        // image-bearing card (avoids the async-art flicker, per the forged-card cache rules).
        raster: !!lc.imageUri || !!VOID_ANCESTRY_FACE[lc.id],
        art: lc.imageUri ?? undefined,
      };
    });
    // Beastform (#214/#227): Druid-only, each form its own color. TWO forged FACES per form — a flip
    // deck like the class-feature card (#227 item 8) so the title stays a normal size and the rules
    // text isn't crammed tiny: face 0 = overview (tier · stress · attack · stat deltas · examples),
    // face 1 = the form's features. Static content → stable keys; the deck appears only for Druids.
    // Beastform is tier-gated (#242 item 1): only forms of the player's current tier or lower.
    const wsTier = tierForLevel(file.level);
    const wildshapeFaceJobs: Job[] = hasBeastform(file)
      ? WILDSHAPES.filter((w) => w.tier <= wsTier).flatMap((w) => [
          { key: `ws-${w.id}-0`, node: <ForgedCard title={w.name} kindLabel="Beastform" body={`Tier ${w.tier} · ${w.stress} Stress\nAttack: ${w.attack}\n${wildshapeSummary(w)}\nExamples: ${w.examples}`} accentDeep={Rune.panel} colorArt={w.color} pageMark="1/2" multilineTitle /> },
          { key: `ws-${w.id}-1`, node: <ForgedCard title={w.name} kindLabel="Features" body={w.features} accentDeep={Rune.panel} colorArt={w.color} pageMark="2/2" multilineTitle /> },
        ])
      : [];
    // Martial Form (#357): Martial Artist Brawler stances — one forged card per stance of the
    // character's tier or lower (the Beastform tier-gating convention), tier-tinted.
    const martialJobs: Job[] = hasMartialForm(file)
      ? MARTIAL_STANCES.filter((s) => s.tier <= wsTier).map((s) => ({
          key: s.id,
          node: <ForgedCard title={s.name} kindLabel="Stance" body={`Tier ${s.tier}\n${s.body}`} accentDeep={Rune.panel} colorArt={stanceColor(s)} multilineTitle />,
        }))
      : [];
    return { featJobs, classJob, mcClassJob, mcFeatJobs, expJobs, weaponJobs, armorJob, invJobs, customCardJobs, acqWeaponJobs, acqArmorJobs, acqLootJobs, acqClassJobs, notesJobs, libJobs, wildshapeFaceJobs, martialJobs };
}
