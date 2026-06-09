import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccentPicker } from '@/components/accent-picker';
import { AccentProvider } from '@/components/accent';
import { DesignStage } from '@/components/design-stage';
import { Rune } from '@/constants/theme';
import { SHEET_DESIGN_HEIGHT, SHEET_DESIGN_WIDTH } from '@/lib/design';
import { type Character, SAMPLE_CHARACTER } from './character';
import { ArmorSection } from './components/armor-section';
import { BioSection } from './components/bio-section';
import { HeartSection } from './components/heart-section';
import { HopeStressSection } from './components/hope-stress-section';
import { PortraitSection } from './components/portrait-section';
import { SheetBackground, SheetFrame } from './components/sheet-frame';
import { TraitBanners } from './components/trait-banners';

/**
 * The Daggerheart character sheet. Authored in the 412×892 design space and uniformly scaled by
 * DesignStage (docs/adr/0001); the ink background fills the device while the sheet never stretches.
 * Children are ordered back→front to preserve the mockup's overlaps.
 */
export function CharacterSheetScreen({ character = SAMPLE_CHARACTER }: { character?: Character }) {
  return (
    <AccentProvider>
      <View style={{ flex: 1, backgroundColor: Rune.ink }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <DesignStage designWidth={SHEET_DESIGN_WIDTH} designHeight={SHEET_DESIGN_HEIGHT}>
            <SheetBackground />
            <TraitBanners character={character} />
            <HopeStressSection character={character} />
            <HeartSection character={character} />
            <ArmorSection character={character} />
            <BioSection character={character} />
            <PortraitSection character={character} />
            <SheetFrame />
          </DesignStage>
        </SafeAreaView>
        <AccentPicker />
      </View>
    </AccentProvider>
  );
}
