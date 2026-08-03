import * as ImagePicker from 'expo-image-picker';

import { ownImage } from '@/lib/owned-image';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { scrollFieldIntoView, RESERVES_KEYBOARD_SPACE } from '@/lib/web-keyboard';
import { Keyboard, Pressable, ScrollView, type StyleProp, Text, TextInput, View, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChamferBox } from '@/components/chamfer-box';
import { ColorPalette } from '@/components/color-palette';
import { nearestColorName, normalizeHex, readableInk } from '@/lib/color';
import { PopupDialog } from '@/components/popup-dialog';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, Rune } from '@/constants/theme';
import { ART_H, FORGED_H, FORGED_W, ForgedCard } from '@/features/create/components/forged-card';
import { generatedSection, withGenerated } from '@/lib/card-form';
import { composeSections } from '@/lib/card-markdown';
import { type CardSection } from '@/lib/library';
import { type CardEffect } from '@/lib/modifiers';
import { applyPickedOption, EffectPicker, EffectsField, type ExperienceRef, FormulaVarPicker, matchOption } from '@/components/effects-editor';
import { isExperienceType } from '@/features/character-sheet/card-types';
import { playSfx } from '@/lib/sfx';
import { DimScreen } from '@/lib/screen-dim';
import { useFrame } from '@/hooks/use-layout';

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
  /** v0.10.2: the multi-field body (library cards). When set, the body renders per-section and `text`
   *  is a composed-markdown fallback derived from these on save. */
  sections?: CardSection[];
}

/**
 * How much a player may write on a card (v0.31.0).
 *
 * These used to be 70 and 280, set when the card printed at one fixed size and anything longer ran
 * off the bottom. v0.30.0 made the description choose its own size from the room left under the
 * title (`lib/fit-text`), so a long one now shrinks to fit instead of overflowing, and the old caps
 * were stopping people well short of what the card can actually hold.
 *
 * The new numbers are what stays READABLE, not what stays inside the box: 600 characters fills the
 * lower body at roughly 7.5pt, and past that the type is too small to be worth typing. They are the
 * same in the quick flow and the full editor, because it is the same card either way.
 */
export const TITLE_MAX = 120;
export const TEXT_MAX = 600;

/**
 * How much of a field is used (v0.33.0).
 *
 * `maxLength` stops typing dead with no warning and no explanation, which is a bad way to find out a
 * limit exists. The count stays quiet until the field is most of the way full and then turns gold, so
 * it is an answer when you want one rather than a number to read while you write.
 *
 * Absolutely positioned on purpose: the fields it sits in are fixed-height boxes, and a counter in
 * the flow would squeeze the input it is describing.
 */
export function CharCount({ value, max }: { value: string; max: number }) {
  const used = value.length;
  if (used < max * 0.6) return null;
  return (
    <Text
      pointerEvents="none"
      accessibilityLabel={`${used} of ${max} characters used`}
      style={{ position: 'absolute', right: 5, bottom: 2, color: used >= max ? Rune.red : Rune.goldText, fontSize: 9.5, fontFamily: Body.bold, letterSpacing: 0.5 }}>
      {used}/{max}
    </Text>
  );
}

/** A tiny markdown-toolbar button (Bold / Italic / bullet / reorder). */
function MarkBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={5} accessibilityRole="button" accessibilityLabel={label} style={{ width: 30, height: 26, alignItems: 'center', justifyContent: 'center', borderRadius: 4, backgroundColor: 'rgba(20,24,31,0.85)', borderWidth: 1, borderColor: 'rgba(218,162,73,0.4)' }}>
      <Text style={{ color: Rune.goldText, fontSize: 12.5, fontFamily: Body.bold }}>{label}</Text>
    </Pressable>
  );
}

/** v0.13.0 ancestry mode: guarantee the two mandatory feature rows. No flags yet (a NEW card, or a
 *  legacy one saved before flags existed) → seed/adopt: new = description first then two features
 *  (owner default); legacy = its first two sections BECOME the features (same positions as before). */
