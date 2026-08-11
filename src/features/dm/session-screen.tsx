/**
 * Session (v0.15.0; reworked v0.16.0; overhauled v0.41.4) — one session's encounters, active pinned on
 * top, rest newest-first. A Players button opens the party overview; New Encounter adds "Encounter #X".
 * Hold an encounter to multi-select: delete, duplicate, or send it to another session.
 *
 * v0.41.4 (owner) adds three things. A SESSION SWITCHER at the top, matching the campaign switcher one
 * level up, so moving between two nights is one tap. An IDENTITY on every encounter, so a prepared
 * fight is recognisable before it is opened. And a send picker that reaches every campaign, with a
 * COPY beside the move.
 */
import { type Href, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import Svg, { Line, Polyline } from 'react-native-svg';

import { AppScreen } from '@/components/app-screen';
import { ChamferBox } from '@/components/chamfer-box';
import { LoadingScreen } from '@/components/loading-screen';
import { PopupDialog } from '@/components/popup-dialog';
import { RuneButton } from '@/components/rune-button';
import { showToast } from '@/components/toast';
import { DmType, Body, DmRune } from '@/constants/theme';
import { type DmIdentity } from '@/lib/dm-identity';
import { type Party } from '@/lib/party';
import { getParty, listParties } from '@/lib/party-store';
import { copyEncounterToSession, duplicateEncounter, type Encounter, moveEncounterToSession, newEncounter, newSession, nextIndex, type Session, sortedEncounters } from '@/lib/session';
import { deleteEncounter, getSession, listEncounters, listSessions, saveEncounter, saveSession } from '@/lib/session-store';
import { playSfx } from '@/lib/sfx';
import { IdentityBadge, IdentityDropdown, IdentityLines } from './dm-identity-ui';
import { EncounterMovePicker, type MoveTarget } from './encounter-move-picker';
import { IdentityEditor } from './identity-editor';
import { DmEmpty, DmPress } from './dm-ui';
import { useSelection } from './use-selection';

const STATUS_COLOR = (s: Encounter['status']) => (s === 'active' ? DmRune.accent : s === 'completed' ? DmRune.muted : DmRune.accentDim);

export function SessionScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [party, setParty] = useState<Party | null>(null);
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<Set<string> | null>(null);
  const [moving, setMoving] = useState<{ here: MoveTarget; elsewhere: MoveTarget[] } | null>(null);
  const [editing, setEditing] = useState<Encounter | null>(null);
  /** The other sessions of THIS campaign, for the switcher at the top. */
  const [siblings, setSiblings] = useState<Session[]>([]);
  const sel = useSelection();

  const reload = useCallback(() => {
    let live = true;
    void (async () => {
      const ses = await getSession(id);
      const [pty, encs, sibs] = await Promise.all([
        ses ? getParty(ses.partyId) : Promise.resolve(null),
        listEncounters(id),
        ses ? listSessions(ses.partyId) : Promise.resolve([]),
      ]);
      if (!live) return;
      setSession(ses); setParty(pty); setEncounters(encs); setSiblings(sibs);
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

  /**
   * Everywhere this encounter could go (v0.41.4, owner).
   *
   * The current campaign's other sessions lead, expanded; every other campaign is a folder. Reading
   * all of them up front is a handful of small files and makes the picker instant, which matters more
   * here than the read does: the DM opened this to make one decision.
   */
  const openMove = useCallback(async () => {
    if (!session || !party) return;
    const campaigns = await listParties();
    const here: MoveTarget = { campaign: party, sessions: (await listSessions(session.partyId)).filter((s) => s.id !== session.id) };
    const elsewhere: MoveTarget[] = [];
    for (const c of campaigns) {
      if (c.id === session.partyId) continue;
      elsewhere.push({ campaign: c, sessions: await listSessions(c.id) });
    }
    setMoving({ here, elsewhere });
  }, [session, party]);

  /** Move takes the original; copy leaves it. One function, because that is the only difference. */
  const sendTo = useCallback(async (targetId: string, mode: 'move' | 'copy') => {
    setMoving(null);
    const targetEncs = await listEncounters(targetId);
    let idx = targetEncs.length;
    for (const eid of sel.ids) {
      const e = encounters.find((x) => x.id === eid);
      if (!e) continue;
      idx += 1;
      await saveEncounter(mode === 'move' ? moveEncounterToSession(e, targetId, idx) : copyEncounterToSession(e, targetId, idx));
    }
    sel.clear(); showToast(mode === 'move' ? 'Moved' : 'Copied', 'success'); reload();
  }, [sel, encounters, reload]);
  const moveTo = useCallback((targetId: string) => sendTo(targetId, 'move'), [sendTo]);

  const moveToNew = useCallback(async () => {
    if (!session) return;
    const s = newSession(session.partyId, `Session ${new Date().toLocaleDateString()}`);
    await saveSession(s);
    await moveTo(s.id);
  }, [session, moveTo]);

  const saveIdentity = useCallback(async (idn: DmIdentity) => {
    if (!editing) return;
    await saveEncounter({ ...editing, name: idn.name, description: idn.description, color: idn.color, imageUri: idn.imageUri });
    setEditing(null); sel.clear(); reload();
  }, [editing, sel, reload]);

  if (!session) return <LoadingScreen dm label="Opening the session" />;
  const ordered = sortedEncounters(encounters, session.activeEncounterId);

  return (
    <AppScreen title={session.name} dm onBack={() => router.back()}>
      <View style={{ flex: 1, gap: 12 }}>
        {/* The session switcher (v0.41.4, owner): the same control the campaign list has, one level
            down. Choosing simply navigates; nothing is written by looking. */}
        {siblings.length > 1 ? (
          <IdentityDropdown
            label="Session"
            items={siblings}
            selected={siblings.find((s) => s.id === session.id) ?? session}
            fallback={(s) => new Date(s.createdAt).toLocaleDateString()}
            onSelect={(s) => { if (s.id !== session.id) { playSfx('buttonTap'); router.replace(`/session?id=${s.id}` as Href); } }}
          />
        ) : null}
        {ordered.length === 0 ? (
          <DmEmpty
            title="No encounters yet"
            body="An encounter holds the adversaries, the allies and the log for one fight. Prepare the first one."
            actionLabel="New encounter"
            onAction={create}
          />
        ) : (
          <FlatList
            data={ordered}
            keyExtractor={(e) => e.id}
            contentContainerStyle={{ gap: 12, paddingTop: 4, paddingBottom: sel.selecting ? 96 : 16 }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const pinned = item.id === session.activeEncounterId;
              const on = sel.ids.has(item.id);
              return (
                <DmPress
                  onPress={() => (sel.selecting ? sel.toggle(item.id) : router.push(`/encounter?id=${item.id}` as Href))}
                  onLongPress={() => (sel.selecting ? sel.toggle(item.id) : sel.start(item.id))}
                  delayLongPress={340}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name}, ${item.status}`}>
                  {({ pressed }) => (
                    <ChamferBox chamfer={12} fill={on ? 'rgba(196,200,208,0.16)' : pressed ? 'rgba(24,28,35,0.95)' : 'rgba(14,17,22,0.9)'} stroke={on ? DmRune.accent : pinned ? DmRune.accent : DmRune.line} strokeWidth={on ? 2 : pinned ? 1.6 : 1.3} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 15 }}>
                      {sel.selecting ? (
                        <ChamferBox chamfer={4} fill={on ? DmRune.accent : 'transparent'} stroke={DmRune.accentDim} strokeWidth={1.2} style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
                          {on ? <Svg width={11} height={11} viewBox="0 0 12 12"><Polyline points="2,6 5,9 10,3" fill="none" stroke={DmRune.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg> : null}
                        </ChamferBox>
                      ) : (
                        <View>
                          <IdentityBadge id={item} size={42} />
                          {/* The status dot rides the badge's corner rather than taking a column of
                              its own: prepared, active or finished is a detail OF the encounter. */}
                          <View style={{ position: 'absolute', right: -3, top: -3, width: 11, height: 11, borderRadius: 6, borderWidth: 2, borderColor: 'rgba(14,17,22,1)', backgroundColor: STATUS_COLOR(item.status) }} />
                        </View>
                      )}
                      <IdentityLines id={item} fallback={`${pinned ? 'Active · ' : ''}${item.adversaries.length} ${item.adversaries.length === 1 ? 'adversary' : 'adversaries'}`} />
                      {!sel.selecting ? <Svg width={14} height={14} viewBox="0 0 16 16"><Line x1={4} y1={2} x2={12} y2={8} stroke={DmRune.accentDim} strokeWidth={2} /><Line x1={12} y1={8} x2={4} y2={14} stroke={DmRune.accentDim} strokeWidth={2} /></Svg> : null}
                    </ChamferBox>
                  )}
                </DmPress>
              );
            }}
          />
        )}
        <View style={{ flexDirection: 'row', gap: 10, paddingTop: 8, paddingBottom: 6 }}>
          <RuneButton label="Party sheet" kind="secondary" height={46} dm style={{ flex: 1 }} onPress={() => party && router.push(`/party-overview?partyId=${party.id}` as Href)} />
          <RuneButton label="New encounter" kind="primary" height={46} dm style={{ flex: 1.4 }} onPress={create} />
        </View>
      </View>

      {/* bottom multi-select bar (item 4) */}
      {sel.selecting ? (
        <View style={{ position: 'absolute', left: 12, right: 12, bottom: 14, zIndex: 50 }}>
          <ChamferBox chamfer={10} fill="rgba(20,24,30,0.98)" stroke={DmRune.accent} strokeWidth={1.4} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, flexWrap: 'wrap' }}>
            <Text style={{ color: DmRune.accent, fontSize: DmType.body, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase', marginRight: 2 }}>{sel.ids.size} selected</Text>
            {sel.ids.size === 1 ? <RuneButton label="Edit details" kind="ghost" height={30} dense dm onPress={() => { const e = ordered.find((x) => x.id === [...sel.ids][0]); if (e) setEditing(e); }} /> : null}
            {sel.ids.size === 1 ? <RuneButton label="Duplicate" kind="ghost" height={30} dense dm onPress={duplicate} /> : null}
            <RuneButton label="Move" kind="ghost" height={30} dense dm onPress={() => void openMove()} />
            <RuneButton label="Delete" kind="ghost" height={30} dense dm onPress={() => setConfirmDelete(new Set(sel.ids))} />
            <RuneButton label="Cancel" kind="ghost" height={30} dense dm onPress={sel.clear} />
          </ChamferBox>
        </View>
      ) : null}

      {confirmDelete ? <PopupDialog dm title="Delete encounters?" body={`${confirmDelete.size} removed.`} confirmLabel="Delete" destructive onConfirm={() => void doDelete(confirmDelete)} onCancel={() => setConfirmDelete(null)} /> : null}
      {moving ? (
        <EncounterMovePicker
          count={sel.ids.size}
          here={moving.here}
          elsewhere={moving.elsewhere}
          onMove={(sid) => void sendTo(sid, 'move')}
          onCopy={(sid) => void sendTo(sid, 'copy')}
          onNewSession={() => void moveToNew()}
          onCancel={() => setMoving(null)}
        />
      ) : null}
      {editing ? <IdentityEditor title="Edit encounter" namePlaceholder="Encounter" initial={editing} onSave={(idn) => void saveIdentity(idn)} onCancel={() => setEditing(null)} /> : null}
    </AppScreen>
  );
}
