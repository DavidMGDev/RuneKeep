import { useEffect } from 'react';
import { Platform } from 'react-native';

import { intentFor, type KeyContext } from '@/lib/keybinds';

import { useCarousel } from '../carousel-context';

/**
 * Driving the sheet from a keyboard (v0.26.0). Web only; never mounted on a phone.
 *
 * All of the thinking lives in `lib/keybinds`, which is pure and tested. This is the plumbing: read
 * what is on screen, ask what the key means, do it. Keeping the split means the awkward part (which
 * key wins while a dialog is open over a focused card in edit mode) is a table test rather than
 * something you have to reproduce in a browser.
 */
export function useKeyboardControl({ overlay, onConfirm, onDismiss }: {
  /** Something modal is open, so most keys are not ours. */
  overlay: boolean;
  /** Perform the primary action of whatever is open, if anything. */
  onConfirm?: () => void;
  /** Close whatever is open. Returning false means nothing was open to close. */
  onDismiss?: () => boolean;
}) {
  const { stepBy, openCardAt, closeFullscreen, collapse, centerIndex, focusIndex, machineState, editing, enterEdit, exitEdit, toggleCard, toggleRaise, decks, category, cycleCategory } = useCarousel();

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const ctx: KeyContext = {
        typing: tag === 'INPUT' || tag === 'TEXTAREA' || !!target?.isContentEditable,
        overlay,
        focused: machineState.value === 'fullscreen',
        editing,
      };
      const intent = intentFor({ key: e.key, shift: e.shiftKey, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey }, ctx);
      if (!intent) return;

      const deck = decks[category] ?? [];
      /**
       * The card a key press acts on (v0.28.0).
       *
       * This used to read `focusIndex`, which is not the middle of the hand: it is the index of the
       * card most recently flown FULL SCREEN, and it only moves when the keyboard moves. So spacebar
       * equipped whatever card had last been opened, commonly one scrolled well off screen, and the
       * card you were looking at never changed. It played its sound and applied its modifiers to a
       * card you could not see, which is why it read as doing nothing at all.
       *
       * A focused card is the exception: then the card on screen IS `focusIndex`.
       */
      const current = () => deck[machineState.value === 'fullscreen' ? Math.max(0, Math.min(deck.length - 1, Math.round(focusIndex.value))) : centerIndex()];

      switch (intent.kind) {
        case 'move':
          stepBy(intent.step);
          break;
        case 'focus':
          if (machineState.value !== 'fullscreen') openCardAt(Math.round(focusIndex.value));
          break;
        case 'unfocus':
          // Down closes a focused card, and with nothing focused it bundles the hand back up, which
          // is the reverse of a movement key fanning it out (owner, v0.28.0).
          if (machineState.value === 'fullscreen') closeFullscreen();
          else if (machineState.value === 'expanded') collapse();
          break;
        case 'toggle': {
          const card = current();
          if (card) toggleCard(card.id);
          break;
        }
        case 'select': {
          const card = current();
          if (card) toggleRaise(card.id);
          break;
        }
        case 'editMode':
          if (editing) exitEdit();
          else enterEdit();
          break;
        case 'category':
          cycleCategory(intent.step);
          break;
        case 'confirm':
          onConfirm?.();
          return; // let the field keep the key too (Enter in a form still submits)
        case 'dismiss':
          // Close the innermost thing that is open, in the order a player would expect.
          if (onDismiss?.()) break;
          if (machineState.value === 'fullscreen') closeFullscreen();
          else if (editing) exitEdit();
          break;
      }
      e.preventDefault();
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [overlay, onConfirm, onDismiss, stepBy, openCardAt, closeFullscreen, collapse, centerIndex, focusIndex, machineState, editing, enterEdit, exitEdit, toggleCard, toggleRaise, decks, category, cycleCategory]);
}
