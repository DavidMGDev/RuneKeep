import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, type NativeSyntheticEvent, Platform, ScrollView, Text, TextInput, type TextInputKeyPressEventData, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { type CardDraft, randomCardColor } from '@/components/card-editor';
import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, Rune } from '@/constants/theme';
import { ART_H, FORGED_H, FORGED_W, ForgedCard } from '@/features/create/components/forged-card';
import { DimScreen } from '@/lib/screen-dim';
import { playSfx } from '@/lib/sfx';

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
}: {
  initial?: CardDraft;
  onSave: (draft: CardDraft) => void;
  onCancel: () => void;
  /** Hand the draft to the full editor. */
  onAdvanced: (draft: CardDraft) => void;
}) {
  const [draft, setDraft] = useState<CardDraft>(() => initial ?? { title: '', text: '', imageUri: null, color: randomCardColor(), effects: [] });
  const [step, setStep] = useState<'edit' | 'confirm'>('edit');
  const titleRef = useRef<TextInput>(null);
  const textRef = useRef<TextInput>(null);
  const reduced = useReducedMotion();

  // A card is worth keeping if it has a name OR a body (#318's rule, unchanged).
  const canSave = draft.title.trim().length > 0 || draft.text.trim().length > 0;

  const rollColor = useCallback(() => {
    playSfx('tokenCopyColor');
    setDraft((d) => ({ ...d, color: randomCardColor(), imageUri: null }));
  }, []);

  const pickImage = useCallback(async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (!res.canceled && res.assets[0]) setDraft((d) => ({ ...d, imageUri: res.assets[0].uri, color: null }));
  }, []);

  // Enter on the title goes to the body; Enter on the body goes to the confirmation. `submitBehavior`
  // is what makes that true on the multiline body, where Enter would otherwise type a newline.
  const toBody = useCallback(() => textRef.current?.focus(), []);
  const toConfirm = useCallback(() => {
    if (!canSave) return;
    Keyboard.dismiss();
    playSfx('panelOpen');
    setStep('confirm');
  }, [canSave]);
  const toConfirmRef = useRef(toConfirm);
  toConfirmRef.current = toConfirm;
  // react-native-web ignores `submitBehavior`, so on web Enter in the body typed a newline and the
  // flow stopped dead at the one step that matters most. Catch the key instead. Shift+Enter still
  // makes a new line, which is the web convention and the only way to get a second paragraph here.
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
          {step === 'confirm' ? 'Ready?' : 'Quick card'}
        </Text>
        <Text style={{ color: Rune.muted, fontSize: 10.5, fontFamily: Body.medium, letterSpacing: 0.5, marginTop: 4, marginBottom: 12, textAlign: 'center' }}>
          {step === 'confirm' ? 'This is the card you are making.' : 'Tap the art for a new color, hold it for a picture.'}
        </Text>

        <ArtGesture onTap={rollColor} onHold={pickImage} reduced={reduced}>
          <ForgedCard
            title={draft.title.trim()}
            kindLabel={draft.typeLabel ?? 'Card'}
            body={draft.text}
            accentDeep={Rune.panel}
            imageUri={draft.imageUri}
            colorArt={draft.color}
            multilineTitle
          />
        </ArtGesture>

        {step === 'edit' ? (
          <View style={{ width: 320, marginTop: 16, gap: 9 }}>
            <ChamferBox chamfer={8} fill="rgba(14,17,22,0.96)" stroke="rgba(218,162,73,0.5)" strokeWidth={1.2} style={{ height: 46, justifyContent: 'center', paddingHorizontal: 13 }}>
              <TextInput
                ref={titleRef}
                value={draft.title}
                onChangeText={(title) => setDraft((d) => ({ ...d, title }))}
                placeholder="Name it"
                placeholderTextColor={Rune.muted}
                selectionColor={Rune.goldBright}
                autoFocus
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={toBody}
                maxLength={70}
                style={{ color: Rune.sheet, fontSize: 15, fontFamily: Body.semibold, padding: 0 }}
                accessibilityLabel="Card title"
              />
            </ChamferBox>
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
                {...webEnter}
                maxLength={280}
                style={{ color: Rune.sheet, fontSize: 13, lineHeight: 18, fontFamily: Body.regular, padding: 0, flex: 1, textAlignVertical: 'top' }}
                accessibilityLabel="Card text"
              />
            </ChamferBox>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <RuneButton label="Cancel" kind="ghost" height={42} style={{ flex: 1 }} onPress={onCancel} />
              <RuneButton label="Next" kind="primary" height={42} style={{ flex: 1.4 }} disabled={!canSave} onPress={toConfirm} />
            </View>
            <RuneButton label="Advanced options" kind="ghost" dense height={34} onPress={() => onAdvanced(draft)} />
          </View>
        ) : (
          <View style={{ width: 320, marginTop: 18, gap: 9 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <RuneButton label="Keep editing" kind="ghost" height={44} style={{ flex: 1 }} onPress={() => { playSfx('panelClose'); setStep('edit'); }} />
              <RuneButton
                label="Create card"
                kind="primary"
                height={44}
                style={{ flex: 1.3 }}
                // v0.25.0: quick cards are type "Card". Leaving typeLabel unset let the destination
                // decide, so a card sent to the Arsenal came out labelled "Ability", which is a
                // choice the player never made. Changing the type is what Advanced is for.
                onPress={() => onSave({ ...draft, title: draft.title.trim(), typeLabel: draft.typeLabel ?? 'Card' })}
              />
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

/**
 * The card's ART ZONE as one control: tap rerolls the color, hold charges a gold waterline over the
 * art and opens the picker. Only the art band is live, so the body text below stays selectable and
 * the card is still just a card.
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
    <GestureDetector gesture={gesture}>
      <View style={{ width: FORGED_W, height: FORGED_H }} accessibilityRole="button" accessibilityLabel="Card art" accessibilityHint="Tap for a new color, hold to choose a picture">
        {children}
        {/* The charge rides the art band only, bottom-up, like every other hold in the app. */}
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: ART_H, overflow: 'hidden' }} pointerEvents="none">
          <Animated.View style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: Rune.goldBright }, fillStyle]} />
          <Animated.View style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2.5, backgroundColor: Rune.goldBright }, edgeStyle]} />
        </View>
      </View>
    </GestureDetector>
  );
}
