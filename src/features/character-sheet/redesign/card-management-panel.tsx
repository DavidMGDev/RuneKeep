import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, type SharedValue, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, Rune } from '@/constants/theme';
import { playSfx } from '@/lib/sfx';

import { type CardCategory, type CardItem, isBuiltinCategory } from '../card-data';
import { availableCategories, categoryLabel, type CustomCategory } from '../carousel-categories';
import { BUILTIN_TYPE_GROUPS } from '../card-types';
import { useCarousel } from '../carousel-context';
import { CategoryGlyph } from './deck-toggle-icon';
import { CATEGORY_ICON_KEYS, CategoryIconSvg, DEFAULT_CATEGORY_ICON } from './category-icons';
import { CenterDialog, FullScreenPanel } from './full-screen-panel';

const SCRIM = 'rgba(20,24,31,0.7)';
const GOLD_BORDER = 'rgba(218,162,73,0.4)';

/** Proper SVG icon buttons for the category row (#264 item 4) — no emoji. */
function PencilIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path d="M4 20 L4.5 15.5 L15 5 L19 9 L8.5 19.5 Z" fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <Path d="M13 7 L17 11" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}
function TrashIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path d="M5 7 H19" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M9.5 7 V5.2 H14.5 V7" fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <Path d="M6.5 7 L7.4 19.5 H16.6 L17.5 7" fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <Path d="M10 10 V16.5 M14 10 V16.5" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}
const TILE_W = 92;
const TILE_H = Math.round((TILE_W * 7) / 5);

interface Props {
  isDruid: boolean;
  hidden: CardCategory[];
  customCategories: CustomCategory[];
  customTypes: string[];
  order?: string[];
  onToggle: (c: CardCategory) => void;
  onCreateCategory: (label: string, icon: string) => void;
  onUpdateCategory: (id: string, patch: { label?: string; icon?: string }) => void;
  onDeleteCategory: (id: string) => void;
  onReorder: (order: string[]) => void;
  onMoveCards: (ids: string[], categoryKey: string) => void;
  onReorderCard: (movedId: string, toCat: string, orderedIds: string[]) => void;
  onDeleteCards: (ids: string[]) => void;
  onAddCardInCategory: (key: CardCategory) => void;
  onAddType: (label: string) => void;
  onDeleteType: (label: string) => void;
  /** Edit the one selected card (#264 item 5) — only offered when a single editable (custom) card is selected. */
  onEditCard?: (id: string) => void;
  /** Ids of player-authored (editable) cards, so the gallery knows when to offer Edit. */
  editableIds?: Set<string>;
  onClose: () => void;
}

type Rect = { x: number; y: number; w: number; h: number };

/** A small chamfer tile holding a category's glyph (built-in or custom icon). */
function CatTile({ categoryKey, size = 38 }: { categoryKey: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <View style={{ transform: [{ scale: size / 46 }] }}>
        <CategoryGlyph category={categoryKey} />
      </View>
    </View>
  );
}

function Switch({ on }: { on: boolean }) {
  return (
    <View style={{ width: 44, height: 26, borderRadius: 13, padding: 3, backgroundColor: on ? Rune.red : 'rgba(80,84,92,0.6)', justifyContent: 'center' }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: Rune.ivory, alignSelf: on ? 'flex-end' : 'flex-start' }} />
    </View>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flex: 1 }} accessibilityRole="tab" accessibilityState={{ selected: active }}>
      <View style={{ height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: active ? Rune.red : 'rgba(20,24,31,0.6)', borderWidth: 1, borderColor: active ? 'transparent' : GOLD_BORDER }}>
        <Text style={{ color: active ? Rune.ivory : Rune.muted, fontSize: 13, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' }}>{label}</Text>
      </View>
    </Pressable>
  );
}

/** A gold-tinted placeholder tile for the live GOLD card (no real art) so it never shows the app icon. */
function GoldTile() {
  return (
    <View style={{ width: '100%', height: '100%', backgroundColor: '#5a4a1e', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: Rune.goldBright, borderWidth: 2, borderColor: Rune.gold }} />
      <Text style={{ color: Rune.goldText, fontSize: 11, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.5 }}>Gold</Text>
    </View>
  );
}

