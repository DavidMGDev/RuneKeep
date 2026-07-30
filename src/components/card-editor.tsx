import * as ImagePicker from 'expo-image-picker';

import { ownImage } from '@/lib/owned-image';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { scrollFieldIntoView, RESERVES_KEYBOARD_SPACE } from '@/lib/web-keyboard';
import { Keyboard, Pressable, ScrollView, type StyleProp, Text, TextInput, View, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, Rune } from '@/constants/theme';
import { FORGED_H, ForgedCard } from '@/features/create/components/forged-card';
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
            maxLength={400}
            style={{ color: Rune.sheet, fontSize: 13, lineHeight: 18, fontFamily: Body.regular, padding: 0, minHeight: 48, textAlignVertical: 'top' }}
            accessibilityLabel={`Section ${i + 1} text`}
          />
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
function TypePicker({ groups, current, onPick, onClose }: { groups: { label: string; types: string[] }[]; current?: string; onPick: (t: string) => void; onClose: () => void }) {
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
  const rollColor = useCallback(() => { playSfx('tokenCopyColor'); setDraft((d) => ({ ...d, color: randomCardColor(), imageUri: null })); }, []);

  // #318: a note/card can be saved with NO title as long as it has SOME content (a body). An experience
  // still needs its phrase (the title IS the experience).
  const hasSectionContent = (draft.sections ?? []).some((s) => s.body.trim() || (s.name ?? '').trim());
  // v0.14.0: picking the "Experience" type flips this editor into the SAME layout creation and level-up
  // use for an experience — a long phrase, no body, no effects, a bonus pill on the preview. The type
  // chip itself stays tappable (it's gated on the prop, not this), so the choice is reversible.
  const expMode = experienceMode || (!!typeGroups?.length && isExperienceType(draft.typeLabel));
  const canSave = expMode ? draft.title.trim().length > 0 : draft.title.trim().length > 0 || (sectioned ? hasSectionContent : draft.text.trim().length > 0);
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
          {expMode ? (
            <ForgedCard title={draft.title.trim() || 'Experience'} kindLabel="Experience" body="" accentDeep={Rune.panel} imageUri={draft.imageUri} colorArt={draft.color} experience modifier={modifier ?? 2} />
          ) : (
            // #318: no "Untitled" — an empty title previews as a titleless card (the body fills the space).
            <ForgedCard title={draft.title.trim()} kindLabel={plaqueLabel} subtitle={previewSubtitle} body={sectioned ? composeSections(draft.sections) : draft.text} accentDeep={Rune.panel} imageUri={draft.imageUri} colorArt={draft.color} multilineTitle />
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
          <ChamferBox chamfer={8} fill="rgba(14,17,22,0.96)" stroke="rgba(218,162,73,0.5)" strokeWidth={1.2} style={{ minHeight: expMode ? 80 : 46, justifyContent: 'center', paddingHorizontal: 13, paddingVertical: expMode ? 9 : 0 }}>
            <TextInput
              value={draft.title}
              onChangeText={(title) => setDraft((d) => ({ ...d, title }))}
              onFocus={onFieldFocus}
              placeholder={expMode ? 'A word, or a whole phrase' : 'Title'}
              placeholderTextColor={Rune.muted}
              selectionColor={Rune.goldBright}
              multiline={expMode}
              maxLength={expMode ? 160 : 70}
              style={{ color: Rune.sheet, fontSize: 15, fontFamily: Body.semibold, padding: 0, textAlignVertical: expMode ? 'top' : 'center' }}
              accessibilityLabel={expMode ? 'Experience' : 'Card title'}
            />
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
                maxLength={280}
                style={{ color: Rune.sheet, fontSize: 13, lineHeight: 18, fontFamily: Body.regular, padding: 0, flex: 1, textAlignVertical: 'top' }}
                accessibilityLabel="Card text"
              />
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
