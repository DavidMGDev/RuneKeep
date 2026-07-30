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
  | 'valor'
  // v0.12.2 — "The Void" official expansion adds two domains (gated; see VOID_DOMAINS).
  | 'blood'
  | 'dread';

export type ClassName =
  | 'bard'
  | 'druid'
  | 'guardian'
  | 'ranger'
  | 'rogue'
  | 'seraph'
  | 'sorcerer'
  | 'warrior'
  | 'wizard'
  // v0.12.2 — "The Void" official expansion adds six classes (gated; see VOID_CLASSES).
  | 'assassin'
  | 'witch'
  | 'warlock'
  | 'bloodhunter'
  | 'summoner'
  | 'brawler';

/**
 * The two official expansions, kept SEPARATE from the base set so callers can gate them (off by
 * default globally; enabled per-character at creation). See [[runekeep_void_expansion]].
 *
 * v0.25.0 splits what used to be one pack in two, because the printed release turned out to be a
 * SUBSET of the pre-release sheet the app was built from:
 *
 * - **Hope and Fear** is what Darrington Press actually published. Its id stays `'void'`, which is
 *   the pack's original internal name, because characters already store that id and renaming it
 *   would strip their content. Only the display name ever changed.
 * - **The Void** is the beta that tested most of Hope and Fear's content but not all of it. It holds
 *   what no Hope and Fear book contains: the Blood Hunter and Summoner classes, their five
 *   subclasses, and the 21 Blood domain cards, whose art is still watermarked "work in progress"
 *   with the artists uncredited.
 *
 * The split is not a judgement call: `scripts/audit_expansion_vs_pdf.py` decides it by searching the
 * four Hope and Fear PDFs, and can be re-run.
 */
export const VOID_EXPANSION_ID = 'void'; // display name: "Hope and Fear"
export const THE_VOID_EXPANSION_ID = 'thevoid'; // display name: "The Void"

/** Classes the published Hope and Fear book contains. */
export const HOPE_AND_FEAR_CLASSES: ClassName[] = ['assassin', 'witch', 'warlock', 'brawler'];
/** Classes only the beta ever had. */
export const THE_VOID_CLASSES: ClassName[] = ['bloodhunter', 'summoner'];
/** Every non-base class, whichever pack it now belongs to. */
export const VOID_CLASSES: ClassName[] = [...HOPE_AND_FEAR_CLASSES, ...THE_VOID_CLASSES];

/** Dread is printed in Hope and Fear; Blood exists only in the beta. */
export const HOPE_AND_FEAR_DOMAINS: DomainName[] = ['dread'];
export const THE_VOID_DOMAINS: DomainName[] = ['blood'];
export const VOID_DOMAINS: DomainName[] = [...THE_VOID_DOMAINS, ...HOPE_AND_FEAR_DOMAINS];

export const isVoidClass = (k: ClassName): boolean => VOID_CLASSES.includes(k);
export const isVoidDomain = (d: DomainName): boolean => VOID_DOMAINS.includes(d);

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
  // v0.12.2 Void domains (approx — refine from final art later): blood = deep crimson, dread = void violet.
  blood: { deep: '#4A1D1D', bright: '#A82A2A' },
  dread: { deep: '#2A2233', bright: '#7A56A0' },
};

/** Base-game domains only. The Void domains live in VOID_DOMAINS and are appended by gating-aware callers. */
export const DOMAINS: DomainName[] = ['arcana', 'blade', 'bone', 'codex', 'grace', 'midnight', 'sage', 'splendor', 'valor'];
/** All domains including the Void expansion's (for the archive / when the Void is enabled). */
export const ALL_DOMAINS: DomainName[] = [...DOMAINS, ...VOID_DOMAINS];

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
  // v0.12.2 — "The Void" classes (gated by VOID_CLASSES). classColor blends their two domains.
  { key: 'assassin', label: 'Assassin', domains: ['midnight', 'blade'] },
  { key: 'witch', label: 'Witch', domains: ['dread', 'sage'] },
  { key: 'warlock', label: 'Warlock', domains: ['dread', 'grace'] },
  { key: 'bloodhunter', label: 'Blood Hunter', domains: ['blood', 'bone'] },
  { key: 'summoner', label: 'Summoner', domains: ['blood', 'splendor'] },
  { key: 'brawler', label: 'Brawler', domains: ['bone', 'valor'] },
];
/** Base-game classes only (the character creator's default set; Void classes appended when enabled). */
export const BASE_CLASSES: ClassInfo[] = CLASSES.filter((c) => !VOID_CLASSES.includes(c.key));

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
 * A class's identity color is the blend of its two domains, grounded in the game's own system
 * (the subclass card chrome itself is class-neutral gold, so there is no class color to sample).
 */
export function classColor(key: ClassName): IdentityColor {
  const [a, b] = classInfo(key).domains;
  return { deep: mixHex(DomainColors[a].deep, DomainColors[b].deep), bright: mixHex(DomainColors[a].bright, DomainColors[b].bright) };
}
