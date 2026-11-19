/**
 * Cards laid on the felt (v0.47.0). A copy of a deck card, placed where it was dropped: drag it to move it, pull
 * the grip at its corner to make it bigger or smaller (between MIN_W and a cap that keeps it on the table), click
 * a card with pages to turn them, and drag it back into the card tray to put it away.
 *
 * Copies only: the card stays in its deck, and nothing here touches the character file.
 */
import { memo, useEffect, useRef, useState } from 'react';

import { FORGED_H, FORGED_W } from '@/features/create/components/forged-card';
import { playSfx } from '@/lib/sfx';
import { CardFace, type TableCard } from './desk-carousel';
import type { BoardCard } from './table-store';
import { T } from './table-ui';

export const MIN_W = 96;
/** The biggest a card may grow: most of the felt's height, and never past 460 px wide. */
export const maxW = (feltH: number) => Math.max(MIN_W, Math.min(460, (feltH * 0.94 * FORGED_W) / FORGED_H));

export function BoardCards({ cards, lookup, feltW, feltH, onChange, onReturn, overTray, onMenu }: {
  cards: BoardCard[];
  lookup: (id: string) => TableCard | undefined;
  feltW: number;
  feltH: number;
  onChange: (next: BoardCard[]) => void;
  /** Dropped over the card tray: take it off the table. */
  onReturn: (uid: string) => void;
  /** Whether a client point is over the card tray (to light it while a card is dragged there). */
  overTray: (x: number, y: number) => boolean;
  onMenu: (uid: string, x: number, y: number) => void;
}) {
  const [front, setFront] = useState<string[]>([]);
  const [returning, setReturning] = useState<string | null>(null);
  const ordered = [...cards].sort((a, b) => front.indexOf(a.uid) - front.indexOf(b.uid));
  const raise = (uid: string) => setFront((f) => [...f.filter((u) => u !== uid), uid]);
  return (
    <>
      {ordered.map((c) => {
        const card = lookup(c.id);
        if (!card) return null;
        return (
          <Placed
            key={c.uid}
            entry={c}
            card={card}
            feltW={feltW}
            feltH={feltH}
            returning={returning === c.uid}
            onGrab={() => raise(c.uid)}
            onMove={(fx, fy, over) => { setReturning(over ? c.uid : null); onChange(cards.map((x) => (x.uid === c.uid ? { ...x, fx, fy } : x))); }}
            onDrop={(over) => { setReturning(null); if (over) onReturn(c.uid); }}
            onResize={(w) => onChange(cards.map((x) => (x.uid === c.uid ? { ...x, w } : x)))}
            onRotate={(rot) => onChange(cards.map((x) => (x.uid === c.uid ? { ...x, rot } : x)))}
            onTurn={() => onChange(cards.map((x) => (x.uid === c.uid ? { ...x, face: ((x.face ?? 0) + 1) % (card.faces?.length || 1) } : x)))}
            overTray={overTray}
            onMenu={(x, y) => onMenu(c.uid, x, y)}
          />
        );
      })}
    </>
  );
}

