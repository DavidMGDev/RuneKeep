/**
 * The play table's 3D dice (v0.47.0, web only): three.js draws the dice the Blender script modelled
 * (public/models/dice.glb) over the table, lit from above with real shadows, and `dice-physics` moves them.
 *
 * v0.47.1 (owner): seen straight down through an orthographic camera, so a die looks the same anywhere on the table
 * and the table's px are the scene's units exactly; sharp resin-like materials in six finishes; flat token chips;
 * walls that can be drawn as real 3D rails.
 *
 * Loaded with a dynamic import by the desktop table only, so neither the phone app nor the phone web app ever
 * fetches three.js. The canvas never takes the pointer: the table hit-tests with `hit()` and drives a held die
 * with `grab`/`drag`/`release`, so the cards and everything else underneath keep their own input.
 *
 * The frame loop runs only while something moves and stops the moment every die is asleep.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { allAsleep, type Body, type Bounds, type Cage, type DieFace, type Field, type Impact, launch, makeBody, moveHeld, type Obstacle, qRandom, restOn, sendHome, snapFace, STEP, step, throwLift } from './dice-physics';

export type Shape = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20';
export const FACE_COUNT: Record<Shape, number> = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20 };

/** What a die is made of. The first three are for rolling dice, the last three for the table's controls. */
export type Finish = 'resin' | 'stone' | 'metal' | 'obsidian' | 'gilded' | 'ivory';
export type Walls = 'none' | 'line' | 'stone' | 'brass';

/**
 * What one face shows: a number (or any short text) or a picture, optionally on a round plate of that colour (a
 * gold deck icon on a gilded die sits on a dark medallion). Fewer than the die has repeat round.
 */
/** Pieces drawn from their own Blender model (public/models/<shape>.glb) rather than a polyhedron. */
const MODELED = ['mimic', 'chest', 'dicechest', 'tokenchest', 'mine'] as const;
type Modeled = (typeof MODELED)[number];
const isModeled = (shape: string): shape is Modeled => (MODELED as readonly string[]).includes(shape);

export type FaceArt = { text: string } | { image: CanvasImageSource; plate?: string; halo?: string };

export interface DieSpec {
  key: string;
  /** A polyhedron, a token chip (a flat disc that slides and never tumbles) or a deck of cards (a flat block). */
  /** ... or a chest with a lid that opens: the toothy mimic or the cute chest (scripts/blender/make_mimic.py). */
  /** v0.50.6: the brown dice chest (--brown), the golden token chest (--token) and its landmine (make_mine.py). */
  shape: Shape | 'chip' | 'deck' | 'mimic' | 'chest' | 'dicechest' | 'tokenchest' | 'mine';
  /** Across the die, px. */
  size: number;
  body: string;
  edge: string;
  ink: string;
  faces: FaceArt[];
  finish: Finish;
  /** Settle with the art upright (icons) rather than merely flat (numbers). */
  upright?: boolean;
  /** Only these faces may come to rest on top. */
  restFaces?: number[];
  /** Never moves: the token supply. */
  fixed?: boolean;
  /** An element token (v0.47.19): how it moves and what it does to what it meets. */
  element?: 'fire' | 'ice' | 'water' | 'spark';
  /** A loose token or die: a charged throw can break it. */
  breakable?: boolean;
  /** A piece of the supply: fresh copies pass through it. */
  spawner?: boolean;
  /** Moves only by hopping upright, never tumbling (the control dice, when the look says so). */
  hopper?: boolean;
}

export interface DiceEngine {
  resize(width: number, height: number): void;
  setBounds(b: Bounds): void;
  /** Areas dice bounce off (the dice bar, the hand's own area). */
  setObstacles(o: Obstacle[]): void;
  /** One obstacle that moves on its own, by name (null takes it away): the physical carousel (v0.47.25). */
  setObstacle(id: string, o: Obstacle | null): void;
  /** Draw the table's edge as 3D rails (stone, brass) or not at all. */
  setWalls(kind: Walls, rect: Bounds, thickness: number): void;
  /** Put a die on the table (or rebuild the one with this key in place: its art, colours, finish or size). */
  add(spec: DieSpec, x: number, y: number, opts?: { random?: boolean; face?: number; pop?: boolean; fresh?: boolean }): void;
  /** Put a piece away: after `delay` ms it arcs and tumbles to (x, y), touching nothing, shrinks and is gone. */
  vanish(key: string, x: number, y: number, delay: number): void;
  remove(key: string): void;
  has(key: string): boolean;
  keys(): string[];
  /** Where a die is, and the face on top when it is at rest. */
  state(key: string): { x: number; y: number; top: number; asleep: boolean } | null;
  /** Where a piece is drawn (lifted pieces sit higher on the screen) and how big, px; null when it is gone. */
  screen(key: string): { x: number; y: number; size: number } | null;
  hit(x: number, y: number): string | null;
  grab(key: string, x: number, y: number): void;
  drag(x: number, y: number): void;
  /** Let go: the die flies on with the hand's speed (px/s returned). */
  release(): number;
  /** Throw with a velocity; it slides and tumbles and lands where physics puts it. */
  /**
   * The Roll button (owner, v0.47.31): straight up `up` px/s, falling at `g` px/s², spinning at `spin` rad/s about any
   * axis, drifting only a little (vx, vy); in the air it keeps its spin, and loses most of it as it lands.
   */
  leap(key: string, vx: number, vy: number, up: number, g: number, spin: number): void;
  toss(key: string, vx: number, vy: number, boost?: { gen: number; power: number }, breaker?: Body['breaker']): void;
  /** A piece just let go flies on this many times faster, pushing harder and breaking what it hits (a swung throw). */
  empower(key: string, mult: number, boost?: { gen: number; power: number }, breaker?: Body['breaker']): void;
  /**
   * While `key` is held, `partner` follows right beside it (the Hope and Fear pair), or a list of pieces follow it
   * where they lie now (a selection carried together, v0.47.12); null lets them go. Let go, they all fly together.
   */
  /** `mate`: the other half of a held pair (Hope and Fear, a d100), which stands beside it while the rest circle both. */
  tether(key: string, partner: string | string[] | null, mate?: string): void;
  /**
   * Loose pieces (and physical cards) broken by a charged throw: which, where the first was, whether it was burning,
   * and each break as it happened (how fast and which way the breaker went: a card tears, splits or burns by it).
   */
  onBreak(cb: (keys: string[], at: { x: number; y: number }, fire: boolean, first: boolean, hits: Impact[]) => void): void;
  /**
   * A burning throw's first hit (owner, v0.47.12, "like a smash final hit"): the thrower and what it hit hang where
   * they met for `ms`, the whole table with them when the hit is strong; then what it hit breaks, a gust throws
   * everything near away and the thrower goes on faster. Called as the hit lands, for its light.
   */
  onHitStop(cb: (at: { x: number; y: number }, ms: number, strong: boolean, cold?: boolean) => void): void;
  /** Charge a die with lightning (v0.47.18): thrown at `angle`, it keeps `speed` for `seconds`, breaking what it meets, then pounds down. */
  zap(key: string, angle: number, speed: number, seconds: number, spare?: string[]): void;
  /** A charged die's time ran out and it pounded down here. */
  onPound(cb: (key: string, at: { x: number; y: number }) => void): void;
  /** A force over the table that stays until it is taken off (null): the Deck of Many Things' lasting cards. */
  aura(id: string, f: Field | null): void;
  /** A ring that keeps what is inside it in and the rest out, until taken off (null). */
  cage(id: string, c: { x: number; y: number; r: number } | null): void;
  /** Every throw goes the opposite way to the hand (the Idiot), until turned off. */
  contrary(on: boolean): void;
  /** Open a mimic's lid (0 shut, 1 wide). */
  mimic(key: string, open: number): void;
  /** A mine's lamp blinks this many times a second (0 steady). */
  blink(key: string, hz: number): void;
  /** Shards from `shatter(key, true)` lie on the felt until this sweeps them away. */
  clearShards(): void;
  /** The physical cards on the table (they answer `state`, `toss` and `home` like any piece). */
  cardKeys(): string[];
  /** Spin where it lies and land on whatever face comes up (right click). */
  rollInPlace(key: string): void;
  /** Show `face` on top straight away, without moving (the category die following the deck). */
  setFace(key: string, face: number): void;
  /** Fly to (x, y) and land on `face`. */
  home(key: string, x: number, y: number, face?: number): void;
  /** Shift these pieces by (dx, dy) where they lie (a laid card carrying what is on it). */
  nudge(keys: string[], dx: number, dy: number): void;
  hover(key: string | null): void;
  /** Ring these pieces as selected (a marquee). */
  select(keys: string[]): void;
  /** The pieces whose centres lie in this rectangle. */
  inside(r: Bounds): string[];
  /** Shake a piece where it lies, 0 still to 1 violent (a right click charging up). */
  jitter(key: string, amount: number): void;
  /** Break a piece into flying shards and take it off the table; `stay`: the shards stay lying on the felt. */
  shatter(key: string, stay?: boolean): void;
  /** A force over part of the table for `ms`. */
  field(f: Field, ms: number): void;
  /** The felt this slippery (1 normal, lower slides further) for `ms`. */
  slippery(scale: number, ms: number): void;
  /** A sudden push out from a point (negative pulls in), px/s at the centre fading to nothing at r. */
  impulse(x: number, y: number, r: number, speed: number, boost?: { gen: number; power: number }, except?: string[]): void;
  /**
   * A landed die answering its roll (owner, v0.47.11, after the phone's tray): its body washed with a colour that
   * rises, holds and fades (`peak` 0 to 1), and a swell (+`swell`, e.g. 0.38) up fast and back slowly.
   */
  wash(key: string, color: string, peak: number, holdMs: number, swell?: number): void;
  /** Stop the whole table for a beat (an impact frame). */
  freeze(ms: number): void;
  /**
   * Only these pieces move (null: everything again): the rest of the table holds still exactly as it is, mid-flight
   * and all, and carries on from there afterwards (v0.47.27: a critical's pair takes the stage). Staged pieces pass
   * through everything and keep out of nothing.
   */
  stage(keys: string[] | null): void;
  /** Hold these pieces where they lie for a while: nothing that hits them moves them (a blast that spares them). */
  pin(keys: string[], ms: number): void;
  /** Let pinned pieces go again now (Reset undoing the Key and Euryale). */
  unpin(keys: string[]): void;
  /**
   * The cards laid on the table. A card that is `phys` is a body (knocked about by dice, sliding, spinning); the
   * rest only carry what is anchored to them. Poses are the card's centre and its turn in degrees.
   */
  setCards(cards: { key: string; x: number; y: number; w: number; h: number; rot: number; phys: boolean }[]): void;
  /** A card being dragged by hand (a physical one is knocked by nothing while held), and let go with its speed. */
  holdCard(key: string, x: number, y: number, rot: number): void;
  releaseCard(key: string): void;
  /** A card carried by hand takes these pieces with it, where they lie against it, until it is let go (v0.47.17). */
  carryWith(key: string, others: string[]): void;
  /** Throw a physical card (one just thrown onto the table): false while its body does not exist yet. */
  throwCard(key: string, vx: number, vy: number, va: number): boolean;
  /** Physical cards that moved this frame, and those that came to rest (to keep). */
  onCards(cb: (moved: { key: string; x: number; y: number; rot: number }[], rested: string[]) => void): void;
  /** Tie a piece to a card at an offset from its centre (px, in the card's own frame): it never moves by physics. */
  anchor(key: string, card: string | null, lx?: number, ly?: number): void;
  /** A DOM label that rides under a die. */
  label(key: string, el: HTMLElement | null): void;
  /** Keep a DOM element at a die's centre (its fire, the deck die's arrows), or stop. */
  follow(key: string, el: HTMLElement, on: boolean): boolean;
  /** A brief glint of light over a die: a control die answering a click without moving (owner, v0.47.10). */
  flash(key: string): void;
  onImpact(cb: (i: Impact) => void): void;
  /** Called with the keys of dice that have just come to rest. */
  onRest(cb: (keys: string[]) => void): void;
  /** Paint and compile these pieces' looks ahead of time, off screen, so they cost nothing when they first appear. */
  warm(specs: DieSpec[]): void;
  dispose(): void;
}

