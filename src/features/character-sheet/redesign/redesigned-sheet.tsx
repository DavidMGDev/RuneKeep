import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Platform, Pressable, StatusBar as RNStatusBar, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Animated, { runOnJS, useAnimatedStyle, useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccentProvider, useAccentTint } from '@/components/accent';
import { ArtImage } from '@/components/art-image';
import { DesignStage } from '@/components/design-stage';
import { PressableArt } from '@/components/pressable-art';
import { Body, Display, Rune } from '@/constants/theme';
import { box, SHEET_DESIGN_HEIGHT, SHEET_DESIGN_WIDTH } from '@/lib/design';
import { type PipState, resolveHearts, resolvePips } from '@/lib/pips';
import { type CharacterFile, toSheetCharacter } from '@/lib/character-file';
import { cardById } from '@/features/cards/catalog';
import { classColor } from '@/constants/identity';
import { CLASS_CARDS, classBanner } from '@/features/create/class-cards';
import { featurePages } from '@/features/create/class-data';
import { ForgedArmorCard, ForgedCard, ForgedTextCard, ForgedWeaponCard } from '@/features/create/forged-card';
import { armorById, weaponById } from '@/features/create/equipment-data';
import { CLASS_INVENTORY, itemOptionId, itemTitle } from '@/features/create/class-inventory-data';
import { GoldCard } from '@/features/create/gold-card';
import { RuneLoader } from '@/components/rune-loader';

// Default art for an inventory item with no player image (#136) — same asset as creation.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ITEM_DEFAULT_ART = require('../../../../assets/temp/ItemCardImage.jpg') as number;
import { useForgedSnapshots } from '@/features/create/forged-snapshots';
import { Art } from '../art';
import { CarouselProvider, useCarousel } from '../carousel-context';
import { type Character, SAMPLE_CHARACTER } from '../character';
import { SheetText } from '../components/primitives';
import { CardCarousel } from '../components/card-carousel';
import { ChargeTrack } from '../components/charge-track';
import { HeartTrack, type HeartTrackHandle } from '../components/heart-track';
import { SheetFrame } from '../components/sheet-frame';
import { TraitBanners } from '../components/trait-banners';
import { ChamferFrame, GoldRule, GoldRuleV } from './chamfer';
import { FrameSvg, ProvidedFrame } from './frame-svgs';
import { DamagePanel } from './damage-panel';
import { DeckToggleIcon } from './deck-toggle-icon';
import { PortraitImage } from './portrait-image';

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
  // Sheet-colored fill, not transparent (#93): a grown/shaking available pip must read as a solid
  // shape, not an empty frame with the background showing through.
  return <ChamferFrame left={0} top={0} width={44} height={22} chamfer={5} fill={IVORY} stroke={red} strokeWidth={2} />;
}

/** Hope's THIN gold line stopping at the last filled diamond — the diamonds themselves live in a
 *  ChargeTrack now (#89 D). */
function HopeRule({ left, top, width, count, active, pip }: { left: number; top: number; width: number; count: number; active: number; pip: number }) {
  const step = (width - pip) / (count - 1);
  const lastFilled = Math.max(0, Math.min(count, active) - 1);
  const lineW = lastFilled * step;
  if (lineW <= 0) return null;
  return <GoldRule left={left + pip / 2} top={top + pip / 2 - 0.5} width={lineW} color="rgba(200,146,58,0.55)" thickness={1} />;
}

