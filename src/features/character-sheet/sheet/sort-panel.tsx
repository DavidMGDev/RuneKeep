import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { Body, Display } from '@/constants/theme';
import { sortEntryFor } from '@/features/cards/card-sort-entries';
import { box } from '@/lib/design';
import { type CharacterFile } from '@/lib/character-file';
import { type SortDir, type SortKey, sortWithinSelection } from '@/lib/card-sort';
import { playSfx } from '@/lib/sfx';

import { useCarousel } from '../carousel-context';

const GRAY = '#C4C8D0';
const GRAY_DIM = '#9AA0AA';
const PANEL = 'rgba(18,21,27,0.98)';

/** The five questions, in the order they are offered. */
const OPTIONS: { key: SortKey; label: string; hint: string }[] = [
  { key: 'color', label: 'Colour', hint: 'By hue, then by how light it is' },
  { key: 'title', label: 'Title', hint: 'A to Z' },
  { key: 'type', label: 'Card type', hint: 'A to Z' },
  { key: 'group', label: 'Card type family', hint: 'Arsenal, Inventory, Notes, Character' },
  { key: 'length', label: 'Description length', hint: 'How much text the card carries' },
];

/** Ascending: the arrow rises, the bars grow. Descending is the same drawing, flipped. */
function SortArrow({ down, color }: { down: boolean; color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" style={down ? { transform: [{ scaleY: -1 }] } : undefined}>
      <Path d="M6 20 V5 M6 5 L3 8.5 M6 5 L9 8.5" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M13 18 H16 M13 13 H19 M13 8 H22" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * Sort the selected cards (v0.38, owner).
 *
 * It sits over the whole stage and swallows every touch that is not one of its own controls. That is
 * the point rather than a side effect: edit mode is left by tapping the gear or the sheet behind the
 * row, and a panel that let a stray tap through would drop the player out of edit mode and lose the
 * selection they just made. The only way out of here is Cancel.
 *
 * The panel decides the ORDER and hands it to the carousel, which owns the animation. It never writes
 * to the character itself.
 */
export function SortPanel({ file, onClose }: { file?: CharacterFile; onClose: () => void }) {
  const { raisedIds, decks, category, sortFnRef } = useCarousel();
  const [key, setKey] = useState<SortKey>('color');

  const deckIds = useMemo(() => (decks[category] ?? []).map((c) => c.id), [decks, category]);
  const selected = useMemo(() => deckIds.filter((id) => raisedIds.has(id)), [deckIds, raisedIds]);
  const enough = selected.length >= 2;

  const apply = (dir: SortDir) => {
    if (!enough) return;
    const entries = selected.map((id) => sortEntryFor(id, file));
    const ordered = sortWithinSelection(deckIds, entries, key, dir);
    // Unchanged is not a no-op worth animating: the cards would gather and come back to the same
    // places, which reads as the control having failed rather than as "already in that order".
    if (ordered.every((id, i) => id === deckIds[i])) { playSfx('buttonTap'); onClose(); return; }
    const sel = new Set(selected);
    sortFnRef.current?.(ordered, ordered.filter((id) => sel.has(id)));
    onClose();
  };

  return (
    <View style={[box(-120, -160, 652, 1212), { zIndex: 60, alignItems: 'center', justifyContent: 'center' }]}>
      {/* The absorber. It has no onPress: a tap anywhere but a control does nothing at all. */}
      <Pressable style={[box(0, 0, 652, 1212), { backgroundColor: 'rgba(6,8,13,0.72)' }]} onPress={() => {}} accessibilityLabel="Sort options" />
      <ChamferBox chamfer={14} fill={PANEL} stroke={GRAY_DIM} strokeWidth={1.4} style={{ width: 330, paddingHorizontal: 16, paddingVertical: 16 }}>
        <Text style={{ color: GRAY, fontSize: 17, fontFamily: Display.black, letterSpacing: 1.6, textTransform: 'uppercase' }}>Sort Selected</Text>
        <Text style={{ color: GRAY_DIM, fontSize: 11.5, fontFamily: Body.regular, marginTop: 3, marginBottom: 12 }}>
          {enough ? `${selected.length} cards, in the slots they already hold. Nothing else moves.` : 'Pick at least two cards to sort.'}
        </Text>

        <View style={{ gap: 6 }}>
          {OPTIONS.map((o) => {
            const on = o.key === key;
            return (
              <Pressable
                key={o.key}
                onPress={() => { playSfx('buttonTap'); setKey(o.key); }}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 7,
                  borderWidth: 1.2, borderColor: on ? GRAY : 'rgba(154,160,170,0.35)',
                  backgroundColor: on ? 'rgba(80,88,100,0.35)' : pressed ? 'rgba(60,66,74,0.5)' : 'rgba(20,24,30,0.6)',
                })}>
                <View style={{ width: 15, height: 15, borderRadius: 8, borderWidth: 1.5, borderColor: on ? GRAY : GRAY_DIM, alignItems: 'center', justifyContent: 'center' }}>
                  {on ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: GRAY }} /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: on ? GRAY : GRAY_DIM, fontSize: 13, fontFamily: Body.bold }}>{o.label}</Text>
                  <Text style={{ color: GRAY_DIM, fontSize: 10.5, fontFamily: Body.regular, marginTop: 1 }}>{o.hint}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
          {(['asc', 'desc'] as SortDir[]).map((dir) => (
            <Pressable
              key={dir}
              onPress={() => apply(dir)}
              disabled={!enough}
              accessibilityRole="button"
              accessibilityLabel={dir === 'asc' ? 'Sort ascending' : 'Sort descending'}
              style={({ pressed }) => ({
                flex: 1, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 8,
                borderWidth: 1.4, borderColor: enough ? GRAY : 'rgba(154,160,170,0.3)',
                backgroundColor: !enough ? 'rgba(20,24,30,0.4)' : pressed ? 'rgba(90,98,110,0.9)' : 'rgba(46,52,62,0.9)',
                opacity: enough ? 1 : 0.5,
              })}>
              <SortArrow down={dir === 'desc'} color={enough ? GRAY : GRAY_DIM} />
              <Text style={{ color: enough ? GRAY : GRAY_DIM, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                {dir === 'asc' ? 'Ascending' : 'Descending'}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={() => { playSfx('buttonTap'); onClose(); }}
          accessibilityRole="button"
          style={({ pressed }) => ({ marginTop: 10, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 7, backgroundColor: pressed ? 'rgba(60,66,74,0.6)' : 'transparent' })}>
          <Text style={{ color: GRAY_DIM, fontSize: 11, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>Cancel</Text>
        </Pressable>
      </ChamferBox>
    </View>
  );
}
