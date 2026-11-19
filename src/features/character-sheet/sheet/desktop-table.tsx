import { coachTarget } from '@/components/coach-tour';
import { TableMotes } from './table-motes';
import { createElement, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { ChamferBox } from '@/components/chamfer-box';
import { DesktopPortal } from '@/components/desktop-portal';
import { Body, Display, DmRune, Rune } from '@/constants/theme';
import { useDesktop } from '@/hooks/use-desktop';
import { FAVORITES_CATEGORY } from '@/lib/favorites';
import { playSfx } from '@/lib/sfx';
import type { CardCategory, CardItem } from '../card-data';
import { useCarousel } from '../carousel-context';
import { type CornerTone, EnabledCorner } from '../components/enabled-corner';
import { BakedTokenLayer, type PlacedToken } from '../components/card-tokens';
import { TraitCrossOut } from '../components/trait-cross-out';
import { catalogIdOf } from '@/features/cards/card-effects';
import { CategoryGlyph } from './deck-toggle-icon';
import { SortPanel } from './sort-panel';
import type { CharacterFile } from '@/lib/character-file';
import { FORGED_H, FORGED_W } from '@/features/create/components/forged-card';
import { type CarouselTune, DEFAULT_TUNE, StraightCarousel, type StraightCarouselHandle, type StraightItem } from '@/features/create/components/straight-carousel';

/**
 * The desktop card table (v0.46.0).
 *
 * The hand is the same straight carousel character creation and level up use, laid out by a set of sliders the
 * owner is tuning (the panel above it, with a button that copies the numbers). Focusing a card is off until that
 * settles: a click centres a card, the wheel and the arrow keys walk the deck, and a right click opens the card's
 * menu. It reads and writes the same carousel context the phone hand does, so equipping, decks and the menu all go
 * through the code paths they always have.
 */

const RAIL_W = 206;
const NO_CARDS: CardItem[] = [];
const EASE = Easing.bezier(0.16, 1, 0.3, 1);
/**
 * A held arrow steps one card every HOLD_STEP_MS, its pitch climbing HOLD_CENTS a card for HOLD_PEAK cards, then
 * coming back down, and round again. Paced so the pick sounds never pile into a crackle.
 */
const HOLD_STEP_MS = 160;
const HOLD_CENTS = 100;
const HOLD_PEAK = 8;
const TUNE_KEY = 'runekeep.deskTune';

function cornerTone(ref: string, states: { permanent: Set<string>; modsOff: Set<string> }): CornerTone {
  if (states.modsOff.has(ref)) return 'muted';
  if (states.permanent.has(ref)) return 'permanent';
  return 'on';
}

function loadTune(): CarouselTune {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(TUNE_KEY) : null;
    return raw ? { ...DEFAULT_TUNE, ...(JSON.parse(raw) as Partial<CarouselTune>) } : DEFAULT_TUNE;
  } catch {
    return DEFAULT_TUNE;
  }
}

