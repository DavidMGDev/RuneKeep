/**
 * The desktop table's own small parts (v0.47.0), drawn as DOM because the table only ever runs in a desktop
 * browser: the chamfered panel (the app's 45° cut, as a clip path, with a gold hairline), a button, and the
 * shared colours. Kept here so every table surface draws them the same way.
 */
import type { CSSProperties, ReactNode } from 'react';
import { useState } from 'react';

import { Body, Display, DmRune, Rune } from '@/constants/theme';

export const T = {
  ink: Rune.ink,
  panel: Rune.panel,
  panelLit: DmRune.panelLit,
  gold: Rune.goldEdge,
  goldSoft: 'rgba(218,162,73,0.42)',
  goldText: Rune.goldText,
  goldBright: Rune.goldBright,
  ivory: Rune.ivory,
  muted: Rune.muted,
  red: Rune.red,
  redHover: '#DB2622',
  display: Display.black,
  bold: Body.bold,
  medium: Body.medium,
  ease: 'cubic-bezier(0.16,1,0.3,1)',
} as const;

/** The 45° cut on every corner of a box, as a CSS clip path. */
export const chamferClip = (c: number) => `polygon(${c}px 0, calc(100% - ${c}px) 0, 100% ${c}px, 100% calc(100% - ${c}px), calc(100% - ${c}px) 100%, ${c}px 100%, 0 calc(100% - ${c}px), 0 ${c}px)`;

/** A chamfered panel: a gold hairline round a dark fill. */
export function Chamfer({ c = 10, line = T.goldSoft, fill = T.panel, width = 1.2, style, inner, children }: { c?: number; line?: string; fill?: string; width?: number; style?: CSSProperties; inner?: CSSProperties; children?: ReactNode }) {
  return (
    <div style={{ clipPath: chamferClip(c), background: line, padding: width, ...style }}>
      <div style={{ clipPath: chamferClip(Math.max(0, c - width * 0.4)), background: fill, width: '100%', height: '100%', boxSizing: 'border-box', ...inner }}>{children}</div>
    </div>
  );
}

/**
 * The table's button: chamfered, a label in Archivo Bold capitals. `primary` is the one red action of a group;
 * the rest are gold hairlines on ink, lit on hover.
 */
export function TButton({ label, onPress, primary, disabled, icon, title, h = 34, wide, active }: { label?: string; onPress: () => void; primary?: boolean; disabled?: boolean; icon?: ReactNode; title?: string; h?: number; wide?: boolean; active?: boolean }) {
  const [hover, setHover] = useState(false);
  const [down, setDown] = useState(false);
  const lit = hover && !disabled;
  const fill = primary ? (lit ? T.redHover : T.red) : active ? 'rgba(200,27,24,0.22)' : lit ? T.panelLit : T.ink;
  const line = primary ? T.red : active ? T.red : lit ? T.goldBright : T.goldSoft;
  return (
    <button
      type="button"
      title={title ?? label}
      aria-label={title ?? label}
      disabled={disabled}
      onClick={onPress}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => { setHover(false); setDown(false); }}
      onPointerDown={() => setDown(true)}
      onPointerUp={() => setDown(false)}
      style={{ all: 'unset', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1, transform: down && !disabled ? 'scale(0.96)' : 'none', transition: `transform 120ms ${T.ease}`, flex: wide ? 1 : undefined, display: 'block' }}>
      <Chamfer c={7} line={line} fill={fill} style={{ height: h }} inner={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: label ? '0 14px' : 0, minWidth: label ? undefined : h - 2.4 }}>
        {icon}
        {label ? <span style={{ color: primary || lit || active ? T.ivory : T.goldText, fontFamily: T.bold, fontSize: 12, letterSpacing: 1.1, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label}</span> : null}
      </Chamfer>
    </button>
  );
}

/** A stroked 24-unit glyph in the table's gold, for buttons. */
export function Glyph({ d, size = 18, color = T.goldText }: { d: string; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: d }} />
  );
}

/**
 * The glyphs the table's button dice wear, as SVG markup (24-unit box, stroked), so the same drawing paints a
 * die's faces and a menu's icon.
 */
export const DIE_GLYPHS = {
  roll: '<path d="M12 2.6 20.4 7.4v9.2L12 21.4 3.6 16.6V7.4Z"/><path d="M12 7.6 16.4 15H7.6Z"/><path d="M12 2.6v5M20.4 7.4 16.4 15M3.6 7.4 7.6 15M7.6 15 12 21.4 16.4 15"/>',
  rest: '<path d="M19.5 14.6A8 8 0 1 1 9.4 4.5a6.2 6.2 0 0 0 10.1 10.1Z"/>',
  level: '<path d="M5 12.5 12 5.5l7 7"/><path d="M5 18.5 12 11.5l7 7"/>',
  state: '<path d="M4.5 7h15M4.5 12h15M4.5 17h15"/><circle cx="9" cy="7" r="2" fill="currentColor"/><circle cx="15" cy="12" r="2" fill="currentColor"/><circle cx="10.5" cy="17" r="2" fill="currentColor"/>',
  cards: '<rect x="8" y="3.5" width="11" height="15" rx="1.2"/><path d="M5 7.5v11.6c0 .8.6 1.4 1.4 1.4H15"/>',
  sort: '<path d="M8 4v16M4.6 7.4 8 4l3.4 3.4M16 20V4M12.6 16.6 16 20l3.4-3.4"/>',
  exit: '<path d="M13.5 4H19v16h-5.5"/><path d="M9.5 8 5.5 12l4 4M5.5 12H15"/>',
  rotate: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.8 4.2v4.6h-4.6"/>',
  // The phone's token: a sewing button, rim and four holes.
  token: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="6"/><circle cx="10.2" cy="10.2" r="1" fill="currentColor"/><circle cx="13.8" cy="10.2" r="1" fill="currentColor"/><circle cx="10.2" cy="13.8" r="1" fill="currentColor"/><circle cx="13.8" cy="13.8" r="1" fill="currentColor"/>',
  // A toothed cog (v0.47.1, owner: the old sun-like mark read as a light and dark switch).
  settings: '<path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/><path d="M19.4 13.4a7.6 7.6 0 0 0 0-2.8l2-1.5-2-3.5-2.4 1a7.4 7.4 0 0 0-2.4-1.4L14.2 2.6h-4.4l-.4 2.6A7.4 7.4 0 0 0 7 6.6l-2.4-1-2 3.5 2 1.5a7.6 7.6 0 0 0 0 2.8l-2 1.5 2 3.5 2.4-1a7.4 7.4 0 0 0 2.4 1.4l.4 2.6h4.4l.4-2.6a7.4 7.4 0 0 0 2.4-1.4l2.4 1 2-3.5Z"/>',
  reset: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.2 4.2v4.6h4.6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
} as const;
export type GlyphKey = keyof typeof DIE_GLYPHS;

/** A glyph's markup as an image, for painting onto a die (`currentColor` resolved to `color`). */
export function glyphImage(key: GlyphKey, color: string): Promise<HTMLImageElement> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 24 24" fill="none" stroke="${color}" color="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${DIE_GLYPHS[key]}</svg>`;
  return svgImage(svg);
}

export function svgImage(markup: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  });
}

/**
 * An icon in one colour: whatever it was drawn in, every pixel it covers becomes `color` (keeping its alpha). Lets
 * the gold deck glyphs sit dark on a gilded or ivory die.
 */
export function tinted(img: CanvasImageSource, color: string, size = 160): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0, size, size);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, size, size);
  return c;
}
