/**
 * The card library on a desktop window (v0.50.5, owner).
 *
 * "The same treatment that the campaign UI had in its conversion onto desktop needs to happen for the card creation
 * UI. It must be a good translation from the mobile UI to desktop, less pop-ups more proper menus, no functionality
 * lost."
 *
 * So it is the campaigns page's shape: the packs are a list down the left, and the pane beside it is the one you are
 * working in (a pack, or a card in it). What the phone asks in a chain of pop-ups is a menu here, opened where you
 * clicked: Add card is one menu with its classes in submenus, a card's right click holds everything a hold did, and a
 * pack's details are edited in place. Only a question that guards something you cannot get back still asks.
 */
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, DmRune, Rune } from '@/constants/theme';
import { ContextMenu, type MenuSpec } from '@/features/character-sheet/table/context-menu';
import { FORGED_H, FORGED_W } from '@/features/create/components/forged-card';
import { LibraryForgedCard } from '@/features/create/components/library-forged-card';
import type { Expansion, LibraryCard } from '@/lib/library';
import { sortExpansionCards } from '@/lib/expansion-sort';
import { playSfx } from '@/lib/sfx';

/** The list column; the page's sidebar (a picker, a question) opens past its divider. */
export const LIB_LIST_W = 380;

export type MenuAt = { x: number; y: number };

/** Where to open a menu for a control: under it, at its left edge. */
export const below = (el: unknown): MenuAt | null => {
  const r = (el as HTMLElement | null)?.getBoundingClientRect?.();
  return r ? { x: r.left, y: r.bottom + 2 } : null;
};

/**
 * A menu over the page: the table's menu (icons, submenus, the keys, a question asked inside it), in a layer over the
 * whole window. Escape shuts it before anything under it hears the key.
 */
export function PageMenu({ at, menu, onClose }: { at: MenuAt; menu: MenuSpec; onClose: () => void }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => { setSize({ w: window.innerWidth, h: window.innerHeight }); }, []);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close.current(); } };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, []);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div data-table-root="" style={{ position: 'fixed', inset: 0, zIndex: 20000 }}>
      {size.w ? <ContextMenu x={at.x} y={at.y} tableW={size.w} tableH={size.h} menu={menu} onClose={onClose} /> : null}
    </div>,
    document.body,
  );
}

/** A section's name on a hairline, as the campaigns list has it. */
function Head({ label }: { label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
      <Text style={{ color: DmRune.accent, fontSize: 11.5, fontFamily: Body.bold, letterSpacing: 1.6, textTransform: 'uppercase' }}>{label}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(218,162,73,0.25)' }} />
    </View>
  );
}

/** One row of the list: a pack, or a way in. Selected, it is lit; a right click opens its menu. */
function Row({ title, sub, selected, dim, right, onPress, onMenu, label }: {
  title: string; sub: string; selected?: boolean; dim?: boolean; right?: ReactNode; onPress: () => void; onMenu?: (at: MenuAt) => void; label: string;
}) {
  return (
    <div style={{ width: '100%' }} onContextMenu={onMenu ? (e) => { e.preventDefault(); onMenu({ x: e.clientX, y: e.clientY }); } : undefined}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!selected }} accessibilityLabel={label} style={{ width: '100%' }}>
        {({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => (
          <ChamferBox chamfer={10} fill={selected ? 'rgba(32,28,22,0.96)' : pressed || hovered ? 'rgba(20,24,31,0.95)' : 'rgba(14,17,22,0.86)'}
            stroke={selected ? Rune.goldBright : hovered ? 'rgba(218,162,73,0.7)' : 'rgba(218,162,73,0.4)'} strokeWidth={selected ? 1.6 : 1.1}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 }}>
            <View style={{ flex: 1, minWidth: 0, opacity: dim ? 0.55 : 1 }}>
              <Text numberOfLines={1} style={{ color: Rune.ivory, fontSize: 15.5, fontFamily: Display.black, letterSpacing: 0.5, textTransform: 'uppercase' }}>{title}</Text>
              <Text numberOfLines={1} style={{ color: Rune.goldText, fontSize: 11.5, fontFamily: Body.medium, marginTop: 3 }}>{sub}</Text>
            </View>
            {right}
          </ChamferBox>
        )}
      </Pressable>
    </div>
  );
}

