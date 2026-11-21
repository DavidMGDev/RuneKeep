/**
 * The play table's dice physics (v0.47.0): a top-down table where dice slide, bounce off the rail and each other,
 * hop when thrown, and tumble in 3D as they roll, then come to rest flat on a face.
 *
 * Deliberately small. The table is a plane seen from above, so position and collision are 2D (x, y in table px,
 * plus a height for the hop) while the orientation is a full 3D quaternion driven by rolling: a die moving at
 * v spins about the axis lying flat and square to v, the way a ball rolls. When it slows it settles onto the face
 * nearest the top with a short turn, and THAT face is the result: nothing is decided before the dice land.
 *
 * Pure (no three.js), so it is tested on its own and runs the same in any frame loop.
 */

export type Quat = [number, number, number, number]; // x, y, z, w
export type Vec3 = [number, number, number];

export interface DieFace { n: Vec3; up: Vec3 }

export interface Body {
  key: string;
  /** Centre on the table, px. */
  x: number;
  y: number;
  /** Height of the centre above where it rests, px. */
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Collision radius on the table, px. */
  r: number;
  q: Quat;
  /**
   * Angular velocity, rad/s. Orientation lives in a right-handed frame: X right, Y up the screen, Z out of the
   * table towards the viewer (three.js's own), while x and y above are screen px with y running down.
   */
  w: Vec3;
  faces: DieFace[];
  /** Held under the pointer: moved by the caller, ignores gravity and friction, pushes others. */
  held: boolean;
  /** At rest: skipped until something touches it. */
  asleep: boolean;
  /** The face that settled on top, once asleep. */
  top: number;
  /** Settle with the face's art upright on screen (icons), not merely flat (numbers). */
  upright: boolean;
  /** Only these faces may end up on top (a control die with its icon on two faces). */
  restFaces?: number[];
  /** Never moves (the token supply): others bounce off it like a held die. */
  fixed?: boolean;
  /** A token chip: slides, never tumbles. */
  flat?: boolean;
  /** Land on this face instead of the nearest one (the category die turning to the deck picked). */
  force?: number;
  /** The closing turn onto a face. */
  settle?: { from: Quat; to: Quat; t: number; ms: number };
  /** Flying home (reset): an arc from where it was to where it lives. */
  home?: { fx: number; fy: number; tx: number; ty: number; t: number; dur: number; spin?: Vec3; z0?: number; lift?: number };
  /**
   * Moves only by hopping (v0.47.7, owner: control dice that hop): thrown or knocked, it jumps upright to where it
   * would have slid, never tumbles, and only turns when told to show another face.
   */
  hopper?: boolean;
  /** A piece of the supply: copies thrown out of it pass through it (and the rest of the supply) while fresh. */
  spawner?: boolean;
  /** A copy just out of the supply: it passes through every spawner until it is clear of them all. */
  fresh?: boolean;
  /**
   * Extra push (v0.47.5, owner): whatever this hits is knocked `power * gen / 5` times harder than a plain hit, and
   * carries the push on one generation weaker, down to nothing after `gen`. A launched piece starts at 5, a fresh
   * copy weaker; it lasts until the piece settles.
   */
  boost?: { gen: number; power: number; soft?: boolean };
  /**
   * A charged throw (v0.47.11, owner): fast enough, it breaks the loose pieces it hits, up to `left` of them. On fire
   * it breaks whatever loose piece it passes through and touches nothing else, until it slows down.
   */
  /** `strike`: an aimed shot (a held piece let go, v0.47.16) whose first break is held as an impact frame, unlit. */
  /** Seconds left in the air (the Roll button's leap): no friction, no grip on the spin, no settling (v0.47.31). */
  air?: number;
  breaker?: { left: number; fire: boolean; strike?: boolean; /** Frozen (v0.47.18): breaks as fire does, cold. */ cold?: boolean; /** Never these (the dice of the same charged throw, v0.47.18). */ spare?: Set<string> };
  /** A loose token or die: a charged throw can break it. */
  breakable?: boolean;
  /**
   * An element token (owner, v0.47.19): ice slides as on the Moon, fire burns the physical cards it touches; water
   * and lightning act through the table (a wave off a wall, arcs to what it hits).
   */
  element?: 'fire' | 'ice' | 'water' | 'spark';
  /** Broken this step: gone from the table as soon as the step ends. */
  broken?: boolean;
  /**
   * A card made physical (v0.47.3, owner): a w x h box turned by `a` (radians, clockwise on screen) that slides,
   * spins (`va`, rad/s) and is knocked about, but never tumbles. `r` is its half diagonal, for the broad check.
   */
  box?: { w: number; h: number };
  a?: number;
  va?: number;
  /** Heavier things are knocked less far (a die is 1). */
  mass?: number;
  /** Passes through everything (a piece riding a physical card: the card's box takes the knocks). */
  ghost?: boolean;
  /**
   * Charged with lightning (owner, v0.47.18, a swung bundle): it keeps `speed` and bounces off the walls with none
   * lost for `left` seconds, then stops dead where it is, spinning, and lands on whatever face comes up (a 'pound').
   */
  zap?: { speed: number; left: number };
}

export interface Bounds { left: number; top: number; right: number; bottom: number }
/** Something on the table dice cannot pass through (a panel lying on the felt). */
/**
 * A rectangle pieces keep out of. `only`: just the cards, or just the dice and tokens (v0.47.25: the physical
 * carousel stops dice and tokens, never a card). `id` names it in the hits it takes.
 */
