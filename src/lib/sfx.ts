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

import { Platform } from 'react-native';
import type { AudioBuffer, AudioContext, GainNode } from 'react-native-audio-api';

import { DEFAULT_CENTS, DEFAULT_VOLUME, SFX_PITCH_CENTS, SFX_VOLUME } from './sfx-config';

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

// Per-id base volume + pitch-variation spread live in sfx-config.ts (the owner's tuning file).

// ---------------------------------------------------------------------------
// Guarded native context
// ---------------------------------------------------------------------------

type AnyCtx = AudioContext;
type CtorOpts = { sampleRate?: number } | undefined;
let AudioContextCtor: (new (opts?: CtorOpts) => AnyCtx) | null = null;
let ctx: AnyCtx | null = null;
let unavailable = false;

/**
 * What to build the context with, per attempt (v0.27.2).
 *
 * The first attempt takes the device's own preferred rate, which is what the library does when asked
 * for nothing and is right almost everywhere. A retry asks for a standard rate instead: if the reason
 * the output stream would not open is the rate the device claims to prefer, repeating the request
 * unchanged only repeats the failure.
 */
const CTX_ATTEMPTS: CtorOpts[] = [undefined, { sampleRate: 48000 }, { sampleRate: 44100 }, undefined];

function getCtx(): AnyCtx | null {
  if (ctx) {
    wake(ctx);
    return ctx;
  }
  if (unavailable) return null;
  try {
    if (!AudioContextCtor) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      AudioContextCtor = require('react-native-audio-api').AudioContext;
    }
    if (!AudioContextCtor) throw new Error('no AudioContext');
    ctx = new AudioContextCtor(CTX_ATTEMPTS[Math.min(rebuilds, CTX_ATTEMPTS.length - 1)]);
    wake(ctx);
    armFirstGesture();
    // Dev only, stripped from release builds: the browser check in scripts/web-probe.mjs needs a way
    // to see whether the context actually left the suspended state, which is invisible otherwise.
    if (__DEV__ && Platform.OS === 'web' && typeof window !== 'undefined') (window as unknown as { __rkAudio?: unknown }).__rkAudio = ctx;
  } catch {
    unavailable = true;
    ctx = null;
  }
  return ctx;
}

/**
 * v0.25.0: a browser will not let a page make noise until the user has interacted with it.
 *
 * An AudioContext created before that starts SUSPENDED, and every later `start()` is a silent no-op
 * rather than an error, which is why the web build had no sound at all and nothing in the console to
 * say so. Resuming once at creation, as this used to, is exactly the moment it cannot work: the app
 * warms the context on load, long before the first tap.
 *
 * So resume on two occasions instead. Every play attempt, since a play usually IS the gesture, and
 * once on the first pointer or key event, so the context is awake before the first sound is asked for.
 * Native contexts are never suspended, so both are harmless there.
 */
function stateOf(c: AnyCtx): string {
  return (c as { state?: string }).state ?? 'unknown';
}

/**
 * v0.27.2: a context that will not leave `suspended` is REBUILT.
 *
 * On Android the output stream is opened ONCE, when the context is constructed. If that fails, and it
 * can, because the app warms its audio the instant the menu appears and the device may not be ready to
 * hand out an exclusive stream that early, then the player has no stream and every later resume fails
 * silently. The context sits in `suspended` for the rest of the session and no sound is ever heard,
 * while decoding carries on working perfectly, which is exactly the shape of what was reported: the
 * engine says suspended, nothing failed, and nothing plays.
 *
 * There is no recovery through that context, because nothing re-opens the stream. A new context is the
 * recovery. Decoded buffers belong to the old one, so they go with it.
 *
 * Bounded, because a device that genuinely cannot give this app an audio stream should be left alone
 * rather than asked forever.
 */
const MAX_REBUILDS = 3;
let rebuilds = 0;
let rebuilding = false;

function rebuildCtx(): void {
  if (rebuilding || rebuilds >= MAX_REBUILDS) return;
  rebuilding = true;
  rebuilds += 1;
  const old = ctx;
  ctx = null;
  buffers.clear(); // an AudioBuffer belongs to the context that decoded it
  decoding.clear();
  failed.clear();
  try {
    void old?.close?.();
  } catch {
    // Closing a context that never opened is not interesting.
  }
  // A beat before rebuilding: the reason the first attempt failed is usually that something else was
  // still holding the device, and asking again in the same tick asks the same question.
  setTimeout(() => {
    rebuilding = false;
    // `getCtx()` wakes the fresh context itself. Resuming it again here was a guaranteed second
    // start in the same tick, which is precisely what breaks the stream on Android.
    getCtx();
  }, 400);
}

/**
 * The context we have already asked to start, and what it answered (v0.27.3).
 *
 * On Android the context is BORN suspended and one `resume()` opens the output stream. `state` is a
 * live probe of that stream, so it still reads suspended while the stream is starting -- and v0.25.0
 * changed `wake` from "resume once at creation" to "resume whenever state is suspended", on the
 * stated premise that native contexts are never suspended. They are. So every sound asked the stream
 * to start again, AAudio rejects a start on an already started stream, and the library stores that
 * rejection: its render callback then emits silence and `state` is pinned at suspended for good.
 * That is the exact readout the owner sent, restarts and all: the restarts were the app fighting
 * itself.
 */
