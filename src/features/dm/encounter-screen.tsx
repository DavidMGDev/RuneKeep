/**
 * Encounter (v0.15.0, PRD #26-47) — the DM's fight-management hub. Allies (present party members +
 * manual NPCs) and adversaries, each combatant's stats nudged by the heartbeat StatPulse or set on the
 * keypad. Member vitals obey the global/local + active-only rules (session.ts); adversaries are always
 * local and editable (so a fight can be prepared ahead). An options panel toggles global-sync + auto-log;
 * the log records notes and (when auto-log is on) one entry per stat-change hold. Every action persists.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

import { AppScreen, SectionLabel } from '@/components/app-screen';
import { ChamferBox } from '@/components/chamfer-box';
import { LoadingScreen } from '@/components/loading-screen';
import { PopupDialog } from '@/components/popup-dialog';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, DmRune } from '@/constants/theme';
import { NumberKeypad } from '@/features/character-sheet/sheet/number-keypad';
import { type CharacterFile } from '@/lib/character-file';
import { listCharacters } from '@/lib/character-store';
import { memberMaxes } from '@/lib/dm-vitals';
import { type Party, type VitalKey } from '@/lib/party';
import { getParty, saveParty } from '@/lib/party-store';
import {
  appendLog,
  canEditMembers,
  type Combatant,
  type CombatantStat,
  combatantDelta,
  combatantSet,
  completeEncounter,
  type Encounter,
  formatStatLog,
  memberDelta,
  memberSet,
  memberVitals,
  mutateCombatant,
  newAdversary,
  newNpc,
  setActive,
  type Session,
} from '@/lib/session';
import { getEncounter, getSession, saveEncounter, saveSession } from '@/lib/session-store';
import { playSfx } from '@/lib/sfx';
import { AdversaryEditor } from './adversary-editor';
import { CombatantPanel } from './combatant-panel';
import { NameDialog } from './dm-ui';
import { EncounterLog } from './encounter-log';
import { MemberPanel } from './member-panel';

const KEY_LABEL: Record<VitalKey, string> = { hp: 'HP', stress: 'Stress', hope: 'Hope', armor: 'Armor' };

type KeypadTarget = { kind: 'member'; charId: string; key: VitalKey } | { kind: 'combatant'; id: string; stat: CombatantStat };

function OptionRow({ label, hint, on, onToggle }: { label: string; hint: string; on: boolean; onToggle: () => void }) {
  return (
    <Pressable onPress={onToggle} accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
      <ChamferBox chamfer={5} fill={on ? DmRune.accent : 'transparent'} stroke={DmRune.accentDim} strokeWidth={1.3} style={{ width: 46, height: 26, justifyContent: 'center', paddingHorizontal: 4 }}>
        <View style={{ width: 18, height: 18, backgroundColor: on ? DmRune.ink : DmRune.accentDim, alignSelf: on ? 'flex-end' : 'flex-start', transform: [{ rotate: '45deg' }] }} />
      </ChamferBox>
      <View style={{ flex: 1 }}>
        <Text style={{ color: DmRune.ivory, fontSize: 14, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' }}>{label}</Text>
        <Text style={{ color: DmRune.muted, fontSize: 11, fontFamily: Body.regular, lineHeight: 15, marginTop: 2 }}>{hint}</Text>
      </View>
    </Pressable>
  );
}

export function EncounterScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [party, setParty] = useState<Party | null>(null);
  const [files, setFiles] = useState<Record<string, CharacterFile>>({});
  const [keypad, setKeypad] = useState<KeypadTarget | null>(null);
  const [editing, setEditing] = useState<Combatant | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [addingNpc, setAddingNpc] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);

  // Latest-state refs so timer/hold callbacks read fresh values without stale closures.
  const encRef = useRef<Encounter | null>(null); encRef.current = encounter;
  const partyRef = useRef<Party | null>(null); partyRef.current = party;
  const holdFrom = useRef<Record<string, number>>({});
  const encTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const partyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const enc = await getEncounter(id);
      if (!enc || !live) { if (live) setEncounter(enc); return; }
      const [ses, all] = await Promise.all([getSession(enc.sessionId), listCharacters()]);
      const pty = ses ? await getParty(ses.partyId) : null;
      if (!live) return;
      setEncounter(enc); setSession(ses); setParty(pty);
      setFiles(Object.fromEntries(all.map((f) => [f.id, f])));
    })();
    return () => { live = false; };
  }, [id]);
  useEffect(() => () => { if (encTimer.current) clearTimeout(encTimer.current); if (partyTimer.current) clearTimeout(partyTimer.current); }, []);

  const commitEncounter = useCallback((next: Encounter) => {
    setEncounter(next); encRef.current = next;
    if (encTimer.current) clearTimeout(encTimer.current);
    encTimer.current = setTimeout(() => { void saveEncounter(next); }, 200);
  }, []);
  const commitParty = useCallback((next: Party) => {
    setParty(next); partyRef.current = next;
    if (partyTimer.current) clearTimeout(partyTimer.current);
    partyTimer.current = setTimeout(() => { void saveParty(next); }, 200);
  }, []);

  // --- combatant lookup across adversaries + NPC allies ---
  const findCombatant = useCallback((cid: string): { c: Combatant; side: 'Player' | 'Adversary' } | undefined => {
    const enc = encRef.current; if (!enc) return undefined;
    const adv = enc.adversaries.find((c) => c.id === cid);
    if (adv) return { c: adv, side: 'Adversary' };
    for (const a of enc.allies) if (a.kind === 'npc' && a.combatant.id === cid) return { c: a.combatant, side: 'Player' };
    return undefined;
  }, []);
  const updateCombatant = useCallback((cid: string, fn: (c: Combatant) => Combatant): Encounter | null => {
    const enc = encRef.current; if (!enc) return null;
    if (enc.adversaries.some((c) => c.id === cid)) return { ...enc, adversaries: mutateCombatant(enc.adversaries, cid, fn) };
    return { ...enc, allies: enc.allies.map((a) => (a.kind === 'npc' && a.combatant.id === cid ? { kind: 'npc', combatant: fn(a.combatant) } : a)) };
  }, []);

  // --- member stat handlers ---
  const memberValue = useCallback((charId: string, key: VitalKey): number => {
    const enc = encRef.current, pty = partyRef.current; if (!enc || !pty) return 0;
    return memberVitals(enc, pty, charId)?.[key] ?? 0;
  }, []);
  const onMemberStat = useCallback((charId: string, key: VitalKey, dir: 1 | -1) => {
    const enc = encRef.current, pty = partyRef.current, f = files[charId];
    if (!enc || !pty || !f) return;
    const r = memberDelta(enc, pty, charId, key, dir, memberMaxes(f));
    commitParty(r.party); commitEncounter(r.encounter);
  }, [files, commitParty, commitEncounter]);

  // --- combatant stat handlers ---
  const onCombatantStat = useCallback((cid: string, stat: CombatantStat, dir: 1 | -1) => {
    const next = updateCombatant(cid, (c) => combatantDelta(c, stat, dir));
    if (next) commitEncounter(next);
  }, [updateCombatant, commitEncounter]);

  // --- one-log-per-hold (PRD #46) ---
  const logIfChanged = useCallback((holdKey: string, side: 'Player' | 'Adversary', name: string, stat: VitalKey | CombatantStat, to: number) => {
    const enc = encRef.current; if (!enc) return;
    const from = holdFrom.current[holdKey];
    delete holdFrom.current[holdKey];
    if (!enc.options.autoLog || from === undefined || from === to) return;
    commitEncounter(appendLog(enc, 'stat', formatStatLog(side, name, stat, from, to)));
  }, [commitEncounter]);

  const memberHoldStart = useCallback((charId: string, key: VitalKey) => { holdFrom.current[`m:${charId}:${key}`] = memberValue(charId, key); }, [memberValue]);
  const memberHoldEnd = useCallback((charId: string, key: VitalKey) => {
    const f = files[charId];
    logIfChanged(`m:${charId}:${key}`, 'Player', f?.name ?? 'Player', key, memberValue(charId, key));
  }, [files, memberValue, logIfChanged]);
  const combatantHoldStart = useCallback((cid: string, stat: CombatantStat) => { const r = findCombatant(cid); if (r) holdFrom.current[`c:${cid}:${stat}`] = (stat === 'hp' ? r.c.hp : r.c.stress) ?? 0; }, [findCombatant]);
  const combatantHoldEnd = useCallback((cid: string, stat: CombatantStat) => {
    const r = findCombatant(cid); if (!r) return;
    logIfChanged(`c:${cid}:${stat}`, r.side, r.c.name, stat, (stat === 'hp' ? r.c.hp : r.c.stress) ?? 0);
  }, [findCombatant, logIfChanged]);

  // --- keypad set (one log entry) ---
  const onKeypadSubmit = useCallback((n: number) => {
    const enc = encRef.current, pty = partyRef.current; if (!enc || !pty || !keypad) return;
    if (keypad.kind === 'member') {
      const f = files[keypad.charId]; if (!f) { setKeypad(null); return; }
      const from = memberValue(keypad.charId, keypad.key);
      const r = memberSet(enc, pty, keypad.charId, keypad.key, n, memberMaxes(f));
      commitParty(r.party);
      let e2 = r.encounter;
      const to = memberVitals(e2, r.party, keypad.charId)?.[keypad.key] ?? n;
      if (e2.options.autoLog && from !== to) e2 = appendLog(e2, 'stat', formatStatLog('Player', f.name, keypad.key, from, to));
      commitEncounter(e2);
    } else {
      const r = findCombatant(keypad.id);
      const next = updateCombatant(keypad.id, (c) => combatantSet(c, keypad.stat, n));
      if (next && r) {
        const from = (keypad.stat === 'hp' ? r.c.hp : r.c.stress) ?? 0;
        const to = keypad.stat === 'hp' ? Math.min(n, r.c.maxHp ?? n) : Math.min(n, r.c.maxStress ?? n);
        commitEncounter(next.options.autoLog && from !== to ? appendLog(next, 'stat', formatStatLog(r.side, r.c.name, keypad.stat, from, to)) : next);
      }
    }
    setKeypad(null);
  }, [keypad, files, memberValue, findCombatant, updateCombatant, commitParty, commitEncounter]);

  // --- structure edits ---
  const addAdversary = useCallback(() => {
    const enc = encRef.current; if (!enc) return;
    playSfx('buttonTap');
    commitEncounter({ ...enc, adversaries: [...enc.adversaries, newAdversary(enc.adversaries.length)] });
  }, [commitEncounter]);
  const addNpcAlly = useCallback((name: string) => {
    const enc = encRef.current; if (!enc) return;
    setAddingNpc(false);
    commitEncounter({ ...enc, allies: [...enc.allies, { kind: 'npc', combatant: newNpc(name) }] });
  }, [commitEncounter]);
  const removeCombatant = useCallback((cid: string) => {
    const enc = encRef.current; if (!enc) return;
    commitEncounter({ ...enc, adversaries: enc.adversaries.filter((c) => c.id !== cid), allies: enc.allies.filter((a) => a.kind !== 'npc' || a.combatant.id !== cid) });
  }, [commitEncounter]);
  const saveConfig = useCallback((c: Combatant) => {
    setEditing(null);
    const next = updateCombatant(c.id, () => c);
    if (next) commitEncounter(next);
  }, [updateCombatant, commitEncounter]);

  // --- options + lifecycle ---
  const toggleAutoLog = useCallback(() => { const enc = encRef.current; if (enc) commitEncounter({ ...enc, options: { ...enc.options, autoLog: !enc.options.autoLog } }); }, [commitEncounter]);
  const toggleSync = useCallback(() => {
    const enc = encRef.current, pty = partyRef.current; if (!enc || !pty) return;
    if (enc.options.globalSync) {
      // forking to local: seed localVitals from the current global so nothing jumps
      commitEncounter({ ...enc, options: { ...enc.options, globalSync: false }, localVitals: { ...pty.global } });
    } else {
      // rejoining global: drop the local copy
      const { localVitals, ...rest } = enc; void localVitals;
      commitEncounter({ ...(rest as Encounter), options: { ...enc.options, globalSync: true } });
    }
  }, [commitEncounter]);
  const start = useCallback(() => {
    const enc = encRef.current, ses = session; if (!enc || !ses) return;
    playSfx('buttonTap');
    const r = setActive(ses, enc);
    setSession(r.session); void saveSession(r.session);
    commitEncounter(r.encounter);
  }, [session, commitEncounter]);
  const complete = useCallback(() => {
    const enc = encRef.current, pty = partyRef.current, ses = session; if (!enc || !pty || !ses) return;
    setConfirmComplete(false);
    playSfx('buttonTap');
    const r = completeEncounter(ses, enc, pty);
    setSession(r.session); void saveSession(r.session);
    commitEncounter(r.encounter);
  }, [session, commitEncounter]);

  if (!encounter) return <LoadingScreen label="Setting the scene" />;
  const enc = encounter;
  const editableMembers = canEditMembers(enc);
  const memberAllies = enc.allies.filter((a): a is { kind: 'member'; charId: string } => a.kind === 'member' && !!files[a.charId]);
  const npcAllies = enc.allies.filter((a): a is { kind: 'npc'; combatant: Combatant } => a.kind === 'npc');

  const keypadMax = (() => {
    if (!keypad) return 0;
    if (keypad.kind === 'member') { const f = files[keypad.charId]; if (!f) return 0; const m = memberMaxes(f); return keypad.key === 'hp' ? m.maxHp : keypad.key === 'stress' ? m.stressMax : keypad.key === 'hope' ? m.hopeMax : m.armorMax; }
    const r = findCombatant(keypad.id); return (keypad.stat === 'hp' ? r?.c.maxHp : r?.c.maxStress) ?? 0;
  })();

  const statusColor = enc.status === 'active' ? DmRune.accent : enc.status === 'completed' ? DmRune.muted : DmRune.accentDim;

  return (
    <AppScreen
      title={enc.name}
      dm
      onBack={() => router.back()}
      headerRight={
        <Pressable onPress={() => setShowOptions(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Encounter options">
          <Svg width={20} height={20} viewBox="0 0 20 20"><Polyline points="3,6 17,6" stroke={DmRune.accent} strokeWidth={2} strokeLinecap="round" /><Polyline points="3,10 17,10" stroke={DmRune.accent} strokeWidth={2} strokeLinecap="round" /><Polyline points="3,14 17,14" stroke={DmRune.accent} strokeWidth={2} strokeLinecap="round" /></Svg>
        </Pressable>
      }>
      <View style={{ flex: 1 }}>
        {/* status + lifecycle */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: statusColor }} />
            <Text style={{ color: statusColor, fontSize: 11, fontFamily: Body.bold, letterSpacing: 1.4, textTransform: 'uppercase' }}>{enc.status}</Text>
            {!enc.options.globalSync ? <Text style={{ color: DmRune.muted, fontSize: 10, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>· Local</Text> : null}
          </View>
          <Pressable onPress={() => setShowLog(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Open log">
            <ChamferBox chamfer={5} fill="transparent" stroke={DmRune.line} strokeWidth={1.1} style={{ paddingHorizontal: 11, height: 28, justifyContent: 'center' }}>
              <Text style={{ color: DmRune.accent, fontSize: 10, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>Log · {enc.log.length}</Text>
            </ChamferBox>
          </Pressable>
          {enc.status === 'prepared' ? <RuneButton label="Start" kind="primary" height={30} dense dm onPress={start} /> : null}
          {enc.status === 'active' ? <RuneButton label="Complete" kind="secondary" height={30} dense dm onPress={() => setConfirmComplete(true)} /> : null}
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <SectionLabel dm>Allies</SectionLabel>
            <Pressable onPress={() => setAddingNpc(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Add NPC ally"><Text style={{ color: DmRune.accentDim, fontSize: 10.5, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>+ NPC</Text></Pressable>
          </View>
          {!editableMembers ? <Text style={{ color: DmRune.muted, fontSize: 10.5, fontFamily: Body.regular, fontStyle: 'italic' }}>{enc.status === 'completed' ? 'Completed — member vitals are the archived snapshot.' : 'Start the encounter to change member vitals.'}</Text> : null}
          {memberAllies.map((a) => {
            const pty = partyRef.current;
            return (
              <MemberPanel
                key={a.charId}
                file={files[a.charId]}
                vitals={(pty && memberVitals(enc, pty, a.charId)) || { hp: 0, stress: 0, hope: 0, armor: 0 }}
                editable={editableMembers && !!pty}
                onStat={(key, dir) => onMemberStat(a.charId, key, dir)}
                onRequestSet={(key) => setKeypad({ kind: 'member', charId: a.charId, key })}
                onHoldStart={(key) => memberHoldStart(a.charId, key)}
                onHoldEnd={(key) => memberHoldEnd(a.charId, key)}
              />
            );
          })}
          {npcAllies.map((a) => (
            <CombatantPanel key={a.combatant.id} combatant={a.combatant} onStat={(s, d) => onCombatantStat(a.combatant.id, s, d)} onRequestSet={(s) => setKeypad({ kind: 'combatant', id: a.combatant.id, stat: s })} onEdit={() => setEditing(a.combatant)} onRemove={() => removeCombatant(a.combatant.id)} onHoldStart={(s) => combatantHoldStart(a.combatant.id, s)} onHoldEnd={(s) => combatantHoldEnd(a.combatant.id, s)} />
          ))}

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            <SectionLabel dm>Adversaries</SectionLabel>
            <Pressable onPress={addAdversary} hitSlop={8} accessibilityRole="button" accessibilityLabel="Add adversary"><Text style={{ color: DmRune.accentDim, fontSize: 10.5, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>+ Adversary</Text></Pressable>
          </View>
          {enc.adversaries.length === 0 ? <Text style={{ color: DmRune.muted, fontSize: 12, fontFamily: Body.regular, fontStyle: 'italic' }}>None yet — add one to build the fight.</Text> : null}
          {enc.adversaries.map((c) => (
            <CombatantPanel key={c.id} combatant={c} onStat={(s, d) => onCombatantStat(c.id, s, d)} onRequestSet={(s) => setKeypad({ kind: 'combatant', id: c.id, stat: s })} onEdit={() => setEditing(c)} onRemove={() => removeCombatant(c.id)} onHoldStart={(s) => combatantHoldStart(c.id, s)} onHoldEnd={(s) => combatantHoldEnd(c.id, s)} />
          ))}
        </ScrollView>
      </View>

      {keypad ? (
        <NumberKeypad
          title={`Set ${keypad.kind === 'member' ? KEY_LABEL[keypad.key] : keypad.stat.toUpperCase()}`}
          subtitle={`0–${Math.max(0, keypadMax)}`}
          min={0}
          max={Math.max(0, keypadMax)}
          onSubmit={onKeypadSubmit}
          onClose={() => setKeypad(null)}
        />
      ) : null}

      {editing ? <AdversaryEditor initial={editing} onSave={saveConfig} onCancel={() => setEditing(null)} /> : null}
      {addingNpc ? <NameDialog title="Add NPC" placeholder="NPC name" confirmLabel="Add" onConfirm={addNpcAlly} onCancel={() => setAddingNpc(false)} /> : null}
      {showLog ? <EncounterLog log={enc.log} onAddNote={(t) => commitEncounter(appendLog(enc, 'note', t))} onClose={() => setShowLog(false)} /> : null}

      {showOptions ? (
        <View style={{ position: 'absolute', inset: 0, zIndex: 300, alignItems: 'center', justifyContent: 'center' }}>
          <Pressable style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(6,8,13,0.86)' }} onPress={() => setShowOptions(false)} accessibilityRole="button" accessibilityLabel="Close options" />
          <ChamferBox chamfer={14} fill="rgba(12,15,20,0.99)" stroke={DmRune.lineStrong} strokeWidth={1.5} style={{ width: 330, padding: 20 }}>
            <Text style={{ color: DmRune.ivory, fontSize: 16, fontFamily: Display.black, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Options</Text>
            <OptionRow label="Auto-log stat changes" hint="Record each stat-change hold as one log entry." on={enc.options.autoLog} onToggle={toggleAutoLog} />
            <OptionRow label="Sync party globally" hint="Off = a fully local encounter that never changes the party across other sessions." on={enc.options.globalSync} onToggle={toggleSync} />
            <View style={{ marginTop: 12 }}><RuneButton label="Done" kind="secondary" height={44} dm onPress={() => setShowOptions(false)} /></View>
          </ChamferBox>
        </View>
      ) : null}

      {confirmComplete ? (
        <PopupDialog title="Complete encounter?" body="This freezes the party's current state onto the encounter as a record. The party keeps its live state for the next encounter." confirmLabel="Complete" onConfirm={complete} onCancel={() => setConfirmComplete(false)} />
      ) : null}
    </AppScreen>
  );
}