export type Obstacle = Bounds & { id?: string; only?: 'cards' | 'pieces' };

export interface Impact {
  key: string; speed: number; kind: 'table' | 'rail' | 'die' | 'break' | 'pound';
  /** For a break: what broke it, and whether it was burning (or an aimed strike, or frozen). */ by?: string; fire?: boolean; strike?: boolean; cold?: boolean;
  /** A card set alight by a fire token's touch (v0.47.19): it burns, with no impact frame. */ scorch?: boolean;
  /** The other piece in a knock between two (the elements of the Deck of Many Things read who met whom). */ other?: string;
  /** For a break: how the breaker was moving (px/s), which way a card is torn or cut. */ vx?: number; vy?: number;
  /** A knock against a named obstacle (the physical carousel), which way it was struck (its outward normal), and
   *  whether what struck it was charged (burning, frozen, lightning: a breaker). */ wall?: string; ny?: number; charged?: boolean;
}

/** How fast (px/s, against the piece) a charged throw must hit a loose piece to break it. */
export const BREAK_SPEED = 1700;

/**
 * A force over part of the table for a while (the Deck of Many Things): a push out from a point (negative pulls
 * in), or a whirl round it. `k` is px/s² at the centre, fading to nothing at `r`.
 */
export interface Field { kind: 'radial' | 'vortex' | 'wind'; x: number; y: number; r: number; k: number; /** Only these pieces feel it (v0.47.17: the Void's pull took the controls too). */ only?: Set<string> }
/**
 * A ring on the felt (the Donjon's cage, v0.47.12): what was inside when it closed stays inside, everything else
 * bounces off its outside. Cards pass over it.
 */
export interface Cage { x: number; y: number; r: number; inside: Set<string> }
/** What the whole table is like for a step: its fields, and how slippery the felt is (1 is normal). */
export interface World { fields?: Field[]; friction?: number; cages?: Cage[] }

const RAIL_BOUNCE = 0.5;
const DIE_BOUNCE = 0.42;
const FRICTION = 980; // px/s² of slowdown while sliding on the felt
const DRAG = 1.2; // and a little in proportion to speed
const ROLL_GRIP = 7; // how fast the spin locks to the roll
const SPIN_DAMP = 2.4; // spin about the vertical dies away
const SETTLE_SPEED = 22;
const SETTLE_SPIN = 3;
const SETTLE_MS = 170;
export const STEP = 1 / 120;

// ------------------------------------------------------------------------------------------------ quaternions

export function qMul(a: Quat, b: Quat): Quat {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

export function qNorm(q: Quat): Quat {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

export function qRotate(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1];
  const iy = w * v[1] + z * v[0] - x * v[2];
  const iz = w * v[2] + x * v[1] - y * v[0];
  const iw = -x * v[0] - y * v[1] - z * v[2];
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
}

/** The shortest turn taking unit vector a onto unit vector b. */
export function qFromTo(a: Vec3, b: Vec3): Quat {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (d < -0.999999) {
    // Opposite: any axis square to a.
    const ax: Vec3 = Math.abs(a[0]) < 0.9 ? [0, -a[2], a[1]] : [a[2], 0, -a[0]];
    const l = Math.hypot(...ax);
    return [ax[0] / l, ax[1] / l, ax[2] / l, 0];
  }
  return qNorm([a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0], 1 + d]);
}

export function qSlerp(a: Quat, b: Quat, t: number): Quat {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb = b;
  if (d < 0) { d = -d; bb = [-b[0], -b[1], -b[2], -b[3]]; }
  if (d > 0.9995) return qNorm([a[0] + (bb[0] - a[0]) * t, a[1] + (bb[1] - a[1]) * t, a[2] + (bb[2] - a[2]) * t, a[3] + (bb[3] - a[3]) * t]);
  const th = Math.acos(d);
  const s = Math.sin(th);
  const ka = Math.sin((1 - t) * th) / s;
  const kb = Math.sin(t * th) / s;
  return [a[0] * ka + bb[0] * kb, a[1] * ka + bb[1] * kb, a[2] * ka + bb[2] * kb, a[3] * ka + bb[3] * kb];
}

/** A uniformly random orientation (Shoemake). */
export function qRandom(rand: () => number = Math.random): Quat {
  const u1 = rand(), u2 = rand() * Math.PI * 2, u3 = rand() * Math.PI * 2;
  const a = Math.sqrt(1 - u1), b = Math.sqrt(u1);
  return [a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3)];
}

const UP: Vec3 = [0, 0, 1];

/** The face pointing most nearly up for orientation q. */
export function topFace(q: Quat, faces: DieFace[], allowed?: number[]): number {
  let best = allowed?.[0] ?? 0;
  let bz = -Infinity;
  faces.forEach((f, i) => {
    if (allowed && !allowed.includes(i)) return;
    const z = qRotate(q, f.n)[2];
    if (z > bz) { bz = z; best = i; }
  });
  return best;
}

/** The orientation that lays `face` flat on top, turning as little as possible from q (and upright if asked). */
export function restOn(q: Quat, face: DieFace, upright: boolean): Quat {
  let out = qMul(qFromTo(qRotate(q, face.n), UP), q);
  if (upright) {
    const u = qRotate(out, face.up);
    const half = (Math.PI / 2 - Math.atan2(u[1], u[0])) / 2; // turn the art's up onto screen up (+Y)
    out = qMul([0, 0, Math.sin(half), Math.cos(half)], out);
  }
  return qNorm(out);
}

