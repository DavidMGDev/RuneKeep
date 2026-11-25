/**
 * The desktop table's hand (v0.47.0): a straight carousel drawn straight into the DOM and moved by one frame loop,
 * so every setting in Table settings (gap, curve, fan, 3D turn, edge effects, how cards leave) is one line of maths
 * here and costs nothing until it is used.
 *
 * Input stays inside the card tray: the wheel walks the deck, a drag sweeps it (the whole deck in `swipe` px, like
 * the phone's gear, without shrinking the cards), a click on a side card brings it to the centre, and a click on
 * the centre card does what the look says (take a copy to the table by default). Nothing outside the tray moves it.
 *
 * Hover lifts a card's PICTURE only; the card's hit area never moves, so the pointer cannot chase a rising card.
 */
import { forwardRef, memo, type ReactNode, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ArtImage } from '@/components/art-image';
import { FORGED_H, FORGED_W } from '@/features/create/components/forged-card';
import { T } from './table-ui';
import { cardOffset, type DeckLook, fitSize, lookScale, lookX, pastSpot, visibleReach } from './deck-look';

export interface TableCard {
  id: string;
  /** Its height at the 230 width everything is drawn at, when it is not a card's (a sticky note is square). */
  h?: number;
  thumb?: number | { uri: string };
  source?: number | { uri: string };
  custom?: ReactNode;
  faces?: { thumb?: number | { uri: string }; source?: number | { uri: string }; custom?: ReactNode }[];
  /** Drawn over the card (the equipped corner, tokens, a struck trait). */
  overlay?: ReactNode;
  /** A card with controls on it (a counter), drawn live where it lies on the table so they can be used there. */
  live?: ReactNode;
}

export interface DeskCarouselHandle {
  stepBy: (n: number) => void;
  centerIndex: () => number;
  scrollTo: (i: number) => void;
  /** A piece carried over the hand (owner, v0.47.11): light the card under the point, or none (null). */
  hoverAt: (clientX: number | null, clientY?: number) => void;
  /** The card lit now, as it is drawn (lifted and zoomed), for a drop onto it. */
  hoveredFace: () => { el: HTMLElement; face: HTMLElement } | null;
}

/** A card's face, at thumbnail or full resolution. */
export function CardFace({ card, hiRes, face = 0 }: { card: TableCard; hiRes: boolean; face?: number }) {
  const f = card.faces?.length ? card.faces[face % card.faces.length] : card;
  if (f.custom) return <>{f.custom}</>;
  return (
    <>
      {f.thumb != null ? <ArtImage key={`lod${face}`} source={f.thumb} fit="contain" recyclingKey={`${card.id}-lod-${face}`} /> : null}
      {/* Its own key per page (v0.50.6), so a page turned to never shows the last page's picture while it loads. */}
      {hiRes && f.source != null ? <View style={StyleSheet.absoluteFill}><ArtImage key={face} source={f.source} fit="contain" recyclingKey={`${card.id}-${face}`} /></View> : null}
    </>
  );
}

const Slot = memo(function Slot({ card, index, hiRes, hovered, taken, lifted, look, register }: { card: TableCard; index: number; hiRes: boolean; hovered: boolean; /** A copy of it is in your hand: it dims. */ taken: boolean; /** Being re-arranged: held up higher, ringed in gold. */ lifted?: boolean; look: DeckLook; register: (i: number, el: HTMLElement | null, veil: HTMLElement | null) => void }) {
  const outer = useRef<HTMLDivElement>(null);
  const veil = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    register(index, outer.current, veil.current);
    return () => register(index, null, null);
  }, [index, register]);
  return (
    // A card kept as a layer is drawn once at the size it was and only stretched after: under the pointer, or when every
    // card is to stay sharp, it is let go of so it is drawn again at the size it is shown (v0.47.17).
    <div ref={outer} data-card-id={card.id} data-slot={index} style={{ position: 'absolute', left: 0, top: 0, width: FORGED_W, height: FORGED_H, cursor: 'pointer', visibility: 'hidden', willChange: hovered || look.sharp ? 'auto' : 'transform', pointerEvents: 'auto' }}>
      <div
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          transform: lifted ? `translateY(${-look.hoverLift - 18}px) scale(${look.hoverZoom * 1.04})` : hovered ? `translateY(${-look.hoverLift}px) scale(${look.hoverZoom})` : 'none',
          transition: 'transform 170ms cubic-bezier(0.16,1,0.3,1), box-shadow 170ms',
          boxShadow: lifted ? `0 0 0 3px ${T.goldBright}, 0 0 34px rgba(224,181,99,0.6), 0 22px 44px rgba(0,0,0,0.6)` : look.shadow > 0 ? `0 ${10 * look.shadow}px ${28 * look.shadow}px rgba(0,0,0,${0.55 * look.shadow})` : 'none',
        }}>
        <CardFace card={card} hiRes={hiRes} />
        {card.overlay ? <View style={StyleSheet.absoluteFill}>{card.overlay}</View> : null}
        <div ref={veil} style={{ position: 'absolute', inset: 0, background: '#06080d', opacity: 0 }} />
        <div style={{ position: 'absolute', inset: 0, background: '#06080d', opacity: taken ? 0.45 : 0, transition: 'opacity 200ms' }} />
      </div>
    </div>
  );
});

