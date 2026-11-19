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
import { type CornerTone, EnabledCorner } from '../components/enabled-corner';
import { TraitCrossOut } from '../components/trait-cross-out';
import type { DiceTrayHandle } from '../sheet/dice-tray';
import type { DicePresetSlots } from '../sheet/dice-preset-slots';
import { SortPanel } from '../sheet/sort-panel';
import { BoardCards, maxW, MIN_W } from './board-cards';
import { type DeckLook, decodeLook } from './deck-look';
import { CardFace, DeskCarousel, type DeskCarouselHandle, type TableCard } from './desk-carousel';
import type { Bounds } from './dice-physics';
import { type DomatCard, DOMAT, DOMAT_COOLDOWN_MS, drawDomat } from './domat';
import { LookPanel } from './look-panel';
import { RollPopup, type RollResult, rollSound } from './roll-dock';
import { type CardPose, DOMAT_KEY, type LoosePiece, type PlaceGroup, type Places, type SupplyPiece, type TableAction, TableDice, type TableDiceHandle, type TableDeck, type TokenInfo, type TokenPiece } from './table-dice';
import { DomatCardView, type Fx, FX_CSS, FxLayer, shake, Shards } from './table-fx';
import { type BoardCard, loadBoard, loadLook, loadSpread, saveBoard, saveLook, saveSpread, type SpreadPlace } from './table-store';
import { Chamfer, DIE_GLYPHS, Glyph, T, TButton } from './table-ui';

