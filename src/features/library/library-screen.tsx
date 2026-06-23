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
import Svg, { Line, Path } from 'react-native-svg';

import { AppScreen } from '@/components/app-screen';
import { ChamferBox } from '@/components/chamfer-box';
import { LoadingScreen } from '@/components/loading-screen';
import { PopupDialog } from '@/components/popup-dialog';
import { RuneButton } from '@/components/rune-button';
import { CardEditor, type CardDraft } from '@/components/card-editor';
import { Body, Display, Rune } from '@/constants/theme';
import { DOMAINS } from '@/constants/identity';
import { playSfx } from '@/lib/sfx';
import {
  CONTENT_TYPE_LABEL,
  type Expansion,
  type LibraryCard,
  type LibraryContentType,
  expansionSummary,
  mergeDecision,
} from '@/lib/library';
import { deleteExpansion, exportRkp, getExpansion, importExpansionRkp, listExpansions, saveExpansion } from '@/lib/library-store';
import { nfcModulesPresent } from '@/lib/nfc';
import type { RkpContent } from '@/lib/rkp';
import { NfcReceiveModal, NfcSendModal } from '@/features/share/nfc-modal';

const newId = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const CONTENT_TYPES: LibraryContentType[] = ['ancestry', 'community', 'domain', 'subclass', 'class', 'generic'];

/** Type the content-config block writes (the non-visual parts of a LibraryCard). */
interface CardConfig {
  contentType: LibraryContentType;
  domain?: string;
  level?: number;
  className?: string;
  ancestryEffectTrait?: 1 | 2;
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

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}>
      <View style={{ paddingHorizontal: 11, paddingVertical: 7, borderRadius: 5, backgroundColor: on ? Rune.red : 'rgba(20,24,31,0.7)', borderWidth: 1, borderColor: on ? 'transparent' : 'rgba(218,162,73,0.4)' }}>
        <Text style={{ color: on ? Rune.ivory : Rune.sheet, fontSize: 12.5, fontFamily: Body.bold }}>{label}</Text>
      </View>
    </Pressable>
  );
}

