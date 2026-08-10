---
name: runekeep-web-deploy
description: "RuneKeep's web target already builds (expo export --platform web); Cloudflare Pages is the chosen host; storage moved to IndexedDB in v0.24.2"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1859e40f-c67c-40af-8dd0-8ad1cbbfa612
  modified: 2026-07-28T02:58:15.152Z
---

**RuneKeep's browser build already works.** `npx expo export --platform web` produces `dist/`: 16
static HTML routes, one 4.7 MB JS bundle, ~59 MB of card art, ~63 MB total, ~90 seconds. Verified
running in v0.24.0. It works because the app was written for it: every store has a
`Platform.OS === 'web'` localStorage branch, NFC and audio are lazy `require()`s behind platform
gates, and `react-native-audio-api` ships `.web.js`.

The owner wants it online for a home game of ~7 players. **Cloudflare Pages** is the chosen host (free,
no bandwidth cap, which matters with 59 MB of art). Full instructions live in `docs/web-deploy.md`.
GitHub Pages needs `experiments.baseUrl = '/RuneKeep'` or every asset 404s.

**Storage is IndexedDB since v0.24.2** (`src/lib/web-store.ts`), so portraits are fine. It was
`localStorage` (~5 MB, throws rather than degrading) and a few inline portraits filled it.
`web-store` is a SYNCHRONOUS in-memory map that persists asynchronously behind itself, hydrated once
in `_layout` before first render, because `loadDraft` / `shouldShow` / `applyStoredMute` answer during
render and could not become async. Every store kept its shape; only the three functions it calls
changed. Falls back to `localStorage` if IndexedDB is blocked, and migrates old data on first hydrate
without clearing the original (so a rollback still reads).

**IndexedDB is VERIFIED at runtime** (v0.24.3): a character created in the browser survived a full
restart, read back out of IndexedDB by `scripts/web-probe.mjs`. Fallbacks are also structurally safe:
open/read failures drop to `localStorage`, and a readAll bug degrades to migration, not data loss.

Also gone in a browser: NFC sharing, and the `.rkp` file association (import becomes a file picker,
export a download).

**Desktop:** no desktop-specific layout work is needed, because `PhoneFrame` treats any display over
600dp as a tablet and draws the phone column centred. A PWA manifest in `public/` makes it installable
from Chrome/Edge. If a real `.exe` is wanted, Tauri 2 takes `dist/` via `frontendDist` and adds ~3 MB
using the system WebView2; Electron would add ~120 MB for the same result.

The web build ALSO needed four platform fixes before it was usable: see
[[runekeep-web-platform-gotchas]] before touching web, SVG, audio or any ScrollView.

See also [[runekeep-tablet-phone-frame]].
