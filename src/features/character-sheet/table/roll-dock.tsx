/**
 * What a throw on the desktop table came to (v0.47.0; v0.47.3 the dice bar is gone, owner: dice are rolled from the
 * table itself, by preset from its right-click menu, by selection, or by a trait on the sheet). Same rules and sounds
 * as the phone's tray: lib/dice-pool decides the total and the verdict.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { type PoolDie, rollVoice } from '@/lib/dice-pool';
import { playSfx } from '@/lib/sfx';
import { DIE_COLOR, DIE_INK, FEAR_INK, FEAR_PURPLE, HOPE_GOLD, HOPE_INK } from '../components/card-tokens-data';
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
const MAX: Record<string, number> = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20, d100: 100 };
const OCT = 'polygon(30% 0, 70% 0, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0 70%, 0 30%)';

/** One die of the result, in its own colours: the winner of a pair larger and lit, a highest face ringed white, a 1 red. */
function DieBadge({ d, state, delay }: { d: PoolDie; state: 'win' | 'lose' | 'crit' | null; delay: number }) {
  const fill = d.side === 'hope' ? HOPE_GOLD : d.side === 'fear' ? FEAR_PURPLE : DIE_COLOR[d.type] ?? '#888';
  const ink = d.side === 'hope' ? HOPE_INK : d.side === 'fear' ? FEAR_INK : DIE_INK[d.type] ?? '#FAF8F2';
  const top = d.value != null && d.value >= (MAX[d.type] ?? 99);
  const one = d.value === 1 && !d.side;
  const big = state === 'win' || state === 'crit';
  const size = d.side ? (big ? 50 : 40) : 34;
  const ring = state === 'crit' || top ? '#FFF6DE' : one ? '#E0402A' : state === 'win' ? fill : 'transparent';
  return (
    <div style={{ opacity: state === 'lose' ? 0.72 : 1 }}>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, animation: `rk-badge-in 420ms ${delay}ms cubic-bezier(0.34,1.56,0.64,1) both` }}>
      <div style={{ width: size + 6, height: size + 6, clipPath: OCT, background: ring, display: 'flex', alignItems: 'center', justifyContent: 'center', filter: big || top ? `drop-shadow(0 0 10px ${state === 'crit' || top ? '#fff1c8' : fill})` : 'none' }}>
        <div style={{ width: size, height: size, clipPath: OCT, background: `linear-gradient(160deg, ${fill}, color-mix(in srgb, ${fill} 70%, #000))`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: ink, fontFamily: T.display, fontSize: size * 0.46 }}>{d.value}</div>
      </div>
      <span style={{ color: d.side === 'hope' ? '#F9D68D' : d.side === 'fear' ? '#C9A6F0' : T.muted, fontFamily: T.bold, fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase' }}>{d.side === 'hope' ? 'Hope' : d.side === 'fear' ? 'Fear' : d.type}</span>
    </div>
    </div>
  );
}

/**
 * What the throw came to (owner, v0.47.11: the plain strip was "lame", too empty): a tight plaque across the top of
 * the table. Hope and Fear stand either side of the total, the winner larger and lit; other dice sit beside it in
 * their own colours. The total counts up and pops, harder on a high roll, shrinks on a low one, flashes red when a 1
 * came up; a critical blazes gold and shakes. It closes itself after a while (resting the pointer holds it), with
 * its X, Enter or Escape. A die rolled again with a right click updates it in place.
 */
