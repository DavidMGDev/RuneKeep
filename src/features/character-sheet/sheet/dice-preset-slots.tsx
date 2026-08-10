/**
 * The three roll presets (v0.41.0, owner) — where Evasion and Armor sit when the tray is shut.
 *
 * The panel does not move: its CONTENTS are swapped. Evasion and the shields go while the dice are
 * out, because neither is any use mid-throw, and three square slots take their place, lined up with
 * Add Card, Add Gear and Favorites above them so the sheet keeps one column rhythm.
 *
 * A slot is either empty (a plus and "Slot 1") or full (its icon, or the first letter of its name, and
 * its name under it). Tapping an empty one asks for a name; tapping a full one deals its dice into the
 * tray one at a time and throws them; holding a full one opens its editor.
 *
 * Everything about what a preset IS lives in `lib/dice-presets`; this is the surface.
 */
import { useCallback, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { PopupDialog } from '@/components/popup-dialog';
import { RuneButton } from '@/components/rune-button';
import { showToast } from '@/components/toast';
import { Body, Display, Rune } from '@/constants/theme';
import { box } from '@/lib/design';
import { type DicePreset, diceSummary, hasModifier, type PresetModifier, PRESET_SLOTS, presetInitial } from '@/lib/dice-presets';
import type { EffectFormula } from '@/lib/modifiers';
import { DimScreen } from '@/lib/screen-dim';
import { playSfx } from '@/lib/sfx';
import type { DieType } from '../components/card-tokens-data';
import { CATEGORY_ICON_KEYS, CategoryIconSvg } from './category-icons';
import { NumberKeypad } from './number-keypad';

/** Lined up with the Add Card / Add Gear / Favorites badges above, inside the Evasion panel. */
const SLOT_X = [181, 259, 337];
const SLOT_Y = 216;
const SLOT_W = 48;
const GOLD = Rune.goldEdge;

/** The variables a preset may carry. `input` is missing on purpose: it belongs to a card, not a roll. */
const PRESET_VARS: { key: EffectFormula['variable']; label: string }[] = [
  { key: 'attackRoll', label: 'Attack Rolls' },
  { key: 'spellcastRoll', label: 'Spellcast Rolls' },
  { key: 'proficiency', label: 'Proficiency' },
  { key: 'level', label: 'Level' },
  { key: 'tier', label: 'Tier' },
  { key: 'spellcast', label: 'Spellcast Trait' },
  { key: 'stress', label: 'Current Stress' },
  { key: 'agility', label: 'Agility' },
  { key: 'strength', label: 'Strength' },
  { key: 'finesse', label: 'Finesse' },
  { key: 'instinct', label: 'Instinct' },
  { key: 'presence', label: 'Presence' },
  { key: 'knowledge', label: 'Knowledge' },
];
const varLabel = (v: EffectFormula['variable'] | undefined) => PRESET_VARS.find((p) => p.key === v)?.label;

// ------------------------------------------------------------------------------------- the slots

function Slot({ index, preset, onPress, onHold }: { index: number; preset: DicePreset | null; onPress: () => void; onHold: () => void }) {
  const label = preset ? preset.name : `Slot ${index + 1}`;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={preset ? onHold : undefined}
      delayLongPress={380}
      accessibilityRole="button"
      accessibilityLabel={preset ? `${preset.name}. ${diceSummary(preset.dice)}. Tap to roll, hold to edit.` : `Empty preset, slot ${index + 1}. Tap to save the dice you have out.`}
      style={({ pressed }) => [box(SLOT_X[index], SLOT_Y, SLOT_W, 62), { opacity: pressed ? 0.66 : 1 }]}>
      <ChamferBox
        chamfer={9}
        fill={preset ? 'rgba(218,162,73,0.14)' : 'transparent'}
        stroke={preset ? Rune.goldBright : 'rgba(218,162,73,0.5)'}
        strokeWidth={preset ? 1.6 : 1.2}
        style={{ width: SLOT_W, height: SLOT_W, alignItems: 'center', justifyContent: 'center' }}>
        {!preset ? (
          <Svg width={20} height={20} viewBox="0 0 20 20">
            <Line x1={10} y1={3} x2={10} y2={17} stroke={GOLD} strokeWidth={2.2} strokeLinecap="round" />
            <Line x1={3} y1={10} x2={17} y2={10} stroke={GOLD} strokeWidth={2.2} strokeLinecap="round" />
          </Svg>
        ) : preset.icon ? (
          <CategoryIconSvg iconKey={preset.icon} size={26} />
        ) : (
          <Text style={{ color: Rune.goldText, fontSize: 24, fontFamily: Display.black }}>{presetInitial(preset.name)}</Text>
        )}
      </ChamferBox>
      {/* The name shrinks to fit rather than truncating: a preset you cannot read is a preset you
          cannot tell from the one beside it. */}
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        style={{ width: SLOT_W, marginTop: 3, textAlign: 'center', color: preset ? Rune.goldText : Rune.bronze, fontSize: 8.5, lineHeight: 11, fontFamily: Body.bold, letterSpacing: 0.4, textTransform: 'uppercase' }}>
        {label}
      </Text>
    </Pressable>
  );
}

