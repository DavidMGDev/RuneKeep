/**
 * RuneKeep sound-effects engine (v0.2.11).
 *
 * Built on `react-native-audio-api` (Software Mansion's Web Audio graph) for true gain-envelope
 * fades (risers), per-play pitch variation (detune), low latency and polyphony. That library is a
 * NATIVE module — it is NOT in Expo Go, so the whole engine is GUARDED: the require + context
 * creation are wrapped in try/catch and every entry point no-ops when the native side is missing.
 * The app therefore still runs in Expo Go (silent); full audio ships in the prebuilt APK.
 *
 * Conventions (owner, #255):
 * - Every sound gets a subtle per-play pitch variation EXCEPT the OnLoseHP-1in10chance memes and the
 *   consistency sounds (app startup, sheet enter, level-up / rest complete) whose `cents` is 0.
 * - Risers play once (no loop), fading to silence over a short ramp at the visual climax — never cut.
 * - `playLoseHp()` rolls a 1/10 chance to fire a random meme from the folder (no pitch variation),
 *   otherwise the normal OnLoseHP-Default (with variation).
 */

import type { AudioBuffer, AudioContext, GainNode } from 'react-native-audio-api';

// ---------------------------------------------------------------------------
// Manifest — every sound id -> bundled asset (require returns a numeric module id,
// which `decodeAudioData` accepts directly, so no expo-asset round-trip is needed).
// ---------------------------------------------------------------------------

const FILES = {
  appStartup: require('../../assets/sounds/UI/AppStartup-OnFinishLoading.wav'),
  activateBeastform: require('../../assets/sounds/UI/OnActivateBeastform.wav'),
  disableBeastform: require('../../assets/sounds/UI/OnDisableBeastform.wav'),
  categoryToggleOff: require('../../assets/sounds/UI/OnCardCategoryToggleOff.wav'),
  categoryToggleOn: require('../../assets/sounds/UI/OnCardCategoryToggleOn.wav'),
  cardDeselect: require('../../assets/sounds/UI/OnCardDeselect(LevelUp-CharCreation).wav'),
  cardSelect: require('../../assets/sounds/UI/OnCardSelect(LevelUp-CharCreation).wav'),
  cardDisable: require('../../assets/sounds/UI/OnCardDisable.wav'),
  cardEnable: require('../../assets/sounds/UI/OnCardEnable.wav'),
  cardDragStart: require('../../assets/sounds/UI/OnCardDragStart(CardsFloatMenuUI).mp3'),
  cardDragEnd: require('../../assets/sounds/UI/OnCardDragEnd(CardsFloatMenuUI).mp3'),
  cardFullscreenEnter: require('../../assets/sounds/UI/OnCardFullScreenEnter.mp3'),
  cardFullscreenLeave: require('../../assets/sounds/UI/OnCardFullScreenLeave.mp3'),
  carouselScroll: require('../../assets/sounds/UI/OnCarouselScroll(NewCardInCenter).mp3'),
  transitionIconFilled: require('../../assets/sounds/UI/OnCarouselTransitionIconProgressFilled.wav'),
  transitionStart: require('../../assets/sounds/UI/OnCarouselTransitionStart.mp3'),
  sheetEnter: require('../../assets/sounds/UI/OnCharacterSheetEnter.wav'),
  customCardCreate: require('../../assets/sounds/UI/OnCustomCardCreate.mp3'),
  enterCardViewer: require('../../assets/sounds/UI/OnEnterCardViewer(mainMenu).wav'),
  floatMenuClose: require('../../assets/sounds/UI/OnFloatMenuClose.wav'),
  floatMenuHighlight: require('../../assets/sounds/UI/OnFloatMenuHighlight.wav'),
  floatMenuOpen: require('../../assets/sounds/UI/OnFloatMenuOpen.wav'),
  gainArmor: require('../../assets/sounds/UI/OnGainArmor.wav'),
  gainGoldenHp: require('../../assets/sounds/UI/OnGainGoldenHP.mp3'),
  gainHp: require('../../assets/sounds/UI/OnGainHP.wav'),
  gainHope: require('../../assets/sounds/UI/OnGainHope.wav'),
  gainStress: require('../../assets/sounds/UI/OnGainStress.wav'),
  buttonTap: require('../../assets/sounds/UI/OnGeneralButtonTap.wav'),
  panelClose: require('../../assets/sounds/UI/OnGeneralPanelClose.wav'),
  panelOpen: require('../../assets/sounds/UI/OnGeneralPanelOpen.wav'),
  gearScroll1: require('../../assets/sounds/UI/OnGoldenGearFastScroll1.mp3'),
  gearScroll2: require('../../assets/sounds/UI/OnGoldenGearFastScroll2.mp3'),
  levelUpComplete: require('../../assets/sounds/UI/OnLevelUpComplete.wav'),
  loseArmor: require('../../assets/sounds/UI/OnLoseArmor.wav'),
  loseHpDefault: require('../../assets/sounds/UI/OnLoseHP-Default.wav'),
  loseHope: require('../../assets/sounds/UI/OnLoseHope.wav'),
  loseStress: require('../../assets/sounds/UI/OnLoseStress.wav'),
  numpadPress: require('../../assets/sounds/UI/OnNumPadPress.wav'),
  placeToken: require('../../assets/sounds/UI/OnPlaceToken.wav'),
  restComplete: require('../../assets/sounds/UI/OnRestComplete.wav'),
  selectCharacter: require('../../assets/sounds/UI/OnSelectCharacters(mainMenu).wav'),
  tokenCopyColor: require('../../assets/sounds/UI/OnTokenCopyColor.wav'),
  tokenRemove: require('../../assets/sounds/UI/OnTokenRemove.wav'),
  riserArmor: require('../../assets/sounds/UI/RiserArmor.wav'),
  riserHp: require('../../assets/sounds/UI/RiserHP.wav'),
  riserHope: require('../../assets/sounds/UI/RiserHope.wav'),
  riserStress: require('../../assets/sounds/UI/RiserStress.wav'),
} as const;

