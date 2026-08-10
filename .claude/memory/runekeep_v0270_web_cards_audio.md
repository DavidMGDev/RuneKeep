---
name: runekeep_v0270_web_cards_audio
description: "v0.27.0: the sheet DROPPED any card with no forged bitmap (so the browser lost 5 categories); Android release audio needs expo-asset not a module id; onTextLayout is a no-op on web; starting potions are archive consumables"
metadata:
  type: reference
---

**The sheet's deck builder used to DROP any card whose forged bitmap was not ready.** Nothing is ever
forged on web, so a hero made in a browser permanently lost experiences, the class feature card,
weapons, armor and the whole starting inventory. Every forged category now falls back to the LIVE
component through one helper (`forgedItem`/`coverOf` in redesigned-sheet), the way the
embedded-homebrew path always did. If you add a card category, use those helpers or it will be
invisible on web.

**Android RELEASE builds have their own audio code path, and it was broken.** `decodeAudioData(<module
id>)` resolves to a Metro URL in development but takes
`NativeAudioAPIModule.readAndroidReleaseAssetBytesAsBase64` in a release APK, which does not survive
the packaging here: it throws, `decode()` swallows it, and the app is SILENT with nothing logged.
That is why sound worked in Expo Go and never in the APK. Fixed by resolving through
`expo-asset` (`Asset.fromModule(x).downloadAsync()` → `localUri`) before decoding; web still passes
the id straight through. **Not verified on a device** — check the APK before trusting it.
The library is present in the APK (`libreact-native-audio-api.so`, `liboboe.so`) and all 75 sound
files ship as `res/*`; `disableFFmpeg: true` is NOT the cause (miniaudio decodes wav/mp3 without it).

**`onTextLayout` is a NO-OP in react-native-web** (add it to the list beside `adjustsFontSizeToFit`).
`FillText` binary-searches the font size one step per layout event, so on web it never took a step and
the character name rendered at max size inside a clipping box: invisible. Fixed with a canvas
measurement (`components/fit-text.ts`, pure search + `measureWeb`).

**Starting potions are archive cards now.** `itemOptionId()` returns the CONSUMABLE id
(`consumable-minor-health-potion`) when the guide's item exists in the archive, else the old
`inv-opt-*` id. Old characters hold the old id, so the sheet accepts BOTH (`authoredItemOptionId`).

**Creation lag**: cards forge one at a time and each completion rebuilt every item object in the deck,
so every memoized carousel slot re-rendered. Items are cached by identity (`keep()` in create-screen).

**An Experience is a phrase, no description.** `isExperienceType(draft.typeLabel ?? kindLabel)` drives
both the advanced editor and QuickCardFlow; the type is re-read as it changes.

**Process trap I hit**: `git checkout main` while a gradle APK build is running silently bundles the
WRONG JS. Never switch branches mid-build; delete any APK produced that way.

Related: [[runekeep_forged_cache_perf]], [[runekeep_web_stacking_firefox]], [[runekeep_sound_system]]
