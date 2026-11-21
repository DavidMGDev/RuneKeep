import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { Line, Polyline } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { Portrait } from '@/components/portrait';
import { RuneButton } from '@/components/rune-button';
import { classColor } from '@/constants/identity';
import { Body, Display, DmRune, DmType } from '@/constants/theme';
import { type CharacterFile, classLabel } from '@/lib/character-file';
import { isPresent, type Party } from '@/lib/party';
import type { EncounterStatus, Session } from '@/lib/session';
import { IdentityBadge, IdentityLines } from './dm-identity-ui';

/** The desktop campaigns page's list column; the pop-up sidebar opens past its divider. */
export const CAMPAIGN_LIST_W = 380;

export type EncounterLine = { id: string; name: string; status: EncounterStatus };

/**
 * The campaigns page's right-hand pane on a desktop window: the roster's dossier, for a campaign. Who it is,
 * who plays in it, and its nights at the table, newest first, each one a click from its encounters. The
 * buttons are the ones the phone keeps behind a hold and a second screen, all in reach at once.
 */
export function CampaignDossier({ party, roster, sessions, encounters, onOpenSessions, onOpenSession, onNewSession, onEditCast, onEditDetails, onDelete }: {
  party: Party;
  /** Every character on this device; the cast is read out of it. */
  roster: CharacterFile[];
  /** This campaign's sessions, or null while they are read. */
  sessions: Session[] | null;
  encounters: Record<string, EncounterLine[]>;
  onOpenSessions: () => void;
  onOpenSession: (id: string) => void;
  onNewSession: () => void;
  onEditCast: () => void;
  onEditDetails: () => void;
  onDelete: () => void;
}) {
  const byId = new Map(roster.map((f) => [f.id, f]));
  const cast = party.memberIds.map((id) => byId.get(id)).filter((f): f is CharacterFile => !!f);
  const newest = sessions ? [...sessions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : null;
  return (
    <Animated.View key={party.id} entering={FadeIn.duration(180)} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 34, paddingTop: 26, paddingBottom: 30, gap: 28 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-end' }}>
          <IdentityBadge id={party} size={132} />
          <View style={{ flex: 1, gap: 8, paddingBottom: 4 }}>
            {/* Two lines: a campaign's name runs longer than a hero's ("The Sunken Crown" was cut at 1100px). */}
            <Text numberOfLines={2} style={{ color: DmRune.ivory, fontSize: 36, lineHeight: 40, fontFamily: Display.black, letterSpacing: 1.2, textTransform: 'uppercase' }}>{party.name}</Text>
            {party.description?.trim() ? (
              <Text numberOfLines={2} style={{ color: DmRune.muted, fontSize: 14, fontFamily: Body.medium, lineHeight: 20 }}>{party.description.trim()}</Text>
            ) : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
              <RuneButton label="Open sessions" kind="primary" height={42} dm style={{ minWidth: 170 }} onPress={onOpenSessions} />
              <RuneButton label="New session" kind="secondary" height={42} dm onPress={onNewSession} />
              <RuneButton label="Edit cast" kind="secondary" height={42} dm onPress={onEditCast} />
              <RuneButton label="Edit details" kind="secondary" height={42} dm onPress={onEditDetails} />
              <RuneButton label="Delete" kind="ghost" height={42} dm onPress={onDelete} />
            </View>
          </View>
        </View>

        <View style={{ gap: 12 }}>
          <SectionHead title="Cast" count={cast.length} />
          {cast.length === 0 ? (
            <Text style={{ color: DmRune.muted, fontSize: DmType.body, fontFamily: Body.medium }}>No characters yet. Edit the cast to add the table&apos;s heroes.</Text>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {cast.map((f) => <CastChip key={f.id} file={f} away={!isPresent(party, f.id)} />)}
            </View>
          )}
        </View>

        <View style={{ gap: 12 }}>
          <SectionHead title="Sessions" count={newest?.length} />
          {newest === null ? null : newest.length === 0 ? (
            <Text style={{ color: DmRune.muted, fontSize: DmType.body, fontFamily: Body.medium }}>No sessions yet. A session is one night at the table, holding its encounters.</Text>
          ) : (
            <View style={{ gap: 10 }}>
              {newest.map((s) => <SessionRow key={s.id} session={s} encounters={encounters[s.id]} onPress={() => onOpenSession(s.id)} />)}
            </View>
          )}
        </View>
      </ScrollView>
    </Animated.View>
  );
}

function SectionHead({ title, count }: { title: string; count?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Text style={{ color: DmRune.accent, fontSize: 13, fontFamily: Body.bold, letterSpacing: 1.8, textTransform: 'uppercase' }}>{title}</Text>
      {count !== undefined ? <Text style={{ color: DmRune.muted, fontSize: 12, fontFamily: Body.bold }}>{count}</Text> : null}
      <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(218,162,73,0.22)' }} />
    </View>
  );
}

/** One member of the cast: portrait, name, level and class. One who is away tonight is drawn dimmer, and says so. */
function CastChip({ file, away }: { file: CharacterFile; away: boolean }) {
  const tint = classColor(file.className);
  return (
    <View style={{ width: 236, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: away ? 0.5 : 1 }}>
      <Portrait uri={file.portraitUri} size={52} chamfer={8} tint={tint.bright} fill={DmRune.ink} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: DmRune.ivory, fontSize: 14, fontFamily: Display.black, letterSpacing: 0.6, textTransform: 'uppercase' }}>{file.name}</Text>
        <Text numberOfLines={1} style={{ color: DmRune.muted, fontSize: 12, fontFamily: Body.medium, marginTop: 3 }}>{away ? 'Away' : `Lvl ${file.level} ${classLabel(file)}`}</Text>
      </View>
    </View>
  );
}

