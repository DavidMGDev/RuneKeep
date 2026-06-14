# PRD — Card-carousel categories overhaul: Druid Wildshape, Notes, name autosize, in-context New Card (v0.2)

## Problem Statement

The character sheet's card carousel only supports two fixed decks (Abilities/Arsenal and Inventory) toggled a↔b. Several things the player needs don't fit:

- A **Druid** has no place to track their **Beastform** transformations — the single most important moving part of the class. Each form changes traits, Evasion, and damage thresholds, costs Stress to assume, and you stay transformed even when looking at other cards.
- There is nowhere to keep **freeform notes** (reminders, places, story beats) as quick-flip cards.
- A **long character name** renders tiny on one line at the top of the sheet — it ignores most of the space it's been given. Short one-word names also sit small instead of filling the row.
- Creating a card always asks **which deck** it belongs to, even though the player is already looking at a deck; and the card "type" is fixed by that choice instead of being a quick, expressive label the player controls.

## Solution

Turn the carousel's two-deck toggle into a **looping ring of card categories** the player over-scrolls between, and add the categories the classes actually need:

- **Wild Shape** — a Druid-only category of colored transformation cards (every Beastform, all tiers). Enabling one applies all its stat changes through the existing modifier engine, marks the Stress it costs (or HP if Stress is full — never lethal), and renames the character to the form so the player always knows they're transformed. Only one form active at a time; leaving the category does not revert.
- **Notes** — an all-class category of freeform note cards (optional titles), toggled into/out of the ring from the float menu ("Toggle Notes").
- The carousel over-scroll now loops through whatever categories are active (2 for most heroes, 3 with Notes, 4 for a Druid with Notes).
- **Character name** uses a fill-the-box autosize (like Experience titles, but maximizing): the largest font that fits the allotted header box, growing a short word up and shrinking a long one down, with a little letter-spacing leeway — never stretched.
- **New Card** drops the deck picker and creates in the **current** category; the card's type is a **tappable chip** the player cycles (e.g. Note → Reminder → Important → Story → Place; Item → …; Ability → Skill → Weapon → …). Druids cannot author Wild Shape cards.

This ships as **version 0.2** — prior version history is removed and the release sequence restarts at v0.2.

## User Stories

1. As a Druid, I want a dedicated Wild Shape card category, so that my transformations live with my other cards and I can flip to them fast.
2. As a Druid, I want every Beastform (all four tiers) as its own card with a distinct color, so that I can recognize a form at a glance.
3. As a Druid, I want enabling a Beastform to apply all of its stat changes (trait bonuses, Evasion bonus, damage-threshold bonuses), so that my sheet's numbers are correct while transformed.
4. As a Druid, I want assuming a form to cost the Stress the rules require, so that transforming has its real price.
5. As a Druid at full Stress, I want the transform to take HP instead of Stress, but never the killing blow when I'm at 1 HP with full Stress, so that the app never kills my character for transforming.
6. As a Druid, I want only one Beastform active at a time, so that enabling a new form replaces the old one automatically.
7. As a Druid, I want to stay transformed when I scroll to other categories, so that I don't accidentally lose my form by browsing.
8. As a Druid, I want my character's name on the sheet to change to the form I've taken, so that I'm reminded I'm transformed even when I'm not looking at the Wild Shape cards.
9. As a Druid, I want disabling a form to revert all its changes and restore my name, so that dropping out is clean.
10. As a Druid, I want over-scrolling within Wild Shape to loop around to my other categories, so that the ring is continuous.
11. As a Druid, I want only Druids to see the Wild Shape category, so that it never clutters other classes.
12. As any player, I want a Notes category, so that I can keep reminders, places, and story notes as quick-flip cards.
13. As any player, I want note cards with optional titles, so that a quick scribble doesn't force me to name it.
14. As any player, I want a float-menu "Toggle Notes" option, so that I can add or remove Notes from my over-scroll ring.
15. As any player, I want the over-scroll to skip Notes when I've toggled it off, so that my ring only contains what I use.
16. As any player, I want the over-scroll to behave as a looping list of categories, so that switching is consistent whether I have 2, 3, or 4 categories.
17. As any player, I want my long character name to fill the space it's given, so that it's legible and looks deliberate, not cramped.
18. As any player, I want even a short one-word name to grow to fill its row, so that names look intentional at any length.
19. As any player, I don't want my name letters stretched to fill space — only sized (with slight tracking), so that the type stays correct.
20. As any player, I want New Card to create in the category I'm currently viewing, so that I don't have to pick a destination.
21. As any player, I want to tap the card's type chip to cycle its label, so that I can call a card what it actually is.
22. As any player, I want sensible type options per category (Note/Reminder/Important/Story/Place; Item/…; Ability/Skill/Weapon/…), so that the chip is useful out of the box.
23. As a Druid, I want New Card to never offer authoring a Wild Shape card, so that transformations stay rules-accurate.
24. As the owner, I want all current versioning removed and releases to restart at v0.2, so that the public history starts clean.
25. As the owner, I want the uploaded APK renamed "Runekeep v0.2", so that the download is clearly labeled.

## Implementation Decisions

### Modules

