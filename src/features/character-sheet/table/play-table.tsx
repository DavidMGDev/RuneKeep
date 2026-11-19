/**
 * The desktop play table (v0.47.0, owner): everything right of the sheet is a table seen from above. A wooden
 * rail round ink felt; along the bottom, a recessed tray holding the hand; on the felt, the cards you have laid out
 * and the dice that replaced the buttons.
 *
 * Each part owns its own input and nothing else: the hand answers only inside its tray (wheel, drag, click), the
 * dice answer only where a die is, and cards on the felt answer only under themselves. Table settings (lower left)
 * shape the hand; the reset beside it sends the dice home.
 *
 * Reads and writes the same carousel context the phone's hand does, so equipping, decks, favourites, moving and
 * deleting all go through the code paths they always have.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { DesktopPortal } from '@/components/desktop-portal';
import { useDesktop } from '@/hooks/use-desktop';
import { catalogIdOf } from '@/features/cards/card-effects';
import { FORGED_H, FORGED_W } from '@/features/create/components/forged-card';
import type { CharacterFile } from '@/lib/character-file';
import { FAVORITES_CATEGORY } from '@/lib/favorites';
import { playSfx } from '@/lib/sfx';
import type { CardCategory, CardItem } from '../card-data';
import { useCarousel } from '../carousel-context';
import { BakedTokenLayer, type PlacedToken } from '../components/card-tokens';
import { type CornerTone, EnabledCorner } from '../components/enabled-corner';
import { TraitCrossOut } from '../components/trait-cross-out';
import type { DiceTrayHandle } from '../sheet/dice-tray';
import type { DicePresetSlots } from '../sheet/dice-preset-slots';
import { SortPanel } from '../sheet/sort-panel';
import { BoardCards, maxW, MIN_W } from './board-cards';
import type { DeckLook } from './deck-look';
import { CardFace, DeskCarousel, type DeskCarouselHandle, type TableCard } from './desk-carousel';
import { LookPanel } from './look-panel';
import { RollDock, RollReadout, type RollResult } from './roll-dock';
import { type ActionKey, type TableAction, TableDice, type TableDiceHandle, type TableDeck } from './table-dice';
import { type BoardCard, loadBoard, loadLook, saveBoard, saveLook } from './table-store';
import { Chamfer, Glyph, DIE_GLYPHS, T } from './table-ui';

/** The dice bar's state and the sheet's handle to it (the traits roll through it). */
export type DeskDice = { up: boolean; onToggle: () => void; handleRef: { current: DiceTrayHandle | null }; presets: Omit<Parameters<typeof DicePresetSlots>[0], 'belt'> };
export type TablePanel = 'rest' | 'level' | 'modifiers' | 'cards';

const RAIL = 16;
const CAP = 64; // the tray's left end, holding settings and reset
const NO_CARDS: CardItem[] = [];
const NO_OBSTACLES: { left: number; top: number; right: number; bottom: number }[] = [];
/** A held arrow steps a card every HOLD_STEP_MS, its pitch climbing then falling back (owner, v0.46.0). */
const HOLD_STEP_MS = 160;
const HOLD_CENTS = 100;
const HOLD_PEAK = 8;
const HAND_W = 170;

function cornerTone(ref: string, states: { permanent: Set<string>; modsOff: Set<string> }): CornerTone {
  if (states.modsOff.has(ref)) return 'muted';
  if (states.permanent.has(ref)) return 'permanent';
  return 'on';
}

