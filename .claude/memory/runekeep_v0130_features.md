---
name: runekeep-v0130-features
description: v0.13.0 (PRD
metadata: 
  node_type: memory
  type: project
  originSessionId: 37f7bcf0-30fa-4fbb-8959-07de56b1f07d
---

v0.13.0 (merged 2026-07-16) shipped 10 items. New load-bearing invariants:

- **SCARS**: `'scar'` EffectTarget (modifiers.ts) — flat count, one per enabled "Add Scar" card
  (effects editor "Misc" group; always `{target:'scar', delta:1}`, `applyPickedOption` normalizes at
  every EffectPicker site). Sheet layer: scars ride the hope Track's `locked` convention
  (`toSheetCharacter` sets `hope.locked = scars`, `character.scars`), so trackBounds/onTrack/rest all
  cap at usable hope automatically. Rightmost N slots render grey (`ArtImage tint` silhouette); at
  `scars >= hope.total` a full-sheet `mixBlendMode:'saturation'` gray wash (RN New Arch style prop —
  the dependency-free true-desaturation trick) desaturates everything, pointerEvents none.
- **Ancestry features**: `CardSection.feature?: boolean` + `featureSectionIndexes(lc)` in library.ts —
  THE single place feature→section-index resolution lives (legacy/Void cards without flags → [0,1]).
  All strike/effect consumers route through it. Editor (`SectionsField ancestryFeatures` mode) seeds
  [description, F1, F2], feature rows movable but undeletable, Feature 1/2 labels re-derive from
  vertical order. `ancestryEffectTrait: 1|2` still means "Nth feature by order".
- **Typeset**: forged card text = Archivo Black titles (17/15), body 10.5/14 LEFT-aligned,
  half-line section gaps (tiny-lineHeight `\n\n` span in card-markdown inline path), `**Name:**`
  colon leads (composeSections + library-embed + void-ancestries). FORGE_RENDER_V now **17**;
  VOID_BUNDLE_VERSION now **3**. Library-card snapshot keys are order-sensitive (secSig).
- **Expansion picker** lives on the ROSTER (roster-screen) — Continue → `/create?exp=id,id` (`''` =
  base-only); create-screen self-opens the picker ONLY when the param is absent (deep links).
  `globallyEnabledExpansionIds()` (expansions.ts) = seeded listExpansions filtered by
  isEnabledForCreation — used by the Archive (gallery-screen), which now gates via catalogFor and
  derives domain chips from the gated catalog.
- **Empty carousel**: CarouselProvider props `onEmptyOpen` / `onEmptyFavorites`; expand()/enterEdit()
  + the UI-thread gear-tap branches guard on `count === 0` → sheet shows a MUTE OverlayShell panel
  (`mute` prop added) with Change category (from the non-empty `ring`) / Add Gear / Create Card.
  CarouselApi gained `setCategory`.
- Level-up dialog: `marked = tierStart ? [] : traitMarks` (level-up-panel) — mirrors clearsTraitMarks.
- Library popups (MetaForm/TypeChooser) + standalone CardEditor scrim are Cancel-only (no backdrop
  dismiss where input can be lost). Subclass/class authoring chips = all 15 identity CLASSES.

See [[runekeep_void_expansion]], [[runekeep_modifier_system]], [[runekeep_card_system_v03]].
