import { type ImageContentFit } from 'expo-image';
import { useCallback, useState } from 'react';
import { Platform, Pressable, StatusBar as RNStatusBar, StyleSheet, Text, View } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccentProvider, useAccentTint } from '@/components/accent';
import { ArtImage } from '@/components/art-image';
import { DesignStage } from '@/components/design-stage';
import { PressableArt } from '@/components/pressable-art';
import { Body, Display, Rune } from '@/constants/theme';
import { box, SHEET_DESIGN_HEIGHT, SHEET_DESIGN_WIDTH } from '@/lib/design';
import { type PipState, resolveHearts, resolvePips } from '@/lib/pips';
import { Art } from '../art';
import { CarouselProvider, useCarousel } from '../carousel-context';
import { type Character, SAMPLE_CHARACTER } from '../character';
import { ArtBox, PipRow, SheetText } from '../components/primitives';
import { CardCarousel } from '../components/card-carousel';
import { HeartTrack } from '../components/heart-track';
import { ClassBanner, SheetFrame } from '../components/sheet-frame';
import { TraitBanners } from '../components/trait-banners';
import { ChamferFrame, GoldRule, GoldRuleV } from './chamfer';
import { FrameSvg, ProvidedFrame } from './frame-svgs';
import { InfoOverlay } from './info-overlay';

// All sheet colors come from the Rune palette (no raw hex, per AGENTS / H3).
const SHEET = Rune.sheet;
const INK = Rune.inkText;
const RED = Rune.red;
const GOLDD = Rune.goldEdge;
const IVORY = Rune.sheet;
const BRONZE = Rune.bronze; // deep gold labels on parchment (AA at small sizes, L3)

const armorArt = (s: PipState) => (s === 'depleted' ? Art.armorDepleted : s === 'locked' ? Art.armorLocked : Art.armorIcon);
// R3: push locked pips clearly grey so they read apart from the red 'depleted' art at the smallest size.
const lockedGray = (s: PipState) => (s === 'locked' ? '#6E6A64' : undefined);

function PipGrid({ left, top, perRow, gap, rowGap = 8, states, pip, pipH, rowWidth, pipFit, tintFor, artFor, renderPip, onPressPip, trackLabel }: { left: number; top: number; perRow: number; gap: number; rowGap?: number; states: PipState[]; pip: number; /** Pip height when the slot is not square (defaults to `pip`). */ pipH?: number; /** Explicit row width — pips spread evenly across it (space-between). */ rowWidth?: number; pipFit?: ImageContentFit; artFor?: (s: PipState) => number; /** Custom pip renderer (#70 C: chamfered stress shapes). */ renderPip?: (s: PipState) => React.ReactNode; tintFor?: (s: PipState) => string | undefined; onPressPip?: (index: number) => void; trackLabel?: string }) {
  const rows: PipState[][] = [];
  for (let i = 0; i < states.length; i += perRow) rows.push(states.slice(i, i + perRow));
  const h = pipH ?? pip;
  const rowW = rowWidth ?? perRow * pip + (perRow - 1) * gap;
  return (
    <>
      {rows.map((row, r) => (
        <PipRow key={r} left={left} top={top + r * (h + rowGap)} width={rowW} height={h} states={row} pipWidth={pip} pipHeight={h} pipFit={pipFit} artFor={artFor} renderPip={renderPip} tintFor={tintFor} onPressPip={onPressPip ? (i) => onPressPip(r * perRow + i) : undefined} trackLabel={trackLabel} />
      ))}
    </>
  );
}

/**
 * A stress pip (#70 C → #77): a 44x22 CHAMFERED shape (45° cuts like the domain chips — never
 * rounded), the SAME size for every state. The marked pip adds a FLAT thin under-line spanning
 * only the straight middle of the bottom edge — the chamfered corner spans are excluded.
 */
function StressPip({ state, red }: { state: PipState; red: string }) {
  if (state === 'locked') {
    return <ChamferFrame left={0} top={0} width={44} height={22} chamfer={5} fill={Rune.muted} stroke="transparent" strokeWidth={0} />;
  }
  if (state === 'active') {
    return (
      <>
        <ChamferFrame left={0} top={0} width={44} height={22} chamfer={5} fill={red} stroke="transparent" strokeWidth={0} />
        {/* flat thin under-line — center span only, corners excluded */}
        <View style={[box(5, 25, 34, 1), { backgroundColor: red }]} pointerEvents="none" />
      </>
    );
  }
  return <ChamferFrame left={0} top={0} width={44} height={22} chamfer={5} fill="none" stroke={red} strokeWidth={2} />;
}

