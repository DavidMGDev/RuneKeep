/**
 * Receiving a card over NFC.
 *
 * The sheet listens continuously (`SheetNfcReceiver`) and hands whatever arrives to
 * `NfcReceiveCeremony`, which asks three questions in order: is this yours to keep, which deck does it
 * join, and then confirms it landed.
 *
 * v0.25.0 removed the animation. The card used to fall from above the screen, present itself at centre
 * and tuck away into the hand, with a sparkle field, about a second and a half of it every time. By
 * that point the player had already read the card's name and already chosen its deck, so the ceremony
 * was re-staging a decision rather than telling them anything. A checkmark naming the deck says the
 * same thing and gets out of the way.
 */
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, Rune } from '@/constants/theme';
import { cardById } from '@/data/catalog';
import { playSfx } from '@/lib/sfx';
import { cancelNfcReceive, receiveNfc } from '@/lib/nfc';
import type { LibraryCard } from '@/lib/library';
import { libraryCardKindLabel } from '@/lib/library-embed';
import { focusHaptic } from '@/lib/haptics';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

import { useScreenDim } from '@/lib/screen-dim';
import { type CardCategory } from '../card-data';
import { categoryLabel, type CustomCategory } from '../carousel-categories';
import { useCarousel } from '../carousel-context';
import { CardDestination } from './card-destination';
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
/**
 * The received-card ceremony. Reads the carousel so it can ease to compact; the sheet passes the commit
 * handler + the target category and clears `card` when done.
 */
/** How long the checkmark stays up before the overlay closes itself. Long enough to read the deck
 *  name, short enough that nobody waits for it. */
const CONFIRM_MS = 1200;

export function NfcReceiveCeremony({ card, onCommit, onDismiss, destinations = [], customCategories = [] }: { card: LibraryCard; onCommit: (card: LibraryCard, category: CardCategory) => void; onDismiss: () => void; destinations?: CardCategory[]; customCategories?: CustomCategory[] }) {
  const { collapse, category } = useCarousel();
  const reduced = useReducedMotion();
  // A received card lands in the category being viewed — unless that's a locked/special deck it can't
  // live in (Beastform / Martial Form / the Favorites mirror), where it falls back to inventory.
  const target: CardCategory = category === 'wildshape' || category === 'martialform' || category === 'favorites' ? 'inventory' : category;
  // v0.24.3: accepting ASKS which deck the card joins, same question card creation asks. It sits
  // between Accept and the drop, so the card still lands in the deck the player named.
  const [asking, setAsking] = useState(false);
  const [accepted, setAccepted] = useState(false);
  /** The deck it went to, once it has gone there. Drives the checkmark. */
  const [landed, setLanded] = useState<CardCategory | null>(null);
  const panel = useSharedValue(0); // 0 → 1 confirmation panel in

  // Card geometry in SCREEN space: falls from above, presents at center, tucks toward the hand (lower third).

  const catalog = card.catalogId ? cardById(card.catalogId) : undefined;

  // Panel fades in + the carousel eases to compact the moment the card arrives.
  useEffect(() => {
    collapse();
    panel.value = reduced ? 1 : withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
    playSfx('transitionIconFilled');
  }, [collapse, panel, reduced]);

  // Accept: ask for the destination first when there is a list to offer, otherwise keep the old
  // behaviour (the viewed category) so a caller that hasn't wired it still works.
  const accept = () => {
    if (accepted || asking) return;
    playSfx('cardEnable');
    if (destinations.length > 0) { setAsking(true); return; }
    land(target);
  };

  /**
   * v0.25.0: accept, commit, confirm. No descent.
   *
   * The card used to fall from the top of the screen, present itself and tuck into the hand, about a
   * second and a half of ceremony every single time. The player has already been told what arrived
   * and has already chosen where it goes, so the animation was repeating a decision rather than
   * reporting one. A checkmark naming the deck says the same thing and gets out of the way.
   */
  const land = (dest: CardCategory) => {
    if (accepted) return;
    setAsking(false);
    setAccepted(true);
    onCommit(card, dest);
    setLanded(dest);
    panel.value = withTiming(1, { duration: 140, easing: Easing.out(Easing.cubic) });
    playSfx('cardEnable');
    focusHaptic();
    setTimeout(() => onDismiss(), CONFIRM_MS);
  };

  const decline = () => {
    panel.value = withTiming(0, { duration: 160, easing: Easing.in(Easing.cubic) });
    setTimeout(() => onDismiss(), 170);
  };

  // The dim follows the panel now that nothing descends through it.
  const dimStyle = useAnimatedStyle(() => ({ opacity: interpolate(panel.value, [0, 1], [0, 0.88]) }));
  const panelStyle = useAnimatedStyle(() => ({ opacity: panel.value, transform: [{ translateY: interpolate(panel.value, [0, 1], [14, 0]) }] }));

  // v0.24.1: declare it so the tablet margins darken with the screen (lib/screen-dim).
  useScreenDim(0.88);
  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 9600 }} pointerEvents={accepted ? 'none' : 'auto'}>
      <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: '#06080D' }, dimStyle]} pointerEvents="none" />

      {/* Where it goes (v0.24.3): between Accept and the drop. */}
      {asking ? (
        <CardDestination
          title="Where does it go?"
          cardTitle={card.title || undefined}
          categories={destinations}
          customCategories={customCategories}
          suggested={destinations.includes(target) ? target : undefined}
          cancelLabel="Back"
          onPick={land}
          onCancel={() => setAsking(false)}
        />
      ) : null}

      {/* Confirmation panel (hidden once accepted or while asking). */}
      {!accepted && !asking ? (
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

      {/* Landed: a checkmark naming the deck, then it closes itself. */}
      {landed ? (
        <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }, panelStyle]} pointerEvents="none">
          <ChamferBox chamfer={16} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} style={{ width: '100%', maxWidth: 320, paddingHorizontal: 22, paddingVertical: 24, gap: 12, alignItems: 'center' }}>
            <Svg width={44} height={44} viewBox="0 0 44 44">
              <Circle cx={22} cy={22} r={20} fill="none" stroke={Rune.goldBright} strokeWidth={2} />
              <Path d="M13 22.5 L19.5 29 L31 15" fill="none" stroke={Rune.goldBright} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
            <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7} style={{ color: Rune.ivory, fontSize: 18, lineHeight: 22, fontFamily: Display.black, letterSpacing: 0.4, textTransform: 'uppercase', textAlign: 'center' }}>{card.title || 'Card'}</Text>
            <Text style={{ color: Rune.muted, fontSize: 11, fontFamily: Body.bold, letterSpacing: 1.4, textTransform: 'uppercase', textAlign: 'center' }}>Added to {categoryLabel(landed, customCategories)}</Text>
          </ChamferBox>
        </Animated.View>
      ) : null}
    </View>
  );
}
