---
name: runekeep-v0220-state-history
description: "v0.22.0 character state history (snapshots not events), the single save choke point, DmType/DmGap tokens, .rkp file association, and the onboarding tour"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1859e40f-c67c-40af-8dd0-8ad1cbbfa612
  modified: 2026-07-27T21:52:22.279Z
---

RuneKeep v0.22.0 (released 2026-07-27) shipped the UX overhaul from `docs/ux-audit-v0.21.0.md`
(scored 15/40 on Nielsen's heuristics). Seven PRs, #375-#381, all merged to main. PRD is issue #374.

**Character state history is SNAPSHOT-based, never replay** (`src/lib/character-history.ts`). Three
findings make replay impossible here, and they will still be true next time someone is tempted:

1. `leveling.ts:162` mints Experience ids **deterministically** from array length (`exp-lvl5-3`).
   Rewind past a level-up, author a card (appends to the same array), redo → id collision.
2. Actions have side effects outside the file: NFC broadcast, `.rkp` to the share sheet, forged PNGs,
   picker-cache image URIs. A replay re-runs them.
3. `parseCharacterFile` **mutates what it parses** (the subclass back-fill), so a snapshot written
   and read back is not byte-identical. Replay-equality checks produce false positives.

**There is exactly ONE disk-write choke point for in-play mutations**: the `saveFileRef.current`
closure in `redesigned-sheet.tsx`. Creation (`create-screen`) and import (`character-store`) are the
only other write entry points. This is why "no action is exempt" was tractable. Two traps there:
the closure stamps live resources+gold onto **every** write (so history classifies by *structural*
diff first, or every equip is mislabelled an HP change), and `mutateFile` calls it from inside a
`setFile` updater — **never schedule a setState in that closure**, it is a render-phase update.

History **travels with an exported character** (owner's call). Characters are never NFC'd, only
cards are, so the ~60KB tag ceiling doesn't apply; the retention cap bounds the file.

**The card trash is DERIVED from history**, not a stored array (`recoverableCards`). No schema, no
drift, bounded by the history cap for free.

`character-file.ts` now has a **migration hatch** (`MIGRATIONS` + `migrateInPlace`). It used to hard
reject any `schemaVersion !== 1` with no path forward, which would have made every save *and every
history snapshot inside them* unloadable on the first bump.

**DM tokens**: `DmType` (micro 11 / body 13 / title 16 / panel 20 / hero 26) and `DmGap` (intra 10 /
row 12 / section 24) in `theme.ts`. They replaced 21 font sizes and 25 spacing values. The older
`Spacing` token has always had **zero** usages. `FullUI-dm.svg` / `Pop-up-dm.svg` are desaturated
twins with namespaced ids; `PopupDialog`, `NumberKeypad`, `LoadingScreen` all take `dm`.

**`.rkp` file association** is live via `app.json` android intentFilters (path-pattern matched, no
MIME type exists). `src/lib/rkp-route.ts` is the pure decision fn: nothing imports without a
confirmation, and it **defers** while a sheet or the creator is open. `IncomingFileGate` in
`_layout.tsx` performs it.

Onboarding lives in `src/features/onboarding/` + `lib/onboarding-store.ts`, offered once after the
menu settles, reopenable from the `?` on the menu.

See also [[runekeep-tablet-audit-deferred]].
