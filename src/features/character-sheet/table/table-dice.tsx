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
import { DIE_COLOR, DIE_INK, type DieType, FEAR_INK, FEAR_PURPLE, HOPE_GOLD, HOPE_INK, kindScale, tokenElement, tokenFill, type TokenKind } from '../components/card-tokens-data';
import type { PoolDie } from '@/lib/dice-pool';
import type { PresetModifier } from '@/lib/dice-presets';
import { playSynth } from '@/lib/sfx';
import type { CardCategory } from '../card-data';
import { CategoryGlyph } from '../sheet/deck-toggle-icon';
import { createFireLayer, type FireLayer } from './piece-fire';
import type { DiceEngine, DieSpec, Finish, Shape, Walls } from './dice-engine';
import type { Bounds, Impact, Obstacle } from './dice-physics';
import { loadDicePlaces, saveDicePlaces } from './table-store';
import { Glyph, DIE_GLYPHS, glyphImage, type GlyphKey, T, TButton, tinted } from './table-ui';
import { cue, knockCue } from './table-sound';

export type ActionKey = 'cards' | 'state' | 'sort';
export interface TableAction { key: ActionKey; label: string; onPress: () => void; disabled?: boolean }
export interface TableDeck { key: CardCategory; label: string; count: number; meta?: { icon?: string; builtin: boolean } }

/** What a token is: a sewing-button token (wood, bone, iron, a colour) or a token die and its value. */
export type CritStage = 'gather' | 'rumble' | 'word' | 'boom' | 'done';
export interface TokenInfo { kind: TokenKind; color?: string; dieType?: DieType; dieValue?: number; dieValue2?: number; /** A die's modifier, carried from card to card (v0.47.18). */ mod?: PresetModifier; /** How many times a die's usual size it is: the chest's giant d20 (v0.47.24). */ big?: number }
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
  /** An element token (v0.47.19). */
  element?: 'fire' | 'ice' | 'water' | 'spark';
}

/** A card laid on the table, as the engine sees it. */
export interface CardPose { key: string; x: number; y: number; w: number; h: number; rot: number; phys: boolean }

/** Where each row of pieces lives (px, the centre of the row). */
export interface Places { ctl: { x: number; y: number; dir: 'row' | 'column'; /** The control dice's size (spacing grows with it). */ k?: number }; sup: { x: number; y: number; dir: 'row' | 'column' }; cat: { x: number; y: number }; /** Pieces split off their row, each where it was put (px). */ apart?: Record<string, { x: number; y: number }> }
export type PlaceGroup = 'ctl' | 'sup' | 'cat';

export interface TableDiceHandle {
  /** Throw these dice from (x, y); resolves with the faces that came to rest on top. */
  /** `rig`: the faces the dice land on, in order (testing: Roll a crit, v0.47.27). */
  roll: (dice: PoolDie[], from: { x: number; y: number }, rig?: number[]) => Promise<PoolDie[]>;
  /** Roll the dice among these pieces where they lie (tokens are left alone); resolves with what they show. */
  rollPieces: (keys: string[], power?: number, burning?: boolean) => Promise<PoolDie[]>;
  clearRoll: () => void;
  /** Send every control die and the supply home. */
  resetHome: () => void;
  /** Every loose piece and rolled die flies back into the supply and is gone. */
  tidy: () => void;
  /** These pieces (by base key) fly back into the supply as the tidy sends them, and are gone (v0.47.21). */
  putAway: (bases: string[]) => void;
  openDecks: (at: { x: number; y: number }) => void;
  hasRoll: () => boolean;
  /** A laid card was lifted: carry what lies loose on it (null when it is let go). */
  carry: (card: { cx: number; cy: number; w: number; h: number; rot: number } | null) => void;
  carryBy: (dx: number, dy: number) => void;
  selected: () => string[];
  select: (keys: string[]) => void;
  engine: () => DiceEngine | null;
  /**
   * Dress pieces differently where they lie (the Deck of Many Things' lasting cards: stone, an element, small), or
   * back as they were (null).
   */
  restyle: (keys: string[], dress: ((s: DieSpec) => Partial<DieSpec>) | null) => void;
  /** Turn these dice to their highest faces where they lie (the Star), and count them like a roll. */
  wish: (keys: string[]) => void;
  /** Roll a die where it lies (from the table menu). */
  rollPiece: (key: string) => void;
}

const CAT = 'cat';
const ACTION_SIZE = 58;
const ACTIONS: ActionKey[] = ['cards', 'state', 'sort'];
const GLYPH: Record<ActionKey, GlyphKey> = { cards: 'cards', state: 'state', sort: 'sort' };
const ROLL_SIZE: Record<string, number> = { d4: 62, d6: 54, d8: 58, d10: 58, d12: 62, d20: 68, d100: 56, duality: 64 };
const TOKEN_DIE_SIZE = 46;
/** A token or die on a card: one on a card in the hand, or the piece of one on the table. */
export type CardTok = { key: string } | { ref: string; id: string };

/** One of every die, as the dice chest offers them. */
const DIE_KINDS: DieType[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100', 'duality'];
const FACES_OF: Record<Shape, number> = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20 };
/**
 * Room each supply piece takes, centre to centre, in a row and in a column (each has its label under it). The die's
 * slot fits the widest it can be, Hope and Fear side by side, so the row never shifts as the wheel turns it (owner,
 * v0.47.11: it sat on top of its neighbours).
 */
const slotOf = (key: string, dir: 'row' | 'column') => (key === 'src:die' ? (dir === 'row' ? 128 : 96) : key === DOMAT_KEY ? (dir === 'row' ? 86 : 100) : dir === 'row' ? 72 : 90);
/** Half the length of a full supply row (all four), for keeping it on the table. */
export const SUPPLY_HALF = { row: (72 * 2 + 128 + 86) / 2, column: (90 * 2 + 96 + 100) / 2 };
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
  const o = (i - (n - 1) / 2) * CTL_GAP[p.ctl.dir] * Math.max(1, p.ctl.k ?? 1);
  return p.ctl.dir === 'row' ? { x: p.ctl.x + o, y: p.ctl.y } : { x: p.ctl.x, y: p.ctl.y + o };
}
/** Each supply piece's home, the same way. */
export function supHome(p: Places, i: number, keys: string[]): { x: number; y: number } {
  const slots = keys.map((k) => slotOf(k, p.sup.dir));
  const o = slots.slice(0, i).reduce((a, b) => a + b, 0) + slots[i] / 2 - slots.reduce((a, b) => a + b, 0) / 2;
  return p.sup.dir === 'row' ? { x: p.sup.x + o, y: p.sup.y } : { x: p.sup.x, y: p.sup.y + o };
}