/** The sheet's dice state and its handle to the table (the traits and the presets roll through it). */
export type DeskDice = { up: boolean; onToggle: () => void; handleRef: { current: DiceTrayHandle | null }; presets: Omit<Parameters<typeof DicePresetSlots>[0], 'belt'> };
export type TablePanel = 'modifiers' | 'cards';

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
  const [look, setLookState] = useState<DeckLook>(loadLook);
  const lookRef = useRef(look);
  lookRef.current = look;
  const lookSave = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setLook = useCallback((l: DeckLook) => {
    setLookState(l);
    if (lookSave.current) clearTimeout(lookSave.current);
    lookSave.current = setTimeout(() => saveLook(l), 250);
  }, []);
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
    const sup = look.supDir === 'row' ? keepOut(look.supX * tableW, look.supY * tableH, along(4, 70), 40) : keepOut(look.supX * tableW, look.supY * tableH, 54, along(4, 90));
    const cat = keepOut(look.catX * tableW, look.catY * tableH, 56, 56);
    return { ctl: { ...ctl, dir: look.ctlDir }, sup: { ...sup, dir: look.supDir }, cat };
  }, [look.ctlX, look.ctlY, look.ctlDir, look.supX, look.supY, look.supDir, look.catX, look.catY, tableW, tableH, ownArea, hand.top, hand.bottom, pad]);  


  // ---------------------------------------------------------------- the hand
  const [menu, setMenu] = useState<{ id: string; x: number; y: number; board?: string } | null>(null);
  const [tableMenu, setTableMenu] = useState<{ x: number; y: number; piece?: { key: string; label: string } } | null>(null);
  const [sorting, setSorting] = useState(false);
  const [settings, setSettings] = useState(false);
  /**
   * Controls hidden (the Storyteller): a corner button shows the control dice for a while in a column down the left,
   * the deck die above them (owner, v0.47.7: right click no longer has them).
   */
  const [peek, setPeek] = useState(false);
  const peeking = peek && look.controls === 'hidden' && !settings;
  const peekPlaces = useMemo<Places>(() => {
    const mid = (openTop + openBottom) / 2;
    return { ...places, ctl: { x: pad + 52, y: mid + 60, dir: 'column' }, cat: { x: pad + 64, y: mid + 60 - 104 - 120 } };
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
  const board = spread ? spreadCards : copies;
  const setBoard = useCallback((next: BoardCard[]) => {
    if (!lookRef.current || lookRef.current.handMode !== 'spread') { setCopies(next); return; }
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
  const [copy, setCopy] = useState<{ card: TableCard; x: number; y: number; w: number; settled: boolean } | null>(null);
  const takeCopy = useCallback((card: TableCard, rect: DOMRect, p: { x: number; y: number }) => {
    const root = tableRef.current?.getBoundingClientRect();
    if (!root) return;
    playSfx('cardDragStart');
    setCopy({ card, x: rect.left - root.left + rect.width / 2, y: rect.top - root.top + rect.height / 2, w: rect.width, settled: false });
    requestAnimationFrame(() => requestAnimationFrame(() => setCopy((h) => (h ? { ...h, x: p.x - root.left, y: p.y - root.top, w: HAND_W, settled: true } : h))));
  }, []);
  useEffect(() => {
    if (!copy) return;
    const root = tableRef.current;
    if (!root) return;
    const move = (e: PointerEvent) => {
      const r = root.getBoundingClientRect();
      setCopy((h) => (h && h.settled ? { ...h, x: e.clientX - r.left, y: e.clientY - r.top } : h));
    };
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
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerdown', down, true);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', down, true);
    };
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
  const supply = useMemo<SupplyPiece[]>(() => (look.tokenTray ? [
    { key: 'src:mat', token: { kind: material }, label: material },
    { key: 'src:color', token: { kind: 'color', color: supColor }, label: 'Colour' },
    { key: 'src:die', token: { kind: 'die', dieType: supplyDie, dieValue: 1, dieValue2: supplyDie === 'duality' ? 1 : undefined }, label: supplyDie === 'duality' ? 'Hope & Fear' : supplyDie },
  ] : []), [look.tokenTray, supColor, supplyDie, material]);
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
  selRef.current = selection;
  const selTypes = selectedTypes(selection);

  // ---------------------------------------------------------------- the Deck of Many Things
  const [drawn, setDrawn] = useState<{ uid: string; card: DomatCard; x: number; y: number; from: { x: number; y: number }; snap: Map<string, { x: number; y: number }> }[]>([]);
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [fx, setFx] = useState<Fx[]>([]);
  const [shattering, setShattering] = useState<{ uid: string; card: TableCard; cx: number; cy: number; w: number; rot: number }[]>([]);
  const [scorched, setScorched] = useState<Set<string>>(new Set());
  const fxSeq = useRef(0);
  const addFx = useCallback((f: Omit<Fx, 'id'>) => {
    const id = ++fxSeq.current;
    setFx((l) => [...l, { ...f, id }]);
    setTimeout(() => setFx((l) => l.filter((x) => x.id !== id)), f.ms + 60);
  }, []);
  /**
   * One card a minute (owner, v0.47.6): every card shakes the whole table, so the deck waits between draws. When
   * the last draw was is kept per character, so a reload does not reset it.
   */
  const domatKey = `runekeep.table.domat.${characterId}`;
  const [lastDraw, setLastDraw] = useState<number>(() => { try { return Number(localStorage.getItem(domatKey)) || 0; } catch { return 0; } });
  const [, tickClock] = useState(0);
  const domatWait = Math.max(0, Math.ceil((lastDraw + DOMAT_COOLDOWN_MS - Date.now()) / 1000));
  useEffect(() => {
    if (!domatWait) return;
    const t = setInterval(() => tickClock((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [domatWait > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const drawCard = useCallback((from: { x: number; y: number }) => {
    // Development only: `__rkNextDomat = 'comet'` in the console picks the next card (and skips the wait), to check
    // each effect.
    const forced = __DEV__ ? DOMAT.find((c) => c.id === (globalThis as { __rkNextDomat?: string }).__rkNextDomat) : undefined;
    if (!forced && Date.now() < lastDraw + DOMAT_COOLDOWN_MS) {
      // Not yet: the deck shudders, and its label shows how long is left.
      playSfx('cardDisable', { volume: 0.5 });
      const eng = diceRef.current?.engine();
      eng?.jitter(DOMAT_KEY, 0.45);
      setTimeout(() => eng?.jitter(DOMAT_KEY, 0), 320);
      return;
    }
    const card = forced ?? drawDomat(gone);
    if (!card) { playSfx('cardDisable', { volume: 0.5 }); return; }
    const now = Date.now();
    setLastDraw(now);
    try { localStorage.setItem(domatKey, String(now)); } catch { /* private window */ }
    if (card.once) setGone((g) => new Set([...g, card.id]));
    playSfx('cardFullscreenEnter', { volume: 0.7 });
    // Where everything lay when it was drawn: the Fates card puts it all back.
    const eng = diceRef.current?.engine();
    const snap = new Map<string, { x: number; y: number }>();
    for (const k of eng?.keys() ?? []) { const s = eng!.state(k); if (s && !k.startsWith('tok:')) snap.set(k, { x: s.x, y: s.y }); }
    const ang = Math.random() * Math.PI * 2;
    const x = Math.min(tableW - pad - 70, Math.max(pad + 70, from.x + Math.cos(ang) * 130));
    const y = Math.min(tableH - pad - 90, Math.max(pad + 90, from.y + Math.abs(Math.sin(ang)) * 120 + 40));
    setDrawn((d) => [...d, { uid: uidOf(), card, x, y, from, snap }]);
  }, [gone, tableW, tableH, pad, lastDraw, domatKey]);

  /** A card breaking into shards (a copy goes; a laid-out hand card comes back a moment later). */
  const breakCard = useCallback((b: BoardCard) => {
    const card = lookup(b.id);
    if (!card) return;
    const { w } = sizeOf(b);
    setShattering((s) => [...s, { uid: b.uid, card, cx: b.fx * tableW, cy: b.fy * tableH, w, rot: b.rot ?? 0 }]);
    if (lookRef.current.handMode !== 'spread') setCopies(copiesRef.current.filter((c) => c.uid !== b.uid));
  }, [lookup, tableW, tableH, setCopies]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * A Deck of Many Things card plays out (v0.47.6, owner: "much more globally impactful", one draw a minute). Every
   * card reaches the whole table, and its pushes carry on through what they hit, five generations deep, the way a
   * launched piece's do.
   */
  const runEffect = useCallback((d: { card: DomatCard; snap: Map<string, { x: number; y: number }> }, x: number, y: number) => {
    const eng = diceRef.current?.engine();
    const h = diceRef.current;
    if (!eng || !h) return;
    const { card } = d;
    const tint = card.tint;
    const diag = Math.hypot(tableW, tableH);
    const mx = (play.left + play.right) / 2, my = (play.top + play.bottom) / 2;
    const CHAIN = { gen: 5, power: 2.5 };
    const movable = () => eng.keys().filter((k) => !k.startsWith('tok:'));
    const looseKeys = () => eng.keys().filter((k) => k.startsWith('free:') || k.startsWith('roll:'));
    const near = (keys: string[], r: number) => keys.filter((k) => { const s = eng.state(k); return s && Math.hypot(s.x - x, s.y - y) < r; });
    const clampX = (v: number) => Math.min(play.right - 30, Math.max(play.left + 30, v));
    const clampY = (v: number) => Math.min(play.bottom - 30, Math.max(play.top + 30, v));
    const dropLoose = (keys: string[]) => {
      const bases = new Set(keys.map(baseOf));
      setLoose(looseRef.current.filter((t) => !bases.has(t.key)));
    };
    const shatterKeys = (keys: string[]) => { for (const k of keys) eng.shatter(k); dropLoose(keys); };
    const cardsNear = (r: number) => boardRef.current.filter((b) => Math.hypot(b.fx * tableW - x, b.fy * tableH - y) < r);
    const jolt = (p: number) => shake(tableRef.current, p);
    const fling = (keys: string[], lo: number, hi: number) => {
      for (const k of keys) { const a = Math.random() * Math.PI * 2, s = lo + Math.random() * (hi - lo); eng.toss(k, Math.cos(a) * s, Math.sin(a) * s, CHAIN); }
    };
    switch (card.effect) {
      case 'gust':
        addFx({ kind: 'flash', x, y, r: 0, ms: 1100, tint });
        addFx({ kind: 'ring', x, y, r: diag, ms: 1100, tint: '#fff6d0' });
        addFx({ kind: 'ring', x, y, r: diag * 0.6, ms: 800, tint });
        eng.impulse(x, y, diag * 1.2, 7000, CHAIN);
        jolt(1.6);
        playSfx('gainGoldenHp', { volume: 0.9, cents: -300 });
        break;
      case 'star':
        addFx({ kind: 'spark', x, y, r: 520, ms: 1100, tint });
        addFx({ kind: 'ring', x, y, r: diag * 0.8, ms: 1000, tint });
        eng.impulse(x, y, diag, 5200, CHAIN);
        jolt(1);
        playSfx('gainHope', { volume: 0.9 });
        break;
      case 'flames': {
        addFx({ kind: 'fire', x, y, r: 520, ms: 1300 });
        addFx({ kind: 'flash', x, y, r: 0, ms: 700, tint: '#ff7a3c' });
        addFx({ kind: 'ring', x, y, r: diag * 0.8, ms: 1000, tint: '#ff7a3c' });
        eng.impulse(x, y, diag, 5600, CHAIN);
        // Every card on the table is scorched for a while.
        const burnt = boardRef.current.map((b) => b.uid);
        setScorched((s) => new Set([...s, ...burnt]));
        setTimeout(() => setScorched((s) => { const n = new Set(s); for (const u of burnt) n.delete(u); return n; }), 15000);
        jolt(1.2);
        playSfx('loseHope', { volume: 0.9, cents: -400 });
        break;
      }
      case 'comet':
        addFx({ kind: 'flash', x, y, r: 0, ms: 900, tint: '#ffb070' });
        addFx({ kind: 'fire', x, y, r: 360, ms: 1000 });
        addFx({ kind: 'ring', x, y, r: diag, ms: 1200, tint });
        shatterKeys(near(looseKeys(), 300));
        for (const b of cardsNear(340)) breakCard(b);
        eng.impulse(x, y, diag * 1.2, 8000, CHAIN);
        jolt(2);
        playSfx('cardDisable', { volume: 1, cents: -700 });
        break;
      case 'void':
        addFx({ kind: 'vortex', x, y, r: Math.min(700, diag * 0.45), ms: 5000, tint });
        eng.field({ kind: 'vortex', x, y, r: diag, k: 11000 }, 4800);
        playSfx('floatMenuOpen', { volume: 0.9, cents: -900 });
        setTimeout(() => {
          // Everything loose that reached the middle is gone.
          const swallowed = near(looseKeys(), 200);
          for (const k of swallowed) eng.remove(k);
          dropLoose(swallowed);
          addFx({ kind: 'implode', x, y, r: 200, ms: 700, tint });
          jolt(0.8);
        }, 4800);
        break;
      case 'blackhole':
        addFx({ kind: 'implode', x, y, r: 700, ms: 1900, tint: '#5b4a7a' });
        eng.field({ kind: 'radial', x, y, r: diag * 1.2, k: -16000 }, 1800);
        playSfx('floatMenuOpen', { volume: 0.9, cents: -1200 });
        setTimeout(() => {
          eng.impulse(x, y, diag * 1.2, 8000, CHAIN);
          addFx({ kind: 'flash', x, y, r: 0, ms: 800, tint: '#ffffff' });
          addFx({ kind: 'ring', x, y, r: diag, ms: 1100, tint: '#ffffff' });
          shake(tableRef.current, 2);
          playSfx('gainGoldenHp', { volume: 0.9, cents: -900 });
        }, 1850);
        break;
      case 'cage':
        addFx({ kind: 'implode', x, y, r: 520, ms: 2600, tint });
        eng.field({ kind: 'radial', x, y, r: diag * 1.2, k: -11000 }, 2500);
        jolt(0.6);
        playSfx('cardDragEnd', { volume: 0.9, cents: -600 });
        break;
      case 'scatter':
        fling(movable(), 2600, 5200);
        addFx({ kind: 'spark', x, y, r: 360, ms: 900, tint });
        addFx({ kind: 'ring', x, y, r: diag * 0.7, ms: 900, tint });
        jolt(1.2);
        playSfx('carouselScroll', { volume: 0.9, cents: 500 });
        break;
      case 'dance':
        for (let i = 0; i < 12; i++) setTimeout(() => {
          for (const k of movable()) { const a = Math.random() * Math.PI * 2, s = 500 + Math.random() * 600; eng.toss(k, Math.cos(a) * s, Math.sin(a) * s); }
          addFx({ kind: 'spark', x: mx + (Math.random() - 0.5) * tableW * 0.8, y: my + (Math.random() - 0.5) * tableH * 0.8, r: 160, ms: 600, tint });
          if (i % 3 === 0) jolt(0.4);
          playSfx('placeToken', { volume: 0.5, cents: 200 + i * 100 });
        }, i * 300);
        break;
      case 'moon':
        addFx({ kind: 'ring', x, y, r: diag, ms: 2200, tint });
        addFx({ kind: 'flash', x, y, r: 0, ms: 1600, tint: '#a8b8f0' });
        eng.slippery(0.02, 14000);
        eng.impulse(x, y, diag * 1.2, 1800);
        playSfx('gainHope', { volume: 0.8, cents: -500 });
        break;
      case 'mirror':
        // Everything that can move swaps to its mirror image across the card.
        for (const k of movable()) { const s = eng.state(k); if (s) eng.home(k, clampX(2 * x - s.x), clampY(2 * y - s.y)); }
        addFx({ kind: 'ring', x, y, r: diag * 0.6, ms: 900, tint });
        addFx({ kind: 'flash', x, y, r: 0, ms: 600, tint });
        playSfx('cardFullscreenEnter', { volume: 0.8 });
        break;
      case 'scramble': {
        const keys = movable().filter((k) => !k.endsWith(':f') && !k.endsWith(':u'));
        const spots = keys.map((k) => eng.state(k)!).sort(() => Math.random() - 0.5);
        keys.forEach((k, i) => { const s = spots[i]; if (s) eng.home(k, s.x, s.y); });
        addFx({ kind: 'smoke', x, y, r: 420, ms: 1000 });
        playSfx('carouselScroll', { volume: 0.8 });
        break;
      }
      case 'throne': {
        const keys = movable();
        const R = 90 + keys.length * 6;
        keys.forEach((k, i) => { const a = (i / Math.max(1, keys.length)) * Math.PI * 2 - Math.PI / 2; eng.home(k, clampX(x + Math.cos(a) * R), clampY(y + Math.sin(a) * R)); });
        addFx({ kind: 'ring', x, y, r: R + 60, ms: 1100, tint });
        addFx({ kind: 'flash', x, y, r: 0, ms: 600, tint });
        playSfx('gainGoldenHp', { volume: 0.7 });
        break;
      }
      case 'tidy':
        addFx({ kind: 'ring', x, y, r: diag * 0.6, ms: 900, tint });
        h.tidy();
        h.resetHome();
        break;
      case 'rewind':
        addFx({ kind: 'vortex', x, y, r: 420, ms: 1300, tint });
        for (const [k, p] of d.snap) if (eng.has(k)) eng.home(k, p.x, p.y);
        playSfx('gearScroll2', { volume: 0.8, cents: -300 });
        break;
      case 'steal': {
        const keys = movable().filter((k) => !k.endsWith(':f') && !k.endsWith(':u')).sort(() => Math.random() - 0.5).slice(0, 10);
        for (const k of keys) {
          const s = eng.state(k);
          if (s) addFx({ kind: 'smoke', x: s.x, y: s.y, r: 90, ms: 800 });
          eng.home(k, clampX(play.left + Math.random() * (play.right - play.left)), clampY(play.top + Math.random() * (play.bottom - play.top)));
        }
        addFx({ kind: 'smoke', x, y, r: 220, ms: 900 });
        playSfx('cardDeselect', { volume: 0.8 });
        break;
      }
      case 'charge': {
        // A charge across the whole table, through the card's row.
        const dir = x < tableW / 2 ? 1 : -1;
        const steps = Math.ceil(tableW / 110);
        for (let i = 0; i < steps; i++) setTimeout(() => {
          const cx = x + dir * i * 110;
          eng.impulse(cx, y, 320, 4600, CHAIN);
          addFx({ kind: 'ring', x: cx, y, r: 180, ms: 480, tint });
          if (i % 3 === 0) jolt(0.5);
        }, i * 55);
        playSfx('cardDragEnd', { volume: 1, cents: -200 });
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
      case 'petrify':
        for (const k of eng.keys().filter((kk) => kk.startsWith('free:'))) h.petrify(k);
        addFx({ kind: 'stone', x, y, r: diag, ms: 1400 });
        jolt(0.5);
        playSfx('cardDisable', { volume: 0.8, cents: -500 });
        break;
      case 'talons':
        addFx({ kind: 'claw', x, y, r: 320, ms: 1100, tint });
        shatterKeys(near(looseKeys(), 560));
        eng.impulse(x, y, diag, 3200, CHAIN);
        jolt(1);
        playSfx('tokenRemove', { volume: 1, cents: -300 });
        break;
      case 'ruin':
        addFx({ kind: 'ring', x, y, r: diag, ms: 1200, tint });
        addFx({ kind: 'flash', x, y, r: 0, ms: 600, tint });
        for (const b of cardsNear(Math.max(700, diag * 0.5))) breakCard(b);
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
  }, [tableW, tableH, play.left, play.right, play.top, play.bottom, addFx, breakCard, setLoose]);

  const drawnRef = useRef(drawn);
  drawnRef.current = drawn;
  const playDrawn = useCallback((uid: string, x: number, y: number) => {
    const d = drawnRef.current.find((c) => c.uid === uid);
    if (!d) return;
    setDrawn((l) => l.filter((c) => c.uid !== uid));
    addFx({ kind: 'consume', x, y, r: 120, ms: 520, tint: d.card.tint });
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
  const obstacles = useMemo(() => (ownArea ? [hand] : []), [ownArea, hand.top, hand.bottom, hand.left, hand.right]); // eslint-disable-line react-hooks/exhaustive-deps
  const lastHit = useRef(0);
  const onHardHit = useCallback((speed: number) => {
    const now = performance.now();
    if (now - lastHit.current < 160) return;
    lastHit.current = now;
    shake(tableRef.current, Math.min(1.3, (speed - 2400) / 4500));
  }, []);
  /** A physical card moved: drawn there straight away; kept once it stops. */
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
      return { ...b, fx: p.x / tableW, fy: p.y / tableH, rot: Math.round((((p.rot % 360) + 360) % 360) * 10) / 10 };
    });
    for (const uid of done) livePoses.delete(uid);
    setBoard(next);
  }, [tableW, tableH, setBoard, livePoses]);

  // ---------------------------------------------------------------- shared tables (a link with #table=RK1:...)
  const [offer, setOffer] = useState<DeckLook | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const m = /[#&]table=([^&]+)/.exec(window.location.hash);
    if (!m) return;
    const l = decodeLook(decodeURIComponent(m[1]));
    if (l) setOffer(l);
  }, []);
  const clearOffer = () => {
    setOffer(null);
    try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch { /* fine */ }
  };

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

  if (!desktop || !port) return null;
  const middle = Math.floor((deck.length - 1) / 2);
  // The first-time hint, only while the sheet's tips are still being shown (owner: not whenever the table is empty).
  const showHint = shouldShow('sheet') && board.length === 0 && !copy && !spread;
  const presets = dice.presets.presets;
  const tidyAll = () => { clearSelection(); diceRef.current?.tidy(); };
  const clearAll = () => {
    clearSelection();
    if (!spread) setCopies([]);
    diceRef.current?.tidy();
    setDrawn([]);
  };
  const looseCount = loose.length + drawn.length;

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
              onChange={(next) => setBoard(next.map((b) => { const p = livePoses.get(b.uid); return p ? { ...b, rot: Math.round((((p.rot % 360) + 360) % 360) * 10) / 10 } : b; }))}
              onReturn={(uid) => { if (!spread) setCopies(copiesRef.current.filter((b) => b.uid !== uid)); }}
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
          {scorched.size ? <style>{[...scorched].map((u) => `[data-board-card="${u}"] { filter: sepia(0.9) brightness(0.6) contrast(1.2); transition: filter 600ms; }`).join('\n')}</style> : null}
          {shattering.map((s) => <Shards key={s.uid} card={s.card} cx={s.cx} cy={s.cy} w={s.w} rot={s.rot} onDone={() => setShattering((l) => l.filter((x) => x.uid !== s.uid))} />)}
        </div>

        {/* The hand. */}
        {spread ? null : (
          <div ref={handRef} style={{ position: 'absolute', left: hand.left, top: hand.top, width: hand.right - hand.left, height: handH, zIndex: 10 }}>
            {deck.length === 0 ? (
              <div style={{ position: 'absolute', left: 0, right: 0, top: '45%', textAlign: 'center', color: T.muted, fontFamily: T.medium, fontSize: 14 }}>Nothing in this deck yet. Add a card from the sheet.</div>
            ) : (
              <DeskCarousel key={category} ref={carRef} cards={cards} look={look} initialIndex={middle} onCentre={onCentre} onCentreClick={onCentreClick} />
            )}
          </div>
        )}

        {/* Cards drawn from the Deck of Many Things, waiting to be used. */}
        {drawn.map((d) => (
          <DomatCardView key={d.uid} card={d.card} x={d.x} y={d.y} from={d.from}
            onMove={(x, y) => setDrawn((l) => l.map((c) => (c.uid === d.uid ? { ...c, x, y } : c)))}
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
          controls={peeking ? 'dice' : look.controls}
          controlFinish={look.controlDice}
          ctlMotion={look.ctlMotion}
          numberFinish={look.numberDice}
          tokens={pieces}
          cards={cardPoses}
          onCardsMoved={onCardsMoved}
          supply={supply}
          domat={look.tokenTray ? { left: DOMAT.length - gone.size, wait: domatWait } : null}
          onDomatDraw={drawCard}
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
          onReady={onReady}
          onSelect={setSelection}
          onHardHit={onHardHit}
          onTidied={() => setLoose([])}
          editing={settings}
          onMoveGroup={(g: PlaceGroup, x, y) => setLook({ ...lookRef.current, [`${g}X`]: Math.min(1, Math.max(0, x / tableW)), [`${g}Y`]: Math.min(1, Math.max(0, y / tableH)) } as DeckLook)}
          onFlipGroup={(g) => setLook({ ...lookRef.current, [`${g}Dir`]: lookRef.current[`${g}Dir`] === 'row' ? 'column' : 'row' } as DeckLook)}
          inert={overlay || settings}
        />
        <FxLayer fx={fx} />

        {/* What can be done with the pieces selected. */}
        {selection.length ? (
          <SelectionBar x={(play.left + play.right) / 2} y={openTop + 12} count={new Set(selection.map(baseOf)).size} types={selTypes}
            onRoll={() => {
              void diceRef.current?.rollPieces(selection).then((landed) => {
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
          {look.controls === 'hidden' ? <CornerButton glyph="roll" label={peeking ? 'Hide the control dice' : 'Show the control dice'} active={peeking} onPress={() => { playSfx(peeking ? 'panelClose' : 'panelOpen'); setPeek((v) => !v); }} /> : null}
          <CornerButton glyph="tidy" label="Put away loose tokens and dice" count={looseCount} onPress={tidyAll} disabled={!looseCount && !diceRef.current?.hasRoll()} />
          <CornerButton glyph="reset" label="Return supply and control dice to place" onPress={() => { diceRef.current?.resetHome(); setGone(new Set()); }} />
          <CornerButton glyph="settings" label="Table settings" active={settings} onPress={() => { playSfx(settings ? 'panelClose' : 'panelOpen'); setSettings((s) => !s); }} />
        </div>
        {settings ? (
          <div style={{ position: 'absolute', left: '50%', bottom: pad + 14, transform: 'translateX(-50%)', zIndex: 1255, pointerEvents: 'none', padding: '7px 14px', background: 'rgba(11,14,19,0.92)', border: `1px solid ${T.goldSoft}`, color: T.goldText, fontFamily: T.bold, fontSize: 13, whiteSpace: 'nowrap' }}>
            Drag a framed row to move it. The arrows beside its name stand it on end.
          </div>
        ) : null}
        {settings && !spread ? (
          <HandGrip hand={hand} onMove={(cy) => setLook({ ...lookRef.current, areaY: Math.min(1, Math.max(0, cy / tableH)) })} />
        ) : null}

        {/* A table someone shared by link. */}
        {offer ? (
          <div data-ui="" role="dialog" aria-label="A shared table" style={{ position: 'absolute', left: '50%', top: pad + 14, transform: 'translateX(-50%)', zIndex: 1270 }}>
            <Chamfer c={10} fill="rgba(11,14,19,0.97)" line={T.gold} inner={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: T.ivory, fontFamily: T.bold, fontSize: 14 }}>Someone shared a table with you.</span>
              <TButton label="Use it" primary h={32} onPress={() => { setLook(offer); clearOffer(); playSfx('cardSelect'); }} />
              <TButton label="Not now" h={32} onPress={clearOffer} />
            </Chamfer>
          </div>
        ) : null}

        {/* The copy in your hand. */}
        {copy ? (
          <div style={{ position: 'absolute', left: copy.x - copy.w / 2, top: copy.y - (copy.w * FORGED_H) / FORGED_W / 2, width: copy.w, height: (copy.w * FORGED_H) / FORGED_W, pointerEvents: 'none', zIndex: 70, transform: 'rotate(-3deg)', boxShadow: '0 26px 50px rgba(0,0,0,0.65)', transition: copy.settled ? `width 220ms ${T.ease}, height 220ms ${T.ease}` : 'none' }}>
            <div style={{ position: 'relative', width: FORGED_W, height: FORGED_H, transform: `scale(${copy.w / FORGED_W})`, transformOrigin: '0 0', transition: `transform 220ms ${T.ease}` }}>
              <CardFace card={copy.card} hiRes />
              {copy.card.overlay ? <div style={{ position: 'absolute', inset: 0 }}>{copy.card.overlay}</div> : null}
            </div>
          </div>
        ) : null}

        {sorting ? (
          <DesktopPortal to="side" priority="dialog" onDismiss={() => setSorting(false)}>
            <SortPanel file={sortFile} ids={deck.map((c) => c.id)} onApply={(ordered, moved) => { playSfx('cardDragEnd'); ctx.onReorderCards?.(moved, category, ordered); }} onClose={() => setSorting(false)} />
          </DesktopPortal>
        ) : null}
        {overlay ? <div style={{ position: 'absolute', inset: 0, zIndex: 800, background: 'rgba(6,8,13,0.45)' }} /> : null}
        {tableMenu && !overlay ? (
          <TableMenu x={tableMenu.x} y={tableMenu.y} tableW={tableW} tableH={tableH} onClose={() => setTableMenu(null)}
            presets={presets}
            onRollPreset={(p) => { rollFrom.current = { x: tableMenu.x, y: tableMenu.y }; dice.presets.onPlay(p); }}
            onRollPair={() => { rollFrom.current = { x: tableMenu.x, y: tableMenu.y }; dice.handleRef.current?.rollDuality('Hope and Fear', 0); }}
            onDeletePreset={(slot) => { dice.presets.onWrite(slot, null); playSfx('tokenRemove', { volume: 0.6 }); }}
            rows={[
              ...(tableMenu.piece ? [{ label: tableMenu.piece.label, onPress: () => diceRef.current?.rollPiece(tableMenu.piece!.key) }] : []),
              { label: 'Choose a deck', gap: !!tableMenu.piece, onPress: () => diceRef.current?.openDecks({ x: tableMenu.x, y: tableMenu.y }) },
              { label: 'Put away loose tokens and dice', onPress: tidyAll, gap: true },
              { label: 'Return supply and control dice to place', onPress: () => { diceRef.current?.resetHome(); setGone(new Set()); } },
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
            board={menu.board && !spread ? () => setCopies(copiesRef.current.filter((b) => b.uid !== menu.board)) : undefined}
            place={menu.board || spread ? undefined : () => {
              const el = handRef.current?.querySelector(`[data-card-id="${CSS.escape(menu.id)}"]`) as HTMLElement | null;
              const r = tableRef.current?.getBoundingClientRect();
              const card = lookup(menu.id);
              if (el && r && card) takeCopy(card, el.getBoundingClientRect(), { x: r.left + menu.x, y: r.top + menu.y });
            }}
            throwIt={menu.board || spread ? undefined : () => throwCopy(menu.id)} />
        ) : null}
      </div>
      {result ? <RollPopup key={result.dice.map((d) => d.id).join()} result={result} box={port} onAccept={() => { playSfx('buttonTap'); setResult(null); }} /> : null}
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
function CornerButton({ glyph, label, onPress, active, disabled, count }: { glyph: 'settings' | 'reset' | 'tidy' | 'roll'; label: string; onPress: () => void; active?: boolean; disabled?: boolean; count?: number }) {
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
function SelectionBar({ x, y, count, types, onRoll, canSave, onSave, onPutBack, onClear }: { x: number; y: number; count: number; types: DieType[]; onRoll: () => void; canSave: boolean; onSave: (name: string) => void; onPutBack: () => void; onClear: () => void }) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const save = () => { const n = name.trim(); if (!n) return; onSave(n); setNaming(false); setName(''); };
  const summary = summarise(types);
  return (
    <div data-ui="" role="toolbar" aria-label="Selected pieces" onPointerDown={(e) => e.stopPropagation()} style={{ position: 'absolute', left: x, top: y, transform: 'translateX(-50%)', zIndex: 1240 }}>
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
            <TButton label="Roll" primary h={32} disabled={!types.length} onPress={onRoll} />
            <TButton label="Save as preset" h={32} disabled={!types.length || !canSave} title={canSave ? 'Keep these dice as a preset in the table menu' : 'Every preset slot is full: delete one from the table menu'} onPress={() => setNaming(true)} />
            <TButton label="Put back" h={32} onPress={onPutBack} />
          </>
        )}
        <TButton title="Clear the selection" h={32} onPress={onClear} icon={<Glyph d={DIE_GLYPHS.close} size={14} />} />
      </Chamfer>
    </div>
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
function TableMenu({ rows, presets, onRollPreset, onRollPair, onDeletePreset, ...rest }: { x: number; y: number; tableW: number; tableH: number; onClose: () => void; rows: Row[]; presets: (DicePreset | null)[]; onRollPreset: (p: DicePreset) => void; onRollPair: () => void; onDeletePreset: (slot: number) => void }) {
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
    <MenuShell {...rest} rows={rows.filter((r) => !r.hidden)} head={head} side={open ? ({ left, W }) => (
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

