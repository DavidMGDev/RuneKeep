/**
 * A character's cards, from the DM's side (v0.35, REBUILT v0.35.1 to the owner's brief).
 *
 * The first attempt reused the float menu's Cards panel: a wall of small tiles. That is a management
 * screen, and this is not a management screen. This is the LEVEL-UP panel's shape, which is the app's
 * pattern for "look at cards and do something with them":
 *
 *  - the same bordered full-screen shell, header and ✕,
 *  - a rail of icon tabs across the top, one per category, the way level-up rails its steps,
 *  - a real `StraightCarousel` in the middle, so a card can be opened full screen and read,
 *  - a row of primary buttons underneath, where level-up puts its actions.
 *
 * Which category you are looking at is ASKED FIRST, before the panel opens, so it never opens on a
 * guess. See `DmCategoryPrompt`.
 *
 * It never forges: a catalog card is its own artwork and everything else is rendered live by the
 * carousel, which is exactly what the creation and level-up carousels do while cards are forging.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { CardEditor, type CardDraft } from '@/components/card-editor';
import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { showToast } from '@/components/toast';
import { useScreenInsets } from '@/components/app-screen';
import { Body, Display, Rune } from '@/constants/theme';
import { cardById } from '@/data/catalog';
import { armorById, weaponById } from '@/data/equipment-data';
import { lootById } from '@/data/loot-data';
import { CLASS_CARDS } from '@/features/create/components/class-cards';
import { ForgedArmorCard, ForgedLootCard, ForgedWeaponCard } from '@/features/create/components/forged-card';
import { LibraryForgedCard } from '@/features/create/components/library-forged-card';
import { StraightCarousel, type StraightCarouselHandle, type StraightItem } from '@/features/create/components/straight-carousel';
import { CategoryGlyph } from '@/features/character-sheet/sheet/deck-toggle-icon';
import { GearBrowser } from '@/features/character-sheet/sheet/gear-browser';
import { cardToLibraryCard, catalogIdOf, sourceLabelForCardId } from '@/features/cards/card-effects';
import { characterCardsByCategory, dmCategories } from '@/lib/dm-card-list';
import type { CharacterFile, CustomCardDef } from '@/lib/character-file';
import type { LibraryCard } from '@/lib/library';
import { useScreenDim } from '@/lib/screen-dim';
import { playSfx } from '@/lib/sfx';
import { useAndroidBack } from './use-android-back';

const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** What `CategoryGlyph` needs when there is no carousel to ask: which of the character's categories
 *  are their own, and which icon each one chose. */
function glyphMeta(file: CharacterFile): Record<string, { icon?: string; builtin: boolean }> {
  return Object.fromEntries((file.customCategories ?? []).map((c) => [c.id, { icon: c.icon, builtin: false }]));
}

/** One card as the carousel wants it: printed artwork where there is any, live otherwise. */
function carouselItem(file: CharacterFile, id: string): StraightItem {
  const base = catalogIdOf(id);
  const cat = cardById(base);
  if (cat) return { id, thumb: cat.thumb, source: cat.source, label: cat.label };
  const label = sourceLabelForCardId(id, file);
  const weapon = weaponById(base);
  if (weapon) return { id, custom: <ForgedWeaponCard weapon={weapon} />, label };
  const armor = armorById(base);
  if (armor) return { id, custom: <ForgedArmorCard armor={armor} />, label };
  const loot = lootById(base);
  if (loot) return { id, custom: <ForgedLootCard loot={loot} />, label };
  return { id, custom: <LibraryForgedCard card={cardToLibraryCard(file, id, (x) => x)} />, label };
}

/**
 * WHICH deck, before the panel opens (v0.35.1, owner).
 *
 * A DM opening a player's cards is looking for something in particular, so asking first is one tap
 * that saves several, and it means the panel never has to guess which category to land on.
 */
