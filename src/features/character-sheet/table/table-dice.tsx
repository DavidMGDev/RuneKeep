/**
 * The pieces on the desktop table (v0.47.0; v0.47.1 round two; v0.47.3 owner round four).
 *
 * - The deck die carries every deck's icon (a d6 at least, up to a d20). A click opens the decks beside it, the
 *   wheel walks them, and wherever it lands, thrown or rolled with a right click, is the deck it opens.
 * - Cards, State and Sort deck are control dice; a click uses one, a right click just rolls it.
 * - The supply: a token (scroll it for wood, bone, iron), a colour token (scroll for the colour), a die (scroll
 *   for d4 to d20, Hope and Fear, percentile) and the Deck of Many Things. A click throws out a copy, a drag pulls
 *   one off, a right click flings one (hold it to charge: the piece shakes harder and harder and then fires).
 *   They can be knocked about like anything else; Reset puts them back, their copies stay where they are.
 * - A loose piece is the same: right click to fling it, hold to charge.
 * - A piece dropped on a card is anchored to it: physics never moves it, only its card or your hand does.
 * - Drag on the empty felt to select pieces; the table shows what can be done with them.
 * - While Table settings is open everything goes home, and each row has a handle to drag it somewhere else or
 *   stand it on end.
 *
 * Input priority: the table's buttons, then pieces, then cards. Pieces keep their own hit test (the engine's), so a
 * die is never confused with a card under it.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';

import { Display } from '@/constants/theme';
import { DIE_COLOR, DIE_INK, type DieType, FEAR_INK, FEAR_PURPLE, HOPE_GOLD, HOPE_INK, kindScale, tokenFill, type TokenKind } from '../components/card-tokens-data';
import type { PoolDie } from '@/lib/dice-pool';
import { playSfx, playSynth } from '@/lib/sfx';
import type { CardCategory } from '../card-data';
import { CategoryGlyph } from '../sheet/deck-toggle-icon';
import type { DiceEngine, DieSpec, Finish, Shape, Walls } from './dice-engine';
import type { Bounds, Impact, Obstacle } from './dice-physics';
import { loadDicePlaces, saveDicePlaces } from './table-store';
import { Glyph, DIE_GLYPHS, glyphImage, type GlyphKey, T, TButton, tinted } from './table-ui';

export type ActionKey = 'cards' | 'state' | 'sort';
export interface TableAction { key: ActionKey; label: string; onPress: () => void; disabled?: boolean }
export interface TableDeck { key: CardCategory; label: string; count: number; meta?: { icon?: string; builtin: boolean } }

/** What a token is: a sewing-button token (wood, bone, iron, a colour) or a token die and its value. */
export interface TokenInfo { kind: TokenKind; color?: string; dieType?: DieType; dieValue?: number; dieValue2?: number }
/** A token lying loose on the table (not stuck to a card). */
export interface LoosePiece { key: string; token: TokenInfo; x: number; y: number }
/** One piece of the supply: always on the table, a click throws out a copy. */
export interface SupplyPiece { key: string; token: TokenInfo; label: string }

/** A token anchored to a card on the table: which card, where on it (px from its centre, in its own frame). */
export interface TokenPiece {
  key: string;
  card: string;
  lx: number;
  ly: number;
  kind: 'die' | 'chip';
  dieType?: DieType;
  value?: number;
  value2?: number;
  color?: string;
  scale: number;
}

/** A card laid on the table, as the engine sees it. */
export interface CardPose { key: string; x: number; y: number; w: number; h: number; rot: number; phys: boolean }

/** Where each row of pieces lives (px, the centre of the row). */
export interface Places { ctl: { x: number; y: number; dir: 'row' | 'column' }; sup: { x: number; y: number; dir: 'row' | 'column' }; cat: { x: number; y: number } }
export type PlaceGroup = 'ctl' | 'sup' | 'cat';

export interface TableDiceHandle {
  /** Throw these dice from (x, y); resolves with the faces that came to rest on top. */
  roll: (dice: PoolDie[], from: { x: number; y: number }) => Promise<PoolDie[]>;
  /** Roll the dice among these pieces where they lie (tokens are left alone); resolves with what they show. */
  rollPieces: (keys: string[]) => Promise<PoolDie[]>;
  clearRoll: () => void;
  /** Send every control die and the supply home. */
  resetHome: () => void;
  /** Every loose piece and rolled die flies back into the supply and is gone. */
  tidy: () => void;
  openDecks: (at: { x: number; y: number }) => void;
  hasRoll: () => boolean;
  /** A laid card was lifted: carry what lies loose on it (null when it is let go). */
  carry: (card: { cx: number; cy: number; w: number; h: number; rot: number } | null) => void;
  carryBy: (dx: number, dy: number) => void;
  selected: () => string[];
  select: (keys: string[]) => void;
  engine: () => DiceEngine | null;
  /** Rebuild a loose piece as stone (the Euryale card). */
  petrify: (key: string) => void;
}

const CAT = 'cat';
const ACTION_SIZE = 58;
const ACTIONS: ActionKey[] = ['cards', 'state', 'sort'];
const GLYPH: Record<ActionKey, GlyphKey> = { cards: 'cards', state: 'state', sort: 'sort' };
const ROLL_SIZE: Record<string, number> = { d4: 62, d6: 54, d8: 58, d10: 58, d12: 62, d20: 68, d100: 56, duality: 64 };
const TOKEN_DIE_SIZE = 46;
const FACES_OF: Record<Shape, number> = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20 };
/** Space between pieces in a row; a row on end needs more (each piece has its label under it). */
const SUPPLY_GAP = { row: 70, column: 90 };
const CTL_GAP = { row: 94, column: 104 };
export const DOMAT_KEY = 'src:domat';
const baseOf = (key: string) => key.replace(/:(h|f|t|u)$/, '');

/** The deck die's solid for a number of decks: a d6 at the least (owner: a d4 looked poor). */
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

/** Each control die's home: a row (or column) round the place the look gives it. */
export function ctlHome(p: Places, i: number, n = ACTIONS.length): { x: number; y: number } {
  const o = (i - (n - 1) / 2) * CTL_GAP[p.ctl.dir];
  return p.ctl.dir === 'row' ? { x: p.ctl.x + o, y: p.ctl.y } : { x: p.ctl.x, y: p.ctl.y + o };
}
/** Each supply piece's home, the same way. */
export function supHome(p: Places, i: number, n: number): { x: number; y: number } {
  const o = (i - (n - 1) / 2) * SUPPLY_GAP[p.sup.dir];
  return p.sup.dir === 'row' ? { x: p.sup.x + o, y: p.sup.y } : { x: p.sup.x, y: p.sup.y + o };
}

/** A token as the piece description the engine specs are built from. */
function pieceOf(key: string, t: TokenInfo): TokenPiece {
  return { key, card: '', lx: 0, ly: 0, kind: t.kind === 'die' ? 'die' : 'chip', dieType: t.dieType, value: t.dieValue, value2: t.dieValue2, color: tokenFill(t), scale: kindScale(t.kind) };
}