interface ShapeModel { face: THREE.BufferGeometry; edge: THREE.BufferGeometry | null; faces: DieFace[]; inR: number; artR: number }

const COLS = 5;
const ROWS = 4;
const CELL = 128;
const CHIP_FACES: DieFace[] = [{ n: [0, 0, 1], up: [0, 1, 0] }, { n: [0, 0, -1], up: [0, 1, 0] }];
const CHIP_H = 0.26;
/**
 * The camera looks down at the table this far off vertical (radians), the same everywhere: no perspective, so a die
 * reads the same in the middle and at the edge, but tipped enough that a die shows its front as well as its top.
 * Table y is stretched by 1 / cos(TILT) in the scene so a point on the felt still lands on its own screen px.
 */
const TILT = 0.32; // v0.47.2 (owner): higher, a little less isometric, so lower edges read
const COS = Math.cos(TILT);
const SIN_TILT = Math.sin(TILT);

let models: Promise<Record<Shape, ShapeModel>> | null = null;

function loadModels(url: string): Promise<Record<Shape, ShapeModel>> {
  if (models) return models;
  models = new GLTFLoader().loadAsync(url).then((gltf) => {
    const out = {} as Record<Shape, ShapeModel>;
    gltf.scene.traverse((o) => {
      const name = o.name as Shape;
      if (!(name in FACE_COUNT) || !o.userData?.faces) return;
      let face: THREE.BufferGeometry | null = null;
      let edge: THREE.BufferGeometry | null = null;
      o.traverse((m) => {
        const mesh = m as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mat = mesh.material as THREE.Material;
        if (mat.name === 'Face') face = mesh.geometry;
        else if (mat.name === 'Edge') edge = mesh.geometry;
      });
      if (!face) return;
      out[name] = { face, edge, faces: o.userData.faces as DieFace[], inR: o.userData.inR as number, artR: o.userData.artR as number };
    });
    return out;
  });
  models.catch(() => { models = null; });
  return models;
}

/** The chip: a short cylinder lying flat, its top face mapped whole onto the first atlas cell. */
function chipModel(): ShapeModel {
  const g = new THREE.CylinderGeometry(1, 0.92, CHIP_H, 48, 1);
  g.rotateX(Math.PI / 2);
  // Map the top cap into cell 0 so a chip can carry a mark like a die face does; the rest is plain body.
  const pos = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    if (z > CHIP_H / 2 - 1e-4) uv.setXY(i, (0.5 + pos.getX(i) * 0.46) / COLS, (0.5 - pos.getY(i) * 0.46) / ROWS);
    else uv.setXY(i, 0.9 / COLS, 0.1 / ROWS);
  }
  uv.needsUpdate = true;
  return { face: g, edge: null, faces: CHIP_FACES, inR: CHIP_H / 2, artR: 0.4 };
}

/** The deck: a block of cards lying flat, its top mapped whole onto the first atlas cell (the card back). */
const DECK_ASPECT = 0.7;
const DECK_H = 0.22;
function deckModel(): ShapeModel {
  const g = new THREE.BoxGeometry(2 * DECK_ASPECT, 2, DECK_H, 1, 1, 1);
  const pos = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    if (z > DECK_H / 2 - 1e-4) uv.setXY(i, (0.5 + (pos.getX(i) / (2 * DECK_ASPECT)) * 0.98) / COLS, (0.5 - (pos.getY(i) / 2) * 0.98) / ROWS);
    else uv.setXY(i, 1.5 / COLS, 0.5 / ROWS); // the edges: the paper colour painted in cell 1
  }
  uv.needsUpdate = true;
  return { face: g, edge: null, faces: CHIP_FACES, inR: DECK_H / 2, artR: 0.45 };
}

/** Paint a die's faces into its atlas: one square cell per face, the art centred in the face's inscribed circle. */
function paintAtlas(canvas: HTMLCanvasElement, spec: DieSpec, model: ShapeModel, font: string): void {
  canvas.width = COLS * CELL;
  canvas.height = ROWS * CELL;
  const g = canvas.getContext('2d')!;
  g.fillStyle = spec.body;
  g.fillRect(0, 0, canvas.width, canvas.height);
  const n = model.faces.length;
  const r = model.artR * CELL * (spec.shape === 'd4' ? 1.3 : spec.shape === 'd8' || spec.shape === 'd20' ? 1.12 : 1);
  for (let i = 0; i < n; i++) {
    const art = spec.faces[i % Math.max(1, spec.faces.length)];
    if (!art) continue;
    const cx = (i % COLS + 0.5) * CELL;
    const cy = (Math.floor(i / COLS) + 0.5) * CELL;
    if ('text' in art) {
      if (!art.text) continue;
      const len = art.text.length;
      const size = r * (len <= 1 ? 1.5 : len === 2 ? 1.18 : 0.86);
      g.font = `${size}px ${font}`;
      g.fillStyle = spec.ink;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(art.text, cx, cy + size * 0.06);
      // 6 and 9 read the same upside down: underline them on dice big enough to carry both.
      if ((art.text === '6' || art.text === '9') && n >= 9) g.fillRect(cx - size * 0.24, cy + size * 0.5, size * 0.48, Math.max(2, size * 0.07));
    } else {
      const s = r * 1.62;
      if (art.plate) {
        g.fillStyle = art.plate;
        g.beginPath();
        g.arc(cx, cy, r * 0.98, 0, Math.PI * 2);
        g.fill();
      }
      if (art.halo) {
        // A soft dark glow behind the icon, so its own colours read on a light die without a plate.
        g.save();
        g.shadowColor = art.halo;
        g.shadowBlur = CELL * 0.09;
        g.drawImage(art.image, cx - s / 2, cy - s / 2, s, s);
        g.restore();
      }
      g.drawImage(art.image, cx - s / 2, cy - s / 2, s, s);
    }
  }
  if (spec.shape === 'chip') paintButton(g, spec.body);
  if (spec.shape === 'deck') {
    const art = spec.faces[0];
    g.fillStyle = spec.edge;
    g.fillRect(CELL, 0, CELL, CELL);
    if (art && 'image' in art) g.drawImage(art.image, 0, 0, CELL, CELL);
  }
}

/** The phone's token, as the chip's top: a darker rim, a face lit from the upper left, four stitch holes. */
function paintButton(g: CanvasRenderingContext2D, fill: string): void {
  const cx = CELL / 2, cy = CELL / 2, R = CELL * 0.46;
  g.fillStyle = shade(fill, -0.32);
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.fill();
  const grad = g.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.05, cx, cy, R * 0.95);
  grad.addColorStop(0, shade(fill, 0.45));
  grad.addColorStop(0.6, fill);
  grad.addColorStop(1, shade(fill, -0.18));
  g.fillStyle = grad;
  g.beginPath();
  g.arc(cx, cy, R * 0.86, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = shade(fill, -0.55);
  const off = R * 0.25, hole = R * 0.13;
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    g.beginPath();
    g.arc(cx + dx * off, cy + dy * off, hole, 0, Math.PI * 2);
    g.fill();
  }
}

/** A hex colour lightened (amt > 0) or darkened (amt < 0) by a share. */
function shade(hex: string, amt: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt)));
  return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
}

/**
 * A finish as materials (faces and bevels). Resin and obsidian are glassy and clear-coated, so their cut edges catch
 * the light; stone is matte; metal and gilded reflect the room; ivory is a soft polished bone.
 */
function materials(finish: Finish, body: string, edge: string, map: THREE.Texture): { face: THREE.Material; edge: THREE.Material } {
  const c = new THREE.Color(body);
  const e = new THREE.Color(edge);
  switch (finish) {
    case 'resin':
      // No transmission (v0.47.11): one see-through die made three.js draw the whole table twice a frame and rebuild its
      // shaders on both passes, and putting a hundred pieces away crawled. At table size the see-through barely showed;
      // a slightly darker body, a deep clearcoat and a faint glow of its own colour read the same.
      return {
        face: new THREE.MeshPhysicalMaterial({ map, color: new THREE.Color(0.86, 0.86, 0.86), roughness: 0.2, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.14, emissive: c, emissiveIntensity: 0.07 }),
        edge: new THREE.MeshPhysicalMaterial({ color: c.clone().multiplyScalar(0.84), roughness: 0.14, metalness: 0, clearcoat: 0.85, clearcoatRoughness: 0.1, emissive: c, emissiveIntensity: 0.08 }),
      };
    case 'stone':
      return { face: new THREE.MeshStandardMaterial({ map, roughness: 0.86, metalness: 0 }), edge: new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(1.15), roughness: 0.9, metalness: 0 }) };
    case 'metal':
      return { face: new THREE.MeshStandardMaterial({ map, roughness: 0.3, metalness: 0.95 }), edge: new THREE.MeshStandardMaterial({ color: c.clone().lerp(new THREE.Color('#ffffff'), 0.25), roughness: 0.22, metalness: 1 }) };
    case 'obsidian':
      return {
        face: new THREE.MeshPhysicalMaterial({ map, roughness: 0.4, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.3, envMapIntensity: 0.6 }),
        // A faint glow keeps the whole gold outline visible, even the lower edges the lamp never reaches.
        edge: new THREE.MeshStandardMaterial({ color: e, roughness: 0.28, metalness: 0.95, emissive: e, emissiveIntensity: 0.22 }),
      };
    case 'gilded':
      return { face: new THREE.MeshStandardMaterial({ map, roughness: 0.26, metalness: 0.9 }), edge: new THREE.MeshStandardMaterial({ color: e, roughness: 0.2, metalness: 1, emissive: e, emissiveIntensity: 0.2 }) };
    case 'ivory':
      return {
        face: new THREE.MeshPhysicalMaterial({ map, roughness: 0.42, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.3, sheen: 0.3 }),
        edge: new THREE.MeshStandardMaterial({ color: e, roughness: 0.4, metalness: 0.6, emissive: e, emissiveIntensity: 0.15 }),
      };
  }
}

