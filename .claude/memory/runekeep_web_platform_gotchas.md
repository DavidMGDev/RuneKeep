---
name: runekeep-web-platform-gotchas
description: "The four ways RuneKeep's web build broke (v0.24.3) and the browser harness that found them — read before any web/desktop work or any SVG/audio/ScrollView change"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1859e40f-c67c-40af-8dd0-8ad1cbbfa612
  modified: 2026-07-29T23:57:19.602Z
---

**The web build was broken in four independent ways, and `tsc` + `eslint` + `jest` all passed.** Fixed
in v0.24.3. Every one of them is a class of bug that will come back, so check for the shape, not the
instance:

1. **A library's API can differ between its native and web implementations.**
   `createBufferSource({ pitchCorrection: false })` takes an options OBJECT on native but a bare
   BOOLEAN on web (`web-core/AudioContext.js` wraps it itself), so the object read as truthy, selected
   the pitch stretcher, and its WASM never loads: EVERY sound threw an uncaught error. Calling it with
   no argument is correct on both. Read the `web-core/` source, not the shared types.
2. **SVGO minifies ids per file (`a`, `b`, `c`).** Fine on native (each `<Svg>` owns its canvas), fatal
   on web (all inline `<svg>`s share one document, so `url(#a)` hits whichever rendered first). All
   nine class banners painted magenta. Fixed globally by `.svgrrc.js` adding `prefixIds` with a
   path-derived prefix. This supersedes `scripts/uniquify_svg_ids.py`.
3. **A browser does not drag-scroll an `overflow` container, and `<img>` is a drag source.** Every list
   looked frozen and dragging card art handed you a translucent PNG ghost. Fixed in `src/app/+html.tsx`
   (new, web only): `user-drag: none`, no text selection outside inputs, plus a drag-to-scroll shim
   that stands down whenever a gesture-handler target (`touch-action: none`) sits between the pointer
   and the scroller. That `touch-action: none` marker is the reliable way to tell "a gesture owns this".
4. **Anything gated on native-only work must be satisfied explicitly on web.** The sheet waits for every
   forged card bitmap before lifting its loading veil; web never forges any (cards render live), so the
   veil hung OPAQUE for its full 7.5s fallback on every open, swallowing every tap. Looked like a hang.

Also: `react-native-web` IGNORES `submitBehavior`, so Enter in a multiline TextInput types a newline;
catch `onKeyPress` with `key === 'Enter'` on web instead.

**`scripts/web-probe.mjs` is how all four were found.** It drives the already-installed Chrome via
`puppeteer-core` (a devDependency, no browser download) with real mouse/keyboard input, and exits
non-zero if the page logs anything. `RK_PROFILE=<dir>` keeps IndexedDB between runs; `RK_HEADED=1`
shows the window. Run it against `expo start --web` AND against the exported `dist/` (they do not
bundle identically). Screenshots are the point: three of these were only visible as pictures.

IndexedDB persistence (v0.24.2) is now VERIFIED at runtime: a character survived a full browser
restart. That supersedes the "never exercised" caveat in [[runekeep-web-deploy]].

See also [[runekeep-tablet-phone-frame]], [[runekeep-web-deploy]].