// ------------------------------------------------------------------------------------------------ the world

export function makeBody(key: string, x: number, y: number, r: number, faces: DieFace[], opts: { upright?: boolean; q?: Quat } = {}): Body {
  const upright = !!opts.upright;
  const q0 = opts.q ?? [0, 0, 0, 1];
  const top = topFace(q0, faces);
  return { key, x, y, z: 0, vx: 0, vy: 0, vz: 0, r, q: restOn(q0, faces[top], upright), w: [0, 0, 0], faces, held: false, asleep: true, top, upright };
}

/** Wake a body and set it moving. */
export function launch(b: Body, vx: number, vy: number, vz: number, spin: Vec3): void {
  b.asleep = false;
  b.settle = undefined;
  b.home = undefined;
  b.vx = vx;
  b.vy = vy;
  b.vz = vz;
  b.w = [...spin];
}

/**
 * Advance the world by one fixed step, split into as many sub-steps as the fastest die needs so that no die moves
 * more than 40% of the smallest radius at a time (v0.47.1, owner: a hard throw flew straight through other dice).
 * Returns the impacts that happened, for sound.
 */
export function step(bodies: Body[], bounds: Bounds, dt: number = STEP, rand: () => number = Math.random, obstacles: Obstacle[] = [], world: World = {}): Impact[] {
  let fast = 0;
  let fastR = 0;
  let small = Infinity;
  for (const b of bodies) {
    if (b.ghost) continue;
    small = Math.min(small, b.box ? Math.min(b.box.w, b.box.h) / 2 : b.r);
    const sp = !b.asleep && !b.held ? Math.hypot(b.vx, b.vy) : 0;
    if (sp > fast) { fast = sp; fastR = b.box ? Math.min(b.box.w, b.box.h) / 2 : b.r; }
  }
  // A field wakes whatever it reaches.
  for (const f of world.fields ?? []) for (const b of bodies) if (!b.fixed && !b.held && !b.home && (!f.only || f.only.has(b.key)) && (f.kind === 'wind' || Math.hypot(b.x - f.x, b.y - f.y) < f.r)) { b.asleep = false; b.settle = undefined; }
  // Small enough steps that the fastest piece never jumps clean past the smallest one (both radii count: v0.47.12,
  // owner: a burning throw took 20 substeps a step against the smallest radius alone, and the table lagged).
  const n = Math.min(24, Math.max(1, Math.ceil((fast * dt) / ((Math.max(4, small) + fastR) * 0.45))));
  const hits: Impact[] = [];
  for (let i = 0; i < n; i++) hits.push(...subStep(bodies, bounds, dt / n, obstacles, world));
  void rand;
  return hits;
}

function applyFields(b: Body, fields: Field[], dt: number): void {
  for (const f of fields) {
    if (f.only && !f.only.has(b.key)) continue;
    // A wind blows the same everywhere: (x, y) is its push, px/s².
    if (f.kind === 'wind') { b.vx += f.x * dt; b.vy += f.y * dt; continue; }
    const dx = b.x - f.x, dy = b.y - f.y;
    const d = Math.hypot(dx, dy);
    if (d >= f.r || d < 1) continue;
    const fall = 1 - d / f.r;
    const a = f.k * fall * dt;
    if (f.kind === 'radial') { b.vx += (dx / d) * a; b.vy += (dy / d) * a; }
    else { b.vx += (-dy / d) * a - (dx / d) * a * 0.35; b.vy += (dx / d) * a - (dy / d) * a * 0.35; }
  }
}

/** A card's corners on the table. */
export function boxCorners(b: Body): [number, number][] {
  const { w, h } = b.box!;
  const c = Math.cos(b.a ?? 0), s = Math.sin(b.a ?? 0);
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([lx, ly]) => [b.x + lx * c - ly * s, b.y + lx * s + ly * c]);
}

const BOX_FRICTION = 1250;
const BOX_SPIN_DAMP = 3.2;

/** A physical card: slides, spins, bounces off the rail by its corners. */
function boxStep(b: Body, bounds: Bounds, dt: number, hits: Impact[], world: World, obstacles: Obstacle[] = []): void {
  if (world.fields?.length) applyFields(b, world.fields, dt);
  const fr = world.friction ?? 1;
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > 0) {
    const dec = Math.min(sp, (BOX_FRICTION * fr + DRAG * sp) * dt);
    b.vx -= (b.vx / sp) * dec;
    b.vy -= (b.vy / sp) * dec;
  }
  // Spin dies with the slide: a card never keeps turning in place once it has stopped moving.
  b.va = (b.va ?? 0) * Math.max(0, 1 - (BOX_SPIN_DAMP + (sp < 80 ? 14 : 0)) * fr * dt);
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.a = (b.a ?? 0) + b.va * dt;
  const m = b.mass ?? 3;
  const I = (m * (b.box!.w ** 2 + b.box!.h ** 2)) / 12;
  // The corner furthest past each rail is pushed back, and the knock turns the card.
  for (const [cx, cy] of boxCorners(b)) {
    const pen: [number, number, number][] = [];
    if (cx < bounds.left) pen.push([bounds.left - cx, 1, 0]);
    if (cx > bounds.right) pen.push([cx - bounds.right, -1, 0]);
    if (cy < bounds.top) pen.push([bounds.top - cy, 0, 1]);
    if (cy > bounds.bottom) pen.push([cy - bounds.bottom, 0, -1]);
    // Inside an obstacle (the hand's own area): out by its nearest side.
    for (const o of obstacles) {
      if (o.only === 'pieces' || cx <= o.left || cx >= o.right || cy <= o.top || cy >= o.bottom) continue;
      const opts: [number, number, number][] = [[cx - o.left, -1, 0], [o.right - cx, 1, 0], [cy - o.top, 0, -1], [o.bottom - cy, 0, 1]];
      pen.push(opts.reduce((m, q) => (q[0] < m[0] ? q : m)));
    }
    for (const [p, nx, ny] of pen) {
      b.x += nx * p;
      b.y += ny * p;
      const rx = cx - b.x, ry = cy - b.y;
      const vn: number = (b.vx - (b.va ?? 0) * ry) * nx + (b.vy + (b.va ?? 0) * rx) * ny;
      if (vn >= 0) continue;
      const rn = rx * ny - ry * nx;
      const j: number = (-(1 + RAIL_BOUNCE) * vn) / (1 / m + (rn * rn) / I);
      b.vx += (j * nx) / m;
      b.vy += (j * ny) / m;
      b.va = (b.va ?? 0) + (rn * j) / I;
      if (-vn > 60) hits.push({ key: b.key, speed: -vn, kind: 'rail' });
    }
  }
  if (Math.hypot(b.vx, b.vy) < SETTLE_SPEED && Math.abs(b.va ?? 0) < 0.15) { b.vx = b.vy = 0; b.va = 0; b.asleep = true; }
}

