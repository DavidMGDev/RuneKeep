/**
 * Class tracker cards (v0.19.1 item 7) — one live, interactive card in the Arsenal for the two Void
 * classes whose signature mechanic needs table tracking, modelled on the Martial Focus / Companion live
 * cards. NOT a separate category and never deletable or duplicatable (only movable) — enforced in the sheet.
 *
 *  • Summoner — Summon Entity: four summoning circles (Fate Spirit + the subclass's Foundation /
 *    Specialization / Mastery entities). Each circle is a counter; the shared cap is your level; the Fourth
 *    Circle holds at most one. Theurgy's Divine Manifestation adds a Hope-dice sub-track (starts at 3).
 *  • Warlock — Patron: a named patron, a Sphere of Influence, the level-driven Patron Die (d6, d8 from
 *    level 5), and a Favor track (starts at 3, printed as six). v0.25.0 matched this to the printed
 *    card, which has ONE sphere field and no per-sphere value.
 *
 * Each card explains its rule inline so it's understandable at a glance, and every control is a plain tap
 * (steppers / pips / text fields) writing back through onChange to file.classTracker.
 */
import { memo } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { Body, Display, Rune } from '@/constants/theme';
import { DividerPlaque, getPlaqueTheme } from '@/features/create/components/card-divider';
import { FORGED_H, FORGED_W, PlaqueLabel } from '@/features/create/components/forged-card';
import { type ClassTrackerState } from '@/lib/character-file';
import { tierForLevel } from '@/lib/leveling';

export const SUMMONER_TRACKER_ID = 'summoner-tracker';
export const WARLOCK_TRACKER_ID = 'warlock-tracker';
export const CLASS_TRACKER_IDS = new Set<string>([SUMMONER_TRACKER_ID, WARLOCK_TRACKER_ID]);
/** True for a class-tracker card id (used by the sheet's delete/duplicate guards). */
export const isClassTrackerId = (id: string): boolean => CLASS_TRACKER_IDS.has(id);

const ART_H = Math.round(FORGED_H * 0.2);
const BORDER = '#7a5a86';
const INK = Rune.inkText;

/** A tiny − / + stepper. */
function Step({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={disabled ? undefined : onPress} disabled={disabled} hitSlop={5} accessibilityRole="button" accessibilityLabel={label === '+' ? 'Increase' : 'Decrease'}>
      <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1.4, borderColor: disabled ? 'rgba(122,90,134,0.35)' : BORDER, backgroundColor: 'rgba(122,90,134,0.16)', opacity: disabled ? 0.4 : 1 }}>
        <Text style={{ color: INK, fontSize: 16, fontFamily: Display.black, lineHeight: 18 }}>{label}</Text>
      </View>
    </Pressable>
  );
}

function CardFrame({ label, artFill, glyph, children }: { label: string; artFill: string; glyph: React.ReactNode; children: React.ReactNode }) {
  const theme = getPlaqueTheme('Ability');
  return (
    <View style={{ width: FORGED_W, height: FORGED_H, backgroundColor: Rune.sheet, overflow: 'hidden' }}>
      <View style={{ height: ART_H, backgroundColor: artFill, alignItems: 'center', justifyContent: 'center' }}>{glyph}</View>
      <View style={{ position: 'absolute', top: ART_H - (FORGED_W + 14) / (1978.811 / 151.3009) / 2, left: -7, right: -7, alignItems: 'center' }} pointerEvents="none">
        <DividerPlaque width={FORGED_W + 14} gradientStops={theme.gradientStops} maskFill={theme.solidColor}>
          <PlaqueLabel text={label} textColor={theme.textColor} />
        </DividerPlaque>
      </View>
      <View style={{ flex: 1, paddingHorizontal: 12, paddingTop: 16, paddingBottom: 10 }}>{children}</View>
    </View>
  );
}

// --------------------------------------------------------------------------- Summoner

const SUMMONER_ENTITIES: Record<'necromancy' | 'theurgy' | 'unknown', string[]> = {
  necromancy: ['Fate Spirit', 'Shambling Corpse', 'Ghost', 'Death Knight'],
  theurgy: ['Fate Spirit', 'Angel', 'Archangel', 'Divine Manifestation'],
  unknown: ['Fate Spirit', 'Second Circle', 'Third Circle', 'Fourth Circle'],
};

