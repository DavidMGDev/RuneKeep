# Card performance investigation

Status: selected optimizations authorized for release as v0.43.6. Baseline: v0.43.5.

## Findings from the v0.43.5 implementation

- `components/card-carousel.tsx` mounts a `CardSlot` for every card. Each slot owns several animated styles, shared values, and gestures. Its main style computes sine, cosine, Gaussian scale and transforms even when the visibility curve returns zero. Drawing fewer textures does not bound this CPU work.
- Full-resolution images mount only within two slots of the settled center. The center intentionally stops following during a gear grind, while live card bodies follow a separate bucketed center. A distant jump therefore needs a React commit and image decode after release. Making the entire deck full resolution would trade that delay for memory pressure.
- Thumbnails stay mounted and use expo-image memory/disk caching. Preserve this safety net: narrowing it risks blank cards when fast gear scrolling outruns JS.
- Live SVG/text cards are windowed, but a newly installed pack or cold forge cache still requires serial capture of each card twice. `useForgedSnapshots` already indexes disk once and serves stale artwork; do not undo these improvements.
- The parent still loops over the entire deck on center updates. Memoized slots help only when item objects and callbacks remain stable. The sheet rebuilds card items after forging and character edits.
- Gear-browser result lists use ScrollView with mapped children. These are a better fit for a recycling list than the animated hand.

These are code findings, not device profiles. No claim of measured FPS, memory savings, or instant distant-card loading is made.

## Changes selected for release

Short-circuit the main per-card transform calculation only when the card is already fully transparent, edit mode is fully closed, and the card is not the focused fullscreen card. Retain every mounted thumbnail, original visibility curve, image windows, gestures, and visible-card geometry. This uses existing Reanimated worklets and adds no dependency.

Tests sweep fractional positions through the compact/expanded visibility boundary and verify that editing, focus, and transition states cannot be culled. This addresses one CPU cost, not all animated-style subscriptions or distant full-resolution decode.

The release also indexes embedded cards, forge jobs, authored cards and assembled homebrew class pages once per deck rebuild. The live scroll center warms an additional image-only band with the existing two-card radius. The union of settled and live bands mounts at most ten full-resolution images (plus explicitly carried cards), regardless of deck length. Token overlays and page controls keep their original settled window.

Interaction testing found an existing sorting defect: in-deck reorder assigned category overrides to every sorted card. Starting weapons have appearances in Arsenal and Inventory; the new override moved both appearances into Arsenal. The reorder now assigns categories only to cards actually crossing decks.

## Recommended sequence after testing

1. Profile the release build with identical saved decks: 25, 100, 300 and 1,000 cards. Include printed art, forged cards, homebrew live controls, tokens, copies and multi-page cards. Measure UI/JS frame times, native memory, time from gear release to sharp artwork, cold sheet open, and warm sheet open. Test on the user's slower Android phone; desktop web alone cannot validate the GPU/native path.
2. Keep full-resolution image nodes mounted in a slightly wider, bounded band during normal scrolling. Investigate a small directional warm-ahead queue in the installed expo-image 3.0.11 API. Cancel obsolete queued work after jumps; never predecode the whole deck. Local Metro assets, file URIs and web need separate validation. Measure peak decoded memory before increasing the band.
3. Stabilize deck-item identity and build id-to-card maps once per deck change. Isolate center tracking from expensive sheet derivation. These preserve layout and gestures and should precede a renderer rewrite.
4. Experiment with a bounded pool of active animated slots plus prewarmed thumbnails only if worklet overhead still dominates. Carry focused, raised and dragged cards across pool changes. Sorting, drop-commit index bridges, tokens, pager state and accessibility need identity tests. Fast gear jumps must have a visible fallback independent of JS scheduling.
5. Consider FlashList v2 for gear-browser/library lists, preserving row dimensions, spacing, selection and scroll position. Do not replace the hand with a list: it is an arc with overlapping z-order, fullscreen growth and grouped dragging, not a conventional scroller.

