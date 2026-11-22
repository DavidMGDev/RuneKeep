import { useIsFocused } from '@react-navigation/native';
import { type Href, Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useWindowDimensions } from 'react-native';

import { LoadingScreen } from '@/components/loading-screen';
import { EncounterScreen } from '@/features/dm/encounter-screen';
import { isDesktopWindow } from '@/hooks/use-desktop';
import type { Encounter as EncounterRecord } from '@/lib/session';
import { getEncounter } from '@/lib/session-store';

/** An encounter: on a desktop window it is its session's DM screen, opened at it (v0.49.0). */
export default function Encounter() {
  const { width, height } = useWindowDimensions();
  const focused = useIsFocused();
  return focused && isDesktopWindow(width, height) ? <AtItsSession /> : <EncounterScreen />;
}

function AtItsSession() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [found, setFound] = useState<EncounterRecord | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void getEncounter(id).then((e) => { if (live) setFound(e); });
    return () => { live = false; };
  }, [id]);
  if (found === undefined) return <LoadingScreen dm label="Setting the scene" />;
  return <Redirect href={(found ? `/session?id=${found.sessionId}&encounter=${found.id}` : '/parties') as Href} />;
}
