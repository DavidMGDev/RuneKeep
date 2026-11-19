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
  home?: { fx: number; fy: number; tx: number; ty: number; t: number; dur: number };
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
}

export interface Bounds { left: number; top: number; right: number; bottom: number }
/** Something on the table dice cannot pass through (a panel lying on the felt). */
export type Obstacle = Bounds;

export interface Impact { key: string; speed: number; kind: 'table' | 'rail' | 'die' }

/**
 * A force over part of the table for a while (the Deck of Many Things): a push out from a point (negative pulls
 * in), or a whirl round it. `k` is px/s² at the centre, fading to nothing at `r`.
 */
export interface Field { kind: 'radial' | 'vortex'; x: number; y: number; r: number; k: number }
/** What the whole table is like for a step: its fields, and how slippery the felt is (1 is normal). */
export interface World { fields?: Field[]; friction?: number }

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
  let small = Infinity;
  for (const b of bodies) {
    if (b.ghost) continue;
    small = Math.min(small, b.box ? Math.min(b.box.w, b.box.h) / 2 : b.r);
    if (!b.asleep && !b.held) fast = Math.max(fast, Math.hypot(b.vx, b.vy));
  }
  // A field wakes whatever it reaches.
  for (const f of world.fields ?? []) for (const b of bodies) if (!b.fixed && !b.held && !b.home && Math.hypot(b.x - f.x, b.y - f.y) < f.r) { b.asleep = false; b.settle = undefined; }
  const n = Math.min(24, Math.max(1, Math.ceil((fast * dt) / (Math.max(4, small) * 0.4))));
  const hits: Impact[] = [];
  for (let i = 0; i < n; i++) hits.push(...subStep(bodies, bounds, dt / n, obstacles, world));
  void rand;
  return hits;
}

