---
name: runekeep-v0410-presets
description: v0.41.0 + v0.41.1 - roll presets (lib/dice-presets, on the character file); NEVER accumulate a running total, derive it; a props snapshot of another component's state is always stale so pass a getter; setFile alone does not persist, commitFileRef does; SVG cost is node COUNT and mount churn; ALSO v0.41.1/v0.41.2 - a die may rotate ONLY while rolling and an effect keyed on the throw counter runs on MOUNT too, crits must not be compared against fumbles, dice pitch is the FACE alone, a dialog written inside DesignStage dims only the design box, and a monotonic pitch needs the whole SERIES not a per-die function
metadata:
  type: project
---

For [[project-runekeep-overview]], shipped 2026-08-10 as v0.41.0 (PR #440).

**A RUNNING TOTAL MUST BE DERIVED, NEVER ACCUMULATED.** v0.40's tally did
`setShown(n => n + face)` from a per-die timer, which is correct only if every step runs exactly once,
in order, and never after its own throw. It did not hold and the owner saw a pair of d12 at 11 and 10
with a +1 reach 34. The fix is `poolTotal(order.slice(0, i + 1), mod)`: idempotent, order-free, and
late-safe, and the number on screen is by construction the sum of the faces you can see. Every timer
also carries a `throwId` and returns early if a newer throw has begun, because `clearTimeout` is a race
against a callback the event loop already holds.

**A SNAPSHOT OF ANOTHER COMPONENT'S STATE IS ALWAYS STALE.** `trayDice={trayDice()}` read the tray's
pool at the SHEET's last render, and the sheet does not re-render when a die is picked up inside the
tray, so a preset always saw an empty tray. Pass the GETTER and call it at the moment of the tap.
This is the same shape of mistake as the v0.39 debounce: state read at the wrong instant.

**`setFile` UPDATES THE SCREEN AND NEVER REACHES THE DISK.** `redesigned-sheet` has ONE save choke
point, `commitFileRef.current(next)` (see [[runekeep-v0220-state-history]]). A preset written with
`setFile` looked saved and was gone on the next visit. Anything persistent goes through commitFile.

**SVG COST IS NODE COUNT AND MOUNT CHURN, not drawing.** The dice button's weave was generated over the
rotated frame's bounding circle (~175 cells for a wedge that shows a quarter of them) and toggling
swapped 175 `<Text>` for 175 `<Path>` in the same frame the vitals cross-faded, which is what made the
whole app hitch. Two rules: generate only the cells that touch the shape (point-in-polygon at module
load), and keep BOTH variants mounted, toggling `opacity`, so a state change is three properties rather
than a subtree rebuild.

**Roll presets** (`lib/dice-presets.ts`, `sheet/dice-preset-slots.tsx`). Three slots that replace the
Evasion/Armor panel's CONTENTS while the tray is up (the panel itself never moves). A preset stores
KINDS, not dice, so `duality` is one entry and stays a pair; its modifier is a number, a sheet
variable, or both, and **the variable is resolved when it is rolled, not when it was saved** - that is
the entire point of naming one. Presets live on the character file so they export and import for free.

**`attackRoll` / `spellcastRoll`** are effect targets AND formula variables that deliberately change
NOTHING on the sheet: the app does not roll your checks, so there is no number for them to move. They
exist so a card can grant them and a preset can read them. Adding a target means touching
`EffectTarget`, `EFFECT_TARGETS`, `TARGET_LABEL`, every `BaseStats` literal, the picker groups, and
`Character` + `toSheetCharacter` if anything outside the engine needs to read it.

**Juggernaut's Rugged is a SPECIALIZATION feature, not Foundation** (confirmed against the Void text in
the licensed archive). `catalog-effects.ts` already carries `subclass-juggernaut-2-specialization ->
severeThreshold +3`. A level 2 Brawler has only the Foundation card and correctly gets nothing.

## v0.41.1 (PR #441)

**A DIE MAY ROTATE ONLY WHILE IT IS BEING ROLLED.** v0.41.0 added a tumble on the way into the tray and
the owner reported dice parked at odd angles on native and turning at random in a browser. Two turning
animations that can interrupt each other have too many ways to end mid-turn, and each one strands a die
until it is rolled again. `turn` now has exactly ONE writer (the throw, which rounds to a whole number
first), so a die at rest is upright by construction rather than by care. Do not re-add an entry spin.

**NEVER DECIDE A CELEBRATION BY COMPARING GOOD AGAINST BAD.** The total went gold on
`tally.crits > tally.fails`, so one critical alongside one fumble cancelled out and a natural 20 went
unremarked. A critical is an EVENT, not a lean: `crit = tally.crits > 0`, unconditional, and it outranks
even the Fear purple on the total.

