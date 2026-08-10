---
name: runekeep_forged_cache_perf
description: "The v0.26.1 lag: the forged-card cache did a directory listing PER CARD PER PASS and never converged; plus scripts/web-profile.mjs (throttled phone + seeded character) and the PowerShell quote bug that broke every release upload"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 1859e40f-c67c-40af-8dd0-8ad1cbbfa612
  modified: 2026-07-30T21:29:08.241Z
---

Reported as "app is hella laggy everywhere". It was the forged-card cache, and it was native-only.

**The cache asked the filesystem a question per card, then asked again from scratch every time any
card finished forging.** Two `exists` probes plus a full `dir.list()` each. Since `FORGE_RENDER_V`
carries the APP VERSION, a release invalidates every card at once: N passes x N cards x one directory
listing, synchronous, on the JS thread. Fix: read the folder ONCE per pass and answer every card from
that listing (`src/features/create/components/forged-cache.ts`, pure + tested).

**It also never converged.** A card being SERVED a stale bitmap was recorded the same way as a card
that was finished (both landed in `sources`), so after an update exactly ONE card re-forged per
launch and the app stayed in its slowest state forever. "Done" now has its own ref (`settled`),
separate from "has something to show".

**A failed capture used to be retried the instant the pass re-ran**, so an uncapturable card spun for
as long as the sheet stayed open. It is marked settled and left until the next mount.

**Web was NOT the problem.** Measured at 60fps on home, roster, creation carousel and the sheet, at a
412x892 viewport with 6x CPU throttling. Do not go looking for web lag without measuring first.

**`scripts/web-profile.mjs`** is the tool that established that. Drives the built app in Chrome and
prints frame times + a CPU profile (self-time by function).
- `MOBILE=1` -> 412x892 at 3x device pixels (the pixel count is what makes a browser slow, not the JS)
- `THROTTLE=n` -> CDP CPU throttling
- `SEED=1` -> writes a level-5 character straight into IndexedDB (`runekeep` / `kv` /
  `runekeep.characters`, a JSON array of CharacterFile), so the SHEET is one tap away instead of a
  twenty-step creation walk. This is the fastest way to reach any screen in the web build.
- steps: `tap:LABEL` `xy:X,Y` `swipe:x1,y1,x2,y2` `fps:MS` `shot:NAME` `wait:MS` `PROFILE`

**`apk-build/build-apk.ps1` uploaded nothing for two releases because of a quotation mark.**
PowerShell 5.1 re-quotes a native command's argument and SPLITS on double quotes inside the string
instead of escaping them, so `--notes $notes` with a quoted phrase in the notes reached `gh` as
several arguments ("no matches found for `items`", a word from the middle of a sentence). Notes go
through `--notes-file` now. `-NoRelease` builds the APK without publishing it.

Related: [[runekeep_render_perf]], [[runekeep_apk_build]], [[runekeep_web_stacking_firefox]]