export function LibraryList({ official, custom, selectedId, creating, isOn, countOf, toggle, onSelect, onMenu, onArchive, onNew, onImport }: {
  official: Expansion[];
  custom: Expansion[];
  selectedId: string | null;
  /** The new-expansion form is open in the pane. */
  creating: boolean;
  isOn: (e: Expansion) => boolean;
  countOf: (e: Expansion) => number;
  toggle: (e: Expansion) => ReactNode;
  onSelect: (e: Expansion) => void;
  onMenu: (e: Expansion, at: MenuAt) => void;
  onArchive: () => void;
  onNew: () => void;
  onImport: () => void;
}) {
  const sub = (e: Expansion) => `v${e.version} · ${countOf(e)} card${countOf(e) === 1 ? '' : 's'}${e.author ? ` · ${e.author}` : ''}`;
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
      <Row title="Card archive" sub="Every system card, weapon and armor" label="Browse the card archive" onPress={onArchive} />
      {official.length ? <Head label="Official expansions" /> : null}
      {official.map((e) => (
        <Row key={e.id} title={e.name} sub={sub(e)} label={`Open ${e.name}`} selected={e.id === selectedId} dim={!isOn(e)} right={toggle(e)} onPress={() => onSelect(e)} />
      ))}
      <Head label="My expansions" />
      {custom.length === 0 ? (
        <Text style={{ color: Rune.muted, fontSize: 13, fontFamily: Body.medium, lineHeight: 19 }}>No expansions yet. Make one to write homebrew cards, or import one a friend shared with you.</Text>
      ) : custom.map((e) => (
        <Row key={e.id} title={e.name} sub={sub(e)} label={`Open ${e.name}`} selected={e.id === selectedId} dim={!isOn(e)} right={toggle(e)} onPress={() => onSelect(e)} onMenu={(at) => onMenu(e, at)} />
      ))}
      <View style={{ gap: 10, marginTop: 6 }}>
        <Row title="New expansion" sub="Name it, then write its cards" label="New expansion" selected={creating} onPress={onNew} />
        <Row title="Import a file" sub="A .rune pack somebody sent you" label="Import a file" onPress={onImport} />
      </View>
    </ScrollView>
  );
}

