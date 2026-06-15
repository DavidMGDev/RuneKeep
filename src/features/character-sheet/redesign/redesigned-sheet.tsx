import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Platform, Pressable, StatusBar as RNStatusBar, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Animated, { Easing, runOnJS, useAnimatedStyle, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccentProvider, useAccentTint } from '@/components/accent';
import { ArtImage } from '@/components/art-image';
import { DesignStage } from '@/components/design-stage';
import { PressableArt } from '@/components/pressable-art';
import { Body, Display, Rune } from '@/constants/theme';
import { box, SHEET_DESIGN_HEIGHT, SHEET_DESIGN_WIDTH } from '@/lib/design';
import { type PipState, resolveHearts, resolvePips } from '@/lib/pips';
import { type CharacterFile, type CustomCardDef, toSheetCharacter } from '@/lib/character-file';
import { CATALOG, cardById } from '@/features/cards/catalog';
import { CLASSES, classColor, classInfo } from '@/constants/identity';
import { CLASS_CARDS, classBanner } from '@/features/create/class-cards';
import { CLASS_DATA, featurePages } from '@/features/create/class-data';
import { ForgedArmorCard, ForgedCard, ForgedTextCard, ForgedWeaponCard } from '@/features/create/forged-card';
import { armorById, weaponById } from '@/features/create/equipment-data';
import { lootById } from '@/lib/loot-data';
import { applyWildshapeCost, isWildshapeId, WILDSHAPES, wildshapeById, type Wildshape } from '@/lib/wildshape-data';
import { tierForLevel } from '@/lib/modifiers';
import { effectsForCardId } from '@/features/cards/card-effects';
import { CLASS_INVENTORY, itemOptionId, itemTitle } from '@/features/create/class-inventory-data';
import { itemColor } from '@/features/create/item-colors';
import { GoldCard } from '@/features/create/gold-card';
import { RuneLoader } from '@/components/rune-loader';

// A generic require for the GOLD card's never-drawn source/thumb (it renders its live node). The old
// temp item image was deleted (#248 item 4) — cards with no art now fall back to their panel colour.
const GENERIC_CARD_ART = require('../../../../assets/images/icon.png') as number;
import { useForgedSnapshots } from '@/features/create/forged-snapshots';
import { Art } from '../art';
import { CarouselProvider, useCarousel } from '../carousel-context';
import { activeRing, availableCategories } from '../carousel-categories';
import { BUILTIN_CATEGORIES, type CardCategory, type CardItem, isBuiltinCategory } from '../card-data';
import { type Character, SAMPLE_CHARACTER } from '../character';
import { FillText, SheetText } from '../components/primitives';
import { CardCarousel } from '../components/card-carousel';
import { CarouselTokenBoard } from '../components/card-token-board';
import type { PlacedToken } from '../components/card-tokens';
import { ChargeTrack, type ChargeTrackHandle } from '../components/charge-track';
import { HeartTrack, type HeartTrackHandle } from '../components/heart-track';
import { SheetFrame } from '../components/sheet-frame';
import { TraitBanners } from '../components/trait-banners';
import { ChamferFrame, GoldRule, GoldRuleV } from './chamfer';
import { FrameSvg, ProvidedFrame } from './frame-svgs';
import * as ImagePicker from 'expo-image-picker';
import { saveCharacter } from '@/lib/character-store';
import { DamagePanel } from './damage-panel';
import { FloatMenuOverlay, FloatMenuProvider, FloatMenuTrigger, FloatPlaceholder, type PlaceholderKind } from './float-menu';
import { type CardDraft, randomCardColor } from '@/components/card-editor';
import { type CardTarget, NewCardFlow } from './new-card-flow';
import { LevelUpPanel } from './level-up-panel';
import { RestPanel } from './rest-panel';
import type { DomainCardInfo } from './domain-card-info';
import { ModifiersPanel } from './modifiers-panel';
import { CardManagementPanel } from './card-management-panel';
import { diffStatToasts, type StatToast, StatToastHost } from './stat-toasts';
import { CardModifiersSheet } from './card-modifiers-sheet';
import { OriginCardPreview } from './origin-card-preview';
import { PortraitImage, type PortraitTransform } from './portrait-image';

// All sheet colors come from the Rune palette (no raw hex, per AGENTS / H3).
const SHEET = Rune.sheet;
const INK = Rune.inkText;
const RED = Rune.red;
const GOLDD = Rune.goldEdge;
const IVORY = Rune.sheet;
const BRONZE = Rune.bronze; // deep gold labels on parchment (AA at small sizes, L3)

/** One-line stat summary for a Beastform's overview face (#227): "+2 Strength · +2 Evasion · …". */
const WS_TRAIT_LABEL: Record<string, string> = { agility: 'Agility', strength: 'Strength', finesse: 'Finesse', instinct: 'Instinct', presence: 'Presence', knowledge: 'Knowledge' };
function wildshapeSummary(w: Wildshape): string {
  const parts: string[] = [];
  for (const e of w.effects) {
    const d = e.delta ?? 0;
    const s = d >= 0 ? '+' : '';
    if (e.target === 'evasion') parts.push(`${s}${d} Evasion`);
    else if (e.target === 'majorThreshold') parts.push(`${s}${d} Thresholds`); // major+severe move together
    else if (e.target === 'severeThreshold') continue;
    else if (WS_TRAIT_LABEL[e.target]) parts.push(`${s}${d} ${WS_TRAIT_LABEL[e.target]}`);
  }
  return parts.join(' · ');
}

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

