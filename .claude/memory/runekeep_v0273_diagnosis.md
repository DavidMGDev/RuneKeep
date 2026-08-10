---
name: runekeep-v0273-diagnosis
description: "The creator lock-up was a gesture rebuilt MID-DRAG latching `grind`; Android audio was the app double-starting its own oboe stream; the web audio facade has no `detune`; `overflow:hidden` is not enough on web, it must be `clip`"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1859e40f-c67c-40af-8dd0-8ad1cbbfa612
  modified: 2026-07-31T16:14:24.133Z
---

Verified root causes from v0.27.3 (2026-07-31). Each survived an adversarial verifier; three
sibling diagnoses were **refuted** and not shipped.

**The creation carousel lock-up was NOT the forge queue.** `flip` closed over `items` and `center`,
`onTapCard` closed over `flip`, and the master `Gesture.Pan` closed over `onTapCard` — so the whole
gesture graph was rebuilt on every forge completion and every detent. Swapping a Pan handler
**mid-drag** means the outgoing handler never receives `onEnd` or `onFinalize`, so `grind` stayed
latched above the `0.05` threshold in the `useDerivedValue` that publishes the centred index. One
stuck flag produces the entire reported triad: centre card keeps its low-res thumb (`center` never
advances), SELECT/RANDOM act on a stale card (parent mirror frozen), and it never recovers. Same
class as the v0.14.0 `onFinalize` bug, by a route that fix never covered. **Rule: any gesture in a
scrolling/animated surface must be identity-stable — read `items`/`center` through a ref, never a
dep.** A self-heal now unwinds a leftover grind on the next non-pad touch.

**A reanimated animation-completion callback must not gate its side effect on `finished`.**
`create-screen`'s deck fade did `if (finished) runOnJS(apply)()`, so an interrupted 140ms fade left
`pendingDeck` set forever: every later section tap returned early, the loader stayed mounted, and
`fade` (which drives the carousel AND the SELECT cluster) never returned to 1.

**Android audio: the app was breaking its own sound.** The context is BORN suspended on Android and
`state` is a live probe of the oboe stream. v0.25.0 changed `wake()` to resume before *every* sound
on the false premise that native contexts are never suspended. AAudio rejects a start on an
already-starting stream, `AudioPlayer` stores that rejection in `isRunning_`, and the render callback
emits zeros forever while `state` stays `suspended`. Resume ONCE per context and judge by the
resolved boolean, never by re-reading `state`. Also delete any extra `resume()` after `getCtx()` —
`getCtx()` already wakes it, and the second call in the same tick is the bug.

**react-native-audio-api's WEB `AudioBufferSourceNode` is a facade with no `detune` getter** (it
forwards buffer/loop/start/setDetune only; the real param is on `node.asAudioBufferSourceNodeWeb()`).
`node.detune.value = cents` therefore threw inside `fire()`'s silent catch, *before* `start()`, so
every sound with pitch variation was silent in the browser. Confirmed in
`node_modules/react-native-audio-api/lib/module/web-core/AudioBufferSourceNode.js`.

**On web `overflow: hidden` does not contain the app — use `overflow: clip`.** Expo's own reset puts
`hidden` on body; that only moves the scroll container down to `#root`, which `scrollIntoView` slides
just as far. With `clip` on `html, body, #root` the document collapses from 699x1514 to exactly
412x892. Suppress the image menu with a capture-phase `contextmenu` listener next to the existing
`dragstart` one in `+html.tsx` (exempt INPUT/TEXTAREA/contenteditable), not per-Image props.

**Web input needs more slop than native.** A touch screen reports a filtered contact point; a mouse
reports raw CSS pixels, so `minDistance(2)` on the sheet's master pan stole every hold-to-toggle.
`PAN_SLOP = web ? 10 : 2`, and the four "still a tap" thresholds must track it or a dead band opens.

**`record()` in character-history had no no-op guard**, so the sheet's mount / debounce / unmount
flushes each counted as an edit and truncated a rewind's future the panel had promised was safe.
Guard on `same(prev, snapshot)`. `rewindTo` must store `lastSavedRef` in the SAME stamped shape a
save produces (resources + gold), or the next flush looks like a real edit.

**A roster group whose header is not rendered must not be able to hide anything.** Deleting your last
folder removes the Ungrouped heading entirely, so a persisted collapse flag hid every character with
nothing left to tap. Also: `removeFolder` must clear the Ungrouped collapse when the deleted folder
had members, or characters are tipped into a shut pile.

Refuted and NOT shipped: gating live cards on `withImage` (they have no thumb under-layer, so far
slots become transparent holes, worse during a grind when the cut widens); the forge-queue park (real
bug, but it predates the browser build and cannot produce a stuck LOD); `CONTROLS_BAND` +16 (the
overlap was ~6dp, and raising the band SHORTENS the rail so it *eats* headroom, since the card rests
at `REST_FRAC` of the rail).

Stale `npx serve dist` processes from earlier sessions hold `dist/` open and make
`expo export` fail with EBUSY. Kill them by command line before exporting.

See [[runekeep_v0272_diagnosis]], [[runekeep_forged_cache_perf]], [[runekeep_web_platform_gotchas]].

## v0.27.4: why the browser beat the phone

Four costs the web build never pays, all removed:

1. **The forged-card cache keyed on the APP VERSION**, so every release invalidated every bitmap and
   the device re-captured a whole deck (two screen-sized PNG encodes per card, UI thread). Now keyed
   on `FORGE_CONTENT_HASH` — a sha1 of the card components + theme + all of `src/data`, generated by
   `scripts/forge-hash.mjs`, regenerated by the APK build, guarded by `forge-hash.test.ts`. **If you
   change a card renderer or any game data, run `npm run forge-hash` or the test fails.**
2. **The sheet's entry veil waited for EVERY card to forge** (`allForged`). Empty set on web, so the
   browser opened at once; a phone ran to the 7.5s fallback after every update. Removed: an unforged
   card renders live, which is what the bitmap is a picture of.
3. **`saveCharacter` serialized the whole file and wrote it SYNCHRONOUSLY on every save.** The modern
   expo-file-system has NO async write, and history is up to 120 full snapshots, so every hit-point
   tap wrote a few hundred KB on the JS thread. Now coalesced (300ms trailing), reads answered from
   the queue, deletes drop the queued write, `AppState` flush on background. `flushCharacters()`.
4. **Forging walked the bitmap folder twice per card** (pass listing + `dropOlder`). Listing is read
   once and kept in memory; pruning deletes by name.

Note: user-authored cards (custom, notes, library, experiences) already carry a content signature
inside their cache KEY, so dropping the app version cannot strand them — checked before shipping.