/** Hope: large diamonds joined by a THIN gold line that stops at the last filled one. */
function HopeLine({ left, top, width, count, active, pip, onPressPip }: { left: number; top: number; width: number; count: number; active: number; pip: number; onPressPip?: (index: number) => void }) {
  const states = resolvePips({ total: count, active, depletedRemainder: true });
  const step = (width - pip) / (count - 1);
  const lastFilled = Math.max(0, Math.min(count, active) - 1);
  const lineW = lastFilled * step;
  return (
    <>
      {lineW > 0 ? <GoldRule left={left + pip / 2} top={top + pip / 2 - 0.5} width={lineW} color="rgba(200,146,58,0.55)" thickness={1} /> : null}
      {states.map((s, i) => (
        <ArtBox key={i} left={left + i * step} top={top} width={pip} height={pip} source={s === 'active' ? Art.hope : Art.hopeDepleted} pressable pressedScale={1.2} onPress={onPressPip ? () => onPressPip(i) : undefined} accessibilityLabel={`Hope, ${s === 'active' ? 'filled' : 'empty'}`} accessibilityHint={onPressPip ? 'Double tap to set this level' : undefined} />
      ))}
    </>
  );
}

/** Width of a domain chip for its label — sized for the WIDER native glyph run plus real padding,
 *  so the chips no longer hug the text edge-to-edge on the phone (#43 D). */
function chipWidth(label: string): number {
  return Math.round(label.length * 7.6) + 18;
}

/** A domain name in its own small chamfered red chip (#37) — the project's flat, 45°-cut signature. */
function DomainChip({ left, top, label }: { left: number; top: number; label: string }) {
  const w = chipWidth(label);
  return (
    <>
      <ChamferFrame left={left} top={top} width={w} height={20} chamfer={5} fill={RED} stroke="transparent" strokeWidth={0} />
      <SheetText left={left} top={top} width={w} height={20} color={IVORY} size={10} family={Body.bold} align="center" uppercase letterSpacing={0.6} numberOfLines={1}>
        {label}
      </SheetText>
    </>
  );
}

/** An octagon badge (image-6), stretched a touch wider than tall so the origin strip reads as a
 *  deliberate band next to the big bio text (#48 D): tappable → opens the associated card (D4). */
function OctaBadge({ left, top, w, h, icon, label, onPress }: { left: number; top: number; w: number; h: number; icon: number; label: string; onPress?: () => void }) {
  return (
    <>
      <PressableArt style={box(left, top, w, h)} pressedScale={1.12} onPress={onPress} accessibilityLabel={`${label}, open card`}>
        <ProvidedFrame Svg={FrameSvg.Octagon} left={0} top={0} w={w} h={h} />
        {/* Icon fills more of the frame (#62 A) — frame + label sizing unchanged. */}
        <View style={box(w * 0.2, h * 0.16, w * 0.6, h * 0.64)} pointerEvents="none">
          <ArtImage source={icon} fit="contain" />
        </View>
      </PressableArt>
      {/* Wide box + no tracking: labels render at FIXED size on both platforms (#43 B). 8px — one
          size smaller per owner (#54 E, "too big for how often you use them") — and tucked 2px
          closer to the octagon it names. */}
      <SheetText left={left - 12} top={top + h + 2} width={w + 24} height={12} color={BRONZE} size={8} family={Body.bold} align="center" uppercase numberOfLines={1}>
        {label}
      </SheetText>
    </>
  );
}

type TrackKey = 'stress' | 'armor' | 'hope';