export const SummonerTrackerCard = memo(function SummonerTrackerCard({ state, subclass, level, onChange }: {
  state: ClassTrackerState | undefined;
  subclass: 'necromancy' | 'theurgy' | undefined;
  level: number;
  onChange: (patch: Partial<ClassTrackerState>) => void;
}) {
  const names = SUMMONER_ENTITIES[subclass ?? 'unknown'];
  const circles = [0, 1, 2, 3].map((i) => Math.max(0, state?.summonerCircles?.[i] ?? 0));
  const total = circles.reduce((s, n) => s + n, 0);
  const cap = Math.max(1, level);
  const tier = tierForLevel(level);
  const setCircle = (i: number, n: number) => { const next = [...circles]; next[i] = Math.max(0, i === 3 ? Math.min(1, n) : n); onChange({ summonerCircles: next }); };
  const divineHope = Math.max(0, state?.divineHope ?? 0);
  const showDivine = subclass === 'theurgy' && circles[3] > 0;
  return (
    <CardFrame
      label="Summon Entity"
      artFill="#241830"
      glyph={<SummonGlyph />}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <Text style={{ color: INK, fontSize: 10, fontFamily: Body.bold, letterSpacing: 0.4, textTransform: 'uppercase' }}>Summoning Circles</Text>
        <Text style={{ color: total >= cap ? '#9a3327' : Rune.inkMuted, fontSize: 10.5, fontFamily: Display.black }}>{total}/{cap}</Text>
      </View>
      {names.map((name, i) => {
        const atCap = i === 3 ? circles[i] >= 1 : total >= cap;
        return (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Text style={{ flex: 1, color: INK, fontSize: 10.5, fontFamily: Body.semibold }} numberOfLines={1}>{i + 1}. {name}{i === 3 ? ' (max 1)' : ''}</Text>
            <Step label="−" onPress={() => setCircle(i, circles[i] - 1)} disabled={circles[i] <= 0} />
            <Text style={{ width: 18, textAlign: 'center', color: INK, fontSize: 14, fontFamily: Display.black }}>{circles[i]}</Text>
            <Step label="+" onPress={() => setCircle(i, circles[i] + 1)} disabled={atCap} />
          </View>
        );
      })}
      {showDivine ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: 'rgba(122,90,134,0.3)' }}>
          <Text style={{ flex: 1, color: INK, fontSize: 10, fontFamily: Body.semibold }} numberOfLines={1}>Divine Manifestation Hope dice</Text>
          <Step label="−" onPress={() => onChange({ divineHope: Math.max(0, divineHope - 1) })} disabled={divineHope <= 0} />
          <Text style={{ width: 18, textAlign: 'center', color: INK, fontSize: 14, fontFamily: Display.black }}>{divineHope}</Text>
          <Step label="+" onPress={() => onChange({ divineHope: divineHope + 1 })} />
        </View>
      ) : null}
      <Text style={{ color: INK, fontSize: 8.5, lineHeight: 11.6, fontFamily: Body.regular, marginTop: 8 }}>
        Mark a Stress to summon Entities equal to your tier ({tier}); hold up to your level total. Most commands consume the Entity.
      </Text>
      <Text style={{ color: Rune.inkMuted, fontSize: 8, fontFamily: Body.medium, textAlign: 'center', marginTop: 'auto' }}>Tap ± to summon or dismiss</Text>
    </CardFrame>
  );
});

// --------------------------------------------------------------------------- Warlock

const FAVOR_PRINTED = 6; // the printed track shows six circles (prose gives no hard cap)

/** The printed card: "Your Patron Die starts at a d6 and increases to a d8 at level 5." */
export const patronDie = (level: number): 'd6' | 'd8' => (level >= 5 ? 'd8' : 'd6');

