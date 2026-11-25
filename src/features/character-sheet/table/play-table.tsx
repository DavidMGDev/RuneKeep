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
import { createPortal } from 'react-dom';
import { burn, type Flames } from '@/lib/flames';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { DesktopPortal } from '@/components/desktop-portal';
import { useDesktop } from '@/hooks/use-desktop';
import { catalogIdOf, sourceLabelForCardId } from '@/features/cards/card-effects';
import { FORGED_H, FORGED_W } from '@/features/create/components/forged-card';
import { type CharacterFile, numberInputFor } from '@/lib/character-file';
import { addDie, dualityVerdict, type PoolDie, poolTotal } from '@/lib/dice-pool';
import { addFunctionKey, addVariable, hasModifier, modifierFunctionKeys, modifierVariables, PRESET_VARS, type PresetModifier, removeFunctionKey, removeVariable } from '@/lib/dice-presets';
import type { FunctionVar } from '@/lib/function-vars';
import { FAVORITES_CATEGORY } from '@/lib/favorites';
import { shouldShow } from '@/lib/onboarding-store';
import type { CardCategory, CardItem } from '../card-data';
import { BakedTokenLayer, type PlacedToken } from '../components/card-tokens';
import { ALL_TOKEN_KINDS, DIE_TYPES, type DieType, kindScale, nextDieType, placedKindScale, TOKEN_COLORS, TOKEN_FRAC, TOKEN_LABEL, tokenFill } from '../components/card-tokens-data';
import type { DieSpec } from './dice-engine';
import { type CornerTone, EnabledCorner } from '../components/enabled-corner';
import { TraitCrossOut } from '../components/trait-cross-out';
import type { DiceTrayHandle } from '../sheet/dice-tray';
import type { DicePresetSlots } from '../sheet/dice-preset-slots';
import { SortPanel } from '../sheet/sort-panel';
import { BoardCards, maxW, MIN_W } from './board-cards';
import { type DeckLook, seatControls } from './deck-look';
import { ContextMenu, type MenuSpec, type TableRow } from './context-menu';
import { DIE_ICON, MENU_ICON } from './menu-icons';
import { CategoryGlyph } from '../sheet/deck-toggle-icon';
import { CardFace, DeskCarousel, type DeskCarouselHandle, type TableCard } from './desk-carousel';
import type { Bounds, Impact } from './dice-physics';
import { type DomatCard, DOMAT, DOMAT_MAX, DOMAT_START, type DomatStock, domatStock, drawDomat, type Element, ELEMENTS, elementWinner, takeDomat } from './domat';
import { LookPanel } from './look-panel';
import { RollPopup, type RollResult, rollSound } from './roll-dock';
import { type CardPose, type CardTok, DOMAT_KEY, type LoosePiece, type PieceHit, type PlaceGroup, type Places, type SupplyPiece, SUPPLY_HALF, type TableAction, type CritStage, ctlGap, TableDice, type TableDiceHandle, type TableDeck, TOK_CHEST, type TokenInfo, type TokenPiece } from './table-dice';
import { breakPieces, CardBreak, type CardBreakMode, CardScrap, clipHalf, shardPolys, DomatCardView, type Fx, FX_CSS, FxLayer, localDir, type Pt, scrapShape, shake } from './table-fx';
import { type BoardCard, loadBoard, loadLook, loadSpread, saveBoard, saveLook, saveSpread, type SavedPiece, type SpreadPlace } from './table-store';
import { Chamfer, DIE_GLYPHS, Glyph, T, TButton } from './table-ui';
import { cue } from './table-sound';
import { naturalH, noteCard, NoteEditor, useTableNotes } from './sticky-note';
import { type OpenMenu, useTableHost } from './table-host';
import { editNote, isNoteId, mendNotes, newNote, NOTE_MAX, NOTE_W, tearNote, type TableNote } from '@/lib/table-notes';

/** The sheet's dice state and its handle to the table (the traits and the presets roll through it). */
export type DeskDice = { up: boolean; onToggle: () => void; handleRef: { current: DiceTrayHandle | null }; presets: Omit<Parameters<typeof DicePresetSlots>[0], 'belt'> & { /** What a modifier comes to for this character now (v0.47.17). */ resolve?: (mod?: PresetModifier) => number } };
type CardEditing = { can: (id: string) => boolean; open: (id: string) => void };
/** Longer than the table waits for any throw to land. */
const RETHROW_WAIT_MS = 10000;

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
/** Every material the supply walks through (v0.47.19: sizes, copper and gold, and the elements). */
const MATERIALS = ALL_TOKEN_KINDS;
/** What Put back (and Delete) takes off the table: loose dice and tokens, rolled dice and card scraps. */
const PUT_BACK = /^(free:|roll:|card:scrap:)/;
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
/** A token piece's key, taken apart: the card's uid may have a colon of its own (`s:`, `pg:`), the token's never does. */
const tokParts = (key: string) => { const at = key.lastIndexOf(':'); return { uid: key.slice(4, at), id: key.slice(at + 1) }; };
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

