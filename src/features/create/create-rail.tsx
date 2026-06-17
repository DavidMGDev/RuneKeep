import { type ReactNode, useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { Rune } from '@/constants/theme';

/** The horizontal deck rail with a thin custom scroll indicator (#110): a faint track with a gold
 *  thumb sized to the visible fraction, tracking scroll position — replaces the old static chevron. */
export function DeckRail({ children }: { children: ReactNode }) {
  const scrollX = useSharedValue(0);
  const [viewW, setViewW] = useState(0);
  const [contentW, setContentW] = useState(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
  });
  const overflow = contentW > viewW + 2;
  const trackW = Math.max(0, viewW - 4); // track sits inside 2px side margins
  const thumbW = overflow ? Math.max(28, trackW * (viewW / contentW)) : 0;
  const thumbStyle = useAnimatedStyle(() => {
    const maxScroll = Math.max(1, contentW - viewW);
    const x = Math.min(1, Math.max(0, scrollX.value / maxScroll)) * (trackW - thumbW);
    return { transform: [{ translateX: x }] };
  });
  return (
    <View style={{ marginTop: 6 }}>
      <Animated.ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        onLayout={(e) => setViewW(e.nativeEvent.layout.width)}
        onContentSizeChange={(w) => setContentW(w)}
        contentContainerStyle={{ gap: 4, paddingRight: 8 }}>
        {children}
      </Animated.ScrollView>
      {overflow ? (
        <View style={{ height: 2.5, marginTop: 5, marginHorizontal: 2, borderRadius: 2, backgroundColor: 'rgba(147,142,136,0.18)', overflow: 'hidden' }}>
          <Animated.View style={[{ height: '100%', width: thumbW, borderRadius: 2, backgroundColor: Rune.goldEdge }, thumbStyle]} />
        </View>
      ) : null}
    </View>
  );
}
