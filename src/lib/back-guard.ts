/**
 * WHO ANSWERS BACK (v0.43.2).
 *
 * A page cannot veto a back navigation. What it can do is keep something cheap to go back TO: one
 * spare history entry, which the first Back consumes instead of leaving. `popstate` then fires with
 * the screen still mounted, the topmost guard runs, and a fresh spare is pushed so the next press is
 * caught too.
 *
 * ## Why this is a stack, and why it cannot navigate
 *
 * v0.43.1 armed and disarmed per screen, and unwound its own spare entry on cleanup so that opening
 * and closing an editor would not litter the history. That was wrong in the worst possible way.
 *
 * Guards HAND OVER: the library screen disables its guard exactly when the card editor enables one.
 * "Disabled" runs the cleanup, the cleanup called `history.back()`, and that is a REAL navigation. So
 * opening a card editor popped the route and threw the author back out to the pack list, every time.
 * It did not look like a navigation bug; it looked like the expansion editor randomly crashing.
 *
 * The lesson is not "clean up more carefully", it is that a guard must never navigate. Which is why
 * {@link GuardNav} has exactly one method and it is not `back`: there is no expression in this module
 * that can move the user, and no future edit can add one without changing the interface on purpose.
 *
 * Arming and disarming therefore cost nothing but an array push and splice. The spare entry is pushed
 * when the first guard arrives and simply abandoned when the last one leaves, which costs one extra
 * Back press per visit and cannot strand anybody. That is the trade the character sheet has shipped
 * since v0.29.1.
 *
 * Pure and React-free so the handover is a table test rather than a thing you find out about from a
 * screenshot of the wrong screen.
 */

/** Everything a guard is allowed to do to history. Deliberately no `back`. */
export interface GuardNav {
  /** Put a fresh spare entry in front of the user, so the NEXT Back is catchable too. */
  pushSpare: () => void;
}

export interface Guard {
  run: () => void;
  /**
   * Whether this guard answers a BROWSER back as well as Android's key.
   *
   * False for a screen whose browser Back is already owned by something above it, which today is
   * anything hosted inside the character sheet (it has had its own implementation since v0.29.1).
   */
  web: boolean;
}

export interface GuardStack {
  /** Arm a guard. Returns the function that disarms it; calling it twice is harmless. */
  register: (g: Guard) => () => void;
  /** A browser Back happened. Returns whether a guard consumed it. */
  onPop: () => boolean;
  /** Whether any guard currently wants browser backs, so the caller knows to keep listening. */
  hasWeb: () => boolean;
}

export function createGuardStack(nav: GuardNav): GuardStack {
  const stack: Guard[] = [];
  const top = (): Guard | undefined => {
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i].web) return stack[i];
    return undefined;
  };
  return {
    register(g) {
      stack.push(g);
      let live = true;
      return () => {
        if (!live) return;
        live = false;
        const i = stack.indexOf(g);
        if (i >= 0) stack.splice(i, 1);
      };
    },
    onPop() {
      const g = top();
      // Nothing left to guard: let the navigation stand rather than trapping the user on this screen.
      if (!g) return false;
      g.run();
      nav.pushSpare();
      return true;
    },
    hasWeb: () => !!top(),
  };
}
