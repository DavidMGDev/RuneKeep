/**
 * Sessions (v0.15.0; reworked v0.17.0; overhauled v0.41.4, owner).
 *
 * A campaign's nights at the table. The campaign is chosen from the dropdown at the top, which now
 * shows each one's picture, title and description rather than a colour diamond and a name, so a DM
 * running two games can tell them apart without opening either.
 *
 * The big change is what choosing does: NOTHING but change what is on screen. There is no active
 * campaign any more. The screen arrives with a campaign id in the route (from the campaign list) and
 * the dropdown moves between them, and no state is written by looking.
 *
 * A session carries the same identity a campaign does, and holding one opens the same editor.
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
import { Body, DmRune, DmType } from '@/constants/theme';
import { type DmIdentity } from '@/lib/dm-identity';
import { type Party } from '@/lib/party';
import { listParties } from '@/lib/party-store';
import { type EncounterStatus, newSession, type Session } from '@/lib/session';
import { deleteEncounter, deleteSession, listEncounters, listSessions, saveSession } from '@/lib/session-store';
import { playSfx } from '@/lib/sfx';
import { IdentityBadge, IdentityDropdown, IdentityLines } from './dm-identity-ui';
import { DmEmpty, DmPress } from './dm-ui';
import { IdentityEditor } from './identity-editor';
import { useSelection } from './use-selection';

/**
 * A session's encounters, as bullets (v0.36, owner).
 *
 * ALL of them (owner), not a sample: the list is the answer to "which night was that", and a session
 * you have to open to identify is the thing this replaced. A finished encounter is greyed, which makes
 * the list double as a record of how far the night actually got.
 */
function EncounterBullets({ list }: { list?: { id: string; name: string; status: EncounterStatus }[] }) {
  if (!list) return null; // still reading; a spinner per row would be noisier than the wait
  if (list.length === 0) {
    return <Text style={{ color: DmRune.muted, fontSize: DmType.micro, fontFamily: Body.italic, marginTop: 5 }}>No encounters yet</Text>;
  }
  return (
    <View style={{ marginTop: 6, gap: 2 }}>
      {list.map((e) => (
        <Text
          key={e.id}
          numberOfLines={1}
          style={{ color: e.status === 'completed' ? DmRune.muted : e.status === 'active' ? DmRune.accent : DmRune.text, fontSize: DmType.micro, fontFamily: Body.medium, lineHeight: 15 }}>
          {'•'} {e.name}
        </Text>
      ))}
    </View>
  );
}

