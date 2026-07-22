/**
 * Party editor (v0.15.0, PRD #12-17). Manage a party's members: add characters from the roster
 * (multi-select, very like the player character picker) or import one; toggle each member present/absent;
 * remove; rename / re-roll colour; and Enable the party (which unlocks Sessions). No character CREATION
 * here (PRD #15) — only select/import existing ones.
 */
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Polygon, Polyline } from 'react-native-svg';

import { AppScreen, SectionLabel } from '@/components/app-screen';
import { ChamferBox } from '@/components/chamfer-box';
import { FitLine } from '@/components/fit-line';
import { LoadingScreen } from '@/components/loading-screen';
import { PopupDialog } from '@/components/popup-dialog';
import { RuneButton } from '@/components/rune-button';
import { classColor, classInfo } from '@/constants/identity';
import { Body, Display, DmRune } from '@/constants/theme';
import { type CharacterFile } from '@/lib/character-file';
import { importCharacter, listCharacters } from '@/lib/character-store';
import { initialVitals } from '@/lib/dm-vitals';
import { addMembers, isPresent, type Party, randomColor, removeMember, togglePresent } from '@/lib/party';
import { deleteParty, getParty, saveParty } from '@/lib/party-store';
import { playSfx } from '@/lib/sfx';
import { showToast } from '@/components/toast';
import { ColorDiamond, NameDialog } from './dm-ui';

