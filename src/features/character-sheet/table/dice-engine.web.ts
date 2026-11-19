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

import { allAsleep, type Body, type Bounds, type DieFace, type Impact, launch, makeBody, moveHeld, type Obstacle, qRandom, restOn, sendHome, snapFace, STEP, step } from './dice-physics';

export type Shape = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20';
export const FACE_COUNT: Record<Shape, number> = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20 };

/** What a die is made of. The first three are for rolling dice, the last three for the table's controls. */
export type Finish = 'resin' | 'stone' | 'metal' | 'obsidian' | 'gilded' | 'ivory';
export type Walls = 'none' | 'line' | 'stone' | 'brass';

/**
 * What one face shows: a number (or any short text) or a picture, optionally on a round plate of that colour (a
 * gold deck icon on a gilded die sits on a dark medallion). Fewer than the die has repeat round.
 */
export type FaceArt = { text: string } | { image: CanvasImageSource; plate?: string };

export interface DieSpec {
  key: string;
  /** A polyhedron, or a token chip (a flat disc that slides and never tumbles). */
  shape: Shape | 'chip';
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
}

export interface DiceEngine {
  resize(width: number, height: number): void;
  setBounds(b: Bounds): void;
  /** Areas dice bounce off (the dice bar, the hand's own area). */
  setObstacles(o: Obstacle[]): void;
  /** Draw the table's edge as 3D rails (stone, brass) or not at all. */
  setWalls(kind: Walls, rect: Bounds, thickness: number): void;
  /** Put a die on the table (or rebuild the one with this key in place: its art, colours, finish or size). */
  add(spec: DieSpec, x: number, y: number, opts?: { random?: boolean; face?: number; pop?: boolean }): void;
  remove(key: string): void;
  has(key: string): boolean;
  keys(): string[];
  /** Where a die is, and the face on top when it is at rest. */
  state(key: string): { x: number; y: number; top: number; asleep: boolean } | null;
  hit(x: number, y: number): string | null;
  grab(key: string, x: number, y: number): void;
  drag(x: number, y: number): void;
  /** Let go: the die flies on with the hand's speed (px/s returned). */
  release(): number;
  /** Throw with a velocity; it slides and tumbles and lands where physics puts it. */
  toss(key: string, vx: number, vy: number): void;
  /** Spin where it lies and land on whatever face comes up (right click). */
  rollInPlace(key: string): void;
  /** Show `face` on top straight away, without moving (the category die following the deck). */
  setFace(key: string, face: number): void;
  /** Fly to (x, y) and land on `face`. */
  home(key: string, x: number, y: number, face?: number): void;
  /** Shift these pieces by (dx, dy) where they lie (a laid card carrying what is on it). */
  nudge(keys: string[], dx: number, dy: number): void;
  hover(key: string | null): void;
  /** A DOM label that rides under a die. */
  label(key: string, el: HTMLElement | null): void;
  onImpact(cb: (i: Impact) => void): void;
  /** Called with the keys of dice that have just come to rest. */
  onRest(cb: (keys: string[]) => void): void;
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
      g.drawImage(art.image, cx - s / 2, cy - s / 2, s, s);
    }
  }
  if (spec.shape === 'chip') paintButton(g, spec.body);
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
      return {
        face: new THREE.MeshPhysicalMaterial({ map, roughness: 0.22, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.18, transmission: 0.28, thickness: 0.8, ior: 1.5, attenuationColor: c, attenuationDistance: 1.2 }),
        edge: new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.16, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.12, transmission: 0.35, thickness: 0.6, ior: 1.5, attenuationColor: c }),
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
  const modelOf = (shape: DieSpec['shape']) => (shape === 'chip' ? chip : shapes[shape]);
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
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
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  interface Die { spec: DieSpec; body: Body; group: THREE.Group; tex: THREE.CanvasTexture; mats: THREE.Material[]; scale: number; label: HTMLElement | null; labelW: number; wasAsleep: boolean }
  const dice = new Map<string, Die>();
  const order: Die[] = [];
  let hovered: string | null = null;
  let held: { die: Die; ox: number; oy: number; samples: { x: number; y: number; t: number }[] } | null = null;
  let impactCb: (i: Impact) => void = () => {};
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

  function sync(d: Die) {
    const b = d.body;
    const model = modelOf(d.spec.shape);
    const rad = d.spec.size / 2;
    // A light touch on hover, so the die's outline never grows past itself (owner, v0.47.2).
    const target = d.body.held ? 1.05 : hovered === d.spec.key ? 1.03 : 1;
    d.scale += (target - d.scale) * 0.25;
    d.group.scale.setScalar(rad * d.scale);
    d.group.position.set(b.x - W / 2, (H / 2 - b.y) / COS, model.inR * rad + b.z + (b.held ? 6 : 0));
    d.group.quaternion.set(b.q[0], b.q[1], b.q[2], b.q[3]);
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
  function wake() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function frame(t: number) {
    raf = 0;
    acc += Math.min(0.05, (t - last) / 1000);
    last = t;
    const bodies = order.map((d) => d.body);
    let steps = 0;
    while (acc >= STEP && steps++ < 12) {
      for (const hit of step(bodies, bounds, STEP, Math.random, obstacles)) impactCb(hit);
      acc -= STEP;
    }
    let easing = false;
    const rested: string[] = [];
    // Label widths are read in one pass, before any label moves, so measuring never forces a layout per die.
    if (++frameNo % 30 === 1) for (const d of order) d.labelW = d.label?.offsetWidth ?? 0;
    for (const d of order) {
      sync(d);
      if (Math.abs(d.scale - (d.body.held ? 1.05 : hovered === d.spec.key ? 1.03 : 1)) > 0.002) easing = true;
      const asleep = d.body.asleep && !d.body.held;
      if (asleep && !d.wasAsleep) rested.push(d.spec.key);
      d.wasAsleep = asleep;
    }
    renderer.render(scene, camera);
    if (rested.length) restCb(rested);
    if (!allAsleep(bodies) || easing || held) raf = requestAnimationFrame(frame);
  }

  function visuals(spec: DieSpec): { group: THREE.Group; tex: THREE.CanvasTexture; mats: THREE.Material[] } {
    const model = modelOf(spec.shape);
    const canvasEl = document.createElement('canvas');
    paintAtlas(canvasEl, spec, model, opts.font);
    const tex = new THREE.CanvasTexture(canvasEl);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false;
    tex.anisotropy = Math.min(8, maxAniso);
    const m = materials(spec.finish, spec.body, spec.edge, tex);
    const group = new THREE.Group();
    const parts: [THREE.BufferGeometry | null, THREE.Material][] = [[model.face, m.face], [model.edge, m.edge]];
    for (const [geo, mat] of parts) {
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      group.add(mesh);
    }
    scene.add(group);
    return { group, tex, mats: [m.face, m.edge] };
  }

  function dropVisuals(d: Die) {
    scene.remove(d.group);
    d.tex.dispose();
    for (const m of d.mats) m.dispose();
  }

  const engine: DiceEngine = {
    resize,
    setBounds(b) { bounds = b; wake(); },
    setObstacles(o) {
      obstacles = o;
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
        dropVisuals(prev);
        const v = visuals(spec);
        const sameShape = prev.spec.shape === spec.shape;
        prev.group = v.group;
        prev.tex = v.tex;
        prev.mats = v.mats;
        prev.spec = spec;
        if (!sameShape) {
          const model = modelOf(spec.shape);
          prev.body = makeBody(spec.key, prev.body.x, prev.body.y, (spec.size / 2) * 0.86, model.faces, { upright: spec.upright });
        }
        prev.body.r = (spec.size / 2) * (spec.shape === 'chip' ? 1 : 0.86);
        prev.body.upright = !!spec.upright;
        prev.body.flat = spec.shape === 'chip';
        prev.body.restFaces = spec.restFaces;
        prev.body.fixed = spec.fixed;
        wake();
        return;
      }
      const model = modelOf(spec.shape);
      const v = visuals(spec);
      const face = o?.face;
      const q0 = o?.random ? qRandom() : undefined;
      const body = makeBody(spec.key, x, y, (spec.size / 2) * (spec.shape === 'chip' ? 1 : 0.86), model.faces, { upright: spec.upright, q: q0 });
      body.flat = spec.shape === 'chip';
      body.restFaces = spec.restFaces;
      body.fixed = spec.fixed;
      if (face !== undefined && model.faces[face]) {
        body.q = restOn(body.q, model.faces[face], !!spec.upright);
        body.top = face;
      }
      const d: Die = { spec, body, ...v, scale: o?.pop ? 0.35 : 1, label: null, labelW: 0, wasAsleep: true };
      dice.set(spec.key, d);
      order.push(d);
      wake();
    },
    remove(key) {
      const d = dice.get(key);
      if (!d) return;
      dropVisuals(d);
      dice.delete(key);
      order.splice(order.indexOf(d), 1);
      if (held?.die === d) held = null;
      wake();
    },
    has: (key) => dice.has(key),
    keys: () => order.map((d) => d.spec.key),
    state(key) {
      const d = dice.get(key);
      return d ? { x: d.body.x, y: d.body.y, top: d.body.top, asleep: d.body.asleep } : null;
    },
    hit(x, y) {
      // The top-most of whatever is under the point; a die's whole footprint counts.
      for (let i = order.length - 1; i >= 0; i--) {
        const d = order[i];
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
      const nx = Math.min(bounds.right - b.r, Math.max(bounds.left + b.r, x + held.ox));
      const ny = Math.min(bounds.bottom - b.r, Math.max(bounds.top + b.r, y + held.oy));
      // Turning in the hand: roll a little with the motion.
      const dist = Math.hypot(nx - b.x, ny - b.y);
      if (dist > 0.01 && !b.flat) {
        const ang = (dist / b.r) * 0.6;
        const ax = (ny - b.y) / dist, ay = (nx - b.x) / dist;
        const s = Math.sin(ang / 2);
        const q = new THREE.Quaternion(ax * s, ay * s, 0, Math.cos(ang / 2)).multiply(new THREE.Quaternion(b.q[0], b.q[1], b.q[2], b.q[3])).normalize();
        b.q = [q.x, q.y, q.z, q.w];
      }
      for (const hit of moveHeld(order.map((d) => d.body), b, nx, ny, vx, vy, bounds, obstacles)) impactCb(hit);
      wake();
    },
    release() {
      if (!held) return 0;
      const { die, samples } = held;
      held = null;
      const a = samples[0], z = samples[samples.length - 1];
      const dt = Math.max(0.016, (z.t - a.t) / 1000);
      let vx = (z.x - a.x) / dt, vy = (z.y - a.y) / dt;
      const sp = Math.hypot(vx, vy);
      const cap = 4200;
      if (sp > cap) { vx *= cap / sp; vy *= cap / sp; }
      const speed = Math.min(sp, cap);
      const b = die.body;
      b.held = false;
      const r = b.r;
      launch(b, vx, vy, 0, [vy / r + (Math.random() - 0.5) * speed * 0.01, vx / r + (Math.random() - 0.5) * speed * 0.01, (Math.random() - 0.5) * speed * 0.006]);
      wake();
      return speed;
    },
    toss(key, vx, vy) {
      const d = dice.get(key);
      if (!d) return;
      const sp = Math.hypot(vx, vy);
      const k = 0.012 * sp + 8;
      launch(d.body, vx, vy, 0, [(Math.random() - 0.5) * 2 * k, (Math.random() - 0.5) * 2 * k, (Math.random() - 0.5) * k]);
      wake();
    },
    rollInPlace(key) {
      const d = dice.get(key);
      if (!d) return;
      const ang = Math.random() * Math.PI * 2;
      const sp = 140 + Math.random() * 160;
      launch(d.body, Math.cos(ang) * sp, Math.sin(ang) * sp, 0, [(Math.random() - 0.5) * 70, (Math.random() - 0.5) * 70, (Math.random() - 0.5) * 20]);
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
    onImpact(cb) { impactCb = cb; },
    onRest(cb) { restCb = cb; },
    dispose() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      for (const d of order) dropVisuals(d);
      order.length = 0;
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
