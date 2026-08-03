import * as ImagePicker from 'expo-image-picker';

import { ownImage } from '@/lib/owned-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, type NativeSyntheticEvent, Platform, Pressable, ScrollView, Text, TextInput, type TextInputKeyPressEventData, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { type CardDraft, CharCount, randomCardColor, TEXT_MAX, TITLE_MAX, TypePicker } from '@/components/card-editor';
import { isExperienceType } from '@/features/character-sheet/card-types';
import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, Rune } from '@/constants/theme';
import { ART_H, FORGED_H, FORGED_W, ForgedCard } from '@/features/create/components/forged-card';
import { DimScreen } from '@/lib/screen-dim';
import { playSfx } from '@/lib/sfx';
import { scrollFieldIntoView } from '@/lib/web-keyboard';

// v0.25.0: shorter, because the waterline no longer starts filling the instant you touch down, so
// the hold has to complete sooner to still feel brief.
const HOLD_MS = 460;
/** How long a press must last before it LOOKS like a hold. Under this it is a tap, and a tap must not
 *  flash the picker's waterline: the tap does something else entirely (it rerolls the colour). */
const HOLD_GRACE_MS = 150;

/**
 * QUICK CARD (v0.24.3) — the sheet's Add Card badge opens this, not the full editor.
 *
 * The full editor is the right tool for a card you are designing: it carries a type picker, a
 * structured effects builder, a catalog browser and two art buttons. At the table, mid-scene, all of
 * that is in the way of "the GM just gave me a rope". So this mode strips it to the two things every
 * card needs, a name and what it does, and makes the keyboard drive the whole flow: Enter goes to the
 * next thing, every time, until the card is done.
 *
 * The art is a gesture instead of two buttons. It opens on a random color, a TAP rerolls it, and a
 * HOLD (the app's usual charge-and-fill) opens the image picker. Nothing about the card's art needs a
 * label, because the card itself is the preview.
 *
 * Anything more than that, effects, a card type, a catalog card, is one tap away in Advanced. The
 * draft carries over, so choosing it is never a restart.
 */
