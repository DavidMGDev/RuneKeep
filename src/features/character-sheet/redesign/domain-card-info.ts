/** A domain card summary for the level-up picker + its carousel (#167). Shared, UI-agnostic shape. */
export interface DomainCardInfo {
  id: string;
  title: string;
  thumb: { uri: string } | number;
  /** Full-res card art (for the level-up carousel). */
  source?: { uri: string } | number;
  domain?: string;
  level?: number;
}
