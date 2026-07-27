# RuneKeep — UX audit (v0.21.0)

Date: 2026-07-27 · Method: `/impeccable` (critique + audit + clarify + harden + layout/typeset/distill)
Register: **product** (per `PRODUCT.md`). Scope agreed with the owner:

- **Tablet and large-screen findings live in `tablet-audit-v0.21.0.md` and are deferred.** This file is the general audit, which is being worked first.
- **Character sheet:** changes may be proposed, but the focus is the surrounding app and **the UI that lands on top of the sheet** (Level Up, Rest, Add Card, quick card creation mid-session).
- **Accessibility** is de-prioritised except where it affects legibility for everyone. **Overlapping text, language consistency, resilience, and form** are the priorities.
- Owner is happy with the character sheet's look and with the tap/long-press navigation model. Owner is **unhappy with the layout and feel of the DM UI**, which is scheduled for a full overhaul rather than patches.

Evidence base: six parallel source sweeps over `src/app`, `src/features`, `src/components`, `assets/`, plus direct verification of every load-bearing claim. The bundled `detect.mjs` scanner is **not present** in this skill install, and there is no browser to inspect (React Native), so this is a source-and-geometry audit, not a rendered-pixel audit. Where a number is computed rather than observed, it says so.

---

## Design health score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 / 4 | Loading states are genuinely excellent. But character creation has no aggregate progress ("3 of 10" does not exist), the Name field's completeness is invisible on the rail, and `saveCharacter` is awaited with no catch — a failed write is silent. |
| 2 | Match system / real world | 2 / 4 | Daggerheart vocabulary is handled well. The app's own vocabulary is not: *active / enabled / unlock / set active* for one concept; *Fallen / Down / Recover*; `prepared` uppercased straight out of the data model; "Sync party globally"; `.rkp` on a primary button. |
| 3 | User control and freedom | 1 / 4 | **There is no undo anywhere in the app.** Leaving character creation destroys the draft silently. DM modal backdrops dismiss and discard typed input, while player modals deliberately block the same tap. |
| 4 | Consistency and standards | 1 / 4 | Six long-press durations (140/150/320-340/360/380/760 ms) meaning six different things. A tap on a card means five different things. Three switch designs. Three labels for import. 21 font sizes in DM mode. |
| 5 | Error prevention | 2 / 4 | Hold-to-confirm is a genuinely good invention and is used widely. But it is applied unevenly: the adversary Delete confirms and the ally Delete two buttons away does not; removing a party member silently wipes that character's global vitals; on the roster, **Delete wears the red primary treatment while the benign Share sits in the confirm slot**. |
| 6 | Recognition rather than recall | 1 / 4 | The app's most powerful mode (Edit Mode: move/delete/favourite/bulk-equip/reorder) is entered by **holding a decorative cog for 500 ms**, with nothing on screen ever saying so. Roughly a dozen actions have zero visible affordance. Two encounter features are documented only inside a paragraph in a modal. |
| 7 | Flexibility and efficiency | 3 / 4 | Real strength. The gear grind, over-scroll deck switch, radial menus, multi-select bars, bulk equip, and Random are all excellent power-user affordances. Held back by the total absence of search outside one DM screen. |
| 8 | Aesthetic and minimalist design | 2 / 4 | Split verdict. The menu, roster and sheet are composed and confident. The DM screens are populated, not composed: 21 type sizes, 25 spacing values, no focal point on any screen. |
| 9 | Error recovery | 1 / 4 | Import failures print developer diagnostics ("Card 3 missing id", "Unknown .rkp content kind: deck") with no next step. Corrupt party and library files are swallowed and simply never appear. An unresolvable character id silently falls back to the **sample character**. |
| 10 | Help and documentation | 0 / 4 | Zero onboarding, tutorial, tooltip, coach mark, or help screen. Every explanatory string in the app sits *behind* the gesture it would teach. The most complete documentation is in `accessibilityHint` strings, which sighted players never hear. |
| **Total** | | **15 / 40** | **Acceptable — significant work needed** |

**Read this score correctly.** It is dragged down almost entirely by discoverability, help, consistency and recovery. The craft ceiling here is far above 15: the loading states, the hold-to-confirm pattern, the over-scroll deck indicator, the NFC receive ceremony and the sheet's feedback design are better than most shipped products. The gap between how well this is *made* and how well it is *explained* is the single largest finding in this document.

---

## Anti-patterns verdict

**Does this look AI-generated? No. Emphatically not.** This is the clearest pass in the report. There are no gradient-text headings, no glassmorphism, no hero-metric templates, no identical rounded card grids, no side-stripe borders, no pastel SaaS palette. The chamfer language, the forged card renderer, the drifting card wallpaper on the menu, and the gold filigree rule under the wordmark are all specific, authored decisions that no model would produce by default. The loading copy alone ("Stoking the forge", "Unrolling the sheet", "Summoning the roster") is evidence of a human with a point of view.

