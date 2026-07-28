/**
 * v0.13.2 (#359): sheet-side NFC card RECEIVING + its landing ceremony.
 *
 * `SheetNfcReceiver` is a null-rendering controller (the SheetBackGuard pattern) that runs a persistent
 * `receiveNfc()` loop whenever `nfcReceiveActive` is true — always, except while a focused interface is
 * open. On a card tag it hands the card up; the sheet raises the confirmation ceremony.
 *
 * `NfcReceiveCeremony` is the full-screen overlay: a confirmation panel fades in and the carousel eases
 * to compact; on accept the card descends from the top of the screen with a particle sparkle, presents
 * at center as the focused card, then tucks into the hand while the commit happens UNDER the overlay
 * (so the carousel update never shows a wrong-order or empty frame — the Golden-Gear-Edit principle).
 */
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { Easing, interpolate, type SharedValue, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { ChamferBox } from '@/components/chamfer-box';
import { ArtImage } from '@/components/art-image';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, Rune } from '@/constants/theme';
import { cardById } from '@/data/catalog';
import { playSfx } from '@/lib/sfx';
import { cancelNfcReceive, receiveNfc } from '@/lib/nfc';
import type { LibraryCard } from '@/lib/library';
import { libraryCardKindLabel } from '@/lib/library-embed';
import { focusHaptic } from '@/lib/haptics';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

import { FORGED_H, FORGED_W } from '@/features/create/components/forged-card';
import { LibraryForgedCard } from '@/features/create/components/library-forged-card';
import { useLayout } from '@/hooks/use-layout';
import { useScreenDim } from '@/lib/screen-dim';
import { type CardCategory } from '../card-data';
import { useCarousel } from '../carousel-context';
import { type NfcGateFlags, nfcReceiveActive } from './nfc-gate';

/** The flags the sheet owns (everything but `editing`, which the controller reads from the carousel). */
export type NfcReceiverFlags = Omit<NfcGateFlags, 'editing'>;

/**
 * Persistent receive loop. Mount INSIDE the carousel + float-menu providers so it can read `editing`.
 * Re-arms after each tag and after the gate re-opens; cancels the in-flight read the moment it closes.
 */
export function SheetNfcReceiver({ flags, present, onCard, onReject }: { flags: NfcReceiverFlags; present: boolean; onCard: (card: LibraryCard) => void; onReject: (msg: string) => void }) {
  const { editing } = useCarousel();
  const active = present && nfcReceiveActive({ ...flags, editing });
  const activeRef = useRef(active);
  activeRef.current = active;
  const onCardRef = useRef(onCard);
  onCardRef.current = onCard;
  const onRejectRef = useRef(onReject);
  onRejectRef.current = onReject;
  useEffect(() => {
    if (!active) {
      void cancelNfcReceive();
      return;
    }
    let live = true;
    (async () => {
      while (live && activeRef.current) {
        try {
          const content = await receiveNfc();
          if (!live) break;
          if (content.kind === 'card') {
            // v0.14.0: buzz the INSTANT the tag reads, before any UI paints. Tapping two phones together
            // gives no other feedback that it landed, and the ceremony takes a beat to appear.
            focusHaptic();
            onCardRef.current(content.payload);
            break; // stop reading; `receiving` closes the gate until the ceremony resolves
          }
          onRejectRef.current(content.kind === 'character' ? 'That was a hero. Import heroes from a file.' : 'That was an expansion. Add it in the Card Library.');
          await new Promise((r) => setTimeout(r, 350)); // brief backoff, then re-arm
        } catch {
          if (!live) break;
          await new Promise((r) => setTimeout(r, 300)); // cancel / timeout / bad tap → re-arm
        }
      }
    })();
    return () => {
      live = false;
      void cancelNfcReceive();
    };
  }, [active]);
  return null;
}

// ---- ceremony timing (design knobs — tune on device) ------------------------------------------------
// v0.14.0: the descent was too quick to read as an arrival, so it's markedly slower and eased in-out —
// the card gathers pace leaving the top of the screen and settles into the center rather than snapping.
const DESCEND_MS = 1700; // above-screen → present at center (+ a beat holding there)
const TUCK_MS = 620; //     present → tuck into the hand
const LAND_AT = Math.round(DESCEND_MS * 0.66); // the beat the card reaches center — landing haptic
const COMMIT_AT = DESCEND_MS - 40; // fire the file commit as the tuck begins (hidden under the card)

