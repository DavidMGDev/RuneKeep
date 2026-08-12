---
name: runekeep-v0420-classes
description: v0.42.0 - ColorPalette is ALREADY a full-screen modal so nesting it in another one collapses it; class cards are one whole ability per card because every class has at most 4 features and the body is fitText'd; functional cards split AUTHORED config (library card) from PLAYED state (character file); encounter reordering is a MODE not a drag; a preset's modifier carries a LIST of variables
metadata:
  type: project
---

For [[project-runekeep-overview]], shipped 2026-08-12 as v0.42.0 (PR #447, PRD issue #446).

**`ColorPalette` IS A FULL-SCREEN MODAL.** It draws its own scrim and centres itself with a root that is
`position: absolute` on all four insets. Nesting it inside another modal (v0.41.4 put it in `DmModal`)
puts that root inside an unsized positioned ancestor, so it collapses to zero width and the fixed-width
panel inside wraps every line to ONE CHARACTER. That is the "text displaying vertically, no background"
report. Render it directly, always.

**ONE ABILITY PER CLASS CARD WAS A RULE, NOT AN EDIT.** The 8-page druid looked like a text-length
problem and was not: every class in the app has at most FOUR features counting its hope feature, so a
page-per-feature rule lands all fifteen at 2-4 cards with the rulebook wording untouched. What forced
the old splitting was `ForgedTextCard` drawing at a flat 9.5pt and CLIPPING; `fitText` on the body is
what makes the rule safe. Design lesson: when a limit looks like it needs content rewritten, check
whether the container is simply refusing to resize.

**A CLASS EXPANDS INTO ORDINARY CARDS** (`lib/class-cards`). Deterministic ids (`cls-<class>-<n>`) so
expanding twice cannot duplicate; no effects, because a class's numbers live in the class, which is why
a class card added from Add Gear grants nothing. `CharacterFile.classExpanded` stops the paged card
being DERIVED (it is not stored, so there is nothing to delete), which is what makes the conversion
one-way.

**FUNCTIONAL CARDS SPLIT AUTHORED FROM PLAYED** (`lib/card-functions`). Configuration lives on the
library card; the player's state lives on the character file keyed by card and function. That split is
what lets an expansion be updated without resetting a number somebody is mid-session with. Default
state is DERIVED, never stored. A card carrying functions must render LIVE on the sheet, never as a
forged bitmap: a picture cannot be pressed (same rule as the Summoner/Warlock trackers).

**ENCOUNTER REORDERING IS A MODE, NOT A DRAG.** Those rows already own a tap (expand), a hold
(multi-select) and a counter press, and this project has lost four gestures to a fifth on a busy
control. `lib/encounter-order` keeps the order as a list of ids where an UNKNOWN id sorts LAST, so an
encounter nobody has reordered is unchanged and a new adversary arrives at the bottom.

**A PRESET'S MODIFIER CARRIES A LIST.** The v0.41 single `variable` field is read on load and folded
into `variables`, so nothing on disk migrates. `damageRoll` joined the effect targets the same way
`attackRoll` did in v0.41.0.

**UNRESOLVED:** the focused card's overlay action buttons (Modifiers, Toggle, Expand) could not be
exercised by the puppeteer probe: a synthetic click at the button's own rect centre does not reach its
`onPress`, and a check that looked like a control passing was matching the button's own LABEL text in
`document.body.innerText`. Beware that false positive. The Expand button renders correctly and is wired
identically to `toggleCardModifiers`; its press needs a device check.

READ before colour-picker, class-card, custom-class, functional-card, encounter-reorder, dice-preset
variable, or "why will the probe not click this overlay button" work.
