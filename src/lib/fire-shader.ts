/**
 * The app's fire (v0.45.0 Forge button; shared v0.47.10): rising fractal noise shaped by a chamfered box, the box
 * burning red to orange, flames tearing off its top edge and licking up its sides, cut into hard bands on a two-pixel
 * grid, the chunky stylised fire of a card game rather than a photograph of one.
 *
 * v0.47.10 (owner): the flames rise from the box's real outline. They used to rise from its bounding box, so over a
 * chamfered corner, where there is no box, they hung in the air.
 *
 * Web only (WebGL). `startFire` draws into a canvas it puts in `host` and returns how to stop, or null when there
 * is no WebGL (the caller falls back to something else).
 */

const VERT = 'attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }';

const FRAG = `
precision mediump float;
uniform float t; uniform vec4 box; uniform float ch; uniform float px; uniform float rise;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; } return v; }
float sdChamfer(vec2 p, vec2 c, vec2 h, float k) { vec2 q = abs(p - c); vec2 d = q - h;
  float b = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); return max(b, (q.x + q.y - (h.x + h.y - k)) * 0.7071); }
vec3 ramp(float x) {
  vec3 c = vec3(0.30, 0.03, 0.03);
  c = mix(c, vec3(0.78, 0.11, 0.09), smoothstep(0.10, 0.30, x));
  c = mix(c, vec3(0.91, 0.39, 0.12), smoothstep(0.38, 0.58, x));
  c = mix(c, vec3(0.95, 0.66, 0.23), smoothstep(0.62, 0.80, x));
  c = mix(c, vec3(0.99, 0.90, 0.66), smoothstep(0.84, 0.97, x));
  return c; }
void main() {
  vec2 p = floor(gl_FragCoord.xy / px) * px + px * 0.5;
  vec2 c = (box.xy + box.zw) * 0.5, h = (box.zw - box.xy) * 0.5;
  float d = sdChamfer(p, c, h, ch);
  vec2 uv = p / (h.y * 0.9);
  float w = fbm(vec2(uv.x * 0.9, uv.y * 0.7 - t * 0.9));
  vec2 q = vec2(uv.x + 0.55 * (w - 0.5), uv.y);
  float n = fbm(vec2(q.x * 1.4, q.y * 0.9 - t * 1.9));
  float m = fbm(vec2(q.x * 2.6 + 4.0, q.y * 1.4 - t * 3.1));
  float tongue = fbm(vec2(q.x * 1.7, t * 0.7));
  // The outline's top at this column: the flat edge, dropping down the chamfer towards each corner.
  float inset = max(0.0, ch - min(p.x - box.x, box.z - p.x));
  float top = box.w - inset;
  float heat;
  if (d < 0.0) {
    float up = clamp((p.y - box.y) / (2.0 * h.y), 0.0, 1.0);
    heat = 0.26 + 0.42 * n * (0.6 + 0.6 * up) + 0.16 * m;
  } else {
    float above = p.y - top;
    if (above > 0.0) {
      float reach = 2.0 * h.y * rise * (0.2 + 1.6 * tongue * tongue);
      // Beyond the flat top the flames thin out fast: over the chamfers they hug the cut, never hang.
      float side = max(0.0, max(box.x + ch - p.x, p.x - (box.z - ch)));
      heat = 1.05 - above / reach - 0.55 * m * smoothstep(0.0, reach, above) + 0.2 * (n - 0.5) - side / (2.0 + 5.0 * m);
    } else {
      heat = (0.8 + 0.2 * m) * (1.0 - d / (3.0 + 10.0 * m));
    }
  }
  heat = clamp(heat, 0.0, 1.0);
  float band = floor(heat * 7.0) / 7.0;
  float a = smoothstep(0.08, 0.2, band);
  vec3 col = ramp(band);
  float edge = 1.0 - smoothstep(0.0, 1.6 * px, abs(d));
  col = mix(col, vec3(0.88, 0.71, 0.39), edge * 0.85);
  a = max(a, edge);
  gl_FragColor = vec4(col * a, a);
}`;

export interface FireOpts {
  /** The box that burns, css px. */
  width: number;
  height: number;
  /** How far the flames climb above the box, in box heights. */
  rise: number;
  /** Canvas past the box's sides, and below it, css px. */
  spill: number;
  foot: number;
  /** The box's chamfer, css px. */
  chamfer: number;
  /** A still frame instead of the loop (reduced motion). */
  still?: boolean;
  /** Draw the box's own body and gold edge too (the Forge button), or only the flames around it (a burning piece). */
  body?: boolean;
}

/** Light the fire in `host` (its canvas is placed so the box's bottom-left sits at the host's own). */
export function startFire(host: HTMLElement, o: FireOpts): (() => void) | null {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cssW = o.width + o.spill * 2;
  const cssH = Math.round(o.height * (1 + o.rise)) + o.foot;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  Object.assign(canvas.style, { position: 'absolute', left: `${-o.spill}px`, top: `${o.height + o.foot - cssH}px`, width: `${cssW}px`, height: `${cssH}px`, pointerEvents: 'none' });
  host.prepend(canvas);
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false });
  if (!gl) { canvas.remove(); return null; }
  const shader = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, o.body === false ? FRAG.replace('heat = 0.26 + 0.42 * n * (0.6 + 0.6 * up) + 0.16 * m;', 'heat = 0.0;').replace('a = max(a, edge);', '') : FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.remove(); return null; }
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const bx0 = o.spill * dpr, by0 = o.foot * dpr;
  gl.uniform4f(gl.getUniformLocation(prog, 'box'), bx0, by0, bx0 + o.width * dpr, by0 + o.height * dpr);
  gl.uniform1f(gl.getUniformLocation(prog, 'ch'), o.chamfer * dpr);
  gl.uniform1f(gl.getUniformLocation(prog, 'px'), 2 * dpr);
  gl.uniform1f(gl.getUniformLocation(prog, 'rise'), o.rise);
  const tLoc = gl.getUniformLocation(prog, 't');
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 0);
  const draw = (ms: number) => { gl.clear(gl.COLOR_BUFFER_BIT); gl.uniform1f(tLoc, ms / 1000); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); };
  // About 30 frames a second: fire reads as fire at that rate, for half the work.
  let raf = 0;
  let last = -1;
  const loop = (ms: number) => { if (ms - last >= 32) { draw(ms); last = ms; } raf = requestAnimationFrame(loop); };
  const stop = () => { cancelAnimationFrame(raf); gl.getExtension('WEBGL_lose_context')?.loseContext(); canvas.remove(); };
  canvas.addEventListener('webglcontextlost', () => cancelAnimationFrame(raf));
  if (o.still) draw(4000);
  else raf = requestAnimationFrame(loop);
  return stop;
}