function SessionRow({ session, encounters, onPress }: { session: Session; encounters?: EncounterLine[]; onPress: () => void }) {
  const [hover, setHover] = useState(false);
  const live = encounters?.find((e) => e.status === 'active');
  const sub = encounters === undefined ? '' : encounters.length === 0 ? 'No encounters yet' : `${encounters.length} ${encounters.length === 1 ? 'encounter' : 'encounters'}${live ? `, ${live.name} running` : ''}`;
  return (
    <Pressable onPress={onPress} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)} accessibilityRole="button" accessibilityLabel={`${session.name}. Open its encounters`}>
      <ChamferBox chamfer={12} fill={hover ? 'rgba(24,28,35,0.95)' : 'rgba(14,17,22,0.9)'} stroke={hover ? DmRune.lineStrong : DmRune.line} strokeWidth={1.3}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 12 }}>
        <IdentityBadge id={session} size={44} />
        <IdentityLines id={session} fallback={new Date(session.createdAt).toLocaleDateString()} />
        <Text style={{ color: live ? DmRune.accent : DmRune.muted, fontSize: DmType.micro, fontFamily: Body.bold, letterSpacing: 0.6 }}>{sub}</Text>
        <Svg width={14} height={14} viewBox="0 0 16 16"><Polyline points="4,2 12,8 4,14" fill="none" stroke={DmRune.accentDim} strokeWidth={2} /></Svg>
      </ChamferBox>
    </Pressable>
  );
}

/** A row shaped like a campaign row that starts one, last in the list (the roster's New character row). */
export function NewCampaignRow({ onPress }: { onPress: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <Pressable onPress={onPress} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)} accessibilityRole="button" accessibilityLabel="New campaign">
      <ChamferBox chamfer={12} fill={hover ? 'rgba(24,28,35,0.95)' : 'rgba(14,17,22,0.9)'} stroke={hover ? DmRune.lineStrong : DmRune.accent} strokeWidth={1.4}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 14, paddingVertical: 13 }}>
        <ChamferBox chamfer={9} fill={DmRune.ink} stroke={DmRune.accent} strokeWidth={1.2} style={{ width: 46, height: 46, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={20} height={20} viewBox="0 0 24 24">
            <Line x1={12} y1={4} x2={12} y2={20} stroke={DmRune.accent} strokeWidth={2.4} />
            <Line x1={4} y1={12} x2={20} y2={12} stroke={DmRune.accent} strokeWidth={2.4} />
          </Svg>
        </ChamferBox>
        <View style={{ flex: 1 }}>
          <Text style={{ color: DmRune.ivory, fontSize: DmType.title, fontFamily: Display.black, letterSpacing: 0.8, textTransform: 'uppercase' }}>New campaign</Text>
          <Text style={{ color: DmRune.muted, fontSize: DmType.body, fontFamily: Body.medium, marginTop: 2 }}>A cast, and its nights at the table</Text>
        </View>
      </ChamferBox>
    </Pressable>
  );
}