export function QuickCardFlow({
  initial,
  onSave,
  onCancel,
  onAdvanced,
  onImport,
  typeGroups,
  kindLabel = 'Card',
}: {
  initial?: CardDraft;
  /** What this flow is making, for the heading and the card's own plaque. Character creation reuses
   *  it for Experiences (v0.26.0), and calling one of those a "card" would be quietly wrong. */
  kindLabel?: string;
  onSave: (draft: CardDraft) => void;
  onCancel: () => void;
  /** Hand the draft to the full editor. */
  onAdvanced: (draft: CardDraft) => void;
  /** v0.30.0: bring cards in from a `.rune` file instead of authoring one. Absent = not offered. */
  onImport?: () => void;
  /** v0.31.0: the types the plaque may be set to. Absent = the plaque is not a control (Experiences). */
  typeGroups?: { label: string; types: string[] }[];
}) {
  const [draft, setDraft] = useState<CardDraft>(() => initial ?? { title: '', text: '', imageUri: null, color: randomCardColor(), effects: [] });
  const [step, setStep] = useState<'edit' | 'confirm'>('edit');
  const [pickType, setPickType] = useState(false);
  const titleRef = useRef<TextInput>(null);
  const textRef = useRef<TextInput>(null);
  const reduced = useReducedMotion();

  /**
   * v0.27.0: an Experience is a PHRASE, and nothing else.
   *
   * "Sailor for a decade", "Never tell me the odds". The rulebook gives them no description, so
   * asking for one invited players to invent prose the game has no use for, and the card then printed
   * it. The advanced editor already knew this; the quick flow did not, so the same Experience got a
   * body depending on which door it came through. Both now read the type, and the type is re-read as
   * the player changes it, so switching an in-progress card to Experience takes its description away.
   *
   * A description already stored on one is IGNORED rather than deleted: an older card keeps working
   * and simply stops showing it.
   */
  const expMode = isExperienceType(draft.typeLabel ?? kindLabel);
  const plaqueLabel = draft.typeLabel ?? kindLabel;
  /** v0.31.0: the plaque is a control here too, not only in the full editor. */
  const typeable = !!typeGroups?.length;

  // A card is worth keeping if it has a name OR a body (#318's rule, unchanged). An Experience has
  // only its phrase, so the phrase is the whole requirement.
  const canSave = expMode ? draft.title.trim().length > 0 : draft.title.trim().length > 0 || draft.text.trim().length > 0;

  const rollColor = useCallback(() => {
    playSfx('tokenCopyColor');
    setDraft((d) => ({ ...d, color: randomCardColor(), imageUri: null }));
  }, []);

  const pickImage = useCallback(async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    // v0.26.0: own it before storing the path — the picker's URI points into a cache an update clears.
    if (!res.canceled && res.assets[0]) { const uri = await ownImage(res.assets[0].uri); setDraft((d) => ({ ...d, imageUri: uri, color: null })); }
  }, []);

  // Enter on the title goes to the body; Enter on the body goes to the confirmation. `submitBehavior`
  // is what makes that true on the multiline body, where Enter would otherwise type a newline.
  const toBody = useCallback(() => textRef.current?.focus(), []);
  const toConfirm = useCallback(() => {
    if (!canSave) return;
    Keyboard.dismiss();
    playSfx('panelOpen');
    setStep('confirm');
    // v0.27.3: put the page back before showing the card. Focusing a field centres it with
    // scrollIntoView, which scrolls the document as well as this list; the fields are gone by now, so
    // without this the preview you are being asked to accept sits above the top of the window.
    if (Platform.OS === 'web') requestAnimationFrame(() => window.scrollTo({ top: 0 }));
  }, [canSave]);
  const toConfirmRef = useRef(toConfirm);
  toConfirmRef.current = toConfirm;
  const expModeRef = useRef(expMode);
  expModeRef.current = expMode;
  // react-native-web ignores `submitBehavior`, so on web Enter in the body typed a newline and the
  // flow stopped dead at the one step that matters most. Catch the key instead. Shift+Enter still
  // makes a new line, which is the web convention and the only way to get a second paragraph here.
  /** Enter on the TITLE goes to the description. `onSubmitEditing` is not dependable in a browser,
   *  which is why the flow stalled on "Name it" no matter how many times Enter was pressed. */
  const webEnterTitle =
    Platform.OS === 'web'
      ? {
          onKeyPress: (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
            const ev = e as unknown as { nativeEvent: { key: string; shiftKey?: boolean }; preventDefault?: () => void };
            if (ev.nativeEvent.key !== 'Enter' || ev.nativeEvent.shiftKey) return;
            ev.preventDefault?.();
            // No description to move to when the card is an Experience: Enter finishes it.
            if (expModeRef.current) toConfirmRef.current();
            else toBody();
          },
        }
      : {};

  const webEnter =
    Platform.OS === 'web'
      ? {
          onKeyPress: (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
            const ev = e as unknown as { nativeEvent: { key: string; shiftKey?: boolean }; preventDefault?: () => void };
            if (ev.nativeEvent.key !== 'Enter' || ev.nativeEvent.shiftKey) return;
            ev.preventDefault?.();
            toConfirmRef.current();
          },
        }
      : {};

  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 10000 }}>
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(8,10,15,0.985)' }} />
      <DimScreen opacity={0.985} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ alignItems: 'center', paddingTop: 34, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Text style={{ color: Rune.goldText, fontSize: 15, fontFamily: Display.black, letterSpacing: 1.2, textTransform: 'uppercase' }}>
          {step === 'confirm' ? 'Ready?' : `Quick ${kindLabel.toLowerCase()}`}
        </Text>
        <Text style={{ color: Rune.muted, fontSize: 10.5, fontFamily: Body.medium, letterSpacing: 0.5, marginTop: 4, marginBottom: 12, textAlign: 'center' }}>
          {step === 'confirm'
            ? 'This is the card you are making.'
            : typeable
              ? 'Tap the art for a new color, hold it for a picture. Tap the type to change it.'
              : 'Tap the art for a new color, hold it for a picture.'}
        </Text>

        <ArtGesture onTap={rollColor} onHold={pickImage} reduced={reduced}>
          <ForgedCard
            title={draft.title.trim()}
            kindLabel={plaqueLabel}
            body={expMode ? '' : draft.text}
            accentDeep={Rune.panel}
            imageUri={draft.imageUri}
            colorArt={draft.color}
            multilineTitle
          />
          {/* The type plaque, as its own control (v0.31.0). It sits on the seam BELOW the art
              gesture's band, so tapping the type can never also reroll the color, and the two
              targets never race for the same touch. Same band the full editor uses. */}
          {typeable ? (
            <Pressable
              // v0.32.1: put the keyboard away first. The picker is a full-screen list, and leaving
              // the title field focused under it meant returning to a half-covered card with a
              // keyboard nobody asked to keep.
              onPress={() => { playSfx('buttonTap'); Keyboard.dismiss(); setPickType(true); }}
              accessibilityRole="button"
              accessibilityLabel={`Card type: ${plaqueLabel}. Tap to change`}
              style={{ position: 'absolute', left: 0, right: 0, top: PLAQUE_TOP, height: PLAQUE_H }}
            />
          ) : null}
        </ArtGesture>

        {step === 'edit' ? (
          <View style={{ width: 320, marginTop: 16, gap: 9 }}>
            <ChamferBox chamfer={8} fill="rgba(14,17,22,0.96)" stroke="rgba(218,162,73,0.5)" strokeWidth={1.2} style={{ height: 46, justifyContent: 'center', paddingHorizontal: 13 }}>
              <TextInput
                ref={titleRef}
                value={draft.title}
                onChangeText={(title) => setDraft((d) => ({ ...d, title }))}
                placeholder={expMode ? 'Say it in a phrase' : 'Name it'}
                placeholderTextColor={Rune.muted}
                selectionColor={Rune.goldBright}
                autoFocus
                returnKeyType={expMode ? 'done' : 'next'}
                submitBehavior="submit"
                onSubmitEditing={expMode ? toConfirm : toBody}
                onFocus={scrollFieldIntoView}
                {...webEnterTitle}
                maxLength={TITLE_MAX}
                style={{ color: Rune.sheet, fontSize: 15, fontFamily: Body.semibold, padding: 0 }}
                accessibilityLabel="Card title"
              />
              <CharCount value={draft.title} max={TITLE_MAX} />
            </ChamferBox>
            {expMode ? null : (
            <ChamferBox chamfer={8} fill="rgba(14,17,22,0.96)" stroke="rgba(218,162,73,0.5)" strokeWidth={1.2} style={{ height: 92, paddingHorizontal: 13, paddingVertical: 9 }}>
              <TextInput
                ref={textRef}
                value={draft.text}
                onChangeText={(text) => setDraft((d) => ({ ...d, text }))}
                placeholder="What it does. Enter when you are done."
                placeholderTextColor={Rune.muted}
                selectionColor={Rune.goldBright}
                multiline
                returnKeyType="done"
                submitBehavior="submit"
                onSubmitEditing={toConfirm}
                onFocus={scrollFieldIntoView}
                {...webEnter}
                maxLength={TEXT_MAX}
                style={{ color: Rune.sheet, fontSize: 13, lineHeight: 18, fontFamily: Body.regular, padding: 0, flex: 1, textAlignVertical: 'top' }}
                accessibilityLabel="Card text"
              />
              <CharCount value={draft.text} max={TEXT_MAX} />
            </ChamferBox>
            )}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <RuneButton label="Cancel" kind="ghost" height={42} style={{ flex: 1 }} onPress={onCancel} />
              <RuneButton label="Next" kind="primary" height={42} style={{ flex: 1.4 }} disabled={!canSave} onPress={toConfirm} />
            </View>
            <RuneButton label="Advanced options" kind="ghost" dense height={34} onPress={() => onAdvanced(draft)} />
            {/* v0.30.0: the other way to get a card, for one somebody already made. Takes a single
                card or a whole stack, from anywhere in the app that exports. */}
            {onImport ? <RuneButton label="Import from a file" kind="ghost" dense height={34} onPress={onImport} /> : null}
          </View>
        ) : (
          <View style={{ width: 320, marginTop: 18, gap: 9 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <RuneButton label="Keep editing" kind="ghost" height={44} style={{ flex: 1 }} onPress={() => { playSfx('panelClose'); setStep('edit'); }} />
              <RuneButton
                label={`Create ${kindLabel.toLowerCase()}`}
                kind="primary"
                height={44}
                style={{ flex: 1.3 }}
                // v0.25.0: quick cards are type "Card". Leaving typeLabel unset let the destination
                // decide, so a card sent to the Arsenal came out labelled "Ability", which is a
                // choice the player never made. Changing the type is what Advanced is for.
                onPress={() => onSave({ ...draft, title: draft.title.trim(), typeLabel: draft.typeLabel ?? kindLabel })}
              />
            </View>
          </View>
        )}
      </ScrollView>
      {pickType && typeGroups ? (
        <TypePicker
          groups={typeGroups}
          current={plaqueLabel}
          onPick={(t) => { setDraft((d) => ({ ...d, typeLabel: t })); setPickType(false); }}
          onClose={() => setPickType(false)}
        />
      ) : null}
    </View>
  );
}