/** Deterministic sparkle field (no Math.random — index-derived angles), radiating from the present point. */
const SPARKS = Array.from({ length: 14 }, (_, i) => {
  const ang = (i / 14) * Math.PI * 2 + (i % 2 ? 0.22 : 0);
  return { ang, dist: 62 + (i % 4) * 26, size: 4 + (i % 3) * 2, delay: (i % 5) * 0.02, bright: i % 3 === 0 };
});

function Spark({ drop, cx, cy, s }: { drop: SharedValue<number>; cx: number; cy: number; s: (typeof SPARKS)[number] }) {
  const style = useAnimatedStyle(() => {
    const p = interpolate(drop.value, [0.4 + s.delay, 0.62, 0.82], [0, 1, 0], 'clamp');
    const travel = interpolate(p, [0, 1], [0, s.dist]);
    return {
      position: 'absolute',
      left: cx + Math.cos(s.ang) * travel - s.size / 2,
      top: cy + Math.sin(s.ang) * travel - s.size / 2,
      width: s.size,
      height: s.size,
      borderRadius: s.size / 2,
      backgroundColor: s.bright ? Rune.goldBright : Rune.goldEdge,
      opacity: Math.sin(Math.min(1, Math.max(0, p)) * Math.PI) * 0.9,
      transform: [{ scale: 0.6 + p * 0.8 }],
    };
  });
  return <Animated.View pointerEvents="none" style={style} />;
}

/**
 * The received-card ceremony. Reads the carousel so it can ease to compact; the sheet passes the commit
 * handler + the target category and clears `card` when done.
 */
