/**
 * How much to scale a sound so it is about as loud as every other (owner, v0.47.15: "normalize them, some are too
 * loud"). Loudness is the RMS of its loudest 50 ms, which is what the ear judges a short effect by (a whole-file
 * average would call a crack followed by silence quiet). The gain never lets the peak clip and never boosts more
 * than `maxBoost`, so a near-silent click is not blown up into noise.
 */
export function normalGain(channels: Float32Array[], rate: number, target = 0.25, maxBoost = 6): number {
  const n = channels[0]?.length ?? 0;
  if (!n) return 1;
  const win = Math.max(1, Math.round(rate * 0.05));
  let loudest = 0;
  let peak = 0;
  for (let start = 0; start < n; start += win) {
    const end = Math.min(n, start + win);
    let sum = 0;
    for (let i = start; i < end; i++) {
      let v = 0;
      for (const ch of channels) v += ch[i];
      v /= channels.length;
      sum += v * v;
      const a = Math.abs(v);
      if (a > peak) peak = a;
    }
    loudest = Math.max(loudest, Math.sqrt(sum / (end - start)));
  }
  if (loudest <= 0) return 1;
  return Math.min(target / loudest, maxBoost, 1 / peak);
}
