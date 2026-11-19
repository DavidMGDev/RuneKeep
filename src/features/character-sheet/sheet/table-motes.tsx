import { useEffect, useRef } from 'react';
import { View } from 'react-native';

import { useReducedMotion } from '@/hooks/use-reduced-motion';

/** How many motes for a 1000 x 1000 px table; a bigger table gets proportionally more. */
const DENSITY = 95;
/** Of those, the share drawn large and soft, out of focus, for depth. */
const SOFT = 0.16;
/** What a mote is worth when motes merge: a small bright one gives more than a large faint one. */
const W_SMALL = 1;
const W_SOFT = 0.35;
/** The pointer: how far it stirs motes, and how much of its own speed it hands them. */
const REACH = 170;
const SLOSH = 0.55;
/** A click: how far it reaches, how hard it pulls motes in, how long the pull lasts, and how close two motes
 *  must come near the pointer to merge. */
const PULL_R = 260;
const PULL = 900;
const PULL_S = 0.7;
const MERGE_R = 34;
/** Held down: the gust's reach and strength (px/s^2), gentle on purpose. */
const GUST_R = 280;
const GUST = 240;
const HOLD_MS = 180;
/** A right click: the blast radius, the ripple's reach, and how many pieces each merged component bursts into. */
const BLAST_R = 46;
const RIPPLE_R = 170;
const SHARDS = 5;
/** Velocities relax back to the drift at this rate (1/s). */
const DRAG = 1.4;
/** Never more than this many times the table's base population (shards fade out as they recycle). */
const CAP = 3;

type Mote = { x: number; y: number; vx: number; vy: number; base: number; r: number; sway: number; phase: number; a: number; soft: boolean; w: number; n: number; dead?: boolean };

