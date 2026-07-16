/**
 * Card Library (v0.10.0) — the app-level home for homebrew content, reached from the main menu's
 * "Cards". Browse the system archive, or author/share/import EXPANSIONS: versioned bundles of cards
 * (ancestries, communities, domain cards, subclasses, classes, generic cards) that feed character
 * creation. Sharing/import use the shared `.rkp` file format; importing a newer version of an
 * expansion you already have updates it in place.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { AppScreen } from '@/components/app-screen';
import { ChamferBox } from '@/components/chamfer-box';
import { LoadingScreen } from '@/components/loading-screen';
import { PopupDialog } from '@/components/popup-dialog';
import { RuneButton } from '@/components/rune-button';
import { CardEditor, type CardDraft } from '@/components/card-editor';
import { Body, Display, Rune } from '@/constants/theme';
import { ALL_DOMAINS, CLASSES } from '@/constants/identity';
import { playSfx } from '@/lib/sfx';
import {
  type ArmorSpec,
  CONTENT_TYPE_LABEL,
  type Expansion,
  type LibraryCard,
  type LibraryContentType,
  type WeaponSpec,
  expansionSummary,
  isEnabledForCreation,
  isExpansionEnabled,
} from '@/lib/library';
import { expansionCardCount, isOfficialExpansion, seedOfficialExpansions } from '@/lib/expansions';
import { deleteExpansion, exportRkp, getExpansion, importExpansionRkp, listExpansions, saveExpansion } from '@/lib/library-store';
import { nfcModulesPresent } from '@/lib/nfc';
import type { RkpContent } from '@/lib/rkp';
import { NfcReceiveModal, NfcSendModal } from '@/features/share/nfc-modal';

const newId = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
/** Content types the New-card chooser offers (Feature 5/6), in display order. */
const CHOOSABLE_TYPES: LibraryContentType[] = ['ancestry', 'community', 'domain', 'subclass', 'class', 'weapon', 'armor', 'inventory', 'generic'];
const WEAPON_TRAITS = ['Agility', 'Strength', 'Finesse', 'Instinct', 'Presence', 'Knowledge'];
const WEAPON_RANGES = ['Melee', 'Very Close', 'Close', 'Far', 'Very Far'];
const DEFAULT_WEAPON: WeaponSpec = { trait: 'Agility', range: 'Melee', damage: 'd6', damageType: 'phy', burden: 'One-Handed', kind: 'physical', slot: 'primary', tier: 1 };
const DEFAULT_ARMOR: ArmorSpec = { baseScore: 3, thresholds: '7/15', tier: 1 };

/** Type the content-config block writes (the non-visual parts of a LibraryCard). */
interface CardConfig {
  contentType: LibraryContentType;
  domain?: string;
  level?: number;
  className?: string;
  /** subclass content (v0.10.5): the family name shared by its 3 tier cards + which tier this one is. */
  subclass?: string;
  tier?: 1 | 2 | 3;
  ancestryEffectTrait?: 1 | 2;
  weapon?: WeaponSpec;
  armor?: ArmorSpec;
  /** generic 'Card': an optional custom plaque label typed by the user (Feature 6). */
  typeLabel?: string;
}

/** Fresh config for a newly-chosen content type (Feature 5). */
function defaultConfigFor(t: LibraryContentType): CardConfig {
  if (t === 'domain') return { contentType: t, domain: '', level: 1 };
  if (t === 'ancestry') return { contentType: t, ancestryEffectTrait: 1 };
  if (t === 'subclass') return { contentType: t, tier: 1 };
  if (t === 'weapon') return { contentType: t, weapon: { ...DEFAULT_WEAPON } };
  if (t === 'armor') return { contentType: t, armor: { ...DEFAULT_ARMOR } };
  return { contentType: t };
}

function LibInput({ label, value, onChangeText, placeholder, keyboardType }: { label: string; value: string; onChangeText: (s: string) => void; placeholder?: string; keyboardType?: 'default' | 'number-pad' }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: Rune.bronze, fontSize: 10, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' }}>{label}</Text>
      <ChamferBox chamfer={6} fill="rgba(14,17,22,0.9)" stroke="rgba(218,162,73,0.45)" strokeWidth={1.1} style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 11 }}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Rune.muted}
          selectionColor={Rune.goldBright}
          keyboardType={keyboardType}
          style={{ color: Rune.sheet, fontSize: 14, fontFamily: Body.semibold, padding: 0 }}
          accessibilityLabel={label}
        />
      </ChamferBox>
    </View>
  );
}

