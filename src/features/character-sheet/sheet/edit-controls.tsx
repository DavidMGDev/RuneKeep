import { useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';

import { RuneButton } from '@/components/rune-button';
import { Body, Display, Rune } from '@/constants/theme';

import { useCarousel } from '../carousel-context';
import { type CustomCategory } from '../carousel-categories';
import { Confirm, MoveSheet } from './card-management-panel';

/**
 * Golden Gear Edit controls (v0.9.8). A top-center, toast-style bar that fades in while the deck is
 * flattened. It delegates EVERY action to the same sheet handlers the Cards panel uses, so all the
 * safeguards (never-delete Gold/Beastform/Companion, keep-at-least-one, locked categories, favorites
 * rules) are inherited unchanged. Lives outside the DesignStage like the stat toasts, so it reads in
 * screen space and its dialogs center on screen. Selection state + exit come from the carousel context.
 */
export function EditControls({
  moveTargets,
  customCategories,
  onDuplicate,
  onFavorite,
  onMove,
  onDelete,
  onOpenCardsPanel,
  topInset,
}: {
  moveTargets: string[];
  customCategories: CustomCategory[];
  onDuplicate: (ids: string[]) => void;
  onFavorite: (ids: string[]) => void;
  onMove: (ids: string[], categoryKey: string) => void;
  onDelete: (ids: string[]) => void;
  onOpenCardsPanel: () => void;
  topInset: number;
}) {
  const { editing, raisedIds, exitEdit, decks } = useCarousel();
  const [moveOpen, setMoveOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  if (!editing) return null;

  const ids = [...raisedIds];
  const has = ids.length > 0;
  // Mirror the Cards-panel disable rules (the handlers ALSO guard at the data layer — this is just UX).
  const all = Object.values(decks).flat();
  const liveIds = new Set(all.filter((c) => (c.ref ?? c.id) === 'gold').map((c) => c.id));
  const companionIds = new Set(all.filter((c) => (c.ref ?? c.id).startsWith('companion')).map((c) => c.id));
  const favCopyIds = new Set((decks.favorites ?? []).map((c) => c.id));
  const dupIds = ids.filter((id) => !liveIds.has(id));
  const favIds = ids.filter((id) => !liveIds.has(id) && !favCopyIds.has(id));
  const totalCards = all.length;
  const deleteBlocked = !has || ids.some((id) => liveIds.has(id) || companionIds.has(id)) || ids.length >= totalCards;

  return (
    <>
      <Animated.View
        entering={FadeInUp.duration(200)}
        exiting={FadeOutUp.duration(160)}
        pointerEvents="box-none"
        style={{ position: 'absolute', top: topInset + 64, left: 0, right: 0, alignItems: 'center', zIndex: 6000 }}>
        <View style={{ maxWidth: 372, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: 'rgba(12,14,19,0.94)', borderWidth: 1.4, borderColor: Rune.goldEdge, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Text style={{ color: Rune.goldText, fontSize: 12.5, fontFamily: Display.bold, letterSpacing: 0.4, textTransform: 'uppercase' }}>
              {has ? `${ids.length} selected` : 'Tap cards to edit'}
            </Text>
            <RuneButton label="Done" kind="primary" dense height={34} onPress={exitEdit} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, justifyContent: 'center' }}>
            <RuneButton label="Duplicate" kind="secondary" dense height={34} disabled={!dupIds.length} onPress={() => onDuplicate(dupIds)} />
            <RuneButton label="★ Favorite" kind="secondary" dense height={34} disabled={!favIds.length} onPress={() => onFavorite(favIds)} />
            <RuneButton label="Move" kind="secondary" dense height={34} disabled={!has} onPress={() => setMoveOpen(true)} />
            <RuneButton label="Delete" kind="secondary" dense height={34} disabled={deleteBlocked} onPress={() => setConfirmDel(true)} />
            <RuneButton label="Cards panel" kind="ghost" dense height={34} onPress={() => { exitEdit(); onOpenCardsPanel(); }} />
          </View>
          {!has ? (
            <Text style={{ color: Rune.muted, fontSize: 10, fontFamily: Body.regular, textAlign: 'center' }}>Hold the gear to flatten · tap a card to raise it · Done to finish</Text>
          ) : null}
        </View>
      </Animated.View>
      {moveOpen ? (
        <MoveSheet count={ids.length} ordered={moveTargets} customCategories={customCategories} onMove={(key) => { onMove(ids, key); setMoveOpen(false); }} onClose={() => setMoveOpen(false)} />
      ) : null}
      {confirmDel ? (
        <Confirm title={ids.length > 1 ? `Delete ${ids.length} cards?` : 'Delete this card?'} body="The selected cards are permanently removed. This can't be undone." confirmLabel="Delete" onCancel={() => setConfirmDel(false)} onConfirm={() => { onDelete(ids); setConfirmDel(false); }} />
      ) : null}
    </>
  );
}
