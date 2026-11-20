/**
 * The app's flame (v0.47.12, owner: the Roll and Forge buttons burn with the same fire as the burning tokens and dice,
 * and come up faster). Layered value noise rising through an envelope: the burning pieces on the table draw a
 * teardrop of it round each piece (table/piece-fire, with FIRE_VERT and FIRE_FRAG below), and a button one
 * continuous sheet of it round its whole box (`burn`).
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
// 1: frost (v0.47.18, owner: a piece held still freezes): cold fumes, slower and sinking, ice blue to white.
uniform float uCold;
// 1: lightning (v0.47.18, owner: a swung bundle charges): fast crackling yellow, flickering.
uniform float uSpark;
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
  float t = (uTime + uSeed * 17.0) * mix(1.0, 2.6, uSpark);
  vec2 q = vec2(p.x * 6.5, p.y * 4.2 - t * mix(3.0, -1.2, uCold));
  float n = fbm(q + vec2(fbm(q * 0.6 + vec2(0.0, t * 0.7)) * 1.4 - 0.7, 0.0));
  // Lightning: the noise folded into thin bright ridges, crackling.
  n = mix(n, 1.0 - abs(n - 0.5) * 2.2, uSpark);
  // The envelope: round the piece, drawn up into tongues the higher it burns.
  float up = max(p.y, 0.0);
  float reach = mix(0.25, 1.15, uI) * mix(1.0, 0.5, uCold);
  float halfW = r * 1.4 * (1.0 + 0.4 * uCold) * (1.0 - 0.8 * smoothstep(0.0, reach, up));
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
  vec3 ice = mix(vec3(0.16, 0.36, 0.78), vec3(0.42, 0.78, 1.0), smoothstep(0.04, 0.32, heat));
  ice = mix(ice, vec3(0.78, 0.94, 1.0), smoothstep(0.32, 0.66, heat));
  ice = mix(ice, vec3(0.97, 1.0, 1.0), smoothstep(0.66, 1.0, heat));
  col = mix(col, ice, uCold);
  vec3 bolt = mix(vec3(0.95, 0.62, 0.05), vec3(1.0, 0.92, 0.25), smoothstep(0.04, 0.4, heat));
  bolt = mix(bolt, vec3(1.0, 1.0, 0.85), smoothstep(0.5, 1.0, heat));
  col = mix(col, bolt, uSpark);
  a *= mix(1.0, 0.82, uCold);
  a *= mix(1.0, 0.7 + 0.3 * step(0.45, fract(t * 7.3 + uSeed * 5.0)), uSpark);
  gl_FragColor = vec4(col * a, a);
}`;

/**
 * A button on fire (owner, v0.47.13: "one single continuous flame onto the whole button", "flaming from behind"): one
 * sheet of fire round the box's whole outline, licking off its top edge in tongues and hugging its sides, the same
 * noise and colours as a burning piece. The box itself is never covered: its plate is drawn over the fire, or, on a
 * button with its own face, cut out of it.
 */
