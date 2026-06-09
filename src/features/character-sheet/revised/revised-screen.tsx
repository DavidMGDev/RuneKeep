import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccentProvider } from '@/components/accent';
import { AccentPicker } from '@/components/accent-picker';
import { DesignStage } from '@/components/design-stage';
import { VariantSwitcher } from '@/components/variant-switcher';
import { Rune } from '@/constants/theme';
import { SHEET_DESIGN_HEIGHT, SHEET_DESIGN_WIDTH } from '@/lib/design';
import { CarouselProvider } from '../carousel-context';
import { type Character, SAMPLE_CHARACTER } from '../character';
import { BioSection } from '../components/bio-section';
import { CardCarousel } from '../components/card-carousel';
import { GearDecoration } from '../components/gear-decoration';
import { PortraitSection } from '../components/portrait-section';
import { SheetBackground, SheetFrame } from '../components/sheet-frame';
import { TraitBanners } from '../components/trait-banners';
import { RevisedStats } from './revised-stats';

/**
 * Revised variant: the original layout with enlarged, thumb-tappable stat icons + bigger numerals.
 * The original screen is untouched; this reuses its header / traits / carousel / gear / frame and
 * swaps in {@link RevisedStats}.
 */
export function RevisedScreen({ character = SAMPLE_CHARACTER }: { character?: Character }) {
  return (
    <AccentProvider>
      <CarouselProvider>
        <View style={{ flex: 1, backgroundColor: Rune.ink }}>
          <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
            <DesignStage designWidth={SHEET_DESIGN_WIDTH} designHeight={SHEET_DESIGN_HEIGHT}>
              <SheetBackground />
              <TraitBanners character={character} modifierSize={24} />
              <RevisedStats character={character} />
              <BioSection character={character} />
              <PortraitSection character={character} />
              <GearDecoration />
              <SheetFrame />
              <CardCarousel />
            </DesignStage>
          </SafeAreaView>
          <AccentPicker />
          <VariantSwitcher />
        </View>
      </CarouselProvider>
    </AccentProvider>
  );
}
