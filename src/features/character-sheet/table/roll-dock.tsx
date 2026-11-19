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

/**
 * What the throw came to, as a pop-up on the sheet's port (owner, v0.47.1): never under the dice, and it stays until
 * you accept it. A die rolled again with a right click updates it in place. Enter or Escape accepts too.
 */
export function RollPopup({ result, box, onAccept }: { result: RollResult; box: { left: number; top: number; width: number; height: number }; onAccept: () => void }) {
  const [shown, setShown] = useState(false);
  const ok = useRef<HTMLButtonElement>(null);
  useEffect(() => { const id = requestAnimationFrame(() => setShown(true)); ok.current?.focus({ preventScroll: true }); return () => cancelAnimationFrame(id); }, []);
  const crit = result.verdict === 'critical';
  const color = crit || result.verdict === 'hope' ? T.goldBright : result.verdict === 'fear' ? '#C9A6F0' : T.ivory;
  const word = crit ? 'Critical success' : result.verdict === 'hope' ? 'With Hope' : result.verdict === 'fear' ? 'With Fear' : 'Total';
  const parts = result.dice.filter((d) => d.value != null).map((d) => `${d.side === 'hope' ? 'Hope' : d.side === 'fear' ? 'Fear' : d.type} ${d.value}`);
  if (result.mod) parts.push(`${result.label ? `${result.label} ` : ''}${result.mod > 0 ? '+' : ''}${result.mod}`);
  const W = Math.min(300, box.width - 48);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div role="dialog" aria-label={`Rolled ${result.total}, ${word}`} aria-live="polite"
      onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onAccept(); } }}
      style={{ position: 'fixed', left: box.left + (box.width - W) / 2, top: box.top + box.height * 0.34, width: W, zIndex: 1150, transform: `translateY(${shown ? 0 : 12}px) scale(${shown ? 1 : 0.94})`, opacity: shown ? 1 : 0, transition: `transform 260ms ${T.ease}, opacity 180ms`, filter: 'drop-shadow(0 18px 30px rgba(0,0,0,0.6))' }}>
      <Chamfer c={14} fill="rgba(11,14,19,0.97)" line={crit ? T.goldBright : result.verdict === 'fear' ? 'rgba(201,166,240,0.6)' : T.gold} width={1.4} inner={{ padding: '16px 18px 14px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <div style={{ color, fontFamily: T.bold, fontSize: 12.5, letterSpacing: 2, textTransform: 'uppercase' }}>{word}</div>
        <div style={{ color, fontFamily: T.display, fontSize: 64, lineHeight: '66px', textShadow: crit ? '0 0 24px rgba(224,181,99,0.6)' : 'none' }}>{result.total}</div>
        <div style={{ color: T.muted, fontFamily: T.medium, fontSize: 12.5, lineHeight: '17px', marginBottom: 8 }}>{parts.join(' · ')}</div>
        <button ref={ok} type="button" onClick={onAccept} className="rk-ok" style={{ all: 'unset', cursor: 'pointer', alignSelf: 'stretch' }}>
          <Chamfer c={7} line={T.red} fill={T.red} style={{ height: 36 }} inner={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: T.ivory, fontFamily: T.bold, fontSize: 12.5, letterSpacing: 1.2, textTransform: 'uppercase' }}>OK</span>
          </Chamfer>
        </button>
      </Chamfer>
    </div>,
    document.body,
  );
}