export function PlayTable({ characterId, dice, sortFile, onSortOpen, overlay: overlayProp, backRef, onOpen, onReady, editCard }: {
  characterId: string;
  /** The table has everything it needs on screen (its 3D models, the deck die's icons): the sheet's veil may lift. */
  onReady?: () => void;
  dice: DeskDice;
  sortFile?: CharacterFile;
  onSortOpen?: (open: boolean) => void;
  overlay: boolean;
  backRef: React.MutableRefObject<(() => boolean) | null>;
  onOpen: (p: TablePanel) => void;
  /** A character's own cards can be edited. */
  editCard?: CardEditing;
}) {
  const desktop = useDesktop();
  const { width: winW, height: winH } = useWindowDimensions();
  const ctx = useTableHost();
  const { decks, category, dm } = ctx;
  const deck = decks[category] ?? NO_CARDS;

  // ---------------------------------------------------------------- settings and layout
  const [look, setLookState] = useState<DeckLook>(() => loadLook(characterId, dm?.start));
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
    setLookState(loadLook(characterId, dm?.start));
  }, [characterId]); // eslint-disable-line react-hooks/exhaustive-deps -- the starting table never changes
  const port = desktop?.port;
  const tableW = Math.max(200, desktop ? desktop.table.width : winW);
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
  const ctlN = dm?.controls.length ?? 3;
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
    const along = (n: number, gap: number) => ((n - 1) * gap * (n > 3 ? Math.max(1, look.ctlSize) : 1)) / 2 + 40;
    let ctl: { x: number; y: number; wrap?: number } = look.ctlDir === 'row' ? keepOut(look.ctlX * tableW, look.ctlY * tableH, along(ctlN, ctlGap(ctlN, 'row')), 44) : keepOut(look.ctlX * tableW, look.ctlY * tableH, 44, along(ctlN, ctlGap(ctlN, 'column')));
    const sup = look.supDir === 'row' ? keepOut(look.supX * tableW, look.supY * tableH, SUPPLY_HALF.row, 40) : keepOut(look.supX * tableW, look.supY * tableH, 64, SUPPLY_HALF.column);
    const cat = keepOut(look.catX * tableW, look.catY * tableH, 56, 56);
    // The DM's seven are most of a narrow table's width: they find their own room (see seatControls).
    if (ctlN > 3 && look.controls === 'dice') {
      ctl = seatControls(look, ctlN, ctlGap(ctlN, look.ctlDir === 'column' ? 'column' : 'row'), { left: pad, top: pad, right: tableW - pad, bottom: tableH - pad }, hand, sup, cat);
    }
    // Pieces split off their rows sit where they were put, kept on the table and out of the hand's own area.
    const apart: Record<string, { x: number; y: number }> = {};
    for (const [k, [fx, fy]] of Object.entries(look.apart)) apart[k] = keepOut(fx * tableW, fy * tableH, 40, 40);
    return { ctl: { x: ctl.x, y: ctl.y, wrap: ctl.wrap, dir: ctl.wrap ? 'row' : look.ctlDir, k: look.ctlSize }, sup: { ...sup, dir: look.supDir }, cat, apart };
  }, [look, look.ctlX, look.ctlY, look.ctlDir, look.ctlSize, look.supX, look.supY, look.supDir, look.catX, look.catY, look.apart, look.tokenTray, look.diceChest, look.tokenChest, look.controls, ctlN, tableW, tableH, ownArea, hand.top, hand.bottom, pad]); // eslint-disable-line react-hooks/exhaustive-deps -- the hand is made of these  


  // ---------------------------------------------------------------- the hand
  const [menu, setMenu] = useState<{ id: string; x: number; y: number; board?: string } | null>(null);
  /** The felt's menu, a piece's, or one given whole (a scrap's, a drawn card's, a counter's). */
  const [tableMenu, setTableMenu] = useState<{ x: number; y: number; piece?: PieceHit; given?: MenuSpec } | null>(null);
  /** A token or die on a card right clicked (v0.47.18): its menu, then perhaps its modifiers. */
  const [tokMenu, setTokMenu] = useState<{ ref: string; id: string; x: number; y: number; mods?: boolean } | null>(null);
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
    // Seven dice do not fit under the other two in one column: they lie along the open table's foot.
    const ctl: Places['ctl'] = ctlN > 3 ? { x: tableW / 2, y: openBottom - 70, dir: 'row', k: places.ctl.k } : { x, y: top + 620, dir: 'column', k: places.ctl.k };
    return { ...places, apart: undefined, sup: { x, y: top + 135, dir: 'column' }, cat: { x, y: top + 400 }, ctl };
  }, [places, openTop, openBottom, pad, ctlN, tableW]);
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
      live: c.interactive && c.live && !c.faces ? <View style={{ width: FORGED_W, height: FORGED_H }}>{c.live}</View> : undefined,
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
  /** A card being re-arranged in the hand (owner, v0.50.4), and the order as it stands while it moves. */
  const [arranging, setArranging] = useState<{ id: string; order: string[] } | null>(null);
  const handCards = useMemo(() => {
    if (!arranging) return cards;
    const byId = new Map(cards.map((c) => [c.id, c]));
    return arranging.order.flatMap((id) => byId.get(id) ?? []);
  }, [cards, arranging]);
  const allById = useMemo(() => {
    const m = new Map<string, CardItem>();
    for (const list of Object.values(decks)) for (const c of list ?? []) if (!m.has(c.id)) m.set(c.id, c);
    return m;
  }, [decks]);
  const notes = useTableNotes(characterId);
  const noteList = notes.list, noteNow = notes.now, setNotes = notes.set;
  const noteFaces = useMemo(() => new Map(noteList.map((n) => [n.id, noteCard(n)])), [noteList]);
  /** The note being written on. */
  const [writing, setWriting] = useState<string | null>(null);
  // On the table a card's tokens stand up as pieces, so its picture is drawn without them (but with the rest). A note
  // is looked up torn or not: its scraps are drawn from it.
  const lookup = useCallback((id: string) => { if (isNoteId(id)) return noteFaces.get(id); const c = allById.get(id); return c ? toCard(c, false) : undefined; }, [allById, toCard, noteFaces]);
  const refOf = useCallback((id: string) => { const c = allById.get(id); return c ? c.ref ?? c.id : id; }, [allById]);

  const carRef = useRef<DeskCarouselHandle>(null);
  const keyCue = useRef<{ cents: number; at: number } | null>(null);
  const held = useRef({ n: 0, last: 0 });
  const onCentre = useCallback(() => {
    const kc = keyCue.current;
    keyCue.current = null;
    if (kc && performance.now() - kc.at < 400) cue('hand:scroll', 'carouselScroll', { cents: kc.cents });
    else cue('hand:scroll', 'carouselScroll');
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
  const noteBoard = useMemo<BoardCard[]>(() => noteList.filter((n) => !n.torn).map((n) => ({ uid: n.id, id: n.id, fx: n.fx, fy: n.fy, w: n.w, rot: n.rot, phys: n.phys })), [noteList]);
  const board = useMemo(() => {
    // A copy whose card is not in any deck just now (another encounter's adversary, a deleted card) is kept but not
    // drawn, and never left on the felt as a body with no picture.
    const out = copies.filter((c) => allById.has(c.id));
    return [...(spread ? spreadCards : playground ? [...out, ...pgCards] : out), ...noteBoard];
  }, [spread, spreadCards, playground, copies, pgCards, noteBoard, allById]);
  const byIdRef = useRef(allById);
  byIdRef.current = allById;
  const setBoard = useCallback((next: BoardCard[]) => {
    boardRef.current = next;
    // Notes are kept with the notes, whatever the hand is doing.
    const placed = new Map(next.filter((b) => isNoteId(b.id)).map((b) => [b.id, b]));
    if (placed.size) {
      let moved = false;
      const list = noteNow.current.map((n): TableNote => {
        const b = placed.get(n.id);
        if (!b || n.torn || (b.fx === n.fx && b.fy === n.fy && b.w === n.w && (b.rot ?? 0) === n.rot && !!b.phys === n.phys)) return n;
        moved = true;
        return { ...n, fx: b.fx, fy: b.fy, w: b.w, rot: b.rot ?? 0, phys: !!b.phys };
      });
      if (moved) setNotes(list);
    }
    const cards = next.filter((b) => !isNoteId(b.id));
    if (!lookRef.current || lookRef.current.handMode !== 'spread') {
      if (playRef.current) setPgCards(cards.filter((b) => b.uid.startsWith('pg:')));
      const nextCopies = [...cards.filter((b) => !b.uid.startsWith('pg:')), ...copiesRef.current.filter((c) => !byIdRef.current.has(c.id))];
      const was = copiesRef.current;
      // A note dragged over the felt does not write the cards out again with every step.
      if (nextCopies.length !== was.length || nextCopies.some((c, i) => c !== was[i])) setCopies(nextCopies);
      return;
    }
    const out = { ...spreadAtRef.current };
    let changed = false;
    for (const b of cards) {
      const p = out[b.id];
      if (p && p.fx === b.fx && p.fy === b.fy && p.w === b.w && p.rot === b.rot && p.phys === b.phys && p.face === b.face) continue;
      out[b.id] = { fx: b.fx, fy: b.fy, w: b.w, rot: b.rot, phys: b.phys, face: b.face };
      changed = true;
    }
    if (changed) setSpread(out);
  }, [setCopies, setSpread, noteNow, setNotes]);
  const spreadAtRef = useRef(spreadAt);
  spreadAtRef.current = spreadAt;
  const boardRef = useRef(board);
  boardRef.current = board;
  /**
   * Scraps of torn and cut cards (owner, v0.47.16): real pieces on the felt, knocked about like any other, torn again
   * when hit hard, and fading once they are small. Kept for the session; Reset clears them. `w` is the whole card's.
   */
  const [scraps, setScrapsState] = useState<{ uid: string; id: string; poly: Pt[]; w: number; x: number; y: number; rot: number; fading?: boolean }[]>([]);
  const scrapsRef = useRef(scraps);
  scrapsRef.current = scraps;
  const setScraps = useCallback((next: typeof scraps) => { scrapsRef.current = next; setScrapsState(next); }, []);
  const scrapN = useRef(0);
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
    cue('card:lift', 'cardDragStart');
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
        cue('card:place', 'cardDragEnd');
        setCopies([...copiesRef.current, { uid: uidOf(), id: copy.card.id, fx, fy, w, rot: 0 }]);
      } else {
        cue('card:cancel', 'cardDeselect', { volume: 0.6 });
      }
      setCopy(null);
    };
    window.addEventListener('pointerdown', down, true);
    return () => window.removeEventListener('pointerdown', down, true);
  }, [copy?.card, setCopies, overHand]); // eslint-disable-line react-hooks/exhaustive-deps
  const copiesRef = useRef(copies);
  copiesRef.current = copies;

  const onCentreClick = useCallback((card: TableCard, rect: DOMRect, p: { x: number; y: number }) => {
    if (look.clickTake) takeCopy(card, rect, p);
    else if (look.centreClick === 'view') {
      // A click views the card (owner, v0.47.23), growing out of it where it is drawn.
      cue('ui:open', 'cardFullscreenEnter', { volume: 0.6 });
      setViewing({ id: card.id, from: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } });
    } else if (look.centreClick === 'equip') ctx.toggleCard(card.id);
  }, [look.clickTake, look.centreClick, takeCopy, ctx]);
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
    cue('card:fling', 'cardDragStart', { volume: 0.8, cents: 200 });
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
    return { w, h: (w * naturalH(b.id)) / FORGED_W };
  };
  const cardPoses = useMemo<CardPose[]>(() => [...board.map((b) => {
    const { w, h } = sizeOf(b);
    return { key: `card:${b.uid}`, x: b.fx * tableW, y: b.fy * tableH, w, h, rot: b.phys ? b.rot ?? 0 : 0, phys: !!b.phys };
  }), ...scraps.filter((c) => !c.fading).map((c) => {
    const sh = scrapShape(c.poly), h = (c.w * naturalH(c.id)) / FORGED_W;
    return { key: `card:${c.uid}`, x: c.x, y: c.y, w: ((sh.x1 - sh.x0) / 100) * c.w, h: ((sh.y1 - sh.y0) / 100) * h, rot: c.rot, phys: true };
  })], [board, scraps, tableW, tableH]); // eslint-disable-line react-hooks/exhaustive-deps
  const pieces = useMemo<TokenPiece[]>(() => {
    const out: TokenPiece[] = [];
    for (const b of board) {
      const item = allById.get(b.id);
      if (!item && !isNoteId(b.id)) continue;
      const toks = ctx.cardTokens[item?.ref ?? b.id] ?? ctx.cardTokens[b.id] ?? [];
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
    const { uid, id } = tokParts(baseOf(key));
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
  // The playground keeps the supply and the chest, to make more pieces to play with (owner, v0.47.22).
  const supply = useMemo<SupplyPiece[]>(() => (look.tokenTray || peeking || playground ? [
    // v0.50.6 (owner, the default): one token chest in place of the token and colour spawners.
    ...(look.tokenChest ? [{ key: TOK_CHEST, token: { kind: 'wood' as const }, label: 'Tokens' }] : [
      { key: 'src:mat', token: { kind: material }, label: TOKEN_LABEL[material] },
      { key: 'src:color', token: { kind: 'color' as const, color: supColor }, label: 'Colour' },
    ]),
    { key: 'src:die', token: { kind: 'die', dieType: supplyDie, dieValue: 1, dieValue2: supplyDie === 'duality' ? 1 : undefined }, label: supplyDie === 'duality' ? 'Hope & Fear' : supplyDie },
  ] : []), [look.tokenTray, look.tokenChest, peeking, playground, supColor, supplyDie, material]);
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
      const { uid, id } = tokParts(base);
      const b = boardRef.current.find((x) => x.uid === uid);
      if (!b) return false;
      const ref = refOf(b.id);
      const t = (ctx.cardTokens[ref] ?? []).find((x) => x.id === id);
      if (!t) return false;
      info = { kind: t.kind, color: t.color, dieType: t.dieType, dieValue: t.dieValue, dieValue2: t.dieValue2, mod: t.mod };
      from = { ref, id, uid };
    }
    if (!info) return false;
    const p = local(clientX, clientY);
    // Over the supply: put it away.
    const eng = diceRef.current?.engine();
    const overSupply = !isRoll && eng && supply.some((s) => { const st = eng.state(s.key) ?? eng.state(`${s.key}:h`) ?? eng.state(`${s.key}:t`); return st && Math.hypot(st.x - p.x, st.y - p.y) < 34; });
    if (overSupply) {
      // A loose piece flies into the supply as a tidy sends it (owner, v0.47.21); a card's token simply goes.
      if (isLoose) diceRef.current?.putAway([base]);
      else if (from) { cue('piece:putAway', 'tokenRemove'); ctx.removeToken(from.ref, from.id); }
      return true;
    }
    // A physical card takes no tokens and gives none up until it is ordinary again (owner, v0.47.5).
    const hit = cardAt(clientX, clientY);
    const target = hit && !physRefs.current.has(hit.ref) ? hit : null;
    if (__DEV__) (globalThis as { __rkDrop?: unknown }).__rkDrop = target;
    if (target) {
      if (from && target.uid === from.uid) { ctx.updateToken(from.ref, from.id, { x: target.x, y: target.y }); return true; }
      if (from) ctx.removeToken(from.ref, from.id);
      if (isLoose) setLoose(looseRef.current.filter((t) => t.key !== base));
      if (isRoll) { eng?.remove(key); for (const k of eng?.keys() ?? []) if (baseOf(k) === base) eng?.remove(k); }
      ctx.placeToken(target.ref, { id: newTokenId(), ...info, x: target.x, y: target.y } as PlacedToken);
      cue('piece:onCard', 'placeToken');
      return true;
    }
    if (from) {
      // Off its card: it comes loose where it was let go.
      ctx.removeToken(from.ref, from.id);
      setLoose([...looseRef.current, { key: `free:${newTokenId()}`, token: info, x: p.x, y: p.y }]);
      cue('piece:offCard', 'cardDragEnd', { volume: 0.5 });
      return true;
    }
    return false;
  }, [cardAt, ctx, refOf, setLoose, supply]);  

  // A physical card gives its tokens up like any other (owner, v0.47.18); it still takes none.
  const popToken = useCallback((ref: string, id: string): TokenInfo | null => {
    const t = (ctx.cardTokens[ref] ?? []).find((x) => x.id === id);
    if (!t) return null;
    ctx.removeToken(ref, id);
    return { kind: t.kind, color: t.color, dieType: t.dieType, dieValue: t.dieValue, dieValue2: t.dieValue2, mod: t.mod };
  }, [ctx]);

  /** The token a card token names: one in the hand by its card and id, one on the table by its piece. */
  const cardTok = (t: CardTok) => {
    const at = 'key' in t ? tokenOf(t.key) : t;
    const tok = at ? (ctx.cardTokens[at.ref] ?? []).find((x) => x.id === at.id) : undefined;
    return at && tok ? { ref: at.ref, id: at.id, tok } : null;
  };
  /** A die on a card clicked (owner, v0.47.18): a copy rolls out onto the table from it, with its modifier; it stays. */
  const rollTok = (t: CardTok, clientX: number, clientY: number) => {
    const c = cardTok(t);
    if (!c) return;
    if (c.tok.kind !== 'die') { cue('piece:bump', 'placeToken', { volume: 0.4 }); return; }
    const m = c.tok.mod && hasModifier(c.tok.mod) ? c.tok.mod : null;
    const type = c.tok.dieType ?? 'd6';
    const pairId = poolId();
    const list: PoolDie[] = type === 'duality'
      ? [{ id: poolId(), type: 'd12', value: null, side: 'hope', pairId }, { id: poolId(), type: 'd12', value: null, side: 'fear', pairId }]
      : addDie([], type, poolId);
    rollFrom.current = local(clientX, clientY);
    void throwPool(list, { label: m ? modName(m, dice.presets.cardVars ?? []) : null, value: m ? dice.presets.resolve?.(m) ?? m.value : 0 });
  };
  /** Held till it broke (owner, v0.47.18): gone from the card, in a burst. */
  const breakTok = (t: CardTok, clientX: number, clientY: number) => {
    const c = cardTok(t);
    if (!c) return;
    ctx.removeToken(c.ref, c.id);
    const p = local(clientX, clientY);
    addFx({ kind: 'spark', x: p.x, y: p.y, r: 70, ms: 500, tint: '#ffd9a0' });
    addFx({ kind: 'smoke', x: p.x, y: p.y, r: 60, ms: 600 });
    cue('piece:break', 'tokenRemove', { volume: 0.6 });
  };

  // ---------------------------------------------------------------- rolling: presets, traits, selections
  const [result, setResult] = useState<RollResult | null>(null);
  /**
   * A critical keeps its own result back until its blast (owner, v0.47.27: CRITICAL is not to show before the build-up
   * has had its moment).
   */
  const critHold = useRef<{ busy: boolean; pending: RollResult | null }>({ busy: false, pending: null });
  const showResult = useCallback((r: RollResult) => { if (!r.dice.length) return; if (critHold.current.busy) critHold.current.pending = r; else setResult(r); }, []);
  const releaseResult = () => { const h = critHold.current; h.busy = false; if (h.pending) { setResult(h.pending); h.pending = null; } };
  const rollFrom = useRef<{ x: number; y: number } | null>(null);
  const rolling = useRef(false);
  const throwPool = useCallback(async (list: PoolDie[], m: { label: string | null; value: number }, rig?: number[]): Promise<PoolDie[] | null> => {
    if (!list.length || rolling.current || !diceRef.current) return null;
    rolling.current = true;
    setResult(null);
    const from = rollFrom.current ?? { x: (play.left + play.right) / 2, y: (openTop + openBottom) / 2 + 60 };
    rollFrom.current = null;
    for (const d of list) rolledDice.current.set(d.id, d);
    const landed = await diceRef.current.roll(list, from, rig);
    rolling.current = false;
    // Thrown again before it landed: the new throw tells its own result, this one none (v0.47.28).
    if (!landed.length) return landed;
    for (const d of landed) rolledDice.current.set(d.id, d);
    rollSound(landed);
    showResult({ total: poolTotal(landed, m.value), verdict: dualityVerdict(landed), dice: landed, label: m.label, mod: m.value });
    return landed;
  }, [play.left, play.right, openTop, openBottom, showResult]);
  /** The die being rolled for someone (a rest): grabbed and thrown again, it answers with what that throw came to. */
  const askedDie = useRef<{ id: string; tell: (value: number) => void } | null>(null);
  const rollFor = useCallback(async (type: DieType, label: string, value: number): Promise<number | null> => {
    const list = addDie([], type, poolId);
    const id = list[0].id;
    let rethrown: number | null = null, wake: (() => void) | null = null;
    askedDie.current = { id, tell: (v) => { rethrown = v; wake?.(); } };
    try {
      const landed = await throwPool(list, { label, value });
      if (!landed) return null;
      if (landed.length) return diceRef.current?.stillThere(id) ? landed[0].value : null;
      // Thrown again by hand before it landed: that throw is the roll.
      if (rethrown == null) await new Promise<void>((res) => { const t = setTimeout(res, RETHROW_WAIT_MS); wake = () => { clearTimeout(t); res(); }; });
      if (rethrown == null) return null;
      const again = [{ ...list[0], value: rethrown }];
      showResult({ total: poolTotal(again, value), verdict: null, dice: again, label, mod: value });
      return rethrown;
    } finally {
      if (askedDie.current?.id === id) askedDie.current = null;
    }
  }, [throwPool, showResult]);
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
      rollFor,
      currentDice: () => selectedTypes(selRef.current),
    };
    dice.handleRef.current = h;
    return () => { if (dice.handleRef.current === h) dice.handleRef.current = null; };
  });  
  const reroll = useCallback((id: string, value: number) => {
    const d = rolledDice.current.get(id);
    if (d) rolledDice.current.set(id, { ...d, value });
    if (askedDie.current?.id === id) askedDie.current.tell(value);
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
   * The selection's modifier (owner, v0.47.17): the same flat number, sheet variables and card elements a phone preset
   * carries, set in the Modifiers panel under the bar. It is added to the selection's roll and saved with its preset.
   */
  const [selMod, setSelMod] = useState<PresetModifier | null>(null);
  const selModRef = useRef(selMod);
  selModRef.current = selMod;
  /** A card being read large (owner, v0.47.17). */
  const [viewing, setViewing] = useState<{ id: string; from?: { left: number; top: number; width: number; height: number }; closing?: boolean } | null>(null);
  const closeView = () => { cue('ui:close', 'cardFullscreenLeave'); setViewing((v) => (v && !v.closing ? { ...v, closing: true } : v)); };
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  /**
   * The selection bar sits at the top of the open table and the roll's plaque under it, as wide as it (owner,
   * v0.47.13: they covered each other; the longer bar on top, the result below with room between), and the Many
   * Things row under whichever is lowest.
   */
  const [barBox, setBarBox] = useState({ w: 0, h: 0 });
  // Measured after every render (the bar's width follows what it holds); the check inside ends it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const [drawn, setDrawn] = useState<{ uid: string; card: DomatCard; x: number; y: number; from: { x: number; y: number }; snap: Map<string, { x: number; y: number }>; held?: boolean; /** Taken out of the stock (not picked for testing), so Reset gives it back. */ paid?: boolean }[]>([]);
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [fx, setFx] = useState<Fx[]>([]);
  const [shattering, setShattering] = useState<{ uid: string; card: TableCard; cx: number; cy: number; w: number; rot: number; mode: CardBreakMode; dir?: { x: number; y: number }; fxOnly?: boolean; clip?: Pt[] }[]>([]);
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
      cue('domat:empty', 'cardDisable', { volume: 0.5 });
      const eng = diceRef.current?.engine();
      eng?.jitter(DOMAT_KEY, 0.45);
      setTimeout(() => eng?.jitter(DOMAT_KEY, 0), 320);
      return;
    }
    const card = forced ?? drawDomat(gone);
    if (!card) { cue('domat:empty', 'cardDisable', { volume: 0.5 }); return; }
    if (after) {
      setStockSaved(after);
      try { localStorage.setItem(domatKey, JSON.stringify(after)); } catch { /* private window */ }
    }
    if (card.once) setGone((g) => new Set([...g, card.id]));
    cue('domat:draw', 'cardFullscreenEnter', { volume: 0.7 });
    addFx({ kind: 'rune', x: from.x, y: from.y, r: 90, ms: 900, tint: card.tint });
    addFx({ kind: 'spark', x: from.x, y: from.y, r: 80, ms: 600, tint: '#fff3d6' });
    // Where everything lay when it was drawn: the Fates card puts it all back.
    const eng = diceRef.current?.engine();
    const snap = new Map<string, { x: number; y: number }>();
    for (const k of [...(eng?.keys() ?? []), ...(eng?.cardKeys() ?? [])]) { const s = eng!.state(k); if (s && !k.startsWith('tok:') && !k.startsWith('src:')) snap.set(k, { x: s.x, y: s.y }); }
    if (opts?.held) { setDrawn((d) => [...d, { uid: uidOf(), card, x: opts.held!.x, y: opts.held!.y, from: opts.held!, snap, held: true, paid: !!after }]); return; }
    const ang = Math.random() * Math.PI * 2;
    const x = Math.min(tableW - pad - 70, Math.max(pad + 70, from.x + Math.cos(ang) * 130));
    const y = Math.min(tableH - pad - 90, Math.max(pad + 90, from.y + Math.abs(Math.sin(ang)) * 120 + 40));
    setDrawn((d) => [...d, { uid: uidOf(), card, x, y, from, snap, paid: !!after }]);
  }, [gone, tableW, tableH, pad, stockSaved, domatKey, addFx]);

  /**
   * A card breaking (owner, v0.47.12): torn, cut clean, burnt or blown apart (see CardBreak). A copy goes; a laid-out
   * hand card comes back a moment later as an ordinary card where it was.
   */
  const breakCard = useCallback((b: BoardCard, mode: CardBreakMode, dir?: { x: number; y: number }) => {
    // Pinned is pinned: whatever reaches it (a comet's blast took anything near), it stays whole.
    if (isNoteId(b.id) && !b.phys) return;
    const card = lookup(b.id);
    if (!card) return;
    const { w, h } = sizeOf(b);
    const p = livePoses.get(b.uid);
    livePoses.delete(b.uid);
    const cx = p?.x ?? b.fx * tableW, cy = p?.y ?? b.fy * tableH, rot = p?.rot ?? b.rot ?? 0;
    // Torn or cut, a copy leaves its halves on the table as scraps; the hand's own laid-out card stays whole.
    const note = isNoteId(b.id);
    const torn = (mode === 'tear' || mode === 'split' || mode === 'shards' || mode === 'frost') && (note || lookRef.current.handMode !== 'spread');
    setShattering((s) => [...s, { uid: b.uid, card, cx, cy, w, rot, mode, dir, fxOnly: torn }]);
    if (torn) addScraps(b.id, w, cx, cy, rot, breakPieces(mode, localDir(dir, rot), w, h).map((q) => q.poly), dir);
    if (note) setNotes(tearNote(noteNow.current, b.id));
    else if (b.uid.startsWith('pg:')) setPgCards((l) => l.filter((c) => c.uid !== b.uid));
    else if (lookRef.current.handMode !== 'spread') setCopies(copiesRef.current.filter((c) => c.uid !== b.uid));
    else setBoard(boardRef.current.map((c) => (c.uid === b.uid ? { ...c, phys: false, rot: 0, ...(p ? { fx: p.x / tableW, fy: p.y / tableH } : {}) } : c)));
  }, [lookup, tableW, tableH, setCopies, noteNow, setNotes]); // eslint-disable-line react-hooks/exhaustive-deps
  /** New scraps of a card (centred at cx, cy, turned rot), flying apart from its middle and on the way it was hit. */
  const addScraps = (id: string, w: number, cx: number, cy: number, rot: number, polys: Pt[][], dir?: { x: number; y: number }) => {
    const h = (w * naturalH(id)) / FORGED_W, a = (rot * Math.PI) / 180;
    const dl = Math.hypot(dir?.x ?? 0, dir?.y ?? 0) || 1;
    const made = polys.flatMap((poly) => {
      const sh = scrapShape(poly);
      if (sh.share < 0.02) return [];
      const lx = ((sh.x0 + sh.x1) / 200 - 0.5) * w, ly = ((sh.y0 + sh.y1) / 200 - 0.5) * h;
      const ox = lx * Math.cos(a) - ly * Math.sin(a), oy = lx * Math.sin(a) + ly * Math.cos(a);
      const ol = Math.hypot(ox, oy) || 1;
      return [{ s: { uid: `scrap:${++scrapN.current}`, id, poly, w, x: cx + ox, y: cy + oy, rot }, vx: (ox / ol) * 520 + ((dir?.x ?? 0) / dl) * 650, vy: (oy / ol) * 520 + ((dir?.y ?? 0) / dl) * 650 }];
    });
    setScraps([...scrapsRef.current, ...made.map((m) => m.s)]);
    for (const m of made) {
      let tries = 0;
      const go = () => { if (!diceRef.current?.engine()?.throwCard(`card:${m.s.uid}`, m.vx, m.vy, (Math.random() - 0.5) * 7) && ++tries < 25) setTimeout(go, 30); };
      setTimeout(go, 20);
    }
  };
  /** Scraps put back (owner, v0.47.22): they fade off the table and are gone. */
  const fadeScraps = (uids: string[]) => {
    if (!uids.length) return;
    for (const u of uids) livePoses.delete(u);
    setScraps(scrapsRef.current.map((c) => (uids.includes(c.uid) ? { ...c, fading: true } : c)));
    setTimeout(() => setScraps(scrapsRef.current.filter((c) => !uids.includes(c.uid))), 470);
  };
  /** A scrap hit hard: cut again along the hit, or, once small (or burnt, or blown up), it fades away. */
  const breakScrap = (uid: string, mode: CardBreakMode, dir?: { x: number; y: number }) => {
    const sc = scrapsRef.current.find((c) => c.uid === uid);
    if (!sc || sc.fading) return;
    const p = livePoses.get(uid);
    livePoses.delete(uid);
    const x = p?.x ?? sc.x, y = p?.y ?? sc.y, rot = p?.rot ?? sc.rot;
    const sh = scrapShape(sc.poly);
    const h = (sc.w * naturalH(sc.id)) / FORGED_W, a = (rot * Math.PI) / 180;
    const lx = ((sh.x0 + sh.x1) / 200 - 0.5) * sc.w, ly = ((sh.y0 + sh.y1) / 200 - 0.5) * h;
    // Where the whole card's middle would be, so it is burnt or cut as a part of the card it was.
    const cx = x - (lx * Math.cos(a) - ly * Math.sin(a)), cy = y - (lx * Math.sin(a) + ly * Math.cos(a));
    // Fire burns it away, from where it was struck, as it burns a card (owner, v0.47.17).
    if (mode === 'burn') {
      const card = lookup(sc.id);
      setScraps(scrapsRef.current.filter((c) => c.uid !== uid));
      if (card) setShattering((l) => [...l, { uid, card, cx, cy, w: sc.w, rot, mode: 'burn', dir, clip: sc.poly }]);
      return;
    }
    // Frost breaks it smaller still (owner, v0.47.18), till the bits are too small to keep.
    if (mode === 'frost' && sh.share >= 0.05) {
      setScraps(scrapsRef.current.filter((c) => c.uid !== uid));
      addScraps(sc.id, sc.w, cx, cy, rot, shardPolys(sc.poly, localDir(dir, rot), 3, sc.w, h), dir);
      return;
    }
    if (sh.share < 0.13 || mode === 'explode' || mode === 'frost') {
      setScraps(scrapsRef.current.map((c) => (c.uid === uid ? { ...c, x, y, rot, fading: true } : c)));
      setTimeout(() => setScraps(scrapsRef.current.filter((c) => c.uid !== uid)), 470);
      return;
    }
    const ld = localDir(dir, rot);
    const d: Pt = [(ld[0] * 100) / sc.w, (ld[1] * 100) / h];
    setScraps(scrapsRef.current.filter((c) => c.uid !== uid));
    addScraps(sc.id, sc.w, cx, cy, rot, [clipHalf(sc.poly, sh.mid, d, 1), clipHalf(sc.poly, sh.mid, d, -1)], dir);
  };

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
      cue('thief:steal', 'tokenRemove', { volume: 0.5, cents: 400 });
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
    cue(`element:${win}`, win === 'fire' ? 'loseHope' : win === 'water' ? 'cardDragEnd' : 'cardDisable', { volume: 0.45, cents: 300 });
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
  const ctlRef = useRef<string[]>([]);
  ctlRef.current = dm?.controls.map((c) => c.key) ?? ['cards', 'state', 'sort'];
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
    cue('mimic:pop', 'cardFullscreenEnter', { volume: 0.8, cents: -400 });
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
      case 'gust': {
        // A sun rises where the card fell (owner, v0.47.17: "incredibly dumb" as a plain gust): for fourteen seconds every
        // loose piece is caught in orbit round it, near ones fast and far ones slow, then the sun flares and flings them all.
        const sun = { x: clampX(x), y: clampY(y) };
        addFx({ kind: 'flash', x: sun.x, y: sun.y, r: 0, ms: 900, tint });
        cue('domat:wish', 'gainHope', { volume: 0.9 });
        const glow = setInterval(() => { addFx({ kind: 'fire', x: sun.x, y: sun.y, r: 110, ms: 1100 }); addFx({ kind: 'ring', x: sun.x, y: sun.y, r: 150, ms: 1000, tint }); }, 900);
        // Each piece keeps a lane: its own radius, kept between 110 and 420 px.
        const lane = new Map<string, number>();
        const orbit = setInterval(() => {
          for (const k of looseKeys()) {
            const s = eng.state(k);
            if (!s) continue;
            const dx = s.x - sun.x, dy = s.y - sun.y, d = Math.hypot(dx, dy) || 1;
            if (!lane.has(k)) lane.set(k, Math.min(420, Math.max(110, d * 0.6)));
            const want = lane.get(k)!;
            const tangential = 260 + 140000 / Math.max(want, 110);
            const radial = (want - d) * 4;
            eng.toss(k, (-dy / d) * tangential + (dx / d) * radial, (dx / d) * tangential + (dy / d) * radial);
          }
        }, 70);
        timers.current.push(glow, orbit);
        const flare = () => {
          clearInterval(glow);
          clearInterval(orbit);
          addFx({ kind: 'flash', x: sun.x, y: sun.y, r: 0, ms: 1100, tint });
          addFx({ kind: 'ring', x: sun.x, y: sun.y, r: diag, ms: 1100, tint: '#fff6d0' });
          eng.impulse(sun.x, sun.y, diag, 5200, CHAIN);
          jolt(1.2);
          cue('domat:gust', 'gainGoldenHp', { volume: 0.9, cents: -300 });
        };
        addLasting(`sun:${uid}`, 'Sun: everything in orbit', tint, 14000, flare);
        break;
      }
      case 'wish': {
        // Every die shows its best, and it counts.
        addFx({ kind: 'spark', x, y, r: 520, ms: 1100, tint });
        addFx({ kind: 'rune', x, y, r: 220, ms: 1300, tint });
        const dice = looseKeys().filter((k) => k.startsWith('roll:') || looseRef.current.find((l) => l.key === baseOf(k))?.token.kind === 'die');
        for (const k of dice) { const s = eng.state(k); if (s) addFx({ kind: 'consume', x: s.x, y: s.y, r: 60, ms: 700, tint }); }
        h.wish(dice);
        cue('domat:wish', 'gainHope', { volume: 0.9 });
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
        cue('domat:elements', 'loseHope', { volume: 0.8, cents: -200 });
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
        cue('domat:comet', 'cardDisable', { volume: 1, cents: -700 });
        break;
      case 'mimic': {
        // A whirlpool that really pulls (owner, v0.47.17: nothing reached it): everything loose on the table is dragged
        // in, spinning, and what reaches the middle is swallowed by a mimic that stays, breathing, until right clicked.
        addFx({ kind: 'vortex', x, y, r: 520, ms: 2800, tint });
        // Only the loose pieces are drawn in: the controls, the supply and the cards stay where they are.
        const prey = new Set(looseKeys());
        eng.field({ kind: 'radial', x, y, r: diag, k: -9500, only: prey }, 2400);
        eng.field({ kind: 'vortex', x, y, r: diag * 0.6, k: 5200, only: prey }, 2400);
        cue('domat:mimic', 'floatMenuOpen', { volume: 0.9, cents: -900 });
        later(() => {
          const key = `fx:mimic:${uid}`;
          eng.add(chestSpec(key), x, y, { pop: true });
          eng.mimic(key, 1);
          const swallowed = near(looseKeys(), 460);
          const pieces: LoosePiece[] = [];
          for (const base of new Set(swallowed.map(baseOf))) {
            const t = tokenOfBase(base);
            if (t) pieces.push({ key: base, token: t, x, y });
          }
          swallowed.forEach((k, i) => eng.vanish(k, x, y, i * 40));
          later(() => { for (const k of swallowed) eng.remove(k); dropLoose(swallowed); eng.mimic(key, 0); }, swallowed.length * 40 + 650);
          setMimics((m) => [...m, { key, x, y, pieces }]);
          addFx({ kind: 'implode', x, y, r: 260, ms: 700, tint });
          jolt(0.8);
          cue('mimic:swallow', 'cardDragEnd', { volume: 1, cents: -900 });
        }, 2500);
        break;
      }
      case 'blackhole':
        addFx({ kind: 'implode', x, y, r: 700, ms: 1900, tint: '#5b4a7a' });
        eng.field({ kind: 'radial', x, y, r: diag * 1.2, k: -16000 }, 1800);
        cue('domat:blackhole', 'floatMenuOpen', { volume: 0.9, cents: -1200 });
        later(() => {
          breakNear(300, 'explode');
          eng.impulse(x, y, diag * 1.2, 8000, CHAIN);
          addFx({ kind: 'flash', x, y, r: 0, ms: 800, tint: '#ffffff' });
          addFx({ kind: 'ring', x, y, r: diag, ms: 1100, tint: '#ffffff' });
          shake(tableRef.current, 2);
          cue('blackhole:boom', 'gainGoldenHp', { volume: 0.9, cents: -900 });
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
        cue('domat:cage', 'cardDragEnd', { volume: 0.9, cents: -600 });
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
        cue('domat:petrify', 'cardDisable', { volume: 0.8, cents: -500 });
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
        cue('domat:lock', 'cardSelect', { volume: 0.8, cents: -300 });
        break;
      }
      case 'tiny': {
        const keys = looseKeys();
        for (const k of keys) tiny.current.add(k);
        redress(keys);
        addFx({ kind: 'implode', x, y, r: 360, ms: 700, tint });
        addLasting('tiny', 'Fool: everything small', tint, null, () => { const was = [...tiny.current]; tiny.current.clear(); redress(was); });
        cue('domat:tiny', 'carouselScroll', { volume: 0.9, cents: 900 });
        break;
      }
      case 'contrary':
        eng.contrary(true);
        addFx({ kind: 'smoke', x, y, r: 420, ms: 1000 });
        addLasting('contrary', 'Idiot: throws fly backwards', tint, 30000, () => eng.contrary(false));
        cue('domat:contrary', 'carouselScroll', { volume: 0.8, cents: -400 });
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
        cue('domat:follow', 'placeToken', { volume: 0.7, cents: 700 });
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
        cue('domat:seesaw', 'gearScroll2', { volume: 0.8, cents: -500 });
        break;
      }
      case 'moon': {
        const frost = addFx({ kind: 'frost', x, y, r: 0, ms: 30000 });
        addFx({ kind: 'ring', x, y, r: diag, ms: 2200, tint });
        eng.slippery(0.02, 30000);
        eng.impulse(x, y, diag * 1.2, 1800);
        addLasting('moon', 'Moon: the felt is ice', tint, 30000, () => { eng.slippery(1, 0); setFx((l) => l.filter((f) => f.id !== frost)); });
        cue('domat:moon', 'gainHope', { volume: 0.8, cents: -500 });
        break;
      }
      case 'knight': {
        // A knight gallops round the table for twelve seconds (owner, v0.47.17): it charges straight across, turns at
        // every wall, pulsing, clanging, knocking aside whatever is in its way.
        const key = `fx:knight:${uid}`;
        eng.add({ key, shape: 'chip', size: 96, body: '#aeb6bf', edge: '#e6ebef', ink: '#141920', faces: [{ text: '\u265e' }], finish: 'metal', upright: true }, clampX(x), clampY(y), { pop: true });
        const SPEED = 2300;
        // Every charge is a straight line at a point well across the table (v0.47.18: bounced off a wall at a random
        // angle it could skim along the edge), so it always crosses the felt.
        const across = (fx: number, fy: number) => {
          const w = play.right - play.left, h = play.bottom - play.top;
          let tx = 0, ty = 0;
          for (let i = 0; i < 8; i++) {
            tx = play.left + w * (0.15 + 0.7 * Math.random());
            ty = play.top + h * (0.15 + 0.7 * Math.random());
            if (Math.hypot(tx - fx, ty - fy) > 0.5 * Math.min(w, h)) break;
          }
          return Math.atan2(ty - fy, tx - fx);
        };
        let ang = across(clampX(x), clampY(y));
        let lastPulse = 0;
        const run = setInterval(() => {
          const s = eng.state(key);
          if (!s) { clearInterval(run); return; }
          const vx = Math.cos(ang), vy = Math.sin(ang);
          const m = 90;
          const hitX = (s.x < play.left + m && vx < 0) || (s.x > play.right - m && vx > 0);
          const hitY = (s.y < play.top + m && vy < 0) || (s.y > play.bottom - m && vy > 0);
          if (hitX || hitY) {
            ang = across(s.x, s.y);
            addFx({ kind: 'impact', x: s.x, y: s.y, r: 120, ms: 420, tint });
            jolt(0.45);
            cue('knight:bounce', 'cardDragEnd', { volume: 0.9, cents: -300 });
          }
          eng.toss(key, Math.cos(ang) * SPEED, Math.sin(ang) * SPEED, { gen: 3, power: 2.4 });
          const now = performance.now();
          if (now - lastPulse > 380) { lastPulse = now; addFx({ kind: 'ring', x: s.x, y: s.y, r: 110, ms: 420, tint }); }
        }, 30);
        timers.current.push(run);
        const stop = () => { clearInterval(run); const s = eng.state(key); if (s) addFx({ kind: 'smoke', x: s.x, y: s.y, r: 140, ms: 800 }); if (eng.has(key)) eng.shatter(key); };
        addLasting(`knight:${uid}`, 'Knight: on the charge', tint, 12000, stop);
        cue('domat:knight', 'cardDragEnd', { volume: 1, cents: -200 });
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
        cue('domat:thief', 'cardDeselect', { volume: 0.8 });
        break;
      }
      case 'rewind':
        addFx({ kind: 'vortex', x, y, r: 420, ms: 1300, tint });
        for (const [k, p] of d.snap) if (eng.has(k) || eng.cardKeys().includes(k)) eng.home(k, p.x, p.y);
        cue('domat:rewind', 'gearScroll2', { volume: 0.8, cents: -300 });
        break;
      case 'throne': {
        const keys = looseKeys();
        const R = 90 + keys.length * 6;
        keys.forEach((k, i) => { const a = (i / Math.max(1, keys.length)) * Math.PI * 2 - Math.PI / 2; eng.home(k, clampX(x + Math.cos(a) * R), clampY(y + Math.sin(a) * R)); });
        addFx({ kind: 'ring', x, y, r: R + 60, ms: 1100, tint });
        addFx({ kind: 'flash', x, y, r: 0, ms: 600, tint });
        cue('domat:throne', 'gainGoldenHp', { volume: 0.7 });
        break;
      }
      case 'gems': {
        const add: LoosePiece[] = Array.from({ length: 30 }, (_, i) => ({ key: `free:${newTokenId()}${i}`, token: { kind: 'color' as const, color: TOKEN_COLORS[i % TOKEN_COLORS.length] }, x, y }));
        setLoose([...looseRef.current, ...add]);
        setTimeout(() => { for (const p of add) { const a = Math.random() * Math.PI * 2, s = 900 + Math.random() * 1600; eng.toss(p.key, Math.cos(a) * s, Math.sin(a) * s, CHAIN); } }, 60);
        addFx({ kind: 'spark', x, y, r: 360, ms: 1000, tint });
        addFx({ kind: 'flash', x, y, r: 0, ms: 600, tint });
        jolt(0.8);
        cue('domat:gems', 'gainGoldenHp', { volume: 0.8, cents: 500 });
        break;
      }
      case 'talons':
        addFx({ kind: 'claw', x, y, r: 320, ms: 1100, tint });
        shatterKeys(near(looseKeys(), 560));
        breakNear(380, 'tear');
        eng.impulse(x, y, diag, 3200, CHAIN);
        jolt(1);
        cue('domat:talons', 'tokenRemove', { volume: 1, cents: -300 });
        break;
      case 'ruin': {
        // A bolt of ruin (owner, v0.47.22: the old shockwave was boring): it flies from piece to piece, faster with each,
        // breaking every loose die and token, and goes on while any is left, pieces added meanwhile too. The control
        // dice, the supply and the cards are never its prey.
        const host = tableRef.current;
        if (!host) break;
        addFx({ kind: 'flash', x, y, r: 0, ms: 600, tint });
        cue('domat:ruin', 'cardDisable', { volume: 0.9, cents: -600 });
        const orb = document.createElement('div');
        Object.assign(orb.style, { position: 'absolute', left: '0', top: '0', width: '26px', height: '26px', marginLeft: '-13px', marginTop: '-13px', borderRadius: '50%', pointerEvents: 'none', zIndex: '25', background: 'radial-gradient(circle, #fff 0 22%, #ffb35a 40%, #e0532b 62%, rgba(224,83,43,0) 72%)', boxShadow: '0 0 26px 10px rgba(255,110,40,0.55)' });
        host.appendChild(orb);
        let px = x, py = y, speed = 1100, hits = 0, prey: string | null = null, idle = 0, last = performance.now(), trail = 0, pause = 0;
        const born = last;
        const pick = () => {
          const left = looseKeys().map((k) => ({ k, s: eng.state(k) })).filter((q): q is { k: string; s: NonNullable<typeof q.s> } => !!q.s);
          if (!left.length) return null;
          left.sort((p1, p2) => Math.hypot(p1.s.x - px, p1.s.y - py) - Math.hypot(p2.s.x - px, p2.s.y - py));
          // One of the nearest few, so its path zigzags across the table instead of sweeping it in order.
          return left[Math.floor(Math.random() * Math.min(3, left.length))].k;
        };
        const step = (now: number) => {
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          if (!orb.isConnected || now - born > 90000) { orb.remove(); return; }
          // Each break holds it a beat, swollen, so every hit lands on its own.
          if (pause > 0) { pause -= dt; orb.style.transform = `translate(${px}px, ${py}px) scale(1.5)`; requestAnimationFrame(step); return; }
          if (!prey || !eng.has(prey)) prey = pick();
          if (!prey) {
            // Nothing left: it lingers a moment for anything new, then burns out.
            idle += dt;
            orb.style.transform = `translate(${px}px, ${py}px) scale(${(1 + Math.sin(now / 90) * 0.15).toFixed(3)})`;
            if (idle > 1.4) { addFx({ kind: 'flash', x: px, y: py, r: 0, ms: 500, tint }); addFx({ kind: 'smoke', x: px, y: py, r: 110, ms: 700 }); orb.remove(); return; }
            requestAnimationFrame(step);
            return;
          }
          idle = 0;
          const t = eng.state(prey);
          if (t) {
            const dx = t.x - px, dy = t.y - py, d = Math.hypot(dx, dy), mv = speed * dt;
            if (d <= mv + 10) {
              px = t.x; py = t.y;
              const base = baseOf(prey);
              shatterKeys(eng.keys().filter((k) => baseOf(k) === base));
              hits++;
              speed = Math.min(3800, speed * 1.08);
              pause = 0.06;
              addFx({ kind: 'impact', x: px, y: py, r: 70, ms: 380, tint: '#ff8a3a' });
              addFx({ kind: 'spark', x: px, y: py, r: 90, ms: 420, tint: '#ffb35a' });
              cue('piece:break', 'loseArmor', { volume: 0.55, cents: Math.min(1200, hits * 70 - 300) });
              jolt(0.35);
              prey = null;
            } else { px += (dx / d) * mv; py += (dy / d) * mv; }
          } else prey = null;
          // A trail of embers behind it.
          if ((trail += dt) > 0.03) { trail = 0; addFx({ kind: 'spark', x: px, y: py, r: 22, ms: 260, tint: '#ff7a30' }); }
          orb.style.transform = `translate(${px}px, ${py}px)`;
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
        break;
      }
      case 'vizier': {
        // A storm of rolls (owner, v0.47.18: far more chaotic): three more dice are conjured, the table whirls, and every
        // loose die and token is flung about again and again for a few seconds; then the dice all come down and are read.
        addFx({ kind: 'spark', x, y, r: 420, ms: 1000, tint });
        addFx({ kind: 'ring', x, y, r: diag * 0.7, ms: 1000, tint });
        addFx({ kind: 'vortex', x: (play.left + play.right) / 2, y: (play.top + play.bottom) / 2, r: diag * 0.45, ms: 3600, tint });
        const kinds: DieType[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];
        setLoose([...looseRef.current, ...[0, 1, 2].map((i) => ({ key: `free:${newTokenId()}${i}`, token: { kind: 'die' as const, dieType: kinds[Math.floor(Math.random() * kinds.length)], dieValue: 1 }, x: clampX(x + (i - 1) * 60), y: clampY(y) }))]);
        // Only what lies loose whirls (the controls and the supply stay where they are).
        const whirl = (only: string[]) => eng.aura('vizier', { kind: 'vortex', x: (play.left + play.right) / 2, y: (play.top + play.bottom) / 2, r: diag, k: 2400, only: new Set(only) });
        whirl(eng.keys().filter((k) => k.startsWith('roll:') || k.startsWith('free:')));
        // The control dice and the deck stand fast through it, and for the last roll to land.
        eng.pin(['cat', ...ctlRef.current, DOMAT_KEY].filter((k) => eng.has(k)), 7000);
        let n = 0;
        const storm = setInterval(() => {
          const loose = eng.keys().filter((k) => k.startsWith('roll:') || k.startsWith('free:'));
          whirl(loose);
          for (const k of loose) {
            if (Math.random() > 0.6) continue;
            const a = Math.random() * Math.PI * 2, sp = 900 + Math.random() * 2000;
            eng.toss(k, Math.cos(a) * sp, Math.sin(a) * sp);
          }
          for (const k of loose.slice(0, 3)) { const s = eng.state(k); if (s) addFx({ kind: 'spark', x: s.x, y: s.y, r: 60, ms: 380, tint }); }
          jolt(0.2);
          cue('piece:reroll', 'gearScroll1', { volume: 0.45, cents: Math.round(Math.random() * 900 - 300) });
          if (++n < 9) return;
          clearInterval(storm);
          eng.aura('vizier', null);
          const keys = eng.keys().filter((k) => k.startsWith('roll:') || (k.startsWith('free:') && looseRef.current.find((l) => l.key === baseOf(k))?.token.kind === 'die'));
          void h.rollPieces(keys).then((landed) => {
            if (!landed.length) return;
            rollSound(landed);
            showResult({ total: poolTotal(landed, 0), verdict: dualityVerdict(landed), dice: landed, label: 'Vizier', mod: 0 });
          });
        }, 380);
        timers.current.push(storm);
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
    cue('domat:play', 'cardDragEnd', { volume: 0.7 });
    setTimeout(() => runEffect(d, x, y), 300);
  }, [addFx, runEffect]);

  // ---------------------------------------------------------------- dice and controls
  const canReorder = !!ctx.onReorderCards && category !== FAVORITES_CATEGORY && deck.length > 1 && !spread;
  const openSort = useCallback(() => { cue('ui:open', 'floatMenuOpen'); setSorting(true); }, []);
  const actions = useMemo<TableAction[]>(() => dm?.controls ?? [
    { key: 'cards', label: 'Cards', glyph: 'cards', verb: 'Open cards menu', onPress: () => { cue('ui:open', 'panelOpen'); onOpen('cards'); } },
    { key: 'state', label: 'State', glyph: 'state', verb: 'Open state menu', onPress: () => { cue('ui:open', 'panelOpen'); onOpen('modifiers'); } },
    { key: 'sort', label: 'Sort deck', glyph: 'sort', verb: 'Sort the deck', onPress: openSort, disabled: !canReorder },
  ], [dm?.controls, onOpen, canReorder, openSort]);
  /** A new sticky note, open to be written on (owner, v0.49.0). */
  const addNote = (at?: { x: number; y: number }) => {
    if (noteNow.current.length >= NOTE_MAX) { cue('domat:empty', 'cardDisable', { volume: 0.5 }); return; }
    const n = noteNow.current.length;
    const x = at?.x ?? tableW * 0.5 + ((n % 5) - 2) * 54, y = at?.y ?? (openTop + openBottom) * 0.5 + ((n % 3) - 1) * 40;
    const note = newNote(uidOf(), Math.min(tableW - pad - 62, Math.max(pad + 62, x)) / tableW, Math.min(tableH - pad - 62, Math.max(pad + 62, y)) / tableH, n);
    setNotes([...noteNow.current, note]);
    cue('card:place', 'cardDragEnd');
    setWriting(note.id);
  };
  const deleteNote = (id: string) => {
    for (const t of ctx.cardTokens[id] ?? []) ctx.removeToken(id, t.id);
    livePoses.delete(id);
    setNotes(noteNow.current.filter((n) => n.id !== id));
    cue('ui:delete', 'tokenRemove', { volume: 0.6 });
  };
  /** Pinned, it lies upright where it is and nothing breaks it; unpinned, it is knocked about again. */
  const pinNote = (id: string, pinned: boolean) => {
    const p = livePoses.get(id);
    livePoses.delete(id);
    setNotes(editNote(noteNow.current, id, pinned ? { phys: false, rot: 0, ...(p ? { fx: p.x / tableW, fy: p.y / tableH } : {}) } : { phys: true }));
    // A pinned note is only ever clicked, never selected (owner, v0.50.4).
    if (pinned && selection.includes(`card:${id}`)) { const rest = selection.filter((k) => k !== `card:${id}`); diceRef.current?.select(rest); setSelection(rest); }
    cue('card:physical', 'cardSelect', { volume: 0.6 });
  };
  const tornNotes = noteList.filter((n) => n.torn).length;
  /** Torn notes whole again: their scraps go, the writing is where it was. */
  const mendTorn = () => {
    if (!noteNow.current.some((n) => n.torn)) return;
    const back = new Set(noteNow.current.filter((n) => n.torn).map((n) => n.id));
    for (const id of back) livePoses.delete(id);
    setScraps(scrapsRef.current.filter((c) => !back.has(c.id)));
    setNotes(mendNotes(noteNow.current));
  };
  const openMenu: OpenMenu = (clientX, clientY, given) => { cue('ui:open', 'floatMenuOpen'); setTableMenu({ ...local(clientX, clientY), given }); };
  const tableDecks = useMemo<TableDeck[]>(() => {
    const keys: CardCategory[] = [...ctx.ring.filter((c) => c !== FAVORITES_CATEGORY), FAVORITES_CATEGORY];
    return keys.map((k) => ({ key: k, label: ctx.categoryMeta[k]?.label ?? k, count: ctx.decks[k]?.length ?? 0, meta: ctx.categoryMeta[k] }));
  }, [ctx.ring, ctx.categoryMeta, ctx.decks]);
  const pickDeck = useCallback((c: CardCategory) => {
    if (c === FAVORITES_CATEGORY) ctx.openFavorites();
    else ctx.setCategory(c);
  }, [ctx]);
  // With the physical carousel the hand's own area keeps out only the cards; the dice and tokens meet the hand itself.
  const physOn = look.physCarousel && !spread && !playground && deck.length > 0;
  const obstacles = useMemo(() => (ownArea && !playground ? [physOn ? { ...hand, only: 'cards' as const } : hand] : []), [ownArea, playground, physOn, hand.top, hand.bottom, hand.left, hand.right]); // eslint-disable-line react-hooks/exhaustive-deps
  /**
   * The physical carousel (owner, v0.47.25): the hand's cards are a body on the table for dice and tokens. Each knock
   * flashes it red and shoves it towards the nearer edge of the table, hard enough hits off it entirely, and a moment
   * after the last it creeps back into place. Its hitbox is the cards (what a drag of the hand grabs) and moves with it.
   */
  /** The hand's cards, each a hitbox of its own (owner, v0.47.27: the cards take the hits, not the gaps between them). */
  type HandCard = { el: HTMLElement; left: number; top: number; right: number; bottom: number };
  const shove = useRef({ off: 0, vel: 0, t: 0, hitAt: 0, raf: 0, cards: [] as HandCard[], placed: 0 });
  const physRef = useRef(physOn);
  physRef.current = physOn;
  const placeHand = useCallback(() => {
    const s = shove.current, eng = diceRef.current?.engine();
    const h = handRef.current;
    if (h) h.style.transform = s.off ? `translateY(${s.off.toFixed(1)}px)` : '';
    if (!eng) return;
    const cards = physRef.current ? s.cards : [];
    cards.forEach((c, i) => eng.setObstacle(`carousel:${i}`, { left: c.left, right: c.right, top: c.top + s.off, bottom: c.bottom + s.off, only: 'pieces' }));
    for (let i = cards.length; i < s.placed; i++) eng.setObstacle(`carousel:${i}`, null);
    s.placed = cards.length;
  }, []);
  /** Where each card is drawn now, as the hand would be at rest (table px): what a drag of the hand grabs. */
  const measureHand = useCallback(() => {
    const h = handRef.current, t = tableRef.current, s = shove.current;
    s.cards = [];
    if (!h || !t) return;
    const tr = t.getBoundingClientRect();
    for (const el of h.querySelectorAll<HTMLElement>('[data-slot]')) {
      if (el.style.visibility === 'hidden') continue;
      const q = el.getBoundingClientRect();
      if (q.width < 4 || q.right < tr.left || q.left > tr.right) continue;
      s.cards.push({ el, left: q.left - tr.left, right: q.right - tr.left, top: q.top - tr.top - s.off, bottom: q.bottom - tr.top - s.off });
    }
  }, []);
  /** A red glow over one card, once per hit. */
  const glowOf = useRef(new WeakMap<HTMLElement, HTMLDivElement>()).current;
  useEffect(() => {
    if (!physOn) { shove.current.off = 0; shove.current.vel = 0; placeHand(); return; }
    // The cards move as the hand scrolls and its look changes: measured again now and then.
    const go = () => { measureHand(); placeHand(); };
    const t0 = setTimeout(go, 300);
    const id = setInterval(go, 700);
    return () => { clearTimeout(t0); clearInterval(id); };
  }, [physOn, tableW, tableH, look, category, measureHand, placeHand]);
  const shoveTick = useCallback((now: number) => {
    const s = shove.current;
    const dt = Math.min(0.05, (now - (s.t || now)) / 1000);
    s.t = now;
    s.off += s.vel * dt;
    s.vel *= Math.exp(-5 * dt);
    // A moment after the last hit it creeps back, quicker the further out it is.
    if (now - s.hitAt > 700 && Math.abs(s.vel) < 60) {
      const back = Math.max(16, Math.abs(s.off) * 0.7) * dt;
      s.off = Math.abs(s.off) <= back ? 0 : s.off - Math.sign(s.off) * back;
    }
    // Never further than right off the table.
    s.off = Math.max(-tableH, Math.min(tableH, s.off));
    placeHand();
    if (s.off !== 0 || Math.abs(s.vel) > 1) s.raf = requestAnimationFrame(shoveTick);
    else { s.raf = 0; s.t = 0; }
  }, [tableH, placeHand]);
  const onCarouselHit = useCallback((speed: number, charged: boolean, wall: string) => {
    if (!physRef.current) return;
    const s = shove.current;
    if (!s.cards.length) return;
    // Towards whichever edge of the table it is nearer.
    const mid = (Math.min(...s.cards.map((c) => c.top)) + Math.max(...s.cards.map((c) => c.bottom))) / 2;
    const dir = mid > tableH / 2 ? 1 : -1;
    // Heavy (owner, v0.47.26: six times harder to push than at first): a charged throw (burning, frozen, lightning)
    // moves it a little, plenty of them put it off the table; a plain throw barely nudges it, a soft one not at all.
    s.vel += dir * (charged ? Math.min(260, speed * 0.02) : Math.min(60, Math.max(0, speed - 700) * 0.006));
    s.hitAt = performance.now();
    const k = Math.min(1, speed / 2600) * (charged ? 1 : 0.45);
    // The card that was hit glows red, on its own picture (which lifts with it when it is pointed at).
    const card = s.cards[Number(wall.split(':')[1])];
    const face = (card?.el.firstElementChild as HTMLElement | null) ?? card?.el;
    if (face) {
      let g = glowOf.get(face);
      if (!g) {
        g = document.createElement('div');
        Object.assign(g.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '50', opacity: '0', borderRadius: '14px', background: 'rgba(220,40,30,0.24)', boxShadow: 'inset 0 0 46px 10px rgba(255,50,35,0.9), 0 0 26px rgba(255,50,35,0.6)' });
        face.appendChild(g);
        glowOf.set(face, g);
      }
      g.animate([{ opacity: 0 }, { opacity: 0.35 + 0.55 * k, offset: 0.2 }, { opacity: 0 }], { duration: 300, easing: 'ease-out' });
    }
    if (!s.raf) s.raf = requestAnimationFrame(shoveTick);
  }, [tableH, shoveTick, glowOf]);
  useEffect(() => () => cancelAnimationFrame(shove.current.raf), []);
  /**
   * Off the table altogether (v0.50.6): a crit or a big mine sends the hand right off the nearer edge, where it stays
   * `holdMs` before it creeps back as it always does.
   */
  const knockCarousel = useCallback((holdMs: number) => {
    const s = shove.current;
    const dir = (hand.top + hand.bottom) / 2 > tableH / 2 ? 1 : -1;
    s.vel = dir * tableH * 6;
    s.hitAt = performance.now() + holdMs;
    if (!s.raf) s.raf = requestAnimationFrame(shoveTick);
  }, [hand.top, hand.bottom, tableH, shoveTick]);
  /**
   * A crit on the carousel (owner, v0.50.6): only a piece the hand threw, fast enough. It is held like a burning
   * throw's first hit (the owner's favourite: the table stops, darkens round a star of light and leans in), then the
   * table shakes hard and the hand is knocked clean off it for a good while.
   */
  const onCarouselCrit = useCallback((at: { x: number; y: number }) => {
    if (!physRef.current) return;
    const root = tableRef.current;
    if (!root) return;
    const HOLD = 320;
    diceRef.current?.engine()?.freeze(HOLD);
    cue('impact:stop', 'loseArmor', { volume: 1, cents: -900 });
    addFx({ kind: 'impact', x: at.x, y: at.y, r: 130, ms: HOLD, tint: '#ff9a3c' });
    addFx({ kind: 'flash', x: at.x, y: at.y, r: 0, ms: 260, tint: '#ffe2b0' });
    addFx({ kind: 'veil', x: at.x, y: at.y, r: 150, ms: HOLD });
    const calm = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!calm) {
      root.style.transformOrigin = `${at.x}px ${at.y}px`;
      root.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.07)', offset: 0.1 }, { transform: 'scale(1.09)', offset: 0.92 }, { transform: 'scale(1)' }], { duration: HOLD + 80, easing: 'cubic-bezier(0.2,0.8,0.2,1)' });
    }
    setTimeout(() => {
      addFx({ kind: 'ring', x: at.x, y: at.y, r: 460, ms: 700, tint: '#ffb070' });
      addFx({ kind: 'spark', x: at.x, y: at.y, r: 180, ms: 1000, tint: '#ffd27a' });
      shake(root, 2.4, 38);
      knockCarousel(2600);
    }, HOLD);
  }, [addFx, knockCarousel]);
  /**
   * A token chest's mine went off (owner, v0.50.6): fire and a ring out to its reach, and a shake that grows with the
   * tokens it was made of. A big one takes the whole table: a white-out, the hand knocked off the table, the worst shake.
   */
  const onBlast = useCallback((at: { x: number; y: number }, r: number, n: number, huge: boolean) => {
    const root = tableRef.current;
    if (huge) {
      const far = Math.hypot(tableW, tableH);
      addFx({ kind: 'flash', x: at.x, y: at.y, r: 0, ms: 800, tint: '#fff4dc' });
      addFx({ kind: 'fire', x: at.x, y: at.y, r: 460, ms: 1500 });
      addFx({ kind: 'ring', x: at.x, y: at.y, r: far, ms: 1100, tint: '#ffb070' });
      addFx({ kind: 'spark', x: at.x, y: at.y, r: 640, ms: 1500, tint: '#ffd27a' });
      addFx({ kind: 'mist', x: at.x, y: at.y, r: 520, ms: 2400, tint: '#5a5048' });
      shake(root, 5, 60);
      knockCarousel(2400);
      return;
    }
    addFx({ kind: 'flash', x: at.x, y: at.y, r: 0, ms: 220, tint: '#ffe2b0' });
    addFx({ kind: 'impact', x: at.x, y: at.y, r: Math.min(220, r * 0.45), ms: 320, tint: '#ffb050' });
    addFx({ kind: 'fire', x: at.x, y: at.y, r: Math.min(300, r * 0.6), ms: 950 });
    addFx({ kind: 'ring', x: at.x, y: at.y, r, ms: 750, tint: '#ff7a3c' });
    addFx({ kind: 'spark', x: at.x, y: at.y, r: r * 0.7, ms: 850, tint: '#ffd27a' });
    addFx({ kind: 'mist', x: at.x, y: at.y, r: r * 0.45, ms: 1500, tint: '#6b625a' });
    shake(root, Math.min(3.2, 0.5 + n * 0.2), Math.min(48, 14 + n * 2.2));
  }, [addFx, knockCarousel, tableW, tableH]);
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
  /**
   * A critical (owner, v0.47.27: the effect above all others, staged like an impact frame). The table goes dark but
   * for a spotlight on the pair in the middle and the camera pushes in; it builds, light streaking into them while
   * the screen shakes harder and harder for a second and a half; dead still, CRITICAL slams in for half a second;
   * then the blast: a white-out, rings and sparks, the camera snaps back and the dark lifts. All drawn straight into
   * the page (no re-render), over everything on the table.
   */
  const critRef = useRef<{ stage: HTMLDivElement; veil: HTMLDivElement; halo: HTMLDivElement; word?: HTMLDivElement; rumble?: Animation; streaks?: ReturnType<typeof setInterval> } | null>(null);
  const onCrit = useCallback((at: { x: number; y: number }, stage: CritStage) => {
    const root = tableRef.current;
    if (!root) return;
    const calm = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const diag = Math.hypot(tableW, tableH);
    const box = (st: Partial<CSSStyleDeclaration>) => { const d = document.createElement('div'); Object.assign(d.style, { position: 'absolute', pointerEvents: 'none' }, st); return d; };
    const c = critRef.current;
    if (stage === 'gather') {
      if (c) { clearInterval(c.streaks); c.stage.remove(); }
      // Over everything on the table, and in the way of the pointer until the blast.
      const stageEl = box({ inset: '0', zIndex: '1300', pointerEvents: 'auto' });
      const veil = box({ inset: '0', opacity: '0', background: `radial-gradient(circle at ${at.x}px ${at.y}px, rgba(4,3,8,0) 0, rgba(4,3,8,0) 70px, rgba(4,3,8,0.82) 190px, rgba(2,1,4,0.94) 420px)` });
      const halo = box({ left: `${at.x - 170}px`, top: `${at.y - 170}px`, width: '340px', height: '340px', borderRadius: '50%', opacity: '0', mixBlendMode: 'screen', background: 'radial-gradient(circle, rgba(255,214,120,0) 30%, rgba(255,200,90,0.55) 46%, rgba(255,170,60,0.18) 60%, rgba(255,170,60,0) 72%)' });
      stageEl.append(veil, halo);
      root.appendChild(stageEl);
      veil.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, easing: 'ease-out', fill: 'forwards' });
      critRef.current = { stage: stageEl, veil, halo };
      critHold.current.busy = true;
      if (!calm) {
        // The camera: in as they arrive, creeping closer as it builds, a punch on the word, snapping back with the blast.
        root.style.transformOrigin = `${at.x}px ${at.y}px`;
        root.animate([
          { transform: 'scale(1)', offset: 0, easing: 'cubic-bezier(0.3,0,0.2,1)' },
          { transform: 'scale(1.16)', offset: 0.17, easing: 'cubic-bezier(0.5,0,0.9,0.7)' },
          { transform: 'scale(1.34)', offset: 0.63, easing: 'cubic-bezier(0.1,0.9,0.2,1)' },
          { transform: 'scale(1.46)', offset: 0.67 },
          { transform: 'scale(1.43)', offset: 0.79, easing: 'cubic-bezier(0.2,0.9,0.1,1)' },
          { transform: 'scale(0.96)', offset: 0.84, easing: 'ease-out' },
          { transform: 'scale(1.015)', offset: 0.91, easing: 'ease-in-out' },
          { transform: 'scale(1)', offset: 1 },
        ], { duration: 3300 });
      }
      cue('crit:gather', 'cardFullscreenEnter', { volume: 0.7 });
      return;
    }
    if (!c) { releaseResult(); return; }
    if (stage === 'rumble') {
      cue('crit:rise', 'gainGoldenHp', { volume: 0.8 });
      c.halo.animate([{ opacity: 0, transform: 'scale(0.6)' }, { opacity: 1, transform: 'scale(1.05)' }], { duration: 1500, easing: 'ease-in', fill: 'forwards' });
      c.veil.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(0.75)' }], { duration: 1500, fill: 'forwards' });
      if (!calm) {
        // The shake: faster and wider the longer it builds.
        const host = root.parentElement ?? root;
        const frames: Keyframe[] = [];
        for (let i = 0; i <= 60; i++) {
          const k = Math.pow(i / 60, 1.6) * 14 + 0.6;
          frames.push({ transform: i === 60 ? 'none' : `translate(${((Math.random() - 0.5) * 2 * k).toFixed(1)}px, ${((Math.random() - 0.5) * 2 * k).toFixed(1)}px)` });
        }
        c.rumble = host.animate(frames, { duration: 1500, easing: 'linear' });
      }
      // Light streaking in to them, more and more of it.
      let n = 0;
      c.streaks = setInterval(() => {
        const count = 1 + Math.floor(n++ / 4);
        for (let i = 0; i < count; i++) {
          const deg = Math.random() * 360, r = 180 + Math.random() * 260, len = 30 + Math.random() * 60;
          const st = box({ left: `${at.x - len}px`, top: `${at.y - 1.5}px`, width: `${len}px`, height: '3px', borderRadius: '2px', mixBlendMode: 'screen', background: 'linear-gradient(90deg, rgba(255,240,200,0), rgba(255,226,150,0.95))', transformOrigin: '100% 50%' });
          c.stage.appendChild(st);
          st.animate([
            { transform: `rotate(${deg}deg) translateX(-${r}px)`, opacity: 0 },
            { opacity: 1, offset: 0.3 },
            { transform: `rotate(${deg}deg) translateX(-14px)`, opacity: 0.9 },
          ], { duration: 260 + Math.random() * 140, easing: 'cubic-bezier(0.5,0,1,0.6)' }).onfinish = () => st.remove();
        }
      }, 70);
      return;
    }
    if (stage === 'word') {
      clearInterval(c.streaks);
      c.rumble?.cancel();
      cue('crit:word', 'cardDisable', { volume: 0.9 });
      const flash = box({ inset: '0', background: '#fff8e6', mixBlendMode: 'screen' });
      c.stage.appendChild(flash);
      flash.animate([{ opacity: 0.85 }, { opacity: 0 }], { duration: 240, easing: 'ease-out', fill: 'forwards' });
      const word = box({ left: `${at.x}px`, top: `${at.y - 118}px`, transform: 'translate(-50%, -50%)' });
      const txt = document.createElement('div');
      txt.textContent = 'CRITICAL';
      Object.assign(txt.style, { fontFamily: T.display, fontSize: '92px', letterSpacing: '6px', whiteSpace: 'nowrap', color: '#FFF4D2', textShadow: '0 0 14px #FFD27A, 0 0 40px #E0A830, 0 0 90px #B8741A, 0 5px 0 #5a3608' });
      word.appendChild(txt);
      c.stage.appendChild(word);
      txt.animate([
        { transform: 'scale(3.2)', opacity: 0, filter: 'blur(8px)' },
        { transform: 'scale(0.9)', opacity: 1, filter: 'blur(0px)', offset: 0.32 },
        { transform: 'scale(1.04)', offset: 0.55 },
        { transform: 'scale(1)', opacity: 1 },
      ], { duration: 260, easing: 'cubic-bezier(0.2,0.9,0.3,1)', fill: 'forwards' });
      // A ring off the slam.
      const ring = box({ left: `${at.x - 60}px`, top: `${at.y - 178}px`, width: '120px', height: '120px', borderRadius: '50%', border: '3px solid rgba(255,226,150,0.9)', mixBlendMode: 'screen' });
      c.stage.appendChild(ring);
      ring.animate([{ transform: 'scale(0.4)', opacity: 1 }, { transform: 'scale(5)', opacity: 0 }], { duration: 480, easing: 'ease-out', fill: 'forwards' });
      c.word = word;
      return;
    }
    if (stage === 'boom') {
      releaseResult();
      cue('crit:boom', 'levelUpComplete', { volume: 1 });
      cue('roll:crit', 'levelUpComplete', { volume: 0.8 });
      c.word?.firstElementChild?.animate([{ transform: 'scale(1)', opacity: 1, filter: 'blur(0px)' }, { transform: 'scale(2.1)', opacity: 0, filter: 'blur(10px)' }], { duration: 520, easing: 'cubic-bezier(0.2,0.8,0.2,1)', fill: 'forwards' });
      const white = box({ inset: '0', background: `radial-gradient(circle at ${at.x}px ${at.y}px, #ffffff 0, #fff3d0 35%, rgba(255,214,140,0.9) 70%)` });
      c.stage.appendChild(white);
      white.animate([{ opacity: 1 }, { opacity: 0.9, offset: 0.15 }, { opacity: 0 }], { duration: 620, easing: 'ease-out', fill: 'forwards' });
      c.veil.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 700, delay: 120, easing: 'ease-out', fill: 'forwards' });
      c.halo.animate([{ opacity: 1, transform: 'scale(1.05)' }, { opacity: 0, transform: 'scale(3)' }], { duration: 600, easing: 'ease-out', fill: 'forwards' });
      c.stage.style.pointerEvents = 'none';
      addFx({ kind: 'flash', x: at.x, y: at.y, r: 0, ms: 900, tint: '#F9D68D' });
      addFx({ kind: 'ring', x: at.x, y: at.y, r: diag * 0.9, ms: 1000, tint: '#FFE3A0' });
      addFx({ kind: 'ring', x: at.x, y: at.y, r: diag * 0.55, ms: 800, tint: '#ffffff' });
      addFx({ kind: 'ring', x: at.x, y: at.y, r: diag * 0.3, ms: 600, tint: '#FFD27A' });
      addFx({ kind: 'rune', x: at.x, y: at.y, r: 230, ms: 1600, tint: '#F9D68D' });
      addFx({ kind: 'spark', x: at.x, y: at.y, r: 380, ms: 1100, tint: '#FFF1C8' });
      addFx({ kind: 'spark', x: at.x, y: at.y, r: 220, ms: 800, tint: '#ffffff' });
      addFx({ kind: 'consume', x: at.x, y: at.y, r: 190, ms: 800, tint: '#F2C66A' });
      if (!calm) shake((root.parentElement as HTMLElement | null) ?? root, 1.9);
      return;
    }
    // done
    releaseResult();
    clearInterval(c.streaks);
    c.stage.remove();
    critRef.current = null;
  }, [addFx, tableW, tableH]);
  useEffect(() => () => { const c = critRef.current; if (c) { clearInterval(c.streaks); c.stage.remove(); } }, []);
  const onBreak = useCallback((keys: string[], at: { x: number; y: number }, fire: boolean, first: boolean, hits: Impact[]) => {
    const bases = new Set(keys.map(baseOf));
    setLoose(looseRef.current.filter((t) => !bases.has(t.key)));
    // Physical cards break by how they were hit (owner, v0.47.12): burning, they burn; very fast, they are cut clean
    // along the way the breaker went; otherwise torn in two.
    for (const h of hits) {
      if (!h.key.startsWith('card:')) continue;
      // Only a scrap burns, and frost breaks it smaller (owner, v0.47.18).
      if (h.key.startsWith('card:scrap:')) { breakScrap(h.key.slice(5), h.cold ? 'frost' : h.fire ? 'burn' : 'split', { x: h.vx ?? 0, y: h.vy ?? 1 }); continue; }
      // A whole card never burns: a critical hit (fire, or a held strike) breaks it in five, frost in eight.
      const b = boardRef.current.find((c) => `card:${c.uid}` === h.key);
      if (b) breakCard(b, h.cold ? 'frost' : h.fire || h.strike ? 'shards' : h.speed > 3200 ? 'split' : 'tear', { x: h.vx ?? 0, y: h.vy ?? 1 });
    }
    // A critical throw's first break bursts for a second where it happened (fire hot, frost cold); every other break is a small spark.
    const cold = hits.some((h) => h.cold);
    if (first && cold) {
      addFx({ kind: 'frost', x: at.x, y: at.y, r: 150, ms: 1000 });
      addFx({ kind: 'spark', x: at.x, y: at.y, r: 190, ms: 900, tint: '#cdeeff' });
      addFx({ kind: 'ring', x: at.x, y: at.y, r: 460, ms: 700, tint: '#8fd3ff' });
      shake(tableRef.current, 1.4);
    } else if (first) {
      if (fire) addFx({ kind: 'fire', x: at.x, y: at.y, r: 130, ms: 1000 });
      addFx({ kind: 'spark', x: at.x, y: at.y, r: 180, ms: 1000, tint: fire ? '#ffd27a' : '#fff1d0' });
      addFx({ kind: 'ring', x: at.x, y: at.y, r: 460, ms: 700, tint: fire ? '#ffb070' : '#f3e6c8' });
      shake(tableRef.current, 1.4);
    } else {
      addFx({ kind: 'spark', x: at.x, y: at.y, r: fire ? 70 : 55, ms: 450, tint: cold ? '#cdeeff' : fire ? '#ffb070' : '#fff1d0' });
      shake(tableRef.current, fire ? 0.3 : 0.2);
    }
  }, [setLoose, addFx, breakCard]); // eslint-disable-line react-hooks/exhaustive-deps -- breakScrap reads only refs
  /**
   * A burning throw's first hit held (owner, v0.47.12, "like a smash final hit"): a star of light pinned where it
   * landed at once; strong, the table darkens round it and leans in for the moment it hangs.
   */
  const onHitStop = useCallback((at: { x: number; y: number }, ms: number, strong: boolean, cold?: boolean) => {
    // Frozen, the held hit is ice light (owner, v0.47.18: colder, not so warm).
    addFx({ kind: 'impact', x: at.x, y: at.y, r: strong ? 130 : 90, ms, tint: cold ? '#7fd0ff' : '#ff9a3c' });
    addFx({ kind: 'flash', x: at.x, y: at.y, r: 0, ms: 260, tint: cold ? '#e8f8ff' : '#ffe2b0' });
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
    const { mod, label } = modNow();
    showResult({ total: poolTotal(landed, mod), verdict: dualityVerdict(landed), dice: landed, label, mod });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- modNow reads refs and the stable resolver
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
    // Scraps keep where they came to rest, as cards do.
    if (done.some((u) => u.startsWith('scrap:'))) setScraps(scrapsRef.current.map((c) => { const p = done.includes(c.uid) ? livePoses.get(c.uid) : undefined; return p ? { ...c, x: p.x, y: p.y, rot: Math.round(p.rot * 10) / 10 } : c; }));
    const next = boardRef.current.map((b) => {
      const p = livePoses.get(b.uid);
      if (!p || !done.includes(b.uid)) return b;
      // The angle as it lies, never wrapped (owner, v0.47.11: -10 written back as 350 made the card's transition spin it
      // the whole way round when it came to rest).
      return { ...b, fx: p.x / tableW, fy: p.y / tableH, rot: Math.round(p.rot * 10) / 10 };
    });
    for (const uid of done) livePoses.delete(uid);
    setBoard(next);
  }, [tableW, tableH, setBoard, setScraps, livePoses]);


  // ---------------------------------------------------------------- panels, back, keys
  useEffect(() => { if (overlay) { setMenu(null); setCopy(null); setTableMenu(null); } }, [overlay]);
  useLayoutEffect(() => {
    const host = desktop?.tableHost;
    if (!host) return;
    if (overlay) host.setAttribute('inert', ''); else host.removeAttribute('inert');
    return () => host.removeAttribute('inert');
  }, [overlay, desktop?.tableHost]);
  const clearSelection = useCallback(() => { diceRef.current?.select([]); setSelection([]); setSelMod(null); }, []);
  /** What the selection's modifier comes to now, and its name on the result. */
  const modNow = () => {
    const m = selModRef.current;
    if (!m || !hasModifier(m)) return { mod: 0, label: null };
    return { mod: dice.presets.resolve?.(m) ?? m.value, label: modName(m, dice.presets.cardVars ?? []) };
  };
  const escRef = useRef<() => boolean>(() => false);
  escRef.current = () => {
    // What is on top goes first: the card read large, then a menu, then the roll's result (v0.47.18).
    if (viewing) { if (!viewing.closing) closeView(); return true; }
    if (writing) { setWriting(null); return true; }
    if (tokMenu) { cue('ui:close', 'floatMenuClose'); setTokMenu(null); return true; }
    if (menu) { cue('ui:close', 'floatMenuClose'); setMenu(null); return true; }
    if (tableMenu) { cue('ui:close', 'floatMenuClose'); setTableMenu(null); return true; }
    if (result) { setResult(null); return true; }
    if (copy) { cue('card:cancel', 'cardDeselect', { volume: 0.6 }); setCopy(null); return true; }
    if (settings) { cue('ui:close', 'panelClose'); setSettings(false); return true; }
    if (selRef.current.length) { clearSelection(); return true; }
    return false;
  };
  useEffect(() => {
    backRef.current = () => escRef.current();
    return () => { backRef.current = null; };
  }, [backRef]);

  /** Put back what of these can go: dice and tokens fly home into the supply, scraps fade away. */
  const putBack = (keys: string[]) => {
    diceRef.current?.putAway([...new Set(keys.filter((x) => /^(free|roll):/.test(x)).map(baseOf))]);
    fadeScraps(keys.filter((x) => x.startsWith('card:scrap:')).map((x) => x.slice(5)));
    // A sticky note has nowhere to go back to: putting it back deletes it (owner, v0.50.4).
    const gone = keys.filter((x) => x.startsWith('card:') && isNoteId(x.slice(5))).map((x) => x.slice(5));
    if (gone.length) {
      for (const id of gone) { for (const t of ctx.cardTokens[id] ?? []) ctx.removeToken(id, t.id); livePoses.delete(id); }
      setNotes(noteNow.current.filter((n) => !gone.includes(n.id)));
      cue('ui:delete', 'tokenRemove', { volume: 0.6 });
    }
  };
  /** Selected notes fly back out onto the open felt, where a new note lands (owner, v0.50.4: one stuck under the hand). */
  const reposition = (keys: string[]) => {
    const eng = diceRef.current?.engine();
    keys.forEach((k, i) => eng?.home(k, tableW * 0.5 + ((i % 5) - 2) * 54, (openTop + openBottom) * 0.5 + ((i % 3) - 1) * 40));
    cue('card:place', 'cardDragEnd', { volume: 0.6 });
  };
  const putBackRef = useRef(putBack);
  putBackRef.current = putBack;
  const addNoteRef = useRef(addNote);
  addNoteRef.current = addNote;
  const openMenuKey = () => {
    const held = document.activeElement as HTMLElement | null;
    if (held && held !== document.body && tableRef.current?.contains(held)) {
      const r = held.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      // What has a menu of its own (a die by its label, a counter, Fear) is right clicked where it is.
      if (held.closest('.rk-die-label[data-piece], [data-counter], [data-fear]')) { held.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y })); return; }
    }
    cue('ui:open', 'floatMenuOpen');
    const id = deck[carRef.current?.centerIndex() ?? -1]?.id;
    const el = id ? handRef.current?.querySelector(`[data-card-id="${CSS.escape(id)}"]`) : null;
    if (id && el) {
      const r = el.getBoundingClientRect();
      setMenu({ id, ...local(r.left + r.width / 2, r.top + r.height * 0.3) });
    } else setTableMenu({ x: tableW / 2, y: (openTop + openBottom) / 2 });
  };
  const openMenuKeyRef = useRef(openMenuKey);
  openMenuKeyRef.current = openMenuKey;
  const keyRef = useRef({ deck, overlay, ring: ctx.ring, ctx, canReorder, category, selection });
  keyRef.current = { deck, overlay, ring: ctx.ring, ctx, canReorder, category, selection };
  useEffect(() => {
    if (!desktop || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      const k = keyRef.current;
      // Ctrl+A takes every loose die and token and every physical card, never a control die (owner, v0.47.18).
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && !k.overlay && !/^(INPUT|TEXTAREA)$/.test((e.target as HTMLElement)?.tagName ?? '') && !(e.target as HTMLElement)?.isContentEditable) {
        const eng = diceRef.current?.engine();
        if (!eng) return;
        e.preventDefault();
        const all = [...eng.keys(), ...eng.cardKeys()].filter((x) => x.startsWith('free:') || x.startsWith('roll:') || x.startsWith('card:'));
        diceRef.current?.select(all);
        setSelection(all);
        if (all.length) cue('select', 'cardSelect', { volume: 0.5 });
        return;
      }
      if (k.overlay || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA)$/.test((e.target as HTMLElement)?.tagName ?? '')) return;
      const key = e.key.toLowerCase();
      if (key === 'escape') { if (escRef.current()) e.preventDefault(); return; }
      // Delete or Backspace puts the selected dice, tokens and scraps away (owner, v0.47.21); selected cards stay selected.
      if ((key === 'delete' || key === 'backspace') && k.selection.some((x) => PUT_BACK.test(x))) {
        e.preventDefault();
        putBackRef.current(k.selection);
        const rest = k.selection.filter((x) => !PUT_BACK.test(x));
        diceRef.current?.select(rest);
        setSelection(rest);
        return;
      }
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
        cue('card:place', 'cardDragEnd');
        k.ctx.onReorderCards?.([ids[to]], k.category, ids);
        carRef.current?.scrollTo(to);
        return;
      }
      if (key === 'n' && !e.repeat) { e.preventDefault(); addNoteRef.current(); return; }
      // The Menu key and Shift+F10: the middle card's menu, or on an empty hand the felt's.
      if (key === 'contextmenu' || (e.shiftKey && key === 'f10')) {
        e.preventDefault();
        openMenuKeyRef.current();
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
      cue('ui:open', 'floatMenuOpen');
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
  const rollSelection = (power?: number, burning?: boolean) => {
    void diceRef.current?.rollPieces(selection, power, burning).then((landed) => {
      if (!landed.length) return;
      rollSound(landed);
      const { mod, label } = modNow();
      showResult({ total: poolTotal(landed, mod), verdict: dualityVerdict(landed), dice: landed, label, mod });
    });
  };

  // ---------------------------------------------------------------- a menu for each thing (owner, v0.50.0)
  const scrapMenu = (uid: string, id: string): MenuSpec => {
    const note = isNoteId(id);
    const others = scraps.filter((s) => !s.fading && s.uid !== uid).length;
    return {
      title: note ? 'Torn note' : 'Torn card', icon: note ? MENU_ICON.note : MENU_ICON.cards,
      rows: [
        { label: 'Make the note whole', icon: MENU_ICON.mend, hidden: !note, onPress: () => {
          livePoses.delete(id);
          setScraps(scrapsRef.current.filter((c) => c.id !== id));
          setNotes(noteNow.current.map((n) => (n.id === id ? mendNotes([n])[0] : n)));
        } },
        { label: 'Put this scrap away', icon: MENU_ICON.putAway, onPress: () => fadeScraps([uid]) },
        { label: 'Put every scrap away', icon: MENU_ICON.clear, value: String(others + 1), hidden: !others, onPress: () => fadeScraps(scrapsRef.current.map((s) => s.uid)) },
      ],
    };
  };
  const drawnMenu = (d: (typeof drawn)[number]): MenuSpec => ({
    title: d.card.name, icon: MENU_ICON.decks, say: d.card.table,
    rows: [
      { label: 'Use it here', icon: MENU_ICON.useHere, onPress: () => playDrawn(d.uid, d.x, d.y) },
      { label: 'Discard it', icon: MENU_ICON.bin, danger: true, gap: true, onPress: () => {
        cue('card:cancel', 'cardDeselect', { volume: 0.6 });
        setDrawn((l) => l.filter((c) => c.uid !== d.uid));
        if (d.card.once) setGone((g) => { const n = new Set(g); n.delete(d.card.id); return n; });
      } },
    ],
  });
  /** Bare felt: what is the table's, and nothing that is one piece's. */
  const feltMenu = (at: { x: number; y: number }): MenuSpec => {
    const full = noteList.length >= NOTE_MAX;
    const from = () => { rollFrom.current = { x: at.x, y: at.y }; };
    const saved = presets.flatMap((p, slot) => (p ? [{ p, slot }] : []));
    return { rows: [
      { label: 'Roll dice', icon: MENU_ICON.roll, say: saved.length ? undefined : 'No presets yet. Drag on the table to select dice, then Save as preset.', rows: [
        { label: 'Hope and Fear', icon: DIE_ICON.duality, onPress: () => { from(); dice.handleRef.current?.rollDuality('Hope and Fear', 0); } },
        ...saved.map(({ p, slot }, i): TableRow => ({
          label: p.name, icon: p.dice.length === 1 ? DIE_ICON[p.dice[0] as DieType] ?? MENU_ICON.roll : MENU_ICON.roll, value: summarise(p.dice), gap: i === 0,
          onPress: () => { from(); dice.presets.onPlay(p); },
          remove: {
            label: `Delete ${p.name}`, confirm: { title: `Delete ${p.name}?`, body: 'The preset is removed. The dice on the table stay.', verb: 'Delete preset' },
            onPress: () => { dice.presets.onWrite(slot, null); cue('ui:delete', 'tokenRemove', { volume: 0.6 }); },
          },
        })),
      ] },
      { label: 'New sticky note', icon: MENU_ICON.note, gap: true, value: full ? 'Table is full' : 'N', disabled: full, onPress: () => addNote(at) },
      ...(dm ? [
        { label: 'New counter', icon: MENU_ICON.counter, disabled: dm.counters.full, value: dm.counters.full ? 'Table is full' : undefined, onPress: () => dm.counters.add({ x: at.x / tableW, y: at.y / tableH }) },
        { label: 'All counters', icon: MENU_ICON.counters, onPress: () => dm.counters.open() },
      ] : []),
      { label: 'Choose a deck', icon: MENU_ICON.decks, value: ctx.categoryMeta[category]?.label, hidden: playground, onPress: () => diceRef.current?.openDecks(at) },
      // The DM's dice by name, for a table that hides them.
      ...(dm && !playground && look.controls !== 'dice'
        ? dm.controls.map((c, i): TableRow => ({ label: c.verb, icon: DIE_GLYPHS[c.glyph], gap: i === 0, onPress: () => diceRef.current?.useControl(c.key, at) }))
        : []),
      { label: 'Bring back torn notes', icon: MENU_ICON.mend, gap: true, value: String(tornNotes), hidden: !tornNotes, onPress: mendTorn },
      { label: 'Reset the table', icon: MENU_ICON.reset, gap: !tornNotes, onPress: resetAll },
      { label: 'Table settings', icon: MENU_ICON.settings, gap: true, hidden: playground, onPress: () => setSettings(true) },
    ] };
  };
  const pieceSpec = (piece: PieceHit, at: { x: number; y: number }): MenuSpec => {
    if (piece.kind === 'deck') {
      return { title: 'Decks', icon: MENU_ICON.decks, rows: [
        ...tableDecks.map((d): TableRow => ({
          label: d.label, value: String(d.count), checked: d.key === category,
          icon: <span style={{ display: 'flex', transform: 'scale(0.4)' }}><CategoryGlyph category={d.key} meta={d.meta} /></span>,
          onPress: () => pickDeck(d.key),
        })),
        { label: 'New category', icon: MENU_ICON.newDeck, gap: true, onPress: () => { cue('ui:open', 'panelOpen'); onOpen('newCategory'); } },
      ] };
    }
    if (piece.kind === 'control') {
      const a = piece.action, options = a.menu?.();
      return { title: a.label, icon: DIE_GLYPHS[a.glyph], rows: options
        // A die with a menu: its own options are its menu.
        ? options.map((o): TableRow => ({ label: o.label, gap: o.gap, icon: DIE_GLYPHS[o.glyph], value: o.sub || undefined, checked: o.on || undefined, disabled: o.disabled, onPress: o.onPress }))
        : [{ label: a.verb, icon: DIE_GLYPHS[a.glyph], disabled: a.disabled, onPress: () => diceRef.current?.useControl(piece.key, at) }] };
    }
    if (piece.kind === 'toy') return { title: 'Loose piece', icon: MENU_ICON.roll, rows: [{ label: 'Roll it', icon: MENU_ICON.roll, onPress: () => diceRef.current?.rollPiece(piece.key) }] };

    const base = baseOf(piece.key);
    // A die rolls itself and nothing else (owner): rolling the selection is the selection bar's.
    const picked = [...new Set(selection.filter((k) => PUT_BACK.test(k)).map(baseOf))];
    const many: TableRow[] = picked.length > 1 && picked.includes(base) ? [
      { label: 'Put all selected away', icon: MENU_ICON.putAll, gap: true, value: `${picked.length} pieces`, onPress: () => {
        putBack(selection);
        const rest = selection.filter((k) => !PUT_BACK.test(k));
        diceRef.current?.select(rest);
        setSelection(rest);
      } },
    ] : [];
    const away: TableRow = { label: 'Put it away', icon: MENU_ICON.putAway, onPress: () => putBack([piece.key]) };
    if (piece.kind === 'token') {
      const { kind } = piece.token;
      const name = kind === 'color' ? 'Colour' : kind === 'die' ? 'Die' : TOKEN_LABEL[kind];
      return { title: `${name} token`, icon: MENU_ICON.token, rows: [away, ...many] };
    }
    const duality = piece.die === 'duality';
    /**
     * A d20 thrown as one side of Hope and Fear (owner, v0.50.4): a d12 of the other side comes with it, and the two are
     * a pair like any other, its result, its critical and all. The d20 is thrown again from where it lies.
     */
    const asPair = (side: 'hope' | 'fear') => () => {
      const at = diceRef.current?.engine()?.state(piece.key);
      if (piece.key.startsWith('free:')) setLoose(looseRef.current.filter((t) => t.key !== base));
      rollFrom.current = at ? { x: at.x, y: at.y } : null;
      const pairId = poolId();
      void throwPool([{ id: poolId(), type: 'd20', value: null, side, pairId }, { id: poolId(), type: 'd12', value: null, side: side === 'hope' ? 'fear' : 'hope', pairId }], { label: null, value: 0 });
    };
    return {
      title: duality ? 'Hope and Fear' : piece.die, icon: DIE_ICON[piece.die],
      detail: piece.value === undefined ? undefined : `Shows ${duality && piece.value2 !== undefined ? `${piece.value} and ${piece.value2}` : piece.value}`,
      rows: [
        { label: duality ? 'Roll these dice' : `Roll this ${piece.die}`, icon: DIE_ICON[piece.die], onPress: () => diceRef.current?.rollPiece(piece.key) },
        ...(piece.die === 'd20' ? [
          { label: 'Roll as Hope die', icon: DIE_ICON.duality, onPress: asPair('hope') },
          { label: 'Roll as Fear die', icon: DIE_ICON.duality, onPress: asPair('fear') },
        ] : []),
        away, ...many,
      ],
    };
  };
  /** The corner buttons folded away (owner, v0.47.17), remembered in this browser. */
  const [tucked, setTuckedState] = useState(() => { try { return localStorage.getItem('runekeep.table.cornerTucked') === '1'; } catch { return false; } });
  const setTucked = (v: boolean) => { setTuckedState(v); try { localStorage.setItem('runekeep.table.cornerTucked', v ? '1' : '0'); } catch { /* private window */ } };
  if (!desktop || !port) return null;
  const middle = Math.floor((deck.length - 1) / 2);
  // The first-time hint, only while the sheet's tips are still being shown (owner: not whenever the table is empty).
  const showHint = !dm && shouldShow('sheet') && board.length === 0 && !copy && !spread;
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
    setScraps([]);
    setNotes(mendNotes(noteNow.current));
    diceRef.current?.tidy();
    setGone(new Set());
    // Cards drawn and not yet used fly back into the deck, and its stock counts them again (owner, v0.47.22).
    if (drawn.length) {
      const uids = drawn.map((c) => c.uid), back = drawn.filter((c) => c.paid).length;
      const deck = eng?.state(DOMAT_KEY);
      if (deck) setDrawn((l) => l.map((c) => (uids.includes(c.uid) ? { ...c, x: deck.x, y: deck.y, held: false } : c)));
      setTimeout(() => setDrawn((l) => l.filter((c) => !uids.includes(c.uid))), deck ? 520 : 0);
      if (back) {
        const now = Date.now(), c = domatStock(stockSaved, now);
        const next = { stock: Math.min(DOMAT_MAX, c.stock + back), since: c.stock + back >= DOMAT_MAX ? now : c.since };
        setStockSaved(next);
        try { localStorage.setItem(domatKey, JSON.stringify(next)); } catch { /* private window */ }
      }
    }
    if (spread) {
      // The laid-out deck goes back into its grid, every card of it, gliding from wherever it was (owner, v0.47.15).
      const from = posesOf(boardRef.current.map((b) => b.uid));
      livePoses.clear();
      setSpread({});
      glide(from);
    } else if (copiesRef.current.length) {
      const gone = new Set(copiesRef.current.map((b) => b.uid));
      // Only those that flew back: one thrown while they were on their way stays.
      flyBack([...gone], () => setCopies(copiesRef.current.filter((b) => !gone.has(b.uid))));
    }
  };
  /** Where each card is drawn now (table px), to glide it from there once it has moved. */
  const posesOf = (uids: string[]) => {
    const at = new Map<string, { x: number; y: number }>();
    for (const u of uids) {
      const el = tableRef.current?.querySelector(`[data-board-card="${CSS.escape(u)}"]`) as HTMLElement | null;
      if (el) at.set(u, { x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2 });
    }
    return at;
  };
  /** Once the cards are drawn where they now belong, slide each one there from where it was (`from`, table px). */
  const glide = (from: Map<string, { x: number; y: number }>, scale = 1) => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      let i = 0;
      for (const [u, p] of from) {
        const el = tableRef.current?.querySelector(`[data-board-card="${CSS.escape(u)}"]`) as HTMLElement | null;
        if (!el) continue;
        const dx = p.x - (el.offsetLeft + el.offsetWidth / 2), dy = p.y - (el.offsetTop + el.offsetHeight / 2);
        if (Math.abs(dx) + Math.abs(dy) < 2 && scale === 1) continue;
        el.animate([{ translate: `${dx.toFixed(1)}px ${dy.toFixed(1)}px`, scale: String(scale) }, { translate: '0px 0px', scale: '1' }], { duration: 560, delay: i++ * 16, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'backwards' });
      }
    }));
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
   * The playground (owner, v0.47.12; calm since v0.47.16): the hand sets every card out on the table as a physical
   * card, in a neat grid, and nothing moves until something hits it. The supply stays (v0.47.22); the control dice are only dice.
   * The Deck of Many Things stays, stock and all. Pressed again, the whole table resets and the cards go home.
   */
  const togglePlayground = () => {
    if (playground) {
      cue('playground:off', 'panelClose');
      // Leaving resets the whole table, not just the cards (owner, v0.47.14).
      resetAll();
      flyBack(pgCards.map((b) => b.uid), () => { setPgCards([]); setPlayground(false); setTimeout(() => diceRef.current?.resetHome(), 80); });
      return;
    }
    cue('playground:on', 'levelUpComplete', { volume: 0.5 });
    clearSelection();
    setSettings(false);
    setPeek(false);
    // Laid out in a grid on the open table, as large as the whole deck allows, each card gliding there from its place
    // in the hand and resting there as a physical card (owner, v0.47.15: not flung about).
    const n = Math.max(1, deck.length);
    const gap = 14;
    // The whole table is free (the hand has let go), less the corner buttons and whatever still stands on it (the
    // control dice, the Deck of Many Things): near the top the grid starts below it, lower down it gives way on its side.
    let L = play.left + 70, R = play.right - 30, Tp = pad + 24;
    const B = tableH - pad - 10;
    const eng = diceRef.current?.engine();
    const standing = (eng?.keys() ?? []).filter((k) => !/^(free|roll|tok|card|fx):/.test(k));
    for (const k of standing) { const st = eng?.state(k); if (st && st.y < Tp + 140) Tp = Math.max(Tp, st.y + 70); }
    for (const k of standing) {
      const st = eng?.state(k);
      if (!st || st.y < Tp || st.y > B + 50 || st.x < L - 60 || st.x > R + 60) continue;
      if (st.x < (L + R) / 2) L = Math.max(L, st.x + 70); else R = Math.min(R, st.x - 70);
    }
    let w = Math.min(maxW(tableH), 128), cols = 1, rows = 1;
    for (; w > MIN_W; w -= 4) {
      cols = Math.max(1, Math.floor((R - L + gap) / (w + gap)));
      rows = Math.ceil(n / cols);
      if (rows * ((w * FORGED_H) / FORGED_W + gap) - gap <= B - Tp) break;
    }
    cols = Math.max(1, Math.floor((R - L + gap) / (w + gap)));
    rows = Math.ceil(n / cols);
    const h = (w * FORGED_H) / FORGED_W;
    // Too many to fit even small: the rows overlap evenly, like a spread hand.
    const stepY = rows > 1 ? Math.min(h + gap, (B - Tp - h) / (rows - 1)) : 0;
    const top = Tp + h / 2 + Math.max(0, (B - Tp - h - stepY * (rows - 1)) / 2);
    const slots = new Map<string, { x: number; y: number }>();
    const cards: BoardCard[] = deck.map((c, i) => {
      const r = Math.floor(i / cols), inRow = r === rows - 1 ? n - r * cols : cols;
      const x = (L + R) / 2 + ((i % cols) - (inRow - 1) / 2) * (w + gap);
      const y = top + r * stepY;
      slots.set(`pg:${c.id}`, { x: hand.left + ((i + 0.5) / n) * (hand.right - hand.left), y: (hand.top + hand.bottom) / 2 });
      return { uid: `pg:${c.id}`, id: c.id, fx: x / tableW, fy: y / tableH, w, rot: 0, phys: true };
    });
    setPgCards(cards);
    setPlayground(true);
    glide(slots, 0.7);
  };
  const looseCount = loose.length + drawn.length + tornNotes + (spread ? 0 : copies.length);
  /** The loose dice and tokens as a preset keeps them (owner, v0.47.16): where each lies now, as shares of the felt. */
  const presetPieces = {
    take: (): SavedPiece[] => {
      const eng = diceRef.current?.engine();
      return looseRef.current.map((l) => {
        const st = eng?.state(eng.keys().find((k) => baseOf(k) === l.key) ?? l.key);
        return { token: l.token as unknown as Record<string, unknown>, fx: (st?.x ?? l.x) / tableW, fy: (st?.y ?? l.y) / tableH };
      });
    },
    put: (pieces: SavedPiece[]) => setLoose(pieces.map((p, i) => ({ key: `free:${newTokenId()}${i}`, token: p.token as unknown as TokenInfo, x: p.fx * tableW, y: p.fy * tableH }))),
  };

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
              onChange={(uid, patch) => setBoard(boardRef.current.map((b) => {
                if (b.uid !== uid) return b;
                const p = livePoses.get(b.uid);
                return { ...b, ...(p ? { rot: Math.round(p.rot * 10) / 10 } : {}), ...patch(b) };
              }))}
              onUnpin={(uid) => pinNote(uid, false)}
              onTap={(uid) => { if (isNoteId(uid)) { cue('ui:open', 'panelOpen', { volume: 0.5 }); setWriting(uid); } }}
              onReturn={(uid) => { if (isNoteId(uid)) return; if (uid.startsWith('pg:')) setPgCards((l) => l.filter((b) => b.uid !== uid)); else if (!spread) setCopies(copiesRef.current.filter((b) => b.uid !== uid)); }}
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
                if (end) { eng.releaseCard(`card:${uid}`); return; }
                // A selected card carries the rest of the selection with it (owner, v0.47.17).
                const key = `card:${uid}`;
                if (selectionRef.current.includes(key)) eng.carryWith(key, selectionRef.current.filter((k) => k !== key));
                eng.holdCard(key, x, y, rot);
              }}
              overTray={spread ? () => false : overHand}
              onMenu={(uid, x, y) => {
                const b = boardRef.current.find((c) => c.uid === uid);
                if (!b) return;
                const p = local(x, y);
                cue('ui:open', 'floatMenuOpen');
                setMenu({ id: b.id, x: p.x, y: p.y, board: uid });
              }}
            />
          </div>
          {shattering.map((s) => <CardBreak key={s.uid} card={s.card} cx={s.cx} cy={s.cy} w={s.w} rot={s.rot} mode={s.mode} dir={s.dir} fxOnly={s.fxOnly} clip={s.clip} onDone={() => setShattering((l) => l.filter((x) => x.uid !== s.uid))} />)}
          {scraps.map((c) => { const card = lookup(c.id); return card ? <CardScrap key={c.uid} uid={c.uid} card={card} poly={c.poly} w={c.w} x={c.x} y={c.y} rot={c.rot} fading={c.fading} onMenu={(cx, cy) => openMenu(cx, cy, scrapMenu(c.uid, c.id))} onDrag={(u, px, py, r, end) => {
            const eng = diceRef.current?.engine();
            if (!eng) return;
            const key = `card:${u}`;
            if (end) { eng.releaseCard(key); return; }
            // A selected scrap carries the rest of the selection, as a selected card does (owner, v0.47.26).
            if (selectionRef.current.includes(key)) eng.carryWith(key, selectionRef.current.filter((k) => k !== key));
            eng.holdCard(key, px, py, r);
          }} /> : null; })}
          {/* Cards in the selection (owner, v0.47.17): ringed in gold, like the dice. */}
          {selection.some((k) => k.startsWith('card:')) ? <style>{selection.filter((k) => k.startsWith('card:')).map((k) => `[data-board-card="${k.slice(5)}"] { outline: 2px solid #E0B563; outline-offset: 3px; } [data-board-card="${k.slice(5)}"] [data-grip] { display: none; }`).join(' ')}</style> : null}
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
          // Only its cards take the pointer: what lies on the felt under the rest of the band (a note, a card) stays in reach.
          <div ref={handRef} data-felt="" style={{ position: 'absolute', left: hand.left, top: hand.top, width: hand.right - hand.left, height: handH, zIndex: 10, pointerEvents: 'none' }}>
            {deck.length === 0 ? (
              <div style={{ position: 'absolute', left: 0, right: 0, top: '45%', textAlign: 'center', color: T.muted, fontFamily: T.medium, fontSize: 14 }}>{dm?.emptyDeck ?? 'Nothing in this deck yet. Add a card from the sheet.'}</div>
            ) : (
              <DeskCarousel key={category} ref={carRef} cards={handCards} look={look} initialIndex={middle} onCentre={onCentre} onCentreClick={onCentreClick} takenId={copy?.card.id} heldId={menu && !menu.board ? menu.id : undefined}
                arranging={arranging?.id}
                onArrange={(to) => {
                  cue('hand:scroll', 'carouselScroll', { volume: 0.5 });
                  setArranging((a) => { if (!a) return a; const order = a.order.filter((x) => x !== a.id); order.splice(to, 0, a.id); return { ...a, order }; });
                }}
                onArrangeEnd={(keep) => {
                  const a = arranging;
                  setArranging(null);
                  if (!a) return;
                  const before = deck.map((c) => c.id);
                  if (keep && a.order.join() !== before.join()) { cue('card:place', 'cardDragEnd'); ctx.onReorderCards?.([a.id], category, a.order); } else cue('ui:close', 'floatMenuClose');
                }} />
            )}
          </div>
        )}

        {/* Cards drawn from the Deck of Many Things, waiting to be used. */}
        {drawn.map((d) => (
          <DomatCardView key={d.uid} card={d.card} x={d.x} y={d.y} from={d.from} held={d.held}
            onMove={(x, y) => setDrawn((l) => l.map((c) => (c.uid === d.uid ? { ...c, x, y } : c)))}
            onPlace={(x, y) => setDrawn((l) => l.map((c) => (c.uid === d.uid ? { ...c, x, y, held: false } : c)))}
            onPlay={(x, y) => playDrawn(d.uid, x, y)}
            onMenu={(cx, cy) => openMenu(cx, cy, drawnMenu(d))} />
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
          onCarouselHit={onCarouselHit}
          onCarouselCrit={onCarouselCrit}
          onBlast={onBlast}
          walls={{ kind: look.walls, rect: { left: 0, top: 0, right: tableW, bottom: tableH }, thickness: pad }}
          places={peeking ? peekPlaces : places}
          decks={tableDecks}
          current={category}
          onPickDeck={pickDeck}
          actions={actions}
          placesScope={dm ? `.${characterId}` : undefined}
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
          onNewCategory={() => { cue('ui:open', 'panelOpen'); onOpen('newCategory'); }}
          catSize={look.catSize}
          numberFinish={look.numberDice}
          tokens={pieces}
          cards={cardPoses}
          onCardsMoved={onCardsMoved}
          supply={supply}
          domat={look.domat && (look.tokenTray || peeking || playground) ? { stock: stockNow.stock, wait: domatWait } : null}
          onDomatDraw={(from, held) => drawCard(from, held ? { held } : undefined)}
          loose={loose}
          onSpawn={(key, token, x, y) => setLoose([...looseRef.current, { key, token, x, y }])}
          onSupplyStep={(key, dir) => {
            if (key === 'src:color') {
              const next = TOKEN_COLORS[(Math.max(0, TOKEN_COLORS.indexOf(supColor)) + dir + TOKEN_COLORS.length) % TOKEN_COLORS.length];
              setSupColor(next);
              if (colorSave.current) clearTimeout(colorSave.current);
              colorSave.current = setTimeout(() => ctx.setTokenColor(next), 600);
              cue('spawner:color', 'tokenCopyColor', { volume: 0.5 });
            } else if (key === 'src:die') {
              setSupplyDie((d) => (dir > 0 ? nextDieType(d) : DIE_TYPES[(DIE_TYPES.indexOf(d) - 1 + DIE_TYPES.length) % DIE_TYPES.length]));
              cue('spawner:die', 'placeToken', { volume: 0.45, cents: 200 });
            } else if (key === 'src:mat') {
              setMaterial((m) => MATERIALS[(MATERIALS.indexOf(m) + dir + MATERIALS.length) % MATERIALS.length]);
              cue('spawner:mat', 'placeToken', { volume: 0.45, cents: 100 });
            }
          }}
          onLooseRest={(key, x, y) => setLoose(looseRef.current.map((t) => (t.key === key ? { ...t, x, y } : t)))}
          onLooseRolled={(key, value, value2) => setLoose(looseRef.current.map((t) => (t.key === key ? { ...t, token: { ...t.token, dieValue: value, dieValue2: value2 ?? t.token.dieValue2 } } : t)))}
          onTokenRolled={(key, value, value2) => { const t = tokenOf(key); if (t) ctx.updateToken(t.ref, t.id, value2 === undefined ? { dieValue: value } : { dieValue: value, dieValue2: value2 }); }}
          onRerolled={reroll}
          onDropPiece={dropToken}
          onPopToken={popToken}
          onTokenClick={rollTok}
          onTokenRemove={breakTok}
          onTokenMenu={(t, x, y) => { const c = cardTok(t); if (!c) return; cue('ui:open', 'floatMenuOpen'); setTokMenu({ ref: c.ref, id: c.id, ...local(x, y) }); }}
          onTableMenu={(x, y, piece) => { const p = local(x, y); cue('ui:open', 'floatMenuOpen'); setTableMenu({ ...p, piece }); }}
          onReady={() => { setEngineReady(true); onReady?.(); }}
          onSelect={setSelection}
          onHardHit={onHardHit}
          onBreak={onBreak}
          onCrit={onCrit}
          onSplash={(at) => {
            addFx({ kind: 'ring', x: at.x, y: at.y, r: 300, ms: 1000, tint: '#5aa8ff' });
            addFx({ kind: 'ring', x: at.x, y: at.y, r: 190, ms: 760, tint: '#bfe6ff' });
            addFx({ kind: 'mist', x: at.x, y: at.y, r: 80, ms: 850, tint: '#9fd4ff' });
          }}
          onPound={(at) => {
            addFx({ kind: 'impact', x: at.x, y: at.y, r: 70, ms: 260, tint: '#ffe45a' });
            addFx({ kind: 'ring', x: at.x, y: at.y, r: 150, ms: 520, tint: '#ffd23a' });
            addFx({ kind: 'spark', x: at.x, y: at.y, r: 90, ms: 500, tint: '#fff3a0' });
            shake(tableRef.current, 0.35);
          }}
          onGood={(at, tint, big) => {
            // A warm bloom: a soft halo opening, a ring going out slowly, light rising off it (owner, v0.47.18).
            // Hopeful, not triumphant (owner, v0.47.18): well under a critical's blast.
            addFx({ kind: 'ring', x: at.x, y: at.y, r: big ? 130 : 100, ms: 1000, tint });
            addFx({ kind: 'spark', x: at.x, y: at.y, r: big ? 85 : 65, ms: 900, tint });
          }}
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
            for (const k of g === 'ctl' ? ctlRef.current : ['src:mat', 'src:color', TOK_CHEST, 'src:die', 'src:domat']) delete apart[k];
            setLook({ ...lookRef.current, apart });
          }}
          hidden={playground ? undefined : look.hidden}
          locked={playground ? undefined : look.locked}
          onLock={(keys) => { const h = lookRef.current.locked; setLook({ ...lookRef.current, locked: keys.every((k) => h.includes(k)) ? h.filter((k) => !keys.includes(k)) : [...new Set([...h, ...keys])] }); }}
          onHide={(keys) => { const h = lookRef.current.hidden; setLook({ ...lookRef.current, hidden: keys.every((k) => h.includes(k)) ? h.filter((k) => !keys.includes(k)) : [...new Set([...h, ...keys])] }); }}
          onMovePiece={(k, x, y) => setLook({ ...lookRef.current, apart: { ...lookRef.current.apart, [k]: [Math.min(1, Math.max(0, x / tableW)), Math.min(1, Math.max(0, y / tableH))] } })}
          inert={overlay || settings || !!writing}
        />
        {dm?.layer?.(tableW, tableH, openMenu)}
        <FxLayer fx={fx} />

        {/* What can be done with the pieces selected. */}
        {selection.length ? (
          <SelectionBar x={(play.left + play.right) / 2} y={openTop + 12} count={new Set(selection.map(baseOf)).size} types={selTypes}
            onRoll={rollSelection}
            mod={selMod}
            onMod={setSelMod}
            resolve={dice.presets.resolve}
            cardVars={dice.presets.cardVars ?? []}
            canSave={presets.some((p) => !p)}
            onSave={(name) => {
              const slot = presets.findIndex((p) => !p);
              if (slot < 0 || !selTypes.length) return;
              // The modifier goes with it as the phone writes one, so the preset is the same on both (v0.47.17).
              const m = selModRef.current;
              const modifier = m && hasModifier(m) ? { value: m.value, variables: modifierVariables(m), ...(modifierFunctionKeys(m).length ? { functionKeys: modifierFunctionKeys(m) } : {}) } : undefined;
              dice.presets.onWrite(slot, { id: `p${Date.now().toString(36)}`, name, dice: selTypes, ...(modifier ? { modifier } : {}) });
              cue('ui:confirm', 'cardSelect', { volume: 0.6 });
            }}
            onPutBack={() => { putBack(selection); clearSelection(); }}
            onReposition={selection.every((k) => k.startsWith('card:') && isNoteId(k.slice(5))) ? () => reposition(selection) : undefined}
            onClear={clearSelection} />
        ) : null}

        {/* Reset, tidy and settings, in the lower left corner: buttons always win over the pieces under them. */}
        <div data-ui="" style={{ position: 'absolute', left: pad + 10, bottom: pad + 10, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 1260 }}>
          {/* The column folds into this little arrow for a bare table, and unfolds again (owner, v0.47.17). */}
          <button type="button" aria-label={tucked ? 'Show the table buttons' : 'Tuck the table buttons away'} title={tucked ? 'Show the table buttons' : 'Tuck the table buttons away'} aria-expanded={!tucked}
            onPointerDown={(e) => e.stopPropagation()} onClick={() => { cue(tucked ? 'ui:open' : 'ui:close', tucked ? 'panelOpen' : 'panelClose', { volume: 0.5 }); setTucked(!tucked); }}
            style={{ all: 'unset', cursor: 'pointer', alignSelf: 'center', opacity: tucked ? 0.9 : 0.6 }}>
            <Chamfer c={5} line={T.goldSoft} fill="rgba(11,14,19,0.9)" style={{ width: 26, height: 16 }} inner={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Glyph d={tucked ? '<path d="M7 14l5-5 5 5"/>' : '<path d="M7 10l5 5 5-5"/>'} size={12} />
            </Chamfer>
          </button>
          {tucked ? null : <>
          {look.controls === 'hidden' && !playground ? <CornerButton glyph="roll" label={peeking ? 'Hide the control dice' : 'Show the control dice'} active={peeking} onPress={() => { cue('ui:toggle', peeking ? 'panelClose' : 'panelOpen'); setPeek((v) => !v); }} /> : null}
          {playground ? null : <CornerButton glyph="reset" label="Reset the table" count={looseCount} onPress={() => { cue('table:reset', 'gearScroll2', { volume: 0.5 }); resetAll(); }} />}
          <CornerButton glyph="play" label={playground ? 'Leave the playground' : 'Playground'} active={playground} onPress={togglePlayground} />
          <CornerButton glyph="note" label="New sticky note (N)" onPress={() => addNote()} />
          {dm ? <CornerButton glyph="counter" label="Counters" onPress={() => { cue('ui:open', 'panelOpen'); dm.counters.open(); }} /> : null}
          {playground ? null : <CornerButton glyph="settings" label="Table settings" active={settings} onPress={() => { cue('ui:toggle', settings ? 'panelClose' : 'panelOpen'); setSettings((s) => !s); }} />}
          {/* Testing only for now (owner, v0.47.11): draw any card of the Deck of Many Things, stock or not. */}
          {/* Testing only: hidden on the live site (owner, v0.47.30). */}
          {playground || !__DEV__ ? null : <CornerButton glyph="roll" label="Testing: draw any Many Things card" active={picking} onPress={() => { cue('ui:toggle', picking ? 'floatMenuClose' : 'floatMenuOpen'); setPicking((v) => !v); }} />}
          </>}
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
          <DomatPicker left={pad + 62} bottom={pad + 10} onClose={() => setPicking(false)} onCrit={() => {
            // Testing (owner, v0.47.27): Hope and Fear thrown and landing on the same number.
            setPicking(false);
            const pairId = poolId(), n = 1 + Math.floor(Math.random() * 12);
            void throwPool([{ id: poolId(), type: 'd12', value: null, side: 'hope', pairId }, { id: poolId(), type: 'd12', value: null, side: 'fear', pairId }], { label: null, value: 0 }, [n, n]);
          }} onPick={(c) => {
            setPicking(false);
            const s = diceRef.current?.engine()?.state(DOMAT_KEY);
            drawCard(s ? { x: s.x, y: s.y } : { x: tableW / 2, y: tableH / 2 }, { pick: c });
          }} />
        ) : null}
        {settings ? (
          <div style={{ position: 'absolute', left: '50%', bottom: pad + 14, transform: 'translateX(-50%)', zIndex: 1255, pointerEvents: 'none', padding: '7px 14px', background: 'rgba(11,14,19,0.92)', border: `1px solid ${T.goldSoft}`, color: T.goldText, fontFamily: T.bold, fontSize: 13, whiteSpace: tableW < 900 ? 'normal' : 'nowrap', width: tableW < 900 ? tableW - 150 : undefined }}>
            Drag a framed row to move it. The arrows beside its name stand it on end; the link splits it into pieces you place one by one; the eye hides it until you edit again.
          </div>
        ) : null}
        {settings && !spread ? (
          <HandGrip hand={hand} onMove={(cy) => setLook({ ...lookRef.current, areaY: Math.min(1, Math.max(0, cy / tableH)) })} />
        ) : null}


        {/* The copy in your hand. */}
        {copy ? <CarriedCard key={copy.card.id} copy={copy} tableRef={tableRef} /> : null}

        {sorting ? (
          <DesktopPortal to="side" priority="dialog" onDismiss={() => setSorting(false)}>
            <SortPanel file={sortFile} ids={deck.map((c) => c.id)} onApply={(ordered, moved) => { cue('card:place', 'cardDragEnd'); ctx.onReorderCards?.(moved, category, ordered); }} onClose={() => setSorting(false)} />
          </DesktopPortal>
        ) : null}
        {overlay ? <div style={{ position: 'absolute', inset: 0, zIndex: 800, background: 'rgba(6,8,13,0.45)' }} /> : null}
        {tableMenu && !overlay ? (
          <ContextMenu key={`${tableMenu.x},${tableMenu.y}`} x={tableMenu.x} y={tableMenu.y} tableW={tableW} tableH={tableH} onClose={() => setTableMenu(null)}
            menu={tableMenu.given ?? (tableMenu.piece ? pieceSpec(tableMenu.piece, { x: tableMenu.x, y: tableMenu.y }) : feltMenu({ x: tableMenu.x, y: tableMenu.y }))} />
        ) : null}
        {tokMenu && !overlay ? (() => {
          const tok = (ctx.cardTokens[tokMenu.ref] ?? []).find((x) => x.id === tokMenu.id);
          if (!tok) return null;
          const r = tableRef.current?.getBoundingClientRect();
          const at = { x: (r?.left ?? 0) + tokMenu.x, y: (r?.top ?? 0) + tokMenu.y };
          const t = { ref: tokMenu.ref, id: tokMenu.id };
          const close = () => setTokMenu(null);
          if (tokMenu.mods && tok.kind === 'die') {
            const m = tok.mod && hasModifier(tok.mod) ? tok.mod : null;
            const W = 600, left = Math.max(8, Math.min(tokMenu.x, tableW - W - 16)), top = Math.max(8, Math.min(tokMenu.y, tableH - 470));
            return (
              <>
                <div data-ui="" aria-label="Close the modifiers" onPointerDown={(e) => { e.stopPropagation(); cue('ui:close', 'panelClose', { volume: 0.5 }); close(); }} onContextMenu={(e) => { e.preventDefault(); close(); }} style={{ position: 'absolute', inset: 0, zIndex: 1290 }} />
                <div data-ui="" role="dialog" aria-label="This die's modifiers" onPointerDown={(e) => e.stopPropagation()} style={{ position: 'absolute', zIndex: 1291, left, top, width: W }}>
                  <ModifierPanel mod={m} onMod={(next) => ctx.updateToken(t.ref, t.id, { mod: next ?? undefined })} total={m ? dice.presets.resolve?.(m) ?? m.value : 0} resolve={dice.presets.resolve} cardVars={dice.presets.cardVars ?? []} />
                </div>
              </>
            );
          }
          const die = tok.kind === 'die', type = tok.dieType ?? 'd6';
          const name = tok.kind === 'die' ? (type === 'duality' ? 'Hope and Fear' : type) : `${tok.kind === 'color' ? 'Colour' : TOKEN_LABEL[tok.kind]} token`;
          return (
            <ContextMenu key={`${t.id},${tokMenu.x},${tokMenu.y}`} x={tokMenu.x} y={tokMenu.y} tableW={tableW} tableH={tableH} onClose={close} menu={{
              title: name, detail: 'On a card', icon: die ? DIE_ICON[type] : MENU_ICON.token,
              rows: [
                ...(die ? [
                  { label: type === 'duality' ? 'Roll these dice' : `Roll this ${type}`, icon: DIE_ICON[type], onPress: () => rollTok(t, at.x, at.y) },
                  { label: 'Modifiers', icon: MENU_ICON.modifiers, value: tok.mod && hasModifier(tok.mod) ? signed(dice.presets.resolve?.(tok.mod) ?? tok.mod.value) : undefined, onPress: () => { cue('ui:open', 'panelOpen', { volume: 0.5 }); setTimeout(() => setTokMenu({ ...tokMenu, mods: true })); } },
                ] : []),
                { label: 'Take it off the card', icon: MENU_ICON.lift, gap: die, onPress: () => {
                  const info = popToken(t.ref, t.id);
                  if (!info) return;
                  setLoose([...looseRef.current, { key: `free:${newTokenId()}`, token: info, x: tokMenu.x, y: tokMenu.y }]);
                  cue('piece:offCard', 'cardDragEnd', { volume: 0.5 });
                } },
                { label: 'Break it', icon: MENU_ICON.breakIt, danger: true, onPress: () => breakTok(t, at.x, at.y) },
              ],
            }} />
          );
        })() : null}
        {viewing ? <CardViewer key={viewing.id} card={lookup(viewing.id)} live={allById.get(viewing.id)?.interactive ? allById.get(viewing.id)?.live : undefined} from={viewing.from} closing={viewing.closing} onClose={closeView} onGone={() => setViewing(null)} /> : null}
        {writing && noteList.some((n) => n.id === writing) ? (
          <NoteEditor key={writing} note={noteList.find((n) => n.id === writing)!}
            onEdit={(patch) => { if (patch.phys === false) livePoses.delete(writing); setNotes(editNote(noteNow.current, writing, patch)); }}
            onClose={() => { cue('ui:close', 'panelClose', { volume: 0.5 }); setWriting(null); }} />
        ) : null}
        {menu && !overlay && isNoteId(menu.id) ? (() => {
          const note = noteList.find((n) => n.id === menu.id);
          if (!note) return null;
          const words = note.text.trim().replace(/\s+/g, ' ');
          return (
            <ContextMenu key={`${note.id},${menu.x},${menu.y}`} x={menu.x} y={menu.y} tableW={tableW} tableH={tableH} onClose={() => setMenu(null)} menu={{
              title: 'Sticky note', icon: MENU_ICON.note, detail: note.phys ? undefined : 'Pinned',
              rows: [
                { label: 'Edit note', icon: MENU_ICON.edit, onPress: () => setWriting(note.id) },
                { label: note.phys ? 'Pin' : 'Unpin', icon: note.phys ? MENU_ICON.pin : MENU_ICON.unpin, value: note.phys ? "Can't tear" : undefined, onPress: () => pinNote(note.id, note.phys) },
                { label: 'Normal size', icon: MENU_ICON.size, hidden: note.w === NOTE_W, onPress: () => setNotes(editNote(noteNow.current, note.id, { w: NOTE_W })) },
                { label: 'Delete note', icon: MENU_ICON.bin, danger: true, gap: true, onPress: () => deleteNote(note.id), confirm: {
                  title: 'Delete this note?', verb: 'Delete note',
                  body: words ? `"${words.length > 70 ? `${words.slice(0, 70)}...` : words}" is gone for good.` : "It's blank.",
                } },
              ],
            }} />
          );
        })() : null}
        {menu && !overlay && !isNoteId(menu.id) ? (
          <CardMenu key={`${menu.id},${menu.x},${menu.y}`} id={menu.id} x={menu.x} y={menu.y} tableW={tableW} tableH={tableH} onClose={() => setMenu(null)}
            spread={spread}
            file={sortFile}
            editCard={editCard}
            view={() => {
              cue('ui:open', 'cardFullscreenEnter', { volume: 0.6 });
              // Where the card is drawn now: on the table, or in the hand.
              const el = (menu.board ? tableRef.current?.querySelector(`[data-board-card="${CSS.escape(menu.board)}"]`) : handRef.current?.querySelector(`[data-card-id="${CSS.escape(menu.id)}"]`)) as HTMLElement | null;
              const face = (menu.board ? el : el?.firstElementChild as HTMLElement | null) ?? el;
              const r = face?.getBoundingClientRect();
              setViewing({ id: menu.id, from: r && r.width > 0 ? { left: r.left, top: r.top, width: r.width, height: r.height } : undefined });
            }}
            physical={menu.board ? !!board.find((b) => b.uid === menu.board)?.phys : undefined}
            onPhysical={menu.board ? () => {
              const uid = menu.board!;
              // Back to an ordinary card: stood upright where it lies, so it reads (owner, v0.47.5).
              const p = livePoses.get(uid);
              livePoses.delete(uid);
              setBoard(boardRef.current.map((b) => (b.uid !== uid ? b : b.phys ? { ...b, phys: false, rot: 0, ...(p ? { fx: p.x / tableW, fy: p.y / tableH } : {}) } : { ...b, phys: true })));
              cue('card:physical', 'cardSelect', { volume: 0.6 });
            } : undefined}
            board={menu.board && !spread ? () => { const u = menu.board!; if (u.startsWith('pg:')) setPgCards((l) => l.filter((b) => b.uid !== u)); else setCopies(copiesRef.current.filter((b) => b.uid !== u)); } : undefined}
            place={menu.board || spread ? undefined : () => {
              const el = handRef.current?.querySelector(`[data-card-id="${CSS.escape(menu.id)}"]`) as HTMLElement | null;
              const r = tableRef.current?.getBoundingClientRect();
              const card = lookup(menu.id);
              if (el && r && card) takeCopy(card, el.getBoundingClientRect(), { x: r.left + menu.x, y: r.top + menu.y });
            }}
            throwIt={menu.board || spread ? undefined : () => throwCopy(menu.id)}
            arrange={menu.board || !canReorder ? undefined : () => { cue('card:lift', 'cardDragStart', { volume: 0.6 }); setArranging({ id: menu.id, order: deck.map((c) => c.id) }); }} />
        ) : null}
      </div>
      {result ? <RollPopup key={result.dice.map((d) => d.id).join()} result={result} top={plaqueTop} minWidth={barOn ? barBox.w : undefined} box={{ left: winW - tableW, top: 0, width: tableW, height: tableH }} onAccept={() => { cue('ui:tap', 'buttonTap'); setResult(null); }} /> : null}
      {settings ? <LookPanel look={look} onChange={setLook} onClose={() => { cue('ui:close', 'panelClose'); setSettings(false); }} onClearTable={clearAll} boardCount={spread ? 0 : copies.length} pieceCount={looseCount} box={desktop?.screen ?? port} pieces={presetPieces} /> : null}
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
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); cue('ui:dragEnd', 'cardDragEnd', { volume: 0.5 }); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    cue('ui:dragStart', 'cardDragStart', { volume: 0.5 });
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
function CornerButton({ glyph, label, onPress, active, disabled, count }: { glyph: 'settings' | 'reset' | 'tidy' | 'roll' | 'play' | 'note' | 'counter'; label: string; onPress: () => void; active?: boolean; disabled?: boolean; count?: number }) {
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
function SelectionBar({ x, y, count, types, onRoll, canSave, onSave, onPutBack, onReposition, onClear, mod, onMod, resolve, cardVars }: { x: number; y: number; count: number; types: DieType[]; onRoll: (power: number, burning: boolean) => void; canSave: boolean; onSave: (name: string) => void; onPutBack: () => void; /** Only sticky notes are selected: they are moved, not rolled. */ onReposition?: () => void; onClear: () => void; mod: PresetModifier | null; onMod: (m: PresetModifier | null) => void; resolve?: (m?: PresetModifier) => number; cardVars: FunctionVar[] }) {
  const [modsOpen, setModsOpen] = useState(false);
  const total = mod && hasModifier(mod) ? resolve?.(mod) ?? mod.value : 0;
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
        ) : onReposition ? (
          <>
            <TButton label="Reposition" h={32} title="Bring the notes back out onto the open table" onPress={onReposition} />
            <TButton label="Put back" h={32} title="Delete the selected notes" onPress={onPutBack} />
          </>
        ) : (
          <>
            <ChargeRoll disabled={!types.length} onRoll={onRoll} />
            <TButton label="Save as preset" h={32} disabled={!types.length || !canSave} title={canSave ? 'Keep these dice as a preset in the table menu' : 'Every preset slot is full: delete one from the table menu'} onPress={() => setNaming(true)} />
            <TButton label={total ? `Modifiers ${total > 0 ? '+' : ''}${total}` : 'Modifiers'} h={32} active={modsOpen} title="What is added to this roll: a number, your sheet, your cards" onPress={() => { cue(modsOpen ? 'ui:close' : 'ui:open', modsOpen ? 'panelClose' : 'panelOpen', { volume: 0.5 }); setModsOpen((o) => !o); }} />
            <TButton label="Put back" h={32} onPress={onPutBack} />
          </>
        )}
        <TButton title="Clear the selection" h={32} onPress={onClear} icon={<Glyph d={DIE_GLYPHS.close} size={14} />} />
      </Chamfer>
      {modsOpen && !naming ? <ModifierPanel mod={mod} onMod={onMod} total={total} resolve={resolve} cardVars={cardVars} /> : null}
    </div>
  );
}