let resumed: AnyCtx | null = null;
let lastResume = '';

function wake(c: AnyCtx): void {
  try {
    if (stateOf(c) !== 'suspended') return;
    if (Platform.OS !== 'web') {
      // Ask once, and believe the answer rather than re-reading `state`.
      if (resumed === c) return;
      resumed = c;
      const started = c.resume?.() as Promise<boolean> | undefined;
      if (!started?.then) return;
      void started
        .then((ok) => {
          lastResume = ok === false ? 'refused' : 'ok';
          if (ok === false && ctx === c) rebuildCtx();
        })
        .catch(() => {
          lastResume = 'threw';
          if (ctx === c) rebuildCtx();
        });
      return;
    }
    // Web: a browser context legitimately suspends again (tab hidden, autoplay policy), so resuming
    // per sound is correct there and resume() resolves with nothing.
    const p = c.resume?.() as Promise<unknown> | undefined;
    if (!p?.then) return;
    void p
      .then(() => {
        lastResume = 'ok';
        if (ctx === c && stateOf(c) === 'suspended') rebuildCtx();
      })
      .catch(() => {
        lastResume = 'threw';
        if (ctx === c) rebuildCtx();
      });
  } catch {
    // A context that refuses to resume is not worth breaking a tap over.
  }
}

let gestureArmed = false;
function armFirstGesture(): void {
  if (gestureArmed || Platform.OS !== 'web' || typeof document === 'undefined') return;
  gestureArmed = true;
  const once = () => {
    if (ctx) wake(ctx);
    document.removeEventListener('pointerdown', once, true);
    document.removeEventListener('keydown', once, true);
  };
  document.addEventListener('pointerdown', once, true);
  document.addEventListener('keydown', once, true);
}

// ---------------------------------------------------------------------------
// Buffer cache (decode once, reuse)
// ---------------------------------------------------------------------------

const buffers = new Map<number, AudioBuffer>();
const decoding = new Map<number, Promise<AudioBuffer | null>>();

/**
 * v0.27.0: on ANDROID a sound is resolved to a real file before it is decoded.
 *
 * Handing the audio library a `require()` module id looks like the tidy option, and in development it
 * is: the id resolves to a Metro URL and the library fetches it. In a RELEASE build the same call
 * takes a different branch, the one for bundled Android assets, and that branch does not survive the
 * release packaging here. It throws, the throw is swallowed by the catch below because a missing
 * sound must never break a tap, and the app is silent with nothing said about it.
 *
 * The whole failure lives in a code path that only exists in a release APK, which is why it never
 * showed up in Expo Go and why the app made noise everywhere except on the device people play on.
 *
 * `expo-asset` knows how to turn a module id into a real file on disk, on every platform and in both
 * build types. One extra await the first time a sound is heard, and then it is cached like everything
 * else. Web keeps passing the id straight through: there is no bundled-asset branch in a browser, the
 * id resolves to a URL, and the round trip would only add a request.
 */
async function assetUri(src: number): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Asset } = require('expo-asset') as typeof import('expo-asset');
    const asset = Asset.fromModule(src);
    if (!asset.localUri) await asset.downloadAsync();
    return asset.localUri ?? asset.uri ?? null;
  } catch {
    return null;
  }
}

/**
 * Sounds that could not be decoded, so they are not attempted again (v0.27.1).
 *
 * The failure path used to delete its in-flight entry and leave nothing behind, so a sound that could
 * not be decoded was retried on EVERY press for the life of the app. With a file resolution in front
 * of the decode that meant a filesystem round trip per button tap, which is a stutter you can feel,
 * and it made a silent app a slow one as well.
 */
const failed = new Set<number>();

/** What went wrong, kept for the diagnostic readout. Cleared when a decode finally works. */
let lastError = '';
let decoded = 0;

/**
 * Decode a sound, trying BOTH routes to the file (v0.27.1).
 *
 * Which route works depends on the build. A `require()` id resolves to a Metro URL in development and
 * takes the bundled-Android-asset branch in a release APK; resolving through `expo-asset` gives a real
 * file instead. Rather than reason about which applies, try the file first and fall back to the id.
 * Whichever one the device is happy with, wins, and the app is not silent because a guess was wrong.
 */
