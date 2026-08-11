/**
 * The CAMPAIGN'S CAST (v0.15.0 as the party editor; reworked v0.41.4, owner).
 *
 * Add characters from the roster (multi-select, very like the player character picker) or import one;
 * toggle each present or absent; remove. No character CREATION here (PRD #15), only select or import.
 *
 * v0.41.4 changed what surrounds it rather than what it does. There is no Enable and no Set active,
 * because there is no active campaign; the top right corner opens the campaign's identity (its
 * picture, colour, title and description) with the same editor the campaign list uses; and DELETE is
 * gone from here entirely. The owner's rule is exact: deleting a campaign is reachable "from pressing
 * and holding a campaign entry from the campaign list UI, never from inside the edit campaign/party UI".
 */
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import {  } from 'expo-image'; // item 2: robust with base64 data-URIs (imported/NFC portraits)
import Svg, { Line, Polyline } from 'react-native-svg';

import { AppScreen, SectionLabel } from '@/components/app-screen';
import { ChamferBox } from '@/components/chamfer-box';
import { FitLine } from '@/components/fit-line';
import { LoadingScreen } from '@/components/loading-screen';
import { PopupDialog } from '@/components/popup-dialog';
import { RuneButton } from '@/components/rune-button';
import { classColor, classInfo } from '@/constants/identity';
import { DmType, Body, Display, DmRune } from '@/constants/theme';
import { type CharacterFile } from '@/lib/character-file';
import { importCharacter, listCharacters } from '@/lib/character-store';
import { initialVitals } from '@/lib/dm-vitals';
import { type DmIdentity } from '@/lib/dm-identity';
import { addMembers, isPresent, type Party, removeMember, togglePresent } from '@/lib/party';
import { getParty, saveParty } from '@/lib/party-store';
import { playSfx } from '@/lib/sfx';
import { DimScreen } from '@/lib/screen-dim';
import { Portrait as SharedPortrait } from '@/components/portrait';
import { IdentityBadge } from './dm-identity-ui';
import { IdentityEditor } from './identity-editor';
import { DmEmpty, DmPress } from './dm-ui';

/** v0.36.1: the shared chamfered portrait (see components/portrait). */
function Portrait({ uri, tint }: { uri: string | null; tint: string }) {
  return <SharedPortrait uri={uri} size={46} tint={tint} fill={DmRune.ink} />;
}

