/**
 * Modifiers on desktop (v0.50.0, owner: "fully dimming the screen and having very detailed controls that give the
 * same functionality that is available on mobile but adapted to desktop"). The phone's two steps, read then edit,
 * are one view here: every modifier with what it comes to right now on the left, all of the picked one's settings
 * open on the right. Used by a card on the sheet and, with a DM's powers, by the DM's panels.
 */
import { type ReactNode, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { DeskDialog } from '@/components/desk-dialog';
import { applyPickedOption, effectGroups, effectLabel, FORMULA_VARS, isSetEffect, matchOption, toEditableEffects, VAR_HINT, VAR_LABEL, type ExperienceRef } from '@/components/effects-editor';
import { PopupDialog } from '@/components/popup-dialog';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, Rune } from '@/constants/theme';
import { amountText, type EffectShape, LIMIT, type Limit, shapeOf, withShape, within } from '@/lib/effect-shape';
import type { FunctionVar } from '@/lib/function-vars';
import { deleteGroup, groupEffects, groupNames, isGroupOn, moveToGroup, renameGroup, setGroupOn } from '@/lib/modifier-groups';
import { type CardEffect, type EffectFormula, tierForLevel } from '@/lib/modifiers';
import { playSfx } from '@/lib/sfx';

const LINE = 'rgba(218,162,73,0.3)';
const WELL = 'rgba(20,24,31,0.7)';
const NEG = '#E2705A';

const CAPTION = { color: Rune.goldText, fontSize: 11.5, fontFamily: Body.bold, letterSpacing: 1.1, textTransform: 'uppercase' } as const;
const HELP = { color: Rune.muted, fontSize: 12.5, lineHeight: 18, fontFamily: Body.medium } as const;

function Choice({ label, on, onPress, width }: { label: string; on: boolean; onPress: () => void; width?: number }) {
  return (
    <Pressable onPress={() => { playSfx('cardSelect', { volume: 0.4 }); onPress(); }} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={label}>
      {({ hovered }: { hovered?: boolean }) => (
        <ChamferBox chamfer={6} fill={on ? Rune.red : hovered ? 'rgba(224,181,99,0.12)' : WELL} stroke={on ? Rune.red : hovered ? Rune.goldBright : 'rgba(218,162,73,0.36)'} strokeWidth={1.1}
          style={{ minHeight: 32, width, paddingHorizontal: 11, paddingVertical: 6, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: on ? Rune.ivory : Rune.sheet, fontSize: 12.5, fontFamily: Body.bold }}>{label}</Text>
        </ChamferBox>
      )}
    </Pressable>
  );
}

function Tick({ on, onPress, label }: { on: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable onPress={() => { playSfx(on ? 'cardDisable' : 'cardEnable', { volume: 0.5 }); onPress(); }} hitSlop={6} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={label}>
      <ChamferBox chamfer={4} fill={on ? Rune.goldBright : 'transparent'} stroke={on ? Rune.goldBright : 'rgba(218,162,73,0.5)'} strokeWidth={1.3} style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
        {on ? <Svg width={12} height={12} viewBox="0 0 12 12"><Polyline points="2,6 5,9 10,3" fill="none" stroke={Rune.ink} strokeWidth={2.2} /></Svg> : null}
      </ChamferBox>
    </Pressable>
  );
}

function Switch({ label, help, on, onPress }: { label: string; help: string; on: boolean; onPress: () => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <Tick on={on} onPress={onPress} label={label} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: on ? Rune.goldBright : Rune.sheet, fontSize: 14, fontFamily: Body.bold }}>{label}</Text>
        <Text style={HELP}>{help}</Text>
      </View>
    </View>
  );
}

