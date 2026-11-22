/**
 * Cards laid on the felt (v0.47.0). A copy of a deck card, placed where it was dropped: drag it to move it, pull
 * the grip at its corner to make it bigger or smaller (between MIN_W and a cap that keeps it on the table), click
 * a card with pages to turn them, and drag it back into the card tray to put it away.
 *
 * Copies only: the card stays in its deck, and nothing here touches the character file.
 */
import { memo, useEffect, useRef, useState } from 'react';

import { FORGED_H, FORGED_W } from '@/features/create/components/forged-card';
import { CardFace, type TableCard } from './desk-carousel';
import type { BoardCard } from './table-store';
import { T } from './table-ui';
import { cue } from './table-sound';

export const MIN_W = 96;
/** A laid card's size until it is resized; a click on the size grip comes back to it. */
export const DEFAULT_W = 170;
/** The biggest a card may grow: most of the felt's height, and never past 460 px wide. */
export const maxW = (feltH: number) => Math.max(MIN_W, Math.min(460, (feltH * 0.94 * FORGED_W) / FORGED_H));

export function BoardCards({ cards, lookup, feltW, feltH, onChange, onReturn, onTap, overTray, onMenu, onLift, onCarry, onSettle, onDragTo, hidden, live }: {
  cards: BoardCard[];
  lookup: (id: string) => TableCard | undefined;
  feltW: number;
  feltH: number;
  /**
   * One card changed: the patch is applied to the board as it stands when it lands (v0.47.18: a whole list built from
   * an older render put back cards that had moved since, so one that had just come to rest jumped back).
   */
  onChange: (uid: string, patch: (b: BoardCard) => Partial<BoardCard>) => void;
  /** Dropped over the card tray: take it off the table. */
  onReturn: (uid: string) => void;
  /** Whether a client point is over the card tray (to light it while a card is dragged there). */
  overTray: (x: number, y: number) => boolean;
  onMenu: (uid: string, x: number, y: number) => void;
  /** A card started moving (carry what lies on it), moved by (dx, dy) px, and was let go. */
  onLift: (card: BoardCard) => void;
  onCarry: (dx: number, dy: number) => void;
  onSettle: () => void;
  /** Where a card being dragged is now (px), so its pieces and its physics follow; `end` when it is let go. */
  onDragTo: (uid: string, x: number, y: number, rot: number, end?: boolean) => void;
  /** Cards not drawn (breaking into shards right now). */
  hidden?: Set<string>;
  /** Pressed and let go without moving, when it has no pages to turn and was not caught in flight (a note opens). */
  onTap?: (uid: string) => void;
  /** Where physical cards really are while physics moves them (px, degrees): drawn from here until they stop. */
  live?: Map<string, { x: number; y: number; rot: number }>;
}) {
  const [front, setFront] = useState<string[]>([]);
  const [returning, setReturning] = useState<string | null>(null);
  const ordered = [...cards].sort((a, b) => front.indexOf(a.uid) - front.indexOf(b.uid));
  const raise = (uid: string) => setFront((f) => [...f.filter((u) => u !== uid), uid]);
  return (
    <>
      {ordered.map((c) => {
        const card = lookup(c.id);
        if (!card || hidden?.has(c.uid)) return null;
        return (
          <Placed
            key={c.uid}
            entry={c}
            card={card}
            feltW={feltW}
            feltH={feltH}
            returning={returning === c.uid}
            onGrab={() => raise(c.uid)}
            onLift={() => onLift(c)}
            onCarry={onCarry}
            onSettle={onSettle}
            live={live}
            onDragTo={(x, y, rot, end) => onDragTo(c.uid, x, y, rot, end)}
            onMove={(fx, fy, over) => { setReturning(over ? c.uid : null); onChange(c.uid, () => ({ fx, fy })); }}
            onDrop={(over) => { setReturning(null); if (over) onReturn(c.uid); }}
            onResize={(w) => onChange(c.uid, () => ({ w }))}
            onRotate={(rot) => onChange(c.uid, () => ({ rot }))}
            onTurn={() => onChange(c.uid, (x) => ({ face: ((x.face ?? 0) + 1) % (card.faces?.length || 1) }))}
            // A note has no hand to go back to.
            overTray={card.h ? NEVER : overTray}
            onTap={() => onTap?.(c.uid)}
            onMenu={(x, y) => onMenu(c.uid, x, y)}
          />
        );
      })}
    </>
  );
}

const NEVER = () => false;

