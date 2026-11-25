/**
 * The card archive's filters and how picking a chip changes them (v0.50.6, owner): Type and Domain hold one chip at a
 * time, a domain narrows domain cards, classes and subclasses, and picking a type drops what no longer applies to it.
 */
import type { DomainName } from '@/constants/identity';

import type { GalleryKind } from './gallery-screen';

export interface Filters {
  kinds: Set<GalleryKind>;
  domains: Set<DomainName>;
  levels: Set<number>;
  tiers: Set<number>; // tier 1–4, equipment only
  /** v0.32.2: where the card came from. Empty = both, which is the default and stays it. */
  sources: Set<'official' | 'homebrew'>;
  /**
   * v0.35.2 (owner): WHICH pack, by expansion id, with the base game as `base`.
   *
   * Every card in the archive belongs to exactly one, and the archive already shows several packs at
   * once, so "show me only what The Void added" had no way to be asked before. Empty = all of them.
   */
  packs: Set<string>;
}

export function toggle<T>(set: Set<T>, v: T): Set<T> {
  const next = new Set(set);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return next;
}
/** v0.50.6 (owner): the kinds a domain narrows; any other Type drops the domain. */
export const DOMAIN_KINDS: GalleryKind[] = ['domain', 'class', 'subclass'];
export const EMPTY_FILTERS = (): Filters => ({ kinds: new Set(), domains: new Set(), levels: new Set(), tiers: new Set(), sources: new Set(), packs: new Set() });
/**
 * Type is one at a time (owner, v0.50.6): picking one drops what no longer applies to it. A domain stays for domains,
 * classes and subclasses; levels only for domains; tiers only for weapons and armour.
 */
export function pickKind(f: Filters, k: GalleryKind): Filters {
  const kinds = f.kinds.has(k) ? new Set<GalleryKind>() : new Set<GalleryKind>([k]);
  const any = !kinds.size;
  return {
    ...f,
    kinds,
    domains: any || DOMAIN_KINDS.includes(k) ? f.domains : new Set(),
    levels: any || k === 'domain' ? f.levels : new Set(),
    tiers: any || k === 'weapon' || k === 'armor' ? f.tiers : new Set(),
  };
}
/** Domain is one at a time too; with no type a domain applies to, it shows domain cards. */
export function pickDomain(f: Filters, d: DomainName): Filters {
  const domains = f.domains.has(d) ? new Set<DomainName>() : new Set<DomainName>([d]);
  const keeps = [...f.kinds].some((k) => DOMAIN_KINDS.includes(k));
  return { ...f, domains, tiers: new Set(), kinds: keeps ? f.kinds : new Set<GalleryKind>(['domain']) };
}
/** Levels are domain cards' only. */
export function pickLevel(f: Filters, l: number): Filters {
  return { ...f, levels: toggle(f.levels, l), tiers: new Set(), kinds: new Set<GalleryKind>(['domain']) };
}
/** Tiers are weapons' and armour's; any other type is dropped. */
export function pickTier(f: Filters, t: number): Filters {
  const keeps = f.kinds.has('weapon') || f.kinds.has('armor');
  return { ...f, tiers: toggle(f.tiers, t), domains: new Set(), levels: new Set(), kinds: keeps ? f.kinds : new Set() };
}

