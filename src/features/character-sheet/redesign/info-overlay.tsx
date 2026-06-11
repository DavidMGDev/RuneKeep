import { Pressable, View } from 'react-native';

import { ArtImage } from '@/components/art-image';
import { box } from '@/lib/design';
import { CARD_DECKS } from '../card-data';

// Placeholder explainer art (a card for now, per owner) — NOT routed through the carousel's
// random-card system; this overlay is its own thing (#37).
const PLACEHOLDER = CARD_DECKS.abilities[0].source;

/**
 * The hit-points info overlay: darkens the whole screen (oversized past the unclipped stage, like
 * the carousel dims) and shows a placeholder explainer image. Tap anywhere to dismiss.
 */
export function InfoOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <Pressable
      style={[box(-120, -160, 652, 1212), { backgroundColor: 'rgba(6,8,13,0.82)', zIndex: 4500 }]}
      onPress={onClose}
      accessibilityViewIsModal
      accessibilityRole="button"
      accessibilityLabel="Hit points info"
      accessibilityHint="Double tap to close">
      {/* centered placeholder card (offset back into design space: overlay origin is -120,-160) */}
      <View style={box(120 + 86, 160 + 264, 240, 336)} pointerEvents="none">
        <ArtImage source={PLACEHOLDER} fit="contain" />
      </View>
    </Pressable>
  );
}