export function DmCategoryPrompt({ file, onPick, onCancel }: { file: CharacterFile; onPick: (key: string) => void; onCancel: () => void }) {
  const decks = useMemo(() => characterCardsByCategory(file), [file]);
  const cats = useMemo(() => dmCategories(file, decks), [file, decks]);
  const meta = useMemo(() => glyphMeta(file), [file]);
  useAndroidBack(() => { onCancel(); return true; });
  useScreenDim(0.86);
  return (
    <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 420, alignItems: 'center', justifyContent: 'center' }}>
      <Pressable style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(6,8,13,0.86)' }} onPress={onCancel} accessibilityRole="button" accessibilityLabel="Close" />
      <ChamferBox chamfer={14} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} style={{ width: 320, maxWidth: '92%', paddingHorizontal: 16, paddingVertical: 16 }}>
        <Text style={{ color: Rune.goldText, fontSize: 18, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.5 }}>{file.name}</Text>
        <Text style={{ color: Rune.muted, fontSize: 12, fontFamily: Body.medium, marginTop: 2, marginBottom: 12 }}>Which of their decks do you want to see?</Text>
        <View style={{ gap: 7 }}>
          {cats.length === 0 ? (
            <Text style={{ color: Rune.muted, fontSize: 12.5, fontFamily: Body.regular }}>They are not carrying anything yet.</Text>
          ) : cats.map((c) => (
            <Pressable key={c.key} onPress={() => { playSfx('buttonTap'); onPick(c.key); }} accessibilityRole="button" accessibilityLabel={`${c.label}, ${decks[c.key]?.length ?? 0} cards`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 6, backgroundColor: 'rgba(20,24,31,0.7)', borderWidth: 1, borderColor: 'rgba(218,162,73,0.4)' }}>
                <View style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  <View style={{ transform: [{ scale: 30 / 46 }] }}><CategoryGlyph category={c.key} meta={meta[c.key]} /></View>
                </View>
                <Text style={{ flex: 1, color: Rune.sheet, fontSize: 13.5, fontFamily: Body.bold }}>{c.label}</Text>
                <Text style={{ color: Rune.muted, fontSize: 12, fontFamily: Body.bold }}>{decks[c.key]?.length ?? 0}</Text>
              </View>
            </Pressable>
          ))}
        </View>
        <RuneButton label="Cancel" kind="ghost" height={42} style={{ marginTop: 14 }} onPress={onCancel} />
      </ChamferBox>
    </View>
  );
}

