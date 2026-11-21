/**
 * Fire round a piece on the table (owner, v0.47.11: the old fire licked only a square's edges). One canvas over the
 * whole table draws every burning piece: a quad round each, where layered value noise rising through a teardrop
 * envelope makes flames that wrap the piece and climb above it, the piece itself showing through the heart of it.
 * Each piece burns at a level from 0 (out) to 1 (ablaze), so a charge can be seen catching before it goes off.
 * One WebGL context and one draw per burning piece; the loop sleeps when nothing burns.
 */
import { FIRE_FRAG, FIRE_VERT } from '@/lib/flames';

export interface FireLayer {
  /** Burn a piece at this level (0 puts it out, gently); `true`, it freezes instead (frost fumes), 'spark' it crackles with lightning (v0.47.18). */
  set(key: string, level: number, cold?: boolean | 'spark'): void;
  /**
   * It catches all at once (v0.47.20, owner: a tiny glow while it builds, then cranked to the max with the sound): the
   * fire, frost or lightning jumps to full, flares past it and settles back.
   */
  spike(key: string, cold?: boolean | 'spark'): void;
  /**
   * An element token at rest gives off its element's particles, nothing more (owner, v0.47.26: the flames, frost and
   * bolts are for when it is charged): embers, frost flakes, drops or sparks. `null` stops them.
   */
  aura(key: string, el: Aura | null): void;
  /** A bolt of lightning from one point to another for `ms` (table px): a lightning token's arc (v0.47.19). */
  arc(ax: number, ay: number, bx: number, by: number, ms?: number): void;
  /** Put every fire out at once (the table was cleared). */
  clear(): void;
  dispose(): void;
}

export type Aura = 'fire' | 'ice' | 'water' | 'spark';

/** Where a piece is drawn on the table, and how big it is (px); null once it is gone. */
export type PieceAt = (key: string) => { x: number; y: number; size: number } | null;