function RedesignedBody({ character, onHp, onTrack, onInfo, heartRef, stressRef, armorRef, hopeRef, onPortraitTransform, onPortraitReplace, onOpenOrigin }: { character: Character; onHp: (n: number) => void; onTrack: (key: TrackKey, active: number) => void; onInfo: () => void; heartRef: React.Ref<HeartTrackHandle>; stressRef: React.Ref<ChargeTrackHandle>; armorRef: React.Ref<ChargeTrackHandle>; hopeRef: React.Ref<ChargeTrackHandle>; onPortraitTransform: (t: PortraitTransform) => void; onPortraitReplace: () => void; onOpenOrigin: (slot: 0 | 1 | 2) => void }) {
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
        {/* the player's photo, clipped to the portrait mask, UNDER the gold frame (#135). When set
            it's INTERACTIVE (drag/pinch/hold-to-replace, #155); when not, a tap-to-add Pressable. */}
        {character.portraitUri ? (
          <View style={box(0, 3, 148, 222)}>
            <PortraitImage uri={character.portraitUri} width={148} height={222} transform={character.portraitTransform} onTransform={onPortraitTransform} onReplace={onPortraitReplace} />
          </View>
        ) : (
          <Pressable style={StyleSheet.absoluteFill} onPress={onPortraitReplace} accessibilityRole="button" accessibilityLabel="Character portrait. Add a photo">
            <ArtImage source={Art.portraitPlaceholder} fit="contain" style={{ position: 'absolute', left: 41, top: 48, width: 67, height: 100 } as never} />
          </Pressable>
        )}
        {/* gold frame ON TOP, but pointer-events none so the photo's drag/pinch gestures pass through */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <ArtImage source={Art.portraitFrame} fit="fill" />
        </View>
        {!character.portraitUri ? (
          <SheetText left={0} top={155} width={150} height={15} color={BRONZE} size={12} family={Body.bold} align="center" uppercase letterSpacing={0.6} numberOfLines={1}>
            + Tap to add
          </SheetText>
        ) : null}
      </View>

      {/* ---------- top-right bio column: name → domain chips → lvl/prof → origin strip ----------
          The whole column starts at x176, close to the portrait (the 190 gap read as dead space,
          #48 D), and spans to the defense panel's right edge (396). */}
      {/* Name stretches to the panel's right edge; sits ABOVE the frame layer (C2). */}
      <View style={{ zIndex: 2100 }}>
        {/* FILL the box (#214): the largest font that fits — a SHORT one-word name grows up to fill
            the row, a LONG name shrinks + wraps to ≤2 lines (no more one tiny line). Glyphs are only
            sized, never stretched; a touch of letter-spacing for openness. */}
        <FillText left={176} top={12} width={220} height={58} color={INK} family={Display.black} align="left" vAlign="center" uppercase letterSpacing={0.3} maxLines={2} minSize={15} maxSize={60}>{character.name}</FillText>
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
      {/* #248 item 10: badges + their dividers nudged 4px DOWN for clear air under the level/prof line. */}
      <OctaBadge left={176} top={124} w={48} h={52} icon={Art.subclassIcon} label="Subclass" onPress={() => onOpenOrigin(0)} />
      <OctaBadge left={254} top={124} w={48} h={52} icon={Art.ancestryIcon} label="Ancestry" onPress={() => onOpenOrigin(1)} />
      <OctaBadge left={332} top={124} w={48} h={52} icon={Art.communityIcon} label="Community" onPress={() => onOpenOrigin(2)} />
      <GoldRuleV left={239} top={134} height={34} color="rgba(200,146,58,0.5)" thickness={1.6} />
      <GoldRuleV left={317} top={134} height={34} color="rgba(200,146,58,0.5)" thickness={1.6} />

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
        ref={armorRef}
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
        ref={stressRef}
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
        ref={hopeRef}
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

      {/* The deck-toggle trigger (now opens the radial float menu, #161). Lives at the same screen
          spot the old toggle did (header group 16,12 + child 39,211 → absolute 55,223); kept here in
          the body so it paints below the carousel, with its overlay mounted above the carousel. */}
      <FloatMenuTrigger />
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
 * ONE shared dim for every sheet overlay (#239 item 9). Driven by "is any sheet overlay open"; it
 * fades both directions. Because it persists across overlays, switching from one panel to another
 * (e.g. New Card → gear catalog) or float-menu → panel keeps the screen dark the whole time — no
 * bright flashbang between scrims. The individual overlays now carry only a transparent tap-catcher.
 * Sits above the sheet (zIndex 9500) but below the overlay panels (10000).
 */
function SheetDim({ up }: { up: boolean }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(up ? 1 : 0, { duration: up ? 200 : 220, easing: up ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic) });
  }, [up, p]);
  const style = useAnimatedStyle(() => ({ opacity: p.value * 0.84 }));
  // Oversized so it covers the unclipped stage spill, the status/nav bars, and the letterbox margins.
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -240, bottom: -240, left: -240, right: -240, backgroundColor: '#06080d', zIndex: 9500 }, style]} />;
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
  // The character FILE is held in state too (#164): editing it (custom cards, settings, level-up)
  // re-derives the decks live and persists. Runtime resource state (`character`) stays separate so
  // in-play HP/Stress/Hope aren't reset by a file edit.
  const [file, setFile] = useState(characterFile);
  const mutateFile = useCallback((patch: Partial<CharacterFile>) => {
    setFile((f) => {
      if (!f) return f;
      const next = { ...f, ...patch };
      void saveCharacter(next);
      return next;
    });
  }, []);
  // Default note (#248 item 4): a brand-new character (notes never touched) is seeded with ONE real,
  // deletable note with a random colour. Guarded on `notes === undefined`, so deleting it (→ []) never
  // re-seeds. Replaces the old synthetic placeholder that used the now-deleted temp item image.
  useEffect(() => {
    if (file && file.notes === undefined) {
      mutateFile({ notes: [{ id: 'note-welcome', title: '', text: 'Use the button below the character portrait to open the cards menu, there you can delete this note and add new ones.', imageUri: null, color: randomCardColor() }] });
    }
  }, [file, mutateFile]);
  // Pre-render this character's forged cards on device (#104) so the carousel treats them like any
  // scanned card (uri-based two-LOD pair). The class feature pages become ONE multi-page card in
  // the hand (#108); the experiences are individual cards. Both appear once their bitmaps capture.
  const { featJobs, classJob, expJobs, weaponJobs, armorJob, invJobs, customCardJobs, acqWeaponJobs, acqArmorJobs, acqLootJobs, acqClassJobs, notesJobs, wildshapeFaceJobs } = useMemo(() => {
    // `key` is the forge-cache key (hashed, changes on edit); `id` is the STABLE deck-card id used for
    // enabling/toggling + effect lookup (#175). Equipment/origin/domain ids are already stable; custom
    // & experience cards carry their own stable id here so a toggle survives an edit.
    type Job = { key: string; node: ReactNode; raster?: boolean; id?: string };
    type CustomJob = Job & { target: 'inventory' | 'arsenal' | 'both' };
    const empty = { featJobs: [] as Job[], classJob: null as Job | null, expJobs: [] as Job[], weaponJobs: [] as Job[], armorJob: null as Job | null, invJobs: [] as Job[], customCardJobs: [] as CustomJob[], acqWeaponJobs: [] as Job[], acqArmorJobs: [] as Job[], acqLootJobs: [] as Job[], acqClassJobs: [] as Job[], notesJobs: [] as Job[], wildshapeFaceJobs: [] as Job[] };
    if (!file) return empty;
    const cls = file.className;
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
    const expJobs = (file.experiences ?? []).map((e) => ({
      key: `exp-${e.id}-${(e.title.length * 31 + e.text.length * 7 + (e.imageUri?.length ?? 0) + (e.color?.length ?? 0) * 13 + (e.modifier ?? 0) * 101) % 99991}`,
      id: e.id,
      node: <ForgedCard title={e.title} kindLabel="Experience" body="" accentDeep={Rune.panel} imageUri={e.imageUri} colorArt={e.color} experience modifier={e.modifier ?? 2} />,
      // player photo (file://) decodes async — needs the forge settle so it isn't captured black (#121)
      raster: !!e.imageUri,
    }));
    // starting equipment (#121): the primary weapon, the optional secondary, and the armor card
    const weaponJobs = [file.weaponPrimaryId, file.weaponSecondaryId]
      .map((id) => (id ? weaponById(id) : undefined))
      .filter((w): w is NonNullable<typeof w> => !!w)
      .map((w) => ({ key: w.id, node: <ForgedWeaponCard weapon={w} /> }));
    const armorDef = file.armorId ? armorById(file.armorId) : undefined;
    const armorJob = armorDef ? { key: armorDef.id, node: <ForgedArmorCard armor={armorDef} /> } : null;
    // Acquired gear/loot (#180): system cards picked up beyond creation, forged into the decks so
    // tier 2+ equipment + loot can be equipped + enabled. Skip ids already held as starting equipment.
    const startEquip = new Set([file.weaponPrimaryId, file.weaponSecondaryId, file.armorId].filter(Boolean) as string[]);
    const acquired = (file.acquiredCardIds ?? []).filter((id) => !startEquip.has(id));
    const acqWeaponJobs: Job[] = acquired
      .map((id) => weaponById(id))
      .filter((w): w is NonNullable<typeof w> => !!w)
      .map((w) => ({ key: w.id, node: <ForgedWeaponCard weapon={w} /> }));
    const acqArmorJobs: Job[] = acquired
      .map((id) => armorById(id))
      .filter((a): a is NonNullable<typeof a> => !!a)
      .map((a) => ({ key: a.id, node: <ForgedArmorCard armor={a} /> }));
    const acqLootJobs: Job[] = acquired
      .map((id) => lootById(id))
      .filter((l): l is NonNullable<typeof l> => !!l)
      .map((l) => ({ key: l.id, node: <ForgedCard title={l.name} kindLabel={l.kind === 'consumable' ? 'Consumable' : 'Loot'} body={l.text} accentDeep={Rune.panel} colorArt={itemColor(l.name)} multilineTitle /> }));
    // Acquired CLASS cards (#250 item 4): a multiclass card forged from CLASS_CARDS, NO stat effects.
    const acqClassJobs: Job[] = acquired
      .filter((id) => id.startsWith('class-'))
      .map((id) => ({ id, def: CLASS_CARDS.find((c) => c.key === id.slice(6)) }))
      .filter((x): x is { id: string; def: NonNullable<(typeof CLASS_CARDS)[number]> } => !!x.def)
      .map((x) => ({ key: x.id, id: x.id, node: <ForgedCard title={x.def.title} kindLabel="Class" body={x.def.body} accentDeep={classColor(x.def.key).deep} Banner={x.def.Banner} classKey={x.def.key} multilineTitle /> }));
    // Inventory item cards (#136): the default kit (auto), the chosen options, and the custom items.
    const cinv = CLASS_INVENTORY[cls];
    const cap = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;
    const kitJobs: Job[] = cinv.take.map((name, i) => ({ key: `kit-${cls}-${i}`, node: <ForgedCard title={itemTitle(name)} kindLabel="Item" body={`You carry ${name}.`} accentDeep={Rune.panel} colorArt={itemColor(name)} multilineTitle /> }));
    const chosenIds = file.inventoryItemIds ?? [];
    const chosenJobs: Job[] = cinv.choices.flat().filter((n) => chosenIds.includes(itemOptionId(n))).map((name) => ({ key: itemOptionId(name), node: <ForgedCard title={itemTitle(name)} kindLabel="Item" body={`${cap(name)}.`} accentDeep={Rune.panel} colorArt={itemColor(name)} multilineTitle /> }));
    const customJobs: Job[] = (file.inventoryCustom ?? []).map((it) => ({
      key: `itm-${it.id}-${(it.title.length * 31 + it.text.length * 7 + (it.imageUri?.length ?? 0) + (it.color?.length ?? 0) * 13) % 99991}`,
      id: it.id,
      node: <ForgedCard title={it.title} kindLabel="Item" body={it.text} accentDeep={Rune.panel} imageUri={it.imageUri} colorArt={it.color} multilineTitle />,
      raster: !!it.imageUri,
    }));
    const invJobs = [...kitJobs, ...chosenJobs, ...customJobs];
    // Player-authored cards (#164) → routed to the inventory and/or arsenal deck by `target`.
    const customCardJobs: CustomJob[] = (file.customCards ?? []).map((it) => ({
      key: `cc-${it.id}-${(it.title.length * 31 + it.text.length * 7 + (it.imageUri?.length ?? 0) + (it.color?.length ?? 0) * 13 + (it.typeLabel?.length ?? 0) * 17) % 99991}`,
      id: it.id,
      node: <ForgedCard title={it.title} kindLabel={it.typeLabel ?? (it.target === 'arsenal' ? 'Ability' : it.target === 'both' ? 'Card' : 'Item')} body={it.text} accentDeep={Rune.panel} imageUri={it.imageUri} colorArt={it.color} multilineTitle />,
      raster: !!it.imageUri,
      target: it.target,
    }));
    // Notes (#214): freeform note cards, their own category (every class). Optional title → 'Note'.
    const notesJobs: Job[] = (file.notes ?? []).map((it) => ({
      key: `note-${it.id}-${(it.title.length * 31 + it.text.length * 7 + (it.imageUri?.length ?? 0) + (it.color?.length ?? 0) * 13 + (it.typeLabel?.length ?? 0) * 17) % 99991}`,
      id: it.id,
      node: <ForgedCard title={it.title || 'Note'} kindLabel={it.typeLabel ?? 'Note'} body={it.text} accentDeep={Rune.panel} imageUri={it.imageUri} colorArt={it.color} multilineTitle />,
      raster: !!it.imageUri,
    }));
    // Beastform (#214/#227): Druid-only, each form its own color. TWO forged FACES per form — a flip
    // deck like the class-feature card (#227 item 8) so the title stays a normal size and the rules
    // text isn't crammed tiny: face 0 = overview (tier · stress · attack · stat deltas · examples),
    // face 1 = the form's features. Static content → stable keys; the deck appears only for Druids.
    // Beastform is tier-gated (#242 item 1): only forms of the player's current tier or lower.
    const wsTier = tierForLevel(file.level);
    const wildshapeFaceJobs: Job[] = cls === 'druid'
      ? WILDSHAPES.filter((w) => w.tier <= wsTier).flatMap((w) => [
          { key: `ws-${w.id}-0`, node: <ForgedCard title={w.name} kindLabel="Beastform" body={`Tier ${w.tier} · ${w.stress} Stress\nAttack: ${w.attack}\n${wildshapeSummary(w)}\nExamples: ${w.examples}`} accentDeep={Rune.panel} colorArt={w.color} pageMark="1/2" multilineTitle /> },
          { key: `ws-${w.id}-1`, node: <ForgedCard title={w.name} kindLabel="Features" body={w.features} accentDeep={Rune.panel} colorArt={w.color} pageMark="2/2" multilineTitle /> },
        ])
      : [];
    return { featJobs, classJob, expJobs, weaponJobs, armorJob, invJobs, customCardJobs, acqWeaponJobs, acqArmorJobs, acqLootJobs, acqClassJobs, notesJobs, wildshapeFaceJobs };
  }, [file]);
  const allJobs = useMemo(
    () => [...expJobs, ...(classJob ? [classJob] : []), ...featJobs, ...weaponJobs, ...(armorJob ? [armorJob] : []), ...invJobs, ...customCardJobs, ...acqWeaponJobs, ...acqArmorJobs, ...acqLootJobs, ...acqClassJobs, ...notesJobs, ...wildshapeFaceJobs],
    [expJobs, classJob, featJobs, weaponJobs, armorJob, invJobs, customCardJobs, acqWeaponJobs, acqArmorJobs, acqLootJobs, acqClassJobs, notesJobs, wildshapeFaceJobs],
  );
  const { sources: featureSources, stage: forgeStage } = useForgedSnapshots(allJobs);

  // Entry loader (#150): cover the WHOLE sheet until every forged card is captured (so nothing is
  // seen popping in one-by-one), then fade in. A hard fallback guarantees it can't hang.
  const expectedKeys = useMemo(() => allJobs.map((j) => j.key), [allJobs]);
  const allForged = expectedKeys.length === 0 || expectedKeys.every((k) => featureSources[k]);
  const [sheetReady, setSheetReady] = useState(false);
  const [loaderUp, setLoaderUp] = useState(true);
  // The loader was lifting before the body + cards had actually painted (#168): allForged goes true
  // instantly when there's little to forge, so the veil dropped while pieces were still popping in.
  // Hold it for a MIN display, then add a generous paint grace AFTER everything forges so the whole
  // sheet (carousel cards included) is on screen before the fade. Hard fallback so it can't hang.
  const [minDone, setMinDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMinDone(true), 1500);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (sheetReady) return;
    if (allForged && minDone) {
      const t = setTimeout(() => setSheetReady(true), 1800); // ~1.5s+ of overhead so nothing pops in after the veil lifts
      return () => clearTimeout(t);
    }
  }, [allForged, minDone, sheetReady]);
  useEffect(() => {
    const t = setTimeout(() => setSheetReady(true), 7500);
    return () => clearTimeout(t);
  }, []);

  // Pinned at the RIGHT end of the abilities hand: experiences, then the ONE multi-page class
  // feature card, then subclass, ancestry, community in that order (#100/#108). The origin trio
  // stays LAST so the badges (which target the last three) keep pointing at them.
  const { decks: carouselDecks, categoryMeta, originIndices } = useMemo(() => {
    const none = { decks: undefined as Record<string, CardItem[]> | undefined, categoryMeta: undefined as Record<string, { label: string; icon?: string; builtin: boolean }> | undefined, originIndices: undefined as [number, number, number] | undefined };
    if (!file) return none;
    const ids = [file.subclassCardId, file.ancestryCardId, file.communityCardId];
    const cards = ids.map(cardById);
    if (cards.some((c) => !c)) return none;
    // the actual cards the player PICKED at creation (#121: no more sample/placeholder cards) — the
    // two domain cards lead the abilities hand.
    // Vault (#166): only the ≤5 ACTIVE domain cards ride the deck; the rest sit in the vault.
    const activeDomainSet = file.activeDomainCardIds ?? file.domainCardIds.slice(0, 5);
    const domainItems = file.domainCardIds
      .filter((id) => activeDomainSet.includes(id))
      .map(cardById)
      .filter((c): c is NonNullable<typeof c> => !!c)
      .sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || (a.domain ?? '').localeCompare(b.domain ?? '')) // by level (then domain) (#157)
      .map((c) => ({ id: c.id, source: c.source, thumb: c.thumb }));
    const expItems = expJobs
      .map((j) => ({ key: j.key, id: j.id ?? j.key, src: featureSources[j.key] }))
      .filter((x) => x.src)
      .map((x) => ({ id: x.id, source: x.src!.full, thumb: x.src!.thumb }));
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
        ? [{ id: `features-${file.className}`, source: firstForged.source, thumb: firstForged.thumb, faces }]
        : [];
    // Equipment (#121): weapons + armor appear once forged. Weapons ride BOTH the abilities hand and
    // inventory; armor is inventory only.
    const forgedItems = (jobs: { key: string; node: ReactNode; id?: string }[]) =>
      jobs.map((j) => ({ j, src: featureSources[j.key] })).filter((x) => x.src).map((x) => ({ id: x.j.id ?? x.j.key, source: x.src!.full, thumb: x.src!.thumb }));
    const weaponItems = forgedItems(weaponJobs);
    const armorItems = armorJob ? forgedItems([armorJob]) : [];
    const [subclassC, ancestryC, communityC] = cards.map((c) => ({ id: c!.id, source: c!.source, thumb: c!.thumb }));
    // Arsenal order (#157, owner): domains (by level) → ancestry → community → subclass → class
    // feature card → weapons → experiences. The origin badges target subclass/ancestry/community by
    // their actual index (no longer the contiguous last three).
    // Player-authored cards (#164) ride whichever deck(s) their target names.
    const arsenalCustom = forgedItems(customCardJobs.filter((j) => j.target !== 'inventory'));
    const invCustom = forgedItems(customCardJobs.filter((j) => j.target !== 'arsenal'));
    // Acquired gear/loot (#180): weapons ride arsenal + inventory; armor + loot are inventory.
    const acqWeaponItems = forgedItems(acqWeaponJobs);
    const acqArmorItems = forgedItems(acqArmorJobs);
    const acqLootItems = forgedItems(acqLootJobs);
    const acqClassItems = forgedItems(acqClassJobs); // acquired multiclass cards (#250 item 4)
    const abilities = [...domainItems, ancestryC, communityC, subclassC, ...featItem, ...weaponItems, ...acqWeaponItems, ...acqClassItems, ...expItems, ...arsenalCustom];
    // inventory = ONLY the player's stuff (#136: never the sample deck) — kit + chosen + custom +
    // gold + weapons + armor. Returned as an array (even while forging) so it NEVER falls back.
    const invItems = forgedItems(invJobs);
    // the GOLD card is LIVE + interactive (#136): its +/- adjusts character.gold in place. dummy
    // source/thumb are never drawn (the live node renders instead).
    const goldItem = { id: 'gold', source: GENERIC_CARD_ART, thumb: GENERIC_CARD_ART, live: <GoldCard gold={character.gold} onChange={(g) => setCharacter((c) => ({ ...c, gold: g }))} />, interactive: true };
    const inv = [...invItems, goldItem, ...weaponItems, ...armorItems, ...acqWeaponItems, ...acqArmorItems, ...acqLootItems, ...invCustom];
    // Acquired CATALOG cards (#248 item 5): domain/ancestry/community/subclass picked from the catalog
    // browser, added as their real card image (no forging). Skip ids already in a deck (e.g. an owned
    // domain card) so there's never a duplicate id.
    const existingIds = new Set<string>([...abilities, ...inv].map((i) => i.id));
    const acqCatalogItems: CardItem[] = (file.acquiredCardIds ?? [])
      .map((id) => cardById(id))
      .filter((c): c is NonNullable<typeof c> => !!c && !existingIds.has(c.id))
      .map((c) => ({ id: c.id, source: c.source, thumb: c.thumb }));
    const invFull = [...inv, ...acqCatalogItems];
    // Notes (#214/#248 item 4): just the player's note cards (forged from file.notes). A brand-new
    // character is SEEDED with one real, deletable default note (see the seed effect) — no synthetic
    // placeholder card and never the deleted temp item image.
    const notesItems = forgedItems(notesJobs);
    const notesCards: CardItem[] = notesItems;
    // Beastform (#227): assemble each form's two forged faces into ONE multi-face flip card (id =
    // the form id, so enabling/toggling still targets it). Mirrors the class-feature card assembly.
    const wsTier = tierForLevel(file.level);
    const wildshapeCards: CardItem[] = file.className === 'druid'
      ? WILDSHAPES.filter((w) => w.tier <= wsTier).map((w): CardItem | null => {
          const faces = [`ws-${w.id}-0`, `ws-${w.id}-1`].map((k) => {
            const src = featureSources[k];
            return src ? { source: src.full, thumb: src.thumb } : { custom: wildshapeFaceJobs.find((j) => j.key === k)?.node };
          });
          const first = faces.find((f) => 'source' in f && f.source) as { source: { uri: string }; thumb: { uri: string } } | undefined;
          if (!first) return null;
          return { id: w.id, source: first.source, thumb: first.thumb, faces };
        }).filter((c): c is CardItem => c !== null)
      : [];
    // Card management (#246): assemble the full category→deck MAP and apply per-card category overrides
    // (a card moved to another built-in or custom category), then build custom-category decks. With no
    // custom categories + no overrides this yields the exact four built-in decks as before (additive).
    const customCats = file.customCategories ?? [];
    const override = file.cardCategory ?? {};
    const removed = new Set(file.removedCardIds ?? []); // universal delete (#248 item 5)
    const base: Record<string, CardItem[]> = { abilities, inventory: invFull, wildshape: wildshapeCards, notes: notesCards };
    const validKeys = new Set<string>([...BUILTIN_CATEGORIES, ...customCats.map((c) => c.id)]);
    const decks: Record<string, CardItem[]> = { abilities: [], inventory: [], wildshape: [], notes: [] };
    for (const c of customCats) decks[c.id] = [];
    for (const cat of Object.keys(base)) {
      for (const item of base[cat]) {
        if (removed.has(item.id)) continue; // deleted from the gallery → filtered out of every deck
        const ov = override[item.id];
        const target = ov && validKeys.has(ov) ? ov : cat;
        (decks[target] ??= []).push(item);
      }
    }
    const categoryMeta: Record<string, { label: string; icon?: string; builtin: boolean }> = {
      abilities: { label: 'Arsenal', builtin: true },
      inventory: { label: 'Inventory', builtin: true },
      wildshape: { label: 'Beastform', builtin: true },
      notes: { label: 'Notes', builtin: true },
    };
    for (const c of customCats) categoryMeta[c.id] = { label: c.label, icon: c.icon, builtin: false };
    // Origin badges (#100) target the FINAL abilities deck (a card may have been moved out → -1, which
    // the legacy openOriginCard guards; the badges themselves use the standalone preview now).
    const fa = decks.abilities;
    const originIndices: [number, number, number] = [fa.findIndex((x) => x.id === subclassC.id), fa.findIndex((x) => x.id === ancestryC.id), fa.findIndex((x) => x.id === communityC.id)];
    return { decks, categoryMeta, originIndices };
  }, [file, character.gold, expJobs, classJob, featJobs, weaponJobs, armorJob, invJobs, customCardJobs, acqWeaponJobs, acqArmorJobs, acqLootJobs, acqClassJobs, notesJobs, wildshapeFaceJobs, featureSources]);
  const [damageOpen, setDamageOpen] = useState(false); // damage-threshold keypad (#128, was the info card)
  const [floatKind, setFloatKind] = useState<PlaceholderKind | null>(null); // radial-menu interface (#161)
  const [cardInfoId, setCardInfoId] = useState<string | null>(null); // per-card modifier view (#175)
  // Origin-card preview (#242 item 4): a standalone copy of subclass/ancestry/community, not the carousel.
  const [originPreview, setOriginPreview] = useState<{ id: string; source: number | { uri: string }; label: string } | null>(null);
  const [toasts, setToasts] = useState<StatToast[]>([]); // stat-change toasts on card toggle (#233)
  const toastId = useRef(1);
  // Emit a toast per changed stat, capped to the newest 5 on screen (#239 item 2: FIFO — oldest drop
  // first so they never stack endlessly). Shared by card toggle (#233) and level-up confirm (#239).
  const pushToasts = useCallback((prev: Character, next: Character) => {
    const fresh = diffStatToasts(prev, next, toastId.current);
    if (!fresh.length) return;
    toastId.current += fresh.length;
    setToasts((list) => [...list, ...fresh].slice(-5));
  }, []);
  // Level Up (#167): the domain cards available to gain (≤ the NEXT level, in this class's domains,
  // not already owned), the multiclass options, and the class-derived stat defaults.
  const levelData = useMemo(() => {
    if (!file) return { domainOptions: [] as DomainCardInfo[], classOptions: [] as { key: string; label: string }[], defaults: { maxHp: 6, stressMax: 6, evasion: 10 } };
    const cls = classInfo(file.className);
    const owned = new Set(file.domainCardIds);
    const targetLevel = file.level + 1;
    const domainOptions: DomainCardInfo[] = CATALOG.filter((c) => c.kind === 'domain' && !!c.domain && cls.domains.includes(c.domain) && (c.level ?? 0) <= targetLevel && !owned.has(c.id)).map((c) => ({ id: c.id, title: c.label, thumb: c.thumb as DomainCardInfo['thumb'], source: c.source as DomainCardInfo['source'], domain: c.domain, level: c.level }));
    const data = CLASS_DATA[file.className];
    const classOptions = CLASSES.filter((c) => c.key !== file.className).map((c) => ({ key: c.key, label: c.label }));
    return { domainOptions, classOptions, defaults: { maxHp: data.startingHp, stressMax: 6, evasion: data.startingEvasion } };
  }, [file]);
  const onInfo = useCallback(() => setDamageOpen(true), []);
  // Origin badge → standalone card preview (#242 item 4): show a copy of the picked card; never touch
  // the carousel/category. The preview equips/unequips the SAME id, so it stays in sync.
  const onOpenOrigin = useCallback(
    (slot: 0 | 1 | 2) => {
      if (!file) return;
      const id = [file.subclassCardId, file.ancestryCardId, file.communityCardId][slot];
      const c = cardById(id);
      if (c) setOriginPreview({ id: c.id, source: c.source, label: c.label });
    },
    [file],
  );
  const heartRef = useRef<HeartTrackHandle>(null);
  const stressRef = useRef<ChargeTrackHandle>(null);
  const armorRef = useRef<ChargeTrackHandle>(null);
  const hopeRef = useRef<ChargeTrackHandle>(null);
  const onApplyDamage = useCallback((hpLoss: number) => heartRef.current?.applyDamage(hpLoss), []);
  // Latest runtime character, for handlers that must read it without re-subscribing (toggle/rest).
  const characterRef = useRef(character);
  characterRef.current = character;
  // Burst-animate every resource track that changed (#192): used by Rest + equip/unequip so the
  // hearts / stress / armor / hope icons all animate at once, like the damage panel.
  const burstResources = useCallback((prev: Character, next: Character) => {
    heartRef.current?.burst(prev.hp, next.hp);
    stressRef.current?.burst(prev.stress.active, next.stress.active);
    armorRef.current?.burst(prev.armor.active, next.armor.active);
    hopeRef.current?.burst(prev.hope.active, next.hope.active);
  }, []);

  // Confirming Level Up (#239 items 6 + 7): re-derive build stats, keep in-play resource positions
  // (clamped to the new maxes), and CELEBRATE the result — a gained Max HP slot fills with its heart
  // animation and every stat change pops a toast.
  const onApplyLevelUp = useCallback(
    (next: CharacterFile) => {
      setFile(next);
      void saveCharacter(next);
      const c = characterRef.current;
      const d = toSheetCharacter(next);
      const hpGain = Math.max(0, d.maxHp - c.maxHp); // follow the gain so the new heart animates filling
      const result: Character = {
        ...d,
        hp: Math.min(d.maxHp, c.hp + hpGain),
        stress: { ...d.stress, active: Math.min(c.stress.active, d.stress.total - (d.stress.locked ?? 0)) },
        armor: { ...d.armor, active: Math.min(c.armor.active, d.armor.total - (d.armor.locked ?? 0)) },
        hope: { ...d.hope, active: Math.min(c.hope.active, d.hope.total) },
        gold: c.gold,
        portraitUri: c.portraitUri,
        portraitTransform: c.portraitTransform,
      };
      pushToasts(c, result); // toast the stat changes this level brought (item 7)
      setCharacter(result);
      setFloatKind(null);
      // Burst AFTER the panel closes + the HeartTrack re-mounts with the new slot count (item 6): the
      // track's imperative handle is rebuilt when maxHp grows, so a synchronous burst would target the
      // OLD slot count and miss the new heart. A short defer lets the new slot exist before it fills.
      setTimeout(() => burstResources(c, result), 90);
    },
    [pushToasts, burstResources],
  );

  // Portrait edits (#155) persist to the character FILE (via the file state, #164) and update the
  // runtime character.
  const onPortraitTransform = useCallback((t: PortraitTransform) => {
    setCharacter((c) => ({ ...c, portraitTransform: t }));
    mutateFile({ portraitTransform: t });
  }, [mutateFile]);
  const onPortraitReplace = useCallback(async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 }); // no forced crop (#155)
    if (res.canceled || !res.assets[0]) return;
    const portraitUri = res.assets[0].uri;
    const reset = { scale: 1, x: 0, y: 0 };
    setCharacter((c) => ({ ...c, portraitUri, portraitTransform: reset }));
    mutateFile({ portraitUri, portraitTransform: reset });
  }, [mutateFile]);
  // New Card (#164/#214/#246): append a player-authored card into a target CATEGORY (built-in or
  // custom). Notes land in the Notes deck; inventory in inventoryCustom; everything else is an Arsenal
  // custom card. A custom category also gets a card→category override so the card lives there.
  const onAddCustomCard = useCallback((draft: CardDraft, categoryKey: CardCategory) => {
    const id = `cc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const baseCard = {
      id,
      title: draft.title,
      text: draft.text,
      imageUri: draft.imageUri,
      color: draft.color,
      effects: draft.effects,
      typeLabel: draft.typeLabel,
    };
    setFile((f) => {
      if (!f) return f;
      let next: CharacterFile;
      if (categoryKey === 'notes') {
        next = { ...f, notes: [...(f.notes ?? []), baseCard] };
      } else {
        const target: CardTarget = categoryKey === 'inventory' ? 'inventory' : 'arsenal';
        const card: CustomCardDef = { ...baseCard, target };
        next = { ...f, customCards: [...(f.customCards ?? []), card] };
      }
      if (!isBuiltinCategory(categoryKey)) {
        next = { ...next, cardCategory: { ...(next.cardCategory ?? {}), [id]: categoryKey } };
      }
      void saveCharacter(next);
      return next;
    });
    setFloatKind(null);
    setNewCardCat(null);
  }, []);
  // Acquired system gear/loot (#180): adding an id forges it into the decks (re-derives from file).
  const acquiredIds = useMemo(() => new Set(file?.acquiredCardIds ?? []), [file]);
  const onAcquireCard = useCallback((id: string) => {
    setFile((f) => {
      if (!f) return f;
      if ((f.acquiredCardIds ?? []).includes(id)) return f;
      const next = { ...f, acquiredCardIds: [...(f.acquiredCardIds ?? []), id] };
      void saveCharacter(next);
      return next;
    });
  }, []);
  // Hidden categories (#227, Cards panel): which categories the player toggled off. Back-compat:
  // a legacy save with showNotes === false maps to notes hidden.
  const hidden = useMemo<CardCategory[]>(
    () => file?.hiddenCategories ?? (file?.showNotes === false ? ['notes'] : []),
    [file?.hiddenCategories, file?.showNotes],
  );
  // Custom categories (#246) the player has created.
  const customCategories = useMemo(() => file?.customCategories ?? [], [file]);
  // The active category ring (#214/#227/#246/#250): available categories (built-in + custom) reordered
  // by `categoryOrder`, minus hidden, minus EMPTY ones — an over-scroll never lands on a category with
  // no cards (#250 item 3), so the player can't get trapped. Falls back to any non-empty category.
  const ring = useMemo(() => {
    const r = activeRing({ isDruid: file?.className === 'druid', hidden, custom: customCategories, order: file?.categoryOrder });
    if (!carouselDecks) return r; // demo sheet (no file) — no per-deck counts, use the ring as-is
    const nonEmpty = r.filter((k) => (carouselDecks?.[k]?.length ?? 0) > 0);
    if (nonEmpty.length) return nonEmpty;
    const anyNonEmpty = availableCategories({ isDruid: file?.className === 'druid', custom: customCategories }).filter((k) => (carouselDecks?.[k]?.length ?? 0) > 0);
    return anyNonEmpty.length ? anyNonEmpty : ['abilities'];
  }, [file?.className, hidden, customCategories, file?.categoryOrder, carouselDecks]);
  // Re-derive the runtime character from a new file, keeping in-play resource positions (clamped to the
  // new maxes). Used by edits that can change stats (e.g. deleting an enabled card).
  const commitFile = useCallback((next: CharacterFile) => {
    setFile(next);
    void saveCharacter(next);
    const c = characterRef.current;
    const d = toSheetCharacter(next);
    setCharacter({
      ...d,
      hp: Math.min(d.maxHp, c.hp),
      stress: { ...d.stress, active: Math.min(c.stress.active, d.stress.total - (d.stress.locked ?? 0)) },
      armor: { ...d.armor, active: Math.min(c.armor.active, d.armor.total - (d.armor.locked ?? 0)) },
      hope: { ...d.hope, active: Math.min(c.hope.active, d.hope.total) },
      gold: c.gold,
      portraitUri: c.portraitUri,
      portraitTransform: c.portraitTransform,
    });
  }, []);
  // Cards panel (#227/#246): toggle a category on/off (≥1 must stay enabled). Works for built-in AND
  // custom categories (the available set includes both).
  const onToggleCategory = useCallback((c: CardCategory) => {
    setFile((f) => {
      if (!f) return f;
      const available = availableCategories({ isDruid: f.className === 'druid', custom: f.customCategories ?? [] });
      const cur = new Set<CardCategory>(f.hiddenCategories ?? (f.showNotes === false ? ['notes'] : []));
      if (cur.has(c)) cur.delete(c);
      else {
        if (available.filter((x) => !cur.has(x)).length <= 1) return f; // never hide the last one
        cur.add(c);
      }
      const next = { ...f, hiddenCategories: [...cur] };
      void saveCharacter(next);
      return next;
    });
  }, []);
  // Create a custom category (#246): a fresh id, the given label + icon, appended to the order.
  const onCreateCategory = useCallback((label: string, icon: string) => {
    const id = `cat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    setFile((f) => {
      if (!f) return f;
      const cat = { id, label: label.trim() || 'New Category', icon };
      const order = f.categoryOrder ?? activeRing({ isDruid: f.className === 'druid', custom: f.customCategories ?? [] });
      const next = { ...f, customCategories: [...(f.customCategories ?? []), cat], categoryOrder: [...order, id] };
      void saveCharacter(next);
      return next;
    });
  }, []);
  // Rename / re-icon a custom category (#246).
  const onUpdateCategory = useCallback((id: string, patch: { label?: string; icon?: string }) => {
    mutateFile({ customCategories: (file?.customCategories ?? []).map((c) => (c.id === id ? { ...c, ...patch, label: (patch.label ?? c.label).trim() || c.label } : c)) });
  }, [file, mutateFile]);
  // Delete a custom category (#246): drop it, un-hide it, remove from the order, and revert any cards
  // it held back to their default category (clear their overrides).
  const onDeleteCategory = useCallback((id: string) => {
    setFile((f) => {
      if (!f) return f;
      const cardCategory = { ...(f.cardCategory ?? {}) };
      for (const k of Object.keys(cardCategory)) if (cardCategory[k] === id) delete cardCategory[k];
      const next = {
        ...f,
        customCategories: (f.customCategories ?? []).filter((c) => c.id !== id),
        categoryOrder: (f.categoryOrder ?? []).filter((k) => k !== id),
        hiddenCategories: (f.hiddenCategories ?? []).filter((k) => k !== id),
        cardCategory,
      };
      void saveCharacter(next);
      return next;
    });
  }, []);
  // Reorder the ring (#246): persist the explicit category order.
  const onReorderCategories = useCallback((order: string[]) => mutateFile({ categoryOrder: order }), [mutateFile]);
  // Move a card to a different category (#246): a per-card override (built-in or custom key).
  // Move one or more cards to a category (#246/#248): per-card override (built-in or custom key).
  const onMoveCards = useCallback((ids: string[], categoryKey: string) => {
    setFile((f) => {
      if (!f) return f;
      const map = { ...(f.cardCategory ?? {}) };
      for (const id of ids) map[id] = categoryKey;
      const next = { ...f, cardCategory: map };
      void saveCharacter(next);
      return next;
    });
  }, []);
  // Delete ANY cards (#248 item 5): strip authored/acquired/domain entries + enabled/override/tokens,
  // and add every id to `removedCardIds` so SYSTEM cards (origins, class feature, equipment, gold) drop
  // from the decks too — everything is deletable. Re-derives stats (a deleted card may have been enabled).
  const onDeleteCards = useCallback((ids: string[]) => {
    if (!file || ids.length === 0) return;
    const del = new Set(ids);
    const cardCategory = { ...(file.cardCategory ?? {}) };
    const cardTokens = { ...(file.cardTokens ?? {}) };
    for (const id of ids) { delete cardCategory[id]; delete cardTokens[id]; }
    const next: CharacterFile = {
      ...file,
      customCards: (file.customCards ?? []).filter((c) => !del.has(c.id)),
      inventoryCustom: (file.inventoryCustom ?? []).filter((c) => !del.has(c.id)),
      notes: (file.notes ?? []).filter((c) => !del.has(c.id)),
      experiences: (file.experiences ?? []).filter((c) => !del.has(c.id)),
      acquiredCardIds: (file.acquiredCardIds ?? []).filter((x) => !del.has(x)),
      domainCardIds: file.domainCardIds.filter((x) => !del.has(x)),
      activeDomainCardIds: file.activeDomainCardIds?.filter((x) => !del.has(x)),
      enabledCardIds: (file.enabledCardIds ?? []).filter((x) => !del.has(x)),
      removedCardIds: [...new Set([...(file.removedCardIds ?? []), ...ids])],
      cardCategory,
      cardTokens,
    };
    commitFile(next);
  }, [file, commitFile]);
  // Card types (#246): add / remove the player's custom middle-ribbon types.
  const customCardTypes = useMemo(() => file?.customCardTypes ?? [], [file]);
  const onAddCardType = useCallback((label: string) => {
    const v = label.trim();
    if (!v) return;
    mutateFile({ customCardTypes: [...new Set([...(file?.customCardTypes ?? []), v])] });
  }, [file, mutateFile]);
  const onDeleteCardType = useCallback((label: string) => {
    mutateFile({ customCardTypes: (file?.customCardTypes ?? []).filter((t) => t !== label) });
  }, [file, mutateFile]);
  // Add a card targeted at a specific category (#246): open New Card with that category preselected.
  const [newCardCat, setNewCardCat] = useState<CardCategory | null>(null);
  const onAddCardInCategory = useCallback((key: CardCategory) => {
    setNewCardCat(key);
    setFloatKind('custom');
  }, []);
  // Enabled/equipped cards (#175): the set drives the corner check; toggling re-derives the build
  // stats via the modifier engine while keeping in-play resource positions (clamped to the new maxes).
  const enabledIds = useMemo(() => new Set(file?.enabledCardIds ?? []), [file]);
  const onToggleCard = useCallback(
    (id: string) => {
      if (!file) return;
      const wasEnabled = (file.enabledCardIds ?? []).includes(id);
      const isWs = isWildshapeId(id);
      const cur = new Set(file.enabledCardIds ?? []);
      if (wasEnabled) {
        cur.delete(id); // dropping out of a form reverts its effects; the Stress cost is NOT refunded
      } else {
        // Wild Shape (#214): only one Beastform at a time — assuming one drops any other.
        if (isWs) for (const x of [...cur]) if (isWildshapeId(x)) cur.delete(x);
        // Threshold SET conflict (#242 item 9): a card that SETS Major (or Severe) disables any other
        // enabled card that sets the same threshold — two "set major" can't both apply. Bonuses stack.
        const eff = effectsForCardId(id, file);
        const setsMajor = eff.some((e) => e.target === 'majorThreshold' && e.mode === 'set');
        const setsSevere = eff.some((e) => e.target === 'severeThreshold' && e.mode === 'set');
        if (setsMajor || setsSevere) {
          for (const x of [...cur]) {
            if (x === id) continue;
            const xe = effectsForCardId(x, file);
            if (setsMajor && xe.some((e) => e.target === 'majorThreshold' && e.mode === 'set')) cur.delete(x);
            if (setsSevere && xe.some((e) => e.target === 'severeThreshold' && e.mode === 'set')) cur.delete(x);
          }
        }
        cur.add(id);
      }
      const next = { ...file, enabledCardIds: [...cur] };
      setFile(next);
      void saveCharacter(next);
      const c = characterRef.current;
      const d = toSheetCharacter(next);
      // Gaining Max HP fills the new heart(s) (#233 item 5): hp follows the gain so the added slot
      // animates filling; on a loss hp clamps down (the burst shows the heart breaking).
      const hpGain = Math.max(0, d.maxHp - c.maxHp);
      let result: Character = {
        ...d,
        hp: Math.min(d.maxHp, c.hp + hpGain),
        stress: { ...d.stress, active: Math.min(c.stress.active, d.stress.total - (d.stress.locked ?? 0)) },
        armor: { ...d.armor, active: Math.min(c.armor.active, d.armor.total - (d.armor.locked ?? 0)) },
        hope: { ...d.hope, active: Math.min(c.hope.active, d.hope.total) },
        gold: c.gold,
        portraitUri: c.portraitUri,
        portraitTransform: c.portraitTransform,
      };
      // Assuming a Beastform costs Stress (#214) — spill to HP when Stress is full, never lethal.
      if (isWs && !wasEnabled) {
        const ws = wildshapeById(id);
        if (ws) {
          const { stressActive, hp } = applyWildshapeCost(
            { stressActive: result.stress.active, stressUnlocked: result.stress.total - (result.stress.locked ?? 0), hp: result.hp },
            ws.stress,
          );
          result = { ...result, hp, stress: { ...result.stress, active: stressActive } };
        }
      }
      // Toast each attribute the toggle changed (#233 item 1): "+1 Finesse", "−2 Evasion", …
      pushToasts(c, result);
      // animate any track whose value the equip/unequip changed (e.g. +1 Max HP at full HP, removed)
      burstResources(c, result);
      setCharacter(result);
    },
    [file, burstResources, pushToasts],
  );
  // Card tokens (#244): cosmetic buttons stuck on cards, keyed by deck-card id. They never feed the
  // modifier engine — pure decoration — so they don't re-derive `character`; they only persist.
  const cardTokens = useMemo(() => file?.cardTokens ?? {}, [file]);
  const placeToken = useCallback((cardId: string, token: PlacedToken) => {
    setFile((f) => {
      if (!f) return f;
      const map = { ...(f.cardTokens ?? {}) };
      map[cardId] = [...(map[cardId] ?? []), token];
      const next = { ...f, cardTokens: map };
      void saveCharacter(next);
      return next;
    });
  }, []);
  const removeToken = useCallback((cardId: string, tokenId: string) => {
    setFile((f) => {
      if (!f) return f;
      const cur = (f.cardTokens ?? {})[cardId];
      if (!cur) return f;
      const map = { ...(f.cardTokens ?? {}) };
      const left = cur.filter((t) => t.id !== tokenId);
      if (left.length) map[cardId] = left;
      else delete map[cardId];
      const next = { ...f, cardTokens: map };
      void saveCharacter(next);
      return next;
    });
  }, []);
  const setTokenColor = useCallback((color: string) => mutateFile({ tokenColor: color }), [mutateFile]);
  const moveTokenDrawer = useCallback((x: number) => mutateFile({ tokenDrawerX: x }), [mutateFile]);
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
      <CarouselProvider decks={carouselDecks} categoryMeta={categoryMeta} ring={ring} originIndices={originIndices} enabledIds={enabledIds} onToggleCard={onToggleCard} onShowCardInfo={setCardInfoId} cardTokens={cardTokens} tokenColor={file?.tokenColor} tokenDrawerX={file?.tokenDrawerX} onPlaceToken={placeToken} onRemoveToken={removeToken} onSetTokenColor={setTokenColor} onMoveTokenDrawer={moveTokenDrawer}>
       <FloatMenuProvider onOpenInterface={setFloatKind}>
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
              <RedesignedBody character={character} onHp={onHp} onTrack={onTrack} onInfo={onInfo} heartRef={heartRef} stressRef={stressRef} armorRef={armorRef} hopeRef={hopeRef} onPortraitTransform={onPortraitTransform} onPortraitReplace={onPortraitReplace} onOpenOrigin={onOpenOrigin} />
              <TraitBanners character={character} modifierSize={22} groupTop={614} />
              <ExpandVeil />
              {/* Gears now live INSIDE the carousel (#62 D): above the veil and the fullscreen dim,
                  never above a card — and the inner gear is the grind-scroll control. */}
              {/* Unload the sheet carousel while Level-Up (#203) or the Cards panel (#227) is open —
                  Level-Up owns the screen; the Cards panel may disable the current category, so the
                  hand must be down to land safely on an enabled one when it reopens. */}
              {floatKind === 'level' || floatKind === 'cards' ? null : <CardCarousel />}
              {/* card token board (#244): the drawer + draggable tokens over a focused card. A sibling
                  of the carousel (not nested under its pan) so token gestures never fight the scroll. */}
              {floatKind === 'level' || floatKind === 'cards' ? null : <CarouselTokenBoard />}
              {/* radial float menu (#161): dim + connector + fanned options, above the carousel */}
              <FloatMenuOverlay />
            </DesignStage>
            {/* Stat-change toasts (#233): pinned at the top, UNDER the gold border (rendered before
                SheetFrame) so the border overlays them — layer + position per owner. */}
            <StatToastHost toasts={toasts} onExpire={(id) => setToasts((list) => list.filter((t) => t.id !== id))} />
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
          {/* Unified overlay dim (#239 item 9): one fading scrim shared by the float-menu panels +
              the per-card modifier sheet, so transitions never flashbang the bright sheet. */}
          <SheetDim up={floatKind !== null || cardInfoId !== null || originPreview !== null || damageOpen} />
          {/* damage-threshold keypad (#128): full-screen overlay above everything; on confirm it
              animates out, then bursts the lost hearts via the HeartTrack handle */}
          {damageOpen ? <DamagePanel thresholds={character.damageThresholds} onApply={onApplyDamage} onClose={() => setDamageOpen(false)} /> : null}
          {/* offscreen forge stage: captures the class-feature cards to bitmaps (#104) */}
          {forgeStage}
          {/* entry loader (#150): covers the whole sheet while the cards forge, then fades to reveal */}
          {loaderUp ? <RuneLoader done={sheetReady} onHidden={() => setLoaderUp(false)} caption="Summoning the sheet" /> : null}
          {/* radial-menu interfaces (#161/#164): New Card is live; Rest / Level Up / Settings still
              open a placeholder until their PRs. Above everything, like the damage keypad. */}
          {floatKind === 'custom' ? (
            <NewCardFlow categoryOverride={newCardCat ?? undefined} customTypes={customCardTypes} onSave={onAddCustomCard} onCancel={() => { setFloatKind(null); setNewCardCat(null); }} onAcquire={onAcquireCard} acquiredIds={acquiredIds} />
          ) : floatKind === 'rest' ? (
            <RestPanel character={character} onApply={(next) => { burstResources(characterRef.current, next); setCharacter(next); }} onClose={() => setFloatKind(null)} />
          ) : floatKind === 'modifiers' && file ? (
            <ModifiersPanel file={file} onClose={() => setFloatKind(null)} />
          ) : floatKind === 'cards' && file ? (
            <CardManagementPanel
              isDruid={file.className === 'druid'}
              hidden={hidden}
              order={file.categoryOrder}
              customCategories={customCategories}
              customTypes={customCardTypes}
              onToggle={onToggleCategory}
              onCreateCategory={onCreateCategory}
              onUpdateCategory={onUpdateCategory}
              onDeleteCategory={onDeleteCategory}
              onReorder={onReorderCategories}
              onMoveCards={onMoveCards}
              onDeleteCards={onDeleteCards}
              onAddCardInCategory={onAddCardInCategory}
              onAddType={onAddCardType}
              onDeleteType={onDeleteCardType}
              onClose={() => setFloatKind(null)}
            />
          ) : floatKind === 'level' && file ? (
            <LevelUpPanel file={file} defaults={levelData.defaults} domainOptions={levelData.domainOptions} classOptions={levelData.classOptions} onApply={onApplyLevelUp} onClose={() => setFloatKind(null)} />
          ) : floatKind ? (
            <FloatPlaceholder kind={floatKind} onClose={() => setFloatKind(null)} />
          ) : null}
          {/* per-card modifier view (#175): opened by the focused card's "Modifiers" button */}
          {cardInfoId && file ? (
            <CardModifiersSheet cardId={cardInfoId} file={file} character={character} enabled={enabledIds.has(cardInfoId)} onToggle={onToggleCard} onClose={() => setCardInfoId(null)} />
          ) : null}
          {/* origin card preview (#242 item 4): a standalone equippable copy, decoupled from the carousel */}
          {originPreview ? (
            <OriginCardPreview
              source={originPreview.source}
              label={originPreview.label}
              enabled={enabledIds.has(originPreview.id)}
              onToggle={() => onToggleCard(originPreview.id)}
              onClose={() => setOriginPreview(null)}
              tokens={cardTokens[originPreview.id] ?? []}
              drawerColor={file?.tokenColor}
              drawerX={file?.tokenDrawerX}
              onPlaceToken={(t) => placeToken(originPreview.id, t)}
              onRemoveToken={(tid) => removeToken(originPreview.id, tid)}
              onSetTokenColor={setTokenColor}
              onMoveTokenDrawer={moveTokenDrawer}
            />
          ) : null}
        </View>
       </FloatMenuProvider>
      </CarouselProvider>
    </AccentProvider>
  );
}