export function PlayTable({ characterId, dice, sortFile, onSortOpen, overlay: overlayProp, backRef, onOpen, onExit }: {
  characterId: string;
  dice: DeskDice;
  sortFile?: CharacterFile;
  onSortOpen?: (open: boolean) => void;
  overlay: boolean;
  backRef: React.MutableRefObject<(() => boolean) | null>;
  onOpen: (p: TablePanel) => void;
  onExit: () => void;
}) {
  const desktop = useDesktop();
  const { width: winW, height: winH } = useWindowDimensions();
  const ctx = useCarousel();
  const { decks, category } = ctx;
  const deck = decks[category] ?? NO_CARDS;

  // ---------------------------------------------------------------- layout
  const [look, setLookState] = useState<DeckLook>(loadLook);
  const lookSave = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setLook = useCallback((l: DeckLook) => {
    setLookState(l);
    if (lookSave.current) clearTimeout(lookSave.current);
    lookSave.current = setTimeout(() => saveLook(l), 250);
  }, []);
  const port = desktop?.port;
  const tableW = Math.max(0, winW - (port ? port.left + port.width : 0));
  const tableH = winH;
  const innerW = Math.max(200, tableW - RAIL * 2);
  const innerH = Math.max(200, tableH - RAIL * 2);
  const cardH = (look.size * FORGED_H) / FORGED_W;
  const trayH = Math.round(Math.min(innerH * 0.66, Math.max(170, cardH + 44 + Math.max(0, look.lift) + look.hoverLift)));
  const feltH = innerH - trayH;
  const feltW = innerW;

  // ---------------------------------------------------------------- the hand
  const [menu, setMenu] = useState<{ id: string; x: number; y: number; board?: string } | null>(null);
  const [sorting, setSorting] = useState(false);
  const [settings, setSettings] = useState(false);
  const overlay = overlayProp || sorting;
  useEffect(() => { onSortOpen?.(sorting); }, [sorting, onSortOpen]);
  useEffect(() => { setMenu(null); }, [category]);

  const toCard = useCallback((c: CardItem): TableCard => {
    const ref = c.ref ?? c.id;
    const tokens: PlacedToken[] | undefined = ctx.cardTokens[ref] ?? ctx.cardTokens[c.id];
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
  const cards = useMemo(() => deck.map(toCard), [deck, toCard]);
  const allById = useMemo(() => {
    const m = new Map<string, CardItem>();
    for (const list of Object.values(decks)) for (const c of list ?? []) if (!m.has(c.id)) m.set(c.id, c);
    return m;
  }, [decks]);
  const lookup = useCallback((id: string) => { const c = allById.get(id); return c ? toCard(c) : undefined; }, [allById, toCard]);

  const carRef = useRef<DeskCarouselHandle>(null);
  const keyCue = useRef<{ cents: number; at: number } | null>(null);
  const held = useRef({ n: 0, last: 0 });
  const onCentre = useCallback(() => {
    const cue = keyCue.current;
    keyCue.current = null;
    if (cue && performance.now() - cue.at < 400) playSfx('cardFullscreenEnter', { cents: cue.cents });
    else playSfx('carouselScroll');
  }, []);

  // ---------------------------------------------------------------- cards on the felt
  const [board, setBoardState] = useState<BoardCard[]>(() => loadBoard(characterId));
  useEffect(() => { setBoardState(loadBoard(characterId)); }, [characterId]);
  const boardSave = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setBoard = useCallback((next: BoardCard[]) => {
    setBoardState(next);
    if (boardSave.current) clearTimeout(boardSave.current);
    boardSave.current = setTimeout(() => saveBoard(characterId, next), 300);
  }, [characterId]);

  const tableRef = useRef<HTMLDivElement>(null);
  const feltRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const [feltEl, setFeltEl] = useState<HTMLDivElement | null>(null);
  const overTray = useCallback((x: number, y: number) => {
    const r = trayRef.current?.getBoundingClientRect();
    return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }, []);

  // A copy in the hand: it follows the pointer until it is put down on the felt (or back in the tray).
  const [hand, setHand] = useState<{ card: TableCard; x: number; y: number; w: number; settled: boolean } | null>(null);
  const takeCopy = useCallback((card: TableCard, rect: DOMRect, p: { x: number; y: number }) => {
    const root = tableRef.current?.getBoundingClientRect();
    if (!root) return;
    playSfx('cardDragStart');
    setHand({ card, x: rect.left - root.left + rect.width / 2, y: rect.top - root.top + rect.height / 2, w: rect.width, settled: false });
    requestAnimationFrame(() => requestAnimationFrame(() => setHand((h) => (h ? { ...h, x: p.x - root.left, y: p.y - root.top, w: HAND_W, settled: true } : h))));
  }, []);
  useEffect(() => {
    if (!hand) return;
    const root = tableRef.current;
    if (!root) return;
    const move = (e: PointerEvent) => {
      const r = root.getBoundingClientRect();
      setHand((h) => (h && h.settled ? { ...h, x: e.clientX - r.left, y: e.clientY - r.top } : h));
    };
    const down = (e: PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const f = feltRef.current?.getBoundingClientRect();
      if (f && e.clientX >= f.left && e.clientX <= f.right && e.clientY >= f.top && e.clientY <= f.bottom && e.button === 0) {
        const w = Math.min(maxW(f.height), Math.max(MIN_W, HAND_W));
        const h = (w * FORGED_H) / FORGED_W;
        const fx = Math.min(f.width - w / 2 - 4, Math.max(w / 2 + 4, e.clientX - f.left)) / f.width;
        const fy = Math.min(f.height - h / 2 - 4, Math.max(h / 2 + 4, e.clientY - f.top)) / f.height;
        playSfx('cardDragEnd');
        setBoard([...boardRef.current, { uid: `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, id: hand.card.id, fx, fy, w }]);
      } else {
        playSfx('cardDeselect', { volume: 0.6 });
      }
      setHand(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerdown', down, true);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', down, true);
    };
  }, [hand?.card, setBoard]); // eslint-disable-line react-hooks/exhaustive-deps
  const boardRef = useRef(board);
  boardRef.current = board;

  const onCentreClick = useCallback((card: TableCard, rect: DOMRect, p: { x: number; y: number }) => {
    if (look.centreClick === 'take') takeCopy(card, rect, p);
    else if (look.centreClick === 'equip') ctx.toggleCard(card.id);
  }, [look.centreClick, takeCopy, ctx]);

  // ---------------------------------------------------------------- dice
  const diceRef = useRef<TableDiceHandle>(null);
  const [result, setResult] = useState<RollResult | null>(null);
  const [dockH, setDockH] = useState(0);
  useEffect(() => { if (!dice.up) setResult(null); }, [dice.up]);
  const canReorder = !!ctx.onReorderCards && category !== FAVORITES_CATEGORY && deck.length > 1;
  const actions = useMemo<TableAction[]>(() => {
    const a: Record<ActionKey, TableAction> = {
      roll: { key: 'roll', label: 'Roll', onPress: () => dice.onToggle() },
      rest: { key: 'rest', label: 'Rest', onPress: () => { playSfx('panelOpen'); onOpen('rest'); } },
      level: { key: 'level', label: 'Level up', onPress: () => { playSfx('panelOpen'); onOpen('level'); } },
      state: { key: 'state', label: 'State', onPress: () => { playSfx('panelOpen'); onOpen('modifiers'); } },
      cards: { key: 'cards', label: 'Cards', onPress: () => { playSfx('panelOpen'); onOpen('cards'); } },
      sort: { key: 'sort', label: 'Sort deck', onPress: () => { playSfx('floatMenuOpen'); setSorting(true); }, disabled: !canReorder },
      exit: { key: 'exit', label: 'Characters', onPress: onExit },
    };
    return [a.roll, a.rest, a.level, a.state, a.cards, a.sort, a.exit];
  }, [dice, onOpen, onExit, canReorder]);
  const tableDecks = useMemo<TableDeck[]>(() => {
    const keys: CardCategory[] = [...ctx.ring.filter((c) => c !== FAVORITES_CATEGORY), FAVORITES_CATEGORY];
    return keys.map((k) => ({ key: k, label: ctx.categoryMeta[k]?.label ?? k, count: ctx.decks[k]?.length ?? 0, meta: ctx.categoryMeta[k] }));
  }, [ctx.ring, ctx.categoryMeta, ctx.decks]);
  const pickDeck = useCallback((c: CardCategory) => {
    if (c === FAVORITES_CATEGORY) ctx.openFavorites();
    else ctx.setCategory(c);
  }, [ctx]);

  // ---------------------------------------------------------------- panels, back, keys
  useEffect(() => { if (overlay) { setMenu(null); setHand(null); } }, [overlay]);
  useLayoutEffect(() => {
    const host = desktop?.tableHost;
    if (!host) return;
    if (overlay) host.setAttribute('inert', ''); else host.removeAttribute('inert');
    return () => host.removeAttribute('inert');
  }, [overlay, desktop?.tableHost]);
  const escRef = useRef<() => boolean>(() => false);
  escRef.current = () => {
    if (menu) { playSfx('floatMenuClose'); setMenu(null); return true; }
    if (hand) { playSfx('cardDeselect', { volume: 0.6 }); setHand(null); return true; }
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

  // Right-click a card in the tray: the phone's hold wheel, as a menu at the pointer.
  const tableHost = desktop?.tableHost ?? null;
  useEffect(() => {
    if (!tableHost) return;
    const onMenu = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest?.('[data-card-id]') as HTMLElement | null;
      e.preventDefault();
      if (!el) return;
      const r = tableHost.getBoundingClientRect();
      playSfx('floatMenuOpen');
      setMenu({ id: el.dataset.cardId!, x: e.clientX - r.left, y: e.clientY - r.top });
    };
    tableHost.addEventListener('contextmenu', onMenu);
    return () => tableHost.removeEventListener('contextmenu', onMenu);
  }, [tableHost]);

  if (!desktop) return null;
  const middle = Math.floor((deck.length - 1) / 2);
  const dockLeft = 150;
  const dockW = Math.max(560, feltW - dockLeft - 14);

  return (
    <DesktopPortal to="table">
      <style>{TABLE_CSS}</style>
      <div ref={tableRef} data-coach="sheet-table" data-table-root="" style={{ position: 'absolute', left: 0, top: 0, width: tableW, height: tableH, overflow: 'hidden', background: `${T.ink} url(/table/felt.webp) center / cover no-repeat` }}>
        {/* The weave over the felt, and the rail round the table. */}
        <div style={{ position: 'absolute', inset: 0, background: 'url(/table/weave.png) repeat', opacity: 0.9, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, borderStyle: 'solid', borderWidth: RAIL, borderImage: 'url(/table/rail.webp) 44 stretch', pointerEvents: 'none', zIndex: 60, filter: 'drop-shadow(0 0 10px rgba(0,0,0,0.6))' }} />

        {/* The felt: cards laid out, then the dice above them. */}
        <div ref={(el) => { feltRef.current = el; setFeltEl(el); }} style={{ position: 'absolute', left: RAIL, top: RAIL, width: feltW, height: feltH, touchAction: 'none' }}>
          <BoardCards
            cards={board}
            lookup={lookup}
            feltW={feltW}
            feltH={feltH}
            onChange={setBoard}
            onReturn={(uid) => setBoard(boardRef.current.filter((b) => b.uid !== uid))}
            overTray={overTray}
            onMenu={(uid, x, y) => {
              const r = tableRef.current?.getBoundingClientRect();
              const b = boardRef.current.find((c) => c.uid === uid);
              if (!r || !b) return;
              playSfx('floatMenuOpen');
              setMenu({ id: b.id, x: x - r.left, y: y - r.top, board: uid });
            }}
          />
          {board.length === 0 && !hand && !dice.up && !result ? (
            <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', transform: 'translateY(-50%)', textAlign: 'center', pointerEvents: 'none', color: 'rgba(147,142,136,0.55)', fontFamily: T.medium, fontSize: 14, lineHeight: '21px' }}>
              Click the card in the middle of your hand to take a copy, then click here to lay it down.<br />Drag the dice around; click one to use it.
            </div>
          ) : null}
          <div data-coach="sheet-decks" style={{ position: 'absolute', left: 8, top: feltH - 152, width: 140, height: 146, pointerEvents: 'none' }} />
          <TableDice ref={diceRef} felt={feltEl} width={feltW} height={feltH} decks={tableDecks} current={category} onPickDeck={pickDeck} actions={actions} inert={overlay}
            obstacles={dice.up && dockH ? [{ left: dockLeft, right: dockLeft + dockW, top: feltH - 12 - dockH, bottom: feltH - 12 }] : NO_OBSTACLES} />
          {result ? <RollReadout key={result.dice.map((d) => d.id + d.value).join()} result={result} x={feltW / 2} y={Math.max(24, (feltH - (dice.up ? dockH + 12 : 0)) * 0.12)} /> : null}
          {dice.up ? (
            <RollDock left={dockLeft} width={dockW} bottom={12} dice={diceRef} handleRef={dice.handleRef} presets={dice.presets} onClose={dice.onToggle} onResult={setResult} onHeight={setDockH} />
          ) : null}
          {settings ? <LookPanel look={look} onChange={setLook} onClose={() => { playSfx('panelClose'); setSettings(false); }} onClearTable={() => setBoard([])} boardCount={board.length} maxH={feltH - 32} /> : null}
        </div>

        {/* The card tray: recessed below the felt, the hand inside it, settings and reset at its left end. */}
        <div ref={trayRef} style={{ position: 'absolute', left: RAIL, top: RAIL + feltH, width: feltW, height: trayH, background: 'linear-gradient(rgba(3,5,8,0.62), rgba(5,7,11,0.42) 26px, rgba(5,7,11,0.36))', boxShadow: 'inset 0 10px 18px -8px rgba(0,0,0,0.85)', borderTop: '1px solid rgba(218,162,73,0.38)' }}>
          <div style={{ position: 'absolute', left: CAP, right: 0, top: 0, bottom: 0 }}>
            {deck.length === 0 ? (
              <div style={{ position: 'absolute', left: 0, right: CAP, top: '45%', textAlign: 'center', color: T.muted, fontFamily: T.medium, fontSize: 14 }}>Nothing in this deck yet. Add a card from the sheet.</div>
            ) : (
              <DeskCarousel key={category} ref={carRef} cards={cards} look={look} initialIndex={middle} onCentre={onCentre} onCentreClick={onCentreClick} />
            )}
          </div>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: CAP, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 10, paddingBottom: 14, borderRight: '1px solid rgba(218,162,73,0.16)' }}>
            <CornerButton glyph="reset" label="Send the dice home" onPress={() => diceRef.current?.resetHome()} />
            <CornerButton glyph="settings" label="Table settings" active={settings} onPress={() => { playSfx(settings ? 'panelClose' : 'panelOpen'); setSettings((s) => !s); }} />
          </div>
        </div>

        {/* The copy in your hand. */}
        {hand ? (
          <div style={{ position: 'absolute', left: hand.x - hand.w / 2, top: hand.y - (hand.w * FORGED_H) / FORGED_W / 2, width: hand.w, height: (hand.w * FORGED_H) / FORGED_W, pointerEvents: 'none', zIndex: 70, transform: 'rotate(-3deg)', boxShadow: '0 26px 50px rgba(0,0,0,0.65)', transition: hand.settled ? `width 220ms ${T.ease}, height 220ms ${T.ease}` : 'none' }}>
            <div style={{ width: FORGED_W, height: FORGED_H, transform: `scale(${hand.w / FORGED_W})`, transformOrigin: '0 0', transition: `transform 220ms ${T.ease}` }}>
              <CardFace card={hand.card} hiRes />
            </div>
          </div>
        ) : null}

        {sorting ? (
          <DesktopPortal to="side" priority="dialog" onDismiss={() => setSorting(false)}>
            <SortPanel file={sortFile} ids={deck.map((c) => c.id)} onApply={(ordered, moved) => { playSfx('cardDragEnd'); ctx.onReorderCards?.(moved, category, ordered); }} onClose={() => setSorting(false)} />
          </DesktopPortal>
        ) : null}
        {overlay ? <div style={{ position: 'absolute', inset: 0, zIndex: 800, background: 'rgba(6,8,13,0.45)' }} /> : null}
        {menu && !overlay ? (
          <CardMenu id={menu.id} x={menu.x} y={menu.y} tableW={tableW} tableH={tableH} onClose={() => setMenu(null)}
            board={menu.board ? () => setBoard(boardRef.current.filter((b) => b.uid !== menu.board)) : undefined}
            place={menu.board ? undefined : () => {
              const el = tableRef.current?.querySelector(`[data-card-id="${CSS.escape(menu.id)}"]`) as HTMLElement | null;
              const r = tableRef.current?.getBoundingClientRect();
              const card = lookup(menu.id);
              if (el && r && card) takeCopy(card, el.getBoundingClientRect(), { x: r.left + menu.x, y: r.top + menu.y });
            }} />
        ) : null}
      </div>
    </DesktopPortal>
  );
}

function CornerButton({ glyph, label, onPress, active }: { glyph: 'settings' | 'reset'; label: string; onPress: () => void; active?: boolean }) {
  const [hover, setHover] = useState(false);
  return (
    <button type="button" title={label} aria-label={label} aria-pressed={active} onClick={onPress} onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)} style={{ all: 'unset', cursor: 'pointer' }}>
      <Chamfer c={9} line={active ? T.red : hover ? T.goldBright : T.goldSoft} fill={active ? 'rgba(200,27,24,0.28)' : hover ? T.panelLit : 'rgba(11,14,19,0.9)'} style={{ width: 42, height: 42 }} inner={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ display: 'flex', transform: hover && glyph === 'settings' ? 'rotate(45deg)' : hover ? 'rotate(-40deg)' : 'none', transition: `transform 260ms ${T.ease}` }}>
          <Glyph d={DIE_GLYPHS[glyph]} size={20} color={active || hover ? T.ivory : T.goldText} />
        </span>
      </Chamfer>
    </button>
  );
}

/** What holding a card does on the phone, at the pointer. Every row runs the same handler the wheel runs. */
function CardMenu({ id, x, y, tableW, tableH, onClose, board, place }: { id: string; x: number; y: number; tableW: number; tableH: number; onClose: () => void; board?: () => void; place?: () => void }) {
  const ctx = useCarousel();
  const item = Object.values(ctx.decks).flat().find((c) => c?.id === id);
  if (!item) return null;
  const ref = item.ref ?? item.id;
  const fav = ctx.isFavorited(id);
  const run = (fn: () => void) => () => { onClose(); fn(); };
  const mirror = ctx.category === FAVORITES_CATEGORY && !board;
  const rows: { label: string; onPress: () => void; hidden?: boolean; danger?: boolean }[] = [
    ...(board ? [{ label: 'Take off the table', onPress: run(board) }] : []),
    ...(place ? [{ label: 'Lay a copy on the table', onPress: run(place) }] : []),
    ...(mirror
      ? [{ label: 'Remove from Favorites', onPress: run(() => ctx.cardAction('unfavorite', [id])) }]
      : [
          { label: ctx.enabledIds.has(ref) ? 'Unequip' : 'Equip', onPress: run(() => ctx.toggleCard(id)), hidden: ctx.cardStates.permanent.has(ref) },
          { label: fav ? 'Remove from Favorites' : 'Add to Favorites', onPress: run(() => ctx.cardAction('favorite', [id])) },
          { label: 'Move to deck', onPress: run(() => ctx.cardAction('move', [id])) },
          { label: ctx.nfcAvailable ? 'Share' : 'Export', onPress: run(() => ctx.cardAction('nfc', [id])) },
          { label: 'Delete', onPress: run(() => ctx.cardAction('delete', [id])), danger: true },
        ]),
  ];
  const shown = rows.filter((r) => !r.hidden);
  const W = 230, H = shown.length * 38 + 16;
  return (
    <>
      <div onPointerDown={(e) => { e.stopPropagation(); playSfx('floatMenuClose'); onClose(); }} style={{ position: 'absolute', inset: 0, zIndex: 900 }} aria-label="Close the card menu" />
      <div role="menu" style={{ position: 'absolute', zIndex: 901, left: Math.min(x, tableW - W - 24), top: Math.min(y, tableH - H - 24), width: W }}>
        <Chamfer c={9} fill={T.panelLit} line={T.gold} width={1.3} inner={{ padding: 7 }}>
          {shown.map((r) => <MenuRow key={r.label} label={r.label} danger={r.danger} onPress={r.onPress} />)}
        </Chamfer>
      </div>
    </>
  );
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
.rk-range { -webkit-appearance: none; appearance: none; width: 100%; height: 22px; background: transparent; cursor: pointer; margin: 0; }
.rk-range::-webkit-slider-runnable-track { height: 3px; background: rgba(218,162,73,0.35); }
.rk-range::-moz-range-track { height: 3px; background: rgba(218,162,73,0.35); }
.rk-range::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; margin-top: -5.5px; background: ${T.red}; transform: rotate(45deg); border: 1.5px solid ${T.goldText}; transition: transform 120ms; }
.rk-range::-moz-range-thumb { width: 12px; height: 12px; background: ${T.red}; transform: rotate(45deg); border: 1.5px solid ${T.goldText}; border-radius: 0; }
.rk-range:hover::-webkit-slider-thumb { transform: rotate(45deg) scale(1.2); }
.rk-range:focus-visible { outline: 1.5px solid ${T.goldBright}; outline-offset: 2px; }
.rk-die-label:focus-visible { outline: 1.5px solid ${T.goldBright}; outline-offset: 3px; color: ${T.ivory} !important; }
@media (prefers-reduced-motion: reduce) { [role="listbox"] [role="option"] { transition: none !important; } }
.rk-scroll { scrollbar-width: thin; scrollbar-color: rgba(218,162,73,0.45) transparent; }
.rk-scroll::-webkit-scrollbar { width: 8px; }
.rk-scroll::-webkit-scrollbar-thumb { background: rgba(218,162,73,0.4); }
[data-table-root] ::selection, .rk-scroll ::selection { background: rgba(200,27,24,0.55); color: ${T.ivory}; }
.rk-scroll input::placeholder { color: rgba(147,142,136,0.8); }
.rk-scroll button:focus-visible, [role="listbox"] [role="option"]:focus-visible { outline: 1.5px solid ${T.goldBright}; outline-offset: 2px; }
`;
