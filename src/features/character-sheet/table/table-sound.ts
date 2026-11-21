/**
 * The table's sound schemes (owner, v0.47.16): Aggressive, the default, and Regular.
 *
 * Every sound on the table is a named cue. Regular plays the app sound each call site names (with the pitch it asks
 * for), as the table always sounded. Aggressive plays one of several files for each cue, so far more of the table has
 * a voice of its own; they live in public/sounds/aggressive (built by scripts/sounds/build-aggressive.py) and are
 * fetched the first time each is needed. Credits are in the README.
 */
import { playOwn, playSfx, type PlayOpts, type SfxId } from '@/lib/sfx';

const UI_HOVER = ['g4f-sfx11-exointerface-cursor-click-25', 'click', 'click1'];
const UI_TAP = ['key-press-in', 'key-press-out', 'countingclick'];
const UI_OPEN = ['dark-ui-power-on-off-dark-01'];
const UI_CLOSE = ['door-1-close', 'door-2-close', 'dark-ui-power-on-off-dark-02'];
const BREAKS = ['headbreak', 'headbreak2', 'limbbreak', 'glasshit', 'glass-break-vase-d50-fienup-003', '443293-deathscyp-wood-break-2', 'bigrockbreak', 'bonusbreak2', 'bonusbreak3'];
// Only the steps loud enough to hear (owner, v0.47.17: two of the five played nothing).
const STEPS = ['footstep-stone1', 'woodimpact', 'cratebounce'];
// Taken out by the owner (v0.47.29): gab-taunt6.
const TAUNTS = Array.from({ length: 12 }, (_, i) => `gab-taunt${i + 1}`).filter((f) => f !== 'gab-taunt6');

/**
 * Each cue's files (one is picked each time, never the same twice running), its loudness, how long it may ring before
 * it fades (seconds; the Deck of Many Things rings as long as it likes) and a fixed pitch, in cents.
 */
