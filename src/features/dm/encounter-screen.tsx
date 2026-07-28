/**
 * Encounter (v0.15.0; reworked v0.16.0/v0.17.0) — the DM's fight hub. Allies (present party members + NPCs)
 * and adversaries, each stat nudged by the global-direction heartbeat StatPulse (corner +/−). Adversaries
 * fall instead of delete; hold-to-multi-select drives bulk delete / convert / library / presence from a
 * BOTTOM bar (item 4). Spawning pulls from a full-screen Adversary Library overlay in adversary/ally mode
 * (items 10/11). Portraits open fullscreen (item 8). The options panel holds auto-log, sync + card archive.
 */
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Path, Polyline } from 'react-native-svg';

import { AppScreen, SectionLabel } from '@/components/app-screen';
import { ChamferBox } from '@/components/chamfer-box';
import { LoadingScreen } from '@/components/loading-screen';
import { PopupDialog } from '@/components/popup-dialog';
import { RuneButton } from '@/components/rune-button';
import { showToast } from '@/components/toast';
import { DmGap, DmType, Body, Display, DmRune } from '@/constants/theme';
import { NumberKeypad } from '@/features/character-sheet/sheet/number-keypad';
import { addTemplate, loadAdversaries, removeTemplates, saveAdversaries, type SavedAdversary } from '@/lib/adversary-library';
import { type CharacterFile } from '@/lib/character-file';
import { listCharacters } from '@/lib/character-store';
import { memberMaxes } from '@/lib/dm-vitals';
import { isPresent, type Party, togglePresent, type VitalKey } from '@/lib/party';
import { getParty, saveParty } from '@/lib/party-store';
import {
  bonusMaxes,
  grantMaxBonus,
  memberBonus,
  appendLog,
  canEditMembers,
  cloneCombatant,
  type Combatant,
  type CombatantStat,
  combatantDelta,
  combatantSet,
  completeEncounter,
  deleteLogEntries,
  editLogEntry,
  type Encounter,
  fell,
  formatStatLog,
  keepOnlyLogEntries,
  memberDelta,
  memberSet,
  memberVitals,
  moveLogEntry,
  mutateCombatant,
  newAdversary,
  newNpc,
  recover,
  restartEncounter,
  setActive,
  type Session,
} from '@/lib/session';
import { getEncounter, getSession, saveEncounter, saveSession } from '@/lib/session-store';
import { playSfx } from '@/lib/sfx';
import { isUiMuted, setUiMuted } from '@/lib/sfx-prefs';
import { AdversaryEditor } from './adversary-editor';
import { AdversaryImageViewer } from './adversary-detail';
import { AdversaryLibrary } from './adversary-library-screen';
import { CombatantPanel } from './combatant-panel';
import { DmModal, NameDialog } from './dm-ui';
import { EncounterLog } from './encounter-log';
import { MemberPanel } from './member-panel';
import { StatRadialProvider } from './stat-radial';
import { useSelection } from './use-selection';

const KEY_LABEL: Record<VitalKey, string> = { hp: 'HP', stress: 'Stress', hope: 'Hope', armor: 'Armor' };
type KeypadTarget = { kind: 'member'; charId: string; key: VitalKey } | { kind: 'combatant'; id: string; stat: CombatantStat };
type LibraryMode = 'adversary' | 'ally';

function OptionRow({ label, hint, on, onToggle }: { label: string; hint: string; on: boolean; onToggle: () => void }) {
  return (
    <Pressable onPress={onToggle} accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 }}>
      <ChamferBox chamfer={5} fill={on ? DmRune.accent : 'transparent'} stroke={DmRune.accentDim} strokeWidth={1.3} style={{ width: 46, height: 26, justifyContent: 'center', paddingHorizontal: 4 }}>
        <View style={{ width: 18, height: 18, backgroundColor: on ? DmRune.ink : DmRune.accentDim, alignSelf: on ? 'flex-end' : 'flex-start', transform: [{ rotate: '45deg' }] }} />
      </ChamferBox>
      <View style={{ flex: 1 }}>
        <Text style={{ color: DmRune.ivory, fontSize: DmType.title, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' }}>{label}</Text>
        <Text style={{ color: DmRune.muted, fontSize: DmType.body, fontFamily: Body.regular, lineHeight: 15, marginTop: 2 }}>{hint}</Text>
      </View>
    </Pressable>
  );
}