## Framework/library assessment

**Reanimated (already installed): keep.** This is the appropriate UI-thread gesture/animation layer. Its official guidance identifies large animated-component counts as a scaling risk. Current upstream flag recommendations depend on React Native/Reanimated versions; this project is pinned to RN 0.81 / Reanimated 4.1, so do not blindly copy flags requiring a newer runtime. Profile release builds.

**expo-image (already installed): keep and tune.** It already provides caching, transitions and recycling keys. Wider bounded decode coverage is a better first hypothesis for distant-card sharpening than swapping image libraries. The SDK 54 documentation URL currently redirects to latest, so implementation must also be checked against installed 3.0.11 types and native source.

**FlashList v2: candidate for regular lists.** Recycling reduces mount churn but requires careful state and prop identity. It is not a drop-in optimization for the existing fanned hand. No new dependency is included in this experiment.

**React Native Skia: later option.** A single canvas could reduce view/animation overhead for static card art. Live controls, accessibility, text/SVG fidelity, flips, tokens and hit-testing still need native overlays or reimplementation. Current upstream Skia also requires newer worklets than the installed 0.5.x line; select an SDK-compatible version before any prototype. That is a larger equivalence risk than the first experiments; do not adopt without a device profile showing view overhead dominates.

**Global state/framework migration: no evidence for it.** Switching Expo, React, routing or state libraries would not by itself remove per-card worklets, image decoding or forge work.

## Acceptance before merge or deployment

- Same art, crop, text, shadows, stacking, fade timing, fan geometry and touch targets in compact, expanded and fullscreen states.
- Repeated fast gear sweeps from first to last card and back, immediate fullscreen opening after landing, rapid category changes and return to a previous card: no blanks or new sharpening delay.
- Edit mode: raise distant cards, group drag with autoscroll, sort, drop, exit midway through transitions. No missing carried cards or changed selection.
- Roll dice, toggle equipment, modify tokens, switch pages and open homebrew controls; no stale state.
- Capture baseline and experimental traces on the same device with the same decks, cold and warm caches. Reject if scrolling improves but peak memory, opening time or distant-card readiness regresses.
- User authorized implementation, interaction testing, merge and release. No Android device was attached for physical touch or native frame-time measurements.

## Primary references

- [Reanimated performance](https://docs.swmansion.com/react-native-reanimated/docs/guides/performance/)
- [Reanimated feature flags and compatibility caveats](https://docs.swmansion.com/react-native-reanimated/docs/guides/feature-flags/)
- [Expo image SDK documentation](https://docs.expo.dev/versions/v54.0.0/sdk/image/), checked alongside installed source
- [FlashList performance and recycling](https://shopify.github.io/flash-list/docs/fundamentals/performance/)
- [FlashList v2 architecture](https://shopify.engineering/flashlist-v2)

- [Skia installation requirements](https://wcandillon.github.io/react-native-skia/v2/docs/getting-started/installation/)

## Verification for v0.43.6

- TypeScript and 106 unit suites (1,632 tests) pass.
- `node scripts/card-interactions.mjs http://localhost:8081` uses an isolated browser profile and a 108-card mixed fixture. It asserts real gear scrolling, edge-hold category switching, gear-hold edit entry, group selection and drag order, select/deselect all, animated sort order and membership, edit gear scrolling, exit to compact, category switching, fullscreen, page taps and page swipes. It reads provider state from React dev fibers for assertions and calls provider actions for fixture setup and actions otherwise reached through menus; gesture checks use real mouse input. Run with `RK_FIREFOX=1` for Firefox. This script requires the dev server, not a production minified bundle.
- Repeated screenshots are inspected for card appearance; this is not a pixel-perfect cross-platform proof. Native release build is required as well. No physical Android device is attached, so native FPS, memory usage and physical touch remain unmeasured.
