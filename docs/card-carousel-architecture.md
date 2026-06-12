# Gear-Coupled Card Carousel — Architecture

Blueprint for the gear + card-carousel feature (PR4-6). Target: Expo SDK 54, RN 0.81, Reanimated 4,
gesture-handler v2, react-native-svg, New Architecture, 60fps UI-thread worklets.

**Everything derives from two shared values** — `rotation` (radians, the carousel "engine") and
`expandProgress` (0 compact → 1 expanded) — plus a small UI-thread state machine.

## 1. Multi-layer gear (react-native-svg)
- Each part (U1 MainDash, U2 Outspike, U3 InnerSymbols, U4 InnerCardinal) = its own `<G>`, wrapped
  with `Animated.createAnimatedComponent(G)`, driven by one `rotation` through a per-part **ratio**
  (gear train: >1 faster, <0 counter-rotates). U1 bottom → U4 top in paint order.
- react-native-svg rotates `transform:[{rotate}]` around SVG origin (0,0), and Reanimated can't parse
  a string `rotate(a cx cy)` per frame. **Use the numeric translate→rotate→translate-back sandwich**
  centered on the gear center `(cx,cy)`:
  `transform:[{translateX:cx},{translateY:cy},{rotate:`${deg}deg`},{translateX:-cx},{translateY:-cy}]`
  via `useAnimatedProps`. Keep `spinTransform(rotation, ratio)` a module-scope worklet.
- Animated `<G>` transforms on New Arch are cheap (matrix update, no bridge). Skia only if morphing
  path `d` per frame or dozens of sub-shapes. Stay on react-native-svg here.

## 2. Arc carousel math
- Cards ride a circle radius `R`, center `O=(Ox, Oy)` far **below** screen; `theta=0` = screen-center.
- `theta_i = baseAngle + i*angleStep - rotation`; `x = Ox + R·sin(theta)`, `y = Oy - R·cos(theta)`,
  card tilt `= theta`. Centermost index `= round((rotation-baseAngle)/angleStep)`.
- **Key identity:** near center, on-screen center-to-center spacing `Δx ≈ R·angleStep`. So a finger
  delta `dx` → `dθ = dx/R`. **Larger R ⇒ flatter fan + heavier feel** (same spacing needs smaller
  angleStep; a swipe rotates less). Same `R` couples gear spin and card spacing → mechanical feel.