function RedesignedBody({ character, onHp, onTrack, onInfo }: { character: Character; onHp: (n: number) => void; onTrack: (key: TrackKey, active: number) => void; onInfo: () => void }) {
  const { toggleCategory, openRandomAbility, category } = useCarousel();
  const tint = useAccentTint();

  // Tap-to-spend/restore for the simple tracks (stress/armor). HEARTS are different now (#81):
  // HeartTrack owns the boundary-only ±1 hold/double-tap interaction.
  const onTrackPip = (key: TrackKey) => (i: number) => {
    const target = i + 1;
    onTrack(key, target === character[key].active ? i : target);
  };
  const activeTint = (s: PipState) => (s === 'active' ? tint : undefined);

  const hp = resolveHearts(character.hp, character.heartSlots); // hearts + readout derived from HP (§1A)
  const stress = resolvePips({ total: character.stress.total, active: character.stress.active, locked: character.stress.locked, depletedRemainder: true });
  const armor = resolvePips({ total: character.armor.total, active: character.armor.active, locked: character.armor.locked, depletedRemainder: true });

  return (
    <>
      {/* Parchment ground — CHAMFERED (45° cut) corners, not rounded, matching the gold frame and
          the project signature; this also kills the ivory corner seam (C7). */}
      <ChamferFrame left={0} top={0} width={412} height={892} chamfer={18} fill={SHEET} stroke="transparent" strokeWidth={0} />

      {/* Defense panel ART (image-11: pointy left ribbon, no baked dividers — #30 H). Drawn BEFORE
          the portrait so its tail tucks UNDER the portrait diamond instead of occluding it; the
          panel's texts/pips live in the defenses section below. */}
      {/* Stretched 5px DOWN only so it stands level with the portrait frame (#48 C). */}
      <ProvidedFrame Svg={FrameSvg.ArmorBg} left={100} top={200} w={296} h={95} />

      {/* ---------- header: portrait + deck toggle, ONE locked group (#43 G) ----------
          Sized to the midpoint of the last two iterations (163x295 grew over the defense panel;
          138x270 was too small). The toggle's position scales WITH the frame so the pair never
          drifts apart. No press bounce on either, per owner — plain Pressables. The toggle sits
          ON TOP (bigger symbol + generous hitSlop); the portrait keeps its full-frame hitbox
          underneath. */}
      <View style={box(16, 12, 150, 282)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => {}} accessibilityRole="button" accessibilityLabel="Character portrait. Add a photo">
          <ArtImage source={Art.portraitPlaceholder} fit="contain" style={{ position: 'absolute', left: 41, top: 48, width: 67, height: 100 } as never} />
          <ArtImage source={Art.portraitFrame} fit="fill" />
          {!character.portraitUri ? (
            <SheetText left={0} top={155} width={150} height={15} color={BRONZE} size={12} family={Body.bold} align="center" uppercase letterSpacing={0.6} numberOfLines={1}>
              + Tap to add
            </SheetText>
          ) : null}
        </Pressable>
        {/* Deck toggle inside the frame's bottom diamond — its centroid for THIS frame size. */}
        <Pressable style={box(39, 211, 52, 52)} hitSlop={10} onPress={toggleCategory} accessibilityRole="button" accessibilityLabel={`Card deck: ${category}. Double tap to switch`}>
          <ArtImage source={Art.portraitIcon} fit="contain" />
        </Pressable>
      </View>

      {/* ---------- top-right bio column: name → domain chips → lvl/prof → origin strip ----------
          The whole column starts at x176, close to the portrait (the 190 gap read as dead space,
          #48 D), and spans to the defense panel's right edge (396). */}
      {/* Name stretches to the panel's right edge; sits ABOVE the frame layer (C2). */}
      <View style={{ zIndex: 2100 }}>
        <SheetText left={176} top={14} width={220} height={54} color={INK} size={26} family={Display.black} align="left" vAlign="top" lineHeight={26} numberOfLines={2} uppercase letterSpacing={-0.6} fit>{character.name}</SheetText>
      </View>
      {/* Domains as two separate chamfered chips (no ×) under the name (#37). */}
      <DomainChip left={176} top={74} label={character.domains[0]} />
      <DomainChip left={176 + chipWidth(character.domains[0]) + 8} top={74} label={character.domains[1]} />
      {/* Level/class + proficiency lines between the chips and the badges — nudged 3px up for
          clear air above the origin strip (#54 E). */}
      <SheetText left={176} top={97} width={220} height={17} color={INK} size={14} family={Body.bold} align="left" uppercase letterSpacing={0.5} numberOfLines={1}>Lvl {character.level} {character.className}</SheetText>
      <SheetText left={176} top={116} width={220} height={15} color={BRONZE} size={12} family={Body.bold} align="left" uppercase letterSpacing={0.4} numberOfLines={1}>Proficiency → {character.proficiency}</SheetText>

      {/* Origin strip (#48 D, per /impeccable): three stretched octagons, fitted labels beneath,
          thin gold rules in the gaps. Shrunk down-and-left (48x40 at an 78px pitch, #54 E) so the
          COMMUNITY octagon and its label stay inside the panel's right edge (396) on NATIVE glyph
          widths, not just web. */}
      <OctaBadge left={176} top={138} w={48} h={40} icon={Art.subclassIcon} label="Subclass" onPress={openRandomAbility} />
      <OctaBadge left={254} top={138} w={48} h={40} icon={Art.ancestryIcon} label="Ancestry" onPress={openRandomAbility} />
      <OctaBadge left={332} top={138} w={48} h={40} icon={Art.communityIcon} label="Community" onPress={openRandomAbility} />
      <GoldRuleV left={239} top={146} height={24} color="rgba(200,146,58,0.5)" thickness={1.6} />
      <GoldRuleV left={317} top={146} height={24} color="rgba(200,146,58,0.5)" thickness={1.6} />

      {/* ---------- Evasion + Armor — image-11 ribbon panel (#30 H) ----------
          Art is drawn earlier (under the portrait diamond); content sits clear of the left tail.
          No armor-score number — shields only, per owner. */}
      {/* Contents nudged 3px into the taller panel and CENTERED as a band (#48 C): titles level,
          and the evasion numeral's vertical center matches the shield rows' center — the two
          halves read as one piece. */}
      <SheetText left={158} top={213} width={84} height={15} color={Rune.goldText} size={11} family={Body.bold} align="center" uppercase letterSpacing={0.8}>Evasion</SheetText>
      <SheetText left={158} top={231} width={84} height={44} color={IVORY} size={38} family={Display.black} align="center" tabularNums>{character.evasion}</SheetText>
      {/* the ONE separator — between Evasion and Armor, clear of the shields */}
      <GoldRuleV left={252} top={217} height={64} />
      <SheetText left={262} top={213} width={100} height={15} color={Rune.goldText} size={11} family={Body.bold} align="left" uppercase letterSpacing={0.8}>Armor</SheetText>
      <PipGrid left={262} top={234} perRow={6} gap={4} rowGap={5} states={armor} pip={17} artFor={armorArt} tintFor={lockedGray} onPressPip={onTrackPip('armor')} trackLabel="Armor" />

      {/* ---------- HP — hearts fit inside the frame, spaced ----------
          Panel raised 5px: the gap to the portrait/armor band above shrinks ~30% (#37). */}
      {/* Left edge pulled in 3px — the frame overshot the sheet's left rhythm (#43 I). */}
      <ProvidedFrame Svg={FrameSvg.HpBar} left={21} top={301} w={373} h={84} />
      {/* Info button: SMALL, fully inside the red corner (the old 17px ring bled onto the parchment
          and half-vanished, #43 I); slightly thicker ring so it still reads. Generous hitSlop keeps
          it easy to hit. Opens the HP explainer overlay (NOT the carousel's random-card path). */}
      <PressableArt style={box(27, 305, 12, 12)} pressedScale={1.2} hitSlop={16} onPress={onInfo} accessibilityLabel="Hit points info" accessibilityHint="Shows an explainer">
        <View style={{ flex: 1, borderRadius: 6, borderWidth: 1.6, borderColor: IVORY, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: IVORY, fontSize: 7, fontFamily: Display.bold, lineHeight: 9 }}>i</Text>
        </View>
      </PressableArt>
      {/* Label raised a touch + one size smaller (#48 E); it and the readout share ONE left column
          (#43 I/K): the numbers sit directly under HIT POINTS and never grow past its width. */}
      <SheetText left={48} top={315} width={140} height={15} color={INK} size={12} family={Body.bold} align="left" uppercase letterSpacing={1.2}>Hit Points</SheetText>
      {/* One tight cluster, BOTTOM-aligned with the heart row's bottom edge (368) per owner (#48 E)
          — red current, smaller ink "/ max"; the current numeral steps down a size at double digits
          so 12/12 still fits under the label (#30 I/#43 I). */}
      <View style={[box(48, 330, 92, 38), { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'flex-start', overflow: 'hidden' }]} pointerEvents="none">
        <Text numberOfLines={1} style={{ fontSize: hp.current >= 10 ? 28 : 32, color: tint ?? RED, fontFamily: Display.black, fontVariant: ['tabular-nums'] }}>{hp.current}</Text>
        <Text numberOfLines={1} style={{ marginLeft: 5, fontSize: 24, color: INK, fontFamily: Display.bold, fontVariant: ['tabular-nums'] }}>/ {hp.max}</Text>
      </View>
      {/* Hearts sit 10px further left (#30 I); states + readout both derive from HP (D1/§1A). */}
      <HeartTrack left={140} top={333} width={235} pip={35} hp={character.hp} accent={tint ?? RED} onHp={onHp} />

      {/* ---------- Stress — inset frame, two rows spread across the panel ----------
          Panel 20px shorter with the pips trimmed to match (34->26 tall) — flatter, more
          rectangular marks per owner (#43 J); 44 wide with hope-equal 12px gaps (#37). */}
      <ChamferFrame left={22} top={396} width={368} height={108} chamfer={12} stroke={GOLDD} strokeWidth={1.4} />
      {/* Label shares the pips' left edge (44) and gets clear air above them (#48 F). */}
      <SheetText left={44} top={404} width={120} height={16} color={INK} size={13} family={Body.bold} align="left" uppercase letterSpacing={1.2}>Stress</SheetText>
      {/* Chamfered shapes, not SVG art (#67 D → #70 C): red fill + echo line = marked, red
          chamfered outline = available, gray chamfered fill = locked. Same boxes as before. */}
      <PipGrid left={44} top={432} perRow={6} gap={12} rowGap={8} rowWidth={324} pip={44} pipH={26} states={stress} renderPip={(s) => <StressPip state={s} red={tint ?? RED} />} onPressPip={onTrackPip('stress')} trackLabel="Stress" />

      {/* ---------- Hope — aligned with Stress (which is now shorter), thin connecting line ---------- */}
      <ChamferFrame left={22} top={512} width={368} height={84} chamfer={12} stroke={GOLDD} strokeWidth={1.4} />
      <SheetText left={44} top={518} width={120} height={16} color={INK} size={13} family={Body.bold} align="left" uppercase letterSpacing={1.2}>Hope</SheetText>
      <HopeLine left={44} top={544} width={324} count={character.hope.total} active={character.hope.active} pip={44} onPressPip={onTrackPip('hope')} />
    </>
  );
}

