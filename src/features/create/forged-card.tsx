import { type FC } from 'react';
import { Text, View } from 'react-native';
import Svg, { Path, type SvgProps } from 'react-native-svg';

import { DividerPlaque } from '@/components/card-divider';
import { Body, Display, Rune } from '@/constants/theme';

/** Authoring size — same plane as the printed cards (5:7). Parents scale the whole card. */
export const FORGED_W = 230;
export const FORGED_H = 322;
const ART_H = Math.round(FORGED_H * 0.4); // top 40% = art; the divider plaque rides the seam

/**
 * A FORGED card: a code-rendered element that lives among the scanned cards as an equal — same
 * aspect, same reading order as the printed layout: art, the owner's CardDivider seam with its
 * inner-mask plaque carrying the kind label, title, body, footer watermark. It IS its own LOD
 * (one svg + text composites cheaper than a thumb). First clients: the nine class picks. Later:
 * player-authored cards (rasterize-to-webp on edit is the planned optimization).
 */
export function ForgedCard({
  title,
  kindLabel,
  body,
  accentDeep,
  Banner,
}: {
  title: string;
  kindLabel: string;
  body: string;
  accentDeep: string;
  Banner: FC<SvgProps>;
}) {
  return (
    <View style={{ width: FORGED_W, height: FORGED_H, backgroundColor: Rune.sheet, borderWidth: 1.2, borderColor: 'rgba(20,17,12,0.55)', overflow: 'hidden' }}>
      {/* art zone — class-deep ground, the banner (its two domain sigils) standing proud */}
      <View style={{ height: ART_H, backgroundColor: accentDeep, alignItems: 'center', justifyContent: 'flex-start', overflow: 'hidden' }}>
        <Banner width={62} height={ART_H + 12} preserveAspectRatio="xMidYMin meet" />
      </View>
      {/* the 40/60 seam: the divider with its plaque carrying the kind label */}
      <View style={{ position: 'absolute', top: ART_H - (FORGED_W + 14) / (1978.811 / 151.3009) / 2, left: -7, right: -7, alignItems: 'center' }} pointerEvents="none">
        <DividerPlaque width={FORGED_W + 14} maskFill={Rune.sheet}>
          <Text style={{ color: Rune.red, fontSize: 8.5, fontFamily: Body.bold, letterSpacing: 1.6, textTransform: 'uppercase' }}>{kindLabel}</Text>
        </DividerPlaque>
      </View>
      {/* printed-card lower body — typeset against the DH scans (#103 impeccable typeset):
          extrabold caps title, regular near-black body, ~1.7 title:body ratio. */}
      <View style={{ flex: 1, alignItems: 'center', paddingTop: 20, paddingHorizontal: 15 }}>
        <Text numberOfLines={1} style={{ color: Rune.inkText, fontSize: 16, fontFamily: Display.bold, letterSpacing: 0.4, textTransform: 'uppercase' }}>
          {title}
        </Text>
        <Text style={{ color: Rune.inkText, fontSize: 9, lineHeight: 13.5, fontFamily: Body.regular, textAlign: 'justify', alignSelf: 'stretch', marginTop: 7 }}>{body}</Text>
      </View>
      {/* footer, scan-faithful: pen + author left, pipe-separated copyright right, no rule */}
      <View style={{ position: 'absolute', left: 12, right: 12, bottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <Svg width={7} height={7} viewBox="0 0 12 12">
            <Path d="M 1 11 L 3 6 L 9 0 L 12 3 L 6 9 Z M 1 11 L 3.4 9.8" fill={Rune.inkText} />
          </Svg>
          <Text style={{ color: Rune.inkText, fontSize: 6.3, fontFamily: Body.medium, letterSpacing: 0.2 }}>RuneKeep</Text>
        </View>
        <Text style={{ color: Rune.inkText, fontSize: 6.3, fontFamily: Body.medium, letterSpacing: 0.2 }}>RuneKeep © Treehouse109 2026</Text>
      </View>
    </View>
  );
}
