import * as ImagePicker from 'expo-image-picker';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { Keyboard, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, Rune } from '@/constants/theme';
import { FORGED_H, ForgedCard } from '@/features/create/forged-card';
import { type CardEffect, type EffectTarget, EFFECT_TARGETS, TARGET_LABEL } from '@/lib/modifiers';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface CardDraft {
  title: string;
  text: string;
  imageUri: string | null;
  /** A flat random fill color for the art (#153) — used when there's no uploaded image. */
  color: string | null;
  /** Structured stat effects the card applies when enabled (#175). */
  effects: CardEffect[];
  /** The player-chosen card type shown on the plaque (#214), cycled by tapping the card's chip. */
  typeLabel?: string;
}

/** Target groups for the effect picker list (#191) — pick from a labelled list, not a blind cycle. */
const TARGET_GROUPS: { label: string; targets: EffectTarget[] }[] = [
  { label: 'Resources', targets: ['maxHp', 'stressMax', 'hopeMax', 'armorScore'] },
  { label: 'Defense', targets: ['evasion', 'majorThreshold', 'severeThreshold', 'proficiency'] },
  { label: 'Traits', targets: ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'] },
];
// keep the list honest if the engine adds a target
const LISTED = new Set(TARGET_GROUPS.flatMap((g) => g.targets));
const EXTRA = EFFECT_TARGETS.filter((t) => !LISTED.has(t));
const TARGET_GROUPS_FULL = EXTRA.length ? [...TARGET_GROUPS, { label: 'Other', targets: EXTRA }] : TARGET_GROUPS;

/** Full-screen list to pick an effect target (#191). Sits above the card editor. */
function TargetPicker({ current, onPick, onClose }: { current: EffectTarget; onPick: (t: EffectTarget) => void; onClose: () => void }) {
  return (
    <View style={{ position: 'absolute', top: -80, bottom: -80, left: -60, right: -60, zIndex: 10001, alignItems: 'center', justifyContent: 'center' }}>
      <Pressable style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(6,8,13,0.9)' }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <ChamferBox chamfer={14} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} style={{ width: 300, maxHeight: '78%', paddingHorizontal: 16, paddingVertical: 16 }}>
        <Text style={{ color: Rune.goldText, fontSize: 18, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Pick a stat</Text>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
          {TARGET_GROUPS_FULL.map((g) => (
            <View key={g.label} style={{ gap: 5 }}>
              <Text style={{ color: Rune.bronze, fontSize: 10.5, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>{g.label}</Text>
              {g.targets.map((t) => {
                const on = t === current;
                return (
                  <Pressable key={t} onPress={() => onPick(t)} accessibilityRole="button" accessibilityState={{ selected: on }}>
                    <View style={{ height: 40, justifyContent: 'center', paddingHorizontal: 13, borderRadius: 5, backgroundColor: on ? Rune.red : 'rgba(20,24,31,0.7)', borderWidth: 1, borderColor: on ? 'transparent' : 'rgba(218,162,73,0.4)' }}>
                      <Text style={{ color: on ? Rune.ivory : Rune.sheet, fontSize: 13.5, fontFamily: Body.bold }}>{TARGET_LABEL[t]}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>
      </ChamferBox>
    </View>
  );
}

/**
 * Effects authoring (#175/#191): add as many stat effects as you need to a custom card. Each effect
 * is a target (picked from a list) and a signed amount (stepper). The engine still clamps to the game
 * caps when the card is enabled, so e.g. "+9 Max HP" simply tops out at 12.
 */
function EffectsField({ effects, onChange }: { effects: CardEffect[]; onChange: (e: CardEffect[]) => void }) {
  const [picking, setPicking] = useState<number | null>(null);
  const setAt = (i: number, patch: Partial<CardEffect>) => onChange(effects.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const bump = (i: number, d: number) => setAt(i, { delta: Math.max(-9, Math.min(12, (effects[i].delta ?? 0) + d)) });
  return (
    <View style={{ gap: 7, marginTop: 2 }}>
      <Text style={{ color: Rune.bronze, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>Effects when enabled</Text>
      {effects.length === 0 ? (
        <Text style={{ color: Rune.muted, fontSize: 11.5, fontFamily: Body.regular }}>None. Add one for a buff or penalty (e.g. +3 Max HP, −1 Evasion).</Text>
      ) : null}
      {effects.map((e, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <Pressable onPress={() => setPicking(i)} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={`Effect target ${TARGET_LABEL[e.target]}, tap to choose`}>
            <View style={{ height: 38, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 5, backgroundColor: 'rgba(20,24,31,0.7)', borderWidth: 1, borderColor: 'rgba(218,162,73,0.4)' }}>
              <Text numberOfLines={1} style={{ color: Rune.sheet, fontSize: 12.5, fontFamily: Body.bold }}>{TARGET_LABEL[e.target]}</Text>
            </View>
          </Pressable>
          <Pressable onPress={() => bump(i, -1)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Decrease">
            <View style={{ width: 34, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 5, backgroundColor: 'rgba(20,24,31,0.7)', borderWidth: 1, borderColor: 'rgba(218,162,73,0.4)' }}>
              <Text style={{ color: Rune.sheet, fontSize: 19, fontFamily: Display.bold }}>−</Text>
            </View>
          </Pressable>
          <Text style={{ color: Rune.goldBright, fontSize: 17, fontFamily: Display.black, width: 38, textAlign: 'center' }}>{(e.delta ?? 0) >= 0 ? `+${e.delta ?? 0}` : `${e.delta}`}</Text>
          <Pressable onPress={() => bump(i, 1)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Increase">
            <View style={{ width: 34, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 5, backgroundColor: 'rgba(20,24,31,0.7)', borderWidth: 1, borderColor: 'rgba(218,162,73,0.4)' }}>
              <Text style={{ color: Rune.sheet, fontSize: 19, fontFamily: Display.bold }}>+</Text>
            </View>
          </Pressable>
          <Pressable onPress={() => onChange(effects.filter((_, j) => j !== i))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove effect" style={{ padding: 3 }}>
            <Text style={{ color: '#E2705A', fontSize: 16, fontFamily: Body.bold }}>✕</Text>
          </Pressable>
        </View>
      ))}
      <RuneButton label="+ Add effect" kind="secondary" dense height={36} onPress={() => onChange([...effects, { target: 'maxHp', delta: 1 }])} />
      {picking != null && effects[picking] ? (
        <TargetPicker current={effects[picking].target} onPick={(t) => { setAt(picking, { target: t }); setPicking(null); }} onClose={() => setPicking(null)} />
      ) : null}
    </View>
  );
}

/** A pleasant-but-random flat color (controlled S/L so it never looks garish). */
export function randomCardColor(): string {
  const h = Math.floor(Math.random() * 360);
  const s = 42 + Math.floor(Math.random() * 28); // 42-70%
  const l = 30 + Math.floor(Math.random() * 22); // 30-52%
  return `hsl(${h}, ${s}%, ${l}%)`;
}

/**
 * The CARD EDITOR (#107) — the one dialog for authoring a custom card anywhere in the app
 * (creation experiences today; sheet-side card authoring later — import it, pass kindLabel and
 * onSave). Dims everything beneath; live preview in the exact forged-card format (same size,
 * same plaque, same footer as every other RuneKeep card); image, title, body are the player's.
 */
export function CardEditor({
  kindLabel,
  initial,
  onSave,
  onCancel,
  saveLabel = 'Save card',
  extraField,
  experienceMode = false,
  modifier,
  typeOptions,
}: {
  kindLabel: string;
  initial?: CardDraft;
  onSave: (draft: CardDraft) => void;
  onCancel: () => void;
  saveLabel?: string;
  /** Optional extra control rendered in the fields column (#164: the inventory/arsenal target picker). */
  extraField?: ReactNode;
  /** Experience mode (#202): a long-title phrase, no description/effects; preview shows the bonus. */
  experienceMode?: boolean;
  /** The experience bonus shown on the preview card (experience mode). */
  modifier?: number;
  /** Type options (#214): tapping the card's plaque chip cycles these (e.g. Note/Reminder/Story).
   *  The first is the default. Absent → the plaque shows the static `kindLabel` (not tappable). */
  typeOptions?: string[];
}) {
  // New cards open with a random color already set, as if Random Color was pressed (#153). The type
  // chip defaults to the first option (#214).
  const [draft, setDraft] = useState<CardDraft>(() => initial ?? { title: '', text: '', imageUri: null, color: randomCardColor(), effects: [], typeLabel: typeOptions?.[0] });
  // The plaque label: the cycled type when a type list is supplied, else the caller's static label.
  const plaqueLabel = typeOptions?.length ? draft.typeLabel ?? typeOptions[0] : kindLabel;
  const cycleType = useCallback(() => {
    if (!typeOptions?.length) return;
    setDraft((d) => {
      const cur = d.typeLabel ?? typeOptions[0];
      const i = typeOptions.indexOf(cur);
      return { ...d, typeLabel: typeOptions[(i + 1) % typeOptions.length] };
    });
  }, [typeOptions]);

  // Adding an image clears the random color; Random Color clears any uploaded image.
  const pickImage = useCallback(async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 }); // no forced crop (#155)
    if (!res.canceled && res.assets[0]) setDraft((d) => ({ ...d, imageUri: res.assets[0].uri, color: null }));
  }, []);
  const rollColor = useCallback(() => setDraft((d) => ({ ...d, color: randomCardColor(), imageUri: null })), []);

  const canSave = draft.title.trim().length > 0;

  // Entrance (#201): the scrim fades in and the card + fields rise/fade in instead of popping.
  const reduced = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = reduced ? 1 : withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
  }, [p, reduced]);
  const scrimStyle = useAnimatedStyle(() => ({ opacity: p.value }));
  const contentStyle = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * 20 }] }));

  // Keyboard-aware compaction (#227): while typing, the card + fields + buttons must fit in the top
  // ~55% (the keyboard takes ~45%, #227 item 2). The top gap collapses so the card rides up to ~10px
  // below the UI border (item 1) — never off-screen. The card scale is COMPUTED from the space left
  // after the fields, so on short screens it shrinks just enough; if that would leave it < 50px tall,
  // it FADES OUT instead and fades back when typing ends (item 1).
  const { height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const padFull = insets.top + 64; // resting top gap (keyboard closed)
  const padCompact = insets.top + 12; // typing: card top ~10px below the border
  // Height the fields column + buttons occupy below the card (approx; experiences have no body/effects).
  const fieldsH = experienceMode ? 196 : 340;
  const cardRoom = screenH * 0.55 - padCompact - fieldsH; // vertical space left for the card while typing
  const fadeCard = cardRoom < 50; // too small to be worth showing → fade out instead of shrinking
  const targetScale = fadeCard ? 0.2 : Math.max(0.32, Math.min(1, cardRoom / FORGED_H));

  const kb = useSharedValue(0);
  const KB = { duration: 240, easing: Easing.out(Easing.cubic) };
  const onFieldFocus = useCallback(() => {
    if (!reduced) kb.value = withTiming(1, KB);
  }, [kb, reduced]);
  // Drive compaction off the keyboard itself (item 1): re-tapping an already-focused field re-opens
  // the keyboard (no onFocus fires) but DOES fire keyboardDidShow — so the UI re-compacts; hiding it
  // (Back / dismiss) animates back even though the field keeps its cursor.
  useEffect(() => {
    if (reduced) return;
    const show = Keyboard.addListener('keyboardDidShow', () => { kb.value = withTiming(1, KB); });
    const hide = Keyboard.addListener('keyboardDidHide', () => { kb.value = withTiming(0, KB); });
    return () => { show.remove(); hide.remove(); };
  }, [kb, reduced]);
  const topSpacer = useAnimatedStyle(() => ({ height: padFull + (padCompact - padFull) * kb.value }));
  const previewStyle = useAnimatedStyle(() => {
    const scale = 1 + (targetScale - 1) * kb.value; // 1 (resting) -> targetScale (typing)
    return {
      transform: [{ scale }],
      marginBottom: -FORGED_H * (1 - scale), // negative margin reclaims the freed space, pulling fields up
      opacity: fadeCard ? 1 - kb.value : 1, // fade the card out when there isn't room for it
    };
  });

  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 10000 }}>
      <AnimatedPressable style={[{ position: 'absolute', top: -120, bottom: -120, left: -60, right: -60, backgroundColor: 'rgba(6,8,13,0.92)' }, scrimStyle]} onPress={onCancel} accessibilityRole="button" accessibilityLabel="Discard and close" />
      <Animated.ScrollView style={contentStyle} contentContainerStyle={{ alignItems: 'center', paddingBottom: 140 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* top gap: collapses while typing so the card + fields ride up to just below the border (#227) */}
        <Animated.View style={topSpacer} />
        {/* live preview — scales down from its TOP while a field is focused, the negative margin pulling
            the fields up so they sit above the keyboard */}
        <Animated.View style={[{ transformOrigin: 'top center' }, previewStyle]}>
          {experienceMode ? (
            <ForgedCard title={draft.title.trim() || 'Untitled'} kindLabel="Experience" body="" accentDeep={Rune.panel} imageUri={draft.imageUri} colorArt={draft.color} experience modifier={modifier ?? 2} />
          ) : (
            <ForgedCard title={draft.title.trim() || 'Untitled'} kindLabel={plaqueLabel} body={draft.text} accentDeep={Rune.panel} imageUri={draft.imageUri} colorArt={draft.color} multilineTitle />
          )}
          {/* Tappable TYPE CHIP (#214): the plaque IS the card's type — tap it to cycle the label. A
              transparent hit-band over the divider seam (~40% down), so the player taps the chip on
              the card itself. Only when type options are supplied (New Card), not experiences. */}
          {typeOptions?.length && !experienceMode ? (
            <Pressable
              onPress={cycleType}
              accessibilityRole="button"
              accessibilityLabel={`Card type: ${plaqueLabel}. Tap to change`}
              style={{ position: 'absolute', left: 0, right: 0, top: Math.round(FORGED_H * 0.4) - 16, height: 32 }}
            />
          ) : null}
        </Animated.View>
        {typeOptions?.length && !experienceMode ? (
          <Text style={{ marginTop: 8, color: Rune.bronze, fontSize: 10.5, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' }}>Tap the card type to change it</Text>
        ) : null}
        {/* fields */}
        <View style={{ width: 320, marginTop: 16, gap: 9 }}>
          {/* half-and-half: Add Image (smaller text) | Random Color (flat random fill) (#153) */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <RuneButton label="Add Image" kind="ghost" dense height={36} style={{ flex: 1 }} onPress={pickImage} />
            <RuneButton label="Random Color" kind="ghost" dense height={36} style={{ flex: 1 }} onPress={rollColor} />
          </View>
          <ChamferBox chamfer={8} fill="rgba(14,17,22,0.96)" stroke="rgba(218,162,73,0.5)" strokeWidth={1.2} style={{ minHeight: experienceMode ? 80 : 46, justifyContent: 'center', paddingHorizontal: 13, paddingVertical: experienceMode ? 9 : 0 }}>
            <TextInput
              value={draft.title}
              onChangeText={(title) => setDraft((d) => ({ ...d, title }))}
              onFocus={onFieldFocus}
              placeholder={experienceMode ? 'The experience — a word or a whole phrase…' : 'Title'}
              placeholderTextColor={Rune.muted}
              selectionColor={Rune.goldBright}
              multiline={experienceMode}
              maxLength={experienceMode ? 160 : 70}
              style={{ color: Rune.sheet, fontSize: 15, fontFamily: Body.semibold, padding: 0, textAlignVertical: experienceMode ? 'top' : 'center' }}
              accessibilityLabel={experienceMode ? 'Experience' : 'Card title'}
            />
          </ChamferBox>
          {experienceMode ? null : (
            <ChamferBox chamfer={8} fill="rgba(14,17,22,0.96)" stroke="rgba(218,162,73,0.5)" strokeWidth={1.2} style={{ height: 92, paddingHorizontal: 13, paddingVertical: 9 }}>
              <TextInput
                value={draft.text}
                onChangeText={(text) => setDraft((d) => ({ ...d, text }))}
                onFocus={onFieldFocus}
                placeholder="Describe it — what it means, when it helps."
                placeholderTextColor={Rune.muted}
                selectionColor={Rune.goldBright}
                multiline
                maxLength={280}
                style={{ color: Rune.sheet, fontSize: 13, lineHeight: 18, fontFamily: Body.regular, padding: 0, flex: 1, textAlignVertical: 'top' }}
                accessibilityLabel="Card text"
              />
            </ChamferBox>
          )}
          {experienceMode ? null : <EffectsField effects={draft.effects} onChange={(effects) => setDraft((d) => ({ ...d, effects }))} />}
          {extraField}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <RuneButton label="Cancel" kind="ghost" height={42} style={{ flex: 1 }} onPress={onCancel} />
            <RuneButton label={saveLabel} kind="primary" height={42} style={{ flex: 1.4 }} disabled={!canSave} onPress={() => onSave({ ...draft, title: draft.title.trim() })} />
          </View>
          <Text style={{ color: Rune.muted, fontSize: 10, fontFamily: Body.medium, textAlign: 'center' }}>Same format as every RuneKeep card.</Text>
        </View>
      </Animated.ScrollView>
    </View>
  );
}