function ExpandVeil() {
  const { expandProgress, collapse } = useCarousel();
  const [blocking, setBlocking] = useState(false);
  const wasBlocking = useSharedValue(false);
  useDerivedValue(() => {
    const b = expandProgress.value > 0.25;
    if (b !== wasBlocking.value) {
      wasBlocking.value = b;
      runOnJS(setBlocking)(b);
    }
  });
  const style = useAnimatedStyle(() => ({ opacity: expandProgress.value * 0.62 }));
  // When expanded the veil swallows taps on the dimmed sheet (AC2.8) and a tap dismisses the hand;
  // when compact it is inert so the controls underneath stay live. The box is oversized far past the
  // stage (which no longer clips) so the dim reaches the physical screen edges — status-bar area and
  // letterbox margins included — with square corners (#30 B).
  return (
    // zIndex 20: above the hearts layer (10), below the carousel (30) — see #87 stacking.
    <Pressable style={[box(-120, -160, 652, 1212), { zIndex: 20 }]} pointerEvents={blocking ? 'auto' : 'none'} onPress={collapse}>
      <Animated.View style={[box(0, 0, 652, 1212), { backgroundColor: '#06080d' }, style]} pointerEvents="none" />
    </Pressable>
  );
}

/**
 * The single redesigned sheet (style from the AELIANA mockup): chamfered/flat, red + gold; restored
 * interlocking portrait + dark defense panel; gold level/proficiency banner; octagon origin badges;
 * big resource icons; armor shown as its 12 icons. Accent locked to red (picker UI removed).
 */
