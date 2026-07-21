/**
 * Session (v0.15.0, PRD #4/#21/#22/#26) — one session's encounters, the active one pinned on top and the
 * rest newest-first. A Players button opens the party overview; New Encounter adds "Encounter #X".
 */
import { type Href, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { AppScreen } from '@/components/app-screen';
import { ChamferBox } from '@/components/chamfer-box';
import { FitLine } from '@/components/fit-line';
import { LoadingScreen } from '@/components/loading-screen';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, DmRune } from '@/constants/theme';
import { type Party } from '@/lib/party';
import { getParty } from '@/lib/party-store';
import { type Encounter, newEncounter, nextIndex, type Session, sortedEncounters } from '@/lib/session';
import { getSession, listEncounters, saveEncounter } from '@/lib/session-store';
import { playSfx } from '@/lib/sfx';

const STATUS_COLOR = (s: Encounter['status']) => (s === 'active' ? DmRune.accent : s === 'completed' ? DmRune.muted : DmRune.accentDim);

export function SessionScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [party, setParty] = useState<Party | null>(null);
  const [encounters, setEncounters] = useState<Encounter[]>([]);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void (async () => {
        const ses = await getSession(id);
        const [pty, encs] = await Promise.all([ses ? getParty(ses.partyId) : Promise.resolve(null), listEncounters(id)]);
        if (!live) return;
        setSession(ses); setParty(pty); setEncounters(encs);
      })();
      return () => { live = false; };
    }, [id]),
  );

  const create = useCallback(() => {
    if (!session || !party) return;
    const enc = newEncounter(session, party, nextIndex(encounters));
    playSfx('buttonTap');
    void saveEncounter(enc).then(() => router.push(`/encounter?id=${enc.id}` as Href));
  }, [session, party, encounters, router]);

  if (!session) return <LoadingScreen label="Opening the session" />;

  const ordered = sortedEncounters(encounters, session.activeEncounterId);

  return (
    <AppScreen title={session.name} dm onBack={() => router.back()}>
      <View style={{ flex: 1 }}>
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
              return (
                <Pressable onPress={() => router.push(`/encounter?id=${item.id}` as Href)} accessibilityRole="button" accessibilityLabel={`${item.name}, ${item.status}`}>
                  {({ pressed }) => (
                    <ChamferBox chamfer={12} fill={pressed ? 'rgba(24,28,35,0.95)' : 'rgba(14,17,22,0.9)'} stroke={pinned ? DmRune.accent : DmRune.line} strokeWidth={pinned ? 1.6 : 1.3} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 15 }}>
                      <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: STATUS_COLOR(item.status) }} />
                      <View style={{ flex: 1 }}>
                        <FitLine style={{ color: DmRune.ivory, fontSize: 17, fontFamily: Display.black, letterSpacing: 0.8, textTransform: 'uppercase' }}>{item.name}</FitLine>
                        <Text style={{ color: DmRune.muted, fontSize: 11, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase', marginTop: 3 }}>
                          {pinned ? 'Active · ' : ''}{item.adversaries.length} {item.adversaries.length === 1 ? 'Adversary' : 'Adversaries'}
                        </Text>
                      </View>
                      <Svg width={14} height={14} viewBox="0 0 16 16"><Line x1={4} y1={2} x2={12} y2={8} stroke={DmRune.accentDim} strokeWidth={2} /><Line x1={12} y1={8} x2={4} y2={14} stroke={DmRune.accentDim} strokeWidth={2} /></Svg>
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
    </AppScreen>
  );
}
