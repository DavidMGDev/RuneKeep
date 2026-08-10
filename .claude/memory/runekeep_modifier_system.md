---
name: runekeep_modifier_system
description: "RuneKeep card-driven stat modifier system — engine, data provenance, toggle UX, schema (PR"
metadata: 
  node_type: memory
  type: project
  originSessionId: 3f43d8ff-479e-4502-bb00-7646a63952a3
---

The character sheet's derived numbers are computed from **cards**, not hand-edited. Shipped via
PRD #175 → PRs #182–#186 (merged to main 2026-06-14), app **v1.1.0**. See [[runekeep_dev_pipeline]],
[[runekeep_card_types]], [[runekeep_float_menu_roadmap]], [[runekeep_apk_build]].

**Engine** (`src/lib/modifiers.ts`, pure + tested): `computeSheet(base, level, sources)` →
per-stat `StatBreakdown { base, contributions:[{source,delta,note}], total, cap }`. Targets (closed
set): 6 traits, `evasion`, `armorScore`, `maxHp`, `stressMax`, `hopeMax`, `proficiency`,
`majorThreshold`, `severeThreshold`. `CardEffect` = `{target, delta}` | `{target, byTier:[t1..t4]}` |
`{target, dynamic:'proficiency'|'halfAgility'}`. Two-pass: flat/byTier first, then dynamic (reads
finalized proficiency/agility). Caps HP/Stress/Armor at 12. `tierForLevel` (T1=1,T2=2-4,T3=5-7,T4=8-10).

**Registry** `src/features/cards/card-effects.ts`: `effectsForCardId(id, file)` + `sourceLabelForCardId`
resolve equipment / loot / catalog / custom uniformly. `character-file.ts` → `toSheetCharacter` runs
the engine; **base = class/creation defaults + legacy overrides (maxHp/evasionBase/modifiers/etc.)**,
then ENABLED cards layer on top, so old saves with no enabled cards derive byte-identically.
`sheetBreakdown(file)` feeds the Modifiers panel.

**Schema (additive, `schemaVersion` STAYS 1):** `enabledCardIds?: string[]`, `acquiredCardIds?: string[]`,
`effects?: CardEffect[]` on `ExperienceDef` (covers experiences/inventoryCustom/customCards).

