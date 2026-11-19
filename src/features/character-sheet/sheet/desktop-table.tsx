import { coachTarget } from '@/components/coach-tour';
import { TableMotes } from './table-motes';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { ChamferBox } from '@/components/chamfer-box';
import { DesktopPortal } from '@/components/desktop-portal';
import { Body, Display, DmRune, Rune } from '@/constants/theme';
import { useDesktop } from '@/hooks/use-desktop';
import { FAVORITES_CATEGORY } from '@/lib/favorites';
import { playSfx } from '@/lib/sfx';
import type { CardCategory, CardItem } from '../card-data';
import { useCarousel } from '../carousel-context';
import { Card, CardThumb } from '../components/card';
import { type CornerTone, EnabledCorner } from '../components/enabled-corner';
import { TokenBoard } from '../components/card-token-board';
import { BakedTokenLayer, type PlacedToken } from '../components/card-tokens';
import { TraitCrossOut } from '../components/trait-cross-out';
import { catalogIdOf } from '@/features/cards/card-effects';
import { TOKEN_COLORS } from '../components/card-tokens-data';
import { CategoryGlyph } from './deck-toggle-icon';
import { SortPanel } from './sort-panel';
import type { CharacterFile } from '@/lib/character-file';

/**
 * The desktop card table (v0.44.0).
 *
 * On a phone the hand is a carousel under the sheet. On a desktop the sheet keeps its port on the left and
 * the cards get the rest of the window: a deck rail beside the port, ONE focus slot, and the hand fanned along
 * the bottom edge. It reads and writes the same carousel context the phone hand does, so equipping, modifiers,
 * numbers, class expansion and decks all go through the code paths they always have.
 *
 * The exchange is the point of this file. Every card is ONE element that stays mounted for as long as its
 * deck is in hand; focusing a card only changes the TARGET each element animates to. So a card picked while it
 * is still lifting from a hover leaves from where it is drawn, the card it replaces travels back into the gap
 * it left, and the rest of the hand slides to make room, all in the same motion. Nothing is torn down.
 */

/** Cards are authored at the phone's card size and scaled; forged and live cards are laid out for it. */
const CW = 230;
const CH = 322;
const RAIL_W = 206;
const NO_CARDS: CardItem[] = [];
const MOVE_MS = 380;
/** The token board's box: the phone's width, so its drawer lays out exactly as it does there. */
const TOKEN_BOX_W = 412;
/** The token drawer's dice list, measured: two rows of die and label, padding and border, plus a margin. */
const DIE_MENU_H = 140;
const EASE = Easing.bezier(0.16, 1, 0.3, 1);

function cornerTone(ref: string, states: { permanent: Set<string>; modsOff: Set<string> }): CornerTone {
  if (states.modsOff.has(ref)) return 'muted';
  if (states.permanent.has(ref)) return 'permanent';
  return 'on';
}

interface Target {
  x: number; // centre, table px
  y: number;
  w: number; // drawn width
  z: number;
  /** The share of the card's width that takes the pointer: the strip a neighbour does not cover. */
  hit: number;
  /** Under the pointer the face (never the hitbox) grows to this, in table px from the card's top-left. */
  lift?: { zoom: number; dx: number; dy: number };
}

