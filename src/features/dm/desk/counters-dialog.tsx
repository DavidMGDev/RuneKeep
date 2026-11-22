/**
 * Every counter the DM's table can show (v0.50.0): the campaign's own, and those of the encounter on the table. The
 * settings are the adversary editor's own fields and follow its rules: a changed start takes effect on Save.
 */
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ChamferBox } from '@/components/chamfer-box';
import { DeskDialog } from '@/components/desk-dialog';
import { PopupDialog } from '@/components/popup-dialog';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, DmRune } from '@/constants/theme';
import { SectionDivider } from '@/features/create/create-ui';
import type { AdversaryCounter } from '@/lib/dm-counters';
import type { Combatant } from '@/lib/session';
import { type CounterSpot, counterKey } from '@/lib/table-counters';

import { CounterEditor } from '../adversary-editor';
import { CounterStepper } from '../counter-control';

/** A combatant and its counters, or (no `cid`) the campaign's own. */
export interface CounterGroup { cid?: string; name: string; fallen?: boolean; counters: AdversaryCounter[] }

export function counterGroups(own: AdversaryCounter[], fighters: Combatant[]): CounterGroup[] {
  return [{ name: 'This campaign', counters: own }, ...fighters.filter((c) => !c.charId).map((c) => ({ cid: c.id, name: c.name, fallen: c.fallen, counters: c.counters ?? [] }))];
}

export interface CounterActions {
  /** Makes one and gives back its key. */
  add: (cid?: string) => string;
  save: (key: string, next: AdversaryCounter) => void;
  remove: (key: string) => void;
  step: (key: string, delta: number) => void;
  spent: (key: string) => void;
  reset: (key: string) => void;
  recover: (cid: string) => void;
  show: (key: string, on: boolean) => void;
}

const sameSettings = (a: AdversaryCounter, b: AdversaryCounter) =>
  a.name === b.name && a.kind === b.kind && a.text === b.text && a.start === b.start && !!a.loop === !!b.loop && !!a.takeOver === !!b.takeOver;

