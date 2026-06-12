import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { FORGED_H, FORGED_W } from './forged-card';

/**
 * On-device pre-rendering for forged cards (#104 perf): live svg+text cards composite far more
 * expensively than a decoded bitmap, so each forged card is captured ONCE into
 * documents/forged/<key>-vN.png (750x1050) + a 188x263 LOD twin, then rides the same two-LOD
 * image path as the scans. (view-shot can't encode webp — png costs a little more disk, decodes
 * the same.) Cache keyed by FORGE_RENDER_V — bump it whenever card layout/copy changes. Web (the
 * verify pipeline) skips capture and keeps the live components.
 */
export const FORGE_RENDER_V = 3;

export interface ForgedSource {
  full: { uri: string };
  thumb: { uri: string };
}

interface PendingJob {
  key: string;
  node: ReactNode;
}

type FS = typeof import('expo-file-system');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = (): FS => require('expo-file-system') as FS;

function forgedDir() {
  const { Directory, Paths } = fs();
  const dir = new Directory(Paths.document, 'forged');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

function cachedSource(key: string): ForgedSource | null {
  const { File } = fs();
  const dir = forgedDir();
  const full = new File(dir, `${key}-v${FORGE_RENDER_V}.png`);
  const thumb = new File(dir, `${key}-v${FORGE_RENDER_V}_lod.png`);
  return full.exists && thumb.exists ? { full: { uri: full.uri }, thumb: { uri: thumb.uri } } : null;
}

/**
 * Renders each requested card offscreen, captures full + LOD bitmaps, persists, and returns the
 * uri pair per key. `sources[key]` stays undefined until that card is forged — callers render
 * the live component meanwhile (it doubles as the loading state). One capture at a time.
 */
export function useForgedSnapshots(jobs: PendingJob[]): { sources: Record<string, ForgedSource>; stage: ReactNode } {
  const [sources, setSources] = useState<Record<string, ForgedSource>>({});
  const [active, setActive] = useState<PendingJob | null>(null);
  const shotRef = useRef<View>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const missing: PendingJob[] = [];
    const found: Record<string, ForgedSource> = {};
    for (const j of jobs) {
      if (sources[j.key]) continue;
      const hit = cachedSource(j.key);
      if (hit) found[j.key] = hit;
      else missing.push(j);
    }
    if (Object.keys(found).length) setSources((s) => ({ ...s, ...found }));
    if (!busy.current && missing.length) {
      busy.current = true;
      setActive(missing[0]);
    }
  }, [jobs, sources]);

  const onStageReady = useCallback(() => {
    const job = active;
    if (!job || !shotRef.current) return;
    // Double rAF: let svg/text actually paint before rasterizing (the #88 continuity lesson).
    requestAnimationFrame(() =>
      requestAnimationFrame(async () => {
        try {
          const { File } = fs();
          const fullTmp = await captureRef(shotRef, { format: 'png', quality: 1, result: 'tmpfile', width: 750, height: 1050 });
          const thumbTmp = await captureRef(shotRef, { format: 'png', quality: 1, result: 'tmpfile', width: 188, height: 263 });
          const dir = forgedDir();
          const full = new File(dir, `${job.key}-v${FORGE_RENDER_V}.png`);
          const thumb = new File(dir, `${job.key}-v${FORGE_RENDER_V}_lod.png`);
          if (full.exists) full.delete();
          if (thumb.exists) thumb.delete();
          new File(fullTmp).move(full);
          new File(thumbTmp).move(thumb);
          setSources((s) => ({ ...s, [job.key]: { full: { uri: full.uri }, thumb: { uri: thumb.uri } } }));
        } catch {
          // capture failed (low memory etc.) — live component stays in place; retries next mount
        } finally {
          busy.current = false;
          setActive(null);
        }
      }),
    );
  }, [active]);

  const stage =
    active && Platform.OS !== 'web' ? (
      <View style={{ position: 'absolute', left: -2000, top: 0 }} pointerEvents="none">
        <View ref={shotRef} collapsable={false} onLayout={onStageReady} style={{ width: FORGED_W, height: FORGED_H }}>
          {active.node}
        </View>
      </View>
    ) : null;

  return { sources, stage };
}
