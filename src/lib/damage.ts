/**
 * Damage thresholds → HP lost (#128, Daggerheart "meets it, beats it"):
 *   - any damage below `major`           → 1 HP
 *   - `major` ≤ damage < `severe`        → 2 HP
 *   - `severe` ≤ damage < 2×`severe`     → 3 HP   (Major/Severe met)
 *   - damage ≥ 2×`severe`                → 4 HP   (double Severe = a massive hit)
 * 0 (or negative) damage costs nothing. Meeting a threshold counts (>=), not just beating it.
 */
export function hpLostFromDamage(damage: number, thresholds: { major: number; severe: number }): number {
  const { major, severe } = thresholds;
  if (damage <= 0) return 0;
  if (severe > 0 && damage >= severe * 2) return 4;
  if (severe > 0 && damage >= severe) return 3;
  if (major > 0 && damage >= major) return 2;
  return 1;
}
