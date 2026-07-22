/** Hold-to-multi-select (v0.16.0, PRD #8) — shared across adversaries, allies, encounters, log. */
import { useCallback, useState } from 'react';

export function useSelection() {
  const [selecting, setSelecting] = useState(false);
  const [ids, setIds] = useState<Set<string>>(new Set());

  const start = useCallback((id: string) => { setSelecting(true); setIds(new Set([id])); }, []);
  const toggle = useCallback((id: string) => {
    setIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      if (n.size === 0) setSelecting(false);
      return n;
    });
  }, []);
  const clear = useCallback(() => { setSelecting(false); setIds(new Set()); }, []);

  return { selecting, ids, start, toggle, clear };
}
