import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Line, Path, Polygon, Polyline, Rect } from 'react-native-svg';

import { CardEditor } from '@/components/card-editor';
import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { useScreenInsets } from '@/components/app-screen';
import { Body, Display, Rune } from '@/constants/theme';
import { advOption, advRemaining, applyLevelUp, availableAdvancements, type ChosenAdv, isTierStart, type LevelDefaults, type LevelUpPlan, MAX_LEVEL, picksUsed, tierForLevel } from '@/lib/leveling';
import type { CharacterFile } from '@/lib/character-file';
import { type CompanionState, COMPANION_OPTIONS, companionOptionDef } from '@/lib/companion';
import { playSfx } from '@/lib/sfx';
import { StraightCarousel, type StraightCarouselHandle, type StraightItem } from '@/features/create/components/straight-carousel';
import { ForgedCard } from '@/features/create/components/forged-card';

import { TRAIT_ORDER } from '../character';
import type { DomainCardInfo } from './domain-card-info';

type StepKey = 'summary' | 'domain' | 'exp' | 'advance' | 'companion';

/** Step icons — the creation-screen visual language (icon tabs that reveal the next part, #233 item 4). */
function StepGlyph({ step, color }: { step: StepKey; color: string }) {
  const s = { fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  switch (step) {
    case 'summary':
      return (
        <Svg width={20} height={20} viewBox="0 0 22 22">
          <Polyline points="4,11 11,4 18,11" {...s} />
          <Polyline points="4,17 11,10 18,17" {...s} />
        </Svg>
      );
    case 'domain':
      return (
        <Svg width={20} height={20} viewBox="0 0 22 22">
          <Rect x={3} y={4} width={10} height={14} {...s} />
          <Rect x={9} y={2} width={10} height={14} transform="rotate(8 14 9)" {...s} />
        </Svg>
      );
    case 'exp':
      return (
        <Svg width={20} height={20} viewBox="0 0 22 22">
          <Path d="M 4 18 Q 6 10 18 3 Q 14 12 8 16 Z" {...s} />
          <Line x1={4} y1={18} x2={9} y2={13} {...s} />
        </Svg>
      );
    case 'advance':
      return (
        <Svg width={20} height={20} viewBox="0 0 22 22">
          <Polygon points="11,2 13.4,8 19.5,8 14.5,12 16.5,18 11,14.5 5.5,18 7.5,12 2.5,8 8.6,8" {...s} />
        </Svg>
      );
    case 'companion':
      // a paw print (the Beastbound companion #311)
      return (
        <Svg width={20} height={20} viewBox="0 0 22 22">
          <Path d="M 11 19 C 7 19 6 15.5 8 13.5 C 9.4 12 12.6 12 14 13.5 C 16 15.5 15 19 11 19 Z" fill={color} stroke="none" />
          <Polygon points="6,9 7.6,9 6.8,11.4" fill={color} />
          <Polygon points="9.2,6.5 10.8,6.5 10,9" fill={color} />
          <Polygon points="11.2,6.5 12.8,6.5 12,9" fill={color} />
          <Polygon points="14.4,9 16,9 15.2,11.4" fill={color} />
        </Svg>
      );
  }
}

function StepTab({ step, label, active, done, onPress }: { step: StepKey; label: string; active: boolean; done: boolean; onPress: () => void }) {
  const color = active ? Rune.goldBright : done ? Rune.goldText : Rune.muted;
  return (
    <Pressable onPress={onPress} style={{ flex: 1 }} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={`${label}${done ? ', done' : ''}`}>
      <ChamferBox chamfer={7} fill={active ? 'rgba(224,181,99,0.12)' : 'transparent'} stroke={active ? Rune.goldBright : done ? 'rgba(218,162,73,0.55)' : 'rgba(147,142,136,0.3)'} strokeWidth={active ? 1.6 : 1.1} style={{ alignItems: 'center', paddingVertical: 8, gap: 3, overflow: 'hidden' }}>
        <View>
          <StepGlyph step={step} color={color} />
          {done ? (
            <Svg width={11} height={11} viewBox="0 0 11 11" style={{ position: 'absolute', right: -8, top: -4 }}>
              <Polygon points="5.5,0 11,5.5 5.5,11 0,5.5" fill={Rune.gold} />
              <Polyline points="3,5.5 5,7.5 8.2,3.6" fill="none" stroke={Rune.ink} strokeWidth={1.5} />
            </Svg>
          ) : null}
        </View>
        <Text numberOfLines={1} style={{ color, fontSize: 8, fontFamily: Body.bold, letterSpacing: 0.3, textTransform: 'uppercase' }}>{label}</Text>
      </ChamferBox>
    </Pressable>
  );
}

/** Small selectable chip. */
function Chip({ label, on, disabled, onPress }: { label: string; on: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={disabled ? undefined : onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ selected: on, disabled }}>
      <ChamferBox chamfer={6} fill={on ? Rune.red : 'rgba(20,24,31,0.7)'} stroke={on ? 'transparent' : 'rgba(218,162,73,0.4)'} strokeWidth={1} style={{ paddingHorizontal: 11, paddingVertical: 7, opacity: disabled ? 0.4 : 1 }}>
        <Text style={{ color: on ? Rune.ivory : Rune.muted, fontSize: 11.5, fontFamily: Body.bold, letterSpacing: 0.3, textTransform: 'uppercase' }}>{label}</Text>
      </ChamferBox>
    </Pressable>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <Text style={{ color: Rune.bronze, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>{children}</Text>;
}

/**
 * Level Up (#233 item 4) — rebuilt to mirror character creation: a rail of ICON STEPS at the top
 * (Gains · Domain · Experience · Advance) that each reveal their own focused panel, instead of one
 * long scroll. The sheet's carousel is unloaded while this is open (redesigned-sheet). /impeccable.
 */
export function LevelUpPanel({
  file,
  defaults,
  domainOptions,
  classOptions,
  companion,
  companionPicks = 0,
  onApply,
  onClose,
}: {
  file: CharacterFile;
  defaults: LevelDefaults;
  domainOptions: DomainCardInfo[];
  /** #311: each multiclassable class with the domains + subclass foundation cards it offers. */
  classOptions: { key: string; label: string; domains: string[]; subclasses: { id: string; label: string }[] }[];
  /** #311: the Beastbound companion (for the companion level-up step), and how many training options
   *  this level-up grants (0 = no companion / no step). */
  companion?: CompanionState;
  companionPicks?: number;
  onApply: (next: CharacterFile) => void;
  onClose: () => void;
}) {
  const insets = useScreenInsets();
  const newLevel = file.level + 1;
  const tier = tierForLevel(newLevel);
  const tierStart = isTierStart(newLevel);
  const exps = file.experiences ?? [];
  // Tier starts clear all trait marks (applyLevelUp does this on commit) — the dialog must offer
  // the cleared state, or the level-5/8 trait increases are unpickable (v0.13.0 item 9).
  const marked = tierStart ? [] : (file.traitMarks ?? []);

  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [centerIdx, setCenterIdx] = useState(0);
  const [expTitle, setExpTitle] = useState('');
  // The new Experience's authored art + body (#239 item 5): kept so Confirm persists what was set.
  const [expColor, setExpColor] = useState<string | null>(null);
  const [expImage, setExpImage] = useState<string | null>(null);
  const [expText, setExpText] = useState('');
  const [editingExp, setEditingExp] = useState(false);
  const [takes, setTakes] = useState<ChosenAdv[]>([]);
  // #311: companion training options chosen this level-up (a multiset of option keys, max = companionPicks).
  const [companionTakes, setCompanionTakes] = useState<string[]>([]);
  const hasCompanionStep = companionPicks > 0;
  const compCountOf = (key: string) => companionTakes.filter((k) => k === key).length;
  const compRemaining = (key: string) => { const def = companionOptionDef(key); if (!def) return 0; return def.max - (companion?.options[key] ?? 0) - compCountOf(key); };
  const addCompanion = (key: string) => { if (companionTakes.length >= companionPicks || compRemaining(key) <= 0) return; playSfx('cardSelect'); setCompanionTakes((t) => [...t, key]); };
  const removeCompanion = (key: string) => setCompanionTakes((t) => { const i = t.lastIndexOf(key); if (i < 0) return t; playSfx('cardDeselect'); return t.filter((_, j) => j !== i); });
  const companionDone = companionTakes.length === companionPicks;
  const carRef = useRef<StraightCarouselHandle>(null);

  // The new tier Experience the player is writing now (#211): predict the id applyLevelUp will give
  // it so the '+1 to two Experiences' advancement can target it, and count it toward availability.
  const pendingExp = tierStart && expTitle.trim() ? { id: `exp-lvl${newLevel}-${exps.length}`, title: expTitle.trim() } : null;
  const expChoices = pendingExp ? [...exps, pendingExp] : exps;
  const expReady = !tierStart || !!expTitle.trim();

  const hasDomainAdv = takes.some((t) => t.key === 'domain');
  const maxDomains = 1 + (hasDomainAdv ? 1 : 0);
  // v0.14.0: MEMOIZED. An unstable `items` identity rebuilt the carousel's pan gesture on every detent
  // (each detent re-renders this panel), which reconfigures a LIVE native handler and is what cancelled
  // drags mid-flight — the trigger for the stale-centered-card bug. Creation memoizes this too.
  const items: StraightItem[] = useMemo(
    () => domainOptions.map((d) => ({ id: d.id, thumb: d.thumb, source: d.source, label: d.title })),
    [domainOptions],
  );
  // The mirror is fine for LABELLING the button (it repaints on the next render anyway)...
  const centerId = domainOptions[Math.min(centerIdx, domainOptions.length - 1)]?.id;
  const centeredSelected = !!centerId && selectedDomains.includes(centerId);
  const toggleDomain = () => {
    // ...but COMMITTING reads the deck's live position, never the mirror — the mirror is suppressed
    // while the gear grinds and lags React by a frame, so it could name a card that is no longer
    // centered (the "level up gave me a different domain card" bug).
    const live = carRef.current?.centerIndex();
    const id = (live != null ? domainOptions[Math.min(live, domainOptions.length - 1)]?.id : undefined) ?? centerId;
    if (!id) return;
    setSelectedDomains((cur) => {
      if (cur.includes(id)) { playSfx('cardDeselect'); return cur.filter((x) => x !== id); }
      if (cur.length < maxDomains) { playSfx('cardSelect'); return [...cur, id]; }
      if (maxDomains === 1) { playSfx('cardSelect'); return [id]; }
      return cur;
    });
  };

  const picks = picksUsed(takes);
  const remainingPicks = 2 - picks;
  const takesOfKey = (k: string) => takes.filter((t) => t.key === k).length;
  const canAdd = (key: ReturnType<typeof advOption>['key']) => {
    const opt = advOption(key);
    if (opt.needs === 'exps' && expChoices.length < 2) return false;
    if (remainingPicks < opt.picks) return false;
    // v0.10.2: evaluate slots against the NEW level's tier so a tier-crossing level-up sees the reset.
    return advRemaining(file, key, tier) - takesOfKey(key) * opt.picks >= opt.picks;
  };
  const addTake = (key: ChosenAdv['key']) => { playSfx('cardSelect'); setTakes((t) => [...t, { key, traits: [], expIds: [] }]); };
  const removeTake = (i: number) => {
    playSfx('cardDeselect');
    setTakes((t) => {
      const nt = t.filter((_, j) => j !== i);
      if (!nt.some((x) => x.key === 'domain')) setSelectedDomains((d) => d.slice(0, 1));
      return nt;
    });
  };
  const toggleIn = (i: number, field: 'traits' | 'expIds', val: string, max: number) =>
    setTakes((t) =>
      t.map((x, j) => {
        if (j !== i) return x;
        const cur = (x[field] ?? []) as string[];
        const has = cur.includes(val);
        const nx = has ? cur.filter((v) => v !== val) : cur.length < max ? [...cur, val] : cur;
        return { ...x, [field]: nx };
      }),
    );
  const setField = (i: number, patch: Partial<ChosenAdv>) => setTakes((t) => t.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const takeComplete = (t: ChosenAdv) => {
    const needs = advOption(t.key).needs;
    if (needs === 'traits') return (t.traits ?? []).length === 2;
    if (needs === 'exps') return (t.expIds ?? []).length === 2;
    if (needs === 'domain') return selectedDomains.length === 2;
    // #311: multiclass needs a class + a subclass foundation card, and a domain from that class unless
    // the class offers no domain the character lacks (can't happen with real data, but don't soft-lock).
    if (needs === 'multiclass') {
      if (!t.multiclass || !t.multiclassSubclassCardId) return false;
      const co = classOptions.find((c) => c.key === t.multiclass);
      return co && co.domains.length > 0 ? !!t.multiclassDomain : true;
    }
    return true;
  };

  const domainDone = selectedDomains.length >= 1 && (!hasDomainAdv || selectedDomains.length === 2);
  const advanceDone = picks === 2 && takes.every(takeComplete);
  const stepDone = (k: StepKey) => (k === 'summary' ? true : k === 'domain' ? domainDone : k === 'exp' ? expReady : k === 'companion' ? companionDone : advanceDone);

  const steps: { key: StepKey; label: string }[] = [
    { key: 'summary', label: 'Gains' },
    { key: 'domain', label: 'Domain' },
    ...(tierStart ? [{ key: 'exp' as StepKey, label: 'Exp' }] : []),
    { key: 'advance', label: 'Advance' },
    ...(hasCompanionStep ? [{ key: 'companion' as StepKey, label: 'Companion' }] : []),
  ];
  const [step, setStep] = useState<StepKey>('summary');

  const canConfirm = domainDone && expReady && advanceDone && (!hasCompanionStep || companionDone);
  // v0.10.4: the FIRST unmet requirement — so a not-yet-ready "Confirm level" tap jumps to that step and
  // a hint says exactly what's left, instead of a silent, unexplained disabled button (owner: "the Confirm
  // Level button always remains unable to be pressed — I can't level up any character").
  const missing: { step: StepKey; text: string } | null = !domainDone
    ? { step: 'domain', text: 'Choose your new domain card' }
    : tierStart && !expReady
      ? { step: 'exp', text: 'Write your new Experience' }
      : !advanceDone
        ? { step: 'advance', text: `Choose 2 advancements — ${picks}/2 chosen` }
        : hasCompanionStep && !companionDone
          ? { step: 'companion', text: 'Choose your companion training' }
          : null;
  const confirm = () => {
    playSfx('levelUpComplete'); // #255
    const advs = takes.map((t) => (t.key === 'domain' ? { ...t, domainCardId: selectedDomains[1] } : t));
    const plan: LevelUpPlan = {
      domainCardId: selectedDomains[0],
      experienceTitle: tierStart ? expTitle.trim() : undefined,
      experienceColor: tierStart ? expColor : undefined,
      experienceImageUri: tierStart ? expImage : undefined,
      experienceText: tierStart ? expText : undefined,
      advancements: advs,
      companionOptions: hasCompanionStep ? companionTakes : undefined,
    };
    onApply(applyLevelUp(file, plan, defaults));
  };

  const addable = availableAdvancements(file, newLevel).filter((o) => canAdd(o.key));

  // entrance + per-step fade (#201/#233)
  const reduced = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = reduced ? 1 : withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
  }, [p, reduced]);
  useEffect(() => {
    playSfx('panelOpen'); // #255: opened from the float menu
  }, []);
  const panelStyle = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * 16 }] }));
  // Fade the full-screen backdrop in (#239 item 9): it used to POP opaque on the first frame.
  const bgStyle = useAnimatedStyle(() => ({ opacity: p.value }));
  const cfade = useSharedValue(1);
  useEffect(() => {
    if (reduced) return;
    cfade.value = 0;
    cfade.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
  }, [step, cfade, reduced]);
  const contentStyle = useAnimatedStyle(() => ({ opacity: cfade.value }));

  // v0.10.5: level 10 is the cap — never advance past it. (The float-menu entry stays; this is the
  // explanation if it's opened at max level.)
  if (file.level >= MAX_LEVEL) {
    return (
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000, alignItems: 'center', justifyContent: 'center' }}>
        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(8,10,15,0.98)' }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <ChamferBox chamfer={16} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} style={{ width: 320, paddingHorizontal: 20, paddingVertical: 22, gap: 14, alignItems: 'center' }}>
          <Text style={{ color: Rune.goldText, fontSize: 20, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.5 }}>Max level</Text>
          <Text style={{ color: Rune.muted, fontSize: 13, fontFamily: Body.regular, lineHeight: 19, textAlign: 'center' }}>This hero is level {MAX_LEVEL} — the highest level in Daggerheart. There&apos;s nothing left to advance.</Text>
          <RuneButton label="Close" kind="primary" height={44} style={{ alignSelf: 'stretch' }} onPress={onClose} />
        </ChamferBox>
      </View>
    );
  }

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000 }}>
      {/* opaque catching backdrop (#258): NO pointerEvents="none" — it must absorb every tap so nothing
          ever falls through to the character sheet / carousel underneath. Button-only close. */}
      <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(8,10,15,0.98)' }, bgStyle]} />
      <Animated.View style={[{ flex: 1, marginTop: insets.top + 6, marginBottom: insets.bottom + 6, paddingHorizontal: 8 }, panelStyle]}>
       {/* creation-style bordered panel (#242 item 6) — the level-up UI lives inside it */}
       <ChamferBox chamfer={18} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} style={{ flex: 1, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12 }}>
        {/* header */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: Rune.goldText, fontSize: 22, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.5 }}>Level Up</Text>
            <Text style={{ color: Rune.muted, fontSize: 12, fontFamily: Body.medium }}>{`Level ${file.level} → ${newLevel} · Tier ${tier}`}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close" style={{ padding: 4 }}>
            <Text style={{ color: Rune.muted, fontSize: 18, fontFamily: Body.bold }}>✕</Text>
          </Pressable>
        </View>

        {/* step rail — the icon tabs that reveal each part (creation-style) */}
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {steps.map((s) => (
            <StepTab key={s.key} step={s.key} label={s.label} active={step === s.key} done={stepDone(s.key)} onPress={() => setStep(s.key)} />
          ))}
        </View>

        {/* step content */}
        <Animated.View style={[{ flex: 1, marginTop: 12 }, contentStyle]}>
          {step === 'summary' ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              <SectionLabel>This level brings</SectionLabel>
              <ChamferBox chamfer={9} fill="rgba(20,24,31,0.55)" stroke="rgba(218,162,73,0.4)" strokeWidth={1.1} style={{ paddingVertical: 12, paddingHorizontal: 14, gap: 3 }}>
                {[`Level ${newLevel}`, '+1 to both damage thresholds', 'A new domain card', ...(tierStart ? ['A new Experience (+2)', '+1 Proficiency', ...(newLevel === 5 || newLevel === 8 ? ['Clear all trait marks'] : [])] : [])].map((line) => (
                  <Text key={line} style={{ color: Rune.sheet, fontSize: 13, fontFamily: Body.regular }}>{`·  ${line}`}</Text>
                ))}
              </ChamferBox>
              <Text style={{ color: Rune.muted, fontSize: 12, fontFamily: Body.regular, lineHeight: 18 }}>Then choose your new domain card{tierStart ? ', write a new Experience,' : ''} and two advancements using the steps above.</Text>
              <RuneButton label="Choose domain card →" kind="primary" dense height={40} onPress={() => setStep('domain')} />
            </ScrollView>
          ) : null}

          {step === 'domain' ? (
            <View style={{ flex: 1 }}>
              <SectionLabel>{`New domain card · ${selectedDomains.length}/${maxDomains}`}</SectionLabel>
              <View style={{ flex: 1, minHeight: 230, marginTop: 4 }}>
                {items.length === 0 ? (
                  <Text style={{ color: Rune.muted, fontSize: 12, fontFamily: Body.regular, marginTop: 8 }}>No new domain cards available at this level.</Text>
                ) : (
                  <StraightCarousel ref={carRef} items={items} selectedIds={selectedDomains} onIndexChange={setCenterIdx} />
                )}
              </View>
              {items.length > 0 ? (
                <RuneButton label={centeredSelected ? 'Selected ✓ — tap to remove' : 'Choose this card'} kind={centeredSelected ? 'secondary' : 'primary'} dense height={42} onPress={toggleDomain} />
              ) : null}
            </View>
          ) : null}

          {step === 'exp' ? (
            <View style={{ flex: 1, alignItems: 'center' }}>
              <SectionLabel>New Experience (+2)</SectionLabel>
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Pressable onPress={() => setEditingExp(true)} accessibilityRole="button" accessibilityLabel="Write your new experience" style={{ width: 230 * 0.74, height: 322 * 0.74 }}>
                  {expTitle.trim() ? (
                    <View style={{ transform: [{ scale: 0.74 }], width: 230, height: 322, marginLeft: (230 * (0.74 - 1)) / 2, marginTop: (322 * (0.74 - 1)) / 2 }}>
                      <ForgedCard title={expTitle.trim()} kindLabel="Experience" body="" accentDeep={Rune.panel} imageUri={expImage} colorArt={expColor} experience modifier={2} />
                    </View>
                  ) : (
                    <ChamferBox chamfer={12} fill="rgba(14,17,22,0.9)" stroke="rgba(218,162,73,0.5)" strokeWidth={1.3} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                      <Svg width={30} height={30} viewBox="0 0 30 30">
                        <Line x1={15} y1={5} x2={15} y2={25} stroke={Rune.goldEdge} strokeWidth={2.4} />
                        <Line x1={5} y1={15} x2={25} y2={15} stroke={Rune.goldEdge} strokeWidth={2.4} />
                      </Svg>
                      <Text style={{ color: Rune.muted, fontSize: 10, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>Write it</Text>
                    </ChamferBox>
                  )}
                </Pressable>
              </View>
              {expTitle.trim() ? <RuneButton label="Edit experience" kind="ghost" dense height={38} onPress={() => setEditingExp(true)} /> : null}
            </View>
          ) : null}

          {step === 'advance' ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 9, paddingBottom: 6 }} keyboardShouldPersistTaps="handled">
              <SectionLabel>{`Choose 2 advancements · ${picks}/2`}</SectionLabel>
              {!expReady ? (
                <ChamferBox chamfer={8} fill="rgba(20,24,31,0.6)" stroke="rgba(218,162,73,0.45)" strokeWidth={1.2} style={{ paddingVertical: 11, paddingHorizontal: 12, gap: 8 }}>
                  <Text style={{ color: Rune.muted, fontSize: 12, fontFamily: Body.regular, lineHeight: 17 }}>Write your new Experience first — then you can boost the one you just made.</Text>
                  <RuneButton label="Write Experience →" kind="primary" dense height={36} onPress={() => setStep('exp')} />
                </ChamferBox>
              ) : null}
              {takes.map((t, i) => {
                const opt = advOption(t.key);
                return (
                  <ChamferBox key={`${t.key}-${i}`} chamfer={8} fill="rgba(200,27,24,0.12)" stroke={Rune.red} strokeWidth={1.2} style={{ paddingVertical: 10, paddingHorizontal: 12, gap: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ color: Rune.sheet, fontSize: 13.5, fontFamily: Body.bold, flex: 1 }}>{opt.label}{opt.picks === 2 ? ' (×2)' : ''}</Text>
                      <Pressable onPress={() => removeTake(i)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${opt.label}`} style={{ padding: 3 }}>
                        <Text style={{ color: '#E2705A', fontSize: 16, fontFamily: Body.bold }}>✕</Text>
                      </Pressable>
                    </View>
                    {opt.needs === 'domain' ? (
                      <Pressable onPress={() => setStep('domain')} accessibilityRole="button">
                        <Text style={{ color: selectedDomains.length === 2 ? Rune.goldText : Rune.muted, fontSize: 11.5, fontFamily: Body.regular }}>{selectedDomains.length === 2 ? '2nd card chosen ✓' : 'Pick a 2nd card on the Domain step →'}</Text>
                      </Pressable>
                    ) : null}
                    {opt.needs === 'traits' ? (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {(() => {
                          // A trait can't be picked twice in one level-up: lock traits chosen in any OTHER
                          // trait take this level (in addition to traits already marked from prior levels).
                          const chosenElsewhere = new Set(takes.flatMap((x, j) => (j !== i && x.key === 'trait' ? (x.traits ?? []) : [])));
                          return TRAIT_ORDER.map((tr) => {
                            const sel = (t.traits ?? []).includes(tr.key);
                            const locked = marked.includes(tr.key) || chosenElsewhere.has(tr.key);
                            return <Chip key={tr.key} label={tr.label} on={sel} disabled={locked || (!sel && (t.traits ?? []).length >= 2)} onPress={() => toggleIn(i, 'traits', tr.key, 2)} />;
                          });
                        })()}
                      </View>
                    ) : null}
                    {opt.needs === 'exps' ? (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {expChoices.map((e) => {
                          const sel = (t.expIds ?? []).includes(e.id);
                          return <Chip key={e.id} label={e.title} on={sel} disabled={!sel && (t.expIds ?? []).length >= 2} onPress={() => toggleIn(i, 'expIds', e.id, 2)} />;
                        })}
                      </View>
                    ) : null}
                    {opt.needs === 'multiclass' ? (
                      <View style={{ gap: 8 }}>
                        <Text style={{ color: Rune.bronze, fontSize: 10, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' }}>New class</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                          {/* choosing/clearing the class resets its dependent subclass + domain picks */}
                          {classOptions.map((c) => <Chip key={c.key} label={c.label} on={t.multiclass === c.key} onPress={() => setField(i, t.multiclass === c.key ? { multiclass: undefined, multiclassSubclassCardId: undefined, multiclassDomain: undefined } : { multiclass: c.key, multiclassSubclassCardId: undefined, multiclassDomain: undefined })} />)}
                        </View>
                        {(() => {
                          const co = classOptions.find((c) => c.key === t.multiclass);
                          if (!co) return null;
                          return (
                            <>
                              <Text style={{ color: Rune.bronze, fontSize: 10, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' }}>Subclass foundation</Text>
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                {co.subclasses.map((s) => <Chip key={s.id} label={s.label} on={t.multiclassSubclassCardId === s.id} onPress={() => setField(i, { multiclassSubclassCardId: t.multiclassSubclassCardId === s.id ? undefined : s.id })} />)}
                              </View>
                              <Text style={{ color: Rune.bronze, fontSize: 10, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' }}>New domain (half level onward)</Text>
                              {co.domains.length ? (
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                  {co.domains.map((d) => <Chip key={d} label={d.charAt(0).toUpperCase() + d.slice(1)} on={t.multiclassDomain === d} onPress={() => setField(i, { multiclassDomain: t.multiclassDomain === d ? undefined : d })} />)}
                                </View>
                              ) : (
                                <Text style={{ color: Rune.muted, fontSize: 11, fontFamily: Body.regular }}>This class shares both your domains — no new domain to add.</Text>
                              )}
                            </>
                          );
                        })()}
                      </View>
                    ) : null}
                  </ChamferBox>
                );
              })}
              {expReady && remainingPicks > 0 ? (
                <View style={{ gap: 6 }}>
                  {addable.length === 0 ? <Text style={{ color: Rune.muted, fontSize: 11.5, fontFamily: Body.regular }}>No more advancements available.</Text> : null}
                  {addable.map((o) => (
                    <Pressable key={o.key} onPress={() => addTake(o.key)} accessibilityRole="button" accessibilityLabel={o.label}>
                      <ChamferBox chamfer={8} fill="rgba(20,24,31,0.6)" stroke="rgba(218,162,73,0.45)" strokeWidth={1.2} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: Rune.sheet, fontSize: 13.5, fontFamily: Body.bold }}>{o.label}{o.picks === 2 ? ' (uses both)' : ''}</Text>
                          <Text style={{ color: Rune.muted, fontSize: 10.5, fontFamily: Body.regular, marginTop: 1 }}>{o.desc}</Text>
                        </View>
                        <Text style={{ color: Rune.goldBright, fontSize: 22, fontFamily: Body.bold, marginLeft: 8 }}>+</Text>
                      </ChamferBox>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </ScrollView>
          ) : null}

          {step === 'companion' ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 9, paddingBottom: 6 }}>
              <SectionLabel>{`Companion training · ${companionTakes.length}/${companionPicks}`}</SectionLabel>
              <Text style={{ color: Rune.muted, fontSize: 11.5, fontFamily: Body.regular, lineHeight: 17 }}>Choose your Beastbound companion&apos;s level-up option{companionPicks > 1 ? 's' : ''}. Some can be taken more than once.</Text>
              {COMPANION_OPTIONS.map((o) => {
                const taken = compCountOf(o.key);
                const remaining = compRemaining(o.key);
                const canAdd = companionTakes.length < companionPicks && remaining > 0;
                return (
                  <ChamferBox key={o.key} chamfer={8} fill={taken > 0 ? 'rgba(123,160,91,0.14)' : 'rgba(20,24,31,0.6)'} stroke={taken > 0 ? '#7BA05B' : 'rgba(218,162,73,0.45)'} strokeWidth={1.2} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 12, gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: Rune.sheet, fontSize: 13, fontFamily: Body.bold }}>{o.label}{o.max > 1 ? `  ·  max ${o.max}` : ''}</Text>
                      <Text style={{ color: Rune.muted, fontSize: 10.5, fontFamily: Body.regular, marginTop: 1 }}>{o.desc}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Pressable onPress={() => removeCompanion(o.key)} disabled={taken === 0} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Remove ${o.label}`}><Text style={{ color: taken === 0 ? 'rgba(147,142,136,0.35)' : '#E2705A', fontSize: 20, fontFamily: Body.bold }}>–</Text></Pressable>
                      <Text style={{ color: Rune.goldText, fontSize: 14, fontFamily: Body.bold, minWidth: 12, textAlign: 'center' }}>{taken}</Text>
                      <Pressable onPress={() => addCompanion(o.key)} disabled={!canAdd} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Add ${o.label}`}><Text style={{ color: !canAdd ? 'rgba(147,142,136,0.35)' : Rune.goldBright, fontSize: 20, fontFamily: Body.bold }}>+</Text></Pressable>
                    </View>
                  </ChamferBox>
                );
              })}
            </ScrollView>
          ) : null}
        </Animated.View>

        {/* footer */}
        {missing ? (
          <Text style={{ color: Rune.bronze, fontSize: 11.5, fontFamily: Body.bold, textAlign: 'center', marginTop: 8, letterSpacing: 0.2 }}>{missing.text} →</Text>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
          <RuneButton label="Cancel" kind="ghost" height={44} style={{ flex: 1 }} onPress={onClose} />
          {/* Always pressable: if something's missing, jump to that step; otherwise confirm. */}
          <RuneButton label="Confirm level" kind="primary" height={44} style={{ flex: 1.6 }} onPress={() => { if (canConfirm) confirm(); else if (missing) { playSfx('buttonTap'); setStep(missing.step); } }} muteSfx />
        </View>
       </ChamferBox>
      </Animated.View>

      {editingExp ? (
        <CardEditor
          kindLabel="Experience"
          experienceMode
          scrimless
          modifier={2}
          initial={{ title: expTitle, text: expText, imageUri: expImage, color: expColor, effects: [] }}
          saveLabel="Set experience"
          onSave={(d) => {
            setExpTitle(d.title);
            setExpColor(d.color);
            setExpImage(d.imageUri);
            setExpText(d.text);
            setEditingExp(false);
          }}
          onCancel={() => setEditingExp(false)}
        />
      ) : null}
    </View>
  );
}
