/**
 * What a throw on the desktop table came to (v0.47.0; v0.47.3 the dice bar is gone, owner: dice are rolled from the
 * table itself, by preset from its right-click menu, by selection, or by a trait on the sheet). Same rules and sounds
 * as the phone's tray: lib/dice-pool decides the total and the verdict.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { type PoolDie, rollVoice } from '@/lib/dice-pool';
import { playSfx } from '@/lib/sfx';
import { Chamfer, T } from './table-ui';

export interface RollResult { total: number; verdict: 'hope' | 'fear' | 'critical' | null; dice: PoolDie[]; label: string | null; mod: number }

/** The sound a landed throw makes, as the phone's tray plays it. */
export function rollSound(landed: PoolDie[]): void {
  const voice = rollVoice(landed);
  playSfx(
    voice === 'critical' || voice === 'muted' ? 'gainGoldenHp' : voice === 'hope' ? 'gainHope' : voice === 'fear' ? 'loseHope' : voice === 'bad' ? 'cardDisable' : 'transitionIconFilled',
    voice === 'muted' ? { cents: -520 } : voice === 'fear' ? { cents: -200 } : voice === 'bad' ? { cents: -260 } : undefined,
  );
}

/** How long a result stays up on its own, unless the pointer rests on it. */
const STAY_MS = 7000;

/**
 * What the throw came to, as a banner across the top of the table (owner, v0.47.11: the old card on the port looked
 * poor). It closes itself after a while, sooner with its X, Enter or Escape; resting the pointer on it holds it open.
 * A die rolled again with a right click updates it in place.
 */
export function RollPopup({ result, box, onAccept }: { result: RollResult; box: { left: number; top: number; width: number; height: number }; onAccept: () => void }) {
  const [shown, setShown] = useState(false);
  const [held, setHeld] = useState(false);
  const close = useRef<HTMLButtonElement>(null);
  const done = useRef(onAccept);
  done.current = onAccept;
  useEffect(() => { const id = requestAnimationFrame(() => setShown(true)); close.current?.focus({ preventScroll: true }); return () => cancelAnimationFrame(id); }, []);
  // The clock runs only while nobody is reading it; each new result starts it again (the parent keys it by result).
  const left = useRef(STAY_MS);
  useEffect(() => {
    if (held) return;
    const start = performance.now();
    const t = setTimeout(() => done.current(), left.current);
    return () => { clearTimeout(t); left.current = Math.max(800, left.current - (performance.now() - start)); };
  }, [held]);
  const crit = result.verdict === 'critical';
  const color = crit || result.verdict === 'hope' ? T.goldBright : result.verdict === 'fear' ? '#C9A6F0' : T.ivory;
  const word = crit ? 'Critical success' : result.verdict === 'hope' ? 'With Hope' : result.verdict === 'fear' ? 'With Fear' : 'Total';
  const dice = result.dice.filter((d) => d.value != null);
  const W = Math.min(560, box.width - 32);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div role="status" aria-live="polite" aria-label={`Rolled ${result.total}, ${word}`}
      onPointerEnter={() => setHeld(true)} onPointerLeave={() => setHeld(false)}
      onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onAccept(); } }}
      style={{ position: 'fixed', left: box.left + (box.width - W) / 2, top: box.top + 14, width: W, zIndex: 1150, transform: `translateY(${shown ? 0 : -18}px)`, opacity: shown ? 1 : 0, transition: `transform 300ms ${T.ease}, opacity 180ms`, filter: 'drop-shadow(0 14px 26px rgba(0,0,0,0.55))' }}>
      <Chamfer c={10} fill="rgba(11,14,19,0.97)" line={crit ? T.goldBright : result.verdict === 'fear' ? 'rgba(201,166,240,0.6)' : T.gold} width={1.3} inner={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 16, padding: '10px 10px 12px 18px', overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 92 }}>
          <div style={{ color, fontFamily: T.bold, fontSize: 12, letterSpacing: 1.6, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{word}</div>
          <div style={{ color, fontFamily: T.display, fontSize: 46, lineHeight: '48px', textShadow: crit ? '0 0 22px rgba(224,181,99,0.6)' : 'none' }}>{result.total}</div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 5, alignContent: 'center' }}>
          {dice.map((d) => {
            const c = d.side === 'hope' ? T.goldBright : d.side === 'fear' ? '#C9A6F0' : T.goldText;
            return (
              <Chamfer key={d.id} c={5} fill="rgba(24,28,36,0.95)" line={d.side ? c : 'rgba(218,162,73,0.35)'} width={1} inner={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '4px 9px' }}>
                <span style={{ color: T.muted, fontFamily: T.bold, fontSize: 11.5 }}>{d.side === 'hope' ? 'Hope' : d.side === 'fear' ? 'Fear' : d.type}</span>
                <span style={{ color: c, fontFamily: T.bold, fontSize: 16 }}>{d.value}</span>
              </Chamfer>
            );
          })}
          {result.mod ? (
            <Chamfer c={5} fill="rgba(24,28,36,0.95)" line="rgba(218,162,73,0.35)" width={1} inner={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '4px 9px' }}>
              <span style={{ color: T.muted, fontFamily: T.bold, fontSize: 11.5 }}>{result.label ?? 'Modifier'}</span>
              <span style={{ color: T.ivory, fontFamily: T.bold, fontSize: 16 }}>{result.mod > 0 ? '+' : ''}{result.mod}</span>
            </Chamfer>
          ) : null}
        </div>
        <button ref={close} type="button" aria-label="Close" title="Close" onClick={onAccept} className="rk-ok"
          style={{ all: 'unset', cursor: 'pointer', alignSelf: 'flex-start', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.muted }}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2l10 10M12 2 2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
        {/* How long it has left: a hairline running out along the bottom, stopped while the pointer rests on it. */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, background: color, opacity: 0.55, transformOrigin: 'left', animation: `rk-roll-left ${STAY_MS}ms linear forwards`, animationPlayState: held ? 'paused' : 'running' }} />
      </Chamfer>
      <style>{'@keyframes rk-roll-left { from { transform: scaleX(1); } to { transform: scaleX(0); } }'}</style>
    </div>,
    document.body,
  );
}
