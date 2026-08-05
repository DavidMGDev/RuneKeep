/**
 * A character's cards, from the DM's side (v0.35, owner).
 *
 * A DM handing out treasure, or checking whether someone really has the rope, should not have to ask
 * for the player's phone. This is the level-up panel's shape: one category at a time, a switcher above
 * it, and a row of actions under it.
 *
 * It reads through `lib/dm-card-list`, which files the character's cards without the sheet's deck
 * assembly (see that module for what that costs). It never forges: a card is drawn from its catalog
 * artwork where it has some, and rendered live where it does not.
 */
import { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

import { ArtImage } from '@/components/art-image';
import { CardEditor, type CardDraft } from '@/components/card-editor';
import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { showToast } from '@/components/toast';
import { DmType, Body, Display, DmRune } from '@/constants/theme';
import { cardById } from '@/data/catalog';
import { armorById, weaponById } from '@/data/equipment-data';
import { lootById } from '@/data/loot-data';
import { CLASS_CARDS } from '@/features/create/components/class-cards';
import { FORGED_H, FORGED_W, ForgedArmorCard, ForgedLootCard, ForgedWeaponCard } from '@/features/create/components/forged-card';
import { LibraryForgedCard } from '@/features/create/components/library-forged-card';
import { GearBrowser } from '@/features/character-sheet/sheet/gear-browser';
import { cardToLibraryCard, catalogIdOf } from '@/features/cards/card-effects';
import { characterCardsByCategory, dmCategories } from '@/lib/dm-card-list';
import type { CharacterFile, CustomCardDef } from '@/lib/character-file';
import type { LibraryCard } from '@/lib/library';
import { playSfx } from '@/lib/sfx';
import { useAndroidBack } from './use-android-back';

const TILE_W = 96;
const TILE_H = Math.round((TILE_W * 7) / 5);

const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/**
 * One card, at tile size.
 *
 * Three routes, in the order that gives the truest picture: a catalog card is its own artwork; a piece
 * of equipment or loot is the card the app draws for it (going through the generic converter would
 * print an untitled "Card", because equipment is not in the catalog); anything else is the card as the
 * library renders it.
 */
function CardTile({ file, id }: { file: CharacterFile; id: string }) {
  const base = catalogIdOf(id);
  const cat = cardById(base);
  const weapon = cat ? undefined : weaponById(base);
  const armor = cat || weapon ? undefined : armorById(base);
  const loot = cat || weapon || armor ? undefined : lootById(base);
  return (
    <View style={{ width: TILE_W, height: TILE_H, borderRadius: 6, borderWidth: 1, borderColor: DmRune.line, backgroundColor: '#0c0f14', overflow: 'hidden' }}>
      {cat ? (
        <ArtImage source={cat.thumb} fit="cover" />
      ) : (
        <View pointerEvents="none" style={{ position: 'absolute', left: (TILE_W - FORGED_W) / 2, top: (TILE_H - FORGED_H) / 2, width: FORGED_W, height: FORGED_H, transform: [{ scale: TILE_W / FORGED_W }] }}>
          {weapon ? <ForgedWeaponCard weapon={weapon} />
            : armor ? <ForgedArmorCard armor={armor} />
            : loot ? <ForgedLootCard loot={loot} />
            : <LibraryForgedCard card={cardToLibraryCard(file, id, (x) => x)} />}
        </View>
      )}
    </View>
  );
}

export function DmCardsPanel({ file, onFile, onClose }: { file: CharacterFile; onFile: (next: CharacterFile) => void; onClose: () => void }) {
  const decks = useMemo(() => characterCardsByCategory(file), [file]);
  const cats = useMemo(() => dmCategories(file, decks), [file, decks]);
  const [cat, setCat] = useState(() => cats[0]?.key ?? 'abilities');
  const [mode, setMode] = useState<null | 'author' | 'gear'>(null);
  useAndroidBack(() => { if (mode) { setMode(null); return true; } onClose(); return true; });

  const ids = decks[cat] ?? [];
  const acquiredIds = useMemo(() => new Set(file.acquiredCardIds ?? []), [file]);

  /** File a newly added card into the category being viewed, unless it is already its natural home. */
  const withCategory = useCallback((next: CharacterFile, id: string, natural: string) => (
    cat === natural ? next : { ...next, cardCategory: { ...(next.cardCategory ?? {}), [id]: cat } }
  ), [cat]);

  const saveCard = useCallback((draft: CardDraft) => {
    const id = newId('cc');
    const base = { id, title: draft.title, text: draft.text, imageUri: draft.imageUri, color: draft.color, effects: draft.effects, typeLabel: draft.typeLabel, fullImage: draft.fullImage };
    playSfx('customCardCreate');
    let next: CharacterFile;
    if (cat === 'notes') next = { ...file, notes: [...(file.notes ?? []), base] };
    else {
      const card: CustomCardDef = { ...base, target: cat === 'inventory' ? 'inventory' : 'arsenal' };
      next = { ...file, customCards: [...(file.customCards ?? []), card] };
    }
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

  return (
    <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 400, backgroundColor: DmRune.ink }}>
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 54, paddingBottom: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: DmRune.ivory, fontSize: DmType.hero, fontFamily: Display.black, letterSpacing: 1.2, textTransform: 'uppercase' }}>{file.name}</Text>
            <Text style={{ color: DmRune.muted, fontSize: DmType.micro, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 2 }}>{`${ids.length} card${ids.length === 1 ? '' : 's'} in this category`}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={{ color: DmRune.muted, fontSize: 20, fontFamily: Body.bold }}>✕</Text>
          </Pressable>
        </View>

        {/* The category switcher. Wraps rather than scrolling, like the v0.35 filter bands. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {cats.map((c) => {
            const on = c.key === cat;
            return (
              <Pressable key={c.key} onPress={() => { playSfx('buttonTap'); setCat(c.key); }} accessibilityRole="button" accessibilityState={{ selected: on }}>
                <ChamferBox chamfer={6} fill={on ? DmRune.accent : 'transparent'} stroke={on ? 'transparent' : DmRune.line} strokeWidth={1.1} style={{ height: 30, justifyContent: 'center', paddingHorizontal: 11 }}>
                  <Text style={{ color: on ? DmRune.ink : DmRune.text, fontSize: DmType.micro, fontFamily: Body.bold, letterSpacing: 0.7, textTransform: 'uppercase' }}>{c.label}</Text>
                </ChamferBox>
              </Pressable>
            );
          })}
        </View>

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
          {ids.length === 0 ? (
            <Text style={{ color: DmRune.muted, fontSize: DmType.body, fontFamily: Body.regular, fontStyle: 'italic' }}>Nothing in here.</Text>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
              {ids.map((id) => <CardTile key={id} file={file} id={id} />)}
            </View>
          )}
        </ScrollView>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
          <RuneButton label="New card" kind="secondary" height={46} dm style={{ flex: 1 }} onPress={() => setMode('author')} />
          <RuneButton label="Add gear" kind="secondary" height={46} dm style={{ flex: 1 }} onPress={() => setMode('gear')} />
        </View>
      </View>
    </View>
  );
}