/** A modifier's name on a result: its parts, the first two and how many more. */
function modName(m: PresetModifier, cardVars: FunctionVar[]): string | null {
  const names = [...modifierVariables(m).map((v) => PRESET_VARS.find((p) => p.key === v)?.label ?? ''), ...modifierFunctionKeys(m).map((k) => cardVars.find((c) => c.key === k)?.title ?? '')].filter(Boolean);
  if (!names.length) return null;
  return names.length > 2 ? `${names.slice(0, 2).join(', ')} and ${names.length - 2} more` : names.join(', ');
}

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/** The sheet's variables in the Modifiers panel, by kind (owner, v0.47.18): traits first, then the rest. */
const SHEET_GROUPS: { name: string; keys: string[] }[] = [
  { name: 'Traits', keys: ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'] },
  { name: 'Rolls', keys: ['attackRoll', 'damageRoll', 'spellcastRoll', 'spellcast'] },
  { name: 'Character', keys: ['proficiency', 'level', 'tier'] },
  { name: 'Vitals', keys: ['currentHp', 'missingHp', 'currentHope', 'missingHope', 'currentArmor', 'missingArmor', 'stress'] },
];

/**
 * The Modifiers panel (owner, v0.47.17), under the selection bar: what is added to this roll, built the way a phone
 * preset's modifier is (a flat number from -20 to 20, sheet variables, numbers kept on the character's cards), so a
 * preset saved from here reads the same on the phone. The total on the right is what it comes to right now.
 */
function ModifierPanel({ mod, onMod, total, resolve, cardVars }: { mod: PresetModifier | null; onMod: (m: PresetModifier | null) => void; total: number; resolve?: (m?: PresetModifier) => number; cardVars: FunctionVar[] }) {
  const m: PresetModifier = mod ?? { value: 0, variables: [] };
  const vars = modifierVariables(m);
  const keys = modifierFunctionKeys(m);
  // What each variable comes to alone, for the chips; worked out once while the panel is open.
  const worth = useMemo(() => new Map(PRESET_VARS.map((v) => [v.key, resolve ? resolve({ value: 0, variables: [v.key] }) : 0])), [resolve]);
  const set = (next: PresetModifier) => onMod(hasModifier(next) ? next : null);
  const step = (d: number) => { cue('ui:tap', 'buttonTap', { volume: 0.4 }); set({ ...m, variables: vars, value: Math.max(-20, Math.min(20, m.value + d)) }); };
  const label = (t: string) => <div style={{ color: T.goldText, fontFamily: T.bold, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase' }}>{t}</div>;
  return (
    <div style={{ marginTop: 6 }}>
      <Chamfer c={10} fill="rgba(11,14,19,0.97)" line={T.goldSoft} inner={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12, width: '100%', minWidth: 560, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {label('Flat bonus')}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <TButton title="One less" h={32} disabled={m.value <= -20} onPress={() => step(-1)} icon={<Glyph d='<path d="M6 12h12"/>' size={14} />} />
              <span aria-live="polite" style={{ minWidth: 44, textAlign: 'center', color: m.value ? T.ivory : T.muted, fontFamily: T.display, fontSize: 20, fontVariantNumeric: 'tabular-nums' }}>{signed(m.value)}</span>
              <TButton title="One more" h={32} disabled={m.value >= 20} onPress={() => step(1)} icon={<Glyph d='<path d="M6 12h12M12 6v12"/>' size={14} />} />
            </div>
          </div>
          <div style={{ flex: 1 }} />
          {mod ? <TButton label="Clear" h={30} title="Nothing added to the roll" onPress={() => { cue('ui:delete', 'tokenRemove', { volume: 0.5 }); onMod(null); }} /> : null}
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: total ? T.ivory : T.muted, fontFamily: T.display, fontSize: 34, lineHeight: '36px', fontVariantNumeric: 'tabular-nums' }}>{signed(total)}</div>
            <div style={{ color: T.muted, fontFamily: T.medium, fontSize: 12 }}>added to the roll</div>
          </div>
        </div>
        <div style={{ height: 1, background: 'rgba(218,162,73,0.22)' }} />
        <div className="rk-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 320, overflowY: 'auto', paddingRight: 4 }}>
          {/* The DM has no sheet to add from: the flat bonus is theirs. */}
          {resolve ? label('From your sheet') : null}
          {!resolve ? null : [...SHEET_GROUPS, { name: 'Other', keys: PRESET_VARS.map((v) => v.key).filter((k) => !SHEET_GROUPS.some((g) => g.keys.includes(k))) }].filter((g) => g.keys.length).map((g) => (
            <div key={g.name} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ color: T.muted, fontFamily: T.bold, fontSize: 12 }}>{g.name}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 5 }}>
                {g.keys.map((k) => PRESET_VARS.find((v) => v.key === k)).filter((v): v is (typeof PRESET_VARS)[number] => !!v).map((v) => (
                  <ModChip key={v.key} name={v.label} value={worth.get(v.key) ?? 0} on={vars.includes(v.key)}
                    onPress={() => { cue('ui:toggle', 'cardSelect', { volume: 0.4 }); set(vars.includes(v.key) ? removeVariable(m, v.key) : addVariable(m, v.key)); }} />
                ))}
              </div>
            </div>
          ))}
          <div style={{ height: 2 }} />
          {cardVars.length ? (
            <>
              {label('From your cards')}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 5 }}>
                {cardVars.map((c) => (
                  <ModChip key={c.key} name={c.title} sub={c.cardTitle} value={c.value} on={keys.includes(c.key)}
                    onPress={() => { cue('ui:toggle', 'cardSelect', { volume: 0.4 }); set(keys.includes(c.key) ? removeFunctionKey(m, c.key) : addFunctionKey(m, c.key)); }} />
                ))}
              </div>
            </>
          ) : null}
        </div>
      </Chamfer>
    </div>
  );
}