const Placed = memo(function Placed({ entry, card, feltW, feltH, returning, live, onGrab, onLift, onCarry, onSettle, onDragTo, onMove, onDrop, onResize, onRotate, onTurn, onTap, overTray, onMenu }: {
  entry: BoardCard; card: TableCard; feltW: number; feltH: number; returning: boolean; live?: Map<string, { x: number; y: number; rot: number }>;
  onGrab: () => void; onLift: () => void; onCarry: (dx: number, dy: number) => void; onSettle: () => void; onDragTo: (x: number, y: number, rot: number, end?: boolean) => void; onMove: (fx: number, fy: number, overTray: boolean) => void; onDrop: (overTray: boolean) => void;
  onResize: (w: number) => void; onRotate: (deg: number) => void; onTurn: () => void; onTap: () => void; overTray: (x: number, y: number) => boolean; onMenu: (x: number, y: number) => void;
}) {
  const [hover, setHover] = useState(false);
  const [drag, setDrag] = useState<'move' | 'size' | 'turn' | null>(null);
  // A physical card is drawn where physics has it, so a re-render never snaps it back to where it last stopped.
  const lp = live?.get(entry.uid);
  const poseNow = () => {
    const p = live?.get(entry.uid);
    return p ? { cx: p.x, cy: p.y, rot: p.rot } : { cx: entry.fx * feltW, cy: entry.fy * feltH, rot: entry.rot ?? 0 };
  };
  const rot = lp ? lp.rot : entry.rot ?? 0;
  const [born, setBorn] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setBorn(true)); return () => cancelAnimationFrame(id); }, []);
  const w = Math.min(maxW(feltH), Math.max(MIN_W, entry.w));
  const h = (w * (card.h ?? FORGED_H)) / FORGED_W;
  const cx = lp ? lp.x : entry.fx * feltW;
  const cy = lp ? lp.y : entry.fy * feltH;
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
    // Where the card is right now: a physical card still sliding is wherever physics has it, not where the page
    // last drew it (owner, v0.47.7: grabbing one mid-flight teleported it back).
    const { cx, cy, rot } = poseNow();
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
      // A click puts the card back upright (owner, v0.47.2); a drag turns it.
      if (!moved) { cue('card:place', 'cardDragEnd', { volume: 0.5 }); onRotate(0); }
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
    const { cx, cy, rot } = poseNow();
    const caught = !!live?.get(entry.uid);
    const el = ref.current?.parentElement;
    if (!el) return;
    const felt = el.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    const ox = cx - (e.clientX - felt.left), oy = cy - (e.clientY - felt.top);
    const startW = w;
    // Resizing measures from the card's centre, so pulling the grip outwards grows it and inwards shrinks it.
    const startD = Math.hypot(e.clientX - (felt.left + cx), e.clientY - (felt.top + cy));
    let moved = false;
    let last = { fx: cx / feltW, fy: cy / feltH };
    if (mode === 'move') {
      cue('card:lift', 'cardDragStart', { volume: 0.6 });
      // Caught: a sliding physical card stops in the hand the moment it is pressed.
      onDragTo(cx, cy, rot);
    }
    const move = (m: PointerEvent) => {
      if (!moved && Math.hypot(m.clientX - sx, m.clientY - sy) < 4) return;
      if (!moved) { moved = true; setDrag(mode); if (mode === 'move') onLift(); }
      if (mode === 'size') {
        const d = Math.hypot(m.clientX - (felt.left + cx), m.clientY - (felt.top + cy));
        onResize(Math.round(Math.min(maxW(feltH), Math.max(MIN_W, startW * (d / Math.max(1, startD))))));
        return;
      }
      const nx = Math.min(feltW - 20, Math.max(20, m.clientX - felt.left + ox));
      const ny = m.clientY - felt.top + oy;
      const nextF = { fx: nx / feltW, fy: Math.min(1.4, Math.max(0.03, ny / feltH)) };
      onCarry((nextF.fx - last.fx) * feltW, (nextF.fy - last.fy) * feltH);
      last = nextF;
      onDragTo(nextF.fx * feltW, nextF.fy * feltH, rot);
      onMove(last.fx, last.fy, overTray(m.clientX, m.clientY));
    };
    const up = (u: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setDrag(null);
      if (mode === 'size' && !moved) { cue('card:place', 'cardDragEnd', { volume: 0.5 }); onResize(DEFAULT_W); return; }
      if (mode === 'move') {
        if (moved) onSettle();
        onDragTo(last.fx * feltW, last.fy * feltH, rot, true);
        if (!moved) { if (pages > 1) { cue('card:turn', 'gearScroll2', { volume: 0.5 }); onTurn(); } else if (!caught) onTap(); return; }
        const over = overTray(u.clientX, u.clientY);
        cue('card:place', over ? 'tokenRemove' : 'cardDragEnd', { volume: 0.7 });
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
      <div style={{ width: FORGED_W, height: card.h ?? FORGED_H, transform: `scale(${w / FORGED_W})`, transformOrigin: '0 0', pointerEvents: 'none', position: 'relative' }}>
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
        data-grip=""
        onPointerDown={turnStart}
        title="Drag to rotate, click to stand it upright"
        style={{ position: 'absolute', left: -11, top: -11, width: 24, height: 24, cursor: 'grab', opacity: hover || drag === 'turn' ? 1 : 0, transition: 'opacity 140ms', touchAction: 'none' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <polygon points="12,1 23,12 12,23 1,12" fill={T.panel} stroke={T.gold} strokeWidth="1.4" />
          <path d="M15.6 12a3.6 3.6 0 1 1-1.05-2.55M15.8 7.8v2.4h-2.4" stroke={T.goldText} strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {/* The size grip: pull out to grow, in to shrink. */}
      <div
        data-grip=""
        onPointerDown={(e) => start(e, 'size')}
        title="Drag to resize, click for the normal size"
        style={{ position: 'absolute', right: -11, bottom: -11, width: 24, height: 24, cursor: 'nwse-resize', opacity: hover || drag === 'size' ? 1 : 0, transition: 'opacity 140ms', touchAction: 'none' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <polygon points="12,1 23,12 12,23 1,12" fill={T.panel} stroke={T.gold} strokeWidth="1.4" />
          <path d="M8.5 15.5 15.5 8.5M15.5 8.5h-4M15.5 8.5v4M8.5 15.5h4M8.5 15.5v-4" stroke={T.goldText} strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
});
