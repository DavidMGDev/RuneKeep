/**
 * Authoring a CLASS, and the FUNCTIONAL ELEMENTS any card may carry (v0.42.0; rebuilt v0.42.1, owner).
 *
 * v0.42.0 made the class card a form that contained its own features, and the owner's correction is a
 * change of direction rather than of feature: "the class card is created first to have a center to
 * assign cards to... The whole idea is to not create cards from inside the class card UI, i wish to
 * create the other cards in their own merit, from subclass to items."
 *
 * So the class form asks for what genuinely belongs to the class and nothing else, its numbers, its
 * Hope feature, its voice, its two domains and its starting items, and then REPORTS what currently
 * points at it: its subclasses, its feature cards, its trackers. Every one of those is written
 * elsewhere, on its own merits, and says which class it belongs to. What is missing is listed under
 * the report in the same words the Share button uses, so an author is never guessing.
 *
 * Each section carries a line explaining what it is for, which is the owner's other note: "the
 * philosophy of class creation must be explained inside a description for each thing inside class
 * creation."
 */
import { type ReactNode, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { CardFunctionControl } from '@/components/card-function-control';
import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { ALL_DOMAINS } from '@/constants/identity';
import { CounterField, FormSection, SelectRow, TextField } from '@/components/form-controls';
import { Body, Gap, Rune } from '@/constants/theme';
import { type CardAdvance, type CardFunction, type FunctionKind, type FunctionState, functionSummary, newFunction, stateOf } from '@/lib/card-functions';
import { type ClassAttachments } from '@/lib/class-links';
import { classKeyOf, classProblems, type CustomClassSpec, EMPTY_CLASS_SPEC } from '@/lib/custom-class';
import { domainLabel } from '@/lib/domain-label';
import type { LibraryCard } from '@/lib/library';

const smallLabel = { color: Rune.bronze, fontSize: 10, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' as const };
const chipRow = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6 };
const hintStyle = { color: Rune.muted, fontSize: 9.5, fontFamily: Body.regular, lineHeight: 13 };

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={label}>
      <View style={{ paddingHorizontal: 11, paddingVertical: 7, borderRadius: 5, backgroundColor: on ? Rune.red : 'rgba(20,24,31,0.7)', borderWidth: 1, borderColor: on ? 'transparent' : 'rgba(218,162,73,0.4)' }}>
        <Text style={{ color: on ? Rune.ivory : Rune.sheet, fontSize: 12.5, fontFamily: Body.bold }}>{label}</Text>
      </View>
    </Pressable>
  );
}

function Field({ label, value, onChangeText, placeholder, multiline, numeric, maxLength }: { label: string; value: string; onChangeText: (t: string) => void; placeholder?: string; multiline?: boolean; numeric?: boolean; maxLength?: number }) {
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={smallLabel}>{label}</Text>
      <ChamferBox chamfer={6} fill="rgba(14,17,22,0.96)" stroke="rgba(218,162,73,0.5)" strokeWidth={1.2} style={{ minHeight: multiline ? 62 : 40, justifyContent: 'center', paddingHorizontal: 10, paddingVertical: multiline ? 7 : 0 }}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Rune.muted}
          multiline={multiline}
          keyboardType={numeric ? 'number-pad' : 'default'}
          maxLength={maxLength}
          accessibilityLabel={label}
          style={{ color: Rune.sheet, fontSize: multiline ? 13 : 14, fontFamily: multiline ? Body.regular : Body.semibold, padding: 0, textAlignVertical: multiline ? 'top' : 'center', minHeight: multiline ? 46 : undefined, lineHeight: multiline ? 18 : undefined }}
        />
      </ChamferBox>
    </View>
  );
}

function RemoveX({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={label}>
      <Svg width={14} height={14} viewBox="0 0 16 16"><Line x1={3} y1={3} x2={13} y2={13} stroke={Rune.red} strokeWidth={2} /><Line x1={13} y1={3} x2={3} y2={13} stroke={Rune.red} strokeWidth={2} /></Svg>
    </Pressable>
  );
}