/** Boundary slots for a simple ±1 track (stress/hope/armor): first markable / last marked. */
function trackBounds(t: { total: number; active: number; locked?: number }) {
  return {
    up: t.active < t.total - (t.locked ?? 0) ? t.active : -1,
    down: t.active > 0 ? t.active - 1 : -1,
  };
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

function RedesignedBody({ character, onHp, onTrack, onInfo, heartRef }: { character: Character; onHp: (n: number) => void; onTrack: (key: TrackKey, active: number) => void; onInfo: () => void; heartRef: React.Ref<HeartTrackHandle> }) {
  const { toggleCategory, openOriginCard, category } = useCarousel();
  const tint = useAccentTint();

  // Every resource now uses the boundary-only ±1 hold/double-tap model (#81 hearts, #89 the rest).
  // Only the hearts the character can ever fill are drawn (#107): maxHp 4 → four hearts, no
  // ghost fifth/sixth; above 6 the fixed six slots carry golden overflow as before.
  const heartSlotCount = Math.min(character.heartSlots, Math.max(1, character.maxHp));
  const hp = resolveHearts(character.hp, heartSlotCount); // hearts + readout derived from HP (§1A)
  const stress = resolvePips({ total: character.stress.total, active: character.stress.active, locked: character.stress.locked, depletedRemainder: true });
  const armor = resolvePips({ total: character.armor.total, active: character.armor.active, locked: character.armor.locked, depletedRemainder: true });
  const hope = resolvePips({ total: character.hope.total, active: character.hope.active, depletedRemainder: true });

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
          {/* the player's photo, clipped to the portrait mask, UNDER the gold frame (#135). It sits
              in the body layer so the carousel/expand dims darken it like the rest of the sheet. */}
          {character.portraitUri ? (
            // shrunk by the bottom toggle-diamond's height (~52) so the photo fills only the upper
            // portrait, not the deck-toggle button below it (#136).
            <View style={box(0, 3, 148, 222)} pointerEvents="none">
              <PortraitImage uri={character.portraitUri} width={148} height={222} />
            </View>
          ) : (
            <ArtImage source={Art.portraitPlaceholder} fit="contain" style={{ position: 'absolute', left: 41, top: 48, width: 67, height: 100 } as never} />
          )}
          <ArtImage source={Art.portraitFrame} fit="fill" />
          {!character.portraitUri ? (
            <SheetText left={0} top={155} width={150} height={15} color={BRONZE} size={12} family={Body.bold} align="center" uppercase letterSpacing={0.6} numberOfLines={1}>
              + Tap to add
            </SheetText>
          ) : null}
        </Pressable>
        {/* Deck toggle inside the frame's bottom diamond — its centroid for THIS frame size. */}
        <Pressable style={box(39, 211, 52, 52)} hitSlop={10} onPress={toggleCategory} accessibilityRole="button" accessibilityLabel={`Card deck: ${category}. Double tap to switch`}>
          <DeckToggleIcon category={category} />
        </Pressable>
      </View>

      {/* ---------- top-right bio column: name → domain chips → lvl/prof → origin strip ----------
          The whole column starts at x176, close to the portrait (the 190 gap read as dead space,
          #48 D), and spans to the defense panel's right edge (396). */}
      {/* Name stretches to the panel's right edge; sits ABOVE the frame layer (C2). */}
      <View style={{ zIndex: 2100 }}>
        {/* size 46 so a SHORT one-word name grows to fill the row (#136); fit shrinks long names
            back onto two lines. vAlign center keeps a single line vertically centered in the box. */}
        <SheetText left={176} top={14} width={220} height={54} color={INK} size={46} family={Display.black} align="left" vAlign="center" lineHeight={46} numberOfLines={2} uppercase letterSpacing={-0.6} fit>{character.name}</SheetText>
      </View>
      {/* Domains as two separate chamfered chips (no ×) under the name (#37). */}
      <DomainChip left={176} top={74} label={character.domains[0]} />
      <DomainChip left={176 + chipWidth(character.domains[0]) + 8} top={74} label={character.domains[1]} />
      {/* Level/class + proficiency lines between the chips and the badges — nudged 3px up for
          clear air above the origin strip (#54 E). */}
      {/* One size smaller + a taller box than the glyphs need (#95 B): native line metrics ran
          taller than web's and the 17px box clipped the descender band off "LVL 4 SORCERER". */}
      {/* level/class + proficiency on ONE line now (#128): "Prof" abbreviation, no arrow, middot
          separator — the freed vertical space goes to the (taller, squarer) origin badges below. */}
      <SheetText left={176} top={100} width={224} height={18} color={INK} size={12} family={Body.bold} align="left" uppercase letterSpacing={0.4} numberOfLines={1}>
        Lvl {character.level} {character.className} · Prof {character.proficiency}
      </SheetText>

      {/* Origin strip (#48 D, per /impeccable): three stretched octagons, fitted labels beneath,
          thin gold rules in the gaps. Shrunk down-and-left (48x40 at an 78px pitch, #54 E) so the
          COMMUNITY octagon and its label stay inside the panel's right edge (396) on NATIVE glyph
          widths, not just web. */}
      {/* #100: each badge opens ITS pinned origin card (last three of the abilities hand); if the
          Inventory deck is up, the switch animation plays first, then the card flies up. */}
      {/* taller, squarer badges (#128): they rise into the space the proficiency line used to take */}
      <OctaBadge left={176} top={120} w={48} h={52} icon={Art.subclassIcon} label="Subclass" onPress={() => openOriginCard(0)} />
      <OctaBadge left={254} top={120} w={48} h={52} icon={Art.ancestryIcon} label="Ancestry" onPress={() => openOriginCard(1)} />
      <OctaBadge left={332} top={120} w={48} h={52} icon={Art.communityIcon} label="Community" onPress={() => openOriginCard(2)} />
      <GoldRuleV left={239} top={130} height={34} color="rgba(200,146,58,0.5)" thickness={1.6} />
      <GoldRuleV left={317} top={130} height={34} color="rgba(200,146,58,0.5)" thickness={1.6} />

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
      {/* Armor (#89 E): zone mode — the shields are too small to hunt, so two big halves split at
          the barrier after the LAST filled shield own the gestures: left of it clears, right of it
          marks, verticality irrelevant. Each shield still charges/animates individually. */}
      <ChargeTrack
        left={262}
        top={234}
        slots={armor.map((_, i) => ({ x: (i % 6) * 21, y: Math.floor(i / 6) * 22 }))}
        w={17}
        h={17}
        upIndex={trackBounds(character.armor).up}
        downIndex={trackBounds(character.armor).down}
        onUp={() => onTrack('armor', character.armor.active + 1)}
        onDown={() => onTrack('armor', character.armor.active - 1)}
        renderSlot={(i) => <ArtImage source={armorArt(armor[i])} fit="contain" tint={lockedGray(armor[i])} />}
        renderFilled={() => <ArtImage source={armorArt('active')} fit="contain" />}
        renderEmpty={() => <ArtImage source={armorArt('depleted')} fit="contain" />}
        flavor="armor"
        accent={tint ?? RED}
        grow={4.2}
        crossUpAt={0.45}
        zone={{ left: -10, top: -8, width: 142, height: 56 }}
        trackLabel="Armor"
      />

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
        <Text numberOfLines={1} style={{ marginLeft: 5, fontSize: 24, color: INK, fontFamily: Display.bold, fontVariant: ['tabular-nums'] }}>/ {character.maxHp}</Text>
      </View>
      {/* Hearts sit 10px further left (#30 I); states + readout both derive from HP (D1/§1A). */}
      <HeartTrack ref={heartRef} left={140} top={333} width={235} pip={35} hp={character.hp} slots={heartSlotCount} maxHp={character.maxHp} accent={tint ?? RED} onHp={onHp} />

      {/* ---------- Stress — inset frame, two rows spread across the panel ----------
          Panel 20px shorter with the pips trimmed to match (34->26 tall) — flatter, more
          rectangular marks per owner (#43 J); 44 wide with hope-equal 12px gaps (#37). */}
      <ChamferFrame left={22} top={396} width={368} height={108} chamfer={12} stroke={GOLDD} strokeWidth={1.4} />
      {/* Label shares the pips' left edge (44) and gets clear air above them (#48 F). */}
      <SheetText left={44} top={404} width={120} height={16} color={INK} size={13} family={Body.bold} align="left" uppercase letterSpacing={1.2}>Stress</SheetText>
      {/* Chamfered shapes, not SVG art (#67 D → #70 C): red fill + echo line = marked, red
          chamfered outline = available, gray chamfered fill = locked. Same boxes as before. */}
      {/* Stress (#89 C): hold-to-charge boundaries with the lightning flavor — quantized jumps,
          jitter, flicker. Boundary pips reach further on their outward side (sideSlop). */}
      <ChargeTrack
        left={44}
        top={432}
        slots={stress.map((_, i) => ({ x: (i % 6) * 56, y: Math.floor(i / 6) * 34 }))}
        w={44}
        h={26}
        upIndex={trackBounds(character.stress).up}
        downIndex={trackBounds(character.stress).down}
        onUp={() => onTrack('stress', character.stress.active + 1)}
        onDown={() => onTrack('stress', character.stress.active - 1)}
        renderSlot={(i) => <StressPip state={stress[i]} red={tint ?? RED} />}
        renderFilled={() => <StressPip state="active" red={tint ?? RED} />}
        renderEmpty={() => <StressPip state="depleted" red={tint ?? RED} />}
        flavor="stress"
        accent={tint ?? RED}
        grow={2.65}
        crossUpAt={0.12}
        zone={{ left: -10, top: -10, width: 344, height: 80 }}
        trackLabel="Stress"
      />

      {/* ---------- Hope — aligned with Stress (which is now shorter), thin connecting line ---------- */}
      <ChamferFrame left={22} top={512} width={368} height={84} chamfer={12} stroke={GOLDD} strokeWidth={1.4} />
      <SheetText left={44} top={518} width={120} height={16} color={INK} size={13} family={Body.bold} align="left" uppercase letterSpacing={1.2}>Hope</SheetText>
      <HopeRule left={44} top={544} width={324} count={character.hope.total} active={character.hope.active} pip={44} />
      {/* Hope (#89 D): abrupt but grandiose — instant rays of light + rising twinkling sparks on a
          gain; dimmer rays, falling sparks on a spend. */}
      <ChargeTrack
        left={44}
        top={544}
        slots={hope.map((_, i) => ({ x: i * 56, y: 0 }))}
        w={44}
        h={44}
        upIndex={trackBounds(character.hope).up}
        downIndex={trackBounds(character.hope).down}
        onUp={() => onTrack('hope', character.hope.active + 1)}
        onDown={() => onTrack('hope', character.hope.active - 1)}
        renderSlot={(i) => <ArtImage source={hope[i] === 'active' ? Art.hope : Art.hopeDepleted} fit="contain" />}
        renderFilled={() => <ArtImage source={Art.hope} fit="contain" />}
        renderEmpty={() => <ArtImage source={Art.hopeDepleted} fit="contain" />}
        flavor="hope"
        accent={Rune.goldBright}
        grow={3.0}
        crossUpAt={0.15}
        crossDownAt={0.12}
        zone={{ left: -10, top: -6, width: 344, height: 56 }}
        trackLabel="Hope"
      />
    </>
  );
}

