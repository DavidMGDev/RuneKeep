---
name: runekeep-v0131-features
description: v0.13.1 (PRD
metadata: 
  node_type: memory
  type: project
  originSessionId: 37f7bcf0-30fa-4fbb-8959-07de56b1f07d
---

v0.13.1 (merged 2026-07-17, PR #358) invariants:

- **Hope clamp rule**: every live sheet-recompute merge site (onApplyLevelUp / commitFile /
  onToggleCard / beastform-exit in redesigned-sheet) MUST clamp active to `total − (locked ?? 0)`
  for hope AND stress/armor. commitFile now calls burstResources (animates hope loss from effect
  edits). Scarring filled hope depletes it with the burst animation automatically.
- **catalogId (LibraryCard)**: optional field = catalog-reference card for NFC/rkp — receiver
  resolves against its own bundled catalog (system scans are images, never sent as bytes).
  Preserved by normalizeLibraryCard; library rows show the catalog thumb when it resolves.
  Archive hold-to-share (gallery-screen CardReader): 760ms LongPress raced with the close pan,
  carousel gold fill replica, → NfcSendModal. Weapons/armor travel as structured specs.
- **MARTIAL FORM** ('martialform' builtin category, the Beastform/Companion pattern):
  src/data/martial-form-data.ts = 24 stances (6/7/7/4 per tier, ids `ms-*`, verbatim from
  assets/temp/void-data/Brawler.md), `hasMartialForm` (subclass key 'martial-artist', primary or
  multiclass), MARTIAL_FOCUS_CARD_ID live pip card (persists CharacterFile.martialFocus 0–6).
  Rules: tier-gated show-all (like Beastform — NO level-up stance picker, physical tracking is the
  documented ceiling); single-active (enabling a stance deletes other enabled ms-* ids in
  onToggleCard); locked to deck / uncopyable / unsharable / New Card blocked; effects flow via
  effectsForCardId → martialStanceById (Steady −1 Evasion, Immovable +2 thresholds).
  Any new special category must touch: BUILTIN_CATEGORIES, carousel-categories (label + RingOptions
  + availableCategories/activeRing), deck-toggle-icon, card-management-panel (LOCKED_CATS + props),
  new-card-flow guard, redesigned-sheet (jobs/deck/base/decks/categoryMeta/ring/guards/NFC strip).
- **Void class assessment (owner A3)**: only Martial Artist earns a category. Summoner Entities
  have NO stat blocks (abstract, summoner's rolls); Warlock Favor / Witch / Blood Hunter /
  Assassin = token piles → existing card-token system. Don't re-litigate.
- FORGE_RENDER_V now **18** (title shrink-to-fit: adjustsFontSizeToFit min 0.55 on
  weapon/armor/text/generic forged titles — never numberOfLines-truncate a forged title).
- Gear browser ancestry tab merges expansion-RECORD ancestries (the only Void content not in the
  catalog) via the homebrew gate expression, added through onAddCustom.
- Release builds MUST run detached (`Start-Process powershell … *> log`) — background tool calls
  die at 10 min; watch via Monitor polling the log THROUGH PowerShell (log is UTF-16; grep misses).

See [[runekeep-v0130-features]], [[runekeep_void_expansion]], [[runekeep_card_system_v03]].