function MemberRow({ file, present, onTogglePresent, onRemove }: { file: CharacterFile; present: boolean; onTogglePresent: () => void; onRemove: () => void }) {
  const cls = classInfo(file.className);
  return (
    <ChamferBox chamfer={10} fill="rgba(14,17,22,0.9)" stroke={DmRune.line} strokeWidth={1.2} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, opacity: present ? 1 : 0.5 }}>
      <Portrait uri={file.portraitUri} tint={classColor(file.className).bright} />
      <View style={{ flex: 1 }}>
        <FitLine style={{ color: DmRune.ivory, fontSize: DmType.title, fontFamily: Display.black, letterSpacing: 0.6, textTransform: 'uppercase' }}>{file.name}</FitLine>
        <Text style={{ color: DmRune.muted, fontSize: DmType.body, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 3 }}>Lvl {file.level} {cls.label}</Text>
      </View>
      <DmPress onPress={onTogglePresent} hitSlop={8} accessibilityRole="button" accessibilityLabel={present ? `${file.name} present` : `${file.name} absent`}>
        <ChamferBox chamfer={5} fill={present ? 'rgba(196,200,208,0.14)' : 'transparent'} stroke={present ? DmRune.accent : DmRune.line} strokeWidth={1.1} style={{ paddingHorizontal: 9, height: 26, justifyContent: 'center' }}>
          <Text style={{ color: present ? DmRune.accent : DmRune.muted, fontSize: DmType.micro, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>{present ? 'Present' : 'Absent'}</Text>
        </ChamferBox>
      </DmPress>
      <DmPress onPress={onRemove} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${file.name}`}>
        <Svg width={16} height={16} viewBox="0 0 16 16"><Line x1={3} y1={3} x2={13} y2={13} stroke={DmRune.red} strokeWidth={2} /><Line x1={13} y1={3} x2={3} y2={13} stroke={DmRune.red} strokeWidth={2} /></Svg>
      </DmPress>
    </ChamferBox>
  );
}

/**
 * The multi-select over roster characters not already in the party (PRD #13/#14).
 *
 * Exported since v0.39.0: the party SHEET adds characters too, and the owner's ask was for the same
 * control, not a second one that drifts from this ("just like they can in the original party
 * interface").
 */
export function MemberPicker({ candidates, onCancel, onAdd, onImport }: { candidates: CharacterFile[]; onCancel: () => void; onAdd: (ids: string[]) => void; onImport: () => void }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 300, backgroundColor: 'rgba(6,8,13,0.92)', paddingHorizontal: 18, paddingTop: 60, paddingBottom: 20 }]}>
    <DimScreen opacity={0.92} />
      <SectionLabel dm style={{ marginBottom: 10 }}>Add characters</SectionLabel>
      {candidates.length === 0 ? (
        <Text style={{ color: DmRune.muted, fontSize: DmType.body, fontFamily: Body.medium, textAlign: 'center', marginTop: 30 }}>Every roster character is already in this party. Import one to add more.</Text>
      ) : (
        <FlatList
          data={candidates}
          keyExtractor={(f) => f.id}
          contentContainerStyle={{ gap: 10, paddingBottom: 10 }}
          renderItem={({ item }) => {
            const on = sel.has(item.id);
            const cls = classInfo(item.className);
            return (
              <DmPress onPress={() => toggle(item.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={item.name}>
                <ChamferBox chamfer={10} fill={on ? 'rgba(196,200,208,0.14)' : 'rgba(14,17,22,0.9)'} stroke={on ? DmRune.accent : DmRune.line} strokeWidth={on ? 1.5 : 1.2} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10 }}>
                  <Portrait uri={item.portraitUri} tint={classColor(item.className).bright} />
                  <View style={{ flex: 1 }}>
                    <FitLine style={{ color: DmRune.ivory, fontSize: DmType.title, fontFamily: Display.black, letterSpacing: 0.6, textTransform: 'uppercase' }}>{item.name}</FitLine>
                    <Text style={{ color: DmRune.muted, fontSize: DmType.body, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 3 }}>Lvl {item.level} {cls.label}</Text>
                  </View>
                  <ChamferBox chamfer={4} fill={on ? DmRune.accent : 'transparent'} stroke={DmRune.accentDim} strokeWidth={1.2} style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
                    {on ? <Svg width={12} height={12} viewBox="0 0 12 12"><Polyline points="2,6 5,9 10,3" fill="none" stroke={DmRune.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg> : null}
                  </ChamferBox>
                </ChamferBox>
              </DmPress>
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
  /** The campaign's picture, colour, title and description (v0.41.4). */
  const [editingIdentity, setEditingIdentity] = useState(false);
  // v0.22.0: removing a member ALSO drops that character's global vitals record (party.ts), so one
  // mistap silently wiped the HP/Stress/Hope/Armor the DM had been tracking all session.
  const [confirmRemove, setConfirmRemove] = useState<{ id: string; name: string } | null>(null);

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

  const saveIdentity = useCallback((idn: DmIdentity) => {
    setEditingIdentity(false);
    if (!party) return;
    commit({ ...party, name: idn.name, description: idn.description, color: idn.color ?? party.color, imageUri: idn.imageUri });
  }, [party, commit]);

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

  if (!party) return <LoadingScreen dm label="Reading the party" />;

  const candidates = roster.filter((f) => !party.memberIds.includes(f.id));

  return (
    <AppScreen
      title={party.name}
      dm
      onBack={() => router.back()}
      headerRight={
        /* The identity lives in the top right corner (owner): picture, colour or letter, title and
           description, in the same dialog the campaign list opens. */
        <DmPress onPress={() => { playSfx('buttonTap'); setEditingIdentity(true); }} hitSlop={10} accessibilityRole="button" accessibilityLabel="Edit campaign details">
          <IdentityBadge id={party} size={30} />
        </DmPress>
      }>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <SectionLabel dm>{party.memberIds.length} {party.memberIds.length === 1 ? 'Character' : 'Character'}</SectionLabel>
          <DmPress onPress={() => setEditingIdentity(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Edit campaign details">
            <Text style={{ color: DmRune.accentDim, fontSize: DmType.micro, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>Details</Text>
          </DmPress>
        </View>

        {party.memberIds.length === 0 ? (
          <DmEmpty
            title="No members yet"
            body="A party is the characters you run together. Pull them in from your roster."
            actionLabel="Add characters"
            onAction={() => setPicking(true)}
          />
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
                  <Text style={{ flex: 1, color: DmRune.muted, fontSize: DmType.body, fontFamily: Body.medium, fontStyle: 'italic' }}>Missing character (removed from roster)</Text>
                  <DmPress onPress={() => commit(removeMember(party, cid))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove missing member">
                    <Svg width={16} height={16} viewBox="0 0 16 16"><Line x1={3} y1={3} x2={13} y2={13} stroke={DmRune.red} strokeWidth={2} /><Line x1={13} y1={3} x2={3} y2={13} stroke={DmRune.red} strokeWidth={2} /></Svg>
                  </DmPress>
                </ChamferBox>
              );
              return <MemberRow file={f} present={isPresent(party, cid)} onTogglePresent={() => commit(togglePresent(party, cid))} onRemove={() => setConfirmRemove({ id: cid, name: f.name })} />;
            }}
          />
        )}

        <View style={{ gap: 10, paddingTop: 8 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <RuneButton label="Add characters" kind="secondary" height={46} dm style={{ flex: 1 }} onPress={() => setPicking(true)} />
            {party.memberIds.length > 0 ? <RuneButton label="Party sheet" kind="secondary" height={46} dm style={{ flex: 1 }} onPress={() => router.push(`/party-overview?partyId=${party.id}` as Href)} /> : null}
          </View>
          {/* Sessions are always reachable now: a campaign owns them, and none of them is gated. */}
          <RuneButton label="Sessions" kind="primary" height={46} dm onPress={() => { playSfx('enterCardViewer'); router.push(`/sessions?campaign=${party.id}` as Href); }} />
        </View>
      </View>

      {picking ? <MemberPicker candidates={candidates} onCancel={() => setPicking(false)} onAdd={addSelected} onImport={onImport} /> : null}
      {editingIdentity ? <IdentityEditor title="Edit campaign" namePlaceholder="Campaign" initial={party} onSave={saveIdentity} onCancel={() => setEditingIdentity(false)} /> : null}
      {confirmRemove ? (
        <PopupDialog dm
          title="Remove from party?"
          body={`${confirmRemove.name} leaves ${party.name}, and the HP, Stress, Hope and Armor tracked for them here are cleared. Their character sheet is untouched.`}
          confirmLabel="Remove"
          destructive
          onConfirm={() => { commit(removeMember(party, confirmRemove.id)); setConfirmRemove(null); }}
          onCancel={() => setConfirmRemove(null)}
        />
      ) : null}


    </AppScreen>
  );
}