Two genuine anti-patterns do appear, both from the shared list:

- **Modal as first thought.** The expansion picker interrupts *before* character creation begins — the user taps "New character" and is handed a content-licensing decision about packs they may not own. Deep-linked, the same modal loses its Cancel button entirely, so Continue is the only exit.
- **Nested / stacked overlays.** The sheet reaches five layers deep (sheet → fullscreen card → Card Modifiers → edit → effect picker → formula variable picker). The hardware back button unwinds this correctly, which is the saving grace, but there is no on-screen back at the deeper layers.

One design-system violation worth naming: **`DESIGN.md` says chamfered, never rounded.** `adversary-library-screen.tsx` — the most-scrolled surface in DM mode, ~155 rows — uses `borderRadius` at lines 55, 74, 194, 245 and 254. The file header explains it was a performance rewrite to plain Views. The perf fix was right; the shape language was collateral damage.

---

# PART I — Phone: the user-flow critique

## I.1 The three structural problems

Almost every specific finding below is a symptom of one of these three. Fix these and the long tail shrinks dramatically.

### Problem 1 — The app teaches nothing, and hides its best features behind gestures with no affordance

There is no onboarding, no tutorial, no tooltip, no coach mark, and no help screen anywhere. A repo-wide search for `onboard|tutorial|coachmark|tooltip|walkthrough|first-run|hasSeen|introShown|showHint` returns exactly one hit: a comment in `create-screen.tsx:749` recording that hint tooltips were **removed** because they pushed buttons out of position.

What exists instead is a set of teaching strings that are each placed behind the thing they explain:

| The string | Where it lives | Who will ever see it |
|---|---|---|
| "Press and hold a card in the carousel to equip it" | Modifiers panel **empty state** (`modifiers-panel.tsx:24`) | Only someone who already knows how to equip, and has chosen not to |
| "Tap to select. Hold a card to drag it to reorder or move categories." | Inside the Cards panel (`card-management-panel.tsx:496`) | Only someone who found the Cards panel |
| "Rename this encounter by holding it in the session list. The card archive button is on the encounter, next to the log." | A grey footnote **inside the Options modal** (`encounter-screen.tsx`) | Nobody. This is documentation-as-UI for two features that have no other discovery path |
| "Use the button below the character portrait to open the cards menu" | A **deletable Notes card** seeded on new characters (`redesigned-sheet.tsx:654`) | Only a player who finds the Notes deck, which requires knowing how to switch decks |
| The full gesture vocabulary | `accessibilityHint` strings | Screen-reader users only |

Meanwhile these are the things with **no visible affordance at all**:

- **Golden Gear Edit mode** — hold the decorative cog art for 500 ms. This mode owns move, delete, favourite, bulk equip and reorder. Nothing indicates it exists.
- **The card action wheel** — hold a card for 260 ms, *inside* a mode you entered by holding.
- **The stat zones** — HP, Stress, Hope and Armor are each split into two invisible rectangles whose divider *moves as the value changes*. Nothing shows which half heals and which half spends.
- **The stat pulse hold** in DM mode — 150 ms then drag to a 38°-wide wedge. Release in the gap and it silently cancels; hesitate over 150 ms while intending a tap and a keypad becomes a wheel.
- **Over-scroll to switch decks**, swipe-down to close a card, tap-left/right to flip card pages, portrait pan/pinch/hold-to-replace (the "+ Tap to add" label vanishes the moment a photo exists), hold-a-gallery-card for 760 ms to NFC-share.
- **The gear pad itself** — a 176×94 near-invisible hit target painted over decorative art.

And the receive half of NFC is genuinely *unreachable by intent*: a beautiful 2.3-second ceremony that fires only when the sheet is open, no overlay is focused, and another phone happens to tap. There is no "Receive" button anywhere in the app.

**Why it matters:** the owner is the only person who currently knows this app. Everything above is invisible to a friend handed the phone at the table, which is exactly the situation this product is for.

### Problem 2 — Gesture vocabulary has collapsed under its own weight

The same input means different things depending on state, screen, and mode; and the same intent requires different inputs in different places.

**A single tap on a card means five things:** fan the hand open (compact), focus it fullscreen (expanded), close it (focused, single-face), **flip a page** by screen half (focused, multi-face), or select/deselect (Edit Mode). A tap on the gear means three things, one of which destroys the mode you were in.

**Hold means seven different things** across durations from 260 ms to 825 ms — commit a value, equip a card, enter a mode, open a menu, pick up an object, delete an object, confirm a deletion — and there is no shared visual language for "a hold is in progress": the card hold uses a rising gold scan, the stat tracks grow an icon, confirm bars fill red, the portrait fills gold, the gear flashes white once, and the card wheel shows nothing at all.