**DICE PITCH IS THE FACE, NOT THE INDEX.** `rollCents` used to be `index * 34 + sizeStep * 150`, which
told you how far through the handful you were and nothing about how it was going, so a fumble needed a
separate sound to be noticed. It is now `value / DIE_MAX[type]` mapped over a 900 cent spread (a 2 on a
d4 equals a 4 on a d8, the owner's own test), with the per-die climb cut to 12 cents. The critical
failure's own sound was deleted: the deep pitch IS the sound.

**`rollBand`** (pure, in `dice-pool`) is the end-of-roll voice: the dice sum against ZERO and their own
maximum, in quarters (the owner's arithmetic verbatim, modifier excluded because a flat +3 says nothing
about how the dice fell). Top quarter takes the critical fanfare and the golden flourish even with no
crits in it; bottom quarter the short bad note; the rest the plain one. Crit AND top quarter doubles
both the dice swell and the total's pop.

**A SLOT LABEL NEEDS `fitText`, NOT `adjustsFontSizeToFit`** (a web no-op, see
[[runekeep-card-text-platform]]). A preset name was cut after about seven characters because
`numberOfLines={1}` gave it one line of a 48 wide tile. It is now sized by arithmetic across three lines
in a 72 wide band that reaches into the gaps BETWEEN slots (they are 78 apart), so five words fit.

`PopupDialog` gained `actionsGap` (default 22) for dialogs whose children already end in a button row.

## v0.41.2 (PR #442)

**AN EFFECT KEYED ON A COUNTER RUNS ON MOUNT TOO, and that was the real arrival spin.** v0.41.1
deleted the entry tumble and dice were STILL rotating on arrival, because the cause predates it: the
throw effect is `useEffect(..., [roll])`, so a die tapped in after a throw mounted with `roll` already
past zero and spun, swelled and reacted exactly as though it had been thrown. Pressing Roll during
that phantom spin is a throw interrupting a throw, which is how the angles got mangled. The
discriminator with no extra bookkeeping: a die being THROWN mounts with a `value` (a trait roll mints
its pair and throws it in one commit), a die being PICKED UP mounts with `value: null`. Measured: 12
samples across the entry, all 0 degrees.

**SORT THE FACES, NOT THE SOUND.** Dice of one kind are interchangeable, so which of four d6 shows the
2 is presentation. `layoutRolled` deals each kind its own faces ascending (never a duality die: Hope's
face is Hope's, and swapping them changes the verdict), which turns a throw into a rising line per kind
of die. `rollCents` then needs no index at all: pitch is a pure function of (die, face), so two
criticals on one kind of die sound identical. The owner's complaint was that pitch "rising and falling
constantly" sounded bad; the fix was the ORDER, not the formula.

**A DIALOG WRITTEN INSIDE `DesignStage` DIMS ONLY THE DESIGN BOX.** `StyleSheet.absoluteFill` covers
the nearest positioned ancestor, which inside the stage is a scaled 412x892 box, so on a phone whose
aspect differs the parchment matte survives above and below the scrim (the owner's "white sections").
The sheet root now wraps its children in `OverlayHost` and the preset dialogs publish through
`Overlay`. Same mechanism, same reason as the v0.39 ScrollView case. `DimScreen` does NOT fix this: it
only tells the tablet margins what colour to be.

**`rollVoice`** is the single pure decision for the end-of-roll sound. The duality pair outranks the
bands: a pair thrown with Fear never takes the critical fanfare however high the total, and an ordinary
critical alongside it keeps its flourish on the die but speaks `muted` (the fanfare pitched down). The
gold on the total follows the voice, so a high Fear roll is not celebrated.

`staggerScale(n)` = max(1, 1.3 - 0.05 x (n - 2)): a pair lands a third slower, eight dice at the old pace.

## v0.41.3 (PR #443)

**A MONOTONIC PITCH CANNOT BE A PER-DIE FUNCTION.** v0.41.2 sorted the faces within each kind of die,
which rises beautifully inside a group and falls off a cliff between them (the last d4 is 4/4, the
first d6 might be 1/6). Whether a die HAS to be higher depends on the one before it, so
`rollCentsSeries` computes the whole throw at once: each kind of die gets a band `(k + frac)/G`, which
makes the rise arithmetic rather than a check, and the span is one CENTS_SPREAD however many dice
there are so a big handful cannot climb out of hearing. A final never-decrease pass covers the duality
pair, the one place the faces are not sorted.

**A DIE'S SOUND BELONGS TO ITS SPIN, NOT ITS LANDING.** The owner heard the roll sound "when it already
rolled" and suspected leading silence in the asset. It was not: OnPlaceToken.wav peaks 30ms in (measure
with `wave` + a peak scan before blaming a file). Both the sound and the face were scheduled at `land`,
a whole SPIN_MS x 0.84 late. The sound moved to `throwAt`; the face still waits.

**COUNTERS ON ADVERSARIES** (`lib/dm-counters` + `features/dm/counter-control.tsx`). A resource is a
plain number; a countdown may LOOP, meaning below zero it returns to `start` (up past the start is left
alone). `takeOver` replaces the entry's stat block: one counter and the entry is name + description +
that number, two or more and it is a title that opens into all of them. `counterMode` is the whole rule.
Counters live on the `Combatant` so history, export and import handle them for free (the v0.35 DM
modifier lesson); `cloneCombatant` resets them like hit points.

**DO NOT NEST A CONTROL INSIDE A ROW'S HEADER PRESS.** react-native-web renders a Pressable as a
`<button>`, so a stepper inside the header press is a button inside a button (invalid HTML, React logs
it) and on a phone the two presses negotiate. Put the press around the NAME and the controls beside it.

READ before dice-tray, dice-rotation, dice-sound, dice-order, dice-pitch, roll-preset, running-total,
cross-component-state, dialog-dim, dm-counter, dm-adversary, character-persistence, svg-performance or
effect-target work.
