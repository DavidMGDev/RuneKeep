/**
 * The dice on the desktop table (v0.47.0; v0.47.1 owner round two).
 *
 * - The category die carries every deck's icon (a d6 at least, up to a d20). A click opens the decks beside it; the
 *   wheel walks them and the die shows the new deck at once. A right click rolls it, and the deck it lands on opens.
 * - Roll, State, Cards and Sort are control dice with their glyph on every face; a click uses one, a right click
 *   just rolls it. They can be plain buttons instead, or hidden (the table's right-click menu always has them).
 * - Rolls are real dice thrown across the table; the face that comes to rest on top is the result.
 * - Tokens on cards laid on the table are pieces too: token dice and chips, back on their card with Send home.
 *
 * Dice keep their own hit test (the engine's), checked before anything else, so a die is never confused with a
 * card under it. Where the control dice were left is remembered in this browser.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';

import { Display } from '@/constants/theme';
import { DIE_COLOR, DIE_INK, type DieType, FEAR_INK, FEAR_PURPLE, HOPE_GOLD, HOPE_INK } from '../components/card-tokens-data';
import type { PoolDie } from '@/lib/dice-pool';
import { playSfx, playSynth } from '@/lib/sfx';
import type { CardCategory } from '../card-data';
import { CategoryGlyph } from '../sheet/deck-toggle-icon';
import type { DiceEngine, DieSpec, Finish, Shape, Walls } from './dice-engine';
import type { Bounds, Impact, Obstacle } from './dice-physics';
import { loadDicePlaces, saveDicePlaces } from './table-store';
import { Glyph, DIE_GLYPHS, glyphImage, type GlyphKey, T, TButton, tinted } from './table-ui';

export type ActionKey = 'roll' | 'state' | 'cards' | 'sort';
export interface TableAction { key: ActionKey; label: string; onPress: () => void; disabled?: boolean }
export interface TableDeck { key: CardCategory; label: string; count: number; meta?: { icon?: string; builtin: boolean } }

/** A token from a card on the table, as a piece: where it sits on its card now, and what it is. */
export interface TokenPiece {
  key: string;
  home: { x: number; y: number };
  kind: 'die' | 'chip';
  dieType?: DieType;
  value?: number;
  value2?: number;
  color?: string;
  scale: number;
}

export interface TableDiceHandle {
  /** Throw these dice from (x, y); resolves with the faces that came to rest on top. */
  roll: (dice: PoolDie[], from: { x: number; y: number }) => Promise<PoolDie[]>;
  clearRoll: () => void;
  /** Send every control die home and every token back onto its card. */
  resetHome: () => void;
  /** Open the deck picker at a point (the table's right-click menu). */
  openDecks: (at: { x: number; y: number }) => void;
  hasRoll: () => boolean;
}

const CAT = 'cat';
const ACTION_SIZE = 58;
const ACTIONS: ActionKey[] = ['roll', 'state', 'cards', 'sort'];
const GLYPH: Record<ActionKey, GlyphKey> = { roll: 'roll', state: 'state', cards: 'cards', sort: 'sort' };
const ROLL_SIZE: Record<string, number> = { d4: 62, d6: 54, d8: 58, d10: 58, d12: 62, d20: 68, d100: 56, duality: 64 };
const TOKEN_DIE_SIZE = 46;
const FACES_OF: Record<Shape, number> = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20 };

/** The category die's solid for a number of decks: a d6 at the least (owner: a d4 looked poor). */
export function catShape(n: number): Shape {
  return n <= 6 ? 'd6' : n <= 8 ? 'd8' : n <= 12 ? 'd12' : 'd20';
}

/** How a control die of each finish is coloured. */
const CONTROL: Record<'obsidian' | 'gilded' | 'ivory', { body: string; edge: string; ink: string }> = {
  obsidian: { body: '#0e1117', edge: '#C8923A', ink: '#E0B563' },
  gilded: { body: '#B98734', edge: '#E0B563', ink: '#1a1206' },
  ivory: { body: '#EAE0C8', edge: '#8A6B33', ink: '#5f4519' },
};

/** A rolling die's colours for a finish: resin and metal wear the die's own colour, stone engraves it. */
function numberColours(finish: Finish, type: DieType, side?: 'hope' | 'fear'): { body: string; edge: string; ink: string } {
  const own = side === 'hope' ? HOPE_GOLD : side === 'fear' ? FEAR_PURPLE : DIE_COLOR[type];
  if (finish === 'stone') return { body: side === 'fear' ? '#1d1622' : '#25282e', edge: '#33373f', ink: side === 'fear' ? '#B48CE0' : own };
  if (finish === 'metal') return { body: own, edge: own, ink: side === 'fear' ? FEAR_INK : '#15110b' };
  const ink = side === 'hope' ? HOPE_INK : side === 'fear' ? FEAR_INK : DIE_INK[type] ?? '#FAF8F2';
  return { body: own, edge: own, ink };
}