function ensureAncestryRows(sections: CardSection[]): CardSection[] {
  const flagged = sections.filter((s) => s.feature).length;
  if (flagged >= 2) return sections;
  if (sections.length === 0) return [{ body: '' }, { body: '', feature: true }, { body: '', feature: true }];
  const out = sections.map((s, i) => (i < 2 ? { ...s, feature: true } : s));
  while (out.filter((s) => s.feature).length < 2) out.push({ body: '', feature: true });
  return out;
}

/**
 * The multi-field card body (Feature 8): add/delete/reorder titled sections, each with a Bold/Italic/
 * bullet toolbar that wraps the current selection (only the syntax card-markdown renders). `minRows`
 * fixed slots always show; more can be added or removed. `ancestryFeatures` (v0.13.0): two mandatory
 * feature-flagged rows that can be MOVED anywhere but never deleted — their "Feature 1/2" identity is
 * their relative order (the upper flagged row is always Feature 1), re-labelled live on every move.
 */
function SectionsField({ sections, onChange, minRows = 1, fixedLabels, ancestryFeatures = false }: { sections: CardSection[]; onChange: (s: CardSection[]) => void; minRows?: number; fixedLabels?: string[]; ancestryFeatures?: boolean }) {
  const [sel, setSel] = useState<{ row: number; start: number; end: number }>({ row: -1, start: 0, end: 0 });
  const rows: CardSection[] = ancestryFeatures
    ? ensureAncestryRows(sections)
    : sections.length >= minRows ? sections : [...sections, ...Array.from({ length: minRows - sections.length }, () => ({ body: '' }))];
  let featureRank = 0; // running 1/2 label for flagged rows, assigned in render order
  const commit = (next: CardSection[]) => onChange(next);
  const update = (i: number, patch: Partial<CardSection>) => commit(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = () => { playSfx('buttonTap'); commit([...rows, { body: '' }]); };
  const canRemove = (i: number) => (ancestryFeatures ? !rows[i].feature : rows.length > minRows);
  const removeRow = (i: number) => { if (!canRemove(i)) return; playSfx('cardDeselect'); commit(rows.filter((_, j) => j !== i)); };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    playSfx('buttonTap');
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };
  const applyMark = (i: number, mark: '**' | '*' | 'bullet') => {
    if (sel.row !== i) return;
    const body = rows[i].body;
    if (mark === 'bullet') {
      const ls = body.lastIndexOf('\n', Math.max(0, sel.start - 1)) + 1;
      update(i, { body: `${body.slice(0, ls)}- ${body.slice(ls)}` });
      return;
    }
    const mid = body.slice(sel.start, sel.end);
    update(i, { body: `${body.slice(0, sel.start)}${mark}${mid}${mark}${body.slice(sel.end)}` });
  };
  return (
    <View style={{ gap: 8 }}>
      {rows.map((r, i) => {
        const rank = ancestryFeatures && r.feature ? ++featureRank : 0; // Feature 1/2 by vertical order
        return (
        <ChamferBox key={i} chamfer={8} fill="rgba(14,17,22,0.96)" stroke={rank ? Rune.goldEdge : 'rgba(218,162,73,0.5)'} strokeWidth={1.2} style={{ paddingHorizontal: 11, paddingVertical: 9, gap: 7 }}>
          {rank ? (
            <Text style={{ color: Rune.bronze, fontSize: 9, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>{`Feature ${rank} · always on the card`}</Text>
          ) : null}
          {/* v0.30.0: say where this text came from, and that the form owns it. Editing it is allowed;
              the editor asks before a later detail change overwrites what you wrote. */}
          {r.generated ? (
            <Text style={{ color: Rune.bronze, fontSize: 9, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>Written from the card details</Text>
          ) : null}
          <TextInput
            value={r.name ?? ''}
            onChangeText={(name) => update(i, { name })}
            placeholder={rank ? `Feature ${rank} name` : fixedLabels?.[i] ?? 'Section name (optional)'}
            placeholderTextColor={Rune.muted}
            selectionColor={Rune.goldBright}
            maxLength={60}
            style={{ color: Rune.goldText, fontSize: 13, fontFamily: Body.bold, padding: 0 }}
            accessibilityLabel={rank ? `Feature ${rank} name` : `Section ${i + 1} name`}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <MarkBtn label="B" onPress={() => applyMark(i, '**')} />
            <MarkBtn label="I" onPress={() => applyMark(i, '*')} />
            <MarkBtn label="•" onPress={() => applyMark(i, 'bullet')} />
            <View style={{ flex: 1 }} />
            <MarkBtn label="↑" onPress={() => move(i, -1)} />
            <MarkBtn label="↓" onPress={() => move(i, 1)} />
            {canRemove(i) ? <MarkBtn label="✕" onPress={() => removeRow(i)} /> : null}
          </View>
          <TextInput
            value={r.body}
            onChangeText={(body) => update(i, { body })}
            onSelectionChange={(e) => setSel({ row: i, start: e.nativeEvent.selection.start, end: e.nativeEvent.selection.end })}
            placeholder="Describe it. Select text, then tap B, I or bullet to format."
            placeholderTextColor={Rune.muted}
            selectionColor={Rune.goldBright}
            multiline
            maxLength={TEXT_MAX}
            style={{ color: Rune.sheet, fontSize: 13, lineHeight: 18, fontFamily: Body.regular, padding: 0, minHeight: 48, textAlignVertical: 'top' }}
            accessibilityLabel={`Section ${i + 1} text`}
          />
          <CharCount value={r.body} max={TEXT_MAX} />
        </ChamferBox>
        );
      })}
      <RuneButton label="+ Add section" kind="ghost" dense height={32} muteSfx onPress={addRow} />
    </View>
  );
}

/**
 * Full-screen card-TYPE picker (#246) — same shape as the modifier picker. Lists the grouped built-in
 * types plus the player's custom types; picking sets the card's middle-ribbon label.
 */
export function TypePicker({ groups, current, onPick, onClose }: { groups: { label: string; types: string[] }[]; current?: string; onPick: (t: string) => void; onClose: () => void }) {
  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 10002, alignItems: 'center', justifyContent: 'center' }}>
      <Pressable style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(6,8,13,0.9)' }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <DimScreen opacity={0.9} />
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


/** A pleasant-but-random flat color (controlled S/L so it never looks garish). */
export function randomCardColor(): string {
  const h = Math.floor(Math.random() * 360);
  const s = 42 + Math.floor(Math.random() * 28); // 42-70%
  const l = 30 + Math.floor(Math.random() * 22); // 30-52%
  return `hsl(${h}, ${s}%, ${l}%)`;
}

// v0.25.0: shorter, because the waterline no longer starts filling the instant you touch down, so
// the hold has to complete sooner to still feel brief.
const HOLD_MS = 460;
/** How long a press must last before it LOOKS like a hold. Under this it is a tap, and a tap must not
 *  flash the picker's waterline: the tap does something else entirely (it rerolls the colour). */
const HOLD_GRACE_MS = 150;
/** The type plaque's hit band, on the seam the divider is drawn on. Shared so the control sits in the
 *  same place whichever door the card came through. */
export const PLAQUE_TOP = Math.round(FORGED_H * 0.4) - 16;
export const PLAQUE_H = 32;

/**
 * The card's ART ZONE as one control: tap rerolls the color, hold charges a gold waterline over the
 * art and opens the picker.
 *
 * Written for the quick flow (v0.24.3) and now the full editor's too (v0.34.3, owner): "there is no
 * reason for only quick card creation to have easy controls". The advanced editor keeps its labelled
 * buttons as well, because that is what makes it the advanced one, but the card itself behaves the
 * same in both places.
 *
 * The live band STOPS at the type plaque (v0.31.0). It has to, because the plaque is a control of its
 * own, and a tap that both changed the type and rerolled the art would be one of them too many.
 */
export function ArtGesture({ onTap, onHold, reduced, children }: { onTap: () => void; onHold: () => void; reduced: boolean; children: ReactNode }) {
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

/**
 * The colour's NAME, over the art, for a moment (owner, v0.34.5).
 *
 * Rolling a random colour used to be a silent change of hue. The picker names the colour it is
 * centred on, and there is no reason the dice should not say the same thing: it fades up over a
 * second, sits, and goes. Same naming as the picker, so "Hot Pink" here is "Hot Pink" there.
 *
 * `nonce` rather than the colour itself, so rolling the same colour twice still says so.
 */
export function ColorNameFlash({ color, nonce }: { color: string | null; nonce: number }) {
  const p = useSharedValue(0);
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (!nonce || !color) return;
    const normal = normalizeHex(color);
    setShown(normal ? nearestColorName(normal) : null);
    p.value = 0;
    p.value = withSequence(
      withTiming(1, { duration: 1000, easing: Easing.out(Easing.cubic) }),
      withDelay(500, withTiming(0, { duration: 500, easing: Easing.in(Easing.cubic) })),
    );
  }, [nonce, color, p]);
  const style = useAnimatedStyle(() => ({ opacity: p.value }));
  if (!shown) return null;
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: 0, height: ART_H, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Text
        allowFontScaling={false}
        style={{ color: color ? readableInk(normalizeHex(color) ?? '#000000') : Rune.ivory, fontSize: 15, fontFamily: Display.black, letterSpacing: 1.2, textTransform: 'uppercase', textAlign: 'center', paddingHorizontal: 16 }}>
        {shown}
      </Text>
    </Animated.View>
  );
}

/**
 * The dialog that stands between a picture and a colour (owner, v0.34.3).
 *
 * Setting a colour REPLACES the art, and now that the card itself rerolls on a tap, one stray touch
 * could throw away a photograph the player had just chosen. Every door that sets a colour goes
 * through this when there is an image to lose, and none of them ask when there is not.
 */
export function ColorOverArtDialog({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <PopupDialog
      title="Replace the picture?"
      body="This card has an image on it. Setting a colour takes the image off. You can always choose it again."
      confirmLabel="Use a colour"
      destructive
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
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
  previewSubtitle,
  experiences,
  initial,
  onSave,
  onCancel,
  saveLabel = 'Save card',
  extraField,
  experienceMode = false,
  modifier,
  typeGroups,
  scrimless = false,
  sectioned = false,
  sectionsConfig,
  generatedBody,
}: {
  kindLabel: string;
  /** v0.14.0: the centered line under the title in the LIVE preview — the subclass tier word, so an
   *  author can confirm it before saving. Not part of the draft; the caller derives it from the config. */
  previewSubtitle?: string;
  /** v0.14.0: the character's Experiences, so an effect can target one of them by name. */
  experiences?: ExperienceRef[];
  initial?: CardDraft;
  onSave: (draft: CardDraft) => void;
  onCancel: () => void;
  saveLabel?: string;
  /** v0.10.2: use the multi-field sections body (library cards) instead of the single text box. */
  sectioned?: boolean;
  /** v0.10.2: fixed minimum rows + their placeholder names. v0.13.0: `ancestryFeatures` = two mandatory
   *  movable feature rows (Feature 1/2 identity = relative order), description-first default. */
  sectionsConfig?: { minRows?: number; fixedLabels?: string[]; ancestryFeatures?: boolean };
  /** v0.30.0: markdown written from the card's DETAIL FORM (weapon stats, domain + level, and so on),
   *  kept as the leading section so the author can read back what they filled in. Recomputed by the
   *  caller as the form changes; this editor keeps it in step with the draft and asks first when
   *  doing so would discard hand-edits. Absent = the card has no form worth printing. */
  generatedBody?: string;
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
    // v0.26.0: own it before storing the path — the picker's URI points into a cache an update clears.
    if (!res.canceled && res.assets[0]) { const uri = await ownImage(res.assets[0].uri); setDraft((d) => ({ ...d, imageUri: uri, color: null })); }
  }, []);
  /**
   * Setting a colour, with the picture guarded (v0.34.3).
   *
   * `'random'` stands for the dice rather than for a value, so the confirmation can be answered and
   * THEN rolled: asking "replace the picture with this colour?" and rolling a different one on Yes
   * would be its own small lie.
   */
  const [pickColor, setPickColor] = useState(false);
  const [askColor, setAskColor] = useState<string | null>(null);
  /** Bumped on every applied colour, which is what makes the name flash fire (v0.34.5). */
  const [colorNonce, setColorNonce] = useState(0);
  const applyColor = useCallback((c: string) => {
    playSfx('tokenCopyColor');
    setDraft((d) => ({ ...d, color: c === 'random' ? randomCardColor() : c, imageUri: null }));
    setColorNonce((n) => n + 1);
  }, []);
  const setColor = useCallback(
    (c: string) => {
      if (draft.imageUri) { setAskColor(c); return; }
      applyColor(c);
    },
    [applyColor, draft.imageUri],
  );
  const rollColor = useCallback(() => setColor('random'), [setColor]);

  // #318: a note/card can be saved with NO title as long as it has SOME content (a body). An experience
  // still needs its phrase (the title IS the experience).
  const hasSectionContent = (draft.sections ?? []).some((s) => s.body.trim() || (s.name ?? '').trim());
  // v0.14.0: picking the "Experience" type flips this editor into the SAME layout creation and level-up
  // use for an experience — a long phrase, no body, no effects, a bonus pill on the preview. The type
  // chip itself stays tappable (it's gated on the prop, not this), so the choice is reversible.
  const expMode = experienceMode || (!!typeGroups?.length && isExperienceType(draft.typeLabel));
  const canSave = expMode ? draft.title.trim().length > 0 : draft.title.trim().length > 0 || (sectioned ? hasSectionContent : draft.text.trim().length > 0);
  /**
   * v0.30.0: keep the form-written section in step with the form.
   *
   * `lastGen` is what the form produced LAST time, which is the only way to tell an author's edit
   * apart from a form change: if the section on the card no longer matches what the form last wrote,
   * somebody has been typing in it, and rewriting would throw that away. So the rewrite is offered
   * rather than performed, and declining leaves their text alone (the form still saves its values;
   * only the printed block stays as they left it).
   */
  const lastGen = useRef<string | undefined>(undefined);
  const seeded = useRef(false);
  const handEdited = useRef(false);
  const [askRewrite, setAskRewrite] = useState<string | null>(null);
  useEffect(() => {
    if (generatedBody == null) return;
    const onCard = generatedSection(draft.sections)?.body;
    if (!seeded.current) {
      seeded.current = true;
      lastGen.current = generatedBody;
      // On OPEN, `generatedBody` is what the form produces from the config this card was SAVED with.
      // So a block that does not match it is one somebody typed over in an earlier session, and it
      // must survive being reopened, which is the whole promise.
      handEdited.current = onCard != null && onCard !== generatedBody;
      if (onCard != null) return;
      setDraft((d) => ({ ...d, sections: withGenerated(d.sections, generatedBody) }));
      return;
    }
    // After that, an edit is the block drifting from the last thing the form wrote into it.
    if (onCard != null && lastGen.current != null && onCard !== lastGen.current) handEdited.current = true;
    if (lastGen.current === generatedBody) return;
    lastGen.current = generatedBody;
    if (handEdited.current) { setAskRewrite(generatedBody); return; }
    setDraft((d) => ({ ...d, sections: withGenerated(d.sections, generatedBody) }));
  }, [generatedBody, draft.sections]);

  // The effect-target picker is lifted to the editor ROOT (#242 item 7) so it covers the whole screen
  // instead of being clipped inside the scrolling fields column.
  const [pickEffect, setPickEffect] = useState<number | null>(null);
  const [pickVar, setPickVar] = useState<number | null>(null); // #325: formula-variable picker

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
  const { height: screenH, scale: frameScale } = useFrame();
  const insets = useSafeAreaInsets();
  // In the in-sheet (scrimless) full-screen frame (#252) the bordered frame already provides the top
  // inset, so the content's own top gap is small; standalone (creation) keeps the safe-area gap.
  const padFull = scrimless ? 30 : insets.top + 64; // resting top gap (keyboard closed)
  const padCompact = scrimless ? 8 : insets.top + 12; // typing: card top ~10px below the border
  // Height the fields column + buttons occupy below the card (approx; experiences have no body/effects).
  const fieldsH = expMode ? 196 : 340;
  const kb = useSharedValue(0);
  // v0.23.0: the REAL keyboard height, reported by the OS. Used as a bottom spacer so the footer is
  // always above it, whatever keyboard the player uses.
  const kbH = useSharedValue(0);
  const [kbPx, setKbPx] = useState(0);
  const usableWhileTyping = kbPx > 0 ? screenH - kbPx : screenH * 0.55;
  const cardRoom = usableWhileTyping - padCompact - fieldsH; // vertical space left for the card while typing
  const fadeCard = cardRoom < 50; // too small to be worth showing → fade out instead of shrinking
  const targetScale = fadeCard ? 0.2 : Math.max(0.32, Math.min(1, cardRoom / FORGED_H));

  const KB = { duration: 240, easing: Easing.out(Easing.cubic) };
  const onFieldFocus = useCallback((e: unknown) => {
    if (!reduced) kb.value = withTiming(1, KB);
    scrollFieldIntoView(e); // web: the browser shrank the page, so aim at the field rather than pad
  }, [kb, reduced]);
  // Drive compaction off the keyboard itself (item 1): re-tapping an already-focused field re-opens
  // the keyboard (no onFocus fires) but DOES fire keyboardDidShow — so the UI re-compacts; hiding it
  // (Back / dismiss) animates back even though the field keeps its cursor.
  useEffect(() => {
    // v0.26.0: never on web. A browser shrinks the page itself when the keyboard opens, so reserving
    // space here as well raised the editor by roughly two keyboards and pushed the card off the top.
    if (reduced || !RESERVES_KEYBOARD_SPACE) return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      kb.value = withTiming(1, KB);
      // v0.24.0: the keyboard reports PHYSICAL dp. Inside the tablet frame the spacer that reserves
      // room for it is magnified, so without dividing it out the editor reserves a keyboard and a
      // half and the buttons walk off the top.
      const h = (e.endCoordinates?.height ?? 0) / frameScale;
      kbH.value = withTiming(h, KB);
      setKbPx(h);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => { kb.value = withTiming(0, KB); kbH.value = withTiming(0, KB); setKbPx(0); });
    return () => { show.remove(); hide.remove(); };
  }, [kb, kbH, reduced, frameScale]);
  const topSpacer = useAnimatedStyle(() => ({ height: padFull + (padCompact - padFull) * kb.value }));
  const bottomSpacer = useAnimatedStyle(() => ({ height: kbH.value }));
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
        // In-sheet (#252): OPAQUE full-screen backdrop; closes only via the Cancel button, never by
        // tapping outside. OCCLUDES touches (#276 item 4): when editing a card from FULLSCREEN the
        // carousel stays mounted+fullscreen behind this, so the backdrop must swallow stray taps (no
        // pointerEvents=none) or they'd reach the focused card and close it.
        <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(8,10,15,0.985)' }, scrimStyle]} />
      ) : (
        // v0.13.0: standalone scrim no longer dismisses — a stray outside tap must never discard a
        // draft. The editor closes ONLY via its Cancel/Save buttons (same contract as scrimless).
        <Animated.View style={[{ position: 'absolute', top: -120, bottom: -120, left: -60, right: -60, backgroundColor: 'rgba(6,8,13,0.92)' }, scrimStyle]} />
      )}
      <EditorFrame framed={scrimless} insetTop={insets.top} insetBottom={insets.bottom} animStyle={contentStyle}>
      <DimScreen opacity={scrimless ? 0.985 : 0.92} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ alignItems: 'center', paddingBottom: 140 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* top gap: collapses while typing so the card + fields ride up to just below the border (#227) */}
        <Animated.View style={topSpacer} />
        {/* live preview — scales down from its TOP while a field is focused, the negative margin pulling
            the fields up so they sit above the keyboard */}
        <Animated.View style={[{ transformOrigin: 'top center' }, previewStyle]}>
          {/* v0.34.3: the art is the same tap-and-hold control the quick flow has. The labelled
              buttons below stay: this is the advanced editor, and it should have both. */}
          <ArtGesture onTap={rollColor} onHold={pickImage} reduced={reduced}>
            {expMode ? (
              <ForgedCard title={draft.title.trim() || 'Experience'} kindLabel="Experience" body="" accentDeep={Rune.panel} imageUri={draft.imageUri} colorArt={draft.color} experience modifier={modifier ?? 2} />
            ) : (
              // #318: no "Untitled" — an empty title previews as a titleless card (the body fills the space).
              <ForgedCard title={draft.title.trim()} kindLabel={plaqueLabel} subtitle={previewSubtitle} body={sectioned ? composeSections(draft.sections) : draft.text} accentDeep={Rune.panel} imageUri={draft.imageUri} colorArt={draft.color} multilineTitle />
            )}
            {/* Tappable TYPE CHIP (#214): the plaque IS the card's type — tap it to cycle the label. A
                transparent hit-band over the divider seam (~40% down), so the player taps the chip on
                the card itself. Only when type options are supplied (New Card), not experiences. */}
            <ColorNameFlash color={draft.imageUri ? null : draft.color} nonce={colorNonce} />
            {typeGroups?.length && !experienceMode ? (
              <Pressable
                onPress={() => setPickType(true)}
                accessibilityRole="button"
                accessibilityLabel={`Card type: ${plaqueLabel}. Tap to change`}
                style={{ position: 'absolute', left: 0, right: 0, top: PLAQUE_TOP, height: PLAQUE_H }}
              />
            ) : null}
          </ArtGesture>
        </Animated.View>
        <Text style={{ marginTop: 8, color: Rune.bronze, fontSize: 10.5, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase', textAlign: 'center', paddingHorizontal: 24 }}>
          {typeGroups?.length && !experienceMode ? 'Tap the art for a new color, hold it for a picture. Tap the type to change it.' : 'Tap the art for a new color, hold it for a picture.'}
        </Text>
        {/* fields */}
        <View style={{ width: 320, marginTop: 16, gap: 9 }}>
          {/* half-and-half: Add Image (smaller text) | Random Color (flat random fill) (#153) */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <RuneButton label="Add Image" kind="ghost" dense height={36} style={{ flex: 1 }} onPress={pickImage} />
            <RuneButton label="Random Color" kind="ghost" dense height={36} style={{ flex: 1 }} onPress={rollColor} muteSfx />
            {/* v0.34.3: the same swatch grid the moodboard uses, for a colour you actually chose. */}
            <RuneButton label="Colors" kind="ghost" dense height={36} style={{ flex: 0.8 }} onPress={() => setPickColor(true)} />
          </View>
          <ChamferBox chamfer={8} fill="rgba(14,17,22,0.96)" stroke="rgba(218,162,73,0.5)" strokeWidth={1.2} style={{ minHeight: expMode ? 80 : 46, justifyContent: 'center', paddingHorizontal: 13, paddingVertical: expMode ? 9 : 0 }}>
            <TextInput
              value={draft.title}
              onChangeText={(title) => setDraft((d) => ({ ...d, title }))}
              onFocus={onFieldFocus}
              placeholder={expMode ? 'A word, or a whole phrase' : 'Title'}
              placeholderTextColor={Rune.muted}
              selectionColor={Rune.goldBright}
              multiline={expMode}
              maxLength={expMode ? 160 : TITLE_MAX}
              style={{ color: Rune.sheet, fontSize: 15, fontFamily: Body.semibold, padding: 0, textAlignVertical: expMode ? 'top' : 'center' }}
              accessibilityLabel={expMode ? 'Experience' : 'Card title'}
            />
            <CharCount value={draft.title} max={expMode ? 160 : TITLE_MAX} />
          </ChamferBox>
          {expMode ? null : sectioned ? (
            <SectionsField sections={draft.sections ?? []} onChange={(sections) => setDraft((d) => ({ ...d, sections }))} minRows={sectionsConfig?.minRows} fixedLabels={sectionsConfig?.fixedLabels} ancestryFeatures={sectionsConfig?.ancestryFeatures} />
          ) : (
            <ChamferBox chamfer={8} fill="rgba(14,17,22,0.96)" stroke="rgba(218,162,73,0.5)" strokeWidth={1.2} style={{ height: 92, paddingHorizontal: 13, paddingVertical: 9 }}>
              <TextInput
                value={draft.text}
                onChangeText={(text) => setDraft((d) => ({ ...d, text }))}
                onFocus={onFieldFocus}
                placeholder="What it means, and when it helps."
                placeholderTextColor={Rune.muted}
                selectionColor={Rune.goldBright}
                multiline
                maxLength={TEXT_MAX}
                style={{ color: Rune.sheet, fontSize: 13, lineHeight: 18, fontFamily: Body.regular, padding: 0, flex: 1, textAlignVertical: 'top' }}
                accessibilityLabel="Card text"
              />
              <CharCount value={draft.text} max={TEXT_MAX} />
            </ChamferBox>
          )}
          {expMode ? null : <EffectsField effects={draft.effects} onChange={(effects) => setDraft((d) => ({ ...d, effects }))} onRequestPick={setPickEffect} onRequestPickVar={setPickVar} experiences={experiences} />}
          {extraField}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <RuneButton label="Cancel" kind="ghost" height={42} style={{ flex: 1 }} onPress={onCancel} />
            <RuneButton label={saveLabel} kind="primary" height={42} style={{ flex: 1.4 }} disabled={!canSave} onPress={() => onSave({ ...draft, title: draft.title.trim(), text: sectioned ? composeSections(draft.sections) : draft.text })} />
          </View>
          <Text style={{ color: Rune.muted, fontSize: 10, fontFamily: Body.medium, textAlign: 'center' }}>Same format as every RuneKeep card.</Text>
        </View>
        {/* v0.23.0: a spacer the exact height of the keyboard, so Cancel and Save can always be
            reached and are never underneath it. */}
        <Animated.View style={bottomSpacer} />
      </ScrollView>
      </EditorFrame>
      {pickEffect != null && draft.effects[pickEffect] ? (
        <EffectPicker
          current={matchOption(draft.effects[pickEffect], experiences)}
          experiences={experiences}
          onPick={(o) => {
            setDraft((d) => ({
              ...d,
              effects: d.effects.map((e, j) => (j === pickEffect ? applyPickedOption(e, o) : e)),
            }));
            setPickEffect(null);
          }}
          onClose={() => setPickEffect(null)}
        />
      ) : null}
      {pickVar != null && draft.effects[pickVar] ? (
        <FormulaVarPicker
          current={draft.effects[pickVar].formula?.variable}
          onPick={(variable) => {
            setDraft((d) => ({ ...d, effects: d.effects.map((e, j) => (j === pickVar ? { ...e, formula: { ...(e.formula ?? { variable }), variable } } : e)) }));
            setPickVar(null);
          }}
          onClose={() => setPickVar(null)}
        />
      ) : null}
      {askRewrite != null ? (
        <PopupDialog
          title="Rewrite the details block?"
          body="You have edited the block the card details wrote, and changing a detail rewrites the whole block. Rewrite it and your edits there are lost. Keep it and the card prints what you wrote, while the details you just changed still apply."
          confirmLabel="Rewrite it"
          cancelLabel="Keep my text"
          destructive
          onConfirm={() => { handEdited.current = false; setDraft((d) => ({ ...d, sections: withGenerated(d.sections, askRewrite) })); setAskRewrite(null); }}
          onCancel={() => setAskRewrite(null)}
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
      {pickColor ? (
        <ColorPalette
          title="Card colour"
          current={draft.imageUri ? null : draft.color}
          onPick={(c) => { setPickColor(false); setColor(c); }}
          allowRandom
          onClose={() => setPickColor(false)}
        />
      ) : null}
      {askColor ? <ColorOverArtDialog onConfirm={() => { const c = askColor; setAskColor(null); applyColor(c); }} onCancel={() => setAskColor(null)} /> : null}
    </View>
  );
}
