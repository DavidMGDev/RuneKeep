import { useEffect, useRef } from 'react';
import { View } from 'react-native';

import { useReducedMotion } from '@/hooks/use-reduced-motion';

/** How many motes for a 1000 x 1000 px table; a bigger table gets proportionally more. */
const DENSITY = 95;
/** Of those, the share drawn large and soft, out of focus, for depth. */
const SOFT = 0.16;
/** The pointer's reach, px, and how far a mote at its centre is pushed aside. */
const REACH = 150;
const PUSH = 26;

type Mote = { x: number; y: number; r: number; vy: number; sway: number; phase: number; a: number; ox: number; oy: number; soft: boolean };

/**
 * The desktop table's backdrop (v0.45.0, owner): faint gold motes drifting up through the dark, like dust in
 * lamplight. They part a little around the pointer and glow slightly brighter near it, then settle back, so the
 * table answers the mouse without ever competing with the cards. One canvas, about 30 frames a second, paused
 * while the tab is hidden; still under reduced motion.
 */
export function TableMotes() {
  const hostRef = useRef<View>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const host = hostRef.current as unknown as HTMLElement | null;
    if (!host || typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none' });
    host.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) { canvas.remove(); return; }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0, h = 0;
    let motes: Mote[] = [];
    const seed = (y?: number): Mote => {
      const soft = Math.random() < SOFT;
      return {
        x: Math.random() * w, y: y ?? Math.random() * h, soft,
        r: soft ? 7 + Math.random() * 9 : 0.8 + Math.random() * 1.4,
        vy: soft ? 3 + Math.random() * 4 : 5 + Math.random() * 11, sway: 6 + Math.random() * 14, phase: Math.random() * Math.PI * 2,
        a: soft ? 0.05 + Math.random() * 0.06 : 0.16 + Math.random() * 0.3, ox: 0, oy: 0,
      };
    };
    const resize = () => {
      const r = host.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round((w * h) / 1e6 * DENSITY);
      motes = motes.slice(0, n);
      while (motes.length < n) motes.push(seed());
      if (reduced) draw(0, 0); // resizing clears the canvas; a still table is drawn again
    };

    // The pointer, in table coordinates; off the table it lets go.
    let px = -1e4, py = -1e4;
    const onMove = (e: PointerEvent) => { const r = host.getBoundingClientRect(); px = e.clientX - r.left; py = e.clientY - r.top; };
    const onLeave = () => { px = -1e4; py = -1e4; };
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);

    // A faint warm light trails the pointer, eased so it glides rather than sticks.
    let gx = -1e4, gy = -1e4;
    const draw = (t: number, dt: number) => {
      ctx.clearRect(0, 0, w, h);
      if (px > -1e3) {
        if (gx < -1e3) { gx = px; gy = py; }
        gx += (px - gx) * Math.min(1, dt * 5); gy += (py - gy) * Math.min(1, dt * 5);
        const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, 220);
        g.addColorStop(0, 'rgba(224,181,99,0.06)');
        g.addColorStop(1, 'rgba(224,181,99,0)');
        ctx.fillStyle = g;
        ctx.fillRect(gx - 220, gy - 220, 440, 440);
      }
      for (const m of motes) {
        m.y -= m.vy * dt;
        if (m.y < -10) Object.assign(m, seed(h + 10));
        const bx = m.x + Math.sin(t * 0.25 + m.phase) * m.sway;
        // Pushed aside near the pointer, easing back once it moves on.
        const dx = bx - px, dy = m.y - py, d = Math.hypot(dx, dy);
        const near = d < REACH ? 1 - d / REACH : 0;
        const tx = near ? (dx / (d || 1)) * PUSH * near * near : 0;
        const ty = near ? (dy / (d || 1)) * PUSH * near * near : 0;
        m.ox += (tx - m.ox) * Math.min(1, dt * 6);
        m.oy += (ty - m.oy) * Math.min(1, dt * 6);
        const twinkle = 0.75 + 0.25 * Math.sin(t * 1.3 + m.phase * 3);
        const x = bx + m.ox, y = m.y + m.oy;
        if (m.soft) {
          // Out of focus: a soft disc, a little brighter near the pointer.
          const g = ctx.createRadialGradient(x, y, 0, x, y, m.r);
          g.addColorStop(0, `rgba(224,181,99,${Math.min(0.2, m.a * twinkle + near * 0.06)})`);
          g.addColorStop(1, 'rgba(224,181,99,0)');
          ctx.globalAlpha = 1;
          ctx.fillStyle = g;
          ctx.fillRect(x - m.r, y - m.r, m.r * 2, m.r * 2);
          continue;
        }
        ctx.globalAlpha = Math.min(0.8, m.a * twinkle + near * 0.35);
        ctx.fillStyle = '#E0B563';
        ctx.beginPath();
        ctx.arc(x, y, m.r + near * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    let raf = 0, last = 0;
    const loop = (ms: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden || ms - last < 32) return;
      const dt = last ? Math.min(0.1, (ms - last) / 1000) : 0.016;
      last = ms;
      draw(ms / 1000, dt);
    };
    if (!reduced) raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      canvas.remove();
    };
  }, [reduced]);

  return <View ref={hostRef} pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }} />;
}