const BOX_VERT = 'attribute vec2 a; void main() { gl_Position = vec4(a * 2.0 - 1.0, 0.0, 1.0); }';
const BOX_FRAG = `
precision mediump float;
uniform vec4 uBox;
uniform float uTime;
uniform float uI;
uniform float uRise;
uniform float uSpill;
uniform float uSeed;
uniform float uFoot;
uniform vec2 uView;
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
  vec2 p = gl_FragCoord.xy;
  vec2 c = (uBox.xy + uBox.zw) * 0.5, h = (uBox.zw - uBox.xy) * 0.5;
  float t = uTime + uSeed * 31.0;
  // In box heights, so the grain of the fire is the same on any button.
  vec2 s = p / max(2.0 * h.y, 1.0);
  // The air bends as it rises: the whole sheet sways sideways, flowing upwards.
  float sway = fbm(vec2(s.x * 1.4, s.y * 1.1 - t * 1.3));
  vec2 q = vec2(p.x + (sway - 0.5) * h.y * 1.3, p.y);
  vec2 d2 = abs(q - c) - h;
  float outside = length(max(d2, 0.0)) + min(max(d2.x, d2.y), 0.0);
  // Straight above the top edge it climbs in tongues; at the sides and below it only hugs the outline.
  float above = max(0.0, q.y - uBox.w);
  float up = outside > 0.0 ? clamp(above / outside, 0.0, 1.0) : 1.0;
  float tongue = fbm(vec2(s.x * 2.3 + uSeed * 7.0, t * 0.8));
  // Each part of the fire stays inside the room the canvas gives it: tongues up to most of the rise, a hug at the
  // sides within the spill, barely anything under the box (owner: never sliced off flat at an edge).
  float side = q.y < uBox.y ? uFoot * 0.5 : uSpill * 0.48;
  float reach = mix(side, uRise * (0.4 + 0.85 * tongue * tongue), up * up) * mix(0.35, 1.0, uI);
  float n = fbm(vec2(s.x * 3.1, s.y * 2.2 - t * 2.7));
  float heat = (1.0 - max(outside, 0.0) / max(reach, 1.0)) * mix(0.8, 1.1, uI) + (n - 0.5) * 0.75;
  heat = clamp(heat, 0.0, 1.0);
  float a = smoothstep(0.06, 0.26, heat) * smoothstep(0.0, 0.12, uI);
  // And whatever still reaches the canvas's edge thins out before it, never ends in a straight line.
  vec2 e = min(p, uView - p);
  a *= smoothstep(0.0, 14.0, e.x) * smoothstep(0.0, 10.0, e.y);
  vec3 col = mix(vec3(0.62, 0.08, 0.03), vec3(0.86, 0.2, 0.04), smoothstep(0.06, 0.25, heat));
  col = mix(col, vec3(1.0, 0.45, 0.07), smoothstep(0.25, 0.48, heat));
  col = mix(col, vec3(1.0, 0.8, 0.36), smoothstep(0.48, 0.72, heat));
  col = mix(col, vec3(1.0, 0.97, 0.86), smoothstep(0.78, 1.0, heat));
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
  /** The box's chamfer, css px. */
  chamfer: number;
  /** Draw the box's own body over the fire (an ember-dark plate with a gold edge: the Forge button). Without it the
   * box is cut out of the fire, so a button with its own face shows through untouched. */
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
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, BOX_VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, BOX_FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u: Shared['u'] = {};
  for (const n of ['uBox', 'uTime', 'uI', 'uRise', 'uSpill', 'uSeed', 'uFoot', 'uView']) u[n] = gl.getUniformLocation(prog, n);
  // Drawn once, so the driver has finished compiling before anything is lit.
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  shared = { gl, canvas, u };
  return shared;
}

interface User { o: FlameOpts; ctx: CanvasRenderingContext2D; cw: number; ch: number; dpr: number; level: number; target: number; seed: number }
const users = new Set<User>();
let raf = 0;
let last = -1;
const t0 = typeof performance !== 'undefined' ? performance.now() : 0;

/** The box's outline (corners cut), in the 2D canvas's px. */
function boxPath(c: CanvasRenderingContext2D, u: User) {
  const { o, dpr } = u;
  const x0 = o.spill * dpr, y0 = u.ch - (o.foot + o.height) * dpr, w = o.width * dpr, h = o.height * dpr, k = o.chamfer * dpr;
  c.beginPath();
  c.moveTo(x0 + k, y0); c.lineTo(x0 + w - k, y0); c.lineTo(x0 + w, y0 + k); c.lineTo(x0 + w, y0 + h - k); c.lineTo(x0 + w - k, y0 + h); c.lineTo(x0 + k, y0 + h); c.lineTo(x0, y0 + h - k); c.lineTo(x0, y0 + k); c.closePath();
  return { y0, h };
}

function drawUser(s: Shared, u: User, ms: number) {
  const { gl } = s;
  const { o, dpr } = u;
  if (s.canvas.width < u.cw || s.canvas.height < u.ch) { s.canvas.width = Math.max(s.canvas.width, u.cw); s.canvas.height = Math.max(s.canvas.height, u.ch); }
  // The viewport is the user's own corner of the shared canvas: its bottom-left, where GL counts from.
  gl.viewport(0, 0, u.cw, u.ch);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  const bx = o.spill * dpr, by = o.foot * dpr;
  gl.uniform4f(s.u.uBox, bx, by, bx + o.width * dpr, by + o.height * dpr);
  gl.uniform1f(s.u.uTime, (ms - t0) / 1000);
  gl.uniform1f(s.u.uI, u.level);
  gl.uniform1f(s.u.uRise, o.height * o.rise * dpr);
  gl.uniform1f(s.u.uSpill, o.spill * dpr);
  gl.uniform1f(s.u.uSeed, u.seed);
  gl.uniform1f(s.u.uFoot, o.foot * dpr);
  gl.uniform2f(s.u.uView, u.cw, u.ch);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  const c = u.ctx;
  c.clearRect(0, 0, u.cw, u.ch);
  c.drawImage(s.canvas, 0, s.canvas.height - u.ch, u.cw, u.ch, 0, 0, u.cw, u.ch);
  if (o.body) {
    // The plate over the fire: dark embers inside a gold edge, so the flames burn from behind it.
    const { y0, h } = boxPath(c, u);
    const g = c.createLinearGradient(0, y0, 0, y0 + h);
    g.addColorStop(0, '#6e1a0e');
    g.addColorStop(1, '#2a0704');
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 1.5 * dpr;
    c.strokeStyle = 'rgba(224,181,99,0.85)';
    c.stroke();
  } else {
    // A button with its own face: the fire is cut away where the button is, so it burns from behind it.
    c.globalCompositeOperation = 'destination-out';
    boxPath(c, u);
    c.fill();
    c.globalCompositeOperation = 'source-over';
  }
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
  const start = o.level ?? 1;
  const u: User = { o, ctx, cw: canvas.width, ch: canvas.height, dpr, level: o.still ? start : 0, target: start, seed: Math.random() };
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
