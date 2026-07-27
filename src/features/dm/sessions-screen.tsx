/**
 * Sessions (v0.15.0; reworked v0.17.0). A party is chosen from a dropdown of ALL parties — disabled ones
 * appear from creation now (item 9); selecting one that isn't enabled shows an Enable prompt inline. Below,
 * that party's sessions list newest-first; hold a session to rename or delete it (item 6). The "sessions
 * unlocked" toast fires only when the party is the first one ever enabled (item 9).
 */
import { type Href, useFocusEffect, useRouter } from 'expo-router';
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
import { DmType, Body, Display, DmRune } from '@/constants/theme';
import { type Party } from '@/lib/party';
import { listParties, setActiveParty } from '@/lib/party-store';
import { newSession, type Session } from '@/lib/session';
import { deleteEncounter, deleteSession, listEncounters, listSessions, saveSession } from '@/lib/session-store';
import { playSfx } from '@/lib/sfx';
import { DmEmpty, ColorDiamond, NameDialog } from './dm-ui';
import { useSelection } from './use-selection';

function PartyDropdown({ parties, selected, onSelect }: { parties: Party[]; selected: Party; onSelect: (p: Party) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ zIndex: 50 }}>
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityLabel={`Party: ${selected.name}. Change`}>
        <ChamferBox chamfer={10} fill="rgba(14,17,22,0.94)" stroke={DmRune.lineStrong} strokeWidth={1.4} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, height: 52 }}>
          <ColorDiamond color={selected.color} size={14} />
          <FitLine style={{ flex: 1, color: DmRune.ivory, fontSize: DmType.title, fontFamily: Display.black, letterSpacing: 1, textTransform: 'uppercase' }}>{selected.name}</FitLine>
          {!selected.enabled ? <Text style={{ color: DmRune.muted, fontSize: DmType.micro, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>Disabled</Text> : null}
          <Svg width={16} height={16} viewBox="0 0 16 16"><Polyline points="3,6 8,11 13,6" fill="none" stroke={DmRune.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
        </ChamferBox>
      </Pressable>
      {open ? (
        <ChamferBox chamfer={10} fill="rgba(10,13,18,0.99)" stroke={DmRune.line} strokeWidth={1.2} style={{ position: 'absolute', top: 58, left: 0, right: 0, paddingVertical: 4 }}>
          {parties.map((p) => (
            <Pressable key={p.id} onPress={() => { setOpen(false); onSelect(p); }} accessibilityRole="button" accessibilityLabel={p.name} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: pressed ? 'rgba(196,200,208,0.1)' : 'transparent' })}>
              <ColorDiamond color={p.color} size={12} />
              <Text style={{ flex: 1, color: p.id === selected.id ? DmRune.accent : DmRune.text, fontSize: DmType.title, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' }}>{p.name}</Text>
              {p.enabled ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: DmRune.accent }} /> : <Text style={{ color: DmRune.muted, fontSize: DmType.micro, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>Off</Text>}
            </Pressable>
          ))}
        </ChamferBox>
      ) : null}
    </View>
  );
}