/**
 * Card Management (#246/#250/#252) — now a FULL-SCREEN interface (the Level Up shell): opaque,
 * SVG-bordered, button-close only, the sheet carousel unloaded behind it. Two tabs (Categories /
 * Cards) + a Types manager. In the Cards gallery: tap a card to multi-select (bulk move/delete), or
 * LONG-PRESS to pick it up and drag it to reorder within a category or move it to another.
 */
export function CardManagementPanel(props: Props) {
  const { isDruid, hidden, customCategories, customTypes, order, onToggle, onCreateCategory, onUpdateCategory, onDeleteCategory, onReorder, onMoveCards, onReorderCard, onDeleteCards, onAddCardInCategory, onAddType, onDeleteType, onEditCard, editableIds, onClose } = props;
  const { decks, category: currentCategory, setCategory } = useCarousel();
  const [view, setView] = useState<'categories' | 'cards' | 'types'>('categories');

  const hiddenSet = useMemo(() => new Set(hidden), [hidden]);
  const ordered = useMemo(() => {
    const avail = availableCategories({ isDruid, custom: customCategories });
    return order && order.length ? [...order.filter((k) => avail.includes(k)), ...avail.filter((k) => !order.includes(k))] : avail;
  }, [isDruid, customCategories, order]);
  const enabledCount = ordered.filter((k) => !hiddenSet.has(k) && (decks[k]?.length ?? 0) > 0).length;
  const totalCards = useMemo(() => Object.values(decks).reduce((s, a) => s + (a?.length ?? 0), 0), [decks]);

  // sub-dialogs / selection
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CustomCategory | null>(null);
  const [confirmDelCat, setConfirmDelCat] = useState<CustomCategory | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [moveOpen, setMoveOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const toggleSelect = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) { n.delete(id); playSfx('cardDeselect'); } else { n.add(id); playSfx('cardSelect'); } return n; });
  const clearSelect = () => setSelected(new Set());

  // drag-drop state
  const [dragId, setDragId] = useState<string | null>(null);
  const [hover, setHover] = useState<{ overId: string; before: boolean } | null>(null); // live drop preview
  const ghostX = useSharedValue(0);
  const ghostY = useSharedValue(0);
  const ghostOn = useSharedValue(0);
  const tileRefs = useRef(new Map<string, View>());
  const tileRects = useRef(new Map<string, Rect>());
  const tileCat = useRef(new Map<string, string>());

  // Live drop preview (#252 polish): which tile the gold insertion bar sits before/after as you drag.
  const updateHover = useCallback((absX: number, absY: number) => {
    let overId: string | null = null;
    let before = true;
    for (const [tid, r] of tileRects.current) {
      if (absX >= r.x && absX <= r.x + r.w && absY >= r.y && absY <= r.y + r.h) { overId = tid; before = absX < r.x + r.w / 2; break; }
    }
    setHover((prev) => (prev?.overId === overId && prev?.before === before ? prev : overId ? { overId, before } : null));
  }, []);

  const quickSwitch = (key: CardCategory) => {
    if ((decks[key]?.length ?? 0) === 0) return; // can't switch to an empty category (#250)
    if (hiddenSet.has(key)) onToggle(key);
    setCategory(key);
    onClose();
  };

  const moveCat = (key: string, dir: -1 | 1) => {
    const i = ordered.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ordered.length) return;
    const next = [...ordered];
    [next[i], next[j]] = [next[j], next[i]];
    onReorder(next);
  };

  // --- drag handlers ---
  const beginDrag = useCallback((id: string) => {
    playSfx('cardDragStart'); // #255
    // measure all current tiles (post-scroll positions) for accurate drop targeting
    tileRects.current.clear();
    for (const [tid, ref] of tileRefs.current) {
      ref.measureInWindow?.((x, y, w, h) => { if (w > 0) tileRects.current.set(tid, { x, y, w, h }); });
    }
    setDragId(id);
  }, []);

  const endDrag = useCallback((absX: number, absY: number) => {
    const moved = dragId;
    setDragId(null);
    setHover(null);
    ghostOn.value = 0;
    if (!moved) return;
    playSfx('cardDragEnd'); // #255: a card was picked up and dropped
    // find the tile under the finger
    let overId: string | null = null;
    for (const [tid, r] of tileRects.current) {
      if (absX >= r.x && absX <= r.x + r.w && absY >= r.y && absY <= r.y + r.h) { overId = tid; break; }
    }
    let toCat: string | null = null;
    let insertIndex = 0;
    if (overId && overId !== moved) {
      toCat = tileCat.current.get(overId) ?? null;
      if (toCat) {
        const ids = (decks[toCat] ?? []).map((c) => c.id).filter((x) => x !== moved);
        const baseIdx = ids.indexOf(overId);
        const r = tileRects.current.get(overId)!;
        insertIndex = baseIdx + (absX > r.x + r.w / 2 ? 1 : 0);
        const list = [...ids];
        list.splice(Math.max(0, Math.min(insertIndex, list.length)), 0, moved);
        onReorderCard(moved, toCat, list);
      }
    } else if (!overId) {
      // dropped over a category's area but not on a tile → append to the nearest section by Y band
      let best: string | null = null;
      let bestDist = Infinity;
      for (const [tid, r] of tileRects.current) {
        const cy = r.y + r.h / 2;
        const d = Math.abs(absY - cy);
        if (d < bestDist) { bestDist = d; best = tileCat.current.get(tid) ?? null; }
      }
      if (best) {
        const ids = (decks[best] ?? []).map((c) => c.id).filter((x) => x !== moved);
        onReorderCard(moved, best, [...ids, moved]);
      }
    }
  }, [dragId, decks, onReorderCard, ghostOn]);

  const ghostStyle = useAnimatedStyle(() => ({
    opacity: ghostOn.value,
    transform: [{ translateX: ghostX.value - TILE_W / 2 }, { translateY: ghostY.value - TILE_H / 2 }, { scale: 1.08 }],
  }));
  const dragItem = dragId ? Object.values(decks).flat().find((c) => c.id === dragId) : null;

  return (
    <>
    <FullScreenPanel
      title="Cards"
      subtitle="Organise categories, move cards, manage types."
      onClose={onClose}
      footer={
        view === 'cards' && selected.size > 0 ? (
          <View style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Pressable onPress={clearSelect} hitSlop={6} accessibilityRole="button" accessibilityLabel="Clear selection"><Text style={{ color: Rune.muted, fontSize: 12, fontFamily: Body.bold, textTransform: 'uppercase' }}>Clear</Text></Pressable>
              <Text style={{ flex: 1, color: Rune.goldText, fontSize: 12, fontFamily: Body.bold }}>{selected.size} selected</Text>
              {selected.size === 1 && onEditCard && editableIds?.has([...selected][0]) ? (
                <RuneButton label="Edit" kind="secondary" dense height={36} style={{ paddingHorizontal: 16 }} onPress={() => onEditCard([...selected][0])} />
              ) : null}
              <RuneButton label="Move" kind="secondary" dense height={36} style={{ paddingHorizontal: 16 }} onPress={() => setMoveOpen(true)} />
              <RuneButton label="Delete" kind="primary" dense height={36} style={{ paddingHorizontal: 16 }} disabled={selected.size >= totalCards} onPress={() => setConfirmDel(true)} />
            </View>
            {selected.size >= totalCards ? <Text style={{ color: Rune.muted, fontSize: 10.5, fontFamily: Body.regular, textAlign: 'right' }}>Keep at least one card.</Text> : null}
          </View>
        ) : undefined
      }>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <TabButton label="Categories" active={view === 'categories'} onPress={() => setView('categories')} />
        <TabButton label="Cards" active={view === 'cards'} onPress={() => setView('cards')} />
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 9, paddingBottom: 8 }} scrollEnabled={!dragId} keyboardShouldPersistTaps="handled">
        {view === 'categories' ? (
          <CategoriesView ordered={ordered} decks={decks} hiddenSet={hiddenSet} enabledCount={enabledCount} currentCategory={currentCategory} customCategories={customCategories} onToggle={onToggle} onQuickSwitch={quickSwitch} onMoveUpDown={moveCat} onEdit={setEditing} onAskDelete={setConfirmDelCat} onCreate={() => setCreateOpen(true)} onManageTypes={() => setView('types')} />
        ) : view === 'cards' ? (
          <CardsView
            ordered={ordered}
            decks={decks}
            customCategories={customCategories}
            selected={selected}
            dragId={dragId}
            hover={hover}
            onToggleSelect={toggleSelect}
            onAddCardInCategory={onAddCardInCategory}
            tileRefs={tileRefs.current}
            tileCat={tileCat.current}
            onBeginDrag={beginDrag}
            onEndDrag={endDrag}
            onHover={updateHover}
            ghostX={ghostX}
            ghostY={ghostY}
            ghostOn={ghostOn}
          />
        ) : (
          <TypesView customTypes={customTypes} onAddType={onAddType} onDeleteType={onDeleteType} onBack={() => setView('categories')} />
        )}
      </ScrollView>
    </FullScreenPanel>

      {/* floating drag ghost (screen-space, OUTSIDE the clipped panel so it isn't cut off) */}
      {dragItem ? (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: TILE_W, height: TILE_H, borderRadius: 6, borderWidth: 2, borderColor: Rune.red, overflow: 'hidden', backgroundColor: '#0c0f14', zIndex: 10006 }, ghostStyle]}>
          {dragItem.live ? <GoldTile /> : dragItem.thumb ? <Image source={dragItem.thumb} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : null}
        </Animated.View>
      ) : null}

      {createOpen ? <CategoryForm title="New category" onCancel={() => setCreateOpen(false)} onSave={(label, icon) => { onCreateCategory(label, icon); setCreateOpen(false); }} /> : null}
      {editing ? <CategoryForm title="Edit category" initialLabel={editing.label} initialIcon={editing.icon} onCancel={() => setEditing(null)} onSave={(label, icon) => { onUpdateCategory(editing.id, { label, icon }); setEditing(null); }} /> : null}
      {confirmDelCat ? <Confirm title={`Delete "${confirmDelCat.label}"?`} body="The category is removed; its cards return to their default category." confirmLabel="Delete category" onCancel={() => setConfirmDelCat(null)} onConfirm={() => { onDeleteCategory(confirmDelCat.id); setConfirmDelCat(null); }} /> : null}
      {moveOpen ? <MoveSheet count={selected.size} ordered={ordered} customCategories={customCategories} onMove={(key) => { onMoveCards([...selected], key); clearSelect(); setMoveOpen(false); }} onClose={() => setMoveOpen(false)} /> : null}
      {confirmDel ? <Confirm title={selected.size > 1 ? `Delete ${selected.size} cards?` : 'Delete this card?'} body="The selected cards are permanently removed. This can't be undone." confirmLabel="Delete" onCancel={() => setConfirmDel(false)} onConfirm={() => { playSfx('tokenRemove'); onDeleteCards([...selected]); clearSelect(); setConfirmDel(false); }} /> : null}
    </>
  );
}

