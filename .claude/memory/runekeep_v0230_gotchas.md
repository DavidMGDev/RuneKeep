---
name: runekeep-v0230-gotchas
description: "v0.23.0 - the APK builder never ran prebuild (silently dropped every app.json change), RNGH ScrollView requirement, tablet breakpoint, contextual tours"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1859e40f-c67c-40af-8dd0-8ad1cbbfa612
  modified: 2026-07-28T00:46:35.718Z
---

RuneKeep v0.23.0 (released 2026-07-28). Two root causes worth never rediscovering:

**`apk-build/build-apk.ps1` did not run `expo prebuild`.** `android/` is a gitignored prebuild
artifact generated once, so EVERY `app.json` change since then was silently dropped from the APK.
v0.22.0's `.rkp` file association shipped and did nothing at all because of this. A prebuild step now
runs before gradle. **After any `app.json` change, verify it landed in
`android/app/src/main/AndroidManifest.xml` before believing it shipped.**

**Android `.rkp` association needs three things**, all of which were wrong:
1. `pathPattern` must be double-escaped: `.*\\.rkp` LITERALLY in the XML, which is `".*\\\\.rkp"` in
   app.json source. Android's docs require it.
2. `pathPattern` **cannot match a `content://` URI** from WhatsApp/Gmail/Drive: those are opaque
   provider ids with no filename. Only MIME matches there, and an unknown extension arrives as
   `application/octet-stream`.
3. No `SEND` filter: Expo's Linking surface only delivers ACTION_VIEW urls, so appearing in a share
   sheet with no readable payload would be worse than not appearing.

**Gesture-in-a-list rule:** a `Gesture.Pan().activateAfterLongPress()` inside an RN `ScrollView` never
fires on Android, because the native scroll claims the touch. Import `ScrollView` from
`react-native-gesture-handler`. This has now bitten twice: adversary detail (v0.21.0) and the
encounter log (v0.23.0).

**Tablet strategy is "look the same, do not stretch"** (`src/hooks/use-layout.ts`). Breakpoint is
`smallestWidth >= 600dp` (Android's own sw600dp); the widest phone reports ~480dp, so the margin is
25% and phone layout is a no-op by construction (`scale === 1`, `maxContent === Infinity`).
`AppScreen` centring a measured column does most of the work. Grids add COLUMNS rather than
inflating cells. The sheet's gold border is pinned to the **stage rect**, not the container, because
it is a 753x1500 raster stretched with `contentFit: fill`.

**Onboarding is three contextual tours** (welcome / creation / sheet), not one. The `?` on the menu
RESETS them rather than replaying. Pages can `gate` Next until the gesture is actually performed.

**DM stat radial:** `open()` must be seeded with the real touch point, not the anchor, or the cursor
renders a finger-width from the thumb.

**Owner vocabulary:** the bottom-of-sheet controls are **circle controls**, never "gears". Toasts use
the character sheet's style (compact pill under the top border), never the old DM slab.

See also [[runekeep-no-em-dashes]], [[runekeep-v0220-state-history]].