export function NfcReceiveCeremony({ card, onCommit, onDismiss }: { card: LibraryCard; onCommit: (card: LibraryCard, category: CardCategory) => void; onDismiss: () => void }) {
  const { width, height } = useLayout();
  const { collapse, category } = useCarousel();
  const reduced = useReducedMotion();
  // A received card lands in the category being viewed — unless that's a locked/special deck it can't
  // live in (Beastform / Martial Form / the Favorites mirror), where it falls back to inventory.
  const target: CardCategory = category === 'wildshape' || category === 'martialform' || category === 'favorites' ? 'inventory' : category;
  const [accepted, setAccepted] = useState(false);
  const panel = useSharedValue(0); // 0 → 1 confirmation panel in
  const drop = useSharedValue(0); //  0 → 1 card descend → present → tuck

  // Card geometry in SCREEN space: falls from above, presents at center, tucks toward the hand (lower third).
  const cardW = Math.min(220, width * 0.6);
  const cardH = Math.round(cardW * (322 / 230));
  const cardLeft = width / 2 - cardW / 2;
  const cardScale = cardW / FORGED_W; // scale the 230×322 forged plane down rather than cropping it
  const aboveY = -cardH - 90; // fully clear of the top edge, so the entry is never a pop
  const presentY = height * 0.4 - cardH / 2;
  const tuckY = height * 0.72 - cardH / 2;
  const presentCx = width / 2;
  const presentCy = height * 0.4;

  const catalog = card.catalogId ? cardById(card.catalogId) : undefined;

  // Panel fades in + the carousel eases to compact the moment the card arrives.
  useEffect(() => {
    collapse();
    panel.value = reduced ? 1 : withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
    playSfx('transitionIconFilled');
  }, [collapse, panel, reduced]);

  const accept = () => {
    if (accepted) return;
    playSfx('cardEnable');
    // Reduced motion: skip the drop ceremony — just commit and dismiss.
    if (reduced) {
      onCommit(card, target);
      onDismiss();
      return;
    }
    setAccepted(true);
    panel.value = withTiming(0, { duration: 160, easing: Easing.in(Easing.cubic) });
    drop.value = withSequence(
      // ease-IN-out: the card starts at rest above the screen, gathers pace, and settles at center.
      withTiming(0.68, { duration: DESCEND_MS, easing: Easing.inOut(Easing.cubic) }),
      withTiming(1, { duration: TUCK_MS, easing: Easing.in(Easing.cubic) }), // tuck into the hand
    );
    setTimeout(() => focusHaptic(), LAND_AT); // the card touching down
    // Commit UNDER the descending card (as the tuck begins) so the carousel change is never a bare frame.
    setTimeout(() => onCommit(card, target), COMMIT_AT);
    setTimeout(() => onDismiss(), DESCEND_MS + TUCK_MS + 40);
  };

  const decline = () => {
    panel.value = withTiming(0, { duration: 160, easing: Easing.in(Easing.cubic) });
    setTimeout(() => onDismiss(), 170);
  };

  const dimStyle = useAnimatedStyle(() => ({ opacity: interpolate(panel.value, [0, 1], [0, 0.88]) * (accepted ? interpolate(drop.value, [0, 0.85, 1], [1, 1, 0]) : 1) }));
  const panelStyle = useAnimatedStyle(() => ({ opacity: panel.value, transform: [{ translateY: interpolate(panel.value, [0, 1], [14, 0]) }] }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: interpolate(drop.value, [0, 0.06, 0.86, 1], [0, 1, 1, 0], 'clamp'),
    transform: [
      { translateY: interpolate(drop.value, [0, 0.45, 0.68, 1], [aboveY, presentY, presentY, tuckY], 'clamp') },
      { scale: interpolate(drop.value, [0, 0.45, 0.68, 1], [0.82, 1, 1, 0.4], 'clamp') },
    ],
  }));

  // v0.24.1: declare it so the tablet margins darken with the screen (lib/screen-dim).
  useScreenDim(0.88);
  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 9600 }} pointerEvents={accepted ? 'none' : 'auto'}>
      <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: '#06080D' }, dimStyle]} pointerEvents="none" />

      {/* Confirmation panel (hidden once accepted). */}
      {!accepted ? (
        <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }, panelStyle]}>
          <ChamferBox chamfer={16} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} style={{ width: '100%', maxWidth: 340, paddingHorizontal: 22, paddingVertical: 22, gap: 14, alignItems: 'center' }}>
            {/* v0.14.0: NAME ONLY. The old rendered preview was a fixed 230×322 card crammed into a
                116px slot with no clipping, so three quarters of it bled straight out of the panel.
                The card itself is the reveal — this step just says what's arriving. */}
            <Text style={{ color: Rune.goldText, fontSize: 12, fontFamily: Body.bold, letterSpacing: 2, textTransform: 'uppercase' }}>A card was shared with you</Text>
            <Text numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.6} style={{ color: Rune.ivory, fontSize: 22, lineHeight: 26, fontFamily: Display.black, letterSpacing: 0.4, textTransform: 'uppercase', textAlign: 'center' }}>{card.title || 'Card'}</Text>
            <Text style={{ color: Rune.muted, fontSize: 10.5, fontFamily: Body.bold, letterSpacing: 1.4, textTransform: 'uppercase' }}>{catalog?.label ?? libraryCardKindLabel(card)}</Text>
            <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch' }}>
              <RuneButton label="Decline" kind="ghost" height={46} style={{ flex: 1 }} onPress={decline} />
              <RuneButton label="Accept" kind="primary" height={46} style={{ flex: 1 }} muteSfx onPress={accept} />
            </View>
          </ChamferBox>
        </Animated.View>
      ) : null}

      {/* The descending card + sparkle (only after accept). */}
      {accepted ? (
        <>
          {SPARKS.map((s, i) => (
            <Spark key={i} drop={drop} cx={presentCx} cy={presentCy} s={s} />
          ))}
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: cardLeft, top: 0, width: cardW, height: cardH }, cardStyle]}>
            <ChamferBox chamfer={12} fill={Rune.panel} stroke={Rune.goldBright} strokeWidth={1.6} style={{ width: cardW, height: cardH, overflow: 'hidden' }}>
              {catalog ? (
                <ArtImage source={catalog.source} fit="contain" />
              ) : (
                // SCALE the forged plane down (the gallery idiom) — it used to be cropped, losing ~5px
                // off each side and the footer watermark. LibraryForgedCard keeps weapon/armor decoration.
                <View style={{ position: 'absolute', left: (cardW - FORGED_W) / 2, top: (cardH - FORGED_H) / 2, width: FORGED_W, height: FORGED_H, transform: [{ scale: cardScale }] }}>
                  <LibraryForgedCard card={card} />
                </View>
              )}
            </ChamferBox>
          </Animated.View>
        </>
      ) : null}
    </View>
  );
}
