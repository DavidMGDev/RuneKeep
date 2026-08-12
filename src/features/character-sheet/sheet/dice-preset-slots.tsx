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
import { ScrollView } from 'react-native-gesture-handler';
import Svg, { Line } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { Overlay } from '@/components/overlay-host';
import { PopupDialog } from '@/components/popup-dialog';
import { RuneButton } from '@/components/rune-button';
import { showToast } from '@/components/toast';
import { Body, Display, Rune } from '@/constants/theme';
import { box } from '@/lib/design';
import { fitText } from '@/lib/fit-text';
import { addFunctionKey, addVariable, type DicePreset, diceSummary, hasModifier, modifierFunctionKeys, modifierVariables, type PresetModifier, PRESET_SLOTS, presetInitial, removeFunctionKey, removeVariable } from '@/lib/dice-presets';
import type { FunctionVar } from '@/lib/function-vars';
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
/**
 * The band the NAME is typeset into (v0.41.1, owner).
 *
 * Wider than the slot, because the slots are 78 apart and only 48 of that is the tile, so there is
 * room either side that a name may lean into. Three lines tall, which is everything left between the
 * tile and the bottom of the Evasion panel it all sits inside.
 */
const NAME_W = 72;
const NAME_H = 27;
/** An uppercase bold glyph as a fraction of its size, biased high so a name comes out small, not cut. */
const NAME_CHAR_RATIO = 0.68;
const GOLD = Rune.goldEdge;

