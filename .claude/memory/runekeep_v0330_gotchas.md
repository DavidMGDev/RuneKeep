---
name: runekeep_v0330_gotchas
description: "v0.33.0: the forged-card cache key hashed field LENGTHS so recolouring a card could never invalidate it (now lib/content-sig.ts); the browser image picker returns blob: not data:; isFilePayload accepted ANY content:// including the app's own picked photos; AppScreen dialogs can only dim the inset column without the new overlay slot"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1859e40f-c67c-40af-8dd0-8ad1cbbfa612
  modified: 2026-08-03T11:24:10.954Z
---

Released 2026-08-03 (PR #405). Four root causes worth not rediscovering.

## The forged cache key was blind to most edits

`redesigned-sheet.tsx` built every custom-card / note / inventory / library forge key from a sum of
field **LENGTHS**:

    (title.length * 31 + text.length * 7 + (imageUri?.length ?? 0) + (color?.length ?? 0) * 13) % 99991

A colour is always exactly seven characters, so **recolouring a card could not change its key** and the
carousel served the old bitmap forever. Same for swapping any word for one of equal length. Reported
as "the edit dialog shows the new card but the carousel keeps the old one", and also very likely the
cause of a "description bleeds into the footer" report (an old bitmap forged under an older fitter).

Now `contentSig(...parts)` in `src/lib/content-sig.ts` (FNV-1a, `Math.imul` because the FNV prime takes
the product past 2^53). Base36, never contains a hyphen, which `forged-cache.ts` relies on when it
splits a filename on its LAST `-v`.

**How to apply:** any cache key over authored content must hash the content. Web forges nothing
(`useForgedSnapshots` returns early), so this whole class of bug is invisible in a browser.

## The web image picker returns `blob:`, not `data:`

`owned-image.ts` claimed in a comment that it returns a data URI. It does not. A `blob:` URL addresses
one page session's memory, so a browser-picked portrait died on the next tab reload, and a `.rune`
exported from the web carried `blob:https://runekeep.pages.dev/<uuid>` which is meaningless anywhere
else (imported on Android it renders as a blank white portrait). v0.33.0: `blobUriToData` at pick
time, `resolveWebBlobs` in `embedCharacterImages` at export, and `dropBlobUris` in
`parseCharacterFile` on the way in. See [[runekeep_rune_ext_sharing]].

## `isFilePayload` accepted every `content://`

The "deliberately broad on content://" rule from v0.24.0 (see [[runekeep_v0240_gotchas]]) was right for
shares and wrong for everything else: the app opens the system image picker itself and gets back a
`content://` URI of the same shape, and `IncomingFileGate` then read it off disk **synchronously as
UTF-8 on the JS thread** and offered it as a possible character. Now media URIs are rejected by shape
(`/images/`, `/video/`, `/audio/`, `photopicker`, `document/image%3A`), the read is async, and >2MB is
refused unread. Genuine shares from Downloads / WhatsApp / Drive still match, pinned by tests.

This was found while investigating an unreproduced softlock (owner backgrounded the app with the
picker open and came back to dead navigation). NOT confirmed as its cause. The useful symptom clue:
every button that NAVIGATES died while DM Mode / mute / tips kept working, which points at the router
being wedged, not at touches being eaten.

## AppScreen dialogs dim a rectangle, not the screen

`AppScreen` insets children inside the gold border and paints the border art OVER them, so a
`PopupDialog`'s `StyleSheet.absoluteFill` scrim only ever covers that inset column. The deeper the
dialog is nested the worse it looks (the update banner sits in the menu's bottom action stack, so it
dimmed the lower third). v0.33.0 added an `overlay?: ReactNode` prop to `AppScreen`, rendered LAST,
over the frame art and the status bands. Only the update dialog uses it so far; every other
`PopupDialog` in the app is still a direct screen child and is inset by ~18dp.

RN `<Modal>` is NOT the fix here: it escapes `PhoneFrame`'s magnified column and would render
unscaled outside the phone viewport on a tablet (see [[runekeep_tablet_phone_frame]]).

## v0.33.1: three of the above came back as regressions

**`thumb` + `source` is a LOD pair of TWO DIFFERENT FILES.** v0.33.0 gave printed-face ancestries the
same asset for both. `StraightCarousel`'s Slot mounts the `source` layer only within `IMG_HALF = 2`
slots of centre, so every card scrolled past mounted a SECOND expo-image view onto the same bundled
asset and unmounted it a moment later; several such cards side by side blank together and read as
"the whole carousel flashes off for one frame" (Android only). A single-bitmap card gets `thumb`
ONLY, no `source`. Never point both at one asset.

**Web persistence was NOT coalesced, despite the comment in character-store.ts saying it was.**
`saveCharacter` had a web early return doing `webList()` (JSON.parse the whole roster) +
`webWrite` (JSON.stringify the whole roster) SYNCHRONOUSLY per save, and a save fires on every token
drop / die tap. Web now shares the native `pending` + 300ms `flushTimer`, flushed on `pagehide` and
`visibilitychange` (a browser never fires the AppState hook native uses).

**History snapshots must not carry inline image bytes.** `stripHistory` existed to keep history out of
snapshots ("or the file would grow quadratically"); the same argument applies to `data:` URIs, which
v0.33.0's blob fix made the norm on web. 120 snapshots x a 200KB portrait, re-serialized per save.
`stripHistory` now swaps them for `KEPT_IMAGE` and `rewind` calls `rehydrateImages(snapshot, live)`.
**Consequence to remember: rewinding no longer restores old images.** `file://` paths are untouched.

**A cosmetic file field must not invalidate the deck memos.** `redesigned-sheet` builds jobs and decks
in two `useMemo`s keyed on the whole `file`, so a placed token rebuilt every card element. Harmless-ish
on native (bitmaps); on web NOTHING is forged so those are live svg cards. `deckFile` (via
`onlyTokensChanged`, a shallow reference compare, exact because every writer builds `{...f, patch}`)
gates both.

## Smaller

- Library cards in the CREATOR are `custom` live components, and `StraightCarousel` mounts only a
  window of slots (`WIN_HALF = 16`, bucket of 8).
- `scripts/web-probe.mjs` + an `eval:` rAF sampler over `document.querySelectorAll('img')` (count +
  effective opacity up the parent chain) is the cheap way to prove a reported "flicker" is NOT a React
  unmount or an opacity dip. It ruled both out here, which is what pointed at the image layer.
- `runOnJS` inside a per-frame `onUpdate` needs its guard flag claimed **on the UI thread**, or every
  frame in the hop queues another call. That is what fired the token-removal sound once per frame.
- `RecordIntent.steps` (character-history) carries what a level-up chose; written in `level-up-panel`
  where the labels already exist, because a file diff cannot name a card without the whole catalog.
