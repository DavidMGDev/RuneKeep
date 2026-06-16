import * as ImagePicker from 'expo-image-picker';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { Keyboard, Pressable, ScrollView, type StyleProp, Text, TextInput, useWindowDimensions, View, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, Rune } from '@/constants/theme';
import { FORGED_H, ForgedCard } from '@/features/create/forged-card';
import { type CardEffect, type EffectTarget, TARGET_LABEL } from '@/lib/modifiers';
import { playSfx } from '@/lib/sfx';

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

/** A pickable effect (#242 item 7/8): a target, plus a set/bonus MODE for the two damage thresholds. */
interface EffectOption { key: string; label: string; target: EffectTarget; mode?: 'set' | 'bonus' }
const EFFECT_GROUPS: { label: string; options: EffectOption[] }[] = [
  { label: 'Resources', options: [
    { key: 'maxHp', label: 'Max Hit Points', target: 'maxHp' },
    { key: 'stressMax', label: 'Max Stress', target: 'stressMax' },
    { key: 'hopeMax', label: 'Max Hope', target: 'hopeMax' },
    { key: 'armorScore', label: 'Armor Score', target: 'armorScore' },
  ] },
  { label: 'Damage Thresholds', options: [
    { key: 'set-major', label: 'Set Major Threshold', target: 'majorThreshold', mode: 'set' },
    { key: 'set-severe', label: 'Set Severe Threshold', target: 'severeThreshold', mode: 'set' },
    { key: 'bonus-major', label: 'Bonus Major Threshold', target: 'majorThreshold', mode: 'bonus' },
    { key: 'bonus-severe', label: 'Bonus Severe Threshold', target: 'severeThreshold', mode: 'bonus' },
  ] },
  { label: 'Defense', options: [
    { key: 'evasion', label: 'Evasion', target: 'evasion' },
    { key: 'proficiency', label: 'Proficiency', target: 'proficiency' },
  ] },
  { label: 'Traits', options: [
    { key: 'agility', label: 'Agility', target: 'agility' },
    { key: 'strength', label: 'Strength', target: 'strength' },
    { key: 'finesse', label: 'Finesse', target: 'finesse' },
    { key: 'instinct', label: 'Instinct', target: 'instinct' },
    { key: 'presence', label: 'Presence', target: 'presence' },
    { key: 'knowledge', label: 'Knowledge', target: 'knowledge' },
  ] },
];
const ALL_EFFECT_OPTIONS = EFFECT_GROUPS.flatMap((g) => g.options);
const isThresholdTarget = (t: EffectTarget) => t === 'majorThreshold' || t === 'severeThreshold';
const isSetEffect = (e: CardEffect) => isThresholdTarget(e.target) && e.mode === 'set';
function matchOption(e: CardEffect): EffectOption | undefined {
  return ALL_EFFECT_OPTIONS.find((o) => o.target === e.target && (isThresholdTarget(e.target) ? (o.mode ?? 'bonus') === (e.mode ?? 'bonus') : true));
}
function effectLabel(e: CardEffect): string {
  return matchOption(e)?.label ?? TARGET_LABEL[e.target];
}

/**
 * Full-screen modifier picker (#242 item 7/8) — rebuilt. Rendered at the EDITOR ROOT (not inside the
 * scrolling fields column, which had clipped the old popup to a half-screen dim) so it covers the
 * whole screen. Lists every modifier the engine understands, grouped, incl. set/bonus thresholds.
 */