function subStep(bodies: Body[], bounds: Bounds, dt: number, obstacles: Obstacle[], world: World = {}): Impact[] {
  const hits: Impact[] = [];
  for (const b of bodies) {
    // A fixed piece (the supply, an anchored token) only ever turns over where it lies, or is sent home (v0.47.23,
    // owner: the dice chest, fixed, once out of its place never went back, whatever reset it).
    if (b.asleep || b.held || b.broken || (b.fixed && !b.settle && !b.home) || (b.ghost && !b.settle && !b.home)) continue;
    // Charged with lightning: it never slows; its time up, it pounds down where it is and lands on a random face.
    if (b.zap) {
      b.zap.left -= dt;
      if (b.zap.left <= 0) {
        b.zap = undefined;
        b.breaker = undefined;
        b.vx = b.vy = 0;
        b.w = [(Math.random() - 0.5) * 90, (Math.random() - 0.5) * 90, (Math.random() - 0.5) * 20];
        hits.push({ key: b.key, speed: 0, kind: 'pound' });
      } else {
        const sp = Math.hypot(b.vx, b.vy);
        const a = sp > 1 ? Math.atan2(b.vy, b.vx) : Math.random() * Math.PI * 2;
        b.vx = Math.cos(a) * b.zap.speed;
        b.vy = Math.sin(a) * b.zap.speed;
      }
    }
    // Slowed down, a charged throw is an ordinary piece again (and a burning one stops passing through things).
    if (b.breaker && !b.zap && Math.hypot(b.vx, b.vy) < (b.breaker.fire ? 650 : 900)) b.breaker = undefined;
    if (b.box && !b.home) { boxStep(b, bounds, dt, hits, world, obstacles); continue; }
    if (b.home) {
      const h = b.home;
      h.t = Math.min(1, h.t + dt / h.dur);
      const e = 1 - Math.pow(1 - h.t, 3);
      b.x = h.fx + (h.tx - h.fx) * e;
      b.y = h.fy + (h.ty - h.fy) * e;
      // An arc from the height it was at (a hop redirected in mid-air carries on from there, never drops to the felt).
      b.z = (h.z0 ?? 0) * (1 - e) + Math.sin(Math.PI * h.t) * b.r * (h.lift ?? (h.spin ? 3.2 : 1.6));
      if (b.box) {
        // A card flying somewhere (the Deck of Many Things moving it): it glides there flat and lies still.
        if (h.t >= 1) { b.home = undefined; b.z = 0; b.vx = b.vy = 0; b.va = 0; b.asleep = true; }
        continue;
      }
      if (h.spin) {
        // Put away: it tumbles all the way in instead of landing on a face.
        const [sx, sy, sz] = h.spin;
        const wl = Math.hypot(sx, sy, sz) || 1, half = (wl * dt) / 2, k = Math.sin(half) / wl;
        b.q = qNorm(qMul([sx * k, sy * k, sz * k, Math.cos(half)], b.q));
      } else b.q = qSlerp(b.q, restOn(b.q, b.faces[b.force ?? b.top], b.upright), Math.min(1, dt * 10));
      if (h.t >= 1) { b.home = undefined; b.z = 0; b.vx = b.vy = b.vz = 0; b.w = [0, 0, 0]; beginSettle(b); }
      continue;
    }
    if (b.settle) {
      const s = b.settle;
      s.t = Math.min(1, s.t + (dt * 1000) / s.ms);
      const e = 1 - Math.pow(1 - s.t, 3);
      b.q = qSlerp(s.from, s.to, e);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vx *= 0.8;
      b.vy *= 0.8;
      if (s.t >= 1) {
        b.settle = undefined;
        b.asleep = true;
        b.vx = b.vy = 0;
        b.w = [0, 0, 0];
      }
      continue;
    }
    if (b.hopper) {
      // Whatever set it moving (a throw, a knock), it hops to where it would have slid, upright, and lands.
      const sp = Math.hypot(b.vx, b.vy);
      b.w = [0, 0, 0];
      if (sp <= SETTLE_SPEED) { b.vx = b.vy = 0; beginSettle(b); continue; }
      const dist = Math.min(700, (sp * sp) / (2 * FRICTION) + 24);
      let tx = Math.min(bounds.right - b.r, Math.max(bounds.left + b.r, b.x + (b.vx / sp) * dist));
      let ty = Math.min(bounds.bottom - b.r, Math.max(bounds.top + b.r, b.y + (b.vy / sp) * dist));
      for (const o of obstacles) {
        if (o.only === 'cards' || tx + b.r <= o.left || tx - b.r >= o.right || ty + b.r <= o.top || ty - b.r >= o.bottom) continue;
        // It would land in the hand's own area: it lands at that area's nearest edge instead.
        const opts: [number, number, number][] = [[tx - (o.left - b.r), o.left - b.r, ty], [o.right + b.r - tx, o.right + b.r, ty], [ty - (o.top - b.r), tx, o.top - b.r], [o.bottom + b.r - ty, tx, o.bottom + b.r]];
        // Only a way out that stays on the table (the hand's area often spans it wall to wall).
        const fits = opts.filter((q) => q[1] >= bounds.left + b.r && q[1] <= bounds.right - b.r && q[2] >= bounds.top + b.r && q[2] <= bounds.bottom - b.r);
        const best = (fits.length ? fits : opts).reduce((m, q) => (q[0] < m[0] ? q : m));
        tx = Math.min(bounds.right - b.r, Math.max(bounds.left + b.r, best[1]));
        ty = Math.min(bounds.bottom - b.r, Math.max(bounds.top + b.r, best[2]));
      }
      sendHome(b, tx, ty, b.top, 0.3 + Math.hypot(tx - b.x, ty - b.y) / 1600, undefined, 1.4 + Math.hypot(tx - b.x, ty - b.y) / 220);
      continue;
    }
    // No height (v0.47.1, owner): a die never leaves the felt, so it can never pass over another one.
    b.z = 0;
    b.vz = 0;
    if (world.fields?.length) applyFields(b, world.fields, dt);
    // In the air (the Roll button's leap, v0.47.31): no felt to slow it or take hold of its spin until it comes down,
    // and then it lands hard, most of the spin gone at once.
    const airborne = (b.air ?? 0) > 0;
    if (airborne) {
      b.air = Math.max(0, b.air! - dt);
      if (!b.air) b.w = [b.w[0] * 0.3, b.w[1] * 0.3, b.w[2] * 0.3];
    }
    if (!airborne) {
      // Sliding friction and the roll taking hold of the spin.
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 0 && !b.zap) {
        // On ice (the Moon) the air drag thins with the friction too, or nothing would keep sliding (v0.47.17).
        // An ice token is always on the Moon's ice (owner, v0.47.19).
        const fr = (world.friction ?? 1) * (b.element === 'ice' ? 0.03 : 1);
        const dec = Math.min(sp, (FRICTION * fr + DRAG * sp * Math.min(1, fr * 4)) * dt);
        b.vx -= (b.vx / sp) * dec;
        b.vy -= (b.vy / sp) * dec;
      }
      const rx = b.vy / b.r, ry = b.vx / b.r; // Z × v / r, with v = (vx, -vy) in the right-handed frame
      const g = Math.min(1, ROLL_GRIP * dt);
      b.w = [b.w[0] + (rx - b.w[0]) * g, b.w[1] + (ry - b.w[1]) * g, b.w[2] * Math.max(0, 1 - SPIN_DAMP * dt)];
      if (b.flat) b.w = [0, 0, b.w[2] * 0.9];
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    // Orientation: integrate the spin.
    const [wx, wy, wz] = b.w;
    const wl = Math.hypot(wx, wy, wz);
    if (wl > 1e-6) {
      const half = (wl * dt) / 2;
      const s = Math.sin(half) / wl;
      b.q = qNorm(qMul([wx * s, wy * s, wz * s, Math.cos(half)], b.q));
    }
    // The rail.
    const rb = b.zap ? 1 : RAIL_BOUNCE;
    if (b.x < bounds.left + b.r) { b.x = bounds.left + b.r; if (b.vx < 0) { hits.push({ key: b.key, speed: -b.vx, kind: 'rail' }); b.vx = -b.vx * rb; b.w[2] += b.vy * 0.004; } }
    if (b.x > bounds.right - b.r) { b.x = bounds.right - b.r; if (b.vx > 0) { hits.push({ key: b.key, speed: b.vx, kind: 'rail' }); b.vx = -b.vx * rb; b.w[2] -= b.vy * 0.004; } }
    if (b.y < bounds.top + b.r) { b.y = bounds.top + b.r; if (b.vy < 0) { hits.push({ key: b.key, speed: -b.vy, kind: 'rail' }); b.vy = -b.vy * rb; b.w[2] -= b.vx * 0.004; } }
    if (b.y > bounds.bottom - b.r) { b.y = bounds.bottom - b.r; if (b.vy > 0) { hits.push({ key: b.key, speed: b.vy, kind: 'rail' }); b.vy = -b.vy * rb; b.w[2] += b.vx * 0.004; } }
    for (const o of obstacles) pushOut(b, o, hits);
    for (const c of world.cages ?? []) cageStep(b, c, hits);
    // Inside a field nothing settles: the field decides when it is over.
    const inField = world.fields?.some((f) => f.kind === 'wind' || Math.hypot(b.x - f.x, b.y - f.y) < f.r);
    if (!inField && !b.zap && !airborne && Math.hypot(b.vx, b.vy) < SETTLE_SPEED && Math.hypot(b.w[0], b.w[1]) < SETTLE_SPIN) beginSettle(b);
  }
  collide(bodies, hits);
  return hits;
}