// ----------------------------------------------------------------------------------- the editor

function IconPicker({ current, onPick, onClose }: { current?: string; onPick: (k: string | undefined) => void; onClose: () => void }) {
  return (
    <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 10004, alignItems: 'center', justifyContent: 'center' }}>
      <Pressable style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(6,8,13,0.9)' }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <DimScreen opacity={0.9} />
      <ChamferBox chamfer={14} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} style={{ width: 300, padding: 16 }}>
        <Text style={{ color: Rune.goldText, fontSize: 17, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>Pick an icon</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Pressable onPress={() => onPick(undefined)} accessibilityRole="button" accessibilityLabel="No icon, use the first letter">
            <ChamferBox chamfer={6} fill={!current ? Rune.red : 'rgba(20,24,31,0.8)'} stroke={Rune.goldEdge} strokeWidth={1.1} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: Rune.sheet, fontSize: 17, fontFamily: Display.black }}>A</Text>
            </ChamferBox>
          </Pressable>
          {CATEGORY_ICON_KEYS.map((k) => (
            <Pressable key={k} onPress={() => onPick(k)} accessibilityRole="button" accessibilityLabel={k}>
              <ChamferBox chamfer={6} fill={current === k ? Rune.red : 'rgba(20,24,31,0.8)'} stroke={Rune.goldEdge} strokeWidth={1.1} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                <CategoryIconSvg iconKey={k} size={22} />
              </ChamferBox>
            </Pressable>
          ))}
        </View>
      </ChamferBox>
    </View>
  );
}