// ---------------- Categories view ----------------
function CategoriesView({ ordered, decks, hiddenSet, enabledCount, currentCategory, customCategories, onToggle, onQuickSwitch, onMoveUpDown, onEdit, onAskDelete, onCreate, onManageTypes }: {
  ordered: string[]; decks: Record<string, CardItem[]>; hiddenSet: Set<string>; enabledCount: number; currentCategory: string; customCategories: CustomCategory[];
  onToggle: (c: string) => void; onQuickSwitch: (c: string) => void; onMoveUpDown: (key: string, dir: -1 | 1) => void;
  onEdit: (c: CustomCategory) => void; onAskDelete: (c: CustomCategory) => void; onCreate: () => void; onManageTypes: () => void;
}) {
  return (
    <>
      {ordered.map((key, idx) => {
        const builtin = isBuiltinCategory(key);
        const custom = customCategories.find((c) => c.id === key);
        const empty = (decks[key]?.length ?? 0) === 0;
        const on = !hiddenSet.has(key) && !empty;
        const locked = empty || (on && enabledCount <= 1);
        const isCurrent = key === currentCategory;
        return (
          <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 7, backgroundColor: on ? 'rgba(200,27,24,0.13)' : SCRIM, borderWidth: 1, borderColor: on ? 'rgba(200,27,24,0.55)' : GOLD_BORDER }}>
            <Pressable onPress={() => { if (!empty) onQuickSwitch(key); }} disabled={empty} accessibilityRole="button" accessibilityLabel={`Switch to ${categoryLabel(key, customCategories)}`} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9, opacity: empty ? 0.6 : 1 }}>
              <CatTile categoryKey={key} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: on ? Rune.ivory : Rune.muted, fontSize: 14.5, fontFamily: Body.bold }}>{categoryLabel(key, customCategories)}</Text>
                <Text style={{ color: Rune.muted, fontSize: 10, fontFamily: Body.medium }}>{builtin ? 'Built-in' : 'Custom'}{empty ? '  ·  empty' : isCurrent ? '  ·  current' : ''}</Text>
              </View>
            </Pressable>
            <View style={{ gap: 2 }}>
              <Pressable onPress={() => onMoveUpDown(key, -1)} hitSlop={6} disabled={idx === 0} accessibilityRole="button" accessibilityLabel="Move up"><Text style={{ color: idx === 0 ? 'rgba(147,142,136,0.35)' : Rune.goldText, fontSize: 13, fontFamily: Body.bold }}>▲</Text></Pressable>
              <Pressable onPress={() => onMoveUpDown(key, 1)} hitSlop={6} disabled={idx === ordered.length - 1} accessibilityRole="button" accessibilityLabel="Move down"><Text style={{ color: idx === ordered.length - 1 ? 'rgba(147,142,136,0.35)' : Rune.goldText, fontSize: 13, fontFamily: Body.bold }}>▼</Text></Pressable>
            </View>
            {custom ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Pressable onPress={() => onEdit(custom)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Edit category" style={{ padding: 4 }}><PencilIcon color={Rune.goldText} /></Pressable>
                <Pressable onPress={() => onAskDelete(custom)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Delete category" style={{ padding: 4 }}><TrashIcon color="#E2705A" /></Pressable>
              </View>
            ) : null}
            <Pressable onPress={() => { if (!locked) { playSfx(on ? 'categoryToggleOff' : 'categoryToggleOn'); onToggle(key); } }} disabled={locked} accessibilityRole="switch" accessibilityState={{ checked: on, disabled: locked }}><Switch on={on} /></Pressable>
          </View>
        );
      })}
      <RuneButton label="+ New category" kind="secondary" dense height={40} onPress={onCreate} />
      <Pressable onPress={onManageTypes} accessibilityRole="button" style={{ alignSelf: 'center', paddingVertical: 8 }}>
        <Text style={{ color: Rune.bronze, fontSize: 12, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' }}>Manage card types →</Text>
      </Pressable>
    </>
  );
}