/**
 * A die (circle) against a physical card (box): pushed out of the card along the shortest way and both knocked,
 * the card turning by where it was hit. Returns whether they touched.
 */
function circleBox(c: Body, b: Body, hits: Impact[]): void {
  const a = b.a ?? 0;
  const cs = Math.cos(a), sn = Math.sin(a);
  const dx = c.x - b.x, dy = c.y - b.y;
  const lx = dx * cs + dy * sn, ly = -dx * sn + dy * cs;
  const hw = b.box!.w / 2, hh = b.box!.h / 2;
  const px = Math.max(-hw, Math.min(hw, lx)), py = Math.max(-hh, Math.min(hh, ly));
  let nlx = lx - px, nly = ly - py;
  let d = Math.hypot(nlx, nly);
  let pen: number;
  if (d === 0) {
    // The centre is inside the card: out by the nearest edge.
    const opts = [[hw - lx, 1, 0], [lx + hw, -1, 0], [hh - ly, 0, 1], [ly + hh, 0, -1]] as const;
    const best = opts.reduce((m, o) => (o[0] < m[0] ? o : m));
    nlx = best[1]; nly = best[2]; pen = best[0] + c.r;
  } else {
    if (d >= c.r) return;
    nlx /= d; nly /= d; pen = c.r - d;
  }
  // Back to the table's frame: n points from the card to the die.
  const nx = nlx * cs - nly * sn, ny = nlx * sn + nly * cs;
  const ic = c.held || c.fixed ? 0 : 1 / (c.mass ?? 1);
  const ib = b.held || b.fixed ? 0 : 1 / (b.mass ?? 3);
  if (ic + ib === 0) return;
  c.x += nx * pen * (ic / (ic + ib));
  c.y += ny * pen * (ic / (ic + ib));
  b.x -= nx * pen * (ib / (ic + ib));
  b.y -= ny * pen * (ib / (ic + ib));
  const wx = b.x + (px * cs - py * sn), wy = b.y + (px * sn + py * cs); // the contact point
  const rx = wx - b.x, ry = wy - b.y;
  const va = b.va ?? 0;
  const rel = (c.vx - (b.vx - va * ry)) * nx + (c.vy - (b.vy + va * rx)) * ny;
  if (rel >= 0) return;
  const I = ((b.mass ?? 3) * (b.box!.w ** 2 + b.box!.h ** 2)) / 12;
  const rn = rx * ny - ry * nx;
  const j = (-(1 + DIE_BOUNCE) * rel) / (ic + ib + (ib ? (rn * rn) / I : 0));
  if (ic) { c.vx += j * nx * ic; c.vy += j * ny * ic; }
  const amp = c.boost ? 1 + c.boost.power * (c.boost.gen / 5) : 1;
  if (ib) { b.vx -= j * nx * ib * amp; b.vy -= j * ny * ib * amp; b.va = va - (rn * j * amp) / I; }
  for (const o of [c, b]) if (!o.held && !o.fixed) { o.asleep = false; o.settle = undefined; }
  if (-rel > 60) hits.push({ key: c.key, other: b.key, speed: -rel, kind: 'die' });
}

