---
name: runekeep-void-expansion
description: The Void official expansion — v0.12.2 shipped the full content + gating; phases C/D (bespoke mechanics, Recraft banners) remain
metadata:
  node_type: memory
  originSessionId: 37f7bcf0-30fa-4fbb-8959-07de56b1f07d
  type: project
  modified: 2026-07-25T03:55:41.785Z
---

Daggerheart's **"The Void"** integrated into RuneKeep as a HARD-CODED **Official Expansion** (distinct
from user Custom Expansions). Multi-release epic; **v0.12.2 (merged to main 2026-07-16, PR #351) SHIPPED
the full content + gating** (phases A+B). Phases C/D remain (see below).

## What shipped in v0.12.2 (in the repo, on main)
- **Content in the catalog**: 99 Void cards tagged `expansion:'void'` (6 ancestries, 6 communities,
  Blood+Dread domains, subclasses, 6 **transformations** = new `transformation` kind). Assets committed at
  `assets/extracted_cards/Void/**` (full webp; LODs gitignored). Catalog regen via
  `scripts/generate_card_catalog.py` (now scans `Void/` with `exp='void'`).
- **6 classes** (in `identity.ts` CLASSES + `class-data.ts` + `class-inventory-data.ts` + forged banners in
  `class-cards.tsx`): assassin, witch, warlock, bloodhunter, summoner (**6 HP**), brawler. New `DomainName`
  `blood`/`dread` + colors; new `ClassName`s. Gating exports in `identity.ts`: `VOID_EXPANSION_ID`,
  `VOID_CLASSES`, `VOID_DOMAINS`, `isVoidClass/Domain`, `ALL_DOMAINS`, `BASE_CLASSES`.
- **Gating module `src/lib/expansions.ts`** (the money path — has `expansions.test.ts`): `catalogFor(ids)`
  = base (untagged) always + tagged only when enabled; `classExpansion(key)`; `isOfficialExpansion`;
  `VOID_META`; idempotent `seedOfficialExpansions()`. `isEnabledForCreation` (in library.ts): **official
  packs OFF by default, custom packs ON by default**. `Expansion.official?: boolean`.
- **Per-character**: `CharacterFile.enabledExpansionIds?: string[]` (omitted for base-only heroes →
  back-compat). Creation **expansion picker** (`src/features/create/expansion-picker.tsx`, `BASE_PICK_ID`)
  gates every class/ancestry/community/domain/subclass list; base game byte-identical when unpicked.
- **Card Library**: read-only **"Official Expansions"** section (The Void first, global toggle, card count
  from catalog, no edit/delete). **Sheet Add Gear**: gated by enabledExpansionIds; **Transformations = own
  category/tab** beside ancestries (NOT in creation); multiclass gated to enabled expansions. **Archive**:
  new **"Forms"** filter for transformations.

## Owner's decisions (A1–A6) — all honored
A1 keep original placeholder art. A2 Official Expansion, first, OFF globally by default, toggle global+per-char.
A3 mechanics fidelity my call (tokens/dice simple; own category for heavy). A4 all 3 Blood Hunter subclasses.
A5 exactly 2 new domains. A6 transformations own category + beside ancestries + not in creation; Summoner 6 HP.
Full plan + transcriptions in `assets/temp/` (GITIGNORED, local only): `void-pdfs/`, `void-data/*.md`,
`void-cards/` + manifest, `THE-VOID-integration-plan.md`, `Banners/` (6 class JPGs for Recraft).

## v0.12.3 round-1 fixes (merged 2026-07-16, PR #352)
- **Real class banners**: `assets/art/classBanners/void/*.webp` (from owner JPGs in assets/temp/Banners), wrapped
  in `<Svg><Image>` in `class-cards.tsx` `voidBanner` (keeps the `Banner: FC<SvgProps>` contract). Added
  `src/types/assets.d.ts` (`*.webp/png/jpg` ambient decl for raster ES-imports).
- **Void ancestries are now STRUCTURED, not catalog images** (KEY architecture change): the 6 ancestries live as
  bundled `LibraryCard`s in `src/data/void-ancestries.ts` on the Void expansion record (`seedOfficialExpansions`
  sets `cards: VOID_ANCESTRIES`, `VOID_BUNDLE_VERSION=2` refreshes installed copies). Their 6 image rows were
  REMOVED from the catalog (regen 369→363). They ride the generic custom-ancestry path → mixed-ancestry TEXT
  strike-through on the sheet + `ancestryEffectTrait`-gated effects. Earthkin/Stoneskin (+1 Armor & thresholds,
  trait 1) is the only ancestry passive. `expansionCardCount(e)` (in expansions.ts) sums record + catalog cards.
- **Modifiers**: only permanent passives get entries (base-game convention). `subclass-juggernaut-2-specialization`
  (Rugged +3 Severe) in `CATALOG_EFFECTS`; other Void cards are activated/conditional (none). Flagged gap:
  `dread-08-2` Eldritch Flesh needs a `markedStress` formula var — omitted.
- **Edit-drag re-arrange animation** (`card-carousel.tsx`, owner-device-verified): `settling` SV strictly stages
  the drop (make-room completes → pile spreads → commit; reflow never cancelled); committed-move deselect deferred
  to `finalizeCommittedDrop` (no 1-frame old-layout flash); `editFlat` envelope flattens the raised look during a
  drag (grab visually deselects; re-raises only on a same-slot drop, after animations end). See [[runekeep_render_perf]].

## v0.12.4 round-2 fixes (merged 2026-07-16, PR #353) — banners + flash DID NOT hold (see v0.12.5)
- **Banners**: switched `voidBanner` to **expo-image** (react-native-svg `<Image href=require()>` doesn't paint
  bundled rasters on Android New Arch) + reprocessed the 6 webps to transparent tight-cropped pennants. Correct
  change, but INVISIBLE on device — see the v0.12.5 root cause. expo-image remains the right raster path.
- **Mixed-ancestry strikethrough in CREATION**: the sheet already struck the crossed feature (libJobs →
  `libraryCardBody(lc, struckIndex)`); creation's `libCardItem` passed no struckIndex. Now `libCardItem(lc,
  struckIndex?)` forwards it and the ancestry deck derives it from `draft.mixedAncestry` (first→strike §1,
  second→strike §0). Parser/compose already unit-tested (card-markdown + library-embed tests).
- **Drop-flash 2-rAF hold**: DID NOT fix it (JS rAF ordering doesn't bound Reanimated closure propagation) —
  replaced in v0.12.5 by the id→index bridge.

## v0.12.5 round-3 — the REAL root causes (merged 2026-07-16, PR #354)
- **Banners (CRITICAL gotcha)**: class cards are NOT rendered live — `useForgedSnapshots` captures each forged
  card once into `documents/forged/<key>-v<FORGE_RENDER_V>.png` and serves that bitmap FOREVER. FORGE_RENDER_V
  had been 15 since PR #235, so the Void cards kept showing their broken v0.12.2 capture and BOTH prior banner
  fixes never reached the screen. Fix: bump FORGE_RENDER_V (15→16) + flag Void class/feature snapshot jobs
  `raster: true` (creation snapshotJobs + sheet classJob/featJobs/mcClassJob/mcFeatJobs/acqClassJobs) so the
  async expo-image webp decode settles before capture (the #110/#121 black-capture hazard).
  **RULE: any visual change to a ForgedCard/ForgedTextCard (incl. banners) MUST bump FORGE_RENDER_V, and any
  async-decoding art in a snapshot job MUST set raster:true.**
- **Drop-flash (by construction)**: `pendingOrderSV: SharedValue<Record<string,number>|null>` — an id→NEW-index
  bridge written in `finishDrop` BEFORE `onReorderCards`. Every CardSlot transform worklet resolves
  `idx = pendingOrder[item.id] ?? index` and positions off `idx`, so stale closures (old index props) and fresh
  ones paint the SAME arrangement during the commit window; `finalizeCommittedDrop` tears down immediately (no
  rAF holds). Bridge released via setTimeout 600ms + cleared on next edit-mode touch (onBegin). NOTE: only
  primitives (`slotId = item.id`) are captured into the worklet — never the whole item (faces are ReactNodes).

## STILL REMAINING (future releases)
- Void ancestries absent from Archive / Add-Gear ancestry tab / creation Random pool (all catalog-image driven).
- **Phase C — bespoke per-class mechanics**: v0.12.2 ships the CARDS (rules text) but not automation.
  Martial-Form 24 stances, Summoner's 7 summon Entities, Blood Hunter Crimson Rite dice, Warlock Favor —
  played with existing token/dice/own-category tools until built out. Heavy ones (per A3) get their own card
  category like druid beastform / ranger companion ([[runekeep_v09_features]]).
- **Phase D — Recraft-processed illustrated banners** when FINAL art exists (Recraft key in
  `D:\Tools\Homebrew\Daggerheart\Ligma\.env`; gateway in Ligma `src-tauri/src/ai_gateway.rs`).

## v0.19.2 — "The Void" → "Hope and Fear" (rebrand + illustrated art + equipment)
- **RENAME (display only, id stays 'void')**: `VOID_META.name` (expansions.ts) 'The Void' → 'Hope and Fear';
  adversary-library section title likewise; `VOID_BUNDLE_VERSION` bumped 3→4 so installed copies refresh the
  name. The internal expansion id / `VOID_*` consts / asset dir stay 'void'/'Void' — DO NOT rename the id
  (existing characters' `enabledExpansionIds: ['void']` would orphan).
- **Illustrated art (item 4)**: HOPEANDFEAR_Cards.pdf (7pp, 3×3 grid, 63 cards) → cropped via crop-marks (like
  extract_void_cards.py) and OVERWROTE 57 existing `Void/**.webp` IN PLACE (same paths → zero code change).
  Covers Dread domains + Assassin/Brawler/Warlock/Witch subclasses + communities + transformations. NOT in
  the H&F PDF (kept old art): Blood domain, BloodHunter, Summoner subclasses, and the 6 ancestries (structured
  cards, no webp). `_lod.webp` are gitignored (regen at build); only the 57 full webp commit.
- **Equipment (item 5)**: HOPEANDFEAR_Weapons.pdf → `hf_equipment.json` (subagent) → `src/data/equipment-hf.ts`
  (HF_PRIMARY_WEAPONS 84 / HF_SECONDARY 36 / HF_ARMOR 35) + `src/data/loot-hf.ts` (HF_LOOT 60 / HF_CONSUMABLES
  60), all `expansion: 'void'`, generated by scratchpad `gen_hf2.py` (fixes â€™ mojibake; derives evasion/
  finesse effects from feature text via regex). WeaponDef/ArmorDef/LootDef gained `expansion?: string`.
  equipment-data.ts `.push`es HF into ALL_PRIMARY/SECONDARY/ARMOR at load (so tier accessors include them);
  loot-data.ts keeps base LOOT/CONSUMABLES PURE (data-integrity test asserts each is exactly rolls 01–60) and
  builds `ALL_LOOT = [...base, ...HF]`. `lootTable(l)` = base→1, void→2. Surfaces gate by `expansion`:
  gear-browser (`allowedExp`), gallery (`enabledExp`, global toggle), creation (`picked`). Loot cards + the
  gear-browser sub-line show "Roll NN · Table N" (forged-card StatRow). Gate: tsc/eslint clean, 410 tests.
- **Other fixes**: gallery adversary-library button = compact skull icon (was wide "ADVERSARIES" text
  overlapping the centered title, item 1); bulkEquip wheel icon = plain checkmark (item 2); AdversaryInfoPanel
  + DetailSheet ScrollViews bounded (maxHeight) + nestedScrollEnabled (the info panel had NO height bound so
  it clipped instead of scrolling, item 6).

See [[runekeep_library_rkp]], [[runekeep_apk_build]], [[runekeep_v09_features]].
