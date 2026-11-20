/**
 * The desktop play table (v0.47.0; v0.47.1 round two; v0.47.3 owner round four): everything right of the sheet is
 * one table seen from above. The hand lies along it as a carousel (bottom, middle or top; in an area of its own, or
 * on the open table) or laid out card by card on the felt; the cards you take out lie where you put them; the dice,
 * tokens and the Deck of Many Things move over all of it.
 *
 * Input priority: the table's buttons, then pieces, then cards. A right click on a piece flings it (hold to charge),
 * on a die rolls it, on the table opens its menu (dice presets first). Drag on the empty felt to select pieces.
 * Table settings (the cog, lower left) lies over the sheet while it is open, and the rows of pieces can be dragged
 * about while it is.
 *
 * Reads and writes the same carousel context the phone's hand does, so equipping, decks, favourites, tokens, moving
 * and deleting all go through the code paths they always have. A card's tokens are the card's: the hand draws them
 * flat, the table stands them up in 3D, from the same list.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { burn, type Flames } from '@/lib/flames';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { DesktopPortal } from '@/components/desktop-portal';
import { useDesktop } from '@/hooks/use-desktop';
import { catalogIdOf } from '@/features/cards/card-effects';
import { FORGED_H, FORGED_W } from '@/features/create/components/forged-card';
import type { CharacterFile } from '@/lib/character-file';
import { addDie, dualityVerdict, type PoolDie, poolTotal } from '@/lib/dice-pool';
import type { DicePreset } from '@/lib/dice-presets';
import { FAVORITES_CATEGORY } from '@/lib/favorites';
import { shouldShow } from '@/lib/onboarding-store';
import { playSfx } from '@/lib/sfx';
import type { CardCategory, CardItem } from '../card-data';
import { useCarousel } from '../carousel-context';
import { BakedTokenLayer, type PlacedToken } from '../components/card-tokens';
import { DIE_TYPES, type DieType, kindScale, nextDieType, placedKindScale, TOKEN_COLORS, TOKEN_FRAC, tokenFill } from '../components/card-tokens-data';
import type { DieSpec } from './dice-engine';
import { type CornerTone, EnabledCorner } from '../components/enabled-corner';
import { TraitCrossOut } from '../components/trait-cross-out';
import type { DiceTrayHandle } from '../sheet/dice-tray';
import type { DicePresetSlots } from '../sheet/dice-preset-slots';
import { SortPanel } from '../sheet/sort-panel';
import { BoardCards, maxW, MIN_W } from './board-cards';
import { type DeckLook } from './deck-look';
import { CardFace, DeskCarousel, type DeskCarouselHandle, type TableCard } from './desk-carousel';
import type { Bounds, Impact } from './dice-physics';
import { type DomatCard, DOMAT, DOMAT_START, type DomatStock, domatStock, drawDomat, type Element, ELEMENTS, elementWinner, takeDomat } from './domat';
import { LookPanel } from './look-panel';
import { RollPopup, type RollResult, rollSound } from './roll-dock';
import { type CardPose, DOMAT_KEY, type LoosePiece, type PlaceGroup, type Places, type SupplyPiece, SUPPLY_HALF, type TableAction, TableDice, type TableDiceHandle, type TableDeck, type TokenInfo, type TokenPiece } from './table-dice';
import { CardBreak, type CardBreakMode, DomatCardView, type Fx, FX_CSS, FxLayer, shake } from './table-fx';
import { type BoardCard, loadBoard, loadLook, loadSpread, saveBoard, saveLook, saveSpread, type SpreadPlace } from './table-store';
import { Chamfer, DIE_GLYPHS, Glyph, T, TButton } from './table-ui';

/** The sheet's dice state and its handle to the table (the traits and the presets roll through it). */
export type DeskDice = { up: boolean; onToggle: () => void; handleRef: { current: DiceTrayHandle | null }; presets: Omit<Parameters<typeof DicePresetSlots>[0], 'belt'> };
export type TablePanel = 'modifiers' | 'cards' | 'newCategory';

const NO_CARDS: CardItem[] = [];
/**
 * A held arrow (owner, v0.47.7): the scroll's own sound, each step a little sooner than the last (150 ms down to
 * 28 ms) and a little higher, climbing two octaves, so holding it feels like winding the deck up.
 */
const holdStep = (n: number) => Math.max(28, 150 * Math.pow(0.86, n));
const holdCents = (n: number) => Math.min(2400, n * 150);
const HAND_W = 170;
/** How far in from the table's edge each kind of wall stops the dice. */
const WALL: Record<DeckLook['walls'], number> = { none: 4, line: 8, stone: 20, brass: 10 };
const MATERIALS = ['wood', 'bone', 'iron'] as const;
/** The Flames card's elements on a die, and their light. */
const ELEMENT_DRESS: Record<Element, Partial<DieSpec>> = {
  fire: { body: '#c8371c', edge: '#ff9a4a', ink: '#fff2d8' },
  water: { body: '#1f5fbf', edge: '#5fb4ff', ink: '#e8f4ff' },
  ice: { body: '#cfeeff', edge: '#ffffff', ink: '#2a5a7a' },
};
const ELEMENT_TINT: Record<Element, string> = { fire: '#ff7a3c', water: '#4aa8ff', ice: '#d8f2ff' };

function cornerTone(ref: string, states: { permanent: Set<string>; modsOff: Set<string> }): CornerTone {
  if (states.modsOff.has(ref)) return 'muted';
  if (states.permanent.has(ref)) return 'permanent';
  return 'on';
}

