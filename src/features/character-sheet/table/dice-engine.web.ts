/**
 * The play table's 3D dice (v0.47.0, web only): three.js draws the dice the Blender script modelled
 * (public/models/dice.glb) over the felt, lit from above with real shadows, and `dice-physics` moves them.
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

import { allAsleep, type Body, type Bounds, type DieFace, type Impact, launch, makeBody, type Obstacle, qRandom, sendHome, STEP, step } from './dice-physics';

export type Shape = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20';
export const FACE_COUNT: Record<Shape, number> = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20 };

/** What one face shows: a number (or any short text) or a picture. Fewer than the die has repeat round. */
export type FaceArt = { text: string } | { image: CanvasImageSource };

export interface DieSpec {
  key: string;
  shape: Shape;
  /** Across the die, px. */
  size: number;
  body: string;
  edge: string;
  ink: string;
  faces: FaceArt[];
  /** Metal edges (gilded): the table's button dice. */
  gilded?: boolean;
  /** Settle with the art upright (icons) rather than merely flat (numbers). */
  upright?: boolean;
}

export interface DiceEngine {
  resize(width: number, height: number): void;
  setBounds(b: Bounds): void;
  /** Panels lying on the felt that dice bounce off (the dice bar). */
  setObstacles(o: Obstacle[]): void;
  /** Put a die on the table (or update the one with this key in place: its art, colours or size). */
  add(spec: DieSpec, x: number, y: number, opts?: { random?: boolean }): void;
  remove(key: string): void;
  has(key: string): boolean;
  /** Where a die is, and the face on top when it is at rest. */
  state(key: string): { x: number; y: number; top: number; asleep: boolean } | null;
  hit(x: number, y: number): string | null;
  grab(key: string, x: number, y: number): void;
  drag(x: number, y: number): void;
  /** Let go: the die flies on with the hand's speed (px/s returned). */
  release(): number;
  /** Throw from a point with a velocity; it hops, tumbles and lands where physics puts it. */
  toss(key: string, vx: number, vy: number, hop: number): void;
  /** Hop in place and land on `face`, art upright (the category die turning to a deck). */
  turnTo(key: string, face: number): void;
  /** Fly to (x, y) and land on `face`. */
  home(key: string, x: number, y: number, face?: number): void;
  hover(key: string | null): void;
  /** A DOM label that rides under a die. */
  label(key: string, el: HTMLElement | null): void;
  onImpact(cb: (i: Impact) => void): void;
  /** Called with the keys of dice that have just come to rest. */
  onRest(cb: (keys: string[]) => void): void;
  dispose(): void;
}

interface ShapeModel { face: THREE.BufferGeometry; edge: THREE.BufferGeometry; faces: DieFace[]; inR: number; artR: number }

const COLS = 5;
const ROWS = 4;
const CELL = 128;
const FOV = 20;

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
      if (!face || !edge) return;
      out[name] = { face, edge, faces: o.userData.faces as DieFace[], inR: o.userData.inR as number, artR: o.userData.artR as number };
    });
    return out;
  });
  models.catch(() => { models = null; });
  return models;
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
      g.drawImage(art.image, cx - s / 2, cy - s / 2, s, s);
    }
  }
}