export function RedesignedSheet({ character: initial = SAMPLE_CHARACTER }: { character?: Character }) {
  // The sheet now OWNS character state so the resource tracks can actually be spent/restored (A1).
  const [character, setCharacter] = useState(initial);
  const [infoOpen, setInfoOpen] = useState(false); // HP explainer overlay (#37)
  const onInfo = useCallback(() => setInfoOpen(true), []);
  const onInfoClose = useCallback(() => setInfoOpen(false), []);
  const onHp = useCallback(
    (n: number) => setCharacter((c) => ({ ...c, hp: Math.max(0, Math.min(c.heartSlots * 2, n)) })),
    [],
  );
  const onTrack = useCallback(
    (key: TrackKey, n: number) =>
      setCharacter((c) => {
        const t = c[key];
        const unlocked = t.total - (t.locked ?? 0);
        return { ...c, [key]: { ...t, active: Math.max(0, Math.min(unlocked, n)) } };
      }),
    [],
  );
  // Status bar clearance, third attempt (#54 D). On the owner's A54 + Expo Go BOTH inset APIs
  // (safe-area context AND StatusBar.currentHeight) report 0 — the device "acts as if there is no
  // status bar" while very much showing one. So: use whatever the APIs detect, but on Android
  // never less than a 32dp floor. The shift is a MARGIN (not padding): absolutely-positioned
  // children like the SheetFrame border anchor to the view's box, so a margin moves border and
  // content together, while padding can leave absolute children at the physical top.
  const insets = useSafeAreaInsets();
  const detected = Math.max(insets.top, Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 0) : 0);
  const topInset = Platform.OS === 'android' && detected < 24 ? 32 : detected;
  // Bottom mirror (#59): the same device reports a 0 BOTTOM inset too, so the sheet (and the
  // gears' spill) ran under the 3-button nav bar. Floor at the standard 48dp bar height whenever
  // Android detection is implausibly small; gesture-nav devices report ~16-34 and keep it.
  const bottomInset = Platform.OS === 'android' && insets.bottom < 16 ? 48 : insets.bottom;
  return (
    <AccentProvider>
      <CarouselProvider>
        <View style={{ flex: 1, backgroundColor: Rune.ink }}>
          <View style={{ flex: 1, marginTop: topInset, marginBottom: bottomInset }}>
            {/* Parchment matte: any letterbox margin reads as sheet, never ink, so the full-bleed gold
                frame frames parchment instead of a dark gap (#1). */}
            <View style={[StyleSheet.absoluteFill, { backgroundColor: Rune.sheet }]} />
            {/* clip off: the expand/focus dims overdraw past the stage to reach the screen edges.
                The safe-area inset pushes everything (border included) below the status bar; the
                strip above reads as the root's ink navy. Web's inset is 0, so the layouts are the
                SAME design, mobile-first (#43 A — replaces the old web-only 26px shift).
                marginTop pushes the DESIGN down INSIDE the border (#61): once the top+bottom bars
                ate the container height, the stage's natural letterbox vanished and the border's
                top band started covering the top of the name (authored at design y14). 18px keeps
                the design clear of the band at any container height. */}
            <DesignStage
              designWidth={SHEET_DESIGN_WIDTH}
              designHeight={SHEET_DESIGN_HEIGHT}
              clip={false}
              style={{ marginTop: 18 }}>
              <RedesignedBody character={character} onHp={onHp} onTrack={onTrack} onInfo={onInfo} />
              <TraitBanners character={character} modifierSize={24} groupTop={614} />
              <ExpandVeil />
              {/* Gears now live INSIDE the carousel (#62 D): above the veil and the fullscreen dim,
                  never above a card — and the inner gear is the grind-scroll control. */}
              <CardCarousel />
              <InfoOverlay open={infoOpen} onClose={onInfoClose} />
            </DesignStage>
            {/* Gold border is a full-bleed overlay ON TOP of the scaled content (stretched to the
                screen edges). The card hand is clipped to the design box, so it stays behind it. */}
            <SheetFrame />
          </View>
          {/* EXPLICIT bars painted over the status-bar and nav-control strips (#54 D, #59): even if
              some layer below misbehaves, both strips always read as the border's ink navy. The
              bottom one is load-bearing — the stage is unclipped (the dims must overdraw), so the
              gears/card spill below the design box can only be COVERED, not clipped. */}
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: topInset, backgroundColor: Rune.ink }} />
          <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: bottomInset, backgroundColor: Rune.ink }} />
          {/* Above the bar: the banner is the ONE element that invades the status-bar strip,
              hanging from the physical top edge of the screen (#43 A). */}
          <ClassBanner />
        </View>
      </CarouselProvider>
    </AccentProvider>
  );
}
