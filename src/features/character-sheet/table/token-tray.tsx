/**
 * The token tray (v0.47.1, owner): the phone's tokens on the desktop table. Drag a token (wood, bone, iron, your
 * colour) or a token die onto a card, on the table or in the middle of your hand, and it sticks to that card the
 * same way it does on the phone. On a card laid on the table it stands up as a 3D piece. A piece dragged back into
 * this tray comes off its card.
 *
 * A click on the colour token picks the next colour; a click on the die picks the next size.
 */
import { forwardRef, useState } from 'react';

import { DIE_COLOR, type DieType, nextDieType, TOKEN_BASE, TOKEN_COLORS, type TokenKind } from '../components/card-tokens-data';
import { playSfx } from '@/lib/sfx';
import { Chamfer, T } from './table-ui';

export interface NewToken { kind: TokenKind; color?: string; dieType?: DieType; dieValue?: number; dieValue2?: number }

export const TokenTray = forwardRef<HTMLDivElement, {
  right: number;
  top: number;
  color: string;
  onColor: (c: string) => void;
  /** Stick a token to whatever card is under this point; false when there is no card there. */
  place: (clientX: number, clientY: number, token: NewToken) => boolean;
  /** Something is being dragged over the tray to be taken off its card. */
  lit: boolean;
}>(function TokenTray({ right, top, color, onColor, place, lit }, ref) {
  const [die, setDie] = useState<DieType>('d6');
  const [ghost, setGhost] = useState<{ x: number; y: number; token: NewToken } | null>(null);
  const c = color || TOKEN_COLORS[0];
  const items: { key: string; token: NewToken; fill: string; label: string; onClick?: () => void }[] = [
    { key: 'wood', token: { kind: 'wood' }, fill: TOKEN_BASE.wood, label: 'Wood' },
    { key: 'bone', token: { kind: 'bone' }, fill: TOKEN_BASE.bone, label: 'Bone' },
    { key: 'iron', token: { kind: 'iron' }, fill: TOKEN_BASE.iron, label: 'Iron' },
    { key: 'color', token: { kind: 'color', color: c }, fill: c, label: 'Colour', onClick: () => { const i = TOKEN_COLORS.indexOf(c); onColor(TOKEN_COLORS[(i + 1) % TOKEN_COLORS.length]); playSfx('tokenCopyColor', { volume: 0.6 }); } },
    { key: 'die', token: { kind: 'die', dieType: die, dieValue: 1, dieValue2: die === 'duality' ? 1 : undefined }, fill: DIE_COLOR[die], label: die === 'duality' ? 'Hope & Fear' : die, onClick: () => { setDie(nextDieType(die)); playSfx('placeToken', { volume: 0.5, cents: 200 }); } },
  ];
  const start = (e: React.PointerEvent, it: (typeof items)[number]) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX, sy = e.clientY;
    let moved = false;
    const move = (m: PointerEvent) => {
      if (!moved && Math.hypot(m.clientX - sx, m.clientY - sy) < 5) return;
      if (!moved) { moved = true; playSfx('cardDragStart', { volume: 0.5 }); }
      setGhost({ x: m.clientX, y: m.clientY, token: it.token });
    };
    const up = (u: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setGhost(null);
      if (!moved) { it.onClick?.(); return; }
      if (place(u.clientX, u.clientY, it.token)) playSfx('placeToken');
      else playSfx('cardDeselect', { volume: 0.5 });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <>
      <div ref={ref} role="toolbar" aria-label="Tokens" style={{ position: 'absolute', right, top, zIndex: 32, width: 62 }} onPointerDown={(e) => e.stopPropagation()}>
        <Chamfer c={10} line={lit ? T.red : T.goldSoft} fill={lit ? 'rgba(200,27,24,0.22)' : 'rgba(11,14,19,0.9)'} inner={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '12px 0 10px' }}>
          <span style={{ color: T.muted, fontFamily: T.bold, fontSize: 9.5, letterSpacing: 1, textTransform: 'uppercase' }}>{lit ? 'Remove' : 'Tokens'}</span>
          {items.map((it) => (
            <button key={it.key} type="button" title={it.onClick ? `${it.label}. Drag onto a card; click for the next ${it.key === 'die' ? 'size' : 'colour'}` : `${it.label}. Drag onto a card`} aria-label={`${it.label} token`}
              onPointerDown={(e) => start(e, it)} style={{ all: 'unset', cursor: 'grab', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <TokenDot token={it.token} fill={it.fill} size={30} />
              <span style={{ color: T.goldText, fontFamily: T.bold, fontSize: 9, letterSpacing: 0.5, textTransform: it.key === 'die' ? 'none' : 'uppercase' }}>{it.label}</span>
            </button>
          ))}
        </Chamfer>
      </div>
      {ghost ? (
        <div style={{ position: 'fixed', left: ghost.x - 18, top: ghost.y - 18, zIndex: 2000, pointerEvents: 'none', filter: 'drop-shadow(0 8px 10px rgba(0,0,0,0.6))' }}>
          <TokenDot token={ghost.token} fill={ghost.token.kind === 'die' ? DIE_COLOR[ghost.token.dieType ?? 'd6'] : ghost.token.color ?? TOKEN_BASE[ghost.token.kind as 'wood']} size={36} />
        </div>
      ) : null}
    </>
  );
});

/** A token's mark in the tray: a disc for a token, a cut gem for a die. */
function TokenDot({ token, fill, size }: { token: NewToken; fill: string; size: number }) {
  if (token.kind === 'die') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <polygon points="12,1.5 21.5,7 21.5,17 12,22.5 2.5,17 2.5,7" fill={fill} stroke="rgba(0,0,0,0.45)" strokeWidth="1" />
        <polygon points="12,6.5 17,15 7,15" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.2" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill={fill} stroke="rgba(0,0,0,0.45)" strokeWidth="1" />
      <circle cx="12" cy="12" r="6.5" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1.2" />
    </svg>
  );
}
