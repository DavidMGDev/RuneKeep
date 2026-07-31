import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { FORGE_CONTENT_HASH } from './forge-hash';
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
 * v0.24.0 keyed the cache on the APP VERSION as well as the layout version, because bumping
 * `FORGE_LAYOUT_V` by hand kept getting forgotten, and a forgotten bump is invisible to whoever
 * forgot it: their device has no cache for the card they just changed, so it forges fresh and looks
 * right, while every existing install keeps serving a bitmap of the old card forever. That is what
 * happened to the Hope and Fear cards.
 *
 * v0.27.4 keeps that guarantee and drops its cost. Keying on the release meant EVERY release threw
 * away every bitmap, so after each update a phone re-captured a character's entire deck, two
 * screen-sized PNG encodes at a time, on the UI thread. A browser forges nothing ever, which is a
 * large part of why the web build feels faster than the app it was ported from.
 *
 * `FORGE_CONTENT_HASH` is a signature of the things a card is actually made of: the card components,
 * the palette, and all of the game data. It changes exactly when a card's look or text changes, and
 * `forge-hash.test.ts` fails if it is out of date, so it still cannot be forgotten.
 */
export const FORGE_RENDER_V = `${FORGE_LAYOUT_V}-${FORGE_CONTENT_HASH}`;

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

/**
 * Drop the superseded bitmaps for one key, by NAME.
 *
 * v0.27.4: this used to walk the whole folder. Together with the pass's own listing that came to two
 * full directory reads per card forged, and since the pass re-runs each time a card lands, forging a
 * character's worth of cards walked the folder a hundred-odd times, synchronously, on the JS thread.
 * The names are already known, so ask for those files and nothing else.
 */
function dropNames(dir: import('expo-file-system').Directory, names: string[]): void {
  const { File } = fs();
  for (const n of names) {
    try {
      const f = new File(dir, n);
      if (f.exists) f.delete();
    } catch {
      // A failed prune only costs disk; never let it stop a card from rendering.
    }
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
  /**
   * The folder listing, read ONCE and then kept current in memory (v0.27.4).
   *
   * The pass re-runs every time a card lands, and it used to re-read the whole folder each time. That
   * is a synchronous directory walk per card, over a folder that holds two files per card, so the
   * cost grew with the square of the deck. It is also pure waste: this hook is the only thing that
   * writes to that folder, so it already knows every change that happens to it.
   */
  const listing = useRef<NameIndex | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    // One capture at a time. The finished capture updates `sources`, which runs this again.
    if (busy.current) return;
    if (jobs.every((j) => settled.current.has(j.key))) return; // nothing to read the folder for

    const dir = forgedDir();
    if (!listing.current) listing.current = indexNames(dir);
    const index = listing.current;
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
          const name = `${job.key}-v${FORGE_RENDER_V}.png`;
          const lod = `${job.key}-v${FORGE_RENDER_V}_lod.png`;
          const full = new File(dir, name);
          const thumb = new File(dir, lod);
          if (full.exists) full.delete();
          if (thumb.exists) thumb.delete();
          new File(fullTmp).move(full);
          new File(thumbTmp).move(thumb);
          // Safe now: the replacement is on disk. Superseded names come from the in-memory listing,
          // so pruning costs two file probes rather than a walk of the whole folder.
          const stale = (listing.current?.get(job.key) ?? []).filter((n) => n !== name);
          dropNames(dir, [...stale, ...stale.map((n) => n.replace(/\.png$/, '_lod.png'))]);
          listing.current?.set(job.key, [name]);
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