export async function createDiceEngine(canvas: HTMLCanvasElement, opts: { modelUrl: string; font: string }): Promise<DiceEngine> {
  const shapes = await loadModels(opts.modelUrl);
  const chip = chipModel();
  const deck = deckModel();
  // The Void's mimic (v0.47.12): modelled in Blender (scripts/blender/make_mimic.py), its own materials, a lid that opens.
  const mimicModel: ShapeModel = { face: new THREE.BufferGeometry(), edge: null, faces: CHIP_FACES, inR: 0.5, artR: 0.4 };
  const chests: Record<Modeled, THREE.Object3D | null> = { mimic: null, chest: null, dicechest: null, tokenchest: null, mine: null };
  // Loaded before the engine is ready (small files), so a chest in the supply is never drawn as the plain stand-in.
  await Promise.all(MODELED.map((k) => new GLTFLoader().loadAsync(`/models/${k}.glb`).then((g) => { chests[k] = g.scene; }).catch(() => { /* drawn as a plain chest */ })));
  const modelOf = (shape: DieSpec['shape']) => (shape === 'chip' ? chip : shape === 'deck' ? deck : isModeled(shape) ? mimicModel : shapes[shape]);
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  if (typeof __DEV__ !== 'undefined' && __DEV__) (globalThis as { __rkThree?: unknown }).__rkThree = { renderer, get scene() { return scene; } };
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.5;
  // The room is built Y-up and the table is Z-up: turn it so its ceiling is overhead, not where flat tops reflect.
  scene.environmentRotation.set(Math.PI / 2, 0, 0);
  pmrem.dispose();
  // Warm bounce from the felt below, so the faces turned towards the camera never go black.
  scene.add(new THREE.HemisphereLight(0xfff1dc, 0x3a3226, 0.95));
  // One lamp to the left, so every die casts the same short shadow to the right.
  const sun = new THREE.DirectionalLight(0xfff4e6, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.5;
  scene.add(sun, sun.target);
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.42, color: 0x000000 }));
  catcher.receiveShadow = true;
  // The floor only catches shadows: it never hides the lower edges of what stands on it.
  (catcher.material as THREE.Material).depthWrite = false;
  catcher.renderOrder = -1;
  scene.add(catcher);
  // Orthographic and tipped by TILT: no perspective skew anywhere on the table (owner, v0.47.1).
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 8000);
  camera.position.set(0, -3000 * Math.sin(TILT), 3000 * Math.cos(TILT));
  camera.lookAt(0, 0, 0);
  const wallGroup = new THREE.Group();
  scene.add(wallGroup);

  let W = 1;
  let H = 1;
  let bounds: Bounds = { left: 0, top: 0, right: 1, bottom: 1 };
  let obstacles: Obstacle[] = [];
  /** The layout's obstacles, and ones that move on their own (the physical carousel), merged into `obstacles`. */
  let fixedObs: Obstacle[] = [];
  const movingObs = new Map<string, Obstacle>();
  const mergeObs = () => { obstacles = movingObs.size ? [...fixedObs, ...movingObs.values()] : fixedObs; };
  /** Pieces the moving carousel slid along, to be reported as rested once it stops. */
  const nudged = new Set<string>();
  let nudgeTimer: ReturnType<typeof setTimeout> | undefined;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  interface Die { spec: DieSpec; body: Body; group: THREE.Group; tex: THREE.CanvasTexture; mats: THREE.Material[]; scale: number; label: HTMLElement | null; labelW: number; wasAsleep: boolean; ring: THREE.Mesh | null; jitter: number; anchor: { card: string; lx: number; ly: number } | null; vanish: 'waiting' | 'flying' | null; follow: HTMLElement[]; glint: number; look: string; tether: { b: Body; dx: number; dy: number; orbit?: number; pair?: boolean }[] | null; lid: THREE.Object3D | null; mouth: number; mouthNow: number; /** A mine's lamp and how fast it blinks (v0.50.6). */ lamp: THREE.MeshStandardMaterial | null; blink: number; /** A thrown die's hop (v0.47.28), drawn only: px up, px/s, and its own fall (px/s², the leap's slow one). */ hopZ?: number; hopV?: number; hopG?: number; wash: { color: THREE.Color; peak: number; t0: number; hold: number; swell: number; own: Map<THREE.Material, THREE.Material> } | null }
  /** The cards on the table: a physical one is a body, the rest are where they lie. */
  const cards = new Map<string, { x: number; y: number; w: number; h: number; a: number; body: Body | null; was: boolean; samples: { x: number; y: number; t: number }[]; /** A swing building in the hand (v0.47.25), as a die's does: 0 to 2. */ swing?: number; hand?: number; st?: number }>();
  let cardsCb: (moved: { key: string; x: number; y: number; rot: number }[], rested: string[]) => void = () => {};
  const fields: { f: Field; until: number }[] = [];
  let slip = { scale: 1, until: 0 };
  /** Shards of a shattered piece: flying, falling, fading. */
  /** `stay` (v0.50.6, a big mine's blast): it falls, settles and lies there until `clearShards`. */
  const shards: { mesh: THREE.Mesh; vx: number; vy: number; vz: number; spin: THREE.Vector3; born: number; z: number; x: number; y: number; size: number; stay?: boolean }[] = [];
  /** Shards from a big blast that have settled: still drawn, no longer moved. */
  const kept: typeof shards = [];
  // One shard shape and one material per colour, compiled before the first break (owner, v0.47.12: a burning throw
  // hung in mid-air while a dozen new materials were built and compiled on its first hit).
  const shardGeo = new THREE.TetrahedronGeometry(1);
  const shardMats = new Map<string, THREE.MeshStandardMaterial>();
  const shardMat = (c: string) => {
    let m = shardMats.get(c);
    if (!m) { m = new THREE.MeshStandardMaterial({ color: new THREE.Color(c), roughness: 0.35, metalness: 0.2 }); shardMats.set(c, m); }
    return m;
  };
  {
    // Compile the shard program now, while nothing is moving.
    const warm = new THREE.Mesh(shardGeo, shardMat('#808080'));
    scene.add(warm);
    renderer.compile(scene, camera);
    scene.remove(warm);
  }
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xe0b563, transparent: true, opacity: 0.85, depthWrite: false });
  const ringGeo = new THREE.RingGeometry(1.08, 1.22, 48);
  const dice = new Map<string, Die>();
  const order: Die[] = [];
  let hovered: string | null = null;
  let held: { die: Die; ox: number; oy: number; samples: { x: number; y: number; t: number }[] } | null = null;
  let impactCb: (i: Impact) => void = () => {};
  let breakCb: (keys: string[], at: { x: number; y: number }, fire: boolean, first: boolean, hits: Impact[]) => void = () => {};
  let hitStopCb: (at: { x: number; y: number }, ms: number, strong: boolean, cold?: boolean) => void = () => {};
  let poundCb: (key: string, at: { x: number; y: number }) => void = () => {};
  /** A burning throw's first hit, held (see onHitStop). */
  let hitstop: { by: string; target: string; until: number; at: { x: number; y: number }; vx: number; vy: number; speed: number; strong: boolean; byFixed: boolean; cold?: boolean; strike?: boolean; fire?: boolean } | null = null;
  const HITSTOP_MS = 1500;
  const auras = new Map<string, Field>();
  const cages = new Map<string, Cage>();
  let contrary = false;
  const broke: Impact[] = [];
  /** Burning throws that have had their impact frame already. */
  const brokeOnce = new Set<string>();
  /** The selection a card carried by hand takes with it. */
  let cardCarry: { lead: string; others: { b: Body; dx: number; dy: number }[] } | null = null;
  let freezeUntil = 0;
  /** This frame's length (s), and whether any die is still in the air from a throw's hop. */
  let frameDt = 0;
  let hopping = false;
  /**
   * Every throw and roll (owner, v0.47.28: they could be steered): the die hops up as high as it was thrown hard,
   * and turns about an axis of its own, as fast as it was thrown, the way it was thrown only in small part.
   */
  const throwSpin = (vx: number, vy: number, r: number, speed: number, more = 1): [number, number, number] => {
    const th = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s0 = Math.sqrt(1 - u * u);
    // Even a soft roll spins up well (owner, v0.47.29: a gentle one could still be placed); harder, faster still.
    const m = (18 + speed * 0.022) * (0.7 + Math.random() * 0.6) * more;
    return [(vy / r) * 0.35 + s0 * Math.cos(th) * m, (vx / r) * 0.35 + s0 * Math.sin(th) * m, u * m * 0.6];
  };
  /** `higher` scales the hop's height (its speed up by the root of it). */
  const hop = (d: Die | undefined, speed: number, higher = 1) => {
    if (!d || d.body.box || d.spec.shape === 'chip') return;
    const k = Math.sqrt(higher);
    d.hopV = Math.min(1400 * k, (340 + speed * 0.24 * (0.7 + Math.random() * 0.6)) * k);
    d.hopZ = d.hopZ ?? 0;
  };
  /** While set, the only pieces that move (see `stage`). */
  let staged: Set<string> | null = null;
  let restCb: (keys: string[]) => void = () => {};

  function resize(w: number, h: number) {
    W = Math.max(1, w);
    H = Math.max(1, h);
    renderer.setSize(W, H, false);
    camera.left = -W / 2;
    camera.right = W / 2;
    camera.top = H / 2;
    camera.bottom = -H / 2;
    camera.updateProjectionMatrix();
    catcher.scale.set(W * 1.2, (H * 1.2) / COS, 1);
    // From the left and only a little above the camera's line, so a flat top never mirrors the lamp straight back.
    sun.position.set(-W * 0.55, (H * 0.06) / COS, 1300);
    const sc = sun.shadow.camera;
    sc.left = -W / 2 - 200;
    sc.right = W / 2 + 200;
    sc.top = H / COS / 2 + 200;
    sc.bottom = -H / COS / 2 - 200;
    sc.near = 100;
    sc.far = 5000;
    sc.updateProjectionMatrix();
    wake();
  }

  /** How big a piece is drawn: a touch bigger hovered or held, shrinking away as it is put away. */
  /** Where a wash is: its glow (0 to 1), the swell on the die's size, and whether it is over. */
  function washNow(d: Die): { glow: number; grow: number; done: boolean } {
    const w = d.wash;
    if (!w) return { glow: 0, grow: 1, done: false };
    const t = performance.now() - w.t0;
    const RISE = 240, FADE = 380;
    const glow = w.peak * (t < RISE ? t / RISE : t < RISE + w.hold ? 1 : Math.max(0, 1 - (t - RISE - w.hold) / FADE));
    // The swell: up in 220 ms (ease out), back in 460 ms (ease in-out), as the phone's tray does it.
    const up = 220, down = 460;
    const s = t < up ? 1 - Math.pow(1 - t / up, 2) : t < up + down ? 0.5 + 0.5 * Math.cos(((t - up) / down) * Math.PI) : 0;
    return { glow, grow: 1 + w.swell * s, done: t > RISE + w.hold + FADE && t > up + down };
  }
  function endWash(d: Die) {
    const w = d.wash;
    if (!w) return;
    d.wash = null;
    d.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { const back = [...w.own.entries()].find(([, c]) => c === m.material)?.[0]; if (back) m.material = back; } });
    for (const c of w.own.values()) c.dispose();
  }

  function scaleOf(d: Die): number {
    if (d.vanish === 'flying') return d.body.home ? 1 - 0.9 * Math.max(0, (d.body.home.t - 0.4) / 0.6) : 0.1;
    return d.body.held ? 1.05 : hovered === d.spec.key ? 1.03 : 1;
  }

  function sync(d: Die) {
    const b = d.body;
    const model = modelOf(d.spec.shape);
    const rad = d.spec.size / 2;
    // A light touch on hover, so the die's outline never grows past itself (owner, v0.47.2).
    const target = scaleOf(d);
    d.scale += (target - d.scale) * 0.25;
    d.group.scale.setScalar(rad * d.scale * washNow(d).grow);
    const jx = d.jitter ? (Math.random() - 0.5) * d.jitter * rad * 0.5 : 0;
    const jy = d.jitter ? (Math.random() - 0.5) * d.jitter * rad * 0.5 : 0;
    // A throw's hop: up and back down with a bounce, drawn only (the dice never leave the felt for each other).
    if (d.hopV || d.hopZ) {
      d.hopV = (d.hopV ?? 0) - (d.hopG ?? 3400) * frameDt;
      d.hopZ = (d.hopZ ?? 0) + d.hopV * frameDt;
      if (d.hopZ <= 0) { d.hopZ = 0; d.hopG = undefined; d.hopV = d.hopV < -280 ? -d.hopV * 0.3 : 0; }
      hopping = true;
    }
    d.group.position.set(b.x - W / 2 + jx, (H / 2 - b.y + jy) / COS, model.inR * rad + b.z + (d.hopZ ?? 0) + (b.held ? 6 : 0));
    d.group.quaternion.set(b.q[0], b.q[1], b.q[2], b.q[3]);
    if (d.jitter > 0.02) d.group.rotateZ((Math.random() - 0.5) * d.jitter * 0.5);
    for (const f of d.follow) f.style.transform = `translate(${(b.x + jx).toFixed(1)}px, ${(b.y + jy - b.z * 0.4).toFixed(1)}px)`;
    if (d.wash) {
      // The wash: the die wears its own copies of its materials while it glows, so the dice sharing its look stay dark.
      const w = washNow(d);
      for (const m of d.wash.own.values() as Iterable<THREE.Material & { emissive?: THREE.Color; emissiveIntensity?: number; userData: { e?: THREE.Color; ei?: number } }>) {
        if (!m.emissive) continue;
        m.emissive.copy(m.userData.e!).lerp(d.wash.color, w.glow);
        m.emissiveIntensity = (m.userData.ei ?? 1) + w.glow * 0.75;
      }
      if (w.done) endWash(d);
    }
    if (d.glint > 0) {
      // The glint: the die's own emissive lifted towards white, fading.
      d.glint = d.glint < 0.02 ? 0 : d.glint * 0.86;
      for (const m of d.mats as (THREE.Material & { emissive?: THREE.Color; emissiveIntensity?: number; userData: { e?: THREE.Color; ei?: number } })[]) {
        if (!m.emissive) continue;
        if (!m.userData.e) { m.userData.e = m.emissive.clone(); m.userData.ei = m.emissiveIntensity ?? 1; }
        m.emissive.copy(m.userData.e).lerp(new THREE.Color(0xfff2d0), d.glint);
        m.emissiveIntensity = (m.userData.ei ?? 1) + d.glint * 0.9;
      }
    }
    if (d.lid) {
      // The mimic breathes (owner, v0.47.12): its lid lifts a crack and settles, slowly, unless it is opened wide.
      const breath = 0.04 + 0.1 * (0.5 + 0.5 * Math.sin(performance.now() / 1000 * 1.25 + b.x * 0.01));
      d.mouthNow += (d.mouth - d.mouthNow) * 0.14;
      d.lid.rotation.x = -Math.max(d.mouthNow, breath) * 1.15;
    }
    if (d.lamp) {
      // Hard on and off, like a warning light, not a soft pulse.
      const on = !d.blink || Math.sin(performance.now() / 1000 * d.blink * Math.PI * 2) > 0;
      d.lamp.emissiveIntensity = on ? 7 : 0.15;
    }
    if (d.ring) {
      d.ring.position.set(b.x - W / 2, (H / 2 - b.y) / COS, 1);
      d.ring.scale.set(rad * 1.05, (rad * 1.05) / COS, 1);
    }
    if (d.label) {
      // Kept inside the table: a die against the edge still has its whole label, and goes over the die at the bottom.
      const half = (d.labelW || 60) / 2;
      const sx = Math.min(W - half - 4, Math.max(half + 4, b.x));
      let sy = b.y + rad * 1.02 + 4;
      if (sy > H - 18) sy -= rad * 2.04 + 26;
      d.label.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translateX(-50%)`;
    }
  }

  let raf = 0;
  let frameNo = 0;
  let last = 0;
  let acc = 0;
  /** Inside a frame: anything asking for the next one waits for the frame's own request at its end. */
  let inFrame = false;
  let woke = false;
  function wake() {
    // v0.47.12: a wake from inside a frame (the Hope and Fear tether following every frame) used to queue a second
    // callback beside the frame's own, doubling them every frame: the lag when a pair was picked up, and a freeze when
    // a whole selection was carried.
    if (inFrame) { woke = true; return; }
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function frame(t: number) {
    raf = 0;
    inFrame = true;
    woke = false;
    try { frameBody(t); } finally { inFrame = false; }
  }
  function frameBody(t: number) {
    frameDt = Math.min(0.05, Math.max(0, (t - last) / 1000));
    hopping = false;
    acc += Math.min(0.05, (t - last) / 1000);
    last = t;
    const now = performance.now();
    for (let i = fields.length - 1; i >= 0; i--) if (fields[i].until < now) fields.splice(i, 1);
    if (hitstop && now >= hitstop.until) endHitStop();
    const world = { fields: [...fields.map((f) => f.f), ...auras.values()], friction: slip.until > now ? slip.scale : 1, cages: [...cages.values()] };
    const all = [...order.map((d) => d.body), ...cardBodies()];
    const bodies = staged ? all.filter((b) => staged!.has(b.key)) : all;
    let steps = 0;
    while (acc >= STEP && steps++ < 12) {
      placeAnchored();
      if (now < freezeUntil) { acc = 0; break; }
      for (const hit of step(bodies, bounds, STEP, Math.random, staged ? [] : obstacles, staged ? {} : world)) {
        if (hit.kind === 'break') { broke.push(hit); continue; }
        if (hit.kind === 'pound') { const b = bodyOf(hit.key); if (b) poundCb(hit.key, { x: b.x, y: b.y }); continue; }
        impactCb(hit);
      }
      acc -= STEP;
    }
    if (broke.length) {
      const first = broke[0];
      const burning = broke.some((h) => h.fire);
      const sb = bodyOf(first.by ?? ''), tb = bodyOf(first.key);
      // A burning throw's (or an aimed strike's) first hit holds the thrower and its target where they met (an impact frame).
      if ((first.fire || first.strike) && !first.scorch && !brokeOnce.has(first.by ?? '') && !hitstop && sb && tb) {
        brokeOnce.add(first.by!);
        broke.shift();
        tb.broken = false;
        const strong = first.speed > 4500;
        hitstop = { by: first.by!, target: first.key, until: now + HITSTOP_MS, at: { x: tb.x, y: tb.y }, vx: sb.vx, vy: sb.vy, speed: first.speed, strong, byFixed: !!sb.fixed, cold: !!first.cold, strike: !!first.strike, fire: !!first.fire };
        for (const b of [sb, tb]) { b.vx = b.vy = 0; b.fixed = true; }
        for (const k of [first.by!, first.key]) { const d = dice.get(k); if (d) d.jitter = 0.55; }
        if (strong) freezeUntil = hitstop.until;
        hitStopCb(hitstop.at, HITSTOP_MS, strong, !!first.cold);
      }
      if (broke.length) {
        const at = bodyOf(broke[0].key) ?? { x: 0, y: 0 };
        const hits = broke.splice(0);
        const keys = hits.map((h) => h.key);
        for (const k of keys) engine.shatter(k);
        breakCb(keys, { x: at.x, y: at.y }, burning, false, hits);
      }
    }
    placeAnchored();
    followTether();
    // Physical cards: report where they went, and which have stopped (to keep).
    const movedCards: { key: string; x: number; y: number; rot: number }[] = [];
    const restedCards: string[] = [];
    for (const [k, c] of cards) {
      const b = c.body;
      if (!b || b.broken) continue;
      const moved = Math.abs(b.x - c.x) > 0.05 || Math.abs(b.y - c.y) > 0.05 || Math.abs((b.a ?? 0) - c.a) > 0.0005;
      if (moved) { c.x = b.x; c.y = b.y; c.a = b.a ?? 0; movedCards.push({ key: k, x: b.x, y: b.y, rot: (c.a * 180) / Math.PI }); }
      const asleep = b.asleep && !b.held;
      if (asleep && !c.was) restedCards.push(k);
      c.was = asleep;
    }
    if (movedCards.length || restedCards.length) cardsCb(movedCards, restedCards);
    // Shards fly out, fall and fade.
    for (let i = shards.length - 1; i >= 0; i--) {
      const sh = shards[i];
      const age = (now - sh.born) / 1000;
      const sdt = 1 / 60;
      sh.x += sh.vx * sdt; sh.y += sh.vy * sdt; sh.vz -= 2600 * sdt; sh.z = Math.max(0, sh.z + sh.vz * sdt);
      if (sh.z === 0) { sh.vz *= -0.3; sh.vx *= 0.8; sh.vy *= 0.8; }
      sh.mesh.position.set(sh.x - W / 2, (H / 2 - sh.y) / COS, sh.z + 3);
      sh.mesh.rotation.x += sh.spin.x * sdt; sh.mesh.rotation.y += sh.spin.y * sdt; sh.mesh.rotation.z += sh.spin.z * sdt;
      if (sh.stay) {
        // Kept inside the table, spinning down as it settles; once still it is left out of the frame loop.
        sh.x = Math.min(W - 6, Math.max(6, sh.x)); sh.y = Math.min(H - 6, Math.max(6, sh.y));
        if (sh.z === 0) sh.spin.multiplyScalar(0.8);
        if (age > 2.5) { sh.mesh.position.set(sh.x - W / 2, (H / 2 - sh.y) / COS, 3); kept.push(sh); shards.splice(i, 1); }
        continue;
      }
      // Shrinking away rather than fading: every shard shares one geometry and one opaque material per colour.
      sh.mesh.scale.setScalar(sh.size * Math.max(0.001, 1 - Math.max(0, age - 0.5) / 0.7));
      if (age > 1.2) { scene.remove(sh.mesh); shards.splice(i, 1); }
    }
    let easing = false;
    const rested: string[] = [];
    const gone: string[] = [];
    // Label widths are read in one pass, before any label moves, so measuring never forces a layout per die.
    if (++frameNo % 30 === 1) for (const d of order) d.labelW = d.label?.offsetWidth ?? 0;
    for (const d of order) {
      sync(d);
      if (Math.abs(d.scale - scaleOf(d)) > 0.002 || d.glint > 0 || d.wash || d.lid || d.blink) easing = true;
      if (d.vanish === 'flying' && !d.body.home) gone.push(d.spec.key);
      const asleep = d.body.asleep && !d.body.held;
      if (asleep && !d.wasAsleep) rested.push(d.spec.key);
      d.wasAsleep = asleep;
    }
    for (const k of gone) engine.remove(k);
    renderer.render(scene, camera);
    if (rested.length) restCb(rested.filter((k) => dice.has(k)));
    const jittering = order.some((d) => d.jitter > 0);
    if (!allAsleep(bodies) || hopping || easing || held || shards.length || fields.length || auras.size || hitstop || jittering || slip.until > now || woke) raf = requestAnimationFrame(frame);
  }

  /**
   * One look (its atlas texture and materials) per distinct look, shared by every piece wearing it (v0.47.11, owner:
   * a table of tokens built a 640 x 512 texture per token, a hundred of them, and putting them away crawled). Counted,
   * so a look is freed when the last piece wearing it goes.
   */
  const looks = new Map<string, { tex: THREE.CanvasTexture; mats: THREE.Material[]; refs: number }>();
  const imageIds = new WeakMap<object, number>();
  let nextImage = 0;
  const lookKey = (spec: DieSpec) => JSON.stringify([spec.shape, spec.body, spec.edge, spec.ink, spec.finish, spec.faces.map((f) => ('text' in f ? f.text : `img${imageIds.get(f.image as object) ?? (imageIds.set(f.image as object, ++nextImage), nextImage)}:${f.plate ?? ''}:${f.halo ?? ''}`))]);
  const noTex = new THREE.CanvasTexture(document.createElement('canvas'));
  /** A plain chest, for when the mimic's model could not be loaded. */
  function plainChest(): THREE.Object3D {
    const root = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b3f1f, roughness: 0.7 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 0.6), wood);
    base.position.z = -0.2;
    const lid = new THREE.Group();
    lid.name = 'Lid';
    lid.position.set(0, 0.55, 0.1);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.64, 1.14, 0.4), wood);
    top.position.set(0, -0.55, 0.2);
    lid.add(top);
    root.add(base, lid);
    return root;
  }
  function visuals(spec: DieSpec): { group: THREE.Group; tex: THREE.CanvasTexture; mats: THREE.Material[]; look: string; lid: THREE.Object3D | null; lamp: THREE.MeshStandardMaterial | null } {
    if (isModeled(spec.shape)) {
      const group = new THREE.Group();
      const m = (chests[spec.shape] ?? plainChest()).clone(true);
      let lamp: THREE.MeshStandardMaterial | null = null;
      m.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        // A mine wears its own shell colour and lamp (clones share materials, so these are copied per mine).
        if (spec.shape !== 'mine') return;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat.name === 'Shell') {
          const own = mat.clone();
          own.color.set(spec.body);
          if (spec.finish === 'metal') { own.metalness = 0.95; own.roughness = 0.28; }
          mesh.material = own;
        } else if (mat.name === 'Lamp') {
          lamp ??= mat.clone();
          mesh.material = lamp;
        }
      });
      group.add(m);
      scene.add(group);
      return { group, tex: noTex, mats: [], look: '', lid: m.getObjectByName('Lid') ?? null, lamp };
    }
    const model = modelOf(spec.shape);
    const look = lookKey(spec);
    let shared = looks.get(look);
    if (!shared) {
      const canvasEl = document.createElement('canvas');
      paintAtlas(canvasEl, spec, model, opts.font);
      const tex = new THREE.CanvasTexture(canvasEl);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = false;
      tex.anisotropy = Math.min(8, maxAniso);
      const mm = materials(spec.finish, spec.body, spec.edge, tex);
      shared = { tex, mats: [mm.face, mm.edge], refs: 0 };
      looks.set(look, shared);
    }
    if (shared.refs === 0) { const i = spare.indexOf(look); if (i >= 0) spare.splice(i, 1); }
    shared.refs++;
    const tex = shared.tex;
    const m = { face: shared.mats[0], edge: shared.mats[1] };
    const group = new THREE.Group();
    const parts: [THREE.BufferGeometry | null, THREE.Material][] = [[model.face, m.face], [model.edge, m.edge]];
    for (const [geo, mat] of parts) {
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, mat);
      // A token lies flat and its shadow is a sliver: not worth a shadow pass per token.
      mesh.castShadow = spec.shape !== 'chip';
      group.add(mesh);
    }
    scene.add(group);
    return { group, tex, mats: [m.face, m.edge], look, lid: null, lamp: null };
  }

  /**
   * Looks no die wears any more, kept a while (owner, v0.47.22: the chest stalled on every open, each time painting
   * its dice's faces again and compiling their shaders again, as the last ones had been thrown away). Oldest first.
   */
  const spare: string[] = [];
  function dropVisuals(d: Die) {
    scene.remove(d.group);
    releaseLook(d.look);
  }
  function releaseLook(look: string) {
    const shared = looks.get(look);
    if (!shared || --shared.refs > 0) return;
    spare.push(look);
    while (spare.length > 40) {
      const old = spare.shift()!;
      const sh = looks.get(old);
      if (!sh || sh.refs > 0) continue;
      looks.delete(old);
      sh.tex.dispose();
      for (const m of sh.mats) m.dispose();
    }
  }

  /** A piece or a physical card by key. */
  function bodyOf(key: string): Body | null {
    return dice.get(key)?.body ?? cards.get(key)?.body ?? null;
  }

  function cardBodies(): Body[] {
    return [...cards.values()].flatMap((c) => (c.body && !c.body.broken ? [c.body] : []));
  }

  /** The held burning hit lets go: its target breaks, a gust throws what is near, the thrower goes on faster. */
  function endHitStop() {
    const h = hitstop;
    if (!h) return;
    hitstop = null;
    const sb = bodyOf(h.by), tb = bodyOf(h.target);
    for (const k of [h.by, h.target]) { const d = dice.get(k); if (d) d.jitter = 0; }
    if (sb) { sb.fixed = h.byFixed; sb.asleep = false; sb.vx = h.vx * 1.6; sb.vy = h.vy * 1.6; }
    if (tb) { tb.fixed = false; tb.broken = true; }
    // A held hit is a critical one (v0.47.18): a card it breaks is split into pieces, never burnt whole.
    const hit: Impact = { key: h.target, speed: h.speed, kind: 'break', by: h.by, fire: !!h.fire, strike: true, cold: h.cold, vx: h.vx, vy: h.vy };
    engine.shatter(h.target);
    breakCb([h.target], h.at, !!h.fire, true, [hit]);
    // Only what lies loose is thrown (v0.47.18: the gust sent the control dice and the supply flying).
    engine.impulse(h.at.x, h.at.y, 460, 4600, { gen: 2, power: 2 }, [h.by, ...order.map((d) => d.spec.key).filter((k) => !/^(free|roll):/.test(k))]);
  }

  /**
   * Where a piece carried by hand may go with the Donjon's cages down (owner, v0.47.16): what is outside stops at the
   * bars instead of passing in, and what is inside stays in, as physics keeps them.
   */
  function caged(b: Body, x: number, y: number): [number, number] {
    for (const c of cages.values()) {
      const dx = x - c.x, dy = y - c.y;
      const d = Math.hypot(dx, dy) || 1;
      const inside = c.inside.has(b.key);
      const edge = inside ? c.r - b.r : c.r + b.r;
      if (inside ? d > edge : d < edge) { x = c.x + (dx / d) * edge; y = c.y + (dy / d) * edge; }
    }
    return [x, y];
  }

  /** Where the hand's piece was last frame, the ring's turn, and when it last turned (for the carried bundle). */
  let tetherPrev: { body: Body; x: number; y: number; t: number } | null = null;
  let orbitA = 0;
  /** The held piece's partners glide along with it (Hope and Fear, owner v0.47.11; a carried selection, v0.47.12). */
  function followTether() {
    const list = held?.die.tether;
    if (!held || !list) { tetherPrev = null; return; }
    const hb = held.die.body;
    // First the whole bundle moves with the hand, rigidly, so a fast swing never leaves it behind in a pile (owner,
    // v0.47.17); then each eases onto its place on the ring.
    const now = performance.now();
    const prev = tetherPrev?.body === hb ? tetherPrev : null;
    const mx = prev ? hb.x - prev.x : 0, my = prev ? hb.y - prev.y : 0;
    const dt = prev ? Math.min(0.05, (now - prev.t) / 1000) : 0;
    tetherPrev = { body: hb, x: hb.x, y: hb.y, t: now };
    // The ring turns while the hand is slow and stops as it speeds up to throw.
    const hand = dt > 0 ? Math.hypot(mx, my) / dt : 0;
    orbitA += dt * 3 * (1 - Math.min(1, hand / 1200));
    // Dice circle the hand; cards carried along keep where they lay against it.
    const circling = list.filter((t) => t.orbit !== undefined);
    // A held pair is the middle (owner, v0.47.18): the ring goes round both halves, wider.
    const pair = list.find((t) => t.pair);
    const cx = pair ? pair.dx / 2 : 0, cy = pair ? pair.dy / 2 : 0;
    const core = pair ? Math.hypot(cx, cy) + Math.max(hb.r, pair.b.r) : hb.r;
    // The rings (owner, v0.47.29: one ring grew past the screen for a big selection): the first hugs the hand, and
    // each one full, the rest go round it in the next, shoulder to shoulder, every other ring turning the other way.
    const n = Math.max(1, circling.length);
    const big = Math.max(0, ...circling.map((t) => t.b.r));
    const r0 = core + big + (pair ? 12 : 6), pitch = 2 * big + 4;
    const slots: { r: number; a: number }[] = [];
    for (let k = 0, left = n; left > 0; k++) {
      const r = r0 + k * (2 * big + 6);
      const m = Math.min(left, Math.max(1, Math.floor((2 * Math.PI * r) / pitch)));
      const turn = orbitA * (k % 2 ? -0.7 : 1) + k * 0.4;
      for (let j = 0; j < m; j++) slots.push({ r, a: turn + (j / m) * Math.PI * 2 });
      left -= m;
    }
    for (const t of list) {
      const pb = t.b;
      pb.x += mx;
      pb.y += my;
      const sl = t.orbit === undefined ? null : slots[t.orbit] ?? slots[slots.length - 1];
      const ox = sl ? cx + Math.cos(sl.a) * sl.r : t.dx;
      const oy = sl ? cy + Math.sin(sl.a) * sl.r : t.dy;
      const [tx, ty] = caged(pb, Math.min(bounds.right - pb.r, Math.max(bounds.left + pb.r, hb.x + ox)), Math.min(bounds.bottom - pb.r, Math.max(bounds.top + pb.r, hb.y + oy)));
      pb.x += (tx - pb.x) * 0.3;
      pb.y += (ty - pb.y) * 0.3;
    }
    wake();
  }

  /** Pieces tied to a card sit where the card says, before every step: physics never moves them. */
  function placeAnchored() {
    for (const d of order) {
      const an = d.anchor;
      if (!an || d.body.held) continue;
      const c = cards.get(an.card);
      if (!c) continue;
      const a = c.body ? c.body.a ?? 0 : c.a;
      const cx = c.body ? c.body.x : c.x, cy = c.body ? c.body.y : c.y;
      d.body.x = cx + an.lx * Math.cos(a) - an.ly * Math.sin(a);
      d.body.y = cy + an.lx * Math.sin(a) + an.ly * Math.cos(a);
      d.body.ghost = !!c.body;
      d.body.fixed = true;
    }
  }

  function setRing(d: Die, on: boolean) {
    if (on && !d.ring) {
      d.ring = new THREE.Mesh(ringGeo, ringMat);
      d.ring.renderOrder = -0.5;
      scene.add(d.ring);
      sync(d);
    } else if (!on && d.ring) {
      scene.remove(d.ring);
      d.ring = null;
    }
  }

  const engine: DiceEngine = {
    resize,
    setBounds(b) {
      bounds = b;
      // Walls that grew (another table preset) must not leave anything resting inside them: wake it and pull it in.
      for (const d of order) {
        const bd = d.body;
        if (bd.held || bd.fixed) continue;
        const r = bd.box ? Math.min(bd.box.w, bd.box.h) / 2 : bd.r;
        const nx = Math.min(b.right - r, Math.max(b.left + r, bd.x)), ny = Math.min(b.bottom - r, Math.max(b.top + r, bd.y));
        if (nx !== bd.x || ny !== bd.y) { bd.x = nx; bd.y = ny; bd.asleep = false; bd.settle = undefined; }
      }
      for (const c of cards.values()) if (c.body) c.body.asleep = false;
      wake();
    },
    setObstacle(id, o) {
      const was = movingObs.get(id);
      if (o) movingObs.set(id, { ...o, id }); else movingObs.delete(id);
      mergeObs();
      if (!o || o.only === 'cards') return;
      // Resting pieces it moves onto are carried along with it, frame by frame (owner, v0.47.26: knocked loose by it
      // they stuttered): slid straight out of its way in the direction it moves, still asleep, no bounce. A piece on
      // the move meets it through the physics as before.
      const dir = was ? Math.sign(o.top - was.top) : 0;
      let moved = false;
      for (const d of order) {
        const b = d.body;
        if (!b.asleep || b.fixed || b.held || b.box || b.ghost || d.vanish) continue;
        if (b.x + b.r <= o.left || b.x - b.r >= o.right || b.y + b.r <= o.top || b.y - b.r >= o.bottom) continue;
        // Out the side it is being pushed from: ahead of the obstacle as it goes, else the nearer face.
        const toTop = dir < 0 || (dir === 0 && b.y < (o.top + o.bottom) / 2);
        const ny = toTop ? o.top - b.r - 0.5 : o.bottom + b.r + 0.5;
        b.y = Math.min(bounds.bottom - b.r, Math.max(bounds.top + b.r, ny));
        nudged.add(d.spec.key);
        moved = true;
      }
      if (!moved) return;
      wake();
      // Where they came to lie is told once the carousel is still again, not every frame.
      clearTimeout(nudgeTimer);
      nudgeTimer = setTimeout(() => { const ks = [...nudged].filter((k) => dice.has(k)); nudged.clear(); if (ks.length) restCb(ks); }, 250);
    },
    setObstacles(o) {
      fixedObs = o;
      mergeObs();
      // A die already lying where an area now is gets pushed off it.
      for (const d of order) {
        const b = d.body;
        if (o.some((r) => b.x + b.r > r.left && b.x - b.r < r.right && b.y + b.r > r.top && b.y - b.r < r.bottom)) b.asleep = false;
      }
      wake();
    },
    setWalls(kind, rect, th) {
      for (const c of [...wallGroup.children]) {
        wallGroup.remove(c);
        const mesh = c as THREE.Mesh;
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
      if (kind === 'stone' || kind === 'brass') {
        const mat = kind === 'stone'
          ? new THREE.MeshStandardMaterial({ color: '#2b2f37', roughness: 0.92, metalness: 0 })
          : new THREE.MeshStandardMaterial({ color: '#C8923A', roughness: 0.3, metalness: 1 });
        const h = kind === 'stone' ? 22 : 10;
        const w = rect.right - rect.left, hh = rect.bottom - rect.top;
        const bars: [number, number, number, number][] = [
          [rect.left + w / 2, rect.top + th / 2, w, th],
          [rect.left + w / 2, rect.bottom - th / 2, w, th],
          [rect.left + th / 2, rect.top + hh / 2, th, hh - th * 2],
          [rect.right - th / 2, rect.top + hh / 2, th, hh - th * 2],
        ];
        for (const [cx, cy, bw, bh] of bars) {
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(bw, bh / COS, h), mat.clone());
          mesh.position.set(cx - W / 2, (H / 2 - cy) / COS, h / 2);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          wallGroup.add(mesh);
        }
        mat.dispose();
      }
      wake();
    },
    add(spec, x, y, o) {
      const prev = dice.get(spec.key);
      if (prev) {
        // Rebuild the look in place; the die keeps where it lies (and, for the same solid, how it lies).
        endWash(prev);
        dropVisuals(prev);
        const v = visuals(spec);
        const sameShape = prev.spec.shape === spec.shape;
        prev.group = v.group;
        prev.tex = v.tex;
        prev.mats = v.mats;
        prev.look = v.look;
        prev.lid = v.lid;
        prev.lamp = v.lamp;
        prev.spec = spec;
        if (!sameShape) {
          const model = modelOf(spec.shape);
          prev.body = makeBody(spec.key, prev.body.x, prev.body.y, (spec.size / 2) * 0.86, model.faces, { upright: spec.upright });
        }
        prev.body.r = (spec.size / 2) * (spec.shape === 'chip' ? 1 : spec.shape === 'deck' ? 0.78 : 0.86);
        prev.body.upright = !!spec.upright;
        prev.body.flat = spec.shape === 'chip' || spec.shape === 'deck' || isModeled(spec.shape);
        prev.body.restFaces = spec.restFaces;
        prev.body.fixed = spec.fixed;
        prev.body.spawner = spec.spawner;
        prev.body.breakable = spec.breakable;
        prev.body.hopper = spec.hopper;
        prev.body.element = spec.element;
        wake();
        return;
      }
      const model = modelOf(spec.shape);
      const v = visuals(spec);
      const face = o?.face;
      const q0 = o?.random ? qRandom() : undefined;
      const body = makeBody(spec.key, x, y, (spec.size / 2) * (spec.shape === 'chip' ? 1 : spec.shape === 'deck' ? 0.78 : 0.86), model.faces, { upright: spec.upright, q: q0 });
      body.flat = spec.shape === 'chip' || spec.shape === 'deck' || isModeled(spec.shape);
      body.restFaces = spec.restFaces;
      body.fixed = spec.fixed;
      body.spawner = spec.spawner;
      body.breakable = spec.breakable;
      body.hopper = spec.hopper;
      body.element = spec.element;
      body.fresh = o?.fresh;
      // A fresh copy clears room for the next one: a weak push that keeps the spot by the supply free (owner).
      if (o?.fresh) body.boost = { gen: 3, power: 1.6, soft: true };
      // Awake for a moment, so it is pushed clear of anything it was put down on (two sleeping pieces never touch).
      if (!spec.fixed) body.asleep = false;
      if (face !== undefined && model.faces[face]) {
        body.q = restOn(body.q, model.faces[face], !!spec.upright);
        body.top = face;
      }
      const d: Die = { spec, body, ...v, scale: o?.pop ? 0.35 : 1, label: null, labelW: 0, wasAsleep: true, ring: null, jitter: 0, anchor: null, vanish: null, follow: [], glint: 0, tether: null, wash: null, lid: v.lid, mouth: 0, mouthNow: 0, lamp: v.lamp, blink: 0 };
      dice.set(spec.key, d);
      order.push(d);
      wake();
    },
    remove(key) {
      const d = dice.get(key);
      if (!d) return;
      endWash(d);
      dropVisuals(d);
      setRing(d, false);
      dice.delete(key);
      order.splice(order.indexOf(d), 1);
      if (held?.die === d) held = null;
      wake();
    },
    has: (key) => dice.has(key),
    keys: () => order.map((d) => d.spec.key),
    state(key) {
      const d = dice.get(key);
      if (d) return { x: d.body.x, y: d.body.y, top: d.body.top, asleep: d.body.asleep };
      const c = cards.get(key);
      return c ? { x: c.body?.x ?? c.x, y: c.body?.y ?? c.y, top: 0, asleep: c.body ? c.body.asleep : true } : null;
    },
    screen(key) {
      const d = dice.get(key);
      // Its height shows on screen by the camera's tilt exactly (v0.47.32: 0.4 was near enough for a hop, but the Roll
      // button's leap goes far higher, and the fire drawn there drifted off the die).
      return d && d.vanish !== 'flying' ? { x: d.body.x, y: d.body.y - (d.body.z + (d.hopZ ?? 0)) * SIN_TILT, size: d.spec.size * d.scale } : null;
    },
    hit(x, y) {
      // The top-most of whatever is under the point; a die's whole footprint counts.
      for (let i = order.length - 1; i >= 0; i--) {
        const d = order[i];
        // One on its way out (into the chest, back to the supply) is no longer there to touch (v0.47.25: it caught
        // the next scroll over the chest it was flying into).
        if (d.vanish) continue;
        if (Math.hypot(d.body.x - x, d.body.y - y) <= d.spec.size * 0.55) return d.spec.key;
      }
      return null;
    },
    grab(key, x, y) {
      const d = dice.get(key);
      if (!d) return;
      const b = d.body;
      b.held = true;
      b.asleep = false;
      b.settle = undefined;
      b.home = undefined;
      b.vx = b.vy = b.vz = 0;
      d.jitter = 0;
      held = { die: d, ox: b.x - x, oy: b.y - y, samples: [{ x, y, t: performance.now() }] };
      wake();
    },
    drag(x, y) {
      if (!held) return;
      const b = held.die.body;
      const now = performance.now();
      held.samples.push({ x, y, t: now });
      while (held.samples.length > 2 && now - held.samples[0].t > 90) held.samples.shift();
      const a = held.samples[0];
      const dt = Math.max(0.008, (now - a.t) / 1000);
      const vx = (x - a.x) / dt, vy = (y - a.y) / dt;
      const [nx, ny] = caged(b, Math.min(bounds.right - b.r, Math.max(bounds.left + b.r, x + held.ox)), Math.min(bounds.bottom - b.r, Math.max(bounds.top + b.r, y + held.oy)));
      // Turning in the hand: roll a little with the motion.
      const dist = Math.hypot(nx - b.x, ny - b.y);
      if (dist > 0.01 && !b.flat) {
        const ang = (dist / b.r) * 0.6;
        const ax = (ny - b.y) / dist, ay = (nx - b.x) / dist;
        const s = Math.sin(ang / 2);
        const turn = new THREE.Quaternion(ax * s, ay * s, 0, Math.cos(ang / 2));
        // Its partner (Hope and Fear, a d100's two) rolls the same way at the same time (owner, v0.47.19).
        for (const o of [b, ...(held.die.tether ?? []).filter((t) => t.pair && !t.b.flat).map((t) => t.b)]) {
          const q = turn.clone().multiply(new THREE.Quaternion(o.q[0], o.q[1], o.q[2], o.q[3])).normalize();
          o.q = [q.x, q.y, q.z, q.w];
        }
      }
      for (const hit of moveHeld(order.map((d) => d.body), b, nx, ny, vx, vy, bounds, obstacles)) impactCb(hit);
      followTether();
      wake();
    },
    release() {
      if (!held) return 0;
      const { die, samples } = held;
      held = null;
      const a = samples[0], z = samples[samples.length - 1];
      const dt = Math.max(0.016, (z.t - a.t) / 1000);
      let vx = (z.x - a.x) / dt, vy = (z.y - a.y) / dt;
      // The Idiot: every throw goes back the way the hand came.
      if (contrary) { vx = -vx; vy = -vy; }
      const sp = Math.hypot(vx, vy);
      const cap = 4200;
      if (sp > cap) { vx *= cap / sp; vy *= cap / sp; }
      const speed = Math.min(sp, cap);
      const b = die.body;
      b.held = false;
      const lift = throwLift(speed);
      // The partner goes with it, thrown the same way, then each rolls on its own.
      if (die.tether) {
        for (const t of die.tether) {
          const pb = t.b;
          pb.held = false;
          const pvx = vx * (0.92 + Math.random() * 0.12), pvy = vy * (0.92 + Math.random() * 0.12);
          if (pb.box) { pb.vx = pvx; pb.vy = pvy; pb.va = (Math.random() - 0.5) * 4; pb.asleep = false; continue; }
          // Each rolls as the hand's own die does (owner, v0.47.17: they slid out unturned, so their faces were not fair).
          launch(pb, pvx, pvy, 0, throwSpin(pvx, pvy, pb.r, speed, lift.spin));
          hop(dice.get(pb.key), speed, lift.hop);
        }
        die.tether = null;
      }
      // Let go off its card, an anchored piece is loose until the table decides where it belongs.
      if (die.anchor) { die.anchor = null; b.fixed = false; b.ghost = false; }
      const r = b.r;
      launch(b, vx, vy, 0, throwSpin(vx, vy, r, speed, lift.spin));
      // A die let go nearly still is set down, not thrown.
      if (speed > 120) hop(die, speed, lift.hop);
      wake();
      return speed;
    },
    toss(key, vx, vy, boost, breaker) {
      const d = dice.get(key);
      const cb = cards.get(key)?.body;
      if (!d && cb && !cb.held && !cb.broken) {
        cb.asleep = false; cb.home = undefined; cb.vx = vx; cb.vy = vy; cb.va = (cb.va ?? 0) + (Math.random() - 0.5) * Math.min(8, Math.hypot(vx, vy) / 300);
        wake();
        return;
      }
      if (!d) return;
      if (d.tether) { for (const t of d.tether) t.b.held = false; d.tether = null; }
      d.jitter = 0;
      const sp = Math.hypot(vx, vy);
      launch(d.body, vx, vy, 0, throwSpin(vx, vy, d.body.r, sp));
      hop(d, sp);
      if (boost) d.body.boost = boost;
      if (breaker) { d.body.breaker = { ...breaker }; brokeOnce.delete(key); }
      wake();
    },
    leap(key, vx, vy, up, g, spin) {
      const d = dice.get(key);
      if (!d) return;
      if (d.tether) { for (const t of d.tether) t.b.held = false; d.tether = null; }
      d.jitter = 0;
      const th = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s0 = Math.sqrt(1 - u * u);
      launch(d.body, vx, vy, 0, [s0 * Math.cos(th) * spin, s0 * Math.sin(th) * spin, u * spin]);
      d.body.air = (2 * up) / g;
      d.hopZ = d.hopZ ?? 0;
      d.hopV = up;
      d.hopG = g;
      wake();
    },
    empower(key, mult, boost, breaker) {
      const d = dice.get(key);
      if (!d) return;
      d.body.vx *= mult;
      d.body.vy *= mult;
      d.body.w = [d.body.w[0] * mult, d.body.w[1] * mult, d.body.w[2]];
      if (boost) d.body.boost = boost;
      if (breaker) { d.body.breaker = { ...breaker }; brokeOnce.delete(key); }
      d.body.asleep = false;
      wake();
    },
    tether(key, partner, mate) {
      const d = dice.get(key);
      if (!d) return;
      if (d.tether) for (const t of d.tether) t.b.held = false;
      d.tether = null;
      // Dice, and physical cards in a carried selection (owner, v0.47.17).
      const list = (Array.isArray(partner) ? partner : partner ? [partner] : []).map((k) => dice.get(k)?.body ?? cards.get(k)?.body ?? null).filter((p): p is Body => !!p && p !== d.body && !p.broken);
      if (!list.length) return;
      let n = 0;
      const mb = mate ? dice.get(mate)?.body : undefined;
      d.tether = list.map((p) => {
        // One partner stands beside it, close enough to touch; so does the other half of a held pair in a bundle
        // (owner, v0.47.18), and the rest circle the two of them.
        if (!Array.isArray(partner) || p === mb) { const side = p.x >= d.body.x ? 1 : -1; return { b: p, dx: side * (d.body.r + p.r + 4), dy: 0, pair: true }; }
        // A carried card keeps where it lay against the hand; carried dice bundle round it and circle it (v0.47.16).
        if (p.box) return { b: p, dx: p.x - d.body.x, dy: p.y - d.body.y };
        return { b: p, dx: 0, dy: 0, orbit: n++ };
      });
      for (const p of list) { p.held = true; p.asleep = false; p.settle = undefined; p.home = undefined; }
      wake();
    },
    rollInPlace(key) {
      const d = dice.get(key);
      if (!d) return;
      const ang = Math.random() * Math.PI * 2;
      const sp = 140 + Math.random() * 160;
      launch(d.body, Math.cos(ang) * sp, Math.sin(ang) * sp, 0, throwSpin(Math.cos(ang) * sp, Math.sin(ang) * sp, d.body.r, 900));
      hop(d, 900);
      wake();
    },
    setFace(key, face) {
      const d = dice.get(key);
      if (!d || !d.body.faces[face]) return;
      snapFace(d.body, face);
      wake();
    },
    home(key, x, y, face) {
      const d = dice.get(key);
      const cb = cards.get(key)?.body;
      if (!d && cb && !cb.held) { sendHome(cb, x, y, undefined, 0.42 + Math.min(0.4, Math.hypot(cb.x - x, cb.y - y) / 2400)); wake(); return; }
      if (!d) return;
      sendHome(d.body, x, y, face, 0.42 + Math.min(0.4, Math.hypot(d.body.x - x, d.body.y - y) / 2400));
      wake();
    },
    nudge(keys, dx, dy) {
      for (const k of keys) {
        const d = dice.get(k);
        if (!d) continue;
        d.body.x = Math.min(bounds.right - d.body.r, Math.max(bounds.left + d.body.r, d.body.x + dx));
        d.body.y = Math.min(bounds.bottom - d.body.r, Math.max(bounds.top + d.body.r, d.body.y + dy));
      }
      wake();
    },
    vanish(key, x, y, delay) {
      const d = dice.get(key);
      if (!d || d.vanish) return;
      d.vanish = 'waiting';
      d.body.ghost = true;
      d.body.held = false;
      d.anchor = null;
      setTimeout(() => {
        if (dice.get(key) !== d) return;
        d.vanish = 'flying';
        for (const c of d.group.children) (c as THREE.Mesh).castShadow = false;
        const r = () => (Math.random() < 0.5 ? -1 : 1) * (14 + Math.random() * 10);
        sendHome(d.body, x, y, undefined, 0.5 + Math.random() * 0.12, [r(), r(), r() * 0.5]);
        wake();
      }, delay);
    },
    select(keys) {
      const want = new Set(keys);
      for (const d of order) setRing(d, want.has(d.spec.key));
      wake();
    },
    inside(r) {
      const inR = (b: Body) => b.x >= r.left && b.x <= r.right && b.y >= r.top && b.y <= r.bottom;
      return [...order.filter((d) => inR(d.body)).map((d) => d.spec.key), ...[...cards].filter(([, c]) => c.body && !c.body.broken && inR(c.body)).map(([k]) => k)];
    },
    jitter(key, amount) {
      const d = dice.get(key);
      if (!d) return;
      d.jitter = Math.max(0, Math.min(1, amount));
      wake();
    },
    shatter(key, stay) {
      const d = dice.get(key);
      if (!d) return;
      const { x, y } = d.body;
      const rad = d.spec.size / 2;
      const n = d.spec.shape === 'chip' ? 9 : 12;
      for (let i = 0; i < n; i++) {
        const size = rad * (0.18 + Math.random() * 0.22);
        const mesh = new THREE.Mesh(shardGeo, shardMat(i % 3 === 0 ? d.spec.edge : d.spec.body));
        mesh.scale.setScalar(size);
        scene.add(mesh);
        const ang = Math.random() * Math.PI * 2;
        const sp = 260 + Math.random() * 520;
        shards.push({ mesh, x, y, z: rad * 0.6, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, vz: 500 + Math.random() * 600, spin: new THREE.Vector3(Math.random() * 14, Math.random() * 14, Math.random() * 14), born: performance.now(), size, stay });
      }
      engine.remove(key);
    },
    field(f, ms) {
      fields.push({ f, until: performance.now() + ms });
      wake();
    },
    slippery(scale, ms) {
      slip = { scale, until: performance.now() + ms };
      for (const d of order) if (!d.body.fixed) d.body.asleep = false;
      wake();
    },
    impulse(x, y, r, speed, boost, except) {
      const all = [...order.map((d) => d.body), ...[...cards.values()].flatMap((c) => (c.body ? [c.body] : []))];
      const spare = new Set(except ?? []);
      for (const b of all) {
        if (b.fixed || b.held || b.ghost || b.broken || spare.has(b.key)) continue;
        const dx = b.x - x, dy = b.y - y;
        const d = Math.hypot(dx, dy);
        if (d >= r) continue;
        const k = (speed * (1 - d / r)) / (b.box ? 1.6 : 1);
        const ra = Math.random() * Math.PI * 2;
        const nx = d > 1 ? dx / d : Math.cos(ra), ny = d > 1 ? dy / d : Math.sin(ra);
        if (b.box) { b.asleep = false; b.vx += nx * k; b.vy += ny * k; b.va = (b.va ?? 0) + (Math.random() - 0.5) * k * 0.01; continue; }
        const spin = 0.012 * Math.abs(k) + 8;
        launch(b, b.vx + nx * k, b.vy + ny * k, 0, [(Math.random() - 0.5) * 2 * spin, (Math.random() - 0.5) * 2 * spin, (Math.random() - 0.5) * spin]);
        if (boost) b.boost = boost;
      }
      wake();
    },
    setCards(list) {
      const keep = new Set(list.map((c) => c.key));
      for (const k of [...cards.keys()]) if (!keep.has(k)) cards.delete(k);
      for (const c of list) {
        const a = (c.rot * Math.PI) / 180;
        const prev = cards.get(c.key);
        if (c.phys) {
          let body = prev?.body ?? null;
          if (!body) {
            body = makeBody(c.key, c.x, c.y, Math.hypot(c.w, c.h) / 2, CHIP_FACES);
            body.a = a;
            body.va = 0;
            body.mass = 3;
            body.asleep = true;
          } else if (body.asleep && !body.held) {
            body.x = c.x; body.y = c.y; body.a = a;
          }
          if (body.box && (body.box.w !== c.w || body.box.h !== c.h)) body.asleep = false;
          body.box = { w: c.w, h: c.h };
          body.r = Math.hypot(c.w, c.h) / 2;
          // A physical card breaks like any loose piece (owner, v0.47.12): torn, cut, burnt or blown apart.
          body.breakable = true;
          cards.set(c.key, { x: body.x, y: body.y, w: c.w, h: c.h, a: body.a ?? 0, body, was: prev?.was ?? true, samples: prev?.samples ?? [] });
        } else {
          cards.set(c.key, { x: c.x, y: c.y, w: c.w, h: c.h, a, body: null, was: true, samples: prev?.samples ?? [] });
        }
      }
      placeAnchored();
      wake();
    },
    holdCard(key, x, y, rot) {
      const c = cards.get(key);
      if (!c) return;
      const a = (rot * Math.PI) / 180;
      c.x = x; c.y = y; c.a = a;
      const now = performance.now();
      const prev = c.samples[c.samples.length - 1];
      c.samples.push({ x, y, t: now });
      while (c.samples.length > 2 && now - c.samples[0].t > 90) c.samples.shift();
      // Swung round fast it gathers speed, as a die does (owner, v0.47.25), but a card never catches fire, frost or
      // lightning: let go, it just flies that much harder and hits that much harder.
      if (prev && now > prev.t) {
        const inst = (Math.hypot(x - prev.x, y - prev.y) / (now - prev.t)) * 1000;
        c.hand = (c.hand ?? 0) + (inst - (c.hand ?? 0)) * Math.min(1, (now - prev.t) / 50);
        const dts = Math.min(50, now - (c.st ?? now));
        const rate = Math.min(1.6, Math.max(0, (c.hand - 900) / 1700));
        c.swing = rate > 0 ? Math.min(2, (c.swing ?? 0) + (dts / 1100) * rate) : Math.max(0, (c.swing ?? 0) - dts / 900);
      }
      c.st = now;
      if (cardCarry?.lead === key) {
        for (const o of cardCarry.others) {
          o.b.x = Math.min(bounds.right - o.b.r * 0.5, Math.max(bounds.left + o.b.r * 0.5, x + o.dx));
          o.b.y = Math.min(bounds.bottom - o.b.r * 0.5, Math.max(bounds.top + o.b.r * 0.5, y + o.dy));
        }
      }
      if (c.body) {
        const b = c.body;
        const s0 = c.samples[0];
        const dt = Math.max(0.008, (now - s0.t) / 1000);
        b.held = true;
        b.asleep = false;
        b.a = a;
        b.va = 0;
        // Swept, like a die in the hand, so a fast swing still knocks what it passes.
        for (const hit of moveHeld([...order.map((d) => d.body), b], b, x, y, (x - s0.x) / dt, (y - s0.y) / dt, bounds, obstacles)) impactCb(hit);
      }
      placeAnchored();
      wake();
    },
    carryWith(key, others) {
      if (cardCarry?.lead === key) return;
      const c = cards.get(key);
      if (!c) return;
      const list = others.map((k) => dice.get(k)?.body ?? cards.get(k)?.body ?? null).filter((b): b is Body => !!b && b !== c.body && !b.broken);
      for (const b of list) { b.held = true; b.asleep = false; b.settle = undefined; b.home = undefined; }
      cardCarry = { lead: key, others: list.map((b) => ({ b, dx: b.x - c.x, dy: b.y - c.y })) };
    },
    releaseCard(key) {
      const c = cards.get(key);
      if (!c) return;
      // What it carried goes the way it was let go.
      const carried = cardCarry?.lead === key ? cardCarry.others : [];
      cardCarry = null;
      const sa = c.samples[0], sz = c.samples[c.samples.length - 1];
      const cdt = sa && sz && sz.t > sa.t ? Math.max(0.016, (sz.t - sa.t) / 1000) : 0;
      const swing = c.swing ?? 0, mult = 1 + swing * 0.75, cap = 3600 * (1 + swing);
      c.swing = 0; c.hand = 0; c.st = undefined;
      const boost = swing > 0.25 ? { gen: 5, power: 1 + 2.5 * swing } : undefined;
      for (const o of carried) {
        o.b.held = false;
        o.b.asleep = false;
        if (cdt) { o.b.vx = Math.max(-cap, Math.min(cap, ((sz.x - sa.x) / cdt) * mult)); o.b.vy = Math.max(-cap, Math.min(cap, ((sz.y - sa.y) / cdt) * mult)); }
        if (boost) o.b.boost = boost;
      }
      const samples = c.samples;
      c.samples = [];
      if (!c.body) return;
      const b = c.body;
      b.held = false;
      const a = samples[0], z = samples[samples.length - 1];
      if (a && z && z.t > a.t) {
        const dt = Math.max(0.016, (z.t - a.t) / 1000);
        let vx = ((z.x - a.x) / dt) * mult, vy = ((z.y - a.y) / dt) * mult;
        const sp = Math.hypot(vx, vy);
        if (sp > cap) { vx *= cap / sp; vy *= cap / sp; }
        b.vx = vx; b.vy = vy;
        if (boost) b.boost = boost;
        b.va = (Math.random() - 0.5) * Math.min(6, sp / 500);
      }
      b.asleep = false;
      wake();
    },
    throwCard(key, vx, vy, va) {
      const b = cards.get(key)?.body;
      if (!b) return false;
      b.held = false;
      b.asleep = false;
      b.vx = vx;
      b.vy = vy;
      b.va = va;
      wake();
      return true;
    },
    onCards(cb) { cardsCb = cb; },
    anchor(key, card, lx = 0, ly = 0) {
      const d = dice.get(key);
      if (!d) return;
      if (card) { d.anchor = { card, lx, ly }; d.body.fixed = true; d.body.asleep = true; d.body.vx = d.body.vy = 0; }
      else if (d.anchor) { d.anchor = null; d.body.fixed = false; d.body.ghost = false; }
      placeAnchored();
      wake();
    },
    hover(key) {
      if (hovered === key) return;
      hovered = key;
      wake();
    },
    label(key, el) {
      const d = dice.get(key);
      if (!d) return;
      d.label = el;
      d.labelW = el?.offsetWidth ?? 0;
      if (el) sync(d);
    },
    follow(key, el, on) {
      const d = dice.get(key);
      if (!d) return false;
      d.follow = on ? [...d.follow.filter((f) => f !== el), el] : d.follow.filter((f) => f !== el);
      if (on) sync(d);
      return true;
    },
    flash(key) {
      const d = dice.get(key);
      if (!d) return;
      d.glint = 1;
      wake();
    },
    wash(key, color, peak, holdMs, swell = 0) {
      const d = dice.get(key);
      if (!d) return;
      endWash(d);
      const own = new Map<THREE.Material, THREE.Material>();
      d.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const src = m.material as THREE.Material;
        let c = own.get(src);
        if (!c) {
          c = src.clone();
          const e = (c as THREE.Material & { emissive?: THREE.Color; emissiveIntensity?: number; userData: { e?: THREE.Color; ei?: number } });
          const se = (src as THREE.Material & { emissive?: THREE.Color; emissiveIntensity?: number; userData: { e?: THREE.Color; ei?: number } });
          if (e.emissive) { e.userData.e = (se.userData.e ?? se.emissive!).clone(); e.userData.ei = se.userData.ei ?? se.emissiveIntensity ?? 1; }
          own.set(src, c);
        }
        m.material = c;
      });
      d.wash = { color: new THREE.Color(color), peak, t0: performance.now(), hold: holdMs, swell, own };
      wake();
    },
    freeze(ms) {
      freezeUntil = Math.max(freezeUntil, performance.now() + ms);
      wake();
    },
    stage(keys) {
      staged = keys ? new Set(keys) : null;
      wake();
    },
    pin(keys, ms) {
      const pinned = keys.map((k) => dice.get(k)?.body).filter((b): b is Body => !!b && !b.fixed);
      for (const b of pinned) b.fixed = true;
      setTimeout(() => { for (const b of pinned) b.fixed = false; wake(); }, ms);
    },
    aura(id, f) {
      if (f) auras.set(id, f); else auras.delete(id);
      if (f) for (const b of [...order.map((d) => d.body), ...cardBodies()]) if (!b.fixed && !b.held) { b.asleep = false; b.settle = undefined; }
      wake();
    },
    cage(id, c) {
      if (!c) { cages.delete(id); return; }
      const inside = new Set(order.filter((d) => !d.body.fixed && Math.hypot(d.body.x - c.x, d.body.y - c.y) < c.r).map((d) => d.spec.key));
      cages.set(id, { ...c, inside });
      wake();
    },
    contrary(on) { contrary = on; },
    blink(key, hz) {
      const d = dice.get(key);
      if (!d) return;
      d.blink = hz;
      wake();
    },
    clearShards() {
      for (const sh of [...shards, ...kept]) scene.remove(sh.mesh);
      shards.length = 0;
      kept.length = 0;
      wake();
    },
    mimic(key, open) {
      const d = dice.get(key);
      if (!d?.lid) return;
      d.mouth = Math.max(0, Math.min(1, open));
      wake();
    },
    cardKeys: () => [...cards.entries()].filter(([, c]) => c.body && !c.body.broken).map(([k]) => k),
    onHitStop(cb) { hitStopCb = cb; },
    onPound(cb) { poundCb = cb; },
    zap(key, angle, speed, seconds, spare) {
      const d = dice.get(key);
      if (!d) return;
      if (d.tether) { for (const t of d.tether) t.b.held = false; d.tether = null; }
      const b = d.body;
      b.held = false; b.asleep = false; b.settle = undefined; b.home = undefined;
      b.vx = Math.cos(angle) * speed; b.vy = Math.sin(angle) * speed;
      b.w = [(Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 20];
      b.zap = { speed, left: seconds };
      b.breaker = { left: 99, fire: true, spare: new Set(spare ?? []) };
      brokeOnce.add(key);
      wake();
    },
    unpin(keys) {
      for (const k of keys) { const d = dice.get(k); if (d && !d.anchor && !d.spec.fixed) { d.body.fixed = false; d.body.asleep = false; } }
      wake();
    },
    onImpact(cb) { impactCb = cb; },
    onBreak(cb) { breakCb = cb; },
    onRest(cb) { restCb = cb; },
    warm(specs) {
      const made = specs.filter((sp) => !isModeled(sp.shape)).map((sp) => visuals(sp));
      if (!made.length) return;
      for (const v of made) { v.group.position.set(1e5, 1e5, 0); renderer.initTexture(v.tex); }
      const done = () => { for (const v of made) { scene.remove(v.group); releaseLook(v.look); } };
      void renderer.compileAsync(scene, camera).then(done, done);
    },
    dispose() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      for (const d of order) { dropVisuals(d); setRing(d, false); }
      order.length = 0;
      for (const sh of [...shards, ...kept]) scene.remove(sh.mesh);
      shards.length = 0;
      kept.length = 0;
      for (const sh of looks.values()) { sh.tex.dispose(); for (const m of sh.mats) m.dispose(); }
      looks.clear();
      shardGeo.dispose();
      for (const m of shardMats.values()) m.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      dice.clear();
      engine.setWalls('none', bounds, 0);
      env.dispose();
      catcher.geometry.dispose();
      (catcher.material as THREE.Material).dispose();
      renderer.dispose();
    },
  };
  return engine;
}

// ------------------------------------------------------------------------------------------------ sound

/**
 * A die's knock, made on the spot so it answers how hard it hit: a short band of noise (the click of resin) and,
 * on the felt, a soft low thump. Rate-limited so a handful of dice landing together does not crackle.
 */
let lastKnock = 0;
let knocksThisWindow = 0;
export function knock(play: (make: (c: AudioContext, out: AudioNode, at: number) => void, volume: number) => void, hit: Impact): void {
  const now = performance.now();
  if (now - lastKnock > 60) knocksThisWindow = 0;
  if (knocksThisWindow >= 3) return;
  knocksThisWindow++;
  lastKnock = now;
  const level = Math.min(1, hit.speed / 1600);
  if (level < 0.04) return;
  play((c, out, at) => {
    const len = 0.09;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * len), c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 6);
    const src = c.createBufferSource();
    src.buffer = buf;
    const band = c.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = hit.kind === 'die' ? 2600 + Math.random() * 900 : hit.kind === 'rail' ? 900 + Math.random() * 300 : 1500 + Math.random() * 500;
    band.Q.value = hit.kind === 'die' ? 6 : 3;
    const g = c.createGain();
    g.gain.setValueAtTime(level, at);
    g.gain.exponentialRampToValueAtTime(0.0008, at + (hit.kind === 'die' ? 0.05 : 0.08));
    src.connect(band).connect(g).connect(out);
    src.start(at);
    if (hit.kind !== 'die') {
      const thump = c.createOscillator();
      thump.frequency.setValueAtTime(hit.kind === 'rail' ? 190 : 120, at);
      thump.frequency.exponentialRampToValueAtTime(60, at + 0.08);
      const tg = c.createGain();
      tg.gain.setValueAtTime(level * 0.55, at);
      tg.gain.exponentialRampToValueAtTime(0.0008, at + 0.09);
      thump.connect(tg).connect(out);
      thump.start(at);
      thump.stop(at + 0.1);
    }
  }, 2.6);
}
