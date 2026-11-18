import { type RefObject, useEffect, useRef } from 'react';

/** Open dialogs that hold the keyboard, in open order. The newest one that is not inert answers. */
const stack: { id: symbol; root: HTMLElement }[] = [];
const live = (root: HTMLElement) => !root.closest('[inert]');

/**
 * A dialog that holds the keyboard (v0.45.0, web desktop): focus moves in on open (onto `initialLabel`, or the
 * first control), Tab and Shift+Tab cycle inside it, Escape runs `onEscape` when one is given, and focus goes
 * back where it was on close. Only the newest live dialog answers. Off unless `enabled`, so phones never run it.
 *
 * Capture phase: React Native Web's TextInput stops key events from bubbling, so a bubbling listener never hears
 * Escape or Tab from a dialog's own field.
 */
export function useDialogKeys(rootRef: RefObject<unknown>, { enabled, onEscape, initialLabel }: { enabled: boolean; onEscape?: () => void; initialLabel?: string }) {
  const escRef = useRef(onEscape);
  escRef.current = onEscape;
  const labelRef = useRef(initialLabel);
  labelRef.current = initialLabel;
  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return;
    const root = rootRef.current as HTMLElement | null;
    if (!root?.querySelectorAll) return;
    const me = { id: Symbol('dialog'), root };
    stack.push(me);
    const before = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(root.querySelectorAll<HTMLElement>('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'))
        .filter((el) => live(el) && el.getAttribute('aria-label') !== 'Dismiss' && !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true');
    const list0 = focusables();
    const want = labelRef.current?.toLowerCase();
    (list0.find((el) => !!want && el.textContent?.trim().toLowerCase() === want) ?? list0[0])?.focus();
    const onKey = (e: KeyboardEvent) => {
      // An IME is composing (Escape cancels its candidate list, not the dialog), or someone already handled it.
      if (e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
      const top = [...stack].reverse().find((d) => live(d.root));
      if (top?.id !== me.id) return;
      if (e.key === 'Escape' && escRef.current) { e.preventDefault(); escRef.current(); return; }
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (!list.length) return;
      const at = list.indexOf(document.activeElement as HTMLElement);
      const next = at < 0 ? 0 : e.shiftKey ? (at - 1 + list.length) % list.length : (at + 1) % list.length;
      e.preventDefault();
      list[next].focus();
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      stack.splice(stack.indexOf(me), 1);
      // A frame later: whatever made the opener inert while this was up (the sheet's modal state) clears first.
      requestAnimationFrame(() => { if (before?.isConnected) before.focus(); });
    };
  }, [enabled, rootRef]);
}