// ---------------- Cards gallery view ----------------
function CardTile({ item, cat, selected, dimmed, insertBar, onToggleSelect, onBeginDrag, onEndDrag, onHover, setRef, setCat, ghostX, ghostY, ghostOn }: {
  item: CardItem; cat: string; selected: boolean; dimmed: boolean; insertBar: 'before' | 'after' | null;
  onToggleSelect: (id: string) => void; onBeginDrag: (id: string) => void; onEndDrag: (x: number, y: number) => void; onHover: (x: number, y: number) => void;
  setRef: (id: string, ref: View | null) => void; setCat: (id: string, cat: string) => void;
  ghostX: SharedValue<number>; ghostY: SharedValue<number>; ghostOn: SharedValue<number>;
}) {
  const tap = useMemo(() => Gesture.Tap().maxDuration(260).onEnd(() => runOnJS(onToggleSelect)(item.id)), [onToggleSelect, item.id]);
  const drag = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(420)
        .onStart((e) => {
          'worklet';
          ghostX.value = e.absoluteX;
          ghostY.value = e.absoluteY;
          ghostOn.value = 1;
          runOnJS(onBeginDrag)(item.id);
        })
        .onUpdate((e) => { 'worklet'; ghostX.value = e.absoluteX; ghostY.value = e.absoluteY; runOnJS(onHover)(e.absoluteX, e.absoluteY); })
        .onEnd((e) => { 'worklet'; runOnJS(onEndDrag)(e.absoluteX, e.absoluteY); })
        .onFinalize(() => { 'worklet'; ghostOn.value = 0; }),
    [item.id, onBeginDrag, onEndDrag, onHover, ghostX, ghostY, ghostOn],
  );
  const gesture = useMemo(() => Gesture.Race(drag, tap), [drag, tap]);
  return (
    <GestureDetector gesture={gesture}>
      <View collapsable={false} style={{ width: TILE_W }}>
        {/* live drop preview (#252 polish): a gold insertion bar at the slot the card will land in */}
        {insertBar ? <View pointerEvents="none" style={[{ position: 'absolute', top: -2, bottom: -2, width: 3.5, borderRadius: 2, backgroundColor: Rune.goldBright, zIndex: 5 }, insertBar === 'before' ? { left: -5 } : { right: -5 }]} /> : null}
        <View
          ref={(r) => { setRef(item.id, r); setCat(item.id, cat); }}
          collapsable={false}
          accessibilityRole="button"
          accessibilityLabel="Card. Tap to select, hold to drag"
          style={{ width: TILE_W, height: TILE_H, borderRadius: 6, borderWidth: selected ? 2.5 : 1, borderColor: selected ? Rune.red : GOLD_BORDER, backgroundColor: '#0c0f14', overflow: 'hidden', opacity: dimmed ? 0.4 : 1 }}>
          {item.live ? <GoldTile /> : item.thumb ? <Image source={item.thumb} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={80} /> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: Rune.muted, fontSize: 10, fontFamily: Body.bold }}>Card</Text></View>}
          {selected ? <View style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: Rune.red, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: Rune.ivory, fontSize: 13, fontFamily: Body.bold }}>✓</Text></View> : null}
        </View>
      </View>
    </GestureDetector>
  );
}