const inside = (r: Bounds, x: number, y: number) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
const uidOf = () => `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const baseOf = (key: string) => key.replace(/:(h|f|t|u)$/, '');
let poolSeq = 0;
const poolId = () => `tp-${++poolSeq}`;

/** Where the hand's own tokens can be pressed to pop them off (owner, v0.47.3): one spot over each. */
function TokenSpots({ cardRef, tokens }: { cardRef: string; tokens: PlacedToken[] }) {
  return (
    <>
      {tokens.map((t) => {
        const d = TOKEN_FRAC * FORGED_W * placedKindScale(t.kind, t.dieType) * 1.1;
        return <div key={t.id} data-card-token={cardRef} data-token-id={t.id} title="Drag it off the card" style={{ position: 'absolute', left: t.x * FORGED_W - d / 2, top: t.y * FORGED_H - d / 2, width: d, height: d, borderRadius: '50%', pointerEvents: 'auto', cursor: 'grab' }} />;
      })}
    </>
  );
}

export function PlayTable({ characterId, dice, sortFile, onSortOpen, overlay: overlayProp, backRef, onOpen, onReady }: {
  characterId: string;
  /** The table has everything it needs on screen (its 3D models, the deck die's icons): the sheet's veil may lift. */
  onReady?: () => void;
  dice: DeskDice;
  sortFile?: CharacterFile;
  onSortOpen?: (open: boolean) => void;
  overlay: boolean;
  backRef: React.MutableRefObject<(() => boolean) | null>;
  onOpen: (p: TablePanel) => void;
}) {
  const desktop = useDesktop();
  const { width: winW, height: winH } = useWindowDimensions();
  const ctx = useCarousel();
  const { decks, category } = ctx;
  const deck = decks[category] ?? NO_CARDS;

  // ---------------------------------------------------------------- settings and layout
  const [look, setLookState] = useState<DeckLook>(() => loadLook(characterId));
  const lookRef = useRef(look);
  lookRef.current = look;
  const lookSave = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setLook = useCallback((l: DeckLook) => {
    setLookState(l);
    if (lookSave.current) clearTimeout(lookSave.current);
    lookSave.current = setTimeout(() => saveLook(l, characterId), 250);
  }, [characterId]);
  // Another character: their own table (a change still waiting to be saved goes to the one it was made for).
  const lookFor = useRef(characterId);
  useEffect(() => {
    if (lookFor.current === characterId) return;
    if (lookSave.current) { clearTimeout(lookSave.current); saveLook(lookRef.current, lookFor.current); }
    lookFor.current = characterId;
    setLookState(loadLook(characterId));
  }, [characterId]);
  const port = desktop?.port;
  const tableW = Math.max(200, winW - (port ? port.left + port.width : 0));
  const tableH = Math.max(200, winH);
  const pad = WALL[look.walls];
  const spread = look.handMode === 'spread';
  const handH = Math.round((tableH - pad * 2) * (look.areaSize / 100));
  const handTop = look.areaY >= 0
    ? Math.round(Math.min(tableH - pad - handH, Math.max(pad, look.areaY * tableH - handH / 2)))
    : look.areaPos === 'top' ? pad : look.areaPos === 'middle' ? Math.round((tableH - handH) / 2) : tableH - pad - handH;
  // Where the hand really is, for the open table and the area's edges: a dragged hand counts as top or bottom when it
  // touches that wall.
  const handPos: DeckLook['areaPos'] = look.areaY < 0 ? look.areaPos : handTop <= pad + 2 ? 'top' : handTop + handH >= tableH - pad - 2 ? 'bottom' : 'middle';
  const hand: Bounds = { left: pad, top: handTop, right: tableW - pad, bottom: handTop + handH };
  const play: Bounds = { left: pad, top: pad, right: tableW - pad, bottom: tableH - pad };
  const ownArea = look.areaMode === 'tray' && !spread;
  const openTop = ownArea && handPos === 'top' ? hand.bottom : pad;
  const openBottom = ownArea && handPos === 'bottom' ? hand.top : tableH - pad;

  /** Where each row of pieces lives, in px: from the look, kept on the table and out of the hand's own area. */
  const places = useMemo<Places>(() => {
    // A whole row stays on the table (half its length each way from its centre) and out of the hand's own area.
    const keepOut = (x: number, y: number, halfX: number, halfY: number) => {
      let yy = y;
      if (ownArea && yy + halfY > hand.top && yy - halfY < hand.bottom) {
        const up = hand.top - halfY - 8, down = hand.bottom + halfY + 8;
        yy = up > pad + halfY && (Math.abs(yy - up) < Math.abs(yy - down) || down > tableH - pad - halfY) ? up : down;
      }
      return { x: Math.min(tableW - pad - halfX, Math.max(pad + halfX, x)), y: Math.min(tableH - pad - halfY, Math.max(pad + halfY, yy)) };
    };
    const along = (n: number, gap: number) => ((n - 1) * gap) / 2 + 40;
    const ctl = look.ctlDir === 'row' ? keepOut(look.ctlX * tableW, look.ctlY * tableH, along(3, 94), 44) : keepOut(look.ctlX * tableW, look.ctlY * tableH, 44, along(3, 104));
    const sup = look.supDir === 'row' ? keepOut(look.supX * tableW, look.supY * tableH, SUPPLY_HALF.row, 40) : keepOut(look.supX * tableW, look.supY * tableH, 64, SUPPLY_HALF.column);
    const cat = keepOut(look.catX * tableW, look.catY * tableH, 56, 56);
    // Pieces split off their rows sit where they were put, kept on the table and out of the hand's own area.
    const apart: Record<string, { x: number; y: number }> = {};
    for (const [k, [fx, fy]] of Object.entries(look.apart)) apart[k] = keepOut(fx * tableW, fy * tableH, 40, 40);
    return { ctl: { ...ctl, dir: look.ctlDir, k: look.ctlSize }, sup: { ...sup, dir: look.supDir }, cat, apart };
  }, [look.ctlX, look.ctlY, look.ctlDir, look.ctlSize, look.supX, look.supY, look.supDir, look.catX, look.catY, look.apart, tableW, tableH, ownArea, hand.top, hand.bottom, pad]);  


  // ---------------------------------------------------------------- the hand
  const [menu, setMenu] = useState<{ id: string; x: number; y: number; board?: string } | null>(null);
  const [tableMenu, setTableMenu] = useState<{ x: number; y: number; piece?: { key: string; label: string; own?: boolean } } | null>(null);
  const [sorting, setSorting] = useState(false);
  const [settings, setSettings] = useState(false);
  /**
   * Controls hidden (the Storyteller): a corner button shows the control dice for a while in a column down the left,
   * the deck die above them (owner, v0.47.7: right click no longer has them).
   */
  const [peek, setPeek] = useState(false);
  /** The testing list of every Many Things card is open. */
  const [picking, setPicking] = useState(false);
  const peeking = peek && look.controls === 'hidden' && !settings;
  const peekPlaces = useMemo<Places>(() => {
    // One column down the left, clear of the corner buttons: the supply, then the deck die, then the control dice.
    const x = pad + 112;
    const top = Math.max(pad + 40, (openTop + openBottom) / 2 - 380);
    return { ...places, apart: undefined, sup: { x, y: top + 135, dir: 'column' }, cat: { x, y: top + 400 }, ctl: { x, y: top + 620, dir: 'column', k: places.ctl.k } };
  }, [places, openTop, openBottom, pad]);
  const overlay = overlayProp || sorting;
  useEffect(() => { onSortOpen?.(sorting); }, [sorting, onSortOpen]);
  useEffect(() => { setMenu(null); }, [category]);

  const toCard = useCallback((c: CardItem, withTokens = true): TableCard => {
    const ref = c.ref ?? c.id;
    const tokens: PlacedToken[] | undefined = withTokens ? ctx.cardTokens[ref] ?? ctx.cardTokens[c.id] : undefined;
    const cross = ctx.crossOuts[c.id];
    const on = ctx.enabledIds.has(ref);
    return {
      id: c.id,
      thumb: c.thumb,
      source: c.source,
      faces: c.faces,
      custom: c.live && !c.faces ? <View style={{ width: FORGED_W, height: FORGED_H }} pointerEvents="none">{c.live}</View> : undefined,
      overlay: on || tokens?.length || cross ? (
        <>
          {tokens?.length ? <View style={StyleSheet.absoluteFill}><BakedTokenLayer tokens={tokens} cardW={FORGED_W} cardH={FORGED_H} /></View> : null}
          {on ? <EnabledCorner width={FORGED_W} height={FORGED_H} tone={cornerTone(ref, ctx.cardStates)} /> : null}
          {cross ? <TraitCrossOut width={FORGED_W} height={FORGED_H} catalogId={catalogIdOf(c.id)} crossedTrait={cross} /> : null}
          {tokens?.length ? <TokenSpots cardRef={ref} tokens={tokens} /> : null}
        </>
      ) : undefined,
    };
  }, [ctx.cardTokens, ctx.crossOuts, ctx.enabledIds, ctx.cardStates]);
  const cards = useMemo(() => deck.map((c) => toCard(c)), [deck, toCard]);
  const allById = useMemo(() => {
    const m = new Map<string, CardItem>();
    for (const list of Object.values(decks)) for (const c of list ?? []) if (!m.has(c.id)) m.set(c.id, c);
    return m;
  }, [decks]);
  // On the table a card's tokens stand up as pieces, so its picture is drawn without them (but with the rest).
  const lookup = useCallback((id: string) => { const c = allById.get(id); return c ? toCard(c, false) : undefined; }, [allById, toCard]);
  const refOf = useCallback((id: string) => { const c = allById.get(id); return c ? c.ref ?? c.id : id; }, [allById]);

  const carRef = useRef<DeskCarouselHandle>(null);
  const keyCue = useRef<{ cents: number; at: number } | null>(null);
  const held = useRef({ n: 0, last: 0 });
  const onCentre = useCallback(() => {
    const cue = keyCue.current;
    keyCue.current = null;
    if (cue && performance.now() - cue.at < 400) playSfx('carouselScroll', { cents: cue.cents });
    else playSfx('carouselScroll');
  }, []);

  // ---------------------------------------------------------------- cards on the table (copies, or the laid-out hand)
  const [copies, setCopiesState] = useState<BoardCard[]>(() => loadBoard(characterId));
  const [spreadAt, setSpreadState] = useState<Record<string, SpreadPlace>>(() => loadSpread(characterId));
  useEffect(() => { setCopiesState(loadBoard(characterId)); setSpreadState(loadSpread(characterId)); }, [characterId]);
  const boardSave = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setCopies = useCallback((next: BoardCard[]) => {
    setCopiesState(next);
    if (boardSave.current) clearTimeout(boardSave.current);
    boardSave.current = setTimeout(() => saveBoard(characterId, next), 300);
  }, [characterId]);
  const spreadSave = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setSpread = useCallback((next: Record<string, SpreadPlace>) => {
    setSpreadState(next);
    if (spreadSave.current) clearTimeout(spreadSave.current);
    spreadSave.current = setTimeout(() => saveSpread(characterId, next), 300);
  }, [characterId]);
  /** The laid-out hand: every card of this deck, where it was left or dealt into a grid. */
  const spreadCards = useMemo<BoardCard[]>(() => {
    if (!spread) return [];
    const w = Math.min(maxW(tableH), Math.max(MIN_W, Math.round(look.size * 0.8)));
    const h = (w * FORGED_H) / FORGED_W;
    const left = pad + 40 + w / 2, top = pad + 140 + h / 2;
    const cols = Math.max(1, Math.floor((tableW - pad * 2 - 160) / (w + 18)));
    let n = 0;
    return deck.map((c) => {
      const p = spreadAt[c.id];
      if (p) return { uid: `s:${c.id}`, id: c.id, fx: p.fx, fy: p.fy, w: p.w, rot: p.rot ?? 0, phys: p.phys, face: p.face };
      const i = n++;
      const x = left + (i % cols) * (w + 18), y = Math.min(tableH - pad - h / 2, top + Math.floor(i / cols) * (h * 0.55));
      return { uid: `s:${c.id}`, id: c.id, fx: x / tableW, fy: y / tableH, w, rot: 0 };
    });
  }, [spread, deck, spreadAt, look.size, tableW, tableH, pad]);
  /** The playground (owner, v0.47.12): the whole hand let loose on the table as physical cards, not kept. */
  const [playground, setPlayground] = useState(false);
  const playRef = useRef(playground);
  playRef.current = playground;
  const [pgCards, setPgCards] = useState<BoardCard[]>([]);
  const board = useMemo(() => (spread ? spreadCards : playground ? [...copies, ...pgCards] : copies), [spread, spreadCards, playground, copies, pgCards]);
  const setBoard = useCallback((next: BoardCard[]) => {
    if (!lookRef.current || lookRef.current.handMode !== 'spread') {
      if (playRef.current) setPgCards(next.filter((b) => b.uid.startsWith('pg:')));
      setCopies(next.filter((b) => !b.uid.startsWith('pg:')));
      return;
    }
    const out = { ...spreadAtRef.current };
    for (const b of next) out[b.id] = { fx: b.fx, fy: b.fy, w: b.w, rot: b.rot, phys: b.phys, face: b.face };
    setSpread(out);
  }, [setCopies, setSpread]);
  const spreadAtRef = useRef(spreadAt);
  spreadAtRef.current = spreadAt;
  const boardRef = useRef(board);
  boardRef.current = board;
  /** The cards with a physical copy on the table: their tokens are locked (the hand's copy shares them). */
  const physRefs = useRef(new Set<string>());
  physRefs.current = new Set(board.filter((b) => b.phys).map((b) => refOf(b.id)));

  const tableRef = useRef<HTMLDivElement>(null);
  const [tableEl, setTableEl] = useState<HTMLDivElement | null>(null);
  const handRef = useRef<HTMLDivElement>(null);
  /** Over the hand: a card dropped there goes back. */
  const overHand = useCallback((x: number, y: number) => {
    const r = handRef.current?.getBoundingClientRect();
    return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }, []);
  const local = (clientX: number, clientY: number) => {
    const r = tableRef.current?.getBoundingClientRect();
    return r ? { x: clientX - r.left, y: clientY - r.top } : { x: 0, y: 0 };
  };

  // A copy in the hand: it follows the pointer until it is put down on the table (or back on the hand).
  /** Where it came from (the card as drawn in the hand) and where the pointer was; it moves itself from there. */
  const [copy, setCopy] = useState<{ card: TableCard; x: number; y: number; w: number; px: number; py: number } | null>(null);
  const takeCopy = useCallback((card: TableCard, rect: DOMRect, p: { x: number; y: number }) => {
    const root = tableRef.current?.getBoundingClientRect();
    if (!root) return;
    playSfx('cardDragStart');
    setCopy({ card, x: rect.left - root.left + rect.width / 2, y: rect.top - root.top + rect.height / 2, w: rect.width, px: p.x - root.left, py: p.y - root.top });
  }, []);
  useEffect(() => {
    if (!copy) return;
    const root = tableRef.current;
    if (!root) return;
    const down = (e: PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const r = root.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      if (e.button === 0 && inside({ left: 0, top: 0, right: r.width, bottom: r.height }, x, y) && !overHand(e.clientX, e.clientY)) {
        const w = Math.min(maxW(r.height), Math.max(MIN_W, HAND_W));
        const h = (w * FORGED_H) / FORGED_W;
        const fx = Math.min(r.width - w / 2 - 4, Math.max(w / 2 + 4, x)) / r.width;
        const fy = Math.min(r.height - h / 2 - 4, Math.max(h / 2 + 4, y)) / r.height;
        playSfx('cardDragEnd');
        setCopies([...copiesRef.current, { uid: uidOf(), id: copy.card.id, fx, fy, w, rot: 0 }]);
      } else {
        playSfx('cardDeselect', { volume: 0.6 });
      }
      setCopy(null);
    };
    window.addEventListener('pointerdown', down, true);
    return () => window.removeEventListener('pointerdown', down, true);
  }, [copy?.card, setCopies, overHand]); // eslint-disable-line react-hooks/exhaustive-deps
  const copiesRef = useRef(copies);
  copiesRef.current = copies;

  const onCentreClick = useCallback((card: TableCard, rect: DOMRect, p: { x: number; y: number }) => {
    if (look.clickPull) takeCopy(card, rect, p);
    else if (look.centreClick === 'equip') ctx.toggleCard(card.id);
  }, [look.clickPull, look.centreClick, takeCopy, ctx]);
  /**
   * Throw on the table (owner, v0.47.8): a copy leaves the hand as a physical card, flung towards the middle of the
   * felt, turning as it goes.
   */
  const throwCopy = useCallback((id: string) => {
    const el = handRef.current?.querySelector(`[data-card-id="${CSS.escape(id)}"]`) as HTMLElement | null;
    const root = tableRef.current?.getBoundingClientRect();
    if (!el || !root) return;
    const r = el.getBoundingClientRect();
    const w = Math.min(maxW(tableH), Math.max(MIN_W, HAND_W));
    const h = (w * FORGED_H) / FORGED_W;
    const x = Math.min(tableW - pad - w / 2, Math.max(pad + w / 2, r.left - root.left + r.width / 2));
    // It starts just outside the hand's own area, on the open side.
    const yIn = r.top - root.top + r.height / 2;
    const y = ownArea && handPos === 'bottom' ? hand.top - h / 2 - 6 : ownArea && handPos === 'top' ? hand.bottom + h / 2 + 6 : yIn;
    const uid = uidOf();
    setCopies([...copiesRef.current, { uid, id, fx: x / tableW, fy: Math.min(tableH - pad - h / 2, Math.max(pad + h / 2, y)) / tableH, w, rot: Math.round((Math.random() - 0.5) * 20), phys: true }]);
    const ang = Math.atan2((openTop + openBottom) / 2 - y, tableW / 2 - x) + (Math.random() - 0.5) * 0.9;
    const sp = 1900 + Math.random() * 900;
    playSfx('cardDragStart', { volume: 0.8, cents: 200 });
    let tries = 0;
    const go = () => {
      if (diceRef.current?.engine()?.throwCard(`card:${uid}`, Math.cos(ang) * sp, Math.sin(ang) * sp, (Math.random() - 0.5) * 9) || ++tries > 20) return;
      setTimeout(go, 30);
    };
    setTimeout(go, 30);
  }, [tableW, tableH, pad, ownArea, handPos, hand.top, hand.bottom, openTop, openBottom, setCopies]);  

  // ---------------------------------------------------------------- cards and their tokens, as the engine sees them
  const sizeOf = (b: BoardCard) => {
    const w = Math.min(maxW(tableH), Math.max(MIN_W, b.w));
    return { w, h: (w * FORGED_H) / FORGED_W };
  };
  const cardPoses = useMemo<CardPose[]>(() => board.map((b) => {
    const { w, h } = sizeOf(b);
    return { key: `card:${b.uid}`, x: b.fx * tableW, y: b.fy * tableH, w, h, rot: b.rot ?? 0, phys: !!b.phys };
  }), [board, tableW, tableH]); // eslint-disable-line react-hooks/exhaustive-deps
  const pieces = useMemo<TokenPiece[]>(() => {
    const out: TokenPiece[] = [];
    for (const b of board) {
      const item = allById.get(b.id);
      if (!item) continue;
      const toks = ctx.cardTokens[item.ref ?? item.id] ?? ctx.cardTokens[b.id] ?? [];
      const { w, h } = sizeOf(b);
      for (const t of toks) {
        out.push({
          key: `tok:${b.uid}:${t.id}`, card: `card:${b.uid}`, lx: (t.x - 0.5) * w, ly: (t.y - 0.5) * h,
          kind: t.kind === 'die' ? 'die' : 'chip', dieType: t.dieType, value: t.dieValue, value2: t.dieValue2, color: tokenFill(t), scale: kindScale(t.kind),
        });
      }
    }
    return out;
  }, [board, allById, ctx.cardTokens, tableH]); // eslint-disable-line react-hooks/exhaustive-deps
  const tokenOf = (key: string) => {
    const [, uid, id] = key.split(':');
    const b = boardRef.current.find((x) => x.uid === uid);
    return b ? { ref: refOf(b.id), id } : null;
  };
  /**
   * The card under a point and where on it the point is: a laid card (its turn undone) or one in the hand. A token
   * dropped there is anchored to that card.
   */
  const cardAt = useCallback((clientX: number, clientY: number): { ref: string; uid?: string; x: number; y: number } | null => {
    // The card lit in the hand is drawn lifted and zoomed off its slot: a drop lands where it is drawn.
    const lit = carRef.current?.hoveredFace();
    const lr = lit?.face.getBoundingClientRect();
    if (lit && lr && clientX >= lr.left && clientX <= lr.right && clientY >= lr.top && clientY <= lr.bottom && lit.el.dataset.cardId) {
      return { ref: refOf(lit.el.dataset.cardId), x: (clientX - lr.left) / lr.width, y: (clientY - lr.top) / lr.height };
    }
    const el = document.elementsFromPoint(clientX, clientY).find((n) => (n as HTMLElement).dataset?.boardCard || (n as HTMLElement).dataset?.slot) as HTMLElement | undefined;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    let id: string | undefined;
    let x: number, y: number;
    if (el.dataset.boardCard) {
      const b = boardRef.current.find((c) => c.uid === el.dataset.boardCard);
      if (!b) return null;
      id = b.id;
      const a = (-(Number(el.dataset.rot) || 0) * Math.PI) / 180;
      const dx = clientX - (r.left + r.width / 2), dy = clientY - (r.top + r.height / 2);
      const w = el.offsetWidth, h = el.offsetHeight;
      x = 0.5 + (dx * Math.cos(a) - dy * Math.sin(a)) / w;
      y = 0.5 + (dx * Math.sin(a) + dy * Math.cos(a)) / h;
    } else {
      id = el.dataset.cardId;
      x = (clientX - r.left) / r.width;
      y = (clientY - r.top) / r.height;
    }
    if (!id || x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { ref: refOf(id), uid: el.dataset.boardCard, x, y };
  }, [refOf]);

  // ---------------------------------------------------------------- the supply and the loose pieces
  const [supplyDie, setSupplyDie] = useState<DieType>('d6');
  const [material, setMaterial] = useState<(typeof MATERIALS)[number]>('wood');
  // The colour token's colour lives here while the wheel turns, and reaches the sheet only once it stops: every
  // write to the sheet re-renders all of it, which is what made scrolling the supply lag (owner, v0.47.4).
  const [supColor, setSupColor] = useState(() => ctx.tokenColor || TOKEN_COLORS[0]);
  useEffect(() => { if (ctx.tokenColor) setSupColor(ctx.tokenColor); }, [ctx.tokenColor]);
  const colorSave = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supply = useMemo<SupplyPiece[]>(() => (!playground && (look.tokenTray || peeking) ? [
    { key: 'src:mat', token: { kind: material }, label: material },
    { key: 'src:color', token: { kind: 'color', color: supColor }, label: 'Colour' },
    { key: 'src:die', token: { kind: 'die', dieType: supplyDie, dieValue: 1, dieValue2: supplyDie === 'duality' ? 1 : undefined }, label: supplyDie === 'duality' ? 'Hope & Fear' : supplyDie },
  ] : []), [look.tokenTray, peeking, playground, supColor, supplyDie, material]);
  const looseKey = `runekeep.table.loose.${characterId}`;
  const [loose, setLooseState] = useState<LoosePiece[]>(() => { try { return JSON.parse(localStorage.getItem(looseKey) ?? '[]') as LoosePiece[]; } catch { return []; } });
  const looseRef = useRef(loose);
  looseRef.current = loose;
  const setLoose = useCallback((next: LoosePiece[]) => {
    looseRef.current = next;
    setLooseState(next);
    try { localStorage.setItem(looseKey, JSON.stringify(next)); } catch { /* private window */ }
  }, [looseKey]);
  const newTokenId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const diceRef = useRef<TableDiceHandle>(null);
  const rolledDice = useRef(new Map<string, PoolDie>());

  /**
   * A piece let go somewhere (owner, v0.47.3): on a card it is anchored to that card (moving there if it was on
   * another); on the supply it is put away; anywhere else a card's token comes loose and a loose one stays where it
   * lies. A die from a roll dropped on a card becomes that card's token die, showing what it rolled.
   */
  const dropToken = useCallback((key: string, clientX: number, clientY: number): boolean => {
    const base = baseOf(key);
    const isLoose = base.startsWith('free:');
    const isRoll = base.startsWith('roll:');
    let info: TokenInfo | undefined;
    let from: { ref: string; id: string; uid: string } | null = null;
    if (isLoose) info = looseRef.current.find((t) => t.key === base)?.token;
    else if (isRoll) {
      const d = rolledDice.current.get(base.slice(5));
      if (d) info = d.side ? { kind: 'die', dieType: 'duality', dieValue: d.value ?? 1, dieValue2: 1 } : { kind: 'die', dieType: d.type, dieValue: d.value ?? 1 };
    } else if (base.startsWith('tok:')) {
      const [, uid, id] = base.split(':');
      const b = boardRef.current.find((x) => x.uid === uid);
      if (!b) return false;
      const ref = refOf(b.id);
      const t = (ctx.cardTokens[ref] ?? []).find((x) => x.id === id);
      if (!t) return false;
      info = { kind: t.kind, color: t.color, dieType: t.dieType, dieValue: t.dieValue, dieValue2: t.dieValue2 };
      from = { ref, id, uid };
    }
    if (!info) return false;
    const p = local(clientX, clientY);
    // Over the supply: put it away.
    const eng = diceRef.current?.engine();
    const overSupply = !isRoll && eng && supply.some((s) => { const st = eng.state(s.key) ?? eng.state(`${s.key}:h`) ?? eng.state(`${s.key}:t`); return st && Math.hypot(st.x - p.x, st.y - p.y) < 34; });
    if (overSupply) {
      playSfx('tokenRemove');
      if (isLoose) setLoose(looseRef.current.filter((t) => t.key !== base));
      else if (from) ctx.removeToken(from.ref, from.id);
      return true;
    }
    // A physical card takes no tokens and gives none up until it is ordinary again (owner, v0.47.5).
    const hit = cardAt(clientX, clientY);
    const target = hit && !physRefs.current.has(hit.ref) ? hit : null;
    if (target) {
      if (from && target.uid === from.uid) { ctx.updateToken(from.ref, from.id, { x: target.x, y: target.y }); return true; }
      if (from) ctx.removeToken(from.ref, from.id);
      if (isLoose) setLoose(looseRef.current.filter((t) => t.key !== base));
      if (isRoll) { eng?.remove(key); for (const k of eng?.keys() ?? []) if (baseOf(k) === base) eng?.remove(k); }
      ctx.placeToken(target.ref, { id: newTokenId(), ...info, x: target.x, y: target.y } as PlacedToken);
      playSfx('placeToken');
      return true;
    }
    if (from) {
      // Off its card: it comes loose where it was let go.
      ctx.removeToken(from.ref, from.id);
      setLoose([...looseRef.current, { key: `free:${newTokenId()}`, token: info, x: p.x, y: p.y }]);
      playSfx('cardDragEnd', { volume: 0.5 });
      return true;
    }
    return false;
  }, [cardAt, ctx, refOf, setLoose, supply]);  

  const popToken = useCallback((ref: string, id: string): TokenInfo | null => {
    if (physRefs.current.has(ref)) return null;
    const t = (ctx.cardTokens[ref] ?? []).find((x) => x.id === id);
    if (!t) return null;
    ctx.removeToken(ref, id);
    return { kind: t.kind, color: t.color, dieType: t.dieType, dieValue: t.dieValue, dieValue2: t.dieValue2 };
  }, [ctx]);

  // ---------------------------------------------------------------- rolling: presets, traits, selections
  const [result, setResult] = useState<RollResult | null>(null);
  const rollFrom = useRef<{ x: number; y: number } | null>(null);
  const rolling = useRef(false);
  const throwPool = useCallback(async (list: PoolDie[], m: { label: string | null; value: number }) => {
    if (!list.length || rolling.current || !diceRef.current) return;
    rolling.current = true;
    setResult(null);
    const from = rollFrom.current ?? { x: (play.left + play.right) / 2, y: (openTop + openBottom) / 2 + 60 };
    rollFrom.current = null;
    for (const d of list) rolledDice.current.set(d.id, d);
    const landed = await diceRef.current.roll(list, from);
    rolling.current = false;
    for (const d of landed) rolledDice.current.set(d.id, d);
    rollSound(landed);
    setResult({ total: poolTotal(landed, m.value), verdict: dualityVerdict(landed), dice: landed, label: m.label, mod: m.value });
  }, [play.left, play.right, openTop, openBottom]);
  const selRef = useRef<string[]>([]);
  // The sheet's handle: a trait or a preset rolls here, on the table (owner, v0.47.3: no dice bar).
  useEffect(() => {
    const h: DiceTrayHandle = {
      rollDuality: (label, value) => {
        const pairId = poolId();
        void throwPool([{ id: poolId(), type: 'd12', value: null, side: 'hope', pairId }, { id: poolId(), type: 'd12', value: null, side: 'fear', pairId }], { label, value });
      },
      playPreset: (types, label, value) => {
        let built: PoolDie[] = [];
        for (const t of types) built = addDie(built, t, poolId);
        void throwPool(built, { label, value });
      },
      currentDice: () => selectedTypes(selRef.current),
    };
    dice.handleRef.current = h;
    return () => { if (dice.handleRef.current === h) dice.handleRef.current = null; };
  });  
  const reroll = useCallback((id: string, value: number) => {
    const d = rolledDice.current.get(id);
    if (d) rolledDice.current.set(id, { ...d, value });
    setResult((r) => {
      if (!r) return r;
      const dice2 = r.dice.map((x) => (x.id === id ? { ...x, value } : x));
      return { ...r, dice: dice2, total: poolTotal(dice2, r.mod), verdict: dualityVerdict(dice2) };
    });
  }, []);

  /** The kinds of dice among selected pieces, as a preset stores them. */
  const selectedTypes = (keys: string[]): DieType[] => {
    const out: DieType[] = [];
    const seen = new Set<string>();
    for (const k of keys) {
      const base = baseOf(k);
      if (seen.has(base)) continue;
      seen.add(base);
      if (base.startsWith('roll:')) {
        const d = rolledDice.current.get(base.slice(5));
        if (!d) continue;
        if (d.side) { if (d.side === 'hope') out.push('duality'); continue; }
        out.push(d.type);
        continue;
      }
      const t = looseRef.current.find((l) => l.key === base)?.token;
      if (t?.kind === 'die') out.push(t.dieType ?? 'd6');
    }
    return out;
  };
  const [selection, setSelection] = useState<string[]>([]);
  /**
   * The selection bar sits at the top of the open table and the roll's plaque under it, as wide as it (owner,
   * v0.47.13: they covered each other; the longer bar on top, the result below with room between), and the Many
   * Things row under whichever is lowest.
   */
  const [barBox, setBarBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = tableRef.current?.querySelector('[data-sel-bar]') as HTMLElement | null;
    const w = el?.offsetWidth ?? 0, h = el?.offsetHeight ?? 0;
    if (w !== barBox.w || h !== barBox.h) setBarBox({ w, h });
  });
  const [plaqueH, setPlaqueH] = useState(0);
  useLayoutEffect(() => {
    if (!result) { setPlaqueH(0); return; }
    const el = document.querySelector('[data-roll-plaque]') as HTMLElement | null;
    setPlaqueH(el ? el.offsetHeight : 80);
  }, [result]);
  selRef.current = selection;
  const selTypes = selectedTypes(selection);

  // ---------------------------------------------------------------- the Deck of Many Things
  const [drawn, setDrawn] = useState<{ uid: string; card: DomatCard; x: number; y: number; from: { x: number; y: number }; snap: Map<string, { x: number; y: number }>; held?: boolean }[]>([]);
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [fx, setFx] = useState<Fx[]>([]);
  const [shattering, setShattering] = useState<{ uid: string; card: TableCard; cx: number; cy: number; w: number; rot: number; mode: CardBreakMode; dir?: { x: number; y: number } }[]>([]);
  const fxSeq = useRef(0);
  const addFx = useCallback((f: Omit<Fx, 'id'>) => {
    const id = ++fxSeq.current;
    setFx((l) => [...l, { ...f, id }]);
    setTimeout(() => setFx((l) => l.filter((x) => x.id !== id)), f.ms + 60);
    return id;
  }, []);
  /**
   * The deck's stock (owner, v0.47.11): a card grows every 200 seconds, up to ten, and each draw takes one. Kept per
   * character, so a reload neither refills nor empties it.
   */
  const domatKey = `runekeep.table.domat2.${characterId}`;
  const [stockSaved, setStockSaved] = useState<DomatStock>(() => {
    try { const s = JSON.parse(localStorage.getItem(domatKey) ?? 'null') as DomatStock | null; if (s) return s; } catch { /* broken: start afresh */ }
    return { stock: DOMAT_START, since: Date.now() };
  });
  const [, tickClock] = useState(0);
  const stockNow = domatStock(stockSaved, Date.now());
  const domatWait = stockNow.next === null ? 0 : Math.ceil(stockNow.next / 1000);
  useEffect(() => {
    if (!domatWait) return;
    const t = setInterval(() => tickClock((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [domatWait > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Draw a card: thrown out beside the deck, or (`held`) straight into the hand at that point. `pick` skips the stock. */
  const drawCard = useCallback((from: { x: number; y: number }, opts?: { held?: { x: number; y: number }; pick?: DomatCard }) => {
    // Development only: `__rkNextDomat = 'comet'` in the console picks the next card, to check each effect.
    const forced = opts?.pick ?? (__DEV__ ? DOMAT.find((c) => c.id === (globalThis as { __rkNextDomat?: string }).__rkNextDomat) : undefined);
    const now = Date.now();
    const after = forced ? null : takeDomat(stockSaved, now);
    if (!forced && !after) {
      // None in stock: the deck shudders, and its label shows how long until the next.
      playSfx('cardDisable', { volume: 0.5 });
      const eng = diceRef.current?.engine();
      eng?.jitter(DOMAT_KEY, 0.45);
      setTimeout(() => eng?.jitter(DOMAT_KEY, 0), 320);
      return;
    }
    const card = forced ?? drawDomat(gone);
    if (!card) { playSfx('cardDisable', { volume: 0.5 }); return; }
    if (after) {
      setStockSaved(after);
      try { localStorage.setItem(domatKey, JSON.stringify(after)); } catch { /* private window */ }
    }
    if (card.once) setGone((g) => new Set([...g, card.id]));
    playSfx('cardFullscreenEnter', { volume: 0.7 });
    addFx({ kind: 'rune', x: from.x, y: from.y, r: 90, ms: 900, tint: card.tint });
    addFx({ kind: 'spark', x: from.x, y: from.y, r: 80, ms: 600, tint: '#fff3d6' });
    // Where everything lay when it was drawn: the Fates card puts it all back.
    const eng = diceRef.current?.engine();
    const snap = new Map<string, { x: number; y: number }>();
    for (const k of [...(eng?.keys() ?? []), ...(eng?.cardKeys() ?? [])]) { const s = eng!.state(k); if (s && !k.startsWith('tok:') && !k.startsWith('src:')) snap.set(k, { x: s.x, y: s.y }); }
    if (opts?.held) { setDrawn((d) => [...d, { uid: uidOf(), card, x: opts.held!.x, y: opts.held!.y, from: opts.held!, snap, held: true }]); return; }
    const ang = Math.random() * Math.PI * 2;
    const x = Math.min(tableW - pad - 70, Math.max(pad + 70, from.x + Math.cos(ang) * 130));
    const y = Math.min(tableH - pad - 90, Math.max(pad + 90, from.y + Math.abs(Math.sin(ang)) * 120 + 40));
    setDrawn((d) => [...d, { uid: uidOf(), card, x, y, from, snap }]);
  }, [gone, tableW, tableH, pad, stockSaved, domatKey, addFx]);

  /**
   * A card breaking (owner, v0.47.12): torn, cut clean, burnt or blown apart (see CardBreak). A copy goes; a laid-out
   * hand card comes back a moment later as an ordinary card where it was.
   */
  const breakCard = useCallback((b: BoardCard, mode: CardBreakMode, dir?: { x: number; y: number }) => {
    const card = lookup(b.id);
    if (!card) return;
    const { w } = sizeOf(b);
    const p = livePoses.get(b.uid);
    livePoses.delete(b.uid);
    setShattering((s) => [...s, { uid: b.uid, card, cx: p?.x ?? b.fx * tableW, cy: p?.y ?? b.fy * tableH, w, rot: p?.rot ?? b.rot ?? 0, mode, dir }]);
    if (b.uid.startsWith('pg:')) setPgCards((l) => l.filter((c) => c.uid !== b.uid));
    else if (lookRef.current.handMode !== 'spread') setCopies(copiesRef.current.filter((c) => c.uid !== b.uid));
    else setBoard(boardRef.current.map((c) => (c.uid === b.uid ? { ...c, phys: false, rot: 0, ...(p ? { fx: p.x / tableW, fy: p.y / tableH } : {}) } : c)));
  }, [lookup, tableW, tableH, setCopies]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- what the Deck of Many Things leaves behind
  /** Effects still in play, each with how to undo it (Reset undoes them all, owner v0.47.12). */
  const [lasting, setLasting] = useState<{ id: string; name: string; tint: string; until: number | null }[]>([]);
  const undo = useRef(new Map<string, () => void>());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); };
  /** When each timed effect runs out (so drawing the card again restarts its clock instead of being cut short). */
  const lastTimer = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const endLasting = useCallback((id: string) => {
    clearTimeout(lastTimer.current.get(id));
    lastTimer.current.delete(id);
    const f = undo.current.get(id);
    undo.current.delete(id);
    f?.();
    setLasting((l) => l.filter((x) => x.id !== id));
  }, []);
  /** Record an effect now in play (the card has already ended any earlier one of the same kind, see runEffect). */
  const addLasting = (id: string, name: string, tint: string, ms: number | null, off: () => void) => {
    undo.current.set(id, off);
    setLasting((l) => [...l.filter((x) => x.id !== id), { id, name, tint, until: ms ? Date.now() + ms : null }]);
    if (ms) lastTimer.current.set(id, setTimeout(() => endLasting(id), ms));
  };
  const [cages, setCages] = useState<{ id: string; x: number; y: number; r: number }[]>([]);
  const [craters, setCraters] = useState<{ id: string; x: number; y: number }[]>([]);
  /** The low side of a tipping table darkens (the Balance): drawn straight onto this layer, no re-render. */
  const tiltRef = useRef<HTMLDivElement>(null);
  /** How lasting cards dress pieces: stone, gilded (locked), small, an element. Dressed again from scratch each time. */
  const stone = useRef(new Set<string>());
  const gilt = useRef(new Set<string>());
  const tiny = useRef(new Set<string>());
  const elements = useRef(new Map<string, Element>());
  const [cardEls, setCardEls] = useState<Record<string, Element>>({});
  const redress = useCallback((keys: string[]) => {
    const h = diceRef.current;
    if (!h) return;
    for (const k of keys) {
      if (k.startsWith('card:')) continue;
      const el = elements.current.get(baseOf(k));
      const parts: ((s: DieSpec) => Partial<DieSpec>)[] = [];
      if (el) parts.push(() => ELEMENT_DRESS[el]);
      if (stone.current.has(k)) parts.push(() => ({ body: '#5d625e', edge: '#7c827c', ink: '#2c302d', finish: 'stone' }));
      if (gilt.current.has(k)) parts.push(() => ({ body: '#B98734', edge: '#E0B563', ink: '#1a1206', finish: 'metal' }));
      if (tiny.current.has(k)) parts.push((s) => ({ size: s.size * 0.55 }));
      h.restyle([k], parts.length ? (s) => parts.reduce<Partial<DieSpec>>((acc, f) => ({ ...acc, ...f({ ...s, ...acc }) }), {}) : null);
    }
  }, []);
  /** Give a piece (by its base key) or a physical card an element, and dress it so. */
  const setElement = useCallback((key: string, el: Element) => {
    elements.current.set(key, el);
    if (key.startsWith('card:')) { setCardEls((c) => ({ ...c, [key.slice(5)]: el })); return; }
    redress(diceRef.current?.engine()?.keys().filter((k) => baseOf(k) === key) ?? []);
  }, [redress]);
  /** Fire, water and ice meeting (Card-Jitsu, owner v0.47.12): the loser is thrown off and takes the winner's element. */
  const lastClash = useRef(new Map<string, number>());
  const onKnock = useCallback((a: string, b: string) => {
    const eng = diceRef.current?.engine();
    if (!eng) return;
    // The Rogue pockets whatever loose piece it touches.
    const rogue = a.startsWith('fx:rogue') ? a : b.startsWith('fx:rogue') ? b : null;
    if (rogue) {
      const prey = rogue === a ? b : a;
      const base = baseOf(prey);
      const bag = pockets.current.get(rogue);
      const t = bag && (base.startsWith('free:') || base.startsWith('roll:')) ? tokenOfBase(base) : null;
      if (!bag || !t) return;
      bag.push({ key: base, token: t, x: 0, y: 0 });
      const s = eng.state(prey);
      for (const k of eng.keys()) if (baseOf(k) === base) eng.remove(k);
      setLoose(looseRef.current.filter((l) => l.key !== base));
      if (s) addFx({ kind: 'smoke', x: s.x, y: s.y, r: 60, ms: 500 });
      playSfx('tokenRemove', { volume: 0.5, cents: 400 });
      return;
    }
    if (!elements.current.size) return;
    const ka = a.startsWith('card:') ? a : baseOf(a), kb = b.startsWith('card:') ? b : baseOf(b);
    const ea = elements.current.get(ka), eb = elements.current.get(kb);
    if (!ea || !eb) return;
    const win = elementWinner(ea, eb);
    if (!win) return;
    const [loser, winner] = win === ea ? [b, a] : [a, b];
    const lk = win === ea ? kb : ka;
    const now = performance.now();
    if (now - (lastClash.current.get(lk) ?? 0) < 400) return;
    lastClash.current.set(lk, now);
    const ls = eng.state(loser), ws = eng.state(winner);
    if (!ls || !ws) return;
    const d = Math.hypot(ls.x - ws.x, ls.y - ws.y) || 1;
    const parts = loser.startsWith('card:') ? [loser] : eng.keys().filter((k) => baseOf(k) === lk);
    for (const k of parts) eng.toss(k, ((ls.x - ws.x) / d) * 1900, ((ls.y - ws.y) / d) * 1900, { gen: 2, power: 1.5 });
    setElement(lk, win);
    addFx({ kind: 'spark', x: ls.x, y: ls.y, r: 70, ms: 500, tint: ELEMENT_TINT[win] });
    playSfx(win === 'fire' ? 'loseHope' : win === 'water' ? 'cardDragEnd' : 'cardDisable', { volume: 0.45, cents: 300 });
  }, [setElement, setLoose, addFx]);  
  /** What a loose piece or a rolled die is, as a token (to keep it in a mimic or a thief's pocket). */
  const tokenOfBase = (base: string): TokenInfo | null => {
    if (base.startsWith('free:')) return looseRef.current.find((t) => t.key === base)?.token ?? null;
    const d = base.startsWith('roll:') ? rolledDice.current.get(base.slice(5)) : undefined;
    return d ? (d.side ? { kind: 'die', dieType: 'duality', dieValue: d.value ?? 1, dieValue2: 1 } : { kind: 'die', dieType: d.type, dieValue: d.value ?? 1 }) : null;
  };
  /** Pieces let out at a point, flung away from it. */
  const spill = (pieces: LoosePiece[], x: number, y: number) => {
    if (!pieces.length) return;
    const add = pieces.map((p, i) => ({ ...p, key: `free:${newTokenId()}${i}`, x, y }));
    setLoose([...looseRef.current, ...add]);
    setTimeout(() => {
      const eng = diceRef.current?.engine();
      for (const p of add) {
        const a = Math.random() * Math.PI * 2, s = 900 + Math.random() * 900;
        for (const k of eng?.keys().filter((kk) => baseOf(kk) === p.key) ?? []) eng?.toss(k, Math.cos(a) * s, Math.sin(a) * s, { gen: 2, power: 1.2 });
      }
    }, 60);
  };
  /** What the Rogue has pocketed, by thief. */
  const pockets = useRef(new Map<string, LoosePiece[]>());
  /** The Void's mimics: where each sits and what it swallowed. Kept, so a reload never loses what is inside. */
  const mimicKey = `runekeep.table.mimics.${characterId}`;
  const [mimics, setMimicsState] = useState<{ key: string; x: number; y: number; pieces: LoosePiece[] }[]>(() => { try { return JSON.parse(localStorage.getItem(mimicKey) ?? '[]'); } catch { return []; } });
  const mimicsRef = useRef(mimics);
  mimicsRef.current = mimics;
  const setMimics = useCallback((f: (m: typeof mimics) => typeof mimics) => {
    const next = f(mimicsRef.current);
    mimicsRef.current = next;
    setMimicsState(next);
    try { localStorage.setItem(mimicKey, JSON.stringify(next)); } catch { /* private window */ }
  }, [mimicKey]);
  const chestSpec = (key: string): DieSpec => ({ key, shape: lookRef.current.chest === 'cute' ? 'chest' : 'mimic', size: 92, body: '#8a5a2b', edge: '#E0B563', ink: '#000', faces: [], finish: 'stone' });
  /** A mimic right-clicked: it opens wide, spits out everything it swallowed and is gone. */
  const popMimic = useCallback((key: string) => {
    const eng = diceRef.current?.engine();
    const m = mimicsRef.current.find((q) => q.key === key);
    const s = eng?.state(key);
    if (!eng || !s) return;
    eng.mimic(key, 1);
    playSfx('cardFullscreenEnter', { volume: 0.8, cents: -400 });
    addFx({ kind: 'spark', x: s.x, y: s.y, r: 160, ms: 700, tint: '#c9a6f0' });
    setTimeout(() => {
      spill(m?.pieces ?? [], s.x, s.y);
      setMimics((l) => l.filter((q) => q.key !== key));
    }, 260);
    setTimeout(() => { if (eng.has(key)) { eng.shatter(key); addFx({ kind: 'smoke', x: s.x, y: s.y, r: 120, ms: 700 }); } }, 1100);
  }, [addFx, setMimics]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * A Deck of Many Things card plays out (v0.47.12, owner: "interesting more lasting effects", "things that can be
   * undone when i press the reset button"). Most cards now leave something behind for a while or until Reset: stone,
   * locks, a cage, elements, a mimic, a thief, ice, a tipping table. Pushes still carry on through what they hit, five
   * generations deep, the way a launched piece's do.
   */
  const runEffect = useCallback((d: { card: DomatCard; snap: Map<string, { x: number; y: number }> }, x: number, y: number) => {
    const eng = diceRef.current?.engine();
    const h = diceRef.current;
    if (!eng || !h) return;
    const { card } = d;
    const tint = card.tint;
    const diag = Math.hypot(tableW, tableH);
    const CHAIN = { gen: 5, power: 2.5 };
    const uid = uidOf();
    const looseKeys = () => eng.keys().filter((k) => k.startsWith('free:') || k.startsWith('roll:'));
    const near = (keys: string[], r: number) => keys.filter((k) => { const s = eng.state(k); return s && Math.hypot(s.x - x, s.y - y) < r; });
    const clampX = (v: number) => Math.min(play.right - 30, Math.max(play.left + 30, v));
    const clampY = (v: number) => Math.min(play.bottom - 30, Math.max(play.top + 30, v));
    const dropLoose = (keys: string[]) => {
      const bases = new Set(keys.map(baseOf));
      setLoose(looseRef.current.filter((t) => !bases.has(t.key)));
    };
    const shatterKeys = (keys: string[]) => { for (const k of keys) eng.shatter(k); dropLoose(keys); };
    const cardsNear = (r: number) => boardRef.current.filter((b) => { const p = livePoses.get(b.uid); return Math.hypot((p?.x ?? b.fx * tableW) - x, (p?.y ?? b.fy * tableH) - y) < r; });
    /** Break the cards near the card, each blown away from it. */
    const breakNear = (r: number, mode: CardBreakMode) => {
      for (const b of cardsNear(r)) {
        const p = livePoses.get(b.uid);
        const cx = p?.x ?? b.fx * tableW, cy = p?.y ?? b.fy * tableH;
        breakCard(b, mode, { x: cx - x || 1, y: cy - y });
      }
    };
    const jolt = (p: number) => shake(tableRef.current, p);
    // The same lasting card drawn again: the one in play ends first, then this one starts afresh.
    const again = ({ elements: 'elements', petrify: 'petrify', lock: 'lock', tiny: 'tiny', contrary: 'contrary', follow: 'follow', seesaw: 'seesaw', moon: 'moon' } as Partial<Record<DomatCard['effect'], string>>)[card.effect];
    if (again && undo.current.has(again)) endLasting(again);
    switch (card.effect) {
      case 'gust':
        addFx({ kind: 'flash', x, y, r: 0, ms: 1100, tint });
        addFx({ kind: 'ring', x, y, r: diag, ms: 1100, tint: '#fff6d0' });
        addFx({ kind: 'ring', x, y, r: diag * 0.6, ms: 800, tint });
        eng.impulse(x, y, diag * 1.2, 7000, CHAIN);
        jolt(1.6);
        playSfx('gainGoldenHp', { volume: 0.9, cents: -300 });
        break;
      case 'wish': {
        // Every die shows its best, and it counts.
        addFx({ kind: 'spark', x, y, r: 520, ms: 1100, tint });
        addFx({ kind: 'rune', x, y, r: 220, ms: 1300, tint });
        const dice = looseKeys().filter((k) => k.startsWith('roll:') || looseRef.current.find((l) => l.key === baseOf(k))?.token.kind === 'die');
        for (const k of dice) { const s = eng.state(k); if (s) addFx({ kind: 'consume', x: s.x, y: s.y, r: 60, ms: 700, tint }); }
        h.wish(dice);
        playSfx('gainHope', { volume: 0.9 });
        break;
      }
      case 'elements': {
        // Fire, water or ice for every loose piece and physical card; Card-Jitsu settles who meets whom (onKnock).
        addFx({ kind: 'flash', x, y, r: 0, ms: 800, tint });
        addFx({ kind: 'ring', x, y, r: diag * 0.8, ms: 1000, tint });
        const bases = [...new Set(looseKeys().map(baseOf))];
        const cardKeys = eng.cardKeys();
        [...bases, ...cardKeys].forEach((k, i) => setElement(k, ELEMENTS[(i + Math.floor(Math.random() * 3)) % 3]));
        addLasting('elements', 'Flames: fire, water and ice', tint, null, () => {
          const was = [...elements.current.keys()];
          elements.current.clear();
          setCardEls({});
          redress(was);
        });
        jolt(0.8);
        playSfx('loseHope', { volume: 0.8, cents: -200 });
        break;
      }
      case 'comet':
        addFx({ kind: 'flash', x, y, r: 0, ms: 900, tint: '#ffb070' });
        addFx({ kind: 'fire', x, y, r: 360, ms: 1000 });
        addFx({ kind: 'ring', x, y, r: diag, ms: 1200, tint });
        shatterKeys(near(looseKeys(), 300));
        breakNear(360, 'explode');
        eng.impulse(x, y, diag * 1.2, 8000, CHAIN);
        setCraters((c) => [...c, { id: uid, x, y }]);
        addLasting(`crater:${uid}`, 'Comet: a crater', tint, null, () => setCraters((c) => c.filter((q) => q.id !== uid)));
        jolt(2);
        playSfx('cardDisable', { volume: 1, cents: -700 });
        break;
      case 'mimic': {
        // A whirlpool, then a mimic where it was: it swallows what the water brought and stays, breathing.
        addFx({ kind: 'vortex', x, y, r: 520, ms: 2800, tint });
        eng.field({ kind: 'vortex', x, y, r: diag * 0.8, k: 9000 }, 2600);
        playSfx('floatMenuOpen', { volume: 0.9, cents: -900 });
        later(() => {
          const key = `fx:mimic:${uid}`;
          eng.add(chestSpec(key), x, y, { pop: true });
          eng.mimic(key, 1);
          const swallowed = near(looseKeys(), 300);
          const pieces: LoosePiece[] = [];
          for (const base of new Set(swallowed.map(baseOf))) {
            const t = tokenOfBase(base);
            if (t) pieces.push({ key: base, token: t, x, y });
          }
          swallowed.forEach((k, i) => eng.vanish(k, x, y, i * 40));
          later(() => { for (const k of swallowed) eng.remove(k); dropLoose(swallowed); eng.mimic(key, 0); }, swallowed.length * 40 + 650);
          setMimics((m) => [...m, { key, x, y, pieces }]);
          addFx({ kind: 'implode', x, y, r: 200, ms: 700, tint });
          jolt(0.8);
          playSfx('cardDragEnd', { volume: 1, cents: -900 });
        }, 2600);
        break;
      }
      case 'blackhole':
        addFx({ kind: 'implode', x, y, r: 700, ms: 1900, tint: '#5b4a7a' });
        eng.field({ kind: 'radial', x, y, r: diag * 1.2, k: -16000 }, 1800);
        playSfx('floatMenuOpen', { volume: 0.9, cents: -1200 });
        later(() => {
          breakNear(300, 'explode');
          eng.impulse(x, y, diag * 1.2, 8000, CHAIN);
          addFx({ kind: 'flash', x, y, r: 0, ms: 800, tint: '#ffffff' });
          addFx({ kind: 'ring', x, y, r: diag, ms: 1100, tint: '#ffffff' });
          shake(tableRef.current, 2);
          playSfx('gainGoldenHp', { volume: 0.9, cents: -900 });
        }, 1850);
        break;
      case 'cage': {
        // Bars rise in a ring: what is in stays in, what is out bounces off, until Reset.
        const id = `cage:${uid}`, r = 230;
        eng.cage(id, { x, y, r });
        setCages((c) => [...c, { id, x, y, r }]);
        addLasting(id, 'Donjon: a cage', tint, null, () => { eng.cage(id, null); setCages((c) => c.filter((q) => q.id !== id)); });
        addFx({ kind: 'ring', x, y, r, ms: 700, tint });
        jolt(0.6);
        playSfx('cardDragEnd', { volume: 0.9, cents: -600 });
        break;
      }
      case 'petrify': {
        const keys = looseKeys();
        for (const k of keys) stone.current.add(k);
        redress(keys);
        eng.pin(keys, 3_600_000);
        addFx({ kind: 'stone', x, y, r: diag, ms: 1400 });
        addLasting('petrify', 'Euryale: stone', tint, null, () => { const was = [...stone.current]; stone.current.clear(); redress(was); eng.unpin(was); });
        jolt(0.5);
        playSfx('cardDisable', { volume: 0.8, cents: -500 });
        break;
      }
      case 'lock': {
        const keys = looseKeys();
        // Gilded where they lie: locked, and the rest bounce off them.
        for (const k of keys) gilt.current.add(k);
        redress(keys);
        eng.pin(keys, 3_600_000);
        addFx({ kind: 'rune', x, y, r: 260, ms: 1200, tint });
        addLasting('lock', 'Key: locked in place', tint, null, () => { const was = [...gilt.current]; gilt.current.clear(); redress(was); eng.unpin(was); });
        playSfx('cardSelect', { volume: 0.8, cents: -300 });
        break;
      }
      case 'tiny': {
        const keys = looseKeys();
        for (const k of keys) tiny.current.add(k);
        redress(keys);
        addFx({ kind: 'implode', x, y, r: 360, ms: 700, tint });
        addLasting('tiny', 'Fool: everything small', tint, null, () => { const was = [...tiny.current]; tiny.current.clear(); redress(was); });
        playSfx('carouselScroll', { volume: 0.9, cents: 900 });
        break;
      }
      case 'contrary':
        eng.contrary(true);
        addFx({ kind: 'smoke', x, y, r: 420, ms: 1000 });
        addLasting('contrary', 'Idiot: throws fly backwards', tint, 30000, () => eng.contrary(false));
        playSfx('carouselScroll', { volume: 0.8, cents: -400 });
        break;
      case 'follow': {
        // Everything loose chases the pointer.
        const pull = (e: PointerEvent) => {
          const r = tableRef.current?.getBoundingClientRect();
          if (r) eng.aura('jester', { kind: 'radial', x: e.clientX - r.left, y: e.clientY - r.top, r: 2400, k: -2600 });
        };
        window.addEventListener('pointermove', pull);
        eng.aura('jester', { kind: 'radial', x, y, r: 2400, k: -2600 });
        addFx({ kind: 'spark', x, y, r: 360, ms: 900, tint });
        addLasting('follow', 'Jester: follow the pointer', tint, 20000, () => { window.removeEventListener('pointermove', pull); eng.aura('jester', null); });
        playSfx('placeToken', { volume: 0.7, cents: 700 });
        break;
      }
      case 'seesaw': {
        // The table tips one way and the other; the low side darkens.
        const t0 = performance.now();
        const tip = setInterval(() => {
          const s = Math.sin(((performance.now() - t0) / 4500) * Math.PI * 2);
          eng.aura('seesaw', { kind: 'wind', x: s * 1500, y: 0, r: 1e9, k: 0 });
          const el = tiltRef.current;
          if (el) el.style.background = `linear-gradient(90deg, rgba(0,0,0,${Math.max(0, -s) * 0.38}), transparent 45%, transparent 55%, rgba(0,0,0,${Math.max(0, s) * 0.38}))`;
        }, 120);
        timers.current.push(tip);
        addLasting('seesaw', 'Balance: the table tips', tint, 20000, () => { clearInterval(tip); eng.aura('seesaw', null); if (tiltRef.current) tiltRef.current.style.background = 'none'; });
        playSfx('gearScroll2', { volume: 0.8, cents: -500 });
        break;
      }
      case 'moon': {
        const frost = addFx({ kind: 'frost', x, y, r: 0, ms: 30000 });
        addFx({ kind: 'ring', x, y, r: diag, ms: 2200, tint });
        eng.slippery(0.02, 30000);
        eng.impulse(x, y, diag * 1.2, 1800);
        addLasting('moon', 'Moon: the felt is ice', tint, 30000, () => { eng.slippery(1, 0); setFx((l) => l.filter((f) => f.id !== frost)); });
        playSfx('gainHope', { volume: 0.8, cents: -500 });
        break;
      }
      case 'knight': {
        // A knight gallops from the card to the far wall, knocking everything in its path aside.
        const key = `fx:knight:${uid}`;
        const dir = x < (play.left + play.right) / 2 ? 1 : -1;
        eng.add({ key, shape: 'chip', size: 96, body: '#aeb6bf', edge: '#e6ebef', ink: '#141920', faces: [{ text: '♞' }], finish: 'metal', upright: true }, clampX(x), clampY(y), { pop: true });
        // Its run ends at the far wall, or once it has had time to get there (it never stands hammering the rail).
        const ends = performance.now() + ((dir > 0 ? play.right - x : x - play.left) / 2900) * 1000 + 200;
        const run = setInterval(() => {
          const s = eng.state(key);
          if (!s) { clearInterval(run); return; }
          if (performance.now() > ends || (dir > 0 && s.x > play.right - 110) || (dir < 0 && s.x < play.left + 110)) {
            clearInterval(run);
            addFx({ kind: 'smoke', x: s.x, y: s.y, r: 140, ms: 800 });
            eng.shatter(key);
            jolt(0.8);
            return;
          }
          eng.toss(key, dir * 2900, (y - s.y) * 3, { gen: 4, power: 3 });
          addFx({ kind: 'ring', x: s.x, y: s.y, r: 90, ms: 380, tint });
        }, 90);
        timers.current.push(run);
        later(() => { clearInterval(run); if (eng.has(key)) eng.shatter(key); }, 4000);
        playSfx('cardDragEnd', { volume: 1, cents: -200 });
        break;
      }
      case 'thief': {
        // A thief darts about pocketing what it touches (onKnock), then drops the lot where it ends.
        const key = `fx:rogue:${uid}`;
        eng.add({ key, shape: 'chip', size: 54, body: '#23281f', edge: '#5a6a50', ink: '#c9d6b0', faces: [{ text: '✦' }], finish: 'stone', upright: true }, clampX(x), clampY(y), { pop: true });
        pockets.current.set(key, []);
        const dart = setInterval(() => {
          const s = eng.state(key);
          if (!s) { clearInterval(dart); return; }
          const prey = looseKeys().map((k) => ({ k, s: eng.state(k) })).filter((p) => p.s).sort((a, b) => Math.hypot(a.s!.x - s.x, a.s!.y - s.y) - Math.hypot(b.s!.x - s.x, b.s!.y - s.y))[0];
          const a = prey ? Math.atan2(prey.s!.y - s.y, prey.s!.x - s.x) + (Math.random() - 0.5) * 0.6 : Math.random() * Math.PI * 2;
          eng.toss(key, Math.cos(a) * 1700, Math.sin(a) * 1700);
        }, 420);
        timers.current.push(dart);
        later(() => {
          clearInterval(dart);
          const s = eng.state(key) ?? { x, y };
          const got = pockets.current.get(key) ?? [];
          pockets.current.delete(key);
          if (eng.has(key)) eng.shatter(key);
          addFx({ kind: 'smoke', x: s.x, y: s.y, r: 160, ms: 900 });
          spill(got, s.x, s.y);
        }, 12000);
        addFx({ kind: 'smoke', x, y, r: 220, ms: 900 });
        playSfx('cardDeselect', { volume: 0.8 });
        break;
      }
      case 'rewind':
        addFx({ kind: 'vortex', x, y, r: 420, ms: 1300, tint });
        for (const [k, p] of d.snap) if (eng.has(k) || eng.cardKeys().includes(k)) eng.home(k, p.x, p.y);
        playSfx('gearScroll2', { volume: 0.8, cents: -300 });
        break;
      case 'throne': {
        const keys = looseKeys();
        const R = 90 + keys.length * 6;
        keys.forEach((k, i) => { const a = (i / Math.max(1, keys.length)) * Math.PI * 2 - Math.PI / 2; eng.home(k, clampX(x + Math.cos(a) * R), clampY(y + Math.sin(a) * R)); });
        addFx({ kind: 'ring', x, y, r: R + 60, ms: 1100, tint });
        addFx({ kind: 'flash', x, y, r: 0, ms: 600, tint });
        playSfx('gainGoldenHp', { volume: 0.7 });
        break;
      }
      case 'gems': {
        const add: LoosePiece[] = Array.from({ length: 30 }, (_, i) => ({ key: `free:${newTokenId()}${i}`, token: { kind: 'color' as const, color: TOKEN_COLORS[i % TOKEN_COLORS.length] }, x, y }));
        setLoose([...looseRef.current, ...add]);
        setTimeout(() => { for (const p of add) { const a = Math.random() * Math.PI * 2, s = 900 + Math.random() * 1600; eng.toss(p.key, Math.cos(a) * s, Math.sin(a) * s, CHAIN); } }, 60);
        addFx({ kind: 'spark', x, y, r: 360, ms: 1000, tint });
        addFx({ kind: 'flash', x, y, r: 0, ms: 600, tint });
        jolt(0.8);
        playSfx('gainGoldenHp', { volume: 0.8, cents: 500 });
        break;
      }
      case 'talons':
        addFx({ kind: 'claw', x, y, r: 320, ms: 1100, tint });
        shatterKeys(near(looseKeys(), 560));
        breakNear(380, 'tear');
        eng.impulse(x, y, diag, 3200, CHAIN);
        jolt(1);
        playSfx('tokenRemove', { volume: 1, cents: -300 });
        break;
      case 'ruin':
        addFx({ kind: 'ring', x, y, r: diag, ms: 1200, tint });
        addFx({ kind: 'flash', x, y, r: 0, ms: 600, tint });
        breakNear(Math.max(700, diag * 0.5), 'tear');
        eng.impulse(x, y, diag, 4200, CHAIN);
        jolt(1.4);
        playSfx('cardDisable', { volume: 1, cents: -600 });
        break;
      case 'vizier': {
        addFx({ kind: 'spark', x, y, r: 420, ms: 1000, tint });
        addFx({ kind: 'ring', x, y, r: diag * 0.7, ms: 1000, tint });
        const keys = eng.keys().filter((k) => k.startsWith('roll:') || (k.startsWith('free:') && looseRef.current.find((l) => l.key === baseOf(k))?.token.kind === 'die'));
        void h.rollPieces(keys).then((landed) => {
          if (!landed.length) return;
          rollSound(landed);
          setResult({ total: poolTotal(landed, 0), verdict: dualityVerdict(landed), dice: landed, label: 'Vizier', mod: 0 });
        });
        break;
      }
    }
  }, [tableW, tableH, play.left, play.right, play.top, play.bottom, addFx, breakCard, setLoose]); // eslint-disable-line react-hooks/exhaustive-deps

  const drawnRef = useRef(drawn);
  drawnRef.current = drawn;
  const playDrawn = useCallback((uid: string, x: number, y: number) => {
    const d = drawnRef.current.find((c) => c.uid === uid);
    if (!d) return;
    setDrawn((l) => l.filter((c) => c.uid !== uid));
    addFx({ kind: 'consume', x, y, r: 120, ms: 520, tint: d.card.tint });
    addFx({ kind: 'rune', x, y, r: 150, ms: 1100, tint: d.card.tint });
    playSfx('cardDragEnd', { volume: 0.7 });
    setTimeout(() => runEffect(d, x, y), 300);
  }, [addFx, runEffect]);

  // ---------------------------------------------------------------- dice and controls
  const canReorder = !!ctx.onReorderCards && category !== FAVORITES_CATEGORY && deck.length > 1 && !spread;
  const openSort = useCallback(() => { playSfx('floatMenuOpen'); setSorting(true); }, []);
  const actions = useMemo<TableAction[]>(() => [
    { key: 'cards', label: 'Cards', onPress: () => { playSfx('panelOpen'); onOpen('cards'); } },
    { key: 'state', label: 'State', onPress: () => { playSfx('panelOpen'); onOpen('modifiers'); } },
    { key: 'sort', label: 'Sort deck', onPress: openSort, disabled: !canReorder },
  ], [onOpen, canReorder, openSort]);
  const tableDecks = useMemo<TableDeck[]>(() => {
    const keys: CardCategory[] = [...ctx.ring.filter((c) => c !== FAVORITES_CATEGORY), FAVORITES_CATEGORY];
    return keys.map((k) => ({ key: k, label: ctx.categoryMeta[k]?.label ?? k, count: ctx.decks[k]?.length ?? 0, meta: ctx.categoryMeta[k] }));
  }, [ctx.ring, ctx.categoryMeta, ctx.decks]);
  const pickDeck = useCallback((c: CardCategory) => {
    if (c === FAVORITES_CATEGORY) ctx.openFavorites();
    else ctx.setCategory(c);
  }, [ctx]);
  const obstacles = useMemo(() => (ownArea && !playground ? [hand] : []), [ownArea, playground, hand.top, hand.bottom, hand.left, hand.right]); // eslint-disable-line react-hooks/exhaustive-deps
  const lastHit = useRef(0);
  const onHardHit = useCallback((speed: number) => {
    const now = performance.now();
    if (now - lastHit.current < 160) return;
    lastHit.current = now;
    shake(tableRef.current, Math.min(1.3, (speed - 2400) / 4500));
  }, []);
  /**
   * A charged throw broke loose pieces (owner, v0.47.11): they are gone, with a flash where the first went and a
   * jolt of the table; a burning throw's is brighter and longer (the engine holds the table still a beat as well).
   */
  /**
   * Hope and Fear came up equal (owner, v0.47.11: "a good satisfying very obvious crit"): the dice have already blazed
   * and the blast has thrown every loose piece and physical card away from them. The table flashes gold, a shockwave
   * runs out, runes turn, sparks fly, CRITICAL slams down over them and the table shakes hard.
   */
  const onCrit = useCallback((at: { x: number; y: number }) => {
    const diag = Math.hypot(tableW, tableH);
    addFx({ kind: 'flash', x: at.x, y: at.y, r: 0, ms: 900, tint: '#F9D68D' });
    addFx({ kind: 'ring', x: at.x, y: at.y, r: diag * 0.75, ms: 900, tint: '#FFE3A0' });
    addFx({ kind: 'ring', x: at.x, y: at.y, r: diag * 0.4, ms: 700, tint: '#ffffff' });
    addFx({ kind: 'rune', x: at.x, y: at.y, r: 190, ms: 1500, tint: '#F9D68D' });
    addFx({ kind: 'spark', x: at.x, y: at.y, r: 260, ms: 900, tint: '#FFF1C8' });
    addFx({ kind: 'consume', x: at.x, y: at.y, r: 150, ms: 700, tint: '#F2C66A' });
    addFx({ kind: 'word', x: Math.min(tableW - 220, Math.max(220, at.x)), y: Math.min(tableH - 120, Math.max(190, at.y)), r: 64, ms: 1700, tint: '#E0A830', label: 'CRITICAL' });
    shake(tableRef.current, 1.6);
    playSfx('levelUpComplete', { volume: 0.8 });
  }, [addFx, tableW, tableH]);
  const onBreak = useCallback((keys: string[], at: { x: number; y: number }, fire: boolean, first: boolean, hits: Impact[]) => {
    const bases = new Set(keys.map(baseOf));
    setLoose(looseRef.current.filter((t) => !bases.has(t.key)));
    // Physical cards break by how they were hit (owner, v0.47.12): burning, they burn; very fast, they are cut clean
    // along the way the breaker went; otherwise torn in two.
    for (const h of hits) {
      if (!h.key.startsWith('card:')) continue;
      const b = boardRef.current.find((c) => `card:${c.uid}` === h.key);
      if (b) breakCard(b, h.fire ? 'burn' : h.speed > 3200 ? 'split' : 'tear', { x: h.vx ?? 0, y: h.vy ?? 1 });
    }
    // A burning throw's first break bursts for a second where it happened; every other break is a small spark.
    if (first) {
      addFx({ kind: 'fire', x: at.x, y: at.y, r: 130, ms: 1000 });
      addFx({ kind: 'spark', x: at.x, y: at.y, r: 180, ms: 1000, tint: '#ffd27a' });
      addFx({ kind: 'ring', x: at.x, y: at.y, r: 460, ms: 700, tint: '#ffb070' });
      shake(tableRef.current, 1.4);
    } else {
      addFx({ kind: 'spark', x: at.x, y: at.y, r: fire ? 70 : 55, ms: 450, tint: fire ? '#ffb070' : '#fff1d0' });
      shake(tableRef.current, fire ? 0.3 : 0.2);
    }
  }, [setLoose, addFx, breakCard]);
  /**
   * A burning throw's first hit held (owner, v0.47.12, "like a smash final hit"): a star of light pinned where it
   * landed at once; strong, the table darkens round it and leans in for the moment it hangs.
   */
  const onHitStop = useCallback((at: { x: number; y: number }, ms: number, strong: boolean) => {
    addFx({ kind: 'impact', x: at.x, y: at.y, r: strong ? 130 : 90, ms, tint: '#ff9a3c' });
    addFx({ kind: 'flash', x: at.x, y: at.y, r: 0, ms: 260, tint: '#ffe2b0' });
    const el = tableRef.current;
    if (strong && el) {
      addFx({ kind: 'veil', x: at.x, y: at.y, r: 150, ms });
      if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        el.style.transformOrigin = `${at.x}px ${at.y}px`;
        el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.07)', offset: 0.1 }, { transform: 'scale(1.09)', offset: 0.92 }, { transform: 'scale(1)' }], { duration: ms + 80, easing: 'cubic-bezier(0.2,0.8,0.2,1)' });
      }
    }
  }, [addFx]);
  /** Selected dice carried and thrown together landed: the result, as a roll's. */
  const onGroupRolled = useCallback((landed: PoolDie[]) => {
    rollSound(landed);
    setResult({ total: poolTotal(landed, 0), verdict: dualityVerdict(landed), dice: landed, label: null, mod: 0 });
  }, []);
  /**
   * A physical card moved: drawn there straight away, and kept (from where physics says it is, never read back from
   * the page) once it stops. Until then `livePoses` is where it is drawn from, so nothing re-renders it back to where
   * it last stopped (owner, v0.47.4: grabbing one snapped it upright).
   */
  const livePoses = useRef(new Map<string, { x: number; y: number; rot: number }>()).current;
  const onCardsMoved = useCallback((moved: { key: string; x: number; y: number; rot: number }[], rested: string[]) => {
    for (const m of moved) {
      const uid = m.key.slice(5);
      livePoses.set(uid, { x: m.x, y: m.y, rot: m.rot });
      const el = tableRef.current?.querySelector(`[data-board-card="${CSS.escape(uid)}"]`) as HTMLElement | null;
      if (!el) continue;
      el.style.left = `${m.x - el.offsetWidth / 2}px`;
      el.style.top = `${m.y - el.offsetHeight / 2}px`;
      el.style.transform = `rotate(${m.rot.toFixed(2)}deg)`;
      el.dataset.rot = m.rot.toFixed(2);
    }
    const done = rested.map((k) => k.slice(5)).filter((uid) => livePoses.has(uid));
    if (!done.length) return;
    const next = boardRef.current.map((b) => {
      const p = livePoses.get(b.uid);
      if (!p || !done.includes(b.uid)) return b;
      // The angle as it lies, never wrapped (owner, v0.47.11: -10 written back as 350 made the card's transition spin it
      // the whole way round when it came to rest).
      return { ...b, fx: p.x / tableW, fy: p.y / tableH, rot: Math.round(p.rot * 10) / 10 };
    });
    for (const uid of done) livePoses.delete(uid);
    setBoard(next);
  }, [tableW, tableH, setBoard, livePoses]);


  // ---------------------------------------------------------------- panels, back, keys
  useEffect(() => { if (overlay) { setMenu(null); setCopy(null); setTableMenu(null); } }, [overlay]);
  useLayoutEffect(() => {
    const host = desktop?.tableHost;
    if (!host) return;
    if (overlay) host.setAttribute('inert', ''); else host.removeAttribute('inert');
    return () => host.removeAttribute('inert');
  }, [overlay, desktop?.tableHost]);
  const clearSelection = useCallback(() => { diceRef.current?.select([]); setSelection([]); }, []);
  const escRef = useRef<() => boolean>(() => false);
  escRef.current = () => {
    if (result) { setResult(null); return true; }
    if (menu) { playSfx('floatMenuClose'); setMenu(null); return true; }
    if (tableMenu) { playSfx('floatMenuClose'); setTableMenu(null); return true; }
    if (copy) { playSfx('cardDeselect', { volume: 0.6 }); setCopy(null); return true; }
    if (settings) { playSfx('panelClose'); setSettings(false); return true; }
    if (selRef.current.length) { clearSelection(); return true; }
    return false;
  };
  useEffect(() => {
    backRef.current = () => escRef.current();
    return () => { backRef.current = null; };
  }, [backRef]);

  const keyRef = useRef({ deck, overlay, ring: ctx.ring, ctx, canReorder, category });
  keyRef.current = { deck, overlay, ring: ctx.ring, ctx, canReorder, category };
  useEffect(() => {
    if (!desktop || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      const k = keyRef.current;
      if (k.overlay || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA)$/.test((e.target as HTMLElement)?.tagName ?? '')) return;
      const key = e.key.toLowerCase();
      if (key === 'escape') { if (escRef.current()) e.preventDefault(); return; }
      const dir = key === 'arrowright' || key === 'd' ? 1 : key === 'arrowleft' || key === 'a' ? -1 : 0;
      if (dir && k.deck.length) {
        e.preventDefault();
        const h = held.current;
        if (e.repeat && e.timeStamp - h.last < holdStep(h.n)) return;
        h.last = e.timeStamp;
        h.n = e.repeat ? h.n + 1 : 0;
        keyCue.current = { cents: holdCents(h.n), at: performance.now() };
        carRef.current?.stepBy(dir * (e.shiftKey ? 2 : 1));
        return;
      }
      if ((key === '[' || key === ']') && k.canReorder) {
        e.preventDefault();
        const ids = k.deck.map((c) => c.id);
        const at = carRef.current?.centerIndex() ?? -1;
        const to = at + (key === ']' ? 1 : -1);
        if (at < 0 || to < 0 || to >= ids.length) return;
        [ids[at], ids[to]] = [ids[to], ids[at]];
        playSfx('cardDragEnd');
        k.ctx.onReorderCards?.([ids[to]], k.category, ids);
        carRef.current?.scrollTo(to);
        return;
      }
      if (key === 'q' || key === 'e') { k.ctx.cycleCategory(key === 'q' ? -1 : 1); return; }
      if (/^[1-9]$/.test(key)) { const c = k.ring[+key - 1]; if (c) k.ctx.setCategory(c); return; }
      if (key === ' ') {
        if ((e.target as HTMLElement)?.tagName === 'BUTTON') return; // Space presses the focused button, not the hand
        const id = k.deck[carRef.current?.centerIndex() ?? -1]?.id;
        if (!id) return;
        e.preventDefault();
        k.ctx.toggleCard(id);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [desktop]);

  // Right-click a card in the hand: the phone's hold wheel, as a menu at the pointer.
  useEffect(() => {
    const host = handRef.current;
    if (!host) return;
    const onMenu = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest?.('[data-card-id]') as HTMLElement | null;
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      const p = local(e.clientX, e.clientY);
      playSfx('floatMenuOpen');
      setMenu({ id: el.dataset.cardId!, x: p.x, y: p.y });
    };
    host.addEventListener('contextmenu', onMenu);
    return () => host.removeEventListener('contextmenu', onMenu);
  });

  // Mimics come back after a reload, where they were left.
  const [engineReady, setEngineReady] = useState(false);
  useEffect(() => {
    const eng = diceRef.current?.engine();
    if (!engineReady || !eng) return;
    for (const m of mimicsRef.current) if (!eng.has(m.key)) eng.add(chestSpec(m.key), m.x, m.y);
  }, [engineReady]);  
  // The effects still in play count down once a second.
  const [, tickLasting] = useState(0);
  useEffect(() => {
    if (!lasting.some((l) => l.until)) return;
    const t = setInterval(() => tickLasting((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [lasting]);
  const barOn = selection.length > 0 && barBox.h > 0;
  const plaqueTop = barOn ? openTop + 12 + barBox.h + 14 : 12;
  const lastingTop = result && plaqueH ? Math.max(openTop + 12, plaqueTop + plaqueH + 12) : barOn ? openTop + 12 + barBox.h + 12 : openTop + 12;
  if (!desktop || !port) return null;
  const middle = Math.floor((deck.length - 1) / 2);
  // The first-time hint, only while the sheet's tips are still being shown (owner: not whenever the table is empty).
  const showHint = shouldShow('sheet') && board.length === 0 && !copy && !spread;
  const presets = dice.presets.presets;
  /**
   * Reset (owner, v0.47.12: one button instead of three): every loose piece and rolled die back into the supply, the
   * supply and control dice home, the cards on the table back into the hand, and everything the Deck of Many Things
   * left (stone, locks, cages, elements, ice, mimics, thieves) undone.
   */
  const resetAll = () => {
    clearSelection();
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
    for (const id of [...undo.current.keys()]) endLasting(id);
    elements.current.clear();
    setCardEls({});
    const eng = diceRef.current?.engine();
    for (const k of eng?.keys() ?? []) if (k.startsWith('fx:')) eng?.remove(k);
    pockets.current.clear();
    setMimics(() => []);
    diceRef.current?.tidy();
    setGone(new Set());
    if (spread) setSpread({});
    else if (copiesRef.current.length) flyBack(copiesRef.current.map((b) => b.uid), () => setCopies([]));
  };
  /** Cards fly back into the hand, shrinking as they go; `done` once they are there. */
  const flyBack = (uids: string[], done: () => void) => {
    const tx = (hand.left + hand.right) / 2, ty = (hand.top + hand.bottom) / 2;
    uids.forEach((u, i) => {
      const el = tableRef.current?.querySelector(`[data-board-card="${CSS.escape(u)}"]`) as HTMLElement | null;
      if (!el) return;
      const dx = tx - (el.offsetLeft + el.offsetWidth / 2), dy = ty - (el.offsetTop + el.offsetHeight / 2);
      el.animate([{ transform: el.style.transform || 'none', opacity: 1 }, { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(0.3)`, opacity: 0 }], { duration: 420, delay: i * 28, easing: 'cubic-bezier(0.5,0,0.75,0)', fill: 'forwards' });
    });
    setTimeout(done, 440 + uids.length * 28);
  };
  const clearAll = () => {
    resetAll();
    if (!spread) setCopies([]);
    setDrawn([]);
  };
  /**
   * The playground (owner, v0.47.12): the hand lets go of every card as a physical card, flung up into the open
   * table; the supply goes, letting out one of every die, every token and three colours; the control dice are only
   * dice. The Deck of Many Things stays, stock and all. Pressed again, the cards go back into the hand.
   */
  const togglePlayground = () => {
    const eng = diceRef.current?.engine();
    if (playground) {
      playSfx('panelClose');
      flyBack(pgCards.map((b) => b.uid), () => { setPgCards([]); setPlayground(false); setTimeout(() => diceRef.current?.resetHome(), 80); });
      return;
    }
    playSfx('levelUpComplete', { volume: 0.5 });
    clearSelection();
    setSettings(false);
    setPeek(false);
    const w = Math.min(maxW(tableH), 128), h = (w * FORGED_H) / FORGED_W;
    const cx = (v: number) => Math.min(tableW - pad - w / 2, Math.max(pad + w / 2, v)), cy = (v: number) => Math.min(tableH - pad - h / 2, Math.max(pad + h / 2, v));
    const n = Math.max(1, deck.length);
    // Evenly along the hand, a little up and down, so they leave as a spread, not a pile.
    const cards: BoardCard[] = deck.map((c, i) => {
      const x = hand.left + ((i + 0.5) / n) * (hand.right - hand.left);
      const y = (hand.top + hand.bottom) / 2 + (i % 2 ? -0.12 : 0.12) * (hand.bottom - hand.top);
      return { uid: `pg:${c.id}`, id: c.id, fx: cx(x) / tableW, fy: cy(y) / tableH, w, rot: Math.round((Math.random() - 0.5) * 16), phys: true };
    });
    setPgCards(cards);
    setPlayground(true);
    // Up into the open table, spreading as they knock into one another.
    const up = handPos === 'top' ? 1 : -1;
    cards.forEach((b, i) => {
      let tries = 0;
      // Fanned out by where each sat in the hand: the left ones fly left, the right ones right, all of them up.
      const side = (n > 1 ? i / (n - 1) - 0.5 : 0) * 2200 + (Math.random() - 0.5) * 400;
      const go = () => { if (!diceRef.current?.engine()?.throwCard(`card:${b.uid}`, side, up * (900 + Math.random() * 1300), (Math.random() - 0.5) * 6) && ++tries < 25) setTimeout(go, 30); };
      setTimeout(go, 40 + i * 14);
    });
    // The supply lets go of one of everything as it goes.
    const from = eng?.state('src:die') ?? eng?.state('src:mat') ?? { x: tableW / 2, y: (openTop + openBottom) / 2 };
    const colours = [...TOKEN_COLORS].sort(() => Math.random() - 0.5).slice(0, 3);
    const toks: TokenInfo[] = [
      ...DIE_TYPES.map((t): TokenInfo => ({ kind: 'die', dieType: t, dieValue: 1, dieValue2: t === 'duality' ? 1 : undefined })),
      { kind: 'wood' }, { kind: 'bone' }, { kind: 'iron' },
      ...colours.map((c): TokenInfo => ({ kind: 'color', color: c })),
    ];
    spill(toks.map((t) => ({ key: '', token: t, x: from.x, y: from.y })), from.x, from.y);
  };
  const looseCount = loose.length + drawn.length + (spread ? 0 : copies.length);

  return (
    <DesktopPortal to="table">
      <style>{TABLE_CSS + FX_CSS}</style>
      <div ref={(el) => { tableRef.current = el; setTableEl(el); }} data-coach="sheet-table" data-table-root="" style={{ position: 'absolute', left: 0, top: 0, width: tableW, height: tableH, overflow: 'hidden', touchAction: 'none', background: `${T.ink} url(/table/felt.webp) center / cover no-repeat` }}>
        <div style={{ position: 'absolute', inset: 0, background: 'url(/table/weave.png) repeat', opacity: 0.9, pointerEvents: 'none' }} />
        {look.walls === 'line' ? <div style={{ position: 'absolute', inset: 4, border: '1px solid rgba(218,162,73,0.32)', pointerEvents: 'none' }} /> : null}

        {/* The hand's own area, marked as lightly as the settings say; on the open table it is not marked at all. */}
        {ownArea && look.divider !== 'none' ? (
          look.divider === 'line' ? (
            <>
              {handPos !== 'top' ? <div style={{ position: 'absolute', left: hand.left + 24, right: tableW - hand.right + 24, top: hand.top, height: 1, background: 'linear-gradient(90deg, transparent, rgba(218,162,73,0.3) 12%, rgba(218,162,73,0.3) 88%, transparent)', pointerEvents: 'none' }} /> : null}
              {handPos !== 'bottom' ? <div style={{ position: 'absolute', left: hand.left + 24, right: tableW - hand.right + 24, top: hand.bottom, height: 1, background: 'linear-gradient(90deg, transparent, rgba(218,162,73,0.3) 12%, rgba(218,162,73,0.3) 88%, transparent)', pointerEvents: 'none' }} /> : null}
            </>
          ) : (
            <div style={{ position: 'absolute', left: hand.left, top: hand.top, width: hand.right - hand.left, height: handH, background: 'rgba(0,0,0,0.2)', maskImage: 'linear-gradient(transparent, #000 40px, #000 calc(100% - 40px), transparent)', WebkitMaskImage: 'linear-gradient(transparent, #000 40px, #000 calc(100% - 40px), transparent)', pointerEvents: 'none' }} />
          )
        ) : null}

        {/* Cards laid out on the table. */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} className="rk-board">
            <BoardCards
              cards={board}
              lookup={lookup}
              feltW={tableW}
              feltH={tableH}
              hidden={new Set(shattering.map((s) => s.uid))}
              live={livePoses}
              onChange={(next) => setBoard(next.map((b) => { const p = livePoses.get(b.uid); return p ? { ...b, rot: Math.round(p.rot * 10) / 10 } : b; }))}
              onReturn={(uid) => { if (uid.startsWith('pg:')) setPgCards((l) => l.filter((b) => b.uid !== uid)); else if (!spread) setCopies(copiesRef.current.filter((b) => b.uid !== uid)); }}
              onLift={(b) => {
                const { w, h } = sizeOf(b);
                const p = livePoses.get(b.uid);
                diceRef.current?.carry(p ? { cx: p.x, cy: p.y, w, h, rot: p.rot } : { cx: b.fx * tableW, cy: b.fy * tableH, w, h, rot: b.rot ?? 0 });
              }}
              onCarry={(dx, dy) => diceRef.current?.carryBy(dx, dy)}
              onSettle={() => diceRef.current?.carry(null)}
              onDragTo={(uid, x, y, rot, end) => {
                const eng = diceRef.current?.engine();
                if (!eng) return;
                if (end) eng.releaseCard(`card:${uid}`);
                else eng.holdCard(`card:${uid}`, x, y, rot);
              }}
              overTray={spread ? () => false : overHand}
              onMenu={(uid, x, y) => {
                const b = boardRef.current.find((c) => c.uid === uid);
                if (!b) return;
                const p = local(x, y);
                playSfx('floatMenuOpen');
                setMenu({ id: b.id, x: p.x, y: p.y, board: uid });
              }}
            />
          </div>
          {shattering.map((s) => <CardBreak key={s.uid} card={s.card} cx={s.cx} cy={s.cy} w={s.w} rot={s.rot} mode={s.mode} dir={s.dir} onDone={() => setShattering((l) => l.filter((x) => x.uid !== s.uid))} />)}
          {Object.keys(cardEls).length ? <style>{Object.entries(cardEls).map(([u, el]) => `[data-board-card="${u}"] { box-shadow: 0 0 0 2px ${ELEMENT_TINT[el]}, 0 0 22px ${ELEMENT_TINT[el]}; }`).join('\n')}</style> : null}
        </div>

        {/* What the Deck of Many Things left: craters, cages, the tipping table's shade. */}
        <div ref={tiltRef} aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4 }} />
        {craters.map((c) => <div key={c.id} aria-hidden="true" style={{ position: 'absolute', left: c.x - 150, top: c.y - 150, width: 300, height: 300, borderRadius: '50%', pointerEvents: 'none', zIndex: 3, background: 'radial-gradient(circle, rgba(10,6,4,0.85) 0%, rgba(40,16,8,0.7) 28%, rgba(120,40,12,0.35) 42%, rgba(0,0,0,0.25) 55%, transparent 70%)' }} />)}
        {cages.map((c) => (
          <svg key={c.id} aria-hidden="true" width={c.r * 2 + 20} height={c.r * 2 + 20} style={{ position: 'absolute', left: c.x - c.r - 10, top: c.y - c.r - 10, pointerEvents: 'none', zIndex: 19, overflow: 'visible' }}>
            <circle cx={c.r + 10} cy={c.r + 10} r={c.r} fill="none" stroke="#6E7A8A" strokeWidth="9" strokeDasharray="5 13" />
            <circle cx={c.r + 10} cy={c.r + 10} r={c.r} fill="none" stroke="rgba(200,210,220,0.45)" strokeWidth="1.5" />
          </svg>
        ))}

        {/* The hand. */}
        {spread || playground ? null : (
          <div ref={handRef} style={{ position: 'absolute', left: hand.left, top: hand.top, width: hand.right - hand.left, height: handH, zIndex: 10 }}>
            {deck.length === 0 ? (
              <div style={{ position: 'absolute', left: 0, right: 0, top: '45%', textAlign: 'center', color: T.muted, fontFamily: T.medium, fontSize: 14 }}>Nothing in this deck yet. Add a card from the sheet.</div>
            ) : (
              <DeskCarousel key={category} ref={carRef} cards={cards} look={look} initialIndex={middle} onCentre={onCentre} onCentreClick={onCentreClick} takenId={copy?.card.id} />
            )}
          </div>
        )}

        {/* Cards drawn from the Deck of Many Things, waiting to be used. */}
        {drawn.map((d) => (
          <DomatCardView key={d.uid} card={d.card} x={d.x} y={d.y} from={d.from} held={d.held}
            onMove={(x, y) => setDrawn((l) => l.map((c) => (c.uid === d.uid ? { ...c, x, y } : c)))}
            onPlace={(x, y) => setDrawn((l) => l.map((c) => (c.uid === d.uid ? { ...c, x, y, held: false } : c)))}
            onPlay={(x, y) => playDrawn(d.uid, x, y)}
            onRemove={() => { playSfx('cardDeselect', { volume: 0.6 }); setDrawn((l) => l.filter((c) => c.uid !== d.uid)); if (d.card.once) setGone((g) => { const n = new Set(g); n.delete(d.card.id); return n; }); }} />
        ))}

        {showHint ? (
          <div style={{ position: 'absolute', left: 0, right: 0, top: openTop + (openBottom - openTop) * 0.5, transform: 'translateY(-50%)', textAlign: 'center', pointerEvents: 'none', color: 'rgba(147,142,136,0.6)', fontFamily: T.medium, fontSize: 14, lineHeight: '21px', zIndex: 6 }}>
            Click the middle card of your hand to take a copy, then click the table to lay it down.<br />Drag a die to throw it. Drag on the empty table to select dice. Right click the table for everything else.
          </div>
        ) : null}

        <div data-coach="sheet-decks" style={{ position: 'absolute', left: places.cat.x - 70, top: places.cat.y - 73, width: 140, height: 146, pointerEvents: 'none' }} />
        <TableDice
          ref={diceRef}
          host={tableEl}
          width={tableW}
          height={tableH}
          bounds={play}
          obstacles={obstacles}
          walls={{ kind: look.walls, rect: { left: 0, top: 0, right: tableW, bottom: tableH }, thickness: pad }}
          places={peeking ? peekPlaces : places}
          decks={tableDecks}
          current={category}
          onPickDeck={pickDeck}
          actions={actions}
          controls={playground || peeking ? 'dice' : look.controls}
          toys={playground}
          autoReturn={look.autoReturn}
          onHitStop={onHitStop}
          onKnock={onKnock}
          onGroupRolled={onGroupRolled}
          onMimic={popMimic}
          diceChest={look.diceChest ? (look.chest === 'cute' ? 'chest' : 'mimic') : null}
          onDiscard={(bases) => { const gone = new Set(bases); setLoose(looseRef.current.filter((t) => !gone.has(t.key))); }}
          onMist={(mx, my) => addFx({ kind: 'mist', x: mx, y: my, r: 46, ms: 750, tint: '#d9c8ff' })}
          controlFinish={look.controlDice}
          ctlMotion={look.ctlMotion}
          ctlSize={look.ctlSize}
          onNewCategory={() => { playSfx('panelOpen'); onOpen('newCategory'); }}
          catSize={look.catSize}
          numberFinish={look.numberDice}
          tokens={pieces}
          cards={cardPoses}
          onCardsMoved={onCardsMoved}
          supply={supply}
          domat={look.tokenTray || peeking || playground ? { stock: stockNow.stock, wait: domatWait } : null}
          onDomatDraw={(from, held) => drawCard(from, held ? { held } : undefined)}
          loose={loose}
          onSpawn={(key, token, x, y) => setLoose([...looseRef.current, { key, token, x, y }])}
          onSupplyStep={(key, dir) => {
            if (key === 'src:color') {
              const next = TOKEN_COLORS[(Math.max(0, TOKEN_COLORS.indexOf(supColor)) + dir + TOKEN_COLORS.length) % TOKEN_COLORS.length];
              setSupColor(next);
              if (colorSave.current) clearTimeout(colorSave.current);
              colorSave.current = setTimeout(() => ctx.setTokenColor(next), 600);
              playSfx('tokenCopyColor', { volume: 0.5 });
            } else if (key === 'src:die') {
              setSupplyDie((d) => (dir > 0 ? nextDieType(d) : DIE_TYPES[(DIE_TYPES.indexOf(d) - 1 + DIE_TYPES.length) % DIE_TYPES.length]));
              playSfx('placeToken', { volume: 0.45, cents: 200 });
            } else if (key === 'src:mat') {
              setMaterial((m) => MATERIALS[(MATERIALS.indexOf(m) + dir + MATERIALS.length) % MATERIALS.length]);
              playSfx('placeToken', { volume: 0.45, cents: 100 });
            }
          }}
          onLooseRest={(key, x, y) => setLoose(looseRef.current.map((t) => (t.key === key ? { ...t, x, y } : t)))}
          onLooseRolled={(key, value, value2) => setLoose(looseRef.current.map((t) => (t.key === key ? { ...t, token: { ...t.token, dieValue: value, dieValue2: value2 ?? t.token.dieValue2 } } : t)))}
          onTokenRolled={(key, value, value2) => { const t = tokenOf(key); if (t) ctx.updateToken(t.ref, t.id, value2 === undefined ? { dieValue: value } : { dieValue: value, dieValue2: value2 }); }}
          onRerolled={reroll}
          onDropPiece={dropToken}
          onPopToken={popToken}
          onTableMenu={(x, y, piece) => { const p = local(x, y); playSfx('floatMenuOpen'); setTableMenu({ ...p, piece }); }}
          onReady={() => { setEngineReady(true); onReady?.(); }}
          onSelect={setSelection}
          onHardHit={onHardHit}
          onBreak={onBreak}
          onCrit={onCrit}
          onDragPiece={(x, y) => carRef.current?.hoverAt(x, y)}
          onTidied={() => setLoose([])}
          editing={settings}
          onMoveGroup={(g: PlaceGroup, x, y) => setLook({ ...lookRef.current, [`${g}X`]: Math.min(1, Math.max(0, x / tableW)), [`${g}Y`]: Math.min(1, Math.max(0, y / tableH)) } as DeckLook)}
          onFlipGroup={(g) => setLook({ ...lookRef.current, [`${g}Dir`]: lookRef.current[`${g}Dir`] === 'row' ? 'column' : 'row' } as DeckLook)}
          onSplitGroup={(_g, at) => {
            const apart = { ...lookRef.current.apart };
            for (const [k, p] of Object.entries(at)) apart[k] = [Math.min(1, Math.max(0, p.x / tableW)), Math.min(1, Math.max(0, p.y / tableH))];
            setLook({ ...lookRef.current, apart });
          }}
          onJoinGroup={(g) => {
            const apart = { ...lookRef.current.apart };
            for (const k of g === 'ctl' ? ['cards', 'state', 'sort'] : ['src:mat', 'src:color', 'src:die', 'src:domat']) delete apart[k];
            setLook({ ...lookRef.current, apart });
          }}
          onMovePiece={(k, x, y) => setLook({ ...lookRef.current, apart: { ...lookRef.current.apart, [k]: [Math.min(1, Math.max(0, x / tableW)), Math.min(1, Math.max(0, y / tableH))] } })}
          inert={overlay || settings}
        />
        <FxLayer fx={fx} />

        {/* What can be done with the pieces selected. */}
        {selection.length ? (
          <SelectionBar x={(play.left + play.right) / 2} y={openTop + 12} count={new Set(selection.map(baseOf)).size} types={selTypes}
            onRoll={(power, burning) => {
              void diceRef.current?.rollPieces(selection, power, burning).then((landed) => {
                if (!landed.length) return;
                rollSound(landed);
                setResult({ total: poolTotal(landed, 0), verdict: dualityVerdict(landed), dice: landed, label: null, mod: 0 });
              });
            }}
            canSave={presets.some((p) => !p)}
            onSave={(name) => {
              const slot = presets.findIndex((p) => !p);
              if (slot < 0 || !selTypes.length) return;
              dice.presets.onWrite(slot, { id: `p${Date.now().toString(36)}`, name, dice: selTypes });
              playSfx('cardSelect', { volume: 0.6 });
            }}
            onPutBack={() => {
              const eng = diceRef.current?.engine();
              const bases = new Set(selection.map(baseOf));
              for (const k of eng?.keys() ?? []) if (bases.has(baseOf(k))) eng?.shatter(k);
              setLoose(looseRef.current.filter((t) => !bases.has(t.key)));
              clearSelection();
              playSfx('tokenRemove');
            }}
            onClear={clearSelection} />
        ) : null}

        {/* Reset, tidy and settings, in the lower left corner: buttons always win over the pieces under them. */}
        <div data-ui="" style={{ position: 'absolute', left: pad + 10, bottom: pad + 10, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 1260 }}>
          {look.controls === 'hidden' && !playground ? <CornerButton glyph="roll" label={peeking ? 'Hide the control dice' : 'Show the control dice'} active={peeking} onPress={() => { playSfx(peeking ? 'panelClose' : 'panelOpen'); setPeek((v) => !v); }} /> : null}
          {playground ? null : <CornerButton glyph="reset" label="Reset the table" count={looseCount} onPress={() => { playSfx('gearScroll2', { volume: 0.5 }); resetAll(); }} />}
          <CornerButton glyph="play" label={playground ? 'Leave the playground' : 'Playground'} active={playground} onPress={togglePlayground} />
          {playground ? null : <CornerButton glyph="settings" label="Table settings" active={settings} onPress={() => { playSfx(settings ? 'panelClose' : 'panelOpen'); setSettings((s) => !s); }} />}
          {/* Testing only for now (owner, v0.47.11): draw any card of the Deck of Many Things, stock or not. */}
          {playground ? null : <CornerButton glyph="roll" label="Testing: draw any Many Things card" active={picking} onPress={() => { playSfx(picking ? 'floatMenuClose' : 'floatMenuOpen'); setPicking((v) => !v); }} />}
        </div>
        {/* What the Deck of Many Things has in play, and how long each has left. */}
        {lasting.length ? (
          <div data-ui="" aria-label="Many Things effects in play" style={{ position: 'absolute', left: (play.left + play.right) / 2, top: lastingTop, transform: 'translateX(-50%)', transition: 'top 240ms cubic-bezier(0.22,1,0.36,1)', zIndex: 1230, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 6, maxWidth: (play.right - play.left) * 0.7, pointerEvents: 'none' }}>
            {lasting.map((l) => {
              const left = l.until ? Math.max(0, Math.ceil((l.until - Date.now()) / 1000)) : null;
              return (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '5px 10px 5px 8px', background: 'rgba(11,14,19,0.9)', borderLeft: `3px solid ${l.tint}`, color: T.ivory, fontFamily: T.bold, fontSize: 12.5, whiteSpace: 'nowrap' }}>
                  {l.name}
                  {left !== null ? <span style={{ color: T.muted, fontFamily: T.medium, fontVariantNumeric: 'tabular-nums' }}>{`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}</span> : <span style={{ color: T.muted, fontFamily: T.medium }}>until reset</span>}
                </div>
              );
            })}
          </div>
        ) : null}
        {picking ? (
          <DomatPicker left={pad + 62} bottom={pad + 10} onClose={() => setPicking(false)} onPick={(c) => {
            setPicking(false);
            const s = diceRef.current?.engine()?.state(DOMAT_KEY);
            drawCard(s ? { x: s.x, y: s.y } : { x: tableW / 2, y: tableH / 2 }, { pick: c });
          }} />
        ) : null}
        {settings ? (
          <div style={{ position: 'absolute', left: '50%', bottom: pad + 14, transform: 'translateX(-50%)', zIndex: 1255, pointerEvents: 'none', padding: '7px 14px', background: 'rgba(11,14,19,0.92)', border: `1px solid ${T.goldSoft}`, color: T.goldText, fontFamily: T.bold, fontSize: 13, whiteSpace: 'nowrap' }}>
            Drag a framed row to move it. The arrows beside its name stand it on end; the link splits it into pieces you place one by one.
          </div>
        ) : null}
        {settings && !spread ? (
          <HandGrip hand={hand} onMove={(cy) => setLook({ ...lookRef.current, areaY: Math.min(1, Math.max(0, cy / tableH)) })} />
        ) : null}


        {/* The copy in your hand. */}
        {copy ? <CarriedCard key={copy.card.id} copy={copy} tableRef={tableRef} /> : null}

        {sorting ? (
          <DesktopPortal to="side" priority="dialog" onDismiss={() => setSorting(false)}>
            <SortPanel file={sortFile} ids={deck.map((c) => c.id)} onApply={(ordered, moved) => { playSfx('cardDragEnd'); ctx.onReorderCards?.(moved, category, ordered); }} onClose={() => setSorting(false)} />
          </DesktopPortal>
        ) : null}
        {overlay ? <div style={{ position: 'absolute', inset: 0, zIndex: 800, background: 'rgba(6,8,13,0.45)' }} /> : null}
        {tableMenu && !overlay ? (
          <TableMenu x={tableMenu.x} y={tableMenu.y} tableW={tableW} tableH={tableH} onClose={() => setTableMenu(null)}
            presets={presets} noRolls={!!tableMenu.piece?.own}
            onRollPreset={(p) => { rollFrom.current = { x: tableMenu.x, y: tableMenu.y }; dice.presets.onPlay(p); }}
            onRollPair={() => { rollFrom.current = { x: tableMenu.x, y: tableMenu.y }; dice.handleRef.current?.rollDuality('Hope and Fear', 0); }}
            onDeletePreset={(slot) => { dice.presets.onWrite(slot, null); playSfx('tokenRemove', { volume: 0.6 }); }}
            rows={[
              ...(tableMenu.piece ? [{ label: tableMenu.piece.label, onPress: () => {
                const k = tableMenu.piece!.key;
                if (!tableMenu.piece!.own) { diceRef.current?.rollPiece(k); return; }
                if (k === 'cat') { diceRef.current?.openDecks({ x: tableMenu.x, y: tableMenu.y }); return; }
                const a = actions.find((x) => x.key === k);
                if (a && !a.disabled) a.onPress();
              } }] : []),
              { label: 'Choose a deck', gap: !!tableMenu.piece, hidden: tableMenu.piece?.key === 'cat', onPress: () => diceRef.current?.openDecks({ x: tableMenu.x, y: tableMenu.y }) },
              { label: 'Reset the table', onPress: resetAll, gap: true },
              { label: 'Clear the whole table', onPress: clearAll, danger: true },
              { label: 'Table settings', onPress: () => setSettings(true), gap: true },
            ]} />
        ) : null}
        {menu && !overlay ? (
          <CardMenu id={menu.id} x={menu.x} y={menu.y} tableW={tableW} tableH={tableH} onClose={() => setMenu(null)}
            spread={spread}
            physical={menu.board ? !!board.find((b) => b.uid === menu.board)?.phys : undefined}
            onPhysical={menu.board ? () => {
              const uid = menu.board!;
              // Back to an ordinary card: stood upright where it lies, so it reads (owner, v0.47.5).
              const p = livePoses.get(uid);
              livePoses.delete(uid);
              setBoard(boardRef.current.map((b) => (b.uid !== uid ? b : b.phys ? { ...b, phys: false, rot: 0, ...(p ? { fx: p.x / tableW, fy: p.y / tableH } : {}) } : { ...b, phys: true })));
              playSfx('cardSelect', { volume: 0.6 });
            } : undefined}
            board={menu.board && !spread ? () => { const u = menu.board!; if (u.startsWith('pg:')) setPgCards((l) => l.filter((b) => b.uid !== u)); else setCopies(copiesRef.current.filter((b) => b.uid !== u)); } : undefined}
            place={menu.board || spread ? undefined : () => {
              const el = handRef.current?.querySelector(`[data-card-id="${CSS.escape(menu.id)}"]`) as HTMLElement | null;
              const r = tableRef.current?.getBoundingClientRect();
              const card = lookup(menu.id);
              if (el && r && card) takeCopy(card, el.getBoundingClientRect(), { x: r.left + menu.x, y: r.top + menu.y });
            }}
            throwIt={menu.board || spread ? undefined : () => throwCopy(menu.id)} />
        ) : null}
      </div>
      {result ? <RollPopup key={result.dice.map((d) => d.id).join()} result={result} top={plaqueTop} minWidth={barOn ? barBox.w : undefined} box={{ left: winW - tableW, top: 0, width: tableW, height: tableH }} onAccept={() => { playSfx('buttonTap'); setResult(null); }} /> : null}
      {settings ? <LookPanel look={look} onChange={setLook} onClose={() => { playSfx('panelClose'); setSettings(false); }} onClearTable={clearAll} boardCount={spread ? 0 : copies.length} pieceCount={looseCount} box={port} /> : null}
    </DesktopPortal>
  );
}

/**
 * The hand's grip while settings are open (owner, v0.47.7): drag it to move the whole hand up or down the table. Only
 * the grip takes the pointer, so the cards inside still scroll and drag, to feel the hand where it is going.
 */
function HandGrip({ hand, onMove }: { hand: Bounds; onMove: (centreY: number) => void }) {
  const [hover, setHover] = useState(false);
  const start = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const sy = e.clientY, cy = (hand.top + hand.bottom) / 2;
    const move = (m: PointerEvent) => onMove(cy + m.clientY - sy);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); playSfx('cardDragEnd', { volume: 0.5 }); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    playSfx('cardDragStart', { volume: 0.5 });
  };
  return (
    <>
      <div aria-hidden="true" style={{ position: 'absolute', left: hand.left + 2, top: hand.top, width: hand.right - hand.left - 4, height: hand.bottom - hand.top, border: `1.5px dashed ${hover ? T.goldBright : 'rgba(224,181,99,0.55)'}`, boxSizing: 'border-box', pointerEvents: 'none', zIndex: 1250 }} />
      <div data-ui="" role="slider" aria-label="Move the hand up or down" aria-valuenow={Math.round((hand.top + hand.bottom) / 2)} tabIndex={0}
        onPointerDown={start} onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}
        onKeyDown={(e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); onMove((hand.top + hand.bottom) / 2 + (e.key === 'ArrowUp' ? -24 : 24)); } }}
        style={{ position: 'absolute', left: hand.left + 14, top: hand.top + (hand.top < 40 ? 6 : -30), zIndex: 1251, cursor: 'ns-resize', display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: hover ? T.panelLit : 'rgba(11,14,19,0.94)', border: `1px solid ${hover ? T.goldBright : T.goldSoft}`, color: T.goldText, fontFamily: T.bold, fontSize: 11.5, letterSpacing: 1, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
        <Glyph d='<path d="M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4"/>' size={14} />
        Hand
      </div>
    </>
  );
}

/** A corner button: its name slides out beside it on hover (owner, v0.47.4: the icons alone were unclear). */
function CornerButton({ glyph, label, onPress, active, disabled, count }: { glyph: 'settings' | 'reset' | 'tidy' | 'roll' | 'play'; label: string; onPress: () => void; active?: boolean; disabled?: boolean; count?: number }) {
  const [hover, setHover] = useState(false);
  const lit = hover && !disabled;
  return (
    <button type="button" aria-label={count ? `${label} (${count})` : label} aria-pressed={active} disabled={disabled} onClick={onPress} onPointerDown={(e) => e.stopPropagation()} onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={() => setHover(false)} style={{ all: 'unset', cursor: disabled ? 'default' : 'pointer', position: 'relative', display: 'block' }}>
      <div style={{ opacity: disabled ? 0.45 : 1 }}>
        <Chamfer c={9} line={active ? T.red : lit ? T.goldBright : T.goldSoft} fill={active ? 'rgba(200,27,24,0.28)' : lit ? T.panelLit : 'rgba(11,14,19,0.9)'} style={{ width: 40, height: 40 }} inner={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ display: 'flex', transform: lit ? (glyph === 'tidy' ? 'translateY(1.5px)' : `rotate(${glyph === 'settings' ? 60 : glyph === 'roll' ? 30 : -40}deg)`) : 'none', transition: `transform 280ms ${T.ease}` }}>
            <Glyph d={DIE_GLYPHS[glyph]} size={19} color={active || lit ? T.ivory : T.goldText} />
          </span>
        </Chamfer>
      </div>
      {count ? <span style={{ position: 'absolute', right: -6, top: -6, minWidth: 18, height: 18, padding: '0 4px', boxSizing: 'border-box', background: T.red, color: T.ivory, fontFamily: T.bold, fontSize: 11, lineHeight: '18px', textAlign: 'center', clipPath: 'polygon(4px 0, calc(100% - 4px) 0, 100% 4px, 100% calc(100% - 4px), calc(100% - 4px) 100%, 4px 100%, 0 calc(100% - 4px), 0 4px)', pointerEvents: 'none' }}>{count > 99 ? '99+' : count}</span> : null}
      <span style={{ position: 'absolute', left: 50, top: '50%', transform: `translate(${hover ? 0 : -6}px, -50%)`, opacity: hover ? 1 : 0, transition: `opacity 140ms, transform 200ms ${T.ease}`, pointerEvents: 'none', whiteSpace: 'nowrap', padding: '6px 10px', background: 'rgba(11,14,19,0.96)', border: `1px solid ${T.goldSoft}`, color: disabled ? T.muted : T.ivory, fontFamily: T.bold, fontSize: 12.5, letterSpacing: 0.4 }}>
        {disabled && glyph === 'tidy' ? 'Nothing loose to put away' : label}
      </span>
    </button>
  );
}

/** What can be done with selected pieces: roll the dice among them, keep them as a preset, put them back. */
function SelectionBar({ x, y, count, types, onRoll, canSave, onSave, onPutBack, onClear }: { x: number; y: number; count: number; types: DieType[]; onRoll: (power: number, burning: boolean) => void; canSave: boolean; onSave: (name: string) => void; onPutBack: () => void; onClear: () => void }) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const save = () => { const n = name.trim(); if (!n) return; onSave(n); setNaming(false); setName(''); };
  const summary = summarise(types);
  return (
    <div data-ui="" data-sel-bar="" role="toolbar" aria-label="Selected pieces" onPointerDown={(e) => e.stopPropagation()} style={{ position: 'absolute', left: x, top: y, transform: 'translateX(-50%)', transition: 'top 240ms cubic-bezier(0.22,1,0.36,1)', zIndex: 1240 }}>
      <Chamfer c={10} fill="rgba(11,14,19,0.96)" line={T.gold} inner={{ padding: '6px 8px 6px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: T.ivory, fontFamily: T.bold, fontSize: 13.5, whiteSpace: 'nowrap' }}>{count} selected</span>
        {summary ? <span style={{ color: T.muted, fontFamily: T.medium, fontSize: 13, whiteSpace: 'nowrap' }}>{summary}</span> : null}
        {naming ? (
          <>
            <input autoFocus value={name} maxLength={24} placeholder="Name the preset" aria-label="Name the preset" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') save(); if (e.key === 'Escape') setNaming(false); }}
              style={{ all: 'unset', width: 150, height: 30, padding: '0 9px', background: T.panel, border: `1px solid ${T.goldSoft}`, color: T.ivory, fontFamily: T.medium, fontSize: 14, caretColor: T.red }} />
            <TButton label="Save" h={32} disabled={!name.trim()} onPress={save} />
          </>
        ) : (
          <>
            <ChargeRoll disabled={!types.length} onRoll={onRoll} />
            <TButton label="Save as preset" h={32} disabled={!types.length || !canSave} title={canSave ? 'Keep these dice as a preset in the table menu' : 'Every preset slot is full: delete one from the table menu'} onPress={() => setNaming(true)} />
            <TButton label="Put back" h={32} onPress={onPutBack} />
          </>
        )}
        <TButton title="Clear the selection" h={32} onPress={onClear} icon={<Glyph d={DIE_GLYPHS.close} size={14} />} />
      </Chamfer>
    </div>
  );
}

/**
 * The selection's Roll (owner, v0.47.11): a click rolls the dice where they lie; held, it charges and the dice fly
 * that much harder; held on through it, it catches fire and the dice go out burning, breaking every loose piece in
 * their way. v0.47.12 (owner: "give it some feedback when held"): a bar fills under the word as it charges, the word
 * says what is building, and the table's own flame (lib/flames, ready before the press) smoulders up round the button
 * from halfway and is ablaze when it catches.
 */
function ChargeRoll({ disabled, onRoll }: { disabled: boolean; onRoll: (power: number, burning: boolean) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<0 | 1 | 2 | 3>(0);
  const st = useRef<{ t: number; raf: number; power: number; lit: boolean; host: HTMLDivElement | null; flames: Flames | null; stage: number } | null>(null);
  /** A pointer press already rolled: the click that follows it does nothing (a key press still rolls). */
  const rolledByPointer = useRef(false);
  const end = () => {
    const s = st.current;
    if (!s) return null;
    st.current = null;
    cancelAnimationFrame(s.raf);
    s.flames?.stop();
    s.host?.remove();
    if (wrap.current) wrap.current.style.transform = '';
    if (bar.current) { bar.current.style.transform = 'scaleX(0)'; bar.current.style.opacity = '0'; }
    setStage(0);
    return s;
  };
  useEffect(() => () => { end(); }, []);  
  const down = (e: React.PointerEvent) => {
    if (disabled || e.button !== 0 || !wrap.current) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* gone */ }
    // The bar clips what is inside it, so the flames sit over the page where the button is.
    const r = wrap.current.getBoundingClientRect();
    const host = document.createElement('div');
    Object.assign(host.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, pointerEvents: 'none', zIndex: '1241' });
    document.body.appendChild(host);
    const s = { t: performance.now(), raf: 0, power: 0, lit: false, host, flames: burn(host, { width: r.width, height: r.height, rise: 1.7, spill: 22, foot: 8, chamfer: 7, level: 0 }), stage: 0 };
    st.current = s;
    const tick = () => {
      // A beat, then it builds: full at 1, and at 2 it catches fire.
      s.power = Math.max(0, Math.min(2, (performance.now() - s.t - 120) / 1100));
      const j = Math.min(1, s.power) * 2.4 + (s.lit ? 1.4 : 0);
      if (wrap.current) wrap.current.style.transform = j > 0 ? `translate(${((Math.random() - 0.5) * j).toFixed(2)}px, ${((Math.random() - 0.5) * j).toFixed(2)}px)` : '';
      if (bar.current) {
        bar.current.style.opacity = s.power > 0 ? '1' : '0';
        bar.current.style.transform = `scaleX(${Math.min(1, s.power).toFixed(3)})`;
        bar.current.style.background = s.power < 1 ? T.goldBright : `linear-gradient(90deg, #ff9a3c, #ffe2a0 ${Math.round((s.power - 1) * 100)}%, #ff9a3c)`;
      }
      s.flames?.level(s.power < 0.5 ? 0 : (s.power - 0.5) / 1.5);
      const next = s.lit ? 3 : s.power >= 1 ? 2 : s.power > 0 ? 1 : 0;
      if (next !== s.stage) { s.stage = next; setStage(next as 0 | 1 | 2 | 3); }
      if (!s.lit && s.power >= 2) {
        s.lit = true;
        playSfx('gainGoldenHp', { volume: 0.6, cents: 900 });
      }
      s.raf = requestAnimationFrame(tick);
    };
    s.raf = requestAnimationFrame(tick);
  };
  const up = () => {
    const s = end();
    if (!s) return;
    rolledByPointer.current = true;
    onRoll(Math.min(1, s.power), s.lit);
  };
  return (
    <div ref={wrap} onPointerDown={down} onPointerUp={up} onPointerCancel={() => { end(); }} title="Roll. Hold to roll harder; hold on and it catches fire" style={{ position: 'relative' }}>
      <TButton label={['Roll', 'Charging', 'Hotter', 'Ablaze'][stage]} primary h={32} disabled={disabled} onPress={() => { if (rolledByPointer.current) { rolledByPointer.current = false; return; } onRoll(0, false); }} />
      <div ref={bar} aria-hidden="true" style={{ position: 'absolute', left: 6, right: 6, bottom: 3, height: 3, transformOrigin: '0 50%', transform: 'scaleX(0)', opacity: 0, background: T.goldBright, boxShadow: '0 0 8px rgba(255,200,120,0.8)', pointerEvents: 'none', transition: 'opacity 120ms' }} />
    </div>
  );
}

/**
 * A copy of a hand card in your hand (owner, v0.47.11: it jumped and jittered on the way). It leaves from the card as
 * drawn (lit: lifted and zoomed), eases down to hand size and trails the pointer smoothly. It moves itself, frame by
 * frame, so the table never re-renders as the pointer moves.
 */
function CarriedCard({ copy, tableRef }: { copy: { card: TableCard; x: number; y: number; w: number; px: number; py: number }; tableRef: React.RefObject<HTMLDivElement | null> }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = tableRef.current;
    if (!root) return;
    let tx = copy.px, ty = copy.py, x = copy.x, y = copy.y;
    const t0 = performance.now();
    let last = t0, raf = 0;
    const move = (e: PointerEvent) => { const r = root.getBoundingClientRect(); tx = e.clientX - r.left; ty = e.clientY - r.top; };
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // It trails the pointer a touch: smooth, never a jump.
      const k = 1 - Math.exp(-dt * 20);
      x += (tx - x) * k;
      y += (ty - y) * k;
      const p = Math.min(1, (now - t0) / 260);
      const e = 1 - Math.pow(1 - p, 3);
      const w = copy.w + (HAND_W - copy.w) * e;
      if (el.current) el.current.style.transform = `translate3d(${(x - FORGED_W / 2).toFixed(2)}px, ${(y - FORGED_H / 2).toFixed(2)}px, 0) rotate(${(-3 * e).toFixed(2)}deg) scale(${(w / FORGED_W).toFixed(4)})`;
      raf = requestAnimationFrame(step);
    };
    step(t0);
    window.addEventListener('pointermove', move);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('pointermove', move); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={el} style={{ position: 'absolute', left: 0, top: 0, width: FORGED_W, height: FORGED_H, pointerEvents: 'none', zIndex: 70, transformOrigin: '50% 50%', willChange: 'transform', boxShadow: '0 26px 50px rgba(0,0,0,0.65)' }}>
      <CardFace card={copy.card} hiRes />
      {copy.card.overlay ? <div style={{ position: 'absolute', inset: 0 }}>{copy.card.overlay}</div> : null}
    </div>
  );
}

/** Every card of the Deck of Many Things in a list, to draw any one (testing). */
function DomatPicker({ left, bottom, onPick, onClose }: { left: number; bottom: number; onPick: (c: DomatCard) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.focus(); }, []);
  return (
    <>
      <div data-ui="" onPointerDown={(e) => { e.stopPropagation(); onClose(); }} style={{ position: 'absolute', inset: 0, zIndex: 1261 }} />
      <div data-ui="" ref={box} role="listbox" aria-label="Deck of Many Things cards" tabIndex={-1} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
        style={{ position: 'absolute', left, bottom, zIndex: 1262, width: 290, maxHeight: 420, overflowY: 'auto', outline: 'none', background: 'rgba(11,14,19,0.98)', border: `1px solid ${T.goldSoft}` }} className="rk-scroll">
        <div style={{ padding: '9px 12px 6px', color: T.muted, fontFamily: T.medium, fontSize: 12.5 }}>Testing: draws the card, stock or not.</div>
        {DOMAT.map((c) => (
          <div key={c.id} role="option" aria-selected={false} onClick={() => onPick(c)}
            onPointerEnter={(e) => { e.currentTarget.style.background = T.panelLit; }} onPointerLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            style={{ cursor: 'pointer', padding: '7px 12px', display: 'flex', gap: 9, alignItems: 'baseline', borderLeft: `3px solid ${c.tint}` }}>
            <span style={{ color: T.ivory, fontFamily: T.bold, fontSize: 13.5, whiteSpace: 'nowrap' }}>{c.name}</span>
            <span style={{ color: T.muted, fontFamily: T.medium, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.table}</span>
          </div>
        ))}
      </div>
    </>
  );
}

/** "2 d6, d20, Hope & Fear". */
function summarise(types: DieType[]): string {
  const counts = new Map<DieType, number>();
  for (const t of types) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts].map(([t, n]) => `${n > 1 ? `${n} ` : ''}${t === 'duality' ? 'Hope & Fear' : t}`).join(', ');
}

