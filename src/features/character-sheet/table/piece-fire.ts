/**
 * Fire round a piece on the table (owner, v0.47.11: the old fire licked only a square's edges). One canvas over the
 * whole table draws every burning piece: a quad round each, where layered value noise rising through a teardrop
 * envelope makes flames that wrap the piece and climb above it, the piece itself showing through the heart of it.
 * Each piece burns at a level from 0 (out) to 1 (ablaze), so a charge can be seen catching before it goes off.
 * One WebGL context and one draw per burning piece; the loop sleeps when nothing burns.
 */
import { FIRE_FRAG, FIRE_VERT } from '@/lib/flames';

export interface FireLayer {
  /** Burn a piece at this level (0 puts it out, gently); `cold`, it freezes instead (frost fumes, v0.47.18). */
  set(key: string, level: number, cold?: boolean): void;
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
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  const u = (n: string) => gl.getUniformLocation(prog, n);
  const uRect = u('uRect'), uRes = u('uRes'), uTime = u('uTime'), uSeed = u('uSeed'), uI = u('uI'), uAspect = u('uAspect'), uCold = u('uCold');
  gl.uniform1f(u('uHeart'), 1);

  /** Each fire: the level it is at and the one it is heading for (it eases, so it never pops). */
  const fires = new Map<string, { level: number; target: number; seed: number; cold: boolean }>();
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
      gl.uniform1f(uCold, f.cold ? 1 : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    if (fires.size) raf = requestAnimationFrame(frame);
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
