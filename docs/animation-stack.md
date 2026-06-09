# Animation & Graphics Stack

> Researched & version-verified 2026-06-08 against npm + Expo SDK 56 docs. Baseline:
> **Expo SDK 56, React Native 0.85, React 19.2, New Architecture (Fabric) only, Reanimated 4.**

RuneKeep is animation-first: tappable icons that spring-grow, particle effects (embers,
sparks, magical dust), and dynamic cards that float / drag / throw with physics. This is the
vetted library stack that delivers that at 60fps on the UI thread.

## Core stack — ADOPT (all run in plain Expo Go, no custom dev client)

| Library | Line | Responsibility |
|---|---|---|
| `react-native-reanimated` + `react-native-worklets` | 4.x / 0.x | Animation engine. `withSpring` (tap-grow), `withDecay` (card throw/momentum), `useDerivedValue` clock (idle float), UI-thread worklets. **Already in the template.** |
| `react-native-gesture-handler` | 3.x | All gestures. `Gesture.Tap/Pan/Pinch` → shared values. Drag/throw cards, tap icons. **Already in the template.** |
| `@shopify/react-native-skia` | 2.x | GPU 2D canvas. **`<Atlas>` + `useRSXformBuffer`** = thousands of particles in ONE draw call, animated in a worklet (zero JS-thread cost). SkSL runtime shaders for glow/shimmer/dissolve. Custom card frames & masks. **Add when building particles.** |
| `react-native-svg` | 15.x | Declarative, tappable, animatable vector icons & crisp responsive shapes. Animate `fill`/`stroke`/`d` via Reanimated `useAnimatedProps`. **Add when converting icon art to vectors.** |

**Install (when first used — do NOT pre-install):**
```bash
npx expo install @shopify/react-native-skia react-native-svg
```
Reanimated, worklets and gesture-handler ship with the SDK 56 default template — already present.

## Situational — add only when the use case appears
| Library | When |
|---|---|
| `lottie-react-native` (7.3.x) | Designer-authored After Effects cinematics (level-up burst, spell-cast flourish). Complements Skia; not a replacement. |
| `react-native-redash` (18.1.x) | `snapPoint` for magnetic card-to-slot snapping; vector helpers. Optional. |

## Rejected
- **moti** — stale (0.30.0, Reanimated 3), unresolved breakage on SDK 54+/Reanimated 4. Use Reanimated 4 directly.
- **expo-gl / expo-three / gl-react** — unneeded for 2D; weaker New-Arch story; gl-react RN bindings effectively legacy. Skia covers all GPU 2D needs. Revisit only for true 3D (e.g. 3D dice) — and prefer emerging `react-native-wgpu` then.

## Requirement → mechanism map
1. **Tap-to-grow icon** → SVG/Skia node + `Gesture.Tap()` + `withSpring` on a `scale` shared value.
2. **Particles (sparks/embers/dust)** → Skia `<Atlas>` + `useRSXformBuffer` in a worklet; SkSL shader for shimmer.
3. **Floating/draggable/throwable cards** → `Gesture.Pan()` → shared values; `withDecay` (throw) + `withSpring` (settle) + derived clock (idle drift); layered translate rates → parallax. **No physics engine needed** — Reanimated 4 is the physics stack.
4. **60fps GPU** → worklets on the UI thread + Skia GPU canvas. New Arch is mandatory & already on.
5. **Responsive** → see [adr/0001-responsive-design-stage.md](./adr/0001-responsive-design-stage.md).

## Gotchas
- Reanimated 4 **requires the separate `react-native-worklets` package** (already installed).
- New Architecture is non-optional on SDK 55+ — no "disable new arch" flag exists. This is what enables the perf.
- **Skia web** ships a ~2.9 MB CanvasKit WASM (async). Web is nice-to-have → lazy-load Skia screens; SVG/Lottie fallback for web.
- No remote JS debugging with Reanimated — use the Hermes / RN DevTools debugger.
- `GestureHandlerRootView` must wrap the app root (it does — see `src/app/_layout.tsx`) or gestures silently no-op.

## Animation-readiness conventions in this repo
- Every interactive art piece is wrapped in a small reusable pressable component that owns a
  `scale` shared value, so adding spring/particle behavior later is a one-line change — never
  bake static `<Image>`s directly into a screen if they're meant to react to touch.
- Layout is authored in a fixed **design coordinate space** and uniformly scaled (see the ADR),
  so an element's animated transform composes cleanly on top of its layout transform.