**Damage-threshold redesign (#242, v0.2.4):** thresholds are NO LONGER armor-derived at the base.
Base **Major = level, Severe = 2×level** (set in `toSheetCharacter`/`sheetBreakdown`; the per-level
`thresholdBonus` accumulator was removed from `applyLevelUp`). `CardEffect.mode?: 'set' | 'bonus'` —
meaningful only for `majorThreshold`/`severeThreshold`. `computeSheet` resolves them in a dedicated pass
(skipped in the generic additive pass): one `set` OVERRIDES the base (last in source order wins),
`bonus`/undefined ADD; contributions kept for the panel. **Armor SETS thresholds** when enabled —
`effectsForCardId` parses the armor's `"maj / sev"` string into `{majorThreshold,mode:set}` +
`{severeThreshold,mode:set}` (+ its other effects). **Toggle conflict (onToggleCard, redesigned-sheet):**
enabling a card that sets Major (or Severe) deletes any other enabled card that sets the same threshold
(mirrors the wildshape one-at-a-time). Effect picker (`card-editor.tsx`) offers Set/Bonus Major/Severe.

**Effect picker rebuilt (#242):** the old `TargetPicker` lived inside the editor ScrollView → its
"fullscreen" overlay was clipped to a half-screen dim. Now `EffectPicker` is rendered at the editor
ROOT (zIndex 10002), a grouped full-screen list of (target, mode) options; `pickEffect` state lifted to
`CardEditor`. Enabled-corner moved to the **top-right** (#239). In-sheet `CardEditor` takes `scrimless`
(transparent scrim, relies on the shared `SheetDim`) + a creation-style `ChamferBox` framed backdrop.

**Zero-base armor (#297, v0.6):** base `armorScore` is now **0** for everyone (an unarmored character has no armor slots) — `toSheetCharacter`/`sheetBreakdown` set `armorScore: file.armorScoreMax ?? 0` (was `?? armor.baseScore`; the creation `armorId` no longer feeds the base, and `armorById` was dropped from `character-file.ts`). Equipping an armor card now ALSO contributes its slots: `effectsForCardId` pushes `{target:'armorScore', mode:'bonus', delta: a.baseScore}` alongside its threshold `set`s, so score + thresholds both show in the Modifiers panel. Existing saves that relied on the baked-in base read 0 until the armor is equipped (intended, rules-correct). Level-threshold `note` de-duped to just `+1 damage thresholds` (the panel renders `{source} · {note}`, and the source is already `Level N`, so the old `Level N:`-prefixed note printed the level twice). NOTE: non-threshold static effects are summed in pass 1 (mode ignored), so `armorScore` `bonus` is plain additive from 0; Bare Bones' `mode:'set'` dynamic still overrides in pass 2.

**Bare Bones + engine extension (#248, v0.2.7):** the audit (vs the gitignored `_pdfwork/out/*.json` oracle, which holds per-card `featureText`+`effects`; `codegen.py` regenerates `catalog-effects.ts`) found exactly ONE missing mechanical passive: **`valor-01-1` "Bare Bones"** (Seraph/Valor L1) — unarmored base Armor Score = 3 + Strength + per-tier thresholds (T1 9/19, T2 11/24, T3 13/31, T4 15/38). Required engine work: new `dynamic: 'strengthPlus3'` (= final Strength + 3), and the pass-2 dynamic loop now honors `mode:'set'` (REPLACES the running total instead of adding) — so `{armorScore, mode:'set', dynamic:'strengthPlus3'}` works. Thresholds use `{mode:'set', byTier:[...]}` (already supported by the threshold pass via flatDelta). Also added `blade-07-1` (+4 Severe). `catalog-effects.ts` is otherwise complete — most domain cards are spells/activated (correctly excluded). **The audit's verdict: only these were missing** (owner's "scan them all" → done; coverage was already there except Bare Bones).

**Data provenance:** weapons (167, T1-4 + Combat Wheelchairs), secondary (37), armor (34), loot (41,
rolls 20-60 only — 01-19 on PDF p130 NOT yet captured), consumables (60) — all from rulebook TEXT via
PyMuPDF (`Daggerheart_Pages_1_to_252.pdf`, PDF page = printed+1; weapons p116-124, secondary 125-126,
armor 127-128, loot/consumables 131-134). Ancestry (4 with effects: Galapa thresholds=Prof dynamic,
Giant maxHp+1, Human stressMax+1, Simiah evasion+1) from text p53-72; community = NONE. Subclass (7
effects: Stalwart thresholds +1/+2/+3, Vengeance stressMax+1, Nightwalker-mastery evasion+1, Winged
Sentinel-mastery severe+4, School of War-foundation maxHp+1) + domain (blade-04-2, valor-05-1/06-2/
07-2, splendor-07-2, bone-01-3=½Agility dynamic) from a **vision pass** over `assets/extracted_cards`.
Generated TS in `equipment-data.ts` (all-tier, tier-1 ids preserved), `lib/loot-data.ts`,
`features/cards/catalog-effects.ts`. Regen scripts lived in gitignored `D:/Tools/Homebrew/Daggerheart/_pdfwork/`.
Decision: "X-Touched" loadout-conditional passives ARE included (player only enables when applicable);
spells/activated/conditional effects EXCLUDED.

**Toggle UX:** press-and-hold the CENTERED (expanded) or FOCUSED (full-screen) card → bottom-to-top
scan fill over `HOLD_MS` (620), commit at top (haptic) → toggles `enabledCardIds`. Raced with the card
tap; finger movement cancels; live (gold) cards excluded. Enabled = pre-baked SVG corner check
(`enabled-corner.tsx`, red triangle + white check, lower-left). Focused card shows a fade-in
**Modifiers** button → per-card effect view (`card-modifiers-sheet.tsx`). Custom cards: "Add effect"
in `card-editor.tsx` (target cycles, signed stepper). **Settings float slot REMOVED** → **Modifiers**
panel (`modifiers-panel.tsx`, read-only base+contributions+total); `settings-panel.tsx` + `number-keypad.tsx`
deleted; `DomainCardInfo` moved to `domain-card-info.ts`. Catalog browser (`gear-browser.tsx`) in New
Card adds system gear/loot → `acquiredCardIds` → forged into decks. **All device-verify pending.**