export async function createDiceEngine(canvas: HTMLCanvasElement, opts: { modelUrl: string; font: string }): Promise<DiceEngine> {
  const shapes = await loadModels(opts.modelUrl);
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
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xfff1dc, 0x10141c, 1.1));
  const sun = new THREE.DirectionalLight(0xfff4e6, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  sun.shadow.radius = 6;
  scene.add(sun, sun.target);
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.5, color: 0x000000 }));
  catcher.receiveShadow = true;
  scene.add(catcher);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 10, 10000);

  let W = 1;
  let H = 1;
  let bounds: Bounds = { left: 0, top: 0, right: 1, bottom: 1 };
  let obstacles: Obstacle[] = [];
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  interface Die { spec: DieSpec; body: Body; group: THREE.Group; tex: THREE.CanvasTexture; faceMat: THREE.MeshStandardMaterial; edgeMat: THREE.MeshStandardMaterial; scale: number; label: HTMLElement | null; labelW: number; wasAsleep: boolean }
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
    camera.aspect = W / H;
    camera.position.set(0, 0, H / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
    camera.near = 10;
    camera.far = camera.position.z + 4000;
    camera.updateProjectionMatrix();
    catcher.scale.set(W * 1.2, H * 1.2, 1);
    sun.position.set(-W * 0.32, H * 0.42, 1800);
    const sc = sun.shadow.camera;
    sc.left = -W / 2 - 200;
    sc.right = W / 2 + 200;
    sc.top = H / 2 + 200;
    sc.bottom = -H / 2 - 200;
    sc.near = 100;
    sc.far = 5000;
    sc.updateProjectionMatrix();
    wake();
  }

  const v = new THREE.Vector3();
  function sync(d: Die) {
    const b = d.body;
    const model = shapes[d.spec.shape];
    const rad = d.spec.size / 2;
    const target = hovered === d.spec.key || d.body.held ? 1.08 : 1;
    d.scale += (target - d.scale) * 0.25;
    d.group.scale.setScalar(rad * d.scale);
    d.group.position.set(b.x - W / 2, H / 2 - b.y, model.inR * rad + b.z);
    d.group.quaternion.set(b.q[0], b.q[1], b.q[2], b.q[3]);
    if (d.label) {
      v.set(b.x - W / 2, H / 2 - b.y, 0).project(camera);
      // Kept inside the felt: a die against the rail still has its whole label.
      const half = (d.labelW || 60) / 2;
      const sx = Math.min(W - half - 4, Math.max(half + 4, ((v.x + 1) / 2) * W));
      // Under the die, or over it when the die lies against the bottom rail.
      let sy = ((1 - v.y) / 2) * H + rad * 1.02 + 4;
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
      if (Math.abs(d.scale - (hovered === d.spec.key || d.body.held ? 1.08 : 1)) > 0.002) easing = true;
      const asleep = d.body.asleep && !d.body.held;
      if (asleep && !d.wasAsleep) rested.push(d.spec.key);
      d.wasAsleep = asleep;
    }
    renderer.render(scene, camera);
    if (rested.length) restCb(rested);
    if (!allAsleep(bodies) || easing || held) raf = requestAnimationFrame(frame);
  }

  function makeDie(spec: DieSpec, x: number, y: number, random: boolean): Die {
    const model = shapes[spec.shape];
    const canvasEl = document.createElement('canvas');
    paintAtlas(canvasEl, spec, model, opts.font);
    const tex = new THREE.CanvasTexture(canvasEl);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false;
    tex.anisotropy = Math.min(8, maxAniso);
    const faceMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.42, metalness: 0.02 });
    const edgeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.edge), roughness: spec.gilded ? 0.3 : 0.45, metalness: spec.gilded ? 0.92 : 0.1 });
    const group = new THREE.Group();
    for (const [geo, mat] of [[model.face, faceMat], [model.edge, edgeMat]] as const) {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      group.add(m);
    }
    scene.add(group);
    const body = makeBody(spec.key, x, y, (spec.size / 2) * 0.86, model.faces, { upright: spec.upright, q: random ? qRandom() : undefined });
    return { spec, body, group, tex, faceMat, edgeMat, scale: 1, label: null, labelW: 0, wasAsleep: true };
  }

  function disposeDie(d: Die) {
    scene.remove(d.group);
    d.tex.dispose();
    d.faceMat.dispose();
    d.edgeMat.dispose();
  }

  const engine: DiceEngine = {
    resize,
    setBounds(b) { bounds = b; wake(); },
    setObstacles(o) {
      obstacles = o;
      // A die already lying where a panel now is gets pushed off it.
      for (const d of order) {
        const b = d.body;
        if (o.some((r) => b.x + b.r > r.left && b.x - b.r < r.right && b.y + b.r > r.top && b.y - b.r < r.bottom)) b.asleep = false;
      }
      wake();
    },
    add(spec, x, y, o) {
      const prev = dice.get(spec.key);
      if (prev && prev.spec.shape === spec.shape) {
        // Same solid: repaint and recolour in place, keep where it lies and how it lies.
        prev.spec = spec;
        paintAtlas(prev.tex.image as HTMLCanvasElement, spec, shapes[spec.shape], opts.font);
        prev.tex.needsUpdate = true;
        prev.edgeMat.color.set(spec.edge);
        prev.edgeMat.metalness = spec.gilded ? 0.92 : 0.1;
        prev.body.r = (spec.size / 2) * 0.86;
        prev.body.upright = !!spec.upright;
        wake();
        return;
      }
      let at = { x, y };
      let label: HTMLElement | null = null;
      if (prev) { at = { x: prev.body.x, y: prev.body.y }; label = prev.label; engine.remove(spec.key); }
      const d = makeDie(spec, at.x, at.y, !!o?.random);
      d.label = label;
      dice.set(spec.key, d);
      order.push(d);
      wake();
    },
    remove(key) {
      const d = dice.get(key);
      if (!d) return;
      disposeDie(d);
      dice.delete(key);
      order.splice(order.indexOf(d), 1);
      if (held?.die === d) held = null;
      wake();
    },
    has: (key) => dice.has(key),
    state(key) {
      const d = dice.get(key);
      return d ? { x: d.body.x, y: d.body.y, top: d.body.top, asleep: d.body.asleep } : null;
    },
    hit(x, y) {
      let best: Die | null = null;
      let bestZ = -Infinity;
      for (const d of order) {
        const b = d.body;
        if (Math.hypot(b.x - x, b.y - y) <= d.spec.size * 0.55 && b.z >= bestZ) { best = d; bestZ = b.z; }
      }
      return best?.spec.key ?? null;
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
      b.z = b.r * 0.9;
      held = { die: d, ox: b.x - x, oy: b.y - y, samples: [{ x, y, t: performance.now() }] };
      wake();
    },
    drag(x, y) {
      if (!held) return;
      const b = held.die.body;
      const now = performance.now();
      const nx = Math.min(bounds.right - b.r, Math.max(bounds.left + b.r, x + held.ox));
      const ny = Math.min(bounds.bottom - b.r, Math.max(bounds.top + b.r, y + held.oy));
      // Turning in the hand: roll a little with the motion.
      const dx = nx - b.x, dy = ny - b.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.01) {
        const ang = (dist / b.r) * 0.6;
        const ax = dy / dist, ay = dx / dist;
        const s = Math.sin(ang / 2);
        const q = new THREE.Quaternion(ax * s, ay * s, 0, Math.cos(ang / 2)).multiply(new THREE.Quaternion(b.q[0], b.q[1], b.q[2], b.q[3])).normalize();
        b.q = [q.x, q.y, q.z, q.w];
      }
      b.x = nx;
      b.y = ny;
      held.samples.push({ x, y, t: now });
      while (held.samples.length > 2 && now - held.samples[0].t > 90) held.samples.shift();
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
      launch(b, vx, vy, speed > 260 ? 120 + speed * 0.1 : 0, [vy / r + (Math.random() - 0.5) * speed * 0.01, vx / r + (Math.random() - 0.5) * speed * 0.01, (Math.random() - 0.5) * speed * 0.006]);
      wake();
      return speed;
    },
    toss(key, vx, vy, hop) {
      const d = dice.get(key);
      if (!d) return;
      const sp = Math.hypot(vx, vy);
      const k = 0.012 * sp + 8;
      launch(d.body, vx, vy, hop, [(Math.random() - 0.5) * 2 * k, (Math.random() - 0.5) * 2 * k, (Math.random() - 0.5) * k]);
      d.body.z = 2;
      wake();
    },
    turnTo(key, face) {
      const d = dice.get(key);
      if (!d) return;
      d.body.force = face;
      launch(d.body, 0, 0, 560, [(Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 8]);
      d.body.z = 2;
      wake();
    },
    home(key, x, y, face) {
      const d = dice.get(key);
      if (!d) return;
      sendHome(d.body, x, y, face, 0.42 + Math.min(0.4, Math.hypot(d.body.x - x, d.body.y - y) / 2400));
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
      for (const d of order) disposeDie(d);
      order.length = 0;
      dice.clear();
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