function EffectPicker({ current, onPick, onClose }: { current?: EffectOption; onPick: (o: EffectOption) => void; onClose: () => void }) {
  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 10002, alignItems: 'center', justifyContent: 'center' }}>
      <Pressable style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(6,8,13,0.9)' }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <ChamferBox chamfer={14} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} style={{ width: 320, maxHeight: '82%', paddingHorizontal: 16, paddingVertical: 16 }}>
        <Text style={{ color: Rune.goldText, fontSize: 18, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Pick a modifier</Text>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 11, paddingBottom: 4 }}>
          {EFFECT_GROUPS.map((g) => (
            <View key={g.label} style={{ gap: 6 }}>
              <Text style={{ color: Rune.bronze, fontSize: 10.5, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>{g.label}</Text>
              {g.options.map((o) => {
                const on = current?.key === o.key;
                return (
                  <Pressable key={o.key} onPress={() => onPick(o)} accessibilityRole="button" accessibilityState={{ selected: on }}>
                    <View style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 13, paddingVertical: 8, borderRadius: 5, backgroundColor: on ? Rune.red : 'rgba(20,24,31,0.7)', borderWidth: 1, borderColor: on ? 'transparent' : 'rgba(218,162,73,0.4)' }}>
                      <Text style={{ color: on ? Rune.ivory : Rune.sheet, fontSize: 13.5, fontFamily: Body.bold }}>{o.label}</Text>
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
 * Full-screen card-TYPE picker (#246) — same shape as the modifier picker. Lists the grouped built-in
 * types plus the player's custom types; picking sets the card's middle-ribbon label.
 */
function TypePicker({ groups, current, onPick, onClose }: { groups: { label: string; types: string[] }[]; current?: string; onPick: (t: string) => void; onClose: () => void }) {
  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 10002, alignItems: 'center', justifyContent: 'center' }}>
      <Pressable style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(6,8,13,0.9)' }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <ChamferBox chamfer={14} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} style={{ width: 320, maxHeight: '82%', paddingHorizontal: 16, paddingVertical: 16 }}>
        <Text style={{ color: Rune.goldText, fontSize: 18, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Card type</Text>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 11, paddingBottom: 4 }}>
          {groups.map((g) => (
            <View key={g.label} style={{ gap: 6 }}>
              <Text style={{ color: Rune.bronze, fontSize: 10.5, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>{g.label}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                {g.types.map((t) => {
                  const on = current === t;
                  return (
                    <Pressable key={t} onPress={() => { playSfx('buttonTap'); onPick(t); }} accessibilityRole="button" accessibilityState={{ selected: on }}>
                      <View style={{ minHeight: 36, justifyContent: 'center', paddingHorizontal: 13, paddingVertical: 7, borderRadius: 5, backgroundColor: on ? Rune.red : 'rgba(20,24,31,0.7)', borderWidth: 1, borderColor: on ? 'transparent' : 'rgba(218,162,73,0.4)' }}>
                        <Text style={{ color: on ? Rune.ivory : Rune.sheet, fontSize: 13, fontFamily: Body.bold }}>{t}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      </ChamferBox>
    </View>
  );
}

/**
 * Effects authoring (#175/#191/#242): add stat effects to a custom card. Each row is a modifier
 * (tapped to open the root-level picker) and an amount (stepper). "Set" threshold effects are an
 * ABSOLUTE value (0..40); everything else is a signed delta. The engine clamps game caps on enable.
 */
function EffectsField({ effects, onChange, onRequestPick }: { effects: CardEffect[]; onChange: (e: CardEffect[]) => void; onRequestPick: (i: number) => void }) {
  const setAt = (i: number, patch: Partial<CardEffect>) => onChange(effects.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const bump = (i: number, d: number) => {
    const e = effects[i];
    const [lo, hi] = isSetEffect(e) ? [0, 40] : [-9, 12];
    setAt(i, { delta: Math.max(lo, Math.min(hi, (e.delta ?? 0) + d)) });
  };
  return (
    <View style={{ gap: 7, marginTop: 2 }}>
      <Text style={{ color: Rune.bronze, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>Effects when enabled</Text>
      {effects.length === 0 ? (
        <Text style={{ color: Rune.muted, fontSize: 11.5, fontFamily: Body.regular }}>None. Add one for a buff or penalty (e.g. +3 Max HP, −1 Evasion, Set Major Threshold 8).</Text>
      ) : null}
      {effects.map((e, i) => {
        const set = isSetEffect(e);
        const v = e.delta ?? 0;
        const amount = set ? `${v}` : v >= 0 ? `+${v}` : `${v}`;
        return (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Pressable onPress={() => onRequestPick(i)} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={`Modifier ${effectLabel(e)}, tap to choose`}>
              <View style={{ height: 38, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 5, backgroundColor: 'rgba(20,24,31,0.7)', borderWidth: 1, borderColor: 'rgba(218,162,73,0.4)' }}>
                <Text numberOfLines={1} style={{ color: Rune.sheet, fontSize: 12, fontFamily: Body.bold }}>{effectLabel(e)}</Text>
              </View>
            </Pressable>
            <Pressable onPress={() => bump(i, -1)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Decrease">
              <View style={{ width: 34, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 5, backgroundColor: 'rgba(20,24,31,0.7)', borderWidth: 1, borderColor: 'rgba(218,162,73,0.4)' }}>
                <Text style={{ color: Rune.sheet, fontSize: 19, fontFamily: Display.bold }}>−</Text>
              </View>
            </Pressable>
            <Text style={{ color: Rune.goldBright, fontSize: 16, fontFamily: Display.black, width: 38, textAlign: 'center' }}>{amount}</Text>
            <Pressable onPress={() => bump(i, 1)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Increase">
              <View style={{ width: 34, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 5, backgroundColor: 'rgba(20,24,31,0.7)', borderWidth: 1, borderColor: 'rgba(218,162,73,0.4)' }}>
                <Text style={{ color: Rune.sheet, fontSize: 19, fontFamily: Display.bold }}>+</Text>
              </View>
            </Pressable>
            <Pressable onPress={() => onChange(effects.filter((_, j) => j !== i))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove effect" style={{ padding: 3 }}>
              <Text style={{ color: '#E2705A', fontSize: 16, fontFamily: Body.bold }}>✕</Text>
            </Pressable>
          </View>
        );
      })}
      <RuneButton label="+ Add effect" kind="secondary" dense height={36} onPress={() => onChange([...effects, { target: 'maxHp', delta: 1 }])} />
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
 * Editor frame (#252): in-sheet (framed) the scroller lives inside a full-screen chamfered SVG border
 * with `overflow: hidden`, so the card + fields can never escape past the border / the status bar.
 * Standalone (creation) it's a plain full-screen container. Module-level so it never remounts the
 * scroller (which would drop scroll position).
 */
function EditorFrame({ framed, insetTop, insetBottom, animStyle, children }: { framed: boolean; insetTop: number; insetBottom: number; animStyle: StyleProp<ViewStyle>; children: ReactNode }) {
  if (framed) {
    return (
      <Animated.View style={[{ position: 'absolute', top: insetTop + 8, bottom: insetBottom + 8, left: 10, right: 10 }, animStyle]}>
        <ChamferBox chamfer={18} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} style={{ flex: 1, overflow: 'hidden' }}>
          {children}
        </ChamferBox>
      </Animated.View>
    );
  }
  return <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }, animStyle]}>{children}</Animated.View>;
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
  typeGroups,
  scrimless = false,
}: {
  kindLabel: string;
  initial?: CardDraft;
  onSave: (draft: CardDraft) => void;
  onCancel: () => void;
  saveLabel?: string;
  /** Drop the editor's own dark scrim (#239 item 9): used inside the sheet, where the shared SheetDim
   *  already darkens the screen — keeping a second scrim caused a double-dim that popped on open/close.
   *  A transparent tap-catcher still closes on outside tap. Standalone (creation) keeps its dark scrim. */
  scrimless?: boolean;
  /** Optional extra control rendered in the fields column (#164: the inventory/arsenal target picker). */
  extraField?: ReactNode;
  /** Experience mode (#202): a long-title phrase, no description/effects; preview shows the bonus. */
  experienceMode?: boolean;
  /** The experience bonus shown on the preview card (experience mode). */
  modifier?: number;
  /** Type groups (#214/#246): tapping the card's plaque chip opens a PICKER of these grouped types
   *  (built-in + the player's custom types). `kindLabel` is the default. Absent → the plaque shows the
   *  static `kindLabel` (not tappable). */
  typeGroups?: { label: string; types: string[] }[];
}) {
  // New cards open with a random color already set, as if Random Color was pressed (#153). The type
  // chip defaults to `kindLabel` when a type picker is available (#246).
  const [draft, setDraft] = useState<CardDraft>(() => initial ?? { title: '', text: '', imageUri: null, color: randomCardColor(), effects: [], typeLabel: typeGroups ? kindLabel : undefined });
  // The plaque label: the picked type when a type list is supplied, else the caller's static label.
  const plaqueLabel = typeGroups?.length ? draft.typeLabel ?? kindLabel : kindLabel;
  // The type picker is lifted to the editor ROOT (like the effect picker) so it covers the screen.
  const [pickType, setPickType] = useState(false);

  // Adding an image clears the random color; Random Color clears any uploaded image.
  const pickImage = useCallback(async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 }); // no forced crop (#155)
    if (!res.canceled && res.assets[0]) setDraft((d) => ({ ...d, imageUri: res.assets[0].uri, color: null }));
  }, []);
  const rollColor = useCallback(() => { playSfx('tokenCopyColor'); setDraft((d) => ({ ...d, color: randomCardColor(), imageUri: null })); }, []);

  const canSave = draft.title.trim().length > 0;
  // The effect-target picker is lifted to the editor ROOT (#242 item 7) so it covers the whole screen
  // instead of being clipped inside the scrolling fields column.
  const [pickEffect, setPickEffect] = useState<number | null>(null);

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
  // In the in-sheet (scrimless) full-screen frame (#252) the bordered frame already provides the top
  // inset, so the content's own top gap is small; standalone (creation) keeps the safe-area gap.
  const padFull = scrimless ? 30 : insets.top + 64; // resting top gap (keyboard closed)
  const padCompact = scrimless ? 8 : insets.top + 12; // typing: card top ~10px below the border
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
      {scrimless ? (
        // In-sheet (#252): OPAQUE full-screen backdrop (the carousel is unloaded behind it); closes
        // only via the Cancel button, never by tapping outside. The content is clipped to the border.
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(8,10,15,0.985)' }, scrimStyle]} />
      ) : (
        <AnimatedPressable style={[{ position: 'absolute', top: -120, bottom: -120, left: -60, right: -60, backgroundColor: 'rgba(6,8,13,0.92)' }, scrimStyle]} onPress={onCancel} accessibilityRole="button" accessibilityLabel="Discard and close" />
      )}
      <EditorFrame framed={scrimless} insetTop={insets.top} insetBottom={insets.bottom} animStyle={contentStyle}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ alignItems: 'center', paddingBottom: 140 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
          {typeGroups?.length && !experienceMode ? (
            <Pressable
              onPress={() => setPickType(true)}
              accessibilityRole="button"
              accessibilityLabel={`Card type: ${plaqueLabel}. Tap to change`}
              style={{ position: 'absolute', left: 0, right: 0, top: Math.round(FORGED_H * 0.4) - 16, height: 32 }}
            />
          ) : null}
        </Animated.View>
        {typeGroups?.length && !experienceMode ? (
          <Text style={{ marginTop: 8, color: Rune.bronze, fontSize: 10.5, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' }}>Tap the card type to change it</Text>
        ) : null}
        {/* fields */}
        <View style={{ width: 320, marginTop: 16, gap: 9 }}>
          {/* half-and-half: Add Image (smaller text) | Random Color (flat random fill) (#153) */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <RuneButton label="Add Image" kind="ghost" dense height={36} style={{ flex: 1 }} onPress={pickImage} />
            <RuneButton label="Random Color" kind="ghost" dense height={36} style={{ flex: 1 }} onPress={rollColor} muteSfx />
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
          {experienceMode ? null : <EffectsField effects={draft.effects} onChange={(effects) => setDraft((d) => ({ ...d, effects }))} onRequestPick={setPickEffect} />}
          {extraField}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <RuneButton label="Cancel" kind="ghost" height={42} style={{ flex: 1 }} onPress={onCancel} />
            <RuneButton label={saveLabel} kind="primary" height={42} style={{ flex: 1.4 }} disabled={!canSave} onPress={() => onSave({ ...draft, title: draft.title.trim() })} />
          </View>
          <Text style={{ color: Rune.muted, fontSize: 10, fontFamily: Body.medium, textAlign: 'center' }}>Same format as every RuneKeep card.</Text>
        </View>
      </ScrollView>
      </EditorFrame>
      {pickEffect != null && draft.effects[pickEffect] ? (
        <EffectPicker
          current={matchOption(draft.effects[pickEffect])}
          onPick={(o) => {
            setDraft((d) => ({
              ...d,
              effects: d.effects.map((e, j) => (j === pickEffect ? { ...e, target: o.target, mode: isThresholdTarget(o.target) ? o.mode : undefined } : e)),
            }));
            setPickEffect(null);
          }}
          onClose={() => setPickEffect(null)}
        />
      ) : null}
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
