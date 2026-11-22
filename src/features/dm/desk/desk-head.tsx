/**
 * What makes the DM screen one screen (v0.50.2, Koy: "a simpler way to navigate"; owner: "don't just place another
 * mobile port"). One frame round both sides and one title over them: the party on the left, the encounter on the
 * right, each side's own tabs at its top. The screens under it are drawn bare, so nothing here is said twice.
 */
import { type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, DmRune } from '@/constants/theme';
import type { Desktop, DesktopPort } from '@/hooks/use-desktop';
import type { Encounter } from '@/lib/session';
import { playSfx } from '@/lib/sfx';
import type { DmView } from './dm-desk';

const WHAT: Record<DmView, { label: string; what: string }> = {
  party: { label: 'Party', what: 'Party sheet' },
  cast: { label: 'Cast', what: 'Cast' },
  encounter: { label: 'Encounter', what: 'This encounter' },
  session: { label: 'Session', what: "This session's encounters" },
  library: { label: 'Library', what: 'Adversary library' },
};
const PARTY_SIDE: DmView[] = ['party', 'cast'];
const FIGHT_SIDE: DmView[] = ['encounter', 'session', 'library'];
const ONE_COLUMN: DmView[] = ['encounter', 'party', 'session', 'cast', 'library'];
const STATUS: Record<Encounter['status'], string> = { prepared: 'Prepared', active: 'Active', completed: 'Finished' };
const TITLE_H = 50;
const TABS_H = 36;

function HeadButton({ what, on, disabled, tab, onPress, children }: { what: string; on?: boolean; disabled?: boolean; tab?: boolean; onPress: () => void; children: ReactNode }) {
  return (
    <Pressable onPress={() => { if (!on) playSfx('buttonTap'); onPress(); }} disabled={disabled}
      accessibilityRole={tab ? 'tab' : 'button'} aria-selected={tab ? !!on : undefined} accessibilityLabel={what}
      style={({ hovered }: { hovered?: boolean }) => ({
        ...(tab ? { flexGrow: 1 } : { minHeight: 32 }),
        paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1,
        borderBottomWidth: 2, borderBottomColor: on ? DmRune.accent : 'transparent',
        backgroundColor: hovered && !on ? DmRune.panelLit : 'transparent',
      })}>
      {children}
    </Pressable>
  );
}

function Tabs({ port, screen, views, shown, hasEncounter, onOpen }: { port: DesktopPort; screen: Desktop['screen']; views: DmView[]; shown: (view: DmView) => boolean; hasEncounter: boolean; onOpen: (view: DmView) => void }) {
  return (
    <View accessibilityRole="tablist" style={{ position: 'absolute', left: port.left - screen.left, top: TITLE_H, width: port.width, height: TABS_H, flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: DmRune.line }}>
      {views.map((view) => (
        <HeadButton key={view} tab what={WHAT[view].what} on={shown(view)} disabled={view === 'encounter' && !hasEncounter} onPress={() => onOpen(view)}>
          <Text numberOfLines={1} style={{ color: shown(view) ? DmRune.ivory : DmRune.accent, fontSize: views.length > 3 ? 11 : 12.5, fontFamily: Body.bold, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {WHAT[view].label}
          </Text>
        </HeadButton>
      ))}
    </View>
  );
}

export function DeskHead({ desktop, title, encounter, shown, hasEncounter, onOpen, onPair, onStart }: {
  desktop: Desktop;
  title: string;
  /** The encounter on the screen, when one is. */
  encounter?: Encounter;
  shown: (view: DmView) => boolean;
  hasEncounter: boolean;
  onOpen: (view: DmView) => void;
  onPair: (on: boolean) => void;
  onStart: () => void;
}) {
  const { screen, port, beside, canPair } = desktop;
  const waiting = encounter?.status === 'prepared';
  return (
    <View pointerEvents="box-none" style={{ flex: 1 }}>
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
        <ChamferBox chamfer={14} stroke={DmRune.line} strokeWidth={1.4} style={{ flex: 1 }} />
      </View>
      <View style={{ height: TITLE_H, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 18, paddingRight: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} accessibilityRole="header" style={{ color: DmRune.ivory, fontSize: 16, lineHeight: 21, fontFamily: Display.black, letterSpacing: 0.8, textTransform: 'uppercase' }}>{title}</Text>
          {encounter ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: encounter.status === 'completed' ? DmRune.muted : waiting ? DmRune.accentDim : DmRune.accent }} />
              <Text numberOfLines={1} style={{ color: DmRune.muted, fontSize: 11.5, lineHeight: 15, fontFamily: Body.bold }}>
                {encounter.options.globalSync ? STATUS[encounter.status] : `${STATUS[encounter.status]}, self-contained`}
              </Text>
            </View>
          ) : null}
        </View>
        {waiting ? <RuneButton label="Start" accessibilityLabel="Start encounter" kind="primary" height={30} dense dm style={{ width: 86 }} onPress={onStart} /> : null}
        {canPair ? (
          <HeadButton what={beside ? 'Hide the party' : 'Show the party'} onPress={() => onPair(!beside)}>
            <Text style={{ color: DmRune.accent, fontSize: 11.5, fontFamily: Body.bold }}>{beside ? 'Hide party' : 'Show party'}</Text>
          </HeadButton>
        ) : null}
      </View>
      {beside ? <Tabs port={beside} screen={screen} views={PARTY_SIDE} shown={shown} hasEncounter={hasEncounter} onOpen={onOpen} /> : null}
      <Tabs port={port} screen={screen} views={beside ? FIGHT_SIDE : ONE_COLUMN} shown={shown} hasEncounter={hasEncounter} onOpen={onOpen} />
      {beside ? <View pointerEvents="none" style={{ position: 'absolute', left: port.left - screen.left, top: TITLE_H, bottom: 2, width: 1, backgroundColor: DmRune.line }} /> : null}
    </View>
  );
}
