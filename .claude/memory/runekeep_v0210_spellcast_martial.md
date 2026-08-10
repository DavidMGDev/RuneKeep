---
name: runekeep_v0210_spellcast_martial
description: "v0.21.0 — Spellcast trait modifier variable, Mage Robes, Brawler Martial rebuild, illustrated ancestries, 135 H&F adversaries"
metadata: 
  node_type: memory
  type: project
  originSessionId: 37f7bcf0-30fa-4fbb-8959-07de56b1f07d
  modified: 2026-07-25T09:08:21.663Z
---

v0.21.0 (released 2026-07-25) shipped 7 Hope-and-Fear feedback items. Key non-obvious pieces, READ before touching spellcast/thresholds, the modifier formula system, Brawler stances, ancestry art, or the adversary roster:

**Spellcast trait (item 5).** New modifier formula variable `'spellcast'` (in `EffectFormula.variable`). `computeSheet(base, level, sources, spellcastTrait?)` gained a 4th arg; `resolveFormula` reads `out[spellcastTrait].total` (0 if null). The trait comes from `SUBCLASS_SPELLCAST` (map keyed by catalog subclass SLUG) + `spellcastTraitForSubclass()` in `src/data/class-data.ts`; resolved in `character-file.ts` at BOTH computeSheet call sites (toSheetCharacter + sheetBreakdown) and stored on the runtime `Character.spellcastTrait`. Mage Robes (armor `hf-arm-mage-robes` etc. in `equipment-hf.ts`) carry `effects` with `dynamic:'formula', formula:{variable:'spellcast'}, mode:'bonus'` on major+severe thresholds (they add in Pass 2, on top of the armor's `set`). Spellcast is also a choice in the modifiers menu (`FORMULA_VARS`/`VAR_LABEL` in `effects-editor.tsx`) and resolves in `card-modifiers-sheet.tsx` `resolvedDelta`. ALL 5 formula-resolution sites must handle a new variable. Base-game traits are SRD (both subclasses of a class share the trait). H&F: Assassin Executioners=Agility/Poisoners=Knowledge, Witch Hedge=Knowledge/Moon=Instinct, Warlock=Presence; Summoner/BloodHunter are BEST-GUESS (Knowledge) — not in the Classes PDF preview.

**Brawler Martial rebuild (item 4).** `martial-form-data.ts` roster replaced: official release = exactly 16 stances, 4/tier (was 24). Aggressive(-1 Evasion) + Anchored(+2 thresholds) keep engine effects. Ids kept stable where a stance survived. Focus rule (physical play): once/rest, clear track, roll d6s = Instinct, gain highest, cap 6. Test asserts 16/4-per-tier now.

**HOPEANDFEAR_Classes.pdf is a PARTIAL PREVIEW** — only Assassin, Brawler, Warlock, Witch (no Blood Hunter / Summoner, no base subclasses). Class feature/hope TEXT updated in `class-data.ts` for those 4 (Deadly Determination, Square Up, I Am the Weapon/Brawler's Strike, Combo Strike, Patron's Boon/Patron's Pact/Favor, Hex). Domains in `identity.ts` were ALREADY official. Subclass CARD IMAGES were already re-arted in v0.19.2, so baked card text is official — don't re-touch. STILL STALE: the v0.19.1 Warlock tracker card shows 2 spheres, but official = 1 sphere + Patron Die (d6→d8) — left as functional manual tracker; SummonerTracker unverified.

**Illustrated ancestries (items 1/2).** Void ancestries are STRUCTURED text LibraryCards (imageUri null) — that's why they lacked art while communities (webp catalog cards) had it. Fix: `VOID_ANCESTRY_ART: Record<id, require>` in `void-ancestries.ts` (6: earthkin/tidekin/emberkin/skykin/aetheris/gnome), looked up BY ID in `LibraryForgedCard` and passed as `ForgedCard` `fallbackArt` with `colorArt` nulled — art shows in the art band, structured text + Earthkin Stoneskin effect preserved. Art module deliberately NOT on the serializable LibraryCard. `raster` hint bumped for these in redesigned-sheet.

**Adversary detail scroll (item 3).** The DM stat-block DetailSheet + adversary-info now import `ScrollView` from `react-native-gesture-handler` (not RN) — the RN one was starved by the DmModal's start-responder wrapper on Android.

**135 H&F adversaries (item 7).** `void-adversaries.ts` is now GENERATED (scratchpad/gen_void_adv.js from hf_adversaries.json) — 135 blocks (34/42/32/27 by tier), the 16 playtest ids reused+retuned. Added Group/Horde to `ADVERSARY_TAGS`. Library section already labeled "Hope and Fear". See [[runekeep_void_expansion]].