/** The bottom multi-select action bar (item 4: selection controls always live at the bottom). */
function BottomBar({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ position: 'absolute', left: 12, right: 12, bottom: 14, zIndex: 50 }}>
      <ChamferBox chamfer={10} fill="rgba(20,24,30,0.98)" stroke={DmRune.accent} strokeWidth={1.4} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, flexWrap: 'wrap' }}>
        <Text style={{ color: DmRune.accent, fontSize: DmType.body, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase', marginRight: 2 }}>{label}</Text>
        {children}
      </ChamferBox>
    </View>
  );
}

/** One height for every control in the encounter's top strip. */
const CTRL_H = 28;

export function EncounterScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [party, setParty] = useState<Party | null>(null);
  const [files, setFiles] = useState<Record<string, CharacterFile>>({});
  const [library, setLibrary] = useState<SavedAdversary[]>([]);
  const [keypad, setKeypad] = useState<KeypadTarget | null>(null);
  // v0.23.0: setting a member above their maximum asks whether it is a bonus for this fight or a
  // real raise. Adversaries are encounter-local by definition, so there is nothing to ask them.
  const [overMax, setOverMax] = useState<{ charId: string; name: string; key: VitalKey; value: number; cap: number } | null>(null);
  const [editing, setEditing] = useState<Combatant | null>(null);
  const [viewImage, setViewImage] = useState<Combatant | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [libraryMode, setLibraryMode] = useState<LibraryMode | null>(null);
  const [addingNpc, setAddingNpc] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [confirmDeleteAdv, setConfirmDeleteAdv] = useState<Set<string> | null>(null);
  // v0.22.0: the ally bar's Delete used to fire immediately while the adversary bar's confirmed —
  // two buttons apart, same word, different stakes.
  const [confirmDeleteAlly, setConfirmDeleteAlly] = useState<Set<string> | null>(null);
  const [startConflict, setStartConflict] = useState(false);
  const [restartPrompt, setRestartPrompt] = useState(false);
  const [muted, setMuted] = useState(isUiMuted); // item 6: DM-side UI-sound mute

  const advSel = useSelection();
  const allySel = useSelection();
  // Only one list selects at a time (item 4): starting one clears the other.
  const startAdv = useCallback((cid: string) => { allySel.clear(); if (advSel.selecting) advSel.toggle(cid); else advSel.start(cid); }, [advSel, allySel]);
  const startAlly = useCallback((cid: string) => { advSel.clear(); if (allySel.selecting) allySel.toggle(cid); else allySel.start(cid); }, [advSel, allySel]);

  const encRef = useRef<Encounter | null>(null); encRef.current = encounter;
  const partyRef = useRef<Party | null>(null); partyRef.current = party;
  const encTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const partyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const enc = await getEncounter(id);
      if (!enc || !live) { if (live) setEncounter(enc); return; }
      const [ses, all, lib] = await Promise.all([getSession(enc.sessionId), listCharacters(), loadAdversaries()]);
      const pty = ses ? await getParty(ses.partyId) : null;
      if (!live) return;
      setEncounter(enc); setSession(ses); setParty(pty); setLibrary(lib);
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
  const commitLibrary = useCallback((next: SavedAdversary[]) => { setLibrary(next); void saveAdversaries(next); }, []);

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

  const blockedVitals = useCallback(() => showToast('Start the encounter to change member vitals'), []);

  // --- radial apply (one discrete change → one log entry, item 2) ---
  const onMemberApply = useCallback((charId: string, key: VitalKey, delta: number) => {
    const enc = encRef.current, pty = partyRef.current, f = files[charId];
    if (!enc || !pty || !f) return;
    const from = memberVitals(enc, pty, charId)?.[key] ?? 0;
    const r = memberDelta(enc, pty, charId, key, delta, bonusMaxes(memberMaxes(f), memberBonus(enc, pty, charId)));
    const to = memberVitals(r.encounter, r.party, charId)?.[key] ?? from;
    commitParty(r.party);
    commitEncounter(r.encounter.options.autoLog && from !== to ? appendLog(r.encounter, 'stat', formatStatLog('Player', f.name, key, from, to)) : r.encounter);
  }, [files, commitParty, commitEncounter]);
  const onCombatantApply = useCallback((cid: string, stat: CombatantStat, delta: number) => {
    const r = findCombatant(cid); if (!r) return;
    const from = (stat === 'hp' ? r.c.hp : r.c.stress) ?? 0;
    const after = combatantDelta(r.c, stat, delta);
    const to = (stat === 'hp' ? after.hp : after.stress) ?? from;
    const next = updateCombatant(cid, () => after);
    if (next) commitEncounter(next.options.autoLog && from !== to ? appendLog(next, 'stat', formatStatLog(r.side, r.c.name, stat, from, to)) : next);
  }, [findCombatant, updateCombatant, commitEncounter]);

  // --- keypad set (one log entry) ---
  const onKeypadSubmit = useCallback((n: number) => {
    const enc = encRef.current, pty = partyRef.current; if (!enc || !pty || !keypad) return;
    if (keypad.kind === 'member') {
      const f = files[keypad.charId]; if (!f) { setKeypad(null); return; }
      const from = memberVitals(enc, pty, keypad.charId)?.[keypad.key] ?? 0;
      const maxes = bonusMaxes(memberMaxes(f), memberBonus(enc, pty, keypad.charId));
      const cap = keypad.key === 'hp' ? maxes.maxHp : keypad.key === 'stress' ? maxes.stressMax : keypad.key === 'hope' ? maxes.hopeMax : maxes.armorMax;
      if (n > cap) { setOverMax({ charId: keypad.charId, name: f.name, key: keypad.key, value: n, cap }); setKeypad(null); return; }
      const r = memberSet(enc, pty, keypad.charId, keypad.key, n, maxes);
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
  }, [keypad, files, findCombatant, updateCombatant, commitParty, commitEncounter]);

  /** Grant the overflow as a bonus, then set the value now that it fits. */
  const applyOverMax = useCallback((scope: 'encounter' | 'party') => {
    const enc = encRef.current, pty = partyRef.current; if (!enc || !pty || !overMax) return;
    const f = files[overMax.charId];
    const g = grantMaxBonus(enc, pty, overMax.charId, overMax.key, overMax.value - overMax.cap, scope);
    commitParty(g.party);
    const maxes = bonusMaxes(memberMaxes(f), memberBonus(g.encounter, g.party, overMax.charId));
    const from = memberVitals(g.encounter, g.party, overMax.charId)?.[overMax.key] ?? 0;
    const r = memberSet(g.encounter, g.party, overMax.charId, overMax.key, overMax.value, maxes);
    commitParty(r.party);
    let e2 = r.encounter;
    if (e2.options.autoLog) e2 = appendLog(e2, 'stat', formatStatLog('Player', f?.name ?? 'Player', overMax.key, from, overMax.value));
    commitEncounter(e2);
    setOverMax(null);
  }, [overMax, files, commitParty, commitEncounter]);

  // --- structure edits ---
  const addAdversary = useCallback(() => { const enc = encRef.current; if (!enc) return; playSfx('buttonTap'); commitEncounter({ ...enc, adversaries: [...enc.adversaries, newAdversary(enc.adversaries.length)] }); }, [commitEncounter]);
  const addNpcAlly = useCallback((name: string) => { const enc = encRef.current; if (!enc) return; setAddingNpc(false); commitEncounter({ ...enc, allies: [...enc.allies, { kind: 'npc', combatant: newNpc(name) }] }); }, [commitEncounter]);
  const fellCombatant = useCallback((cid: string) => { const next = updateCombatant(cid, (c) => fell(c)); if (next) commitEncounter(next); }, [updateCombatant, commitEncounter]);
  const recoverCombatant = useCallback((cid: string) => { const next = updateCombatant(cid, (c) => recover(c)); if (next) commitEncounter(next); }, [updateCombatant, commitEncounter]);
  const deleteCombatants = useCallback((ids: Set<string>) => {
    const enc = encRef.current; if (!enc) return;
    commitEncounter({ ...enc, adversaries: enc.adversaries.filter((c) => !ids.has(c.id)), allies: enc.allies.filter((a) => a.kind !== 'npc' || !ids.has(a.combatant.id)) });
  }, [commitEncounter]);
  const saveConfig = useCallback((c: Combatant) => { setEditing(null); const next = updateCombatant(c.id, () => c); if (next) commitEncounter(next); }, [updateCombatant, commitEncounter]);

  // --- ally <-> adversary conversion (PRD #17) ---
  const convertToAdversaries = useCallback((ids: Set<string>) => {
    const enc = encRef.current; if (!enc) return;
    const hasMember = enc.allies.some((a) => a.kind === 'member' && ids.has(a.charId));
    const moving = enc.allies.filter((a): a is { kind: 'npc'; combatant: Combatant } => a.kind === 'npc' && ids.has(a.combatant.id)).map((a) => a.combatant);
    if (hasMember) showToast('Players can’t become adversaries', 'error');
    if (moving.length === 0) return;
    commitEncounter({ ...enc, allies: enc.allies.filter((a) => a.kind !== 'npc' || !ids.has(a.combatant.id)), adversaries: [...enc.adversaries, ...moving] });
  }, [commitEncounter]);
  const convertToAllies = useCallback((ids: Set<string>) => {
    const enc = encRef.current; if (!enc) return;
    const moving = enc.adversaries.filter((c) => ids.has(c.id));
    if (moving.length === 0) return;
    commitEncounter({ ...enc, adversaries: enc.adversaries.filter((c) => !ids.has(c.id)), allies: [...enc.allies, ...moving.map((c) => ({ kind: 'npc' as const, combatant: c }))] });
  }, [commitEncounter]);

  // --- ally presence + deletion (PRD #15) ---
  const flipPresence = useCallback((ids: Set<string>) => {
    const enc = encRef.current, pty = partyRef.current; if (!enc || !pty) return;
    const members = enc.allies.filter((a) => a.kind === 'member' && ids.has(a.charId)) as { kind: 'member'; charId: string }[];
    if (members.length === 0) { showToast('Select players to change presence', 'error'); return; }
    let next = pty;
    for (const m of members) next = togglePresent(next, m.charId);
    commitParty(next);
  }, [commitParty]);
  const deleteNpcAllies = useCallback((ids: Set<string>) => {
    const enc = encRef.current; if (!enc) return;
    const hasMember = enc.allies.some((a) => a.kind === 'member' && ids.has(a.charId));
    if (hasMember) showToast('Players can’t be deleted', 'error');
    commitEncounter({ ...enc, allies: enc.allies.filter((a) => a.kind !== 'npc' || !ids.has(a.combatant.id)) });
  }, [commitEncounter]);

  // --- library (PRD #10, item 11) ---
  const saveToLibrary = useCallback((cid: string) => { const r = findCombatant(cid); if (r) { commitLibrary(addTemplate(library, r.c)); showToast('Saved to adversary library', 'success'); } }, [findCombatant, library, commitLibrary]);
  const spawnMany = useCallback((c: Combatant, count: number, as: LibraryMode) => {
    const enc = encRef.current; if (!enc) return;
    const copies = Array.from({ length: count }, () => cloneCombatant(c));
    if (as === 'ally') commitEncounter({ ...enc, allies: [...enc.allies, ...copies.map((cb) => ({ kind: 'npc' as const, combatant: cb }))] });
    else commitEncounter({ ...enc, adversaries: [...enc.adversaries, ...copies] });
  }, [commitEncounter]);

  // --- options + lifecycle ---
  const toggleAutoLog = useCallback(() => { const enc = encRef.current; if (enc) commitEncounter({ ...enc, options: { ...enc.options, autoLog: !enc.options.autoLog } }); }, [commitEncounter]);
  const toggleSync = useCallback(() => {
    const enc = encRef.current, pty = partyRef.current; if (!enc || !pty) return;
    if (enc.options.globalSync) commitEncounter({ ...enc, options: { ...enc.options, globalSync: false }, localVitals: { ...pty.global } });
    else { const { localVitals, ...rest } = enc; void localVitals; commitEncounter({ ...(rest as Encounter), options: { ...enc.options, globalSync: true } }); }
  }, [commitEncounter]);

  const doStart = useCallback(async () => {
    const enc = encRef.current, ses = session; if (!enc || !ses) return;
    playSfx('buttonTap');
    if (ses.activeEncounterId && ses.activeEncounterId !== enc.id) {
      const prev = await getEncounter(ses.activeEncounterId);
      const pty = partyRef.current;
      if (prev && pty) {
        const noted = appendLog(prev, 'note', `**Completed**, ${enc.name} was started.`);
        const done = completeEncounter(ses, noted, pty);
        await saveEncounter(done.encounter);
      }
    }
    const r = setActive(ses, enc);
    setSession(r.session); void saveSession(r.session);
    commitEncounter(r.encounter);
  }, [session, commitEncounter]);
  const onStart = useCallback(() => {
    const ses = session, enc = encRef.current; if (!ses || !enc) return;
    if (ses.activeEncounterId && ses.activeEncounterId !== enc.id) setStartConflict(true);
    else void doStart();
  }, [session, doStart]);

  const complete = useCallback(() => {
    const enc = encRef.current, pty = partyRef.current, ses = session; if (!enc || !pty || !ses) return;
    setConfirmComplete(false); playSfx('buttonTap');
    const r = completeEncounter(ses, enc, pty);
    setSession(r.session); void saveSession(r.session);
    commitEncounter(r.encounter);
  }, [session, commitEncounter]);
  const doRestart = useCallback((source: 'party' | 'encounter') => {
    const enc = encRef.current, pty = partyRef.current, ses = session; if (!enc || !pty || !ses) return;
    setRestartPrompt(false); playSfx('buttonTap');
    const r = restartEncounter(ses, enc, pty, source);
    setSession(r.session); void saveSession(r.session);
    commitParty(r.party); commitEncounter(r.encounter);
  }, [session, commitParty, commitEncounter]);

  if (!encounter) return <LoadingScreen dm label="Setting the scene" />;
  const enc = encounter;
  const editableMembers = canEditMembers(enc);
  const memberAllies = enc.allies.filter((a): a is { kind: 'member'; charId: string } => a.kind === 'member' && !!files[a.charId]);
  const npcAllies = enc.allies.filter((a): a is { kind: 'npc'; combatant: Combatant } => a.kind === 'npc');

  const keypadMax = (() => {
    if (!keypad) return 0;
    if (keypad.kind === 'member') { const f = files[keypad.charId]; const e = encRef.current, pt = partyRef.current; if (!f || !e || !pt) return 0; const m = bonusMaxes(memberMaxes(f), memberBonus(e, pt, keypad.charId)); return keypad.key === 'hp' ? m.maxHp : keypad.key === 'stress' ? m.stressMax : keypad.key === 'hope' ? m.hopeMax : m.armorMax; }
    const r = findCombatant(keypad.id); return (keypad.stat === 'hp' ? r?.c.maxHp : r?.c.maxStress) ?? 0;
  })();
  const statusColor = enc.status === 'active' ? DmRune.accent : enc.status === 'completed' ? DmRune.muted : DmRune.accentDim;

  return (
    <StatRadialProvider>
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
        {/* v0.23.0: status on its own line, then ONE row of controls all at the same 28dp height
            and on the same baseline. The lifecycle button was 40dp next to a 28dp Log and a 30dp
            archive tile, so three controls that belong together sat at three different heights. */}
        <View style={{ gap: 8, marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: statusColor }} />
            <Text style={{ color: statusColor, fontSize: DmType.body, fontFamily: Body.bold, letterSpacing: 1.4, textTransform: 'uppercase' }}>{enc.status}</Text>
            {!enc.options.globalSync ? <Text style={{ color: DmRune.muted, fontSize: DmType.micro, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>· Self-contained</Text> : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Pressable onPress={() => setShowLog(true)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Open log">
              <ChamferBox chamfer={5} fill="transparent" stroke={DmRune.line} strokeWidth={1.1} style={{ paddingHorizontal: 11, height: CTRL_H, justifyContent: 'center' }}>
                <Text style={{ color: DmRune.accent, fontSize: DmType.micro, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>Log · {enc.log.length}</Text>
              </ChamferBox>
            </Pressable>
            <View style={{ flex: 1 }}>
              {enc.status === 'prepared' ? <RuneButton label="Start encounter" kind="primary" height={CTRL_H} dense dm onPress={onStart} /> : null}
              {enc.status === 'active' ? <RuneButton label="Complete" kind="secondary" height={CTRL_H} dense dm onPress={() => setConfirmComplete(true)} /> : null}
              {enc.status === 'completed' ? <RuneButton label="Restart" kind="secondary" height={CTRL_H} dense dm onPress={() => setRestartPrompt(true)} /> : null}
            </View>
            <Pressable onPress={() => { playSfx('buttonTap'); router.push('/gallery' as Href); }} hitSlop={8} accessibilityRole="button" accessibilityLabel="Open card archive">
              <ChamferBox chamfer={5} fill="transparent" stroke={DmRune.line} strokeWidth={1.1} style={{ width: CTRL_H, height: CTRL_H, alignItems: 'center', justifyContent: 'center' }}>
                <Svg width={16} height={16} viewBox="0 0 24 24"><Path d="M7 5 H16 A2 2 0 0 1 18 7 V19 L13 16 L8 19 Z" fill="none" stroke={DmRune.accent} strokeWidth={1.7} strokeLinejoin="round" /><Path d="M6 8 V21 L11 18" fill="none" stroke={DmRune.accentDim} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" /></Svg>
              </ChamferBox>
            </Pressable>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: allySel.selecting || advSel.selecting ? 150 : 90, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <SectionLabel dm>Allies</SectionLabel>
            <View style={{ flexDirection: 'row', gap: 14 }}>
              <RuneButton label="Library" kind="ghost" height={28} dense dm onPress={() => setLibraryMode('ally')} />
              <RuneButton label="+ NPC" kind="secondary" height={28} dense dm onPress={() => setAddingNpc(true)} />
            </View>
          </View>
          {memberAllies.length === 0 && npcAllies.length === 0 ? (
            <Text style={{ color: DmRune.muted, fontSize: DmType.body, fontFamily: Body.regular, fontStyle: 'italic' }}>
              No allies yet. Present party members appear here automatically; add an NPC to fight alongside them.
            </Text>
          ) : null}
          {memberAllies.map((a) => (
            <MemberPanel
              key={a.charId}
              file={files[a.charId]}
              vitals={(partyRef.current && memberVitals(enc, partyRef.current, a.charId)) || { hp: 0, stress: 0, hope: 0, armor: 0 }}
              maxes={partyRef.current && files[a.charId] ? bonusMaxes(memberMaxes(files[a.charId]), memberBonus(enc, partyRef.current, a.charId)) : undefined}
              editable={editableMembers && !!partyRef.current}
              absent={!!partyRef.current && !isPresent(partyRef.current, a.charId)}
              selected={allySel.ids.has(a.charId)}
              onApply={(key, delta) => onMemberApply(a.charId, key, delta)}
              onRequestSet={(key) => (editableMembers ? setKeypad({ kind: 'member', charId: a.charId, key }) : blockedVitals())}
              onBlocked={blockedVitals}
              onLongPress={() => startAlly(a.charId)}
            />
          ))}
          {npcAllies.map((a) => (
            <CombatantPanel key={a.combatant.id} combatant={a.combatant} friendly selecting={allySel.selecting} selected={allySel.ids.has(a.combatant.id)}
              onApply={(s, delta) => onCombatantApply(a.combatant.id, s, delta)} onRequestSet={(s) => setKeypad({ kind: 'combatant', id: a.combatant.id, stat: s })}
              onEdit={() => setEditing(a.combatant)} onFell={() => fellCombatant(a.combatant.id)} onRecover={() => recoverCombatant(a.combatant.id)} onDelete={() => deleteCombatants(new Set([a.combatant.id]))}
              onLongPress={() => startAlly(a.combatant.id)} onToggleSelect={() => allySel.toggle(a.combatant.id)} onOpenImage={() => setViewImage(a.combatant)} />
          ))}

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: DmGap.section }}>
            <SectionLabel dm>Adversaries</SectionLabel>
            <View style={{ flexDirection: 'row', gap: 14 }}>
              <RuneButton label="Library" kind="ghost" height={28} dense dm onPress={() => setLibraryMode('adversary')} />
              <RuneButton label="+ Adversary" kind="secondary" height={28} dense dm onPress={addAdversary} />
            </View>
          </View>
          {enc.adversaries.length === 0 ? <Text style={{ color: DmRune.muted, fontSize: DmType.body, fontFamily: Body.regular, fontStyle: 'italic' }}>None yet, add one, or spawn a whole group from the library.</Text> : null}
          {enc.adversaries.map((c) => (
            <CombatantPanel key={c.id} combatant={c} selecting={advSel.selecting} selected={advSel.ids.has(c.id)}
              onApply={(s, delta) => onCombatantApply(c.id, s, delta)} onRequestSet={(s) => setKeypad({ kind: 'combatant', id: c.id, stat: s })}
              onEdit={() => setEditing(c)} onFell={() => fellCombatant(c.id)} onRecover={() => recoverCombatant(c.id)} onDelete={() => deleteCombatants(new Set([c.id]))}
              onLongPress={() => startAdv(c.id)} onToggleSelect={() => advSel.toggle(c.id)} onOpenImage={() => setViewImage(c)} />
          ))}
        </ScrollView>
      </View>

      {/* bottom multi-select bars (item 4) */}
      {allySel.selecting ? (
        <BottomBar label={`${allySel.ids.size} selected`}>
          <RuneButton label="Toggle present" kind="ghost" height={30} dense dm onPress={() => { flipPresence(allySel.ids); allySel.clear(); }} />
          <RuneButton label="Make adversary" kind="ghost" height={30} dense dm onPress={() => { convertToAdversaries(allySel.ids); allySel.clear(); }} />
          <RuneButton label="Delete" kind="ghost" height={30} dense dm onPress={() => setConfirmDeleteAlly(new Set(allySel.ids))} />
          <RuneButton label="Cancel" kind="ghost" height={30} dense dm onPress={allySel.clear} />
        </BottomBar>
      ) : advSel.selecting ? (
        <BottomBar label={`${advSel.ids.size} selected`}>
          {advSel.ids.size === 1 ? <RuneButton label="Save to Library" kind="ghost" height={30} dense dm onPress={() => { saveToLibrary([...advSel.ids][0]); advSel.clear(); }} /> : null}
          <RuneButton label="Make ally" kind="ghost" height={30} dense dm onPress={() => { convertToAllies(advSel.ids); advSel.clear(); }} />
          <RuneButton label="Delete" kind="ghost" height={30} dense dm onPress={() => setConfirmDeleteAdv(new Set(advSel.ids))} />
          <RuneButton label="Cancel" kind="ghost" height={30} dense dm onPress={advSel.clear} />
        </BottomBar>
      ) : null}

      {keypad ? (
        <NumberKeypad dm title={`Set ${keypad.kind === 'member' ? KEY_LABEL[keypad.key] : keypad.stat.toUpperCase()}`} subtitle={keypad.kind === 'member' ? `Max ${Math.max(0, keypadMax)} · go higher to grant a bonus` : `0–${Math.max(0, keypadMax)}`} min={0} max={keypad.kind === 'member' ? Math.max(0, keypadMax) + 30 : Math.max(0, keypadMax)} onSubmit={onKeypadSubmit} onClose={() => setKeypad(null)} />
      ) : null}
      {overMax ? (
        <PopupDialog
          dm
          title={`${overMax.value} is above ${overMax.name}'s maximum`}
          body={`Their ${KEY_LABEL[overMax.key]} maximum is ${overMax.cap}. Raising it by ${overMax.value - overMax.cap} can last just this fight, or stay with them.`}
          confirmLabel="Cancel"
          cancelLabel="Cancel"
          onConfirm={() => setOverMax(null)}
          onCancel={() => setOverMax(null)}>
          <View style={{ marginTop: 14, gap: 10 }}>
            <RuneButton label="Just this encounter" kind="primary" height={42} dm onPress={() => applyOverMax('encounter')} />
            <RuneButton label="Raise their maximum" kind="secondary" height={42} dm onPress={() => applyOverMax('party')} />
          </View>
        </PopupDialog>
      ) : null}
      {editing ? <AdversaryEditor initial={editing} onSave={saveConfig} onCancel={() => setEditing(null)} /> : null}
      {viewImage ? <AdversaryImageViewer uri={viewImage.portraitUri} name={viewImage.name} onClose={() => setViewImage(null)} /> : null}
      {addingNpc ? <NameDialog title="Add NPC" placeholder="NPC name" confirmLabel="Add" onConfirm={addNpcAlly} onCancel={() => setAddingNpc(false)} /> : null}
      {libraryMode ? (
        <AdversaryLibrary
          mode={libraryMode}
          savedList={library}
          onSpawn={(c, count) => spawnMany(c, count, libraryMode)}
          onDeleteSaved={(ids) => commitLibrary(removeTemplates(library, ids))}
          onClose={() => setLibraryMode(null)}
        />
      ) : null}
      {showLog ? (
        <EncounterLog
          log={enc.log}
          onAddNote={(t) => commitEncounter(appendLog(enc, 'note', t))}
          onEditNote={(lid, t) => commitEncounter({ ...enc, log: editLogEntry(enc.log, lid, t) })}
          onDeleteNote={(lid) => commitEncounter({ ...enc, log: deleteLogEntries(enc.log, new Set([lid])) })}
          onReorder={(lid, to) => commitEncounter({ ...enc, log: moveLogEntry(enc.log, lid, to) })}
          onDeleteEntries={(ids) => commitEncounter({ ...enc, log: deleteLogEntries(enc.log, ids) })}
          onKeepOnly={(ids) => commitEncounter({ ...enc, log: keepOnlyLogEntries(enc.log, ids) })}
          onClose={() => setShowLog(false)}
        />
      ) : null}

      {showOptions ? (
        <DmModal onClose={() => setShowOptions(false)} contentStyle={{ width: 330 }}>
          <ChamferBox chamfer={14} fill="rgba(12,15,20,0.99)" stroke={DmRune.lineStrong} strokeWidth={1.5} style={{ padding: 20 }}>
            <Text style={{ color: DmRune.ivory, fontSize: DmType.title, fontFamily: Display.black, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Options</Text>
            <OptionRow label="Auto-log stat changes" hint="Write every change you make to a stat into the log." on={enc.options.autoLog} onToggle={toggleAutoLog} />
            <OptionRow label="Share vitals with the party" hint="Off keeps this fight self-contained: nothing here changes the party in your other sessions." on={enc.options.globalSync} onToggle={toggleSync} />
            <OptionRow label="Mute UI sounds" hint="Silences every DM interface sound until turned back on (also toggleable from the main menu)." on={muted} onToggle={() => { setMuted((m) => { const n = !m; setUiMuted(n); if (!n) playSfx('buttonTap'); return n; }); }} />
            <View style={{ gap: 10, marginTop: 12 }}>
              <Text style={{ color: DmRune.muted, fontSize: DmType.body, fontFamily: Body.regular, lineHeight: 15, textAlign: 'center' }}>Rename this encounter by holding it in the session list. The card archive button is on the encounter, next to the log.</Text>
              <RuneButton label="Done" kind="ghost" height={44} dm onPress={() => setShowOptions(false)} />
            </View>
          </ChamferBox>
        </DmModal>
      ) : null}

      {confirmComplete ? <PopupDialog dm title="Complete encounter?" body="This freezes the party's current state onto the encounter as a record. The party keeps its live state for the next encounter." confirmLabel="Complete" onConfirm={complete} onCancel={() => setConfirmComplete(false)} /> : null}
      {confirmDeleteAlly ? <PopupDialog dm title="Remove these allies?" body={`${confirmDeleteAlly.size === 1 ? 'This ally' : `These ${confirmDeleteAlly.size} allies`} will be removed from this encounter. Player characters are never removed this way.`} confirmLabel="Remove" destructive onConfirm={() => { deleteNpcAllies(confirmDeleteAlly); setConfirmDeleteAlly(null); allySel.clear(); }} onCancel={() => setConfirmDeleteAlly(null)} /> : null}
      {confirmDeleteAdv ? <PopupDialog dm title="Delete selected?" body={`${confirmDeleteAdv.size} removed from this encounter.`} confirmLabel="Delete" destructive onConfirm={() => { deleteCombatants(confirmDeleteAdv); setConfirmDeleteAdv(null); advSel.clear(); }} onCancel={() => setConfirmDeleteAdv(null)} /> : null}
      {startConflict ? <PopupDialog dm title="Another encounter is active" body="Starting this one will complete the currently active encounter (noted in its log). Continue?" confirmLabel="Start" onConfirm={() => { setStartConflict(false); void doStart(); }} onCancel={() => setStartConflict(false)} /> : null}
      {restartPrompt ? (
        <PopupDialog
          dm
          title="Restart encounter"
          body="Downed adversaries revive at half HP either way. Choose which version of the party fights it."
          confirmLabel="Cancel"
          cancelLabel="Cancel"
          onConfirm={() => setRestartPrompt(false)}
          onCancel={() => setRestartPrompt(false)}>
          <View style={{ marginTop: 14, gap: 10 }}>
            <RuneButton label="Keep the party as it is now" kind="primary" height={44} dm onPress={() => doRestart('party')} />
            <Text style={{ color: DmRune.muted, fontSize: DmType.micro, fontFamily: Body.medium, lineHeight: 15, marginTop: -4 }}>
              Their current HP, Stress, Hope and Armor carry into the restart.
            </Text>
            <RuneButton label="Roll back to the saved snapshot" kind="secondary" height={44} dm onPress={() => doRestart('encounter')} />
            <Text style={{ color: DmRune.red, fontSize: DmType.micro, fontFamily: Body.medium, lineHeight: 15, marginTop: -4 }}>
              Overwrites the party&apos;s live vitals with the state frozen when this encounter completed. Anything
              that has happened to them since is lost.
            </Text>
          </View>
        </PopupDialog>
      ) : null}
    </AppScreen>
    </StatRadialProvider>
  );
}
