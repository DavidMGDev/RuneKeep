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

/** Visibility radius in card steps (see slotOpacityAt). Slots are NEVER unmounted anymore (#78 —
 *  every slot always renders its tiny LOD thumb); this only bounds what is drawn. */
export const WINDOW_HALF = 3;

/** How many cards each side of center mount their FULL-RES layer (#78). It draws on the three
 *  center cards (see imageOpacityAt); the ±2 boundary mounts it at alpha 0 so it decodes before
 *  it can ever fade in. Everything further lives on its always-mounted thumb. */
export const IMG_MOUNT_HALF = 2;

/** Upward drag (design px) to fully open the center card to full-screen (live-drag distance). */
export const FS_OPEN_DIST = 150;

// Focus (fullscreen) targets — the SAME card slot grows in place to these, no separate object (#8c).
// #95 A: the handle chip is gone and the border dims with the veil, so the card can take nearly the
// whole design width and sit closer to true screen centre, clear of the gear arc at the bottom.
export const FS_CENTER_Y = 420; // y the focused card eases to
export const FS_FOCUS_SCALE = 1.79; // focused card spans the FULL design width (230 * 1.79 ≈ 412px)

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
// 120 (was 200, #174): the gear must sweep the WHOLE deck AND leave finger room in the SAME
// center->edge drag to over-scroll past the end and commit a category switch (~60px past the
// end arms it). 120 deck-sweep + ~60 over-scroll ≈ one comfortable half-screen drag, with ~10px
// of slack so a phone-case user who can't reach the very screen edge still passes the arm point.
export const GEAR_SWIPE_PX = 120; // finger px that cover first card -> last card on the gear

// --- Gear over-scroll → category switch (#174) ---
// Past a deck END, the gear grind stops feeding `rotation` (clamped) and instead pushes the WHOLE
// fan sideways (a sideways pull-to-refresh): the centered edge card slides toward its side of the
// screen. At OVERSCROLL_ARM design px of push the indicator is FULL + armed; releasing while armed
// switches the category (the fan never collapses). Dragging back below disarms.
export const OVERSCROLL_GAIN = 2.5; // design px of fan-push per finger-px past the deck end
export const OVERSCROLL_ARM = 150; // push (design px) that arms the switch — edge card ~85% to its side (206 -> ~356)
export const OVERSCROLL_MAX = 158; // hard cap (~90%, the 5% margin past the arm) — the fan stops moving here
// The whole hand's vertical SWAP travel (#174): on a switch the OLD deck slides DOWN off the bottom
// (fading only as it nears the edge) while the incoming deck rises + fades in centered — no
// fade-to-empty in place. Only ever non-zero mid-switch, so the normal scroll feel is untouched.
export const DECK_EXIT_DROP = 300; // design px the outgoing hand sinks (center card 631 -> 931, off-screen)
export const DECK_ENTER_RISE = 90; // design px the incoming hand rises from as it fades in
// Grind fan (#80, tuned on the LOD thumbs): much smaller cards packed much tighter — spacing
// ~83px vs ~97px card width ≈ 14% overlap, ~7 cards visible at once while skimming.
export const GRIND_TIGHTEN = 0.58; // fan step shrinks to 42% while grinding
export const GRIND_SHRINK = 0.55; // cards at 45% size while grinding
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
 * FULL-RES alpha by distance in card steps (#78 LOD): the three center cards draw sharp (full
 * within ±1), fading to the always-present thumb by ±2 — integer alphas at every rest detent (see
 * slotOpacityAt for why that matters). The caller damps this by (1 - grind): while the gear
 * grinds, the whole fan rides the tiny thumbs and no full-res texture composites at all.
 */
export function imageOpacityAt(distSteps: number): number {
  'worklet';
  return Math.min(1, Math.max(0, 2 - distSteps));
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
export function slotOpacityAt(distSteps: number, expandP: number = 1): number {
  'worklet';
  // #95 D: the COMPACT hand draws a much wider window (±6 → up to ~13 thumbs at 37% scale — all
  // tiny LOD textures, cheaper than two full cards) and narrows back to ±3 as the fan expands.
  // The cut stays at x.45 with the same 0.4 fade band so every integer distance is still exactly
  // 0 or 1 at rest (the saveLayerAlpha rule) at BOTH endpoints of the expand progress.
  const cut = 6.45 + (3.45 - 6.45) * expandP;
  return Math.min(1, Math.max(0, (cut - distSteps) / 0.4));
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
