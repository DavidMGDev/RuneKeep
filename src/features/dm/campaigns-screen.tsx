/**
 * Campaigns (v0.41.4, owner) — what used to be Parties.
 *
 * The rename is the small part. The shape is the point: a campaign OWNS its sessions, so tapping one
 * goes straight to them, and editing its cast is a secondary button on the row. There is no longer an
 * "active" campaign, because a DM running two games should not have to flip a switch to prep the
 * other one; every campaign's sessions are its own and always reachable.
 *
 * Deleting is deliberately hard to reach and hard to do: it lives behind a HOLD on the row, and it
 * asks twice, the second time in capitals. A campaign is a year of someone's Thursdays.
 */
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { AppScreen } from '@/components/app-screen';
import { ChamferBox } from '@/components/chamfer-box';
import { LoadingScreen } from '@/components/loading-screen';
import { PopupDialog } from '@/components/popup-dialog';
import { RuneButton } from '@/components/rune-button';
import { showToast } from '@/components/toast';
import { Body, DmRune, DmType } from '@/constants/theme';
import { type DmIdentity } from '@/lib/dm-identity';
import { newParty, type Party } from '@/lib/party';
import { shouldShow } from '@/lib/onboarding-store';
import { deleteParty, listParties, saveParty } from '@/lib/party-store';
import { deleteEncounter, deleteSession, listEncounters, listSessions } from '@/lib/session-store';
import { playSfx } from '@/lib/sfx';
import { IdentityBadge, IdentityLines } from './dm-identity-ui';
import { DmPress } from './dm-ui';
import { IdentityEditor } from './identity-editor';

function CampaignRow({ party, onOpen, onEdit, onHold }: { party: Party; onOpen: () => void; onEdit: () => void; onHold: () => void }) {
  const members = `${party.memberIds.length} ${party.memberIds.length === 1 ? 'character' : 'characters'}`;
  return (
    <DmPress
      onPress={onOpen}
      onLongPress={onHold}
      delayLongPress={340}
      accessibilityRole="button"
      accessibilityLabel={`${party.name}, ${members}. Open its sessions. Hold for more.`}>
      {({ pressed }) => (
        <ChamferBox chamfer={12} fill={pressed ? 'rgba(24,28,35,0.95)' : 'rgba(14,17,22,0.9)'} stroke={DmRune.line} strokeWidth={1.3} style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 14, paddingVertical: 13 }}>
          <IdentityBadge id={party} size={46} />
          <IdentityLines id={party} fallback={members} />
          {/* Editing the cast is SECONDARY now (owner): "the main thing are accessing sessions". */}
          <RuneButton label="Edit" kind="ghost" height={32} dense dm onPress={onEdit} />
          <Svg width={14} height={14} viewBox="0 0 16 16">
            <Line x1={4} y1={2} x2={12} y2={8} stroke={DmRune.accentDim} strokeWidth={2} />
            <Line x1={12} y1={8} x2={4} y2={14} stroke={DmRune.accentDim} strokeWidth={2} />
          </Svg>
        </ChamferBox>
      )}
    </DmPress>
  );
}

