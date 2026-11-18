import { type RefObject, useEffect, useRef } from 'react';

/** Open dialogs that hold the keyboard, newest last: only the top one answers. */
const stack: symbol[] = [];

/**
 * A dialog that holds the keyboard (v0.45.0, web desktop): focus moves in on open (onto `initialLabel`, or the
 * first control), Tab and Shift+Tab cycle inside it, Escape runs `onEscape` when one is given, and focus goes
 * back where it was on close. Only the newest such dialog answers. Off unless `enabled`, so phones never run it.
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
    const me = Symbol('dialog');
    stack.push(me);
    const before = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(root.querySelectorAll<HTMLElement>('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'))
        .filter((el) => !el.closest('[inert]') && el.getAttribute('aria-label') !== 'Dismiss');
    const list0 = focusables();
    const want = labelRef.current?.toLowerCase();
    (list0.find((el) => !!want && el.textContent?.trim().toLowerCase() === want) ?? list0[0])?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== me || e.defaultPrevented) return;
      if (e.key === 'Escape' && escRef.current) { e.preventDefault(); escRef.current(); return; }
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (!list.length) return;
      const at = list.indexOf(document.activeElement as HTMLElement);
      const next = at < 0 ? 0 : e.shiftKey ? (at - 1 + list.length) % list.length : (at + 1) % list.length;
      e.preventDefault();
      list[next].focus();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(me), 1);
      if (before?.isConnected) before.focus();
    };
  }, [enabled, rootRef]);
}