/** v0.12.0: an enable/disable toggle shown on the RIGHT of each expansion row, so expansions can be
 *  turned on/off from the hub without opening them (the in-detail button is gone). */
function ExpansionToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <Pressable
      onPress={onToggle}
      hitSlop={12}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={on ? 'Enabled for creation. Tap to disable' : 'Disabled. Tap to enable'}
      style={{ width: 46, height: 26, borderRadius: 13, padding: 3, justifyContent: 'center', backgroundColor: on ? Rune.goldEdge : 'rgba(70,72,78,0.6)', borderWidth: 1, borderColor: on ? Rune.goldBright : 'rgba(147,142,136,0.5)' }}>
      <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: on ? Rune.ivory : '#B7BBC3', alignSelf: on ? 'flex-end' : 'flex-start' }} />
    </Pressable>
  );
}

/** A single expansion row on the hub — name + version/count/author, with the enable toggle on the right.
 *  Shared by the "Official Expansions" and "My expansions" sections (identical layout). */
function ExpansionRow({ e, on, cardCount, onOpen, onToggle }: { e: Expansion; on: boolean; cardCount: number; onOpen: () => void; onToggle: () => void }) {
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Open ${e.name}`}>
      {({ pressed }) => (
        <ChamferBox chamfer={10} fill={pressed ? 'rgba(20,24,31,0.95)' : 'rgba(14,17,22,0.86)'} stroke="rgba(218,162,73,0.4)" strokeWidth={1.1} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 13, paddingVertical: 12 }}>
          <View style={{ flex: 1, opacity: on ? 1 : 0.5 }}>
            <Text numberOfLines={1} style={{ color: Rune.ivory, fontSize: 16, fontFamily: Display.black, letterSpacing: 0.5, textTransform: 'uppercase' }}>{e.name}</Text>
            <Text style={{ color: Rune.goldText, fontSize: 11, fontFamily: Body.medium, letterSpacing: 0.3, marginTop: 3 }}>v{e.version} · {cardCount} card{cardCount === 1 ? '' : 's'}{e.author ? ` · ${e.author}` : ''}</Text>
          </View>
          {/* v0.12.0: toggle enable/disable right here, no need to open the expansion. */}
          <ExpansionToggle on={on} onToggle={onToggle} />
        </ChamferBox>
      )}
    </Pressable>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}>
      <View style={{ paddingHorizontal: 11, paddingVertical: 7, borderRadius: 5, backgroundColor: on ? Rune.red : 'rgba(20,24,31,0.7)', borderWidth: 1, borderColor: on ? 'transparent' : 'rgba(218,162,73,0.4)' }}>
        <Text style={{ color: on ? Rune.ivory : Rune.sheet, fontSize: 12.5, fontFamily: Body.bold }}>{label}</Text>
      </View>
    </Pressable>
  );
}

// v0.13.0: all 15 class keys (base + Void) so Void subclasses/classes can be authored.
const BUILTIN_CLASSES = CLASSES.map((c) => c.key);
const smallLabel = { color: Rune.bronze, fontSize: 10, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' as const };
const chipRow = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6 };

/** The per-type mechanical/config fields shown inside the card editor (its `extraField`). The content
 *  type is chosen up front (Feature 5), so this no longer offers a type switcher. */
function ContentConfig({ config, onChange }: { config: CardConfig; onChange: (c: CardConfig) => void }) {
  const set = (patch: Partial<CardConfig>) => onChange({ ...config, ...patch });
  const setW = (patch: Partial<WeaponSpec>) => onChange({ ...config, weapon: { ...(config.weapon ?? DEFAULT_WEAPON), ...patch } });
  const setA = (patch: Partial<ArmorSpec>) => onChange({ ...config, armor: { ...(config.armor ?? DEFAULT_ARMOR), ...patch } });
  const t = config.contentType;
  const w = config.weapon ?? DEFAULT_WEAPON;
  const a = config.armor ?? DEFAULT_ARMOR;
  return (
    <View style={{ gap: 8 }}>
      <Text style={smallLabel}>{CONTENT_TYPE_LABEL[t]} details</Text>
      {t === 'domain' ? (
        <>
          <LibInput label="Domain" value={config.domain ?? ''} onChangeText={(domain) => set({ domain })} placeholder="e.g. Pyre (custom) or arcana" />
          <View style={chipRow}>{ALL_DOMAINS.map((d) => <Chip key={d} label={d} on={config.domain === d} onPress={() => set({ domain: d })} />)}</View>
          <LibInput label="Level (1–10)" value={config.level ? String(config.level) : ''} onChangeText={(s) => set({ level: Math.max(1, Math.min(10, parseInt(s || '1', 10) || 1)) })} placeholder="1" keyboardType="number-pad" />
        </>
      ) : null}
      {t === 'subclass' || t === 'class' ? (
        <View style={{ gap: 4 }}>
          <Text style={smallLabel}>Class it belongs to</Text>
          <View style={chipRow}>{BUILTIN_CLASSES.map((c) => <Chip key={c} label={c} on={config.className === c} onPress={() => set({ className: c })} />)}</View>
          <LibInput label="…or a custom class name" value={config.className ?? ''} onChangeText={(className) => set({ className })} placeholder="e.g. Warden" />
          {t === 'class' ? <Text style={{ color: Rune.muted, fontSize: 9.5, fontFamily: Body.regular }}>The character creator groups this under that class. (Custom standalone classes come later.)</Text> : null}
        </View>
      ) : null}
      {t === 'subclass' ? (
        <View style={{ gap: 4 }}>
          <LibInput label="Subclass name (its family)" value={config.subclass ?? ''} onChangeText={(subclass) => set({ subclass })} placeholder="e.g. Stalwart" />
          <Text style={smallLabel}>Progression tier</Text>
          <View style={chipRow}>
            <Chip label="Foundation" on={(config.tier ?? 1) === 1} onPress={() => set({ tier: 1 })} />
            <Chip label="Specialization" on={config.tier === 2} onPress={() => set({ tier: 2 })} />
            <Chip label="Mastery" on={config.tier === 3} onPress={() => set({ tier: 3 })} />
          </View>
          <Text style={{ color: Rune.muted, fontSize: 9.5, fontFamily: Body.regular, lineHeight: 13 }}>Make ALL THREE — a Foundation, a Specialization, and a Mastery — with the SAME class + subclass name. Foundation is chosen in creation; the other two are added automatically when you upgrade the subclass on level-up.</Text>
        </View>
      ) : null}
      {t === 'ancestry' ? (
        <View style={{ gap: 4 }}>
          <Text style={smallLabel}>Passive on feature line</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Chip label="Feature 1" on={config.ancestryEffectTrait === 1} onPress={() => set({ ancestryEffectTrait: 1 })} />
            <Chip label="Feature 2" on={config.ancestryEffectTrait === 2} onPress={() => set({ ancestryEffectTrait: 2 })} />
          </View>
          <Text style={{ color: Rune.muted, fontSize: 9.5, fontFamily: Body.regular }}>Which of the two features stays active when mixed with another ancestry (the other is crossed out).</Text>
        </View>
      ) : null}
      {t === 'weapon' ? (
        <View style={{ gap: 6 }}>
          <Text style={smallLabel}>Trait</Text><View style={chipRow}>{WEAPON_TRAITS.map((x) => <Chip key={x} label={x} on={w.trait === x} onPress={() => setW({ trait: x })} />)}</View>
          <Text style={smallLabel}>Range</Text><View style={chipRow}>{WEAPON_RANGES.map((x) => <Chip key={x} label={x} on={w.range === x} onPress={() => setW({ range: x })} />)}</View>
          <LibInput label="Damage (e.g. d8+2)" value={w.damage} onChangeText={(damage) => setW({ damage })} placeholder="d6" />
          <View style={chipRow}>
            <Chip label="Physical" on={w.damageType === 'phy'} onPress={() => setW({ damageType: 'phy', kind: 'physical' })} />
            <Chip label="Magic" on={w.damageType === 'mag'} onPress={() => setW({ damageType: 'mag', kind: 'magic' })} />
          </View>
          <View style={chipRow}>
            <Chip label="One-Handed" on={w.burden === 'One-Handed'} onPress={() => setW({ burden: 'One-Handed' })} />
            <Chip label="Two-Handed" on={w.burden === 'Two-Handed'} onPress={() => setW({ burden: 'Two-Handed' })} />
          </View>
          <View style={chipRow}>
            <Chip label="Primary" on={w.slot === 'primary'} onPress={() => setW({ slot: 'primary' })} />
            <Chip label="Secondary" on={w.slot === 'secondary'} onPress={() => setW({ slot: 'secondary' })} />
          </View>
          <Text style={smallLabel}>Tier</Text><View style={chipRow}>{[1, 2, 3, 4].map((n) => <Chip key={n} label={`T${n}`} on={w.tier === n} onPress={() => setW({ tier: n as 1 | 2 | 3 | 4 })} />)}</View>
        </View>
      ) : null}
      {t === 'armor' ? (
        <View style={{ gap: 6 }}>
          <LibInput label="Base armor score" value={String(a.baseScore)} onChangeText={(s) => setA({ baseScore: Math.max(0, parseInt(s || '0', 10) || 0) })} placeholder="3" keyboardType="number-pad" />
          <LibInput label="Thresholds (major/severe)" value={a.thresholds} onChangeText={(thresholds) => setA({ thresholds })} placeholder="7/15" />
          <Text style={smallLabel}>Tier</Text><View style={chipRow}>{[1, 2, 3, 4].map((n) => <Chip key={n} label={`T${n}`} on={a.tier === n} onPress={() => setA({ tier: n as 1 | 2 | 3 | 4 })} />)}</View>
        </View>
      ) : null}
      {t === 'generic' ? (
        <LibInput label="Type label (optional)" value={config.typeLabel ?? ''} onChangeText={(typeLabel) => set({ typeLabel })} placeholder="e.g. Consumable, Relic — shows on the plaque" />
      ) : null}
    </View>
  );
}

/** New-card type chooser (Feature 5): pick the content type BEFORE authoring. */
function TypeChooser({ onPick, onClose }: { onPick: (t: LibraryContentType) => void; onClose: () => void }) {
  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 9000, alignItems: 'center', justifyContent: 'center' }}>
      {/* v0.13.0: non-dismissing backdrop — closing is deliberate (the Cancel button), never a stray tap. */}
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(6,8,13,0.9)' }} />
      <ChamferBox chamfer={14} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} style={{ width: 330, paddingHorizontal: 16, paddingVertical: 16, gap: 12 }}>
        <Text style={{ color: Rune.goldText, fontSize: 18, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.5 }}>What are you making?</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {CHOOSABLE_TYPES.map((t) => (
            <Pressable key={t} onPress={() => { playSfx('buttonTap'); onPick(t); }} accessibilityRole="button" accessibilityLabel={CONTENT_TYPE_LABEL[t]}>
              <View style={{ paddingHorizontal: 13, paddingVertical: 9, borderRadius: 6, backgroundColor: 'rgba(20,24,31,0.8)', borderWidth: 1, borderColor: 'rgba(218,162,73,0.45)' }}>
                <Text style={{ color: Rune.sheet, fontSize: 13.5, fontFamily: Body.bold }}>{CONTENT_TYPE_LABEL[t]}</Text>
              </View>
            </Pressable>
          ))}
        </View>
        <RuneButton label="Cancel" kind="ghost" height={40} onPress={onClose} />
      </ChamferBox>
    </View>
  );
}

/** Create / edit expansion metadata (name, author, description, version). */
function MetaForm({ initial, onSave, onCancel }: { initial?: Expansion; onSave: (m: { name: string; author: string; description: string; version: number }) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [author, setAuthor] = useState(initial?.author ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [version, setVersion] = useState(initial?.version ?? 1);
  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 9000, alignItems: 'center', justifyContent: 'center' }}>
      {/* v0.13.0: non-dismissing backdrop — a stray tap between fields must never destroy typed input.
          The form closes ONLY via its Cancel/Save buttons. */}
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(6,8,13,0.9)' }} />
      <ChamferBox chamfer={14} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} style={{ width: 330, paddingHorizontal: 16, paddingVertical: 16, gap: 10 }}>
        <Text style={{ color: Rune.goldText, fontSize: 18, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.5 }}>{initial ? 'Edit expansion' : 'New expansion'}</Text>
        <LibInput label="Name" value={name} onChangeText={setName} placeholder="My homebrew" />
        <LibInput label="Author" value={author} onChangeText={setAuthor} placeholder="You" />
        <LibInput label="Description" value={description} onChangeText={setDescription} placeholder="What's inside" />
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: Rune.bronze, fontSize: 10, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4 }}>Version</Text>
            <Text style={{ color: Rune.sheet, fontSize: 16, fontFamily: Body.bold }}>{version}</Text>
          </View>
          <RuneButton label="–" kind="ghost" dense height={34} onPress={() => setVersion((v) => Math.max(1, v - 1))} />
          <RuneButton label="+" kind="ghost" dense height={34} onPress={() => setVersion((v) => v + 1)} />
        </View>
        <Text style={{ color: Rune.muted, fontSize: 9.5, fontFamily: Body.regular }}>Bump the version before re-sharing — recipients update in place.</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          <RuneButton label="Cancel" kind="ghost" height={40} style={{ flex: 1 }} onPress={onCancel} />
          <RuneButton label="Save" kind="primary" height={40} style={{ flex: 1 }} disabled={!name.trim()} onPress={() => onSave({ name: name.trim(), author: author.trim(), description: description.trim(), version })} />
        </View>
      </ChamferBox>
    </View>
  );
}

const cardSummary = (c: LibraryCard) => {
  const parts = [CONTENT_TYPE_LABEL[c.contentType]];
  if (c.contentType === 'domain' && c.domain) parts.push(`${c.domain} L${c.level ?? 1}`);
  if ((c.contentType === 'subclass' || c.contentType === 'class') && c.className) parts.push(c.className);
  return parts.join(' · ');
};

export function LibraryScreen() {
  const router = useRouter();
  const [expansions, setExpansions] = useState<Expansion[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<{ index: number | 'new'; config: CardConfig; draft?: CardDraft } | null>(null);
  const [choosingType, setChoosingType] = useState(false);
  const [metaForm, setMetaForm] = useState<'new' | 'edit' | null>(null);
  const [confirmDeleteExp, setConfirmDeleteExp] = useState<Expansion | null>(null);
  const [confirmDeleteCard, setConfirmDeleteCard] = useState<number | null>(null);
  const [message, setMessage] = useState<{ title: string; body: string } | null>(null);
  const [nfcSend, setNfcSend] = useState<{ content: RkpContent; label: string } | null>(null);
  const [nfcReceive, setNfcReceive] = useState(false);
  const nfcOn = nfcModulesPresent();

  const reload = useCallback(() => {
    let live = true;
    // v0.12.2: seed the bundled official expansions (e.g. The Void) BEFORE listing so they appear in
    // the hub. Idempotent + best-effort — swallow errors so a web/storage hiccup never blanks the list.
    seedOfficialExpansions()
      .catch(() => {})
      .then(() => listExpansions())
      .then((all) => { if (live) setExpansions(all); });
    return () => { live = false; };
  }, []);
  useFocusEffect(reload);

  const selected = expansions?.find((e) => e.id === selectedId) ?? null;

  const persist = useCallback(async (exp: Expansion) => {
    await saveExpansion(exp);
    setExpansions((all) => [...(all ?? []).filter((e) => e.id !== exp.id), exp].sort((a, b) => a.name.localeCompare(b.name)));
  }, []);

  const onImport = useCallback(async () => {
    try {
      const res = await importExpansionRkp();
      if (!res) return;
      reload();
      const verb = res.decision === 'add' ? 'imported' : res.decision === 'update' ? 'updated to the new version' : res.decision === 'skip' ? 'skipped (you have a newer version)' : 'already up to date';
      setMessage({ title: res.expansion.name, body: `Expansion ${verb}.` });
    } catch (e) {
      setMessage({ title: 'Import failed', body: e instanceof Error ? e.message : 'Could not read that file.' });
    }
  }, [reload]);

  const onNfcReceived = useCallback(async (content: RkpContent) => {
    setNfcReceive(false);
    try {
      // v0.10.7: NFC now shares one card OR several (a multi-card send arrives as a one-off expansion).
      // Heroes still go over file import/export on the character screen.
      if (content.kind === 'character') {
        setMessage({ title: 'That was a hero', body: 'NFC here receives cards — import a hero from a file on the character screen.' });
        return;
      }
      const cards = content.kind === 'card' ? [content.payload] : content.payload.cards;
      if (!cards.length) { setMessage({ title: 'Nothing to add', body: 'That tap had no cards on it.' }); return; }
      // received cards land in a shared "Received cards" expansion in the library
      const id = 'exp-received';
      const exp = (await getExpansion(id)) ?? { id, name: 'Received cards', author: '', description: 'Cards received over NFC or file.', version: 1, createdAt: new Date().toISOString(), cards: [] };
      await saveExpansion({ ...exp, cards: [...exp.cards, ...cards] });
      reload();
      setMessage({ title: cards.length === 1 ? cards[0].title || 'Card' : `${cards.length} cards`, body: 'Added to your "Received cards" expansion.' });
    } catch (e) {
      setMessage({ title: 'Receive failed', body: e instanceof Error ? e.message : 'Could not read that.' });
    }
  }, [reload]);

  if (!expansions) return <LoadingScreen label="Opening the library" />;

  // ---- card editor overlay (author/edit a card inside the selected expansion) ----
  if (editingCard && selected) {
    const existing = typeof editingCard.index === 'number' ? selected.cards[editingCard.index] : undefined;
    const cfg = editingCard.config;
    const initial: CardDraft | undefined = existing
      ? {
          title: existing.title,
          text: existing.text,
          imageUri: existing.imageUri,
          color: existing.color ?? null,
          effects: existing.effects ?? [],
          typeLabel: existing.typeLabel,
          // migrate legacy single-body cards into one section so editing keeps their text
          sections: existing.sections ?? (existing.text ? [{ body: existing.text }] : undefined),
        }
      : undefined;
    const isAncestry = cfg.contentType === 'ancestry';
    return (
      <CardEditor
        kindLabel={cfg.typeLabel || CONTENT_TYPE_LABEL[cfg.contentType]}
        initial={initial}
        sectioned
        sectionsConfig={isAncestry ? { ancestryFeatures: true } : undefined}
        extraField={<ContentConfig config={cfg} onChange={(config) => setEditingCard((s) => (s ? { ...s, config } : s))} />}
        onCancel={() => setEditingCard(null)}
        onSave={(d) => {
          const cards = [...selected.cards];
          const base: LibraryCard = {
            id: existing?.id ?? newId('lc'),
            contentType: cfg.contentType,
            title: d.title,
            text: d.text,
            imageUri: d.imageUri,
            color: d.color,
            effects: d.effects,
            typeLabel: cfg.contentType === 'generic' ? cfg.typeLabel : d.typeLabel,
            sections: d.sections,
            domain: cfg.contentType === 'domain' ? cfg.domain : undefined,
            level: cfg.contentType === 'domain' ? cfg.level ?? 1 : undefined,
            className: cfg.contentType === 'subclass' || cfg.contentType === 'class' ? cfg.className : undefined,
            subclass: cfg.contentType === 'subclass' ? cfg.subclass : undefined,
            tier: cfg.contentType === 'subclass' ? cfg.tier ?? 1 : undefined,
            ancestryEffectTrait: cfg.contentType === 'ancestry' ? cfg.ancestryEffectTrait : undefined,
            weapon: cfg.contentType === 'weapon' ? cfg.weapon : undefined,
            armor: cfg.contentType === 'armor' ? cfg.armor : undefined,
          };
          if (typeof editingCard.index === 'number') cards[editingCard.index] = base;
          else cards.push(base);
          void persist({ ...selected, cards });
          setEditingCard(null);
        }}
      />
    );
  }

  // ---- official expansion detail (read-only) ----
  // v0.12.2: bundled expansions (The Void) are read-only — name/author/description + card count + the
  // global enable toggle only. No edit/share/add/delete, no editable card list. Their cards live in the
  // catalog (the record's own `cards` is empty), so the count comes from there.
  if (selected && (selected.official || isOfficialExpansion(selected.id))) {
    const cardCount = expansionCardCount(selected);
    const on = isEnabledForCreation(selected);
    return (
      <AppScreen title={selected.name} onBack={() => setSelectedId(null)}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 24 }}>
          <ChamferBox chamfer={10} fill="rgba(14,17,22,0.9)" stroke="rgba(218,162,73,0.4)" strokeWidth={1.2} style={{ padding: 12, gap: 8 }}>
            <Text style={{ color: Rune.goldText, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.6 }}>by {selected.author || 'unknown'} · {cardCount} card{cardCount === 1 ? '' : 's'}</Text>
            {selected.description ? <Text style={{ color: Rune.muted, fontSize: 12.5, fontFamily: Body.regular, lineHeight: 18 }}>{selected.description}</Text> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: Rune.ivory, fontSize: 13, fontFamily: Body.bold }}>{on ? 'Enabled for creation' : 'Disabled'}</Text>
                <Text style={{ color: Rune.muted, fontSize: 10.5, fontFamily: Body.regular, marginTop: 2 }}>Official expansion — read only</Text>
              </View>
              <ExpansionToggle on={on} onToggle={() => { playSfx('buttonTap'); void persist({ ...selected, enabled: !on }); }} />
            </View>
          </ChamferBox>
        </ScrollView>
      </AppScreen>
    );
  }

  // ---- expansion detail ----
  if (selected) {
    const s = expansionSummary(selected);
    return (
      <AppScreen title={selected.name} onBack={() => setSelectedId(null)}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 24 }}>
          <ChamferBox chamfer={10} fill="rgba(14,17,22,0.9)" stroke="rgba(218,162,73,0.4)" strokeWidth={1.2} style={{ padding: 12, gap: 4 }}>
            <Text style={{ color: Rune.goldText, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.6 }}>by {selected.author || 'unknown'} · v{selected.version} · {s.cardCount} card{s.cardCount === 1 ? '' : 's'}</Text>
            {selected.description ? <Text style={{ color: Rune.muted, fontSize: 12.5, fontFamily: Body.regular, lineHeight: 18 }}>{selected.description}</Text> : null}
            {/* v0.12.0: the enable/disable button moved OUT to the hub row toggle — no in-detail button. */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <RuneButton label="Edit info" kind="ghost" dense height={34} style={{ flex: 1 }} onPress={() => setMetaForm('edit')} />
              <RuneButton label="Share" kind="ghost" dense height={34} style={{ flex: 1 }} onPress={() => { playSfx('buttonTap'); void exportRkp({ kind: 'expansion', payload: selected }, selected.name); }} />
            </View>
          </ChamferBox>

          {selected.cards.length === 0 ? (
            <Text style={{ color: Rune.muted, fontSize: 12.5, fontFamily: Body.medium, textAlign: 'center', paddingVertical: 18 }}>No cards yet. Add your first homebrew card.</Text>
          ) : (
            selected.cards.map((c, i) => (
              <Pressable key={c.id} onPress={() => setEditingCard({ index: i, config: { contentType: c.contentType, domain: c.domain, level: c.level, className: c.className, subclass: c.subclass, tier: c.tier, ancestryEffectTrait: c.ancestryEffectTrait, weapon: c.weapon, armor: c.armor, typeLabel: c.typeLabel } })} accessibilityRole="button" accessibilityLabel={`Edit ${c.title || 'card'}`}>
                {({ pressed }) => (
                  <ChamferBox chamfer={8} fill={pressed ? 'rgba(20,24,31,0.95)' : 'rgba(14,17,22,0.86)'} stroke="rgba(218,162,73,0.4)" strokeWidth={1.1} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 11 }}>
                    <View style={{ width: 10, height: 10, backgroundColor: c.color ?? Rune.bronze, transform: [{ rotate: '45deg' }] }} />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ color: Rune.ivory, fontSize: 15, fontFamily: Body.bold }}>{c.title || 'Untitled'}</Text>
                      <Text style={{ color: Rune.goldText, fontSize: 10.5, fontFamily: Body.medium, letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 2 }}>{cardSummary(c)}</Text>
                    </View>
                    {nfcOn ? (
                      <Pressable onPress={() => { playSfx('buttonTap'); setNfcSend({ content: { kind: 'card', payload: c }, label: c.title || 'card' }); }} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Send ${c.title || 'card'} by NFC`} style={{ paddingHorizontal: 6, paddingVertical: 4 }}>
                      <Text style={{ color: Rune.goldText, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.6 }}>NFC</Text>
                    </Pressable>
                    ) : null}
                    <Pressable onPress={() => setConfirmDeleteCard(i)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Delete ${c.title || 'card'}`} style={{ padding: 4 }}>
                      <Text style={{ color: '#E2705A', fontSize: 16, fontFamily: Body.bold }}>✕</Text>
                    </Pressable>
                  </ChamferBox>
                )}
              </Pressable>
            ))
          )}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 10, paddingTop: 8, paddingBottom: 6 }}>
          <RuneButton label="Delete expansion" kind="ghost" height={46} style={{ flex: 1 }} onPress={() => setConfirmDeleteExp(selected)} />
          <RuneButton label="Add card" kind="primary" height={46} style={{ flex: 1.4 }} onPress={() => setChoosingType(true)} />
        </View>

        {metaForm === 'edit' ? (
          <MetaForm initial={selected} onCancel={() => setMetaForm(null)} onSave={(m) => { void persist({ ...selected, ...m }); setMetaForm(null); }} />
        ) : null}
        {choosingType ? (
          <TypeChooser onPick={(t) => { setChoosingType(false); setEditingCard({ index: 'new', config: defaultConfigFor(t) }); }} onClose={() => setChoosingType(false)} />
        ) : null}
        {confirmDeleteCard != null ? (
          <PopupDialog title="Delete card?" body={`"${selected.cards[confirmDeleteCard]?.title || 'Untitled'}" will be removed from this expansion.`} confirmLabel="Delete" destructive
            onConfirm={() => { const cards = selected.cards.filter((_, j) => j !== confirmDeleteCard); void persist({ ...selected, cards }); setConfirmDeleteCard(null); }}
            onCancel={() => setConfirmDeleteCard(null)} />
        ) : null}
        {confirmDeleteExp ? (
          <PopupDialog title="Delete expansion?" body={`${confirmDeleteExp.name} and its ${confirmDeleteExp.cards.length} card(s) will be removed from this device. Exported .rkp files are unaffected.`} confirmLabel="Delete" destructive
            onConfirm={() => { const id = confirmDeleteExp.id; setConfirmDeleteExp(null); setSelectedId(null); if (isOfficialExpansion(id)) return; void deleteExpansion(id).then(reload); }}
            onCancel={() => setConfirmDeleteExp(null)} />
        ) : null}
        {nfcSend ? <NfcSendModal content={nfcSend.content} label={nfcSend.label} onClose={() => setNfcSend(null)} /> : null}
        {message ? <PopupDialog title={message.title} body={message.body} confirmLabel="OK" onConfirm={() => setMessage(null)} onCancel={() => setMessage(null)} /> : null}
      </AppScreen>
    );
  }

  // ---- hub ----
  // v0.12.2: bundled official expansions (The Void) list FIRST in their own read-only section; the
  // player's authored/received expansions follow under "My expansions".
  const officialExps = expansions.filter((e) => e.official === true);
  const customExps = expansions.filter((e) => !e.official);
  return (
    <AppScreen title="Card library" onBack={() => router.back()}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 16 }}>
        <Pressable onPress={() => { playSfx('enterCardViewer'); router.push('/gallery'); }} accessibilityRole="button" accessibilityLabel="Browse the card archive">
          {({ pressed }) => (
            <ChamferBox chamfer={12} fill={pressed ? 'rgba(20,24,31,0.95)' : 'rgba(14,17,22,0.9)'} stroke="rgba(218,162,73,0.5)" strokeWidth={1.3} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 14 }}>
              <Svg width={24} height={24} viewBox="0 0 24 24">
                <Path d="M4 5 h12 v14 h-12 z M8 5 v14 M20 8 v11 h-12" fill="none" stroke={Rune.goldEdge} strokeWidth={1.6} strokeLinejoin="round" />
              </Svg>
              <View style={{ flex: 1 }}>
                <Text style={{ color: Rune.ivory, fontSize: 16, fontFamily: Display.black, letterSpacing: 0.6, textTransform: 'uppercase' }}>Card archive</Text>
                <Text style={{ color: Rune.muted, fontSize: 12, fontFamily: Body.medium }}>Every system card, weapon & armor</Text>
              </View>
            </ChamferBox>
          )}
        </Pressable>

        {officialExps.length > 0 ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <Text style={{ color: Rune.goldText, fontSize: 12, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>Official expansions</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(218,162,73,0.25)' }} />
            </View>
            {officialExps.map((e) => (
              <ExpansionRow
                key={e.id}
                e={e}
                on={isEnabledForCreation(e)}
                cardCount={expansionCardCount(e)}
                onOpen={() => setSelectedId(e.id)}
                onToggle={() => { playSfx('buttonTap'); void persist({ ...e, enabled: !isEnabledForCreation(e) }); }}
              />
            ))}
          </>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <Text style={{ color: Rune.goldText, fontSize: 12, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>My expansions</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(218,162,73,0.25)' }} />
        </View>

        {customExps.length === 0 ? (
          <Text style={{ color: Rune.muted, fontSize: 12.5, fontFamily: Body.medium, textAlign: 'center', paddingVertical: 14, lineHeight: 18 }}>
            No expansions yet. Create one to author homebrew cards,{'\n'}or import a friend&apos;s .rkp.
          </Text>
        ) : (
          customExps.map((e) => (
            <ExpansionRow
              key={e.id}
              e={e}
              on={isExpansionEnabled(e)}
              cardCount={expansionSummary(e).cardCount}
              onOpen={() => setSelectedId(e.id)}
              onToggle={() => { playSfx('buttonTap'); void persist({ ...e, enabled: !isExpansionEnabled(e) }); }}
            />
          ))
        )}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 10, paddingTop: 8, paddingBottom: 6 }}>
        <RuneButton label="Import .rkp" kind="ghost" height={46} style={{ flex: 1 }} onPress={onImport} />
        {nfcOn ? <RuneButton label="Receive NFC" kind="ghost" height={46} style={{ flex: 1 }} onPress={() => { playSfx('buttonTap'); setNfcReceive(true); }} /> : null}
        <RuneButton label="New expansion" kind="primary" height={46} style={{ flex: 1.4 }} onPress={() => setMetaForm('new')} />
      </View>

      {metaForm === 'new' ? (
        <MetaForm
          onCancel={() => setMetaForm(null)}
          onSave={(m) => {
            const exp: Expansion = { id: newId('exp'), createdAt: new Date().toISOString(), cards: [], ...m };
            void persist(exp).then(() => setSelectedId(exp.id));
            setMetaForm(null);
          }}
        />
      ) : null}
      {nfcReceive ? <NfcReceiveModal onReceived={onNfcReceived} onClose={() => setNfcReceive(false)} /> : null}
      {message ? <PopupDialog title={message.title} body={message.body} confirmLabel="OK" onConfirm={() => setMessage(null)} onCancel={() => setMessage(null)} /> : null}
    </AppScreen>
  );
}
