// Not in theme.ts: that file is part of the forge signature, and a change to it re-forges every card on every device.

/** Sticky notes' paper (v0.49.0): the sheet's parchment family, each with the darker strip its glue is on. */
export const NotePaperTint = {
  gold: { paper: '#F2D58A', glue: '#DDB766' },
  rose: { paper: '#E9B7AC', glue: '#D69686' },
  sage: { paper: '#BFD1A8', glue: '#9FB584' },
  sky: { paper: '#AFC9D3', glue: '#8DAEBB' },
  linen: { paper: '#E6DCC6', glue: '#C9BCA0' },
} as const;

/** The Fear tracker's purple, lit and unlit (v0.49.0). */
export const FearTint = { lit: '#9A6BD0', dim: 'rgba(154,107,208,0.22)', edge: 'rgba(154,107,208,0.7)' } as const;