function Portrait({ uri, tint }: { uri: string | null; tint: string }) {
  return (
    <ChamferBox chamfer={6} fill={DmRune.ink} stroke={tint} strokeWidth={1.3} style={{ width: 46, height: 46, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {uri ? <Image source={{ uri }} style={{ width: 46, height: 46 }} resizeMode="cover" /> : (
        <Svg width={20} height={20} viewBox="0 0 26 26"><Polygon points="13,2 23,12 23,14 13,24 3,14 3,12" fill="none" stroke={DmRune.accentDim} strokeWidth={1.6} strokeLinejoin="miter" /></Svg>
      )}
    </ChamferBox>
  );
}

function MemberRow({ file, present, onTogglePresent, onRemove }: { file: CharacterFile; present: boolean; onTogglePresent: () => void; onRemove: () => void }) {
  const cls = classInfo(file.className);
  return (
    <ChamferBox chamfer={10} fill="rgba(14,17,22,0.9)" stroke={DmRune.line} strokeWidth={1.2} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, opacity: present ? 1 : 0.5 }}>
      <Portrait uri={file.portraitUri} tint={classColor(file.className).bright} />
      <View style={{ flex: 1 }}>
        <FitLine style={{ color: DmRune.ivory, fontSize: 15, fontFamily: Display.black, letterSpacing: 0.6, textTransform: 'uppercase' }}>{file.name}</FitLine>
        <Text style={{ color: DmRune.muted, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 3 }}>Lvl {file.level} {cls.label}</Text>
      </View>
      <Pressable onPress={onTogglePresent} hitSlop={8} accessibilityRole="button" accessibilityLabel={present ? `${file.name} present` : `${file.name} absent`}>
        <ChamferBox chamfer={5} fill={present ? 'rgba(196,200,208,0.14)' : 'transparent'} stroke={present ? DmRune.accent : DmRune.line} strokeWidth={1.1} style={{ paddingHorizontal: 9, height: 26, justifyContent: 'center' }}>
          <Text style={{ color: present ? DmRune.accent : DmRune.muted, fontSize: 9.5, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>{present ? 'Present' : 'Absent'}</Text>
        </ChamferBox>
      </Pressable>
      <Pressable onPress={onRemove} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${file.name}`}>
        <Svg width={16} height={16} viewBox="0 0 16 16"><Line x1={3} y1={3} x2={13} y2={13} stroke={DmRune.red} strokeWidth={2} /><Line x1={13} y1={3} x2={3} y2={13} stroke={DmRune.red} strokeWidth={2} /></Svg>
      </Pressable>
    </ChamferBox>
  );
}

/** The multi-select over roster characters not already in the party (PRD #13/#14). */
function MemberPicker({ candidates, onCancel, onAdd, onImport }: { candidates: CharacterFile[]; onCancel: () => void; onAdd: (ids: string[]) => void; onImport: () => void }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 300, backgroundColor: 'rgba(6,8,13,0.92)', paddingHorizontal: 18, paddingTop: 60, paddingBottom: 20 }]}>
      <SectionLabel dm style={{ marginBottom: 10 }}>Add characters</SectionLabel>
      {candidates.length === 0 ? (
        <Text style={{ color: DmRune.muted, fontSize: 13, fontFamily: Body.medium, textAlign: 'center', marginTop: 30 }}>Every roster character is already in this party. Import one to add more.</Text>
      ) : (
        <FlatList
          data={candidates}
          keyExtractor={(f) => f.id}
          contentContainerStyle={{ gap: 10, paddingBottom: 10 }}
          renderItem={({ item }) => {
            const on = sel.has(item.id);
            const cls = classInfo(item.className);
            return (
              <Pressable onPress={() => toggle(item.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={item.name}>
                <ChamferBox chamfer={10} fill={on ? 'rgba(196,200,208,0.14)' : 'rgba(14,17,22,0.9)'} stroke={on ? DmRune.accent : DmRune.line} strokeWidth={on ? 1.5 : 1.2} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10 }}>
                  <Portrait uri={item.portraitUri} tint={classColor(item.className).bright} />
                  <View style={{ flex: 1 }}>
                    <FitLine style={{ color: DmRune.ivory, fontSize: 15, fontFamily: Display.black, letterSpacing: 0.6, textTransform: 'uppercase' }}>{item.name}</FitLine>
                    <Text style={{ color: DmRune.muted, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 3 }}>Lvl {item.level} {cls.label}</Text>
                  </View>
                  <ChamferBox chamfer={4} fill={on ? DmRune.accent : 'transparent'} stroke={DmRune.accentDim} strokeWidth={1.2} style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
                    {on ? <Svg width={12} height={12} viewBox="0 0 12 12"><Polyline points="2,6 5,9 10,3" fill="none" stroke={DmRune.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg> : null}
                  </ChamferBox>
                </ChamferBox>
              </Pressable>
            );
          }}
        />
      )}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
        <RuneButton label="Cancel" kind="ghost" height={46} dm style={{ flex: 1 }} onPress={onCancel} />
        <RuneButton label="Import" kind="secondary" height={46} dm style={{ flex: 1 }} onPress={onImport} />
        <RuneButton label={`Add ${sel.size || ''}`.trim()} kind="primary" height={46} dm disabled={sel.size === 0} style={{ flex: 1.4 }} onPress={() => onAdd([...sel])} />
      </View>
    </View>
  );
}

export function PartyEditorScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [party, setParty] = useState<Party | null>(null);
  const [roster, setRoster] = useState<CharacterFile[]>([]);
  const [picking, setPicking] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(() => {
    let live = true;
    void Promise.all([getParty(id), listCharacters()]).then(([p, all]) => { if (live) { setParty(p); setRoster(all); } });
    return () => { live = false; };
  }, [id]);
  useEffect(load, [load]);

  const commit = useCallback((next: Party) => { setParty(next); void saveParty(next); }, []);
  const fileFor = useCallback((cid: string) => roster.find((f) => f.id === cid), [roster]);

  const addSelected = useCallback((ids: string[]) => {
    if (!party) return;
    const entries = ids.map((cid) => fileFor(cid)).filter((f): f is CharacterFile => !!f).map((f) => ({ charId: f.id, vitals: initialVitals(f) }));
    playSfx('selectCharacter');
    commit(addMembers(party, entries));
    setPicking(false);
  }, [party, fileFor, commit]);

  const onImport = useCallback(async () => {
    const imported = await importCharacter();
    if (imported && party) {
      const all = await listCharacters();
      setRoster(all);
      const f = all.find((c) => c.id === imported.id) ?? imported;
      commit(addMembers(party, [{ charId: f.id, vitals: initialVitals(f) }]));
      setPicking(false);
    }
  }, [party, commit]);

  if (!party) return <LoadingScreen label="Reading the party" />;

  const candidates = roster.filter((f) => !party.memberIds.includes(f.id));
  const canEnable = party.memberIds.length > 0;

  return (
    <AppScreen
      title={party.name}
      dm
      onBack={() => router.back()}
      headerRight={
        <Pressable onPress={() => commit({ ...party, color: randomColor() })} hitSlop={10} accessibilityRole="button" accessibilityLabel="Re-roll party colour">
          <ColorDiamond color={party.color} size={16} />
        </Pressable>
      }>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <SectionLabel dm>{party.memberIds.length} {party.memberIds.length === 1 ? 'Member' : 'Members'}</SectionLabel>
          <Pressable onPress={() => setRenaming(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Rename party">
            <Text style={{ color: DmRune.accentDim, fontSize: 10.5, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>Rename</Text>
          </Pressable>
        </View>

        {party.memberIds.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: 40 }}>
            <Text style={{ color: DmRune.muted, fontSize: 13, fontFamily: Body.medium, textAlign: 'center', lineHeight: 19 }}>No members yet.{'\n'}Add characters from your roster.</Text>
          </View>
        ) : (
          <FlatList
            data={party.memberIds}
            keyExtractor={(cid) => cid}
            contentContainerStyle={{ gap: 10, paddingBottom: 12 }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item: cid }) => {
              const f = fileFor(cid);
              if (!f) return (
                <ChamferBox chamfer={10} fill="rgba(14,17,22,0.9)" stroke={DmRune.line} strokeWidth={1.2} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 12 }}>
                  <Text style={{ flex: 1, color: DmRune.muted, fontSize: 13, fontFamily: Body.medium, fontStyle: 'italic' }}>Missing character (removed from roster)</Text>
                  <Pressable onPress={() => commit(removeMember(party, cid))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove missing member">
                    <Svg width={16} height={16} viewBox="0 0 16 16"><Line x1={3} y1={3} x2={13} y2={13} stroke={DmRune.red} strokeWidth={2} /><Line x1={13} y1={3} x2={3} y2={13} stroke={DmRune.red} strokeWidth={2} /></Svg>
                  </Pressable>
                </ChamferBox>
              );
              return <MemberRow file={f} present={isPresent(party, cid)} onTogglePresent={() => commit(togglePresent(party, cid))} onRemove={() => commit(removeMember(party, cid))} />;
            }}
          />
        )}

        <View style={{ gap: 10, paddingTop: 8 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <RuneButton label="Add characters" kind="secondary" height={46} dm style={{ flex: 1 }} onPress={() => setPicking(true)} />
            {party.memberIds.length > 0 ? <RuneButton label="Party State" kind="secondary" height={46} dm style={{ flex: 1 }} onPress={() => router.push(`/party-overview?partyId=${party.id}` as Href)} /> : null}
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <RuneButton label="Delete party" kind="ghost" height={46} dm style={{ flex: 1 }} onPress={() => setConfirmDelete(true)} />
            {party.enabled ? (
              <RuneButton label="Sessions" kind="primary" height={46} dm style={{ flex: 1.4 }} onPress={() => { playSfx('enterCardViewer'); router.push('/sessions' as Href); }} />
            ) : (
              <RuneButton
                label="Enable"
                kind="primary"
                height={46}
                dm
                disabled={!canEnable}
                style={{ flex: 1.4 }}
                onPress={() => { playSfx('buttonTap'); commit({ ...party, enabled: true }); showToast('Party enabled — Sessions unlocked', 'success'); }}
              />
            )}
          </View>
        </View>
      </View>

      {picking ? <MemberPicker candidates={candidates} onCancel={() => setPicking(false)} onAdd={addSelected} onImport={onImport} /> : null}
      {renaming ? <NameDialog title="Rename Party" initial={party.name} confirmLabel="Rename" onConfirm={(name) => { setRenaming(false); commit({ ...party, name }); }} onCancel={() => setRenaming(false)} /> : null}
      {confirmDelete ? (
        <PopupDialog title="Delete party?" body={`${party.name} will be removed. The characters themselves are untouched.`} confirmLabel="Delete" destructive onConfirm={() => { setConfirmDelete(false); void deleteParty(party.id).then(() => router.back()); }} onCancel={() => setConfirmDelete(false)} />
      ) : null}
    </AppScreen>
  );
}
