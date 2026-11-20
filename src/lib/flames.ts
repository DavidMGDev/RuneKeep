/**
 * The app's flame (v0.47.12, owner: use the fire of the burning tokens and dice for the Roll and Forge buttons too,
 * and have it come up faster). One teardrop of layered value noise rising through an envelope: the burning pieces on
 * the table draw one round each piece (table/piece-fire), and a button draws a row of them along its box.
 *
 * Every button shares one WebGL context, built and compiled once while the page is idle, so lighting a button costs
 * only a 2D canvas: each frame the flames are drawn in the shared context and copied into the button's canvas.
 * Web only; `burn` returns null where there is no WebGL (the caller falls back to something else).
 */
export const FIRE_VERT = `
attribute vec2 a;
uniform vec4 uRect;
uniform vec2 uRes;
varying vec2 vUv;
void main() {
  vUv = a;
  vec2 px = uRect.xy + a * uRect.zw;
  gl_Position = vec4(px / uRes * 2.0 - 1.0, 0.0, 1.0);
}`;

export const FIRE_FRAG = `
precision mediump float;
varying vec2 vUv;
uniform float uTime;
uniform float uSeed;
uniform float uI;
uniform float uAspect;
// 1: the piece shows through the heart of its fire (a burning die); 0: solid flame (a button).
uniform float uHeart;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
void main() {
  // In quad widths, the piece's centre at the origin, up the screen positive.
  vec2 p = vec2(vUv.x - 0.5, (vUv.y - 0.3) * uAspect);
  float r = 0.215;
  float t = uTime + uSeed * 17.0;
  vec2 q = vec2(p.x * 6.5, p.y * 4.2 - t * 3.0);
  float n = fbm(q + vec2(fbm(q * 0.6 + vec2(0.0, t * 0.7)) * 1.4 - 0.7, 0.0));
  // The envelope: round the piece, drawn up into tongues the higher it burns.
  float up = max(p.y, 0.0);
  float reach = mix(0.25, 1.15, uI);
  float halfW = r * 1.4 * (1.0 - 0.8 * smoothstep(0.0, reach, up));
  float ex = abs(p.x) / max(halfW, 0.02);
  float ey = p.y < 0.0 ? -p.y / (r * 1.25) : up / (reach + r);
  float d = length(vec2(ex, ey));
  float heat = (1.0 - d) * mix(0.75, 1.15, uI) + (n - 0.47) * 1.15;
  float a = smoothstep(0.03, 0.24, heat);
  // The piece shows through the heart of its fire.
  a *= 1.0 - 0.5 * uHeart * (1.0 - smoothstep(r * 0.4, r * 1.05, length(p)));
  a *= smoothstep(0.0, 0.18, uI) * smoothstep(1.0, 0.82, vUv.y) * smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
  vec3 col = mix(vec3(0.86, 0.2, 0.04), vec3(1.0, 0.45, 0.07), smoothstep(0.04, 0.32, heat));
  col = mix(col, vec3(1.0, 0.8, 0.36), smoothstep(0.32, 0.66, heat));
  col = mix(col, vec3(1.0, 0.97, 0.86), smoothstep(0.66, 1.0, heat));
  gl_FragColor = vec4(col * a, a);
}`;

export interface FlameOpts {
  /** The box that burns, css px. */
  width: number;
  height: number;
  /** How far the flames may climb above the box, in box heights; canvas past its sides and below it, css px. */
  rise: number;
  spill: number;
  foot: number;
  /** The box's chamfer, css px (for its body). */
  chamfer: number;
  /** Draw the box's own body (an ember-dark plate with a gold edge: the Forge button), or only the flames. */
  body?: boolean;
  /** How high it burns to start with, 0 to 1. */
  level?: number;
  /** A still frame instead of the loop (reduced motion). */
  still?: boolean;
}
export interface Flames {
  /** Burn this high (0 out, 1 ablaze): it eases there. */
  level(v: number): void;
  stop(): void;
}

interface Shared { gl: WebGLRenderingContext; canvas: HTMLCanvasElement; u: Record<string, WebGLUniformLocation | null> }
let shared: Shared | null | undefined;
/** The shared context, made on first use (or while idle, see the bottom of this file). */
function context(): Shared | null {
  if (shared !== undefined) return shared;
  shared = null;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false, alpha: true });
  if (!gl) return null;
  const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, FIRE_VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FIRE_FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  const u: Shared['u'] = {};
  for (const n of ['uRect', 'uRes', 'uTime', 'uSeed', 'uI', 'uAspect', 'uHeart']) u[n] = gl.getUniformLocation(prog, n);
  // Drawn once, so the driver has finished compiling before anything is lit.
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  shared = { gl, canvas, u };
  return shared;
}

interface User { o: FlameOpts; ctx: CanvasRenderingContext2D; cw: number; ch: number; dpr: number; level: number; target: number; seeds: number[]; size: number; cy: number }
const users = new Set<User>();
let raf = 0;
let last = -1;
const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
const QW = 2.3, QH = 3.2;

