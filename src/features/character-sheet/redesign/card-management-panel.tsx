import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, Rune } from '@/constants/theme';

import { type CardCategory, type CardItem, isBuiltinCategory } from '../card-data';
import { availableCategories, categoryLabel, type CustomCategory } from '../carousel-categories';
import { BUILTIN_TYPE_GROUPS } from '../card-types';
import { useCarousel } from '../carousel-context';
import { CategoryGlyph } from './deck-toggle-icon';
import { CATEGORY_ICON_KEYS, CategoryIconSvg, DEFAULT_CATEGORY_ICON } from './category-icons';

const SCRIM = 'rgba(20,24,31,0.7)';
const GOLD_BORDER = 'rgba(218,162,73,0.4)';

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
  onDeleteCards: (ids: string[]) => void;
  onAddCardInCategory: (key: CardCategory) => void;
  onAddType: (label: string) => void;
  onDeleteType: (label: string) => void;
  onClose: () => void;
}

/** A small chamfer tile holding a category's glyph (built-in or custom icon). */
function CatTile({ categoryKey, size = 40 }: { categoryKey: string; size?: number }) {
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

/**
 * Card Management (#246) — the float-menu "Cards" panel, reinvented. Three views behind two tabs +
 * a Types manager: organise categories (built-in + custom: create / icon / enable / reorder / delete /
 * quick-switch), move cards between categories from an image gallery (with delete + per-category add),
 * and manage the middle-ribbon card types. Built-in categories + types can't be deleted.
 */
export function CardManagementPanel(props: Props) {
  const { isDruid, hidden, customCategories, customTypes, order, onToggle, onCreateCategory, onUpdateCategory, onDeleteCategory, onReorder, onMoveCards, onDeleteCards, onAddCardInCategory, onAddType, onDeleteType, onClose } = props;
  const { decks, category: currentCategory, setCategory } = useCarousel();
  const { height: screenH, width: screenW } = useWindowDimensions();
  const [view, setView] = useState<'categories' | 'cards' | 'types'>('categories');

  const reduced = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => { p.value = reduced ? 1 : withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) }); }, [p, reduced]);
  const scrimStyle = useAnimatedStyle(() => ({ opacity: p.value }));
  const boxStyle = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * 18 }, { scale: 0.96 + 0.04 * p.value }] }));

  const hiddenSet = useMemo(() => new Set(hidden), [hidden]);
  // Ordered display keys (built-in + custom), reordered by the saved order, INCLUDING hidden ones.
  const ordered = useMemo(() => {
    const avail = availableCategories({ isDruid, custom: customCategories });
    return order && order.length ? [...order.filter((k) => avail.includes(k)), ...avail.filter((k) => !order.includes(k))] : avail;
  }, [isDruid, customCategories, order]);
  const enabledCount = ordered.filter((k) => !hiddenSet.has(k)).length;

  // sub-overlays
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CustomCategory | null>(null);
  const [confirmDelCat, setConfirmDelCat] = useState<CustomCategory | null>(null);
  // Gallery multi-select (#248 item 5): tap cards to select; the action bar moves/deletes the lot.
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [moveOpen, setMoveOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const toggleSelect = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const clearSelect = () => setSelected(new Set());

  const quickSwitch = (key: CardCategory) => {
    if (hiddenSet.has(key)) onToggle(key); // enabling a hidden one so it can become current
    setCategory(key);
    onClose();
  };

  const move = (key: string, dir: -1 | 1) => {
    const i = ordered.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ordered.length) return;
    const next = [...ordered];
    [next[i], next[j]] = [next[j], next[i]];
    onReorder(next);
  };

  const W = Math.min(380, screenW - 24);
  const bodyMax = Math.round(screenH * 0.62);

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
      <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, scrimStyle]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View style={boxStyle} onStartShouldSetResponder={() => true}>
        <ChamferBox chamfer={16} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} style={{ width: W, paddingHorizontal: 16, paddingTop: 15, paddingBottom: 15 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={{ color: Rune.goldText, fontSize: 21, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.5 }}>Cards</Text>
              <Text style={{ color: Rune.muted, fontSize: 11.5, fontFamily: Body.medium, marginTop: 2 }}>Organise categories, move cards, manage types.</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close" style={{ padding: 4 }}>
              <Text style={{ color: Rune.muted, fontSize: 18, fontFamily: Body.bold }}>✕</Text>
            </Pressable>
          </View>

          {/* tabs */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            <TabButton label="Categories" active={view === 'categories'} onPress={() => setView('categories')} />
            <TabButton label="Cards" active={view === 'cards'} onPress={() => setView('cards')} />
          </View>

          <ScrollView style={{ maxHeight: bodyMax }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 9, paddingBottom: 4 }} keyboardShouldPersistTaps="handled">
            {view === 'categories' ? (
              <CategoriesView
                ordered={ordered}
                hiddenSet={hiddenSet}
                enabledCount={enabledCount}
                currentCategory={currentCategory}
                customCategories={customCategories}
                onToggle={onToggle}
                onQuickSwitch={quickSwitch}
                onMoveUpDown={move}
                onEdit={setEditing}
                onAskDelete={setConfirmDelCat}
                onCreate={() => setCreateOpen(true)}
                onManageTypes={() => setView('types')}
              />
            ) : view === 'cards' ? (
              <CardsView
                ordered={ordered}
                decks={decks}
                customCategories={customCategories}
                selected={selected}
                onToggleSelect={toggleSelect}
                onAddCardInCategory={onAddCardInCategory}
              />
            ) : (
              <TypesView customTypes={customTypes} onAddType={onAddType} onDeleteType={onDeleteType} onBack={() => setView('categories')} />
            )}
          </ScrollView>
          {/* selection action bar (#248 item 5): appears on the Cards tab once cards are selected */}
          {view === 'cards' && selected.size > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <Pressable onPress={clearSelect} hitSlop={6} accessibilityRole="button" accessibilityLabel="Clear selection"><Text style={{ color: Rune.muted, fontSize: 12, fontFamily: Body.bold, textTransform: 'uppercase' }}>Clear</Text></Pressable>
              <Text style={{ flex: 1, color: Rune.goldText, fontSize: 12, fontFamily: Body.bold }}>{selected.size} selected</Text>
              <RuneButton label="Move" kind="secondary" dense height={36} style={{ paddingHorizontal: 16 }} onPress={() => setMoveOpen(true)} />
              <RuneButton label="Delete" kind="primary" dense height={36} style={{ paddingHorizontal: 16 }} onPress={() => setConfirmDel(true)} />
            </View>
          ) : null}
        </ChamferBox>
      </Animated.View>

      {/* ---- sub-overlays ---- */}
      {createOpen ? (
        <CategoryForm
          title="New category"
          onCancel={() => setCreateOpen(false)}
          onSave={(label, icon) => { onCreateCategory(label, icon); setCreateOpen(false); }}
        />
      ) : null}
      {editing ? (
        <CategoryForm
          title="Edit category"
          initialLabel={editing.label}
          initialIcon={editing.icon}
          onCancel={() => setEditing(null)}
          onSave={(label, icon) => { onUpdateCategory(editing.id, { label, icon }); setEditing(null); }}
        />
      ) : null}
      {confirmDelCat ? (
        <Confirm
          title={`Delete "${confirmDelCat.label}"?`}
          body="The category is removed. Cards in it return to their default category. This can't be undone."
          confirmLabel="Delete category"
          onCancel={() => setConfirmDelCat(null)}
          onConfirm={() => { onDeleteCategory(confirmDelCat.id); setConfirmDelCat(null); }}
        />
      ) : null}
      {moveOpen ? (
        <MoveSheet
          count={selected.size}
          ordered={ordered}
          customCategories={customCategories}
          onMove={(key) => { onMoveCards([...selected], key); clearSelect(); setMoveOpen(false); }}
          onClose={() => setMoveOpen(false)}
        />
      ) : null}
      {confirmDel ? (
        <Confirm
          title={selected.size > 1 ? `Delete ${selected.size} cards?` : 'Delete this card?'}
          body="The selected cards are permanently removed from your character. This can't be undone."
          confirmLabel="Delete"
          onCancel={() => setConfirmDel(false)}
          onConfirm={() => { onDeleteCards([...selected]); clearSelect(); setConfirmDel(false); }}
        />
      ) : null}
    </View>
  );
}