export function DesktopTable({ canInspect, sortFile, onSortOpen, onEditCard, editableIds, overlay: overlayProp, backRef, onManage, onExit }: { canInspect: boolean; sortFile?: CharacterFile; onSortOpen?: (open: boolean) => void; onEditCard: (id: string) => void; editableIds: Set<string>; overlay: boolean; backRef: React.MutableRefObject<(() => boolean) | null>; onManage: () => void; onExit: () => void }) {
  const desktop = useDesktop();
  const { width: winW, height: winH } = useWindowDimensions();
  const ctx = useCarousel();
  const { decks, category } = ctx;
  const deck = decks[category] ?? NO_CARDS;
  const reduced = useReducedMotion();

  const [focusId, setFocusId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [pages, setPages] = useState<Record<string, number>>({});
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  // The phone's Sort, for a whole deck: it opens in the side slot and the table waits behind it like any panel.
  const [sorting, setSorting] = useState(false);
  const overlay = overlayProp || sorting;
  // The sheet holds its port still while Sort is open, as it does behind every other panel.
  useEffect(() => { onSortOpen?.(sorting); }, [sorting, onSortOpen]);

  // A new deck starts with nothing in focus; a focused card that left the deck (moved, deleted) drops focus.
  const endFocus = useRef(ctx.endCardFocus);
  endFocus.current = ctx.endCardFocus;
  useEffect(() => { endFocus.current(); setFocusId(null); setHoverId(null); setMenu(null); }, [category]);
  useEffect(() => () => endFocus.current(), []); // leaving the desktop layout ends a streak too
  useEffect(() => { if (focusId && !deck.some((c) => c.id === focusId)) { endFocus.current(); setFocusId(null); } }, [deck, focusId]);

  const port = desktop?.port;
  const tableW = Math.max(0, winW - (port ? port.left + port.width : 0));
  const tableH = winH;
  const areaL = RAIL_W;
  const areaW = Math.max(200, tableW - RAIL_W);
  const cx = areaL + areaW / 2;
  const railTop = port ? port.top + 200 * port.scale : 120;
  const railMaxH = Math.max(120, tableH - 24 - railTop);
  // The demo's table (v0.45.0, owner): one straight row along the bottom, smaller while a card is in focus, and
  // the focused card centred above it with its controls over it.
  // A big deck keeps readable cards and overlaps them more, instead of shrinking them to fit side by side.
  const handSize = Math.round(Math.min(270, tableH * 0.29, Math.max(Math.min(170, tableH * 0.2), (areaW - 32) / (1 + 0.82 * Math.max(0, deck.length - 1)))));
  const handW = focusId ? Math.min(handSize * 0.75, tableH * 0.15, areaW * 0.22) : handSize;
  const handTop = tableH - 30 - handSize * 0.7 - handW * 0.7;
  const [ctrlH, setCtrlH] = useState(52);
  const focusW = Math.round(Math.min(405, areaW * 0.74, tableH * 0.47, Math.max(100, (handTop - ctrlH - 60) / 1.4)));
  const focusTop = Math.max(ctrlH + 36, (handTop - focusW * 1.4 + 64) / 2);

  const hand = useMemo(() => deck.filter((c) => c.id !== focusId), [deck, focusId]);
  // Each card's hitbox is fixed: the strip of it its right-hand neighbour leaves showing (all of the last one).
  // Hover only grows the face, from its bottom edge, so the pointer never chases a card that moved under it.
  const targets = useMemo(() => {
    const t: Record<string, Target> = {};
    const n = hand.length, w = handW;
    const step = n > 1 ? Math.max(0, Math.min(w * (focusId ? 0.7 : 0.82), (areaW - w - 32) / (n - 1))) : 0;
    const shown = Math.min(370, areaW - 20, (handTop + w * 1.4 - 12) / 1.4);
    hand.forEach((c, i) => {
      const left = areaL + (areaW - w) / 2 + (i - (n - 1) / 2) * step;
      const zoomLeft = Math.max(areaL + 10, Math.min(areaL + areaW - shown - 10, left + (w - shown) / 2));
      t[c.id] = { x: left + w / 2, y: handTop + w * 0.7, w, z: 10 + i, hit: i === n - 1 ? 1 : step / w, lift: { zoom: shown / w, dx: zoomLeft - left, dy: (w - shown) * 1.4 } };
    });
    if (focusId) t[focusId] = { x: cx, y: focusTop + (focusW * 1.4) / 2, w: focusW, z: 300, hit: 1 };
    return t;
  }, [hand, focusId, cx, areaL, areaW, handW, handTop, focusTop, focusW]);

  const focus = useCallback((id: string) => {
    if (id === focusId) return;
    // The same sound whether a card is picked from the hand or stepped to with the keys (owner).
    playSfx('cardFullscreenEnter');
    if (focusId) ctx.endCardFocus(); // a different card takes the slot: the override streak ends, as on the phone
    setHoverId(null);
    setFocusId(id);
  }, [focusId, ctx]);
  // Reorder (the phone's Edit Mode drag): the focused card moves one place, persisted through the same path.
  const canReorder = !!ctx.onReorderCards && category !== FAVORITES_CATEGORY && deck.length > 1;
  const moveFocused = useCallback((dir: -1 | 1) => {
    const ids = deck.map((c) => c.id);
    const at = focusId ? ids.indexOf(focusId) : -1;
    const to = at + dir;
    if (at < 0 || to < 0 || to >= ids.length || !ctx.onReorderCards) return;
    [ids[at], ids[to]] = [ids[to], ids[at]];
    playSfx('cardDragEnd');
    ctx.onReorderCards([ids[to]], category, ids);
  }, [deck, focusId, ctx, category]);
  const release = useCallback(() => {
    if (!focusId) return;
    playSfx('transitionIconFilled'); // the phone's leave-fullscreen sound
    ctx.endCardFocus(); // leaving the slot ends a domain-cap override streak, as leaving fullscreen does
    setFocusId(null);
  }, [focusId, ctx]);

  const tokenDismiss = useRef<(() => boolean) | null>(null);
  const focusRef = useRef(focusId);
  focusRef.current = focusId;
  const onCardPress = useCallback((id: string, live: boolean) => {
    if (id !== focusRef.current) focus(id);
    else if (!live) release();
  }, [focus, release]);
  const onCardHover = useCallback((id: string, on: boolean) => {
    if (id === focusRef.current) return;
    setHoverId((h) => (on ? id : h === id ? null : h));
  }, []);
  // A panel opening (from the sheet or the rail) closes the card menu, and the whole table goes inert behind it:
  // no clicks, no Tab stops, as the sheet is behind a phone panel.
  useEffect(() => { if (overlay) setMenu(null); }, [overlay]);
  useLayoutEffect(() => {
    const host = desktop?.tableHost;
    if (!host) return;
    if (overlay) host.setAttribute('inert', ''); else host.removeAttribute('inert');
    return () => host.removeAttribute('inert');
  }, [overlay, desktop?.tableHost]);
  // Back (browser button or Alt+Left) returns the focused card before the sheet offers to leave.
  useEffect(() => {
    backRef.current = () => {
      if (keyRef.current.menu) { playSfx('floatMenuClose'); setMenu(null); return true; }
      if (tokenDismiss.current?.()) return true;
      if (!focusRef.current) return false;
      release();
      return true;
    };
    return () => { backRef.current = null; };
  }, [backRef, release]);

  // Keys (web): A/D or arrows walk the deck through the focus slot, Q/E or 1-9 change deck, Space equips,
  // Esc returns the focused card. Off while a panel is open or a field has focus.
  const keyState = { deck, focusId, overlay, menu, ring: ctx.ring };
  const moveRef = useRef<(dir: -1 | 1) => void>(() => {});
  moveRef.current = canReorder ? moveFocused : () => {};
  const keyRef = useRef(keyState);
  keyRef.current = keyState;
  useEffect(() => {
    if (!desktop || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      const k = keyRef.current;
      if (k.overlay || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA)$/.test((e.target as HTMLElement)?.tagName ?? '')) return;
      const key = e.key.toLowerCase();
      const ids = k.deck.map((c) => c.id), at = k.focusId ? ids.indexOf(k.focusId) : -1;
      if (key === 'escape') { if (k.menu) { playSfx('floatMenuClose'); setMenu(null); } else if (!tokenDismiss.current?.()) release(); return; }
      if (k.menu) return; // the menu owns the keys while it is open
      if (key === '[' || key === ']') { e.preventDefault(); moveRef.current(key === ']' ? 1 : -1); return; }
      const stride = e.shiftKey ? 2 : 1; // Shift moves two at a time, as the keys page teaches
      if ((key === 'arrowright' || key === 'd') && ids.length) { e.preventDefault(); focus(ids[at < 0 ? 0 : (at + stride) % ids.length]); return; }
      if ((key === 'arrowleft' || key === 'a') && ids.length) { e.preventDefault(); focus(ids[at < 0 ? ids.length - 1 : (at - stride + ids.length * 2) % ids.length]); return; }
      // The provider plays the deck-switch sound itself.
      if (key === 'q' || key === 'e') { ctx.cycleCategory(key === 'q' ? -1 : 1); return; }
      if (/^[1-9]$/.test(key)) { const c = k.ring[+key - 1]; if (c) ctx.setCategory(c); return; }
      if (key === ' ' && k.focusId) { e.preventDefault(); ctx.toggleCard(k.focusId); }
    };
    // Capture phase: a Tab-focused card button would otherwise take Space (as a press) before this sees it.
    // Space equips the focused card; on a card that is not in focus yet, Space brings it in, like Enter.
    const onSpace = (e: KeyboardEvent) => {
      if (e.key !== ' ' || keyRef.current.overlay || keyRef.current.menu) return;
      // Only the card's own button: a field or stepper inside a live card (a tracker's name, a summoner's
      // counter) keeps its Space.
      const card = (e.target as HTMLElement)?.parentElement as HTMLElement | null;
      if (!card?.dataset?.cardId) return;
      e.preventDefault();
      e.stopPropagation();
      const id = card.dataset.cardId!;
      if (id === keyRef.current.focusId) ctx.toggleCard(id); else focus(id);
    };
    document.addEventListener('keydown', onSpace, true);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onSpace, true); document.removeEventListener('keydown', onKey); };
  }, [desktop, focus, release, ctx]);
  // Right-click a card: the phone's hold wheel, as a menu at the pointer.
  const tableHost = desktop?.tableHost ?? null;
  useEffect(() => {
    if (!tableHost) return;
    const onMenu = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest?.('[data-card-id]') as HTMLElement | null;
      if (!el) return;
      e.preventDefault();
      const r = tableHost.getBoundingClientRect();
      playSfx('floatMenuOpen');
      setMenu({ id: el.dataset.cardId!, x: e.clientX - r.left, y: e.clientY - r.top });
    };
    tableHost.addEventListener('contextmenu', onMenu);
    return () => tableHost.removeEventListener('contextmenu', onMenu);
  }, [tableHost]);

  const focused = focusId ? deck.find((c) => c.id === focusId) ?? null : null;
  // Tokens arrive once the focused card has SETTLED in the slot, as the phone's board waits for the fullscreen card.
  const [tokensFor, setTokensFor] = useState<string | null>(null);
  useEffect(() => {
    setTokensFor(null);
    if (!focusId) return;
    const t = setTimeout(() => setTokensFor(focusId), reduced ? 0 : MOVE_MS);
    return () => clearTimeout(t);
  }, [focusId, reduced]);
  // Keyed by the card's REF, so every copy (Favorites included) shares one board, as on the phone.
  const tokenKey = focused ? focused.ref ?? focused.id : null;
  const drawerTop = focusTop + focusW * 1.4 + 10; // under the focused card, between it and the hand
  const onPlaceToken = useCallback((t: PlacedToken) => { if (tokenKey) ctx.placeToken(tokenKey, t); }, [tokenKey, ctx]);
  const onRemoveToken = useCallback((id: string) => { if (tokenKey) ctx.removeToken(tokenKey, id); }, [tokenKey, ctx]);
  const onUpdateToken = useCallback((id: string, patch: Partial<PlacedToken>) => { if (tokenKey) ctx.updateToken(tokenKey, id, patch); }, [tokenKey, ctx]);

  if (!desktop) return null;

  return (
    <DesktopPortal to="table">
      <View {...coachTarget('sheet-table')} style={{ position: 'absolute', left: 0, top: 0, width: tableW, height: tableH, overflow: 'hidden' }}>
        <TableMotes />
        {/* Empty table: a click there puts the focused card back in the hand. Cards, controls and the rail sit above it. */}
        <Pressable onPress={release} accessible={false} style={{ position: 'absolute', left: 0, top: 0, width: tableW, height: tableH, cursor: 'default' } as never} />
        <DeckRail top={railTop} maxH={railMaxH} onManage={onManage} onSort={canReorder ? () => { playSfx('floatMenuOpen'); setSorting(true); } : undefined} onExit={onExit} />
        {sorting ? (
          <DesktopPortal to="side" priority="dialog" onDismiss={() => setSorting(false)}>
            <SortPanel
              file={sortFile}
              ids={deck.map((c) => c.id)}
              onApply={(ordered, moved) => { playSfx('cardDragEnd'); ctx.onReorderCards?.(moved, category, ordered); }}
              onClose={() => setSorting(false)}
            />
          </DesktopPortal>
        ) : null}
        {deck.length === 0 ? (
          <Text style={{ position: 'absolute', left: areaL, width: areaW, top: tableH * 0.42, textAlign: 'center', color: Rune.muted, fontFamily: Body.medium, fontSize: 14 }}>Nothing in this deck yet. Add a card from the sheet.</Text>
        ) : null}
        {!focused && deck.length ? (
          <Text style={{ position: 'absolute', left: areaL, width: areaW, top: Math.max(38, handTop * 0.55), textAlign: 'center', color: Rune.muted, fontFamily: Body.medium, fontSize: 14 }}>Pick a card from your hand to bring it into focus.</Text>
        ) : null}
        {deck.map((item) => (
          <DeskCard
            key={item.id}
            item={item}
            target={targets[item.id]}
            hovered={item.id === hoverId}
            focused={item.id === focusId}
            page={Math.min(pages[item.id] ?? 0, Math.max(0, (item.faces?.length ?? 1) - 1))}
            enabled={ctx.enabledIds.has(item.ref ?? item.id)}
            tone={cornerTone(item.ref ?? item.id, ctx.cardStates)}
            // The phone's baked layer, until the focused card's board takes over; keyed by ref, as the board is.
            tokens={item.id === tokensFor ? undefined : ctx.cardTokens[item.ref ?? item.id] ?? ctx.cardTokens[item.id]}
            crossTrait={ctx.crossOuts[item.id]}
            reduced={reduced}
            onPress={onCardPress}
            onHover={onCardHover}
          />
        ))}
        {focused ? (
          <FocusControls
            item={focused}
            bottom={tableH - focusTop + 12}
            maxW={areaW - 24}
            onHeight={setCtrlH}
            canInspect={canInspect}
            cx={cx}
            page={pages[focused.id] ?? 0}
            onPage={(p) => setPages((m) => ({ ...m, [focused.id]: p }))}
            onEdit={editableIds.has(focused.id) ? () => onEditCard(focused.id) : undefined}
            position={canReorder ? { at: deck.findIndex((c) => c.id === focused.id), of: deck.length } : undefined}
            onMove={canReorder ? moveFocused : undefined}
            onRelease={release}
          />
        ) : null}
        {focused && tokenKey && tokensFor === focused.id ? (
          // The phone's token board over the focused card; its drawer sits under the focus controls, clear of the art.
          <Animated.View pointerEvents="box-none" entering={reduced ? undefined : FadeIn.duration(200)} style={{ position: 'absolute', left: cx - TOKEN_BOX_W / 2, top: 0, width: TOKEN_BOX_W, height: tableH, zIndex: 700 }}>
            <TokenBoard
              cardRect={{ left: (TOKEN_BOX_W - focusW) / 2, top: focusTop, width: focusW, height: focusW * 1.4 }}
              width={TOKEN_BOX_W}
              height={tableH}
              tokens={ctx.cardTokens[tokenKey] ?? ctx.cardTokens[focused.id] ?? []}
              drawerColor={ctx.tokenColor || TOKEN_COLORS[0]}
              scale={1}
              drawerTop={drawerTop}
              dieMenuUp={drawerTop + 60 + 6 + DIE_MENU_H > tableH}
              dismissRef={tokenDismiss}
              onPlace={onPlaceToken}
              onRemove={onRemoveToken}
              onUpdate={onUpdateToken}
              onSetDrawerColor={ctx.setTokenColor}
            />
          </Animated.View>
        ) : null}
        {/* A panel is open in the side slot: the table waits, as the sheet does behind a phone panel. */}
        {overlay ? <View style={{ position: 'absolute', left: 0, top: 0, width: tableW, height: tableH, zIndex: 800, backgroundColor: 'rgba(6,8,13,0.45)' }} /> : null}
        {menu && !overlay ? <CardMenu id={menu.id} x={menu.x} y={menu.y} tableW={tableW} tableH={tableH} onFocus={() => focus(menu.id)} onClose={() => setMenu(null)} /> : null}
      </View>
    </DesktopPortal>
  );
}

