---
name: runekeep-v0360-characterize
description: "v0.36 - the stat wheel crash was an animated TRANSFORM around an <Svg> (native Fabric, invisible to any JS guard); Characterize turns a stat block into a real character via one pure module; adjustsFontSizeToFit is a web no-op so card titles are now sized by arithmetic into a fixed band"
metadata:
  node_type: memory
  type: project
---

RuneKeep v0.36 (PR #425, PRD issue #424). Nine owner reports. The load-bearing findings:

**NEVER animate a transform on a view whose children are react-native-svg nodes.** This was the stat
wheel's fifth fix and the one that had survived four earlier passes. `float-menu.tsx` holds the same
radial on the same Samsung phones and has never crashed; the only structural difference left was that
it animates **opacity only** on the view holding its `<Svg>`, while `stat-radial` animated
translate+scale on that view every frame from a worklet. It is a native Fabric failure, so the v0.35.3
`guard()` toasts and the error boundary stayed silent all the way through, which is exactly how the
fault was identified as native. The wheel is now placed once from React state in `open()` and only
fades; the bloom scale is gone. See [[runekeep_v0350_dm_print]] for attempts one to four.

**`adjustsFontSizeToFit` does nothing on react-native-web**, so any layout budget that allows for a
shrunk title is wrong in a browser. That is why a two-line card title clipped its own description on
Android only. `fitTitle` in `lib/fit-text` picks the size before rendering into a band ONE LINE TALL
that never changes height: shrink to one line, allow two only once they fit that same band. Applies to
the generic, weapon, armor and loot cards. Bump the forge hash after any of it.

**`withImage` / `withLive` in `card-carousel` gate on distance from the ROW CENTRE**, and an edit drag
scrolls the row, so a card carried far enough vanished in mid-air (a card with no forged bitmap loses
its live body too, leaving only the landing ghost). Raised cards now bypass both windows.

**`DmModal`'s tap absorber fights a platform `ScrollView` for the responder.** Third time in this repo:
inside a DM modal, use the gesture-handler `ScrollView`.

**Characterize.** `lib/characterize.ts` is pure and is the ONLY thing that knows how a stat block
becomes a character; three consumers read it (the creator's review carousel, the cards written at
Forge, the numbers written on the file) so they cannot drift. Key decisions:

- A characterized entry is a `Combatant` with `charId`, so it stays on the side it was fighting on. Its
  vitals live in `Encounter.charVitals` because it is not a party member.
- Carried thresholds / HP / stress are held by computing the sheet ONCE without them and writing the
  difference as a bonus effect on the carried card. That is the only way an 8/14 adversary still reads
  8/14 whatever class, level and cards the DM picks.
- Two additive `CharacterFile` flags, each honoured in exactly one place: `arsenalOnly` (the category
  resolver in `redesigned-sheet` and the matching `place()` in `lib/dm-card-list`) and
  `skipStartingKit` (`buildDeckJobs`).
- Level maps tier to a band (1 / 2-4 / 5-7 / 8-10) with a typical-difficulty adversary landing MID-band
  and every two points of difficulty moving it one level either way, clamped.
- Transformations are `expansion: 'void'`, which IS Hope and Fear (renamed in v0.19.2, id kept). The
  step is gated on the APP-level expansion record, not the character's picks.

Verified in Chrome end to end via a seeded IndexedDB encounter (`runekeep.parties` / `.sessions` /
`.encounters`, and onboarding as `{welcome:{done:true},creation:{done:true},sheet:{done:true}}`).

## v0.36.1 additions

**A shared `content://` file CANNOT be read with the modern `expo-file-system` File API (19.0.23).**
Every content URI goes through `SAFDocumentFile`, whose document lookup is literally
`if (uri.pathSegments[0] == "document") DocumentFile.fromSingleUri(...) else fromTreeUri(...)`. A
FileProvider share (Quick Share, CX File Explorer, WhatsApp) looks like
`content://<authority>/external_files/Download/hero.rune`, so it takes the TREE branch, and
`fromTreeUri` throws `IllegalArgumentException` on a non-tree URI. That throw comes out of `exists()`,
which BOTH `File.size` and `File.text()` call before they touch a stream, so the read never reaches
the `openInputStream` that would have worked. **Fix: copy first with the LEGACY module's
`copyAsync`**, whose `scheme == "content"` branch is a plain `contentResolver.openInputStream` with no
DocumentFile involved, then read the copy. Legacy `readAsStringAsync` is NOT a substitute: that one is
gated on `isSAFUri` and throws "Unsupported scheme". (This corrects the v0.24.0 note in
[[runekeep_v0240_gotchas]] that said only the modern module reads content URIs.)

**`+native-intent` must NOT apply the picker guard.** `isFilePayload`'s `MEDIA_URI` check exists to
ignore what the app's own image picker hands back through `Linking`, which cannot happen on a launch
intent. Applying it there made a Quick Share open the app and sit on the menu doing nothing. Launch
intents use `isLaunchFile` (any `content://` or `file://` that is not a `runekeep://` deep link);
`Linking` URLs keep the narrow check.

**`GEAR_SWIPE_PX` is the golden gear's sensitivity and SMALLER is more sensitive** (it is the finger
distance covering first card to last). 105 -> 87.5 in v0.36.1. The gesture that sets the floor is
standing on the last card and switching to the category on the LEFT: the whole deck plus enough
over-scroll to arm the switch, in one swipe. One constant, shared by native and web.