export type SfxId = keyof typeof FILES;

// The OnLoseHP-1in10chance folder: a random one fires ~10% of the time a heart is lost. No pitch
// variation here — these are intentional gags whose character should be preserved.
const MEMES: number[] = [
  require('../../assets/sounds/UI/OnLoseHP-1in10chance/Amogus.mp3'),
  require('../../assets/sounds/UI/OnLoseHP-1in10chance/Fortnite1.mp3'),
  require('../../assets/sounds/UI/OnLoseHP-1in10chance/Fortnite2.mp3'),
  require('../../assets/sounds/UI/OnLoseHP-1in10chance/Gunshot.mp3'),
  require('../../assets/sounds/UI/OnLoseHP-1in10chance/Munch.mp3'),
  require('../../assets/sounds/UI/OnLoseHP-1in10chance/SingleSlap.mp3'),
  require('../../assets/sounds/UI/OnLoseHP-1in10chance/SniperShots.wav'),
  require('../../assets/sounds/UI/OnLoseHP-1in10chance/TF2PanHit.mp3'),
  require('../../assets/sounds/UI/OnLoseHP-1in10chance/TrolldgeBell.mp3'),
  require('../../assets/sounds/UI/OnLoseHP-1in10chance/VineBoom.mp3'),
  require('../../assets/sounds/UI/OnLoseHP-1in10chance/Yodeath.mp3'),
  require('../../assets/sounds/UI/OnLoseHP-1in10chance/bigexplosion.mp3'),
  require('../../assets/sounds/UI/OnLoseHP-1in10chance/boom.mp3'),
  require('../../assets/sounds/UI/OnLoseHP-1in10chance/china.mp3'),
  require('../../assets/sounds/UI/OnLoseHP-1in10chance/fart.mp3'),
  require('../../assets/sounds/UI/OnLoseHP-1in10chance/fartreverb.mp3'),
  require('../../assets/sounds/UI/OnLoseHP-1in10chance/flashbang.mp3'),
  require('../../assets/sounds/UI/OnLoseHP-1in10chance/hellskitchen.mp3'),
  require('../../assets/sounds/UI/OnLoseHP-1in10chance/mariooof.mp3'),
  require('../../assets/sounds/UI/OnLoseHP-1in10chance/minecraftglass.mp3'),
  require('../../assets/sounds/UI/OnLoseHP-1in10chance/minehurt.mp3'),
  require('../../assets/sounds/UI/OnLoseHP-1in10chance/ohshit.mp3'),
  require('../../assets/sounds/UI/OnLoseHP-1in10chance/pussy.mp3'),
  require('../../assets/sounds/UI/OnLoseHP-1in10chance/splat.mp3'),
  require('../../assets/sounds/UI/OnLoseHP-1in10chance/starwarscream.mp3'),
  require('../../assets/sounds/UI/OnLoseHP-1in10chance/suspense.mp3'),
  require('../../assets/sounds/UI/OnLoseHP-1in10chance/sword.mp3'),
  require('../../assets/sounds/UI/OnLoseHP-1in10chance/tacobell.mp3'),
];

