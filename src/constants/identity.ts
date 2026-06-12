/**
 * Daggerheart identity data: the nine domains, the nine classes and their domain pairs, and the
 * identity colors derived from the actual card art (banner-ribbon medians sampled by
 * scripts/sample_identity_colors.py). Per DESIGN.md these colors stay SUBORDINATE: `deep` is the
 * desaturated/darkened fill for rest states on ink (gold text stays AA on every one of them);
 * `bright` is for selected hairlines, glyph tints and small emphasis — never large fills.
 */

export type DomainName =
  | 'arcana'
  | 'blade'
  | 'bone'
  | 'codex'
  | 'grace'
  | 'midnight'
  | 'sage'
  | 'splendor'
  | 'valor';

export type ClassName =
  | 'bard'
  | 'druid'
  | 'guardian'
  | 'ranger'
  | 'rogue'
  | 'seraph'
  | 'sorcerer'
  | 'warrior'
  | 'wizard';

export interface IdentityColor {
  deep: string;
  bright: string;
}

/** Sampled from each domain's level-1 card banner (sample_identity_colors.py). */
export const DomainColors: Record<DomainName, IdentityColor> = {
  arcana: { deep: '#402B46', bright: '#905F9E' },
  blade: { deep: '#522A28', bright: '#9E2E28' },
  bone: { deep: '#56574C', bright: '#B5B69E' },
  codex: { deep: '#223748', bright: '#28699E' },
  grace: { deep: '#572A40', bright: '#B43675' },
  midnight: { deep: '#292922', bright: '#9E9E82' },
  sage: { deep: '#1D3B29', bright: '#289E58' },
  splendor: { deep: '#574E2A', bright: '#C8AA32' },
  valor: { deep: '#573C2A', bright: '#BA682E' },
};

export const DOMAINS: DomainName[] = ['arcana', 'blade', 'bone', 'codex', 'grace', 'midnight', 'sage', 'splendor', 'valor'];

export interface ClassInfo {
  key: ClassName;
  label: string;
  /** The two domains whose decks this class draws from (Daggerheart core). */
  domains: [DomainName, DomainName];
}

export const CLASSES: ClassInfo[] = [
  { key: 'bard', label: 'Bard', domains: ['grace', 'codex'] },
  { key: 'druid', label: 'Druid', domains: ['sage', 'arcana'] },
  { key: 'guardian', label: 'Guardian', domains: ['valor', 'blade'] },
  { key: 'ranger', label: 'Ranger', domains: ['bone', 'sage'] },
  { key: 'rogue', label: 'Rogue', domains: ['midnight', 'grace'] },
  { key: 'seraph', label: 'Seraph', domains: ['splendor', 'valor'] },
  { key: 'sorcerer', label: 'Sorcerer', domains: ['arcana', 'midnight'] },
  { key: 'warrior', label: 'Warrior', domains: ['blade', 'bone'] },
  { key: 'wizard', label: 'Wizard', domains: ['codex', 'splendor'] },
];

export const classInfo = (key: ClassName): ClassInfo => CLASSES.find((c) => c.key === key)!;

function mixChannel(a: number, b: number): number {
  return Math.round(Math.sqrt((a * a + b * b) / 2)); // perceptual-ish blend, keeps saturation
}

function mixHex(a: string, b: string): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return '#' + pa.map((c, i) => mixChannel(c, pb[i]).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/**
 * A class's identity color is the blend of its two domains — grounded in the game's own system
 * (the subclass card chrome itself is class-neutral gold, so there is no class color to sample).
 */
export function classColor(key: ClassName): IdentityColor {
  const [a, b] = classInfo(key).domains;
  return { deep: mixHex(DomainColors[a].deep, DomainColors[b].deep), bright: mixHex(DomainColors[a].bright, DomainColors[b].bright) };
}
