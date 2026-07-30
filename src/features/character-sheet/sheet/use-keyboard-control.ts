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
  const { stepBy, openCardAt, closeFullscreen, focusIndex, machineState, editing, enterEdit, exitEdit, toggleCard, toggleRaise, decks, category, cycleCategory } = useCarousel();

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
      const current = () => deck[Math.max(0, Math.min(deck.length - 1, Math.round(focusIndex.value)))];

      switch (intent.kind) {
        case 'move':
          stepBy(intent.step);
          break;
        case 'focus':
          if (machineState.value !== 'fullscreen') openCardAt(Math.round(focusIndex.value));
          break;
        case 'unfocus':
          if (machineState.value === 'fullscreen') closeFullscreen();
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
  }, [overlay, onConfirm, onDismiss, stepBy, openCardAt, closeFullscreen, focusIndex, machineState, editing, enterEdit, exitEdit, toggleCard, toggleRaise, decks, category, cycleCategory]);
}
