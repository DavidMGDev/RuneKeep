---
name: runekeep-v0140-features
description: "v0.14.0 (PRD #361, PR #362) — loot completion + ForgedLootCard, subclass families, experience effect target, NFC render fidelity, level-up carousel latch fix"
metadata: 
  node_type: memory
  type: project
  originSessionId: 37f7bcf0-30fa-4fbb-8959-07de56b1f07d
  modified: 2026-07-19T15:38:08.302Z
---

v0.14.0 (merged 2026-07-19, PR #362, PRD issue #361) invariants:

- **LibraryForgedCard is THE renderer for embedded LibraryCards**
  (`features/create/components/library-forged-card.tsx`). Catalog equipment (`WeaponDef` id →
  `ForgedWeaponCard`) and embedded equipment (`LibraryCard` → generic `ForgedCard`) were two DISJOINT
  paths — that, not NFC, is why homebrew/received weapons rendered as flat colour with no glyph or stat
  block. It branches on contentType: weapon/armor synthesize a WeaponDef/ArmorDef and delegate;
  subclass passes the tier subtitle; else generic. NEVER re-inline `ForgedCard` for a LibraryCard —
  route through this or the fidelity bug returns at that call site only.
- **`ForgedCard` gained `subtitle`** — the centered line under the title. Official subclass scans BAKE
  the tier word into the art; custom ones print it via `libraryCardSubtitle`. `CardEditor` takes
  `previewSubtitle` for the live preview.
- **Subclass families link by TITLE** — `subclassFamilyKey(lc)` in `lib/library` falls back from the
  explicit `subclass` field to the title, lowercased + whitespace-collapsed, namespaced by `className`.
  Authors almost never fill the family field; they name all three cards the same. `nextSubclassCardId`
  (leveling) and the creation sibling-embedding BOTH route through it. `incompleteSubclasses(cards)`
  returns families missing tiers — advisory only, never blocks save/enable.
- **The level-up wrong-domain-card bug** had a latch: `straight-carousel`'s `onFinalize` guard
  `&& !scrolled.value` left a gear-strip drag that MOVED then was CANCELLED (onEnd never ran) with
  `grind` stuck above 0.05, which permanently froze index publication in the `useDerivedValue` mapper
  (`if (grind.value > 0.05) return`). The parent's `centerIdx` mirror then froze while the deck kept
  scrolling. Trigger: unmemoized `items` in level-up-panel rebuilt the pan gesture EVERY detent,
  reconfiguring a live native handler. RULE: `onIndexChange` is a LAGGING MIRROR (suppressed while
  grinding, one React commit behind) — fine for labelling, NEVER for committing. Commit paths must use
  `StraightCarouselHandle.centerIndex()`, which reads `pos.value` live.
- **`experience` effect target** (modifiers.ts) names an INSTANCE via `CardEffect.experienceId`. It has
  NO sheet row and NO base: `computeSheet` skips it explicitly, and `BaseStats`/`SheetBreakdown` narrow
  to the new `SheetTarget = Exclude<EffectTarget,'experience'>` so the exhaustive records stay honest.
  `experienceBreakdown(file)` in character-file resolves it. NO experienceId = the FIRST experience
  (that's what makes the shipped Honing Relic work); a deleted id contributes nothing. `matchOption`
  MUST compare experienceId or switching experiences silently keeps the first. `EFFECT_GROUPS` is
  static; the Experiences group is generated per-character and appended by `EffectPicker`.
- **'Experience' is the ONE card type that changes storage** (`card-types.ts`: `EXPERIENCE_TYPE`,
  `isExperienceType`). Every other type is cosmetic (a plaque theme). `CardEditor` derives
  `expMode = experienceMode || isExperienceType(draft.typeLabel)` for LAYOUT but keeps the type chip
  gated on the PROP so the choice stays reversible. The sheet's save path writes to `file.experiences`.
- **loot-data.ts is HAND-MAINTAINED now.** The original `_pdfwork/codegen.py` run silently dropped loot
  rolls 01–19 (consumables were complete). v0.14.0 transcribed them from the rulebook (PDF pages 130-134
  of `Daggerheart_Pages_1_to_252.pdf`, 0-indexed 129-133). Do NOT regenerate over it. data-integrity now
  asserts both tables cover all 60 rolls, plus id-collision with catalog/weapon/armor (effectsForCardId
  checks loot LAST, so a collision shadows silently). Only the relics (rolls 41–47) carry effects.
- **`ForgedLootCard` + `LootGlyph`** (chest on `#241B10`, flask on `#1A2620`) + `loot`/`consumable`
  plaque themes in card-divider. Loot/Consumables tabs are back in gear-browser as LIST kinds (no tier
  filter — loot has no tier, it's indexed by table roll).
- NFC: library send now `inlineCardImage`s (imageUri is a device-local path — serialized fine, resolved
  to nothing on the receiver). Ceremony: name-only confirm panel, `DESCEND_MS=1700` ease-IN-out,
  drop card SCALED not cropped, `focusHaptic()` on tag-read (before UI) and at `LAND_AT`.
- Release build watch: `Select-String` is case-INSENSITIVE by default — always pass `-CaseSensitive`
  and anchored markers (`===ALL DONE===`, `FAILED:`), or the benign
  `[AudioAPI] Worklets version validation failed` bundler warning reads as a build failure.

**v0.14.1 follow-ups (PR #363, merged 2026-07-19)** — all three were device-reported gaps in the above:

- **Shipping loot with `effects: []` is the trap.** v0.14.0 gave loot a card and an acquire path but
  left almost every entry's effects empty, so the Major potions did nothing when toggled. 14 entries
  now carry real effects: the 6 basic potions, the 6 Major potions, Shrinking (+2 agility / −1
  proficiency), Growing (+2 strength / +1 proficiency). data-integrity PINS these specific ids.
  DURATION IS NOT MODELLED by owner's decision — "until next rest" is managed by toggling the card off.
  Excluded on purpose (no EffectTarget / not a sheet stat): damage-roll bonuses (Piercing Arrows,
  Charging Quiver), ally or non-sheet rolls (Arcane Prism Spellcast, Lorekeeper action rolls), dice-
  variable effects (Vial of Darksmoke), and health/stamina potions (they RESTORE current HP/Stress, they
  don't change a maximum — the engine models maxima only).
- **The gallery/archive reads CATALOG + equipment arrays ONLY.** Anything else (loot, and library cards
  still) is invisible there, and invisible means unshareable — the archive is the share surface. Loot
  now has a `GalleryItem` variant + Loot/Consumables chips; it sits under the `!catalogDim && !equipDim`
  guard because it has no tier and no domain/level.
- **Loot shares BY REFERENCE via `catalogId`**, reusing the catalog-scan mechanism: `commitReceived`'s
  guard accepts `lootById` (onAcquireCard already did), and `LibraryForgedCard` resolves a loot
  `catalogId` to `ForgedLootCard`. So a received loot item is REAL loot with working modifiers, not a
  flattened inventory note. Same trick would work for weapons/armor if ever wanted.
- **Consumable depletion**: toggling a consumable OFF sets `depletedId`, raising the existing `Confirm`
  (hold-to-delete) offering to discard it. Only offers, never automatic; `onDeleteCards` drops exactly
  one copy from the acquired multiset.

Known gap flagged but NOT fixed (would remove cards players currently see): level-up `domainOptions` in
redesigned-sheet is not filtered by enabled expansions, unlike `classOptions` beside it.

See [[runekeep-v0132-features]], [[runekeep_modifier_system]], [[runekeep_library_rkp]],
[[runekeep_card_system_v03]], [[runekeep_render_perf]].