/** The variables a preset may carry. `input` is missing on purpose: it belongs to a card, not a roll. */
const PRESET_VARS: { key: EffectFormula['variable']; label: string }[] = [
  { key: 'attackRoll', label: 'Attack Rolls' },
  { key: 'damageRoll', label: 'Damage Rolls' },
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

/**
 * What the modifier button says.
 *
 * A flat zero is not printed (v0.41.1): "+0 + Attack Rolls" reads like a mistake, and a variable with
 * no flat part alongside it is now a normal thing to want. v0.42.0 reads out EVERY variable, because a
 * preset may carry as many as the player wants and a button that showed only the first would lie.
 */
const modLabel = (mod: PresetModifier | undefined, cardVars?: FunctionVar[]): string => {
  if (!hasModifier(mod)) return '+ Modifier';
  const flat = mod!.value !== 0 ? `${mod!.value > 0 ? '+' : ''}${mod!.value}` : null;
  // v0.42.3: a card element reads out by its own name, which is why every element has to have one.
  const cards = modifierFunctionKeys(mod).map((k) => cardVars?.find((v) => v.key === k)?.title ?? 'Card element');
  return [flat, ...modifierVariables(mod).map((v) => varLabel(v)), ...cards].filter(Boolean).join(' + ');
};

// ------------------------------------------------------------------------------------- the slots

function Slot({ index, preset, onPress, onHold }: { index: number; preset: DicePreset | null; onPress: () => void; onHold: () => void }) {
  const label = preset ? preset.name : `Slot ${index + 1}`;
  const fit = fitText(label.toUpperCase(), { width: NAME_W, height: NAME_H, base: 8.5, lineRatio: 1.2, min: 5, charRatio: NAME_CHAR_RATIO });
  return (
    <Pressable
      onPress={onPress}
      onLongPress={preset ? onHold : undefined}
      delayLongPress={380}
      accessibilityRole="button"
      accessibilityLabel={preset ? `${preset.name}. ${diceSummary(preset.dice)}. Tap to roll, hold to edit.` : `Empty preset, slot ${index + 1}. Tap to save the dice you have out.`}
      style={({ pressed }) => [box(SLOT_X[index], SLOT_Y, SLOT_W, SLOT_W + 3 + NAME_H), { opacity: pressed ? 0.66 : 1 }]}>
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
      {/**
        * The name in FULL, however long it is (v0.41.1, owner: "right now only 1 small word fits").
        *
        * Two things were stopping it. `adjustsFontSizeToFit` does nothing on react-native-web, so the
        * browser drew every name at 8.5 and cut it, and `numberOfLines={1}` meant even a phone had one
        * line of a 48 wide slot to work with, which is about seven characters.
        *
        * So the size is chosen by arithmetic instead (the same `fitText` the forged cards use, for the
        * same reason), and the name is given a band WIDER than the slot it belongs to, reaching into
        * the gaps on either side, over three lines. Five words fit at a readable size; a longer one
        * keeps stepping down rather than ever being cut.
        */}
      <Text
        style={{
          position: 'absolute', left: (SLOT_W - NAME_W) / 2, top: SLOT_W + 3, width: NAME_W, height: NAME_H,
          textAlign: 'center', color: preset ? Rune.goldText : Rune.bronze,
          fontSize: fit.fontSize, lineHeight: fit.lineHeight, fontFamily: Body.bold, letterSpacing: 0.4, textTransform: 'uppercase',
        }}>
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

function VariablePicker({ chosen, chosenKeys, cardVars, onPick, onPickCard, onClose }: {
  chosen: EffectFormula['variable'][];
  /** v0.42.3: the card elements already added, by `cardId|functionId`. */
  chosenKeys: string[];
  /** v0.42.3: the character's numeric card elements. See `lib/function-vars`. */
  cardVars: FunctionVar[];
  onPick: (v: EffectFormula['variable']) => void;
  onPickCard: (key: string) => void;
  onClose: () => void;
}) {
  return (
    <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 10004, alignItems: 'center', justifyContent: 'center' }}>
      <Pressable style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(6,8,13,0.9)' }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <DimScreen opacity={0.9} />
      <ChamferBox chamfer={14} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} style={{ width: 300, maxHeight: '80%', padding: 16 }}>
        <Text style={{ color: Rune.goldText, fontSize: 17, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>Add a variable</Text>
        <Text style={{ color: Rune.muted, fontSize: 11, fontFamily: Body.medium, lineHeight: 16, marginBottom: 10 }}>
          Worked out when you roll, so it keeps up with the cards you have equipped. Add as many as you need.
        </Text>
        <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator contentContainerStyle={{ gap: 6, paddingBottom: 4 }}>
          {PRESET_VARS.map((v) => {
            const on = chosen.includes(v.key);
            return (
              <Pressable key={v.key} onPress={() => onPick(v.key)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={v.label}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 5, backgroundColor: on ? Rune.red : 'rgba(20,24,31,0.7)', borderWidth: 1, borderColor: 'rgba(218,162,73,0.4)' }}>
                  <Text style={{ flex: 1, color: Rune.sheet, fontSize: 13, fontFamily: Body.bold }}>{v.label}</Text>
                  {on ? <Text style={{ color: Rune.sheet, fontSize: 10, fontFamily: Body.bold, letterSpacing: 0.8 }}>ADDED</Text> : null}
                </View>
              </Pressable>
            );
          })}
          {/**
            * THE CHARACTER'S OWN CARD ELEMENTS (v0.42.3, owner).
            *
            * A Combo Die is a number the player is already keeping, and until now the tray could not
            * roll with it. Only the NUMERIC ones are here: a text field is not a number, and neither
            * is a cycle of words. `lib/function-vars` decides which, once, for this list and the
            * modifier formulas both.
            */}
          {cardVars.length ? (
            <>
              <Text style={{ color: Rune.bronze, fontSize: 10, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 8, marginBottom: 2 }}>From your cards</Text>
              {cardVars.map((v) => {
                const on = chosenKeys.includes(v.key);
                return (
                  <Pressable key={v.key} onPress={() => onPickCard(v.key)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${v.title} on ${v.cardTitle}`}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 5, backgroundColor: on ? Rune.red : 'rgba(20,24,31,0.7)', borderWidth: 1, borderColor: 'rgba(218,162,73,0.4)' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: Rune.sheet, fontSize: 13, fontFamily: Body.bold }}>{v.title}</Text>
                        <Text style={{ color: on ? Rune.sheet : Rune.muted, fontSize: 10, fontFamily: Body.regular, marginTop: 1 }}>On {v.cardTitle}. Currently {v.value}.</Text>
                      </View>
                      {on ? <Text style={{ color: Rune.sheet, fontSize: 10, fontFamily: Body.bold, letterSpacing: 0.8 }}>ADDED</Text> : null}
                    </View>
                  </Pressable>
                );
              })}
            </>
          ) : null}
        </ScrollView>
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
function PresetEditor({ title, initial, dice, cardVars, onSave, onDelete, onUpdateDice, onCancel }: {
  title: string;
  initial: PresetDraft;
  /** v0.42.3: the character's numeric card elements, offered alongside the sheet variables. */
  cardVars?: FunctionVar[];
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
  const chosenVars = modifierVariables(mod);

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
        actionsGap={10}
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
              maxLength={40}
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
                  {modLabel(mod, cardVars)}
                </Text>
              </ChamferBox>
            </Pressable>
          </View>

          {/* Every variable the preset carries, each removable, and the ADD control never goes away
              (v0.42.0, owner: "never hiding the + Add Variable text-button which means that the user
              can keep adding variables"). v0.41.1 had already stopped hiding it behind a non-zero
              keypad; what was left was that choosing one replaced it. */}
          {chosenVars.length ? (
            <View style={{ gap: 6 }}>
              {chosenVars.map((v) => (
                <View key={v} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ flex: 1, color: Rune.goldText, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>{varLabel(v)}</Text>
                  <Pressable onPress={() => setDraft((d) => ({ ...d, modifier: removeVariable(d.modifier, v) }))} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${varLabel(v)}`}>
                    <Svg width={13} height={13} viewBox="0 0 16 16"><Line x1={3} y1={3} x2={13} y2={13} stroke={Rune.red} strokeWidth={2} /><Line x1={13} y1={3} x2={3} y2={13} stroke={Rune.red} strokeWidth={2} /></Svg>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
          <Pressable onPress={() => setPickVar(true)} accessibilityRole="button" accessibilityLabel="Add a variable to the modifier">
            <Text style={{ color: Rune.goldText, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase', textAlign: 'center' }}>
              + Add a variable
            </Text>
          </Pressable>

          {/* Delete sits on the LEFT, over Cancel, so the two ways out of this dialog are one column
              and Update dice is over Save preset (owner, v0.41.1). */}
          {onUpdateDice || onDelete ? (
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
              {onDelete ? <RuneButton label="Delete" kind="ghost" dense height={38} style={{ flex: 1 }} onPress={() => setConfirmDelete(true)} /> : null}
              {onUpdateDice ? <RuneButton label="Update dice" kind="secondary" dense height={38} style={{ flex: 1 }} onPress={onUpdateDice} /> : null}
            </View>
          ) : null}
        </View>
      </PopupDialog>
      {pickIcon ? <IconPicker current={draft.icon} onPick={(icon) => { setDraft((d) => ({ ...d, icon })); setPickIcon(false); }} onClose={() => setPickIcon(false)} /> : null}
      {pickVar ? (
        <VariablePicker
          chosen={chosenVars}
          chosenKeys={modifierFunctionKeys(mod)}
          cardVars={cardVars ?? []}
          onPick={(variable) => setDraft((d) => ({ ...d, modifier: modifierVariables(d.modifier).includes(variable) ? removeVariable(d.modifier, variable) : addVariable(d.modifier, variable) }))}
          onPickCard={(key) => setDraft((d) => ({ ...d, modifier: modifierFunctionKeys(d.modifier).includes(key) ? removeFunctionKey(d.modifier, key) : addFunctionKey(d.modifier, key) }))}
          onClose={() => setPickVar(false)}
        />
      ) : null}
      {keypad ? (
        <NumberKeypad
          title="Roll modifier"
          subtitle="Added after every die. Use + and - for a penalty."
          min={-20}
          max={20}
          initial={mod?.value ?? 0}
          onSubmit={(value) => { setDraft((d) => ({ ...d, modifier: { ...d.modifier, value, variables: modifierVariables(d.modifier) } })); setKeypad(false); }}
          onClose={() => setKeypad(false)}
        />
      ) : null}
    </>
  );
}

// ------------------------------------------------------------------------------------- the panel

export function DicePresetSlots({ presets, trayDice, cardVars, onWrite, onPlay }: {
  /** v0.42.3: the character's numeric card elements, so a preset can carry "+ Combo Die". */
  cardVars?: FunctionVar[];
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

      {/* Drawn at the sheet's root rather than here (v0.41.2, owner): a dialog written inside the
          DesignStage dims only the scaled design box, which on a phone leaves the parchment showing
          above and below it. See `components/overlay-host`. */}
      {empty ? (
        <Overlay><PopupDialog
          title="Nothing to save yet"
          body="A preset remembers the dice you have out. Pick some up from the carousel first, then tap this slot again."
          confirmLabel="Got it"
          cancelLabel="Got it"
          onConfirm={() => setEmpty(false)}
          onCancel={() => setEmpty(false)}
        /></Overlay>
      ) : null}

      {editing ? (
        <Overlay><PresetEditor
          title={editing.existing ? 'Edit preset' : `Save to slot ${editing.slot + 1}`}
          initial={{ name: editing.existing?.name ?? '', icon: editing.existing?.icon, modifier: editing.existing?.modifier }}
          dice={editing.dice}
          cardVars={cardVars}
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
        /></Overlay>
      ) : null}
    </>
  );
}