// ---------------- Categories view ----------------
function CategoriesView({ ordered, hiddenSet, enabledCount, currentCategory, customCategories, onToggle, onQuickSwitch, onMoveUpDown, onEdit, onAskDelete, onCreate, onManageTypes }: {
  ordered: string[]; hiddenSet: Set<string>; enabledCount: number; currentCategory: string; customCategories: CustomCategory[];
  onToggle: (c: string) => void; onQuickSwitch: (c: string) => void; onMoveUpDown: (key: string, dir: -1 | 1) => void;
  onEdit: (c: CustomCategory) => void; onAskDelete: (c: CustomCategory) => void; onCreate: () => void; onManageTypes: () => void;
}) {
  return (
    <>
      {ordered.map((key, idx) => {
        const on = !hiddenSet.has(key);
        const builtin = isBuiltinCategory(key);
        const custom = customCategories.find((c) => c.id === key);
        const locked = on && enabledCount <= 1;
        const isCurrent = key === currentCategory;
        return (
          <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 7, backgroundColor: on ? 'rgba(200,27,24,0.13)' : SCRIM, borderWidth: 1, borderColor: on ? 'rgba(200,27,24,0.55)' : GOLD_BORDER }}>
            {/* quick-switch by tapping the glyph + label */}
            <Pressable onPress={() => onQuickSwitch(key)} accessibilityRole="button" accessibilityLabel={`Switch to ${categoryLabel(key, customCategories)}`} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              <CatTile categoryKey={key} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: on ? Rune.ivory : Rune.muted, fontSize: 14.5, fontFamily: Body.bold }}>{categoryLabel(key, customCategories)}</Text>
                <Text style={{ color: Rune.muted, fontSize: 10, fontFamily: Body.medium }}>{builtin ? 'Built-in' : 'Custom'}{isCurrent ? '  ·  current' : ''}</Text>
              </View>
            </Pressable>
            {/* reorder */}
            <View style={{ gap: 2 }}>
              <Pressable onPress={() => onMoveUpDown(key, -1)} hitSlop={6} disabled={idx === 0} accessibilityRole="button" accessibilityLabel="Move up"><Text style={{ color: idx === 0 ? 'rgba(147,142,136,0.35)' : Rune.goldText, fontSize: 13, fontFamily: Body.bold }}>▲</Text></Pressable>
              <Pressable onPress={() => onMoveUpDown(key, 1)} hitSlop={6} disabled={idx === ordered.length - 1} accessibilityRole="button" accessibilityLabel="Move down"><Text style={{ color: idx === ordered.length - 1 ? 'rgba(147,142,136,0.35)' : Rune.goldText, fontSize: 13, fontFamily: Body.bold }}>▼</Text></Pressable>
            </View>
            {/* edit + delete (custom only) */}
            {custom ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Pressable onPress={() => onEdit(custom)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Edit category" style={{ padding: 4 }}><Text style={{ color: Rune.goldText, fontSize: 14 }}>✎</Text></Pressable>
                <Pressable onPress={() => onAskDelete(custom)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Delete category" style={{ padding: 4 }}><Text style={{ color: '#E2705A', fontSize: 14 }}>🗑</Text></Pressable>
              </View>
            ) : null}
            <Pressable onPress={() => { if (!locked) onToggle(key); }} disabled={locked} accessibilityRole="switch" accessibilityState={{ checked: on, disabled: locked }}>
              <Switch on={on} />
            </Pressable>
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
function CardsView({ ordered, decks, customCategories, selected, onToggleSelect, onAddCardInCategory }: {
  ordered: string[]; decks: Record<string, CardItem[]>; customCategories: CustomCategory[];
  selected: Set<string>; onToggleSelect: (id: string) => void; onAddCardInCategory: (key: string) => void;
}) {
  return (
    <>
      <Text style={{ color: Rune.muted, fontSize: 11, fontFamily: Body.regular }}>Tap cards to select, then move or delete them below.</Text>
      {ordered.map((key) => {
        const items = decks[key] ?? [];
        return (
          <View key={key} style={{ gap: 7 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <CatTile categoryKey={key} size={26} />
              <Text style={{ flex: 1, color: Rune.goldText, fontSize: 13, fontFamily: Body.bold, letterSpacing: 0.4, textTransform: 'uppercase' }}>{categoryLabel(key, customCategories)}</Text>
              {key !== 'wildshape' ? (
                <Pressable onPress={() => onAddCardInCategory(key)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Add a card to ${categoryLabel(key, customCategories)}`}>
                  <View style={{ paddingHorizontal: 10, height: 26, alignItems: 'center', justifyContent: 'center', borderRadius: 5, borderWidth: 1, borderColor: GOLD_BORDER }}>
                    <Text style={{ color: Rune.goldText, fontSize: 11, fontFamily: Body.bold }}>+ Add</Text>
                  </View>
                </Pressable>
              ) : null}
            </View>
            {items.length === 0 ? (
              <Text style={{ color: Rune.muted, fontSize: 11, fontFamily: Body.regular, paddingLeft: 2, paddingBottom: 4 }}>No cards here yet.</Text>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {items.map((item) => {
                  const on = selected.has(item.id);
                  return (
                    <Pressable key={item.id} onPress={() => onToggleSelect(item.id)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel="Card. Tap to select">
                      <View style={{ width: 96, height: 134, borderRadius: 6, borderWidth: on ? 2.5 : 1, borderColor: on ? Rune.red : GOLD_BORDER, backgroundColor: '#0c0f14', overflow: 'hidden' }}>
                        {item.thumb ? (
                          <Image source={item.thumb} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={80} />
                        ) : (
                          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: Rune.muted, fontSize: 10, fontFamily: Body.bold }}>Card</Text></View>
                        )}
                        {on ? (
                          <View style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: Rune.red, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ color: Rune.ivory, fontSize: 13, fontFamily: Body.bold }}>✓</Text>
                          </View>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
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

// ---------------- shared sub-overlays ----------------
function Backdrop({ onPress }: { onPress: () => void }) {
  return <Pressable style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(6,8,13,0.82)' }} onPress={onPress} accessibilityRole="button" accessibilityLabel="Close" />;
}

function CategoryForm({ title, initialLabel = '', initialIcon = DEFAULT_CATEGORY_ICON, onSave, onCancel }: { title: string; initialLabel?: string; initialIcon?: string; onSave: (label: string, icon: string) => void; onCancel: () => void }) {
  const [label, setLabel] = useState(initialLabel);
  const [icon, setIcon] = useState(initialIcon);
  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 10003, alignItems: 'center', justifyContent: 'center' }}>
      <Backdrop onPress={onCancel} />
      <View onStartShouldSetResponder={() => true}>
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
      </View>
    </View>
  );
}

/** Pick a destination category for the selected cards (#248 item 5). */
function MoveSheet({ count, ordered, customCategories, onMove, onClose }: {
  count: number; ordered: string[]; customCategories: CustomCategory[];
  onMove: (key: string) => void; onClose: () => void;
}) {
  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 10003, alignItems: 'center', justifyContent: 'center' }}>
      <Backdrop onPress={onClose} />
      <View onStartShouldSetResponder={() => true}>
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
      </View>
    </View>
  );
}

function Confirm({ title, body, confirmLabel, onConfirm, onCancel }: { title: string; body: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 10004, alignItems: 'center', justifyContent: 'center' }}>
      <Backdrop onPress={onCancel} />
      <View onStartShouldSetResponder={() => true}>
      <ChamferBox chamfer={14} fill={Rune.panel} stroke={Rune.red} strokeWidth={1.6} style={{ width: 300, paddingHorizontal: 16, paddingVertical: 16 }}>
        <Text style={{ color: Rune.ivory, fontSize: 16, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.4 }}>{title}</Text>
        <Text style={{ color: Rune.muted, fontSize: 12.5, fontFamily: Body.regular, lineHeight: 18, marginTop: 8 }}>{body}</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          <RuneButton label="Cancel" kind="ghost" height={42} style={{ flex: 1 }} onPress={onCancel} />
          <RuneButton label={confirmLabel} kind="primary" height={42} style={{ flex: 1.3 }} onPress={onConfirm} />
        </View>
      </ChamferBox>
      </View>
    </View>
  );
}
