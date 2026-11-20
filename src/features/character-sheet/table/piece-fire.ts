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
  /** A bolt of lightning from one point to another for `ms` (table px): a lightning token's arc (v0.47.19). */
  arc(ax: number, ay: number, bx: number, by: number, ms?: number): void;
  /** Put every fire out at once (the table was cleared). */
  clear(): void;
  dispose(): void;
}

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
  const fires = new Map<string, { level: number; target: number; seed: number; cold: boolean | 'spark' }>();
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
    const live = [...fires].filter(([, f]) => f.cold === 'spark' && f.level > 0.08);
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
      const w = at.size * W * dpr, h = at.size * Hk * dpr;
      // The piece's centre sits 30% up the quad; GL counts up from the bottom.
      gl.uniform4f(uRect, at.x * dpr - w / 2, ch - (at.y * dpr + 0.3 * h), w, h);
      gl.uniform1f(uSeed, f.seed);
      gl.uniform1f(uI, f.level);
      gl.uniform1f(uCold, f.cold === true ? 1 : 0);
      gl.uniform1f(uSpark, f.cold === 'spark' ? 1 : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    const crackling = drawBolts(now, dpr);
    if (fires.size || crackling) raf = requestAnimationFrame(frame);
    else last = 0;
  };
  const wake = () => { if (!raf) raf = requestAnimationFrame(frame); };

  return {
    set(key, level, cold = false) {
      const v = Math.max(0, Math.min(1, level));
      const f = fires.get(key);
      if (f) { f.target = v; if (v > 0) f.cold = cold; }
      else if (v > 0) fires.set(key, { level: 0, target: v, seed: Math.random(), cold });
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
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
