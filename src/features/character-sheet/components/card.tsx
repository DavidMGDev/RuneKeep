import { Image } from 'expo-image';
import { View } from 'react-native';

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
