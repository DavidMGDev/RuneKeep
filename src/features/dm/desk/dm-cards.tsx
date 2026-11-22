/**
 * The DM screen's cards (v0.49.0): an adversary, a party member, an encounter and a saved template, each drawn at a
 * card's own 230 by 322 so the table treats it as it treats any other card. A long stat block gets pages, turned
 * with a click on the felt or in the large view, as a paged card always has been.
 */
import { Text, View } from 'react-native';

import { Portrait } from '@/components/portrait';
import { classColor } from '@/constants/identity';
import { Body, Display, DmRune, Rune } from '@/constants/theme';
import type { CardItem } from '@/features/character-sheet/card-data';
import { FORGED_H, FORGED_W } from '@/features/create/components/forged-card';
import { type CharacterFile, classLabel } from '@/lib/character-file';
import { counterMode } from '@/lib/dm-counters';
import { initialVitals, memberMaxes, memberSummary } from '@/lib/dm-vitals';
import { fitText } from '@/lib/fit-text';
import { bonusMaxes, type Combatant, type Encounter, memberBonus, memberVitals } from '@/lib/session';
import { isPresent, type MemberMaxes, type MemberVitals, type Party } from '@/lib/party';

// A live card still has to name a picture for the thumbnail code; this one is never shown.
const STAND_IN = require('../../../../assets/images/icon.png') as number;

const HEAD_H = 76, STATS_H = 44, PAD = 13;
/** How much writing one page carries at a size that still reads. */
const PAGE_CHARS = 720;

type Stat = [label: string, value: string];

interface Face {
  kind: string;
  title: string;
  band: string;
  portrait?: string | null;
  stats: Stat[];
  sections: { name?: string; text: string }[];
  /** Greyed, with this written across its head. */
  state?: string;
}