**A two-card carousel opened on the LAST card** because every call site used `Math.floor(n / 2)`.
`Math.floor((n - 1) / 2)` is the true middle for odd counts and the left of the two for even.

**Portraits are square images over chamfered frames everywhere**, which only shows when something
dims the image and uncovers the corners. `components/portrait.tsx` is the one shared clip; its
clip-path id must be per-instance (`useId`), because a shared id collides in the browser.

## v0.36.2 additions

**The stat wheel is WEB ONLY now, by the owner's instruction, after SIX attempts.** `WHEEL_ENABLED`
in `features/dm/wheel-enabled.ts` is `Platform.OS === 'web'`; `stat-pulse` returns a plain Pressable
(no gesture, no `useStatRadial`, no shared values) and `stat-radial` mounts no host when it is false.
Do not reinstate it on native without a logcat. The keypad replaced it and now opens on the CURRENT
value (`initial` prop) so its plus/minus are the quick adjustment.

**A card TITLE is not body text and must not be measured like one.** `CHAR_RATIO` 0.53 is Archivo
Regular running text; a title is uppercase, black weight and letter-spaced, whose real advance is
about 0.69 em. Sizing titles with the body number called a 22-char title one line at 17pt when ~17 is
the truth, so `numberOfLines` cut it with an ellipsis. `FitBox.charRatio` exists for this and
`fitTitle` passes 0.72. Owner's symptom "breaks after around 17 characters" back-solves to the ratio
exactly, which is how it was found.

**`setDraft` then reading `draftRef.current` in a `setTimeout(0)` reads the OLD draft.** That is what
made Skip and Forge do nothing and then leave the Forge button dead: forge found no class on the
stale draft and returned in silence. Any "apply then act" pair must return the value it wrote, not
publish it and hope. `applySkips` does.

**A characterized character may have NO class** (`CharacterFile.classless`): the file still names one
because every derived number starts from a class, but its cards and its label are dropped and the
carried Evasion/HP overwrite its numbers. Only reachable when both of those are carried, which is
what makes the fallback invisible.

**Two identical button labels on one screen is a real bug, not a nitpick** - the skip menu's "Select
all" sat a few dp above the carry step's own "Select all". Renamed to "Skip everything".

## v0.36.3 additions

**`router.replace` to a screen ALREADY IN THE STACK pushes a second copy of it.** Forging a
characterized adversary did `router.replace('/encounter?id=…')` after arriving by `push`, so the old
encounter screen stayed underneath holding pre-characterize state; going back landed on it and its
next debounced save overwrote the good data. THREE owner reports were this one bug (the entry
reverting, the back button "transitioning into itself", an ally that "never forged"). Return with
`router.back()`, and reload the screen in a `useFocusEffect` that flushes any pending debounce first.
Any DM screen that can be left and returned to needs the focus reload.

