/**
 * Sessions (v0.15.0, PRD #19-21). A party is chosen from a dropdown of all enabled parties at the top;
 * below it, that party's sessions list newest-first. Create any number of sessions; tap one to open its
 * encounters.
 */
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import Svg, { Line, Polyline } from 'react-native-svg';

import { AppScreen } from '@/components/app-screen';
import { ChamferBox } from '@/components/chamfer-box';
import { FitLine } from '@/components/fit-line';
import { LoadingScreen } from '@/components/loading-screen';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, DmRune } from '@/constants/theme';
import { type Party } from '@/lib/party';
import { listParties } from '@/lib/party-store';
import { newSession, type Session } from '@/lib/session';
import { listSessions, saveSession } from '@/lib/session-store';
import { playSfx } from '@/lib/sfx';
import { ColorDiamond, NameDialog } from './dm-ui';

function PartyDropdown({ parties, selected, onSelect }: { parties: Party[]; selected: Party; onSelect: (p: Party) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ zIndex: 50 }}>
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityLabel={`Party: ${selected.name}. Change`}>
        <ChamferBox chamfer={10} fill="rgba(14,17,22,0.94)" stroke={DmRune.lineStrong} strokeWidth={1.4} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, height: 52 }}>
          <ColorDiamond color={selected.color} size={14} />
          <FitLine style={{ flex: 1, color: DmRune.ivory, fontSize: 18, fontFamily: Display.black, letterSpacing: 1, textTransform: 'uppercase' }}>{selected.name}</FitLine>
          <Svg width={16} height={16} viewBox="0 0 16 16"><Polyline points="3,6 8,11 13,6" fill="none" stroke={DmRune.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
        </ChamferBox>
      </Pressable>
      {open ? (
        <ChamferBox chamfer={10} fill="rgba(10,13,18,0.99)" stroke={DmRune.line} strokeWidth={1.2} style={{ position: 'absolute', top: 58, left: 0, right: 0, paddingVertical: 4 }}>
          {parties.map((p) => (
            <Pressable key={p.id} onPress={() => { setOpen(false); onSelect(p); }} accessibilityRole="button" accessibilityLabel={p.name} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: pressed ? 'rgba(196,200,208,0.1)' : 'transparent' })}>
              <ColorDiamond color={p.color} size={12} />
              <Text style={{ flex: 1, color: p.id === selected.id ? DmRune.accent : DmRune.text, fontSize: 14, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' }}>{p.name}</Text>
              {p.id === selected.id ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: DmRune.accent }} /> : null}
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

  const loadSessions = useCallback((partyId: string) => { void listSessions(partyId).then(setSessions); }, []);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void listParties().then((all) => {
        if (!live) return;
        const enabled = all.filter((p) => p.enabled);
        setParties(enabled);
        setSelected((prev) => {
          const next = enabled.find((p) => p.id === prev?.id) ?? enabled[0] ?? null;
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

  if (!parties) return <LoadingScreen label="Opening the ledger" />;
  if (!selected) {
    return (
      <AppScreen title="Sessions" dm onBack={() => router.back()}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 40 }}>
          <Text style={{ color: DmRune.muted, fontSize: 13, fontFamily: Body.medium, textAlign: 'center', lineHeight: 20 }}>No enabled party.{'\n'}Enable a party to run sessions.</Text>
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen title="Sessions" dm onBack={() => router.back()}>
      <View style={{ flex: 1, gap: 14 }}>
        <PartyDropdown parties={parties} selected={selected} onSelect={(p) => { setSelected(p); loadSessions(p.id); }} />
        {sessions.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 40 }}>
            <Text style={{ color: DmRune.muted, fontSize: 13, fontFamily: Body.medium, textAlign: 'center', lineHeight: 20 }}>No sessions for {selected.name} yet.{'\n'}Start the first one.</Text>
          </View>
        ) : (
          <FlatList
            data={sessions}
            keyExtractor={(s) => s.id}
            contentContainerStyle={{ gap: 12, paddingBottom: 16 }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <Pressable onPress={() => router.push(`/session?id=${item.id}` as Href)} accessibilityRole="button" accessibilityLabel={item.name}>
                {({ pressed }) => (
                  <ChamferBox chamfer={12} fill={pressed ? 'rgba(24,28,35,0.95)' : 'rgba(14,17,22,0.9)'} stroke={DmRune.line} strokeWidth={1.3} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 15 }}>
                    <View style={{ flex: 1 }}>
                      <FitLine style={{ color: DmRune.ivory, fontSize: 17, fontFamily: Display.black, letterSpacing: 0.8, textTransform: 'uppercase' }}>{item.name}</FitLine>
                      <Text style={{ color: DmRune.muted, fontSize: 11, fontFamily: Body.medium, marginTop: 3 }}>{new Date(item.createdAt).toLocaleDateString()}</Text>
                    </View>
                    <Svg width={14} height={14} viewBox="0 0 16 16"><Line x1={4} y1={2} x2={12} y2={8} stroke={DmRune.accentDim} strokeWidth={2} /><Line x1={12} y1={8} x2={4} y2={14} stroke={DmRune.accentDim} strokeWidth={2} /></Svg>
                  </ChamferBox>
                )}
              </Pressable>
            )}
          />
        )}
        <View style={{ paddingBottom: 6 }}>
          <RuneButton label="New session" kind="primary" height={46} dm onPress={() => setNaming(true)} />
        </View>
      </View>

      {naming ? <NameDialog title="New Session" placeholder="Session name" confirmLabel="Create" onConfirm={create} onCancel={() => setNaming(false)} /> : null}
    </AppScreen>
  );
}