function VariablePicker({ current, onPick, onClose }: { current?: EffectFormula['variable']; onPick: (v: EffectFormula['variable'] | undefined) => void; onClose: () => void }) {
  return (
    <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 10004, alignItems: 'center', justifyContent: 'center' }}>
      <Pressable style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(6,8,13,0.9)' }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <DimScreen opacity={0.9} />
      <ChamferBox chamfer={14} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} style={{ width: 300, maxHeight: '80%', padding: 16 }}>
        <Text style={{ color: Rune.goldText, fontSize: 17, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>Add a variable</Text>
        <Text style={{ color: Rune.muted, fontSize: 11, fontFamily: Body.medium, lineHeight: 16, marginBottom: 10 }}>
          Worked out when you roll, so it keeps up with the cards you have equipped.
        </Text>
        <View style={{ gap: 6 }}>
          <Pressable onPress={() => onPick(undefined)} accessibilityRole="button" accessibilityLabel="No variable">
            <View style={{ paddingVertical: 9, paddingHorizontal: 12, borderRadius: 5, backgroundColor: !current ? Rune.red : 'rgba(20,24,31,0.7)', borderWidth: 1, borderColor: 'rgba(218,162,73,0.4)' }}>
              <Text style={{ color: Rune.sheet, fontSize: 13, fontFamily: Body.bold }}>No variable</Text>
            </View>
          </Pressable>
          {PRESET_VARS.map((v) => (
            <Pressable key={v.key} onPress={() => onPick(v.key)} accessibilityRole="button" accessibilityLabel={v.label}>
              <View style={{ paddingVertical: 9, paddingHorizontal: 12, borderRadius: 5, backgroundColor: current === v.key ? Rune.red : 'rgba(20,24,31,0.7)', borderWidth: 1, borderColor: 'rgba(218,162,73,0.4)' }}>
                <Text style={{ color: Rune.sheet, fontSize: 13, fontFamily: Body.bold }}>{v.label}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </ChamferBox>
    </View>
  );
}

export interface PresetDraft { name: string; icon?: string; modifier?: PresetModifier }

/**
 * Naming a preset, and everything else about it.
 *
 * The modifier is deliberately behind a button rather than always on screen: most presets are a
 * handful of dice and nothing else, and a keypad sitting in the dialog would make the common case
 * look like it had a decision in it. Same for the variable.
 */
function PresetEditor({ title, initial, dice, onSave, onDelete, onUpdateDice, onCancel }: {
  title: string;
  initial: PresetDraft;
  /** What the preset holds, or what it would hold if saved now. */
  dice: DieType[];
  onSave: (d: PresetDraft) => void;
  /** Only for an existing preset. */
  onDelete?: () => void;
  /** Only for an existing preset: take the dice that are in the tray right now. */
  onUpdateDice?: () => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<PresetDraft>(initial);
  const [pickIcon, setPickIcon] = useState(false);
  const [pickVar, setPickVar] = useState(false);
  const [keypad, setKeypad] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const mod = draft.modifier;

  if (confirmDelete && onDelete) {
    return (
      <PopupDialog
        title={`Delete ${draft.name || 'this preset'}?`}
        body="The slot goes back to empty. The dice themselves are not going anywhere."
        confirmLabel="Delete"
        cancelLabel="Keep it"
        destructive
        onConfirm={onDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    );
  }

  return (
    <>
      <PopupDialog
        title={title}
        body={diceSummary(dice)}
        confirmLabel="Save preset"
        cancelLabel="Cancel"
        onConfirm={() => onSave({ ...draft, name: draft.name.trim() || 'Preset' })}
        onCancel={onCancel}>
        <View style={{ marginTop: 14, gap: 10 }}>
          <ChamferBox chamfer={7} fill="rgba(14,17,22,0.96)" stroke="rgba(218,162,73,0.5)" strokeWidth={1.2} style={{ height: 44, justifyContent: 'center', paddingHorizontal: 12 }}>
            <TextInput
              value={draft.name}
              onChangeText={(name) => setDraft((d) => ({ ...d, name }))}
              autoFocus={!initial.name}
              placeholder="Name it"
              placeholderTextColor={Rune.muted}
              selectionColor={Rune.goldBright}
              maxLength={22}
              style={{ color: Rune.sheet, fontSize: 15, fontFamily: Body.semibold, padding: 0 }}
              accessibilityLabel="Preset name"
            />
          </ChamferBox>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={() => setPickIcon(true)} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel="Choose an icon">
              <ChamferBox chamfer={7} fill="rgba(20,24,31,0.8)" stroke="rgba(218,162,73,0.45)" strokeWidth={1.1} style={{ height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {draft.icon ? <CategoryIconSvg iconKey={draft.icon} size={20} /> : <Text style={{ color: Rune.goldText, fontSize: 17, fontFamily: Display.black }}>{presetInitial(draft.name || 'P')}</Text>}
                <Text style={{ color: Rune.muted, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>Icon</Text>
              </ChamferBox>
            </Pressable>
            <Pressable onPress={() => setKeypad(true)} style={{ flex: 1.2 }} accessibilityRole="button" accessibilityLabel="Set a modifier">
              <ChamferBox chamfer={7} fill="rgba(20,24,31,0.8)" stroke="rgba(218,162,73,0.45)" strokeWidth={1.1} style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Text numberOfLines={1} style={{ color: hasModifier(mod) ? Rune.goldText : Rune.muted, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                  {hasModifier(mod) ? `${mod!.value >= 0 ? '+' : ''}${mod!.value}${mod!.variable ? ` + ${varLabel(mod!.variable)}` : ''}` : '+ Modifier'}
                </Text>
              </ChamferBox>
            </Pressable>
          </View>

          {hasModifier(mod) ? (
            <Pressable onPress={() => setPickVar(true)} accessibilityRole="button" accessibilityLabel="Add a variable to the modifier">
              <Text style={{ color: Rune.goldText, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase', textAlign: 'center' }}>
                {mod?.variable ? `Variable: ${varLabel(mod.variable)}` : '+ Add a variable'}
              </Text>
            </Pressable>
          ) : null}

          {onUpdateDice || onDelete ? (
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
              {onUpdateDice ? <RuneButton label="Update dice" kind="secondary" dense height={38} style={{ flex: 1 }} onPress={onUpdateDice} /> : null}
              {onDelete ? <RuneButton label="Delete" kind="ghost" dense height={38} style={{ flex: 1 }} onPress={() => setConfirmDelete(true)} /> : null}
            </View>
          ) : null}
        </View>
      </PopupDialog>
      {pickIcon ? <IconPicker current={draft.icon} onPick={(icon) => { setDraft((d) => ({ ...d, icon })); setPickIcon(false); }} onClose={() => setPickIcon(false)} /> : null}
      {pickVar ? <VariablePicker current={mod?.variable} onPick={(variable) => { setDraft((d) => ({ ...d, modifier: { value: d.modifier?.value ?? 0, variable } })); setPickVar(false); }} onClose={() => setPickVar(false)} /> : null}
      {keypad ? (
        <NumberKeypad
          title="Roll modifier"
          subtitle="Added after every die. Use + and - for a penalty."
          min={-20}
          max={20}
          initial={mod?.value ?? 0}
          onSubmit={(value) => { setDraft((d) => ({ ...d, modifier: { value, variable: d.modifier?.variable } })); setKeypad(false); }}
          onClose={() => setKeypad(false)}
        />
      ) : null}
    </>
  );
}

// ------------------------------------------------------------------------------------- the panel

export function DicePresetSlots({ presets, trayDice, onWrite, onPlay }: {
  presets: (DicePreset | null)[];
  /**
   * What is in the tray right now, ASKED FOR when it is needed (v0.41.0).
   *
   * A function rather than a value: the pool lives inside the tray, so the sheet does not re-render
   * when a die is picked up, and a snapshot taken at the sheet's last render is empty however many
   * dice are on the table. Reading it at the moment of the tap is the only thing that can be right.
   */
  trayDice: () => DieType[];
  onWrite: (slot: number, preset: DicePreset | null) => void;
  onPlay: (preset: DicePreset) => void;
}) {
  const [editing, setEditing] = useState<{ slot: number; existing: DicePreset | null; dice: DieType[] } | null>(null);
  const [empty, setEmpty] = useState(false);

  const tap = useCallback((slot: number) => {
    playSfx('buttonTap');
    const existing = presets[slot];
    if (existing) { onPlay(existing); return; }
    // An empty slot saves what is in the tray, so there has to be something in it.
    if (trayDice().length === 0) { setEmpty(true); return; }
    setEditing({ slot, existing: null, dice: trayDice() });
  }, [presets, trayDice, onPlay]);

  const hold = useCallback((slot: number) => {
    playSfx('cardSelect');
    setEditing({ slot, existing: presets[slot], dice: presets[slot]?.dice ?? trayDice() });
  }, [presets, trayDice]);

  return (
    <>
      {[0, 1, 2].slice(0, PRESET_SLOTS).map((i) => (
        <Slot key={i} index={i} preset={presets[i] ?? null} onPress={() => tap(i)} onHold={() => hold(i)} />
      ))}

      {empty ? (
        <PopupDialog
          title="Nothing to save yet"
          body="A preset remembers the dice you have out. Pick some up from the carousel first, then tap this slot again."
          confirmLabel="Got it"
          cancelLabel="Got it"
          onConfirm={() => setEmpty(false)}
          onCancel={() => setEmpty(false)}
        />
      ) : null}

      {editing ? (
        <PresetEditor
          title={editing.existing ? 'Edit preset' : `Save to slot ${editing.slot + 1}`}
          initial={{ name: editing.existing?.name ?? '', icon: editing.existing?.icon, modifier: editing.existing?.modifier }}
          dice={editing.dice}
          onSave={(d) => {
            onWrite(editing.slot, {
              id: editing.existing?.id ?? `rp-${Date.now().toString(36)}`,
              name: d.name,
              icon: d.icon,
              dice: editing.dice,
              modifier: hasModifier(d.modifier) ? d.modifier : undefined,
            });
            setEditing(null);
            showToast(`${d.name} saved to slot ${editing.slot + 1}`, 'success');
          }}
          onDelete={editing.existing ? () => { onWrite(editing.slot, null); setEditing(null); } : undefined}
          onUpdateDice={
            editing.existing
              ? () => {
                  const now = trayDice();
                  if (now.length === 0) { showToast('Put some dice in the tray first'); return; }
                  onWrite(editing.slot, { ...editing.existing!, dice: now });
                  setEditing(null);
                  showToast('Preset now holds the dice you have out', 'success');
                }
              : undefined
          }
          onCancel={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}