/** Keep a die out of a rectangle: push it to the nearest edge and bounce it off, like the rail. */
function pushOut(b: Body, o: Obstacle, hits: Impact[]): void {
  if (o.only === 'cards') return;
  const cx = Math.max(o.left, Math.min(b.x, o.right));
  const cy = Math.max(o.top, Math.min(b.y, o.bottom));
  let dx = b.x - cx, dy = b.y - cy;
  let d = Math.hypot(dx, dy);
  if (d >= b.r) return;
  if (d === 0) {
    // The centre is inside: leave by the nearest side.
    const opts = [[b.x - o.left, -1, 0], [o.right - b.x, 1, 0], [b.y - o.top, 0, -1], [o.bottom - b.y, 0, 1]] as const;
    const [, nx, ny] = opts.reduce((a, c) => (c[0] < a[0] ? c : a));
    dx = nx; dy = ny; d = 0;
    b.x = nx ? (nx < 0 ? o.left : o.right) + nx * b.r : b.x;
    b.y = ny ? (ny < 0 ? o.top : o.bottom) + ny * b.r : b.y;
  } else {
    dx /= d; dy /= d;
    b.x = cx + dx * b.r;
    b.y = cy + dy * b.r;
  }
  const into = b.vx * dx + b.vy * dy;
  if (into < 0) {
    if (-into > 60) hits.push({ key: b.key, speed: -into, kind: 'rail', ...(o.id ? { wall: o.id, ny: dy, charged: !!(b.breaker || b.zap) } : {}) });
    b.vx -= (1 + RAIL_BOUNCE) * into * dx;
    b.vy -= (1 + RAIL_BOUNCE) * into * dy;
  }
  b.asleep = false;
}