/** Where each control die lives, in the open part of the table: the decks low on the left, clear of the corner buttons. */
function homes(b: Bounds): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = { [CAT]: { x: b.left + 128, y: b.bottom - 74 } };
  ACTIONS.forEach((k, i) => { out[k] = { x: b.left + 52 + i * 96, y: b.top + 54 }; });
  return out;
}

export const TableDice = forwardRef<TableDiceHandle, {
  host: HTMLElement | null;
  width: number;
  height: number;
  /** Where dice may go. */
  bounds: Bounds;
  /** The open part of the table, where the control dice live. */
  homeArea: Bounds;
  obstacles: Obstacle[];
  walls: { kind: Walls; rect: Bounds; thickness: number };
  decks: TableDeck[];
  current: CardCategory;
  onPickDeck: (c: CardCategory) => void;
  actions: TableAction[];
  controls: 'dice' | 'buttons' | 'hidden';
  controlFinish: 'obsidian' | 'gilded' | 'ivory';
  numberFinish: 'resin' | 'stone' | 'metal';
  tokens: TokenPiece[];
  /** A token die came to rest after a right-click roll: its new values. */
  onTokenRolled: (key: string, value: number, value2?: number) => void;
  /** A die from the last roll was rolled again: its new value. */
  onRerolled: (poolId: string, value: number) => void;
  /** A held piece was let go over this point (screen px); return true when that drop is handled (and it is removed). */
  onDropPiece: (key: string, clientX: number, clientY: number) => boolean;
  /** A piece is being dragged over this point (screen px). */
  onDragPiece: (key: string, clientX: number, clientY: number) => void;
  /** Right click on the table where there is no die. */
  onTableMenu: (clientX: number, clientY: number) => void;
  /** A panel is open: the dice stay where they are and take no clicks. */
  inert: boolean;
}>(function TableDice(props, ref) {
  const { host, width, height, bounds, obstacles, walls, decks, current, onPickDeck, actions, controls, controlFinish, numberFinish, tokens, inert } = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [engine, setEngine] = useState<DiceEngine | null>(null);
  const [failed, setFailed] = useState(false);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [ring, setRing] = useState<{ x: number; y: number } | null>(null);
  const labels = useRef(new Map<string, HTMLElement>());
  const glyphHost = useRef<HTMLDivElement>(null);
  const [deckArt, setDeckArt] = useState<Map<string, HTMLImageElement> | null>(null);
  const live = useRef(props);
  live.current = props;
  const homeRef = useRef(props.homeArea);
  homeRef.current = props.homeArea;
  const pending = useRef<{ keys: Set<string>; done: () => void } | null>(null);
  /** Dice rolled in place by a right click, and what to do when each lands. */
  const rolling = useRef(new Map<string, () => void>());
  /** The dice the last roll threw, and which pool die each belongs to. */
  const rolled = useRef(new Map<string, PoolDie>());
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;
  const size = useRef({ width, height });
  size.current = { width, height };

  // ---------------------------------------------------------------- the engine (loaded on first use)
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let dead = false;
    let eng: DiceEngine | null = null;
    import('./dice-engine')
      .then(async (m) => {
        try { await document.fonts.load(`40px ${Display.black}`); } catch { /* numbers fall back to the system face */ }
        return m.createDiceEngine(el, { modelUrl: '/models/dice.glb', font: Display.black });
      })
      .then((e) => {
        if (dead) { e.dispose(); return; }
        eng = e;
        e.onImpact((hit: Impact) => { void import('./dice-engine').then((m) => m.knock(playSynth, hit)); });
        setEngine(e);
      })
      .catch(() => { if (!dead) setFailed(true); });
    return () => { dead = true; eng?.dispose(); };
  }, []);

  useEffect(() => { engine?.resize(width, height); }, [engine, width, height]);
  const boundsKey = JSON.stringify(bounds);
  useEffect(() => { engine?.setBounds(bounds); }, [engine, boundsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const obstacleKey = JSON.stringify(obstacles);
  useEffect(() => {
    if (!engine) return;
    engine.setObstacles(obstacles);
    // A control die left where the hand's area now lies (the layout changed) goes home instead of sticking in it.
    const h = homes(homeRef.current);
    for (const k of [CAT, ...ACTIONS]) {
      const st = engine.state(k);
      if (st && h[k] && obstacles.some((o) => st.x > o.left && st.x < o.right && st.y > o.top && st.y < o.bottom)) engine.home(k, h[k].x, h[k].y, k === CAT ? undefined : 0);
    }
  }, [engine, obstacleKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const wallKey = JSON.stringify(walls);
  useEffect(() => { engine?.setWalls(walls.kind, walls.rect, walls.thickness); }, [engine, wallKey, width, height]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rests: a roll resolves, a right-click roll acts, and where control dice lie is remembered.
  useEffect(() => {
    if (!engine) return;
    engine.onRest((keys) => {
      const p = pending.current;
      if (p) {
        for (const k of keys) p.keys.delete(k);
        if (p.keys.size === 0) { pending.current = null; p.done(); }
      }
      for (const k of keys) {
        const act = rolling.current.get(k);
        if (act) { rolling.current.delete(k); act(); }
      }
      const places = loadDicePlaces();
      let changed = false;
      for (const k of keys) {
        if (k !== CAT && !ACTIONS.includes(k as ActionKey)) continue;
        const s = engine.state(k);
        if (!s) continue;
        places[k] = { fx: s.x / size.current.width, fy: s.y / size.current.height };
        changed = true;
      }
      if (changed) saveDicePlaces(places);
    });
  }, [engine]);

  // ---------------------------------------------------------------- the deck icons, as pictures for the die
  const deckKey = decks.map((d) => `${d.key}:${d.meta?.icon ?? ''}`).join('|');
  useEffect(() => {
    const el = glyphHost.current;
    if (!el) return;
    let dead = false;
    const id = requestAnimationFrame(() => {
      const jobs = [...el.querySelectorAll<HTMLElement>('[data-deck]')].map(async (node) => {
        const svg = node.querySelector('svg');
        if (!svg) return null;
        const clone = svg.cloneNode(true) as SVGSVGElement;
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        clone.setAttribute('width', '160');
        clone.setAttribute('height', '160');
        const img = new Image();
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
        await img.decode().catch(() => {});
        return [node.dataset.deck!, img] as const;
      });
      void Promise.all(jobs).then((pairs) => { if (!dead) setDeckArt(new Map(pairs.filter(Boolean) as [string, HTMLImageElement][])); });
    });
    return () => { dead = true; cancelAnimationFrame(id); };
  }, [deckKey]);

  const [glyphs, setGlyphs] = useState<Map<GlyphKey, HTMLImageElement> | null>(null);
  useEffect(() => {
    let dead = false;
    void Promise.all(ACTIONS.map(async (k) => [GLYPH[k], await glyphImage(GLYPH[k], '#ffffff')] as const)).then((pairs) => { if (!dead) setGlyphs(new Map(pairs)); });
    return () => { dead = true; };
  }, []);

  const placeOf = useCallback((key: string) => {
    const p = loadDicePlaces()[key];
    const b = boundsRef.current;
    const { width: W, height: H } = size.current;
    if (p && Number.isFinite(p.fx) && Number.isFinite(p.fy)) return { x: Math.min(b.right - 30, Math.max(b.left + 30, p.fx * W)), y: Math.min(b.bottom - 30, Math.max(b.top + 30, p.fy * H)) };
    return homes(homeRef.current)[key] ?? { x: W / 2, y: H / 2 };
  }, []);

  // ---------------------------------------------------------------- control dice
  const showDice = controls === 'dice';
  const style = CONTROL[controlFinish];
  useEffect(() => {
    if (!engine || !glyphs || width < 50) return;
    for (const k of ACTIONS) {
      if (!showDice) { engine.remove(k); continue; }
      const img = glyphs.get(GLYPH[k]);
      if (!img) continue;
      // The icon on the top face and the one opposite it only (owner); the sides stay plain, and the die always
      // comes to rest on one of the two, so its icon is always showing.
      const icon = { image: tinted(img, style.ink) };
      const spec: DieSpec = { key: k, shape: 'd6', size: ACTION_SIZE, body: style.body, edge: style.edge, ink: style.ink, faces: [icon, icon, { text: '' }, { text: '' }, { text: '' }, { text: '' }], finish: controlFinish, upright: true, restFaces: [0, 1] };
      const at = placeOf(k);
      engine.add(spec, at.x, at.y, { face: 0 });
    }
  }, [engine, glyphs, showDice, controlFinish, width > 50]); // eslint-disable-line react-hooks/exhaustive-deps

  const deckFace = useMemo(() => {
    const n = FACES_OF[catShape(decks.length)];
    const faces = Array.from({ length: n }, (_, i) => decks[i % Math.max(1, decks.length)]);
    return { n, faces, indexOf: (c: CardCategory) => Math.max(0, faces.findIndex((d) => d?.key === c)) };
  }, [decks]);

  useEffect(() => {
    if (!engine || !deckArt || !decks.length || width < 50) return;
    if (!showDice) { engine.remove(CAT); return; }
    const shape = catShape(decks.length);
    const spec: DieSpec = {
      key: CAT, shape, size: shape === 'd20' ? 112 : shape === 'd12' ? 100 : shape === 'd8' ? 94 : 84, body: style.body, edge: style.edge, ink: style.ink, finish: controlFinish, upright: true,
      faces: deckFace.faces.map((d) => (d && deckArt.get(d.key) ? { image: tinted(deckArt.get(d.key)!, style.ink) } : { text: '' })),
    };
    const fresh = !engine.has(CAT);
    const at = placeOf(CAT);
    engine.add(spec, at.x, at.y, { face: deckFace.indexOf(live.current.current) });
    if (!fresh) engine.setFace(CAT, deckFace.indexOf(live.current.current));
  }, [engine, deckArt, deckFace, showDice, controlFinish, width > 50]); // eslint-disable-line react-hooks/exhaustive-deps

  // The deck changed (a pick, the wheel, a key): the die shows it at once, no roll first (owner).
  useEffect(() => {
    if (!engine?.has(CAT)) return;
    if (rolling.current.has(CAT) || deckFace.faces[engine.state(CAT)?.top ?? -1]?.key === current) return;
    engine.setFace(CAT, deckFace.indexOf(current));
  }, [engine, current, deckFace]);

  // ---------------------------------------------------------------- token pieces
  const tokenKey = tokens.map((t) => `${t.key}:${t.kind}:${t.dieType ?? ''}:${t.color ?? ''}`).join('|');
  useEffect(() => {
    if (!engine) return;
    const want = new Set<string>();
    for (const t of tokens) {
      for (const spec of tokenSpecs(t, numberFinish)) {
        want.add(spec.spec.key);
        if (!engine.has(spec.spec.key)) engine.add(spec.spec, t.home.x + spec.dx, t.home.y, { face: spec.face, pop: true });
      }
    }
    for (const k of engine.keys()) if (k.startsWith('tok:') && !want.has(k)) engine.remove(k);
  }, [engine, tokenKey, numberFinish]); // eslint-disable-line react-hooks/exhaustive-deps
  // A new finish rebuilds the pieces in place.
  useEffect(() => {
    if (!engine) return;
    for (const t of live.current.tokens) for (const s of tokenSpecs(t, numberFinish)) if (engine.has(s.spec.key)) engine.add(s.spec, 0, 0);
    for (const [k, d] of rolled.current) for (const s of rollSpecs(d, numberFinish)) if (s.key === k && engine.has(k)) engine.add(s, 0, 0);
  }, [engine, numberFinish]);

  // Labels ride under their dice. One stable ref callback per die, so a re-render never detaches a label.
  const labelRefs = useRef(new Map<string, (el: HTMLElement | null) => void>());
  const engineRef = useRef(engine);
  engineRef.current = engine;
  const setLabel = (key: string) => {
    let fn = labelRefs.current.get(key);
    if (!fn) {
      fn = (el: HTMLElement | null) => {
        if (el) labels.current.set(key, el); else labels.current.delete(key);
        engineRef.current?.label(key, el);
      };
      labelRefs.current.set(key, fn);
    }
    return fn;
  };
  useEffect(() => {
    if (!engine) return;
    for (const [k, el] of labels.current) engine.label(k, el);
  }, [engine, glyphs, deckArt, showDice, controlFinish]);

  // ---------------------------------------------------------------- right click: roll it where it lies
  const rollInPlace = useCallback((key: string) => {
    const e = engineRef.current;
    if (!e) return;
    playSfx('gearScroll1', { volume: 0.3 });
    e.rollInPlace(key);
    const p = live.current;
    if (key === CAT) {
      rolling.current.set(CAT, () => {
        const top = e.state(CAT)?.top ?? 0;
        const deck = deckFace.faces[top];
        if (deck && deck.key !== p.current) p.onPickDeck(deck.key);
      });
      return;
    }
    if (key.startsWith('tok:')) {
      const base = key.replace(/:(h|f|t|u)$/, '');
      const piece = p.tokens.find((t) => t.key === base);
      if (!piece || piece.kind !== 'die') return;
      const parts = tokenSpecs(piece, numberFinish).map((s) => s.spec.key);
      for (const k of parts) if (k !== key) e.rollInPlace(k);
      let left = parts.length;
      for (const k of parts) {
        rolling.current.set(k, () => {
          if (--left > 0) return;
          const tops = parts.map((x) => e.state(x)?.top ?? 0);
          if (piece.dieType === 'duality') live.current.onTokenRolled(base, tops[0] + 1, tops[1] + 1);
          else if (piece.dieType === 'd100') { const v = tops[0] * 10 + tops[1]; live.current.onTokenRolled(base, v === 0 ? 100 : v); }
          else live.current.onTokenRolled(base, tops[0] + 1);
        });
      }
      return;
    }
    const die = rolled.current.get(key);
    if (die) {
      const parts = rollSpecs(die, numberFinish).map((s) => s.key);
      for (const k of parts) if (k !== key) e.rollInPlace(k);
      let left = parts.length;
      for (const k of parts) {
        rolling.current.set(k, () => {
          if (--left > 0) return;
          live.current.onRerolled(die.id, valueOf(die, parts.map((x) => e.state(x)?.top ?? 0)));
        });
      }
    }
    // A control die just rolls: nothing happens when it lands (owner).
  }, [deckFace, numberFinish]);

  // ---------------------------------------------------------------- the pointer: dice first, then whatever is under
  const inertRef = useRef(inert);
  inertRef.current = inert;
  useEffect(() => {
    if (!host || !engine) return;
    let press: { key: string; x: number; y: number; t: number; moved: boolean; id: number } | null = null;
    let swallowMenu = false;
    const local = (e: { clientX: number; clientY: number }) => {
      const r = host.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onDown = (e: PointerEvent) => {
      if (inertRef.current) return;
      const p = local(e);
      const key = engine.hit(p.x, p.y);
      if (!key) return;
      e.stopPropagation();
      e.preventDefault();
      if (e.button === 2) { swallowMenu = true; rollInPlace(key); return; }
      if (e.button !== 0) return;
      try { host.setPointerCapture(e.pointerId); } catch { /* gone */ }
      press = { key, x: e.clientX, y: e.clientY, t: performance.now(), moved: false, id: e.pointerId };
      engine.grab(key, p.x, p.y);
      host.style.cursor = 'grabbing';
      playSfx('placeToken', { volume: 0.35, cents: 300 });
    };
    const onMove = (e: PointerEvent) => {
      const p = local(e);
      if (press && e.pointerId === press.id) {
        if (!press.moved && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 5) press.moved = true;
        engine.drag(p.x, p.y);
        if (press.key.startsWith('tok:')) live.current.onDragPiece(press.key, e.clientX, e.clientY);
        return;
      }
      if (inertRef.current) return;
      const key = engine.hit(p.x, p.y);
      engine.hover(key);
      setHoverKey(key);
      host.style.cursor = key ? 'grab' : '';
    };
    const onUp = (e: PointerEvent) => {
      if (!press || e.pointerId !== press.id) return;
      const pr = press;
      press = null;
      host.style.cursor = 'grab';
      if (pr.moved && live.current.onDropPiece(pr.key, e.clientX, e.clientY)) { engine.release(); return; }
      const speed = engine.release();
      if (!pr.moved && performance.now() - pr.t < 450) {
        if (pr.key === CAT) {
          const s = engine.state(CAT);
          if (s) { playSfx('floatMenuOpen'); setRing({ x: s.x, y: s.y }); }
        } else {
          const a = live.current.actions.find((x) => x.key === pr.key);
          if (a && !a.disabled) a.onPress();
        }
      } else if (speed > 900) {
        playSfx('gearScroll1', { volume: 0.25 });
      }
    };
    const onLeave = () => { if (!press) { engine.hover(null); setHoverKey(null); } };
    // A right click on the table, away from any die and any card, opens the table's menu.
    const onMenu = (e: MouseEvent) => {
      e.preventDefault();
      if (swallowMenu) { swallowMenu = false; return; }
      if (inertRef.current) return;
      if ((e.target as HTMLElement).closest?.('[data-card-id], [data-board-card], [role="menu"], [role="dialog"]')) return;
      live.current.onTableMenu(e.clientX, e.clientY);
    };
    // A wheel over the category die walks the decks.
    let wheelAcc = 0;
    const onWheel = (e: WheelEvent) => {
      if (inertRef.current) return;
      const p = local(e);
      if (engine.hit(p.x, p.y) !== CAT) return;
      e.preventDefault();
      e.stopPropagation();
      wheelAcc += e.deltaY;
      if (Math.abs(wheelAcc) < 60) return;
      const dir = wheelAcc > 0 ? 1 : -1;
      wheelAcc = 0;
      const list = live.current.decks;
      const i = list.findIndex((d) => d.key === live.current.current);
      const next = list[(i + dir + list.length) % list.length];
      if (next) live.current.onPickDeck(next.key);
    };
    host.addEventListener('pointerdown', onDown, true);
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerup', onUp);
    host.addEventListener('pointercancel', onUp);
    host.addEventListener('pointerleave', onLeave);
    host.addEventListener('contextmenu', onMenu);
    host.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => {
      host.removeEventListener('pointerdown', onDown, true);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerup', onUp);
      host.removeEventListener('pointercancel', onUp);
      host.removeEventListener('pointerleave', onLeave);
      host.removeEventListener('contextmenu', onMenu);
      host.removeEventListener('wheel', onWheel, { capture: true });
    };
  }, [host, engine, rollInPlace]);

  // ---------------------------------------------------------------- rolls and reset
  useImperativeHandle(ref, () => ({
    roll: (dice, from) => new Promise<PoolDie[]>((resolve) => {
      if (!engine) { resolve(dice.map((d) => ({ ...d, value: 1 + Math.floor(Math.random() * (d.type === 'd100' ? 100 : d.type === 'duality' ? 12 : FACES_OF[d.type as Shape])) }))); return; }
      clear(engine);
      const keys = new Set<string>();
      const b = boundsRef.current;
      const thrown: { die: PoolDie; keys: string[] }[] = [];
      dice.forEach((d, i) => {
        const specs = rollSpecs(d, live.current.numberFinish);
        thrown.push({ die: d, keys: specs.map((s) => s.key) });
        specs.forEach((spec, j) => {
          const spread = Math.min(b.right - b.left - 160, 60 + dice.length * 34);
          const x = Math.min(b.right - 50, Math.max(b.left + 50, from.x + (((i + j * 0.5) / Math.max(1, dice.length - 1)) - 0.5) * spread));
          engine.add(spec, x, from.y, { random: true });
          rolled.current.set(spec.key, d);
          const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.1;
          const sp = 650 + Math.random() * 550;
          engine.toss(spec.key, Math.cos(ang) * sp, Math.sin(ang) * sp);
          keys.add(spec.key);
        });
      });
      playSfx('gearScroll1', { volume: 0.35 });
      const finish = () => {
        clearTimeout(guard);
        resolve(thrown.map(({ die, keys: ks }) => ({ ...die, value: valueOf(die, ks.map((k) => engine.state(k)?.top ?? 0)) })));
      };
      // A die held in someone's hand never lands: after a while the roll reads what is on top regardless.
      const guard = setTimeout(() => { if (pending.current?.done === finish) pending.current = null; finish(); }, 9000);
      pending.current = { keys, done: finish };
    }),
    clearRoll: () => { if (engine) clear(engine); },
    resetHome: () => {
      if (!engine) return;
      saveDicePlaces({});
      const h = homes(homeRef.current);
      for (const k of Object.keys(h)) if (engine.has(k)) engine.home(k, h[k].x, h[k].y, k === CAT ? deckFace.indexOf(live.current.current) : 0);
      for (const t of live.current.tokens) for (const s of tokenSpecs(t, live.current.numberFinish)) if (engine.has(s.spec.key)) engine.home(s.spec.key, t.home.x + s.dx, t.home.y);
      playSfx('gearScroll2', { volume: 0.45 });
    },
    openDecks: (at) => { playSfx('floatMenuOpen'); setRing(at); },
    hasRoll: () => rolled.current.size > 0,
  }), [engine, deckFace]);
  const clear = (e: DiceEngine) => {
    for (const k of rolled.current.keys()) e.remove(k);
    rolled.current.clear();
  };

  const currentDeck = decks.find((d) => d.key === current);
  const ready = !!engine && !!glyphs;

  return (
    <>
      <canvas ref={canvas} style={{ position: 'absolute', left: 0, top: 0, width, height, pointerEvents: 'none', zIndex: 20 }} />
      {/* Labels under the control dice; each is also that die's keyboard handle (Tab, then Enter). */}
      {ready && showDice ? actions.map((a) => (
        <button key={a.key} type="button" className="rk-die-label" ref={setLabel(a.key)} disabled={a.disabled} aria-label={a.label} onClick={() => { if (!a.disabled) a.onPress(); }} style={{ ...labelStyle, color: hoverKey === a.key ? T.ivory : a.disabled ? 'rgba(147,142,136,0.5)' : T.muted }}>{a.label}</button>
      )) : null}
      {ready && deckArt && showDice ? (
        <button type="button" className="rk-die-label" ref={setLabel(CAT)} aria-label={`Decks. ${currentDeck?.label ?? ''}, ${currentDeck?.count ?? 0} cards. Choose a deck`} aria-haspopup="listbox"
          onClick={() => { const s = engine?.state(CAT); playSfx('floatMenuOpen'); setRing(s ? { x: s.x, y: s.y } : { x: 74, y: height - 88 }); }}
          style={{ ...labelStyle, color: hoverKey === CAT ? T.ivory : T.goldText }}>{currentDeck?.label ?? ''}<span style={{ color: T.muted, marginLeft: 6 }}>{currentDeck?.count ?? ''}</span></button>
      ) : null}
      {/* Plain buttons instead of dice (or when there is no WebGL), so nothing is lost. */}
      {controls === 'buttons' || (failed && controls === 'dice') ? (
        <div style={{ position: 'absolute', left: bounds.left + 12, top: bounds.top + 12, display: 'flex', gap: 8, flexWrap: 'wrap', zIndex: 21 }}>
          <TButton label={currentDeck ? `${currentDeck.label} ${currentDeck.count}` : 'Decks'} onPress={() => setRing({ x: bounds.left + 90, y: bounds.top + 40 })} icon={<Glyph d={DIE_GLYPHS.cards} size={15} />} />
          {actions.map((a) => <TButton key={a.key} label={a.label} onPress={a.onPress} disabled={a.disabled} />)}
        </div>
      ) : null}
      {/* The decks' glyphs, drawn once off-screen to be read back as pictures for the die. */}
      <div ref={glyphHost} aria-hidden="true" style={{ position: 'absolute', left: -10000, top: 0, width: 1, height: 1, overflow: 'hidden' }}>
        {decks.map((d) => <div key={d.key} data-deck={d.key} style={{ width: 48, height: 48 }}><CategoryGlyph category={d.key} meta={d.meta} /></div>)}
      </div>
      {ring ? <DeckRing at={ring} width={width} height={height} decks={decks} current={current} onPick={(c) => { setRing(null); if (c !== current) onPickDeck(c); }} onClose={() => { playSfx('floatMenuClose'); setRing(null); }} /> : null}
    </>
  );
});

const labelStyle: React.CSSProperties = {
  all: 'unset', position: 'absolute', left: 0, top: 0, zIndex: 21, pointerEvents: 'none', whiteSpace: 'nowrap', padding: '2px 4px',
  fontFamily: T.bold, fontSize: 11, letterSpacing: 1.1, textTransform: 'uppercase', transition: 'color 140ms',
  textShadow: '0 1px 3px rgba(0,0,0,0.9)', willChange: 'transform',
};

function shapeOf(t: DieType): Shape {
  return t === 'duality' ? 'd12' : t === 'd100' ? 'd10' : (t as Shape);
}

/** The engine dice one pool die is thrown as: one, or two for a percentile (tens and units). */
function rollSpecs(d: PoolDie, finish: Finish): DieSpec[] {
  const base = `roll:${d.id}`;
  if (d.type === 'd100') {
    const c = numberColours(finish, 'd100');
    return [
      { key: `${base}:t`, shape: 'd10', size: ROLL_SIZE.d100, ...c, finish, faces: Array.from({ length: 10 }, (_, i) => ({ text: `${i}0` })) },
      { key: `${base}:u`, shape: 'd10', size: ROLL_SIZE.d100, ...c, finish, faces: Array.from({ length: 10 }, (_, i) => ({ text: String(i) })) },
    ];
  }
  const shape = shapeOf(d.type);
  const c = numberColours(finish, d.type, d.side);
  return [{ key: base, shape, size: d.side ? ROLL_SIZE.duality : ROLL_SIZE[d.type] ?? 58, ...c, finish, faces: Array.from({ length: FACES_OF[shape] }, (_, i) => ({ text: String(i + 1) })) }];
}

/** What a pool die rolled, from the faces its dice came to rest on. */
function valueOf(d: PoolDie, tops: number[]): number {
  if (d.type === 'd100') {
    const v = tops[0] * 10 + (tops[1] ?? 0);
    return v === 0 ? 100 : v;
  }
  return tops[0] + 1;
}

/** A token as engine pieces: a chip, one die, or a pair side by side (Hope and Fear; a percentile's tens and units). */
function tokenSpecs(t: TokenPiece, finish: Finish): { spec: DieSpec; face?: number; dx: number }[] {
  if (t.kind === 'chip') {
    return [{ spec: { key: t.key, shape: 'chip', size: 34 * t.scale, body: t.color ?? '#9A6B3C', edge: t.color ?? '#9A6B3C', ink: '#000', faces: [{ text: '' }], finish: 'stone' }, dx: 0 }];
  }
  const type = t.dieType ?? 'd6';
  const size = TOKEN_DIE_SIZE;
  if (type === 'duality') {
    return [
      { spec: { key: `${t.key}:h`, shape: 'd12', size, ...numberColours(finish, 'duality', 'hope'), finish, faces: Array.from({ length: 12 }, (_, i) => ({ text: String(i + 1) })) }, face: (t.value ?? 1) - 1, dx: -size * 0.55 },
      { spec: { key: `${t.key}:f`, shape: 'd12', size, ...numberColours(finish, 'duality', 'fear'), finish, faces: Array.from({ length: 12 }, (_, i) => ({ text: String(i + 1) })) }, face: (t.value2 ?? 1) - 1, dx: size * 0.55 },
    ];
  }
  if (type === 'd100') {
    const v = (t.value ?? 100) % 100;
    const c = numberColours(finish, 'd100');
    return [
      { spec: { key: `${t.key}:t`, shape: 'd10', size, ...c, finish, faces: Array.from({ length: 10 }, (_, i) => ({ text: `${i}0` })) }, face: Math.floor(v / 10), dx: -size * 0.55 },
      { spec: { key: `${t.key}:u`, shape: 'd10', size, ...c, finish, faces: Array.from({ length: 10 }, (_, i) => ({ text: String(i) })) }, face: v % 10, dx: size * 0.55 },
    ];
  }
  const shape = shapeOf(type);
  return [{ spec: { key: t.key, shape, size, ...numberColours(finish, type), finish, faces: Array.from({ length: FACES_OF[shape] }, (_, i) => ({ text: String(i + 1) })) }, face: (t.value ?? 1) - 1, dx: 0 }];
}

/**
 * The decks, in a straight column beside the category die, opening towards the middle of the table. Every tile is
 * the same width on the same line (owner: they looked misaligned when they curved). Arrows move, Enter picks,
 * Escape closes.
 */
function DeckRing({ at, width, height, decks, current, onPick, onClose }: { at: { x: number; y: number }; width: number; height: number; decks: TableDeck[]; current: CardCategory; onPick: (c: CardCategory) => void; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(Math.max(0, decks.findIndex((d) => d.key === current)));
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { const id = requestAnimationFrame(() => setOpen(true)); box.current?.focus(); return () => cancelAnimationFrame(id); }, []);
  const TW = 210, TH = 42, GAP = 6;
  const right = at.x < width / 2;
  const total = decks.length * (TH + GAP) - GAP;
  const top = Math.min(height - total - 10, Math.max(10, at.y - total / 2));
  const left = right ? Math.min(width - TW - 10, at.x + 64) : Math.max(10, at.x - 64 - TW);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); setFocus((f) => (f + (e.key === 'ArrowDown' ? 1 : -1) + decks.length) % decks.length); playSfx('floatMenuHighlight', { volume: 0.4 }); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const d = decks[focus]; if (d) onPick(d.key); }
  };
  return (
    <>
      <div onPointerDown={(e) => { e.stopPropagation(); onClose(); }} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }} style={{ position: 'absolute', inset: 0, zIndex: 40 }} />
      <div ref={box} tabIndex={-1} role="listbox" aria-label="Decks" onKeyDown={onKey} style={{ position: 'absolute', left, top, width: TW, zIndex: 41, outline: 'none', display: 'flex', flexDirection: 'column', gap: GAP, opacity: open ? 1 : 0, transform: open ? 'none' : `translateX(${right ? -14 : 14}px)`, transition: `opacity 160ms, transform 200ms ${T.ease}` }}>
        {decks.map((d, i) => {
          const active = d.key === current;
          const lit = focus === i;
          return (
            <div key={d.key} role="option" aria-selected={active} onPointerEnter={() => { if (focus !== i) { setFocus(i); playSfx('floatMenuHighlight', { volume: 0.4 }); } }} onClick={() => onPick(d.key)} style={{ height: TH, cursor: 'pointer' }}>
              <div style={{ height: '100%', clipPath: 'polygon(9px 0, calc(100% - 9px) 0, 100% 9px, 100% calc(100% - 9px), calc(100% - 9px) 100%, 9px 100%, 0 calc(100% - 9px), 0 9px)', background: active ? T.red : lit ? T.goldBright : T.goldSoft, padding: 1.3, boxSizing: 'border-box' }}>
                <div style={{ width: '100%', height: '100%', clipPath: 'polygon(8.5px 0, calc(100% - 8.5px) 0, 100% 8.5px, 100% calc(100% - 8.5px), calc(100% - 8.5px) 100%, 8.5px 100%, 0 calc(100% - 8.5px), 0 8.5px)', background: active ? T.red : lit ? T.panelLit : 'rgba(14,17,22,0.97)', display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px 0 8px', boxSizing: 'border-box' }}>
                  <div style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'scale(0.66)' }}><CategoryGlyph category={d.key} meta={d.meta} /></div>
                  <span style={{ flex: 1, color: active || lit ? T.ivory : T.goldText, fontFamily: Display.bold, fontSize: 12, letterSpacing: 0.9, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.label}</span>
                  <span style={{ color: active ? 'rgba(253,252,247,0.8)' : T.muted, fontFamily: T.bold, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{d.count}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
