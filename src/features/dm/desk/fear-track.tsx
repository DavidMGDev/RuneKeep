/**
 * The Fear tracker (v0.49.0, owner: optional). Twelve pips on the felt, the campaign's, so it carries from one
 * session to the next as Fear does. A pip sets it, the last lit one clears itself, and the name drags the whole
 * thing somewhere else.
 */
import { useState } from 'react';

import { FearTint } from '@/constants/table-tints';
import { cue } from '@/features/character-sheet/table/table-sound';
import { Chamfer, Glyph, T, TButton } from '@/features/character-sheet/table/table-ui';
import { clampFear, type DmFear, FEAR_MAX } from '@/lib/dm-table';

const HALF_H = 26;
const ROW_W = 560;
/** Under this much table the pips take two rows of six. */
const NARROW = 720;

export function FearTrack({ fear, width, height, onChange }: { fear: DmFear; width: number; height: number; onChange: (patch: Partial<DmFear>) => void }) {
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const narrow = width < NARROW;
  const halfW = (narrow ? 360 : ROW_W) / 2, halfH = narrow ? HALF_H + 12 : HALF_H;
  const place = (x: number, y: number) => ({
    x: Math.min(width - halfW - 12, Math.max(halfW + 12, x)),
    y: Math.min(height - halfH - 12, Math.max(halfH + 12, y)),
  });
  const at = drag ?? place(fear.x * width, fear.y * height);

  const set = (n: number) => {
    const next = clampFear(n);
    if (next === fear.n) return;
    cue(next > fear.n ? 'piece:onCard' : 'piece:offCard', next > fear.n ? 'placeToken' : 'tokenRemove', { volume: 0.7, cents: next * 40 - 300 });
    onChange({ n: next });
  };

  const start = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const ox = at.x - e.clientX, oy = at.y - e.clientY;
    let to = at;
    const move = (m: PointerEvent) => {
      to = place(m.clientX + ox, m.clientY + oy);
      setDrag(to);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setDrag(null);
      if (to !== at) onChange({ x: to.x / width, y: to.y / height });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  return (
    <div data-ui="" data-fear="" role="group" aria-label={`Fear, ${fear.n} of ${FEAR_MAX}`} onPointerDown={(e) => e.stopPropagation()}
      style={{ position: 'absolute', left: at.x, top: at.y, transform: 'translate(-50%, -50%)', zIndex: 24, width: halfW * 2 }}>
      <Chamfer c={10} line={FearTint.edge} fill="rgba(11,14,19,0.92)" inner={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px 8px 14px' }}>
        <div onPointerDown={start} title="Drag to move it" style={{ cursor: drag ? 'grabbing' : 'grab', touchAction: 'none', display: 'flex', alignItems: 'baseline', gap: 8, width: 76, flexShrink: 0 }}>
          <span style={{ color: T.muted, fontFamily: T.bold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase' }}>Fear</span>
          <span aria-live="polite" style={{ color: T.ivory, fontFamily: T.display, fontSize: 20, fontVariantNumeric: 'tabular-nums' }}>{fear.n}</span>
        </div>
        <TButton title="Spend a Fear" h={28} disabled={fear.n === 0} onPress={() => set(fear.n - 1)} icon={<Glyph d='<path d="M6 12h12"/>' size={13} />} />
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${narrow ? FEAR_MAX / 2 : FEAR_MAX}, 1fr)`, rowGap: 4 }}>
          {Array.from({ length: FEAR_MAX }, (_, i) => {
            const lit = i < fear.n;
            return (
              <button key={i} type="button" aria-label={`Set Fear to ${i + 1 === fear.n ? i : i + 1}`} onClick={() => set(i + 1 === fear.n ? i : i + 1)}
                style={{ all: 'unset', cursor: 'pointer', height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ width: 14, height: 14, boxSizing: 'border-box', transform: 'rotate(45deg)', background: lit ? FearTint.lit : FearTint.dim, border: `1px solid ${FearTint.edge}`, transition: `background 160ms ${T.ease}` }} />
              </button>
            );
          })}
        </div>
        <TButton title="Gain a Fear" h={28} disabled={fear.n === FEAR_MAX} onPress={() => set(fear.n + 1)} icon={<Glyph d='<path d="M6 12h12M12 6v12"/>' size={13} />} />
      </Chamfer>
    </div>
  );
}
