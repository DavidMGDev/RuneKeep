import { CARD_ASPECT } from './card-data';

/**
 * Arc-carousel geometry, in the sheet's 412x892 design space. Cards ride a circle centered far below
 * the screen; the gear (visual) and cards share the same `rotation` angle. See
 * docs/card-carousel-architecture.md. Helpers are worklets so the per-frame layout runs on the UI
 * thread; they're plain enough to also unit-test on JS.
 */
export const OX = 206; // circle center X (screen center)
// Big radius + low center => a nearly-flat fan whose expanded center card sits at y = OY - R = 765,
// i.e. low on the screen (the compact cards' top edge), so expanding grows the cards in place rather
// than flying them up. Compact then drops a little further toward the bottom edge.
export const R = 900;
// Expanded center card sits at y = OY - R = 631 → the full card (center 3) is on-screen, with the
// gear peeking below it. Compact then drops well below toward/under the bottom edge.
export const OY = 1531;

/** Resting rotation that centers the middle of a deck (a balanced fan, not a lopsided end).
 *  Plain JS (called in React render, not in a worklet) — do NOT mark 'worklet'. */
export function middleRotation(count: number): number {
  return (Math.max(0, count - 1) / 2) * ANGLE_STEP;
}

export const CARD_W = 230; // centermost expanded card width (~56% of the 412 design); ~20% smaller
export const CARD_H = CARD_W / CARD_ASPECT; // 5:7

// Wider step so the expanded fan spreads out: the center card now overlaps each neighbor ~10% instead
// of ~45%, which kills the abrupt z-restack "pop" when a neighbor becomes the new center (#8a).
export const ANGLE_STEP = 0.22; // radians between adjacent cards
export const COMPACT_STEP = 0.05; // a tight little hand of cards when compact
export const COMPACT_SCALE = 0.37; // compact hand ~15% bigger (#62 B)
// The CENTER card's bottom edge sits EXACTLY on the design bottom (#67 B): center y = OY - R +
// DROP, plus half the scaled card height = 892. (631 + 201 + 322*0.37/2 ≈ 892.)
export const COMPACT_DROP = 201;

export const SCALE_MAX = 1.0; // centermost card
export const SCALE_MIN = 0.55; // far cards
export const SIGMA = 1.5 * ANGLE_STEP; // falloff width

/** Finger px -> rotation coupling (≈ R*stageScale so the center card tracks the finger ~1:1). */
export const PAN_R = 540;

/** How many cards each side of center stay MOUNTED (virtualization window). Slots past
 *  IMG_MOUNT_HALF carry no Image at all — just the flat CardBack — so the wider window costs
 *  almost nothing and the hand reads as a fan of white cards (#54 B). */
export const WINDOW_HALF = 3;

/** How many cards each side of center mount their real Image. ALL mounted slots carry one now
 *  (#67 A — WebP decodes are cheap): the ±3 boundary slot decodes at alpha 0, ready before it can
 *  ever fade in, so a fast scroll shows cards loading in instead of a white-back pop. */
export const IMG_MOUNT_HALF = 3;

/** Upward drag (design px) to fully open the center card to full-screen (live-drag distance). */
export const FS_OPEN_DIST = 150;

// Focus (fullscreen) targets — the SAME card slot grows in place to these, no separate object (#8c).
export const FS_CENTER_Y = 396; // y the focused card eases to (≈ screen centre, room for the handle)
export const FS_FOCUS_SCALE = 1.55; // absolute scale of the focused card (230 * 1.55 ≈ 356px wide)

// Fling model (issue #30 A): NO free decay. A release predicts its landing detent from the capped
// velocity and springs there carrying that velocity — the spring overshoots a touch (intentional,
// bounded) and ALWAYS converges onto a detent, so an over-swipe at a deck end can never leave the
// hand floating off-center and then teleport-snap back.
export const MAX_FLING_VEL = 6; // rad/s ceiling on the release velocity
export const FLING_TIME = 0.18; // s — how far a fling "throws" (target = rot + v * FLING_TIME)
export const OVERSCROLL_RESIST = 0.35; // drag past a deck end moves at 35% (soft rubber while dragging)