const PACK = {
  'ui:hover': { files: UI_HOVER, vol: 0.25 },
  'ui:tap': { files: UI_TAP, vol: 0.4 },
  'ui:open': { files: UI_OPEN, vol: 0.45 },
  'ui:close': { files: UI_CLOSE, vol: 0.45 },
  'ui:toggle': { files: ['beep-high', 'beepbeep-high', 'beepbeep-high-0'], vol: 0.4 },
  'ui:confirm': { max: 1, files: ['g4f-sfx11-exointerface-action-confirm-long-05', 'batterycharged', 'message'], vol: 0.5 },
  'ui:error': { files: ['error', 'ui-mechanical-error-11-fx-01', 'negative-notification-25'], vol: 0.5 },
  'ui:delete': { files: ['sandboxdelete'], vol: 0.5 },
  'ui:shuffle': { max: 1, files: ['coinspin', 'machinegunspin'], vol: 0.5 },
  'ui:dragStart': { files: ['hookarmthrowstart', 'mechanism-assaultrifle-pickup-004'], vol: 0.4 },
  'ui:dragEnd': { files: ['hookarmcatch', 'hookarmclink'], vol: 0.4 },
  'preset:pick': { files: ['enemyshotgunready', 'shotgunpump1', 'shotgunpump2', '171624-pjkasinski3-rem870-pump3'], vol: 0.5 },
  'hand:scroll': { files: ['countingclick'], vol: 0.4 },
  'deck:step': { files: ['fistreload'], vol: 0.45, max: 0.45 },
  'card:lift': { files: ['punchswoosh', 'hookarmthrowstart'], vol: 0.3, max: 0.3 },
  'card:place': { files: STEPS, vol: 0.4, max: 0.3 },
  'card:cancel': { files: ['dodge', 'dodge3'], vol: 0.4 },
  'card:fling': { files: ['punchswooshheavy', 'dodge2'], vol: 0.5, max: 0.6 },
  'card:turn': { files: ['mechanism-designed-mega-steam-lever-002', 'csfx-2-mechanics-45'], vol: 0.45 },
  'card:physical': { files: ['mechanism-designed-mega-steam-lever-004', 'mechanism-designed-mega-steam-lever-005b'], vol: 0.5 },
  'piece:grab': { files: ['hookpointgrab', 'hookarmcatch'], vol: 0.45 },
  'piece:charge': { files: ['pumpcharge', 'electriccharge', 'piercecharge'], vol: 0.5 },
  'piece:ignite': { max: 1.5, files: ['firestart', 'enrage'], vol: 0.6 },
  'piece:reroll': { files: ['coinflip', '319630-vehicle-coinflip-01'], vol: 0.5 },
  'piece:bump': { files: ['plastichit', 'shellimpact'], vol: 0.45 },
  'piece:putAway': { files: ['sandboxdelete', 'hpget'], vol: 0.45 },
  'piece:onCard': { files: ['hookarmclink', 'shellimpact', 'jumppadlight'], vol: 0.5 },
  'piece:offCard': { files: ['landing', 'stonestep'], vol: 0.45 },
  'piece:break': { max: 1.6, files: BREAKS, vol: 0.6 },
  // Only the long, heavy ones (v0.47.18: the two short ones made a held hit, a frozen one especially, fall flat).
  'impact:stop': { max: 2.4, files: ['introhit', 'impacts-processed-001', 'bluezone-bc0251-heavy-metal-impact-steel-barrel-01'], vol: 0.8 },
  'throw': { files: ['punchswoosh', 'dodge', 'dodge3'], vol: 0.45 },
  'throw:swing': { files: ['punchswooshheavy', 'chainsawswing2', 'gabrielswing2', 'animeslash'], vol: 0.55 },
  'throw:charged': { max: 1.4, files: ['punch-projectile', 'punch-heavy', 'shoot1', 'shoot2', 'altrevolvershoot1d', 'altrevolvershoot2d'], vol: 0.55 },
  'throw:fire': { max: 1.8, files: ['railcannonfire4', 'railcannonfire5', 'plasmafire', 'steampunk-weapons-shotgun-2-shot-03', 'steampunk-weapons-shotgun-2-shot-05'], vol: 0.7 },
  'roll:throw': { max: 1.4, files: ['shoot1c3', 'shoot1c4', 'shoot2b3', 'future-weapons-2-energy-gun-shot-single-2'], vol: 0.5 },
  'roll:critical': { max: 1.8, files: ['railcannonfull', 'batterycharged', 'harpooncharged'], vol: 0.6 },
  // Always the short one (owner, v0.47.18), and so for Fear.
  'roll:hope': { files: ['hpget'], vol: 0.55 },
  'roll:fear': { max: 2, files: ['dronespot'], vol: 0.4 },
  'roll:muted': { files: ['dronecharge', 'virtuecharge'], vol: 0.55 },
  'roll:bad': { files: ['dronelose', 'zombie-weak-death', 'crashprotectorlose'], vol: 0.55 },
  'roll:plain': { files: ['railcannonpipclick', 'message', 'computersfx-alerts-004'], vol: 0.5 },
  // A critical lands like a held hit (owner, v0.47.18): the heavy impact sounds.
  // The critical's sequence (owner, v0.47.27): the pair gathered, the build, the word, the blast.
  'crit:gather': { max: 1.2, files: ['gabrielweaponspawn'], vol: 0.6 },
  'crit:rise': { max: 2.2, files: ['virtuecharge', 'railcannonfullclickandcharge'], vol: 0.75 },
  'crit:word': { max: 1.2, files: ['impacts-processed-002', 'shellimpact'], vol: 0.9 },
  'crit:boom': { max: 3.5, files: ['256960-quaker540-supernatural-explosion', 'blackholeexplosion'], vol: 0.9 },
  'roll:crit': { max: 3, files: ['introhit', 'impacts-processed-001', 'bluezone-bc0251-heavy-metal-impact-steel-barrel-01'], vol: 0.85 },
  'charge:lit': { max: 1.5, files: ['firestart', 'enrage', 'railcannonfullclickandcharge'], vol: 0.6 },
  'select': { files: ['dronescan', 'robohut'], vol: 0.4 },
  'spawner:toss': { files: ['jarmo-jump', 'jumppad', 'jumppadlight'], vol: 0.45 },
  'spawner:take': { files: ['hookpointgrab', 'mechanism-assaultrifle-pickup-004'], vol: 0.45 },
  'spawner:color': { files: ['319630-vehicle-coinflip-01'], vol: 0.4, max: 0.35 },
  'spawner:die': { files: ['nailgunstop', 'csfx-2-mechanics-45'], vol: 0.45, max: 0.4 },
  'spawner:mat': { files: ['shotgunpump1', 'shotgunpump2'], vol: 0.45 },
  'table:reset': { max: 1.6, files: ['portal3', 'sandboxfreeze'], vol: 0.55 },
  'table:home': { files: ['mechanism-designed-mega-steam-lever-004b'], vol: 0.45 },
  'table:tidy': { max: 1.6, files: ['portalheavy', 'portal3'], vol: 0.5 },
  'table:tidyPiece': { files: ['hpget', 'railcannonpipclick', 'countingclick'], vol: 0.3 },
  'table:clear': { files: ['sandboxdelete'], vol: 0.55 },
  'playground:on': { max: 1.6, files: ['tv-on'], vol: 0.55 },
  'playground:off': { max: 1.6, files: ['dark-ui-power-on-off-dark-02'], vol: 0.55 },
  'chest:open': { max: 1.6, files: ['massregurgitate'], vol: 0.55 },
  'chest:dissolve': { max: 1.6, files: ['portalstalker', 'portal3'], vol: 0.5 },
  'mimic:pop': { files: ['massregurgitate'], vol: 0.65 },
  'mimic:swallow': { files: ['massdeath', 'mp-crush'], vol: 0.65 },
  // One short pip per die the chest eats back, each a little higher (owner, v0.47.20).
  'chest:stow': { files: ['railcannonpipclick'], vol: 0.4, max: 0.4 },
  'thief:steal': { files: ['coinflip', 'hpget'], vol: 0.45 },
  'element:fire': { max: 1, files: ['firebig', 'firesmall'], vol: 0.45 },
  'element:ice': { files: ['iceunfreeze', 'sandboxfreeze'], vol: 0.45 },
  'element:water': { files: ['watersplash', 'watersmallsplash'], vol: 0.45 },
  'domat:draw': { files: ['gabrielweaponspawn', 'portalmindflayer', 'portalinsurrectionist2'], vol: 0.6 },
  'domat:empty': { files: ['error'], vol: 0.5 },
  'domat:play': { files: ['virtueattack', 'gabrielweaponbreak'], vol: 0.6 },
  'domat:calm': { files: ['iceunfreeze'], vol: 0.45 },
  'domat:gust': { files: ['whooshloud', 'whoosh-organic-styrofoam-plank-airy-smooth-texture-1'], vol: 0.65 },
  'domat:wish': { files: ['gab-behold', 'harpooncharged'], vol: 0.65 },
  'domat:elements': { files: ['electricity', 'electricitybig'], vol: 0.6 },
  'domat:comet': { files: ['245372-quaker540-hq-explosion', 'explosion-large-08', 'stalkerexplosion', '276968-hoffy1138-my-first-recorded-explosion'], vol: 0.7 },
  'domat:mimic': { files: ['masswindup', 'massbigpain'], vol: 0.65 },
  'domat:blackhole': { files: ['blackholelaunch'], vol: 0.65 },
  'blackhole:boom': { files: ['blackholeexplosion', '256960-quaker540-supernatural-explosion'], vol: 0.75 },
  'domat:cage': { files: ['harpoonpierce', 'harpoonstop'], vol: 0.6 },
  'domat:petrify': { files: ['sandboxfreeze', 'boulder-impact-on-stones-14', 'statuedeath'], vol: 0.6 },
  'domat:lock': { files: ['shotgunpump1', 'mechanism-designed-mega-steam-lever-002'], vol: 0.55 },
  'domat:tiny': { files: ['crashprotectorget', '8bitahh'], vol: 0.55 },
  'domat:contrary': { files: ['animeslashreverse', 'zombie-weak-death-reverse'], vol: 0.55 },
  'domat:follow': { files: ['hookarmthrowstart', 'hookarmpullstart'], vol: 0.55 },
  'domat:seesaw': { files: ['twirling'], vol: 0.55 },
  'domat:moon': { files: ['watersurfacing', 'virtuecharge'], vol: 0.55 },
  'domat:knight': { files: ['heavyhuskstep1', 'streetcleanerwalk'], vol: 0.7 },
  'knight:bounce': { files: ['bluezone-bc0251-heavy-metal-impact-steel-barrel-01', 'metal-hit-crash-199', 'bluezone-bc0238-impact-002', 'skullimpact'], vol: 0.55, max: 0.7 },
  'domat:thief': { files: ['stalkerwarning', 'dronespot'], vol: 0.55 },
  'domat:rewind': { files: ['animeslashreverse', 'zombie-weak-death-reverse'], vol: 0.55 },
  'domat:throne': { files: TAUNTS, vol: 0.7 },
  'domat:gems': { files: ['coinspin', 'coinflip'], vol: 0.55, cents: -600 },
  'domat:talons': { files: ['saw', 'animeslash'], vol: 0.6 },
  'domat:ruin': { files: ['mp-thyend', 'mp-weak'], vol: 0.7 },
  'hit:die': { files: ['plastichit', 'shellimpact', 'glasshit'], vol: 0.5 },
  'hit:table': { files: ['woodimpact', 'cratebounce', 'footstep-stone1', 'sandhit'], vol: 0.5 },
  'hit:rail': { files: ['bluezone-bc0236-metal-debris-097', 'bluezone-bc0238-impact-002', 'hookarmclink', 'skullimpact'], vol: 0.5 },
  'hit:break': { files: BREAKS, vol: 0.5 },
} satisfies Record<string, { files: string[]; vol: number; max?: number; cents?: number }>;