/** The card back of the Deck of Many Things, painted once: deep plum, a gold frame, an eye in a star. */
function deckBack(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0, '#2a1638');
  grad.addColorStop(1, '#120a1c');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#E0B563';
  g.lineWidth = 7;
  g.strokeRect(14, 14, 228, 228);
  g.lineWidth = 2;
  g.strokeRect(28, 28, 200, 200);
  g.translate(128, 128);
  g.beginPath();
  for (let i = 0; i < 16; i++) {
    const r = i % 2 ? 34 : 86;
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
    g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fillStyle = 'rgba(224,181,99,0.18)';
  g.fill();
  g.stroke();
  g.beginPath();
  g.ellipse(0, 0, 30, 17, 0, 0, Math.PI * 2);
  g.fillStyle = '#E0B563';
  g.fill();
  g.beginPath();
  g.arc(0, 0, 9, 0, Math.PI * 2);
  g.fillStyle = '#120a1c';
  g.fill();
  return c;
}

export const TableDice = forwardRef<TableDiceHandle, {
  host: HTMLElement | null;
  width: number;
  height: number;
  /** Where pieces may go. */
  bounds: Bounds;
  obstacles: Obstacle[];
  walls: { kind: Walls; rect: Bounds; thickness: number };
  places: Places;
  decks: TableDeck[];
  current: CardCategory;
  onPickDeck: (c: CardCategory) => void;
  actions: TableAction[];
  controls: 'dice' | 'buttons' | 'hidden';
  controlFinish: 'obsidian' | 'gilded' | 'ivory';
  numberFinish: 'resin' | 'stone' | 'metal';
  /** Tokens anchored to laid cards, and the laid cards themselves. */
  tokens: TokenPiece[];
  cards: CardPose[];
  /** Physical cards moved (to draw them there) or came to rest (to keep where). */
  onCardsMoved: (moved: { key: string; x: number; y: number; rot: number }[], rested: string[]) => void;
  supply: SupplyPiece[];
  /** The Deck of Many Things in the supply, and how many cards are left in it (null: not on the table). */
  domat: { left: number } | null;
  onDomatDraw: (from: { x: number; y: number }) => void;
  loose: LoosePiece[];
  /** A copy was thrown out of the supply (or a token popped off a card in the hand). */
  onSpawn: (key: string, token: TokenInfo, x: number, y: number) => void;
  /** The wheel over a supply piece: its next (1) or previous (-1) option. */
  onSupplyStep: (key: string, dir: 1 | -1) => void;
  /** A loose token came to rest here (to remember it), or a loose die was rolled to these values. */
  onLooseRest: (key: string, x: number, y: number) => void;
  onLooseRolled: (key: string, value: number, value2?: number) => void;
  /** An anchored token die was rolled where it lies: its new values. */
  onTokenRolled: (key: string, value: number, value2?: number) => void;
  /** A die from the last roll was rolled again: its new value. */
  onRerolled: (poolId: string, value: number) => void;
  /** A held piece was let go over this point (screen px); return true when that drop is handled. */
  onDropPiece: (key: string, clientX: number, clientY: number) => boolean;
  /** A token drawn on a card in the hand was pressed: take it off that card and say what it was. */
  onPopToken: (ref: string, id: string) => TokenInfo | null;
  /** Right click on the table where there is no piece. */
  onTableMenu: (clientX: number, clientY: number) => void;
  /** The marquee picked these pieces (empty: nothing selected). */
  onSelect: (keys: string[]) => void;
  /** Something hit a wall hard (px/s): shake the table. */
  onHardHit: (speed: number) => void;
  /** Every loose piece went back into the supply. */
  onTidied: () => void;
  /** Settings are open: everything goes home and each row can be dragged somewhere else. */
  editing: boolean;
  onMoveGroup: (g: PlaceGroup, x: number, y: number) => void;
  onFlipGroup: (g: 'ctl' | 'sup') => void;
  /** A panel is open: the pieces stay where they are and take no clicks. */
  inert: boolean;
}>(function TableDice(props, ref) {
  const { host, width, height, bounds, obstacles, walls, decks, current, onPickDeck, actions, controls, controlFinish, numberFinish, tokens, inert, places, editing } = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [engine, setEngine] = useState<DiceEngine | null>(null);
  const [failed, setFailed] = useState(false);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [ring, setRing] = useState<{ x: number; y: number } | null>(null);
  const [marquee, setMarquee] = useState<Bounds | null>(null);
  const [btnBox, setBtnBox] = useState({ w: 0, h: 0 });
  const labels = useRef(new Map<string, HTMLElement>());
  const glyphHost = useRef<HTMLDivElement>(null);
  const [deckArt, setDeckArt] = useState<Map<string, HTMLImageElement> | null>(null);
  const live = useRef(props);
  live.current = props;
  const pending = useRef<{ keys: Set<string>; done: () => void } | null>(null);
  /** Pieces rolling (a right click, a fling, a throw of the deck die), and what to do when each lands. */
  const rolling = useRef(new Map<string, () => void>());
  /** The dice the last roll threw, and which pool die each belongs to. */
  const rolled = useRef(new Map<string, PoolDie>());
  const selection = useRef<string[]>([]);
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
        e.onImpact((hit: Impact) => {
          void import('./dice-engine').then((m) => m.knock(playSynth, hit));
          if (hit.kind === 'rail' && hit.speed > 2400) live.current.onHardHit(hit.speed);
        });
        setEngine(e);
      })
      .catch(() => { if (!dead) setFailed(true); });
    return () => { dead = true; eng?.dispose(); };
  }, []);

  useEffect(() => { engine?.resize(width, height); }, [engine, width, height]);
  const boundsKey = JSON.stringify(bounds);
  useEffect(() => { engine?.setBounds(bounds); }, [engine, boundsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const obstacleKey = JSON.stringify(obstacles);
  useEffect(() => { engine?.setObstacles(obstacles); }, [engine, obstacleKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const wallKey = JSON.stringify(walls);
  useEffect(() => { engine?.setWalls(walls.kind, walls.rect, walls.thickness); }, [engine, wallKey, width, height]); // eslint-disable-line react-hooks/exhaustive-deps
  const cardKey = JSON.stringify(props.cards);
  useEffect(() => { engine?.setCards(props.cards); }, [engine, cardKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { engine?.onCards((m, r) => live.current.onCardsMoved(m, r)); }, [engine]);

  // ---------------------------------------------------------------- homes
  const homeOf = useCallback((key: string): { x: number; y: number } | null => {
    const p = live.current.places;
    const b = boundsRef.current;
    const clamp = (h: { x: number; y: number }) => ({ x: Math.min(b.right - 34, Math.max(b.left + 34, h.x)), y: Math.min(b.bottom - 34, Math.max(b.top + 34, h.y)) });
    if (key === CAT) return clamp(p.cat);
    const ai = ACTIONS.indexOf(key as ActionKey);
    if (ai >= 0) return clamp(ctlHome(p, ai));
    const base = baseOf(key);
    const sup = [...live.current.supply.map((s) => s.key), ...(live.current.domat ? [DOMAT_KEY] : [])];
    const si = sup.indexOf(base);
    if (si >= 0) {
      const h = supHome(p, si, sup.length);
      const off = key.endsWith(':h') || key.endsWith(':t') ? -TOKEN_DIE_SIZE * 0.3 : key.endsWith(':f') || key.endsWith(':u') ? TOKEN_DIE_SIZE * 0.3 : 0;
      return clamp(p.sup.dir === 'row' ? { x: h.x + off, y: h.y } : { x: h.x + off, y: h.y });
    }
    return null;
  }, []);
  /** Where a piece was left, else its home. */
  const placeOf = useCallback((key: string) => {
    const pl = loadDicePlaces()[key];
    const b = boundsRef.current;
    const { width: W, height: H } = size.current;
    if (pl && Number.isFinite(pl.fx) && Number.isFinite(pl.fy) && !live.current.editing) return { x: Math.min(b.right - 30, Math.max(b.left + 30, pl.fx * W)), y: Math.min(b.bottom - 30, Math.max(b.top + 30, pl.fy * H)) };
    return homeOf(key) ?? { x: W / 2, y: H / 2 };
  }, [homeOf]);
  const homeKeys = useCallback(() => {
    const e = engineRef.current;
    return e ? e.keys().filter((k) => k === CAT || ACTIONS.includes(k as ActionKey) || k.startsWith('src:')) : [];
  }, []);
  const sendHome = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    saveDicePlaces({});
    for (const k of homeKeys()) {
      const h = homeOf(k);
      if (h) e.home(k, h.x, h.y, k === CAT ? deckFaceRef.current.indexOf(live.current.current) : ACTIONS.includes(k as ActionKey) ? 0 : undefined);
    }
  }, [homeKeys, homeOf]);
  // Settings open: everything goes home. And while they are open, a row moved goes with its handle.
  const placesKey = JSON.stringify(places);
  useEffect(() => { if (editing) sendHome(); }, [editing, placesKey, engine]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rests: a roll resolves, a right-click roll acts, and where the home pieces lie is remembered.
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
        if (act) { rolling.current.delete(k); act(); continue; }
        // The deck die knocked over by something else turns back to the deck that is open (only a throw or a
        // right click of its own picks a deck).
        if (k === CAT) {
          const want = deckFaceRef.current.indexOf(live.current.current);
          if (deckFaceRef.current.faces[engine.state(CAT)?.top ?? -1]?.key !== live.current.current) engine.setFace(CAT, want);
        }
      }
      for (const k of keys) {
        if (!k.startsWith('free:')) continue;
        const st = engine.state(k);
        if (st) live.current.onLooseRest(baseOf(k), st.x, st.y);
      }
      const places = loadDicePlaces();
      let changed = false;
      for (const k of keys) {
        if (k !== CAT && !ACTIONS.includes(k as ActionKey) && !k.startsWith('src:')) continue;
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
  const deckFaceRef = useRef(deckFace);
  deckFaceRef.current = deckFace;

  useEffect(() => {
    if (!engine || !deckArt || !decks.length || width < 50) return;
    if (!showDice) { engine.remove(CAT); return; }
    const shape = catShape(decks.length);
    // The icons keep their own colours; on a light die a soft dark halo separates them (owner: no plate).
    const halo = controlFinish === 'obsidian' ? undefined : 'rgba(10,8,4,0.9)';
    const spec: DieSpec = {
      key: CAT, shape, size: shape === 'd20' ? 112 : shape === 'd12' ? 100 : shape === 'd8' ? 94 : 84, body: style.body, edge: style.edge, ink: style.ink, finish: controlFinish, upright: true,
      faces: deckFace.faces.map((d) => (d && deckArt.get(d.key) ? { image: deckArt.get(d.key)!, halo } : { text: '' })),
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

  // ---------------------------------------------------------------- anchored tokens
  const tokenKey = tokens.map((t) => `${t.key}:${t.kind}:${t.dieType ?? ''}:${t.color ?? ''}`).join('|');
  const anchorKey = tokens.map((t) => `${t.key}@${t.card}:${t.lx.toFixed(1)},${t.ly.toFixed(1)}`).join('|');
  useEffect(() => {
    if (!engine) return;
    const want = new Set<string>();
    for (const t of tokens) {
      for (const spec of tokenSpecs(t, numberFinish)) {
        want.add(spec.spec.key);
        if (!engine.has(spec.spec.key)) engine.add(spec.spec, 0, 0, { face: spec.face, pop: true });
        engine.anchor(spec.spec.key, t.card, t.lx + spec.dx, t.ly);
      }
    }
    for (const k of engine.keys()) if (k.startsWith('tok:') && !want.has(k)) engine.remove(k);
  }, [engine, tokenKey, anchorKey, numberFinish]); // eslint-disable-line react-hooks/exhaustive-deps
  // A new finish rebuilds the pieces in place.
  useEffect(() => {
    if (!engine) return;
    for (const t of live.current.tokens) for (const s of tokenSpecs(t, numberFinish)) if (engine.has(s.spec.key)) engine.add(s.spec, 0, 0);
    for (const t of live.current.loose) for (const s of tokenSpecs(pieceOf(t.key, t.token), numberFinish)) if (engine.has(s.spec.key)) engine.add(s.spec, 0, 0);
    for (const [k, d] of rolled.current) for (const s of rollSpecs(d, numberFinish)) if (s.key === k && engine.has(k)) engine.add(s, 0, 0);
  }, [engine, numberFinish]);

  // ---------------------------------------------------------------- the supply and the Deck of Many Things
  const backArt = useMemo(() => (typeof document === 'undefined' ? null : deckBack()), []);
  const supplyKey = props.supply.map((t) => `${t.key}:${t.token.kind}:${t.token.color ?? ''}:${t.token.dieType ?? ''}`).join('|') + (props.domat ? '|domat' : '');
  /** What each supply piece was last built as: the wheel rebuilds only the one that changed (owner: it lagged). */
  const built = useRef(new Map<string, string>());
  useEffect(() => {
    if (!engine) return;
    const want = new Set<string>();
    props.supply.forEach((t) => {
      for (const sp of tokenSpecs(pieceOf(t.key, t.token), numberFinish)) {
        want.add(sp.spec.key);
        const sig = `${t.token.kind}:${t.token.color ?? ''}:${t.token.dieType ?? ''}:${numberFinish}`;
        const fresh = !engine.has(sp.spec.key);
        if (!fresh && built.current.get(sp.spec.key) === sig) continue;
        built.current.set(sp.spec.key, sig);
        const at = fresh ? placeOf(sp.spec.key) : { x: 0, y: 0 };
        engine.add({ ...sp.spec, spawner: true }, at.x, at.y, { face: sp.face });
      }
    });
    if (props.domat && backArt) {
      want.add(DOMAT_KEY);
      if (!engine.has(DOMAT_KEY)) {
        const at = placeOf(DOMAT_KEY);
        engine.add({ key: DOMAT_KEY, shape: 'deck', size: 74, body: '#1c1026', edge: '#d9c9a3', ink: '#000', faces: [{ image: backArt }], finish: 'stone', spawner: true }, at.x, at.y);
      }
    }
    for (const k of engine.keys()) if (k.startsWith('src:') && !want.has(k)) { engine.remove(k); built.current.delete(k); }
  }, [engine, supplyKey, numberFinish, backArt]); // eslint-disable-line react-hooks/exhaustive-deps
  // Loose tokens: added where they were left, removed when they go onto a card or back to the supply.
  const looseKey = props.loose.map((t) => `${t.key}:${t.token.kind}:${t.token.dieType ?? ''}:${t.token.color ?? ''}`).join('|');
  useEffect(() => {
    if (!engine) return;
    const want = new Set<string>();
    for (const t of props.loose) {
      for (const sp of tokenSpecs(pieceOf(t.key, t.token), numberFinish)) {
        want.add(sp.spec.key);
        if (!engine.has(sp.spec.key)) engine.add(sp.spec, t.x + sp.dx, t.y, { face: sp.face, pop: true });
      }
    }
    for (const k of engine.keys()) if (k.startsWith('free:') && !want.has(k)) engine.remove(k);
  }, [engine, looseKey, numberFinish]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Pieces a lifted card is carrying. */
  const carried = useRef<string[]>([]);

  // Labels ride under their pieces. One stable ref callback per piece, so a re-render never detaches a label.
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
  }, [engine, glyphs, deckArt, showDice, controlFinish, supplyKey]);

  // ---------------------------------------------------------------- spawning and flinging
  /** A new loose copy of a supply piece at (x, y); returns the key to hold (the Hope die of a pair). */
  const spawn = useCallback((token: TokenInfo, x: number, y: number) => {
    const e = engineRef.current!;
    const nk = `free:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    for (const sp of tokenSpecs(pieceOf(nk, token), live.current.numberFinish)) e.add(sp.spec, x + sp.dx, y, { face: sp.face, pop: true, fresh: true });
    live.current.onSpawn(nk, token, x, y);
    return token.dieType === 'duality' && token.kind === 'die' ? `${nk}:h` : token.dieType === 'd100' && token.kind === 'die' ? `${nk}:t` : nk;
  }, []);
  /** The parts one piece is made of (a pair of dice, or itself). */
  const partsOf = useCallback((key: string) => {
    const e = engineRef.current;
    const base = baseOf(key);
    return e ? e.keys().filter((k) => baseOf(k) === base) : [key];
  }, []);
  /** When a flung loose die lands, it keeps what it shows. */
  const watchLoose = useCallback((key: string) => {
    const e = engineRef.current;
    const base = baseOf(key);
    const t = live.current.loose.find((l) => l.key === base);
    if (!e || !t || t.token.kind !== 'die') return;
    const parts = partsOf(key);
    let left = parts.length;
    for (const k of parts) {
      rolling.current.set(k, () => {
        if (--left > 0) return;
        const tops = parts.map((x) => e.state(x)?.top ?? 0);
        if (t.token.dieType === 'duality') live.current.onLooseRolled(base, tops[0] + 1, tops[1] + 1);
        else if (t.token.dieType === 'd100') { const v = tops[0] * 10 + tops[1]; live.current.onLooseRolled(base, v === 0 ? 100 : v); }
        else live.current.onLooseRolled(base, tops[0] + 1);
      });
    }
  }, [partsOf]);
  /** Fling a piece (and its partner) off in a random direction at this speed. */
  const fling = useCallback((key: string, speed: number) => {
    const e = engineRef.current;
    if (!e) return;
    const ang = Math.random() * Math.PI * 2;
    for (const k of partsOf(key)) e.toss(k, Math.cos(ang + (Math.random() - 0.5) * 0.2) * speed, Math.sin(ang + (Math.random() - 0.5) * 0.2) * speed);
    if (key.startsWith('free:')) watchLoose(key);
  }, [partsOf, watchLoose]);

  // ---------------------------------------------------------------- right click: roll it where it lies
  const rollInPlace = useCallback((key: string) => {
    const e = engineRef.current;
    if (!e) return;
    playSfx('gearScroll1', { volume: 0.3 });
    const p = live.current;
    if (key === CAT) {
      e.rollInPlace(key);
      rolling.current.set(CAT, () => {
        const deck = deckFaceRef.current.faces[e.state(CAT)?.top ?? 0];
        if (deck && deck.key !== live.current.current) live.current.onPickDeck(deck.key);
      });
      return;
    }
    if (key.startsWith('tok:')) {
      // Anchored: it cannot move, so it turns over to a new face where it lies.
      const base = baseOf(key);
      const piece = p.tokens.find((t) => t.key === base);
      if (!piece || piece.kind !== 'die') { playSfx('placeToken', { volume: 0.4 }); return; }
      const parts = tokenSpecs(piece, numberFinish).map((s) => s.spec.key);
      const tops = parts.map((k) => {
        const n = e.state(k) ? FACES_OF[shapeOf(piece.dieType ?? 'd6')] : 6;
        const f = Math.floor(Math.random() * n);
        e.setFace(k, f);
        return f;
      });
      if (piece.dieType === 'duality') p.onTokenRolled(base, tops[0] + 1, tops[1] + 1);
      else if (piece.dieType === 'd100') { const v = tops[0] * 10 + tops[1]; p.onTokenRolled(base, v === 0 ? 100 : v); }
      else p.onTokenRolled(base, tops[0] + 1);
      return;
    }
    const die = rolled.current.get(key);
    if (die) {
      const parts = rollSpecs(die, numberFinish).map((s) => s.key);
      for (const k of parts) e.rollInPlace(k);
      let left = parts.length;
      for (const k of parts) {
        rolling.current.set(k, () => {
          if (--left > 0) return;
          live.current.onRerolled(die.id, valueOf(die, parts.map((x) => e.state(x)?.top ?? 0)));
        });
      }
      return;
    }
    // A control die just rolls: nothing happens when it lands (owner).
    e.rollInPlace(key);
  }, [numberFinish]);

  // ---------------------------------------------------------------- the pointer: buttons, then pieces, then cards
  const inertRef = useRef(inert);
  inertRef.current = inert;
  useEffect(() => {
    if (!host || !engine) return;
    let press: { key: string; x: number; y: number; t: number; moved: boolean; id: number; spawned: boolean } | null = null;
    /** A right button held on a piece: it charges until let go. */
    let charge: { key: string; t: number; id: number; raf: number } | null = null;
    let box: { x: number; y: number; id: number } | null = null;
    let menuUntil = 0;
    let thrownCat = false;
    const local = (e: { clientX: number; clientY: number }) => {
      const r = host.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onUi = (t: EventTarget | null) => !!(t as HTMLElement)?.closest?.('button, input, [role="menu"], [role="dialog"], [role="listbox"], [data-ui]');
    const onDown = (e: PointerEvent) => {
      if (inertRef.current || onUi(e.target)) return;
      const p = local(e);
      const key = engine.hit(p.x, p.y);
      if (!key) {
        // A token drawn on a card in the hand: pop it off into the hand, already being dragged.
        const tokEl = (e.target as HTMLElement).closest?.('[data-card-token]') as HTMLElement | null;
        if (tokEl && e.button === 0) {
          const info = live.current.onPopToken(tokEl.dataset.cardToken!, tokEl.dataset.tokenId!);
          if (!info) return;
          e.stopPropagation();
          e.preventDefault();
          try { host.setPointerCapture(e.pointerId); } catch { /* gone */ }
          const k = spawn(info, p.x, p.y);
          press = { key: k, x: e.clientX, y: e.clientY, t: performance.now(), moved: true, id: e.pointerId, spawned: true };
          engine.grab(k, p.x, p.y);
          host.style.cursor = 'grabbing';
          playSfx('placeToken', { volume: 0.6, cents: 300 });
          return;
        }
        // The empty felt: drag a box to select pieces.
        const felt = e.target === host || (e.target as HTMLElement).dataset?.felt !== undefined;
        if (felt && e.button === 0) {
          box = { x: p.x, y: p.y, id: e.pointerId };
          try { host.setPointerCapture(e.pointerId); } catch { /* gone */ }
        }
        return;
      }
      e.stopPropagation();
      e.preventDefault();
      if (e.button === 2) {
        menuUntil = performance.now() + 4000;
        if (key.startsWith('free:') || (key.startsWith('src:') && key !== DOMAT_KEY)) {
          charge = { key, t: performance.now(), id: e.pointerId, raf: 0 };
          const tick = () => {
            if (!charge) return;
            const held = (performance.now() - charge.t) / 1000;
            engine.jitter(charge.key, Math.min(1, Math.max(0, held - 0.15) / 1.6));
            charge.raf = requestAnimationFrame(tick);
          };
          charge.raf = requestAnimationFrame(tick);
          try { host.setPointerCapture(e.pointerId); } catch { /* gone */ }
          return;
        }
        if (key === DOMAT_KEY) { const s = engine.state(key); if (s) live.current.onDomatDraw({ x: s.x, y: s.y }); return; }
        rollInPlace(key);
        return;
      }
      if (e.button !== 0) return;
      try { host.setPointerCapture(e.pointerId); } catch { /* gone */ }
      let grabbed = key;
      let spawned = false;
      if (key.startsWith('src:') && key !== DOMAT_KEY) {
        const src = live.current.supply.find((t) => t.key === baseOf(key));
        const at = engine.state(key);
        if (!src || !at) return;
        grabbed = spawn(src.token, at.x, at.y);
        spawned = true;
        playSfx('placeToken', { volume: 0.6, cents: 200 });
      }
      press = { key: grabbed, x: e.clientX, y: e.clientY, t: performance.now(), moved: false, id: e.pointerId, spawned };
      engine.grab(grabbed, p.x, p.y);
      host.style.cursor = 'grabbing';
      playSfx('placeToken', { volume: 0.35, cents: 300 });
    };
    const onMove = (e: PointerEvent) => {
      const p = local(e);
      if (box && e.pointerId === box.id) {
        const r = { left: Math.min(box.x, p.x), top: Math.min(box.y, p.y), right: Math.max(box.x, p.x), bottom: Math.max(box.y, p.y) };
        if (r.right - r.left > 4 || r.bottom - r.top > 4) setMarquee(r);
        return;
      }
      if (press && e.pointerId === press.id) {
        if (!press.moved && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 5) press.moved = true;
        engine.drag(p.x, p.y);
        return;
      }
      if (charge || inertRef.current) return;
      const key = engine.hit(p.x, p.y);
      engine.hover(key);
      setHoverKey(key);
      host.style.cursor = key ? 'grab' : '';
    };
    const onUp = (e: PointerEvent) => {
      if (box && e.pointerId === box.id) {
        const p = local(e);
        const r = { left: Math.min(box.x, p.x), top: Math.min(box.y, p.y), right: Math.max(box.x, p.x), bottom: Math.max(box.y, p.y) };
        box = null;
        setMarquee(null);
        const big = r.right - r.left > 6 || r.bottom - r.top > 6;
        // Only what can be rolled or moved together: loose tokens and dice, and the dice of the last roll.
        const keys = big ? [...new Set(engine.inside(r).filter((k) => k.startsWith('free:') || k.startsWith('roll:')).flatMap((k) => partsOf(k)))] : [];
        selection.current = keys;
        engine.select(keys);
        live.current.onSelect(keys);
        if (keys.length) playSfx('cardSelect', { volume: 0.5 });
        return;
      }
      if (charge && e.pointerId === charge.id) {
        const c = charge;
        charge = null;
        cancelAnimationFrame(c.raf);
        engine.jitter(c.key, 0);
        const held = (performance.now() - c.t) / 1000;
        // A tap flings softly; held, it charges up to a shot that crosses the table in a blink.
        const power = held < 0.22 ? 0 : Math.min(1, (held - 0.15) / 1.6);
        const speed = power === 0 ? 650 + Math.random() * 250 : 900 + Math.pow(power, 1.4) * 8600;
        let k = c.key;
        if (k.startsWith('src:')) {
          const src = live.current.supply.find((t) => t.key === baseOf(k));
          const at = engine.state(k);
          if (!src || !at) return;
          k = spawn(src.token, at.x, at.y);
        }
        playSfx(power > 0.6 ? 'gainGoldenHp' : 'gearScroll1', { volume: 0.25 + power * 0.5, cents: Math.round(power * 600) });
        fling(k, speed);
        return;
      }
      if (!press || e.pointerId !== press.id) return;
      const pr = press;
      press = null;
      host.style.cursor = 'grab';
      if (pr.moved && live.current.onDropPiece(pr.key, e.clientX, e.clientY)) { engine.release(); return; }
      const speed = engine.release();
      if (pr.key.startsWith('free:')) watchLoose(pr.key);
      if (pr.spawned && !pr.moved) {
        // A click on the supply throws the copy out across the table.
        const ang = Math.PI / 2 + (Math.random() - 0.5) * 1.4;
        engine.toss(pr.key, Math.cos(ang) * 620, Math.sin(ang) * 620);
        return;
      }
      if (!pr.moved && performance.now() - pr.t < 450) {
        if (pr.key === CAT) {
          const s = engine.state(CAT);
          if (s) { playSfx('floatMenuOpen'); setRing({ x: s.x, y: s.y }); }
        } else if (pr.key === DOMAT_KEY) {
          const s = engine.state(DOMAT_KEY);
          if (s) live.current.onDomatDraw({ x: s.x, y: s.y });
        } else {
          const a = live.current.actions.find((x) => x.key === pr.key);
          if (a && !a.disabled) a.onPress();
        }
      } else {
        if (speed > 900) playSfx('gearScroll1', { volume: 0.25 });
        // The deck die thrown: the deck it lands on opens.
        if (pr.key === CAT && speed > 250) {
          thrownCat = true;
          rolling.current.set(CAT, () => {
            if (!thrownCat) return;
            thrownCat = false;
            const deck = deckFaceRef.current.faces[engine.state(CAT)?.top ?? 0];
            if (deck && deck.key !== live.current.current) live.current.onPickDeck(deck.key);
          });
        }
      }
    };
    const onLeave = () => { if (!press) { engine.hover(null); setHoverKey(null); } };
    // A right click on a piece never opens a menu (owner); on the table, away from pieces and cards, it opens the table's.
    const onMenu = (e: MouseEvent) => {
      if (performance.now() < menuUntil) { e.preventDefault(); e.stopPropagation(); menuUntil = 0; return; }
      if (onUi(e.target)) return;
      e.preventDefault();
      if (inertRef.current) return;
      if ((e.target as HTMLElement).closest?.('[data-card-id], [data-board-card], [data-domat]')) return;
      live.current.onTableMenu(e.clientX, e.clientY);
    };
    // The wheel: over the deck die it walks the decks, over a supply piece it walks that piece's options.
    let wheelAcc = 0;
    const onWheel = (e: WheelEvent) => {
      if (inertRef.current) return;
      const p = local(e);
      const key = engine.hit(p.x, p.y);
      if (key !== CAT && !(key?.startsWith('src:') && key !== DOMAT_KEY)) return;
      e.preventDefault();
      e.stopPropagation();
      wheelAcc += e.deltaY * (e.deltaMode === 1 ? 40 : 1);
      if (Math.abs(wheelAcc) < 50) return;
      const dir = wheelAcc > 0 ? 1 : -1;
      wheelAcc = 0;
      if (key === CAT) {
        const list = live.current.decks;
        const i = list.findIndex((d) => d.key === live.current.current);
        const next = list[(i + dir + list.length) % list.length];
        if (next) live.current.onPickDeck(next.key);
        return;
      }
      live.current.onSupplyStep(baseOf(key!), dir);
    };
    host.addEventListener('pointerdown', onDown, true);
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerup', onUp);
    host.addEventListener('pointercancel', onUp);
    host.addEventListener('pointerleave', onLeave);
    window.addEventListener('contextmenu', onMenu, true);
    host.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => {
      host.removeEventListener('pointerdown', onDown, true);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerup', onUp);
      host.removeEventListener('pointercancel', onUp);
      host.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('contextmenu', onMenu, true);
      host.removeEventListener('wheel', onWheel, { capture: true });
      if (charge) cancelAnimationFrame(charge.raf);
    };
  }, [host, engine, rollInPlace, spawn, fling, partsOf, watchLoose]);

  // ---------------------------------------------------------------- rolls, tidying and reset
  const waitFor = useCallback((keys: string[], read: () => PoolDie[]) => new Promise<PoolDie[]>((resolve) => {
    const finish = () => { clearTimeout(guard); resolve(read()); };
    // A die held in someone's hand never lands: after a while the roll reads what is on top regardless.
    const guard = setTimeout(() => { if (pending.current?.done === finish) pending.current = null; finish(); }, 9000);
    pending.current = { keys: new Set(keys), done: finish };
  }), []);

  useImperativeHandle(ref, () => ({
    roll: (dice, from) => {
      if (!engine) return Promise.resolve(dice.map((d) => ({ ...d, value: 1 + Math.floor(Math.random() * (d.type === 'd100' ? 100 : d.type === 'duality' ? 12 : FACES_OF[d.type as Shape])) })));
      clear(engine);
      const keys: string[] = [];
      const b = boundsRef.current;
      const thrown: { die: PoolDie; keys: string[] }[] = [];
      dice.forEach((d, i) => {
        const specs = rollSpecs(d, live.current.numberFinish);
        thrown.push({ die: d, keys: specs.map((s) => s.key) });
        specs.forEach((spec, j) => {
          const spread = Math.min(b.right - b.left - 160, 60 + dice.length * 34);
          const x = Math.min(b.right - 50, Math.max(b.left + 50, from.x + (((i + j * 0.5) / Math.max(1, dice.length - 1)) - 0.5) * spread));
          engine.add(spec, x, Math.min(b.bottom - 50, Math.max(b.top + 50, from.y)), { random: true });
          rolled.current.set(spec.key, d);
          const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.1;
          const sp = 650 + Math.random() * 550;
          engine.toss(spec.key, Math.cos(ang) * sp, Math.sin(ang) * sp);
          keys.push(spec.key);
        });
      });
      playSfx('gearScroll1', { volume: 0.35 });
      return waitFor(keys, () => thrown.map(({ die, keys: ks }) => ({ ...die, value: valueOf(die, ks.map((k) => engine.state(k)?.top ?? 0)) })));
    },
    rollPieces: (keys) => {
      if (!engine) return Promise.resolve([]);
      const groups = new Map<string, string[]>();
      for (const k of keys) {
        const base = baseOf(k);
        if (base.startsWith('roll:')) { const d = rolled.current.get(k); if (d) groups.set(`roll:${d.id}`, [...(groups.get(`roll:${d.id}`) ?? []), k]); continue; }
        const t = live.current.loose.find((l) => l.key === base);
        if (t?.token.kind === 'die') groups.set(base, partsOf(k));
      }
      const all = [...new Set([...groups.values()].flat())];
      if (!all.length) return Promise.resolve([]);
      for (const k of all) {
        const ang = Math.random() * Math.PI * 2;
        const sp = 380 + Math.random() * 320;
        engine.toss(k, Math.cos(ang) * sp, Math.sin(ang) * sp);
      }
      playSfx('gearScroll1', { volume: 0.35 });
      return waitFor(all, () => {
        const out: PoolDie[] = [];
        for (const [base, parts] of groups) {
          const tops = parts.map((k) => engine.state(k)?.top ?? 0);
          if (base.startsWith('roll:')) {
            const d = rolled.current.get(parts[0]);
            if (d) { const v = valueOf(d, tops); out.push({ ...d, value: v }); live.current.onRerolled(d.id, v); }
            continue;
          }
          const t = live.current.loose.find((l) => l.key === base)!;
          const type = t.token.dieType ?? 'd6';
          if (type === 'duality') {
            out.push({ id: `${base}:h`, type: 'd12', value: tops[0] + 1, side: 'hope', pairId: base }, { id: `${base}:f`, type: 'd12', value: tops[1] + 1, side: 'fear', pairId: base });
            live.current.onLooseRolled(base, tops[0] + 1, tops[1] + 1);
          } else if (type === 'd100') {
            const v = tops[0] * 10 + tops[1];
            out.push({ id: base, type: 'd100', value: v === 0 ? 100 : v });
            live.current.onLooseRolled(base, v === 0 ? 100 : v);
          } else {
            out.push({ id: base, type, value: tops[0] + 1 });
            live.current.onLooseRolled(base, tops[0] + 1);
          }
        }
        return out;
      });
    },
    clearRoll: () => { if (engine) clear(engine); },
    resetHome: () => {
      if (!engine) return;
      sendHome();
      playSfx('gearScroll2', { volume: 0.45 });
    },
    tidy: () => {
      if (!engine) return;
      const sup = live.current.supply;
      const toKey = (base: string): string => {
        const t = live.current.loose.find((l) => l.key === base)?.token;
        if (!t) return 'src:die';
        return t.kind === 'die' ? 'src:die' : t.kind === 'color' ? 'src:color' : 'src:mat';
      };
      // Owner (v0.47.4): each piece goes in a beat after the last, arcs and tumbles to its spawner's home, touches
      // nothing on the way and shrinks away there. The spawners go home at the same time.
      const keys = engine.keys().filter((k) => k.startsWith('free:') || k.startsWith('roll:'));
      const STAGGER = 45;
      keys.forEach((k, i) => {
        const target = k.startsWith('roll:') ? 'src:die' : toKey(baseOf(k));
        const h = homeOf(sup.some((s) => s.key === target) ? target : 'src:die') ?? { x: 60, y: 60 };
        engine.vanish(k, h.x, h.y, i * STAGGER);
        if (i % 2 === 0 && i < 24) setTimeout(() => playSfx('placeToken', { volume: 0.3, cents: 300 + i * 40 }), i * STAGGER + 420);
      });
      sendHome();
      playSfx('gearScroll2', { volume: 0.5 });
      setTimeout(() => {
        for (const k of keys) engine.remove(k);
        rolled.current.clear();
        selection.current = [];
        live.current.onSelect([]);
        live.current.onTidied();
      }, keys.length * STAGGER + 800);
    },
    openDecks: (at) => { playSfx('floatMenuOpen'); setRing(at); },
    hasRoll: () => rolled.current.size > 0,
    carry: (card) => {
      if (!engine || !card) { carried.current = []; return; }
      const a = (-card.rot * Math.PI) / 180;
      carried.current = engine.keys().filter((k) => {
        if (k.startsWith('tok:')) return false;
        const st = engine.state(k);
        if (!st) return false;
        const dx = st.x - card.cx, dy = st.y - card.cy;
        const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
        return Math.abs(lx) <= card.w / 2 && Math.abs(ly) <= card.h / 2;
      });
    },
    carryBy: (dx, dy) => { if (engine && carried.current.length) engine.nudge(carried.current, dx, dy); },
    selected: () => selection.current.filter((k) => engine?.has(k)),
    select: (keys) => { selection.current = keys; engine?.select(keys); },
    engine: () => engine,
    petrify: (key) => {
      if (!engine) return;
      for (const k of partsOf(key)) {
        const base = baseOf(k);
        const t = live.current.loose.find((l) => l.key === base);
        if (!t) continue;
        for (const s of tokenSpecs(pieceOf(t.key, t.token), 'stone')) if (s.spec.key === k) engine.add({ ...s.spec, body: '#5d625e', edge: '#7c827c', ink: '#2c302d', finish: 'stone' }, 0, 0);
      }
    },
  }), [engine, sendHome, homeOf, partsOf, waitFor]);
  const clear = (e: DiceEngine) => {
    for (const k of rolled.current.keys()) e.remove(k);
    rolled.current.clear();
  };

  const currentDeck = decks.find((d) => d.key === current);
  const ready = !!engine && !!glyphs;

  // The row handles while settings are open: drag one to move its row, flip it to stand it on end.
  const groups: { g: PlaceGroup; box: Bounds; label: string }[] = [];
  if (editing) {
    const sn = props.supply.length + (props.domat ? 1 : 0);
    const half = (n: number, gap: number) => ((n - 1) * gap) / 2 + 40;
    if (controls !== 'hidden') {
      const hw = places.ctl.dir === 'row' ? half(ACTIONS.length, CTL_GAP.row) : 44, hh = places.ctl.dir === 'row' ? 50 : half(ACTIONS.length, CTL_GAP.column);
      groups.push({ g: 'ctl', box: { left: places.ctl.x - hw, right: places.ctl.x + hw, top: places.ctl.y - hh, bottom: places.ctl.y + hh }, label: 'Control dice' });
      groups.push({ g: 'cat', box: { left: places.cat.x - 58, right: places.cat.x + 58, top: places.cat.y - 58, bottom: places.cat.y + 64 }, label: 'Deck die' });
    }
    if (sn) {
      const hw = places.sup.dir === 'row' ? half(sn, SUPPLY_GAP.row) : 54, hh = places.sup.dir === 'row' ? 54 : half(sn, SUPPLY_GAP.column);
      groups.push({ g: 'sup', box: { left: places.sup.x - hw, right: places.sup.x + hw, top: places.sup.y - hh, bottom: places.sup.y + hh }, label: 'Supply' });
    }
  }

  return (
    <>
      <canvas ref={canvas} style={{ position: 'absolute', left: 0, top: 0, width, height, pointerEvents: 'none', zIndex: 20 }} />
      {marquee ? <div style={{ position: 'absolute', left: marquee.left, top: marquee.top, width: marquee.right - marquee.left, height: marquee.bottom - marquee.top, border: '1px solid rgba(224,181,99,0.8)', background: 'rgba(224,181,99,0.08)', zIndex: 22, pointerEvents: 'none' }} /> : null}
      {/* Labels under the control dice; each is also that die's keyboard handle (Tab, then Enter). */}
      {ready && showDice ? actions.map((a) => (
        <button key={a.key} type="button" className="rk-die-label" ref={setLabel(a.key)} disabled={a.disabled} aria-label={a.label} onClick={() => { if (!a.disabled) a.onPress(); }} style={{ ...labelStyle, color: hoverKey === a.key ? T.ivory : a.disabled ? 'rgba(147,142,136,0.5)' : T.muted }}>{a.label}</button>
      )) : null}
      {ready && deckArt && showDice ? (
        <button type="button" className="rk-die-label" ref={setLabel(CAT)} aria-label={`Decks. ${currentDeck?.label ?? ''}, ${currentDeck?.count ?? 0} cards. Choose a deck`} aria-haspopup="listbox"
          onClick={() => { const s = engine?.state(CAT); playSfx('floatMenuOpen'); setRing(s ? { x: s.x, y: s.y } : { x: 74, y: height - 88 }); }}
          style={{ ...labelStyle, color: hoverKey === CAT ? T.ivory : T.goldText }}>{currentDeck?.label ?? ''}<span style={{ color: T.muted, marginLeft: 6 }}>{currentDeck?.count ?? ''}</span></button>
      ) : null}
      {/* The supply's markings: what each one throws out. */}
      {ready ? props.supply.map((t) => (
        <div key={t.key} ref={setLabel(t.token.kind === 'die' && t.token.dieType === 'duality' ? `${t.key}:h` : t.token.kind === 'die' && t.token.dieType === 'd100' ? `${t.key}:t` : t.key)} style={{ ...labelStyle, fontSize: 10.5, letterSpacing: 0.9, color: hoverKey && baseOf(hoverKey) === t.key ? T.ivory : T.muted, textTransform: t.token.kind === 'die' ? 'none' : 'uppercase' }}>{t.label}</div>
      )) : null}
      {ready && props.domat ? <div ref={setLabel(DOMAT_KEY)} style={{ ...labelStyle, fontSize: 10.5, letterSpacing: 0.9, color: hoverKey === DOMAT_KEY ? T.ivory : T.muted }}>MANY THINGS <span style={{ color: T.goldText }}>{props.domat.left}</span></div> : null}
      {/* Plain buttons instead of dice (or when there is no WebGL), so nothing is lost. */}
      {controls === 'buttons' || (failed && controls === 'dice') ? (
        <div data-ui="" ref={(el) => { if (el && (el.offsetWidth !== btnBox.w || el.offsetHeight !== btnBox.h)) setBtnBox({ w: el.offsetWidth, h: el.offsetHeight }); }} style={{ position: 'absolute', left: Math.min(bounds.right - btnBox.w - 6, Math.max(bounds.left + 6, places.ctl.x - btnBox.w / 2)), top: Math.min(bounds.bottom - btnBox.h - 6, Math.max(bounds.top + 6, places.ctl.y - btnBox.h / 2)), display: 'flex', flexDirection: places.ctl.dir === 'row' ? 'row' : 'column', gap: 8, zIndex: 21 }}>
          <TButton label={currentDeck ? `${currentDeck.label} ${currentDeck.count}` : 'Decks'} onPress={() => setRing({ x: places.ctl.x, y: places.ctl.y })} icon={<Glyph d={DIE_GLYPHS.cards} size={15} />} />
          {actions.map((a) => <TButton key={a.key} label={a.label} onPress={a.onPress} disabled={a.disabled} />)}
        </div>
      ) : null}
      {groups.map((g) => <GroupHandle key={g.g} {...g} dir={g.g === 'ctl' ? places.ctl.dir : g.g === 'sup' ? places.sup.dir : undefined} onMove={(x, y) => props.onMoveGroup(g.g, x, y)} onFlip={g.g === 'cat' ? undefined : () => props.onFlipGroup(g.g as 'ctl' | 'sup')} />)}
      {/* The decks' glyphs, drawn once off-screen to be read back as pictures for the die. */}
      <div ref={glyphHost} aria-hidden="true" style={{ position: 'absolute', left: -10000, top: 0, width: 1, height: 1, overflow: 'hidden' }}>
        {decks.map((d) => <div key={d.key} data-deck={d.key} style={{ width: 48, height: 48 }}><CategoryGlyph category={d.key} meta={d.meta} /></div>)}
      </div>
      {ring ? <DeckRing at={ring} width={width} height={height} decks={decks} current={current} onPick={(c) => { setRing(null); if (c !== current) onPickDeck(c); }} onClose={() => { playSfx('floatMenuClose'); setRing(null); }} /> : null}
    </>
  );
});

/** A dashed frame round a row while settings are open: drag it to move the row, the arrows stand it on end. */
function GroupHandle({ box, label, dir, onMove, onFlip }: { box: Bounds; label: string; dir?: 'row' | 'column'; onMove: (x: number, y: number) => void; onFlip?: () => void }) {
  const [hover, setHover] = useState(false);
  const start = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    const cx = (box.left + box.right) / 2, cy = (box.top + box.bottom) / 2;
    const move = (m: PointerEvent) => onMove(cx + m.clientX - sx, cy + m.clientY - sy);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); playSfx('cardDragEnd', { volume: 0.5 }); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    playSfx('cardDragStart', { volume: 0.5 });
  };
  return (
    <div data-ui="" onPointerDown={start} onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}
      style={{ position: 'absolute', left: box.left, top: box.top, width: box.right - box.left, height: box.bottom - box.top, zIndex: 1250, cursor: 'move', border: `1.5px dashed ${hover ? T.goldBright : 'rgba(224,181,99,0.6)'}`, background: hover ? 'rgba(224,181,99,0.1)' : 'rgba(224,181,99,0.04)', boxSizing: 'border-box' }}>
      <div style={{ position: 'absolute', left: 0, ...(box.top < 30 ? { top: '100%', marginTop: 4 } : { top: -24 }), display: 'flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap' }}>
        <span style={{ color: T.goldText, fontFamily: T.bold, fontSize: 11.5, letterSpacing: 1, textTransform: 'uppercase', textShadow: '0 1px 3px #000' }}>{label}</span>
        {onFlip ? (
          <button type="button" title={dir === 'row' ? 'Stand the row on end' : 'Lay the row across'} aria-label={dir === 'row' ? `Run the ${label} down` : `Run the ${label} across`} onPointerDown={(e) => e.stopPropagation()} onClick={() => { playSfx('buttonTap', { volume: 0.5 }); onFlip(); }}
            style={{ all: 'unset', cursor: 'pointer', display: 'flex', padding: 2, background: T.panel, border: `1px solid ${T.goldSoft}` }}>
            <span style={{ display: 'flex', transform: dir === 'row' ? 'rotate(90deg)' : 'none' }}><Glyph d='<path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4"/>' size={14} /></span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

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

/** What a rolled die is, for a drop onto a card (it becomes that card's token die). */
export function rolledToken(d: PoolDie): TokenInfo {
  return d.side ? { kind: 'die', dieType: 'duality', dieValue: d.value ?? 1, dieValue2: 1 } : { kind: 'die', dieType: d.type, dieValue: d.value ?? 1 };
}

/** A token as engine pieces: a chip, one die, or a pair side by side (Hope and Fear; a percentile's tens and units). */
function tokenSpecs(t: TokenPiece, finish: Finish): { spec: DieSpec; face?: number; dx: number }[] {
  if (t.kind === 'chip') {
    return [{ spec: { key: t.key, shape: 'chip', size: 40 * t.scale, body: t.color ?? '#9A6B3C', edge: t.color ?? '#9A6B3C', ink: '#000', faces: [{ text: '' }], finish: 'stone' }, dx: 0 }];
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
 * The decks, in a straight column beside the deck die, opening towards the middle of the table. Every tile is
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
      <div data-ui="" onPointerDown={(e) => { e.stopPropagation(); onClose(); }} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }} style={{ position: 'absolute', inset: 0, zIndex: 40 }} />
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
