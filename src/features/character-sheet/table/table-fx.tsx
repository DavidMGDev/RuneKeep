/**
 * What the table draws for the Deck of Many Things (v0.47.3, owner): the cards drawn from it, the light and air of
 * each card's magic, cards breaking into shards, and the whole table shaking when something hits a wall hard.
 *
 * All DOM and CSS, over the felt and under the dice (the 3D pieces break in the engine, see `shatter`). Every effect
 * removes itself when it has played; reduced motion keeps the light and drops the shaking.
 */
import { memo, useEffect, useRef, useState } from 'react';

import { FORGED_H, FORGED_W } from '@/features/create/components/forged-card';
import { CardFace, type TableCard } from './desk-carousel';
import { type DomatCard, domatArt, DOMAT_H, DOMAT_W } from './domat';
import { T } from './table-ui';
import { cue } from './table-sound';

export type FxKind = 'ring' | 'flash' | 'vortex' | 'implode' | 'fire' | 'spark' | 'smoke' | 'stone' | 'claw' | 'consume' | 'rune' | 'word' | 'impact' | 'veil' | 'frost' | 'mist';
export interface Fx { id: number; kind: FxKind; x: number; y: number; r: number; ms: number; tint?: string; /** What a 'word' says. */ label?: string }

const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Shake the table: a short, decaying jitter (power 0 to about 1.5). */
export function shake(el: HTMLElement | null, power: number): void {
  if (!el || reduced() || power <= 0.05) return;
  const amp = Math.min(22, 6 + power * 12);
  const frames: Keyframe[] = [];
  for (let i = 0; i <= 10; i++) {
    const k = (1 - i / 10) * amp;
    frames.push({ transform: i === 10 ? 'none' : `translate(${((Math.random() - 0.5) * 2 * k).toFixed(1)}px, ${((Math.random() - 0.5) * 2 * k).toFixed(1)}px) rotate(${((Math.random() - 0.5) * k * 0.06).toFixed(2)}deg)` });
  }
  el.animate(frames, { duration: 340 + power * 260, easing: 'linear' });
}

/** The light and air of every effect that is playing. */
export const FxLayer = memo(function FxLayer({ fx }: { fx: Fx[] }) {
  return (
    <div aria-hidden="true" className="rk-fx" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 24, overflow: 'hidden' }}>
      {fx.map((f) => <FxOne key={f.id} f={f} />)}
    </div>
  );
});