// --- Inner-gear grind scroll (#62 D, #67 C) ---
// Dragging the inner gear is the power-scroll: ONE full swipe sweeps the whole deck (adaptive —
// gearPanR = GEAR_SWIPE_PX / maxRotation(count)), a haptic ticks at every detent crossed, and the
// fan keeps its tightened spacing while the cards shrink so more of the deck is visible at once.
// 260: the grind starts at the SCREEN CENTER, so only about half a screen of travel exists — one
// half-screen sweep must still reach (nearly) the far end of the deck (#70 A).
export const GEAR_SWIPE_PX = 260; // finger px that cover first card -> last card on the gear
// 0.44: with the cards 30% smaller they overlapped too much at 0.55 — ~25% more separation (#70 A).
export const GRIND_TIGHTEN = 0.44; // fan step shrinks to 56% while grinding
export const GRIND_SHRINK = 0.3; // cards 30% smaller while grinding (#67 C)
// The touchable pad over the inner gear's visible arc at the bottom edge, in design px.
export const PAD_X = 126;
export const PAD_Y = 812;
export const PAD_W = 160;
export const PAD_H = 80;

// Gesture thresholds (design px / velocity). Tuned LOW per the brief — a light flick should work.
export const EXPAND_TRIGGER = 16; // up-drag from compact to fan the hand
export const FS_UP_TRIGGER = 26; // up-drag from expanded to fly the center card full-screen
export const FS_UP_VELOCITY = 700; // …or an upward flick faster than this (px/s)
export const COLLAPSE_TRIGGER = 38; // down-drag from expanded to bundle the hand back

// Shared spring configs so the carousel and the fullscreen overlay move cohesively.
export const EXPAND_SPRING = { damping: 16, stiffness: 130, mass: 0.8 };
export const SNAP_SPRING = { damping: 18, stiffness: 140, mass: 0.7 };
export const FS_SPRING = { damping: 18, stiffness: 120, mass: 0.9 };

/**
 * Real-image opacity by distance from center, in CARD STEPS (state-independent): full within ±1,
 * gone by ±2. Beyond that a slot shows only its cheap blank card-back — so at most ~3 full card
 * textures are ever composited, whatever the deck position or expand state. This is the #48 B perf
 * fix: 5 mounted full-alpha images overdrawing each other tanked the A54 to ~10fps the moment the
 * 3rd card centered (5 slots mounted), and kept it there in compact where the falloff left ALL
 * slots at full alpha stacked on top of each other.
 */
/**
 * Real-art alpha by distance in card steps (#67 A): five cards drawn at rest (full through ±2,
 * gone by ±3 — integer alphas at every rest detent, see slotOpacityAt for why that matters), and
 * `grind` (0..1, the inner-gear scroll) extends the fade so all SEVEN mounted slots draw while
 * skimming. The mounted-but-invisible boundary slot is where decode happens.
 */
export function imageOpacityAt(distSteps: number, grind: number = 0): number {
  'worklet';
  return Math.min(1, Math.max(0, 3 + grind - distSteps));
}

/**
 * WHOLE-slot opacity by distance in card steps: solid until just before the mount-window edge,
 * gone right before the slot unmounts (center re-rounds at ±(WINDOW_HALF + 0.5)). Two perf rules
 * live here (#54 A): the backs stay SOLID so the hand visibly fades into white cards instead of
 * into nothing, and at rest every distance is an integer → every slot alpha is exactly 0 or 1.
 * A *fractional* alpha on a card subtree (image + back overlap) forces Android into a
 * saveLayerAlpha — an offscreen buffer re-composited per frame — and two such slots resting at
 * 0.58 alpha mid-deck were the "third card" fps cliff (deck ends never mount them).
 */
export function slotOpacityAt(distSteps: number): number {
  'worklet';
  return Math.min(1, Math.max(0, (3.45 - distSteps) / 0.4));
}

/** Smooth center-out scale: centermost largest, tapering to SCALE_MIN. */
export function cardScaleAt(theta: number): number {
  'worklet';
  const d = Math.abs(theta);
  const bell = Math.exp(-(d * d) / (2 * SIGMA * SIGMA));
  return SCALE_MIN + (SCALE_MAX - SCALE_MIN) * bell;
}

/** Max rotation = last card centered (finite: first/last card, never infinite). */
export function maxRotation(count: number): number {
  'worklet';
  return Math.max(0, count - 1) * ANGLE_STEP;
}

export function clampRot(value: number, count: number): number {
  'worklet';
  const max = maxRotation(count);
  return Math.min(max, Math.max(0, value));
}

/** Snap to the nearest card detent, clamped to the deck. */
export function snapRot(value: number, count: number): number {
  'worklet';
  return clampRot(Math.round(value / ANGLE_STEP) * ANGLE_STEP, count);
}
