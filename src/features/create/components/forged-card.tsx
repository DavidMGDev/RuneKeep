import { type FC } from 'react';
import { Image as ExpoImage } from 'expo-image';
import { Text, type TextProps, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop, type SvgProps } from 'react-native-svg';

import { CardMarkdownBody } from '@/components/card-markdown';
import { DividerPlaque, getPlaqueTheme } from './card-divider';
import { Body, Display, Rune } from '@/constants/theme';
import { type ClassName } from '@/constants/identity';
import { type ArmorDef, type WeaponDef } from '@/data/equipment-data';
import { type LootDef, lootTable } from '@/data/loot-data';
import { fitText, fitTitle, MIN_LINE_RATIO } from '@/lib/fit-text';

/** Authoring size — same plane as the printed cards (5:7). Parents scale the whole card. */
export const FORGED_W = 230;
export const FORGED_H = 322;
/** Top 40% = art; the divider plaque rides the seam. Exported so the quick-card art gesture can
 *  charge over exactly the art band and nothing else. */
export const ART_H = Math.round(FORGED_H * 0.4);

/**
 * The class banners' shape, stated rather than inferred (v0.35.2, owner).
 *
 * They were drawn into a 62 x (ART_H + 12) box and left to letterbox themselves with
 * `preserveAspectRatio`. Native honours that; the web build stretched them instead, so every class
 * card in a browser had a banner reaching down past the divider and into the text. All nine base
 * banners are within half a percent of this ratio, so giving the box the banner's own shape means
 * there is nothing left to stretch, on any platform, whatever the renderer does with the attribute.
 */
const BANNER_W = 62;
const BANNER_H = Math.round(BANNER_W * (2045.3123 / 1304));

/**
 * A card that IS a printed face (v0.25.0): one bitmap, edge to edge, no plaque and no text.
 *
 * The Hope and Fear ancestries use this. There is nothing to lay out because the publisher already
 * laid it out, so the only thing that matters is that it occupies exactly the same box as every other
 * forged card. The mixed-ancestry cross-out is drawn OVER it by `TraitCrossOut`, at positions measured
 * against this exact size, so changing the box without re-measuring would slide every strike off its
 * line.
 */
export function ForgedFaceCard({ face }: { face: number | string }) {
  /**
   * v0.35 (owner): NO plate, and the picture fills the card.
   *
   * v0.34.8 laid a URI face on parchment and fitted it inside, which was wrong twice. A card exported
   * with rounded corners showed four parchment triangles, because the plate was visible exactly where
   * the artwork was not; and a picture that was not 5:7 changed the SIZE of the card, so a hand of
   * imported cards was a hand of different-sized cards.
   *
   * Filling the card's own 5:7 and cropping the overflow makes every card the same size, and a
   * transparent ground lets a rounded corner be a rounded corner. A few pixels off a long edge is a
   * far smaller lie than a card that is the wrong shape.
   */
  const uri = typeof face === 'string';
  return (
    <View style={{ width: FORGED_W, height: FORGED_H, overflow: 'hidden' }}>
      <ExpoImage source={uri ? { uri: face } : face} style={{ width: FORGED_W, height: FORGED_H }} contentFit="cover" cachePolicy="memory-disk" />
    </View>
  );
}

/** Auto-fit plaque text helper: tightly squeezes long labels (like "Experience") so they don't bleed out of the plaque */
export function PlaqueLabel({ text, textColor }: { text: string; textColor: string }) {
  return (
    <View style={{ maxWidth: 104, alignItems: 'center' }}>
      <CardText
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        style={{
          color: textColor,
          fontSize: text.length >= 8 ? 7.6 : 8.5,
          fontFamily: Body.bold,
          letterSpacing: text.length >= 8 ? 0.4 : 1.5,
          textTransform: 'uppercase',
        }}
      >
        {text}
      </CardText>
    </View>
  );
}

const BODY_TEXT_W = FORGED_W - 30; // paddingHorizontal 15 either side
const BODY_LINE_RATIO = 14 / 10.5; // the v0.13.0 typeset, kept as the text shrinks
/** Pinned, like the equipment cards' rows: an unset line height is taller on Android than in a
 *  browser, which is how a card can fit on one platform and print over its footer on the other. */