export type Cue = keyof typeof PACK;
/** Aggressive is the default; Regular is RuneKeep's own, softer sounds (owner, v0.47.16). */
export type Scheme = 'aggressive' | 'regular';

const SCHEME_KEY = 'runekeep.table.soundScheme';
let scheme: Scheme = 'aggressive';
try { if (typeof localStorage !== 'undefined' && localStorage.getItem(SCHEME_KEY) === 'regular') scheme = 'regular'; } catch { /* private window */ }
const listeners = new Set<() => void>();

export function soundScheme(): Scheme { return scheme; }
export function setSoundScheme(s: Scheme): void {
  scheme = s;
  try { localStorage.setItem(SCHEME_KEY, s); } catch { /* private window */ }
  for (const l of listeners) l();
}
export function onSoundsChange(f: () => void): () => void { listeners.add(f); return () => { listeners.delete(f); }; }

// ------------------------------------------------------------------ playing
const last = new Map<string, string>();
function pick(c: Cue): string {
  const files: string[] = PACK[c].files;
  const prev = last.get(c);
  const pool = files.length > 1 ? files.filter((f) => f !== prev) : files;
  const f = pool[Math.floor(Math.random() * pool.length)];
  last.set(c, f);
  return f;
}
const bytes = (name: string) => () => fetch(`/sounds/aggressive/${name}.mp3`).then((r) => { if (!r.ok) throw new Error(r.statusText); return r.arrayBuffer(); });
/** How long a cue may ring: its own cap, else long for the Deck of Many Things and short for everything else. */
const capOf = (c: Cue): number => {
  const p = PACK[c] as { max?: number };
  return p.max ?? (/^(domat|blackhole|mimic|thief|element):/.test(c) ? 6 : 1.1);
};