/** A number to type or step. What is typed stands while it is in range, and is pulled into it on the way out. */
export function NumberBox({ label, value, limit, onChange }: { label: string; value: number; limit: Limit; onChange: (n: number) => void }) {
  const [typed, setTyped] = useState<string | null>(null);
  const [lo, hi] = limit;
  const type = (t: string) => {
    const clean = t.replace('−', '-').replace(/[^0-9-]/g, '').slice(0, 3);
    setTyped(clean);
    if (/^-?\d+$/.test(clean) && +clean >= lo && +clean <= hi) onChange(+clean);
  };
  const leave = () => {
    if (typed !== null && /^-?\d+$/.test(typed)) onChange(within(+typed, limit));
    setTyped(null);
  };
  const step = (d: number) => { playSfx('numpadPress', { volume: 0.5 }); setTyped(null); onChange(within(value + d, limit)); };
  const button = (d: number) => {
    const dead = d < 0 ? value <= lo : value >= hi;
    return (
      <Pressable onPress={dead ? undefined : () => step(d)} disabled={dead} accessibilityRole="button" accessibilityLabel={`${d < 0 ? 'Lower' : 'Raise'} ${label.toLowerCase()}`}>
        {({ hovered }: { hovered?: boolean }) => (
          <View style={{ width: 34, height: 40, alignItems: 'center', justifyContent: 'center', opacity: dead ? 0.3 : 1, backgroundColor: hovered && !dead ? 'rgba(224,181,99,0.12)' : 'transparent' }}>
            <Text style={{ color: Rune.goldText, fontSize: 19, fontFamily: Display.bold }}>{d < 0 ? '−' : '+'}</Text>
          </View>
        )}
      </Pressable>
    );
  };
  return (
    <View style={{ gap: 5 }}>
      <Text style={[HELP, { fontSize: 12 }]}>{label}</Text>
      <ChamferBox chamfer={7} fill={WELL} stroke="rgba(218,162,73,0.45)" strokeWidth={1.1} style={{ width: 128, height: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 3 }}>
        {button(-1)}
        <TextInput value={typed ?? String(value)} onChangeText={type} onBlur={leave} selectTextOnFocus accessibilityLabel={label}
          style={{ width: 48, textAlign: 'center', color: Rune.goldBright, fontSize: 17, fontFamily: Display.black, padding: 0, outlineStyle: 'none' } as object} />
        {button(1)}
      </ChamferBox>
    </View>
  );
}

function GroupName({ initial = '', taken, verb, onSave, onCancel }: { initial?: string; taken: string[]; verb: string; onSave: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial);
  const clash = name.trim() !== initial && taken.includes(name.trim());
  const ok = !!name.trim() && !clash;
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ChamferBox chamfer={6} fill={WELL} stroke="rgba(218,162,73,0.45)" strokeWidth={1.1} style={{ flex: 1, height: 36, justifyContent: 'center', paddingHorizontal: 10 }}>
          <TextInput value={name} onChangeText={setName} autoFocus maxLength={24} placeholder="Group name" placeholderTextColor={Rune.muted} accessibilityLabel="Group name" onSubmitEditing={() => { if (ok) onSave(name.trim()); }}
            style={{ color: Rune.sheet, fontSize: 14, fontFamily: Body.semibold, padding: 0, outlineStyle: 'none' } as object} />
        </ChamferBox>
        <RuneButton label={verb} kind="secondary" dense height={36} disabled={!ok} onPress={() => onSave(name.trim())} />
        <RuneButton label="Cancel" kind="ghost" dense height={36} onPress={onCancel} />
      </View>
      {clash ? <Text style={[HELP, { color: NEG }]}>There is already a group with that name.</Text> : null}
    </View>
  );
}

interface DeskModifiersProps {
  title: string;
  subtitle: string;
  effects: CardEffect[];
  level: number;
  /** A DM's panel: a switch on each modifier and group, new groups, and the Level modifier. */
  dm?: boolean;
  canEdit?: boolean;
  experiences?: ExperienceRef[];
  functionVars?: FunctionVar[];
  /** What one comes to right now; null where there is no sheet to read it from. */
  resolve: (e: CardEffect) => number | null;
  collapsed: string[];
  onCollapsed: (names: string[]) => void;
  /** The card and what can be done to it. `guard` asks first when changes are waiting. */
  aside?: (guard: (go: () => void) => void) => ReactNode;
  onSave: (effects: CardEffect[]) => void;
  onClose: () => void;
}

const SHAPES: [EffectShape, string][] = [['flat', 'Fixed'], ['formula', 'Formula'], ['byTier', 'By tier']];