function applyFields(b: Body, fields: Field[], dt: number): void {
  for (const f of fields) {
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
  b.va = (b.va ?? 0) * Math.max(0, 1 - BOX_SPIN_DAMP * fr * dt);
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
      if (cx <= o.left || cx >= o.right || cy <= o.top || cy >= o.bottom) continue;
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
    // A fixed piece (the supply, an anchored token) only ever turns over where it lies.
    if (b.asleep || b.held || (b.fixed && !b.settle) || (b.ghost && !b.settle)) continue;
    if (b.box) { boxStep(b, bounds, dt, hits, world, obstacles); continue; }
    if (b.home) {
      const h = b.home;
      h.t = Math.min(1, h.t + dt / h.dur);
      const e = 1 - Math.pow(1 - h.t, 3);
      b.x = h.fx + (h.tx - h.fx) * e;
      b.y = h.fy + (h.ty - h.fy) * e;
      b.z = Math.sin(Math.PI * h.t) * b.r * 1.6;
      b.q = qSlerp(b.q, restOn(b.q, b.faces[b.force ?? b.top], b.upright), Math.min(1, dt * 10));
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
    // No height (v0.47.1, owner): a die never leaves the felt, so it can never pass over another one.
    b.z = 0;
    b.vz = 0;
    if (world.fields?.length) applyFields(b, world.fields, dt);
    {
      // Sliding friction and the roll taking hold of the spin.
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 0) {
        const dec = Math.min(sp, (FRICTION * (world.friction ?? 1) + DRAG * sp) * dt);
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
    if (b.x < bounds.left + b.r) { b.x = bounds.left + b.r; if (b.vx < 0) { hits.push({ key: b.key, speed: -b.vx, kind: 'rail' }); b.vx = -b.vx * RAIL_BOUNCE; b.w[2] += b.vy * 0.004; } }
    if (b.x > bounds.right - b.r) { b.x = bounds.right - b.r; if (b.vx > 0) { hits.push({ key: b.key, speed: b.vx, kind: 'rail' }); b.vx = -b.vx * RAIL_BOUNCE; b.w[2] -= b.vy * 0.004; } }
    if (b.y < bounds.top + b.r) { b.y = bounds.top + b.r; if (b.vy < 0) { hits.push({ key: b.key, speed: -b.vy, kind: 'rail' }); b.vy = -b.vy * RAIL_BOUNCE; b.w[2] -= b.vx * 0.004; } }
    if (b.y > bounds.bottom - b.r) { b.y = bounds.bottom - b.r; if (b.vy > 0) { hits.push({ key: b.key, speed: b.vy, kind: 'rail' }); b.vy = -b.vy * RAIL_BOUNCE; b.w[2] += b.vx * 0.004; } }
    for (const o of obstacles) pushOut(b, o, hits);
    // Inside a field nothing settles: the field decides when it is over.
    const inField = world.fields?.some((f) => Math.hypot(b.x - f.x, b.y - f.y) < f.r);
    if (!inField && Math.hypot(b.vx, b.vy) < SETTLE_SPEED && Math.hypot(b.w[0], b.w[1]) < SETTLE_SPIN) beginSettle(b);
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
  if (ib) { b.vx -= j * nx * ib; b.vy -= j * ny * ib; b.va = va - (rn * j) / I; }
  for (const o of [c, b]) if (!o.held && !o.fixed) { o.asleep = false; o.settle = undefined; }
  if (-rel > 60) hits.push({ key: c.key, speed: -rel, kind: 'die' });
}

/** Two physical cards: the deepest corner of either inside the other is pushed out and both are knocked. */
function boxBox(a: Body, b: Body, hits: Impact[]): void {
  for (const [p, q, sign] of [[a, b, 1], [b, a, -1]] as const) {
    void sign;
    const ang = q.a ?? 0;
    const cs = Math.cos(ang), sn = Math.sin(ang);
    const hw = q.box!.w / 2, hh = q.box!.h / 2;
    for (const [cx, cy] of boxCorners(p)) {
      const dx = cx - q.x, dy = cy - q.y;
      const lx = dx * cs + dy * sn, ly = -dx * sn + dy * cs;
      if (Math.abs(lx) >= hw || Math.abs(ly) >= hh) continue;
      // A tiny circle at the corner, against the other card: the same maths as a die.
      const ghost: Body = { ...p, x: cx, y: cy, r: 0.5, vx: p.vx - (p.va ?? 0) * (cy - p.y), vy: p.vy + (p.va ?? 0) * (cx - p.x), box: undefined };
      const bx = ghost.x, by = ghost.y, bvx = ghost.vx, bvy = ghost.vy;
      circleBox(ghost, q, hits);
      // Carry the corner's push and knock back onto its card.
      p.x += ghost.x - bx;
      p.y += ghost.y - by;
      const m = p.mass ?? 3;
      const I = (m * (p.box!.w ** 2 + p.box!.h ** 2)) / 12;
      const jx = (ghost.vx - bvx) * (ghost.mass ?? m), jy = (ghost.vy - bvy) * (ghost.mass ?? m);
      p.vx += jx / m;
      p.vy += jy / m;
      p.va = (p.va ?? 0) + ((cx - p.x) * jy - (cy - p.y) * jx) / I;
      p.asleep = false;
      return;
    }
  }
}

/** Keep a die out of a rectangle: push it to the nearest edge and bounce it off, like the rail. */
function pushOut(b: Body, o: Obstacle, hits: Impact[]): void {
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
    if (-into > 60) hits.push({ key: b.key, speed: -into, kind: 'rail' });
    b.vx -= (1 + RAIL_BOUNCE) * into * dx;
    b.vy -= (1 + RAIL_BOUNCE) * into * dy;
  }
  b.asleep = false;
}

function beginSettle(b: Body): void {
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
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j];
      if (a.home || b.home || a.ghost || b.ghost) continue;
      if (a.box || b.box) {
        if (Math.hypot(b.x - a.x, b.y - a.y) >= a.r + b.r) continue;
        if (a.box && b.box) boxBox(a, b, hits);
        else if (a.box) circleBox(b, a, hits);
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
      // A held die is an immovable hand; a sleeping one wakes when pushed.
      const ia = a.held || a.fixed ? 0 : 1, ib = b.held || b.fixed ? 0 : 1;
      if (ia + ib === 0) continue;
      a.x -= nx * overlap * (ia / (ia + ib));
      a.y -= ny * overlap * (ia / (ia + ib));
      b.x += nx * overlap * (ib / (ia + ib));
      b.y += ny * overlap * (ib / (ia + ib));
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rel < 0) {
        const jimp = (-(1 + DIE_BOUNCE) * rel) / (ia + ib);
        if (ia) { a.vx -= jimp * nx; a.vy -= jimp * ny; }
        if (ib) { b.vx += jimp * nx; b.vy += jimp * ny; }
        if (-rel > 60) hits.push({ key: a.held ? b.key : a.key, speed: -rel, kind: 'die' });
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
export const allAsleep = (bodies: Body[]): boolean => bodies.every((b) => (b.asleep || (b.fixed && !b.settle)) && !b.held);

/** Send a body home in an arc, landing on `face` (or the one on top now). */
export function sendHome(b: Body, x: number, y: number, face?: number, dur = 0.5): void {
  b.asleep = false;
  b.held = false;
  b.settle = undefined;
  b.vx = b.vy = b.vz = 0;
  b.w = [0, 0, 0];
  if (face !== undefined) b.force = face;
  b.home = { fx: b.x, fy: b.y, tx: x, ty: y, t: 0, dur };
}
