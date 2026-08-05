/**
 * The DM's modifiers panel (v0.35, owner).
 *
 * The same two states the character sheet's card panel has, with a DM's powers added:
 *
 *  - **Summary.** Every modifier with its resolved value, a checkbox on the left of each one, and
 *    groups that expand, collapse and carry a checkbox of their own.
 *  - **Edit.** The shared effects editor, in DM mode, so it offers the per-modifier switch, group
 *    creation and the Level modifier.
 *
 * Used twice: aimed at ONE character (the party sheet's member entry, and the encounter's ally list),
 * and aimed at the WHOLE party (the party sheet's top-right button). Both write through the caller,
 * which is what keeps this component free of stores.
 *
 * Leaving with unsaved changes ASKS, on the X and on the Android back button, because losing a set of
 * modifiers to a reflex is the kind of loss that is noticed three fights later.
 */
import { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import Svg, { Polyline } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { PopupDialog } from '@/components/popup-dialog';
import { RuneButton } from '@/components/rune-button';
import { applyPickedOption, EffectPicker, EffectsField, FormulaVarPicker, matchOption, toEditableEffects } from '@/components/effects-editor';
import { DmType, Body, Display, DmRune } from '@/constants/theme';
import { deleteGroup, groupEffects, isGroupOn, setGroupOn } from '@/lib/modifier-groups';
import { type CardEffect, TARGET_LABEL, tierForLevel } from '@/lib/modifiers';
import { playSfx } from '@/lib/sfx';
import { useAndroidBack } from './use-android-back';

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/** What a modifier is worth right now. The DM panel has no live character object, so this reads the
 *  few things a DM's modifier can depend on and says so plainly when it cannot resolve one. */
function resolvedDelta(e: CardEffect, level: number): number | null {
  if (e.byTier) return e.byTier[tierForLevel(level) - 1] ?? 0;
  if (e.dynamic) return null; // a formula reads the sheet, which is not on this screen
  return e.delta ?? 0;
}

function Check({ on, onPress, label }: { on: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={label}>
      <View style={{ width: 22, height: 22, borderRadius: 4, borderWidth: 1.6, borderColor: on ? DmRune.accent : DmRune.line, backgroundColor: on ? DmRune.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {on ? <Svg width={13} height={13} viewBox="0 0 12 12"><Polyline points="2,6 5,9 10,3" fill="none" stroke={DmRune.ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></Svg> : null}
      </View>
    </Pressable>
  );
}

function Row({ e, level, onToggle }: { e: CardEffect; level: number; onToggle: () => void }) {
  const v = resolvedDelta(e, level);
  return (
    <ChamferBox chamfer={7} fill="rgba(20,24,30,0.85)" stroke={DmRune.line} strokeWidth={1.1} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 11, gap: 10, opacity: e.off ? 0.45 : 1 }}>
      <Check on={!e.off} onPress={onToggle} label={`${TARGET_LABEL[e.target]} applied`} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: DmRune.ivory, fontSize: DmType.body, fontFamily: Body.bold }}>{TARGET_LABEL[e.target]}</Text>
        {e.note ? <Text style={{ color: DmRune.muted, fontSize: DmType.micro, fontFamily: Body.regular, marginTop: 1 }}>{e.note}</Text> : null}
      </View>
      <Text style={{ color: e.off ? DmRune.muted : DmRune.accent, fontSize: DmType.title, fontFamily: Display.black }}>{v == null ? 'ƒx' : signed(v)}</Text>
    </ChamferBox>
  );
}