const num = (t: string) => Math.max(0, parseInt(t.replace(/[^0-9]/g, '') || '0', 10));

/** A section of the class form: a heading, the sentence that says what it is for, and its controls. */
function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <View style={{ gap: 7, borderTopWidth: 1, borderTopColor: 'rgba(218,162,73,0.25)', paddingTop: 11 }}>
      <Text style={smallLabel}>{title}</Text>
      <Text style={hintStyle}>{hint}</Text>
      {children}
    </View>
  );
}

/** What currently points at this class, or what is missing, in one line each. */
function Attached({ label, cards, empty }: { label: string; cards: LibraryCard[]; empty: string }) {
  return (
    <View style={{ gap: 3 }}>
      <Text style={{ color: cards.length ? Rune.goldText : Rune.muted, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.5, textTransform: 'uppercase' }}>
        {label} · {cards.length}
      </Text>
      {cards.length ? (
        cards.map((c) => <Text key={c.id} numberOfLines={1} style={{ color: Rune.sheet, fontSize: 11.5, fontFamily: Body.regular }}>{'• '}{c.title || 'Untitled'}</Text>)
      ) : (
        <Text style={{ color: Rune.muted, fontSize: 10, fontFamily: Body.italic, lineHeight: 14 }}>{empty}</Text>
      )}
    </View>
  );
}

/**
 * A starting-item LIST (v0.42.3, owner).
 *
 * The chips are gone. What is left is what has been picked, each removable, and one button that opens
 * the ADD GEAR browser: the same interface the sheet uses to add a card, which draws real cards and
 * already knows about this expansion's own items and the base game's loot.
 */