function decode(src: number): Promise<AudioBuffer | null> {
  const c = getCtx();
  if (!c) return Promise.resolve(null);
  const cached = buffers.get(src);
  if (cached) return Promise.resolve(cached);
  if (failed.has(src)) return Promise.resolve(null);
  const inflight = decoding.get(src);
  if (inflight) return inflight;
  const attempt = async (): Promise<AudioBuffer> => {
    const uri = await assetUri(src);
    if (!uri) return c.decodeAudioData(src as never);
    try {
      return await c.decodeAudioData(uri as never);
    } catch (e) {
      lastError = `file: ${String(e)}`;
      return c.decodeAudioData(src as never); // the module id, the way it worked before
    }
  };
  const p = attempt()
    .then((buf) => {
      buffers.set(src, buf);
      decoding.delete(src);
      decoded += 1;
      return buf;
    })
    .catch((e: unknown) => {
      decoding.delete(src);
      failed.add(src);
      lastError = String(e);
      // A sound that cannot be decoded is not worth a crash, but it IS worth knowing about: silence
      // with nothing said is what let a release build ship with no sound at all.
      if (__DEV__) console.warn('[sfx] could not decode a sound', src, e);
      return null;
    });
  decoding.set(src, p);
  return p;
}

/**
 * One line describing what the audio engine is actually doing (v0.27.1).
 *
 * There is no console on the device people play on, and a sound that fails is deliberately silent, so
 * a release with no audio looks exactly like a release with the volume down. This is the readout: hold
 * the speaker on the main menu to see it.
 */
export function sfxDiagnostics(): string {
  if (unavailable) return 'Audio engine unavailable on this device.';
  if (!ctx) return 'Audio engine not started yet.';
  const rate = Math.round((ctx as { sampleRate?: number }).sampleRate ?? 0);
  const head = `Audio ${stateOf(ctx)} @${rate}, ${decoded} ready, ${failed.size} failed, start ${lastResume || 'pending'}${rebuilds ? `, ${rebuilds} restart${rebuilds > 1 ? 's' : ''}` : ''}${muted ? ', MUTED' : ''}.`;
  return failed.size && lastError ? `${head} ${lastError.slice(0, 110)}` : head;
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

// v0.24.3: `createBufferSource` takes an OPTIONS OBJECT on native but a BARE BOOLEAN on web
// (web-core/AudioContext wraps it itself). Passing `{ pitchCorrection: false }` therefore read as
// truthy on web, selecting the pitch-stretcher, whose WASM never loads in a bundled app — so EVERY
// sound threw "window[globalTag] is not a function". Calling it with NO argument is correct on both:
// native gets `undefined` options, web gets `undefined` pitchCorrection. Do not "restore" the object.
/**
 * Set a source node's pitch offset, whatever shape the platform's node is (v0.27.3).
 *
 * On web, `react-native-audio-api` hands back a FACADE whose only job is to forward calls to the
 * real node underneath. It forwards `buffer`, `loop`, `start` and friends -- but not `detune`, which
 * exists only on the inner node. So `node.detune.value = cents` threw, inside the swallow-everything
 * catch below, and took the whole play with it BEFORE `start()` was ever reached. Every sound with
 * pitch variation was therefore silent in the browser, which is most of them: buttons, the carousel
 * tick, the float menu, and the second stage of a stat icon. The one sound that still played on
 * entering the sheet is one of the few asked for at a flat pitch.
 *
 * Native nodes carry `detune` directly, so they take the first branch and behave exactly as before.
 */
type Detunable = { detune?: { value: number }; asAudioBufferSourceNodeWeb?: () => { detune?: { value: number } } | undefined };
function detuneBy(node: unknown, cents: number): void {
  const n = node as Detunable;
  const param = n.detune ?? n.asAudioBufferSourceNodeWeb?.()?.detune;
  if (param) param.value = cents;
}

function fire(src: number, baseVol: number, varyCents: number, opts?: PlayOpts) {
  const c = getCtx();
  if (!c) return;
  void decode(src).then((buf) => {
    if (!buf) return;
    try {
      const node = c.createBufferSource();
      node.buffer = buf;
      const vary = opts?.vary === false ? 0 : jitter() * varyCents;
      const cents = (opts?.cents ?? 0) + vary;
      if (cents) detuneBy(node, cents);
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

// Loading-screen guard (#258): NEVER play an "enter" sound while a loading screen is up. The latest
// such request is DEFERRED and fires when the last loader clears (so the sheet/panel chime lands as
// the UI becomes visible, not behind the loader). Other sounds don't fire during loaders anyway.
const ENTER_SOUNDS = new Set<SfxId>(['sheetEnter', 'panelOpen', 'enterCardViewer']);
let loadingCount = 0;
let deferredEnter: SfxId | null = null;
export function beginLoading() {
  loadingCount += 1;
}
export function endLoading() {
  loadingCount = Math.max(0, loadingCount - 1);
  if (loadingCount === 0 && deferredEnter) {
    const id = deferredEnter;
    deferredEnter = null;
    playSfx(id);
  }
}

/** Fire a one-shot SFX by id (with default per-play pitch variation). */
export function playSfx(id: SfxId, opts?: PlayOpts) {
  if (loadingCount > 0 && ENTER_SOUNDS.has(id)) {
    deferredEnter = id; // a loader is up — hold the enter chime until it clears
    return;
  }
  fire(FILES[id], SFX_VOLUME[id] ?? DEFAULT_VOLUME, SFX_PITCH_CENTS[id] ?? DEFAULT_CENTS, opts);
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
    const node = c.createBufferSource();
    node.buffer = buf;
    if (opts?.cents) detuneBy(node, opts.cents);
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
