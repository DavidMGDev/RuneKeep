/**
 * A counter on the DM's felt (v0.50.0, owner: the counters of the encounter's list, "on the DM's interface with all
 * their functionality"). The number and its buttons are the encounter row's own stepper, so a countdown only falls,
 * a looping one wraps and a spent one shows its X here as it does there. The name drags it, a click on it opens its
 * settings and the corner resizes it.
 */
import { useState } from 'react';

import { cue } from '@/features/character-sheet/table/table-sound';
import { Chamfer, Glyph, T, TButton } from '@/features/character-sheet/table/table-ui';
import { type AdversaryCounter, counterNote } from '@/lib/dm-counters';
import { type CounterSpot, SPOT_MAX_SCALE, SPOT_MIN_SCALE } from '@/lib/table-counters';

import { CounterStepper } from '../counter-control';

const W = 212;
/** Its height is the writing's, so it is kept on the felt by about this much. */
const HALF_H = 62;

export function CounterTile({ c, owner, fallen, spot, width, height, onSpot, onStep, onSpent, onRecover, onOpen, onRemove, onMenu }: {
  c: AdversaryCounter;
  /** Whose it is, when it is a combatant's. */
  owner?: string;
  fallen?: boolean;
  spot: CounterSpot;
  width: number;
  height: number;
  onSpot: (spot: CounterSpot) => void;
  onStep: (delta: number) => void;
  onSpent: () => void;
  onRecover?: () => void;
  onOpen: () => void;
  onRemove: () => void;
  onMenu: (clientX: number, clientY: number) => void;
}) {
  const [live, setLive] = useState<CounterSpot | null>(null);
  const [hover, setHover] = useState(false);
  const now = live ?? spot;
  const halfW = (W * now.k) / 2, halfH = HALF_H * now.k;
  const x = Math.min(width - halfW - 8, Math.max(halfW + 8, now.x * width));
  const y = Math.min(height - halfH - 8, Math.max(halfH + 8, now.y * height));

  const drag = (e: React.PointerEvent, mode: 'move' | 'size') => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    let to: CounterSpot | null = null;
    const move = (m: PointerEvent) => {
      const dx = m.clientX - sx, dy = m.clientY - sy;
      if (!to && Math.hypot(dx, dy) < 4) return;
      if (!to) cue('ui:dragStart', 'cardDragStart', { volume: 0.5 });
      to = mode === 'move'
        ? { k: spot.k, x: Math.min(1, Math.max(0, (x + dx) / width)), y: Math.min(1, Math.max(0, (y + dy) / height)) }
        : { x: spot.x, y: spot.y, k: Math.min(SPOT_MAX_SCALE, Math.max(SPOT_MIN_SCALE, spot.k + (dx + dy) / 180)) };
      setLive(to);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setLive(null);
      if (to) { cue('ui:dragEnd', 'cardDragEnd', { volume: 0.5 }); onSpot(to); } else if (mode === 'move') onOpen(); else onSpot({ ...spot, k: 1 });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const name = c.name || 'Counter';
  return (
    <div data-ui="" data-counter={c.id} role="group" aria-label={owner ? `${name}, ${owner}` : name}
      onPointerDown={(e) => e.stopPropagation()} onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onMenu(e.clientX, e.clientY); }}
      style={{ position: 'absolute', left: x, top: y, width: W, transform: `translate(-50%, -50%) scale(${now.k})`, zIndex: live ? 26 : 24 }}>
      <Chamfer c={9} line={hover ? T.gold : T.goldSoft} fill="rgba(11,14,19,0.94)" inner={{ padding: '9px 11px 10px' }}>
        <button type="button" title="Drag to move it, click to change it" aria-label={`Change ${name}`}
          onPointerDown={(e) => drag(e, 'move')} onClick={(e) => { if (e.detail === 0) onOpen(); }}
          style={{ all: 'unset', boxSizing: 'border-box', display: 'block', width: '100%', paddingRight: 20, cursor: live ? 'grabbing' : 'grab', touchAction: 'none' }}>
          <span style={{ display: 'block', color: T.ivory, fontFamily: T.bold, fontSize: 13.5, lineHeight: '17px', overflowWrap: 'anywhere' }}>{name}</span>
          <span style={{ display: 'block', color: T.muted, fontFamily: T.medium, fontSize: 11, lineHeight: '15px' }}>{[owner, counterNote(c).replace(' · ', ', ')].filter(Boolean).join(', ')}</span>
        </button>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, minHeight: 44, marginTop: 4 }}>
          {fallen ? (
            <>
              <span style={{ color: T.muted, fontFamily: T.bold, fontSize: 12 }}>Fallen</span>
              {onRecover ? <TButton label="Recover" h={30} onPress={onRecover} /> : null}
            </>
          ) : <CounterStepper c={c} size={34} onStep={onStep} onSpent={onSpent} spentVerb={owner ? undefined : 'Take it off the table'} />}
        </div>
        {c.text ? <p title={c.text} style={{ margin: '4px 0 0', color: T.ivory, opacity: 0.8, fontFamily: T.medium, fontSize: 11.5, lineHeight: '15px', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>{c.text}</p> : null}
      </Chamfer>
      <button type="button" title="Take it off the table" aria-label={`Take ${name} off the table`} onClick={onRemove}
        style={{ all: 'unset', cursor: 'pointer', position: 'absolute', right: 5, top: 5, padding: 5, display: 'flex', opacity: hover ? 1 : 0.35, transition: 'opacity 140ms' }}>
        <Glyph d='<path d="M6 6l12 12M18 6 6 18"/>' size={11} />
      </button>
      <div title="Drag to resize, click for the normal size" onPointerDown={(e) => drag(e, 'size')}
        style={{ position: 'absolute', right: -7, bottom: -7, width: 18, height: 18, cursor: 'nwse-resize', touchAction: 'none', opacity: hover || live ? 1 : 0, transition: 'opacity 140ms', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ width: 10, height: 10, transform: 'rotate(45deg)', background: T.panel, border: `1.5px solid ${T.gold}` }} />
      </div>
    </div>
  );
}