/** What holding a card does on the phone, at the pointer. Every row runs the same handler the wheel runs. */
function CardMenu({ id, x, y, tableW, tableH, onFocus, onClose }: { id: string; x: number; y: number; tableW: number; tableH: number; onFocus: () => void; onClose: () => void }) {
  const ctx = useCarousel();
  const item = (ctx.decks[ctx.category] ?? []).find((c) => c.id === id);
  if (!item) return null;
  const ref = item.ref ?? item.id;
  const fav = ctx.isFavorited(id);
  const run = (fn: () => void) => () => { onClose(); fn(); };
  // Inside Favorites the cards are mirror copies, and the phone's wheel offers them one thing: leaving Favorites.
  // Everywhere else `favorite` is the toggle for a source card; `unfavorite` only ever takes a mirror id.
  const mirror = ctx.category === FAVORITES_CATEGORY;
  const rows: { label: string; onPress: () => void; hidden?: boolean; danger?: boolean }[] = mirror
    ? [
        { label: 'Bring into focus', onPress: run(onFocus) },
        { label: 'Remove from Favorites', onPress: run(() => ctx.cardAction('unfavorite', [id])) },
      ]
    : [
        { label: 'Bring into focus', onPress: run(onFocus) },
        { label: ctx.enabledIds.has(ref) ? 'Unequip' : 'Equip', onPress: run(() => ctx.toggleCard(id)), hidden: ctx.cardStates.permanent.has(ref) },
        { label: fav ? 'Remove from Favorites' : 'Add to Favorites', onPress: run(() => ctx.cardAction('favorite', [id])) },
        { label: 'Move to deck', onPress: run(() => ctx.cardAction('move', [id])) },
        { label: ctx.nfcAvailable ? 'Share' : 'Export', onPress: run(() => ctx.cardAction('nfc', [id])) },
        { label: 'Delete', onPress: run(() => ctx.cardAction('delete', [id])), danger: true },
      ];
  const shown = rows.filter((r) => !r.hidden);
  const W = 220, H = shown.length * 38 + 14;
  return (
    <>
      <Pressable style={{ position: 'absolute', left: 0, top: 0, width: tableW, height: tableH, zIndex: 900 }} onPress={() => { playSfx('floatMenuClose'); onClose(); }} accessibilityLabel="Close the card menu" />
      <ChamferBox chamfer={9} fill={DmRune.panelLit} stroke={Rune.goldEdge} strokeWidth={1.4} style={{ position: 'absolute', zIndex: 901, left: Math.min(x, tableW - W - 8), top: Math.min(y, tableH - H - 8), width: W, padding: 7 }}>
        {shown.map((r) => <MenuRow key={r.label} label={r.label} danger={r.danger} onPress={r.onPress} />)}
      </ChamferBox>
    </>
  );
}

