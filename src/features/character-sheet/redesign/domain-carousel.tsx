import { Image } from 'expo-image';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ChamferBox } from '@/components/chamfer-box';
import { Body, Rune } from '@/constants/theme';

import type { DomainCardInfo } from './settings-panel';

const CARD_W = 150;
const CARD_H = 210;
const GAP = 12;

/**
 * A horizontal, swipeable carousel of domain cards for the level-up picker (#168) — full card art,
 * snap-to-card, tap to select. A plain horizontal ScrollView (NOT the sheet's gesture carousel), so
 * it nests cleanly inside the level-up panel's vertical scroll.
 */
export function DomainCarousel({ cards, selectedId, onSelect }: { cards: DomainCardInfo[]; selectedId?: string; onSelect: (id: string) => void }) {
  if (cards.length === 0) return <Text style={{ color: Rune.muted, fontSize: 12, fontFamily: Body.regular }}>No new domain cards available.</Text>;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={CARD_W + GAP}
      decelerationRate="fast"
      nestedScrollEnabled
      contentContainerStyle={{ gap: GAP, paddingVertical: 4, paddingHorizontal: 2 }}>
      {cards.map((c) => {
        const on = selectedId === c.id;
        return (
          <Pressable key={c.id} onPress={() => onSelect(c.id)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={c.title}>
            <View style={{ width: CARD_W }}>
              <ChamferBox chamfer={10} fill="rgba(20,24,31,0.6)" stroke={on ? Rune.red : 'rgba(218,162,73,0.5)'} strokeWidth={on ? 2.4 : 1.4} style={{ width: CARD_W, height: CARD_H, alignItems: 'center', justifyContent: 'center' }}>
                <Image source={c.source ?? c.thumb} style={{ width: CARD_W - 9, height: CARD_H - 9, borderRadius: 4, backgroundColor: '#000' }} contentFit="cover" />
                {on ? (
                  <View style={{ position: 'absolute', top: 7, right: 7, width: 24, height: 24, borderRadius: 12, backgroundColor: Rune.red, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: Rune.ivory, fontSize: 14, fontFamily: Body.bold }}>✓</Text>
                  </View>
                ) : null}
              </ChamferBox>
              <Text numberOfLines={1} style={{ color: on ? Rune.goldBright : Rune.sheet, fontSize: 12, fontFamily: Body.bold, textAlign: 'center', marginTop: 5 }}>{c.title}</Text>
              <Text style={{ color: Rune.muted, fontSize: 10, fontFamily: Body.regular, textAlign: 'center' }}>{[c.domain, c.level != null ? `Lvl ${c.level}` : null].filter(Boolean).join(' · ')}</Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