**Six long-press durations exist:** 140 (drag a log note), 150 (DM stat radial), 320/340 (multi-select), 360 (member multi-select), 380 (roster actions dialog), 420 (pick up a card / delete a token), 500 (enter Edit Mode), 760 (equip / NFC share), 825 (commit a stat). There is no rule a player can learn.

**Deleting one card has four different paths**, each with a different gesture: hold-card → wheel → drag to trash → hold to confirm; tap-to-select → Delete → hold to confirm; focus card → token drawer → trash → hold to confirm; or open the editor and hold one inline bar with no dialog at all.

**Dismissal is inconsistent by design.** `OverlayShell` closes on scrim tap; `FullScreenPanel` never does; `CardEditor` never does; `CenterDialog` does; the focus veil does **but only in the bottom 40 % of the screen** — the top 60 % silently swallows taps; the expand veil does except in Edit Mode. Across modes it inverts: the player-side library forms deliberately block backdrop taps to protect typed input, while every DM modal — including the adversary Configure editor and the note editor holding unsaved text — closes and discards on a stray tap.

### Problem 3 — There is no undo, and confirmation coverage is arbitrary

No undo exists anywhere. That raises the stakes on every confirmation decision, and the coverage does not follow risk:

| Unconfirmed and irreversible | Confirmed with a hold |
|---|---|
| **Confirm level up** — a single tap, permanently applied | Delete card(s) |
| **Apply a rest** — a single tap on "Rest · N" | Delete a custom category |
| **Remove a party member** — instant red ✕, and it *also wipes that character's global HP/Stress/Hope/Armor record* | Discard a spent consumable |
| **Delete an NPC ally** in an encounter — while the adversary Delete two buttons away *does* confirm | Take damage |
| **Delete a log note** from its editor — where the Delete button sits in Cancel's muscle-memory position | Delete saved adversaries |
| **Delete a custom card type** — a plain ✕ tap | Delete an expansion |
| Remove a placed token · replace the portrait photo · re-roll a party colour | |
| **Leaving character creation** — the entire draft, silently, with no prompt | |

Two confirmations are actively mis-shaped:

- **The roster actions dialog** puts **Delete in the red primary slot** and the benign **Share file** in the dialog's designated confirm slot. A user reaching for the visually dominant button is reaching for Delete.
- **The encounter Restart dialog** is a three-way choice wearing a two-button dialog's clothes: an extra "This encounter's state" button injected into the body, then a standard Cancel / "Party state" pair. The more consequential option looks secondary — and choosing it **overwrites the party's live global vitals with an old snapshot**, which the copy never mentions. That injected button is also not `dm`-styled, so it renders gold inside a grey dialog.

## I.2 Character creation

The strongest flow in the app structurally, and the one with the clearest single fix.

**What works:** the ten-step rail with per-step gold ticks and padlocks is a real answer to `PRODUCT.md` principle 4 ("never let a user hunt for the unfinished tab"). Steps are freely revisitable. The Random button per step is a genuinely good affordance. The traits step's Spellcast advisory ("Your +2 is on Presence, but your Spellcast trait is Knowledge") is the single most thoughtful piece of copy in the product.

**What breaks:**

1. **[P0] The draft is not persisted and is destroyed without warning.** It lives in `useState<Draft>(EMPTY)` (`create-screen.tsx:70`). The back chevron calls `router.back()` unconditionally (`:590`). The Android back handler intercepts only an open editor or fullscreen card, otherwise returns `false` (`:233-245`). A phone call, an accidental back swipe, or a mis-tap ten steps in loses everything. This is the highest-severity finding in Part I.
2. **[P1] The commit model is invisible.** You select the card that is **centred**, not the card you tapped. Tapping a card either recentres it or blows it up fullscreen. Nothing on screen explains this two-step model.
3. **[P1] There is no aggregate progress and no final review.** No "3 of 10", no progress bar, no summary screen. FORGE is a `dense` 26 px pill in the header corner, disabled at 38 % opacity until complete — and the Name field's completeness is **not represented on the rail at all**, so a user with all ten gold ticks gets a disabled button with no explanation of why. Pressing it `router.replace`s straight onto a live play sheet with no confirmation.
4. **[P1] Changing Class silently wipes Subclass and Domain picks** (`:435-436`). Two tabs lose their ticks with no message.
5. **[P2] Every deck switch costs over a second.** Fade out 200 ms → mount → a 620 ms enforced "grace" → fade in 320 ms (`:115-139`). That is ~1.14 s per step change, ten steps deep, with revisits. `DESIGN.md` allows *one* ceremony moment per flow; this is ten, on the critical path.
6. **[P2] The rail labels are 7.5 pt uppercase** — the smallest type in the app by a wide margin, and 74 px fixed-width tabs mean only 4–5 of 10 are visible at once.
7. **[P2] "Select card"** is the label on the Domains step. Every other step names its noun ("Select class", "Select ancestry"); the one step where you pick *two* degrades to the least specific word available. The counter beside it (`0/2`) has no label at all.

