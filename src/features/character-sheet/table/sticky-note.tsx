/**
 * Sticky notes on the desktop table (v0.49.0, owner): on a character's table and on the DM screen's alike. A note is
 * a board card with a square face and writing on it, so physics, breaking, scraps and burning are the cards' own.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Text, View } from 'react-native';

import { NotePaperTint } from '@/constants/table-tints';
import { Body, Rune } from '@/constants/theme';
import { FORGED_H } from '@/features/create/components/forged-card';
import { fitText } from '@/lib/fit-text';
import { isNoteId, NOTE_PAPERS, NOTE_SIZE, NOTE_TEXT_MAX, type NotePaper, type TableNote } from '@/lib/table-notes';
import { loadNotes, saveNotes } from '@/lib/table-notes-store';
import type { TableCard } from './desk-carousel';
import { cue } from './table-sound';
import { chamferClip, T, TButton } from './table-ui';

/** A board card's own height at its natural 230 width: a note is square, a card is a card. */
export const naturalH = (id: string): number => (isNoteId(id) ? NOTE_SIZE : FORGED_H);

const PAD = 17, GLUE = 30;

function NoteFace({ note }: { note: TableNote }) {
  const tint = NotePaperTint[note.paper];
  const text = note.text.trim();
  const box = { width: NOTE_SIZE - PAD * 2, height: NOTE_SIZE - GLUE - PAD - 6 };
  const fit = fitText(text || 'Click to write', { ...box, base: 30, lineRatio: 1.2, min: 8.5 });
  return (
    <View style={{ width: NOTE_SIZE, height: NOTE_SIZE, backgroundColor: tint.paper, overflow: 'hidden' }} pointerEvents="none">
      <View style={{ height: GLUE - 8, backgroundColor: tint.glue }} />
      <View style={{ flex: 1, paddingHorizontal: PAD, paddingTop: 10, overflow: 'hidden' }}>
        <Text style={{ color: text ? Rune.inkText : Rune.inkMuted, fontSize: fit.fontSize, lineHeight: fit.lineHeight, fontFamily: Body.medium }}>{text || 'Click to write'}</Text>
      </View>
    </View>
  );
}

export const noteCard = (note: TableNote): TableCard => ({ id: note.id, h: NOTE_SIZE, custom: <NoteFace note={note} /> });

/**
 * One table's notes. Every change shows at once and is written a moment later (a drag changes one sixty times a
 * second); what is waiting is written when the table goes away or the page does.
 */
export function useTableNotes(owner: string) {
  const [state, setState] = useState(() => ({ owner, list: loadNotes(owner) }));
  // Another table: its own notes from the first frame, never the last one's.
  const list = state.owner === owner ? state.list : loadNotes(owner);
  const now = useRef(list);
  now.current = list;
  const pending = useRef<{ owner: string; list: TableNote[]; timer: ReturnType<typeof setTimeout> } | null>(null);
  const flush = useCallback(() => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    clearTimeout(p.timer);
    saveNotes(p.owner, p.list);
  }, []);
  const set = useCallback((next: TableNote[]) => {
    now.current = next;
    setState({ owner, list: next });
    if (pending.current) {
      if (pending.current.owner === owner) clearTimeout(pending.current.timer);
      else flush();
    }
    pending.current = { owner, list: next, timer: setTimeout(flush, 300) };
  }, [owner, flush]);
  useEffect(() => {
    setState((s) => (s.owner === owner ? s : { owner, list: loadNotes(owner) }));
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('pagehide', flush); flush(); };
  }, [owner, flush]);
  return { list, now, set };
}

/** A note open for writing. It saves as it is typed; Escape, Done or a click outside puts it down. */
export function NoteEditor({ note, onEdit, onClose }: { note: TableNote; onEdit: (patch: Partial<Omit<TableNote, 'id'>>) => void; onClose: () => void }) {
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = area.current;
    el?.focus();
    el?.setSelectionRange(el.value.length, el.value.length);
  }, []);
  const tint = NotePaperTint[note.paper];
  const side = Math.min(440, window.innerWidth - 48, window.innerHeight - 140);
  return createPortal(
    <div data-ui="" role="dialog" aria-label="Sticky note" onPointerDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => {
        // The table's and the sheet's own keys never see what is typed here.
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      }}
      style={{ position: 'fixed', inset: 0, zIndex: 5000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, background: 'rgba(6,8,13,0.6)' }}>
      <div style={{ width: side, height: side, display: 'flex', flexDirection: 'column', background: tint.paper, boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }}>
        <div style={{ height: 38, flexShrink: 0, background: tint.glue }} />
        <textarea ref={area} value={note.text} maxLength={NOTE_TEXT_MAX} aria-label="What the note says" placeholder="Write on it"
          onChange={(e) => onEdit({ text: e.target.value })}
          style={{ flex: 1, minHeight: 0, resize: 'none', border: 0, outline: 'none', background: 'transparent', padding: '20px 28px 24px', boxSizing: 'border-box', color: Rune.inkText, caretColor: Rune.red, fontFamily: T.medium, fontSize: 22, lineHeight: 1.35 }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 10, width: Math.max(side, 360) }}>
        <div role="radiogroup" aria-label="Paper" style={{ display: 'flex', gap: 6 }}>
          {NOTE_PAPERS.map((p: NotePaper) => (
            <button key={p} type="button" role="radio" aria-checked={p === note.paper} aria-label={`${p} paper`} onClick={() => { cue('ui:toggle', 'cardSelect', { volume: 0.4 }); onEdit({ paper: p }); }}
              style={{ all: 'unset', cursor: 'pointer', width: 30, height: 30, padding: 2, boxSizing: 'border-box', clipPath: chamferClip(6), background: p === note.paper ? T.red : T.goldSoft }}>
              <span style={{ display: 'block', height: '100%', clipPath: chamferClip(5), background: NotePaperTint[p].paper }} />
            </button>
          ))}
        </div>
        <TButton label={note.phys ? 'Pin' : 'Unpin'} title={note.phys ? 'Dice will pass it by and cannot tear it' : 'Dice can knock it about and tear it again'} onPress={() => { cue('card:physical', 'cardSelect', { volume: 0.6 }); onEdit(note.phys ? { phys: false, rot: 0 } : { phys: true }); }} />
        <TButton label="Done" primary onPress={onClose} />
      </div>
    </div>,
    document.body,
  );
}