function drawUser(s: Shared, u: User, ms: number) {
  const { gl } = s;
  const { o, dpr } = u;
  if (s.canvas.width < u.cw || s.canvas.height < u.ch) { s.canvas.width = Math.max(s.canvas.width, u.cw); s.canvas.height = Math.max(s.canvas.height, u.ch); }
  gl.viewport(0, 0, u.cw, u.ch);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.uniform2f(s.u.uRes, u.cw, u.ch);
  gl.uniform1f(s.u.uTime, (ms - t0) / 1000);
  gl.uniform1f(s.u.uAspect, QH / QW);
  gl.uniform1f(s.u.uI, u.level);
  gl.uniform1f(s.u.uHeart, 0);
  // A row of flames along the box, overlapping.
  const size = u.size * dpr;
  const n = u.seeds.length;
  const qw = size * QW, qh = size * QH;
  for (let i = 0; i < n; i++) {
    const cx = (o.spill + ((i + 0.5) / n) * o.width) * dpr;
    const cy = u.cy * dpr; // GL counts up from the bottom
    gl.uniform4f(s.u.uRect, cx - qw / 2, cy - 0.3 * qh, qw, qh);
    gl.uniform1f(s.u.uSeed, u.seeds[i]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  const c = u.ctx;
  c.clearRect(0, 0, u.cw, u.ch);
  if (o.body) {
    // The box itself: dark embers inside a gold edge, its corners cut.
    const x0 = o.spill * dpr, y0 = u.ch - (o.foot + o.height) * dpr, w = o.width * dpr, h = o.height * dpr, k = o.chamfer * dpr;
    c.beginPath();
    c.moveTo(x0 + k, y0); c.lineTo(x0 + w - k, y0); c.lineTo(x0 + w, y0 + k); c.lineTo(x0 + w, y0 + h - k); c.lineTo(x0 + w - k, y0 + h); c.lineTo(x0 + k, y0 + h); c.lineTo(x0, y0 + h - k); c.lineTo(x0, y0 + k); c.closePath();
    const g = c.createLinearGradient(0, y0, 0, y0 + h);
    g.addColorStop(0, '#6e1a0e');
    g.addColorStop(1, '#2a0704');
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 1.5 * dpr;
    c.strokeStyle = 'rgba(224,181,99,0.85)';
    c.stroke();
  }
  c.drawImage(s.canvas, 0, s.canvas.height - u.ch, u.cw, u.ch, 0, 0, u.cw, u.ch);
}

function frame(ms: number) {
  raf = 0;
  const s = context();
  if (!s || !users.size) return;
  // About 30 frames a second: fire reads as fire at that rate, for half the work.
  if (ms - last >= 32) {
    const dt = last < 0 ? 0.016 : Math.min(0.1, (ms - last) / 1000);
    last = ms;
    for (const u of users) {
      u.level += (u.target - u.level) * (1 - Math.exp(-dt * (u.target > u.level ? 9 : 4)));
      drawUser(s, u, ms);
    }
  }
  raf = requestAnimationFrame(frame);
}

/** Set `host` alight: a canvas in it, placed so the box's bottom-left sits at the host's own. */
export function burn(host: HTMLElement, o: FlameOpts): Flames | null {
  const s = context();
  if (!s) return null;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cssW = o.width + o.spill * 2;
  const cssH = Math.round(o.height * (1 + o.rise)) + o.foot;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  Object.assign(canvas.style, { position: 'absolute', left: `${-o.spill}px`, top: `${o.height + o.foot - cssH}px`, width: `${cssW}px`, height: `${cssH}px`, pointerEvents: 'none' });
  host.prepend(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) { canvas.remove(); return null; }
  // On its own plate the fire fills the box; round a button with its own face it rises from above the top edge, so the
  // word on it stays readable. Each flame is as big as the canvas has room for above it (never cut off flat).
  const cy = o.foot + o.height * (o.body ? 0.45 : 1.12);
  const size = Math.min(o.height * (o.body ? 0.95 : 0.8), (cssH - cy) / 2.3);
  const n = Math.max(1, Math.round(o.width / (size * 1.1)));
  const start = o.level ?? 1;
  const u: User = { o, ctx, cw: canvas.width, ch: canvas.height, dpr, level: o.still ? start : 0, target: start, seeds: Array.from({ length: n }, () => Math.random()), size, cy };
  if (o.still) { drawUser(s, u, t0 + 4000); return { level() {}, stop: () => canvas.remove() }; }
  users.add(u);
  if (!raf) raf = requestAnimationFrame(frame);
  return {
    level(v) { u.target = Math.max(0, Math.min(1, v)); },
    stop() { users.delete(u); canvas.remove(); },
  };
}

// Built while the page is idle, so the first button lit never waits for a shader to compile.
if (typeof window !== 'undefined') {
  const idle = (window as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 600));
  idle(() => { context(); });
}
