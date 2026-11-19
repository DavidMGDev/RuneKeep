/**
 * Fire round a piece on the table (owner, v0.47.11: the old fire licked only a square's edges). One canvas over the
 * whole table draws every burning piece: a quad round each, where layered value noise rising through a teardrop
 * envelope makes flames that wrap the piece and climb above it, the piece itself showing through the heart of it.
 * Each piece burns at a level from 0 (out) to 1 (ablaze), so a charge can be seen catching before it goes off.
 * One WebGL context and one draw per burning piece; the loop sleeps when nothing burns.
 */

const VERT = `
attribute vec2 a;
uniform vec4 uRect;
uniform vec2 uRes;
varying vec2 vUv;
void main() {
  vUv = a;
  vec2 px = uRect.xy + a * uRect.zw;
  gl_Position = vec4(px / uRes * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;
varying vec2 vUv;
uniform float uTime;
uniform float uSeed;
uniform float uI;
uniform float uAspect;
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
  a *= 1.0 - 0.5 * (1.0 - smoothstep(r * 0.4, r * 1.05, length(p)));
  a *= smoothstep(0.0, 0.18, uI) * smoothstep(1.0, 0.82, vUv.y) * smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
  vec3 col = mix(vec3(0.86, 0.2, 0.04), vec3(1.0, 0.45, 0.07), smoothstep(0.04, 0.32, heat));
  col = mix(col, vec3(1.0, 0.8, 0.36), smoothstep(0.32, 0.66, heat));
  col = mix(col, vec3(1.0, 0.97, 0.86), smoothstep(0.66, 1.0, heat));
  gl_FragColor = vec4(col * a, a);
}`;

export interface FireLayer {
  /** Burn a piece at this level (0 puts it out, gently). */
  set(key: string, level: number): void;
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
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.remove(); return null; }
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  const u = (n: string) => gl.getUniformLocation(prog, n);
  const uRect = u('uRect'), uRes = u('uRes'), uTime = u('uTime'), uSeed = u('uSeed'), uI = u('uI'), uAspect = u('uAspect');

  /** Each fire: the level it is at and the one it is heading for (it eases, so it never pops). */
  const fires = new Map<string, { level: number; target: number; seed: number }>();
  let raf = 0;
  let last = 0;
  const t0 = performance.now();
  const W = 2.3, Hk = 3.2;

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
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    if (fires.size) raf = requestAnimationFrame(frame);
    else last = 0;
  };
  const wake = () => { if (!raf) raf = requestAnimationFrame(frame); };

  return {
    set(key, level) {
      const v = Math.max(0, Math.min(1, level));
      const f = fires.get(key);
      if (f) f.target = v;
      else if (v > 0) fires.set(key, { level: 0, target: v, seed: Math.random() });
      wake();
    },
    clear() {
      fires.clear();
      wake();
    },
    dispose() {
      cancelAnimationFrame(raf);
      canvas.remove();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
