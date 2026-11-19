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
import { cardOffset, type DeckLook, lookScale, lookX, pastSpot, visibleReach } from './deck-look';

export interface TableCard {
  id: string;
  thumb?: number | { uri: string };
  source?: number | { uri: string };
  custom?: ReactNode;
  faces?: { thumb?: number | { uri: string }; source?: number | { uri: string }; custom?: ReactNode }[];
  /** Drawn over the card (the equipped corner, tokens, a struck trait). */
  overlay?: ReactNode;
}

export interface DeskCarouselHandle {
  stepBy: (n: number) => void;
  centerIndex: () => number;
  scrollTo: (i: number) => void;
}

/** A card's face, at thumbnail or full resolution. */
export function CardFace({ card, hiRes, face = 0 }: { card: TableCard; hiRes: boolean; face?: number }) {
  const f = card.faces?.length ? card.faces[face % card.faces.length] : card;
  if (f.custom) return <>{f.custom}</>;
  return (
    <>
      {f.thumb != null ? <ArtImage source={f.thumb} fit="contain" recyclingKey={`${card.id}-lod`} /> : null}
      {hiRes && f.source != null ? <View style={StyleSheet.absoluteFill}><ArtImage source={f.source} fit="contain" recyclingKey={card.id} /></View> : null}
    </>
  );
}

const Slot = memo(function Slot({ card, index, hiRes, hovered, look, register }: { card: TableCard; index: number; hiRes: boolean; hovered: boolean; look: DeckLook; register: (i: number, el: HTMLElement | null, veil: HTMLElement | null) => void }) {
  const outer = useRef<HTMLDivElement>(null);
  const veil = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    register(index, outer.current, veil.current);
    return () => register(index, null, null);
  }, [index, register]);
  return (
    <div ref={outer} data-card-id={card.id} data-slot={index} style={{ position: 'absolute', left: 0, top: 0, width: FORGED_W, height: FORGED_H, cursor: 'pointer', visibility: 'hidden', willChange: 'transform' }}>
      <div
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          transform: hovered ? `translateY(${-look.hoverLift}px) scale(${look.hoverZoom})` : 'none',
          transition: 'transform 170ms cubic-bezier(0.16,1,0.3,1)',
          boxShadow: look.shadow > 0 ? `0 ${10 * look.shadow}px ${28 * look.shadow}px rgba(0,0,0,${0.55 * look.shadow})` : 'none',
        }}>
        <CardFace card={card} hiRes={hiRes} />
        {card.overlay ? <View style={StyleSheet.absoluteFill}>{card.overlay}</View> : null}
        <div ref={veil} style={{ position: 'absolute', inset: 0, background: '#06080d', opacity: 0 }} />
      </div>
    </div>
  );
});

