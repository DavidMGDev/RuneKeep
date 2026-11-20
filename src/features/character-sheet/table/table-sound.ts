/**
 * The table's sound schemes (owner, v0.47.14): RuneKeep's own sounds, or the ULTRAKILL ones.
 *
 * Every sound on the table is a named cue. The RuneKeep scheme plays the app sound each call site names (with the
 * pitch it asks for), so it sounds exactly as before. The ULTRAKILL scheme plays one of several files for each cue,
 * so far more of the table has a voice of its own. Those files are never shipped with the app: the player picks
 * their own copy of the folder once, and it is kept in this browser (IndexedDB) and nowhere else. A cue whose file
 * is missing falls back to the RuneKeep sound.
 */
import { playOwn, playSfx, type PlayOpts, type SfxId } from '@/lib/sfx';

const UI_HOVER = ['G4F SFX11 - ExoInterface - Cursor Click 25.wav', 'click.wav', 'Click1.wav'];
const UI_TAP = ['Key Press In.wav', 'Key Press Out.wav', 'RevolverClick.wav', 'countingClick.wav'];
const UI_OPEN = ['Door 1 Open.wav', 'Door 2 Open.wav', 'dark-ui power on off dark 01.wav', 'G4F SFX11 - ExoInterface - Process - Short 06.wav'];
const UI_CLOSE = ['Door 1 Close.wav', 'Door 2 Close.wav', 'G4F SFX11 - ExoInterface - Window Close - Short 16.wav', 'dark-ui power on off dark 02.wav'];
const BREAKS = ['HeadBreak.wav', 'HeadBreak2.wav', 'LimbBreak.wav', 'GlassHit.wav', 'Glass_Break_Vase_D50_Fienup_003.wav', '443293__deathscyp__wood-break 2.wav', 'bigRockBreak.wav', 'bonusbreak2.wav', 'bonusbreak3.wav'];
const STEPS = ['footstep_stone1.wav', 'footstep_stone2.wav', 'footstep_stone3.wav', 'WoodImpact.wav', 'CrateBounce.wav'];
const GABRIEL = Array.from({ length: 12 }, (_, i) => `gab_Taunt${i + 1}.wav`);