## I.3 The overlays that land on the sheet mid-session

This is where the owner asked for focus, and it is where the in-play stakes are highest. `PRODUCT.md` describes this context as "mid-session, one-handed, glancing constantly. Speed and legibility win."

**Level Up panel.** Full-screen, opaque, carousel unloaded behind it. A rail of 4–6 icon step tabs each with a gold diamond tick — good, consistent with creation. Confirm is always pressable and jumps to the first unmet step with a bronze hint naming what's missing, which is a better pattern than creation's silently-disabled FORGE and should be back-ported. **But: Confirm level is a single tap and is irreversible.** In a system where "delete one card" demands a 620 ms hold, permanently advancing a character on one tap is the sharpest inconsistency in the app. It also stacks four layers deep (Level Up → Exp step → CardEditor → effect picker).

**Rest panel.** Four sequential screens (kind → moves → dice entry → result), each scrim-dismissable. **Dismissing mid-flow silently loses the selection**, and applying a rest is a single tap and irreversible. The dice-entry step correctly routes physical die results through the keypad, consistent with the no-digital-dice rule. The "Rest again / Done" result screen is good.

**Add Card / New Card flow.** Correctly refuses backdrop dismissal so a stray tap cannot destroy a draft — the right call, and the opposite of what DM modals do. Save is disabled until there is a title or body. The card-type picker is a *hidden hit-band on the card's plaque*, mitigated only by a caption ("Tap the card type to change it"). Beastform and Martial Form show an explanation panel refusing authoring, which is honest.

**Quick card creation mid-session** is the weakest of these. Reaching it takes: float menu (press-and-drag to a wedge, or tap to pin then tap) → New Card → and if you want a catalog item instead, a further "Add card from catalog →" link into the Gear Browser, which is an 11-tab horizontally-scrolling strip with a second filter row and **no loading state** — records load async and the tab simply reads "No cards." until they arrive. At a table, mid-turn, that is a lot of surface.

**The consumable prompt** ("…is spent. Discard the card, or keep it if you're still carrying another") firing automatically on unequip is excellent — the right question at the right moment, with a hold-to-confirm. More of the app should work like this.

**Recommendations for this cluster, in priority order:**

1. Put a hold-to-confirm on **Confirm level** and on **Rest · N**. Same 620 ms bar already used everywhere else. One-line change per site, removes the two worst irreversibility gaps in play.
2. Make the Rest panel **non-scrim-dismissable** once moves are selected, matching the CardEditor's existing rule.
3. Give the Gear Browser a loading state. It is the only async surface in the app without one, which directly violates `PRODUCT.md` principle 5.
4. Back-port Level Up's "always pressable, jumps to what's missing, names it" pattern to creation's FORGE button.

## I.4 DM mode — why it feels worse

The owner's instinct is correct and it is measurable. **The DM screens are not a desaturated twin of the player screens; they are a different design that happens to use grey.** They dropped the two things that make the player screens work — an illustrated focal point, and one exclusive accent — and replaced them with more information at more sizes in more boxes. The player app is *composed*. The DM app is *populated*.

### The measurements

**Type.** 21 distinct font sizes across 105 declarations in `src/features/dm/**`. Not one adjacent step reaches the design system's 1.25 ratio; the largest gap below 18 pt is **1.07×**. Five sizes (14.5 / 15 / 16 / 17 / 18) do the single job "list-row title". `MemberPanel` renders names at 16 and `CombatantPanel` at 15 — **stacked in the same ScrollView**, 1 dp apart. That is not hierarchy, it is noise the eye reads as misalignment. Compare the menu screen, which the owner likes: **three** sizes (12 / 24 / 40) at ratios of 2.00× and 1.67×.

Worse, the scale is not even stable at runtime: every DM list title is a `FitLine` with `minScale = 0.55`, so a long party name renders at ~10 dp beside a short one at 18 dp **in the same column**. `DESIGN.md:51` says auto-shrink is "opt-in and rare"; in DM mode it is the default.

**Spacing.** `theme.ts:69` exports a `Spacing` token set. **It has zero usages in the entire repository** (verified). In its place: **25 distinct spacing values across 253 uses** in the DM screens, with the two modal peaks at 10 and 12 — a 2 dp difference nobody can perceive. Against the design law "section gaps ≥ 2× intra-block gaps", **seven of nine DM screens have a section gap smaller than or equal to their intra-block gap.** Without that ratio nothing groups, and the eye sees one undifferentiated column.

