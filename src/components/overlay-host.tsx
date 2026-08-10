/**
 * Where a dialog is DRAWN, as opposed to where it is written (v0.39.0, owner).
 *
 * A full-screen dialog in React Native is a `position: absolute` view with all four insets at zero.
 * That is only full-screen if its parent is: absolute positioning is relative to the nearest
 * positioned ancestor, and inside a ScrollView that ancestor is the CONTENT CONTAINER, whose top is
 * wherever the content happens to be scrolled to and whose height is the height of the content rather
 * than of the display. A dialog rendered from a component that lives in a scrolling column is
 * therefore centred on the content, not on the screen, and scrolls with it.
 *
 * That is the whole of "the pop-up for naming a group of modifiers is completely off-center
 * vertically, it is partially outside of the screen": the dialog is rendered by `EffectsField`, which
 * sits inside the modifier panel's ScrollView. Nothing about the dialog's own geometry was wrong.
 *
 * A panel wraps its root in {@link OverlayHost}; a dialog anywhere inside wraps itself in
 * {@link Overlay} and is drawn at that root instead of where it sits in the tree. With no host above
 * it, `Overlay` renders its children where they are, which is what every call site did before, so
 * panels can adopt it one at a time and an unadopted one behaves exactly as it always has.
 */
import { createContext, Fragment, type ReactNode, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';

type Slots = { nodes: Map<string, ReactNode>; subs: Set<() => void> };
type Publish = (id: string, node: ReactNode | null) => void;

const HostContext = createContext<Publish | null>(null);

/**
 * The map lives in a REF, and only the SINK re-renders.
 *
 * Publishing through state on the host itself looks obvious and is an infinite loop: the host owns the
 * children, so re-rendering it re-renders the `Overlay` inside it, whose effect publishes a freshly
 * created element, which sets state again. Keeping the map outside React and repainting only the sink
 * breaks the cycle, because the component that publishes is never the component that repaints.
 */
export function OverlayHost({ children }: { children: ReactNode }) {
  const slots = useRef<Slots>({ nodes: new Map(), subs: new Set() }).current;
  const publish = useCallback<Publish>(
    (id, node) => {
      if (node === null) slots.nodes.delete(id);
      else slots.nodes.set(id, node);
      for (const notify of slots.subs) notify();
    },
    [slots],
  );
  return (
    <HostContext.Provider value={publish}>
      {children}
      <OverlaySink slots={slots} />
    </HostContext.Provider>
  );
}

/**
 * Paints whatever is published, in the order it was opened.
 *
 * The published nodes are copied into REAL STATE rather than read straight out of the map, and that is
 * not a matter of taste. This project builds with the React Compiler on (`app.json` › experiments),
 * which memoises a component's output against the state and props it can see. A sink that rendered
 * `slots.nodes` directly and kept only a throwaway counter had output the compiler could prove did not
 * depend on that counter, so it returned its cached JSX and the dialog never appeared, on a bump that
 * did fire, through a subscription that was live, with no error anywhere. Holding the nodes in state
 * gives the compiler something real to invalidate against.
 *
 * `sync()` also runs once on subscribing, so anything published in the same commit that mounted this
 * sink is picked up rather than missed by a hair of effect ordering.
 */
function OverlaySink({ slots }: { slots: Slots }) {
  const [drawn, setDrawn] = useState<[string, ReactNode][]>([]);
  useEffect(() => {
    const sync = () => setDrawn([...slots.nodes.entries()]);
    slots.subs.add(sync);
    sync();
    return () => { slots.subs.delete(sync); };
  }, [slots]);
  return (
    <>
      {drawn.map(([id, node]) => (
        <Fragment key={id}>{node}</Fragment>
      ))}
    </>
  );
}

export function Overlay({ children }: { children: ReactNode }) {
  const publish = useContext(HostContext);
  const id = useId();
  // No dependency list on purpose: the children are a new element on every render of whoever wrote
  // them, and the published copy has to be the current one or the dialog would freeze at its first
  // frame. Re-publishing the same element type under the same key is an ordinary reconcile, so the
  // dialog's own state survives it.
  useEffect(() => {
    if (!publish) return;
    publish(id, children);
    return () => publish(id, null);
  });
  return publish ? null : <>{children}</>;
}