/** The content-type + per-type fields shown inside the card editor (its `extraField`). */
function ContentConfig({ config, onChange }: { config: CardConfig; onChange: (c: CardConfig) => void }) {
  const set = (patch: Partial<CardConfig>) => onChange({ ...config, ...patch });
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: Rune.bronze, fontSize: 10, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' }}>Content type</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {CONTENT_TYPES.map((t) => (
          <Chip key={t} label={CONTENT_TYPE_LABEL[t]} on={config.contentType === t} onPress={() => { playSfx('buttonTap'); set({ contentType: t }); }} />
        ))}
      </View>
      {config.contentType === 'domain' ? (
        <>
          <LibInput label="Domain" value={config.domain ?? ''} onChangeText={(domain) => set({ domain })} placeholder="e.g. Pyre (custom) or arcana" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
            {DOMAINS.map((d) => <Chip key={d} label={d} on={config.domain === d} onPress={() => set({ domain: d })} />)}
          </View>
          <LibInput label="Level (1–10)" value={config.level ? String(config.level) : ''} onChangeText={(s) => set({ level: Math.max(1, Math.min(10, parseInt(s || '1', 10) || 1)) })} placeholder="1" keyboardType="number-pad" />
        </>
      ) : null}
      {config.contentType === 'subclass' || config.contentType === 'class' ? (
        <LibInput label="Class" value={config.className ?? ''} onChangeText={(className) => set({ className })} placeholder="e.g. Warden (custom) or guardian" />
      ) : null}
      {config.contentType === 'ancestry' ? (
        <View style={{ gap: 4 }}>
          <Text style={{ color: Rune.bronze, fontSize: 10, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' }}>Passive on feature line</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Chip label="Line 1" on={config.ancestryEffectTrait === 1} onPress={() => set({ ancestryEffectTrait: 1 })} />
            <Chip label="Line 2" on={config.ancestryEffectTrait === 2} onPress={() => set({ ancestryEffectTrait: 2 })} />
          </View>
          <Text style={{ color: Rune.muted, fontSize: 9.5, fontFamily: Body.regular }}>Which line stays active when mixed with another ancestry.</Text>
        </View>
      ) : null}
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
      <Pressable style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(6,8,13,0.9)' }} onPress={onCancel} accessibilityRole="button" accessibilityLabel="Close" />
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
  const [metaForm, setMetaForm] = useState<'new' | 'edit' | null>(null);
  const [confirmDeleteExp, setConfirmDeleteExp] = useState<Expansion | null>(null);
  const [confirmDeleteCard, setConfirmDeleteCard] = useState<number | null>(null);
  const [message, setMessage] = useState<{ title: string; body: string } | null>(null);
  const [nfcSend, setNfcSend] = useState<{ content: RkpContent; label: string } | null>(null);
  const [nfcReceive, setNfcReceive] = useState(false);
  const nfcOn = nfcModulesPresent();

  const reload = useCallback(() => {
    let live = true;
    listExpansions().then((all) => { if (live) setExpansions(all); });
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
      if (content.kind === 'expansion') {
        const incoming = content.payload;
        const existing = (await getExpansion(incoming.id)) ?? undefined;
        const decision = mergeDecision(existing, incoming);
        if (decision === 'skip') { setMessage({ title: incoming.name, body: 'You already have a newer version — skipped.' }); return; }
        await saveExpansion(incoming);
        reload();
        setMessage({ title: incoming.name, body: decision === 'update' ? 'Expansion updated to the received version.' : 'Expansion received.' });
      } else if (content.kind === 'card') {
        // a single received card lands in a shared "Received cards" expansion in the library
        const id = 'exp-received';
        const exp = (await getExpansion(id)) ?? { id, name: 'Received cards', author: '', description: 'Cards received over NFC or file.', version: 1, createdAt: new Date().toISOString(), cards: [] };
        await saveExpansion({ ...exp, cards: [...exp.cards, content.payload] });
        reload();
        setMessage({ title: content.payload.title || 'Card', body: 'Added to your "Received cards" expansion.' });
      } else {
        setMessage({ title: 'That was a character', body: 'Receive heroes from the Characters screen instead.' });
      }
    } catch (e) {
      setMessage({ title: 'Receive failed', body: e instanceof Error ? e.message : 'Could not read that.' });
    }
  }, [reload]);

  if (!expansions) return <LoadingScreen label="Opening the library" />;

  // ---- card editor overlay (author/edit a card inside the selected expansion) ----
  if (editingCard && selected) {
    const existing = typeof editingCard.index === 'number' ? selected.cards[editingCard.index] : undefined;
    const initial: CardDraft | undefined = existing
      ? { title: existing.title, text: existing.text, imageUri: existing.imageUri, color: existing.color ?? null, effects: existing.effects ?? [], typeLabel: existing.typeLabel }
      : undefined;
    return (
      <CardEditor
        kindLabel={CONTENT_TYPE_LABEL[editingCard.config.contentType]}
        initial={initial}
        extraField={<ContentConfig config={editingCard.config} onChange={(config) => setEditingCard((s) => (s ? { ...s, config } : s))} />}
        onCancel={() => setEditingCard(null)}
        onSave={(d) => {
          const cfg = editingCard.config;
          const cards = [...selected.cards];
          const base: LibraryCard = {
            id: existing?.id ?? newId('lc'),
            contentType: cfg.contentType,
            title: d.title,
            text: d.text,
            imageUri: d.imageUri,
            color: d.color,
            effects: d.effects,
            typeLabel: d.typeLabel,
            domain: cfg.contentType === 'domain' ? cfg.domain : undefined,
            level: cfg.contentType === 'domain' ? cfg.level ?? 1 : undefined,
            className: cfg.contentType === 'subclass' || cfg.contentType === 'class' ? cfg.className : undefined,
            ancestryEffectTrait: cfg.contentType === 'ancestry' ? cfg.ancestryEffectTrait : undefined,
          };
          if (typeof editingCard.index === 'number') cards[editingCard.index] = base;
          else cards.push(base);
          void persist({ ...selected, cards });
          setEditingCard(null);
        }}
      />
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
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <RuneButton label="Edit info" kind="ghost" dense height={34} style={{ flex: 1 }} onPress={() => setMetaForm('edit')} />
              <RuneButton label="Share" kind="ghost" dense height={34} style={{ flex: 1 }} onPress={() => { playSfx('buttonTap'); void exportRkp({ kind: 'expansion', payload: selected }, selected.name); }} />
              {nfcOn ? <RuneButton label="NFC" kind="ghost" dense height={34} style={{ flex: 1 }} onPress={() => { playSfx('buttonTap'); setNfcSend({ content: { kind: 'expansion', payload: selected }, label: selected.name }); }} /> : null}
            </View>
          </ChamferBox>

          {selected.cards.length === 0 ? (
            <Text style={{ color: Rune.muted, fontSize: 12.5, fontFamily: Body.medium, textAlign: 'center', paddingVertical: 18 }}>No cards yet. Add your first homebrew card.</Text>
          ) : (
            selected.cards.map((c, i) => (
              <Pressable key={c.id} onPress={() => setEditingCard({ index: i, config: { contentType: c.contentType, domain: c.domain, level: c.level, className: c.className, ancestryEffectTrait: c.ancestryEffectTrait } })} accessibilityRole="button" accessibilityLabel={`Edit ${c.title || 'card'}`}>
                {({ pressed }) => (
                  <ChamferBox chamfer={8} fill={pressed ? 'rgba(20,24,31,0.95)' : 'rgba(14,17,22,0.86)'} stroke="rgba(218,162,73,0.4)" strokeWidth={1.1} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 11 }}>
                    <View style={{ width: 10, height: 10, backgroundColor: c.color ?? Rune.bronze, transform: [{ rotate: '45deg' }] }} />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ color: Rune.ivory, fontSize: 15, fontFamily: Body.bold }}>{c.title || 'Untitled'}</Text>
                      <Text style={{ color: Rune.goldText, fontSize: 10.5, fontFamily: Body.medium, letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 2 }}>{cardSummary(c)}</Text>
                    </View>
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
          <RuneButton label="Add card" kind="primary" height={46} style={{ flex: 1.4 }} onPress={() => setEditingCard({ index: 'new', config: { contentType: 'generic', ancestryEffectTrait: 1, level: 1 } })} />
        </View>

        {metaForm === 'edit' ? (
          <MetaForm initial={selected} onCancel={() => setMetaForm(null)} onSave={(m) => { void persist({ ...selected, ...m }); setMetaForm(null); }} />
        ) : null}
        {confirmDeleteCard != null ? (
          <PopupDialog title="Delete card?" body={`"${selected.cards[confirmDeleteCard]?.title || 'Untitled'}" will be removed from this expansion.`} confirmLabel="Delete" destructive
            onConfirm={() => { const cards = selected.cards.filter((_, j) => j !== confirmDeleteCard); void persist({ ...selected, cards }); setConfirmDeleteCard(null); }}
            onCancel={() => setConfirmDeleteCard(null)} />
        ) : null}
        {confirmDeleteExp ? (
          <PopupDialog title="Delete expansion?" body={`${confirmDeleteExp.name} and its ${confirmDeleteExp.cards.length} card(s) will be removed from this device. Exported .rkp files are unaffected.`} confirmLabel="Delete" destructive
            onConfirm={() => { const id = confirmDeleteExp.id; setConfirmDeleteExp(null); setSelectedId(null); void deleteExpansion(id).then(reload); }}
            onCancel={() => setConfirmDeleteExp(null)} />
        ) : null}
        {nfcSend ? <NfcSendModal content={nfcSend.content} label={nfcSend.label} onClose={() => setNfcSend(null)} /> : null}
        {message ? <PopupDialog title={message.title} body={message.body} confirmLabel="OK" onConfirm={() => setMessage(null)} onCancel={() => setMessage(null)} /> : null}
      </AppScreen>
    );
  }

  // ---- hub ----
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

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <Text style={{ color: Rune.goldText, fontSize: 12, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>My expansions</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(218,162,73,0.25)' }} />
        </View>

        {expansions.length === 0 ? (
          <Text style={{ color: Rune.muted, fontSize: 12.5, fontFamily: Body.medium, textAlign: 'center', paddingVertical: 14, lineHeight: 18 }}>
            No expansions yet. Create one to author homebrew cards,{'\n'}or import a friend&apos;s .rkp.
          </Text>
        ) : (
          expansions.map((e) => {
            const s = expansionSummary(e);
            return (
              <Pressable key={e.id} onPress={() => setSelectedId(e.id)} accessibilityRole="button" accessibilityLabel={`Open ${e.name}`}>
                {({ pressed }) => (
                  <ChamferBox chamfer={10} fill={pressed ? 'rgba(20,24,31,0.95)' : 'rgba(14,17,22,0.86)'} stroke="rgba(218,162,73,0.4)" strokeWidth={1.1} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 13, paddingVertical: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ color: Rune.ivory, fontSize: 16, fontFamily: Display.black, letterSpacing: 0.5, textTransform: 'uppercase' }}>{e.name}</Text>
                      <Text style={{ color: Rune.goldText, fontSize: 11, fontFamily: Body.medium, letterSpacing: 0.3, marginTop: 3 }}>v{e.version} · {s.cardCount} card{s.cardCount === 1 ? '' : 's'}{e.author ? ` · ${e.author}` : ''}</Text>
                    </View>
                    <Svg width={13} height={13} viewBox="0 0 16 16"><Line x1={4} y1={2} x2={12} y2={8} stroke={Rune.goldEdge} strokeWidth={2} /><Line x1={12} y1={8} x2={4} y2={14} stroke={Rune.goldEdge} strokeWidth={2} /></Svg>
                  </ChamferBox>
                )}
              </Pressable>
            );
          })
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