export function SessionsScreen() {
  const router = useRouter();
  const { campaign } = useLocalSearchParams<{ campaign?: string }>();
  const [parties, setParties] = useState<Party[] | null>(null);
  const [selected, setSelected] = useState<Party | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Session | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Set<string> | null>(null);
  const sel = useSelection();
  const [encs, setEncs] = useState<Record<string, { id: string; name: string; status: EncounterStatus }[]>>({});

  const loadSessions = useCallback((partyId: string) => {
    void listSessions(partyId).then(async (list) => {
      setSessions(list);
      // A campaign has a handful of sessions, so reading their encounters up front costs less than a
      // per-row loader would, and the list never reflows as they arrive one at a time.
      const found: Record<string, { id: string; name: string; status: EncounterStatus }[]> = {};
      for (const s of list) found[s.id] = (await listEncounters(s.id)).map((e) => ({ id: e.id, name: e.name, status: e.status }));
      setEncs(found);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void listParties().then((all) => {
        if (!live) return;
        setParties(all);
        setSelected((prev) => {
          // The route wins on arrival, then whatever the dropdown last chose, then the first campaign.
          const next = all.find((p) => p.id === prev?.id) ?? all.find((p) => p.id === campaign) ?? all[0] ?? null;
          if (next) loadSessions(next.id);
          return next;
        });
      });
      return () => { live = false; };
    }, [loadSessions, campaign]),
  );

  const create = useCallback((id: DmIdentity) => {
    if (!selected) return;
    setCreating(false);
    const s = { ...newSession(selected.id, id.name), description: id.description, color: id.color, imageUri: id.imageUri };
    playSfx('buttonTap');
    void saveSession(s).then(() => router.push(`/session?id=${s.id}` as Href));
  }, [selected, router]);

  /** Choosing in the dropdown changes what is SHOWN and writes nothing (v0.41.4: no active campaign). */
  const choose = useCallback((p: Party) => {
    playSfx('buttonTap');
    sel.clear();
    setSelected(p);
    loadSessions(p.id);
  }, [sel, loadSessions]);

  const saveIdentity = useCallback(async (id: DmIdentity) => {
    if (!editing) return;
    await saveSession({ ...editing, name: id.name, description: id.description, color: id.color, imageUri: id.imageUri });
    setEditing(null); sel.clear();
    if (selected) loadSessions(selected.id);
  }, [editing, sel, selected, loadSessions]);

  const doDelete = useCallback(async (ids: Set<string>) => {
    setConfirmDelete(null);
    for (const sid of ids) {
      for (const e of await listEncounters(sid)) await deleteEncounter(e.id);
      await deleteSession(sid);
    }
    sel.clear(); showToast('Deleted', 'success');
    if (selected) loadSessions(selected.id);
  }, [sel, selected, loadSessions]);

  if (!parties) return <LoadingScreen dm label="Opening the ledger" />;
  if (!selected) {
    return (
      <AppScreen title="Sessions" dm onBack={() => router.back()}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 40 }}>
          <Text style={{ color: DmRune.muted, fontSize: DmType.body, fontFamily: Body.medium, textAlign: 'center', lineHeight: 20 }}>No campaigns yet.{'\n'}Create one to run its sessions.</Text>
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen title="Sessions" dm onBack={() => router.back()}>
      <View style={{ flex: 1, gap: 14 }}>
        <IdentityDropdown
          label="Campaign"
          items={parties}
          selected={selected}
          fallback={(p) => `${p.memberIds.length} ${p.memberIds.length === 1 ? 'character' : 'characters'}`}
          onSelect={choose}
        />

        {sessions.length === 0 ? (
          <DmEmpty
            title="No sessions yet"
            body={`A session is one night at the table for ${selected.name}, holding its encounters. Start the first one.`}
            actionLabel="New session"
            onAction={() => setCreating(true)}
          />
        ) : (
          <FlatList
            data={sessions}
            keyExtractor={(s) => s.id}
            contentContainerStyle={{ gap: 12, paddingBottom: sel.selecting ? 76 : 16 }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const on = sel.ids.has(item.id);
              return (
                <DmPress
                  onPress={() => (sel.selecting ? sel.toggle(item.id) : router.push(`/session?id=${item.id}` as Href))}
                  onLongPress={() => (sel.selecting ? sel.toggle(item.id) : sel.start(item.id))}
                  delayLongPress={340}
                  accessibilityRole="button"
                  accessibilityLabel={item.name}>
                  {({ pressed }) => (
                    <ChamferBox chamfer={12} fill={on ? 'rgba(196,200,208,0.16)' : pressed ? 'rgba(24,28,35,0.95)' : 'rgba(14,17,22,0.9)'} stroke={on ? DmRune.accent : DmRune.line} strokeWidth={on ? 2 : 1.3} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 }}>
                      {sel.selecting ? (
                        <ChamferBox chamfer={4} fill={on ? DmRune.accent : 'transparent'} stroke={DmRune.accentDim} strokeWidth={1.2} style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
                          {on ? <Svg width={11} height={11} viewBox="0 0 12 12"><Polyline points="2,6 5,9 10,3" fill="none" stroke={DmRune.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg> : null}
                        </ChamferBox>
                      ) : (
                        <IdentityBadge id={item} size={44} />
                      )}
                      <View style={{ flex: 1 }}>
                        <IdentityLines id={item} fallback={new Date(item.createdAt).toLocaleDateString()} />
                        <EncounterBullets list={encs[item.id]} />
                      </View>
                      {!sel.selecting ? <Svg width={14} height={14} viewBox="0 0 16 16"><Line x1={4} y1={2} x2={12} y2={8} stroke={DmRune.accentDim} strokeWidth={2} /><Line x1={12} y1={8} x2={4} y2={14} stroke={DmRune.accentDim} strokeWidth={2} /></Svg> : null}
                    </ChamferBox>
                  )}
                </DmPress>
              );
            }}
          />
        )}
        <View style={{ paddingBottom: 6 }}>
          <RuneButton label="New session" kind="primary" height={46} dm onPress={() => setCreating(true)} />
        </View>
      </View>

      {sel.selecting ? (
        <View style={{ position: 'absolute', left: 12, right: 12, bottom: 14, zIndex: 50 }}>
          <ChamferBox chamfer={10} fill="rgba(20,24,30,0.98)" stroke={DmRune.accent} strokeWidth={1.4} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, flexWrap: 'wrap' }}>
            <Text style={{ color: DmRune.accent, fontSize: DmType.body, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase', marginRight: 2 }}>{sel.ids.size} selected</Text>
            {sel.ids.size === 1 ? <RuneButton label="Edit details" kind="ghost" height={30} dense dm onPress={() => { const s = sessions.find((x) => x.id === [...sel.ids][0]); if (s) setEditing(s); }} /> : null}
            <RuneButton label="Delete" kind="ghost" height={30} dense dm onPress={() => setConfirmDelete(new Set(sel.ids))} />
            <RuneButton label="Cancel" kind="ghost" height={30} dense dm onPress={sel.clear} />
          </ChamferBox>
        </View>
      ) : null}

      {creating ? <IdentityEditor title="New session" namePlaceholder="Session" initial={{ name: '' }} confirmLabel="Create" onSave={create} onCancel={() => setCreating(false)} /> : null}
      {editing ? <IdentityEditor title="Edit session" namePlaceholder="Session" initial={editing} onSave={(id) => void saveIdentity(id)} onCancel={() => setEditing(null)} /> : null}
      {confirmDelete ? <PopupDialog dm title="Delete sessions?" body={`${confirmDelete.size} and their encounters will be removed.`} confirmLabel="Delete" destructive onConfirm={() => void doDelete(confirmDelete)} onCancel={() => setConfirmDelete(null)} /> : null}
    </AppScreen>
  );
}