export const DeskCarousel = forwardRef<DeskCarouselHandle, {
  cards: TableCard[];
  look: DeckLook;
  initialIndex: number;
  /** Each time a new card reaches the centre. */
  onCentre: (i: number) => void;
  /** The centre card was clicked: where it is on screen and where the pointer is. */
  onCentreClick: (card: TableCard, rect: DOMRect, pointer: { x: number; y: number }) => void;
}>(function DeskCarousel({ cards, look, initialIndex, onCentre, onCentreClick }, ref) {
  const count = cards.length;
  const root = useRef<HTMLDivElement>(null);
  const size = useRef({ w: 0, h: 0 });
  const [box, setBox] = useState({ w: 0, h: 0 });
  const st = useRef({ pos: initialIndex, target: initialIndex, vel: 0, dragging: false, aim: -1 });
  const els = useRef(new Map<number, { el: HTMLElement; veil: HTMLElement | null; last: string }>());
  const lookRef = useRef(look);
  lookRef.current = look;
  const countRef = useRef(count);
  countRef.current = count;
  const mod = (i: number) => ((i % count) + count) % count;
  const [center, setCenter] = useState(() => Math.min(count - 1, Math.max(0, initialIndex)));
  const centerRef = useRef(center);
  const [hover, setHover] = useState(-1);
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
    const base = l.size / FORGED_W;
    const cardH = FORGED_H * base;
    const cy = cardH / 2 + 14 + l.rowY * Math.max(0, H - cardH - 28);
    const reach = visibleReach(l);
    const band = (l.edgeWidth / 100) * W;
    const since = performance.now() - born.current;
    for (const [i, rec] of els.current) {
      const d = cardOffset(i, s.pos, n, l.loop);
      const ad = Math.abs(d);
      const sg = d < 0 ? -1 : 1;
      const k = pastSpot(ad, l);
      const out = Math.max(0, ad - reach); // past the last place: leaving
      let scale = lookScale(ad, l) * base;
      let x = sg * lookX(ad, l, l.size);
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
      const z = l.stack === 'centre' ? 1000 - Math.round(ad * 10) : l.stack === 'left' ? 1000 - Math.round(d * 10) : 1000 + Math.round(d * 10);
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
    if (s.dragging || s.pos !== s.target || s.vel !== 0 || entering) raf.current = requestAnimationFrame(tick);
  }, [draw]);

  const kick = useCallback(() => {
    if (raf.current) return;
    lastT.current = performance.now();
    raf.current = requestAnimationFrame(tick);
  }, [tick]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  // A new look re-draws every card (the per-card cache keys on the output, so nothing else is needed).
  useEffect(() => { kick(); }, [look, kick]);

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
   
  }), [goTo]);

  // ------------------------------------------------------------------ input (DOM, the tray only)
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let acc = 0;
    let lastWheel = 0;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return;
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
      if (i === centerRef.current && Math.abs(s.target - s.pos) < 0.3) {
        const card = cardsRef.current[i];
        if (card) cbs.current.onCentreClick(card, hit.getBoundingClientRect(), { x: e.clientX, y: e.clientY });
        return;
      }
      const n = countRef.current;
      goTo(lookRef.current.loop ? s.target + cardOffset(i, s.target, n, true) : i);
    };
    const onCancel = () => { if (down?.moved) { st.current.dragging = false; goTo(Math.round(st.current.pos)); } down = null; el.style.cursor = ''; };
    const onOver = (e: PointerEvent) => {
      if (down?.moved) return;
      const hit = (e.target as HTMLElement).closest?.('[data-slot]') as HTMLElement | null;
      setHover(hit ? Number(hit.dataset.slot) : -1);
    };
    const onLeave = () => {
      setHover(-1);
      if (lookRef.current.scroll === 'follow' && !lookRef.current.loop) goTo(Math.round(st.current.target));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
    el.addEventListener('pointerover', onOver);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
      el.removeEventListener('pointerover', onOver);
      el.removeEventListener('pointerleave', onLeave);
    };
     
  }, [goTo, kick]);
  const cardsRef = useRef(cards);
  cardsRef.current = cards;

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
  const base = look.size / FORGED_W;
  const cardH = FORGED_H * base;
  const glowY = cardH / 2 + 14 + look.rowY * Math.max(0, box.h - cardH - 28);

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
    <div ref={root} style={{ position: 'absolute', inset: 0, overflow: 'hidden', perspective: look.turn > 0 ? look.perspective : undefined, touchAction: 'none', userSelect: 'none' }}>
      {look.glow > 0 ? (
        <div style={{ position: 'absolute', pointerEvents: 'none', left: box.w / 2 - look.size * 1.1, top: glowY - cardH * 0.8, width: look.size * 2.2, height: cardH * 1.6, opacity: look.glow, background: 'radial-gradient(closest-side, rgba(224,181,99,0.55), rgba(200,146,58,0.18) 55%, transparent)' }} />
      ) : null}
      {mounted.map((i) => {
        const card = cards[i];
        if (!card) return null;
        const off = Math.abs(cardOffset(i, center, count, look.loop));
        return <Slot key={card.id} card={card} index={i} hiRes={off <= hiReach || hover === i} hovered={hover === i} look={look} register={register} />;
      })}
    </div>
  );
});
