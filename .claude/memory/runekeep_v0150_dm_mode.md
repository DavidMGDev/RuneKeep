---
name: runekeep-v0150-dm-mode
description: "v0.15.0 (PRD #364, PR #365) — DM Mode: Parties/Sessions/Encounters, folders, heartbeat StatPulse, global-vs-archive party state"
metadata:
  node_type: memory
  type: project
  originSessionId: 37f7bcf0-30fa-4fbb-8959-07de56b1f07d
  modified: 2026-07-23T23:07:13.687Z
---

v0.15.0 (merged 2026-07-21, PR #365, PRD issue #364) — the first Dungeon Master surface. Invariants:

- **DM Mode is a rendering + labelling swap, nothing more.** `lib/dm-mode.ts` persists one boolean
  (documents/dm-mode.json / localStorage). The menu reads it and, when on, restyles its two actions with
  `DmRune` (theme.ts — the desaturated Golden-Gear twin: `#C4C8D0`/`#9AA0AA` greys, `red` #B2564E) and
  swaps Characters→Parties, Cards→Sessions. Sessions is LOCKED until some party is `enabled` (the menu
  loads parties on focus to check). Toggling never touches stored DM data. `AppScreen`, `RuneButton`,
  `SectionLabel` all gained a `dm` prop that swaps to DmRune — that's how DM screens stay consistent
  without gray border SVGs (the FullUI gold frame is intentionally kept).

- **Three PURE, deep, unit-tested models drive everything** (no store/IO imports, so they test with plain
  numbers): `lib/party.ts`, `lib/session.ts`, `lib/folders.ts`. Storage mirrors character-store:
  `party-store.ts` (documents/parties/*.json), `session-store.ts` (sessions/ + encounters/), and each
  singleton (folders, dm-mode) persists itself. `lib/dm-vitals.ts` is the ONE bridge that reads a
  CharacterFile's sheet (`toSheetCharacter`) for a member's maxes/initial vitals — party.ts stays pure by
  taking `MemberMaxes` as an argument and clamping without knowing the sheet.

- **Global vs archive party state (the load-bearing rule, PRD #34-37).** A `Party` carries `global:
  Record<charId, MemberVitals{hp,stress,hope,armor}>` — the LIVING vitals. `session.ts`
  `memberVitals(encounter, party, charId)` resolves the source: completed→`archivedGlobal` snapshot,
  synced→`party.global`, local→`encounter.localVitals`. WRITES only happen when
  `canEditMembers(encounter)` (status==='active') — a prepared/completed encounter is read-only for member
  vitals; the party OVERVIEW is the other writer. `completeEncounter` freezes the current global onto the
  encounter as `archivedGlobal` and leaves `party.global` to carry forward. `options.globalSync=false`
  forks to `localVitals` (a fully-local encounter). Adversaries/NPCs are ALWAYS local + always editable
  (that's how you prep a fight ahead of time).

- **StatPulse (`features/dm/stat-pulse.tsx`) is the heartbeat control (PRD #8).** Interaction, decided
  with the owner (item 8 was ambiguous, flagged in the PR): TAP the icon = toggle raise/lower mode (no
  value change); HOLD = a beat loop (JS-timer, NOT a worklet — ~2-8 Hz) that fires one `onStep(dir)` per
  beat, accelerating, with a RISING-pitch `numpadPress` tick (`cents: min(beat*55, 900)`) as the audible
  step counter; TAP the number = the existing `NumberKeypad` for an exact set. A whole press→release hold
  is ONE log entry — `onHoldStart`/`onHoldEnd` bracket it; the encounter captures from→to and appends via
  `formatStatLog`. Members get HP/Armor/Stress/Hope; adversaries only HP/Stress. If the owner wants a
  plain tap to apply a single step instead of toggling mode, it's a one-spot change here.

- **Persistence is DEBOUNCED (~200ms) in the overview + encounter** because a fast hold fires many
  steps/sec; React state updates instantly, the disk write trails. Latest-state refs (`encRef`,
  `partyRef`) let the hold/timer callbacks read fresh values without stale closures.

- **Routes are query-string form cast `as Href`** (`/party?id=`, `/session?id=`, `/encounter?id=`,
  `/party-overview?partyId=`) — the object `{pathname,params}` form fails tsc until Metro regenerates the
  typed-routes union for the new files. Same trick the menu already used.

- **Roster folders** (`features/characters/roster-screen.tsx`, now a `SectionList`): folders are a
  device-local `FolderIndex {folders, assignments}` in `lib/folders.ts`; colours are random-only
  (`randomColor()` from party.ts, sampled from DomainColors). `NameDialog` (features/dm/dm-ui) gained a
  `dm` prop — pass `dm={false}` for the gold roster variant vs the default DM gray. Character
  overwrite-on-import (#9) needed NO change: `saveCharacter` already keys on the stable `CharacterFile.id`.

Gate at merge: tsc clean, eslint 0, 391 tests / 33 suites. Motion (the heartbeat feel, ceremonies) is
owner-verified on device.

**v0.16.0 second pass (PRD #366, PR pending, merged 2026-07-22)** — 18 device-reported fixes:

- **Direction went GLOBAL.** StatPulse no longer owns a per-stat +/− mode; a screen-level `dir` state +
  the corner `DirectionToggle` (in stat-pulse.tsx) drive every pulse. Icons are FILLED + sheet-coloured
  (`STAT_COLOR` in stat-glyphs.tsx: HP/Stress `#C81B18`, Armor `#DAA249`, Hope `#CC8F0F`) and GROW to
  ~2.35× while held (over the fingertip). Tap = single step, hold = accelerating beats. Passing `disabled`
  fires `onBlocked` → a toast (locked member vitals before Start).
- **Toast** (`components/toast.tsx`): module emitter + `ToastHost` mounted once in `_layout`. `showToast`.
- **DmModal** (dm-ui) is THE panel wrapper: an inner noop `Pressable` ABSORBS inside taps (the fall-through
  bug — ChamferBox alone doesn't block, so every custom centered modal needs a noop Pressable) + reanimated
  entering/exiting + `LinearTransition` resize. PopupDialog got an opaque inset fill + the same tap-absorb.
- **Fallen adversaries** (session.ts): `Combatant.fallen`/`recoverHp`. `combatantDelta`/`Set` auto-fall at
  0 HP (recover=half); `fell(c)` (the X) preserves current HP as recover target; `recover(c)` restores;
  `cloneCombatant` = fresh/upright/full copy (library spawn + `duplicateEncounter`). Deletion only via
  multi-select+confirm or a fallen unit's X. Members are never deletable.
- **`useSelection`** hook drives hold-to-multi-select on adversaries/allies/encounters/log. Ally↔adversary
  convert carries stats (players rejected via toast). `moveEncounterToSession`/`duplicateEncounter`.
- **Adversary library** (`lib/adversary-library.ts`, singleton like folders): save one combatant template,
  spawn as adversary or ally NPC (`AdversaryLibraryPanel`).
- **Log** = animated 80% side panel (`EncounterLog`, SlideInRight): note entries tap-to-edit + hold-to-
  move-earlier (`moveLogEntry`/`editLogEntry`); auto/stat entries fixed-order, multi-select delete
  (`deleteLogEntries`).
- **Lifecycle**: start-while-active confirms + completes the prior with a log note; completed encounters
  `restartEncounter(…, 'party'|'encounter')` (rewinds party global to `archivedGlobal` for the encounter
  source, revives downed adversaries). Options panel adds Rename encounter + Open card archive (push
  `/gallery`, back returns). Enable→toast→button becomes Sessions; Party State button → overview.
- `domainCardCount(file)` in dm-vitals (expanded member view). Absent members greyed + tagged; ally
  selection flips presence. Gate: tsc/eslint clean, 403 tests / 34 suites.

**v0.17.0 third pass (PR #368, merged 2026-07-22)** — 13 device-reported items, centred on adversary data:

- **Base Game roster** = `src/data/adversaries.ts` (139 SRD Chapter-4 adversaries, transcribed from
  `D:\Tools\Homebrew\Daggerheart\Daggerheart_Adversaries.pdf` — image-only, so I rendered pages to PNG via
  PyMuPDF and fanned out 8 vision subagents; merged+deduped-by-name). `BaseAdversary` = full stat block +
  derived `damageType` + capability `tags` (Fear/Summoner/Undead/Arcane/Flying/Aquatic). Exports
  `BASE_ADVERSARIES`, `baseAdversaryById`, `ADVERSARY_ROLES`, `ADVERSARY_TAGS`. To regenerate: re-run the
  scratchpad `gen_adv.py` against `adversaries_merged.json`.
- **`Combatant` gained the SRD detail fields** (session.ts, ALL optional/additive so old saves load):
  `portraitUri, role, tier, difficulty, atkMod, attack{name,range,damage}, damageType, motives, experience,
  features[], hordeNote, baseGameId`. `newAdversary`/`newNpc` now start FULL (10/10, item 8).
  `baseToCombatant(b)` (adversary-library.ts) is the base→instance bridge (fresh `ad-` id, full HP,
  baseGameId provenance). `keepOnlyLogEntries` added (item 3 "Leave only selected").
- **Adversary Library is a full screen** now (`features/dm/adversary-library-screen.tsx` → `AdversaryLibrary`),
  used BOTH as the `/adversary-library` route (browse, from card archive item 13) AND as an in-encounter
  overlay in `mode` `'adversary'|'ally'` (encounter Adversaries/Allies "Library" buttons → spawn as that
  side; NO round-trip/reload — it commits encounter state directly). Base Game + "Your Adversaries" in
  SEPARATE SectionList sections; gallery-style filter chips (Tier/Type/Damage/Traits) + name search; rows
  show Tier·Type·HP·damage. Tap → `DetailSheet` (StatBlockDetail + count Stepper → spawn N unique clones).
  Base rows NOT selectable/deletable; user rows hold-to-select delete (overwrite = delete+re-save).
  `adversary-detail.tsx` = shared `AdversaryPortrait` (BaseGameEmblem default), `StatBlockDetail`,
  `hasStatBlock`, `AdversaryImageViewer` (fullscreen, item 8). `adversary-info.tsx` = the SRD explanation
  panel (info button). Old `AdversaryLibraryPanel` DELETED. Editor (adversary-editor.tsx) now configures
  EVERYTHING (image picker + role/tier/difficulty/attack/motives/experience/features add-remove).
- **Feedback fixes**: multi-select bars are BOTTOM-anchored everywhere (item 4) + selection is accent-wash +
  check badge (member/combatant/session/sessions/library rows). `DmRune.ally` (#5FA69C teal) = ally NPC
  outline vs `red` adversary (item 5, CombatantPanel `friendly` prop). Sessions/encounters rename via
  hold-select (session-screen + sessions-screen bottom bars); encounter options dropped Rename, kept card
  archive (item 6). Log slides from LEFT smoothly (SlideInLeft duration, NO springify) with a full-screen
  fade scrim — no elastic/gaps (items 1/7); notes carry an up/down Grabber, auto entries an accent bar, both
  hold→select (item 3). Sessions dropdown lists ALL parties incl. disabled from creation; disabled selection
  shows an inline Enable; "unlocked" toast only when it's the FIRST party enabled (item 9, in BOTH
  party-editor and sessions-screen). Gate: tsc/eslint clean, 408 tests / 34 suites.

**v0.18.0 fourth pass (PR #369-ish, merged 2026-07-22)** — 9 device items, motion-heavy:

- **Radial stat editing REPLACES +/−.** `stat-radial.tsx` = `StatRadialProvider` (context + shared values +
  a single window-space `StatRadialHost` overlay, zIndex 9000) + `useStatRadial` + exported worklet
  `pickWedge`. `StatPulse` is now one hitbox: `Gesture.Exclusive(Pan.activateAfterLongPress(150), Tap)` —
  TAP → `onRequestSet` (keypad), HOLD → measures its icon via `measureInWindow` and opens the 6-wedge wheel
  (`RADIAL_WEDGES`: top +1/+2/+3, bottom −1/−2/−3; left/right = cancel gaps), drag-to-wedge-release-to-fire
  → `onApply(delta)`. Particle burst on commit. `dir`/`DirectionToggle`/beat-loop/grow/hold-machinery all
  DELETED. Wrap any screen with StatPulses in `<StatRadialProvider>` (encounter + party-overview do). New
  handler shape: `onApply(key|stat, delta)` applies + logs ONE entry (encounter `onMemberApply`/
  `onCombatantApply`; overview `onApply`). MemberPanel/CombatantPanel lost `dir`/`onStat`/`onHold*`.
- **One ACTIVE party (exclusive).** `Party.enabled` now means "active"; `setActiveParty(id)` in party-store
  sets one, clears the rest. Sessions dropdown `onSelect` → `activate(p)` = setActiveParty; the dropdown IS
  the active selector. Labels "Enabled"→"Active" (parties-screen badge, party-editor "Set active"). Menu
  gating unchanged (`some enabled`).
- **Android back** (`use-android-back.ts` → `useAndroidBack(handler)` over BackHandler, LIFO). Wired into
  `DmModal` (closes the modal), `AdversaryImageViewer`, and `AdversaryLibrary` (closes the overlay). Fixes
  back-in-library dumping you to the encounter.
- **Library**: sections are COLLAPSIBLE and reordered — Your Adversaries (custom, selectable/deletable)
  FIRST, then Base Game, then **The Void** (`data/void-adversaries.ts`, 16 entries from Void_Adversaries.pdf;
  adds the `'Evolution'` FeatureKind). Base + Void are read-only. DetailSheet now scrolls (ScrollView, not
  SectionList).
- **Log DnD** (item 8): grip handle only on notes (no arrows); `Gesture.Pan().activateAfterLongPress(120)
  .runOnJS(true)` lifts the row as a ghost, `computeDrop` (measured row midpoints) picks the insert index,
  a drop-indicator line shows the landing spot, `onReorder(id, toIndex)` commits, LinearTransition settles.
  Auto entries can't drag. `keepOnlyLogEntries` unchanged.
- **CombatantPanel** expands on tapping the TITLE/top row (not just the chevron) with `layout=LinearTransition`
  spring + FadeIn detail (item 5). Card-archive is a button in the encounter control row (item 9, replaced
  the old DirectionToggle corner) and was REMOVED from the options panel. Feature-title input clip fixed
  (minHeight 42 + paddingVertical/lineHeight, item 6). Gate: tsc/eslint clean, 415 tests / 34 suites.
  NOTE: radial feel, DnD feel, and expand animation are owner-verified on device.

**v0.19.0 fifth pass (perf + feel, merged 2026-07-22)** — 5 items:

- **Library scroll lag** (item 1): the ~155-row `AdversaryLibrary` list was per-row SVG (ChamferBox border +
  FitLine + BaseGameEmblem portrait) = hundreds of react-native-svg canvases → the [[runekeep_render_perf]]
  FPS killer. Rows are now PLAIN Views + `Text numberOfLines={1}` + a cheap letter/image `Avatar` (no SVG),
  the `Combatant` is built LAZILY (`buildCombatant(item)` only on tap, not 155× on mount — Item now carries
  `base?: BaseAdversary`/`saved?` refs + `portraitUri`), and the SectionList got
  `initialNumToRender/maxToRenderPerBatch/windowSize/removeClippedSubviews`. Rule reaffirmed: NEVER put an
  SVG canvas per row in a long DM list.
- **Modal scroll** (items 1/2): `DmModal` dropped `layout={LinearTransition}` (it fought internal ScrollViews
  + cost FPS) and swapped the tap-absorb `Pressable` for a plain `<View onStartShouldSetResponder={()=>true}>`
  — claims the START responder (no fall-through-to-scrim close) but NOT the move responder, so a child
  ScrollView still scrolls. AdversaryEditor's ScrollView got a bounded `maxHeight:500` +
  `keyboardShouldPersistTaps` (it only scrolled while the keyboard was up before). DetailSheet ScrollView is
  `maxHeight:420`.
- **Radial anchor** (item 4): `StatPulse` now measures the ICON wrapper (a `collapsable={false}` 24×24 View)
  via measureInWindow, NOT the whole icon+number row — the row's height was driven by the tall number's
  Android font metrics, so its centre sat ~10-30px above the glyph. Measuring the icon centres the wheel on
  the glyph.
- **Particles removed** (item 5): stat-radial's Burst/Particle deleted (they died with the wheel in ~3
  frames); smoother bloom instead. StatPulse spacing tidied (gap 7, icon 24 box, number fs20
  `includeFontPadding:false`, " /max").
- Card archive "Forms" chip → "Transformations" (item 3, gallery-screen KINDS).

**v0.19.1 sixth pass (feel + Arsenal power tools, PR #371, merged 2026-07-23)** — 8 device items:

- **Radial anchor, ROUND 2** (item 3, the "still ~30px too high" report): measuring the icon (v0.19.0) wasn't
  enough — on edge-to-edge Android the wheel's absolute-fill host and `measureInWindow` live in DIFFERENT
  frames (status bar). Fix in `stat-radial.tsx`: `StatRadialProvider` now renders a persistent pointerEvents-
  none `absoluteFill` sensor View (`frameRef`) whose `measureInWindow` origin (`hostX`/`hostY` shared values)
  is SUBTRACTED from anchor+finger in every host transform. Self-consistent regardless of insets. RULE: any
  measureInWindow-driven absolute overlay must reconcile against its own host origin.
- **Portraits: RN Image → expo-image** (item 2). Imported/NFC characters carry base64 `data:` portrait URIs
  (see `lib/nfc.ts` inlining); RN `<Image>` silently drops large data-URIs on Android while the sheet's
  react-native-svg portrait shows them. Swapped to `expo-image` `Image` (`source={uri}` + `contentFit`) in
  member-panel, party-editor Portrait, adversary-detail (AdversaryPortrait/ImageViewer), adversary Avatar.
- **Log drag-drop was BROKEN** (item 5): the per-row gesture was rebuilt every `setDragTY` re-render (torn
  down mid-drag) and the grip lived INSIDE the row's tap Pressable. Rewrote `encounter-log.tsx`: extracted
  `LogRow`, the lift rides a `dragY` SHARED VALUE (no per-frame re-render), gestures are memoized per index
  on `[log,...]` (stable during a drag), grip is its OWN GestureDetector sibling of the tap Pressable,
  `draggingSV` gates onFinalize so a non-activated press never reorders.
- **Library detail freeze** (item 1): the ~155-row SectionList kept filling batches on the JS thread behind
  the detail modal (the periodic ~6s scroll freeze). Fix: UNMOUNT the SectionList while `detail` is open
  (`{detail ? <View flex:1/> : <SectionList/>}`) so the modal scroll owns the thread; dropped
  `removeClippedSubviews` (Android clip/unclip churn).
- **Animations**: DM motion shortened + de-elasticised (item 4) — DmModal `FadeInDown.springify()` →
  `.duration(150).easing(cubic)`; combatant-panel `LinearTransition.springify` → timing; log slide/rows +
  AdversaryImageViewer spring → timing.
- **UI mute** (item 6): `lib/sfx-prefs.ts` (`isUiMuted`/`setUiMuted`/`applyStoredMute`, persisted like
  dm-mode.ts) backs `sfx.ts`'s existing `setSfxMuted`. Toggle on the main menu (`MuteToggle`, applied at
  mount BEFORE the startup chime) AND in the DM encounter Options ("Mute UI sounds"). NOT on the char sheet.
- **Summoner/Warlock trackers** (item 7): `components/class-tracker-card.tsx` = `SummonerTrackerCard`
  (Summon Entity — 4 circle counters, Fate Spirit + subclass entities by `subclassCardId`, total≤level cap,
  4th circle max 1, Theurgy Mastery adds a Divine-Manifestation Hope-dice sub-track) + `WarlockTrackerCard`
  (Patron name, 2 Spheres name+value, 6-pip Favor track start 3). One LIVE interactive Arsenal card each
  (like MartialFocusCard/gold — `interactive:true`, GENERIC_CARD_ART), gated by `className` 'summoner'/
  'warlock', injected into the `abilities` deck. State persists in `file.classTracker` (`ClassTrackerState`
  in character-file.ts). Non-deletable/duplicatable (`isClassTrackerId` added to onDeleteCards +
  onDuplicateCards guards) but movable via category override. Summoner/Warlock ARE real playable classes
  (catalog + class-data.ts).
- **Bulk equip + copy-in-move** (item 8): the golden-gear edit radial's Duplicate slot is now `bulkEquip`
  ("Equip All", new stacked-cards-check SVG in card-radial-menu). `onToggleCard` was refactored to
  `toggleOneFromRefs(id, force?)` — reads/writes `fileRef`/`characterRef` SYNCHRONOUSLY so a 35ms-staggered
  bulk sequence composes (a stale `file` closure would restart from the same file each step); `force` makes
  it directional (equip-only/unequip-only). `onBulkEquip` orders ids by DECK display order (left→right),
  targets 'off' if all already equipped else 'on', fires each at i*35ms, then `deselectAll()`. Copy moved to
  the Move panel: `MoveSheet` gained an optional `onCopy` + a "Copy instead of move" toggle; the sheet wires
  `onCopy={(key)=>onDuplicateCards(moveReq,key)}` and `onDuplicateCards` gained a `targetCat` param.
  `CardMenuKind` 'duplicate'→'bulkEquip' (card-menu.ts + test). Gate: tsc/eslint clean, 410 tests / 34 suites.
  Owner-verify on device: radial centering, log drag, bulk-equip cascade, tracker card layout density.

See [[runekeep-v0140-features]], [[runekeep_modifier_system]], [[project_runekeep_overview]],
[[runekeep_dev_pipeline]], [[runekeep_verify_animations_manually]], [[runekeep_render_perf]].