function MenuRow({ label, danger, onPress }: { label: string; danger?: boolean; onPress: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <Pressable onPress={onPress} onHoverIn={() => { setHover(true); playSfx('floatMenuHighlight', { volume: 0.4 }); }} onHoverOut={() => setHover(false)} accessibilityRole="button" accessibilityLabel={label}
      style={{ height: 38, justifyContent: 'center', paddingHorizontal: 12, backgroundColor: hover ? (danger ? Rune.red : 'rgba(200,27,24,0.85)') : 'transparent' }}>
      <Text style={{ color: danger && !hover ? '#E2705A' : Rune.ivory, fontFamily: Body.bold, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

/** One card, one element. It never remounts while its deck is up; only its target moves. */
const DeskCard = memo(function DeskCard({ item, target, hovered, focused, page, enabled, tone, tokens, crossTrait, reduced, onPress, onHover }: { item: CardItem; target: Target | undefined; hovered: boolean; focused: boolean; page: number; enabled: boolean; tone: CornerTone; tokens?: PlacedToken[]; crossTrait?: 1 | 2; reduced: boolean; onPress: (id: string, live: boolean) => void; onHover: (id: string, on: boolean) => void }) {
  const t = target ?? { x: 0, y: 2000, w: 1, z: 0, hit: 1 };
  const x = useSharedValue(t.x);
  const y = useSharedValue(t.y + 260); // the first deal rises from below the table
  const s = useSharedValue(t.w / CW);
  useEffect(() => {
    const cfg = { duration: reduced ? 0 : MOVE_MS, easing: EASE };
    x.value = withTiming(t.x, cfg);
    y.value = withTiming(t.y, cfg);
    s.value = withTiming(t.w / CW, cfg);
  }, [t.x, t.y, t.w, reduced, x, y, s]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value - CW / 2 }, { translateY: y.value - CH / 2 }, { scale: s.value }],
  }));
  // The lift, in the card's own (unscaled, centre-origin) space: grow by `zoom` with the bottom edge held.
  const lift = hovered && !focused ? t.lift : undefined;
  const k = t.w / CW;
  const lz = useSharedValue(1), lx = useSharedValue(0), ly = useSharedValue(0);
  useEffect(() => {
    const cfg = { duration: reduced ? 0 : 190, easing: EASE };
    const z = lift?.zoom ?? 1;
    lz.value = withTiming(z, cfg);
    lx.value = withTiming(lift ? lift.dx / k - (CW / 2) * (1 - z) : 0, cfg);
    ly.value = withTiming(lift ? lift.dy / k - (CH / 2) * (1 - z) : 0, cfg);
  }, [lift, k, reduced, lz, lx, ly]);
  const liftStyle = useAnimatedStyle(() => ({ transform: [{ translateX: lx.value }, { translateY: ly.value }, { scale: lz.value }] }));
  const face = item.faces?.[page];
  // A hovered card shows its full art too, and keeps it once loaded so the next hover is sharp at once.
  const [seen, setSeen] = useState(false);
  useEffect(() => { if (lift) setSeen(true); }, [lift]);
  const sharp = focused || !!lift || seen;
  return (
    <Animated.View {...({ dataSet: { cardId: item.id } } as object)} pointerEvents="box-none" style={[{ position: 'absolute', left: 0, top: 0, width: CW, height: CH, zIndex: lift ? 500 : t.z }, style]}>
      <Pressable
        onPress={() => onPress(item.id, !!(item.live && !face))}
        onHoverIn={() => onHover(item.id, true)}
        onHoverOut={() => onHover(item.id, false)}
        accessibilityRole="button"
        accessibilityLabel={!focused ? 'Bring this card into focus' : item.live && !face ? 'Focused card' : 'Focused card. Click to return it to your hand'}
        style={{ width: CW * t.hit, height: CH, cursor: 'pointer' } as never}>
        <Animated.View pointerEvents={focused ? 'box-none' : 'none'} style={[{ position: 'absolute', left: 0, top: 0, width: CW, height: CH }, liftStyle]}>
        {/* Faces win over a live body, as in the phone hand: a class card carries both on web. */}
        {face ? (
          face.custom ?? <Layered item={{ id: `${item.id}#${page}`, source: face.source!, thumb: face.thumb! }} full={sharp} />
        ) : item.live ? (
          <View style={{ width: CW, height: CH }} pointerEvents={focused && item.interactive ? 'auto' : 'none'}>{item.live}</View>
        ) : (
          <Layered item={item} full={sharp} />
        )}
        {tokens?.length ? <View style={StyleSheet.absoluteFill} pointerEvents="none"><BakedTokenLayer tokens={tokens} cardW={CW} cardH={CH} /></View> : null}
        {enabled ? <EnabledCorner width={CW} height={CH} tone={tone} /> : null}
        {crossTrait ? <TraitCrossOut width={CW} height={CH} catalogId={catalogIdOf(item.id)} crossedTrait={crossTrait} /> : null}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
});

/** The thumb always, the full art over it once focused: no blank frame while the full image decodes mid-flight. */
function Layered({ item, full }: { item: { id: string; source: CardItem['source']; thumb: CardItem['thumb'] }; full: boolean }) {
  return (
    <View style={{ width: CW, height: CH, shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } }}>
      <CardThumb item={item as CardItem} />
      {full ? <View style={{ position: 'absolute', left: 0, top: 0, width: CW, height: CH }}><Card item={item as CardItem} width={CW} height={CH} /></View> : null}
    </View>
  );
}

