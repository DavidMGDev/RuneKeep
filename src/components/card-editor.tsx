import * as ImagePicker from 'expo-image-picker';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, Rune } from '@/constants/theme';
import { ForgedCard } from '@/features/create/forged-card';
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
}: {
  kindLabel: string;
  initial?: CardDraft;
  onSave: (draft: CardDraft) => void;
  onCancel: () => void;
  saveLabel?: string;
  /** Optional extra control rendered in the fields column (#164: the inventory/arsenal target picker). */
  extraField?: ReactNode;
}) {
  // New cards open with a random color already set, as if Random Color was pressed (#153).
  const [draft, setDraft] = useState<CardDraft>(() => initial ?? { title: '', text: '', imageUri: null, color: randomCardColor(), effects: [] });

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

  return (
    <View style={{ position: 'absolute', top: -80, bottom: -80, left: -60, right: -60, zIndex: 10000 }}>
      <AnimatedPressable style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(6,8,13,0.92)' }, scrimStyle]} onPress={onCancel} accessibilityRole="button" accessibilityLabel="Discard and close" />
      <Animated.ScrollView style={contentStyle} contentContainerStyle={{ alignItems: 'center', paddingTop: 180, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        {/* live preview — the real card, the real size */}
        <ForgedCard title={draft.title.trim() || 'Untitled'} kindLabel={kindLabel} body={draft.text} accentDeep={Rune.panel} imageUri={draft.imageUri} colorArt={draft.color} multilineTitle />
        {/* fields */}
        <View style={{ width: 320, marginTop: 16, gap: 9 }}>
          {/* half-and-half: Add Image (smaller text) | Random Color (flat random fill) (#153) */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <RuneButton label="Add Image" kind="ghost" dense height={36} style={{ flex: 1 }} onPress={pickImage} />
            <RuneButton label="Random Color" kind="ghost" dense height={36} style={{ flex: 1 }} onPress={rollColor} />
          </View>
          <ChamferBox chamfer={8} fill="rgba(14,17,22,0.96)" stroke="rgba(218,162,73,0.5)" strokeWidth={1.2} style={{ height: 46, justifyContent: 'center', paddingHorizontal: 13 }}>
            <TextInput
              value={draft.title}
              onChangeText={(title) => setDraft((d) => ({ ...d, title }))}
              placeholder="Title"
              placeholderTextColor={Rune.muted}
              selectionColor={Rune.goldBright}
              maxLength={36}
              style={{ color: Rune.sheet, fontSize: 15, fontFamily: Body.semibold, padding: 0 }}
              accessibilityLabel="Card title"
            />
          </ChamferBox>
          <ChamferBox chamfer={8} fill="rgba(14,17,22,0.96)" stroke="rgba(218,162,73,0.5)" strokeWidth={1.2} style={{ height: 92, paddingHorizontal: 13, paddingVertical: 9 }}>
            <TextInput
              value={draft.text}
              onChangeText={(text) => setDraft((d) => ({ ...d, text }))}
              placeholder="Describe it — what it means, when it helps."
              placeholderTextColor={Rune.muted}
              selectionColor={Rune.goldBright}
              multiline
              maxLength={280}
              style={{ color: Rune.sheet, fontSize: 13, lineHeight: 18, fontFamily: Body.regular, padding: 0, flex: 1, textAlignVertical: 'top' }}
              accessibilityLabel="Card text"
            />
          </ChamferBox>
          <EffectsField effects={draft.effects} onChange={(effects) => setDraft((d) => ({ ...d, effects }))} />
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