/** A token as the piece description the engine specs are built from. */
function pieceOf(key: string, t: TokenInfo): TokenPiece {
  return { key, card: '', lx: 0, ly: 0, kind: t.kind === 'die' ? 'die' : 'chip', dieType: t.dieType, value: t.dieValue, value2: t.dieValue2, color: tokenFill(t), scale: kindScale(t.kind) * (t.big ?? 1), element: tokenElement(t.kind) };
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
  /** Control dice roll like dice, or hop upright (owner, v0.47.7). */
  ctlMotion: 'roll' | 'hop';
  /** The control dice's and the deck die's size, against their usual one. */
  ctlSize: number;
  catSize: number;
  numberFinish: 'resin' | 'stone' | 'metal';
  /** Tokens anchored to laid cards, and the laid cards themselves. */
  tokens: TokenPiece[];
  cards: CardPose[];
  /** Physical cards moved (to draw them there) or came to rest (to keep where). */
  onCardsMoved: (moved: { key: string; x: number; y: number; rot: number }[], rested: string[]) => void;
  supply: SupplyPiece[];
  /** The Deck of Many Things in the supply: cards left, and seconds until it can be drawn from again (null: not on the table). */
  /** The Deck of Many Things: cards in stock, and seconds until the next grows (0 when full). */
  domat: { stock: number; wait: number } | null;
  /** Draw from the Deck of Many Things (`held`: pulled off it by a drag, into the hand at that point). */
  onDomatDraw: (from: { x: number; y: number }, held?: { x: number; y: number }) => void;
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
  /**
   * A token or die on a card (owner, v0.47.18), on a card in the hand (`ref` and `id`) or one on the table (its piece's
   * `key`): clicked (a die rolls a copy onto the table, the die stays), held till it breaks (gone), right clicked.
   */
  onTokenClick?: (t: CardTok, clientX: number, clientY: number) => void;
  onTokenRemove?: (t: CardTok, clientX: number, clientY: number) => void;
  onTokenMenu?: (t: CardTok, clientX: number, clientY: number) => void;
  /** Right click on the table (and on a piece: what can be done to it, here rolling a die). */
  onTableMenu: (clientX: number, clientY: number, piece?: { key: string; label: string; /** A control die: the row is its own action, and the menu has no rolls. */ own?: boolean }) => void;
  /** The marquee picked these pieces (empty: nothing selected). */
  onSelect: (keys: string[]) => void;
  /** Something hit a wall hard (px/s): shake the table. */
  onHardHit: (speed: number) => void;
  /** Hope and Fear came up equal: the blast went off from here (table px). */
  /**
   * A critical's sequence (v0.47.27), stage by stage at the point the pair stands: `gather` (the table stops, the pair
   * flies to the middle), `rumble` (it builds and shakes), `word` (CRITICAL), `boom` (the blast), `done`.
   */
  onCrit?: (at: { x: number; y: number }, stage: CritStage) => void;
  /** Good news on a die (Hope winning, a highest face): a glow of light round it, never a shake (owner, v0.47.18). */
  onGood?: (at: { x: number; y: number }, tint: string, big: boolean) => void;
  /** A charged die slammed down here (v0.47.18). */
  onPound?: (at: { x: number; y: number }) => void;
  /** A die or token struck the physical carousel this hard (px/s) (v0.47.25). */
  onCarouselHit?: (speed: number, charged: boolean, wall: string) => void;
  /** A water token hit a wall hard and sent a wave across the table from here (v0.47.19). */
  onSplash?: (at: { x: number; y: number }) => void;
  /** A charged throw broke these loose pieces or physical cards (the first where `at` is); they are gone from the table. */
  onBreak?: (keys: string[], at: { x: number; y: number }, fire: boolean, first: boolean, hits: Impact[]) => void;
  /** A burning throw's first hit is held for `ms` (the whole table with it when `strong`): its light. */
  onHitStop?: (at: { x: number; y: number }, ms: number, strong: boolean, cold?: boolean) => void;
  /** Two pieces knocked together (the Deck of Many Things' elements read who met whom). */
  onKnock?: (a: string, b: string) => void;
  /** Selected dice carried and thrown together landed (owner, v0.47.12): counted like a roll. */
  onGroupRolled?: (landed: PoolDie[]) => void;
  /** A mimic was right-clicked: it spits out what it swallowed. */
  onMimic?: (key: string) => void;
  /** The supply and the control dice go back to their places after a knock (owner, v0.47.12). */
  autoReturn?: boolean;
  /**
   * The supply's die is a chest (owner, v0.47.12), drawn as this model: a click and it spits out one of every die,
   * held still in a fan; the one grabbed (or the selection grabbed) is kept and the rest dissolve.
   */
  diceChest?: 'mimic' | 'chest' | null;
  /** Dice offered by the chest and not kept: gone (their loose entries go too). */
  onDiscard?: (bases: string[]) => void;
  /** A soft puff where a piece dissolved (table px). */
  onMist?: (x: number, y: number) => void;
  /**
   * The playground (owner, v0.47.12): the control dice are only dice (no labels, no actions, no deck picking) and
   * nothing goes back to its place by itself.
   */
  toys?: boolean;
  /** A piece is being carried over this point (screen px), or put down (null): the hand lights the card under it. */
  onDragPiece?: (clientX: number | null, clientY?: number) => void;
  /** Every loose piece went back into the supply. */
  onTidied: () => void;
  /** Settings are open: everything goes home and each row can be dragged somewhere else. */
  editing: boolean;
  /** Pieces hidden from play (owner, v0.47.14): gone from the table except while editing. */
  hidden?: string[];
  /** Pieces locked where they stand (owner, v0.47.17): never lifted, never moved; a control die still answers a click. */
  locked?: string[];
  onLock?: (keys: string[]) => void;
  /** Hide these pieces, or show them again when they are all hidden already. */
  onHide?: (keys: string[]) => void;
  onMoveGroup: (g: PlaceGroup, x: number, y: number) => void;
  onFlipGroup: (g: 'ctl' | 'sup') => void;
  /** Split a row into pieces placed on their own (from where each lies now, px), or join them back into it. */
  onSplitGroup: (g: 'ctl' | 'sup', at: Record<string, { x: number; y: number }>) => void;
  onJoinGroup: (g: 'ctl' | 'sup') => void;
  /** A piece split off its row, dragged somewhere else (px). */
  onMovePiece: (key: string, x: number, y: number) => void;
  /** A panel is open: the pieces stay where they are and take no clicks. */
  inert: boolean;
  /** The deck menu's New category. */
  onNewCategory?: () => void;
  /** Everything the table draws is ready (models, icons, pieces): said once. */
  onReady?: () => void;
}>(function TableDice(props, ref) {
  const { host, width, height, bounds, obstacles, walls, decks, current, onPickDeck, actions, controls, controlFinish, numberFinish, tokens, inert, places, editing } = props;
  const hid = editing ? [] : props.hidden ?? [];
  const hidKey = hid.join('|');
  // While editing they go home and follow their frames like the rest, so the lock holds only at play.
  const nailedKeys = editing ? [] : props.locked ?? [];
  const lockKey = nailedKeys.join('|');
  const canvas = useRef<HTMLCanvasElement>(null);
  const [engine, setEngine] = useState<DiceEngine | null>(null);
  const [failed, setFailed] = useState(false);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [ring, setRing] = useState<{ x: number; y: number } | null>(null);
  const [marquee, setMarquee] = useState<Bounds | null>(null);
  /** The ring that fills while a token on a card is held, till it breaks (v0.47.18). */
  const holdRing = useRef<HTMLDivElement>(null);
  /** Pieces on fire: held twice as long as the full shake, until they come to rest. */
  /** Pieces ablaze (thrown burning, or caught in the hand): they burn until they come to rest. */
  const [burning, setBurning] = useState<string[]>([]);
  const fireRef = useRef<FireLayer | null>(null);
  const [btnBox, setBtnBox] = useState({ w: 0, h: 0 });
  const labels = useRef(new Map<string, HTMLElement>());
  const glyphHost = useRef<HTMLDivElement>(null);
  const [deckArt, setDeckArt] = useState<Map<string, HTMLImageElement> | null>(null);
  const live = useRef(props);
  live.current = props;
  /** What an element token does when it hits something (set further down, once the helpers it uses exist). */
  const elemRef = useRef<(hit: Impact) => void>(() => {});
  /**
   * The rolls waiting for their dice to land, each read exactly once (owner, v0.47.28: a hard throw was announced
   * twice, the critical played twice over). Several can wait at once; a die thrown again belongs to its new throw.
   */
  type Waiting = { keys: Set<string>; done: () => void; drop: () => void };
  const pending = useRef(new Set<Waiting>());
  /** These dice have landed (or broken): every roll left with none to wait for is read. */
  const landedKeys = (keys: string[]) => {
    for (const w of [...pending.current]) {
      for (const k of keys) w.keys.delete(k);
      if (!w.keys.size) { pending.current.delete(w); w.done(); }
    }
  };
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
        if (__DEV__) (globalThis as { __rkEngine?: DiceEngine }).__rkEngine = e;
        e.onImpact((hit: Impact) => {
          if (hit.kind === 'pound') return;
          elemRef.current(hit);
          // A die charged with lightning hits walls all the time: softly, or its knocks drown everything (v0.47.19).
          if (!knockCue(hit.kind, sparked.current.has(hit.key) ? hit.speed * 0.3 : hit.speed)) void import('./dice-engine').then((m) => m.knock(playSynth, hit));
          if (hit.kind === 'rail' && hit.speed > 2400) live.current.onHardHit(hit.speed);
          if (hit.other) live.current.onKnock?.(hit.key, hit.other);
          if (hit.wall?.startsWith('carousel')) live.current.onCarouselHit?.(hit.speed, !!hit.charged, hit.wall);
        });
        // A charged die's time is up: it slams down where it is, the lightning goes out of it (v0.47.18).
        e.onPound((key, at) => {
          sparked.current.delete(key);
          setBurning((b) => b.filter((k) => k !== key));
          cue('impact:stop', 'loseArmor', { volume: 0.55 });
          e.impulse(at.x, at.y, 170, 1500, undefined, [key, CAT, ...ACTIONS, ...e.keys().filter((k) => !/^(free|roll):/.test(k))]);
          live.current.onPound?.(at);
        });
        e.onHitStop((at, ms, strong, cold) => {
          cue('impact:stop', 'loseArmor', { volume: 0.9, cents: cold ? 300 : -900 });
          live.current.onHitStop?.(at, ms, strong, cold);
        });
        e.onBreak((keys, at, burning, first, hits) => {
          // A pair breaks whole; a broken die no longer holds up a roll waiting for it to land.
          const all = [...new Set(keys.flatMap((k) => e.keys().filter((x) => baseOf(x) === baseOf(k))).concat(keys))];
          for (const k of all) { if (e.has(k)) e.shatter(k); rolled.current.delete(k); rolling.current.delete(k); }
          landedKeys(all);
          setBurning((b) => (b.some((k) => all.includes(k)) ? b.filter((k) => !all.includes(k)) : b));
          cue('piece:break', 'loseArmor', { volume: burning ? 0.75 : 0.55, cents: Math.round(Math.random() * 400 - 200) });
          live.current.onBreak?.(all, at, burning, first, hits);
        });
        setEngine(e);
      })
      .catch(() => { if (!dead) setFailed(true); });
    return () => { dead = true; eng?.dispose(); };
  }, []);

  useEffect(() => { engine?.resize(width, height); }, [engine, width, height]);
  // The fire over the table (one canvas for every burning piece).
  useEffect(() => {
    if (!engine || !host) return;
    const f = createFireLayer(host, (k) => engine.screen(k));
    fireRef.current = f;
    return () => { f?.dispose(); fireRef.current = null; };
  }, [engine, host]);
  const lit = useRef(new Set<string>());
  /** Of the pieces ablaze, those frozen instead (v0.47.18): they show frost, not fire; and those charged with lightning. */
  const frozen = useRef(new Set<string>());
  const sparked = useRef(new Set<string>());
  useEffect(() => {
    const f = fireRef.current;
    if (!f) return;
    for (const k of burning) f.set(k, 1, frozen.current.has(k) ? true : sparked.current.has(k) ? 'spark' : false);
    for (const k of lit.current) if (!burning.includes(k)) { f.set(k, 0); frozen.current.delete(k); sparked.current.delete(k); }
    lit.current = new Set(burning);
  }, [burning]);
  /** An element token's own particles while it lies loose (v0.47.26: only particles; the full effect is for a charge). */
  const auraOf = (k: string) => (k.startsWith('free:') ? tokenElement(live.current.loose.find((l) => l.key === baseOf(k))?.token.kind ?? 'wood') ?? null : null);
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
  /** The supply's row, in order: material, colour, the Deck of Many Things; the die spawner too unless it is the chest. */
  const supRow = () => [...live.current.supply.map((s) => s.key).filter((k) => !(k === 'src:die' && live.current.diceChest)), ...(live.current.domat ? [DOMAT_KEY] : [])];
  const homeOf = useCallback((key: string): { x: number; y: number } | null => {
    const p = live.current.places;
    const b = boundsRef.current;
    const clamp = (h: { x: number; y: number }) => ({ x: Math.min(b.right - 34, Math.max(b.left + 34, h.x)), y: Math.min(b.bottom - 34, Math.max(b.top + 34, h.y)) });
    if (key === CAT) return clamp(p.cat);
    const ai = ACTIONS.indexOf(key as ActionKey);
    if (ai >= 0) return clamp(p.apart?.[key] ?? ctlHome(p, ai));
    const base = baseOf(key);
    const sup = supRow();
    // The dice chest stands on its own (owner, v0.47.17): just past the end of the row unless it was put elsewhere.
    if (base === 'src:die' && live.current.diceChest) {
      if (p.apart?.['src:die']) return clamp(p.apart['src:die']);
      const half = sup.reduce((a, k) => a + slotOf(k, p.sup.dir), 0) / 2 + 80;
      return clamp(p.sup.dir === 'row' ? { x: p.sup.x + half, y: p.sup.y } : { x: p.sup.x, y: p.sup.y + half });
    }
    const si = sup.indexOf(base);
    if (si >= 0) {
      const h = p.apart?.[base] ?? supHome(p, si, sup);
      // A pair stands side by side, as far apart as a spawned pair (tokenSpecs' dx).
      const off = key.endsWith(':h') || key.endsWith(':t') ? -TOKEN_DIE_SIZE * 0.55 : key.endsWith(':f') || key.endsWith(':u') ? TOKEN_DIE_SIZE * 0.55 : 0;
      return clamp(p.sup.dir === 'row' ? { x: h.x + off, y: h.y } : { x: h.x + off, y: h.y });
    }
    return null;
  }, []);
  /** Where a piece was left, else its home. */
  const placeOf = useCallback((key: string) => {
    const pl = loadDicePlaces()[key];
    const b = boundsRef.current;
    const { width: W, height: H } = size.current;
    if (pl && Number.isFinite(pl.fx) && Number.isFinite(pl.fy) && !live.current.editing) {
      const at = { x: Math.min(b.right - 30, Math.max(b.left + 30, pl.fx * W)), y: Math.min(b.bottom - 30, Math.max(b.top + 30, pl.fy * H)) };
      // Where it was left is now inside the hand's own area (the layout changed since): it goes home instead.
      if (!live.current.obstacles.some((o) => at.x > o.left && at.x < o.right && at.y > o.top && at.y < o.bottom)) return at;
    }
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
  // The layout itself changed (another table preset): every row goes to where the new layout keeps it, instead of
  // the pieces staying where the last layout left them.
  const lastPlaces = useRef(placesKey);
  useEffect(() => {
    if (lastPlaces.current === placesKey) return;
    lastPlaces.current = placesKey;
    if (!editing) sendHome();
  }, [placesKey, engine]); // eslint-disable-line react-hooks/exhaustive-deps

  const returns = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  /**
   * Knocked or thrown away, the supply and the control dice find their way back after a moment (owner, v0.47.12).
   * Whatever lies in its spot is pushed out of the way as it comes, so it is not shoved off again on landing.
   */
  const returnLater = (k: string, restart: boolean) => {
    const engine = engineRef.current;
    if (!engine || !live.current.autoReturn || live.current.toys || live.current.editing) return;
    if (k !== CAT && !ACTIONS.includes(k as ActionKey) && !k.startsWith('src:')) return;
    if (!restart && returns.current.has(k)) return;
    const h = homeOf(k), s = engine.state(k);
    if (!h || !s || Math.hypot(s.x - h.x, s.y - h.y) < 12) return;
    clearTimeout(returns.current.get(k));
    returns.current.set(k, setTimeout(() => {
      returns.current.delete(k);
      const now = engine.state(k), h2 = homeOf(k);
      if (!now?.asleep || !h2 || live.current.toys || Math.hypot(now.x - h2.x, now.y - h2.y) < 12) return;
      engine.impulse(h2.x, h2.y, (engine.screen(k)?.size ?? 60) * 0.9 + 30, 520, undefined, homeKeys());
      engine.home(k, h2.x, h2.y, k === CAT ? deckFaceRef.current.indexOf(live.current.current) : ACTIONS.includes(k as ActionKey) ? 0 : undefined);
    }, 1300));
  };
  // A piece shoved off its spot while asleep never comes to rest again, so the rest above never sees it (owner,
  // v0.47.22: one landing on a token in its slot was pushed aside and stayed there): look every so often as well.
  useEffect(() => {
    if (!engine) return;
    const id = setInterval(() => { for (const k of homeKeys()) returnLater(k, false); }, 1500);
    return () => clearInterval(id);
  }, [engine]); // eslint-disable-line react-hooks/exhaustive-deps -- returnLater reads only refs
  // Rests: a roll resolves, a right-click roll acts, and where the home pieces lie is remembered.
  useEffect(() => {
    if (!engine) return;
    engine.onRest((keys) => {
      setBurning((b) => (b.some((k) => keys.includes(k)) ? b.filter((k) => !keys.includes(k)) : b));
      landedKeys(keys);
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
      // Knocked or thrown away, the supply and the control dice find their way back after a moment (owner, v0.47.12).
      for (const k of keys) returnLater(k, true);
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
  }, [engine, homeOf]); // eslint-disable-line react-hooks/exhaustive-deps -- returnLater reads only refs

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
      if (!showDice || hid.includes(k)) { engine.remove(k); continue; }
      const img = glyphs.get(GLYPH[k]);
      if (!img) continue;
      // The icon on the top face and the one opposite it only (owner); the sides stay plain, and the die always
      // comes to rest on one of the two, so its icon is always showing.
      const icon = { image: tinted(img, style.ink) };
      const spec: DieSpec = { key: k, shape: 'd6', size: ACTION_SIZE * props.ctlSize, body: style.body, edge: style.edge, ink: style.ink, faces: [icon, icon, { text: '' }, { text: '' }, { text: '' }, { text: '' }], finish: controlFinish, upright: true, restFaces: [0, 1], hopper: props.ctlMotion === 'hop', fixed: nailedKeys.includes(k) };
      const at = placeOf(k);
      engine.add(spec, at.x, at.y, { face: 0 });
    }
  }, [engine, glyphs, showDice, controlFinish, props.ctlMotion, props.ctlSize, width > 50, hidKey, lockKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const deckFace = useMemo(() => {
    const n = FACES_OF[catShape(decks.length)];
    const faces = Array.from({ length: n }, (_, i) => decks[i % Math.max(1, decks.length)]);
    return { n, faces, indexOf: (c: CardCategory) => Math.max(0, faces.findIndex((d) => d?.key === c)) };
  }, [decks]);
  const deckFaceRef = useRef(deckFace);
  deckFaceRef.current = deckFace;

  useEffect(() => {
    if (!engine || !deckArt || !decks.length || width < 50) return;
    if (!showDice || hid.includes(CAT)) { engine.remove(CAT); return; }
    const shape = catShape(decks.length);
    // The icons keep their own colours; on a light die a soft dark halo separates them (owner: no plate).
    const halo = controlFinish === 'obsidian' ? undefined : 'rgba(10,8,4,0.9)';
    const spec: DieSpec = {
      key: CAT, shape, size: (shape === 'd20' ? 112 : shape === 'd12' ? 100 : shape === 'd8' ? 94 : 84) * props.catSize, body: style.body, edge: style.edge, ink: style.ink, finish: controlFinish, upright: true, hopper: props.ctlMotion === 'hop', fixed: nailedKeys.includes(CAT),
      faces: deckFace.faces.map((d) => (d && deckArt.get(d.key) ? { image: deckArt.get(d.key)!, halo } : { text: '' })),
    };
    const fresh = !engine.has(CAT);
    const at = placeOf(CAT);
    engine.add(spec, at.x, at.y, { face: deckFace.indexOf(live.current.current) });
    if (!fresh) engine.setFace(CAT, deckFace.indexOf(live.current.current));
  }, [engine, deckArt, deckFace, showDice, controlFinish, props.ctlMotion, props.catSize, width > 50, hidKey, lockKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (hid.includes(t.key)) return;
      if (t.key === 'src:die' && props.diceChest) {
        want.add('src:die');
        const sig = `chest:${props.diceChest}`;
        const fresh = !engine.has('src:die');
        if (!fresh && built.current.get('src:die') === sig) return;
        built.current.set('src:die', sig);
        const at = fresh ? placeOf('src:die') : { x: 0, y: 0 };
        engine.add({ key: 'src:die', shape: props.diceChest, size: 78, body: '#8a5a2b', edge: '#E0B563', ink: '#000', faces: [], finish: 'stone', spawner: true, fixed: true }, at.x, at.y);
        return;
      }
      for (const sp of tokenSpecs(pieceOf(t.key, t.token), numberFinish)) {
        want.add(sp.spec.key);
        const sig = `${t.token.kind}:${t.token.color ?? ''}:${t.token.dieType ?? ''}:${numberFinish}:${nailedKeys.includes(t.key)}`;
        const fresh = !engine.has(sp.spec.key);
        if (!fresh && built.current.get(sp.spec.key) === sig) continue;
        built.current.set(sp.spec.key, sig);
        const at = fresh ? placeOf(sp.spec.key) : { x: 0, y: 0 };
        engine.add({ ...sp.spec, spawner: true, fixed: nailedKeys.includes(t.key) }, at.x, at.y, { face: sp.face });
      }
    });
    if (props.domat && backArt && !hid.includes(DOMAT_KEY)) {
      want.add(DOMAT_KEY);
      if (!engine.has(DOMAT_KEY) || built.current.get(DOMAT_KEY) !== `lock:${nailedKeys.includes(DOMAT_KEY)}`) {
        built.current.set(DOMAT_KEY, `lock:${nailedKeys.includes(DOMAT_KEY)}`);
        const at = engine.has(DOMAT_KEY) ? { x: 0, y: 0 } : placeOf(DOMAT_KEY);
        engine.add({ key: DOMAT_KEY, shape: 'deck', size: 50, body: '#1c1026', edge: '#d9c9a3', ink: '#000', faces: [{ image: backArt }], finish: 'stone', spawner: true, fixed: nailedKeys.includes(DOMAT_KEY) }, at.x, at.y);
      }
    }
    for (const k of engine.keys()) if (k.startsWith('src:') && !want.has(k)) { engine.remove(k); built.current.delete(k); }
  }, [engine, supplyKey, numberFinish, backArt, props.diceChest, hidKey, lockKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // The chest's dice made ahead, once the table is up and still (owner, v0.47.22: its first open stalled on them).
  useEffect(() => {
    if (!engine || !props.diceChest) return;
    const t = setTimeout(() => engine.warm(DIE_KINDS.flatMap((type) => tokenSpecs(pieceOf(`free:warm-${type}`, { kind: 'die', dieType: type, dieValue: 1, dieValue2: type === 'duality' ? 1 : undefined }), numberFinish).map((x) => x.spec))), 1500);
    return () => clearTimeout(t);
  }, [engine, props.diceChest, numberFinish]);
  /** Pieces flying into the chest or the supply, until they are off the loose list too. */
  const leaving = useRef(new Set<string>());
  const leave = (keys: string[], ms: number) => { for (const k of keys) leaving.current.add(k); setTimeout(() => { for (const k of keys) leaving.current.delete(k); }, ms + 400); };
  // Loose tokens: added where they were left, removed when they go onto a card or back to the supply.
  const looseKey = props.loose.map((t) => `${t.key}:${t.token.kind}:${t.token.dieType ?? ''}:${t.token.color ?? ''}`).join('|');
  useEffect(() => {
    if (!engine) return;
    const want = new Set<string>();
    for (const t of props.loose) {
      for (const sp of tokenSpecs(pieceOf(t.key, t.token), numberFinish)) {
        want.add(sp.spec.key);
        // One on its way into the chest or the supply is gone from the engine before it is gone from the list: never
        // made again where it lay (owner, v0.47.25: it flickered there for a frame).
        if (!engine.has(sp.spec.key) && !leaving.current.has(sp.spec.key)) engine.add(sp.spec, t.x + sp.dx, t.y, { face: sp.face, pop: true });
      }
    }
    for (const k of engine.keys()) if (k.startsWith('free:') && !want.has(k)) engine.remove(k);
  }, [engine, looseKey, numberFinish]); // eslint-disable-line react-hooks/exhaustive-deps
  const looseSig = props.loose.map((t) => `${t.key}:${t.token.kind}`).join('|');
  useEffect(() => {
    const f = fireRef.current;
    if (!f || !engine) return;
    // After the loose pieces are on the table (a glow on a piece not there yet is dropped at once). Set once each comes onto the table (and again whenever the set changes); a burning one keeps its fire.
    for (const k of engine.keys()) { const a = auraOf(k); if (a) f.aura(k, a); }
  }, [engine, looseSig]);
  /** Pieces a lifted card is carrying. */
  const carried = useRef<string[]>([]);
  /** The dice the chest is offering (their base keys), held still until one is chosen. */
  const offered = useRef<string[]>([]);
  /** Offered dice not chosen dissolve: a soft puff, each shrinking up and away, then gone. */
  const dissolve = useCallback((bases: string[]) => {
    const e = engineRef.current;
    if (!e || !bases.length) return;
    bases.forEach((base, i) => {
      for (const k of e.keys().filter((x) => baseOf(x) === base)) {
        const s = e.state(k);
        if (!s) continue;
        e.unpin([k]);
        e.vanish(k, s.x + (Math.random() - 0.5) * 30, s.y - 50, i * 35);
        setTimeout(() => live.current.onMist?.(s.x, s.y), i * 35);
      }
    });
    setTimeout(() => live.current.onDiscard?.(bases), bases.length * 35 + 750);
    cue('chest:dissolve', 'floatMenuClose', { volume: 0.5, cents: 600 });
  }, []);

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
    // Also once a hidden piece comes back (v0.47.17: its label was left in the corner, tied to the die that went).
    for (const [k, el] of labels.current) engine.label(k, el);
  }, [engine, glyphs, deckArt, showDice, controlFinish, supplyKey, hidKey]);

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
  /**
   * Which way a copy leaves a spawner: towards the open middle of the table, give or take, so copies spread over the
   * felt instead of piling against the wall behind the supply (owner, v0.47.5).
   */
  const outward = useCallback((x: number, y: number) => {
    const b = boundsRef.current;
    return Math.atan2((b.top + b.bottom) / 2 - y, (b.left + b.right) / 2 - x) + (Math.random() - 0.5) * 1.8;
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
  const fling = useCallback((key: string, speed: number, boost?: { gen: number; power: number }, aim?: number, breaker?: { left: number; fire: boolean; strike?: boolean; cold?: boolean }) => {
    const e = engineRef.current;
    if (!e) return;
    const ang = aim ?? Math.random() * Math.PI * 2;
    for (const k of partsOf(key)) e.toss(k, Math.cos(ang + (Math.random() - 0.5) * 0.2) * speed, Math.sin(ang + (Math.random() - 0.5) * 0.2) * speed, boost, breaker);
    if (key.startsWith('free:')) watchLoose(key);
  }, [partsOf, watchLoose]);

  /** When each element token may act again (ms): one wave or one arc at a time, never a storm of them. */
  const elemCool = useRef(new Map<string, number>());
  elemRef.current = (hit) => {
    const e = engineRef.current;
    if (!e || (hit.kind !== 'rail' && hit.kind !== 'die')) return;
    const elOf = (k?: string) => (k?.startsWith('free:') ? tokenElement(live.current.loose.find((l) => l.key === baseOf(k))?.token.kind ?? 'wood') : undefined);
    const now = performance.now();
    const ready = (k: string) => { if ((elemCool.current.get(k) ?? 0) > now) return false; elemCool.current.set(k, now + 650); return true; };
    // Never the control dice, the supply or the deck: only what is loose on the felt.
    const fixed = e.keys().filter((k) => !/^(free|roll):/.test(k));
    // Water off a wall (owner, v0.47.19): a wave washes everything loose near that wall away from it.
    if (hit.kind === 'rail' && hit.speed > 420 && elOf(hit.key) === 'water' && ready(hit.key)) {
      const at = e.state(hit.key);
      if (!at) return;
      e.impulse(at.x, at.y, 380, Math.min(1500, 650 + hit.speed * 0.3), undefined, [hit.key, ...fixed]);
      cue('element:water', 'gearScroll1', { volume: 0.75 });
      live.current.onSplash?.({ x: at.x, y: at.y });
      return;
    }
    // Lightning knocking into something: it arcs to the nearest few loose pieces, and they jump (a die lands anew).
    if (hit.kind === 'die' && hit.speed > 300) {
      const src = elOf(hit.key) === 'spark' ? hit.key : elOf(hit.other) === 'spark' ? hit.other! : null;
      if (!src || !ready(src)) return;
      const at = e.state(src);
      if (!at) return;
      const seen = new Set<string>([baseOf(src)]);
      const near = e.keys().filter((k) => k.startsWith('free:'))
        .map((k) => ({ k, s: e.state(k) }))
        .filter((q): q is { k: string; s: NonNullable<typeof q.s> } => !!q.s && Math.hypot(q.s.x - at.x, q.s.y - at.y) < 300)
        .sort((p, q) => Math.hypot(p.s.x - at.x, p.s.y - at.y) - Math.hypot(q.s.x - at.x, q.s.y - at.y))
        .filter((q) => { if (seen.has(baseOf(q.k))) return false; seen.add(baseOf(q.k)); return true; })
        .slice(0, 3);
      for (const q of near) {
        fireRef.current?.arc(at.x, at.y, q.s.x, q.s.y, 280);
        const a = Math.random() * Math.PI * 2, sp = 320 + Math.random() * 320;
        for (const k of partsOf(q.k)) e.toss(k, Math.cos(a) * sp, Math.sin(a) * sp);
        watchLoose(q.k);
      }
      if (near.length) {
        cue('domat:elements', 'gearScroll1', { volume: 0.55 });
        fireRef.current?.spike(src, 'spark');
        // The flare passes, back to its sparks alone.
        setTimeout(() => { if (!lit.current.has(src)) fireRef.current?.set(src, 0); }, 60);
      }
    }
  };

  // ---------------------------------------------------------------- right click: roll it where it lies
  const rollInPlace = useCallback((key: string) => {
    const e = engineRef.current;
    if (!e) return;
    cue('piece:reroll', 'gearScroll1', { volume: 0.3 });
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
      if (!piece || piece.kind !== 'die') { cue('piece:bump', 'placeToken', { volume: 0.4 }); return; }
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

  /** What the table menu offers for a piece right-clicked: rolling it, when it is a die. */
  const pieceMenu = useCallback((key: string): { key: string; label: string; own?: boolean } | undefined => {
    // A control die offers only what it does (owner, v0.47.11), never a roll.
    if (key === CAT) return { key, label: 'Choose a deck', own: true };
    const own: Record<ActionKey, string> = { cards: 'Open cards menu', state: 'Open state menu', sort: 'Sort the deck' };
    if (ACTIONS.includes(key as ActionKey)) return { key, label: own[key as ActionKey], own: true };
    if (key.startsWith('roll:')) return { key, label: 'Roll this die' };
    const base = baseOf(key);
    if (key.startsWith('free:') && live.current.loose.find((l) => l.key === base)?.token.kind === 'die') return { key, label: 'Roll this die' };
    return undefined;
  }, []);

  // ---------------------------------------------------------------- the pointer: buttons, then pieces, then cards
  const inertRef = useRef(inert);
  inertRef.current = inert;
  useEffect(() => {
    if (!host || !engine) return;
    let press: {
      key: string; x: number; y: number; t: number; moved: boolean; id: number; spawned: boolean; charge: number;
      /** Not lifted yet (a control die waits for a drag). */ deferred?: { x: number; y: number };
      /** Swung round fast while held (owner, v0.47.11): it shakes, then catches fire, and throws far harder. */ swing: number;
      /** How fast the hand moves (px/s, smoothed), and when it last moved. */ hand: number; last: { x: number; y: number; t: number }; lit: boolean;
      /** Caught by holding it still: frozen, not burning (owner, v0.47.18). */ cold?: boolean;
      /** A swung bundle, charged with lightning (owner, v0.47.18). */ zap?: boolean;
    } | null = null;
    /** The right button held on a spawner: copies come out faster and faster until it is let go. */
    let spawning: { id: number; timer?: ReturnType<typeof setTimeout> } | null = null;
    let chargeRaf = 0;
    let box: { x: number; y: number; id: number } | null = null;
    let menuUntil = 0;
    let thrownCat = false;
    const local = (e: { clientX: number; clientY: number }) => {
      const r = host.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onUi = (t: EventTarget | null) => !!(t as HTMLElement)?.closest?.('button, input, [role="menu"], [role="dialog"], [role="listbox"], [data-ui]');
    /** Held still this long, a piece starts shaking; this much longer and it launches itself (owner, v0.47.5). */
    // Held still it freezes, and faster than a swing sets it alight (owner, v0.47.18).
    const CHARGE_DELAY = 380, CHARGE_MS = 850;
    // Tokens, dice and the control dice (owner, v0.47.10); never a spawner, whose hold only spawns faster.
    /** Locked where it stands (owner, v0.47.17): it is clicked, never lifted. */
    const nailed = (k: string) => !live.current.editing && (live.current.locked ?? []).includes(baseOf(k));
    const chargeable = (k: string) => (k.startsWith('free:') || k.startsWith('roll:') || k === CAT || ACTIONS.includes(k as ActionKey)) && !nailed(k);
    /** The spawner under a point, with a few px to spare round each one (a right click there spawns, never a menu). */
    const spawnerAt = (x: number, y: number): string | null => {
      let best: string | null = null, bd = Infinity;
      for (const k of engine.keys()) {
        if (!k.startsWith('src:')) continue;
        const st = engine.state(k);
        if (!st) continue;
        const d = Math.hypot(st.x - x, st.y - y);
        if (d < 44 && d < bd) { best = k; bd = d; }
      }
      return best;
    };
    /**
     * A token or die pressed on a card (owner, v0.47.18): it comes before the card. Let go where it was, it is a click;
     * moved, it comes off into the hand; held still, it shakes, a ring fills, and it breaks.
     */
    let tokPress: { key?: string; ref?: string; id?: string; x: number; y: number; px: number; py: number; t: number; pid: number } | null = null;
    let holdRaf = 0;
    const HOLD_MS = 800;
    const tokOf = (tp: NonNullable<typeof tokPress>): CardTok => (tp.key ? { key: baseOf(tp.key) } : { ref: tp.ref!, id: tp.id! });
    const ringAt = (tp: { px: number; py: number } | null, k = 0) => {
      const el = holdRing.current;
      if (!el) return;
      el.style.opacity = tp && k > 0 ? '1' : '0';
      if (!tp) return;
      el.style.transform = `translate(${tp.px - 30}px, ${tp.py - 30}px)`;
      el.style.background = `conic-gradient(rgba(214,46,40,0.95) ${Math.round(k * 360)}deg, rgba(253,252,247,0.16) 0)`;
    };
    const endTok = () => {
      if (holdRaf) cancelAnimationFrame(holdRaf);
      holdRaf = 0;
      if (tokPress?.key) shakeAll(tokPress.key, 0);
      tokPress = null;
      ringAt(null);
    };
    const holdTick = () => {
      holdRaf = 0;
      const tp = tokPress;
      if (!tp) return;
      const k = Math.max(0, Math.min(1, (performance.now() - tp.t - CHARGE_DELAY) / HOLD_MS));
      if (tp.key) shakeAll(tp.key, k);
      ringAt(tp, k);
      if (k >= 1) {
        const t = tokOf(tp);
        const key = tp.key;
        endTok();
        if (key) for (const part of partsOf(key)) if (engine.has(part)) engine.shatter(part);
        live.current.onTokenRemove?.(t, tp.x, tp.y);
        return;
      }
      holdRaf = requestAnimationFrame(holdTick);
    };
    /** Shake a piece and its partner together. */
    const shakeAll = (key: string, v: number) => { for (const k of partsOf(key)) engine.jitter(k, v); };
    /** How far a held piece has caught (0 none, 1 ablaze), for it and its partner. */
    // Put out, an element token goes back to its own glow.
    const heat = (key: string, v: number) => { for (const k of partsOf(key)) fireRef.current?.set(k, v); };
    const elOf = (k: string) => (k.startsWith('free:') ? tokenElement(live.current.loose.find((l) => l.key === baseOf(k))?.token.kind ?? 'wood') : undefined);
    /** What a charge turns into: an element token always its own element (owner, v0.47.22), else fire swung and frost held. */
    const lookOf = (key: string, held: boolean): boolean | 'spark' => { const el = elOf(key); return el === 'fire' ? false : el === 'ice' || el === 'water' ? true : el === 'spark' ? 'spark' : held; };
    const glow = (key: string, v: number, look: boolean | 'spark') => { for (const k of partsOf(key)) fireRef.current?.set(k, look === 'spark' ? v * 0.65 : v, look); };
    /** It caught, as fire, frost or lightning: cranked to the max with its sound. */
    const catchOn = (pr: NonNullable<typeof press>, look: boolean | 'spark') => {
      const parts = partsOf(pr.key);
      pr.lit = true;
      if (look === true) { pr.cold = true; for (const k of parts) frozen.current.add(k); }
      if (look === 'spark') for (const k of parts) sparked.current.add(k);
      spike(parts, look);
      setBurning((b) => [...new Set([...b, ...parts])]);
      if (look === false) cue('piece:ignite', 'gainGoldenHp', { volume: 0.6, cents: 900 });
      else cue('piece:charge', 'gainGoldenHp', { volume: 0.55, cents: look === true ? 1500 : 700 });
    };
    /** While a charge builds it only glows a little (owner, v0.47.20): the full effect waits for the moment it catches. */
    const TINY = 0.16;
    const tiny = (v: number) => Math.min(TINY, Math.max(0, v) * TINY);
    /** It caught: the effect cranked to the max at once, with its sound. */
    const spike = (keys: string[], cold: boolean | 'spark') => { for (const k of keys) fireRef.current?.spike(k, cold); };
    /** Still on the table: a die or token, or a physical card (the engine's `has` knows only the dice). */
    const present = (k: string) => engine.has(k) || (k.startsWith('card:') && !!engine.state(k));
    /** Lift a piece; the other of a pair comes along beside it (owner, v0.47.11: Hope and Fear are pulled together). */
    const lift = (key: string, x: number, y: number) => {
      engine.grab(key, x, y);
      // A selected piece carries the whole selection with it (owner, v0.47.12: thrown together, it counts as a roll).
      const sel = selection.current.filter((k) => k !== key && present(k));
      const mate = partsOf(key).find((k) => k !== key) ?? (key.startsWith('roll:') ? pairOf(key) : undefined);
      if (selection.current.includes(key) && sel.length) { engine.tether(key, sel, mate && sel.includes(mate) ? mate : undefined); return; }
      if (mate) engine.tether(key, mate);
    };
    /** A rolled die's partner (the Hope die's Fear die), by the pool die they share. */
    const pairOf = (key: string) => {
      const d = rolled.current.get(key);
      if (!d?.pairId) return undefined;
      for (const [k, o] of rolled.current) if (k !== key && o.pairId === d.pairId && engine.has(k)) return k;
      return undefined;
    };
    const fire = (pr: { key: string }, power: number, burning = false, cold = false) => {
      shakeAll(pr.key, 0);
      engine.release();
      cue(burning ? 'throw:fire' : 'throw:charged', power > 0.6 ? 'gainGoldenHp' : 'gearScroll1', { volume: 0.3 + power * 0.45, cents: Math.round(power * 600 + (burning ? (cold ? 1400 : 500) : 0)) });
      // Launched pieces push harder, and what they hit pushes on, five generations deep; a burning one far harder.
      if (burning && !cold) {
        setBurning((b) => [...new Set([...b, ...partsOf(pr.key)])]);
        // On fire it passes through what it meets and breaks every loose piece on the way, till it slows.
        fling(pr.key, 9600, { gen: 5, power: 6 }, undefined, { left: 99, fire: true });
        live.current.onHardHit(6000);
        return;
      }
      // Without fire it goes straight for a loose piece in reach, picked at random (owner, v0.47.16), and its first
      // break is held as an impact frame; with nothing in reach it flies off any way. It breaks two pieces at most.
      const at = engine.state(pr.key);
      const mine = partsOf(pr.key);
      // One of the three nearest (owner, v0.47.18), a physical card among them: near, but never always the same one.
      const seen = new Set<string>();
      const prey = at ? [...engine.keys(), ...engine.cardKeys()]
        .filter((k) => (k.startsWith('free:') || k.startsWith('roll:') || k.startsWith('card:')) && !mine.includes(k))
        .map((k) => ({ k, s: engine.state(k) }))
        .filter((q): q is { k: string; s: NonNullable<typeof q.s> } => !!q.s && Math.hypot(q.s.x - at.x, q.s.y - at.y) < 620)
        .sort((p1, p2) => Math.hypot(p1.s.x - at.x, p1.s.y - at.y) - Math.hypot(p2.s.x - at.x, p2.s.y - at.y))
        .filter((q) => { const b = baseOf(q.k); if (seen.has(b)) return false; seen.add(b); return true; })
        .slice(0, 3) : [];
      const target = prey.length ? prey[Math.floor(Math.random() * prey.length)].s : null;
      const aim = at && target ? Math.atan2(target.y - at.y, target.x - at.x) : undefined;
      // Frozen, it goes for one of them as hard as fire goes, breaking what it meets, its hit held cold (v0.47.18).
      if (cold) {
        for (const k of partsOf(pr.key)) frozen.current.add(k);
        setBurning((b) => [...new Set([...b, ...partsOf(pr.key)])]);
        fling(pr.key, 9600, { gen: 5, power: 6 }, aim, { left: 99, fire: true, strike: true, cold: true });
        live.current.onHardHit(6000);
        return;
      }
      fling(pr.key, 1100 + Math.pow(power, 1.3) * 7900, { gen: 5, power: 1 + 2.5 * power }, aim, power > 0.15 ? { left: 2, fire: false, strike: aim !== undefined } : undefined);
    };
    const isDie = (k: string) => engine.has(k) && (k.startsWith('roll:') || (k.startsWith('free:') && live.current.loose.find((l) => l.key === baseOf(k))?.token.kind === 'die'));
    /**
     * What a swing charges with lightning: the dice of a swung selection (never its tokens or cards), or a die swung on
     * its own, both halves of a pair (owner, v0.47.19: a die grabbed alone is as good as selected; only tokens burn).
     */
    const zapKeys = (key: string) => (bundled(key) ? selection.current.filter(isDie) : isDie(key) ? partsOf(key).filter((k) => engine.has(k)) : []);
    /** The loose tokens of the selection held with this piece (never its dice or cards). */
    const bundleToks = (key: string) => (bundled(key) ? selection.current.filter((k) => engine.has(k) && k.startsWith('free:') && !isDie(k)) : []);
    /** Held as one of a selection of several: it carries the rest with it and never catches fire. */
    const bundled = (key: string) => selection.current.includes(key) && selection.current.filter(present).length > 1;
    /** Swing speeds (px/s): below SLOW the swing runs down; the faster above it, the faster it builds. */
    const SWING_SLOW = 900, SWING_FULL = 2600, SWING_MS = 1100;
    /** The swing builds and decays; at 2 the piece catches fire in the hand. Called every frame while it is held. */
    const swingTick = (pr: NonNullable<typeof press>, dt: number) => {
      const now = performance.now();
      if (now - pr.last.t > 90) pr.hand *= Math.pow(0.5, dt / 60);
      const rate = Math.min(1.6, Math.max(0, (pr.hand - SWING_SLOW) / (SWING_FULL - SWING_SLOW)));
      if (!pr.lit) pr.swing = rate > 0 ? Math.min(2, pr.swing + (dt / SWING_MS) * rate) : Math.max(0, pr.swing - dt / 900);
      shakeAll(pr.key, pr.lit ? 1 : Math.min(1, pr.swing));
      // A swung group never catches fire (owner, v0.47.16); its dice gather lightning instead (owner, v0.47.18), the
      // tokens and cards in it none.
      if (__DEV__) (globalThis as { __rkSwing?: unknown }).__rkSwing = { hand: Math.round(pr.hand), swing: +pr.swing.toFixed(2), lit: pr.lit, zap: !!pr.zap };
      const zs = zapKeys(pr.key);
      if (bundled(pr.key) || zs.length) {
        // The selection's tokens catch too (owner, v0.47.26: as a group of dice does), each in its own way: fire, or
        // its element.
        const toks = bundleToks(pr.key);
        if (!pr.lit) {
          for (const k of zs) fireRef.current?.set(k, tiny((pr.swing - 0.35) / 1.65) * 0.65, 'spark');
          for (const k of toks) glow(k, tiny((pr.swing - 0.35) / 1.65), lookOf(k, false));
        }
        if (!pr.lit && pr.swing >= 2 && (zs.length || toks.length)) {
          pr.lit = true;
          pr.zap = zs.length > 0;
          for (const k of zs) sparked.current.add(k);
          if (zs.length) spike(zs, 'spark');
          for (const k of toks) {
            const lk = lookOf(k, false);
            if (lk === true) frozen.current.add(k);
            if (lk === 'spark') sparked.current.add(k);
            spike([k], lk);
          }
          setBurning((b) => [...new Set([...b, ...zs, ...toks])]);
          cue('piece:charge', 'gainGoldenHp', { volume: 0.6, cents: zs.length ? 700 : 900 });
        }
        return;
      }
      // The fire shows as the swing builds, well before it is fully alight (owner, v0.47.11).
      const look = lookOf(pr.key, false);
      if (!pr.lit) glow(pr.key, tiny((pr.swing - 0.35) / 1.65), look);
      if (__DEV__) (globalThis as { __rkSwing?: unknown }).__rkSwing = { hand: Math.round(pr.hand), swing: +pr.swing.toFixed(2), lit: pr.lit, look };
      if (!pr.lit && pr.swing >= 2) catchOn(pr, look);
    };
    let lastTick = 0;
    const tick = () => {
      chargeRaf = 0;
      const pr = press;
      if (!pr || !chargeable(pr.key)) return;
      const now = performance.now();
      const dt = Math.min(50, now - (lastTick || now));
      lastTick = now;
      if (pr.moved) {
        if (!pr.deferred) swingTick(pr, dt);
        chargeRaf = requestAnimationFrame(tick);
        return;
      }
      const held = performance.now() - pr.t - CHARGE_DELAY;
      if (held > 0) {
        // Up to the full shake, then held on through it: at twice that it catches fire and goes off by itself.
        pr.charge = Math.min(2, held / CHARGE_MS);
        shakeAll(pr.key, Math.min(1, pr.charge));
        // It smoulders from early in the shake and is alight by 1.3; let go then and it goes burning. At 2 it goes off
        // by itself (owner, v0.47.11: the fire has to show well before the launch).
        if (!pr.lit && !bundled(pr.key)) glow(pr.key, tiny((pr.charge - 0.3) / 1.0), lookOf(pr.key, true));
        if (!pr.lit && !bundled(pr.key) && pr.charge >= 1.3) catchOn(pr, lookOf(pr.key, true));
        if (pr.charge >= 2) { press = null; host.style.cursor = 'grab'; fire(pr, 1, pr.lit, pr.cold); return; }
      }
      chargeRaf = requestAnimationFrame(tick);
    };
    /** The dice chest opens and spits out one of every die, in a fan towards the open table, held still. */
    let lastOffer = 0;
    const offer = (at: { x: number; y: number }) => {
      // Clicked over and over, it opens once (v0.47.17: spamming it froze dice mid-flight and shoved the chest away).
      const now = performance.now();
      if (now - lastOffer < 700) return;
      lastOffer = now;
      // Its dice still out and none taken: it eats them back instead (owner, v0.47.19).
      if (offered.current.length) { eat(at); return; }
      // Its mouth stays open while its dice are out (owner, v0.47.19), and shuts once they are taken or eaten.
      engine.mimic('src:die', 1);
      const b = boundsRef.current;
      const a0 = Math.atan2((b.top + b.bottom) / 2 - at.y, (b.left + b.right) / 2 - at.x);
      // First it clears the ground (owner, v0.47.17): every loose die and token near it is pushed outward, out of the
      // fan's way. The control dice stay where they are, held still while it all flies (v0.47.18: a hopping control
      // die knocked by a pushed or landing die jumped).
      // The Deck of Many Things too, and long enough for everything thrown to have come to rest (owner, v0.47.18).
      engine.pin([CAT, ...ACTIONS, DOMAT_KEY].filter((k) => engine.has(k)), 4000);
      for (const k of engine.keys()) {
        if (!k.startsWith('free:') && !k.startsWith('roll:')) continue;
        const st = engine.state(k);
        if (!st) continue;
        const dx = st.x - at.x, dy = st.y - at.y, d = Math.hypot(dx, dy) || 1;
        if (d > 440) continue;
        const sp = 600 + 1300 * (1 - d / 440);
        engine.toss(k, (dx / d) * sp, (dy / d) * sp);
      }
      // Then the fan: laid out by each die's own width along the arc, a pair's two halves side by side, with room
      // between kinds, so nothing touches when they land (owner, v0.47.17: the pairs bumped their neighbours).
      const made = DIE_KINDS.map((type) => {
        const k = spawn({ kind: 'die', dieType: type, dieValue: 1, dieValue2: type === 'duality' ? 1 : undefined }, at.x, at.y);
        offered.current.push(baseOf(k));
        return partsOf(k).sort();
      });
      // Kinds well apart (owner, v0.47.18: still too close together); a pair's two halves nearer than that, with a little
      // room, so they read as one and never land on each other and push apart (owner: they split on landing).
      // v0.47.19: the size was read while they were still popping in at a third of it, so a pair stood far too close and
      // pushed apart on landing. Now by their real size: a pair's centres just clear of touching, kinds well apart.
      const s = TOKEN_DIE_SIZE, PAIR = Math.round(s * 0.86 + 14), KIND = s + 40;
      const slots = made.flatMap((parts) => parts.map((part, j) => ({ part, s, step: j < parts.length - 1 ? PAIR : KIND })));
      const offs: number[] = [];
      slots.reduce((run, q) => { offs.push(run); return run + q.step; }, 0);
      const L = offs[offs.length - 1] ?? 0;
      // The arc is turned and widened until every die lands on the felt, clear of what stands there; squeezing it into
      // the walls is what bunched them up when it opened towards an edge (v0.47.18).
      const made0 = new Set(made.flat());
      const standing = engine.keys().filter((k) => !made0.has(k)).map((k) => engine.screen(k)).filter((q): q is NonNullable<typeof q> => !!q);
      const M = 44;
      const fan = (turn: number, R: number) => slots.map((q, i) => {
        const ang = a0 + turn + (offs[i] - L / 2) / R;
        return { part: q.part, x: at.x + Math.cos(ang) * R, y: at.y + Math.sin(ang) * R, r: q.s / 2 };
      });
      const misses = (pts: ReturnType<typeof fan>) => pts.reduce((n, q) => n
        + (q.x < b.left + M || q.x > b.right - M || q.y < b.top + M || q.y > b.bottom - M ? 3 : 0)
        + (live.current.obstacles.some((o) => q.x > o.left - q.r && q.x < o.right + q.r && q.y > o.top - q.r && q.y < o.bottom + q.r) ? 3 : 0)
        + standing.filter((o) => Math.hypot(o.x - q.x, o.y - q.y) < o.size / 2 + q.r + 6).length, 0);
      let best = fan(0, Math.max(240, L / 2.2)), worst = misses(best);
      for (const R of [Math.max(240, L / 2.2), L / 1.8, L / 1.5, L / 1.25, L, L * 1.5]) {
        for (const turn of [0, 0.2, -0.2, 0.4, -0.4, 0.65, -0.65, 0.9, -0.9, 1.2, -1.2, 1.6, -1.6]) {
          if (!worst) break;
          const pts = fan(turn, R), n = misses(pts);
          if (n < worst) { best = pts; worst = n; }
        }
      }
      const pinned: string[] = [];
      for (const q of best) {
        engine.home(q.part, Math.min(b.right - M, Math.max(b.left + M, q.x)), Math.min(b.bottom - M, Math.max(b.top + M, q.y)));
        pinned.push(q.part);
      }
      // Landed, they stay put until chosen; one already taken is never pinned (that froze it in mid-flight).
      setTimeout(() => engine.pin(pinned.filter((k) => engine.has(k) && offered.current.includes(baseOf(k)) && !selection.current.includes(k)), 3_600_000), 950);
      cue('chest:open', 'cardFullscreenEnter', { volume: 0.6, cents: 300 });
    };
    /**
     * Clicked again with its dice still out: one after another they fly back to it, shrinking into its mouth, and it
     * shuts on them (owner, v0.47.19). Any of them selected is kept and stays where it is.
     */
    const eat = (at: { x: number; y: number }) => {
      const sel = new Set(selection.current.map(baseOf));
      const back = offered.current.filter((o) => !sel.has(o));
      const keep = offered.current.filter((o) => sel.has(o));
      engine.unpin(keep.flatMap((k) => partsOf(k)));
      offered.current = [];
      const STEP = 85;
      back.forEach((base, i) => {
        for (const k of partsOf(base)) {
          engine.unpin([k]);
          engine.vanish(k, at.x + (Math.random() - 0.5) * 10, at.y + 4, i * STEP);
        }
      });
      // Each die a short pip as it goes in, rising as they go (owner, v0.47.20); the mouth shuts without a sound of its own.
      back.forEach((_, i) => setTimeout(() => cue('chest:stow', 'gearScroll1', { volume: 0.4, cents: Math.min(1400, -200 + i * 140) }), i * STEP + 520));
      const done = back.length * STEP + 650;
      leave(back.flatMap((b) => partsOf(b)), done);
      setTimeout(() => engine.mimic('src:die', 0), done - 120);
      setTimeout(() => live.current.onDiscard?.(back), done);
    };
    /**
     * Where a die comes out of the chest: just in front of it, towards the open table, never inside it (owner, v0.47.25:
     * one made in the middle of it was pushed out any side, and stuck against the wall behind it or at its sides).
     */
    const mouthOf = (at: { x: number; y: number }, big: number) => {
      const b = boundsRef.current;
      const ang = Math.atan2((b.top + b.bottom) / 2 - at.y, (b.left + b.right) / 2 - at.x) + (Math.random() - 0.5) * 0.7;
      const d = 78 * 0.43 + (TOKEN_DIE_SIZE * big) / 2 + 8, r = (TOKEN_DIE_SIZE * big) / 2 + 2;
      return { ang, x: Math.min(b.right - r, Math.max(b.left + r, at.x + Math.cos(ang) * d)), y: Math.min(b.bottom - r, Math.max(b.top + r, at.y + Math.sin(ang) * d)) };
    };
    /** Nothing to take: the chest shudders. */
    const refuse = () => { engine.jitter('src:die', 0.5); setTimeout(() => engine.jitter('src:die', 0), 300); cue('domat:empty', 'cardDisable', { volume: 0.4 }); };
    /**
     * Right click (owner, v0.47.24): the chest swallows every die on the table, one after another, and spits out a
     * single d20 rolled across the table, bigger the more it ate.
     */
    const feast = () => {
      const at = engine.state('src:die');
      if (!at) return;
      const bases = [...new Set(engine.keys().filter((k) => isDie(k) && !leaving.current.has(k)).map(baseOf))];
      if (!bases.length) { refuse(); return; }
      const keys = engine.keys().filter((k) => bases.includes(baseOf(k)));
      for (const k of keys) fireRef.current?.set(k, 0);
      setBurning((bs) => bs.filter((k) => !keys.includes(k)));
      offered.current = [];
      selection.current = selection.current.filter((k) => !keys.includes(k));
      live.current.onSelect(selection.current);
      engine.mimic('src:die', 1);
      engine.unpin(keys);
      const STEP = Math.max(30, Math.min(90, 900 / bases.length));
      bases.forEach((base, i) => {
        for (const k of keys.filter((x) => baseOf(x) === base)) engine.vanish(k, at.x + (Math.random() - 0.5) * 10, at.y + 4, i * STEP);
        setTimeout(() => cue('chest:stow', 'gearScroll1', { volume: 0.4, cents: Math.min(1600, -300 + i * 90) }), i * STEP + 520);
      });
      const done = bases.length * STEP + 700;
      leave(keys, done);
      setTimeout(() => {
        for (const k of keys) rolled.current.delete(k);
        live.current.onDiscard?.(bases.filter((x) => x.startsWith('free:')));
        const now = engine.state('src:die') ?? at;
        // About a sixth bigger for every die eaten, up to three and a half times a die.
        const big = Math.min(3.5, 1 + 0.17 * bases.length);
        const m = mouthOf(now, big);
        const k = spawn({ kind: 'die', dieType: 'd20', dieValue: 1, big }, m.x, m.y);
        fling(k, 1300 + big * 250, { gen: 3, power: 1 + big }, m.ang);
        // Read as a roll once the table knows it (the loose list catches up a render later).
        setTimeout(() => settle.current([k]), 80);
        cue('mimic:pop', 'cardFullscreenEnter', { volume: 0.8, cents: Math.round(-200 * big) });
        live.current.onHardHit(1500 + big * 1200);
        setTimeout(() => { if (!offered.current.length) engine.mimic('src:die', 0); }, 500);
      }, done);
    };
    /** Grabbed from the offer: this one (or every offered piece in the selection) is kept, the rest dissolve. */
    const choose = (base: string) => {
      const sel = new Set(selection.current.map(baseOf));
      const keep = sel.has(base) ? offered.current.filter((o) => sel.has(o)) : [base];
      engine.unpin(keep.flatMap((k) => partsOf(k)));
      dissolve(offered.current.filter((o) => !keep.includes(o)));
      offered.current = [];
      engine.mimic('src:die', 0);
    };
    const spawnOne = (key: string) => {
      const at = engine.state(key);
      if (!at) return;
      if (key === DOMAT_KEY) { live.current.onDomatDraw({ x: at.x, y: at.y }); return; }
      // Right click on the chest: it swallows the table's dice for one giant d20 (owner, v0.47.24).
      if (key === 'src:die' && live.current.diceChest) { feast(); return; }
      const src = live.current.supply.find((t) => t.key === baseOf(key));
      if (!src) return;
      fling(spawn(src.token, at.x, at.y), 900 + Math.random() * 500, undefined, outward(at.x, at.y));
      cue('spawner:toss', 'placeToken', { volume: 0.4, cents: 200 + Math.random() * 300 });
    };
    const onDown = (e: PointerEvent) => {
      if (inertRef.current || onUi(e.target)) return;
      const p = local(e);
      if (e.button === 2) {
        // Right button: on a spawner it spawns (held, faster and faster); anywhere else the menu opens.
        const sk = spawnerAt(p.x, p.y);
        if (!sk) return;
        e.stopPropagation();
        e.preventDefault();
        menuUntil = performance.now() + 60000;
        spawnOne(sk);
        // The deck gives one card a minute and the chest one fan at a time: holding them gives nothing more.
        if (sk === DOMAT_KEY || (sk === 'src:die' && live.current.diceChest)) { spawning = { id: e.pointerId }; return; }
        let delay = 300;
        const again = () => {
          spawnOne(sk);
          delay = Math.max(35, delay * 0.8);
          if (spawning) spawning.timer = setTimeout(again, delay);
        };
        spawning = { id: e.pointerId, timer: setTimeout(again, delay) };
        try { host.setPointerCapture(e.pointerId); } catch { /* gone */ }
        return;
      }
      const key = engine.hit(p.x, p.y);
      // A token or die on a card, in the hand or on the table, physical or not, comes before the card (owner, v0.47.18).
      const tokEl = key ? null : (e.target as HTMLElement).closest?.('[data-card-token]') as HTMLElement | null;
      if (e.button === 0 && (key?.startsWith('tok:') || tokEl)) {
        e.stopPropagation();
        e.preventDefault();
        try { host.setPointerCapture(e.pointerId); } catch { /* gone */ }
        tokPress = { key: key ?? undefined, ref: tokEl?.dataset.cardToken, id: tokEl?.dataset.tokenId, x: e.clientX, y: e.clientY, px: p.x, py: p.y, t: performance.now(), pid: e.pointerId };
        host.style.cursor = 'grabbing';
        holdRaf = requestAnimationFrame(holdTick);
        return;
      }
      if (!key) {
        // The empty felt: drag a box to select pieces.
        const felt = e.target === host || (e.target as HTMLElement).dataset?.felt !== undefined;
        if (felt && e.button === 0) {
          box = { x: p.x, y: p.y, id: e.pointerId };
          try { host.setPointerCapture(e.pointerId); } catch { /* gone */ }
        }
        return;
      }
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      // Shift-click adds a piece to the selection, or takes it out, without picking it up (owner, v0.47.17): so several
      // of a chest's dice can be chosen before the rest go.
      if (e.shiftKey && (key.startsWith('free:') || key.startsWith('roll:'))) {
        const parts = partsOf(key);
        const has = parts.every((k) => selection.current.includes(k));
        const next = has ? selection.current.filter((k) => !parts.includes(k)) : [...new Set([...selection.current, ...parts])];
        selection.current = next;
        engine.select(next);
        live.current.onSelect(next);
        cue('select', 'cardSelect', { volume: 0.5 });
        return;
      }
      if (key === 'src:die' && live.current.diceChest) { const at = engine.state(key); if (at) offer(at); return; }
      if (offered.current.includes(baseOf(key))) choose(baseOf(key));
      try { host.setPointerCapture(e.pointerId); } catch { /* gone */ }
      let grabbed = key;
      let spawned = false;
      if (key.startsWith('src:') && key !== DOMAT_KEY) {
        const src = live.current.supply.find((t) => t.key === baseOf(key));
        const at = engine.state(key);
        if (!src || !at) return;
        grabbed = spawn(src.token, at.x, at.y);
        spawned = true;
        cue('spawner:take', 'placeToken', { volume: 0.6, cents: 200 });
      }
      // A control die is not picked up by a click (owner, v0.47.10: clicks nudged it): only a drag lifts it.
      const isControl = grabbed === CAT || ACTIONS.includes(grabbed as ActionKey);
      press = { key: grabbed, x: e.clientX, y: e.clientY, t: performance.now(), moved: false, id: e.pointerId, spawned, charge: 0, deferred: isControl ? p : undefined, swing: 0, hand: 0, last: { x: e.clientX, y: e.clientY, t: performance.now() }, lit: false };
      // The Deck of Many Things never moves like a piece (owner, v0.47.11): a click draws, a drag pulls a card out.
      if (grabbed === DOMAT_KEY) press.deferred = p;
      else if (!isControl) lift(grabbed, p.x, p.y);
      lastTick = 0;
      host.style.cursor = 'grabbing';
      cue('piece:grab', 'placeToken', { volume: 0.35, cents: 300 });
      if (chargeable(grabbed) && !chargeRaf) chargeRaf = requestAnimationFrame(tick);
    };
    /** A token pulled off a hand card, shown flat under the cursor until its 3D piece is made. */
    let ghost: { el: HTMLDivElement; info: TokenInfo; x: number; y: number; pid: number; tx: number; ty: number; t: number; last: { x: number; y: number; t: number }; raf: number; timer: number } | null = null;
    const placeGhost = () => { if (ghost) Object.assign(ghost.el.style, { left: `${ghost.x}px`, top: `${ghost.y}px` }); };
    /** The 3D piece takes over from the stand-in where the cursor is now, already in the hand. */
    const landGhost = () => {
      const g = ghost;
      if (!g) return;
      ghost = null;
      cancelAnimationFrame(g.raf);
      clearTimeout(g.timer);
      const k = spawn(g.info, g.x, g.y);
      press = { key: k, x: g.tx, y: g.ty, t: g.t, moved: true, id: g.pid, spawned: true, charge: 0, swing: 0, hand: 0, last: g.last, lit: false };
      lift(k, g.x, g.y);
      lastTick = 0;
      chargeRaf = requestAnimationFrame(tick);
      // Gone the frame the piece is first drawn, so the two are never seen apart.
      requestAnimationFrame(() => g.el.remove());
    };
    const onMove = (e: PointerEvent) => {
      const p = local(e);
      if (ghost && e.pointerId === ghost.pid) {
        ghost.x = p.x;
        ghost.y = p.y;
        placeGhost();
        return;
      }
      if (box && e.pointerId === box.id) {
        const r = { left: Math.min(box.x, p.x), top: Math.min(box.y, p.y), right: Math.max(box.x, p.x), bottom: Math.max(box.y, p.y) };
        if (r.right - r.left > 4 || r.bottom - r.top > 4) setMarquee(r);
        return;
      }
      if (tokPress && e.pointerId === tokPress.pid) {
        if (Math.hypot(e.clientX - tokPress.x, e.clientY - tokPress.y) <= 6) return;
        const tp = tokPress;
        endTok();
        const last = { x: e.clientX, y: e.clientY, t: performance.now() };
        if (tp.key) {
          // On the table: the piece itself is lifted off its card.
          if (!engine.has(tp.key)) return;
          press = { key: tp.key, x: tp.x, y: tp.y, t: tp.t, moved: true, id: e.pointerId, spawned: false, charge: 0, swing: 0, hand: 0, last, lit: false };
          lift(tp.key, tp.px, tp.py);
          engine.drag(p.x, p.y);
        } else {
          // In the hand: it pops off the card, already in the hand. Making its 3D piece stalls a frame or more, so a
          // flat stand-in leaves the card under the cursor at once and the piece takes over from it a frame later,
          // wherever the cursor has got to (owner, v0.47.20: the drag felt stuck while the model was made).
          const info = live.current.onPopToken(tp.ref!, tp.id!);
          if (!info) return;
          const el = document.createElement('div');
          Object.assign(el.style, { position: 'absolute', left: '0', top: '0', pointerEvents: 'none', zIndex: '30', display: 'flex', gap: '2px', transform: 'translate(-50%, -50%)' });
          for (const { spec } of tokenSpecs(pieceOf('free:ghost', info), live.current.numberFinish)) {
            const s = spec.size * (spec.shape === 'chip' ? 1 : 0.8);
            const part = document.createElement('div');
            Object.assign(part.style, { width: `${s}px`, height: `${s}px`, borderRadius: spec.shape === 'chip' ? '50%' : '22%', background: spec.body, border: `2px solid ${spec.edge}`, boxShadow: '0 6px 14px rgba(0,0,0,0.45)', boxSizing: 'border-box' });
            el.appendChild(part);
          }
          host.appendChild(el);
          ghost = { el, info, x: p.x, y: p.y, pid: e.pointerId, tx: tp.x, ty: tp.y, t: tp.t, last, raf: 0, timer: 0 };
          placeGhost();
          ghost.raf = requestAnimationFrame(() => { if (ghost) ghost.timer = window.setTimeout(landGhost, 0); });
        }
        host.style.cursor = 'grabbing';
        cue('spawner:take', 'placeToken', { volume: 0.6, cents: 300 });
        return;
      }
      if (press && e.pointerId === press.id) {
        if (press.key === DOMAT_KEY) {
          if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) {
            const at = engine.state(DOMAT_KEY);
            press = null;
            host.style.cursor = '';
            if (at) live.current.onDomatDraw({ x: at.x, y: at.y }, p);
          }
          return;
        }
        if (!press.moved && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) {
          // Moved: an ordinary drag after all, and any shaking stops.
          press.moved = true;
          if (press.charge > 0) { press.charge = 0; shakeAll(press.key, 0); }
          if (press.deferred && !nailed(press.key)) { engine.grab(press.key, press.deferred.x, press.deferred.y); press.deferred = undefined; }
        }
        if (!press.deferred) engine.drag(p.x, p.y);
        if (press.moved) {
          // How fast the hand swings it, smoothed over the last few moves.
          const now = performance.now(), dt = now - press.last.t;
          if (dt > 0) {
            const inst = (Math.hypot(e.clientX - press.last.x, e.clientY - press.last.y) / dt) * 1000;
            const k = Math.min(1, dt / 50);
            press.hand += (inst - press.hand) * k;
            press.last = { x: e.clientX, y: e.clientY, t: now };
          }
          live.current.onDragPiece?.(e.clientX, e.clientY);
        }
        return;
      }
      if (spawning || inertRef.current) return;
      const key = engine.hit(p.x, p.y);
      engine.hover(key);
      setHoverKey(key);
      host.style.cursor = key ? 'grab' : '';
    };
    const onUp = (e: PointerEvent) => {
      // Let go before its piece was made: it is made now, and dropped like any other.
      if (ghost && e.pointerId === ghost.pid) landGhost();
      if (tokPress && e.pointerId === tokPress.pid) {
        const tp = tokPress;
        endTok();
        host.style.cursor = '';
        if (e.type === 'pointerup') live.current.onTokenClick?.(tokOf(tp), e.clientX, e.clientY);
        return;
      }
      if (spawning && e.pointerId === spawning.id) {
        clearTimeout(spawning.timer);
        spawning = null;
        menuUntil = performance.now() + 500;
        return;
      }
      if (box && e.pointerId === box.id) {
        const p = local(e);
        const r = { left: Math.min(box.x, p.x), top: Math.min(box.y, p.y), right: Math.max(box.x, p.x), bottom: Math.max(box.y, p.y) };
        box = null;
        setMarquee(null);
        const big = r.right - r.left > 6 || r.bottom - r.top > 6;
        // What can be moved together: loose tokens and dice, the dice of the last roll, and physical cards (v0.47.17).
        const keys = big ? [...new Set(engine.inside(r).filter((k) => k.startsWith('free:') || k.startsWith('roll:') || k.startsWith('card:')).flatMap((k) => (k.startsWith('card:') ? [k] : partsOf(k))))] : [];
        selection.current = keys;
        engine.select(keys);
        live.current.onSelect(keys);
        if (keys.length) cue('select', 'cardSelect', { volume: 0.5 });
        return;
      }
      if (!press || e.pointerId !== press.id) return;
      const pr = press;
      press = null;
      if (chargeRaf) { cancelAnimationFrame(chargeRaf); chargeRaf = 0; }
      host.style.cursor = 'grab';
      if (pr.moved) live.current.onDragPiece?.(null);
      // Let go while shaking: it launches with what it has built up (burning, once it caught).
      if (pr.charge > 0 && !pr.moved) { if (!pr.lit) heat(pr.key, 0); fire(pr, Math.min(1, pr.charge), pr.lit, pr.cold); return; }
      if (!pr.lit) heat(pr.key, 0);
      // A bundle let go before it charged: its dice's crackle goes out.
      if (!pr.lit && pr.moved) for (const k of [...zapKeys(pr.key), ...bundleToks(pr.key)]) fireRef.current?.set(k, 0);
      if (pr.swing > 0 || pr.lit) shakeAll(pr.key, 0);
      // Nothing still on fire settles onto a card (owner, v0.47.14): it flies on instead.
      const afire = pr.lit || partsOf(pr.key).some((k) => lit.current.has(k));
      // Nor does a throw that happens to end over one (owner, v0.47.17): set down means the hand was still at the end.
      const flung = pr.hand > 350 && performance.now() - pr.last.t < 90;
      if (pr.moved && !afire && !flung && live.current.onDropPiece(pr.key, e.clientX, e.clientY)) {
        engine.release();
        return;
      }
      const group = pr.moved && selection.current.includes(pr.key) ? [...selection.current] : null;
      // A die picked up and carried is selected (owner, v0.47.22), as a shift-click would; only one really dragged by
      // the hand, never one bumped or barely nudged. Added after the throw is read, so it does not count this throw.
      if (pr.moved && isDie(pr.key) && Math.hypot(pr.last.x - pr.x, pr.last.y - pr.y) > 14 && !selection.current.includes(pr.key)) {
        selection.current = [...new Set([...selection.current, ...partsOf(pr.key)])];
        engine.select(selection.current);
        live.current.onSelect(selection.current);
      }
      const zs = pr.zap ? zapKeys(pr.key) : [];
      const speed = pr.deferred ? 0 : engine.release();
      // A die charged on its own counts as a roll of it, as a charged selection does.
      const counted = group ?? (zs.length ? zs : null);
      if (counted && (speed > 300 || zs.length)) settle.current(counted);
      // Charged with lightning: every die goes off hard its own way, bouncing round the table breaking what it meets,
      // and two to five seconds later each slams down where it is and lands on its face (owner, v0.47.18).
      if (zs.length) {
        const dir = Math.atan2(pr.last.y - pr.y, pr.last.x - pr.x);
        // Each breaks what it meets, but never the other dice of the same throw (once one has landed it is its result).
        const own = zs.flatMap((k) => partsOf(k));
        // Nor any other piece of the same swung selection (owner, v0.47.25).
        const mine = new Set([...own, ...(group ?? []).flatMap((k) => partsOf(k))]);
        for (const k of zs) engine.zap(k, dir + (Math.random() - 0.5) * 2.4, 2300 + Math.random() * 900, 2 + Math.random() * 3, [...mine]);
        for (const k of group ?? []) {
          if (zs.includes(k) || !engine.has(k)) continue;
          // A token of the selection that caught goes burning (or frozen) as a lone one would.
          if (lit.current.has(k)) engine.empower(k, Math.max(2, 9000 / Math.max(1, speed)), { gen: 5, power: 6 }, { left: 99, fire: true, cold: frozen.current.has(k), spare: mine });
          else engine.empower(k, Math.max(1, 3000 / Math.max(1, speed)), { gen: 3, power: 2 }, { left: 2, fire: false, spare: mine });
        }
        cue('throw:fire', 'gainGoldenHp', { volume: 0.8, cents: 300 });
        live.current.onHardHit(7000);
        return;
      }
      // Let go mid-swing: it flies on the way it was swung, far harder than a throw from still.
      if (pr.moved && (pr.lit || pr.swing > 0.25)) {
        const want = pr.lit ? Math.max(11500, speed * 2.8) : speed * (1 + pr.swing * 0.75);
        const boost = { gen: 5, power: pr.lit ? 7 : 1 + 2.5 * pr.swing };
        // A swung selection's own pieces never break each other (owner, v0.47.25).
        const spare = new Set((group ?? partsOf(pr.key)).flatMap((k) => partsOf(k)));
        const breaker = pr.lit ? { left: 99, fire: true, cold: pr.cold, spare } : { left: 2, fire: false, spare };
        if (speed < 250) fling(pr.key, Math.max(want, pr.lit ? 11500 : 1400), boost, undefined, breaker);
        // A swung bundle all goes with the swing, as hard as the one in the hand.
        // Each frozen one goes cold, the rest burning (a selection of tokens can be both, v0.47.26).
        else for (const k of group ?? partsOf(pr.key)) if (engine.has(k)) engine.empower(k, want / speed, boost, pr.lit ? { ...breaker, cold: frozen.current.has(k) } : breaker);
        cue(pr.lit ? 'throw:fire' : 'throw:swing', pr.lit ? 'gainGoldenHp' : 'gearScroll1', { volume: 0.5 + Math.min(1, pr.swing) * 0.3, cents: pr.lit ? 1100 : Math.round(pr.swing * 400) });
        if (pr.lit) live.current.onHardHit(7000);
        if (pr.key.startsWith('free:')) watchLoose(pr.key);
        return;
      }
      if (pr.deferred) engine.flash(pr.key);
      if (pr.key.startsWith('free:')) watchLoose(pr.key);
      if (pr.spawned && !pr.moved) {
        // A click on the supply throws the copy out across the table.
        const at = engine.state(pr.key);
        const ang = at ? outward(at.x, at.y) : Math.PI / 2;
        const sp = 820 + Math.random() * 300;
        engine.toss(pr.key, Math.cos(ang) * sp, Math.sin(ang) * sp);
        return;
      }
      if (live.current.toys && (pr.key === CAT || ACTIONS.includes(pr.key as ActionKey))) return;
      if (!pr.moved && performance.now() - pr.t < 450) {
        if (pr.key === CAT) {
          const s = engine.state(CAT);
          if (s) { cue('ui:open', 'floatMenuOpen'); setRing({ x: s.x, y: s.y }); }
        } else if (pr.key === DOMAT_KEY) {
          const s = engine.state(DOMAT_KEY);
          if (s) live.current.onDomatDraw({ x: s.x, y: s.y });
        } else {
          const a = live.current.actions.find((x) => x.key === pr.key);
          if (a && !a.disabled) a.onPress();
        }
      } else {
        if (speed > 900) cue('throw', 'gearScroll1', { volume: 0.25 });
        // The deck die thrown: the deck it lands on opens.
        if (pr.key === CAT && speed > 250 && !live.current.toys) {
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
    /**
     * Right click opens the table's menu (owner, v0.47.5), on a piece too (with what can be done to that piece);
     * only the spawners keep their right click for spawning. Cards keep their own menus.
     */
    const onMenu = (e: MouseEvent) => {
      if (performance.now() < menuUntil) { e.preventDefault(); e.stopPropagation(); return; }
      if (onUi(e.target)) return;
      e.preventDefault();
      if (inertRef.current) return;
      const p = local(e);
      const key = engine.hit(p.x, p.y);
      if (key?.startsWith('fx:mimic')) { e.stopPropagation(); live.current.onMimic?.(key); return; }
      // A token or die on a card has its own menu (owner, v0.47.18): its modifiers, rolling it, taking it off.
      const tokEl = key ? null : (e.target as HTMLElement).closest?.('[data-card-token]') as HTMLElement | null;
      if (key?.startsWith('tok:') || tokEl) {
        e.stopPropagation();
        if (live.current.onTokenMenu) live.current.onTokenMenu(key ? { key: baseOf(key) } : { ref: tokEl!.dataset.cardToken!, id: tokEl!.dataset.tokenId! }, e.clientX, e.clientY);
        return;
      }
      if (key) {
        e.stopPropagation();
        const own = live.current.toys && (key === CAT || ACTIONS.includes(key as ActionKey));
        live.current.onTableMenu(e.clientX, e.clientY, own ? undefined : pieceMenu(key));
        return;
      }
      if ((e.target as HTMLElement).closest?.('[data-card-id], [data-board-card], [data-domat]')) return;
      live.current.onTableMenu(e.clientX, e.clientY);
    };
    // The wheel: over the deck die it walks the decks, over a supply piece it walks that piece's options.
    let wheelAcc = 0;
    const onWheel = (e: WheelEvent) => {
      if (inertRef.current) return;
      const p = local(e);
      const key = engine.hit(p.x, p.y);
      const chest = key === 'src:die' && live.current.diceChest;
      // The playground keeps the supply (v0.47.22), so only the deck die is still for show there.
      if ((live.current.toys && key === CAT) || (key !== CAT && !(key?.startsWith('src:') && key !== DOMAT_KEY))) return;
      e.preventDefault();
      e.stopPropagation();
      wheelAcc += e.deltaY * (e.deltaMode === 1 ? 40 : 1);
      if (Math.abs(wheelAcc) < 50) return;
      const dir = wheelAcc > 0 ? 1 : -1;
      wheelAcc = 0;
      // Scrolled down over it, the chest throws out one die of any kind (owner, v0.47.17); scrolled up, it takes two
      // dice off the table back in, any two (v0.47.24).
      if (chest) {
        const at = engine.state('src:die');
        if (!at) return;
        if (dir < 0) {
          const pool = [...new Set(engine.keys().filter((k) => isDie(k) && !leaving.current.has(k)).map(baseOf))];
          if (!pool.length) { refuse(); return; }
          for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
          putAwayRef.current(pool.slice(0, 2), true);
          return;
        }
        const type = DIE_KINDS[Math.floor(Math.random() * DIE_KINDS.length)];
        const m = mouthOf(at, 1);
        fling(spawn({ kind: 'die', dieType: type, dieValue: 1, dieValue2: type === 'duality' ? 1 : undefined }, m.x, m.y), 900 + Math.random() * 500, undefined, m.ang);
        cue('spawner:toss', 'placeToken', { volume: 0.4, cents: 200 + Math.random() * 300 });
        return;
      }
      if (key === CAT) {
        const list = live.current.decks;
        const i = list.findIndex((d) => d.key === live.current.current);
        const next = list[(i + dir + list.length) % list.length];
        if (next) live.current.onPickDeck(next.key);
        return;
      }
      const base = baseOf(key!);
      live.current.onSupplyStep(base, base === 'src:die' ? (-dir as 1 | -1) : dir);
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
      if (chargeRaf) cancelAnimationFrame(chargeRaf);
      if (holdRaf) cancelAnimationFrame(holdRaf);
      if (spawning) clearTimeout(spawning.timer);
      if (ghost) { cancelAnimationFrame(ghost.raf); clearTimeout(ghost.timer); ghost.el.remove(); }
    };
  }, [host, engine, spawn, fling, partsOf, watchLoose, pieceMenu, outward, dissolve]);

  // ---------------------------------------------------------------- rolls, tidying and reset
  const waitFor = useCallback((keys: string[], read: () => PoolDie[]) => new Promise<PoolDie[]>((resolve) => {
    // Any earlier roll with one of these dice in it is over: thrown again, they are this roll's now. It is never read
    // (it comes back empty, so nothing is shown for it), or the same dice were announced twice.
    for (const w of [...pending.current]) if (keys.some((k) => w.keys.has(k))) { pending.current.delete(w); w.drop(); }
    let over = false;
    const end = (out: () => PoolDie[]) => { if (over) return; over = true; clearTimeout(guard); resolve(out()); };
    const w: Waiting = { keys: new Set(keys), done: () => end(read), drop: () => end(() => []) };
    // A die held in someone's hand never lands: after a while the roll reads what is on top regardless.
    const guard = setTimeout(() => { if (pending.current.delete(w)) end(read); }, 9000);
    pending.current.add(w);
  }), []);

  /**
   * The dice answer their roll once they land (owner, v0.47.11, after the phone's tray): a die on its highest face
   * washes white, swells and wobbles; a 1 flushes red and jerks; Hope's winning die glows gold and sways, Fear's glows
   * violet and jerks. Hope and Fear equal is a critical: both blaze white and swell hard, the table stops for a beat,
   * and a shockwave from them throws every loose piece and physical card away, sparing only the two of them.
   */
  const celebrate = useCallback((landed: PoolDie[]): PoolDie[] => {
    const e = engineRef.current;
    if (!e) return landed;
    const keyOf = (d: PoolDie) => [d.id, `roll:${d.id}`, `${d.id}:t`, `roll:${d.id}:t`].find((k) => e.has(k));
    const MAX: Record<string, number> = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20, d100: 100 };
    const shake = (k: string, v: number, ms: number) => { e.jitter(k, v); setTimeout(() => e.jitter(k, 0), ms); };
    let i = 0;
    const later = (fn: () => void) => { const t = i++ * 80; if (t) setTimeout(fn, t); else fn(); };
    const pairs = new Map<string, { hope?: PoolDie; fear?: PoolDie }>();
    for (const d of landed) {
      if (d.side && d.pairId) { const p = pairs.get(d.pairId) ?? {}; p[d.side] = d; pairs.set(d.pairId, p); continue; }
      const k = keyOf(d);
      if (!k || d.value == null) continue;
      // Good news swells and shines; only bad news shakes (owner, v0.47.18).
      if (d.value >= (MAX[d.type] ?? 99)) later(() => { e.wash(k, '#ffffff', 0.86, 700, 0.32); const s = e.state(k); if (s) live.current.onGood?.(s, '#fff6dc', false); });
      else if (d.value <= 1) later(() => { e.wash(k, '#ff2a14', 0.75, 260, 0.15); shake(k, 1, 405); });
    }
    for (const { hope, fear } of pairs.values()) {
      const hk = hope && keyOf(hope), fk = fear && keyOf(fear);
      if (!hope || !fear || !hk || !fk || hope.value == null || fear.value == null) continue;
      if (hope.value === fear.value) {
        later(() => crit(e, hk, fk));
      } else if (hope.value > fear.value) {
        later(() => { e.wash(hk, '#ffc24a', 0.8, 900, 0.3); const s = e.state(hk); if (s) live.current.onGood?.(s, '#ffd56a', true); });
      } else {
        later(() => { e.wash(fk, '#a35cff', 0.9, 500, 0.15); shake(fk, 1, 405); });
      }
    }
    return landed;
  }, []);

  /**
   * A critical (owner, v0.47.27: the one effect above all the others). Everything on the table stops where it is; the
   * pair flies to the middle of the table, on top of everything, showing what it rolled; it builds, shaking harder and
   * harder for a second and a half; CRITICAL slams in for half a second; then the blast, and the table carries on.
   * The light, the darkness, the camera and the words are the table's (`onCrit`); the dice are moved here.
   */
  const critOn = useRef(false);
  const crit = (e: DiceEngine, hk: string, fk: string) => {
    // One at a time: a second critical while one plays only glows (it never restarts the show half way).
    if (critOn.current) { e.wash(hk, '#fff4d6', 0.7, 700, 0.4); e.wash(fk, '#fff4d6', 0.7, 700, 0.4); return; }
    critOn.current = true;
    const W = size.current.width, H = size.current.height;
    const at = { x: W / 2, y: H / 2 };
    const gap = (e.screen(hk)?.size ?? 46) * 0.62;
    const GATHER = 560, RUMBLE = 1500, WORD = 520;
    e.stage([hk, fk]);
    // As they lie: the faces they rolled stay up.
    e.home(hk, at.x - gap, at.y, e.state(hk)?.top);
    e.home(fk, at.x + gap, at.y, e.state(fk)?.top);
    live.current.onCrit?.(at, 'gather');
    let lvl = 0, tick: ReturnType<typeof setInterval> | undefined;
    setTimeout(() => {
      live.current.onCrit?.(at, 'rumble');
      // They tremble, harder and harder, and glow hotter as it builds.
      tick = setInterval(() => {
        lvl = Math.min(1, lvl + 0.075);
        e.jitter(hk, lvl); e.jitter(fk, lvl);
      }, 110);
      // Never so bright the numbers wash out: the result is what the moment is about.
      e.wash(hk, '#ffd98a', 0.45, RUMBLE, 0.12);
      e.wash(fk, '#ffd98a', 0.45, RUMBLE, 0.12);
    }, GATHER);
    setTimeout(() => {
      // Dead still for the word.
      clearInterval(tick);
      e.jitter(hk, 0); e.jitter(fk, 0);
      e.wash(hk, '#fff1cc', 0.55, 700, 0.45);
      e.wash(fk, '#fff1cc', 0.55, 700, 0.45);
      live.current.onCrit?.(at, 'word');
    }, GATHER + RUMBLE);
    setTimeout(() => {
      e.stage(null);
      const spare = [hk, fk, CAT, ...ACTIONS, ...e.keys().filter((k) => k.startsWith('tok:') || k.startsWith('src:'))];
      // Spared, and held fast while the blast runs out: what it throws cannot knock them about either.
      e.pin(spare, 1800);
      e.impulse(at.x, at.y, Math.hypot(W, H) * 1.2, 8200, { gen: 3, power: 3.5 }, spare);
      e.wash(hk, '#fff4d6', 0.7, 1100, 0.8);
      e.wash(fk, '#fff4d6', 0.7, 1100, 0.8);
      live.current.onCrit?.(at, 'boom');
    }, GATHER + RUMBLE + WORD);
    setTimeout(() => { critOn.current = false; live.current.onCrit?.(at, 'done'); }, GATHER + RUMBLE + WORD + 1400);
  };

  /** Which dice a set of pieces holds (a pair counts once), and what they show once they land. */
  const groupsOf = (keys: string[]) => {
    const groups = new Map<string, string[]>();
    for (const k of keys) {
      const base = baseOf(k);
      if (base.startsWith('roll:')) { const d = rolled.current.get(k); if (d) groups.set(`roll:${d.id}`, [...(groups.get(`roll:${d.id}`) ?? []), k]); continue; }
      const t = live.current.loose.find((l) => l.key === base);
      if (t?.token.kind === 'die') groups.set(base, partsOf(k));
    }
    return groups;
  };
  const readGroups = (e: DiceEngine, groups: Map<string, string[]>): PoolDie[] => {
    const out: PoolDie[] = [];
    for (const [base, parts] of groups) {
      const tops = parts.map((k) => e.state(k)?.top ?? 0);
      if (base.startsWith('roll:')) {
        const d = rolled.current.get(parts[0]);
        if (d) { const v = valueOf(d, tops); out.push({ ...d, value: v }); live.current.onRerolled(d.id, v); }
        continue;
      }
      const t = live.current.loose.find((l) => l.key === base);
      if (!t) continue;
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
  };
  /** Selected dice thrown together by hand: wait for them all to land, then count them like a roll. */
  /**
   * Put these pieces away (by base key): the tidy's flight home, never a break (owner, v0.47.21); only these go, the
   * rest stay. `mouth`: they go into the chest, which opens for them and shuts once they are in (v0.47.24).
   */
  const putAwayRef = useRef<(bases: string[], mouth?: boolean) => void>(() => {});
  putAwayRef.current = (bases, mouth) => {
    const engine = engineRef.current;
    if (!engine) return;
    const keys = engine.keys().filter((k) => (k.startsWith('free:') || k.startsWith('roll:')) && bases.includes(baseOf(k)));
    if (!keys.length) return;
    for (const k of keys) fireRef.current?.set(k, 0);
    setBurning((bs) => bs.filter((k) => !keys.includes(k)));
    offered.current = offered.current.filter((o) => !bases.includes(o));
    selection.current = selection.current.filter((k) => !keys.includes(k));
    live.current.onSelect(selection.current);
    if (mouth) engine.mimic('src:die', 1);
    else cue('piece:putAway', 'tokenRemove');
    const done = stow(keys);
    setTimeout(() => {
      for (const k of keys) rolled.current.delete(k);
      live.current.onDiscard?.(bases.filter((x) => x.startsWith('free:')));
      if (mouth && !offered.current.length) engine.mimic('src:die', 0);
    }, done);
  };
  const settle = useRef<(keys: string[]) => void>(() => {});
  settle.current = (keys) => {
    const e = engineRef.current;
    if (!e) return;
    const groups = groupsOf(keys);
    const all = [...new Set([...groups.values()].flat())];
    if (!all.length) return;
    void waitFor(all, () => readGroups(e, groups)).then(celebrate).then((landed) => { if (landed.length) live.current.onGroupRolled?.(landed); });
  };

  /**
   * Owner (v0.47.4): each piece goes in a beat after the last, arcs and tumbles to its spawner's home, touches nothing
   * on the way and shrinks away there; gone from the engine once all are in. Returns when that is (ms).
   */
  const stow = (keys: string[]): number => {
    const engine = engineRef.current;
    if (!engine) return 0;
    const sup = live.current.supply;
    const toKey = (base: string): string => {
      const t = live.current.loose.find((l) => l.key === base)?.token;
      if (!t) return 'src:die';
      return t.kind === 'die' ? 'src:die' : t.kind === 'color' ? 'src:color' : 'src:mat';
    };
    const STAGGER = 45;
    keys.forEach((k, i) => {
      const target = k.startsWith('roll:') ? 'src:die' : toKey(baseOf(k));
      const h = homeOf(sup.some((x) => x.key === target) ? target : 'src:die') ?? { x: 60, y: 60 };
      engine.vanish(k, h.x, h.y, i * STAGGER);
      if (i % 2 === 0 && i < 24) setTimeout(() => cue('table:tidyPiece', 'placeToken', { volume: 0.3, cents: 300 + Math.round(Math.random() * 300 - 150) }), i * STAGGER + 420);
    });
    const done = keys.length * STAGGER + 800;
    leave(keys, done);
    setTimeout(() => { for (const k of keys) engine.remove(k); }, done);
    return done;
  };

  useImperativeHandle(ref, () => ({
    roll: (dice, from, rigged) => {
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
          // Towards the middle of the open table (owner, v0.47.11: thrown up, they landed under the result at the top).
          const cx = (b.left + b.right) / 2, cy = b.top + (b.bottom - b.top) * 0.4;
          const dist = Math.hypot(cx - x, cy - from.y);
          const ang = (dist > 120 ? Math.atan2(cy - from.y, cx - x) : Math.random() * Math.PI * 2) + (Math.random() - 0.5) * 0.9;
          const sp = Math.min(1150, 420 + dist * 0.9) * (0.85 + Math.random() * 0.3);
          engine.toss(spec.key, Math.cos(ang) * sp, Math.sin(ang) * sp);
          keys.push(spec.key);
        });
      });
      cue('roll:throw', 'gearScroll1', { volume: 0.35 });
      return waitFor(keys, () => {
        // `__rkRig = [6, 6]` (development) or a rigged roll turns the dice to those faces as they land (to see a critical).
        const rig = rigged ?? (__DEV__ ? (globalThis as { __rkRig?: number[] }).__rkRig : undefined);
        if (rig) { (globalThis as { __rkRig?: number[] }).__rkRig = undefined; thrown.forEach(({ keys: ks }, i) => { if (rig[i] != null) engine.setFace(ks[0], rig[i] - 1); }); }
        return thrown.map(({ die, keys: ks }) => ({ ...die, value: valueOf(die, ks.map((k) => engine.state(k)?.top ?? 0)) }));
      }).then(celebrate);
    },
    rollPieces: (keys, power, burning) => {
      if (!engine) return Promise.resolve([]);
      const groups = groupsOf(keys);
      const all = [...new Set([...groups.values()].flat())];
      if (!all.length) return Promise.resolve([]);
      // The Roll button (owner, v0.47.31): the dice leap straight up where they lie, spinning hard, and barely move
      // across the table. Pressed once, a great leap; held, higher, longer and faster still; held to the full, they
      // catch light fire and hang in the air, falling slowly, spinning wildly until they land.
      const pw = burning ? 1 : Math.max(0, Math.min(1, power ?? 0));
      let hang = 0;
      for (const k of all) {
        const up = (760 + 640 * pw) * (0.9 + Math.random() * 0.2);
        const g = burning ? 620 : 3200 - 1700 * pw;
        // However long it hangs, it lands only a little way from where it rose.
        const ang = Math.random() * Math.PI * 2, drift = (40 + Math.random() * 60) / Math.max(0.5, (2 * up) / g);
        const spin = (34 + 46 * pw + (burning ? 40 : 0)) * (0.85 + Math.random() * 0.3);
        engine.leap(k, Math.cos(ang) * drift, Math.sin(ang) * drift, up, g, spin);
        hang = Math.max(hang, (2 * up) / g);
      }
      if (burning) {
        for (const k of all) fireRef.current?.set(k, 0.24);
        // Out as they land.
        setTimeout(() => { for (const k of all) if (!lit.current.has(k)) fireRef.current?.set(k, 0); }, hang * 1000 + 150);
      }
      cue(burning ? 'throw:fire' : 'roll:throw', burning ? 'gainGoldenHp' : 'gearScroll1', { volume: 0.35 + pw * 0.3, cents: burning ? 900 : Math.round(pw * 500) });
      return waitFor(all, () => readGroups(engine, groups)).then(celebrate);
    },
    clearRoll: () => { if (engine) clear(engine); },
    resetHome: () => {
      if (!engine) return;
      sendHome();
      cue('table:home', 'gearScroll2', { volume: 0.45 });
    },
    tidy: () => {
      if (!engine) return;
      // Nothing goes back into the supply still burning (owner, v0.47.11).
      setBurning([]);
      offered.current = [];
      engine.mimic('src:die', 0);
      fireRef.current?.clear();
      const keys = engine.keys().filter((k) => k.startsWith('free:') || k.startsWith('roll:'));
      const done = stow(keys);
      sendHome();
      cue('table:tidy', 'gearScroll2', { volume: 0.5 });
      setTimeout(() => {
        rolled.current.clear();
        selection.current = [];
        live.current.onSelect([]);
        live.current.onTidied();
      }, done);
    },
    putAway: (bases) => putAwayRef.current(bases),
    openDecks: (at) => { cue('ui:open', 'floatMenuOpen'); setRing(at); },
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
    rollPiece: (key) => { if (key.startsWith('free:')) fling(key, 420 + Math.random() * 200); else rollInPlace(key); },
    restyle: (keys, dress) => {
      if (!engine) return;
      for (const k of keys) {
        if (!engine.has(k)) continue;
        const base = baseOf(k);
        const t = live.current.loose.find((l) => l.key === base);
        const d = rolled.current.get(k);
        const spec = t ? tokenSpecs(pieceOf(t.key, t.token), live.current.numberFinish).find((s) => s.spec.key === k)?.spec : d ? rollSpecs(d, live.current.numberFinish).find((s) => s.key === k) : undefined;
        if (spec) engine.add(dress ? { ...spec, ...dress(spec) } : spec, 0, 0);
      }
    },
    wish: (keys) => {
      if (!engine) return;
      const groups = groupsOf(keys);
      for (const [base, parts] of groups) {
        const type = base.startsWith('roll:') ? rolled.current.get(parts[0])?.type : live.current.loose.find((l) => l.key === base)?.token.dieType;
        // A percentile pair shows 00 and 0 for a hundred; anything else its last face.
        for (const k of parts) engine.setFace(k, type === 'd100' ? 0 : FACES_OF[shapeOf(type ?? 'd6')] - 1);
      }
      settle.current([...groups.values()].flat());
    },
  }), [engine, sendHome, homeOf, partsOf, waitFor, fling, rollInPlace, celebrate]); // eslint-disable-line react-hooks/exhaustive-deps
  const clear = (e: DiceEngine) => {
    for (const k of rolled.current.keys()) e.remove(k);
    rolled.current.clear();
  };

  // Ready once the models are in, the control and deck icons are drawn and a frame has gone by with them.
  const told = useRef(false);
  useEffect(() => {
    if (told.current || !(failed || (engine && glyphs && (deckArt || !decks.length)))) return;
    told.current = true;
    requestAnimationFrame(() => requestAnimationFrame(() => live.current.onReady?.()));
  }, [engine, glyphs, deckArt, failed, decks.length]);

  const currentDeck = decks.find((d) => d.key === current);
  const ready = !!engine && !!glyphs;

  // The row handles while settings are open: drag one to move its row, flip it to stand it on end.
  const groups: { g: PlaceGroup; box: Bounds; label: string; piece?: string; chain?: 'split' | 'join'; /** What its eye hides. */ keys?: string[] }[] = [];
  const ctlApart = ACTIONS.some((k) => places.apart?.[k]);
  const supKeys = [...props.supply.map((t) => t.key).filter((k) => !(k === 'src:die' && props.diceChest)), ...(props.domat ? [DOMAT_KEY] : [])];
  const chestOut = !!props.diceChest && props.supply.some((t) => t.key === 'src:die');
  const supApart = supKeys.some((k) => places.apart?.[k]);
  /** A frame round one piece split off its row. */
  const pieceBox = (key: string, r: number, label: string, g: PlaceGroup) => {
    const h = homeOf(key);
    if (h) groups.push({ g, piece: key, chain: 'join', keys: [key], box: { left: h.x - r, right: h.x + r, top: h.y - r, bottom: h.y + r + 8 }, label });
  };
  if (editing) {
    const sn = supKeys.length;
    // The chest has its own frame: moved on its own, hidden or locked on its own.
    if (chestOut) { const h = homeOf('src:die'); if (h) groups.push({ g: 'sup', piece: 'src:die', keys: ['src:die'], box: { left: h.x - 56, right: h.x + 56, top: h.y - 56, bottom: h.y + 60 }, label: 'Dice chest' }); }
    const half = (n: number, gap: number) => ((n - 1) * gap) / 2 + 40;
    if (controls === 'buttons') {
      // Plain buttons: the frame goes round the buttons as they are drawn (the deck's button is among them).
      const l = Math.min(bounds.right - btnBox.w - 6, Math.max(bounds.left + 6, places.ctl.x - btnBox.w / 2));
      const t = Math.min(bounds.bottom - btnBox.h - 6, Math.max(bounds.top + 6, places.ctl.y - btnBox.h / 2));
      groups.push({ g: 'ctl', box: { left: l - 8, right: l + btnBox.w + 8, top: t - 8, bottom: t + btnBox.h + 8 }, label: 'Controls' });
    } else if (controls !== 'hidden' && ctlApart) {
      for (const a of actions) pieceBox(a.key, (ACTION_SIZE * props.ctlSize) / 2 + 12, a.label, 'ctl');
      groups.push({ g: 'cat', keys: [CAT], box: { left: places.cat.x - 58, right: places.cat.x + 58, top: places.cat.y - 58, bottom: places.cat.y + 64 }, label: 'Deck die' });
    } else if (controls !== 'hidden') {
      const hw = places.ctl.dir === 'row' ? half(ACTIONS.length, CTL_GAP.row) : 44, hh = places.ctl.dir === 'row' ? 50 : half(ACTIONS.length, CTL_GAP.column);
      groups.push({ g: 'ctl', chain: 'split', keys: [...ACTIONS], box: { left: places.ctl.x - hw, right: places.ctl.x + hw, top: places.ctl.y - hh, bottom: places.ctl.y + hh }, label: 'Control dice' });
      groups.push({ g: 'cat', keys: [CAT], box: { left: places.cat.x - 58, right: places.cat.x + 58, top: places.cat.y - 58, bottom: places.cat.y + 64 }, label: 'Deck die' });
    }
    if (sn && supApart) {
      for (const k of supKeys) pieceBox(k, k === 'src:die' ? 62 : 40, props.supply.find((t) => t.key === k)?.label ?? 'Many Things', 'sup');
    } else if (sn) {
      const keys = supKeys;
      const len = keys.reduce((a, k) => a + slotOf(k, places.sup.dir), 0) / 2 + 6;
      const hw = places.sup.dir === 'row' ? len : 64, hh = places.sup.dir === 'row' ? 54 : len;
      groups.push({ g: 'sup', chain: 'split', keys: supKeys, box: { left: places.sup.x - hw, right: places.sup.x + hw, top: places.sup.y - hh, bottom: places.sup.y + hh }, label: 'Supply' });
    }
  }

  return (
    <>
      <canvas ref={canvas} style={{ position: 'absolute', left: 0, top: 0, width, height, pointerEvents: 'none', zIndex: 20 }} />
      <div ref={holdRing} aria-hidden style={{ position: 'absolute', left: 0, top: 0, width: 60, height: 60, borderRadius: '50%', opacity: 0, zIndex: 23, pointerEvents: 'none', WebkitMaskImage: 'radial-gradient(circle, transparent 62%, #000 64%)', maskImage: 'radial-gradient(circle, transparent 62%, #000 64%)', transition: 'opacity 120ms' }} />
      {marquee ? <div style={{ position: 'absolute', left: marquee.left, top: marquee.top, width: marquee.right - marquee.left, height: marquee.bottom - marquee.top, border: '1px solid rgba(224,181,99,0.8)', background: 'rgba(224,181,99,0.08)', zIndex: 22, pointerEvents: 'none' }} /> : null}
      {/* Labels under the control dice; each is also that die's keyboard handle (Tab, then Enter). */}
      {ready && showDice && !props.toys ? actions.filter((a) => !hid.includes(a.key)).map((a) => (
        <button key={a.key} type="button" className="rk-die-label" ref={setLabel(a.key)} disabled={a.disabled} aria-label={a.label} onClick={() => { if (!a.disabled) a.onPress(); }} style={{ ...labelStyle, color: hoverKey === a.key ? T.ivory : a.disabled ? 'rgba(147,142,136,0.5)' : T.muted }}>{a.label}</button>
      )) : null}
      {ready && deckArt && showDice && !props.toys && !hid.includes(CAT) ? (
        <button type="button" className="rk-die-label" ref={setLabel(CAT)} aria-label={`Decks. ${currentDeck?.label ?? ''}, ${currentDeck?.count ?? 0} cards. Choose a deck`} aria-haspopup="listbox"
          onClick={() => { const s = engine?.state(CAT); cue('ui:open', 'floatMenuOpen'); setRing(s ? { x: s.x, y: s.y } : { x: 74, y: height - 88 }); }}
          style={{ ...labelStyle, color: hoverKey === CAT ? T.ivory : T.goldText }}>{currentDeck?.label ?? ''}<span style={{ color: T.muted, marginLeft: 6 }}>{currentDeck?.count ?? ''}</span></button>
      ) : null}
      {/* The supply's markings: what each one throws out. */}
      {ready ? props.supply.filter((t) => !hid.includes(t.key)).map((t) => (
        <div key={`${t.key}${props.diceChest && t.key === 'src:die' ? ':chest' : ''}`} ref={setLabel(props.diceChest && t.key === 'src:die' ? t.key : t.token.kind === 'die' && t.token.dieType === 'duality' ? `${t.key}:h` : t.token.kind === 'die' && t.token.dieType === 'd100' ? `${t.key}:t` : t.key)} style={{ ...labelStyle, fontSize: 10.5, letterSpacing: 0.9, color: hoverKey && baseOf(hoverKey) === t.key ? T.ivory : T.muted, textTransform: t.token.kind === 'die' && !props.diceChest ? 'none' : 'uppercase' }}>{props.diceChest && t.key === 'src:die' ? 'Dice' : t.label}</div>
      )) : null}
      {/* Small, so it never crowds the row (owner, v0.47.8); the minute's wait shows while there is one. */}
      {/* Its name is gone (owner, v0.47.11): the cards in stock, and how long until the next. */}
      {ready && props.domat && !hid.includes(DOMAT_KEY) ? (
        <div ref={setLabel(DOMAT_KEY)} aria-label={`Deck of Many Things: ${props.domat.stock} in stock${props.domat.wait ? `, next in ${props.domat.wait} seconds` : ''}`}
          style={{ ...labelStyle, fontSize: 10.5, letterSpacing: 0.6, color: hoverKey === DOMAT_KEY ? T.ivory : T.muted, fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ color: props.domat.stock ? T.goldText : T.muted }}>{props.domat.stock}</span>
          {props.domat.wait ? <span style={{ marginLeft: 6 }}>{`${Math.floor(props.domat.wait / 60)}:${String(props.domat.wait % 60).padStart(2, '0')}`}</span> : null}
        </div>
      ) : null}
      {/* Plain buttons instead of dice (or when there is no WebGL), so nothing is lost. */}
      {controls === 'buttons' || (failed && controls === 'dice') ? (
        <div data-ui="" ref={(el) => { if (el && (el.offsetWidth !== btnBox.w || el.offsetHeight !== btnBox.h)) setBtnBox({ w: el.offsetWidth, h: el.offsetHeight }); }} style={{ position: 'absolute', left: Math.min(bounds.right - btnBox.w - 6, Math.max(bounds.left + 6, places.ctl.x - btnBox.w / 2)), top: Math.min(bounds.bottom - btnBox.h - 6, Math.max(bounds.top + 6, places.ctl.y - btnBox.h / 2)), display: 'flex', flexDirection: places.ctl.dir === 'row' ? 'row' : 'column', gap: 8, zIndex: 21 }}>
          <TButton label={currentDeck ? `${currentDeck.label} ${currentDeck.count}` : 'Decks'} onPress={() => setRing({ x: places.ctl.x, y: places.ctl.y })} icon={<Glyph d={DIE_GLYPHS.cards} size={15} />} />
          {actions.map((a) => <TButton key={a.key} label={a.label} onPress={a.onPress} disabled={a.disabled} />)}
        </div>
      ) : null}
      {groups.map((g) => (
        <GroupHandle key={g.piece ?? g.g} box={g.box} label={g.label} dir={g.piece ? undefined : g.g === 'ctl' ? places.ctl.dir : g.g === 'sup' ? places.sup.dir : undefined}
          onMove={(x, y) => (g.piece ? props.onMovePiece(g.piece, x, y) : props.onMoveGroup(g.g, x, y))}
          onFlip={g.g === 'cat' || g.piece ? undefined : () => props.onFlipGroup(g.g as 'ctl' | 'sup')}
          chain={g.chain}
          hidden={g.keys ? g.keys.every((k) => props.hidden?.includes(k)) : undefined}
          onHide={g.keys && props.onHide ? () => props.onHide?.(g.keys!) : undefined}
          locked={g.keys ? g.keys.every((k) => props.locked?.includes(k)) : undefined}
          onLock={g.keys && props.onLock ? () => props.onLock?.(g.keys!) : undefined}
          onChain={g.chain === 'split' ? () => {
            // Split where they lie now, so nothing moves until it is dragged.
            const at: Record<string, { x: number; y: number }> = {};
            for (const k of g.g === 'ctl' ? ACTIONS : supKeys) { const h = homeOf(k); if (h) at[k] = h; }
            props.onSplitGroup(g.g as 'ctl' | 'sup', at);
          } : g.chain === 'join' ? () => props.onJoinGroup(g.g as 'ctl' | 'sup') : undefined} />
      ))}
      {/* The decks' glyphs, drawn once off-screen to be read back as pictures for the die. */}
      <div ref={glyphHost} aria-hidden="true" style={{ position: 'absolute', left: -10000, top: 0, width: 1, height: 1, overflow: 'hidden' }}>
        {decks.map((d) => <div key={d.key} data-deck={d.key} style={{ width: 48, height: 48 }}><CategoryGlyph category={d.key} meta={d.meta} /></div>)}
      </div>
      {ring ? <DeckRing at={ring} width={width} height={height} decks={decks} current={current} onPick={(c) => { setRing(null); if (c !== current) onPickDeck(c); }} onClose={() => { cue('ui:close', 'floatMenuClose'); setRing(null); }} onNewCategory={props.onNewCategory ? () => { setRing(null); props.onNewCategory?.(); } : undefined} /> : null}
      {engine && ready && deckArt && showDice && decks.length > 1 && !props.toys && !hid.includes(CAT) ? (
        <DeckArrows engine={engine} size={(catShape(decks.length) === 'd20' ? 112 : catShape(decks.length) === 'd12' ? 100 : catShape(decks.length) === 'd8' ? 94 : 84) * props.catSize}
          onStep={(dir) => { const i = decks.findIndex((d) => d.key === current); const next = decks[(i + dir + decks.length) % decks.length]; if (next) onPickDeck(next.key); }} />
      ) : null}
    </>
  );
});

/** A dashed frame round a row while settings are open: drag it to move the row, the arrows stand it on end. */
function GroupHandle({ box, label, dir, onMove, onFlip, chain, onChain, hidden, onHide, locked, onLock }: { box: Bounds; label: string; dir?: 'row' | 'column'; onMove: (x: number, y: number) => void; onFlip?: () => void; /** Split the row into pieces, or join a piece's row back up. */ chain?: 'split' | 'join'; onChain?: () => void; hidden?: boolean; onHide?: () => void; locked?: boolean; onLock?: () => void }) {
  const [hover, setHover] = useState(false);
  const start = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    const cx = (box.left + box.right) / 2, cy = (box.top + box.bottom) / 2;
    const move = (m: PointerEvent) => onMove(cx + m.clientX - sx, cy + m.clientY - sy);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); cue('ui:dragEnd', 'cardDragEnd', { volume: 0.5 }); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    cue('ui:dragStart', 'cardDragStart', { volume: 0.5 });
  };
  return (
    <div data-ui="" onPointerDown={start} onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}
      style={{ position: 'absolute', left: box.left, top: box.top, width: box.right - box.left, height: box.bottom - box.top, zIndex: 1250, cursor: 'move', border: `1.5px dashed ${hover ? T.goldBright : hidden ? 'rgba(147,142,136,0.55)' : 'rgba(224,181,99,0.6)'}`, background: hidden ? 'rgba(6,8,13,0.45)' : hover ? 'rgba(224,181,99,0.1)' : 'rgba(224,181,99,0.04)', boxSizing: 'border-box' }}>
      <div style={{ position: 'absolute', left: 0, ...(box.top < 30 ? { top: '100%', marginTop: 4 } : { top: -24 }), display: 'flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap' }}>
        <span style={{ color: T.goldText, fontFamily: T.bold, fontSize: 11.5, letterSpacing: 1, textTransform: 'uppercase', textShadow: '0 1px 3px #000' }}>{label}</span>
        {onFlip ? (
          <button type="button" title={dir === 'row' ? 'Stand the row on end' : 'Lay the row across'} aria-label={dir === 'row' ? `Run the ${label} down` : `Run the ${label} across`} onPointerDown={(e) => e.stopPropagation()} onClick={() => { cue('ui:tap', 'buttonTap', { volume: 0.5 }); onFlip(); }}
            style={{ all: 'unset', cursor: 'pointer', display: 'flex', padding: 2, background: T.panel, border: `1px solid ${T.goldSoft}` }}>
            <span style={{ display: 'flex', transform: dir === 'row' ? 'rotate(90deg)' : 'none' }}><Glyph d='<path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4"/>' size={14} /></span>
          </button>
        ) : null}
        {/* Split a row into pieces placed one by one, or join a piece back into its row (owner, v0.47.11). */}
        {chain && onChain ? (
          <button type="button" title={chain === 'split' ? 'Split the row: place each piece on its own' : 'Join these back into their row'} aria-label={chain === 'split' ? `Split the ${label}` : `Join ${label} back into its row`}
            onPointerDown={(e) => e.stopPropagation()} onClick={() => { cue('ui:confirm', 'cardSelect', { volume: 0.5 }); onChain(); }}
            style={{ all: 'unset', cursor: 'pointer', display: 'flex', padding: 2, background: T.panel, border: `1px solid ${T.goldSoft}` }}>
            <Glyph d={chain === 'split'
              ? '<path d="M9 15l-1.5 1.5a3.5 3.5 0 0 1-5-5L4 10"/><path d="M15 9l1.5-1.5a3.5 3.5 0 0 1 5 5L20 14"/><path d="M8 3v2.5M3 8h2.5M16 21v-2.5M21 16h-2.5"/>'
              : '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'} size={14} />
          </button>
        ) : null}
        {/* Hidden from play, seen only here while editing (owner, v0.47.14). */}
        {onHide ? (
          <button type="button" title={hidden ? 'Show on the table' : 'Hide from the table (still shown while editing)'} aria-label={hidden ? `Show the ${label}` : `Hide the ${label}`} aria-pressed={hidden}
            onPointerDown={(e) => e.stopPropagation()} onClick={() => { cue('ui:toggle', hidden ? 'panelOpen' : 'panelClose', { volume: 0.5 }); onHide(); }}
            style={{ all: 'unset', cursor: 'pointer', display: 'flex', padding: 2, background: hidden ? 'rgba(200,27,24,0.35)' : T.panel, border: `1px solid ${hidden ? T.red : T.goldSoft}` }}>
            <Glyph d={hidden
              ? '<path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z"/><path d="M4 4l16 16"/>'
              : '<path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z"/><circle cx="12" cy="12" r="2.5"/>'} size={14} />
          </button>
        ) : null}
        {/* Locked where it stands at play: never lifted, never moved (owner, v0.47.17). */}
        {onLock ? (
          <button type="button" title={locked ? 'Unlock: it can be moved again' : 'Lock it where it stands'} aria-label={locked ? `Unlock the ${label}` : `Lock the ${label}`} aria-pressed={locked}
            onPointerDown={(e) => e.stopPropagation()} onClick={() => { cue('domat:lock', 'cardSelect', { volume: 0.4 }); onLock(); }}
            style={{ all: 'unset', cursor: 'pointer', display: 'flex', padding: 2, background: locked ? 'rgba(224,181,99,0.3)' : T.panel, border: `1px solid ${locked ? T.goldBright : T.goldSoft}` }}>
            <Glyph d={locked
              ? '<rect x="5" y="11" width="14" height="9" rx="1"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'
              : '<rect x="5" y="11" width="14" height="9" rx="1"/><path d="M8 11V8a4 4 0 0 1 7.5-1.9"/>'} size={14} />
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
  return dieSpecs(d, finish).map((s) => ({ ...s, breakable: true }));
}
function dieSpecs(d: PoolDie, finish: Finish): DieSpec[] {
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
  const specs = pieceSpecs(t, finish);
  // A loose piece can be broken by a charged throw; a spawner or a card's token never.
  // Only a loose element token acts as one (a supply piece or a card's token never burns or slides).
  return t.key.startsWith('free:') ? specs.map((s) => ({ ...s, spec: { ...s.spec, breakable: true, element: t.element } })) : specs;
}
function pieceSpecs(t: TokenPiece, finish: Finish): { spec: DieSpec; face?: number; dx: number }[] {
  if (t.kind === 'chip') {
    return [{ spec: { key: t.key, shape: 'chip', size: 40 * t.scale, body: t.color ?? '#9A6B3C', edge: t.color ?? '#9A6B3C', ink: '#000', faces: [{ text: '' }], finish: 'stone' }, dx: 0 }];
  }
  const type = t.dieType ?? 'd6';
  const size = TOKEN_DIE_SIZE * t.scale;
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
 * The decks, compact (owner, v0.47.10): three at a time beside the deck die, with a mark above and below while there
 * are more that way, the wheel or the arrow keys walking through them, and New category at the end. Enter picks,
 * Escape closes.
 */
function DeckRing({ at, width, height, decks, current, onPick, onClose, onNewCategory }: { at: { x: number; y: number }; width: number; height: number; decks: TableDeck[]; current: CardCategory; onPick: (c: CardCategory) => void; onClose: () => void; onNewCategory?: () => void }) {
  const SHOW = 3;
  const [open, setOpen] = useState(false);
  // Rows: every deck, then New category.
  const n = decks.length + (onNewCategory ? 1 : 0);
  const [focus, setFocus] = useState(Math.max(0, decks.findIndex((d) => d.key === current)));
  const [first, setFirst] = useState(() => Math.min(Math.max(0, n - SHOW), Math.max(0, decks.findIndex((d) => d.key === current) - 1)));
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { const id = requestAnimationFrame(() => setOpen(true)); box.current?.focus(); return () => cancelAnimationFrame(id); }, []);
  const TW = 214, TH = 40, GAP = 5, ARROW = 16;
  const right = at.x < width / 2;
  const total = SHOW * (TH + GAP) - GAP + ARROW * 2;
  const top = Math.min(height - total - 10, Math.max(10, at.y - total / 2));
  const left = right ? Math.min(width - TW - 10, at.x + 64) : Math.max(10, at.x - 64 - TW);
  const move = (to: number) => {
    const f = (to + n) % n;
    setFocus(f);
    setFirst((s) => (f < s ? f : f >= s + SHOW ? f - SHOW + 1 : s));
    cue('ui:hover', 'floatMenuHighlight', { volume: 0.4 });
  };
  const scroll = (dir: number) => setFirst((s) => Math.min(Math.max(0, n - SHOW), Math.max(0, s + dir)));
  const choose = (i: number) => { if (i === decks.length) onNewCategory?.(); else { const d = decks[i]; if (d) onPick(d.key); } };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); move(focus + (e.key === 'ArrowDown' ? 1 : -1)); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(focus); }
  };
  const Mark = ({ up, on }: { up: boolean; on: boolean }) => (
    <button type="button" aria-label={up ? 'More decks above' : 'More decks below'} tabIndex={-1} disabled={!on} onClick={() => scroll(up ? -1 : 1)}
      style={{ all: 'unset', height: ARROW, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: on ? 'pointer' : 'default', opacity: on ? 1 : 0.15, transition: 'opacity 140ms' }}>
      <svg width="16" height="9" viewBox="0 0 16 9" aria-hidden="true"><path d={up ? 'M1 8 8 1l7 7' : 'M1 1l7 7 7-7'} fill="none" stroke={T.goldText} strokeWidth="1.6" /></svg>
    </button>
  );
  const rows = Array.from({ length: Math.min(SHOW, n) }, (_, k) => first + k);
  return (
    <>
      <div data-ui="" onPointerDown={(e) => { e.stopPropagation(); onClose(); }} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }} style={{ position: 'absolute', inset: 0, zIndex: 40 }} />
      <div ref={box} tabIndex={-1} role="listbox" aria-label="Decks" onKeyDown={onKey}
        onWheel={(e) => { e.stopPropagation(); scroll(e.deltaY > 0 ? 1 : -1); }}
        style={{ position: 'absolute', left, top, width: TW, zIndex: 41, outline: 'none', display: 'flex', flexDirection: 'column', gap: GAP, opacity: open ? 1 : 0, transform: open ? 'none' : `translateX(${right ? -14 : 14}px)`, transition: `opacity 160ms, transform 200ms ${T.ease}` }}>
        <Mark up on={first > 0} />
        {rows.map((i) => {
          const isNew = i === decks.length;
          const d = decks[i];
          const active = !isNew && d?.key === current;
          const lit = focus === i;
          return (
            <div key={isNew ? 'new' : d.key} role="option" aria-selected={active} onPointerEnter={() => { if (focus !== i) { setFocus(i); cue('ui:hover', 'floatMenuHighlight', { volume: 0.4 }); } }} onClick={() => choose(i)} style={{ height: TH, cursor: 'pointer' }}>
              <div style={{ height: '100%', clipPath: 'polygon(9px 0, calc(100% - 9px) 0, 100% 9px, 100% calc(100% - 9px), calc(100% - 9px) 100%, 9px 100%, 0 calc(100% - 9px), 0 9px)', background: active ? T.red : lit ? T.goldBright : isNew ? 'rgba(218,162,73,0.35)' : T.goldSoft, padding: 1.3, boxSizing: 'border-box' }}>
                <div style={{ width: '100%', height: '100%', clipPath: 'polygon(8.5px 0, calc(100% - 8.5px) 0, 100% 8.5px, 100% calc(100% - 8.5px), calc(100% - 8.5px) 100%, 8.5px 100%, 0 calc(100% - 8.5px), 0 8.5px)', background: active ? T.red : lit ? T.panelLit : 'rgba(14,17,22,0.97)', display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px 0 8px', boxSizing: 'border-box' }}>
                  {isNew ? (
                    <>
                      <div style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Glyph d='<path d="M12 5v14M5 12h14"/>' size={15} color={lit ? T.ivory : T.goldText} /></div>
                      <span style={{ flex: 1, color: lit ? T.ivory : T.goldText, fontFamily: Display.bold, fontSize: 12, letterSpacing: 0.9, textTransform: 'uppercase' }}>New category</span>
                    </>
                  ) : (
                    <>
                      <div style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'scale(0.66)' }}><CategoryGlyph category={d.key} meta={d.meta} /></div>
                      <span style={{ flex: 1, color: active || lit ? T.ivory : T.goldText, fontFamily: Display.bold, fontSize: 12, letterSpacing: 0.9, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.label}</span>
                      <span style={{ color: active ? 'rgba(253,252,247,0.8)' : T.muted, fontFamily: T.bold, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{d.count}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <Mark up={false} on={first + SHOW < n} />
      </div>
    </>
  );
}

/**
 * Two small arrows either side of the deck die (owner, v0.47.10): the deck before and the deck after, a click
 * away. They ride with the die and grow with it.
 */
function DeckArrows({ engine, size, onStep }: { engine: DiceEngine; size: number; onStep: (dir: 1 | -1) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // The die may not be on the table yet (its effect runs after this one): keep trying until it is.
    let t: ReturnType<typeof setTimeout> | undefined;
    const attach = () => { if (!engine.follow(CAT, el, true)) t = setTimeout(attach, 80); };
    attach();
    return () => { clearTimeout(t); engine.follow(CAT, el, false); };
  }, [engine]);
  const k = size / 84;
  const s = Math.round(16 * k);
  // Just clear of the die's edge (owner, v0.47.11: they sat too far out).
  const off = size * 0.45 + 1;
  const Arrow = ({ dir }: { dir: 1 | -1 }) => (
    <button type="button" data-ui="" aria-label={dir > 0 ? 'Next deck' : 'Previous deck'} onClick={() => { cue('deck:step', 'carouselScroll', { volume: 0.5 }); onStep(dir); }}
      style={{ all: 'unset', position: 'absolute', left: dir > 0 ? off : -off - s, top: -s / 2 - size * 0.05, width: s, height: s, cursor: 'pointer', pointerEvents: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.75, transition: 'opacity 140ms, transform 140ms' }}
      onPointerEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = `scale(1.2)`; }}
      onPointerLeave={(e) => { e.currentTarget.style.opacity = '0.75'; e.currentTarget.style.transform = 'none'; }}>
      <svg width={s} height={s} viewBox="0 0 10 10" aria-hidden="true"><path d={dir > 0 ? 'M3 1.5 8 5 3 8.5Z' : 'M7 1.5 2 5 7 8.5Z'} fill={T.goldText} stroke="rgba(0,0,0,0.6)" strokeWidth="0.6" /></svg>
    </button>
  );
  return (
    <div ref={ref} style={{ position: 'absolute', left: 0, top: 0, zIndex: 21, pointerEvents: 'none', willChange: 'transform' }}>
      <Arrow dir={-1} />
      <Arrow dir={1} />
    </div>
  );
}