/** Keep a die on its side of a cage's ring, bouncing off it like the rail. */
function cageStep(b: Body, c: Cage, hits: Impact[]): void {
  const dx = b.x - c.x, dy = b.y - c.y;
  const d = Math.hypot(dx, dy) || 1;
  const nx = dx / d, ny = dy / d;
  const inside = c.inside.has(b.key);
  const edge = inside ? c.r - b.r : c.r + b.r;
  if (inside ? d <= edge : d >= edge) return;
  b.x = c.x + nx * edge;
  b.y = c.y + ny * edge;
  const vn = b.vx * nx + b.vy * ny;
  if (inside ? vn > 0 : vn < 0) {
    if (Math.abs(vn) > 60) hits.push({ key: b.key, speed: Math.abs(vn), kind: 'rail' });
    b.vx -= (1 + RAIL_BOUNCE) * vn * nx;
    b.vy -= (1 + RAIL_BOUNCE) * vn * ny;
  }
}

/** Whether a breaker touches a piece: circles by their radii, a card by its true outline. */
function touches(s: Body, o: Body): boolean {
  if (!o.box) return Math.hypot(o.x - s.x, o.y - s.y) < s.r + o.r;
  const a = o.a ?? 0, cs = Math.cos(a), sn = Math.sin(a);
  const dx = s.x - o.x, dy = s.y - o.y;
  const lx = dx * cs + dy * sn, ly = -dx * sn + dy * cs;
  const px = Math.max(-o.box.w / 2, Math.min(o.box.w / 2, lx)), py = Math.max(-o.box.h / 2, Math.min(o.box.h / 2, ly));
  return Math.hypot(lx - px, ly - py) < s.r;
}

/** The extra push one body passes to the one it hit (`n` points from src to tgt), and the generation after it. */
function passBoost(src: Body, tgt: Body, nx: number, ny: number, jimp: number, pre: number): void {
  const bo = src.boost;
  if (!bo || bo.gen <= 0 || tgt.held || tgt.fixed || (tgt.spawner && bo.soft)) return;
  const k = jimp * bo.power * (bo.gen / 5);
  tgt.vx += nx * k;
  tgt.vy += ny * k;
  // Energy only ever runs down the chain (owner, v0.47.11: tokens kept each other moving forever): the struck piece
  // leaves no faster than most of what hit it, and each generation passes on less.
  const cap = Math.min(7000, pre * 0.85);
  const sp = Math.hypot(tgt.vx, tgt.vy);
  if (sp > cap && sp > 0) { tgt.vx *= cap / sp; tgt.vy *= cap / sp; }
  tgt.asleep = false;
  tgt.settle = undefined;
  if (bo.gen > 1 && (tgt.boost?.gen ?? 0) < bo.gen - 1) tgt.boost = { gen: bo.gen - 1, power: bo.power * 0.7, soft: bo.soft };
}

function beginSettle(b: Body): void {
  b.boost = undefined;
  b.breaker = undefined;
  const face = b.force ?? topFace(b.q, b.faces, b.restFaces);
  b.top = face;
  b.force = undefined;
  const to = restOn(b.q, b.faces[face], b.upright);
  // A forced face can be a long way round: give a big turn more time than a nudge onto the nearest face.
  const dot = Math.min(1, Math.abs(b.q[0] * to[0] + b.q[1] * to[1] + b.q[2] * to[2] + b.q[3] * to[3]));
  b.settle = { from: b.q, to, t: 0, ms: SETTLE_MS + 420 * (2 * Math.acos(dot)) / Math.PI };
}