**A card TITLE cannot be measured with an average glyph width.** "Not strong enough" was cut while
the LONGER "Not strong enough yet" was fine, which is only possible if the letters differ: uppercase
Archivo Black runs I 0.34 em to W 1.02. `titleCharRatio` in lib/fit-text sums a cap-advance table and
gives `fitText` the string's OWN average as `charRatio`. `adjustsFontSizeToFit` is kept as a
native-only backstop on top of the computed size, so the arithmetic leads (it is the only thing that
works on web) and the renderer corrects; using either alone is what produced the ellipsis.

**`getPlaqueTheme` is a TABLE now** (`KIND_THEMES` in card-divider.tsx), ~40 kinds. Adding a card type
means adding a row. Keep the two gradient stops close in value and the text bright-on-dark or
ink-on-light; the generic "Card" fallback stays parchment on purpose.

**Track ceilings are the GAME's, applied after the engine** in `toSheetCharacter`: hp/stress/armor
clamp to 12, hope is 6 less scars (`liveSources` already drops hopeMax effects). Clamping after the
engine keeps the Modifiers breakdown honest while the sheet shows what it can draw.

**`nestedScrollEnabled` on a gesture-handler ScrollView inside `DmModal` breaks the scroll** on
Android: it hands the drag to a parent that does not scroll. That was the one difference between the
library detail sheet (broken) and the adversary Configure panel (fixed in v0.36.1).

**A "done" step is not a "filled in" step.** Anything the stat block seeds is done immediately, so a
skip menu built on `deckDone` marks Name/Inherit/Level as answered and warns about discarding answers
nobody gave. `Draft.touched` records what the DM actually changed.

---

## v0.37 (2026-08-07) — the cards panel gives up on dragging

**Hold-to-drag is GONE from the Cards gallery** (`card-management-panel.tsx`). It was the FOURTH
gesture in this repo rebuilt underneath itself while running (v0.27.3 creator, v0.35 stat wheel,
v0.35.1 this same gallery), and v0.35.1's callbacks-behind-a-ref guard — the fix that worked
everywhere else — did not save it: still let go of itself on web, still crashed Android. The whole
drag apparatus is deleted: ghost, hover insertion bar, tile measurement, group assembly, drop
resolution, `LOCKED_CATS`, `letBrowserScroll`, `onReorderCard` (singular), `onMoveCards` on this
panel. Tiles are plain `Pressable`s with `onLongPress`. **Do not reintroduce a drag here.**

**Tap looks, hold picks.** The rules are a pure module, `character-sheet/gallery-select.ts`, because
the load-bearing one is a STATE rule, not a gesture rule: the footer only renders while something is
selected, so select mode with an empty selection has no Clear and swallows every tap. `tapTile`
leaves select mode when the last card is deselected. Tap outside select mode sets `focusId` →
`CardFocus`, a still card at 1.7× that FADES in and out (the carousel's grow-in-place focus reads as
a jump-cut from a 92px tile).

**Every gallery tile being a gesture target is why the browser could not scroll the list**:
gesture-handler's web delegate stamps `touch-action: none` on each wrapped element, so only the gaps
between cards panned. Plain Pressables fixed that as a side effect.

**Move now goes through `onReorderCards` with `movedFirst(ids, existing)`** so the selection lands at
the FRONT and the incumbents follow. That is what makes "move into the category they are already in"
mean something, and it is the replacement for the deleted drag. The pop-up says so, singular/plural.

**A modal's `zIndex` loses to a panel two levels above it in the tree.** `NfcSendModal` (SHELL_Z
10020) rendered inside the sheet's stage container while `CardManagementPanel` (10000) was a sibling
of that container, so Share from the Cards panel opened UNDERNEATH an opaque full-screen interface.
Moved beside the float-menu panels. Identical to the v0.34.8 restore-prompt fix; check the TREE
POSITION, not the number, whenever an overlay is reported as hidden.