type Row = { label: string; onPress: () => void; danger?: boolean; gap?: boolean; hidden?: boolean };

function MenuShell({ x, y, tableW, tableH, rows, onClose, head, side }: { x: number; y: number; tableW: number; tableH: number; rows: Row[]; onClose: () => void; head?: React.ReactNode; side?: (at: { left: number; top: number; W: number }) => React.ReactNode }) {
  const W = 340, H = rows.length * 38 + rows.filter((r) => r.gap).length * 9 + 16 + (head ? 40 : 0);
  const left = Math.max(8, Math.min(x, tableW - W - 24)), top = Math.max(8, Math.min(y, tableH - H - 24));
  return (
    <>
      <div data-ui="" onPointerDown={(e) => { e.stopPropagation(); playSfx('floatMenuClose'); onClose(); }} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }} style={{ position: 'absolute', inset: 0, zIndex: 900 }} aria-label="Close the menu" />
      <div role="menu" onPointerDown={(e) => e.stopPropagation()} style={{ position: 'absolute', zIndex: 901, left, top, width: W }}>
        <Chamfer c={9} fill={T.panelLit} line={T.gold} width={1.3} inner={{ padding: 7 }}>
          {head}
          {rows.map((r) => (
            <div key={r.label}>
              {r.gap ? <div style={{ height: 1, background: 'rgba(218,162,73,0.22)', margin: '4px 6px' }} /> : null}
              <MenuRow label={r.label} danger={r.danger} onPress={() => { onClose(); r.onPress(); }} />
            </div>
          ))}
        </Chamfer>
        {side?.({ left, top, W })}
      </div>
    </>
  );
}

