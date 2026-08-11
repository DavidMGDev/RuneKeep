/**
 * Where an encounter goes, and whether it is moved or copied (v0.41.4, owner).
 *
 * The old picker listed the current session's siblings and nothing else, so a fight prepared for one
 * campaign could never be reused in another. This one lists every session there is, and organises
 * them the way the owner asked: "all other campaign sessions collapsed inside folders organized by
 * campaign and only the current sessions for the current campaign as expanded and first on the list".
 *
 * Move and Copy are two buttons over ONE chosen target rather than two pickers, because they answer
 * different questions about the same choice. A copy is a new fight, prepared, with its own adversaries
 * (see `copyEncounterToSession`); a move takes the original with it.
 */
import { useState } from 'react';
import { Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import Svg, { Polyline } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, DmRune, DmType } from '@/constants/theme';
import { type Party } from '@/lib/party';
import { type Session } from '@/lib/session';
import { IdentityBadge } from './dm-identity-ui';
import { DmModal, DmPress } from './dm-ui';

export interface MoveTarget {
  campaign: Party;
  sessions: Session[];
}

function SessionOption({ s, chosen, onPick }: { s: Session; chosen: boolean; onPick: () => void }) {
  return (
    <DmPress
      onPress={onPick}
      accessibilityRole="button"
      accessibilityState={{ selected: chosen }}
      accessibilityLabel={s.name}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 8, borderRadius: 6, backgroundColor: chosen ? 'rgba(196,200,208,0.16)' : pressed ? 'rgba(196,200,208,0.1)' : 'transparent' })}>
      <IdentityBadge id={s} size={26} />
      <Text numberOfLines={1} style={{ flex: 1, color: chosen ? DmRune.accent : DmRune.text, fontSize: DmType.body, fontFamily: Body.bold, letterSpacing: 0.5, textTransform: 'uppercase' }}>{s.name}</Text>
      {chosen ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: DmRune.accent }} /> : null}
    </DmPress>
  );
}

/** Another campaign, folded shut. It opens in place rather than replacing the list. */
function CampaignFolder({ target, chosenId, onPick }: { target: MoveTarget; chosenId: string | null; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <DmPress
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityLabel={`${target.campaign.name}, ${target.sessions.length} sessions`}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 8, borderRadius: 6, backgroundColor: pressed ? 'rgba(196,200,208,0.1)' : 'transparent' })}>
        <IdentityBadge id={target.campaign} size={26} />
        <Text numberOfLines={1} style={{ flex: 1, color: DmRune.ivory, fontSize: DmType.body, fontFamily: Body.bold, letterSpacing: 0.5, textTransform: 'uppercase' }}>{target.campaign.name}</Text>
        <Text style={{ color: DmRune.muted, fontSize: DmType.micro, fontFamily: Body.bold }}>{target.sessions.length}</Text>
        <Svg width={13} height={13} viewBox="0 0 16 16" style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <Polyline points="3,6 8,11 13,6" fill="none" stroke={DmRune.accentDim} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </DmPress>
      {open ? (
        <View style={{ paddingLeft: 16, borderLeftWidth: 1, borderLeftColor: DmRune.line, marginLeft: 14 }}>
          {target.sessions.length === 0 ? (
            <Text style={{ color: DmRune.muted, fontSize: DmType.micro, fontFamily: Body.italic, paddingVertical: 8, paddingHorizontal: 8 }}>No sessions in this campaign</Text>
          ) : (
            target.sessions.map((s) => <SessionOption key={s.id} s={s} chosen={s.id === chosenId} onPick={() => onPick(s.id)} />)
          )}
        </View>
      ) : null}
    </View>
  );
}

export function EncounterMovePicker({
  count,
  here,
  elsewhere,
  onMove,
  onCopy,
  onNewSession,
  onCancel,
}: {
  count: number;
  /** The current campaign's OTHER sessions. Expanded, and first. */
  here: MoveTarget;
  /** Every other campaign, folded shut. */
  elsewhere: MoveTarget[];
  onMove: (sessionId: string) => void;
  onCopy: (sessionId: string) => void;
  onNewSession: () => void;
  onCancel: () => void;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const noun = count === 1 ? 'encounter' : `${count} encounters`;
  return (
    <DmModal onClose={onCancel}>
      <ChamferBox chamfer={14} fill="rgba(12,15,20,0.99)" stroke={DmRune.lineStrong} strokeWidth={1.5} style={{ width: 330, maxHeight: 560, padding: 18 }}>
        <Text style={{ color: DmRune.ivory, fontSize: DmType.title, fontFamily: Display.black, letterSpacing: 1, textTransform: 'uppercase' }}>Send {noun}</Text>
        <Text style={{ color: DmRune.muted, fontSize: DmType.body, fontFamily: Body.medium, lineHeight: 17, marginTop: 4, marginBottom: 10 }}>
          Pick a session, then move it or leave a copy behind.
        </Text>
        <ScrollView style={{ maxHeight: 330 }} showsVerticalScrollIndicator contentContainerStyle={{ paddingBottom: 6 }}>
          {here.sessions.length === 0 && elsewhere.length === 0 ? (
            <Text style={{ color: DmRune.muted, fontSize: DmType.body, fontFamily: Body.italic, paddingVertical: 10 }}>Nowhere else to send it yet.</Text>
          ) : null}
          {here.sessions.map((s) => <SessionOption key={s.id} s={s} chosen={s.id === chosen} onPick={() => setChosen(s.id)} />)}
          {elsewhere.length ? (
            <View style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: DmRune.line, gap: 2 }}>
              <Text style={{ color: DmRune.muted, fontSize: DmType.micro, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase', paddingHorizontal: 8, marginBottom: 4 }}>Other campaigns</Text>
              {elsewhere.map((t) => <CampaignFolder key={t.campaign.id} target={t} chosenId={chosen} onPick={setChosen} />)}
            </View>
          ) : null}
        </ScrollView>
        <View style={{ gap: 8, marginTop: 12 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <RuneButton label="Move" kind="secondary" height={42} dm style={{ flex: 1 }} disabled={!chosen} onPress={() => chosen && onMove(chosen)} />
            <RuneButton label="Copy" kind="secondary" height={42} dm style={{ flex: 1 }} disabled={!chosen} onPress={() => chosen && onCopy(chosen)} />
          </View>
          <RuneButton label="Move to a new session" kind="ghost" height={40} dm onPress={onNewSession} />
          <RuneButton label="Cancel" kind="ghost" height={40} dm onPress={onCancel} />
        </View>
      </ChamferBox>
    </DmModal>
  );
}
