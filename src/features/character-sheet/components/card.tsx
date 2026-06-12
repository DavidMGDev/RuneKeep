import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import type { CardItem } from '../card-data';

interface CardProps {
  item: CardItem;
  width: number;
  height: number;
}

/**
 * The LOW-LOD card layer (#78): the 188x263 thumb, mounted on EVERY slot forever. 16x fewer
 * pixels than the full art — a whole 18-card deck of these composites for less than two full
 * cards, which is what makes the gear grind cheap. The full-res Card fades in on top near the
 * fan's center; the upscale blur underneath reads as depth-of-field, not as a placeholder.
 */
export function CardThumb({ item }: { item: CardItem }) {
  return (
    <Image
      source={item.thumb}
      style={StyleSheet.absoluteFillObject}
      contentFit="fill"
      cachePolicy="memory-disk"
      recyclingKey={`${item.id}-lod`}
      transition={0}
    />
  );
}

/**
 * A single FULL-RES card. Renders the image AS IS (no rounded corners, no crop). Kept deliberately
 * thin and fixed-size so a future custom-card renderer (HTML/CSS-style content) can drop in at the
 * same size. `transition` cross-fades the decode over the thumb beneath (#78). Soft shadow via the
 * iOS/web shadow props only — NO Android `elevation`: a native elevation shadow re-renders per
 * frame under animated transforms, and 5-7 of them tanked the carousel (issue #41).
 */
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
        transition={150}
      />
    </View>
  );
}
