/**
 * NFC tap-to-share UI (v0.10.1, Android/APK only). Two full-screen overlays driving src/lib/nfc:
 * `NfcSendModal` emulates a tag carrying an `.rkp` payload and reports when it's read; `NfcReceiveModal`
 * reads one tag and hands back the parsed content. Rendered only when `nfcModulesPresent()` is true.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, Rune } from '@/constants/theme';
import { playSfx } from '@/lib/sfx';
import {
  cancelNfcReceive,
  type NfcSendHandle,
  nfcPayloadBytes,
  receiveNfc,
  SAFE_NFC_BYTES,
  startNfcSend,
} from '@/lib/nfc';
import type { RkpContent } from '@/lib/rkp';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 9500, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(6,8,13,0.92)' }} />
      <ChamferBox chamfer={16} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} style={{ width: 320, paddingHorizontal: 20, paddingVertical: 22, gap: 14, alignItems: 'center' }}>
        {children}
      </ChamferBox>
    </View>
  );
}

function NfcGlyph({ tint }: { tint: string }) {
  return (
    <Svg width={56} height={56} viewBox="0 0 48 48">
      <Path d="M12 16c8-6 16-6 24 0M14 23c6-4 14-4 20 0M16 30c4-3 12-3 16 0" fill="none" stroke={tint} strokeWidth={2.6} strokeLinecap="round" />
    </Svg>
  );
}

/** Emulate a tag broadcasting `content`; closes shortly after the other phone reads it. */
export function NfcSendModal({ content, label, onClose }: { content: RkpContent; label: string; onClose: () => void }) {
  const [state, setState] = useState<'starting' | 'ready' | 'sent' | 'error'>('starting');
  const [error, setError] = useState<string | null>(null);
  const handle = useRef<NfcSendHandle | null>(null);
  const bytes = nfcPayloadBytes(content);
  const tooBig = bytes > SAFE_NFC_BYTES;

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const h = await startNfcSend(content, () => {
          if (!live) return;
          playSfx('cardEnable');
          setState('sent');
          setTimeout(() => live && onClose(), 1400);
        });
        if (!live) {
          void h.stop();
          return;
        }
        handle.current = h;
        setState('ready');
      } catch (e) {
        if (live) {
          setError(e instanceof Error ? e.message : 'NFC could not start.');
          setState('error');
        }
      }
    })();
    return () => {
      live = false;
      void handle.current?.stop();
    };
  }, [content, onClose]);

  return (
    <Shell>
      <NfcGlyph tint={state === 'sent' ? Rune.goldBright : state === 'error' ? Rune.red : Rune.goldEdge} />
      <Text style={{ color: Rune.goldText, fontSize: 18, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' }}>
        {state === 'sent' ? 'Shared!' : state === 'error' ? 'NFC error' : `Send ${label}`}
      </Text>
      <Text style={{ color: Rune.muted, fontSize: 13, fontFamily: Body.regular, lineHeight: 19, textAlign: 'center' }}>
        {state === 'error'
          ? error
          : state === 'sent'
            ? 'The other device received it.'
            : 'Hold the other phone back-to-back with this one to receive it.'}
      </Text>
      {tooBig && state !== 'error' ? (
        <Text style={{ color: Rune.red, fontSize: 11, fontFamily: Body.bold, textAlign: 'center' }}>This is large ({Math.round(bytes / 1000)}KB) and may not fit over NFC — share the .rkp file if it fails.</Text>
      ) : null}
      <RuneButton label={state === 'sent' ? 'Done' : 'Cancel'} kind={state === 'sent' ? 'primary' : 'ghost'} height={42} style={{ alignSelf: 'stretch' }} onPress={onClose} />
    </Shell>
  );
}

/** Read one tag and hand the parsed content to `onReceived`. */
export function NfcReceiveModal({ onReceived, onClose }: { onReceived: (content: RkpContent) => void; onClose: () => void }) {
  const [state, setState] = useState<'waiting' | 'error'>('waiting');
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    void cancelNfcReceive();
    onClose();
  }, [onClose]);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const content = await receiveNfc();
        if (!live) return;
        playSfx('cardEnable');
        onReceived(content);
      } catch (e) {
        if (live) {
          setError(e instanceof Error ? e.message : 'Could not read that tap.');
          setState('error');
        }
      }
    })();
    return () => {
      live = false;
      void cancelNfcReceive();
    };
  }, [onReceived]);

  return (
    <Shell>
      <NfcGlyph tint={state === 'error' ? Rune.red : Rune.goldEdge} />
      <Text style={{ color: Rune.goldText, fontSize: 18, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' }}>
        {state === 'error' ? 'NFC error' : 'Receive by NFC'}
      </Text>
      <Text style={{ color: Rune.muted, fontSize: 13, fontFamily: Body.regular, lineHeight: 19, textAlign: 'center' }}>
        {state === 'error' ? error : 'Hold this phone back-to-back with the one sharing the card.'}
      </Text>
      <RuneButton label="Cancel" kind="ghost" height={42} style={{ alignSelf: 'stretch' }} onPress={close} />
    </Shell>
  );
}

/** A tap-catcher Pressable so taps behind the modal don't fall through (used by callers if needed). */
export function NfcScrim({ onPress }: { onPress: () => void }) {
  return <Pressable style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 9400 }} onPress={onPress} accessibilityRole="button" accessibilityLabel="Close" />;
}