/** Each cue's ULTRAKILL files (one is picked each time, never the same twice running) and its loudness. */
const PACK = {
  'ui:hover': { files: UI_HOVER, vol: 0.25 },
  'ui:tap': { files: UI_TAP, vol: 0.4 },
  'ui:open': { files: UI_OPEN, vol: 0.45 },
  'ui:close': { files: UI_CLOSE, vol: 0.45 },
  'ui:toggle': { files: ['Accent,Interface,UI,Alert,Clean,Metallic,Double,Fast.wav', 'Beep_high.wav', 'BeepBeep_high.wav', 'BeepBeep_high_0.wav'], vol: 0.4 },
  'ui:confirm': { files: ['G4F SFX11 - ExoInterface - Action Confirm - Long 05.wav', 'BatteryCharged.wav', 'Message.wav'], vol: 0.5 },
  'ui:error': { files: ['Error.wav', 'UI_Mechanical_Error_11_FX_01.wav', 'Negative_Notification_25.wav'], vol: 0.5 },
  'ui:delete': { files: ['SandboxDelete.wav'], vol: 0.5 },
  'ui:shuffle': { files: ['coinspin.wav', 'MachineGunSpin.wav'], vol: 0.5 },
  'ui:dragStart': { files: ['hookArmThrowStart.wav', 'Mechanism - AssaultRifle_PickUp_004.wav'], vol: 0.4 },
  'ui:dragEnd': { files: ['hookArmCatch.wav', 'hookArmClink.wav'], vol: 0.4 },
  'preset:pick': { files: ['enemyShotgunReady.wav', 'shotgunpump1.wav', 'shotgunpump2.wav', '171624__pjkasinski3__rem870-pump3.wav'], vol: 0.5 },
  'hand:scroll': { files: ['countingClick.wav', 'countingClickOrig.wav', 'RailcannonPipClick.wav'], vol: 0.4 },
  'deck:step': { files: ['RailcannonPipClick.wav', 'fistReload.wav'], vol: 0.45 },
  'card:lift': { files: ['hookArmWhoosh.wav', 'Whoosh.wav', 'PunchSwoosh.wav'], vol: 0.45 },
  'card:place': { files: STEPS, vol: 0.5 },
  'card:cancel': { files: ['Dodge.wav', 'Dodge3.wav'], vol: 0.4 },
  'card:fling': { files: ['WhooshLoud.wav', 'PunchSwooshHeavy.wav', 'Dodge2.wav'], vol: 0.55 },
  'card:turn': { files: ['Mechanism -  Designed Mega Steam Lever-002.wav', 'CSFX-2_Mechanics_45.wav'], vol: 0.45 },
  'card:physical': { files: ['Mechanism -  Designed Mega Steam Lever-004.wav', 'Mechanism -  Designed Mega Steam Lever-005b.wav'], vol: 0.5 },
  'piece:grab': { files: ['hookPointGrab.wav', 'hookArmCatch.wav'], vol: 0.45 },
  'piece:charge': { files: ['pumpCharge.wav', 'electricCharge.wav', 'PierceCharge.wav'], vol: 0.5 },
  'piece:ignite': { files: ['FireStart.wav', 'enrage.wav'], vol: 0.6 },
  'piece:reroll': { files: ['coinflip.wav', '319630__vehicle__coinflip-01.wav'], vol: 0.5 },
  'piece:bump': { files: ['PlasticHit.wav', 'shellImpact.wav'], vol: 0.45 },
  'piece:putAway': { files: ['SandboxDelete.wav', 'HpGet.wav'], vol: 0.45 },
  'piece:onCard': { files: ['hookArmClink.wav', 'shellImpact.wav', 'JumpPadLight.wav'], vol: 0.5 },
  'piece:offCard': { files: ['Landing.wav', 'stonestep.wav'], vol: 0.45 },
  'piece:break': { files: BREAKS, vol: 0.6 },
  'impact:stop': { files: ['IntroHit.wav', 'Impacts_PROCESSED_001.wav', 'Impacts_PROCESSED_002.wav', 'Bluezone_BC0251_heavy_metal_impact_steel_barrel_01.wav', 'Metal_Hit_Crash_199.wav'], vol: 0.8 },
  'throw': { files: ['Whoosh.wav', 'PunchSwoosh.wav', 'Dodge.wav', 'Dodge3.wav'], vol: 0.45 },
  'throw:swing': { files: ['PunchSwooshHeavy.wav', 'chainsawSwing2.wav', 'GabrielSwing2.wav', 'AnimeSlash.wav'], vol: 0.55 },
  'throw:charged': { files: ['punch_projectile.wav', 'punch_heavy.wav', 'Shoot1.wav', 'Shoot2.wav', 'AltRevolverShoot1D.wav', 'AltRevolverShoot2D.wav'], vol: 0.55 },
  'throw:fire': { files: ['RailcannonFire4.wav', 'RailcannonFire5.wav', 'PlasmaFire.wav', 'Steampunk Weapons - Shotgun 2 - Shot - 03.wav', 'Steampunk Weapons - Shotgun 2 - Shot - 05.wav'], vol: 0.7 },
  'roll:throw': { files: ['Shoot1c3.wav', 'Shoot1c4.wav', 'Shoot2b3.wav', 'Future Weapons 2 - Energy Gun - shot_single_2.wav'], vol: 0.5 },
  'roll:critical': { files: ['RailcannonFull.wav', 'BatteryCharged.wav', 'HarpoonCharged.wav'], vol: 0.6 },
  'roll:hope': { files: ['HpGet.wav', 'Accent,Interface,UI,Alert,Resonant,Waver.wav', 'Bell_10_b.wav'], vol: 0.55 },
  'roll:fear': { files: ['SomethingEvil3.wav', 'DroneSpot.wav', 'StalkerWarning.wav'], vol: 0.55 },
  'roll:muted': { files: ['DroneCharge.wav', 'VirtueCharge.wav'], vol: 0.55 },
  'roll:bad': { files: ['CrowdAww.wav', 'DroneLose.wav', 'Zombie Weak Death.wav', 'CrashProtectorLose.wav'], vol: 0.55 },
  'roll:plain': { files: ['RailcannonPipClick.wav', 'Message.wav', 'ComputerSFX_alerts-004.wav'], vol: 0.5 },
  'roll:crit': { files: ['gab_Behold.wav', 'mp_judgement.wav', 'mp_judgement2.wav', 'CrowdCheer.wav'], vol: 0.75 },
  'charge:lit': { files: ['FireStart.wav', 'enrage.wav', 'RailcannonFullClickAndCharge.wav'], vol: 0.6 },
  'select': { files: ['DroneScan.wav', 'RoboHUT.wav'], vol: 0.4 },
  'spawner:toss': { files: ['jarmo_jump.wav', 'JumpPad.wav', 'JumpPadLight.wav'], vol: 0.45 },
  'spawner:take': { files: ['hookPointGrab.wav', 'Mechanism - AssaultRifle_PickUp_004.wav'], vol: 0.45 },
  'spawner:color': { files: ['coinspin.wav', 'coinflip.wav'], vol: 0.4 },
  'spawner:die': { files: ['RevolverClick.wav', 'fistReload.wav', 'nailgunStop.wav'], vol: 0.45 },
  'spawner:mat': { files: ['shotgunpump1.wav', 'shotgunpump2.wav'], vol: 0.45 },
  'table:reset': { files: ['Portal3.wav', 'SandboxFreeze.wav'], vol: 0.55 },
  'table:home': { files: ['Mechanism -  Designed Mega Steam Lever-004b.wav'], vol: 0.45 },
  'table:tidy': { files: ['PortalHeavy.wav', 'Portal3.wav'], vol: 0.5 },
  'table:tidyPiece': { files: ['HpGet.wav', 'RailcannonPipClick.wav', 'countingClick.wav'], vol: 0.3 },
  'table:clear': { files: ['SandboxDelete.wav'], vol: 0.55 },
  'playground:on': { files: ['UI Startup.wav', 'TV On.wav'], vol: 0.55 },
  'playground:off': { files: ['Bluezone-Autobots-shutdown-003.wav'], vol: 0.55 },
  'chest:open': { files: ['85678__tmkappelt__door-old-creaking-2.wav', 'MassRegurgitate.wav'], vol: 0.55 },
  'chest:dissolve': { files: ['PortalStalker.wav', 'Portal3.wav'], vol: 0.5 },
  'mimic:pop': { files: ['MassRegurgitate.wav'], vol: 0.65 },
  'mimic:swallow': { files: ['MassDeath.wav', 'mp_crush.wav'], vol: 0.65 },
  'thief:steal': { files: ['coinflip.wav', 'HpGet.wav'], vol: 0.45 },
  'element:fire': { files: ['FireBig.wav', 'FireSmall.wav'], vol: 0.45 },
  'element:ice': { files: ['IceUnfreeze.wav', 'SandboxFreeze.wav'], vol: 0.45 },
  'element:water': { files: ['WaterSplash.wav', 'WaterSmallSplash.wav'], vol: 0.45 },
  'domat:draw': { files: ['GabrielWeaponSpawn.wav', 'PortalMindflayer.wav', 'PortalInsurrectionist2.wav'], vol: 0.6 },
  'domat:empty': { files: ['Error.wav', 'DroneHurt.wav'], vol: 0.5 },
  'domat:play': { files: ['VirtueAttack.wav', 'GabrielWeaponBreak.wav'], vol: 0.6 },
  'domat:calm': { files: ['IceUnfreeze.wav'], vol: 0.45 },
  'domat:gust': { files: ['WhooshLoud.wav', 'Whoosh,Organic,Styrofoam,Plank,Airy,Smooth,Texture,1.wav'], vol: 0.65 },
  'domat:wish': { files: ['gab_Behold.wav', 'HarpoonCharged.wav'], vol: 0.65 },
  'domat:elements': { files: ['Electricity.wav', 'ElectricityBig.wav'], vol: 0.6 },
  'domat:comet': { files: ['245372__quaker540__hq-explosion.wav', 'explosion_large_08.wav', 'StalkerExplosion.wav', '276968__hoffy1138__my-first-recorded-explosion.wav'], vol: 0.7 },
  'domat:mimic': { files: ['MassWindup.wav', 'MassBigPain.wav'], vol: 0.65 },
  'domat:blackhole': { files: ['BlackHoleLaunch.wav'], vol: 0.65 },
  'blackhole:boom': { files: ['BlackHoleExplosion.wav', '256960__quaker540__supernatural-explosion.wav'], vol: 0.75 },
  'domat:cage': { files: ['harpoonPierce.wav', 'harpoonStop.wav'], vol: 0.6 },
  'domat:petrify': { files: ['SandboxFreeze.wav', 'boulder_impact_on_stones_14.wav', 'Statuedeath.wav'], vol: 0.6 },
  'domat:lock': { files: ['RevolverClick.wav', 'Mechanism -  Designed Mega Steam Lever-002.wav'], vol: 0.55 },
  'domat:tiny': { files: ['CrashProtectorGet.wav', '8bitAhh.wav'], vol: 0.55 },
  'domat:contrary': { files: ['AnimeSlashReverse.wav', 'Zombie Weak Death Reverse.wav'], vol: 0.55 },
  'domat:follow': { files: ['hookArmThrowStart.wav', 'hookArmPullStart.wav'], vol: 0.55 },
  'domat:seesaw': { files: ['Twirling.wav'], vol: 0.55 },
  'domat:moon': { files: ['WaterSurfacing.wav', 'VirtueCharge.wav'], vol: 0.55 },
  'domat:knight': { files: ['mp_prepare.wav', 'mp_prepare2.wav'], vol: 0.7 },
  'domat:thief': { files: ['StalkerWarning.wav', 'DroneSpot.wav'], vol: 0.55 },
  'domat:rewind': { files: ['AnimeSlashReverse.wav', 'Zombie Weak Death Reverse.wav'], vol: 0.55 },
  'domat:throne': { files: GABRIEL, vol: 0.7 },
  'domat:gems': { files: ['coinflip.wav', '319630__vehicle__coinflip-01.wav', 'coinspin.wav'], vol: 0.55 },
  'domat:talons': { files: ['saw.wav', 'chainsawThrown.wav', 'AnimeSlash.wav'], vol: 0.6 },
  'domat:ruin': { files: ['mp_thyend.wav', 'mp_thyend2.wav', 'mp_weak.wav'], vol: 0.7 },
  'hit:die': { files: ['PlasticHit.wav', 'shellImpact.wav', 'GlassHit.wav'], vol: 0.5 },
  'hit:table': { files: ['WoodImpact.wav', 'CrateBounce.wav', 'footstep_stone1.wav', 'footstep_stone2.wav', 'footstep_stone3.wav', 'SandHit.wav'], vol: 0.5 },
  'hit:rail': { files: ['Bluezone_BC0236_metal_debris_097.wav', 'Bluezone_BC0238_impact_002.wav', 'hookArmClink.wav', 'SkullImpact.wav'], vol: 0.5 },
  'hit:break': { files: BREAKS, vol: 0.5 },
} satisfies Record<string, { files: string[]; vol: number }>;