const BODY_TITLE_H = 21;
const BODY_SUB_H = 11;
/**
 * Room kept clear ABOVE the footer watermark (v0.32.2).
 *
 * The body box ends 24px from the card's bottom edge and the footer sits 8px from it, so there were
 * only about 9px between the last line of a description and the word RuneKeep. Any disagreement at
 * all between what the size calculation expects and what a renderer draws landed inside that gap.
 * Six of the nine are now reserved, which costs a fraction of a point of type and buys the clearance.
 */
const FOOTER_GUARD = 6;

/**
 * Android's own extra height, switched off (v0.33.0).
 *
 * MEASURED: Archivo's line box is 1.088 em and its win metrics are 1.51 em. Android's `Text` defaults
 * to `includeFontPadding: true`, which pads a text block out to the WIN metrics whatever its line
 * height says, so every block on a phone is about 0.42 em taller than the same block in a browser.
 * At 10.5pt that is 4.4dp, appearing at the bottom of the block, in the 9dp between the body box and
 * the footer watermark.
 *
 * That is why a description could bleed into the footer on a phone and not on the web, and it is the
 * one native-only term left in the card's vertical budget. The size calculation aims to fill the box
 * exactly, so any extra at all lands outside it. With this off, both platforms draw what the
 * arithmetic asked for. iOS and web ignore the prop.
 */
const NO_FONT_PAD = { includeFontPadding: false } as const;

/**
 * The DEVICE font scale, switched off for the card (v0.34.0).
 *
 * This is what was still cutting descriptions off on a phone, and it is measurable rather than
 * theoretical. Working back from the owner's screenshot, where the card is drawn 648 image pixels
 * wide for its 230 design px:
 *
 *   the body's first line   renders at ~9.67 against a chosen  8.5
 *   the footer's copyright  renders at ~7.13 against a declared 6.3
 *   the title               renders at ~20.2 against a declared 17
 *
 * Three independent strings, all about 1.15, which is Android's second text-size step. The size
 * calculation was right every time and the renderer multiplied it afterwards, so a body computed to
 * fill its box exactly overflowed it by about fifteen percent and the last line was clipped.
 *
 * A forged card is a fixed-size printed artifact, and `fitText` already chooses a size to fit its
 * geometry. A second multiplier applied after that calculation cannot make the card readable, only
 * overflowing. So the card opts out and its own auto-fit remains the sizing mechanism; a card that
 * needs to be bigger is opened full screen.
 */
const FIXED_TYPE = { allowFontScaling: false } as const;

/** Every piece of type on a forged card: no OS font scale, no Android font padding. */
function CardText({ style, ...rest }: TextProps) {
  return <Text {...FIXED_TYPE} {...rest} style={[NO_FONT_PAD, style]} />;
}

/**
 * The generic card's description, sized to what is left under its own title (v0.30.0).
 *
 * v0.36: the title band is fixed (see `fitTitle`), so this no longer counts title lines. `multiline`
 * survives on the props because callers pass it, and it no longer changes the geometry.
 */
