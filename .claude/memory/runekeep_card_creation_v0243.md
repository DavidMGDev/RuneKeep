---
name: runekeep-card-creation-v0243
description: "v0.24.3 card creation: QuickCardFlow (Add Card badge only) + the one destination prompt every arriving card passes through — read before touching card creation or NFC receiving"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1859e40f-c67c-40af-8dd0-8ad1cbbfa612
  modified: 2026-07-29T23:57:52.167Z
---

**Card creation has two modes as of v0.24.3, and one choke point for where a card lands.**

`NewCardFlow` (sheet/new-card-flow.tsx) is still the single entry, and it now owns three decisions:

- **`quick`** (true ONLY for the sheet's Add Card badge, i.e. `newCardEntry === 'card'`) renders
  `QuickCardFlow`: title + body, Enter advances title → body → a confirmation showing the finished
  card. The art zone IS the control (tap rerolls the random color, hold opens the image picker, with
  the usual charge-and-fill over the art band only). No effects, no type picker, no catalog. The float
  menu's New Card and the per-category Add button still open the FULL `CardEditor`, deliberately.
- **Advanced hands the draft over** (`onAdvanced` → `CardEditor initial={draft}`), so switching is
  never a restart. `CardEditor` already accepted `initial`.
- **The destination prompt** (`CardDestination`, sheet/card-destination.tsx) intercepts BOTH editors'
  save: the draft is held in `pending` and the category comes from the player, not from whatever
  category was on screen. NFC receiving asks the same question between Accept and the drop ceremony
  (`NfcReceiveCeremony` gained `asking`/`land(dest)`). Both are fed `moveTargets` from the sheet, which
  already excludes Beastform, Martial Form and Favorites.

`destinationOrder(categories, suggested)` lives in `carousel-categories.ts`, NOT in the picker
component: anything importing `@/constants/theme` cannot be unit-tested (theme starts with
`import '@/global.css'`, which the Jest transform cannot parse). Same trap as `screen-dim.ts`. Tested
in `card-destination.test.ts`.

Both prompts pass `destinations={[]}` safely: an empty list falls back to the authored category, so a
caller that has not wired it can never strand a finished card.

See also [[runekeep-web-platform-gotchas]] (web ignores `submitBehavior`, so Enter needed a key
handler), [[runekeep-card-types]], [[runekeep-card-system-v03]].