- **`carousel-categories` (new, pure)** — the deck-category ring. Given the class and toggles (`showNotes`, `isDruid`), returns the ordered list of active categories, and `next(category, dir)` for looping over-scroll. Deep, testable, no React. `CardCategory` widens from `'abilities' | 'inventory'` to add `'notes'` and `'wildshape'`.
- **`carousel-context`** — holds the active ring; replaces the `toggleCategory()` a↔b flip with `cycleCategory(dir, arrival)` that walks the ring with wraparound. `decks` record gains `notes` and `wildshape`. `DeckSwitchIndicator` shows the target category for the current over-scroll direction (icon + label per category).
- **`card-carousel`** — over-scroll armed-release calls `cycleCategory(±1)` instead of the binary toggle; the indicator resolves its target from the ring + direction. Per-category icon/label (Arsenal, Inventory, Notes, Wild Shape).
- **`wildshape-data` (new)** — the Beastform table (24 forms, T1–T4) transcribed from the rulebook: id, name, tier, color, Stress cost, structured `CardEffect[]` (trait/Evasion/threshold deltas), and rules text for the card body. `wildshapeById`, `isWildshapeId`. Evolved/Hybrid forms model their flat bonuses and describe the player-choice remainder in text.
- **`card-effects`** — `effectsForCardId` resolves wildshape ids to their effects; a new `activeWildshapeName(file)` returns the enabled form's name (used to override the displayed character name).
- **`character-file`** — additive fields (schemaVersion stays 1): `notes?: NoteCardDef[]`, `showNotes?: boolean`. `toSheetCharacter` overrides `name` to the active Beastform when one is enabled.
- **`redesigned-sheet`** — builds the Notes deck (all classes) and the Wild Shape deck (Druids only) of forged colored cards; passes `notesCards`/`wildshapeCards` to the provider. `onToggleCard` special-cases wildshape: enforce one-at-a-time (disable any other `ws-*`), and on enable apply the Stress/HP cost (never lethal).
- **`card-editor` / `new-card-flow`** — remove the target picker; create in the current category; the plaque becomes a tappable type chip cycling a per-category option list; the chosen `typeLabel` persists on the card and drives its kind label.
- **`forged-card` / `primitives` SheetText** — a fill-the-box autosize for the character name: large base size + `adjustsFontSizeToFit` bounded by the box height, slight `letterSpacing`, no horizontal scaling.
- **APK build script + `app.json`** — version → `0.2.0`; release tag/title/notes reset to v0.2 as the new first release; output APK renamed `Runekeep v0.2.apk`.

### Key interactions / contracts

- Over-scroll direction → ring step: pulling the **first** card right = previous category (arrive at its **end**); pulling the **last** card left = next category (arrive at its **start**). With 2 categories this is identical to today's toggle.
- Wild Shape enable cost: mark `form.stress` Stress; for any Stress that can't fit (track full), convert each to 1 HP; but if applying the HP cost would drop HP to 0 while Stress is full, skip the lethal portion (transform still succeeds). Disabling never refunds.
- Name override is display-only (runtime `Character.name`); the stored `file.name` is unchanged.
- Notes deck may be empty → render a single non-toggleable placeholder card prompting the player to add a note via New Card.
- Druid + `New Card` while viewing Wild Shape → falls back to authoring an Abilities card (no Wild Shape authoring).

### Schema

- `NoteCardDef` = `ExperienceDef` shape + optional `typeLabel`. Custom/inventory cards also gain optional `typeLabel`. All additive; `schemaVersion` stays 1; existing saves load unchanged.

## Testing Decisions

Good tests here check **external behavior** of the pure modules, not rendering:

- **`carousel-categories`** — ring composition for {plain hero, hero+notes, druid, druid+notes}; `next()` wraps both directions; toggling notes adds/removes it; disabling notes while viewing notes resolves to a valid category. (Prior art: `modifiers.test.ts`, `leveling`/`rest` pure-module tests.)
- **wildshape cost resolution** — pure helper computing the Stress/HP delta for assuming a form given current Stress/HP: full-Stress spills to HP; the 1-HP/full-Stress case never goes lethal; multi-Stress forms (Hybrids) spill correctly.
- **`activeWildshapeName` / name override** — `toSheetCharacter` returns the form name when a Beastform is enabled and the real name otherwise.

`computeSheet` already covers the stat math (wildshape effects are ordinary `CardEffect[]`).

## Out of Scope

- Dedicated panels for other classes (Guardian Unstoppable, Ranger Beastbound companion, Seraph Prayer Dice, Warrior Slayer Dice, Seraph flight, etc.) — see Further Notes; documented for a future PRD, not built here.
- Fully auto-computing Evolved/Hybrid Beastforms' inherited base form (player-choice composite) — flat bonuses applied, remainder described in card text.
- Druid-authored custom Wild Shape cards (explicitly excluded by the owner).
- Beastform per-turn combat actions, advantages, and feature automation (informational text only).

## Further Notes

**Other classes that would want a similar dedicated category/panel** (from a full rulebook audit — reported per the owner's request, not built here):

- **Ranger (Beastbound)** — Animal Companion: effectively a second character sheet (own Evasion, Stress, Experiences, damage die, level-up tree). *Dedicated panel.*
- **Guardian** — Unstoppable: a toggled stance with an escalating die and damage reduction. *Dedicated panel.*
- **Seraph** — Prayer Dice: a session pool of d4s spent individually. *Dice-tray panel.*
- **Warrior (Call of the Slayer)** — Slayer Dice: a session pool of d6s (max = Proficiency). *Dice-tray panel.*
- **Seraph (Winged Sentinel)** — Flying: a toggled state with compounding combat/social bonuses. *Toggle panel.*
- Lighter (a normal modifier/condition card suffices): Sorcerer Transcendence & Charged, Bard Rally Die, Rogue Cloaked, Ranger's Focus, Wizard Strange Patterns, Wizard School-of-War Evasion (already modeled), Guardian Vengeance Prioritized.

Beastform data transcribed from the Daggerheart core rulebook (Druid, printed pp. 31–36; tier/level table p. 110). 24 forms across 4 tiers.