/**
 * The table's right-click menu (owner, v0.47.3): Roll dice first, opening a panel of the presets beside it (each
 * with a delete that asks first), then every control, whether the dice are showing or not.
 */
function TableMenu({ rows, presets, onRollPreset, onRollPair, onDeletePreset, noRolls, ...rest }: { x: number; y: number; tableW: number; tableH: number; onClose: () => void; rows: Row[]; noRolls?: boolean; presets: (DicePreset | null)[]; onRollPreset: (p: DicePreset) => void; onRollPair: () => void; onDeletePreset: (slot: number) => void }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<number | null>(null);
  const [hover, setHover] = useState(false);
  const list = presets.map((p, slot) => ({ p, slot })).filter((x): x is { p: DicePreset; slot: number } => !!x.p);
  const head = (
    <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={open} onClick={() => { playSfx('floatMenuHighlight', { volume: 0.4 }); setOpen((o) => !o); }} onPointerEnter={() => { setHover(true); setOpen(true); }} onPointerLeave={() => setHover(false)}
      style={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', display: 'flex', alignItems: 'center', width: '100%', height: 38, padding: '0 12px', marginBottom: 2, background: hover || open ? 'rgba(200,27,24,0.85)' : 'transparent', color: T.ivory, fontFamily: T.bold, fontSize: 13.5 }}>
      <span style={{ flex: 1 }}>Roll dice</span>
      <Glyph d='<path d="M9 6l6 6-6 6"/>' size={14} color={T.ivory} />
    </button>
  );
  return (
    <MenuShell {...rest} rows={rows.filter((r) => !r.hidden)} head={noRolls ? undefined : head} side={open && !noRolls ? ({ left, W }) => (
      <div role="menu" aria-label="Dice presets" style={{ position: 'absolute', top: 0, ...(left + W + 310 > rest.tableW ? { right: W + 4 } : { left: W + 4 }), width: 306 }}>
        <Chamfer c={9} fill={T.panelLit} line={T.gold} width={1.3} inner={{ padding: 7, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <MenuRow label="Hope and Fear" onPress={() => { rest.onClose(); onRollPair(); }} />
          {list.length ? <div style={{ height: 1, background: 'rgba(218,162,73,0.22)', margin: '4px 6px' }} /> : null}
          {list.map(({ p, slot }) => confirm === slot ? (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 38, padding: '0 6px 0 12px' }}>
              <span style={{ flex: 1, color: '#E2705A', fontFamily: T.bold, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Delete {p.name}?</span>
              <TButton label="Delete" h={28} onPress={() => { onDeletePreset(slot); setConfirm(null); }} />
              <TButton label="Keep" h={28} onPress={() => setConfirm(null)} />
            </div>
          ) : (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 0 }}><MenuRow label={p.name} sub={summarise(p.dice)} onPress={() => { rest.onClose(); onRollPreset(p); }} /></div>
              <button type="button" title={`Delete ${p.name}`} aria-label={`Delete ${p.name}`} onClick={() => { playSfx('buttonTap', { volume: 0.4 }); setConfirm(slot); }} style={{ all: 'unset', cursor: 'pointer', display: 'flex', padding: 9 }}>
                <Glyph d='<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>' size={14} color={T.muted} />
              </button>
            </div>
          ))}
          {list.length === 0 ? <span style={{ color: T.muted, fontFamily: T.medium, fontSize: 12.5, lineHeight: '17px', padding: '4px 12px 6px' }}>No presets yet. Drag on the table to select dice, then Save as preset.</span> : null}
        </Chamfer>
      </div>
    ) : undefined} />
  );
}

/**
 * What holding a card does on the phone, at the pointer; every row runs the same handler the wheel runs. A card laid
 * on the table is a copy, so its menu is short: make it physical (knocked about by dice) or take it off the table.
 * In the laid-out hand a card is the card itself, so it gets the whole menu and the physics switch.
 */
function CardMenu({ id, x, y, tableW, tableH, onClose, board, place, throwIt, spread, physical, onPhysical }: { id: string; x: number; y: number; tableW: number; tableH: number; onClose: () => void; board?: () => void; place?: () => void; throwIt?: () => void; spread: boolean; physical?: boolean; onPhysical?: () => void }) {
  const ctx = useCarousel();
  const item = Object.values(ctx.decks).flat().find((c) => c?.id === id);
  if (!item) return null;
  const phys: Row[] = onPhysical ? [{ label: physical ? 'Stop its physics' : 'Make it physical', onPress: onPhysical }] : [];
  if (board) return <MenuShell x={x} y={y} tableW={tableW} tableH={tableH} onClose={onClose} rows={[...phys, { label: 'Take off the table', onPress: board }]} />;
  const ref = item.ref ?? item.id;
  const fav = ctx.isFavorited(id);
  const mirror = ctx.category === FAVORITES_CATEGORY;
  const rows: Row[] = [
    ...(place ? [{ label: 'Lay a copy on the table', onPress: place }] : []),
    ...(throwIt ? [{ label: 'Throw on the table', onPress: throwIt }] : []),
    ...(spread ? phys : []),
    ...(mirror
      ? [{ label: 'Remove from Favorites', onPress: () => ctx.cardAction('unfavorite', [id]) }]
      : [
          { label: ctx.enabledIds.has(ref) ? 'Unequip' : 'Equip', onPress: () => ctx.toggleCard(id), hidden: ctx.cardStates.permanent.has(ref) },
          { label: fav ? 'Remove from Favorites' : 'Add to Favorites', onPress: () => ctx.cardAction('favorite', [id]) },
          { label: 'Move to deck', onPress: () => ctx.cardAction('move', [id]) },
          { label: ctx.nfcAvailable ? 'Share' : 'Export', onPress: () => ctx.cardAction('nfc', [id]) },
          { label: 'Delete', onPress: () => ctx.cardAction('delete', [id]), danger: true, gap: true },
        ]),
  ];
  return <MenuShell x={x} y={y} tableW={tableW} tableH={tableH} onClose={onClose} rows={rows.filter((r) => !r.hidden)} />;
}

function MenuRow({ label, sub, danger, onPress }: { label: string; sub?: string; danger?: boolean; onPress: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button type="button" role="menuitem" onClick={onPress} onPointerEnter={() => { setHover(true); playSfx('floatMenuHighlight', { volume: 0.4 }); }} onPointerLeave={() => setHover(false)}
      style={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, width: '100%', height: 38, padding: '0 12px', background: hover ? (danger ? T.red : 'rgba(200,27,24,0.85)') : 'transparent', color: danger && !hover ? '#E2705A' : T.ivory, fontFamily: T.bold, fontSize: 13.5 }}>
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      {sub ? <span style={{ marginLeft: 'auto', color: hover ? 'rgba(253,252,247,0.8)' : T.muted, fontFamily: T.medium, fontSize: 12.5, whiteSpace: 'nowrap' }}>{sub}</span> : null}
    </button>
  );
}

