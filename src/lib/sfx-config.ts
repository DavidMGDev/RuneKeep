/**
 * RuneKeep SFX tuning — the ONE place to fine-tune sound by ear (#258).
 *
 * Everything here is a plain number you can tweak and re-test in Expo Go without touching engine
 * logic. Three groups:
 *   1. SFX_VOLUME   — per-sound loudness multiplier (1 = the normalized -16 LUFS level; >1 boosts).
 *   2. SFX_PITCH_CENTS — per-play random pitch spread in cents (±). 0 = no variation (keep it for
 *      consistency sounds like the app-startup chime). 100 cents ≈ a semitone.
 *   3. STAT_SOUND_DELAY_MS — when the HP/Stress/Hope/Armor impact sound fires, in ms AFTER the
 *      hold completes. Lower = earlier. These are SOUND-only; the icon's visual animation is
 *      unchanged. Tune until the bang lands exactly on the burst/fill.
 *
 * See src/lib/sfx.ts for the engine + the id list (SfxId).
 */
import type { SfxId } from './sfx';

export const DEFAULT_VOLUME = 0.9;
export const DEFAULT_CENTS = 60;

/** Per-sound base volume (absent = DEFAULT_VOLUME). >1 boosts a perceptually-quiet sound. */
export const SFX_VOLUME: Partial<Record<SfxId, number>> = {
  // carousel / cards
  carouselScroll: 0.36, // #258: was 0.45, -20% (a touch too loud)
  cardFullscreenEnter: 0.9,
  transitionIconFilled: 1.0, // #258: +10% — also reused for fullscreen-LEAVE (replaces the old ugly leave file)
  transitionStart: 0.8,
  cardDragStart: 0.7,
  cardDragEnd: 0.7,
  gearScroll1: 0.7,
  gearScroll2: 0.7,
  // float menu
  floatMenuOpen: 0.9, // owner: fine
  floatMenuClose: 0.63, // #258: -30% (was incredibly loud)
  floatMenuHighlight: 0.1, // #258r2: still too noisy at 0.2 — halve again
  // cards mgmt / tokens / keypad
  cardSelect: 0.5,
  cardDeselect: 0.5,
  cardEnable: 0.51, // #258r2: equip/enable was way too loud, -40%
  cardDisable: 0.85,
  categoryToggleOn: 0.8,
  categoryToggleOff: 0.8,
  numpadPress: 0.7,
  buttonTap: 0.7,
  panelOpen: 0.8,
  panelClose: 0.8,
  placeToken: 0.8,
  tokenRemove: 0.85,
  tokenCopyColor: 0.8, // owner: decent, leave it
  customCardCreate: 0.675, // #258: -25% (way too loud)
  // nav
  enterCardViewer: 1.4, // #258: boost (entering the archive was too low)
  selectCharacter: 0.9,
  sheetEnter: 0.9,
  // stat impacts
  loseStress: 1.5, // #258: boost (a very low sound, barely audible)
  loseHope: 0.63, // #258r2: too loud, -30%
};

/** Per-play pitch-variation spread, in cents (±). Absent = DEFAULT_CENTS. 0 = no variation. */
export const SFX_PITCH_CENTS: Partial<Record<SfxId, number>> = {
  appStartup: 0,
  sheetEnter: 0,
  levelUpComplete: 0,
  restComplete: 0,
  gainGoldenHp: 40,
  activateBeastform: 40,
  disableBeastform: 40,
  selectCharacter: 30,
  enterCardViewer: 30,
  panelOpen: 50,
  panelClose: 50,
  floatMenuOpen: 50,
  floatMenuClose: 50,
  transitionIconFilled: 50,
  tokenCopyColor: 130, // playful (color)
  carouselScroll: 90,
  gearScroll1: 90,
  gearScroll2: 90,
  placeToken: 90,
  tokenRemove: 90,
  floatMenuHighlight: 80,
  numpadPress: 80,
  cardDragStart: 80,
  cardDragEnd: 80,
  buttonTap: 60,
};

export type StatKey = 'hp' | 'armor' | 'stress' | 'hope';

/**
 * Delay (ms after the hold completes) before the gain/lose impact sound fires. Lower = earlier.
 * `gain` = filling a slot (up), `lose` = depleting one (down), `goldGain` = filling a GOLDEN heart
 * (hp only). Tuned by ear (#258) so the bang lands ON the burst/fill. SOUND-only — visual unchanged.
 */
export const STAT_SOUND_DELAY_MS: Record<StatKey, { gain: number; lose: number; goldGain?: number }> = {
  hp: { gain: 260, lose: 32, goldGain: 84 }, // #258r2: fill -250ms, golden fill -400ms
  armor: { gain: 41, lose: 117 }, // #258r2: fill -250ms more
  stress: { gain: 21, lose: 0 },
  hope: { gain: 114, lose: 21 },
};

/** Per-stat RISER volume (the tension build during a hold). Stress/Hope risers were too loud (#258r2). */
export const RISER_VOLUME: Record<StatKey, number> = {
  hp: 0.7,
  armor: 0.7,
  stress: 0.4,
  hope: 0.4,
};

/** How long (ms) the player must HOLD before a riser starts — a buffer so a normal tap / double-tap
 *  never blips the riser (#258r2). Keep under the double-tap window (~320ms). */
export const RISER_START_DELAY_MS = 280;

/** Golden-gear "swoosh" trigger: minimum per-frame finger travel (px, design space) for a swipe to
 *  count as FAST. The gear plays its swoosh only on a FAST swipe that REVERSES direction — so casual
 *  scrubbing is silent and only deliberate fast flicks swoosh. Raise = less sensitive. */
export const GEAR_FAST_FLIP_PX = 18;

/** Volume multiplier (on the carousel-scroll base) for the per-detent pip heard WHILE grinding the
 *  golden gear (#258r2). The gear scrolls fast, so it's quieter than the normal hand scroll. */
export const GEAR_SCROLL_PIP_VOLUME = 0.55;

/** Volume multiplier for the quieter gear sound used when flipping multi-page card faces (#258). */
export const PAGE_FLIP_VOLUME = 0.35;