/** The type plaque's hit band, matching the seam the divider is drawn on. Same numbers as the full
 *  editor's chip, so the control is in the same place whichever door the card came through. */
const PLAQUE_TOP = Math.round(FORGED_H * 0.4) - 16;
const PLAQUE_H = 32;

/**
 * The card's ART ZONE as one control: tap rerolls the color, hold charges a gold waterline over the
 * art and opens the picker.
 *
 * v0.31.0: the live band now STOPS at the type plaque, instead of covering the whole card. It has to,
 * because the plaque became a control of its own, and a tap that both changed the type and rerolled
 * the art would be one of them too many. Everything below the seam is inert, which is what the card
 * always looked like anyway.
 */
function ArtGesture({ onTap, onHold, reduced, children }: { onTap: () => void; onHold: () => void; reduced: boolean; children: React.ReactNode }) {
  const charge = useSharedValue(0);
  const fire = useCallback(() => { playSfx('placeToken'); void onHold(); }, [onHold]);

  const gesture = useMemo(
    () =>
      Gesture.Exclusive(
        Gesture.LongPress()
          .minDuration(reduced ? 1 : HOLD_MS)
          .maxDistance(30)
          .onBegin(() => {
            // Delayed, not immediate: a tap releases inside the grace window and the waterline never
            // appears at all, so tapping for a new colour stops looking like a half-finished hold.
            if (!reduced) charge.value = withDelay(HOLD_GRACE_MS, withTiming(1, { duration: HOLD_MS - HOLD_GRACE_MS, easing: Easing.out(Easing.cubic) }));
          })
          .onStart(() => runOnJS(fire)())
          .onFinalize((_e, ok) => { if (!ok) { cancelAnimation(charge); charge.value = withTiming(0, { duration: 160 }); } }),
        Gesture.Tap().maxDistance(16).onEnd((_e, ok) => { if (ok) runOnJS(onTap)(); }),
      ),
    [charge, fire, onTap, reduced],
  );

  // Reset the fill after the picker takes over, so returning to a card never shows a stuck waterline.
  useEffect(() => () => { charge.value = 0; }, [charge]);

  const fillStyle = useAnimatedStyle(() => ({ height: charge.value * ART_H, opacity: charge.value > 0.02 ? 0.42 : 0 }));
  const edgeStyle = useAnimatedStyle(() => ({ opacity: charge.value > 0.02 ? 1 : 0, transform: [{ translateY: -charge.value * ART_H }] }));

  return (
    <View style={{ width: FORGED_W, height: FORGED_H }}>
      {children}
      <GestureDetector gesture={gesture}>
        <View
          style={{ position: 'absolute', left: 0, right: 0, top: 0, height: PLAQUE_TOP }}
          accessibilityRole="button"
          accessibilityLabel="Card art"
          accessibilityHint="Tap for a new color, hold to choose a picture"
        />
      </GestureDetector>
      {/* The charge rides the art band only, bottom-up, like every other hold in the app. */}
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: ART_H, overflow: 'hidden' }} pointerEvents="none">
        <Animated.View style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: Rune.goldBright }, fillStyle]} />
        <Animated.View style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2.5, backgroundColor: Rune.goldBright }, edgeStyle]} />
      </View>
    </View>
  );
}