export type Cue = keyof typeof PACK;
export type Scheme = 'runekeep' | 'ultrakill';

/** Every file the ULTRAKILL scheme can use: only these are kept from the folder. */
export const ULTRAKILL_FILES = [...new Set(Object.values(PACK).flatMap((p) => p.files))];

const SCHEME_KEY = 'runekeep.table.sounds';
let scheme: Scheme = 'runekeep';
try { if (typeof localStorage !== 'undefined' && localStorage.getItem(SCHEME_KEY) === 'ultrakill') scheme = 'ultrakill'; } catch { /* private window */ }
/** The files this browser has, by name. */
let have = new Set<string>();
const listeners = new Set<() => void>();
const changed = () => { for (const l of listeners) l(); };

export function soundScheme(): Scheme { return scheme; }
export function setSoundScheme(s: Scheme): void {
  scheme = s;
  try { localStorage.setItem(SCHEME_KEY, s); } catch { /* private window */ }
  changed();
}
/** How many of the ULTRAKILL files this browser holds. */
export function ultrakillLoaded(): number { return have.size; }
export function onSoundsChange(f: () => void): () => void { listeners.add(f); return () => { listeners.delete(f); }; }

// ------------------------------------------------------------------ the files, kept in this browser only
const DB = 'runekeep-sounds';
const STORE = 'files';
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function ask<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then((d) => new Promise<T>((res, rej) => {
    const req = run(d.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  }));
}
function refresh(): Promise<void> {
  return ask('readonly', (s) => s.getAllKeys()).then((keys) => { have = new Set(keys.map(String)); changed(); }).catch(() => undefined);
}
if (typeof indexedDB !== 'undefined') void refresh();

