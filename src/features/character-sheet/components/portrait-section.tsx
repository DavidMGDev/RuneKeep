import { Image } from 'expo-image';
import { View } from 'react-native';

import { ArtImage } from '@/components/art-image';
import { PressableArt } from '@/components/pressable-art';
import { box } from '@/lib/design';
import { Art } from '../art';
import type { Character } from '../character';

export function PortraitSection({ character }: { character: Character }) {
  return (
    <PressableArt style={box(20.3, 38.5, 140.3, 278.7)} pressedScale={1.04}>
      {/* Portrait photo if present, otherwise the silhouette placeholder */}
      {character.portraitUri ? (
        <View style={[box(12, 14, 116, 250), { overflow: 'hidden', borderRadius: 8 }]}>
          <Image source={{ uri: character.portraitUri }} contentFit="cover" style={{ width: '100%', height: '100%' }} />
        </View>
      ) : (
        <View style={box(36.8, 47.5, 63.8, 103)}>
          <ArtImage source={Art.portraitPlaceholder} fit="contain" />
        </View>
      )}

      {/* Ornate frame (transparent center) sits on top */}
      <View style={box(0, 0, 140.3, 278.7)}>
        <ArtImage source={Art.portraitFrame} fit="contain" />
      </View>

      {/* Add/change-photo affordance near the bottom */}
      <View style={box(41.5, 214.1, 39.6, 41.8)}>
        <ArtImage source={Art.portraitIcon} fit="contain" />
      </View>
    </PressableArt>
  );
}
