/**
 * The desktop play table (v0.47.0; v0.47.1 owner round two): everything right of the sheet is one table seen from
 * above. The hand lies along it (bottom, middle or top; in an area of its own, or on the open table with everything
 * else), the cards you take out lie where you put them, and the dice and tokens move over all of it.
 *
 * Each part owns its own input and nothing else: the hand answers only inside its area, a die only where it lies,
 * a laid card only under itself. A right click on a die rolls it where it lies; on the table it opens a menu with
 * every control. Table settings (the cog, lower left) lies over the sheet while it is open.
 *
 * Reads and writes the same carousel context the phone's hand does, so equipping, decks, favourites, tokens, moving
 * and deleting all go through the code paths they always have.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { DesktopPortal } from '@/components/desktop-portal';
import { useDesktop } from '@/hooks/use-desktop';
import { catalogIdOf } from '@/features/cards/card-effects';
import { FORGED_H, FORGED_W } from '@/features/create/components/forged-card';
import type { CharacterFile } from '@/lib/character-file';
import { dualityVerdict, poolTotal } from '@/lib/dice-pool';
import { FAVORITES_CATEGORY } from '@/lib/favorites';
import { playSfx } from '@/lib/sfx';
import type { CardCategory, CardItem } from '../card-data';
import { useCarousel } from '../carousel-context';
import { BakedTokenLayer, type PlacedToken } from '../components/card-tokens';
import { kindScale, nextDieType, TOKEN_COLORS, tokenFill } from '../components/card-tokens-data';
import { type CornerTone, EnabledCorner } from '../components/enabled-corner';
import { TraitCrossOut } from '../components/trait-cross-out';
import type { DiceTrayHandle } from '../sheet/dice-tray';
import type { DicePresetSlots } from '../sheet/dice-preset-slots';
import { SortPanel } from '../sheet/sort-panel';
import { BoardCards, maxW, MIN_W } from './board-cards';
import type { DeckLook } from './deck-look';
import { CardFace, DeskCarousel, type DeskCarouselHandle, type TableCard } from './desk-carousel';
import type { Bounds } from './dice-physics';
import { LookPanel } from './look-panel';
import { RollDock, RollPopup, type RollResult } from './roll-dock';
import { type LoosePiece, type SupplyPiece, type TableAction, TableDice, type TableDiceHandle, type TableDeck, type TokenInfo, type TokenPiece } from './table-dice';
import { type BoardCard, loadBoard, loadLook, saveBoard, saveLook } from './table-store';
import { Chamfer, DIE_GLYPHS, Glyph, T } from './table-ui';

/** The dice bar's state and the sheet's handle to it (the traits roll through it). */
export type DeskDice = { up: boolean; onToggle: () => void; handleRef: { current: DiceTrayHandle | null }; presets: Omit<Parameters<typeof DicePresetSlots>[0], 'belt'> };
export type TablePanel = 'modifiers' | 'cards';

const NO_CARDS: CardItem[] = [];
/** A held arrow steps a card every HOLD_STEP_MS, its pitch climbing then falling back (owner, v0.46.0). */
const HOLD_STEP_MS = 160;
const HOLD_CENTS = 100;
const HOLD_PEAK = 8;
const HAND_W = 170;
/** How far in from the table's edge each kind of wall stops the dice. */
const WALL: Record<DeckLook['walls'], number> = { none: 4, line: 8, stone: 20, brass: 10 };

function cornerTone(ref: string, states: { permanent: Set<string>; modsOff: Set<string> }): CornerTone {
  if (states.modsOff.has(ref)) return 'muted';
  if (states.permanent.has(ref)) return 'permanent';
  return 'on';
}

const inside = (r: Bounds, x: number, y: number) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