export function RollPopup({ result, box, onAccept }: { result: RollResult; box: { left: number; top: number; width: number; height: number }; onAccept: () => void }) {
  const [held, setHeld] = useState(false);
  const close = useRef<HTMLButtonElement>(null);
  const num = useRef<HTMLDivElement>(null);
  const done = useRef(onAccept);
  done.current = onAccept;
  const left = useRef(STAY_MS);
  useEffect(() => {
    if (held) return;
    const start = performance.now();
    const t = setTimeout(() => done.current(), left.current);
    return () => { clearTimeout(t); left.current = Math.max(800, left.current - (performance.now() - start)); };
  }, [held]);
  const dice = result.dice.filter((d) => d.value != null);
  const hope = dice.find((d) => d.side === 'hope'), fear = dice.find((d) => d.side === 'fear');
  const others = dice.filter((d) => !d.side);
  const crit = result.verdict === 'critical';
  const sum = others.reduce((a, d) => a + (d.value ?? 0), 0) + (hope?.value ?? 0) + (fear?.value ?? 0);
  const most = others.reduce((a, d) => a + (MAX[d.type] ?? 0), 0) + (hope ? 12 : 0) + (fear ? 12 : 0);
  const high = most > 0 && sum >= most * 0.75, low = most > 0 && sum <= most * 0.25;
  const anyOne = others.some((d) => d.value === 1);
  const color = crit ? '#F9D68D' : result.verdict === 'hope' ? '#F2C66A' : result.verdict === 'fear' ? '#C9A6F0' : low ? '#9A948C' : T.ivory;
  const word = crit ? 'Critical' : result.verdict === 'hope' ? 'With Hope' : result.verdict === 'fear' ? 'With Fear' : others.length === 1 && others[0].value === MAX[others[0].type] ? 'Highest face' : anyOne && others.length === 1 ? 'A one' : null;
  // The count: from nothing to the total in 380 ms, then the pop.
  useEffect(() => {
    const el = num.current;
    if (!el) return;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 380);
      el.textContent = String(Math.round(result.total * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
      else el.animate(crit || high ? [{ transform: 'scale(1)' }, { transform: `scale(${crit && high ? 1.71 : 1.42})` }, { transform: 'scale(1.21)' }, { transform: 'scale(1)' }] : low || anyOne ? [{ transform: 'scale(1)' }, { transform: 'scale(0.89)' }, { transform: 'scale(1.07)' }, { transform: 'scale(1)' }] : [{ transform: 'scale(1)' }, { transform: 'scale(1.11)' }, { transform: 'scale(1)' }], { duration: crit || high ? 620 : 360, easing: 'cubic-bezier(0.22,1,0.36,1)' });
    };
    raf = requestAnimationFrame(step);
    close.current?.focus({ preventScroll: true });
    return () => cancelAnimationFrame(raf);
  }, [result.total]); // eslint-disable-line react-hooks/exhaustive-deps
  const pairState = (side: 'hope' | 'fear') => (crit ? 'crit' : result.verdict === side ? 'win' : 'lose');
  const line = crit ? '#F9D68D' : result.verdict === 'hope' ? 'rgba(242,198,106,0.8)' : result.verdict === 'fear' ? 'rgba(201,166,240,0.7)' : 'rgba(218,162,73,0.55)';
  const glow = crit ? 'rgba(249,214,141,0.35)' : result.verdict === 'hope' ? 'rgba(210,160,60,0.18)' : result.verdict === 'fear' ? 'rgba(120,70,190,0.22)' : 'rgba(218,162,73,0.08)';
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div role="status" aria-live="polite" aria-label={`Rolled ${result.total}${word ? `, ${word}` : ''}`}
      onPointerEnter={() => setHeld(true)} onPointerLeave={() => setHeld(false)}
      onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onAccept(); } }}
      style={{ position: 'fixed', left: box.left + box.width / 2, top: box.top + 12, zIndex: 1150, transform: 'translateX(-50%)', animation: `${crit ? 'rk-plaque-crit 700ms' : 'rk-plaque-in 320ms'} cubic-bezier(0.22,1,0.36,1) both`, filter: `drop-shadow(0 14px 26px rgba(0,0,0,0.6))${crit ? ' drop-shadow(0 0 22px rgba(249,214,141,0.55))' : ''}` }}>
      <Chamfer c={12} fill={`radial-gradient(ellipse at 50% 0%, ${glow}, rgba(11,14,19,0.97) 70%)`} line={line} width={crit ? 2 : 1.3}
        inner={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 16, padding: '10px 40px 12px 18px', overflow: 'hidden', background: `radial-gradient(ellipse at 50% 0%, ${glow}, rgba(11,14,19,0.97) 70%)` }}>
        {crit ? <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(105deg, transparent 35%, rgba(255,244,214,0.55) 50%, transparent 65%)', animation: 'rk-shine 1.6s 0.2s ease-in-out 2', pointerEvents: 'none' }} /> : null}
        {hope ? <DieBadge d={hope} state={pairState('hope')} delay={0} /> : null}
        {others.length ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxWidth: 220, justifyContent: 'flex-end' }}>
            {others.slice(0, 8).map((d, i) => <DieBadge key={d.id} d={d} state={null} delay={i * 60} />)}
            {others.length > 8 ? <span style={{ alignSelf: 'center', color: T.muted, fontFamily: T.bold, fontSize: 12 }}>+{others.length - 8}</span> : null}
          </div>
        ) : null}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 74, position: 'relative' }}>
          {word ? <div style={{ color, fontFamily: T.bold, fontSize: crit ? 13 : 11.5, letterSpacing: crit ? 3 : 1.6, textTransform: 'uppercase', whiteSpace: 'nowrap', textShadow: crit ? '0 0 12px rgba(249,214,141,0.8)' : 'none' }}>{word}</div> : null}
          <div style={{ position: 'relative' }}>
            {anyOne ? <div aria-hidden="true" style={{ position: 'absolute', inset: '-4px -10px', background: '#7E1512', clipPath: OCT, animation: 'rk-red 410ms ease-out both', zIndex: 0 }} /> : null}
            <div ref={num} style={{ position: 'relative', color, fontFamily: T.display, fontSize: crit ? 60 : 50, lineHeight: crit ? '62px' : '52px', textShadow: crit ? '0 0 26px rgba(249,214,141,0.75)' : high ? '0 0 16px rgba(242,198,106,0.35)' : 'none' }}>{result.total}</div>
          </div>
          {result.mod ? <div style={{ color: T.muted, fontFamily: T.medium, fontSize: 12, whiteSpace: 'nowrap' }}>{sum} {result.mod > 0 ? '+' : '-'} {Math.abs(result.mod)}{result.label ? ` ${result.label}` : ''}</div> : null}
        </div>
        {fear ? <DieBadge d={fear} state={pairState('fear')} delay={60} /> : null}
        <button ref={close} type="button" aria-label="Close" title="Close" onClick={onAccept} className="rk-ok"
          style={{ all: 'unset', cursor: 'pointer', position: 'absolute', right: 6, top: 6, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.muted }}>
          <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2l10 10M12 2 2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
        <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, background: color, opacity: 0.6, transformOrigin: 'left', animation: `rk-roll-left ${STAY_MS}ms linear forwards`, animationPlayState: held ? 'paused' : 'running' }} />
      </Chamfer>
      <style>{`
        @keyframes rk-roll-left { from { transform: scaleX(1); } to { transform: scaleX(0); } }
        @keyframes rk-plaque-in { from { opacity: 0; transform: translate(-50%, -16px) scale(0.96); } to { opacity: 1; transform: translate(-50%, 0) scale(1); } }
        @keyframes rk-plaque-crit { 0% { opacity: 0; transform: translate(-50%, -10px) scale(0.6); } 45% { opacity: 1; transform: translate(-50%, 0) scale(1.12); } 58% { transform: translate(calc(-50% + 7px), 0) scale(1.06) rotate(1.2deg); } 70% { transform: translate(calc(-50% - 6px), 0) scale(1.03) rotate(-1deg); } 82% { transform: translate(calc(-50% + 3px), 0) scale(1.01); } 100% { transform: translate(-50%, 0) scale(1); } }
        @keyframes rk-badge-in { from { opacity: 0; transform: scale(0.4) rotate(-25deg); } to { opacity: 1; transform: scale(1) rotate(0); } }
        @keyframes rk-shine { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
        @keyframes rk-red { 0% { opacity: 0; } 22% { opacity: 1; } 100% { opacity: 0; } }
        @media (prefers-reduced-motion: reduce) { [aria-live] * { animation-duration: 1ms !important; } }
      `}</style>
    </div>,
    document.body,
  );
}