export const WarlockTrackerCard = memo(function WarlockTrackerCard({ state, level, onChange }: {
  state: ClassTrackerState | undefined;
  /** The Patron Die is level-driven, not a choice, so the card reads it rather than storing it. */
  level: number;
  onChange: (patch: Partial<ClassTrackerState>) => void;
}) {
  const patron = state?.patron ?? '';
  // v0.25.0: the printed card has ONE Sphere of Influence field. Earlier builds modelled two named
  // spheres with a numeric value each, which the card does not have. Anything a player already typed
  // is folded into the single field rather than dropped.
  const sphere = state?.sphere ?? (state?.spheres ?? []).map((x) => x.name).filter(Boolean).join(', ');
  const favor = Math.max(0, state?.favor ?? 3);
  const die = patronDie(level);
  return (
    <CardFrame label="Patron" artFill="#221726" glyph={<PatronGlyph />}>
      <TextInput
        value={patron}
        onChangeText={(t) => onChange({ patron: t })}
        placeholder="Patron's name"
        placeholderTextColor={Rune.inkMuted}
        maxLength={40}
        style={{ color: INK, fontSize: 13, fontFamily: Body.bold, borderBottomWidth: 1, borderBottomColor: BORDER, paddingBottom: 3, marginBottom: 8 }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: INK, fontSize: 8, fontFamily: Body.bold, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 2 }}>Sphere of influence</Text>
          <TextInput
            value={sphere}
            onChangeText={(t) => onChange({ sphere: t })}
            placeholder="Nature, War, Death…"
            placeholderTextColor={Rune.inkMuted}
            maxLength={48}
            style={{ color: INK, fontSize: 11, fontFamily: Body.semibold, borderBottomWidth: 1, borderBottomColor: 'rgba(122,90,134,0.4)', paddingBottom: 2 }}
          />
        </View>
        <View style={{ alignItems: 'center', borderWidth: 1.4, borderColor: BORDER, backgroundColor: 'rgba(122,90,134,0.16)', paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ color: Rune.inkMuted, fontSize: 7, fontFamily: Body.bold, letterSpacing: 0.3 }}>PATRON DIE</Text>
          <Text style={{ color: INK, fontSize: 15, fontFamily: Display.black }}>{die}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
        <Text style={{ color: INK, fontSize: 10, fontFamily: Body.bold, letterSpacing: 0.4, textTransform: 'uppercase' }}>Favor</Text>
        <Text style={{ color: INK, fontSize: 14, fontFamily: Display.black }}>{favor}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 5, marginTop: 6, justifyContent: 'center' }}>
        {Array.from({ length: FAVOR_PRINTED }, (_, i) => (
          <Pressable key={i} onPress={() => onChange({ favor: i + 1 <= favor ? i : i + 1 })} hitSlop={4} accessibilityRole="button" accessibilityLabel={`Favor ${i + 1}`}>
            <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 1.6, borderColor: BORDER, backgroundColor: i < favor ? '#8a5aa0' : 'transparent' }} />
          </Pressable>
        ))}
      </View>
      <Text style={{ color: INK, fontSize: 8.5, lineHeight: 11.6, fontFamily: Body.regular, marginTop: 8 }}>
        Spend a Favor before an action roll in your patron{'’'}s sphere to roll your Patron Die and add it. Start with 3; tithe during a rest to gain Favor equal to your Spellcast trait.
      </Text>
      <Text style={{ color: Rune.inkMuted, fontSize: 8, fontFamily: Body.medium, textAlign: 'center', marginTop: 'auto' }}>Tap a Favor pip to spend or regain</Text>
    </CardFrame>
  );
});

// --------------------------------------------------------------------------- glyphs (inline, no assets)

const SummonGlyph = memo(function SummonGlyph() {
  return (
    <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: '#b48ad0' }} />
      <View style={{ position: 'absolute', width: 18, height: 18, borderRadius: 9, borderWidth: 1.6, borderColor: '#8a5aa0' }} />
      <View style={{ position: 'absolute', width: 4, height: 4, borderRadius: 2, backgroundColor: '#d8bff0' }} />
    </View>
  );
});

const PatronGlyph = memo(function PatronGlyph() {
  return (
    <View style={{ width: 40, height: 26, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 34, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#b48ad0', alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#d8bff0' }} />
      </View>
    </View>
  );
});
