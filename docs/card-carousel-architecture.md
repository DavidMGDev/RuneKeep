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
- Mount only a ±4-card window (+buffer) around center; key by **absolute card index** (stable identity,
  no remount on scroll). Each card still self-lays-out via `useAnimatedStyle` reading `rotation` at 60fps.
- Drive the window from a `useDerivedValue` that computes the integer center and `runOnJS(setWindow)`
  **only when the center index changes** (once per crossed detent) → minimal JS churn.

## 5. Compact ↔ expanded (one `expandProgress`)
- Interpolate card `angleStep` (COMPACT_STEP→angleStep), radius, a downward `COMPACT_DROP` (bundled near
  gear, almost hidden, above trait banners), and scale (COMPACT_SCALE→1) off `expandProgress`.
- Trait banners exit: 3 left / 3 right via `translateX = interpolate(expandProgress,[0,1],[0, dir*(W·0.7+stagger)])`,
  opacity fades by 0.6. Same `expandProgress` → banners + cards frame-locked.

## 6. Expand state machine (tap-lock vs hold+1s-window)
States: `compact`, `expandedHeld` (finger down+scrolling), `expandedWindow` (released, 1s countdown),
`expandedLocked` (tapped). Transitions: tap on compact → locked; pan activate → held; pan end → window
(arm 1s timer); new pan within 1s → held (cancel timer); tap → locked; 1s elapse → compact; tap when
locked → compact. **Cancelable timer:** `setTimeout` on JS but guarded by a UI-thread `timerGen`
counter bumped on every new gesture (stale timer no-ops). Keep `machineState/locked/timerGen` as shared
values (synchronous with gesture activation); only the wall-clock wait is on JS.
- Indicator (subtle): inner gears keep a slow idle spin while expanded (separate `idleSpin` value, additive
  into U3/U4), and/or a small dot whose opacity tracks `expandProgress`.

## 7. Swipe-up-fullscreen vs horizontal-scroll
- Two axis-locked pans under `Gesture.Race`: horizontal carousel pan `.activeOffsetX([-12,12]).failOffsetY([-22,22])`;
  vertical fullscreen pan (center card only) `.activeOffsetY([-14,14]).failOffsetX([-16,16])`. Initial
  dominant axis wins; loser cancels. Compose with the tap via `Gesture.Exclusive(tap, Race(vPan,hPan))`.
- Trigger: up-translation > ~18% screen height OR velocityY > 900 → `fullscreenProgress→1` (center card flies
  to screen center, full-screen); swipe down → 0. Context-sensitive threshold: harder while `expandedHeld`
  (~28%), easier when `expandedWindow`/`expandedLocked` (~14%, swipe-up becomes the primary action). Only the
  center card mounts `vPan`.

## 8. Layering (gear < border < cards)
Five explicit `zIndex` sibling layers inside the scaled DesignStage (gear and cards are coupled by the shared
value, NOT nested): gear `0` (opacity ~0.35, `overflow:visible` so its submerged 70% isn't clipped) <
trait banners `10` < ornate border SVG `20` (`pointerEvents:none`) < cards `30` (wrapped in the
`GestureDetector`) < fullscreen overlay `40`. Express screen-fraction thresholds in stage units (÷ stageScale).

## Reanimated-4 / SDK-54 gotchas
- Do NOT add the reanimated/worklets Babel plugin manually — `babel-preset-expo` injects it (double-add throws).
- Per-frame math (`cardLayout`, `cardScale`, `spinTransform`) = module-scope worklets reading shared values.
- Ensure `MIN_ROT < MAX_ROT`; finalize decay with a `withSpring` snap (avoids endless-update edge case).

_Sources: react-native-reanimated, react-native-gesture-handler, react-native-svg official docs; expo-fyi
SDK54+Reanimated4; community issues on SVG `<G>` rotation (reanimated #2295/#1398, rn-svg #1823)._