/** Dice push each other apart and trade momentum. Always: nothing on the table is above anything else. */
function collide(bodies: Body[], hits: Impact[]): void {
  const nearSpawner = new Set<Body>();
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j];
      if (a.home || b.home || a.ghost || b.ghost || a.broken || b.broken) continue;
      // Two pieces lying still have nothing to settle between them (most of a busy table, every step), cards included:
      // the playground's cards rest where they were set until something hits them (owner, v0.47.16).
      if (a.asleep && b.asleep) continue;
      // A charged throw breaks the loose piece it hits hard enough (burning, whatever it touches), and goes on.
      // Pieces thrown together (a charged roll of the selection) never break one another.
      const brk = (s: Body, o: Body) => !!s.breaker && s.breaker.left > 0 && !!o.breakable && !o.held && !o.breaker && !s.breaker.spare?.has(o.key);
      if (brk(a, b) || brk(b, a)) {
        const s = brk(a, b) ? a : b, o = s === a ? b : a;
        if (touches(s, o)) {
          const rel = Math.hypot(s.vx - o.vx, s.vy - o.vy);
          if (s.breaker!.fire || rel > BREAK_SPEED) {
            o.broken = true;
            s.breaker!.left--;
            hits.push({ key: o.key, speed: rel, kind: 'break', by: s.key, fire: s.breaker!.fire, strike: s.breaker!.strike, cold: s.breaker!.cold, vx: s.vx, vy: s.vy });
            // Breaking costs a little speed: more for a plain throw than for a burning one.
            const keep = s.breaker!.fire ? 0.93 : 0.78;
            s.vx *= keep;
            s.vy *= keep;
            continue;
          }
        }
      }
      // Burning, it passes through every other piece.
      if (a.breaker?.fire || b.breaker?.fire) continue;
      // A fresh copy passes through the supply it came out of (owner, v0.47.4), for as long as it overlaps it.
      if ((a.fresh && b.spawner) || (b.fresh && a.spawner)) {
        if (Math.hypot(b.x - a.x, b.y - a.y) < a.r + b.r + 4) nearSpawner.add(a.fresh ? a : b);
        continue;
      }
      if (a.box || b.box) {
        // Cards pass over one another (owner, v0.47.17: they bounced like tokens); only how they are drawn says which
        // lies on top. Dice and tokens still knock them about.
        if (a.box && b.box) continue;
        // Nor do they knock the control dice about (v0.47.18: a shattered card's pieces sent them hopping).
        if ((a.box && b.upright) || (b.box && a.upright)) continue;
        // A fire token sets a physical card it comes near alight (owner, v0.47.19): it burns away, no impact frame.
        const fe = a.element === 'fire' ? a : b.element === 'fire' ? b : null;
        const cb = fe === a ? b : a;
        if (fe && cb.box && cb.breakable && !cb.held && !fe.broken && touches({ ...fe, r: fe.r + 14 }, cb)) {
          cb.broken = true;
          hits.push({ key: cb.key, speed: 0, kind: 'break', by: fe.key, fire: true, scorch: true, vx: fe.vx, vy: fe.vy });
          continue;
        }
        if (Math.hypot(b.x - a.x, b.y - a.y) >= a.r + b.r + (fe ? 14 : 0)) continue;
        if (a.box) circleBox(b, a, hits);
        else circleBox(a, b, hits);
        continue;
      }
      const dx = b.x - a.x, dy = b.y - a.y;
      const min = a.r + b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d, ny = dy / d;
      const overlap = min - d;
      // A held die is an immovable hand; a sleeping one wakes when pushed. A spawner never gives way to the stream of
      // copies coming out of the supply (a soft push, and whatever it passed on to).
      const ia = a.held || a.fixed || (a.spawner && b.boost?.soft) ? 0 : 1, ib = b.held || b.fixed || (b.spawner && a.boost?.soft) ? 0 : 1;
      if (ia + ib === 0) continue;
      a.x -= nx * overlap * (ia / (ia + ib));
      a.y -= ny * overlap * (ia / (ia + ib));
      b.x += nx * overlap * (ib / (ia + ib));
      b.y += ny * overlap * (ib / (ia + ib));
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rel < 0) {
        const pre = Math.max(Math.hypot(a.vx, a.vy), Math.hypot(b.vx, b.vy));
        const jimp = (-(1 + DIE_BOUNCE) * rel) / (ia + ib);
        if (ia) { a.vx -= jimp * nx; a.vy -= jimp * ny; }
        if (ib) { b.vx += jimp * nx; b.vy += jimp * ny; }
        // The stronger of the two pushes the other the harder.
        if ((a.boost?.gen ?? 0) >= (b.boost?.gen ?? 0)) passBoost(a, b, nx, ny, jimp, pre);
        else passBoost(b, a, -nx, -ny, jimp, pre);
        if (-rel > 60) hits.push({ key: a.held ? b.key : a.key, other: a.held ? a.key : b.key, speed: -rel, kind: 'die' });
      }
      for (const [body, other] of [[a, b], [b, a]] as const) {
        if (body.held || body.fixed || !(body.asleep || body.settle)) continue;
        if (Math.hypot(body.vx, body.vy) > 4 || Math.hypot(other.vx, other.vy) > 30) {
          body.asleep = false;
          body.settle = undefined;
        }
      }
    }
  }
  for (const b of bodies) if (b.fresh && !nearSpawner.has(b)) b.fresh = false;
}

/**
 * Move a held die to (x, y) in steps no longer than 40% of its radius, colliding at each one, and give it the hand's
 * velocity so whatever it hits is knocked away with that speed (v0.47.1, owner: a fast swing passed through dice).
 */
export function moveHeld(bodies: Body[], held: Body, x: number, y: number, vx: number, vy: number, bounds: Bounds, obstacles: Obstacle[] = []): Impact[] {
  const hits: Impact[] = [];
  const dx = x - held.x, dy = y - held.y;
  const n = Math.min(40, Math.max(1, Math.ceil(Math.hypot(dx, dy) / (held.r * 0.4))));
  held.vx = vx;
  held.vy = vy;
  for (let i = 1; i <= n; i++) {
    held.x += dx / n;
    held.y += dy / n;
    collide(bodies, hits);
    for (const b of bodies) {
      if (b === held || b.asleep || b.ghost || b.box) continue;
      b.x = Math.min(bounds.right - b.r, Math.max(bounds.left + b.r, b.x));
      b.y = Math.min(bounds.bottom - b.r, Math.max(bounds.top + b.r, b.y));
      for (const o of obstacles) pushOut(b, o, hits);
    }
  }
  return hits;
}

/** Turn a die to show `face` on top, quickly, without moving it (the category die following the deck). */
export function snapFace(b: Body, face: number, ms = 120): void {
  b.top = face;
  b.force = undefined;
  b.asleep = false;
  b.vx = b.vy = 0;
  b.w = [0, 0, 0];
  b.settle = { from: b.q, to: restOn(b.q, b.faces[face], b.upright), t: 0, ms };
}

/** Every body at rest (nothing moving, nothing turning, nothing flying home). */
export const allAsleep = (bodies: Body[]): boolean => bodies.every((b) => (b.asleep || (b.fixed && !b.settle && !b.home)) && !b.held);

/** Send a body home in an arc, landing on `face` (or the one on top now). */
export function sendHome(b: Body, x: number, y: number, face?: number, dur = 0.5, spin?: Vec3, lift?: number): void {
  b.asleep = false;
  b.held = false;
  b.settle = undefined;
  b.vx = b.vy = b.vz = 0;
  b.w = [0, 0, 0];
  if (face !== undefined) b.force = face;
  b.home = { fx: b.x, fy: b.y, tx: x, ty: y, t: 0, dur, spin, z0: b.z, lift };
}
