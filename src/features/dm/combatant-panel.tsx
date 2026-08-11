/**
 * CombatantPanel (v0.15.0; reworked v0.16.0–v0.18.0) — an adversary or NPC in an encounter. A portrait
 * (tap → fullscreen), sheet-coloured radial StatPulses (tap = keypad, hold = ±wheel), a PENCIL to configure.
 * Tapping the TITLE / top row expands the full SRD stat block with a smooth layout animation — surrounding
 * cards reflow, nothing pops (item 5). Outline colour signals side: red = adversary, teal = ally (item 5).
 * Selection is bold — accent wash + check badge (item 4). Deletion stays hard (PRD #9): the X downs a live
 * unit to "Fallen"; only a fallen unit's X actually deletes.
 */
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Line, Path, Polyline } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { Portrait } from '@/components/portrait';
import { FitLine } from '@/components/fit-line';
import { RuneButton } from '@/components/rune-button';
import { DmType, Body, Display, DmRune } from '@/constants/theme';
import { type CharacterFile } from '@/lib/character-file';
import { type MemberVitals, type VitalKey } from '@/lib/party';
import { counterMode, soleCounter } from '@/lib/dm-counters';
import { type Combatant, type CombatantStat } from '@/lib/session';
import { MemberPanel } from './member-panel';
import { AdversaryPortrait, BaseGameEmblem, hasStatBlock, StatBlockDetail } from './adversary-detail';
import { CounterRow, CounterStepper } from './counter-control';
import { StatGlyph } from './stat-glyphs';
import { StatPulse } from './stat-pulse';
import { DmPress } from './dm-ui';

// item 4: short, smooth reflow — no spring bounce.
const SPRING = LinearTransition.duration(180).easing(Easing.out(Easing.cubic));

function Pencil() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="M4 20 L4 16 L15 5 L19 9 L8 20 Z" fill="none" stroke={DmRune.accent} strokeWidth={1.8} strokeLinejoin="round" /><Line x1={13} y1={7} x2={17} y2={11} stroke={DmRune.accent} strokeWidth={1.8} /></Svg>
  );
}

/**
 * Two different actions, two different marks (v0.36.1, owner).
 *
 * Both used to be an X, which said "remove" for a control that does not remove anything: downing an
 * adversary keeps it in the fight as Fallen, and that is the whole point of the Fallen state. A
 * downward arrow says what it does. The X survives on a FALLEN row, where it really does delete.
 */