export function DmModifiersPanel({
  title,
  subtitle,
  effects,
  level = 1,
  startEditing,
  onSave,
  onClose,
}: {
  title: string;
  subtitle: string;
  effects: CardEffect[];
  /** The character's level, so a per-tier modifier can show what it is worth. */
  level?: number;
  /** Open straight into the editor (the expanded entry's button) rather than the summary (a hold). */
  startEditing?: boolean;
  onSave: (effects: CardEffect[]) => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(!!startEditing);
  const [draft, setDraft] = useState<CardEffect[]>(() => toEditableEffects(effects));
  const [pick, setPick] = useState<number | null>(null);
  const [pickVar, setPickVar] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [leaving, setLeaving] = useState(false);

  const dirty = useMemo(() => editing && JSON.stringify(draft) !== JSON.stringify(toEditableEffects(effects)), [editing, draft, effects]);
  const save = useCallback(() => { playSfx('buttonTap'); onSave(draft.filter((e) => e.target)); setEditing(false); }, [draft, onSave]);
  const startEdit = useCallback(() => { setDraft(toEditableEffects(effects)); setEditing(true); }, [effects]);
  const leave = useCallback(() => {
    if (dirty) { setLeaving(true); return; }
    if (editing && startEditing) { onClose(); return; }
    if (editing) { setEditing(false); return; }
    onClose();
  }, [dirty, editing, startEditing, onClose]);
  useAndroidBack(() => { leave(); return true; });

  const bands = groupEffects(effects);
  const toggleAt = (index: number) => onSave(effects.map((e, i) => (i === index ? { ...e, off: e.off ? undefined : true } : e)));

  return (
    <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 400, backgroundColor: DmRune.ink }}>
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 54, paddingBottom: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={2} style={{ color: DmRune.ivory, fontSize: DmType.hero, fontFamily: Display.black, letterSpacing: 1.2, textTransform: 'uppercase' }}>{title}</Text>
            <Text style={{ color: DmRune.muted, fontSize: DmType.micro, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 2 }}>{editing ? 'Editing modifiers' : subtitle}</Text>
          </View>
          <Pressable onPress={leave} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={{ color: DmRune.muted, fontSize: 20, fontFamily: Body.bold }}>✕</Text>
          </Pressable>
        </View>

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 9, paddingBottom: 10 }} keyboardShouldPersistTaps="handled">
          {editing ? (
            <EffectsField
              dm
              effects={draft}
              onChange={setDraft}
              onRequestPick={setPick}
              onRequestPickVar={setPickVar}
              collapsed={collapsed}
              onCollapsedChange={setCollapsed}
              preview={(e) => (e.byTier ? resolvedDelta(e, level) : null)}
            />
          ) : effects.length === 0 ? (
            <Text style={{ color: DmRune.muted, fontSize: DmType.body, fontFamily: Body.regular, lineHeight: 19 }}>
              Nothing yet. Add a modifier and it becomes a card on them, which you can switch on and off from here.
            </Text>
          ) : (
            bands.map((band) => {
              if (band.name === null) return band.rows.map((r) => <Row key={r.index} e={r.effect} level={level} onToggle={() => toggleAt(r.index)} />);
              const open = !collapsed.includes(band.name);
              const on = isGroupOn(effects, band.name);
              return (
                <View key={band.name} style={{ borderWidth: 1, borderColor: DmRune.line, borderRadius: 7, padding: 7, gap: 7, backgroundColor: 'rgba(14,17,22,0.5)' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                    <Check on={on} onPress={() => onSave(setGroupOn(effects, band.name!, !on))} label={`${band.name} applied`} />
                    <Pressable
                      onPress={() => setCollapsed((c) => (c.includes(band.name!) ? c.filter((n) => n !== band.name) : [...c, band.name!]))}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: open }}
                      accessibilityLabel={`${band.name}, ${band.rows.length} modifiers`}>
                      <Svg width={11} height={11} viewBox="0 0 16 16" style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
                        <Polyline points="5,3 11,8 5,13" fill="none" stroke={DmRune.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                      </Svg>
                      <Text numberOfLines={1} style={{ flex: 1, color: DmRune.accent, fontSize: DmType.body, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' }}>{band.name}</Text>
                      <Text style={{ color: DmRune.muted, fontSize: DmType.micro, fontFamily: Body.bold }}>{band.rows.length}</Text>
                    </Pressable>
                    <Pressable onPress={() => onSave(deleteGroup(effects, band.name!))} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Delete the group ${band.name}`} style={{ padding: 3 }}>
                      <Text style={{ color: DmRune.red, fontSize: 15, fontFamily: Body.bold }}>✕</Text>
                    </Pressable>
                  </View>
                  {open ? band.rows.map((r) => <Row key={r.index} e={r.effect} level={level} onToggle={() => toggleAt(r.index)} />) : null}
                </View>
              );
            })
          )}
        </ScrollView>

        {editing ? (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <RuneButton label="Cancel" kind="ghost" height={46} dm style={{ flex: 1 }} onPress={leave} />
            <RuneButton label="Save changes" kind="primary" height={46} dm style={{ flex: 1.4 }} onPress={save} />
          </View>
        ) : (
          <RuneButton label="Edit modifiers" kind="secondary" height={46} dm style={{ marginTop: 10 }} onPress={startEdit} />
        )}
      </View>

      {pick != null && draft[pick] ? (
        <EffectPicker
          dm
          current={matchOption(draft[pick])}
          onPick={(o) => { setDraft((d) => d.map((e, j) => (j === pick ? applyPickedOption(e, o) : e))); setPick(null); }}
          onClose={() => setPick(null)}
        />
      ) : null}
      {pickVar != null && draft[pickVar] ? (
        <FormulaVarPicker
          current={draft[pickVar].formula?.variable}
          onPick={(variable) => { setDraft((d) => d.map((e, j) => (j === pickVar ? { ...e, formula: { ...(e.formula ?? { variable }), variable } } : e))); setPickVar(null); }}
          onClose={() => setPickVar(null)}
        />
      ) : null}
      {leaving ? (
        <PopupDialog
          dm
          title="Save your changes?"
          body="You have modifiers you have not saved yet."
          confirmLabel="Save changes"
          cancelLabel="Keep editing"
          onConfirm={() => { setLeaving(false); save(); }}
          onCancel={() => setLeaving(false)}>
          <RuneButton label="Leave without saving" kind="ghost" height={42} dm style={{ marginTop: 12 }} onPress={() => { setLeaving(false); setDraft(toEditableEffects(effects)); if (startEditing) onClose(); else setEditing(false); }} />
        </PopupDialog>
      ) : null}
    </View>
  );
}