export function CampaignsScreen() {
  const router = useRouter();
  const [parties, setParties] = useState<Party[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Party | null>(null);
  const [holding, setHolding] = useState<Party | null>(null);
  /** The two-step delete. `1` is the question; `2` is the warning, in capitals (owner). */
  const [confirm, setConfirm] = useState<{ party: Party; step: 1 | 2 } | null>(null);

  const reload = useCallback(() => {
    let live = true;
    void listParties().then((all) => { if (live) setParties(all); });
    return () => { live = false; };
  }, []);
  useFocusEffect(reload);

  /**
   * The DM's first-run introduction (v0.42.4, owner).
   *
   * Campaigns used to sit behind a mode toggle, which at least announced that the app was about to
   * become a different kind of thing. It is one press from the menu now, so the screen says what it
   * is itself. Once, and re-openable from the menu's `?` like every other tour.
   *
   * Deferred by a tick for the reason the sheet's and the creator's tours are: two history entries in
   * the same tick collapse in Firefox, and going back then overshoots the screen the tour is about.
   */
  const tourPushed = useRef(false);
  useEffect(() => {
    if (tourPushed.current) return;
    const t = setTimeout(() => {
      tourPushed.current = true;
      if (shouldShow('campaigns')) router.push('/onboarding?tour=campaigns' as Href);
    }, 0);
    return () => clearTimeout(t);
  }, [router]);

  /**
   * Creating one asks for its identity FIRST (owner), then opens the cast.
   *
   * "This is the same interface that must appear when the user first creates a campaign, right before
   * leading them to the actual party where they edit the players."
   */
  const create = useCallback((id: DmIdentity) => {
    setCreating(false);
    const party = { ...newParty(id.name), description: id.description, color: id.color ?? newParty(id.name).color, imageUri: id.imageUri };
    playSfx('buttonTap');
    void saveParty(party).then(() => router.push(`/party?id=${party.id}` as Href));
  }, [router]);

  const saveIdentity = useCallback((id: DmIdentity) => {
    const p = editing;
    setEditing(null);
    if (!p) return;
    void saveParty({ ...p, name: id.name, description: id.description, color: id.color ?? p.color, imageUri: id.imageUri }).then(reload);
  }, [editing, reload]);

  /** A campaign takes its sessions and their encounters with it. Nothing is left orphaned on disk. */
  const doDelete = useCallback(async (p: Party) => {
    setConfirm(null);
    const sessions = await listSessions(p.id);
    for (const s of sessions) {
      for (const e of await listEncounters(s.id)) await deleteEncounter(e.id);
      await deleteSession(s.id);
    }
    await deleteParty(p.id);
    showToast(`${p.name} deleted`, 'success');
    reload();
  }, [reload]);

  if (!parties) return <LoadingScreen dm label="Gathering the campaigns" />;

  return (
    <AppScreen title="Campaigns" dm onBack={() => router.back()}>
      {parties.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, paddingBottom: 60 }}>
          <DmPress onPress={() => setCreating(true)} accessibilityRole="button" accessibilityLabel="Create your first campaign">
            {({ pressed }) => (
              <ChamferBox chamfer={18} fill={pressed ? 'rgba(218,162,73,0.12)' : 'rgba(14,17,22,0.9)'} stroke={DmRune.accent} strokeWidth={1.8} style={{ width: 170, height: 170, alignItems: 'center', justifyContent: 'center' }}>
                <Svg width={64} height={64} viewBox="0 0 64 64">
                  <Line x1={32} y1={12} x2={32} y2={52} stroke={DmRune.accent} strokeWidth={4} />
                  <Line x1={12} y1={32} x2={52} y2={32} stroke={DmRune.accent} strokeWidth={4} />
                </Svg>
              </ChamferBox>
            )}
          </DmPress>
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Text style={{ color: DmRune.ivory, fontSize: DmType.title, fontFamily: Body.bold, letterSpacing: 1.5, textTransform: 'uppercase' }}>No campaigns yet</Text>
            <Text style={{ color: DmRune.muted, fontSize: DmType.body, fontFamily: Body.medium, textAlign: 'center', lineHeight: 19 }}>
              A campaign holds a cast of{'\n'}characters and its nights at the table.
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
            renderItem={({ item }) => (
              <CampaignRow
                party={item}
                onOpen={() => { playSfx('enterCardViewer'); router.push(`/sessions?campaign=${item.id}` as Href); }}
                onEdit={() => { playSfx('buttonTap'); router.push(`/party?id=${item.id}` as Href); }}
                onHold={() => { playSfx('cardSelect'); setHolding(item); }}
              />
            )}
          />
          <View style={{ paddingTop: 10, paddingBottom: 6 }}>
            <RuneButton label="New campaign" kind="primary" height={46} dm onPress={() => setCreating(true)} />
          </View>
        </>
      )}

      {creating ? (
        <IdentityEditor title="New campaign" namePlaceholder="Campaign" initial={{ name: '' }} confirmLabel="Create" onSave={create} onCancel={() => setCreating(false)} />
      ) : null}
      {editing ? (
        <IdentityEditor title="Edit campaign" namePlaceholder="Campaign" initial={editing} onSave={saveIdentity} onCancel={() => setEditing(null)} />
      ) : null}

      {/* The hold menu. Delete lives HERE and nowhere else (owner): never inside the editor. */}
      {holding ? (
        <PopupDialog
          dm
          title={holding.name}
          body="Change how this campaign looks, or remove it."
          confirmLabel="Edit details"
          cancelLabel="Close"
          actionsGap={10}
          onConfirm={() => { const p = holding; setHolding(null); setEditing(p); }}
          onCancel={() => setHolding(null)}>
          <View style={{ marginTop: 14 }}>
            <RuneButton label="Delete campaign" kind="ghost" height={40} dm onPress={() => { const p = holding; setHolding(null); setConfirm({ party: p, step: 1 }); }} />
          </View>
        </PopupDialog>
      ) : null}

      {confirm?.step === 1 ? (
        <PopupDialog
          dm
          destructive
          title={`Delete ${confirm.party.name}?`}
          body="Its sessions and every encounter in them go with it. The characters themselves are not touched."
          confirmLabel="Delete"
          onConfirm={() => setConfirm({ party: confirm.party, step: 2 })}
          onCancel={() => setConfirm(null)}
        />
      ) : confirm?.step === 2 ? (
        <PopupDialog
          dm
          destructive
          title="THIS CANNOT BE UNDONE"
          body={`DELETE ${confirm.party.name.toUpperCase()}, ITS SESSIONS AND ALL OF ITS ENCOUNTERS?`}
          confirmLabel="DELETE IT"
          cancelLabel="KEEP IT"
          onConfirm={() => void doDelete(confirm.party)}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
    </AppScreen>
  );
}