export function SessionsScreen() {
  const router = useRouter();
  const [parties, setParties] = useState<Party[] | null>(null);
  const [selected, setSelected] = useState<Party | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [naming, setNaming] = useState(false);
  const [renaming, setRenaming] = useState<Session | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Set<string> | null>(null);
  const sel = useSelection();

  const loadSessions = useCallback((partyId: string) => { void listSessions(partyId).then(setSessions); }, []);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void listParties().then((all) => {
        if (!live) return;
        setParties(all); // item 9: all parties, disabled included
        setSelected((prev) => {
          const next = all.find((p) => p.id === prev?.id) ?? all.find((p) => p.enabled) ?? all[0] ?? null;
          if (next) loadSessions(next.id);
          return next;
        });
      });
      return () => { live = false; };
    }, [loadSessions]),
  );

  const create = useCallback((name: string) => {
    if (!selected) return;
    setNaming(false);
    const s = newSession(selected.id, name);
    playSfx('buttonTap');
    void saveSession(s).then(() => router.push(`/session?id=${s.id}` as Href));
  }, [selected, router]);

  /** Pick a party in the dropdown = make it the ACTIVE party (item 1: exactly one active at a time). */
  const activate = useCallback(async (p: Party) => {
    playSfx('buttonTap');
    sel.clear();
    setSelected({ ...p, enabled: true });
    loadSessions(p.id);
    const next = await setActiveParty(p.id);
    setParties(next);
    showToast(`${p.name} is now active`, 'success');
  }, [sel, loadSessions]);

  const renameSession = useCallback(async (name: string) => {
    if (!renaming) return;
    await saveSession({ ...renaming, name });
    setRenaming(null); sel.clear();
    if (selected) loadSessions(selected.id);
  }, [renaming, sel, selected, loadSessions]);

  const doDelete = useCallback(async (ids: Set<string>) => {
    setConfirmDelete(null);
    for (const sid of ids) {
      const encs = await listEncounters(sid);
      for (const e of encs) await deleteEncounter(e.id);
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
          <Text style={{ color: DmRune.muted, fontSize: DmType.body, fontFamily: Body.medium, textAlign: 'center', lineHeight: 20 }}>No parties yet.{'\n'}Create a party to run sessions.</Text>
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen title="Sessions" dm onBack={() => router.back()}>
      <View style={{ flex: 1, gap: 14 }}>
        <PartyDropdown parties={parties} selected={selected} onSelect={(p) => void activate(p)} />

        {!selected.enabled ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingBottom: 40 }}>
            <Text style={{ color: DmRune.muted, fontSize: DmType.body, fontFamily: Body.medium, textAlign: 'center', lineHeight: 20 }}>{selected.name} isn’t the active party.{'\n'}Make it active to run its sessions.</Text>
            <RuneButton label="Set active" kind="primary" height={46} dm style={{ minWidth: 200 }} onPress={() => void activate(selected)} />
          </View>
        ) : sessions.length === 0 ? (
          <DmEmpty
            title="No sessions yet"
            body={`A session is one night at the table for ${selected.name}, holding its encounters. Start the first one.`}
            actionLabel="New session"
            onAction={() => setNaming(true)}
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
                <Pressable
                  onPress={() => (sel.selecting ? sel.toggle(item.id) : router.push(`/session?id=${item.id}` as Href))}
                  onLongPress={() => (sel.selecting ? sel.toggle(item.id) : sel.start(item.id))}
                  delayLongPress={340}
                  accessibilityRole="button"
                  accessibilityLabel={item.name}>
                  {({ pressed }) => (
                    <ChamferBox chamfer={12} fill={on ? 'rgba(196,200,208,0.16)' : pressed ? 'rgba(24,28,35,0.95)' : 'rgba(14,17,22,0.9)'} stroke={on ? DmRune.accent : DmRune.line} strokeWidth={on ? 2 : 1.3} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 15 }}>
                      {sel.selecting ? (
                        <ChamferBox chamfer={4} fill={on ? DmRune.accent : 'transparent'} stroke={DmRune.accentDim} strokeWidth={1.2} style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
                          {on ? <Svg width={11} height={11} viewBox="0 0 12 12"><Polyline points="2,6 5,9 10,3" fill="none" stroke={DmRune.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg> : null}
                        </ChamferBox>
                      ) : null}
                      <View style={{ flex: 1 }}>
                        <FitLine style={{ color: DmRune.ivory, fontSize: DmType.title, fontFamily: Display.black, letterSpacing: 0.8, textTransform: 'uppercase' }}>{item.name}</FitLine>
                        <Text style={{ color: DmRune.muted, fontSize: DmType.body, fontFamily: Body.medium, marginTop: 3 }}>{new Date(item.createdAt).toLocaleDateString()}</Text>
                      </View>
                      {!sel.selecting ? <Svg width={14} height={14} viewBox="0 0 16 16"><Line x1={4} y1={2} x2={12} y2={8} stroke={DmRune.accentDim} strokeWidth={2} /><Line x1={12} y1={8} x2={4} y2={14} stroke={DmRune.accentDim} strokeWidth={2} /></Svg> : null}
                    </ChamferBox>
                  )}
                </Pressable>
              );
            }}
          />
        )}
        {selected.enabled ? (
          <View style={{ paddingBottom: 6 }}>
            <RuneButton label="New session" kind="primary" height={46} dm onPress={() => setNaming(true)} />
          </View>
        ) : null}
      </View>

      {/* bottom multi-select bar (item 4/6) */}
      {sel.selecting ? (
        <View style={{ position: 'absolute', left: 12, right: 12, bottom: 14, zIndex: 50 }}>
          <ChamferBox chamfer={10} fill="rgba(20,24,30,0.98)" stroke={DmRune.accent} strokeWidth={1.4} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, flexWrap: 'wrap' }}>
            <Text style={{ color: DmRune.accent, fontSize: DmType.body, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase', marginRight: 2 }}>{sel.ids.size} selected</Text>
            {sel.ids.size === 1 ? <RuneButton label="Rename" kind="ghost" height={30} dense dm onPress={() => { const s = sessions.find((x) => x.id === [...sel.ids][0]); if (s) setRenaming(s); }} /> : null}
            <RuneButton label="Delete" kind="ghost" height={30} dense dm onPress={() => setConfirmDelete(new Set(sel.ids))} />
            <RuneButton label="Cancel" kind="ghost" height={30} dense dm onPress={sel.clear} />
          </ChamferBox>
        </View>
      ) : null}

      {naming ? <NameDialog title="New Session" placeholder="Session name" confirmLabel="Create" onConfirm={create} onCancel={() => setNaming(false)} /> : null}
      {renaming ? <NameDialog title="Rename Session" initial={renaming.name} confirmLabel="Rename" onConfirm={(name) => void renameSession(name)} onCancel={() => setRenaming(null)} /> : null}
      {confirmDelete ? <PopupDialog dm title="Delete sessions?" body={`${confirmDelete.size} session(s) and their encounters will be removed.`} confirmLabel="Delete" destructive onConfirm={() => void doDelete(confirmDelete)} onCancel={() => setConfirmDelete(null)} /> : null}
    </AppScreen>
  );
}