**`PLAQUE_BLEED = 2` in card-divider.tsx**: the coloured chip's sub-box is trimmed from the left
(`maskW * 0.16`) and stopped a hair short of the divider's gold, leaving a sliver of dark hollow.
Absolute px, not a fraction: it is a seam between two SVGs and does not scale.

**The six expansion classes had NO class plaque** (assassin/witch/warlock/bloodhunter/summoner/
brawler) and fell through to the generic red; every base class had one. Each is now built from its
two DOMAINS, which is what its banner is painted from. `card-divider.test.ts` asserts all fifteen
classes have distinct gradients. Every call site already passed `classKey`.

---

## v0.37.1 + v0.38 (2026-08-07)

**A press released OUTSIDE the app column on DESKTOP web never reached the app.** RNGH captures the
pointer on `event.target` at pointerdown; when that capture does not hold (an input, an element a
re-render replaced, a capture the browser dropped) the release goes to whatever is under the cursor,
and on a desktop that is the margin beside the 412dp column. `RELEASE_ANYWHERE` in `src/app/+html.tsx`
watches `pointerup`/`pointercancel` at the WINDOW in the BUBBLE phase and re-sends to the press's
origin element ONLY when `e.composedPath()` does not already contain it, so it is provably a no-op in
the normal case. Mouse only; a `touch` pointerdown never arms it. Synthetic input (puppeteer) cannot
reproduce the original bug because capture always holds there - test the SHIM, not the symptom.

**`PLAQUE_BLEED` is 1, not 2.** v0.37's two pixels overshot the divider's gold.

**The Scar card TYPE carries its own effect.** `effectsForType(effects, type)` in `card-types.ts` adds
`{target:'scar',delta:1}` when the type becomes Scar and strips it when it becomes anything else,
silently, without touching the player's own effects. Wired at the ONE type-picker call site in
`card-editor.tsx`. Same file added Attack / Lore / Flavor / Mystery.

**`dm-decks.tsx` builds the DM's OWN view of a character's cards** and is a SEPARATE list from the
sheet's. A rule about which cards a character has (the characterized gold card) has to be applied in
both or the DM sees a card the player does not.

### v0.38

**The Toggle needs BOTH `cardStates.toggleable` and the card to be APPLYING** (`enabledIds` or
permanent). The owner's "ancestry cards have no toggle" was the v0.34.5 identity exclusion, now gone;
every domain card is toggleable unconditionally. An ancestry's effect only reaches the sheet when the
ancestry is in `enabledCardIds`, so a hand-written test file must equip it or nothing shows.

**Sorting a hand is three modules.** `lib/card-sort` (pure ordering: 5 keys, blanks last in BOTH
directions, id as the final tie-break so a hand sorts the same way twice) + `features/cards/
card-sort-entries` (the walk through scans, forged cards, equipment tables, homebrew and live
controls) + `sheet/sort-panel.tsx`. Greyness is judged by CHROMA, not HSL saturation: saturation is
divided by distance from black/white, so parchment reports 0.44 and files itself among the greens.

**`scripts/card_art_colors.py` samples all 363 bundled cards' ART (top 52%, frame trimmed, parchment
and shadow dropped) into `src/data/art-colors.ts`.** There is no pixel API in React Native, so a
photograph the player supplied has NO readable colour and sorts last. Hue is averaged as a unit vector
or two opposite hues average to grey.

**The sort animation is the DROP, reused.** `sortGather` pulls the selected cards into a pile, the new
order commits behind them through `pendingOrderSV` (the v0.12.5 drop-flash bridge), and they spread
out. Nothing interpolates between two orders: the row's transform is already a continuous function of
the index, so changing the index under a gathered pile IS the sort. The carousel registers the routine
through `sortFnRef` on the context because it is a CHILD of the provider.

**A modal that must not let a tap through wraps the whole stage in a Pressable with an EMPTY onPress.**
Edit mode is left by tapping the gear or the sheet, both of which sit behind the sort panel.
