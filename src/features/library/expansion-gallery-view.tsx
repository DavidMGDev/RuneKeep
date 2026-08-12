/**
 * An expansion's cards, AS CARDS (v0.42.3, owner).
 *
 * "I want each card to be visible and rendered as cards not as fucking list items in separate
 * categories, I want cards, RENDERED CARDS as they look like in game, paginated to however many can
 * fit on a grid on my screen as a gallery where I can move through the pages of all the cards I have
 * created and tap them to edit the cards depending on their type, hold to select multiple cards and
 * even share / move from that selection mode."
 *
 * Two decisions carry the whole thing:
 *
 *  - Each tile is the REAL forged card, scaled down. Not a thumbnail, not an approximation: the same
 *    component the sheet draws, so recognising a card is looking at it. It is drawn at its natural
 *    412-space size and scaled, which is what keeps its type at the right relative size.
 *  - The grid comes from the MEASURED box (`lib/expansion-gallery`), because the app runs in a phone
 *    frame, a magnified tablet frame and a resizable browser window, and a fixed column count is
 *    wrong in two of the three.
 *
 * The selection rules are `features/character-sheet/gallery-select`, unchanged: tap picks one, hold
 * starts selecting, and deselecting the last card leaves select mode so the footer can never take its
 * own way out away.
 */
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, DmRune, Gap, Rune } from '@/constants/theme';
import { clearSelection, type GallerySelection, holdTile, NO_SELECTION, tapTile } from '@/features/character-sheet/gallery-select';
import { FORGED_H, FORGED_W } from '@/features/create/components/forged-card';
import { LibraryForgedCard } from '@/features/create/components/library-forged-card';
import { clampPage, galleryPages, gridFor, selectionLabel } from '@/lib/expansion-gallery';
import type { LibraryCard } from '@/lib/library';
import { playSfx } from '@/lib/sfx';

export interface GalleryActions {
  onEdit: (card: LibraryCard) => void;
  onShare: (cards: LibraryCard[]) => void;
  onMove: (cards: LibraryCard[]) => void;
  onDelete: (cards: LibraryCard[]) => void;
}

/** One card, drawn at its real size and scaled into its tile. */
function Tile({ card, w, h, selected, dim, onPress, onHold }: {
  card: LibraryCard;
  w: number;
  h: number;
  selected: boolean;
  /** True while something else is selected: the unpicked cards step back rather than compete. */
  dim: boolean;
  onPress: () => void;
  onHold: () => void;
}) {
  const scale = w / FORGED_W;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onHold}
      delayLongPress={340}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={card.title || 'Untitled card'}
      style={({ pressed }) => ({ width: w, height: h, opacity: pressed ? 0.75 : dim && !selected ? 0.45 : 1 })}>
      <View style={{ width: w, height: h, overflow: 'hidden' }}>
        {/* The card at its own size, scaled from its top-left corner into the tile. */}
        <View style={{ width: FORGED_W, height: FORGED_H, transform: [{ scale }], transformOrigin: 'top left' }} pointerEvents="none">
          <LibraryForgedCard card={card} />
        </View>
      </View>
      {/* Selection is an OUTLINE, which is what selection looks like everywhere else in this app. */}
      {selected ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: -2, left: -2, right: -2, bottom: -2, borderWidth: 2, borderColor: Rune.red }} />
      ) : null}
    </Pressable>
  );
}

export function ExpansionGallery({ cards, dm, actions }: { cards: LibraryCard[]; dm?: boolean; actions: GalleryActions }) {
  const P = dm ? { text: DmRune.ivory, muted: DmRune.muted, accent: DmRune.accent } : { text: Rune.ivory, muted: Rune.muted, accent: Rune.goldText };
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState<GallerySelection>(NO_SELECTION);

  const grid = useMemo(() => gridFor(box.width, box.height), [box.width, box.height]);
  const pages = useMemo(() => galleryPages(cards, grid.perPage), [cards, grid.perPage]);
  const at = clampPage(page, pages.length);
  const shown = pages[at] ?? [];
  const picked = cards.filter((c) => sel.selected.has(c.id));

  const act = (fn: (c: LibraryCard[]) => void) => { fn(picked); setSel(NO_SELECTION); };

  return (
    <View style={{ flex: 1, gap: Gap.intra }}>
      <View style={{ flex: 1 }} onLayout={(e) => setBox({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
        {cards.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
            <Text style={{ color: P.muted, fontSize: 12.5, fontFamily: Body.medium, textAlign: 'center', lineHeight: 18 }}>
              Nothing in this expansion yet.{'\n'}Add your first card and it appears here, drawn as it will be played.
            </Text>
          </View>
        ) : box.width > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {shown.map((c) => (
              <Tile
                key={c.id}
                card={c}
                w={grid.tileW}
                h={grid.tileH}
                selected={sel.selected.has(c.id)}
                dim={sel.selecting}
                onPress={() => {
                  playSfx('buttonTap');
                  const next = tapTile(sel, c.id);
                  setSel(next);
                  // Tap outside select mode OPENS the card. `focusId` is the module's word for the one
                  // card a tap singles out, and here singling one out is editing it.
                  if (!sel.selecting) actions.onEdit(c);
                }}
                onHold={() => { playSfx('cardSelect'); setSel(holdTile(sel, c.id)); }}
              />
            ))}
          </View>
        ) : null}
      </View>

      {/* The pager. Only when there is more than one page, so a small pack has no chrome at all. */}
      {pages.length > 1 && !sel.selecting ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
          <RuneButton dm={dm} label="Back" kind="ghost" dense height={32} style={{ width: 84 }} onPress={() => setPage(Math.max(0, at - 1))} />
          <Text style={{ color: P.accent, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.8 }}>{at + 1} / {pages.length}</Text>
          <RuneButton dm={dm} label="Next" kind="ghost" dense height={32} style={{ width: 84 }} onPress={() => setPage(Math.min(pages.length - 1, at + 1))} />
        </View>
      ) : null}

      {/* The selection footer. It replaces the pager rather than sitting beside it: while you are
          picking cards, paging is not what the row at the bottom of the screen is for. */}
      {sel.selecting ? (
        <ChamferBox chamfer={8} fill="rgba(20,24,31,0.95)" stroke={dm ? DmRune.line : Rune.goldEdge} strokeWidth={1.2} style={{ paddingHorizontal: 10, paddingVertical: 9, gap: Gap.intra }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, color: P.text, fontSize: 12, fontFamily: Body.bold, letterSpacing: 0.5 }}>{selectionLabel(picked.length)} selected</Text>
            <Pressable onPress={() => setSel(clearSelection(sel))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear the selection">
              <Text style={{ color: P.accent, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.6 }}>CLEAR</Text>
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <RuneButton dm={dm} label="Share" kind="ghost" dense height={36} style={{ flex: 1 }} onPress={() => act(actions.onShare)} />
            <RuneButton dm={dm} label="Move" kind="ghost" dense height={36} style={{ flex: 1 }} onPress={() => act(actions.onMove)} />
            <RuneButton dm={dm} label="Delete" kind="danger" dense height={36} style={{ flex: 1 }} onPress={() => act(actions.onDelete)} />
          </View>
        </ChamferBox>
      ) : null}
    </View>
  );
}