export function createFireLayer(host: HTMLElement, where: PieceAt): FireLayer | null {
  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '21' });
  host.appendChild(canvas);
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false, alpha: true });
  if (!gl) { canvas.remove(); return null; }
  const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, FIRE_VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FIRE_FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.remove(); return null; }
  // The lightning's paths (owner, v0.47.19: the charged dice had the glow but no bolts): drawn in 2D over the glow.
  const bolts = document.createElement('canvas');
  Object.assign(bolts.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '22' });
  host.appendChild(bolts);
  const g2 = bolts.getContext('2d');
  // The element tokens' particles, on a 2D layer of their own under the bolts.
  const dust = document.createElement('canvas');
  Object.assign(dust.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '21' });
  host.appendChild(dust);
  const g3 = dust.getContext('2d');
  const auras = new Map<string, { el: Aura; acc: number }>();
  const motes: { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; el: Aura }[] = [];
  /** How many a second each gives off. */
  const RATE: Record<Aura, number> = { fire: 9, ice: 6, water: 5, spark: 7 };
  let dustDirty = false;
  /** Move and draw the particles; true while there are any to draw. */
  const drawDust = (dt: number, dpr: number): boolean => {
    if (!g3) return false;
    for (const [key, a] of auras) {
      const at = where(key);
      if (!at) { auras.delete(key); continue; }
      a.acc += dt * RATE[a.el];
      while (a.acc >= 1 && motes.length < 320) {
        a.acc -= 1;
        const ang = Math.random() * Math.PI * 2, r = at.size * (0.2 + Math.random() * 0.3);
        const x = at.x + Math.cos(ang) * r, y = at.y + Math.sin(ang) * r * 0.7;
        // Embers rise, frost drifts out, drops fall, sparks jump.
        const v = a.el === 'fire' ? [(Math.random() - 0.5) * 14, -28 - Math.random() * 30] : a.el === 'ice' ? [Math.cos(ang) * 12, Math.sin(ang) * 8 - 4] : a.el === 'water' ? [(Math.random() - 0.5) * 8, 10 + Math.random() * 12] : [Math.cos(ang) * 55, Math.sin(ang) * 55];
        const max = a.el === 'spark' ? 0.18 + Math.random() * 0.15 : 0.7 + Math.random() * 0.6;
        motes.push({ x, y, vx: v[0], vy: v[1], life: max, max, size: a.el === 'spark' ? 1.2 : 1.4 + Math.random() * 1.6, el: a.el });
      }
    }
    if (!motes.length) {
      if (dustDirty) { g3.setTransform(1, 0, 0, 1, 0, 0); g3.clearRect(0, 0, dust.width, dust.height); dustDirty = false; }
      return auras.size > 0;
    }
    const cw = Math.round(host.clientWidth * dpr), ch = Math.round(host.clientHeight * dpr);
    if (dust.width !== cw || dust.height !== ch) { dust.width = cw; dust.height = ch; }
    g3.setTransform(1, 0, 0, 1, 0, 0);
    g3.clearRect(0, 0, cw, ch);
    g3.setTransform(dpr, 0, 0, dpr, 0, 0);
    g3.globalCompositeOperation = 'lighter';
    for (let i = motes.length - 1; i >= 0; i--) {
      const m = motes[i];
      m.life -= dt;
      if (m.life <= 0) { motes.splice(i, 1); continue; }
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      const t = m.life / m.max;
      if (m.el === 'spark') {
        g3.strokeStyle = `rgba(255,236,120,${t})`;
        g3.lineWidth = m.size;
        g3.beginPath(); g3.moveTo(m.x, m.y); g3.lineTo(m.x - m.vx * 0.04, m.y - m.vy * 0.04); g3.stroke();
        continue;
      }
      g3.fillStyle = m.el === 'fire' ? `rgba(255,${120 + Math.round(t * 90)},40,${t * 0.9})` : m.el === 'ice' ? `rgba(200,236,255,${t * 0.8})` : `rgba(90,160,255,${t * 0.8})`;
      g3.beginPath();
      g3.arc(m.x, m.y, m.size * (m.el === 'fire' ? t : 1), 0, Math.PI * 2);
      g3.fill();
    }
    g3.globalCompositeOperation = 'source-over';
    dustDirty = true;
    return true;
  };
  /** Bolts in flight: each a jagged path, redrawn fresh every few frames while it lasts. */
  const arcs: { ax: number; ay: number; bx: number; by: number; until: number }[] = [];
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  const u = (n: string) => gl.getUniformLocation(prog, n);
  const uRect = u('uRect'), uRes = u('uRes'), uTime = u('uTime'), uSeed = u('uSeed'), uI = u('uI'), uAspect = u('uAspect'), uCold = u('uCold'), uSpark = u('uSpark');
  gl.uniform1f(u('uHeart'), 1);

  /** Each fire: the level it is at and the one it is heading for (it eases, so it never pops). */
  const fires = new Map<string, { level: number; target: number; seed: number; cold: boolean | 'spark'; boost: number }>();
  let raf = 0;
  let last = 0;
  const t0 = performance.now();
  const W = 2.3, Hk = 3.2;
  /** A jagged path from a to b: the middle pushed aside, then each half again, `depth` times. */
  const jag = (ax: number, ay: number, bx: number, by: number, depth: number, out: number[]) => {
    if (depth <= 0) { out.push(bx, by); return; }
    const mx = (ax + bx) / 2, my = (ay + by) / 2, len = Math.hypot(bx - ax, by - ay);
    const off = (Math.random() - 0.5) * len * 0.42;
    const nx = -(by - ay) / (len || 1), ny = (bx - ax) / (len || 1);
    jag(ax, ay, mx + nx * off, my + ny * off, depth - 1, out);
    jag(mx + nx * off, my + ny * off, bx, by, depth - 1, out);
  };
  const strokeBolt = (g: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, w: number, alpha: number) => {
    const pts = [ax, ay];
    jag(ax, ay, bx, by, 4, pts);
    // A branch off it now and then.
    const branch = Math.random() < 0.5 ? Math.floor(pts.length / 4) * 2 : -1;
    for (const [lw, col] of [[w * 3.2, `rgba(255,214,70,${0.28 * alpha})`], [w, `rgba(255,252,220,${alpha})`]] as const) {
      g.lineWidth = lw;
      g.strokeStyle = col;
      g.beginPath();
      g.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
      if (branch > 0) {
        const x0 = pts[branch], y0 = pts[branch + 1], a = Math.atan2(by - ay, bx - ax) + (Math.random() < 0.5 ? 0.7 : -0.7), l = Math.hypot(bx - ax, by - ay) * 0.35;
        const sub = [x0, y0];
        jag(x0, y0, x0 + Math.cos(a) * l, y0 + Math.sin(a) * l, 3, sub);
        g.moveTo(sub[0], sub[1]);
        for (let i = 2; i < sub.length; i += 2) g.lineTo(sub[i], sub[i + 1]);
      }
      g.stroke();
    }
  };
  let boltAt = 0;
  /** Bolts round each charged piece, between charged pieces near each other, and the arcs; true while any is left. */
  const drawBolts = (now: number, dpr: number): boolean => {
    if (!g2) return false;
    const live = [...fires].filter(([, f]) => f.cold === 'spark' && f.level > 0.08).map(([k, f]) => [k, { level: f.level + f.boost * 1.2 }] as const);
    for (let i = arcs.length - 1; i >= 0; i--) if (arcs[i].until < now) arcs.splice(i, 1);
    // Lightning flickers: a fresh shape every ~55 ms, not every frame.
    if (now - boltAt < 55 && (live.length || arcs.length)) return true;
    boltAt = now;
    const cw = Math.round(host.clientWidth * dpr), ch = Math.round(host.clientHeight * dpr);
    if (bolts.width !== cw || bolts.height !== ch) { bolts.width = cw; bolts.height = ch; }
    g2.setTransform(1, 0, 0, 1, 0, 0);
    g2.clearRect(0, 0, cw, ch);
    if (!live.length && !arcs.length) return false;
    g2.setTransform(dpr, 0, 0, dpr, 0, 0);
    g2.globalCompositeOperation = 'lighter';
    g2.lineCap = 'round';
    g2.lineJoin = 'round';
    const pts: { x: number; y: number; size: number; level: number }[] = [];
    for (const [key, f] of live) {
      const at = where(key);
      if (!at) continue;
      pts.push({ ...at, level: f.level });
      // Two or three short bolts crackling out of the piece, longer as the charge builds.
      const n = 1 + Math.round(f.level * 2);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, r0 = at.size * 0.3, r1 = at.size * (0.75 + f.level * (0.6 + Math.random() * 0.7));
        strokeBolt(g2, at.x + Math.cos(a) * r0, at.y + Math.sin(a) * r0, at.x + Math.cos(a + (Math.random() - 0.5) * 0.8) * r1, at.y + Math.sin(a + (Math.random() - 0.5) * 0.8) * r1, 1.3, Math.min(1, 0.35 + f.level));
      }
    }
    // Charged pieces near each other are joined (a bundle of them crackles as one).
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const p = pts[i], q = pts[j];
        if (Math.hypot(p.x - q.x, p.y - q.y) > 220 || Math.random() < 0.35) continue;
        strokeBolt(g2, p.x, p.y, q.x, q.y, 1.6, Math.min(p.level, q.level));
      }
    }
    for (const a of arcs) strokeBolt(g2, a.ax, a.ay, a.bx, a.by, 2.2, 1);
    g2.globalCompositeOperation = 'source-over';
    return true;
  };

  const frame = (now: number) => {
    raf = 0;
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.round(host.clientWidth * dpr), ch = Math.round(host.clientHeight * dpr);
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    gl.viewport(0, 0, cw, ch);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(uRes, cw, ch);
    gl.uniform1f(uTime, (now - t0) / 1000);
    gl.uniform1f(uAspect, Hk / W);
    for (const [key, f] of fires) {
      const at = where(key);
      // Rising fast, dying a little slower.
      f.level += (f.target - f.level) * (1 - Math.exp(-dt * (f.target > f.level ? 9 : 4)));
      if (!at || (f.target === 0 && f.level < 0.02)) { fires.delete(key); continue; }
      f.boost = Math.max(0, f.boost - dt * 1.8);
      const k = 1 + f.boost * 0.8;
      const w = at.size * W * k * dpr, h = at.size * Hk * k * dpr;
      // The piece's centre sits 30% up the quad; GL counts up from the bottom.
      gl.uniform4f(uRect, at.x * dpr - w / 2, ch - (at.y * dpr + 0.3 * h), w, h);
      gl.uniform1f(uSeed, f.seed);
      gl.uniform1f(uI, Math.min(1.3, f.level + f.boost * 0.3));
      gl.uniform1f(uCold, f.cold === true ? 1 : 0);
      gl.uniform1f(uSpark, f.cold === 'spark' ? 1 : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    const crackling = drawBolts(now, dpr);
    const dusty = drawDust(dt, dpr);
    if (fires.size || crackling || dusty) raf = requestAnimationFrame(frame);
    else last = 0;
  };
  const wake = () => { if (!raf) raf = requestAnimationFrame(frame); };

  return {
    set(key, level, cold = false) {
      const v = Math.max(0, Math.min(1, level));
      const f = fires.get(key);
      if (f) { f.target = v; if (v > 0) f.cold = cold; }
      else if (v > 0) fires.set(key, { level: 0, target: v, seed: Math.random(), cold, boost: 0 });
      wake();
    },
    spike(key, cold = false) {
      const f = fires.get(key);
      if (f) Object.assign(f, { level: 1, target: 1, cold, boost: 1 });
      else fires.set(key, { level: 1, target: 1, seed: Math.random(), cold, boost: 1 });
      boltAt = 0;
      wake();
    },
    aura(key, el) {
      if (!el) { auras.delete(key); return; }
      const a = auras.get(key);
      if (a) a.el = el; else auras.set(key, { el, acc: Math.random() });
      wake();
    },
    arc(ax, ay, bx, by, ms = 260) {
      arcs.push({ ax, ay, bx, by, until: performance.now() + ms });
      boltAt = 0;
      wake();
    },
    clear() {
      fires.clear();
      arcs.length = 0;
      wake();
    },
    dispose() {
      cancelAnimationFrame(raf);
      canvas.remove();
      bolts.remove();
      dust.remove();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