/** The controls over the focused card: the phone's focused-card row, plus what a hold or a page swipe does there. */
function FocusControls({ item, bottom, cx, maxW, onHeight, canInspect, page, onPage, onEdit, onRelease, position, onMove }: { maxW: number; onHeight: (h: number) => void; canInspect: boolean; item: CardItem; bottom: number; cx: number; page: number; onPage: (p: number) => void; onEdit?: () => void; onRelease: () => void; position?: { at: number; of: number }; onMove?: (dir: -1 | 1) => void }) {
  const ctx = useCarousel();
  const ref = item.ref ?? item.id;
  const on = ctx.enabledIds.has(ref);
  const permanent = ctx.cardStates.permanent.has(ref);
  const faces = item.faces?.length ?? 0;
  const buttons: { label: string; onPress: () => void; active?: boolean; hidden?: boolean }[] = [
    { label: on ? 'Equipped' : 'Equip', onPress: () => ctx.toggleCard(item.id), active: on, hidden: permanent },
    { label: 'Modifiers', onPress: () => ctx.showCardInfo(item.id), hidden: !canInspect },
    { label: ctx.cardStates.modsOff.has(ref) ? 'Toggle on' : 'Toggle', onPress: () => ctx.toggleCardModifiers(item.id), hidden: !ctx.cardStates.toggleable.has(ref) || !(on || permanent) }, // the phone's rule: only on a card that applies
    { label: '#', onPress: () => ctx.editNumberInput(item.id), hidden: !ctx.cardStates.numberInput.has(ref) },
    { label: 'Expand', onPress: () => ctx.expandClassCard(item.id), hidden: !ctx.cardStates.expandable.has(ref) },
    { label: 'Edit', onPress: () => onEdit?.(), hidden: !onEdit },
    { label: 'Back to hand', onPress: onRelease },
  ];
  const shown = buttons.filter((b) => !b.hidden);
  return (
    <View onLayout={(e) => onHeight(Math.ceil(e.nativeEvent.layout.height))} style={{ position: 'absolute', bottom, left: cx - Math.min(720, maxW) / 2, width: Math.min(720, maxW), alignItems: 'center', gap: 10, zIndex: 400 }}>
      {faces > 1 ? (
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <DeskButton label="Previous page" glyph="‹" onPress={() => { playSfx('transitionStart'); onPage((page - 1 + faces) % faces); }} />
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {Array.from({ length: faces }, (_, i) => <View key={i} style={{ width: 7, height: 7, transform: [{ rotate: '45deg' }], backgroundColor: i === page ? Rune.red : 'rgba(147,142,136,0.55)' }} />)}
          </View>
          <DeskButton label="Next page" glyph="›" onPress={() => { playSfx('transitionStart'); onPage((page + 1) % faces); }} />
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, alignItems: 'center' }}>
        {onMove && position && position.at > 0 ? <DeskButton label="Move left in the deck" glyph="←" onPress={() => onMove(-1)} /> : null}
        {shown.map((b) => <DeskButton key={b.label} label={b.label} onPress={b.onPress} active={b.active} />)}
        {onMove && position && position.at < position.of - 1 ? <DeskButton label="Move right in the deck" glyph="→" onPress={() => onMove(1)} /> : null}
      </View>
      {position ? <Text style={{ color: Rune.muted, fontFamily: Body.medium, fontSize: 11, letterSpacing: 0.6 }}>{`Card ${position.at + 1} of ${position.of}. The [ and ] keys move it.`}</Text> : null}
    </View>
  );
}