function Row({ c, on, shown, onPress }: { c: AdversaryCounter; on: boolean; shown: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${c.name || 'Counter'}${shown ? ', on the table' : ''}`}>
      {({ hovered }: { hovered?: boolean }) => (
        <ChamferBox chamfer={7} fill={on ? 'rgba(224,181,99,0.14)' : hovered ? 'rgba(224,181,99,0.06)' : 'transparent'} stroke={on ? DmRune.accent : 'rgba(147,142,136,0.3)'} strokeWidth={on ? 1.5 : 1}
          style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 6 }}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: DmRune.ivory, fontSize: 14, fontFamily: Body.bold }}>{c.name || 'Counter'}</Text>
            {shown ? <Text style={{ color: DmRune.accent, fontSize: 11.5, fontFamily: Body.medium }}>On the table</Text> : null}
          </View>
          <Text style={{ color: DmRune.accent, fontSize: 18, fontFamily: Display.black }}>{c.value}</Text>
        </ChamferBox>
      )}
    </Pressable>
  );
}

export function CountersDialog({ groups, spots, start, encounterName, act, onClose }: {
  groups: CounterGroup[];
  spots: Record<string, CounterSpot>;
  start: { key?: string; cid?: string };
  encounterName?: string;
  act: CounterActions;
  onClose: () => void;
}) {
  const all = groups.flatMap((g) => g.counters.map((c) => ({ key: counterKey(c.id, g.cid), c, g })));
  const [picked, setPicked] = useState(() => start.key ?? all.find((x) => start.cid && x.g.cid === start.cid)?.key ?? all[0]?.key ?? '');
  const here = all.find((x) => x.key === picked);
  const [draft, setDraft] = useState<{ key: string; c: AdversaryCounter } | null>(null);
  const [leaving, setLeaving] = useState<{ go: () => void } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const edit = here && draft?.key === here.key ? draft.c : here?.c;
  const dirty = !!here && !!edit && !sameSettings(edit, here.c);
  const save = () => { if (here && edit && dirty) act.save(here.key, { ...edit, name: edit.name.trim() || 'Counter' }); setDraft(null); };
  const guard = (go: () => void) => { if (dirty) setLeaving({ go }); else { setDraft(null); go(); } };
  const shown = here ? !!spots[here.key] : false;

  return (
    <DeskDialog title="Counters" subtitle={encounterName ? `This campaign's, and the ones in ${encounterName}` : "This campaign's"} width={940} height={700} onClose={() => guard(onClose)}
      footer={here ? (
        <>
          <RuneButton label="Delete" kind="danger" height={42} dm style={{ width: 120 }} onPress={() => setRemoving(here.key)} />
          <RuneButton label="Back to its start" kind="ghost" height={42} dm style={{ width: 190 }} disabled={here.c.value === here.c.start} onPress={() => act.reset(here.key)} />
          <View style={{ flex: 1 }} />
          <RuneButton label={shown ? 'Take off the table' : 'Put on the table'} kind="secondary" height={42} dm style={{ width: 210 }} onPress={() => act.show(here.key, !shown)} />
          <RuneButton label="Save" kind="primary" height={42} dm style={{ width: 130 }} disabled={!dirty} onPress={save} />
        </>
      ) : undefined}>
      <View style={{ flex: 1, flexDirection: 'row', minHeight: 0 }}>
        <ScrollView style={{ width: 340, flexGrow: 0, borderRightWidth: 1, borderRightColor: 'rgba(218,162,73,0.3)' }} contentContainerStyle={{ padding: 22, gap: 8 }}>
          {groups.map((g) => (
            <View key={g.cid ?? 'own'} style={{ gap: 7, marginBottom: 14 }}>
              <SectionDivider label={g.name} />
              {g.counters.map((c) => {
                const key = counterKey(c.id, g.cid);
                return <Row key={key} c={c} on={key === picked} shown={!!spots[key]} onPress={() => { if (key !== picked) guard(() => setPicked(key)); }} />;
              })}
              <RuneButton label="+ New counter" accessibilityLabel={`New counter for ${g.name}`} kind="ghost" height={34} dense dm onPress={() => guard(() => setPicked(act.add(g.cid)))} />
            </View>
          ))}
        </ScrollView>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 28, gap: 22 }}>
          {here && edit ? (
            <>
              <View style={{ alignItems: 'center', gap: 10, paddingVertical: 8 }}>
                {here.g.fallen && here.g.cid ? (
                  <>
                    <Text style={{ color: DmRune.muted, fontSize: 13.5, fontFamily: Body.medium }}>{`${here.g.name} has fallen.`}</Text>
                    <RuneButton label="Recover" kind="secondary" height={40} dm onPress={() => act.recover(here.g.cid!)} />
                  </>
                ) : (
                  <CounterStepper c={here.c} size={58} onStep={(d) => act.step(here.key, d)} onSpent={() => act.spent(here.key)} spentVerb={here.g.cid ? undefined : 'Take it off the table'} />
                )}
              </View>
              <CounterEditor key={here.key} c={edit} standalone={!here.g.cid} onChange={(c) => setDraft({ key: here.key, c })} />
            </>
          ) : (
            <Text style={{ color: DmRune.muted, fontSize: 14, lineHeight: 21, fontFamily: Body.medium }}>
              No counters yet. A counter is a number you move by hand: charges left, rounds until the bridge falls, villagers still alive. Make one for the campaign or for anyone in the encounter.
            </Text>
          )}
        </ScrollView>
      </View>
      {leaving ? (
        <PopupDialog dm title="Save your changes?" body="This counter has changes you have not saved yet." confirmLabel="Save" cancelLabel="Keep editing"
          onConfirm={() => { save(); setLeaving(null); leaving.go(); }} onCancel={() => setLeaving(null)}>
          <RuneButton label="Leave without saving" kind="ghost" height={42} dm style={{ marginTop: 12 }} onPress={() => { setDraft(null); setLeaving(null); leaving.go(); }} />
        </PopupDialog>
      ) : null}
      {removing ? (
        <PopupDialog dm destructive title="Delete this counter?" body="It goes from the table, and from its adversary or ally if it has one." confirmLabel="Delete"
          onConfirm={() => { act.remove(removing); setRemoving(null); setDraft(null); setPicked(all.find((x) => x.key !== removing)?.key ?? ''); }} onCancel={() => setRemoving(null)} />
      ) : null}
    </DeskDialog>
  );
}
