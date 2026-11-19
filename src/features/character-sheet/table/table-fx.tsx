/**
 * What the table draws for the Deck of Many Things (v0.47.3, owner): the cards drawn from it, the light and air of
 * each card's magic, cards breaking into shards, and the whole table shaking when something hits a wall hard.
 *
 * All DOM and CSS, over the felt and under the dice (the 3D pieces break in the engine, see `shatter`). Every effect
 * removes itself when it has played; reduced motion keeps the light and drops the shaking.
 */
import { memo, useEffect, useRef, useState } from 'react';

import { FORGED_H, FORGED_W } from '@/features/create/components/forged-card';
import { playSfx } from '@/lib/sfx';
import { CardFace, type TableCard } from './desk-carousel';
import { type DomatCard, domatArt, DOMAT_H, DOMAT_W } from './domat';
import { T } from './table-ui';

export type FxKind = 'ring' | 'flash' | 'vortex' | 'implode' | 'fire' | 'spark' | 'smoke' | 'stone' | 'claw' | 'consume' | 'rune';
export interface Fx { id: number; kind: FxKind; x: number; y: number; r: number; ms: number; tint?: string }

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
    case 'consume':
      return <div style={{ ...box, borderRadius: '50%', background: `radial-gradient(circle, #fff 0%, ${tint} 25%, ${tint}55 45%, transparent 70%)`, animation: `rk-burst ${f.ms}ms ease-out forwards`, mixBlendMode: 'screen' }} />;
  }
}

/** A laid card breaking: its picture cut into triangles that fly apart, turn and fade. */
export function Shards({ card, cx, cy, w, rot, onDone }: { card: TableCard; cx: number; cy: number; w: number; rot: number; onDone: () => void }) {
  const h = (w * FORGED_H) / FORGED_W;
  const [go, setGo] = useState(false);
  const pieces = useRef(makeShards()).current;
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setGo(true)));
    const t = setTimeout(onDone, 1100);
    return () => { cancelAnimationFrame(id); clearTimeout(t); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div aria-hidden="true" style={{ position: 'absolute', left: cx - w / 2, top: cy - h / 2, width: w, height: h, transform: `rotate(${rot}deg)`, pointerEvents: 'none', zIndex: 14 }}>
      {pieces.map((p, i) => (
        <div key={i} style={{
          position: 'absolute', inset: 0, clipPath: p.clip,
          transform: go ? `translate(${p.dx * w}px, ${p.dy * h}px) rotate(${p.spin}deg) scale(0.9)` : 'none',
          opacity: go ? 0 : 1,
          transition: `transform 950ms cubic-bezier(0.2,0.7,0.3,1), opacity 950ms ease-in`,
          transformOrigin: `${p.ox * 100}% ${p.oy * 100}%`,
        }}>
          <div style={{ width: FORGED_W, height: FORGED_H, transform: `scale(${w / FORGED_W})`, transformOrigin: '0 0' }}><CardFace card={card} hiRes={false} /></div>
        </div>
      ))}
    </div>
  );
}

/** A 3 x 4 grid, each cell cut corner to corner: 24 triangles, each flying out from where it was. */
function makeShards() {
  const out: { clip: string; dx: number; dy: number; spin: number; ox: number; oy: number }[] = [];
  const cols = 3, rows = 4;
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
    const x0 = (c / cols) * 100, x1 = ((c + 1) / cols) * 100, y0 = (r / rows) * 100, y1 = ((r + 1) / rows) * 100;
    const tris = (c + r) % 2 ? [[[x0, y0], [x1, y0], [x1, y1]], [[x0, y0], [x1, y1], [x0, y1]]] : [[[x0, y0], [x1, y0], [x0, y1]], [[x1, y0], [x1, y1], [x0, y1]]];
    for (const t of tris) {
      const ox = (t[0][0] + t[1][0] + t[2][0]) / 300, oy = (t[0][1] + t[1][1] + t[2][1]) / 300;
      out.push({
        clip: `polygon(${t.map(([x, y]) => `${x.toFixed(1)}% ${y.toFixed(1)}%`).join(', ')})`,
        dx: (ox - 0.5) * (1.6 + Math.random() * 1.6) + (Math.random() - 0.5) * 0.4,
        dy: (oy - 0.5) * (1.6 + Math.random() * 1.6) + (Math.random() - 0.5) * 0.4 + 0.25,
        spin: (Math.random() - 0.5) * 220,
        ox, oy,
      });
    }
  }
  return out;
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
    if (grabbed) { setDrag(true); playSfx('cardDragStart', { volume: 0.6 }); }
    // Stillness: how long it has stayed within a few px of where it last settled.
    let anchor = { x: sx, y: sy }, stillSince = performance.now(), calmed = false, raf = 0;
    const STILL_MS = 3000;
    const shake = () => {
      const p = Math.min(1, (performance.now() - stillSince) / STILL_MS);
      if (!calmed && p >= 1) { calmed = true; setCalm(true); playSfx('cardSelect', { volume: 0.5, cents: -300 }); }
      const amp = calmed ? 0 : 1.2 + 2.6 * (1 - p);
      if (shakeEl.current) shakeEl.current.style.transform = amp ? `translate(${((Math.random() - 0.5) * amp * 2).toFixed(1)}px, ${((Math.random() - 0.5) * amp * 2).toFixed(1)}px) rotate(${((Math.random() - 0.5) * amp).toFixed(2)}deg)` : 'none';
      if (barEl.current) barEl.current.style.transform = `scaleX(${calmed ? 1 : p})`;
      raf = requestAnimationFrame(shake);
    };
    if (grabbed) raf = requestAnimationFrame(shake);
    const move = (m: PointerEvent) => {
      if (!moved && Math.hypot(m.clientX - sx, m.clientY - sy) < 5) return;
      if (!moved) { moved = true; setDrag(true); playSfx('cardDragStart', { volume: 0.6 }); raf = requestAnimationFrame(shake); }
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
      if (calmed) { playSfx('cardDragEnd', { volume: 0.5 }); onPlace(last.x, last.y); } else onPlay(last.x, last.y);
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
@keyframes rk-flash { 0% { opacity: 0.95; } 100% { opacity: 0; } }
@keyframes rk-rune { 0% { transform: scale(0.25) rotate(-80deg); opacity: 0; } 18% { opacity: 1; } 70% { opacity: 0.9; } 100% { transform: scale(1) rotate(110deg); opacity: 0; } }
@keyframes rk-ring { 0% { transform: scale(0.05); opacity: 1; } 100% { transform: scale(1); opacity: 0; } }
@keyframes rk-burst { 0% { transform: scale(0.1); opacity: 1; } 60% { opacity: 0.8; } 100% { transform: scale(1.1); opacity: 0; } }
@keyframes rk-vortex { 0% { transform: rotate(0deg) scale(0.3); opacity: 0; } 15% { opacity: 1; } 85% { opacity: 1; } 100% { transform: rotate(1440deg) scale(0.15); opacity: 0; } }
@keyframes rk-implode { 0% { transform: scale(1.2); opacity: 0; } 30% { opacity: 1; } 90% { transform: scale(0.2); opacity: 1; } 100% { transform: scale(0.05); opacity: 0; } }
@keyframes rk-smoke { 0% { transform: scale(0.3); opacity: 0.9; } 100% { transform: scale(1.3); opacity: 0; } }
@keyframes rk-claw { 0% { clip-path: inset(0 0 100% 0); opacity: 1; } 35% { clip-path: inset(0 0 0 0); opacity: 1; } 100% { clip-path: inset(0 0 0 0); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .rk-fx > * { animation-duration: 1ms !important; } }
`;