function DeskButton({ label, glyph, onPress, active }: { label: string; glyph?: string; onPress: () => void; active?: boolean }) {
  const [hover, setHover] = useState(false);
  return (
    <Pressable onPress={onPress} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)} accessibilityRole="button" accessibilityLabel={label}>
      {({ pressed }) => (
        <ChamferBox chamfer={7} fill={active ? '#3a0d0c' : hover ? DmRune.panelLit : Rune.ink} stroke={active ? Rune.red : hover ? Rune.goldBright : Rune.goldEdge} strokeWidth={1.4}
          style={{ height: 40, minWidth: glyph ? 40 : undefined, paddingHorizontal: glyph ? 0 : 16, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.96 : 1 }] }}>
          <Text style={{ color: active || hover ? Rune.ivory : Rune.goldText, fontFamily: Body.bold, fontSize: glyph ? 20 : 12, letterSpacing: glyph ? 0 : 1.2, textTransform: 'uppercase' }}>{glyph ?? label}</Text>
        </ChamferBox>
      )}
    </Pressable>
  );
}

/** Decks as chips beside the port. One red marker slides between them; nothing blinks on and off. */
function DeckRail({ top, maxH, onManage, onSort, onExit }: { top: number; maxH: number; onManage: () => void; onSort?: () => void; onExit: () => void }) {
  const ctx = useCarousel();
  const { ring, category, categoryMeta } = ctx;
  const decks: CardCategory[] = useMemo(() => [...ring.filter((c) => c !== FAVORITES_CATEGORY), FAVORITES_CATEGORY], [ring]);
  const CHIP = 46, GAP = 8;
  const index = Math.max(0, decks.indexOf(category));
  const markY = useSharedValue(index * (CHIP + GAP));
  useEffect(() => { markY.value = withTiming(index * (CHIP + GAP) + (decks[index] === FAVORITES_CATEGORY ? 10 : 0), { duration: 340, easing: EASE }); }, [index, decks, markY]);
  const markStyle = useAnimatedStyle(() => ({ transform: [{ translateY: markY.value }] }));
  // One dispatch per pick; the provider plays the switch sound. Leaving Favorites goes straight to the deck picked
  // (setCategory ends the detour) instead of animating back to where Favorites was opened from first.
  const pick = (c: CardCategory) => {
    if (c === category) return;
    if (c === FAVORITES_CATEGORY) ctx.openFavorites();
    else ctx.setCategory(c);
  };
  return (
    <View {...coachTarget('sheet-decks')} style={{ position: 'absolute', left: 14, top, width: RAIL_W - 28, maxHeight: maxH }}>
      <ScrollView style={{ flexGrow: 0 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingRight: 8 }}>
      <Animated.View style={[{ position: 'absolute', left: 6, right: -6, top: 0, height: CHIP }, markStyle]} pointerEvents="none">
        <ChamferBox chamfer={10} fill={Rune.red} style={{ flex: 1 }}>
          <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: Rune.goldBright }} />
        </ChamferBox>
      </Animated.View>
      {decks.map((c, i) => (
        <DeckChip key={c} label={categoryMeta[c]?.label ?? c} active={c === category} count={ctx.decks[c]?.length ?? 0} onPress={() => pick(c)} style={{ marginTop: i === 0 ? 0 : c === FAVORITES_CATEGORY ? GAP + 10 : GAP }}>
          <CategoryGlyph category={c} meta={categoryMeta[c]} />
        </DeckChip>
      ))}
      </ScrollView>
      <View style={{ marginTop: 18, gap: 6 }}>
        <RailLink label="Manage cards" onPress={onManage} />
        {onSort ? <RailLink label="Sort this deck" onPress={onSort} /> : null}
        <RailLink label="Back to characters" onPress={onExit} />
      </View>
    </View>
  );
}