export function PlayTable({ characterId, dice, sortFile, onSortOpen, overlay: overlayProp, backRef, onOpen }: {
  characterId: string;
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
  const handH = Math.round((tableH - pad * 2) * (look.areaSize / 100));
  const handTop = look.areaPos === 'top' ? pad : look.areaPos === 'middle' ? Math.round((tableH - handH) / 2) : tableH - pad - handH;
  const hand: Bounds = { left: pad, top: handTop, right: tableW - pad, bottom: handTop + handH };
  const play: Bounds = { left: pad, top: pad, right: tableW - pad, bottom: tableH - pad };
  const ownArea = look.areaMode === 'tray';
  // The open part of the table, where the dice bar, the result and the hint sit.
  const openTop = ownArea && look.areaPos === 'top' ? hand.bottom : pad;
  const openBottom = ownArea && look.areaPos === 'bottom' ? hand.top : tableH - pad;

  // ---------------------------------------------------------------- the hand
  const [menu, setMenu] = useState<{ id: string; x: number; y: number; board?: string } | null>(null);
  const [tableMenu, setTableMenu] = useState<{ x: number; y: number } | null>(null);
  const [sorting, setSorting] = useState(false);
  const [settings, setSettings] = useState(false);
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
  // On the table a card's tokens stand up as pieces, so its picture is drawn without them.
  const lookup = useCallback((id: string) => { const c = allById.get(id); return c ? toCard(c, false) : undefined; }, [allById, toCard]);
  const refOf = useCallback((id: string) => { const c = allById.get(id); return c ? c.ref ?? c.id : id; }, [allById]);

  const carRef = useRef<DeskCarouselHandle>(null);
  const keyCue = useRef<{ cents: number; at: number } | null>(null);
  const held = useRef({ n: 0, last: 0 });
  const onCentre = useCallback(() => {
    const cue = keyCue.current;
    keyCue.current = null;
    if (cue && performance.now() - cue.at < 400) playSfx('cardFullscreenEnter', { cents: cue.cents });
    else playSfx('carouselScroll');
  }, []);

  // ---------------------------------------------------------------- cards on the table
  const [board, setBoardState] = useState<BoardCard[]>(() => loadBoard(characterId));
  useEffect(() => { setBoardState(loadBoard(characterId)); }, [characterId]);
  const boardSave = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setBoard = useCallback((next: BoardCard[]) => {
    setBoardState(next);
    if (boardSave.current) clearTimeout(boardSave.current);
    boardSave.current = setTimeout(() => saveBoard(characterId, next), 300);
  }, [characterId]);
  const boardRef = useRef(board);
  boardRef.current = board;

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
        setBoard([...boardRef.current, { uid: `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, id: copy.card.id, fx, fy, w, rot: 0 }]);
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
  }, [copy?.card, setBoard, overHand]); // eslint-disable-line react-hooks/exhaustive-deps

  const onCentreClick = useCallback((card: TableCard, rect: DOMRect, p: { x: number; y: number }) => {
    if (look.centreClick === 'take') takeCopy(card, rect, p);
    else if (look.centreClick === 'equip') ctx.toggleCard(card.id);
  }, [look.centreClick, takeCopy, ctx]);

  // ---------------------------------------------------------------- tokens: the pieces of the cards on the table
  const pieces = useMemo<TokenPiece[]>(() => {
    const out: TokenPiece[] = [];
    for (const b of board) {
      const item = allById.get(b.id);
      if (!item) continue;
      const toks = ctx.cardTokens[item.ref ?? item.id] ?? ctx.cardTokens[b.id] ?? [];
      if (!toks.length) continue;
      const w = Math.min(maxW(tableH), Math.max(MIN_W, b.w));
      const h = (w * FORGED_H) / FORGED_W;
      const cx = b.fx * tableW, cy = b.fy * tableH;
      const a = ((b.rot ?? 0) * Math.PI) / 180;
      for (const t of toks) {
        const lx = (t.x - 0.5) * w, ly = (t.y - 0.5) * h;
        out.push({
          key: `tok:${b.uid}:${t.id}`,
          home: { x: cx + lx * Math.cos(a) - ly * Math.sin(a), y: cy + lx * Math.sin(a) + ly * Math.cos(a) },
          kind: t.kind === 'die' ? 'die' : 'chip',
          dieType: t.dieType,
          value: t.dieValue,
          value2: t.dieValue2,
          color: tokenFill(t),
          scale: kindScale(t.kind),
        });
      }
    }
    return out;
  }, [board, allById, ctx.cardTokens, tableW, tableH]);
  const tokenOf = (key: string) => {
    const [, uid, id] = key.split(':');
    const b = boardRef.current.find((x) => x.uid === uid);
    return b ? { ref: refOf(b.id), id } : null;
  };
  /**
   * The card under a point and where on it the point is: a laid card (its turn undone) or one in the hand. A token
   * dropped there sticks to that card.
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
      // Undo the card's turn to find where on the card the point is.
      const a = (-(b.rot ?? 0) * Math.PI) / 180;
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

  // ---------------------------------------------------------------- tokens: the supply and the loose ones
  const [supplyDie, setSupplyDie] = useState<TokenInfo['dieType']>('d6');
  const supply = useMemo<SupplyPiece[]>(() => (look.tokenTray ? [
    { key: 'src:wood', token: { kind: 'wood' }, label: 'Wood' },
    { key: 'src:bone', token: { kind: 'bone' }, label: 'Bone' },
    { key: 'src:iron', token: { kind: 'iron' }, label: 'Iron' },
    { key: 'src:color', token: { kind: 'color', color: ctx.tokenColor || TOKEN_COLORS[0] }, label: 'Colour' },
    { key: 'src:die', token: { kind: 'die', dieType: supplyDie, dieValue: 1, dieValue2: supplyDie === 'duality' ? 1 : undefined }, label: supplyDie === 'duality' ? 'Hope & Fear' : supplyDie ?? 'd6' },
  ] : []), [look.tokenTray, ctx.tokenColor, supplyDie]);
  const looseKey = `runekeep.table.loose.${characterId}`;
  const [loose, setLooseState] = useState<LoosePiece[]>(() => { try { return JSON.parse(localStorage.getItem(looseKey) ?? '[]') as LoosePiece[]; } catch { return []; } });
  const looseRef = useRef(loose);
  looseRef.current = loose;
  const setLoose = useCallback((next: LoosePiece[]) => {
    setLooseState(next);
    try { localStorage.setItem(looseKey, JSON.stringify(next)); } catch { /* private window */ }
  }, [looseKey]);
  const newTokenId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  /**
   * A token let go somewhere (owner, v0.47.2): on a card it sticks to that card (moving there if it was on another);
   * on the Tokens die it is put away; anywhere else a card's token comes loose and a loose one stays where it lies.
   */
  const dropToken = useCallback((key: string, clientX: number, clientY: number, overTokens: boolean): boolean => {
    const base = key.replace(/:(h|f|t|u)$/, '');
    const isLoose = base.startsWith('free:');
    let info: TokenInfo | undefined;
    let from: { ref: string; id: string; uid: string } | null = null;
    if (isLoose) info = looseRef.current.find((t) => t.key === base)?.token;
    else {
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
    if (overTokens) {
      playSfx('tokenRemove');
      if (isLoose) setLoose(looseRef.current.filter((t) => t.key !== base));
      else if (from) ctx.removeToken(from.ref, from.id);
      return true;
    }
    const target = cardAt(clientX, clientY);
    if (target) {
      if (from && target.uid === from.uid) { ctx.updateToken(from.ref, from.id, { x: target.x, y: target.y }); return true; }
      if (from) ctx.removeToken(from.ref, from.id);
      if (isLoose) setLoose(looseRef.current.filter((t) => t.key !== base));
      ctx.placeToken(target.ref, { id: newTokenId(), ...info, x: target.x, y: target.y } as PlacedToken);
      playSfx('placeToken');
      return true;
    }
    if (from) {
      // Off its card: it comes loose where it was let go.
      const p = local(clientX, clientY);
      ctx.removeToken(from.ref, from.id);
      setLoose([...looseRef.current, { key: `free:${newTokenId()}`, token: info, x: p.x, y: p.y }]);
      playSfx('cardDragEnd', { volume: 0.5 });
      return true;
    }
    return false;
  }, [cardAt, ctx, refOf, setLoose]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- dice
  const diceRef = useRef<TableDiceHandle>(null);
  const [result, setResult] = useState<RollResult | null>(null);
  const [dockSize, setDockSize] = useState({ w: 0, h: 0 });
  const canReorder = !!ctx.onReorderCards && category !== FAVORITES_CATEGORY && deck.length > 1;
  const openSort = useCallback(() => { playSfx('floatMenuOpen'); setSorting(true); }, []);
  const actions = useMemo<TableAction[]>(() => [
    { key: 'roll', label: 'Roll', onPress: () => dice.onToggle() },
    { key: 'tokens', label: 'Tokens', onPress: () => { playSfx(look.tokenTray ? 'panelClose' : 'panelOpen'); setLook({ ...look, tokenTray: !look.tokenTray }); } },
    { key: 'cards', label: 'Cards', onPress: () => { playSfx('panelOpen'); onOpen('cards'); } },
    { key: 'state', label: 'State', onPress: () => { playSfx('panelOpen'); onOpen('modifiers'); } },
    { key: 'sort', label: 'Sort deck', onPress: openSort, disabled: !canReorder },
  ], [dice, onOpen, canReorder, openSort, look, setLook]);
  const tableDecks = useMemo<TableDeck[]>(() => {
    const keys: CardCategory[] = [...ctx.ring.filter((c) => c !== FAVORITES_CATEGORY), FAVORITES_CATEGORY];
    return keys.map((k) => ({ key: k, label: ctx.categoryMeta[k]?.label ?? k, count: ctx.decks[k]?.length ?? 0, meta: ctx.categoryMeta[k] }));
  }, [ctx.ring, ctx.categoryMeta, ctx.decks]);
  const pickDeck = useCallback((c: CardCategory) => {
    if (c === FAVORITES_CATEGORY) ctx.openFavorites();
    else ctx.setCategory(c);
  }, [ctx]);
  // The dice bar: one slim row, centred low on the open table.
  // Centred in the room right of the deck die and left of the token tray.
  const dockX = (pad + 230 + tableW - pad - (look.tokenTray ? 80 : 0)) / 2;
  const dockBottom = tableH - openBottom + 12;
  const obstacles = useMemo(() => {
    const o: Bounds[] = [];
    if (ownArea) o.push(hand);
    if (dice.up && dockSize.h) o.push({ left: dockX - dockSize.w / 2, right: dockX + dockSize.w / 2, top: tableH - dockBottom - dockSize.h, bottom: tableH - dockBottom });
    return o;
  }, [ownArea, hand.top, hand.bottom, hand.left, hand.right, dice.up, dockSize, dockX, dockBottom, tableH]); // eslint-disable-line react-hooks/exhaustive-deps
  const reroll = useCallback((poolId: string, value: number) => {
    setResult((r) => {
      if (!r) return r;
      const dice2 = r.dice.map((d) => (d.id === poolId ? { ...d, value } : d));
      return { ...r, dice: dice2, total: poolTotal(dice2, r.mod), verdict: dualityVerdict(dice2) };
    });
  }, []);

  // ---------------------------------------------------------------- panels, back, keys
  useEffect(() => { if (overlay) { setMenu(null); setCopy(null); setTableMenu(null); } }, [overlay]);
  useLayoutEffect(() => {
    const host = desktop?.tableHost;
    if (!host) return;
    if (overlay) host.setAttribute('inert', ''); else host.removeAttribute('inert');
    return () => host.removeAttribute('inert');
  }, [overlay, desktop?.tableHost]);
  const escRef = useRef<() => boolean>(() => false);
  escRef.current = () => {
    if (result) { setResult(null); return true; }
    if (menu) { playSfx('floatMenuClose'); setMenu(null); return true; }
    if (tableMenu) { playSfx('floatMenuClose'); setTableMenu(null); return true; }
    if (copy) { playSfx('cardDeselect', { volume: 0.6 }); setCopy(null); return true; }
    if (settings) { playSfx('panelClose'); setSettings(false); return true; }
    if (dice.up) { dice.onToggle(); return true; }
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
        if (e.repeat && e.timeStamp - h.last < HOLD_STEP_MS) return;
        h.last = e.timeStamp;
        h.n = e.repeat ? h.n + 1 : 0;
        keyCue.current = { cents: HOLD_CENTS * (HOLD_PEAK - Math.abs(HOLD_PEAK - (h.n % (HOLD_PEAK * 2)))), at: performance.now() };
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
  const showHint = board.length === 0 && !copy && !dice.up;

  return (
    <DesktopPortal to="table">
      <style>{TABLE_CSS}</style>
      <div ref={(el) => { tableRef.current = el; setTableEl(el); }} data-coach="sheet-table" data-table-root="" style={{ position: 'absolute', left: 0, top: 0, width: tableW, height: tableH, overflow: 'hidden', touchAction: 'none', background: `${T.ink} url(/table/felt.webp) center / cover no-repeat` }}>
        <div style={{ position: 'absolute', inset: 0, background: 'url(/table/weave.png) repeat', opacity: 0.9, pointerEvents: 'none' }} />
        {look.walls === 'line' ? <div style={{ position: 'absolute', inset: 4, border: '1px solid rgba(218,162,73,0.32)', pointerEvents: 'none' }} /> : null}

        {/* The hand's own area, marked as lightly as the settings say; on the open table it is not marked at all. */}
        {ownArea && look.divider !== 'none' ? (
          look.divider === 'line' ? (
            <>
              {look.areaPos !== 'top' ? <div style={{ position: 'absolute', left: hand.left + 24, right: tableW - hand.right + 24, top: hand.top, height: 1, background: 'linear-gradient(90deg, transparent, rgba(218,162,73,0.3) 12%, rgba(218,162,73,0.3) 88%, transparent)', pointerEvents: 'none' }} /> : null}
              {look.areaPos !== 'bottom' ? <div style={{ position: 'absolute', left: hand.left + 24, right: tableW - hand.right + 24, top: hand.bottom, height: 1, background: 'linear-gradient(90deg, transparent, rgba(218,162,73,0.3) 12%, rgba(218,162,73,0.3) 88%, transparent)', pointerEvents: 'none' }} /> : null}
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
              onChange={setBoard}
              onReturn={(uid) => setBoard(boardRef.current.filter((b) => b.uid !== uid))}
              onLift={(b) => {
                const w = Math.min(maxW(tableH), Math.max(MIN_W, b.w));
                diceRef.current?.carry(b ? { cx: b.fx * tableW, cy: b.fy * tableH, w, h: (w * FORGED_H) / FORGED_W, rot: b.rot ?? 0 } : null);
              }}
              onCarry={(dx, dy) => diceRef.current?.carryBy(dx, dy)}
              onSettle={() => diceRef.current?.carry(null)}
              overTray={overHand}
              onMenu={(uid, x, y) => {
                const b = boardRef.current.find((c) => c.uid === uid);
                if (!b) return;
                const p = local(x, y);
                playSfx('floatMenuOpen');
                setMenu({ id: b.id, x: p.x, y: p.y, board: uid });
              }}
            />
          </div>
        </div>

        {/* The hand. */}
        <div ref={handRef} style={{ position: 'absolute', left: hand.left, top: hand.top, width: hand.right - hand.left, height: handH, zIndex: 10 }}>
          {deck.length === 0 ? (
            <div style={{ position: 'absolute', left: 0, right: 0, top: '45%', textAlign: 'center', color: T.muted, fontFamily: T.medium, fontSize: 14 }}>Nothing in this deck yet. Add a card from the sheet.</div>
          ) : (
            <DeskCarousel key={category} ref={carRef} cards={cards} look={look} initialIndex={middle} onCentre={onCentre} onCentreClick={onCentreClick} />
          )}
        </div>

        {showHint ? (
          <div style={{ position: 'absolute', left: 0, right: 0, top: openTop + (openBottom - openTop) * 0.5, transform: 'translateY(-50%)', textAlign: 'center', pointerEvents: 'none', color: 'rgba(147,142,136,0.55)', fontFamily: T.medium, fontSize: 14, lineHeight: '21px', zIndex: 6 }}>
            Click the middle card of your hand to take a copy, then click the table to lay it down.<br />Drag a die to throw it. Right click a die to roll it, or the table for everything else.
          </div>
        ) : null}

        <div data-coach="sheet-decks" style={{ position: 'absolute', left: pad + 8, top: (ownArea && look.areaPos === 'bottom' ? hand.top : tableH - pad) - 150, width: 140, height: 146, pointerEvents: 'none' }} />
        <TableDice
          ref={diceRef}
          host={tableEl}
          width={tableW}
          height={tableH}
          bounds={play}
          homeArea={{ left: pad, top: openTop, right: tableW - pad, bottom: openBottom }}
          obstacles={obstacles}
          walls={{ kind: look.walls, rect: { left: 0, top: 0, right: tableW, bottom: tableH }, thickness: pad }}
          decks={tableDecks}
          current={category}
          onPickDeck={pickDeck}
          actions={actions}
          controls={look.controls}
          controlFinish={look.controlDice}
          numberFinish={look.numberDice}
          tokens={pieces}
          supply={supply}
          loose={loose}
          onSpawn={(key, token, x, y) => setLoose([...looseRef.current, { key, token, x, y }])}
          onSupplyAlt={(key) => {
            if (key === 'src:color') { const c = ctx.tokenColor || TOKEN_COLORS[0]; ctx.setTokenColor(TOKEN_COLORS[(TOKEN_COLORS.indexOf(c) + 1) % TOKEN_COLORS.length]); playSfx('tokenCopyColor', { volume: 0.6 }); }
            else if (key === 'src:die') { setSupplyDie((d) => nextDieType(d ?? 'd6')); playSfx('placeToken', { volume: 0.5, cents: 200 }); }
          }}
          onLooseRest={(key, x, y) => setLoose(looseRef.current.map((t) => (t.key === key ? { ...t, x, y } : t)))}
          onLooseRolled={(key, value, value2) => setLoose(looseRef.current.map((t) => (t.key === key ? { ...t, token: { ...t.token, dieValue: value, dieValue2: value2 ?? t.token.dieValue2 } } : t)))}
          onTokenRolled={(key, value, value2) => { const t = tokenOf(key); if (t) ctx.updateToken(t.ref, t.id, value2 === undefined ? { dieValue: value } : { dieValue: value, dieValue2: value2 }); }}
          onRerolled={reroll}
          onDropPiece={dropToken}
          onDragPiece={() => {}}
          onTableMenu={(x, y) => { const p = local(x, y); playSfx('floatMenuOpen'); setTableMenu(p); }}
          inert={overlay || settings}
        />
        {dice.up ? (
          <RollDock left={dockX} bottom={dockBottom} dice={diceRef} handleRef={dice.handleRef} presets={dice.presets} onClose={dice.onToggle} onResult={setResult} onHeight={setDockSize} />
        ) : null}

        {/* Settings and Send home, in the lower left corner. */}
        <div style={{ position: 'absolute', left: pad + 10, bottom: pad + 10, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 33 }}>
          <CornerButton glyph="reset" label="Send everything home" onPress={() => diceRef.current?.resetHome()} />
          <CornerButton glyph="settings" label="Table settings" active={settings} onPress={() => { playSfx(settings ? 'panelClose' : 'panelOpen'); setSettings((s) => !s); }} />
        </div>

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
          <TableMenu x={tableMenu.x} y={tableMenu.y} tableW={tableW} tableH={tableH} onClose={() => setTableMenu(null)} rows={[
            { label: 'Choose a deck', onPress: () => diceRef.current?.openDecks({ x: tableMenu.x, y: tableMenu.y }) },
            { label: dice.up ? 'Close the dice bar' : 'Roll dice', onPress: dice.onToggle },
            { label: 'State', onPress: () => onOpen('modifiers') },
            { label: 'Cards', onPress: () => onOpen('cards') },
            { label: 'Sort this deck', onPress: openSort, hidden: !canReorder },
            { label: 'Clear the rolled dice', onPress: () => { diceRef.current?.clearRoll(); setResult(null); }, hidden: !diceRef.current?.hasRoll(), gap: true },
            { label: 'Send everything home', onPress: () => diceRef.current?.resetHome(), gap: !diceRef.current?.hasRoll() },
            { label: 'Table settings', onPress: () => setSettings(true) },
          ]} />
        ) : null}
        {menu && !overlay ? (
          <CardMenu id={menu.id} x={menu.x} y={menu.y} tableW={tableW} tableH={tableH} onClose={() => setMenu(null)}
            board={menu.board ? () => setBoard(boardRef.current.filter((b) => b.uid !== menu.board)) : undefined}
            place={menu.board ? undefined : () => {
              const el = handRef.current?.querySelector(`[data-card-id="${CSS.escape(menu.id)}"]`) as HTMLElement | null;
              const r = tableRef.current?.getBoundingClientRect();
              const card = lookup(menu.id);
              if (el && r && card) takeCopy(card, el.getBoundingClientRect(), { x: r.left + menu.x, y: r.top + menu.y });
            }} />
        ) : null}
      </div>
      {result ? <RollPopup key={result.dice.map((d) => d.id).join()} result={result} box={port} onAccept={() => { playSfx('buttonTap'); setResult(null); }} /> : null}
      {settings ? <LookPanel look={look} onChange={setLook} onClose={() => { playSfx('panelClose'); setSettings(false); }} onClearTable={() => setBoard([])} boardCount={board.length} box={port} /> : null}
    </DesktopPortal>
  );
}

function CornerButton({ glyph, label, onPress, active }: { glyph: 'settings' | 'reset'; label: string; onPress: () => void; active?: boolean }) {
  const [hover, setHover] = useState(false);
  return (
    <button type="button" title={label} aria-label={label} aria-pressed={active} onClick={onPress} onPointerDown={(e) => e.stopPropagation()} onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)} style={{ all: 'unset', cursor: 'pointer' }}>
      <Chamfer c={9} line={active ? T.red : hover ? T.goldBright : T.goldSoft} fill={active ? 'rgba(200,27,24,0.28)' : hover ? T.panelLit : 'rgba(11,14,19,0.9)'} style={{ width: 40, height: 40 }} inner={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ display: 'flex', transform: hover ? `rotate(${glyph === 'settings' ? 60 : -40}deg)` : 'none', transition: `transform 280ms ${T.ease}` }}>
          <Glyph d={DIE_GLYPHS[glyph]} size={19} color={active || hover ? T.ivory : T.goldText} />
        </span>
      </Chamfer>
    </button>
  );
}

function MenuShell({ x, y, tableW, tableH, rows, onClose }: { x: number; y: number; tableW: number; tableH: number; rows: { label: string; onPress: () => void; danger?: boolean; gap?: boolean }[]; onClose: () => void }) {
  const W = 230, H = rows.length * 38 + rows.filter((r) => r.gap).length * 9 + 16;
  return (
    <>
      <div onPointerDown={(e) => { e.stopPropagation(); playSfx('floatMenuClose'); onClose(); }} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }} style={{ position: 'absolute', inset: 0, zIndex: 900 }} aria-label="Close the menu" />
      <div role="menu" onPointerDown={(e) => e.stopPropagation()} style={{ position: 'absolute', zIndex: 901, left: Math.max(8, Math.min(x, tableW - W - 24)), top: Math.max(8, Math.min(y, tableH - H - 24)), width: W }}>
        <Chamfer c={9} fill={T.panelLit} line={T.gold} width={1.3} inner={{ padding: 7 }}>
          {rows.map((r) => (
            <div key={r.label}>
              {r.gap ? <div style={{ height: 1, background: 'rgba(218,162,73,0.22)', margin: '4px 6px' }} /> : null}
              <MenuRow label={r.label} danger={r.danger} onPress={() => { onClose(); r.onPress(); }} />
            </div>
          ))}
        </Chamfer>
      </div>
    </>
  );
}

/** The table's right-click menu: every control, whether the dice are showing or not. */
function TableMenu({ rows, ...rest }: { x: number; y: number; tableW: number; tableH: number; onClose: () => void; rows: { label: string; onPress: () => void; hidden?: boolean; gap?: boolean }[] }) {
  return <MenuShell {...rest} rows={rows.filter((r) => !r.hidden)} />;
}

/**
 * What holding a card does on the phone, at the pointer; every row runs the same handler the wheel runs. A card laid
 * on the table is a copy, so its menu has one thing in it: taking it off the table (owner: never delete from there).
 */
function CardMenu({ id, x, y, tableW, tableH, onClose, board, place }: { id: string; x: number; y: number; tableW: number; tableH: number; onClose: () => void; board?: () => void; place?: () => void }) {
  const ctx = useCarousel();
  const item = Object.values(ctx.decks).flat().find((c) => c?.id === id);
  if (!item) return null;
  if (board) return <MenuShell x={x} y={y} tableW={tableW} tableH={tableH} onClose={onClose} rows={[{ label: 'Take off the table', onPress: board }]} />;
  const ref = item.ref ?? item.id;
  const fav = ctx.isFavorited(id);
  const mirror = ctx.category === FAVORITES_CATEGORY;
  const rows: { label: string; onPress: () => void; hidden?: boolean; danger?: boolean; gap?: boolean }[] = [
    ...(place ? [{ label: 'Lay a copy on the table', onPress: place }] : []),
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

function MenuRow({ label, danger, onPress }: { label: string; danger?: boolean; onPress: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button type="button" role="menuitem" onClick={onPress} onPointerEnter={() => { setHover(true); playSfx('floatMenuHighlight', { volume: 0.4 }); }} onPointerLeave={() => setHover(false)}
      style={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', display: 'flex', alignItems: 'center', width: '100%', height: 38, padding: '0 12px', background: hover ? (danger ? T.red : 'rgba(200,27,24,0.85)') : 'transparent', color: danger && !hover ? '#E2705A' : T.ivory, fontFamily: T.bold, fontSize: 13 }}>
      {label}
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
.rk-scroll input::placeholder { color: rgba(147,142,136,0.8); }
.rk-ok:focus-visible { outline: 1.5px solid ${T.goldBright}; outline-offset: 3px; }
.rk-scroll button:focus-visible, [role="listbox"] [role="option"]:focus-visible { outline: 1.5px solid ${T.goldBright}; outline-offset: 2px; }
`;
