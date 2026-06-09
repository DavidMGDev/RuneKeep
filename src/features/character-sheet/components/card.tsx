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
 * The soft shadow is on the container, not the art, to sell the "floating card" feel.
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
        elevation: 8,
      }}>
      <Image source={item.source} style={{ width: '100%', height: '100%' }} contentFit="fill" />
    </View>
  );
}