export function DeskModifiers({ title, subtitle, effects, level, dm, canEdit = true, experiences, functionVars, resolve, collapsed, onCollapsed, aside, onSave, onClose }: DeskModifiersProps) {
  const win = useWindowDimensions();
  const saved = toEditableEffects(effects);
  const [draft, setDraft] = useState<CardEffect[] | null>(null);
  const list = draft ?? saved;
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(saved);
  const [picked, setPicked] = useState(0);
  const at = Math.min(picked, list.length - 1);
  const sel = canEdit && at >= 0 ? list[at] : undefined;
  const [leaving, setLeaving] = useState<{ go: () => void } | null>(null);
  /** A group being named: `from` is the one renamed; none is a new one, for the picked modifier to go in. */
  const [naming, setNaming] = useState<{ from?: string } | null>(null);

  const change = (next: CardEffect[]) => setDraft(next);
  const setSel = (next: CardEffect) => change(list.map((e, i) => (i === at ? next : e)));
  const save = () => { if (draft) onSave(draft); setDraft(null); playSfx('buttonTap'); };
  const guard = (go: () => void) => { if (dirty) setLeaving({ go }); else go(); };
  const groups = groupNames(list);
  const add = (group?: string) => {
    playSfx('cardSelect', { volume: 0.5 });
    change([...list, { target: 'maxHp', delta: 1, ...(group ? { group } : {}) }]);
    setPicked(list.length);
    if (group && collapsed.includes(group)) onCollapsed(collapsed.filter((n) => n !== group));
  };

  const variableName = (f?: EffectFormula) =>
    f?.variable === 'function' ? functionVars?.find((v) => v.key === f.functionKey)?.title ?? VAR_LABEL.function : VAR_LABEL[f?.variable ?? 'level'];
  const worth = (e: CardEffect): string => {
    if (e.target === 'scar') return '1';
    const v = resolve(e);
    if (v === null) return 'ƒx';
    return isSetEffect(e) || e.overwrite ? `= ${v}` : v >= 0 ? `+${v}` : `−${Math.abs(v)}`;
  };

  const row = (e: CardEffect, i: number) => {
    const on = canEdit && i === at;
    const v = worth(e);
    const notes = [
      amountText(e, variableName(e.formula)),
      e.permanent ? 'permanent' : '',
      e.overwrite ? 'replaces the stat' : isSetEffect(e) ? 'sets the threshold' : '',
      e.off ? (dm ? 'switched off' : 'switched off by your DM') : '',
    ].filter(Boolean).join(', ');
    return (
      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {dm ? <Tick on={!e.off} label={`${effectLabel(e, experiences)} applied`} onPress={() => change(list.map((x, j) => (j === i ? { ...x, off: x.off ? undefined : true } : x)))} /> : null}
        <Pressable style={{ flex: 1 }} disabled={!canEdit} onPress={() => setPicked(i)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${effectLabel(e, experiences)}, ${v}. ${notes}`}>
          {({ hovered }: { hovered?: boolean }) => (
            <ChamferBox chamfer={8} fill={on ? 'rgba(224,181,99,0.14)' : hovered && canEdit ? 'rgba(224,181,99,0.06)' : WELL} stroke={on ? Rune.goldBright : LINE} strokeWidth={on ? 1.6 : 1.1}
              style={{ minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 9, opacity: e.off ? 0.5 : 1 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: Rune.ivory, fontSize: 14.5, fontFamily: Body.bold }}>{effectLabel(e, experiences)}</Text>
                <Text style={[HELP, { lineHeight: 16 }]}>{notes}</Text>
                {e.note ? <Text style={[HELP, { lineHeight: 16, fontSize: 11.5 }]}>{e.note}</Text> : null}
              </View>
              <Text style={{ color: e.off ? Rune.muted : v.startsWith('−') ? NEG : Rune.goldBright, fontSize: 22, fontFamily: Display.black }}>{v}</Text>
            </ChamferBox>
          )}
        </Pressable>
      </View>
    );
  };

  const shape = sel ? shapeOf(sel) : 'flat';
  const f: EffectFormula = sel?.formula ?? { variable: 'level' };
  const setF = (patch: Partial<EffectFormula>) => sel && setSel({ ...sel, formula: { ...f, ...patch } });
  const option = sel ? matchOption(sel, experiences) : undefined;
  const tierNow = tierForLevel(level) - 1;
  const total = sel ? worth(sel) : '';

  const inspector = sel ? (
    <ScrollView key={at} style={{ width: win.width < 1240 ? 374 : 440, flexGrow: 0, borderLeftWidth: 1, borderLeftColor: LINE }} contentContainerStyle={{ padding: 24, gap: 20 }}>
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
          <Text style={[CAPTION, { flex: 1 }]}>Amount</Text>
          <Text style={{ color: Rune.ivory, fontSize: 13.5, fontFamily: Body.bold }}>{total === 'ƒx' ? 'Worked out on their sheet' : `Right now: ${total}`}</Text>
        </View>
        {sel.target === 'scar' ? <Text style={HELP}>While this card is equipped, the character&apos;s rightmost open Hope slot is scarred and can&apos;t be used.</Text> : (
          <>
            <View style={{ flexDirection: 'row', gap: 7 }}>
              {SHAPES.filter(([key]) => key === 'flat' || (sel.target !== 'experience' && !(key === 'formula' && sel.target === 'level'))).map(([key, label]) => (
                <Choice key={key} label={label} on={shape === key} onPress={() => setSel(withShape(sel, key))} />
              ))}
            </View>
            {shape === 'flat' ? (
              <NumberBox label={isSetEffect(sel) ? 'It becomes' : sel.target === 'level' ? 'Levels added' : 'Added, or taken away'} value={sel.delta ?? 0} limit={isSetEffect(sel) ? LIMIT.set : LIMIT.bonus} onChange={(delta) => setSel({ ...sel, delta })} />
            ) : shape === 'byTier' ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {[0, 1, 2, 3].map((t) => (
                  <NumberBox key={t} label={`Tier ${t + 1}${t === tierNow ? ', now' : ''}`} value={sel.byTier?.[t] ?? 0} limit={LIMIT.tier}
                    onChange={(n) => setSel({ ...sel, byTier: [0, 1, 2, 3].map((j) => (j === t ? n : sel.byTier?.[j] ?? 0)) as [number, number, number, number] })} />
                ))}
              </View>
            ) : (
              <>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {FORMULA_VARS.map((v) => <Choice key={v} label={VAR_LABEL[v]} on={f.variable === v} onPress={() => setF({ variable: v, functionKey: undefined })} />)}
                  {functionVars?.map((v) => <Choice key={v.key} label={`${v.title} (${v.value})`} on={f.variable === 'function' && f.functionKey === v.key} onPress={() => setF({ variable: 'function', functionKey: v.key })} />)}
                </View>
                {VAR_HINT[f.variable] ? <Text style={HELP}>{VAR_HINT[f.variable]!.replace('Tap # under the card to set it.', 'Set it beside the card.')}</Text> : null}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  <NumberBox label="Multiply by" value={f.multiply ?? 1} limit={LIMIT.times} onChange={(multiply) => setF({ multiply })} />
                  <NumberBox label="Divide by" value={f.divide ?? 1} limit={LIMIT.times} onChange={(divide) => setF({ divide })} />
                  <NumberBox label="Then add" value={f.plus ?? 0} limit={LIMIT.plus} onChange={(plus) => setF({ plus })} />
                </View>
              </>
            )}
          </>
        )}
      </View>

      <View style={{ gap: 10 }}>
        <Text style={CAPTION}>What it changes</Text>
        {effectGroups(experiences, dm).map((g) => (
          <View key={g.label} style={{ gap: 5 }}>
            <Text style={[HELP, { fontSize: 12 }]}>{g.label}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {g.options.map((o) => <Choice key={o.key} label={o.label} on={option?.key === o.key} onPress={() => setSel(applyPickedOption(sel, o))} />)}
            </View>
          </View>
        ))}
      </View>

      {sel.target !== 'scar' && sel.target !== 'experience' ? (
        <View style={{ gap: 12 }}>
          <Text style={CAPTION}>How it applies</Text>
          <Switch label="Permanent" on={!!sel.permanent} onPress={() => setSel({ ...sel, permanent: sel.permanent ? undefined : true })}
            help={sel.permanent ? 'Kept whether or not the card is equipped. To lose it you must delete this card from every category it appears in.' : 'Applies only while the card is equipped.'} />
          <Switch label="Overwrite" on={!!sel.overwrite} onPress={() => setSel({ ...sel, overwrite: sel.overwrite ? undefined : true })}
            help={sel.overwrite ? 'The stat becomes this value. Everything else that adds to it is set aside.' : 'Adds to whatever else is contributing to the stat.'} />
        </View>
      ) : null}

      {groups.length || dm ? (
        <View style={{ gap: 8 }}>
          <Text style={CAPTION}>Group</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Choice label="No group" on={!sel.group} onPress={() => change(moveToGroup(list, at, null))} />
            {groups.map((g) => <Choice key={g} label={g} on={sel.group === g} onPress={() => change(moveToGroup(list, at, g))} />)}
            {dm ? <Choice label="+ New group" on={false} onPress={() => setNaming({})} /> : null}
          </View>
          {naming && !naming.from ? <GroupName verb="Make it" taken={groups} onCancel={() => setNaming(null)} onSave={(g) => { change(moveToGroup(list, at, g)); setNaming(null); }} /> : null}
        </View>
      ) : null}

      <RuneButton label="Remove this modifier" kind="danger" height={40} onPress={() => { change(list.filter((_, i) => i !== at)); setPicked(Math.max(0, at - 1)); }} />
    </ScrollView>
  ) : null;

  return (
    <DeskDialog title={title} subtitle={subtitle} width={aside ? 1280 : 1020} height={820} onClose={() => guard(onClose)}
      footer={canEdit ? (
        <>
          <RuneButton label="+ Add modifier" kind="secondary" height={42} style={{ width: 190 }} onPress={() => add()} />
          <Text style={[HELP, { flex: 1, textAlign: 'right', color: dirty ? Rune.goldText : Rune.muted }]}>{dirty ? 'Not saved yet' : ''}</Text>
          <RuneButton label="Undo changes" kind="ghost" height={42} style={{ width: 170 }} disabled={!dirty} onPress={() => setDraft(null)} />
          <RuneButton label="Save" kind="primary" height={42} style={{ width: 150 }} disabled={!dirty} onPress={save} />
        </>
      ) : undefined}>
      <View style={{ flex: 1, flexDirection: 'row', minHeight: 0 }}>
        {aside ? <ScrollView style={{ width: 264, flexGrow: 0, borderRightWidth: 1, borderRightColor: LINE }} contentContainerStyle={{ padding: 22, gap: 14 }}>{aside(guard)}</ScrollView> : null}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 22, gap: 8 }}>
          {list.length ? groupEffects(list).map((band) => {
            const name = band.name;
            if (name === null) return band.rows.map((r) => row(r.effect, r.index));
            const open = !collapsed.includes(name);
            return (
              <View key={name} style={{ gap: 8, padding: 10, borderWidth: 1, borderColor: LINE }}>
                {naming?.from === name ? (
                  <GroupName verb="Rename" initial={name} taken={groups} onCancel={() => setNaming(null)}
                    onSave={(to) => { change(renameGroup(list, name, to)); onCollapsed(collapsed.map((n) => (n === name ? to : n))); setNaming(null); }} />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    {dm ? <Tick on={isGroupOn(list, name)} label={`${name} applied`} onPress={() => change(setGroupOn(list, name, !isGroupOn(list, name)))} /> : null}
                    <Pressable style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 }} onPress={() => onCollapsed(open ? [...collapsed, name] : collapsed.filter((n) => n !== name))}
                      accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${name}, ${band.rows.length} modifiers`}>
                      <Svg width={11} height={11} viewBox="0 0 16 16" style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
                        <Polyline points="5,3 11,8 5,13" fill="none" stroke={Rune.goldText} strokeWidth={2} />
                      </Svg>
                      <Text numberOfLines={1} style={[CAPTION, { flex: 1 }]}>{name}</Text>
                      <Text style={HELP}>{band.rows.length}</Text>
                    </Pressable>
                    {canEdit ? (
                      <>
                        <RuneButton label="+ Add" accessibilityLabel={`Add a modifier to ${name}`} kind="ghost" dense height={30} onPress={() => add(name)} />
                        {dm ? <RuneButton label="Rename" accessibilityLabel={`Rename ${name}`} kind="ghost" dense height={30} onPress={() => setNaming({ from: name })} /> : null}
                        <RuneButton label="Ungroup" accessibilityLabel={`Delete the group ${name}, keep its modifiers`} kind="ghost" dense height={30} onPress={() => change(deleteGroup(list, name))} />
                      </>
                    ) : null}
                  </View>
                )}
                {open ? band.rows.map((r) => row(r.effect, r.index)) : null}
              </View>
            );
          }) : (
            <Text style={[HELP, { fontSize: 14, lineHeight: 21, padding: 6 }]}>
              {!canEdit ? 'This card has no stat modifiers.'
                : dm ? 'Nothing yet. Add a modifier and it becomes a card on them, which you can switch on and off from here.'
                  : 'This card has no stat modifiers. Add one for a buff or a penalty: a fixed amount, a formula, or a value for each tier.'}
            </Text>
          )}
          {!canEdit && list.length ? <Text style={[HELP, { paddingTop: 8 }]}>These come with the card and can&apos;t be changed.</Text> : null}
        </ScrollView>
        {inspector}
      </View>
      {leaving ? (
        <PopupDialog dm={dm} title="Save your changes?" body="You have modifiers you have not saved yet." confirmLabel="Save" cancelLabel="Keep editing"
          onConfirm={() => { save(); setLeaving(null); leaving.go(); }} onCancel={() => setLeaving(null)}>
          <RuneButton label="Leave without saving" kind="ghost" height={42} style={{ marginTop: 12 }} onPress={() => { setDraft(null); setLeaving(null); leaving.go(); }} />
        </PopupDialog>
      ) : null}
    </DeskDialog>
  );
}