/** The browser's own parts, in the table's colours: sliders, scrollbars, focus, selection, placeholders. */
const TABLE_CSS = `
.rk-board > * { pointer-events: auto; }
.rk-range { -webkit-appearance: none; appearance: none; width: 100%; height: 16px; background: transparent; cursor: pointer; margin: 0; }
.rk-range::-webkit-slider-runnable-track { height: 2px; background: rgba(218,162,73,0.32); }
.rk-range::-moz-range-track { height: 2px; background: rgba(218,162,73,0.32); }
.rk-range::-webkit-slider-thumb { -webkit-appearance: none; width: 11px; height: 11px; margin-top: -4.5px; background: ${T.red}; transform: rotate(45deg); border: 1.5px solid ${T.goldText}; transition: transform 120ms; }
.rk-range::-moz-range-thumb { width: 9px; height: 9px; background: ${T.red}; transform: rotate(45deg); border: 1.5px solid ${T.goldText}; border-radius: 0; }
.rk-range:hover::-webkit-slider-thumb { transform: rotate(45deg) scale(1.25); }
.rk-range:focus-visible { outline: 1.5px solid ${T.goldBright}; outline-offset: 2px; }
.rk-die-label:focus-visible { outline: 1.5px solid ${T.goldBright}; outline-offset: 3px; color: ${T.ivory} !important; }
@media (prefers-reduced-motion: reduce) { [role="listbox"] { transition: none !important; } }
.rk-scroll { scrollbar-width: thin; scrollbar-color: rgba(218,162,73,0.45) transparent; }
.rk-scroll::-webkit-scrollbar { width: 8px; }
.rk-scroll::-webkit-scrollbar-thumb { background: rgba(218,162,73,0.4); }
[data-table-root] ::selection, .rk-scroll ::selection { background: rgba(200,27,24,0.55); color: ${T.ivory}; }
.rk-scroll input::placeholder, [data-table-root] input::placeholder { color: rgba(147,142,136,0.8); }
.rk-ok:focus-visible { outline: 1.5px solid ${T.goldBright}; outline-offset: 3px; }
.rk-scroll button:focus-visible, [role="listbox"] [role="option"]:focus-visible, [data-table-root] [role="menu"] button:focus-visible { outline: 1.5px solid ${T.goldBright}; outline-offset: 2px; }
`;