Three different full-screen-overlay insets exist for the same job (16/54, 18/60, 18/36+12), so pushing a DM overlay shifts the content column sideways and vertically for no reason.

**Hierarchy.** On the encounter screen — the screen a DM stares at for three hours — the primary action of the entire flow, **Start**, is a `height 28 dense` button, while a decorative card-archive bookmark tile beside it is **44×44, 2.5× the area**. The two "add a thing" affordances are 10.5 dp dim grey text links, **smaller and dimmer than the section label sitting immediately to their left**. The label is louder than the action it labels. Party Overview has the saturated red HP hearts as its loudest element and **no action on the screen at all**.

**Density.** The roster row the owner likes is 82 dp of which **58 dp (71 %) is a portrait**. DM rows are 54–69 dp of which 0–16 dp is imagery — text in a box, N times. Four DM list screens produce rows of 54 / 66 / 68 / 69 dp, which reads as the same screen four times. Content x-origin across the app is **34 / 55 / 64 / 72 / 78 / 88** — six different left edges for the same "row title" role. On the party editor a section label sits at x=18 heading rows whose text starts at x=88, a 70 dp offset.

**The desaturation concept does not survive contact.** Four shared components have **no `dm` prop at all** (verified): `PopupDialog`, `NumberKeypad`, `LoadingScreen`, `Toast`. So:

- Every DM screen is framed full-bleed in the **gold** `FullUI.svg` (`app-screen.tsx:80` — `preserveAspectRatio="none"`, stroke `#b88747`).
- All ten DM confirmations render in the **gold** Pop-up frame with a `Rune.red` primary button.
- The **gold-and-red number keypad** is the *primary stat-editing surface of DM mode*.
- All six DM entry points show the **gold** loading diamond — the first thing you see on every DM screen.
- Each member/combatant row carries four fully saturated sheet-palette glyphs. A five-member party overview shows **20 saturated red/gold/amber glyphs** on a "desaturated" screen.

The concept is inverted: the chrome is desaturated and the content is saturated, when the design thesis is the opposite.

**And grey cannot carry the hierarchy it's being asked to carry.** `DmRune.ivory` (#F0F1F4) against `DmRune.text` (#E7E9ED) is a contrast ratio of **1.07 : 1** — they are, perceptually, the same colour, and the code uses them as two distinct hierarchy tiers. `accentDim` vs `muted` is 1.22 : 1. Meanwhile `DmRune.accent` is used **81 times** for section labels, button text, chip fills, badges, status dots, pips, chevrons, strokes, and drop indicators. Something used 81 times is not an accent, it is the body colour. The player palette separates its equivalent tiers by **hue**, which reads instantly; the DM palette deleted hue as a channel and then tried to encode five levels in lightness alone.

`DmRune.panel` and `DmRune.panelLit` are defined and used **zero** times. In their place are 31 hand-written `rgba()` fills, including **four different alphas for the identical "selected" wash** (0.10 / 0.12 / 0.14 / 0.16).

### Five changes with the highest feel-per-effort

1. **Add a `dm` prop to the four shared chrome components** (`popup-dialog`, `number-keypad`, `loading-screen`, `toast`) and pass `dm` through `AppScreen` to a recoloured `FullUI-dm.svg`. Pure plumbing, and it fixes four of the five palette leaks at once. **Highest ratio by a distance** — the concept starts working the moment the border and the keypad stop being gold.
2. **Collapse 21 font sizes to five real steps** — `11 / 14 / 17.5 / 22 / 28` (ratio 1.27) exported as `DmType` beside `DmRune`. Raise `FitLine`'s `minScale` to 0.85 or drop it from row titles. Find-and-replace over ~105 declarations; fixes type, hierarchy and half the density problem simultaneously.
3. **Give every DM screen one loud thing, and make it the action.** Encounter: Start becomes a full-width h52 primary above the fold, the bookmark tile demotes to a 22 dp header glyph, "+ Adversary" / "Library" promote from 10.5 dp text to outlined dense buttons. Party editor: kill the 2×2 button grid. Party Overview: give it an action at all.
4. **One spacing rule: section 24, intra 10, row 12.** Seven number changes and the whole DM app groups. Either adopt the dead `Spacing` token or delete it.
5. **Re-chamfer the adversary library** (five `borderRadius` sites, verified at `:55, :74, :194, :245, :254`) and unify the DM portrait to one size and the checkbox to one size, so the library, party editor and member panel finally share a left edge.

**Bonus, near-zero effort:** five of the six DM empty states are a single grey sentence floating in a void. The parties screen already contains the roster's poster composition (170×170 chamfered box + glyph + 18 dp headline + 13 dp body + primary button). Copy it to the other five. That directly answers the "feels worse" instinct, because the roster's version of that exact composition is something the owner already likes.