export function DesktopTable({ sortFile, onSortOpen, overlay: overlayProp, backRef, onManage, onExit }: { canInspect: boolean; sortFile?: CharacterFile; onSortOpen?: (open: boolean) => void; onEditCard: (id: string) => void; editableIds: Set<string>; overlay: boolean; backRef: React.MutableRefObject<(() => boolean) | null>; onManage: () => void; onExit: () => void }) {
  const desktop = useDesktop();
  const { width: winW, height: winH } = useWindowDimensions();
  const ctx = useCarousel();
  const { decks, category } = ctx;
  const deck = decks[category] ?? NO_CARDS;

  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  // The phone's Sort, for a whole deck: it opens in the side slot and the table waits behind it like any panel.
  const [sorting, setSorting] = useState(false);
  const overlay = overlayProp || sorting;
  // The sheet holds its port still while Sort is open, as it does behind every other panel.
  useEffect(() => { onSortOpen?.(sorting); }, [sorting, onSortOpen]);
  useEffect(() => { setMenu(null); }, [category]);

  const [tune, setTuneState] = useState(loadTune);
  const setTune = useCallback((t: CarouselTune) => {
    setTuneState(t);
    try { localStorage.setItem(TUNE_KEY, JSON.stringify(t)); } catch {}
  }, []);

  const port = desktop?.port;
  const tableW = Math.max(0, winW - (port ? port.left + port.width : 0));
  const tableH = winH;
  const areaL = RAIL_W;
  const areaW = Math.max(200, tableW - RAIL_W);
  const railTop = port ? port.top + 200 * port.scale : 120;
  const railMaxH = Math.max(120, tableH - 24 - railTop);
  const [panelH, setPanelH] = useState(220);
  const deckTop = 24 + panelH + 8;

  const carRef = useRef<StraightCarouselHandle>(null);
  const items = useMemo<StraightItem[]>(() => deck.map((c) => {
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
  }), [deck, ctx.cardTokens, ctx.crossOuts, ctx.enabledIds, ctx.cardStates]);

  // The arrow keys play the pick sound, its pitch rising while an arrow is held; the wheel and a drag keep the
  // ordinary scroll pip. A cue older than a step means the deck did not move (its end): it is dropped.
  const keyCue = useRef<{ cents: number; at: number } | null>(null);
  const held = useRef({ n: 0, last: 0 });
  const pip = useCallback(() => {
    const cue = keyCue.current;
    keyCue.current = null;
    if (cue && performance.now() - cue.at < 400) playSfx('cardFullscreenEnter', { cents: cue.cents });
    else playSfx('carouselScroll');
  }, []);

  // Reorder (the phone's Edit Mode drag): the centred card moves one place, persisted through the same path.
  const canReorder = !!ctx.onReorderCards && category !== FAVORITES_CATEGORY && deck.length > 1;

  // A panel opening (from the sheet or the rail) closes the card menu, and the whole table goes inert behind it:
  // no clicks, no Tab stops, as the sheet is behind a phone panel.
  useEffect(() => { if (overlay) setMenu(null); }, [overlay]);
  useLayoutEffect(() => {
    const host = desktop?.tableHost;
    if (!host) return;
    if (overlay) host.setAttribute('inert', ''); else host.removeAttribute('inert');
    return () => host.removeAttribute('inert');
  }, [overlay, desktop?.tableHost]);
  // Back (browser button or Alt+Left) closes the card menu before the sheet offers to leave.
  const menuRef = useRef(menu);
  menuRef.current = menu;
  useEffect(() => {
    backRef.current = () => {
      if (!menuRef.current) return false;
      playSfx('floatMenuClose');
      setMenu(null);
      return true;
    };
    return () => { backRef.current = null; };
  }, [backRef]);

  // Keys (web): A/D or arrows walk the deck, Q/E or 1-9 change deck, Space equips the centred card, [ and ] move
  // it in the deck, Esc closes the menu. Off while a panel is open or a field has focus. Everything the handler
  // reads comes through a ref, so the listener is never rebuilt mid-hold.
  const keyRef = useRef({ deck, overlay, menu, ring: ctx.ring, ctx, canReorder, category });
  keyRef.current = { deck, overlay, menu, ring: ctx.ring, ctx, canReorder, category };
  useEffect(() => {
    if (!desktop || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      const k = keyRef.current;
      if (k.overlay || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA)$/.test((e.target as HTMLElement)?.tagName ?? '')) return;
      const key = e.key.toLowerCase();
      if (key === 'escape') { if (k.menu) { playSfx('floatMenuClose'); setMenu(null); } return; }
      if (k.menu) return; // the menu owns the keys while it is open
      const dir = key === 'arrowright' || key === 'd' ? 1 : key === 'arrowleft' || key === 'a' ? -1 : 0;
      if (dir && k.deck.length) {
        e.preventDefault();
        const h = held.current;
        if (e.repeat && e.timeStamp - h.last < HOLD_STEP_MS) return; // a held key repeats far faster than a card settles
        h.last = e.timeStamp;
        h.n = e.repeat ? h.n + 1 : 0;
        keyCue.current = { cents: HOLD_CENTS * (HOLD_PEAK - Math.abs(HOLD_PEAK - (h.n % (HOLD_PEAK * 2)))), at: performance.now() };
        carRef.current?.stepBy(dir * (e.shiftKey ? 2 : 1)); // Shift moves two at a time, as the keys page teaches
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
      // The provider plays the deck-switch sound itself.
      if (key === 'q' || key === 'e') { k.ctx.cycleCategory(key === 'q' ? -1 : 1); return; }
      if (/^[1-9]$/.test(key)) { const c = k.ring[+key - 1]; if (c) k.ctx.setCategory(c); return; }
      if (key === ' ') {
        const id = k.deck[carRef.current?.centerIndex() ?? -1]?.id;
        if (!id) return;
        e.preventDefault();
        k.ctx.toggleCard(id);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [desktop]);

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

  return (
    <DesktopPortal to="table">
      <View {...coachTarget('sheet-table')} style={{ position: 'absolute', left: 0, top: 0, width: tableW, height: tableH, overflow: 'hidden' }}>
        <TableMotes />
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
        <TunePanel tune={tune} onChange={setTune} left={areaL + Math.max(20, (areaW - 780) / 2)} width={Math.min(780, areaW - 40)} onHeight={setPanelH} />
        {deck.length === 0 ? (
          <Text style={{ position: 'absolute', left: areaL, width: areaW, top: deckTop + (tableH - deckTop) * 0.4, textAlign: 'center', color: Rune.muted, fontFamily: Body.medium, fontSize: 14 }}>Nothing in this deck yet. Add a card from the sheet.</Text>
        ) : (
          <View style={{ position: 'absolute', left: areaL, width: areaW, top: deckTop, bottom: 0 }}>
            <StraightCarousel
              key={category}
              ref={carRef}
              items={items}
              selectedIds={[]}
              initialIndex={Math.floor((deck.length - 1) / 2)}
              pointer
              tune={tune}
              focusable={false}
              pip={pip}
            />
          </View>
        )}
        {/* A panel is open in the side slot: the table waits, as the sheet does behind a phone panel. */}
        {overlay ? <View style={{ position: 'absolute', left: 0, top: 0, width: tableW, height: tableH, zIndex: 800, backgroundColor: 'rgba(6,8,13,0.45)' }} /> : null}
        {menu && !overlay ? <CardMenu id={menu.id} x={menu.x} y={menu.y} tableW={tableW} tableH={tableH} onClose={() => setMenu(null)} /> : null}
      </View>
    </DesktopPortal>
  );
}

/** One slider of the tuning panel: a native range input (web only), styled to the sheet. */
const TUNE_ROWS: { key: keyof CarouselTune; label: string; min: number; max: number; step: number }[] = [
  { key: 'size', label: 'Card size', min: 120, max: 380, step: 2 },
  { key: 'centre', label: 'Centre cards', min: 1, max: 5, step: 1 },
  { key: 'side', label: 'Cards each side', min: 1, max: 10, step: 1 },
  { key: 'spacing', label: 'Spacing', min: -0.6, max: 0.6, step: 0.01 },
  { key: 'pack', label: 'Outer packing', min: 0, max: 0.9, step: 0.01 },
  { key: 'shrink', label: 'Shrink per step', min: 0, max: 0.3, step: 0.005 },
  { key: 'dim', label: 'Darken per step', min: 0, max: 0.3, step: 0.01 },
  { key: 'drop', label: 'Drop per step', min: 0, max: 80, step: 1 },
  { key: 'fade', label: 'Edge fade', min: 0, max: 45, step: 1 },
];

/**
 * The carousel's tuning sliders (v0.46.0, owner), while the desktop deck's look is being settled. The values
 * persist in this browser; Copy puts them on the clipboard as JSON to paste back.
 */
function TunePanel({ tune, onChange, left, width, onHeight }: { tune: CarouselTune; onChange: (t: CarouselTune) => void; left: number; width: number; onHeight: (h: number) => void }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const text = JSON.stringify(tune);
    void navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }, () => {});
    playSfx('buttonTap');
  };
  if (Platform.OS !== 'web') return null;
  return (
    <View onLayout={(e) => onHeight(Math.ceil(e.nativeEvent.layout.height))} style={{ position: 'absolute', top: 24, left, width, zIndex: 20 }}>
      <ChamferBox chamfer={12} fill="rgba(12,15,20,0.92)" stroke={Rune.goldEdge} strokeWidth={1.3} style={{ paddingVertical: 14, paddingHorizontal: 18, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ flex: 1, color: Rune.ivory, fontFamily: Display.black, fontSize: 14, letterSpacing: 1.4, textTransform: 'uppercase' }}>Carousel tuning</Text>
          <TuneButton label="Reset" onPress={() => { playSfx('buttonTap'); onChange(DEFAULT_TUNE); }} />
          <TuneButton label={copied ? 'Copied' : 'Copy parameters'} primary onPress={copy} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 22, rowGap: 6 }}>
          {TUNE_ROWS.map((r) => (
            <View key={r.key} style={{ width: (width - 36 - 44) / 3, gap: 2 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: Rune.goldText, fontFamily: Body.bold, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase' }}>{r.label}</Text>
                <Text style={{ color: Rune.ivory, fontFamily: Body.bold, fontSize: 11 }}>{+tune[r.key].toFixed(3)}</Text>
              </View>
              {createElement('input', {
                type: 'range', min: r.min, max: r.max, step: r.step, value: tune[r.key],
                'aria-label': r.label,
                onChange: (e: { target: { value: string } }) => onChange({ ...tune, [r.key]: +e.target.value }),
                style: { width: '100%', accentColor: Rune.red, cursor: 'pointer', margin: 0 },
              })}
            </View>
          ))}
        </View>
      </ChamferBox>
    </View>
  );
}

function TuneButton({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      {({ hovered, pressed }: { hovered?: boolean; pressed?: boolean }) => (
        <ChamferBox chamfer={6} fill={primary ? (hovered ? '#d8241f' : Rune.red) : hovered ? DmRune.panelLit : Rune.ink} stroke={primary ? Rune.red : hovered ? Rune.goldBright : Rune.goldEdge} strokeWidth={1.2}
          style={{ height: 30, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.96 : 1 }] }}>
          <Text style={{ color: primary || hovered ? Rune.ivory : Rune.goldText, fontFamily: Body.bold, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>{label}</Text>
        </ChamferBox>
      )}
    </Pressable>
  );
}

/** What holding a card does on the phone, at the pointer. Every row runs the same handler the wheel runs. */
function CardMenu({ id, x, y, tableW, tableH, onClose }: { id: string; x: number; y: number; tableW: number; tableH: number; onClose: () => void }) {
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
        { label: 'Remove from Favorites', onPress: run(() => ctx.cardAction('unfavorite', [id])) },
      ]
    : [
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
        <ChamferBox chamfer={10} fill={Rune.red} style={{ flex: 1 }} />
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

