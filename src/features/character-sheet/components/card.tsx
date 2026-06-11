import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Rune } from '@/constants/theme';
import type { CardItem } from '../card-data';

interface CardProps {
  item: CardItem;
  width: number;
  height: number;
}

/**
 * A single card. Renders the PNG AS IS (no rounded corners, no crop). Kept deliberately thin and
 * fixed-size so a future custom-card renderer (HTML/CSS-style content) can drop in at the same size.
 * Soft shadow via the iOS/web shadow props only — NO Android `elevation`: a native elevation shadow
 * re-renders per frame under animated transforms, and 5-7 of them tanked the carousel (issue #41).
 */
/**
 * The blank back a far-from-center slot shows instead of its real art (#48 B): same size and aspect
 * as the card, a flat parchment rectangle with a gold hairline. Solid fills are nearly free to
 * composite, unlike a 750x1050 texture — the hand "fades into blank cards" as it leaves the center.
 */
export function CardBack() {
  return (
    <View
      style={[
        StyleSheet.absoluteFillObject,
        { backgroundColor: Rune.ivory, borderRadius: 6, borderWidth: 1.5, borderColor: Rune.gold },
      ]}
    />
  );
}

export function Card({ item, width, height }: CardProps) {
  return (
    <View
      style={{
        width,
        height,
        shadowColor: '#000',
        shadowOpacity: 0.45,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 6 },
      }}>
      <Image
        source={item.source}
        style={{ width: '100%', height: '100%' }}
        contentFit="fill"
        cachePolicy="memory-disk"
        recyclingKey={item.id}
        transition={0}
      />
    </View>
  );
}