- "Hand, not max spread": pick neighbor overlap fraction `ov`, then `angleStep = W·(1-ov)/R`.
- **Overlap spec:** center↔neighbor ≤5%, the 2 flanking ≤10%. Edge gap uses scaled widths:
  `edgeGap = Δx - (Wa·sa + Wb·sb)/2`; `overlapFrac = max(0,-edgeGap)/min(Wa·sa,Wb·sb)`. Set
  `angleStep` from the center↔neighbor 5% cap (center's larger scale dominates → clear spacing).
- **Scale falloff (center largest, smooth rings):** Gaussian of angular distance `d=|theta|`:
  `scale = SCALE_MIN + (SCALE_MAX-SCALE_MIN)·exp(-d²/(2σ²))`, `σ≈1.7·angleStep` → 1 biggest, 3 big,
  5 medium, rest small from one curve. zIndex `= round(1000 - d/angleStep)`.

## 3. Snapping (finite, not infinite)
- Drag: `rotation = rotStart - translationX/R`, soft-clamped to `[MIN_ROT, MAX_ROT]` where
  `MIN_ROT=baseAngle`, `MAX_ROT=baseAngle+(N-1)*angleStep` (first/last card hard stops).
- Release: `withDecay({velocity:-velocityX/R, deceleration:0.998, clamp:[MIN,MAX], rubberBandEffect:true})`,
  then in its completion callback snap: `withSpring(nearest multiple of angleStep, {damping:18,stiffness:140})`.

## 4. Virtualization (finite but unbounded card count)
- Mount only a ±`WINDOW_HALF` (=3) card window around center; key by **absolute card index** (stable identity,
  no remount on scroll). Each card still self-lays-out via `useAnimatedStyle` reading `rotation` at 60fps.
- Drive the window from a `useDerivedValue` that computes the integer center and `runOnJS(setWindow)`
  **only when the center index changes** (once per crossed detent) → minimal JS churn.

## 5. Compact ↔ expanded (one `expandProgress`)
- Interpolate card `angleStep` (COMPACT_STEP→angleStep), a downward `COMPACT_DROP` (bundled low, partly
  under the bottom edge), and scale (COMPACT_SCALE→1) off `expandProgress`. Expanded centers the middle 3
  cards fully on-screen with the gear peeking below.
- **No trait fly-off.** Expanding instead fades the whole sheet behind an **`ExpandVeil`** (dark overlay,
  `opacity = expandProgress·0.62`); the gear + cards stay bright. The veil is a `Pressable`: inert when
  compact, but when expanded it both blocks input on the dimmed sheet (so disabled controls aren't
  tappable) and dismisses the hand on tap.

## 6. State model (3 states, NO timers — see docs/ui-fix-brief §2)
States: `compact` → `expanded` → `fullscreen`, held on `machineState` (a shared value). There is **no**
`held`/`window`/`locked` state, **no** `timerGen`, and **no** 1-second auto-collapse — removing your
finger leaves the hand where it is. JS actions on the carousel context drive the shared values directly:
`expand` / `collapse` / `openCardAt(i)` / `closeFullscreen` / `openRandomAbility` (the last wired to the
octagon origin badges, D4). `focusIndex` (shared) selects which card the fullscreen overlay renders.
- Discoverability: a gold **swipe-up chevron** (`ExpandIndicator`) bobs above the compact hand and fades
  out as it opens; its idle bob is gated off under OS "reduce motion".

## 7. Gestures (one pan + per-card taps)
- **One `Gesture.Pan`** on a full-sheet **`box-none`** container scrolls the hand 1:1 in any state
  (`rotation = startRot − translationX/PAN_R`, decay + snap on release). Vertical drags transition state:
  from compact an up-drag > `EXPAND_TRIGGER` fans the hand; from expanded an up-drag > `FS_UP_TRIGGER`
  (~26px) **or** `velocityY < −FS_UP_VELOCITY` flies the center card full-screen, and a down-drag >
  `COLLAPSE_TRIGGER` bundles it back. At most one transition per gesture (`transitioned` guard).
- **Per-card tap**: each card slot owns its own `Gesture.Tap` (nested under the pan — the
  scroll-view-with-buttons pattern). Tapping a compact card expands; tapping an expanded card flies
  **that** card full-screen. The `box-none` container lets these child taps through while the pan still
  recognizes drags that start on a card, and keeps the compact-state sheet controls above it tappable.
- **Fullscreen overlay** (`fullscreenProgress`, zIndex 5000, image mounted only while open) returns to the
  hand on swipe-down, tap, or **device shake** (`expo-sensors` accelerometer, magnitude > ~1.8g); it has a
  visible gold close handle and an accessible close action. Thresholds live in `carousel-geometry.ts`.

## 8. Layering (gear < cards < border < fullscreen)
`zIndex` sibling layers inside the scaled DesignStage (gear and cards are coupled by the shared value, NOT
nested): body/traits `0` < `ExpandVeil` `0` (after body, dims it) < gear `0` (after veil, stays bright) <
card hand (CardSlot zIndex ~1000) < **`SheetFrame` gold border `2000`** (so compact cards tuck under the
frame, C5; the name is raised to `2100` to clear the top finial, C2) < fullscreen overlay `5000`.

## Reanimated-4 / SDK-54 gotchas
- Do NOT add the reanimated/worklets Babel plugin manually — `babel-preset-expo` injects it (double-add throws).
- Per-frame math (`cardLayout`, `cardScale`, `spinTransform`) = module-scope worklets reading shared values.
- Ensure `MIN_ROT < MAX_ROT`; finalize decay with a `withSpring` snap (avoids endless-update edge case).

_Sources: react-native-reanimated, react-native-gesture-handler, react-native-svg official docs; expo-fyi
SDK54+Reanimated4; community issues on SVG `<G>` rotation (reanimated #2295/#1398, rn-svg #1823)._

---

## 9. CURRENT STATE (2026-06, supersedes stale details above — issues #41→#80)

The sections above describe the original design; the following is the implemented truth after the
perf + interaction passes. Where they disagree, **this section wins**.

### Rendering: the LOD system (#78)
- Every card ships at two LODs (`card-data.ts`): `source` = 750×1050 **WebP q86** (~90KB) and
  `thumb` = 188×263 **WebP q70** (~9KB, 16× fewer pixels; regenerate with PIL `resize(LANCZOS)`).
- **Every deck slot is mounted forever** on its `CardThumb` — no virtualization, no unmount pops.
  A full 18-card deck of thumbs composites for less than two full cards.
- The full-res `Card` layer mounts within ±`IMG_MOUNT_HALF`(2) of center and **draws on the three
  center cards** (`imageOpacityAt = clamp(2−d)`, integer alphas at rest), cross-fading over the
  thumb (`transition={150}`). It is damped by `(1 − grindProgress)` — a gear grind composites
  ONLY thumbs. Center tracking (derived value → `setCenter`) freezes while grinding.
- Release model: NO decay — `withSpring(snapRot(rot + cappedV·FLING_TIME), {velocity})` (#30 A).

### Perf rules learned on-device (A54)
1. Never put `renderToHardwareTextureAndroid` / `shouldRasterizeIOS` / Android `elevation` on a
   view whose opacity/scale animates per frame (texture invalidation, #41).
2. Never put a **fractional opacity on a multi-child container** (Android `saveLayerAlpha` per
   frame — the gear container and resting card slots both hit this, #54). Translucency goes on
   single-image leaves; rest-state alphas must be integers (`slotOpacityAt`).
3. Count **textures drawn per frame**, not views mounted (#48): big sources decode cheap as WebP
   and tiny as thumbs; what kills the GPU is compositing many full-res layers.

### The gear control (#62→#80)
- Two rings only (U2 + U3), static pose, per-image alpha 0.26; the INNER ring brightens to full
  opacity as the hand expands — it is the control. Rendered INSIDE the carousel container:
  zIndex 0 under the cards normally, 2500 in fullscreen (above the dim, under the focused card).
- A transparent pad (`PAD_X/Y/W/H`) feeds the container pan. Drag = grind: adaptive sensitivity
  `gearPanR = GEAR_SWIPE_PX(200)/maxRotation(count)` → HALF A SCREEN sweeps the whole deck;
  the fan tightens (`GRIND_TIGHTEN` 0.58) and shrinks (`GRIND_SHRINK` 0.55) → ~7 thumbs visible.
  Tap = fullscreen → close card + collapse; expanded → collapse; compact → expand. Tap logic
  lives in BOTH `onEnd` (jittery activated taps) and `onFinalize(!success)` (clean taps never
  activate a `minDistance` pan).
- Compact hand: `COMPACT_DROP` 201 → the center card's bottom edge sits exactly on the design
  bottom (892). Any horizontal scroll while compact expands the hand mid-gesture.
- **Shake-to-close and ExpandIndicator are REMOVED**; fullscreen focus = the SAME CardSlot
  growing in place over the FocusOverlay dim (no separate overlay object).
- **Haptics: removed app-wide** per owner (#81) — `src/lib/haptics.ts` kept for the future.
