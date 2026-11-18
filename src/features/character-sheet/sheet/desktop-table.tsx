import { Image } from 'expo-image';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

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
import { CategoryGlyph } from './deck-toggle-icon';

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
const HAND_SINK = 0.42; // how much of a hand card hangs below the window edge
const MOVE_MS = 380;
const EASE = Easing.bezier(0.16, 1, 0.3, 1);
const GEAR = require('../../../../assets/art/gears/raster/U2.webp');
const GEAR_BACK = require('../../../../assets/art/gears/raster/U3.webp');

function cornerTone(ref: string, states: { permanent: Set<string>; modsOff: Set<string> }): CornerTone {
  if (states.modsOff.has(ref)) return 'muted';
  if (states.permanent.has(ref)) return 'permanent';
  return 'on';
}

interface Target {
  x: number; // centre, table px
  y: number;
  w: number; // drawn width
  r: number; // degrees
  z: number;
}

export function DesktopTable({ onEditCard, editableIds, overlay }: { onEditCard: (id: string) => void; editableIds: Set<string>; overlay: boolean }) {
  const desktop = useDesktop();
  const { width: winW, height: winH } = useWindowDimensions();
  const ctx = useCarousel();
  const { decks, category } = ctx;
  const deck = decks[category] ?? [];
  const reduced = useReducedMotion();

  const [focusId, setFocusId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [pages, setPages] = useState<Record<string, number>>({});
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  // A new deck starts with nothing in focus; a focused card that left the deck (moved, deleted) drops focus.
  useEffect(() => { setFocusId(null); setHoverId(null); setMenu(null); }, [category]);
  useEffect(() => { if (focusId && !deck.some((c) => c.id === focusId)) setFocusId(null); }, [deck, focusId]);

  const port = desktop?.port;
  const tableW = Math.max(0, winW - (port ? port.left + port.width : 0));
  const tableH = winH;
  const areaL = RAIL_W;
  const areaW = Math.max(200, tableW - RAIL_W);
  const cx = areaL + areaW / 2;
  const handW = Math.round(Math.min(186, Math.max(136, areaW * 0.15)));
  const handZone = handW * 1.4 * (1 - HAND_SINK) + 70;
  const focusW = Math.round(Math.min(390, (tableH - handZone - 150) / 1.4));

  const hand = useMemo(() => deck.filter((c) => c.id !== focusId), [deck, focusId]);
  const targets = useMemo(() => {
    const t: Record<string, Target> = {};
    const n = hand.length, mid = (n - 1) / 2;
    const step = n > 1 ? Math.min(handW * 0.8, (areaW - handW - 120) / (n - 1)) : 0;
    hand.forEach((c, i) => {
      const o = i - mid;
      const lift = c.id === hoverId ? 1 : 0;
      t[c.id] = {
        x: cx + o * step,
        y: tableH + handW * 1.4 * (HAND_SINK - 0.5) + Math.abs(o) ** 1.6 * 3.6 - lift * 74,
        w: handW * (lift ? 1.16 : 1),
        r: lift ? 0 : o * 3.4,
        z: lift ? 200 : 10 + i,
      };
    });
    if (focusId) t[focusId] = { x: cx, y: 36 + (focusW * 1.4) / 2, w: focusW, r: 0, z: 300 };
    return t;
  }, [hand, hoverId, focusId, cx, areaW, handW, tableH, focusW]);

  const focus = useCallback((id: string) => {
    if (id === focusId) return;
    playSfx('cardSelect');
    setHoverId(null);
    setFocusId(id);
  }, [focusId]);
  const release = useCallback(() => {
    if (!focusId) return;
    playSfx('cardDeselect');
    setFocusId(null);
  }, [focusId]);

  // Keys (web): A/D or arrows walk the deck through the focus slot, Q/E or 1-9 change deck, Space equips,
  // Esc returns the focused card. Off while a panel is open or a field has focus.
  const keyState = { deck, focusId, overlay, menu, ring: ctx.ring };
  const keyRef = useRef(keyState);
  keyRef.current = keyState;
  useEffect(() => {
    if (!desktop || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      const k = keyRef.current;
      if (k.overlay || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA)$/.test((e.target as HTMLElement)?.tagName ?? '')) return;
      const key = e.key.toLowerCase();
      const ids = k.deck.map((c) => c.id), at = k.focusId ? ids.indexOf(k.focusId) : -1;
      if (key === 'escape') { if (k.menu) setMenu(null); else release(); return; }
      if ((key === 'arrowright' || key === 'd') && ids.length) { e.preventDefault(); focus(ids[(at + 1) % ids.length]); return; }
      if ((key === 'arrowleft' || key === 'a') && ids.length) { e.preventDefault(); focus(ids[at <= 0 ? ids.length - 1 : at - 1]); return; }
      if (key === 'q' || key === 'e') { playSfx('transitionStart'); ctx.cycleCategory(key === 'q' ? -1 : 1); return; }
      if (/^[1-9]$/.test(key)) { const c = k.ring[+key - 1]; if (c) { playSfx('transitionStart'); ctx.setCategory(c); } return; }
      if (key === ' ' && k.focusId) { e.preventDefault(); ctx.toggleCard(k.focusId); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
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

  if (!desktop) return null;
  const focused = focusId ? deck.find((c) => c.id === focusId) ?? null : null;

  return (
    <DesktopPortal to="table">
      <View style={{ position: 'absolute', left: 0, top: 0, width: tableW, height: tableH, overflow: 'hidden' }}>
        <TableGear category={category} cx={cx} tableH={tableH} handW={handW} reduced={reduced} />
        <DeckRail top={port ? port.top + 200 * port.scale : 120} />
        {deck.length === 0 ? (
          <Text style={{ position: 'absolute', left: areaL, width: areaW, top: tableH * 0.42, textAlign: 'center', color: Rune.muted, fontFamily: Body.medium, fontSize: 14 }}>Nothing in this deck yet. Add a card from the sheet.</Text>
        ) : null}
        {!focused && deck.length ? (
          <Text style={{ position: 'absolute', left: areaL, width: areaW, top: tableH * 0.3, textAlign: 'center', color: Rune.muted, fontFamily: Body.medium, fontSize: 14 }}>Pick a card from your hand to bring it into focus.</Text>
        ) : null}
        {deck.map((item) => (
          <DeskCard
            key={item.id}
            item={item}
            target={targets[item.id]}
            focused={item.id === focusId}
            page={pages[item.id] ?? 0}
            enabled={ctx.enabledIds.has(item.ref ?? item.id)}
            tone={cornerTone(item.ref ?? item.id, ctx.cardStates)}
            reduced={reduced}
            onPress={() => (item.id === focusId ? (item.interactive || item.live ? undefined : release()) : focus(item.id))}
            onHover={(on) => { if (item.id !== focusId) setHoverId((h) => (on ? item.id : h === item.id ? null : h)); }}
          />
        ))}
        {focused ? (
          <FocusControls
            item={focused}
            top={36 + focusW * 1.4 + 18}
            cx={cx}
            page={pages[focused.id] ?? 0}
            onPage={(p) => setPages((m) => ({ ...m, [focused.id]: p }))}
            onEdit={editableIds.has(focused.id) ? () => onEditCard(focused.id) : undefined}
            onRelease={release}
          />
        ) : null}
        {menu ? <CardMenu id={menu.id} x={menu.x} y={menu.y} tableW={tableW} tableH={tableH} onFocus={() => focus(menu.id)} onClose={() => setMenu(null)} /> : null}
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
  const rows: { label: string; onPress: () => void; hidden?: boolean; danger?: boolean }[] = [
    { label: 'Bring into focus', onPress: run(onFocus) },
    { label: ctx.enabledIds.has(ref) ? 'Unequip' : 'Equip', onPress: run(() => ctx.toggleCard(id)), hidden: ctx.cardStates.permanent.has(ref) },
    { label: fav ? 'Remove from Favorites' : 'Add to Favorites', onPress: run(() => ctx.cardAction(fav ? 'unfavorite' : 'favorite', [id])) },
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
    <Pressable onPress={onPress} onHoverIn={() => { setHover(true); playSfx('floatMenuHighlight', { volume: 0.4 }); }} onHoverOut={() => setHover(false)} accessibilityRole="menuitem" accessibilityLabel={label}
      style={{ height: 38, justifyContent: 'center', paddingHorizontal: 12, backgroundColor: hover ? (danger ? Rune.red : 'rgba(200,27,24,0.85)') : 'transparent' }}>
      <Text style={{ color: danger && !hover ? '#E2705A' : Rune.ivory, fontFamily: Body.bold, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

/** One card, one element. It never remounts while its deck is up; only its target moves. */
const DeskCard = memo(function DeskCard({ item, target, focused, page, enabled, tone, reduced, onPress, onHover }: { item: CardItem; target: Target | undefined; focused: boolean; page: number; enabled: boolean; tone: CornerTone; reduced: boolean; onPress: () => void; onHover: (on: boolean) => void }) {
  const t = target ?? { x: 0, y: 2000, w: 1, r: 0, z: 0 };
  const x = useSharedValue(t.x);
  const y = useSharedValue(t.y + 260); // the first deal rises from below the table
  const s = useSharedValue(t.w / CW);
  const r = useSharedValue(t.r);
  useEffect(() => {
    const cfg = { duration: reduced ? 0 : MOVE_MS, easing: EASE };
    x.value = withTiming(t.x, cfg);
    y.value = withTiming(t.y, cfg);
    s.value = withTiming(t.w / CW, cfg);
    r.value = withTiming(t.r, cfg);
  }, [t.x, t.y, t.w, t.r, reduced, x, y, s, r]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value - CW / 2 }, { translateY: y.value - CH / 2 }, { rotate: `${r.value}deg` }, { scale: s.value }],
  }));
  const face = item.faces?.[page];
  return (
    <Animated.View {...({ dataSet: { cardId: item.id } } as object)} style={[{ position: 'absolute', left: 0, top: 0, width: CW, height: CH, zIndex: t.z }, style]}>
      <Pressable
        onPress={onPress}
        onHoverIn={() => onHover(true)}
        onHoverOut={() => onHover(false)}
        accessibilityRole="button"
        accessibilityLabel={focused ? 'Focused card. Click to return it to your hand' : 'Bring this card into focus'}
        style={{ width: CW, height: CH, cursor: 'pointer' } as never}>
        {item.live ? (
          <View style={{ width: CW, height: CH }} pointerEvents={focused && item.interactive ? 'auto' : 'none'}>{item.live}</View>
        ) : face ? (
          face.custom ?? (focused ? <Card item={{ id: `${item.id}#${page}`, source: face.source!, thumb: face.thumb! }} width={CW} height={CH} /> : <CardThumb item={{ id: `${item.id}#${page}`, source: face.source!, thumb: face.thumb! }} />)
        ) : focused ? (
          <Card item={item} width={CW} height={CH} />
        ) : (
          <View style={{ width: CW, height: CH, shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } }}>
            <CardThumb item={item} />
          </View>
        )}
        {enabled ? <EnabledCorner width={CW} height={CH} tone={tone} /> : null}
      </Pressable>
    </Animated.View>
  );
});

/** The controls under the focused card: the phone's focused-card row, plus what a hold or a page swipe does there. */
function FocusControls({ item, top, cx, page, onPage, onEdit, onRelease }: { item: CardItem; top: number; cx: number; page: number; onPage: (p: number) => void; onEdit?: () => void; onRelease: () => void }) {
  const ctx = useCarousel();
  const ref = item.ref ?? item.id;
  const on = ctx.enabledIds.has(ref);
  const permanent = ctx.cardStates.permanent.has(ref);
  const faces = item.faces?.length ?? 0;
  const buttons: { label: string; onPress: () => void; active?: boolean; hidden?: boolean }[] = [
    { label: on ? 'Equipped' : 'Equip', onPress: () => ctx.toggleCard(item.id), active: on, hidden: permanent },
    { label: 'Modifiers', onPress: () => ctx.showCardInfo(item.id) },
    { label: ctx.cardStates.modsOff.has(ref) ? 'Toggle on' : 'Toggle', onPress: () => ctx.toggleCardModifiers(item.id), hidden: !ctx.cardStates.toggleable.has(ref) },
    { label: '#', onPress: () => ctx.editNumberInput(item.id), hidden: !ctx.cardStates.numberInput.has(ref) },
    { label: 'Expand', onPress: () => ctx.expandClassCard(item.id), hidden: !ctx.cardStates.expandable.has(ref) },
    { label: 'Edit', onPress: () => onEdit?.(), hidden: !onEdit },
    { label: 'Back to hand', onPress: onRelease },
  ];
  const shown = buttons.filter((b) => !b.hidden);
  return (
    <View style={{ position: 'absolute', top, left: cx - 360, width: 720, alignItems: 'center', gap: 10, zIndex: 400 }}>
      {faces > 1 ? (
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <DeskButton label="Previous page" glyph="‹" onPress={() => { playSfx('transitionStart'); onPage((page - 1 + faces) % faces); }} />
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {Array.from({ length: faces }, (_, i) => <View key={i} style={{ width: 7, height: 7, transform: [{ rotate: '45deg' }], backgroundColor: i === page ? Rune.red : 'rgba(147,142,136,0.55)' }} />)}
          </View>
          <DeskButton label="Next page" glyph="›" onPress={() => { playSfx('transitionStart'); onPage((page + 1) % faces); }} />
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {shown.map((b) => <DeskButton key={b.label} label={b.label} onPress={b.onPress} active={b.active} />)}
      </View>
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
function DeckRail({ top }: { top: number }) {
  const ctx = useCarousel();
  const { ring, category, categoryMeta } = ctx;
  const decks: CardCategory[] = useMemo(() => [...ring.filter((c) => c !== FAVORITES_CATEGORY), FAVORITES_CATEGORY], [ring]);
  const CHIP = 46, GAP = 8;
  const index = Math.max(0, decks.indexOf(category));
  const markY = useSharedValue(index * (CHIP + GAP));
  useEffect(() => { markY.value = withTiming(index * (CHIP + GAP) + (decks[index] === FAVORITES_CATEGORY ? 10 : 0), { duration: 340, easing: EASE }); }, [index, decks, markY]);
  const markStyle = useAnimatedStyle(() => ({ transform: [{ translateY: markY.value }] }));
  const pick = (c: CardCategory) => {
    if (c === category) return;
    playSfx('transitionStart');
    if (c === FAVORITES_CATEGORY || category === FAVORITES_CATEGORY) ctx.openFavorites();
    if (c !== FAVORITES_CATEGORY) ctx.setCategory(c);
  };
  return (
    <View style={{ position: 'absolute', left: 14, top, width: RAIL_W - 28 }}>
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
    </View>
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

/** The golden gear, as ornament: huge, faint, centred on the hand, turning a notch whenever the deck changes. */
function TableGear({ category, cx, tableH, handW, reduced }: { category: CardCategory; cx: number; tableH: number; handW: number; reduced: boolean }) {
  const spin = useSharedValue(0);
  useEffect(() => { spin.value = withTiming(spin.value + 72, { duration: reduced ? 0 : 1100, easing: EASE }); }, [category, spin, reduced]);
  const size = Math.min(tableH * 1.25, 1400);
  const front = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  const back = useAnimatedStyle(() => ({ transform: [{ rotate: `${-spin.value * 0.6}deg` }] }));
  // Its centre sits just below the hand's top edge, so the upper arc rises behind the fanned cards.
  const centreY = tableH - handW * 1.4 * 0.5 + size * 0.18;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}>
      <Animated.View style={[{ position: 'absolute', left: cx - size * 0.58, top: centreY - size * 0.58, width: size * 1.16, height: size * 1.16, opacity: 0.07 }, back]}>
        <Image source={GEAR_BACK} style={{ width: '100%', height: '100%' }} contentFit="contain" />
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', left: cx - size / 2, top: centreY - size / 2, width: size, height: size, opacity: 0.14 }, front]}>
        <Image source={GEAR} style={{ width: '100%', height: '100%' }} contentFit="contain" />
      </Animated.View>
    </View>
  );
}