// Per-id defaults: base volume (0..1) and pitch-variation spread in cents (±). 0 cents = no variation
// (consistency-critical sounds). Anything absent uses DEFAULT_VOL / DEFAULT_CENTS.
const DEFAULT_VOL = 0.9;
const DEFAULT_CENTS = 60;
const VOL: Partial<Record<SfxId, number>> = {
  carouselScroll: 0.45, floatMenuHighlight: 0.4, cardSelect: 0.5, cardDeselect: 0.5,
  numpadPress: 0.7, buttonTap: 0.7, panelOpen: 0.8, panelClose: 0.8, cardDragStart: 0.7,
  cardDragEnd: 0.7, gearScroll1: 0.7, gearScroll2: 0.7, placeToken: 0.8, tokenRemove: 0.85,
  tokenCopyColor: 0.8, categoryToggleOn: 0.8, categoryToggleOff: 0.8, cardEnable: 0.85, cardDisable: 0.85,
};
const CENTS: Partial<Record<SfxId, number>> = {
  appStartup: 0, sheetEnter: 0, levelUpComplete: 0, restComplete: 0,
  gainGoldenHp: 40, activateBeastform: 40, disableBeastform: 40, selectCharacter: 30, enterCardViewer: 30,
  panelOpen: 50, panelClose: 50, floatMenuOpen: 50, floatMenuClose: 50, transitionIconFilled: 50,
  tokenCopyColor: 130, carouselScroll: 90, gearScroll1: 90, gearScroll2: 90, placeToken: 90, tokenRemove: 90,
  floatMenuHighlight: 80, numpadPress: 80, cardDragStart: 80, cardDragEnd: 80, buttonTap: 60,
};

// ---------------------------------------------------------------------------
// Guarded native context
// ---------------------------------------------------------------------------

type AnyCtx = AudioContext;
let AudioContextCtor: (new () => AnyCtx) | null = null;
let ctx: AnyCtx | null = null;
let unavailable = false;