function CardBody({ face, page, pages }: { face: Face; page: number; pages: Face['sections'][] }) {
  const first = page === 0;
  const stats = first ? face.stats : [];
  const bodyH = FORGED_H - HEAD_H - (stats.length ? STATS_H : 0) - 20 - 18;
  const sections = pages[page] ?? [];
  const all = sections.map((s) => (s.name ? `${s.name}: ${s.text}` : s.text)).join('\n');
  // The gaps between sections come out of the room the words are fitted into.
  const fit = fitText(all, { width: FORGED_W - PAD * 2, height: bodyH - sections.length * 5, base: 11.5, lineRatio: 1.3, min: 5.5 });
  const title = fitText(face.title.toUpperCase(), { width: FORGED_W - PAD * 2 - (face.portrait ? 68 : 0), height: 44, base: 18, lineRatio: 1.12, min: 9 });
  return (
    <View style={{ width: FORGED_W, height: FORGED_H, backgroundColor: Rune.sheet, overflow: 'hidden' }} pointerEvents="none">
      <View style={{ height: HEAD_H, backgroundColor: DmRune.ink, borderBottomWidth: 5, borderBottomColor: face.band, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: PAD }}>
        {face.portrait ? <Portrait uri={face.portrait} size={58} chamfer={9} tint={face.band} fill={DmRune.panel} /> : null}
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Text numberOfLines={1} style={{ color: Rune.goldText, fontSize: 8.5, fontFamily: Body.bold, letterSpacing: 1.1, textTransform: 'uppercase' }}>
            {face.state ? `${face.state}, ` : ''}{face.kind}
          </Text>
          <Text style={{ color: face.state ? Rune.muted : Rune.ivory, fontSize: title.fontSize, lineHeight: title.lineHeight, fontFamily: Display.black, textTransform: 'uppercase' }}>{face.title}</Text>
        </View>
      </View>
      {stats.length ? (
        <View style={{ height: STATS_H, flexDirection: 'row', alignItems: 'center', backgroundColor: Rune.parchment }}>
          {stats.map(([label, value]) => (
            <View key={label} style={{ flex: 1, alignItems: 'center', gap: 1 }}>
              <Text numberOfLines={1} style={{ color: Rune.inkText, fontSize: value.length > 5 ? 12 : 15, fontFamily: Display.black }}>{value}</Text>
              <Text numberOfLines={1} style={{ color: Rune.inkMuted, fontSize: 6.8, fontFamily: Body.bold, letterSpacing: 0.5, textTransform: 'uppercase' }}>{label}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={{ height: bodyH + 20, paddingHorizontal: PAD, paddingTop: 10, gap: 5, overflow: 'hidden', opacity: face.state ? 0.6 : 1 }}>
        {sections.map((s, i) => (
          <Text key={i} style={{ color: Rune.inkText, fontSize: fit.fontSize, lineHeight: fit.lineHeight, fontFamily: Body.regular }}>
            {s.name ? <Text style={{ fontFamily: Body.bold }}>{s.name}: </Text> : null}
            {s.text}
          </Text>
        ))}
      </View>
      {pages.length > 1 ? (
        <Text style={{ position: 'absolute', right: PAD, bottom: 5, color: Rune.inkMuted, fontSize: 8, fontFamily: Body.bold }}>{page + 1} / {pages.length}</Text>
      ) : null}
    </View>
  );
}

function pagesOf(sections: Face['sections']): Face['sections'][] {
  const pages: Face['sections'][] = [[]];
  let used = 0;
  for (const s of sections) {
    const n = (s.name?.length ?? 0) + s.text.length;
    if (used && used + n > PAGE_CHARS) {
      pages.push([]);
      used = 0;
    }
    pages[pages.length - 1].push(s);
    used += n;
  }
  return pages;
}

function cardOf(id: string, face: Face): CardItem {
  const pages = pagesOf(face.sections);
  const base = { id, source: STAND_IN, thumb: STAND_IN };
  if (pages.length === 1) return { ...base, live: <CardBody face={face} page={0} pages={pages} /> };
  return { ...base, faces: pages.map((_, i) => ({ custom: <CardBody face={face} page={i} pages={pages} /> })) };
}

// A combatant keeps one id whichever side it is on, so moving it across keeps its tokens, its mark and its place.
export const combatantCardId = (cid: string) => `cb-${cid}`;
export const memberCardId = (charId: string) => `pc-${charId}`;
export const encounterCardId = (id: string) => `enc-${id}`;
export const templateCardId = (id: string) => `saved-${id}`;

function vitalStats(v: MemberVitals, m: MemberMaxes): Stat[] {
  return [['Hit points', `${v.hp}/${m.maxHp}`], ['Armor', `${v.armor}/${m.armorMax}`], ['Stress', `${v.stress}/${m.stressMax}`], ['Hope', `${v.hope}/${m.hopeMax}`]];
}

function characterFace(file: CharacterFile, kind: string, band: string, vitals: MemberVitals, maxes: MemberMaxes, state?: string): Face {
  const s = memberSummary(file);
  const traits = Object.entries(s.traits).map(([k, n]) => `${k[0].toUpperCase()}${k.slice(1)} ${n >= 0 ? `+${n}` : n}`).join(', ');
  return {
    kind, title: file.name, band, portrait: file.portraitUri,
    stats: vitalStats(vitals, maxes),
    state: vitals.hp <= 0 ? 'Down' : state,
    sections: [
      { text: `Level ${file.level} ${classLabel(file)}${s.subclass ? `, ${s.subclass}` : ''}` },
      { name: 'Evasion', text: String(s.evasion) },
      { name: 'Thresholds', text: `Major ${s.thresholds.major}, Severe ${s.thresholds.severe}` },
      { name: 'Proficiency', text: String(s.proficiency) },
      { name: 'Traits', text: traits },
    ],
  };
}

export function memberCard(file: CharacterFile, party: Party, enc: Encounter | null): CardItem {
  // Outside a running fight it is the party's live vitals that change, so those are the ones shown.
  const inFight = enc?.status === 'active' && enc.allies.some((a) => a.kind === 'member' && a.charId === file.id);
  const vitals = (inFight && enc ? memberVitals(enc, party, file.id) : party.global[file.id]) ?? initialVitals(file);
  const maxes = inFight && enc ? bonusMaxes(memberMaxes(file), memberBonus(enc, party, file.id)) : memberMaxes(file);
  return cardOf(memberCardId(file.id), characterFace(file, 'Party', classColor(file.className).bright, vitals, maxes, isPresent(party, file.id) ? undefined : 'Away'));
}

function statBlock(c: Combatant, kind: string, band: string): Face {
  const counters = c.counters ?? [];
  const tracked = counters.map((x) => ({ name: `${x.name} ${x.value}/${x.start}`, text: x.text }));
  const face: Face = { kind, title: c.name, band, portrait: c.portraitUri, stats: [], sections: tracked, state: c.fallen ? 'Fallen' : undefined };
  // An entry its counters have taken over is only those counters, as it is in the encounter's list.
  if (counterMode(c.counters) !== 'none') return c.description?.trim() ? { ...face, sections: [{ text: c.description.trim() }, ...tracked] } : face;

  if (c.difficulty !== undefined) face.stats.push(['Difficulty', String(c.difficulty)]);
  if (c.maxHp) face.stats.push(['Hit points', `${c.hp ?? 0}/${c.maxHp}`]);
  if (c.maxStress) face.stats.push(['Stress', `${c.stress ?? 0}/${c.maxStress}`]);
  if (c.thresholds && (c.thresholds.major || c.thresholds.severe)) face.stats.push(['Thresholds', `${c.thresholds.major}/${c.thresholds.severe}`]);

  const out: Face['sections'] = [];
  if (c.attack?.name) out.push({ name: c.attack.name, text: [c.atkMod, c.attack.range, c.attack.damage].filter(Boolean).join(', ') });
  if (c.motives) out.push({ name: 'Motives', text: c.motives });
  if (c.experience) out.push({ name: 'Experience', text: c.experience });
  if (c.hordeNote) out.push({ name: 'Horde', text: c.hordeNote });
  out.push(...tracked);
  for (const f of c.features ?? []) out.push({ name: `${f.name} (${f.kind})`, text: f.text });
  if (c.description?.trim()) out.push({ text: c.description.trim() });
  return { ...face, sections: out };
}

export function combatantCard(c: Combatant, side: 'ally' | 'adversary', files: Record<string, CharacterFile>, enc: Encounter): CardItem {
  const band = side === 'ally' ? DmRune.ally : DmRune.red;
  const file = c.charId ? files[c.charId] : undefined;
  if (file) {
    return cardOf(combatantCardId(c.id), characterFace(file, side === 'ally' ? 'Ally' : 'Adversary', band, enc.charVitals?.[file.id] ?? initialVitals(file), memberMaxes(file), c.fallen ? 'Fallen' : undefined));
  }
  const block = [c.tier ? `Tier ${c.tier}` : null, c.role ?? null].filter(Boolean).join(' ');
  return cardOf(combatantCardId(c.id), statBlock(c, block || (side === 'ally' ? 'Ally' : 'Adversary'), band));
}

export function templateCard(c: Combatant): CardItem {
  const block = [c.tier ? `Tier ${c.tier}` : null, c.role ?? null].filter(Boolean).join(' ');
  return cardOf(templateCardId(c.id), statBlock(c, block || 'Saved', Rune.gold));
}

const STATUS: Record<Encounter['status'], string> = { prepared: 'Prepared', active: 'Running', completed: 'Finished' };

export function encounterCard(e: Encounter): CardItem {
  const names = new Map<string, number>();
  for (const c of e.adversaries) names.set(c.name, (names.get(c.name) ?? 0) + 1);
  const roll = [...names].map(([name, n]) => (n > 1 ? `${n} ${name}` : name)).join(', ');
  const up = e.adversaries.filter((c) => !c.fallen).length;
  const sections: Face['sections'] = [];
  if (e.description?.trim()) sections.push({ text: e.description.trim() });
  sections.push({ name: 'Adversaries', text: roll || 'None yet' });
  return cardOf(encounterCardId(e.id), {
    kind: STATUS[e.status], title: e.name, band: e.color ?? DmRune.line, portrait: e.imageUri,
    stats: [['Adversaries', String(e.adversaries.length)], ['Standing', String(up)], ['Allies', String(e.allies.length)]],
    sections,
  });
}
