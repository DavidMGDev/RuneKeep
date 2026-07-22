/**
 * Parties (v0.15.0, PRD #10-18) — the DM's list of parties. Create any number; each is a collection of
 * roster characters. Empty state prompts the first party. Tap a party to edit it (members, present
 * toggles, Enable). An enabled party unlocks Sessions.
 */
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { AppScreen } from '@/components/app-screen';
import { ChamferBox } from '@/components/chamfer-box';
import { FitLine } from '@/components/fit-line';
import { LoadingScreen } from '@/components/loading-screen';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, DmRune } from '@/constants/theme';
import { newParty, type Party } from '@/lib/party';
import { listParties, saveParty } from '@/lib/party-store';
import { playSfx } from '@/lib/sfx';
import { ColorDiamond, NameDialog } from './dm-ui';

function PartyRow({ party, onOpen }: { party: Party; onOpen: () => void }) {
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${party.name}, ${party.memberIds.length} members${party.enabled ? ', enabled' : ''}`}>
      {({ pressed }) => (
        <ChamferBox chamfer={12} fill={pressed ? 'rgba(24,28,35,0.95)' : 'rgba(14,17,22,0.9)'} stroke={DmRune.line} strokeWidth={1.3} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14 }}>
          <ColorDiamond color={party.color} size={16} />
          <View style={{ flex: 1 }}>
            <FitLine style={{ color: DmRune.ivory, fontSize: 18, fontFamily: Display.black, letterSpacing: 0.8, textTransform: 'uppercase' }}>{party.name}</FitLine>
            <Text style={{ color: DmRune.muted, fontSize: 12, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase', marginTop: 4 }}>
              {party.memberIds.length} {party.memberIds.length === 1 ? 'Member' : 'Members'}{party.enabled ? ' · Enabled' : ''}
            </Text>
          </View>
          {party.enabled ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(196,200,208,0.16)', borderWidth: 1, borderColor: DmRune.accent, paddingHorizontal: 8, paddingVertical: 4 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: DmRune.accent }} />
              <Text style={{ color: DmRune.accent, fontSize: 9.5, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>Enabled</Text>
            </View>
          ) : null}
          <Svg width={14} height={14} viewBox="0 0 16 16">
            <Line x1={4} y1={2} x2={12} y2={8} stroke={DmRune.accentDim} strokeWidth={2} />
            <Line x1={12} y1={8} x2={4} y2={14} stroke={DmRune.accentDim} strokeWidth={2} />
          </Svg>
        </ChamferBox>
      )}
    </Pressable>
  );
}

export function PartiesScreen() {
  const router = useRouter();
  const [parties, setParties] = useState<Party[] | null>(null);
  const [naming, setNaming] = useState(false);

  const reload = useCallback(() => {
    let live = true;
    void listParties().then((all) => { if (live) setParties(all); });
    return () => { live = false; };
  }, []);
  useFocusEffect(reload);

  const create = useCallback((name: string) => {
    setNaming(false);
    const party = newParty(name);
    playSfx('buttonTap');
    void saveParty(party).then(() => router.push(`/party?id=${party.id}` as Href));
  }, [router]);

  if (!parties) return <LoadingScreen label="Gathering the parties" />;

  return (
    <AppScreen title="Parties" dm onBack={() => router.back()}>
      {parties.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, paddingBottom: 60 }}>
          <Pressable onPress={() => setNaming(true)} accessibilityRole="button" accessibilityLabel="Create your first party">
            {({ pressed }) => (
              <ChamferBox chamfer={18} fill={pressed ? 'rgba(196,200,208,0.12)' : 'rgba(14,17,22,0.9)'} stroke={DmRune.accent} strokeWidth={1.8} style={{ width: 170, height: 170, alignItems: 'center', justifyContent: 'center' }}>
                <Svg width={64} height={64} viewBox="0 0 64 64">
                  <Line x1={32} y1={12} x2={32} y2={52} stroke={DmRune.accent} strokeWidth={4} />
                  <Line x1={12} y1={32} x2={52} y2={32} stroke={DmRune.accent} strokeWidth={4} />
                </Svg>
              </ChamferBox>
            )}
          </Pressable>
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Text style={{ color: DmRune.ivory, fontSize: 18, fontFamily: Display.black, letterSpacing: 1.5, textTransform: 'uppercase' }}>No parties yet</Text>
            <Text style={{ color: DmRune.muted, fontSize: 13, fontFamily: Body.medium, textAlign: 'center', lineHeight: 19 }}>
              A party is a collection of your{'\n'}characters. Make your first one.
            </Text>
          </View>
        </View>
      ) : (
        <>
          <FlatList
            data={parties}
            keyExtractor={(p) => p.id}
            contentContainerStyle={{ gap: 12, paddingTop: 4, paddingBottom: 16 }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => <PartyRow party={item} onOpen={() => router.push(`/party?id=${item.id}` as Href)} />}
          />
          <View style={{ gap: 10, paddingTop: 10, paddingBottom: 6 }}>
            {parties.some((p) => p.enabled) ? <RuneButton label="Sessions Menu" kind="secondary" height={46} dm onPress={() => { playSfx('enterCardViewer'); router.push('/sessions' as Href); }} /> : null}
            <RuneButton label="New party" kind="primary" height={46} dm onPress={() => setNaming(true)} />
          </View>
        </>
      )}

      {naming ? <NameDialog title="New Party" placeholder="Party name" confirmLabel="Create" onConfirm={create} onCancel={() => setNaming(false)} /> : null}
    </AppScreen>
  );
}