function getCtx(): AnyCtx | null {
  if (ctx) return ctx;
  if (unavailable) return null;
  try {
    if (!AudioContextCtor) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      AudioContextCtor = require('react-native-audio-api').AudioContext;
    }
    if (!AudioContextCtor) throw new Error('no AudioContext');
    ctx = new AudioContextCtor();
    void ctx.resume?.();
  } catch {
    unavailable = true;
    ctx = null;
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Buffer cache (decode once, reuse)
// ---------------------------------------------------------------------------

const buffers = new Map<number, AudioBuffer>();
const decoding = new Map<number, Promise<AudioBuffer | null>>();

function decode(src: number): Promise<AudioBuffer | null> {
  const c = getCtx();
  if (!c) return Promise.resolve(null);
  const cached = buffers.get(src);
  if (cached) return Promise.resolve(cached);
  const inflight = decoding.get(src);
  if (inflight) return inflight;
  const p = Promise.resolve()
    .then(() => c.decodeAudioData(src))
    .then((buf) => {
      buffers.set(src, buf);
      decoding.delete(src);
      return buf;
    })
    .catch(() => {
      decoding.delete(src);
      return null;
    });
  decoding.set(src, p);
  return p;
}

// ---------------------------------------------------------------------------
// Volume / mute (no settings UI yet — these back a future control)
// ---------------------------------------------------------------------------

let master = 1;
let muted = false;
export function setSfxVolume(v: number) {
  master = Math.max(0, Math.min(1, v));
}
export function setSfxMuted(m: boolean) {
  muted = m;
}

// random in [-1, 1)
function jitter(): number {
  return Math.random() * 2 - 1;
}

// ---------------------------------------------------------------------------
// Playback
// ---------------------------------------------------------------------------

export interface PlayOpts {
  /** 0..1 multiplier on the id's base volume. */
  volume?: number;
  /** Fixed pitch offset in cents (added before variation). Negative = lower. */
  cents?: number;
  /** Disable per-play pitch variation (default true). */
  vary?: boolean;
}

function fire(src: number, baseVol: number, varyCents: number, opts?: PlayOpts) {
  const c = getCtx();
  if (!c) return;
  void decode(src).then((buf) => {
    if (!buf) return;
    try {
      const node = c.createBufferSource({ pitchCorrection: false });
      node.buffer = buf;
      const vary = opts?.vary === false ? 0 : jitter() * varyCents;
      const cents = (opts?.cents ?? 0) + vary;
      if (cents) node.detune.value = cents;
      const gain: GainNode = c.createGain();
      gain.gain.value = (muted ? 0 : 1) * master * baseVol * (opts?.volume ?? 1);
      node.connect(gain);
      gain.connect(c.destination);
      node.onEnded = () => {
        try {
          node.disconnect();
          gain.disconnect();
        } catch {
          /* already torn down */
        }
      };
      node.start();
    } catch {
      /* play failed — stay silent */
    }
  });
}

/** Fire a one-shot SFX by id (with default per-play pitch variation). */
export function playSfx(id: SfxId, opts?: PlayOpts) {
  fire(FILES[id], VOL[id] ?? DEFAULT_VOL, CENTS[id] ?? DEFAULT_CENTS, opts);
}

/** Lose-HP impact: ~10% of the time a random meme (no variation), else OnLoseHP-Default (varied). */
export function playLoseHp(opts?: PlayOpts) {
  if (MEMES.length && Math.random() < 0.1) {
    const meme = MEMES[Math.floor(Math.random() * MEMES.length)];
    fire(meme, 1, 0, { ...opts, vary: false });
    return;
  }
  playSfx('loseHpDefault', opts);
}

// ---------------------------------------------------------------------------
// Risers — play once, then gain-ramp to silence at the climax (never an abrupt cut)
// ---------------------------------------------------------------------------

export interface RiserHandle {
  /** Fade the riser to silence over `fadeMs` (default 160) and stop it. Idempotent. */
  stop: (fadeMs?: number) => void;
}

const NOOP_RISER: RiserHandle = { stop: () => {} };

export interface RiserOpts {
  /** Pitch offset in cents (e.g. a much lower riser for the damage-panel hold). */
  cents?: number;
  volume?: number;
  fadeInMs?: number;
}

/**
 * Start a riser. Returns a handle whose `.stop(fadeMs)` fades it out — call it at the visual climax
 * (heart fill / detonation) so the riser tapers exactly when the impact lands. Requires the buffer
 * to be preloaded (see `preloadSfx`); if it is not ready yet it kicks off a decode and no-ops, so
 * the next interaction has it.
 */
export function playRiser(id: SfxId, opts?: RiserOpts): RiserHandle {
  const c = getCtx();
  if (!c) return NOOP_RISER;
  const buf = buffers.get(FILES[id]);
  if (!buf) {
    void decode(FILES[id]);
    return NOOP_RISER;
  }
  try {
    const node = c.createBufferSource({ pitchCorrection: false });
    node.buffer = buf;
    if (opts?.cents) node.detune.value = opts.cents;
    const gain: GainNode = c.createGain();
    const vol = (muted ? 0 : 1) * master * (opts?.volume ?? 0.7);
    const now = c.currentTime;
    const fadeIn = (opts?.fadeInMs ?? 40) / 1000;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(vol, now + fadeIn);
    node.connect(gain);
    gain.connect(c.destination);
    let stopped = false;
    node.onEnded = () => {
      try {
        node.disconnect();
        gain.disconnect();
      } catch {
        /* torn down */
      }
    };
    node.start();
    return {
      stop: (fadeMs = 160) => {
        if (stopped) return;
        stopped = true;
        try {
          const t = c.currentTime;
          const fade = Math.max(0.02, fadeMs / 1000);
          gain.gain.cancelScheduledValues(t);
          gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t);
          gain.gain.linearRampToValueAtTime(0.0001, t + fade);
          node.stop(t + fade + 0.02);
        } catch {
          /* ignore */
        }
      },
    };
  } catch {
    return NOOP_RISER;
  }
}

// ---------------------------------------------------------------------------
// Preload — decode the latency-sensitive sounds up front (risers + common impacts/taps)
// ---------------------------------------------------------------------------

const PRELOAD: SfxId[] = [
  'riserHp', 'riserArmor', 'riserHope', 'riserStress',
  'gainHp', 'loseHpDefault', 'gainGoldenHp', 'gainArmor', 'loseArmor', 'gainHope', 'loseHope', 'gainStress', 'loseStress',
  'buttonTap', 'carouselScroll', 'numpadPress', 'floatMenuHighlight', 'cardSelect', 'cardDeselect', 'panelOpen', 'panelClose',
];

let preloaded = false;
export function preloadSfx() {
  if (preloaded) return;
  preloaded = true;
  if (!getCtx()) return;
  for (const id of PRELOAD) void decode(FILES[id]);
}