const Placed = memo(function Placed({ entry, card, feltW, feltH, returning, onGrab, onMove, onDrop, onResize, onRotate, onTurn, overTray, onMenu }: {
  entry: BoardCard; card: TableCard; feltW: number; feltH: number; returning: boolean;
  onGrab: () => void; onMove: (fx: number, fy: number, overTray: boolean) => void; onDrop: (overTray: boolean) => void;
  onResize: (w: number) => void; onRotate: (deg: number) => void; onTurn: () => void; overTray: (x: number, y: number) => boolean; onMenu: (x: number, y: number) => void;
}) {
  const [hover, setHover] = useState(false);
  const [drag, setDrag] = useState<'move' | 'size' | 'turn' | null>(null);
  const rot = entry.rot ?? 0;
  const [born, setBorn] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setBorn(true)); return () => cancelAnimationFrame(id); }, []);
  const w = Math.min(maxW(feltH), Math.max(MIN_W, entry.w));
  const h = (w * FORGED_H) / FORGED_W;
  const cx = entry.fx * feltW;
  const cy = entry.fy * feltH;
  const ref = useRef<HTMLDivElement>(null);
  const pages = card.faces?.length ?? 0;

  /**
   * The rotate grip (owner, v0.47.1): a click turns the card a quarter, a drag turns it freely (snapping to every
   * 15 degrees when it passes close to one).
   */
  const turnStart = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    onGrab();
    const el = ref.current?.parentElement;
    if (!el) return;
    const felt = el.getBoundingClientRect();
    const cxs = felt.left + cx, cys = felt.top + cy;
    const a0 = Math.atan2(e.clientY - cys, e.clientX - cxs);
    const sx = e.clientX, sy = e.clientY;
    let moved = false;
    const move = (m: PointerEvent) => {
      if (!moved && Math.hypot(m.clientX - sx, m.clientY - sy) < 4) return;
      if (!moved) { moved = true; setDrag('turn'); }
      let deg = rot + ((Math.atan2(m.clientY - cys, m.clientX - cxs) - a0) * 180) / Math.PI;
      const snap = Math.round(deg / 15) * 15;
      if (Math.abs(deg - snap) < 4) deg = snap;
      onRotate(Math.round(((deg % 360) + 360) % 360));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setDrag(null);
      if (!moved) { playSfx('cardDragEnd', { volume: 0.5 }); onRotate((Math.round(rot / 90) * 90 + 90) % 360); }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const start = (e: React.PointerEvent, mode: 'move' | 'size') => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    onGrab();
    const el = ref.current?.parentElement;
    if (!el) return;
    const felt = el.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    const ox = cx - (e.clientX - felt.left), oy = cy - (e.clientY - felt.top);
    const startW = w;
    // Resizing measures from the card's centre, so pulling the grip outwards grows it and inwards shrinks it.
    const startD = Math.hypot(e.clientX - (felt.left + cx), e.clientY - (felt.top + cy));
    let moved = false;
    let last = { fx: entry.fx, fy: entry.fy };
    if (mode === 'move') playSfx('cardDragStart', { volume: 0.6 });
    const move = (m: PointerEvent) => {
      if (!moved && Math.hypot(m.clientX - sx, m.clientY - sy) < 4) return;
      if (!moved) { moved = true; setDrag(mode); }
      if (mode === 'size') {
        const d = Math.hypot(m.clientX - (felt.left + cx), m.clientY - (felt.top + cy));
        onResize(Math.round(Math.min(maxW(feltH), Math.max(MIN_W, startW * (d / Math.max(1, startD))))));
        return;
      }
      const nx = Math.min(feltW - 20, Math.max(20, m.clientX - felt.left + ox));
      const ny = m.clientY - felt.top + oy;
      last = { fx: nx / feltW, fy: Math.min(1.4, Math.max(0.03, ny / feltH)) };
      onMove(last.fx, last.fy, overTray(m.clientX, m.clientY));
    };
    const up = (u: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setDrag(null);
      if (mode === 'move') {
        if (!moved) { if (pages > 1) { playSfx('gearScroll2', { volume: 0.5 }); onTurn(); } return; }
        const over = overTray(u.clientX, u.clientY);
        playSfx(over ? 'tokenRemove' : 'cardDragEnd', { volume: 0.7 });
        // A card let go half off the felt (and not over the tray) slides back on.
        if (!over && last.fy * feltH > feltH - 20) onMove(last.fx, (feltH - 20) / feltH, false);
        onDrop(over);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const scale = drag === 'move' ? 1.04 : born ? 1 : 0.86;
  return (
    <div
      ref={ref}
      data-board-card={entry.uid}
      data-rot={rot}
      onPointerDown={(e) => start(e, 'move')}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onMenu(e.clientX, e.clientY); }}
      style={{
        position: 'absolute', left: cx - w / 2, top: cy - h / 2, width: w, height: h,
        cursor: drag === 'move' ? 'grabbing' : 'grab', touchAction: 'none',
        transform: `rotate(${rot + (drag === 'move' ? -1.2 : 0)}deg) scale(${scale})`,
        opacity: returning ? 0.45 : born ? 1 : 0,
        transition: drag === 'turn' ? 'none' : drag ? `transform 140ms ${T.ease}, opacity 140ms` : `transform 220ms ${T.ease}, opacity 180ms, left 0ms, top 0ms`,
        boxShadow: drag === 'move' ? '0 22px 44px rgba(0,0,0,0.6)' : '0 8px 22px rgba(0,0,0,0.5)',
        zIndex: drag ? 5 : undefined,
      }}>
      {/* The picture is drawn at the card's own size and scaled, so it is sharp at any width. */}
      <div style={{ width: FORGED_W, height: FORGED_H, transform: `scale(${w / FORGED_W})`, transformOrigin: '0 0', pointerEvents: 'none', position: 'relative' }}>
        <CardFace card={card} hiRes={w > 150 || hover} face={entry.face ?? 0} />
        {card.overlay ? <div style={{ position: 'absolute', inset: 0 }}>{card.overlay}</div> : null}
      </div>
      {pages > 1 ? (
        <div style={{ position: 'absolute', bottom: -16, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 5, pointerEvents: 'none' }}>
          {Array.from({ length: pages }, (_, i) => <span key={i} style={{ width: 6, height: 6, transform: 'rotate(45deg)', background: i === (entry.face ?? 0) ? T.red : 'rgba(147,142,136,0.6)' }} />)}
        </div>
      ) : null}
      {/* The rotate grip: click for a quarter turn, drag to turn freely. */}
      <div
        onPointerDown={turnStart}
        title="Click to turn, drag to rotate"
        style={{ position: 'absolute', left: -11, top: -11, width: 24, height: 24, cursor: 'grab', opacity: hover || drag === 'turn' ? 1 : 0, transition: 'opacity 140ms', touchAction: 'none' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <polygon points="12,1 23,12 12,23 1,12" fill={T.panel} stroke={T.gold} strokeWidth="1.4" />
          <path d="M15.6 12a3.6 3.6 0 1 1-1.05-2.55M15.8 7.8v2.4h-2.4" stroke={T.goldText} strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {/* The size grip: pull out to grow, in to shrink. */}
      <div
        onPointerDown={(e) => start(e, 'size')}
        title="Drag to resize"
        style={{ position: 'absolute', right: -11, bottom: -11, width: 24, height: 24, cursor: 'nwse-resize', opacity: hover || drag === 'size' ? 1 : 0, transition: 'opacity 140ms', touchAction: 'none' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <polygon points="12,1 23,12 12,23 1,12" fill={T.panel} stroke={T.gold} strokeWidth="1.4" />
          <path d="M8.5 15.5 15.5 8.5M15.5 8.5h-4M15.5 8.5v4M8.5 15.5h4M8.5 15.5v-4" stroke={T.goldText} strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
});