/**
 * Device-back guard (#108): when a card is full-screen, the hardware back button CLOSES it instead
 * of navigating away — backing out mid-fullscreen used to leave a leaked veil that froze the next
 * screen. Lives inside CarouselProvider so it can reach the machine state.
 */
function CarouselBackGuard() {
  const { machineState, closeFullscreen } = useCarousel();
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (machineState.value === 'fullscreen') {
          closeFullscreen();
          return true;
        }
        return false;
      });
      return () => sub.remove();
    }, [machineState, closeFullscreen]),
  );
  return null;
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
export function RedesignedSheet({ character: initial, characterFile }: { character?: Character; characterFile?: CharacterFile }) {
  // The sheet now OWNS character state so the resource tracks can actually be spent/restored (A1).
  // With a CharacterFile it derives the runtime Character from it (#100); resources stay local.
  const [character, setCharacter] = useState(() => initial ?? (characterFile ? toSheetCharacter(characterFile) : SAMPLE_CHARACTER));
  // Pre-render this character's forged cards on device (#104) so the carousel treats them like any
  // scanned card (uri-based two-LOD pair). The class feature pages become ONE multi-page card in
  // the hand (#108); the experiences are individual cards. Both appear once their bitmaps capture.
  const { featJobs, classJob, expJobs, weaponJobs, armorJob, invJobs } = useMemo(() => {
    type Job = { key: string; node: ReactNode; raster?: boolean };
    const empty = { featJobs: [] as Job[], classJob: null as Job | null, expJobs: [] as Job[], weaponJobs: [] as Job[], armorJob: null as Job | null, invJobs: [] as Job[] };
    if (!characterFile) return empty;
    const cls = characterFile.className;
    const classDef = CLASS_CARDS.find((c) => c.key === cls);
    const title = classDef?.title ?? cls.charAt(0).toUpperCase() + cls.slice(1);
    const fpages = featurePages(cls);
    const total = 1 + fpages.length;
    // face 0 = the class card (#110: the missing first page); same deck-wide marks as the forge
    const classJob = classDef
      ? { key: `class-${cls}`, node: <ForgedCard title={title} kindLabel="Class" body={classDef.body} accentDeep={classColor(cls).deep} Banner={classDef.Banner} pageMark={`1/${total}`} classKey={cls} /> }
      : null;
    const featJobs = fpages.map((p) => ({
      key: `feat-${cls}-${p.pageIndex}`,
      node: (
        <ForgedTextCard
          title={title}
          kindLabel="Features"
          pageMark={`${p.pageIndex + 2}/${total}`}
          sections={p.sections}
          accentDeep={classColor(cls).deep}
          Banner={classBanner(cls)}
          classKey={cls}
        />
      ),
    }));
    const expJobs = (characterFile.experiences ?? []).map((e) => ({
      key: `exp-${e.id}-${(e.title.length * 31 + e.text.length * 7 + (e.imageUri?.length ?? 0) + (e.color?.length ?? 0) * 13) % 99991}`,
      node: <ForgedCard title={e.title} kindLabel="Experience" body={e.text} accentDeep={Rune.panel} imageUri={e.imageUri} colorArt={e.color} multilineTitle />,
      // player photo (file://) decodes async — needs the forge settle so it isn't captured black (#121)
      raster: !!e.imageUri,
    }));
    // starting equipment (#121): the primary weapon, the optional secondary, and the armor card
    const weaponJobs = [characterFile.weaponPrimaryId, characterFile.weaponSecondaryId]
      .map((id) => (id ? weaponById(id) : undefined))
      .filter((w): w is NonNullable<typeof w> => !!w)
      .map((w) => ({ key: w.id, node: <ForgedWeaponCard weapon={w} /> }));
    const armorDef = characterFile.armorId ? armorById(characterFile.armorId) : undefined;
    const armorJob = armorDef ? { key: armorDef.id, node: <ForgedArmorCard armor={armorDef} /> } : null;
    // Inventory item cards (#136): the default kit (auto), the chosen options, and the custom items.
    const cinv = CLASS_INVENTORY[cls];
    const cap = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;
    const kitJobs: Job[] = cinv.take.map((name, i) => ({ key: `kit-${cls}-${i}`, node: <ForgedCard title={itemTitle(name)} kindLabel="Item" body={`You carry ${name}.`} accentDeep={Rune.panel} fallbackArt={ITEM_DEFAULT_ART} multilineTitle /> }));
    const chosenIds = characterFile.inventoryItemIds ?? [];
    const chosenJobs: Job[] = cinv.choices.flat().filter((n) => chosenIds.includes(itemOptionId(n))).map((name) => ({ key: itemOptionId(name), node: <ForgedCard title={itemTitle(name)} kindLabel="Item" body={`${cap(name)}.`} accentDeep={Rune.panel} fallbackArt={ITEM_DEFAULT_ART} multilineTitle /> }));
    const customJobs: Job[] = (characterFile.inventoryCustom ?? []).map((it) => ({
      key: `itm-${it.id}-${(it.title.length * 31 + it.text.length * 7 + (it.imageUri?.length ?? 0) + (it.color?.length ?? 0) * 13) % 99991}`,
      node: <ForgedCard title={it.title} kindLabel="Item" body={it.text} accentDeep={Rune.panel} imageUri={it.imageUri} colorArt={it.color} fallbackArt={ITEM_DEFAULT_ART} multilineTitle />,
      raster: !!it.imageUri,
    }));
    const invJobs = [...kitJobs, ...chosenJobs, ...customJobs];
    return { featJobs, classJob, expJobs, weaponJobs, armorJob, invJobs };
  }, [characterFile]);
  const allJobs = useMemo(
    () => [...expJobs, ...(classJob ? [classJob] : []), ...featJobs, ...weaponJobs, ...(armorJob ? [armorJob] : []), ...invJobs],
    [expJobs, classJob, featJobs, weaponJobs, armorJob, invJobs],
  );
  const { sources: featureSources, stage: forgeStage } = useForgedSnapshots(allJobs);

  // Entry loader (#150): cover the WHOLE sheet until every forged card is captured (so nothing is
  // seen popping in one-by-one), then fade in. A hard fallback guarantees it can't hang.
  const expectedKeys = useMemo(() => allJobs.map((j) => j.key), [allJobs]);
  const allForged = expectedKeys.length === 0 || expectedKeys.every((k) => featureSources[k]);
  const [sheetReady, setSheetReady] = useState(false);
  const [loaderUp, setLoaderUp] = useState(true);
  useEffect(() => {
    if (sheetReady) return;
    if (allForged) {
      const t = setTimeout(() => setSheetReady(true), 500); // a paint grace once the bitmaps exist
      return () => clearTimeout(t);
    }
  }, [allForged, sheetReady]);
  useEffect(() => {
    const t = setTimeout(() => setSheetReady(true), 6000);
    return () => clearTimeout(t);
  }, []);

  // Pinned at the RIGHT end of the abilities hand: experiences, then the ONE multi-page class
  // feature card, then subclass, ancestry, community in that order (#100/#108). The origin trio
  // stays LAST so the badges (which target the last three) keep pointing at them.
  const { abilitiesCards, inventoryCards, originIndices } = useMemo(() => {
    const none = { abilitiesCards: undefined, inventoryCards: undefined, originIndices: undefined };
    if (!characterFile) return none;
    const ids = [characterFile.subclassCardId, characterFile.ancestryCardId, characterFile.communityCardId];
    const cards = ids.map(cardById);
    if (cards.some((c) => !c)) return none;
    // the actual cards the player PICKED at creation (#121: no more sample/placeholder cards) — the
    // two domain cards lead the abilities hand.
    const domainItems = characterFile.domainCardIds
      .map(cardById)
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map((c) => ({ id: c.id, source: c.source, thumb: c.thumb }));
    const expItems = expJobs
      .map((j) => ({ key: j.key, src: featureSources[j.key] }))
      .filter((x) => x.src)
      .map((x) => ({ id: x.key, source: x.src!.full, thumb: x.src!.thumb }));
    // Faces in STABLE order [class, ...features] — an un-forged face keeps its slot and renders its
    // live node (no .filter that dropped pages and shifted indices, the #110 missing-page bug).
    const faceJobs = classJob ? [classJob, ...featJobs] : featJobs;
    const faces = faceJobs.map((j) => {
      const src = featureSources[j.key];
      return src ? { source: src.full, thumb: src.thumb } : { custom: j.node };
    });
    const firstForged = faces.find((f) => f.source) as { source: { uri: string }; thumb: { uri: string } } | undefined;
    const featItem =
      faces.length > 1 && firstForged
        ? [{ id: `features-${characterFile.className}`, source: firstForged.source, thumb: firstForged.thumb, faces }]
        : [];
    // Equipment (#121): weapons + armor appear once forged. Weapons ride BOTH the abilities hand and
    // inventory; armor is inventory only.
    const forgedItems = (jobs: { key: string; node: ReactNode }[]) =>
      jobs.map((j) => ({ j, src: featureSources[j.key] })).filter((x) => x.src).map((x) => ({ id: x.j.key, source: x.src!.full, thumb: x.src!.thumb }));
    const weaponItems = forgedItems(weaponJobs);
    const armorItems = armorJob ? forgedItems([armorJob]) : [];
    const [subclassC, ancestryC, communityC] = cards.map((c) => ({ id: c!.id, source: c!.source, thumb: c!.thumb }));
    // Arsenal order (#136, owner): weapons → domains → class feature card → subclass → experiences
    // → ancestry → community. The origin badges target subclass/ancestry/community by their actual
    // index now (they're no longer the contiguous last three).
    const abilities = [...weaponItems, ...domainItems, ...featItem, subclassC, ...expItems, ancestryC, communityC];
    const originIndices: [number, number, number] = [abilities.indexOf(subclassC), abilities.indexOf(ancestryC), abilities.indexOf(communityC)];
    // inventory = ONLY the player's stuff (#136: never the sample deck) — kit + chosen + custom +
    // gold + weapons + armor. Returned as an array (even while forging) so it NEVER falls back.
    const invItems = forgedItems(invJobs);
    // the GOLD card is LIVE + interactive (#136): its +/- adjusts character.gold in place. dummy
    // source/thumb are never drawn (the live node renders instead).
    const goldItem = { id: 'gold', source: ITEM_DEFAULT_ART, thumb: ITEM_DEFAULT_ART, live: <GoldCard gold={character.gold} onChange={(g) => setCharacter((c) => ({ ...c, gold: g }))} />, interactive: true };
    const inv = [...invItems, goldItem, ...weaponItems, ...armorItems];
    return { abilitiesCards: abilities, inventoryCards: inv, originIndices };
  }, [characterFile, character.gold, expJobs, classJob, featJobs, weaponJobs, armorJob, invJobs, featureSources]);
  const [damageOpen, setDamageOpen] = useState(false); // damage-threshold keypad (#128, was the info card)
  const onInfo = useCallback(() => setDamageOpen(true), []);
  const heartRef = useRef<HeartTrackHandle>(null);
  const onApplyDamage = useCallback((hpLoss: number) => heartRef.current?.applyDamage(hpLoss), []);
  const onHp = useCallback(
    // No overhealing past the character's TRUE maximum (#107) — not the slot capacity.
    (n: number) => setCharacter((c) => ({ ...c, hp: Math.max(0, Math.min(c.maxHp, n)) })),
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
      <CarouselProvider abilitiesCards={abilitiesCards} inventoryCards={inventoryCards} originIndices={originIndices}>
        <CarouselBackGuard />
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
              <RedesignedBody character={character} onHp={onHp} onTrack={onTrack} onInfo={onInfo} heartRef={heartRef} />
              <TraitBanners character={character} modifierSize={22} groupTop={614} />
              <ExpandVeil />
              {/* Gears now live INSIDE the carousel (#62 D): above the veil and the fullscreen dim,
                  never above a card — and the inner gear is the grind-scroll control. */}
              <CardCarousel />
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
          {/* damage-threshold keypad (#128): full-screen overlay above everything; on confirm it
              animates out, then bursts the lost hearts via the HeartTrack handle */}
          {damageOpen ? <DamagePanel thresholds={character.damageThresholds} onApply={onApplyDamage} onClose={() => setDamageOpen(false)} /> : null}
          {/* offscreen forge stage: captures the class-feature cards to bitmaps (#104) */}
          {forgeStage}
          {/* entry loader (#150): covers the whole sheet while the cards forge, then fades to reveal */}
          {loaderUp ? <RuneLoader done={sheetReady} onHidden={() => setLoaderUp(false)} caption="Summoning the sheet" /> : null}
        </View>
      </CarouselProvider>
    </AccentProvider>
  );
}