function ItemList({ label, hint, ids, itemTitle, onPick, onChange }: { label: string; hint: string; ids: string[]; itemTitle: (id: string) => string; onPick: () => void; onChange: (ids: string[]) => void }) {
  return (
    <View style={{ gap: Gap.hair }}>
      <Text style={{ color: Rune.bronze, fontSize: 10, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' }}>{label}</Text>
      <Text style={hintStyle}>{hint}</Text>
      {ids.length ? (
        <View style={{ gap: 4 }}>
          {ids.map((id) => (
            <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text numberOfLines={1} style={{ flex: 1, color: Rune.sheet, fontSize: 12, fontFamily: Body.semibold }}>{itemTitle(id)}</Text>
              <RemoveX label={`Remove ${itemTitle(id)}`} onPress={() => onChange(ids.filter((x) => x !== id))} />
            </View>
          ))}
        </View>
      ) : (
        <Text style={{ color: Rune.muted, fontSize: 10, fontFamily: Body.italic }}>Nothing picked yet.</Text>
      )}
      <RuneButton label={ids.length ? '+ Pick another' : '+ Pick from the card browser'} kind="ghost" dense height={34} onPress={onPick} />
    </View>
  );
}

/** A picker over card ids, kept for anything that still wants chips. */
/**
 * v0.42.1: the base game's loot and consumables joined this list, which took it past sixty entries.
 * Everything CHOSEN is always drawn; the rest is filtered by what the author types and capped, so
 * the picker stays a picker rather than becoming a wall.
 */
const ITEM_SHOWN = 10;

function ItemPicker({ label, hint, chosen, options, onChange }: { label: string; hint: string; chosen: string[]; options: { id: string; title: string }[]; onChange: (ids: string[]) => void }) {
  const [q, setQ] = useState('');
  const toggle = (id: string) => onChange(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);
  const picked = options.filter((o) => chosen.includes(o.id));
  const rest = options.filter((o) => !chosen.includes(o.id) && (!q.trim() || o.title.toLowerCase().includes(q.trim().toLowerCase())));
  return (
    <View style={{ gap: 5 }}>
      <Text style={{ color: Rune.bronze, fontSize: 10, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' }}>{label}</Text>
      <Text style={hintStyle}>{hint}</Text>
      {options.length === 0 ? (
        <Text style={{ color: Rune.muted, fontSize: 10, fontFamily: Body.italic }}>Write an item card in this expansion first, then it appears here.</Text>
      ) : (
        <>
          {picked.length ? (
            <View style={chipRow}>
              {picked.map((o) => <Chip key={o.id} label={o.title || 'Untitled'} on onPress={() => toggle(o.id)} />)}
            </View>
          ) : null}
          <Field label="" value={q} onChangeText={setQ} placeholder="Search items" maxLength={40} />
          <View style={chipRow}>
            {rest.slice(0, ITEM_SHOWN).map((o) => <Chip key={o.id} label={o.title || 'Untitled'} on={false} onPress={() => toggle(o.id)} />)}
          </View>
          {rest.length > ITEM_SHOWN ? (
            <Text style={{ color: Rune.muted, fontSize: 10, fontFamily: Body.italic }}>{rest.length - ITEM_SHOWN} more. Type to narrow it down.</Text>
          ) : null}
        </>
      )}
    </View>
  );
}

export function ClassSpecForm({ spec, card, attachments, classChoices, itemTitle, onPickItems, onChange, onClassName }: {
  spec: CustomClassSpec | undefined;
  /** The class card being edited, so the report can be about it by name. */
  card: LibraryCard;
  /** What currently points at this class. Built by `lib/class-links`. */
  attachments: ClassAttachments;
  /** Every class this page could belong to: this expansion's own, then the built-in ones. */
  classChoices: string[];
  /**
   * Open the ADD GEAR browser to pick items for one of the three lists (v0.42.3, owner).
   *
   * "It is obvious that you should re-use the add gear interface and have it be a special way of
   * using it that allows the user to select a card in the add gear interface and have it show up
   * here." That interface already draws real cards, already has category tabs and already surfaces
   * this expansion's own records, so the picker here is a button, not another chip cloud.
   */
  onPickItems: (which: 'fixed' | 'choiceA' | 'choiceB') => void;
  /** What a picked item id is CALLED, so the list reads as cards rather than as ids. */
  itemTitle: (id: string) => string;
  onChange: (s: CustomClassSpec) => void;
  /** A page card names the class it belongs to, which lives on the CARD rather than in the spec. */
  onClassName: (name: string | undefined) => void;
}) {
  const s = spec ?? EMPTY_CLASS_SPEC;
  const set = (patch: Partial<CustomClassSpec>) => onChange({ ...s, ...patch });
  const problems = classProblems({ ...card, classSpec: s }, { features: attachments.features.length, subclasses: attachments.subclasses.length });
  const page = s.role === 'page';
  return (
    <View style={{ gap: Gap.group }}>
      {/**
        * THE FIRST QUESTION (v0.42.3, owner).
        *
        * "A class card is either a new first page (summary base) of a newly created class or it is an
        * additional page for details of an existing class. This way the user can expand upon existing
        * classes or create their own class and start expanding it from there."
        *
        * It comes before the title because it decides what everything below even is, and because an
        * author who picks the wrong one finds out four fields later.
        */}
      {/**
        * WHAT THIS CARD IS, reported rather than asked (v0.42.4, owner).
        *
        * "The 'What is This Card?' should be something that the card needs an answer to BEFORE
        * entering the card edit panel... if the user wishes to change this they must cancel the card
        * and add a new one."
        *
        * It was a chooser sitting a third of the way down a form whose every field it decided, so an
        * author found out they had picked wrong after writing the card. The question is a dialog on
        * the way in now (see the type chooser), and this is the answer, stated, with the way to change
        * it: start again. That is not a limitation dressed up as a rule; the two cards genuinely have
        * nothing in common but a title.
        */}
      <View style={{ gap: Gap.hair }}>
        <Text style={{ color: Rune.goldText, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.7, textTransform: 'uppercase' }}>
          {page ? 'Another page of a class' : 'A new class'}
        </Text>
        <Text style={hintStyle}>
          {page
            ? 'It carries its own text and nothing else: the numbers, the domains and the items belong to the class it names. To make a new class instead, cancel this card and add another.'
            : 'The first page of a new class. It carries the numbers, the domains and the starting items, and every other card points at it. To add a page to a class that already exists, cancel this card and add another.'}
        </Text>
      </View>

      {page ? (
        <>
          <SelectRow
            label="Which class it belongs to"
            hint="Your own, or one from the base game. This is how a published class gets a page of your own."
            value={classChoices.find((c) => classKeyOf(c) === classKeyOf(card.className))}
            options={classChoices.map((c) => ({ value: c, label: c }))}
            onChange={onClassName}
          />
          <Text style={hintStyle}>
            Write the page itself in the sections above. It appears among that class&apos;s cards, in the order you
            make them.
          </Text>
        </>
      ) : (
        <>
          <Text style={hintStyle}>
            A class is the CENTRE of a set of cards. Fill in what belongs to the class itself here, then write its
            subclasses, features and trackers as their own cards and point each one back at this class. They appear
            below as they arrive.
          </Text>

          <FormSection title="The numbers" hint="What a character of this class starts with, before anything else is chosen.">
            <CounterField label="Starting Evasion" value={s.startingEvasion} min={0} max={20} onChange={(startingEvasion) => set({ startingEvasion })} />
            {/* v0.42.4 (owner): "Starting hitpoints cannot be 0 for class cards." A character with no
                hit points is dead before the first scene, so the control cannot express it. */}
            <CounterField label="Starting Hit Points" value={Math.max(1, s.startingHp)} min={1} max={20} onChange={(startingHp) => set({ startingHp })} />
          </FormSection>

          {/**
            * v0.42.4 (owner): "'Its voice' is very confusing copy for the summary of the card. Fix.
            * And explain that only this first description is shown on the card and how the user can
            * add more pages to this class."
            *
            * So the heading says what it is, and the sentence under it answers the question an author
            * asks next: where does everything else go? Two answers, and which to reach for.
            */}
          <FormSection
            title="What the card says"
            hint="The introduction printed on this card, in the tone of the ones in the book. It is the ONLY text this card prints: the numbers and domains below are how the class works, not what it reads like.">
            <TextField label="Summary" value={s.summary} placeholder="What this class is, in two or three sentences." multiline maxLength={400} onChangeText={(summary) => set({ summary })} />
            <Text style={hintStyle}>
              Everything else goes on a card of its own. For more prose, an ability or the class&apos;s 3-Hope move, add another Class
              card and choose &quot;Another page of a class&quot;: it becomes the next page of this one. If the ability needs a control the
              player uses, a counter, a switch or a line to write on, make it a Feature card instead and point it at this class.
            </Text>
          </FormSection>

          <FormSection title="Domains it grants" hint="Pick two. This is how the app knows which domain cards a character of this class may take, so it cannot be typed.">
            <View style={chipRow}>
              {ALL_DOMAINS.map((d) => {
                const chosen = s.domains.includes(d);
                return (
                  <Chip
                    key={d}
                    label={domainLabel(d)}
                    on={chosen}
                    onPress={() => set({ domains: (chosen ? s.domains.filter((x) => x !== d) : [...s.domains.filter((x) => x.trim()), d]).slice(-2) })}
                  />
                );
              })}
            </View>
            <Text style={hintStyle}>
              {s.domains.filter((d) => d.trim()).length === 2 ? `Grants ${s.domains.map(domainLabel).join(' and ')}.` : 'A class grants two. Picking a third replaces the first.'}
            </Text>
          </FormSection>

          <FormSection title="Starting items" hint="One thing everyone gets, and two choices they make. Picked from the same card browser the sheet uses, so you are choosing real cards.">
            <ItemList label="Everyone receives" hint="At least one." ids={s.fixedItemIds ?? []} itemTitle={itemTitle} onPick={() => onPickItems('fixed')} onChange={(fixedItemIds) => set({ fixedItemIds })} />
            <ItemList label="First choice" hint="At least two to choose between." ids={s.choiceAItemIds ?? []} itemTitle={itemTitle} onPick={() => onPickItems('choiceA')} onChange={(choiceAItemIds) => set({ choiceAItemIds })} />
            <ItemList label="Second choice" hint="At least two to choose between." ids={s.choiceBItemIds ?? []} itemTitle={itemTitle} onPick={() => onPickItems('choiceB')} onChange={(choiceBItemIds) => set({ choiceBItemIds })} />
          </FormSection>

          <FormSection title="What points at this class" hint="Written elsewhere, as cards of their own, each naming this class. This is only the report.">
            <Attached label="Subclasses" cards={attachments.subclasses} empty="None yet. Make a Subclass card and set its class to this one." />
            <Attached label="Feature cards" cards={attachments.features} empty="None yet. Make a Feature card and set its class to this one." />
            <Attached label="Extra pages" cards={attachments.pages} empty="None yet. Make another Class card, choose 'Another page of a class', and name this one." />
          </FormSection>
        </>
      )}

      {problems.length ? (
        <ChamferBox chamfer={8} fill="rgba(120,30,28,0.22)" stroke={Rune.red} strokeWidth={1.2} style={{ padding: 10, gap: 4 }}>
          <Text style={{ color: Rune.ivory, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' }}>Before this can be shared</Text>
          {problems.map((p) => <Text key={p} style={{ color: Rune.sheet, fontSize: 11.5, fontFamily: Body.regular, lineHeight: 16 }}>{'• '}{p}</Text>)}
        </ChamferBox>
      ) : (
        <ChamferBox chamfer={8} fill="rgba(30,80,45,0.2)" stroke="rgba(120,190,140,0.6)" strokeWidth={1.2} style={{ padding: 10 }}>
          <Text style={{ color: Rune.sheet, fontSize: 11.5, fontFamily: Body.bold }}>This class is complete and can be shared.</Text>
        </ChamferBox>
      )}
    </View>
  );
}

// ------------------------------------------------------------------------------- functional cards

const KINDS: { key: FunctionKind; label: string }[] = [
  { key: 'counter', label: 'Counter' },
  { key: 'text', label: 'Text field' },
  { key: 'cycle', label: 'Cycling button' },
];

function FunctionEditor({ fn, state, advance, onChange, onState, onAdvance, onRemove }: {
  fn: CardFunction;
  state: FunctionState;
  /** v0.42.1: the level advancement this element offers, if it offers one. */
  advance: CardAdvance | undefined;
  onChange: (f: CardFunction) => void;
  onState: (s: FunctionState) => void;
  onAdvance: (a: CardAdvance | undefined) => void;
  onRemove: () => void;
}) {
  return (
    <ChamferBox chamfer={8} fill="rgba(20,24,31,0.55)" stroke="rgba(218,162,73,0.3)" strokeWidth={1.1} style={{ padding: 10, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ flex: 1, color: Rune.goldText, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>{functionSummary(fn)}</Text>
        <RemoveX label="Remove this element" onPress={onRemove} />
      </View>

      <View style={chipRow}>{KINDS.map((k) => <Chip key={k.key} label={k.label} on={fn.kind === k.key} onPress={() => onChange({ ...newFunction(fn.id, k.key), label: fn.label, placement: fn.placement, before: fn.before, after: fn.after })} />)}</View>

      <Field label="Subtitle (optional)" value={fn.label ?? ''} onChangeText={(label) => onChange({ ...fn, label })} placeholder="What this is" maxLength={40} />

      <View style={{ gap: 4 }}>
        <Text style={smallLabel}>Where it sits</Text>
        <View style={chipRow}>
          <Chip label="Above the text" on={fn.placement === 'above'} onPress={() => onChange({ ...fn, placement: 'above' })} />
          <Chip label="Below the text" on={fn.placement === 'below'} onPress={() => onChange({ ...fn, placement: 'below' })} />
        </View>
      </View>

      {fn.kind === 'counter' ? (
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Field label="Starts at" value={String(fn.start ?? 0)} onChangeText={(t) => onChange({ ...fn, start: num(t) })} numeric maxLength={3} />
            {/* v0.42.1 (owner): a RANGE, so a counter can be held between two numbers rather than
                only under a ceiling. Zero on either end means "no limit that way". */}
            <Field label="Lowest" value={String(fn.min ?? 0)} onChangeText={(t) => onChange({ ...fn, min: num(t) || undefined })} numeric maxLength={3} />
            <Field label="Highest (0 = none)" value={String(fn.max ?? 0)} onChangeText={(t) => onChange({ ...fn, max: num(t) || undefined })} numeric maxLength={3} />
          </View>
          <View style={chipRow}>
            <Chip label="Counts down only" on={!!fn.countdown} onPress={() => onChange({ ...fn, countdown: !fn.countdown, loop: fn.countdown ? undefined : fn.loop })} />
            {fn.countdown ? <Chip label="Restarts below zero" on={!!fn.loop} onPress={() => onChange({ ...fn, loop: !fn.loop })} /> : null}
          </View>
        </View>
      ) : null}

      {fn.kind === 'text' ? (
        <View style={{ gap: 8 }}>
          <Field label="Placeholder" value={fn.placeholder ?? ''} onChangeText={(placeholder) => onChange({ ...fn, placeholder })} placeholder="What to write here" maxLength={60} />
          <View style={{ gap: 4 }}>
            <Text style={smallLabel}>How big</Text>
            <View style={chipRow}>
              {[1, 2, 4].map((n) => <Chip key={n} label={n === 1 ? 'A word' : n === 2 ? 'A sentence' : 'A paragraph'} on={(fn.lines ?? 1) === n} onPress={() => onChange({ ...fn, lines: n })} />)}
            </View>
          </View>
        </View>
      ) : null}

      {fn.kind === 'cycle' ? (
        <View style={{ gap: 6 }}>
          <Text style={smallLabel}>Options, one per line</Text>
          <ChamferBox chamfer={6} fill="rgba(14,17,22,0.96)" stroke="rgba(218,162,73,0.5)" strokeWidth={1.2} style={{ minHeight: 70, paddingHorizontal: 10, paddingVertical: 7 }}>
            <TextInput
              value={(fn.options ?? []).join('\n')}
              onChangeText={(t) => onChange({ ...fn, options: t.split('\n') })}
              multiline
              placeholder={'Calm\nRoused\nRaging'}
              placeholderTextColor={Rune.muted}
              accessibilityLabel="Cycle options"
              style={{ color: Rune.sheet, fontSize: 13, fontFamily: Body.regular, padding: 0, textAlignVertical: 'top', minHeight: 56, lineHeight: 18 }}
            />
          </ChamferBox>
          <Field label="Starts on option number" value={String((fn.startIndex ?? 0) + 1)} onChangeText={(t) => onChange({ ...fn, startIndex: Math.max(0, num(t) - 1) })} numeric maxLength={2} />
        </View>
      ) : null}

      {/* v0.42.1 (owner): a line before and a line after the control, so a locked element can explain
          itself where it is rather than somewhere else on the card. */}
      <Field label="Line above the control" value={fn.before ?? ''} onChangeText={(before) => onChange({ ...fn, before })} placeholder="Optional" maxLength={160} />
      <Field label="Line below the control" value={fn.after ?? ''} onChangeText={(after) => onChange({ ...fn, after })} placeholder="e.g. Raise this once per tier as a level advancement." maxLength={160} />

      {/* v0.42.1 (owner): locked and hidden. Locked shows the value and refuses to move; hidden is
          not drawn at all. Only a level advancement opens either. */}
      <View style={{ gap: 4 }}>
        <Text style={smallLabel}>Can the player change it?</Text>
        <View style={chipRow}>
          <Chip label="Yes, freely" on={!fn.locked && !fn.hidden} onPress={() => onChange({ ...fn, locked: undefined, hidden: undefined })} />
          <Chip label="Locked" on={!!fn.locked && !fn.hidden} onPress={() => onChange({ ...fn, locked: true, hidden: undefined })} />
          <Chip label="Hidden until unlocked" on={!!fn.hidden} onPress={() => onChange({ ...fn, locked: true, hidden: true })} />
        </View>
      </View>

      {/**
        * A LEVEL ADVANCEMENT this element offers (v0.42.1, owner).
        *
        * "This is just a checkbox for custom functional cards, which can have a Level Advancement
        * Option tick and the user can select at which tiers it becomes available, and the user can
        * configure what it does to the functional card."
        *
        * It sits under the element rather than in a list of its own because that is what it is about:
        * an advancement that raises a Combo Die is a fact about the Combo Die.
        */}
      <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: 'rgba(218,162,73,0.25)', paddingTop: 9 }}>
        <View style={chipRow}>
          <Chip
            label="Offer it as a level advancement"
            on={!!advance}
            onPress={() => onAdvance(advance ? undefined : { id: `adv-${fn.id}`, label: '', functionId: fn.id, tiers: [], perTier: 1, effect: fn.kind === 'text' ? { kind: 'unlock' } : { kind: 'step', by: 1 } })}
          />
        </View>
        {advance ? (
          <View style={{ gap: 7 }}>
            <Field label="What the player sees in the level-up list" value={advance.label} onChangeText={(label) => onAdvance({ ...advance, label })} placeholder="e.g. Increase your Combo Die by one step" maxLength={70} />
            <View style={{ gap: 4 }}>
              <Text style={smallLabel}>Which tiers it is offered at</Text>
              <View style={chipRow}>
                <Chip label="Every tier" on={advance.tiers.length === 0} onPress={() => onAdvance({ ...advance, tiers: [] })} />
                {[2, 3, 4].map((t) => (
                  <Chip
                    key={t}
                    label={`Tier ${t}`}
                    on={advance.tiers.includes(t)}
                    onPress={() => onAdvance({ ...advance, tiers: advance.tiers.includes(t) ? advance.tiers.filter((x) => x !== t) : [...advance.tiers, t].sort((a, z) => a - z) })}
                  />
                ))}
              </View>
            </View>
            <View style={{ gap: 4 }}>
              <Text style={smallLabel}>How often, per tier</Text>
              <View style={chipRow}>
                <Chip label="Once" on={advance.perTier === 1} onPress={() => onAdvance({ ...advance, perTier: 1 })} />
                <Chip label="Twice" on={advance.perTier === 2} onPress={() => onAdvance({ ...advance, perTier: 2 })} />
              </View>
            </View>
            <View style={{ gap: 4 }}>
              <Text style={smallLabel}>What taking it does</Text>
              <View style={chipRow}>
                {fn.kind !== 'text' ? <Chip label={fn.kind === 'cycle' ? 'Moves it along' : 'Moves the number'} on={advance.effect.kind === 'step'} onPress={() => onAdvance({ ...advance, effect: { kind: 'step', by: 1 } })} /> : null}
                <Chip label="Sets it" on={advance.effect.kind === 'set'} onPress={() => onAdvance({ ...advance, effect: { kind: 'set', value: 0 } })} />
                <Chip label="Unlocks it" on={advance.effect.kind === 'unlock'} onPress={() => onAdvance({ ...advance, effect: { kind: 'unlock' } })} />
              </View>
            </View>
            {advance.effect.kind === 'step' ? (
              <Field label={fn.kind === 'cycle' ? 'How many options along' : 'By how much'} value={String(advance.effect.by)} onChangeText={(t) => onAdvance({ ...advance, effect: { kind: 'step', by: num(t) || 1 } })} numeric maxLength={3} />
            ) : null}
            {advance.effect.kind === 'set' && fn.kind !== 'text' ? (
              <Field label={fn.kind === 'cycle' ? 'To option number' : 'To what'} value={String(fn.kind === 'cycle' ? advance.effect.value + 1 : advance.effect.value)} onChangeText={(t) => onAdvance({ ...advance, effect: { kind: 'set', value: fn.kind === 'cycle' ? Math.max(0, num(t) - 1) : num(t) } })} numeric maxLength={3} />
            ) : null}
            {advance.effect.kind === 'set' && fn.kind === 'text' ? (
              <Field label="To what" value={advance.effect.text ?? ''} onChangeText={(text) => onAdvance({ ...advance, effect: { kind: 'set', value: 0, text } })} placeholder="What it should say" maxLength={80} />
            ) : null}
          </View>
        ) : null}
      </View>

      {/* The REAL control, with real state (owner): "the card should be able to be tested with its
          functionality during the preview". A picture of a control is not a test of one. */}
      <View style={{ gap: 5, borderTopWidth: 1, borderTopColor: 'rgba(218,162,73,0.25)', paddingTop: 9 }}>
        <Text style={smallLabel}>Try it</Text>
        <View style={{ backgroundColor: Rune.sheet, borderRadius: 6, padding: 10 }}>
          <CardFunctionControl fn={fn} state={state} onChange={onState} />
        </View>
      </View>
    </ChamferBox>
  );
}

export function CardFunctionsForm({ functions, states, advances, onChange, onStates, onAdvances }: {
  functions: CardFunction[] | undefined;
  states: Record<string, FunctionState>;
  /** v0.42.1: the level advancements this card offers, one per element at most. */
  advances: CardAdvance[] | undefined;
  onChange: (f: CardFunction[]) => void;
  onStates: (s: Record<string, FunctionState>) => void;
  onAdvances: (a: CardAdvance[]) => void;
}) {
  const list = functions ?? [];
  const add = (kind: FunctionKind) => onChange([...list, newFunction(`fn-${Date.now().toString(36)}-${list.length}`, kind)]);
  return (
    <View style={{ gap: 9 }}>
      <Text style={smallLabel}>Functional element</Text>
      <Text style={hintStyle}>
        Something the player uses on the card itself: a number they move, a line they write on, a state they switch.
        One per card, which is the owner&apos;s rule. Try it below before you share it.
      </Text>
      {list.length === 0 ? <View style={chipRow}>{KINDS.map((k) => <Chip key={k.key} label={`+ ${k.label}`} on={false} onPress={() => add(k.key)} />)}</View> : null}
      {list.map((fn, i) => (
        <FunctionEditor
          key={fn.id}
          fn={fn}
          state={stateOf(fn, states[fn.id])}
          advance={(advances ?? []).find((a) => a.functionId === fn.id)}
          onChange={(next) => onChange(list.map((x, j) => (j === i ? next : x)))}
          onState={(st) => onStates({ ...states, [fn.id]: st })}
          onAdvance={(a) => onAdvances([...(advances ?? []).filter((x) => x.functionId !== fn.id), ...(a ? [a] : [])])}
          onRemove={() => { onChange(list.filter((_, j) => j !== i)); onAdvances((advances ?? []).filter((a) => a.functionId !== fn.id)); }}
        />
      ))}
      {list.length ? <RuneButton label="Remove the element" kind="ghost" dense height={34} onPress={() => { onChange([]); onAdvances([]); }} /> : null}
    </View>
  );
}
