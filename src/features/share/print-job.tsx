/**
 * A print job you can watch and stop (v0.35.1, owner).
 *
 * Building a print sheet is not instant: every card that has no bitmap is drawn and captured, one at a
 * time, and a phone takes about a second over each one. v0.35 did all of that behind a screen that
 * looked idle, with no way to tell whether it was working or stuck, and pressing Back walked out of
 * the screen while the job carried on in the background.
 *
 * So: a card-by-card count, a bar, a Cancel, and Back asks before it leaves. Cancelling really does
 * stop the job, because the build loop is handed a `cancelled()` it checks between cards.
 */
import { type ReactNode, useCallback, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { ChamferBox } from '@/components/chamfer-box';
import { PopupDialog } from '@/components/popup-dialog';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, Rune } from '@/constants/theme';
import { type PdfCard, shareCardsPdf } from '@/lib/card-pdf';
import { useAndroidBack } from '@/features/dm/use-android-back';
import { DimScreen } from '@/lib/screen-dim';
import { playSfx } from '@/lib/sfx';

export interface PrintJobRequest {
  /** How many CARDS were selected. The sheet may end up longer (a class card prints every page). */
  total: number;
  /** What the file is named after: a character, or the app. */
  subject: string;
  /** Build the pages. Call `step()` as each card is finished, and give up when `cancelled()` is true. */
  build: (step: () => void, cancelled: () => boolean) => Promise<PdfCard[]>;
}

export interface PrintJob {
  run: (req: PrintJobRequest) => void;
  /** True while a job is running, so a caller can refuse to start a second one. */
  busy: boolean;
  node: ReactNode;
}

export function usePrintJob(onNotice?: (text: string) => void): PrintJob {
  const [job, setJob] = useState<{ done: number; total: number; stage: 'cards' | 'sheet' } | null>(null);
  const [asking, setAsking] = useState(false);
  const cancelled = useRef(false);
  const running = useRef(false);

  const stop = useCallback(() => {
    cancelled.current = true;
    setAsking(false);
    setJob(null);
    onNotice?.('Printing cancelled');
  }, [onNotice]);

  // Back does not walk out of a running job. It asks, and answering yes really stops it.
  useAndroidBack(() => {
    if (!job) return false;
    setAsking(true);
    return true;
  });

  const run = useCallback((req: PrintJobRequest) => {
    if (running.current) return;
    running.current = true;
    cancelled.current = false;
    setJob({ done: 0, total: Math.max(1, req.total), stage: 'cards' });
    void (async () => {
      try {
        const cards = await req.build(() => setJob((j) => (j ? { ...j, done: j.done + 1 } : j)), () => cancelled.current);
        if (cancelled.current) return;
        if (!cards.length) { onNotice?.('Nothing to print'); return; }
        setJob((j) => (j ? { ...j, stage: 'sheet' } : j));
        await shareCardsPdf(cards, req.subject);
      } catch {
        if (!cancelled.current) onNotice?.('Those cards could not be printed');
      } finally {
        running.current = false;
        setJob(null);
      }
    })();
  }, [onNotice]);

  const node = job ? (
    <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 10030, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(6,8,13,0.92)' }} />
      <DimScreen opacity={0.92} />
      <ChamferBox chamfer={14} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} style={{ width: 300, maxWidth: '92%', paddingHorizontal: 18, paddingVertical: 18, gap: 12 }}>
        <Text style={{ color: Rune.goldText, fontSize: 17, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {job.stage === 'cards' ? 'Drawing the cards' : 'Building the sheet'}
        </Text>
        <Text style={{ color: Rune.muted, fontSize: 12.5, fontFamily: Body.regular, lineHeight: 18 }}>
          {job.stage === 'cards'
            ? `Card ${Math.min(job.done + 1, job.total)} of ${job.total}. Cards the app draws itself are rendered one at a time.`
            : 'Laying them out and handing the file over.'}
        </Text>
        {/* A real bar, not a spinner: the whole point is knowing how much is left. */}
        <View style={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(20,24,31,0.9)', borderWidth: 1, borderColor: 'rgba(218,162,73,0.35)', overflow: 'hidden' }}>
          <View style={{ width: `${Math.round((job.stage === 'sheet' ? 1 : job.done / job.total) * 100)}%`, height: '100%', backgroundColor: Rune.goldBright }} />
        </View>
        <RuneButton label="Cancel" kind="ghost" height={42} onPress={() => { playSfx('buttonTap'); setAsking(true); }} />
      </ChamferBox>
      {asking ? (
        <PopupDialog
          title="Stop preparing the PDF?"
          body="The cards drawn so far are discarded. Nothing else changes."
          confirmLabel="Stop"
          cancelLabel="Keep going"
          destructive
          onConfirm={stop}
          onCancel={() => setAsking(false)}
        />
      ) : null}
    </View>
  ) : null;

  return { run, busy: !!job, node };
}