/**
 * The desktop table's backdrop (v0.46.0, owner): faint gold motes drifting up through the dark, like dust in
 * lamplight, that the pointer can play with without the table ever competing with the cards.
 *
 * Moving the pointer sloshes the motes near it along with it. Holding the button down blows a slow gust away
 * from it. A click pulls the motes nearby in, and two that meet close to the pointer merge into a bigger one (a
 * small bright mote adds more than a large faint one). A right click blasts a small area: a merged mote bursts
 * into five pieces for every mote it was made of, and the more pieces, the harder they fly, before they slow
 * and drift up with the rest. A light trails the pointer on a spring, so a fast move closes the gap quickly
 * but never snaps to it.
 *
 * One canvas, two pre-rendered sprites, no allocation per frame. 30 frames a second at rest and 60 while
 * something is happening, paused while the tab is hidden, a still frame under reduced motion.
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

    // Sprites: a hard dot and a soft disc, drawn once and stamped with drawImage.
    const sprite = (soft: boolean) => {
      const c = document.createElement('canvas');
      const S = 64;
      c.width = S; c.height = S;
      const g = c.getContext('2d')!;
      const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      if (soft) { grad.addColorStop(0, 'rgba(224,181,99,1)'); grad.addColorStop(1, 'rgba(224,181,99,0)'); }
      else { grad.addColorStop(0, 'rgba(240,206,140,1)'); grad.addColorStop(0.45, 'rgba(224,181,99,1)'); grad.addColorStop(0.62, 'rgba(224,181,99,0.35)'); grad.addColorStop(1, 'rgba(224,181,99,0)'); }
      g.fillStyle = grad;
      g.fillRect(0, 0, S, S);
      return c;
    };
    const DOT = sprite(false), DISC = sprite(true);

    let w = 0, h = 0, target = 0;
    let motes: Mote[] = [];
    const seed = (m: Partial<Mote> & { y?: number } = {}): Mote => {
      const soft = Math.random() < SOFT;
      const base = soft ? 3 + Math.random() * 4 : 5 + Math.random() * 11;
      return {
        x: Math.random() * w, y: Math.random() * h, vx: 0, vy: -base, base, soft,
        r: soft ? 7 + Math.random() * 9 : 0.8 + Math.random() * 1.4,
        sway: 6 + Math.random() * 14, phase: Math.random() * Math.PI * 2,
        a: soft ? 0.05 + Math.random() * 0.06 : 0.16 + Math.random() * 0.3,
        w: soft ? W_SOFT : W_SMALL, n: 1, ...m,
      };
    };
    const resize = () => {
      const r = host.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      target = Math.round((w * h) / 1e6 * DENSITY);
      motes = motes.slice(0, target * CAP);
      while (motes.length < target) motes.push(seed());
      if (reduced) draw(0, 0); // resizing clears the canvas; a still table is drawn again
    };

    // ---- the pointer, in table coordinates ----
    let px = -1e4, py = -1e4, pvx = 0, pvy = 0, lastMove = 0;
    let down: { x: number; y: number; t: number; moved: boolean } | null = null;
    let pull: { x: number; y: number; t: number } | null = null;
    const ripples: { x: number; y: number; t: number }[] = [];
    let busyUntil = 0; // 60 fps until then
    const local = (e: MouseEvent) => { const r = host.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, inside: e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom }; };
    // Only the table itself plays: never a card, a control, a field, or anything outside the table.
    const table = host.parentElement;
    const plays = (e: Event) => {
      const t = e.target as HTMLElement | null;
      return !!t && !!table?.contains(t) && !t.closest('[data-card-id], button, [role="button"], [role="tab"], input, textarea, a');
    };
    const onMove = (e: PointerEvent) => {
      const p = local(e);
      if (!p.inside) { px = -1e4; py = -1e4; return; }
      const now = performance.now();
      const dt = Math.max(8, now - lastMove) / 1000;
      if (px > -1e3) { pvx += ((p.x - px) / dt - pvx) * 0.35; pvy += ((p.y - py) / dt - pvy) * 0.35; }
      px = p.x; py = p.y; lastMove = now;
      if (down && Math.hypot(p.x - down.x, p.y - down.y) > 6) down.moved = true;
      busyUntil = now + 1200;
    };
    const onLeave = () => { px = -1e4; py = -1e4; pvx = 0; pvy = 0; down = null; };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || !plays(e)) return;
      const p = local(e);
      down = { x: p.x, y: p.y, t: performance.now(), moved: false };
      busyUntil = performance.now() + 1500;
    };
    const onUp = () => {
      const d = down;
      down = null;
      if (!d || d.moved || performance.now() - d.t > HOLD_MS) return;
      pull = { x: d.x, y: d.y, t: performance.now() };
      busyUntil = performance.now() + 1500;
    };
    const onMenu = (e: MouseEvent) => {
      if (!plays(e)) return;
      e.preventDefault();
      const p = local(e);
      blast(p.x, p.y);
      busyUntil = performance.now() + 2500;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('contextmenu', onMenu);

    /** A right click: merged motes burst into shards, the rest are flung clear, and a ripple spreads. */
    const blast = (x: number, y: number) => {
      ripples.push({ x, y, t: performance.now() });
      const born: Mote[] = [];
      for (const m of motes) {
        const dx = m.x - x, dy = m.y - y, d = Math.hypot(dx, dy) || 1;
        if (d < BLAST_R && m.n > 1) {
          // More pieces fly harder.
          const pieces = Math.min(SHARDS * m.n, 160);
          const speed = 90 + Math.sqrt(pieces) * 34;
          for (let i = 0; i < pieces; i++) {
            const ang = Math.random() * Math.PI * 2, sp = speed * (0.4 + Math.random() * 0.8);
            born.push(seed({ x: m.x, y: m.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, soft: false, r: 0.6 + Math.random() * 0.9, a: 0.18 + Math.random() * 0.3, w: W_SMALL, n: 1 }));
          }
          m.dead = true;
        } else if (d < BLAST_R && Math.random() < 0.5) {
          m.dead = true; // an ordinary mote caught in the blast is gone
        } else if (d < RIPPLE_R) {
          const f = (1 - d / RIPPLE_R) * (d < BLAST_R ? 420 : 260);
          m.vx += (dx / d) * f; m.vy += (dy / d) * f;
        }
      }
      motes = motes.filter((m) => !m.dead);
      for (const b of born) if (motes.length < target * CAP) motes.push(b);
    };

    /** Two motes become one: the bigger keeps its place, nudged toward the other by what each is worth. */
    const merge = (a: Mote, b: Mote) => {
      const tw = a.w + b.w;
      a.x = (a.x * a.w + b.x * b.w) / tw; a.y = (a.y * a.w + b.y * b.w) / tw;
      a.vx = (a.vx * a.w + b.vx * b.w) / tw; a.vy = (a.vy * a.w + b.vy * b.w) / tw;
      a.w = tw; a.n += b.n; a.soft = false;
      a.r = 1.1 + Math.sqrt(tw) * 1.15;
      a.a = Math.min(0.85, 0.3 + tw * 0.07);
      b.dead = true;
    };

    // ---- the light that trails the pointer: a critically damped spring ----
    let gx = -1e4, gy = -1e4, gvx = 0, gvy = 0;
    const K = 70, C = 2 * Math.sqrt(K);
    const near: Mote[] = [];

    const draw = (t: number, dt: number) => {
      ctx.clearRect(0, 0, w, h);
      const now = performance.now();
      const live = px > -1e3;
      if (live) {
        if (gx < -1e3) { gx = px; gy = py; }
        gvx += ((px - gx) * K - gvx * C) * dt; gvy += ((py - gy) * K - gvy * C) * dt;
        gx += gvx * dt; gy += gvy * dt;
        const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, 220);
        g.addColorStop(0, 'rgba(224,181,99,0.06)');
        g.addColorStop(1, 'rgba(224,181,99,0)');
        ctx.fillStyle = g;
        ctx.fillRect(gx - 220, gy - 220, 440, 440);
      }
      pvx *= Math.exp(-dt * 6); pvy *= Math.exp(-dt * 6); // the pointer's speed fades once it stops
      const gusting = down && !down.moved && now - down.t > HOLD_MS;
      const pulling = pull && now - pull.t < PULL_S * 1000 ? pull : null;
      const pullK = pulling ? 1 - (now - pulling.t) / (PULL_S * 1000) : 0;
      if (pull && !pulling) pull = null;
      near.length = 0;
      const relax = Math.exp(-dt * DRAG);

      for (const m of motes) {
        // Drift: velocity relaxes to the mote's own upward speed.
        m.vx *= relax;
        m.vy = -m.base + (m.vy + m.base) * relax;
        if (live) {
          const dx = m.x - px, dy = m.y - py, d2 = dx * dx + dy * dy;
          if (d2 < REACH * REACH) {
            const f = 1 - Math.sqrt(d2) / REACH;
            m.vx += pvx * SLOSH * f * f * dt * 4; m.vy += pvy * SLOSH * f * f * dt * 4;
          }
          if (gusting) {
            const d = Math.sqrt(d2) || 1;
            if (d < GUST_R) { const f = (1 - d / GUST_R) * GUST * dt; m.vx += (dx / d) * f; m.vy += (dy / d) * f; }
          }
        }
        if (pulling) {
          const dx = pulling.x - m.x, dy = pulling.y - m.y, d = Math.hypot(dx, dy) || 1;
          if (d < PULL_R) {
            const f = PULL * pullK * (1 - d / PULL_R) * dt;
            m.vx += (dx / d) * f; m.vy += (dy / d) * f;
            m.vx *= 0.94; m.vy *= 0.94; // a pull that settles instead of slingshotting through
            if (d < MERGE_R) near.push(m);
          }
        }
        m.x += m.vx * dt; m.y += m.vy * dt;
        // Up and out the top: back in at the bottom. Shards and merged motes come back as ordinary ones, and
        // past the base population they do not come back at all.
        if (m.y < -20 || m.x < -40 || m.x > w + 40 || m.y > h + 60) {
          if (motes.length > target) m.dead = true;
          else Object.assign(m, seed({ y: h + 10 }));
        }
      }
      // Merging, only among the handful pulled close to the pointer.
      for (let i = 0; i < near.length; i++) {
        const a = near[i];
        if (a.dead) continue;
        for (let j = i + 1; j < near.length; j++) {
          const b = near[j];
          if (b.dead) continue;
          const lim = (a.soft ? 4 : a.r) + (b.soft ? 4 : b.r) + 3;
          if (Math.abs(a.x - b.x) < lim && Math.abs(a.y - b.y) < lim) merge(a, b);
        }
      }
      if (near.length || motes.length > target * 1.02) motes = motes.filter((m) => !m.dead);

      for (const m of motes) {
        const bx = m.x + Math.sin(t * 0.25 + m.phase) * m.sway;
        const twinkle = 0.75 + 0.25 * Math.sin(t * 1.3 + m.phase * 3);
        const close = live ? Math.max(0, 1 - Math.hypot(bx - px, m.y - py) / REACH) : 0;
        if (m.soft) {
          ctx.globalAlpha = Math.min(0.2, m.a * twinkle + close * 0.06);
          ctx.drawImage(DISC, bx - m.r, m.y - m.r, m.r * 2, m.r * 2);
        } else {
          const r = (m.r + close * 0.6) * 2.2; // the sprite's bright core is under half its width
          ctx.globalAlpha = Math.min(0.9, m.a * twinkle + close * 0.35);
          ctx.drawImage(DOT, bx - r, m.y - r, r * 2, r * 2);
        }
      }
      // Ripples: a faint ring spreading from a blast.
      for (let i = ripples.length - 1; i >= 0; i--) {
        const k = (now - ripples[i].t) / 600;
        if (k >= 1) { ripples.splice(i, 1); continue; }
        ctx.globalAlpha = 0.28 * (1 - k);
        ctx.strokeStyle = '#E0B563';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(ripples[i].x, ripples[i].y, 10 + k * RIPPLE_R, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    let raf = 0, last = 0;
    const loop = (ms: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) { last = 0; return; }
      if (ms - last < (ms < busyUntil || down ? 15 : 32)) return;
      const dt = last ? Math.min(0.05, (ms - last) / 1000) : 0.016;
      last = ms;
      draw(ms / 1000, dt);
    };
    if (!reduced) raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('contextmenu', onMenu);
      canvas.remove();
    };
  }, [reduced]);

  return <View ref={hostRef} pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }} />;
}
