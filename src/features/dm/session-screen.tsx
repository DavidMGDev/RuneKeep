/**
 * Session (v0.15.0; reworked v0.16.0) — one session's encounters, active pinned on top, rest newest-first.
 * A Players button opens the party overview; New Encounter adds "Encounter #X". Hold an encounter to
 * multi-select: delete (confirm), duplicate (single), or move to an existing/new session (PRD #8/#9).
 */
import { type Href, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import Svg, { Line, Polyline } from 'react-native-svg';

import { AppScreen } from '@/components/app-screen';
import { ChamferBox } from '@/components/chamfer-box';
import { FitLine } from '@/components/fit-line';
import { LoadingScreen } from '@/components/loading-screen';
import { PopupDialog } from '@/components/popup-dialog';
import { RuneButton } from '@/components/rune-button';
import { showToast } from '@/components/toast';
import { Body, Display, DmRune } from '@/constants/theme';
import { type Party } from '@/lib/party';
import { getParty } from '@/lib/party-store';
import { duplicateEncounter, type Encounter, moveEncounterToSession, newEncounter, newSession, nextIndex, type Session, sortedEncounters } from '@/lib/session';
import { deleteEncounter, getSession, listEncounters, listSessions, saveEncounter, saveSession } from '@/lib/session-store';
import { playSfx } from '@/lib/sfx';
import { DmModal } from './dm-ui';
import { useSelection } from './use-selection';

const STATUS_COLOR = (s: Encounter['status']) => (s === 'active' ? DmRune.accent : s === 'completed' ? DmRune.muted : DmRune.accentDim);

/** Choose an existing session (of this party, not the current one) or a new one to move encounters to. */
function MoveTargetPicker({ sessions, onPick, onNew, onCancel }: { sessions: Session[]; onPick: (id: string) => void; onNew: () => void; onCancel: () => void }) {
  return (
    <DmModal onClose={onCancel}>
      <ChamferBox chamfer={14} fill="rgba(12,15,20,0.99)" stroke={DmRune.lineStrong} strokeWidth={1.5} style={{ width: 312, padding: 20, gap: 6 }}>
        <Text style={{ color: DmRune.ivory, fontSize: 16, fontFamily: Display.black, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Move to session</Text>
        {sessions.map((s) => (
          <Pressable key={s.id} onPress={() => onPick(s.id)} accessibilityRole="button" accessibilityLabel={s.name} style={({ pressed }) => ({ paddingVertical: 12, paddingHorizontal: 8, backgroundColor: pressed ? 'rgba(196,200,208,0.1)' : 'transparent', borderRadius: 6 })}>
            <Text style={{ color: DmRune.text, fontSize: 14, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' }}>{s.name}</Text>
          </Pressable>
        ))}
        <View style={{ marginTop: 8, gap: 8 }}>
          <RuneButton label="New session" kind="secondary" height={42} dm onPress={onNew} />
          <RuneButton label="Cancel" kind="ghost" height={42} dm onPress={onCancel} />
        </View>
      </ChamferBox>
    </DmModal>
  );
}

export function SessionScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [party, setParty] = useState<Party | null>(null);
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<Set<string> | null>(null);
  const [moving, setMoving] = useState<Session[] | null>(null);
  const sel = useSelection();

  const reload = useCallback(() => {
    let live = true;
    void (async () => {
      const ses = await getSession(id);
      const [pty, encs] = await Promise.all([ses ? getParty(ses.partyId) : Promise.resolve(null), listEncounters(id)]);
      if (!live) return;
      setSession(ses); setParty(pty); setEncounters(encs);
    })();
    return () => { live = false; };
  }, [id]);
  useFocusEffect(reload);

  const create = useCallback(() => {
    if (!session || !party) return;
    const enc = newEncounter(session, party, nextIndex(encounters));
    playSfx('buttonTap');
    void saveEncounter(enc).then(() => router.push(`/encounter?id=${enc.id}` as Href));
  }, [session, party, encounters, router]);

  const duplicate = useCallback(async () => {
    const eid = [...sel.ids][0];
    const e = encounters.find((x) => x.id === eid);
    if (!e) return;
    await saveEncounter(duplicateEncounter(e, nextIndex(encounters)));
    sel.clear(); showToast('Encounter duplicated', 'success'); reload();
  }, [sel, encounters, reload]);

  const doDelete = useCallback(async (ids: Set<string>) => {
    setConfirmDelete(null);
    if (session?.activeEncounterId && ids.has(session.activeEncounterId)) await saveSession({ ...session, activeEncounterId: undefined });
    for (const eid of ids) await deleteEncounter(eid);
    sel.clear(); showToast('Deleted', 'success'); reload();
  }, [session, sel, reload]);

  const openMove = useCallback(async () => {
    if (!session) return;
    const all = await listSessions(session.partyId);
    setMoving(all.filter((s) => s.id !== session.id));
  }, [session]);

  const moveTo = useCallback(async (targetId: string) => {
    setMoving(null);
    const targetEncs = await listEncounters(targetId);
    let idx = targetEncs.length;
    for (const eid of sel.ids) {
      const e = encounters.find((x) => x.id === eid);
      if (!e) continue;
      idx += 1;
      await saveEncounter(moveEncounterToSession(e, targetId, idx));
    }
    sel.clear(); showToast('Moved', 'success'); reload();
  }, [sel, encounters, reload]);

  const moveToNew = useCallback(async () => {
    if (!session) return;
    const s = newSession(session.partyId, `Session ${new Date().toLocaleDateString()}`);
    await saveSession(s);
    await moveTo(s.id);
  }, [session, moveTo]);

  if (!session) return <LoadingScreen label="Opening the session" />;
  const ordered = sortedEncounters(encounters, session.activeEncounterId);

  return (
    <AppScreen title={session.name} dm onBack={() => router.back()}>
      <View style={{ flex: 1 }}>
        {sel.selecting ? (
          <ChamferBox chamfer={9} fill="rgba(20,24,30,0.96)" stroke={DmRune.accent} strokeWidth={1.4} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 10, flexWrap: 'wrap' }}>
            <Text style={{ color: DmRune.accent, fontSize: 11, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase', marginRight: 4 }}>{sel.ids.size} selected</Text>
            {sel.ids.size === 1 ? <RuneButton label="Duplicate" kind="ghost" height={30} dense dm onPress={duplicate} /> : null}
            <RuneButton label="Move" kind="ghost" height={30} dense dm onPress={openMove} />
            <RuneButton label="Delete" kind="ghost" height={30} dense dm onPress={() => setConfirmDelete(new Set(sel.ids))} />
            <RuneButton label="Cancel" kind="ghost" height={30} dense dm onPress={sel.clear} />
          </ChamferBox>
        ) : null}

        {ordered.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 40 }}>
            <Text style={{ color: DmRune.muted, fontSize: 13, fontFamily: Body.medium, textAlign: 'center', lineHeight: 20 }}>No encounters yet.{'\n'}Prepare the first one.</Text>
          </View>
        ) : (
          <FlatList
            data={ordered}
            keyExtractor={(e) => e.id}
            contentContainerStyle={{ gap: 12, paddingTop: 4, paddingBottom: 16 }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const pinned = item.id === session.activeEncounterId;
              const on = sel.ids.has(item.id);
              return (
                <Pressable
                  onPress={() => (sel.selecting ? sel.toggle(item.id) : router.push(`/encounter?id=${item.id}` as Href))}
                  onLongPress={() => (sel.selecting ? sel.toggle(item.id) : sel.start(item.id))}
                  delayLongPress={340}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name}, ${item.status}`}>
                  {({ pressed }) => (
                    <ChamferBox chamfer={12} fill={pressed || on ? 'rgba(24,28,35,0.95)' : 'rgba(14,17,22,0.9)'} stroke={on ? DmRune.accent : pinned ? DmRune.accent : DmRune.line} strokeWidth={on || pinned ? 1.6 : 1.3} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 15 }}>
                      {sel.selecting ? (
                        <ChamferBox chamfer={4} fill={on ? DmRune.accent : 'transparent'} stroke={DmRune.accentDim} strokeWidth={1.2} style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
                          {on ? <Svg width={11} height={11} viewBox="0 0 12 12"><Polyline points="2,6 5,9 10,3" fill="none" stroke={DmRune.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg> : null}
                        </ChamferBox>
                      ) : (
                        <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: STATUS_COLOR(item.status) }} />
                      )}
                      <View style={{ flex: 1 }}>
                        <FitLine style={{ color: DmRune.ivory, fontSize: 17, fontFamily: Display.black, letterSpacing: 0.8, textTransform: 'uppercase' }}>{item.name}</FitLine>
                        <Text style={{ color: DmRune.muted, fontSize: 11, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase', marginTop: 3 }}>
                          {pinned ? 'Active · ' : ''}{item.adversaries.length} {item.adversaries.length === 1 ? 'Adversary' : 'Adversaries'}
                        </Text>
                      </View>
                      {!sel.selecting ? <Svg width={14} height={14} viewBox="0 0 16 16"><Line x1={4} y1={2} x2={12} y2={8} stroke={DmRune.accentDim} strokeWidth={2} /><Line x1={12} y1={8} x2={4} y2={14} stroke={DmRune.accentDim} strokeWidth={2} /></Svg> : null}
                    </ChamferBox>
                  )}
                </Pressable>
              );
            }}
          />
        )}
        <View style={{ flexDirection: 'row', gap: 10, paddingTop: 8, paddingBottom: 6 }}>
          <RuneButton label="Players" kind="secondary" height={46} dm style={{ flex: 1 }} onPress={() => party && router.push(`/party-overview?partyId=${party.id}` as Href)} />
          <RuneButton label="New encounter" kind="primary" height={46} dm style={{ flex: 1.4 }} onPress={create} />
        </View>
      </View>

      {confirmDelete ? <PopupDialog title="Delete encounters?" body={`${confirmDelete.size} encounter(s) will be removed.`} confirmLabel="Delete" destructive onConfirm={() => void doDelete(confirmDelete)} onCancel={() => setConfirmDelete(null)} /> : null}
      {moving ? <MoveTargetPicker sessions={moving} onPick={(sid) => void moveTo(sid)} onNew={() => void moveToNew()} onCancel={() => setMoving(null)} /> : null}
    </AppScreen>
  );
}