export const DeskCarousel = forwardRef<DeskCarouselHandle, {
  cards: TableCard[];
  look: DeckLook;
  initialIndex: number;
  /** The card a copy of which is in your hand: it dims, and no card lights up while you carry it. */
  takenId?: string;
  /** Its menu is open: it stays lit, wherever the pointer goes, until the menu closes. */
  heldId?: string;
  /** Each time a new card reaches the centre. */
  onCentre: (i: number) => void;
  /** The centre card was clicked: where it is on screen and where the pointer is. */
  onCentreClick: (card: TableCard, rect: DOMRect, pointer: { x: number; y: number }) => void;
  /**
   * The card being re-arranged (owner, v0.50.4): held up in the hand, it takes the place nearest the pointer as it moves
   * (and as the wheel turns the hand under it), the rest sliding aside. A click keeps the order, Escape or a right click
   * puts it back as it was.
   */
  arranging?: string;
  onArrange?: (to: number) => void;
  onArrangeEnd?: (keep: boolean) => void;
}>(function DeskCarousel({ cards, look, initialIndex, onCentre, onCentreClick, takenId, heldId, arranging, onArrange, onArrangeEnd }, ref) {
  const count = cards.length;
  const root = useRef<HTMLDivElement>(null);
  const size = useRef({ w: 0, h: 0 });
  const [box, setBox] = useState({ w: 0, h: 0 });
  const st = useRef({ pos: initialIndex, target: initialIndex, vel: 0, dragging: false, aim: -1 });
  const els = useRef(new Map<number, { el: HTMLElement; veil: HTMLElement | null; last: string; /** Its place across the hand (px), not where it is drawn on the way there. */ cx?: number }>());
  /** Where each card is drawn along the hand, by id: it eases to its place when the order changes, never jumps. */
  const shown = useRef(new Map<string, number>());
  const easing = useRef(false);
  const arrangingRef = useRef(arranging);
  arrangingRef.current = arranging;
  const arrangeCbs = useRef({ onArrange, onArrangeEnd });
  arrangeCbs.current = { onArrange, onArrangeEnd };
  /** The place last asked for while re-arranging, so a frame never asks twice. */
  const asked = useRef(-1);
  /** The two end marks: before the first card and after the last. */
  const dots = useRef<(HTMLDivElement | null)[]>([null, null]);
  const lookRef = useRef(look);
  lookRef.current = look;
  const countRef = useRef(count);
  countRef.current = count;
  const mod = (i: number) => ((i % count) + count) % count;
  const [center, setCenter] = useState(() => Math.min(count - 1, Math.max(0, initialIndex)));
  const centerRef = useRef(center);
  const [hover, setHover] = useState(-1);
  const hoverRef = useRef(hover);
  hoverRef.current = hover;
  const takenRef = useRef(takenId);
  takenRef.current = takenId;
  useEffect(() => { if (takenId) setHover(-1); }, [takenId]);
  // A card whose menu is open stays lit (owner, v0.50.0). When the menu goes it stays so while the pointer is still on
  // it as it is drawn, lifted: the menu's backdrop took the pointer, so the browser will send no leave for it.
  const heldRef = useRef(heldId);
  heldRef.current = heldId;
  const pointer = useRef({ x: -1, y: -1 });
  const stopWatch = useRef<(() => void) | null>(null);
  useEffect(() => () => stopWatch.current?.(), []);
  useEffect(() => {
    if (!heldId) return;
    stopWatch.current?.();
    setHover(cardsRef.current.findIndex((c) => c.id === heldId));
    const track = (e: PointerEvent) => { pointer.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener('pointermove', track, true);
    window.addEventListener('pointerdown', track, true);
    return () => {
      window.removeEventListener('pointermove', track, true);
      window.removeEventListener('pointerdown', track, true);
      const settle = () => {
        if (heldRef.current) return;
        const { x, y } = pointer.current;
        const top = document.elementFromPoint(x, y) as HTMLElement | null;
        const slot = top?.closest<HTMLElement>('[data-slot]');
        // Back on a card: from here the hand's own enter and leave see to it.
        if (slot && root.current?.contains(slot)) { setHover(Number(slot.dataset.slot)); stopWatch.current?.(); return; }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- as the hand is when the menu has gone, on purpose
        const felt = root.current?.closest('[data-table-root]');
        // eslint-disable-next-line react-hooks/exhaustive-deps -- as the hand is when the menu has gone, on purpose
        const r = els.current.get(hoverRef.current)?.el.firstElementChild?.getBoundingClientRect();
        const still = !!r && !!top && !!felt?.contains(top) && !top.closest('[data-ui], [role="menu"]') && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
        if (!still) { setHover(-1); stopWatch.current?.(); }
      };
      const moved = (e: PointerEvent) => { track(e); settle(); };
      window.addEventListener('pointermove', moved, true);
      const frame = requestAnimationFrame(settle);
      stopWatch.current = () => {
        cancelAnimationFrame(frame);
        window.removeEventListener('pointermove', moved, true);
        stopWatch.current = null;
      };
    };
  }, [heldId]);
  const cbs = useRef({ onCentre, onCentreClick });
  cbs.current = { onCentre, onCentreClick };

  const register = useCallback((i: number, el: HTMLElement | null, veil: HTMLElement | null) => {
    if (el) els.current.set(i, { el, veil, last: '' });
    else els.current.delete(i);
    kick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------------ the frame loop
  const raf = useRef(0);
  const lastT = useRef(0);
  /** When this deck arrived: its cards play the look's deck-switch entrance from here (owner, v0.47.1). */
  const born = useRef(performance.now());
  const INTRO_MS = 300;
  const draw = useCallback(() => {
    const l = lookRef.current;
    const n = countRef.current;
    const { w: W, h: H } = size.current;
    if (!W || !n) return;
    const s = st.current;
    const fitW = fitSize(l, H);
    const base = fitW / FORGED_W;
    const cardH = FORGED_H * base;
    const cy = cardH / 2 + 14 + l.rowY * Math.max(0, H - cardH - 28);
    const reach = visibleReach(l);
    const band = (l.edgeWidth / 100) * W;
    const since = performance.now() - born.current;
    /** Where a card this far from the middle goes: its centre, size and how visible it is. */
    const at = (d: number) => {
      const ad = Math.abs(d);
      const sg = d < 0 ? -1 : 1;
      const k = pastSpot(ad, l);
      const out = Math.max(0, ad - reach);
      let scale = lookScale(ad, l) * base;
      const x = sg * lookX(ad, l, fitW);
      const t = reach > 0 ? Math.min(1, ad / reach) : 1;
      let y = cy - FORGED_H / 2 + k * l.drop + l.arc * t * t - l.lift * Math.max(0, 1 - k);
      let opacity = 1;
      if (out > 0) {
        if (l.exit === 'fade') opacity *= 1 - out;
        else if (l.exit === 'shrink') scale *= Math.max(0, 1 - out);
        else if (l.exit === 'sink') { y += out * H * 0.7; opacity *= 1 - out * 0.6; }
        else opacity = out < 0.5 ? opacity : 0;
      }
      return { cx: W / 2 + x, cy: y + FORGED_H / 2, scale, opacity: out >= 1 ? 0 : opacity };
    };
    // The end marks (owner, v0.47.11): on the path as if one more card lay there, about 20px past the end card's edge.
    const mark = (el: HTMLDivElement | null, dEnd: number, dir: -1 | 1, show: boolean) => {
      if (!el) return;
      if (!show) { el.style.visibility = 'hidden'; return; }
      const a = at(dEnd), b = at(dEnd + dir);
      const dist = Math.hypot(b.cx - a.cx, b.cy - a.cy) || 1;
      const f = Math.min(1.6, ((FORGED_W / 2) * a.scale + 20) / dist);
      const x = a.cx + (b.cx - a.cx) * f, y = a.cy + (b.cy - a.cy) * f;
      el.style.visibility = a.opacity > 0.05 ? 'visible' : 'hidden';
      el.style.opacity = String(Math.min(1, a.opacity));
      el.style.transform = `translate(${(x - 3.5).toFixed(1)}px, ${(y - 3.5).toFixed(1)}px)`;
    };
    if (l.loop) {
      // An endless deck has one seam: halfway between the last card and the first.
      const d0 = cardOffset(0, s.pos, n, true), dl = cardOffset(n - 1, s.pos, n, true);
      const seam = Math.abs(d0 - dl) > 1.5 ? null : d0;
      mark(dots.current[0], seam ?? 0, -1, l.endDots && seam !== null && n > 1);
      mark(dots.current[1], 0, 1, false);
    } else {
      mark(dots.current[0], -s.pos, -1, l.endDots);
      mark(dots.current[1], n - 1 - s.pos, 1, l.endDots);
    }
    const seen = new Set<string>();
    let moving = false;
    for (const [i, rec] of els.current) {
      const id = cardsRef.current[i]?.id ?? '';
      let si = shown.current.get(id) ?? i;
      si += (i - si) * 0.24;
      if (Math.abs(i - si) < 0.003) si = i; else moving = true;
      shown.current.set(id, si);
      seen.add(id);
      const dt0 = cardOffset(i, s.pos, n, l.loop);
      rec.cx = W / 2 + (dt0 < 0 ? -1 : 1) * lookX(Math.abs(dt0), l, fitW);
      const d = cardOffset(si, s.pos, n, l.loop);
      const ad = Math.abs(d);
      const sg = d < 0 ? -1 : 1;
      const k = pastSpot(ad, l);
      const out = Math.max(0, ad - reach); // past the last place: leaving
      let scale = lookScale(ad, l) * base;
      let x = sg * lookX(ad, l, fitW);
      // The entrance: a slide in from the right, cards dealt out from the middle, or a fade.
      let enter = 1;
      if (l.switchFx !== 'none' && since < INTRO_MS + 600) {
        const t0 = l.switchFx === 'deal' ? Math.min(1, Math.max(0, (since - ad * 45) / INTRO_MS)) : Math.min(1, since / INTRO_MS);
        const e0 = 1 - Math.pow(1 - t0, 3);
        if (l.switchFx === 'slide') { x += (1 - e0) * W * 0.22; enter = 0.25 + 0.75 * e0; }
        else if (l.switchFx === 'deal') { x *= e0; scale *= 0.72 + 0.28 * e0; enter = e0; }
        else enter = e0;
      }
      const t = reach > 0 ? Math.min(1, ad / reach) : 1;
      let y = cy - FORGED_H / 2 + k * l.drop + l.arc * t * t - l.lift * Math.max(0, 1 - k);
      let opacity = enter;
      if (out > 0) {
        if (l.exit === 'fade') opacity *= 1 - out;
        else if (l.exit === 'shrink') scale *= Math.max(0, 1 - out);
        else if (l.exit === 'sink') { y += out * H * 0.7; opacity *= 1 - out * 0.6; }
        else opacity = out < 0.5 ? opacity : 0;
      }
      const hidden = out >= 1 || opacity <= 0.01 || scale <= 0.005;
      const rotZ = sg * l.tilt * ad;
      const rotY = -sg * l.turn * Math.min(1, k);
      // Never below 1: the end marks sit at 0, behind every card (owner, v0.47.12: on a curved hand one showed over the cards).
      // The lit card comes to the front (v0.47.18): lifted but left behind a neighbour, a token let go on what showed went
      // to the card underneath.
      const z = Math.max(1, l.stack === 'centre' ? 1000 - Math.round(ad * 10) : l.stack === 'left' ? 1000 - Math.round(d * 10) : 1000 + Math.round(d * 10)) + (i === hoverRef.current && !takenRef.current ? 5000 : 0) + (id && id === arrangingRef.current ? 6000 : 0);
      // The edge effect, by where the card's centre is across the tray.
      const ex = W / 2 + x;
      const e = band > 0 ? 1 - Math.min(1, Math.max(0, Math.min(ex, W - ex) / band)) : 0;
      let veil = Math.min(0.9, k * l.dim);
      let blur = k * l.blur;
      let grey = Math.min(1, k * l.grey);
      if (l.edge === 'darken') veil = Math.min(0.95, veil + e * 0.9);
      else if (l.edge === 'blur') blur += e * 7;
      else if (l.edge === 'grey') grey = Math.min(1, grey + e);
      const tf = `translate(${(W / 2 - FORGED_W / 2 + x).toFixed(2)}px, ${y.toFixed(2)}px) rotateZ(${rotZ.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) scale(${scale.toFixed(4)})`;
      const filter = blur > 0.05 || grey > 0.01 ? `${blur > 0.05 ? `blur(${blur.toFixed(1)}px)` : ''} ${grey > 0.01 ? `grayscale(${grey.toFixed(2)})` : ''}` : 'none';
      const key = `${tf}|${opacity.toFixed(3)}|${hidden}|${z}|${filter}|${veil.toFixed(3)}`;
      if (key === rec.last) continue;
      rec.last = key;
      const st2 = rec.el.style;
      st2.transform = tf;
      st2.opacity = String(opacity);
      st2.visibility = hidden ? 'hidden' : 'visible';
      st2.zIndex = String(z);
      st2.filter = filter;
      if (rec.veil) rec.veil.style.opacity = String(veil);
    }
    for (const k of [...shown.current.keys()]) if (!seen.has(k)) shown.current.delete(k);
    easing.current = moving;
    // Re-arranging: the held card takes the place nearest the pointer.
    const held = arrangingRef.current;
    if (held && pointer.current.x >= 0) {
      const left = root.current?.getBoundingClientRect().left ?? 0;
      let best = -1, bd = Infinity;
      for (const [i, rec] of els.current) {
        if (rec.cx === undefined || rec.el.style.visibility === 'hidden') continue;
        const dd = Math.abs(left + rec.cx - pointer.current.x);
        if (dd < bd) { bd = dd; best = i; }
      }
      const cur = cardsRef.current.findIndex((x) => x.id === held);
      if (best >= 0 && best !== cur && best !== asked.current) { asked.current = best; arrangeCbs.current.onArrange?.(best); }
    }
    const c = l.loop ? mod(Math.round(s.pos)) : Math.min(n - 1, Math.max(0, Math.round(s.pos)));
    if (c !== centerRef.current) {
      centerRef.current = c;
      setCenter(c);
      cbs.current.onCentre(c);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tick = useCallback((t: number) => {
    raf.current = 0;
    const dt = Math.min(0.05, (t - lastT.current) / 1000);
    lastT.current = t;
    const s = st.current;
    const l = lookRef.current;
    if (!s.dragging) {
      const k = 170 * l.snap * l.snap;
      const c = 2 * Math.sqrt(k);
      s.vel += (k * (s.target - s.pos) - c * s.vel) * dt;
      s.pos += s.vel * dt;
      if (Math.abs(s.target - s.pos) < 0.0005 && Math.abs(s.vel) < 0.002) {
        s.pos = s.target;
        s.vel = 0;
        if (s.aim === s.target) s.aim = -1;
        if (l.loop && countRef.current) {
          // Keep the numbers small on a deck that has gone round many times.
          const n = countRef.current;
          const wrap = Math.floor(s.pos / n) * n;
          s.pos -= wrap;
          s.target -= wrap;
          if (s.aim >= 0) s.aim -= wrap;
        }
      }
    }
    draw();
    const entering = l.switchFx !== 'none' && performance.now() - born.current < INTRO_MS + 600;
    if (s.dragging || s.pos !== s.target || s.vel !== 0 || entering || easing.current) raf.current = requestAnimationFrame(tick);
  }, [draw]);

  const kick = useCallback(() => {
    if (raf.current) return;
    lastT.current = performance.now();
    raf.current = requestAnimationFrame(tick);
  }, [tick]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  // A new look re-draws every card (the per-card cache keys on the output, so nothing else is needed).
  useEffect(() => { kick(); }, [look, kick]);
  useEffect(() => { kick(); }, [hover, kick]);

  const clampTarget = (v: number) => (lookRef.current.loop ? v : Math.min(countRef.current - 1, Math.max(0, v)));
  const goTo = useCallback((t: number) => {
    st.current.target = clampTarget(t);
    kick();
     
  }, [kick]);

  useImperativeHandle(ref, () => ({
    stepBy: (n: number) => {
      const s = st.current;
      const from = s.aim >= 0 ? s.aim : Math.round(s.target);
      const to = clampTarget(from + n);
      s.aim = to;
      goTo(to);
    },
    centerIndex: () => centerRef.current,
    scrollTo: (i: number) => {
      const s = st.current;
      const n = countRef.current;
      // Round a looping deck the short way.
      goTo(lookRef.current.loop ? s.target + cardOffset(i, s.target, n, true) : i);
    },
    hoverAt: (x, y = 0) => {
      if (x === null) { if (hoverRef.current !== -1) setHover(-1); return; }
      const inside = (el: Element) => { const r = el.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; };
      // The lit card keeps the light while the point is anywhere on it as drawn (it is lifted off its slot).
      const cur = els.current.get(hoverRef.current)?.el.firstElementChild;
      if (cur && inside(cur)) return;
      const hit = document.elementsFromPoint(x, y).find((n) => (n as HTMLElement).dataset?.slot !== undefined && root.current?.contains(n)) as HTMLElement | undefined;
      const i = hit ? Number(hit.dataset.slot) : -1;
      if (i !== hoverRef.current) setHover(i);
    },
    hoveredFace: () => {
      const e = els.current.get(hoverRef.current)?.el;
      const face = e?.firstElementChild as HTMLElement | null | undefined;
      return e && face ? { el: e, face } : null;
    },
   
  }), [goTo]);

  // ------------------------------------------------------------------ input (DOM, the tray only)
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let acc = 0;
    let lastWheel = 0;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      // Heard on the whole felt, as the band between the cards takes no pointer: only over the band, and off the buttons.
      const band = el.parentElement?.getBoundingClientRect();
      if (!band || e.clientX < band.left || e.clientX > band.right || e.clientY < band.top || e.clientY > band.bottom) return;
      if ((e.target as HTMLElement).closest?.('[data-ui], [role="listbox"], [role="dialog"], [role="menu"]')) return;
      e.preventDefault();
      const now = performance.now();
      if (now - lastWheel > 220) acc = 0;
      lastWheel = now;
      const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 600 : 1;
      acc += (Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX) * unit;
      if (Math.abs(acc) < 50) return;
      const dir = acc > 0 ? 1 : -1;
      acc = 0;
      const s = st.current;
      const from = s.aim >= 0 ? s.aim : Math.round(s.target);
      const to = clampTarget(from + dir * lookRef.current.wheel);
      s.aim = to;
      goTo(to);
    };
    let down: { x: number; y: number; pos: number; id: number; samples: { x: number; t: number }[]; moved: boolean } | null = null;
    const pxPerCard = () => Math.max(6, lookRef.current.swipe / Math.max(1, countRef.current - 1));
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const s = st.current;
      down = { x: e.clientX, y: e.clientY, pos: s.pos, id: e.pointerId, samples: [{ x: e.clientX, t: e.timeStamp }], moved: false };
    };
    const onMove = (e: PointerEvent) => {
      const mode = lookRef.current.scroll;
      if (mode === 'follow' && !down) {
        // The hand follows the pointer across its width: the left edge is the first card, the right the last.
        const r = el.getBoundingClientRect();
        const n = countRef.current;
        const f = Math.min(1, Math.max(0, (e.clientX - r.left - r.width * 0.08) / (r.width * 0.84)));
        st.current.aim = -1;
        goTo(f * (n - 1));
        return;
      }
      if (!down || e.pointerId !== down.id || mode !== 'drag') return;
      const dx = e.clientX - down.x;
      if (!down.moved && Math.abs(dx) < 5 && Math.abs(e.clientY - down.y) < 5) return;
      if (!down.moved) {
        down.moved = true;
        try { el.setPointerCapture(e.pointerId); } catch { /* gone */ }
        el.style.cursor = 'grabbing';
        st.current.dragging = true;
        st.current.aim = -1;
        setHover(-1);
        kick();
      }
      const n = countRef.current;
      let p = down.pos - dx / pxPerCard();
      if (!lookRef.current.loop) p = p < 0 ? p * 0.35 : p > n - 1 ? n - 1 + (p - n + 1) * 0.35 : p;
      st.current.pos = p;
      down.samples.push({ x: e.clientX, t: e.timeStamp });
      while (down.samples.length > 2 && e.timeStamp - down.samples[0].t > 90) down.samples.shift();
    };
    const onUp = (e: PointerEvent) => {
      if (!down || e.pointerId !== down.id) return;
      const d = down;
      down = null;
      el.style.cursor = '';
      const s = st.current;
      if (d.moved) {
        s.dragging = false;
        const a = d.samples[0], z = d.samples[d.samples.length - 1];
        const vx = (z.x - a.x) / Math.max(16, z.t - a.t); // px/ms
        const cardsPerSec = (-vx * 1000) / pxPerCard();
        s.vel = 0;
        goTo(Math.round(s.pos + cardsPerSec * 0.16 * lookRef.current.flick));
        return;
      }
      // A click: which card?
      const hit = (e.target as HTMLElement).closest?.('[data-slot]') as HTMLElement | null;
      if (!hit) return;
      const i = Number(hit.dataset.slot);
      // Click to take (owner, v0.47.8) or to view (v0.47.23): any card acts at once; otherwise only the settled centre card.
      if (lookRef.current.clickTake || lookRef.current.centreClick === 'view' || (i === centerRef.current && Math.abs(s.target - s.pos) < 0.3)) {
        const card = cardsRef.current[i];
        // From the card as it is drawn (lifted and zoomed when lit), so the copy leaves from right there.
        const face = (hit.firstElementChild as HTMLElement | null) ?? hit;
        if (card) cbs.current.onCentreClick(card, face.getBoundingClientRect(), { x: e.clientX, y: e.clientY });
        return;
      }
      const n = countRef.current;
      goTo(lookRef.current.loop ? s.target + cardOffset(i, s.target, n, true) : i);
    };
    const onContext = (e: MouseEvent) => { pointer.current = { x: e.clientX, y: e.clientY }; };
    const onCancel = () => { if (down?.moved) { st.current.dragging = false; goTo(Math.round(st.current.pos)); } down = null; el.style.cursor = ''; };
    const onOver = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY };
      if (down?.moved || takenRef.current || heldRef.current) return;
      const hit = (e.target as HTMLElement).closest?.('[data-slot]') as HTMLElement | null;
      setHover(hit ? Number(hit.dataset.slot) : -1);
    };
    const onLeave = () => {
      if (heldRef.current) return;
      setHover(-1);
      if (lookRef.current.scroll === 'follow' && !lookRef.current.loop) goTo(Math.round(st.current.target));
    };
    const wheelEl = el.closest<HTMLElement>('[data-table-root]') ?? el.parentElement ?? el;
    wheelEl.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
    el.addEventListener('pointerover', onOver);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('contextmenu', onContext);
    return () => {
      wheelEl.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
      el.removeEventListener('pointerover', onOver);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('contextmenu', onContext);
    };
     
  }, [goTo, kick]);
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  // A new order is drawn from where each card was: the frame loop eases them over.
  useEffect(() => { asked.current = -1; kick(); }, [cards, kick]);

  // Re-arranging owns the pointer and the keys until it ends; the wheel still turns the hand.
  useEffect(() => {
    if (!arranging) return;
    const move = (e: PointerEvent) => { pointer.current = { x: e.clientX, y: e.clientY }; kick(); };
    const press = (e: PointerEvent) => { e.preventDefault(); e.stopPropagation(); arrangeCbs.current.onArrangeEnd?.(e.button === 0); };
    const menu = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key !== 'Enter') return;
      e.preventDefault();
      e.stopPropagation();
      arrangeCbs.current.onArrangeEnd?.(e.key === 'Enter');
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerdown', press, true);
    window.addEventListener('contextmenu', menu, true);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerdown', press, true);
      window.removeEventListener('contextmenu', menu, true);
      window.removeEventListener('keydown', key, true);
    };
  }, [arranging, kick]);

  // The edge fade is a mask on the whole tray, so a card fades smoothly across its own width.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const f = look.edgeWidth;
    const mask = look.edge !== 'fade' || f <= 0 ? '' : `linear-gradient(to right, transparent 0, rgba(0,0,0,0.35) ${f / 2}%, #000 ${f}%, #000 ${100 - f}%, rgba(0,0,0,0.35) ${100 - f / 2}%, transparent 100%)`;
    el.style.setProperty('mask-image', mask);
    el.style.setProperty('-webkit-mask-image', mask);
  }, [look.edge, look.edgeWidth]);

  // Which cards are mounted: the visible reach plus a margin, round the loop when it loops.
  const reach = Math.ceil(visibleReach(look)) + 2;
  const mounted: number[] = [];
  if (count) {
    if (look.loop && count <= reach * 2 + 1) for (let i = 0; i < count; i++) mounted.push(i);
    else for (let o = -reach; o <= reach; o++) {
      const i = center + o;
      if (look.loop) mounted.push(mod(i));
      else if (i >= 0 && i < count) mounted.push(i);
    }
  }
  const hiReach = Math.max(1, Math.ceil((look.centre - 1) / 2) + 1);
  const fit = fitSize(look, box.h);
  const base = fit / FORGED_W;
  const cardH = FORGED_H * base;
  const glowY = cardH / 2 + 14 + look.rowY * Math.max(0, box.h - cardH - 28);
  // The glow stays inside the hand's area and fades out before its edges, so it never shows a cut (owner, v0.47.7).
  const glowW = Math.min(fit * 2.2, box.w), glowH = Math.min(cardH * 1.6, box.h);
  const glowTop = Math.min(box.h - glowH, Math.max(0, glowY - glowH / 2));

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => {
      size.current = { w: el.clientWidth, h: el.clientHeight };
      setBox(size.current);
      for (const rec of els.current.values()) rec.last = '';
      kick();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [kick]);

  return (
    // Only the cards themselves take the pointer (owner, v0.47.17: a press beside them scrolled the hand); between them
    // it is the felt, where a die can be picked up or a box drawn. The wheel still turns the hand anywhere over it.
    <div ref={root} style={{ position: 'absolute', inset: 0, overflowX: 'clip', overflowY: 'visible', perspective: look.turn > 0 ? look.perspective : undefined, touchAction: 'none', userSelect: 'none', pointerEvents: 'none' }}>
      {look.glow > 0 ? (
        <div style={{ position: 'absolute', pointerEvents: 'none', left: box.w / 2 - glowW / 2, top: glowTop, width: glowW, height: glowH, opacity: look.glow, background: 'radial-gradient(closest-side, rgba(224,181,99,0.55), rgba(200,146,58,0.18) 55%, transparent 96%)' }} />
      ) : null}
      {[0, 1].map((k) => (
        <div key={`end${k}`} ref={(el) => { dots.current[k] = el; }} aria-hidden="true"
          style={{ position: 'absolute', left: 0, top: 0, width: 7, height: 7, borderRadius: '50%', background: '#E0B563', boxShadow: '0 0 8px rgba(224,181,99,0.65)', pointerEvents: 'none', visibility: 'hidden', zIndex: 0 }} />
      ))}
      {mounted.map((i) => {
        const card = cards[i];
        if (!card) return null;
        const off = Math.abs(cardOffset(i, center, count, look.loop));
        return <Slot key={card.id} card={card} index={i} hiRes={look.sharp || off <= hiReach || hover === i || card.id === arranging} hovered={!takenId && !arranging && hover === i} taken={card.id === takenId} lifted={card.id === arranging} look={look} register={register} />;
      })}
    </div>
  );
});