/**
 * Every sound played, named in a small log in the bottom right corner (owner, v0.47.25: to say which to take out of
 * the pool). The file first, then the moment that played it. Each line fades after a few seconds.
 */
let soundLog: HTMLDivElement | null = null;
function logSound(file: string, what: string): void {
  if (typeof document === 'undefined') return;
  if (!soundLog || !soundLog.isConnected) {
    soundLog = document.createElement('div');
    soundLog.setAttribute('aria-hidden', 'true');
    Object.assign(soundLog.style, { position: 'fixed', right: '10px', bottom: '10px', zIndex: '99999', pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', font: '11px/1.35 system-ui, sans-serif' });
    document.body.appendChild(soundLog);
  }
  const id = soundId(file);
  const line = document.createElement('div');
  const label = `${id}  ${file}  ·  ${what}`;
  line.textContent = label;
  line.title = 'Click to copy';
  Object.assign(line.style, { color: '#f3e3bc', background: 'rgba(8,10,14,0.78)', padding: '1px 7px', borderRadius: '3px', transition: 'opacity 600ms', pointerEvents: 'auto', cursor: 'pointer' });
  // A click copies its id and file, to name it when asking for it to be taken out (owner, v0.47.26).
  line.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    void navigator.clipboard?.writeText(`${id} ${file}`).then(() => { line.textContent = `${id} copied`; setTimeout(() => { line.textContent = label; }, 900); }, () => {});
  });
  soundLog.appendChild(line);
  while (soundLog.childElementCount > 10) soundLog.firstElementChild?.remove();
  setTimeout(() => { line.style.opacity = '0'; }, 7000);
  setTimeout(() => line.remove(), 7700);
}
/** A short id for a sound file, the same every time (FNV-1a, four letters and digits). */
export function soundId(file: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < file.length; i++) { h ^= file.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36).slice(-4).padStart(4, '0');
}

/** Play a cue: under Aggressive one of its files, otherwise the Regular sound `id` exactly as asked. */
export function cue(c: Cue, id: SfxId, opts?: PlayOpts): void {
  if (scheme !== 'aggressive') { logSound(id, c); playSfx(id, opts); return; }
  const f = pick(c);
  logSound(f, c);
  const p = PACK[c] as { vol: number; cents?: number };
  playOwn(f, bytes(f), { volume: p.vol * Math.min(1, (opts?.volume ?? 1) * 1.4), cents: p.cents, maxSec: capOf(c) });
}

/** A piece knocking into something, under Aggressive (true when it was handled): as loud as the hit was hard. */
let lastKnock = 0;
let knocks = 0;
export function knockCue(kind: 'die' | 'table' | 'rail' | 'break', speed: number): boolean {
  if (scheme !== 'aggressive') return false;
  const now = performance.now();
  if (now - lastKnock > 70) knocks = 0;
  const level = Math.min(1, speed / 1600);
  if (knocks >= 2 || level < 0.05) return true;
  knocks++;
  lastKnock = now;
  const c = `hit:${kind}` as const;
  const f = pick(c);
  logSound(f, c);
  playOwn(f, bytes(f), { volume: PACK[c].vol * level, maxSec: kind === 'break' ? 1.2 : 0.6 });
  return true;
}