function FellArrow() {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16">
      <Line x1={8} y1={2} x2={8} y2={12} stroke={DmRune.red} strokeWidth={2} strokeLinecap="round" />
      <Polyline points="3.5,8 8,13 12.5,8" fill="none" stroke={DmRune.red} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function RemoveX() {
  return (
    <Svg width={15} height={15} viewBox="0 0 16 16"><Line x1={3} y1={3} x2={13} y2={13} stroke={DmRune.red} strokeWidth={2} /><Line x1={13} y1={3} x2={3} y2={13} stroke={DmRune.red} strokeWidth={2} /></Svg>
  );
}

export function CombatantPanel({
  combatant,
  friendly,
  selecting,
  selected,
  onApply,
  onRequestSet,
  onEdit,
  onFell,
  onRecover,
  onDelete,
  onLongPress,
  onToggleSelect,
  onOpenImage,
  onCounter,
  dimmed,
}: {
  combatant: Combatant;
  friendly?: boolean;
  selecting?: boolean;
  selected?: boolean;
  onApply: (stat: CombatantStat, delta: number) => void;
  onRequestSet: (stat: CombatantStat) => void;
  onEdit: () => void;
  onFell: () => void;
  onRecover: () => void;
  onDelete: () => void;
  onLongPress?: () => void;
  onToggleSelect?: () => void;
  onOpenImage?: () => void;
  /** Move one of this entry's counters (v0.41.3). Absent draws them read-only. */
  onCounter?: (counterId: string, delta: number) => void;
  /** v0.36 (owner): a prepared encounter fades its combatants; expanding one fades it back to full. */
  dimmed?: boolean;
}) {
  const c = combatant;
  const [open, setOpen] = useState(false);
  // Fades in when expanded and back out when closed, so a stat block can be read while the encounter
  // still says, everywhere else, that it has not started.
  const fade = useSharedValue(1);
  useEffect(() => { fade.value = withTiming(dimmed && !open ? 0.4 : 1, { duration: 220, easing: Easing.out(Easing.quad) }); }, [dimmed, open, fade]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const sideColor = friendly ? DmRune.ally : DmRune.red;
  const stroke = selected ? DmRune.accent : c.fallen ? 'rgba(139,144,154,0.5)' : `${sideColor}80`;
  const fill = selected ? 'rgba(196,200,208,0.16)' : c.fallen ? 'rgba(16,16,18,0.9)' : friendly ? 'rgba(15,20,20,0.92)' : 'rgba(20,15,15,0.92)';
  /**
   * TAKEN OVER (v0.41.3, owner).
   *
   * One counter marked Take Over and the entry IS that counter: the name, the description and the
   * number, with the stat block gone. Two or more and no single number can sit beside the name, so
   * the entry becomes a title that opens into all of them and drops everything else, which is the
   * owner's rule verbatim: "all other info has been dropped in favor of the Title and description of
   * the adversary entry, as well as each counter".
   */
  const mode = counterMode(c.counters);
  const sole = soleCounter(c.counters);
  const canExpand = mode === 'list' || (mode === 'none' && hasStatBlock(c));
  const headerTap = () => { if (selecting) onToggleSelect?.(); else if (canExpand) setOpen((o) => !o); };

  // A fallen unit collapses to name + Fallen + Recover; its X deletes.
  if (c.fallen) {
    return (
      <Animated.View layout={SPRING} style={fadeStyle}>
        <DmPress onPress={selecting ? onToggleSelect : undefined} onLongPress={onLongPress} delayLongPress={340} accessibilityRole="button" accessibilityLabel={`${c.name}, fallen`}>
          <ChamferBox chamfer={11} fill={fill} stroke={stroke} strokeWidth={selected ? 2 : 1.3} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 12 }}>
            {selecting ? (
              <ChamferBox chamfer={6} fill={selected ? DmRune.accent : 'transparent'} stroke={selected ? 'transparent' : DmRune.accentDim} strokeWidth={1.3} style={{ width: 26, height: 26, alignItems: 'center', justifyContent: 'center' }}>
                {selected ? <Svg width={13} height={13} viewBox="0 0 12 12"><Polyline points="2,6 5,9 10,3" fill="none" stroke={DmRune.ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></Svg> : null}
              </ChamferBox>
            ) : null}
            <FitLine style={{ flex: 1, color: DmRune.muted, fontSize: DmType.title, fontFamily: Display.black, letterSpacing: 0.5, textTransform: 'uppercase' }}>{c.name}</FitLine>
            <Text style={{ color: DmRune.red, fontSize: DmType.body, fontFamily: Body.bold, letterSpacing: 1.4, textTransform: 'uppercase' }}>Fallen</Text>
            {!selecting ? (
              <>
                <RuneButton label="Recover" kind="secondary" height={30} dense dm onPress={onRecover} />
                <DmPress onPress={onDelete} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Delete ${c.name}`}>
                  <RemoveX />
                </DmPress>
              </>
            ) : null}
          </ChamferBox>
        </DmPress>
      </Animated.View>
    );
  }

  if (mode !== 'none') {
    return (
      <Animated.View layout={SPRING} style={fadeStyle}>
        <ChamferBox chamfer={11} fill={fill} stroke={stroke} strokeWidth={selected ? 2 : 1.3} style={{ paddingHorizontal: 12, paddingVertical: 11, gap: 10 }}>
          {selecting ? (
            <Pressable onPress={onToggleSelect} onLongPress={onLongPress} accessibilityRole="checkbox" accessibilityState={{ checked: !!selected }} accessibilityLabel={`${c.name}, ${selected ? 'selected' : 'not selected'}`} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 5 }} />
          ) : null}
          {/* The title's press wraps the NAME only, and the controls sit beside it rather than
              inside it. A stepper nested in the header press is a button inside a button, which is
              invalid on the web and asks the two presses to negotiate on a phone; the counter is the
              one control here that must never miss. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <DmPress
              onPress={headerTap}
              onLongPress={onLongPress}
              delayLongPress={340}
              accessibilityRole="button"
              accessibilityLabel={`${c.name}${sole ? `, ${sole.name || 'counter'} at ${sole.value}` : ', tap to open its counters'}`}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {selecting ? (
                <ChamferBox chamfer={6} fill={selected ? DmRune.accent : 'transparent'} stroke={selected ? 'transparent' : DmRune.accentDim} strokeWidth={1.3} style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}>
                  {selected ? <Svg width={18} height={18} viewBox="0 0 12 12"><Polyline points="2,6 5,9 10,3" fill="none" stroke={DmRune.ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></Svg> : null}
                </ChamferBox>
              ) : (
                <Portrait uri={c.portraitUri} size={38} tint={sideColor} fill={DmRune.ink} glyph={<BaseGameEmblem size={19} />} />
              )}
              <View style={{ flex: 1, gap: 1 }}>
                <FitLine style={{ color: DmRune.ivory, fontSize: DmType.title, fontFamily: Display.black, letterSpacing: 0.5, textTransform: 'uppercase' }}>{c.name}</FitLine>
                {sole?.name ? <Text numberOfLines={1} style={{ color: DmRune.accentDim, fontSize: DmType.micro, fontFamily: Body.bold, letterSpacing: 0.7, textTransform: 'uppercase' }}>{sole.name}</Text> : null}
              </View>
              {/* Several counters cannot all ride the title, so a chevron opens them instead. */}
              {!selecting && !sole ? <Svg width={14} height={14} viewBox="0 0 16 16" style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}><Polyline points="5,3 11,8 5,13" fill="none" stroke={DmRune.accentDim} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg> : null}
            </DmPress>
            {/* One counter DOES ride the title, and this is the whole entry, so it gets the space. */}
            {!selecting && sole ? <CounterStepper c={sole} size={32} onStep={onCounter ? (d) => onCounter(sole.id, d) : undefined} /> : null}
            {!selecting ? <DmPress onPress={onEdit} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Configure ${c.name}`}><Pencil /></DmPress> : null}
          </View>

          {c.description ? <Text style={{ color: DmRune.muted, fontSize: DmType.body, fontFamily: Body.regular, lineHeight: 17 }}>{c.description}</Text> : null}

          {open && mode === 'list' ? (
            <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={{ gap: 8 }}>
              {(c.counters ?? []).map((x) => <CounterRow key={x.id} c={x} onStep={onCounter ? (d) => onCounter(x.id, d) : undefined} />)}
            </Animated.View>
          ) : null}
        </ChamferBox>
      </Animated.View>
    );
  }

  // v0.36.1 (owner): DIFFICULTY belongs in the compact row. It is the number the DM needs most
  // often and it was only visible once the stat block was expanded.
  const anyTrack = c.show.hp || c.show.stress || c.show.thresholds || !!c.difficulty;
  return (
    <Animated.View layout={SPRING} style={fadeStyle}>
      <ChamferBox chamfer={11} fill={fill} stroke={stroke} strokeWidth={selected ? 2 : 1.3} style={{ paddingHorizontal: 12, paddingVertical: 11, gap: anyTrack || (c.show.description && !open) || open ? 10 : 0 }}>
        {/* While selecting, ANY tap on the entry selects it: the header is not the only target, and
            hunting for it is the sort of precision a bulk action should not ask for. */}
        {selecting ? (
          <Pressable
            onPress={onToggleSelect}
            onLongPress={onLongPress}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: !!selected }}
            accessibilityLabel={`${c.name}, ${selected ? 'selected' : 'not selected'}`}
            style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 5 }}
          />
        ) : null}
        {/* header row — tap toggles the stat block; hold multi-selects */}
        <DmPress onPress={headerTap} onLongPress={onLongPress} delayLongPress={340} accessibilityRole="button" accessibilityLabel={`${c.name}${canExpand ? ', tap to expand' : ''}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {/* v0.36.3 (owner): the checkbox takes the PORTRAIT'S place at the portrait's size, so an
              entry does not shrink and reflow the moment it is selected. It used to swap a 38dp
              portrait for a 24dp box, which pulled the name and every stat left and made the whole
              row jump. */}
          {selecting ? (
            <ChamferBox chamfer={6} fill={selected ? DmRune.accent : 'transparent'} stroke={selected ? 'transparent' : DmRune.accentDim} strokeWidth={1.3} style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}>
              {selected ? <Svg width={18} height={18} viewBox="0 0 12 12"><Polyline points="2,6 5,9 10,3" fill="none" stroke={DmRune.ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></Svg> : null}
            </ChamferBox>
          ) : (
            <AdversaryPortrait uri={c.portraitUri} size={38} tint={sideColor} onPress={onOpenImage} />
          )}
          <FitLine style={{ flex: 1, color: DmRune.ivory, fontSize: DmType.title, fontFamily: Display.black, letterSpacing: 0.5, textTransform: 'uppercase' }}>{c.name}</FitLine>
          {!selecting ? (
            <>
              {canExpand ? <Svg width={14} height={14} viewBox="0 0 16 16" style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}><Polyline points="5,3 11,8 5,13" fill="none" stroke={DmRune.accentDim} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg> : null}
              <DmPress onPress={onEdit} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Configure ${c.name}`}><Pencil /></DmPress>
              <DmPress onPress={onFell} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Down ${c.name}`}>
                <FellArrow />
              </DmPress>
            </>
          ) : null}
        </DmPress>

        {/* The stats stay where they are, and stop responding, while selecting: a tap anywhere on the
            entry is a selection then, and nudging a stat by accident mid-selection helps nobody. */}
        {anyTrack ? (
          <View pointerEvents={selecting ? 'none' : 'auto'} style={{ flexDirection: 'row', alignItems: 'center', gap: 18, flexWrap: 'wrap', paddingLeft: 48 }}>
            {c.show.hp ? <StatPulse kind="hp" value={c.hp ?? 0} max={c.maxHp ?? 0} onApply={(d) => onApply('hp', d)} onRequestSet={() => onRequestSet('hp')} /> : null}
            {c.show.stress ? <StatPulse kind="stress" value={c.stress ?? 0} max={c.maxStress ?? 0} onApply={(d) => onApply('stress', d)} onRequestSet={() => onRequestSet('stress')} /> : null}
            {c.show.thresholds ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <StatGlyph kind="threshold" color={DmRune.accentDim} size={16} />
                <Text style={{ color: DmRune.accent, fontSize: DmType.title, fontFamily: Display.black }}>{c.thresholds?.major ?? 0}/{c.thresholds?.severe ?? 0}</Text>
              </View>
            ) : null}
            {c.difficulty ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <StatGlyph kind="difficulty" color={DmRune.accentDim} size={16} />
                <Text style={{ color: DmRune.accent, fontSize: DmType.title, fontFamily: Display.black }}>{c.difficulty}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {c.show.description && c.description && !open ? (
          <Text style={{ color: DmRune.muted, fontSize: DmType.body, fontFamily: Body.regular, lineHeight: 17 }}>{c.description}</Text>
        ) : null}

        {open ? (
          <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
            <StatBlockDetail c={c} onCounter={onCounter} />
          </Animated.View>
        ) : null}
      </ChamferBox>
    </Animated.View>
  );
}

/**
 * A CHARACTERIZED entry in an encounter (v0.36, owner).
 *
 * It is a character, so it is drawn by the same panel a party member is: real hit points, stress,
 * hope and armor, the DM's modifier and card tools, the same expand. What it is NOT is a party
 * member, so its vitals are passed in from the encounter rather than resolved through the party, and
 * `foe` outlines it red when it is fighting AGAINST the party rather than alongside it.
 *
 * A wrapper rather than a copy: the day the member panel gains a stat, this gains it too.
 */
export function CharacterCombatant(props: {
  file: CharacterFile;
  vitals: MemberVitals;
  dimmed?: boolean;
  foe?: boolean;
  selected?: boolean;
  onApply: (key: VitalKey, delta: number) => void;
  onRequestSet: (key: VitalKey) => void;
  onLongPress?: () => void;
  selecting?: boolean;
  onModifiers?: (edit: boolean) => void;
  onCards?: () => void;
}) {
  return <MemberPanel {...props} editable />;
}