function CardsView({ ordered, decks, customCategories, selected, dragId, hover, onToggleSelect, onAddCardInCategory, tileRefs, tileCat, onBeginDrag, onEndDrag, onHover, ghostX, ghostY, ghostOn }: {
  ordered: string[]; decks: Record<string, CardItem[]>; customCategories: CustomCategory[]; selected: Set<string>; dragId: string | null; hover: { overId: string; before: boolean } | null;
  onToggleSelect: (id: string) => void; onAddCardInCategory: (key: string) => void;
  tileRefs: Map<string, View>; tileCat: Map<string, string>; onBeginDrag: (id: string) => void; onEndDrag: (x: number, y: number) => void; onHover: (x: number, y: number) => void;
  ghostX: SharedValue<number>; ghostY: SharedValue<number>; ghostOn: SharedValue<number>;
}) {
  const setRef = useCallback((id: string, ref: View | null) => { if (ref) tileRefs.set(id, ref); else tileRefs.delete(id); }, [tileRefs]);
  const setCat = useCallback((id: string, cat: string) => { tileCat.set(id, cat); }, [tileCat]);
  return (
    <>
      <Text style={{ color: Rune.muted, fontSize: 11, fontFamily: Body.regular }}>Tap to select (move/delete below). Hold a card to drag it to reorder or move categories.</Text>
      {ordered.map((key) => {
        const items = decks[key] ?? [];
        return (
          <View key={key} style={{ gap: 7 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <CatTile categoryKey={key} size={26} />
              <Text style={{ flex: 1, color: Rune.goldText, fontSize: 13, fontFamily: Body.bold, letterSpacing: 0.4, textTransform: 'uppercase' }}>{categoryLabel(key, customCategories)}</Text>
              {key !== 'wildshape' ? (
                <Pressable onPress={() => onAddCardInCategory(key)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Add a card to ${categoryLabel(key, customCategories)}`}>
                  <View style={{ paddingHorizontal: 10, height: 26, alignItems: 'center', justifyContent: 'center', borderRadius: 5, borderWidth: 1, borderColor: GOLD_BORDER }}><Text style={{ color: Rune.goldText, fontSize: 11, fontFamily: Body.bold }}>+ Add</Text></View>
                </Pressable>
              ) : null}
            </View>
            {items.length === 0 ? (
              <Text style={{ color: Rune.muted, fontSize: 11, fontFamily: Body.regular, paddingLeft: 2, paddingBottom: 4 }}>No cards here yet.</Text>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {items.map((item) => (
                  <CardTile key={item.id} item={item} cat={key} selected={selected.has(item.id)} dimmed={dragId === item.id} insertBar={hover?.overId === item.id ? (hover.before ? 'before' : 'after') : null} onToggleSelect={onToggleSelect} onBeginDrag={onBeginDrag} onEndDrag={onEndDrag} onHover={onHover} setRef={setRef} setCat={setCat} ghostX={ghostX} ghostY={ghostY} ghostOn={ghostOn} />
                ))}
              </View>
            )}
          </View>
        );
      })}
    </>
  );
}

// ---------------- Types manager ----------------
function TypesView({ customTypes, onAddType, onDeleteType, onBack }: { customTypes: string[]; onAddType: (t: string) => void; onDeleteType: (t: string) => void; onBack: () => void }) {
  const [val, setVal] = useState('');
  return (
    <>
      <Pressable onPress={onBack} accessibilityRole="button" style={{ alignSelf: 'flex-start', paddingVertical: 4 }}>
        <Text style={{ color: Rune.bronze, fontSize: 12, fontFamily: Body.bold, letterSpacing: 0.5, textTransform: 'uppercase' }}>← Categories</Text>
      </Pressable>
      <Text style={{ color: Rune.goldText, fontSize: 13, fontFamily: Body.bold, letterSpacing: 0.4, textTransform: 'uppercase' }}>Your types</Text>
      {customTypes.length === 0 ? <Text style={{ color: Rune.muted, fontSize: 11.5, fontFamily: Body.regular }}>None yet. Add one below; it appears in the card-type picker.</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
        {customTypes.map((t) => (
          <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 11, paddingRight: 7, height: 32, borderRadius: 5, backgroundColor: SCRIM, borderWidth: 1, borderColor: GOLD_BORDER }}>
            <Text style={{ color: Rune.sheet, fontSize: 12.5, fontFamily: Body.bold }}>{t}</Text>
            <Pressable onPress={() => onDeleteType(t)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Delete type ${t}`}><Text style={{ color: '#E2705A', fontSize: 13 }}>✕</Text></Pressable>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
        <ChamferBox chamfer={7} fill="rgba(14,17,22,0.96)" stroke="rgba(218,162,73,0.5)" strokeWidth={1.2} style={{ flex: 1, height: 40, justifyContent: 'center', paddingHorizontal: 12 }}>
          <TextInput value={val} onChangeText={setVal} placeholder="New type, e.g. Ritual" placeholderTextColor={Rune.muted} selectionColor={Rune.goldBright} maxLength={20} style={{ color: Rune.sheet, fontSize: 14, fontFamily: Body.semibold, padding: 0 }} accessibilityLabel="New card type" />
        </ChamferBox>
        <RuneButton label="Add" kind="primary" dense height={40} disabled={!val.trim()} onPress={() => { onAddType(val); setVal(''); }} />
      </View>
      <Text style={{ color: Rune.goldText, fontSize: 13, fontFamily: Body.bold, letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 8 }}>Built-in types</Text>
      {BUILTIN_TYPE_GROUPS.map((g) => (
        <View key={g.label} style={{ gap: 5 }}>
          <Text style={{ color: Rune.bronze, fontSize: 10, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' }}>{g.label}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {g.types.map((t) => (
              <View key={t} style={{ paddingHorizontal: 10, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 5, backgroundColor: 'rgba(20,24,31,0.5)', borderWidth: 1, borderColor: 'rgba(218,162,73,0.25)' }}>
                <Text style={{ color: Rune.muted, fontSize: 11.5, fontFamily: Body.medium }}>{t}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </>
  );
}

// ---------------- sub-dialogs ----------------
function CategoryForm({ title, initialLabel = '', initialIcon = DEFAULT_CATEGORY_ICON, onSave, onCancel }: { title: string; initialLabel?: string; initialIcon?: string; onSave: (label: string, icon: string) => void; onCancel: () => void }) {
  const [label, setLabel] = useState(initialLabel);
  const [icon, setIcon] = useState(initialIcon);
  return (
    <CenterDialog onClose={onCancel} zIndex={10004}>
      <ChamferBox chamfer={14} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} style={{ width: 320, paddingHorizontal: 16, paddingVertical: 16 }}>
        <Text style={{ color: Rune.goldText, fontSize: 18, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>{title}</Text>
        <ChamferBox chamfer={7} fill="rgba(14,17,22,0.96)" stroke="rgba(218,162,73,0.5)" strokeWidth={1.2} style={{ height: 44, justifyContent: 'center', paddingHorizontal: 12, marginBottom: 12 }}>
          <TextInput value={label} onChangeText={setLabel} placeholder="Category name" placeholderTextColor={Rune.muted} selectionColor={Rune.goldBright} maxLength={22} style={{ color: Rune.sheet, fontSize: 15, fontFamily: Body.semibold, padding: 0 }} accessibilityLabel="Category name" />
        </ChamferBox>
        <Text style={{ color: Rune.bronze, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 }}>Icon</Text>
        <ScrollView style={{ maxHeight: 168 }} showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {CATEGORY_ICON_KEYS.map((k) => {
              const on = k === icon;
              return (
                <Pressable key={k} onPress={() => setIcon(k)} accessibilityRole="button" accessibilityState={{ selected: on }}>
                  <View style={{ width: 50, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 7, backgroundColor: on ? 'rgba(200,27,24,0.2)' : SCRIM, borderWidth: 1.4, borderColor: on ? Rune.red : GOLD_BORDER }}>
                    <CategoryIconSvg iconKey={k} size={34} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
          <RuneButton label="Cancel" kind="ghost" height={42} style={{ flex: 1 }} onPress={onCancel} />
          <RuneButton label="Save" kind="primary" height={42} style={{ flex: 1.4 }} disabled={!label.trim()} onPress={() => onSave(label.trim(), icon)} />
        </View>
      </ChamferBox>
    </CenterDialog>
  );
}

function MoveSheet({ count, ordered, customCategories, onMove, onClose }: { count: number; ordered: string[]; customCategories: CustomCategory[]; onMove: (key: string) => void; onClose: () => void }) {
  return (
    <CenterDialog onClose={onClose} zIndex={10004}>
      <ChamferBox chamfer={14} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} style={{ width: 320, paddingHorizontal: 16, paddingVertical: 16 }}>
        <Text style={{ color: Rune.goldText, fontSize: 16, fontFamily: Display.black, textTransform: 'uppercase' }}>{`Move ${count} card${count > 1 ? 's' : ''}`}</Text>
        <Text style={{ color: Rune.muted, fontSize: 11.5, fontFamily: Body.regular, marginTop: 3, marginBottom: 12 }}>Choose a category to move into.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
          {ordered.map((key) => (
            <Pressable key={key} onPress={() => onMove(key)} accessibilityRole="button" accessibilityLabel={`Move to ${categoryLabel(key, customCategories)}`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, height: 36, borderRadius: 5, backgroundColor: SCRIM, borderWidth: 1, borderColor: GOLD_BORDER }}>
                <CatTile categoryKey={key} size={22} />
                <Text style={{ color: Rune.sheet, fontSize: 12.5, fontFamily: Body.bold }}>{categoryLabel(key, customCategories)}</Text>
              </View>
            </Pressable>
          ))}
        </View>
        <RuneButton label="Cancel" kind="ghost" height={42} style={{ marginTop: 16 }} onPress={onClose} />
      </ChamferBox>
    </CenterDialog>
  );
}

function Confirm({ title, body, confirmLabel, onConfirm, onCancel }: { title: string; body: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <CenterDialog onClose={onCancel} zIndex={10005}>
      <ChamferBox chamfer={14} fill={Rune.panel} stroke={Rune.red} strokeWidth={1.6} style={{ width: 300, paddingHorizontal: 16, paddingVertical: 16 }}>
        <Text style={{ color: Rune.ivory, fontSize: 16, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.4 }}>{title}</Text>
        <Text style={{ color: Rune.muted, fontSize: 12.5, fontFamily: Body.regular, lineHeight: 18, marginTop: 8 }}>{body}</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          <RuneButton label="Cancel" kind="ghost" height={42} style={{ flex: 1 }} onPress={onCancel} />
          <RuneButton label={confirmLabel} kind="primary" height={42} style={{ flex: 1.3 }} onPress={onConfirm} />
        </View>
      </ChamferBox>
    </CenterDialog>
  );
}