## I.5 Language and copy

The app's voice is good — "Stoking the forge", "Forge your first character, or import one from a friend", "{Name} will be removed from this device. Exported files are unaffected." That last one is a model confirmation: it says what happens *and* what doesn't.

The problems are consistency and leakage, not tone.

**One concept, many words:**

| Concept | Words in use |
|---|---|
| A party being the current one | *Set active* (button) · *Active* (pill) · *enabled* (data model) · *"Enable a party to unlock"* (menu) |
| The party-state screen | *Party State* (button) · *Players* (button) · *PLAYERS* (its own title) — two buttons, one destination, two names |
| Getting to sessions | *Sessions Menu* · *Sessions* — adjacent screens |
| A downed combatant | *Down* (its ✕'s label) · *Fallen* (the resulting state) · *Recover* (the reverse) |
| Importing | *Import* · *Import a character* · *Import .rkp* |
| Loading | six bespoke strings, so the user never learns "this is the loading state" |
| The forge metaphor | *Stoking the forge* · *Preparing the forge* · *Forge* (commit) · *Forge your first character* — four jobs, one metaphor, no hierarchy |

**Engineering language reaching users:** `.rkp` on a primary button · "Not a RuneKeep (.rkp) file." · "Card 3 missing id" · "Unknown .rkp content kind: deck" · "Sync party globally" / "· LOCAL" · "Bump the version before re-sharing" · "prepared" · "unit(s)" / "session(s)" / "adversary(ies)" parenthetical plurals in four confirmations where only one actually branches · "shows on the plaque" (internal art vocabulary) · "(Custom standalone classes come later.)" — a roadmap note shipped as UI copy.

**A stale name that will confuse:** the adversary delete confirmation says "Base Game and **Void** adversaries are never affected" while the section header a few inches above reads "**Hope and Fear**".

**Ambiguity worth fixing first:**

- **"DM MODE" / "PLAYER MODE"** — the chip shows the *destination* mode, not the current one. Only the accessibility label disambiguates. It also sits beside the mute button at identical height and treatment, so it reads as a matched pair of settings toggles rather than the doorway to half the product.
- **"Cards"** on the menu lands on the expansion-authoring hub, not the card browser. The actual browser ("Card Archive") is one row down. The card-shaped icon promises browsing.
- **The gallery's filter drawer** has four unlabeled chip rows. Nothing says row 3 is *card levels* and row 4 is *equipment tiers*, that they are mutually exclusive families, or that picking a Tier chip silently makes every domain/ancestry/class card vanish. There is no "clear all" — while the DM's adversary library, one screen away, *does* have one.
- **"Present ⇄"**, **"To Adversary"** / **"To Ally"** (reads as navigation, not conversion), and **"Leave only"** (every other product calls this "Keep only" or "Delete others").

**And the single biggest search finding:** there is exactly **one** text-search field in the entire app — "Search adversaries…" — and it lives on a DM-only screen reached through an unlabeled skull icon in the gallery header. A player browsing several hundred cards has no way to type a card name.

## I.6 Text overflow, clipping and overlap

Named by the owner as a top complaint, and the audit supports it. The root cause is structural, not a set of one-off mistakes.

**The structural cause.** `SheetText` — the design-space text primitive every fixed-box label on the sheet goes through — **hard-clips**. `overflow: 'hidden'` on the box (`primitives.tsx:118`), `maxWidth` on the text, `numberOfLines` defaulting to 1. Horizontal overflow gets a tail ellipsis; **vertical overflow is silently guillotined with no ellipsis and no signal at all.** Its auto-shrink (`fit`) is **off by default and passed by zero of the 14 sheet call sites**. So every one of those labels is a fixed-glyph-count box, and the app is one longer string away from a clip in each.

Compounding it: Archivo uppercase runs ~0.62–0.68 em per glyph, `letterSpacing` adds to *every* character including the last, and Android renders Archivo 3–6 % wider than a web preview. `DESIGN.md:51` already warns "size for NATIVE glyph widths"; several boxes were nonetheless sized to about 2 % of slack.

### The eight worst cases

| # | What the user sees | Where | Constraint | Breaks at |
|---|---|---|---|---|
| 1 | **Expansion name in the top bar** | Card Library → open a homebrew pack | Header title clamped to `maxWidth: '55%'` ≈ 207 dp, `numberOfLines={1}`, 15 px Archivo Black + `letterSpacing: 2` ⇒ **~17 characters** (`app-screen.tsx:56`) | The name input is **`LibInput`, which has no `maxLength` parameter at all** (verified, `library-screen.tsx:78-92`). A 200-character expansion name is typeable and lands in a 17-character box. |
| 2 | **Party vitals row runs off the panel** | DM → Players / Party overview | Four stat pulses, `gap: 14`, `justifyContent: 'center'`, **no `flexWrap`** (`member-panel.tsx:98`, verified) | **Already overflowing at two-digit values on a 412 dp phone** (≈358 px of content in ≈352 px). The identical row in `combatant-panel.tsx:122` **does** have `flexWrap: 'wrap'` — the same four glyphs, on the same screen, one wraps and one doesn't. |
| 3 | **HP readout `100/100`** | Character sheet, HP panel | `box(48, 330, 92, 38)` + `overflow: 'hidden'` (verified). The font steps 32 → 28 px at ≥10 — the comment at `:370` says "so 12/12 still fits" | `12/12` leaves ~5 px of 92. There is **no step for three digits**, and `maxHp` has no ceiling: homebrew `maxHp` effects stack unclamped, so 3-digit HP is reachable today and clips. |
| 4 | **`LVL 10 BLOOD HUNTER · PROF 6`** | Character sheet, under the name | `224 × 18` box, 12 px Bold, `letterSpacing: 0.4`, `numberOfLines={1}`, no `fit` (`redesigned-sheet.tsx:297`) | 28 characters ≈ 220 px against 224. **~2 % of slack.** The longest real class name plus a multiclass suffix ellipsizes. |
| 5 | **Card title in the Modifiers panel header** | Sheet → focus a card → Modifiers | 21 px Black uppercase, `flex: 1`, **no `numberOfLines`** (`full-screen-panel.tsx:83`); title input allows **70** (`card-editor.tsx:387`) | Wraps past ~19 characters. A 70-character title becomes **four wrapped lines**, ~100 dp of header shoving the panel body down. Same omission at `overlay-shell.tsx:76` and `popup-dialog.tsx:39`. |
| 6 | **Custom card-type name on the gold plaque** | Any homebrew card | `maxWidth: 104`, `minimumFontScale: 0.6` → floor **4.56 px** (`forged-card.tsx:19-38`); type input allows 20 | Starts shrinking at 8 characters. "Specialization" already hits the floor. At 20 characters it is a smudge printed over the plaque filigree. |
| 7 | **Homebrew card body cut mid-sentence** | Any homebrew card with sections | **Section body input has no `maxLength`** (`card-editor.tsx:120`); rendered with no `numberOfLines` into a `230 × 322` box whose own comment says *"this container CLIPS overflow"* (`forged-card.tsx:231`) | Unbounded. Long feature text is silently guillotined with no ellipsis. |
| 8 | **Multi-select bar covering the list** | DM → Encounter, hold an ally | Absolute `bottom: 14`, `flexWrap: 'wrap'`, with no compensating `paddingBottom` on the list (`encounter-screen.tsx:86-95`) | Ally bar content ("N selected" + Present ⇄ + To Adversary + Delete + Cancel) measures ≈440 px against ≈364 px, so it is **always two rows**, and always covers the last row of the list. |

Two defaults are already at the limit the day the app is used: new sessions are minted as `` `Session ${new Date().toLocaleDateString()}` `` (`session-screen.tsx:115`, verified), which in en-GB/de/fr renders **"SESSION 27/07/2026" — 18 characters into a 17-character header**. And the three origin-badge captions under the sheet's portrait are 72 dp boxes at 78 dp pitch: **6 dp of clearance** before they collide with each other and print through the gold divider rules.

### OS font scaling is unhandled

`allowFontScaling={false}` appears **exactly once in the entire `src` tree** — on a die numeral (`card-tokens.tsx:115`, verified). `maxFontSizeMultiplier` appears **zero** times. There is no `Text` default override anywhere.

This matters more here than in most apps because of `DesignStage`: the sheet's `transform: scale` grows boxes and glyphs together, but the OS font multiplier is applied *inside* that space to `fontSize` only — **the `box(l,t,w,h)` rectangles do not grow with it.** On the sheet, font scaling is a pure overflow multiplier with no escape valve. At the OS "Large" setting (~1.15) the Lvl/Class/Prof line, the HP readout, and the origin-badge captions all fail; the captions collide with each other.

### The fix list, by ratio of breakage prevented to lines changed

1. `flexWrap: 'wrap'` on the vitals row (`member-panel.tsx:98`) — one property, fixes a row that is broken *today*.
2. Add a `maxLength` parameter to `LibInput` and pass 32 for the expansion name (`library-screen.tsx:78-92`, `:260`).
3. `numberOfLines={2}` on the three panel/dialog titles (`full-screen-panel.tsx:83`, `overlay-shell.tsx:76`, `popup-dialog.tsx:39`).
4. `maxLength={400}` on the card section body (`card-editor.tsx:120`).
5. Reserve bottom-bar height in list padding (`encounter-screen.tsx:365`, `session-screen.tsx:140`, `encounter-log.tsx:196`).
6. Give the header title `adjustsFontSizeToFit` with `minimumFontScale={0.8}`, and compute its `maxWidth` from the actual back/right control widths instead of a flat `'55%'` (`app-screen.tsx:56`).
7. Widen the HP box to ~120 dp, or add a third font step at ≥100 (`redesigned-sheet.tsx:372`).
8. Pass `fit minScale={0.85}` to the Lvl/Class/Prof line (`redesigned-sheet.tsx:297`).
9. Set `maxFontSizeMultiplier={1.1}` inside `SheetText` (`primitives.tsx:121`), `FillText` (`:212`) and the header title. Those three components cover most of the fixed-box surface in the app. Leave scaling enabled on the flex-laid-out DM screens and dialogs, which can absorb it.

## I.7 Resilience and edge cases

| Case | Current behaviour |
|---|---|
| Character write fails | `saveCharacter` is awaited with **no catch** (`create-screen.tsx:503`). Silent. |
| Character id doesn't resolve | Silently falls back to the **sample character** (`sheet.tsx:31`). The user is now editing a demo and doesn't know. |
| Corrupt party or library file on disk | Swallowed (`party-store.ts:38-42`, `library-store.ts:43-48`). The party simply never appears, no message. |
| Corrupt `.rkp` import | Raw thrown message shown in a dialog titled "Import failed", with **Cancel / OK** — two buttons for a pure acknowledgement. Four of the messages are developer diagnostics. No next step offered. |
| Character deleted from roster but still in a party | Party editor shows *"Missing character (removed from roster)"* inline (good); the encounter screen **silently filters it out** (bad, and inconsistent). |
| Empty deck in creation | Renders **nothing at all** — no message (`create-screen.tsx:689`). |
| Encounter with zero combatants | Two section headers, four grey text links, one italic line. No illustration, no primary call to action. |
| Empty allies list | **Nothing at all.** The "ALLIES" header sits directly on top of the "ADVERSARIES" header. |
| Tapping the locked Sessions card | Plays a click and does nothing. No toast, no dialog. Reads as a bug. |
| Hardware back with a gallery card fullscreen | **Pops the route** — navigates all the way back to the Card Library instead of closing the card. Same for any open roster dialog. Creation handles this correctly; the gallery and roster do not. |
| Expansion sharing | Writes the file and hands it to the OS share sheet with **no in-app confirmation, success, or failure feedback whatsoever**. |
| NFC on iOS / Expo Go | The NFC buttons simply are not rendered, with no explanation of why the feature is absent. |

---

---

## Recommended order of work

Tablet and large-screen findings have moved to `tablet-audit-v0.21.0.md` and are deferred.

**Wave 1 — data loss and irreversibility (§I.1 problem 3, §I.2, §I.3):**
1. Persist the character-creation draft; prompt before discarding it.
2. Hold-to-confirm on **Confirm level** and **Rest · N**.
3. Confirm before **removing a party member** (it silently wipes that character's global vitals).
4. Confirm the **ally Delete** (its adversary twin already does).
5. Restyle the hold-to-confirm fill so it follows the chamfer instead of a square wipe.
6. Reshape the encounter **Restart** dialog into a real three-way choice, and say that
   "This encounter's state" overwrites live party vitals.
7. A **card trash** in the Cards menu, so deletion is recoverable without a general undo stack.

**Wave 2 — text that is broken today, not hypothetically (§I.6):**
8. `flexWrap: 'wrap'` on the DM vitals row — currently overflows at two digits on a phone.
9. `maxLength` on `LibInput`, so an unbounded expansion name stops feeding a 17-character header.
10. `numberOfLines` on the three panel/dialog titles.
11. `maxFontSizeMultiplier` in `SheetText`, `FillText` and the header title.
12. The remaining fixed-box fixes: HP readout, Lvl/Class/Prof line, plaque label, section-body cap,
    bottom-bar list padding, origin-badge caption clearance.

**Wave 3 — language (§I.5):** one word per concept, engineering strings out of the UI, the stale
"Void" / "Hope and Fear" mismatch, filter-row labels and a clear-all.

**Wave 4 — resilience (§I.7),** then a **second resilience pass** after character state lands,
because state history changes every failure mode in the table.

**Wave 5 — the big systems:**
13. **Character state / versioning** — every mutation recorded, rewindable, nothing exempt.
14. **DM UI overhaul** — full rework, not the five patches in §I.4.
15. **Onboarding** — optional, skippable, phenomenal.
16. **Add Card, quick card creation, and the Gear Browser** — quick vs advanced paths.
17. **`.rkp` file association** so the format opens from WhatsApp and any file manager, with an
    import path that is safe from whatever screen the user is on.
