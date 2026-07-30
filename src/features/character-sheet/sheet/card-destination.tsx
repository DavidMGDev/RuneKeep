import { Pressable, Text, View } from 'react-native';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, Rune } from '@/constants/theme';
import { DimScreen } from '@/lib/screen-dim';
import { playSfx } from '@/lib/sfx';

import { type CardCategory } from '../card-data';
import { categoryLabel, type CustomCategory, destinationOrder } from '../carousel-categories';
import { CategoryGlyph } from './deck-toggle-icon';
import { CenterDialog } from './full-screen-panel';

const SCRIM = 'rgba(20,24,31,0.7)';
const GOLD_BORDER = 'rgba(218,162,73,0.4)';

/**
 * "Where does this card go?" (v0.24.3).
 *
 * A new card used to land silently in whichever category happened to be on screen, which is right
 * about half the time and invisible either way. Every card that ARRIVES now asks once: creation
 * (quick and advanced) and NFC receiving both route through here, so the answer is always the
 * player's and always the same question.
 *
 * The suggested category leads the list and is pre-marked, so the common case is one tap.
 */
export function CardDestination({
  title = 'Where does it go?',
  cardTitle,
  categories,
  customCategories,
  suggested,
  onPick,
  onCancel,
  cancelLabel = 'Cancel',
}: {
  title?: string;
  /** The card's own title, echoed so the player knows what they are filing. */
  cardTitle?: string;
  /** Every category this card may land in (the sheet's move targets: no Beastform, no Martial Form). */
  categories: CardCategory[];
  customCategories: CustomCategory[];
  /** The category to lead with (the one being viewed). */
  suggested?: CardCategory;
  onPick: (key: CardCategory) => void;
  onCancel: () => void;
  cancelLabel?: string;
}) {
  const ordered = destinationOrder(categories, suggested);
  return (
    <CenterDialog onClose={onCancel} zIndex={10006} scrimOpacity={0.88} dismissOnScrim={false}>
      <DimScreen opacity={0.88} />
      <ChamferBox chamfer={14} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} style={{ width: 320, paddingHorizontal: 16, paddingVertical: 16 }}>
        <Text style={{ color: Rune.goldText, fontSize: 16, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.4 }}>{title}</Text>
        <Text style={{ color: Rune.muted, fontSize: 11.5, fontFamily: Body.regular, lineHeight: 17, marginTop: 4, marginBottom: 13 }}>
          {cardTitle ? `Pick the deck "${cardTitle}" joins.` : 'Pick the deck it joins.'}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
          {ordered.map((key) => {
            const lead = key === suggested;
            return (
              <Pressable
                key={key}
                onPress={() => { playSfx('buttonTap'); onPick(key); }}
                accessibilityRole="button"
                accessibilityLabel={`Send to ${categoryLabel(key, customCategories)}`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, height: 36, borderRadius: 5, backgroundColor: SCRIM, borderWidth: 1, borderColor: lead ? Rune.goldEdge : GOLD_BORDER }}>
                  <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    <View style={{ transform: [{ scale: 22 / 46 }] }}>
                      <CategoryGlyph category={key} />
                    </View>
                  </View>
                  <Text style={{ color: lead ? Rune.goldText : Rune.sheet, fontSize: 12.5, fontFamily: Body.bold }}>{categoryLabel(key, customCategories)}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        <RuneButton label={cancelLabel} kind="ghost" height={42} style={{ marginTop: 16 }} onPress={onCancel} />
      </ChamferBox>
    </CenterDialog>
  );
}