/** Keep the ULTRAKILL files from a folder the player picked; the rest of it is ignored. */
export async function keepUltrakillFolder(files: FileList | File[]): Promise<number> {
  const want = new Set(ULTRAKILL_FILES);
  let kept = 0;
  for (const f of Array.from(files)) {
    if (!want.has(f.name)) continue;
    await ask('readwrite', (s) => s.put(f.slice(0, f.size, f.type || 'audio/wav'), f.name));
    kept++;
  }
  await refresh();
  return kept;
}
export async function forgetUltrakill(): Promise<void> {
  await ask('readwrite', (s) => s.clear());
  await refresh();
}

// ------------------------------------------------------------------ playing
const last = new Map<string, string>();
function pick(c: Cue): string | null {
  const files = PACK[c].files.filter((f) => have.has(f));
  if (!files.length) return null;
  const prev = last.get(c);
  const pool = files.length > 1 ? files.filter((f) => f !== prev) : files;
  const f = pool[Math.floor(Math.random() * pool.length)];
  last.set(c, f);
  return f;
}
const bytes = (name: string) => () => ask<Blob>('readonly', (s) => s.get(name) as IDBRequest<Blob>).then((b) => b.arrayBuffer());

/**
 * Play a cue: under ULTRAKILL one of its files (a little pitch variation, no fixed offset), otherwise the RuneKeep
 * sound `id` exactly as asked. Returns nothing; a missing file falls back to `id`.
 */
export function cue(c: Cue, id: SfxId, opts?: PlayOpts): void {
  const f = scheme === 'ultrakill' ? pick(c) : null;
  if (!f) { playSfx(id, opts); return; }
  playOwn(f, bytes(f), { volume: PACK[c].vol * Math.min(1, (opts?.volume ?? 1) * 1.4) });
}

/** A piece knocking into something, under ULTRAKILL (true when it played): as loud as the hit was hard. */
let lastKnock = 0;
let knocks = 0;
export function knockCue(kind: 'die' | 'table' | 'rail' | 'break', speed: number): boolean {
  if (scheme !== 'ultrakill') return false;
  const f = pick(`hit:${kind}`);
  if (!f) return false;
  const now = performance.now();
  if (now - lastKnock > 70) knocks = 0;
  const level = Math.min(1, speed / 1600);
  if (knocks >= 2 || level < 0.05) return true;
  knocks++;
  lastKnock = now;
  playOwn(f, bytes(f), { volume: PACK[`hit:${kind}`].vol * level });
  return true;
}
