import { type FC } from 'react';
import { Image as ExpoImage } from 'expo-image';
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
  imageUri,
  pageMark,
}: {
  title: string;
  kindLabel: string;
  body: string;
  accentDeep: string;
  Banner?: FC<SvgProps>;
  /** Player-supplied art (#107 experiences): fills the art zone instead of a banner. */
  imageUri?: string | null;
  /** Deck position (#110): when this card is face 0 of a flip-deck, the gray "1/N" mark by the title. */
  pageMark?: string;
}) {
  return (
    // No frame border (owner: borders mark SELECTION only) — the parchment edge is the card edge.
    <View style={{ width: FORGED_W, height: FORGED_H, backgroundColor: Rune.sheet, overflow: 'hidden' }}>
      {/* art zone — class-deep ground; a banner standing proud, or the player's own image */}
      <View style={{ height: ART_H, backgroundColor: accentDeep, alignItems: 'center', justifyContent: 'flex-start', overflow: 'hidden' }}>
        {imageUri ? (
          <ExpoImage source={{ uri: imageUri }} style={{ width: FORGED_W, height: ART_H }} contentFit="cover" cachePolicy="memory-disk" />
        ) : Banner ? (
          <Banner width={62} height={ART_H + 12} preserveAspectRatio="xMidYMin meet" />
        ) : null}
      </View>
      {/* the 40/60 seam: the divider with its plaque carrying the kind label */}
      <View style={{ position: 'absolute', top: ART_H - (FORGED_W + 14) / (1978.811 / 151.3009) / 2, left: -7, right: -7, alignItems: 'center' }} pointerEvents="none">
        <DividerPlaque width={FORGED_W + 14} maskFill={Rune.sheet}>
          {/* auto-fit: long labels (e.g. "Experience") shrink to stay inside the plaque slot
              instead of bleeding past the mask edges (#110). */}
          <View style={{ maxWidth: 104, alignItems: 'center' }}>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
              style={{ color: Rune.red, fontSize: 8.5, fontFamily: Body.bold, letterSpacing: kindLabel.length > 8 ? 0.8 : 1.6, textTransform: 'uppercase' }}>
              {kindLabel}
            </Text>
          </View>
        </DividerPlaque>
      </View>
      {/* printed-card lower body — typeset against the DH scans (#103 impeccable typeset):
          extrabold caps title, regular near-black body, ~1.7 title:body ratio. */}
      <View style={{ flex: 1, alignItems: 'center', paddingTop: 20, paddingHorizontal: 15 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 5 }}>
          <Text numberOfLines={1} style={{ color: Rune.inkText, fontSize: 16, fontFamily: Display.bold, letterSpacing: 0.4, textTransform: 'uppercase' }}>
            {title}
          </Text>
          {pageMark ? <Text style={{ color: Rune.inkMuted, fontSize: 7.5, fontFamily: Body.bold }}>{pageMark}</Text> : null}
        </View>
        <Text style={{ color: Rune.inkText, fontSize: 9, lineHeight: 13.5, fontFamily: Body.regular, textAlign: 'justify', alignSelf: 'stretch', marginTop: 7 }}>{body}</Text>
      </View>
      <ForgedFooter />
    </View>
  );
}

/** Scan-faithful print line: pen + author left, copyright right, no rule. Shared by all forged cards. */
function ForgedFooter() {
  return (
    <View style={{ position: 'absolute', left: 12, right: 12, bottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        <Svg width={7} height={7} viewBox="0 0 12 12">
          <Path d="M 1 11 L 3 6 L 9 0 L 12 3 L 6 9 Z M 1 11 L 3.4 9.8" fill={Rune.inkText} />
        </Svg>
        <Text style={{ color: Rune.inkText, fontSize: 6.3, fontFamily: Body.medium, letterSpacing: 0.2 }}>RuneKeep</Text>
      </View>
      <Text style={{ color: Rune.inkText, fontSize: 6.3, fontFamily: Body.medium, letterSpacing: 0.2 }}>RuneKeep © Treehouse109 2026</Text>
    </View>
  );
}

/**
 * A forged RULES card: the class feature + hope feature text in the printed-card layout. One
 * class may need 2–3 of these (see featurePages); the header carries the page mark. Same plaque
 * seam, same footer — it lives among the scans as an equal.
 */
export function ForgedTextCard({
  title,
  kindLabel,
  pageMark,
  sections,
  accentDeep,
  Banner,
}: {
  title: string;
  kindLabel: string;
  pageMark?: string;
  sections: { name: string; text: string }[];
  accentDeep: string;
  Banner: FC<SvgProps>;
}) {
  // UNIFORM layout (#105): same 40% art band, same seam position, same banner size as the class
  // pick card — the divider never moves between forged cards. Less text per card; more cards.
  return (
    <View style={{ width: FORGED_W, height: FORGED_H, backgroundColor: Rune.sheet, overflow: 'hidden' }}>
      <View style={{ height: ART_H, backgroundColor: accentDeep, alignItems: 'center', justifyContent: 'flex-start', overflow: 'hidden' }}>
        <Banner width={62} height={ART_H + 12} preserveAspectRatio="xMidYMin meet" />
      </View>
      <View style={{ position: 'absolute', top: ART_H - (FORGED_W + 14) / (1978.811 / 151.3009) / 2, left: -7, right: -7, alignItems: 'center' }} pointerEvents="none">
        <DividerPlaque width={FORGED_W + 14} maskFill={Rune.sheet}>
          <Text numberOfLines={1} style={{ color: Rune.red, fontSize: 8, fontFamily: Body.bold, letterSpacing: 1.2, textTransform: 'uppercase' }}>{kindLabel}</Text>
        </DividerPlaque>
      </View>
      <View style={{ flex: 1, paddingTop: 19, paddingHorizontal: 14, paddingBottom: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 5 }}>
          <Text numberOfLines={1} style={{ color: Rune.inkText, fontSize: 14, fontFamily: Display.bold, letterSpacing: 0.4, textTransform: 'uppercase' }}>
            {title}
          </Text>
          {pageMark ? <Text style={{ color: Rune.inkMuted, fontSize: 7.5, fontFamily: Body.bold }}>{pageMark}</Text> : null}
        </View>
        <View style={{ marginTop: 5, gap: 5, overflow: 'hidden', flex: 1 }}>
          {sections.map((s) => (
            <Text key={s.name} style={{ color: Rune.inkText, fontSize: 9, lineHeight: 13, fontFamily: Body.regular, textAlign: 'justify' }}>
              <Text style={{ fontFamily: Body.bold }}>{s.name}: </Text>
              {s.text}
            </Text>
          ))}
        </View>
      </View>
      <ForgedFooter />
    </View>
  );
}