function BodyText({ body, title, hasSubtitle }: { body: string; title: string; hasSubtitle: boolean }) {
  const named = !!title.trim();
  const room =
    FORGED_H - ART_H - 20 - 24 // lower body, less paddingTop / paddingBottom
    - (named ? BODY_TITLE_H : 0)
    - (hasSubtitle ? BODY_SUB_H + 3 : 0) // its own marginTop rides with it
    - (named ? 6 : 0); // the body's marginTop
  // v0.32.0: the leading may tighten to 1.05 before the font gives way. A description full of blank
  // lines is the case that needed it: it could not fit at the old fixed leading, so it fell through
  // to a truncated line count and printed over the footer on Android.
  const fit = fitText(body, { width: BODY_TEXT_W, height: room - FOOTER_GUARD, base: 10.5, lineRatio: BODY_LINE_RATIO, minRatio: MIN_LINE_RATIO });
  return (
    <CardMarkdownBody
      body={body}
      // v0.13.0 typeset vs the DH scans: LEFT aligned like the prints (justify opened rivers at this
      // measure), black-weight title above.
      style={{ color: Rune.inkText, fontSize: fit.fontSize, lineHeight: fit.lineHeight, fontFamily: Body.regular, textAlign: 'left', alignSelf: 'stretch', marginTop: named ? 6 : 0, flexShrink: 1, ...NO_FONT_PAD }}
    />
  );
}

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
  subtitle,
  body,
  accentDeep,
  Banner,
  imageUri,
  colorArt,
  fallbackArt,
  pageMark,
  multilineTitle,
  classKey,
  experience,
  modifier,
}: {
  title: string;
  kindLabel: string;
  /** v0.14.0: a small centered line under the title — the subclass tier word (Foundation /
   *  Specialization / Mastery), which the official subclass scans bake into their art. */
  subtitle?: string;
  body: string;
  accentDeep: string;
  Banner?: FC<SvgProps>;
  /** Player-supplied art (#107 experiences): fills the art zone instead of a banner. */
  imageUri?: string | null;
  /** A flat random fill color for the art zone (#153) — used when there's no uploaded image. */
  colorArt?: string | null;
  /** Default art (#128 inventory items) shown when there's no player image and no banner. */
  fallbackArt?: number;
  /** Deck position (#110): when this card is face 0 of a flip-deck, the gray "1/N" mark by the title. */
  pageMark?: string;
  /** Custom cards (#136): let a long title wrap to up to 3 shrinking rows instead of ellipsizing,
   *  and shrink the body to fit. One short line stays at full size. */
  multilineTitle?: boolean;
  classKey?: ClassName;
  /** Experience card (#202): no body — the title is a big auto-fitting phrase (up to 7 lines), with
   *  the experience's bonus shown below. Short and long phrases both read well (min/max size). */
  experience?: boolean;
  /** The experience bonus to show (e.g. +2), experience cards only. */
  modifier?: number;
}) {
  const theme = getPlaqueTheme(kindLabel, classKey);
  // v0.36: the title is sized here, from the text, into a band that never changes height.
  const titleFit = fitTitle(title, BODY_TEXT_W, BODY_TITLE_H, 17);
  void multilineTitle; // the band is fixed now, so a long title shrinks instead of taking rows.
  return (
    // No frame border (owner: borders mark SELECTION only) — the parchment edge is the card edge.
    <View style={{ width: FORGED_W, height: FORGED_H, backgroundColor: Rune.sheet, overflow: 'hidden' }}>
      {/* art zone — class-deep ground (or a flat random color, #153); a banner, or the player's image */}
      <View style={{ height: ART_H, backgroundColor: !imageUri && colorArt ? colorArt : accentDeep, alignItems: 'center', justifyContent: 'flex-start', overflow: 'hidden' }}>
        {imageUri ? (
          <ExpoImage source={{ uri: imageUri }} style={{ width: FORGED_W, height: ART_H }} contentFit="cover" cachePolicy="memory-disk" />
        ) : colorArt ? null : fallbackArt != null ? (
          <ExpoImage source={fallbackArt} style={{ width: FORGED_W, height: ART_H }} contentFit="cover" cachePolicy="memory-disk" />
        ) : Banner ? (
          <Banner width={BANNER_W} height={BANNER_H} preserveAspectRatio="xMidYMin meet" />
        ) : null}
      </View>
      {/* the 40/60 seam: the divider with its plaque carrying the kind label */}
      <View style={{ position: 'absolute', top: ART_H - (FORGED_W + 14) / (1978.811 / 151.3009) / 2, left: -7, right: -7, alignItems: 'center' }} pointerEvents="none">
        <DividerPlaque width={FORGED_W + 14} gradientStops={theme.gradientStops} maskFill={theme.solidColor}>
          <PlaqueLabel text={kindLabel} textColor={theme.textColor} />
        </DividerPlaque>
      </View>
      {/* printed-card lower body — typeset against the DH scans (#103 impeccable typeset):
          extrabold caps title, regular near-black body, ~1.7 title:body ratio. */}
      {experience ? (
        // Experience (#202/#233): the phrase fills the area ABOVE a FIXED bonus pill. The title block
        // is absolutely bounded (top..just above the pill) so it auto-fits within that band, and the
        // +N pill is anchored at a constant height regardless of how many lines the title takes.
        <View style={{ flex: 1 }}>
          <View style={{ position: 'absolute', top: 16, left: 16, right: 16, bottom: 58, alignItems: 'center', justifyContent: 'center' }}>
            <CardText
              numberOfLines={7}
              adjustsFontSizeToFit
              minimumFontScale={0.42}
              style={{ color: Rune.inkText, fontSize: 23, lineHeight: 26, fontFamily: Display.bold, letterSpacing: 0.2, textAlign: 'center' }}>
              {title}
            </CardText>
          </View>
          {modifier != null ? (
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 30, alignItems: 'center' }}>
              <View style={{ paddingHorizontal: 14, paddingVertical: 3, backgroundColor: Rune.red }}>
                <CardText style={{ color: Rune.ivory, fontSize: 17, fontFamily: Display.black, letterSpacing: 0.5 }}>{modifier >= 0 ? `+${modifier}` : `${modifier}`}</CardText>
              </View>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={{ flex: 1, alignItems: 'center', paddingTop: 20, paddingHorizontal: 15, paddingBottom: 24 }}>
          {/* #318: a titleless card (e.g. a note with only a body) drops the title row entirely and lets
              the body fill from the top — no "Untitled"/"Note" placeholder. */}
          {title.trim() ? (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 5, alignSelf: 'stretch' }}>
              {/* v0.36.3: `adjustsFontSizeToFit` is BACK, on top of the computed size, as a backstop.
                  It does nothing on the web, where the arithmetic is the only thing sizing the card,
                  and on a phone it shrinks a shade further if the real font is a hair wider than the
                  letter table says. The two used to disagree; now the calculation leads and native
                  corrects, and neither can produce an ellipsis. */}
              <CardText
                numberOfLines={titleFit.lines || 1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
                style={{ flexShrink: 1, color: Rune.inkText, fontSize: titleFit.fontSize, lineHeight: titleFit.lineHeight, fontFamily: Display.black, letterSpacing: 0.3, textTransform: 'uppercase', textAlign: 'center', ...NO_FONT_PAD }}>
                {title}
              </CardText>
              {pageMark ? <CardText style={{ color: Rune.inkMuted, fontSize: 7.5, fontFamily: Body.bold }}>{pageMark}</CardText> : null}
            </View>
          ) : pageMark ? (
            <CardText style={{ alignSelf: 'flex-end', color: Rune.inkMuted, fontSize: 7.5, fontFamily: Body.bold }}>{pageMark}</CardText>
          ) : null}
          {subtitle ? (
            <CardText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ color: Rune.inkMuted, fontSize: 8.5, lineHeight: BODY_SUB_H, fontFamily: Body.bold, letterSpacing: 1.1, textTransform: 'uppercase', textAlign: 'center', marginTop: 3, ...NO_FONT_PAD }}>
              {subtitle}
            </CardText>
          ) : null}
          {/* v0.30.0: sized to the room actually left under this card's own title, so a long
              description shrinks instead of running into the footer. A body that already fits keeps
              the 10.5/14 typeset exactly, which is most of them. */}
          <BodyText body={body} title={title} hasSubtitle={!!subtitle} />
        </View>
      )}
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
        <CardText style={{ color: Rune.inkText, fontSize: 6.3, fontFamily: Body.medium, letterSpacing: 0.2 }}>RuneKeep</CardText>
      </View>
      <CardText style={{ color: Rune.inkText, fontSize: 6.3, fontFamily: Body.medium, letterSpacing: 0.2 }}>RuneKeep © Treehouse109 2026</CardText>
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
  classKey,
}: {
  title: string;
  kindLabel: string;
  pageMark?: string;
  sections: { name: string; text: string }[];
  accentDeep: string;
  Banner: FC<SvgProps>;
  classKey?: ClassName;
}) {
  const theme = getPlaqueTheme(kindLabel, classKey);
  // UNIFORM layout (#105): same 40% art band, same seam position, same banner size as the class
  // pick card — the divider never moves between forged cards. Less text per card; more cards.
  return (
    <View style={{ width: FORGED_W, height: FORGED_H, backgroundColor: Rune.sheet, overflow: 'hidden' }}>
      <View style={{ height: ART_H, backgroundColor: accentDeep, alignItems: 'center', justifyContent: 'flex-start', overflow: 'hidden' }}>
        <Banner width={BANNER_W} height={BANNER_H} preserveAspectRatio="xMidYMin meet" />
      </View>
      <View style={{ position: 'absolute', top: ART_H - (FORGED_W + 14) / (1978.811 / 151.3009) / 2, left: -7, right: -7, alignItems: 'center' }} pointerEvents="none">
        <DividerPlaque width={FORGED_W + 14} gradientStops={theme.gradientStops} maskFill={theme.solidColor}>
          <PlaqueLabel text={kindLabel} textColor={theme.textColor} />
        </DividerPlaque>
      </View>
      <View style={{ flex: 1, paddingTop: 19, paddingHorizontal: 14, paddingBottom: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 5 }}>
          <CardText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55} style={{ flexShrink: 1, color: Rune.inkText, fontSize: 15, fontFamily: Display.black, letterSpacing: 0.3, textTransform: 'uppercase' }}>
            {title}
          </CardText>
          {pageMark ? <CardText style={{ color: Rune.inkMuted, fontSize: 7.5, fontFamily: Body.bold }}>{pageMark}</CardText> : null}
        </View>
        {/* v0.13.0 typeset: left-aligned like the prints; size bumped only to 9.5 — the feature
            pagination (featurePages) is fit-tuned and this container CLIPS overflow. */}
        <View style={{ marginTop: 5, gap: 5, overflow: 'hidden', flex: 1 }}>
          {sections.map((s) => (
            <CardText key={s.name} style={{ color: Rune.inkText, fontSize: 9.5, lineHeight: 13.2, fontFamily: Body.regular, textAlign: 'left', ...NO_FONT_PAD }}>
              <CardText style={{ fontFamily: Body.bold }}>{s.name}: </CardText>
              {s.text}
            </CardText>
          ))}
        </View>
      </View>
      <ForgedFooter />
    </View>
  );
}

