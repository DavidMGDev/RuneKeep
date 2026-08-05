/**
 * The DM's per-character tools (v0.35, owner), in one place.
 *
 * Two screens need exactly the same pair of panels over exactly the same character files: the party
 * sheet and an encounter's ally list. This owns which one is open and the write-back, so both screens
 * gain the feature by rendering one node and calling two functions.
 */
import { type ReactNode, useCallback, useState } from 'react';

import type { CharacterFile } from '@/lib/character-file';
import { saveCharacter } from '@/lib/character-store';
import { dmEffectsOf, setDmEffects } from '@/lib/dm-cards';
import type { CardEffect } from '@/lib/modifiers';
import { DmCardsPanel } from './dm-cards-panel';
import { DmModifiersPanel } from './dm-modifiers-panel';

export interface DmCharacterTools {
  /** Open the modifiers panel for a character. `edit` skips the summary and opens the editor. */
  openModifiers: (charId: string, edit: boolean) => void;
  /** Open a character's cards. */
  openCards: (charId: string) => void;
  /** Whether either panel is up, so a screen can suppress its own overlays while one is. */
  open: boolean;
  /** Render this at the screen's root. */
  node: ReactNode;
}

export function useDmCharacterTools(files: Record<string, CharacterFile>, onFile: (next: CharacterFile) => void): DmCharacterTools {
  const [mods, setMods] = useState<{ id: string; edit: boolean } | null>(null);
  const [cards, setCards] = useState<string | null>(null);

  const write = useCallback((next: CharacterFile) => {
    onFile(next);
    void saveCharacter(next);
  }, [onFile]);

  const openModifiers = useCallback((charId: string, edit: boolean) => setMods({ id: charId, edit }), []);
  const openCards = useCallback((charId: string) => setCards(charId), []);

  const modFile = mods ? files[mods.id] : undefined;
  const cardFile = cards ? files[cards] : undefined;
  const saveMods = useCallback((effects: CardEffect[]) => {
    if (!modFile) return;
    write(setDmEffects(modFile, effects));
  }, [modFile, write]);

  const node = (
    <>
      {modFile ? (
        <DmModifiersPanel
          title={modFile.name}
          subtitle="Your changes to this character"
          effects={dmEffectsOf(modFile)}
          level={modFile.level}
          startEditing={mods?.edit}
          onSave={saveMods}
          onClose={() => setMods(null)}
        />
      ) : null}
      {cardFile ? <DmCardsPanel file={cardFile} onFile={write} onClose={() => setCards(null)} /> : null}
    </>
  );

  return { openModifiers, openCards, open: !!modFile || !!cardFile, node };
}
