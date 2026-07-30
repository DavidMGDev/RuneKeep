import Constants from 'expo-constants';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { bestName, groupNames, type NameIndex } from './forged-cache';
import { FORGED_H, FORGED_W } from './forged-card';

/**
 * On-device pre-rendering for forged cards (#104 perf): live svg+text cards composite far more
 * expensively than a decoded bitmap, so each forged card is captured ONCE into
 * documents/forged/<key>-vN.png (750x1050) + a 188x263 LOD twin, then rides the same two-LOD
 * image path as the scans. (view-shot can't encode webp — png costs a little more disk, decodes
 * the same.) Cache keyed by FORGE_RENDER_V — bump it whenever card layout/copy changes. Web (the
 * verify pipeline) skips capture and keeps the live components.
 */
// v18: v0.13.1 — long titles shrink-to-fit instead of truncating with "…" (#357).
// v19: v0.25.0 — the Hope and Fear ancestries are printed faces now, not app-rendered text.
const FORGE_LAYOUT_V = 19;

/**
 * v0.24.0: the cache key now carries the APP VERSION as well as the layout version.
 *
 * Bumping `FORGE_LAYOUT_V` by hand is a step that gets forgotten, and when it is forgotten the
 * failure is invisible to whoever forgot it: their device has no cache for the card they just
 * changed, so it forges fresh and looks right, while every existing install keeps serving a bitmap
 * of the old card forever. That is exactly what happened to the Hope and Fear cards, which kept
 * showing their pre-illustration text-only faces for anyone who had opened them before.
 *
 * Keying on the app version makes a release the invalidation, which is a thing that cannot be
 * forgotten. `FORGE_LAYOUT_V` stays for local iteration between releases.
 */
export const FORGE_RENDER_V = `${FORGE_LAYOUT_V}-${(Constants.expoConfig?.version ?? '0').replace(/[^\w.]/g, '')}`;

export interface ForgedSource {
  full: { uri: string };
  thumb: { uri: string };
}

interface PendingJob {
  key: string;
  node: ReactNode;
  /** Card has a RASTER art image (a player photo) that decodes async — needs a settle before
   *  capture (#110). Vector cards (svg+text: class/feature/weapon/armor) don't and forge fast. */
  raster?: boolean;
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

/**
 * v0.26.0: STALE WHILE REVALIDATE.
 *
 * This used to sweep the whole folder on first use, deleting every bitmap that did not match the
 * current render version. Since the version carries the app version, that meant a release deleted
 * every card's artwork at once and then re-forged them one at a time, so the first minutes after an
 * update showed a character with no pictures. The cache was doing its job and the player saw a
 * broken app.
 *
 * Now an old bitmap is kept and SERVED until its replacement has actually been written, and only
 * then deleted. Disk still settles at one set of PNGs, just never at zero.
 *
 * v0.26.1: the whole folder is read ONCE per pass and every card answered from that listing.
 *
 * The first version asked the filesystem per card: two `exists` probes for the current bitmap, then a
 * full directory listing to look for an older one. Since the pass re-runs each time a card finishes
 * forging, and a release invalidates every card at once, that came to a directory listing per card
 * per card, all of it synchronous and all of it on the JS thread. The app was at its slowest exactly
 * when a player was most likely to be looking at it: the first minutes after an update. One read
 * answers every question the pass has.
 */
function indexNames(dir: import('expo-file-system').Directory): NameIndex {
  try {
    return groupNames(dir.list().map((e) => e.name));
  } catch {
    return new Map(); // unreadable folder: everything forges fresh
  }
}

function sourceFor(dir: import('expo-file-system').Directory, full: string): ForgedSource {
  const { File } = fs();
  return { full: { uri: new File(dir, full).uri }, thumb: { uri: new File(dir, full.replace(/\.png$/, '_lod.png')).uri } };
}

/** Drop every bitmap for this key that is not the current version. Called only once the current one
 *  is safely on disk, so there is never a moment with nothing to show. */
function dropOlder(dir: import('expo-file-system').Directory, key: string): void {
  try {
    for (const entry of dir.list()) {
      if (entry.name.startsWith(`${key}-v`) && !entry.name.includes(`-v${FORGE_RENDER_V}`)) entry.delete();
    }
  } catch {
    // A failed prune only costs disk; never let it stop a card from rendering.
  }
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
  /**
   * Keys whose CURRENT bitmap is on disk, so there is nothing left to do for them.
   *
   * This has to be its own set rather than "is it in `sources`", because a card being SERVED a stale
   * bitmap is in `sources` and still needs forging. Reading the answer off `sources` meant that after
   * an update exactly one card re-forged per launch and the rest kept their old artwork forever.
   */
  const settled = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (Platform.OS === 'web') return;
    // One capture at a time. The finished capture updates `sources`, which runs this again.
    if (busy.current) return;
    if (jobs.every((j) => settled.current.has(j.key))) return; // nothing to read the folder for

    const dir = forgedDir();
    const index = indexNames(dir);
    const found: Record<string, ForgedSource> = {};
    let next: PendingJob | null = null;
    for (const j of jobs) {
      if (settled.current.has(j.key)) continue;
      const { name, current } = bestName(index, j.key, FORGE_RENDER_V);
      // A stale bitmap still goes on screen: the previous release's artwork beats an empty card.
      if (name && !sources[j.key]) found[j.key] = sourceFor(dir, name);
      if (current) settled.current.add(j.key);
      else if (!next) next = j;
    }
    if (Object.keys(found).length) setSources((s) => ({ ...s, ...found }));
    if (next) {
      busy.current = true;
      setActive(next);
    }
  }, [jobs, sources]);

  const onStageReady = useCallback(() => {
    const job = active;
    if (!job || !shotRef.current) return;
    // Double rAF lets svg/text paint (#88), but a RASTER art image (an experience's player photo,
    // file://) decodes asynchronously AFTER layout — capturing too early forged a black/dark art
    // zone into the full-res bitmap while the thumb (a beat later) caught the loaded image (#110:
    // "image black when centered"). Hold a real settle so raster art is decoded before BOTH captures.
    requestAnimationFrame(() =>
      requestAnimationFrame(async () => {
        try {
          // raster art (player photo) decodes async after layout — settle so the full-res capture
          // isn't black (#110/#121); vector cards skip it and forge fast.
          if (job.raster) await new Promise((r) => setTimeout(r, 450));
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
          dropOlder(dir, job.key); // safe now: the replacement is on disk
          setSources((s) => ({ ...s, [job.key]: { full: { uri: full.uri }, thumb: { uri: thumb.uri } } }));
        } catch {
          // Capture failed (low memory etc.): the live component stays in place and this card is left
          // alone until the next mount. Retrying here would pick the same card again the instant the
          // pass re-ran, and a card that cannot be captured would forge in a loop for as long as the
          // sheet stayed open.
        } finally {
          settled.current.add(job.key);
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
