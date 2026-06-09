import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';

export interface AccentOption {
  name: string;
  color: string;
}

/** The selectable accent palette (>=8). First entry is the default (the sheet's original red). */
export const ACCENT_OPTIONS: AccentOption[] = [
  { name: 'Heart Red', color: '#C81B18' },
  { name: 'Royal Gold', color: '#C8923A' },
  { name: 'Ember', color: '#D2691E' },
  { name: 'Wine', color: '#B0306C' },
  { name: 'Amethyst', color: '#7B4FB0' },
  { name: 'Indigo', color: '#4A5BC4' },
  { name: 'Steel Blue', color: '#2F6FB0' },
  { name: 'Teal', color: '#1F9E8C' },
  { name: 'Emerald', color: '#2E8B57' },
  { name: 'Moss', color: '#5A8F2B' },
];

interface AccentContextValue {
  accent: string;
  setAccent: (color: string) => void;
}

const AccentContext = createContext<AccentContextValue>({
  accent: ACCENT_OPTIONS[0].color,
  setAccent: () => {},
});

/** Holds the chosen accent color; everything that used to be hard-coded red reads from here. */
export function AccentProvider({ children }: { children: ReactNode }) {
  const [accent, setAccent] = useState(ACCENT_OPTIONS[0].color);
  const value = useMemo(() => ({ accent, setAccent }), [accent]);
  return <AccentContext.Provider value={value}>{children}</AccentContext.Provider>;
}

/** Current accent color. */
export function useAccent() {
  return useContext(AccentContext).accent;
}

/** Accent color + setter, for the picker. */
export function useAccentControls() {
  return useContext(AccentContext);
}