/** Art-zone emblem for the equipment cards (#121): sword / sparkle / shield, stroked gold. */
function EquipGlyph({ kind }: { kind: 'physical' | 'magic' | 'armor' }) {
  const stroke = Rune.goldEdge;
  const size = Math.round(ART_H * 0.6);
  if (kind === 'armor') {
    return (
      <Svg width={size} height={size} viewBox="0 0 40 44">
        <Path d="M20 3 L35 8 V20 Q35 33 20 41 Q5 33 5 20 V8 Z" fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
        <Path d="M20 12 V32 M12 20 H28" fill="none" stroke={stroke} strokeWidth={1.6} strokeLinecap="round" />
      </Svg>
    );
  }
  if (kind === 'magic') {
    return (
      <Svg width={size} height={size} viewBox="0 0 40 44">
        <Path d="M20 4 L23.5 17 L36 20.5 L23.5 24 L20 37 L16.5 24 L4 20.5 L16.5 17 Z" fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 40 44">
      <Path d="M20 4 L20 30 M12 30 H28 M20 30 V40 M16 40 H24" fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/**
 * The feature line at the bottom of an equipment card, sized so it can never reach the footer.
 *
 * Weapons and armor print their feature under a fixed stat block, so exactly how much room is left is
 * known before anything renders. It was simply not being used: the text was typeset at one size and
 * allowed to run, which is why the Katana's last word sat on top of the "RuneKeep" watermark. The
 * text is never shortened; the type is.
 *
 * `numberOfLines` is native-only on purpose. There it pairs with `adjustsFontSizeToFit` as a second
 * safety net under the computed size, and it CANNOT cut, because the count is the one the size was
 * chosen for. In a browser neither prop shrinks anything, so a count could only ever truncate, and a
 * card that hides half a rule is worse than one that looks slightly tight.
 */
const EQUIP_TEXT_W = FORGED_W - 32; // paddingHorizontal 16 either side
const EQUIP_LINE_RATIO = 12.5 / 8.5; // the typeset leading, kept as the text shrinks

/** The equipment cards' title, pinned for the same reason the stat rows are. */
const EQUIP_TITLE_H = 19;

/**
 * A weapon / armour / loot title, fitted into the same fixed band the generic card uses (v0.36).
 *
 * These three carried `adjustsFontSizeToFit`, which is a no-op on react-native-web, so a long
 * equipment name was auto-fitted on a phone and drawn at full size in a browser. The loot card was
 * worse: it allowed two lines while the layout budget below only ever subtracted one, so a two-line
 * potion name ate a line of its own rules text.
 */
function EquipTitle({ text }: { text: string }) {
  const fit = fitTitle(text, EQUIP_TEXT_W, EQUIP_TITLE_H, 15);
  return (
    <CardText
      numberOfLines={fit.lines || 1}
      adjustsFontSizeToFit
      minimumFontScale={0.6}
      style={{ color: Rune.inkText, fontSize: fit.fontSize, lineHeight: fit.lineHeight, fontFamily: Display.black, letterSpacing: 0.3, textTransform: 'uppercase', textAlign: 'center', ...NO_FONT_PAD }}>
      {text}
    </CardText>
  );
}

/**
 * How much vertical room is left for the feature, under a stat block of `rows`.
 *
 * Every term is a number declared in the layout right below: the lower body, its padding, the title,
 * the stat block's own margin and row rhythm, and the gap over the feature. It is exact rather than
 * approximate because the title and the rows now have pinned heights; before that, the answer was
 * different on each platform and nobody was asking the question anyway.
 */
function equipFeatureRoom(rows: number): number {
  const box = FORGED_H - ART_H - 19 - 24; // lower body, less paddingTop / paddingBottom
  const stats = 8 + rows * STAT_ROW_H + (rows - 1) * 3; // marginTop + rows + gaps
  return box - EQUIP_TITLE_H - stats - 9 /* the feature's own marginTop */;
}

function FeatureLine({ feature, room }: { feature: { name: string; text: string }; room: number }) {
  const fit = fitText(`${feature.name}: ${feature.text}`, { width: EQUIP_TEXT_W, height: room - FOOTER_GUARD, base: 8.5, lineRatio: EQUIP_LINE_RATIO });
  return (
    <CardText style={{ color: Rune.inkText, fontSize: fit.fontSize, lineHeight: fit.lineHeight, fontFamily: Body.regular, textAlign: 'justify', marginTop: 9, ...NO_FONT_PAD }}>
      <CardText style={{ fontFamily: Body.bold }}>{feature.name}: </CardText>
      {feature.text}
    </CardText>
  );
}

/**
 * One label/value row of an equipment card's stat block.
 *
 * The line heights are PINNED (v0.30.0), and that is the actual reason the Katana printed over its
 * footer on a phone and not in a browser. Left unset, a row is as tall as the font's own metrics say,
 * and Android's are noticeably taller than Chrome's: the same four rows took about 21dp more there,
 * which is most of a line of feature text, and it came out of the bottom of the card. Pinned, the
 * card has the same shape on both, and how much room is left for the feature is a number rather than
 * a guess. See `equipFeatureRoom`.
 */
const STAT_ROW_H = 13;

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
      <CardText style={{ color: Rune.inkMuted, fontSize: 7.5, lineHeight: STAT_ROW_H, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase', ...NO_FONT_PAD }}>{label}</CardText>
      <CardText style={{ color: Rune.inkText, fontSize: 10, lineHeight: STAT_ROW_H, fontFamily: Body.semibold, ...NO_FONT_PAD }}>{value}</CardText>
    </View>
  );
}

/**
 * A forged WEAPON card (#121, immutable): the printed-card layout with the weapon's stat block
 * (trait / range / damage / burden) and its feature. Physical = steel ground, magic = arcane.
 */
export function ForgedWeaponCard({ weapon }: { weapon: WeaponDef }) {
  const accentDeep = weapon.kind === 'magic' ? '#2E1F3A' : '#23262C';
  const kindLabel = weapon.slot === 'secondary' ? 'Secondary' : 'Weapon';
  const theme = getPlaqueTheme(kindLabel);
  return (
    <View style={{ width: FORGED_W, height: FORGED_H, backgroundColor: Rune.sheet, overflow: 'hidden' }}>
      <View style={{ height: ART_H, backgroundColor: accentDeep, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <EquipGlyph kind={weapon.kind} />
      </View>
      <View style={{ position: 'absolute', top: ART_H - (FORGED_W + 14) / (1978.811 / 151.3009) / 2, left: -7, right: -7, alignItems: 'center' }} pointerEvents="none">
        <DividerPlaque width={FORGED_W + 14} gradientStops={theme.gradientStops} maskFill={theme.solidColor}>
          <PlaqueLabel text={kindLabel} textColor={theme.textColor} />
        </DividerPlaque>
      </View>
      <View style={{ flex: 1, paddingTop: 19, paddingHorizontal: 16, paddingBottom: 24 }}>
        <EquipTitle text={weapon.name} />
        <View style={{ marginTop: 8, gap: 3 }}>
          <StatRow label="Trait" value={weapon.trait} />
          <StatRow label="Range" value={weapon.range} />
          <StatRow label="Damage" value={`${weapon.damage} ${weapon.damageType}`} />
          <StatRow label="Burden" value={weapon.burden} />
        </View>
        {weapon.feature ? <FeatureLine feature={weapon.feature} room={equipFeatureRoom(4)} /> : null}
      </View>
      <ForgedFooter />
    </View>
  );
}

/** Art-zone emblem for the loot cards (v0.14.0): a banded treasure chest, or an alchemist's flask. */
function LootGlyph({ kind }: { kind: 'loot' | 'consumable' }) {
  const stroke = Rune.goldEdge;
  const size = Math.round(ART_H * 0.6);
  if (kind === 'consumable') {
    return (
      <Svg width={size} height={size} viewBox="0 0 40 44">
        {/* erlenmeyer flask: neck, shoulders, a settled liquid line and two rising bubbles */}
        <Path d="M16 6 V17 L7 34 Q5.5 38.5 10 38.5 H30 Q34.5 38.5 33 34 L24 17 V6" fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
        <Path d="M13 6 H27" fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" />
        <Path d="M10.5 29 H29.5" fill="none" stroke={stroke} strokeWidth={1.4} strokeLinecap="round" />
        <Circle cx={16} cy={33} r={1.5} fill="none" stroke={stroke} strokeWidth={1.2} />
        <Circle cx={23.5} cy={34.5} r={1.1} fill="none" stroke={stroke} strokeWidth={1.2} />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 40 44">
      {/* treasure chest: domed lid, banded body, keyhole plate */}
      <Path d="M5 21 V16 Q5 7 20 7 Q35 7 35 16 V21" fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M4 21 H36 V36 Q36 38.5 33.5 38.5 H6.5 Q4 38.5 4 36 Z" fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M16.5 21 H23.5 V30 H16.5 Z" fill="none" stroke={stroke} strokeWidth={1.6} strokeLinejoin="round" />
      <Circle cx={20} cy={25} r={1.4} fill="none" stroke={stroke} strokeWidth={1.2} />
    </Svg>
  );
}

/**
 * A forged LOOT / CONSUMABLE card (v0.14.0, immutable): the same printed-card layout the equipment
 * cards use, so found treasure reads as a sibling of weapons and armor rather than as a plain note.
 * Loot sits on dug earth, consumables on apothecary glass; the rulebook table roll rides a stat row.
 */
export function ForgedLootCard({ loot }: { loot: LootDef }) {
  const kindLabel = loot.kind === 'consumable' ? 'Consumable' : 'Loot';
  const accentDeep = loot.kind === 'consumable' ? '#1A2620' : '#241B10';
  const theme = getPlaqueTheme(kindLabel);
  return (
    <View style={{ width: FORGED_W, height: FORGED_H, backgroundColor: Rune.sheet, overflow: 'hidden' }}>
      <View style={{ height: ART_H, backgroundColor: accentDeep, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <LootGlyph kind={loot.kind} />
      </View>
      <View style={{ position: 'absolute', top: ART_H - (FORGED_W + 14) / (1978.811 / 151.3009) / 2, left: -7, right: -7, alignItems: 'center' }} pointerEvents="none">
        <DividerPlaque width={FORGED_W + 14} gradientStops={theme.gradientStops} maskFill={theme.solidColor}>
          <PlaqueLabel text={kindLabel} textColor={theme.textColor} />
        </DividerPlaque>
      </View>
      <View style={{ flex: 1, paddingTop: 19, paddingHorizontal: 16, paddingBottom: 24 }}>
        <EquipTitle text={loot.name} />
        {/* v0.19.2 item 5: roll + which table it's from (Table 1 = base game, Table 2 = Hope and Fear). */}
        <View style={{ marginTop: 8 }}>
          <StatRow label="Roll" value={`${loot.roll}  ·  Table ${lootTable(loot)}`} />
        </View>
        <CardMarkdownBody
          body={loot.text}
          numberOfLines={11}
          adjustsFontSizeToFit
          minimumFontScale={0.55}
          style={{ color: Rune.inkText, fontSize: 9.5, lineHeight: 13, fontFamily: Body.regular, textAlign: 'left', alignSelf: 'stretch', marginTop: 8, flexShrink: 1, ...NO_FONT_PAD }}
        />
      </View>
      <ForgedFooter />
    </View>
  );
}

/**
 * The GOLD card (#128, immutable): the character's coin. A flat-but-rich golden gradient art zone
 * with a coin emblem — simple/modern, not a detailed illustration, per owner.
 */
export function ForgedGoldCard({ amount }: { amount?: number }) {
  const theme = getPlaqueTheme('Currency');
  return (
    <View style={{ width: FORGED_W, height: FORGED_H, backgroundColor: Rune.sheet, overflow: 'hidden' }}>
      <View style={{ height: ART_H, overflow: 'hidden' }}>
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="rk_gold_card" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#7a5e22" />
              <Stop offset="0.42" stopColor="#e7c668" />
              <Stop offset="0.62" stopColor="#fff2c4" />
              <Stop offset="0.8" stopColor="#caa247" />
              <Stop offset="1" stopColor="#6f5320" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#rk_gold_card)" />
        </Svg>
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={Math.round(ART_H * 0.52)} height={Math.round(ART_H * 0.52)} viewBox="0 0 40 40">
            <Circle cx={20} cy={20} r={14} fill="rgba(255,246,212,0.18)" stroke="#fff6df" strokeWidth={2} />
            <Path d="M 20 11 V 29 M 16 15.5 h 7 a 3 3 0 0 1 0 6 h -6 a 3 3 0 0 0 0 6 h 7" fill="none" stroke="#5a4416" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </View>
      </View>
      <View style={{ position: 'absolute', top: ART_H - (FORGED_W + 14) / (1978.811 / 151.3009) / 2, left: -7, right: -7, alignItems: 'center' }} pointerEvents="none">
        <DividerPlaque width={FORGED_W + 14} gradientStops={theme.gradientStops} maskFill={theme.solidColor}>
          <PlaqueLabel text="Currency" textColor={theme.textColor} />
        </DividerPlaque>
      </View>
      <View style={{ flex: 1, alignItems: 'center', paddingTop: 20, paddingHorizontal: 16, paddingBottom: 24 }}>
        <CardText numberOfLines={1} style={{ color: Rune.inkText, fontSize: 17, fontFamily: Display.black, letterSpacing: 0.3, textTransform: 'uppercase' }}>Gold</CardText>
        {amount != null ? <CardText style={{ color: Rune.inkText, fontSize: 22, fontFamily: Display.black, marginTop: 4 }}>{amount}</CardText> : null}
        <CardText style={{ color: Rune.inkText, fontSize: 9, lineHeight: 13.5, fontFamily: Body.regular, textAlign: 'center', marginTop: 7 }}>Coin for trade, bribes, and the finer things. Track it here as you spend and earn.</CardText>
      </View>
      <ForgedFooter />
    </View>
  );
}

/** A forged ARMOR card (#121, immutable): base thresholds, base score, feature. */
export function ForgedArmorCard({ armor }: { armor: ArmorDef }) {
  const theme = getPlaqueTheme('Armor');
  return (
    <View style={{ width: FORGED_W, height: FORGED_H, backgroundColor: Rune.sheet, overflow: 'hidden' }}>
      <View style={{ height: ART_H, backgroundColor: '#23262C', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <EquipGlyph kind="armor" />
      </View>
      <View style={{ position: 'absolute', top: ART_H - (FORGED_W + 14) / (1978.811 / 151.3009) / 2, left: -7, right: -7, alignItems: 'center' }} pointerEvents="none">
        <DividerPlaque width={FORGED_W + 14} gradientStops={theme.gradientStops} maskFill={theme.solidColor}>
          <PlaqueLabel text="Armor" textColor={theme.textColor} />
        </DividerPlaque>
      </View>
      <View style={{ flex: 1, paddingTop: 19, paddingHorizontal: 16, paddingBottom: 24 }}>
        <EquipTitle text={armor.name} />
        <View style={{ marginTop: 8, gap: 3 }}>
          <StatRow label="Thresholds" value={armor.thresholds} />
          <StatRow label="Base Score" value={String(armor.baseScore)} />
        </View>
        {armor.feature ? <FeatureLine feature={armor.feature} room={equipFeatureRoom(2)} /> : null}
      </View>
      <ForgedFooter />
    </View>
  );
}