function FxOne({ f }: { f: Fx }) {
  const tint = f.tint ?? '#E0B563';
  const d = f.r * 2;
  const box = { position: 'absolute' as const, left: f.x - f.r, top: f.y - f.r, width: d, height: d };
  switch (f.kind) {
    case 'flash':
      return <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at ${f.x}px ${f.y}px, #fff, ${tint} 30%, rgba(255,255,255,0.4) 60%)`, animation: `rk-flash ${f.ms}ms ease-out forwards` }} />;
    case 'ring':
      return <div style={{ ...box, borderRadius: '50%', border: `3px solid ${tint}`, boxShadow: `0 0 30px ${tint}, inset 0 0 30px ${tint}`, animation: `rk-ring ${f.ms}ms cubic-bezier(0.16,1,0.3,1) forwards` }} />;
    case 'vortex':
      return <div style={{ ...box, borderRadius: '50%', background: `conic-gradient(from 0deg, transparent, ${tint}aa, transparent 30%, ${tint}66, transparent 60%, ${tint}aa, transparent)`, maskImage: 'radial-gradient(circle, transparent 8%, #000 30%, #000 55%, transparent 70%)', WebkitMaskImage: 'radial-gradient(circle, transparent 8%, #000 30%, #000 55%, transparent 70%)', animation: `rk-vortex ${f.ms}ms linear forwards` }} />;
    case 'implode':
      return <div style={{ ...box, borderRadius: '50%', background: `radial-gradient(circle, #000 0%, #000 18%, ${tint}55 40%, transparent 70%)`, animation: `rk-implode ${f.ms}ms ease-in forwards` }} />;
    case 'fire':
      return <div style={{ ...box, borderRadius: '50%', background: 'radial-gradient(circle, #fff3c0 0%, #ffb340 22%, #e2452c 45%, rgba(120,20,10,0.5) 62%, transparent 72%)', animation: `rk-burst ${f.ms}ms ease-out forwards`, mixBlendMode: 'screen' }} />;
    case 'spark':
      return <div style={{ ...box, background: `repeating-conic-gradient(from 0deg, ${tint} 0deg 2deg, transparent 2deg 15deg)`, maskImage: 'radial-gradient(circle, #000 10%, transparent 65%)', WebkitMaskImage: 'radial-gradient(circle, #000 10%, transparent 65%)', animation: `rk-burst ${f.ms}ms ease-out forwards`, mixBlendMode: 'screen' }} />;
    case 'smoke':
      return <div style={{ ...box, borderRadius: '50%', background: 'radial-gradient(circle, rgba(40,44,40,0.75), rgba(40,44,40,0.3) 45%, transparent 70%)', animation: `rk-smoke ${f.ms}ms ease-out forwards` }} />;
    case 'stone':
      return <div style={{ ...box, borderRadius: '50%', border: '2px solid rgba(160,170,160,0.9)', background: 'radial-gradient(circle, rgba(140,150,140,0.35), transparent 70%)', animation: `rk-ring ${f.ms}ms ease-out forwards` }} />;
    case 'claw':
      return (
        <svg width={d} height={d} viewBox="0 0 100 100" style={{ ...box, animation: `rk-claw ${f.ms}ms ease-out forwards` }}>
          {[22, 40, 58, 76].map((x, i) => <path key={x} d={`M${x - 14} ${12 + i * 2} Q${x} 50 ${x + 10} ${88 - i * 2}`} stroke={tint} strokeWidth="4" fill="none" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 4px ${tint})` }} />)}
        </svg>
      );
    case 'rune':
      // A circle of runes that turns open and fades: a card leaving the deck, a card striking.
      return (
        <svg width={d} height={d} viewBox="0 0 100 100" style={{ ...box, overflow: 'visible', animation: `rk-rune ${f.ms}ms cubic-bezier(0.16,1,0.3,1) forwards`, filter: `drop-shadow(0 0 5px ${tint}) drop-shadow(0 0 14px ${tint})`, mixBlendMode: 'screen' }}>
          <circle cx="50" cy="50" r="47" fill="none" stroke={tint} strokeWidth="1.1" />
          <circle cx="50" cy="50" r="40" fill="none" stroke="#fff3d6" strokeWidth="0.6" strokeDasharray="1.5 4.5" />
          <circle cx="50" cy="50" r="27" fill="none" stroke={tint} strokeWidth="0.8" />
          {Array.from({ length: 12 }, (_, i) => (
            <g key={i} transform={`rotate(${i * 30} 50 50)`}>
              <path d={i % 3 === 0 ? 'M50 4.5 L50 13 M47 8 L53 8' : i % 3 === 1 ? 'M48 6 L52 11 L48 11 Z' : 'M50 5 L50 12'} stroke="#fff3d6" strokeWidth="0.9" fill="none" />
            </g>
          ))}
          <path d="M50 24 L57 43 L76 50 L57 57 L50 76 L43 57 L24 50 L43 43 Z" fill="none" stroke="#fff3d6" strokeWidth="0.8" />
        </svg>
      );
    case 'word':
      // A word slammed onto the table (a critical): huge, gold, shaken in, then lifting away.
      return (
        <div style={{ position: 'absolute', left: f.x, top: f.y, transform: 'translate(-50%, -50%)', pointerEvents: 'none' }}>
          <div style={{ color: '#FFF1C8', fontFamily: T.display, fontSize: f.r, letterSpacing: f.r * 0.08, whiteSpace: 'nowrap', textShadow: `0 0 18px ${tint}, 0 0 46px ${tint}, 0 4px 0 #6b4410`, animation: `rk-word ${f.ms}ms cubic-bezier(0.22,1,0.36,1) forwards` }}>{f.label}</div>
        </div>
      );
    case 'impact': {
      // A burning hit held (v0.47.12, owner: "like a smash final hit"): a jagged star of light pinned where it landed.
      const pts = Array.from({ length: 28 }, (_, i) => { const a = (i / 28) * Math.PI * 2, rr = i % 2 ? 18 + (i * 37 % 11) : 48 + (i * 53 % 9); return `${(50 + Math.cos(a) * rr).toFixed(1)},${(50 + Math.sin(a) * rr).toFixed(1)}`; }).join(' ');
      return (
        <svg width={d} height={d} viewBox="0 0 100 100" style={{ ...box, overflow: 'visible', animation: `rk-impact ${f.ms}ms cubic-bezier(0.16,1,0.3,1) forwards`, filter: `drop-shadow(0 0 10px ${tint}) drop-shadow(0 0 28px ${tint})` }}>
          <polygon points={pts} fill={tint} />
          <polygon points={pts} fill="#fffaf0" transform="translate(50 50) scale(0.62) translate(-50 -50)" />
          <circle cx="50" cy="50" r="9" fill="#ffffff" />
        </svg>
      );
    }
    case 'veil':
      // The rest of the table goes dark round the held hit, so the eye goes straight to it.
      return <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at ${f.x}px ${f.y}px, transparent ${f.r * 0.5}px, rgba(4,5,9,0.78) ${f.r * 2.4}px)`, animation: `rk-veil ${f.ms}ms ease-out forwards` }} />;
    case 'frost':
      // The Moon's ice: a pale sheen over the felt, frost creeping in from the edges.
      return <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 50%, rgba(190,225,255,0.06), rgba(190,225,255,0.16) 60%, rgba(220,240,255,0.32))', boxShadow: 'inset 0 0 90px rgba(200,232,255,0.45)', animation: `rk-frost ${f.ms}ms linear forwards` }} />;
    case 'mist':
      // A die the chest offered and nobody took, dissolving: a soft glow that swells and thins (no blur filter, so it is cheap).
      return <div style={{ ...box, borderRadius: '50%', background: `radial-gradient(circle, ${tint}aa 0%, ${tint}55 30%, ${tint}1a 52%, transparent 70%)`, animation: `rk-smoke ${f.ms}ms ease-out forwards` }} />;
    case 'consume':
      return <div style={{ ...box, borderRadius: '50%', background: `radial-gradient(circle, #fff 0%, ${tint} 25%, ${tint}55 45%, transparent 70%)`, animation: `rk-burst ${f.ms}ms ease-out forwards`, mixBlendMode: 'screen' }} />;
  }
}

/**
 * How a card breaks (owner, v0.47.12: "torn into pieces, broken, burnt, split by speed, exploded"). A plain hard hit
 * tears it in two along a ragged line; a very fast one cuts it clean along the way the breaker went; a burning one
 * sets it alight from where it was struck until it is ash; a blast blows it into a spray of shards.
 */
export type CardBreakMode = 'tear' | 'split' | 'burn' | 'explode';

export type Pt = [number, number];
/** One piece of a broken card: its outline (% of the card) and where it goes (px, degrees). */
interface Piece { poly: Pt[]; dx: number; dy: number; spin: number; delay: number }

/** The half of a polygon on the positive side of the line through `p` along `d` (Sutherland-Hodgman, one edge). */
export function clipHalf(poly: Pt[], p: Pt, d: Pt, keep: 1 | -1): Pt[] {
  const side = (q: Pt) => keep * ((q[0] - p[0]) * d[1] - (q[1] - p[1]) * d[0]);
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const sa = side(a), sb = side(b);
    if (sa >= 0) out.push(a);
    if ((sa >= 0) !== (sb >= 0)) { const t = sa / (sa - sb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}

const RECT: Pt[] = [[0, 0], [100, 0], [100, 100], [0, 100]];

/** The pieces for a mode. `dir` is the breaker's way across the card, in the card's own frame (unit). */
export function breakPieces(mode: CardBreakMode, dir: Pt, w: number, h: number): Piece[] {
  if (mode === 'split') {
    // One clean cut through the middle along the breaker's path; the halves part across it and carry on with it.
    const n: Pt = [-dir[1], dir[0]];
    const toPct: Pt = [(dir[0] * 100) / w, (dir[1] * 100) / h];
    return ([1, -1] as const).map((k) => ({
      poly: clipHalf(RECT, [50, 50], toPct, k),
      dx: dir[0] * w * 0.5 - n[0] * k * w * 0.35, dy: dir[1] * w * 0.5 - n[1] * k * w * 0.35,
      spin: -k * (12 + Math.random() * 14), delay: 0,
    }));
  }
  if (mode === 'tear') {
    // A ragged line across the card, square to the hit: torn paper, not a cut.
    const across = Math.abs(dir[0]) * w > Math.abs(dir[1]) * h; // the hit runs left-right: the tear runs top to bottom
    const line: Pt[] = [];
    const steps = 9;
    let off = 50 + (Math.random() - 0.5) * 16;
    for (let i = 0; i <= steps; i++) {
      off += (Math.random() - 0.5) * 9;
      const t = (i / steps) * 100;
      line.push(across ? [Math.min(80, Math.max(20, off)), t] : [t, Math.min(80, Math.max(20, off))]);
    }
    const a: Pt[] = across ? [[0, 0], ...line, [0, 100]] : [[0, 0], [100, 0], ...[...line].reverse()];
    const b: Pt[] = across ? [[100, 0], [100, 100], ...[...line].reverse()] : [...line, [100, 100], [0, 100]];
    const sgn = across ? Math.sign(dir[0]) || 1 : Math.sign(dir[1]) || 1;
    return [a, b].map((poly, i) => {
      const k = i === 0 ? -1 : 1;
      return { poly, dx: across ? k * w * 0.42 + sgn * w * 0.15 : sgn * w * 0.15, dy: across ? sgn * 0 + (Math.random() - 0.5) * h * 0.15 : k * h * 0.32, spin: k * (10 + Math.random() * 18), delay: 0 };
    });
  }
  // Explode: a spray of shards from a jittered grid, flung out from the middle and on the way of the blast.
  const out: Piece[] = [];
  const cols = 4, rows = 5;
  const jx = (c: number, r: number) => (c === 0 || c === cols ? 0 : ((c * 7 + r * 13) % 5 - 2) * 3.2);
  const jy = (c: number, r: number) => (r === 0 || r === rows ? 0 : ((c * 11 + r * 3) % 5 - 2) * 3.2);
  const at = (c: number, r: number): Pt => [(c / cols) * 100 + jx(c, r), (r / rows) * 100 + jy(c, r)];
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
    const q = [at(c, r), at(c + 1, r), at(c + 1, r + 1), at(c, r + 1)];
    const tris: Pt[][] = (c + r) % 2 ? [[q[0], q[1], q[2]], [q[0], q[2], q[3]]] : [[q[0], q[1], q[3]], [q[1], q[2], q[3]]];
    for (const t of tris) {
      const ox = (t[0][0] + t[1][0] + t[2][0]) / 3 / 100 - 0.5, oy = (t[0][1] + t[1][1] + t[2][1]) / 3 / 100 - 0.5;
      const f = 1.6 + Math.random() * 2.4;
      out.push({ poly: t, dx: ox * w * f + dir[0] * w * 0.6, dy: oy * h * f + dir[1] * w * 0.6, spin: (Math.random() - 0.5) * 540, delay: Math.random() * 40 });
    }
  }
  return out;
}

let burnProp = false;
/** `--rk-b`, the burn front's reach, registered once so it can be animated. */
function registerBurn() {
  if (burnProp || typeof CSS === 'undefined' || !('registerProperty' in CSS)) return;
  burnProp = true;
  try { CSS.registerProperty({ name: '--rk-b', syntax: '<percentage>', inherits: false, initialValue: '0%' }); } catch { /* already */ }
}

/** A laid card breaking, by `mode`: `dir` is the way the breaker went (table frame), `at` where it struck (table px). */
export function CardBreak({ card, cx, cy, w, rot, mode, dir, at, onDone, fxOnly, clip }: { card: TableCard; cx: number; cy: number; w: number; rot: number; mode: CardBreakMode; dir?: { x: number; y: number }; at?: { x: number; y: number }; onDone: () => void; /** Only the slash or the torn flecks: the halves are real scraps on the table (v0.47.16). */ fxOnly?: boolean; /** Only this part of the card (% of it): a scrap burning (v0.47.17). */ clip?: Pt[] }) {
  const h = (w * FORGED_H) / FORGED_W;
  const box = useRef<HTMLDivElement>(null);
  // The breaker's way and the struck point, in the card's own (turned) frame.
  const a = (-rot * Math.PI) / 180;
  const dl = Math.hypot(dir?.x ?? 0, dir?.y ?? 0) || 1;
  const ldir: Pt = dir ? [((dir.x * Math.cos(a) - dir.y * Math.sin(a)) / dl), ((dir.x * Math.sin(a) + dir.y * Math.cos(a)) / dl)] : [0, 1];
  const hx = at ? 50 + (((at.x - cx) * Math.cos(a) - (at.y - cy) * Math.sin(a)) / w) * 100 : 50;
  const hy = at ? 50 + (((at.x - cx) * Math.sin(a) + (at.y - cy) * Math.cos(a)) / h) * 100 : 50;
  const pieces = useRef(mode === 'burn' ? [] : breakPieces(mode, ldir, w, h)).current;
  const ms = mode === 'burn' ? 1700 : mode === 'explode' ? 950 : 1150;
  useEffect(() => {
    const root = box.current;
    if (!root) return;
    const anims: Animation[] = [];
    if (mode === 'burn') {
      registerBurn();
      for (const el of root.querySelectorAll<HTMLElement>('[data-burn]')) {
        anims.push(el.animate([{ '--rk-b': '0%' } as Keyframe, { '--rk-b': '140%' } as Keyframe], { duration: ms, easing: 'cubic-bezier(0.4,0.1,0.6,1)', fill: 'forwards' }));
      }
    } else {
      root.querySelectorAll<HTMLElement>('[data-piece]').forEach((el, i) => {
        const p = pieces[i];
        // A cut or a tear hangs a beat and then parts; shards go at once. Every piece lands a little lower and fades.
        const hang = mode === 'explode' ? 0 : mode === 'split' ? 70 : 120;
        anims.push(el.animate([
          { transform: 'translate(0, 0) rotate(0deg)', opacity: 1, offset: 0 },
          { transform: `translate(${(p.dx * 0.06).toFixed(1)}px, ${(p.dy * 0.06).toFixed(1)}px) rotate(${(p.spin * 0.04).toFixed(1)}deg)`, opacity: 1, offset: hang / ms },
          { transform: `translate(${p.dx.toFixed(1)}px, ${(p.dy + h * 0.12).toFixed(1)}px) rotate(${p.spin.toFixed(1)}deg)`, opacity: 1, offset: 0.62 },
          { transform: `translate(${(p.dx * 1.15).toFixed(1)}px, ${(p.dy * 1.15 + h * 0.2).toFixed(1)}px) rotate(${(p.spin * 1.2).toFixed(1)}deg)`, opacity: 0, offset: 1 },
        ], { duration: ms, delay: p.delay, easing: mode === 'explode' ? 'cubic-bezier(0.1,0.8,0.3,1)' : 'cubic-bezier(0.3,0.7,0.4,1)', fill: 'forwards' }));
      });
      for (const el of root.querySelectorAll<HTMLElement>('[data-slash]')) anims.push(el.animate([{ opacity: 1, transform: `${el.style.transform} scaleX(0.2)` }, { opacity: 1, transform: `${el.style.transform} scaleX(1.15)`, offset: 0.25 }, { opacity: 0, transform: `${el.style.transform} scaleX(1.3)` }], { duration: 420, easing: 'ease-out', fill: 'forwards' }));
    }
    const t = setTimeout(onDone, ms + 80);
    return () => { clearTimeout(t); for (const x of anims) x.cancel(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const face = <div style={{ width: FORGED_W, height: FORGED_H, transform: `scale(${w / FORGED_W})`, transformOrigin: '0 0' }}><CardFace card={card} hiRes={false} /></div>;
  const slashAng = (Math.atan2(ldir[1] * h, ldir[0] * w) * 180) / Math.PI;
  return (
    <div ref={box} aria-hidden="true" style={{ position: 'absolute', left: cx - w / 2, top: cy - h / 2, width: w, height: h, transform: `rotate(${rot}deg)`, pointerEvents: 'none', zIndex: 14, clipPath: clip ? `polygon(${clip.map(([px, py]) => `${px.toFixed(1)}% ${py.toFixed(1)}%`).join(', ')})` : undefined }}>
      {mode === 'burn' ? (
        <>
          {/* The card, eaten away from where it was struck, darkening ahead of the flame. */}
          <div data-burn="" style={{ position: 'absolute', inset: 0, filter: 'sepia(0.6) brightness(0.8)', maskImage: `radial-gradient(circle at ${hx}% ${hy}%, transparent var(--rk-b), #000 calc(var(--rk-b) + 4%))`, WebkitMaskImage: `radial-gradient(circle at ${hx}% ${hy}%, transparent var(--rk-b), #000 calc(var(--rk-b) + 4%))` }}>{face}</div>
          {/* The burning edge: a glowing rim and the char just behind it, riding the same front. */}
          <div data-burn="" style={{ position: 'absolute', inset: -2, mixBlendMode: 'screen', background: `radial-gradient(circle at ${hx}% ${hy}%, transparent calc(var(--rk-b) - 3%), #ffe9a8 calc(var(--rk-b) - 1%), #ff8a2a var(--rk-b), #c7301a calc(var(--rk-b) + 3%), transparent calc(var(--rk-b) + 7%))` }} />
          <div data-burn="" style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at ${hx}% ${hy}%, transparent var(--rk-b), rgba(30,12,6,0.85) calc(var(--rk-b) + 5%), transparent calc(var(--rk-b) + 22%))` }} />
          {Array.from({ length: 14 }, (_, i) => {
            const ex = Math.random() * 100, ey = 20 + Math.random() * 80;
            return <div key={i} style={{ position: 'absolute', left: `${ex}%`, top: `${ey}%`, width: 3, height: 3, borderRadius: '50%', background: i % 3 ? '#ffb347' : '#fff1c2', boxShadow: '0 0 6px #ff7a2a', opacity: 0, animation: `rk-ember ${700 + Math.random() * 700}ms ${200 + i * 70}ms ease-out forwards` }} />;
          })}
        </>
      ) : (
        <>
          {(fxOnly ? [] : pieces).map((p, i) => (
            <div key={i} data-piece="" style={{ position: 'absolute', inset: 0, clipPath: `polygon(${p.poly.map(([x, y]) => `${x.toFixed(1)}% ${y.toFixed(1)}%`).join(', ')})`, transformOrigin: `${(p.poly.reduce((s, q) => s + q[0], 0) / p.poly.length).toFixed(1)}% ${(p.poly.reduce((s, q) => s + q[1], 0) / p.poly.length).toFixed(1)}%`, willChange: 'transform, opacity' }}>{face}</div>
          ))}
          {mode === 'split' ? <div data-slash="" style={{ position: 'absolute', left: '50%', top: '50%', width: Math.hypot(w, h) * 1.3, height: 3, marginLeft: (-Math.hypot(w, h) * 1.3) / 2, marginTop: -1.5, background: 'linear-gradient(90deg, transparent, #fff 20%, #fff 80%, transparent)', boxShadow: '0 0 12px #fff, 0 0 26px #ffd27a', transform: `rotate(${slashAng.toFixed(1)}deg)` }} /> : null}
          {mode === 'tear' ? Array.from({ length: 9 }, (_, i) => (
            <div key={i} style={{ position: 'absolute', left: `${30 + Math.random() * 40}%`, top: `${10 + Math.random() * 80}%`, width: 4 + Math.random() * 5, height: 3 + Math.random() * 4, background: '#efe6d2', opacity: 0, animation: `rk-bit ${600 + Math.random() * 500}ms ${60 + i * 30}ms ease-out forwards`, ['--bx' as string]: `${(Math.random() - 0.5) * w}px`, ['--by' as string]: `${(Math.random() - 0.2) * h * 0.6}px` }} />
          )) : null}
        </>
      )}
    </div>
  );
}

/** The way a breaker went, turned into a card's own frame (unit). */
export function localDir(dir: { x: number; y: number } | undefined, rot: number): Pt {
  if (!dir) return [0, 1];
  const a = (-rot * Math.PI) / 180;
  const l = Math.hypot(dir.x, dir.y) || 1;
  return [(dir.x * Math.cos(a) - dir.y * Math.sin(a)) / l, (dir.x * Math.sin(a) + dir.y * Math.cos(a)) / l];
}

/** A piece of a torn card's outline (% of the whole card): its box (%), its middle, and how much of the card it is. */
export function scrapShape(poly: Pt[]) {
  const xs = poly.map((q) => q[0]), ys = poly.map((q) => q[1]);
  let area = 0, cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length];
    const c = x0 * y1 - x1 * y0;
    area += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c;
  }
  area /= 2;
  const mid: Pt = area ? [cx / (6 * area), cy / (6 * area)] : [50, 50];
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), mid, share: Math.abs(area) / 10000 };
}

/**
 * A scrap of a torn or cut card (owner, v0.47.16): a real piece on the table, knocked about like any other, drawn as
 * its part of the card. `w` is the whole card's width; the element is the scrap's own box, centred on (x, y).
 */
export function CardScrap({ uid, card, poly, w, x, y, rot, fading, onDrag }: { uid: string; card: TableCard; poly: Pt[]; w: number; x: number; y: number; rot: number; fading?: boolean; /** Carried by hand (table px), and let go (`end`). */ onDrag?: (uid: string, x: number, y: number, rot: number, end: boolean) => void }) {
  const h = (w * FORGED_H) / FORGED_W;
  const b = scrapShape(poly);
  const bx = (b.x0 / 100) * w, by = (b.y0 / 100) * h, bw = ((b.x1 - b.x0) / 100) * w, bh = ((b.y1 - b.y0) / 100) * h;
  // Picked up and carried like any physical card (owner, v0.47.17: they could only be pushed).
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !onDrag || fading) return;
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget;
    const host = el.offsetParent?.getBoundingClientRect();
    if (!host) return;
    const cx = el.offsetLeft + el.offsetWidth / 2, cy = el.offsetTop + el.offsetHeight / 2;
    const ox = cx - (e.clientX - host.left), oy = cy - (e.clientY - host.top);
    const r = Number(el.dataset.rot ?? rot) || 0;
    try { el.setPointerCapture(e.pointerId); } catch { /* gone */ }
    const move = (m: PointerEvent) => onDrag(uid, m.clientX - host.left + ox, m.clientY - host.top + oy, r, false);
    const up = (m: PointerEvent) => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); onDrag(uid, m.clientX - host.left + ox, m.clientY - host.top + oy, r, true); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  return (
    <div data-board-card={uid} aria-hidden="true" onPointerDown={down}
      style={{ position: 'absolute', left: x - bw / 2, top: y - bh / 2, width: bw, height: bh, transform: `rotate(${rot}deg)`, pointerEvents: fading ? 'none' : 'auto', cursor: 'grab', zIndex: 13, filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.5))', transition: 'opacity 450ms', opacity: fading ? 0 : 1 }}>
      <div style={{ position: 'absolute', inset: 0, clipPath: `polygon(${poly.map(([px, py]) => `${((px / 100) * w - bx).toFixed(1)}px ${((py / 100) * h - by).toFixed(1)}px`).join(', ')})` }}>
        <div style={{ position: 'absolute', left: -bx, top: -by, width: FORGED_W, height: FORGED_H, transform: `scale(${w / FORGED_W})`, transformOrigin: '0 0' }}><CardFace card={card} hiRes={false} /></div>
      </div>
    </div>
  );
}

/**
 * A card drawn from the Deck of Many Things, lying on the table (v0.47.6; v0.47.11, owner): smaller while it lies
 * there, larger in the hand. Carried, it shakes, wanting to be used; let go and it strikes there. Held still for three
 * seconds (small wobbles allowed) it calms, and then it is set down where it is let go, without striking. What it does
 * shows over it while it is pointed at or carried, above every piece. Right click gets rid of it.
 */
export function DomatCardView({ card, x, y, from, held, onMove, onPlay, onPlace, onRemove }: {
  card: DomatCard; x: number; y: number; from: { x: number; y: number };
  /** Pulled straight off the deck by a drag: it is in the hand from the start. */
  held?: boolean;
  onMove: (x: number, y: number) => void; onPlay: (x: number, y: number) => void; onPlace: (x: number, y: number) => void; onRemove: () => void;
}) {
  const [born, setBorn] = useState(!!held);
  const [hover, setHover] = useState(false);
  const [drag, setDrag] = useState(false);
  const [calm, setCalm] = useState(false);
  const [art, setArt] = useState(true);
  const shakeEl = useRef<HTMLDivElement>(null);
  const barEl = useRef<HTMLDivElement>(null);
  useEffect(() => { if (held) return; const id = requestAnimationFrame(() => requestAnimationFrame(() => setBorn(true))); return () => cancelAnimationFrame(id); }, [held]);
  const pos = useRef({ x, y });
  pos.current = { x, y };
  /** Carry it from this pointer position: `grabbed` when it was already in the hand (pulled off the deck). */
  const carry = (sx: number, sy: number, grabbed: boolean) => {
    const ox = pos.current.x, oy = pos.current.y;
    let moved = grabbed;
    let last = { x: ox, y: oy };
    if (grabbed) { setDrag(true); cue('card:lift', 'cardDragStart', { volume: 0.6 }); }
    // Stillness: how long it has stayed within a few px of where it last settled.
    let anchor = { x: sx, y: sy }, stillSince = performance.now(), calmed = false, raf = 0;
    const STILL_MS = 3000;
    const shake = () => {
      const p = Math.min(1, (performance.now() - stillSince) / STILL_MS);
      if (!calmed && p >= 1) { calmed = true; setCalm(true); cue('domat:calm', 'cardSelect', { volume: 0.5, cents: -300 }); }
      const amp = calmed ? 0 : 1.2 + 2.6 * (1 - p);
      if (shakeEl.current) shakeEl.current.style.transform = amp ? `translate(${((Math.random() - 0.5) * amp * 2).toFixed(1)}px, ${((Math.random() - 0.5) * amp * 2).toFixed(1)}px) rotate(${((Math.random() - 0.5) * amp).toFixed(2)}deg)` : 'none';
      if (barEl.current) barEl.current.style.transform = `scaleX(${calmed ? 1 : p})`;
      raf = requestAnimationFrame(shake);
    };
    if (grabbed) raf = requestAnimationFrame(shake);
    const move = (m: PointerEvent) => {
      if (!moved && Math.hypot(m.clientX - sx, m.clientY - sy) < 5) return;
      if (!moved) { moved = true; setDrag(true); cue('card:lift', 'cardDragStart', { volume: 0.6 }); raf = requestAnimationFrame(shake); }
      if (!calmed && Math.hypot(m.clientX - anchor.x, m.clientY - anchor.y) > 14) { anchor = { x: m.clientX, y: m.clientY }; stillSince = performance.now(); }
      last = { x: ox + m.clientX - sx, y: oy + m.clientY - sy };
      onMove(last.x, last.y);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      cancelAnimationFrame(raf);
      if (shakeEl.current) shakeEl.current.style.transform = 'none';
      setDrag(false);
      setCalm(false);
      if (!moved) return;
      if (calmed) { cue('card:place', 'cardDragEnd', { volume: 0.5 }); onPlace(last.x, last.y); } else onPlay(last.x, last.y);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  useEffect(() => {
    if (!held) return;
    // Pulled off the deck: the pointer is already down and on the card.
    const first = (m: PointerEvent) => { window.removeEventListener('pointermove', first); carry(m.clientX - 0.001, m.clientY, true); };
    window.addEventListener('pointermove', first);
    return () => window.removeEventListener('pointermove', first);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const start = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    carry(e.clientX, e.clientY, false);
  };
  const tx = born ? x : from.x, ty = born ? y : from.y;
  const up = hover || drag;
  // The description sits above it, or below when it is near the top of the table.
  const below = ty - (DOMAT_H * 1.06) / 2 < 170;
  return (
    <div data-domat={card.id} onPointerDown={start} onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
      role="img" aria-label={`${card.name}. ${card.table} Drag it and let go to use it; hold it still to set it down instead; right click to get rid of it.`}
      style={{
        position: 'absolute', left: tx - DOMAT_W / 2, top: ty - DOMAT_H / 2, width: DOMAT_W, height: DOMAT_H, zIndex: up ? 1240 : 15, cursor: drag ? 'grabbing' : 'grab', touchAction: 'none',
        transform: born ? `rotate(${drag ? -4 : 2}deg) scale(${drag ? 1.06 : hover ? 0.84 : 0.76})` : 'rotate(-30deg) scale(0.3)',
        transition: drag ? `transform 160ms ${T.ease}` : `left 520ms ${T.ease}, top 520ms ${T.ease}, transform 360ms ${T.ease}`,
      }}>
      <div ref={shakeEl} style={{ position: 'absolute', inset: 0, boxShadow: drag ? `0 20px 44px rgba(0,0,0,0.65), 0 0 ${calm ? 14 : 26}px ${calm ? 'rgba(255,240,210,0.55)' : `${card.tint}aa`}` : `0 8px 20px rgba(0,0,0,0.55), 0 0 ${hover ? 18 : 0}px ${card.tint}88`, transition: 'box-shadow 240ms' }}>
        <div style={{ position: 'absolute', inset: 0, background: '#120a1c', border: `2px solid ${calm ? '#F3E3BC' : '#E0B563'}`, boxSizing: 'border-box', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: `radial-gradient(circle at 50% 40%, ${card.tint}, #120a1c 75%)` }}>
            {art ? <img src={domatArt(card.id)} alt="" draggable={false} onError={() => setArt(false)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} /> : (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff7e0', fontFamily: T.display, fontSize: 44, textShadow: `0 0 18px ${card.tint}` }}>{card.name.replace(/^The /, '')[0]}</div>
            )}
          </div>
          <div style={{ height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderTop: '1px solid rgba(224,181,99,0.6)', color: T.ivory, fontFamily: T.bold, fontSize: 10.5, letterSpacing: 1.2, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{card.name}</div>
          {/* Three seconds held still calms it: this fills as it does. */}
          {drag ? <div ref={barEl} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: calm ? '#F3E3BC' : card.tint, transformOrigin: 'left', transform: 'scaleX(0)' }} /> : null}
        </div>
      </div>
      {up ? (
        <div style={{ position: 'absolute', left: '50%', ...(below ? { top: '100%', marginTop: 12 } : { bottom: '100%', marginBottom: 12 }), transform: `translateX(-50%) rotate(${drag ? 4 : -2}deg) scale(${1 / (drag ? 1.06 : hover ? 0.84 : 0.76)})`, transformOrigin: below ? 'top center' : 'bottom center', width: 250, padding: '11px 13px', background: 'rgba(11,14,19,0.97)', border: `1px solid ${calm ? '#F3E3BC' : T.goldSoft}`, boxShadow: '0 12px 28px rgba(0,0,0,0.6)', pointerEvents: 'none' }}>
          <div style={{ color: T.goldText, fontFamily: T.bold, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' }}>{card.name}</div>
          <div style={{ color: T.ivory, fontFamily: T.medium, fontSize: 14, lineHeight: '19px', marginTop: 4 }}>{card.table}</div>
          <div style={{ color: calm ? '#F3E3BC' : T.muted, fontFamily: T.medium, fontSize: 12.5, lineHeight: '17px', marginTop: 7 }}>
            {!drag ? 'Drag it where it should strike and let go. Hold it still to set it down instead. Right click to get rid of it.'
              : calm ? 'Calm. Let go to set it down without using it.'
                : 'Let go to use it here. Hold it still for three seconds to calm it.'}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** The keyframes the effects use; added once with the table's own CSS. */
export const FX_CSS = `
@keyframes rk-ember { 0% { opacity: 0; transform: translate(0, 0) scale(1); } 15% { opacity: 1; } 100% { opacity: 0; transform: translate(6px, -46px) scale(0.4); } }
@keyframes rk-bit { 0% { opacity: 1; transform: translate(0, 0) rotate(0deg); } 100% { opacity: 0; transform: translate(var(--bx), var(--by)) rotate(260deg); } }
@keyframes rk-impact { 0% { transform: scale(0.2) rotate(0deg); opacity: 1; } 12% { transform: scale(1.05) rotate(6deg); opacity: 1; } 80% { transform: scale(1.12) rotate(14deg); opacity: 1; } 100% { transform: scale(1.6) rotate(20deg); opacity: 0; } }
@keyframes rk-veil { 0% { opacity: 0; } 8% { opacity: 1; } 85% { opacity: 1; } 100% { opacity: 0; } }
@keyframes rk-frost { 0% { opacity: 0; } 6% { opacity: 1; } 90% { opacity: 1; } 100% { opacity: 0; } }
@keyframes rk-flash { 0% { opacity: 0.95; } 100% { opacity: 0; } }
@keyframes rk-word { 0% { transform: scale(2.6); opacity: 0; } 14% { transform: scale(0.94); opacity: 1; } 22% { transform: scale(1.06) rotate(-1.5deg); } 30% { transform: scale(1) rotate(1deg); } 70% { transform: scale(1.02); opacity: 1; } 100% { transform: translateY(-40px) scale(1.12); opacity: 0; } }
@keyframes rk-rune { 0% { transform: scale(0.25) rotate(-80deg); opacity: 0; } 18% { opacity: 1; } 70% { opacity: 0.9; } 100% { transform: scale(1) rotate(110deg); opacity: 0; } }
@keyframes rk-ring { 0% { transform: scale(0.05); opacity: 1; } 100% { transform: scale(1); opacity: 0; } }
@keyframes rk-burst { 0% { transform: scale(0.1); opacity: 1; } 60% { opacity: 0.8; } 100% { transform: scale(1.1); opacity: 0; } }
@keyframes rk-vortex { 0% { transform: rotate(0deg) scale(0.3); opacity: 0; } 15% { opacity: 1; } 85% { opacity: 1; } 100% { transform: rotate(1440deg) scale(0.15); opacity: 0; } }
@keyframes rk-implode { 0% { transform: scale(1.2); opacity: 0; } 30% { opacity: 1; } 90% { transform: scale(0.2); opacity: 1; } 100% { transform: scale(0.05); opacity: 0; } }
@keyframes rk-smoke { 0% { transform: scale(0.3); opacity: 0.9; } 100% { transform: scale(1.3); opacity: 0; } }
@keyframes rk-claw { 0% { clip-path: inset(0 0 100% 0); opacity: 1; } 35% { clip-path: inset(0 0 0 0); opacity: 1; } 100% { clip-path: inset(0 0 0 0); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .rk-fx > * { animation-duration: 1ms !important; } }
`;