function RailLink({ label, onPress }: { label: string; onPress: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <Pressable onPress={() => { playSfx('buttonTap'); onPress(); }} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)} accessibilityRole="button" accessibilityLabel={label} style={{ paddingVertical: 6, paddingLeft: 10 }}>
      <Text style={{ color: hover ? Rune.ivory : Rune.muted, fontFamily: Body.bold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' }}>{label}</Text>
    </Pressable>
  );
}

function DeckChip({ label, active, count, onPress, style, children }: { label: string; active: boolean; count: number; onPress: () => void; style?: object; children: React.ReactNode }) {
  const [hover, setHover] = useState(false);
  const nudge = useSharedValue(0);
  const pop = useSharedValue(1);
  useEffect(() => { nudge.value = withTiming(active ? 8 : hover ? 4 : 0, { duration: 220, easing: EASE }); }, [active, hover, nudge]);
  useEffect(() => { if (active) { pop.value = 0.72; pop.value = withTiming(1, { duration: 420, easing: EASE }); } }, [active, pop]);
  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: nudge.value }] }));
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value * (hover && !active ? 1.12 : 1) }, { rotate: `${hover && !active ? -6 : 0}deg` }] }));
  return (
    <Pressable onPress={onPress} onHoverIn={() => { setHover(true); if (!active) playSfx('floatMenuHighlight', { volume: 0.4 }); }} onHoverOut={() => setHover(false)} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={`${label}, ${count} cards`} style={style}>
      <Animated.View style={rowStyle}>
        <ChamferBox chamfer={9} fill={active ? 'transparent' : hover ? DmRune.panelLit : Rune.panel} stroke={active ? 'transparent' : hover ? Rune.goldEdge : 'rgba(218,162,73,0.5)'} strokeWidth={1.4}
          style={{ height: 46, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 8, paddingRight: 14 }}>
          <Animated.View style={[{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', transform: [{ scale: 0.7 }] }, iconStyle]}>{children}</Animated.View>
          <Text numberOfLines={1} style={{ flex: 1, color: active || hover ? Rune.ivory : Rune.goldText, fontFamily: Display.bold, fontSize: 12, letterSpacing: 0.9, textTransform: 'uppercase' }}>{label}</Text>
          <Text style={{ color: active ? 'rgba(253,252,247,0.8)' : Rune.muted, fontFamily: Body.bold, fontSize: 12 }}>{count}</Text>
        </ChamferBox>
      </Animated.View>
    </Pressable>
  );
}