/** One category tab in the rail, the level-up panel's step tab with a deck glyph in it. */
function DeckTab({ categoryKey, meta, label, active, count, onPress }: { categoryKey: string; meta?: { icon?: string; builtin: boolean }; label: string; active: boolean; count: number; onPress: () => void }) {
  const color = active ? Rune.goldBright : Rune.muted;
  return (
    <Pressable onPress={onPress} style={{ flex: 1 }} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={`${label}, ${count} cards`}>
      <ChamferBox chamfer={7} fill={active ? 'rgba(224,181,99,0.12)' : 'transparent'} stroke={active ? Rune.goldBright : 'rgba(147,142,136,0.3)'} strokeWidth={active ? 1.6 : 1.1} style={{ alignItems: 'center', paddingVertical: 7, gap: 2, overflow: 'hidden' }}>
        <View style={{ width: 26, height: 26, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', opacity: active ? 1 : 0.55 }}>
          <View style={{ transform: [{ scale: 26 / 46 }] }}><CategoryGlyph category={categoryKey} meta={meta} /></View>
        </View>
        <Text numberOfLines={1} style={{ color, fontSize: 8, fontFamily: Body.bold, letterSpacing: 0.3, textTransform: 'uppercase' }}>{label}</Text>
      </ChamferBox>
    </Pressable>
  );
}

export function DmCardsPanel({ file, category, onFile, onClose }: { file: CharacterFile; category: string; onFile: (next: CharacterFile) => void; onClose: () => void }) {
  const insets = useScreenInsets();
  const reduced = useReducedMotion();
  const p = useSharedValue(0);
  useMemo(() => { p.value = reduced ? 1 : withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) }); }, [p, reduced]);
  const bgStyle = useAnimatedStyle(() => ({ opacity: p.value }));
  const panelStyle = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * 16 }] }));
  useScreenDim(0.98);

  const decks = useMemo(() => characterCardsByCategory(file), [file]);
  const cats = useMemo(() => dmCategories(file, decks), [file, decks]);
  const meta = useMemo(() => glyphMeta(file), [file]);
  const [cat, setCat] = useState(category);
  const [mode, setMode] = useState<null | 'author' | 'gear'>(null);
  const carRef = useRef<StraightCarouselHandle>(null);
  useAndroidBack(() => {
    if (mode) { setMode(null); return true; }
    if (carRef.current?.closeIfFullscreen()) return true;
    onClose();
    return true;
  });

  const ids = useMemo(() => decks[cat] ?? [], [decks, cat]);
  const items = useMemo(() => ids.map((id) => carouselItem(file, id)), [ids, file]);
  const acquiredIds = useMemo(() => new Set(file.acquiredCardIds ?? []), [file]);

  /** File a newly added card into the deck being viewed, unless it is already its natural home. */
  const withCategory = useCallback((next: CharacterFile, id: string, natural: string) => (
    cat === natural ? next : { ...next, cardCategory: { ...(next.cardCategory ?? {}), [id]: cat } }
  ), [cat]);

  const saveCard = useCallback((draft: CardDraft) => {
    const id = newId('cc');
    const base = { id, title: draft.title, text: draft.text, imageUri: draft.imageUri, color: draft.color, effects: draft.effects, typeLabel: draft.typeLabel, fullImage: draft.fullImage };
    playSfx('customCardCreate');
    const next: CharacterFile = cat === 'notes'
      ? { ...file, notes: [...(file.notes ?? []), base] }
      : { ...file, customCards: [...(file.customCards ?? []), { ...base, target: cat === 'inventory' ? 'inventory' : 'arsenal' } as CustomCardDef] };
    onFile(withCategory(next, id, cat === 'notes' ? 'notes' : cat === 'inventory' ? 'inventory' : 'abilities'));
    setMode(null);
    showToast('Card added', 'success');
  }, [cat, file, onFile, withCategory]);

  const addGear = useCallback((id: string) => {
    const known = !!cardById(id) || !!weaponById(id) || !!armorById(id) || !!lootById(id) || (id.startsWith('class-') && CLASS_CARDS.some((c) => c.key === id.slice(6)));
    if (!known) { showToast('That card could not be added.', 'error'); return; }
    onFile(withCategory({ ...file, acquiredCardIds: [...(file.acquiredCardIds ?? []), id] }, id, 'abilities'));
    showToast('Gear added', 'success');
  }, [file, onFile, withCategory]);

  const addCustomGear = useCallback((card: LibraryCard) => {
    const inst: LibraryCard = { ...card, id: newId('lc') };
    const enable = (inst.effects?.length ?? 0) > 0 || inst.contentType === 'armor';
    const next: CharacterFile = {
      ...file,
      libraryCards: [...(file.libraryCards ?? []), inst],
      enabledCardIds: enable ? [...(file.enabledCardIds ?? []), inst.id] : file.enabledCardIds,
    };
    onFile(withCategory(next, inst.id, 'inventory'));
    showToast('Card added', 'success');
  }, [file, onFile, withCategory]);

  if (mode === 'gear') {
    return <GearBrowser acquiredIds={acquiredIds} enabledExpansionIds={file.enabledExpansionIds} onAdd={addGear} onAddCustom={addCustomGear} onClose={() => setMode(null)} />;
  }
  if (mode === 'author') {
    return <CardEditor kindLabel="Card" saveLabel="Create card" experiences={file.experiences} onSave={saveCard} onCancel={() => setMode(null)} />;
  }

  const label = cats.find((c) => c.key === cat)?.label ?? 'Cards';
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 420 }}>
      <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(8,10,15,0.98)' }, bgStyle]} />
      <Animated.View style={[{ flex: 1, marginTop: insets.top + 6, marginBottom: insets.bottom + 6, paddingHorizontal: 8 }, panelStyle]}>
        <ChamferBox chamfer={18} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} style={{ flex: 1, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ color: Rune.goldText, fontSize: 22, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.5 }}>{file.name}</Text>
              <Text style={{ color: Rune.muted, fontSize: 12, fontFamily: Body.medium }}>{`${label} · ${ids.length} card${ids.length === 1 ? '' : 's'}`}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close" style={{ padding: 4 }}>
              <Text style={{ color: Rune.muted, fontSize: 18, fontFamily: Body.bold }}>✕</Text>
            </Pressable>
          </View>

          {/* The deck rail, in the level-up panel's step-tab shape. */}
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {cats.map((c) => (
              <DeckTab key={c.key} categoryKey={c.key} meta={meta[c.key]} label={c.label} count={decks[c.key]?.length ?? 0} active={c.key === cat} onPress={() => { playSfx('buttonTap'); setCat(c.key); }} />
            ))}
          </View>

          <View style={{ flex: 1, marginTop: 12 }}>
            {items.length === 0 ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: Rune.muted, fontSize: 12.5, fontFamily: Body.regular }}>Nothing in this deck.</Text>
              </View>
            ) : (
              // A real carousel: tap the centred card to read it full screen, exactly as the player does.
              <StraightCarousel key={cat} ref={carRef} items={items} selectedIds={[]} reserveBottom={12} />
            )}
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
            <RuneButton label="New card" kind="secondary" height={46} style={{ flex: 1 }} onPress={() => setMode('author')} />
            <RuneButton label="Add gear" kind="primary" height={46} style={{ flex: 1 }} onPress={() => setMode('gear')} />
          </View>
        </ChamferBox>
      </Animated.View>
    </View>
  );
}
