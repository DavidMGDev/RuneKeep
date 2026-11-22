/**
 * Moving a card on desktop (v0.50.0, owner: "it should blur the entire screen and give me the options with bigger
 * controls"). The card on one side, every deck as a tile on the other, and a number key for each.
 */
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { ChamferBox } from '@/components/chamfer-box';
import { DeskDialog } from '@/components/desk-dialog';
import { Body, Display, Rune } from '@/constants/theme';
import { FORGED_H, FORGED_W } from '@/features/create/components/forged-card';
import { playSfx } from '@/lib/sfx';

import type { CardItem } from '../card-data';
import { CardFace } from '../table/desk-carousel';

/** A card at any width, whichever way it is drawn. */
export function DeskCardPic({ card, width }: { card: CardItem; width: number }) {
  const k = width / FORGED_W;
  const custom = card.live && !card.faces ? <View style={{ width: FORGED_W, height: FORGED_H }}>{card.live}</View> : undefined;
  return (
    <View pointerEvents="none" style={{ width, height: FORGED_H * k, overflow: 'hidden', backgroundColor: Rune.ink }}>
      <View style={{ position: 'absolute', left: (width - FORGED_W) / 2, top: (FORGED_H * k - FORGED_H) / 2, width: FORGED_W, height: FORGED_H, transform: [{ scale: k }] }}>
        <CardFace card={{ id: card.id, thumb: card.thumb, source: card.source, faces: card.faces, custom }} hiRes />
      </View>
    </View>
  );
}

export interface MoveDeck {
  key: string;
  label: string;
  count: number;
  glyph: ReactNode;
  /** Every card being moved is in it already. */
  here: boolean;
}

export function DeskMoveDialog({ cards, count, decks, onMove, onCopy, onClose }: {
  cards: CardItem[];
  count: number;
  decks: MoveDeck[];
  onMove: (key: string) => void;
  onCopy?: (key: string) => void;
  onClose: () => void;
}) {
  const win = useWindowDimensions();
  const [copy, setCopy] = useState(false);
  const copying = copy && !!onCopy;
  const width = Math.min(1040, win.width - 56);
  const pic = win.height < 760 ? 188 : 232;
  // The tiles share what the card leaves them, three across.
  const tileW = Math.floor((width - 56 - pic - 34 - 24) / 3) - 1;
  const it = count > 1 ? 'They' : 'It';
  const choose = (key: string) => { playSfx('cardDragEnd'); if (copying) onCopy!(key); else onMove(key); };

  const body = useRef<View>(null);
  const chooseRef = useRef(choose);
  chooseRef.current = choose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = body.current as unknown as HTMLElement | null;
      if (!el || el.closest('[inert]') || e.ctrlKey || e.metaKey || e.altKey || !/^[1-9]$/.test(e.key)) return;
      const deck = decks[+e.key - 1];
      if (!deck) return;
      e.preventDefault();
      e.stopPropagation();
      chooseRef.current(deck.key);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [decks]);

  return (
    <DeskDialog title={`${copying ? 'Copy' : 'Move'} ${count === 1 ? 'card' : `${count} cards`}`} width={width} onClose={onClose}
      subtitle={copying ? `The ${count > 1 ? 'copies go' : 'copy goes'} to the end of the deck you pick` : `${it} ${count > 1 ? 'go' : 'goes'} to the front of the deck you pick`}>
      <View ref={body} style={{ flexDirection: 'row', gap: 34, padding: 28, flexShrink: 1, minHeight: 0 }}>
        <View style={{ width: pic, gap: 14 }}>
          {cards[0] ? <DeskCardPic card={cards[0]} width={pic} /> : null}
          {count > 1 ? <Text style={{ color: Rune.goldText, fontSize: 13.5, fontFamily: Body.bold, textAlign: 'center' }}>{`and ${count - 1} more`}</Text> : null}
          {onCopy ? (
            <View accessibilityRole="radiogroup" accessibilityLabel="Move or copy" style={{ flexDirection: 'row', gap: 8 }}>
              {([['Move', false], ['Copy', true]] as const).map(([label, value]) => {
                const on = copy === value;
                return (
                  <Pressable key={label} style={{ flex: 1 }} onPress={() => { playSfx('cardSelect', { volume: 0.5 }); setCopy(value); }} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={label}>
                    {({ hovered }: { hovered?: boolean }) => (
                      <ChamferBox chamfer={8} fill={on ? Rune.red : hovered ? 'rgba(224,181,99,0.1)' : 'transparent'} stroke={on ? Rune.red : Rune.goldEdge} strokeWidth={1.3} style={{ height: 46, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: on ? Rune.ivory : Rune.goldText, fontSize: 13.5, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>{label}</Text>
                      </ChamferBox>
                    )}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {decks.map((d, i) => (
            <Pressable key={d.key} onPress={() => choose(d.key)} accessibilityRole="button" accessibilityLabel={`${copying ? 'Copy' : 'Move'} to ${d.label}`}>
              {({ hovered }: { hovered?: boolean }) => (
                <ChamferBox chamfer={11} fill={hovered ? 'rgba(224,181,99,0.12)' : 'rgba(20,24,31,0.7)'} stroke={hovered ? Rune.goldBright : 'rgba(218,162,73,0.42)'} strokeWidth={hovered ? 1.7 : 1.2}
                  style={{ width: tileW, height: 136, padding: 12, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <View style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>{d.glyph}</View>
                  <Text numberOfLines={1} style={{ color: Rune.ivory, fontSize: 15.5, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.4 }}>{d.label}</Text>
                  <Text numberOfLines={1} style={{ color: d.here ? Rune.goldText : Rune.muted, fontSize: 12.5, fontFamily: Body.medium }}>
                    {d.here ? `${it === 'It' ? 'It is' : 'They are'} here now` : `${d.count} card${d.count === 1 ? '' : 's'}`}
                  </Text>
                  {i < 9 ? <Text style={{ position: 'absolute', left: 12, top: 9, color: Rune.muted, fontSize: 12.5, fontFamily: Body.bold }}>{i + 1}</Text> : null}
                </ChamferBox>
              )}
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </DeskDialog>
  );
}
