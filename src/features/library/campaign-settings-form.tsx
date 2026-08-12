/**
 * CAMPAIGN SETTINGS, authored (v0.42.1, owner).
 *
 * "Add campaign settings, where a DM can enable or disable options for character creation, in a UI
 * similar to characterize, and this is shipped in an expansion."
 *
 * So it looks like the Skip Menu: a checklist, everything at once, grouped, with the group's own
 * Enable all / Disable all above it. Checked means available, which is the way round a DM reads it:
 * they are saying what their campaign HAS, not what it forbids.
 *
 * What it writes is the inverse (only what is OFF is stored, see `lib/campaign-settings`), because a
 * campaign written today against the base game should not have to be edited when an expansion adds a
 * class next month.
 */
import { Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { CLASSES } from '@/constants/identity';
import { Body, Display, Rune } from '@/constants/theme';
import { CATALOG } from '@/data/catalog';
import { type CampaignSettings, countOn, EMPTY_CAMPAIGN_SETTINGS, optionKey, setKeys, stepKey, syncSteps, toggleKey } from '@/lib/campaign-settings';
import type { Expansion } from '@/lib/library';
import { DimScreen } from '@/lib/screen-dim';
import { playSfx } from '@/lib/sfx';

interface Row {
  key: string;
  label: string;
}

/**
 * The steps a campaign may switch off wholesale.
 *
 * Class is not here and never will be: a character without one has no numbers to be built from, and
 * the app would have nothing to forge. Traits are not here either, for the same reason.
 */
const STEPS: Row[] = [
  { key: stepKey('subclass'), label: 'Subclass' },
  { key: stepKey('ancestry'), label: 'Ancestry' },
  { key: stepKey('community'), label: 'Community' },
  { key: stepKey('domains'), label: 'Domain cards' },
  { key: stepKey('experiences'), label: 'Experiences' },
  { key: stepKey('weapons'), label: 'Weapons' },
  { key: stepKey('armor'), label: 'Armor' },
  { key: stepKey('inventory'), label: 'Inventory' },
];

function groupsFor(exp: Expansion): { title: string; hint: string; rows: Row[] }[] {
  const cat = (kind: string) => CATALOG.filter((c) => c.kind === kind);
  const own = (t: string) => exp.cards.filter((c) => c.contentType === t);
  return [
    { title: 'Steps', hint: 'A step turned off never appears. Class and Traits cannot be turned off: without them there is no character.', rows: STEPS },
    {
      title: 'Classes',
      hint: 'Which classes a character may be.',
      rows: [
        ...CLASSES.map((c) => ({ key: optionKey('class', `class-${c.key}`), label: c.label })),
        ...own('class').map((c) => ({ key: optionKey('class', c.id), label: c.title || 'Untitled' })),
      ],
    },
    {
      title: 'Ancestries',
      hint: 'Which ancestries are in this world.',
      rows: [
        ...cat('ancestry').map((c) => ({ key: optionKey('ancestry', c.id), label: c.label })),
        ...own('ancestry').map((c) => ({ key: optionKey('ancestry', c.id), label: c.title || 'Untitled' })),
      ],
    },
    {
      title: 'Communities',
      hint: 'Where a character may come from.',
      rows: [
        ...cat('community').map((c) => ({ key: optionKey('community', c.id), label: c.label })),
        ...own('community').map((c) => ({ key: optionKey('community', c.id), label: c.title || 'Untitled' })),
      ],
    },
  ].filter((g) => g.rows.length > 0);
}

function Check({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      style={({ pressed }) => ({ width: '50%', paddingVertical: 4, paddingRight: 8, opacity: pressed ? 0.6 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ChamferBox chamfer={4} fill={on ? Rune.gold : 'transparent'} stroke="rgba(218,162,73,0.6)" strokeWidth={1.2} style={{ width: 19, height: 19, alignItems: 'center', justifyContent: 'center' }}>
          {on ? (
            <Svg width={11} height={11} viewBox="0 0 12 12">
              <Polyline points="2,6 5,9 10,3" fill="none" stroke={Rune.ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          ) : null}
        </ChamferBox>
        <Text numberOfLines={1} style={{ flex: 1, color: on ? Rune.sheet : Rune.muted, fontSize: 12, fontFamily: Body.semibold, letterSpacing: 0.3 }}>{label}</Text>
      </View>
    </Pressable>
  );
}

export function CampaignSettingsForm({ exp, onChange, onClose }: {
  exp: Expansion;
  onChange: (c: CampaignSettings) => void;
  onClose: () => void;
}) {
  const cs = exp.campaign ?? EMPTY_CAMPAIGN_SETTINGS;
  const groups = groupsFor(exp);
  /**
   * Every change goes through here so a step whose last option went turns itself off, and turns back
   * on the moment one returns. Deciding it here is what keeps the creator from having to build every
   * deck just to count what is left in it.
   */
  const commit = (next: CampaignSettings) =>
    onChange(syncSteps(next, [
      { deck: 'ancestry', keys: groups.find((g) => g.title === 'Ancestries')?.rows.map((r) => r.key) ?? [] },
      { deck: 'community', keys: groups.find((g) => g.title === 'Communities')?.rows.map((r) => r.key) ?? [] },
    ]));
  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 9000, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(6,8,13,0.92)' }} />
      <DimScreen opacity={0.92} />
      <ChamferBox chamfer={14} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} style={{ width: 348, maxHeight: 640, paddingHorizontal: 14, paddingVertical: 14, gap: 10 }}>
        <Text style={{ color: Rune.goldText, fontSize: 17, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.5 }}>Campaign settings</Text>
        <Text style={{ color: Rune.muted, fontSize: 10.5, fontFamily: Body.regular, lineHeight: 15 }}>
          What character creation offers at your table. It travels with this expansion, so anyone who enables it
          builds inside these rules. Checked means available.
        </Text>
        {/* The switch. Off is the default, and off means this pack limits nothing at all. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <RuneButton
            label={cs.on ? 'Limits are ON' : 'Limits are off'}
            kind={cs.on ? 'primary' : 'ghost'}
            dense
            height={36}
            style={{ flex: 1 }}
            onPress={() => { playSfx('buttonTap'); onChange({ ...cs, on: !cs.on }); }}
          />
        </View>
        {cs.on ? (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 6 }}>
            {groups.map((g) => {
              const keys = g.rows.map((r) => r.key);
              const on = countOn(cs, keys);
              return (
                <View key={g.title} style={{ gap: 5 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ flex: 1, color: Rune.goldText, fontSize: 10.5, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>{g.title} · {on}/{keys.length}</Text>
                    <Pressable onPress={() => commit(setKeys(cs, keys, true))} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Enable all ${g.title}`}>
                      <Text style={{ color: Rune.goldText, fontSize: 10, fontFamily: Body.bold, letterSpacing: 0.5 }}>ALL</Text>
                    </Pressable>
                    <Pressable onPress={() => commit(setKeys(cs, keys, false))} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Disable all ${g.title}`}>
                      <Text style={{ color: '#E2705A', fontSize: 10, fontFamily: Body.bold, letterSpacing: 0.5 }}>NONE</Text>
                    </Pressable>
                  </View>
                  <Text style={{ color: Rune.muted, fontSize: 9.5, fontFamily: Body.regular, lineHeight: 13 }}>{g.hint}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                    {g.rows.map((r) => (
                      <Check key={r.key} label={r.label} on={!cs.disabled.includes(r.key)} onPress={() => { playSfx('cardSelect'); commit(toggleKey(cs, r.key)); }} />
                    ))}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        ) : (
          <Text style={{ color: Rune.muted, fontSize: 11.5, fontFamily: Body.regular, lineHeight: 16, paddingVertical: 12 }}>
            Turn limits on to choose what your campaign allows. Until you do, this expansion adds its cards and
            takes nothing away, which is how every expansion has always worked.
          </Text>
        )}
        <RuneButton label="Done" kind="primary" height={42} onPress={onClose} />
      </ChamferBox>
    </View>
  );
}