/** One thing a modifier can add: its name and what it comes to now; red when it is in. */
function ModChip({ name, sub, value, on, onPress }: { name: string; sub?: string; value: number; on: boolean; onPress: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button type="button" aria-pressed={on} title={sub ? `${name} on ${sub}` : name} onClick={onPress} onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)} style={{ all: 'unset', cursor: 'pointer', display: 'block', minWidth: 0 }}>
      <Chamfer c={5} line={on ? T.red : hover ? T.goldBright : 'rgba(218,162,73,0.3)'} fill={on ? 'rgba(200,27,24,0.32)' : hover ? T.panelLit : T.panel} style={{ height: sub ? 40 : 30 }}
        inner={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 9px', boxSizing: 'border-box' }}>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <span style={{ color: on || hover ? T.ivory : T.goldText, fontFamily: T.bold, fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
          {sub ? <span style={{ color: T.muted, fontFamily: T.medium, fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span> : null}
        </span>
        <span style={{ color: on ? T.ivory : T.muted, fontFamily: T.bold, fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>{signed(value)}</span>
      </Chamfer>
    </button>
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
      // It shakes, and its flames shake with it (owner, v0.47.18: the button stays one size; no bar).
      const j = Math.min(1, s.power) * 2.4 + (s.lit ? 1.4 : 0);
      const tf = j > 0 ? `translate(${((Math.random() - 0.5) * j).toFixed(2)}px, ${((Math.random() - 0.5) * j).toFixed(2)}px)` : '';
      if (wrap.current) wrap.current.style.transform = tf;
      host.style.transform = tf;
      s.flames?.level(s.power < 0.5 ? 0 : (s.power - 0.5) / 1.5);
      const next = s.lit ? 3 : s.power >= 1 ? 2 : s.power > 0 ? 1 : 0;
      if (next !== s.stage) { s.stage = next; setStage(next as 0 | 1 | 2 | 3); }
      if (!s.lit && s.power >= 2) {
        s.lit = true;
        cue('charge:lit', 'gainGoldenHp', { volume: 0.6, cents: 900 });
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
    <div ref={wrap} onPointerDown={down} onPointerUp={up} onPointerCancel={() => { end(); }} title="Roll. Hold to roll harder; hold on and it catches fire" style={{ position: 'relative', width: 112, display: 'flex' }}>
      <TButton label={['Roll', 'Charging', 'Hotter', 'Ablaze'][stage]} primary h={32} wide still disabled={disabled} onPress={() => { if (rolledByPointer.current) { rolledByPointer.current = false; return; } onRoll(0, false); }} />
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
function DomatPicker({ left, bottom, onPick, onCrit, onClose }: { left: number; bottom: number; onPick: (c: DomatCard) => void; onCrit: () => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.focus(); }, []);
  return (
    <>
      <div data-ui="" onPointerDown={(e) => { e.stopPropagation(); onClose(); }} style={{ position: 'absolute', inset: 0, zIndex: 1261 }} />
      <div data-ui="" ref={box} role="listbox" aria-label="Deck of Many Things cards" tabIndex={-1} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
        style={{ position: 'absolute', left, bottom, zIndex: 1262, width: 290, maxHeight: 420, overflowY: 'auto', outline: 'none', background: 'rgba(11,14,19,0.98)', border: `1px solid ${T.goldSoft}` }} className="rk-scroll">
        <div style={{ padding: '9px 12px 6px', color: T.muted, fontFamily: T.medium, fontSize: 12.5 }}>Testing: draws the card, stock or not.</div>
        <div role="option" aria-selected={false} onClick={onCrit}
          onPointerEnter={(e) => { e.currentTarget.style.background = T.panelLit; }} onPointerLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          style={{ cursor: 'pointer', padding: '7px 12px', display: 'flex', gap: 9, alignItems: 'baseline', borderLeft: '3px solid #E0A830' }}>
          <span style={{ color: T.ivory, fontFamily: T.bold, fontSize: 13.5, whiteSpace: 'nowrap' }}>Roll a crit</span>
          <span style={{ color: T.muted, fontFamily: T.medium, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Hope and Fear land on the same number.</span>
        </div>
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

/**
 * A card read large (owner, v0.47.17): over the whole window, with room round it, at full quality, the rest dimmed
 * behind. A click anywhere or Escape puts it away.
 */
function CardViewer({ card, live, from, closing, onClose, onGone }: { card: TableCard | undefined; /** A card with controls on it (a counter), drawn live so they can be used here (Koy, Nov 2026: nowhere on the desk could they be). */ live?: React.ReactNode; /** Where the card was on screen: it grows out of there and goes back to it. */ from?: { left: number; top: number; width: number; height: number }; closing?: boolean; onClose: () => void; onGone: () => void }) {
  const [win, setWin] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const veil = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [face, setFace] = useState(0);
  const pages = live ? 0 : card?.faces?.length ?? 0;
  const closingRef = useRef(closing);
  closingRef.current = closing;
  useEffect(() => {
    const on = () => setWin({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  /** From the card's own place to the middle (and back): the transform that puts the large card where the small one is. */
  const back = () => {
    const el = box.current;
    if (!el || !from) return { transform: 'scale(0.6)', opacity: 0 };
    const r = el.getBoundingClientRect();
    const dx = from.left + from.width / 2 - (r.left + r.width / 2), dy = from.top + from.height / 2 - (r.top + r.height / 2);
    return { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${(from.width / r.width).toFixed(4)})`, opacity: 1 };
  };
  // In (owner, v0.47.18: it popped in, and the whole screen flickered as the veil faded out again at its end): the
  // veil fades up and stays; the card grows out of where it was.
  useLayoutEffect(() => {
    veil.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: 'ease-out', fill: 'both' });
    const grow = box.current?.animate([back(), { transform: 'none', opacity: 1 }], { duration: 360, easing: 'cubic-bezier(0.16,1,0.3,1)', fill: 'both' });
    // Grown, it is let go of (owner, v0.50.6: pages read blurry now and then): a layer kept for a transform keeps the
    // resolution it was first drawn at, which can be the small card it grew from. Released, it is drawn at full size.
    if (grow) grow.onfinish = () => { if (closingRef.current) return; grow.cancel(); if (box.current) box.current.style.willChange = 'auto'; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Out: the card goes back to its place and the veil lifts, then it is gone.
  useEffect(() => {
    if (!closing) return;
    if (box.current) box.current.style.willChange = 'transform';
    veil.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-in', fill: 'forwards' });
    const a = box.current?.animate([{ transform: 'none', opacity: 1 }, back()], { duration: 240, easing: 'cubic-bezier(0.5,0,0.75,0)', fill: 'forwards' });
    const t = setTimeout(onGone, 250);
    if (a) a.onfinish = () => { clearTimeout(t); onGone(); };
    return () => clearTimeout(t);
  }, [closing]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!card || typeof document === 'undefined') return null;
  const k = Math.min((win.h - 64) / FORGED_H, (win.w - 64) / FORGED_W);
  return createPortal(
    <div data-ui="" role="dialog" aria-label="The card, read large" onPointerDown={(e) => { e.stopPropagation(); onClose(); }} onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out', pointerEvents: closing ? 'none' : 'auto' }}>
      <div ref={veil} style={{ position: 'absolute', inset: 0, background: 'rgba(6,8,13,0.78)', opacity: 0 }} />
      <div ref={box} onPointerDown={live ? (e) => e.stopPropagation() : pages > 1 ? (e) => { e.stopPropagation(); cue('card:turn', 'gearScroll2', { volume: 0.5 }); setFace((f) => (f + 1) % pages); } : undefined} style={{ width: FORGED_W * k, height: FORGED_H * k, position: 'relative', boxShadow: '0 30px 80px rgba(0,0,0,0.7)', willChange: 'transform', cursor: live ? 'default' : pages > 1 ? 'pointer' : undefined }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: FORGED_W, height: FORGED_H, transform: `scale(${k})`, transformOrigin: '0 0' }}>
          {live ? <View style={{ width: FORGED_W, height: FORGED_H }}>{live}</View> : <CardFace card={card} hiRes face={face} />}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * A card's menu: the phone's hold wheel and the row of buttons under a focused card, each running the same handler.
 * A card on the felt is a copy of one, so it has all but what files or deletes the original; in the laid-out hand a
 * card is the card itself and has everything.
 */
function CardMenu({ id, x, y, tableW, tableH, onClose, board, place, throwIt, arrange, spread, physical, onPhysical, view, editCard, file }: { id: string; x: number; y: number; tableW: number; tableH: number; onClose: () => void; board?: () => void; place?: () => void; throwIt?: () => void; /** Pick it up and move it along the hand (owner, v0.50.4). */ arrange?: () => void; /** Read it large, the table dimmed behind it (v0.47.17). */ view?: () => void; spread: boolean; physical?: boolean; onPhysical?: () => void; editCard?: CardEditing; file?: CharacterFile }) {
  const ctx = useTableHost();
  const item = Object.values(ctx.decks).flat().find((c) => c?.id === id);
  if (!item) return null;
  const ref = item.ref ?? item.id;
  const states = ctx.cardStates, on = ctx.enabledIds.has(ref), always = states.permanent.has(ref), live = !states.modsOff.has(ref);
  const fav = ctx.isFavorited(id);
  const mirror = ctx.category === FAVORITES_CATEGORY;
  const dmRows = ctx.dm?.cardRows(id) ?? [];

  // Across the top: what is done with the card as an object.
  const top: TableRow[] = [
    ...(place ? [{ label: 'Place a copy', short: 'Place copy', icon: MENU_ICON.layCopy, quick: true, onPress: place }] : []),
    ...(throwIt ? [{ label: 'Throw a copy', short: 'Throw', icon: MENU_ICON.throwCopy, quick: true, onPress: throwIt }] : []),
    ...(arrange ? [{ label: 'Re-arrange', icon: MENU_ICON.sort, quick: true, onPress: arrange }] : []),
    ...(onPhysical && (board || spread) ? [physical
      ? { label: 'Stop its physics', short: 'Stop physics', icon: MENU_ICON.still, quick: true, onPress: onPhysical }
      : { label: 'Make it physical', short: 'Make physical', icon: MENU_ICON.physics, quick: true, onPress: onPhysical }] : []),
    ...(board ? [{ label: 'Take off the table', short: 'Take off', icon: MENU_ICON.offTable, quick: true, onPress: board }] : []),
    // A row of its own under the buttons (owner, v0.50.6: four across cut Re-arrange short).
    ...(view ? [{ label: 'View', icon: MENU_ICON.view, onPress: view }] : []),
  ];

  let head: Omit<MenuSpec, 'rows'>, rows: TableRow[];
  if (ctx.dm) {
    head = ctx.dm.cardHead(id);
    const keep: TableRow[] = board ? [] : [
      { label: on ? 'Unmark' : 'Mark', icon: on ? MENU_ICON.unmark : MENU_ICON.mark, gap: true, onPress: () => ctx.toggleCard(id) },
      { label: fav ? 'Remove from Favorites' : 'Add to Favorites', icon: fav ? MENU_ICON.unfavorite : MENU_ICON.favorite, onPress: () => ctx.cardAction(fav ? 'unfavorite' : 'favorite', [id]) },
      { label: 'Move card to deck', icon: MENU_ICON.moveDeck, hidden: mirror, onPress: () => ctx.cardAction('move', [id]) },
    ];
    // What changes in a fight leads, whichever card it is.
    rows = [
      ...dmRows.filter((r) => r.quick),
      ...top,
      ...dmRows.filter((r) => !r.quick && !r.danger),
      ...keep,
      ...(board ? [] : dmRows.filter((r) => r.danger).map((r, i) => ({ ...r, gap: i === 0 }))),
    ];
  } else {
    const named = sourceLabelForCardId(id, file);
    head = { title: named === id || named === ref ? 'Card' : named, icon: MENU_ICON.cards, detail: always ? 'Always on' : on ? 'Equipped' : undefined };
    rows = [
      ...top,
      { label: 'Modifiers', icon: MENU_ICON.modifiers, gap: true, onPress: () => ctx.showCardInfo?.(id) },
      { label: live ? 'Switch modifiers off' : 'Switch modifiers on', icon: live ? MENU_ICON.switchOff : MENU_ICON.switchOn, hidden: !states.toggleable.has(ref) || !(on || always), onPress: () => ctx.toggleCardModifiers?.(id) },
      { label: 'Set its number', icon: MENU_ICON.number, value: file && states.numberInput.has(ref) ? String(numberInputFor(file, id)) : undefined, hidden: !states.numberInput.has(ref), onPress: () => ctx.editNumberInput?.(id) },
      { label: 'Edit card', icon: MENU_ICON.edit, hidden: !editCard?.can(id), onPress: () => editCard?.open(id) },
      { label: on ? 'Unequip' : 'Equip', icon: on ? MENU_ICON.unequip : MENU_ICON.equip, gap: true, hidden: always, onPress: () => ctx.toggleCard(id) },
      ...(board ? [] : mirror ? [
        { label: 'Remove from Favorites', icon: MENU_ICON.unfavorite, gap: always, onPress: () => ctx.cardAction('unfavorite', [id]) },
      ] : [
        { label: fav ? 'Remove from Favorites' : 'Add to Favorites', icon: fav ? MENU_ICON.unfavorite : MENU_ICON.favorite, gap: always, onPress: () => ctx.cardAction('favorite', [id]) },
        { label: 'Move to deck', icon: MENU_ICON.moveDeck, onPress: () => ctx.cardAction('move', [id]) },
        { label: ctx.nfcAvailable ? 'Share' : 'Export', icon: ctx.nfcAvailable ? MENU_ICON.share : MENU_ICON.export, onPress: () => ctx.cardAction('nfc', [id]) },
        { label: 'Delete card', icon: MENU_ICON.bin, danger: true, gap: true, onPress: () => ctx.cardAction('delete', [id]) },
      ]),
    ];
  }
  return <ContextMenu x={x} y={y} tableW={tableW} tableH={tableH} onClose={onClose} menu={{ ...head, rows }} />;
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