function Field({ label, value, onChange, placeholder, maxLength, multiline, autoFocus, onSubmit }: { label: string; value: string; onChange: (s: string) => void; placeholder?: string; maxLength?: number; multiline?: boolean; autoFocus?: boolean; /** Enter in a one-line field. */ onSubmit?: () => void }) {
  return (
    <View style={{ gap: 5 }}>
      <Text style={{ color: Rune.bronze, fontSize: 10.5, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>{label}</Text>
      <ChamferBox chamfer={8} fill="rgba(14,17,22,0.96)" stroke="rgba(218,162,73,0.5)" strokeWidth={1.2} style={{ minHeight: multiline ? 72 : 44, justifyContent: 'center', paddingHorizontal: 13, paddingVertical: multiline ? 9 : 0 }}>
        <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={Rune.muted} selectionColor={Rune.goldBright} maxLength={maxLength} multiline={multiline} autoFocus={autoFocus} onSubmitEditing={multiline ? undefined : onSubmit}
          accessibilityLabel={label} style={{ color: Rune.sheet, fontSize: 15, fontFamily: Body.semibold, padding: 0, textAlignVertical: multiline ? 'top' : 'center' }} />
      </ChamferBox>
    </View>
  );
}

/**
 * A pack's name, author and description, written in place (the phone's Edit expansion and New expansion pop-ups).
 * The version is not typed: it moves when the pack is shared.
 */
export function MetaFields({ initial, onSave, onCancel }: { initial?: Expansion; onSave: (m: { name: string; author: string; description: string; version: number }) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [author, setAuthor] = useState(initial?.author ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const version = initial?.version ?? 1;
  const save = () => { if (name.trim()) onSave({ name: name.trim(), author: author.trim(), description: description.trim(), version }); };
  return (
    // Enter saves from a one-line field; in the description it starts a new line.
    <View style={{ gap: 14, maxWidth: 640 }}>
      <Field label="Name" value={name} onChange={setName} placeholder="My homebrew" maxLength={32} autoFocus onSubmit={save} />
      <View style={{ flexDirection: 'row', gap: 14 }}>
        <View style={{ flex: 1 }}><Field label="Author" value={author} onChange={setAuthor} placeholder="You" onSubmit={save} /></View>
        <View style={{ width: 150, gap: 5 }}>
          <Text style={{ color: Rune.bronze, fontSize: 10.5, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>Version</Text>
          <Text style={{ color: Rune.sheet, fontSize: 20, fontFamily: Body.bold, marginTop: 8 }}>{version}</Text>
        </View>
      </View>
      <Field label="Description" value={description} onChange={setDescription} placeholder="What's inside" multiline />
      <Text style={{ color: Rune.muted, fontSize: 12, fontFamily: Body.regular, lineHeight: 17 }}>The version goes up each time you share the pack, so anyone who already has it updates in place. Read it out when a player asks which version they are on.</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <RuneButton dm label="Cancel" kind="ghost" height={42} style={{ width: 150 }} onPress={onCancel} />
        <RuneButton dm label={initial ? 'Save' : 'Create expansion'} kind="primary" height={42} style={{ minWidth: 200 }} disabled={!name.trim()} onPress={save} />
      </View>
    </View>
  );
}

const TILE_W = 176;
const TILE_H = (TILE_W * FORGED_H) / FORGED_W;

/** One card in the grid, drawn as itself. A click edits it; Ctrl, Shift or a selection in progress picks it instead. */
function Tile({ card, pack, selected, dim, onOpen, onPick, onMenu }: { card: LibraryCard; pack: LibraryCard[]; selected: boolean; dim: boolean; onOpen: () => void; onPick: () => void; onMenu: (at: MenuAt) => void }) {
  const picking = useRef(false);
  const k = TILE_W / FORGED_W;
  return (
    <div onPointerDown={(e) => { picking.current = e.ctrlKey || e.metaKey || e.shiftKey; }} onContextMenu={(e) => { e.preventDefault(); onMenu({ x: e.clientX, y: e.clientY }); }}>
      <Pressable onPress={() => { playSfx('buttonTap'); if (picking.current) onPick(); else onOpen(); picking.current = false; }} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={card.title || 'Untitled card'}>
        {({ hovered }: { hovered?: boolean }) => (
          <View style={{ width: TILE_W, height: TILE_H, opacity: dim && !selected ? 0.5 : 1, transform: [{ translateY: hovered ? -4 : 0 }] }}>
            <View style={{ width: TILE_W, height: TILE_H, overflow: 'hidden' }}>
              <View style={{ width: FORGED_W, height: FORGED_H, transform: [{ scale: k }], transformOrigin: 'top left' }} pointerEvents="none">
                <LibraryForgedCard card={card} pack={pack} />
              </View>
            </View>
            {selected || hovered ? <View pointerEvents="none" style={{ position: 'absolute', top: -3, left: -3, right: -3, bottom: -3, borderWidth: 2, borderColor: selected ? Rune.red : Rune.goldBright }} /> : null}
          </View>
        )}
      </Pressable>
    </div>
  );
}

/**
 * A pack's cards, every one of them, in a grid as wide as the pane (no pages). The phone's hold-to-select is Ctrl or
 * Shift and a click here, and what a selection can do sits in a bar over the grid.
 */
export function DeskGallery({ cards, selected, onSelect, onEdit, onMenu, onShare, onMove, onDelete }: {
  cards: LibraryCard[];
  selected: Set<string>;
  onSelect: (next: Set<string>) => void;
  onEdit: (c: LibraryCard) => void;
  onMenu: (c: LibraryCard, at: MenuAt) => void;
  onShare: (cs: LibraryCard[]) => void;
  /** Move or copy: opens its menu under the button. */
  onMove: (cs: LibraryCard[], at: MenuAt) => void;
  onDelete: (cs: LibraryCard[]) => void;
}) {
  const picked = cards.filter((c) => selected.has(c.id));
  const moveRef = useRef<View>(null);
  const toggle = (id: string) => { const n = new Set(selected); if (n.has(id)) n.delete(id); else n.add(id); onSelect(n); };
  return (
    <View style={{ gap: 14 }}>
      {picked.length ? (
        <ChamferBox chamfer={8} fill="rgba(20,24,31,0.96)" stroke={DmRune.line} strokeWidth={1.2} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 9 }}>
          <Text style={{ flex: 1, color: Rune.ivory, fontSize: 13, fontFamily: Body.bold }}>{picked.length === 1 ? '1 card' : `${picked.length} cards`} selected</Text>
          <RuneButton dm label="Share" kind="ghost" dense height={34} onPress={() => onShare(picked)} />
          <View ref={moveRef}><RuneButton dm label="Move or copy" kind="ghost" dense height={34} onPress={() => { const at = below(moveRef.current); if (at) onMove(picked, at); }} /></View>
          <RuneButton dm label="Delete" kind="danger" dense height={34} onPress={() => onDelete(picked)} />
          <RuneButton dm label="Clear" kind="ghost" dense height={34} onPress={() => onSelect(new Set())} />
        </ChamferBox>
      ) : null}
      {cards.length === 0 ? (
        <Text style={{ color: Rune.muted, fontSize: 14, fontFamily: Body.medium, lineHeight: 21 }}>Nothing in this expansion yet. Add your first card and it appears here, drawn as it will be played.</Text>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
          {sortExpansionCards(cards).map((c) => (
            <Tile key={c.id} card={c} pack={cards} selected={selected.has(c.id)} dim={selected.size > 0}
              onOpen={() => (selected.size ? toggle(c.id) : onEdit(c))} onPick={() => toggle(c.id)} onMenu={(at) => onMenu(c, at)} />
          ))}
        </View>
      )}
      {cards.length ? <Text style={{ color: Rune.muted, fontSize: 12, fontFamily: Body.medium }}>Click a card to edit it. Ctrl or Shift and a click selects several; right click a card for everything else.</Text> : null}
    </View>
  );
}
